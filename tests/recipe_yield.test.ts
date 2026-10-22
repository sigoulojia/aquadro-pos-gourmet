import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db/sqlite';
import { recipeService } from '../src/services/recipe.service';
import { productService } from '../src/services/product.service';

describe('Pizzeria Recipe Management & Production Capacity (Yield)', () => {
  beforeEach(async () => {
    await db.initialize();
  });

  it('creates raw ingredients and tracks their stock levels', async () => {
    const flour = await recipeService.createIngredient({
      name_fr: 'Farine T55',
      name_ar: 'فرينة',
      unit: 'kg',
      current_stock: 25.0,
      min_stock_alert: 5.0,
      cost_per_unit: 80.0
    });

    const mozzarella = await recipeService.createIngredient({
      name_fr: 'Fromage Mozzarella',
      name_ar: 'جبن موزاريلا',
      unit: 'kg',
      current_stock: 6.0,
      min_stock_alert: 2.0,
      cost_per_unit: 1000.0
    });

    expect(flour.id).toBeDefined();
    expect(flour.current_stock).toBe(25.0);
    expect(mozzarella.current_stock).toBe(6.0);

    const allIngs = await recipeService.getIngredients();
    expect(allIngs.length).toBeGreaterThanOrEqual(2);
  });

  it('calculates exact pizza yield and detects the limiting bottleneck ingredient', async () => {
    // 1. Create Pizza Product
    const pizza = await productService.createProduct({
      sku: 'PZ-MARGHERITA-001',
      barcode: '990001',
      name_fr: 'Pizza Margherita',
      name_ar: 'بيتزا مارغريتا',
      selling_price_ttc: 600.0,
      purchase_cost: 0,
      category_id: 'cat-pizza'
    });

    // 2. Create Ingredients
    const flour = await recipeService.createIngredient({
      name_fr: 'Farine Spéciale Pizza',
      unit: 'kg',
      current_stock: 10.0, // 10 kg / 0.25 kg = 40 pizzas
      min_stock_alert: 2.0,
      cost_per_unit: 100.0 // 25 DA per pizza
    });

    const cheese = await recipeService.createIngredient({
      name_fr: 'Mozzarella di Bufala',
      unit: 'kg',
      current_stock: 2.4, // 2.4 kg / 0.12 kg = 20 pizzas (BOTTLENECK!)
      min_stock_alert: 1.0,
      cost_per_unit: 1200.0 // 144 DA per pizza
    });

    const sauce = await recipeService.createIngredient({
      name_fr: 'Sauce Tomate Pelée',
      unit: 'kg',
      current_stock: 8.0, // 8.0 kg / 0.08 kg = 100 pizzas
      min_stock_alert: 1.0,
      cost_per_unit: 200.0 // 16 DA per pizza
    });

    // 3. Save Recipe
    await recipeService.saveRecipe(pizza.id, [
      { ingredient_id: flour.id, quantity_required: 0.25 },
      { ingredient_id: cheese.id, quantity_required: 0.12 },
      { ingredient_id: sauce.id, quantity_required: 0.08 }
    ]);

    // 4. Calculate Yield
    const yieldResult = await recipeService.calculateProductYield(pizza);

    expect(yieldResult.hasRecipe).toBe(true);
    // 2.4 / 0.12 = 20 pizzas (cheese is limiting)
    expect(yieldResult.maxPortions).toBe(20);
    expect(yieldResult.limitingIngredient?.name).toBe('Mozzarella di Bufala');
    expect(yieldResult.limitingIngredient?.currentStock).toBe(2.4);

    // Food cost = (0.25 * 100) + (0.12 * 1200) + (0.08 * 200) = 25 + 144 + 16 = 185 DA
    expect(yieldResult.foodCost).toBe(185);
    // Gross margin = 600 - 185 = 415 DA
    expect(yieldResult.grossMargin).toBe(415);
  });

  it('adjusts ingredient stock accurately with quick restock and deductions', async () => {
    const yeast = await recipeService.createIngredient({
      name_fr: 'Levure Boulangère',
      unit: 'kg',
      current_stock: 2.0,
      min_stock_alert: 0.5,
      cost_per_unit: 300.0
    });

    // Quick restock +5 kg
    const newStock = await recipeService.adjustStock(yeast.id, 5.0, 'Réapprovisionnement +5 kg');
    expect(newStock).toBe(7.0);

    const updated = await recipeService.getIngredientById(yeast.id);
    expect(updated?.current_stock).toBe(7.0);

    // Deduct loss -1 kg
    const deductedStock = await recipeService.adjustStock(yeast.id, -1.0, 'Perte');
    expect(deductedStock).toBe(6.0);
  });
});
