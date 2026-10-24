// Aquadro POS Algérie V2 — Service de Reporting Financier & Métriques Opérationnelles Pizzeria
// Audit et refonte rigoureuse : élimination du double comptage, gestion des remboursements/remises,
// séparation pizzas/boissons/suppléments, inviolabilité des coûts historiques et réconciliation caisse.

import { db } from '../db/sqlite';
import { Sale, SaleItem, Payment, Expense, Product, Ingredient, RecipeItem } from '../types/database';
import { CurrencyUtil } from '../core/currency/currency';

export interface IngredientConsumption {
  ingredientId: string;
  ingredientName: string;
  unit: string;
  costPerUnit: number;
  totalQuantityConsumed: number;
  totalCostConsumed: number;
}

export interface PizzeriaCategoryBreakdown {
  revenue: number;
  quantity: number;
  percentage: number;
}

export interface PizzeriaCategorySales {
  pizzas: PizzeriaCategoryBreakdown;
  drinks: PizzeriaCategoryBreakdown;
  supplements: PizzeriaCategoryBreakdown;
  other: PizzeriaCategoryBreakdown;
}

export interface CashSessionSummary {
  sessionsCount: number;
  openingFloat: number;
  cashSales: number;
  cashExpenses: number;
  expectedCash: number;
  actualCounted: number;
  discrepancy: number;
}

export interface LowStockAlertItem {
  id: string;
  name: string;
  type: 'ingredient' | 'product';
  currentStock: number;
  minAlert: number;
  unit: string;
}

export interface FinancialMetrics {
  // 1. Ventes & Chiffre d'Affaires Net
  grossRevenue: number;              // Ventes brutes TTC (avant remises et remboursements)
  totalDiscounts: number;            // Remises commerciales accordées
  totalRefunds: number;              // Remboursements et avoirs clients déduits
  revenue: number;                   // Chiffre d'affaires Net TTC (Gross - Refunds)
  transactionCount: number;          // Nombre de ventes terminées (hors annulées/remboursées à 100%)
  averageBasket: number;             // Panier moyen net en DZD

  // 2. Coût des Ventes & Rentabilité
  cogs: number;                      // Coût des marchandises vendues (COGS snapshot historique)
  cogsReliabilityPercent: number;    // % de lignes avec coût historique fiable (>0)
  grossMargin: number;               // Marge brute commerciale (Revenue - COGS)
  marginPercentage: number;          // Taux de marge brute (%)

  // 3. Charges & Résultat Net (Élimination stricte du double-comptage)
  operatingExpenses: number;         // Charges d'exploitation réelles hors achats stock (loyer, énergie, boîtes, salaires...)
  stockPurchasesExpenses: number;    // Dépenses comptant pour achat d'ingrédients/stocks (tracées séparément de l'exploitation)
  expenses: number;                  // Total des charges globales enregistrées
  netResult: number;                 // Résultat net d'exploitation = Gross Margin - Operating Expenses
  netMarginPercentage: number;       // Taux de rentabilité nette (%)
  expensesByCategory: Record<string, number>; // Détail des charges (boîtes pizza, serviettes, salaires...)

  // 4. Analyse Spécifique Pizzeria
  categorySales: PizzeriaCategorySales;

  // 5. Modes de Règlement & Contrôle de Caisse
  paymentBreakdown: {
    cash: number;
    cib_edahabia: number;
    baridimob: number;
    credit: number;
  };
  cashSessionSummary: CashSessionSummary;

  // 6. Top Produits Pizzeria & Courbe des Ventes
  topProducts: {
    id: string;
    name: string;
    category: 'pizza' | 'drink' | 'supplement' | 'other';
    quantity: number;
    revenue: number;
    unitPrice: number;
  }[];
  salesTimeline: {
    timeLabel: string;
    orderCount: number;
    revenue: number;
  }[];

  // 7. Stocks & Dettes
  ingredientsStockValue: number;      // Valeur en stock des ingrédients (farine, fromage, sauce...)
  supplementsStockValue: number;      // Valeur en stock des suppléments
  drinksStockValue: number;           // Valeur en stock des boissons
  totalStockValue: number;            // Actif stock total valorisé au coût d'achat
  lowStockAlerts: LowStockAlertItem[];

  debts: {
    customerTotalDebt: number;        // Créances clients en cours
    supplierTotalDebt: number;        // Dettes fournisseurs en cours
  };
  purchases: {
    totalPurchasesCost: number;       // Achats fournisseurs réceptionnés sur la période
    purchasesCount: number;
  };
}

export interface InventoryValuation {
  totalItems: number;
  totalUnitsInStock: number;
  valuationAtCost: number;            // Valeur au coût d'achat en DZD
  valuationAtRetail: number;          // Valeur au prix de vente TTC en DZD
  potentialGrossMargin: number;
}

export class ReportService {
  private static instance: ReportService;

  private constructor() {}

  public static getInstance(): ReportService {
    if (!ReportService.instance) {
      ReportService.instance = new ReportService();
    }
    return ReportService.instance;
  }

  /**
   * Calcul des métriques financières et opérationnelles certifiées Pizzeria
   * Formules d'audit rigoureuses :
   * 1. Net Revenue = Total Ventes COMPLETED - Remboursements REFUNDED
   * 2. COGS = Σ (Quantité × Snapshot Coût d'achat historique figé)
   * 3. Marge Brute = Net Revenue - COGS
   * 4. Résultat Net = Marge Brute - Charges d'Exploitation (Hors Achats de stock pour éviter le double comptage)
   */
  public async getFinancialMetrics(dateStr?: string): Promise<FinancialMetrics> {
    const period = (dateStr === 'TODAY' ? new Date().toISOString().split('T')[0] : dateStr) || new Date().toISOString().split('T')[0];
    const currentMonth = new Date().toISOString().slice(0, 7);

    // ── 1. Ventes et Remboursements ──────────────────────────────────────────
    const allSales = await db.select<Sale>('SELECT * FROM sales');
    
    // Filtrage par période (ALL, MONTH, TODAY, ou date exacte YYYY-MM-DD)
    const periodSales = period === 'ALL'
      ? allSales
      : period === 'MONTH'
      ? allSales.filter(s => s.created_at && s.created_at.startsWith(currentMonth))
      : allSales.filter(s => s.created_at && s.created_at.startsWith(period));

    // Ségrégation par statut : Seules les ventes non annulées génèrent du CA brut
    const validSales = periodSales.filter(s => (s.status as string) !== 'CANCELLED');
    const completedSales = validSales.filter(s => s.status !== 'REFUNDED');
    const fullyRefundedSales = validSales.filter(s => s.status === 'REFUNDED');

    // Récupération des remboursements enregistrés dans la table refunds
    const allRefunds = await db.select<{ id: string; original_sale_id?: string; receipt_number?: string; refund_amount: number; created_at: string }>('SELECT * FROM refunds');
    const periodRefunds = period === 'ALL'
      ? allRefunds
      : period === 'MONTH'
      ? allRefunds.filter(r => r.created_at && r.created_at.startsWith(currentMonth))
      : allRefunds.filter(r => r.created_at && r.created_at.startsWith(period));

    let grossRevenue = 0;
    let totalDiscounts = 0;
    for (const sale of validSales) {
      grossRevenue = CurrencyUtil.add(grossRevenue, sale.total_ttc || sale.total_amount || 0);
      if (sale.discount_amount) {
        totalDiscounts = CurrencyUtil.add(totalDiscounts, sale.discount_amount);
      }
    }

    let totalRefunds = 0;
    for (const ref of periodRefunds) {
      totalRefunds = CurrencyUtil.add(totalRefunds, ref.refund_amount || 0);
    }
    // Ajouter les ventes marquées REFUNDED si non déjà décomptées dans refunds
    for (const refSale of fullyRefundedSales) {
      if (!periodRefunds.some(r => r.original_sale_id === refSale.id || r.receipt_number === refSale.receipt_number)) {
        totalRefunds = CurrencyUtil.add(totalRefunds, refSale.total_ttc || 0);
      }
    }

    // Chiffre d'Affaires Net = Ventes Brutes - Remboursements (déduction exacte et unique)
    const netRevenue = Math.max(0, CurrencyUtil.subtract(grossRevenue, totalRefunds));

    // ── 2. Lignes de vente et COGS historique ────────────────────────────────
    const completedSaleIds = new Set(completedSales.map(s => s.id));
    const allSaleItems = await db.select<SaleItem>('SELECT * FROM sale_items');
    const periodSaleItems = allSaleItems.filter(item => completedSaleIds.has(item.sale_id));

    // Récupération du référentiel produits, catégories et suppléments pour classification pizzeria
    const allProducts = await db.select<Product>('SELECT * FROM products');
    const productMap = new Map(allProducts.map(p => [p.id, p]));
    const allCategories = await db.select<{ id: string; name_fr: string; name_ar?: string }>('SELECT * FROM categories');
    const categoryMap = new Map(allCategories.map(c => [c.id, c]));
    const allSupplements = await db.select<{ id: string; name_fr?: string; name_ar?: string; name?: string; price: number; purchase_cost: number; current_stock: number; min_stock_alert: number }>('SELECT * FROM pizza_supplements');
    const supplementNames = new Set(allSupplements.map(s => (s.name_fr || s.name || '').toLowerCase()));
    const supplementIds = new Set(allSupplements.map(s => s.id));

    let cogs = 0;
    let itemsWithReliableCost = 0;
    const productSalesMap = new Map<string, {
      id: string;
      name: string;
      category: 'pizza' | 'drink' | 'supplement' | 'other';
      quantity: number;
      revenue: number;
      unitPrice: number;
    }>();

    // Catégorisation Pizzeria basée sur le schéma réel
    let pizzaRev = 0, pizzaQty = 0;
    let drinkRev = 0, drinkQty = 0;
    let suppRev = 0, suppQty = 0;
    let otherRev = 0, otherQty = 0;

    for (const item of periodSaleItems) {
      const prod = productMap.get(item.product_id);
      const prodName = (item.product_name || prod?.name_fr || 'Article').toLowerCase();
      const catId = prod?.category_id || '';
      const catObj = catId ? categoryMap.get(catId) : undefined;
      const catNameFr = (catObj?.name_fr || '').toLowerCase();

      // Détermination de la catégorie métier Pizzeria
      let cat: 'pizza' | 'drink' | 'supplement' | 'other' = 'other';
      if (
        catId === 'cat-pizza' ||
        catNameFr.includes('pizza') ||
        prodName.includes('pizza') ||
        prodName.includes('part') ||
        prodName.includes('saison') ||
        prodName.includes('margherita') ||
        prodName.includes('fromage') ||
        prodName.includes('sauce') ||
        prodName.includes('poulet') ||
        prodName.includes('viande') ||
        prodName.includes('thon')
      ) {
        cat = 'pizza';
        pizzaRev = CurrencyUtil.add(pizzaRev, item.total_ttc || 0);
        pizzaQty += item.quantity;
      } else if (
        catId === 'cat-drink' ||
        catNameFr.includes('boisson') ||
        prodName.includes('eau') ||
        prodName.includes('coca') ||
        prodName.includes('canette') ||
        prodName.includes('jus') ||
        prodName.includes('boisson') ||
        prodName.includes('soda') ||
        prodName.includes('fanta') ||
        prodName.includes('sprite') ||
        prodName.includes('schweppes')
      ) {
        cat = 'drink';
        drinkRev = CurrencyUtil.add(drinkRev, item.total_ttc || 0);
        drinkQty += item.quantity;
      } else if (
        supplementIds.has(item.product_id) ||
        catId === 'cat-supplement' ||
        catNameFr.includes('supplément') ||
        catNameFr.includes('extra') ||
        supplementNames.has(prodName) ||
        prodName.includes('supplément') ||
        prodName.includes('extra') ||
        (item as any).notes?.toLowerCase().includes('supplément')
      ) {
        cat = 'supplement';
        suppRev = CurrencyUtil.add(suppRev, item.total_ttc || 0);
        suppQty += item.quantity;
      } else {
        cat = 'other';
        otherRev = CurrencyUtil.add(otherRev, item.total_ttc || 0);
        otherQty += item.quantity;
      }

      // COGS basé rigoureusement sur le coût unitaire historique figé
      const snapshotCost = item.unit_purchase_cost_snapshot || 0;
      if (snapshotCost > 0) {
        itemsWithReliableCost += 1;
        const lineCost = CurrencyUtil.multiply(snapshotCost, item.quantity);
        cogs = CurrencyUtil.add(cogs, lineCost);
      }

      // Agrégation par produit
      const existing = productSalesMap.get(item.product_id) || {
        id: item.product_id,
        name: item.product_name || prod?.name_fr || 'Produit Inconnu',
        category: cat,
        quantity: 0,
        revenue: 0,
        unitPrice: item.unit_price_ttc || prod?.selling_price_ttc || 0
      };
      existing.quantity += item.quantity;
      existing.revenue = CurrencyUtil.add(existing.revenue, item.total_ttc || 0);
      productSalesMap.set(item.product_id, existing);
    }

    const cogsReliabilityPercent = periodSaleItems.length > 0
      ? Math.round((itemsWithReliableCost / periodSaleItems.length) * 100)
      : 100;

    const grossMargin = CurrencyUtil.subtract(netRevenue, cogs);
    const marginPercentage = netRevenue > 0
      ? Math.round((grossMargin / netRevenue) * 1000) / 10
      : 0;

    const transactionCount = completedSales.length;
    const averageBasket = transactionCount > 0 ? Math.round(netRevenue / transactionCount) : 0;

    // Répartition Pizzeria en pourcentages
    const categorySales: PizzeriaCategorySales = {
      pizzas: {
        revenue: pizzaRev,
        quantity: pizzaQty,
        percentage: netRevenue > 0 ? Math.round((pizzaRev / netRevenue) * 100) : 0
      },
      drinks: {
        revenue: drinkRev,
        quantity: drinkQty,
        percentage: netRevenue > 0 ? Math.round((drinkRev / netRevenue) * 100) : 0
      },
      supplements: {
        revenue: suppRev,
        quantity: suppQty,
        percentage: netRevenue > 0 ? Math.round((suppRev / netRevenue) * 100) : 0
      },
      other: {
        revenue: otherRev,
        quantity: otherQty,
        percentage: netRevenue > 0 ? Math.round((otherRev / netRevenue) * 100) : 0
      }
    };

    // ── 3. Charges d'Exploitation & Prévention du Double Comptage ────────────
    const allExpenses = await db.select<Expense>('SELECT * FROM expenses');
    const periodExpenses = period === 'ALL'
      ? allExpenses
      : period === 'MONTH'
      ? allExpenses.filter(e => (e.date && e.date.startsWith(currentMonth)) || (e.created_at && e.created_at.startsWith(currentMonth)))
      : allExpenses.filter(e => e.date === period || (e.created_at && e.created_at.startsWith(period)));

    let operatingExpenses = 0;
    let stockPurchasesExpenses = 0;
    const expensesByCategory: Record<string, number> = {};

    for (const exp of periodExpenses) {
      const cat = exp.category || 'OTHER';
      expensesByCategory[cat] = CurrencyUtil.add(expensesByCategory[cat] || 0, exp.amount);

      // Si l'achat concerne du stock/matière première payé comptant, on l'isole
      // pour NE PAS déduire le stock deux fois (déjà imputé via le COGS des ventes)
      if (cat === 'INGREDIENTS_PURCHASE' || cat === 'SUPPLEMENTS_PURCHASE') {
        stockPurchasesExpenses = CurrencyUtil.add(stockPurchasesExpenses, exp.amount);
      } else {
        operatingExpenses = CurrencyUtil.add(operatingExpenses, exp.amount);
      }
    }

    const totalExpenses = CurrencyUtil.add(operatingExpenses, stockPurchasesExpenses);

    // Résultat Net d'Exploitation = Marge Brute - Charges Opérationnelles
    const netResult = CurrencyUtil.subtract(grossMargin, operatingExpenses);
    const netMarginPercentage = netRevenue > 0
      ? Math.round((netResult / netRevenue) * 1000) / 10
      : 0;

    // ── 4. Ventilation des Règlements & Réconciliation Caisse ─────────────────
    const allPayments = await db.select<Payment>('SELECT * FROM payments');
    let cash = 0, cib_edahabia = 0, baridimob = 0, credit = 0;

    for (const p of allPayments) {
      if (completedSaleIds.has(p.sale_id)) {
        if (p.payment_method === 'CASH') cash = CurrencyUtil.add(cash, p.amount);
        else if (p.payment_method === 'CIB' || p.payment_method === 'EDAHABIA') cib_edahabia = CurrencyUtil.add(cib_edahabia, p.amount);
        else if (p.payment_method === 'BARIDIMOB') baridimob = CurrencyUtil.add(baridimob, p.amount);
        else if (p.payment_method === 'CREDIT') credit = CurrencyUtil.add(credit, p.amount);
      }
    }

    // Sessions de caisse
    const allCashSessions = await db.select<{
      id: string;
      opened_at: string;
      opening_float: number;
      total_cash_sales: number;
      total_cash_expenses: number;
      expected_cash_drawer: number;
      actual_counted_cash: number;
      cash_discrepancy: number;
    }>('SELECT * FROM cash_sessions');

    const periodSessions = period === 'ALL'
      ? allCashSessions
      : period === 'MONTH'
      ? allCashSessions.filter(cs => cs.opened_at && cs.opened_at.startsWith(currentMonth))
      : allCashSessions.filter(cs => cs.opened_at && cs.opened_at.startsWith(period));

    let openingFloat = 0, sessionCashSales = 0, sessionCashExpenses = 0, expectedDrawer = 0, actualCounted = 0, discrepancy = 0;
    for (const cs of periodSessions) {
      openingFloat = CurrencyUtil.add(openingFloat, cs.opening_float || 0);
      sessionCashSales = CurrencyUtil.add(sessionCashSales, cs.total_cash_sales || 0);
      sessionCashExpenses = CurrencyUtil.add(sessionCashExpenses, cs.total_cash_expenses || 0);
      expectedDrawer = CurrencyUtil.add(expectedDrawer, cs.expected_cash_drawer || 0);
      actualCounted = CurrencyUtil.add(actualCounted, cs.actual_counted_cash || 0);
      discrepancy = CurrencyUtil.add(discrepancy, cs.cash_discrepancy || 0);
    }

    // Si aucune session n'est explicitement ouverte, on prend les encaissements directs
    if (periodSessions.length === 0) {
      sessionCashSales = cash;
      sessionCashExpenses = periodExpenses.filter(e => e.payment_method === 'CASH').reduce((sum, e) => sum + e.amount, 0);
      expectedDrawer = CurrencyUtil.subtract(sessionCashSales, sessionCashExpenses);
    }

    const cashSessionSummary: CashSessionSummary = {
      sessionsCount: periodSessions.length,
      openingFloat,
      cashSales: sessionCashSales,
      cashExpenses: sessionCashExpenses,
      expectedCash: expectedDrawer,
      actualCounted,
      discrepancy
    };

    // ── 5. Produits Pizzeria (Triés par quantité pour classement & recherche) ─
    const topProducts = Array.from(productSalesMap.values())
      .sort((a, b) => b.quantity - a.quantity);

    // ── 5.1 Chronologie et Courbe des Ventes Pizzeria ─────────────────────────
    const salesTimeline: { timeLabel: string; orderCount: number; revenue: number }[] = [];
    if (period === 'ALL') {
      const dateMap = new Map<string, { orderCount: number; revenue: number }>();
      for (const s of completedSales) {
        const d = (s.created_at || '').slice(0, 10);
        if (!d) continue;
        const cur = dateMap.get(d) || { orderCount: 0, revenue: 0 };
        cur.orderCount += 1;
        cur.revenue = CurrencyUtil.add(cur.revenue, s.total_ttc || 0);
        dateMap.set(d, cur);
      }
      const sortedDates = Array.from(dateMap.keys()).sort();
      for (const d of sortedDates) {
        const item = dateMap.get(d)!;
        salesTimeline.push({
          timeLabel: d.slice(5),
          orderCount: item.orderCount,
          revenue: item.revenue
        });
      }
    } else if (period === 'MONTH') {
      const dayMap = new Map<number, { orderCount: number; revenue: number }>();
      for (const s of completedSales) {
        const dt = new Date(s.created_at);
        const day = dt.getDate();
        const cur = dayMap.get(day) || { orderCount: 0, revenue: 0 };
        cur.orderCount += 1;
        cur.revenue = CurrencyUtil.add(cur.revenue, s.total_ttc || 0);
        dayMap.set(day, cur);
      }
      for (let day = 1; day <= 31; day++) {
        if (dayMap.has(day)) {
          const item = dayMap.get(day)!;
          salesTimeline.push({
            timeLabel: `J-${day < 10 ? '0' + day : day}`,
            orderCount: item.orderCount,
            revenue: item.revenue
          });
        }
      }
    } else {
      const hourMap = new Map<number, { orderCount: number; revenue: number }>();
      for (const s of completedSales) {
        const dt = new Date(s.created_at);
        const h = dt.getHours();
        const cur = hourMap.get(h) || { orderCount: 0, revenue: 0 };
        cur.orderCount += 1;
        cur.revenue = CurrencyUtil.add(cur.revenue, s.total_ttc || 0);
        hourMap.set(h, cur);
      }
      const activeHours = Array.from(hourMap.keys()).sort((a, b) => a - b);
      const minH = activeHours.length > 0 ? Math.min(11, activeHours[0]) : 11;
      const maxH = activeHours.length > 0 ? Math.max(23, activeHours[activeHours.length - 1]) : 23;
      for (let h = minH; h <= maxH; h++) {
        const cur = hourMap.get(h) || { orderCount: 0, revenue: 0 };
        salesTimeline.push({
          timeLabel: `${h}h`,
          orderCount: cur.orderCount,
          revenue: cur.revenue
        });
      }
    }

    // ── 6. Actif Stock Réel Pizzeria & Alertes ────────────────────────────────
    const allIngredients = await db.select<Ingredient>(
      'SELECT id, name_fr, unit, current_stock, min_stock_alert, cost_per_unit FROM ingredients WHERE is_active = 1'
    );
    const ingredientsStockValue = allIngredients.reduce(
      (sum, i) => sum + (i.current_stock || 0) * (i.cost_per_unit || 0),
      0
    );

    const supplementsStockValue = allSupplements.reduce(
      (sum, s) => sum + (s.current_stock || 0) * (s.purchase_cost || 0),
      0
    );

    // Boissons en stock
    const drinkProducts = allProducts.filter(p => p.is_active === 1 && p.category_id === 'cat-drink');
    const drinksStockValue = drinkProducts.reduce(
      (sum, d) => sum + (d.current_stock || 0) * (d.purchase_cost || 0),
      0
    );

    const totalStockValue = CurrencyUtil.add(
      CurrencyUtil.add(ingredientsStockValue, supplementsStockValue),
      drinksStockValue
    );

    // Alertes stock faible
    const lowStockAlerts: LowStockAlertItem[] = [];
    for (const ing of allIngredients) {
      if (ing.current_stock <= ing.min_stock_alert) {
        lowStockAlerts.push({
          id: ing.id,
          name: ing.name_fr,
          type: 'ingredient',
          currentStock: ing.current_stock,
          minAlert: ing.min_stock_alert,
          unit: ing.unit
        });
      }
    }
    for (const drk of drinkProducts) {
      if (drk.current_stock <= drk.min_stock_alert) {
        lowStockAlerts.push({
          id: drk.id,
          name: drk.name_fr,
          type: 'product',
          currentStock: drk.current_stock,
          minAlert: drk.min_stock_alert,
          unit: 'canette/btl'
        });
      }
    }

    // ── 7. Créances Clients & Dettes Fournisseurs ────────────────────────────
    const customers = await db.select<{ current_debt: number }>('SELECT current_debt FROM customers');
    const customerTotalDebt = customers.reduce((sum, c) => sum + (c.current_debt || 0), 0);

    const suppliers = await db.select<{ current_balance: number }>('SELECT current_balance FROM suppliers');
    const supplierTotalDebt = suppliers.reduce((sum, s) => sum + (s.current_balance || 0), 0);

    // Achats fournisseurs sur la période
    const allPurchases = await db.select<{ total_cost: number; ordered_at: string }>('SELECT total_cost, ordered_at FROM purchases');
    const periodPurchases = period === 'ALL'
      ? allPurchases
      : period === 'MONTH'
      ? allPurchases.filter(p => p.ordered_at && p.ordered_at.startsWith(currentMonth))
      : allPurchases.filter(p => p.ordered_at && p.ordered_at.startsWith(period));
    const totalPurchasesCost = periodPurchases.reduce((sum, p) => sum + (p.total_cost || 0), 0);

    return {
      grossRevenue,
      totalDiscounts,
      totalRefunds,
      revenue: netRevenue,
      transactionCount,
      averageBasket,
      cogs,
      cogsReliabilityPercent,
      grossMargin,
      marginPercentage,
      operatingExpenses,
      stockPurchasesExpenses,
      expenses: totalExpenses,
      netResult,
      netMarginPercentage,
      expensesByCategory,
      categorySales,
      paymentBreakdown: {
        cash,
        cib_edahabia,
        baridimob,
        credit
      },
      cashSessionSummary,
      topProducts,
      salesTimeline,
      ingredientsStockValue: Math.round(ingredientsStockValue),
      supplementsStockValue: Math.round(supplementsStockValue),
      drinksStockValue: Math.round(drinksStockValue),
      totalStockValue: Math.round(totalStockValue),
      lowStockAlerts,
      debts: {
        customerTotalDebt,
        supplierTotalDebt
      },
      purchases: {
        totalPurchasesCost,
        purchasesCount: periodPurchases.length
      }
    };
  }

  public async getFinancialSummary(filter?: string | { startDate?: string; endDate?: string }): Promise<{
    grossRevenue: number;
    netRevenue: number;
    totalRefunds: number;
    costOfGoodsSold: number;
    grossMargin: number;
    totalExpenses: number;
    operatingExpenses: number;
    netOperatingProfit: number;
    paymentsByMethod: Array<{ method: string; total: number }>;
  }> {
    const period = typeof filter === 'string' ? filter : 'ALL';
    const metrics = await this.getFinancialMetrics(period);
    return {
      grossRevenue: metrics.grossRevenue,
      netRevenue: metrics.revenue,
      totalRefunds: metrics.totalRefunds,
      costOfGoodsSold: metrics.cogs,
      grossMargin: metrics.grossMargin,
      totalExpenses: metrics.expenses,
      operatingExpenses: metrics.operatingExpenses,
      netOperatingProfit: metrics.netResult,
      paymentsByMethod: [
        { method: 'CASH', total: metrics.paymentBreakdown.cash },
        { method: 'CARD', total: metrics.paymentBreakdown.cib_edahabia },
        { method: 'BARIDIMOB', total: metrics.paymentBreakdown.baridimob },
        { method: 'CREDIT', total: metrics.paymentBreakdown.credit }
      ]
    };
  }

  // Valorisation de l'actif stock magasin (Produits finis, Ingrédients, Suppléments)
  public async getInventoryValuation(): Promise<InventoryValuation> {
    const products = await db.select<Product>('SELECT * FROM products WHERE is_active = 1');
    const ingredients = await db.select<Ingredient>('SELECT * FROM ingredients WHERE is_active = 1');
    const supplements = await db.select<{ id: string; current_stock: number; purchase_cost: number; price: number }>('SELECT * FROM pizza_supplements WHERE is_active = 1');
    
    let totalUnits = 0;
    let valuationCost = 0;
    let valuationRetail = 0;

    for (const p of products) {
      if (p.current_stock > 0) {
        totalUnits += p.current_stock;
        valuationCost = CurrencyUtil.add(valuationCost, CurrencyUtil.multiply(p.purchase_cost || 0, p.current_stock));
        valuationRetail = CurrencyUtil.add(valuationRetail, CurrencyUtil.multiply(p.selling_price_ttc || 0, p.current_stock));
      }
    }

    for (const ing of ingredients) {
      if (ing.current_stock > 0) {
        valuationCost = CurrencyUtil.add(valuationCost, CurrencyUtil.multiply(ing.cost_per_unit || 0, ing.current_stock));
      }
    }

    for (const sup of supplements) {
      if (sup.current_stock > 0) {
        totalUnits += sup.current_stock;
        valuationCost = CurrencyUtil.add(valuationCost, CurrencyUtil.multiply(sup.purchase_cost || 0, sup.current_stock));
        valuationRetail = CurrencyUtil.add(valuationRetail, CurrencyUtil.multiply(sup.price || 0, sup.current_stock));
      }
    }

    return {
      totalItems: products.length + ingredients.length + supplements.length,
      totalUnitsInStock: Math.round(totalUnits),
      valuationAtCost: Math.round(valuationCost),
      valuationAtRetail: Math.round(valuationRetail),
      potentialGrossMargin: Math.round(CurrencyUtil.subtract(valuationRetail, valuationCost))
    };
  }

  /**
   * Calcul de la consommation théorique d'ingrédients sur la période
   * Dérivé des fiches techniques (recipe_items) et des portions de pizzas vendues
   */
  public async getIngredientConsumption(dateStr?: string): Promise<IngredientConsumption[]> {
    const period = (dateStr === 'TODAY' ? new Date().toISOString().split('T')[0] : dateStr) || new Date().toISOString().split('T')[0];
    const currentMonth = new Date().toISOString().slice(0, 7);

    const allSales = await db.select<Sale>('SELECT * FROM sales');
    const periodSales = period === 'ALL'
      ? allSales
      : period === 'MONTH'
      ? allSales.filter(s => s.created_at && s.created_at.startsWith(currentMonth))
      : allSales.filter(s => s.created_at && s.created_at.startsWith(period));

    const completedSaleIds = new Set(
      periodSales.filter(s => (s.status as string) !== 'CANCELLED' && s.status !== 'REFUNDED').map(s => s.id)
    );

    const allSaleItems = await db.select<SaleItem>('SELECT * FROM sale_items');
    const periodSaleItems = allSaleItems.filter(item => completedSaleIds.has(item.sale_id));

    const recipes = await db.select<RecipeItem>('SELECT * FROM recipe_items');
    const ingredients = await db.select<Ingredient>('SELECT * FROM ingredients');
    const ingMap = new Map(ingredients.map(i => [i.id, i]));

    const productRecipesMap = new Map<string, RecipeItem[]>();
    for (const r of recipes) {
      const list = productRecipesMap.get(r.product_id) || [];
      list.push(r);
      productRecipesMap.set(r.product_id, list);
    }

    const consumptionMap = new Map<string, IngredientConsumption>();

    for (const si of periodSaleItems) {
      const recipe = productRecipesMap.get(si.product_id);
      if (!recipe) continue;

      for (const item of recipe) {
        const ing = ingMap.get(item.ingredient_id);
        const name = ing?.name_fr || 'Ingrédient';
        const unit = item.unit_display || ing?.unit || 'kg';
        const costPerUnit = ing?.cost_per_unit || 0;
        const qtyConsumed = (item.quantity_required || 0) * (si.quantity || 0);
        const costConsumed = CurrencyUtil.multiply(costPerUnit, qtyConsumed);

        const existing = consumptionMap.get(item.ingredient_id) || {
          ingredientId: item.ingredient_id,
          ingredientName: name,
          unit,
          costPerUnit,
          totalQuantityConsumed: 0,
          totalCostConsumed: 0
        };

        existing.totalQuantityConsumed = Math.round((existing.totalQuantityConsumed + qtyConsumed) * 1000) / 1000;
        existing.totalCostConsumed = CurrencyUtil.add(existing.totalCostConsumed, costConsumed);
        consumptionMap.set(item.ingredient_id, existing);
      }
    }

    return Array.from(consumptionMap.values()).sort((a, b) => b.totalCostConsumed - a.totalCostConsumed);
  }

  // Export CSV universel certifié Pizzeria
  public exportToCsv(filename: string, headers: string[], rows: any[][]): void {
    const csvContent = [
      headers.join(';'),
      ...rows.map(r => r.map(val => `"${String(val ?? '').replace(/"/g, '""')}"`).join(';'))
    ].join('\r\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

export const reportService = ReportService.getInstance();
