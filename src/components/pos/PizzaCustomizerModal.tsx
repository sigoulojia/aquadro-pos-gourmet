// Aquadro POS Algérie — Modal de Personnalisation de Pizza & Suppléments (Extras)
// Permet de choisir les suppléments (Extra Fromage, Champignons...) et instructions spéciales avec calcul du prix en direct.

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
  Coffee,
  Cake,
  Sliders,
  Sparkles,
  ShoppingBag
} from "lucide-react";

interface PizzaCustomizerModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  onAddToCart: (customizedItem: {
    product: Product;
    quantity: number;
    supplements: PizzaSupplement[];
    notes: string;
    totalUnitPrice: number;
  }) => void;
  onOpenSupplementsManager?: () => void;
}

export const PizzaCustomizerModal: React.FC<PizzaCustomizerModalProps> = ({
  isOpen,
  onClose,
  product,
  onAddToCart,
  onOpenSupplementsManager
}) => {
  const [supplements, setSupplements] = useState<PizzaSupplement[]>([]);
  const [selectedSupplements, setSelectedSupplements] = useState<PizzaSupplement[]>([]);
  const [quantity, setQuantity] = useState<number>(1);
  const [notes, setNotes] = useState<string>("");

  useEffect(() => {
    if (isOpen) {
      supplementService.getSupplements().then(setSupplements).catch(() => {});
      setSelectedSupplements([]);
      setQuantity(1);
      setNotes("");
    }
  }, [isOpen, product]);

  if (!isOpen || !product) return null;

  // Calcul du prix unitaire avec suppléments
  const supplementsTotal = selectedSupplements.reduce((sum, s) => sum + s.price, 0);
  const unitPrice = product.selling_price_ttc + supplementsTotal;
  const totalPrice = unitPrice * quantity;

  const toggleSupplement = (supp: PizzaSupplement) => {
    setSelectedSupplements(prev => {
      const exists = prev.some(s => s.id === supp.id);
      if (exists) {
        return prev.filter(s => s.id !== supp.id);
      } else {
        return [...prev, supp];
      }
    });
  };

  const handleConfirm = () => {
    onAddToCart({
      product,
      quantity,
      supplements: selectedSupplements,
      notes: notes.trim(),
      totalUnitPrice: unitPrice
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 select-none animate-in fade-in duration-150">
      <div className="bg-white border border-[#E9DCCB] rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* En-tête avec présentation du produit */}
        <div className="p-4 sm:p-5 border-b border-[#E9DCCB] bg-[#FFF8EF] flex items-center justify-between">
          <div className="flex items-center space-x-3.5">
            <div className="w-12 h-12 rounded-2xl bg-white border border-[#E9DCCB] overflow-hidden flex items-center justify-center shadow-xs shrink-0">
              {product.image_url ? (
                <img src={product.image_url} alt={product.name_fr} className="w-full h-full object-cover" />
              ) : (
                <Pizza className="w-6 h-6 text-[#E87524]" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold bg-[#FFF3EB] text-[#E87524] px-2 py-0.5 rounded-md border border-[#E87524]/20 uppercase">
                  Personnalisation
                </span>
                <span className="text-xs font-bold text-stone-500 font-mono">
                  Base : {CurrencyUtil.formatDZD(product.selling_price_ttc)}
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-black text-[#292522] leading-tight mt-0.5">
                {product.name_fr}
              </h2>
              {product.name_ar && (
                <p className="text-xs text-stone-500 font-arabic" dir="rtl">
                  {product.name_ar}
                </p>
              )}
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-white border border-[#E9DCCB] hover:bg-stone-100 flex items-center justify-center text-stone-500 hover:text-[#292522] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Corps : Liste des suppléments & instructions */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* Titre section suppléments */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1.5">
              <Sparkles className="w-4 h-4 text-[#E87524]" />
              <h3 className="font-extrabold text-sm text-[#292522]">
                Suppléments & Ingrédients Extra
              </h3>
            </div>
            {onOpenSupplementsManager && (
              <button
                type="button"
                onClick={onOpenSupplementsManager}
                className="text-xs text-[#E87524] hover:underline font-bold flex items-center gap-1 cursor-pointer"
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Gérer les suppléments</span>
              </button>
            )}
          </div>

          {/* Grille des suppléments */}
          {supplements.length === 0 ? (
            <p className="text-xs text-stone-400 italic">Aucun supplément configuré.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
              {supplements.map(supp => {
                const isSelected = selectedSupplements.some(s => s.id === supp.id);
                return (
                  <div
                    key={supp.id}
                    onClick={() => toggleSupplement(supp)}
                    className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between select-none ${
                      isSelected
                        ? "bg-[#FFF3EB] border-[#E87524] ring-2 ring-[#E87524]/20 shadow-xs"
                        : "bg-white border-[#E9DCCB] hover:border-amber-300 hover:bg-[#FFFDFB]"
                    }`}
                  >
                    <div className="flex items-center space-x-2.5 min-w-0 pr-1">
                      <div
                        className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-colors shrink-0 ${
                          isSelected
                            ? "bg-[#E87524] border-[#E87524] text-white"
                            : "bg-white border-stone-300"
                        }`}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </div>
                      <div className="min-w-0">
                        <p className={`text-xs font-bold truncate ${isSelected ? "text-[#E87524]" : "text-[#292522]"}`}>
                          {supp.name_fr}
                        </p>
                        {supp.name_ar && (
                          <p className="text-[10px] text-stone-500 font-arabic truncate" dir="rtl">
                            {supp.name_ar}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-xs font-black text-[#E87524] block font-mono">
                        +{CurrencyUtil.formatDZD(supp.price)}
                      </span>
                      <span className={`text-[10px] font-medium block ${supp.current_stock <= 0 ? "text-red-600 font-bold" : supp.current_stock <= (supp.min_stock_alert || 5) ? "text-amber-600" : "text-stone-400"}`}>
                        {supp.current_stock <= 0 ? "Rupture" : `Stock: ${supp.current_stock}`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Instructions spéciales / Notes pour la cuisine */}
          <div className="pt-2 border-t border-[#E9DCCB]/60">
            <label className="block text-xs font-bold text-stone-700 mb-1.5">
              Instructions spéciales pour le Chef Pizzaiolo :
            </label>
            <input
              type="text"
              placeholder="Ex: Bien cuite, sans oignon, pâte fine, couper en 8..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#FFF8EF] border border-[#E9DCCB] text-xs text-[#292522] placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-[#E87524] transition-all"
            />
          </div>
        </div>

        {/* Pied : Quantité & Validation */}
        <div className="p-4 sm:p-5 border-t border-[#E9DCCB] bg-[#FFF8EF] flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Sélecteur de quantité */}
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

          {/* Bouton d'ajout avec prix calculé */}
          <button
            onClick={handleConfirm}
            className="w-full sm:w-auto flex-1 py-3 px-5 rounded-2xl bg-[#E87524] hover:bg-[#D46317] text-white font-bold text-sm shadow-md shadow-orange-500/25 flex items-center justify-between gap-3 active:scale-[0.98] transition-all cursor-pointer"
          >
            <div className="flex items-center space-x-2">
              <ShoppingBag className="w-4 h-4" />
              <span>Ajouter à la commande</span>
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
