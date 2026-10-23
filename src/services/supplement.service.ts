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

const DEFAULT_SUPPLEMENTS: PizzaSupplement[] = [
  { id: 'sup-fromage', name_fr: 'Extra Mozzarella / Fromage', name_ar: 'جبن إضافي / موزاريلا', purchase_cost: 50, price: 100, current_stock: 50, min_stock_alert: 10, category: 'cheese', is_active: 1 },
  { id: 'sup-champignon', name_fr: 'Champignons Frais', name_ar: 'فطر طازج', purchase_cost: 40, price: 80, current_stock: 40, min_stock_alert: 5, category: 'veg', is_active: 1 },
  { id: 'sup-thon', name_fr: 'Thon à l\'huile', name_ar: 'تونة بالزيت', purchase_cost: 65, price: 120, current_stock: 35, min_stock_alert: 5, category: 'meat', is_active: 1 },
  { id: 'sup-viande', name_fr: 'Viande Hachée Fraîche', name_ar: 'لحم مفروم طازج', purchase_cost: 85, price: 150, current_stock: 30, min_stock_alert: 5, category: 'meat', is_active: 1 },
  { id: 'sup-poulet', name_fr: 'Poulet Mariné', name_ar: 'دجاج متبل', purchase_cost: 70, price: 130, current_stock: 35, min_stock_alert: 5, category: 'meat', is_active: 1 },
  { id: 'sup-sauce-fromage', name_fr: 'Sauce Fromagère Maison', name_ar: 'صلصة الجبن', purchase_cost: 25, price: 60, current_stock: 50, min_stock_alert: 10, category: 'sauce', is_active: 1 },
  { id: 'sup-sauce-piquante', name_fr: 'Sauce Piquante / Harissa', name_ar: 'حار / هريسة', purchase_cost: 10, price: 30, current_stock: 60, min_stock_alert: 10, category: 'sauce', is_active: 1 },
  { id: 'sup-olives', name_fr: 'Olives Noires Dénoyautées', name_ar: 'زيتون أسود', purchase_cost: 10, price: 30, current_stock: 50, min_stock_alert: 10, category: 'veg', is_active: 1 },
  { id: 'sup-oeuf', name_fr: 'Œuf', name_ar: 'بيض', purchase_cost: 20, price: 40, current_stock: 60, min_stock_alert: 10, category: 'extra', is_active: 1 },
  { id: 'sup-anchois', name_fr: 'Anchois Salés', name_ar: 'أنشوجة', purchase_cost: 80, price: 150, current_stock: 25, min_stock_alert: 5, category: 'meat', is_active: 1 },
];

export class SupplementService {
  private static instance: SupplementService;
  private supplementsCache: PizzaSupplement[] | null = null;

  private constructor() {}

  public static getInstance(): SupplementService {
    if (!SupplementService.instance) {
      SupplementService.instance = new SupplementService();
    }
    return SupplementService.instance;
  }

  // Initialisation et chargement des suppléments avec stock et coût d'achat
  public async getSupplements(includeInactive = false): Promise<PizzaSupplement[]> {
    try {
      const rows = await db.select<PizzaSupplement>(
        includeInactive
          ? 'SELECT * FROM pizza_supplements ORDER BY price ASC'
          : 'SELECT * FROM pizza_supplements WHERE is_active = 1 ORDER BY price ASC'
      );
      if (rows && rows.length > 0) {
        // Normaliser les champs stock et coût pour compatibilité
        const normalized = rows.map(r => ({
          ...r,
          purchase_cost: Number(r.purchase_cost) || 0,
          current_stock: r.current_stock !== undefined ? Number(r.current_stock) : 50,
          min_stock_alert: r.min_stock_alert !== undefined ? Number(r.min_stock_alert) : 5
        }));
        this.supplementsCache = normalized;
        return normalized;
      }
    } catch {
      // Si la table SQLite n'existe pas encore
    }

    // Repli persistant dans localStorage
    if (typeof localStorage !== 'undefined') {
      try {
        const saved = localStorage.getItem('pizzeria_pizza_supplements');
        if (saved) {
          const parsed: PizzaSupplement[] = JSON.parse(saved);
          const normalized = parsed.map(r => ({
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

    // Premier démarrage : Sauvegarder les valeurs par défaut avec stock
    await this.saveSupplements(DEFAULT_SUPPLEMENTS);
    return includeInactive ? DEFAULT_SUPPLEMENTS : DEFAULT_SUPPLEMENTS.filter(s => s.is_active === 1);
  }

  public async saveSupplements(list: PizzaSupplement[]): Promise<void> {
    this.supplementsCache = list;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('pizzeria_pizza_supplements', JSON.stringify(list));
      window.dispatchEvent(new Event('supplements_updated'));
    }

    // Tenter d'enregistrer dans SQLite
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
    } catch {
      // Ignorer si SQLite n'est pas encore initialisé
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
    const newId = `sup-${Date.now()}`;
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

  public async deleteSupplement(id: string): Promise<void> {
    const all = await this.getSupplements(true);
    const nextList = all.filter(s => s.id !== id);
    await this.saveSupplements(nextList);
  }
}

export const supplementService = SupplementService.getInstance();
