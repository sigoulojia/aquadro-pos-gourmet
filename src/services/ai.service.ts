// Pizzeria POS Algérie — Copilote IA Opérationnel & Analytique pour Restaurant & Pizzeria
// Analyse complète des ventes, de la rentabilité (Food Cost), du stock des matières premières,
// de la capacité de production (Yield), des besoins du magasin et des conseils d'optimisation.

import { db } from '../db/sqlite';
import { reportService } from './report.service';
import { inventoryService } from './inventory.service';
import { authService } from './auth.service';
import { recipeService } from './recipe.service';
import { supplementService } from './supplement.service';
import { storeNeedsService } from './storeNeeds.service';
import { CurrencyUtil } from '../core/currency/currency';
import { Product, Sale } from '../types/database';

export interface AIResponse {
  answer: string;
  proposedAction?: {
    type: 'STOCK_WRITE_OFF';
    productId: string;
    productName: string;
    quantity: number;
    reason: string;
    description: string;
  };
}

export class AIService {
  private static instance: AIService;

  private constructor() {}

  public static getInstance(): AIService {
    if (!AIService.instance) {
      AIService.instance = new AIService();
    }
    return AIService.instance;
  }

  // Traiter une requête naturelle de l'utilisateur avec analyse approfondie
  public async query(prompt: string): Promise<AIResponse> {
    const q = prompt.toLowerCase().trim();
    const isAr = /[\u0600-\u06FF]/.test(prompt);

    // 1. Détection d'une demande de mise au rebut / déduction de matière ou produit (avec PIN)
    const writeOffMatch = q.match(/(?:déduire|supprimer|retirer|écrire|خصم|إنقاص|حذف|تالف|إتلاف)\s+(\d+)\s*(?:boîtes|pots|unités|قطعة|علبة|كغ|kg)?\s*(?:de\s+)?(.+?)(?:\s+(?:car|parce que|pour|بسبب|بسبب انتهاء|منتهي|périmé|avarié|cassé))?$/i);
    if (writeOffMatch) {
      const qty = parseInt(writeOffMatch[1], 10);
      const queryName = writeOffMatch[2].trim();
      const products = await db.select<Product>('SELECT * FROM products WHERE is_active = 1');
      const target = products.find(p =>
        p.name_fr.toLowerCase().includes(queryName.toLowerCase()) ||
        p.name_ar.toLowerCase().includes(queryName.toLowerCase())
      );

      if (target) {
        return {
          answer: isAr
            ? `لقد عثرت على المنتج **${target.name_ar || target.name_fr}** (المخزون الحالي: ${target.current_stock} قطعة).\n\nقمت بإعداد مقترح رسمي لخصم **${qty} قطعة** بسبب التلف أو انتهاء الصلاحية. نظراً لأن هذا الإجراء يغير السجلات المحاسبية والمخزون، يرجى تأكيده برمز PIN للمسؤول أدناه :`
            : `J'ai trouvé l'article **${target.name_fr}** (Stock actuel : ${target.current_stock} unités).\n\nJ'ai préparé une proposition formelle pour déduire **${qty} unités**. Veuillez valider ci-dessous avec le code PIN Responsable :`,
          proposedAction: {
            type: 'STOCK_WRITE_OFF',
            productId: target.id,
            productName: target.name_fr,
            quantity: qty,
            reason: 'EXPIRY_OR_DAMAGE',
            description: `Mise au rebut de ${qty}x ${target.name_fr} (Autorisation Manager requise)`
          }
        };
      }
    }

    // 2. Chiffre d'Affaires, Ventes & Recette du Jour ("شحال بعنا اليوم؟", "مبيعات اليوم", "chiffre d'affaires", "recette")
    if (q.includes('شحال بعنا') || q.includes('كم بعنا') || q.includes('vendu') || q.includes('chiffre') || q.includes('مبيعات اليوم') || q.includes('recette') || q.includes('دخل اليوم') || q.includes('مداخيل')) {
      const metrics = await reportService.getFinancialMetrics();
      const todayPrefix = new Date().toISOString().slice(0, 10);
      
      // Statistiques de ventilation du service (Sur place, à emporter, livraison)
      let surPlaceCount = 0;
      let emporterCount = 0;
      let livraisonCount = 0;
      let livraisonTotal = 0;

      try {
        const todaySales = await db.select<Sale>(
          "SELECT * FROM sales WHERE created_at LIKE ? AND status = 'COMPLETED'",
          [`${todayPrefix}%`]
        );
        for (const s of todaySales) {
          const notes = (s.notes || '').toUpperCase();
          if (notes.includes('LIVRAISON')) {
            livraisonCount++;
            livraisonTotal += s.total_ttc;
          } else if (notes.includes('EMPORTER')) {
            emporterCount++;
          } else {
            surPlaceCount++;
          }
        }
      } catch (e) {
        console.warn('Erreur détail types de vente:', e);
      }

      if (isAr) {
        return {
          answer: `📊 **تقرير مبيعات وأرباح اليوم الشامل :**\n\n` +
            `💰 **المؤشرات المالية الرئيسية :**\n` +
            `• **إجمالي المبيعات (رقم الأعمال) :** **${CurrencyUtil.formatDZD(metrics.revenue)}**\n` +
            `• **هامش الربح الإجمالي المحقق :** **${CurrencyUtil.formatDZD(metrics.grossMargin)}** (نسبة ربح: **${metrics.marginPercentage}%**)\n` +
            `• **عدد الطلبات المكتملة :** **${metrics.transactionCount}** طلب\n` +
            `• **متوسط قيمة الطلب (Panier Moyen) :** **${CurrencyUtil.formatDZD(metrics.averageBasket)}**\n\n` +
            `🍕 **توزيع الطلبات حسب نوع الخدمة :**\n` +
            `• **محلي (Sur Place) :** ${surPlaceCount} طلب\n` +
            `• **سفري (À Emporter) :** ${emporterCount} طلب\n` +
            `• **توصيل منزلي (Livraison) :** ${livraisonCount} طلب (بإجمالي: ${CurrencyUtil.formatDZD(livraisonTotal)})\n\n` +
            `💳 **طرق الدفع والتحصيل :**\n` +
            `• نقداً (Espèces) : **${CurrencyUtil.formatDZD(metrics.paymentBreakdown.cash)}**\n` +
            `• بطاقات بنكية (CIB / ذهبية) : **${CurrencyUtil.formatDZD(metrics.paymentBreakdown.cib_edahabia)}**\n` +
            (metrics.paymentBreakdown.credit > 0 ? `• ديون / آجل (Crédit) : **${CurrencyUtil.formatDZD(metrics.paymentBreakdown.credit)}**\n\n` : '\n') +
            `💡 **ملاحظة ذكية :** ${metrics.transactionCount > 15 ? 'نشاط ممتاز اليوم ووتيرة طلبات مرتفعة ! تأكد من استمرار تزويد المطبخ بالمواد الأولية.' : 'يمكنك تنشيط المبيعات بعرض وجبات التوصيل أو إضافة عروض ثنائية.'}`
        };
      }

      return {
        answer: `📊 **Bilan Opérationnel & Ventes de la Journée :**\n\n` +
          `💰 **Indicateurs Clés de Performance :**\n` +
          `• **Chiffre d'Affaires Réalisé :** **${CurrencyUtil.formatDZD(metrics.revenue)}**\n` +
          `• **Marge Brute Réalisée :** **${CurrencyUtil.formatDZD(metrics.grossMargin)}** (**${metrics.marginPercentage}%**)\n` +
          `• **Volume de Commandes :** **${metrics.transactionCount}** ventes validées\n` +
          `• **Panier Moyen :** **${CurrencyUtil.formatDZD(metrics.averageBasket)}**\n\n` +
          `🍕 **Ventilation des Commandes :**\n` +
          `• **Sur Place :** ${surPlaceCount} commandes\n` +
          `• **À Emporter :** ${emporterCount} commandes\n` +
          `• **Livraison :** ${livraisonCount} commandes (${CurrencyUtil.formatDZD(livraisonTotal)})\n\n` +
          `💳 **Encaissements :**\n` +
          `• Espèces : **${CurrencyUtil.formatDZD(metrics.paymentBreakdown.cash)}** | Carte CIB : **${CurrencyUtil.formatDZD(metrics.paymentBreakdown.cib_edahabia)}**`
      };
    }

    // 3. Top Produits & Plus Vendus ("أكثر البيتزا مبيعاً", "أفضل المبيعات", "top pizzas", "plus vendus")
    if (q.includes('أكثر') || q.includes('افضل') || q.includes('top') || q.includes('plus vendus') || q.includes('meilleur') || q.includes('مطلوبة') || q.includes('شائعة')) {
      const metrics = await reportService.getFinancialMetrics();
      const top = metrics.topProducts || [];

      if (top.length === 0) {
        return {
          answer: isAr
            ? 'ℹ️ **لا توجد مبيعات مسجلة حتى الآن اليوم.** بمجرد تسجيل طلبات على الكاشير، سأقدم لك ترتيب الأصناف الأكثر طلباً ومردودية.'
            : 'ℹ️ **Aucune vente enregistrée aujourd\'hui pour le moment.** Dès que des commandes seront validées, le classement des plats les plus vendus sera disponible ici.'
        };
      }

      const topList = top.slice(0, 5).map((p, idx) => 
        `${idx + 1}. **${p.name}** : **${p.quantity}** مبيعة | إجمالي: **${CurrencyUtil.formatDZD(p.revenue)}**`
      ).join('\n');

      return {
        answer: isAr
          ? `🏆 **ترتيب الأصناف والبيتزا الأكثر مبيعاً اليوم :**\n\n${topList}\n\n` +
            `💡 **توصية تشغيلية للشيف :**\n` +
            `الصنف المتصدر هو **${top[0].name}**. احرص على تحضير عجينته ومكوناته مسبقاً خلال ساعات الذروة لتسريع وتيرة إخراج الطلبات من الفرن.`
          : `🏆 **Top 5 des Produits les Plus Vendus :**\n\n${topList}\n\n` +
            `💡 **Recommandation Cuisine :**\n` +
            `La référence la plus commandée est **${top[0].name}**. Veillez à pré-étaler les pâtons et approvisionner ses ingrédients pour fluidifier les heures de pointe.`
      };
    }

    // 4. Capacité de Production Réelle (Yield) ("شحال نقدرو نخدمو بيتزا؟", "كم بيتزا نقدرو نصنعو؟", "طاقة الإنتاج")
    if (q.includes('نقدرو نخدمو') || q.includes('نقدر نصنع') || q.includes('طاقة الإنتاج') || q.includes('كم بيتزا') || q.includes('capacite') || q.includes('combien de pizza') || q.includes('rendement') || q.includes('yield')) {
      const yields = await recipeService.calculateAllYields();
      const recipePizzas = yields.filter(y => y.hasRecipe);

      if (recipePizzas.length === 0) {
        return {
          answer: isAr
            ? '⚠️ **لم تقم بضبط الفيش تكنيك (الوصفات) بعد.**\nيرجى الدخول إلى قسم **Gestion de Stock -> Fiches Techniques** وتحديد مقادير كل بيتزا (الفرينة، الجبن، الطماطم...) لأحسب لك بالتدقيق كم بيتزا يمكنك تحضيرها.'
            : '⚠️ **Aucune fiche technique de recette n\'est définie.**\nAccédez à l\'onglet **Gestion de Stock -> Fiches Techniques** pour spécifier les ingrédients requis par pizza afin de calculer votre capacité de production exacte.'
        };
      }

      const listStr = recipePizzas.map(y => {
        const bottleNeckStr = y.limitingIngredient 
          ? `(المكون الحرج: **${y.limitingIngredient.name}** - متبقي ${y.limitingIngredient.currentStock} ${y.limitingIngredient.unit})`
          : '';
        const statusIcon = y.maxPortions > 10 ? '🟢' : y.maxPortions > 0 ? '🟡' : '🔴';
        return `• ${statusIcon} **${y.productName}** : يمكن تحضير **${y.maxPortions} بيتزا** ${bottleNeckStr}`;
      }).join('\n');

      return {
        answer: isAr
          ? `🍕 **طاقة الإنتاج الحالية لمطبخ البيتزيريا (حسب مخزون المواد الأولية الحالي) :**\n\n${listStr}\n\n` +
            `🔍 **كيف يعمل الحساب الذكي؟**\n` +
            `يقوم النظام بحساب كمية كل مادة متوفرة ومقارنتها مع مقدار ما تحتاجه البيتزا الواحدة، لتنبيهك بالمادة التي ستنفد أولاً لمنع توقف الخدمة فجأة.`
          : `🍕 **Capacité de Production Maximale en Cuisine (Selon le stock d'ingrédients actuel) :**\n\n${listStr}\n\n` +
            `🔍 **Principe de calcul :**\n` +
            `Le moteur analyse les matières premières disponibles et détecte le facteur limitant pour chaque plat afin d'éviter toute rupture en plein service.`
      };
    }

    // 4. bis. Disponibilité des Pizzas & Conformité des Ingrédients ("البيتزا المتوفرة", "غير متوفر", "disponible", "rupture")
    if (q.includes('disponible') || q.includes('متوفر') || q.includes('غير متوفر') || q.includes('توفير') || q.includes('نقص مقادير')) {
      const statusMap = await recipeService.getAllProductsIngredientStatus();
      const allStatus = Object.values(statusMap);
      const unavailable = allStatus.filter(s => s.hasRecipe && !s.isAvailable);
      const available = allStatus.filter(s => !s.hasRecipe || s.isAvailable);

      let resAr = `🍕 **تقرير توفر البيتزا وتوافق المقادير في المطبخ :**\n\n`;

      if (unavailable.length === 0) {
        resAr += `✅ **جميع أنواع البيتزا متوفرة للبيع (Disponible) !** لا يوجد أي عجز في المقادير الأساسية حالياً.\n\n`;
      } else {
        resAr += `⚠️ **بيتزا غير متوفرة حالياً بسبب نقص في المقادير (${unavailable.length}) :**\n`;
        unavailable.forEach(u => {
          resAr += `• **${u.productName}** : ناقص (${u.missingIngredients.map(m => `${m.name_fr}: المتوفر ${m.current_stock} ${m.unit} / المطلوب ${m.quantity_required} ${m.unit}`).join('، ')})\n`;
        });
        resAr += `\n💡 **كيف تجعل البيتزا متوفرة (Disponible)؟**\nبمجرد تزويد المقادير الناقصة المذكورة أعلاه في قسم **المخزون** أو بنقرة واحدة داخل جدول **المنتجات (Carte)**، ستصبح البيتزا متوفرة تلقائياً في كاسة البيع دون أي تعقيد.\n\n`;
      }

      resAr += `📊 **البيتزا المتوفرة للبيع :**\n`;
      available.slice(0, 8).forEach(a => {
        resAr += `• **${a.productName}** : ${a.hasRecipe ? `متوفرة (تكفي لـ ${a.maxPortions} بيتزا)` : 'متوفرة'}\n`;
      });

      return { answer: resAr };
    }

    // 5. Surveillance des Ruptures & Matières Premières Faibles ("وش راه ناقص فالمخزون؟", "مواد أولية", "نواقص الستوك")
    if (q.includes('ناقص') || q.includes('مخزون') || q.includes('ستوك') || q.includes('rupture') || q.includes('stock faible') || q.includes('منتهي') || q.includes('ingrédient') || q.includes('مكونات')) {
      const ingredients = await recipeService.getIngredients();
      const lowIngs = ingredients.filter(i => i.current_stock <= i.min_stock_alert);
      const supplements = await supplementService.getSupplements(false);
      const lowSupps = supplements.filter(s => (s.current_stock ?? 50) <= (s.min_stock_alert ?? 5));

      if (lowIngs.length === 0 && lowSupps.length === 0) {
        return {
          answer: isAr
            ? '✅ **حالة المخزون ممتازة :** جميع المواد الأولية (الفرينة، الأجبان، الصلصات، اللحوم) وإضافات البيتزا متوفرة بمستويات آمنة تفوق حد التنبيه.'
            : '✅ **État des stocks optimal :** Toutes les matières premières (farine, fromages, sauces, viandes) et suppléments sont à un niveau sécurisé.'
        };
      }

      let resAr = `⚠️ **تقرير المواد الأولية التي تحتاج لإعادة التموين فوراً :**\n\n`;
      if (lowIngs.length > 0) {
        resAr += `🥫 **المواد الأساسية في المطبخ :**\n` +
          lowIngs.map(i => `• **${i.name_fr}** (${i.name_ar || ''}) : المتبقي **${i.current_stock} ${i.unit}** (حد التنبيه: ${i.min_stock_alert} ${i.unit}) — تكلفة الوحدة: ${CurrencyUtil.formatDZD(i.cost_per_unit)}`).join('\n') + '\n\n';
      }

      if (lowSupps.length > 0) {
        resAr += `🧀 **إضافات البيتزا (Suppléments) :**\n` +
          lowSupps.map(s => `• **${s.name_fr}** : المتبقي **${s.current_stock}** (حد التنبيه: ${s.min_stock_alert})`).join('\n') + '\n\n';
      }

      resAr += `🛒 **نصيحة :** يمكنك كتابة *« قائمة المشتريات المقترحة »* لأجهز لك قائمة تسوق جاهزة بالسوق بالجملة.`;

      return { answer: resAr };
    }

    // 6. Générateur Intelligent de Liste de Courses / Marché ("واش نشري؟", "قائمة المشتريات", "liste de courses", "achats")
    if (q.includes('واش نشري') || q.includes('قائمة المشتريات') || q.includes('مشتريات') || q.includes('قضيان') || q.includes('courses') || q.includes('achat') || q.includes('approvisionnement') || q.includes('marché')) {
      const ingredients = await recipeService.getIngredients();
      const lowIngs = ingredients.filter(i => i.current_stock <= i.min_stock_alert);
      const pendingNeeds = await storeNeedsService.getNeeds('PENDING');

      if (lowIngs.length === 0 && pendingNeeds.length === 0) {
        return {
          answer: isAr
            ? '🛒 **لا توجد نواقص ملحة حالياً !** مخزونك يكفي لتغطية الطلبات العادية، ولم يقم العمال بتسجيل أي احتياجات عاجلة.'
            : '🛒 **Aucun réapprovisionnement urgent requis !** Vos matières premières sont à bon niveau et aucune demande urgente n\'a été formulée.'
        };
      }

      let answerAr = `🛒 **قائمة المشتريات والتسوق المقترحة للبيتزيريا :**\n\n`;

      if (lowIngs.length > 0) {
        answerAr += `📦 **المواد الأولية الواجب شراؤها من سوق الجملة :**\n`;
        lowIngs.forEach((ing, idx) => {
          const qtyToBuy = Math.max(5, (ing.min_stock_alert * 3) - ing.current_stock);
          const estimatedCost = qtyToBuy * ing.cost_per_unit;
          answerAr += `${idx + 1}. [ ] **${ing.name_fr}** (${ing.name_ar || ''}) : اشتري **${qtyToBuy.toFixed(1)} ${ing.unit}** (تقدير التكلفة: ~${CurrencyUtil.formatDZD(estimatedCost)})\n`;
        });
        answerAr += `\n`;
      }

      if (pendingNeeds.length > 0) {
        answerAr += `📝 **احتياجات ومستلزمات سجلها العمال في قسم الاحتياجات :**\n`;
        pendingNeeds.forEach((n, idx) => {
          const urgBadge = n.urgency === 'URGENT' ? '🚨 [عاجل جداً]' : '🟡 [عادي]';
          answerAr += `${idx + 1}. [ ] ${urgBadge} **${n.item_name}** ${n.quantity_needed ? `(الكمية: ${n.quantity_needed})` : ''} — ${n.notes || 'بدون ملاحظات'} (سجلها: ${n.requested_by})\n`;
        });
      }

      answerAr += `\n💡 يمكنك مراجعة هذه القائمة وأخذها مباشرة عند الذهاب للموردين أو تجار الجملة.`;

      return { answer: answerAr };
    }

    // 7. Besoins du Magasin enregistrés par le Caissier ("احتياجات المحل", "واش قال الكاشير", "store needs", "besoins")
    if (q.includes('احتياجات') || q.includes('نحتاج') || q.includes('besoin') || q.includes('demandes') || q.includes('كاشير')) {
      const needs = await storeNeedsService.getNeeds('PENDING');

      if (needs.length === 0) {
        return {
          answer: isAr
            ? '📋 **سجل احتياجات المحل فارغ حالياً.** لم يقم أي كاشير أو عامل بتسجيل نقص لمواد التنظيف، علب البيتزا، أو المستلزمات.'
            : '📋 **Le registre des besoins est vide.** Aucune demande de consommables ou de fournitures n\'a été enregistrée par l\'équipe.'
        };
      }

      const needsList = needs.map((n, idx) => {
        const badge = n.urgency === 'URGENT' ? '🚨 عاجل' : '🟡 عادي';
        return `${idx + 1}. **${n.item_name}** [${badge}] — الكمية المطلوبة: **${n.quantity_needed || 'غير محددة'}**\n   • ملاحظات: ${n.notes || 'لا توجد'} (بواسطة: ${n.requested_by})`;
      }).join('\n\n');

      return {
        answer: isAr
          ? `📝 **احتياجات ومستلزمات المحل المسجلة من طرف الكاشير والعمال (${needs.length} طلب معلق) :**\n\n${needsList}\n\n*يمكنك تعليمها كـ « منجزة » بعد شرائها من قسم احتياجات المحل.*`
          : `📝 **Besoins du magasin formulés par le personnel (${needs.length} demandes en attente) :**\n\n${needsList}`
      };
    }

    // 8. Rentabilité & Food Cost des Pizzas ("البيتزا الأكثر ربحية", "هامش الربح", "food cost", "marge")
    if (q.includes('ربحية') || q.includes('هامش') || q.includes('ارباح') || q.includes('rentable') || q.includes('food cost') || q.includes('marge')) {
      const yields = await recipeService.calculateAllYields();
      const withMargins = yields.filter(y => y.hasRecipe && y.sellingPrice > 0);

      if (withMargins.length === 0) {
        return {
          answer: isAr
            ? 'ℹ️ **يرجى إدخال أسعار بيع البيتزا ومقادير الوصفة أولاً** لأحسب لك بالدينار والنسبة المئوية هامش الربح وتكلفة المكونات (Food Cost).'
            : 'ℹ️ **Veuillez configurer les fiches techniques et prix de vente** pour obtenir l\'analyse de Food Cost et des marges par produit.'
        };
      }

      // Trier par marge brute décroissante
      const sorted = [...withMargins].sort((a, b) => b.grossMarginPercent - a.grossMarginPercent);

      const tableStr = sorted.map((p, idx) => 
        `${idx + 1}. **${p.productName}** : سعر البيع: ${CurrencyUtil.formatDZD(p.sellingPrice)} | تكلفة المكونات: **${CurrencyUtil.formatDZD(p.foodCost)}** | الربح الصافي: **${CurrencyUtil.formatDZD(p.grossMargin)}** (نسبة ربح: **${p.grossMarginPercent}%**)`
      ).join('\n');

      return {
        answer: isAr
          ? `📈 **تحليل ربحية البيتزا وتكلفة المكونات (Food Cost Analysis) :**\n\n${tableStr}\n\n` +
            `💡 **نصائح مالية ذكية للبيتزيريا :**\n` +
            `• البيتزا صاحبة أعلى نسبة ربح هي **${sorted[0].productName}** بنسبة **${sorted[0].grossMarginPercent}%** ! انصح الكاشير باقتراحها كخيار مفضل للزبائن.\n` +
            `• حافظ دوماً على نسبة تكلفة مكونات إجمالية (Food Cost) تتراوح بين **28% إلى 35%** لتحقيق أقصى ربحية ممكنة.`
          : `📈 **Analyse de Rentabilité & Food Cost par Pizza :**\n\n${tableStr}\n\n` +
            `💡 **Conseil de gestion :**\n` +
            `Le plat le plus rentable est **${sorted[0].productName}** avec **${sorted[0].grossMarginPercent}%** de marge brute. Mettez-le en avant sur votre carte !`
      };
    }

    // 9. Analyse du Service Livraison ("خدمة التوصيل", "توصيل", "livraison", "livreur")
    if (q.includes('توصيل') || q.includes('دليفري') || q.includes('livraison') || q.includes('livreur')) {
      const todayPrefix = new Date().toISOString().slice(0, 10);
      let deliveryOrders: Sale[] = [];
      try {
        const allToday = await db.select<Sale>(
          "SELECT * FROM sales WHERE created_at LIKE ? AND status = 'COMPLETED'",
          [`${todayPrefix}%`]
        );
        deliveryOrders = allToday.filter(s => (s.notes || '').toUpperCase().includes('LIVRAISON'));
      } catch (e) {}

      if (deliveryOrders.length === 0) {
        return {
          answer: isAr
            ? '🛵 **لا توجد طلبات توصيل منزلي مسجلة اليوم حتى الآن.** يمكنك تفعيل خيار Livraison عند تسجيل أي طلب من شاشة الكاشير وإضافة اسم الزبون ورقم هاتفه.'
            : '🛵 **Aucune commande en livraison enregistrée aujourd\'hui.** Vous pouvez sélectionner le mode Livraison lors de la commande au comptoir.'
        };
      }

      const totalDelivRev = deliveryOrders.reduce((sum, s) => sum + s.total_ttc, 0);

      return {
        answer: isAr
          ? `🛵 **تقرير نشاط خدمة التوصيل المنزلي (Livraison) لليوم :**\n\n` +
            `• **عدد طلبيات التوصيل المنفذة :** **${deliveryOrders.length}** طلب\n` +
            `• **إجمالي مداخيل طلبيات التوصيل :** **${CurrencyUtil.formatDZD(totalDelivRev)}**\n` +
            `• **متوسط قيمة طلب التوصيل :** **${CurrencyUtil.formatDZD(Math.round(totalDelivRev / deliveryOrders.length))}**\n\n` +
            `📦 **آخر طلبيات التوصيل المسجلة :**\n` +
            deliveryOrders.slice(-3).map(s => `• وصل ${s.receipt_number} — ${s.customer_name || 'زبون'} — ${CurrencyUtil.formatDZD(s.total_ttc)}`).join('\n')
          : `🛵 **Activité du Service Livraison :**\n\n` +
            `• **Nombre de livraisons :** ${deliveryOrders.length} courses\n` +
            `• **Recette livraison :** ${CurrencyUtil.formatDZD(totalDelivRev)}\n` +
            `• **Panier moyen :** ${CurrencyUtil.formatDZD(Math.round(totalDelivRev / deliveryOrders.length))}`
      };
    }

    // 10. Conseils de Gestion et Optimisation pour la Pizzeria ("نصائح", "تطوير البيتزيريا", "كيفاش نزيد الأرباح", "conseils")
    if (q.includes('نصائح') || q.includes('تطوير') || q.includes('كيفاش نزيد') || q.includes('أرباح') || q.includes('conseil') || q.includes('optimiser') || q.includes('idee')) {
      return {
        answer: isAr
          ? `👨‍🍳 **دليل النصائح الذهبية لمضاعفة أرباح وتطوير أداء البيتزيريا :**\n\n` +
            `1️⃣ **إدارة ساعات الذروة (19:00 - 22:00) :**\n` +
            `• قم بفتح كرات العجين وتبريدها قليلاً قبل وقت الذروة بـ 30 دقيقة.\n` +
            `• اجعل صواني الإضافات (صلصة، موزاريلا، زيتون، فطر) مليئة مسبقاً لتوفير 40 ثانية في كل بيتزا.\n\n` +
            `2️⃣ **رفع متوسط السلة (Upselling) :**\n` +
            `• وجّه الكاشير لعرض المشروبات والإضافات دائماً: *"مع بطاطا فريت أو مشروب كولد؟"* (تزيد الأرباح الصافية بنسبة 20%).\n` +
            `• شجع خيار إضافة الجبن المضاعف (Suppléments) لأن هامش ربحه يتجاوز 65%.\n\n` +
            `3️⃣ **التحكم الصارم في الهدر الغذائي (Food Waste) :**\n` +
            `• استخدم ميزان المطبخ بدقة في كل حبة بيتزا (مثلاً: 120 غرام موزاريلا ثابتة بدون زيادة غير محسوبة).\n` +
            `• اتبع قاعدة ما يدخل أولاً يخرج أولاً (FEFO) بالنسبة للأجبان والصلصات الطازجة.\n\n` +
            `4️⃣ **تنشيط خدمة التوصيل في أوقات الغداء :**\n` +
            `• قدم عروض خاصة بموظفي الشركات والمدارس بين الساعة 11:30 و 14:00 لرفع المبيعات خارج الذروة الليلية.`
          : `👨‍🍳 **Conseils Stratégiques pour Développer la Rentabilité de votre Pizzeria :**\n\n` +
            `1️⃣ **Maîtrise du Coup de Feu (Rush) :** Préparez et pré-portionnez vos ingrédients majeurs 30 min avant le pic du soir.\n` +
            `2️⃣ **Vente Suggestive :** Proposez systématiquement une boisson ou un supplément fromage (+20% de panier moyen).\n` +
            `3️⃣ **Zéro Gaspillage (Food Cost) :** Pesez rigoureusement le fromage (ex: 120g précis) pour éviter les surcoûts invisibles.\n` +
            `4️⃣ **Formules Midi :** Créez des offres pizza + boisson le midi pour capter la clientèle professionnelle.`
      };
    }

    // Réponse générale d'accueil et sitemap interactif des compétences de l'IA
    return {
      answer: isAr
        ? `🍕 **مرحباً بك في المساعد الذكي لمتابعة وتسيير البيتزيريا !**\n\n` +
          `أنا تحت تصرفك لمساعدتك في أي معلومة حول المحل. يمكنك سؤالي مباشرة عن :\n\n` +
          `📊 **المبيعات والأرباح :**\n` +
          `• *« شحال بعنا اليوم؟ »*\n` +
          `• *« ما هي البيتزا الأكثر مبيعاً؟ »*\n` +
          `• *« تقرير نشاط التوصيل المنزلي (Livraison) »*\n\n` +
          `🥫 **المخزون والمطبخ :**\n` +
          `• *« وش راه ناقص فالمواد الأولية؟ »*\n` +
          `• *« شحال نقدرو نخدمو بيتزا بالمخزون الحالي؟ »* (طاقة الإنتاج)\n` +
          `• *« قائمة المشتريات المقترحة للتسوق »*\n\n` +
          `💰 **الربحية واحتياجات المحل :**\n` +
          `• *« ما هي البيتزا الأكثر ربحية؟ »* (تحليل Food Cost)\n` +
          `• *« ما هي احتياجات المحل المسجلة من العمال؟ »*\n` +
          `• *« نصائح لتطوير مبيعات وأرباح البيتزيريا »*\n\n` +
          `✍️ اكتب سؤالك وسأجيبك فوراً بدقة مستندة إلى بيانات محلك الحقيقية !`
        : `🍕 **Bienvenue sur le Copilote Intelligent de votre Pizzeria !**\n\n` +
          `Je suis configuré pour analyser vos données en temps réel. Vous pouvez me demander :\n\n` +
          `📊 **Ventes & Finances :**\n` +
          `• *« Combien avons-nous vendu aujourd'hui ? »*\n` +
          `• *« Quelles sont les pizzas les plus vendues ? »*\n` +
          `• *« Bilan du service livraison »*\n\n` +
          `🥫 **Stock & Capacité Cuisine :**\n` +
          `• *« Quels ingrédients sont en rupture de stock ? »*\n` +
          `• *« Combien de pizzas pouvons-nous préparer actuellement ? »*\n` +
          `• *« Liste de courses suggérée »*\n\n` +
          `💰 **Rentabilité & Besoins :**\n` +
          `• *« Quels plats ont la meilleure marge ? »* (Food Cost)\n` +
          `• *« Besoins du magasin formulés par le personnel »*\n` +
          `• *« Conseils pour augmenter le chiffre d'affaires »*`
    };
  }

  // Exécuter une action approuvée par PIN Manager
  public async executeApprovedAction(
    action: NonNullable<AIResponse['proposedAction']>,
    managerPin: string
  ): Promise<boolean> {
    const pinCheck = await authService.verifyManagerOrOwnerPin(managerPin);
    if (!pinCheck.valid || !pinCheck.user) {
      throw new Error('Code PIN Responsable invalide ou non autorisé.');
    }

    if (action.type === 'STOCK_WRITE_OFF') {
      await inventoryService.recordMovement({
        productId: action.productId,
        movementType: 'DAMAGE',
        quantityChange: -action.quantity,
        reason: `Mise au rebut validée par IA (${action.reason}) - Approuvée par ${pinCheck.user.name}`,
        referenceId: `AI-ADJ-${Date.now().toString().slice(-6)}`,
        userId: pinCheck.user.id,
        userName: pinCheck.user.name
      });

      // Journaliser dans l'audit log
      await db.execute(
        `INSERT INTO audit_logs (id, user_id, user_name, action, entity_type, entity_id, details, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          `audit-${Date.now()}`,
          pinCheck.user.id,
          pinCheck.user.name,
          'AI_STOCK_WRITE_OFF',
          'PRODUCT',
          action.productId,
          `Déduction de ${action.quantity}x ${action.productName}. Motif: ${action.reason}`,
          new Date().toISOString()
        ]
      );
      return true;
    }

    return false;
  }
}

export const aiService = AIService.getInstance();
