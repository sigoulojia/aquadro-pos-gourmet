// Aquadro POS Algérie — Service de Gestion des Suppléments Pizzeria (Supplements & Extras)
// Intégré au stock & coût d'achat : Prix d'achat initial (Coût), prix de vente, quantité en stock et alertes.

import { db } from '../db/sqlite';

export interface PizzaSupplement {
  id: string;
  name_fr: string;
  name_ar?: string;
  name?: string;
  purchase_cost: number; // سعر الشراء أو التكلفة الأولية بالدينار الجزائري
  price: number;         // سعر البيع للزبون بالدينار الجزائري
  current_stock: number; // الكمية المتوفرة في المخزن (Portions / Unités)
  min_stock_alert: number; // حد التنبيه عند اقتراب النفاد
  category?: 'cheese' | 'meat' | 'veg' | 'sauce' | 'extra';
  is_active: number; // 1 or 0
  created_at?: string;
  quantity?: number; // عدد الحصص المطلوبة (مثلاً 2x أو 3x لنفس الإضافة)
}

// Identifiants des anciens suppléments démo par défaut à nettoyer
export const LEGACY_DEFAULT_SUPPLEMENT_IDS = [
  'sup-fromage',
  'sup-champignon',
  'sup-thon',
  'sup-viande',
  'sup-poulet',
  'sup-sauce-fromage',
  'sup-sauce-piquante',
  'sup-olives',
  'sup-oeuf',
  'sup-anchois'
];

// Base propre en production : aucun faux supplément imposé par défaut
const DEFAULT_SUPPLEMENTS: PizzaSupplement[] = [];

export class SupplementService {
  private static instance: SupplementService;
  private supplementsCache: PizzaSupplement[] | null = null;
  private tableInitialized = false;

  private constructor() {}

  public static getInstance(): SupplementService {
    if (!SupplementService.instance) {
      SupplementService.instance = new SupplementService();
    }
    return SupplementService.instance;
  }

  // Garantir la création de la table SQLite et de ses colonnes
  private async ensureTable(): Promise<void> {
    if (this.tableInitialized) return;
    try {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS pizza_supplements (
          id TEXT PRIMARY KEY,
          name_fr TEXT NOT NULL,
          name_ar TEXT,
          purchase_cost INTEGER NOT NULL DEFAULT 0,
          price INTEGER NOT NULL DEFAULT 0,
          current_stock REAL NOT NULL DEFAULT 50.0,
          min_stock_alert REAL NOT NULL DEFAULT 5.0,
          category TEXT,
          is_active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL
        )
      `);
      // Assurer que les colonnes existent même si la table a été créée avec l'ancien schéma
      for (const colDef of [
        'ALTER TABLE pizza_supplements ADD COLUMN purchase_cost INTEGER NOT NULL DEFAULT 0',
        'ALTER TABLE pizza_supplements ADD COLUMN current_stock REAL NOT NULL DEFAULT 50.0',
        'ALTER TABLE pizza_supplements ADD COLUMN min_stock_alert REAL NOT NULL DEFAULT 5.0'
      ]) {
        try {
          await db.execute(colDef);
        } catch {}
      }
      this.tableInitialized = true;
    } catch (err) {
      console.warn('[SupplementService] Initialisation table SQLite :', err);
    }
  }

  // Initialisation et chargement des suppléments avec stock et coût d'achat
  public async getSupplements(includeInactive = false): Promise<PizzaSupplement[]> {
    await this.ensureTable();

    // Migration automatique unique : purger les anciens suppléments de démonstration
    if (typeof localStorage !== 'undefined' && !localStorage.getItem('pizzeria_defaults_cleaned_v1_0_2')) {
      localStorage.setItem('pizzeria_defaults_cleaned_v1_0_2', 'true');
      try {
        for (const legacyId of LEGACY_DEFAULT_SUPPLEMENT_IDS) {
          await db.execute('DELETE FROM pizza_supplements WHERE id = ?', [legacyId]);
        }
        const saved = localStorage.getItem('pizzeria_pizza_supplements');
        if (saved) {
          const parsed: PizzaSupplement[] = JSON.parse(saved);
          const filtered = parsed.filter(s => !LEGACY_DEFAULT_SUPPLEMENT_IDS.includes(s.id));
          localStorage.setItem('pizzeria_pizza_supplements', JSON.stringify(filtered));
        }
      } catch {}
    }

    try {
      const rows = await db.select<PizzaSupplement>(
        includeInactive
          ? 'SELECT * FROM pizza_supplements ORDER BY price ASC'
          : 'SELECT * FROM pizza_supplements WHERE is_active = 1 ORDER BY price ASC'
      );
      if (rows) {
        // Filtrer les éventuels résidus d'anciens suppléments par défaut
        const cleanedRows = rows.filter(r => !LEGACY_DEFAULT_SUPPLEMENT_IDS.includes(r.id));
        const normalized = cleanedRows.map(r => ({
          ...r,
          purchase_cost: Number(r.purchase_cost) || 0,
          price: Number(r.price) || 0,
          current_stock: r.current_stock !== undefined ? Number(r.current_stock) : 50,
          min_stock_alert: r.min_stock_alert !== undefined ? Number(r.min_stock_alert) : 5
        }));
        this.supplementsCache = normalized;
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('pizzeria_pizza_supplements', JSON.stringify(normalized));
        }
        return normalized;
      }
    } catch (err) {
      console.warn('[SupplementService] Erreur lecture SQLite:', err);
    }

    // Repli persistant dans localStorage si SQLite est temporairement indisponible
    if (typeof localStorage !== 'undefined') {
      try {
        const saved = localStorage.getItem('pizzeria_pizza_supplements');
        if (saved) {
          const parsed: PizzaSupplement[] = JSON.parse(saved);
          const cleaned = parsed.filter(s => !LEGACY_DEFAULT_SUPPLEMENT_IDS.includes(s.id));
          const normalized = cleaned.map(r => ({
            ...r,
            purchase_cost: Number(r.purchase_cost) || 0,
            price: Number(r.price) || 0,
            current_stock: r.current_stock !== undefined ? Number(r.current_stock) : 50,
            min_stock_alert: r.min_stock_alert !== undefined ? Number(r.min_stock_alert) : 5
          }));
          this.supplementsCache = normalized;
          return includeInactive ? normalized : normalized.filter(s => s.is_active === 1);
        }
      } catch {}
    }

    // Base propre sans données factices
    this.supplementsCache = [];
    return [];
  }

  public async saveSupplements(list: PizzaSupplement[]): Promise<void> {
    await this.ensureTable();

    if (list.length === 0) {
      await db.execute('DELETE FROM pizza_supplements');
    } else {
      // Supprimer de SQLite tout supplément qui n'existe plus dans list
      const currentIds = list.map(s => s.id);
      const existingRows = await db.select<{ id: string }>('SELECT id FROM pizza_supplements');
      if (existingRows && existingRows.length > 0) {
        for (const row of existingRows) {
          if (!currentIds.includes(row.id)) {
            await db.execute('DELETE FROM pizza_supplements WHERE id = ?', [row.id]);
          }
        }
      }

      for (const s of list) {
        await db.execute(
          `INSERT OR REPLACE INTO pizza_supplements 
            (id, name_fr, name_ar, purchase_cost, price, current_stock, min_stock_alert, category, is_active, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            s.id,
            s.name_fr,
            s.name_ar || null,
            Number(s.purchase_cost) || 0,
            Number(s.price) || 0,
            s.current_stock !== undefined ? Number(s.current_stock) : 50,
            s.min_stock_alert !== undefined ? Number(s.min_stock_alert) : 5,
            s.category || 'extra',
            s.is_active !== undefined ? s.is_active : 1,
            s.created_at || new Date().toISOString()
          ]
        );
      }
    }

    this.supplementsCache = list;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('pizzeria_pizza_supplements', JSON.stringify(list));
      window.dispatchEvent(new Event('supplements_updated'));
    }
  }

  public async addSupplement(input: {
    name_fr: string;
    name_ar?: string;
    purchase_cost?: number;
    price: number;
    current_stock?: number;
    min_stock_alert?: number;
    category?: any;
  }): Promise<PizzaSupplement> {
    if (!input.name_fr || !input.name_fr.trim()) {
      throw new Error("Le nom du supplément est obligatoire");
    }
    const parsedPrice = Number(input.price);
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      throw new Error("Le prix du supplément doit être un montant valide");
    }

    await this.ensureTable();
    const newId = `sup-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const newSupplement: PizzaSupplement = {
      id: newId,
      name_fr: input.name_fr.trim(),
      name_ar: input.name_ar ? input.name_ar.trim() : undefined,
      purchase_cost: Math.max(0, Math.round(Number(input.purchase_cost) || 0)),
      price: Math.max(0, Math.round(parsedPrice)),
      current_stock: Math.max(0, Number(input.current_stock ?? 50)),
      min_stock_alert: Math.max(0, Number(input.min_stock_alert ?? 5)),
      category: input.category || 'extra',
      is_active: 1,
      created_at: new Date().toISOString()
    };

    // Insérer directement dans SQLite
    await db.execute(
      `INSERT OR REPLACE INTO pizza_supplements 
        (id, name_fr, name_ar, purchase_cost, price, current_stock, min_stock_alert, category, is_active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newSupplement.id,
        newSupplement.name_fr,
        newSupplement.name_ar || null,
        newSupplement.purchase_cost,
        newSupplement.price,
        newSupplement.current_stock,
        newSupplement.min_stock_alert,
        newSupplement.category,
        newSupplement.is_active,
        newSupplement.created_at
      ]
    );

    const all = await this.getSupplements(true);
    if (!all.some(s => s.id === newSupplement.id)) {
      all.push(newSupplement);
    }
    this.supplementsCache = all;

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('pizzeria_pizza_supplements', JSON.stringify(all));
      window.dispatchEvent(new Event('supplements_updated'));
    }

    return newSupplement;
  }

  public async updateSupplement(id: string, updates: Partial<PizzaSupplement>): Promise<void> {
    await this.ensureTable();
    const sets: string[] = [];
    const vals: any[] = [];
    if (updates.name_fr !== undefined) { sets.push('name_fr = ?'); vals.push(updates.name_fr.trim()); }
    if (updates.name_ar !== undefined) { sets.push('name_ar = ?'); vals.push(updates.name_ar ? updates.name_ar.trim() : null); }
    if (updates.price !== undefined) { sets.push('price = ?'); vals.push(Number(updates.price)); }
    if (updates.purchase_cost !== undefined) { sets.push('purchase_cost = ?'); vals.push(Number(updates.purchase_cost)); }
    if (updates.current_stock !== undefined) { sets.push('current_stock = ?'); vals.push(Number(updates.current_stock)); }
    if (updates.min_stock_alert !== undefined) { sets.push('min_stock_alert = ?'); vals.push(Number(updates.min_stock_alert)); }
    if (updates.category !== undefined) { sets.push('category = ?'); vals.push(updates.category); }
    if (updates.is_active !== undefined) { sets.push('is_active = ?'); vals.push(updates.is_active); }

    if (sets.length > 0) {
      vals.push(id);
      await db.execute(`UPDATE pizza_supplements SET ${sets.join(', ')} WHERE id = ?`, vals);
    }

    const all = await this.getSupplements(true);
    this.supplementsCache = all;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('pizzeria_pizza_supplements', JSON.stringify(all));
      window.dispatchEvent(new Event('supplements_updated'));
    }
  }

  public async adjustStock(id: string, delta: number): Promise<void> {
    await this.ensureTable();
    await db.execute(
      'UPDATE pizza_supplements SET current_stock = MAX(0, current_stock + ?) WHERE id = ?',
      [delta, id]
    );
    const all = await this.getSupplements(true);
    this.supplementsCache = all;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('pizzeria_pizza_supplements', JSON.stringify(all));
      window.dispatchEvent(new Event('supplements_updated'));
    }
  }

  // Déduction automatique du stock lors de chaque vente de pizza avec suppléments
  public async deductSupplementStock(supplementsWithQty: Array<{ supplementId: string; quantity: number }>): Promise<void> {
    if (!supplementsWithQty || supplementsWithQty.length === 0) return;
    await this.ensureTable();
    for (const item of supplementsWithQty) {
      try {
        await db.execute(
          'UPDATE pizza_supplements SET current_stock = MAX(0, current_stock - ?) WHERE id = ?',
          [item.quantity, item.supplementId]
        );
      } catch (err) {
        console.warn('[SupplementService] Erreur déduction stock supplément:', err);
      }
    }
    const all = await this.getSupplements(true);
    this.supplementsCache = all;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('pizzeria_pizza_supplements', JSON.stringify(all));
      window.dispatchEvent(new Event('supplements_updated'));
    }
  }

  // Réintégration du stock des suppléments lors d'un remboursement
  public async restoreSupplementStock(supplementsWithQty: Array<{ supplementId: string; quantity: number }>): Promise<void> {
    if (!supplementsWithQty || supplementsWithQty.length === 0) return;
    await this.ensureTable();
    for (const item of supplementsWithQty) {
      try {
        await db.execute(
          'UPDATE pizza_supplements SET current_stock = current_stock + ? WHERE id = ?',
          [item.quantity, item.supplementId]
        );
      } catch (err) {
        console.warn('[SupplementService] Erreur restitution stock supplément:', err);
      }
    }
    const all = await this.getSupplements(true);
    this.supplementsCache = all;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('pizzeria_pizza_supplements', JSON.stringify(all));
      window.dispatchEvent(new Event('supplements_updated'));
    }
  }

  // Suppression définitive d'un supplément (SQLite + Cache + LocalStorage)
  public async deleteSupplement(id: string): Promise<void> {
    await this.ensureTable();
    await db.execute('DELETE FROM pizza_supplements WHERE id = ?', [id]);
    const all = await this.getSupplements(true);
    const nextList = all.filter(s => s.id !== id);
    this.supplementsCache = nextList;

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('pizzeria_pizza_supplements', JSON.stringify(nextList));
      window.dispatchEvent(new Event('supplements_updated'));
    }
  }

  // Supprimer tous les anciens suppléments de démonstration par défaut
  public async clearDefaultSupplements(): Promise<void> {
    try {
      await this.ensureTable();
      for (const legacyId of LEGACY_DEFAULT_SUPPLEMENT_IDS) {
        await db.execute('DELETE FROM pizza_supplements WHERE id = ?', [legacyId]);
      }
    } catch (err) {
      console.error('[SupplementService] Erreur suppression par défaut SQLite :', err);
    }

    const all = await this.getSupplements(true);
    const nextList = all.filter(s => !LEGACY_DEFAULT_SUPPLEMENT_IDS.includes(s.id));
    this.supplementsCache = nextList;

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('pizzeria_pizza_supplements', JSON.stringify(nextList));
      window.dispatchEvent(new Event('supplements_updated'));
    }
  }

  // Vider complètement la table des suppléments
  public async clearAllSupplements(): Promise<void> {
    try {
      await this.ensureTable();
      await db.execute('DELETE FROM pizza_supplements');
    } catch (err) {
      console.error('[SupplementService] Erreur vidage complet SQLite :', err);
    }

    this.supplementsCache = [];
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('pizzeria_pizza_supplements', JSON.stringify([]));
      window.dispatchEvent(new Event('supplements_updated'));
    }
  }
}

export const supplementService = SupplementService.getInstance();

