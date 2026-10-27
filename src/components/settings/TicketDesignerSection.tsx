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
  EyeOff,
  CreditCard,
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
  Plus,
  Trash2,
  PlusCircle
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
  const [activeSubTab, setActiveSubTab] = useState<'dimensions' | 'content' | 'styles' | 'typography' | 'blocks'>('dimensions');

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

  // Application des modèles préconçus (Quick Presets)
  const applyPreset = (preset: 'gourmet' | 'compact' | 'fiscal') => {
    if (preset === 'gourmet') {
      setCustomerConfig(prev => ({
        ...prev,
        paperWidth: '80mm',
        paddingX: 6,
        lineHeight: 'normal',
        orderNumberStyle: 'banner',
        totalStyle: 'banner_dark',
        itemsSeparatorStyle: 'dashed',
        showLogo: true,
        logoHeight: 58,
        showStoreNameAr: true,
        headerSubtitle: 'Pizzeria & Fast-Food Gourmet',
        headerWelcomeMessage: 'أهلاً وسهلاً بكم • Bienvenue chez nous',
        showQrCode: true,
        qrCodeType: 'menu_url',
        qrCustomText: 'Scannez pour notre Menu',
        showSubtotal: true,
        showTableNumber: true,
        footerLine1: 'Merci pour votre visite !',
        footerLine2: 'À bientôt • Aquadro POS',
        footerLine3: 'صحة وهنا - زورونا مجدداً'
      }));
      setHasChanges(true);
      onShowToast('تم تطبيق قالب المطاعم الفاخر 80مم (Gourmet Deluxe).', 'success');
    } else if (preset === 'compact') {
      setCustomerConfig(prev => ({
        ...prev,
        paperWidth: '58mm',
        paddingX: 2,
        lineHeight: 'compact',
        baseFontSize: 10,
        headerTitleFontSize: 16,
        orderNumberFontSize: 18,
        itemTitleFontSize: 10,
        totalPriceFontSize: 13,
        orderNumberStyle: 'bordered',
        totalStyle: 'double_bordered',
        itemsSeparatorStyle: 'solid',
        showLogo: false,
        feedTopLines: 0,
        feedBottomLines: 1,
        showQrCode: false,
        showSubtotal: false
      }));
      setHasChanges(true);
      onShowToast('تم تطبيق القالب الاقتصادي المضغوط 58مم (Éco Compact).', 'info');
    } else if (preset === 'fiscal') {
      setCustomerConfig(prev => ({
        ...prev,
        paperWidth: '80mm',
        paddingX: 4,
        lineHeight: 'normal',
        orderNumberStyle: 'banner',
        totalStyle: 'banner_dark',
        itemsSeparatorStyle: 'double',
        showFiscalInfo: true,
        customRc: '16/00-1234567B22',
        customNif: '002216012345678',
        customNis: '002216012345',
        customAi: '16223344556',
        showSubtotal: true,
        showTax: true,
        taxLabel: 'TVA (19%)',
        footerPolicy: 'Facture / Reçu délivré conformément aux normes commerciales algériennes.'
      }));
      setHasChanges(true);
      onShowToast('تم تطبيق القالب المفصل والجبائي 80مم (Fiscal & Détaillé).', 'success');
    }
  };

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

  // Toggle visibility of a customer block (show/hide)
  const toggleCustomerBlockVisibility = (blockId: CustomerReceiptBlock) => {
    const currentHidden = new Set(customerConfig.hiddenBlocks || []);
    if (currentHidden.has(blockId)) {
      currentHidden.delete(blockId);
      onShowToast(`تم تفعيل إظهار قسم: ${CUSTOMER_BLOCK_META[blockId]?.titleAr || blockId}`, 'success');
    } else {
      currentHidden.add(blockId);
      onShowToast(`تم إخفاء قسم: ${CUSTOMER_BLOCK_META[blockId]?.titleAr || blockId}`, 'info');
    }
    updateCustomerField('hiddenBlocks', Array.from(currentHidden));
  };

  // Remove a block completely from Customer ticket
  const removeCustomerBlock = (blockId: CustomerReceiptBlock) => {
    const currentOrder = customerConfig.blockOrder && customerConfig.blockOrder.length > 0
      ? customerConfig.blockOrder.filter(b => b !== blockId)
      : DEFAULT_CUSTOMER_RECEIPT_BLOCK_ORDER.filter(b => b !== blockId);
    const currentHidden = new Set(customerConfig.hiddenBlocks || []);
    currentHidden.add(blockId);
    setCustomerConfig(prev => ({
      ...prev,
      blockOrder: currentOrder,
      hiddenBlocks: Array.from(currentHidden)
    }));
    setHasChanges(true);
    onShowToast(`تم حذف قسم "${CUSTOMER_BLOCK_META[blockId]?.titleAr || blockId}" من التيكيت. يمكنك إعادته في أي وقت.`, 'warning');
  };

  // Add a deleted block back to Customer ticket
  const addCustomerBlock = (blockId: CustomerReceiptBlock) => {
    const currentOrder = customerConfig.blockOrder && customerConfig.blockOrder.length > 0
      ? [...customerConfig.blockOrder]
      : [...DEFAULT_CUSTOMER_RECEIPT_BLOCK_ORDER];
    if (!currentOrder.includes(blockId)) {
      currentOrder.push(blockId);
    }
    const currentHidden = new Set(customerConfig.hiddenBlocks || []);
    currentHidden.delete(blockId);
    setCustomerConfig(prev => ({
      ...prev,
      blockOrder: currentOrder,
      hiddenBlocks: Array.from(currentHidden)
    }));
    setHasChanges(true);
    onShowToast(`تمت إضافة قسم "${CUSTOMER_BLOCK_META[blockId]?.titleAr || blockId}" إلى التيكيت بنجاح !`, 'success');
  };

  // Reset Customer blocks order
  const resetCustomerBlocks = () => {
    setCustomerConfig(prev => ({
      ...prev,
      blockOrder: [...DEFAULT_CUSTOMER_RECEIPT_BLOCK_ORDER],
      hiddenBlocks: []
    }));
    setHasChanges(true);
    onShowToast('تمت استعادة الترتيب الافتراضي لجميع أقسام تيكيت الزبون.', 'info');
  };

  // Kitchen block helpers
  const toggleKitchenBlockVisibility = (blockId: KitchenTicketBlock) => {
    const currentHidden = new Set(kitchenConfig.hiddenBlocks || []);
    if (currentHidden.has(blockId)) {
      currentHidden.delete(blockId);
      onShowToast(`تم تفعيل إظهار قسم: ${KITCHEN_BLOCK_META[blockId]?.titleAr || blockId}`, 'success');
    } else {
      currentHidden.add(blockId);
      onShowToast(`تم إخفاء قسم: ${KITCHEN_BLOCK_META[blockId]?.titleAr || blockId}`, 'info');
    }
    updateKitchenField('hiddenBlocks', Array.from(currentHidden));
  };

  const removeKitchenBlock = (blockId: KitchenTicketBlock) => {
    const currentOrder = kitchenConfig.blockOrder && kitchenConfig.blockOrder.length > 0
      ? kitchenConfig.blockOrder.filter(b => b !== blockId)
      : DEFAULT_KITCHEN_TICKET_BLOCK_ORDER.filter(b => b !== blockId);
    const currentHidden = new Set(kitchenConfig.hiddenBlocks || []);
    currentHidden.add(blockId);
    setKitchenConfig(prev => ({
      ...prev,
      blockOrder: currentOrder,
      hiddenBlocks: Array.from(currentHidden)
    }));
    setHasChanges(true);
    onShowToast(`تم حذف قسم "${KITCHEN_BLOCK_META[blockId]?.titleAr || blockId}" من بون المطبخ.`, 'warning');
  };

  const addKitchenBlock = (blockId: KitchenTicketBlock) => {
    const currentOrder = kitchenConfig.blockOrder && kitchenConfig.blockOrder.length > 0
      ? [...kitchenConfig.blockOrder]
      : [...DEFAULT_KITCHEN_TICKET_BLOCK_ORDER];
    if (!currentOrder.includes(blockId)) {
      currentOrder.push(blockId);
    }
    const currentHidden = new Set(kitchenConfig.hiddenBlocks || []);
    currentHidden.delete(blockId);
    setKitchenConfig(prev => ({
      ...prev,
      blockOrder: currentOrder,
      hiddenBlocks: Array.from(currentHidden)
    }));
    setHasChanges(true);
    onShowToast(`تمت إضافة قسم "${KITCHEN_BLOCK_META[blockId]?.titleAr || blockId}" إلى بون المطبخ بنجاح !`, 'success');
  };

  const resetKitchenBlocks = () => {
    setKitchenConfig(prev => ({
      ...prev,
      blockOrder: [...DEFAULT_KITCHEN_TICKET_BLOCK_ORDER],
      hiddenBlocks: []
    }));
    setHasChanges(true);
    onShowToast('تمت استعادة الترتيب الافتراضي لجميع أقسام بون المطبخ.', 'info');
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
    tableNumber: 'Table 04',
    orderType: 'SUR_PLACE',
    storeName: customerConfig.headerTitle || 'Aquadro Gourmet Pizzeria',
    storeNameFr: customerConfig.headerTitle || 'Aquadro Gourmet Pizzeria',
    storeNameAr: customerConfig.customStoreNameAr || 'مطعم وبيتزيريا أكوادرو',
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
    deliveryFee: customerConfig.showDeliveryFee ? 150 : 0,
    discountTotal: 90,
    taxAmount: customerConfig.showTax ? 285 : 0,
    totalTTC: customerConfig.showDeliveryFee ? 1650 : 1500,
    grandTotal: customerConfig.showDeliveryFee ? 1650 : 1500,
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
            className={`px-5 py-2 rounded-xl text-white text-xs font-black transition-all flex items-center gap-2 cursor-pointer shadow-sm ${hasChanges
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
            className={`px-5 py-2.5 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 cursor-pointer ${activeTab === 'customer'
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
            className={`px-5 py-2.5 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 cursor-pointer ${activeTab === 'kitchen'
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
            { id: 'dimensions', labelAr: 'الأبعاد والهوامش والقوالب', icon: Maximize2 },
            { id: 'content', labelAr: 'المحتوى والنصوص وهوية المحل', icon: FileText },
            { id: 'styles', labelAr: 'المظهر والأنماط والأطر', icon: Palette },
            { id: 'typography', labelAr: 'أحجام الخطوط والتغميق', icon: Type },
            { id: 'blocks', labelAr: 'مواضع وترتيب الأقسام', icon: MoveVertical }
          ].map(sub => {
            const Icon = sub.icon;
            const isSubActive = activeSubTab === sub.id;
            return (
              <button
                key={sub.id}
                type="button"
                onClick={() => setActiveSubTab(sub.id as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${isSubActive
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
          {/* SOUS-PANNEAU : DIMENSIONS, MARGES & GABARITS (DIMENSIONS & PRESETS)     */}
          {/* ----------------------------------------------------------------------- */}
          {activeSubTab === 'dimensions' && (
            <div className="bg-white rounded-2xl border border-[#E9DCCB] p-5 shadow-xs space-y-6">
              <div className="flex items-center justify-between border-b border-[#E9DCCB]/60 pb-3">
                <div className="flex items-center gap-2">
                  <Maximize2 className="w-4 h-4 text-[#E87524]" />
                  <h3 className="font-bold text-[#292522] text-sm">
                    {activeTab === 'customer'
                      ? 'أبعاد الورق، الهوامش، فراغ القص والقوالب الجاهزة'
                      : 'أبعاد ورق بون الطبخ وفراغ القص'}
                  </h3>
                </div>
                <span className="text-[11px] text-stone-500 font-medium">
                  تحكم مطلق في مقاسات الفاتورة وتدفق الورق الحراري
                </span>
              </div>

              {activeTab === 'customer' && (
                // Gabarits prêts à l'emploi (Presets)
                <div className="space-y-2.5">
                  <span className="text-xs font-bold text-stone-700 block flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-[#E87524]" />
                    <span>نماذج وقوالب جاهزة بضغطة زر واحدة (Gabarits Prédéfinis) :</span>
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <button
                      type="button"
                      onClick={() => applyPreset('gourmet')}
                      className="p-3 bg-gradient-to-br from-[#FFF8EF] to-[#FFEEDB] hover:from-[#FFEEDB] hover:to-[#FFE0C2] border border-[#E87524]/40 rounded-xl text-right transition-all cursor-pointer shadow-2xs group"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-black text-[#292522]">👑 موديل فاخر للمطاعم</span>
                        <span className="text-[9px] bg-[#E87524] text-white px-1.5 py-0.5 rounded font-mono font-bold">80mm</span>
                      </div>
                      <p className="text-[10px] text-stone-600 line-clamp-2 leading-relaxed">
                        لوغو كبير، اسم بالعربية، بانر أسود للإجمالي ورقم الطلب، ورمز QR للمنيو
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => applyPreset('compact')}
                      className="p-3 bg-stone-50 hover:bg-stone-100 border border-stone-200 rounded-xl text-right transition-all cursor-pointer shadow-2xs group"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-black text-stone-800">⚡ موديل اقتصادي ومضغوط</span>
                        <span className="text-[9px] bg-stone-700 text-white px-1.5 py-0.5 rounded font-mono font-bold">58mm</span>
                      </div>
                      <p className="text-[10px] text-stone-500 line-clamp-2 leading-relaxed">
                        توفير أقصى للورق، خطوط مدمجة 10px، بدون فراغات زائدة مناسب للبائعين السريعين
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => applyPreset('fiscal')}
                      className="p-3 bg-emerald-50/60 hover:bg-emerald-100/50 border border-emerald-300 rounded-xl text-right transition-all cursor-pointer shadow-2xs group"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-black text-emerald-900">📑 موديل مفصل وجبائي</span>
                        <span className="text-[9px] bg-emerald-700 text-white px-1.5 py-0.5 rounded font-mono font-bold">80mm</span>
                      </div>
                      <p className="text-[10px] text-emerald-700 line-clamp-2 leading-relaxed">
                        إظهار السجل التجاري RC، NIF، NIS، المادة، تفصيل المجاميع الفرعية والضريبة
                      </p>
                    </button>
                  </div>
                </div>
              )}

              {/* Largeur du papier */}
              <div className="space-y-2 pt-2 border-t border-stone-100">
                <label className="block text-xs font-bold text-stone-700">عرض بكرة الورق الحراري (Largeur du Rouleau)</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (activeTab === 'customer') updateCustomerField('paperWidth', '80mm');
                      else updateKitchenField('paperWidth', '80mm');
                    }}
                    className={`py-3 px-4 rounded-xl border text-xs font-bold flex items-center justify-between transition-all cursor-pointer ${(activeTab === 'customer' ? customerConfig.paperWidth : kitchenConfig.paperWidth) === '80mm'
                        ? 'bg-[#FFF3EB] border-[#E87524] text-[#E87524] shadow-2xs ring-2 ring-[#E87524]/20'
                        : 'bg-white border-stone-200 text-stone-700 hover:bg-stone-50'
                      }`}
                  >
                    <div>
                      <span className="block font-black text-sm">80 mm (ورق عريض قياسي)</span>
                      <span className="text-[10px] text-stone-500">الطابعات القياسية EPSON, Xprinter 80</span>
                    </div>
                    <span className="text-xs font-mono font-bold">~44 حرف/سطر</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (activeTab === 'customer') updateCustomerField('paperWidth', '58mm');
                      else updateKitchenField('paperWidth', '58mm');
                    }}
                    className={`py-3 px-4 rounded-xl border text-xs font-bold flex items-center justify-between transition-all cursor-pointer ${(activeTab === 'customer' ? customerConfig.paperWidth : kitchenConfig.paperWidth) === '58mm'
                        ? 'bg-[#FFF3EB] border-[#E87524] text-[#E87524] shadow-2xs ring-2 ring-[#E87524]/20'
                        : 'bg-white border-stone-200 text-stone-700 hover:bg-stone-50'
                      }`}
                  >
                    <div>
                      <span className="block font-black text-sm">58 mm (ورق مضغوط صغير)</span>
                      <span className="text-[10px] text-stone-500">طابعات البلوتوث والمحمولة الصغيرة</span>
                    </div>
                    <span className="text-xs font-mono font-bold">~32 حرف/سطر</span>
                  </button>
                </div>
              </div>

              {/* Marges latérales (Padding X) */}
              {activeTab === 'customer' && (
                <div className="space-y-2 pt-2 border-t border-stone-100">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="block text-xs font-bold text-stone-700">الهوامش الجانبية للتيكيت (Marge & Rembourrage Latéral)</label>
                      <span className="text-[10px] text-stone-500">فراغ أمان داخلي يمين ويسار لمنع قص الحروف عند حافة الورقة</span>
                    </div>
                    <div className="flex items-center gap-1 bg-white border border-[#E9DCCB] px-2.5 py-0.5 rounded-lg shadow-2xs">
                      <span className="text-xs font-mono font-black text-[#E87524]">{customerConfig.paddingX ?? 4}</span>
                      <span className="text-[10px] text-stone-400">px</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] text-stone-400 font-bold">0px (بدون هامش)</span>
                    <input
                      type="range"
                      min={0}
                      max={16}
                      step={1}
                      value={customerConfig.paddingX ?? 4}
                      onChange={e => updateCustomerField('paddingX', Number(e.target.value))}
                      className="flex-1 accent-[#E87524] cursor-pointer h-2 bg-stone-200 rounded-lg"
                    />
                    <span className="text-[10px] text-stone-400 font-bold">16px (هامش واسع)</span>
                  </div>
                </div>
              )}

              {/* Densité & Hauteur de ligne (Line-height) */}
              {activeTab === 'customer' && (
                <div className="space-y-2 pt-2 border-t border-stone-100">
                  <label className="block text-xs font-bold text-stone-700">كثافة وتباعد الأسطر (Densité du Texte)</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'compact', titleAr: 'مضغوط (Économique)', desc: 'توفير أقصى للورق' },
                      { id: 'normal', titleAr: 'عادي (Standard)', desc: 'مقروء ومتوازن' },
                      { id: 'relaxed', titleAr: 'مريح (Aéré)', desc: 'فراغات واضحة جداً' }
                    ].map(d => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => updateCustomerField('lineHeight', d.id as any)}
                        className={`p-2.5 rounded-xl border text-right transition-all cursor-pointer ${(customerConfig.lineHeight || 'normal') === d.id
                            ? 'bg-[#FFF3EB] border-[#E87524] text-[#E87524] shadow-2xs'
                            : 'bg-stone-50 border-stone-200 text-stone-700 hover:bg-stone-100'
                          }`}
                      >
                        <span className="text-xs font-bold block">{d.titleAr}</span>
                        <span className="text-[9px] text-stone-400">{d.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Espacements de tête et de pied (Feed Lines) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-stone-100">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">فراغ الورق في أعلى التيكيت (Feed Haut)</label>
                  <span className="text-[10px] text-stone-400 block mb-2">أسطر بيضاء قبل طباعة رأس الفاتورة</span>
                  <div className="flex items-center gap-1.5">
                    {[0, 1, 2, 3].map(lines => (
                      <button
                        key={lines}
                        type="button"
                        onClick={() => updateCustomerField('feedTopLines', lines)}
                        className={`flex-1 py-1.5 rounded-lg border text-xs font-bold transition-all cursor-pointer ${(customerConfig.feedTopLines || 0) === lines
                            ? 'bg-[#E87524] text-white border-[#E87524]'
                            : 'bg-stone-50 border-stone-200 text-stone-600 hover:bg-stone-100'
                          }`}
                      >
                        {lines === 0 ? 'بدون' : `${lines} أسطر`}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">فراغ القص في أسفل التيكيت (Feed Bas / Coupe)</label>
                  <span className="text-[10px] text-stone-400 block mb-2">أسطر بيضاء بعد الفاتورة لضمان خروج التيكيت بالكامل قبل القص</span>
                  <div className="flex items-center gap-1.5">
                    {[1, 2, 3, 4, 5].map(lines => (
                      <button
                        key={lines}
                        type="button"
                        onClick={() => {
                          if (activeTab === 'customer') updateCustomerField('feedBottomLines', lines);
                          else updateKitchenField('bottomSpacingLines', lines);
                        }}
                        className={`flex-1 py-1.5 rounded-lg border text-xs font-bold transition-all cursor-pointer ${(activeTab === 'customer' ? (customerConfig.feedBottomLines ?? 2) : (kitchenConfig.bottomSpacingLines ?? 2)) === lines
                            ? 'bg-[#E87524] text-white border-[#E87524]'
                            : 'bg-stone-50 border-stone-200 text-stone-600 hover:bg-stone-100'
                          }`}
                      >
                        {lines} أسطر
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
          {activeSubTab === 'blocks' && (
            <div className="bg-white rounded-2xl border border-[#E9DCCB] p-5 shadow-xs space-y-6">
              <div className="flex flex-wrap items-center justify-between border-b border-[#E9DCCB]/60 pb-3 gap-2">
                <div className="flex items-center gap-2">
                  <MoveVertical className="w-4 h-4 text-[#E87524]" />
                  <h3 className="font-bold text-[#292522] text-sm">
                    {activeTab === 'customer'
                      ? 'إدارة أقسام تيكيت الزبون (إضافة، حذف وترتيب الأقسام)'
                      : 'إدارة أقسام بون المطبخ (إضافة، حذف وترتيب الأقسام)'}
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={activeTab === 'customer' ? resetCustomerBlocks : resetKitchenBlocks}
                    className="px-2.5 py-1 text-xs font-bold text-stone-600 hover:text-stone-900 bg-stone-100 hover:bg-stone-200 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer"
                    title="استعادة الترتيب وجميع الأقسام الافتراضية"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>استعادة الافتراضي</span>
                  </button>
                </div>
              </div>

              {activeTab === 'customer' ? (
                // Customer Blocks Management
                (() => {
                  const currentBlocks = customerConfig.blockOrder && customerConfig.blockOrder.length > 0
                    ? customerConfig.blockOrder
                    : DEFAULT_CUSTOMER_RECEIPT_BLOCK_ORDER;
                  const hiddenSet = new Set(customerConfig.hiddenBlocks || []);
                  const deletedBlocks = DEFAULT_CUSTOMER_RECEIPT_BLOCK_ORDER.filter(b => !currentBlocks.includes(b));

                  return (
                    <div className="space-y-6">
                      {/* Active Blocks */}
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black text-stone-800 flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                            <span>الأقسام المفعلة في التيكيت (قابلة للحذف والترتيب والإخفاء) :</span>
                          </span>
                          <span className="text-[11px] font-mono font-bold text-stone-400">
                            {currentBlocks.length} قسم في التيكيت
                          </span>
                        </div>

                        {currentBlocks.map((blockId, index) => {
                          const meta = CUSTOMER_BLOCK_META[blockId] || { titleAr: blockId, titleFr: blockId, desc: '' };
                          const isHidden = hiddenSet.has(blockId);

                          return (
                            <div
                              key={blockId}
                              className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 transition-all shadow-2xs ${isHidden
                                  ? 'bg-stone-100/80 border-dashed border-stone-300 opacity-60'
                                  : 'bg-stone-50/80 hover:bg-orange-50/30 border-stone-200'
                                }`}
                            >
                              <div className="flex items-center gap-3">
                                <span className={`w-7 h-7 rounded-lg text-xs font-black flex items-center justify-center shrink-0 border ${isHidden
                                    ? 'bg-stone-200 text-stone-500 border-stone-300'
                                    : 'bg-[#FFF3EB] border-[#E87524]/30 text-[#E87524]'
                                  }`}>
                                  #{index + 1}
                                </span>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-stone-800">{meta.titleAr}</span>
                                    <span className="text-[10px] text-stone-400 font-medium">({meta.titleFr})</span>
                                    {isHidden && (
                                      <span className="text-[9px] bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded font-bold">
                                        مخفي من الطباعة
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[10px] text-stone-500 mt-0.5">{meta.desc}</p>
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                {/* Toggle Visible/Hidden */}
                                <button
                                  type="button"
                                  onClick={() => toggleCustomerBlockVisibility(blockId)}
                                  className={`p-1.5 rounded-lg border flex items-center gap-1 text-xs font-bold cursor-pointer transition-all ${!isHidden
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                                      : 'bg-white text-stone-400 border-stone-300 hover:bg-stone-100'
                                    }`}
                                  title={isHidden ? 'إظهار هذا القسم في التيكيت' : 'إخفاء هذا القسم من التيكيت مؤقتاً'}
                                >
                                  {!isHidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                                  <span className="text-[10px] hidden sm:inline">{!isHidden ? 'ظاهر' : 'مخفي'}</span>
                                </button>

                                {/* Move Up */}
                                <button
                                  type="button"
                                  onClick={() => moveCustomerBlock(index, 'up')}
                                  disabled={index === 0}
                                  className="p-1.5 rounded-lg bg-white border border-stone-300 hover:bg-stone-100 text-stone-600 disabled:opacity-30 cursor-pointer shadow-2xs transition-all"
                                  title="تقديم للأعلى"
                                >
                                  <ArrowUp className="w-4 h-4" />
                                </button>

                                {/* Move Down */}
                                <button
                                  type="button"
                                  onClick={() => moveCustomerBlock(index, 'down')}
                                  disabled={index === currentBlocks.length - 1}
                                  className="p-1.5 rounded-lg bg-white border border-stone-300 hover:bg-stone-100 text-stone-600 disabled:opacity-30 cursor-pointer shadow-2xs transition-all"
                                  title="تنزيل للأسفل"
                                >
                                  <ArrowDown className="w-4 h-4" />
                                </button>

                                {/* Delete / Remove from Ticket */}
                                <button
                                  type="button"
                                  onClick={() => removeCustomerBlock(blockId)}
                                  className="p-1.5 rounded-lg bg-white border border-rose-200 hover:bg-rose-50 text-rose-600 hover:text-rose-700 cursor-pointer shadow-2xs transition-all"
                                  title="حذف هذا القسم بالكامل من التيكيت"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Deleted / Available Blocks to Add */}
                      {deletedBlocks.length > 0 && (
                        <div className="p-4 bg-orange-50/50 rounded-2xl border border-orange-200/80 space-y-3 animate-in fade-in duration-150">
                          <div className="flex items-center justify-between border-b border-orange-200/60 pb-2">
                            <span className="text-xs font-bold text-stone-800 flex items-center gap-1.5">
                              <PlusCircle className="w-4 h-4 text-[#E87524]" />
                              <span>أقسام محذوفة متوفرة للإضافة إلى تيكيت الزبون :</span>
                            </span>
                            <span className="text-[10px] text-stone-500 font-medium">
                              اضغط على زر الإضافة لإعادة أي قسم للتيكيت
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            {deletedBlocks.map(blockId => {
                              const meta = CUSTOMER_BLOCK_META[blockId] || { titleAr: blockId, titleFr: blockId, desc: '' };
                              return (
                                <div
                                  key={blockId}
                                  className="p-3 bg-white rounded-xl border border-orange-200/60 flex items-center justify-between gap-2 shadow-2xs"
                                >
                                  <div>
                                    <div className="text-xs font-bold text-stone-800">{meta.titleAr}</div>
                                    <div className="text-[10px] text-stone-400 font-medium">{meta.titleFr}</div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => addCustomerBlock(blockId)}
                                    className="px-2.5 py-1.5 bg-[#FFF3EB] hover:bg-[#FFE6D4] text-[#E87524] border border-[#E87524]/40 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer transition-all shadow-2xs"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                    <span>إضافة للتيكيت</span>
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()
              ) : (
                // Kitchen Blocks Management
                (() => {
                  const currentBlocks = kitchenConfig.blockOrder && kitchenConfig.blockOrder.length > 0
                    ? kitchenConfig.blockOrder
                    : DEFAULT_KITCHEN_TICKET_BLOCK_ORDER;
                  const hiddenSet = new Set(kitchenConfig.hiddenBlocks || []);
                  const deletedBlocks = DEFAULT_KITCHEN_TICKET_BLOCK_ORDER.filter(b => !currentBlocks.includes(b));

                  return (
                    <div className="space-y-6">
                      {/* Active Kitchen Blocks */}
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black text-stone-800 flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                            <span>أقسام بون المطبخ المفعلة (قابلة للحذف والترتيب والإخفاء) :</span>
                          </span>
                          <span className="text-[11px] font-mono font-bold text-stone-400">
                            {currentBlocks.length} قسم في البون
                          </span>
                        </div>

                        {currentBlocks.map((blockId, index) => {
                          const meta = KITCHEN_BLOCK_META[blockId] || { titleAr: blockId, titleFr: blockId, desc: '' };
                          const isHidden = hiddenSet.has(blockId);

                          return (
                            <div
                              key={blockId}
                              className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 transition-all shadow-2xs ${isHidden
                                  ? 'bg-stone-100/80 border-dashed border-stone-300 opacity-60'
                                  : 'bg-stone-50/80 hover:bg-orange-50/30 border-stone-200'
                                }`}
                            >
                              <div className="flex items-center gap-3">
                                <span className={`w-7 h-7 rounded-lg text-xs font-black flex items-center justify-center shrink-0 border ${isHidden
                                    ? 'bg-stone-200 text-stone-500 border-stone-300'
                                    : 'bg-[#FFF3EB] border-[#E87524]/30 text-[#E87524]'
                                  }`}>
                                  #{index + 1}
                                </span>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-stone-800">{meta.titleAr}</span>
                                    <span className="text-[10px] text-stone-400 font-medium">({meta.titleFr})</span>
                                    {isHidden && (
                                      <span className="text-[9px] bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded font-bold">
                                        مخفي من الطباعة
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[10px] text-stone-500 mt-0.5">{meta.desc}</p>
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                {/* Toggle Visible/Hidden */}
                                <button
                                  type="button"
                                  onClick={() => toggleKitchenBlockVisibility(blockId)}
                                  className={`p-1.5 rounded-lg border flex items-center gap-1 text-xs font-bold cursor-pointer transition-all ${!isHidden
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                                      : 'bg-white text-stone-400 border-stone-300 hover:bg-stone-100'
                                    }`}
                                  title={isHidden ? 'إظهار هذا القسم في بون المطبخ' : 'إخفاء هذا القسم مؤقتاً'}
                                >
                                  {!isHidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                                  <span className="text-[10px] hidden sm:inline">{!isHidden ? 'ظاهر' : 'مخفي'}</span>
                                </button>

                                {/* Move Up */}
                                <button
                                  type="button"
                                  onClick={() => moveKitchenBlock(index, 'up')}
                                  disabled={index === 0}
                                  className="p-1.5 rounded-lg bg-white border border-stone-300 hover:bg-stone-100 text-stone-600 disabled:opacity-30 cursor-pointer shadow-2xs transition-all"
                                  title="تقديم للأعلى"
                                >
                                  <ArrowUp className="w-4 h-4" />
                                </button>

                                {/* Move Down */}
                                <button
                                  type="button"
                                  onClick={() => moveKitchenBlock(index, 'down')}
                                  disabled={index === currentBlocks.length - 1}
                                  className="p-1.5 rounded-lg bg-white border border-stone-300 hover:bg-stone-100 text-stone-600 disabled:opacity-30 cursor-pointer shadow-2xs transition-all"
                                  title="تنزيل للأسفل"
                                >
                                  <ArrowDown className="w-4 h-4" />
                                </button>

                                {/* Delete / Remove from Kitchen Ticket */}
                                <button
                                  type="button"
                                  onClick={() => removeKitchenBlock(blockId)}
                                  className="p-1.5 rounded-lg bg-white border border-rose-200 hover:bg-rose-50 text-rose-600 hover:text-rose-700 cursor-pointer shadow-2xs transition-all"
                                  title="حذف هذا القسم من بون المطبخ"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Deleted / Available Kitchen Blocks */}
                      {deletedBlocks.length > 0 && (
                        <div className="p-4 bg-orange-50/50 rounded-2xl border border-orange-200/80 space-y-3 animate-in fade-in duration-150">
                          <div className="flex items-center justify-between border-b border-orange-200/60 pb-2">
                            <span className="text-xs font-bold text-stone-800 flex items-center gap-1.5">
                              <PlusCircle className="w-4 h-4 text-[#E87524]" />
                              <span>أقسام محذوفة متوفرة للإضافة إلى بون المطبخ :</span>
                            </span>
                            <span className="text-[10px] text-stone-500 font-medium">
                              اضغط على زر الإضافة لإعادة أي قسم للبون
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            {deletedBlocks.map(blockId => {
                              const meta = KITCHEN_BLOCK_META[blockId] || { titleAr: blockId, titleFr: blockId, desc: '' };
                              return (
                                <div
                                  key={blockId}
                                  className="p-3 bg-white rounded-xl border border-orange-200/60 flex items-center justify-between gap-2 shadow-2xs"
                                >
                                  <div>
                                    <div className="text-xs font-bold text-stone-800">{meta.titleAr}</div>
                                    <div className="text-[10px] text-stone-400 font-medium">{meta.titleFr}</div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => addKitchenBlock(blockId)}
                                    className="px-2.5 py-1.5 bg-[#FFF3EB] hover:bg-[#FFE6D4] text-[#E87524] border border-[#E87524]/40 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer transition-all shadow-2xs"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                    <span>إضافة للبون</span>
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()
              )}
            </div>
          )}

          {/* ----------------------------------------------------------------------- */}
          {/* SOUS-PANNEAU B : TYPOGRAPHIE & TAILLES DE POLICES GRANULAIRES           */}
          {/* ----------------------------------------------------------------------- */}
          {activeSubTab === 'typography' && (
            <div className="bg-white rounded-2xl border border-[#E9DCCB] p-5 shadow-xs space-y-6">
              <div className="flex items-center justify-between border-b border-[#E9DCCB]/60 pb-3">
                <div className="flex items-center gap-2">
                  <Type className="w-4 h-4 text-[#E87524]" />
                  <h3 className="font-bold text-[#292522] text-sm">
                    {activeTab === 'customer'
                      ? 'التحكم الدقيق في أحجام خطوط تيكيت الزبون والإضافات'
                      : 'التحكم الدقيق في أحجام خطوط بون الطباخ والإضافات'}
                  </h3>
                </div>
                <span className="text-[11px] text-stone-500 font-medium">
                  المعاينة الحية على اليمين تتحدث فوراً عند تغيير أي قيمة
                </span>
              </div>

              {activeTab === 'customer' ? (
                // Typographie Client
                <div className="space-y-4">
                  {/* قسم خاص وبارز للتحكم في حجم خط الإضافات */}
                  <div className="p-4 bg-gradient-to-br from-[#FFF9F2] to-[#FFF1E3] rounded-2xl border-2 border-[#E87524]/40 space-y-3 shadow-xs">
                    <div className="flex items-center justify-between border-b border-[#E87524]/20 pb-2">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-[#E87524]" />
                        <span className="text-xs font-black text-stone-800">
                          حجم خط الإضافات والزيادات (Taille des Suppléments & Extras) :
                        </span>
                      </div>
                      <span className="text-[10px] bg-[#E87524] text-white px-2 py-0.5 rounded-full font-bold">
                        تعديل فوري للوضوح
                      </span>
                    </div>

                    <FontSizeControl
                      labelAr="تكبير أو تصغير حجم الإضافات على التيكيت"
                      labelFr="Taille de Police des Suppléments (+ AJOUTER)"
                      value={customerConfig.supplementsFontSize || 12}
                      min={8}
                      max={24}
                      step={0.5}
                      onChange={v => updateCustomerField('supplementsFontSize', v)}
                    />

                    {/* Quick Presets for supplements */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#E87524]/20">
                      <span className="text-[11px] font-bold text-stone-700">مقاسات سريعة جاهزة :</span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {[
                          { sz: 9.5, label: 'صغير ومدمج (9.5px)' },
                          { sz: 12, label: 'قياسي مناسب (12px)' },
                          { sz: 14.5, label: 'كبير وواضح جداً (14.5px)' },
                          { sz: 17.5, label: 'بارز وضخم للطباعة (17.5px)' }
                        ].map(p => (
                          <button
                            key={p.sz}
                            type="button"
                            onClick={() => updateCustomerField('supplementsFontSize', p.sz)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer ${(customerConfig.supplementsFontSize || 12) === p.sz
                                ? 'bg-[#E87524] text-white border-[#E87524] shadow-xs'
                                : 'bg-white text-stone-700 border-[#E9DCCB] hover:bg-stone-50'
                              }`}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Autres tailles */}
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
                      labelAr="حجم خط ملاحظات المواد والطبخ"
                      labelFr="Notes & Instructions d'articles"
                      value={customerConfig.notesFontSize || 9.5}
                      min={8}
                      max={16}
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

                  {/* Mise en valeur des suppléments */}
                  <div className="p-3.5 bg-stone-50 rounded-xl border border-stone-200 space-y-2">
                    <label className="text-xs font-bold text-stone-800 block">
                      شكل وتمييز الإضافات على التيكيت (Style d'Affichage des Suppléments) :
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        { id: 'standard', label: 'عادي (نص واضح)', desc: '+ Supplément : Fromage' },
                        { id: 'boxed', label: 'داخل إطار منقط (Encadré)', desc: 'محدد ومحاط بمربع' },
                        { id: 'badge', label: 'شارة بارزة (Badge)', desc: 'إطار صلب ملفت للنظر' },
                        { id: 'underline', label: 'تحته خط (Souligné)', desc: 'خط سفلي تحت الإضافة' }
                      ].map(st => (
                        <button
                          key={st.id}
                          type="button"
                          onClick={() => updateCustomerField('supplementsHighlight', st.id as any)}
                          className={`p-2.5 rounded-xl border text-right transition-all cursor-pointer ${(customerConfig.supplementsHighlight || 'standard') === st.id
                              ? 'bg-[#FFF3EB] border-[#E87524] ring-2 ring-[#E87524]/20'
                              : 'bg-white border-stone-200 hover:bg-stone-50'
                            }`}
                        >
                          <span className="text-xs font-black text-stone-800 block">{st.label}</span>
                          <span className="text-[10px] text-stone-500">{st.desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                // Typographie Cuisine
                <div className="space-y-4">
                  {/* قسم خاص لحجم إضافات الطباخ */}
                  <div className="p-4 bg-gradient-to-br from-[#FFF9F2] to-[#FFF1E3] rounded-2xl border-2 border-[#E87524]/40 space-y-3 shadow-xs">
                    <div className="flex items-center justify-between border-b border-[#E87524]/20 pb-2">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-[#E87524]" />
                        <span className="text-xs font-black text-stone-800">
                          حجم خط الإضافات في بون الطباخ (+ AJOUTER) :
                        </span>
                      </div>
                      <span className="text-[10px] bg-[#E87524] text-white px-2 py-0.5 rounded-full font-bold">
                        رؤية واضحة للطباخ
                      </span>
                    </div>

                    <FontSizeControl
                      labelAr="حجم خط الإضافات المطلوب وضعها في البيتزا"
                      labelFr="Suppléments à Ajouter (+ AJOUTER)"
                      value={kitchenConfig.supplementsFontSize || 12.5}
                      min={9}
                      max={28}
                      step={0.5}
                      onChange={v => updateKitchenField('supplementsFontSize', v)}
                    />

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#E87524]/20">
                      <span className="text-[11px] font-bold text-stone-700">مقاسات سريعة للطاهي :</span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {[
                          { sz: 10.5, label: 'مدمج (10.5px)' },
                          { sz: 12.5, label: 'واضح (12.5px)' },
                          { sz: 16, label: 'كبير (16px)' },
                          { sz: 20, label: 'بارز جداً (20px)' }
                        ].map(p => (
                          <button
                            key={p.sz}
                            type="button"
                            onClick={() => updateKitchenField('supplementsFontSize', p.sz)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer ${(kitchenConfig.supplementsFontSize || 12.5) === p.sz
                                ? 'bg-[#E87524] text-white border-[#E87524] shadow-xs'
                                : 'bg-white text-stone-700 border-[#E9DCCB] hover:bg-stone-50'
                              }`}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

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
                </div>
              )}

              {/* Toggles texte gras (Bold) */}
              <div className="pt-3 border-t border-stone-200">
                <span className="text-xs font-bold text-stone-700 block mb-2">تغميق الخطوط واللون الأسود الداكن (Gras / Bold) :</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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

                      <label className="flex items-center justify-between p-3 bg-amber-50/80 hover:bg-amber-100/60 rounded-xl border border-amber-300 cursor-pointer">
                        <div>
                          <span className="text-xs font-black text-amber-950 block">الإضافات بالخط العريض</span>
                          <span className="text-[9px] text-amber-800">أسود داكن واضح للطباعة</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={customerConfig.boldSupplements !== false}
                          onChange={e => updateCustomerField('boldSupplements', e.target.checked)}
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

                      <label className="flex items-center justify-between p-3 bg-amber-50/80 hover:bg-amber-100/60 rounded-xl border border-amber-300 cursor-pointer">
                        <div>
                          <span className="text-xs font-black text-amber-950 block">الإضافات بالخط العريض</span>
                          <span className="text-[9px] text-amber-800">تسهيل القراءة للطاهي</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={kitchenConfig.boldSupplements !== false}
                          onChange={e => updateKitchenField('boldSupplements', e.target.checked)}
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
                  {/* Style du montant total à payer */}
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1.5">شكل إبراز المجموع الإجمالي النهائي (Total à Payer)</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: 'banner_dark', label: 'بانر أسود فاخر (Bannière Inversée)', desc: 'أعلى وضوح وأناقة حرارية' },
                        { id: 'double_bordered', label: 'إطار مزدوج (Double Ligne ═══)', desc: 'مظهر محاسبي كلاسيكي' },
                        { id: 'standard', label: 'خط عادي متصل (Standard)', desc: 'تصميم بسيط ونظيف' }
                      ].map(tst => (
                        <button
                          key={tst.id}
                          type="button"
                          onClick={() => updateCustomerField('totalStyle', tst.id as any)}
                          className={`p-2.5 rounded-xl border text-right transition-all cursor-pointer ${(customerConfig.totalStyle || 'standard') === tst.id
                              ? 'bg-[#FFF3EB] border-[#E87524] text-[#E87524] shadow-2xs ring-2 ring-[#E87524]/20'
                              : 'bg-stone-50 border-stone-200 text-stone-600 hover:bg-stone-100'
                            }`}
                        >
                          <span className="text-xs font-bold block">{tst.label}</span>
                          <span className="text-[10px] text-stone-400 block mt-0.5">{tst.desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Style du numéro de commande */}
                  <div className="pt-2 border-t border-stone-100">
                    <label className="block text-xs font-bold text-stone-700 mb-1.5">شكل إبراز رقم الطلب (N° de Commande)</label>
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { id: 'banner', label: 'بانر أسود (Bannière)' },
                        { id: 'bordered', label: 'إطار مربع (Encadré)' },
                        { id: 'badge', label: 'شارة بيضاوية (Badge)' },
                        { id: 'clean', label: 'بسيط بخطين (Épuré)' }
                      ].map(st => (
                        <button
                          key={st.id}
                          type="button"
                          onClick={() => updateCustomerField('orderNumberStyle', st.id as any)}
                          className={`p-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${customerConfig.orderNumberStyle === st.id
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
                  <div className="pt-2 border-t border-stone-100">
                    <label className="block text-xs font-bold text-stone-700 mb-1.5">شكل خط الفاصل بين الوجبات (Séparateur)</label>
                    <div className="grid grid-cols-5 gap-2">
                      {[
                        { id: 'dashed', label: 'متقطع (- - -)' },
                        { id: 'solid', label: 'متصل (———)' },
                        { id: 'double', label: 'مزدوج (═══)' },
                        { id: 'dotted', label: 'منقط (• • •)' },
                        { id: 'none', label: 'بدون فاصل' }
                      ].map(sep => (
                        <button
                          key={sep.id}
                          type="button"
                          onClick={() => updateCustomerField('itemsSeparatorStyle', sep.id as any)}
                          className={`p-2 rounded-xl border text-xs font-bold transition-all cursor-pointer ${customerConfig.itemsSeparatorStyle === sep.id
                              ? 'bg-[#FFF3EB] border-[#E87524] text-[#E87524] shadow-2xs'
                              : 'bg-stone-50 border-stone-200 text-stone-600 hover:bg-stone-100'
                            }`}
                        >
                          {sep.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Alignement de l'en-tête, du logo et du pied */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-stone-100">
                    <div>
                      <label className="block text-xs font-bold text-stone-700 mb-1.5">محاذاة الشعار</label>
                      <div className="grid grid-cols-3 gap-1.5">
                        {[
                          { id: 'right', label: 'يمين', icon: AlignRight },
                          { id: 'center', label: 'وسط', icon: AlignCenter },
                          { id: 'left', label: 'يسار', icon: AlignLeft }
                        ].map(al => {
                          const Icon = al.icon;
                          const isSel = (customerConfig.logoAlignment || 'center') === al.id;
                          return (
                            <button
                              key={al.id}
                              type="button"
                              onClick={() => updateCustomerField('logoAlignment', al.id as any)}
                              className={`py-2 px-1 rounded-xl border text-xs font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${isSel
                                  ? 'bg-[#FFF3EB] border-[#E87524] text-[#E87524]'
                                  : 'bg-stone-50 border-stone-200 text-stone-600 hover:bg-stone-100'
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
                              className={`py-2 px-1 rounded-xl border text-xs font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${customerConfig.headerAlignment === al.id
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
                              className={`py-2 px-1 rounded-xl border text-xs font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${customerConfig.footerAlignment === al.id
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
                          className={`p-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${kitchenConfig.itemQuantityStyle === qst.id
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
                          className={`p-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${kitchenConfig.supplementsHighlight === sh.id
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
                          className={`p-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${kitchenConfig.notesHighlight === nh.id
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
                          className={`p-2 rounded-xl border text-xs font-bold transition-all cursor-pointer ${kitchenConfig.itemSeparatorStyle === sep.id
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
                          className={`w-8 h-8 rounded-lg border text-xs font-bold transition-all cursor-pointer ${kitchenConfig.bottomSpacingLines === lines
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
                // Contenu Client Complet et Granulaire
                <div className="space-y-5">
                  {/* ============================================================= */}
                  {/* 1. هوية المتجر ورأس الفاتورة                                */}
                  {/* ============================================================= */}
                  <div className="p-4 bg-stone-50/70 rounded-2xl border border-stone-200/90 space-y-3.5">
                    <div className="flex items-center gap-2 border-b border-stone-200/70 pb-2">
                      <Store className="w-4 h-4 text-[#E87524]" />
                      <h4 className="text-xs font-bold text-stone-800">1. رأس الفاتورة وهوية المتجر (En-tête & Identité Magasin)</h4>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[11px] font-bold text-stone-700">اسم المحل الرئيسي (العنوان الكبير)</label>
                          <label className="flex items-center gap-1 cursor-pointer">
                            <span className="text-[10px] text-stone-500">إظهار</span>
                            <input
                              type="checkbox"
                              checked={customerConfig.showHeaderTitle ?? true}
                              onChange={e => updateCustomerField('showHeaderTitle', e.target.checked)}
                              className="w-3.5 h-3.5 accent-[#E87524] rounded cursor-pointer"
                              title="إظهار/إخفاء اسم المحل الرئيسي من التيكيت"
                            />
                          </label>
                        </div>
                        <input
                          type="text"
                          disabled={customerConfig.showHeaderTitle === false}
                          value={customerConfig.headerTitle}
                          onChange={e => updateCustomerField('headerTitle', e.target.value)}
                          placeholder="AQUADRO"
                          className="w-full px-3 py-1.5 bg-white border border-[#E9DCCB] rounded-xl text-xs font-black text-[#292522] focus:ring-2 focus:ring-[#E87524] focus:outline-none disabled:opacity-40 disabled:bg-stone-100"
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[11px] font-bold text-stone-700">العنوان الفرعي / التخصص (Sous-titre)</label>
                          <label className="flex items-center gap-1 cursor-pointer">
                            <span className="text-[10px] text-stone-500">إظهار</span>
                            <input
                              type="checkbox"
                              checked={customerConfig.showHeaderSubtitle ?? true}
                              onChange={e => updateCustomerField('showHeaderSubtitle', e.target.checked)}
                              className="w-3.5 h-3.5 accent-[#E87524] rounded cursor-pointer"
                              title="إظهار/إخفاء العنوان الفرعي"
                            />
                          </label>
                        </div>
                        <input
                          type="text"
                          disabled={customerConfig.showHeaderSubtitle === false}
                          value={customerConfig.headerSubtitle || ''}
                          onChange={e => updateCustomerField('headerSubtitle', e.target.value)}
                          placeholder="Pizzeria & Fast-Food Gourmet"
                          className="w-full px-3 py-1.5 bg-white border border-[#E9DCCB] rounded-xl text-xs text-[#292522] focus:ring-2 focus:ring-[#E87524] focus:outline-none disabled:opacity-40 disabled:bg-stone-100"
                        />
                      </div>
                    </div>

                    {/* Nom en Arabe & Message de bienvenue */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-bold text-stone-700">اسم المحل باللغة العربية</label>
                          <input
                            type="checkbox"
                            checked={customerConfig.showStoreNameAr}
                            onChange={e => updateCustomerField('showStoreNameAr', e.target.checked)}
                            className="w-3.5 h-3.5 accent-[#E87524] rounded cursor-pointer"
                          />
                        </div>
                        {customerConfig.showStoreNameAr && (
                          <input
                            type="text"
                            value={customerConfig.customStoreNameAr || ''}
                            onChange={e => updateCustomerField('customStoreNameAr', e.target.value)}
                            placeholder="مطعم وبيتزيريا أكوادرو"
                            dir="rtl"
                            className="w-full px-3 py-1.5 bg-white border border-[#E9DCCB] rounded-xl text-xs font-bold text-stone-800 focus:outline-none"
                          />
                        )}
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[11px] font-bold text-stone-700">رسالة الترحيب في الرأس</label>
                          <label className="flex items-center gap-1 cursor-pointer">
                            <span className="text-[10px] text-stone-500">إظهار</span>
                            <input
                              type="checkbox"
                              checked={customerConfig.showWelcomeMessage ?? true}
                              onChange={e => updateCustomerField('showWelcomeMessage', e.target.checked)}
                              className="w-3.5 h-3.5 accent-[#E87524] rounded cursor-pointer"
                              title="إظهار/إخفاء رسالة الترحيب"
                            />
                          </label>
                        </div>
                        <input
                          type="text"
                          disabled={customerConfig.showWelcomeMessage === false}
                          value={customerConfig.headerWelcomeMessage || ''}
                          onChange={e => updateCustomerField('headerWelcomeMessage', e.target.value)}
                          placeholder="أهلاً وسهلاً بكم • Bienvenue chez nous"
                          className="w-full px-3 py-1.5 bg-white border border-[#E9DCCB] rounded-xl text-xs text-[#292522] focus:outline-none disabled:opacity-40 disabled:bg-stone-100"
                        />
                      </div>
                    </div>

                    {/* Logo & options logo */}
                    <div className="pt-2 border-t border-stone-200/60 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-stone-800 flex items-center gap-1.5">
                          <span>إظهار شعار المحل المطبوع (Logo)</span>
                        </label>
                        <input
                          type="checkbox"
                          checked={customerConfig.showLogo}
                          onChange={e => updateCustomerField('showLogo', e.target.checked)}
                          className="w-4 h-4 accent-[#E87524] rounded cursor-pointer"
                        />
                      </div>

                      {customerConfig.showLogo && (
                        <div className="p-3 bg-white border border-[#E9DCCB] rounded-xl space-y-3">
                          {/* موضع ومحاذاة الشعار */}
                          <div>
                            <div className="flex items-center justify-between mb-1.5">
                              <label className="text-[11px] font-bold text-stone-700">موضع ومحاذاة الشعار على التيكيت</label>
                              <span className="text-[10px] font-bold text-[#E87524]">
                                {(customerConfig.logoAlignment || 'center') === 'right' ? 'الجهة اليمنى' : ((customerConfig.logoAlignment || 'center') === 'left' ? 'الجهة اليسرى' : 'في المنتصف')}
                              </span>
                            </div>
                            <div className="grid grid-cols-3 gap-1.5">
                              {[
                                { id: 'right', label: 'يمين', desc: 'جهة اليمين', icon: AlignRight },
                                { id: 'center', label: 'وسط', desc: 'في الوسط', icon: AlignCenter },
                                { id: 'left', label: 'يسار', desc: 'جهة اليسار', icon: AlignLeft }
                              ].map(al => {
                                const Icon = al.icon;
                                const isSelected = (customerConfig.logoAlignment || 'center') === al.id;
                                return (
                                  <button
                                    key={al.id}
                                    type="button"
                                    onClick={() => updateCustomerField('logoAlignment', al.id as any)}
                                    className={`py-2 px-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${isSelected
                                        ? 'bg-[#FFF3EB] border-[#E87524] text-[#E87524] shadow-xs'
                                        : 'bg-stone-50 border-stone-200 text-stone-600 hover:bg-stone-100'
                                      }`}
                                  >
                                    <Icon className="w-3.5 h-3.5" />
                                    <span>{al.label}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-stone-200/60">
                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-[11px] font-bold text-stone-700">ارتفاع الشعار على الورق</span>
                                <span className="text-[10px] font-mono font-bold text-[#E87524]">{customerConfig.logoHeight || 55}px</span>
                              </div>
                              <input
                                type="range"
                                min={25}
                                max={90}
                                step={5}
                                value={customerConfig.logoHeight || 55}
                                onChange={e => updateCustomerField('logoHeight', Number(e.target.value))}
                                className="w-full accent-[#E87524] cursor-pointer h-1.5 bg-stone-200 rounded-lg"
                              />
                            </div>

                            <label className="flex items-center justify-between cursor-pointer">
                              <div>
                                <span className="text-[11px] font-bold text-stone-800 block">أبيض وأسود عالي التباين</span>
                                <span className="text-[9px] text-stone-400">مثالي لرؤوس الطابعات الحرارية</span>
                              </div>
                              <input
                                type="checkbox"
                                checked={customerConfig.logoGrayscale || false}
                                onChange={e => updateCustomerField('logoGrayscale', e.target.checked)}
                                className="w-4 h-4 accent-[#E87524] rounded cursor-pointer"
                              />
                            </label>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Téléphone 1 & 2 */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-stone-200/60">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-bold text-stone-700 flex items-center gap-1">
                            <Phone className="w-3.5 h-3.5 text-stone-500" />
                            <span>رقم الهاتف الأول</span>
                          </label>
                          <input
                            type="checkbox"
                            checked={customerConfig.showPhone}
                            onChange={e => updateCustomerField('showPhone', e.target.checked)}
                            className="w-3.5 h-3.5 accent-[#E87524] rounded cursor-pointer"
                          />
                        </div>
                        {customerConfig.showPhone && (
                          <input
                            type="text"
                            value={customerConfig.customPhone}
                            onChange={e => updateCustomerField('customPhone', e.target.value)}
                            placeholder="0550 12 34 56 (أو اتركه لفون الإعدادات)"
                            className="w-full px-3 py-1.5 bg-white border border-[#E9DCCB] rounded-xl text-xs text-stone-800 focus:outline-none"
                          />
                        )}
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-stone-700 block">رقم هاتف ثانٍ إضافي (اختياري)</label>
                        <input
                          type="text"
                          value={customerConfig.customPhone2 || ''}
                          onChange={e => updateCustomerField('customPhone2', e.target.value)}
                          placeholder="0770 98 76 54"
                          className="w-full px-3 py-1.5 bg-white border border-[#E9DCCB] rounded-xl text-xs text-stone-800 focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* Adresse */}
                    <div className="space-y-1 pt-2 border-t border-stone-200/60">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-bold text-stone-700 flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-stone-500" />
                          <span>عنوان المحل المطبوع</span>
                        </label>
                        <input
                          type="checkbox"
                          checked={customerConfig.showAddress}
                          onChange={e => updateCustomerField('showAddress', e.target.checked)}
                          className="w-3.5 h-3.5 accent-[#E87524] rounded cursor-pointer"
                        />
                      </div>
                      {customerConfig.showAddress && (
                        <input
                          type="text"
                          value={customerConfig.customAddress}
                          onChange={e => updateCustomerField('customAddress', e.target.value)}
                          placeholder="14 Rue Didouche Mourad, Alger"
                          className="w-full px-3 py-1.5 bg-white border border-[#E9DCCB] rounded-xl text-xs text-stone-800 focus:outline-none"
                        />
                      )}
                    </div>

                    {/* Réseaux Sociaux & Wi-Fi */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-stone-200/60">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-stone-700 flex items-center gap-1">
                            <Share2 className="w-3.5 h-3.5 text-stone-500" />
                            <span>حسابات التواصل (انستغرام / فيسبوك)</span>
                          </span>
                          <input
                            type="checkbox"
                            checked={customerConfig.showSocials}
                            onChange={e => updateCustomerField('showSocials', e.target.checked)}
                            className="w-3.5 h-3.5 accent-[#E87524] rounded cursor-pointer"
                          />
                        </div>
                        {customerConfig.showSocials && (
                          <input
                            type="text"
                            value={customerConfig.socialsText}
                            onChange={e => updateCustomerField('socialsText', e.target.value)}
                            placeholder="@aquadro_pizza"
                            className="w-full px-3 py-1.5 bg-white border border-[#E9DCCB] rounded-xl text-xs text-stone-800 focus:outline-none"
                          />
                        )}
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-stone-700 flex items-center gap-1">
                            <Wifi className="w-3.5 h-3.5 text-stone-500" />
                            <span>واي فاي الزبائن (Wi-Fi)</span>
                          </span>
                          <input
                            type="checkbox"
                            checked={customerConfig.showWifi}
                            onChange={e => updateCustomerField('showWifi', e.target.checked)}
                            className="w-3.5 h-3.5 accent-[#E87524] rounded cursor-pointer"
                          />
                        </div>
                        {customerConfig.showWifi && (
                          <input
                            type="text"
                            value={customerConfig.wifiText}
                            onChange={e => updateCustomerField('wifiText', e.target.value)}
                            placeholder="Wi-Fi: Aquadro-Client"
                            className="w-full px-3 py-1.5 bg-white border border-[#E9DCCB] rounded-xl text-xs text-stone-800 focus:outline-none"
                          />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* ============================================================= */}
                  {/* 2. البيانات الجبائية والقانونية                                 */}
                  {/* ============================================================= */}
                  <div className="p-4 bg-stone-50/70 rounded-2xl border border-stone-200/90 space-y-3">
                    <div className="flex items-center justify-between border-b border-stone-200/70 pb-2">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-[#E87524]" />
                        <h4 className="text-xs font-bold text-stone-800">2. البيانات الجبائية والقانونية (Données Fiscales & Légales)</h4>
                      </div>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <span className="text-[11px] font-bold text-stone-600">تفعيل الطباعة الجبائية</span>
                        <input
                          type="checkbox"
                          checked={customerConfig.showFiscalInfo || false}
                          onChange={e => updateCustomerField('showFiscalInfo', e.target.checked)}
                          className="w-4 h-4 accent-[#E87524] rounded cursor-pointer"
                        />
                      </label>
                    </div>

                    {customerConfig.showFiscalInfo && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1 animate-in fade-in duration-100">
                        <div>
                          <label className="block text-[10px] font-bold text-stone-600 mb-0.5">السجل التجاري (RC)</label>
                          <input
                            type="text"
                            value={customerConfig.customRc || ''}
                            onChange={e => updateCustomerField('customRc', e.target.value)}
                            placeholder="16/00-1234567B22"
                            className="w-full px-2.5 py-1.5 bg-white border border-[#E9DCCB] rounded-xl text-[11px] font-mono text-stone-800 focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-stone-600 mb-0.5">التعريف الجبائي (NIF)</label>
                          <input
                            type="text"
                            value={customerConfig.customNif || ''}
                            onChange={e => updateCustomerField('customNif', e.target.value)}
                            placeholder="002216012345678"
                            className="w-full px-2.5 py-1.5 bg-white border border-[#E9DCCB] rounded-xl text-[11px] font-mono text-stone-800 focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-stone-600 mb-0.5">التعريف الإحصائي (NIS)</label>
                          <input
                            type="text"
                            value={customerConfig.customNis || ''}
                            onChange={e => updateCustomerField('customNis', e.target.value)}
                            placeholder="002216012345"
                            className="w-full px-2.5 py-1.5 bg-white border border-[#E9DCCB] rounded-xl text-[11px] font-mono text-stone-800 focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-stone-600 mb-0.5">رقم المادة (Art. Imp)</label>
                          <input
                            type="text"
                            value={customerConfig.customAi || ''}
                            onChange={e => updateCustomerField('customAi', e.target.value)}
                            placeholder="16223344556"
                            className="w-full px-2.5 py-1.5 bg-white border border-[#E9DCCB] rounded-xl text-[11px] font-mono text-stone-800 focus:outline-none"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* ============================================================= */}
                  {/* 3. بيانات الطلب، الكاشير والزبون                                */}
                  {/* ============================================================= */}
                  <div className="p-4 bg-stone-50/70 rounded-2xl border border-stone-200/90 space-y-3">
                    <div className="flex items-center gap-2 border-b border-stone-200/70 pb-2">
                      <Receipt className="w-4 h-4 text-[#E87524]" />
                      <h4 className="text-xs font-bold text-stone-800">3. بيانات الطلب، الكاشير والزبون (Commande & Client)</h4>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-stone-700 mb-1">بادئة رقم الطلب (Préfixe N° Commande)</label>
                        <input
                          type="text"
                          value={customerConfig.orderNumberPrefix || 'COMMANDE #'}
                          onChange={e => updateCustomerField('orderNumberPrefix', e.target.value)}
                          placeholder="COMMANDE # أو طلب رقم #"
                          className="w-full px-3 py-1.5 bg-white border border-[#E9DCCB] rounded-xl text-xs font-bold text-[#292522] focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-stone-700 mb-1">تسمية البائع / الكاشير (Libellé Caissier)</label>
                        <input
                          type="text"
                          value={customerConfig.cashierLabel || 'Caissier'}
                          onChange={e => updateCustomerField('cashierLabel', e.target.value)}
                          placeholder="Caissier أو البائع أو الكاشير"
                          className="w-full px-3 py-1.5 bg-white border border-[#E9DCCB] rounded-xl text-xs text-[#292522] focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1">
                      <label className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-stone-200 cursor-pointer">
                        <span className="text-[11px] font-bold text-stone-700">رقم الطلب (#42)</span>
                        <input
                          type="checkbox"
                          checked={customerConfig.showOrderNumber}
                          onChange={e => updateCustomerField('showOrderNumber', e.target.checked)}
                          className="w-3.5 h-3.5 accent-[#E87524] rounded cursor-pointer"
                        />
                      </label>

                      <label className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-stone-200 cursor-pointer">
                        <span className="text-[11px] font-bold text-stone-700">نوع الطلب (طاولة/سفري)</span>
                        <input
                          type="checkbox"
                          checked={customerConfig.showOrderType}
                          onChange={e => updateCustomerField('showOrderType', e.target.checked)}
                          className="w-3.5 h-3.5 accent-[#E87524] rounded cursor-pointer"
                        />
                      </label>

                      <label className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-stone-200 cursor-pointer">
                        <span className="text-[11px] font-bold text-stone-700">رقم الطاولة (Table)</span>
                        <input
                          type="checkbox"
                          checked={customerConfig.showTableNumber ?? true}
                          onChange={e => updateCustomerField('showTableNumber', e.target.checked)}
                          className="w-3.5 h-3.5 accent-[#E87524] rounded cursor-pointer"
                        />
                      </label>

                      <label className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-stone-200 cursor-pointer">
                        <span className="text-[11px] font-bold text-stone-700">التاريخ والساعة</span>
                        <input
                          type="checkbox"
                          checked={customerConfig.showDateTime}
                          onChange={e => updateCustomerField('showDateTime', e.target.checked)}
                          className="w-3.5 h-3.5 accent-[#E87524] rounded cursor-pointer"
                        />
                      </label>

                      <label className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-stone-200 cursor-pointer">
                        <span className="text-[11px] font-bold text-stone-700">اسم الكاشير</span>
                        <input
                          type="checkbox"
                          checked={customerConfig.showCashier}
                          onChange={e => updateCustomerField('showCashier', e.target.checked)}
                          className="w-3.5 h-3.5 accent-[#E87524] rounded cursor-pointer"
                        />
                      </label>

                      <label className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-stone-200 cursor-pointer">
                        <span className="text-[11px] font-bold text-stone-700">بيانات زبون التوصيل</span>
                        <input
                          type="checkbox"
                          checked={customerConfig.showCustomer}
                          onChange={e => updateCustomerField('showCustomer', e.target.checked)}
                          className="w-3.5 h-3.5 accent-[#E87524] rounded cursor-pointer"
                        />
                      </label>
                    </div>
                  </div>

                  {/* ============================================================= */}
                  {/* 4. جدول المواد والوجبات والبيتزا                               */}
                  {/* ============================================================= */}
                  <div className="p-4 bg-stone-50/70 rounded-2xl border border-stone-200/90 space-y-3">
                    <div className="flex items-center gap-2 border-b border-stone-200/70 pb-2">
                      <ChefHat className="w-4 h-4 text-[#E87524]" />
                      <h4 className="text-xs font-bold text-stone-800">4. جدول الوجبات والبيتزا والإضافات (Articles & Suppléments)</h4>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      <label className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-stone-200 cursor-pointer">
                        <span className="text-[11px] font-bold text-stone-700">سعر الوحدة (Prix Unit.)</span>
                        <input
                          type="checkbox"
                          checked={customerConfig.showItemUnitPrices}
                          onChange={e => updateCustomerField('showItemUnitPrices', e.target.checked)}
                          className="w-3.5 h-3.5 accent-[#E87524] rounded cursor-pointer"
                        />
                      </label>

                      <label className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-stone-200 cursor-pointer">
                        <span className="text-[11px] font-bold text-stone-700">الأحجام (Variantes)</span>
                        <input
                          type="checkbox"
                          checked={customerConfig.showItemVariants ?? true}
                          onChange={e => updateCustomerField('showItemVariants', e.target.checked)}
                          className="w-3.5 h-3.5 accent-[#E87524] rounded cursor-pointer"
                        />
                      </label>

                      <label className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-stone-200 cursor-pointer">
                        <span className="text-[11px] font-bold text-stone-700">نصفين (Moitié-Moitié)</span>
                        <input
                          type="checkbox"
                          checked={customerConfig.showItemParts}
                          onChange={e => updateCustomerField('showItemParts', e.target.checked)}
                          className="w-3.5 h-3.5 accent-[#E87524] rounded cursor-pointer"
                        />
                      </label>

                      <label className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-stone-200 cursor-pointer">
                        <span className="text-[11px] font-bold text-stone-700">الإضافات (+ Suppléments)</span>
                        <input
                          type="checkbox"
                          checked={customerConfig.showItemSupplements}
                          onChange={e => updateCustomerField('showItemSupplements', e.target.checked)}
                          className="w-3.5 h-3.5 accent-[#E87524] rounded cursor-pointer"
                        />
                      </label>

                      <label className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-stone-200 cursor-pointer">
                        <span className="text-[11px] font-bold text-stone-700">ملاحظات الوجبة (* Note)</span>
                        <input
                          type="checkbox"
                          checked={customerConfig.showItemNotes}
                          onChange={e => updateCustomerField('showItemNotes', e.target.checked)}
                          className="w-3.5 h-3.5 accent-[#E87524] rounded cursor-pointer"
                        />
                      </label>

                      <label className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-stone-200 cursor-pointer">
                        <span className="text-[11px] font-bold text-stone-700">أسماء المواد بالخط العريض</span>
                        <input
                          type="checkbox"
                          checked={customerConfig.boldItemNames}
                          onChange={e => updateCustomerField('boldItemNames', e.target.checked)}
                          className="w-3.5 h-3.5 accent-[#E87524] rounded cursor-pointer"
                        />
                      </label>
                    </div>
                  </div>

                  {/* ============================================================= */}
                  {/* 5. المجاميع، الخصومات والعملة                                   */}
                  {/* ============================================================= */}
                  <div className="p-4 bg-stone-50/70 rounded-2xl border border-stone-200/90 space-y-3.5">
                    <div className="flex items-center gap-2 border-b border-stone-200/70 pb-2">
                      <DollarSign className="w-4 h-4 text-[#E87524]" />
                      <h4 className="text-xs font-bold text-stone-800">5. المجاميع، الخصومات وتنسيق العملة (Totaux & Devise)</h4>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-stone-700 mb-1">رمز العملة (Symbole Devise)</label>
                        <div className="grid grid-cols-3 gap-1.5">
                          {(['DZD', 'دج', 'DA'] as const).map(sym => (
                            <button
                              key={sym}
                              type="button"
                              onClick={() => updateCustomerField('currencySymbol', sym)}
                              className={`py-1.5 rounded-lg border text-xs font-bold transition-all cursor-pointer ${(customerConfig.currencySymbol || 'DZD') === sym
                                  ? 'bg-[#E87524] text-white border-[#E87524]'
                                  : 'bg-white border-stone-200 text-stone-700'
                                }`}
                            >
                              {sym}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-stone-700 mb-1">موضع رمز العملة</label>
                        <div className="grid grid-cols-2 gap-1.5">
                          <button
                            type="button"
                            onClick={() => updateCustomerField('currencyPosition', 'after')}
                            className={`py-1.5 rounded-lg border text-xs font-bold transition-all cursor-pointer ${(customerConfig.currencyPosition || 'after') === 'after'
                                ? 'bg-[#E87524] text-white border-[#E87524]'
                                : 'bg-white border-stone-200 text-stone-700'
                              }`}
                          >
                            بعد الرقم (1500 DZD)
                          </button>
                          <button
                            type="button"
                            onClick={() => updateCustomerField('currencyPosition', 'before')}
                            className={`py-1.5 rounded-lg border text-xs font-bold transition-all cursor-pointer ${customerConfig.currencyPosition === 'before'
                                ? 'bg-[#E87524] text-white border-[#E87524]'
                                : 'bg-white border-stone-200 text-stone-700'
                              }`}
                          >
                            قبل الرقم (DZD 1500)
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Lignes de calcul et libellés */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-stone-200/60">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-bold text-stone-700">المجموع الفرعي (Sous-total)</label>
                          <input
                            type="checkbox"
                            checked={customerConfig.showSubtotal ?? true}
                            onChange={e => updateCustomerField('showSubtotal', e.target.checked)}
                            className="w-3.5 h-3.5 accent-[#E87524] rounded cursor-pointer"
                          />
                        </div>
                        {customerConfig.showSubtotal && (
                          <input
                            type="text"
                            value={customerConfig.subtotalLabel || 'Sous-total'}
                            onChange={e => updateCustomerField('subtotalLabel', e.target.value)}
                            className="w-full px-3 py-1 bg-white border border-[#E9DCCB] rounded-lg text-xs"
                          />
                        )}
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-bold text-stone-700">سعر التوصيل (Livraison)</label>
                          <input
                            type="checkbox"
                            checked={customerConfig.showDeliveryFee}
                            onChange={e => updateCustomerField('showDeliveryFee', e.target.checked)}
                            className="w-3.5 h-3.5 accent-[#E87524] rounded cursor-pointer"
                          />
                        </div>
                        {customerConfig.showDeliveryFee && (
                          <input
                            type="text"
                            value={customerConfig.deliveryFeeLabel || 'Frais de livraison'}
                            onChange={e => updateCustomerField('deliveryFeeLabel', e.target.value)}
                            className="w-full px-3 py-1 bg-white border border-[#E9DCCB] rounded-lg text-xs"
                          />
                        )}
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-bold text-stone-700">التخفيض والخصم (Remise)</label>
                          <input
                            type="checkbox"
                            checked={customerConfig.showDiscount}
                            onChange={e => updateCustomerField('showDiscount', e.target.checked)}
                            className="w-3.5 h-3.5 accent-[#E87524] rounded cursor-pointer"
                          />
                        </div>
                        {customerConfig.showDiscount && (
                          <input
                            type="text"
                            value={customerConfig.discountLabel || 'Remise'}
                            onChange={e => updateCustomerField('discountLabel', e.target.value)}
                            className="w-full px-3 py-1 bg-white border border-[#E9DCCB] rounded-lg text-xs"
                          />
                        )}
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-bold text-stone-700">الضريبة (TVA)</label>
                          <input
                            type="checkbox"
                            checked={customerConfig.showTax}
                            onChange={e => updateCustomerField('showTax', e.target.checked)}
                            className="w-3.5 h-3.5 accent-[#E87524] rounded cursor-pointer"
                          />
                        </div>
                        {customerConfig.showTax && (
                          <input
                            type="text"
                            value={customerConfig.taxLabel || 'TVA'}
                            onChange={e => updateCustomerField('taxLabel', e.target.value)}
                            className="w-full px-3 py-1 bg-white border border-[#E9DCCB] rounded-lg text-xs"
                          />
                        )}
                      </div>

                      <div className="space-y-1 col-span-1 sm:col-span-2 bg-amber-50/70 p-2.5 rounded-xl border border-amber-200/80">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-black text-amber-950">المجموع النهائي الكبير (TOTAL TTC)</label>
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <span className="text-[10px] font-bold text-amber-700">إظهار المجموع الكلي</span>
                            <input
                              type="checkbox"
                              checked={customerConfig.showGrandTotal ?? true}
                              onChange={e => updateCustomerField('showGrandTotal', e.target.checked)}
                              className="w-4 h-4 accent-[#E87524] rounded cursor-pointer"
                            />
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ============================================================= */}
                  {/* 6. طريقة الدفع والباقي المردود (Mode de Règlement & Monnaie) */}
                  {/* ============================================================= */}
                  <div className="p-4 bg-stone-50/70 rounded-2xl border border-stone-200/90 space-y-3.5">
                    <div className="flex items-center justify-between border-b border-stone-200/70 pb-2">
                      <div className="flex items-center gap-2">
                        <CreditCard className="w-4 h-4 text-[#E87524]" />
                        <h4 className="text-xs font-bold text-stone-800">6. طريقة الدفع والصرف (Mode de Règlement & Monnaie Rendue)</h4>
                      </div>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <span className="text-[11px] font-bold text-stone-700">تفعيل ظهور طريقة الدفع (Mode de règlement)</span>
                        <input
                          type="checkbox"
                          checked={customerConfig.showPaymentMethod}
                          onChange={e => updateCustomerField('showPaymentMethod', e.target.checked)}
                          className="w-4 h-4 accent-[#E87524] rounded cursor-pointer"
                        />
                      </label>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <div className="space-y-1">
                        <label className="block text-[11px] font-bold text-stone-700 mb-1">
                          تسمية حقل طريقة الدفع (Libellé Mode de Règlement)
                        </label>
                        <input
                          type="text"
                          disabled={!customerConfig.showPaymentMethod}
                          value={customerConfig.paymentMethodLabel || 'Mode de règlement'}
                          onChange={e => updateCustomerField('paymentMethodLabel', e.target.value)}
                          placeholder="Mode de règlement أو طريقة الدفع"
                          className="w-full px-3 py-1.5 bg-white border border-[#E9DCCB] rounded-xl text-xs text-stone-800 focus:outline-none disabled:opacity-50 disabled:bg-stone-100"
                        />
                      </div>

                      <div className="flex items-end">
                        <label className={`w-full flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer ${!customerConfig.showPaymentMethod ? 'opacity-50 bg-stone-100 border-stone-200' : 'bg-white border-stone-200 hover:border-orange-200'
                          }`}>
                          <div>
                            <span className="text-[11px] font-bold text-stone-700 block">إظهار المقبوض والباقي المردود</span>
                            <span className="text-[9.5px] text-stone-400">Montant reçu & Monnaie rendue (Espèces)</span>
                          </div>
                          <input
                            type="checkbox"
                            disabled={!customerConfig.showPaymentMethod}
                            checked={customerConfig.showTenderedAndChange}
                            onChange={e => updateCustomerField('showTenderedAndChange', e.target.checked)}
                            className="w-4 h-4 accent-[#E87524] rounded cursor-pointer shrink-0"
                          />
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* ============================================================= */}
                  {/* 7. تذييل الفاتورة، الباركود والـ QR Code                        */}
                  {/* ============================================================= */}
                  <div className="p-4 bg-stone-50/70 rounded-2xl border border-stone-200/90 space-y-3.5">
                    <div className="flex items-center gap-2 border-b border-stone-200/70 pb-2">
                      <QrCode className="w-4 h-4 text-[#E87524]" />
                      <h4 className="text-xs font-bold text-stone-800">7. تذييل الفاتورة، الباركود والـ QR Code (Pied de Ticket & Codes)</h4>
                    </div>

                    {/* QR Code */}
                    <div className="p-3 bg-white border border-[#E9DCCB] rounded-xl space-y-2.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-stone-800 flex items-center gap-1.5">
                          <span>رمز الاستجابة السريع (QR Code الحراري)</span>
                        </label>
                        <input
                          type="checkbox"
                          checked={customerConfig.showQrCode || false}
                          onChange={e => updateCustomerField('showQrCode', e.target.checked)}
                          className="w-4 h-4 accent-[#E87524] rounded cursor-pointer"
                        />
                      </div>

                      {customerConfig.showQrCode && (
                        <div className="space-y-2 pt-1 border-t border-stone-100">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[10px] font-bold text-stone-600 mb-1">نوع رابط الـ QR</label>
                              <select
                                value={customerConfig.qrCodeType || 'menu_url'}
                                onChange={e => updateCustomerField('qrCodeType', e.target.value as any)}
                                className="w-full px-2.5 py-1.5 bg-stone-50 border border-stone-200 rounded-lg text-xs text-stone-800 focus:outline-none"
                              >
                                <option value="menu_url">منيو المحل الإلكتروني (Menu en ligne)</option>
                                <option value="store_url">الموقع الرسمي أو صفحة الفيسبوك</option>
                                <option value="wifi">اتصال تلقائي بالواي فاي (Auto Wi-Fi)</option>
                                <option value="custom">نص أو رابط مخصص بالكامل</option>
                              </select>
                            </div>

                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-[10px] font-bold text-stone-600">حجم الـ QR Code</span>
                                <span className="text-[10px] font-mono font-bold text-[#E87524]">{customerConfig.qrCodeSize || 64}px</span>
                              </div>
                              <input
                                type="range"
                                min={40}
                                max={100}
                                step={5}
                                value={customerConfig.qrCodeSize || 64}
                                onChange={e => updateCustomerField('qrCodeSize', Number(e.target.value))}
                                className="w-full accent-[#E87524] cursor-pointer h-1.5 bg-stone-200 rounded-lg"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold text-stone-600 mb-0.5">النص أسفل الـ QR Code</label>
                            <input
                              type="text"
                              value={customerConfig.qrCustomText || ''}
                              onChange={e => updateCustomerField('qrCustomText', e.target.value)}
                              placeholder="امسح الرمز للاطلاع على المنيو أو صفحتنا"
                              className="w-full px-2.5 py-1.5 bg-stone-50 border border-stone-200 rounded-lg text-xs text-stone-800 focus:outline-none"
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Barcode */}
                    <div className="flex items-center justify-between p-3 bg-white border border-[#E9DCCB] rounded-xl">
                      <div>
                        <span className="text-xs font-bold text-stone-800 block">طباعة الباركود (Barcode)</span>
                        <span className="text-[10px] text-stone-400">طباعة رقم الفاتورة كباركود لسهولة البحث عند الإرجاع</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={customerConfig.showBarcode}
                        onChange={e => updateCustomerField('showBarcode', e.target.checked)}
                        className="w-4 h-4 accent-[#E87524] rounded cursor-pointer"
                      />
                    </div>

                    {/* Lignes de remerciements & politique */}
                    <div className="space-y-2 pt-2 border-t border-stone-200/60">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-stone-700 block">رسائل الشكر وسياسة المحل :</span>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <span className="text-[10px] font-bold text-stone-600">إظهار أسطر الشكر</span>
                          <input
                            type="checkbox"
                            checked={customerConfig.showFooterLines ?? true}
                            onChange={e => updateCustomerField('showFooterLines', e.target.checked)}
                            className="w-3.5 h-3.5 accent-[#E87524] rounded cursor-pointer"
                          />
                        </label>
                      </div>
                      <div className={`grid grid-cols-1 sm:grid-cols-2 gap-2 transition-opacity ${customerConfig.showFooterLines === false ? 'opacity-40' : ''}`}>
                        <input
                          type="text"
                          disabled={customerConfig.showFooterLines === false}
                          value={customerConfig.footerLine1}
                          onChange={e => updateCustomerField('footerLine1', e.target.value)}
                          placeholder="Merci pour votre visite !"
                          className="w-full px-3 py-1.5 bg-white border border-[#E9DCCB] rounded-xl text-xs font-bold text-[#292522] focus:outline-none disabled:bg-stone-100"
                        />
                        <input
                          type="text"
                          disabled={customerConfig.showFooterLines === false}
                          value={customerConfig.footerLine2}
                          onChange={e => updateCustomerField('footerLine2', e.target.value)}
                          placeholder="À bientôt • Aquadro POS"
                          className="w-full px-3 py-1.5 bg-white border border-[#E9DCCB] rounded-xl text-xs text-[#292522] focus:outline-none disabled:bg-stone-100"
                        />
                      </div>
                      <input
                        type="text"
                        disabled={customerConfig.showFooterLines === false}
                        value={customerConfig.footerLine3}
                        onChange={e => updateCustomerField('footerLine3', e.target.value)}
                        placeholder="صحة وهنا - زورونا مجدداً"
                        className={`w-full px-3 py-1.5 bg-white border border-[#E9DCCB] rounded-xl text-xs text-[#292522] focus:outline-none disabled:bg-stone-100 ${customerConfig.showFooterLines === false ? 'opacity-40' : ''}`}
                        dir="rtl"
                      />
                      <input
                        type="text"
                        disabled={customerConfig.showFooterLines === false}
                        value={customerConfig.footerLine4 || ''}
                        onChange={e => updateCustomerField('footerLine4', e.target.value)}
                        placeholder="السطر الرابع: خدمات التوصيل السريع متاحة يومياً"
                        className={`w-full px-3 py-1.5 bg-white border border-[#E9DCCB] rounded-xl text-xs text-[#292522] focus:outline-none disabled:bg-stone-100 ${customerConfig.showFooterLines === false ? 'opacity-40' : ''}`}
                        dir="rtl"
                      />
                      <input
                        type="text"
                        disabled={customerConfig.showFooterLines === false}
                        value={customerConfig.thankYouMessageAr || ''}
                        onChange={e => updateCustomerField('thankYouMessageAr', e.target.value)}
                        placeholder="رسالة شكر بالعربية: شكراً لثقتكم وزيارتكم الكريمة"
                        className={`w-full px-3 py-1.5 bg-white border border-[#E9DCCB] rounded-xl text-xs font-bold text-[#E87524] focus:outline-none disabled:bg-stone-100 ${customerConfig.showFooterLines === false ? 'opacity-40' : ''}`}
                        dir="rtl"
                      />
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[11px] font-bold text-stone-600">نص السياسة والملاحظات الإضافية :</span>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <span className="text-[10px] text-stone-500">إظهار</span>
                          <input
                            type="checkbox"
                            checked={customerConfig.showFooterPolicy ?? true}
                            onChange={e => updateCustomerField('showFooterPolicy', e.target.checked)}
                            className="w-3.5 h-3.5 accent-[#E87524] rounded cursor-pointer"
                          />
                        </label>
                      </div>
                      <input
                        type="text"
                        disabled={customerConfig.showFooterPolicy === false}
                        value={customerConfig.footerPolicy || ''}
                        onChange={e => updateCustomerField('footerPolicy', e.target.value)}
                        placeholder="الشكاوى مقبولة في أجل 30 دقيقة • تذوق طيب وشكراً لوفائكم"
                        className={`w-full px-3 py-1.5 bg-white border border-[#E9DCCB] rounded-xl text-xs text-stone-600 focus:outline-none italic disabled:bg-stone-100 ${customerConfig.showFooterPolicy === false ? 'opacity-40' : ''}`}
                        dir="rtl"
                      />

                      {/* Options supplémentaires pour articles et coupe */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-stone-200/60">
                        <label className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-stone-200 cursor-pointer">
                          <span className="text-[11px] font-bold text-stone-700">إظهار خط قص التيكيت ✂</span>
                          <input
                            type="checkbox"
                            checked={customerConfig.showCutLine ?? true}
                            onChange={e => updateCustomerField('showCutLine', e.target.checked)}
                            className="w-4 h-4 accent-[#E87524] rounded cursor-pointer"
                          />
                        </label>

                        <label className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-stone-200 cursor-pointer">
                          <span className="text-[11px] font-bold text-stone-700">إظهار إجمالي عدد القطع</span>
                          <input
                            type="checkbox"
                            checked={customerConfig.showTotalItemsCount ?? true}
                            onChange={e => updateCustomerField('showTotalItemsCount', e.target.checked)}
                            className="w-4 h-4 accent-[#E87524] rounded cursor-pointer"
                          />
                        </label>

                        <label className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-stone-200 cursor-pointer">
                          <span className="text-[11px] font-bold text-stone-700">مكونات البيتزا الأساسية</span>
                          <input
                            type="checkbox"
                            checked={customerConfig.showBaseIngredients ?? false}
                            onChange={e => updateCustomerField('showBaseIngredients', e.target.checked)}
                            className="w-4 h-4 accent-[#E87524] rounded cursor-pointer"
                          />
                        </label>

                        <label className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-stone-200 cursor-pointer">
                          <span className="text-[11px] font-bold text-stone-700">رأس جدول الأصناف</span>
                          <input
                            type="checkbox"
                            checked={customerConfig.showItemTableHeader ?? true}
                            onChange={e => updateCustomerField('showItemTableHeader', e.target.checked)}
                            className="w-4 h-4 accent-[#E87524] rounded cursor-pointer"
                          />
                        </label>
                      </div>

                      <div className="pt-2">
                        <label className="block text-[11px] font-bold text-stone-700 mb-1">
                          تخصيص نص ملصق المجموع النهائي (Ex: TOTAL À PAYER)
                        </label>
                        <input
                          type="text"
                          value={customerConfig.totalLabelCustom || ''}
                          onChange={e => updateCustomerField('totalLabelCustom', e.target.value)}
                          placeholder="TOTAL À PAYER :"
                          className="w-full px-3 py-1.5 bg-white border border-[#E9DCCB] rounded-xl text-xs font-bold text-[#292522] focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                // Contenu Cuisine Complet & Ultra-Personnalisable
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-bold text-stone-700">
                          عنوان شارة بون المطبخ
                        </label>
                        <label className="flex items-center gap-1 cursor-pointer">
                          <span className="text-[10px] text-stone-500">إظهار الشارة</span>
                          <input
                            type="checkbox"
                            checked={kitchenConfig.showTicketTitle}
                            onChange={e => updateKitchenField('showTicketTitle', e.target.checked)}
                            className="w-3.5 h-3.5 accent-[#E87524] rounded cursor-pointer"
                            title="إظهار أو حذف شارة العنوان في بون المطبخ"
                          />
                        </label>
                      </div>
                      <input
                        type="text"
                        disabled={!kitchenConfig.showTicketTitle}
                        value={kitchenConfig.headerTitle}
                        onChange={e => updateKitchenField('headerTitle', e.target.value)}
                        placeholder="اتركه فارغاً لحذف الشارة بالكامل"
                        className="w-full px-3.5 py-2 bg-[#FFF8EF]/50 border border-[#E9DCCB] rounded-xl text-xs font-bold text-[#292522] focus:ring-2 focus:ring-[#E87524] focus:outline-none disabled:opacity-40 disabled:bg-stone-100"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-stone-700 mb-1">
                        نمط إطار رأس بون المطبخ
                      </label>
                      <select
                        value={kitchenConfig.chefHeaderStyle || 'bordered'}
                        onChange={e => updateKitchenField('chefHeaderStyle', e.target.value as any)}
                        className="w-full px-3 py-2 bg-white border border-[#E9DCCB] rounded-xl text-xs font-bold text-[#292522] focus:outline-none cursor-pointer"
                      >
                        <option value="bordered">إطار كلاسيكي أنيق (Encadré Classique)</option>
                        <option value="banner">بانر أسود داكن عريض (Bannière Noire Chef)</option>
                        <option value="clean">خط سفلي نظيف وبسيط (Ligne Simple)</option>
                      </select>
                    </div>
                  </div>

                  {/* Section Numéro de table géant & Réimpression */}
                  <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 space-y-3">
                    <span className="text-xs font-bold text-stone-800 block">خيارات الطاولة وإعادة الطباعة السريعة :</span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <label className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-stone-200 cursor-pointer">
                        <div>
                          <span className="text-xs font-bold text-stone-700 block">إبراز رقم الطاولة بشكل عملاق للطباخ</span>
                          <span className="text-[10px] text-stone-400">بانر أسود عريض: TABLE 4</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={kitchenConfig.showTableNumberProminent ?? true}
                          onChange={e => updateKitchenField('showTableNumberProminent', e.target.checked)}
                          className="w-4 h-4 accent-[#E87524] rounded cursor-pointer"
                        />
                      </label>

                      <label className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-stone-200 cursor-pointer">
                        <div>
                          <span className="text-xs font-bold text-stone-700 block">شارة تنبيهية عند إعادة الطباعة</span>
                          <span className="text-[10px] text-stone-400">*** RÉIMPRESSION / DUPLICATA ***</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={kitchenConfig.showReprintIndicator ?? true}
                          onChange={e => updateKitchenField('showReprintIndicator', e.target.checked)}
                          className="w-4 h-4 accent-[#E87524] rounded cursor-pointer"
                        />
                      </label>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <div>
                        <label className="block text-[11px] font-bold text-stone-700 mb-1">
                          كلمة الطاولة المطبوعة
                        </label>
                        <input
                          type="text"
                          value={kitchenConfig.tableNumberLabel || 'TABLE'}
                          onChange={e => updateKitchenField('tableNumberLabel', e.target.value)}
                          placeholder="TABLE / طاولة"
                          className="w-full px-3 py-1.5 bg-white border border-[#E9DCCB] rounded-xl text-xs font-bold text-[#292522] focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-stone-700 mb-1">
                          حجم خط رقم الطاولة: {kitchenConfig.tableNumberFontSize || 26}px
                        </label>
                        <input
                          type="range"
                          min="18"
                          max="36"
                          value={kitchenConfig.tableNumberFontSize || 26}
                          onChange={e => updateKitchenField('tableNumberFontSize', parseInt(e.target.value, 10))}
                          className="w-full accent-[#E87524] cursor-pointer"
                        />
                      </div>
                    </div>
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
                        <span className="text-xs font-bold text-stone-700 block">مكونات البيتزا الأساسية للطاهي</span>
                        <span className="text-[10px] text-stone-400">Base : Tomate, Mozzarella...</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={kitchenConfig.showBaseIngredientsInKitchen ?? true}
                        onChange={e => updateKitchenField('showBaseIngredientsInKitchen', e.target.checked)}
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
                className={`bg-white border border-stone-300 shadow-2xl p-4 transition-all duration-200 relative ${(activeTab === 'customer' ? customerConfig.paperWidth : kitchenConfig.paperWidth) === '58mm'
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
