// Pizzeria POS Algérie — Gestion Complète des Documents Commerciaux & Facturations
// Séquences officielles inviolables (Factures A4, Tickets de Caisse, Bons de Livraison, Avoirs)
// Conversion de ticket en facture, émission de factures traiteur/société, et impression PDF A4.

import React, { useState, useEffect } from 'react';
import { documentService } from '../../services/document.service';
import { DocumentRecord, DocumentType } from '../../types/database';
import { CurrencyUtil } from '../../core/currency/currency';
import { useToast } from '../common/Toast';
import { db } from '../../db/sqlite';
import { InvoicePrintModal } from './InvoicePrintModal';
import { CreateInvoiceModal } from './CreateInvoiceModal';
import {
  FileText,
  Search,
  Printer,
  Eye,
  Plus,
  RefreshCw,
  Receipt,
  FileCheck,
  Building,
  CheckCircle2,
  Layers,
  ArrowRight,
  X
} from 'lucide-react';

export const DocumentsView: React.FC = () => {
  const { showToast } = useToast();
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [search, setSearch] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [currentStore, setCurrentStore] = useState<any>(null);

  // Modals
  const [selectedDocForPrint, setSelectedDocForPrint] = useState<DocumentRecord | null>(null);
  const [showPrintModal, setShowPrintModal] = useState<boolean>(false);
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);

  // Conversion Rapide
  const [convertingDoc, setConvertingDoc] = useState<DocumentRecord | null>(null);
  const [convertClientName, setConvertClientName] = useState('');
  const [convertClientNif, setConvertClientNif] = useState('');
  const [showConvertModal, setShowConvertModal] = useState(false);

  useEffect(() => {
    db.select<any>('SELECT * FROM stores LIMIT 1')
      .then(rows => {
        if (rows && rows.length > 0) setCurrentStore(rows[0]);
      })
      .catch(() => {});
    loadDocuments();
  }, [selectedType]);

  const loadDocuments = async () => {
    setIsLoading(true);
    try {
      // 1. Réconcilier les ventes récentes pour s'assurer que tous les tickets de caisse sont présents
      await documentService.syncFromSales();

      // 2. Charger les documents
      const typeParam = selectedType === 'ALL' ? undefined : (selectedType as DocumentType);
      const list = await documentService.getDocuments(typeParam, 200);
      setDocuments(list);
    } catch (err: any) {
      console.warn('Erreur chargement documents:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenPrint = (doc: DocumentRecord) => {
    setSelectedDocForPrint(doc);
    setShowPrintModal(true);
  };

  const handleOpenConvert = (doc: DocumentRecord) => {
    setConvertingDoc(doc);
    setConvertClientName(doc.customer_or_supplier_name && doc.customer_or_supplier_name !== 'Comptoir' ? doc.customer_or_supplier_name : '');
    setConvertClientNif('');
    setShowConvertModal(true);
  };

  const handleConfirmConvert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!convertingDoc || !convertClientName.trim()) {
      showToast('Le nom du client est requis.', 'warning');
      return;
    }

    try {
      const invoice = await documentService.convertTicketToInvoice(convertingDoc, {
        customerName: convertClientName.trim(),
        customerNif: convertClientNif.trim() || undefined
      });
      showToast(`Facture ${invoice.document_number} générée avec succès !`, 'success');
      setShowConvertModal(false);
      await loadDocuments();
      handleOpenPrint(invoice);
    } catch (err: any) {
      showToast(`Erreur : ${err?.message || err}`, 'error');
    }
  };

  const filtered = documents.filter(d => {
    if (!search.trim()) return true;
    const q = search.toLowerCase().trim();
    return (
      d.document_number.toLowerCase().includes(q) ||
      d.reference_id.toLowerCase().includes(q) ||
      (d.customer_or_supplier_name && d.customer_or_supplier_name.toLowerCase().includes(q))
    );
  });

  // Métriques
  const totalInvoices = documents.filter(d => d.document_type === 'FACTURE');
  const totalTickets = documents.filter(d => d.document_type === 'TICKET');
  const totalRevenue = documents.reduce((sum, d) => sum + (d.total_ttc || 0), 0);

  return (
    <div className="flex-1 bg-[#FFF8EF] p-4 sm:p-5 flex flex-col overflow-hidden text-xs select-none">
      {/* Barre d'outils supérieure */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4">
        <div>
          <h2 className="text-base font-extrabold text-[#292522] flex items-center gap-2">
            <FileText className="w-5 h-5 text-[#E87524]" />
            <span>Documents Commerciaux & Facturation</span>
          </h2>
          <p className="text-[11px] text-stone-500 mt-0.5">
            Suivi des factures, tickets de caisse légaux et bons avec numérotation séquentielle certifiée
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => loadDocuments()}
            className="px-3 py-2 rounded-xl bg-white hover:bg-stone-50 text-stone-700 font-bold border border-stone-200 transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer text-xs"
            title="Rafraîchir et synchroniser"
          >
            <RefreshCw className="w-3.5 h-3.5 text-stone-500" />
            <span>Actualiser</span>
          </button>

          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 rounded-xl bg-[#E87524] hover:bg-[#D46317] text-white font-bold transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer text-xs"
          >
            <Plus className="w-4 h-4" />
            <span>+ Nouvelle Facture Commerciale</span>
          </button>
        </div>
      </div>

      {/* Cartes Métriques Rapides */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div className="bg-white p-3.5 rounded-2xl border border-stone-200 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[10px] uppercase font-bold text-stone-400 block">Factures Émises</span>
            <span className="text-lg font-black text-[#E87524] font-mono block mt-0.5">
              {totalInvoices.length}
            </span>
          </div>
          <div className="w-9 h-9 rounded-xl bg-orange-50 text-[#E87524] flex items-center justify-center border border-orange-100">
            <FileCheck className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-stone-200 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[10px] uppercase font-bold text-stone-400 block">Tickets de Caisse</span>
            <span className="text-lg font-black text-stone-900 font-mono block mt-0.5">
              {totalTickets.length}
            </span>
          </div>
          <div className="w-9 h-9 rounded-xl bg-stone-100 text-stone-700 flex items-center justify-center border border-stone-200">
            <Receipt className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-stone-200 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[10px] uppercase font-bold text-stone-400 block">Total Enregistré</span>
            <span className="text-lg font-black text-emerald-700 font-mono block mt-0.5">
              {CurrencyUtil.formatDZD(totalRevenue)}
            </span>
          </div>
          <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
            <Building className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Barre de Recherche et Filtres par type */}
      <div className="bg-white p-3 rounded-t-2xl border border-stone-200 border-b-0 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-2xs">
        {/* Recherche rapide */}
        <div className="relative w-full sm:w-80">
          <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Rechercher par N° document, référence, client..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-[#FFF8EF]/50 border border-stone-300 rounded-xl pl-9 pr-3 py-1.5 text-xs text-[#292522] focus:outline-none focus:ring-1 focus:ring-[#E87524]"
          />
        </div>

        {/* Boutons Onglets de filtrage */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0 scrollbar-none">
          {[
            { id: 'ALL', label: 'Tous' },
            { id: 'FACTURE', label: 'Factures (FAC)' },
            { id: 'TICKET', label: 'Tickets (TKT)' },
            { id: 'BON_LIVRAISON', label: 'Bons Livraison (BL)' },
            { id: 'AVOIR', label: 'Avoirs (AVO)' }
          ].map(tab => {
            const isSelected = selectedType === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setSelectedType(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  isSelected
                    ? 'bg-[#E87524] text-white shadow-2xs'
                    : 'bg-stone-100 hover:bg-stone-200 text-stone-700'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tableau des Documents Commerciaux */}
      <div className="flex-1 bg-white border border-stone-200 rounded-b-2xl overflow-hidden flex flex-col shadow-xs">
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-[#FFF8EF] border-b border-stone-200 text-stone-600 text-[10px] uppercase font-black sticky top-0">
              <tr>
                <th className="py-3 px-3.5">Type</th>
                <th className="py-3 px-3.5">Numéro Séquentiel</th>
                <th className="py-3 px-3.5">Réf. Vente</th>
                <th className="py-3 px-3.5">Client / Tiers</th>
                <th className="py-3 px-3.5">Date & Heure</th>
                <th className="py-3 px-3.5 text-right">Montant TTC</th>
                <th className="py-3 px-3.5 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-stone-400">
                    Chargement des documents...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-stone-400">
                    <FileText className="w-8 h-8 text-stone-300 mx-auto mb-2" />
                    <p className="font-bold text-stone-700 text-xs">Aucun document commercial trouvé</p>
                    <p className="text-[11px] text-stone-400 mt-0.5">
                      Les tickets de caisse et factures générés apparaîtront automatiquement ici.
                    </p>
                  </td>
                </tr>
              ) : (
                filtered.map(d => {
                  const isInvoice = d.document_type === 'FACTURE';
                  const isTicket = d.document_type === 'TICKET';

                  return (
                    <tr key={d.id} className="hover:bg-[#FFFDFB] transition-colors">
                      <td className="py-3 px-3.5">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold inline-block border ${
                            isInvoice
                              ? 'bg-orange-50 text-[#E87524] border-orange-200'
                              : isTicket
                              ? 'bg-blue-50 text-blue-700 border-blue-200'
                              : 'bg-stone-100 text-stone-700 border-stone-200'
                          }`}
                        >
                          {d.document_type}
                        </span>
                      </td>
                      <td className="py-3 px-3.5 font-mono font-black text-stone-900">
                        {d.document_number}
                      </td>
                      <td className="py-3 px-3.5 font-mono text-stone-500 text-[11px]">
                        {d.reference_id}
                      </td>
                      <td className="py-3 px-3.5 font-bold text-stone-800">
                        {d.customer_or_supplier_name || 'Comptoir'}
                      </td>
                      <td className="py-3 px-3.5 text-stone-500 font-mono text-[11px]">
                        {new Date(d.created_at).toLocaleDateString('fr-FR')} {new Date(d.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-3 px-3.5 text-right font-mono font-black text-stone-900">
                        {CurrencyUtil.formatDZD(d.total_ttc)}
                      </td>
                      <td className="py-3 px-3.5 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Bouton Aperçu & Imprimer A4 */}
                          <button
                            onClick={() => handleOpenPrint(d)}
                            className="p-1.5 rounded-lg bg-stone-100 hover:bg-[#E87524] hover:text-white text-stone-700 transition-colors cursor-pointer"
                            title="Aperçu & Impression Facture A4 (PDF)"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {/* Si Ticket : Bouton pour convertir en Facture Commerciale */}
                          {isTicket && (
                            <button
                              onClick={() => handleOpenConvert(d)}
                              className="px-2 py-1 rounded-lg bg-orange-50 hover:bg-[#E87524] text-[#E87524] hover:text-white font-bold text-[10px] border border-orange-200 transition-colors cursor-pointer flex items-center gap-1"
                              title="Générer une Facture Commerciale pour ce ticket"
                            >
                              <FileText className="w-3 h-3" />
                              <span>Facture</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal d'Aperçu & Impression Facture A4 */}
      {showPrintModal && selectedDocForPrint && (
        <InvoicePrintModal
          isOpen={showPrintModal}
          onClose={() => {
            setShowPrintModal(false);
            setSelectedDocForPrint(null);
          }}
          document={selectedDocForPrint}
          store={currentStore}
        />
      )}

      {/* Modal d'Émission de Facture Commerciale */}
      {showCreateModal && (
        <CreateInvoiceModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onInvoiceCreated={async doc => {
            await loadDocuments();
            handleOpenPrint(doc);
          }}
        />
      )}

      {/* Modal Rapide : Conversion Ticket -> Facture */}
      {showConvertModal && convertingDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 select-none backdrop-blur-xs">
          <div className="bg-white border border-stone-200 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col text-xs text-[#292522]">
            <div className="px-5 py-3.5 border-b border-stone-200 bg-[#FFF8EF] flex items-center justify-between">
              <h3 className="font-extrabold text-[#292522] text-sm flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#E87524]" />
                <span>Convertir Ticket en Facture</span>
              </h3>
              <button
                onClick={() => setShowConvertModal(false)}
                className="text-stone-400 hover:text-stone-700 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmConvert} className="p-5 space-y-3.5">
              <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl text-[11px] text-stone-600">
                Ticket <span className="font-mono font-bold text-stone-900">{convertingDoc.document_number}</span> de montant{' '}
                <span className="font-mono font-black text-[#E87524]">{CurrencyUtil.formatDZD(convertingDoc.total_ttc)}</span>
              </div>

              <div>
                <label className="block text-stone-700 font-bold mb-1">
                  Nom du Client ou Société *
                </label>
                <input
                  type="text"
                  required
                  placeholder=""
                  value={convertClientName}
                  onChange={e => setConvertClientName(e.target.value)}
                  className="w-full p-2 border border-stone-300 rounded-lg text-xs"
                />
              </div>

              <div>
                <label className="block text-stone-700 font-bold mb-1">
                  NIF (Identifiant Fiscal - Optionnel)
                </label>
                <input
                  type="text"
                  placeholder="Optionnel"
                  value={convertClientNif}
                  onChange={e => setConvertClientNif(e.target.value)}
                  className="w-full p-2 border border-stone-300 rounded-lg text-xs font-mono"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowConvertModal(false)}
                  className="px-3 py-1.5 rounded-lg border border-stone-300 text-stone-600 hover:bg-stone-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-[#E87524] hover:bg-[#D46317] text-white font-bold text-xs flex items-center gap-1.5"
                >
                  <span>Générer Facture</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
