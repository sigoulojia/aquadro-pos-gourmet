// Pizzeria POS Algérie — Modal d'Aperçu & Impression de Facture A4 Commerciale
// Design professionnel épuré sans fioritures superflues, adapté pour entreprises et particuliers.

import React, { useState, useEffect } from 'react';
import { DocumentRecord } from '../../types/database';
import { documentService } from '../../services/document.service';
import { CurrencyUtil } from '../../core/currency/currency';
import { X, Printer, CheckCircle2, Building2, Phone, Mail, MapPin } from 'lucide-react';

interface InvoicePrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: DocumentRecord | null;
  store: any;
}

export const InvoicePrintModal: React.FC<InvoicePrintModalProps> = ({
  isOpen,
  onClose,
  document,
  store
}) => {
  const [items, setItems] = useState<Array<{ name: string; quantity: number; unit_price: number; total_price: number }>>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (isOpen && document) {
      setLoading(true);
      documentService.getDocumentItems(document)
        .then(res => {
          setItems(res);
          setLoading(false);
        })
        .catch(() => {
          setItems([{
            name: 'Consommation Restaurant / Pizzeria',
            quantity: 1,
            unit_price: document.total_ttc,
            total_price: document.total_ttc
          }]);
          setLoading(false);
        });
    }
  }, [isOpen, document]);

  if (!isOpen || !document) return null;

  const storeName = store?.name_fr || store?.name || 'Pizzeria Gourmet';
  const isInvoice = document.document_type === 'FACTURE';
  const docTitle = isInvoice ? 'FACTURE COMMERCIALE' : 'BON / TICKET COMMERCIAL';

  const handlePrint = () => {
    const printContent = window.document.getElementById('printable-a4-invoice');
    if (!printContent) return;

    const printWin = window.open('', '', 'width=900,height=700');
    if (!printWin) {
      window.print();
      return;
    }

    printWin.document.write(`
      <html>
        <head>
          <title>${document.document_number} - ${storeName}</title>
          <style>
            @page { size: A4 portrait; margin: 15mm; }
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; color: #111; margin: 0; padding: 20px; font-size: 13px; line-height: 1.4; }
            .header { display: flex; justify-content: space-between; border-bottom: 2px solid #222; padding-bottom: 15px; margin-bottom: 20px; }
            .store-title { font-size: 22px; font-weight: 900; margin: 0 0 5px 0; }
            .store-info { font-size: 12px; color: #444; }
            .invoice-box { text-align: right; }
            .invoice-title { font-size: 20px; font-weight: 900; color: #E87524; margin: 0 0 5px 0; }
            .invoice-num { font-family: monospace; font-size: 14px; font-weight: bold; }
            .client-box { background: #f9f9f9; border: 1px solid #ddd; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 25px; }
            th { background: #f1f1f1; border-bottom: 2px solid #333; padding: 10px 8px; font-size: 12px; text-transform: uppercase; font-weight: 800; }
            td { padding: 9px 8px; border-bottom: 1px solid #eee; }
            .text-right { text-align: right; }
            .text-center { text-align: center; }
            .totals-table { width: 280px; margin-left: auto; border: 1px solid #ddd; }
            .total-row-highlight { background: #fdf5ef; font-weight: 900; font-size: 14px; color: #E87524; }
            .footer { margin-top: 50px; display: flex; justify-content: space-between; align-items: flex-start; }
            .stamp-box { width: 220px; height: 110px; border: 1px dashed #999; border-radius: 8px; text-align: center; padding-top: 10px; font-size: 11px; color: #666; }
          </style>
        </head>
        <body>
          ${printContent.innerHTML}
        </body>
      </html>
    `);
    printWin.document.close();
    printWin.focus();
    setTimeout(() => {
      printWin.print();
      printWin.close();
    }, 250);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 select-none backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white border border-stone-200 w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden flex flex-col text-xs text-[#292522] max-h-[92vh]">
        {/* Barre d'action supérieure */}
        <div className="px-6 py-3.5 border-b border-stone-200 bg-[#FFF8EF] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-mono font-black text-sm text-[#E87524]">{document.document_number}</span>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-stone-100 text-stone-700 border border-stone-200">
              {document.document_type}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-4 py-2 rounded-xl bg-[#E87524] hover:bg-[#D46317] text-white font-bold text-xs flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimer Facture A4 (PDF)</span>
            </button>
            <button
              onClick={onClose}
              className="text-stone-400 hover:text-stone-700 p-2 rounded-xl hover:bg-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Aperçu Facture Défilable */}
        <div className="p-6 overflow-y-auto bg-stone-100/70">
          <div
            id="printable-a4-invoice"
            className="bg-white p-8 rounded-xl border border-stone-200 shadow-sm max-w-2xl mx-auto space-y-6"
          >
            {/* Header Document */}
            <div className="flex justify-between items-start border-b-2 border-stone-800 pb-4">
              <div>
                <h1 className="text-xl font-black text-stone-900 tracking-tight">{storeName}</h1>
                <div className="text-[11px] text-stone-500 space-y-0.5 mt-1">
                  {store?.address && <p>{store.address}</p>}
                  {store?.phone && <p>Tél : {store.phone}</p>}
                  {store?.email && <p>Email : {store.email}</p>}
                  {store?.rc && <p>RC : {store.rc} {store?.nif ? `• NIF : ${store.nif}` : ''}</p>}
                </div>
              </div>
              <div className="text-right">
                <h2 className="text-base font-black text-[#E87524] tracking-wider uppercase">{docTitle}</h2>
                <p className="font-mono text-sm font-bold text-stone-900 mt-0.5">{document.document_number}</p>
                <p className="text-[11px] text-stone-500 mt-1">
                  Date : {new Date(document.created_at).toLocaleDateString('fr-FR')} à {new Date(document.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                </p>
                <p className="text-[10px] text-stone-400 font-mono mt-0.5">Réf : {document.reference_id}</p>
              </div>
            </div>

            {/* Informations Client */}
            <div className="bg-stone-50 border border-stone-200 rounded-xl p-3.5 flex justify-between items-center text-xs">
              <div>
                <span className="text-[10px] uppercase font-bold text-stone-400 block">Facturé à / Client :</span>
                <span className="font-extrabold text-stone-900 text-sm">{document.customer_or_supplier_name || 'Client Comptoir'}</span>
              </div>
              <div className="text-right text-[11px] text-stone-500">
                <span className="inline-block px-2.5 py-1 rounded bg-emerald-50 text-emerald-700 font-bold border border-emerald-200">
                  Payé & Acquitté
                </span>
              </div>
            </div>

            {/* Tableau des Articles */}
            <div className="border border-stone-200 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-stone-100 text-[11px] font-bold text-stone-700 uppercase border-b border-stone-200">
                    <th className="py-2.5 px-3 w-10 text-center">N°</th>
                    <th className="py-2.5 px-3">Désignation</th>
                    <th className="py-2.5 px-3 text-center w-16">Qté</th>
                    <th className="py-2.5 px-3 text-right w-24">Prix Unit.</th>
                    <th className="py-2.5 px-3 text-right w-28">Total TTC</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-stone-400">Chargement des articles...</td>
                    </tr>
                  ) : (
                    items.map((it, idx) => (
                      <tr key={idx} className="hover:bg-stone-50/50">
                        <td className="py-2.5 px-3 text-center text-stone-400 font-mono text-[11px]">{idx + 1}</td>
                        <td className="py-2.5 px-3 font-bold text-stone-800">{it.name}</td>
                        <td className="py-2.5 px-3 text-center font-bold">{it.quantity}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-stone-600">
                          {CurrencyUtil.formatDZD(it.unit_price)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-extrabold text-stone-900">
                          {CurrencyUtil.formatDZD(it.total_price)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Récapitulatif Total */}
            <div className="flex justify-end pt-2">
              <div className="w-64 border border-stone-200 rounded-xl overflow-hidden bg-white text-xs">
                <div className="p-2.5 flex justify-between border-b border-stone-100 text-stone-600">
                  <span>Total Brut TTC :</span>
                  <span className="font-mono font-bold">{CurrencyUtil.formatDZD(document.total_ttc)}</span>
                </div>
                <div className="p-2.5 flex justify-between border-b border-stone-100 text-stone-600">
                  <span>Remise accordée :</span>
                  <span className="font-mono">0.00 DZD</span>
                </div>
                <div className="p-3 flex justify-between bg-[#FFF8EF] font-black text-sm text-[#E87524]">
                  <span>Net à Payer TTC :</span>
                  <span className="font-mono">{CurrencyUtil.formatDZD(document.total_ttc)}</span>
                </div>
              </div>
            </div>

            {/* Bas de page / Cachet */}
            <div className="pt-8 flex justify-between items-end border-t border-stone-200 text-stone-400 text-[10px]">
              <div>
                <p>Merci pour votre confiance !</p>
                <p className="mt-0.5">Document généré automatiquement par Aquadro Pizzeria POS.</p>
              </div>
              <div className="w-48 h-20 border border-dashed border-stone-300 rounded-xl flex items-center justify-center text-center text-stone-400 text-[10px] p-2">
                Cachet et Signature
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
