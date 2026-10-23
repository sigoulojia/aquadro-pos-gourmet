// Aquadro POS Algérie — Gestionnaire des Suppléments, Stock & Coûts d'Achat (Propriétaire)
// Permet d'enregistrer chaque supplément avec son prix d'achat (coût), son prix de vente, sa quantité en stock et ses alertes.

import React, { useState, useEffect } from "react";
import { supplementService, PizzaSupplement } from "../../services/supplement.service";
import { CurrencyUtil } from "../../core/currency/currency";
import { useToast } from "../common/Toast";
import {
  X,
  Plus,
  Minus,
  Trash2,
  Edit2,
  Check,
  Package,
  Layers,
  AlertTriangle,
  TrendingUp,
  DollarSign
} from "lucide-react";

interface SupplementsManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SupplementsManagerModal: React.FC<SupplementsManagerModalProps> = ({
  isOpen,
  onClose
}) => {
  const { showToast } = useToast();
  const [supplements, setSupplements] = useState<PizzaSupplement[]>([]);

  // Formulaire d'ajout
  const [nameFr, setNameFr] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [purchaseCost, setPurchaseCost] = useState<number>(40);
  const [price, setPrice] = useState<number>(80);
  const [stock, setStock] = useState<number>(50);
  const [minAlert, setMinAlert] = useState<number>(10);
  const [category, setCategory] = useState<string>("extra");

  // Édition en ligne
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState<number>(0);
  const [editCost, setEditCost] = useState<number>(0);
  const [editStock, setEditStock] = useState<number>(0);

  const loadList = async () => {
    const list = await supplementService.getSupplements(true);
    setSupplements(list);
  };

  useEffect(() => {
    if (isOpen) {
      loadList();
      setNameFr("");
      setNameAr("");
      setPurchaseCost(40);
      setPrice(80);
      setStock(50);
      setMinAlert(10);
      setEditingId(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleAddSupplement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameFr.trim()) {
      showToast("Veuillez saisir le nom du supplément", "warning");
      return;
    }

    try {
      await supplementService.addSupplement({
        name_fr: nameFr,
        name_ar: nameAr,
        purchase_cost: purchaseCost,
        price: price,
        current_stock: stock,
        min_stock_alert: minAlert,
        category: category as any
      });
      showToast("Supplément ajouté au stock avec succès !", "success");
      setNameFr("");
      setNameAr("");
      setPurchaseCost(40);
      setPrice(80);
      setStock(50);
      loadList();
    } catch (err: any) {
      showToast(`Erreur : ${err?.message || err}`, "error");
    }
  };

  const handleStartEdit = (supp: PizzaSupplement) => {
    setEditingId(supp.id);
    setEditPrice(supp.price);
    setEditCost(supp.purchase_cost || 0);
    setEditStock(supp.current_stock || 0);
  };

  const handleSaveEdit = async (id: string) => {
    try {
      await supplementService.updateSupplement(id, {
        price: Math.max(0, editPrice),
        purchase_cost: Math.max(0, editCost),
        current_stock: Math.max(0, editStock)
      });
      showToast("Supplément et stock mis à jour", "success");
      setEditingId(null);
      loadList();
    } catch (err: any) {
      showToast(`Erreur : ${err?.message || err}`, "error");
    }
  };

  const handleQuickAdjustStock = async (id: string, delta: number) => {
    try {
      await supplementService.adjustStock(id, delta);
      loadList();
    } catch (err: any) {
      showToast(`Erreur d'ajustement : ${err?.message || err}`, "error");
    }
  };

  const handleDelete = async (supp: PizzaSupplement) => {
    if (window.confirm(`Supprimer le supplément "${supp.name_fr}" du stock ?`)) {
      try {
        await supplementService.deleteSupplement(supp.id);
        showToast("Supplément retiré du stock", "info");
        loadList();
      } catch (err: any) {
        showToast(`Erreur : ${err?.message || err}`, "error");
      }
    }
  };

  // Statistiques du stock des suppléments
  const totalStockUnits = supplements.reduce((sum, s) => sum + (s.current_stock || 0), 0);
  const totalStockValueCost = supplements.reduce((sum, s) => sum + (s.current_stock || 0) * (s.purchase_cost || 0), 0);
  const lowStockCount = supplements.filter(s => (s.current_stock || 0) <= (s.min_stock_alert || 5)).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 select-none animate-in fade-in duration-150">
      <div className="bg-white border border-[#E9DCCB] rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* En-tête sobre et clair */}
        <div className="px-5 py-3.5 border-b border-[#E9DCCB] bg-[#FFF8EF] flex items-center justify-between">
          <div>
            <h2 className="font-extrabold text-base text-[#292522]">
              Gestion des Suppléments, Stock & Coûts
            </h2>
            <p className="text-xs text-stone-500">
              Définissez le coût d'achat initial, le prix de vente et la quantité en stock pour chaque extra.
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white border border-[#E9DCCB] hover:bg-stone-100 flex items-center justify-center text-stone-500 hover:text-[#292522] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Indicateurs rapides simples (Stock & Valeur) */}
        <div className="grid grid-cols-3 gap-3 px-5 py-2.5 bg-stone-50/70 border-b border-[#E9DCCB] text-xs">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-[#E87524]" />
            <div>
              <span className="text-[11px] text-stone-500 block">Total Unités en Stock</span>
              <span className="font-bold text-stone-900">{totalStockUnits} portions</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-emerald-600" />
            <div>
              <span className="text-[11px] text-stone-500 block">Valeur Stock (au Coût d'Achat)</span>
              <span className="font-bold text-emerald-700 font-mono">
                {CurrencyUtil.formatDZD(totalStockValueCost)}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <AlertTriangle className={`w-4 h-4 ${lowStockCount > 0 ? "text-amber-500" : "text-stone-400"}`} />
            <div>
              <span className="text-[11px] text-stone-500 block">Articles en Stock Bas</span>
              <span className={`font-bold ${lowStockCount > 0 ? "text-amber-600" : "text-stone-700"}`}>
                {lowStockCount} article{lowStockCount > 1 ? "s" : ""}
              </span>
            </div>
          </div>
        </div>

        {/* Corps : Formulaire d'ajout rapide + Liste du Stock */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Formulaire Simple d'Ajout */}
          <form onSubmit={handleAddSupplement} className="bg-[#FFFDFB] p-3.5 rounded-xl border border-[#E9DCCB] space-y-3">
            <span className="font-bold text-xs text-[#292522] block">
              + Ajouter un Nouveau Supplément au Stock
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-6 gap-2.5 text-xs">
              {/* Nom Français */}
              <div className="sm:col-span-2">
                <label className="block text-stone-600 font-semibold mb-1 text-[11px]">Nom (Français)</label>
                <input
                  type="text"
                  placeholder="ex: Fromage de Chèvre"
                  value={nameFr}
                  onChange={e => setNameFr(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-[#E9DCCB] rounded-lg text-xs focus:ring-1 focus:ring-[#E87524]"
                  required
                />
              </div>

              {/* Nom Arabe */}
              <div className="sm:col-span-1">
                <label className="block text-stone-600 font-semibold mb-1 text-[11px]">الاسم بالعربية</label>
                <input
                  type="text"
                  placeholder="جبن الماعز"
                  value={nameAr}
                  onChange={e => setNameAr(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-[#E9DCCB] rounded-lg text-xs text-right font-arabic focus:ring-1 focus:ring-[#E87524]"
                  dir="rtl"
                />
              </div>

              {/* Prix d'Achat Initial (Coût) */}
              <div className="sm:col-span-1">
                <label className="block text-stone-600 font-semibold mb-1 text-[11px]">Coût d'Achat (DA)</label>
                <input
                  type="number"
                  min={0}
                  step={5}
                  value={purchaseCost}
                  onChange={e => setPurchaseCost(parseFloat(e.target.value) || 0)}
                  className="w-full px-2.5 py-1.5 bg-white border border-[#E9DCCB] rounded-lg text-xs font-mono font-bold text-stone-700"
                  required
                />
              </div>

              {/* Prix de Vente */}
              <div className="sm:col-span-1">
                <label className="block text-stone-600 font-semibold mb-1 text-[11px]">Prix Vente (DA)</label>
                <input
                  type="number"
                  min={0}
                  step={10}
                  value={price}
                  onFocus={e => e.target.select()}
                  onChange={e => setPrice(parseFloat(e.target.value) || 0)}
                  className="w-full px-2.5 py-1.5 bg-white border border-[#E9DCCB] rounded-lg text-xs font-mono font-bold text-[#E87524]"
                  required
                />
              </div>

              {/* Quantité Initiale en Stock */}
              <div className="sm:col-span-1">
                <label className="block text-stone-600 font-semibold mb-1 text-[11px]">Stock Initial</label>
                <input
                  type="number"
                  min={0}
                  value={stock}
                  onChange={e => setStock(parseFloat(e.target.value) || 0)}
                  className="w-full px-2.5 py-1.5 bg-white border border-[#E9DCCB] rounded-lg text-xs font-mono font-bold text-stone-800"
                  required
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-stone-500">
                Marge brute unitaire estimée :{" "}
                <strong className="text-emerald-700">{Math.max(0, price - purchaseCost)} DA</strong>
              </span>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-lg bg-[#E87524] hover:bg-[#D46317] text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Ajouter au Stock</span>
              </button>
            </div>
          </form>

          {/* Tableau Simple du Stock des Suppléments */}
          <div className="border border-[#E9DCCB] rounded-xl overflow-hidden bg-white">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#FFF8EF] border-b border-[#E9DCCB] text-stone-600 font-bold text-[11px]">
                  <th className="py-2.5 px-3">Nom du Supplément</th>
                  <th className="py-2.5 px-3 text-right">Coût Achat</th>
                  <th className="py-2.5 px-3 text-right">Prix Vente</th>
                  <th className="py-2.5 px-3 text-right">Marge</th>
                  <th className="py-2.5 px-3 text-center">Quantité en Stock</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E9DCCB]/60">
                {supplements.map(supp => {
                  const isEditing = editingId === supp.id;
                  const isLow = (supp.current_stock || 0) <= (supp.min_stock_alert || 5);
                  const isOut = (supp.current_stock || 0) <= 0;
                  const margin = (supp.price || 0) - (supp.purchase_cost || 0);

                  return (
                    <tr key={supp.id} className="hover:bg-stone-50/60 transition-colors">
                      {/* Nom */}
                      <td className="py-2.5 px-3">
                        <span className="font-bold text-[#292522] block">{supp.name_fr}</span>
                        {supp.name_ar && (
                          <span className="text-[10px] text-stone-500 font-arabic block" dir="rtl">
                            {supp.name_ar}
                          </span>
                        )}
                      </td>

                      {/* Coût d'achat */}
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-stone-600">
                        {isEditing ? (
                          <input
                            type="number"
                            min={0}
                            value={editCost}
                            onChange={e => setEditCost(parseFloat(e.target.value) || 0)}
                            className="w-16 px-1.5 py-0.5 border border-[#E9DCCB] rounded text-right text-xs font-mono"
                          />
                        ) : (
                          CurrencyUtil.formatDZD(supp.purchase_cost || 0)
                        )}
                      </td>

                      {/* Prix de vente */}
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-[#E87524]">
                        {isEditing ? (
                          <input
                            type="number"
                            min={0}
                            value={editPrice}
                            onFocus={e => e.target.select()}
                            onChange={e => setEditPrice(parseFloat(e.target.value) || 0)}
                            className="w-16 px-1.5 py-0.5 border border-[#E9DCCB] rounded text-right text-xs font-mono text-[#E87524]"
                          />
                        ) : (
                          CurrencyUtil.formatDZD(supp.price)
                        )}
                      </td>

                      {/* Marge unitaire */}
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700">
                        +{CurrencyUtil.formatDZD(margin)}
                      </td>

                      {/* Quantité en Stock avec ajustement rapide (+/-) */}
                      <td className="py-2.5 px-3 text-center">
                        {isEditing ? (
                          <input
                            type="number"
                            min={0}
                            value={editStock}
                            onChange={e => setEditStock(parseFloat(e.target.value) || 0)}
                            className="w-16 px-1.5 py-0.5 border border-[#E9DCCB] rounded text-center text-xs font-mono font-bold"
                          />
                        ) : (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleQuickAdjustStock(supp.id, -1)}
                              className="w-5 h-5 rounded bg-stone-100 hover:bg-stone-200 text-stone-600 flex items-center justify-center transition-colors cursor-pointer"
                              title="Déduire 1 unité"
                            >
                              <Minus className="w-3 h-3" />
                            </button>

                            <span
                              className={`px-2 py-0.5 rounded-full text-xs font-bold font-mono ${
                                isOut
                                  ? "bg-red-50 text-red-700 border border-red-200"
                                  : isLow
                                  ? "bg-amber-50 text-amber-700 border border-amber-200"
                                  : "bg-emerald-50 text-emerald-800 border border-emerald-200"
                              }`}
                            >
                              {supp.current_stock || 0}
                            </span>

                            <button
                              type="button"
                              onClick={() => handleQuickAdjustStock(supp.id, 1)}
                              className="w-5 h-5 rounded bg-stone-100 hover:bg-stone-200 text-stone-600 flex items-center justify-center transition-colors cursor-pointer"
                              title="Ajouter 1 unité au stock"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-2.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {isEditing ? (
                            <button
                              type="button"
                              onClick={() => handleSaveEdit(supp.id)}
                              className="p-1 rounded bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                              title="Valider modifications"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleStartEdit(supp)}
                              className="p-1 rounded text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors"
                              title="Modifier prix et stock"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDelete(supp)}
                            className="p-1 rounded text-stone-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            title="Supprimer du stock"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
