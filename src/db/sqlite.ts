// Aquadro POS Algérie V2 — Moteur de Base de Données SQLite Local
// TRANSITIONAL COMPATIBILITY BRIDGE:
// tauri-plugin-sql est utilisé temporairement pour réconcilier le frontend avec
// la base SQLite native autoritaire gérée par Rust (AppData/pizzeria_pos.db).
// Cette passerelle sera supprimée lors de l'intégration IPC finale.

import { appDataDir, join } from '@tauri-apps/api/path';
import {
  SEED_STORE,
  SEED_ROLES,
  SEED_PERMISSIONS,
  SEED_USERS,
  SEED_CATEGORIES,
  SEED_BRANDS,
  SEED_SUPPLIERS,
  SEED_PRODUCTS,
  SEED_CUSTOMERS,
  SEED_BATCHES
} from './seed';

/**
 * Identifie si un enregistrement utilisateur correspond uniquement au compte d'amorçage
 * non configuré (SEED_USERS 'user-001' ou hash fictif 'mock-hash-*') et non à un vrai compte configuré.
 */
export function isPlaceholderSeedUser(
  user: { id?: string; pin_hash?: string | null } | null | undefined
): boolean {
  if (!user) return true;
  const hash = String(user.pin_hash || '').trim();
  if (!hash) return true;
  if (hash.startsWith('mock-hash-')) return true;
  const seedHash = SEED_USERS[0]?.pin_hash;
  if (seedHash && hash === seedHash) return true;
  return false;
}

/**
 * Identifie si un enregistrement magasin correspond uniquement au SEED_STORE non configuré
 * ('store-001' dépourvu de nom français configuré `name_fr`).
 */
export function isPlaceholderSeedStore(
  store: { id?: string; name_fr?: string | null; name?: string | null } | null | undefined
): boolean {
  if (!store || !store.id) return true;
  if (store.id === SEED_STORE.id && (!store.name_fr || String(store.name_fr).trim() === '')) {
    return true;
  }
  return false;
}

export interface QueryResult {
  rowsAffected: number;
  lastInsertId?: number;
}

export interface SqlAdapter {
  execute(query: string, params?: any[]): Promise<QueryResult>;
  select<T = any>(query: string, params?: any[]): Promise<T[]>;
}

interface ForeignKeyRule {
  childTable: string;
  childCol: string;
  parentTable: string;
  parentCol: string;
  onDelete?: 'CASCADE' | 'SET NULL' | 'RESTRICT';
}

const FOREIGN_KEY_RULES: ForeignKeyRule[] = [
  { childTable: 'users', childCol: 'store_id', parentTable: 'stores', parentCol: 'id', onDelete: 'RESTRICT' },
  { childTable: 'products', childCol: 'store_id', parentTable: 'stores', parentCol: 'id', onDelete: 'RESTRICT' },
  { childTable: 'products', childCol: 'category_id', parentTable: 'categories', parentCol: 'id', onDelete: 'RESTRICT' },
  { childTable: 'products', childCol: 'brand_id', parentTable: 'brands', parentCol: 'id', onDelete: 'RESTRICT' },
  { childTable: 'recipe_items', childCol: 'product_id', parentTable: 'products', parentCol: 'id', onDelete: 'CASCADE' },
  { childTable: 'recipe_items', childCol: 'ingredient_id', parentTable: 'ingredients', parentCol: 'id', onDelete: 'CASCADE' },
  { childTable: 'product_batches', childCol: 'product_id', parentTable: 'products', parentCol: 'id', onDelete: 'CASCADE' },
  { childTable: 'cash_sessions', childCol: 'cashier_id', parentTable: 'users', parentCol: 'id', onDelete: 'RESTRICT' },
  { childTable: 'purchases', childCol: 'supplier_id', parentTable: 'suppliers', parentCol: 'id', onDelete: 'RESTRICT' },
  { childTable: 'purchase_items', childCol: 'purchase_id', parentTable: 'purchases', parentCol: 'id', onDelete: 'CASCADE' },
  { childTable: 'purchase_items', childCol: 'product_id', parentTable: 'products', parentCol: 'id', onDelete: 'RESTRICT' },
  { childTable: 'inventory_movements', childCol: 'product_id', parentTable: 'products', parentCol: 'id', onDelete: 'RESTRICT' },
  { childTable: 'inventory_movements', childCol: 'batch_id', parentTable: 'product_batches', parentCol: 'id', onDelete: 'RESTRICT' },
  { childTable: 'inventory_movements', childCol: 'user_id', parentTable: 'users', parentCol: 'id', onDelete: 'RESTRICT' },
  { childTable: 'expenses', childCol: 'user_id', parentTable: 'users', parentCol: 'id', onDelete: 'RESTRICT' },
  { childTable: 'customer_payments', childCol: 'customer_id', parentTable: 'customers', parentCol: 'id', onDelete: 'RESTRICT' },
  { childTable: 'customer_payments', childCol: 'cashier_id', parentTable: 'users', parentCol: 'id', onDelete: 'RESTRICT' },
  { childTable: 'supplier_payments', childCol: 'supplier_id', parentTable: 'suppliers', parentCol: 'id', onDelete: 'RESTRICT' },
  { childTable: 'supplier_payments', childCol: 'cashier_id', parentTable: 'users', parentCol: 'id', onDelete: 'RESTRICT' },
  { childTable: 'sales', childCol: 'session_id', parentTable: 'cash_sessions', parentCol: 'id', onDelete: 'SET NULL' },
  { childTable: 'sales', childCol: 'cashier_id', parentTable: 'users', parentCol: 'id', onDelete: 'RESTRICT' },
  { childTable: 'sale_items', childCol: 'sale_id', parentTable: 'sales', parentCol: 'id', onDelete: 'CASCADE' },
  { childTable: 'sale_items', childCol: 'product_id', parentTable: 'products', parentCol: 'id', onDelete: 'RESTRICT' },
  { childTable: 'sale_items', childCol: 'batch_id', parentTable: 'product_batches', parentCol: 'id', onDelete: 'RESTRICT' },
  { childTable: 'payments', childCol: 'sale_id', parentTable: 'sales', parentCol: 'id', onDelete: 'CASCADE' },
  { childTable: 'refunds', childCol: 'original_sale_id', parentTable: 'sales', parentCol: 'id', onDelete: 'RESTRICT' },
  { childTable: 'refunds', childCol: 'cashier_id', parentTable: 'users', parentCol: 'id', onDelete: 'RESTRICT' },
  { childTable: 'refund_items', childCol: 'refund_id', parentTable: 'refunds', parentCol: 'id', onDelete: 'CASCADE' },
  { childTable: 'refund_items', childCol: 'product_id', parentTable: 'products', parentCol: 'id', onDelete: 'RESTRICT' }
];

class MemorySQLiteEngine {
  private tables: Record<string, any[]> = {};
  private initialized = false;
  private txSnapshot: Record<string, any[]> | null = null;
  public foreignKeysEnabled = false;
  public setupVerifiedInMemory = false;

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage() {
    try {
      if (typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem('pizzeria_pos_db');
        if (saved) {
          this.tables = JSON.parse(saved);
          this.initialized = true;
        }
      }
    } catch {
      // Ignorer si indisponible (environnement node/vitest)
    }
  }

  public saveToStorage() {
    if (this.txSnapshot !== null) {
      // Ne pas persister sur localStorage tant que la transaction est en cours
      return;
    }
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('pizzeria_pos_db', JSON.stringify(this.tables));
      }
    } catch {
      // Ignorer
    }
  }

  public beginTransaction() {
    if (this.txSnapshot !== null) {
      throw new Error('cannot start a transaction within a transaction');
    }
    this.txSnapshot = JSON.parse(JSON.stringify(this.tables));
  }

  public commitTransaction() {
    if (this.txSnapshot === null) {
      return;
    }
    this.txSnapshot = null;
    this.saveToStorage();
  }

  public rollbackTransaction() {
    if (this.txSnapshot === null) {
      return;
    }
    this.tables = this.txSnapshot;
    this.txSnapshot = null;
    this.saveToStorage();
  }

  public isInTransaction(): boolean {
    return this.txSnapshot !== null;
  }

  public validateForeignKeysOnInsert(table: string, record: Record<string, any>) {
    if (!this.foreignKeysEnabled) return;
    const rules = FOREIGN_KEY_RULES.filter(r => r.childTable === table);
    for (const rule of rules) {
      const fkVal = record[rule.childCol];
      if (fkVal !== undefined && fkVal !== null && fkVal !== '') {
        const parentRows = this.getTable(rule.parentTable);
        const found = parentRows.some(p => p[rule.parentCol] === fkVal);
        if (!found) {
          throw new Error(
            `FOREIGN KEY constraint failed: ${table}.${rule.childCol} (${String(fkVal)}) references missing ${rule.parentTable}.${rule.parentCol}`
          );
        }
      }
    }
  }

  public handleForeignKeysOnDelete(parentTable: string, deletedRows: any[]) {
    if (!this.foreignKeysEnabled || deletedRows.length === 0) return;
    const rules = FOREIGN_KEY_RULES.filter(r => r.parentTable === parentTable);
    for (const deleted of deletedRows) {
      for (const rule of rules) {
        const parentKey = deleted[rule.parentCol];
        if (parentKey === undefined || parentKey === null) continue;
        const childRows = this.getTable(rule.childTable);
        const matchingChildren = childRows.filter(c => c[rule.childCol] === parentKey);
        if (matchingChildren.length > 0) {
          if (rule.onDelete === 'CASCADE') {
            const remaining = childRows.filter(c => c[rule.childCol] !== parentKey);
            childRows.length = 0;
            childRows.push(...remaining);
          } else if (rule.onDelete === 'SET NULL') {
            for (const c of matchingChildren) {
              c[rule.childCol] = null;
            }
          } else {
            throw new Error(
              `FOREIGN KEY constraint failed: cannot delete ${parentTable}.${rule.parentCol}=${String(parentKey)} referenced by ${rule.childTable}.${rule.childCol}`
            );
          }
        }
      }
    }
  }

  public checkAllForeignKeys(): Array<{ table: string; rowid: number; parent: string; fkid: number }> {
    const violations: Array<{ table: string; rowid: number; parent: string; fkid: number }> = [];
    FOREIGN_KEY_RULES.forEach((rule, idx) => {
      const childRows = this.getTable(rule.childTable);
      const parentRows = this.getTable(rule.parentTable);
      childRows.forEach((row, rIdx) => {
        const val = row[rule.childCol];
        if (val !== undefined && val !== null && val !== '') {
          const exists = parentRows.some(p => p[rule.parentCol] === val);
          if (!exists) {
            violations.push({
              table: rule.childTable,
              rowid: rIdx + 1,
              parent: rule.parentTable,
              fkid: idx
            });
          }
        }
      });
    });
    return violations;
  }

  public initSeed() {
    if (this.initialized && Object.keys(this.tables).length > 0) return;

    this.tables['stores'] = SEED_STORE ? [{ ...SEED_STORE }] : [];
    this.tables['roles'] = [...SEED_ROLES];
    this.tables['permissions'] = [...SEED_PERMISSIONS];
    this.tables['users'] = SEED_USERS.map(u => ({ ...u }));
    this.tables['categories'] = SEED_CATEGORIES.map(c => ({ ...c }));
    this.tables['brands'] = SEED_BRANDS.map(b => ({ ...b }));
    this.tables['suppliers'] = SEED_SUPPLIERS.map(s => ({ ...s }));
    this.tables['products'] = SEED_PRODUCTS.map(p => ({ ...p }));
    this.tables['customers'] = SEED_CUSTOMERS.map(c => ({ ...c }));
    this.tables['product_batches'] = SEED_BATCHES.map(b => ({ ...b }));
    this.tables['inventory_movements'] = [];
    this.tables['sales'] = [];
    this.tables['sale_items'] = [];
    this.tables['payments'] = [];
    this.tables['refunds'] = [];
    this.tables['refund_items'] = [];
    this.tables['purchases'] = [];
    this.tables['purchase_items'] = [];
    this.tables['expenses'] = [];
    this.tables['cash_sessions'] = [];
    this.tables['customer_payments'] = [];
    this.tables['supplier_payments'] = [];
    this.tables['commercial_documents'] = [];
    this.tables['document_sequences'] = [
      { document_type: 'TICKET', current_year: new Date().getFullYear(), last_sequence_number: 0 },
      { document_type: 'FACTURE', current_year: new Date().getFullYear(), last_sequence_number: 0 },
      { document_type: 'AVOIR', current_year: new Date().getFullYear(), last_sequence_number: 0 },
      { document_type: 'BON_LIVRAISON', current_year: new Date().getFullYear(), last_sequence_number: 0 },
      { document_type: 'COMMANDE', current_year: new Date().getFullYear(), last_sequence_number: 0 }
    ];
    this.tables['ingredients'] = this.tables['ingredients'] || [];
    this.tables['recipe_items'] = this.tables['recipe_items'] || [];
    this.tables['pizza_supplements'] = this.tables['pizza_supplements'] || [];
    this.tables['store_needs'] = this.tables['store_needs'] || [];
    this.tables['audit_logs'] = [];
    this.tables['sync_operations'] = [];

    this.initialized = true;
    this.saveToStorage();
  }

  public getTable(name: string): any[] {
    const key = name.toLowerCase();
    if (!this.tables[key]) {
      this.tables[key] = [];
    }
    return this.tables[key];
  }

  public resetTransactionsOnly() {
    const txTables = [
      'inventory_movements', 'refund_items', 'refunds', 'payments', 'sale_items',
      'sales', 'purchase_items', 'purchases', 'expenses', 'cash_sessions',
      'customer_payments', 'supplier_payments', 'commercial_documents',
      'audit_logs', 'sync_operations'
    ];
    for (const t of txTables) {
      this.tables[t] = [];
    }
    if (this.tables['customers']) {
      for (const c of this.tables['customers']) c.current_debt = 0;
    }
    if (this.tables['suppliers']) {
      for (const s of this.tables['suppliers']) s.current_balance = 0;
    }
    this.saveToStorage();
  }

  public resetAll() {
    this.tables = {};
    this.initialized = false;
    this.txSnapshot = null;
    this.foreignKeysEnabled = false;
    this.setupVerifiedInMemory = false;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('pizzeria_setup_completed');
      localStorage.removeItem('aquadro_setup_completed');
    }
    this.initSeed();
  }
}

const memoryDb = new MemorySQLiteEngine();

export class DatabaseService {
  private static instance: DatabaseService;
  private isTauri = false;
  private tauriDb: SqlAdapter | null = null;
  private customAdapter: SqlAdapter | null = null;
  private initPromise: Promise<void> | null = null;

  private constructor() {
    this.isTauri = this.checkIsTauri();
  }

  private checkIsTauri(): boolean {
    return typeof window !== 'undefined' && Boolean((window as any).__TAURI_INTERNALS__?.invoke);
  }

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  private getActiveAdapter(): SqlAdapter | null {
    if (this.customAdapter) return this.customAdapter;
    if (this.isTauri && this.tauriDb) return this.tauriDb;
    return null;
  }

  public hasNativeOrCustomAdapter(): boolean {
    return Boolean(this.customAdapter || (this.isTauri && this.tauriDb));
  }

  public async setCustomAdapter(adapter: SqlAdapter | null): Promise<void> {
    this.customAdapter = adapter;
    if (adapter) {
      await adapter.execute('PRAGMA foreign_keys = ON;');
      await adapter.execute('PRAGMA busy_timeout = 5000;');
      await this.ensureEssentialStructure(adapter);
    }
  }

  public markSetupVerifiedInMemory(verified: boolean): void {
    memoryDb.setupVerifiedInMemory = verified;
  }

  public async ensureInitialized(): Promise<void> {
    if (this.customAdapter) {
      return;
    }
    if (!this.initPromise) {
      this.initPromise = this.initialize();
    }
    return this.initPromise;
  }

  public async initialize(): Promise<void> {
    if (this.customAdapter) {
      return;
    }
    this.isTauri = this.checkIsTauri();

    if (this.isTauri) {
      try {
        const Database = (await import('@tauri-apps/plugin-sql')).default;
        let tauriDbInstance: any = null;
        let loadError: any = null;

        // 1. Tenter d'abord la base SQLite autoritaire AppData (partagée avec le backend Rust)
        try {
          const appData = await appDataDir();
          const dbPath = await join(appData, 'pizzeria_pos.db');
          tauriDbInstance = await Database.load(`sqlite:${dbPath}`);
          console.log(`[DatabaseService] Connecté avec succès à la base SQLite autoritaire: sqlite:${dbPath}`);
        } catch (e1) {
          loadError = e1;
          console.warn('[DatabaseService] Tentative chemin absolu AppData:', e1);
        }

        // 2. Si échec, tentative via le nom standard
        if (!tauriDbInstance) {
          try {
            tauriDbInstance = await Database.load('sqlite:pizzeria_pos.db');
            console.log('[DatabaseService] Connecté à SQLite via identifiant standard: sqlite:pizzeria_pos.db');
          } catch (e2) {
            loadError = e2;
          }
        }

        if (!tauriDbInstance) {
          throw loadError || new Error('Impossible de charger la base de données native');
        }

        this.tauriDb = tauriDbInstance;

        // Cohérence SQLite : activer systématiquement les clés étrangères et le délai d'attente sur verrou
        try {
          await this.tauriDb!.execute('PRAGMA foreign_keys = ON;');
          await this.tauriDb!.execute('PRAGMA busy_timeout = 5000;');
          await this.tauriDb!.execute('PRAGMA synchronous = NORMAL;');
          await this.tauriDb!.execute('PRAGMA cache_size = -8000;');
          await this.tauriDb!.execute('PRAGMA temp_store = MEMORY;');
        } catch (pragmaErr) {
          console.warn('[DatabaseService] Avertissement PRAGMA SQLite:', pragmaErr);
        }

        // Initialiser les métadonnées structurelles indispensables (tables, colonnes et catégories)
        await this.ensureEssentialStructure(this.tauriDb!);
      } catch (err) {
        console.error('AVERTISSEMENT: Connexion SQLite native échouée, activation du stockage mémoire local persistant.', err);
        memoryDb.initSeed();
      }
    } else {
      memoryDb.initSeed();
      console.log('Moteur Aquadro POS V2 SQLite initialisé (Mode Mémoire / LocalStorage)');
    }
  }

  public async ensureEssentialStructure(targetAdapter?: SqlAdapter): Promise<void> {
    const adapter = targetAdapter || this.getActiveAdapter();
    if (!adapter) return;
    try {
      // 0a. Catégories indispensables
      await adapter.execute(`
        CREATE TABLE IF NOT EXISTS categories (
            id TEXT PRIMARY KEY,
            name_fr TEXT NOT NULL,
            name_ar TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
      `);

      // 0b. Table Produits
      await adapter.execute(`
        CREATE TABLE IF NOT EXISTS products (
            id TEXT PRIMARY KEY,
            store_id TEXT REFERENCES stores(id),
            category_id TEXT REFERENCES categories(id),
            brand_id TEXT REFERENCES brands(id),
            sku TEXT UNIQUE NOT NULL,
            barcode TEXT UNIQUE NOT NULL,
            additional_barcodes TEXT,
            name_fr TEXT NOT NULL,
            name_ar TEXT NOT NULL,
            variant TEXT,
            size_weight TEXT,
            unit_of_measure TEXT DEFAULT 'UNIT',
            box_conversion_ratio REAL DEFAULT 1.0,
            purchase_cost INTEGER NOT NULL DEFAULT 0,
            selling_price_ttc INTEGER NOT NULL DEFAULT 0,
            min_selling_price_ttc INTEGER NOT NULL DEFAULT 0,
            tva_rate REAL DEFAULT 0.0,
            current_stock REAL NOT NULL DEFAULT 0.0,
            min_stock_alert REAL NOT NULL DEFAULT 5.0,
            image_url TEXT,
            is_active INTEGER DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
      `);

      // 0c. Assurer la présence de la colonne image_url dans products
      try {
        await adapter.execute('ALTER TABLE products ADD COLUMN image_url TEXT');
      } catch {}

      // 1. Tables Ingrédients & Recettes
      await adapter.execute(`
        CREATE TABLE IF NOT EXISTS ingredients (
            id TEXT PRIMARY KEY,
            name_fr TEXT NOT NULL,
            name_ar TEXT,
            unit TEXT NOT NULL DEFAULT 'kg',
            current_stock REAL NOT NULL DEFAULT 0.0,
            min_stock_alert REAL NOT NULL DEFAULT 5.0,
            cost_per_unit REAL NOT NULL DEFAULT 0.0,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
      `);
      await adapter.execute(`
        CREATE TABLE IF NOT EXISTS recipe_items (
            id TEXT PRIMARY KEY,
            product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
            ingredient_id TEXT NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
            quantity_required REAL NOT NULL,
            unit_display TEXT,
            created_at TEXT NOT NULL
        )
      `);

      // 2. Suppléments & Extras personnalisés
      await adapter.execute(`
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

      // Assurer la présence des colonnes dans pizza_supplements
      for (const colDef of [
        'ALTER TABLE pizza_supplements ADD COLUMN purchase_cost INTEGER NOT NULL DEFAULT 0',
        'ALTER TABLE pizza_supplements ADD COLUMN current_stock REAL NOT NULL DEFAULT 50.0',
        'ALTER TABLE pizza_supplements ADD COLUMN min_stock_alert REAL NOT NULL DEFAULT 5.0'
      ]) {
        try {
          await adapter.execute(colDef);
        } catch {}
      }

      // Assurer la persistance du nom, des suppléments, notes et alias de prix sur chaque ligne de vente et client
      for (const colDef of [
        'ALTER TABLE sale_items ADD COLUMN product_name TEXT',
        'ALTER TABLE sale_items ADD COLUMN supplements TEXT',
        'ALTER TABLE sale_items ADD COLUMN notes TEXT',
        'ALTER TABLE sale_items ADD COLUMN unit_purchase_price INTEGER DEFAULT 0',
        'ALTER TABLE sale_items ADD COLUMN unit_price INTEGER DEFAULT 0',
        'ALTER TABLE customers ADD COLUMN total_spent INTEGER DEFAULT 0'
      ]) {
        try {
          await adapter.execute(colDef);
        } catch {}
      }

      // 3. Besoins du magasin (Store Needs) & Règlements Fournisseurs (supplier_payments)
      await adapter.execute(`
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

      await adapter.execute(`
        CREATE TABLE IF NOT EXISTS supplier_payments (
            id TEXT PRIMARY KEY,
            supplier_id TEXT NOT NULL REFERENCES suppliers(id),
            amount INTEGER NOT NULL,
            payment_method TEXT NOT NULL,
            reference TEXT,
            cashier_id TEXT NOT NULL REFERENCES users(id),
            created_at TEXT NOT NULL
        )
      `);

      // 3b. Migration sécurisée des schémas hérités (Gate 1C CHECK(current_stock >= 0.0) sans perte ni décalage de colonnes)
      await this.migrateLegacyDatabaseSchema(adapter);

      // 4. Catégories indispensables : Pizzas et Boissons
      const nowIso = new Date().toISOString();
      await adapter.execute(
        `INSERT OR IGNORE INTO categories (id, name_fr, name_ar, created_at) VALUES 
         ('cat-pizza', 'Pizzas', 'بيتزا', ?),
         ('cat-drink', 'Boissons', 'مشروبات', ?)`,
        [nowIso, nowIso]
      );

      // 5. Séquences de numérotation des documents commerciaux
      const currentYear = new Date().getFullYear();
      const sequences: Array<[string, number, number]> = [
        ['TICKET', currentYear, 0],
        ['FACTURE', currentYear, 0],
        ['AVOIR', currentYear, 0],
        ['BON_LIVRAISON', currentYear, 0],
        ['COMMANDE', currentYear, 0]
      ];
      for (const [dt, yr, seq] of sequences) {
        await adapter.execute(
          `INSERT OR IGNORE INTO document_sequences (document_type, current_year, last_sequence_number) VALUES (?, ?, ?)`,
          [dt, yr, seq]
        );
      }
    } catch (err) {
      console.warn('Avertissement initialisation structurelle:', err);
    }
  }

  /**
   * Migration sécurisée d'une base SQLite existante (ex: ancienne version sans image_url ou sans CHECK(current_stock >= 0.0))
   * Utilise une liste explicite de colonnes pour éviter tout décalage lors d'un ajout d'image_url par ALTER TABLE,
   * normalise les stocks négatifs hérités à 0.0, et préserve toutes les clés étrangères enfants.
   */
  public async migrateLegacyDatabaseSchema(targetAdapter?: SqlAdapter): Promise<void> {
    const adapter = targetAdapter || this.getActiveAdapter();
    if (!adapter) return;

    try {
      try {
        await adapter.execute('ALTER TABLE products ADD COLUMN image_url TEXT');
      } catch {}

      const masterRows = await adapter.select<{ sql: string }>(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='products'"
      );
      if (masterRows.length === 0) return;

      const tableSql = masterRows[0]?.sql || '';
      if (tableSql.includes('CHECK(current_stock >= 0.0)')) {
        return;
      }

      await adapter.execute('PRAGMA foreign_keys = OFF;');
      await adapter.execute('BEGIN TRANSACTION;');
      try {
        await adapter.execute('PRAGMA legacy_alter_table = ON;');

        await adapter.execute(`
          CREATE TABLE IF NOT EXISTS new_products (
              id TEXT PRIMARY KEY,
              store_id TEXT REFERENCES stores(id),
              category_id TEXT REFERENCES categories(id),
              brand_id TEXT REFERENCES brands(id),
              sku TEXT UNIQUE NOT NULL,
              barcode TEXT UNIQUE NOT NULL,
              additional_barcodes TEXT,
              name_fr TEXT NOT NULL,
              name_ar TEXT NOT NULL,
              variant TEXT,
              size_weight TEXT,
              unit_of_measure TEXT DEFAULT 'UNIT',
              box_conversion_ratio REAL DEFAULT 1.0,
              purchase_cost INTEGER NOT NULL DEFAULT 0,
              selling_price_ttc INTEGER NOT NULL DEFAULT 0,
              min_selling_price_ttc INTEGER NOT NULL DEFAULT 0,
              tva_rate REAL DEFAULT 0.0,
              current_stock REAL NOT NULL DEFAULT 0.0 CHECK(current_stock >= 0.0),
              min_stock_alert REAL NOT NULL DEFAULT 5.0,
              image_url TEXT,
              is_active INTEGER DEFAULT 1,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
          )
        `);

        await adapter.execute(`
          INSERT INTO new_products (
              id, store_id, category_id, brand_id, sku, barcode, additional_barcodes,
              name_fr, name_ar, variant, size_weight, unit_of_measure, box_conversion_ratio,
              purchase_cost, selling_price_ttc, min_selling_price_ttc, tva_rate,
              current_stock, min_stock_alert, image_url, is_active, created_at, updated_at
          )
          SELECT
              id, store_id, category_id, brand_id, sku, barcode, additional_barcodes,
              name_fr, name_ar, variant, size_weight,
              COALESCE(unit_of_measure, 'UNIT'),
              COALESCE(box_conversion_ratio, 1.0),
              COALESCE(purchase_cost, 0),
              COALESCE(selling_price_ttc, 0),
              COALESCE(min_selling_price_ttc, 0),
              COALESCE(tva_rate, 0.0),
              MAX(0.0, COALESCE(current_stock, 0.0)),
              COALESCE(min_stock_alert, 5.0),
              image_url,
              COALESCE(is_active, 1),
              created_at,
              updated_at
          FROM products
        `);

        await adapter.execute('DROP TABLE products;');
        await adapter.execute('ALTER TABLE new_products RENAME TO products;');
        await adapter.execute('CREATE INDEX IF NOT EXISTS idx_prod_barcode ON products(barcode);');
        await adapter.execute('CREATE INDEX IF NOT EXISTS idx_prod_sku ON products(sku);');
        await adapter.execute('CREATE INDEX IF NOT EXISTS idx_prod_cat ON products(category_id);');

        const batchMaster = await adapter.select<{ sql: string }>(
          "SELECT sql FROM sqlite_master WHERE type='table' AND name='product_batches'"
        );
        if (batchMaster.length > 0 && !(batchMaster[0]?.sql || '').includes('CHECK(current_stock >= 0.0)')) {
          await adapter.execute(`
            CREATE TABLE IF NOT EXISTS new_product_batches (
                id TEXT PRIMARY KEY,
                product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                batch_number TEXT NOT NULL,
                expiration_date TEXT NOT NULL,
                current_stock REAL NOT NULL DEFAULT 0.0 CHECK(current_stock >= 0.0),
                purchase_cost INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            )
          `);

          await adapter.execute(`
            INSERT INTO new_product_batches (
                id, product_id, batch_number, expiration_date, current_stock, purchase_cost, created_at
            )
            SELECT
                id, product_id, batch_number, expiration_date,
                MAX(0.0, COALESCE(current_stock, 0.0)),
                COALESCE(purchase_cost, 0),
                created_at
            FROM product_batches
          `);

          await adapter.execute('DROP TABLE product_batches;');
          await adapter.execute('ALTER TABLE new_product_batches RENAME TO product_batches;');
          await adapter.execute('CREATE INDEX IF NOT EXISTS idx_batch_fefo ON product_batches(product_id, expiration_date ASC);');
        }

        await adapter.execute('PRAGMA legacy_alter_table = OFF;');
        await adapter.execute('COMMIT;');
      } catch (migErr) {
        try {
          await adapter.execute('ROLLBACK;');
        } catch {}
        throw migErr;
      } finally {
        try {
          await adapter.execute('PRAGMA legacy_alter_table = OFF;');
          await adapter.execute('PRAGMA foreign_keys = ON;');
        } catch {}
      }
    } catch (err) {
      console.warn('[DatabaseService] Avertissement migration schéma hérité:', err);
    }
  }

  /**
   * Vérifie de manière fiable si la configuration initiale (Setup) est terminée.
   * Ne se fie jamais uniquement aux indicateurs localStorage : inspecte l'état réel
   * des tables `stores` et `users` dans la base de données en excluant les enregistrements
   * d'amorçage non configurés (SEED_STORE / SEED_USERS).
   */
  public async isSetupCompleted(): Promise<boolean> {
    await this.ensureInitialized();

    const stores = await this.select<{ id: string; name_fr?: string; name?: string }>(
      'SELECT * FROM stores LIMIT 1'
    );
    const activeUsers = await this.select<{
      id: string;
      role: string;
      pin_hash?: string;
      is_active: number;
    }>('SELECT id, role, pin_hash, is_active FROM users WHERE is_active = 1');

    const configuredStores = stores.filter(s => !isPlaceholderSeedStore(s));
    const configuredActiveUsers = activeUsers.filter(u => !isPlaceholderSeedUser(u));

    let dbConfigured = configuredStores.length > 0 && configuredActiveUsers.length > 0;

    // En mode Tauri, si l'adaptateur plugin-sql n'a pas pu lire la base mais que le backend Rust
    // détient déjà une base SQLite configurée, interroger le backend Rust de manière autoritaire.
    if (!dbConfigured && this.isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const rustSetupStatus = await invoke<boolean>('check_setup_status');
        if (rustSetupStatus === true) {
          dbConfigured = true;
        }
      } catch {
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          const rustStore = await invoke<any>('get_store');
          if (rustStore && rustStore.id && rustStore.name_fr) {
            dbConfigured = true;
          }
        } catch {}
      }
    }

    // Si la base de données est réellement configurée (magasin configuré + utilisateur actif avec vrai hash PIN),
    // le Setup est terminé : synchroniser les drapeaux et ne jamais relancer l'assistant d'installation.
    if (dbConfigured) {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('pizzeria_setup_completed', 'true');
        localStorage.setItem('aquadro_setup_completed', 'true');
      }
      memoryDb.setupVerifiedInMemory = true;
      return true;
    }

    // Si la base ne contient aucun magasin/utilisateur configuré (uniquement vide ou seed non configuré),
    // nettoyer tout drapeau localStorage obsolète et signaler que le Setup n'est pas terminé.
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('pizzeria_setup_completed');
      localStorage.removeItem('aquadro_setup_completed');
    }
    return false;
  }

  public async execute(query: string, params: any[] = []): Promise<QueryResult> {
    await this.ensureInitialized();

    const adapter = this.getActiveAdapter();
    if (adapter) {
      return await adapter.execute(query, params);
    }

    const trimmed = query.trim();
    const upper = trimmed.toUpperCase();

    // Gestion des transactions et PRAGMAs en mode mémoire
    if (upper === 'BEGIN' || upper.startsWith('BEGIN TRANSACTION') || upper.startsWith('BEGIN IMMEDIATE')) {
      memoryDb.beginTransaction();
      return { rowsAffected: 0 };
    }
    if (upper === 'COMMIT' || upper === 'END TRANSACTION') {
      memoryDb.commitTransaction();
      return { rowsAffected: 0 };
    }
    if (upper === 'ROLLBACK') {
      memoryDb.rollbackTransaction();
      return { rowsAffected: 0 };
    }
    if (upper.startsWith('PRAGMA FOREIGN_KEYS')) {
      if (upper.includes('OFF') || upper.includes('0')) {
        memoryDb.foreignKeysEnabled = false;
      } else if (upper.includes('ON') || upper.includes('1')) {
        memoryDb.foreignKeysEnabled = true;
      }
      return { rowsAffected: 0 };
    }
    if (upper.startsWith('PRAGMA')) {
      return { rowsAffected: 0 };
    }

    // 1. INSERT [OR REPLACE / IGNORE] INTO table (col1, col2) VALUES (?, ?) [ON CONFLICT...]
    if (upper.startsWith('INSERT')) {
      const match = query.match(/INSERT(?:\s+OR\s+(REPLACE|IGNORE))?\s+INTO\s+([a-zA-Z0-9_]+)/i);
      if (match) {
        const conflictMode = (match[1] || '').toUpperCase();
        const hasOnConflictUpdate = /ON\s+CONFLICT\s*\([^)]+\)\s*DO\s+UPDATE/i.test(query);
        const hasOnConflictNothing = /ON\s+CONFLICT(?:\s*\([^)]+\))?\s*DO\s+NOTHING/i.test(query);
        const table = match[2].toLowerCase();
        const colMatch = query.match(/\(([^)]+)\)\s*VALUES/i);
        if (colMatch) {
          const cols = colMatch[1].split(',').map(c => c.trim().toLowerCase());
          const rows = memoryDb.getTable(table);

          // Extraire les tuples VALUES (...) pour gérer à la fois les '?' et les littéraux SQL ('owner', 1, etc.)
          const afterValues = query.split(/VALUES/i)[1] || '';
          const beforeOnConflict = afterValues.split(/ON\s+CONFLICT/i)[0] || '';
          const tupleMatches = [...beforeOnConflict.matchAll(/\(([^)]+)\)/g)];

          let affected = 0;
          let paramCursor = 0;

          const tupleCount =
            tupleMatches.length > 0
              ? tupleMatches.length
              : Math.max(1, Math.floor(params.length / cols.length));

          for (let tIdx = 0; tIdx < tupleCount; tIdx++) {
            const record: Record<string, any> = {};
            const rawTuple = tupleMatches[tIdx]?.[1];
            const valueTokens = rawTuple
              ? (rawTuple.match(/(?:'[^']*'|[^,]+)+/g)?.map(tok => tok.trim()) || [])
              : [];

            cols.forEach((col, i) => {
              const token = valueTokens[i];
              if (token !== undefined && token !== '?') {
                if (/^'.*'$/.test(token) || /^".*"$/.test(token)) {
                  record[col] = token.slice(1, -1);
                } else if (token.toUpperCase() === 'NULL') {
                  record[col] = null;
                } else {
                  const num = Number(token);
                  record[col] = Number.isNaN(num) ? token : num;
                }
              } else {
                const paramVal = params[paramCursor++];
                record[col] = paramVal !== undefined ? paramVal : null;
              }
            });

            memoryDb.validateForeignKeysOnInsert(table, record);

            const pkCol = table === 'document_sequences' ? 'document_type' : 'id';
            const pkVal = record[pkCol];

            const existingIdx = pkVal !== undefined && pkVal !== null
              ? rows.findIndex(r => r[pkCol] === pkVal)
              : -1;

            if (existingIdx >= 0) {
              if (conflictMode === 'REPLACE' || hasOnConflictUpdate) {
                rows[existingIdx] = { ...rows[existingIdx], ...record };
                affected++;
              } else if (conflictMode === 'IGNORE' || hasOnConflictNothing) {
                // Ignorer silencieusement sur INSERT OR IGNORE
              } else {
                throw new Error(`UNIQUE constraint failed: ${table}.${pkCol} (${String(pkVal)})`);
              }
            } else {
              rows.push(record);
              affected++;
            }
          }

          memoryDb.saveToStorage();
          return { rowsAffected: affected };
        }
      }
    }

    // 2. UPDATE table SET col1 = ?, col2 = ? WHERE ...
    if (upper.startsWith('UPDATE')) {
      const match = query.match(/UPDATE\s+([a-zA-Z0-9_]+)\s+SET\s+(.+?)(?:\s+WHERE\s+(.+))?$/is);
      if (match) {
        const table = match[1].toLowerCase();
        const setClause = match[2];
        const whereClause = match[3] || '';
        const rows = memoryDb.getTable(table);
        let updatedCount = 0;

        const assignments = setClause.match(/(?:[^,(]|\([^)]*\))+/g)?.map(a => a.trim()) || [setClause.trim()];
        let paramIdx = 0;
        const setAssignments: Array<{ col: string; val?: any; func?: (oldVal: any) => any }> = [];

        for (const assign of assignments) {
          const parts = assign.split('=');
          const col = parts[0].trim().toLowerCase();
          const rhs = parts.slice(1).join('=').trim();
          if (rhs === '?') {
            setAssignments.push({ col, val: params[paramIdx++] });
          } else if (/MAX\s*\(\s*0\s*,\s*([a-zA-Z0-9_]+)\s*-\s*\?\s*\)/i.test(rhs)) {
            const decr = Number(params[paramIdx++]) || 0;
            setAssignments.push({ col, func: (oldVal: any) => Math.max(0, (Number(oldVal) || 0) - decr) });
          } else if (/MAX\s*\(\s*0\s*,\s*([a-zA-Z0-9_]+)\s*\+\s*\?\s*\)/i.test(rhs)) {
            const incr = Number(params[paramIdx++]) || 0;
            setAssignments.push({ col, func: (oldVal: any) => Math.max(0, (Number(oldVal) || 0) + incr) });
          } else {
            const literalVal = rhs.replace(/^['"]|['"]$/g, '');
            const num = Number(literalVal);
            setAssignments.push({ col, val: isNaN(num) ? literalVal : num });
          }
        }

        const whereValues = params.slice(paramIdx);
        const whereParamMatches = [...whereClause.matchAll(/([a-zA-Z0-9_]+)\s*=\s*\?/g)];
        const isNullMatches = [...whereClause.matchAll(/([a-zA-Z0-9_]+)\s+IS\s+NULL/gi)];

        for (const row of rows) {
          let matches = true;
          if (whereParamMatches.length > 0) {
            for (let i = 0; i < whereParamMatches.length; i++) {
              const col = whereParamMatches[i][1].toLowerCase();
              if (row[col] != whereValues[i]) {
                matches = false;
                break;
              }
            }
          }
          if (matches && isNullMatches.length > 0) {
            for (const m of isNullMatches) {
              const col = m[1].toLowerCase();
              if (row[col] !== null && row[col] !== undefined && row[col] !== '') {
                matches = false;
                break;
              }
            }
          }

          if (matches) {
            for (const item of setAssignments) {
              if (item.func) {
                row[item.col] = item.func(row[item.col]);
              } else {
                row[item.col] = item.val;
              }
            }
            updatedCount++;
          }
        }

        memoryDb.saveToStorage();
        return { rowsAffected: updatedCount };
      }
    }

    // 3. DELETE FROM table [WHERE id = ?]
    if (upper.startsWith('DELETE FROM')) {
      const match = query.match(/DELETE\s+FROM\s+([a-zA-Z0-9_]+)(?:\s+WHERE\s+(.+))?/i);
      if (match) {
        const table = match[1].toLowerCase();
        const rows = memoryDb.getTable(table);
        const initialLen = rows.length;
        const whereClause = match[2];

        if (!whereClause) {
          const toDelete = [...rows];
          memoryDb.handleForeignKeysOnDelete(table, toDelete);
          const tableRef = memoryDb.getTable(table);
          tableRef.length = 0;
          memoryDb.saveToStorage();
          return { rowsAffected: initialLen };
        }

        const whereColMatch = whereClause.match(/([a-zA-Z0-9_]+)\s*=/);
        const colName = whereColMatch ? whereColMatch[1].toLowerCase() : 'id';
        const targetVal = params[0];
        const toDelete = rows.filter(r => r[colName] === targetVal);
        memoryDb.handleForeignKeysOnDelete(table, toDelete);

        const filtered = rows.filter(r => r[colName] !== targetVal);
        const tableRef = memoryDb.getTable(table);
        tableRef.length = 0;
        tableRef.push(...filtered);

        memoryDb.saveToStorage();
        return { rowsAffected: initialLen - filtered.length };
      }
    }

    return { rowsAffected: 1 };
  }

  public async select<T = any>(query: string, params: any[] = []): Promise<T[]> {
    await this.ensureInitialized();

    const adapter = this.getActiveAdapter();
    if (adapter) {
      return await adapter.select(query, params);
    }

    const trimmed = query.trim();
    const upper = trimmed.toUpperCase();

    if (upper.startsWith('PRAGMA FOREIGN_KEY_CHECK')) {
      return memoryDb.checkAllForeignKeys() as unknown as T[];
    }

    const match = query.match(/FROM\s+([a-zA-Z0-9_]+)/i);
    if (!match) return [];

    const table = match[1].toLowerCase();
    let rows = [...memoryDb.getTable(table)];

    // Filtre WHERE
    if (upper.includes('WHERE')) {
      const wherePart = query.substring(upper.indexOf('WHERE') + 5).split(/ORDER BY|LIMIT/i)[0];

      // 1. Colonnes avec paramètres positionnels: col = ?
      const paramMatches = [...wherePart.matchAll(/([a-zA-Z0-9_]+)\s*=\s*\?/g)];
      if (paramMatches.length > 0 && params.length >= paramMatches.length) {
        paramMatches.forEach((m, idx) => {
          const col = m[1].toLowerCase();
          const val = params[idx];
          rows = rows.filter(r => r[col] == val);
        });
      }

      // 2. Littéraux chaîne: status = 'OPEN'
      const literalMatches = [...wherePart.matchAll(/([a-zA-Z0-9_]+)\s*=\s*'([^']+)'/g)];
      for (const m of literalMatches) {
        const col = m[1].toLowerCase();
        const val = m[2];
        rows = rows.filter(r => r[col] === val);
      }

      // 3. Clause IN: role IN ('manager', 'owner', 'admin')
      const inMatches = [...wherePart.matchAll(/([a-zA-Z0-9_]+)\s+IN\s*\(([^)]+)\)/gi)];
      for (const m of inMatches) {
        const col = m[1].toLowerCase();
        const values = m[2].split(',').map(v => v.trim().replace(/^['"]|['"]$/g, ''));
        rows = rows.filter(r => values.includes(r[col]));
      }

      // 4. Littéral numérique: is_active = 1
      if (/is_active\s*=\s*1/i.test(wherePart)) {
        rows = rows.filter(r => r.is_active === 1 || r.is_active === true);
      }

      // 5. Comparateur stock: current_stock > 0
      if (/current_stock\s*>\s*0/i.test(wherePart)) {
        rows = rows.filter(r => (r.current_stock || 0) > 0);
      }
    }

    // Support SELECT COUNT(*) [AS alias]
    const countMatch = query.match(/SELECT\s+COUNT\s*\(\s*\*\s*\)(?:\s+AS\s+([a-zA-Z0-9_]+))?/i);
    if (countMatch) {
      const alias = countMatch[1] || 'count';
      return [{ [alias]: rows.length, 'COUNT(*)': rows.length } as unknown as T];
    }

    // Tri ORDER BY
    if (upper.includes('ORDER BY EXPIRATION_DATE ASC')) {
      rows.sort((a, b) => (a.expiration_date || '').localeCompare(b.expiration_date || ''));
    } else if (upper.includes('ORDER BY CREATED_AT DESC') || upper.includes('ORDER BY OPENED_AT DESC')) {
      rows.sort((a, b) => (b.created_at || b.opened_at || '').localeCompare(a.created_at || a.opened_at || ''));
    } else if (upper.includes('ORDER BY NAME ASC') || upper.includes('ORDER BY NAME_FR ASC')) {
      rows.sort((a, b) => (a.name || a.name_fr || '').localeCompare(b.name || b.name_fr || ''));
    }

    // Limite LIMIT
    const limitMatch = query.match(/LIMIT\s+(\d+)/i);
    if (limitMatch) {
      const limit = parseInt(limitMatch[1], 10);
      rows = rows.slice(0, limit);
    }

    return rows as T[];
  }

  public async resetTransactionsOnly(): Promise<void> {
    const adapter = this.getActiveAdapter();
    if (adapter) {
      const txTables = [
        'sync_operations', 'audit_logs', 'commercial_documents',
        'refund_items', 'refunds', 'payments', 'sale_items', 'sales',
        'supplier_payments', 'customer_payments', 'expenses',
        'inventory_movements', 'purchase_items', 'purchases', 'cash_sessions'
      ];
      for (const t of txTables) {
        await adapter.execute(`DELETE FROM ${t}`);
      }
      await adapter.execute('UPDATE customers SET current_debt = 0');
      await adapter.execute('UPDATE suppliers SET current_balance = 0');
    } else {
      memoryDb.resetTransactionsOnly();
    }
  }

  public async resetAll(): Promise<void> {
    const adapter = this.getActiveAdapter();
    if (adapter) {
      // Ordre topologique inverse strict : tables enfants d'abord, tables parentes ensuite
      const allTablesReverseOrder = [
        'sync_operations', 'audit_logs', 'commercial_documents',
        'refund_items', 'refunds', 'payments', 'sale_items', 'sales',
        'supplier_payments', 'customer_payments', 'expenses',
        'inventory_movements', 'purchase_items', 'purchases',
        'cash_sessions', 'product_batches', 'recipe_items',
        'products', 'users', 'document_sequences', 'store_needs',
        'pizza_supplements', 'ingredients', 'customers', 'suppliers',
        'brands', 'categories', 'permissions', 'roles', 'stores'
      ];
      for (const t of allTablesReverseOrder) {
        try {
          await adapter.execute(`DELETE FROM ${t}`);
        } catch (err: any) {
          const msg = String(err?.message || err || '');
          if (!msg.includes('no such table')) {
            console.warn(`[resetAll] Impossible de vider la table ${t}:`, err);
          }
        }
      }
      // Ré-initialiser les catégories et séquences structurelles de base
      await this.ensureEssentialStructure(adapter);

      if (typeof window !== 'undefined') {
        localStorage.removeItem('pizzeria_setup_completed');
        localStorage.removeItem('aquadro_setup_completed');
        localStorage.removeItem('pizzeria_defaults_cleaned_v1_0_2');
        localStorage.removeItem('pizzeria_pizza_supplements');
        localStorage.removeItem('aquadro_drawer_logs');
        localStorage.removeItem('pizzeria_store_needs');
        localStorage.removeItem('pizzeria_expenses');
      }
    } else {
      memoryDb.resetAll();
    }
  }

  public async resetTestCatalogAndSales(): Promise<void> {
    const testTables = [
      'refund_items', 'refunds', 'payments', 'sale_items', 'sales',
      'inventory_movements', 'expenses', 'store_needs', 'cash_sessions',
      'commercial_documents', 'recipe_items', 'product_batches', 'products',
      'pizza_supplements'
    ];
    const adapter = this.getActiveAdapter();
    if (adapter) {
      for (const t of testTables) {
        try {
          await adapter.execute(`DELETE FROM ${t}`);
        } catch (err) {
          console.warn(`[resetTestCatalogAndSales] Erreur table ${t}:`, err);
        }
      }
    } else {
      for (const t of testTables) {
        (memoryDb as any).tables[t] = [];
      }
      memoryDb.saveToStorage();
    }
    if (typeof window !== 'undefined') {
      localStorage.removeItem('pizzeria_pizza_supplements');
      localStorage.removeItem('pizzeria_store_needs');
      localStorage.removeItem('pizzeria_expenses');
      localStorage.removeItem('aquadro_drawer_logs');
    }
  }

  public getRawStore() {
    return memoryDb;
  }
}

export const db = DatabaseService.getInstance();

