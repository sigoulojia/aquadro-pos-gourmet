// Aquadro POS Algérie V2 — Module Avancé de Personnalisation des Tickets (Ticket Designer)
// Permet au commerçant de personnaliser intégralement les tickets de caisse (Client) et les bons de cuisine (Pizzaiolo) :
// - Ordonnancement et positionnement des blocs (Monter / Descendre)
// - Réglage fin et granulaire de la taille des polices (Titre, N° commande, Articles, Quantités, Notes, Totaux)
// - Styles visuels (Bannières, Séparateurs, Badges de suppléments et encadrés de notes)
// - Affichage/Masquage de tous les champs et textes personnalisés
// - Prévisualisation thermique interactive en direct avec impression de test

import React, { useState, useEffect } from 'react';
import {
  printerService,
  ReceiptTemplateConfig,
  KitchenTicketTemplateConfig,
  CustomerReceiptBlock,
  KitchenTicketBlock,
  DEFAULT_RECEIPT_TEMPLATE_CONFIG,
  DEFAULT_KITCHEN_TICKET_TEMPLATE_CONFIG,
  DEFAULT_CUSTOMER_RECEIPT_BLOCK_ORDER,
  DEFAULT_KITCHEN_TICKET_BLOCK_ORDER,
  ReceiptPrintData
} from '../../services/printer.service';
import {
  Sliders,
  Printer,
  RotateCcw,
  Check,
  Store,
  Phone,
  MapPin,
  Wifi,
  Share2,
  Receipt,
  Eye,
  FileText,
  DollarSign,
  QrCode,
  Sparkles,
  ChefHat,
  ArrowUp,
  ArrowDown,
  Type,
  MoveVertical,
  Palette,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Bold,
  Maximize2,
  Minus,
  Plus
} from 'lucide-react';

interface TicketDesignerSectionProps {
  onShowToast: (message: string, type: 'info' | 'success' | 'warning' | 'error') => void;
}

// Définitions descriptives des blocs pour le ticket Client
const CUSTOMER_BLOCK_META: Record<CustomerReceiptBlock, { titleAr: string; titleFr: string; desc: string }> = {
  header: {
    titleAr: 'رأس التيكيت وهوية المحل',
    titleFr: 'En-tête & Identité Magasin',
    desc: 'اسم المحل، الشعار، العنوان، الهاتف، شبكات التواصل والواي فاي'
  },
  order_banner: {
    titleAr: 'بانر رقم الطلب ونوع الخدمة',
    titleFr: 'Bannière N° Commande & Mode',
    desc: 'رقم الطلب الكبير (#42) ونوع الطلب (طاولة / سفري / توصيل)'
  },
  order_info: {
    titleAr: 'معلومات وتوقيت الطلب',
    titleFr: 'Date, Heure & Caissier',
    desc: 'تاريخ وساعة الطلب، اسم البائع/الكاشير، ومعلومات زبون التوصيل'
  },
  items: {
    titleAr: 'جدول الوجبات والبيتزا',
    titleFr: 'Articles, Pizzas & Suppléments',
    desc: 'أسماء البيتزا، الأحجام، الإضافات، نصفين، وملاحظات الزبون'
  },
  subtotals: {
    titleAr: 'المجاميع الفرعية والخصومات',
    titleFr: 'Sous-totaux, Remises & Livraison',
    desc: 'سعر التوصيل، التخفيض، والضريبة إن وجدت'
  },
  total: {
    titleAr: 'المجموع الكلي النهائي',
    titleFr: 'Total Net à Payer (Grand Total)',
    desc: 'المبلغ الإجمالي النهائي المطلوب دفعه بخط عريض وواضح'
  },
  payment: {
    titleAr: 'وسيلة الدفع والصرف',
    titleFr: 'Mode de Paiement & Monnaie Rendue',
    desc: 'طريقة الدفع (نقداً / بطاقة)، المبلغ المقبوض والباقي المردود'
  },
  footer: {
    titleAr: 'تذييل التيكيت ورسائل الشكر',
    titleFr: 'Pied de Ticket & Remerciements',
    desc: 'عبارات الشكر والترحيب، الباركود وكود التيكيت السريع'
  }
};

// Définitions descriptives des blocs pour le bon Cuisine
const KITCHEN_BLOCK_META: Record<KitchenTicketBlock, { titleAr: string; titleFr: string; desc: string }> = {
  header: {
    titleAr: 'عنوان بون المطبخ والشارة',
    titleFr: 'Titre Bon de Cuisine • Pizzaiolo',
    desc: 'شارة رأس البون الموجهة لفريق الطهي وفرن البيتزا'
  },
  order_banner: {
    titleAr: 'بانر رقم الطلب الضخم ونوع الخدمة',
    titleFr: 'Bannière N° Commande & Mode Service',
    desc: 'رقم الطلب بخط كبير جداً لسهولة المتابعة مع نوع الطلب'
  },
  service_info: {
    titleAr: 'بيانات الوقت والنادل والزبون',
    titleFr: 'Heure, Serveur & Infos Client',
    desc: 'توقيت الطلب الدقيق، اسم النادل/الكاشير، وبيانات التوصيل'
  },
  items: {
    titleAr: 'قائمة الطلبات وملاحظات الطهي',
    titleFr: 'Articles, Quantités & Préparation',
    desc: 'الكميات الكبيرة 2x، أسماء البيتزا، النصفين، الإضافات والتعليمات'
  },
  notes: {
    titleAr: 'تعليمات عامة للطلب',
    titleFr: 'Instructions Générales Commande',
    desc: 'ملاحظات وتنبيهات عامة لكامل الطلب موجهة للطباخ'
  },
  footer: {
    titleAr: 'تذييل البون وفراغ القص',
    titleFr: 'Pied de Bon & Espacement de Coupe',
    desc: 'خط القص ومسافة الفراغ السفلية لسهولة تعليق البون'
  }
};

export const TicketDesignerSection: React.FC<TicketDesignerSectionProps> = ({ onShowToast }) => {
  // Onglet principal : 'customer' (Client) ou 'kitchen' (Cuisine / Pizzaiolo)
  const [activeTab, setActiveTab] = useState<'customer' | 'kitchen'>('customer');

  // Sous-panneau actif dans l'onglet
  const [activeSubTab, setActiveSubTab] = useState<'blocks' | 'typography' | 'styles' | 'content'>('blocks');

  // Configurations
  const [customerConfig, setCustomerConfig] = useState<ReceiptTemplateConfig>(DEFAULT_RECEIPT_TEMPLATE_CONFIG);
  const [kitchenConfig, setKitchenConfig] = useState<KitchenTicketTemplateConfig>(DEFAULT_KITCHEN_TICKET_TEMPLATE_CONFIG);

  const [hasChanges, setHasChanges] = useState<boolean>(false);
  const [isPrintingTest, setIsPrintingTest] = useState<boolean>(false);

  // Charger les configurations enregistrées au montage
  useEffect(() => {
    const loadedCustomer = printerService.getTemplateConfig();
    const loadedKitchen = printerService.getKitchenTemplateConfig();
    setCustomerConfig(loadedCustomer);
    setKitchenConfig(loadedKitchen);
  }, []);

  // Mise à jour de la configuration Client
  const updateCustomerField = <K extends keyof ReceiptTemplateConfig>(key: K, value: ReceiptTemplateConfig[K]) => {
    setCustomerConfig(prev => {
      const next = { ...prev, [key]: value };
      setHasChanges(true);
      return next;
    });
  };

  // Mise à jour de la configuration Cuisine
  const updateKitchenField = <K extends keyof KitchenTicketTemplateConfig>(key: K, value: KitchenTicketTemplateConfig[K]) => {
    setKitchenConfig(prev => {
      const next = { ...prev, [key]: value };
      setHasChanges(true);
      return next;
    });
  };

  // Déplacement des blocs pour le ticket Client
  const moveCustomerBlock = (index: number, direction: 'up' | 'down') => {
    const currentOrder = customerConfig.blockOrder && customerConfig.blockOrder.length > 0
      ? [...customerConfig.blockOrder]
      : [...DEFAULT_CUSTOMER_RECEIPT_BLOCK_ORDER];

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= currentOrder.length) return;

    const temp = currentOrder[index];
    currentOrder[index] = currentOrder[targetIndex];
    currentOrder[targetIndex] = temp;

    updateCustomerField('blockOrder', currentOrder);
  };

  // Déplacement des blocs pour le bon Cuisine
  const moveKitchenBlock = (index: number, direction: 'up' | 'down') => {
    const currentOrder = kitchenConfig.blockOrder && kitchenConfig.blockOrder.length > 0
      ? [...kitchenConfig.blockOrder]
      : [...DEFAULT_KITCHEN_TICKET_BLOCK_ORDER];

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= currentOrder.length) return;

    const temp = currentOrder[index];
    currentOrder[index] = currentOrder[targetIndex];
    currentOrder[targetIndex] = temp;

    updateKitchenField('blockOrder', currentOrder);
  };

  // Sauvegarde globale des 2 modèles
  const handleSaveAll = () => {
    printerService.saveTemplateConfig(customerConfig);
    printerService.saveKitchenTemplateConfig(kitchenConfig);
    setHasChanges(false);
    onShowToast('تم حفظ تخصيص تيكيت الزبون وبون الطباخ بنجاح ! Les modèles de tickets ont été enregistrés.', 'success');
  };

  // Réinitialisation de l'onglet actif
  const handleResetActive = () => {
    if (activeTab === 'customer') {
      const def = printerService.resetTemplateConfig();
      setCustomerConfig(def);
      onShowToast('تمت استعادة الإعدادات الافتراضية لتيكيت الزبون.', 'info');
    } else {
      const def = printerService.resetKitchenTemplateConfig();
      setKitchenConfig(def);
      onShowToast('تمت استعادة الإعدادات الافتراضية لبون الطباخ.', 'info');
    }
    setHasChanges(false);
  };

  // Données de démonstration réalistes pour la prévisualisation du ticket Client
  const demoReceiptData: ReceiptPrintData = {
    receiptNumber: 'TK-20261025-042',
    dailyOrderNumber: 42,
    dateTime: new Date().toLocaleDateString('fr-DZ') + ' ' + new Date().toLocaleTimeString('fr-DZ', { hour: '2-digit', minute: '2-digit' }),
    cashierName: 'Ami Youcef (Caisse 1)',
    orderType: 'SUR_PLACE',
    storeName: 'Aquadro Gourmet Pizzeria',
    storeNameFr: 'Aquadro Gourmet Pizzeria',
    storeAddress: customerConfig.customAddress || '14 Rue Didouche Mourad, Alger',
    storePhone: customerConfig.customPhone || '0550 12 34 56',
    customerName: 'Karim Benali',
    customerPhone: '0661 22 33 44',
    customerAddress: 'Hydra, Cité des Pins N° 12',
    items: [
      {
        name: 'Pizza Carnivore',
        variant: 'Grande 33cm',
        quantity: 1,
        unitPrice: 1200,
        total: 1350,
        supplements: [
          { id: '1', name_fr: 'Extra Mozzarella', price: 150 }
        ],
        notes: 'Bien cuite et croustillante'
      },
      {
        name: 'Coca-Cola 33cl',
        quantity: 2,
        unitPrice: 120,
        total: 240
      }
    ],
    subtotal: 1590,
    deliveryFee: 0,
    discountTotal: 90,
    taxAmount: 0,
    totalTTC: 1500,
    grandTotal: 1500,
    paymentMethod: 'CASH',
    tenderedAmount: 2000,
    changeGiven: 500,
    paperWidth: customerConfig.paperWidth
  };

  // Données de démonstration pour le bon Cuisine
  const demoKitchenData: ReceiptPrintData = {
    receiptNumber: 'TK-20261025-042',
    dailyOrderNumber: 42,
    dateTime: new Date().toLocaleDateString('fr-DZ') + ' ' + new Date().toLocaleTimeString('fr-DZ', { hour: '2-digit', minute: '2-digit' }),
    cashierName: 'Ami Youcef (Serveur)',
    orderType: 'SUR_PLACE',
    storeName: 'Aquadro Gourmet Pizzeria',
    storeNameFr: 'Aquadro Gourmet Pizzeria',
    customerName: 'Karim Benali',
    customerPhone: '0661 22 33 44',
    customerAddress: 'Hydra, Cité des Pins N° 12',
    items: [
      {
        name: 'Pizza Reine',
        variant: 'Grande 33cm',
        quantity: 2,
        unitPrice: 900,
        total: 1800,
        supplements: [
          { id: '1', name_fr: 'Fromage de Chèvre', price: 150 },
          { id: '2', name_fr: 'Champignons', price: 100 }
        ],
        notes: 'Bien cuite'
      },
      {
        name: 'Pizza 4 Saisons (Moitié-Moitié)',
        variant: 'Mega 40cm',
        quantity: 1,
        unitPrice: 1300,
        total: 1300,
        multiParts: {
          type: '2_PARTS',
          parts: [
            { name: 'Moitié Margherita (Sauce Tomate, Mozzarella)', price: 650 },
            { name: 'Moitié Carnivore (Viande Hachée, Merguez)', price: 650 }
          ]
        },
        notes: 'Couper en 8 parts égales'
      }
    ],
    notes: 'Client pressé - Préparer en priorité SVP',
    paperWidth: kitchenConfig.paperWidth
  };

  // Impression de test selon l'onglet actif
  const handleTestPrint = async () => {
    setIsPrintingTest(true);
    try {
      if (activeTab === 'customer') {
        printerService.saveTemplateConfig(customerConfig);
        await printerService.printReceipt(demoReceiptData, true);
        onShowToast('تم إرسال تيكيت الزبون التجريبي إلى الطابعة.', 'info');
      } else {
        printerService.saveKitchenTemplateConfig(kitchenConfig);
        await printerService.printKitchenTicket(demoKitchenData, true);
        onShowToast('تم إرسال بون الطباخ التجريبي إلى الطابعة.', 'info');
      }
    } catch (err: any) {
      onShowToast(`Erreur d'impression : ${err?.message || err}`, 'error');
    } finally {
      setIsPrintingTest(false);
    }
  };

  // Composant Contrôle de Taille de Police Granulaire
  const FontSizeControl: React.FC<{
    labelAr: string;
    labelFr: string;
    value: number;
    min: number;
    max: number;
    step?: number;
    onChange: (val: number) => void;
  }> = ({ labelAr, labelFr, value, min, max, step = 1, onChange }) => (
    <div className="p-3.5 bg-stone-50/80 hover:bg-orange-50/40 rounded-xl border border-stone-200/90 transition-colors">
      <div className="flex items-center justify-between mb-2">
        <div>
          <span className="text-xs font-bold text-stone-800 block">{labelAr}</span>
          <span className="text-[10px] text-stone-500 font-medium">{labelFr}</span>
        </div>
        <div className="flex items-center gap-1.5 bg-white border border-[#E9DCCB] px-2 py-0.5 rounded-lg shadow-2xs">
          <span className="text-xs font-mono font-black text-[#E87524]">{value}</span>
          <span className="text-[10px] text-stone-400 font-sans">px</span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - step))}
          disabled={value <= min}
          className="w-7 h-7 rounded-lg bg-white border border-stone-300 hover:bg-stone-100 flex items-center justify-center text-stone-600 disabled:opacity-40 cursor-pointer shadow-2xs transition-transform active:scale-95"
          title="تصغير الخط"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="flex-1 accent-[#E87524] cursor-pointer h-1.5 bg-stone-200 rounded-lg"
        />
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + step))}
          disabled={value >= max}
          className="w-7 h-7 rounded-lg bg-white border border-stone-300 hover:bg-stone-100 flex items-center justify-center text-stone-600 disabled:opacity-40 cursor-pointer shadow-2xs transition-transform active:scale-95"
          title="تكبير الخط"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      {/* ========================================================================= */}
      {/* 1. BARRE DE TITRE & ACTIONS GLOBALES                                      */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-2xl border border-[#E9DCCB] p-5 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#FFF3EB] to-[#FFE2CC] border border-[#E87524]/30 text-[#E87524] flex items-center justify-center shrink-0 shadow-xs">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-[#292522] flex items-center gap-2">
                <span>محرر وتخصيص التيكيت وبون الطباخ المتقدم</span>
                <span className="bg-[#FFF3EB] text-[#E87524] text-[10px] font-black px-2.5 py-0.5 rounded-full border border-[#E87524]/20 shadow-2xs">
                  Pro Designer
                </span>
              </h2>
              <p className="text-xs text-stone-500 mt-0.5">
                تحكم كامل في موضع كل قسم (ترتيب)، تكبير وتصغير أحجام الخطوط، والأنماط لكل من تيكيت الزبون وبون الطباخ
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <button
            type="button"
            onClick={handleResetActive}
            className="px-3.5 py-2 rounded-xl bg-white hover:bg-stone-50 border border-stone-200 text-stone-700 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
            title="استرجاع الشكل الافتراضي لهذا التيكيت"
          >
            <RotateCcw className="w-3.5 h-3.5 text-stone-500" />
            <span>إعادة ضبط الافتراضي</span>
          </button>

          <button
            type="button"
            onClick={handleTestPrint}
            disabled={isPrintingTest}
            className="px-4 py-2 rounded-xl bg-stone-800 hover:bg-black text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
            title="طباعة تجريبية على الطابعة الحرارية"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>{isPrintingTest ? 'جاري الإرسال...' : activeTab === 'customer' ? 'طباعة تجربة (زبون)' : 'طباعة تجربة (طباخ)'}</span>
          </button>

          <button
            type="button"
            onClick={handleSaveAll}
            className={`px-5 py-2 rounded-xl text-white text-xs font-black transition-all flex items-center gap-2 cursor-pointer shadow-sm ${
              hasChanges
                ? 'bg-emerald-600 hover:bg-emerald-700 ring-3 ring-emerald-500/30 animate-pulse'
                : 'bg-[#E87524] hover:bg-[#D46317]'
            }`}
          >
            <Check className="w-4 h-4" />
            <span>حفظ كل التغييرات</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. SÉLECTEUR D'ONGLET PRINCIPAL (TICKET CLIENT VS BON CUISINE)            */}
      {/* ========================================================================= */}
      <div className="bg-[#FFF8EF] p-2 rounded-2xl border border-[#E9DCCB] flex flex-col sm:flex-row items-center justify-between gap-3 shadow-2xs">
        <div className="grid grid-cols-2 gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setActiveTab('customer')}
            className={`px-5 py-2.5 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'customer'
                ? 'bg-white text-[#292522] shadow-sm border border-[#E9DCCB] ring-2 ring-[#E87524]/20'
                : 'text-stone-600 hover:text-stone-900 hover:bg-white/50'
            }`}
          >
            <Receipt className={`w-4 h-4 ${activeTab === 'customer' ? 'text-[#E87524]' : 'text-stone-400'}`} />
            <span>🧾 تيكيت الزبون (Ticket Client)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('kitchen')}
            className={`px-5 py-2.5 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'kitchen'
                ? 'bg-white text-[#292522] shadow-sm border border-[#E9DCCB] ring-2 ring-[#E87524]/20'
                : 'text-stone-600 hover:text-stone-900 hover:bg-white/50'
            }`}
          >
            <ChefHat className={`w-4 h-4 ${activeTab === 'kitchen' ? 'text-[#E87524]' : 'text-stone-400'}`} />
            <span>👨‍🍳 تيكيت الطباخ (Bon Cuisine • Pizzaiolo)</span>
          </button>
        </div>

        {/* Sous-onglets de configuration */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
          {[
            { id: 'blocks', labelAr: 'مواضع وترتيب الأقسام', icon: MoveVertical },
            { id: 'typography', labelAr: 'أحجام الخطوط', icon: Type },
            { id: 'styles', labelAr: 'المظهر والأنماط', icon: Palette },
            { id: 'content', labelAr: 'المحتوى والنصوص', icon: FileText }
          ].map(sub => {
            const Icon = sub.icon;
            const isSubActive = activeSubTab === sub.id;
            return (
              <button
                key={sub.id}
                type="button"
                onClick={() => setActiveSubTab(sub.id as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  isSubActive
                    ? 'bg-[#E87524] text-white shadow-2xs'
                    : 'bg-white/70 hover:bg-white text-stone-600 border border-[#E9DCCB]/60'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{sub.labelAr}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. GRILLE DE TRAVAIL (OPTIONS À GAUCHE / LIVE PREVIEW À DROITE)           */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ========================================================================= */}
        {/* COLONNE GAUCHE : PANNEAUX DE PERSONNALISATION (7 COLS)                     */}
        {/* ========================================================================= */}
        <div className="lg:col-span-7 space-y-5">
          {/* ----------------------------------------------------------------------- */}
          {/* SOUS-PANNEAU A : REORDONNANCEMENT DES BLOCS (CHANGEMENT DE POSITION)    */}
          {/* ----------------------------------------------------------------------- */}
          {activeSubTab === 'blocks' && (
            <div className="bg-white rounded-2xl border border-[#E9DCCB] p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-[#E9DCCB]/60 pb-3">
                <div className="flex items-center gap-2">
                  <MoveVertical className="w-4 h-4 text-[#E87524]" />
                  <h3 className="font-bold text-[#292522] text-sm">
                    {activeTab === 'customer'
                      ? 'ترتيب ومواضع أقسام تيكيت الزبون (Disposition des Blocs)'
                      : 'ترتيب ومواضع أقسام بون الطباخ (Disposition des Blocs Cuisine)'}
                  </h3>
                </div>
                <span className="text-[11px] text-stone-500 font-medium">
                  استخدم الأسهم ⬆ ⬇ لتغيير موضع أي قسم في الورقة
                </span>
              </div>

              <div className="space-y-2.5">
                {activeTab === 'customer' ? (
                  // Blocs Client
                  (customerConfig.blockOrder && customerConfig.blockOrder.length > 0
                    ? customerConfig.blockOrder
                    : DEFAULT_CUSTOMER_RECEIPT_BLOCK_ORDER
                  ).map((blockId, index, arr) => {
                    const meta = CUSTOMER_BLOCK_META[blockId] || { titleAr: blockId, titleFr: blockId, desc: '' };
                    return (
                      <div
                        key={blockId}
                        className="p-3.5 bg-stone-50/70 hover:bg-orange-50/40 rounded-xl border border-stone-200 flex items-center justify-between gap-3 transition-colors shadow-2xs"
                      >
                        <div className="flex items-center gap-3">
                          <span className="w-7 h-7 rounded-lg bg-[#FFF3EB] border border-[#E87524]/30 text-[#E87524] text-xs font-black flex items-center justify-center shrink-0">
                            #{index + 1}
                          </span>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-stone-800">{meta.titleAr}</span>
                              <span className="text-[10px] text-stone-400 font-medium">({meta.titleFr})</span>
                            </div>
                            <p className="text-[10px] text-stone-500 mt-0.5">{meta.desc}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => moveCustomerBlock(index, 'up')}
                            disabled={index === 0}
                            className="p-1.5 rounded-lg bg-white border border-stone-300 hover:bg-stone-100 text-stone-600 disabled:opacity-30 cursor-pointer shadow-2xs transition-all"
                            title="تقديم للأعلى"
                          >
                            <ArrowUp className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveCustomerBlock(index, 'down')}
                            disabled={index === arr.length - 1}
                            className="p-1.5 rounded-lg bg-white border border-stone-300 hover:bg-stone-100 text-stone-600 disabled:opacity-30 cursor-pointer shadow-2xs transition-all"
                            title="تنزيل للأسفل"
                          >
                            <ArrowDown className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  // Blocs Cuisine
                  (kitchenConfig.blockOrder && kitchenConfig.blockOrder.length > 0
                    ? kitchenConfig.blockOrder
                    : DEFAULT_KITCHEN_TICKET_BLOCK_ORDER
                  ).map((blockId, index, arr) => {
                    const meta = KITCHEN_BLOCK_META[blockId] || { titleAr: blockId, titleFr: blockId, desc: '' };
                    return (
                      <div
                        key={blockId}
                        className="p-3.5 bg-stone-50/70 hover:bg-orange-50/40 rounded-xl border border-stone-200 flex items-center justify-between gap-3 transition-colors shadow-2xs"
                      >
                        <div className="flex items-center gap-3">
                          <span className="w-7 h-7 rounded-lg bg-[#FFF3EB] border border-[#E87524]/30 text-[#E87524] text-xs font-black flex items-center justify-center shrink-0">
                            #{index + 1}
                          </span>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-stone-800">{meta.titleAr}</span>
                              <span className="text-[10px] text-stone-400 font-medium">({meta.titleFr})</span>
                            </div>
                            <p className="text-[10px] text-stone-500 mt-0.5">{meta.desc}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => moveKitchenBlock(index, 'up')}
                            disabled={index === 0}
                            className="p-1.5 rounded-lg bg-white border border-stone-300 hover:bg-stone-100 text-stone-600 disabled:opacity-30 cursor-pointer shadow-2xs transition-all"
                            title="تقديم للأعلى"
                          >
                            <ArrowUp className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveKitchenBlock(index, 'down')}
                            disabled={index === arr.length - 1}
                            className="p-1.5 rounded-lg bg-white border border-stone-300 hover:bg-stone-100 text-stone-600 disabled:opacity-30 cursor-pointer shadow-2xs transition-all"
                            title="تنزيل للأسفل"
                          >
                            <ArrowDown className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* ----------------------------------------------------------------------- */}
          {/* SOUS-PANNEAU B : TYPOGRAPHIE & TAILLES DE POLICES GRANULAIRES           */}
          {/* ----------------------------------------------------------------------- */}
          {activeSubTab === 'typography' && (
            <div className="bg-white rounded-2xl border border-[#E9DCCB] p-5 shadow-xs space-y-5">
              <div className="flex items-center justify-between border-b border-[#E9DCCB]/60 pb-3">
                <div className="flex items-center gap-2">
                  <Type className="w-4 h-4 text-[#E87524]" />
                  <h3 className="font-bold text-[#292522] text-sm">
                    {activeTab === 'customer'
                      ? 'التحكم الدقيق في أحجام خطوط تيكيت الزبون'
                      : 'التحكم الدقيق في أحجام خطوط بون الطباخ'}
                  </h3>
                </div>
                <span className="text-[11px] text-stone-500 font-medium">
                  المعاينة الحية على اليمين تتحدث فوراً عند تغيير أي قيمة
                </span>
              </div>

              {activeTab === 'customer' ? (
                // Typographie Client
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <FontSizeControl
                    labelAr="حجم الخط الأساسي للتيكيت"
                    labelFr="Taille de Police Générale"
                    value={customerConfig.baseFontSize || 11}
                    min={9}
                    max={15}
                    onChange={v => updateCustomerField('baseFontSize', v)}
                  />

                  <FontSizeControl
                    labelAr="حجم خط عنوان المحل الرئيسي"
                    labelFr="Titre d'En-tête (Nom de Marque)"
                    value={customerConfig.headerTitleFontSize || 19}
                    min={13}
                    max={28}
                    onChange={v => updateCustomerField('headerTitleFontSize', v)}
                  />

                  <FontSizeControl
                    labelAr="حجم خط رقم الطلب (#42)"
                    labelFr="Numéro de Commande"
                    value={customerConfig.orderNumberFontSize || 20}
                    min={14}
                    max={34}
                    onChange={v => updateCustomerField('orderNumberFontSize', v)}
                  />

                  <FontSizeControl
                    labelAr="حجم خط أسماء البيتزا والوجبات"
                    labelFr="Noms des Pizzas & Articles"
                    value={customerConfig.itemTitleFontSize || 11}
                    min={9}
                    max={18}
                    onChange={v => updateCustomerField('itemTitleFontSize', v)}
                  />

                  <FontSizeControl
                    labelAr="حجم خط المجموع الإجمالي النهائي"
                    labelFr="Grand Total Net à Payer"
                    value={customerConfig.totalPriceFontSize || 14}
                    min={11}
                    max={24}
                    onChange={v => updateCustomerField('totalPriceFontSize', v)}
                  />

                  <FontSizeControl
                    labelAr="حجم خط الإضافات وملاحظات الطبخ"
                    labelFr="Suppléments & Notes d'articles"
                    value={customerConfig.notesFontSize || 9.5}
                    min={8}
                    max={14}
                    onChange={v => updateCustomerField('notesFontSize', v)}
                  />

                  <div className="sm:col-span-2">
                    <FontSizeControl
                      labelAr="حجم خط تذييل التيكيت وعبارات الشكر"
                      labelFr="Pied de Ticket & Messages"
                      value={customerConfig.footerFontSize || 9.5}
                      min={8}
                      max={14}
                      onChange={v => updateCustomerField('footerFontSize', v)}
                    />
                  </div>
                </div>
              ) : (
                // Typographie Cuisine (Spécifique pour distance de lecture du Chef)
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <FontSizeControl
                    labelAr="حجم خط رقم الطلب للطباخ (بارز جداً)"
                    labelFr="N° Commande Cuisine (Lecture à distance)"
                    value={kitchenConfig.orderNumberFontSize || 24}
                    min={18}
                    max={40}
                    onChange={v => updateKitchenField('orderNumberFontSize', v)}
                  />

                  <FontSizeControl
                    labelAr="حجم خط الكمية (مثال: 2x, 3x)"
                    labelFr="Taille des Quantités (2x, 3x)"
                    value={kitchenConfig.itemQuantityFontSize || 16}
                    min={12}
                    max={30}
                    onChange={v => updateKitchenField('itemQuantityFontSize', v)}
                  />

                  <FontSizeControl
                    labelAr="حجم خط أسماء البيتزا للطهي"
                    labelFr="Nom des Pizzas pour le Pizzaiolo"
                    value={kitchenConfig.itemTitleFontSize || 13.5}
                    min={11}
                    max={22}
                    onChange={v => updateKitchenField('itemTitleFontSize', v)}
                  />

                  <FontSizeControl
                    labelAr="حجم خط نوع الطلب (صالة / سفري / توصيل)"
                    labelFr="Type de Commande (SUR PLACE / EMPORTER)"
                    value={kitchenConfig.orderTypeFontSize || 12}
                    min={10}
                    max={20}
                    onChange={v => updateKitchenField('orderTypeFontSize', v)}
                  />

                  <FontSizeControl
                    labelAr="حجم خط الإضافات المطلوب وضعها"
                    labelFr="Suppléments à Ajouter (+ AJOUTER)"
                    value={kitchenConfig.supplementsFontSize || 10.5}
                    min={9}
                    max={18}
                    onChange={v => updateKitchenField('supplementsFontSize', v)}
                  />

                  <FontSizeControl
                    labelAr="حجم خط تعليمات وملاحظات الطبخ"
                    labelFr="Notes de Cuisson (* NOTE : Bien cuite)"
                    value={kitchenConfig.cookingNotesFontSize || 9.5}
                    min={8}
                    max={16}
                    onChange={v => updateKitchenField('cookingNotesFontSize', v)}
                  />

                  <FontSizeControl
                    labelAr="حجم خط عنوان بون المطبخ"
                    labelFr="Titre d'En-tête Bon Cuisine"
                    value={kitchenConfig.headerTitleFontSize || 10}
                    min={8}
                    max={16}
                    onChange={v => updateKitchenField('headerTitleFontSize', v)}
                  />

                  <FontSizeControl
                    labelAr="حجم خط معلومات الوقت والنادل"
                    labelFr="Heure de Commande & Serveur"
                    value={kitchenConfig.serviceInfoFontSize || 9.5}
                    min={8}
                    max={14}
                    onChange={v => updateKitchenField('serviceInfoFontSize', v)}
                  />
                </div>
              )}

              {/* Toggles texte gras (Bold) */}
              <div className="pt-3 border-t border-stone-200">
                <span className="text-xs font-bold text-stone-700 block mb-2">تغميق الخطوط (Gras / Bold) :</span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {activeTab === 'customer' ? (
                    <>
                      <label className="flex items-center justify-between p-3 bg-stone-50 hover:bg-orange-50/40 rounded-xl border border-stone-200 cursor-pointer">
                        <span className="text-xs font-bold text-stone-700">أسماء المواد بالخط العريض</span>
                        <input
                          type="checkbox"
                          checked={customerConfig.boldItemNames}
                          onChange={e => updateCustomerField('boldItemNames', e.target.checked)}
                          className="w-4 h-4 accent-[#E87524] rounded cursor-pointer"
                        />
                      </label>

                      <label className="flex items-center justify-between p-3 bg-stone-50 hover:bg-orange-50/40 rounded-xl border border-stone-200 cursor-pointer">
                        <span className="text-xs font-bold text-stone-700">رقم الطلب بالخط العريض</span>
                        <input
                          type="checkbox"
                          checked={customerConfig.boldOrderNumber}
                          onChange={e => updateCustomerField('boldOrderNumber', e.target.checked)}
                          className="w-4 h-4 accent-[#E87524] rounded cursor-pointer"
                        />
                      </label>

                      <label className="flex items-center justify-between p-3 bg-stone-50 hover:bg-orange-50/40 rounded-xl border border-stone-200 cursor-pointer">
                        <span className="text-xs font-bold text-stone-700">المجاميع بالخط العريض</span>
                        <input
                          type="checkbox"
                          checked={customerConfig.boldTotals}
                          onChange={e => updateCustomerField('boldTotals', e.target.checked)}
                          className="w-4 h-4 accent-[#E87524] rounded cursor-pointer"
                        />
                      </label>
                    </>
                  ) : (
                    <>
                      <label className="flex items-center justify-between p-3 bg-stone-50 hover:bg-orange-50/40 rounded-xl border border-stone-200 cursor-pointer">
                        <span className="text-xs font-bold text-stone-700">الكميات بالخط العريض (2x)</span>
                        <input
                          type="checkbox"
                          checked={kitchenConfig.boldQuantities}
                          onChange={e => updateKitchenField('boldQuantities', e.target.checked)}
                          className="w-4 h-4 accent-[#E87524] rounded cursor-pointer"
                        />
                      </label>

                      <label className="flex items-center justify-between p-3 bg-stone-50 hover:bg-orange-50/40 rounded-xl border border-stone-200 cursor-pointer">
                        <span className="text-xs font-bold text-stone-700">أسماء البيتزا بالخط العريض</span>
                        <input
                          type="checkbox"
                          checked={kitchenConfig.boldItemNames}
                          onChange={e => updateKitchenField('boldItemNames', e.target.checked)}
                          className="w-4 h-4 accent-[#E87524] rounded cursor-pointer"
                        />
                      </label>

                      <label className="flex items-center justify-between p-3 bg-stone-50 hover:bg-orange-50/40 rounded-xl border border-stone-200 cursor-pointer">
                        <span className="text-xs font-bold text-stone-700">حروف كبيرة (MAJUSCULE)</span>
                        <input
                          type="checkbox"
                          checked={kitchenConfig.uppercaseItemNames}
                          onChange={e => updateKitchenField('uppercaseItemNames', e.target.checked)}
                          className="w-4 h-4 accent-[#E87524] rounded cursor-pointer"
                        />
                      </label>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ----------------------------------------------------------------------- */}
          {/* SOUS-PANNEAU C : STYLES VISUELS, BANNIERES & SÉPARATEURS                */}
          {/* ----------------------------------------------------------------------- */}
          {activeSubTab === 'styles' && (
            <div className="bg-white rounded-2xl border border-[#E9DCCB] p-5 shadow-xs space-y-5">
              <div className="flex items-center justify-between border-b border-[#E9DCCB]/60 pb-3">
                <div className="flex items-center gap-2">
                  <Palette className="w-4 h-4 text-[#E87524]" />
                  <h3 className="font-bold text-[#292522] text-sm">
                    {activeTab === 'customer'
                      ? 'الأنماط والمظهر البصري لتيكيت الزبون'
                      : 'الأنماط والمظهر البصري لبون الطباخ'}
                  </h3>
                </div>
              </div>

              {activeTab === 'customer' ? (
                // Styles Client
                <div className="space-y-4">
                  {/* Style du numéro de commande */}
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1.5">شكل إبراز رقم الطلب</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: 'bordered', label: 'إطار كلاسيكي (Encadré)' },
                        { id: 'banner', label: 'بانر أسود عريض (Bannière)' },
                        { id: 'clean', label: 'بسيط بخطين (Épuré)' }
                      ].map(st => (
                        <button
                          key={st.id}
                          type="button"
                          onClick={() => updateCustomerField('orderNumberStyle', st.id as any)}
                          className={`p-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                            customerConfig.orderNumberStyle === st.id
                              ? 'bg-[#FFF3EB] border-[#E87524] text-[#E87524] shadow-2xs'
                              : 'bg-stone-50 border-stone-200 text-stone-600 hover:bg-stone-100'
                          }`}
                        >
                          {st.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Style de séparateur des articles */}
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1.5">شكل خط الفاصل بين الوجبات</label>
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { id: 'dashed', label: 'متقطع (- - -)' },
                        { id: 'solid', label: 'متصل (———)' },
                        { id: 'dotted', label: 'منقط (• • •)' },
                        { id: 'none', label: 'بدون فاصل' }
                      ].map(sep => (
                        <button
                          key={sep.id}
                          type="button"
                          onClick={() => updateCustomerField('itemsSeparatorStyle', sep.id as any)}
                          className={`p-2 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                            customerConfig.itemsSeparatorStyle === sep.id
                              ? 'bg-[#FFF3EB] border-[#E87524] text-[#E87524] shadow-2xs'
                              : 'bg-stone-50 border-stone-200 text-stone-600 hover:bg-stone-100'
                          }`}
                        >
                          {sep.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Alignement de l'en-tête et du pied */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                    <div>
                      <label className="block text-xs font-bold text-stone-700 mb-1.5">محاذاة رأس التيكيت</label>
                      <div className="grid grid-cols-3 gap-1.5">
                        {[
                          { id: 'right', label: 'يمين', icon: AlignRight },
                          { id: 'center', label: 'وسط', icon: AlignCenter },
                          { id: 'left', label: 'يسار', icon: AlignLeft }
                        ].map(al => {
                          const Icon = al.icon;
                          return (
                            <button
                              key={al.id}
                              type="button"
                              onClick={() => updateCustomerField('headerAlignment', al.id as any)}
                              className={`py-2 px-1 rounded-xl border text-xs font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                                customerConfig.headerAlignment === al.id
                                  ? 'bg-[#FFF3EB] border-[#E87524] text-[#E87524]'
                                  : 'bg-stone-50 border-stone-200 text-stone-600'
                              }`}
                            >
                              <Icon className="w-3.5 h-3.5" />
                              <span>{al.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-stone-700 mb-1.5">محاذاة تذييل التيكيت والشكر</label>
                      <div className="grid grid-cols-3 gap-1.5">
                        {[
                          { id: 'right', label: 'يمين', icon: AlignRight },
                          { id: 'center', label: 'وسط', icon: AlignCenter },
                          { id: 'left', label: 'يسار', icon: AlignLeft }
                        ].map(al => {
                          const Icon = al.icon;
                          return (
                            <button
                              key={al.id}
                              type="button"
                              onClick={() => updateCustomerField('footerAlignment', al.id as any)}
                              className={`py-2 px-1 rounded-xl border text-xs font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                                customerConfig.footerAlignment === al.id
                                  ? 'bg-[#FFF3EB] border-[#E87524] text-[#E87524]'
                                  : 'bg-stone-50 border-stone-200 text-stone-600'
                              }`}
                            >
                              <Icon className="w-3.5 h-3.5" />
                              <span>{al.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Largeur du papier */}
                  <div className="pt-2 border-t border-stone-100">
                    <label className="block text-xs font-bold text-stone-700 mb-1.5">عرض الورق الحراري</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => updateCustomerField('paperWidth', '80mm')}
                        className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                          customerConfig.paperWidth === '80mm'
                            ? 'bg-[#FFF3EB] border-[#E87524] text-[#E87524] shadow-2xs'
                            : 'bg-white border-stone-200 text-stone-600'
                        }`}
                      >
                        80 mm (ورق عريض قياسي)
                      </button>
                      <button
                        type="button"
                        onClick={() => updateCustomerField('paperWidth', '58mm')}
                        className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                          customerConfig.paperWidth === '58mm'
                            ? 'bg-[#FFF3EB] border-[#E87524] text-[#E87524] shadow-2xs'
                            : 'bg-white border-stone-200 text-stone-600'
                        }`}
                      >
                        58 mm (ورق مضغوط صغير)
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                // Styles Cuisine
                <div className="space-y-4">
                  {/* Style d'affichage de la quantité pour le Chef */}
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1.5">طريقة إبراز كمية الطلب للطباخ</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: 'large_text', label: 'نص ضخم وواضح (2x)' },
                        { id: 'badge', label: 'شارة محاطة بإطار [ 2x ]' },
                        { id: 'compact', label: 'حجم عادي مدمج' }
                      ].map(qst => (
                        <button
                          key={qst.id}
                          type="button"
                          onClick={() => updateKitchenField('itemQuantityStyle', qst.id as any)}
                          className={`p-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                            kitchenConfig.itemQuantityStyle === qst.id
                              ? 'bg-[#FFF3EB] border-[#E87524] text-[#E87524] shadow-2xs'
                              : 'bg-stone-50 border-stone-200 text-stone-600 hover:bg-stone-100'
                          }`}
                        >
                          {qst.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Style d'affichage des suppléments pour le Chef */}
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1.5">طريقة إبراز الإضافات المطلوبة (+ AJOUTER)</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: 'boxed', label: 'إطار منقط واضح (Encadré)' },
                        { id: 'underline', label: 'تحته خط عريض (Souligné)' },
                        { id: 'bold_only', label: 'خط غليظ فقط (Gras seul)' }
                      ].map(sh => (
                        <button
                          key={sh.id}
                          type="button"
                          onClick={() => updateKitchenField('supplementsHighlight', sh.id as any)}
                          className={`p-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                            kitchenConfig.supplementsHighlight === sh.id
                              ? 'bg-[#FFF3EB] border-[#E87524] text-[#E87524] shadow-2xs'
                              : 'bg-stone-50 border-stone-200 text-stone-600 hover:bg-stone-100'
                          }`}
                        >
                          {sh.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Style d'affichage des notes de cuisson */}
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1.5">طريقة إبراز ملاحظات الطهي والزبون (* NOTE)</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: 'boxed', label: 'صندوق مميز بخلفية (Encadré)' },
                        { id: 'colored_badge', label: 'شارة رمادية واضحة' },
                        { id: 'italic', label: 'مائل وعريض (Italique)' }
                      ].map(nh => (
                        <button
                          key={nh.id}
                          type="button"
                          onClick={() => updateKitchenField('notesHighlight', nh.id as any)}
                          className={`p-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                            kitchenConfig.notesHighlight === nh.id
                              ? 'bg-[#FFF3EB] border-[#E87524] text-[#E87524] shadow-2xs'
                              : 'bg-stone-50 border-stone-200 text-stone-600 hover:bg-stone-100'
                          }`}
                        >
                          {nh.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Style du séparateur entre articles */}
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1.5">خط الفاصل بين طلبات الطبخ</label>
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { id: 'solid', label: 'خط عريض متصل' },
                        { id: 'dashed', label: 'خط متقطع' },
                        { id: 'double', label: 'خط مزدوج' },
                        { id: 'none', label: 'بدون خط' }
                      ].map(sep => (
                        <button
                          key={sep.id}
                          type="button"
                          onClick={() => updateKitchenField('itemSeparatorStyle', sep.id as any)}
                          className={`p-2 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                            kitchenConfig.itemSeparatorStyle === sep.id
                              ? 'bg-[#FFF3EB] border-[#E87524] text-[#E87524] shadow-2xs'
                              : 'bg-stone-50 border-stone-200 text-stone-600 hover:bg-stone-100'
                          }`}
                        >
                          {sep.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Espacement de coupe en bas */}
                  <div className="pt-2 border-t border-stone-100 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-stone-700 block">فراغ القص في أسفل البون</span>
                      <span className="text-[10px] text-stone-400">أسطر إضافية فارغة لتسهيل تعليق الورقة في المطبخ</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4].map(lines => (
                        <button
                          key={lines}
                          type="button"
                          onClick={() => updateKitchenField('bottomSpacingLines', lines)}
                          className={`w-8 h-8 rounded-lg border text-xs font-bold transition-all cursor-pointer ${
                            kitchenConfig.bottomSpacingLines === lines
                              ? 'bg-[#E87524] text-white border-[#E87524]'
                              : 'bg-stone-50 border-stone-200 text-stone-600'
                          }`}
                        >
                          {lines}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ----------------------------------------------------------------------- */}
          {/* SOUS-PANNEAU D : CONTENU, ELEMENTS & TEXTES PERSONNALISES               */}
          {/* ----------------------------------------------------------------------- */}
          {activeSubTab === 'content' && (
            <div className="bg-white rounded-2xl border border-[#E9DCCB] p-5 shadow-xs space-y-5">
              <div className="flex items-center justify-between border-b border-[#E9DCCB]/60 pb-3">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[#E87524]" />
                  <h3 className="font-bold text-[#292522] text-sm">
                    {activeTab === 'customer'
                      ? 'عناصر العرض والنصوص المخصصة لتيكيت الزبون'
                      : 'عناصر العرض والنصوص المخصصة لبون الطباخ'}
                  </h3>
                </div>
              </div>

              {activeTab === 'customer' ? (
                // Contenu Client
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1">
                      العنوان الرئيسي الكبير في أعلى التيكيت
                    </label>
                    <input
                      type="text"
                      value={customerConfig.headerTitle}
                      onChange={e => updateCustomerField('headerTitle', e.target.value)}
                      placeholder="AQUADRO"
                      className="w-full px-3.5 py-2 bg-[#FFF8EF]/50 border border-[#E9DCCB] rounded-xl text-xs font-bold text-[#292522] focus:ring-2 focus:ring-[#E87524] focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="flex items-center justify-between p-3 bg-stone-50 hover:bg-orange-50/50 rounded-xl border border-stone-200 cursor-pointer">
                      <span className="text-xs font-bold text-stone-700">إظهار شعار المحل (Logo)</span>
                      <input
                        type="checkbox"
                        checked={customerConfig.showLogo}
                        onChange={e => updateCustomerField('showLogo', e.target.checked)}
                        className="w-4 h-4 accent-[#E87524] rounded cursor-pointer"
                      />
                    </label>

                    <label className="flex items-center justify-between p-3 bg-stone-50 hover:bg-orange-50/50 rounded-xl border border-stone-200 cursor-pointer">
                      <span className="text-xs font-bold text-stone-700">إظهار اسم المحل الفرعي</span>
                      <input
                        type="checkbox"
                        checked={customerConfig.showStoreNameFr}
                        onChange={e => updateCustomerField('showStoreNameFr', e.target.checked)}
                        className="w-4 h-4 accent-[#E87524] rounded cursor-pointer"
                      />
                    </label>
                  </div>

                  {/* Téléphone & Adresse */}
                  <div className="space-y-2 pt-2 border-t border-stone-100">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-stone-700 flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-stone-500" />
                        <span>رقم الهاتف المطبوع على التيكيت</span>
                      </label>
                      <input
                        type="checkbox"
                        checked={customerConfig.showPhone}
                        onChange={e => updateCustomerField('showPhone', e.target.checked)}
                        className="w-4 h-4 accent-[#E87524] rounded cursor-pointer"
                      />
                    </div>
                    {customerConfig.showPhone && (
                      <input
                        type="text"
                        value={customerConfig.customPhone}
                        onChange={e => updateCustomerField('customPhone', e.target.value)}
                        placeholder="الهاتف (اتركه فارغاً لاستخدام هاتف الإعدادات)"
                        className="w-full px-3 py-1.5 bg-[#FFF8EF]/50 border border-[#E9DCCB] rounded-xl text-xs text-stone-800 focus:outline-none"
                      />
                    )}
                  </div>

                  <div className="space-y-2 pt-2 border-t border-stone-100">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-stone-700 flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-stone-500" />
                        <span>عنوان المطعم / البيتزيريا</span>
                      </label>
                      <input
                        type="checkbox"
                        checked={customerConfig.showAddress}
                        onChange={e => updateCustomerField('showAddress', e.target.checked)}
                        className="w-4 h-4 accent-[#E87524] rounded cursor-pointer"
                      />
                    </div>
                    {customerConfig.showAddress && (
                      <input
                        type="text"
                        value={customerConfig.customAddress}
                        onChange={e => updateCustomerField('customAddress', e.target.value)}
                        placeholder="العنوان (اتركه فارغاً لاستخدام عنوان الإعدادات)"
                        className="w-full px-3 py-1.5 bg-[#FFF8EF]/50 border border-[#E9DCCB] rounded-xl text-xs text-stone-800 focus:outline-none"
                      />
                    )}
                  </div>

                  {/* Réseaux Sociaux & Wi-Fi */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-stone-100">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-stone-700 flex items-center gap-1">
                          <Share2 className="w-3.5 h-3.5 text-stone-500" />
                          <span>انستغرام / فيسبوك</span>
                        </span>
                        <input
                          type="checkbox"
                          checked={customerConfig.showSocials}
                          onChange={e => updateCustomerField('showSocials', e.target.checked)}
                          className="w-4 h-4 accent-[#E87524] rounded cursor-pointer"
                        />
                      </div>
                      {customerConfig.showSocials && (
                        <input
                          type="text"
                          value={customerConfig.socialsText}
                          onChange={e => updateCustomerField('socialsText', e.target.value)}
                          placeholder="@aquadro_pizza"
                          className="w-full px-3 py-1.5 bg-[#FFF8EF]/50 border border-[#E9DCCB] rounded-xl text-xs text-stone-800 focus:outline-none"
                        />
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-stone-700 flex items-center gap-1">
                          <Wifi className="w-3.5 h-3.5 text-stone-500" />
                          <span>واي فاي الزبائن (Wi-Fi)</span>
                        </span>
                        <input
                          type="checkbox"
                          checked={customerConfig.showWifi}
                          onChange={e => updateCustomerField('showWifi', e.target.checked)}
                          className="w-4 h-4 accent-[#E87524] rounded cursor-pointer"
                        />
                      </div>
                      {customerConfig.showWifi && (
                        <input
                          type="text"
                          value={customerConfig.wifiText}
                          onChange={e => updateCustomerField('wifiText', e.target.value)}
                          placeholder="Wi-Fi: Aquadro-Client"
                          className="w-full px-3 py-1.5 bg-[#FFF8EF]/50 border border-[#E9DCCB] rounded-xl text-xs text-stone-800 focus:outline-none"
                        />
                      )}
                    </div>
                  </div>

                  {/* Lignes de Remerciements en Bas */}
                  <div className="space-y-3 pt-3 border-t border-stone-200">
                    <span className="text-xs font-bold text-stone-700 block">رسائل الشكر في أسفل التيكيت :</span>
                    <div>
                      <label className="block text-[11px] text-stone-500 mb-1">السطر الأول</label>
                      <input
                        type="text"
                        value={customerConfig.footerLine1}
                        onChange={e => updateCustomerField('footerLine1', e.target.value)}
                        placeholder="Merci pour votre visite !"
                        className="w-full px-3 py-1.5 bg-[#FFF8EF]/50 border border-[#E9DCCB] rounded-xl text-xs font-bold text-[#292522] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-stone-500 mb-1">السطر الثاني</label>
                      <input
                        type="text"
                        value={customerConfig.footerLine2}
                        onChange={e => updateCustomerField('footerLine2', e.target.value)}
                        placeholder="À bientôt • Aquadro POS"
                        className="w-full px-3 py-1.5 bg-[#FFF8EF]/50 border border-[#E9DCCB] rounded-xl text-xs text-[#292522] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-stone-500 mb-1">السطر الثالث (اختياري / بالعربية)</label>
                      <input
                        type="text"
                        value={customerConfig.footerLine3}
                        onChange={e => updateCustomerField('footerLine3', e.target.value)}
                        placeholder="صحة وهنا - زورونا مجدداً"
                        className="w-full px-3 py-1.5 bg-[#FFF8EF]/50 border border-[#E9DCCB] rounded-xl text-xs text-[#292522] focus:outline-none"
                        dir="rtl"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                // Contenu Cuisine
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1">
                      عنوان شارة بون المطبخ
                    </label>
                    <input
                      type="text"
                      value={kitchenConfig.headerTitle}
                      onChange={e => updateKitchenField('headerTitle', e.target.value)}
                      placeholder="BON DE CUISINE • PIZZAIOLO"
                      className="w-full px-3.5 py-2 bg-[#FFF8EF]/50 border border-[#E9DCCB] rounded-xl text-xs font-bold text-[#292522] focus:ring-2 focus:ring-[#E87524] focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="flex items-center justify-between p-3 bg-stone-50 hover:bg-orange-50/50 rounded-xl border border-stone-200 cursor-pointer">
                      <div>
                        <span className="text-xs font-bold text-stone-700 block">إظهار عنوان بون المطبخ</span>
                        <span className="text-[10px] text-stone-400">BON DE CUISINE في الأعلى</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={kitchenConfig.showTicketTitle}
                        onChange={e => updateKitchenField('showTicketTitle', e.target.checked)}
                        className="w-4 h-4 accent-[#E87524] rounded cursor-pointer"
                      />
                    </label>

                    <label className="flex items-center justify-between p-3 bg-stone-50 hover:bg-orange-50/50 rounded-xl border border-stone-200 cursor-pointer">
                      <div>
                        <span className="text-xs font-bold text-stone-700 block">رقم الطلب الكبير</span>
                        <span className="text-[10px] text-stone-400">COMMANDE N° 42</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={kitchenConfig.showOrderNumber}
                        onChange={e => updateKitchenField('showOrderNumber', e.target.checked)}
                        className="w-4 h-4 accent-[#E87524] rounded cursor-pointer"
                      />
                    </label>

                    <label className="flex items-center justify-between p-3 bg-stone-50 hover:bg-orange-50/50 rounded-xl border border-stone-200 cursor-pointer">
                      <div>
                        <span className="text-xs font-bold text-stone-700 block">نوع الطلب البارز</span>
                        <span className="text-[10px] text-stone-400">طاولة / سفري / توصيل</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={kitchenConfig.showOrderType}
                        onChange={e => updateKitchenField('showOrderType', e.target.checked)}
                        className="w-4 h-4 accent-[#E87524] rounded cursor-pointer"
                      />
                    </label>

                    <label className="flex items-center justify-between p-3 bg-stone-50 hover:bg-orange-50/50 rounded-xl border border-stone-200 cursor-pointer">
                      <div>
                        <span className="text-xs font-bold text-stone-700 block">توقيت إرسال الطلب</span>
                        <span className="text-[10px] text-stone-400">ساعة الطلب للمطبخ</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={kitchenConfig.showDateTime}
                        onChange={e => updateKitchenField('showDateTime', e.target.checked)}
                        className="w-4 h-4 accent-[#E87524] rounded cursor-pointer"
                      />
                    </label>

                    <label className="flex items-center justify-between p-3 bg-stone-50 hover:bg-orange-50/50 rounded-xl border border-stone-200 cursor-pointer">
                      <div>
                        <span className="text-xs font-bold text-stone-700 block">اسم النادل / الكاشير</span>
                        <span className="text-[10px] text-stone-400">Serveur : Ami Youcef</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={kitchenConfig.showCashierOrServer}
                        onChange={e => updateKitchenField('showCashierOrServer', e.target.checked)}
                        className="w-4 h-4 accent-[#E87524] rounded cursor-pointer"
                      />
                    </label>

                    <label className="flex items-center justify-between p-3 bg-stone-50 hover:bg-orange-50/50 rounded-xl border border-stone-200 cursor-pointer">
                      <div>
                        <span className="text-xs font-bold text-stone-700 block">تفصيل بيتزا نصفين (Moitié)</span>
                        <span className="text-[10px] text-stone-400">توضيح أذواق ومكونات كل نصف</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={kitchenConfig.showMultiPartPizzas}
                        onChange={e => updateKitchenField('showMultiPartPizzas', e.target.checked)}
                        className="w-4 h-4 accent-[#E87524] rounded cursor-pointer"
                      />
                    </label>

                    <label className="flex items-center justify-between p-3 bg-stone-50 hover:bg-orange-50/50 rounded-xl border border-stone-200 cursor-pointer">
                      <div>
                        <span className="text-xs font-bold text-stone-700 block">إظهار الإضافات المطلوبة</span>
                        <span className="text-[10px] text-stone-400">+ AJOUTER : Fromage, ...</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={kitchenConfig.showSupplements}
                        onChange={e => updateKitchenField('showSupplements', e.target.checked)}
                        className="w-4 h-4 accent-[#E87524] rounded cursor-pointer"
                      />
                    </label>

                    <label className="flex items-center justify-between p-3 bg-stone-50 hover:bg-orange-50/50 rounded-xl border border-stone-200 cursor-pointer">
                      <div>
                        <span className="text-xs font-bold text-stone-700 block">ملاحظات وتعليمات الطبخ</span>
                        <span className="text-[10px] text-stone-400">* NOTE : Bien cuite...</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={kitchenConfig.showCookingNotes}
                        onChange={e => updateKitchenField('showCookingNotes', e.target.checked)}
                        className="w-4 h-4 accent-[#E87524] rounded cursor-pointer"
                      />
                    </label>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* COLONNE DROITE : PREVIEW EN DIRECT SUR VRAI PAPIER THERMIQUE (5 COLS)     */}
        {/* ========================================================================= */}
        <div className="lg:col-span-5 sticky top-4 space-y-3">
          <div className="bg-white rounded-3xl border border-[#E9DCCB] overflow-hidden shadow-xl">
            {/* Barre de statut du preview */}
            <div className="px-4 py-3 bg-[#FFF8EF] border-b border-[#E9DCCB] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-[#E87524]" />
                <span className="font-black text-xs text-[#292522]">
                  {activeTab === 'customer'
                    ? 'معاينة فورية لتيكيت الزبون'
                    : 'معاينة فورية لبون الطباخ'}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono font-bold bg-[#E87524] text-white px-2 py-0.5 rounded-lg shadow-2xs">
                  {activeTab === 'customer' ? customerConfig.paperWidth : kitchenConfig.paperWidth}
                </span>
                <span className="text-[10px] font-bold text-stone-500 bg-white border border-[#E9DCCB] px-2 py-0.5 rounded-lg">
                  حراري
                </span>
              </div>
            </div>

            {/* Zone papier avec ombre réaliste */}
            <div className="p-5 bg-stone-200/80 min-h-[500px] max-h-[78vh] overflow-y-auto flex justify-center items-start">
              <div
                className={`bg-white border border-stone-300 shadow-2xl p-4 transition-all duration-200 relative ${
                  (activeTab === 'customer' ? customerConfig.paperWidth : kitchenConfig.paperWidth) === '58mm'
                    ? 'w-[230px] min-w-[220px]'
                    : 'w-[310px] min-w-[300px]'
                }`}
                style={{
                  boxShadow: '0 12px 28px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.1)'
                }}
              >
                {/* Effet dents de coupe de ticket en haut */}
                <div className="absolute -top-1.5 left-0 right-0 h-1.5 flex justify-between overflow-hidden opacity-30">
                  {Array.from({ length: 30 }).map((_, i) => (
                    <div key={i} className="w-2 h-2 bg-stone-400 rotate-45 transform -translate-y-1"></div>
                  ))}
                </div>

                {/* Rendu HTML dynamique généré en direct selon l'onglet actif et les configs en cours */}
                <div
                  dangerouslySetInnerHTML={{
                    __html: activeTab === 'customer'
                      ? printerService.generateReceiptHtml(demoReceiptData, customerConfig)
                      : printerService.generateKitchenTicketHtml(demoKitchenData, kitchenConfig)
                  }}
                />

                {/* Effet dents de coupe de ticket en bas */}
                <div className="absolute -bottom-1.5 left-0 right-0 h-1.5 flex justify-between overflow-hidden opacity-30">
                  {Array.from({ length: 30 }).map((_, i) => (
                    <div key={i} className="w-2 h-2 bg-stone-400 rotate-45 transform translate-y-1"></div>
                  ))}
                </div>
              </div>
            </div>

            {/* Pied du preview avec bouton enregistrer rapide */}
            <div className="p-3 bg-stone-50 border-t border-[#E9DCCB] flex items-center justify-between gap-2">
              <span className="text-[11px] text-stone-500 font-medium">
                {hasChanges ? '⚠️ لديك تعديلات غير محفوظة' : '✓ النماذج متزامنة ومحفوظة'}
              </span>
              <button
                type="button"
                onClick={handleSaveAll}
                className="px-4 py-1.5 rounded-xl bg-[#E87524] hover:bg-[#D46317] text-white font-bold text-xs transition-colors cursor-pointer shadow-xs"
              >
                حفظ التغييرات
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
