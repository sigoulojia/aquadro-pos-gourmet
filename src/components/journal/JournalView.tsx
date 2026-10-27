// Aquadro POS Algérie V2 — Journal d'Activité Global & Traçabilité Inaltérable
// Enregistre et affiche TOUTES les opérations du système en temps réel :
// Ventes, Remboursements, Sessions de caisse, Ouvertures de tiroir, Mouvements de stock, Dépenses, Achats, et Audit système.

import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../db/sqlite';
import { CurrencyUtil } from '../../core/currency/currency';
import {
  History,
  ShoppingCart,
  TrendingDown,
  RefreshCcw,
  Truck,
  CreditCard,
  Banknote,
  Search,
  Filter,
  Lock,
  Unlock,
  Boxes,
  AlertTriangle,
  UserCheck,
  ShieldCheck,
  DollarSign,
  Package,
  LogIn,
  Database,
  UserPlus,
  Info,
  CheckCircle,
  FileText
} from 'lucide-react';

export interface JournalEvent {
  id: string;
  date: string;
  category: 'SALE' | 'REFUND' | 'CAISSE' | 'INVENTORY' | 'EXPENSE' | 'PURCHASE' | 'CUSTOMER' | 'AUDIT';
  type: string;
  title: string;
  description: string;
  amount?: number;
  amountFormatted?: string;
  amountSign?: '+' | '-' | '';
  user: string;
  color: string;
  badgeBg: string;
  icon: React.ReactNode;
}

export const JournalView: React.FC = () => {
  const [events, setEvents] = useState<JournalEvent[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('ALL');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadJournal();

    const reloadListener = () => {
      loadJournal();
    };

    window.addEventListener('sale_completed', reloadListener);
    window.addEventListener('sales_updated', reloadListener);
    window.addEventListener('inventory_updated', reloadListener);
    window.addEventListener('customers_updated', reloadListener);
    window.addEventListener('drawer_setting_changed', reloadListener);

    return () => {
      window.removeEventListener('sale_completed', reloadListener);
      window.removeEventListener('sales_updated', reloadListener);
      window.removeEventListener('inventory_updated', reloadListener);
      window.removeEventListener('customers_updated', reloadListener);
      window.removeEventListener('drawer_setting_changed', reloadListener);
    };
  }, []);

  const loadJournal = async () => {
    setIsLoading(true);
    const journal: JournalEvent[] = [];

    try {
      // 1. Ventes & Ventes à crédit (Sales)
      try {
        const sales = await db.select<any>('SELECT * FROM sales ORDER BY created_at DESC LIMIT 300');
        const payments = await db.select<any>('SELECT * FROM payments');
        
        for (const sale of sales) {
          const salePayments = payments.filter(p => p.sale_id === sale.id);
          const isCredit = salePayments.some(p => p.payment_method === 'CREDIT');
          const isRefunded = sale.status === 'REFUNDED';
          
          journal.push({
            id: sale.id,
            date: sale.created_at,
            category: 'SALE',
            type: isRefunded ? 'VENTE_REMBOURSEE' : (isCredit ? 'CREDIT_SALE' : 'SALE'),
            title: isRefunded ? 'Vente Annulée / Remboursée' : (isCredit ? 'Vente au Carnet (Crédit)' : 'Vente Comptoir Encaissement'),
            description: `Ticket N°: ${sale.receipt_number} | Client: ${sale.customer_name || 'Passager Comptoir'} ${isRefunded ? '[STATUT: REMBOURSÉ]' : ''}`,
            amount: sale.total_ttc,
            amountFormatted: CurrencyUtil.formatDZD(sale.total_ttc),
            amountSign: isRefunded ? '' : '+',
            user: sale.cashier_name || 'Caissier',
            color: isRefunded ? 'text-stone-500' : (isCredit ? 'text-amber-700' : 'text-emerald-700'),
            badgeBg: isRefunded ? 'bg-stone-100 border-stone-300' : (isCredit ? 'bg-amber-50 border-amber-300' : 'bg-emerald-50 border-emerald-300'),
            icon: <ShoppingCart className="w-4 h-4" />
          });
        }
      } catch (err) {
        console.warn('Journal sales fetch error:', err);
      }

      // 2. Remboursements (Refunds)
      try {
        const refunds = await db.select<any>('SELECT * FROM refunds ORDER BY created_at DESC LIMIT 150');
        for (const r of refunds) {
          journal.push({
            id: r.id,
            date: r.created_at,
            category: 'REFUND',
            type: 'REFUND',
            title: 'Remboursement Client & Retour Stock',
            description: `Ticket origine: ${r.receipt_number || '-'} | Motif: ${r.reason || 'Retour article'} | Stock et ingrédients restaurés`,
            amount: r.refund_amount,
            amountFormatted: CurrencyUtil.formatDZD(r.refund_amount),
            amountSign: '-',
            user: r.cashier_name || 'Caissier',
            color: 'text-rose-700',
            badgeBg: 'bg-rose-50 border-rose-300',
            icon: <RefreshCcw className="w-4 h-4" />
          });
        }
      } catch (err) {
        console.warn('Journal refunds fetch error:', err);
      }

      // 3. Sessions de Caisse (Ouvertures, Clôtures et Écarts)
      try {
        const sessions = await db.select<any>('SELECT * FROM cash_sessions ORDER BY opened_at DESC LIMIT 100');
        for (const s of sessions) {
          // Événement Ouverture
          journal.push({
            id: `session-open-${s.id}`,
            date: s.opened_at,
            category: 'CAISSE',
            type: 'SESSION_OPEN',
            title: 'Ouverture de Caisse (Prise de poste)',
            description: `Session: ${s.id} | Fond de caisse initial: ${CurrencyUtil.formatDZD(s.opening_float || 0)}`,
            amount: s.opening_float || 0,
            amountFormatted: CurrencyUtil.formatDZD(s.opening_float || 0),
            amountSign: '+',
            user: s.cashier_name || 'Caissier',
            color: 'text-blue-700',
            badgeBg: 'bg-blue-50 border-blue-300',
            icon: <Unlock className="w-4 h-4" />
          });

          // Événement Clôture si fermée
          if (s.closed_at) {
            const hasDiscrepancy = s.cash_discrepancy !== undefined && s.cash_discrepancy !== null && s.cash_discrepancy !== 0;
            const discrepancyText = hasDiscrepancy
              ? ` | Écart constaté: ${CurrencyUtil.formatDZD(s.cash_discrepancy)}`
              : ' | Caisse équilibrée (0 écart)';

            journal.push({
              id: `session-close-${s.id}`,
              date: s.closed_at,
              category: 'CAISSE',
              type: 'SESSION_CLOSE',
              title: 'Clôture de Caisse (Arrêté Z)',
              description: `Session: ${s.id} | Espèces comptées: ${CurrencyUtil.formatDZD(s.actual_counted_cash || 0)} (Théorique: ${CurrencyUtil.formatDZD(s.expected_cash_drawer || 0)})${discrepancyText}`,
              amount: s.actual_counted_cash || 0,
              amountFormatted: CurrencyUtil.formatDZD(s.actual_counted_cash || 0),
              amountSign: '',
              user: s.closed_by_manager_name || s.cashier_name || 'Responsable',
              color: hasDiscrepancy ? 'text-amber-700' : 'text-slate-800',
              badgeBg: hasDiscrepancy ? 'bg-amber-50 border-amber-300' : 'bg-slate-100 border-slate-300',
              icon: <Lock className="w-4 h-4" />
            });
          }
        }
      } catch (err) {
        console.warn('Journal cash sessions fetch error:', err);
      }

      // 4. Mouvements de Stock & Restocks (Inventory Movements)
      try {
        const movements = await db.select<any>(`
          SELECT m.*, p.name_fr AS product_name 
          FROM inventory_movements m
          LEFT JOIN products p ON m.product_id = p.id
          ORDER BY m.created_at DESC LIMIT 200
        `);

        for (const m of movements) {
          const isPositive = m.quantity_change > 0;
          journal.push({
            id: m.id,
            date: m.created_at,
            category: 'INVENTORY',
            type: m.movement_type,
            title: `Mouvement de Stock : ${m.product_name || 'Article'}`,
            description: `Type: ${m.movement_type} | Motif: ${m.reason} | Variation: ${isPositive ? '+' : ''}${m.quantity_change} (Stock: ${m.previous_stock} ➔ ${m.new_stock})`,
            amountFormatted: `${isPositive ? '+' : ''}${m.quantity_change} unités`,
            amountSign: isPositive ? '+' : '-',
            user: m.user_id || 'Gestionnaire Stock',
            color: isPositive ? 'text-emerald-700' : 'text-stone-700',
            badgeBg: isPositive ? 'bg-emerald-50 border-emerald-200' : 'bg-stone-100 border-stone-200',
            icon: <Boxes className="w-4 h-4" />
          });
        }
      } catch (err) {
        console.warn('Journal inventory movements fetch error:', err);
      }

      // 5. Audit Logs (Tiroir-caisse, Clients, Sécurité)
      try {
        const auditLogs = await db.select<any>('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 200');
        for (const a of auditLogs) {
          let category: JournalEvent['category'] = 'AUDIT';
          let title = 'Journalisation d\'Audit Système';
          let color = 'text-indigo-700';
          let badgeBg = 'bg-indigo-50 border-indigo-200';
          let icon = <ShieldCheck className="w-4 h-4" />;

          const action = (a.action || '').toUpperCase();

          if (action.includes('DRAWER') || action.includes('TIROIR')) {
            category = 'CAISSE';
            title = 'Impulsion / Ouverture Tiroir-Caisse';
            color = 'text-cyan-700';
            badgeBg = 'bg-cyan-50 border-cyan-300';
            icon = <Unlock className="w-4 h-4" />;
          } else if (action.includes('CUSTOMER_CREATED') || action.includes('CLIENT')) {
            category = 'CUSTOMER';
            title = 'Nouveau Client Enregistré';
            color = 'text-blue-700';
            badgeBg = 'bg-blue-50 border-blue-200';
            icon = <UserPlus className="w-4 h-4" />;
          } else if (action.includes('CUSTOMER_CREDIT') || action.includes('DEBT')) {
            category = 'CUSTOMER';
            title = 'Opération Compte Client (Crédit / Dette)';
            color = 'text-purple-700';
            badgeBg = 'bg-purple-50 border-purple-200';
            icon = <CreditCard className="w-4 h-4" />;
          } else if (action.includes('BACKUP')) {
            category = 'AUDIT';
            title = 'Sauvegarde / Restauration Données';
            color = 'text-teal-700';
            badgeBg = 'bg-teal-50 border-teal-200';
            icon = <Database className="w-4 h-4" />;
          } else if (action.includes('LOGIN')) {
            category = 'AUDIT';
            title = 'Connexion Utilisateur';
            color = 'text-sky-700';
            badgeBg = 'bg-sky-50 border-sky-200';
            icon = <LogIn className="w-4 h-4" />;
          }

          journal.push({
            id: a.id,
            date: a.created_at,
            category,
            type: a.action,
            title,
            description: `Détails: ${a.details || a.entity_type || '-'}`,
            user: a.user_name || 'Système',
            color,
            badgeBg,
            icon
          });
        }
      } catch (err) {
        console.warn('Journal audit logs fetch error:', err);
      }

      // 6. Achats Fournisseurs (Purchases)
      try {
        const purchases = await db.select<any>('SELECT * FROM purchases ORDER BY ordered_at DESC LIMIT 100');
        for (const p of purchases) {
          journal.push({
            id: p.id,
            date: p.ordered_at || p.created_at,
            category: 'PURCHASE',
            type: 'PURCHASE',
            title: 'Achat & Approvisionnement Fournisseur',
            description: `Bon N°: ${p.order_number || '-'} | Fournisseur: ${p.supplier_name || '-'}`,
            amount: p.total_cost,
            amountFormatted: CurrencyUtil.formatDZD(p.total_cost),
            amountSign: '-',
            user: 'Administrateur',
            color: 'text-blue-700',
            badgeBg: 'bg-blue-50 border-blue-200',
            icon: <Truck className="w-4 h-4" />
          });
        }
      } catch (err) {
        console.warn('Journal purchases fetch error:', err);
      }

      // 7. Dépenses Magasin (Expenses)
      try {
        const expenses = await db.select<any>('SELECT * FROM expenses ORDER BY created_at DESC LIMIT 100');
        for (const e of expenses) {
          journal.push({
            id: e.id,
            date: e.created_at || (e.date ? new Date(e.date).toISOString() : new Date().toISOString()),
            category: 'EXPENSE',
            type: 'EXPENSE',
            title: 'Dépense Caisse / Magasin',
            description: `Catégorie: ${e.category} | Motif: ${e.description}`,
            amount: e.amount,
            amountFormatted: CurrencyUtil.formatDZD(e.amount),
            amountSign: '-',
            user: e.user_name || 'Responsable',
            color: 'text-rose-700',
            badgeBg: 'bg-rose-50 border-rose-200',
            icon: <TrendingDown className="w-4 h-4" />
          });
        }
      } catch (err) {
        console.warn('Journal expenses fetch error:', err);
      }

      // 8. Règlements de Dettes Clients (Customer Payments)
      try {
        const custPayments = await db.select<any>('SELECT * FROM customer_payments ORDER BY created_at DESC LIMIT 100');
        for (const cp of custPayments) {
          journal.push({
            id: cp.id,
            date: cp.created_at,
            category: 'CUSTOMER',
            type: 'PAYMENT_RECEIVED',
            title: 'Versement & Règlement Dette Client',
            description: `Client: ${cp.customer_name || '-'} | Réf: ${cp.reference || '-'} | Mode: ${cp.payment_method}`,
            amount: cp.amount,
            amountFormatted: CurrencyUtil.formatDZD(cp.amount),
            amountSign: '+',
            user: 'Caissier',
            color: 'text-purple-700',
            badgeBg: 'bg-purple-50 border-purple-200',
            icon: <CreditCard className="w-4 h-4" />
          });
        }
      } catch (err) {
        console.warn('Journal customer payments fetch error:', err);
      }

      // Tri chronologique rigoureux (du plus récent au plus ancien)
      journal.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setEvents(journal);
    } catch (globalErr) {
      console.error('Erreur globale chargement Journal:', globalErr);
    } finally {
      setIsLoading(false);
    }
  };

  // Filtrage combiné par catégorie et recherche textuelle
  const filteredEvents = useMemo(() => {
    let result = events;

    if (filterCategory !== 'ALL') {
      result = result.filter(e => e.category === filterCategory);
    }

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      result = result.filter(e =>
        e.title.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        e.user.toLowerCase().includes(q) ||
        e.id.toLowerCase().includes(q) ||
        (e.amountFormatted && e.amountFormatted.toLowerCase().includes(q))
      );
    }

    return result;
  }, [events, filterCategory, searchTerm]);

  // Statistiques rapides
  const stats = useMemo(() => {
    let totalSales = 0;
    let totalRefunds = 0;
    let totalExpenses = 0;

    for (const e of events) {
      if (e.category === 'SALE' && e.amount && e.amountSign === '+') {
        totalSales += e.amount;
      } else if (e.category === 'REFUND' && e.amount) {
        totalRefunds += e.amount;
      } else if ((e.category === 'EXPENSE' || e.category === 'PURCHASE') && e.amount) {
        totalExpenses += e.amount;
      }
    }

    return { totalSales, totalRefunds, totalExpenses, totalCount: events.length };
  }, [events]);

  const categoryTabs = [
    { id: 'ALL', labelAr: 'الكل (Tous)', icon: History },
    { id: 'SALE', labelAr: 'المبيعات (Ventes)', icon: ShoppingCart },
    { id: 'REFUND', labelAr: 'الاسترجاع (Avoirs)', icon: RefreshCcw },
    { id: 'CAISSE', labelAr: 'الصندوق والدرج (Caisse & Tiroir)', icon: Banknote },
    { id: 'INVENTORY', labelAr: 'المخزون والمقادير (Stock)', icon: Boxes },
    { id: 'CUSTOMER', labelAr: 'الزبائن والدين (Clients)', icon: UserCheck },
    { id: 'EXPENSE', labelAr: 'المصاريف والمشتريات (Dépenses)', icon: TrendingDown },
    { id: 'AUDIT', labelAr: 'النظام والأمان (Audit)', icon: ShieldCheck }
  ];

  return (
    <div className="flex-1 bg-[#F7F8FA] p-4 flex flex-col overflow-hidden text-xs select-none">
      {/* ========================================================================= */}
      {/* 1. EN-TÊTE DU JOURNAL                                                     */}
      {/* ========================================================================= */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-3 gap-3 border-b border-stone-200">
        <div>
          <h2 className="text-base font-black text-stone-900 flex items-center gap-2">
            <History className="w-5 h-5 text-[#E87524]" />
            <span>سجل النشاط الشامل وغير القابل للتعديل (Journal Global d'Activité)</span>
          </h2>
          <span className="text-[11px] text-stone-500">
            تسجيل حي لجميع أحداث المتجر: مبيعات، استرجاع، فتح الدرج، تسليم العهدة، حركات المخزون، والمصاريف.
          </span>
        </div>

        {/* Barre de Recherche & Actualisation */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-stone-400" />
            <input
              type="text"
              placeholder="بحث في السجل (رقم التيكت، الزبون، الكاشير...)"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-stone-200 bg-white text-xs text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-1 focus:ring-[#E87524]"
            />
          </div>

          <button
            onClick={loadJournal}
            disabled={isLoading}
            className="px-3 py-1.5 rounded-lg bg-white border border-stone-200 hover:bg-stone-50 text-stone-700 font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
          >
            <RefreshCcw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-[#E87524]' : ''}`} />
            <span>تحديث</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. STATS RAPIDES                                                          */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 my-3">
        <div className="bg-white p-2.5 rounded-xl border border-stone-200 shadow-2xs">
          <span className="text-[10px] text-stone-500 font-bold block">إجمالي المبيعات النشطة</span>
          <span className="text-sm font-black text-emerald-600 font-mono mt-0.5 block">
            {CurrencyUtil.formatDZD(stats.totalSales)}
          </span>
        </div>

        <div className="bg-white p-2.5 rounded-xl border border-stone-200 shadow-2xs">
          <span className="text-[10px] text-stone-500 font-bold block">إجمالي المبالغ المسترجعة</span>
          <span className="text-sm font-black text-rose-600 font-mono mt-0.5 block">
            {CurrencyUtil.formatDZD(stats.totalRefunds)}
          </span>
        </div>

        <div className="bg-white p-2.5 rounded-xl border border-stone-200 shadow-2xs">
          <span className="text-[10px] text-stone-500 font-bold block">المصاريف والمشتريات</span>
          <span className="text-sm font-black text-blue-600 font-mono mt-0.5 block">
            {CurrencyUtil.formatDZD(stats.totalExpenses)}
          </span>
        </div>

        <div className="bg-white p-2.5 rounded-xl border border-stone-200 shadow-2xs">
          <span className="text-[10px] text-stone-500 font-bold block">إجمالي العمليات المسجلة</span>
          <span className="text-sm font-black text-stone-800 font-mono mt-0.5 block">
            {stats.totalCount} عملية
          </span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. ONGLETS DE FILTRAGE PAR CATÉGORIE                                      */}
      {/* ========================================================================= */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-none">
        {categoryTabs.map(tab => {
          const isSelected = filterCategory === tab.id;
          const TabIcon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setFilterCategory(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition-all cursor-pointer ${
                isSelected
                  ? 'bg-[#E87524] text-white shadow-xs'
                  : 'bg-white text-stone-600 hover:bg-stone-100 border border-stone-200'
              }`}
            >
              <TabIcon className="w-3.5 h-3.5" />
              <span>{tab.labelAr}</span>
            </button>
          );
        })}
      </div>

      {/* ========================================================================= */}
      {/* 4. LISTE CHRONOLOGIQUE DES ÉVÉNEMENTS                                     */}
      {/* ========================================================================= */}
      <div className="flex-1 bg-white border border-stone-200 rounded-xl overflow-hidden flex flex-col shadow-xs">
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {filteredEvents.length === 0 ? (
            <div className="text-center py-16 text-stone-400 flex flex-col items-center justify-center">
              <History className="w-10 h-10 mb-2 opacity-30 text-stone-400" />
              <p className="font-bold text-xs">لا توجد عمليات مسجلة تطابق معايير البحث الحالية.</p>
              <span className="text-[11px] text-stone-400 mt-1">تأكد من اختيار التبويب المناسب أو إلغاء كلمة البحث</span>
            </div>
          ) : (
            <div className="relative border-l-2 border-stone-200 ml-4 space-y-4">
              {filteredEvents.map(event => (
                <div key={event.id} className="relative pl-6">
                  {/* Puce Chronologique */}
                  <div className={`absolute -left-3.5 top-2 w-7 h-7 rounded-full flex items-center justify-center border-2 bg-white shadow-2xs ${event.color} border-current`}>
                    {event.icon}
                  </div>

                  {/* Carte d'événement */}
                  <div className="bg-stone-50/70 hover:bg-stone-50 border border-stone-200 rounded-xl p-3 transition-all hover:shadow-xs">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${event.badgeBg} ${event.color}`}>
                          {event.category}
                        </span>
                        <span className="font-black text-stone-900 text-xs">{event.title}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        {event.amountFormatted && (
                          <span className={`font-mono font-black text-xs ${
                            event.amountSign === '+'
                              ? 'text-emerald-600'
                              : event.amountSign === '-'
                              ? 'text-rose-600'
                              : 'text-stone-800'
                          }`}>
                            {event.amountSign}{event.amountFormatted}
                          </span>
                        )}
                        <span className="text-[10px] text-stone-500 font-mono bg-white px-1.5 py-0.5 rounded border border-stone-200">
                          {new Date(event.date).toLocaleString('fr-FR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit'
                          })}
                        </span>
                      </div>
                    </div>

                    <div className="text-stone-700 text-xs leading-relaxed mt-1">
                      {event.description}
                    </div>

                    <div className="mt-2 pt-2 border-t border-stone-200/60 text-[10px] text-stone-500 flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-1">
                        <Banknote className="w-3 h-3 text-stone-400" />
                        <span>المسؤول :</span>
                        <strong className="text-stone-800">{event.user}</strong>
                      </div>

                      <div className="flex items-center gap-1 font-mono text-[9px] text-stone-400">
                        <span>ID :</span>
                        <span>{event.id}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
