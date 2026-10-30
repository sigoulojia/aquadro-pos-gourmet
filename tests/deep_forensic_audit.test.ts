import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { db, SqlAdapter, QueryResult } from '../src/db/sqlite';
import { authService } from '../src/services/auth.service';
import { caisseService } from '../src/services/caisse.service';
import { customerService } from '../src/services/customer.service';
import { supplierService } from '../src/services/supplier.service';
import { purchaseService } from '../src/services/purchase.service';
import { checkoutService } from '../src/services/checkout.service';
import { salesService } from '../src/services/sales.service';
import { expenseService } from '../src/services/expense.service';
import { recipeService } from '../src/services/recipe.service';
import { supplementService } from '../src/services/supplement.service';
import { documentService } from '../src/services/document.service';
import { backupService } from '../src/services/backup.service';
import { reportService } from '../src/services/report.service';
import { periodicReportService } from '../src/services/periodicReport.service';
import { SecurityUtil } from '../src/core/security/security';

class NodeSqliteAdapter implements SqlAdapter {
  public rawDb: DatabaseSync;

  constructor(dbPath: string) {
    this.rawDb = new DatabaseSync(dbPath);
  }

  async execute(query: string, params: any[] = []): Promise<QueryResult> {
    const trimmed = query.trim();
    if (!trimmed) return { rowsAffected: 0 };

    if (params.length === 0 && trimmed.includes(';') && trimmed.split(';').filter(s => s.trim()).length > 1) {
      this.rawDb.exec(trimmed);
      return { rowsAffected: 0 };
    }

    const stmt = this.rawDb.prepare(trimmed);
    const result = stmt.run(...params);
    return {
      rowsAffected: Number(result.changes ?? 0),
      lastInsertId: Number(result.lastInsertRowid ?? 0)
    };
  }

  async select<T = any>(query: string, params: any[] = []): Promise<T[]> {
    const stmt = this.rawDb.prepare(query.trim());
    return stmt.all(...params) as T[];
  }

  close() {
    this.rawDb.close();
  }
}

describe('AQUADRO POS — DEEP FORENSIC AUDIT & COMPLETENESS VERIFICATION SUITE', () => {
  let tempDir: string;
  let dbPath: string;
  let adapter: NodeSqliteAdapter;
  const schemaPath = path.resolve(process.cwd(), 'src/db/schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf-8');

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aquadro-forensic-audit-'));
    dbPath = path.join(tempDir, 'pizzeria_pos.db');
    adapter = new NodeSqliteAdapter(dbPath);
    adapter.rawDb.exec(schemaSql);
    await db.setCustomAdapter(adapter);
  });

  afterEach(async () => {
    await authService.logout();
    await db.setCustomAdapter(null);
    try {
      adapter.close();
    } catch {}
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it('Phase 5 (DEF-E1 & DEF-E2): Safely upgrades a legacy SQLite database with ALTER TABLE image_url, negative stock, and FK child rows without column shifting or data loss', async () => {
    const legacyDbPath = path.join(tempDir, 'legacy_upgrade.db');
    const legacyAdapter = new NodeSqliteAdapter(legacyDbPath);

    // 1. Construct a legacy schema where products originally had 22 columns (no image_url and no CHECK constraint),
    // and image_url was later appended at column 23 via ALTER TABLE
    legacyAdapter.rawDb.exec(`
      CREATE TABLE stores (
        id TEXT PRIMARY KEY, name_fr TEXT NOT NULL, name_ar TEXT NOT NULL,
        address TEXT, wilaya TEXT, commune TEXT, phone TEXT,
        rc_number TEXT, nif_number TEXT, nis_number TEXT, ai_number TEXT,
        currency TEXT DEFAULT 'DZD', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE categories (
        id TEXT PRIMARY KEY, name_fr TEXT NOT NULL, name_ar TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE TABLE brands (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, country TEXT, created_at TEXT NOT NULL
      );
      CREATE TABLE users (
        id TEXT PRIMARY KEY, store_id TEXT REFERENCES stores(id), name TEXT NOT NULL,
        role TEXT NOT NULL, pin_hash TEXT NOT NULL, phone TEXT,
        is_active INTEGER DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE products (
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
        is_active INTEGER DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      ALTER TABLE products ADD COLUMN image_url TEXT;

      CREATE TABLE product_batches (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        batch_number TEXT NOT NULL,
        expiration_date TEXT NOT NULL,
        current_stock REAL NOT NULL DEFAULT 0.0,
        purchase_cost INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
      CREATE TABLE sales (
        id TEXT PRIMARY KEY, receipt_number TEXT UNIQUE NOT NULL, session_id TEXT,
        cashier_id TEXT NOT NULL REFERENCES users(id), customer_id TEXT,
        subtotal_ht INTEGER NOT NULL, discount_amount INTEGER NOT NULL DEFAULT 0,
        tax_amount INTEGER NOT NULL DEFAULT 0, total_ttc INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'COMPLETED', idempotency_key TEXT UNIQUE NOT NULL,
        sync_status TEXT DEFAULT 'PENDING', created_at TEXT NOT NULL
      );
      CREATE TABLE sale_items (
        id TEXT PRIMARY KEY, sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
        product_id TEXT NOT NULL REFERENCES products(id), batch_id TEXT REFERENCES product_batches(id),
        quantity REAL NOT NULL, unit_price_ttc INTEGER NOT NULL, discount_amount INTEGER NOT NULL DEFAULT 0,
        total_ttc INTEGER NOT NULL, unit_purchase_cost_snapshot INTEGER NOT NULL, created_at TEXT NOT NULL
      );
      CREATE TABLE customers (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT, wilaya TEXT, notes TEXT,
        credit_limit INTEGER DEFAULT 0, current_debt INTEGER DEFAULT 0, loyalty_points INTEGER DEFAULT 0,
        created_at TEXT NOT NULL
      );
      CREATE TABLE suppliers (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, contact_person TEXT, phone TEXT, email TEXT,
        rc_number TEXT, nif_number TEXT, current_balance INTEGER DEFAULT 0, created_at TEXT NOT NULL
      );
      CREATE TABLE document_sequences (
        document_type TEXT PRIMARY KEY, current_year INTEGER NOT NULL, last_sequence_number INTEGER NOT NULL
      );
    `);

    const now = '2026-03-01T10:00:00.000Z';
    legacyAdapter.rawDb.exec(`
      INSERT INTO stores (id, name_fr, name_ar, created_at, updated_at) VALUES ('str-leg', 'Legacy Store', 'متجر', '${now}', '${now}');
      INSERT INTO categories (id, name_fr, name_ar, created_at) VALUES ('cat-pizza', 'Pizzas', 'بيتزا', '${now}');
      INSERT INTO users (id, store_id, name, role, pin_hash, is_active, created_at, updated_at)
        VALUES ('usr-leg', 'str-leg', 'Admin', 'owner', 'salt:hash', 1, '${now}', '${now}');
      INSERT INTO products (
        id, store_id, category_id, sku, barcode, name_fr, name_ar,
        purchase_cost, selling_price_ttc, min_selling_price_ttc,
        current_stock, min_stock_alert, is_active, created_at, updated_at, image_url
      ) VALUES (
        'prod-leg-1', 'str-leg', 'cat-pizza', 'SKU-LEG-1', 'BC-LEG-1', 'Pizza Legacy', 'بيتزا',
        250, 700, 600, -3.5, 5.0, 1, '${now}', '${now}', 'data:image/png;base64,LEGACY'
      );
      INSERT INTO product_batches (id, product_id, batch_number, expiration_date, current_stock, purchase_cost, created_at)
        VALUES ('batch-leg-1', 'prod-leg-1', 'LOT-LEG', '2027-12-31', -2.0, 250, '${now}');
      INSERT INTO sales (id, receipt_number, cashier_id, subtotal_ht, total_ttc, idempotency_key, created_at)
        VALUES ('sale-leg-1', 'REC-LEG-001', 'usr-leg', 700, 700, 'idem-leg-1', '${now}');
      INSERT INTO sale_items (id, sale_id, product_id, batch_id, quantity, unit_price_ttc, total_ttc, unit_purchase_cost_snapshot, created_at)
        VALUES ('si-leg-1', 'sale-leg-1', 'prod-leg-1', 'batch-leg-1', 1, 700, 700, 250, '${now}');
    `);

    // 2. Attach legacyAdapter to DatabaseService (triggers ensureEssentialStructure + migrateLegacyDatabaseSchema)
    await db.setCustomAdapter(legacyAdapter);

    // 3. Verify upgraded products table has CHECK(current_stock >= 0.0), clamped stock to 0.0, and preserved exact columns
    const upgradedProduct = (await db.select<any>('SELECT * FROM products WHERE id = ?', ['prod-leg-1']))[0];
    expect(upgradedProduct).toBeDefined();
    expect(upgradedProduct.name_fr).toBe('Pizza Legacy');
    expect(upgradedProduct.current_stock).toBe(0);
    expect(upgradedProduct.image_url).toBe('data:image/png;base64,LEGACY');
    expect(upgradedProduct.is_active).toBe(1);
    expect(upgradedProduct.created_at).toBe(now);
    expect(upgradedProduct.updated_at).toBe(now);

    const upgradedBatch = (await db.select<any>('SELECT * FROM product_batches WHERE id = ?', ['batch-leg-1']))[0];
    expect(upgradedBatch.current_stock).toBe(0);

    // Child sale_items must still exist and pass foreign_key_check
    const childSaleItems = await db.select<any>('SELECT * FROM sale_items WHERE id = ?', ['si-leg-1']);
    expect(childSaleItems.length).toBe(1);
    const fkViolations = await db.select<any>('PRAGMA foreign_key_check;');
    expect(fkViolations.length).toBe(0);

    // Verify supplier_payments table was also created
    const supTables = await db.select<any>("SELECT name FROM sqlite_master WHERE type='table' AND name='supplier_payments'");
    expect(supTables.length).toBe(1);

    legacyAdapter.close();
  });

  it('Phase 3 & 4 (DEF-E2, DEF-E3, DEF-E5): Enforces strict financial input validation, supplier payments persistence, and invoice SQL column integrity', async () => {
    await authService.completeSetup({
      store_name: 'Aquadro Validation Store',
      address: 'Alger',
      phone: '0550112233',
      owner_name: 'Owner',
      owner_pin: '2580'
    });
    const owner = await authService.loginWithPin('2580');
    expect(owner).not.toBeNull();

    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO products (
        id, store_id, category_id, sku, barcode, name_fr, name_ar,
        purchase_cost, selling_price_ttc, min_selling_price_ttc,
        current_stock, min_stock_alert, is_active, created_at, updated_at
      ) VALUES ('prod-val-1', 'store-alg-01', 'cat-drink', 'SKU-VAL-1', 'BC-VAL-1', 'Eau Minérale', 'ماء', 30, 60, 40, 50, 5, 1, ?, ?)`,
      [now, now]
    );

    // 1. Checkout validation guards (DEF-E5)
    await expect(
      checkoutService.processCheckout({
        cashierId: owner!.id,
        cashierName: owner!.name,
        items: [{ productId: 'prod-val-1', name: 'Eau', quantity: -2, unitPrice: 60, discountAmount: 0 }],
        payments: [{ method: 'CASH', amount: 120, tenderedAmount: 120, changeGiven: 0 }]
      })
    ).rejects.toThrow(/Quantité invalide/i);

    await expect(
      checkoutService.processCheckout({
        cashierId: owner!.id,
        cashierName: owner!.name,
        items: [{ productId: 'prod-val-1', name: 'Eau', quantity: Number.NaN, unitPrice: 60, discountAmount: 0 }],
        payments: [{ method: 'CASH', amount: 120, tenderedAmount: 120, changeGiven: 0 }]
      })
    ).rejects.toThrow(/Quantité invalide/i);

    await expect(
      checkoutService.processCheckout({
        cashierId: owner!.id,
        cashierName: owner!.name,
        items: [{ productId: 'prod-val-1', name: 'Eau', quantity: 1, unitPrice: -60, discountAmount: 0 }],
        payments: [{ method: 'CASH', amount: 60, tenderedAmount: 60, changeGiven: 0 }]
      })
    ).rejects.toThrow(/Prix unitaire invalide/i);

    await expect(
      checkoutService.processCheckout({
        cashierId: owner!.id,
        cashierName: owner!.name,
        items: [{ productId: 'prod-val-1', name: 'Eau', quantity: 1, unitPrice: 60, discountAmount: 0 }],
        payments: [{ method: 'CASH', amount: 60, tenderedAmount: 40, changeGiven: 0 }]
      })
    ).rejects.toThrow(/montant espèces remis est inférieur/i);

    // 2. Supplier lifecycle & supplier_payments persistence on real SQLite (DEF-E2 & DEF-E5)
    const supplier = await supplierService.createSupplier({
      name: 'Moulin d’Algérie',
      contact_person: 'Karim',
      phone: '0555998877'
    });
    const po = await purchaseService.createPurchase({
      supplierId: supplier.id,
      items: [{ productId: 'prod-val-1', productName: 'Eau Minérale', quantity: 20, purchaseCost: 35 }]
    });
    await purchaseService.receivePurchase(po.id, owner!.id);

    const supAfterPo = (await supplierService.getSuppliers()).find(s => s.id === supplier.id)!;
    expect(supAfterPo.current_balance).toBe(700); // 20 * 35

    await expect(
      supplierService.recordSupplierPayment({
        supplierId: supplier.id,
        amount: -100,
        paymentMethod: 'CASH',
        cashierId: owner!.id
      })
    ).rejects.toThrow(/supérieur à zéro/i);

    const supPay = await supplierService.recordSupplierPayment({
      supplierId: supplier.id,
      amount: 300,
      paymentMethod: 'CASH',
      reference: 'REG-SUP-01',
      cashierId: owner!.id
    });
    expect(supPay.amount).toBe(300);

    const supAfterPay = (await supplierService.getSuppliers()).find(s => s.id === supplier.id)!;
    expect(supAfterPay.current_balance).toBe(400);

    const dbSupPayments = await db.select<any>('SELECT * FROM supplier_payments WHERE id = ?', [supPay.id]);
    expect(dbSupPayments.length).toBe(1);
    expect(dbSupPayments[0].amount).toBe(300);

    // 3. Commercial Invoice SQL columns & getDocumentItems (DEF-E3)
    const invoiceDoc = await documentService.createInvoice({
      customerName: 'SARL Gourmet Events',
      customerNif: '001916099112233',
      customerRc: '16/00-998877B19',
      totalTtc: 4500,
      notes: 'Buffet Entreprise',
      items: [
        { name: 'Plateau Pizza Margherita Géante', quantity: 3, unitPrice: 1500, total: 4500 }
      ]
    });
    expect(invoiceDoc.document_type).toBe('FACTURE');

    const docItems = await documentService.getDocumentItems(invoiceDoc);
    expect(docItems.length).toBe(1);
    expect(docItems[0].name).toBe('Plateau Pizza Margherita Géante');
    expect(docItems[0].quantity).toBe(3);
    expect(docItems[0].unit_price).toBe(1500);
    expect(docItems[0].total_price).toBe(4500);
  });

  it('Phase 4 (DEF-E4): Deducts recipe ingredients, multi-part 50/50 pizza ingredients, and supplements during checkout, snapshots recipe+supplement COGS, and restores them on refund', async () => {
    await authService.completeSetup({
      store_name: 'Pizzeria Recette Test',
      address: 'Oran',
      phone: '0550445566',
      owner_name: 'Chef Owner',
      owner_pin: '2580'
    });
    const owner = await authService.loginWithPin('2580');
    expect(owner).not.toBeNull();

    // 1. Create Ingredients
    const farine = await recipeService.createIngredient({
      name_fr: 'Farine Supérieure',
      unit: 'kg',
      current_stock: 10,     // 10 kg
      min_stock_alert: 2,
      cost_per_unit: 100     // 100 DA / kg
    });
    const mozza = await recipeService.createIngredient({
      name_fr: 'Mozzarella Fior',
      unit: 'kg',
      current_stock: 5,      // 5 kg
      min_stock_alert: 1,
      cost_per_unit: 1200    // 1200 DA / kg
    });
    const poulet = await recipeService.createIngredient({
      name_fr: 'Blanc de Poulet',
      unit: 'kg',
      current_stock: 4,      // 4 kg
      min_stock_alert: 1,
      cost_per_unit: 1000    // 1000 DA / kg
    });

    // 2. Create Supplement
    const suppCheddar = await supplementService.addSupplement({
      name_fr: 'Extra Cheddar',
      price: 150,
      purchase_cost: 60,
      current_stock: 20,
      min_stock_alert: 5
    });

    // 3. Create 2 Pizzas with purchase_cost = 0 on products (cost comes from recipes)
    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO products (
        id, store_id, category_id, sku, barcode, name_fr, name_ar,
        purchase_cost, selling_price_ttc, min_selling_price_ttc,
        current_stock, min_stock_alert, is_active, created_at, updated_at
      ) VALUES
        ('prod-piz-marg', 'store-alg-01', 'cat-pizza', 'SKU-MARG', 'BC-MARG', 'Pizza Margherita', 'مارغريتا', 0, 600, 500, 100, 5, 1, ?, ?),
        ('prod-piz-poul', 'store-alg-01', 'cat-pizza', 'SKU-POUL', 'BC-POUL', 'Pizza Poulet', 'دجاج', 0, 800, 600, 100, 5, 1, ?, ?)`,
      [now, now, now, now]
    );

    // Margherita recipe: 0.25 kg Farine (25 DA) + 0.15 kg Mozza (180 DA) => Recipe cost = 205 DA
    await recipeService.saveRecipe('prod-piz-marg', [
      { ingredient_id: farine.id, quantity_required: 0.25, unit_display: 'g' },
      { ingredient_id: mozza.id, quantity_required: 0.15, unit_display: 'g' }
    ]);

    // Poulet recipe: 0.25 kg Farine (25 DA) + 0.15 kg Mozza (180 DA) + 0.10 kg Poulet (100 DA) => Recipe cost = 305 DA
    await recipeService.saveRecipe('prod-piz-poul', [
      { ingredient_id: farine.id, quantity_required: 0.25, unit_display: 'g' },
      { ingredient_id: mozza.id, quantity_required: 0.15, unit_display: 'g' },
      { ingredient_id: poulet.id, quantity_required: 0.10, unit_display: 'g' }
    ]);

    // 4. Checkout:
    // - 2x Pizza Margherita + 1x Extra Cheddar each (unitPrice = 600 + 150 = 750; unitCost = 205 + 60 = 265 DA; 2 units = 530 DA COGS)
    // - 1x Multi-part 50/50 (Margherita + Poulet) (unitPrice = 800; unitCost = 0.5*205 + 0.5*305 = 255 DA)
    const sale = await checkoutService.processCheckout({
      cashierId: owner!.id,
      cashierName: owner!.name,
      deductRecipeAndSupplements: true,
      items: [
        {
          productId: 'prod-piz-marg',
          name: 'Pizza Margherita (+Extra Cheddar)',
          quantity: 2,
          unitPrice: 750,
          discountAmount: 0,
          supplements: [{ id: suppCheddar.id, name_fr: 'Extra Cheddar', price: 150, purchase_cost: 60, quantity: 1 }]
        },
        {
          productId: 'multi-5050-test',
          name: 'Pizza 2 Parties (Margherita / Poulet)',
          quantity: 1,
          unitPrice: 800,
          discountAmount: 0,
          multiParts: [
            { id: 'prod-piz-marg', name: 'Pizza Margherita', price: 600 },
            { id: 'prod-piz-poul', name: 'Pizza Poulet', price: 800 }
          ]
        }
      ],
      payments: [{ method: 'CASH', amount: 2300, tenderedAmount: 2300, changeGiven: 0 }]
    });

    expect(sale.total_ttc).toBe(2300);

    // 5. Verify ingredient deductions:
    // Farine: 2 * 0.25 + 1 * (0.5*0.25 + 0.5*0.25) = 0.50 + 0.25 = 0.75 kg deducted -> 10 - 0.75 = 9.25 kg
    // Mozza:  2 * 0.15 + 1 * (0.5*0.15 + 0.5*0.15) = 0.30 + 0.15 = 0.45 kg deducted -> 5 - 0.45 = 4.55 kg
    // Poulet: 1 * (0.5*0.10) = 0.05 kg deducted -> 4 - 0.05 = 3.95 kg
    const ingAfterSale = await recipeService.getIngredients();
    const farineAfter = ingAfterSale.find(i => i.id === farine.id)!;
    const mozzaAfter = ingAfterSale.find(i => i.id === mozza.id)!;
    const pouletAfter = ingAfterSale.find(i => i.id === poulet.id)!;

    expect(farineAfter.current_stock).toBeCloseTo(9.25, 5);
    expect(mozzaAfter.current_stock).toBeCloseTo(4.55, 5);
    expect(pouletAfter.current_stock).toBeCloseTo(3.95, 5);

    // Verify supplement stock deducted by 2 (from 20 to 18)
    const suppsAfterSale = await supplementService.getSupplements(true);
    expect(suppsAfterSale.find(s => s.id === suppCheddar.id)!.current_stock).toBe(18);

    // Verify historical COGS snapshot on sale_items: 2 * 265 + 1 * 255 = 785 DA
    const metricsAfterSale = await reportService.getFinancialMetrics();
    expect(metricsAfterSale.revenue).toBe(2300);
    expect(metricsAfterSale.cogs).toBe(785);
    expect(metricsAfterSale.grossMargin).toBe(2300 - 785);

    // 6. Refund 1x Pizza Margherita and 1x Multi-part 50/50 pizza with restock: true
    const fullSale = await salesService.getSaleById(sale.id);
    const margSaleItem = fullSale!.items!.find(i => i.product_id === 'prod-piz-marg')!;
    const multiSaleItem = fullSale!.items!.find(i => i.product_id === 'multi-5050-test')!;

    await salesService.processRefund({
      saleId: sale.id,
      cashierId: owner!.id,
      cashierName: owner!.name,
      reason: 'Erreur commande',
      paymentMethod: 'CASH',
      itemsToRefund: [
        { saleItemId: margSaleItem.id, productId: 'prod-piz-marg', quantity: 1, restock: true },
        { saleItemId: multiSaleItem.id, productId: 'multi-5050-test', quantity: 1, restock: true }
      ]
    });

    // Verify ingredients & supplements restored for the refunded items:
    // Remaining sold: 1x Pizza Margherita (0.25 Farine, 0.15 Mozza, 0 Poulet, 1 Extra Cheddar)
    const ingAfterRefund = await recipeService.getIngredients();
    expect(ingAfterRefund.find(i => i.id === farine.id)!.current_stock).toBeCloseTo(9.75, 5);
    expect(ingAfterRefund.find(i => i.id === mozza.id)!.current_stock).toBeCloseTo(4.85, 5);
    expect(ingAfterRefund.find(i => i.id === poulet.id)!.current_stock).toBeCloseTo(4.0, 5);

    const suppsAfterRefund = await supplementService.getSupplements(true);
    expect(suppsAfterRefund.find(s => s.id === suppCheddar.id)!.current_stock).toBe(19);

    // Net revenue = 750 DA, Net COGS = 265 DA
    const metricsAfterRefund = await reportService.getFinancialMetrics();
    expect(metricsAfterRefund.revenue).toBe(750);
    expect(metricsAfterRefund.cogs).toBe(265);
  });

  it('Phase 7 (DEF-E6): Enforces PIN security policy, salted hashing, RBAC matrix across owner/manager/cashier, and last-active-owner protection', async () => {
    // 1. Weak PIN rejection
    expect(SecurityUtil.validateNewPin('0000').valid).toBe(false);
    expect(SecurityUtil.validateNewPin('1234').valid).toBe(false);
    expect(SecurityUtil.validateNewPin('9999').valid).toBe(false);
    expect(SecurityUtil.validateNewPin('12').valid).toBe(false);
    expect(SecurityUtil.validateNewPin('2580').valid).toBe(true);

    await authService.completeSetup({
      store_name: 'Aquadro Security Store',
      address: 'Constantine',
      phone: '0550778899',
      owner_name: 'Owner Principal',
      owner_pin: '2580'
    });

    const owner = await authService.loginWithPin('2580');
    expect(owner).not.toBeNull();
    expect(owner!.role).toBe('owner');

    // Verify PIN hash is salted (never plaintext)
    const dbUsers = await db.select<any>('SELECT * FROM users WHERE id = ?', [owner!.id]);
    expect(dbUsers[0].pin_hash).not.toBe('2580');
    expect(dbUsers[0].pin_hash.includes(':')).toBe(true);

    // 2. Owner creates a Manager and a Cashier
    const manager = await authService.createUser({
      name: 'Manager Test',
      role: 'manager',
      pin: '3691'
    });
    const cashier = await authService.createUser({
      name: 'Cashier Test',
      role: 'cashier',
      pin: '1470'
    });

    // Cannot deactivate the last active owner
    await expect(authService.deactivateUser(owner!.id)).rejects.toThrow(/dernier compte propriétaire actif/i);

    // 3. Log in as Cashier -> must NOT be allowed to create users, update PINs, or deactivate users
    await authService.loginWithPin('1470');
    expect(authService.getCurrentUser()?.role).toBe('cashier');
    expect(authService.hasPermission('users.manage')).toBe(false);
    expect(authService.hasPermission('pos.checkout')).toBe(true);

    await expect(
      authService.createUser({ name: 'Rogue Admin', role: 'owner', pin: '7531' })
    ).rejects.toThrow(/Accès refusé/i);

    await expect(
      authService.updateUserPin(owner!.id, '8520')
    ).rejects.toThrow(/Accès refusé/i);

    await expect(
      authService.deactivateUser(manager.id)
    ).rejects.toThrow(/Accès refusé/i);

    // 4. Log in as Manager -> must NOT be allowed to manage users or restore backups
    await authService.loginWithPin('3691');
    expect(authService.getCurrentUser()?.role).toBe('manager');
    expect(authService.hasPermission('users.manage')).toBe(false);
    expect(authService.hasPermission('backup.restore')).toBe(false);

    await expect(
      authService.createUser({ name: 'Manager SubUser', role: 'cashier', pin: '9513' })
    ).rejects.toThrow(/Accès refusé/i);

    // 5. Reset & Danger Zone protection: verifyOwnerPin and verifyRecoveryCode must reject '1234', '0000', 'RESET', Cashier PIN, and Manager PIN
    const { usageSessionService } = await import('../src/services/usageSession.service');
    expect((await authService.verifyOwnerPin('1234')).valid).toBe(false);
    expect((await authService.verifyOwnerPin('0000')).valid).toBe(false);
    expect((await authService.verifyOwnerPin('RESET')).valid).toBe(false);
    expect((await authService.verifyOwnerPin('1470')).valid).toBe(false); // Cashier PIN rejected
    expect((await authService.verifyOwnerPin('3691')).valid).toBe(false); // Manager PIN rejected
    expect((await authService.verifyOwnerPin('2580')).valid).toBe(true);  // Real Owner PIN accepted

    expect((await usageSessionService.verifyRecoveryCode('1234')).valid).toBe(false);
    expect((await usageSessionService.verifyRecoveryCode('0000')).valid).toBe(false);
    expect((await usageSessionService.verifyRecoveryCode('RESET')).valid).toBe(false);
    expect((await usageSessionService.verifyRecoveryCode('3691')).valid).toBe(false);
    expect((await usageSessionService.verifyRecoveryCode('2580')).valid).toBe(true);
  });

  it('Phase 6 & Phase 8: Full Backup/Restore state equivalence and Independent Raw-SQLite Financial Reconciliation', async () => {
    await authService.completeSetup({
      store_name: 'Aquadro Forensic Complete',
      address: 'Annaba',
      phone: '0550009988',
      owner_name: 'Owner Forensic',
      owner_pin: '2580'
    });
    const owner = await authService.loginWithPin('2580');
    expect(owner).not.toBeNull();

    // Seed product with batch
    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO products (
        id, store_id, category_id, sku, barcode, name_fr, name_ar,
        purchase_cost, selling_price_ttc, min_selling_price_ttc,
        current_stock, min_stock_alert, is_active, created_at, updated_at
      ) VALUES ('prod-rec-1', 'store-alg-01', 'cat-pizza', 'SKU-REC-1', 'BC-REC-1', 'Pizza Royale', 'رويال', 350, 900, 750, 30, 5, 1, ?, ?)`,
      [now, now]
    );
    await db.execute(
      `INSERT INTO product_batches (id, product_id, batch_number, expiration_date, current_stock, purchase_cost, created_at)
       VALUES ('batch-rec-1', 'prod-rec-1', 'LOT-ROY-1', '2027-12-31', 30, 350, ?)`,
      [now]
    );

    const session = await caisseService.openShift({
      cashierId: owner!.id,
      cashierName: owner!.name,
      openingFloat: 4000
    });

    const customer = await customerService.createCustomer({
      name: 'Client Forensic',
      phone: '0661223344',
      credit_limit: 10000
    });

    // Sale 1: 2x Pizza Royale (1800 DA) paid 1000 CASH + 800 CREDIT
    const sale1 = await checkoutService.processCheckout({
      cashierId: owner!.id,
      cashierName: owner!.name,
      sessionId: session.id,
      customerId: customer.id,
      customerName: customer.name,
      items: [{ productId: 'prod-rec-1', name: 'Pizza Royale', quantity: 2, unitPrice: 900, discountAmount: 0 }],
      payments: [
        { method: 'CASH', amount: 1000, tenderedAmount: 1000, changeGiven: 0 },
        { method: 'CREDIT', amount: 800, tenderedAmount: 800, changeGiven: 0 }
      ]
    });

    // Sale 2: 1x Pizza Royale (900 DA) paid 900 CIB
    await checkoutService.processCheckout({
      cashierId: owner!.id,
      cashierName: owner!.name,
      sessionId: session.id,
      items: [{ productId: 'prod-rec-1', name: 'Pizza Royale', quantity: 1, unitPrice: 900, discountAmount: 0 }],
      payments: [{ method: 'CIB', amount: 900, tenderedAmount: 900, changeGiven: 0 }]
    });

    // Partial refund on Sale 1: 1x Pizza Royale (900 DA) refunded via CREDIT
    const fullSale1 = await salesService.getSaleById(sale1.id);
    await salesService.processRefund({
      saleId: sale1.id,
      cashierId: owner!.id,
      cashierName: owner!.name,
      reason: 'Retour client',
      paymentMethod: 'CREDIT',
      itemsToRefund: [{ saleItemId: fullSale1!.items![0].id, productId: 'prod-rec-1', quantity: 1, restock: true }]
    });

    // Operating expense: 400 DA CASH
    const todayStr = new Date().toISOString().slice(0, 10);
    await expenseService.createExpense({
      category: 'OTHER',
      amount: 400,
      paymentMethod: 'CASH',
      description: 'Achat serviettes',
      date: todayStr,
      userId: owner!.id,
      userName: owner!.name,
      sessionId: session.id
    });

    // Independent Raw-SQLite Calculation (Phase 8)
    const rawSalesSum = (await db.select<any>("SELECT SUM(total_ttc) as s FROM sales WHERE status != 'CANCELLED'"))[0].s;
    const rawRefundsSum = (await db.select<any>('SELECT SUM(refund_amount) as r FROM refunds'))[0].r;
    const rawSaleItemsCogs = (await db.select<any>(
      "SELECT SUM(si.quantity * si.unit_purchase_cost_snapshot) as c FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE s.status != 'CANCELLED'"
    ))[0].c;
    const rawRefundItemsCogs = (await db.select<any>(
      'SELECT SUM(ri.quantity * ri.unit_purchase_price) as rc FROM refund_items ri'
    ))[0].rc;
    const rawExpensesSum = (await db.select<any>('SELECT SUM(amount) as e FROM expenses'))[0].e;

    const expectedNetRevenue = Number(rawSalesSum) - Number(rawRefundsSum); // 2700 - 900 = 1800
    const expectedNetCogs = Number(rawSaleItemsCogs) - Number(rawRefundItemsCogs); // 1050 - 350 = 700
    const expectedGrossProfit = expectedNetRevenue - expectedNetCogs; // 1800 - 700 = 1100
    const expectedNetProfit = expectedGrossProfit - Number(rawExpensesSum); // 1100 - 400 = 700

    const metrics = await reportService.getFinancialMetrics(todayStr);
    expect(metrics.revenue).toBe(expectedNetRevenue);
    expect(metrics.cogs).toBe(expectedNetCogs);
    expect(metrics.grossMargin).toBe(expectedGrossProfit);
    expect(metrics.operatingExpenses).toBe(Number(rawExpensesSum));
    expect(metrics.netResult).toBe(expectedNetProfit);

    const dailyReport = await periodicReportService.getDailyReport(todayStr);
    expect(dailyReport.metrics.totalRevenue).toBe(expectedNetRevenue);
    expect(dailyReport.metrics.cogs).toBe(expectedNetCogs);
    expect(dailyReport.metrics.netProfit).toBe(expectedNetProfit);

    const zReport = await caisseService.getZReportData(session.id);
    // Expected drawer: 4000 (opening) + 1000 (cash sales) - 0 (credit refund did not touch cash) - 400 (cash expense) = 4600
    expect(zReport.session.expected_cash_drawer).toBe(4600);

    // Phase 6: Full Backup Export -> Mutate DB -> Restore -> Verify Exact Equivalence
    const backupMeta = await backupService.exportJsonBackup();
    const backupJson = backupMeta.jsonContent!;
    expect(typeof backupJson).toBe('string');

    // Reject wrong Owner PIN
    await expect(
      backupService.restoreBackup(backupJson, '9999')
    ).rejects.toThrow(/Propriétaire|Owner|autorisé/i);

    // Mutate DB (delete expenses and sales)
    await db.resetTransactionsOnly();
    const metricsAfterWipe = await reportService.getFinancialMetrics(todayStr);
    expect(metricsAfterWipe.revenue).toBe(0);

    // Restore backup with valid Owner PIN
    const restoreRes = await backupService.restoreBackup(backupJson, '2580');
    expect(restoreRes).toBe(true);

    const metricsAfterRestore = await reportService.getFinancialMetrics(todayStr);
    expect(metricsAfterRestore.revenue).toBe(expectedNetRevenue);
    expect(metricsAfterRestore.cogs).toBe(expectedNetCogs);
    expect(metricsAfterRestore.operatingExpenses).toBe(Number(rawExpensesSum));
    expect(metricsAfterRestore.netResult).toBe(expectedNetProfit);
  });
});
