// Aquadro POS Algérie — Module de Suivi des Règlements & Paiements Encaissés
// Affiche en temps réel l'ensemble des paiements validés depuis la base de données SQLite autoritaire

import React, { useState, useEffect } from 'react';
import { db } from '../../db/sqlite';
import { CurrencyUtil } from '../../core/currency/currency';
import { useToast } from '../common/Toast';
import {
  CreditCard,
  Search,
  RefreshCw,
  Wallet,
  Receipt,
  User,
  ArrowDownLeft,
  Smartphone
} from 'lucide-react';

export interface PersistedPaymentRow {
  id: string;
  sale_id: string;
  receipt_number: string;
  payment_method: string;
  amount: number;
  tendered_amount: number;
  change_given: number;
  tpe_auth_reference?: string;
  created_at: string;
  cashier_name?: string;
  customer_name?: string;
  sale_status?: string;
}

export const PaymentsView: React.FC = () => {
  const { showToast } = useToast();
  const [payments, setPayments] = useState<PersistedPaymentRow[]>([]);
  const [filteredPayments, setFilteredPayments] = useState<PersistedPaymentRow[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMethod, setSelectedMethod] = useState<string>('ALL');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadPayments();

    const handleUpdate = () => {
      loadPayments();
    };

    window.addEventListener('sale_completed', handleUpdate);
    window.addEventListener('sales_updated', handleUpdate);
    return () => {
      window.removeEventListener('sale_completed', handleUpdate);
      window.removeEventListener('sales_updated', handleUpdate);
    };
  }, []);

  const loadPayments = async () => {
    setLoading(true);
    try {
      const allPayments = await db.select<any>('SELECT * FROM payments ORDER BY created_at DESC');
      const allSales = await db.select<any>('SELECT * FROM sales');
      const salesMap = new Map<string, any>(allSales.map(s => [s.id, s]));

      const rows: PersistedPaymentRow[] = (allPayments || []).map(p => {
        const s = salesMap.get(p.sale_id);
        return {
          id: p.id,
          sale_id: p.sale_id,
          receipt_number: s?.receipt_number || p.sale_id,
          payment_method: p.payment_method,
          amount: p.amount,
          tendered_amount: p.tendered_amount !== undefined ? p.tendered_amount : p.amount,
          change_given: p.change_given || 0,
          tpe_auth_reference: p.tpe_auth_reference,
          created_at: p.created_at,
          cashier_name: s?.cashier_name || 'Caissier',
          customer_name: s?.customer_name,
          sale_status: s?.status || 'COMPLETED'
        };
      });

      setPayments(rows);
    } catch (err: any) {
      console.error('Erreur chargement paiements:', err);
      showToast('Impossible de charger les paiements depuis la base de données.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let result = [...payments];

    if (selectedMethod !== 'ALL') {
      result = result.filter(p => {
        if (selectedMethod === 'CASH') return p.payment_method === 'CASH';
        if (selectedMethod === 'CARD') return ['CARD', 'CIB', 'EDAHABIA'].includes(p.payment_method);
        if (selectedMethod === 'BARIDIMOB') return p.payment_method === 'BARIDIMOB';
        return p.payment_method === selectedMethod;
      });
    }

    if (searchTerm.trim()) {
      const lower = searchTerm.toLowerCase().trim();
      result = result.filter(p =>
        (p.receipt_number && p.receipt_number.toLowerCase().includes(lower)) ||
        (p.cashier_name && p.cashier_name.toLowerCase().includes(lower)) ||
        (p.customer_name && p.customer_name.toLowerCase().includes(lower)) ||
        (p.payment_method && p.payment_method.toLowerCase().includes(lower))
      );
    }

    setFilteredPayments(result);
  }, [searchTerm, selectedMethod, payments]);

  // Calcul des statistiques récapitulatives
  const totalEncaisse = filteredPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const totalCash = payments
    .filter(p => p.payment_method === 'CASH')
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const totalCard = payments
    .filter(p => ['CARD', 'CIB', 'EDAHABIA'].includes(p.payment_method))
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const totalBaridimob = payments
    .filter(p => p.payment_method === 'BARIDIMOB')
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  const getMethodBadge = (method: string) => {
    switch (method.toUpperCase()) {
      case 'CASH':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <Wallet className="w-3 h-3 mr-1" />
            Espèces (Cash)
          </span>
        );
      case 'CIB':
      case 'EDAHABIA':
      case 'CARD':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <CreditCard className="w-3 h-3 mr-1" />
            Carte / CIB / Edahabia
          </span>
        );
      case 'BARIDIMOB':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
            <Smartphone className="w-3 h-3 mr-1" />
            BaridiMob
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-stone-100 text-stone-700 border border-stone-200">
            {method}
          </span>
        );
    }
  };

  return (
    <div className="flex-1 bg-[#FAF8F5] p-4 flex flex-col overflow-hidden text-xs select-none">
      {/* En-tête du module */}
      <div className="flex items-center justify-between pb-3 border-b border-[#E9DCCB] mb-4">
        <div>
          <h2 className="text-base font-bold text-stone-900 flex items-center">
            <CreditCard className="w-5 h-5 mr-2 text-[#E87524]" />
            Historique des Règlements & Paiements
          </h2>
          <span className="text-[11px] text-stone-500">
            Tous les règlements encaissés à la caisse enregistrés de manière permanente dans la base SQLite ({payments.length} paiements).
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadPayments}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#E9DCCB] rounded-lg text-xs font-semibold text-stone-700 hover:bg-[#FFF8EF] transition"
            title="Rafraîchir"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#E87524]' : ''}`} />
            <span>Actualiser</span>
          </button>
        </div>
      </div>

      {/* Cartes KPI Synthèse Financière */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="bg-white p-3 rounded-xl border border-[#E9DCCB] shadow-2xs">
          <span className="text-[11px] font-medium text-stone-500 block">Total Règlements</span>
          <span className="text-base font-bold font-mono text-stone-900 block mt-0.5">
            {CurrencyUtil.formatDZD(totalEncaisse)}
          </span>
          <span className="text-[10px] text-stone-400 mt-1 block">
            {filteredPayments.length} transaction(s)
          </span>
        </div>

        <div className="bg-white p-3 rounded-xl border border-[#E9DCCB] shadow-2xs">
          <span className="text-[11px] font-medium text-emerald-700 block flex items-center gap-1">
            <Wallet className="w-3.5 h-3.5 text-emerald-600" />
            Encaissé en Espèces
          </span>
          <span className="text-base font-bold font-mono text-emerald-800 block mt-0.5">
            {CurrencyUtil.formatDZD(totalCash)}
          </span>
          <span className="text-[10px] text-emerald-600/80 mt-1 block">
            Tiroir-caisse
          </span>
        </div>

        <div className="bg-white p-3 rounded-xl border border-[#E9DCCB] shadow-2xs">
          <span className="text-[11px] font-medium text-blue-700 block flex items-center gap-1">
            <CreditCard className="w-3.5 h-3.5 text-blue-600" />
            Encaissé Carte / CIB
          </span>
          <span className="text-base font-bold font-mono text-blue-800 block mt-0.5">
            {CurrencyUtil.formatDZD(totalCard)}
          </span>
          <span className="text-[10px] text-blue-600/80 mt-1 block">
            TPE Bancaire
          </span>
        </div>

        <div className="bg-white p-3 rounded-xl border border-[#E9DCCB] shadow-2xs">
          <span className="text-[11px] font-medium text-purple-700 block flex items-center gap-1">
            <Smartphone className="w-3.5 h-3.5 text-purple-600" />
            Encaissé BaridiMob
          </span>
          <span className="text-base font-bold font-mono text-purple-800 block mt-0.5">
            {CurrencyUtil.formatDZD(totalBaridimob)}
          </span>
          <span className="text-[10px] text-purple-600/80 mt-1 block">
            Virements QR Code
          </span>
        </div>
      </div>

      {/* Barre de Filtres et Recherche */}
      <div className="bg-white p-3 rounded-t-xl border border-[#E9DCCB] border-b-0 flex flex-wrap items-center justify-between gap-3">
        {/* Onglets Filtre par Mode de Paiement */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setSelectedMethod('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              selectedMethod === 'ALL'
                ? 'bg-stone-800 text-white shadow-2xs'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
            }`}
          >
            Tous ({payments.length})
          </button>
          <button
            onClick={() => setSelectedMethod('CASH')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              selectedMethod === 'CASH'
                ? 'bg-emerald-700 text-white shadow-2xs'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
            }`}
          >
            Espèces
          </button>
          <button
            onClick={() => setSelectedMethod('CARD')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              selectedMethod === 'CARD'
                ? 'bg-blue-700 text-white shadow-2xs'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
            }`}
          >
            Carte / CIB
          </button>
          <button
            onClick={() => setSelectedMethod('BARIDIMOB')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              selectedMethod === 'BARIDIMOB'
                ? 'bg-purple-700 text-white shadow-2xs'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
            }`}
          >
            BaridiMob
          </button>
        </div>

        {/* Recherche par N° Ticket ou Caissier */}
        <div className="relative w-72">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            type="text"
            placeholder="Rechercher par N° ticket, caissier..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-stone-50 border border-[#E9DCCB] rounded-lg text-xs text-stone-800 focus:outline-none focus:border-[#E87524]"
          />
        </div>
      </div>

      {/* Tableau des Règlements Encaissés */}
      <div className="flex-1 bg-white border border-[#E9DCCB] rounded-b-xl overflow-hidden flex flex-col shadow-2xs">
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#FAF8F5] border-b border-[#E9DCCB] text-stone-600 text-[11px] sticky top-0 font-semibold z-10">
              <tr>
                <th className="py-2.5 px-3">Date & Heure</th>
                <th className="py-2.5 px-3">N° Ticket / Réf</th>
                <th className="py-2.5 px-3">Mode de Paiement</th>
                <th className="py-2.5 px-3 text-right">Montant Encaissé</th>
                <th className="py-2.5 px-3 text-right">Versé par Client</th>
                <th className="py-2.5 px-3 text-right">Monnaie Rendue</th>
                <th className="py-2.5 px-3">Caissier</th>
                <th className="py-2.5 px-3 text-center">Statut Vente</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filteredPayments.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-stone-400">
                    <Receipt className="w-8 h-8 mx-auto mb-2 text-stone-300" />
                    <p className="text-xs font-medium">Aucun paiement trouvé.</p>
                    <p className="text-[10px] text-stone-400 mt-0.5">
                      Les paiements validés lors des passages en caisse apparaîtront immédiatement ici.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredPayments.map(p => (
                  <tr key={p.id} className="hover:bg-[#FFFDFB] transition-colors">
                    <td className="py-2.5 px-3 font-mono text-[11px] text-stone-500 whitespace-nowrap">
                      {new Date(p.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold text-stone-900 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <Receipt className="w-3.5 h-3.5 text-[#E87524]" />
                        <span>{p.receipt_number}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      {getMethodBadge(p.payment_method)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-stone-900 whitespace-nowrap">
                      {CurrencyUtil.formatDZD(p.amount)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-stone-600 whitespace-nowrap">
                      {CurrencyUtil.formatDZD(p.tendered_amount)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono whitespace-nowrap">
                      {p.change_given > 0 ? (
                        <span className="text-amber-700 font-semibold flex items-center justify-end gap-0.5">
                          <ArrowDownLeft className="w-3 h-3 text-amber-600" />
                          {CurrencyUtil.formatDZD(p.change_given)}
                        </span>
                      ) : (
                        <span className="text-stone-400">0,00 DZD</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-stone-700 whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <User className="w-3 h-3 text-stone-400" />
                        <span>{p.cashier_name || 'Caissier'}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-center whitespace-nowrap">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                          p.sale_status === 'COMPLETED'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : p.sale_status === 'REFUNDED'
                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}
                      >
                        {p.sale_status === 'COMPLETED'
                          ? 'PAYÉ'
                          : p.sale_status === 'REFUNDED'
                          ? 'REMBOURSÉ'
                          : p.sale_status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pied de tableau avec total */}
        {filteredPayments.length > 0 && (
          <div className="p-3 bg-[#FAF8F5] border-t border-[#E9DCCB] flex items-center justify-between text-xs">
            <span className="font-medium text-stone-600">
              Affichage de {filteredPayments.length} paiement(s)
            </span>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-stone-700">Total Encaissé :</span>
              <span className="font-mono font-bold text-sm text-[#E87524]">
                {CurrencyUtil.formatDZD(totalEncaisse)}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export const CreditsView = PaymentsView;
