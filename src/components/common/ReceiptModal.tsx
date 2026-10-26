// Aquadro POS Algérie V2 — Modal d'Aperçu & Impression du Ticket de Caisse
// Design sobre, blanc ERP, formatage ticket thermique 80mm/58mm et raccourcis clavier

import React, { useState, useEffect } from 'react';
import { printerService, ReceiptPrintData } from '../../services/printer.service';
import { CurrencyUtil } from '../../core/currency/currency';
import { useI18n } from '../../i18n';
import {
  Printer,
  CheckCircle,
  X,
  FileText,
  RotateCcw,
  SlidersHorizontal,
  CookingPot,
  Receipt
} from 'lucide-react';

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
  const { t, language } = useI18n();
  const [paperWidth, setPaperWidth] = useState<'58mm' | '80mm'>('80mm');
  const [autoPrint, setAutoPrint] = useState<boolean>(true);
  const [previewTab, setPreviewTab] = useState<'CLIENT' | 'KITCHEN'>('CLIENT');
  const [isPrinting, setIsPrinting] = useState<boolean>(false);
  const [printFeedback, setPrintFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    const cfg = printerService.getConfig();
    setPaperWidth(cfg.paperWidth || '80mm');
    setAutoPrint(cfg.autoPrint !== false);
  }, [isOpen]);

  // Écoute clavier (Entrée pour imprimer, Échap pour nouvelle vente / fermer)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handlePrintBoth();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, receiptData, paperWidth]);

  if (!isOpen || !receiptData) return null;

  const currentReceiptWithWidth: ReceiptPrintData = {
    ...receiptData,
    paperWidth
  };

  const handlePrintBoth = async () => {
    try {
      setIsPrinting(true);
      setPrintFeedback(null);
      await printerService.printBothTickets(currentReceiptWithWidth, true);
      setPrintFeedback({
        message: language === 'ar' ? 'تم إرسال التيكت المزدوج (الزبون + الطباخ) للطباعة بنجاح !' : 'Tickets Client et Cuisine envoyés à l\'impression !',
        type: 'success'
      });
    } catch (err: any) {
      setPrintFeedback({
        message: language === 'ar' ? `خطأ أثناء الطباعة: ${err?.message || err}` : `Erreur d'impression : ${err?.message || err}`,
        type: 'error'
      });
    } finally {
      setIsPrinting(false);
    }
  };

  const handlePrintSingle = async () => {
    try {
      setIsPrinting(true);
      setPrintFeedback(null);
      if (previewTab === 'KITCHEN') {
        await printerService.printKitchenTicket(currentReceiptWithWidth, true);
        setPrintFeedback({
          message: language === 'ar' ? 'تم إرسال بون المطبخ (الطباخ) للطباعة بنجاح !' : 'Bon de Cuisine envoyé à l\'impression !',
          type: 'success'
        });
      } else {
        await printerService.printReceipt(currentReceiptWithWidth, true);
        setPrintFeedback({
          message: language === 'ar' ? 'تم إرسال تيكت الزبون للطباعة بنجاح !' : 'Ticket Client envoyé à l\'impression !',
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

  const handlePaperWidthChange = (width: '58mm' | '80mm') => {
    setPaperWidth(width);
    const cfg = printerService.getConfig();
    printerService.saveConfig({ ...cfg, paperWidth: width });
  };

  const handleAutoPrintToggle = (checked: boolean) => {
    setAutoPrint(checked);
    const cfg = printerService.getConfig();
    printerService.saveConfig({ ...cfg, autoPrint: checked });
  };

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
            <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-[#292522] text-sm">
                  {language === 'ar' ? 'تم تسجيل الطلب وتجهيز التيكت' : 'Commande Validée & Prête'}
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
            title="Fermer (Échap)"
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
              <Printer className="w-3.5 h-3.5" />
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
              <span>Ticket Client (Reçu)</span>
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
              <span>Bon Cuisine (Pizzaiolo)</span>
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
        {/* VISUALISATION DU TICKET SÉLECTIONNÉ                                       */}
        {/* ========================================================================= */}
        <div className="flex-1 overflow-y-auto p-4 bg-stone-100 flex justify-center items-start">
          <div
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
        {/* PIED DE MODAL & ACTIONS D'IMPRESSION DÉDIÉES                              */}
        {/* ========================================================================= */}
        <div className="p-3.5 border-t border-[#E9DCCB] bg-[#FFF8EF] flex flex-col sm:flex-row items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleClose}
            className="w-full sm:w-auto px-4 py-2 rounded-xl bg-white hover:bg-stone-100 border border-[#E9DCCB] text-[#292522] font-bold text-xs transition-colors flex items-center justify-center space-x-1.5 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Nouvelle Vente (Échap)</span>
          </button>

          <div className="flex items-center space-x-2 w-full sm:w-auto">
            <button
              type="button"
              disabled={isPrinting}
              onClick={handlePrintSingle}
              className="flex-1 sm:flex-initial py-2 px-3 rounded-xl bg-white hover:bg-stone-100 border border-[#E9DCCB] text-stone-700 font-bold text-xs transition-colors flex items-center justify-center space-x-1 cursor-pointer disabled:opacity-50"
              title="Imprimer uniquement le ticket affiché"
            >
              <Printer className={`w-3.5 h-3.5 ${isPrinting ? 'animate-bounce' : ''}`} />
              <span>{previewTab === 'CLIENT' ? 'Reçu Seul' : 'Bon Cuisine Seul'}</span>
            </button>

            <button
              type="button"
              disabled={isPrinting}
              onClick={handlePrintBoth}
              className="flex-1 sm:flex-initial py-2 px-4 rounded-xl bg-[#E87524] hover:bg-[#D46317] text-white font-black text-xs transition-colors shadow-sm flex items-center justify-center space-x-1.5 cursor-pointer active:scale-95 disabled:opacity-50"
              title="Imprimer le Ticket Client ET le Bon Cuisine pour le Chef"
            >
              <Printer className={`w-4 h-4 ${isPrinting ? 'animate-bounce' : ''}`} />
              <span>{isPrinting ? (language === 'ar' ? 'جاري الإرسال للطباعة...' : 'Impression en cours...') : (language === 'ar' ? 'طباعة التيكتين (الزبون + الطباخ)' : 'Imprimer les 2 Tickets (Client + Chef)')}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
