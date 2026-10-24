// Pizzeria POS Algérie — Gestion des Ingrédients, Fiches Techniques & Capacité de Production
// Calcul en temps réel du nombre de pizzas réalisables (Yield) et détection du facteur limitant

import React, { useState, useEffect, useMemo } from 'react';
import { productService } from '../../services/product.service';
import { recipeService, RecipeEntryInput } from '../../services/recipe.service';
import { Product, Ingredient, ProductYield, RecipeItemDetail } from '../../types/database';
import { CurrencyUtil } from '../../core/currency/currency';
import { useToast } from '../common/Toast';
import {
  CookingPot,
  Scale,
  Plus,
  Search,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  Edit2,
  Trash2,
  RefreshCw,
  X,
  Sparkles,
  Package,
  ArrowUpRight,
  PieChart,
  UtensilsCrossed,
  SlidersHorizontal,
  Info
} from 'lucide-react';

export const InventoryView: React.FC = () => {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<'CAPACITY' | 'INGREDIENTS' | 'RECIPES'>('CAPACITY');
  
  const [products, setProducts] = useState<Product[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [yields, setYields] = useState<ProductYield[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Filtres
  const [search, setSearch] = useState<string>('');
  const [stockFilter, setStockFilter] = useState<'ALL' | 'ALERT' | 'RUPTURE'>('ALL');
  const [capacityFilter, setCapacityFilter] = useState<'ALL' | 'READY' | 'OUT_OF_STOCK' | 'NO_RECIPE'>('ALL');

  // Modal Ajout / Modification Ingrédient
  const [showIngredientModal, setShowIngredientModal] = useState<boolean>(false);
  const [editingIngredient, setEditingIngredient] = useState<Ingredient | null>(null);
  const [ingForm, setIngForm] = useState({
    name_fr: '',
    name_ar: '',
    unit: 'kg' as 'kg' | 'g' | 'L' | 'ml' | 'pièce',
    current_stock: 0,
    min_stock_alert: 5,
    cost_per_unit: 0
  });

  // Modal Ajustement Rapide Ingrédient
  const [showAdjustModal, setShowAdjustModal] = useState<boolean>(false);
  const [adjustTarget, setAdjustTarget] = useState<Ingredient | null>(null);
  const [adjustQty, setAdjustQty] = useState<number>(0);
  const [adjustReason, setAdjustReason] = useState<string>('Réapprovisionnement');

  // Édition de Fiche Technique (Tab 3)
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [recipeEntries, setRecipeEntries] = useState<RecipeEntryInput[]>([]);
  const [savingRecipe, setSavingRecipe] = useState<boolean>(false);

  // Modal de sélection manuelle d'ingrédient pour la recette
  const [showIngredientPicker, setShowIngredientPicker] = useState<boolean>(false);
  const [pickerSearch, setPickerSearch] = useState<string>('');

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [prods, ings, ylds] = await Promise.all([
        productService.getProducts(),
        recipeService.getIngredients(),
        recipeService.calculateAllYields()
      ]);
      setProducts(prods);
      setIngredients(ings);
      setYields(ylds);

      // Si aucun produit sélectionné pour la recette, sélectionner le premier
      if (prods.length > 0 && !selectedProductId) {
        handleSelectProductForRecipe(prods[0].id);
      }
    } catch (err) {
      console.error('Erreur chargement données inventaire:', err);
      showToast('Erreur lors du chargement des ingrédients et recettes.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Sélectionner un produit pour afficher et modifier sa recette
  const handleSelectProductForRecipe = async (prodId: string) => {
    // Sauvegarder automatiquement l'ancienne recette avant de changer de plat si modifié
    if (selectedProductId && selectedProductId !== prodId) {
      try {
        await recipeService.saveRecipe(selectedProductId, recipeEntries);
      } catch (err) {
        console.warn('Auto-save prior product recipe:', err);
      }
    }

    setSelectedProductId(prodId);
    const details = await recipeService.getRecipeForProduct(prodId);
    setRecipeEntries(
      details.map(d => ({
        ingredient_id: d.ingredient_id,
        quantity_required: d.quantity_required,
        unit_display: d.unit_display || `${d.quantity_required} ${d.ingredient_unit}`
      }))
    );
  };

  // Naviguer directement vers la recette d'une pizza depuis l'onglet Capacité
  const handleEditRecipeDirect = async (prodId: string) => {
    await handleSelectProductForRecipe(prodId);
    setActiveTab('RECIPES');
  };

  // --- Gestion des Ingrédients ---

  const handleOpenAddIngredient = () => {
    setEditingIngredient(null);
    setIngForm({
      name_fr: '',
      name_ar: '',
      unit: 'kg',
      current_stock: 0,
      min_stock_alert: 5,
      cost_per_unit: 0
    });
    setShowIngredientModal(true);
  };

  const handleOpenEditIngredient = (ing: Ingredient) => {
    setEditingIngredient(ing);
    setIngForm({
      name_fr: ing.name_fr,
      name_ar: ing.name_ar || '',
      unit: ing.unit,
      current_stock: ing.current_stock,
      min_stock_alert: ing.min_stock_alert,
      cost_per_unit: ing.cost_per_unit
    });
    setShowIngredientModal(true);
  };

  const handleSaveIngredient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ingForm.name_fr.trim()) {
      showToast('Veuillez saisir le nom de l\'ingrédient.', 'warning');
      return;
    }

    try {
      if (editingIngredient) {
        await recipeService.updateIngredient(editingIngredient.id, ingForm);
        showToast('Ingrédient mis à jour avec succès.', 'success');
      } else {
        await recipeService.createIngredient(ingForm);
        showToast('Nouvel ingrédient ajouté au stock.', 'success');
      }
      setShowIngredientModal(false);
      await loadAllData();
    } catch (err) {
      console.error(err);
      showToast('Échec de l\'enregistrement de l\'ingrédient.', 'error');
    }
  };

  const handleDeleteIngredient = async (id: string, name: string) => {
    try {
      // Mise à jour optimiste immédiate de l'interface
      setIngredients(prev => prev.filter(i => i.id !== id));
      setYields(prev => prev.filter(y => y.limitingIngredient?.id !== id));

      await recipeService.deleteIngredient(id);
      showToast(`تم حذف المقدار "${name}" بنجاح من المخزون والوصفات`, 'info');
      await loadAllData();
    } catch (err: any) {
      console.error('Erreur suppression ingrédient:', err);
      showToast(`فشل حذف المقدار: ${err?.message || err}`, 'error');
      await loadAllData();
    }
  };

  // Application rapide d'une recette standard pour pizzas sans fiche
  const handleApplyQuickRecipe = async (productId: string) => {
    if (ingredients.length === 0) {
      showToast('يرجى إضافة مقادير للمخزن أولاً.', 'warning');
      return;
    }

    try {
      await recipeService.applyDefaultPizzaRecipe(productId);
      showToast('تم ربط وحفظ وصفة قياسية سريعة للبيتزا بنجاح !', 'success');
      await loadAllData();
      if (selectedProductId === productId) {
        await handleSelectProductForRecipe(productId);
      }
    } catch (err: any) {
      console.error(err);
      showToast(`فشل تطبيق الوصفة السريعة: ${err?.message || err}`, 'error');
    }
  };

  // Quick Restock (+1, +5, +10)
  const handleQuickRestock = async (ing: Ingredient, amount: number) => {
    try {
      await recipeService.adjustStock(ing.id, amount, `Ajout direct +${amount} ${ing.unit}`);
      showToast(`+${amount} ${ing.unit} ajouté à ${ing.name_fr}`, 'success');
      await loadAllData();
    } catch (err) {
      console.error(err);
      showToast('Erreur lors de l\'ajustement du stock.', 'error');
    }
  };

  const handleApplyAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustTarget) return;
    if (adjustQty === 0) {
      showToast('La quantité doit être différente de zéro.', 'warning');
      return;
    }

    try {
      await recipeService.adjustStock(adjustTarget.id, adjustQty, adjustReason);
      showToast(`Stock ajusté pour ${adjustTarget.name_fr}`, 'success');
      setShowAdjustModal(false);
      await loadAllData();
    } catch (err) {
      console.error(err);
      showToast('Erreur lors de l\'ajustement.', 'error');
    }
  };

  // --- Gestion des Fiches Techniques (Recettes) ---

  const handleOpenIngredientPicker = () => {
    if (ingredients.length === 0) {
      showToast('يرجى أولاً إضافة مكونات إلى المخزون من تبويب المكونات.', 'warning');
      return;
    }
    setPickerSearch('');
    setShowIngredientPicker(true);
  };

  const handleSelectIngredientForRecipe = async (ing: Ingredient) => {
    // Vérifier si déjà présent
    const exists = recipeEntries.some(r => r.ingredient_id === ing.id);
    if (exists) {
      showToast(`المكون "${ing.name_fr}" موجود بالفعل في هذه الوصفة. يمكنك تعديل كميته في الجدول.`, 'info');
      return;
    }

    const defaultQty = ing.unit.toLowerCase() === 'kg' ? 0.15 : ing.unit.toLowerCase() === 'g' ? 100 : 1;
    const newEntry: RecipeEntryInput = {
      ingredient_id: ing.id,
      quantity_required: defaultQty,
      unit_display: `${defaultQty} ${ing.unit}`
    };

    const newEntries = [...recipeEntries, newEntry];
    setRecipeEntries(newEntries);
    setShowIngredientPicker(false);

    // Sauvegarde automatique immédiate dans la base de données
    if (selectedProductId) {
      try {
        await recipeService.saveRecipe(selectedProductId, newEntries);
        const ylds = await recipeService.calculateAllYields();
        setYields(ylds);
        showToast(`تمت إضافة وحفظ "${ing.name_fr}" في مقادير البيتزا بنجاح !`, 'success');
      } catch (err: any) {
        console.error('Erreur auto-save ingrédient:', err);
        showToast(`فشل حفظ المقدار: ${err?.message || err}`, 'error');
      }
    }
  };

  const handleUpdateRecipeRow = async (index: number, field: keyof RecipeEntryInput, value: any) => {
    const updated = [...recipeEntries];
    let finalVal = value;
    if (field === 'quantity_required') {
      const rawStr = String(value).replace(',', '.');
      finalVal = parseFloat(rawStr) || 0;
    }
    updated[index] = { ...updated[index], [field]: finalVal };

    const curIngId = field === 'ingredient_id' ? finalVal : updated[index].ingredient_id;
    const curQty = field === 'quantity_required' ? finalVal : updated[index].quantity_required;
    const matchedIng = ingredients.find(i => i.id === curIngId);
    if (matchedIng) {
      updated[index].unit_display = `${curQty} ${matchedIng.unit}`;
    }

    setRecipeEntries(updated);

    // Auto-save immédiat si produit sélectionné et données valides
    if (selectedProductId && curIngId && (field === 'ingredient_id' ? !!finalVal : curQty > 0)) {
      try {
        await recipeService.saveRecipe(selectedProductId, updated);
        const ylds = await recipeService.calculateAllYields();
        setYields(ylds);
      } catch (err) {
        console.warn('Erreur auto-save row update:', err);
      }
    }
  };

  const handleRemoveRecipeRow = async (index: number) => {
    const updated = [...recipeEntries];
    updated.splice(index, 1);
    setRecipeEntries(updated);
    if (selectedProductId) {
      try {
        await recipeService.saveRecipe(selectedProductId, updated);
        const ylds = await recipeService.calculateAllYields();
        setYields(ylds);
        showToast('تم حذف المقدار من الوصفة وتحديث السعة الإنتاجية بنجاح', 'info');
      } catch (err: any) {
        console.error('Erreur retrait ingrédient de la recette:', err);
      }
    }
  };

  const handleSaveRecipe = async () => {
    if (!selectedProductId) return;
    setSavingRecipe(true);
    try {
      await recipeService.saveRecipe(selectedProductId, recipeEntries);
      showToast('تم حفظ وتثبيت كافة مقادير البيتزا بنجاح !', 'success');
      await loadAllData();
      await handleSelectProductForRecipe(selectedProductId);
    } catch (err: any) {
      console.error(err);
      showToast(`خطأ أثناء حفظ مقادير الوصفة: ${err?.message || err}`, 'error');
    } finally {
      setSavingRecipe(false);
    }
  };

  const handleSeedDefaults = async () => {
    try {
      await recipeService.seedDefaultPizzeriaIngredients();
      showToast('Ingrédients de base ajoutés avec succès !', 'success');
      await loadAllData();
    } catch (err: any) {
      showToast(`Erreur : ${err?.message || err}`, 'error');
    }
  };

  // --- Données Calculées & Métriques Globales ---

  const totalPossiblePizzas = useMemo(() => {
    return yields.reduce((sum, y) => sum + (y.hasRecipe ? y.maxPortions : 0), 0);
  }, [yields]);

  const readyPizzasCount = useMemo(() => {
    return yields.filter(y => y.hasRecipe && y.maxPortions > 0).length;
  }, [yields]);

  const ingredientsInAlertCount = useMemo(() => {
    return ingredients.filter(i => i.current_stock <= i.min_stock_alert).length;
  }, [ingredients]);

  const totalIngredientsStockValue = useMemo(() => {
    return ingredients.reduce((sum, i) => sum + i.current_stock * i.cost_per_unit, 0);
  }, [ingredients]);

  // Filtrage Onglet Capacité
  const filteredYields = useMemo(() => {
    return yields.filter(y => {
      const matchSearch = y.productName.toLowerCase().includes(search.toLowerCase()) ||
                          y.productBarcode.toLowerCase().includes(search.toLowerCase());
      if (!matchSearch) return false;

      if (capacityFilter === 'READY') return y.hasRecipe && y.maxPortions > 0;
      if (capacityFilter === 'OUT_OF_STOCK') return y.hasRecipe && y.maxPortions === 0;
      if (capacityFilter === 'NO_RECIPE') return !y.hasRecipe;
      return true;
    });
  }, [yields, search, capacityFilter]);

  // Filtrage Onglet Ingrédients
  const filteredIngredients = useMemo(() => {
    return ingredients.filter(ing => {
      const matchSearch = ing.name_fr.toLowerCase().includes(search.toLowerCase()) ||
                          (ing.name_ar && ing.name_ar.includes(search));
      if (!matchSearch) return false;

      if (stockFilter === 'ALERT') return ing.current_stock > 0 && ing.current_stock <= ing.min_stock_alert;
      if (stockFilter === 'RUPTURE') return ing.current_stock <= 0;
      return true;
    });
  }, [ingredients, search, stockFilter]);

  // Produit actif dans la fiche technique
  const currentRecipeProduct = useMemo(() => {
    return products.find(p => p.id === selectedProductId);
  }, [products, selectedProductId]);

  // Simulation en direct du Food Cost et Rendement pour la fiche technique
  const liveRecipeCalculation = useMemo(() => {
    if (!currentRecipeProduct) return null;
    const ingMap = new Map(ingredients.map(i => [i.id, i]));
    let totalCost = 0;
    let minPortions = Infinity;
    let limitingIngName = '';

    if (recipeEntries.length === 0) {
      return {
        foodCost: 0,
        sellingPrice: currentRecipeProduct.selling_price_ttc || 0,
        grossMargin: currentRecipeProduct.selling_price_ttc || 0,
        grossMarginPercent: 100,
        maxPortions: 0,
        limitingIngName: 'لم يتم تحديد المقادير بعد'
      };
    }

    for (const entry of recipeEntries) {
      const ing = ingMap.get(entry.ingredient_id);
      if (ing) {
        const cost = entry.quantity_required * ing.cost_per_unit;
        totalCost += cost;
        // Règle stricte : si quantité requise <= 0 ou stock <= 0 -> 0 portions ! Jamais 999999 !
        const portions = (entry.quantity_required > 0 && ing.current_stock > 0)
          ? Math.floor(ing.current_stock / entry.quantity_required)
          : 0;
        if (portions < minPortions) {
          minPortions = portions;
          limitingIngName = `${ing.name_fr} (${ing.current_stock} ${ing.unit} dispo / ${entry.quantity_required} requis)`;
        }
      } else {
        minPortions = 0;
        limitingIngName = 'Ingrédient manquant';
      }
    }

    const sellingPrice = currentRecipeProduct.selling_price_ttc || 0;
    const maxPortions = (minPortions === Infinity || minPortions <= 0) ? 0 : minPortions;
    const grossMargin = sellingPrice - totalCost;
    const grossMarginPercent = sellingPrice > 0 ? (grossMargin / sellingPrice) * 100 : 0;

    return {
      foodCost: Math.round(totalCost * 100) / 100,
      sellingPrice,
      grossMargin: Math.round(grossMargin * 100) / 100,
      grossMarginPercent: Math.round(grossMarginPercent * 10) / 10,
      maxPortions,
      limitingIngName: maxPortions === 0 && !limitingIngName ? 'المخزون غير كافٍ (0)' : limitingIngName
    };
  }, [currentRecipeProduct, recipeEntries, ingredients]);

  return (
    <div className="flex-1 flex flex-col h-full bg-[#FCFBF9] text-[#292522] overflow-hidden">
      {/* En-tête Supérieur */}
      <div className="bg-white border-b border-[#E9DCCB] px-6 py-4 flex flex-wrap items-center justify-between gap-4 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-[#FFF3EB] text-[#E87524] rounded-lg border border-[#E87524]/20 shadow-xs">
              <CookingPot className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[#292522] tracking-tight flex items-center gap-2">
                Ingrédients, Fiches Techniques & Rendement
                <span className="text-xs bg-amber-100 text-[#E87524] font-mono px-2 py-0.5 rounded-full font-bold">
                  Pizzeria ERP
                </span>
              </h1>
              <p className="text-xs text-stone-500 mt-0.5">
                المقادير والمواد الأولية، كمية الأطباق الممكن تحضيرها فورياً وحساب المردودية
              </p>
            </div>
          </div>
        </div>

        {/* Boutons d'Action Header */}
        <div className="flex items-center gap-2">
          <button
            onClick={loadAllData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-stone-600 bg-white border border-[#E9DCCB] hover:bg-[#FFF8EF] rounded-lg transition shadow-xs"
            title="Actualiser les calculs de stock et rendement"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#E87524]' : ''}`} />
            <span>Actualiser</span>
          </button>

          <button
            onClick={handleSeedDefaults}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-[#E87524] bg-[#FFF3EB] hover:bg-[#FFE7D6] border border-[#E87524]/30 rounded-lg shadow-2xs transition active:scale-95"
            title="Ajouter automatiquement les ingrédients indispensables de pizzeria (farine, mozzarella, sauce tomate, viande, etc.)"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#E87524]" />
            <span>+ Ingrédients Standards (المواد الأساسية)</span>
          </button>

          <button
            onClick={handleOpenAddIngredient}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-[#E87524] hover:bg-[#D3641B] rounded-lg shadow-sm transition active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>+ Nouvel Ingrédient</span>
          </button>
        </div>
      </div>

      {/* Cartes KPI Synthèse */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-6 py-3 bg-[#FAF8F5] border-b border-[#E9DCCB]/60">
        <div className="bg-white p-3 rounded-xl border border-[#E9DCCB] shadow-xs flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-stone-500 uppercase tracking-wider">
              Total Pizzas Réalisables
            </div>
            <div className="text-xl font-black text-[#E87524] mt-0.5 font-mono">
              {totalPossiblePizzas} <span className="text-xs font-normal text-stone-500">portions</span>
            </div>
            <div className="text-[10px] text-stone-600 mt-0.5">كمية الأطباق المتاحة في المخزون</div>
          </div>
          <div className="p-2.5 bg-orange-50 text-[#E87524] rounded-lg">
            <UtensilsCrossed className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-3 rounded-xl border border-[#E9DCCB] shadow-xs flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-stone-500 uppercase tracking-wider">
              Plats Prêts à Cuisiner
            </div>
            <div className="text-xl font-black text-emerald-700 mt-0.5 font-mono">
              {readyPizzasCount} / {yields.length}
            </div>
            <div className="text-[10px] text-stone-600 mt-0.5">أطباق يمكن تحضيرها فورياً</div>
          </div>
          <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-lg">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-3 rounded-xl border border-[#E9DCCB] shadow-xs flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-stone-500 uppercase tracking-wider">
              Ingrédients en Alerte
            </div>
            <div className={`text-xl font-black mt-0.5 font-mono ${ingredientsInAlertCount > 0 ? 'text-amber-700' : 'text-stone-500'}`}>
              {ingredientsInAlertCount}
            </div>
            <div className="text-[10px] text-stone-600 mt-0.5">مواد أولية قريبة من النفاد</div>
          </div>
          <div className={`p-2.5 rounded-lg ${ingredientsInAlertCount > 0 ? 'bg-amber-50 text-amber-600' : 'bg-stone-50 text-stone-600'}`}>
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-3 rounded-xl border border-[#E9DCCB] shadow-xs flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-stone-500 uppercase tracking-wider">
              Valeur Stock Ingrédients
            </div>
            <div className="text-lg font-black text-[#292522] mt-0.5 font-mono">
              {CurrencyUtil.formatDZD(totalIngredientsStockValue)}
            </div>
            <div className="text-[10px] text-stone-600 mt-0.5">القيمة الإجمالية للمواد الأولية</div>
          </div>
          <div className="p-2.5 bg-stone-50 text-[#E87524] rounded-lg">
            <Scale className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Barre d'Onglets Navigation Interne */}
      <div className="bg-white border-b border-[#E9DCCB] px-6 flex items-center justify-between">
        <div className="flex space-x-1">
          <button
            onClick={() => setActiveTab('CAPACITY')}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-bold border-b-2 transition ${
              activeTab === 'CAPACITY'
                ? 'border-[#E87524] text-[#E87524] bg-[#FFF3EB]/40'
                : 'border-transparent text-stone-500 hover:text-[#292522] hover:bg-stone-50'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>Capacité de Production (كم يمكن تحضيره)</span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 bg-amber-100 text-[#E87524] rounded-full font-bold">
              {yields.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('INGREDIENTS')}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-bold border-b-2 transition ${
              activeTab === 'INGREDIENTS'
                ? 'border-[#E87524] text-[#E87524] bg-[#FFF3EB]/40'
                : 'border-transparent text-stone-500 hover:text-[#292522] hover:bg-stone-50'
            }`}
          >
            <Scale className="w-4 h-4" />
            <span>Matières Premières & Stocks (المواد الأولية)</span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 bg-stone-100 text-stone-600 rounded-full font-bold">
              {ingredients.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('RECIPES')}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-bold border-b-2 transition ${
              activeTab === 'RECIPES'
                ? 'border-[#E87524] text-[#E87524] bg-[#FFF3EB]/40'
                : 'border-transparent text-stone-500 hover:text-[#292522] hover:bg-stone-50'
            }`}
          >
            <CookingPot className="w-4 h-4" />
            <span>Fiches Techniques & Recettes (المقادير والخلطات)</span>
          </button>
        </div>
      </div>

      {/* Contenu Principal par Onglet */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* ========================================================================= */}
        {/* ONGLET 1 : CAPACITÉ DE PRODUCTION (كم يمكن أن تعمل لي من كمية) */}
        {/* ========================================================================= */}
        {activeTab === 'CAPACITY' && (
          <div className="space-y-4">
            {/* KPI Dashboard de Rendement Global */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-gradient-to-br from-emerald-50 to-white p-4 rounded-xl border border-emerald-200 shadow-xs flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                  <CookingPot className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-emerald-800 tracking-wider block">
                    إجمالي سعة التحضير الممكنة (Capacité Globale)
                  </span>
                  <div className="text-xl font-black text-emerald-900 font-mono">
                    {yields.filter(y => y.hasRecipe).reduce((sum, y) => sum + y.maxPortions, 0)} <span className="text-xs font-normal">بيتزا جاهزة</span>
                  </div>
                  <span className="text-[10px] text-stone-500">حساب فوري من رصيد المقادير المتوفرة</span>
                </div>
              </div>

              <div className="bg-gradient-to-br from-orange-50 to-white p-4 rounded-xl border border-[#E9DCCB] shadow-xs flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-orange-100 text-[#E87524] flex items-center justify-center shrink-0">
                  <Scale className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-stone-600 tracking-wider block">
                    قيمة المقادير الأولية (Valeur Ingrédients)
                  </span>
                  <div className="text-xl font-black text-[#292522] font-mono">
                    {CurrencyUtil.formatDZD(ingredients.reduce((sum, ing) => sum + (ing.current_stock * ing.cost_per_unit), 0))}
                  </div>
                  <span className="text-[10px] text-stone-500">{ingredients.length} مكونات في المخزن</span>
                </div>
              </div>

              <div className="bg-gradient-to-br from-blue-50 to-white p-4 rounded-xl border border-blue-200 shadow-xs flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-blue-800 tracking-wider block">
                    جاهزية الوصفات (Fiches Configurées)
                  </span>
                  <div className="text-xl font-black text-blue-900 font-mono">
                    {yields.filter(y => y.hasRecipe).length} / {yields.length} <span className="text-xs font-normal">أطباق معدة</span>
                  </div>
                  <span className="text-[10px] text-stone-500">{yields.filter(y => !y.hasRecipe).length} بحاجة لوصفة</span>
                </div>
              </div>
            </div>

            {/* Barre de Filtre & Recherche */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-xl border border-[#E9DCCB] shadow-xs">
              <div className="relative flex-1 min-w-[240px]">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-stone-600" />
                <input
                  type="text"
                  placeholder="Rechercher une pizza ou un plat..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-[#FCFBF9] border border-[#E9DCCB] rounded-lg focus:outline-none focus:border-[#E87524]"
                />
              </div>

              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-stone-500 font-medium">Filtrer:</span>
                <button
                  onClick={() => setCapacityFilter('ALL')}
                  className={`px-2.5 py-1 rounded-md font-medium text-xs transition ${
                    capacityFilter === 'ALL'
                      ? 'bg-[#E87524] text-white font-bold'
                      : 'bg-[#FCFBF9] text-stone-600 border border-[#E9DCCB] hover:bg-stone-100'
                  }`}
                >
                  Tous ({yields.length})
                </button>
                <button
                  onClick={() => setCapacityFilter('READY')}
                  className={`px-2.5 py-1 rounded-md font-medium text-xs transition ${
                    capacityFilter === 'READY'
                      ? 'bg-emerald-600 text-white font-bold'
                      : 'bg-[#FCFBF9] text-stone-600 border border-[#E9DCCB] hover:bg-stone-100'
                  }`}
                >
                  Prêts &gt; 0
                </button>
                <button
                  onClick={() => setCapacityFilter('OUT_OF_STOCK')}
                  className={`px-2.5 py-1 rounded-md font-medium text-xs transition ${
                    capacityFilter === 'OUT_OF_STOCK'
                      ? 'bg-rose-600 text-white font-bold'
                      : 'bg-[#FCFBF9] text-stone-600 border border-[#E9DCCB] hover:bg-stone-100'
                  }`}
                >
                  Rupture (0)
                </button>
                <button
                  onClick={() => setCapacityFilter('NO_RECIPE')}
                  className={`px-2.5 py-1 rounded-md font-medium text-xs transition ${
                    capacityFilter === 'NO_RECIPE'
                      ? 'bg-amber-600 text-white font-bold'
                      : 'bg-[#FCFBF9] text-stone-600 border border-[#E9DCCB] hover:bg-stone-100'
                  }`}
                >
                  Sans Fiche
                </button>
              </div>
            </div>

            {/* Grille des Pizzas & Rendements */}
            {products.length === 0 ? (
              <div className="bg-white border border-[#E9DCCB] rounded-2xl p-12 text-center shadow-xs">
                <div className="w-16 h-16 bg-amber-50 text-[#E87524] rounded-full flex items-center justify-center mx-auto mb-4">
                  <Package className="w-8 h-8" />
                </div>
                <h3 className="text-base font-bold text-[#292522]">Aucun produit enregistré</h3>
                <p className="text-xs text-stone-500 max-w-md mx-auto mt-1 mb-4">
                  Commencez par ajouter vos pizzas et boissons dans la section <strong>"Pizzas & Boissons" (F3)</strong> pour configurer leurs recettes et calculer le rendement.
                </p>
              </div>
            ) : filteredYields.length === 0 ? (
              <div className="bg-white border border-[#E9DCCB] rounded-2xl p-8 text-center text-stone-500 text-xs">
                Aucun plat ne correspond à vos critères de recherche.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredYields.map(y => {
                  const isReady = y.hasRecipe && y.maxPortions > 0;
                  const isOutOfStock = y.hasRecipe && y.maxPortions === 0;

                  return (
                    <div
                      key={y.productId}
                      className="bg-white rounded-2xl border border-[#E9DCCB] shadow-xs hover:shadow-md transition-all flex flex-col justify-between overflow-hidden"
                    >
                      {/* En-tête de la carte */}
                      <div className="p-4 border-b border-[#E9DCCB]/60 bg-gradient-to-br from-white to-[#FAF8F5]">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <span className="text-[10px] uppercase font-bold text-stone-600 tracking-wider">
                              {y.categoryName || 'Plat Pizzeria'}
                            </span>
                            <h3 className="text-base font-bold text-[#292522] leading-snug">
                              {y.productName}
                            </h3>
                            <div className="text-xs font-mono font-bold text-[#E87524] mt-0.5">
                              Prix: {CurrencyUtil.formatDZD(y.sellingPrice)}
                            </div>
                          </div>

                          {/* Grand Badge de Capacité Réalisable */}
                          <div className="text-right">
                            {y.hasRecipe ? (
                              <div
                                className={`px-3 py-1.5 rounded-xl font-mono text-center shadow-xs border ${
                                  y.maxPortions > 20
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : y.maxPortions > 0
                                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                                    : 'bg-rose-50 text-rose-700 border-rose-200'
                                }`}
                              >
                                <div className="text-2xl font-black leading-none">
                                  {y.maxPortions}
                                </div>
                                <div className="text-[9px] font-bold uppercase tracking-wider mt-0.5">
                                  {y.maxPortions > 1 ? 'Pizzas Possibles' : 'Pizza Possible'}
                                </div>
                              </div>
                            ) : (
                              <span className="px-2 py-1 bg-stone-100 text-stone-600 rounded-lg text-[10px] font-bold border border-stone-200">
                                Sans Fiche
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Facteur Limitant / Goulot d'Étranglement */}
                        {y.hasRecipe && (
                          <div className="mt-3">
                            {y.limitingIngredient ? (
                              <div className={`p-2 rounded-lg text-xs flex items-center gap-2 border ${
                                y.maxPortions > 0
                                  ? 'bg-amber-50/70 border-amber-200 text-amber-900'
                                  : 'bg-rose-50/70 border-rose-200 text-rose-900 font-bold'
                              }`}>
                                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                                <div className="truncate">
                                  <span className="text-[10px] uppercase font-bold block text-stone-600">
                                    Facteur Limitant (العنصر المحدد):
                                  </span>
                                  <span className="font-bold">{y.limitingIngredient.name}</span>
                                  <span className="text-stone-600 text-[11px] ml-1">
                                    (Reste {y.limitingIngredient.currentStock} {y.limitingIngredient.unit})
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <div className="p-2 rounded-lg text-xs bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center gap-1.5">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                <span>Tous les ingrédients sont largement disponibles.</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Corps : Liste des Ingrédients et Consommation */}
                      <div className="p-4 flex-1 space-y-2 bg-[#FCFBF9]">
                        {y.hasRecipe ? (
                          <>
                            <div className="text-[11px] font-bold text-stone-600 uppercase tracking-wider flex items-center justify-between">
                              <span>Ingrédients par portion ({y.recipeItems.length})</span>
                              <span>Disponibilité</span>
                            </div>

                            <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                              {y.recipeItems.map(item => (
                                <div
                                  key={item.id}
                                  className="flex items-center justify-between p-1.5 bg-white rounded-lg border border-[#E9DCCB]/60 text-xs"
                                >
                                  <div>
                                    <span className="font-medium text-[#292522]">
                                      {item.ingredient_name_fr}
                                    </span>
                                    <span className="text-[10px] text-stone-600 block">
                                      {item.quantity_required} {item.ingredient_unit} / pizza
                                    </span>
                                  </div>
                                  <div className="text-right">
                                    <span className={`text-[11px] font-mono font-bold ${
                                      item.portions_possible <= 0
                                        ? 'text-rose-600'
                                        : item.portions_possible <= 10
                                        ? 'text-amber-600'
                                        : 'text-emerald-600'
                                    }`}>
                                      {item.portions_possible} portions
                                    </span>
                                    <span className="text-[9px] text-stone-600 block font-mono">
                                      Stock: {item.ingredient_current_stock} {item.ingredient_unit}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>

                            {/* Résumé Financier : Food Cost & Marge */}
                            <div className="pt-2 border-t border-[#E9DCCB]/60 grid grid-cols-2 gap-2 text-xs">
                              <div className="p-2 bg-white rounded-lg border border-[#E9DCCB]/60">
                                <div className="text-[10px] text-stone-600 uppercase font-bold">Coût Ingrédients</div>
                                <div className="font-mono font-bold text-stone-800">
                                  {CurrencyUtil.formatDZD(y.foodCost)}
                                </div>
                              </div>
                              <div className="p-2 bg-white rounded-lg border border-[#E9DCCB]/60">
                                <div className="text-[10px] text-stone-600 uppercase font-bold">Marge Brute</div>
                                <div className="font-mono font-bold text-emerald-700">
                                  {CurrencyUtil.formatDZD(y.grossMargin)}{' '}
                                  <span className="text-[10px]">({y.grossMarginPercent}%)</span>
                                </div>
                              </div>
                            </div>
                          </>
                        ) : (
                          <div className="py-6 text-center text-xs text-stone-600 space-y-2.5">
                            <Info className="w-6 h-6 mx-auto text-amber-500" />
                            <p className="font-bold">Aucune fiche technique configurée pour ce plat.</p>
                            <p className="text-[11px] text-stone-500 max-w-xs mx-auto">
                              لم يتم ربط هذا الطبق بمقادير المخزون بعد لحساب عدد البيتزا الممكن إعدادها.
                            </p>
                            <button
                              type="button"
                              onClick={() => handleApplyQuickRecipe(y.productId)}
                              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-bold text-xs shadow-xs transition flex items-center gap-1.5 mx-auto cursor-pointer"
                            >
                              <Sparkles className="w-3.5 h-3.5" />
                              <span>⚡ تطبيق وصفة قياسية سريعة</span>
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Pied de Carte : Action */}
                      <div className="p-3 border-t border-[#E9DCCB] bg-white flex items-center justify-between">
                        <span className="text-[10px] text-stone-600 font-mono">
                          Ref: {y.productBarcode || y.productId.slice(0, 8)}
                        </span>
                        <button
                          onClick={() => handleEditRecipeDirect(y.productId)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-[#E87524] bg-[#FFF3EB] hover:bg-[#FFE6D5] rounded-lg transition"
                        >
                          <CookingPot className="w-3.5 h-3.5" />
                          <span>{y.hasRecipe ? 'Modifier la Fiche' : 'Créer la Fiche'}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* ONGLET 2 : STOCK DES MATIÈRES PREMIÈRES (المواد الأولية والمخزون) */}
        {/* ========================================================================= */}
        {activeTab === 'INGREDIENTS' && (
          <div className="space-y-4">
            {/* Barre de Recherche & Filtres Stock */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-xl border border-[#E9DCCB] shadow-xs">
              <div className="relative flex-1 min-w-[240px]">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-stone-600" />
                <input
                  type="text"
                  placeholder="Rechercher un ingrédient (Farine, Mozzarella, Sauce...)"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-[#FCFBF9] border border-[#E9DCCB] rounded-lg focus:outline-none focus:border-[#E87524]"
                />
              </div>

              <div className="flex items-center gap-1.5 text-xs">
                <button
                  onClick={() => setStockFilter('ALL')}
                  className={`px-2.5 py-1 rounded-md font-medium text-xs transition ${
                    stockFilter === 'ALL'
                      ? 'bg-[#E87524] text-white font-bold'
                      : 'bg-[#FCFBF9] text-stone-600 border border-[#E9DCCB] hover:bg-stone-100'
                  }`}
                >
                  Tous ({ingredients.length})
                </button>
                <button
                  onClick={() => setStockFilter('ALERT')}
                  className={`px-2.5 py-1 rounded-md font-medium text-xs transition ${
                    stockFilter === 'ALERT'
                      ? 'bg-amber-600 text-white font-bold'
                      : 'bg-[#FCFBF9] text-stone-600 border border-[#E9DCCB] hover:bg-stone-100'
                  }`}
                >
                  Stock Faible ({ingredientsInAlertCount})
                </button>
                <button
                  onClick={() => setStockFilter('RUPTURE')}
                  className={`px-2.5 py-1 rounded-md font-medium text-xs transition ${
                    stockFilter === 'RUPTURE'
                      ? 'bg-rose-600 text-white font-bold'
                      : 'bg-[#FCFBF9] text-stone-600 border border-[#E9DCCB] hover:bg-stone-100'
                  }`}
                >
                  En Rupture
                </button>
              </div>
            </div>

            {/* Tableau des Ingrédients */}
            <div className="bg-white rounded-2xl border border-[#E9DCCB] shadow-xs overflow-hidden">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#FAF8F5] border-b border-[#E9DCCB] text-[11px] font-bold text-stone-600 uppercase tracking-wider">
                    <th className="py-3 px-4">Matière Première / Ingrédient</th>
                    <th className="py-3 px-3">Unité</th>
                    <th className="py-3 px-3">Stock Actuel</th>
                    <th className="py-3 px-3">Seuil Alerte</th>
                    <th className="py-3 px-3">Coût Unitaire</th>
                    <th className="py-3 px-3">Valeur Stock</th>
                    <th className="py-3 px-3">Statut</th>
                    <th className="py-3 px-4 text-center">Réapprovisionnement Rapide</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E9DCCB]/60">
                  {filteredIngredients.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-stone-500">
                        <Scale className="w-8 h-8 mx-auto text-stone-300 mb-2" />
                        <p className="font-medium">Aucun ingrédient enregistré.</p>
                        <p className="text-[11px] text-stone-600 mt-1">
                          Cliquez sur "+ Nouvel Ingrédient" ci-dessus pour ajouter farine, sauce tomate, fromage, etc.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    filteredIngredients.map(ing => {
                      const isAlert = ing.current_stock <= ing.min_stock_alert && ing.current_stock > 0;
                      const isRupture = ing.current_stock <= 0;
                      const stockValue = ing.current_stock * ing.cost_per_unit;

                      return (
                        <tr key={ing.id} className="hover:bg-[#FFF8EF]/50 transition">
                          <td className="py-3 px-4">
                            <div className="font-bold text-[#292522]">{ing.name_fr}</div>
                            {ing.name_ar && (
                              <div className="text-[11px] text-stone-600">{ing.name_ar}</div>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            <span className="font-mono px-2 py-0.5 bg-stone-100 rounded text-stone-700 font-bold text-[11px]">
                              {ing.unit}
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            <span className={`font-mono font-black text-sm ${
                              isRupture
                                ? 'text-rose-600'
                                : isAlert
                                ? 'text-amber-600'
                                : 'text-emerald-700'
                            }`}>
                              {ing.current_stock}
                            </span>
                            <span className="text-[10px] text-stone-600 ml-1">{ing.unit}</span>
                          </td>
                          <td className="py-3 px-3 font-mono text-stone-600">
                            {ing.min_stock_alert} {ing.unit}
                          </td>
                          <td className="py-3 px-3 font-mono text-stone-800 font-medium">
                            {CurrencyUtil.formatDZD(ing.cost_per_unit)}<span className="text-[10px] text-stone-500 ml-1">/ {ing.unit}</span>
                          </td>
                          <td className="py-3 px-3 font-mono font-bold text-[#E87524]">
                            {CurrencyUtil.formatDZD(stockValue)}
                          </td>
                          <td className="py-3 px-3">
                            {isRupture ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                Rupture
                              </span>
                            ) : isAlert ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                Stock Faible
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                Suffisant
                              </span>
                            )}
                          </td>

                          {/* Boutons Rapides +1, +5, +10 */}
                          <td className="py-3 px-4">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => handleQuickRestock(ing, 1)}
                                className="px-2 py-1 text-[11px] font-bold font-mono text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded transition active:scale-95"
                                title={`Ajouter +1 ${ing.unit}`}
                              >
                                +1
                              </button>
                              <button
                                onClick={() => handleQuickRestock(ing, 5)}
                                className="px-2 py-1 text-[11px] font-bold font-mono text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded transition active:scale-95"
                                title={`Ajouter +5 ${ing.unit}`}
                              >
                                +5
                              </button>
                              <button
                                onClick={() => handleQuickRestock(ing, 10)}
                                className="px-2 py-1 text-[11px] font-bold font-mono text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded transition active:scale-95"
                                title={`Ajouter +10 ${ing.unit}`}
                              >
                                +10
                              </button>
                              <button
                                onClick={() => {
                                  setAdjustTarget(ing);
                                  setAdjustQty(0);
                                  setShowAdjustModal(true);
                                }}
                                className="px-2 py-1 text-[11px] text-stone-600 bg-stone-100 hover:bg-stone-200 rounded transition"
                                title="Ajustement personnalisé / Perte"
                              >
                                +/-
                              </button>
                            </div>
                          </td>

                          {/* Actions Modifier / Supprimer */}
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => handleOpenEditIngredient(ing)}
                                className="p-1.5 text-stone-500 hover:text-[#E87524] hover:bg-stone-100 rounded transition"
                                title="Modifier l'ingrédient"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteIngredient(ing.id, ing.name_fr)}
                                className="p-1.5 text-stone-500 hover:text-rose-600 hover:bg-rose-50 rounded transition"
                                title="Supprimer l'ingrédient"
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
        )}

        {/* ========================================================================= */}
        {/* ONGLET 3 : FICHES TECHNIQUES & RECETTES (المقادير والخلطات) */}
        {/* ========================================================================= */}
        {activeTab === 'RECIPES' && (
          <div className="space-y-4">
            {products.length === 0 ? (
              <div className="bg-white border border-[#E9DCCB] rounded-2xl p-12 text-center text-xs text-stone-500 shadow-xs">
                Veuillez d'abord créer vos pizzas dans le catalogue "Pizzas & Boissons" (F3).
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Colonne Gauche : Sélection du Plat */}
                <div className="bg-white rounded-2xl border border-[#E9DCCB] shadow-xs p-4 space-y-3">
                  <h3 className="text-xs font-bold text-stone-600 uppercase tracking-wider">
                    1. Sélectionner une Pizza ou Plat
                  </h3>
                  <div className="space-y-1 max-h-[500px] overflow-y-auto pr-1">
                    {products.map(p => {
                      const isSelected = p.id === selectedProductId;
                      const yld = yields.find(y => y.productId === p.id);

                      return (
                        <button
                          key={p.id}
                          onClick={() => handleSelectProductForRecipe(p.id)}
                          className={`w-full text-left p-3 rounded-xl border transition flex items-center justify-between ${
                            isSelected
                              ? 'bg-[#FFF3EB] border-[#E87524] text-[#E87524] shadow-xs'
                              : 'bg-white border-[#E9DCCB]/60 hover:bg-[#FAF8F5] text-[#292522]'
                          }`}
                        >
                          <div>
                            <div className="font-bold text-xs">{p.name_fr || (p as any).name}</div>
                            <div className="text-[10px] text-stone-600 font-mono">
                              {CurrencyUtil.formatDZD(p.selling_price_ttc || 0)}
                            </div>
                          </div>
                          <div>
                            {yld?.hasRecipe ? (
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold border border-emerald-200">
                                {yld.maxPortions} pz
                              </span>
                            ) : (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 font-bold">
                                Non configuré
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Colonne Centrale & Droite : Éditeur de Fiche Technique */}
                <div className="lg:col-span-2 bg-white rounded-2xl border border-[#E9DCCB] shadow-xs p-6 flex flex-col justify-between">
                  <div className="space-y-4">
                    {/* En-tête du Plat Sélectionné */}
                    <div className="flex flex-wrap items-center justify-between border-b border-[#E9DCCB] pb-4 gap-2">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-stone-600 tracking-wider">
                          Fiche Technique (Recette & Portions)
                        </span>
                        <h2 className="text-lg font-bold text-[#292522]">
                          {currentRecipeProduct?.name_fr || (currentRecipeProduct as any)?.name}
                        </h2>
                        <div className="text-xs text-stone-600">
                          {currentRecipeProduct?.name_ar && <span>{currentRecipeProduct.name_ar} • </span>}
                          Prix de vente:{' '}
                          <span className="font-mono font-bold text-[#E87524]">
                            {CurrencyUtil.formatDZD(currentRecipeProduct?.selling_price_ttc || 0)}
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={handleOpenIngredientPicker}
                        className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-white bg-[#E87524] hover:bg-[#D3641B] rounded-lg shadow-sm transition active:scale-95 cursor-pointer"
                        title="اختيار مكون من المخزون لإضافته لهذه الوصفة"
                      >
                        <Plus className="w-4 h-4" />
                        <span>+ Ajouter un Ingrédient</span>
                      </button>
                    </div>

                    {/* Liste des Ingrédients de la Recette */}
                    {recipeEntries.length === 0 ? (
                      <div className="py-12 border-2 border-dashed border-[#E9DCCB] rounded-xl text-center text-xs text-stone-500">
                        <CookingPot className="w-8 h-8 mx-auto text-stone-300 mb-2" />
                        <p className="font-bold text-[#292522]">Aucun ingrédient défini pour cette recette.</p>
                        <p className="text-[11px] text-stone-600 mt-1 max-w-sm mx-auto">
                          Cliquez sur "+ Ajouter un Ingrédient" pour spécifier les matières premières nécessaires (ex: 250 g farine, 80 g sauce, 120 g mozzarella).
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="grid grid-cols-12 gap-2 text-[11px] font-bold text-stone-600 uppercase tracking-wider px-2">
                          <div className="col-span-5">Ingrédient</div>
                          <div className="col-span-3">Quantité / Portion</div>
                          <div className="col-span-3 text-right">Coût Portion</div>
                          <div className="col-span-1 text-center">Retirer</div>
                        </div>

                        {recipeEntries.map((entry, idx) => {
                          const ing = ingredients.find(i => i.id === entry.ingredient_id);
                          const portionCost = ing ? entry.quantity_required * ing.cost_per_unit : 0;

                          return (
                            <div
                              key={idx}
                              className="grid grid-cols-12 gap-2 items-center p-2.5 bg-[#FCFBF9] border border-[#E9DCCB] rounded-xl text-xs"
                            >
                              {/* Ingrédient */}
                              <div className="col-span-5">
                                <select
                                  value={entry.ingredient_id}
                                  onChange={e => handleUpdateRecipeRow(idx, 'ingredient_id', e.target.value)}
                                  className="w-full p-2 bg-white border border-[#E9DCCB] rounded-lg text-xs font-medium focus:border-[#E87524] focus:outline-none"
                                >
                                  {ingredients.map(i => (
                                    <option key={i.id} value={i.id}>
                                      {i.name_fr} ({i.unit} - Stock: {i.current_stock})
                                    </option>
                                  ))}
                                </select>
                              </div>

                              {/* Quantité nécessaire */}
                              <div className="col-span-3 flex items-center gap-1">
                                <input
                                  type="number"
                                  step="any"
                                  min="0"
                                  value={entry.quantity_required}
                                  onChange={e =>
                                    handleUpdateRecipeRow(idx, 'quantity_required', parseFloat(e.target.value) || 0)
                                  }
                                  className="w-full p-2 bg-white border border-[#E9DCCB] rounded-lg text-xs font-mono font-bold text-right focus:border-[#E87524] focus:outline-none"
                                />
                                <span className="font-mono text-[11px] text-stone-500 font-bold w-12 text-center">
                                  {ing?.unit || ''}
                                </span>
                              </div>

                              {/* Coût pour 1 portion */}
                              <div className="col-span-3 text-right font-mono font-bold text-stone-700">
                                {CurrencyUtil.formatDZD(portionCost)}
                              </div>

                              {/* Supprimer */}
                              <div className="col-span-1 text-center">
                                <button
                                  onClick={() => handleRemoveRecipeRow(idx)}
                                  className="p-1.5 text-stone-600 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                                  title="Retirer cet ingrédient"
                                >
                                  <Trash2 className="w-4 h-4 mx-auto" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Synthèse en Temps Réel du Plat (Food Cost & Rendement) */}
                    {liveRecipeCalculation && recipeEntries.length > 0 && (
                      <div className="p-4 bg-[#FAF8F5] border border-[#E9DCCB] rounded-xl grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                        <div>
                          <div className="text-[10px] uppercase font-bold text-stone-600">
                            Coût de Revient Matière
                          </div>
                          <div className="text-base font-black text-stone-800 font-mono mt-0.5">
                            {CurrencyUtil.formatDZD(liveRecipeCalculation.foodCost)}
                          </div>
                        </div>

                        <div>
                          <div className="text-[10px] uppercase font-bold text-stone-600">
                            Marge Brute / Plat
                          </div>
                          <div className="text-base font-black text-emerald-700 font-mono mt-0.5">
                            {CurrencyUtil.formatDZD(liveRecipeCalculation.grossMargin)}{' '}
                            <span className="text-xs">({liveRecipeCalculation.grossMarginPercent}%)</span>
                          </div>
                        </div>

                        <div>
                          <div className="text-[10px] uppercase font-bold text-stone-600">
                            Capacité Actuelle
                          </div>
                          <div className={`text-base font-black font-mono mt-0.5 ${liveRecipeCalculation.maxPortions > 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                            {liveRecipeCalculation.maxPortions} pizzas
                          </div>
                        </div>

                        <div>
                          <div className="text-[10px] uppercase font-bold text-stone-600">
                            Ingrédient Limitant
                          </div>
                          <div className={`text-xs font-bold truncate mt-1 ${liveRecipeCalculation.maxPortions === 0 ? 'text-rose-600' : 'text-stone-700'}`}>
                            {liveRecipeCalculation.limitingIngName || 'Stock suffisant'}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Alerte rouge si rupture d'un ingrédient dans la recette */}
                    {liveRecipeCalculation && liveRecipeCalculation.maxPortions === 0 && recipeEntries.length > 0 && (
                      <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2.5 text-rose-800 text-xs">
                        <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                        <div>
                          <span className="font-bold">المخزون الحالي غير كافٍ (0 بيتزا ممكنة) : </span>
                          <span>{liveRecipeCalculation.limitingIngName} نفد أو لا يكفي لتحضير بيتزا كاملة. يرجى تزويد المخزون.</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Bouton d'Enregistrement de la Fiche Technique */}
                  <div className="pt-4 border-t border-[#E9DCCB] mt-6 flex items-center justify-between">
                    <span className="text-[11px] text-stone-600">
                      Toutes les modifications recalculent instantanément la capacité de production.
                    </span>
                    <button
                      onClick={handleSaveRecipe}
                      disabled={savingRecipe}
                      className="px-6 py-2.5 text-xs font-bold text-white bg-[#E87524] hover:bg-[#D3641B] rounded-xl shadow-md transition active:scale-95 disabled:opacity-50"
                    >
                      {savingRecipe ? 'Enregistrement...' : 'Enregistrer la Fiche Technique'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* MODAL : NOUVEL / MODIFIER INGRÉDIENT */}
      {/* ========================================================================= */}
      {showIngredientModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-[#E9DCCB] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in duration-200">
            <div className="px-6 py-4 bg-[#FAF8F5] border-b border-[#E9DCCB] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-[#FFF3EB] text-[#E87524] rounded-lg">
                  <Scale className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-[#292522]">
                  {editingIngredient ? 'Modifier l\'Ingrédient' : 'Ajouter une Matière Première'}
                </h3>
              </div>
              <button
                onClick={() => setShowIngredientModal(false)}
                className="text-stone-600 hover:text-stone-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveIngredient} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-stone-600 uppercase mb-1">
                  Nom de l'ingrédient (Français) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="ex: Farine T55, Mozzarella Fior di Latte..."
                  value={ingForm.name_fr}
                  onChange={e => setIngForm({ ...ingForm, name_fr: e.target.value })}
                  className="w-full p-2.5 bg-[#FCFBF9] border border-[#E9DCCB] rounded-xl focus:border-[#E87524] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-stone-600 uppercase mb-1">
                  Nom en Arabe (Optionnel)
                </label>
                <input
                  type="text"
                  placeholder="ex: فرينة، جبن موزاريلا..."
                  value={ingForm.name_ar}
                  onChange={e => setIngForm({ ...ingForm, name_ar: e.target.value })}
                  className="w-full p-2.5 bg-[#FCFBF9] border border-[#E9DCCB] rounded-xl focus:border-[#E87524] focus:outline-none text-right"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-stone-600 uppercase mb-1">
                    Unité de Mesure *
                  </label>
                  <select
                    value={ingForm.unit}
                    onChange={e => setIngForm({ ...ingForm, unit: e.target.value as any })}
                    className="w-full p-2.5 bg-[#FCFBF9] border border-[#E9DCCB] rounded-xl focus:border-[#E87524] focus:outline-none font-bold"
                  >
                    <option value="kg">kg (Kilogramme)</option>
                    <option value="g">g (Gramme)</option>
                    <option value="L">L (Litre)</option>
                    <option value="ml">ml (Millilitre)</option>
                    <option value="pièce">pièce (Unité)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-stone-600 uppercase mb-1">
                    Stock Initial ({ingForm.unit})
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={ingForm.current_stock}
                    onChange={e => setIngForm({ ...ingForm, current_stock: parseFloat(e.target.value) || 0 })}
                    className="w-full p-2.5 bg-[#FCFBF9] border border-[#E9DCCB] rounded-xl font-mono font-bold focus:border-[#E87524] focus:outline-none text-right"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-stone-600 uppercase mb-1">
                    Seuil d'Alerte Minimum
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={ingForm.min_stock_alert}
                    onChange={e => setIngForm({ ...ingForm, min_stock_alert: parseFloat(e.target.value) || 0 })}
                    className="w-full p-2.5 bg-[#FCFBF9] border border-[#E9DCCB] rounded-xl font-mono focus:border-[#E87524] focus:outline-none text-right"
                  />
                </div>

              <div>
                  <label className="block text-[11px] font-bold text-stone-600 uppercase mb-1">
                    Prix d'achat par {ingForm.unit} (DA) *
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    placeholder={`ex: ${ingForm.unit === 'kg' ? '120' : ingForm.unit === 'g' ? '0.12' : ingForm.unit === 'L' ? '80' : ingForm.unit === 'ml' ? '0.08' : '50'}`}
                    value={ingForm.cost_per_unit}
                    onChange={e => setIngForm({ ...ingForm, cost_per_unit: parseFloat(e.target.value) || 0 })}
                    className="w-full p-2.5 bg-[#FCFBF9] border border-[#E9DCCB] rounded-xl font-mono focus:border-[#E87524] focus:outline-none text-right"
                  />
                  {/* Conseil de saisie selon l'unité */}
                  <div className="mt-1 text-[10px] text-stone-500 leading-tight">
                    {ingForm.unit === 'g' && (
                      <span className="text-amber-700 font-medium">
                        ⚠️ Prix par gramme. Ex: si 1 kg de farine = 80 DA → saisir 0.08 DA/g
                      </span>
                    )}
                    {ingForm.unit === 'ml' && (
                      <span className="text-amber-700 font-medium">
                        ⚠️ Prix par ml. Ex: si 1 L = 80 DA → saisir 0.08 DA/ml
                      </span>
                    )}
                    {ingForm.unit === 'kg' && (
                      <span className="text-emerald-700 font-medium">
                        ✓ Saisir directement le prix du kg en DA
                      </span>
                    )}
                    {ingForm.unit === 'L' && (
                      <span className="text-emerald-700 font-medium">
                        ✓ Saisir directement le prix du litre en DA
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-[#E9DCCB] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowIngredientModal(false)}
                  className="px-4 py-2 border border-[#E9DCCB] text-stone-600 hover:bg-stone-50 rounded-xl transition font-medium"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#E87524] hover:bg-[#D3641B] text-white font-bold rounded-xl transition shadow-sm active:scale-95"
                >
                  {editingIngredient ? 'Mettre à jour' : 'Ajouter au Stock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL : AJUSTEMENT PERSONNALISÉ DE STOCK */}
      {/* ========================================================================= */}
      {showAdjustModal && adjustTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-[#E9DCCB] rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4 animate-in fade-in duration-200">
            <div className="flex items-center justify-between border-b border-[#E9DCCB] pb-3">
              <div>
                <h3 className="text-sm font-bold text-[#292522]">Ajustement de Stock</h3>
                <p className="text-[11px] text-stone-500 font-bold">{adjustTarget.name_fr}</p>
              </div>
              <button
                onClick={() => setShowAdjustModal(false)}
                className="text-stone-600 hover:text-stone-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleApplyAdjustment} className="space-y-3 text-xs">
              <div className="p-3 bg-[#FAF8F5] rounded-xl border border-[#E9DCCB] text-center">
                <div className="text-[10px] text-stone-600 uppercase font-bold">Stock Actuel</div>
                <div className="text-xl font-black text-[#E87524] font-mono mt-0.5">
                  {adjustTarget.current_stock} {adjustTarget.unit}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-stone-600 uppercase mb-1">
                  Quantité à ajouter (+) ou déduire (-)
                </label>
                <input
                  type="number"
                  step="any"
                  placeholder="ex: +5 ou -2"
                  value={adjustQty}
                  onChange={e => setAdjustQty(parseFloat(e.target.value) || 0)}
                  className="w-full p-2.5 bg-[#FCFBF9] border border-[#E9DCCB] rounded-xl font-mono font-black text-base focus:border-[#E87524] focus:outline-none text-center"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-stone-600 uppercase mb-1">
                  Motif / Raison
                </label>
                <select
                  value={adjustReason}
                  onChange={e => setAdjustReason(e.target.value)}
                  className="w-full p-2 bg-[#FCFBF9] border border-[#E9DCCB] rounded-xl focus:border-[#E87524] focus:outline-none font-medium"
                >
                  <option value="Réapprovisionnement">Réapprovisionnement d'achat</option>
                  <option value="Perte / Casse">Perte ou casse de matière</option>
                  <option value="Date de péremption">Périmé / Jeté</option>
                  <option value="Inventaire physique">Correction suite à inventaire</option>
                </select>
              </div>

              <div className="pt-2 border-t border-[#E9DCCB] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAdjustModal(false)}
                  className="px-4 py-2 border border-[#E9DCCB] text-stone-600 hover:bg-stone-50 rounded-xl transition font-medium"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#E87524] hover:bg-[#D3641B] text-white font-bold rounded-xl transition shadow-sm active:scale-95"
                >
                  Valider l'Ajustement
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Sélection Manuelle d'un Ingrédient pour la Recette */}
      {showIngredientPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl border border-[#E9DCCB] shadow-2xl max-w-lg w-full p-5 space-y-4 max-h-[85vh] flex flex-col">
            {/* En-tête */}
            <div className="flex items-center justify-between border-b border-[#E9DCCB] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#FFF8EF] border border-[#E9DCCB] flex items-center justify-center text-[#E87524]">
                  <CookingPot className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-[#292522]">
                    اختيار مكوّن للوصفة / Choisir un Ingrédient
                  </h3>
                  <p className="text-[11px] text-stone-500 font-medium">
                    حدد المادة الأولية التي تريد إضافتها لمقادير: <span className="font-bold text-[#E87524]">{currentRecipeProduct?.name_fr}</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowIngredientPicker(false)}
                className="w-8 h-8 rounded-xl bg-white border border-[#E9DCCB] text-stone-500 hover:text-stone-800 hover:bg-stone-100 flex items-center justify-center transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Barre de Recherche rapide */}
            <div className="relative">
              <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                autoFocus
                placeholder="ابحث عن مكوّن (طماطم، جبن، فرينة، زيتون...)..."
                value={pickerSearch}
                onChange={e => setPickerSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-[#FCFBF9] border border-[#E9DCCB] rounded-xl text-xs font-medium focus:border-[#E87524] focus:outline-none"
              />
            </div>

            {/* Liste des ingrédients du stock */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[220px] max-h-[360px]">
              {(() => {
                const searchLower = pickerSearch.toLowerCase().trim();
                const filtered = ingredients.filter(i =>
                  i.name_fr.toLowerCase().includes(searchLower) ||
                  (i.name_ar && i.name_ar.toLowerCase().includes(searchLower))
                );

                if (filtered.length === 0) {
                  return (
                    <div className="text-center py-8 text-stone-400 text-xs">
                      <Package className="w-8 h-8 mx-auto mb-1.5 opacity-40" />
                      <p>لا يوجد مكوّن مطابق للبحث.</p>
                    </div>
                  );
                }

                return filtered.map(ing => {
                  const isAlreadyAdded = recipeEntries.some(r => r.ingredient_id === ing.id);
                  return (
                    <div
                      key={ing.id}
                      className={`p-3 rounded-2xl border transition flex items-center justify-between gap-3 ${
                        isAlreadyAdded
                          ? 'bg-stone-50 border-stone-200 opacity-70'
                          : 'bg-[#FCFBF9] border-[#E9DCCB] hover:border-[#E87524] hover:bg-amber-50/30'
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-[#292522]">{ing.name_fr}</span>
                          {ing.name_ar && (
                            <span className="text-[11px] text-stone-500 font-medium font-arabic">({ing.name_ar})</span>
                          )}
                          {isAlreadyAdded && (
                            <span className="text-[10px] bg-stone-200 text-stone-600 px-2 py-0.5 rounded-full font-bold">
                              ✓ مضاف مسبقاً
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-stone-500 flex items-center gap-2 mt-0.5">
                          <span>المخزون: <strong className="font-mono text-stone-800">{ing.current_stock} {ing.unit}</strong></span>
                          <span>•</span>
                          <span>التكلفة: <strong className="font-mono text-stone-800">{CurrencyUtil.formatDZD(ing.cost_per_unit)}</strong> / {ing.unit}</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleSelectIngredientForRecipe(ing)}
                        disabled={isAlreadyAdded}
                        className={`px-3 py-1.5 rounded-xl font-bold text-xs transition flex items-center gap-1 cursor-pointer ${
                          isAlreadyAdded
                            ? 'bg-stone-100 text-stone-400 cursor-not-allowed'
                            : 'bg-[#E87524] hover:bg-[#D3641B] text-white shadow-xs active:scale-95'
                        }`}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>{isAlreadyAdded ? 'موجود' : '+ إضافة'}</span>
                      </button>
                    </div>
                  );
                });
              })()}
            </div>

            {/* Pied de modal */}
            <div className="pt-2 border-t border-[#E9DCCB] flex items-center justify-between text-xs">
              <span className="text-[11px] text-stone-500">
                إجمالي مكونات المخزون: <strong className="font-mono">{ingredients.length}</strong>
              </span>
              <button
                type="button"
                onClick={() => setShowIngredientPicker(false)}
                className="px-4 py-1.5 border border-[#E9DCCB] text-stone-600 hover:bg-stone-50 rounded-xl transition font-medium cursor-pointer"
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
