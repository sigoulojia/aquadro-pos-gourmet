// Aquadro POS Algérie V2 — Gestion des Charges & Dépenses du Magasin
// Calculs par cycle temporel configurable par catégorie (ex: Électricité شهرياً، Gaz كل 3 أشهر...)
// Modification & Suppression de charges avec répercussion instantanée sur le tiroir de caisse

import React, { useState, useEffect, useMemo } from 'react';
import { expenseService } from '../../services/expense.service';
import { caisseService } from '../../services/caisse.service';
import { Expense, ExpenseCategory, ExpensePeriodicity } from '../../types/database';
import { CurrencyUtil } from '../../core/currency/currency';
import { useToast } from '../common/Toast';
import { useAuth } from '../../hooks/useAuth';
import {
  Wallet,
  Plus,
  Search,
  Calendar,
  X,
  CreditCard,
  Banknote,
  Edit2,
  Trash2,
  Clock,
  SlidersHorizontal,
  CheckCircle2,
  AlertTriangle,
  TrendingDown,
  Zap,
  Flame,
  Droplets,
  Building2,
  Wifi,
  Users,
  UserCheck,
  Package,
  ShoppingBag,
  Layers,
  ShoppingCart,
  PlusCircle,
  Truck,
  Wrench,
  Sparkles,
  FileText,
  MoreHorizontal,
  Filter,
  Check
} from 'lucide-react';

const PERIOD_STORAGE_KEY = 'aquadro_pos_expense_period_settings';

// Périodicités par défaut intelligentes
const DEFAULT_PERIODS: Record<ExpenseCategory, ExpensePeriodicity> = {
  RENT: 'MONTHLY',
  ELECTRICITY: 'MONTHLY',
  GAS: 'QUARTERLY', // كل 3 أشهر كالمثال المحدد
  WATER: 'QUARTERLY', // سيال Seaal
  INTERNET: 'MONTHLY',
  PACKAGING: 'MONTHLY',
  PIZZA_BOXES: 'MONTHLY',
  NAPKINS: 'MONTHLY',
  TRANSPORT: 'MONTHLY',
  MAINTENANCE: 'QUARTERLY',
  CLEANING: 'MONTHLY',
  SUPPLIES: 'MONTHLY',
  INGREDIENTS_PURCHASE: 'WEEKLY',
  SUPPLEMENTS_PURCHASE: 'WEEKLY',
  SALARY: 'MONTHLY',
  CHEF_SALARY: 'MONTHLY',
  OTHER: 'MONTHLY'
};

const PERIOD_OPTIONS: { id: ExpensePeriodicity; labelFr: string; labelAr: string; monthsDivisor: number }[] = [
  { id: 'DAILY', labelFr: 'Quotidien (1 jour)', labelAr: 'يومياً (كل يوم)', monthsDivisor: 1 / 30 },
  { id: 'WEEKLY', labelFr: 'Hebdomadaire (7 jours)', labelAr: 'أسبوعياً (كل أسبوع)', monthsDivisor: 7 / 30 },
  { id: 'MONTHLY', labelFr: 'Mensuel (1 mois)', labelAr: 'شهرياً (كل شهر)', monthsDivisor: 1 },
  { id: 'BIMONTHLY', labelFr: 'Bimestriel (2 mois)', labelAr: 'كل شهرين (2 أشهر)', monthsDivisor: 2 },
  { id: 'QUARTERLY', labelFr: 'Trimestriel (3 mois)', labelAr: 'كل 3 أشهر (ثلاثي)', monthsDivisor: 3 },
  { id: 'SEMI_ANNUAL', labelFr: 'Semestriel (6 mois)', labelAr: 'كل 6 أشهر (نصف سنوي)', monthsDivisor: 6 },
  { id: 'ANNUAL', labelFr: 'Annuel (1 an)', labelAr: 'سنوياً (كل سنة)', monthsDivisor: 12 }
];

interface CategoryMeta {
  id: ExpenseCategory;
  nameFr: string;
  nameAr: string;
  group: 'ENERGIE_FIXES' | 'PERSONNEL' | 'MATIERES' | 'EXPLOITATION';
  icon: React.ReactNode;
}

const CATEGORIES_META: CategoryMeta[] = [
  { id: 'ELECTRICITY', nameFr: 'Électricité (Sonelgaz)', nameAr: 'كهرباء (سونلغاز)', group: 'ENERGIE_FIXES', icon: <Zap className="w-4 h-4 text-amber-500" /> },
  { id: 'GAS', nameFr: 'Gaz (Sonelgaz)', nameAr: 'غاز (سونلغاز)', group: 'ENERGIE_FIXES', icon: <Flame className="w-4 h-4 text-orange-500" /> },
  { id: 'WATER', nameFr: 'Eau (Seaal)', nameAr: 'ماء (سيال)', group: 'ENERGIE_FIXES', icon: <Droplets className="w-4 h-4 text-blue-500" /> },
  { id: 'RENT', nameFr: 'Loyer Magasin', nameAr: 'إيجار المحل', group: 'ENERGIE_FIXES', icon: <Building2 className="w-4 h-4 text-stone-600" /> },
  { id: 'INTERNET', nameFr: 'Internet & Téléphone', nameAr: 'إنترنت وهاتف', group: 'ENERGIE_FIXES', icon: <Wifi className="w-4 h-4 text-indigo-500" /> },

  { id: 'SALARY', nameFr: 'Salaires du Personnel', nameAr: 'رواتب العمال', group: 'PERSONNEL', icon: <Users className="w-4 h-4 text-emerald-600" /> },
  { id: 'CHEF_SALARY', nameFr: 'Salaire Chef Pizzaiolo', nameAr: 'أجرة الشيف بيتزايولو', group: 'PERSONNEL', icon: <UserCheck className="w-4 h-4 text-emerald-700" /> },

  { id: 'PIZZA_BOXES', nameFr: 'Boîtes à Pizza', nameAr: 'علب كرتون البيتزا', group: 'MATIERES', icon: <Package className="w-4 h-4 text-amber-700" /> },
  { id: 'PACKAGING', nameFr: 'Sacs & Emballages', nameAr: 'أكياس وتغليف', group: 'MATIERES', icon: <ShoppingBag className="w-4 h-4 text-yellow-600" /> },
  { id: 'NAPKINS', nameFr: 'Serviettes & Papier', nameAr: 'مناديل ومستهلكات', group: 'MATIERES', icon: <Layers className="w-4 h-4 text-blue-400" /> },
  { id: 'INGREDIENTS_PURCHASE', nameFr: 'Achat Ingrédients', nameAr: 'شراء مكونات', group: 'MATIERES', icon: <ShoppingCart className="w-4 h-4 text-[#E87524]" /> },
  { id: 'SUPPLEMENTS_PURCHASE', nameFr: 'Achat Suppléments', nameAr: 'شراء إضافات', group: 'MATIERES', icon: <PlusCircle className="w-4 h-4 text-orange-600" /> },

  { id: 'TRANSPORT', nameFr: 'Transport & Carburant', nameAr: 'النقل والوقود', group: 'EXPLOITATION', icon: <Truck className="w-4 h-4 text-cyan-600" /> },
  { id: 'MAINTENANCE', nameFr: 'Entretien & Réparations', nameAr: 'الصيانة والتصليح', group: 'EXPLOITATION', icon: <Wrench className="w-4 h-4 text-stone-500" /> },
  { id: 'CLEANING', nameFr: 'Nettoyage & Hygiène', nameAr: 'مواد التنظيف', group: 'EXPLOITATION', icon: <Sparkles className="w-4 h-4 text-teal-500" /> },
  { id: 'SUPPLIES', nameFr: 'Fournitures de Caisse', nameAr: 'لوازم كاشير ومكتب', group: 'EXPLOITATION', icon: <FileText className="w-4 h-4 text-gray-500" /> },
  { id: 'OTHER', nameFr: 'Autre Dépense', nameAr: 'مصاريف أخرى', group: 'EXPLOITATION', icon: <MoreHorizontal className="w-4 h-4 text-gray-400" /> }
];

export const ExpensesView: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'CALCULATIONS' | 'JOURNAL'>('CALCULATIONS');
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [search, setSearch] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [periodFilter, setPeriodFilter] = useState<'ALL' | 'TODAY' | 'WEEK' | 'MONTH' | 'QUARTER' | 'YEAR'>('ALL');

  // Modals
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [showEditModal, setShowEditModal] = useState<boolean>(false);
  const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);

  // Périodicités configurées par l'utilisateur pour chaque catégorie
  const [categoryPeriods, setCategoryPeriods] = useState<Record<ExpenseCategory, ExpensePeriodicity>>(() => {
    try {
      const saved = localStorage.getItem(PERIOD_STORAGE_KEY);
      if (saved) {
        return { ...DEFAULT_PERIODS, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.warn('Erreur chargement périodicités:', e);
    }
    return DEFAULT_PERIODS;
  });

  // Formulaire d'ajout
  const [formData, setFormData] = useState({
    category: 'ELECTRICITY' as ExpenseCategory,
    amount: 3500,
    paymentMethod: 'CASH' as 'CASH' | 'BANK',
    description: '',
    date: new Date().toISOString().split('T')[0]
  });

  // Édition
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editFormData, setEditFormData] = useState({
    category: 'ELECTRICITY' as ExpenseCategory,
    amount: 0,
    paymentMethod: 'CASH' as 'CASH' | 'BANK',
    description: '',
    date: ''
  });

  // Suppression
  const [deletingExpense, setDeletingExpense] = useState<Expense | null>(null);

  useEffect(() => {
    loadExpenses();
  }, []);

  const loadExpenses = async () => {
    try {
      const list = await expenseService.getExpenses(1000);
      setExpenses(list);
    } catch (err: any) {
      console.error('Erreur chargement dépenses:', err);
      showToast('Impossible de charger les dépenses', 'error');
    }
  };

  // Mettre à jour et sauvegarder la périodicité d'une catégorie
  const handleUpdateCategoryPeriod = (category: ExpenseCategory, newPeriod: ExpensePeriodicity) => {
    const updated = { ...categoryPeriods, [category]: newPeriod };
    setCategoryPeriods(updated);
    try {
      localStorage.setItem(PERIOD_STORAGE_KEY, JSON.stringify(updated));
      const periodLabel = PERIOD_OPTIONS.find(p => p.id === newPeriod)?.labelAr || newPeriod;
      showToast(`تم تعيين دورة الحساب إلى: ${periodLabel}`, 'success');
    } catch (e) {
      console.warn('Erreur sauvegarde localStorage:', e);
    }
  };

  // Calcul des bornes de dates d'une périodicité
  const getPeriodBounds = (period: ExpensePeriodicity, refDate: Date = new Date()) => {
    const year = refDate.getFullYear();
    const month = refDate.getMonth();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const format = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    switch (period) {
      case 'DAILY': {
        const todayStr = format(refDate);
        return {
          start: todayStr,
          end: todayStr,
          labelFr: "Aujourd'hui",
          labelAr: 'اليوم'
        };
      }
      case 'WEEKLY': {
        const dayOfWeek = refDate.getDay();
        const diffToMonday = refDate.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1);
        const monday = new Date(year, month, diffToMonday);
        const sunday = new Date(year, month, diffToMonday + 6);
        return {
          start: format(monday),
          end: format(sunday),
          labelFr: 'Cette Semaine',
          labelAr: 'هذا الأسبوع'
        };
      }
      case 'MONTHLY': {
        const first = new Date(year, month, 1);
        const last = new Date(year, month + 1, 0);
        const monthNamesFr = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
        const monthNamesAr = ['جانفي', 'فيفري', 'مارس', 'أفريل', 'ماي', 'جوان', 'جويلية', 'أوت', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
        return {
          start: format(first),
          end: format(last),
          labelFr: `${monthNamesFr[month]} ${year}`,
          labelAr: `${monthNamesAr[month]} ${year}`
        };
      }
      case 'BIMONTHLY': {
        const bIdx = Math.floor(month / 2);
        const startM = bIdx * 2;
        const endM = startM + 1;
        const first = new Date(year, startM, 1);
        const last = new Date(year, endM + 1, 0);
        return {
          start: format(first),
          end: format(last),
          labelFr: `Bimestre ${bIdx + 1} (${startM + 1}-${endM + 1}/${year})`,
          labelAr: `شهرين ${bIdx + 1} (${year})`
        };
      }
      case 'QUARTERLY': {
        const qIdx = Math.floor(month / 3);
        const startM = qIdx * 3;
        const endM = startM + 2;
        const first = new Date(year, startM, 1);
        const last = new Date(year, endM + 1, 0);
        return {
          start: format(first),
          end: format(last),
          labelFr: `Trimestre ${qIdx + 1} (T${qIdx + 1} ${year})`,
          labelAr: `الثلاثي ${qIdx + 1} (3 أشهر ${year})`
        };
      }
      case 'SEMI_ANNUAL': {
        const sIdx = month < 6 ? 0 : 1;
        const startM = sIdx * 6;
        const endM = startM + 5;
        const first = new Date(year, startM, 1);
        const last = new Date(year, endM + 1, 0);
        return {
          start: format(first),
          end: format(last),
          labelFr: `Semestre ${sIdx + 1} (${year})`,
          labelAr: `السداسي ${sIdx + 1} (6 أشهر ${year})`
        };
      }
      case 'ANNUAL': {
        const first = new Date(year, 0, 1);
        const last = new Date(year, 11, 31);
        return {
          start: format(first),
          end: format(last),
          labelFr: `Année ${year}`,
          labelAr: `سنة ${year}`
        };
      }
    }
  };

  // Calculs par catégorie selon la périodicité configurée
  const categoryStats = useMemo(() => {
    const today = new Date();
    return CATEGORIES_META.map(meta => {
      const period = categoryPeriods[meta.id] || DEFAULT_PERIODS[meta.id] || 'MONTHLY';
      const bounds = getPeriodBounds(period, today);
      const periodOpt = PERIOD_OPTIONS.find(p => p.id === period) || PERIOD_OPTIONS[2];

      const allCatExpenses = expenses.filter(e => e.category === meta.id);

      // Dépenses dans la période active
      const inPeriod = allCatExpenses.filter(e => e.date >= bounds.start && e.date <= bounds.end);
      const totalInPeriod = inPeriod.reduce((sum, e) => sum + (e.amount || 0), 0);
      const countInPeriod = inPeriod.length;

      // Dernier paiement enregistré
      const sorted = [...allCatExpenses].sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at));
      const lastExpense = sorted.length > 0 ? sorted[0] : null;

      // Coût mensuel équivalent
      const monthlyEquivalent = totalInPeriod > 0
        ? Math.round(totalInPeriod / (periodOpt.monthsDivisor || 1))
        : (lastExpense ? Math.round(lastExpense.amount / (periodOpt.monthsDivisor || 1)) : 0);

      return {
        ...meta,
        period,
        periodOpt,
        bounds,
        totalInPeriod,
        countInPeriod,
        lastExpense,
        monthlyEquivalent,
        totalAllTime: allCatExpenses.reduce((sum, e) => sum + (e.amount || 0), 0),
        totalCountAllTime: allCatExpenses.length
      };
    });
  }, [expenses, categoryPeriods]);

  // Statistiques globales
  const globalSummary = useMemo(() => {
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const curMonthPrefix = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;

    let thisMonthTotal = 0;
    let cashTotal = 0;
    let bankTotal = 0;

    for (const e of expenses) {
      if (e.date.startsWith(curMonthPrefix)) {
        thisMonthTotal += e.amount || 0;
        if (e.payment_method === 'CASH') cashTotal += e.amount || 0;
        else bankTotal += e.amount || 0;
      }
    }

    // Coût mensuel récurrent total estimé
    const estimatedMonthlyBaseline = categoryStats.reduce((sum, c) => sum + c.monthlyEquivalent, 0);

    return {
      thisMonthTotal,
      cashTotal,
      bankTotal,
      estimatedMonthlyBaseline,
      totalExpensesCount: expenses.length
    };
  }, [expenses, categoryStats]);

  // Filtrage du journal
  const filteredExpenses = useMemo(() => {
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

    return expenses.filter(e => {
      // Filtre catégorie
      if (categoryFilter !== 'ALL' && e.category !== categoryFilter) return false;

      // Filtre période
      if (periodFilter === 'TODAY' && e.date !== todayStr) return false;
      if (periodFilter === 'MONTH' && !e.date.startsWith(`${now.getFullYear()}-${pad(now.getMonth() + 1)}`)) return false;
      if (periodFilter === 'YEAR' && !e.date.startsWith(`${now.getFullYear()}-`)) return false;
      if (periodFilter === 'QUARTER') {
        const bounds = getPeriodBounds('QUARTERLY', now);
        if (e.date < bounds.start || e.date > bounds.end) return false;
      }
      if (periodFilter === 'WEEK') {
        const bounds = getPeriodBounds('WEEKLY', now);
        if (e.date < bounds.start || e.date > bounds.end) return false;
      }

      // Recherche texte
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const meta = CATEGORIES_META.find(m => m.id === e.category);
        const nameFr = meta?.nameFr.toLowerCase() || '';
        const nameAr = meta?.nameAr.toLowerCase() || '';
        const desc = (e.description || '').toLowerCase();
        return desc.includes(q) || nameFr.includes(q) || nameAr.includes(q) || e.amount.toString().includes(q);
      }

      return true;
    });
  }, [expenses, categoryFilter, periodFilter, search]);

  const totalFilteredAmount = useMemo(() => {
    return filteredExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  }, [filteredExpenses]);

  // Création
  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      const activeSession = await caisseService.getActiveSession();
      await expenseService.createExpense({
        category: formData.category,
        amount: formData.amount,
        paymentMethod: formData.paymentMethod,
        description: formData.description,
        date: formData.date,
        userId: user.id,
        userName: user.name,
        sessionId: activeSession?.id
      });

      showToast(`Charge de ${CurrencyUtil.formatDZD(formData.amount)} enregistrée avec succès`, 'success');
      setShowAddModal(false);
      setFormData({
        category: 'ELECTRICITY',
        amount: 3500,
        paymentMethod: 'CASH',
        description: '',
        date: new Date().toISOString().split('T')[0]
      });
      await loadExpenses();
    } catch (err: any) {
      showToast(`Erreur : ${err.message}`, 'error');
    }
  };

  // Démarrer la modification
  const handleOpenEdit = (expense: Expense) => {
    setEditingExpense(expense);
    setEditFormData({
      category: expense.category,
      amount: expense.amount,
      paymentMethod: expense.payment_method,
      description: expense.description,
      date: expense.date
    });
    setShowEditModal(true);
  };

  // Valider la modification
  const handleConfirmEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingExpense) return;

    try {
      await expenseService.updateExpense(editingExpense.id, {
        category: editFormData.category,
        amount: editFormData.amount,
        paymentMethod: editFormData.paymentMethod,
        description: editFormData.description,
        date: editFormData.date
      });

      showToast('Dépense mise à jour avec succès', 'success');
      setShowEditModal(false);
      setEditingExpense(null);
      await loadExpenses();
    } catch (err: any) {
      showToast(`Erreur de modification : ${err.message}`, 'error');
    }
  };

  // Démarrer la suppression
  const handleOpenDelete = (expense: Expense) => {
    setDeletingExpense(expense);
    setShowDeleteModal(true);
  };

  // Valider la suppression
  const handleConfirmDelete = async () => {
    if (!deletingExpense) return;

    try {
      await expenseService.deleteExpense(deletingExpense.id);
      showToast('Dépense supprimée et caisse actualisée avec succès', 'success');
      setShowDeleteModal(false);
      setDeletingExpense(null);
      await loadExpenses();
    } catch (err: any) {
      showToast(`Erreur de suppression : ${err.message}`, 'error');
    }
  };

  const getCategoryInfo = (cat: ExpenseCategory) => {
    return CATEGORIES_META.find(m => m.id === cat) || {
      id: cat,
      nameFr: cat,
      nameAr: cat,
      group: 'EXPLOITATION' as const,
      icon: <MoreHorizontal className="w-4 h-4 text-stone-500" />
    };
  };

  return (
    <div className="flex-1 bg-stone-100 p-4 flex flex-col overflow-hidden text-xs select-none">
      {/* Barre d'outils supérieure */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-3 gap-2.5">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#FFF4EB] border border-[#FCD5B5] flex items-center justify-center text-[#E87524]">
              <Wallet className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-black text-stone-900 flex items-center gap-2">
                Charges & Dépenses du Magasin
                <span className="text-xs font-arabic font-normal text-stone-500" dir="rtl">
                  (المصاريف وتكاليف التشغيل)
                </span>
              </h2>
              <span className="text-[11px] text-stone-500">
                Calculs dynamiques par cycle personnalisé (Sonelgaz Gaz كل 3 أشهر، الكهرباء شهرياً...)
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end md:self-auto">
          {/* Sélecteur d'onglets */}
          <div className="flex items-center bg-white p-1 rounded-xl border border-stone-300 shadow-xs">
            <button
              type="button"
              onClick={() => setActiveTab('CALCULATIONS')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'CALCULATIONS'
                  ? 'bg-[#E87524] text-white shadow-xs'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-stone-50'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Calculs & Périodicités (الحسابات والدورات)</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('JOURNAL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'JOURNAL'
                  ? 'bg-[#E87524] text-white shadow-xs'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-stone-50'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Journal & Actions (سجل وتعديل المصاريف)</span>
            </button>
          </div>

          {/* Bouton Nouvelle Dépense */}
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold shadow-sm transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Nouvelle Dépense</span>
          </button>
        </div>
      </div>

      {/* Cartes KPI Globales */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pb-3">
        <div className="bg-white p-3 rounded-xl border border-stone-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-stone-500 uppercase tracking-wider block">Ce Mois (Novembre)</span>
            <strong className="text-base font-black font-mono text-red-600 block mt-0.5">
              -{CurrencyUtil.formatDZD(globalSummary.thisMonthTotal)}
            </strong>
          </div>
          <div className="w-8 h-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center">
            <TrendingDown className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white p-3 rounded-xl border border-stone-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-stone-500 uppercase tracking-wider block">Payé en Espèces (Caisse)</span>
            <strong className="text-base font-black font-mono text-stone-800 block mt-0.5">
              {CurrencyUtil.formatDZD(globalSummary.cashTotal)}
            </strong>
          </div>
          <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
            <Banknote className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white p-3 rounded-xl border border-stone-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-stone-500 uppercase tracking-wider block">Payé Banque / Chèque</span>
            <strong className="text-base font-black font-mono text-stone-800 block mt-0.5">
              {CurrencyUtil.formatDZD(globalSummary.bankTotal)}
            </strong>
          </div>
          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
            <CreditCard className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-[#FFF8EF] p-3 rounded-xl border border-[#FCD5B5] shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-orange-800 uppercase tracking-wider block">
              Coût Mensuel Récurrent
            </span>
            <strong className="text-base font-black font-mono text-[#E87524] block mt-0.5">
              ~{CurrencyUtil.formatDZD(globalSummary.estimatedMonthlyBaseline)}
            </strong>
            <span className="text-[9px] text-stone-500 block">estimé selon vos périodicités</span>
          </div>
          <div className="w-8 h-8 rounded-lg bg-[#FFE7D1] text-[#E87524] flex items-center justify-center">
            <SlidersHorizontal className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* CONTENU PRINCIPAL SELON ONGLET */}
      {activeTab === 'CALCULATIONS' ? (
        /* VUE 1 : CALCULS & PÉRIODICITÉS PAR CATÉGORIE */
        <div className="flex-1 bg-white border border-stone-200 rounded-xl overflow-hidden flex flex-col shadow-xs">
          {/* Bandeau d'information utilisateur */}
          <div className="p-3 border-b border-stone-200 bg-amber-50/60 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="p-1 rounded bg-[#E87524] text-white">
                <Clock className="w-4 h-4" />
              </span>
              <div>
                <strong className="text-stone-900 block text-xs">
                  Configuration des Cycles & Périodes de Calcul par Catégorie
                </strong>
                <span className="text-[11px] text-stone-600">
                  اختر الدورة الزمنية لكل صنف (شهرياً للكهرباء، كل 3 أشهر للغاز، أسبوعياً للمواد...). الحسابات تتجدد فوراً وتُحفظ تلقائياً.
                </span>
              </div>
            </div>
            <span className="text-[11px] font-bold font-mono text-[#E87524] bg-white px-2.5 py-1 rounded-lg border border-orange-200 whitespace-nowrap">
              {CATEGORIES_META.length} catégories configurables
            </span>
          </div>

          {/* Grille des catégories */}
          <div className="flex-1 overflow-y-auto p-3">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {categoryStats.map(stat => (
                <div
                  key={stat.id}
                  className="bg-white border border-stone-200 hover:border-[#E87524]/60 rounded-xl p-3.5 flex flex-col justify-between shadow-xs transition-all hover:shadow-sm"
                >
                  {/* Titre & Icône */}
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-stone-100 flex items-center justify-center">
                          {stat.icon}
                        </div>
                        <div>
                          <strong className="text-stone-900 text-xs block leading-tight">{stat.nameFr}</strong>
                          <span className="text-[10px] text-stone-500 font-arabic block" dir="rtl">
                            {stat.nameAr}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Sélecteur de périodicité cliquable */}
                    <div className="mt-2.5 pt-2 border-t border-stone-100">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-bold text-stone-500 uppercase tracking-wider">
                          Périodicité de Calcul :
                        </span>
                        <span className="text-[10px] font-arabic font-bold text-[#E87524]">
                          الدورة المحددة
                        </span>
                      </div>
                      <select
                        value={stat.period}
                        onChange={e => handleUpdateCategoryPeriod(stat.id, e.target.value as ExpensePeriodicity)}
                        className="w-full bg-[#FFF8EF] border border-[#FCD5B5] hover:border-[#E87524] text-[#E87524] font-bold rounded-lg px-2 py-1 text-xs focus:ring-1 focus:ring-[#E87524] cursor-pointer transition-colors"
                      >
                        {PERIOD_OPTIONS.map(opt => (
                          <option key={opt.id} value={opt.id}>
                            {opt.labelFr} — {opt.labelAr}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Résultats de calcul pour la période en cours */}
                    <div className="mt-3 p-2.5 bg-stone-50 rounded-xl border border-stone-200/70 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-stone-500 font-medium">Période active :</span>
                        <span className="font-bold text-stone-800 text-[10px]">
                          {stat.bounds.labelFr}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-stone-700">Dépensé dans la période :</span>
                        <span className={`font-mono font-black text-sm ${stat.totalInPeriod > 0 ? 'text-red-600' : 'text-stone-400'}`}>
                          {stat.totalInPeriod > 0 ? `-${CurrencyUtil.formatDZD(stat.totalInPeriod)}` : '0 DA'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-stone-500 pt-1 border-t border-stone-200/60">
                        <span>Paiements enregistrés :</span>
                        <span className="font-mono font-bold text-stone-700">
                          {stat.countInPeriod} versement{stat.countInPeriod > 1 ? 's' : ''}
                        </span>
                      </div>

                      {stat.monthlyEquivalent > 0 && stat.period !== 'MONTHLY' && (
                        <div className="flex items-center justify-between text-[10px] text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded">
                          <span>Équivalent Mensuel :</span>
                          <span className="font-mono font-bold">~{CurrencyUtil.formatDZD(stat.monthlyEquivalent)} / mois</span>
                        </div>
                      )}
                    </div>

                    {/* Dernier paiement enregistré */}
                    <div className="mt-2 text-[10px] text-stone-500">
                      {stat.lastExpense ? (
                        <div className="flex items-center justify-between">
                          <span>Dernier paiement : <strong className="font-mono text-stone-700">{stat.lastExpense.date}</strong></span>
                          <span className="font-mono font-bold text-stone-800">
                            {CurrencyUtil.formatDZD(stat.lastExpense.amount)}
                          </span>
                        </div>
                      ) : (
                        <span className="italic text-stone-400">Aucun paiement enregistré pour le moment.</span>
                      )}
                    </div>
                  </div>

                  {/* Actions rapides */}
                  <div className="mt-3 pt-2.5 border-t border-stone-100 flex items-center justify-between gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setCategoryFilter(stat.id);
                        setActiveTab('JOURNAL');
                      }}
                      className="flex-1 py-1 px-2 rounded-lg bg-white border border-stone-200 hover:bg-stone-50 text-stone-700 font-bold text-[10px] text-center transition-colors cursor-pointer"
                    >
                      Voir Journal ({stat.totalCountAllTime})
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFormData(prev => ({ ...prev, category: stat.id }));
                        setShowAddModal(true);
                      }}
                      className="py-1 px-2 rounded-lg bg-[#E87524] hover:bg-[#D46317] text-white font-bold text-[10px] flex items-center gap-1 transition-colors cursor-pointer"
                      title="Enregistrer un nouveau paiement pour cette catégorie"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Payer</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* VUE 2 : JOURNAL DES DÉPENSES & MODIFICATION / SUPPRESSION */
        <div className="flex-1 bg-white border border-stone-200 rounded-xl overflow-hidden flex flex-col shadow-xs">
          {/* Barre de filtres */}
          <div className="p-2.5 border-b border-stone-200 bg-stone-50 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-1 min-w-[240px] max-w-md">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Rechercher par description, montant ou catégorie..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full bg-white border border-stone-300 rounded-lg pl-8 pr-3 py-1.5 text-xs text-stone-900 focus:outline-none focus:border-[#E87524]"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Filtre Catégorie */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-stone-500 font-bold uppercase">Catégorie:</span>
                <select
                  value={categoryFilter}
                  onChange={e => setCategoryFilter(e.target.value)}
                  className="bg-white border border-stone-300 rounded-lg px-2 py-1 text-xs text-stone-800 font-medium focus:ring-1 focus:ring-[#E87524]"
                >
                  <option value="ALL">Toutes les catégories ({expenses.length})</option>
                  {CATEGORIES_META.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.nameFr} — {m.nameAr}
                    </option>
                  ))}
                </select>
              </div>

              {/* Filtre Période */}
              <div className="flex items-center gap-1">
                {(['ALL', 'TODAY', 'WEEK', 'MONTH', 'QUARTER', 'YEAR'] as const).map(pKey => {
                  const labels: Record<string, string> = {
                    ALL: 'Toutes',
                    TODAY: "Aujourd'hui",
                    WEEK: 'Semaine',
                    MONTH: 'Ce Mois',
                    QUARTER: '3 Mois',
                    YEAR: 'Année'
                  };
                  const isSel = periodFilter === pKey;
                  return (
                    <button
                      key={pKey}
                      type="button"
                      onClick={() => setPeriodFilter(pKey)}
                      className={`px-2 py-1 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                        isSel
                          ? 'bg-[#E87524] text-white shadow-xs'
                          : 'bg-white border border-stone-200 text-stone-600 hover:bg-stone-100'
                      }`}
                    >
                      {labels[pKey]}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Tableau */}
          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-stone-50 border-b border-stone-200 text-stone-600 text-[11px] sticky top-0 z-10 font-bold">
                <tr>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Catégorie & Périodicité</th>
                  <th className="py-2.5 px-3">Motif / Description</th>
                  <th className="py-2.5 px-3 text-center">Règlement</th>
                  <th className="py-2.5 px-3">Opérateur</th>
                  <th className="py-2.5 px-3 text-right">Montant (DA)</th>
                  <th className="py-2.5 px-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {filteredExpenses.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-stone-400 italic">
                      <div className="flex flex-col items-center justify-center gap-1.5">
                        <Wallet className="w-6 h-6 text-stone-300" />
                        <span>Aucune dépense ne correspond aux critères de sélection.</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredExpenses.map(e => {
                    const meta = getCategoryInfo(e.category);
                    const period = categoryPeriods[e.category] || 'MONTHLY';
                    const periodLabel = PERIOD_OPTIONS.find(p => p.id === period)?.labelAr || period;

                    return (
                      <tr key={e.id} className="hover:bg-amber-50/40 transition-colors">
                        {/* Date */}
                        <td className="py-2.5 px-3 font-mono text-stone-700 font-bold text-[11px]">
                          {e.date}
                        </td>

                        {/* Catégorie */}
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-1.5">
                            {meta.icon}
                            <div>
                              <strong className="text-stone-900 block leading-tight">{meta.nameFr}</strong>
                              <span className="text-[10px] text-[#E87524] font-arabic block font-bold" dir="rtl">
                                {meta.nameAr} ({periodLabel})
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Motif */}
                        <td className="py-2.5 px-3 text-stone-800 font-medium max-w-xs truncate">
                          {e.description}
                        </td>

                        {/* Règlement */}
                        <td className="py-2.5 px-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold inline-flex items-center gap-1 ${
                            e.payment_method === 'CASH'
                              ? 'bg-amber-50 text-amber-800 border border-amber-200'
                              : 'bg-blue-50 text-blue-800 border border-blue-200'
                          }`}>
                            {e.payment_method === 'CASH' ? (
                              <>
                                <Banknote className="w-3 h-3 text-amber-600" />
                                <span>Espèces (Caisse)</span>
                              </>
                            ) : (
                              <>
                                <CreditCard className="w-3 h-3 text-blue-600" />
                                <span>Banque</span>
                              </>
                            )}
                          </span>
                        </td>

                        {/* Opérateur */}
                        <td className="py-2.5 px-3 text-stone-500 font-mono text-[11px]">
                          {e.user_name || 'Caissier'}
                        </td>

                        {/* Montant */}
                        <td className="py-2.5 px-3 text-right font-mono font-black text-sm text-red-600 whitespace-nowrap">
                          -{CurrencyUtil.formatDZD(e.amount)}
                        </td>

                        {/* Actions : Modifier & Supprimer */}
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(e)}
                              className="p-1.5 rounded-lg bg-stone-100 hover:bg-blue-50 text-stone-600 hover:text-blue-600 transition-colors cursor-pointer"
                              title="Modifier cette dépense"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenDelete(e)}
                              className="p-1.5 rounded-lg bg-stone-100 hover:bg-red-50 text-stone-600 hover:text-red-600 transition-colors cursor-pointer"
                              title="Supprimer cette dépense"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {filteredExpenses.length > 0 && (
                <tfoot className="sticky bottom-0 z-10">
                  <tr className="bg-amber-50/95 backdrop-blur-xs font-bold border-t-2 border-amber-300 text-stone-900 shadow-sm">
                    <td className="py-2.5 px-3 font-black uppercase text-xs" colSpan={5}>
                      <div className="flex items-center gap-2">
                        <span className="text-[#E87524] font-black">Total Général Dépenses</span>
                        <span className="text-[10px] font-normal text-stone-600">
                          ({filteredExpenses.length} dépense{filteredExpenses.length > 1 ? 's' : ''})
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-black text-sm text-red-600">
                      -{CurrencyUtil.formatDZD(totalFilteredAmount)}
                    </td>
                    <td className="py-2.5 px-3"></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* MODAL : AJOUTER UNE DÉPENSE */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white border border-[#E9DCCB] rounded-2xl shadow-2xl max-w-md w-full overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-[#E9DCCB] bg-[#FFF8EF] flex items-center justify-between">
              <div>
                <h3 className="font-black text-sm text-[#292522] flex items-center gap-2">
                  <Plus className="w-4 h-4 text-[#E87524]" />
                  Enregistrer une Dépense (تسجيل مصروف)
                </h3>
                <p className="text-[11px] text-stone-500 mt-0.5">
                  Saisie d'une charge d'exploitation avec déduction automatique si payée en espèces.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="w-7 h-7 rounded-lg bg-white border border-[#E9DCCB] hover:bg-stone-100 flex items-center justify-center text-stone-500 hover:text-stone-800 transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <form onSubmit={handleCreateExpense} className="p-5 space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-stone-700 block mb-1">
                    Catégorie *
                  </label>
                  <select
                    value={formData.category}
                    onChange={e => setFormData({ ...formData, category: e.target.value as ExpenseCategory })}
                    className="w-full bg-white border border-stone-300 rounded-xl px-2.5 py-2 text-xs text-stone-900 font-medium focus:ring-1 focus:ring-[#E87524]"
                  >
                    <optgroup label="Énergie & Fixes">
                      <option value="ELECTRICITY">Électricité (Sonelgaz)</option>
                      <option value="GAS">Gaz (Sonelgaz)</option>
                      <option value="WATER">Eau (Seaal)</option>
                      <option value="RENT">Loyer Local</option>
                      <option value="INTERNET">Internet / Téléphone</option>
                    </optgroup>
                    <optgroup label="Matières & Emballages">
                      <option value="PIZZA_BOXES">Boîtes à Pizza</option>
                      <option value="PACKAGING">Sacs & Emballages</option>
                      <option value="NAPKINS">Serviettes & Papier</option>
                      <option value="INGREDIENTS_PURCHASE">Achat Ingrédients</option>
                      <option value="SUPPLEMENTS_PURCHASE">Achat Suppléments</option>
                    </optgroup>
                    <optgroup label="Personnel">
                      <option value="CHEF_SALARY">Salaire Cuisinier/Chefs</option>
                      <option value="SALARY">Salaires du Personnel</option>
                    </optgroup>
                    <optgroup label="Exploitation">
                      <option value="TRANSPORT">Frais de Transport</option>
                      <option value="MAINTENANCE">Maintenance & Réparations</option>
                      <option value="CLEANING">Nettoyage & Hygiène</option>
                      <option value="SUPPLIES">Fournitures Diverses</option>
                      <option value="OTHER">Autre Dépense</option>
                    </optgroup>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-stone-700 block mb-1">
                    Date du Paiement *
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.date}
                    onChange={e => setFormData({ ...formData, date: e.target.value })}
                    className="w-full bg-white border border-stone-300 rounded-xl px-2.5 py-2 font-mono text-xs text-stone-900 focus:outline-none focus:ring-1 focus:ring-[#E87524]"
                  />
                </div>
              </div>

              {/* Montant avec raccourcis tactiles */}
              <div>
                <label className="text-xs font-bold text-stone-700 block mb-1">
                  Montant en Dinars (DA) *
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  step="50"
                  value={formData.amount}
                  onChange={e => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-white border border-stone-300 rounded-xl px-3 py-2 font-mono text-base font-black text-red-600 focus:outline-none focus:border-[#E87524]"
                />
                {/* Raccourcis tactiles */}
                <div className="flex items-center gap-1.5 mt-1.5">
                  {[500, 1000, 2000, 5000, 10000].map(val => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, amount: (prev.amount || 0) + val }))}
                      className="px-2 py-1 bg-stone-100 hover:bg-stone-200 rounded-lg text-[10px] font-mono font-bold text-stone-700 cursor-pointer active:scale-95"
                    >
                      +{val}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, amount: 0 }))}
                    className="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-[10px] font-bold ml-auto cursor-pointer"
                  >
                    Effacer
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-stone-700 block mb-1">
                  Mode de Règlement *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, paymentMethod: 'CASH' })}
                    className={`py-2 px-3 rounded-xl border flex items-center justify-center gap-1.5 font-bold text-xs transition-all cursor-pointer ${
                      formData.paymentMethod === 'CASH'
                        ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                        : 'bg-white border-stone-300 text-stone-700 hover:bg-stone-50'
                    }`}
                  >
                    <Banknote className="w-4 h-4" />
                    <span>Espèces (Tiroir Caisse)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, paymentMethod: 'BANK' })}
                    className={`py-2 px-3 rounded-xl border flex items-center justify-center gap-1.5 font-bold text-xs transition-all cursor-pointer ${
                      formData.paymentMethod === 'BANK'
                        ? 'bg-blue-600 text-white border-blue-700 shadow-xs'
                        : 'bg-white border-stone-300 text-stone-700 hover:bg-stone-50'
                    }`}
                  >
                    <CreditCard className="w-4 h-4" />
                    <span>Banque / Virement</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-stone-700 block mb-1">
                  Description / Justificatif *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Facture Sonelgaz 3ème Trimestre, Facture Eau Seaal..."
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  className="w-full bg-white border border-stone-300 rounded-xl px-3 py-2 text-xs text-stone-900 focus:outline-none focus:border-[#E87524]"
                />
              </div>

              <div className="pt-3 border-t border-[#E9DCCB] flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-stone-300 text-stone-600 hover:bg-stone-50 rounded-xl transition font-medium text-xs cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition font-bold text-xs shadow-sm flex items-center gap-1.5 active:scale-95 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Enregistrer la Dépense</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL : MODIFIER UNE DÉPENSE */}
      {showEditModal && editingExpense && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white border border-[#E9DCCB] rounded-2xl shadow-2xl max-w-md w-full overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-[#E9DCCB] bg-blue-50 flex items-center justify-between">
              <div>
                <h3 className="font-black text-sm text-blue-950 flex items-center gap-2">
                  <Edit2 className="w-4 h-4 text-blue-600" />
                  Modifier la Dépense (تعديل المصروف)
                </h3>
                <p className="text-[11px] text-blue-700/80 mt-0.5">
                  Actualise l'historique et recalcule automatiquement le tiroir de caisse.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                className="w-7 h-7 rounded-lg bg-white border border-blue-200 hover:bg-blue-100 flex items-center justify-center text-blue-800 transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <form onSubmit={handleConfirmEdit} className="p-5 space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-stone-700 block mb-1">
                    Catégorie *
                  </label>
                  <select
                    value={editFormData.category}
                    onChange={e => setEditFormData({ ...editFormData, category: e.target.value as ExpenseCategory })}
                    className="w-full bg-white border border-stone-300 rounded-xl px-2.5 py-2 text-xs text-stone-900 font-medium focus:ring-1 focus:ring-blue-600"
                  >
                    <optgroup label="Énergie & Fixes">
                      <option value="ELECTRICITY">Électricité (Sonelgaz)</option>
                      <option value="GAS">Gaz (Sonelgaz)</option>
                      <option value="WATER">Eau (Seaal)</option>
                      <option value="RENT">Loyer Local</option>
                      <option value="INTERNET">Internet / Téléphone</option>
                    </optgroup>
                    <optgroup label="Matières & Emballages">
                      <option value="PIZZA_BOXES">Boîtes à Pizza</option>
                      <option value="PACKAGING">Sacs & Emballages</option>
                      <option value="NAPKINS">Serviettes & Papier</option>
                      <option value="INGREDIENTS_PURCHASE">Achat Ingrédients</option>
                      <option value="SUPPLEMENTS_PURCHASE">Achat Suppléments</option>
                    </optgroup>
                    <optgroup label="Personnel">
                      <option value="CHEF_SALARY">Salaire Cuisinier/Chefs</option>
                      <option value="SALARY">Salaires du Personnel</option>
                    </optgroup>
                    <optgroup label="Exploitation">
                      <option value="TRANSPORT">Frais de Transport</option>
                      <option value="MAINTENANCE">Maintenance & Réparations</option>
                      <option value="CLEANING">Nettoyage & Hygiène</option>
                      <option value="SUPPLIES">Fournitures Diverses</option>
                      <option value="OTHER">Autre Dépense</option>
                    </optgroup>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-stone-700 block mb-1">
                    Date du Paiement *
                  </label>
                  <input
                    type="date"
                    required
                    value={editFormData.date}
                    onChange={e => setEditFormData({ ...editFormData, date: e.target.value })}
                    className="w-full bg-white border border-stone-300 rounded-xl px-2.5 py-2 font-mono text-xs text-stone-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-stone-700 block mb-1">
                  Montant en Dinars (DA) *
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  step="50"
                  value={editFormData.amount}
                  onChange={e => setEditFormData({ ...editFormData, amount: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-white border border-stone-300 rounded-xl px-3 py-2 font-mono text-base font-black text-red-600 focus:outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-stone-700 block mb-1">
                  Mode de Règlement *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditFormData({ ...editFormData, paymentMethod: 'CASH' })}
                    className={`py-2 px-3 rounded-xl border flex items-center justify-center gap-1.5 font-bold text-xs transition-all cursor-pointer ${
                      editFormData.paymentMethod === 'CASH'
                        ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                        : 'bg-white border-stone-300 text-stone-700 hover:bg-stone-50'
                    }`}
                  >
                    <Banknote className="w-4 h-4" />
                    <span>Espèces (Caisse)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditFormData({ ...editFormData, paymentMethod: 'BANK' })}
                    className={`py-2 px-3 rounded-xl border flex items-center justify-center gap-1.5 font-bold text-xs transition-all cursor-pointer ${
                      editFormData.paymentMethod === 'BANK'
                        ? 'bg-blue-600 text-white border-blue-700 shadow-xs'
                        : 'bg-white border-stone-300 text-stone-700 hover:bg-stone-50'
                    }`}
                  >
                    <CreditCard className="w-4 h-4" />
                    <span>Banque / Virement</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-stone-700 block mb-1">
                  Description / Justificatif *
                </label>
                <input
                  type="text"
                  required
                  value={editFormData.description}
                  onChange={e => setEditFormData({ ...editFormData, description: e.target.value })}
                  className="w-full bg-white border border-stone-300 rounded-xl px-3 py-2 text-xs text-stone-900 focus:outline-none focus:border-blue-600"
                />
              </div>

              <div className="pt-3 border-t border-stone-200 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 border border-stone-300 text-stone-600 hover:bg-stone-50 rounded-xl transition font-medium text-xs cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition font-bold text-xs shadow-sm flex items-center gap-1.5 active:scale-95 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>Enregistrer les Modifications</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL : CONFIRMATION DE SUPPRESSION */}
      {showDeleteModal && deletingExpense && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white border border-red-200 rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden flex flex-col">
            <div className="p-4 bg-red-50 border-b border-red-200 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-black text-sm text-red-950">
                  Supprimer cette Dépense ?
                </h3>
                <span className="text-[11px] text-red-700 font-arabic block" dir="rtl">
                  تأكيد حذف المصروف واسترجاع المبلغ في الصندوق
                </span>
              </div>
            </div>

            <div className="p-4 space-y-2.5 text-xs text-stone-700">
              <p>Êtes-vous sûr de vouloir supprimer définitivement cette dépense ?</p>
              <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl space-y-1">
                <div className="flex justify-between">
                  <span className="text-stone-500">Date :</span>
                  <strong className="font-mono">{deletingExpense.date}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-stone-500">Montant :</span>
                  <strong className="font-mono text-red-600">
                    {CurrencyUtil.formatDZD(deletingExpense.amount)}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-stone-500">Motif :</span>
                  <span className="truncate max-w-[180px]">{deletingExpense.description}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-stone-500">Règlement :</span>
                  <span>{deletingExpense.payment_method === 'CASH' ? 'Espèces (Caisse)' : 'Banque'}</span>
                </div>
              </div>
              {deletingExpense.payment_method === 'CASH' && (
                <p className="text-[11px] text-amber-700 bg-amber-50 p-2 rounded-lg border border-amber-200">
                  ℹ️ Cette charge ayant été payée en <strong>espèces</strong>, son montant sera réintégré dans le solde de la session de caisse active.
                </p>
              )}
            </div>

            <div className="p-3 bg-stone-50 border-t border-stone-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 border border-stone-300 text-stone-600 hover:bg-white rounded-xl transition text-xs font-medium cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl transition text-xs font-bold shadow-sm flex items-center gap-1.5 active:scale-95 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Confirmer la Suppression</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
