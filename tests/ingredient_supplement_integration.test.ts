import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db/sqlite';
import { recipeService } from '../src/services/recipe.service';
import { supplementService } from '../src/services/supplement.service';
import { productService } from '../src/services/product.service';
import { checkoutService } from '../src/services/checkout.service';

describe('Ingredient to Supplement Conversion & Pizza Deduction Integration', () => {
  beforeEach(async () => {
    await db.initialize();
    await supplementService.clearAllSupplements();
  });

  it('converts an ingredient into a selectable supplement with linked portion and automated cost', async () => {
    const uid = Date.now();
    // 1. Create raw material ingredient: Mozzarella (10 kg stock, 1200 DZD/kg)
    const mozzarella = await recipeService.createIngredient({
      name_fr: `Mozzarella Pure ${uid}`,
      name_ar: 'جبن موزاريلا نقي',
      unit: 'kg',
      current_stock: 10.0, // 10 kg
      min_stock_alert: 1.0,
      cost_per_unit: 1200.0 // 1200 DZD per kg
    });

    expect(mozzarella.id).toBeDefined();

    // 2. Convert / link this ingredient to a pizza supplement with portion = 0.050 kg (50g)
    const portionQuantity = 0.050; // 50 grams
    const supplement = await supplementService.addSupplement({
      name_fr: `Supplément Mozzarella ${uid}`,
      name_ar: 'موزاريلا إضافية',
      ingredient_id: mozzarella.id,
      portion_quantity: portionQuantity,
      price: 150, // Selling price 150 DZD
      category: 'cheese'
    });

    // Cost should be automatically calculated: 1200 DZD/kg * 0.050 kg = 60 DZD
    expect(supplement.purchase_cost).toBe(60);
    expect(supplement.ingredient_id).toBe(mozzarella.id);
    expect(supplement.portion_quantity).toBe(0.050);

    // Initial stock in portions should be 10 kg / 0.050 kg = 200 portions
    expect(supplement.current_stock).toBe(200);

    // 3. Verify that querying supplements returns live synchronized stock and unit
    const allSupplements = await supplementService.getSupplements(true);
    const found = allSupplements.find(s => s.id === supplement.id);
    expect(found).toBeDefined();
    expect(found?.current_stock).toBe(200);
    expect(found?.purchase_cost).toBe(60);
    expect(found?.ingredient_unit).toBe('kg');
  });

  it('deducts pizza recipe ingredients AND extra linked supplement from the raw ingredient stock upon checkout', async () => {
    const uid = Date.now() + 1;
    // 1. Raw materials: Dough, Tomato Sauce, Chicken, Mozzarella
    const pate = await recipeService.createIngredient({
      name_fr: `Pâte à pizza ${uid}`,
      unit: 'kg',
      current_stock: 5.0, // 5000g
      min_stock_alert: 0.5,
      cost_per_unit: 100.0
    });

    const sauce = await recipeService.createIngredient({
      name_fr: `Sauce Tomate ${uid}`,
      unit: 'kg',
      current_stock: 2.0, // 2000g
      min_stock_alert: 0.2,
      cost_per_unit: 200.0
    });

    const poulet = await recipeService.createIngredient({
      name_fr: `Poulet mariné ${uid}`,
      unit: 'kg',
      current_stock: 3.0, // 3000g
      min_stock_alert: 0.3,
      cost_per_unit: 800.0
    });

    const mozzarella = await recipeService.createIngredient({
      name_fr: `Mozzarella Gourmet ${uid}`,
      unit: 'kg',
      current_stock: 10.0, // 10,000g
      min_stock_alert: 1.0,
      cost_per_unit: 1200.0 // 1200 DZD / kg
    });

    // 2. Create Pizza Product (Pizza Poulet Gourmet)
    const pizza = await productService.createProduct({
      sku: `PZ-CHICK-${uid}`,
      barcode: `BC-CHICK-${uid}`,
      name_fr: 'Pizza Poulet Gourmet',
      selling_price_ttc: 700,
      purchase_cost: 0,
      category_id: 'cat-pizza'
    });

    // 3. Recipe definition for Pizza:
    // Pâte: 250g (0.250 kg)
    // Sauce: 50g (0.050 kg)
    // Poulet: 100g (0.100 kg)
    // Mozzarella: 150g (0.150 kg)
    await recipeService.saveRecipe(pizza.id, [
      { ingredient_id: pate.id, quantity_required: 0.250, unit_display: 'kg' },
      { ingredient_id: sauce.id, quantity_required: 0.050, unit_display: 'kg' },
      { ingredient_id: poulet.id, quantity_required: 0.100, unit_display: 'kg' },
      { ingredient_id: mozzarella.id, quantity_required: 0.150, unit_display: 'kg' }
    ]);

    // 4. Create Linked Supplement: Extra Mozzarella (Portion: 50g = 0.050 kg, Price: 150 DZD)
    const extraMozzarella = await supplementService.addSupplement({
      name_fr: 'Supplément Mozzarella',
      ingredient_id: mozzarella.id,
      portion_quantity: 0.050,
      price: 150
    });

    // 5. Customer orders 1 Pizza with 1x Extra Mozzarella supplement
    const sale = await checkoutService.processCheckout({
      sessionId: 'sess-supp-test',
      cashierId: 'cashier-1',
      cashierName: 'Chef Cashier',
      items: [
        {
          productId: pizza.id,
          name: pizza.name_fr,
          quantity: 1,
          unitPrice: 700 + 150, // 850 DZD
          discountAmount: 0,
          supplements: [
            {
              id: extraMozzarella.id,
              name_fr: extraMozzarella.name_fr,
              price: 150,
              purchase_cost: extraMozzarella.purchase_cost,
              quantity: 1,
              ingredient_id: mozzarella.id,
              portion_quantity: 0.050
            }
          ]
        }
      ],
      payments: [
        { method: 'CASH', amount: 850, tenderedAmount: 850, changeGiven: 0 }
      ],
      deductRecipeAndSupplements: true
    });

    expect(sale.id).toBeDefined();

    // 6. Verify ingredient deductions:
    // - Pâte: 5.0 - 0.250 = 4.750 kg
    const updatedPate = await recipeService.getIngredientById(pate.id);
    expect(updatedPate?.current_stock).toBeCloseTo(4.750, 4);

    // - Sauce: 2.0 - 0.050 = 1.950 kg
    const updatedSauce = await recipeService.getIngredientById(sauce.id);
    expect(updatedSauce?.current_stock).toBeCloseTo(1.950, 4);

    // - Poulet: 3.0 - 0.100 = 2.900 kg
    const updatedPoulet = await recipeService.getIngredientById(poulet.id);
    expect(updatedPoulet?.current_stock).toBeCloseTo(2.900, 4);

    // - Mozzarella:
    // Recipe requires: 0.150 kg (150g)
    // Extra Supplement requires: 0.050 kg (50g)
    // Total deducted from Mozzarella raw stock: 0.150 + 0.050 = 0.200 kg
    // Remaining stock: 10.0 - 0.200 = 9.800 kg!
    const updatedMozzarella = await recipeService.getIngredientById(mozzarella.id);
    expect(updatedMozzarella?.current_stock).toBeCloseTo(9.800, 4);

    // 7. Verify effective purchase cost calculation (COGS):
    // Recipe base cost:
    //   Pâte: 0.250 * 100 = 25
    //   Sauce: 0.050 * 200 = 10
    //   Poulet: 0.100 * 800 = 80
    //   Mozzarella: 0.150 * 1200 = 180
    //   Base recipe cost = 25 + 10 + 80 + 180 = 295 DZD
    // Supplement portion cost:
    //   0.050 * 1200 = 60 DZD
    // Total expected unit purchase cost = 295 + 60 = 355 DZD
    const saleItems = await db.select<any>('SELECT * FROM sale_items WHERE sale_id = ?', [sale.id]);
    expect(saleItems.length).toBe(1);
    expect(saleItems[0].unit_purchase_price).toBe(355);
  });

  it('correctly handles multi-quantity pizzas and multiple supplement portions', async () => {
    const uid = Date.now() + 2;
    const mozzarella = await recipeService.createIngredient({
      name_fr: `Mozzarella Multi ${uid}`,
      unit: 'kg',
      current_stock: 5.0, // 5 kg
      min_stock_alert: 0.5,
      cost_per_unit: 1000.0
    });

    const pizza = await productService.createProduct({
      sku: `PZ-MULTI-${uid}`,
      name_fr: 'Pizza Multi Test',
      selling_price_ttc: 600,
      purchase_cost: 0,
      category_id: 'cat-pizza'
    });

    // Recipe: 0.100 kg mozzarella per pizza
    await recipeService.saveRecipe(pizza.id, [
      { ingredient_id: mozzarella.id, quantity_required: 0.100, unit_display: 'kg' }
    ]);

    // Supplement: 0.050 kg mozzarella per portion
    const extraMozz = await supplementService.addSupplement({
      name_fr: 'Extra Mozz',
      ingredient_id: mozzarella.id,
      portion_quantity: 0.050,
      price: 100
    });

    // Order 2 pizzas, each with 2x Extra Mozzarella portions (quantity = 2 portions per pizza)
    await checkoutService.processCheckout({
      sessionId: 'sess-multi-test',
      cashierId: 'cashier-1',
      cashierName: 'Cashier',
      items: [
        {
          productId: pizza.id,
          name: pizza.name_fr,
          quantity: 2, // 2 pizzas
          unitPrice: 600 + (100 * 2), // 800 DZD per pizza
          discountAmount: 0,
          supplements: [
            {
              id: extraMozz.id,
              name_fr: extraMozz.name_fr,
              price: 100,
              quantity: 2, // 2x portion per pizza
              ingredient_id: mozzarella.id,
              portion_quantity: 0.050
            }
          ]
        }
      ],
      payments: [
        { method: 'CASH', amount: 1600, tenderedAmount: 1600, changeGiven: 0 }
      ],
      deductRecipeAndSupplements: true
    });

    // Mozzarella deduction:
    // Recipe: 2 pizzas * 0.100 kg = 0.200 kg
    // Supplement: 2 pizzas * 2 portions * 0.050 kg = 0.200 kg
    // Total deducted = 0.400 kg
    // Remaining stock: 5.0 - 0.400 = 4.600 kg
    const updatedMozz = await recipeService.getIngredientById(mozzarella.id);
    expect(updatedMozz?.current_stock).toBeCloseTo(4.600, 4);
  });

  it('restores raw ingredient stock when refunding linked supplements', async () => {
    const uid = Date.now() + 3;
    const champignon = await recipeService.createIngredient({
      name_fr: `Champignons Frais ${uid}`,
      unit: 'kg',
      current_stock: 4.0, // 4 kg
      min_stock_alert: 0.5,
      cost_per_unit: 600.0
    });

    const suppChamp = await supplementService.addSupplement({
      name_fr: 'Extra Champignons',
      ingredient_id: champignon.id,
      portion_quantity: 0.080, // 80g
      price: 120
    });

    // Initial stock: 4.0 kg
    // Deduct 2 portions (2 * 0.080 = 0.160 kg)
    await supplementService.deductSupplementStock([
      { supplementId: suppChamp.id, quantity: 2 }
    ]);

    let ing = await recipeService.getIngredientById(champignon.id);
    expect(ing?.current_stock).toBeCloseTo(3.840, 4);

    // Restore 2 portions
    await supplementService.restoreSupplementStock([
      { supplementId: suppChamp.id, quantity: 2 }
    ]);

    ing = await recipeService.getIngredientById(champignon.id);
    expect(ing?.current_stock).toBeCloseTo(4.000, 4);
  });
});

