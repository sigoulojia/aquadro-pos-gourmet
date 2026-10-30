import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
// @ts-ignore - node:sqlite is built-in in Node.js 22+
import { DatabaseSync } from 'node:sqlite';
import { db, SqlAdapter, isPlaceholderSeedUser, isPlaceholderSeedStore } from '../src/db/sqlite';
import { authService } from '../src/services/auth.service';
import { backupService } from '../src/services/backup.service';
import { SecurityUtil } from '../src/core/security/security';
import { SEED_USERS } from '../src/db/seed';

class NodeSqliteTestAdapter implements SqlAdapter {
  public raw: InstanceType<typeof DatabaseSync>;

  constructor(dbPath: string) {
    this.raw = new DatabaseSync(dbPath);
    this.raw.exec('PRAGMA journal_mode = WAL;');
    this.raw.exec('PRAGMA foreign_keys = ON;');
    this.raw.exec('PRAGMA busy_timeout = 5000;');
  }

  async execute(query: string, params: any[] = []) {
    const trimmed = query.trim();
    if (!trimmed) return { rowsAffected: 0 };

    const upper = trimmed.toUpperCase();
    if (
      upper.startsWith('BEGIN') ||
      upper.startsWith('COMMIT') ||
      upper.startsWith('END TRANSACTION') ||
      upper.startsWith('ROLLBACK') ||
      upper.startsWith('PRAGMA') ||
      (trimmed.includes(';') && params.length === 0)
    ) {
      this.raw.exec(trimmed);
      return { rowsAffected: 0 };
    }

    const stmt = this.raw.prepare(trimmed);
    const normalizedParams = params.map(p => (p === undefined ? null : p));
    const info = stmt.run(...normalizedParams);
    return {
      rowsAffected: Number(info.changes ?? 0),
      lastInsertId: Number(info.lastInsertRowid ?? 0)
    };
  }

  async select<T = any>(query: string, params: any[] = []): Promise<T[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];
    const stmt = this.raw.prepare(trimmed);
    const normalizedParams = params.map(p => (p === undefined ? null : p));
    const rows = stmt.all(...normalizedParams);
    return JSON.parse(JSON.stringify(rows)) as T[];
  }

  close() {
    this.raw.close();
  }
}

describe('Initialization & Setup Authorization Security Regression Suite', () => {
  let tempDir: string;
  let sqliteAdapter: NodeSqliteTestAdapter | null = null;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aquadro-init-sec-'));
    await authService.logout();
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  afterEach(async () => {
    await authService.logout();
    await db.setCustomAdapter(null);
    if (sqliteAdapter) {
      try {
        sqliteAdapter.close();
      } catch {}
      sqliteAdapter = null;
    }
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('1. MemorySQLiteEngine with default SEED_STORE & SEED_USERS is recognized as unconfigured and completes first-time setup without false "already configured" error', async () => {
    await db.setCustomAdapter(null);
    await db.resetAll();

    // Verify default seed records exist and are identified as unconfigured placeholders
    const rawStores = await db.select<any>('SELECT * FROM stores');
    const rawUsers = await db.select<any>('SELECT * FROM users');
    expect(rawStores.length).toBe(1);
    expect(rawUsers.length).toBe(1);
    expect(isPlaceholderSeedStore(rawStores[0])).toBe(true);
    expect(isPlaceholderSeedUser(rawUsers[0])).toBe(true);

    // Unconfigured seed must report isSetupCompleted() === false
    expect(await db.isSetupCompleted()).toBe(false);

    // First-time setup via SetupWizard / completeSetup must succeed without Owner auth error
    await authService.completeSetup({
      store_name_fr: 'Pizzeria Casbah Authentique',
      store_name_ar: 'بيتزا القصبة الأصيلة',
      address: '14 Rue de la Casbah',
      wilaya: '16 - Alger',
      commune: 'Casbah',
      phone: '0550112233',
      email: 'contact@casbah-pizza.dz',
      rc: '16/00-998877B24',
      nif: '002416998877001',
      nis: '002416009988',
      activity: 'Restauration Rapide & Pizzeria',
      fiscal_regime: 'IFU',
      tva_rate: 0,
      owner_name: 'Karim Merbah',
      owner_phone: '0550112233',
      owner_pin: '849206'
    });

    // Now setup is completed
    expect(await db.isSetupCompleted()).toBe(true);

    // Verify placeholder seed rows were cleaned up and real Owner & Store are accurately persisted
    const storesAfter = await db.select<any>('SELECT * FROM stores');
    expect(storesAfter.length).toBe(1);
    expect(storesAfter[0].name_fr).toBe('Pizzeria Casbah Authentique');
    expect(storesAfter[0].currency).toBe('DZD');
    expect(storesAfter[0].is_active).toBe(1);

    const usersAfter = await db.select<any>('SELECT * FROM users WHERE is_active = 1');
    expect(usersAfter.length).toBe(1);
    expect(usersAfter[0].name).toBe('Karim Merbah');
    expect(usersAfter[0].role).toBe('owner');
    expect(usersAfter[0].pin_hash).not.toBe('849206');
    expect(usersAfter[0].pin_hash).not.toBe(SEED_USERS[0].pin_hash);

    // Normal login and session verification work
    const loggedIn = await authService.loginWithPin('849206');
    expect(loggedIn).not.toBeNull();
    expect(loggedIn?.role).toBe('owner');
    expect(loggedIn?.name).toBe('Karim Merbah');
  });

  it('2. Previously configured database does NOT trigger unnecessary first-time setup even if localStorage setup flags are cleared', async () => {
    const dbFile = path.join(tempDir, 'configured_pos.db');
    sqliteAdapter = new NodeSqliteTestAdapter(dbFile);
    const schemaSql = fs.readFileSync(path.resolve(process.cwd(), 'src/db/schema.sql'), 'utf8');
    sqliteAdapter.raw.exec(schemaSql);
    await db.setCustomAdapter(sqliteAdapter);

    // Complete initial setup
    await authService.completeSetup({
      store_name_fr: 'Pizzeria Oran Santa Cruz',
      store_name_ar: 'بيتزا وهران سانتا كروز',
      address: 'Boulevard Front de Mer',
      wilaya: '31 - Oran',
      commune: 'Oran',
      phone: '0551445566',
      email: 'oran@aquadro.dz',
      rc: '31/00-112233B22',
      nif: '002231112233009',
      nis: '002231001122',
      fiscal_regime: 'REEL',
      tva_rate: 19,
      owner_name: 'Nassim Benali',
      owner_phone: '0551445566',
      owner_pin: '739184'
    });

    // Simulate clearing localStorage flags or restarting on an already-configured database
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('pizzeria_setup_completed');
      localStorage.removeItem('aquadro_setup_completed');
    }
    db.markSetupVerifiedInMemory(false);

    // Startup check must detect that the database is ALREADY configured and NOT open SetupWizard
    const completed = await db.isSetupCompleted();
    expect(completed).toBe(true);
    if (typeof localStorage !== 'undefined') {
      expect(localStorage.getItem('pizzeria_setup_completed')).toBe('true');
      expect(localStorage.getItem('aquadro_setup_completed')).toBe('true');
    }

    // Same verification in MemorySQLiteEngine mode when configured data exists but localStorage flags were cleared
    await db.setCustomAdapter(null);
    await db.resetAll();
    await authService.completeSetup({
      store_name_fr: 'Pizzeria Mémoire Configurée',
      store_name_ar: 'بيتزا مهيأة',
      address: 'Alger Centre',
      wilaya: '16 - Alger',
      commune: 'Alger Centre',
      phone: '0552001122',
      owner_name: 'Yacine Owner',
      owner_phone: '0552001122',
      owner_pin: '628491',
      tva_rate: 0
    });

    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('pizzeria_setup_completed');
      localStorage.removeItem('aquadro_setup_completed');
    }
    db.markSetupVerifiedInMemory(false);

    // Even in MemorySQLiteEngine mode, isSetupCompleted() inspects real configured store & owner and returns true
    expect(await db.isSetupCompleted()).toBe(true);
  });

  it('3. Authenticated Owner can perform authorized configuration changes via session token or current Owner PIN', async () => {
    const dbFile = path.join(tempDir, 'owner_auth_changes.db');
    sqliteAdapter = new NodeSqliteTestAdapter(dbFile);
    const schemaSql = fs.readFileSync(path.resolve(process.cwd(), 'src/db/schema.sql'), 'utf8');
    sqliteAdapter.raw.exec(schemaSql);
    await db.setCustomAdapter(sqliteAdapter);

    await authService.completeSetup({
      store_name_fr: 'Pizzeria Initiale',
      store_name_ar: 'بيتزا أولية',
      address: 'Rue Didouche Mourad',
      wilaya: '16 - Alger',
      commune: 'Sidi M\'Hamed',
      phone: '0550998877',
      owner_name: 'Amine Propriétaire',
      owner_phone: '0550998877',
      owner_pin: '582941',
      tva_rate: 0
    });

    // Login as Owner to obtain a valid Owner session token
    const ownerUser = await authService.loginWithPin('582941');
    expect(ownerUser?.role).toBe('owner');
    expect(authService.getSessionToken()).toBeTruthy();

    // 3A. Update store configuration using the active Owner session token
    const currentStore = await authService.getStore();
    expect(currentStore?.name_fr).toBe('Pizzeria Initiale');

    await authService.updateStore({
      ...currentStore,
      name_fr: 'Pizzeria Didouche Gourmande',
      phone: '0550123987',
      fiscal_regime: 'REEL',
      default_tva_rate: 19
    });

    const updatedStore = await authService.getStore();
    expect(updatedStore?.name_fr).toBe('Pizzeria Didouche Gourmande');
    expect(updatedStore?.phone).toBe('0550123987');
    expect(updatedStore?.fiscal_regime).toBe('REEL');
    expect(updatedStore?.default_tva_rate).toBe(19);

    // 3B. Re-run completeSetup as authenticated Owner (via active session token)
    await authService.completeSetup({
      store_name_fr: 'Pizzeria Didouche Prestige',
      store_name_ar: 'بيتزا ديدوش بريستيج',
      address: '45 Rue Didouche Mourad',
      wilaya: '16 - Alger',
      commune: 'Sidi M\'Hamed',
      phone: '0550123987',
      owner_name: 'Amine Propriétaire',
      owner_phone: '0550123987',
      owner_pin: '947261',
      fiscal_regime: 'REEL',
      tva_rate: 19
    });

    // Verify new PIN works
    await authService.logout();
    const relogin = await authService.loginWithPin('947261');
    expect(relogin?.name).toBe('Amine Propriétaire');
  });

  it('4 & 5. Unauthenticated user, cashier/manager, or expired session cannot modify existing configuration, and existing database contents remain unchanged', async () => {
    const dbFile = path.join(tempDir, 'unauth_protection.db');
    sqliteAdapter = new NodeSqliteTestAdapter(dbFile);
    const schemaSql = fs.readFileSync(path.resolve(process.cwd(), 'src/db/schema.sql'), 'utf8');
    sqliteAdapter.raw.exec(schemaSql);
    await db.setCustomAdapter(sqliteAdapter);

    // 1. Configure database and create a cashier user + product
    await authService.completeSetup({
      store_name_fr: 'Pizzeria Protégée',
      store_name_ar: 'بيتزا محمية',
      address: '10 Boulevard Zighoud Youcef',
      wilaya: '16 - Alger',
      commune: 'Alger Centre',
      phone: '0555667788',
      owner_name: 'Farid Owner',
      owner_phone: '0555667788',
      owner_pin: '482915',
      fiscal_regime: 'IFU',
      tva_rate: 0
    });

    await authService.loginWithPin('482915');
    const cashier = await authService.createUser({
      name: 'Samir Caissier',
      role: 'cashier',
      pin: '394827',
      phone: '0559001122'
    });
    expect(cashier.role).toBe('cashier');

    await db.execute(
      `INSERT INTO products (id, store_id, category_id, sku, barcode, name_fr, name_ar, purchase_cost, selling_price_ttc, current_stock, min_stock_alert, is_active, created_at, updated_at)
       VALUES ('prod-marg-01', 'store-alg-01', 'cat-pizza', 'PZ-01', '6130001', 'Pizza Margherita', 'بيتزا مارغريتا', 250, 700, 40, 5, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`
    );

    const storeBefore = await authService.getStore();
    const ownerBefore = (await db.select<any>("SELECT * FROM users WHERE role = 'owner'"))[0];

    // 2. Logout (unauthenticated state) and attempt to overwrite setup or store
    await authService.logout();
    expect(authService.getCurrentUser()).toBeNull();

    await expect(
      authService.completeSetup({
        store_name_fr: 'Pizzeria Pirate',
        address: 'Hack',
        phone: '0000000000',
        owner_name: 'Hacker',
        owner_phone: '0000000000',
        owner_pin: '918273',
        tva_rate: 0
      })
    ).rejects.toThrow(/Action non autorisée/);

    await expect(
      authService.updateStore({
        id: storeBefore?.id,
        name_fr: 'Pizzeria Pirate'
      })
    ).rejects.toThrow(/Action non autorisée/);

    await expect(
      authService.setupDbSecret('999888')
    ).rejects.toThrow(/Action non autorisée/);

    // 3. Login as Cashier and attempt to modify setup or store
    const loggedInCashier = await authService.loginWithPin('394827');
    expect(loggedInCashier?.role).toBe('cashier');

    await expect(
      authService.completeSetup({
        store_name_fr: 'Pizzeria Caissier Non Autorisé',
        address: 'Hack',
        phone: '0000000000',
        owner_name: 'Caissier',
        owner_phone: '0000000000',
        owner_pin: '918273',
        tva_rate: 0
      })
    ).rejects.toThrow(/Action non autorisée/);

    await expect(
      authService.updateStore({
        id: storeBefore?.id,
        name_fr: 'Pizzeria Caissier Non Autorisé'
      })
    ).rejects.toThrow(/Action non autorisée/);

    // 4. Simulate an expired/invalid session token and verify session is cleared to request re-authentication
    await expect(
      authService.completeSetup(
        {
          store_name_fr: 'Pizzeria Session Expirée',
          address: 'Test',
          phone: '0555667788',
          owner_name: 'Farid Owner',
          owner_phone: '0555667788',
          owner_pin: '918273',
          tva_rate: 0
        },
        { token: 'dev-token-expired-nonexistent-owner' }
      )
    ).rejects.toThrow(/Action non autorisée/);

    expect(authService.getCurrentUser()).toBeNull();
    expect(authService.getSessionToken()).toBeNull();

    // 5. Verify all existing database contents (store, owner PIN hash, cashier, product) remain 100% unchanged
    const storeAfter = await authService.getStore();
    expect(storeAfter?.name_fr).toBe('Pizzeria Protégée');
    expect(storeAfter?.phone).toBe('0555667788');

    const ownerAfter = (await db.select<any>("SELECT * FROM users WHERE role = 'owner'"))[0];
    expect(ownerAfter.name).toBe('Farid Owner');
    expect(ownerAfter.pin_hash).toBe(ownerBefore.pin_hash);

    const productsAfter = await db.select<any>('SELECT * FROM products WHERE id = ?', ['prod-marg-01']);
    expect(productsAfter.length).toBe(1);
    expect(productsAfter[0].name_fr).toBe('Pizza Margherita');
    expect(productsAfter[0].current_stock).toBe(40);

    // 6. Verify normal Owner login and startup session restoration still work
    const ownerRelogin = await authService.loginWithPin('482915');
    expect(ownerRelogin?.id).toBe(ownerBefore.id);
    const restoredUser = await authService.initSession();
    expect(restoredUser?.id).toBe(ownerBefore.id);
    expect(restoredUser?.role).toBe('owner');
  });

  const validSampleBackup = JSON.stringify({
    _backup_meta: {
      format: 'AQUADRO_POS_BACKUP_V2',
      schemaVersion: 2,
      exportedAt: '2026-01-01T00:00:00Z',
      appVersion: '1.0.2'
    },
    stores: [
      {
        id: 'store-napoli-01',
        name_fr: 'Pizzeria Napoli Gourmet',
        name_ar: 'بيتزا نابولي الذواقة',
        wilaya: 'Oran',
        commune: 'Oran',
        address: '12 Boulevard de la Soummam',
        phone: '0550998877',
        currency: 'DZD',
        is_active: 1,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z'
      }
    ],
    users: [
      {
        id: 'usr-owner-napoli',
        store_id: 'store-napoli-01',
        name: 'Nadir Propriétaire',
        role: 'owner',
        pin_hash: 'mock_old_hash_to_be_replaced',
        is_active: 1,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z'
      }
    ],
    categories: [
      {
        id: 'cat-pizza',
        name_fr: 'Pizzas',
        name_ar: 'بيتزا',
        created_at: '2026-01-01T00:00:00Z'
      }
    ],
    products: [
      {
        id: 'prod-nap-01',
        store_id: 'store-napoli-01',
        category_id: 'cat-pizza',
        name_fr: 'Pizza 4 Fromages',
        name_ar: 'بيتزا 4 أجبان',
        selling_price_ttc: 900,
        purchase_cost: 350,
        current_stock: 25,
        min_stock_alert: 5,
        is_active: 1,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z'
      }
    ],
    document_sequences: [
      {
        document_type: 'TICKET',
        current_year: 2026,
        last_sequence_number: 10
      }
    ]
  });

  it('4. Secure JSON Restore on unconfigured DB with newOwnerPin establishes new Owner credentials and logs in with new PIN', async () => {
    await db.setCustomAdapter(null);
    await db.resetAll();

    expect(await db.isSetupCompleted()).toBe(false);

    // Execute first-time restore with newOwnerPin
    const success = await backupService.restoreBackup(validSampleBackup, undefined, {
      fromSetup: true,
      newOwnerPin: '739281'
    });
    expect(success).toBe(true);

    // Setup is marked completed
    expect(await db.isSetupCompleted()).toBe(true);

    // Verify restored store and product exist
    const store = await authService.getStore();
    expect(store?.name_fr).toBe('Pizzeria Napoli Gourmet');

    const products = await db.select<any>('SELECT * FROM products WHERE id = ?', ['prod-nap-01']);
    expect(products.length).toBe(1);
    expect(products[0].name_fr).toBe('Pizza 4 Fromages');
    expect(products[0].current_stock).toBe(25);

    // Restored owner account identity is preserved
    const ownerUsers = await db.select<any>("SELECT * FROM users WHERE role = 'owner'");
    expect(ownerUsers.length).toBe(1);
    expect(ownerUsers[0].id).toBe('usr-owner-napoli');
    expect(ownerUsers[0].name).toBe('Nadir Propriétaire');
    expect(ownerUsers[0].pin_hash).not.toBe('mock_old_hash_to_be_replaced');
    expect(ownerUsers[0].pin_hash).not.toBe('739281');

    // Attempting login with dummy or old pin fails
    await expect(authService.loginWithPin('000000')).rejects.toThrow(/Code PIN incorrect/);

    // Logging in with the newly established Owner PIN succeeds
    const successfulLogin = await authService.loginWithPin('739281');
    expect(successfulLogin).not.toBeNull();
    expect(successfulLogin?.id).toBe('usr-owner-napoli');
    expect(successfulLogin?.role).toBe('owner');
    expect(successfulLogin?.name).toBe('Nadir Propriétaire');
  });

  it('5. Secure JSON Restore rejects weak or trivial PINs during setup restoration', async () => {
    await db.setCustomAdapter(null);
    await db.resetAll();

    // Trivial PIN '1234'
    await expect(
      backupService.restoreBackup(validSampleBackup, undefined, {
        fromSetup: true,
        newOwnerPin: '1234'
      })
    ).rejects.toThrow(/trop simple|non conforme|interdit/i);

    // Short PIN '12'
    await expect(
      backupService.restoreBackup(validSampleBackup, undefined, {
        fromSetup: true,
        newOwnerPin: '12'
      })
    ).rejects.toThrow(/entre 4 et 8 chiffres/i);

    // DB remains unconfigured
    expect(await db.isSetupCompleted()).toBe(false);
  });

  it('6. Secure JSON Restore rejects corrupt JSON or backup missing owner account before modifying DB', async () => {
    await db.setCustomAdapter(null);
    await db.resetAll();

    // Corrupt JSON
    await expect(
      backupService.restoreBackup('{ bad: json', undefined, {
        fromSetup: true,
        newOwnerPin: '739281'
      })
    ).rejects.toThrow(/Format JSON corrompu/);

    // Backup missing owner
    const noOwnerBackup = JSON.stringify({
      _backup_meta: { format: 'AQUADRO_POS_BACKUP_V2', schemaVersion: 2 },
      stores: [{ id: 'st-01', name_fr: 'Store', currency: 'DZD' }],
      users: [{ id: 'u-c1', name: 'Caissier Only', role: 'cashier', pin_hash: 'somehash' }],
      products: [{ id: 'p1', store_id: 'st-01', selling_price_ttc: 500, name_fr: 'P1' }]
    });

    await expect(
      backupService.restoreBackup(noOwnerBackup, undefined, {
        fromSetup: true,
        newOwnerPin: '739281'
      })
    ).rejects.toThrow(/aucun compte Propriétaire/i);

    // DB remains unconfigured
    expect(await db.isSetupCompleted()).toBe(false);
  });

  it('7. Already configured DB strictly blocks bypass via fromSetup + newOwnerPin without existing Owner PIN', async () => {
    const dbFile = path.join(tempDir, 'configured_bypass_test.db');
    sqliteAdapter = new NodeSqliteTestAdapter(dbFile);
    const schemaSql = fs.readFileSync(path.resolve(process.cwd(), 'src/db/schema.sql'), 'utf8');
    sqliteAdapter.raw.exec(schemaSql);
    await db.setCustomAdapter(sqliteAdapter);

    // Complete legitimate setup first
    await authService.completeSetup({
      store_name_fr: 'Pizzeria Existante Sécurisée',
      address: 'Alger',
      phone: '0555112233',
      owner_name: 'Propriétaire Légitime',
      owner_phone: '0555112233',
      owner_pin: '839201',
      tva_rate: 0
    });
    expect(await db.isSetupCompleted()).toBe(true);

    await authService.logout();

    // Attempting to overwrite existing DB using fromSetup + newOwnerPin without existing owner PIN is strictly forbidden
    await expect(
      backupService.restoreBackup(validSampleBackup, undefined, {
        fromSetup: true,
        newOwnerPin: '654321'
      })
    ).rejects.toThrow(/Action non autorisée.*Propriétaire/);

    // Also with wrong owner PIN
    await expect(
      backupService.restoreBackup(validSampleBackup, '999999', {
        fromSetup: true,
        newOwnerPin: '654321'
      })
    ).rejects.toThrow(/Action non autorisée.*Propriétaire/);

    // Existing store and owner PIN remain unchanged
    const store = await authService.getStore();
    expect(store?.name_fr).toBe('Pizzeria Existante Sécurisée');

    const validLogin = await authService.loginWithPin('839201');
    expect(validLogin?.name).toBe('Propriétaire Légitime');
  });
});
