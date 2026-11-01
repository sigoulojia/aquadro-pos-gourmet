// Aquadro POS Algérie — Gestionnaire des Suppléments, Stock & Coûts d'Achat (Propriétaire)
// Permet d'enregistrer chaque supplément avec son prix d'achat (coût), son prix de vente, sa quantité en stock et ses alertes.

import React, { useState, useEffect } from "react";
import { supplementService, PizzaSupplement, LEGACY_DEFAULT_SUPPLEMENT_IDS } from "../../services/supplement.service";
import { recipeService } from "../../services/recipe.service";
import { Ingredient } from "../../types/database";
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
  DollarSign,
  Sparkles,
  Link2,
  Info
} from "lucide-react";

interface SupplementsManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  preselectedIngredientId?: string;
}

export const SupplementsManagerModal: React.FC<SupplementsManagerModalProps> = ({
  isOpen,
  onClose,
  preselectedIngredientId
}) => {
  const { showToast } = useToast();
  const [supplements, setSupplements] = useState<PizzaSupplement[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);

  // Formulaire d'ajout
  const [selectedIngredientId, setSelectedIngredientId] = useState<string>("");
  const [portionQuantity, setPortionQuantity] = useState<number>(0.05);
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
  const [editPortion, setEditPortion] = useState<number>(1);

  const loadData = async () => {
    try {
      const [suppList, ingList] = await Promise.all([
        supplementService.getSupplements(true),
        recipeService.getIngredients()
      ]);
      setSupplements(suppList);
      setIngredients(ingList);
    } catch (err) {
      console.warn("Erreur chargement données suppléments/ingrédients:", err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
      setNameFr("");
      setNameAr("");
      setSelectedIngredientId(preselectedIngredientId || "");
      setPortionQuantity(0.05);
      setPurchaseCost(40);
      setPrice(80);
      setStock(50);
      setMinAlert(10);
      setEditingId(null);
    }
  }, [isOpen, preselectedIngredientId]);

  // Détection automatique des champs lorsqu'un ingrédient est sélectionné
  const handleSelectIngredient = (ingId: string) => {
    setSelectedIngredientId(ingId);
    if (!ingId) {
      setPortionQuantity(1);
      return;
    }

    const ing = ingredients.find(i => i.id === ingId);
    if (!ing) return;

    // Déterminer la portion par défaut selon l'unité
    let defaultPortion = 0.05;
    if (ing.unit === 'kg') defaultPortion = 0.05; // 50g
    else if (ing.unit === 'g') defaultPortion = 50;
    else if (ing.unit === 'L') defaultPortion = 0.05; // 50ml
    else if (ing.unit === 'ml') defaultPortion = 50;
    else if (ing.unit === 'pièce') defaultPortion = 1;

    setPortionQuantity(defaultPortion);

    // Calculer le coût automatique
    const unitCost = Number(ing.cost_per_unit) || 0;
    const calcCost = Math.round(unitCost * defaultPortion);
    setPurchaseCost(calcCost);

    // Proposer un prix de vente avec marge saine (ex: coût x 2 arrondi)
    const suggestedPrice = Math.max(50, Math.round((calcCost * 2) / 10) * 10);
    setPrice(suggestedPrice);

    // Stock disponible en portions réelles
    const availablePortions = defaultPortion > 0 ? Math.max(0, Math.floor(ing.current_stock / defaultPortion)) : 50;
    setStock(availablePortions);

    // Nom par défaut
    setNameFr(`Supplément ${ing.name_fr}`);
    if (ing.name_ar) {
      setNameAr(`${ing.name_ar} إضافية`);
    } else {
      setNameAr("");
    }

    // Catégorie suggérée
    const lower = ing.name_fr.toLowerCase();
    if (lower.includes('fromage') || lower.includes('mozzarella') || lower.includes('cheddar') || lower.includes('gruyère')) {
      setCategory('cheese');
    } else if (lower.includes('viande') || lower.includes('poulet') || lower.includes('thon') || lower.includes('merguez') || lower.includes('jambon')) {
      setCategory('meat');
    } else if (lower.includes('sauce')) {
      setCategory('sauce');
    } else if (lower.includes('champignon') || lower.includes('olive') || lower.includes('poivron') || lower.includes('oignon')) {
      setCategory('veg');
    } else {
      setCategory('extra');
    }
  };

  // Mise à jour de la portion et recalcul dynamique
  const handlePortionChange = (newPortion: number) => {
    setPortionQuantity(newPortion);
    if (!selectedIngredientId) return;

    const ing = ingredients.find(i => i.id === selectedIngredientId);
    if (!ing) return;

    const unitCost = Number(ing.cost_per_unit) || 0;
    const calcCost = Math.round(unitCost * newPortion);
    setPurchaseCost(calcCost);

    const availablePortions = newPortion > 0 ? Math.max(0, Math.floor(ing.current_stock / newPortion)) : 50;
    setStock(availablePortions);
  };

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
        category: category as any,
        ingredient_id: selectedIngredientId || null,
        portion_quantity: selectedIngredientId ? portionQuantity : 1.0
      });
      showToast("Supplément ajouté avec succès !", "success");
      setNameFr("");
      setNameAr("");
      setSelectedIngredientId("");
      setPurchaseCost(40);
      setPrice(80);
      setStock(50);
      loadData();
    } catch (err: any) {
      showToast(`Erreur : ${err?.message || err}`, "error");
    }
  };

  const handleStartEdit = (supp: PizzaSupplement) => {
    setEditingId(supp.id);
    setEditPrice(supp.price);
    setEditCost(supp.purchase_cost || 0);
    setEditStock(supp.current_stock || 0);
    setEditPortion(supp.portion_quantity || 1.0);
  };

  const handleSaveEdit = async (id: string) => {
    try {
      await supplementService.updateSupplement(id, {
        price: Math.max(0, editPrice),
        purchase_cost: Math.max(0, editCost),
        current_stock: Math.max(0, editStock),
        portion_quantity: editPortion > 0 ? editPortion : 1.0
      });
      showToast("Supplément et stock mis à jour", "success");
      setEditingId(null);
      loadData();
    } catch (err: any) {
      showToast(`Erreur : ${err?.message || err}`, "error");
    }
  };

  const handleQuickAdjustStock = async (id: string, delta: number) => {
    try {
      await supplementService.adjustStock(id, delta);
      loadData();
    } catch (err: any) {
      showToast(`Erreur d'ajustement : ${err?.message || err}`, "error");
    }
  };

  const handleDelete = async (supp: PizzaSupplement) => {
    try {
      setSupplements(prev => prev.filter(s => s.id !== supp.id));
      await supplementService.deleteSupplement(supp.id);
      showToast(`"${supp.name_fr}" supprimé définitivement`, "info");
      await loadData();
    } catch (err: any) {
      showToast(`Erreur : ${err?.message || err}`, "error");
      await loadData();
    }
  };

  const hasLegacyDefaults = supplements.some(s => LEGACY_DEFAULT_SUPPLEMENT_IDS.includes(s.id));

  const handleClearDefaults = async () => {
    try {
      await supplementService.clearDefaultSupplements();
      showToast("Suppléments de démonstration supprimés !", "success");
      await loadData();
    } catch (err: any) {
      showToast(`Erreur : ${err?.message || err}`, "error");
    }
  };

  const handleClearAll = async () => {
    try {
      await supplementService.clearAllSupplements();
      setSupplements([]);
      showToast("Liste des suppléments entièrement vidée", "info");
      await loadData();
    } catch (err: any) {
      showToast(`Erreur : ${err?.message || err}`, "error");
    }
  };

  const selectedIngredient = ingredients.find(i => i.id === selectedIngredientId);

  // Statistiques du stock des suppléments
  const totalStockUnits = supplements.reduce((sum, s) => sum + (s.current_stock || 0), 0);
  const totalStockValueCost = supplements.reduce((sum, s) => sum + (s.current_stock || 0) * (s.purchase_cost || 0), 0);
  const lowStockCount = supplements.filter(s => (s.current_stock || 0) <= (s.min_stock_alert || 5)).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 select-none animate-in fade-in duration-150">
      <div className="bg-white border border-[#E9DCCB] rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* En-tête */}
        <div className="px-5 py-3.5 border-b border-[#E9DCCB] bg-[#FFF8EF] flex items-center justify-between">
          <div>
            <h2 className="font-extrabold text-base text-[#292522] flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#E87524]" />
              Gestion des Suppléments & Liaison aux Ingrédients
            </h2>
            <p className="text-xs text-stone-500">
              Liez vos suppléments directement aux ingrédients en stock ou créez des extras libres avec déduction automatique.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {hasLegacyDefaults && (
              <button
                type="button"
                onClick={handleClearDefaults}
                className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                title="Supprimer les suppléments de démonstration par défaut"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                <span>Purger démo (حذف الافتراضيات)</span>
              </button>
            )}
            {supplements.length > 0 && (
              <button
                type="button"
                onClick={handleClearAll}
                className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 flex items-center gap-1 transition-colors cursor-pointer"
                title="Supprimer tous les suppléments"
              >
                <Trash2 className="w-3 h-3 text-red-600" />
                <span>Vider tout (حذف الكل)</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-white border border-[#E9DCCB] hover:bg-stone-100 flex items-center justify-center text-stone-500 hover:text-[#292522] transition-colors cursor-pointer ml-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Indicateurs rapides (Stock & Valeur) */}
        <div className="grid grid-cols-3 gap-3 px-5 py-2.5 bg-stone-50/70 border-b border-[#E9DCCB] text-xs">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-[#E87524]" />
            <div>
              <span className="text-[11px] text-stone-500 block">Total Portions en Stock</span>
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
          <form onSubmit={handleAddSupplement} className="bg-[#FFFDFB] p-4 rounded-xl border border-[#E9DCCB] space-y-3.5">
            <div className="flex items-center justify-between border-b border-[#E9DCCB]/60 pb-2">
              <span className="font-bold text-xs text-[#292522] flex items-center gap-1.5">
                <Plus className="w-4 h-4 text-[#E87524]" />
                Ajouter un Supplément ou Convertir un Ingrédient (إضافة ملحق أو تحويل مكون)
              </span>
              {selectedIngredient && (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                  <Link2 className="w-3 h-3" />
                  Lié à {selectedIngredient.name_fr} ({selectedIngredient.current_stock} {selectedIngredient.unit} dispo)
                </span>
              )}
            </div>

            {/* Sélecteur de liaison ingrédient */}
            <div className="bg-amber-50/50 p-2.5 rounded-lg border border-amber-200/70">
              <label className="block text-stone-700 font-bold mb-1 text-xs flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Link2 className="w-3.5 h-3.5 text-[#E87524]" />
                  Lier à un ingrédient du stock (ربط بمكوّن من المخزون) :
                </span>
                <span className="text-[11px] font-normal text-stone-500">
                  Déduit la portion de la matière première
                </span>
              </label>
              <select
                value={selectedIngredientId}
                onChange={e => handleSelectIngredient(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-white border border-[#E9DCCB] rounded-lg text-xs font-medium focus:ring-1 focus:ring-[#E87524]"
              >
                <option value="">-- Aucun (Supplément autonome / غير مرتبط بمكوّن) --</option>
                {ingredients.map(ing => (
                  <option key={ing.id} value={ing.id}>
                    {ing.name_fr} {ing.name_ar ? `(${ing.name_ar})` : ''} — Stock: {ing.current_stock} {ing.unit} — Coût: {ing.cost_per_unit} DA/{ing.unit}
                  </option>
                ))}
              </select>

              {/* Si lié à un ingrédient : réglage de la portion et raccourcis */}
              {selectedIngredient && (
                <div className="mt-2.5 pt-2 border-t border-amber-200/50 flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold text-stone-700 text-[11px]">
                    Quantité déduite par portion ({selectedIngredient.unit}) :
                  </span>
                  <input
                    type="number"
                    min={0.001}
                    step={selectedIngredient.unit === 'kg' || selectedIngredient.unit === 'L' ? 0.005 : 1}
                    value={portionQuantity}
                    onChange={e => handlePortionChange(parseFloat(e.target.value) || 0)}
                    className="w-24 px-2 py-1 bg-white border border-[#E9DCCB] rounded text-center text-xs font-mono font-bold text-[#E87524]"
                  />
                  <span className="text-[11px] text-stone-500 font-mono">{selectedIngredient.unit}</span>

                  {/* Boutons Raccourcis Portions */}
                  <div className="flex items-center gap-1 ml-auto">
                    {selectedIngredient.unit === 'kg' && (
                      <>
                        <button
                          type="button"
                          onClick={() => handlePortionChange(0.03)}
                          className="px-2 py-0.5 text-[10px] bg-white hover:bg-stone-100 border border-stone-200 rounded font-mono font-medium cursor-pointer"
                        >
                          30g
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePortionChange(0.05)}
                          className="px-2 py-0.5 text-[10px] bg-white hover:bg-stone-100 border border-stone-200 rounded font-mono font-medium cursor-pointer"
                        >
                          50g
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePortionChange(0.07)}
                          className="px-2 py-0.5 text-[10px] bg-white hover:bg-stone-100 border border-stone-200 rounded font-mono font-medium cursor-pointer"
                        >
                          70g
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePortionChange(0.10)}
                          className="px-2 py-0.5 text-[10px] bg-white hover:bg-stone-100 border border-stone-200 rounded font-mono font-medium cursor-pointer"
                        >
                          100g
                        </button>
                      </>
                    )}
                    {selectedIngredient.unit === 'g' && (
                      <>
                        <button
                          type="button"
                          onClick={() => handlePortionChange(30)}
                          className="px-2 py-0.5 text-[10px] bg-white hover:bg-stone-100 border border-stone-200 rounded font-mono font-medium cursor-pointer"
                        >
                          30g
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePortionChange(50)}
                          className="px-2 py-0.5 text-[10px] bg-white hover:bg-stone-100 border border-stone-200 rounded font-mono font-medium cursor-pointer"
                        >
                          50g
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePortionChange(100)}
                          className="px-2 py-0.5 text-[10px] bg-white hover:bg-stone-100 border border-stone-200 rounded font-mono font-medium cursor-pointer"
                        >
                          100g
                        </button>
                      </>
                    )}
                    {selectedIngredient.unit === 'pièce' && (
                      <>
                        <button
                          type="button"
                          onClick={() => handlePortionChange(1)}
                          className="px-2 py-0.5 text-[10px] bg-white hover:bg-stone-100 border border-stone-200 rounded font-mono font-medium cursor-pointer"
                        >
                          1 pièce
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePortionChange(2)}
                          className="px-2 py-0.5 text-[10px] bg-white hover:bg-stone-100 border border-stone-200 rounded font-mono font-medium cursor-pointer"
                        >
                          2 pièces
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-6 gap-2.5 text-xs">
              {/* Nom Français */}
              <div className="sm:col-span-2">
                <label className="block text-stone-600 font-semibold mb-1 text-[11px]">Nom (Français)</label>
                <input
                  type="text"
                  placeholder=""
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
                  placeholder=""
                  value={nameAr}
                  onChange={e => setNameAr(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-[#E9DCCB] rounded-lg text-xs text-right font-arabic focus:ring-1 focus:ring-[#E87524]"
                  dir="rtl"
                />
              </div>

              {/* Prix d'Achat Initial (Coût) */}
              <div className="sm:col-span-1">
                <label className="block text-stone-600 font-semibold mb-1 text-[11px]">Coût Portion (DA)</label>
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
                <label className="block text-stone-600 font-semibold mb-1 text-[11px]">Stock Portions</label>
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
                {selectedIngredient && (
                  <span className="ml-2 text-stone-400">
                    ({stock} portions dispo selon le stock de {selectedIngredient.name_fr})
                  </span>
                )}
              </span>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-lg bg-[#E87524] hover:bg-[#D46317] text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Enregistrer le Supplément</span>
              </button>
            </div>
          </form>

          {/* Tableau Simple du Stock des Suppléments */}
          <div className="border border-[#E9DCCB] rounded-xl overflow-hidden bg-white">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#FFF8EF] border-b border-[#E9DCCB] text-stone-600 font-bold text-[11px]">
                  <th className="py-2.5 px-3">Nom du Supplément</th>
                  <th className="py-2.5 px-3">Origine / Liaison</th>
                  <th className="py-2.5 px-3 text-right">Coût Achat</th>
                  <th className="py-2.5 px-3 text-right">Prix Vente</th>
                  <th className="py-2.5 px-3 text-right">Marge</th>
                  <th className="py-2.5 px-3 text-center">Quantité en Stock</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E9DCCB]/60">
                {supplements.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center">
                      <Package className="w-10 h-10 text-stone-300 mx-auto mb-2" />
                      <p className="font-bold text-stone-700 text-sm">Aucun supplément enregistré</p>
                      <p className="text-xs text-stone-500 mt-1 max-w-sm mx-auto">
                        La liste est vide et prête pour votre carte réelle. Utilisez le formulaire ci-dessus pour ajouter vos propres garnitures et extras.
                      </p>
                      <span className="text-[11px] text-stone-400 font-arabic block mt-1" dir="rtl">
                        القائمة فارغة وجاهزة لإضافة مكوناتك الحقيقية.
                      </span>
                    </td>
                  </tr>
                ) : (
                  supplements.map(supp => {
                    const isEditing = editingId === supp.id;
                    const isLow = (supp.current_stock || 0) <= (supp.min_stock_alert || 5);
                    const isOut = (supp.current_stock || 0) <= 0;
                    const margin = (supp.price || 0) - (supp.purchase_cost || 0);
                    const linkedIng = ingredients.find(i => i.id === supp.ingredient_id);

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

                        {/* Origine / Liaison */}
                        <td className="py-2.5 px-3">
                          {supp.ingredient_id ? (
                            <div>
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                <Link2 className="w-3 h-3" />
                                {linkedIng?.name_fr || 'Ingrédient lié'}
                              </span>
                              <span className="text-[10px] text-stone-500 block mt-0.5 font-mono">
                                {isEditing ? (
                                  <span className="inline-flex items-center gap-1">
                                    Portion: 
                                    <input
                                      type="number"
                                      step={0.005}
                                      value={editPortion}
                                      onChange={e => setEditPortion(parseFloat(e.target.value) || 0)}
                                      className="w-14 px-1 py-0.5 border rounded text-xs font-mono"
                                    />
                                    {supp.ingredient_unit || linkedIng?.unit || ''}
                                  </span>
                                ) : (
                                  `${supp.portion_quantity || 1} ${supp.ingredient_unit || linkedIng?.unit || ''} / portion`
                                )}
                              </span>
                            </div>
                          ) : (
                            <span className="text-[10px] text-stone-400 font-medium italic">
                              Autonome (Libre)
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
                            <div className="inline-flex flex-col items-center">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleQuickAdjustStock(supp.id, -1)}
                                  className="w-5 h-5 rounded bg-stone-100 hover:bg-stone-200 text-stone-600 flex items-center justify-center transition-colors cursor-pointer"
                                  title="Déduire 1 portion"
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
                                  {supp.current_stock || 0} p.
                                </span>

                                <button
                                  type="button"
                                  onClick={() => handleQuickAdjustStock(supp.id, 1)}
                                  className="w-5 h-5 rounded bg-stone-100 hover:bg-stone-200 text-stone-600 flex items-center justify-center transition-colors cursor-pointer"
                                  title="Ajouter 1 portion au stock"
                                >
                                  <Plus className="w-3 h-3" />
                                </button>
                              </div>
                              {linkedIng && (
                                <span className="text-[9px] text-stone-400 font-mono mt-0.5">
                                  ({linkedIng.current_stock} {linkedIng.unit})
                                </span>
                              )}
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
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
