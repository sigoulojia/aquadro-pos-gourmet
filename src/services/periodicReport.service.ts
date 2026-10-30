// Aquadro POS Algérie V2 — Service de Reporting Périodique (Journalier 22:00, Hebdomadaire, Mensuel)
// Génération de données financières certifiées et export PDF / A4 haute définition

import { db } from '../db/sqlite';
import { CurrencyUtil } from '../core/currency/currency';
import { Sale, SaleItem, Payment, Expense, Product, CashSession, Store } from '../types/database';

export interface DailyReportData {
  date: string;                     // YYYY-MM-DD
  isReady: boolean;                 // Vrai si après 22:00 ou date passée
  readyTime: string;                // '22:00'
  currentHour: number;
  timeRemainingMinutes: number;
  timeRemainingFormatted: string;   // Ex: '04h 30m'
  statusTextFr: string;
  statusTextAr: string;
  metrics: {
    totalRevenue: number;           // Chiffre d'Affaires TTC
    cogs: number;                   // Coût d'achat marchandises
    grossMargin: number;            // Marge brute
    marginPercent: number;          // Taux de marge (%)
    totalExpenses: number;          // Dépenses du jour
    netProfit: number;              // Résultat net (Bénéfice)
    orderCount: number;             // Nombre de tickets
    averageBasket: number;          // Panier moyen
    paymentBreakdown: {
      cash: number;
      cib_edahabia: number;
      baridimob: number;
      credit: number;
    };
    hourlyDistribution: {
      hour: string;
      count: number;
      revenue: number;
    }[];
    topProducts: {
      name: string;
      quantity: number;
      revenue: number;
      unitPrice: number;
    }[];
    expensesList: {
      category: string;
      description: string;
      amount: number;
      method: string;
    }[];
    cashSummary: {
      openingFloat: number;
      cashSales: number;
      cashExpenses: number;
      expectedCash: number;
      activeSessions: number;
    };
    stockAlertsCount: number;
  };
}

export interface WeeklyReportData {
  startDate: string;                // YYYY-MM-DD
  endDate: string;                  // YYYY-MM-DD
  weekNumber: number;
  metrics: {
    totalRevenue: number;
    totalCogs: number;
    grossMargin: number;
    marginPercent: number;
    totalExpenses: number;
    netProfit: number;
    orderCount: number;
    averageBasket: number;
    bestDay: {
      date: string;
      dayNameFr: string;
      dayNameAr: string;
      revenue: number;
    };
    dailyBreakdown: {
      date: string;
      dayNameFr: string;
      dayNameAr: string;
      revenue: number;
      orders: number;
      expenses: number;
      net: number;
    }[];
    topProducts: {
      name: string;
      quantity: number;
      revenue: number;
    }[];
    supplierPurchases: {
      totalCost: number;
      count: number;
    };
    customerCredits: {
      granted: number;
      totalOutstanding: number;
    };
  };
}

export interface MonthlyReportData {
  yearMonth: string;                // YYYY-MM
  monthNameFr: string;
  monthNameAr: string;
  year: number;
  metrics: {
    totalRevenue: number;
    totalCogs: number;
    grossMargin: number;
    marginPercent: number;
    totalExpenses: number;
    netProfit: number;
    orderCount: number;
    averageBasket: number;
    weeklyBreakdown: {
      weekLabelFr: string;
      weekLabelAr: string;
      startDate: string;
      endDate: string;
      revenue: number;
      expenses: number;
      net: number;
    }[];
    expensesByCategory: Record<string, number>;
    topProducts: {
      name: string;
      quantity: number;
      revenue: number;
    }[];
    inventoryValuation: {
      ingredientsValue: number;
      supplementsValue: number;
      totalValue: number;
    };
    debtStatus: {
      customerTotalDebt: number;
      supplierTotalDebt: number;
    };
  };
}

const EXPENSE_CATEGORIES_TRANSLATION: Record<string, { fr: string; ar: string }> = {
  RENT: { fr: 'Loyer Magasin', ar: 'إيجار المحل' },
  ELECTRICITY: { fr: 'Électricité & Gaz', ar: 'الكهرباء والغاز' },
  WATER: { fr: 'Eau', ar: 'الماء' },
  INTERNET: { fr: 'Télécom & Internet', ar: 'الهاتف والإنترنت' },
  PACKAGING: { fr: 'Emballages Divers', ar: 'أكياس وتغليف' },
  PIZZA_BOXES: { fr: 'Boîtes à Pizza', ar: 'علب كرتون البيتزا' },
  NAPKINS: { fr: 'Serviettes & Consommables', ar: 'مناديل ومستهلكات' },
  TRANSPORT: { fr: 'Transport & Carburant', ar: 'النقل والوقود' },
  MAINTENANCE: { fr: 'Entretien & Réparations', ar: 'الصيانة والتصليح' },
  CLEANING: { fr: 'Produits d\'Entretien', ar: 'مواد التنظيف' },
  SUPPLIES: { fr: 'Fournitures Diverses', ar: 'لوازم متنوعة' },
  INGREDIENTS_PURCHASE: { fr: 'Achat Ingrédients Comptant', ar: 'شراء مقادير نقداً' },
  SUPPLEMENTS_PURCHASE: { fr: 'Achat Suppléments Comptant', ar: 'شراء إضافات نقداً' },
  SALARY: { fr: 'Salaires Personnel', ar: 'رواتب العمال' },
  CHEF_SALARY: { fr: 'Rémunération Pizzaiolo / Chef', ar: 'أجرة الشيف بيتزايولو' },
  OTHER: { fr: 'Autres Dépenses', ar: 'مصاريف أخرى' }
};

export class PeriodicReportService {
  private static instance: PeriodicReportService;

  private constructor() {}

  public static getInstance(): PeriodicReportService {
    if (!PeriodicReportService.instance) {
      PeriodicReportService.instance = new PeriodicReportService();
    }
    return PeriodicReportService.instance;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 1. RAPPORT JOURNALIER (Complet, prêt à 22:00)
  // ──────────────────────────────────────────────────────────────────────────
  public async getDailyReport(targetDateStr?: string): Promise<DailyReportData> {
    const today = new Date().toISOString().split('T')[0];
    const targetDate = targetDateStr || today;

    // Détermination de l'état d'échéance à 22h00
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    let isReady = false;
    let timeRemainingMinutes = 0;
    let timeRemainingFormatted = '';
    let statusTextFr = '';
    let statusTextAr = '';

    if (targetDate < today) {
      // Date antérieure : déjà clôturée
      isReady = true;
      timeRemainingMinutes = 0;
      timeRemainingFormatted = '00h 00m';
      statusTextFr = 'Rapport Clôturé & Archivé (Clôture effectuée à 22:00)';
      statusTextAr = 'تقرير مقفل ومؤرشف (تم الإغلاق على الساعة 22:00)';
    } else if (targetDate === today) {
      if (currentHour >= 22) {
        isReady = true;
        timeRemainingMinutes = 0;
        timeRemainingFormatted = '00h 00m';
        statusTextFr = 'Rapport Journalier Clôturé & Prêt (22:00 Dépassée)';
        statusTextAr = 'التقرير اليومي مكتمل وجاهز (تم تجاوز الساعة 22:00)';
      } else {
        isReady = false;
        // Calcul des minutes restantes avant 22h00
        const totalMinutesTarget = 22 * 60;
        const totalMinutesCurrent = currentHour * 60 + currentMinute;
        timeRemainingMinutes = Math.max(0, totalMinutesTarget - totalMinutesCurrent);
        const remH = Math.floor(timeRemainingMinutes / 60);
        const remM = timeRemainingMinutes % 60;
        timeRemainingFormatted = `${String(remH).padStart(2, '0')}h ${String(remM).padStart(2, '0')}m`;
        statusTextFr = `En cours de saisie — Clôture officielle à 22:00 (Reste ${timeRemainingFormatted})`;
        statusTextAr = `قيد التسجيل — الإغلاق الرسمي على الساعة 22:00 (باقي ${remH} س و ${remM} د)`;
      }
    } else {
      // Date future
      isReady = false;
      timeRemainingMinutes = 0;
      timeRemainingFormatted = '--';
      statusTextFr = 'Date future non clôturée';
      statusTextAr = 'تاريخ مستقبلي غير مقفل';
    }

    // Récupération des données SQLite
    const allSales = await db.select<Sale>("SELECT * FROM sales WHERE status != 'CANCELLED'");
    const daySales = allSales.filter(s => s.created_at && s.created_at.startsWith(targetDate));
    const activeDaySales = daySales.filter(s => s.status !== 'REFUNDED');
    const saleIds = new Set(activeDaySales.map(s => s.id));

    const allSaleItems = await db.select<SaleItem>('SELECT * FROM sale_items');
    const allProducts = await db.select<Product>('SELECT id, name_fr, name_ar, selling_price_ttc FROM products');
    const productMap = new Map(allProducts.map(p => [p.id, p]));

    const allPayments = await db.select<Payment>('SELECT * FROM payments');
    const allExpenses = await db.select<Expense>('SELECT * FROM expenses');
    const dayExpenses = allExpenses.filter(e => 
      e.date === targetDate || (e.created_at && e.created_at.startsWith(targetDate))
    );

    const allSessions = await db.select<CashSession>('SELECT * FROM cash_sessions');
    const daySessions = allSessions.filter(cs => cs.opened_at && cs.opened_at.startsWith(targetDate));

    // Remboursements enregistrés sur la journée
    const allRefunds = await db.select<{ id: string; original_sale_id?: string; receipt_number?: string; refund_amount: number; created_at: string }>('SELECT * FROM refunds');
    const allRefundItems = await db.select<{ refund_id: string; sale_item_id: string; quantity: number; refund_amount: number }>('SELECT * FROM refund_items');
    const dayRefunds = allRefunds.filter(r => r.created_at && r.created_at.startsWith(targetDate));
    const dayRefundIds = new Set(dayRefunds.map(r => r.id));
    const refundedQtyBySaleItem = new Map<string, number>();
    const refundedRevBySaleItem = new Map<string, number>();
    for (const ri of allRefundItems) {
      if (dayRefundIds.has(ri.refund_id)) {
        refundedQtyBySaleItem.set(ri.sale_item_id, (refundedQtyBySaleItem.get(ri.sale_item_id) || 0) + (ri.quantity || 0));
        refundedRevBySaleItem.set(ri.sale_item_id, CurrencyUtil.add(refundedRevBySaleItem.get(ri.sale_item_id) || 0, ri.refund_amount || 0));
      }
    }

    let dayRefundAmount = 0;
    for (const ref of dayRefunds) {
      dayRefundAmount = CurrencyUtil.add(dayRefundAmount, ref.refund_amount || 0);
    }
    const fullyRefundedSales = daySales.filter(s => s.status === 'REFUNDED');
    for (const refSale of fullyRefundedSales) {
      if (!dayRefunds.some(r => r.original_sale_id === refSale.id || r.receipt_number === refSale.receipt_number)) {
        dayRefundAmount = CurrencyUtil.add(dayRefundAmount, refSale.total_ttc || 0);
      }
    }

    // Calculs financiers
    let grossRevenue = 0;
    for (const sale of daySales) {
      grossRevenue = CurrencyUtil.add(grossRevenue, sale.total_ttc || sale.total_amount || 0);
    }
    const totalRevenue = Math.max(0, CurrencyUtil.subtract(grossRevenue, dayRefundAmount));

    let cogs = 0;
    const productSalesMap = new Map<string, { name: string; quantity: number; revenue: number; unitPrice: number }>();
    const hourlyMap: Record<string, { count: number; revenue: number }> = {};

    // Initialiser les tranches horaires 10h -> 23h
    for (let h = 10; h <= 23; h++) {
      const hStr = `${String(h).padStart(2, '0')}:00`;
      hourlyMap[hStr] = { count: 0, revenue: 0 };
    }

    for (const sale of daySales) {
      if (sale.created_at) {
        const hKey = `${sale.created_at.slice(11, 13)}:00`;
        if (hourlyMap[hKey]) {
          hourlyMap[hKey].count += 1;
          hourlyMap[hKey].revenue = CurrencyUtil.add(hourlyMap[hKey].revenue, sale.total_ttc || sale.total_amount || 0);
        }
      }
    }

    for (const item of allSaleItems) {
      if (saleIds.has(item.sale_id)) {
        const netQty = Math.max(0, item.quantity - (refundedQtyBySaleItem.get(item.id) || 0));
        const netItemRev = Math.max(0, CurrencyUtil.subtract(item.total_ttc || 0, refundedRevBySaleItem.get(item.id) || 0));
        const lineCost = CurrencyUtil.multiply(item.unit_purchase_cost_snapshot || 0, netQty);
        cogs = CurrencyUtil.add(cogs, lineCost);

        if (netQty > 0) {
          const prodInfo = productMap.get(item.product_id);
          const name = item.product_name || prodInfo?.name_fr || 'Produit';
          const existing = productSalesMap.get(item.product_id) || {
            name,
            quantity: 0,
            revenue: 0,
            unitPrice: item.unit_price_ttc || prodInfo?.selling_price_ttc || 0
          };
          existing.quantity += netQty;
          existing.revenue = CurrencyUtil.add(existing.revenue, netItemRev);
          productSalesMap.set(item.product_id, existing);
        }
      }
    }

    const grossMargin = CurrencyUtil.subtract(totalRevenue, cogs);
    const marginPercent = totalRevenue > 0 ? Math.round((grossMargin / totalRevenue) * 1000) / 10 : 0;

    let totalExpenses = 0;
    let operatingExpenses = 0;
    const expensesList = dayExpenses.map(e => {
      totalExpenses = CurrencyUtil.add(totalExpenses, e.amount);
      if (e.category !== 'INGREDIENTS_PURCHASE' && e.category !== 'SUPPLEMENTS_PURCHASE') {
        operatingExpenses = CurrencyUtil.add(operatingExpenses, e.amount);
      }
      const catTrans = EXPENSE_CATEGORIES_TRANSLATION[e.category] || { fr: e.category, ar: e.category };
      return {
        category: `${catTrans.fr} (${catTrans.ar})`,
        description: e.description || '',
        amount: e.amount,
        method: e.payment_method || 'CASH'
      };
    });

    const netProfit = CurrencyUtil.subtract(grossMargin, operatingExpenses);
    const orderCount = activeDaySales.length;
    const averageBasket = orderCount > 0 ? Math.round(totalRevenue / orderCount) : 0;

    // Règlements
    let cash = 0;
    let cib_edahabia = 0;
    let baridimob = 0;
    let credit = 0;

    for (const p of allPayments) {
      if (saleIds.has(p.sale_id)) {
        if (p.payment_method === 'CASH') cash = CurrencyUtil.add(cash, p.amount);
        else if (p.payment_method === 'CIB' || p.payment_method === 'EDAHABIA') cib_edahabia = CurrencyUtil.add(cib_edahabia, p.amount);
        else if (p.payment_method === 'BARIDIMOB') baridimob = CurrencyUtil.add(baridimob, p.amount);
        else if (p.payment_method === 'CREDIT') credit = CurrencyUtil.add(credit, p.amount);
      }
    }

    // Tiroir caisse
    let openingFloat = 0;
    let cashSalesTotal = 0;
    let cashExpensesTotal = 0;
    let cashRefundsTotal = 0;

    for (const cs of daySessions) {
      openingFloat = CurrencyUtil.add(openingFloat, cs.opening_float || 0);
      cashSalesTotal = CurrencyUtil.add(cashSalesTotal, cs.total_cash_sales || 0);
      cashExpensesTotal = CurrencyUtil.add(cashExpensesTotal, cs.total_cash_expenses || 0);
      cashRefundsTotal = CurrencyUtil.add(cashRefundsTotal, cs.total_cash_refunds || 0);
    }
    // Si pas de session enregistrée, on estime avec les règlements cash, remboursements cash et dépenses cash du jour
    if (daySessions.length === 0) {
      cashSalesTotal = cash;
      cashExpensesTotal = dayExpenses.filter(e => e.payment_method === 'CASH').reduce((sum, e) => sum + e.amount, 0);
      cashRefundsTotal = dayRefundAmount;
    }
    const expectedCash = CurrencyUtil.subtract(
      CurrencyUtil.add(openingFloat, cashSalesTotal),
      CurrencyUtil.add(cashExpensesTotal, cashRefundsTotal)
    );

    const topProducts = Array.from(productSalesMap.values())
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 15);

    const hourlyDistribution = Object.entries(hourlyMap).map(([hour, val]) => ({
      hour,
      count: val.count,
      revenue: val.revenue
    }));

    // Alertes stock
    const lowStockIngredients = await db.select<{ id: string }>(
      'SELECT id FROM ingredients WHERE is_active = 1 AND current_stock <= min_stock_alert'
    );

    return {
      date: targetDate,
      isReady,
      readyTime: '22:00',
      currentHour,
      timeRemainingMinutes,
      timeRemainingFormatted,
      statusTextFr,
      statusTextAr,
      metrics: {
        totalRevenue,
        cogs,
        grossMargin,
        marginPercent,
        totalExpenses,
        netProfit,
        orderCount,
        averageBasket,
        paymentBreakdown: {
          cash,
          cib_edahabia,
          baridimob,
          credit
        },
        hourlyDistribution,
        topProducts,
        expensesList,
        cashSummary: {
          openingFloat,
          cashSales: cashSalesTotal,
          cashExpenses: cashExpensesTotal,
          expectedCash,
          activeSessions: daySessions.length
        },
        stockAlertsCount: lowStockIngredients.length
      }
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 2. RAPPORT HEBDOMADAIRE (Sur 7 jours)
  // ──────────────────────────────────────────────────────────────────────────
  public async getWeeklyReport(referenceDateStr?: string): Promise<WeeklyReportData> {
    const refDate = referenceDateStr ? new Date(referenceDateStr) : new Date();
    
    // Déterminer les 7 jours de la semaine (Samedi -> Vendredi en Algérie)
    // Trouver le samedi précédent ou jour même
    const currentDayOfWeek = refDate.getDay(); // 0 = Dimanche, 6 = Samedi
    const diffToSaturday = (currentDayOfWeek + 1) % 7; // Samedi = 0, Dimanche = 1, etc.
    
    const saturday = new Date(refDate);
    saturday.setDate(refDate.getDate() - diffToSaturday);

    const weekDays: { date: string; dayNameFr: string; dayNameAr: string }[] = [];
    const DAY_NAMES: { fr: string; ar: string }[] = [
      { fr: 'Samedi', ar: 'السبت' },
      { fr: 'Dimanche', ar: 'الأحد' },
      { fr: 'Lundi', ar: 'الإثنين' },
      { fr: 'Mardi', ar: 'الثلاثاء' },
      { fr: 'Mercredi', ar: 'الأربعاء' },
      { fr: 'Jeudi', ar: 'الخميس' },
      { fr: 'Vendredi', ar: 'الجمعة' }
    ];

    for (let i = 0; i < 7; i++) {
      const d = new Date(saturday);
      d.setDate(saturday.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      weekDays.push({
        date: dateStr,
        dayNameFr: DAY_NAMES[i].fr,
        dayNameAr: DAY_NAMES[i].ar
      });
    }

    const startDate = weekDays[0].date;
    const endDate = weekDays[6].date;

    const allSales = await db.select<Sale>("SELECT * FROM sales WHERE status != 'CANCELLED'");
    const allSaleItems = await db.select<SaleItem>('SELECT * FROM sale_items');
    const allExpenses = await db.select<Expense>('SELECT * FROM expenses');
    const allPurchases = await db.select<{ total_cost: number; ordered_at: string }>('SELECT total_cost, ordered_at FROM purchases');
    const allRefunds = await db.select<{ id: string; original_sale_id?: string; receipt_number?: string; refund_amount: number; created_at: string }>('SELECT * FROM refunds');
    const allRefundItems = await db.select<{ refund_id: string; sale_item_id: string; quantity: number; refund_amount: number }>('SELECT * FROM refund_items');
    const customers = await db.select<{ current_debt: number }>('SELECT current_debt FROM customers');

    let totalRevenue = 0;
    let totalCogs = 0;
    let totalExpenses = 0;
    let totalOrders = 0;
    let creditGranted = 0;

    const dailyBreakdown: WeeklyReportData['metrics']['dailyBreakdown'] = [];
    const productSalesMap = new Map<string, { name: string; quantity: number; revenue: number }>();

    let bestDay = {
      date: startDate,
      dayNameFr: weekDays[0].dayNameFr,
      dayNameAr: weekDays[0].dayNameAr,
      revenue: 0
    };

    for (const day of weekDays) {
      const salesOnDay = allSales.filter(s => s.created_at && s.created_at.startsWith(day.date));
      const activeSalesOnDay = salesOnDay.filter(s => s.status !== 'REFUNDED');
      const saleIds = new Set(activeSalesOnDay.map(s => s.id));

      const dayRefunds = allRefunds.filter(r => r.created_at && r.created_at.startsWith(day.date));
      const dayRefundIds = new Set(dayRefunds.map(r => r.id));
      const refundedQtyBySaleItem = new Map<string, number>();
      const refundedRevBySaleItem = new Map<string, number>();
      for (const ri of allRefundItems) {
        if (dayRefundIds.has(ri.refund_id)) {
          refundedQtyBySaleItem.set(ri.sale_item_id, (refundedQtyBySaleItem.get(ri.sale_item_id) || 0) + (ri.quantity || 0));
          refundedRevBySaleItem.set(ri.sale_item_id, CurrencyUtil.add(refundedRevBySaleItem.get(ri.sale_item_id) || 0, ri.refund_amount || 0));
        }
      }
      let dayRefundAmount = 0;
      for (const ref of dayRefunds) {
        dayRefundAmount = CurrencyUtil.add(dayRefundAmount, ref.refund_amount || 0);
      }
      for (const refSale of salesOnDay.filter(s => s.status === 'REFUNDED')) {
        if (!dayRefunds.some(r => r.original_sale_id === refSale.id || r.receipt_number === refSale.receipt_number)) {
          dayRefundAmount = CurrencyUtil.add(dayRefundAmount, refSale.total_ttc || 0);
        }
      }

      let dayGross = 0;
      for (const s of salesOnDay) {
        dayGross = CurrencyUtil.add(dayGross, s.total_ttc || s.total_amount || 0);
        if (s.status === 'COMPLETED' && s.receipt_number?.includes('CREDIT')) {
          creditGranted = CurrencyUtil.add(creditGranted, s.total_ttc || 0);
        }
      }
      const dayRev = Math.max(0, CurrencyUtil.subtract(dayGross, dayRefundAmount));

      let dayExp = 0;
      let dayOperatingExp = 0;
      const expensesOnDay = allExpenses.filter(e => 
        e.date === day.date || (e.created_at && e.created_at.startsWith(day.date))
      );
      for (const exp of expensesOnDay) {
        dayExp = CurrencyUtil.add(dayExp, exp.amount);
        if (exp.category !== 'INGREDIENTS_PURCHASE' && exp.category !== 'SUPPLEMENTS_PURCHASE') {
          dayOperatingExp = CurrencyUtil.add(dayOperatingExp, exp.amount);
        }
      }

      let dayCogs = 0;
      for (const item of allSaleItems) {
        if (saleIds.has(item.sale_id)) {
          const netQty = Math.max(0, item.quantity - (refundedQtyBySaleItem.get(item.id) || 0));
          const netItemRev = Math.max(0, CurrencyUtil.subtract(item.total_ttc || 0, refundedRevBySaleItem.get(item.id) || 0));
          const cost = CurrencyUtil.multiply(item.unit_purchase_cost_snapshot || 0, netQty);
          dayCogs = CurrencyUtil.add(dayCogs, cost);

          if (netQty > 0) {
            const existing = productSalesMap.get(item.product_id) || {
              name: item.product_name || 'Produit',
              quantity: 0,
              revenue: 0
            };
            existing.quantity += netQty;
            existing.revenue = CurrencyUtil.add(existing.revenue, netItemRev);
            productSalesMap.set(item.product_id, existing);
          }
        }
      }

      const dayNet = CurrencyUtil.subtract(CurrencyUtil.subtract(dayRev, dayCogs), dayOperatingExp);

      dailyBreakdown.push({
        date: day.date,
        dayNameFr: day.dayNameFr,
        dayNameAr: day.dayNameAr,
        revenue: dayRev,
        orders: activeSalesOnDay.length,
        expenses: dayExp,
        net: dayNet
      });

      totalRevenue = CurrencyUtil.add(totalRevenue, dayRev);
      totalCogs = CurrencyUtil.add(totalCogs, dayCogs);
      totalExpenses = CurrencyUtil.add(totalExpenses, dayOperatingExp);
      totalOrders += activeSalesOnDay.length;

      if (dayRev > bestDay.revenue) {
        bestDay = {
          date: day.date,
          dayNameFr: day.dayNameFr,
          dayNameAr: day.dayNameAr,
          revenue: dayRev
        };
      }
    }

    const grossMargin = CurrencyUtil.subtract(totalRevenue, totalCogs);
    const marginPercent = totalRevenue > 0 ? Math.round((grossMargin / totalRevenue) * 1000) / 10 : 0;
    const netProfit = CurrencyUtil.subtract(grossMargin, totalExpenses);
    const averageBasket = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

    const topProducts = Array.from(productSalesMap.values())
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10);

    // Achats fournisseurs de la semaine (comparaison sur préfixe YYYY-MM-DD pour inclure toute la journée de fin)
    const weekPurchases = allPurchases.filter(p => {
      const d = p.ordered_at ? p.ordered_at.slice(0, 10) : '';
      return d >= startDate && d <= endDate;
    });
    const totalPurchasesCost = weekPurchases.reduce((sum, p) => sum + (p.total_cost || 0), 0);

    const totalCustomerDebt = customers.reduce((sum, c) => sum + (c.current_debt || 0), 0);

    // Calcul numéro de semaine
    const oneJan = new Date(refDate.getFullYear(), 0, 1);
    const numberOfDays = Math.floor((refDate.getTime() - oneJan.getTime()) / (24 * 60 * 60 * 1000));
    const weekNumber = Math.ceil((refDate.getDay() + 1 + numberOfDays) / 7);

    return {
      startDate,
      endDate,
      weekNumber,
      metrics: {
        totalRevenue,
        totalCogs,
        grossMargin,
        marginPercent,
        totalExpenses,
        netProfit,
        orderCount: totalOrders,
        averageBasket,
        bestDay,
        dailyBreakdown,
        topProducts,
        supplierPurchases: {
          totalCost: totalPurchasesCost,
          count: weekPurchases.length
        },
        customerCredits: {
          granted: creditGranted,
          totalOutstanding: totalCustomerDebt
        }
      }
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 3. RAPPORT MENSUEL (Bilan d'activité du mois)
  // ──────────────────────────────────────────────────────────────────────────
  public async getMonthlyReport(yearMonthStr?: string): Promise<MonthlyReportData> {
    const currentYearMonth = new Date().toISOString().slice(0, 7);
    const yearMonth = yearMonthStr || currentYearMonth;
    const [yearPart, monthPart] = yearMonth.split('-');
    const year = parseInt(yearPart, 10);
    const monthNum = parseInt(monthPart, 10);

    const MONTH_NAMES: { fr: string; ar: string }[] = [
      { fr: 'Janvier', ar: 'جانفي' },
      { fr: 'Février', ar: 'فيفري' },
      { fr: 'Mars', ar: 'مارس' },
      { fr: 'Avril', ar: 'أفريل' },
      { fr: 'Mai', ar: 'ماي' },
      { fr: 'Juin', ar: 'جوان' },
      { fr: 'Juillet', ar: 'جويلية' },
      { fr: 'Août', ar: 'أوت' },
      { fr: 'Septembre', ar: 'سبتمبر' },
      { fr: 'Octobre', ar: 'أكتوبر' },
      { fr: 'Novembre', ar: 'نوفمبر' },
      { fr: 'Décembre', ar: 'ديسمبر' }
    ];
    const monthNameFr = MONTH_NAMES[monthNum - 1]?.fr || monthPart;
    const monthNameAr = MONTH_NAMES[monthNum - 1]?.ar || monthPart;

    const allSales = await db.select<Sale>("SELECT * FROM sales WHERE status != 'CANCELLED'");
    const monthSales = allSales.filter(s => s.created_at && s.created_at.startsWith(yearMonth));
    const activeMonthSales = monthSales.filter(s => s.status !== 'REFUNDED');
    const saleIds = new Set(activeMonthSales.map(s => s.id));

    const allSaleItems = await db.select<SaleItem>('SELECT * FROM sale_items');
    const allExpenses = await db.select<Expense>('SELECT * FROM expenses');
    const allRefunds = await db.select<{ id: string; original_sale_id?: string; receipt_number?: string; refund_amount: number; created_at: string }>('SELECT * FROM refunds');
    const allRefundItems = await db.select<{ refund_id: string; sale_item_id: string; quantity: number; refund_amount: number }>('SELECT * FROM refund_items');
    const monthRefunds = allRefunds.filter(r => r.created_at && r.created_at.startsWith(yearMonth));
    const monthRefundIds = new Set(monthRefunds.map(r => r.id));
    const refundedQtyBySaleItem = new Map<string, number>();
    const refundedRevBySaleItem = new Map<string, number>();
    for (const ri of allRefundItems) {
      if (monthRefundIds.has(ri.refund_id)) {
        refundedQtyBySaleItem.set(ri.sale_item_id, (refundedQtyBySaleItem.get(ri.sale_item_id) || 0) + (ri.quantity || 0));
        refundedRevBySaleItem.set(ri.sale_item_id, CurrencyUtil.add(refundedRevBySaleItem.get(ri.sale_item_id) || 0, ri.refund_amount || 0));
      }
    }
    let monthRefundAmount = 0;
    for (const ref of monthRefunds) {
      monthRefundAmount = CurrencyUtil.add(monthRefundAmount, ref.refund_amount || 0);
    }
    for (const refSale of monthSales.filter(s => s.status === 'REFUNDED')) {
      if (!monthRefunds.some(r => r.original_sale_id === refSale.id || r.receipt_number === refSale.receipt_number)) {
        monthRefundAmount = CurrencyUtil.add(monthRefundAmount, refSale.total_ttc || 0);
      }
    }

    const monthExpenses = allExpenses.filter(e => 
      (e.date && e.date.startsWith(yearMonth)) || (e.created_at && e.created_at.startsWith(yearMonth))
    );

    let grossRevenue = 0;
    for (const s of monthSales) {
      grossRevenue = CurrencyUtil.add(grossRevenue, s.total_ttc || s.total_amount || 0);
    }
    const totalRevenue = Math.max(0, CurrencyUtil.subtract(grossRevenue, monthRefundAmount));

    let totalCogs = 0;
    const productSalesMap = new Map<string, { name: string; quantity: number; revenue: number }>();

    for (const item of allSaleItems) {
      if (saleIds.has(item.sale_id)) {
        const netQty = Math.max(0, item.quantity - (refundedQtyBySaleItem.get(item.id) || 0));
        const netItemRev = Math.max(0, CurrencyUtil.subtract(item.total_ttc || 0, refundedRevBySaleItem.get(item.id) || 0));
        const cost = CurrencyUtil.multiply(item.unit_purchase_cost_snapshot || 0, netQty);
        totalCogs = CurrencyUtil.add(totalCogs, cost);

        if (netQty > 0) {
          const existing = productSalesMap.get(item.product_id) || {
            name: item.product_name || 'Produit',
            quantity: 0,
            revenue: 0
          };
          existing.quantity += netQty;
          existing.revenue = CurrencyUtil.add(existing.revenue, netItemRev);
          productSalesMap.set(item.product_id, existing);
        }
      }
    }

    let totalExpenses = 0;
    let operatingExpenses = 0;
    const expensesByCategory: Record<string, number> = {};
    for (const exp of monthExpenses) {
      totalExpenses = CurrencyUtil.add(totalExpenses, exp.amount);
      const cat = exp.category || 'OTHER';
      expensesByCategory[cat] = CurrencyUtil.add(expensesByCategory[cat] || 0, exp.amount);
      if (cat !== 'INGREDIENTS_PURCHASE' && cat !== 'SUPPLEMENTS_PURCHASE') {
        operatingExpenses = CurrencyUtil.add(operatingExpenses, exp.amount);
      }
    }

    const grossMargin = CurrencyUtil.subtract(totalRevenue, totalCogs);
    const marginPercent = totalRevenue > 0 ? Math.round((grossMargin / totalRevenue) * 1000) / 10 : 0;
    const netProfit = CurrencyUtil.subtract(grossMargin, operatingExpenses);
    const orderCount = activeMonthSales.length;
    const averageBasket = orderCount > 0 ? Math.round(totalRevenue / orderCount) : 0;

    // Découpage en 4 semaines du mois
    // Semaine 1 : 01 au 07
    // Semaine 2 : 08 au 14
    // Semaine 3 : 15 au 21
    // Semaine 4 : 22 à fin de mois
    const daysInMonth = new Date(year, monthNum, 0).getDate();
    const weeksRanges = [
      { fr: 'Semaine 1 (01 - 07)', ar: 'الأسبوع الأول (01 - 07)', start: '01', end: '07' },
      { fr: 'Semaine 2 (08 - 14)', ar: 'الأسبوع الثاني (08 - 14)', start: '08', end: '14' },
      { fr: 'Semaine 3 (15 - 21)', ar: 'الأسبوع الثالث (15 - 21)', start: '15', end: '21' },
      { fr: `Semaine 4 (22 - ${daysInMonth})`, ar: `الأسبوع الرابع (22 - ${daysInMonth})`, start: '22', end: String(daysInMonth).padStart(2, '0') }
    ];

    const weeklyBreakdown = weeksRanges.map(w => {
      const startFull = `${yearMonth}-${w.start}`;
      const endFull = `${yearMonth}-${w.end}`;

      const wSales = monthSales.filter(s => {
        const d = s.created_at ? s.created_at.slice(0, 10) : '';
        return d >= startFull && d <= endFull;
      });

      const wExp = monthExpenses.filter(e => {
        const d = e.date || (e.created_at ? e.created_at.slice(0, 10) : '');
        return d >= startFull && d <= endFull;
      });

      const rev = wSales.reduce((sum, s) => sum + (s.total_ttc || s.total_amount || 0), 0);
      const exp = wExp.reduce((sum, e) => sum + e.amount, 0);

      return {
        weekLabelFr: w.fr,
        weekLabelAr: w.ar,
        startDate: startFull,
        endDate: endFull,
        revenue: rev,
        expenses: exp,
        net: rev - exp
      };
    });

    const topProducts = Array.from(productSalesMap.values())
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 15);

    // Valorisation du stock fin de mois
    const ingredients = await db.select<{ current_stock: number; cost_per_unit: number }>(
      'SELECT current_stock, cost_per_unit FROM ingredients WHERE is_active = 1'
    );
    const ingredientsValue = ingredients.reduce((sum, i) => sum + (i.current_stock || 0) * (i.cost_per_unit || 0), 0);

    const supplements = await db.select<{ current_stock: number; purchase_cost: number }>(
      'SELECT current_stock, purchase_cost FROM pizza_supplements WHERE is_active = 1'
    );
    const supplementsValue = supplements.reduce((sum, s) => sum + (s.current_stock || 0) * (s.purchase_cost || 0), 0);

    // Dettes clients et fournisseurs
    const customers = await db.select<{ current_debt: number }>('SELECT current_debt FROM customers');
    const customerTotalDebt = customers.reduce((sum, c) => sum + (c.current_debt || 0), 0);

    const suppliers = await db.select<{ current_balance: number }>('SELECT current_balance FROM suppliers');
    const supplierTotalDebt = suppliers.reduce((sum, s) => sum + (s.current_balance || 0), 0);

    return {
      yearMonth,
      monthNameFr,
      monthNameAr,
      year,
      metrics: {
        totalRevenue,
        totalCogs,
        grossMargin,
        marginPercent,
        totalExpenses,
        netProfit,
        orderCount,
        averageBasket,
        weeklyBreakdown,
        expensesByCategory,
        topProducts,
        inventoryValuation: {
          ingredientsValue: Math.round(ingredientsValue),
          supplementsValue: Math.round(supplementsValue),
          totalValue: Math.round(ingredientsValue + supplementsValue)
        },
        debtStatus: {
          customerTotalDebt,
          supplierTotalDebt
        }
      }
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 4. GÉNÉRATION HTML DU DOCUMENT OFFICIEL A4 (Prêt pour Impression / PDF)
  // ──────────────────────────────────────────────────────────────────────────
  public generateReportHtml(
    type: 'daily' | 'weekly' | 'monthly',
    data: any,
    store: Partial<Store>,
    storeLogo: string | null = null
  ): string {
    const storeNameFr = store?.name_fr || store?.name || 'AQUADRO PIZZERIA GOURMET';
    const storeNameAr = store?.name_ar || 'أكوادرو بيتزيريا غورمي';
    const address = store?.address || 'Algérie';
    const phone = store?.phone || '';
    const nif = store?.nif_number || '';
    const rc = store?.rc_number || '';
    const nis = store?.nis_number || '';
    const generatedAt = new Date().toLocaleString('fr-FR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });

    let titleFr = '';
    let titleAr = '';
    let periodLabel = '';
    let statusBadge = '';

    if (type === 'daily') {
      const dData = data as DailyReportData;
      titleFr = "RAPPORT D'ACTIVITÉ JOURNALIER (CLÔTURE 22:00)";
      titleAr = 'التقرير المالي اليومي الشامل (إغلاق الساعة 22:00)';
      periodLabel = `Date d'activité : <strong>${dData.date}</strong>`;
      if (dData.isReady) {
        statusBadge = `
          <div style="background: #e6f4ea; color: #137333; border: 1px solid #ceead6; padding: 6px 12px; border-radius: 6px; font-weight: bold; font-size: 11px; display: inline-block;">
            ✓ CLÔTURÉ & CONFORME (22:00) — جاهز ومقفل
          </div>
        `;
      } else {
        statusBadge = `
          <div style="background: #fef7e0; color: #b06000; border: 1px solid #feefc3; padding: 6px 12px; border-radius: 6px; font-weight: bold; font-size: 11px; display: inline-block;">
            ⏳ EN COURS DE SAISIE — Clôture officielle à 22:00 (${dData.timeRemainingFormatted} restantes)
          </div>
        `;
      }
    } else if (type === 'weekly') {
      const wData = data as WeeklyReportData;
      titleFr = `RAPPORT HEBDOMADAIRE — SEMAINE N°${wData.weekNumber}`;
      titleAr = `التقرير المالي الأسبوعي — الأسبوع رقم ${wData.weekNumber}`;
      periodLabel = `Période : Du <strong>${wData.startDate}</strong> au <strong>${wData.endDate}</strong>`;
      statusBadge = `
        <div style="background: #e8f0fe; color: #1a73e8; border: 1px solid #d2e3fc; padding: 6px 12px; border-radius: 6px; font-weight: bold; font-size: 11px; display: inline-block;">
          BILAN HEBDOMADAIRE CONSOLIDÉ (7 JOURS)
        </div>
      `;
    } else {
      const mData = data as MonthlyReportData;
      titleFr = `RAPPORT MENSUEL D'ACTIVITÉ — ${mData.monthNameFr.toUpperCase()} ${mData.year}`;
      titleAr = `التقرير المالي الشهري — ${mData.monthNameAr} ${mData.year}`;
      periodLabel = `Mois d'exercice : <strong>${mData.monthNameFr} ${mData.year}</strong> (${mData.yearMonth})`;
      statusBadge = `
        <div style="background: #f3e8fd; color: #8430ce; border: 1px solid #e9d2fd; padding: 6px 12px; border-radius: 6px; font-weight: bold; font-size: 11px; display: inline-block;">
          BILAN FINANCIER & COMMERCIAL MENSUEL
        </div>
      `;
    }

    const metrics = data.metrics;

    // Tableaux spécifiques selon le type
    let specificContent = '';

    if (type === 'daily') {
      const dData = data as DailyReportData;
      specificContent = `
        <!-- DÉTAIL DES RÈGLEMENTS & CAISSE -->
        <div style="display: flex; gap: 15px; margin-bottom: 20px;">
          <div style="flex: 1; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; background: #fafafa;">
            <div style="font-weight: bold; color: #111827; margin-bottom: 8px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; font-size: 12px;">
              💳 Répartition des Règlements (طرق الدفع)
            </div>
            <table style="width: 100%; font-size: 11px;">
              <tr>
                <td style="padding: 4px 0;">Espèces (نقداً) :</td>
                <td style="text-align: right; font-weight: bold; font-family: monospace;">${CurrencyUtil.formatDZD(metrics.paymentBreakdown.cash)}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0;">Carte CIB / Edahabia :</td>
                <td style="text-align: right; font-weight: bold; font-family: monospace;">${CurrencyUtil.formatDZD(metrics.paymentBreakdown.cib_edahabia)}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0;">BaridiMob QR :</td>
                <td style="text-align: right; font-weight: bold; font-family: monospace;">${CurrencyUtil.formatDZD(metrics.paymentBreakdown.baridimob)}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0;">Ventes à Crédit (دين الزبائن) :</td>
                <td style="text-align: right; font-weight: bold; font-family: monospace; color: #d97706;">${CurrencyUtil.formatDZD(metrics.paymentBreakdown.credit)}</td>
              </tr>
            </table>
          </div>

          <div style="flex: 1; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; background: #fafafa;">
            <div style="font-weight: bold; color: #111827; margin-bottom: 8px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; font-size: 12px;">
              🪙 Contrôle Tiroir-Caisse (حركة الصندوق)
            </div>
            <table style="width: 100%; font-size: 11px;">
              <tr>
                <td style="padding: 4px 0;">Fond de caisse initial :</td>
                <td style="text-align: right; font-weight: bold; font-family: monospace;">${CurrencyUtil.formatDZD(metrics.cashSummary.openingFloat)}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0;">(+) Entrées Espèces :</td>
                <td style="text-align: right; font-weight: bold; font-family: monospace; color: #15803d;">+${CurrencyUtil.formatDZD(metrics.cashSummary.cashSales)}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0;">(-) Sorties / Dépenses Espèces :</td>
                <td style="text-align: right; font-weight: bold; font-family: monospace; color: #b91c1c;">-${CurrencyUtil.formatDZD(metrics.cashSummary.cashExpenses)}</td>
              </tr>
              <tr style="border-top: 1px dashed #d1d5db;">
                <td style="padding: 6px 0; font-weight: bold;">Solde Attendu en Caisse :</td>
                <td style="text-align: right; font-weight: bold; font-size: 12px; color: #1d4ed8; font-family: monospace;">${CurrencyUtil.formatDZD(metrics.cashSummary.expectedCash)}</td>
              </tr>
            </table>
          </div>
        </div>

        <!-- TOP VENTES PIZZAS & DÉPENSES DU JOUR -->
        <div style="display: flex; gap: 15px; margin-bottom: 20px;">
          <!-- Top Pizzas -->
          <div style="flex: 1.2; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px;">
            <div style="font-weight: bold; color: #111827; margin-bottom: 8px; font-size: 12px;">
              🍕 Top Pizzas & Plats Vendus Aujourd'hui (أفضل المبيعات)
            </div>
            <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
              <thead>
                <tr style="background: #f3f4f6; text-align: left; border-bottom: 1px solid #e5e7eb;">
                  <th style="padding: 5px;">Produit / Pizza</th>
                  <th style="padding: 5px; text-align: center;">Qté</th>
                  <th style="padding: 5px; text-align: right;">Total DZD</th>
                </tr>
              </thead>
              <tbody>
                ${
                  metrics.topProducts.length === 0
                    ? '<tr><td colspan="3" style="text-align: center; padding: 10px; color: #6b7280;">Aucune vente enregistrée aujourd\'hui</td></tr>'
                    : metrics.topProducts.slice(0, 8).map((p: any, idx: number) => `
                        <tr style="border-bottom: 1px solid #f3f4f6;">
                          <td style="padding: 4px 5px;"><strong>${idx + 1}.</strong> ${p.name}</td>
                          <td style="padding: 4px 5px; text-align: center; font-weight: bold;">${p.quantity}</td>
                          <td style="padding: 4px 5px; text-align: right; font-family: monospace;">${CurrencyUtil.formatDZD(p.revenue)}</td>
                        </tr>
                      `).join('')
                }
              </tbody>
            </table>
          </div>

          <!-- Dépenses -->
          <div style="flex: 0.8; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px;">
            <div style="font-weight: bold; color: #111827; margin-bottom: 8px; font-size: 12px;">
              🧾 Dépenses du Jour (المصاريف المسجلة)
            </div>
            <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
              <thead>
                <tr style="background: #f3f4f6; text-align: left; border-bottom: 1px solid #e5e7eb;">
                  <th style="padding: 5px;">Poste de Dépense</th>
                  <th style="padding: 5px; text-align: right;">Montant</th>
                </tr>
              </thead>
              <tbody>
                ${
                  metrics.expensesList.length === 0
                    ? '<tr><td colspan="2" style="text-align: center; padding: 10px; color: #6b7280;">Aucune dépense enregistrée</td></tr>'
                    : metrics.expensesList.slice(0, 6).map((e: any) => `
                        <tr style="border-bottom: 1px solid #f3f4f6;">
                          <td style="padding: 4px 5px;">${e.description || e.category}</td>
                          <td style="padding: 4px 5px; text-align: right; font-weight: bold; color: #b91c1c; font-family: monospace;">${CurrencyUtil.formatDZD(e.amount)}</td>
                        </tr>
                      `).join('')
                }
              </tbody>
            </table>
          </div>
        </div>
      `;
    } else if (type === 'weekly') {
      const wData = data as WeeklyReportData;
      specificContent = `
        <!-- TABLEAU DES 7 JOURS DE LA SEMAINE -->
        <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; margin-bottom: 20px;">
          <div style="font-weight: bold; color: #111827; margin-bottom: 8px; font-size: 12px;">
            📅 Répartition Quotidienne de la Semaine (جدول أيام الأسبوع)
          </div>
          <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
            <thead>
              <tr style="background: #f3f4f6; text-align: left; border-bottom: 2px solid #d1d5db;">
                <th style="padding: 6px;">Jour / Date</th>
                <th style="padding: 6px; text-align: center;">Commandes</th>
                <th style="padding: 6px; text-align: right;">Chiffre d'Affaires</th>
                <th style="padding: 6px; text-align: right;">Charges</th>
                <th style="padding: 6px; text-align: right;">Résultat Net</th>
              </tr>
            </thead>
            <tbody>
              ${
                wData.metrics.dailyBreakdown.map((d: any) => `
                  <tr style="border-bottom: 1px solid #e5e7eb; ${d.date === wData.metrics.bestDay.date ? 'background: #fffbeb; font-weight: bold;' : ''}">
                    <td style="padding: 6px;">
                      <strong>${d.dayNameFr}</strong> (${d.dayNameAr}) — <span style="color: #6b7280;">${d.date}</span>
                      ${d.date === wData.metrics.bestDay.date ? ' <span style="color: #d97706; font-size: 10px;">★ Meilleur Jour</span>' : ''}
                    </td>
                    <td style="padding: 6px; text-align: center;">${d.orders}</td>
                    <td style="padding: 6px; text-align: right; font-family: monospace;">${CurrencyUtil.formatDZD(d.revenue)}</td>
                    <td style="padding: 6px; text-align: right; color: #b91c1c; font-family: monospace;">${CurrencyUtil.formatDZD(d.expenses)}</td>
                    <td style="padding: 6px; text-align: right; font-weight: bold; color: ${d.net >= 0 ? '#15803d' : '#b91c1c'}; font-family: monospace;">${CurrencyUtil.formatDZD(d.net)}</td>
                  </tr>
                `).join('')
              }
            </tbody>
            <tfoot>
              <tr style="background: #f9fafb; font-weight: bold; border-top: 2px solid #111827;">
                <td style="padding: 8px;">TOTAL HEBDOMADAIRE</td>
                <td style="padding: 8px; text-align: center;">${wData.metrics.orderCount}</td>
                <td style="padding: 8px; text-align: right; font-family: monospace;">${CurrencyUtil.formatDZD(wData.metrics.totalRevenue)}</td>
                <td style="padding: 8px; text-align: right; color: #b91c1c; font-family: monospace;">${CurrencyUtil.formatDZD(wData.metrics.totalExpenses)}</td>
                <td style="padding: 8px; text-align: right; color: #15803d; font-family: monospace;">${CurrencyUtil.formatDZD(wData.metrics.netProfit)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <!-- TOP PIZZAS SEMAINE & ACHATS FOURNISSEURS -->
        <div style="display: flex; gap: 15px; margin-bottom: 20px;">
          <div style="flex: 1.2; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px;">
            <div style="font-weight: bold; color: #111827; margin-bottom: 8px; font-size: 12px;">
              🍕 Top 10 des Pizzas les Plus Vendues de la Semaine
            </div>
            <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
              <thead>
                <tr style="background: #f3f4f6; text-align: left; border-bottom: 1px solid #e5e7eb;">
                  <th style="padding: 5px;">Produit / Pizza</th>
                  <th style="padding: 5px; text-align: center;">Quantité</th>
                  <th style="padding: 5px; text-align: right;">Total Généré</th>
                </tr>
              </thead>
              <tbody>
                ${
                  wData.metrics.topProducts.map((p: any, idx: number) => `
                    <tr style="border-bottom: 1px solid #f3f4f6;">
                      <td style="padding: 4px 5px;"><strong>${idx + 1}.</strong> ${p.name}</td>
                      <td style="padding: 4px 5px; text-align: center; font-weight: bold;">${p.quantity}</td>
                      <td style="padding: 4px 5px; text-align: right; font-family: monospace;">${CurrencyUtil.formatDZD(p.revenue)}</td>
                    </tr>
                  `).join('')
                }
              </tbody>
            </table>
          </div>

          <div style="flex: 0.8; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px;">
            <div style="font-weight: bold; color: #111827; margin-bottom: 8px; font-size: 12px;">
              📦 Approvisionnements & Dettes
            </div>
            <div style="margin-bottom: 12px; background: #fafafa; padding: 8px; border-radius: 6px;">
              <span style="color: #4b5563; font-size: 11px;">Achats Fournisseurs Réceptionnés :</span>
              <p style="font-size: 15px; font-weight: bold; font-family: monospace; color: #111827; margin: 3px 0 0 0;">
                ${CurrencyUtil.formatDZD(wData.metrics.supplierPurchases.totalCost)}
              </p>
              <span style="font-size: 10px; color: #6b7280;">${wData.metrics.supplierPurchases.count} facture(s) d'achat enregistrée(s)</span>
            </div>
            <div style="background: #fafafa; padding: 8px; border-radius: 6px;">
              <span style="color: #4b5563; font-size: 11px;">Créances Clients en Cours (Dettes) :</span>
              <p style="font-size: 15px; font-weight: bold; font-family: monospace; color: #d97706; margin: 3px 0 0 0;">
                ${CurrencyUtil.formatDZD(wData.metrics.customerCredits.totalOutstanding)}
              </p>
              <span style="font-size: 10px; color: #6b7280;">Total des crédits non encore soldés</span>
            </div>
          </div>
        </div>
      `;
    } else {
      const mData = data as MonthlyReportData;
      specificContent = `
        <!-- DÉCOUPAGE PAR SEMAINE DU MOIS -->
        <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; margin-bottom: 20px;">
          <div style="font-weight: bold; color: #111827; margin-bottom: 8px; font-size: 12px;">
            📊 Évolution Hebdomadaire du Mois (تقسيم الشهر حسب الأسابيع)
          </div>
          <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
            <thead>
              <tr style="background: #f3f4f6; text-align: left; border-bottom: 2px solid #d1d5db;">
                <th style="padding: 6px;">Période</th>
                <th style="padding: 6px; text-align: right;">Chiffre d'Affaires</th>
                <th style="padding: 6px; text-align: right;">Charges du Mois</th>
                <th style="padding: 6px; text-align: right;">Marge Opérationnelle</th>
              </tr>
            </thead>
            <tbody>
              ${
                mData.metrics.weeklyBreakdown.map((w: any) => `
                  <tr style="border-bottom: 1px solid #e5e7eb;">
                    <td style="padding: 6px;"><strong>${w.weekLabelFr}</strong> (${w.weekLabelAr})</td>
                    <td style="padding: 6px; text-align: right; font-family: monospace; font-weight: bold;">${CurrencyUtil.formatDZD(w.revenue)}</td>
                    <td style="padding: 6px; text-align: right; color: #b91c1c; font-family: monospace;">${CurrencyUtil.formatDZD(w.expenses)}</td>
                    <td style="padding: 6px; text-align: right; font-weight: bold; color: ${w.net >= 0 ? '#15803d' : '#b91c1c'}; font-family: monospace;">${CurrencyUtil.formatDZD(w.net)}</td>
                  </tr>
                `).join('')
              }
            </tbody>
            <tfoot>
              <tr style="background: #f9fafb; font-weight: bold; border-top: 2px solid #111827;">
                <td style="padding: 8px;">TOTAL MENSUEL</td>
                <td style="padding: 8px; text-align: right; font-family: monospace;">${CurrencyUtil.formatDZD(mData.metrics.totalRevenue)}</td>
                <td style="padding: 8px; text-align: right; color: #b91c1c; font-family: monospace;">${CurrencyUtil.formatDZD(mData.metrics.totalExpenses)}</td>
                <td style="padding: 8px; text-align: right; color: #15803d; font-family: monospace;">${CurrencyUtil.formatDZD(mData.metrics.netProfit)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <!-- BILAN DU STOCK & RÉPARTITION DES CHARGES -->
        <div style="display: flex; gap: 15px; margin-bottom: 20px;">
          <!-- Charges par catégorie -->
          <div style="flex: 1; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px;">
            <div style="font-weight: bold; color: #111827; margin-bottom: 8px; font-size: 12px;">
              📋 Répartition des Charges Mensuelles (تفصيل مصاريف الشهر)
            </div>
            <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
              <tbody>
                ${
                  Object.entries(mData.metrics.expensesByCategory).length === 0
                    ? '<tr><td style="text-align: center; color: #6b7280; padding: 10px;">Aucune charge enregistrée ce mois</td></tr>'
                    : Object.entries(mData.metrics.expensesByCategory).map(([cat, amount]) => {
                        const tr = EXPENSE_CATEGORIES_TRANSLATION[cat] || { fr: cat, ar: cat };
                        return `
                          <tr style="border-bottom: 1px solid #f3f4f6;">
                            <td style="padding: 4px 0;">${tr.fr} <span style="color: #6b7280; font-size: 10px;">(${tr.ar})</span></td>
                            <td style="padding: 4px 0; text-align: right; font-weight: bold; font-family: monospace; color: #b91c1c;">${CurrencyUtil.formatDZD(amount)}</td>
                          </tr>
                        `;
                      }).join('')
                }
              </tbody>
            </table>
          </div>

          <!-- Actif Stock & Dettes -->
          <div style="flex: 1; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; background: #fafafa;">
            <div style="font-weight: bold; color: #111827; margin-bottom: 8px; font-size: 12px;">
              🏛️ Situation Patrimoniale Fin de Mois (المخزون والالتزامات)
            </div>
            <table style="width: 100%; font-size: 11px;">
              <tr>
                <td style="padding: 4px 0;">Valeur Stock Ingrédients :</td>
                <td style="text-align: right; font-weight: bold; font-family: monospace;">${CurrencyUtil.formatDZD(mData.metrics.inventoryValuation.ingredientsValue)}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0;">Valeur Stock Suppléments :</td>
                <td style="text-align: right; font-weight: bold; font-family: monospace;">${CurrencyUtil.formatDZD(mData.metrics.inventoryValuation.supplementsValue)}</td>
              </tr>
              <tr style="border-top: 1px solid #e5e7eb;">
                <td style="padding: 4px 0; font-weight: bold;">Valeur Totale du Stock :</td>
                <td style="text-align: right; font-weight: bold; color: #15803d; font-family: monospace;">${CurrencyUtil.formatDZD(mData.metrics.inventoryValuation.totalValue)}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; color: #d97706;">Créances Clients (Dettes clients) :</td>
                <td style="text-align: right; font-weight: bold; color: #d97706; font-family: monospace;">${CurrencyUtil.formatDZD(mData.metrics.debtStatus.customerTotalDebt)}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; color: #b91c1c;">Dettes Fournisseurs à payer :</td>
                <td style="text-align: right; font-weight: bold; color: #b91c1c; font-family: monospace;">${CurrencyUtil.formatDZD(mData.metrics.debtStatus.supplierTotalDebt)}</td>
              </tr>
            </table>
          </div>
        </div>
      `;
    }

    return `
      <!DOCTYPE html>
      <html lang="fr" dir="ltr">
        <head>
          <meta charset="utf-8" />
          <title>${titleFr} - ${storeNameFr}</title>
          <style>
            @page {
              size: A4 portrait;
              margin: 12mm 15mm;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              color: #111827;
              background: #ffffff;
              margin: 0;
              padding: 0;
              font-size: 12px;
              line-height: 1.45;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .header-table {
              width: 100%;
              border-bottom: 2px solid #111827;
              padding-bottom: 12px;
              margin-bottom: 15px;
            }
            .store-logo {
              max-height: 65px;
              max-width: 120px;
              object-fit: contain;
            }
            .store-name-fr {
              font-size: 18px;
              font-weight: 900;
              color: #111827;
              margin: 0;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            .store-name-ar {
              font-size: 14px;
              font-weight: bold;
              color: #4b5563;
              margin: 2px 0 0 0;
            }
            .store-meta {
              font-size: 10.5px;
              color: #4b5563;
              margin-top: 4px;
              line-height: 1.35;
            }
            .report-title-box {
              text-align: right;
            }
            .report-main-title {
              font-size: 15px;
              font-weight: 900;
              color: #ea580c;
              margin: 0 0 4px 0;
            }
            .report-sub-title {
              font-size: 12px;
              font-weight: bold;
              color: #374151;
              margin: 0 0 6px 0;
            }
            .kpi-container {
              display: flex;
              gap: 10px;
              margin-bottom: 20px;
            }
            .kpi-card {
              flex: 1;
              border: 1px solid #e5e7eb;
              border-radius: 8px;
              padding: 10px;
              background: #f9fafb;
              box-sizing: border-box;
            }
            .kpi-label {
              font-size: 10px;
              font-weight: bold;
              text-transform: uppercase;
              color: #4b5563;
              letter-spacing: 0.3px;
              margin-bottom: 4px;
            }
            .kpi-value {
              font-size: 16px;
              font-weight: 900;
              font-family: monospace;
              color: #111827;
              margin: 0;
            }
            .kpi-sub {
              font-size: 9.5px;
              color: #6b7280;
              margin-top: 2px;
            }
            .footer-signature {
              margin-top: 30px;
              border-top: 1px dashed #d1d5db;
              padding-top: 15px;
              display: flex;
              justify-content: space-between;
              font-size: 11px;
            }
            .signature-box {
              width: 220px;
              height: 75px;
              border: 1px dashed #9ca3af;
              border-radius: 6px;
              margin-top: 6px;
              background: #fafafa;
              display: flex;
              align-items: center;
              justify-content: center;
              color: #9ca3af;
              font-size: 10px;
            }
          </style>
        </head>
        <body>
          <!-- EN-TÊTE DU DOCUMENT -->
          <table class="header-table">
            <tr>
              <td style="vertical-align: middle; width: ${storeLogo ? '130px' : '0'};">
                ${
                  storeLogo
                    ? `<img src="${storeLogo}" class="store-logo" alt="Logo" />`
                    : ''
                }
              </td>
              <td style="vertical-align: middle; padding-left: ${storeLogo ? '10px' : '0'};">
                <h1 class="store-name-fr">${storeNameFr}</h1>
                <h2 class="store-name-ar">${storeNameAr}</h2>
                <div class="store-meta">
                  ${address ? `<span>📍 ${address}</span>` : ''}
                  ${phone ? ` | <span>📞 ${phone}</span>` : ''}
                  <br />
                  ${rc ? `<span>RC : ${rc}</span> | ` : ''}
                  ${nif ? `<span>NIF : ${nif}</span> | ` : ''}
                  ${nis ? `<span>NIS : ${nis}</span>` : ''}
                </div>
              </td>
              <td class="report-title-box" style="vertical-align: middle;">
                <h2 class="report-main-title">${titleFr}</h2>
                <h3 class="report-sub-title">${titleAr}</h3>
                <div style="font-size: 11px; color: #4b5563; margin-bottom: 6px;">
                  ${periodLabel}
                </div>
                ${statusBadge}
              </td>
            </tr>
          </table>

          <!-- BLOCS KPI SYNTHÈSE FINANCIÈRE -->
          <div class="kpi-container">
            <div class="kpi-card" style="border-top: 3px solid #ea580c;">
              <div class="kpi-label">Chiffre d'Affaires</div>
              <div class="kpi-value">${CurrencyUtil.formatDZD(metrics.totalRevenue)}</div>
              <div class="kpi-sub">${metrics.orderCount} tickets / commandes</div>
            </div>

            <div class="kpi-card" style="border-top: 3px solid #0284c7;">
              <div class="kpi-label">Coût Ingrédients (COGS)</div>
              <div class="kpi-value">${CurrencyUtil.formatDZD(metrics.cogs || metrics.totalCogs || 0)}</div>
              <div class="kpi-sub">Coût matière première consommée</div>
            </div>

            <div class="kpi-card" style="border-top: 3px solid #16a34a;">
              <div class="kpi-label">Marge Brute</div>
              <div class="kpi-value" style="color: #15803d;">${CurrencyUtil.formatDZD(metrics.grossMargin)}</div>
              <div class="kpi-sub">${metrics.marginPercent}% taux de marge</div>
            </div>

            <div class="kpi-card" style="border-top: 3px solid #dc2626;">
              <div class="kpi-label">Total Charges / Dépenses</div>
              <div class="kpi-value" style="color: #b91c1c;">${CurrencyUtil.formatDZD(metrics.totalExpenses)}</div>
              <div class="kpi-sub">Frais d'exploitation enregistrés</div>
            </div>

            <div class="kpi-card" style="border-top: 3px solid #7c3aed; background: #faf5ff;">
              <div class="kpi-label" style="color: #6b21a8;">Résultat Net (Bénéfice)</div>
              <div class="kpi-value" style="color: #6b21a8;">${CurrencyUtil.formatDZD(metrics.netProfit)}</div>
              <div class="kpi-sub">Bénéfice net d'exploitation</div>
            </div>
          </div>

          <!-- CONTENU SPÉCIFIQUE (JOURNALIER / HEBDO / MENSUEL) -->
          ${specificContent}

          <!-- BAS DE PAGE / SIGNATURES ET CERTIFICATION -->
          <div class="footer-signature">
            <div>
              <div style="font-weight: bold; color: #111827;">Mention de Certification :</div>
              <p style="margin: 2px 0; color: #4b5563; font-size: 10.5px;">
                Rapport officiel certifié conforme extrait du système d'encaissement Aquadro POS Algérie.
                <br />
                Document généré le <strong>${generatedAt}</strong> sous la référence d'audit sécurisée.
              </p>
            </div>

            <div>
              <div style="font-weight: bold; color: #111827; text-align: center;">Cachet & Signature Direction :</div>
              <div class="signature-box">
                ختم وتوقيع مسيّر المحل
              </div>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 5. DÉCLENCHEMENT DE L'IMPRESSION DIRECTE OU TÉLÉCHARGEMENT PDF
  // ──────────────────────────────────────────────────────────────────────────
  public printOrDownloadPdf(
    type: 'daily' | 'weekly' | 'monthly',
    data: any,
    store: Partial<Store>,
    storeLogo: string | null = null
  ): void {
    const htmlContent = this.generateReportHtml(type, data, store, storeLogo);

    // Mettre à jour la zone dédiée #report-print-area pour @media print
    if (typeof window !== 'undefined') {
      let printArea = document.getElementById('report-print-area');
      if (!printArea) {
        printArea = document.createElement('div');
        printArea.id = 'report-print-area';
        document.body.appendChild(printArea);
      }
      printArea.innerHTML = htmlContent;

      // Déclencher le dialogue d'impression système
      setTimeout(() => {
        window.print();
      }, 80);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 6. TÉLÉCHARGEMENT DU FICHIER HTML AUTONOME ET ENREGISTREMENT DANS التقارير
  // ──────────────────────────────────────────────────────────────────────────
  public async downloadHtmlReport(
    type: 'daily' | 'weekly' | 'monthly',
    data: any,
    store: Partial<Store>,
    storeLogo: string | null = null
  ): Promise<string> {
    const htmlContent = this.generateReportHtml(type, data, store, storeLogo);
    const dateLabel = type === 'daily'
      ? (data as DailyReportData).date
      : type === 'weekly'
      ? `${(data as WeeklyReportData).startDate}_au_${(data as WeeklyReportData).endDate}`
      : (data as MonthlyReportData).yearMonth;

    const filename = `Rapport_${type.toUpperCase()}_${dateLabel}.html`;
    let savedPath = '';

    // 1. Sauvegarde automatique native dans le dossier التقارير du programme
    if (typeof window !== 'undefined' && typeof (window as any).__TAURI_INTERNALS__?.invoke === 'function') {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const res: any = await invoke('save_report_file', {
          filename,
          content: htmlContent
        });
        savedPath = res?.filepath || '';
      } catch (err) {
        console.warn('Erreur sauvegarde automatique rapport périodique:', err);
      }
    }

    // 2. Téléchargement automatique navigateur
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    return savedPath;
  }
}

export const periodicReportService = PeriodicReportService.getInstance();
