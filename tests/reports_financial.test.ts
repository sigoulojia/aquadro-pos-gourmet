import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db/sqlite';
import { reportService } from '../src/services/report.service';
import { CurrencyUtil } from '../src/core/currency/currency';

describe('Pizzeria-Specific Reports & Financial Module Verification', () => {
  beforeEach(async () => {
    await db.initialize();
  });

  it('correctly calculates Net Sales Revenue and deducts refunds without counting canceled orders', async () => {
    const testDate = '2026-10-21';
    const saleId1 = `sale-pizz-01-${Date.now()}`;
    const saleId2 = `sale-pizz-02-${Date.now()}`;
    const saleIdCancelled = `sale-pizz-canc-${Date.now()}`;
    const saleIdRefunded = `sale-pizz-ref-${Date.now()}`;

    // Sale 1: Completed Pizza Margherita + Coca = 1 500 DA (with 100 DA discount)
    await db.execute(
      `INSERT INTO sales (id, receipt_number, session_id, cashier_id, subtotal_ht, discount_amount, tax_amount, total_ttc, status, idempotency_key, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [saleId1, `TKT-101-${Date.now()}`, 'sess-01', 'user-01', 1400, 100, 0, 1500, 'COMPLETED', `idem-1-${Date.now()}`, `${testDate}T12:30:00Z`]
    );

    // Sale 2: Completed 4 Saisons Pizza = 1 200 DA
    await db.execute(
      `INSERT INTO sales (id, receipt_number, session_id, cashier_id, subtotal_ht, discount_amount, tax_amount, total_ttc, status, idempotency_key, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [saleId2, `TKT-102-${Date.now()}`, 'sess-01', 'user-01', 1200, 0, 0, 1200, 'COMPLETED', `idem-2-${Date.now()}`, `${testDate}T13:00:00Z`]
    );

    // Sale 3: Cancelled order = 800 DA (MUST BE EXCLUDED)
    await db.execute(
      `INSERT INTO sales (id, receipt_number, session_id, cashier_id, subtotal_ht, discount_amount, tax_amount, total_ttc, status, idempotency_key, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [saleIdCancelled, `TKT-103-${Date.now()}`, 'sess-01', 'user-01', 800, 0, 0, 800, 'CANCELLED', `idem-3-${Date.now()}`, `${testDate}T13:15:00Z`]
    );

    // Sale 4: Fully Refunded Sale = 900 DA
    await db.execute(
      `INSERT INTO sales (id, receipt_number, session_id, cashier_id, subtotal_ht, discount_amount, tax_amount, total_ttc, status, idempotency_key, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [saleIdRefunded, `TKT-104-${Date.now()}`, 'sess-01', 'user-01', 900, 0, 0, 900, 'REFUNDED', `idem-4-${Date.now()}`, `${testDate}T13:30:00Z`]
    );

    // Add refund record in refunds table
    await db.execute(
      `INSERT INTO refunds (id, original_sale_id, receipt_number, cashier_id, refund_amount, payment_method, reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [`ref-${Date.now()}`, saleIdRefunded, `TKT-104-${Date.now()}`, 'user-01', 900, 'CASH', 'Pizza brûlée', `${testDate}T13:45:00Z`]
    );

    const metrics = await reportService.getFinancialMetrics(testDate);

    // Gross issued sales = 1500 + 1200 + 900 = 3600 DA
    // Cancelled (800 DA) is excluded
    // Refunded (900 DA) is deducted exactly once
    expect(metrics.grossRevenue).toBe(3600);
    expect(metrics.totalRefunds).toBe(900);
    expect(metrics.revenue).toBe(2700); // 3600 - 900 = 2700 DA net
    expect(metrics.transactionCount).toBe(2);
    expect(metrics.totalDiscounts).toBe(100);
    expect(metrics.averageBasket).toBe(1350); // 2700 net / 2 transactions
  });

  it('guarantees historical cost invariance and accurately computes Gross Margin', async () => {
    const testDate = '2026-10-22';
    const saleId = `sale-cogs-${Date.now()}`;
    const prodPizzaId = `prod-pizza-${Date.now()}`;

    // Create pizza product with cost 450 DA and price 1 000 DA
    await db.execute(
      `INSERT INTO products (id, store_id, category_id, name_fr, name_ar, sku, barcode, purchase_cost, selling_price_ttc, current_stock, min_stock_alert, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [prodPizzaId, 'store-01', 'cat-pizza', 'Pizza Végétarienne', 'بيتزا خضار', 'PIZZ-VEG', '111222333', 450, 1000, 20, 5, 1, `${testDate}T10:00:00Z`, `${testDate}T10:00:00Z`]
    );

    // Complete sale of 2 Pizzas (Total = 2 000 DA, COGS = 2 * 450 = 900 DA)
    await db.execute(
      `INSERT INTO sales (id, receipt_number, session_id, cashier_id, subtotal_ht, discount_amount, tax_amount, total_ttc, status, idempotency_key, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [saleId, `TKT-COGS-${Date.now()}`, 'sess-01', 'user-01', 2000, 0, 0, 2000, 'COMPLETED', `idem-cogs-${Date.now()}`, `${testDate}T14:00:00Z`]
    );

    await db.execute(
      `INSERT INTO sale_items (id, sale_id, product_id, product_name, quantity, unit_price_ttc, discount_amount, total_ttc, unit_purchase_cost_snapshot, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [`item-${Date.now()}`, saleId, prodPizzaId, 'Pizza Végétarienne', 2, 1000, 0, 2000, 450, `${testDate}T14:00:00Z`]
    );

    let metrics = await reportService.getFinancialMetrics(testDate);
    expect(metrics.revenue).toBe(2000);
    expect(metrics.cogs).toBe(900);
    expect(metrics.grossMargin).toBe(1100); // 2000 - 900 = 1100 DA
    expect(metrics.marginPercentage).toBe(55); // 1100 / 2000 = 55%
    expect(metrics.cogsReliabilityPercent).toBe(100);

    // Later: Ingredient cost of cheese and flour increases! Product purchase cost updated to 700 DA
    await db.execute(
      `UPDATE products SET purchase_cost = 700 WHERE id = ?`,
      [prodPizzaId]
    );

    // CRITICAL: Historical sale COGS must NOT be recalculated or altered!
    metrics = await reportService.getFinancialMetrics(testDate);
    expect(metrics.cogs).toBe(900);
    expect(metrics.grossMargin).toBe(1100);
  });

  it('prevents double-counting by separating operating expenses from stock purchases', async () => {
    const testDate = '2026-10-23';

    // Sale of 3 000 DA with COGS of 1 000 DA -> Gross Margin = 2 000 DA
    const saleId = `sale-exp-${Date.now()}`;
    await db.execute(
      `INSERT INTO sales (id, receipt_number, session_id, cashier_id, subtotal_ht, discount_amount, tax_amount, total_ttc, status, idempotency_key, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [saleId, `TKT-EXP-${Date.now()}`, 'sess-01', 'user-01', 3000, 0, 0, 3000, 'COMPLETED', `idem-exp-${Date.now()}`, `${testDate}T12:00:00Z`]
    );
    await db.execute(
      `INSERT INTO sale_items (id, sale_id, product_id, product_name, quantity, unit_price_ttc, discount_amount, total_ttc, unit_purchase_cost_snapshot, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [`item-exp-${Date.now()}`, saleId, 'prod-dummy', 'Pizza Formule', 1, 3000, 0, 3000, 1000, `${testDate}T12:00:00Z`]
    );

    // Operating expense: Pizza Boxes = 500 DA (Real operating expense)
    await db.execute(
      `INSERT INTO expenses (id, category, amount, payment_method, description, date, user_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [`exp-box-${Date.now()}`, 'PIZZA_BOXES', 500, 'CASH', '100 boîtes pizza 33cm', testDate, 'user-01', `${testDate}T15:00:00Z`]
    );

    // Operating expense: Sonelgaz / Electricity = 300 DA
    await db.execute(
      `INSERT INTO expenses (id, category, amount, payment_method, description, date, user_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [`exp-elec-${Date.now()}`, 'ELECTRICITY', 300, 'CASH', 'Facture électricité four', testDate, 'user-01', `${testDate}T15:30:00Z`]
    );

    // Cash purchase of Raw Ingrédients = 2 000 DA (Inventory acquisition, NOT operating overhead)
    await db.execute(
      `INSERT INTO expenses (id, category, amount, payment_method, description, date, user_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [`exp-ing-${Date.now()}`, 'INGREDIENTS_PURCHASE', 2000, 'CASH', 'Achat 10kg Mozzarella comptant', testDate, 'user-01', `${testDate}T16:00:00Z`]
    );

    const metrics = await reportService.getFinancialMetrics(testDate);

    // Gross Margin = 3 000 - 1 000 = 2 000 DA
    expect(metrics.grossMargin).toBe(2000);

    // Operating expenses = 500 + 300 = 800 DA
    expect(metrics.operatingExpenses).toBe(800);

    // Stock purchases = 2000 DA
    expect(metrics.stockPurchasesExpenses).toBe(2000);

    // Total recorded expenses = 2 800 DA
    expect(metrics.expenses).toBe(2800);

    // Net Result = Gross Margin (2000) - Operating Expenses (800) = 1 200 DA
    // (Stock purchase of 2000 DA is NOT double-deducted)
    expect(metrics.netResult).toBe(1200);
  });

  it('accurately categorizes Pizzas versus Drinks versus Supplements', async () => {
    const testDate = '2026-10-24';
    const saleId = `sale-cat-${Date.now()}`;
    const pizzaId = `prod-pizza-cat-${Date.now()}`;
    const drinkId = `prod-drink-cat-${Date.now()}`;

    // Pizza item: 1 200 DA
    await db.execute(
      `INSERT INTO products (id, store_id, category_id, name_fr, name_ar, sku, barcode, purchase_cost, selling_price_ttc, current_stock, min_stock_alert, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [pizzaId, 'store-01', 'cat-pizza', 'Pizza 4 Fromages', 'بيتزا 4 أجبان', 'PIZ-4F', '333444555', 500, 1200, 10, 2, 1, `${testDate}T10:00:00Z`, `${testDate}T10:00:00Z`]
    );

    // Drink item: 150 DA
    await db.execute(
      `INSERT INTO products (id, store_id, category_id, name_fr, name_ar, sku, barcode, purchase_cost, selling_price_ttc, current_stock, min_stock_alert, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [drinkId, 'store-01', 'cat-drink', 'Coca Cola 33cl', 'كوكاكولا', 'COCA-33', '999888777', 80, 150, 48, 12, 1, `${testDate}T10:00:00Z`, `${testDate}T10:00:00Z`]
    );

    // Sale with 1 Pizza (1 200 DA) + 2 Drinks (300 DA) = 1 500 DA Total
    await db.execute(
      `INSERT INTO sales (id, receipt_number, session_id, cashier_id, subtotal_ht, discount_amount, tax_amount, total_ttc, status, idempotency_key, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [saleId, `TKT-CAT-${Date.now()}`, 'sess-01', 'user-01', 1500, 0, 0, 1500, 'COMPLETED', `idem-cat-${Date.now()}`, `${testDate}T17:00:00Z`]
    );

    await db.execute(
      `INSERT INTO sale_items (id, sale_id, product_id, product_name, quantity, unit_price_ttc, discount_amount, total_ttc, unit_purchase_cost_snapshot, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [`item-piz-${Date.now()}`, saleId, pizzaId, 'Pizza 4 Fromages', 1, 1200, 0, 1200, 500, `${testDate}T17:00:00Z`]
    );

    await db.execute(
      `INSERT INTO sale_items (id, sale_id, product_id, product_name, quantity, unit_price_ttc, discount_amount, total_ttc, unit_purchase_cost_snapshot, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [`item-drk-${Date.now()}`, saleId, drinkId, 'Coca Cola 33cl', 2, 150, 0, 300, 80, `${testDate}T17:00:00Z`]
    );

    const metrics = await reportService.getFinancialMetrics(testDate);
    expect(metrics.categorySales.pizzas.revenue).toBe(1200);
    expect(metrics.categorySales.pizzas.quantity).toBe(1);
    expect(metrics.categorySales.pizzas.percentage).toBe(80); // 1200 / 1500 = 80%

    expect(metrics.categorySales.drinks.revenue).toBe(300);
    expect(metrics.categorySales.drinks.quantity).toBe(2);
    expect(metrics.categorySales.drinks.percentage).toBe(20); // 300 / 1500 = 20%
  });

  it('reconciles payments breakdown with cash session records', async () => {
    const testDate = '2026-10-25';
    const saleId = `sale-pay-${Date.now()}`;

    await db.execute(
      `INSERT INTO sales (id, receipt_number, session_id, cashier_id, subtotal_ht, discount_amount, tax_amount, total_ttc, status, idempotency_key, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [saleId, `TKT-PAY-${Date.now()}`, 'sess-01', 'user-01', 2500, 0, 0, 2500, 'COMPLETED', `idem-pay-${Date.now()}`, `${testDate}T18:00:00Z`]
    );

    // Split payment: 1 500 DA Cash + 1 000 DA CIB Card
    await db.execute(
      `INSERT INTO payments (id, sale_id, payment_method, amount, tendered_amount, change_given, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [`pay-c-${Date.now()}`, saleId, 'CASH', 1500, 1500, 0, `${testDate}T18:00:00Z`]
    );

    await db.execute(
      `INSERT INTO payments (id, sale_id, payment_method, amount, tendered_amount, change_given, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [`pay-b-${Date.now()}`, saleId, 'CIB', 1000, 1000, 0, `${testDate}T18:00:00Z`]
    );

    // Cash session with 3 000 DA float and 500 DA expense
    await db.execute(
      `INSERT INTO cash_sessions (id, cashier_id, cashier_name, opened_at, closed_at, status, opening_float, total_cash_sales, total_card_sales, total_qr_sales, total_credit_sales, total_cash_refunds, total_cash_expenses, expected_cash_drawer, actual_counted_cash, cash_discrepancy)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [`sess-${Date.now()}`, 'user-01', 'Amine', `${testDate}T09:00:00Z`, `${testDate}T22:00:00Z`, 'CLOSED', 3000, 1500, 1000, 0, 0, 0, 500, 4000, 4000, 0]
    );

    const metrics = await reportService.getFinancialMetrics(testDate);
    expect(metrics.paymentBreakdown.cash).toBe(1500);
    expect(metrics.paymentBreakdown.cib_edahabia).toBe(1000);
    expect(metrics.cashSessionSummary.openingFloat).toBe(3000);
    expect(metrics.cashSessionSummary.cashSales).toBe(1500);
    expect(metrics.cashSessionSummary.cashExpenses).toBe(500);
    expect(metrics.cashSessionSummary.expectedCash).toBe(4000);
    expect(metrics.cashSessionSummary.discrepancy).toBe(0);
  });

  it('exercises real SQLite queries for inventory valuation and theoretical ingredient consumption', async () => {
    const testDate = '2026-10-26';
    const ingFlourId = `ing-flour-${Date.now()}`;
    const ingCheeseId = `ing-cheese-${Date.now()}`;
    const prodPizzaId = `prod-pizza-recipe-${Date.now()}`;
    const saleId = `sale-consumption-${Date.now()}`;

    // 1. Ingrédients
    await db.execute(
      `INSERT INTO ingredients (id, name_fr, name_ar, unit, current_stock, min_stock_alert, cost_per_unit, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [ingFlourId, 'Farine T55', 'فرينة', 'kg', 50, 10, 80, 1, `${testDate}T08:00:00Z`, `${testDate}T08:00:00Z`]
    );

    await db.execute(
      `INSERT INTO ingredients (id, name_fr, name_ar, unit, current_stock, min_stock_alert, cost_per_unit, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [ingCheeseId, 'Fromage Mozzarella', 'جبن موزاريلا', 'kg', 20, 5, 1200, 1, `${testDate}T08:00:00Z`, `${testDate}T08:00:00Z`]
    );

    // 2. Produit Pizza avec fiche technique
    await db.execute(
      `INSERT INTO products (id, store_id, category_id, name_fr, name_ar, sku, barcode, purchase_cost, selling_price_ttc, current_stock, min_stock_alert, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [prodPizzaId, 'store-01', 'cat-pizza', 'Pizza Marguerite Spéciale', 'بيتزا مارغريت', `PIZ-REC-${Date.now()}`, `777666555-${Date.now()}`, 400, 900, 15, 3, 1, `${testDate}T09:00:00Z`, `${testDate}T09:00:00Z`]
    );

    // 3. Fiches techniques (Recipe Items): 0.25 kg de farine et 0.15 kg de mozzarella par pizza
    await db.execute(
      `INSERT INTO recipe_items (id, product_id, ingredient_id, quantity_required, unit_display, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [`rec-1-${Date.now()}`, prodPizzaId, ingFlourId, 0.25, 'kg', `${testDate}T09:00:00Z`]
    );

    await db.execute(
      `INSERT INTO recipe_items (id, product_id, ingredient_id, quantity_required, unit_display, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [`rec-2-${Date.now()}`, prodPizzaId, ingCheeseId, 0.15, 'kg', `${testDate}T09:00:00Z`]
    );

    // 4. Vente de 4 Pizzas Marguerite Spéciale
    await db.execute(
      `INSERT INTO sales (id, receipt_number, session_id, cashier_id, subtotal_ht, discount_amount, tax_amount, total_ttc, status, idempotency_key, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [saleId, `TKT-REC-${Date.now()}`, 'sess-01', 'user-01', 3600, 0, 0, 3600, 'COMPLETED', `idem-rec-${Date.now()}`, `${testDate}T12:00:00Z`]
    );

    await db.execute(
      `INSERT INTO sale_items (id, sale_id, product_id, product_name, quantity, unit_price_ttc, discount_amount, total_ttc, unit_purchase_cost_snapshot, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [`item-rec-${Date.now()}`, saleId, prodPizzaId, 'Pizza Marguerite Spéciale', 4, 900, 0, 3600, 400, `${testDate}T12:00:00Z`]
    );

    // 5. Vérifier la consommation théorique d'ingrédients
    const consumption = await reportService.getIngredientConsumption(testDate);
    expect(consumption.length).toBeGreaterThanOrEqual(2);

    const flourConsumption = consumption.find(c => c.ingredientId === ingFlourId);
    expect(flourConsumption).toBeDefined();
    // 4 pizzas * 0.25 kg = 1.0 kg
    expect(flourConsumption!.totalQuantityConsumed).toBe(1);
    // 1 kg * 80 DZD = 80 DZD
    expect(flourConsumption!.totalCostConsumed).toBe(80);

    const cheeseConsumption = consumption.find(c => c.ingredientId === ingCheeseId);
    expect(cheeseConsumption).toBeDefined();
    // 4 pizzas * 0.15 kg = 0.6 kg
    expect(cheeseConsumption!.totalQuantityConsumed).toBe(0.6);
    // 0.6 kg * 1200 DZD = 720 DZD
    expect(cheeseConsumption!.totalCostConsumed).toBe(720);

    // 6. Vérifier la valorisation de stock
    const valuation = await reportService.getInventoryValuation();
    expect(valuation.valuationAtCost).toBeGreaterThan(0);
    expect(valuation.totalUnitsInStock).toBeGreaterThan(0);
  });
});
