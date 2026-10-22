// Pizzeria POS Algérie — Gestion Simple de la Carte & Menu Pizzeria
// Interface conviviale pour ajouter, modifier les pizzas, boissons et desserts sans complexité technique

import React, { useState, useEffect } from "react";
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
  CheckCircle,
  AlertTriangle,
  UtensilsCrossed,
  ToggleLeft,
  ToggleRight
} from "lucide-react";

export const ProductsView: React.FC = () => {
  const { showToast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Formulaire Pizzeria Simple
  const [formData, setFormData] = useState({
    name_fr: "",
    name_ar: "",
    category_id: "cat-pizza",
    variant: "",
    selling_price_ttc: 0,
    is_active: 1
  });

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    const list = await productService.getProducts();
    setProducts(list);
  };

  const categories = [
    { id: "ALL", label: "Toutes les catégories" },
    { id: "cat-pizza", label: "Pizzas 🍕" },
    { id: "cat-drink", label: "Boissons 🥤" }
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

  const handleOpenAddModal = () => {
    setEditingProduct(null);
    setFormData({
      name_fr: "",
      name_ar: "",
      category_id: "cat-pizza",
      variant: "",
      selling_price_ttc: 700,
      is_active: 1
    });
    setShowAddModal(true);
  };

  const handleOpenEditModal = (p: Product) => {
    setEditingProduct(p);
    setFormData({
      name_fr: p.name_fr || (p as any).name || "",
      name_ar: p.name_ar || "",
      category_id: p.category_id || "cat-pizza",
      variant: p.variant || "",
      selling_price_ttc: p.selling_price_ttc,
      is_active: p.is_active
    });
    setShowAddModal(true);
  };

  // Basculer la disponibilité d une pizza en 1 clic
  const handleToggleAvailability = async (p: Product) => {
    try {
      const nextActive = p.is_active === 1 ? 0 : 1;
      await productService.updateProduct(p.id, { is_active: nextActive });
      setProducts(prev =>
        prev.map(item => (item.id === p.id ? { ...item, is_active: nextActive } : item))
      );
      showToast(
        nextActive === 1
          ? `${p.name_fr} marqué comme disponible`
          : `${p.name_fr} marqué en rupture de stock`,
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
    if (formData.selling_price_ttc <= 0) {
      showToast("Le prix doit être supérieur à zéro", "warning");
      return;
    }

    try {
      if (editingProduct) {
        // Modification
        await productService.updateProduct(editingProduct.id, {
          name_fr: formData.name_fr,
          name: formData.name_fr,
          name_ar: formData.name_ar,
          category_id: formData.category_id,
          variant: formData.variant,
          selling_price_ttc: formData.selling_price_ttc,
          is_active: formData.is_active
        });
        showToast("Article mis à jour avec succès !", "success");
      } else {
        // Création simple sans complexité de code-barre ou lot
        const codeSuffix = Date.now().toString().slice(-6);
        const input: CreateProductInput = {
          name_fr: formData.name_fr,
          name_ar: formData.name_ar,
          category_id: formData.category_id,
          variant: formData.variant,
          sku: `PIZ-${codeSuffix}`,
          barcode: `613${codeSuffix}${Math.floor(Math.random() * 90 + 10)}`,
          purchase_cost: Math.round(formData.selling_price_ttc * 0.4),
          selling_price_ttc: formData.selling_price_ttc,
          current_stock: 100,
          min_stock_alert: 5,
          unit_of_measure: "UNIT"
        };
        await productService.createProduct(input);
        showToast("Nouvelle pizza / article ajouté au menu !", "success");
      }
      setShowAddModal(false);
      loadProducts();
    } catch (err: any) {
      showToast(`Erreur d enregistrement : ${err?.message || err}`, "error");
    }
  };

  const handleDeleteProduct = async (p: Product) => {
    if (window.confirm(`Supprimer "${p.name_fr}" de la carte ?`)) {
      try {
        await productService.archiveProduct(p.id);
        showToast("Article retiré de la carte", "info");
        loadProducts();
      } catch (err: any) {
        showToast(`Erreur : ${err?.message || err}`, "error");
      }
    }
  };

  const getEmoji = (catId?: string) => {
    if (catId === "cat-drink") return "🥤";
    if (catId === "cat-sides") return "🍟";
    if (catId === "cat-dessert") return "🍰";
    return "🍕";
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#FFF8EF] font-sans select-none">
      {/* Barre d en-tête de la Gestion du Menu */}
      <div className="bg-white px-6 py-4 border-b border-[#E9DCCB] flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
        <div>
          <h1 className="text-lg font-black text-[#292522] flex items-center gap-2">
            <span>🍕</span>
            <span>Carte & Menu Pizzeria</span>
          </h1>
          <p className="text-xs text-stone-500">
            Gérez facilement vos pizzas, boissons, accompagnements et desserts
          </p>
        </div>

        <button
          onClick={handleOpenAddModal}
          className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-[#E87524] hover:bg-[#D46317] active:bg-[#B9362B] text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm shadow-orange-500/25 transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Ajouter une Pizza ou Article</span>
        </button>
      </div>

      {/* Barre de Filtres & Recherche */}
      <div className="px-6 py-3 bg-[#FFFDFB] border-b border-[#E9DCCB] flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Filtre Catégories */}
        <div className="flex items-center space-x-1.5 overflow-x-auto w-full sm:w-auto scrollbar-none pb-1 sm:pb-0">
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setCategoryFilter(cat.id)}
              className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all whitespace-nowrap cursor-pointer ${
                categoryFilter === cat.id
                  ? "bg-[#E87524] text-white shadow-xs"
                  : "bg-white text-stone-700 hover:bg-stone-50 border border-[#E9DCCB]"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Recherche */}
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-stone-400 absolute left-3 top-2.5 pointer-events-none" />
          <input
            type="text"
            placeholder="Rechercher dans la carte..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-white border border-[#E9DCCB] rounded-xl text-xs text-[#292522] focus:ring-2 focus:ring-[#E87524] focus:outline-none"
          />
        </div>
      </div>

      {/* Tableau des Articles du Menu */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="bg-white rounded-2xl border border-[#E9DCCB] overflow-hidden shadow-xs">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[#FFF8EF] border-b border-[#E9DCCB] text-stone-600 font-bold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4">Article & Recette</th>
                <th className="py-3 px-4">Catégorie</th>
                <th className="py-3 px-4 text-right">Prix Vente</th>
                <th className="py-3 px-4 text-center">Disponibilité</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E9DCCB]/60">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-stone-500">
                    <UtensilsCrossed className="w-12 h-12 text-[#E87524]/40 mx-auto mb-3" />
                    <p className="font-bold text-sm text-[#292522]">
                      {products.length === 0 ? "Votre carte est vide pour le moment" : "Aucun article trouvé"}
                    </p>
                    <p className="text-xs text-stone-500 mt-1">
                      {products.length === 0
                        ? "Commencez par ajouter vos propres pizzas artisanales et boissons ci-dessous."
                        : "Essayez un autre mot-clé ou filtre."}
                    </p>
                    {products.length === 0 && (
                      <button
                        onClick={handleOpenAddModal}
                        className="mt-4 px-4 py-2 bg-[#E87524] hover:bg-[#D46317] text-white rounded-xl font-bold shadow-xs inline-flex items-center gap-1.5 cursor-pointer text-xs"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Ajouter le premier article</span>
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                filteredProducts.map(p => (
                <tr key={p.id} className="hover:bg-[#FFFDFB] transition-colors">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-[#FFF8EF] border border-[#E9DCCB] flex items-center justify-center text-lg shrink-0">
                        {getEmoji(p.category_id)}
                      </div>
                      <div>
                        <div className="font-bold text-[#292522] text-sm">{p.name_fr}</div>
                        {p.name_ar && (
                          <div className="text-[11px] text-stone-400 font-arabic" dir="rtl">
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
                  <td className="py-3 px-4">
                    <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-[#FFF3EB] text-[#E87524] border border-[#E87524]/20">
                      {p.category_name || (p.category_id === "cat-drink" ? "Boissons" : "Pizzas")}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right font-black text-sm text-[#E87524]">
                    {CurrencyUtil.formatDZD(p.selling_price_ttc)}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <button
                      onClick={() => handleToggleAvailability(p)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                        p.is_active === 1
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                          : "bg-red-50 text-red-700 border border-red-200 hover:bg-red-100"
                      }`}
                      title="Cliquer pour changer la disponibilité"
                    >
                      <span className={`w-2 h-2 rounded-full ${p.is_active === 1 ? "bg-emerald-500" : "bg-red-500"}`} />
                      <span>{p.is_active === 1 ? "Disponible" : "Rupture"}</span>
                    </button>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => handleOpenEditModal(p)}
                        className="p-1.5 rounded-lg text-stone-500 hover:text-[#E87524] hover:bg-[#FFF3EB] transition-colors"
                        title="Modifier"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteProduct(p)}
                        className="p-1.5 rounded-lg text-stone-500 hover:text-[#B9362B] hover:bg-red-50 transition-colors"
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

      {/* Modal d Ajout / Édition Simple */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 select-none">
          <div className="bg-white border border-[#E9DCCB] w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col text-xs text-[#292522]">
            <div className="px-5 py-4 border-b border-[#E9DCCB] bg-[#FFF8EF] flex items-center justify-between">
              <h3 className="text-base font-extrabold text-[#292522]">
                {editingProduct ? "Modifier la Pizza / Article" : "Nouvel Article sur la Carte"}
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-stone-400 hover:text-stone-600 p-1.5 rounded-lg hover:bg-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-3.5">
              <div>
                <label className="block font-bold text-stone-700 mb-1">Nom de l article (Français) *</label>
                <input
                  type="text"
                  required
                  placeholder="ex: Pizza 4 Fromages, Coca-Cola..."
                  value={formData.name_fr}
                  onChange={e => setFormData({ ...formData, name_fr: e.target.value })}
                  className="w-full px-3 py-2 bg-[#FFF8EF]/50 border border-[#E9DCCB] rounded-xl text-xs text-[#292522] focus:ring-2 focus:ring-[#E87524] focus:outline-none"
                  autoFocus
                />
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1">Nom en Arabe (Optionnel)</label>
                <input
                  type="text"
                  placeholder="ex: بيتزا 4 أجبان"
                  value={formData.name_ar}
                  onChange={e => setFormData({ ...formData, name_ar: e.target.value })}
                  className="w-full px-3 py-2 bg-[#FFF8EF]/50 border border-[#E9DCCB] rounded-xl text-xs text-[#292522] focus:ring-2 focus:ring-[#E87524] focus:outline-none font-arabic"
                  dir="rtl"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-stone-700 mb-1">Catégorie *</label>
                  <select
                    value={formData.category_id}
                    onChange={e => setFormData({ ...formData, category_id: e.target.value })}
                    className="w-full px-3 py-2 bg-[#FFF8EF]/50 border border-[#E9DCCB] rounded-xl text-xs text-[#292522] focus:ring-2 focus:ring-[#E87524] focus:outline-none"
                  >
                    <option value="cat-pizza">Pizzas 🍕</option>
                    <option value="cat-drink">Boissons 🥤</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-stone-700 mb-1">Prix de Vente (DZD) *</label>
                  <input
                    type="number"
                    required
                    min="10"
                    value={formData.selling_price_ttc}
                    onChange={e => setFormData({ ...formData, selling_price_ttc: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-[#FFF8EF]/50 border border-[#E9DCCB] rounded-xl text-xs font-bold text-[#E87524] font-mono focus:ring-2 focus:ring-[#E87524] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1">Ingrédients / Recette / Description</label>
                <textarea
                  rows={2}
                  placeholder="ex: Sauce tomate, mozzarella fior di latte, basilic frais..."
                  value={formData.variant}
                  onChange={e => setFormData({ ...formData, variant: e.target.value })}
                  className="w-full px-3 py-2 bg-[#FFF8EF]/50 border border-[#E9DCCB] rounded-xl text-xs text-[#292522] focus:ring-2 focus:ring-[#E87524] focus:outline-none"
                />
              </div>

              <div className="pt-3 border-t border-[#E9DCCB] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl border border-[#E9DCCB] bg-white text-stone-600 hover:bg-stone-50 font-bold text-xs"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-[#E87524] hover:bg-[#D46317] text-white font-bold text-xs shadow-sm shadow-orange-500/25"
                >
                  {editingProduct ? "Enregistrer les Modifications" : "Ajouter à la Carte"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
