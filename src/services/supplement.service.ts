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

  // Garantir la création de la table SQLite
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
          current_stock: r.current_stock !== undefined ? Number(r.current_stock) : 50,
          min_stock_alert: r.min_stock_alert !== undefined ? Number(r.min_stock_alert) : 5
        }));
        this.supplementsCache = normalized;
        return normalized;
      }
    } catch {
      // Si la table SQLite n'est pas encore accessible
    }

    // Repli persistant dans localStorage
    if (typeof localStorage !== 'undefined') {
      try {
        const saved = localStorage.getItem('pizzeria_pizza_supplements');
        if (saved) {
          const parsed: PizzaSupplement[] = JSON.parse(saved);
          const cleaned = parsed.filter(s => !LEGACY_DEFAULT_SUPPLEMENT_IDS.includes(s.id));
          const normalized = cleaned.map(r => ({
            ...r,
            purchase_cost: Number(r.purchase_cost) || 0,
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
    this.supplementsCache = list;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('pizzeria_pizza_supplements', JSON.stringify(list));
      window.dispatchEvent(new Event('supplements_updated'));
    }

    // Enregistrer et synchroniser avec SQLite
    try {
      await this.ensureTable();

      if (list.length === 0) {
        await db.execute('DELETE FROM pizza_supplements');
        return;
      }

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
            s.purchase_cost || 0,
            s.price || 0,
            s.current_stock !== undefined ? s.current_stock : 50,
            s.min_stock_alert !== undefined ? s.min_stock_alert : 5,
            s.category || 'extra',
            s.is_active !== undefined ? s.is_active : 1,
            s.created_at || new Date().toISOString()
          ]
        );
      }
    } catch (err) {
      console.error('[SupplementService] Erreur synchronisation SQLite :', err);
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
    const all = await this.getSupplements(true);
    const newId = `sup-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const newSupplement: PizzaSupplement = {
      id: newId,
      name_fr: input.name_fr.trim(),
      name_ar: input.name_ar ? input.name_ar.trim() : undefined,
      purchase_cost: Math.max(0, Math.round(input.purchase_cost || 0)),
      price: Math.max(0, Math.round(input.price)),
      current_stock: Math.max(0, Number(input.current_stock ?? 50)),
      min_stock_alert: Math.max(0, Number(input.min_stock_alert ?? 5)),
      category: input.category || 'extra',
      is_active: 1,
      created_at: new Date().toISOString()
    };
    const nextList = [...all, newSupplement];
    await this.saveSupplements(nextList);
    return newSupplement;
  }

  public async updateSupplement(id: string, updates: Partial<PizzaSupplement>): Promise<void> {
    const all = await this.getSupplements(true);
    const nextList = all.map(s => (s.id === id ? { ...s, ...updates } : s));
    await this.saveSupplements(nextList);
  }

  public async adjustStock(id: string, delta: number): Promise<void> {
    const all = await this.getSupplements(true);
    const nextList = all.map(s => {
      if (s.id === id) {
        const nextStock = Math.max(0, (s.current_stock || 0) + delta);
        return { ...s, current_stock: nextStock };
      }
      return s;
    });
    await this.saveSupplements(nextList);
  }

  // Déduction automatique du stock lors de chaque vente de pizza avec suppléments
  public async deductSupplementStock(supplementsWithQty: Array<{ supplementId: string; quantity: number }>): Promise<void> {
    if (!supplementsWithQty || supplementsWithQty.length === 0) return;
    const all = await this.getSupplements(true);
    let modified = false;

    for (const item of supplementsWithQty) {
      const supp = all.find(s => s.id === item.supplementId);
      if (supp) {
        supp.current_stock = Math.max(0, (supp.current_stock || 0) - item.quantity);
        modified = true;
      }
    }

    if (modified) {
      await this.saveSupplements(all);
    }
  }

  // Suppression définitive d'un supplément (SQLite + Cache + LocalStorage)
  public async deleteSupplement(id: string): Promise<void> {
    try {
      await this.ensureTable();
      await db.execute('DELETE FROM pizza_supplements WHERE id = ?', [id]);
    } catch (err) {
      console.error('[SupplementService] Erreur suppression SQLite :', err);
    }

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

