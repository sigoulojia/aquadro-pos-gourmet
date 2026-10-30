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
  BACKUP_FORMAT_IDENTIFIER,
  ALLOWED_EXPORT_APP_SETTINGS_KEYS,
  ALLOWED_EXPORT_SETTINGS_SET,
  EXCLUDED_LICENSE_SETTINGS_KEYS,
  isDisallowedSecurityOrLicenseKey,
  isDisallowedLicenseOrSecretValue
} from '../src/services/backup.service';
import { licenseService, LicenseStatusResponse } from '../src/services/license.service';
import { authService } from '../src/services/auth.service';
import { SecurityUtil as HashUtil } from '../src/utils/security';

class MockStorage {
  private store: Record<string, string> = {};
  getItem(key: string): string | null {
    return this.store[key] ?? null;
  }
  setItem(key: string, value: string): void {
    this.store[key] = String(value);
  }
  removeItem(key: string): void {
    delete this.store[key];
  }
  clear(): void {
    this.store = {};
  }
}

const mockStorage = new MockStorage();
if (typeof (globalThis as any).localStorage === 'undefined') {
  (globalThis as any).localStorage = mockStorage;
}
if (typeof (globalThis as any).window === 'undefined') {
  (globalThis as any).window = globalThis;
}

const SCHEMA_SQL_PATH = path.resolve(__dirname, '../src/db/schema.sql');
const SCHEMA_SQL = fs.readFileSync(SCHEMA_SQL_PATH, 'utf8');

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

function createRealSqliteFileAdapter(dbFilePath: string): {
  adapter: SqlAdapter;
  rawDb: InstanceType<typeof DatabaseSync>;
  close: () => void;
} {
  const rawDb = new DatabaseSync(dbFilePath);

  rawDb.exec('PRAGMA journal_mode = WAL;');
  rawDb.exec('PRAGMA foreign_keys = ON;');
  rawDb.exec('PRAGMA busy_timeout = 5000;');

  rawDb.exec(SCHEMA_SQL);
  applyGate1CMigration(rawDb);

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
    } catch {}
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

async function seedRepresentativeBusinessDatabase() {
  const now = '2026-03-15T10:00:00.000Z';
  const ownerPinHash = await HashUtil.hashCredential('849201');
  const cashierPinHash = await HashUtil.hashCredential('258369');

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
      '0550112233',
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
      '0550445566',
      1,
      now,
      now
    ]
  );

  await db.execute(
    `INSERT OR REPLACE INTO categories (id, name_fr, name_ar, created_at) VALUES (?, ?, ?, ?)`,
    ['cat-pizza', 'Pizzas', 'بيتزا', now]
  );

  await db.execute(
    `INSERT INTO products (
      id, store_id, category_id, sku, barcode, name_fr, name_ar,
      purchase_cost, selling_price_ttc, current_stock, min_stock_alert, is_active,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'prod-margherita',
      'store-prod-01',
      'cat-pizza',
      'PIZ-MARG',
      '613000000001',
      'Pizza Margherita',
      'بيتزا مارغريتا',
      250,
      600,
      40.0,
      5.0,
      1,
      now,
      now
    ]
  );

  await db.execute(
    `INSERT INTO ingredients (
      id, name_fr, name_ar, unit, current_stock, min_stock_alert, cost_per_unit, is_active,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'ing-mozzarella',
      'Mozzarella Fraîche',
      'جبن موزاريلا',
      'kg',
      25.0,
      5.0,
      1200.0,
      1,
      now,
      now
    ]
  );

  await db.execute(
    `INSERT INTO pizza_supplements (
      id, name_fr, name_ar, purchase_cost, price, current_stock, min_stock_alert, category, is_active, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'sup-extra-cheese',
      'Extra Mozzarella',
      'إضافة موزاريلا',
      50,
      150,
      30.0,
      5.0,
      'CHEESE',
      1,
      now
    ]
  );

  await db.execute(
    `INSERT INTO cash_sessions (
      id, cashier_id, cashier_name, opened_at, status, opening_float
    ) VALUES (?, ?, ?, ?, ?, ?)`,
    ['sess-2026-001', 'usr-cashier-prod', 'Yacine Caissier', now, 'OPEN', 5000]
  );

  await db.execute(
    `INSERT INTO sales (
      id, receipt_number, session_id, cashier_id, subtotal_ht, discount_amount,
      tax_amount, total_ttc, status, idempotency_key, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'sale-001',
      'TCK-2026-0001',
      'sess-2026-001',
      'usr-cashier-prod',
      550,
      0,
      50,
      600,
      'COMPLETED',
      'idem-sale-001',
      now
    ]
  );

  await db.execute(
    `INSERT INTO sale_items (
      id, sale_id, product_id, product_name, quantity, unit_price_ttc,
      discount_amount, total_ttc, unit_purchase_cost_snapshot, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['sitem-001', 'sale-001', 'prod-margherita', 'Pizza Margherita', 1.0, 600, 0, 600, 250, now]
  );

  await db.execute(
    `INSERT INTO payments (
      id, sale_id, payment_method, amount, tendered_amount, change_given, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['pay-001', 'sale-001', 'CASH', 600, 1000, 400, now]
  );
}

describe('AQUADRO POS — EXCLUDE LICENSE ACTIVATION FROM JSON BACKUP AND RESTORE', () => {
  let tempDbPathA: string;
  let tempDbPathB: string;
  let handleA: ReturnType<typeof createRealSqliteFileAdapter> | null = null;
  let handleB: ReturnType<typeof createRealSqliteFileAdapter> | null = null;

  beforeEach(async () => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    tempDbPathA = path.join(os.tmpdir(), `aquadro_lic_test_a_${id}.db`);
    tempDbPathB = path.join(os.tmpdir(), `aquadro_lic_test_b_${id}.db`);

    handleA = createRealSqliteFileAdapter(tempDbPathA);
    await db.setCustomAdapter(handleA.adapter);

    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
    licenseService.clearCache();
    await authService.logout();
  });

  afterEach(async () => {
    await authService.logout();
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
    licenseService.clearCache();

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

  // =========================================================================
  // TEST 1: Exporting from an activated installation does not expose license
  // =========================================================================
  it('Test 1: Exporting a backup from an activated installation does not expose licensing data', async () => {
    await seedRepresentativeBusinessDatabase();

    // Simuler une installation source activée avec licence officielle
    const sourceHwid = 'AQ-SRC1-1111-2222-3333';
    const sourceLicenseKey = 'AQLIC-eyJzdG9yZV9uYW1lIjoiUGl6emVyaWEgTmFwb2xpIEh5ZHJhIiwiaHdpZCI6IkFRLVNSQzEtMTExMS0yMjIyLTMzMzMifQ.abc123def4567890';
    const sourceStatus: LicenseStatusResponse = {
      is_licensed: true,
      hwid: sourceHwid,
      store_name: 'Pizzeria Napoli Hydra',
      license_type: 'LIFETIME',
      expires_at: '2099-12-31',
      days_remaining: 36500,
      is_lifetime: true,
      is_trial_active: false,
      is_trial_expired: false,
      trial_days_remaining: 0
    };

    licenseService.setMockStatus(sourceStatus);

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('aquadro_web_license_status', JSON.stringify(sourceStatus));
      localStorage.setItem('aquadro_license_key', sourceLicenseKey);
      localStorage.setItem('aquadro_pos_lic', sourceLicenseKey);
      localStorage.setItem('aquadro_db_secret_key', 'DB_SECRET_SOURCE_123');
      localStorage.setItem('pizzeria_delivery_fee', '350');
      localStorage.setItem('aquadro_store_logo', 'data:image/png;base64,SOURCE_LOGO');
    }

    // Exporter la sauvegarde JSON
    const exportMeta = await backupService.exportJsonBackup();
    const jsonStr = exportMeta.jsonContent!;
    const parsed = JSON.parse(jsonStr);

    // 1a. Vérifier qu'aucune donnée de licence ou clé sensible n'est présente dans le JSON brut
    expect(jsonStr).not.toContain(sourceHwid);
    expect(jsonStr).not.toContain('AQLIC-');
    expect(jsonStr).not.toContain('aquadro_web_license_status');
    expect(jsonStr).not.toContain('aquadro_license_key');
    expect(jsonStr).not.toContain('aquadro_pos_lic');
    expect(jsonStr).not.toContain('DB_SECRET_SOURCE_123');

    // 1b. Vérifier que _app_settings utilise strictement l'allowlist
    expect(parsed._app_settings).toBeDefined();
    expect(parsed._app_settings.aquadro_web_license_status).toBeUndefined();
    expect(parsed._app_settings.aquadro_license_key).toBeUndefined();
    expect(parsed._app_settings.aquadro_db_secret_key).toBeUndefined();
    expect(parsed._app_settings.pizzeria_delivery_fee).toBe('350');
    expect(parsed._app_settings.aquadro_store_logo).toBe('data:image/png;base64,SOURCE_LOGO');

    // 1c. Vérifier les métadonnées de sauvegarde
    expect(parsed._backup_meta.format).toBe(BACKUP_FORMAT_IDENTIFIER);
    expect(parsed._backup_meta.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
    expect(parsed._backup_meta.is_licensed).toBeUndefined();
    expect(parsed._backup_meta.hwid).toBeUndefined();
  });

  // =========================================================================
  // TEST 2 & SCENARIO A: Restore onto unlicensed destination remains unlicensed
  // =========================================================================
  it('Test 2 & Scenario A: Activated source -> export JSON -> restore on an unlicensed destination -> destination remains unlicensed', async () => {
    // Étape 1 : Source activée
    await seedRepresentativeBusinessDatabase();
    const sourceStatus: LicenseStatusResponse = {
      is_licensed: true,
      hwid: 'AQ-SRC-AAAA-BBBB-CCCC',
      store_name: 'Source Store Activated',
      license_type: 'LIFETIME',
      expires_at: '2099-12-31',
      days_remaining: 36500,
      is_lifetime: true,
      is_trial_active: false,
      is_trial_expired: false,
      trial_days_remaining: 0
    };
    licenseService.setMockStatus(sourceStatus);

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('pizzeria_delivery_fee', '300');
    }

    const exported = await backupService.exportJsonBackup();

    // Étape 2 : Préparer le terminal cible B NON LICENCIÉ
    handleB = createRealSqliteFileAdapter(tempDbPathB);
    await db.setCustomAdapter(handleB.adapter);

    const destUnlicensedHwid = 'AQ-DEST-UNLIC-9999-8888';
    const destUnlicensedStatus: LicenseStatusResponse = {
      is_licensed: false,
      hwid: destUnlicensedHwid,
      store_name: undefined,
      license_type: undefined,
      expires_at: undefined,
      days_remaining: undefined,
      is_lifetime: false,
      is_trial_active: false,
      is_trial_expired: true,
      trial_days_remaining: 0,
      error: 'License required'
    };

    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
      localStorage.setItem('aquadro_web_license_status', JSON.stringify(destUnlicensedStatus));
    }
    licenseService.setMockStatus(destUnlicensedStatus);

    const destBefore = await licenseService.getStatus(true);
    expect(destBefore.is_licensed).toBe(false);
    expect(destBefore.hwid).toBe(destUnlicensedHwid);

    // Étape 3 : Restaurer la sauvegarde de la source activée sur la destination non-licenciée
    await backupService.restoreBackup(exported.jsonContent!, undefined, { fromSetup: true });

    // Étape 4 : Vérification formelle du SCÉNARIO A
    const destAfter = await licenseService.getStatus(true);
    expect(destAfter.is_licensed).toBe(false);
    expect(destAfter.hwid).toBe(destUnlicensedHwid);
    expect(destAfter.is_trial_expired).toBe(true);

    // Les données métier ont été restaurées
    const restoredProducts = await db.select('SELECT * FROM products');
    expect(restoredProducts.length).toBeGreaterThan(0);
    expect(restoredProducts[0].id).toBe('prod-margherita');
  });

  // =========================================================================
  // TEST 3: Restoring into another device does not transfer original license
  // =========================================================================
  it('Test 3: Restoring that backup into another device does not transfer the original license', async () => {
    await seedRepresentativeBusinessDatabase();
    const sourceStatus: LicenseStatusResponse = {
      is_licensed: true,
      hwid: 'AQ-PC-ALPHA-1111',
      store_name: 'Alpha Pizzeria',
      license_type: 'LIFETIME',
      expires_at: '2099-12-31',
      days_remaining: 36500,
      is_lifetime: true,
      is_trial_active: false,
      is_trial_expired: false,
      trial_days_remaining: 0
    };
    licenseService.setMockStatus(sourceStatus);

    const exported = await backupService.exportJsonBackup();

    // Basculer vers la machine Beta
    handleB = createRealSqliteFileAdapter(tempDbPathB);
    await db.setCustomAdapter(handleB.adapter);

    const betaHwid = 'AQ-PC-BETA-2222';
    const betaStatus: LicenseStatusResponse = {
      is_licensed: false,
      hwid: betaHwid,
      is_lifetime: false,
      is_trial_active: false,
      is_trial_expired: true,
      trial_days_remaining: 0
    };
    licenseService.setMockStatus(betaStatus);

    await backupService.restoreBackup(exported.jsonContent!, undefined, { fromSetup: true });

    const betaCurrent = await licenseService.getStatus(true);
    expect(betaCurrent.is_licensed).toBe(false);
    expect(betaCurrent.hwid).toBe(betaHwid);
    expect(betaCurrent.hwid).not.toBe('AQ-PC-ALPHA-1111');
  });

  // =========================================================================
  // TEST 4 & SCENARIO B: Activated destination retains its own valid license
  // =========================================================================
  it('Test 4 & Scenario B: Activated destination -> restore a backup from another installation -> destination retains its own valid license', async () => {
    // Sauvegarde provenant d'un autre magasin ou d'une ancienne sauvegarde
    await seedRepresentativeBusinessDatabase();
    const otherStoreStatus: LicenseStatusResponse = {
      is_licensed: true,
      hwid: 'AQ-OLD-STORE-0000',
      store_name: 'Ancien Magasin Bab Ezzouar',
      license_type: 'ANNUAL',
      expires_at: '2026-12-31',
      days_remaining: 200,
      is_lifetime: false,
      is_trial_active: false,
      is_trial_expired: false,
      trial_days_remaining: 0
    };
    licenseService.setMockStatus(otherStoreStatus);
    const backupFromOldStore = await backupService.exportJsonBackup();

    // Machine cible ACTIVÉE légitimement pour "Pizzeria El Biar" avec son propre HWID
    handleB = createRealSqliteFileAdapter(tempDbPathB);
    await db.setCustomAdapter(handleB.adapter);

    const destLegitHwid = 'AQ-DEST-LEGIT-7777-8888';
    const destLegitStatus: LicenseStatusResponse = {
      is_licensed: true,
      hwid: destLegitHwid,
      store_name: 'Pizzeria El Biar Gourmet',
      license_type: 'LIFETIME',
      expires_at: '2099-12-31',
      days_remaining: 36500,
      is_lifetime: true,
      is_trial_active: false,
      is_trial_expired: false,
      trial_days_remaining: 0
    };

    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
      localStorage.setItem('aquadro_web_license_status', JSON.stringify(destLegitStatus));
    }
    licenseService.setMockStatus(destLegitStatus);

    const before = await licenseService.getStatus(true);
    expect(before.is_licensed).toBe(true);
    expect(before.hwid).toBe(destLegitHwid);
    expect(before.store_name).toBe('Pizzeria El Biar Gourmet');

    // Restaurer la sauvegarde de l'ancien magasin sur ce poste déjà activé
    await backupService.restoreBackup(backupFromOldStore.jsonContent!, undefined, { fromSetup: true });

    // Étape formelle du SCÉNARIO B :
    // La destination DOIT conserver sa propre licence valide, son propre HWID et son propre nom de magasin
    const after = await licenseService.getStatus(true);
    expect(after.is_licensed).toBe(true);
    expect(after.hwid).toBe(destLegitHwid);
    expect(after.store_name).toBe('Pizzeria El Biar Gourmet');
    expect(after.is_lifetime).toBe(true);
  });

  // =========================================================================
  // TEST 5: Restoring a backup does not overwrite destination HWID
  // =========================================================================
  it('Test 5: Restoring a backup does not overwrite the destination HWID', async () => {
    await seedRepresentativeBusinessDatabase();
    const exported = await backupService.exportJsonBackup();

    handleB = createRealSqliteFileAdapter(tempDbPathB);
    await db.setCustomAdapter(handleB.adapter);

    const uniqueHwid = 'AQ-UNIQUE-HARDWARE-9999';
    licenseService.setMockStatus({
      is_licensed: false,
      hwid: uniqueHwid,
      is_lifetime: false,
      is_trial_active: true,
      is_trial_expired: false,
      trial_days_remaining: 5
    });

    await backupService.restoreBackup(exported.jsonContent!, undefined, { fromSetup: true });

    const currentStatus = await licenseService.getStatus(true);
    expect(currentStatus.hwid).toBe(uniqueHwid);
  });

  // =========================================================================
  // TEST 6: Legacy backups with licensing settings cannot override destination state
  // =========================================================================
  it('Test 6: Legacy backups containing licensing-related settings cannot override destination license state', async () => {
    await seedRepresentativeBusinessDatabase();
    const exported = await backupService.exportJsonBackup();
    const parsed = JSON.parse(exported.jsonContent!);

    // Injection malveillante ou fichier hérité corrompu contenant des clés de licence
    parsed._app_settings = {
      aquadro_web_license_status: JSON.stringify({
        is_licensed: true,
        hwid: 'AQ-MALICIOUS-INJECTED-HWID',
        store_name: 'Hacked Store'
      }),
      aquadro_license_key: 'AQLIC-forged.signature',
      license: 'true',
      is_licensed: 'true',
      hwid: 'AQ-MALICIOUS-INJECTED-HWID',
      pizzeria_delivery_fee: '400'
    };

    const maliciousJson = JSON.stringify(parsed);

    handleB = createRealSqliteFileAdapter(tempDbPathB);
    await db.setCustomAdapter(handleB.adapter);

    const safeDestHwid = 'AQ-DEST-SECURE-3333';
    licenseService.setMockStatus({
      is_licensed: false,
      hwid: safeDestHwid,
      is_lifetime: false,
      is_trial_active: false,
      is_trial_expired: true,
      trial_days_remaining: 0
    });

    await backupService.restoreBackup(maliciousJson, undefined, { fromSetup: true });

    // Le statut de licence sur la destination DOIT être resté non licencié et sécurisé
    const afterRestore = await licenseService.getStatus(true);
    expect(afterRestore.is_licensed).toBe(false);
    expect(afterRestore.hwid).toBe(safeDestHwid);
    expect(afterRestore.hwid).not.toBe('AQ-MALICIOUS-INJECTED-HWID');

    // Le paramètre normalisé autorisé (frais de livraison) a été restauré
    if (typeof localStorage !== 'undefined') {
      expect(localStorage.getItem('pizzeria_delivery_fee')).toBe('400');
      expect(localStorage.getItem('aquadro_license_key')).toBeNull();
    }
  });

  // =========================================================================
  // TEST 7: License-related data cannot enter through generic settings restoration
  // =========================================================================
  it('Test 7: License-related data cannot enter through generic settings restoration', () => {
    // Vérification de l'allowlist stricte
    expect(ALLOWED_EXPORT_SETTINGS_SET.has('aquadro_receipt_template_config')).toBe(true);
    expect(ALLOWED_EXPORT_SETTINGS_SET.has('pizzeria_delivery_fee')).toBe(true);
    expect(ALLOWED_EXPORT_SETTINGS_SET.has('aquadro_web_license_status')).toBe(false);
    expect(ALLOWED_EXPORT_SETTINGS_SET.has('aquadro_license_key')).toBe(false);
    expect(ALLOWED_EXPORT_SETTINGS_SET.has('license')).toBe(false);
    expect(ALLOWED_EXPORT_SETTINGS_SET.has('hwid')).toBe(false);

    // Vérification de la fonction de filtrage de sécurité
    expect(isDisallowedSecurityOrLicenseKey('license')).toBe(true);
    expect(isDisallowedSecurityOrLicenseKey('aquadro_license_key')).toBe(true);
    expect(isDisallowedSecurityOrLicenseKey('aquadro_web_license_status')).toBe(true);
    expect(isDisallowedSecurityOrLicenseKey('hwid')).toBe(true);
    expect(isDisallowedSecurityOrLicenseKey('aquadro_db_secret_key')).toBe(true);
    expect(isDisallowedSecurityOrLicenseKey('private_key_sig')).toBe(true);
    expect(isDisallowedSecurityOrLicenseKey('pizzeria_delivery_fee')).toBe(false);
    expect(isDisallowedSecurityOrLicenseKey('aquadro_printer_config')).toBe(false);

    // Vérification des valeurs de licence
    expect(isDisallowedLicenseOrSecretValue('AQLIC-payload.sig')).toBe(true);
    expect(isDisallowedLicenseOrSecretValue('{"is_licensed":true,"hwid":"AQ-123"}')).toBe(true);
    expect(isDisallowedLicenseOrSecretValue('Simple text 123')).toBe(false);
  });

  // =========================================================================
  // TEST 8: Normal business data and user accounts are restored correctly
  // =========================================================================
  it('Test 8: Normal business data and user accounts are restored correctly', async () => {
    await seedRepresentativeBusinessDatabase();
    const exported = await backupService.exportJsonBackup();

    handleB = createRealSqliteFileAdapter(tempDbPathB);
    await db.setCustomAdapter(handleB.adapter);

    await backupService.restoreBackup(exported.jsonContent!, undefined, { fromSetup: true });

    const stores = await db.select('SELECT * FROM stores');
    const users = await db.select('SELECT * FROM users');
    const products = await db.select('SELECT * FROM products');
    const ingredients = await db.select('SELECT * FROM ingredients');
    const sales = await db.select('SELECT * FROM sales');

    expect(stores).toHaveLength(1);
    expect(stores[0].name_fr).toBe('Pizzeria Napoli Hydra');
    expect(users).toHaveLength(2);
    expect(users.some((u: any) => u.role === 'owner')).toBe(true);
    expect(products).toHaveLength(1);
    expect(products[0].sku).toBe('PIZ-MARG');
    expect(ingredients).toHaveLength(1);
    expect(sales).toHaveLength(1);
  });

  // =========================================================================
  // TEST 9: Existing new Owner PIN restoration workflow continues to work
  // =========================================================================
  it('Test 9: The existing new Owner PIN restoration workflow continues to work', async () => {
    await seedRepresentativeBusinessDatabase();
    const exported = await backupService.exportJsonBackup();

    handleB = createRealSqliteFileAdapter(tempDbPathB);
    await db.setCustomAdapter(handleB.adapter);

    const newOwnerPin = '948215';
    await backupService.restoreBackup(exported.jsonContent!, undefined, {
      fromSetup: true,
      newOwnerPin
    });

    // L'authentification avec le nouveau PIN doit réussir
    const loginRes = await authService.loginWithPin(newOwnerPin);
    expect(loginRes).not.toBeNull();
    expect(loginRes?.role).toBe('owner');

    // L'ancien PIN de l'ancienne installation ne doit plus fonctionner et est rejeté
    await expect(authService.loginWithPin('849201')).rejects.toThrow(/Code PIN incorrect/i);
  });

  // =========================================================================
  // TEST 10: Failed restoration does not corrupt business data or licensing state
  // =========================================================================
  it('Test 10: Failed restoration does not corrupt business data or local licensing state', async () => {
    await seedRepresentativeBusinessDatabase();

    const initialLegitStatus: LicenseStatusResponse = {
      is_licensed: true,
      hwid: 'AQ-TEST-PRESERVED-HWID',
      store_name: 'Magasin Protégé',
      license_type: 'LIFETIME',
      expires_at: '2099-12-31',
      days_remaining: 36500,
      is_lifetime: true,
      is_trial_active: false,
      is_trial_expired: false,
      trial_days_remaining: 0
    };
    licenseService.setMockStatus(initialLegitStatus);

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('pizzeria_delivery_fee', '150');
    }

    // Tenter de restaurer un JSON corrompu (violation FK ou structure invalide)
    const corruptJson = JSON.stringify({
      _backup_meta: { format: BACKUP_FORMAT_IDENTIFIER, schemaVersion: 2 },
      _app_settings: { pizzeria_delivery_fee: '999' },
      stores: [{ id: 'store-bad' }],
      products: [{ id: 'prod-orphan', category_id: 'non-existent-cat', name_fr: 'Bad' }]
    });

    let threwError = false;
    try {
      await backupService.restoreBackup(corruptJson, '849201');
    } catch {
      threwError = true;
    }

    expect(threwError).toBe(true);

    // Vérifier que la base est intacte
    const storesAfter = await db.select('SELECT * FROM stores');
    expect(storesAfter).toHaveLength(1);
    expect(storesAfter[0].id).toBe('store-prod-01');

    // Vérifier que le statut de licence local est intact
    const statusAfter = await licenseService.getStatus(true);
    expect(statusAfter.is_licensed).toBe(true);
    expect(statusAfter.hwid).toBe('AQ-TEST-PRESERVED-HWID');
    expect(statusAfter.store_name).toBe('Magasin Protégé');

    if (typeof localStorage !== 'undefined') {
      expect(localStorage.getItem('pizzeria_delivery_fee')).toBe('150');
    }
  });
});
