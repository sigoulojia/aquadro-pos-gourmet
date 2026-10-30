import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
// @ts-ignore - node:sqlite is built-in in Node.js 22+
import { DatabaseSync } from 'node:sqlite';
import { db, SqlAdapter, QueryResult } from '../src/db/sqlite';
import { authService } from '../src/services/auth.service';
import { backupService } from '../src/services/backup.service';
import { productService } from '../src/services/product.service';
import { recipeService } from '../src/services/recipe.service';
import { supplementService } from '../src/services/supplement.service';
import { inventoryService } from '../src/services/inventory.service';
import { purchaseService } from '../src/services/purchase.service';
import { supplierService } from '../src/services/supplier.service';
import { customerService } from '../src/services/customer.service';
import { caisseService } from '../src/services/caisse.service';
import { checkoutService } from '../src/services/checkout.service';
import { salesService } from '../src/services/sales.service';
import { expenseService } from '../src/services/expense.service';
import { reportService } from '../src/services/report.service';
import { periodicReportService } from '../src/services/periodicReport.service';
import { syncService } from '../src/services/sync.service';
import { licenseService } from '../src/services/license.service';
import { printerService } from '../src/services/printer.service';

const SCHEMA_SQL_PATH = path.resolve(__dirname, '../src/db/schema.sql');
const SCHEMA_SQL = fs.readFileSync(SCHEMA_SQL_PATH, 'utf8');

function createIsolatedFileSqliteAdapter(dbFilePath: string): {
  adapter: SqlAdapter;
  rawDb: InstanceType<typeof DatabaseSync>;
  close: () => void;
} {
  const rawDb = new DatabaseSync(dbFilePath);
  rawDb.exec('PRAGMA journal_mode = WAL;');
  rawDb.exec('PRAGMA foreign_keys = ON;');
  rawDb.exec('PRAGMA busy_timeout = 5000;');
  rawDb.exec(SCHEMA_SQL);

  const migrationStatements = [
    "ALTER TABLE stores ADD COLUMN name_fr TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE stores ADD COLUMN name_ar TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE stores ADD COLUMN wilaya TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE stores ADD COLUMN commune TEXT NOT NULL DEFAULT ''",
    'ALTER TABLE stores ADD COLUMN email TEXT',
    "ALTER TABLE stores ADD COLUMN fiscal_regime TEXT NOT NULL DEFAULT 'IFU'",
    'ALTER TABLE stores ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1',
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
        (upper === 'BEGIN' ||
          upper.startsWith('BEGIN IMMEDIATE') ||
          upper.startsWith('BEGIN TRANSACTION') ||
          upper === 'COMMIT' ||
          upper === 'END TRANSACTION' ||
          upper === 'ROLLBACK' ||
          upper.startsWith('PRAGMA') ||
          upper.startsWith('CREATE TABLE') ||
          upper.startsWith('ALTER TABLE')) &&
        params.length === 0
      ) {
        rawDb.exec(trimmed);
        return { rowsAffected: 0 };
      }
      const stmt = rawDb.prepare(trimmed);
      const normalizedParams = params.map(p => (p === undefined ? null : p));
      const res = stmt.run(...normalizedParams);
      return {
        rowsAffected: Number(res.changes || 0),
        lastInsertId: Number(res.lastInsertRowid || 0)
      };
    },
    async select<T = any>(query: string, params: any[] = []): Promise<T[]> {
      const trimmed = query.trim();
      const stmt = rawDb.prepare(trimmed);
      const normalizedParams = params.map(p => (p === undefined ? null : p));
      return stmt.all(...normalizedParams) as T[];
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

describe('AQUADRO POS — Fast Track to Final Release (Batches A–E & E2E Acceptance)', () => {
  let tempDir: string;
  let dbFilePath: string;
  let sqliteHandle: ReturnType<typeof createIsolatedFileSqliteAdapter> | null = null;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aquadro-release-e2e-'));
    dbFilePath = path.join(tempDir, 'test_release_pos.db');
    sqliteHandle = createIsolatedFileSqliteAdapter(dbFilePath);
    db.setCustomAdapter(sqliteHandle.adapter);
    await db.ensureEssentialStructure(sqliteHandle.adapter);
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }

    await authService.completeSetup({
      store_name_fr: 'Aquadro Pizzeria Release',
      store_name_ar: 'بيتزيريا أكوادرو',
      address: '10 Rue Didouche Mourad, Alger',
      wilaya: '16 - Alger',
      commune: 'Alger Centre',
      phone: '0550112233',
      email: 'contact@aquadro.dz',
      rc: '16/00-998877B20',
      nif: '002016998877001',
      nis: '002016009988',
      fiscal_regime: 'IFU',
      tva_rate: 0,
      owner_name: 'Karim Propriétaire',
      owner_phone: '0550112233',
      owner_pin: '842917'
    });
  });

  afterEach(() => {
    db.setCustomAdapter(null);
    if (sqliteHandle) {
      sqliteHandle.close();
      sqliteHandle = null;
    }
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it('Batch A & B: Single batch stock deduction on checkout (no 2x deduction bug), supplier purchase receipt, and recipe/supplement stock flow', async () => {
    // 1. Create supplier & drink product with initial batch
    const supplier = await supplierService.createSupplier({
      name: 'Boissons Algérie Distribution',
      phone: '021445566',
      wilaya: '16 - Alger'
    });

    const drink = await productService.createProduct({
      sku: 'DRK-SELECTO-1L',
      barcode: '6130001112223',
      name_fr: 'Hamoud Selecto 1L',
      name_ar: 'حمود سلكتو 1 لتر',
      category_id: 'cat-drink',
      purchase_cost: 90,
      selling_price_ttc: 150,
      current_stock: 10,
      initial_batch_number: 'LOT-SEL-01',
      initial_expiration_date: '2027-06-30'
    });

    // Verify initial batch & global stock = 10
    let batches = await inventoryService.getProductBatches(drink.id);
    expect(batches).toHaveLength(1);
    expect(batches[0].current_stock).toBe(10);

    // 2. Sell 3 units of Hamoud Selecto 1L
    await checkoutService.processCheckout({
      cashierId: 'usr-owner-01',
      cashierName: 'Karim Propriétaire',
      items: [
        {
          productId: drink.id,
          name: drink.name_fr,
          quantity: 3,
          unitPrice: 150,
          discountAmount: 0
        }
      ],
      payments: [
        {
          method: 'CASH',
          amount: 450,
          tenderedAmount: 500,
          changeGiven: 50
        }
      ]
    });

    // Both global product stock AND batch stock must be 10 - 3 = 7 (not 10 - 6 = 4!)
    const updatedDrink = await productService.getProductById(drink.id);
    expect(updatedDrink?.current_stock).toBe(7);

    batches = await inventoryService.getProductBatches(drink.id);
    expect(batches[0].current_stock).toBe(7);

    // 3. Create and receive a supplier purchase order (+20 units in a new batch)
    const po = await purchaseService.createPurchase({
      supplierId: supplier.id,
      items: [
        {
          productId: drink.id,
          productName: drink.name_fr,
          quantity: 20,
          purchaseCost: 95,
          batchNumber: 'LOT-SEL-02',
          expirationDate: '2027-12-31'
        }
      ]
    });
    await purchaseService.receivePurchase(po.id, 'usr-owner-01');

    const afterPoDrink = await productService.getProductById(drink.id);
    expect(afterPoDrink?.current_stock).toBe(27);

    const updatedSupplier = (await supplierService.getSuppliers()).find(s => s.id === supplier.id);
    expect(updatedSupplier?.current_balance).toBe(20 * 95);
  });

  it('Batch A: Credit sales, customer debt payments without double counting, and credit refund debt reversal', async () => {
    const customer = await customerService.createCustomer({
      name: 'Amine Benali',
      phone: '0551223344',
      wilaya: '16 - Alger',
      credit_limit: 10000
    });

    const pizza = await productService.createProduct({
      sku: 'PZ-BOISEE',
      barcode: '6130005556667',
      name_fr: 'Pizza Boisée Poulet',
      name_ar: 'بيتزا بوازيه بالدجاج',
      category_id: 'cat-pizza',
      purchase_cost: 300,
      selling_price_ttc: 900,
      current_stock: 20
    });

    // 1. Reject CREDIT sale without customerId
    await expect(
      checkoutService.processCheckout({
        cashierId: 'usr-owner-01',
        cashierName: 'Karim Propriétaire',
        items: [{ productId: pizza.id, name: pizza.name_fr, quantity: 1, unitPrice: 900, discountAmount: 0 }],
        payments: [{ method: 'CREDIT', amount: 900, tenderedAmount: 900, changeGiven: 0 }]
      })
    ).rejects.toThrow(/client/i);

    // 2. Process valid CREDIT sale for 2 pizzas (1800 DA)
    const creditSale = await checkoutService.processCheckout({
      cashierId: 'usr-owner-01',
      cashierName: 'Karim Propriétaire',
      customerId: customer.id,
      customerName: customer.name,
      items: [{ productId: pizza.id, name: pizza.name_fr, quantity: 2, unitPrice: 900, discountAmount: 0 }],
      payments: [{ method: 'CREDIT', amount: 1800, tenderedAmount: 1800, changeGiven: 0 }]
    });

    // Debt must be exactly 1800 DA (no double counting) and loyalty points = 18
    let refreshedCustomer = await customerService.getCustomerById(customer.id);
    expect(refreshedCustomer?.current_debt).toBe(1800);
    expect(refreshedCustomer?.loyalty_points).toBe(18);

    // 3. Customer pays 800 DA toward their debt -> debt becomes 1000 DA, and sales revenue remains 1800 DA (no revenue double counting)
    await customerService.recordCreditPayment({
      customerId: customer.id,
      amount: 800,
      paymentMethod: 'CASH',
      cashierId: 'usr-owner-01',
      reference: 'ACOMPTE-01'
    });

    refreshedCustomer = await customerService.getCustomerById(customer.id);
    expect(refreshedCustomer?.current_debt).toBe(1000);

    const metricsBeforeRefund = await reportService.getFinancialMetrics('ALL');
    expect(metricsBeforeRefund.grossRevenue).toBe(1800);
    expect(metricsBeforeRefund.revenue).toBe(1800);
    expect(metricsBeforeRefund.debts.customerTotalDebt).toBe(1000);

    // 4. Refund 1 pizza (900 DA) from the CREDIT sale -> customer debt is reduced by 900 DA to 100 DA!
    const fullCreditSale = await salesService.getSaleById(creditSale.id);
    const saleItem = fullCreditSale!.items![0];

    await salesService.processRefund({
      saleId: creditSale.id,
      cashierId: 'usr-owner-01',
      cashierName: 'Karim Propriétaire',
      itemsToRefund: [
        {
          saleItemId: saleItem.id,
          productId: pizza.id,
          quantity: 1,
          unitPrice: 900,
          unitPurchasePrice: 300,
          restock: true
        }
      ],
      reason: 'Retour 1 pizza sur vente crédit'
    });

    refreshedCustomer = await customerService.getCustomerById(customer.id);
    expect(refreshedCustomer?.current_debt).toBe(100);
  });

  it('Batch A, B & C: Cumulative partial refunds, over-refund protection, sanitized PIN marker, cash session Z-Report, and accurate COGS/profit across all reports', async () => {
    // 1. Setup ingredients, recipe, and supplement
    const flour = await recipeService.createIngredient({
      name_fr: 'Farine Pizza',
      unit: 'kg',
      current_stock: 10,
      min_stock_alert: 2,
      cost_per_unit: 100
    });
    const mozz = await recipeService.createIngredient({
      name_fr: 'Mozzarella',
      unit: 'kg',
      current_stock: 5,
      min_stock_alert: 1,
      cost_per_unit: 1000
    });
    const extraOlives = await supplementService.addSupplement({
      name_fr: 'Extra Olives',
      price: 100,
      purchase_cost: 30,
      current_stock: 20
    });

    const pizza = await productService.createProduct({
      sku: 'PZ-MARG-PRO',
      barcode: '6130007778889',
      name_fr: 'Pizza Margherita Pro',
      name_ar: 'بيتزا مارغريتا',
      category_id: 'cat-pizza',
      purchase_cost: 250,
      selling_price_ttc: 800,
      current_stock: 30
    });

    await recipeService.saveRecipe(pizza.id, [
      { ingredient_id: flour.id, quantity_required: 0.25 },
      { ingredient_id: mozz.id, quantity_required: 0.15 }
    ]);

    // 2. Open cash session with 5000 DA float
    const session = await caisseService.openShift({
      cashierId: 'usr-owner-01',
      cashierName: 'Karim Propriétaire',
      openingFloat: 5000
    });

    // 3. Sell 2 pizzas @ 800 DA = 1600 DA in CASH
    const sale = await checkoutService.processCheckout({
      cashierId: 'usr-owner-01',
      cashierName: 'Karim Propriétaire',
      sessionId: session.id,
      items: [
        {
          productId: pizza.id,
          name: pizza.name_fr,
          quantity: 2,
          unitPrice: 800,
          discountAmount: 0,
          supplements: [{ id: extraOlives.id, name_fr: extraOlives.name_fr, price: 100, quantity: 1 }]
        }
      ],
      payments: [
        {
          method: 'CASH',
          amount: 1600,
          tenderedAmount: 2000,
          changeGiven: 400
        }
      ]
    });

    await recipeService.deductRecipeIngredientsForSale(pizza.id, 2);
    await supplementService.deductSupplementStock([{ supplementId: extraOlives.id, quantity: 2 }]);

    expect((await recipeService.getIngredientById(flour.id))?.current_stock).toBeCloseTo(9.5, 3);
    expect((await recipeService.getIngredientById(mozz.id))?.current_stock).toBeCloseTo(4.7, 3);
    expect((await supplementService.getSupplements(true)).find(s => s.id === extraOlives.id)?.current_stock).toBe(18);

    // 4. Record operating expense (300 DA CASH) and stock purchase expense (500 DA CASH)
    const today = new Date().toISOString().slice(0, 10);
    await expenseService.createExpense({
      category: 'ELECTRICITY',
      amount: 300,
      paymentMethod: 'CASH',
      description: 'Facture Sonelgaz',
      date: today,
      userId: 'usr-owner-01',
      sessionId: session.id
    });
    await expenseService.createExpense({
      category: 'INGREDIENTS_PURCHASE',
      amount: 500,
      paymentMethod: 'CASH',
      description: 'Achat farine comptant',
      date: today,
      userId: 'usr-owner-01',
      sessionId: session.id
    });

    // 5. Process first partial refund of 1 pizza (800 DA) with restock: true and managerPin
    const fullSale = await salesService.getSaleById(sale.id);
    const saleItem = fullSale!.items![0];

    const refund1 = await salesService.processRefund({
      saleId: sale.id,
      cashierId: 'usr-owner-01',
      cashierName: 'Karim Propriétaire',
      sessionId: session.id,
      managerPin: '842917',
      itemsToRefund: [
        {
          saleItemId: saleItem.id,
          productId: pizza.id,
          quantity: 1,
          unitPrice: 800,
          unitPurchasePrice: 250,
          restock: true
        }
      ],
      reason: 'Erreur commande 1 pizza'
    });

    // Plaintext PIN must NEVER be stored in refunds.authorized_by_pin
    expect(refund1.authorized_by_pin).not.toBe('842917');
    const dbRefundRow = await db.select<any>('SELECT authorized_by_pin FROM refunds WHERE id = ?', [refund1.id]);
    expect(dbRefundRow[0].authorized_by_pin).toBe('AUTHORIZED_BY_usr-owner-01');

    // Status after 1 of 2 refunded must be PARTIALLY_REFUNDED
    expect((await salesService.getSaleById(sale.id))?.status).toBe('PARTIALLY_REFUNDED');

    // Recipe ingredients and supplements must be restocked for 1 pizza
    expect((await recipeService.getIngredientById(flour.id))?.current_stock).toBeCloseTo(9.75, 3);
    expect((await recipeService.getIngredientById(mozz.id))?.current_stock).toBeCloseTo(4.85, 3);
    expect((await supplementService.getSupplements(true)).find(s => s.id === extraOlives.id)?.current_stock).toBe(19);

    // Verify financial metrics after 1 partial refund:
    // Gross = 1600, Refunds = 800, Net Revenue = 800
    // Net quantity sold = 1 -> COGS = 250 (not 500!)
    // Gross Margin = 800 - 250 = 550
    // Operating Expenses = 300 (500 stock purchase excluded from operatingExpenses)
    // Net Result = 550 - 300 = 250
    const metricsAfterPartial = await reportService.getFinancialMetrics(today);
    expect(metricsAfterPartial.grossRevenue).toBe(1600);
    expect(metricsAfterPartial.totalRefunds).toBe(800);
    expect(metricsAfterPartial.revenue).toBe(800);
    expect(metricsAfterPartial.cogs).toBe(250);
    expect(metricsAfterPartial.grossMargin).toBe(550);
    expect(metricsAfterPartial.operatingExpenses).toBe(300);
    expect(metricsAfterPartial.stockPurchasesExpenses).toBe(500);
    expect(metricsAfterPartial.netResult).toBe(250);

    // 6. Attempt to refund 2 more units on the same line (only 1 remaining!) -> MUST REJECT
    await expect(
      salesService.processRefund({
        saleId: sale.id,
        cashierId: 'usr-owner-01',
        cashierName: 'Karim Propriétaire',
        sessionId: session.id,
        itemsToRefund: [
          {
            saleItemId: saleItem.id,
            productId: pizza.id,
            quantity: 2,
            unitPrice: 800,
            unitPurchasePrice: 250,
            restock: true
          }
        ],
        reason: 'Tentative sur-remboursement'
      })
    ).rejects.toThrow(/Quantité excessive/);

    // 7. Refund the remaining 1 unit -> sale transitions to REFUNDED, and any further refund is blocked
    await salesService.processRefund({
      saleId: sale.id,
      cashierId: 'usr-owner-01',
      cashierName: 'Karim Propriétaire',
      sessionId: session.id,
      itemsToRefund: [
        {
          saleItemId: saleItem.id,
          productId: pizza.id,
          quantity: 1,
          unitPrice: 800,
          unitPurchasePrice: 250,
          restock: true
        }
      ],
      reason: 'Remboursement solde restant'
    });

    expect((await salesService.getSaleById(sale.id))?.status).toBe('REFUNDED');

    await expect(
      salesService.processRefund({
        saleId: sale.id,
        cashierId: 'usr-owner-01',
        cashierName: 'Karim Propriétaire',
        itemsToRefund: [
          {
            saleItemId: saleItem.id,
            productId: pizza.id,
            quantity: 1,
            unitPrice: 800,
            unitPurchasePrice: 250,
            restock: false
          }
        ],
        reason: 'Remboursement sur vente déjà remboursée'
      })
    ).rejects.toThrow(/déjà été intégralement remboursée/);

    // 8. Verify Daily, Weekly, and Monthly periodic reports have 0 COGS for the 100% refunded sale and exclude stock purchase from netProfit
    const dailyReport = await periodicReportService.getDailyReport(today);
    expect(dailyReport.metrics.totalRevenue).toBe(0);
    expect(dailyReport.metrics.cogs).toBe(0);
    expect(dailyReport.metrics.grossMargin).toBe(0);
    expect(dailyReport.metrics.netProfit).toBe(-300); // Only the 300 DA electricity expense reduces netProfit

    // Expected cash in drawer: 5000 float + 1600 cash sales - 1600 cash refunds - 800 cash expenses = 4200 DA
    expect(dailyReport.metrics.cashSummary.expectedCash).toBe(4200);

    // 9. Close cash session and verify Z-Report reconciliation
    const closed = await caisseService.closeShift({
      sessionId: session.id,
      actualCountedCash: 4200,
      closingNotes: 'Clôture exacte'
    });
    expect(closed.zReport.expectedCash).toBe(4200);
    expect(closed.zReport.cashRefunds).toBe(1600);
    expect(closed.zReport.discrepancy).toBe(0);
    expect(closed.zReport.discrepancyStatus).toBe('BALANCED');
  });

  it('Batch D & E: Full backup/restore round-trip on isolated DB, sync outbox, license check, and ESC/POS receipt + kitchen ticket formatting', async () => {
    const pizza = await productService.createProduct({
      sku: 'PZ-E2E-BKP',
      barcode: '6130009990001',
      name_fr: 'Pizza Royale Algéroise',
      name_ar: 'بيتزا رويال العاصمية',
      category_id: 'cat-pizza',
      purchase_cost: 280,
      selling_price_ttc: 950,
      current_stock: 15
    });

    const sale = await checkoutService.processCheckout({
      cashierId: 'usr-owner-01',
      cashierName: 'Karim Propriétaire',
      items: [{ productId: pizza.id, name: pizza.name_fr, quantity: 2, unitPrice: 950, discountAmount: 0 }],
      payments: [{ method: 'CIB', amount: 1900, tenderedAmount: 1900, changeGiven: 0 }]
    });

    // 1. Outbox sync queue processes pending sale operation
    expect(await syncService.getPendingCount()).toBeGreaterThanOrEqual(1);
    const syncRes = await syncService.triggerSync();
    expect(syncRes.success).toBe(true);
    expect(syncRes.pending).toBe(0);

    // 2. License status check in non-Tauri mode
    const lic = await licenseService.getStatus(true);
    expect(lic.is_licensed).toBe(true);

    // 3. ESC/POS customer receipt & kitchen ticket formatting
    const receiptEscPos = printerService.generateReceiptText({
      receiptNumber: sale.receipt_number,
      dailyOrderNumber: 1,
      dateTime: '29/10/2026 19:30',
      cashierName: 'Karim Propriétaire',
      storeName: 'Aquadro Pizzeria Release',
      orderType: 'SUR_PLACE',
      items: [
        {
          name: 'Pizza Royale Algéroise',
          quantity: 2,
          unitPrice: 950,
          totalPrice: 1900,
          ingredients: ['Sauce Tomate', 'Mozzarella'],
          notes: 'Bien cuite'
        }
      ],
      totalTTC: 1900,
      paymentMethod: 'CIB'
    });
    expect(receiptEscPos.toUpperCase()).toContain('PIZZA ROYALE');
    expect(receiptEscPos).toMatch(/1[\s\u00a0\u202f]?900/);

    const kitchenEscPos = printerService.generateKitchenTicketText({
      receiptNumber: sale.receipt_number,
      dailyOrderNumber: 1,
      dateTime: '29/10/2026 19:30',
      cashierName: 'Karim Propriétaire',
      orderType: 'SUR_PLACE',
      items: [
        {
          name: 'Pizza Royale Algéroise',
          quantity: 2,
          unitPrice: 950,
          totalPrice: 1900,
          ingredients: ['Sauce Tomate', 'Mozzarella'],
          notes: 'Bien cuite'
        }
      ],
      totalTTC: 1900
    });
    expect(kitchenEscPos.toUpperCase()).toContain('PIZZA ROYALE');
    expect(kitchenEscPos).toContain('Bien cuite');
    expect(kitchenEscPos).not.toContain('TOTAL À PAYER');

    // 4. Export full backup, wipe isolated test database, and restore with Owner PIN
    const { jsonContent: backupJson } = await backupService.exportJsonBackup();
    await db.execute('DELETE FROM sale_items');
    await db.execute('DELETE FROM payments');
    await db.execute('DELETE FROM sales');
    await db.execute('DELETE FROM inventory_movements');
    await db.execute('DELETE FROM products');
    expect(await productService.getProducts()).toHaveLength(0);

    const restored = await backupService.restoreBackup(backupJson, '842917');
    expect(restored).toBe(true);

    const restoredProducts = await productService.getProducts();
    expect(restoredProducts.some(p => p.id === pizza.id)).toBe(true);
    const restoredSale = await salesService.getSaleById(sale.id);
    expect(restoredSale?.total_ttc).toBe(1900);
  });
});
