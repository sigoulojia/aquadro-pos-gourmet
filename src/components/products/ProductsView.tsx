// Pizzeria POS Algérie — Gestion Simple de la Carte & Menu Pizzeria
// Interface conviviale pour ajouter et modifier les pizzas et boissons avec photos réelles

import React, { useState, useEffect, useRef } from "react";
import { productService, CreateProductInput } from "../../services/product.service";
import { Product } from "../../types/database";
import { CurrencyUtil } from "../../core/currency/currency";
import { useToast } from "../common/Toast";
import {
  Search,
  Plus,
  Edit2,
  Trash2,
  X,
  Pizza,
  Coffee,
  UtensilsCrossed,
  Upload,
  Image as ImageIcon,
  Sparkles,
  Eye,
  Maximize2
} from "lucide-react";
import { SupplementsManagerModal } from "./SupplementsManagerModal";
import { PizzaAvailabilityModal } from "./PizzaAvailabilityModal";
import { recipeService, ProductIngredientStatus } from "../../services/recipe.service";
import { logger } from "../../services/logger.service";
import { useAuth } from "../../hooks/useAuth";

export const ProductsView: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [ingredientStatusMap, setIngredientStatusMap] = useState<Record<string, ProductIngredientStatus>>({});
  const [previewImageModal, setPreviewImageModal] = useState<{ url: string; title: string } | null>(null);
  const [imageFitMode, setImageFitMode] = useState<'contain' | 'cover'>('contain');
  const [search, setSearch] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [showSupplementsModal, setShowSupplementsModal] = useState<boolean>(false);
  const [availabilityModalProduct, setAvailabilityModalProduct] = useState<Product | null>(null);
  const [showAvailabilityModal, setShowAvailabilityModal] = useState<boolean>(false);
  const [priceInput, setPriceInput] = useState<string>("700");
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);

  // Formulaire Pizzeria avec image
  const [formData, setFormData] = useState({
    name_fr: "",
    name_ar: "",
    category_id: "cat-pizza",
    variant: "",
    selling_price_ttc: 700,
    image_url: "",
    is_active: 1
  });

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    const list = await productService.getProducts(false);
    setProducts(list);
    try {
      const statusMap = await recipeService.getAllProductsIngredientStatus();
      setIngredientStatusMap(statusMap);
    } catch (e) {
      console.warn("Erreur chargement conformité ingrédients:", e);
    }
  };

  const categories = [
    { id: "ALL", label: "Toutes les catégories" },
    { id: "cat-pizza", label: "Pizzas" },
    { id: "cat-drink", label: "Boissons" }
  ];

  const filteredProducts = products.filter(p => {
    const matchesCat = categoryFilter === "ALL" || p.category_id === categoryFilter;
    const q = search.toLowerCase().trim();
    const matchesSearch =
      !q ||
      p.name_fr.toLowerCase().includes(q) ||
      (p.name_ar && p.name_ar.toLowerCase().includes(q)) ||
      (p.variant && p.variant.toLowerCase().includes(q));
    return matchesCat && matchesSearch;
  });

  const handlePriceChange = (valStr: string) => {
    const cleaned = valStr.replace(/[^0-9]/g, "");
    setPriceInput(cleaned);
    const parsed = parseInt(cleaned, 10) || 0;
    setFormData(prev => ({ ...prev, selling_price_ttc: parsed }));
  };

  const handleAdjustPrice = (delta: number) => {
    const current = parseInt(priceInput, 10) || 0;
    const nextVal = Math.max(0, current + delta);
    setPriceInput(nextVal.toString());
    setFormData(prev => ({ ...prev, selling_price_ttc: nextVal }));
  };

  const handleSetQuickPrice = (preset: number) => {
    setPriceInput(preset.toString());
    setFormData(prev => ({ ...prev, selling_price_ttc: preset }));
  };

  const handleOpenAddModal = () => {
    setEditingProduct(null);
    setPriceInput("700");
    setFormData({
      name_fr: "",
      name_ar: "",
      category_id: "cat-pizza",
      variant: "",
      selling_price_ttc: 700,
      image_url: "",
      is_active: 1
    });
    setShowAddModal(true);
  };

  const handleQuickAddMultiPartPizza = () => {
    setEditingProduct(null);
    setPriceInput("800");
    setFormData({
      name_fr: "Pizza Moitié - Moitié",
      name_ar: "بيتزا نصفين",
      category_id: "cat-pizza",
      variant: "2 saveurs au choix",
      selling_price_ttc: 800,
      image_url: "",
      is_active: 1
    });
    setShowAddModal(true);
  };



  const handleOpenEditModal = (p: Product) => {
    setEditingProduct(p);
    const initialPrice = p.selling_price_ttc || 700;
    setPriceInput(initialPrice.toString());
    setFormData({
      name_fr: p.name_fr || (p as any).name || "",
      name_ar: p.name_ar || "",
      category_id: p.category_id || "cat-pizza",
      variant: p.variant || "",
      selling_price_ttc: initialPrice,
      image_url: p.image_url || "",
      is_active: p.is_active
    });
    setShowAddModal(true);
  };

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 3 * 1024 * 1024) {
        showToast("L'image est trop volumineuse (max 3 Mo)", "warning");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          setFormData(prev => ({ ...prev, image_url: reader.result as string }));
          showToast("Photo du produit chargée avec succès", "info");
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveImage = () => {
    setFormData(prev => ({ ...prev, image_url: "" }));
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Ouvrir le modal d'analyse de conformité des ingrédients et de réapprovisionnement
  const handleOpenAvailabilityModal = (p: Product) => {
    setAvailabilityModalProduct(p);
    setShowAvailabilityModal(true);
  };

  // Basculer l'état actif/inactif manuel sans supprimer l'article
  const handleToggleActiveFromModal = async (p: Product, nextActive: number) => {
    try {
      await productService.updateProduct(p.id, { is_active: nextActive });
      setProducts(prev =>
        prev.map(item => (item.id === p.id ? { ...item, is_active: nextActive } : item))
      );
      if (availabilityModalProduct && availabilityModalProduct.id === p.id) {
        setAvailabilityModalProduct({ ...availabilityModalProduct, is_active: nextActive });
      }
      showToast(
        nextActive === 1
          ? `تم تفعيل "${p.name_fr}" في القائمة بنجاح`
          : `تم تعطيل "${p.name_fr}" مؤقتاً في القائمة دون حذفه`,
        "info"
      );
    } catch (err: any) {
      showToast(`Erreur : ${err?.message || err}`, "error");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name_fr.trim()) {
      showToast("Le nom du produit est obligatoire", "warning");
      return;
    }
    const finalPrice = parseInt(priceInput, 10) || formData.selling_price_ttc;
    if (finalPrice <= 0) {
      showToast("يرجى إدخال سعر بيع صحيح أكبر من الصفر", "warning");
      return;
    }

    try {
      if (editingProduct) {
        // Modification
        await productService.updateProduct(editingProduct.id, {
          name_fr: formData.name_fr,
          name_ar: formData.name_ar,
          category_id: formData.category_id,
          variant: formData.variant,
          selling_price_ttc: finalPrice,
          image_url: formData.image_url || undefined,
          is_active: formData.is_active
        });
        showToast("Article mis à jour avec succès !", "success");
      } else {
        // Création simple
        const codeSuffix = Date.now().toString().slice(-6);
        const isPizza = formData.category_id === 'cat-pizza' || formData.category_id.includes('pizza');
        const input: CreateProductInput = {
          name_fr: formData.name_fr,
          name_ar: formData.name_ar,
          category_id: formData.category_id,
          variant: formData.variant,
          sku: `PIZ-${codeSuffix}`,
          barcode: `613${codeSuffix}${Math.floor(Math.random() * 90 + 10)}`,
          purchase_cost: Math.round(finalPrice * 0.4),
          selling_price_ttc: finalPrice,
          image_url: formData.image_url || undefined,
          current_stock: isPizza ? 100 : 24,
          min_stock_alert: isPizza ? 0 : 5,
          unit_of_measure: "UNIT"
        };
        const createdProduct = await productService.createProduct(input);
        if (isPizza && createdProduct?.id) {
          try {
            await recipeService.applyDefaultPizzaRecipe(createdProduct.id);
          } catch (rErr) {
            console.warn('Auto recipe link on pizza create:', rErr);
          }
        }
        showToast("Nouvelle pizza / article ajouté au menu avec مقادير جاهزة !", "success");
      }
      setShowAddModal(false);
      loadProducts();
    } catch (err: any) {
      showToast(`Erreur d enregistrement : ${err?.message || err}`, "error");
    }
  };

  const handleDeleteProduct = (p: Product) => {
    setDeletingProduct(p);
  };

  const handleConfirmDeleteProduct = async () => {
    if (!deletingProduct) return;
    try {
      await productService.deleteProduct(deletingProduct.id);
      await logger.logProductDeleted(deletingProduct.id, deletingProduct.name_fr, user?.name || user?.role || 'Admin');
      showToast(`تم حذف "${deletingProduct.name_fr}" نهائياً من القائمة وقاعدة البيانات`, "success");
      setDeletingProduct(null);
      await loadProducts();
    } catch (err: any) {
      showToast(`Erreur : ${err?.message || err}`, "error");
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#FFF8EF] font-sans select-none">
      {/* Barre d en-tête de la Gestion du Menu */}
      <div className="bg-white px-6 py-4 border-b border-[#E9DCCB] flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
        <div>
          <h1 className="text-xl font-black text-[#292522] flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#FFF3EB] border border-[#E87524]/30 text-[#E87524] flex items-center justify-center">
              <Pizza className="w-5 h-5" />
            </div>
            <span>Carte & Menu Pizzeria</span>
          </h1>
          <p className="text-xs text-stone-500 mt-0.5">
            Gérez facilement vos pizzas, boissons et desserts avec photos réelles
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {/* Raccourci Ajout Pizza Moitié-Moitié */}
          <button
            onClick={handleQuickAddMultiPartPizza}
            className="px-3.5 py-2.5 rounded-xl bg-[#FFF8EF] hover:bg-[#FFF3EB] border border-[#E87524]/40 text-[#E87524] font-bold text-xs flex items-center justify-center gap-1.5 shadow-2xs transition-all cursor-pointer"
            title="Ajouter une pizza Moitié-Moitié à la carte"
          >
            <Plus className="w-3.5 h-3.5 text-[#E87524]" />
            <span>+ بيتزا نصفين (Moitié)</span>
          </button>


          <button
            onClick={() => setShowSupplementsModal(true)}
            className="px-3.5 py-2.5 rounded-xl bg-white hover:bg-[#FFF3EB] border border-[#E9DCCB] text-[#E87524] font-bold text-xs flex items-center justify-center gap-1.5 shadow-2xs transition-all cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#E87524]" />
            <span>Gérer Suppléments</span>
          </button>

          <button
            onClick={handleOpenAddModal}
            className="px-4 py-2.5 rounded-xl bg-[#E87524] hover:bg-[#D46317] active:bg-[#B9362B] text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm shadow-orange-500/25 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Ajouter une Pizza ou Article</span>
          </button>
        </div>
      </div>

      {/* Barre de Recherche et Filtres */}
      <div className="px-6 py-3 bg-white/70 border-b border-[#E9DCCB] flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          {categories.map(c => (
            <button
              key={c.id}
              onClick={() => setCategoryFilter(c.id)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                categoryFilter === c.id
                  ? "bg-[#E87524] text-white shadow-xs"
                  : "bg-white text-stone-600 hover:bg-[#FFF3EB] border border-[#E9DCCB]"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-3 pointer-events-none" />
          <input
            type="text"
            placeholder="Rechercher..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-8 py-2 bg-white border border-[#E9DCCB] rounded-xl text-xs text-[#292522] placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-[#E87524]"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-2.5 text-stone-400 hover:text-stone-600 p-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Table des Pizzas & Produits */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="bg-white rounded-2xl border border-[#E9DCCB] overflow-hidden shadow-xs">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#FFF8EF] border-b border-[#E9DCCB] text-[11px] font-bold text-stone-500 uppercase tracking-wider">
                <th className="py-3.5 px-4">Article & Photo</th>
                <th className="py-3.5 px-4">Catégorie</th>
                <th className="py-3.5 px-4 text-right">Prix Public</th>
                <th className="py-3.5 px-4 text-center">Disponibilité</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E9DCCB]/60 text-xs text-[#292522]">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-stone-500">
                    <UtensilsCrossed className="w-12 h-12 text-[#E87524]/40 mx-auto mb-3" />
                    <p className="font-bold text-sm text-[#292522]">
                      {products.length === 0 ? "Votre carte est vide pour le moment" : "Aucun article trouvé"}
                    </p>
                    <p className="text-xs text-stone-500 mt-1">
                      {products.length === 0
                        ? "Commencez par ajouter vos propres pizzas avec photo ci-dessous."
                        : "Essayez un autre mot-clé ou filtre."}
                    </p>
                    {products.length === 0 && (
                      <button
                        onClick={handleOpenAddModal}
                        className="mt-4 px-4 py-2.5 bg-[#E87524] hover:bg-[#D46317] text-white rounded-xl font-bold shadow-xs inline-flex items-center gap-2 cursor-pointer text-xs"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Ajouter la première pizza</span>
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                filteredProducts.map(p => (
                  <tr key={p.id} className="hover:bg-[#FFFDFB] transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3.5">
                        {/* Photo réelle ou Icône SVG haute qualité */}
                        <div
                          className="w-16 h-16 rounded-xl bg-[#FFF8EF] border border-[#E9DCCB] flex items-center justify-center shrink-0 overflow-hidden shadow-2xs group relative cursor-pointer"
                          onClick={() => {
                            if (p.image_url) {
                              setPreviewImageModal({ url: p.image_url, title: p.name_fr });
                            }
                          }}
                          title={p.image_url ? "انقر لتكبير صورة البيتزا بالحجم الكامل" : ""}
                        >
                          {p.image_url ? (
                            <>
                              <img
                                src={p.image_url}
                                alt={p.name_fr}
                                className="w-full h-full object-cover transition-transform group-hover:scale-110"
                              />
                              <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                <Maximize2 className="w-4 h-4 text-white drop-shadow" />
                              </div>
                            </>
                          ) : (
                            <div className="text-[#E87524]">
                              {p.category_id === "cat-drink" ? (
                                <Coffee className="w-8 h-8" />
                              ) : (
                                <Pizza className="w-8 h-8" />
                              )}
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="font-bold text-[#292522] text-sm">{p.name_fr}</div>
                          {p.name_ar && (
                            <div className="text-xs text-stone-400 font-arabic" dir="rtl">
                              {p.name_ar}
                            </div>
                          )}
                          {p.variant && (
                            <div className="text-[11px] text-stone-500 mt-0.5 max-w-md line-clamp-1">
                              {p.variant}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="px-3 py-1 rounded-full text-xs font-bold bg-[#FFF3EB] text-[#E87524] border border-[#E87524]/20 inline-flex items-center gap-1.5">
                        {p.category_id === "cat-drink" ? (
                          <Coffee className="w-3.5 h-3.5" />
                        ) : (
                          <Pizza className="w-3.5 h-3.5" />
                        )}
                        <span>{p.category_name || (p.category_id === "cat-drink" ? "Boissons" : "Pizzas")}</span>
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-black text-sm text-[#E87524] font-mono">
                      {CurrencyUtil.formatDZD(p.selling_price_ttc)}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      {(() => {
                        const ingStatus = ingredientStatusMap[p.id];
                        const isManuallyInactive = p.is_active === 0;
                        const isOutOfIngredients = !isManuallyInactive && ingStatus?.hasRecipe && !ingStatus.isAvailable;

                        return (
                          <button
                            onClick={() => handleOpenAvailabilityModal(p)}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer shadow-2xs hover:scale-102 ${
                              isManuallyInactive
                                ? "bg-stone-100 text-stone-600 border border-stone-300 hover:bg-stone-200"
                                : isOutOfIngredients
                                ? "bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100"
                                : "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                            }`}
                            title="عرض حالة المقادير وتوافق المخزون والطلب السريع"
                          >
                            <span
                              className={`w-2 h-2 rounded-full ${
                                isManuallyInactive
                                  ? "bg-stone-400"
                                  : isOutOfIngredients
                                  ? "bg-amber-500 animate-pulse"
                                  : "bg-emerald-500"
                              }`}
                            />
                            <span>
                              {isManuallyInactive
                                ? "معطلة يدوياً"
                                : isOutOfIngredients
                                ? `نقص مقادير (${ingStatus?.missingIngredients?.length || 1})`
                                : ingStatus?.hasRecipe
                                ? `متوفرة (${ingStatus.maxPortions})`
                                : "متوفرة"}
                            </span>
                          </button>
                        );
                      })()}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleOpenEditModal(p)}
                          className="p-2 rounded-xl text-stone-600 hover:text-[#E87524] hover:bg-[#FFF3EB] transition-colors border border-transparent hover:border-[#E9DCCB]"
                          title="Modifier"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteProduct(p)}
                          className="p-2 rounded-xl text-stone-600 hover:text-[#B9362B] hover:bg-red-50 transition-colors border border-transparent hover:border-red-200"
                          title="Supprimer de la carte"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal d'Ajout / Édition avec Upload de Photo */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 select-none backdrop-blur-xs">
          <div className="bg-white border border-[#E9DCCB] w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col text-xs text-[#292522]">
            <div className="px-6 py-4 border-b border-[#E9DCCB] bg-[#FFF8EF] flex items-center justify-between">
              <h3 className="text-base font-extrabold text-[#292522] flex items-center gap-2">
                <Pizza className="w-5 h-5 text-[#E87524]" />
                <span>{editingProduct ? "Modifier l'article" : "Nouvel article sur la carte"}</span>
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-stone-400 hover:text-stone-600 p-1.5 rounded-lg hover:bg-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[85vh] overflow-y-auto">
              {/* Zone d'Upload Photo Large & Claire (Full-size, Haute Résolution) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="font-bold text-stone-700 text-xs">
                    صورة البيتزا / المنتج (واضحة وكاملة بالحجم الأصلي)
                  </label>
                  {formData.image_url && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setImageFitMode(prev => prev === 'contain' ? 'cover' : 'contain')}
                        className="text-[10px] font-bold text-[#E87524] bg-[#FFF3EB] hover:bg-[#FFE6D4] px-2 py-0.5 rounded border border-[#E87524]/30"
                      >
                        {imageFitMode === 'contain' ? 'وضع: صورة كاملة (بدون قص)' : 'وضع: ملء الإطار'}
                      </button>
                    </div>
                  )}
                </div>

                <div className="bg-[#FFF8EF]/80 border-2 border-dashed border-[#E9DCCB] rounded-2xl p-4 space-y-3">
                  {formData.image_url ? (
                    <div className="space-y-3">
                      <div className="w-full h-56 sm:h-64 rounded-xl bg-stone-900/5 border border-[#E9DCCB] flex items-center justify-center overflow-hidden shadow-inner relative group">
                        <img
                          src={formData.image_url}
                          alt="Aperçu Grand Format"
                          className={`w-full h-full transition-all duration-200 ${
                            imageFitMode === 'contain' ? 'object-contain p-2' : 'object-cover'
                          }`}
                        />
                        <button
                          type="button"
                          onClick={() => setPreviewImageModal({ url: formData.image_url, title: formData.name_fr || 'معاينة صورة البيتزا' })}
                          className="absolute bottom-3 right-3 bg-black/70 hover:bg-black/90 text-white px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1.5 backdrop-blur-xs transition shadow"
                          title="عرض الصورة بملء الشاشة"
                        >
                          <Maximize2 className="w-3.5 h-3.5" />
                          <span>تكبير بالحجم الكامل</span>
                        </button>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-emerald-700 font-bold flex items-center gap-1">
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>تم تحميل الصورة بدقة عالية وكاملة</span>
                        </span>
                        <div className="flex items-center gap-2">
                          <label
                            htmlFor="product-photo-upload"
                            className="px-3 py-1.5 bg-white hover:bg-[#FFF3EB] text-[#E87524] border border-[#E87524]/30 rounded-xl font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
                          >
                            <Upload className="w-3.5 h-3.5" />
                            <span>تغيير الصورة</span>
                          </label>
                          <button
                            type="button"
                            onClick={handleRemoveImage}
                            className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-[#B9362B] border border-red-200 rounded-xl font-bold text-xs inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>إزالة</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <label
                      htmlFor="product-photo-upload"
                      className="flex flex-col items-center justify-center w-full h-44 border-2 border-dashed border-[#E87524]/30 hover:border-[#E87524] rounded-xl bg-white hover:bg-[#FFF8EF]/50 cursor-pointer transition-all group"
                    >
                      <div className="w-14 h-14 rounded-2xl bg-[#FFF3EB] text-[#E87524] flex items-center justify-center mb-2 group-hover:scale-110 transition-transform shadow-xs">
                        <Upload className="w-6 h-6" />
                      </div>
                      <span className="font-extrabold text-xs text-[#292522]">
                        انقر هنا لاختيار صورة البيتزا من الحاسوب
                      </span>
                      <span className="text-[10px] text-stone-500 mt-1">
                        تظهر الصورة واضحة وكاملة بحجمها الطبيعي بدون أي تشويه (JPG, PNG, WebP)
                      </span>
                    </label>
                  )}

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageFileChange}
                    className="hidden"
                    id="product-photo-upload"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1">Nom de l'article (Français) *</label>
                <input
                  type="text"
                  required
                  placeholder=""
                  value={formData.name_fr}
                  onChange={e => setFormData({ ...formData, name_fr: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-[#FFF8EF]/50 border border-[#E9DCCB] rounded-xl text-xs text-[#292522] focus:ring-2 focus:ring-[#E87524] focus:outline-none"
                  autoFocus
                />
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1">Nom en Arabe (Optionnel)</label>
                <input
                  type="text"
                  placeholder=""
                  value={formData.name_ar}
                  onChange={e => setFormData({ ...formData, name_ar: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-[#FFF8EF]/50 border border-[#E9DCCB] rounded-xl text-xs text-[#292522] focus:ring-2 focus:ring-[#E87524] focus:outline-none font-arabic"
                  dir="rtl"
                />
              </div>

              {/* Catégorie */}
              <div>
                <label className="block font-bold text-stone-700 mb-1.5">
                  الصنف / Catégorie *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setFormData(prev => ({ ...prev, category_id: "cat-pizza" }));
                      if (formData.category_id !== "cat-pizza" && formData.selling_price_ttc < 300) {
                        handleSetQuickPrice(700);
                      }
                    }}
                    className={`py-2 px-3 rounded-xl border font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-all ${
                      formData.category_id === "cat-pizza"
                        ? "bg-[#FFF3EB] border-[#E87524] text-[#E87524] shadow-xs"
                        : "bg-white border-[#E9DCCB] text-stone-600 hover:bg-stone-50"
                    }`}
                  >
                    <Pizza className="w-4 h-4" />
                    <span>بيتزا (Pizzas)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setFormData(prev => ({ ...prev, category_id: "cat-drink" }));
                      if (formData.category_id !== "cat-drink" && formData.selling_price_ttc >= 300) {
                        handleSetQuickPrice(100);
                      }
                    }}
                    className={`py-2 px-3 rounded-xl border font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-all ${
                      formData.category_id === "cat-drink"
                        ? "bg-[#FFF3EB] border-[#E87524] text-[#E87524] shadow-xs"
                        : "bg-white border-[#E9DCCB] text-stone-600 hover:bg-stone-50"
                    }`}
                  >
                    <Coffee className="w-4 h-4" />
                    <span>مشروبات (Boissons)</span>
                  </button>
                </div>
              </div>

              {/* Section Prix de Vente Simplifiée et Ergonomique */}
              <div className="bg-[#FFF8EF] border border-[#E9DCCB] rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="font-extrabold text-stone-800 text-xs flex items-center gap-1.5">
                    <span>سعر البيع (دينار جزائري) *</span>
                    <span className="text-stone-400 font-normal">/ Prix de Vente</span>
                  </label>
                  <span className="text-xs font-black text-[#E87524] font-mono bg-white px-2.5 py-0.5 rounded-lg border border-[#E9DCCB]">
                    {CurrencyUtil.formatDZD(parseInt(priceInput, 10) || formData.selling_price_ttc)}
                  </span>
                </div>

                {/* Champ Saisie + Boutons d'ajustement +/- */}
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleAdjustPrice(-100)}
                    className="px-2.5 py-2.5 rounded-xl bg-white border border-[#E9DCCB] hover:bg-stone-100 font-black text-stone-700 text-xs transition-colors shrink-0 cursor-pointer shadow-2xs"
                    title="إنقاص 100 دج"
                  >
                    -100
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAdjustPrice(-50)}
                    className="px-2.5 py-2.5 rounded-xl bg-white border border-[#E9DCCB] hover:bg-stone-100 font-black text-stone-700 text-xs transition-colors shrink-0 cursor-pointer shadow-2xs"
                    title="إنقاص 50 دج"
                  >
                    -50
                  </button>

                  <div className="relative flex-1">
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      required
                      value={priceInput}
                      onFocus={e => e.target.select()}
                      onChange={e => handlePriceChange(e.target.value)}
                      placeholder=""
                      className="w-full py-2.5 px-3 bg-white border-2 border-[#E87524] rounded-xl text-center font-black text-lg text-[#E87524] font-mono focus:ring-4 focus:ring-[#E87524]/20 focus:outline-none shadow-xs"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-stone-400 pointer-events-none">
                      دج
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleAdjustPrice(50)}
                    className="px-2.5 py-2.5 rounded-xl bg-white border border-[#E9DCCB] hover:bg-stone-100 font-black text-stone-700 text-xs transition-colors shrink-0 cursor-pointer shadow-2xs"
                    title="إضافة 50 دج"
                  >
                    +50
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAdjustPrice(100)}
                    className="px-2.5 py-2.5 rounded-xl bg-white border border-[#E9DCCB] hover:bg-stone-100 font-black text-stone-700 text-xs transition-colors shrink-0 cursor-pointer shadow-2xs"
                    title="إضافة 100 دج"
                  >
                    +100
                  </button>
                </div>

                {/* Boutons de Choix Rapide en 1 clic */}
                <div>
                  <div className="text-[10px] text-stone-500 font-bold mb-1.5 flex items-center justify-between">
                    <span>اختر السعر بنقرة واحدة (Prix rapides) :</span>
                    <span className="text-[9px] text-stone-400">انقر للتعيين الفوري</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(formData.category_id === "cat-drink"
                      ? [50, 70, 80, 100, 120, 150, 200, 250]
                      : [400, 500, 600, 700, 800, 900, 1000, 1200, 1400, 1500]
                    ).map(preset => {
                      const currentVal = parseInt(priceInput, 10) || formData.selling_price_ttc;
                      const isSelected = currentVal === preset;
                      return (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => handleSetQuickPrice(preset)}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            isSelected
                              ? "bg-[#E87524] text-white shadow-xs scale-105"
                              : "bg-white hover:bg-[#FFF3EB] text-stone-700 border border-[#E9DCCB] hover:border-[#E87524]"
                          }`}
                        >
                          {preset} دج
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1">Ingrédients / Recette / Description</label>
                <textarea
                  rows={2}
                  placeholder=""
                  value={formData.variant}
                  onChange={e => setFormData({ ...formData, variant: e.target.value })}
                  className="w-full px-3.5 py-2 bg-[#FFF8EF]/50 border border-[#E9DCCB] rounded-xl text-xs text-[#292522] focus:ring-2 focus:ring-[#E87524] focus:outline-none"
                />
              </div>

              <div className="pt-4 border-t border-[#E9DCCB] flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-5 py-2.5 rounded-xl border border-[#E9DCCB] bg-white text-stone-600 hover:bg-stone-50 font-bold text-xs cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-[#E87524] hover:bg-[#D46317] text-white font-bold text-xs shadow-sm shadow-orange-500/25 cursor-pointer"
                >
                  {editingProduct ? "Enregistrer les Modifications" : "Ajouter à la Carte"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Gestion des Suppléments Pizza */}
      {showSupplementsModal && (
        <SupplementsManagerModal
          isOpen={true}
          onClose={() => setShowSupplementsModal(false)}
        />
      )}

      {/* Modal d'Analyse de Conformité des Ingrédients & Réapprovisionnement Rapide */}
      {showAvailabilityModal && availabilityModalProduct && (
        <PizzaAvailabilityModal
          isOpen={showAvailabilityModal}
          onClose={() => {
            setShowAvailabilityModal(false);
            setAvailabilityModalProduct(null);
          }}
          product={availabilityModalProduct}
          status={ingredientStatusMap[availabilityModalProduct.id] || null}
          onRefresh={async () => {
            await loadProducts();
            if (availabilityModalProduct) {
              const updated = await recipeService.checkProductIngredientStatus(availabilityModalProduct);
              setIngredientStatusMap(prev => ({ ...prev, [availabilityModalProduct.id]: updated }));
            }
          }}
          onToggleActive={handleToggleActiveFromModal}
        />
      )}

      {/* Modal Confirmation de Suppression Définitive */}
      {deletingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-stone-200 shadow-2xl max-w-sm w-full p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-stone-900 text-sm">تأكيد الحذف النهائي للطبق</h3>
                <p className="text-xs text-stone-500">Suppression définitive de la base de données</p>
              </div>
            </div>

            <p className="text-xs text-stone-600 leading-relaxed">
              هل أنت متأكد من رغبتك في حذف <strong className="text-rose-600 font-bold">"{deletingProduct.name_fr}"</strong> نهائياً؟ سيتم حذفه بالكامل ولن يظهر في القائمة.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
              <button
                type="button"
                onClick={() => setDeletingProduct(null)}
                className="px-3 py-1.5 rounded-lg border border-stone-200 text-stone-600 hover:bg-stone-50 text-xs font-semibold cursor-pointer"
              >
                إلغاء (Annuler)
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteProduct}
                className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-sm flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>حذف نهائي</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal d'Aperçu Haute Définition Plein Écran de l'Image */}
      {previewImageModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 select-none cursor-pointer"
          onClick={() => setPreviewImageModal(null)}
        >
          <div
            className="bg-stone-900 border border-stone-700 rounded-2xl max-w-2xl w-full p-4 space-y-3 cursor-default"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between text-white pb-2 border-b border-stone-800">
              <div className="font-bold text-sm flex items-center gap-2">
                <Pizza className="w-4 h-4 text-[#E87524]" />
                <span>{previewImageModal.title} — صورة كاملة عالية الدقة</span>
              </div>
              <button
                onClick={() => setPreviewImageModal(null)}
                className="text-stone-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="w-full max-h-[70vh] flex items-center justify-center overflow-hidden rounded-xl bg-stone-950 p-2">
              <img
                src={previewImageModal.url}
                alt={previewImageModal.title}
                className="max-w-full max-h-[65vh] object-contain rounded-lg shadow-2xl"
              />
            </div>

            <div className="flex justify-end pt-1">
              <button
                onClick={() => setPreviewImageModal(null)}
                className="px-4 py-1.5 bg-[#E87524] text-white rounded-lg text-xs font-bold"
              >
                إغلاق (Fermer)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
