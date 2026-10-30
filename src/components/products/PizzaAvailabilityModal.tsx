// Pizzeria POS Algérie — Modal de Contrôle de Disponibilité & Conformité des Ingrédients
// Permet de visualiser les stocks d'ingrédients requis pour une pizza,
// de commander les ingrédients manquants (Store Needs) et de réapprovisionner en 1 clic.

import React, { useState } from 'react';
import { Product } from '../../types/database';
import { recipeService, ProductIngredientStatus } from '../../services/recipe.service';
import { CurrencyUtil } from '../../core/currency/currency';
import { useToast } from '../common/Toast';
import {
  X,
  Pizza,
  CheckCircle2,
  AlertTriangle,
  Send,
  Plus,
  RefreshCw,
  PowerOff,
  Power,
  Package,
  Layers,
  ArrowRight,
  Sparkles
} from 'lucide-react';

interface PizzaAvailabilityModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  status: ProductIngredientStatus | null;
  onRefresh: () => Promise<void>;
  onToggleActive: (product: Product, nextActive: number) => Promise<void>;
}

export const PizzaAvailabilityModal: React.FC<PizzaAvailabilityModalProps> = ({
  isOpen,
  onClose,
  product,
  status,
  onRefresh,
  onToggleActive
}) => {
  const { showToast } = useToast();
  const [requestedIngredients, setRequestedIngredients] = useState<Record<string, boolean>>({});
  const [isRestockingId, setIsRestockingId] = useState<string | null>(null);
  const [customRestockQty, setCustomRestockQty] = useState<Record<string, string>>({});
  const [isApplyingDefaultRecipe, setIsApplyingDefaultRecipe] = useState<boolean>(false);

  if (!isOpen || !product) return null;

  const isManuallyInactive = product.is_active === 0;
  const hasRecipe = status?.hasRecipe ?? false;
  const isOutOfIngredients = !isManuallyInactive && hasRecipe && !status?.isAvailable;
  const isFullyAvailable = !isManuallyInactive && (!hasRecipe || status?.isAvailable);

  // Demande d'approvisionnement (Store Needs)
  const handleRequestIngredient = async (ingredientId: string, ingredientName: string) => {
    try {
      await recipeService.requestIngredientRestock({
        ingredientId,
        productName: product.name_fr,
        requestedBy: 'مدير المحل (Gérant)'
      });
      setRequestedIngredients(prev => ({ ...prev, [ingredientId]: true }));
      showToast(`تم تسجيل طلب اقتناء [${ingredientName}] في احتياجات المتجر بنجاح`, 'success');
    } catch (err: any) {
      showToast(`Erreur : ${err?.message || err}`, 'error');
    }
  };

  // Réapprovisionnement rapide (+1, +5, +10 ou valeur personnalisée)
  const handleQuickRestock = async (ingredientId: string, ingredientName: string, amount: number) => {
    if (amount <= 0) return;
    setIsRestockingId(ingredientId);
    try {
      await recipeService.quickRestockIngredient(
        ingredientId,
        amount,
        `Réapprovisionnement rapide pour pizza ${product.name_fr}`
      );
      showToast(`تمت إضافة +${amount} إلى مخزون [${ingredientName}]`, 'success');
      await onRefresh();
    } catch (err: any) {
      showToast(`Erreur d'ajustement : ${err?.message || err}`, 'error');
    } finally {
      setIsRestockingId(null);
    }
  };

  const handleApplyQuickDefaultRecipe = async () => {
    if (!product) return;
    setIsApplyingDefaultRecipe(true);
    try {
      await recipeService.applyDefaultPizzaRecipe(product.id);
      showToast('تم ربط وحفظ المقادير القياسية للبيتزا بنجاح !', 'success');
      await onRefresh();
    } catch (err: any) {
      showToast(`فشل ربط المقادير: ${err?.message || err}`, 'error');
    } finally {
      setIsApplyingDefaultRecipe(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 select-none backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white border border-[#E9DCCB] w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col text-xs text-[#292522] max-h-[90vh]">
        {/* En-tête */}
        <div className="px-6 py-4 border-b border-[#E9DCCB] bg-[#FFF8EF] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-white border border-[#E9DCCB] flex items-center justify-center overflow-hidden shrink-0 shadow-2xs">
              {product.image_url ? (
                <img src={product.image_url} alt={product.name_fr} className="w-full h-full object-cover" />
              ) : (
                <Pizza className="w-6 h-6 text-[#E87524]" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-extrabold text-[#292522]">{product.name_fr}</h3>
                {product.name_ar && (
                  <span className="text-xs text-stone-500 font-arabic font-bold" dir="rtl">
                    ({product.name_ar})
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[#E87524] font-bold font-mono">
                {CurrencyUtil.formatDZD(product.selling_price_ttc)} • توافق المقادير والمخزون
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-700 p-2 rounded-xl hover:bg-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corps défilable */}
        <div className="p-6 overflow-y-auto space-y-4">
          {/* Bannière de Statut Global */}
          {isManuallyInactive ? (
            <div className="p-4 rounded-xl border border-stone-200 bg-stone-50 flex items-start gap-3">
              <PowerOff className="w-5 h-5 text-stone-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <h4 className="font-extrabold text-stone-700 text-xs">معطلة يدوياً في القائمة (Désactivée Manuellement)</h4>
                <p className="text-[11px] text-stone-600 mt-0.5 leading-relaxed">
                  تم تعطيل هذه البيتزا مؤقتاً من الظهور في كاسة البيع. لم يتم حذفها نهائياً ويمكنك إعادة تفعيلها بنقرة واحدة.
                </p>
                <button
                  onClick={() => onToggleActive(product, 1)}
                  className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs cursor-pointer shadow-xs transition-colors"
                >
                  <Power className="w-3.5 h-3.5" />
                  <span>إعادة التفعيل في القائمة (Activer)</span>
                </button>
              </div>
            </div>
          ) : isOutOfIngredients ? (
            <div className="p-4 rounded-xl border border-amber-300 bg-amber-50/70 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5 animate-pulse" />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h4 className="font-extrabold text-amber-900 text-xs">
                    غير متوفرة حالياً (نقص في مقادير المطبخ)
                  </h4>
                  <span className="px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 font-bold text-[10px]">
                    0 حصص ممكنة
                  </span>
                </div>
                <p className="text-[11px] text-amber-800 mt-1 leading-relaxed">
                  ⚠️ نفدت بعض المقادير الأساسية لتحضير هذه البيتزا من المطبخ. بمجرد تزويد المقادير الناقصة (الظاهرة أدناه باللون الأحمر)، ستصبح البيتزا متوفرة تلقائياً للبيع (Disponible).
                </p>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl border border-emerald-300 bg-emerald-50/70 flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h4 className="font-extrabold text-emerald-900 text-xs">
                    متوفرة وجاهزة للتحضير (Disponible)
                  </h4>
                  {hasRecipe && (
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-200 text-emerald-900 font-black text-[11px]">
                      يكفي لـ {status?.maxPortions} بيتزا
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-emerald-800 mt-1 leading-relaxed">
                  {hasRecipe
                    ? `✅ جميع مقادير البيتزا متوفرة في المطبخ بكميات كافية لصنع ${status?.maxPortions} بيتزا.`
                    : 'ℹ️ هذه البيتزا ليس لديها مقادير محددة بعد، وهي معتبرة متوفرة دائماً للبيع.'}
                </p>
              </div>
            </div>
          )}

          {/* Tableau des Ingrédients de la Recette */}
          {hasRecipe && status && status.recipeItems.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="font-extrabold text-[#292522] flex items-center gap-1.5 text-xs">
                  <Layers className="w-4 h-4 text-[#E87524]" />
                  <span>مقادير البيتزا ومطابقة المخزون بالمطبخ ({status.recipeItems.length} مكونات)</span>
                </h4>
                <span className="text-[10px] text-stone-500 font-medium">
                  المقدار في كل بيتزا مقابل المخزون الفعلي
                </span>
              </div>

              <div className="border border-[#E9DCCB] rounded-xl overflow-hidden bg-white shadow-2xs">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#FFF8EF] border-b border-[#E9DCCB] text-[10px] text-stone-600 uppercase font-black">
                      <th className="py-2.5 px-3">المكون (Ingrédient)</th>
                      <th className="py-2.5 px-3 text-center">المطلوب / بيتزا</th>
                      <th className="py-2.5 px-3 text-center">المخزون الحالي</th>
                      <th className="py-2.5 px-3 text-center">الحالة</th>
                      <th className="py-2.5 px-3 text-right">إجراءات المقدار</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E9DCCB]/60 text-xs">
                    {status.recipeItems.map(item => {
                      const isDeficient =
                        item.ingredient_current_stock < item.quantity_required ||
                        item.portions_possible === 0;
                      const hasRequested = requestedIngredients[item.ingredient_id];

                      return (
                        <tr
                          key={item.id}
                          className={`hover:bg-[#FFFDFB] transition-colors ${
                            isDeficient ? 'bg-red-50/40' : ''
                          }`}
                        >
                          <td className="py-3 px-3">
                            <div className="font-bold text-[#292522]">{item.ingredient_name_fr}</div>
                            {item.ingredient_name_ar && (
                              <div className="text-[10px] text-stone-500 font-arabic" dir="rtl">
                                {item.ingredient_name_ar}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-3 text-center font-bold text-stone-700">
                            {item.quantity_required} {item.ingredient_unit}
                          </td>
                          <td className="py-3 px-3 text-center">
                            <span
                              className={`font-black font-mono px-2 py-0.5 rounded ${
                                isDeficient
                                  ? 'bg-red-100 text-red-700 border border-red-300'
                                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              }`}
                            >
                              {item.ingredient_current_stock} {item.ingredient_unit}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-center">
                            {isDeficient ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                                <AlertTriangle className="w-3 h-3" />
                                <span>ناقص (عجز)</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>يكفي {item.portions_possible}</span>
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Bouton Demande Magasin (Store Needs) */}
                              <button
                                onClick={() =>
                                  handleRequestIngredient(item.ingredient_id, item.ingredient_name_fr)
                                }
                                disabled={hasRequested}
                                className={`px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer ${
                                  hasRequested
                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 cursor-default'
                                    : 'bg-[#FFF8EF] hover:bg-[#FFF3EB] text-[#E87524] border border-[#E9DCCB]'
                                }`}
                                title="إرسال طلب اقتناء لاحتياجات المتجر"
                              >
                                {hasRequested ? (
                                  <>
                                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                    <span>تم الطلب</span>
                                  </>
                                ) : (
                                  <>
                                    <Send className="w-3 h-3" />
                                    <span>طلب للمحل</span>
                                  </>
                                )}
                              </button>

                              {/* Boutons Réapprovisionnement Rapide */}
                              <div className="inline-flex items-center gap-1">
                                <button
                                  onClick={() =>
                                    handleQuickRestock(item.ingredient_id, item.ingredient_name_fr, 1)
                                  }
                                  disabled={isRestockingId === item.ingredient_id}
                                  className="px-1.5 py-1 rounded-md bg-stone-100 hover:bg-[#E87524] hover:text-white text-stone-700 font-mono text-[10px] font-bold border border-stone-200 transition-colors"
                                  title="إضافة +1 وحدة فوراً"
                                >
                                  +1
                                </button>
                                <button
                                  onClick={() =>
                                    handleQuickRestock(item.ingredient_id, item.ingredient_name_fr, 5)
                                  }
                                  disabled={isRestockingId === item.ingredient_id}
                                  className="px-1.5 py-1 rounded-md bg-[#FFF3EB] hover:bg-[#E87524] hover:text-white text-[#E87524] font-mono text-[10px] font-black border border-[#E9DCCB] transition-colors"
                                  title="إضافة +5 وحدة فوراً"
                                >
                                  +5
                                </button>
                                <button
                                  onClick={() =>
                                    handleQuickRestock(item.ingredient_id, item.ingredient_name_fr, 10)
                                  }
                                  disabled={isRestockingId === item.ingredient_id}
                                  className="px-1.5 py-1 rounded-md bg-stone-100 hover:bg-[#E87524] hover:text-white text-stone-700 font-mono text-[10px] font-bold border border-stone-200 transition-colors"
                                  title="إضافة +10 وحدة فوراً"
                                >
                                  +10
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="p-6 rounded-2xl border-2 border-dashed border-[#E9DCCB] bg-[#FFF8EF]/60 text-center space-y-3">
              <Package className="w-10 h-10 text-[#E87524]/60 mx-auto" />
              <div>
                <h4 className="text-sm font-bold text-[#292522]">لم يتم ربط مقادير (Fiche Technique) لهذه البيتزا بعد</h4>
                <p className="text-[11px] text-stone-600 mt-1 max-w-md mx-auto">
                  لتمكين حساب سعة التحضير وتتبع توفر هذه البيتزا في الكاسة تلقائياً، يمكنك تطبيق المقادير القياسية بنقرة واحدة أو تخصيصها من شاشة المخزون.
                </p>
              </div>
              <button
                type="button"
                onClick={handleApplyQuickDefaultRecipe}
                disabled={isApplyingDefaultRecipe}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#E87524] hover:bg-[#D3641B] text-white rounded-xl font-bold text-xs shadow-md transition active:scale-95 cursor-pointer disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4" />
                <span>{isApplyingDefaultRecipe ? 'جاري الحفظ...' : '⚡ ربط وحفظ مقادير قياسية (فرينة + صلصة + جبن)'}</span>
              </button>
            </div>
          )}

          {/* Contrôle Manuel de Désactivation / Suspension */}
          <div className="p-4 rounded-xl border border-[#E9DCCB] bg-[#FFF8EF]/40 flex items-center justify-between">
            <div>
              <div className="font-bold text-[#292522]">التحكم اليدوي في البيتزا</div>
              <div className="text-[11px] text-stone-500">
                تعطيل مؤقت عن القائمة (مثل عطل بالفرن أو عدم توفر الشيف اليوم) دون حذفها نهائياً.
              </div>
            </div>
            <button
              onClick={() => onToggleActive(product, product.is_active === 1 ? 0 : 1)}
              className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                product.is_active === 1
                  ? 'bg-stone-200 hover:bg-stone-300 text-stone-700'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
              }`}
            >
              <Power className="w-3.5 h-3.5" />
              <span>{product.is_active === 1 ? 'تعطيل مؤقت' : 'تفعيل في القائمة'}</span>
            </button>
          </div>
        </div>

        {/* Pied de Page */}
        <div className="px-6 py-3 border-t border-[#E9DCCB] bg-[#FFF8EF] flex items-center justify-between">
          <span className="text-[11px] text-stone-500">
            تحديث المخزون ينعكس فورياً في كاسة البيع ومطبخ الشيف
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-[#292522] hover:bg-black text-white font-bold text-xs transition-colors cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
