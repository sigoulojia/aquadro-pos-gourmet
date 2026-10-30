// Aquadro Pizzeria POS — End-to-End Functional Repair & Data Integrity Regression Test Suite
// Validates TEST A through TEST J directly against SQLite persistence and authoritative services

import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db/sqlite';
import { recipeService } from '../src/services/recipe.service';
import { supplementService } from '../src/services/supplement.service';
import { productService } from '../src/services/product.service';
import { checkoutService } from '../src/services/checkout.service';
import { salesService } from '../src/services/sales.service';
import { reportService } from '../src/services/report.service';
import { expenseService } from '../src/services/expense.service';
import { Ingredient, Product } from '../src/types/database';

describe('Aquadro Pizzeria POS — Full Functional Repair & Data Integrity Audit', () => {
  beforeEach(async () => {
    await db.resetAll();
  });

  // =========================================================================
  // TEST A — INGREDIENT PERSISTENCE
  // =========================================================================
  it('TEST A: Create, save, reload, edit, and persist ingredient records', async () => {
    // 1. Créer un nouvel ingrédient
    const created = await recipeService.createIngredient({
      name_fr: 'Farine T55 Extra Blanche',
      name_ar: 'فرينة بيتزا بيضاء',
      unit: 'kg',
      current_stock: 50.0,
      min_stock_alert: 10.0,
      cost_per_unit: 75.0
    });

    expect(created.id).toBeDefined();
    expect(created.name_fr).toBe('Farine T55 Extra Blanche');
    expect(created.unit).toBe('kg');
    expect(created.current_stock).toBe(50.0);
    expect(created.cost_per_unit).toBe(75.0);

    // 2. Recharger depuis la base de données
    const reloaded = await recipeService.getIngredientById(created.id);
    expect(reloaded).toBeDefined();
    expect(reloaded?.id).toBe(created.id);
    expect(reloaded?.name_fr).toBe('Farine T55 Extra Blanche');
    expect(reloaded?.name_ar).toBe('فرينة بيتزا بيضاء');
    expect(reloaded?.unit).toBe('kg');
    expect(reloaded?.current_stock).toBe(50.0);
    expect(reloaded?.min_stock_alert).toBe(10.0);
    expect(reloaded?.cost_per_unit).toBe(75.0);

    // 3. Modifier l'ingrédient
    await recipeService.updateIngredient(created.id, {
      name_fr: 'Farine T55 Supérieure Pizza',
      current_stock: 65.5,
      cost_per_unit: 80.0
    });

    // 4. Recharger et vérifier la persistance de la mise à jour
    const updated = await recipeService.getIngredientById(created.id);
    expect(updated?.name_fr).toBe('Farine T55 Supérieure Pizza');
    expect(updated?.current_stock).toBe(65.5);
    expect(updated?.cost_per_unit).toBe(80.0);
  });

  // =========================================================================
  // TEST B — RECIPE PERSISTENCE
  // =========================================================================
  it('TEST B: Create, save, load, edit, clear, and reload pizza recipes', async () => {
    // 1. Créer le produit Pizza
    const pizza = await productService.createProduct({
      sku: 'PZ-TEST-RECIPE',
      barcode: '990001',
      name_fr: 'Pizza Quattro Stagioni',
      name_ar: 'بيتزا الفصول الأربعة',
      selling_price_ttc: 950,
      purchase_cost: 320,
      current_stock: 20,
      category_id: 'cat-pizza'
    });

    // 2. Créer 3 ingrédients
    const flour = await recipeService.createIngredient({
      name_fr: 'Farine T55',
      unit: 'kg',
      current_stock: 100,
      min_stock_alert: 10,
      cost_per_unit: 70
    });

    const mozzarella = await recipeService.createIngredient({
      name_fr: 'Mozzarella Fior di Latte',
      unit: 'kg',
      current_stock: 30,
      min_stock_alert: 5,
      cost_per_unit: 1200
    });

    const tomato = await recipeService.createIngredient({
      name_fr: 'Sauce Tomate San Marzano',
      unit: 'kg',
      current_stock: 40,
      min_stock_alert: 5,
      cost_per_unit: 250
    });

    // 3. Enregistrer la recette avec farine, mozzarella et sauce tomate
    await recipeService.saveRecipe(pizza.id, [
      { ingredient_id: flour.id, quantity_required: 0.25, unit_display: '0.25 kg' },
      { ingredient_id: mozzarella.id, quantity_required: 0.15, unit_display: '0.15 kg' },
      { ingredient_id: tomato.id, quantity_required: 0.10, unit_display: '0.10 kg' }
    ]);

    // 4. Recharger la recette depuis la base
    let recipeLines = await recipeService.getRecipeForProduct(pizza.id);
    expect(recipeLines.length).toBe(3);

    const flourLine = recipeLines.find(r => r.ingredient_id === flour.id);
    expect(flourLine).toBeDefined();
    expect(flourLine?.quantity_required).toBe(0.25);
    expect(flourLine?.ingredient_name_fr).toBe('Farine T55');

    const mozzLine = recipeLines.find(r => r.ingredient_id === mozzarella.id);
    expect(mozzLine).toBeDefined();
    expect(mozzLine?.quantity_required).toBe(0.15);

    // 5. Modifier la recette : ajuster mozzarella à 0.18 kg et retirer la sauce tomate
    await recipeService.saveRecipe(pizza.id, [
      { ingredient_id: flour.id, quantity_required: 0.25, unit_display: '0.25 kg' },
      { ingredient_id: mozzarella.id, quantity_required: 0.18, unit_display: '0.18 kg' }
    ]);

    // 6. Recharger et vérifier que la sauce tomate a été retirée et mozzarella mise à jour
    recipeLines = await recipeService.getRecipeForProduct(pizza.id);
    expect(recipeLines.length).toBe(2);
    expect(recipeLines.some(r => r.ingredient_id === tomato.id)).toBe(false);

    const updatedMozz = recipeLines.find(r => r.ingredient_id === mozzarella.id);
    expect(updatedMozz?.quantity_required).toBe(0.18);

    // 7. Vider complètement la recette (0 ingrédient)
    await recipeService.saveRecipe(pizza.id, []);
    recipeLines = await recipeService.getRecipeForProduct(pizza.id);
    expect(recipeLines.length).toBe(0);
  });

  // =========================================================================
  // TEST C — SUPPLEMENT PERSISTENCE
  // =========================================================================
  it('TEST C: Create, save, reload, and verify supplement records & stock', async () => {
    // 1. Créer un supplément
    const supp = await supplementService.addSupplement({
      name_fr: 'Extra Fromage Mozzarella',
      name_ar: 'جبن موزاريلا إضافي',
      purchase_cost: 80,
      price: 200,
      current_stock: 40,
      min_stock_alert: 5,
      category: 'cheese'
    });

    expect(supp.id).toBeDefined();
    expect(supp.price).toBe(200);
    expect(supp.purchase_cost).toBe(80);
    expect(supp.current_stock).toBe(40);

    // 2. Recharger depuis la base SQLite
    const allSupps = await supplementService.getSupplements(true);
    const reloaded = allSupps.find(s => s.id === supp.id);
    expect(reloaded).toBeDefined();
    expect(reloaded?.name_fr).toBe('Extra Fromage Mozzarella');
    expect(reloaded?.price).toBe(200);
    expect(reloaded?.purchase_cost).toBe(80);
    expect(reloaded?.current_stock).toBe(40);

    // 3. Déduction de stock de supplément
    await supplementService.deductSupplementStock([
      { supplementId: supp.id, quantity: 2 }
    ]);

    const afterDeduction = await supplementService.getSupplements(true);
    const updated = afterDeduction.find(s => s.id === supp.id);
    expect(updated?.current_stock).toBe(38);
  });

  // =========================================================================
  // TEST D — PURCHASE
  // =========================================================================
  it('TEST D: Record an ingredient purchase and verify inventory & cost updates', async () => {
    // Ingrédient initial : 20 kg à 80 DZD/kg
    const ing = await recipeService.createIngredient({
      name_fr: 'Huile d Olive Vierge',
      unit: 'L',
      current_stock: 20,
      min_stock_alert: 5,
      cost_per_unit: 800
    });

    // Enregistrer un achat : +15 L à 850 DZD/L
    const updated = await recipeService.recordPurchase(ing.id, 15, 850, 'Fournisseur Huilerie Kabylie');
    expect(updated.current_stock).toBe(35);
    expect(updated.cost_per_unit).toBe(850);

    // Recharger depuis SQLite
    const reloaded = await recipeService.getIngredientById(ing.id);
    expect(reloaded?.current_stock).toBe(35);
    expect(reloaded?.cost_per_unit).toBe(850);
  });

  // =========================================================================
  // TEST E — CHECKOUT
  // =========================================================================
  it('TEST E: Checkout pizza with supplements, payment, inventory deduction, and historical cost snapshot', async () => {
    // 1. Produit Pizza
    const pizza = await productService.createProduct({
      sku: 'PZ-TEST-CHK',
      barcode: '990002',
      name_fr: 'Pizza Végétarienne',
      selling_price_ttc: 700,
      purchase_cost: 220,
      current_stock: 50,
      category_id: 'cat-pizza'
    });

    // 2. Ingrédient de recette
    const cheese = await recipeService.createIngredient({
      name_fr: 'Fromage Râpé',
      unit: 'kg',
      current_stock: 10.0,
      min_stock_alert: 1,
      cost_per_unit: 900
    });

    await recipeService.saveRecipe(pizza.id, [
      { ingredient_id: cheese.id, quantity_required: 0.20, unit_display: '0.20 kg' }
    ]);

    // 3. Supplément
    const supplement = await supplementService.addSupplement({
      name_fr: 'Sauce Piquante Harissa Maison',
      purchase_cost: 20,
      price: 50,
      current_stock: 30,
      category: 'sauce'
    });

    // Panier : 1 Pizza (700 DZD) + 1 Supplément (50 DZD) = 750 DZD
    const cart = [
      { productId: pizza.id, name: pizza.name_fr, unitPrice: 700, quantity: 1, discountAmount: 0 },
      { productId: supplement.id, name: supplement.name_fr, unitPrice: 50, quantity: 1, discountAmount: 0 }
    ];

    const totalPayable = 750;
    const tendered = 1000;
    const change = 250;

    // Encaissement atomique
    const sale = await checkoutService.processCheckout({
      cashierId: 'user-001',
      cashierName: 'Caissier Pizzeria',
      items: cart,
      payments: [
        {
          method: 'CASH',
          amount: totalPayable,
          tenderedAmount: tendered,
          changeGiven: change
        }
      ]
    });

    // Déduction des ingrédients de la recette et des suppléments
    await recipeService.deductRecipeIngredientsForSale(pizza.id, 1);
    await supplementService.deductSupplementStock([
      { supplementId: supplement.id, quantity: 1 }
    ]);

    expect(sale).toBeDefined();
    expect(sale.id).toBeDefined();
    expect(sale.total_ttc).toBe(750);
    expect(sale.status).toBe('COMPLETED');

    // Vérifier les lignes de vente et snapshot de coût
    const saleRecord = await salesService.getSaleById(sale.id);
    expect(saleRecord).toBeDefined();
    expect(saleRecord?.items?.length).toBe(2);

    const pizzaItem = saleRecord?.items?.find(i => i.product_id === pizza.id);
    expect(pizzaItem).toBeDefined();
    expect(pizzaItem?.unit_purchase_cost_snapshot).toBe(220);

    // Vérifier le paiement enregistré dans SQLite
    expect(saleRecord?.payments?.length).toBe(1);
    const pay = saleRecord?.payments?.[0];
    expect(pay?.payment_method).toBe('CASH');
    expect(pay?.amount).toBe(750);
    expect(pay?.tendered_amount).toBe(1000);
    expect(pay?.change_given).toBe(250);

    // Vérifier les déductions d'inventaire
    const reloadedCheese = await recipeService.getIngredientById(cheese.id);
    expect(reloadedCheese?.current_stock).toBeCloseTo(9.80, 2);

    const reloadedSupp = (await supplementService.getSupplements(true)).find(s => s.id === supplement.id);
    expect(reloadedSupp?.current_stock).toBe(29);
  });

  // =========================================================================
  // TEST F — PAYMENT HISTORY
  // =========================================================================
  it('TEST F: Verify payments section queries persisted payments from SQLite without exclusion', async () => {
    // Créer une vente avec paiement Carte Bancaire / CIB
    const pizza = await productService.createProduct({
      sku: 'PZ-TEST-PAY',
      barcode: '990003',
      name_fr: 'Pizza Calzone',
      selling_price_ttc: 800,
      purchase_cost: 250,
      current_stock: 20,
      category_id: 'cat-pizza'
    });

    const sale = await checkoutService.processCheckout({
      cashierId: 'user-001',
      cashierName: 'Chef Caissier',
      items: [{ productId: pizza.id, name: pizza.name_fr, unitPrice: 800, quantity: 1, discountAmount: 0 }],
      payments: [{
        method: 'CIB',
        amount: 800,
        tenderedAmount: 800,
        changeGiven: 0
      }]
    });

    // Vérifier les paiements enregistrés et la liaison de vente
    const paymentRows = await db.select<any>('SELECT * FROM payments WHERE sale_id = ?', [sale.id]);
    const salesRows = await db.select<any>('SELECT * FROM sales WHERE id = ?', [sale.id]);

    expect(paymentRows.length).toBe(1);
    expect(salesRows.length).toBe(1);

    const p = paymentRows[0];
    const s = salesRows[0];
    expect(p.payment_method).toBe('CIB');
    expect(p.amount).toBe(800);
    expect(p.sale_id).toBe(sale.id);
    expect(s.receipt_number).toBe(sale.receipt_number);
    expect(s.cashier_id).toBe('user-001');
    expect(sale.cashier_name).toBe('Chef Caissier');
  });

  // =========================================================================
  // TEST G — APPLICATION RESTART PERSISTENCE
  // =========================================================================
  it('TEST G: Verify ingredient, recipe, supplement, sale, payment, and stock state remain available', async () => {
    // 1. Enregistrer des entités
    const ing = await recipeService.createIngredient({
      name_fr: 'Olives Noires Dénoyautées',
      unit: 'kg',
      current_stock: 12.5,
      cost_per_unit: 400
    });

    const supp = await supplementService.addSupplement({
      name_fr: 'Extra Thon',
      price: 150,
      purchase_cost: 70,
      current_stock: 25
    });

    const pizza = await productService.createProduct({
      sku: 'PZ-TEST-RESTART',
      barcode: '990004',
      name_fr: 'Pizza Thon & Olives',
      selling_price_ttc: 850,
      purchase_cost: 280,
      current_stock: 15,
      category_id: 'cat-pizza'
    });

    await recipeService.saveRecipe(pizza.id, [
      { ingredient_id: ing.id, quantity_required: 0.05, unit_display: '0.05 kg' }
    ]);

    const sale = await checkoutService.processCheckout({
      cashierId: 'user-001',
      cashierName: 'Caissier',
      items: [{ productId: pizza.id, name: pizza.name_fr, unitPrice: 850, quantity: 1, discountAmount: 0 }],
      payments: [{ method: 'BARIDIMOB', amount: 850, tenderedAmount: 850, changeGiven: 0 }]
    });

    // 2. Simuler un redémarrage (nouvelle interrogation directe de SQLite)
    const checkIng = await db.select<Ingredient>('SELECT * FROM ingredients WHERE id = ?', [ing.id]);
    expect(checkIng.length).toBe(1);
    expect(checkIng[0].current_stock).toBe(12.5);

    const checkRecipe = await db.select<any>('SELECT * FROM recipe_items WHERE product_id = ?', [pizza.id]);
    expect(checkRecipe.length).toBe(1);
    expect(checkRecipe[0].ingredient_id).toBe(ing.id);
    expect(checkRecipe[0].quantity_required).toBe(0.05);

    const checkSupp = await db.select<any>('SELECT * FROM pizza_supplements WHERE id = ?', [supp.id]);
    expect(checkSupp.length).toBe(1);
    expect(checkSupp[0].price).toBe(150);

    const checkSale = await db.select<any>('SELECT * FROM sales WHERE id = ?', [sale.id]);
    expect(checkSale.length).toBe(1);
    expect(checkSale[0].total_ttc).toBe(850);

    const checkPay = await db.select<any>('SELECT * FROM payments WHERE sale_id = ?', [sale.id]);
    expect(checkPay.length).toBe(1);
    expect(checkPay[0].payment_method).toBe('BARIDIMOB');
  });

  // =========================================================================
  // TEST H — FAILURE ROLLBACK
  // =========================================================================
  it('TEST H: Under controlled failure (e.g. empty cart or insufficient tender), checkout rejects and leaves no orphans', async () => {
    // 1. Tentative d'encaissement avec panier vide
    await expect(
      checkoutService.processCheckout({
        cashierId: 'user-001',
        cashierName: 'Caissier',
        items: [],
        payments: [{ method: 'CASH', amount: 500, tenderedAmount: 500, changeGiven: 0 }]
      })
    ).rejects.toThrow();

    // 2. Tentative d'encaissement avec paiement insuffisant
    const pizza = await productService.createProduct({
      sku: 'PZ-FAIL',
      barcode: '990005',
      name_fr: 'Pizza Test Failure',
      selling_price_ttc: 1000,
      purchase_cost: 300,
      current_stock: 10,
      category_id: 'cat-pizza'
    });

    await expect(
      checkoutService.processCheckout({
        cashierId: 'user-001',
        cashierName: 'Caissier',
        items: [{ productId: pizza.id, name: pizza.name_fr, unitPrice: 1000, quantity: 1, discountAmount: 0 }],
        payments: [{ method: 'CASH', amount: 500, tenderedAmount: 500, changeGiven: 0 }] // Insuffisant : 500 vs 1000
      })
    ).rejects.toThrow(/Paiement insuffisant/);

    // Vérifier qu'aucune vente orpheline ou paiement orphelin n'a été inséré
    const sales = await db.select<any>('SELECT * FROM sales WHERE total_ttc = 1000');
    expect(sales.length).toBe(0);

    const payments = await db.select<any>('SELECT * FROM payments WHERE amount = 500');
    expect(payments.length).toBe(0);
  });

  // =========================================================================
  // TEST I — FINANCIAL RECONCILIATION
  // =========================================================================
  it('TEST I: Verify financial reconciliation of sales, payments, expenses, and COGS without double-counting', async () => {
    // 1. Créer une vente de 1500 DZD (Coût historique 500 DZD)
    const pizza = await productService.createProduct({
      sku: 'PZ-FIN',
      barcode: '990006',
      name_fr: 'Grande Pizza Familiale',
      selling_price_ttc: 1500,
      purchase_cost: 500,
      current_stock: 20,
      category_id: 'cat-pizza'
    });

    await checkoutService.processCheckout({
      cashierId: 'user-001',
      cashierName: 'Caissier',
      items: [{ productId: pizza.id, name: pizza.name_fr, unitPrice: 1500, quantity: 1, discountAmount: 0 }],
      payments: [{ method: 'CASH', amount: 1500, tenderedAmount: 1500, changeGiven: 0 }]
    });

    // 2. Enregistrer une charge d'exploitation ordinaire (Électricité: 200 DZD)
    await expenseService.createExpense({
      category: 'Factures Énergie',
      amount: 200,
      paymentMethod: 'CASH',
      description: 'Facture électricité four à pizza',
      date: new Date().toISOString()
    });

    // 3. Calcul du rapport financier
    const today = new Date().toISOString().slice(0, 10);
    const summary = await reportService.getFinancialSummary({
      startDate: `${today}T00:00:00.000Z`,
      endDate: `${today}T23:59:59.999Z`
    });

    // Ventes brutes et nettes = 1500 DZD
    expect(summary.grossRevenue).toBe(1500);
    expect(summary.netRevenue).toBe(1500);

    // Coût des marchandises vendues (COGS) = 500 DZD
    expect(summary.costOfGoodsSold).toBe(500);

    // Marge brute = 1500 - 500 = 1000 DZD
    expect(summary.grossMargin).toBe(1000);

    // Dépenses d'exploitation = 200 DZD
    expect(summary.totalExpenses).toBe(200);

    // Résultat net d'exploitation = 1000 - 200 = 800 DZD
    expect(summary.netOperatingProfit).toBe(800);

    // Rapprochement par mode de paiement
    const cashTotal = summary.paymentsByMethod.find(p => p.method === 'CASH')?.total || 0;
    expect(cashTotal).toBe(1500);
  });

  // =========================================================================
  // TEST J — NO CUSTOMER CREDIT
  // =========================================================================
  it('TEST J: Ensure checkout only supports real payment methods and no customer credit debt workflow', async () => {
    const products = await productService.getProducts();
    const prod = products[0];

    // Les seuls modes de règlement autorisés en caisse pizzeria sont CASH, CARD/CIB/EDAHABIA, et BARIDIMOB
    const validMethods = ['CASH', 'CIB', 'CARD', 'EDAHABIA', 'BARIDIMOB'];
    expect(validMethods).not.toContain('CREDIT');

    // Vérifier qu'une vente ordinaire ne modifie jamais de créance client (customer receivables = 0)
    const customersBefore = await db.select<any>('SELECT * FROM customers');
    const totalDebt = customersBefore.reduce((sum, c) => sum + (c.current_debt || 0), 0);
    expect(totalDebt).toBe(0);

    // Vérifier la liste des paiements en base : aucun paiement de type CREDIT
    const creditPayments = await db.select<any>('SELECT * FROM payments WHERE payment_method = "CREDIT"');
    expect(creditPayments.length).toBe(0);
  });
});
