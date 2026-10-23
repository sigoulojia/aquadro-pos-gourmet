// Aquadro POS Algérie — Modal Pizza Multi-Saveurs (Moitié-Moitié & 4 Saisons)
// RÈGLE COMMERCIALE EXIGÉE : Le prix de base est automatiquement fixé sur le prix de la pizza la plus chère sélectionnée.

import React, { useState, useEffect } from "react";
import { Product } from "../../types/database";
import { supplementService, PizzaSupplement } from "../../services/supplement.service";
import { CurrencyUtil } from "../../core/currency/currency";
import {
  X,
  Plus,
  Minus,
  Check,
  Pizza,
  Sparkles,
  ShoppingBag,
  SlidersHorizontal
} from "lucide-react";

interface MultiPartPizzaModalProps {
  isOpen: boolean;
  onClose: () => void;
  availablePizzas: Product[];
  initialMode?: "2_PARTS" | "4_PARTS";
  onAddToCart: (item: {
    compositeProduct: Product;
    quantity: number;
    supplements: PizzaSupplement[];
    notes: string;
    totalUnitPrice: number;
    multiParts: {
      type: "2_PARTS" | "4_PARTS";
      parts: Array<{ name: string; price: number; id: string }>;
    };
  }) => void;
}

export const MultiPartPizzaModal: React.FC<MultiPartPizzaModalProps> = ({
  isOpen,
  onClose,
  availablePizzas,
  initialMode = "2_PARTS",
  onAddToCart
}) => {
  const [mode, setMode] = useState<"2_PARTS" | "4_PARTS">(initialMode);
  const [part1, setPart1] = useState<string>("");
  const [part2, setPart2] = useState<string>("");
  const [part3, setPart3] = useState<string>("");
  const [part4, setPart4] = useState<string>("");

  const [supplements, setSupplements] = useState<PizzaSupplement[]>([]);
  const [selectedSupplements, setSelectedSupplements] = useState<PizzaSupplement[]>([]);
  const [quantity, setQuantity] = useState<number>(1);
  const [notes, setNotes] = useState<string>("");

  // Filtrer uniquement les pizzas
  const pizzaList = availablePizzas.filter(p => !p.category_id || p.category_id === "cat-pizza");

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      supplementService.getSupplements().then(setSupplements).catch(() => {});
      setSelectedSupplements([]);
      setQuantity(1);
      setNotes("");

      if (pizzaList.length >= 2) {
        setPart1(pizzaList[0].id);
        setPart2(pizzaList[1].id);
        setPart3(pizzaList[0].id);
        setPart4(pizzaList[1].id);
      } else if (pizzaList.length === 1) {
        setPart1(pizzaList[0].id);
        setPart2(pizzaList[0].id);
        setPart3(pizzaList[0].id);
        setPart4(pizzaList[0].id);
      }
    }
  }, [isOpen, initialMode, availablePizzas]);

  if (!isOpen) return null;

  const getPizzaById = (id: string) => pizzaList.find(p => p.id === id);

  const selectedP1 = getPizzaById(part1);
  const selectedP2 = getPizzaById(part2);
  const selectedP3 = getPizzaById(part3);
  const selectedP4 = getPizzaById(part4);

  // RÈGLE CLIENT : Calcul automatique du prix le plus élevé parmi les parties choisies
  let highestBasePrice = 0;
  if (mode === "2_PARTS") {
    highestBasePrice = Math.max(
      selectedP1?.selling_price_ttc || 0,
      selectedP2?.selling_price_ttc || 0
    );
  } else {
    highestBasePrice = Math.max(
      selectedP1?.selling_price_ttc || 0,
      selectedP2?.selling_price_ttc || 0,
      selectedP3?.selling_price_ttc || 0,
      selectedP4?.selling_price_ttc || 0
    );
  }

  const supplementsTotal = selectedSupplements.reduce((sum, s) => sum + s.price, 0);
  const unitPrice = highestBasePrice + supplementsTotal;
  const totalPrice = unitPrice * quantity;

  const toggleSupplement = (supp: PizzaSupplement) => {
    setSelectedSupplements(prev => {
      const exists = prev.some(s => s.id === supp.id);
      if (exists) return prev.filter(s => s.id !== supp.id);
      return [...prev, supp];
    });
  };

  const handleConfirm = () => {
    const partsArray = mode === "2_PARTS"
      ? [
          { id: selectedP1?.id || "", name: selectedP1?.name_fr || "Partie 1", price: selectedP1?.selling_price_ttc || 0 },
          { id: selectedP2?.id || "", name: selectedP2?.name_fr || "Partie 2", price: selectedP2?.selling_price_ttc || 0 }
        ]
      : [
          { id: selectedP1?.id || "", name: selectedP1?.name_fr || "1/4", price: selectedP1?.selling_price_ttc || 0 },
          { id: selectedP2?.id || "", name: selectedP2?.name_fr || "2/4", price: selectedP2?.selling_price_ttc || 0 },
          { id: selectedP3?.id || "", name: selectedP3?.name_fr || "3/4", price: selectedP3?.selling_price_ttc || 0 },
          { id: selectedP4?.id || "", name: selectedP4?.name_fr || "4/4", price: selectedP4?.selling_price_ttc || 0 }
        ];

    const variantName = mode === "2_PARTS"
      ? `1/2 ${selectedP1?.name_fr || ""} + 1/2 ${selectedP2?.name_fr || ""}`
      : `4 Saisons (${selectedP1?.name_fr || ""}, ${selectedP2?.name_fr || ""}, ${selectedP3?.name_fr || ""}, ${selectedP4?.name_fr || ""})`;

    // Produit virtuel ou référence produit principal pour compatibilité base
    const baseProductRef = selectedP1 || availablePizzas[0] || {
      id: "prod-multi-pizza",
      name_fr: mode === "2_PARTS" ? "Pizza Moitié-Moitié" : "Pizza 4 Saisons",
      name_ar: mode === "2_PARTS" ? "بيتزا نصف-نصف" : "بيتزا 4 فصول",
      sku: "PIZ-MULTI",
      barcode: "PIZ-MULTI",
      selling_price_ttc: unitPrice,
      purchase_cost: Math.round(unitPrice * 0.4),
      min_selling_price_ttc: unitPrice,
      tva_rate: 0,
      current_stock: 100,
      min_stock_alert: 5,
      is_active: 1,
      unit_of_measure: "UNIT" as any,
      box_conversion_ratio: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const compositeProduct: Product = {
      ...baseProductRef,
      name_fr: mode === "2_PARTS" ? "Pizza Moitié-Moitié" : "Pizza 4 Saisons",
      name_ar: mode === "2_PARTS" ? "بيتزا نصف-نصف (فصلين)" : "بيتزا 4 فصول",
      variant: variantName,
      selling_price_ttc: unitPrice
    };

    onAddToCart({
      compositeProduct,
      quantity,
      supplements: selectedSupplements,
      notes: notes.trim(),
      totalUnitPrice: unitPrice,
      multiParts: {
        type: mode,
        parts: partsArray
      }
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 select-none animate-in fade-in duration-150">
      <div className="bg-white border border-[#E9DCCB] rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* En-tête avec choix 2 Saisons ou 4 Saisons */}
        <div className="p-4 sm:p-5 border-b border-[#E9DCCB] bg-[#FFF8EF] flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#E87524] to-[#FFC928] text-white flex items-center justify-center shadow-xs shrink-0">
              <Pizza className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold bg-[#FFF3EB] text-[#E87524] px-2 py-0.5 rounded-md border border-[#E87524]/20 uppercase">
                  Multi-Saveurs
                </span>
                <span className="text-xs font-mono font-bold text-stone-600">
                  Règle : Prix max automatique
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-black text-[#292522] leading-tight mt-0.5">
                {mode === "2_PARTS" ? "Pizza Moitié - Moitié (2 Choix)" : "Pizza 4 Saisons (4 Choix)"}
              </h2>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* Toggle 2 Saisons / 4 Saisons */}
            <div className="flex items-center bg-white p-1 rounded-xl border border-[#E9DCCB]">
              <button
                type="button"
                onClick={() => setMode("2_PARTS")}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  mode === "2_PARTS"
                    ? "bg-[#E87524] text-white shadow-xs"
                    : "text-stone-600 hover:text-[#292522]"
                }`}
              >
                2 Saisons (1/2)
              </button>
              <button
                type="button"
                onClick={() => setMode("4_PARTS")}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  mode === "4_PARTS"
                    ? "bg-[#E87524] text-white shadow-xs"
                    : "text-stone-600 hover:text-[#292522]"
                }`}
              >
                4 Saisons (1/4)
              </button>
            </div>

            <button
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-white border border-[#E9DCCB] hover:bg-stone-100 flex items-center justify-center text-stone-500 hover:text-[#292522] transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Corps : Choix des pizzas par quartier */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* Bannière d'explication du prix */}
          <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center justify-between">
            <div>
              <p className="font-bold">Calcul automatique de la pizza :</p>
              <p className="text-[11px] text-amber-700 mt-0.5">
                Le système applique automatiquement le prix de la référence la plus chère parmi vos choix.
              </p>
            </div>
            <div className="text-right">
              <span className="text-[10px] uppercase font-bold text-amber-600">Base retenue</span>
              <p className="text-base font-black text-[#E87524] font-mono">
                {CurrencyUtil.formatDZD(highestBasePrice)}
              </p>
            </div>
          </div>

          {/* Sélecteurs des parties */}
          {mode === "2_PARTS" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Moitié 1 */}
              <div className="p-3.5 rounded-2xl bg-[#FFF8EF] border border-[#E9DCCB]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-[#E87524] uppercase">Première Moitié (1/2)</span>
                  <span className="text-xs font-mono font-bold text-stone-600">
                    {CurrencyUtil.formatDZD(selectedP1?.selling_price_ttc || 0)}
                  </span>
                </div>
                <select
                  value={part1}
                  onChange={e => setPart1(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-white border border-[#E9DCCB] text-xs font-bold text-[#292522] focus:ring-2 focus:ring-[#E87524] outline-none"
                >
                  {pizzaList.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name_fr} ({CurrencyUtil.formatDZD(p.selling_price_ttc)})
                    </option>
                  ))}
                </select>
              </div>

              {/* Moitié 2 */}
              <div className="p-3.5 rounded-2xl bg-[#FFF8EF] border border-[#E9DCCB]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-[#E87524] uppercase">Deuxième Moitié (1/2)</span>
                  <span className="text-xs font-mono font-bold text-stone-600">
                    {CurrencyUtil.formatDZD(selectedP2?.selling_price_ttc || 0)}
                  </span>
                </div>
                <select
                  value={part2}
                  onChange={e => setPart2(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-white border border-[#E9DCCB] text-xs font-bold text-[#292522] focus:ring-2 focus:ring-[#E87524] outline-none"
                >
                  {pizzaList.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name_fr} ({CurrencyUtil.formatDZD(p.selling_price_ttc)})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { label: "1er Quartier (1/4)", val: part1, setVal: setPart1, p: selectedP1 },
                { label: "2e Quartier (2/4)", val: part2, setVal: setPart2, p: selectedP2 },
                { label: "3e Quartier (3/4)", val: part3, setVal: setPart3, p: selectedP3 },
                { label: "4e Quartier (4/4)", val: part4, setVal: setPart4, p: selectedP4 }
              ].map((q, idx) => (
                <div key={idx} className="p-3 rounded-2xl bg-[#FFF8EF] border border-[#E9DCCB]">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-[#E87524]">{q.label}</span>
                    <span className="text-xs font-mono font-bold text-stone-600">
                      {CurrencyUtil.formatDZD(q.p?.selling_price_ttc || 0)}
                    </span>
                  </div>
                  <select
                    value={q.val}
                    onChange={e => q.setVal(e.target.value)}
                    className="w-full p-2 rounded-xl bg-white border border-[#E9DCCB] text-xs font-bold text-[#292522] focus:ring-2 focus:ring-[#E87524] outline-none"
                  >
                    {pizzaList.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name_fr} ({CurrencyUtil.formatDZD(p.selling_price_ttc)})
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}

          {/* Section Suppléments / Extras */}
          <div className="pt-2 border-t border-[#E9DCCB]/60">
            <div className="flex items-center space-x-1.5 mb-2.5">
              <Sparkles className="w-4 h-4 text-[#E87524]" />
              <h3 className="font-extrabold text-sm text-[#292522]">
                Ajouter des Suppléments à la Pizza
              </h3>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
              {supplements.map(supp => {
                const isSelected = selectedSupplements.some(s => s.id === supp.id);
                return (
                  <div
                    key={supp.id}
                    onClick={() => toggleSupplement(supp)}
                    className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between select-none ${
                      isSelected
                        ? "bg-[#FFF3EB] border-[#E87524] ring-2 ring-[#E87524]/20 shadow-xs"
                        : "bg-white border-[#E9DCCB] hover:border-amber-300"
                    }`}
                  >
                    <div className="flex items-center space-x-2 min-w-0 pr-1">
                      <div
                        className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 ${
                          isSelected ? "bg-[#E87524] border-[#E87524] text-white" : "bg-white border-stone-300"
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                      <span className={`text-xs font-bold truncate ${isSelected ? "text-[#E87524]" : "text-[#292522]"}`}>
                        {supp.name_fr}
                      </span>
                    </div>
                    <span className="text-xs font-black text-[#E87524] font-mono shrink-0">
                      +{CurrencyUtil.formatDZD(supp.price)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Instructions de cuisson */}
          <div className="pt-2 border-t border-[#E9DCCB]/60">
            <label className="block text-xs font-bold text-stone-700 mb-1">
              Instructions spéciales Chef :
            </label>
            <input
              type="text"
              placeholder="Ex: Pâte bien dorée, séparer les moitiés avec papier..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#FFF8EF] border border-[#E9DCCB] text-xs text-[#292522] placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-[#E87524] transition-all"
            />
          </div>
        </div>

        {/* Pied : Quantité & Validation */}
        <div className="p-4 sm:p-5 border-t border-[#E9DCCB] bg-[#FFF8EF] flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center space-x-2 bg-white border border-[#E9DCCB] p-1 rounded-2xl shadow-2xs">
            <button
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              className="w-8 h-8 rounded-xl bg-[#FFF8EF] hover:bg-[#FFF3EB] flex items-center justify-center text-stone-700 font-bold active:scale-95 transition-all cursor-pointer"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <span className="w-8 text-center font-black text-sm text-[#292522] font-mono">
              {quantity}
            </span>
            <button
              onClick={() => setQuantity(quantity + 1)}
              className="w-8 h-8 rounded-xl bg-[#E87524] hover:bg-[#D46317] flex items-center justify-center text-white font-bold active:scale-95 transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            onClick={handleConfirm}
            className="w-full sm:w-auto flex-1 py-3 px-5 rounded-2xl bg-[#E87524] hover:bg-[#D46317] text-white font-bold text-sm shadow-md shadow-orange-500/25 flex items-center justify-between gap-3 active:scale-[0.98] transition-all cursor-pointer"
          >
            <div className="flex items-center space-x-2">
              <ShoppingBag className="w-4 h-4" />
              <span>Ajouter la Pizza Multi-Saveurs</span>
            </div>
            <div className="bg-black/20 px-3 py-1 rounded-xl font-mono font-black text-sm">
              {CurrencyUtil.formatDZD(totalPrice)}
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};
