// Aquadro POS Algérie V2 — Modal d'Aperçu & Choix d'Impression du Ticket de Caisse
// Permet de choisir librement : 1) Imprimer directement, 2) Ne pas imprimer (terminer), 3) Ouvrir les paramètres système / PDF

import React, { useState, useEffect } from 'react';
import {
  printerService,
  ReceiptPrintData,
  CustomerReceiptBlock,
  KitchenTicketBlock,
  DEFAULT_CUSTOMER_RECEIPT_BLOCK_ORDER,
  DEFAULT_KITCHEN_TICKET_BLOCK_ORDER
} from '../../services/printer.service';
import { CurrencyUtil } from '../../core/currency/currency';
import { useI18n } from '../../i18n';
import {
  Printer,
  CheckCircle,
  X,
  FileText,
  RotateCcw,
  CookingPot,
  Receipt,
  PrinterCheck,
  ChevronDown,
  ChevronUp,
  Layers,
  Sliders,
  Plus,
  Minus,
  Eye,
  EyeOff,
  Trash2,
  Type
} from 'lucide-react';

const CUSTOMER_BLOCK_LABELS: Record<CustomerReceiptBlock, { ar: string; fr: string }> = {
  header: { ar: 'رأس التيكيت والشعار', fr: 'En-tête & Logo' },
  order_banner: { ar: 'شريط رقم الطلب', fr: 'N° de commande' },
  order_info: { ar: 'معلومات الطلب والزبون', fr: 'Infos commande' },
  items: { ar: 'جدول الوجبات والإضافات', fr: 'Articles & extras' },
  subtotals: { ar: 'المجاميع الفرعية والتوصيل', fr: 'Sous-totaux' },
  total: { ar: 'المجموع الإجمالي النهائي', fr: 'Total TTC' },
  payment: { ar: 'طريقة الدفع والصرف', fr: 'Règlement' },
  footer: { ar: 'التذييل، الشكر والـ QR', fr: 'Pied & codes' }
};

const KITCHEN_BLOCK_LABELS: Record<KitchenTicketBlock, { ar: string; fr: string }> = {
  header: { ar: 'رأس البون وتاريخه', fr: 'En-tête' },
  order_banner: { ar: 'رقم الطلب الكبير', fr: 'N° commande géant' },
  service_info: { ar: 'نوع الطلب والطاولة والزبون', fr: 'Service & Client' },
  items: { ar: 'قائمة الأكلات والتحضير', fr: 'Articles cuisine' },
  notes: { ar: 'الملاحظات الخاصة والحرجة', fr: 'Notes cuisine' },
  footer: { ar: 'تذييل البون وخط القطع', fr: 'Pied de bon' }
};

interface ReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  receiptData: ReceiptPrintData | null;
  onNewSale?: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  isOpen,
  onClose,
  receiptData,
  onNewSale
}) => {
  const { language } = useI18n();
  const [paperWidth, setPaperWidth] = useState<'58mm' | '80mm'>('80mm');
  const [previewTab, setPreviewTab] = useState<'CLIENT' | 'KITCHEN'>('CLIENT');
  const [printTarget, setPrintTarget] = useState<'BOTH' | 'CLIENT' | 'KITCHEN'>('BOTH');
  const [isPrinting, setIsPrinting] = useState<boolean>(false);
  const [printFeedback, setPrintFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showQuickCustomizer, setShowQuickCustomizer] = useState<boolean>(false);
  const [tplVersion, setTplVersion] = useState<number>(0);

  useEffect(() => {
    const cfg = printerService.getConfig();
    setPaperWidth(cfg.paperWidth || '80mm');
  }, [isOpen]);

  // Configurations actuelles du ticket
  const customerConfig = printerService.getTemplateConfig();
  const kitchenConfig = printerService.getKitchenTemplateConfig();

  const currentSupplementsSize =
    previewTab === 'CLIENT'
      ? (customerConfig.supplementsFontSize || 12)
      : (kitchenConfig.supplementsFontSize || 12.5);

  const currentBoldSupplements =
    previewTab === 'CLIENT'
      ? (customerConfig.boldSupplements ?? true)
      : (kitchenConfig.boldSupplements ?? true);

  const handleSupplementSizeChange = (newSize: number) => {
    const clamped = Math.max(8, Math.min(24, Math.round(newSize * 2) / 2));
    if (previewTab === 'CLIENT') {
      const cfg = printerService.getTemplateConfig();
      printerService.saveTemplateConfig({ ...cfg, supplementsFontSize: clamped });
    } else {
      const kcfg = printerService.getKitchenTemplateConfig();
      printerService.saveKitchenTemplateConfig({ ...kcfg, supplementsFontSize: clamped });
    }
    setTplVersion(v => v + 1);
  };

  const handleBoldSupplementsToggle = () => {
    if (previewTab === 'CLIENT') {
      const cfg = printerService.getTemplateConfig();
      printerService.saveTemplateConfig({ ...cfg, boldSupplements: !currentBoldSupplements });
    } else {
      const kcfg = printerService.getKitchenTemplateConfig();
      printerService.saveKitchenTemplateConfig({ ...kcfg, boldSupplements: !currentBoldSupplements });
    }
    setTplVersion(v => v + 1);
  };

  const handleToggleCustomerBlock = (blockId: CustomerReceiptBlock) => {
    const cfg = printerService.getTemplateConfig();
    const hidden = cfg.hiddenBlocks || [];
    let newHidden: CustomerReceiptBlock[];
    if (hidden.includes(blockId)) {
      newHidden = hidden.filter(b => b !== blockId);
    } else {
      newHidden = [...hidden, blockId];
    }
    printerService.saveTemplateConfig({ ...cfg, hiddenBlocks: newHidden });
    setTplVersion(v => v + 1);
  };

  const handleToggleKitchenBlock = (blockId: KitchenTicketBlock) => {
    const kcfg = printerService.getKitchenTemplateConfig();
    const hidden = kcfg.hiddenBlocks || [];
    let newHidden: KitchenTicketBlock[];
    if (hidden.includes(blockId)) {
      newHidden = hidden.filter(b => b !== blockId);
    } else {
      newHidden = [...hidden, blockId];
    }
    printerService.saveKitchenTemplateConfig({ ...kcfg, hiddenBlocks: newHidden });
    setTplVersion(v => v + 1);
  };

  const handleToggleCustomerOption = (field: keyof typeof customerConfig) => {
    const cfg = printerService.getTemplateConfig();
    const currentVal = (cfg as any)[field];
    printerService.saveTemplateConfig({ ...cfg, [field]: !currentVal });
    setTplVersion(v => v + 1);
  };

  // Écoute clavier (Entrée pour imprimer, Échap pour ne pas imprimer / fermer)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleDirectPrint();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, receiptData, paperWidth, printTarget]);

  if (!isOpen || !receiptData) return null;

  const currentReceiptWithWidth: ReceiptPrintData = {
    ...receiptData,
    paperWidth
  };

  // 1. Action : Impression Matérielle Directe (Sans forcer le spouleur système)
  const handleDirectPrint = async () => {
    try {
      setIsPrinting(true);
      setPrintFeedback(null);

      if (printTarget === 'BOTH') {
        await printerService.printBothTickets(currentReceiptWithWidth, false);
        setPrintFeedback({
          message: language === 'ar' ? 'تم إرسال تيكت الزبون وبون المطبخ للطابعة بنجاح !' : 'Tickets Client et Cuisine envoyés à l\'imprimante !',
          type: 'success'
        });
      } else if (printTarget === 'KITCHEN') {
        await printerService.printKitchenTicket(currentReceiptWithWidth, false);
        setPrintFeedback({
          message: language === 'ar' ? 'تم إرسال بون المطبخ (الطاهي) للطباعة بنجاح !' : 'Bon de Cuisine (Pizzaiolo) imprimé !',
          type: 'success'
        });
      } else {
        await printerService.printReceipt(currentReceiptWithWidth, false);
        setPrintFeedback({
          message: language === 'ar' ? 'تم إرسال تيكت الزبون للطباعة بنجاح !' : 'Ticket Client imprimé avec succès !',
          type: 'success'
        });
      }
    } catch (err: any) {
      setPrintFeedback({
        message: language === 'ar' ? `خطأ أثناء الطباعة: ${err?.message || err}` : `Erreur d'impression : ${err?.message || err}`,
        type: 'error'
      });
    } finally {
      setIsPrinting(false);
    }
  };

  // 2. Action : Ouvrir les paramètres Microsoft Print to PDF ou Spouleur Système
  const handleOpenSystemPrintDialog = () => {
    if (typeof window === 'undefined') return;

    let printArea = document.getElementById('thermal-print-area');
    if (!printArea) {
      printArea = document.createElement('div');
      printArea.id = 'thermal-print-area';
      document.body.appendChild(printArea);
    }

    printArea.className = paperWidth === '58mm' ? 'paper-58mm' : 'paper-80mm';

    if (printTarget === 'BOTH') {
      printArea.innerHTML = `
        <div class="ticket-client" style="page-break-after: always; padding-bottom: 25px;">
          ${printerService.generateReceiptHtml(currentReceiptWithWidth)}
        </div>
        <div style="border-top: 2px dashed #000; margin: 20px 0; text-align: center; font-size: 11px; font-weight: bold;">
          ✄--- COUPER ICI / BON CUISINE ---✄
        </div>
        <div class="ticket-cuisine" style="padding-top: 15px;">
          ${printerService.generateKitchenTicketHtml(currentReceiptWithWidth)}
        </div>
      `;
    } else if (printTarget === 'KITCHEN' || previewTab === 'KITCHEN') {
      printArea.innerHTML = printerService.generateKitchenTicketHtml(currentReceiptWithWidth);
    } else {
      printArea.innerHTML = printerService.generateReceiptHtml(currentReceiptWithWidth);
    }

    setTimeout(() => {
      window.print();
    }, 60);
  };

  const handlePaperWidthChange = (width: '58mm' | '80mm') => {
    setPaperWidth(width);
    const cfg = printerService.getConfig();
    printerService.saveConfig({ ...cfg, paperWidth: width });
  };

  // 3. Action : Ne pas imprimer et fermer pour nouvelle vente
  const handleClose = () => {
    if (onNewSale) {
      onNewSale();
    } else {
      onClose();
    }
  };

  const isCash = receiptData.paymentMethod === 'CASH';
  const changeGiven = receiptData.changeGiven ?? 0;
  const cleanOrderNum = printerService.getCleanOrderNumber(receiptData.dailyOrderNumber, receiptData.receiptNumber);
  const cleanReceiptNum = printerService.getCleanReceiptNumber(receiptData.receiptNumber, cleanOrderNum);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 select-none animate-in fade-in duration-150">
      <div className="bg-white border border-[#E9DCCB] rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[92vh]">
        {/* ========================================================================= */}
        {/* EN-TÊTE MODAL                                                             */}
        {/* ========================================================================= */}
        <div className="px-5 py-3.5 border-b border-[#E9DCCB] bg-[#FFF8EF] flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-[#292522] text-sm">
                  {language === 'ar' ? 'تم الدفع بنجاح — خيارات التيكت' : 'Paiement Validé — Impression'}
                </h3>
                <span className="bg-[#E87524] text-white px-2.5 py-0.5 rounded-lg text-xs font-black tracking-wide">
                  #{cleanOrderNum}
                </span>
              </div>
              <p className="text-[11px] text-stone-500 font-mono">
                {cleanReceiptNum} — {receiptData.dateTime} {receiptData.cashierName ? `— (${receiptData.cashierName})` : ''}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-xl bg-white border border-[#E9DCCB] text-stone-500 hover:text-stone-800 hover:bg-stone-100 flex items-center justify-center transition-colors cursor-pointer"
            title="Ne pas imprimer / Fermer (Échap)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ========================================================================= */}
        {/* BANNIÈRE DE RETOUR D'IMPRESSION (FEEDBACK)                                */}
        {/* ========================================================================= */}
        {printFeedback && (
          <div className={`px-5 py-2 text-xs font-bold flex items-center justify-between border-b animate-in fade-in duration-150 ${
            printFeedback.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}>
            <div className="flex items-center gap-2">
              <PrinterCheck className="w-4 h-4" />
              <span>{printFeedback.message}</span>
            </div>
            <button onClick={() => setPrintFeedback(null)} className="cursor-pointer text-stone-400 hover:text-stone-700">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* ========================================================================= */}
        {/* BANNIÈRE MONNAIE À RENDRE (SI PAIEMENT ESPÈCES)                           */}
        {/* ========================================================================= */}
        {isCash && (
          <div className="px-5 py-2.5 bg-emerald-50 border-b border-emerald-200 flex items-center justify-between">
            <div className="text-xs text-emerald-900 font-bold">
              <span>{language === 'ar' ? 'المبلغ المتبقي للزبون :' : 'Monnaie à rendre au client :'}</span>
              <div className="text-[10px] text-emerald-700 font-mono">
                {language === 'ar' ? 'المقبوض: ' : 'Reçu: '}
                {CurrencyUtil.formatDZD(receiptData.tenderedAmount || 0)}
              </div>
            </div>
            <div className="text-xl font-black font-mono text-emerald-700">
              {CurrencyUtil.formatDZD(changeGiven)}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ONGLETS : TICKET CLIENT VS BON CUISINE                                    */}
        {/* ========================================================================= */}
        <div className="px-4 py-2 border-b border-[#E9DCCB] bg-white flex items-center justify-between gap-2">
          <div className="flex items-center space-x-1.5 bg-[#FFF8EF] p-1 rounded-xl border border-[#E9DCCB]">
            <button
              type="button"
              onClick={() => setPreviewTab('CLIENT')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                previewTab === 'CLIENT'
                  ? 'bg-[#E87524] text-white shadow-xs'
                  : 'text-stone-600 hover:text-[#292522]'
              }`}
            >
              <Receipt className="w-3.5 h-3.5" />
              <span>{language === 'ar' ? 'تيكت الزبون' : 'Ticket Client'}</span>
            </button>
            <button
              type="button"
              onClick={() => setPreviewTab('KITCHEN')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                previewTab === 'KITCHEN'
                  ? 'bg-[#E87524] text-white shadow-xs'
                  : 'text-stone-600 hover:text-[#292522]'
              }`}
            >
              <CookingPot className="w-3.5 h-3.5" />
              <span>{language === 'ar' ? 'بون المطبخ (الشيف)' : 'Bon Cuisine'}</span>
            </button>
          </div>

          <div className="flex items-center space-x-1">
            <button
              type="button"
              onClick={() => handlePaperWidthChange('80mm')}
              className={`px-2 py-0.5 rounded text-[11px] font-bold border cursor-pointer ${
                paperWidth === '80mm'
                  ? 'bg-amber-100 border-[#E87524] text-[#E87524]'
                  : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-50'
              }`}
            >
              80 mm
            </button>
            <button
              type="button"
              onClick={() => handlePaperWidthChange('58mm')}
              className={`px-2 py-0.5 rounded text-[11px] font-bold border cursor-pointer ${
                paperWidth === '58mm'
                  ? 'bg-amber-100 border-[#E87524] text-[#E87524]'
                  : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-50'
              }`}
            >
              58 mm
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* شريط تحكم سريع: تكبير/تصغير الإضافات وحذف/إظهار عناصر التيكيت             */}
        {/* ========================================================================= */}
        <div className="px-4 py-2 bg-gradient-to-r from-[#FFF9F3] to-[#FFF3E8] border-b border-[#E9DCCB] text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* 1. أداة تكبير / تصغير حجم الإضافات */}
            <div className="flex items-center gap-1.5 bg-white border border-[#E9DCCB] px-2.5 py-1 rounded-xl shadow-2xs">
              <span className="font-bold text-[#292522] flex items-center gap-1 text-[11px]">
                <Type className="w-3.5 h-3.5 text-[#E87524]" />
                <span>{language === 'ar' ? 'حجم الإضافات:' : 'Taille extras:'}</span>
              </span>
              <button
                type="button"
                onClick={() => handleSupplementSizeChange(currentSupplementsSize - 1)}
                disabled={currentSupplementsSize <= 8}
                className="w-5 h-5 rounded-md bg-stone-100 hover:bg-stone-200 text-stone-700 flex items-center justify-center font-bold cursor-pointer disabled:opacity-30"
                title="تصغير حجم خط الإضافات"
              >
                <Minus className="w-3 h-3" />
              </button>
              <span className="font-mono font-black text-xs text-[#E87524] px-1.5 py-0.5 bg-amber-50 rounded border border-amber-200">
                {currentSupplementsSize}px
              </span>
              <button
                type="button"
                onClick={() => handleSupplementSizeChange(currentSupplementsSize + 1)}
                disabled={currentSupplementsSize >= 24}
                className="w-5 h-5 rounded-md bg-stone-100 hover:bg-stone-200 text-stone-700 flex items-center justify-center font-bold cursor-pointer disabled:opacity-30"
                title="تكبير حجم خط الإضافات"
              >
                <Plus className="w-3 h-3" />
              </button>
              {/* أقراص سريعة */}
              <div className="hidden sm:flex items-center gap-1 mr-1 border-r border-stone-200 pr-1">
                {[10, 12.5, 15, 18].map(sz => (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => handleSupplementSizeChange(sz)}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold cursor-pointer transition-all ${
                      Math.abs(currentSupplementsSize - sz) < 0.5
                        ? 'bg-[#E87524] text-white shadow-2xs'
                        : 'bg-stone-50 hover:bg-stone-100 text-stone-600 border border-stone-200'
                    }`}
                  >
                    {sz}
                  </button>
                ))}
              </div>
              {/* عريض */}
              <label className="flex items-center gap-1 cursor-pointer mr-1 pl-1 border-r border-stone-200 text-[10.5px] font-bold text-stone-700">
                <input
                  type="checkbox"
                  checked={currentBoldSupplements}
                  onChange={handleBoldSupplementsToggle}
                  className="w-3.5 h-3.5 accent-[#E87524] rounded cursor-pointer"
                />
                <span>{language === 'ar' ? 'عريض' : 'Gras'}</span>
              </label>
            </div>

            {/* 2. زر فتح لوحة حذف / إظهار أقسام التيكيت */}
            <button
              type="button"
              onClick={() => setShowQuickCustomizer(!showQuickCustomizer)}
              className={`px-2.5 py-1 rounded-xl border text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs ${
                showQuickCustomizer
                  ? 'bg-[#E87524] text-white border-[#E87524]'
                  : 'bg-white hover:bg-orange-50/50 border-[#E9DCCB] text-stone-700'
              }`}
            >
              <Sliders className="w-3 h-3" />
              <span>{language === 'ar' ? 'حذف / إظهار أقسام' : 'Masquer / Afficher'}</span>
              {(previewTab === 'CLIENT' ? (customerConfig.hiddenBlocks || []).length : (kitchenConfig.hiddenBlocks || []).length) > 0 && (
                <span className={`px-1.5 py-0.2 rounded-full text-[9px] font-black ${
                  showQuickCustomizer ? 'bg-white text-[#E87524]' : 'bg-rose-500 text-white'
                }`}>
                  {language === 'ar'
                    ? `${previewTab === 'CLIENT' ? (customerConfig.hiddenBlocks || []).length : (kitchenConfig.hiddenBlocks || []).length} محذوف`
                    : `${previewTab === 'CLIENT' ? (customerConfig.hiddenBlocks || []).length : (kitchenConfig.hiddenBlocks || []).length} masqué`}
                </span>
              )}
              {showQuickCustomizer ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>

          {/* لوحة التحكم المنسدلة بالأقسام */}
          {showQuickCustomizer && (
            <div className="mt-2 pt-2 border-t border-[#E9DCCB]/80 space-y-2 animate-in fade-in duration-150">
              <div className="flex items-center justify-between text-[10.5px]">
                <span className="font-bold text-stone-700">
                  {language === 'ar'
                    ? (previewTab === 'CLIENT' ? 'انقر على أي قسم لحذفه أو إعادته للتيكيت :' : 'أقسام بون المطبخ (انقر للحذف أو الإظهار) :')
                    : 'Cliquer pour masquer ou afficher un bloc :'}
                </span>
                <span className="text-stone-400 text-[10px]">
                  {language === 'ar' ? 'تُحفظ الإعدادات تلقائياً' : 'Sauvegardé auto'}
                </span>
              </div>

              {previewTab === 'CLIENT' ? (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    {(customerConfig.blockOrder || DEFAULT_CUSTOMER_RECEIPT_BLOCK_ORDER).map(blockId => {
                      const isHidden = (customerConfig.hiddenBlocks || []).includes(blockId);
                      const info = CUSTOMER_BLOCK_LABELS[blockId] || { ar: blockId, fr: blockId };
                      return (
                        <button
                          key={blockId}
                          type="button"
                          onClick={() => handleToggleCustomerBlock(blockId)}
                          className={`p-1.5 rounded-lg border text-start text-[10.5px] font-bold flex items-center justify-between gap-1 transition-all cursor-pointer ${
                            isHidden
                              ? 'bg-rose-50/80 border-rose-300 text-rose-700 line-through opacity-75'
                              : 'bg-white border-emerald-300 text-stone-800 hover:border-orange-300'
                          }`}
                        >
                          <span className="truncate">{language === 'ar' ? info.ar : info.fr}</span>
                          {isHidden ? (
                            <EyeOff className="w-3 h-3 text-rose-500 shrink-0" />
                          ) : (
                            <Eye className="w-3 h-3 text-emerald-600 shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* خيارات تفصيلية سريعة */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[10px]">
                    <span className="text-stone-500 font-bold">{language === 'ar' ? 'عناصر إضافية:' : 'Options:'}</span>
                    <button
                      type="button"
                      onClick={() => handleToggleCustomerOption('showLogo')}
                      className={`px-2 py-0.5 rounded-md border font-bold cursor-pointer transition-colors ${
                        customerConfig.showLogo
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                          : 'bg-stone-100 border-stone-300 text-stone-500 line-through'
                      }`}
                    >
                      {customerConfig.showLogo ? '✓ الشعار' : '✗ الشعار'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleCustomerOption('showCutLine')}
                      className={`px-2 py-0.5 rounded-md border font-bold cursor-pointer transition-colors ${
                        customerConfig.showCutLine ?? true
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                          : 'bg-stone-100 border-stone-300 text-stone-500 line-through'
                      }`}
                    >
                      {(customerConfig.showCutLine ?? true) ? '✓ خط القص ✂' : '✗ خط القص ✂'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleCustomerOption('showItemSupplements')}
                      className={`px-2 py-0.5 rounded-md border font-bold cursor-pointer transition-colors ${
                        customerConfig.showItemSupplements
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                          : 'bg-stone-100 border-stone-300 text-stone-500 line-through'
                      }`}
                    >
                      {customerConfig.showItemSupplements ? '✓ الإضافات' : '✗ الإضافات'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleCustomerOption('showItemNotes')}
                      className={`px-2 py-0.5 rounded-md border font-bold cursor-pointer transition-colors ${
                        customerConfig.showItemNotes
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                          : 'bg-stone-100 border-stone-300 text-stone-500 line-through'
                      }`}
                    >
                      {customerConfig.showItemNotes ? '✓ الملاحظات' : '✗ الملاحظات'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleCustomerOption('showGrandTotal')}
                      className={`px-2 py-0.5 rounded-md border font-bold cursor-pointer transition-colors ${
                        customerConfig.showGrandTotal ?? true
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                          : 'bg-stone-100 border-stone-300 text-stone-500 line-through'
                      }`}
                    >
                      {(customerConfig.showGrandTotal ?? true) ? '✓ المجموع الكلي' : '✗ المجموع الكلي'}
                    </button>
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {(kitchenConfig.blockOrder || DEFAULT_KITCHEN_TICKET_BLOCK_ORDER).map(blockId => {
                    const isHidden = (kitchenConfig.hiddenBlocks || []).includes(blockId);
                    const info = KITCHEN_BLOCK_LABELS[blockId] || { ar: blockId, fr: blockId };
                    return (
                      <button
                        key={blockId}
                        type="button"
                        onClick={() => handleToggleKitchenBlock(blockId)}
                        className={`p-1.5 rounded-lg border text-start text-[10.5px] font-bold flex items-center justify-between gap-1 transition-all cursor-pointer ${
                          isHidden
                            ? 'bg-rose-50/80 border-rose-300 text-rose-700 line-through opacity-75'
                            : 'bg-white border-emerald-300 text-stone-800 hover:border-orange-300'
                        }`}
                      >
                        <span className="truncate">{language === 'ar' ? info.ar : info.fr}</span>
                        {isHidden ? (
                          <EyeOff className="w-3 h-3 text-rose-500 shrink-0" />
                        ) : (
                          <Eye className="w-3 h-3 text-emerald-600 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* VISUALISATION DU TICKET SÉLECTIONNÉ                                       */}
        {/* ========================================================================= */}
        <div className="flex-1 overflow-y-auto p-4 bg-stone-100 flex justify-center items-start">
          <div
            key={tplVersion}
            className={`bg-white border border-[#E9DCCB] shadow-sm p-3 rounded-xl transition-all ${
              previewTab === 'KITCHEN'
                ? (paperWidth === '58mm' ? 'w-[48mm] min-w-[190px]' : 'w-[68mm] min-w-[260px]')
                : (paperWidth === '58mm' ? 'w-[58mm] min-w-[220px]' : 'w-[80mm] min-w-[310px]')
            }`}
            dangerouslySetInnerHTML={{
              __html: previewTab === 'CLIENT'
                ? printerService.generateReceiptHtml(currentReceiptWithWidth)
                : printerService.generateKitchenTicketHtml(currentReceiptWithWidth)
            }}
          />
        </div>

        {/* ========================================================================= */}
        {/* CHOIX DE LA CIBLE D'IMPRESSION DIRECTE                                   */}
        {/* ========================================================================= */}
        <div className="px-4 py-2 border-t border-[#E9DCCB] bg-stone-50 flex items-center justify-between text-xs">
          <span className="font-bold text-stone-600 flex items-center gap-1">
            <Layers className="w-3.5 h-3.5 text-[#E87524]" />
            <span>{language === 'ar' ? 'التيكت المراد طباعته :' : 'Ticket à imprimer :'}</span>
          </span>
          <div className="flex items-center gap-1.5 font-bold text-[11px]">
            <button
              type="button"
              onClick={() => setPrintTarget('BOTH')}
              className={`px-2 py-1 rounded-lg border cursor-pointer transition-all ${
                printTarget === 'BOTH'
                  ? 'bg-[#FFF3EB] border-[#E87524] text-[#E87524]'
                  : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-100'
              }`}
            >
              {language === 'ar' ? 'كلا التيكتين (زبون + مطبخ)' : 'Les 2 Tickets'}
            </button>
            <button
              type="button"
              onClick={() => setPrintTarget('CLIENT')}
              className={`px-2 py-1 rounded-lg border cursor-pointer transition-all ${
                printTarget === 'CLIENT'
                  ? 'bg-[#FFF3EB] border-[#E87524] text-[#E87524]'
                  : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-100'
              }`}
            >
              {language === 'ar' ? 'الزبون فقط' : 'Client seul'}
            </button>
            <button
              type="button"
              onClick={() => setPrintTarget('KITCHEN')}
              className={`px-2 py-1 rounded-lg border cursor-pointer transition-all ${
                printTarget === 'KITCHEN'
                  ? 'bg-[#FFF3EB] border-[#E87524] text-[#E87524]'
                  : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-100'
              }`}
            >
              {language === 'ar' ? 'المطبخ فقط' : 'Chef seul'}
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* PIED DE MODAL & LES 3 BOUTONS D'ACTION CLAIRS                            */}
        {/* 1) Ne pas imprimer  2) Microsoft Print to PDF  3) Imprimer directement   */}
        {/* ========================================================================= */}
        <div className="p-3.5 border-t border-[#E9DCCB] bg-[#FFF8EF] flex flex-col sm:flex-row items-center justify-between gap-2">
          {/* BOUTON 1 : NE PAS IMPRIMER (QUITTER POUR NOUVELLE VENTE SANS IMPRESSION) */}
          <button
            type="button"
            onClick={handleClose}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-white hover:bg-rose-50 hover:text-rose-700 hover:border-rose-300 border border-[#E9DCCB] text-[#292522] font-bold text-xs transition-all flex items-center justify-center space-x-1.5 cursor-pointer active:scale-95 shadow-2xs"
            title="Fermer sans imprimer et démarrer une nouvelle commande"
          >
            <X className="w-4 h-4 text-rose-500" />
            <span>{language === 'ar' ? 'عدم الطباعة (إنهاء)' : 'Ne pas imprimer (Terminer)'}</span>
          </button>

          <div className="flex items-center space-x-2 w-full sm:w-auto">
            {/* BOUTON 2 : MICROSOFT PRINT TO PDF / PARAMÈTRES SPOULEUR SYSTÈME */}
            <button
              type="button"
              onClick={handleOpenSystemPrintDialog}
              className="flex-1 sm:flex-initial py-2.5 px-3.5 rounded-xl bg-white hover:bg-blue-50 border border-blue-200 text-blue-700 font-bold text-xs transition-all flex items-center justify-center space-x-1.5 cursor-pointer active:scale-95 shadow-2xs"
              title="Ouvrir le spouleur d'impression Windows / Microsoft Print to PDF"
            >
              <FileText className="w-4 h-4 text-blue-600" />
              <span>{language === 'ar' ? 'إعدادات الطباعة / PDF' : 'Spouleur Windows / PDF'}</span>
            </button>

            {/* BOUTON 3 : IMPRIMER DIRECTEMENT SUR L'IMPRIMANTE MATÉRIELLE THERMIQUE */}
            <button
              type="button"
              disabled={isPrinting}
              onClick={handleDirectPrint}
              className="flex-1 sm:flex-initial py-2.5 px-5 rounded-xl bg-[#E87524] hover:bg-[#D46317] text-white font-black text-xs transition-all shadow-sm flex items-center justify-center space-x-1.5 cursor-pointer active:scale-95 disabled:opacity-50"
              title="Imprimer directement sur l'imprimante thermique"
            >
              <Printer className={`w-4 h-4 ${isPrinting ? 'animate-bounce' : ''}`} />
              <span>
                {isPrinting
                  ? (language === 'ar' ? 'جاري الطباعة...' : 'Impression...')
                  : (language === 'ar' ? 'اطبع الآن' : 'Imprimer le ticket')}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
