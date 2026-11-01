import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db/sqlite';
import { recipeService } from '../src/services/recipe.service';
import { productService } from '../src/services/product.service';
import { checkoutService } from '../src/services/checkout.service';

describe('Multi-Part Pizza (Moitié-Moitié) Ingredient Stock Deduction', () => {
  beforeEach(async () => {
    await db.initialize();
  });

  it('deducts exactly 50% of ingredients from Part 1 and 50% from Part 2 for a half-and-half pizza', async () => {
    // 1. Create unique test ingredients
    const uid = Date.now();
    const sauceTomate = await recipeService.createIngredient({
      name_fr: `Sauce Tomate Test ${uid}`,
      unit: 'kg',
      current_stock: 10.0,
      min_stock_alert: 1.0,
      cost_per_unit: 200.0
    });

    const gorgonzola = await recipeService.createIngredient({
      name_fr: `Fromage Gorgonzola Test ${uid}`,
      unit: 'kg',
      current_stock: 10.0,
      min_stock_alert: 1.0,
      cost_per_unit: 1500.0
    });

    const mozzarella = await recipeService.createIngredient({
      name_fr: `Mozzarella Test ${uid}`,
      unit: 'kg',
      current_stock: 10.0,
      min_stock_alert: 1.0,
      cost_per_unit: 800.0
    });

    // 2. Create Pizza 1 (Margherita) and Pizza 2 (4 Fromages)
    const pizza1 = await productService.createProduct({
      sku: `PZ-MARG-${uid}`,
      barcode: `BC-MARG-${uid}`,
      name_fr: 'Pizza Margherita Test',
      name_ar: 'بيتزا مارغريتا تجريبية',
      selling_price_ttc: 600,
      purchase_cost: 0,
      category_id: 'cat-pizza'
    });

    const pizza2 = await productService.createProduct({
      sku: `PZ-FROM-${uid}`,
      barcode: `BC-FROM-${uid}`,
      name_fr: 'Pizza 4 Fromages Test',
      name_ar: 'بيتزا أربعة أجبان تجريبية',
      selling_price_ttc: 900,
      purchase_cost: 0,
      category_id: 'cat-pizza'
    });

    // 3. Define technical recipes:
    // Margherita: 0.100 kg sauce tomate + 0.200 kg mozzarella
    await recipeService.saveRecipe(pizza1.id, [
      { ingredient_id: sauceTomate.id, quantity_required: 0.100, unit_display: 'kg' },
      { ingredient_id: mozzarella.id, quantity_required: 0.200, unit_display: 'kg' }
    ]);

    // 4 Fromages: 0.150 kg mozzarella + 0.100 kg gorgonzola
    await recipeService.saveRecipe(pizza2.id, [
      { ingredient_id: mozzarella.id, quantity_required: 0.150, unit_display: 'kg' },
      { ingredient_id: gorgonzola.id, quantity_required: 0.100, unit_display: 'kg' }
    ]);

    // 4. Perform checkout of 1 Pizza Moitié-Moitié (Half Margherita + Half 4 Fromages)
    // Note: productId in POS is selectedP1.id, and multiParts contains the 2 selected parts
    await checkoutService.processCheckout({
      sessionId: 'sess-test',
      cashierId: 'cashier-1',
      cashierName: 'Test Cashier',
      items: [
        {
          productId: pizza1.id,
          name: 'Pizza Moitié-Moitié',
          quantity: 1,
          unitPrice: 900,
          discountAmount: 0,
          multiParts: [
            { id: pizza1.id, name: pizza1.name_fr, price: 600 },
            { id: pizza2.id, name: pizza2.name_fr, price: 900 }
          ]
        }
      ],
      payments: [
        { method: 'CASH', amount: 900, tenderedAmount: 900, changeGiven: 0 }
      ],
      deductRecipeAndSupplements: true
    });

    // 5. Verify deductions:
    // Sauce Tomate (only in Margherita): 0.100 * 0.5 = 0.050 kg deducted -> 10.0 - 0.050 = 9.950 kg
    const updatedSauce = await recipeService.getIngredientById(sauceTomate.id);
    expect(updatedSauce?.current_stock).toBeCloseTo(9.950, 3);

    // Gorgonzola (only in 4 Fromages): 0.100 * 0.5 = 0.050 kg deducted -> 10.0 - 0.050 = 9.950 kg
    const updatedGorgonzola = await recipeService.getIngredientById(gorgonzola.id);
    expect(updatedGorgonzola?.current_stock).toBeCloseTo(9.950, 3);

    // Mozzarella (in both): (0.200 * 0.5) + (0.150 * 0.5) = 0.100 + 0.075 = 0.175 kg deducted -> 10.0 - 0.175 = 9.825 kg
    const updatedMozza = await recipeService.getIngredientById(mozzarella.id);
    expect(updatedMozza?.current_stock).toBeCloseTo(9.825, 3);
  });

  it('deducts proportionally when quantity is greater than 1 (e.g. 2 half-and-half pizzas)', async () => {
    const uid = Date.now() + 1;
    const sauce = await recipeService.createIngredient({
      name_fr: `Sauce Qty2 ${uid}`,
      unit: 'kg',
      current_stock: 5.0,
      min_stock_alert: 1.0,
      cost_per_unit: 100.0
    });

    const fromage = await recipeService.createIngredient({
      name_fr: `Fromage Qty2 ${uid}`,
      unit: 'kg',
      current_stock: 5.0,
      min_stock_alert: 1.0,
      cost_per_unit: 500.0
    });

    const p1 = await productService.createProduct({
      sku: `PZ-Q1-${uid}`,
      name_fr: 'Pizza Part 1',
      selling_price_ttc: 700,
      purchase_cost: 0,
      category_id: 'cat-pizza'
    });

    const p2 = await productService.createProduct({
      sku: `PZ-Q2-${uid}`,
      name_fr: 'Pizza Part 2',
      selling_price_ttc: 800,
      purchase_cost: 0,
      category_id: 'cat-pizza'
    });

    await recipeService.saveRecipe(p1.id, [
      { ingredient_id: sauce.id, quantity_required: 0.100, unit_display: 'kg' }
    ]);
    await recipeService.saveRecipe(p2.id, [
      { ingredient_id: fromage.id, quantity_required: 0.200, unit_display: 'kg' }
    ]);

    // Sell 2x half-and-half pizzas:
    // Part 1 sauce needed: 2 * (0.100 * 0.5) = 0.100 kg
    // Part 2 cheese needed: 2 * (0.200 * 0.5) = 0.200 kg
    await checkoutService.processCheckout({
      sessionId: 'sess-test',
      cashierId: 'cashier-1',
      cashierName: 'Test Cashier',
      items: [
        {
          productId: p1.id,
          name: 'Pizza Moitié-Moitié x2',
          quantity: 2,
          unitPrice: 800,
          discountAmount: 0,
          multiParts: [
            { id: p1.id, name: p1.name_fr, price: 700 },
            { id: p2.id, name: p2.name_fr, price: 800 }
          ]
        }
      ],
      payments: [
        { method: 'CASH', amount: 1600, tenderedAmount: 1600, changeGiven: 0 }
      ],
      deductRecipeAndSupplements: true
    });

    const uSauce = await recipeService.getIngredientById(sauce.id);
    expect(uSauce?.current_stock).toBeCloseTo(4.900, 3);

    const uFromage = await recipeService.getIngredientById(fromage.id);
    expect(uFromage?.current_stock).toBeCloseTo(4.800, 3);
  });
});

