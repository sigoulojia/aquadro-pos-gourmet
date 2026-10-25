// Aquadro POS Algérie V2 — Rapports Financiers & Rentabilité Commerciale Pizzeria
// Audit et refonte rigoureuse : élimination des doublons, calculs certifiés, séparation pizzas/boissons/extras
// et préservation stricte de l'identité visuelle et de la charte graphique

import React, { useState, useEffect } from 'react';
import { reportService, FinancialMetrics, InventoryValuation } from '../../services/report.service';
import { CurrencyUtil } from '../../core/currency/currency';
import { useToast } from '../common/Toast';
import { LegendaryFinanceChart } from './LegendaryFinanceChart';
import { logger } from '../../services/logger.service';
import {
  BarChart3,
  Download,
  Calendar,
  DollarSign,
  TrendingUp,
  CreditCard,
  Layers,
  PieChart,
  Users,
  Briefcase,
  RefreshCw,
  AlertTriangle,
  Coins,
  Package,
  CheckCircle2,
  Coffee,
  Pizza,
  Sparkles,
  Search,
  X,
  ArrowUpDown,
  Activity,
  FolderOpen
} from 'lucide-react';

export const ReportsView: React.FC = () => {
  const { showToast } = useToast();
  const [metrics, setMetrics] = useState<FinancialMetrics | null>(null);
  const [valuation, setValuation] = useState<InventoryValuation | null>(null);
  const [periodMode, setPeriodMode] = useState<'ALL' | 'TODAY' | 'MONTH' | 'CUSTOM'>('ALL');
  const [dateFilter, setDateFilter] = useState<string>(new Date().toISOString().split('T')[0]);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Barre de recherche et filtres Top Produits
  const [productSearch, setProductSearch] = useState<string>('');
  const [productCategoryFilter, setProductCategoryFilter] = useState<'ALL' | 'pizza' | 'drink' | 'supplement'>('ALL');
  const [productSortBy, setProductSortBy] = useState<'qty' | 'revenue'>('qty');
  const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(null);

  useEffect(() => {
    loadReports();
    const handleUpdate = () => {
      loadReports();
    };
    window.addEventListener('sale_completed', handleUpdate);
    window.addEventListener('sales_updated', handleUpdate);
    return () => {
      window.removeEventListener('sale_completed', handleUpdate);
      window.removeEventListener('sales_updated', handleUpdate);
    };
  }, [periodMode, dateFilter]);

  const loadReports = async () => {
    setIsRefreshing(true);
    try {
      let filter = dateFilter;
      if (periodMode === 'ALL') filter = 'ALL';
      else if (periodMode === 'MONTH') filter = 'MONTH';
      else if (periodMode === 'TODAY') filter = new Date().toISOString().split('T')[0];

      const m = await reportService.getFinancialMetrics(filter);
      setMetrics(m);
      const val = await reportService.getInventoryValuation();
      setValuation(val);
    } catch (err) {
      console.error('Error loading reports:', err);
      showToast('Erreur lors du calcul des rapports', 'error');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleExportCsv = async () => {
    if (!metrics) return;

    const headers = ['Métrique Financière Pizzeria', 'Valeur (DZD)', 'Formule / Règle de Gestion'];
    const rows = [
      ['Chiffre d\'Affaires Net TTC', metrics.revenue, 'Ventes réelles terminées déduites des remboursements'],
      ['Ventes Brutes TTC', metrics.grossRevenue, 'Avant déduction des remises et remboursements'],
      ['Remises Commerciales Accordées', metrics.totalDiscounts, 'Rabais et promotions déduits des tickets'],
      ['Remboursements et Avoirs Clients', metrics.totalRefunds, 'Remboursements et annulations enregistrés'],
      ['Coût des Marchandises Vendues (COGS)', metrics.cogs, `Coût historique figé (${metrics.cogsReliabilityPercent}% certifié)`],
      ['Marge Brute Commerciale', metrics.grossMargin, `${metrics.marginPercentage}% de rentabilité brute (Net Revenue - COGS)`],
      ['Charges d\'Exploitation (Hors Achats Stock)', metrics.operatingExpenses, 'Loyer, Sonelgaz, boîtes à pizza, salaires (Sans double comptage)'],
      ['Achats Matières & Stock (Période)', metrics.purchases.totalPurchasesCost, 'Réceptions de stock fournisseurs (capital investi en actif)'],
      ['Résultat Net d\'Exploitation', metrics.netResult, `${metrics.netMarginPercentage}% (Marge Brute - Charges d'Exploitation)`],
      ['Nombre de Commandes Terminées', metrics.transactionCount, 'Tickets de caisse validés'],
      ['Panier Moyen Net', metrics.averageBasket, 'Moyenne DZD par commande'],
      ['Ventes Pizzas & Portions', metrics.categorySales.pizzas.revenue, `${metrics.categorySales.pizzas.quantity} parts/pizzas (${metrics.categorySales.pizzas.percentage}%)`],
      ['Ventes Boissons & Canettes', metrics.categorySales.drinks.revenue, `${metrics.categorySales.drinks.quantity} boissons (${metrics.categorySales.drinks.percentage}%)`],
      ['Ventes Suppléments & Extras', metrics.categorySales.supplements.revenue, `${metrics.categorySales.supplements.quantity} extras (${metrics.categorySales.supplements.percentage}%)`],
      ['Règlements Espèces (Tiroir)', metrics.paymentBreakdown.cash, 'Total encaissé en liquide'],
      ['Règlements TPE CIB / Edahabia', metrics.paymentBreakdown.cib_edahabia, 'Télécollecte bancaire'],
      ['Règlements BaridiMob QR', metrics.paymentBreakdown.baridimob, 'QR Algérie Poste'],
      ['Ventes à Crédit Client', metrics.paymentBreakdown.credit, 'Créance enregistrée sur la période'],
      ['Actif Ingrédients en Cuisine', metrics.ingredientsStockValue, 'Farine, Mozzarella, Sauce tomate valorisés au coût d\'achat'],
      ['Actif Suppléments en Stock', metrics.supplementsStockValue, 'Extras valorisés au coût d\'achat'],
      ['Actif Boissons en Stock', metrics.drinksStockValue, 'Boissons au frigo valorisées au coût d\'achat'],
      ['Créances Clients Globales', metrics.debts.customerTotalDebt, 'Total des dettes clients à recouvrer'],
      ['Dettes Fournisseurs Globales', metrics.debts.supplierTotalDebt, 'Factures d\'achat en attente de paiement']
    ];

    const labelPeriod = periodMode === 'ALL' ? 'global' : periodMode === 'MONTH' ? 'mois' : dateFilter;
    const filename = `aquadro_rapport_pizzeria_${labelPeriod}.csv`;
    await reportService.exportToCsv(filename, headers, rows);
    await logger.logReportExported(filename);
    showToast('تم تحميل التقرير وحفظه تلقائياً في مجلد [التقارير] بنجاح !', 'success');
  };

  return (
    <div className="h-full w-full bg-gray-100 p-4 overflow-y-auto space-y-4 text-xs select-none pb-20">
      {/* Barre d'outils supérieure */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-gray-200">
        <div>
          <h2 className="text-base font-bold text-gray-900">Rapports Financiers & Analyse d'Activité Pizzeria</h2>
          <span className="text-[11px] text-gray-500">
            Chiffre d'Affaires net, rentabilité pizzeria, consommation matières et trésorerie en Dinar Algérien (DZD)
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Sélecteur de période rapide */}
          <div className="flex items-center bg-white border border-gray-300 rounded-lg p-0.5 shadow-2xs">
            <button
              onClick={() => setPeriodMode('ALL')}
              className={`px-2.5 py-1 rounded-md font-bold text-xs transition cursor-pointer ${
                periodMode === 'ALL'
                  ? 'bg-[#E87524] text-white shadow-2xs'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              الكل (Tout l'historique)
            </button>
            <button
              onClick={() => setPeriodMode('TODAY')}
              className={`px-2.5 py-1 rounded-md font-bold text-xs transition cursor-pointer ${
                periodMode === 'TODAY'
                  ? 'bg-[#E87524] text-white shadow-2xs'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              اليوم (Aujourd'hui)
            </button>
            <button
              onClick={() => setPeriodMode('MONTH')}
              className={`px-2.5 py-1 rounded-md font-bold text-xs transition cursor-pointer ${
                periodMode === 'MONTH'
                  ? 'bg-[#E87524] text-white shadow-2xs'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              هذا الشهر (Ce Mois)
            </button>
            <button
              onClick={() => setPeriodMode('CUSTOM')}
              className={`px-2.5 py-1 rounded-md font-bold text-xs transition cursor-pointer ${
                periodMode === 'CUSTOM'
                  ? 'bg-[#E87524] text-white shadow-2xs'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              تاريخ محدد
            </button>
          </div>

          {periodMode === 'CUSTOM' && (
            <input
              type="date"
              value={dateFilter}
              onChange={e => setDateFilter(e.target.value)}
              className="bg-white border border-gray-300 rounded-lg px-2.5 py-1.5 font-mono text-xs text-gray-900 focus:outline-none focus:border-[#E87524]"
            />
          )}

          <button
            onClick={loadReports}
            title="Rafraîchir les rapports"
            className="p-1.5 rounded-lg bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 shadow-2xs transition cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-[#E87524]' : ''}`} />
          </button>

          <button
            onClick={handleExportCsv}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-sm transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Exporter CSV</span>
          </button>

          <button
            onClick={() => logger.openReportsFolder()}
            title="Ouvrir le dossier des rapports sur cet ordinateur"
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold shadow-2xs transition-colors cursor-pointer"
          >
            <FolderOpen className="w-3.5 h-3.5 text-[#E87524]" />
            <span>مجلد التقارير</span>
          </button>
        </div>
      </div>

      {/* 1. Tableau Synthétique de Rentabilité & Compte de Résultat */}
      <div className="bg-white rounded border border-gray-200 overflow-hidden">
        <div className="p-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <TrendingUp className="w-4 h-4 text-blue-600" />
            <span className="font-bold text-gray-900 text-xs">
              Compte de Résultat d'Exploitation Pizzeria ({
                periodMode === 'ALL'
                  ? 'كل المعاملات التاريخية'
                  : periodMode === 'MONTH'
                  ? 'هذا الشهر الحسابي'
                  : periodMode === 'TODAY'
                  ? `اليوم (${new Date().toISOString().split('T')[0]})`
                  : dateFilter
              })
            </span>
          </div>
          <span className="text-[11px] text-gray-500 font-medium">
            Données certifiées SQLite — Déduction des remboursements & Prévention du double comptage
          </span>
        </div>

        <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Chiffre d'Affaires Net */}
          <div className="p-3 rounded border border-gray-200 bg-gray-50 space-y-1">
            <span className="text-gray-500 text-[11px] block">1. Chiffre d'Affaires Net (TTC)</span>
            <span className="text-lg font-black text-gray-900 font-mono block">
              {metrics ? CurrencyUtil.formatDZD(metrics.revenue) : '—'}
            </span>
            <div className="text-[10px] text-gray-400 flex flex-wrap gap-1">
              <span>{metrics?.transactionCount || 0} commandes terminées</span>
              {metrics && (metrics.totalRefunds > 0 || metrics.totalDiscounts > 0) && (
                <span className="text-amber-700 font-medium">
                  ({metrics.totalRefunds > 0 ? `-${CurrencyUtil.formatDZD(metrics.totalRefunds)} remb.` : ''}
                  {metrics.totalDiscounts > 0 ? ` | -${CurrencyUtil.formatDZD(metrics.totalDiscounts)} remises` : ''})
                </span>
              )}
            </div>
          </div>

          {/* Card 2: Coût Ingrédients & Matières (COGS) */}
          <div className="p-3 rounded border border-gray-200 bg-gray-50 space-y-1">
            <span className="text-gray-500 text-[11px] block">2. Coût d'Achat des Ventes (COGS)</span>
            <span className="text-lg font-black text-gray-700 font-mono block">
              {metrics ? CurrencyUtil.formatDZD(metrics.cogs) : '—'}
            </span>
            <div className="text-[10px] text-gray-500">
              {metrics ? (
                <span>Snapshot historique figé ({metrics.cogsReliabilityPercent}% vérifié)</span>
              ) : (
                '—'
              )}
            </div>
          </div>

          {/* Card 3: Marge Brute Commerciale */}
          <div className="p-3 rounded border border-emerald-200 bg-emerald-50/50 space-y-1">
            <span className="text-emerald-800 text-[11px] font-semibold block">3. Marge Brute Pizzeria</span>
            <span className="text-lg font-black text-emerald-700 font-mono block">
              {metrics ? CurrencyUtil.formatDZD(metrics.grossMargin) : '—'}
            </span>
            <span className="text-[10px] text-emerald-600 font-bold">
              {metrics ? `${metrics.marginPercentage}% de marge commerciale` : '—'}
            </span>
          </div>

          {/* Card 4: Résultat Net d'Exploitation */}
          <div className="p-3 rounded border border-blue-200 bg-blue-50/50 space-y-1">
            <span className="text-blue-800 text-[11px] font-semibold block">4. Résultat Net d'Exploitation</span>
            <span className="text-lg font-black text-blue-900 font-mono block">
              {metrics ? CurrencyUtil.formatDZD(metrics.netResult) : '—'}
            </span>
            <span className="text-[10px] text-blue-700">
              Après déduction des charges d'exploitation ({metrics ? CurrencyUtil.formatDZD(metrics.operatingExpenses) : '0 DA'})
            </span>
          </div>
        </div>
      </div>

      {/* 2. Ventilation des Règlements & Répartition Pizzeria (Pizzas vs Boissons vs Extras) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Modes de Règlement & Caisse */}
        <div className="bg-white rounded border border-gray-200 overflow-hidden flex flex-col justify-between">
          <div className="p-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <PieChart className="w-4 h-4 text-gray-500" />
              <span className="font-bold text-gray-900 text-xs">Ventilation des Règlements & Contrôle Caisse</span>
            </div>
            {metrics?.cashSessionSummary?.discrepancy !== undefined && metrics.cashSessionSummary.discrepancy !== 0 && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                metrics.cashSessionSummary.discrepancy < 0 ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'
              }`}>
                Écart caisse : {CurrencyUtil.formatDZD(metrics.cashSessionSummary.discrepancy)}
              </span>
            )}
          </div>

          <div className="p-4 flex flex-col space-y-3">
            {/* Barre de répartition proportionnelle des paiements */}
            <div className="w-full flex h-3.5 rounded-full overflow-hidden bg-gray-200">
              {metrics && metrics.revenue > 0 ? (
                <>
                  <div className="bg-emerald-500" style={{ width: `${(metrics.paymentBreakdown.cash / metrics.revenue) * 100}%` }} title="Espèces" />
                  <div className="bg-blue-500" style={{ width: `${(metrics.paymentBreakdown.cib_edahabia / metrics.revenue) * 100}%` }} title="CIB" />
                  <div className="bg-purple-500" style={{ width: `${(metrics.paymentBreakdown.baridimob / metrics.revenue) * 100}%` }} title="BaridiMob" />
                  <div className="bg-amber-500" style={{ width: `${(metrics.paymentBreakdown.credit / metrics.revenue) * 100}%` }} title="Crédit" />
                </>
              ) : (
                <div className="bg-gray-200 w-full" />
              )}
            </div>
            
            <div className="space-y-2 text-xs">
              <div className="flex justify-between items-center pb-1 border-b border-gray-100">
                <span className="text-gray-700 font-medium flex items-center">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 mr-2"></span>Espèces en Caisse (Tiroir) :
                </span>
                <span className="font-mono font-bold text-gray-900">
                  {metrics ? CurrencyUtil.formatDZD(metrics.paymentBreakdown.cash) : '0 DA'}
                </span>
              </div>
              <div className="flex justify-between items-center pb-1 border-b border-gray-100">
                <span className="text-gray-700 font-medium flex items-center">
                  <span className="w-2 h-2 rounded-full bg-blue-500 mr-2"></span>TPE Carte CIB / Edahabia :
                </span>
                <span className="font-mono font-bold text-blue-700">
                  {metrics ? CurrencyUtil.formatDZD(metrics.paymentBreakdown.cib_edahabia) : '0 DA'}
                </span>
              </div>
              <div className="flex justify-between items-center pb-1 border-b border-gray-100">
                <span className="text-gray-700 font-medium flex items-center">
                  <span className="w-2 h-2 rounded-full bg-purple-500 mr-2"></span>BaridiMob QR (Algérie Poste) :
                </span>
                <span className="font-mono font-bold text-purple-700">
                  {metrics ? CurrencyUtil.formatDZD(metrics.paymentBreakdown.baridimob) : '0 DA'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-700 font-medium flex items-center">
                  <span className="w-2 h-2 rounded-full bg-amber-500 mr-2"></span>Ventes à Crédit Client :
                </span>
                <span className="font-mono font-bold text-amber-700">
                  {metrics ? CurrencyUtil.formatDZD(metrics.paymentBreakdown.credit) : '0 DA'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Répartition Spécifique Pizzeria (Pizzas vs Boissons vs Suppléments) */}
        <div className="bg-white rounded border border-gray-200 overflow-hidden flex flex-col justify-between">
          <div className="p-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Pizza className="w-4 h-4 text-[#E87524]" />
              <span className="font-bold text-gray-900 text-xs">Répartition des Ventes Pizzeria</span>
            </div>
            <span className="text-[11px] text-gray-500">Pizzas / Boissons / Extras</span>
          </div>

          <div className="p-4 flex flex-col space-y-3">
            {/* Barre de proportion des ventes par catégorie */}
            <div className="w-full flex h-3.5 rounded-full overflow-hidden bg-gray-200">
              {metrics && metrics.revenue > 0 ? (
                <>
                  <div className="bg-[#E87524]" style={{ width: `${metrics.categorySales.pizzas.percentage}%` }} title="Pizzas" />
                  <div className="bg-sky-500" style={{ width: `${metrics.categorySales.drinks.percentage}%` }} title="Boissons" />
                  <div className="bg-emerald-500" style={{ width: `${metrics.categorySales.supplements.percentage}%` }} title="Suppléments" />
                  <div className="bg-gray-400" style={{ width: `${metrics.categorySales.other.percentage}%` }} title="Autres" />
                </>
              ) : (
                <div className="bg-gray-200 w-full" />
              )}
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between items-center pb-1 border-b border-gray-100">
                <span className="text-gray-700 font-medium flex items-center">
                  <span className="w-2 h-2 rounded-full bg-[#E87524] mr-2"></span>Pizzas & Portions :
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-400 font-mono">({metrics?.categorySales.pizzas.quantity || 0} unités - {metrics?.categorySales.pizzas.percentage || 0}%)</span>
                  <span className="font-mono font-bold text-gray-900">
                    {metrics ? CurrencyUtil.formatDZD(metrics.categorySales.pizzas.revenue) : '0 DA'}
                  </span>
                </div>
              </div>

              <div className="flex justify-between items-center pb-1 border-b border-gray-100">
                <span className="text-gray-700 font-medium flex items-center">
                  <span className="w-2 h-2 rounded-full bg-sky-500 mr-2"></span>Boissons & Canettes :
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-400 font-mono">({metrics?.categorySales.drinks.quantity || 0} canettes - {metrics?.categorySales.drinks.percentage || 0}%)</span>
                  <span className="font-mono font-bold text-sky-700">
                    {metrics ? CurrencyUtil.formatDZD(metrics.categorySales.drinks.revenue) : '0 DA'}
                  </span>
                </div>
              </div>

              <div className="flex justify-between items-center pb-1 border-b border-gray-100">
                <span className="text-gray-700 font-medium flex items-center">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 mr-2"></span>Suppléments & Extras :
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-400 font-mono">({metrics?.categorySales.supplements.quantity || 0} extras - {metrics?.categorySales.supplements.percentage || 0}%)</span>
                  <span className="font-mono font-bold text-emerald-700">
                    {metrics ? CurrencyUtil.formatDZD(metrics.categorySales.supplements.revenue) : '0 DA'}
                  </span>
                </div>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-gray-500 font-medium flex items-center">
                  <span className="w-2 h-2 rounded-full bg-gray-400 mr-2"></span>Autres Ventes :
                </span>
                <span className="font-mono font-bold text-gray-600">
                  {metrics ? CurrencyUtil.formatDZD(metrics.categorySales.other.revenue) : '0 DA'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2.5 Actif Matières Premières & Stocks Pizzeria (Ingrédients, Suppléments & Boissons) */}
      <div className="bg-white rounded border border-orange-200 overflow-hidden">
        <div className="p-3 border-b border-orange-200 bg-orange-50 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Layers className="w-4 h-4 text-orange-500" />
            <span className="font-bold text-orange-900 text-xs">Actif Stocks Réel Pizzeria (Matières Premières Cuisine & Boissons)</span>
          </div>
          {metrics && metrics.lowStockAlerts && metrics.lowStockAlerts.length > 0 && (
            <span className="text-[10px] font-bold bg-red-100 text-red-800 border border-red-200 px-2 py-0.5 rounded flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-red-600" />
              <span>{metrics.lowStockAlerts.length} alerte(s) stock critique</span>
            </span>
          )}
        </div>

        <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-3 rounded border border-orange-100 bg-orange-50/40 space-y-1">
            <span className="text-orange-700 text-[11px] font-semibold block">Stock Ingrédients Cuisine</span>
            <span className="text-lg font-black text-orange-800 font-mono block">
              {metrics ? CurrencyUtil.formatDZD(metrics.ingredientsStockValue) : '—'}
            </span>
            <span className="text-[10px] text-orange-600">Farine, fromage mozzarella, sauce tomate, levure...</span>
          </div>

          <div className="p-3 rounded border border-amber-100 bg-amber-50/40 space-y-1">
            <span className="text-amber-700 text-[11px] font-semibold block">Stock Suppléments & Extras</span>
            <span className="text-lg font-black text-amber-800 font-mono block">
              {metrics ? CurrencyUtil.formatDZD(metrics.supplementsStockValue) : '—'}
            </span>
            <span className="text-[10px] text-amber-600">Champignons, thon, olives, sauces spéciales</span>
          </div>

          <div className="p-3 rounded border border-emerald-200 bg-emerald-50/40 space-y-1">
            <span className="text-emerald-700 text-[11px] font-semibold block">Total Capital Investi en Stock</span>
            <span className="text-lg font-black text-emerald-800 font-mono block">
              {metrics ? CurrencyUtil.formatDZD(metrics.totalStockValue) : '—'}
            </span>
            <span className="text-[10px] text-emerald-600">Valeur totale des stocks valorisée au coût d'achat</span>
          </div>
        </div>
      </div>

      {/* 2.5 Graphique Financier Avancé & Légendaire (Courbe Spline + Histogramme des Ventes) */}
      <LegendaryFinanceChart
        timeline={metrics?.salesTimeline || []}
        periodMode={periodMode}
      />

      {/* 2.6 Ventilation des Charges & Consommables Pizzeria (علب البيتزا، المناديل، التغليف، الرواتب) */}
      <div className="bg-white rounded border border-gray-200 overflow-hidden">
        <div className="p-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <PieChart className="w-4 h-4 text-orange-600" />
            <span className="font-bold text-gray-900 text-xs">
              تفصيل مصاريف ومستهلكات المحل (علب البيتزا، المناديل، التغليف، الفواتير، الأجور)
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-gray-600">
              Charges Exploitation : <strong>{metrics ? CurrencyUtil.formatDZD(metrics.operatingExpenses) : '0 DA'}</strong>
            </span>
            {metrics && metrics.stockPurchasesExpenses > 0 && (
              <span className="text-[10px] bg-blue-50 text-blue-800 border border-blue-200 px-1.5 py-0.5 rounded font-mono">
                Achats Stock Comptant : {CurrencyUtil.formatDZD(metrics.stockPurchasesExpenses)}
              </span>
            )}
          </div>
        </div>

        <div className="p-4">
          {metrics && metrics.expensesByCategory && Object.keys(metrics.expensesByCategory).length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {Object.entries(metrics.expensesByCategory).map(([cat, amount]) => {
                const getLabel = (c: string) => {
                  switch (c) {
                    case 'PIZZA_BOXES': return { label: 'علب البيتزا', sub: 'Boîtes à Pizza' };
                    case 'NAPKINS': return { label: 'ورق مناديل', sub: 'Serviettes & Papier' };
                    case 'PACKAGING': return { label: 'أكياس وتغليف', sub: 'Sacs & Emballages' };
                    case 'INGREDIENTS_PURCHASE': return { label: 'شراء مكونات (مخزون)', sub: 'Achat Ingrédients Stock' };
                    case 'SUPPLEMENTS_PURCHASE': return { label: 'شراء إضافات (مخزون)', sub: 'Achat Suppléments Stock' };
                    case 'RENT': return { label: 'إيجار المحل', sub: 'Loyer Magasin' };
                    case 'ELECTRICITY': return { label: 'كهرباء وغاز', sub: 'Sonelgaz' };
                    case 'WATER': return { label: 'ماء', sub: 'Seaal' };
                    case 'INTERNET': return { label: 'إنترنت وهاتف', sub: 'Algérie Télécom' };
                    case 'SALARY': return { label: 'رواتب العمال', sub: 'Salaires Personnel' };
                    case 'CHEF_SALARY': return { label: 'راتب الطباخين', sub: 'Salaires Chefs Pizzaiolo' };
                    case 'CLEANING': return { label: 'مواد تنظيف', sub: 'Nettoyage & Hygiène' };
                    case 'SUPPLIES': return { label: 'لوازم كاشير', sub: 'Fournitures Caisse' };
                    case 'TRANSPORT': return { label: 'نقل وتوصيل', sub: 'Transport & Livraison' };
                    case 'MAINTENANCE': return { label: 'صيانة وتصليح', sub: 'Maintenance Four/Matériel' };
                    default: return { label: 'مصاريف أخرى', sub: 'Autres Charges' };
                  }
                };
                const info = getLabel(cat);
                const percent = metrics.expenses > 0 ? Math.round((amount / metrics.expenses) * 100) : 0;
                return (
                  <div key={cat} className="p-2.5 rounded-lg border border-gray-100 bg-gray-50/60 flex flex-col justify-between">
                    <div>
                      <span className="font-bold text-gray-800 text-xs block truncate">{info.label}</span>
                      <span className="text-[10px] text-gray-400 block truncate">{info.sub}</span>
                    </div>
                    <div className="mt-2 flex items-baseline justify-between">
                      <span className="font-mono font-bold text-sm text-gray-900">{CurrencyUtil.formatDZD(amount)}</span>
                      <span className="text-[10px] text-stone-500 font-mono font-bold bg-gray-100 px-1 rounded">{percent}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-3 text-xs text-gray-400 italic">
              Aucune dépense enregistrée pour cette période. Vous pouvez saisir les boîtes à pizza, serviettes, emballages, factures ou salaires dans l'onglet Dépenses (F9).
            </div>
          )}
        </div>
      </div>

      {/* 3. Top Produits avec Barre de Recherche & Approvisionnements / Dettes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pb-10">
        {/* Top Produits Vendus avec Barre de Recherche */}
        <div className="bg-white rounded border border-gray-200 overflow-hidden flex flex-col">
          <div className="p-3 border-b border-gray-200 bg-gray-50 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <BarChart3 className="w-4 h-4 text-[#E87524]" />
                <span className="font-bold text-gray-900 text-xs">
                  Classement des Ventes (Pizzas, Boissons & Suppléments)
                </span>
              </div>
              <div className="flex items-center space-x-1">
                <button
                  type="button"
                  onClick={() => setProductSortBy(productSortBy === 'qty' ? 'revenue' : 'qty')}
                  className="px-2 py-0.5 rounded border border-gray-200 bg-white hover:bg-gray-100 text-[10px] font-bold text-gray-700 flex items-center gap-1"
                  title="Changer le critère de tri"
                >
                  <ArrowUpDown className="w-3 h-3 text-gray-500" />
                  <span>Tri : {productSortBy === 'qty' ? 'Par Quantité' : 'Par Chiffre (CA)'}</span>
                </button>
              </div>
            </div>

            {/* Barre de Recherche Rapide Produit */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Rechercher..."
                  value={productSearch}
                  onChange={e => setProductSearch(e.target.value)}
                  className="w-full pl-8 pr-7 py-1.5 bg-white border border-gray-300 rounded text-xs text-gray-800 placeholder-gray-400 focus:outline-none focus:border-[#E87524]"
                />
                {productSearch && (
                  <button
                    type="button"
                    onClick={() => setProductSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Filtres de catégorie sans emoji */}
              <div className="flex items-center space-x-1">
                {(['ALL', 'pizza', 'drink', 'supplement'] as const).map(catKey => {
                  const label = catKey === 'ALL' ? 'Tous' : catKey === 'pizza' ? 'Pizzas' : catKey === 'drink' ? 'Boissons' : 'Suppléments';
                  const isSelected = productCategoryFilter === catKey;
                  return (
                    <button
                      key={catKey}
                      type="button"
                      onClick={() => setProductCategoryFilter(catKey)}
                      className={`px-2 py-1 rounded text-[10px] font-bold transition-colors ${
                        isSelected
                          ? 'bg-[#E87524] text-white'
                          : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="p-0 flex-1 overflow-y-auto max-h-96">
            {(() => {
              const allItems = metrics?.topProducts || [];
              const filtered = allItems.filter(p => {
                if (productCategoryFilter !== 'ALL' && p.category !== productCategoryFilter) return false;
                if (!productSearch.trim()) return true;
                const q = productSearch.toLowerCase().trim();
                return p.name.toLowerCase().includes(q);
              }).sort((a, b) => productSortBy === 'qty' ? b.quantity - a.quantity : b.revenue - a.revenue);

              return (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 text-[10px] uppercase text-gray-500 font-bold border-b border-gray-200 sticky top-0">
                      <th className="p-2.5">Rang & Produit</th>
                      <th className="p-2.5 text-center">Catégorie</th>
                      <th className="p-2.5 text-center">Quantité</th>
                      <th className="p-2.5 text-right">CA Réalisé (DZD)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length ? (
                      filtered.map((p, idx) => (
                        <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50/60">
                          <td className="p-2.5 font-medium text-gray-800">
                            <span className="font-bold text-[#E87524] mr-1.5 font-mono">#{idx + 1}</span>
                            <span>{p.name}</span>
                          </td>
                          <td className="p-2.5 text-center">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                              p.category === 'pizza'
                                ? 'bg-orange-50 text-orange-800 border border-orange-200'
                                : p.category === 'drink'
                                ? 'bg-blue-50 text-blue-800 border border-blue-200'
                                : p.category === 'supplement'
                                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                : 'bg-gray-50 text-gray-700 border border-gray-200'
                            }`}>
                              {p.category === 'pizza' ? 'Pizza' : p.category === 'drink' ? 'Boisson' : p.category === 'supplement' ? 'Supplément' : 'Autre'}
                            </span>
                          </td>
                          <td className="p-2.5 text-center">
                            <span className="px-2 py-0.5 bg-gray-100 text-gray-800 rounded font-bold font-mono">
                              {p.quantity}
                            </span>
                          </td>
                          <td className="p-2.5 text-right font-mono font-bold text-gray-900">
                            {CurrencyUtil.formatDZD(p.revenue)}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="p-6 text-center text-gray-400 italic">
                          {productSearch ? `Aucun produit ne correspond à « ${productSearch} »` : "Aucune vente enregistrée pour cette sélection."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              );
            })()}
          </div>
        </div>

        {/* Approvisionnements, Dettes & Alertes Stock Cuisine */}
        <div className="bg-white rounded border border-gray-200 overflow-hidden flex flex-col justify-between">
          <div className="p-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Briefcase className="w-4 h-4 text-gray-500" />
              <span className="font-bold text-gray-900 text-xs">Approvisionnements, Dettes & Alertes Stock</span>
            </div>
            <span className="text-[11px] text-gray-400">Période & Situation Réelle</span>
          </div>

          <div className="p-4 space-y-3.5">
            {/* Achats fournisseurs sur la période */}
            <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 flex items-center justify-between">
              <div>
                <span className="text-gray-700 font-bold block">Achats Fournisseurs Réceptionnés :</span>
                <span className="text-[10px] text-gray-500 block">
                  {metrics?.purchases.purchasesCount || 0} livraison(s) de matières premières / boissons
                </span>
              </div>
              <span className="text-base font-black font-mono text-gray-900">
                {metrics ? CurrencyUtil.formatDZD(metrics.purchases.totalPurchasesCost) : '0 DA'}
              </span>
            </div>

            {/* Dettes Clients et Fournisseurs */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-amber-50/50 rounded-lg border border-amber-200">
                <span className="text-amber-800 font-bold text-[11px] block">Créances Clients (Dettes)</span>
                <span className="text-[10px] text-amber-700 block">À encaisser auprès des clients</span>
                <span className="text-sm font-black font-mono text-amber-900 block mt-1">
                  {metrics ? CurrencyUtil.formatDZD(metrics.debts.customerTotalDebt) : '0 DA'}
                </span>
              </div>

              <div className="p-3 bg-red-50/50 rounded-lg border border-red-200">
                <span className="text-red-800 font-bold text-[11px] block">Dettes Fournisseurs</span>
                <span className="text-[10px] text-red-700 block">Factures à payer aux livreurs</span>
                <span className="text-sm font-black font-mono text-red-900 block mt-1">
                  {metrics ? CurrencyUtil.formatDZD(metrics.debts.supplierTotalDebt) : '0 DA'}
                </span>
              </div>
            </div>

            {/* Alertes Ingrédients sous le seuil critique */}
            <div>
              <span className="text-[11px] font-bold text-gray-700 block mb-1.5 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                <span>Alertes de Stock Critique en Cuisine :</span>
              </span>
              <div className="max-h-28 overflow-y-auto space-y-1">
                {metrics && metrics.lowStockAlerts && metrics.lowStockAlerts.length > 0 ? (
                  metrics.lowStockAlerts.slice(0, 5).map(item => (
                    <div key={item.id} className="flex justify-between items-center px-2 py-1 bg-red-50/60 border border-red-100 rounded text-[11px]">
                      <span className="font-medium text-red-900">{item.name}</span>
                      <span className="font-mono font-bold text-red-700">
                        {item.currentStock} {item.unit} (Seuil: {item.minAlert})
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-2 text-emerald-700 bg-emerald-50 border border-emerald-100 rounded text-[11px] font-medium flex items-center justify-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Tous les stocks d'ingrédients et boissons sont au-dessus du seuil d'alerte.</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="p-3 bg-gray-50 border-t border-gray-100 text-[10px] text-gray-400">
            Les achats de stock sont capitalisés en actif et imputés aux charges via le COGS lors de la vente.
          </div>
        </div>
      </div>
    </div>
  );
};
