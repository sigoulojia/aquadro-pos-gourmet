// Aquadro POS Algérie V2 — Section des Rapports Périodiques (Journalier 22:00, Hebdomadaire, Mensuel)
// Interface de consultation, aperçu interactif A4 et téléchargement PDF certifié

import React, { useState, useEffect } from 'react';
import {
  periodicReportService,
  DailyReportData,
  WeeklyReportData,
  MonthlyReportData
} from '../../services/periodicReport.service';
import { Store } from '../../types/database';
import { CurrencyUtil } from '../../core/currency/currency';
import { useToast } from '../common/Toast';
import { logger } from '../../services/logger.service';
import {
  FileText,
  Calendar,
  Clock,
  Download,
  Printer,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  DollarSign,
  PieChart,
  ShoppingBag,
  ArrowRight,
  Eye,
  RefreshCw,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  X,
  CreditCard,
  Building,
  Coins,
  FolderOpen
} from 'lucide-react';

interface PeriodicReportsSectionProps {
  store: Partial<Store>;
  storeLogo: string | null;
}

type PeriodType = 'daily' | 'weekly' | 'monthly';

export const PeriodicReportsSection: React.FC<PeriodicReportsSectionProps> = ({
  store,
  storeLogo
}) => {
  const { showToast } = useToast();
  const [activeReportType, setActiveReportType] = useState<PeriodType>('daily');

  // Dates sélectionnées
  const [dailyDate, setDailyDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [weeklyDate, setWeeklyDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [monthlyYearMonth, setMonthlyYearMonth] = useState<string>(() => new Date().toISOString().slice(0, 7));

  // États des données
  const [dailyData, setDailyData] = useState<DailyReportData | null>(null);
  const [weeklyData, setWeeklyData] = useState<WeeklyReportData | null>(null);
  const [monthlyData, setMonthlyData] = useState<MonthlyReportData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  // Horloge en temps réel pour l'échéance de 22:00
  const [currentTime, setCurrentTime] = useState<string>(() => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  });

  // Modal d'aperçu A4
  const [showPreviewModal, setShowPreviewModal] = useState<boolean>(false);

  // Mise à jour de l'horloge chaque seconde
  useEffect(() => {
    const timer = setInterval(() => {
      const d = new Date();
      setCurrentTime(
        `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
      );
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Chargement des données selon l'onglet actif
  useEffect(() => {
    loadActiveReport();
  }, [activeReportType, dailyDate, weeklyDate, monthlyYearMonth]);

  const loadActiveReport = async () => {
    setLoading(true);
    try {
      if (activeReportType === 'daily') {
        const d = await periodicReportService.getDailyReport(dailyDate);
        setDailyData(d);
      } else if (activeReportType === 'weekly') {
        const w = await periodicReportService.getWeeklyReport(weeklyDate);
        setWeeklyData(w);
      } else if (activeReportType === 'monthly') {
        const m = await periodicReportService.getMonthlyReport(monthlyYearMonth);
        setMonthlyData(m);
      }
    } catch (err: any) {
      console.error('Erreur chargement rapport:', err);
      showToast(`Erreur lors du calcul du rapport: ${err.message || err}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handlePrintOrPdf = () => {
    try {
      const currentData =
        activeReportType === 'daily'
          ? dailyData
          : activeReportType === 'weekly'
          ? weeklyData
          : monthlyData;

      if (!currentData) {
        showToast('Aucune donnée à exporter', 'warning');
        return;
      }

      periodicReportService.printOrDownloadPdf(activeReportType, currentData, store, storeLogo);
      showToast('Ouverture du gestionnaire d\'impression / Enregistrement PDF...', 'info');
    } catch (err: any) {
      showToast(`Erreur d'impression : ${err.message || err}`, 'error');
    }
  };

  const handleDownloadHtml = async () => {
    try {
      const currentData =
        activeReportType === 'daily'
          ? dailyData
          : activeReportType === 'weekly'
          ? weeklyData
          : monthlyData;

      if (!currentData) {
        showToast('Aucune donnée à exporter', 'warning');
        return;
      }

      await periodicReportService.downloadHtmlReport(activeReportType, currentData, store, storeLogo);
      await logger.logReportExported(`rapport_${activeReportType}`);
      showToast('تم تحميل التقرير وحفظه تلقائياً في مجلد [التقارير] بنجاح !', 'success');
    } catch (err: any) {
      showToast(`Erreur de téléchargement : ${err.message || err}`, 'error');
    }
  };

  const todayStr = new Date().toISOString().split('T')[0];

  return (
    <div className="space-y-6">
      {/* En-tête de la section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-[#E9DCCB] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-[#FFF3EB] text-[#E87524] rounded-lg border border-[#E87524]/20">
              <FileText className="w-5 h-5" />
            </span>
            <h3 className="text-base font-bold text-gray-900">
              Rapports Périodiques & Téléchargement PDF (التقارير الدورية)
            </h3>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Génération instantanée des rapports financiers officiels conformes : journalier clôturé à 22:00, hebdomadaire et mensuel.
          </p>
        </div>

        {/* Horloge d'exploitation & statut 22:00 */}
        <div className="flex items-center gap-2 bg-gray-50 border border-[#E9DCCB] rounded-lg px-3 py-1.5 text-xs text-gray-700">
          <Clock className="w-4 h-4 text-[#E87524]" />
          <span>Heure locale : <strong className="font-mono">{currentTime}</strong></span>
          <span className="text-gray-300">|</span>
          <span className="text-[11px] text-gray-500 font-medium">Clôture journalière : <strong>22:00</strong></span>
        </div>
      </div>

      {/* 3 Onglets principaux (Journalier, Hebdomadaire, Mensuel) */}
      <div className="grid grid-cols-3 gap-3">
        <button
          type="button"
          onClick={() => setActiveReportType('daily')}
          className={`p-3.5 rounded-xl border text-left transition-all relative overflow-hidden ${
            activeReportType === 'daily'
              ? 'border-[#E87524] bg-[#FFF3EB]/40 shadow-xs ring-1 ring-[#E87524]/30'
              : 'border-[#E9DCCB] bg-white hover:bg-gray-50 text-gray-600'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
              <span>📅</span> Rapport Journalier
            </span>
            <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded">
              22:00 Clôture
            </span>
          </div>
          <div className="text-[11px] font-bold text-[#E87524] mt-1 text-right" dir="rtl">
            التقرير اليومي الشامل (الساعة 22:00)
          </div>
          <p className="text-[10px] text-gray-500 mt-1">
            Ce que nous avons fait aujourd'hui : CA, dépenses, caisse, marge & pizzas vendues.
          </p>
        </button>

        <button
          type="button"
          onClick={() => setActiveReportType('weekly')}
          className={`p-3.5 rounded-xl border text-left transition-all relative overflow-hidden ${
            activeReportType === 'weekly'
              ? 'border-[#E87524] bg-[#FFF3EB]/40 shadow-xs ring-1 ring-[#E87524]/30'
              : 'border-[#E9DCCB] bg-white hover:bg-gray-50 text-gray-600'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
              <span>📊</span> Rapport Hebdomadaire
            </span>
            <span className="text-[10px] bg-blue-100 text-blue-800 font-bold px-1.5 py-0.5 rounded">
              7 Jours
            </span>
          </div>
          <div className="text-[11px] font-bold text-[#E87524] mt-1 text-right" dir="rtl">
            التقرير الأسبوعي للنشاط
          </div>
          <p className="text-[10px] text-gray-500 mt-1">
            Récapitulatif des 7 jours de la semaine, meilleure journée, achats et bénéfice.
          </p>
        </button>

        <button
          type="button"
          onClick={() => setActiveReportType('monthly')}
          className={`p-3.5 rounded-xl border text-left transition-all relative overflow-hidden ${
            activeReportType === 'monthly'
              ? 'border-[#E87524] bg-[#FFF3EB]/40 shadow-xs ring-1 ring-[#E87524]/30'
              : 'border-[#E9DCCB] bg-white hover:bg-gray-50 text-gray-600'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
              <span>🏛️</span> Rapport Mensuel
            </span>
            <span className="text-[10px] bg-purple-100 text-purple-800 font-bold px-1.5 py-0.5 rounded">
              Mois Complet
            </span>
          </div>
          <div className="text-[11px] font-bold text-[#E87524] mt-1 text-right" dir="rtl">
            التقرير الشهري الشامل والحصيلة
          </div>
          <p className="text-[10px] text-gray-500 mt-1">
            Bilan d'activité mensuel, semaines 1 à 4, actif stock et résultat net.
          </p>
        </button>
      </div>

      {/* Barre de filtre et actions d'export */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-gray-50 p-3 rounded-xl border border-[#E9DCCB]">
        {/* Sélecteur selon l'onglet */}
        <div className="flex items-center gap-2">
          {activeReportType === 'daily' && (
            <>
              <span className="text-xs font-bold text-gray-700">Date d'activité :</span>
              <input
                type="date"
                value={dailyDate}
                onChange={e => setDailyDate(e.target.value)}
                className="p-1.5 border border-[#E9DCCB] rounded bg-white text-xs text-gray-900 font-mono shadow-2xs"
              />
              <button
                type="button"
                onClick={() => setDailyDate(todayStr)}
                className={`px-2.5 py-1 text-xs rounded border transition ${
                  dailyDate === todayStr
                    ? 'bg-[#E87524] text-white border-[#E87524] font-bold'
                    : 'bg-white text-gray-700 border-[#E9DCCB] hover:bg-gray-100'
                }`}
              >
                Aujourd'hui (اليوم)
              </button>
              <button
                type="button"
                onClick={() => {
                  const y = new Date();
                  y.setDate(y.getDate() - 1);
                  setDailyDate(y.toISOString().split('T')[0]);
                }}
                className="px-2.5 py-1 text-xs bg-white text-gray-700 border border-[#E9DCCB] rounded hover:bg-gray-100 transition"
              >
                Hier (أمس)
              </button>
            </>
          )}

          {activeReportType === 'weekly' && (
            <>
              <span className="text-xs font-bold text-gray-700">Semaine contenant le :</span>
              <input
                type="date"
                value={weeklyDate}
                onChange={e => setWeeklyDate(e.target.value)}
                className="p-1.5 border border-[#E9DCCB] rounded bg-white text-xs text-gray-900 font-mono shadow-2xs"
              />
              {weeklyData && (
                <span className="text-xs text-gray-600 bg-white px-2 py-1 rounded border border-[#E9DCCB]">
                  Du <strong>{weeklyData.startDate}</strong> au <strong>{weeklyData.endDate}</strong>
                </span>
              )}
            </>
          )}

          {activeReportType === 'monthly' && (
            <>
              <span className="text-xs font-bold text-gray-700">Mois d'exercice :</span>
              <input
                type="month"
                value={monthlyYearMonth}
                onChange={e => setMonthlyYearMonth(e.target.value)}
                className="p-1.5 border border-[#E9DCCB] rounded bg-white text-xs text-gray-900 font-mono shadow-2xs"
              />
              <button
                type="button"
                onClick={() => setMonthlyYearMonth(new Date().toISOString().slice(0, 7))}
                className="px-2.5 py-1 text-xs bg-white text-gray-700 border border-[#E9DCCB] rounded hover:bg-gray-100 transition"
              >
                Ce Mois (هذا الشهر)
              </button>
            </>
          )}

          <button
            type="button"
            onClick={loadActiveReport}
            disabled={loading}
            className="p-1.5 bg-white border border-[#E9DCCB] hover:bg-gray-100 rounded text-gray-700 transition"
            title="Rafraîchir les métriques"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#E87524]' : ''}`} />
          </button>
        </div>

        {/* Boutons d'action : Téléchargement PDF et Aperçu */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowPreviewModal(true)}
            className="px-3 py-1.5 bg-white border border-[#E9DCCB] hover:bg-gray-100 text-gray-800 rounded-lg text-xs font-bold flex items-center gap-1.5 transition shadow-2xs"
          >
            <Eye className="w-4 h-4 text-gray-600" />
            <span>Aperçu Document (معاينة)</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadHtml}
            className="px-3 py-1.5 bg-white border border-[#E9DCCB] hover:bg-gray-100 text-gray-800 rounded-lg text-xs font-bold flex items-center gap-1.5 transition shadow-2xs"
            title="Enregistrer une copie du fichier pour archivage"
          >
            <Download className="w-4 h-4 text-gray-600" />
            <span>Sauvegarder Fichier</span>
          </button>

          <button
            type="button"
            onClick={() => logger.openReportsFolder()}
            className="px-3 py-1.5 bg-white border border-[#E9DCCB] hover:bg-gray-100 text-gray-800 rounded-lg text-xs font-bold flex items-center gap-1.5 transition shadow-2xs cursor-pointer"
            title="Ouvrir le dossier des rapports sur votre ordinateur"
          >
            <FolderOpen className="w-4 h-4 text-[#E87524]" />
            <span>مجلد التقارير</span>
          </button>

          <button
            type="button"
            onClick={handlePrintOrPdf}
            className="px-4 py-1.5 bg-[#E87524] hover:bg-[#D46317] text-white rounded-lg text-xs font-bold flex items-center gap-2 transition shadow-xs"
          >
            <Printer className="w-4 h-4" />
            <span>Télécharger / Imprimer en PDF (تنزيل PDF)</span>
          </button>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* SECTION 1 : RAPPORT JOURNALIER (CLÔTURE À 22:00) */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeReportType === 'daily' && dailyData && (
        <div className="space-y-4">
          {/* Bannière d'état de clôture à 22:00 */}
          {dailyData.isReady ? (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start justify-between gap-3 shadow-2xs">
              <div className="flex items-start gap-3">
                <span className="p-2 bg-emerald-100 text-emerald-700 rounded-lg mt-0.5">
                  <CheckCircle2 className="w-5 h-5" />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-emerald-950">
                      Rapport Journalier Clôturé & Conforme ( جاهز ومكتمل)
                    </h4>
                    <span className="text-[10px] bg-emerald-200 text-emerald-900 font-bold px-2 py-0.5 rounded-full">
                      Clôture 22:00
                    </span>
                  </div>
                  <p className="text-xs text-emerald-800 mt-0.5">
                    Le service de la journée <strong>{dailyData.date}</strong> est officiellement clôturé. Toutes les recettes, encaissements, dépenses et stocks ont été calculés et figés.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handlePrintOrPdf}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shrink-0 shadow-xs"
              >
                <Download className="w-4 h-4" />
                <span>Télécharger le PDF Final</span>
              </button>
            </div>
          ) : (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start justify-between gap-3 shadow-2xs">
              <div className="flex items-start gap-3">
                <span className="p-2 bg-amber-100 text-amber-700 rounded-lg mt-0.5">
                  <Clock className="w-5 h-5 animate-pulse" />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-amber-950">
                      Rapport en cours d'enregistrement — Clôture officielle à 22:00 (10:00 ليلاً)
                    </h4>
                    <span className="text-[10px] bg-amber-200 text-amber-900 font-bold px-2 py-0.5 rounded-full font-mono">
                      Reste : {dailyData.timeRemainingFormatted}
                    </span>
                  </div>
                  <p className="text-xs text-amber-800 mt-0.5">
                    Le rapport s'actualise en temps réel avec chaque vente. Vous pouvez télécharger un aperçu provisoire à tout moment ou le rapport final à partir de 22:00.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handlePrintOrPdf}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shrink-0 shadow-xs"
              >
                <Printer className="w-4 h-4" />
                <span>Aperçu PDF (En cours)</span>
              </button>
            </div>
          )}

          {/* Cartes KPI Synthèse Journalière */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="p-3.5 bg-white border border-[#E9DCCB] rounded-xl">
              <span className="text-[11px] font-bold text-gray-500 uppercase block">Chiffre d'Affaires</span>
              <p className="text-lg font-bold font-mono text-gray-900 mt-0.5">
                {CurrencyUtil.formatDZD(dailyData.metrics.totalRevenue)}
              </p>
              <span className="text-[10px] text-gray-500 block mt-1">
                {dailyData.metrics.orderCount} tickets émis
              </span>
            </div>

            <div className="p-3.5 bg-white border border-[#E9DCCB] rounded-xl">
              <span className="text-[11px] font-bold text-gray-500 uppercase block">Coût Ingrédients</span>
              <p className="text-lg font-bold font-mono text-gray-900 mt-0.5">
                {CurrencyUtil.formatDZD(dailyData.metrics.cogs)}
              </p>
              <span className="text-[10px] text-gray-500 block mt-1">
                Coût matières consommées
              </span>
            </div>

            <div className="p-3.5 bg-white border border-[#E9DCCB] rounded-xl">
              <span className="text-[11px] font-bold text-gray-500 uppercase block">Marge Brute</span>
              <p className="text-lg font-bold font-mono text-emerald-700 mt-0.5">
                {CurrencyUtil.formatDZD(dailyData.metrics.grossMargin)}
              </p>
              <span className="text-[10px] text-emerald-600 font-bold block mt-1">
                {dailyData.metrics.marginPercent}% de marge
              </span>
            </div>

            <div className="p-3.5 bg-white border border-[#E9DCCB] rounded-xl">
              <span className="text-[11px] font-bold text-gray-500 uppercase block">Dépenses du Jour</span>
              <p className="text-lg font-bold font-mono text-red-700 mt-0.5">
                {CurrencyUtil.formatDZD(dailyData.metrics.totalExpenses)}
              </p>
              <span className="text-[10px] text-red-600 block mt-1">
                {dailyData.metrics.expensesList.length} charge(s) enregistrée(s)
              </span>
            </div>

            <div className="p-3.5 bg-[#FFF3EB]/50 border border-[#E87524]/30 rounded-xl">
              <span className="text-[11px] font-bold text-[#E87524] uppercase block">Résultat Net (Bénéfice)</span>
              <p className="text-lg font-bold font-mono text-[#E87524] mt-0.5">
                {CurrencyUtil.formatDZD(dailyData.metrics.netProfit)}
              </p>
              <span className="text-[10px] text-gray-600 block mt-1">
                Panier moyen : {CurrencyUtil.formatDZD(dailyData.metrics.averageBasket)}
              </span>
            </div>
          </div>

          {/* Grille 2 colonnes : Règlements & Caisse + Top Ventes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Règlements et tiroir caisse */}
            <div className="border border-[#E9DCCB] rounded-xl p-4 bg-white space-y-4">
              <div>
                <h4 className="text-xs font-bold text-gray-900 border-b pb-2 flex items-center justify-between">
                  <span>💳 Règlements par Mode (طرق الدفع)</span>
                  <span className="text-gray-400 font-normal text-[11px]">Dinar Algérien</span>
                </h4>
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <div className="bg-gray-50 p-2.5 rounded-lg border border-gray-100">
                    <span className="text-[11px] text-gray-500 block">Espèces (نقداً)</span>
                    <strong className="text-xs font-mono text-gray-900 block mt-0.5">
                      {CurrencyUtil.formatDZD(dailyData.metrics.paymentBreakdown.cash)}
                    </strong>
                  </div>
                  <div className="bg-gray-50 p-2.5 rounded-lg border border-gray-100">
                    <span className="text-[11px] text-gray-500 block">TPE CIB / Edahabia</span>
                    <strong className="text-xs font-mono text-gray-900 block mt-0.5">
                      {CurrencyUtil.formatDZD(dailyData.metrics.paymentBreakdown.cib_edahabia)}
                    </strong>
                  </div>
                  <div className="bg-gray-50 p-2.5 rounded-lg border border-gray-100">
                    <span className="text-[11px] text-gray-500 block">BaridiMob QR</span>
                    <strong className="text-xs font-mono text-gray-900 block mt-0.5">
                      {CurrencyUtil.formatDZD(dailyData.metrics.paymentBreakdown.baridimob)}
                    </strong>
                  </div>
                  <div className="bg-amber-50/50 p-2.5 rounded-lg border border-amber-100">
                    <span className="text-[11px] text-amber-800 block">Ventes à Crédit (دين)</span>
                    <strong className="text-xs font-mono text-amber-900 block mt-0.5">
                      {CurrencyUtil.formatDZD(dailyData.metrics.paymentBreakdown.credit)}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Solde de Caisse */}
              <div className="border-t pt-3">
                <h4 className="text-xs font-bold text-gray-900 mb-2 flex items-center gap-1.5">
                  <Coins className="w-4 h-4 text-amber-600" />
                  <span>Contrôle de Caisse (حركة الصندوق)</span>
                </h4>
                <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Fond de caisse initial :</span>
                    <span className="font-mono font-bold">{CurrencyUtil.formatDZD(dailyData.metrics.cashSummary.openingFloat)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-emerald-700">(+) Encaissements espèces :</span>
                    <span className="font-mono font-bold text-emerald-700">+{CurrencyUtil.formatDZD(dailyData.metrics.cashSummary.cashSales)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-red-700">(-) Dépenses payées en espèces :</span>
                    <span className="font-mono font-bold text-red-700">-{CurrencyUtil.formatDZD(dailyData.metrics.cashSummary.cashExpenses)}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-gray-300 font-bold">
                    <span className="text-gray-900">Solde attendu dans le tiroir :</span>
                    <span className="font-mono text-blue-700 text-sm">{CurrencyUtil.formatDZD(dailyData.metrics.cashSummary.expectedCash)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Top Pizzas & Plats */}
            <div className="border border-[#E9DCCB] rounded-xl p-4 bg-white flex flex-col justify-between">
              <div>
                <h4 className="text-xs font-bold text-gray-900 border-b pb-2 flex items-center justify-between">
                  <span>🍕 Top Pizzas & Plats Vendus Aujourd'hui</span>
                  <span className="text-gray-400 font-normal text-[11px]">{dailyData.metrics.topProducts.length} articles</span>
                </h4>
                <div className="mt-3 space-y-2 max-h-56 overflow-y-auto">
                  {dailyData.metrics.topProducts.length === 0 ? (
                    <div className="text-center py-8 text-gray-400 text-xs">
                      Aucune vente enregistrée pour cette journée
                    </div>
                  ) : (
                    dailyData.metrics.topProducts.map((p, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2 rounded-lg bg-gray-50 hover:bg-[#FFF3EB]/40 border border-gray-100 transition text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-[#E87524]/10 text-[#E87524] font-bold text-[10px] flex items-center justify-center">
                            {idx + 1}
                          </span>
                          <span className="font-medium text-gray-900">{p.name}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-bold bg-white px-2 py-0.5 rounded border border-gray-200 text-gray-800">
                            {p.quantity} {p.quantity > 1 ? 'parts/pizzas' : 'part'}
                          </span>
                          <span className="font-mono font-bold text-gray-900 w-24 text-right">
                            {CurrencyUtil.formatDZD(p.revenue)}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {dailyData.metrics.expensesList.length > 0 && (
                <div className="border-t pt-3 mt-3">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-gray-600">Total Dépenses :</span>
                    <span className="font-bold font-mono text-red-700">
                      {CurrencyUtil.formatDZD(dailyData.metrics.totalExpenses)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* SECTION 2 : RAPPORT HEBDOMADAIRE (7 JOURS) */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeReportType === 'weekly' && weeklyData && (
        <div className="space-y-4">
          {/* Cartes KPI Semaine */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="p-3.5 bg-white border border-[#E9DCCB] rounded-xl">
              <span className="text-[11px] font-bold text-gray-500 uppercase block">CA Hebdomadaire</span>
              <p className="text-lg font-bold font-mono text-gray-900 mt-0.5">
                {CurrencyUtil.formatDZD(weeklyData.metrics.totalRevenue)}
              </p>
              <span className="text-[10px] text-gray-500 block mt-1">
                {weeklyData.metrics.orderCount} commandes sur 7j
              </span>
            </div>

            <div className="p-3.5 bg-white border border-[#E9DCCB] rounded-xl">
              <span className="text-[11px] font-bold text-gray-500 uppercase block">Coût Marchandises</span>
              <p className="text-lg font-bold font-mono text-gray-900 mt-0.5">
                {CurrencyUtil.formatDZD(weeklyData.metrics.totalCogs)}
              </p>
              <span className="text-[10px] text-gray-500 block mt-1">
                Matières premières utilisées
              </span>
            </div>

            <div className="p-3.5 bg-white border border-[#E9DCCB] rounded-xl">
              <span className="text-[11px] font-bold text-gray-500 uppercase block">Marge Brute Semaine</span>
              <p className="text-lg font-bold font-mono text-emerald-700 mt-0.5">
                {CurrencyUtil.formatDZD(weeklyData.metrics.grossMargin)}
              </p>
              <span className="text-[10px] text-emerald-600 font-bold block mt-1">
                {weeklyData.metrics.marginPercent}% de marge
              </span>
            </div>

            <div className="p-3.5 bg-white border border-[#E9DCCB] rounded-xl">
              <span className="text-[11px] font-bold text-gray-500 uppercase block">Charges de la Semaine</span>
              <p className="text-lg font-bold font-mono text-red-700 mt-0.5">
                {CurrencyUtil.formatDZD(weeklyData.metrics.totalExpenses)}
              </p>
              <span className="text-[10px] text-red-600 block mt-1">
                Frais de fonctionnement
              </span>
            </div>

            <div className="p-3.5 bg-[#FFF3EB]/50 border border-[#E87524]/30 rounded-xl">
              <span className="text-[11px] font-bold text-[#E87524] uppercase block">Bénéfice Net Semaine</span>
              <p className="text-lg font-bold font-mono text-[#E87524] mt-0.5">
                {CurrencyUtil.formatDZD(weeklyData.metrics.netProfit)}
              </p>
              <span className="text-[10px] text-gray-600 block mt-1">
                Panier moyen : {CurrencyUtil.formatDZD(weeklyData.metrics.averageBasket)}
              </span>
            </div>
          </div>

          {/* Tableau des 7 jours de la semaine */}
          <div className="border border-[#E9DCCB] rounded-xl bg-white overflow-hidden shadow-2xs">
            <div className="p-3 bg-gray-50 border-b border-[#E9DCCB] flex justify-between items-center">
              <h4 className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-[#E87524]" />
                <span>Répartition Jour par Jour (جدول الأيام السبعة)</span>
              </h4>
              <span className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                ★ Meilleur Jour : {weeklyData.metrics.bestDay.dayNameFr} ({CurrencyUtil.formatDZD(weeklyData.metrics.bestDay.revenue)})
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-gray-100/70 border-b text-[11px] font-bold text-gray-600">
                  <tr>
                    <th className="p-3">Jour & Date</th>
                    <th className="p-3 text-center">Commandes</th>
                    <th className="p-3 text-right">Chiffre d'Affaires</th>
                    <th className="p-3 text-right">Charges</th>
                    <th className="p-3 text-right">Résultat Net</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {weeklyData.metrics.dailyBreakdown.map((d, idx) => (
                    <tr
                      key={idx}
                      className={`hover:bg-gray-50 transition ${
                        d.date === weeklyData.metrics.bestDay.date ? 'bg-amber-50/40 font-semibold' : ''
                      }`}
                    >
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-gray-900">{d.dayNameFr}</span>
                          <span className="text-gray-400">({d.dayNameAr})</span>
                          <span className="text-gray-500 font-mono text-[11px]">{d.date}</span>
                          {d.date === weeklyData.metrics.bestDay.date && (
                            <span className="text-[10px] bg-amber-200 text-amber-900 px-1.5 py-0.2 rounded font-bold">
                              Pic Ventes
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-3 text-center font-mono">{d.orders}</td>
                      <td className="p-3 text-right font-mono font-bold text-gray-900">
                        {CurrencyUtil.formatDZD(d.revenue)}
                      </td>
                      <td className="p-3 text-right font-mono text-red-700">
                        {CurrencyUtil.formatDZD(d.expenses)}
                      </td>
                      <td
                        className={`p-3 text-right font-mono font-bold ${
                          d.net >= 0 ? 'text-emerald-700' : 'text-red-700'
                        }`}
                      >
                        {CurrencyUtil.formatDZD(d.net)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* SECTION 3 : RAPPORT MENSUEL (BILAN DU MOIS) */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeReportType === 'monthly' && monthlyData && (
        <div className="space-y-4">
          {/* Cartes KPI Mensuel */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="p-3.5 bg-white border border-[#E9DCCB] rounded-xl">
              <span className="text-[11px] font-bold text-gray-500 uppercase block">CA Mensuel Total</span>
              <p className="text-lg font-bold font-mono text-gray-900 mt-0.5">
                {CurrencyUtil.formatDZD(monthlyData.metrics.totalRevenue)}
              </p>
              <span className="text-[10px] text-gray-500 block mt-1">
                {monthlyData.metrics.orderCount} ventes sur le mois
              </span>
            </div>

            <div className="p-3.5 bg-white border border-[#E9DCCB] rounded-xl">
              <span className="text-[11px] font-bold text-gray-500 uppercase block">Coût Global COGS</span>
              <p className="text-lg font-bold font-mono text-gray-900 mt-0.5">
                {CurrencyUtil.formatDZD(monthlyData.metrics.totalCogs)}
              </p>
              <span className="text-[10px] text-gray-500 block mt-1">
                Coût historique ingrédients
              </span>
            </div>

            <div className="p-3.5 bg-white border border-[#E9DCCB] rounded-xl">
              <span className="text-[11px] font-bold text-gray-500 uppercase block">Marge Brute Mensuelle</span>
              <p className="text-lg font-bold font-mono text-emerald-700 mt-0.5">
                {CurrencyUtil.formatDZD(monthlyData.metrics.grossMargin)}
              </p>
              <span className="text-[10px] text-emerald-600 font-bold block mt-1">
                {monthlyData.metrics.marginPercent}% taux de marge
              </span>
            </div>

            <div className="p-3.5 bg-white border border-[#E9DCCB] rounded-xl">
              <span className="text-[11px] font-bold text-gray-500 uppercase block">Charges d'Exploitation</span>
              <p className="text-lg font-bold font-mono text-red-700 mt-0.5">
                {CurrencyUtil.formatDZD(monthlyData.metrics.totalExpenses)}
              </p>
              <span className="text-[10px] text-red-600 block mt-1">
                Loyer, salaires, boîtes pizza...
              </span>
            </div>

            <div className="p-3.5 bg-[#FFF3EB]/50 border border-[#E87524]/30 rounded-xl">
              <span className="text-[11px] font-bold text-[#E87524] uppercase block">Bénéfice Net Mensuel</span>
              <p className="text-lg font-bold font-mono text-[#E87524] mt-0.5">
                {CurrencyUtil.formatDZD(monthlyData.metrics.netProfit)}
              </p>
              <span className="text-[10px] text-gray-600 block mt-1">
                Résultat net d'exercice
              </span>
            </div>
          </div>

          {/* Grille : Découpage par semaine du mois + Situation Bilan */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Semaines 1 à 4 */}
            <div className="border border-[#E9DCCB] rounded-xl p-4 bg-white">
              <h4 className="text-xs font-bold text-gray-900 border-b pb-2 flex items-center justify-between">
                <span>📊 Découpage par Semaine du Mois</span>
                <span className="text-gray-400 font-normal text-[11px]">4 Périodes</span>
              </h4>
              <div className="mt-3 space-y-2">
                {monthlyData.metrics.weeklyBreakdown.map((w, idx) => (
                  <div key={idx} className="p-2.5 rounded-lg bg-gray-50 border border-gray-100 text-xs">
                    <div className="flex justify-between items-center font-bold text-gray-900">
                      <span>{w.weekLabelFr}</span>
                      <span className="font-mono text-[#E87524]">{CurrencyUtil.formatDZD(w.revenue)}</span>
                    </div>
                    <div className="flex justify-between items-center text-[11px] text-gray-500 mt-1">
                      <span>Charges : {CurrencyUtil.formatDZD(w.expenses)}</span>
                      <span className={`font-bold ${w.net >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                        Net : {CurrencyUtil.formatDZD(w.net)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Situation Patrimoine / Stock & Dettes */}
            <div className="border border-[#E9DCCB] rounded-xl p-4 bg-white flex flex-col justify-between">
              <div>
                <h4 className="text-xs font-bold text-gray-900 border-b pb-2 flex items-center justify-between">
                  <span>🏛️ Situation Patrimoniale Fin de Mois</span>
                  <span className="text-gray-400 font-normal text-[11px]">Actif & Dettes</span>
                </h4>
                <div className="mt-3 space-y-3">
                  <div className="bg-emerald-50/50 p-3 rounded-lg border border-emerald-100">
                    <span className="text-xs text-emerald-800 font-medium block">Valeur Actif Stock Magasin :</span>
                    <strong className="text-base font-mono text-emerald-900 block mt-0.5">
                      {CurrencyUtil.formatDZD(monthlyData.metrics.inventoryValuation.totalValue)}
                    </strong>
                    <div className="text-[10px] text-emerald-700 flex justify-between mt-1 pt-1 border-t border-emerald-200">
                      <span>Ingrédients : {CurrencyUtil.formatDZD(monthlyData.metrics.inventoryValuation.ingredientsValue)}</span>
                      <span>Suppléments : {CurrencyUtil.formatDZD(monthlyData.metrics.inventoryValuation.supplementsValue)}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-amber-50/50 p-2.5 rounded-lg border border-amber-100">
                      <span className="text-[11px] text-amber-800 block">Créances Clients (Dettes)</span>
                      <strong className="text-xs font-mono text-amber-900 block mt-0.5">
                        {CurrencyUtil.formatDZD(monthlyData.metrics.debtStatus.customerTotalDebt)}
                      </strong>
                    </div>
                    <div className="bg-red-50/50 p-2.5 rounded-lg border border-red-100">
                      <span className="text-[11px] text-red-800 block">Dettes Fournisseurs</span>
                      <strong className="text-xs font-mono text-red-900 block mt-0.5">
                        {CurrencyUtil.formatDZD(monthlyData.metrics.debtStatus.supplierTotalDebt)}
                      </strong>
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t pt-3 mt-3">
                <button
                  type="button"
                  onClick={handlePrintOrPdf}
                  className="w-full py-2 bg-[#E87524] hover:bg-[#D46317] text-white rounded-lg text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition"
                >
                  <Download className="w-4 h-4" />
                  <span>Télécharger le Bilan Mensuel Complet (PDF)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* MODAL APERÇU DOCUMENT A4 (INTERACTIF) */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {showPreviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full h-[90vh] flex flex-col overflow-hidden">
            {/* Barre titre modal */}
            <div className="p-3.5 bg-gray-900 text-white flex items-center justify-between border-b border-gray-800">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-[#E87524]" />
                <h3 className="font-bold text-sm">
                  Aperçu Officiel Format A4 — {activeReportType.toUpperCase()}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownloadHtml}
                  className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded text-xs font-bold flex items-center gap-1.5 transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Sauvegarder</span>
                </button>
                <button
                  type="button"
                  onClick={handlePrintOrPdf}
                  className="px-3 py-1 bg-[#E87524] hover:bg-[#D46317] text-white rounded text-xs font-bold flex items-center gap-1.5 transition"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Imprimer / PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowPreviewModal(false)}
                  className="p-1 text-gray-400 hover:text-white rounded"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Contenu iframe de prévisualisation A4 */}
            <div className="flex-1 bg-gray-200 p-4 overflow-y-auto flex justify-center">
              <div className="bg-white shadow-lg border border-gray-300 w-full max-w-[210mm] min-h-[297mm] p-6 text-gray-900">
                <iframe
                  title="Aperçu Rapport A4"
                  srcDoc={periodicReportService.generateReportHtml(
                    activeReportType,
                    activeReportType === 'daily'
                      ? dailyData
                      : activeReportType === 'weekly'
                      ? weeklyData
                      : monthlyData,
                    store,
                    storeLogo
                  )}
                  className="w-full h-full min-h-[297mm] border-0"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
