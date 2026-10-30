import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
// @ts-ignore - node:sqlite is built-in in Node.js 22+
import { DatabaseSync } from 'node:sqlite';
import { db, SqlAdapter, QueryResult } from '../src/db/sqlite';
import {
  backupService,
  BACKUP_SCHEMA_VERSION,
  BACKUP_FORMAT_IDENTIFIER
} from '../src/services/backup.service';
import { authService, verifyPinCredential } from '../src/services/auth.service';
import { SecurityUtil as HashUtil } from '../src/utils/security';

const SCHEMA_SQL_PATH = path.resolve(__dirname, '../src/db/schema.sql');
const SCHEMA_SQL = fs.readFileSync(SCHEMA_SQL_PATH, 'utf8');

/**
 * Applique la migration Gate 1C exacte de `src-tauri/src/migrations.rs` :
 * Reconstruction des tables `products` et `product_batches` avec `CHECK(current_stock >= 0.0)`.
 */
function applyGate1CMigration(rawDb: InstanceType<typeof DatabaseSync>) {
  const existingCheck = rawDb
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='products' AND sql LIKE '%CHECK(current_stock >= 0.0)%'"
    )
    .get();
  if (existingCheck) {
    return;
  }

  rawDb.exec('PRAGMA foreign_keys = OFF;');
  rawDb.exec('BEGIN TRANSACTION;');
  rawDb.exec('PRAGMA legacy_alter_table = ON;');

  rawDb.exec(`
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
    );
  `);
  rawDb.exec('INSERT INTO new_products SELECT * FROM products;');
  rawDb.exec('DROP TABLE products;');
  rawDb.exec('ALTER TABLE new_products RENAME TO products;');
  rawDb.exec('CREATE INDEX IF NOT EXISTS idx_prod_barcode ON products(barcode);');
  rawDb.exec('CREATE INDEX IF NOT EXISTS idx_prod_sku ON products(sku);');
  rawDb.exec('CREATE INDEX IF NOT EXISTS idx_prod_cat ON products(category_id);');

  rawDb.exec(`
    CREATE TABLE IF NOT EXISTS new_product_batches (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      batch_number TEXT NOT NULL,
      expiration_date TEXT NOT NULL,
      current_stock REAL NOT NULL DEFAULT 0.0 CHECK(current_stock >= 0.0),
      purchase_cost INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
  `);
  rawDb.exec('INSERT INTO new_product_batches SELECT * FROM product_batches;');
  rawDb.exec('DROP TABLE product_batches;');
  rawDb.exec('ALTER TABLE new_product_batches RENAME TO product_batches;');
  rawDb.exec(
    'CREATE INDEX IF NOT EXISTS idx_batch_fefo ON product_batches(product_id, expiration_date ASC);'
  );

  rawDb.exec('PRAGMA legacy_alter_table = OFF;');
  rawDb.exec('COMMIT;');
  rawDb.exec('PRAGMA foreign_keys = ON;');
}

/**
 * Crée un adaptateur SQLite réel basé sur `node:sqlite` (DatabaseSync)
 * sur un fichier temporaire isolé dans `os.tmpdir()`, avec le schéma réel
 * `src/db/schema.sql`, les migrations Rust (incluant Gate 1C CHECK(current_stock >= 0.0))
 * et `PRAGMA foreign_keys = ON`.
 */
function createRealSqliteFileAdapter(dbFilePath: string): {
  adapter: SqlAdapter;
  rawDb: InstanceType<typeof DatabaseSync>;
  close: () => void;
} {
  const rawDb = new DatabaseSync(dbFilePath);

  rawDb.exec('PRAGMA journal_mode = WAL;');
  rawDb.exec('PRAGMA foreign_keys = ON;');
  rawDb.exec('PRAGMA busy_timeout = 5000;');

  // 1. Exécuter le schéma SQL principal (src/db/schema.sql)
  rawDb.exec(SCHEMA_SQL);

  // 2. Appliquer la migration Gate 1C exacte de src-tauri/src/migrations.rs
  applyGate1CMigration(rawDb);

  // 3. Appliquer les colonnes additionnelles de compatibilité (src-tauri/src/db.rs + src/db/sqlite.ts)
  const migrationStatements = [
    "ALTER TABLE stores ADD COLUMN name_fr TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE stores ADD COLUMN name_ar TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE stores ADD COLUMN wilaya TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE stores ADD COLUMN commune TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE stores ADD COLUMN email TEXT",
    "ALTER TABLE stores ADD COLUMN fiscal_regime TEXT NOT NULL DEFAULT 'IFU'",
    "ALTER TABLE stores ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1",
    'ALTER TABLE products ADD COLUMN image_url TEXT',
    'ALTER TABLE sale_items ADD COLUMN product_name TEXT',
    'ALTER TABLE sale_items ADD COLUMN supplements TEXT',
    'ALTER TABLE sale_items ADD COLUMN notes TEXT'
  ];
  for (const stmt of migrationStatements) {
    try {
      rawDb.exec(stmt);
    } catch {
      // Colonne déjà existante
    }
  }

  const adapter: SqlAdapter = {
    async execute(query: string, params: any[] = []): Promise<QueryResult> {
      const trimmed = query.trim();
      const upper = trimmed.toUpperCase();

      if (
        upper === 'BEGIN' ||
        upper.startsWith('BEGIN IMMEDIATE') ||
        upper.startsWith('BEGIN TRANSACTION') ||
        upper === 'COMMIT' ||
        upper === 'END TRANSACTION' ||
        upper === 'ROLLBACK' ||
        upper.startsWith('PRAGMA') ||
        upper.startsWith('CREATE TABLE') ||
        upper.startsWith('ALTER TABLE')
      ) {
        if (params.length === 0) {
          rawDb.exec(trimmed);
          return { rowsAffected: 0 };
        }
      }

      const stmt = rawDb.prepare(trimmed);
      const normalizedParams = params.map(p => (p === undefined ? null : p));
      const result = stmt.run(...normalizedParams);
      return {
        rowsAffected: Number(result.changes ?? 0),
        lastInsertId: Number(result.lastInsertRowid ?? 0)
      };
    },
    async select<T = any>(query: string, params: any[] = []): Promise<T[]> {
      const stmt = rawDb.prepare(query.trim());
      const normalizedParams = params.map(p => (p === undefined ? null : p));
      const rows = stmt.all(...normalizedParams);
      return rows as T[];
    }
  };

  return {
    adapter,
    rawDb,
    close: () => {
      try {
        rawDb.close();
      } catch {}
    }
  };
}

function removeTempDbFiles(dbFilePath: string) {
  for (const suffix of ['', '-wal', '-shm']) {
    const target = `${dbFilePath}${suffix}`;
    try {
      if (fs.existsSync(target)) {
        fs.unlinkSync(target);
      }
    } catch {}
  }
}

/**
 * Peuple la base SQLite active avec un jeu complet et représentatif de données métier
 * couvrant les tables critiques du schéma réel `src/db/schema.sql` et leurs relations FK.
 * Les PINs sont hachés avec le format réel Salted SHA-256 (`<salt>:<64-hex-chars>`).
 */
async function seedRepresentativeBusinessDatabase() {
  const now = '2026-03-15T10:00:00.000Z';
  const ownerPinHash = await HashUtil.hashCredential('849201');
  const cashierPinHash = await HashUtil.hashCredential('258369');

  // 1. Store
  await db.execute(
    `INSERT INTO stores (
      id, name_fr, name_ar, wilaya, commune, address, phone, email,
      rc_number, nif_number, nis_number, ai_number, fiscal_regime,
      default_tva_rate, receipt_header, receipt_footer, currency, is_active,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'store-prod-01',
      'Pizzeria Napoli Hydra',
      'بيتزا نابولي حيدرة',
      '16 - Alger',
      'Hydra',
      '12 Rue Parmentier, Hydra, Alger',
      '0555112233',
      'contact@napoli.dz',
      '16/00-9988776B20',
      '002016099887766',
      '1020160998877',
      '16019988776',
      'REEL',
      9.0,
      'Bienvenue chez Napoli Hydra',
      'Merci de votre fidélité !',
      'DZD',
      1,
      now,
      now
    ]
  );

  // 2. Users (Owner + Cashier) avec hachage réel Salted SHA-256
  await db.execute(
    `INSERT INTO users (
      id, store_id, name, role, pin_hash, phone, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'usr-owner-prod',
      'store-prod-01',
      'Karim Mansouri',
      'owner',
      ownerPinHash,
      '0555112233',
      1,
      now,
      now
    ]
  );

  await db.execute(
    `INSERT INTO users (
      id, store_id, name, role, pin_hash, phone, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'usr-cashier-prod',
      'store-prod-01',
      'Yacine Caissier',
      'cashier',
      cashierPinHash,
      '0555445566',
      1,
      now,
      now
    ]
  );

  // 3. Categories & Brands
  await db.execute(
    `INSERT OR REPLACE INTO categories (id, name_fr, name_ar, created_at) VALUES (?, ?, ?, ?)`,
    ['cat-pizza', 'Pizzas Artisanales', 'بيتزا تقليدية', now]
  );
  await db.execute(
    `INSERT OR REPLACE INTO categories (id, name_fr, name_ar, created_at) VALUES (?, ?, ?, ?)`,
    ['cat-dessert', 'Desserts Maison', 'حلويات منزلية', now]
  );
  await db.execute(`INSERT INTO brands (id, name, created_at) VALUES (?, ?, ?)`, [
    'brd-napoli',
    'Maison Napoli',
    now
  ]);

  // 4. Products & Batches
  await db.execute(
    `INSERT INTO products (
      id, store_id, category_id, brand_id, sku, barcode, additional_barcodes,
      name_fr, name_ar, variant, size_weight, unit_of_measure, box_conversion_ratio,
      purchase_cost, selling_price_ttc, min_selling_price_ttc, tva_rate,
      current_stock, min_stock_alert, image_url, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'prd-burrata-01',
      'store-prod-01',
      'cat-pizza',
      'brd-napoli',
      'PZ-BUR-01',
      '613000990001',
      '[]',
      'Pizza Burrata Truffe',
      'بيتزا بوراتا تروف',
      'Grande',
      '450g',
      'UNIT',
      1.0,
      65000,
      145000,
      130000,
      9.0,
      42.0,
      5.0,
      '/pizzeria-logo.jpg',
      1,
      now,
      now
    ]
  );

  await db.execute(
    `INSERT INTO product_batches (
      id, product_id, batch_number, expiration_date, current_stock, purchase_cost, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['bch-burrata-01', 'prd-burrata-01', 'LOT-2026-03', '2026-12-31', 42.0, 65000, now]
  );

  // 5. Ingredients, Recipe Items & Pizza Supplements
  await db.execute(
    `INSERT INTO ingredients (
      id, name_fr, name_ar, unit, current_stock, min_stock_alert, cost_per_unit, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'ing-mozzarella-01',
      'Mozzarella Fior di Latte',
      'موزاريلا',
      'kg',
      18.5,
      3.0,
      1400,
      1,
      now,
      now
    ]
  );

  await db.execute(
    `INSERT INTO recipe_items (
      id, product_id, ingredient_id, quantity_required, unit_display, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)`,
    ['rcp-burrata-mozza', 'prd-burrata-01', 'ing-mozzarella-01', 0.18, '180g', now]
  );

  await db.execute(
    `INSERT INTO pizza_supplements (
      id, name_fr, name_ar, purchase_cost, price, current_stock, min_stock_alert, category, is_active, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'sup-cheddar-01',
      'Supplément Cheddar Affiné',
      'شيدر إضافي',
      6000,
      15000,
      80.0,
      10.0,
      'FROMAGE',
      1,
      now
    ]
  );

  // 6. Store Needs
  await db.execute(
    `INSERT INTO store_needs (
      id, item_name, quantity_needed, urgency, notes, requested_by, status, created_at, completed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'need-boites-33',
      'Boîtes à pizza 33cm kraft',
      '500 unités',
      'HIGH',
      'Commande urgente',
      'Yacine Caissier',
      'PENDING',
      now,
      null
    ]
  );

  // 7. Suppliers, Purchases & Purchase Items
  await db.execute(
    `INSERT INTO suppliers (
      id, name, contact_person, phone, email, rc_number, nif_number, current_balance, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'sup-italfood-01',
      'ItalFood Algérie Distribution',
      'M. Rossi',
      '021998877',
      'contact@italfood.dz',
      '16/00-1122334B19',
      '001916011223344',
      2500000,
      now
    ]
  );

  await db.execute(
    `INSERT INTO purchases (
      id, supplier_id, order_number, total_cost, status, ordered_at, received_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['pur-2026-001', 'sup-italfood-01', 'BL-ITAL-889', 5000000, 'RECEIVED', now, now]
  );

  await db.execute(
    `INSERT INTO purchase_items (
      id, purchase_id, product_id, quantity_ordered, quantity_received, purchase_cost, batch_number, expiration_date
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'puri-2026-001',
      'pur-2026-001',
      'prd-burrata-01',
      50.0,
      50.0,
      65000,
      'LOT-2026-03',
      '2026-12-31'
    ]
  );

  // 8. Customers & Customer Payments
  await db.execute(
    `INSERT INTO customers (
      id, name, phone, wilaya, notes, credit_limit, current_debt, loyalty_points, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'cus-amine-01',
      'Amine Benali',
      '0661223344',
      '16 - Alger',
      'Client fidèle livraison',
      500000,
      145000,
      35,
      now
    ]
  );

  await db.execute(
    `INSERT INTO customer_payments (
      id, customer_id, amount, payment_method, reference, cashier_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['cpay-001', 'cus-amine-01', 100000, 'CASH', 'VERSEMENT-ACOMPTE', 'usr-owner-prod', now]
  );

  // 9. Cash Session, Sales, Sale Items, Payments, Refunds & Refund Items
  await db.execute(
    `INSERT INTO cash_sessions (
      id, cashier_id, cashier_name, opened_at, closed_at, status,
      opening_float, total_cash_sales, total_card_sales, total_qr_sales,
      total_credit_sales, total_cash_refunds, total_cash_expenses,
      expected_cash_drawer, actual_counted_cash, cash_discrepancy,
      closing_notes, closed_by_manager_name
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'ses-2026-001',
      'usr-owner-prod',
      'Karim Mansouri',
      now,
      null,
      'OPEN',
      500000,
      290000,
      0,
      0,
      0,
      20000,
      0,
      770000,
      null,
      null,
      'Service midi',
      null
    ]
  );

  await db.execute(
    `INSERT INTO sales (
      id, receipt_number, session_id, cashier_id, customer_id,
      subtotal_ht, discount_amount, tax_amount, total_ttc,
      status, idempotency_key, sync_status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'sal-2026-0001',
      'TK-2026-000001',
      'ses-2026-001',
      'usr-owner-prod',
      'cus-amine-01',
      266055,
      0,
      23945,
      290000,
      'COMPLETED',
      'idem-sal-2026-0001',
      'PENDING',
      now
    ]
  );

  await db.execute(
    `INSERT INTO sale_items (
      id, sale_id, product_id, product_name, batch_id, quantity,
      unit_price_ttc, discount_amount, total_ttc, unit_purchase_cost_snapshot,
      supplements, notes, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'sali-2026-0001',
      'sal-2026-0001',
      'prd-burrata-01',
      'Pizza Burrata Truffe',
      'bch-burrata-01',
      2.0,
      145000,
      0,
      290000,
      65000,
      JSON.stringify([{ id: 'sup-cheddar-01', name_fr: 'Supplément Cheddar Affiné', price: 15000 }]),
      'Bien cuite',
      now
    ]
  );

  await db.execute(
    `INSERT INTO payments (
      id, sale_id, payment_method, amount, tendered_amount, change_given, tpe_auth_reference, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ['pay-2026-0001', 'sal-2026-0001', 'CASH', 290000, 300000, 10000, null, now]
  );

  await db.execute(
    `INSERT INTO refunds (
      id, original_sale_id, receipt_number, cashier_id, refund_amount, payment_method, reason, authorized_by_pin, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'ref-2026-0001',
      'sal-2026-0001',
      'AV-2026-000001',
      'usr-owner-prod',
      20000,
      'CASH',
      'Erreur commande boisson',
      '849201',
      now
    ]
  );

  await db.execute(
    `INSERT INTO refund_items (
      id, refund_id, sale_item_id, product_id, quantity, refund_price, unit_purchase_price, restock_inventory
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ['refi-2026-0001', 'ref-2026-0001', 'sali-2026-0001', 'prd-burrata-01', 1.0, 20000, 65000, 1]
  );

  // 10. Inventory Movements, Expenses, Commercial Documents, Sequences, Audit Logs, Sync Operations
  await db.execute(
    `INSERT INTO inventory_movements (
      id, product_id, batch_id, movement_type, quantity_change, previous_stock, new_stock,
      reference_id, reason, unit_cost_snapshot, user_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'mov-2026-0001',
      'prd-burrata-01',
      'bch-burrata-01',
      'SALE',
      -2.0,
      44.0,
      42.0,
      'sal-2026-0001',
      'Vente comptoir',
      65000,
      'usr-owner-prod',
      now
    ]
  );

  await db.execute(
    `INSERT INTO expenses (
      id, category, amount, payment_method, description, date, user_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'exp-2026-0001',
      'UTILITIES',
      450000,
      'CASH',
      'Facture Sonelgaz Mars',
      '2026-03-15',
      'usr-owner-prod',
      now
    ]
  );

  await db.execute(
    `INSERT INTO commercial_documents (
      id, document_type, document_number, reference_id, customer_or_supplier_name, total_ttc, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['doc-2026-0001', 'FACTURE', 'FAC-2026-000015', 'sal-2026-0001', 'Amine Benali', 290000, now]
  );

  await db.execute(
    `INSERT OR REPLACE INTO document_sequences (document_type, current_year, last_sequence_number)
     VALUES ('TICKET', 2026, 48), ('FACTURE', 2026, 15)`
  );

  await db.execute(
    `INSERT INTO audit_logs (
      id, user_id, user_name, action, entity_type, entity_id, details, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'aud-seed-0001',
      'usr-owner-prod',
      'Karim Mansouri',
      'CREATE_SALE',
      'sales',
      'sal-2026-0001',
      '{"total_ttc":290000}',
      now
    ]
  );

  await db.execute(
    `INSERT INTO sync_operations (
      id, table_name, record_id, action, payload, status, retry_count, last_error, created_at, synced_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'sync-seed-0001',
      'sales',
      'sal-2026-0001',
      'INSERT',
      '{"id":"sal-2026-0001"}',
      'PENDING',
      0,
      null,
      now,
      null
    ]
  );
}

describe('PHASE 1 — Safe JSON Backup, Restore, Setup Lifecycle & Blocker Remediation', () => {
  let tempDbPathA = '';
  let tempDbPathB = '';
  let handleA: ReturnType<typeof createRealSqliteFileAdapter> | null = null;
  let handleB: ReturnType<typeof createRealSqliteFileAdapter> | null = null;

  beforeEach(async () => {
    const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    tempDbPathA = path.join(os.tmpdir(), `aquadro_phase1_testA_${uniqueSuffix}.db`);
    tempDbPathB = path.join(os.tmpdir(), `aquadro_phase1_testB_${uniqueSuffix}.db`);

    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
    await authService.logout();

    handleA = createRealSqliteFileAdapter(tempDbPathA);
    await db.setCustomAdapter(handleA.adapter);
  });

  afterEach(async () => {
    await authService.logout();
    await db.setCustomAdapter(null);
    if (handleA) {
      handleA.close();
      handleA = null;
    }
    if (handleB) {
      handleB.close();
      handleB = null;
    }
    removeTempDbFiles(tempDbPathA);
    removeTempDbFiles(tempDbPathB);
  });

  it('Test 1: Full export and restore round-trip across all business-critical tables & app settings', async () => {
    await seedRepresentativeBusinessDatabase();

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(
        'aquadro_receipt_template_config',
        JSON.stringify({ storeName: 'Napoli Hydra', showQrCode: true })
      );
      localStorage.setItem(
        'aquadro_kitchen_ticket_template_config',
        JSON.stringify({ title: 'BON CUISINE NAPOLI' })
      );
      localStorage.setItem(
        'aquadro_printer_config',
        JSON.stringify({ paperWidth: '80mm', autoPrintReceipt: true })
      );
      localStorage.setItem(
        'aquadro_store_logo',
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA'
      );
      localStorage.setItem('pizzeria_delivery_fee', '250');
    }

    const exportMeta = await backupService.exportJsonBackup();
    expect(exportMeta.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
    expect(exportMeta.jsonContent).toBeTruthy();

    const parsedExport = JSON.parse(exportMeta.jsonContent!);
    expect(parsedExport._backup_meta.format).toBe(BACKUP_FORMAT_IDENTIFIER);

    // Vérifier que les 4 tables auparavant omises (ingredients, recipe_items, pizza_supplements, store_needs) sont bien exportées
    expect(parsedExport.ingredients).toHaveLength(1);
    expect(parsedExport.recipe_items).toHaveLength(1);
    expect(parsedExport.pizza_supplements).toHaveLength(1);
    expect(parsedExport.store_needs).toHaveLength(1);

    // Basculer sur une base SQLite B vierge (installation propre)
    handleB = createRealSqliteFileAdapter(tempDbPathB);
    await db.setCustomAdapter(handleB.adapter);
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }

    // Restaurer dans la base B
    const restored = await backupService.restoreBackup(exportMeta.jsonContent!, undefined, {
      fromSetup: true
    });
    expect(restored).toBe(true);

    // Vérifier les enregistrements, les IDs d'origine et les relations dans la base B
    const stores = await db.select('SELECT * FROM stores');
    expect(stores).toHaveLength(1);
    expect(stores[0].id).toBe('store-prod-01');
    expect(stores[0].name_fr).toBe('Pizzeria Napoli Hydra');
    expect(stores[0].email).toBe('contact@napoli.dz');

    const users = await db.select('SELECT * FROM users ORDER BY id ASC');
    expect(users).toHaveLength(2);
    expect(users.map((u: any) => u.id)).toEqual(['usr-cashier-prod', 'usr-owner-prod']);
    expect(users.every((u: any) => u.store_id === 'store-prod-01')).toBe(true);
    expect(users.every((u: any) => HashUtil.isValidSaltedSha256Hash(u.pin_hash))).toBe(true);

    const products = await db.select('SELECT * FROM products WHERE id = ?', ['prd-burrata-01']);
    expect(products).toHaveLength(1);
    expect(products[0].name_fr).toBe('Pizza Burrata Truffe');
    expect(products[0].selling_price_ttc).toBe(145000);
    expect(products[0].store_id).toBe('store-prod-01');

    const batches = await db.select('SELECT * FROM product_batches WHERE id = ?', [
      'bch-burrata-01'
    ]);
    expect(batches).toHaveLength(1);
    expect(batches[0].current_stock).toBe(42.0);

    const ingredients = await db.select('SELECT * FROM ingredients WHERE id = ?', [
      'ing-mozzarella-01'
    ]);
    expect(ingredients).toHaveLength(1);
    expect(ingredients[0].current_stock).toBe(18.5);

    const recipes = await db.select('SELECT * FROM recipe_items WHERE id = ?', [
      'rcp-burrata-mozza'
    ]);
    expect(recipes).toHaveLength(1);
    expect(recipes[0].quantity_required).toBe(0.18);

    const supplements = await db.select('SELECT * FROM pizza_supplements WHERE id = ?', [
      'sup-cheddar-01'
    ]);
    expect(supplements).toHaveLength(1);
    expect(supplements[0].price).toBe(15000);

    const storeNeeds = await db.select('SELECT * FROM store_needs WHERE id = ?', [
      'need-boites-33'
    ]);
    expect(storeNeeds).toHaveLength(1);
    expect(storeNeeds[0].urgency).toBe('HIGH');

    const suppliers = await db.select('SELECT * FROM suppliers WHERE id = ?', ['sup-italfood-01']);
    expect(suppliers).toHaveLength(1);

    const purchases = await db.select('SELECT * FROM purchases WHERE id = ?', ['pur-2026-001']);
    expect(purchases).toHaveLength(1);

    const purchaseItems = await db.select('SELECT * FROM purchase_items WHERE id = ?', [
      'puri-2026-001'
    ]);
    expect(purchaseItems).toHaveLength(1);

    const customers = await db.select('SELECT * FROM customers WHERE id = ?', ['cus-amine-01']);
    expect(customers).toHaveLength(1);
    expect(customers[0].current_debt).toBe(145000);

    const customerPayments = await db.select('SELECT * FROM customer_payments WHERE id = ?', [
      'cpay-001'
    ]);
    expect(customerPayments).toHaveLength(1);

    const sales = await db.select('SELECT * FROM sales WHERE id = ?', ['sal-2026-0001']);
    expect(sales).toHaveLength(1);
    expect(sales[0].total_ttc).toBe(290000);

    const saleItems = await db.select('SELECT * FROM sale_items WHERE id = ?', ['sali-2026-0001']);
    expect(saleItems).toHaveLength(1);
    expect(saleItems[0].product_name).toBe('Pizza Burrata Truffe');
    expect(saleItems[0].notes).toBe('Bien cuite');

    const payments = await db.select('SELECT * FROM payments WHERE id = ?', ['pay-2026-0001']);
    expect(payments).toHaveLength(1);

    const refunds = await db.select('SELECT * FROM refunds WHERE id = ?', ['ref-2026-0001']);
    expect(refunds).toHaveLength(1);

    const refundItems = await db.select('SELECT * FROM refund_items WHERE id = ?', [
      'refi-2026-0001'
    ]);
    expect(refundItems).toHaveLength(1);

    const movements = await db.select('SELECT * FROM inventory_movements WHERE id = ?', [
      'mov-2026-0001'
    ]);
    expect(movements).toHaveLength(1);

    const expenses = await db.select('SELECT * FROM expenses WHERE id = ?', ['exp-2026-0001']);
    expect(expenses).toHaveLength(1);

    const sessions = await db.select('SELECT * FROM cash_sessions WHERE id = ?', ['ses-2026-001']);
    expect(sessions).toHaveLength(1);

    const ticketSeq = await db.select(
      'SELECT * FROM document_sequences WHERE document_type = ?',
      ['TICKET']
    );
    expect(ticketSeq[0].last_sequence_number).toBe(48);

    // Vérifier les paramètres applicatifs localStorage restaurés
    if (typeof localStorage !== 'undefined') {
      expect(localStorage.getItem('pizzeria_delivery_fee')).toBe('250');
      expect(localStorage.getItem('aquadro_store_logo')).toContain('data:image/png;base64');
      expect(
        JSON.parse(localStorage.getItem('aquadro_receipt_template_config')!).storeName
      ).toBe('Napoli Hydra');
    }
  });

  it('Test 2: Restore directly from initial setup (Scenario A — fresh install after Windows format)', async () => {
    await seedRepresentativeBusinessDatabase();
    const backupMeta = await backupService.exportJsonBackup();

    handleB = createRealSqliteFileAdapter(tempDbPathB);
    await db.setCustomAdapter(handleB.adapter);
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }

    expect(await db.isSetupCompleted()).toBe(false);

    const ok = await backupService.restoreBackup(backupMeta.jsonContent!, undefined, {
      fromSetup: true
    });
    expect(ok).toBe(true);

    expect(await db.isSetupCompleted()).toBe(true);
    if (typeof localStorage !== 'undefined') {
      expect(localStorage.getItem('pizzeria_setup_completed')).toBe('true');
      expect(localStorage.getItem('aquadro_setup_completed')).toBe('true');
    }

    const ownerUser = await authService.loginWithPin('849201');
    expect(ownerUser).not.toBeNull();
    expect(ownerUser?.id).toBe('usr-owner-prod');
    expect(ownerUser?.role).toBe('owner');
  });

  it('Test 3: Restore after completing setup (Scenario B — temporary setup replaced by restored backup)', async () => {
    await seedRepresentativeBusinessDatabase();
    const productionBackup = await backupService.exportJsonBackup();

    handleB = createRealSqliteFileAdapter(tempDbPathB);
    await db.setCustomAdapter(handleB.adapter);
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }

    await authService.completeSetup({
      store_name_fr: 'Magasin Temporaire Test',
      store_name_ar: 'محل مؤقت',
      address: 'Rue Temporaire',
      wilaya: '16 - Alger',
      commune: 'Alger Centre',
      phone: '0550999999',
      email: 'temp@aquadro.dz',
      rc: 'RC-TEMP',
      nif: 'NIF-TEMP',
      nis: 'NIS-TEMP',
      activity: 'Restauration',
      fiscal_regime: 'IFU',
      tva_rate: 0,
      owner_name: 'Propriétaire Temporaire',
      owner_phone: '0550999999',
      owner_pin: '739182'
    });

    expect(await db.isSetupCompleted()).toBe(true);
    const tempStores = await db.select('SELECT * FROM stores');
    expect(tempStores[0].name_fr).toBe('Magasin Temporaire Test');
    expect(tempStores[0].email).toBe('temp@aquadro.dz');

    // Vérifier que le PIN temporaire est bien stocké sous forme hachée Salted SHA-256 (jamais en clair)
    const tempOwners = await db.select("SELECT * FROM users WHERE role = 'owner'");
    expect(tempOwners).toHaveLength(1);
    expect(tempOwners[0].pin_hash).not.toBe('739182');
    expect(HashUtil.isValidSaltedSha256Hash(tempOwners[0].pin_hash)).toBe(true);

    // Depuis Paramètres, le propriétaire temporaire entre son PIN ('739182') et restaure la sauvegarde de production
    const restored = await backupService.restoreBackup(productionBackup.jsonContent!, '739182');
    expect(restored).toBe(true);

    expect(await db.isSetupCompleted()).toBe(true);
    if (typeof localStorage !== 'undefined') {
      expect(localStorage.getItem('pizzeria_setup_completed')).toBe('true');
      expect(localStorage.getItem('aquadro_setup_completed')).toBe('true');
    }

    const finalStores = await db.select('SELECT * FROM stores');
    expect(finalStores).toHaveLength(1);
    expect(finalStores[0].id).toBe('store-prod-01');
    expect(finalStores[0].name_fr).toBe('Pizzeria Napoli Hydra');

    const finalUsers = await db.select('SELECT * FROM users ORDER BY id ASC');
    expect(finalUsers).toHaveLength(2);
    expect(finalUsers.some((u: any) => u.name === 'Propriétaire Temporaire')).toBe(false);
    expect(finalUsers.some((u: any) => u.name === 'Karim Mansouri')).toBe(true);

    const finalProducts = await db.select('SELECT * FROM products');
    expect(finalProducts).toHaveLength(1);
    expect(finalProducts[0].id).toBe('prd-burrata-01');

    const finalSales = await db.select('SELECT * FROM sales');
    expect(finalSales).toHaveLength(1);
    expect(finalSales[0].receipt_number).toBe('TK-2026-000001');
  });

  it('Test 4 (Blocker 2): Restore failure rollback leaves the existing database and localStorage 100% untouched', async () => {
    await seedRepresentativeBusinessDatabase();
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('pizzeria_delivery_fee', '250');
      localStorage.setItem('aquadro_db_secret_key', '987654');
    }

    // Cas 4a : JSON syntaxiquement corrompu
    await expect(
      backupService.restoreBackup('{ "stores": [ CORRUPTED_JSON ', '849201')
    ).rejects.toThrow(/Format JSON corrompu/i);

    // Cas 4b : Échec SQL au milieu de la transaction (deux produits avec le même SKU/barcode UNIQUE)
    const validMeta = await backupService.exportJsonBackup();
    const payloadWithDuplicateBarcode = JSON.parse(validMeta.jsonContent!);
    payloadWithDuplicateBarcode._app_settings = {
      pizzeria_delivery_fee: '9999'
    };
    payloadWithDuplicateBarcode.products.push({
      ...payloadWithDuplicateBarcode.products[0],
      id: 'prd-duplicate-barcode-fail',
      sku: 'PZ-BUR-01', // Violation contrainte UNIQUE sur sku et barcode après DELETE de toutes les tables !
      barcode: '613000990001'
    });

    await expect(
      backupService.restoreBackup(JSON.stringify(payloadWithDuplicateBarcode), '849201')
    ).rejects.toThrow(/Échec de restauration/i);

    // Vérifier que le ROLLBACK a intégralement préservé la base de données existante et localStorage
    const storesAfterRollback = await db.select('SELECT * FROM stores');
    expect(storesAfterRollback).toHaveLength(1);
    expect(storesAfterRollback[0].id).toBe('store-prod-01');

    const productsAfterRollback = await db.select('SELECT * FROM products');
    expect(productsAfterRollback).toHaveLength(1);
    expect(productsAfterRollback[0].id).toBe('prd-burrata-01');

    const salesAfterRollback = await db.select('SELECT * FROM sales');
    expect(salesAfterRollback).toHaveLength(1);
    expect(salesAfterRollback[0].id).toBe('sal-2026-0001');

    const ingredientsAfterRollback = await db.select('SELECT * FROM ingredients');
    expect(ingredientsAfterRollback).toHaveLength(1);
    expect(ingredientsAfterRollback[0].id).toBe('ing-mozzarella-01');

    if (typeof localStorage !== 'undefined') {
      expect(localStorage.getItem('pizzeria_delivery_fee')).toBe('250');
      expect(localStorage.getItem('aquadro_db_secret_key')).toBe('987654');
    }
  });

  it('Test 5 (Blocker 5): Foreign-key integrity check rejects invalid or missing required FK references before touching the DB', async () => {
    await seedRepresentativeBusinessDatabase();
    const validMeta = await backupService.exportJsonBackup();

    // 5a : Injecter une ligne sale_items qui référence un product_id inexistant
    const brokenFkBackup = JSON.parse(validMeta.jsonContent!);
    brokenFkBackup.sale_items.push({
      id: 'sali-orphan-fk',
      sale_id: 'sal-2026-0001',
      product_id: 'prd-non-existent-999',
      product_name: 'Produit Fantôme',
      batch_id: null,
      quantity: 1,
      unit_price_ttc: 10000,
      discount_amount: 0,
      total_ttc: 10000,
      unit_purchase_cost_snapshot: 5000,
      created_at: '2026-03-15T10:00:00.000Z'
    });

    await expect(
      backupService.restoreBackup(JSON.stringify(brokenFkBackup), '849201')
    ).rejects.toThrow(/Intégrité référentielle invalide/i);

    // 5b : Injecter une ligne sale_items avec une clé étrangère obligatoire (NOT NULL) à null ou ""
    const nullRequiredFkBackup = JSON.parse(validMeta.jsonContent!);
    nullRequiredFkBackup.sale_items.push({
      id: 'sali-null-required-fk',
      sale_id: null, // sale_items.sale_id est NOT NULL REFERENCES sales(id)
      product_id: 'prd-burrata-01',
      product_name: 'Pizza Test',
      batch_id: '', // batch_id est optionnel : "" sera normalisé à null si valide
      quantity: 1,
      unit_price_ttc: 10000,
      discount_amount: 0,
      total_ttc: 10000,
      unit_purchase_cost_snapshot: 5000,
      created_at: '2026-03-15T10:00:00.000Z'
    });

    await expect(
      backupService.restoreBackup(JSON.stringify(nullRequiredFkBackup), '849201')
    ).rejects.toThrow(/champ clé étrangère requis sale_items\.sale_id est manquant ou vide/i);

    // Vérifier que la base existante est totalement intacte
    const saleItems = await db.select('SELECT * FROM sale_items');
    expect(saleItems).toHaveLength(1);
    expect(saleItems[0].id).toBe('sali-2026-0001');
  });

  it('Test 6 (Blocker 1 & Blocker 5): Legacy V1 backup with genuinely omitted `stores` property and missing `name_ar` restores cleanly', async () => {
    const legacyOwnerPinHash = await HashUtil.hashCredential('951753');

    // Sauvegarde Legacy V1 authentique :
    // - PAS de propriété `stores` (totalement omise / undefined)
    // - PAS de `_backup_meta`
    // - `name_ar` omis sur categories, products, ingredients, pizza_supplements
    // - `store_id: null` sur users et products
    // - `batches` au lieu de `product_batches` avec `quantity` au lieu de `current_stock`
    const genuineLegacyV1WithoutStores: Record<string, any> = {
      users: [
        {
          id: 'usr-legacy-owner',
          store_id: null,
          name: 'Ancien Propriétaire V1',
          phone: '0550123456',
          pin_hash: legacyOwnerPinHash,
          role: 'owner',
          is_active: 1,
          created_at: '2025-01-10T08:00:00.000Z',
          updated_at: '2025-01-10T08:00:00.000Z'
        }
      ],
      categories: [
        {
          id: 'cat-pizza',
          name_fr: 'Pizzas Classiques',
          // name_ar omis volontairement
          created_at: '2025-01-10T08:00:00.000Z'
        }
      ],
      products: [
        {
          id: 'prd-legacy-margherita',
          store_id: null,
          category_id: 'cat-pizza',
          brand_id: '', // chaîne vide sur FK optionnelle -> normalisée en null
          sku: 'LEG-MARG-01',
          barcode: '613000111222',
          name_fr: 'Pizza Margherita Classique',
          // name_ar omis volontairement
          purchase_cost: 30000,
          selling_price_ttc: 70000,
          min_selling_price_ttc: 60000,
          tva_rate: 0,
          current_stock: 25,
          min_stock_alert: 5,
          is_active: 1,
          created_at: '2025-01-10T08:00:00.000Z',
          updated_at: '2025-01-10T08:00:00.000Z'
        }
      ],
      ingredients: [
        {
          id: 'ing-legacy-farine',
          name_fr: 'Farine T00',
          unit: 'kg',
          current_stock: 50,
          min_stock_alert: 10,
          cost_per_unit: 120
        }
      ],
      pizza_supplements: [
        {
          id: 'sup-legacy-olives',
          name_fr: 'Olives Noires',
          purchase_cost: 1000,
          price: 5000,
          current_stock: 30
        }
      ],
      batches: [
        {
          id: 'bch-legacy-01',
          product_id: 'prd-legacy-margherita',
          batch_number: 'LOT-LEG-01',
          expiration_date: '2027-01-01',
          quantity: 25,
          purchase_cost: 30000,
          created_at: '2025-01-10T08:00:00.000Z'
        }
      ]
    };

    // Vérifier que la propriété `stores` est réellement absente (`undefined`)
    expect('stores' in genuineLegacyV1WithoutStores).toBe(false);

    const ok = await backupService.restoreBackup(
      JSON.stringify(genuineLegacyV1WithoutStores),
      undefined,
      { fromSetup: true }
    );
    expect(ok).toBe(true);

    // Vérifier que `store-alg-01` a été synthétisé et rattaché
    const stores = await db.select('SELECT * FROM stores');
    expect(stores).toHaveLength(1);
    expect(stores[0].id).toBe('store-alg-01');

    const users = await db.select('SELECT * FROM users WHERE id = ?', ['usr-legacy-owner']);
    expect(users).toHaveLength(1);
    expect(users[0].store_id).toBe('store-alg-01');

    const products = await db.select('SELECT * FROM products WHERE id = ?', [
      'prd-legacy-margherita'
    ]);
    expect(products).toHaveLength(1);
    expect(products[0].store_id).toBe('store-alg-01');
    expect(products[0].brand_id).toBeNull();
    expect(products[0].name_ar).toBe('Pizza Margherita Classique');

    const categories = await db.select('SELECT * FROM categories WHERE id = ?', ['cat-pizza']);
    expect(categories[0].name_ar).toBe('Pizzas Classiques');

    const batches = await db.select('SELECT * FROM product_batches WHERE id = ?', [
      'bch-legacy-01'
    ]);
    expect(batches).toHaveLength(1);
    expect(batches[0].current_stock).toBe(25);

    // Vérifier qu'une sauvegarde au format actuel V2 SANS `stores` est toujours rejetée
    const malformedV2WithoutStores = {
      _backup_meta: {
        format: BACKUP_FORMAT_IDENTIFIER,
        schemaVersion: 2
      },
      products: []
    };
    expect(() =>
      backupService.validateAndNormalizeBackup(JSON.stringify(malformedV2WithoutStores))
    ).toThrow(/stores, products/i);
  });

  it('Test 7 (Blocker 4): Populated database is protected against unauthenticated complete_setup overwrites, while authorized updates and incomplete setup recovery succeed', async () => {
    await seedRepresentativeBusinessDatabase();

    // 7a : Appel non authentifié à completeSetup sur une base déjà peuplée -> DOIT être rejeté
    await expect(
      authService.completeSetup({
        store_name_fr: 'Tentative Pirate',
        store_name_ar: 'قرصنة',
        address: 'Adresse Pirate',
        wilaya: '16 - Alger',
        commune: 'Hydra',
        phone: '0000000000',
        fiscal_regime: 'IFU',
        tva_rate: 0,
        owner_name: 'Pirate',
        owner_phone: '0000000000',
        owner_pin: '648291'
      })
    ).rejects.toThrow(/Action non autorisée/i);

    // Vérifier que le magasin et le propriétaire d'origine n'ont PAS été modifiés
    const storesUnchanged = await db.select('SELECT * FROM stores');
    expect(storesUnchanged[0].name_fr).toBe('Pizzeria Napoli Hydra');
    const ownerStillValid = await authService.loginWithPin('849201');
    expect(ownerStillValid?.name).toBe('Karim Mansouri');
    await authService.logout();

    // 7b : Appel autorisé avec `currentOwnerPin` ('849201') -> DOIT réussir sans supprimer les tables ni casser les FK
    await authService.completeSetup(
      {
        store_name_fr: 'Pizzeria Napoli Hydra (Mise à jour)',
        store_name_ar: 'بيتزا نابولي حيدرة',
        address: '14 Rue Parmentier, Hydra, Alger',
        wilaya: '16 - Alger',
        commune: 'Hydra',
        phone: '0555112299',
        email: 'direction@napoli.dz',
        rc: '16/00-9988776B20',
        nif: '002016099887766',
        nis: '1020160998877',
        activity: 'Restauration Rapide',
        fiscal_regime: 'REEL',
        tva_rate: 9.0,
        owner_name: 'Karim Mansouri (Gérant)',
        owner_phone: '0555112299',
        owner_pin: '648291'
      },
      { currentOwnerPin: '849201' }
    );

    const stores = await db.select('SELECT * FROM stores');
    expect(stores).toHaveLength(1);
    expect(stores[0].id).toBe('store-prod-01');
    expect(stores[0].name_fr).toBe('Pizzeria Napoli Hydra (Mise à jour)');
    expect(stores[0].email).toBe('direction@napoli.dz');

    // Vérifier que le caissier ('usr-cashier-prod') n'a PAS été supprimé et que le nouveau PIN propriétaire est haché
    const users = await db.select('SELECT * FROM users ORDER BY id ASC');
    expect(users).toHaveLength(2);
    expect(users.map((u: any) => u.id)).toEqual(['usr-cashier-prod', 'usr-owner-prod']);
    const updatedOwner = users.find((u: any) => u.id === 'usr-owner-prod');
    expect(HashUtil.isValidSaltedSha256Hash(updatedOwner.pin_hash)).toBe(true);

    const loginWithNewPin = await authService.loginWithPin('648291');
    expect(loginWithNewPin?.id).toBe('usr-owner-prod');

    const fkCheck = await db.select('PRAGMA foreign_key_check;');
    expect(fkCheck).toHaveLength(0);

    // 7c : Récupération d'une installation partielle (magasin présent mais aucun propriétaire actif)
    handleB = createRealSqliteFileAdapter(tempDbPathB);
    await db.setCustomAdapter(handleB.adapter);
    await authService.logout();

    await db.execute(
      `INSERT INTO stores (id, name_fr, name_ar, wilaya, commune, address, phone, rc_number, nif_number, nis_number, ai_number, fiscal_regime, default_tva_rate, receipt_header, receipt_footer, currency, is_active, created_at, updated_at)
       VALUES ('store-partial-01', 'Magasin Partiel', 'محل جزئي', 'Alger', 'Alger', 'Rue 1', '0550000000', '', '', '', '', 'IFU', 0, '', '', 'DZD', 1, '2026-01-01', '2026-01-01')`
    );
    expect(await db.isSetupCompleted()).toBe(false);

    // Doit permettre de finaliser l'installation partielle sans erreur d'autorisation
    await authService.completeSetup({
      store_name_fr: 'Magasin Partiel Réparé',
      store_name_ar: 'محل تم إصلاحه',
      address: 'Rue 1',
      wilaya: 'Alger',
      commune: 'Alger',
      phone: '0550000000',
      email: 'contact@repare.dz',
      fiscal_regime: 'IFU',
      tva_rate: 0,
      owner_name: 'Propriétaire Réparé',
      owner_phone: '0550000000',
      owner_pin: '583920'
    });
    expect(await db.isSetupCompleted()).toBe(true);
  });

  it('Test 8: resetAll() safety — not called before backup validation and reseeds required structural records when explicitly invoked', async () => {
    await seedRepresentativeBusinessDatabase();

    await expect(backupService.restoreBackup('{"invalid": true}', '849201')).rejects.toThrow();
    const productsStillThere = await db.select('SELECT * FROM products');
    expect(productsStillThere).toHaveLength(1);

    await db.resetAll();

    const categoriesAfterReset = await db.select('SELECT * FROM categories ORDER BY id ASC');
    const catIds = categoriesAfterReset.map((c: any) => c.id);
    expect(catIds).toContain('cat-pizza');
    expect(catIds).toContain('cat-drink');

    const sequencesAfterReset = await db.select('SELECT * FROM document_sequences');
    expect(sequencesAfterReset.length).toBeGreaterThanOrEqual(5);

    expect(await db.isSetupCompleted()).toBe(false);
  });

  it('Test 9 (Blocker 3): PIN security — hashes all PINs, rejects 1234/0000 bypass, rejects mock-hash-* and plaintext PINs', async () => {
    await seedRepresentativeBusinessDatabase();

    // 9a : Rejet strict des PINs faibles (1234, 0000, 1111, 123456) à la validation
    expect(HashUtil.validateNewPin('1234').valid).toBe(false);
    expect(HashUtil.validateNewPin('0000').valid).toBe(false);
    expect(HashUtil.validateNewPin('1111').valid).toBe(false);
    expect(HashUtil.validateNewPin('123456').valid).toBe(false);
    expect(HashUtil.validateNewPin('849201').valid).toBe(true);

    // 9b : Rejet de tout contournement d'authentification avec '1234' ou '0000'
    await expect(authService.loginWithPin('1234')).rejects.toThrow(/Code PIN incorrect/i);
    await expect(authService.loginWithPin('0000')).rejects.toThrow(/Code PIN incorrect/i);

    // 9c : Rejet strict de `mock-hash-*` et des PINs en clair dans la base
    expect(await verifyPinCredential('849201', 'mock-hash-849201')).toBe(false);
    expect(await verifyPinCredential('849201', '849201')).toBe(false);
    expect(await verifyPinCredential('849201', 'malformed:nothex')).toBe(false);

    // 9d : Vérification positive d'un vrai hash Salted SHA-256 (`<salt>:<64-hex>`)
    const realHash = await HashUtil.hashCredential('849201');
    expect(HashUtil.isValidSaltedSha256Hash(realHash)).toBe(true);
    expect(await verifyPinCredential('849201', realHash)).toBe(true);
    expect(await verifyPinCredential('999999', realHash)).toBe(false);

    // 9e : Création d'utilisateur et changement de PIN stockent toujours un hash Salted SHA-256
    await authService.loginWithPin('849201');
    const createdManager = await authService.createUser({
      name: 'Nadia Manager',
      role: 'manager',
      pin: '482910',
      phone: '0550111222'
    });
    expect(HashUtil.isValidSaltedSha256Hash(createdManager.pin_hash)).toBe(true);
    expect(createdManager.pin_hash).not.toBe('482910');

    await authService.updateUserPin(createdManager.id, '938471');
    const updatedRows = await db.select<{ pin_hash: string }>(
      'SELECT pin_hash FROM users WHERE id = ?',
      [createdManager.id]
    );
    expect(HashUtil.isValidSaltedSha256Hash(updatedRows[0].pin_hash)).toBe(true);
    expect(await verifyPinCredential('938471', updatedRows[0].pin_hash)).toBe(true);
  });

  it('Test 10 (Blocker 5): Gate 1C CHECK(current_stock >= 0.0) constraint is active in SQLite and negative stock is rejected pre-restore', async () => {
    await seedRepresentativeBusinessDatabase();

    // 10a : Vérifier que la contrainte SQLite Gate 1C CHECK(current_stock >= 0.0) est réellement active sur products et product_batches
    await expect(
      db.execute(`UPDATE products SET current_stock = -1.0 WHERE id = 'prd-burrata-01'`)
    ).rejects.toThrow(/CHECK constraint failed/i);

    await expect(
      db.execute(`UPDATE product_batches SET current_stock = -5.0 WHERE id = 'bch-burrata-01'`)
    ).rejects.toThrow(/CHECK constraint failed/i);

    // 10b : Vérifier que validateAndNormalizeBackup rejette un stock négatif avant même d'ouvrir la transaction
    const validMeta = await backupService.exportJsonBackup();
    const negativeStockBackup = JSON.parse(validMeta.jsonContent!);
    negativeStockBackup.products[0].current_stock = -3;

    await expect(
      backupService.restoreBackup(JSON.stringify(negativeStockBackup), '849201')
    ).rejects.toThrow(/Stock négatif ou invalide/i);
  });

  it('Test 11 (Additional Settings Policy): Excludes DB secret key, clears stale portable settings, and preserves target hardware printer unless explicitly overwritten', async () => {
    await seedRepresentativeBusinessDatabase();

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('aquadro_db_secret_key', 'SECRET-SOURCE-111111');
      localStorage.setItem('aquadro_selected_printer', 'EPSON-TM-T20-SOURCE');
      localStorage.setItem('pizzeria_delivery_fee', '300');
    }

    const exported = await backupService.exportJsonBackup();
    const parsedExport = JSON.parse(exported.jsonContent!);

    // 11a : `aquadro_db_secret_key` ne doit JAMAIS être exporté dans le JSON
    expect(parsedExport._app_settings.aquadro_db_secret_key).toBeUndefined();
    expect(exported.jsonContent).not.toContain('SECRET-SOURCE-111111');

    // Préparer un poste cible (Base B) avec son propre secret local, sa propre imprimante matérielle et un ancien logo obsolète
    handleB = createRealSqliteFileAdapter(tempDbPathB);
    await db.setCustomAdapter(handleB.adapter);
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
      localStorage.setItem('aquadro_db_secret_key', 'SECRET-TARGET-222222');
      localStorage.setItem('aquadro_selected_printer', 'XPRINTER-TARGET-USB');
      localStorage.setItem('aquadro_store_logo', 'STALE-LOGO-TO-BE-CLEARED');
    }

    await backupService.restoreBackup(exported.jsonContent!, undefined, { fromSetup: true });

    if (typeof localStorage !== 'undefined') {
      // Le secret du poste cible est préservé
      expect(localStorage.getItem('aquadro_db_secret_key')).toBe('SECRET-TARGET-222222');
      // L'imprimante matérielle du poste cible n'a PAS été écrasée par celle de l'ancien poste
      expect(localStorage.getItem('aquadro_selected_printer')).toBe('XPRINTER-TARGET-USB');
      // L'ancien logo obsolète absent de la sauvegarde a été nettoyé
      expect(localStorage.getItem('aquadro_store_logo')).toBeNull();
      // Le frais de livraison portable de la sauvegarde a été appliqué
      expect(localStorage.getItem('pizzeria_delivery_fee')).toBe('300');
    }
  });
});
