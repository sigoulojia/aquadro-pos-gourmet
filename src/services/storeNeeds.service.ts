// Aquadro POS Algérie — Service des Besoins du Magasin (Store Needs & Restock Requests)
// Permet au caissier de signaler les produits, ingrédients et fournitures manquants,
// et permet au propriétaire (Owner) de savoir exactement quoi acheter pour le réapprovisionnement.

import { db } from '../db/sqlite';

export interface StoreNeed {
  id: string;
  item_name: string;
  quantity_needed?: string;
  urgency: 'NORMAL' | 'URGENT';
  notes?: string;
  requested_by: string;
  status: 'PENDING' | 'COMPLETED';
  created_at: string;
  completed_at?: string;
}

const DEFAULT_NEEDS: StoreNeed[] = [];

export class StoreNeedsService {
  private static instance: StoreNeedsService;

  private constructor() {}

  public static getInstance(): StoreNeedsService {
    if (!StoreNeedsService.instance) {
      StoreNeedsService.instance = new StoreNeedsService();
    }
    return StoreNeedsService.instance;
  }

  public async getNeeds(statusFilter: 'ALL' | 'PENDING' | 'COMPLETED' = 'ALL'): Promise<StoreNeed[]> {
    // 1. Essayer SQLite
    try {
      await this.ensureTable();
      // Nettoyer les anciennes entrées de test/démo si existantes
      try {
        await db.execute("DELETE FROM store_needs WHERE id LIKE 'need-demo%'");
      } catch {}

      let query = 'SELECT * FROM store_needs ORDER BY created_at DESC';
      if (statusFilter === 'PENDING') {
        query = "SELECT * FROM store_needs WHERE status = 'PENDING' ORDER BY created_at DESC";
      } else if (statusFilter === 'COMPLETED') {
        query = "SELECT * FROM store_needs WHERE status = 'COMPLETED' ORDER BY created_at DESC";
      }
      const rows = await db.select<StoreNeed>(query);
      if (rows && rows.length > 0) {
        return rows;
      }
    } catch {
      // Repli localStorage
    }

    // 2. Repli localStorage
    if (typeof localStorage !== 'undefined') {
      try {
        const saved = localStorage.getItem('pizzeria_store_needs');
        if (saved) {
          const rawList: StoreNeed[] = JSON.parse(saved);
          const list = rawList.filter(n => !n.id.startsWith('need-demo'));
          if (list.length !== rawList.length) {
            localStorage.setItem('pizzeria_store_needs', JSON.stringify(list));
          }
          if (statusFilter === 'ALL') return list;
          return list.filter(n => n.status === statusFilter);
        }
      } catch {}
    }

    // 3. Base propre sans données factices
    return [];
  }

  public async addNeed(input: {
    item_name: string;
    quantity_needed?: string;
    urgency?: 'NORMAL' | 'URGENT';
    notes?: string;
    requested_by: string;
  }): Promise<StoreNeed> {
    const all = await this.getNeeds('ALL');
    const newNeed: StoreNeed = {
      id: `need-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      item_name: input.item_name.trim(),
      quantity_needed: input.quantity_needed ? input.quantity_needed.trim() : undefined,
      urgency: input.urgency || 'NORMAL',
      notes: input.notes ? input.notes.trim() : undefined,
      requested_by: input.requested_by || 'Caissier',
      status: 'PENDING',
      created_at: new Date().toISOString()
    };

    const nextList = [newNeed, ...all];
    await this.saveAll(nextList);
    return newNeed;
  }

  public async markAsCompleted(id: string): Promise<void> {
    const all = await this.getNeeds('ALL');
    const nextList = all.map(n => {
      if (n.id === id) {
        return {
          ...n,
          status: 'COMPLETED' as const,
          completed_at: new Date().toISOString()
        };
      }
      return n;
    });
    await this.saveAll(nextList);
  }

  public async markAsPending(id: string): Promise<void> {
    const all = await this.getNeeds('ALL');
    const nextList = all.map(n => {
      if (n.id === id) {
        return {
          ...n,
          status: 'PENDING' as const,
          completed_at: undefined
        };
      }
      return n;
    });
    await this.saveAll(nextList);
  }

  public async deleteNeed(id: string): Promise<void> {
    try {
      await db.execute('DELETE FROM store_needs WHERE id = ?', [id]);
    } catch {}
    const all = await this.getNeeds('ALL');
    const nextList = all.filter(n => n.id !== id);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('pizzeria_store_needs', JSON.stringify(nextList));
      window.dispatchEvent(new Event('store_needs_updated'));
    }
  }

  public async getPendingCount(): Promise<number> {
    const list = await this.getNeeds('PENDING');
    return list.length;
  }

  private async ensureTable(): Promise<void> {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS store_needs (
        id TEXT PRIMARY KEY,
        item_name TEXT NOT NULL,
        quantity_needed TEXT,
        urgency TEXT NOT NULL DEFAULT 'NORMAL',
        notes TEXT,
        requested_by TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        created_at TEXT NOT NULL,
        completed_at TEXT
      )
    `);
  }

  private async saveAll(list: StoreNeed[]): Promise<void> {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('pizzeria_store_needs', JSON.stringify(list));
      window.dispatchEvent(new Event('store_needs_updated'));
    }

    try {
      await this.ensureTable();
      for (const n of list) {
        await db.execute(
          `INSERT OR REPLACE INTO store_needs 
            (id, item_name, quantity_needed, urgency, notes, requested_by, status, created_at, completed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            n.id,
            n.item_name,
            n.quantity_needed || null,
            n.urgency,
            n.notes || null,
            n.requested_by,
            n.status,
            n.created_at,
            n.completed_at || null
          ]
        );
      }
    } catch {}
  }
}

export const storeNeedsService = StoreNeedsService.getInstance();
