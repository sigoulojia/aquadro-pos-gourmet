// Pizzeria POS Algérie — Service Fiches Techniques, Ingrédients & Capacité de Production
// Calcul en temps réel du nombre de pizzas réalisables (Yield) et facteur limitant

import { db } from '../db/sqlite';
import { Ingredient, RecipeItem, RecipeItemDetail, ProductYield, Product } from '../types/database';
import { productService } from './product.service';

export interface CreateIngredientInput {
  name_fr: string;
  name_ar?: string;
  unit: 'kg' | 'g' | 'L' | 'ml' | 'pièce';
  current_stock: number;
  min_stock_alert: number;
  cost_per_unit: number; // en DZD par unité
}

export interface RecipeEntryInput {
  ingredient_id: string;
  quantity_required: number; // dans l'unité de base de l'ingrédient
  unit_display?: string;
}

export class RecipeService {
  private static instance: RecipeService;

  private constructor() {}

  public static getInstance(): RecipeService {
    if (!RecipeService.instance) {
      RecipeService.instance = new RecipeService();
    }
    return RecipeService.instance;
  }

  // --- Gestion des Ingrédients & Matières Premières ---

  public async getIngredients(): Promise<Ingredient[]> {
    return await db.select<Ingredient>(
      'SELECT * FROM ingredients WHERE is_active = 1 ORDER BY name_fr ASC'
    );
  }

  public async getIngredientById(id: string): Promise<Ingredient | null> {
    const list = await db.select<Ingredient>('SELECT * FROM ingredients WHERE id = ?', [id]);
    return list[0] || null;
  }

  public async createIngredient(input: CreateIngredientInput): Promise<Ingredient> {
    const id = `ing-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    await db.execute(
      `INSERT INTO ingredients (id, name_fr, name_ar, unit, current_stock, min_stock_alert, cost_per_unit, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.name_fr.trim(),
        input.name_ar?.trim() || null,
        input.unit,
        Number(input.current_stock) || 0,
        Number(input.min_stock_alert) || 5,
        Number(input.cost_per_unit) || 0,
        1,
        now,
        now
      ]
    );

    return (await this.getIngredientById(id))!;
  }

  public async updateIngredient(id: string, input: Partial<CreateIngredientInput>): Promise<void> {
    const now = new Date().toISOString();
    const existing = await this.getIngredientById(id);
    if (!existing) throw new Error('Ingrédient introuvable');

    const name_fr = input.name_fr !== undefined ? input.name_fr.trim() : existing.name_fr;
    const name_ar = input.name_ar !== undefined ? input.name_ar.trim() : existing.name_ar;
    const unit = input.unit !== undefined ? input.unit : existing.unit;
    const current_stock = input.current_stock !== undefined ? Number(input.current_stock) : existing.current_stock;
    const min_stock_alert = input.min_stock_alert !== undefined ? Number(input.min_stock_alert) : existing.min_stock_alert;
    const cost_per_unit = input.cost_per_unit !== undefined ? Number(input.cost_per_unit) : existing.cost_per_unit;

    await db.execute(
      `UPDATE ingredients SET name_fr = ?, name_ar = ?, unit = ?, current_stock = ?, min_stock_alert = ?, cost_per_unit = ?, updated_at = ? WHERE id = ?`,
      [name_fr, name_ar, unit, current_stock, min_stock_alert, cost_per_unit, now, id]
    );
  }

  public async adjustStock(id: string, quantityDelta: number, reason: string): Promise<number> {
    const existing = await this.getIngredientById(id);
    if (!existing) throw new Error('Ingrédient introuvable');

    const newStock = Math.max(0, existing.current_stock + quantityDelta);
    const now = new Date().toISOString();

    await db.execute(
      'UPDATE ingredients SET current_stock = ?, updated_at = ? WHERE id = ?',
      [newStock, now, id]
    );

    return newStock;
  }

  public async deleteIngredient(id: string): Promise<void> {
    // Supprimer également les liaisons de recettes
    await db.execute('DELETE FROM recipe_items WHERE ingredient_id = ?', [id]);
    await db.execute('DELETE FROM ingredients WHERE id = ?', [id]);
  }

  // --- Fiches Techniques & Recettes ---

  public async getRecipeForProduct(productId: string): Promise<RecipeItemDetail[]> {
    const recipeItems = await db.select<RecipeItem>(
      'SELECT * FROM recipe_items WHERE product_id = ?',
      [productId]
    );

    if (recipeItems.length === 0) return [];

    const allIngredients = await this.getIngredients();
    const ingMap = new Map(allIngredients.map(ing => [ing.id, ing]));

    const details: RecipeItemDetail[] = [];
    for (const item of recipeItems) {
      const ing = ingMap.get(item.ingredient_id);
      if (ing) {
        const portionsPossible = item.quantity_required > 0
          ? Math.floor(ing.current_stock / item.quantity_required)
          : 999999;
        const costForPortion = item.quantity_required * ing.cost_per_unit;

        details.push({
          ...item,
          ingredient_name_fr: ing.name_fr,
          ingredient_name_ar: ing.name_ar,
          ingredient_unit: ing.unit,
          ingredient_current_stock: ing.current_stock,
          ingredient_cost_per_unit: ing.cost_per_unit,
          portions_possible: portionsPossible,
          cost_for_portion: costForPortion
        });
      }
    }

    return details;
  }

  public async saveRecipe(productId: string, entries: RecipeEntryInput[]): Promise<void> {
    // 1. Supprimer l'ancienne fiche technique
    await db.execute('DELETE FROM recipe_items WHERE product_id = ?', [productId]);

    // 2. Insérer les nouveaux ingrédients
    const now = new Date().toISOString();
    for (const entry of entries) {
      if (entry.quantity_required <= 0) continue;
      const itemId = `rcp-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
      await db.execute(
        `INSERT INTO recipe_items (id, product_id, ingredient_id, quantity_required, unit_display, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          itemId,
          productId,
          entry.ingredient_id,
          Number(entry.quantity_required),
          entry.unit_display || null,
          now
        ]
      );
    }
  }

  // --- Capacité de Production (Rendement & Facteur Limitant) ---

  public async calculateProductYield(product: Product, preloadedIngredients?: Ingredient[]): Promise<ProductYield> {
    const recipeDetails = await this.getRecipeForProduct(product.id);
    const sellingPrice = product.selling_price_ttc || (product as any).selling_price || 0;

    if (recipeDetails.length === 0) {
      return {
        productId: product.id,
        productName: product.name_fr || (product as any).name || 'Pizza',
        productBarcode: product.barcode,
        sellingPrice,
        categoryName: product.category_name,
        hasRecipe: false,
        recipeItems: [],
        maxPortions: 0,
        foodCost: 0,
        grossMargin: sellingPrice,
        grossMarginPercent: 100
      };
    }

    // Calcul du goulot d'étranglement (minimum des portions réalisables)
    let minPortions = Infinity;
    let limitingItem: RecipeItemDetail | null = null;
    let totalFoodCost = 0;

    for (const item of recipeDetails) {
      totalFoodCost += item.cost_for_portion;
      if (item.portions_possible < minPortions) {
        minPortions = item.portions_possible;
        limitingItem = item;
      }
    }

    const maxPortions = minPortions === Infinity ? 0 : Math.max(0, minPortions);
    const grossMargin = sellingPrice - totalFoodCost;
    const grossMarginPercent = sellingPrice > 0 ? (grossMargin / sellingPrice) * 100 : 0;

    return {
      productId: product.id,
      productName: product.name_fr || (product as any).name || 'Pizza',
      productBarcode: product.barcode,
      sellingPrice,
      categoryName: product.category_name,
      hasRecipe: true,
      recipeItems: recipeDetails,
      maxPortions,
      limitingIngredient: limitingItem ? {
        id: limitingItem.ingredient_id,
        name: limitingItem.ingredient_name_fr,
        currentStock: limitingItem.ingredient_current_stock,
        unit: limitingItem.ingredient_unit,
        quantityRequired: limitingItem.quantity_required
      } : undefined,
      foodCost: Math.round(totalFoodCost * 100) / 100,
      grossMargin: Math.round(grossMargin * 100) / 100,
      grossMarginPercent: Math.round(grossMarginPercent * 10) / 10
    };
  }

  public async calculateAllYields(): Promise<ProductYield[]> {
    const products = await productService.getProducts();
    const yields: ProductYield[] = [];

    for (const p of products) {
      const y = await this.calculateProductYield(p);
      yields.push(y);
    }

    return yields;
  }

  // Déduire les ingrédients lors de la validation d'une commande
  public async deductRecipeIngredientsForSale(productId: string, quantitySold: number): Promise<void> {
    const recipeItems = await db.select<RecipeItem>(
      'SELECT * FROM recipe_items WHERE product_id = ?',
      [productId]
    );

    for (const item of recipeItems) {
      const totalNeeded = item.quantity_required * quantitySold;
      await this.adjustStock(item.ingredient_id, -totalNeeded, `Vente x${quantitySold} (${productId})`);
    }
  }
}

export const recipeService = RecipeService.getInstance();
