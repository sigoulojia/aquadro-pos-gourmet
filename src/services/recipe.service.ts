// Pizzeria POS Algérie — Service Fiches Techniques, Ingrédients & Capacité de Production
// Calcul en temps réel du nombre de pizzas réalisables (Yield) et facteur limitant

import { db } from '../db/sqlite';
import { Ingredient, RecipeItem, RecipeItemDetail, ProductYield, Product } from '../types/database';
import { productService } from './product.service';
import { storeNeedsService } from './storeNeeds.service';

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

export interface MissingIngredientDetail {
  ingredient_id: string;
  name_fr: string;
  name_ar?: string;
  unit: string;
  current_stock: number;
  quantity_required: number;
  deficit: number;
}

export interface ProductIngredientStatus {
  productId: string;
  productName: string;
  productNameAr?: string;
  hasRecipe: boolean;
  isAvailable: boolean;
  maxPortions: number;
  recipeItems: RecipeItemDetail[];
  missingIngredients: MissingIngredientDetail[];
  limitingIngredient?: RecipeItemDetail;
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

  public async recordPurchase(
    id: string,
    quantityPurchased: number,
    unitCost: number,
    supplierName?: string
  ): Promise<Ingredient> {
    if (quantityPurchased <= 0) throw new Error('La quantité achetée doit être supérieure à zéro');
    const existing = await this.getIngredientById(id);
    if (!existing) throw new Error('Ingrédient introuvable');

    const newStock = existing.current_stock + quantityPurchased;
    const finalCost = unitCost > 0 ? unitCost : existing.cost_per_unit;
    const now = new Date().toISOString();

    await db.execute(
      'UPDATE ingredients SET current_stock = ?, cost_per_unit = ?, updated_at = ? WHERE id = ?',
      [newStock, finalCost, now, id]
    );

    try {
      await db.execute(
        `INSERT INTO inventory_movements (
          id, product_id, movement_type, quantity_change, previous_stock, new_stock, reason, unit_cost_snapshot, user_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          `mov-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          id,
          'PURCHASE',
          quantityPurchased,
          existing.current_stock,
          newStock,
          `Achat Ingrédient${supplierName ? ' - ' + supplierName : ''}`,
          finalCost,
          'user-001',
          now
        ]
      );
    } catch {
      // Ignorer si contrainte de clé étrangère products
    }

    return {
      ...existing,
      current_stock: newStock,
      cost_per_unit: finalCost,
      updated_at: now
    };
  }

  public async deleteIngredient(id: string): Promise<void> {
    // Supprimer également les liaisons de recettes
    await db.execute('DELETE FROM recipe_items WHERE ingredient_id = ?', [id]);
    await db.execute('UPDATE ingredients SET is_active = 0 WHERE id = ?', [id]);
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
        // Formule stricte : si le stock <= 0 ou quantité requise <= 0 -> STRICTEMENT 0 portions ! Jamais 999999 !
        const portionsPossible = (item.quantity_required > 0 && ing.current_stock > 0)
          ? Math.floor(ing.current_stock / item.quantity_required)
          : 0;
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
    for (let idx = 0; idx < entries.length; idx++) {
      const entry = entries[idx];
      const rawQty = entry.quantity_required as any;
      const parsedQty = typeof rawQty === 'string'
        ? parseFloat(rawQty.replace(',', '.'))
        : Number(rawQty);

      if (isNaN(parsedQty) || parsedQty <= 0) continue;

      const itemId = `rcp-${Date.now().toString(36)}-${idx}-${Math.random().toString(36).substring(2, 7)}`;
      await db.execute(
        `INSERT INTO recipe_items (id, product_id, ingredient_id, quantity_required, unit_display, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          itemId,
          productId,
          entry.ingredient_id,
          parsedQty,
          entry.unit_display || `${parsedQty}`,
          now
        ]
      );
    }
  }

  public async applyDefaultPizzaRecipe(productId: string): Promise<RecipeItemDetail[]> {
    const ingredients = await this.getIngredients();
    if (ingredients.length === 0) return [];

    const flour = ingredients.find(i =>
      i.name_fr.toLowerCase().includes('farin') || (i.name_ar && i.name_ar.includes('فرين'))
    );
    const sauce = ingredients.find(i =>
      i.name_fr.toLowerCase().includes('sauc') || i.name_fr.toLowerCase().includes('tomat') || (i.name_ar && i.name_ar.includes('طماطم'))
    );
    const cheese = ingredients.find(i =>
      i.name_fr.toLowerCase().includes('mozz') || i.name_fr.toLowerCase().includes('fromag') || (i.name_ar && i.name_ar.includes('جبن'))
    );

    const entries: RecipeEntryInput[] = [];
    if (flour) {
      entries.push({
        ingredient_id: flour.id,
        quantity_required: flour.unit.toLowerCase() === 'g' ? 250 : 0.25,
        unit_display: flour.unit.toLowerCase() === 'g' ? '250 g' : '0.25 kg'
      });
    }
    if (sauce) {
      entries.push({
        ingredient_id: sauce.id,
        quantity_required: sauce.unit.toLowerCase() === 'g' || sauce.unit.toLowerCase() === 'ml' ? 100 : 0.1,
        unit_display: sauce.unit.toLowerCase() === 'g' ? '100 g' : sauce.unit.toLowerCase() === 'ml' ? '100 ml' : '0.1 kg'
      });
    }
    if (cheese) {
      entries.push({
        ingredient_id: cheese.id,
        quantity_required: cheese.unit.toLowerCase() === 'g' ? 120 : (cheese.unit.toLowerCase() === 'pièce' ? 1 : 0.12),
        unit_display: cheese.unit.toLowerCase() === 'g' ? '120 g' : cheese.unit.toLowerCase() === 'pièce' ? '1 pc' : '0.12 kg'
      });
    }

    // Si aucun ingrédient classique n'a été trouvé par nom, lier les 3 premiers ingrédients disponibles
    if (entries.length === 0) {
      for (const ing of ingredients.slice(0, 3)) {
        const qty = ing.unit.toLowerCase() === 'kg' ? 0.2 : (ing.unit.toLowerCase() === 'g' ? 150 : 1);
        entries.push({
          ingredient_id: ing.id,
          quantity_required: qty,
          unit_display: `${qty} ${ing.unit}`
        });
      }
    }

    if (entries.length > 0) {
      await this.saveRecipe(productId, entries);
    }

    return await this.getRecipeForProduct(productId);
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

    // Si n'importe quel ingrédient a 0 portion, ou minPortions est négatif/infini, maxPortions = 0 !
    const maxPortions = (minPortions === Infinity || minPortions <= 0) ? 0 : minPortions;
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

  // Initialisation rapide des ingrédients standards de pizzeria
  public async seedDefaultPizzeriaIngredients(): Promise<void> {
    const defaults: Array<CreateIngredientInput> = [
      { name_fr: "Farine Spéciale Pizza", name_ar: "فرينة خاصة بالبيتزا", unit: "kg", current_stock: 25, min_stock_alert: 5, cost_per_unit: 80 },
      { name_fr: "Sauce Tomate Cuisinée", name_ar: "صلصة طماطم متبلة", unit: "kg", current_stock: 10, min_stock_alert: 2, cost_per_unit: 250 },
      { name_fr: "Fromage Mozzarella", name_ar: "جبن موزاريلا", unit: "kg", current_stock: 8, min_stock_alert: 2, cost_per_unit: 1400 },
      { name_fr: "Viande Hachée", name_ar: "لحم مفروم", unit: "kg", current_stock: 5, min_stock_alert: 1, cost_per_unit: 2200 },
      { name_fr: "Thon à l huile", name_ar: "طون بالزيت", unit: "kg", current_stock: 4, min_stock_alert: 1, cost_per_unit: 1600 },
      { name_fr: "Champignons Frais", name_ar: "فطر طازج", unit: "kg", current_stock: 3, min_stock_alert: 1, cost_per_unit: 900 },
      { name_fr: "Olives Noires", name_ar: "زيتون أسود", unit: "kg", current_stock: 3, min_stock_alert: 1, cost_per_unit: 600 },
      { name_fr: "Poulet Mariné", name_ar: "دجاج متبل", unit: "kg", current_stock: 5, min_stock_alert: 1, cost_per_unit: 950 }
    ];

    const currentList = await this.getIngredients();
    const existingNames = new Set(currentList.map(i => i.name_fr.toLowerCase().trim()));

    for (const item of defaults) {
      if (!existingNames.has(item.name_fr.toLowerCase().trim())) {
        await this.createIngredient(item);
      }
    }
  }

  // Déduire les ingrédients lors de la validation d'une commande
  public async deductRecipeIngredientsForSale(productId: string, quantitySold: number): Promise<void> {
    if (!productId || quantitySold <= 0) return;
    const recipeItems = await db.select<RecipeItem>(
      'SELECT * FROM recipe_items WHERE product_id = ?',
      [productId]
    );

    for (const item of recipeItems) {
      const totalNeeded = item.quantity_required * quantitySold;
      if (totalNeeded > 0) {
        await this.adjustStock(item.ingredient_id, -totalNeeded, `Vente x${quantitySold} (${productId})`);
      }
    }
  }

  // Réintégrer les ingrédients en stock lors d'un remboursement / annulation
  public async restoreRecipeIngredientsForRefund(productId: string, quantityRefunded: number): Promise<void> {
    if (!productId || quantityRefunded <= 0) return;
    const recipeItems = await db.select<RecipeItem>(
      'SELECT * FROM recipe_items WHERE product_id = ?',
      [productId]
    );

    for (const item of recipeItems) {
      const totalToRestore = item.quantity_required * quantityRefunded;
      if (totalToRestore > 0) {
        await this.adjustStock(item.ingredient_id, totalToRestore, `Remboursement / Retour x${quantityRefunded} (${productId})`);
      }
    }
  }

  // Vérifier la conformité des stocks d'ingrédients pour un produit
  public async checkProductIngredientStatus(product: Product): Promise<ProductIngredientStatus> {
    const recipeDetails = await this.getRecipeForProduct(product.id);
    const productName = product.name_fr || (product as any).name || 'Pizza';
    const productNameAr = product.name_ar;

    if (recipeDetails.length === 0) {
      return {
        productId: product.id,
        productName,
        productNameAr,
        hasRecipe: false,
        isAvailable: true,
        maxPortions: 999,
        recipeItems: [],
        missingIngredients: []
      };
    }

    const missingIngredients: MissingIngredientDetail[] = [];
    let minPortions = Infinity;
    let limitingItem: RecipeItemDetail | undefined = undefined;

    for (const item of recipeDetails) {
      if (item.portions_possible < minPortions) {
        minPortions = item.portions_possible;
        limitingItem = item;
      }
      if (item.ingredient_current_stock < item.quantity_required || item.portions_possible === 0) {
        missingIngredients.push({
          ingredient_id: item.ingredient_id,
          name_fr: item.ingredient_name_fr,
          name_ar: item.ingredient_name_ar,
          unit: item.ingredient_unit,
          current_stock: item.ingredient_current_stock,
          quantity_required: item.quantity_required,
          deficit: Math.max(0, item.quantity_required - item.ingredient_current_stock)
        });
      }
    }

    const maxPortions = (minPortions === Infinity || minPortions <= 0) ? 0 : minPortions;
    const isAvailable = missingIngredients.length === 0 && maxPortions > 0;

    return {
      productId: product.id,
      productName,
      productNameAr,
      hasRecipe: true,
      isAvailable,
      maxPortions,
      recipeItems: recipeDetails,
      missingIngredients,
      limitingIngredient: limitingItem
    };
  }

  // Récupérer le statut de tous les produits d'un coup
  public async getAllProductsIngredientStatus(): Promise<Record<string, ProductIngredientStatus>> {
    const products = await productService.getProducts(true);
    const map: Record<string, ProductIngredientStatus> = {};
    for (const p of products) {
      map[p.id] = await this.checkProductIngredientStatus(p);
    }
    return map;
  }

  // Émettre un besoin magasin (Store Need) pour un ingrédient manquant en 1 clic
  public async requestIngredientRestock(params: {
    ingredientId: string;
    productName: string;
    requestedBy: string;
    suggestedQty?: string;
  }): Promise<void> {
    const ing = await this.getIngredientById(params.ingredientId);
    if (!ing) throw new Error('Ingrédient introuvable');

    const defaultQuantity = params.suggestedQty || `5 ${ing.unit}`;
    await storeNeedsService.addNeed({
      item_name: `${ing.name_fr}${ing.name_ar ? ` (${ing.name_ar})` : ''}`,
      quantity_needed: defaultQuantity,
      urgency: 'URGENT',
      notes: `طلب اقتناء عاجل لتوفير بيتزا: ${params.productName} (المخزون الحالي: ${ing.current_stock} ${ing.unit})`,
      requested_by: params.requestedBy || 'Responsable Cuisine'
    });
  }

  // Réapprovisionner rapidement un ingrédient et rendre la pizza disponible
  public async quickRestockIngredient(ingredientId: string, amount: number, reason?: string): Promise<number> {
    return await this.adjustStock(ingredientId, amount, reason || `Réapprovisionnement rapide (+${amount})`);
  }
}

export const recipeService = RecipeService.getInstance();
