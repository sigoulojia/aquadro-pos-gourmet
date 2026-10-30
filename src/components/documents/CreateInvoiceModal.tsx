// Pizzeria POS Algérie — Modal de Création de Facture Commerciale
// Permet de facturer des commandes d'entreprises, événements, cantines et traiteurs avec numérotation séquentielle officielle.

import React, { useState, useEffect } from 'react';
import { documentService } from '../../services/document.service';
import { productService } from '../../services/product.service';
import { Product, DocumentRecord } from '../../types/database';
import { CurrencyUtil } from '../../core/currency/currency';
import { useToast } from '../common/Toast';
import { X, Plus, Trash2, FileText, CheckCircle2 } from 'lucide-react';

interface CreateInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInvoiceCreated: (doc: DocumentRecord) => void;
}

export const CreateInvoiceModal: React.FC<CreateInvoiceModalProps> = ({
  isOpen,
  onClose,
  onInvoiceCreated
}) => {
  const { showToast } = useToast();
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerNif, setCustomerNif] = useState('');
  const [customerRc, setCustomerRc] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [notes, setNotes] = useState('');

  const [availableProducts, setAvailableProducts] = useState<Product[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [items, setItems] = useState<Array<{ name: string; quantity: number; unitPrice: number; total: number }>>([]);
  const [customItemName, setCustomItemName] = useState('');
  const [customItemPrice, setCustomItemPrice] = useState<number>(700);
  const [customItemQty, setCustomItemQty] = useState<number>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      productService.getProducts(true).then(setAvailableProducts).catch(() => {});
      setCustomerName('');
      setCustomerPhone('');
      setCustomerNif('');
      setCustomerRc('');
      setCustomerAddress('');
      setNotes('');
      setItems([]);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const totalTtc = items.reduce((sum, item) => sum + item.total, 0);

  const handleAddProductItem = () => {
    if (!selectedProductId) return;
    const p = availableProducts.find(prod => prod.id === selectedProductId);
    if (!p) return;

    setItems(prev => [
      ...prev,
      {
        name: p.name_fr || (p as any).name || 'Pizza',
        quantity: 1,
        unitPrice: p.selling_price_ttc,
        total: p.selling_price_ttc
      }
    ]);
    setSelectedProductId('');
  };

  const handleAddCustomItem = () => {
    if (!customItemName.trim() || customItemPrice <= 0 || customItemQty <= 0) {
      showToast('Veuillez saisir un nom et un prix valide.', 'warning');
      return;
    }
    setItems(prev => [
      ...prev,
      {
        name: customItemName.trim(),
        quantity: customItemQty,
        unitPrice: customItemPrice,
        total: customItemQty * customItemPrice
      }
    ]);
    setCustomItemName('');
    setCustomItemPrice(700);
    setCustomItemQty(1);
  };

  const handleUpdateItemQty = (index: number, newQty: number) => {
    if (newQty <= 0) return;
    setItems(prev => {
      const copy = [...prev];
      copy[index].quantity = newQty;
      copy[index].total = newQty * copy[index].unitPrice;
      return copy;
    });
  };

  const handleRemoveItem = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim()) {
      showToast('Le nom du client ou de la société est obligatoire.', 'warning');
      return;
    }
    if (items.length === 0) {
      showToast('Veuillez ajouter au moins un article à facturer.', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      const doc = await documentService.createInvoice({
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim() || undefined,
        customerNif: customerNif.trim() || undefined,
        customerRc: customerRc.trim() || undefined,
        customerAddress: customerAddress.trim() || undefined,
        notes: notes.trim() || undefined,
        items,
        totalTtc
      });

      showToast(`Facture ${doc.document_number} émise avec succès !`, 'success');
      onInvoiceCreated(doc);
      onClose();
    } catch (err: any) {
      showToast(`Erreur d'émission : ${err?.message || err}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 select-none backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white border border-stone-200 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col text-xs text-[#292522] max-h-[90vh]">
        {/* En-tête */}
        <div className="px-6 py-4 border-b border-stone-200 bg-[#FFF8EF] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-orange-100 text-[#E87524] flex items-center justify-center">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-[#292522]">Émission d'une Facture Commerciale</h3>
              <p className="text-[11px] text-stone-500">Pour entreprises, événements ou commandes de groupe</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-700 p-1.5 rounded-lg hover:bg-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulaire défilable */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4">
          {/* Bloc Coordonnées Client */}
          <div className="space-y-3">
            <h4 className="font-extrabold text-[#292522] text-xs">Informations du Client / Entreprise</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-stone-700 font-bold mb-1">
                  Nom du Client ou Raison Sociale *
                </label>
                <input
                  type="text"
                  required
                  placeholder=""
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  className="w-full p-2 border border-stone-300 rounded-lg text-xs"
                />
              </div>
              <div>
                <label className="block text-stone-700 font-bold mb-1">Numéro de Téléphone</label>
                <input
                  type="text"
                  placeholder=""
                  value={customerPhone}
                  onChange={e => setCustomerPhone(e.target.value)}
                  className="w-full p-2 border border-stone-300 rounded-lg text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-stone-700 font-bold mb-1">NIF (Fiscal)</label>
                <input
                  type="text"
                  placeholder="Optionnel"
                  value={customerNif}
                  onChange={e => setCustomerNif(e.target.value)}
                  className="w-full p-2 border border-stone-300 rounded-lg text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-stone-700 font-bold mb-1">RC (Commerce)</label>
                <input
                  type="text"
                  placeholder="Optionnel"
                  value={customerRc}
                  onChange={e => setCustomerRc(e.target.value)}
                  className="w-full p-2 border border-stone-300 rounded-lg text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-stone-700 font-bold mb-1">Adresse</label>
                <input
                  type="text"
                  placeholder=""
                  value={customerAddress}
                  onChange={e => setCustomerAddress(e.target.value)}
                  className="w-full p-2 border border-stone-300 rounded-lg text-xs"
                />
              </div>
            </div>
          </div>

          {/* Bloc Articles à facturer */}
          <div className="space-y-3 pt-2 border-t border-stone-200">
            <h4 className="font-extrabold text-[#292522] text-xs">Prestations & Pizzas à facturer</h4>
            
            {/* Ajout depuis le menu */}
            <div className="flex gap-2">
              <select
                value={selectedProductId}
                onChange={e => setSelectedProductId(e.target.value)}
                className="flex-1 p-2 border border-stone-300 rounded-lg text-xs bg-white"
              >
                <option value="">Sélectionner une pizza ou boisson du menu...</option>
                {availableProducts.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name_fr} — {CurrencyUtil.formatDZD(p.selling_price_ttc)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleAddProductItem}
                disabled={!selectedProductId}
                className="px-3 py-2 bg-stone-100 hover:bg-[#E87524] hover:text-white text-stone-700 font-bold rounded-lg border border-stone-200 transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Ajouter</span>
              </button>
            </div>

            {/* Ou ajout personnalisé */}
            <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 flex items-center gap-2">
              <input
                type="text"
                placeholder="Article personnalisé..."
                value={customItemName}
                onChange={e => setCustomItemName(e.target.value)}
                className="flex-1 p-1.5 border border-stone-300 rounded-lg bg-white text-xs"
              />
              <input
                type="number"
                min="1"
                placeholder="Qté"
                value={customItemQty}
                onChange={e => setCustomItemQty(parseInt(e.target.value, 10) || 1)}
                className="w-16 p-1.5 border border-stone-300 rounded-lg bg-white text-xs text-center"
              />
              <input
                type="number"
                min="0"
                placeholder="Prix TTC"
                value={customItemPrice}
                onChange={e => setCustomItemPrice(parseInt(e.target.value, 10) || 0)}
                className="w-24 p-1.5 border border-stone-300 rounded-lg bg-white text-xs text-right font-mono"
              />
              <button
                type="button"
                onClick={handleAddCustomItem}
                className="px-3 py-1.5 bg-[#E87524] hover:bg-[#D46317] text-white font-bold rounded-lg transition-colors cursor-pointer text-xs"
              >
                + Ligne
              </button>
            </div>

            {/* Tableau des lignes */}
            {items.length > 0 ? (
              <div className="border border-stone-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-stone-100 border-b border-stone-200 text-stone-600 font-bold text-[11px]">
                    <tr>
                      <th className="p-2.5">Désignation</th>
                      <th className="p-2.5 text-center w-24">Quantité</th>
                      <th className="p-2.5 text-right w-24">Prix Unit.</th>
                      <th className="p-2.5 text-right w-28">Total</th>
                      <th className="p-2.5 text-center w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {items.map((it, idx) => (
                      <tr key={idx} className="hover:bg-stone-50">
                        <td className="p-2.5 font-bold">{it.name}</td>
                        <td className="p-2.5 text-center">
                          <input
                            type="number"
                            min="1"
                            value={it.quantity}
                            onChange={e => handleUpdateItemQty(idx, parseInt(e.target.value, 10) || 1)}
                            className="w-16 p-1 border border-stone-200 rounded text-center text-xs"
                          />
                        </td>
                        <td className="p-2.5 text-right font-mono text-stone-600">
                          {CurrencyUtil.formatDZD(it.unitPrice)}
                        </td>
                        <td className="p-2.5 text-right font-mono font-black text-stone-900">
                          {CurrencyUtil.formatDZD(it.total)}
                        </td>
                        <td className="p-2.5 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(idx)}
                            className="text-stone-400 hover:text-red-600 p-1 rounded"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-4 border border-dashed border-stone-300 rounded-xl text-center text-stone-400 text-xs">
                Aucun article ajouté. Sélectionnez une pizza ou saisissez une ligne personnalisée.
              </div>
            )}
          </div>

          {/* Observations */}
          <div>
            <label className="block text-stone-700 font-bold mb-1">Notes & Mentions Particulières</label>
            <input
              type="text"
              placeholder=""
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full p-2 border border-stone-300 rounded-lg text-xs"
            />
          </div>

          {/* Total & Validation */}
          <div className="pt-3 border-t border-stone-200 flex items-center justify-between">
            <div>
              <span className="text-[11px] text-stone-500 block">Montant Total Facture TTC :</span>
              <span className="text-lg font-black text-[#E87524] font-mono">
                {CurrencyUtil.formatDZD(totalTtc)}
              </span>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-stone-300 bg-white text-stone-700 font-bold text-xs hover:bg-stone-50"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={isSubmitting || items.length === 0}
                className="px-5 py-2 rounded-xl bg-[#E87524] hover:bg-[#D46317] text-white font-bold text-xs shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{isSubmitting ? 'Émission en cours...' : 'Émettre la Facture Officielle'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
