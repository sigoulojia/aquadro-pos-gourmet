// Aquadro POS Algérie V2 — Service d'Impression Thermique (58mm & 80mm ESC/POS)
// Formatage conforme au commerce algérien, mentions DGI, et impulsion tiroir-caisse RJ11

import { CurrencyUtil } from '../core/currency/currency';
import { ZReportSummary } from './caisse.service';
import { drawerLogService } from './drawerLog.service';
import html2canvas from 'html2canvas';

export interface PrinterConfig {
  paperWidth: '58mm' | '80mm';
  autoPrint: boolean;
  openDrawerOnSale: boolean;
  cutterEnabled?: boolean;
}

export interface ReceiptPrintData {
  storeName?: string;
  storeNameFr?: string;
  storeNameAr?: string;
  storeAddress?: string;
  storePhone?: string;
  rcNumber?: string;
  nifNumber?: string;
  nisNumber?: string;
  aiNumber?: string;
  fiscalRegime?: 'IFU' | 'REEL';
  receiptNumber: string;
  dailyOrderNumber?: number | string;
  dateTime: string;
  cashierName: string;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  driverName?: string;
  orderType?: 'SUR_PLACE' | 'A_EMPORTER' | 'LIVRAISON' | string;
  tableNumber?: string;
  deliveryFee?: number;
  notes?: string;
  customerNotes?: string;
  items: Array<{
    name: string;
    variant?: string;
    quantity: number;
    unitPrice: number;
    discount?: number;
    total: number;
    ingredients?: string[];
    supplements?: Array<{ id: string; name_fr: string; price: number } | string>;
    multiParts?: {
      type: '2_PARTS' | '4_PARTS';
      parts: Array<{ name: string; price: number; ingredients?: string[] }>;
    };
    notes?: string;
  }>;
  subtotal?: number;
  subtotalHT?: number;
  discountTotal?: number;
  taxAmount?: number;
  taxRate?: number;
  totalTTC?: number;
  grandTotal?: number;
  paymentMethod?: string;
  payments?: Array<{ method: string; amount: number; tendered?: number; change?: number }>;
  tenderedAmount?: number;
  changeGiven?: number;
  footerMessage?: string;
  paperWidth?: '58mm' | '80mm';
}

export type CustomerReceiptBlock =
  | 'header'
  | 'order_banner'
  | 'order_info'
  | 'items'
  | 'subtotals'
  | 'total'
  | 'payment'
  | 'footer';

export interface ReceiptTemplateConfig {
  blockOrder: CustomerReceiptBlock[];
  hiddenBlocks?: CustomerReceiptBlock[]; // Blocs masqués ou supprimés du ticket

  // 1. Dimensions, Marges & Débit Papier
  paperWidth: '58mm' | '80mm';
  paddingX?: number; // 0 à 16px
  feedTopLines?: number; // 0 à 3
  feedBottomLines?: number; // 1 à 6
  lineHeight?: 'compact' | 'normal' | 'relaxed';
  fontScale: 'compact' | 'normal' | 'large';

  // 2. En-tête & Identité Magasin
  showHeaderTitle?: boolean;
  headerTitle: string;
  headerSubtitle?: string;
  showHeaderSubtitle?: boolean;
  headerAlignment: 'center' | 'left' | 'right';
  showStoreNameFr: boolean;
  showStoreNameAr: boolean;
  customStoreNameAr?: string;
  showLogo: boolean;
  logoHeight?: number; // 30 à 90px
  logoGrayscale?: boolean;
  logoAlignment?: 'left' | 'center' | 'right';
  showPhone: boolean;
  customPhone: string;
  customPhone2?: string;
  showAddress: boolean;
  customAddress: string;
  showSocials: boolean;
  socialsText: string;
  showWifi: boolean;
  wifiText: string;
  showWelcomeMessage?: boolean;
  headerWelcomeMessage?: string;
  showFiscalInfo?: boolean;
  customRc?: string;
  customNif?: string;
  customNis?: string;
  customAi?: string;

  // 3. Bannière & Infos de Commande
  showOrderNumber: boolean;
  orderNumberPrefix?: string;
  orderNumberSize: 'normal' | 'large' | 'giant';
  orderNumberStyle: 'bordered' | 'clean' | 'banner' | 'badge';
  showOrderType: boolean;
  showTableNumber?: boolean;
  showDateTime: boolean;
  dateTimeFormat?: 'datetime' | 'date_only' | 'time_only';
  showCashier: boolean;
  cashierLabel?: string;
  showCustomer: boolean;
  showCustomerPhone?: boolean;
  showCustomerAddress?: boolean;

  // 4. Articles, Pizzeria & Lignes de Vente
  showItemTableHeader?: boolean;
  showItemUnitPrices: boolean;
  showItemVariants?: boolean;
  showItemSupplements: boolean;
  showItemNotes: boolean;
  showItemParts: boolean;
  showPartsIngredients?: boolean;
  showBaseIngredients?: boolean;
  ingredientsStyle?: 'italic' | 'bullets' | 'parentheses';
  itemsSeparatorStyle: 'dashed' | 'solid' | 'dotted' | 'double' | 'none';
  currencySymbol?: 'DZD' | 'دج' | 'DA';
  currencyPosition?: 'after' | 'before';

  // 5. Totaux, Remises & Règlements
  showSubtotal?: boolean;
  subtotalLabel?: string;
  showDeliveryFee: boolean;
  deliveryFeeLabel?: string;
  showDiscount: boolean;
  discountLabel?: string;
  showTax: boolean;
  taxLabel?: string;
  showGrandTotal?: boolean;
  totalStyle?: 'banner_dark' | 'double_bordered' | 'standard';
  showPaymentMethod: boolean;
  paymentMethodLabel?: string;
  showTenderedAndChange: boolean;

  // 6. Pied de ticket, QR Code, Barcode & Messages
  showFooterLines?: boolean;
  footerLine1: string;
  footerLine2: string;
  footerLine3: string;
  footerLine4?: string;
  showFooterPolicy?: boolean;
  footerPolicy?: string;
  footerAlignment: 'center' | 'left' | 'right';
  showQrCode?: boolean;
  qrCodeType?: 'menu_url' | 'store_url' | 'wifi' | 'fiscal_data' | 'custom';
  qrCustomText?: string;
  qrCodeSize?: number;
  showBarcode: boolean;
  barcodeText: string;
  showThankYouMessageAr?: boolean;
  thankYouMessageAr?: string;
  showWatermark?: boolean;
  showCutLine?: boolean;

  // 7. Tailles de polices granulaires (en pixels)
  baseFontSize: number;
  headerTitleFontSize: number;
  headerSubtitleFontSize?: number;
  orderNumberFontSize: number;
  itemTitleFontSize: number;
  supplementsFontSize?: number; // 8 à 24px - Personnalisable pour lisibilité parfaite
  boldSupplements?: boolean; // Gras intense pour imprimantes thermiques
  supplementsHighlight?: 'standard' | 'boxed' | 'underline' | 'badge'; // Mise en valeur
  supplementsPriceDisplay?: boolean;
  totalPriceFontSize: number;
  notesFontSize: number;
  footerFontSize: number;

  boldItemNames: boolean;
  boldOrderNumber: boolean;
  boldTotals: boolean;

  // 8. Options avancées Pizzeria
  ticketBorder?: 'none' | 'outer_border' | 'dashed_box';
  orderNumberFormat?: 'clean' | 'receipt' | 'both' | 'number_only' | 'prefix_only';
  showTotalItemsCount?: boolean;
  totalItemsCountLabel?: string;
  totalLabelCustom?: string;
}

export const DEFAULT_CUSTOMER_RECEIPT_BLOCK_ORDER: CustomerReceiptBlock[] = [
  'header',
  'order_banner',
  'order_info',
  'items',
  'subtotals',
  'total',
  'payment',
  'footer'
];

export const DEFAULT_RECEIPT_TEMPLATE_CONFIG: ReceiptTemplateConfig = {
  blockOrder: DEFAULT_CUSTOMER_RECEIPT_BLOCK_ORDER,
  hiddenBlocks: [],

  // 1. Dimensions
  paperWidth: '80mm',
  paddingX: 4,
  feedTopLines: 0,
  feedBottomLines: 2,
  lineHeight: 'normal',
  fontScale: 'normal',

  // 2. En-tête
  showHeaderTitle: true,
  headerTitle: 'AQUADRO',
  headerSubtitle: 'Pizzeria & Fast-Food Gourmet',
  showHeaderSubtitle: true,
  headerAlignment: 'center',
  showStoreNameFr: true,
  showStoreNameAr: true,
  customStoreNameAr: '',
  showLogo: true,
  logoHeight: 52,
  logoGrayscale: false,
  logoAlignment: 'center',
  showPhone: true,
  customPhone: '',
  customPhone2: '',
  showAddress: true,
  customAddress: '',
  showSocials: false,
  socialsText: '@aquadro_pizza',
  showWifi: false,
  wifiText: 'Wi-Fi: Aquadro • Code: pizza2026',
  showWelcomeMessage: true,
  headerWelcomeMessage: 'أهلاً وسهلاً بكم • Bienvenue chez nous',
  showFiscalInfo: false,
  customRc: '',
  customNif: '',
  customNis: '',
  customAi: '',

  // 3. Commande
  showOrderNumber: true,
  orderNumberPrefix: 'COMMANDE #',
  orderNumberSize: 'large',
  orderNumberStyle: 'banner',
  showOrderType: true,
  showTableNumber: false,
  showDateTime: true,
  dateTimeFormat: 'datetime',
  showCashier: true,
  cashierLabel: 'Caissier',
  showCustomer: true,
  showCustomerPhone: true,
  showCustomerAddress: true,

  // 4. Articles
  showItemTableHeader: true,
  showItemUnitPrices: true,
  showItemVariants: true,
  showItemSupplements: true,
  showItemNotes: true,
  showItemParts: true,
  showPartsIngredients: true,
  showBaseIngredients: true,
  ingredientsStyle: 'italic',
  itemsSeparatorStyle: 'dashed',
  currencySymbol: 'DZD',
  currencyPosition: 'after',

  // 5. Totaux
  showSubtotal: true,
  subtotalLabel: 'Sous-total brut',
  showDeliveryFee: true,
  deliveryFeeLabel: 'Frais de livraison',
  showDiscount: true,
  discountLabel: 'Remise déduite',
  showTax: false,
  taxLabel: 'TVA DGI',
  showGrandTotal: true,
  totalStyle: 'banner_dark',
  showPaymentMethod: true,
  paymentMethodLabel: 'Mode de règlement',
  showTenderedAndChange: true,

  // 6. Pied & QR
  showFooterLines: true,
  footerLine1: 'Merci pour votre visite !',
  footerLine2: 'À bientôt • Aquadro POS Gourmet',
  footerLine3: 'شكراً لزيارتكم ونسعد بخدمتكم دائماً',
  footerLine4: 'Service client disponible 7j/7',
  showFooterPolicy: true,
  footerPolicy: 'Les réclamations sont acceptées dans un délai de 30 min',
  footerAlignment: 'center',
  showQrCode: false,
  qrCodeType: 'menu_url',
  qrCustomText: 'https://aquadro-pos.dz',
  qrCodeSize: 90,
  showBarcode: false,
  barcodeText: '',
  showThankYouMessageAr: true,
  thankYouMessageAr: 'شكراً لزيارتكم ونسعد بخدمتكم دائماً',

  // 7. Typographie
  baseFontSize: 11,
  headerTitleFontSize: 19,
  headerSubtitleFontSize: 10,
  orderNumberFontSize: 20,
  itemTitleFontSize: 11,
  supplementsFontSize: 12, // Net et bien lisible par défaut
  boldSupplements: true,
  supplementsHighlight: 'standard',
  supplementsPriceDisplay: true,
  totalPriceFontSize: 14,
  notesFontSize: 9.5,
  footerFontSize: 9.5,

  boldItemNames: true,
  boldOrderNumber: true,
  boldTotals: true,

  // 8. Options avancées Pizzeria
  ticketBorder: 'none',
  orderNumberFormat: 'clean',
  showTotalItemsCount: true,
  totalItemsCountLabel: "Nombre d'articles",
  totalLabelCustom: 'TOTAL À PAYER :',
  showWatermark: true,
  showCutLine: true,
};

export type KitchenTicketBlock =
  | 'header'
  | 'order_banner'
  | 'service_info'
  | 'items'
  | 'notes'
  | 'footer';

export interface KitchenTicketTemplateConfig {
  blockOrder: KitchenTicketBlock[];
  hiddenBlocks?: KitchenTicketBlock[]; // Blocs masqués ou supprimés du bon cuisine

  headerTitle: string;
  headerAlignment: 'center' | 'left' | 'right';
  showTicketTitle: boolean;

  showOrderNumber: boolean;
  orderNumberStyle: 'bordered' | 'clean' | 'banner';
  showOrderType: boolean;

  showDateTime: boolean;
  showCashierOrServer: boolean;
  showCustomerInfo: boolean;

  itemQuantityStyle: 'large_text' | 'badge' | 'compact';
  showMultiPartPizzas: boolean;
  showSupplements: boolean;
  supplementsHighlight: 'boxed' | 'underline' | 'bold_only';
  boldSupplements?: boolean;
  showCookingNotes: boolean;
  notesHighlight: 'boxed' | 'italic' | 'colored_badge';
  itemSeparatorStyle: 'solid' | 'dashed' | 'double' | 'none';

  // Tailles de polices granulaires pour le Chef (en pixels)
  baseFontSize: number;
  headerTitleFontSize: number;
  orderNumberFontSize: number;
  orderTypeFontSize: number;
  itemQuantityFontSize: number;
  itemTitleFontSize: number;
  supplementsFontSize: number; // 9 à 28px
  cookingNotesFontSize: number;
  serviceInfoFontSize: number;

  boldItemNames: boolean;
  boldQuantities: boolean;
  uppercaseItemNames: boolean;

  paperWidth: '58mm' | '80mm';
  bottomSpacingLines: number;

  // Options avancées Chef & Pizzaiolo
  chefHeaderStyle?: 'box' | 'banner_dark' | 'double_line' | 'minimal' | 'banner' | 'clean' | 'bordered';
  showTableNumberProminent?: boolean;
  tableNumberFontSize?: number;
  tableNumberLabel?: string;
  showOrderTimeElapsed?: boolean;
  showReprintIndicator?: boolean;
  showGeneralOrderNotes?: boolean;
  generalNotesFontSize?: number;
  showBaseIngredientsInKitchen?: boolean;
  kitchenTicketBorder?: 'none' | 'outer_border' | 'dashed_box';
}

export const DEFAULT_KITCHEN_TICKET_BLOCK_ORDER: KitchenTicketBlock[] = [
  'header',
  'order_banner',
  'service_info',
  'items',
  'notes',
  'footer'
];

export const DEFAULT_KITCHEN_TICKET_TEMPLATE_CONFIG: KitchenTicketTemplateConfig = {
  blockOrder: DEFAULT_KITCHEN_TICKET_BLOCK_ORDER,
  hiddenBlocks: ['footer'], // حذف تذييل البون الفارغ افتراضياً
  headerTitle: 'BON DE CUISINE • PIZZAIOLO',
  headerAlignment: 'center',
  showTicketTitle: true,

  showOrderNumber: true,
  orderNumberStyle: 'bordered',
  showOrderType: true,

  showDateTime: true,
  showCashierOrServer: true,
  showCustomerInfo: true,

  itemQuantityStyle: 'large_text',
  showMultiPartPizzas: true,
  showSupplements: true,
  supplementsHighlight: 'boxed',
  boldSupplements: true,
  showCookingNotes: true,
  notesHighlight: 'boxed',
  itemSeparatorStyle: 'solid',

  baseFontSize: 11,
  headerTitleFontSize: 10,
  orderNumberFontSize: 24,
  orderTypeFontSize: 12,
  itemQuantityFontSize: 16,
  itemTitleFontSize: 13.5,
  supplementsFontSize: 12.5,
  cookingNotesFontSize: 9.5,
  serviceInfoFontSize: 9.5,

  boldItemNames: true,
  boldQuantities: true,
  uppercaseItemNames: true,

  paperWidth: '80mm',
  bottomSpacingLines: 1,

  // Options avancées Chef & Pizzaiolo
  chefHeaderStyle: 'banner_dark',
  showTableNumberProminent: false,
  tableNumberFontSize: 24,
  tableNumberLabel: 'TABLE',
  showOrderTimeElapsed: true,
  showReprintIndicator: true,
  showGeneralOrderNotes: true,
  generalNotesFontSize: 11,
  showBaseIngredientsInKitchen: true,
  kitchenTicketBorder: 'none'
};

export class PrinterService {
  private static instance: PrinterService;
  private lastReceiptData: ReceiptPrintData | null = null;

  private constructor() { }

  public static getInstance(): PrinterService {
    if (!PrinterService.instance) {
      PrinterService.instance = new PrinterService();
    }
    return PrinterService.instance;
  }

  public getTemplateConfig(): ReceiptTemplateConfig {
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('aquadro_receipt_template_config');
        if (raw) {
          const parsed = JSON.parse(raw);
          const rawBlockOrder: CustomerReceiptBlock[] = parsed.blockOrder && Array.isArray(parsed.blockOrder)
            ? [...parsed.blockOrder]
            : [...DEFAULT_CUSTOMER_RECEIPT_BLOCK_ORDER];

          // Auto-migration for legacy templates without 'payment' block when hiddenBlocks was not yet introduced
          if (parsed.hiddenBlocks === undefined && !rawBlockOrder.includes('payment')) {
            const fIdx = rawBlockOrder.indexOf('footer');
            if (fIdx !== -1) rawBlockOrder.splice(fIdx, 0, 'payment');
            else rawBlockOrder.push('payment');
          }

          return {
            ...DEFAULT_RECEIPT_TEMPLATE_CONFIG,
            ...parsed,
            blockOrder: rawBlockOrder,
            hiddenBlocks: Array.isArray(parsed.hiddenBlocks) ? parsed.hiddenBlocks : []
          };
        }
      } catch (e) { }
    }
    return { ...DEFAULT_RECEIPT_TEMPLATE_CONFIG };
  }

  public saveTemplateConfig(config: ReceiptTemplateConfig): void {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('aquadro_receipt_template_config', JSON.stringify(config));
        // Synchroniser également la largeur papier
        const pCfg = this.getConfig();
        if (config.paperWidth && config.paperWidth !== pCfg.paperWidth) {
          this.saveConfig({ ...pCfg, paperWidth: config.paperWidth });
        }
      } catch (e) { }
    }
  }

  public resetTemplateConfig(): ReceiptTemplateConfig {
    this.saveTemplateConfig({ ...DEFAULT_RECEIPT_TEMPLATE_CONFIG });
    return { ...DEFAULT_RECEIPT_TEMPLATE_CONFIG };
  }

  public getKitchenTemplateConfig(): KitchenTicketTemplateConfig {
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('aquadro_kitchen_ticket_template_config');
        if (raw) {
          const parsed = JSON.parse(raw);
          return {
            ...DEFAULT_KITCHEN_TICKET_TEMPLATE_CONFIG,
            ...parsed,
            blockOrder: parsed.blockOrder && Array.isArray(parsed.blockOrder) && parsed.blockOrder.length > 0
              ? parsed.blockOrder
              : DEFAULT_KITCHEN_TICKET_BLOCK_ORDER,
            hiddenBlocks: Array.isArray(parsed.hiddenBlocks) ? parsed.hiddenBlocks : []
          };
        }
      } catch (e) { }
    }
    return { ...DEFAULT_KITCHEN_TICKET_TEMPLATE_CONFIG };
  }

  public saveKitchenTemplateConfig(config: KitchenTicketTemplateConfig): void {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('aquadro_kitchen_ticket_template_config', JSON.stringify(config));
      } catch (e) { }
    }
  }

  public resetKitchenTemplateConfig(): KitchenTicketTemplateConfig {
    this.saveKitchenTemplateConfig({ ...DEFAULT_KITCHEN_TICKET_TEMPLATE_CONFIG });
    return { ...DEFAULT_KITCHEN_TICKET_TEMPLATE_CONFIG };
  }

  public getConfig(): PrinterConfig {
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('aquadro_printer_config');
        if (raw) {
          const parsed = JSON.parse(raw);
          return {
            paperWidth: '80mm',
            autoPrint: true,
            openDrawerOnSale: true,
            ...parsed,
            cutterEnabled: parsed.cutterEnabled !== undefined ? Boolean(parsed.cutterEnabled) : true
          };
        }
      } catch (e) { }
    }
    return {
      paperWidth: '80mm',
      autoPrint: true,
      openDrawerOnSale: true,
      cutterEnabled: true
    };
  }

  public saveConfig(config: PrinterConfig): void {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('aquadro_printer_config', JSON.stringify(config));
      } catch (e) { }
    }
  }

  public getLastReceipt(): ReceiptPrintData | null {
    if (this.lastReceiptData) return this.lastReceiptData;
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('aquadro_last_receipt');
        if (raw) {
          this.lastReceiptData = JSON.parse(raw);
          return this.lastReceiptData;
        }
      } catch (e) { }
    }
    return null;
  }

  // Archivage automatique pour réimpression fidèle depuis l'historique des ventes
  public archiveReceipt(data: ReceiptPrintData): void {
    if (!data) return;
    this.lastReceiptData = data;
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('aquadro_last_receipt', JSON.stringify(data));
        if (data.receiptNumber) {
          localStorage.setItem(`aquadro_receipt_${data.receiptNumber}`, JSON.stringify(data));
        }
        if ((data as any).saleId) {
          localStorage.setItem(`aquadro_receipt_sale_${(data as any).saleId}`, JSON.stringify(data));
        }
        const histRaw = localStorage.getItem('aquadro_receipts_history');
        const history: Record<string, ReceiptPrintData> = histRaw ? JSON.parse(histRaw) : {};
        if (data.receiptNumber) {
          history[data.receiptNumber] = data;
        }
        if ((data as any).saleId) {
          history[(data as any).saleId] = data;
        }
        const keys = Object.keys(history);
        if (keys.length > 200) {
          delete history[keys[0]];
        }
        localStorage.setItem('aquadro_receipts_history', JSON.stringify(history));
      } catch (e) { }
    }
  }

  // Récupération du reçu original avec tous ses suppléments et recettes
  public getArchivedReceipt(key: string): ReceiptPrintData | null {
    if (!key) return null;
    if (typeof window !== 'undefined') {
      try {
        const byRec = localStorage.getItem(`aquadro_receipt_${key}`);
        if (byRec) return JSON.parse(byRec);

        const bySale = localStorage.getItem(`aquadro_receipt_sale_${key}`);
        if (bySale) return JSON.parse(bySale);

        const histRaw = localStorage.getItem('aquadro_receipts_history');
        if (histRaw) {
          const history: Record<string, ReceiptPrintData> = JSON.parse(histRaw);
          if (history[key]) return history[key];
          for (const [k, v] of Object.entries(history)) {
            if (k.includes(key) || key.includes(k) || (v as any).saleId === key) {
              return v;
            }
          }
        }
      } catch (e) { }
    }
    return null;
  }

  public generateTextReceipt(data: ReceiptPrintData): string {
    return this.generateReceiptText(data);
  }

  // Helpers pour garantir un numéro de commande et de reçu propre et jamais "undefined"
  public getCleanOrderNumber(dailyNum: any, receiptNum: any): string {
    if (dailyNum !== undefined && dailyNum !== null) {
      const s = String(dailyNum).trim();
      if (s && s !== 'undefined' && s !== 'null' && s !== 'NaN') {
        return s.replace(/^#+/, '');
      }
    }
    if (receiptNum !== undefined && receiptNum !== null) {
      const s = String(receiptNum).trim();
      if (s && s !== 'undefined' && s !== 'null' && s !== 'NaN') {
        const match = s.match(/(\d+)$/);
        if (match) return parseInt(match[1], 10).toString();
        return s.replace(/^TK-|^REC-/, '');
      }
    }
    return '1';
  }

  public getCleanReceiptNumber(receiptNum: any, dailyNum: string): string {
    if (receiptNum !== undefined && receiptNum !== null) {
      const s = String(receiptNum).trim();
      if (s && s !== 'undefined' && s !== 'null' && s !== 'NaN') {
        return s;
      }
    }
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return `TK-${today}-${dailyNum}`;
  }

  // Normalisation du mode de commande : SUR PLACE, À EMPORTER ou LIVRAISON (sans numéro de table)
  public getOrderTypeLabel(orderType?: string): 'SUR PLACE' | 'À EMPORTER' | 'LIVRAISON' {
    const raw = String(orderType || '').toUpperCase().trim();
    if (raw.includes('LIVRAISON') || raw.includes('DELIVERY')) {
      return 'LIVRAISON';
    }
    if (raw.includes('EMPORTER') || raw.includes('TAKEAWAY') || raw.includes('TAKE_AWAY') || raw.includes('A_EMPORTER')) {
      return 'À EMPORTER';
    }
    return 'SUR PLACE';
  }

  // Génération du texte formaté pour ticket de caisse Client (ESC/POS épuré et lisible)
  public generateReceiptText(data: ReceiptPrintData, customConfig?: ReceiptTemplateConfig): string {
    const tpl = customConfig || this.getTemplateConfig();
    const is80 = (data.paperWidth || tpl.paperWidth || this.getConfig().paperWidth) !== '58mm';
    const cols = is80 ? 44 : 32;

    const center = (str: string) => {
      const pad = Math.max(0, Math.floor((cols - str.length) / 2));
      return ' '.repeat(pad) + str;
    };

    const separator = '='.repeat(cols);
    const line = '-'.repeat(cols);

    const twoCols = (left: string, right: string) => {
      const spaces = Math.max(1, cols - left.length - right.length);
      return left + ' '.repeat(spaces) + right;
    };

    const out: string[] = [];

    const orderNumClean = this.getCleanOrderNumber(data.dailyOrderNumber, data.receiptNumber);
    const receiptNumClean = this.getCleanReceiptNumber(data.receiptNumber, orderNumClean);

    // 1. En-tête : Titre principal personnalisé
    if (tpl.headerTitle) {
      out.push(center(tpl.headerTitle.toUpperCase()));
    }
    const storeFr = data.storeNameFr || data.storeName;
    if (tpl.showStoreNameFr && storeFr && !storeFr.toUpperCase().includes((tpl.headerTitle || 'AQUADRO').toUpperCase())) {
      out.push(center(storeFr));
    }
    const storePhone = tpl.customPhone || data.storePhone;
    if (tpl.showPhone && storePhone) out.push(center(`Tél : ${storePhone}`));
    const storeAddress = tpl.customAddress || data.storeAddress;
    if (tpl.showAddress && storeAddress) out.push(center(storeAddress));
    if (tpl.showSocials && tpl.socialsText) out.push(center(tpl.socialsText));
    if (tpl.showWifi && tpl.wifiText) out.push(center(tpl.wifiText));

    out.push(line);

    // 2. Numéro de commande, Mode de commande et Date
    if (tpl.showOrderNumber) {
      out.push(center(`COMMANDE N° ${orderNumClean}`));
    }
    const orderTypeLabel = this.getOrderTypeLabel(data.orderType);
    if (tpl.showOrderType) {
      out.push(center(`>>> ${orderTypeLabel} <<<`));
    }
    if (tpl.showDateTime) {
      out.push(twoCols(`Ticket : ${receiptNumClean}`, `Date : ${data.dateTime}`));
    }
    if (tpl.showCashier && data.cashierName) {
      out.push(`Caissier : ${data.cashierName}`);
    }

    if (tpl.showCustomer && orderTypeLabel === 'LIVRAISON' && data.customerName) {
      out.push(`Client : ${data.customerName}${data.customerPhone ? ' (' + data.customerPhone + ')' : ''}`);
      if (data.customerAddress) {
        out.push(`Adresse : ${data.customerAddress}`);
      }
    }

    out.push(separator);

    // 3. Articles commandés
    out.push(twoCols('Article', 'Total'));
    out.push(line);

    for (const item of data.items) {
      const itemTitle = `${item.quantity}x ${(item.name || '').toUpperCase()}${item.variant ? ` (${item.variant})` : ''}`;
      const totalStr = CurrencyUtil.formatDZD(item.total);
      out.push(twoCols(itemTitle, totalStr));

      if (tpl.showItemUnitPrices && item.quantity > 1) {
        out.push(`  (${item.quantity} x ${CurrencyUtil.formatDZD(item.unitPrice)})`);
      }

      if (tpl.showItemParts && item.multiParts && item.multiParts.parts) {
        item.multiParts.parts.forEach((p, idx) => {
          out.push(`  • Partie ${idx + 1} : ${p.name}`);
        });
      }

      if (tpl.showItemSupplements && item.supplements && item.supplements.length > 0) {
        const supps = item.supplements
          .map(s => (typeof s === 'string' ? s : `${s.name_fr} (+${CurrencyUtil.formatDZD(s.price)})`))
          .join(', ');
        out.push(`  + Supplément : ${supps}`);
      }

      if (tpl.showItemNotes && item.notes) {
        out.push(`  Note : ${item.notes}`);
      }
    }

    if (tpl.showDeliveryFee && data.deliveryFee && data.deliveryFee > 0) {
      out.push(line);
      out.push(twoCols('Frais de livraison :', CurrencyUtil.formatDZD(data.deliveryFee)));
    }

    if (tpl.showDiscount && data.discountTotal && data.discountTotal > 0) {
      out.push(twoCols('Remise :', `-${CurrencyUtil.formatDZD(data.discountTotal)}`));
    }

    if (tpl.showTax && data.taxAmount && data.taxAmount > 0) {
      out.push(twoCols(`TVA (${((data.taxRate || 0) * 100).toFixed(0)}%) :`, CurrencyUtil.formatDZD(data.taxAmount)));
    }

    out.push(separator);

    // 4. Montant net à payer
    const totalTTC = data.totalTTC ?? data.grandTotal ?? 0;
    out.push(twoCols('TOTAL À PAYER :', CurrencyUtil.formatDZD(totalTTC)));

    // 5. Règlements
    if (tpl.showPaymentMethod) {
      const paymentMethod = data.paymentMethod || data.payments?.[0]?.method || 'CASH';
      const tenderedAmount = data.tenderedAmount ?? data.payments?.[0]?.tendered ?? totalTTC;
      const changeGiven = data.changeGiven ?? data.payments?.[0]?.change ?? 0;

      const paymentLabel = paymentMethod === 'CASH'
        ? 'Espèces'
        : (paymentMethod === 'CARD' ? 'Carte bancaire' : (paymentMethod === 'BARIDIMOB' ? 'BaridiMob' : paymentMethod));

      const label = tpl.paymentMethodLabel || 'Mode de règlement';
      out.push(twoCols(`${label} :`, paymentLabel));

      if (tpl.showTenderedAndChange && paymentMethod === 'CASH' && tenderedAmount > 0) {
        out.push(twoCols('Montant reçu :', CurrencyUtil.formatDZD(tenderedAmount)));
        if (changeGiven > 0) {
          out.push(twoCols('Monnaie rendue :', CurrencyUtil.formatDZD(changeGiven)));
        }
      }
    }

    out.push(separator);

    // 6. Messages de remerciement personnalisés
    if (tpl.footerLine1) out.push(center(tpl.footerLine1));
    if (tpl.footerLine2) out.push(center(tpl.footerLine2));
    if (tpl.footerLine3) out.push(center(tpl.footerLine3));

    return out.join('\n');
  }

  // Génération du rendu HTML thermique épuré et lisible pour le client
  public generateReceiptHtml(data: ReceiptPrintData, customConfig?: ReceiptTemplateConfig): string {
    const tpl = customConfig || this.getTemplateConfig();
    const is80 = (data.paperWidth || tpl.paperWidth || this.getConfig().paperWidth) !== '58mm';
    const totalTTC = data.totalTTC ?? data.grandTotal ?? 0;
    const paymentMethod = data.paymentMethod || data.payments?.[0]?.method || 'CASH';
    const tenderedAmount = data.tenderedAmount ?? data.payments?.[0]?.tendered ?? totalTTC;
    const changeGiven = data.changeGiven ?? data.payments?.[0]?.change ?? 0;

    const orderNumClean = this.getCleanOrderNumber(data.dailyOrderNumber, data.receiptNumber);
    const receiptNumClean = this.getCleanReceiptNumber(data.receiptNumber, orderNumClean);

    const storeFr = data.storeNameFr || data.storeName || '';
    const phone = tpl.customPhone || data.storePhone;
    const phone2 = tpl.customPhone2;
    const address = tpl.customAddress || data.storeAddress;
    const orderTypeLabel = this.getOrderTypeLabel(data.orderType);

    const baseFontSize = `${tpl.baseFontSize || 11}px`;
    const paddingX = typeof tpl.paddingX === 'number' ? `${tpl.paddingX}px` : '4px';
    const lineHeight = tpl.lineHeight === 'compact' ? '1.18' : (tpl.lineHeight === 'relaxed' ? '1.5' : '1.35');
    const feedTopHeight = (tpl.feedTopLines || 0) * 12;
    const feedBottomHeight = (tpl.feedBottomLines ?? 2) * 14;

    const formatMoney = (val: number) => {
      const formatted = CurrencyUtil.formatDZD(val);
      if (tpl.currencySymbol && tpl.currencySymbol !== 'DZD') {
        const numOnly = formatted.replace(/[^\d,\s.]/g, '').trim();
        return tpl.currencyPosition === 'before'
          ? `${tpl.currencySymbol} ${numOnly}`
          : `${numOnly} ${tpl.currencySymbol}`;
      }
      return formatted;
    };

    const getSepBorder = () => {
      switch (tpl.itemsSeparatorStyle) {
        case 'solid': return '1px solid #000';
        case 'dotted': return '1px dotted #000';
        case 'double': return '3px double #000';
        case 'none': return 'none';
        case 'dashed':
        default: return '1px dashed #000';
      }
    };

    let logoHtml = '';
    if (tpl.showLogo && typeof window !== 'undefined') {
      try {
        const logoBase64 = localStorage.getItem('aquadro_store_logo') || localStorage.getItem('pizzeria_store_logo');
        if (logoBase64) {
          const h = tpl.logoHeight || 55;
          const align = tpl.logoAlignment || tpl.headerAlignment || 'center';
          const filter = tpl.logoGrayscale ? 'filter: grayscale(100%) contrast(150%);' : '';
          logoHtml = `<div style="text-align: ${align}; margin-bottom: 5px;"><img src="${logoBase64}" style="max-width: 140px; max-height: ${h}px; object-fit: contain; display: inline-block; ${filter}" alt="Logo" /></div>`;
        }
      } catch (e) { }
    }

    const paymentLabel = paymentMethod === 'CASH'
      ? 'Espèces'
      : (paymentMethod === 'CARD' ? 'Carte bancaire' : (paymentMethod === 'BARIDIMOB' ? 'BaridiMob' : paymentMethod));

    const rawBlocks = tpl.blockOrder && tpl.blockOrder.length > 0
      ? tpl.blockOrder
      : DEFAULT_CUSTOMER_RECEIPT_BLOCK_ORDER;

    const hiddenSet = new Set(tpl.hiddenBlocks || []);
    const blocks = rawBlocks.filter(b => !hiddenSet.has(b));

    const renderBlock = (block: CustomerReceiptBlock): string => {
      switch (block) {
        case 'header': {
          if (tpl.hiddenBlocks?.includes('header')) return '';
          const showTitle = tpl.showHeaderTitle !== false && !!tpl.headerTitle;
          const showSub = tpl.showHeaderSubtitle !== false && !!tpl.headerSubtitle;
          const showWelcome = tpl.showWelcomeMessage !== false && !!tpl.headerWelcomeMessage;
          const storeAr = tpl.customStoreNameAr || data.storeNameAr;
          const storeArHtml = tpl.showStoreNameAr && storeAr ? `<div style="font-size: 13px; font-weight: 900; margin-top: 1px; direction: rtl; font-family: 'Cairo', 'Amiri', Tahoma, sans-serif; color: #000;">${storeAr}</div>` : '';
          const hasFiscal = tpl.showFiscalInfo && (tpl.customRc || tpl.customNif || tpl.customNis || tpl.customAi);
          const fiscalHtml = hasFiscal ? `
            <div style="font-size: 8.5px; color: #000; margin-top: 3px; border-top: 1px dashed #000; padding-top: 2px; line-height: 1.3;">
              ${tpl.customRc ? `<span>RC: <strong>${tpl.customRc}</strong> </span>` : ''}
              ${tpl.customNif ? `<span>NIF: <strong>${tpl.customNif}</strong> </span>` : ''}
              ${tpl.customNis ? `<span>NIS: <strong>${tpl.customNis}</strong> </span>` : ''}
              ${tpl.customAi ? `<span>AI: <strong>${tpl.customAi}</strong></span>` : ''}
            </div>
          ` : '';

          const phoneCombined = phone ? (phone2 ? `${phone} / ${phone2}` : phone) : (phone2 || '');

          return `
            <div style="text-align: ${tpl.headerAlignment || 'center'}; margin-bottom: 8px; color: #000;">
              ${logoHtml}
              ${showTitle ? `<div style="font-size: ${tpl.headerTitleFontSize || 19}px; font-weight: 900; letter-spacing: 1.5px; text-transform: uppercase; color: #000;">${tpl.headerTitle}</div>` : ''}
              ${showSub ? `<div style="font-size: ${tpl.headerSubtitleFontSize || 10.5}px; font-weight: 600; color: #000; margin-top: 1px;">${tpl.headerSubtitle}</div>` : ''}
              ${storeArHtml}
              ${tpl.showStoreNameFr && storeFr && !storeFr.toUpperCase().includes((tpl.headerTitle || 'AQUADRO').toUpperCase()) ? `<div style="font-size: 11px; font-weight: bold; margin-top: 1px; color: #000;">${storeFr}</div>` : ''}
              ${showWelcome ? `<div style="font-size: 9.5px; font-style: italic; color: #000; margin-top: 2px;">${tpl.headerWelcomeMessage}</div>` : ''}
              ${tpl.showPhone && phoneCombined ? `<div style="font-size: 10px; margin-top: 2px; color: #000;">Tél : <strong>${phoneCombined}</strong></div>` : ''}
              ${tpl.showAddress && address ? `<div style="font-size: 9.5px; margin-top: 1px; color: #000;">${address}</div>` : ''}
              ${tpl.showSocials && tpl.socialsText ? `<div style="font-size: 9.5px; margin-top: 1px; color: #000;">${tpl.socialsText}</div>` : ''}
              ${tpl.showWifi && tpl.wifiText ? `<div style="font-size: 9.5px; margin-top: 1px; font-weight: bold; color: #000; border: 1px solid #000; padding: 2px 4px; border-radius: 4px; display: inline-block;">${tpl.wifiText}</div>` : ''}
              ${fiscalHtml}
            </div>
          `;
        }

        case 'order_banner': {
          if (tpl.hiddenBlocks?.includes('order_banner')) return '';
          if (!tpl.showOrderNumber && !tpl.showOrderType) return '';
          const prefix = tpl.orderNumberPrefix || 'COMMANDE #';
          const style = tpl.orderNumberStyle || 'banner';

          let boxStyle = 'border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 5px 0; text-align: center; margin-bottom: 8px;';
          let innerNumStyle = `font-size: ${tpl.orderNumberFontSize || 20}px; font-weight: ${tpl.boldOrderNumber !== false ? 900 : 700};`;

          if (style === 'banner') {
            boxStyle = 'background: #000; color: #fff; padding: 6px 4px; text-align: center; margin-bottom: 8px; border-radius: 3px;';
            innerNumStyle += ' color: #fff;';
          } else if (style === 'bordered') {
            boxStyle = 'border: 2px solid #000; padding: 5px; text-align: center; margin-bottom: 8px; border-radius: 4px;';
          } else if (style === 'badge') {
            boxStyle = 'text-align: center; margin-bottom: 8px; padding: 3px 0;';
            innerNumStyle = `display: inline-block; border: 1.5px solid #000; padding: 2px 14px; border-radius: 20px; font-size: ${tpl.orderNumberFontSize || 18}px; font-weight: 900;`;
          }

          const numDisplay = tpl.orderNumberFormat === 'number_only'
            ? orderNumClean
            : (tpl.orderNumberFormat === 'prefix_only' ? prefix : `${prefix}${orderNumClean}`);

          return `
            <div style="${boxStyle}">
              ${tpl.showOrderNumber ? `<div style="${innerNumStyle}">${numDisplay}</div>` : ''}
              ${tpl.showOrderType ? `<div style="font-size: 11.5px; font-weight: 900; letter-spacing: 0.5px; text-transform: uppercase; margin-top: 2px; ${style === 'banner' ? 'color: #fff;' : ''}">${orderTypeLabel}</div>` : ''}
            </div>
          `;
        }

        case 'order_info': {
          if (tpl.hiddenBlocks?.includes('order_info')) return '';
          if (!tpl.showDateTime && !(tpl.showCashier && data.cashierName) && !(tpl.showCustomer && (orderTypeLabel === 'LIVRAISON' || data.customerName))) return '';

          let dateDisplay = data.dateTime;
          if (tpl.dateTimeFormat === 'date_only') {
            dateDisplay = data.dateTime.split(' ')[0] || data.dateTime;
          } else if (tpl.dateTimeFormat === 'time_only') {
            dateDisplay = data.dateTime.split(' ')[1] || data.dateTime;
          }

          return `
            <div style="font-size: 10px; margin-bottom: 8px; border-bottom: 1px dashed #000; padding-bottom: 6px; line-height: 1.4;">
              ${tpl.showDateTime ? `
                <div style="display: table; width: 100%; border-collapse: collapse;">
                  <div style="display: table-cell; text-align: left; vertical-align: top;">Ticket : <strong>${receiptNumClean}</strong></div>
                  <div style="display: table-cell; text-align: right; vertical-align: top; white-space: nowrap;">Date : ${dateDisplay}</div>
                </div>
              ` : ''}
              ${tpl.showCashier && data.cashierName ? `<div>${tpl.cashierLabel || 'Caissier'} : <strong>${data.cashierName}</strong></div>` : ''}
              ${tpl.showTableNumber && data.tableNumber ? `<div>Table : <strong>${data.tableNumber}</strong></div>` : ''}
              ${tpl.showCustomer && data.customerName ? `
                <div style="margin-top: 4px; padding-top: 4px; border-top: 1px dotted #000;">
                  <div>Client : <strong>${data.customerName}</strong> ${data.customerPhone ? `(${data.customerPhone})` : ''}</div>
                  ${data.customerAddress ? `<div>Adresse : ${data.customerAddress}</div>` : ''}
                </div>
              ` : ''}
            </div>
          `;
        }

        case 'items': {
          if (tpl.hiddenBlocks?.includes('items')) return '';
          const sepBorder = getSepBorder();
          const suppFontSize = tpl.supplementsFontSize || 12;
          const isSuppBold = tpl.boldSupplements !== false;

          let suppHighlightCss = '';
          if (tpl.supplementsHighlight === 'boxed') {
            suppHighlightCss = 'border: 1px dashed #000; padding: 1px 5px; border-radius: 3px; display: inline-block;';
          } else if (tpl.supplementsHighlight === 'badge') {
            suppHighlightCss = 'border: 1.5px solid #000; padding: 1px 6px; border-radius: 4px; display: inline-block; background: #fff;';
          } else if (tpl.supplementsHighlight === 'underline') {
            suppHighlightCss = 'text-decoration: underline;';
          }

          const suppStyleCss = `font-size: ${suppFontSize}px; color: #000; font-weight: ${isSuppBold ? 900 : 700}; margin-left: 14px; margin-top: 2px; ${suppHighlightCss}`;

          return `
            <div style="border-bottom: ${sepBorder}; padding-bottom: 6px; margin-bottom: 8px;">
              ${tpl.showItemTableHeader !== false ? `
                <div style="display: table; width: 100%; border-collapse: collapse; font-size: 10px; font-weight: bold; border-bottom: 1px solid #000; padding-bottom: 3px; margin-bottom: 5px;">
                  <div style="display: table-cell; text-align: left;">Article</div>
                  <div style="display: table-cell; text-align: right; white-space: nowrap;">Total</div>
                </div>
              ` : ''}
              ${data.items.map(item => {
            const suppNames = item.supplements && item.supplements.length > 0
              ? item.supplements.map(s => {
                const q = (s as any).quantity || 1;
                const qStr = q > 1 ? `${q}x ` : '';
                const name = typeof s === 'string' ? s : s.name_fr;
                const priceStr = (typeof s === 'string' || tpl.supplementsPriceDisplay === false) ? '' : ` (+${formatMoney(s.price * q)})`;
                return `${qStr}${name}${priceStr}`;
              }).join(', ')
              : '';
            const unitPriceStr = item.quantity > 1 ? `(${item.quantity} x ${formatMoney(item.unitPrice)})` : '';
            return `
                  <div style="margin-bottom: 5px; font-size: 10px; word-break: break-word;">
                    <div style="display: table; width: 100%; border-collapse: collapse;">
                      <div style="display: table-cell; vertical-align: top; text-align: left; font-weight: ${tpl.boldItemNames !== false ? 'bold' : 'normal'}; font-size: ${tpl.itemTitleFontSize || 11}px; padding-right: 8px; word-break: break-word; overflow-wrap: break-word; color: #000;">
                        ${item.quantity}x ${item.name}${tpl.showItemVariants !== false && item.variant ? ` (${item.variant})` : ''}
                      </div>
                      <div style="display: table-cell; vertical-align: top; text-align: right; white-space: nowrap; font-weight: bold; font-size: ${tpl.itemTitleFontSize || 11}px; width: 1%; color: #000;">
                        ${formatMoney(item.total)}
                      </div>
                    </div>
                    ${tpl.showItemUnitPrices && unitPriceStr ? `<div style="font-size: 9px; color: #000; margin-left: 14px;">${unitPriceStr}</div>` : ''}
                    ${tpl.showItemParts && item.multiParts && item.multiParts.parts ? `
                      <div style="font-size: 9.5px; color: #000; margin-left: 14px; margin-top: 1px;">
                        ${item.multiParts.parts.map((p, idx) => `<div>• Moitié ${idx + 1} : <strong>${p.name}</strong></div>`).join('')}
                      </div>
                    ` : ''}
                    ${tpl.showItemSupplements && suppNames ? `
                      <div style="${suppStyleCss}">
                        + Supplément : ${suppNames}
                      </div>
                    ` : ''}
                    ${tpl.showBaseIngredients && (item as any).ingredients && (item as any).ingredients.length > 0 ? `
                      <div style="font-size: 8.5px; color: #000; margin-left: 14px; margin-top: 1px;">Base : ${(item as any).ingredients.join(', ')}</div>
                    ` : ''}
                    ${tpl.showItemNotes && item.notes ? `<div style="font-size: ${tpl.notesFontSize || 9.5}px; font-style: italic; color: #000; margin-left: 14px; margin-top: 1px;">Note : ${item.notes}</div>` : ''}
                  </div>
                `;
          }).join('')}
            </div>
          `;
        }

        case 'subtotals': {
          if (tpl.hiddenBlocks?.includes('subtotals')) return '';
          const hasSubtotal = tpl.showSubtotal && (data.subtotal || data.subtotalHT);
          const hasDelivery = tpl.showDeliveryFee && data.deliveryFee && data.deliveryFee > 0;
          const hasDiscount = tpl.showDiscount && data.discountTotal && data.discountTotal > 0;
          const hasTax = tpl.showTax && data.taxAmount && data.taxAmount > 0;
          const hasCount = tpl.showTotalItemsCount;

          if (!hasSubtotal && !hasDelivery && !hasDiscount && !hasTax && !hasCount) return '';
          return `
            <div style="font-size: 10px; margin-bottom: 6px;">
              ${hasCount ? `
                <div style="display: table; width: 100%; border-collapse: collapse; padding: 1px 0; color: #000;">
                  <div style="display: table-cell; text-align: left;">${tpl.totalItemsCountLabel || 'Total articles'} :</div>
                  <div style="display: table-cell; text-align: right; white-space: nowrap;"><strong>${data.items.reduce((acc, it) => acc + (it.quantity || 1), 0)}</strong></div>
                </div>
              ` : ''}
              ${hasSubtotal ? `
                <div style="display: table; width: 100%; border-collapse: collapse; padding: 1px 0; color: #000;">
                  <div style="display: table-cell; text-align: left;">${tpl.subtotalLabel || 'Sous-total'} :</div>
                  <div style="display: table-cell; text-align: right; white-space: nowrap;">${formatMoney(data.subtotal || data.subtotalHT || 0)}</div>
                </div>
              ` : ''}
              ${hasDelivery ? `
                <div style="display: table; width: 100%; border-collapse: collapse; padding: 1px 0; color: #000;">
                  <div style="display: table-cell; text-align: left;">${tpl.deliveryFeeLabel || 'Frais de livraison'} :</div>
                  <div style="display: table-cell; text-align: right; white-space: nowrap;">${formatMoney(data.deliveryFee!)}</div>
                </div>
              ` : ''}
              ${hasDiscount ? `
                <div style="display: table; width: 100%; border-collapse: collapse; padding: 1px 0; color: #000;">
                  <div style="display: table-cell; text-align: left;">${tpl.discountLabel || 'Remise'} :</div>
                  <div style="display: table-cell; text-align: right; white-space: nowrap;">-${formatMoney(data.discountTotal!)}</div>
                </div>
              ` : ''}
              ${hasTax ? `
                <div style="display: table; width: 100%; border-collapse: collapse; padding: 1px 0; color: #000;">
                  <div style="display: table-cell; text-align: left;">${tpl.taxLabel || 'TVA'} (${((data.taxRate || 0) * 100).toFixed(0)}%) :</div>
                  <div style="display: table-cell; text-align: right; white-space: nowrap;">${formatMoney(data.taxAmount!)}</div>
                </div>
              ` : ''}
            </div>
          `;
        }

        case 'total': {
          if (tpl.hiddenBlocks?.includes('total') || tpl.showGrandTotal === false) return '';
          const totalStyle = tpl.totalStyle || 'standard';
          const label = tpl.totalLabelCustom || 'TOTAL À PAYER :';
          if (totalStyle === 'banner_dark') {
            return `
              <div style="background: #000; color: #fff; padding: 6px 8px; margin-bottom: 6px; display: table; width: 100%; box-sizing: border-box; font-size: ${tpl.totalPriceFontSize || 15}px; font-weight: ${tpl.boldTotals !== false ? 900 : 'bold'}; border-radius: 3px;">
                <div style="display: table-cell; text-align: left; vertical-align: middle; color: #fff;">${label}</div>
                <div style="display: table-cell; text-align: right; vertical-align: middle; white-space: nowrap; color: #fff;">${formatMoney(totalTTC)}</div>
              </div>
            `;
          }
          if (totalStyle === 'double_bordered') {
            return `
              <div style="border-top: 3px double #000; border-bottom: 3px double #000; padding: 5px 0; margin-bottom: 6px; display: table; width: 100%; box-sizing: border-box; font-size: ${tpl.totalPriceFontSize || 14}px; font-weight: ${tpl.boldTotals !== false ? 900 : 'bold'};">
                <div style="display: table-cell; text-align: left; vertical-align: middle;">${label}</div>
                <div style="display: table-cell; text-align: right; vertical-align: middle; white-space: nowrap;">${formatMoney(totalTTC)}</div>
              </div>
            `;
          }
          return `
            <div style="border-top: 1.5px solid #000; border-bottom: 1.5px solid #000; padding: 5px 0; margin-bottom: 6px; display: table; width: 100%; box-sizing: border-box; font-size: ${tpl.totalPriceFontSize || 14}px; font-weight: ${tpl.boldTotals !== false ? 900 : 'bold'};">
              <div style="display: table-cell; text-align: left; vertical-align: middle;">${label}</div>
              <div style="display: table-cell; text-align: right; vertical-align: middle; white-space: nowrap;">${formatMoney(totalTTC)}</div>
            </div>
          `;
        }

        case 'payment': {
          if (tpl.hiddenBlocks?.includes('payment') || !tpl.showPaymentMethod) return '';
          const label = tpl.paymentMethodLabel || 'Mode de règlement';
          return `
            <div style="font-size: 9.5px; line-height: 1.35; margin-bottom: 6px;">
              <div style="display: table; width: 100%; border-collapse: collapse;">
                <div style="display: table-cell; text-align: left;">${label} :</div>
                <div style="display: table-cell; text-align: right; white-space: nowrap;"><strong>${paymentLabel}</strong></div>
              </div>
              ${tpl.showTenderedAndChange && paymentMethod === 'CASH' && tenderedAmount > 0 ? `
                <div style="display: table; width: 100%; border-collapse: collapse; margin-top: 2px;">
                  <div style="display: table-cell; text-align: left;">Montant reçu :</div>
                  <div style="display: table-cell; text-align: right; white-space: nowrap;">${formatMoney(tenderedAmount)}</div>
                </div>
                ${changeGiven > 0 ? `
                  <div style="display: table; width: 100%; border-collapse: collapse; margin-top: 2px; font-weight: bold;">
                    <div style="display: table-cell; text-align: left;">Monnaie rendue :</div>
                    <div style="display: table-cell; text-align: right; white-space: nowrap;">${formatMoney(changeGiven)}</div>
                  </div>
                ` : ''}
              ` : ''}
            </div>
          `;
        }

        case 'footer': {
          if (tpl.hiddenBlocks?.includes('footer')) return '';
          const showLines = tpl.showFooterLines !== false;
          const showPolicy = tpl.showFooterPolicy !== false && !!tpl.footerPolicy;
          const showThanksAr = tpl.showThankYouMessageAr !== false && !!(tpl.thankYouMessageAr || tpl.footerLine3);
          if (!showLines && !showThanksAr && !showPolicy && !tpl.showQrCode && !tpl.showBarcode && !tpl.showCutLine) return '';

          const qrSize = tpl.qrCodeSize || 64;
          const qrHtml = tpl.showQrCode ? `
            <div style="margin: 6px auto; text-align: center;">
              <svg viewBox="0 0 100 100" width="${qrSize}" height="${qrSize}" style="display: block; margin: 0 auto; shape-rendering: crispEdges;">
                <!-- Finder Patterns -->
                <rect x="5" y="5" width="28" height="28" fill="#000" />
                <rect x="9" y="9" width="20" height="20" fill="#fff" />
                <rect x="13" y="13" width="12" height="12" fill="#000" />

                <rect x="67" y="5" width="28" height="28" fill="#000" />
                <rect x="71" y="9" width="20" height="20" fill="#fff" />
                <rect x="75" y="13" width="12" height="12" fill="#000" />

                <rect x="5" y="67" width="28" height="28" fill="#000" />
                <rect x="9" y="71" width="20" height="20" fill="#fff" />
                <rect x="13" y="75" width="12" height="12" fill="#000" />

                <!-- QR Data Matrix elements -->
                <rect x="37" y="15" width="5" height="5" fill="#000" />
                <rect x="47" y="15" width="5" height="5" fill="#000" />
                <rect x="57" y="15" width="5" height="5" fill="#000" />
                <rect x="15" y="37" width="5" height="5" fill="#000" />
                <rect x="15" y="47" width="5" height="5" fill="#000" />
                <rect x="15" y="57" width="5" height="5" fill="#000" />
                <rect x="40" y="40" width="8" height="8" fill="#000" />
                <rect x="52" y="40" width="6" height="6" fill="#000" />
                <rect x="62" y="40" width="8" height="8" fill="#000" />
                <rect x="40" y="52" width="6" height="6" fill="#000" />
                <rect x="50" y="52" width="10" height="10" fill="#000" />
                <rect x="64" y="52" width="6" height="6" fill="#000" />
                <rect x="40" y="66" width="8" height="8" fill="#000" />
                <rect x="52" y="66" width="6" height="6" fill="#000" />
                <rect x="62" y="66" width="8" height="8" fill="#000" />
                <rect x="75" y="40" width="6" height="6" fill="#000" />
                <rect x="85" y="40" width="6" height="6" fill="#000" />
                <rect x="75" y="55" width="8" height="8" fill="#000" />
                <rect x="85" y="70" width="6" height="6" fill="#000" />
                <rect x="40" y="80" width="10" height="6" fill="#000" />
                <rect x="55" y="80" width="6" height="6" fill="#000" />
                <rect x="70" y="80" width="8" height="6" fill="#000" />
              </svg>
              ${tpl.qrCustomText ? `<div style="font-size: 8px; color: #000; margin-top: 2px;">${tpl.qrCustomText}</div>` : ''}
            </div>
          ` : '';

          return `
            <div style="text-align: ${tpl.footerAlignment || 'center'}; border-top: 1px dashed #000; padding-top: 5px; font-size: ${tpl.footerFontSize || 9.5}px; color: #000;">
              ${showLines && tpl.footerLine1 ? `<div style="font-weight: bold; color: #000;">${tpl.footerLine1}</div>` : ''}
              ${showLines && tpl.footerLine2 ? `<div style="font-size: ${(tpl.footerFontSize || 9.5) - 1}px; color: #000; margin-top: 2px;">${tpl.footerLine2}</div>` : ''}
              ${showLines && tpl.footerLine3 ? `<div style="font-size: ${(tpl.footerFontSize || 9.5) - 1}px; color: #000; margin-top: 1px;">${tpl.footerLine3}</div>` : ''}
              ${showLines && tpl.footerLine4 ? `<div style="font-size: ${(tpl.footerFontSize || 9.5) - 1}px; color: #000; margin-top: 1px;">${tpl.footerLine4}</div>` : ''}
              ${showThanksAr ? `<div style="font-size: 11px; font-weight: bold; margin-top: 3px; direction: rtl; font-family: 'Cairo', 'Amiri', Tahoma, sans-serif; color: #000;">${tpl.thankYouMessageAr || tpl.footerLine3}</div>` : ''}
              ${showPolicy ? `<div style="margin-top: 4px; font-size: ${(tpl.footerFontSize || 9.5) - 1.5}px; color: #000; font-style: italic; line-height: 1.25;">${tpl.footerPolicy}</div>` : ''}
              ${qrHtml}
              ${tpl.showBarcode ? `
                <div style="margin-top: 5px; font-family: monospace; font-size: 8.5px; letter-spacing: 2px; color: #000;">
                  * ${tpl.barcodeText || receiptNumClean} *
                </div>
              ` : ''}
              ${tpl.showCutLine ? `
                <div style="border-top: 1px dashed #000; margin-top: 8px; text-align: center; font-size: 8px; color: #000; letter-spacing: 2px;">
                  ✂ -------------------------------- ✂
                </div>
              ` : ''}
            </div>
          `;
        }

        default:
          return '';
      }
    };

    return `
      <div class="thermal-receipt" style="font-family: -apple-system, BlinkMacSystemFont, 'Cairo', 'Amiri', 'DejaVu Sans', 'Segoe UI', Roboto, Tahoma, Arial, monospace; color: #000; background: #fff; line-height: ${lineHeight}; width: 100%; box-sizing: border-box; font-size: ${baseFontSize}; padding: 0 ${paddingX};">
        ${feedTopHeight > 0 ? `<div style="height: ${feedTopHeight}px;"></div>` : ''}
        ${blocks.map(b => renderBlock(b)).join('')}
        ${feedBottomHeight > 0 ? `<div style="height: ${feedBottomHeight}px;"></div>` : ''}
      </div>
    `;
  }

  // Génération du rendu HTML A4 pour Bon de Crédit
  public generateA4CreditHtml(data: ReceiptPrintData): string {
    const totalTTC = data.totalTTC ?? data.grandTotal ?? 0;
    const subtotalHT = data.subtotalHT ?? data.subtotal ?? 0;
    const storeFr = data.storeNameFr || data.storeName || 'MON MAGASIN';
    const storeAr = data.storeNameAr || '';

    let logoHtml = '';
    if (typeof window !== 'undefined') {
      try {
        const logoBase64 = localStorage.getItem('aquadro_store_logo');
        if (logoBase64) {
          logoHtml = `<img src="${logoBase64}" style="max-width: 150px; max-height: 120px; display: inline-block;" alt="Logo" />`;
        }
      } catch (e) { }
    }

    // Barcode provenant d'une API publique gratuite
    const barcodeUrl = `https://bwipjs-api.metafloor.com/?bcid=code128&text=${encodeURIComponent(data.receiptNumber)}&scale=2&height=10&includetext`;

    return `
      <div class="paper-a4" style="color: #000; line-height: 1.5; width: 100%; box-sizing: border-box; background: white;">
        
        <!-- HEADER -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #000; padding-bottom: 20px; margin-bottom: 30px;">
          <div style="width: 30%;">
            ${logoHtml}
          </div>
          <div style="width: 40%; text-align: center;">
            <h1 style="margin: 0; font-size: 24px; text-transform: uppercase;">${storeFr}</h1>
            ${storeAr ? `<h2 style="margin: 5px 0 0 0; font-size: 20px; direction: rtl;">${storeAr}</h2>` : ''}
            <p style="margin: 5px 0 0 0; font-size: 12px; color: #555;">${data.storeAddress || ''}</p>
            <p style="margin: 2px 0 0 0; font-size: 12px; color: #555;">${data.storePhone ? 'Tél: ' + data.storePhone : ''}</p>
          </div>
          <div style="width: 30%; text-align: right;">
            <img src="${barcodeUrl}" style="max-width: 100%; height: auto;" alt="Barcode" />
          </div>
        </div>

        <!-- TITLE -->
        <div style="text-align: center; margin-bottom: 30px;">
          <h2 style="margin: 0; font-size: 24px; border: 2px solid #000; display: inline-block; padding: 10px 30px; background-color: #f8f9fa;">BON DE CRÉDIT / REÇU DE FACILITÉ</h2>
        </div>

        <!-- INFO CLIENT & FACTURE -->
        <div style="display: flex; justify-content: space-between; margin-bottom: 30px; font-size: 14px;">
          <div style="width: 48%; border: 1px solid #ccc; padding: 15px; border-radius: 5px;">
            <h3 style="margin-top: 0; border-bottom: 1px solid #eee; padding-bottom: 5px; color: #333; font-size: 16px;">Informations Magasin</h3>
            <p style="margin: 5px 0;"><strong>N° Registre Commerce:</strong> ${data.rcNumber || '-'}</p>
            <p style="margin: 5px 0;"><strong>NIF:</strong> ${data.nifNumber || '-'}</p>
            <p style="margin: 5px 0;"><strong>Art. Impo:</strong> ${data.aiNumber || '-'}</p>
            <p style="margin: 5px 0;"><strong>Caissier/Vendeur:</strong> ${data.cashierName}</p>
          </div>
          <div style="width: 48%; border: 1px solid #000; padding: 15px; border-radius: 5px; background-color: #fcfcfc;">
            <h3 style="margin-top: 0; border-bottom: 1px solid #eee; padding-bottom: 5px; color: #333; font-size: 16px;">Informations Client & Opération</h3>
            <p style="margin: 5px 0;"><strong>N° Document:</strong> <span style="font-weight: bold; font-family: monospace;">${data.receiptNumber}</span></p>
            <p style="margin: 5px 0;"><strong>Date :</strong> ${data.dateTime}</p>
            <p style="margin: 5px 0;"><strong>Nom du Client:</strong> <span style="font-size: 18px; font-weight: bold;">${data.customerName || 'NON DÉFINI'}</span></p>
          </div>
        </div>

        <!-- ARTICLES -->
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 14px;">
          <thead>
            <tr style="background-color: #f1f1f1;">
              <th style="padding: 10px; text-align: left; border: 1px solid #000;">Désignation</th>
              <th style="padding: 10px; text-align: center; border: 1px solid #000; width: 10%;">Qté</th>
              <th style="padding: 10px; text-align: right; border: 1px solid #000; width: 20%;">Prix Unitaire</th>
              <th style="padding: 10px; text-align: right; border: 1px solid #000; width: 20%;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${data.items.map(item => `
              <tr>
                <td style="padding: 10px; border: 1px solid #000;">
                  ${item.name} ${item.variant ? `<br><small style="color: #666;">(${item.variant})</small>` : ''}
                </td>
                <td style="padding: 10px; text-align: center; border: 1px solid #000;">${item.quantity}</td>
                <td style="padding: 10px; text-align: right; border: 1px solid #000;">${CurrencyUtil.formatDZD(item.unitPrice)}</td>
                <td style="padding: 10px; text-align: right; border: 1px solid #000; font-weight: bold;">${CurrencyUtil.formatDZD(item.total)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <!-- TOTALS -->
        <div style="display: flex; justify-content: flex-end; margin-bottom: 50px;">
          <div style="width: 50%; border: 2px solid #000; padding: 15px; border-radius: 5px; background-color: #f8f9fa;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 14px;">
              <span>Total HT :</span>
              <span>${CurrencyUtil.formatDZD(subtotalHT)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 14px;">
              <span>TVA (${(data.taxRate || 0) * 100}%) :</span>
              <span>${CurrencyUtil.formatDZD(data.taxAmount || 0)}</span>
            </div>
            <div style="border-top: 1px solid #ccc; margin: 10px 0;"></div>
            <div style="display: flex; justify-content: space-between; font-size: 22px; font-weight: bold; color: #000;">
              <span>NET À PAYER :</span>
              <span>${CurrencyUtil.formatDZD(totalTTC)}</span>
            </div>
            <div style="margin-top: 15px; text-align: center; font-size: 12px; color: #d32f2f; font-weight: bold;">
              * CE MONTANT SERA AJOUTÉ À LA DETTE DU CLIENT
            </div>
          </div>
        </div>

        <!-- SIGNATURES -->
        <div style="display: flex; justify-content: space-between; margin-top: 50px; font-size: 14px;">
          <div style="width: 40%; text-align: center;">
            <p style="font-weight: bold; text-decoration: underline;">Signature du Client</p>
            <p style="font-size: 11px; color: #666; margin-bottom: 80px;">(Lu et approuvé)</p>
            <div style="border-bottom: 1px dashed #000; width: 80%; margin: 0 auto;"></div>
          </div>
          <div style="width: 40%; text-align: center;">
            <p style="font-weight: bold; text-decoration: underline;">Signature du Propriétaire / Gérant</p>
            <p style="font-size: 11px; color: #666; margin-bottom: 80px;">(Cachet et signature)</p>
            <div style="border-bottom: 1px dashed #000; width: 80%; margin: 0 auto;"></div>
          </div>
        </div>

        <!-- FOOTER -->
        <div style="text-align: center; margin-top: 50px; font-size: 11px; color: #666; border-top: 1px solid #eee; padding-top: 10px;">
          Document généré le ${new Date().toLocaleString()}. <br/>
          Merci de conserver ce document comme justificatif de dette.<br/>
          <strong style="font-size: 10px; color: #333;">AQUADRO POS</strong>
        </div>
      </div>
    `;
  }

  public getSelectedPrinterName(): string | null {
    if (typeof window !== 'undefined') {
      try {
        const val = localStorage.getItem('aquadro_selected_printer');
        if (val && val.trim()) return val.trim();
      } catch (e) { }
    }
    return null;
  }

  public setSelectedPrinterName(name: string | null): void {
    if (typeof window !== 'undefined') {
      try {
        if (name && name.trim()) {
          localStorage.setItem('aquadro_selected_printer', name.trim());
        } else {
          localStorage.removeItem('aquadro_selected_printer');
        }
      } catch (e) { }
    }
  }

  // Envoyer la commande d'éjection du tiroir-caisse RJ11
  public async kickCashDrawer(reason: string = 'Ouverture manuelle', openedBy?: string, role?: string, force = false): Promise<boolean> {
    if (!force && !drawerLogService.isDrawerEnabled()) {
      console.log('[Tiroir] Tiroir-caisse désactivé, impulsion ignorée.');
      return false;
    }

    try {
      await drawerLogService.logOpening(reason, openedBy, role);
    } catch (e) { }

    if (typeof window !== 'undefined' && typeof (window as any).__TAURI_INTERNALS__?.invoke === 'function') {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const printerName = this.getSelectedPrinterName();
        const res: any = await invoke('open_cash_drawer', { pin: 0, printerName, printer_name: printerName });
        console.log('Impulsion RJ11 envoyée au tiroir-caisse via Tauri:', res);
        return true;
      } catch (err: any) {
        console.warn('Erreur impulsion native tiroir-caisse:', err);
        throw new Error(typeof err === 'string' ? err : (err?.message || 'Erreur inconnue tiroir-caisse'));
      }
    }
    console.log('[Simulateur] Impulsion électrique 24V envoyée au port RJ11 (ESC p 0 25 250)');
    return true;
  }

  // Obtenir la liste des imprimantes matérielles connectées (USB direct, CUPS, Spooler)
  public async getAvailablePrinters(): Promise<Array<{ name: string; device_type: string; path_or_id: string; is_default: boolean }>> {
    if (typeof window !== 'undefined' && typeof (window as any).__TAURI_INTERNALS__?.invoke === 'function') {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        return await invoke('list_hardware_printers');
      } catch (e) {
        console.warn('Erreur détection imprimantes:', e);
      }
    }
    return [];
  }

  public generateZReportHtml(data: ZReportSummary): string {
    const is80 = this.getConfig().paperWidth !== '58mm';
    let logoHtml = '';
    if (typeof window !== 'undefined') {
      try {
        const logoBase64 = localStorage.getItem('aquadro_store_logo');
        if (logoBase64) {
          logoHtml = `<div style="text-align: center; margin-bottom: 8px;"><img src="${logoBase64}" style="max-width: 100px; max-height: 100px; display: inline-block; filter: grayscale(100%) contrast(200%);" alt="Logo" /></div>`;
        }
      } catch (e) { }
    }

    return `
      <div class="thermal-receipt" style="font-family: 'Courier New', Courier, monospace; color: #000; line-height: 1.35; width: 100%; box-sizing: border-box;">
        ${logoHtml}
        <div style="text-align: center; margin-bottom: 8px;">
          <div style="font-size: 13px; font-weight: bold;">RAPPORT Z (CLÔTURE DE CAISSE)</div>
          <div style="font-size: 10px; margin-top: 2px;">${new Date(data.generatedAt).toLocaleString()}</div>
        </div>
        <div style="border-top: 1px dashed #000; margin: 6px 0;"></div>
        <div style="font-size: 11px;">
          <div style="display: table; width: 100%; border-collapse: collapse; margin-bottom: 2px;"><div style="display: table-cell; text-align: left;">Caissier:</div><div style="display: table-cell; text-align: right; font-weight: bold;">${data.session.cashier_name}</div></div>
          <div style="display: table; width: 100%; border-collapse: collapse; margin-bottom: 2px;"><div style="display: table-cell; text-align: left;">Fond Initial:</div><div style="display: table-cell; text-align: right;">${CurrencyUtil.formatDZD(data.session.opening_float)}</div></div>
          <div style="display: table; width: 100%; border-collapse: collapse; margin-bottom: 2px;"><div style="display: table-cell; text-align: left;">Ventes Espèces:</div><div style="display: table-cell; text-align: right;">${CurrencyUtil.formatDZD(data.paymentBreakdown.cash)}</div></div>
          <div style="display: table; width: 100%; border-collapse: collapse; margin-bottom: 2px;"><div style="display: table-cell; text-align: left;">Ventes CIB/Carte:</div><div style="display: table-cell; text-align: right;">${CurrencyUtil.formatDZD(data.paymentBreakdown.cib)}</div></div>
          <div style="display: table; width: 100%; border-collapse: collapse; margin-bottom: 2px;"><div style="display: table-cell; text-align: left;">Crédit/Impayé:</div><div style="display: table-cell; text-align: right;">${CurrencyUtil.formatDZD(data.paymentBreakdown.credit)}</div></div>
          <div style="display: table; width: 100%; border-collapse: collapse; margin-bottom: 2px;"><div style="display: table-cell; text-align: left;">Dépenses:</div><div style="display: table-cell; text-align: right; color: red;">-${CurrencyUtil.formatDZD(data.session.total_cash_expenses)}</div></div>
          <div style="border-top: 1px dashed #000; margin: 6px 0;"></div>
          <div style="display: table; width: 100%; border-collapse: collapse; margin-bottom: 2px; font-weight: bold;"><div style="display: table-cell; text-align: left;">Total Espèces Attendu:</div><div style="display: table-cell; text-align: right;">${CurrencyUtil.formatDZD(data.cashInDrawerExpected)}</div></div>
          <div style="display: table; width: 100%; border-collapse: collapse; margin-bottom: 2px; font-weight: bold;"><div style="display: table-cell; text-align: left;">Espèces Recomptées:</div><div style="display: table-cell; text-align: right;">${CurrencyUtil.formatDZD(data.cashInDrawerCounted)}</div></div>
          <div style="border-top: 1px dashed #000; margin: 6px 0;"></div>
          <div style="display: table; width: 100%; border-collapse: collapse; margin-bottom: 2px; font-weight: bold;"><div style="display: table-cell; text-align: left;">Écart:</div><div style="display: table-cell; text-align: right;">${CurrencyUtil.formatDZD(data.discrepancy)}</div></div>
        </div>
        <div style="border-top: 1px dashed #000; margin: 6px 0;"></div>
        <div style="text-align: center; font-size: 10px; margin-top: 15px;">
          <br/><br/>
          <span>Signature Responsable</span>
        </div>
      </div>
    `;
  }

  // =========================================================================
  // TICKET DE TEST DIAGNOSTIC MATÉRIEL (OBLIGATOIRE POS-80)
  // =========================================================================

  public generateDiagnosticReceiptHtml(paperWidth: '58mm' | '80mm' = '80mm'): string {
    const is58 = paperWidth === '58mm';
    return `
      <div class="thermal-receipt ${is58 ? 'paper-58mm' : 'paper-80mm'}" style="font-family: -apple-system, BlinkMacSystemFont, 'Cairo', 'Amiri', 'DejaVu Sans', 'Segoe UI', Tahoma, Arial, sans-serif; color: #000; background: #fff; line-height: 1.35; width: 100%; box-sizing: border-box; font-size: 11px; padding: 4px;">
        <!-- EN-TETE DIAGNOSTIC -->
        <div style="text-align: center; border: 2px solid #000; padding: 4px; margin-bottom: 8px;">
          <div style="font-size: 13px; font-weight: 900; letter-spacing: 1px;">*** TEST DIAGNOSTIC POS-80 ***</div>
          <div style="font-size: 9.5px; margin-top: 2px;">LARGEUR: ${paperWidth} • 203 DPI RASTER</div>
        </div>

        <!-- 1. LATIN -->
        <div style="margin-bottom: 6px;">
          <div style="font-size: 9px; font-weight: bold; border-bottom: 1px solid #000; margin-bottom: 2px;">1. LATIN (A-Z):</div>
          <div style="font-size: 12px; font-weight: bold; letter-spacing: 0.5px; word-break: break-all;">ABCDEFGHIJKLMNOPQRSTUVWXYZ</div>
          <div style="font-size: 10px; word-break: break-all;">abcdefghijklmnopqrstuvwxyz</div>
        </div>

        <!-- 2. NUMBERS -->
        <div style="margin-bottom: 6px;">
          <div style="font-size: 9px; font-weight: bold; border-bottom: 1px solid #000; margin-bottom: 2px;">2. NUMBERS (0-9):</div>
          <div style="font-size: 13px; font-weight: bold; font-family: monospace;">0123456789</div>
        </div>

        <!-- 3. FRENCH ACCENTS -->
        <div style="margin-bottom: 6px;">
          <div style="font-size: 9px; font-weight: bold; border-bottom: 1px solid #000; margin-bottom: 2px;">3. FRENCH ACCENTS:</div>
          <div style="font-size: 12px; font-weight: bold;">é è à ç ù É È À Ç Ù</div>
        </div>

        <!-- 4. ARABIC CONNECTED & RTL -->
        <div style="margin-bottom: 6px;">
          <div style="font-size: 9px; font-weight: bold; border-bottom: 1px solid #000; margin-bottom: 2px;">4. ARABIC (RTL & SHAPING):</div>
          <div style="direction: rtl; text-align: right; font-size: 14px; font-weight: bold; line-height: 1.5;" dir="rtl" lang="ar">
            مرحبا بالعالم<br/>
            فاتورة تجريبية<br/>
            اسم المنتج - الكمية - السعر
          </div>
        </div>

        <!-- 5. MIXED -->
        <div style="margin-bottom: 6px;">
          <div style="font-size: 9px; font-weight: bold; border-bottom: 1px solid #000; margin-bottom: 2px;">5. MIXED:</div>
          <div style="font-size: 11px; font-weight: bold;">Produit Pizza 250.00 DZD</div>
        </div>

        <!-- 6. MOTIFS GEOMETRIQUES -->
        <div style="margin-bottom: 6px;">
          <div style="font-size: 9px; font-weight: bold; border-bottom: 1px solid #000; margin-bottom: 3px;">6. LIGNES HORIZONTALES (1px, 2px, 3px):</div>
          <div style="border-top: 1px solid #000; margin: 3px 0;"></div>
          <div style="border-top: 2px solid #000; margin: 3px 0;"></div>
          <div style="border-top: 3px solid #000; margin: 3px 0;"></div>
        </div>

        <!-- 7. DAMIER NOIR ET BLANC (CHECKERBOARD) -->
        <div style="margin-bottom: 6px;">
          <div style="font-size: 9px; font-weight: bold; border-bottom: 1px solid #000; margin-bottom: 3px;">7. DAMIER NOIR & BLANC (CHECKERBOARD):</div>
          <table style="width: 100%; border-collapse: collapse; table-layout: fixed; margin: 2px 0;">
            ${[0, 1, 2, 3].map(row => `
              <tr style="height: 6px;">
                ${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(col => `
                  <td style="background-color: ${(row + col) % 2 === 0 ? '#000000' : '#ffffff'}; padding: 0; height: 6px;"></td>
                `).join('')}
              </tr>
            `).join('')}
          </table>
        </div>

        <!-- 8. LIGNES VERTICALES & ALIGNEMENT PIXEL -->
        <div style="margin-bottom: 6px;">
          <div style="font-size: 9px; font-weight: bold; border-bottom: 1px solid #000; margin-bottom: 3px;">8. MOTIF ALIGNEMENT PIXEL:</div>
          <div style="display: table; width: 100%; border-collapse: collapse; text-align: center; height: 16px;">
            <div style="display: table-cell; border-left: 2px solid #000; border-right: 2px solid #000; width: 25%; font-size: 8px;">25%</div>
            <div style="display: table-cell; border-right: 2px solid #000; width: 25%; font-size: 8px;">50%</div>
            <div style="display: table-cell; border-right: 2px solid #000; width: 25%; font-size: 8px;">75%</div>
            <div style="display: table-cell; border-right: 2px solid #000; width: 25%; font-size: 8px;">100%</div>
          </div>
        </div>

        <!-- 9. RECTANGLE NOIR DE LARGEUR FIXE (50% LARGEUR IMPRESSION) -->
        <div style="margin-bottom: 8px;">
          <div style="font-size: 9px; font-weight: bold; border-bottom: 1px solid #000; margin-bottom: 3px;">9. RECTANGLE NOIR (50% LARGEUR):</div>
          <div style="width: 50%; height: 16px; background-color: #000000; margin: 0 auto;"></div>
        </div>

        <div style="border-top: 2px dashed #000; text-align: center; font-size: 8.5px; padding-top: 4px;">
          FIN DU TEST DIAGNOSTIC • AQUADRO POS
        </div>
      </div>
    `;
  }

  public async printDiagnosticReceipt(triggerBrowserPrint = false): Promise<void> {
    const config = this.getConfig();
    const paperWidth = config.paperWidth || '80mm';
    const htmlContent = this.generateDiagnosticReceiptHtml(paperWidth);

    if (typeof window !== 'undefined') {
      let printArea = document.getElementById('thermal-print-area');
      if (!printArea) {
        printArea = document.createElement('div');
        printArea.id = 'thermal-print-area';
        document.body.appendChild(printArea);
      }
      printArea.className = paperWidth === '58mm' ? 'paper-58mm' : 'paper-80mm';
      printArea.innerHTML = htmlContent;
    }

    let nativeSuccess = false;

    if (typeof window !== 'undefined' && typeof (window as any).__TAURI_INTERNALS__?.invoke === 'function') {
      try {
        const bitmap = await this.htmlToMonochromeBitmap(htmlContent, paperWidth);
        const { invoke } = await import('@tauri-apps/api/core');
        const printerName = this.getSelectedPrinterName();

        await invoke('raw_print_image', {
          data: Array.from(bitmap.data),
          width: bitmap.width,
          height: bitmap.height,
          printerName,
          printer_name: printerName,
          feedLines: 5,
          cut: config.cutterEnabled !== false
        });
        nativeSuccess = true;
      } catch (err: any) {
        console.warn('Impression raster diagnostic non disponible, repli texte diagnostic :', err);
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          const printerName = this.getSelectedPrinterName();
          const diagnosticText =
            "*** TEST DIAGNOSTIC POS-80 ***\n\n" +
            "1. LATIN (A-Z):\nABCDEFGHIJKLMNOPQRSTUVWXYZ\n" +
            "abcdefghijklmnopqrstuvwxyz\n\n" +
            "2. NUMBERS (0-9):\n0123456789\n\n" +
            "3. FRENCH ACCENTS:\né è à ç ù É È À Ç Ù\n\n" +
            "4. ARABIC:\nمرحبا بالعالم - فاتورة تجريبية\nاسم المنتج - الكمية - السعر\n\n" +
            "5. MIXED:\nProduit Pizza 250.00 DZD\n\n" +
            "================================\n" +
            "FIN DU TEST DIAGNOSTIC • AQUADRO POS\n";
          await invoke('raw_print_receipt', {
            content: diagnosticText,
            printerName,
            printer_name: printerName
          });
          nativeSuccess = true;
        } catch (textErr) {
          console.warn('Repli texte diagnostic échoué :', textErr);
        }
      }
    }

    if (!nativeSuccess && triggerBrowserPrint && typeof window !== 'undefined') {
      setTimeout(() => {
        window.print();
      }, 50);
    }
  }

  // Pipeline de conversion HTML vers bitmap monochrome 1-bit pour impression thermique directe (ESC/POS GS v 0)
  public async htmlToMonochromeBitmap(
    htmlContent: string,
    paperWidth: '58mm' | '80mm' = '80mm'
  ): Promise<{ data: Uint8Array; width: number; height: number }> {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      throw new Error('Le rendu HTML vers image nécessite un environnement DOM');
    }

    // 80mm = 576 dots à 203 DPI, 58mm = 384 dots à 203 DPI
    const is58 = paperWidth === '58mm';
    const targetWidth = is58 ? 384 : 576;
    // Mise à l'échelle x2 (288 * 2 = 576, 192 * 2 = 384) pour un rendu fidèle et haute résolution
    const containerWidth = is58 ? 192 : 288;
    const renderScale = 2;

    const container = document.createElement('div');
    container.id = 'thermal-raster-render-container';
    container.style.position = 'fixed';
    container.style.left = '0';
    container.style.top = '0';
    container.style.width = `${containerWidth}px`;
    container.style.maxWidth = `${containerWidth}px`;
    container.style.minWidth = `${containerWidth}px`;
    container.style.background = '#ffffff';
    container.style.color = '#000000';
    container.style.margin = '0';
    container.style.padding = '0';
    container.style.boxSizing = 'border-box';
    container.style.zIndex = '-9999';
    container.style.opacity = '1';
    container.style.pointerEvents = 'none';
    container.style.fontFamily = "-apple-system, BlinkMacSystemFont, 'Cairo', 'Amiri', 'DejaVu Sans', 'Segoe UI', Roboto, Tahoma, Arial, monospace";
    (container.style as any).webkitFontSmoothing = 'antialiased';
    container.style.textRendering = 'geometricPrecision';
    container.className = is58 ? 'paper-58mm' : 'paper-80mm';
    container.innerHTML = htmlContent;

    document.body.appendChild(container);

    try {
      // 1. Attendre le chargement des polices de caractères
      if (document.fonts && document.fonts.ready) {
        try {
          await document.fonts.ready;
        } catch (e) {
          console.warn('Vérification des polices ignorée :', e);
        }
      }

      // 2. Attendre le chargement et le décodage des images (logos, codes QR, etc.)
      const images = Array.from(container.querySelectorAll('img'));
      if (images.length > 0) {
        await Promise.all(
          images.map(img => {
            if (img.complete && img.naturalHeight !== 0) return Promise.resolve(true);
            return new Promise(resolve => {
              img.onload = () => resolve(true);
              img.onerror = () => resolve(false);
              setTimeout(() => resolve(false), 1200);
            });
          })
        );
      }

      // 3. Laisser le navigateur stabiliser le layout
      await new Promise(r => requestAnimationFrame(r));
      await new Promise(r => setTimeout(r, 50));

      // 4. Capture avec html2canvas en dimensions exactes 1:1 depuis le coin (0,0)
      const canvas = await html2canvas(container, {
        scale: renderScale,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
        allowTaint: true,
        width: containerWidth,
        x: 0,
        y: 0,
        scrollX: 0,
        scrollY: 0,
      });

      // 5. Normalisation stricte de la largeur de sortie aux spécifications thermiques (576 ou 384 pixels)
      let finalCanvas = canvas;
      if (canvas.width !== targetWidth) {
        const adjustedHeight = Math.max(1, Math.round(canvas.height * (targetWidth / canvas.width)));
        const resampled = document.createElement('canvas');
        resampled.width = targetWidth;
        resampled.height = adjustedHeight;
        const resampledCtx = resampled.getContext('2d');
        if (resampledCtx) {
          resampledCtx.fillStyle = '#ffffff';
          resampledCtx.fillRect(0, 0, targetWidth, adjustedHeight);
          resampledCtx.drawImage(canvas, 0, 0, targetWidth, adjustedHeight);
          finalCanvas = resampled;
        }
      }

      const width = finalCanvas.width;
      const height = finalCanvas.height;

      if (width === 0 || height === 0) {
        throw new Error(`Dimensions de capture bitmap invalides : ${width}x${height}`);
      }

      const ctx = finalCanvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        throw new Error('Impossible d\'obtenir le contexte 2D du canvas de rendu thermique');
      }

      const imgData = ctx.getImageData(0, 0, width, height);
      const rgba = imgData.data;

      // 6. Conversion en bitmap 1-bit monochrome compacté (MSB en premier, 1 = point noir, 0 = blanc)
      const bytesPerRow = Math.ceil(width / 8);
      const packedBitmap = new Uint8Array(bytesPerRow * height);
      // Seuil de luminance calibré (215) : saturation noire profonde des polices et filets sans bruit de fond
      const THRESHOLD = 215;

      for (let y = 0; y < height; y++) {
        const rowByteOffset = y * bytesPerRow;
        const rowPixelOffset = y * width * 4;

        for (let x = 0; x < width; x++) {
          const p = rowPixelOffset + (x * 4);
          const a = rgba[p + 3];

          // Pixels très transparents considérés comme fond blanc
          if (a < 50) {
            continue;
          }

          const r = rgba[p];
          const g = rgba[p + 1];
          const b = rgba[p + 2];
          
          // Composition avec fond blanc pour l'anti-aliasing
          const alphaNorm = a / 255;
          const blendedR = r * alphaNorm + 255 * (1 - alphaNorm);
          const blendedG = g * alphaNorm + 255 * (1 - alphaNorm);
          const blendedB = b * alphaNorm + 255 * (1 - alphaNorm);
          const lum = 0.299 * blendedR + 0.587 * blendedG + 0.114 * blendedB;

          if (lum < THRESHOLD) {
            const byteIndex = rowByteOffset + (x >> 3);
            const bitPosition = 7 - (x & 7);
            packedBitmap[byteIndex] |= (1 << bitPosition);
          }
        }
      }

      // VÉRIFICATION DE SÉCURITÉ : Empêche toute impression de papier blanc
      let blackDotBytes = 0;
      for (let i = 0; i < packedBitmap.length; i++) {
        if (packedBitmap[i] !== 0) {
          blackDotBytes++;
        }
      }

      if (blackDotBytes === 0) {
        console.warn(`[Thermal Raster] ATTENTION: Image 100% blanche détectée (0 point noir sur ${packedBitmap.length} octets). Déclenchement du repli texte.`);
        throw new Error('Le rendu graphique a produit une image totalement blanche');
      }

      return {
        data: packedBitmap,
        width,
        height
      };
    } finally {
      if (container.parentNode) {
        container.parentNode.removeChild(container);
      }
    }
  }

  public async printZReport(data: ZReportSummary, triggerBrowserPrint = true): Promise<void> {
    const config = this.getConfig();
    const paperWidth = config.paperWidth || '80mm';

    if (typeof window !== 'undefined') {
      let printArea = document.getElementById('thermal-print-area');
      if (!printArea) {
        printArea = document.createElement('div');
        printArea.id = 'thermal-print-area';
        document.body.appendChild(printArea);
      }
      printArea.className = paperWidth === '58mm' ? 'paper-58mm' : 'paper-80mm';
      printArea.innerHTML = this.generateZReportHtml(data);
    }

    let nativeSuccess = false;

    // Si environnement Tauri natif : impression raster image du rapport Z
    if (typeof window !== 'undefined' && typeof (window as any).__TAURI_INTERNALS__?.invoke === 'function') {
      try {
        const htmlContent = this.generateZReportHtml(data);
        const bitmap = await this.htmlToMonochromeBitmap(htmlContent, paperWidth);
        const { invoke } = await import('@tauri-apps/api/core');
        const printerName = this.getSelectedPrinterName();

        await invoke('raw_print_image', {
          data: Array.from(bitmap.data),
          width: bitmap.width,
          height: bitmap.height,
          printerName,
          printer_name: printerName,
          feedLines: 5,
          cut: config.cutterEnabled !== false
        });
        nativeSuccess = true;
      } catch (err) {
        console.warn('Impression raster image Rapport Z non disponible :', err);
      }
    }

    if (!nativeSuccess && triggerBrowserPrint && typeof window !== 'undefined') {
      setTimeout(() => {
        window.print();
      }, 50);
    }
  }

  // Imprimer le ticket de caisse Client (Image raster thermique native avec repli texte ESC/POS)
  public async printReceipt(data: ReceiptPrintData, triggerBrowserPrint = false): Promise<void> {
    this.archiveReceipt(data);
    const config = this.getConfig();
    const paperWidth = data.paperWidth || config.paperWidth || '80mm';

    // 1. Mettre à jour la zone dédiée #thermal-print-area pour @media print si nécessaire
    if (typeof window !== 'undefined') {
      let printArea = document.getElementById('thermal-print-area');
      if (!printArea) {
        printArea = document.createElement('div');
        printArea.id = 'thermal-print-area';
        document.body.appendChild(printArea);
      }

      const isCredit = data.paymentMethod === 'CREDIT' || data.payments?.[0]?.method === 'CREDIT';
      if (isCredit) {
        printArea.className = 'paper-a4';
        printArea.innerHTML = this.generateA4CreditHtml(data);
      } else {
        printArea.className = paperWidth === '58mm' ? 'paper-58mm' : 'paper-80mm';
        printArea.innerHTML = this.generateReceiptHtml(data);
      }
    }

    // Si reçu A4 Crédit : toujours utiliser l'impression navigateur/système classique
    const isCredit = data.paymentMethod === 'CREDIT' || data.payments?.[0]?.method === 'CREDIT';
    if (isCredit) {
      if (typeof window !== 'undefined') {
        setTimeout(() => {
          window.print();
        }, 50);
      }
      return;
    }

    let nativeSuccess = false;
    let nativeError: string | null = null;

    // 2. Si environnement Tauri natif : tentative d'impression IMAGE raster fidèle au HTML
    if (typeof window !== 'undefined' && typeof (window as any).__TAURI_INTERNALS__?.invoke === 'function') {
      try {
        const htmlContent = this.generateReceiptHtml(data);
        const bitmap = await this.htmlToMonochromeBitmap(htmlContent, paperWidth);
        const { invoke } = await import('@tauri-apps/api/core');
        const printerName = this.getSelectedPrinterName();

        await invoke('raw_print_image', {
          data: Array.from(bitmap.data),
          width: bitmap.width,
          height: bitmap.height,
          printerName,
          printer_name: printerName,
          feedLines: 5,
          cut: config.cutterEnabled !== false
        });
        nativeSuccess = true;
      } catch (err: any) {
        nativeError = typeof err === 'string' ? err : (err?.message || 'Erreur impression raster');
        console.warn('Impression raster image non disponible, tentative de repli en texte ESC/POS :', err);

        // Repli 1 : Impression brute texte ESC/POS
        try {
          const receiptText = this.generateReceiptText(data);
          const { invoke } = await import('@tauri-apps/api/core');
          const printerName = this.getSelectedPrinterName();
          await invoke('raw_print_receipt', { content: receiptText, printerName, printer_name: printerName });
          nativeSuccess = true;
        } catch (textErr: any) {
          console.warn('Repli texte ESC/POS également échoué :', textErr);
          nativeError = typeof textErr === 'string' ? textErr : (textErr?.message || nativeError);
        }
      }
    }

    // Repli 2 : Déclencher le spouleur navigateur QUE si l'impression matérielle directe n'a pas réussi ET que triggerBrowserPrint est demandé
    if (!nativeSuccess && triggerBrowserPrint && typeof window !== 'undefined') {
      setTimeout(() => {
        window.print();
      }, 50);
    }

    // Si échec complet et pas d'impression navigateur demandée, propager l'erreur pour retour utilisateur (toast)
    if (!nativeSuccess && nativeError && !triggerBrowserPrint) {
      throw new Error(nativeError);
    }
  }

  // =========================================================================
  // TICKET CUISINE / BON PIZZAIOLO (POUR LE CHEF)
  // =========================================================================

  // Génération du texte pour Bon de Cuisine (Chef Copy / Pizzaiolo)
  public generateKitchenTicketText(data: ReceiptPrintData): string {
    const is80 = (data.paperWidth || this.getConfig().paperWidth) !== '58mm';
    const cols = is80 ? 44 : 32;
    const tpl = this.getKitchenTemplateConfig();

    const center = (str: string) => {
      const pad = Math.max(0, Math.floor((cols - str.length) / 2));
      return ' '.repeat(pad) + str;
    };

    const separator = '='.repeat(cols);
    const line = '-'.repeat(cols);

    const twoCols = (left: string, right: string) => {
      const spaces = Math.max(1, cols - left.length - right.length);
      return left + ' '.repeat(spaces) + right;
    };

    const out: string[] = [];
    const orderNumClean = this.getCleanOrderNumber(data.dailyOrderNumber, data.receiptNumber);
    const orderTypeLabel = this.getOrderTypeLabel(data.orderType);

    out.push(separator);
    if (!tpl.hiddenBlocks?.includes('header') && tpl.showTicketTitle && tpl.headerTitle?.trim()) {
      out.push(center(tpl.headerTitle.trim()));
    }
    out.push(center(`COMMANDE N° ${orderNumClean}`));
    out.push(center(`>>> ${orderTypeLabel} <<<`));
    out.push(separator);

    out.push(twoCols(`Heure : ${data.dateTime}`, data.cashierName ? `Serveur : ${data.cashierName}` : ''));

    if (orderTypeLabel === 'LIVRAISON' && data.customerName) {
      out.push(line);
      out.push(`Client : ${data.customerName}${data.customerPhone ? ' (' + data.customerPhone + ')' : ''}`);
      if (data.customerAddress) {
        out.push(`Adresse : ${data.customerAddress}`);
      }
    }

    out.push(separator);

    // Articles opérationnels pour le Chef (Noms, Moitiés et Suppléments à ajouter)
    for (const item of data.items) {
      out.push(`[ ${item.quantity}x ]  ${(item.name || '').toUpperCase()}${item.variant ? ` (${item.variant})` : ''}`);

      if (item.multiParts && item.multiParts.parts) {
        item.multiParts.parts.forEach((p, idx) => {
          out.push(`    • Moitié ${idx + 1} : ${p.name}`);
        });
      }

      if (item.supplements && item.supplements.length > 0) {
        const supps = item.supplements
          .map(s => {
            const q = (s as any).quantity || 1;
            const qStr = q > 1 ? `${q}x ` : '';
            return `${qStr}${typeof s === 'string' ? s : s.name_fr}`;
          })
          .join(', ');
        out.push(`    + AJOUTER SUPPLÉMENT : ${supps}`);
      }

      if (item.notes) {
        out.push(`    * NOTE / CUISSON : ${item.notes}`);
      }

      out.push(line);
    }

    return out.join('\n');
  }

  // Rendu HTML du Bon de Cuisine pour le Chef (Pizzaiolo) — Personnalisable et ordonnancé par blocs
  public generateKitchenTicketHtml(data: ReceiptPrintData, customConfig?: KitchenTicketTemplateConfig): string {
    const tpl = customConfig || this.getKitchenTemplateConfig();
    const orderNumClean = this.getCleanOrderNumber(data.dailyOrderNumber, data.receiptNumber);
    const orderTypeLabel = this.getOrderTypeLabel(data.orderType);

    const rawKitchenBlocks = (tpl.blockOrder && tpl.blockOrder.length > 0)
      ? tpl.blockOrder
      : DEFAULT_KITCHEN_TICKET_BLOCK_ORDER;

    const hiddenKitchenSet = new Set(tpl.hiddenBlocks || []);
    const blocks = rawKitchenBlocks.filter(b => !hiddenKitchenSet.has(b));

    const baseFontSize = `${tpl.baseFontSize || 11}px`;

    const renderBlock = (block: KitchenTicketBlock): string => {
      switch (block) {
        case 'header':
          if (tpl.hiddenBlocks?.includes('header') || !tpl.showTicketTitle || !tpl.headerTitle?.trim()) return '';
          let headerStyleCss = 'border: 1.5px solid #000; padding: 4px 3px; border-radius: 4px;';
          if (tpl.chefHeaderStyle === 'banner') {
            headerStyleCss = 'background: #000; color: #fff; padding: 5px 3px; border-radius: 4px;';
          } else if (tpl.chefHeaderStyle === 'clean') {
            headerStyleCss = 'border-bottom: 2px solid #000; padding: 3px 0;';
          }
          return `
            <div style="text-align: ${tpl.headerAlignment || 'center'}; ${headerStyleCss} margin-bottom: 5px;">
              <div style="font-size: ${tpl.headerTitleFontSize || 10}px; font-weight: 800; letter-spacing: 1px;">
                ${tpl.headerTitle.trim()}
              </div>
            </div>
          `;

        case 'order_banner':
          if (tpl.hiddenBlocks?.includes('order_banner')) return '';
          if (!tpl.showOrderNumber && !tpl.showOrderType && !tpl.showTableNumberProminent) return '';
          const bannerBorderStyle = tpl.orderNumberStyle === 'clean' ? 'border-bottom: 2px solid #000;' : 'border: 2px solid #000;';
          const bannerBg = tpl.orderNumberStyle === 'banner' ? 'background: #000; color: #fff;' : 'background: #fff; color: #000;';
          const bannerPadding = tpl.orderNumberStyle === 'clean' ? 'padding: 4px 0;' : 'padding: 5px 3px; border-radius: 4px;';
          const isReprint = (data as any).isReprint || false;
          return `
            ${tpl.showReprintIndicator && isReprint ? `
              <div style="border: 2px solid #000; background: #000; color: #fff; text-align: center; font-weight: 900; font-size: 13px; padding: 3px; margin-bottom: 4px; border-radius: 3px;">
                *** RÉIMPRESSION / DUPLICATA ***
              </div>
            ` : ''}
            <div style="text-align: center; margin-bottom: 6px; ${bannerBorderStyle} ${bannerBg} ${bannerPadding}">
              ${tpl.showOrderNumber ? `
                <div style="font-size: ${tpl.orderNumberFontSize || 24}px; font-weight: 900; line-height: 1.1; margin: 2px 0;">
                  COMMANDE N° ${orderNumClean}
                </div>
              ` : ''}
              ${tpl.showOrderType ? `
                <div style="font-size: ${tpl.orderTypeFontSize || 12}px; font-weight: 900; letter-spacing: 0.5px; text-transform: uppercase;">
                  ${orderTypeLabel}
                </div>
              ` : ''}
              ${tpl.showTableNumberProminent && (data.tableNumber || orderTypeLabel === 'SUR PLACE') ? `
                <div style="font-size: ${tpl.tableNumberFontSize || 22}px; font-weight: 900; background: ${tpl.orderNumberStyle === 'banner' ? '#fff' : '#000'}; color: ${tpl.orderNumberStyle === 'banner' ? '#000' : '#fff'}; margin-top: 4px; padding: 2px 6px; border-radius: 3px; display: inline-block;">
                  ${tpl.tableNumberLabel || 'TABLE'} : ${data.tableNumber || '1'}
                </div>
              ` : ''}
            </div>
          `;

        case 'service_info':
          if (tpl.hiddenBlocks?.includes('service_info')) return '';
          if (!tpl.showDateTime && !tpl.showCashierOrServer && !tpl.showCustomerInfo) return '';
          return `
            <div style="font-size: ${tpl.serviceInfoFontSize || 9.5}px; margin-bottom: 6px; border-bottom: 1px dashed #000; padding-bottom: 4px;">
              <div style="display: table; width: 100%; border-collapse: collapse;">
                <div style="display: table-cell; text-align: left; vertical-align: top;">${tpl.showDateTime ? `<span>Heure : <strong>${data.dateTime}</strong></span>` : ''}</div>
                <div style="display: table-cell; text-align: right; vertical-align: top; white-space: nowrap;">${tpl.showCashierOrServer && data.cashierName ? `<span>Serveur : <strong>${data.cashierName}</strong></span>` : ''}</div>
              </div>
              ${tpl.showCustomerInfo && orderTypeLabel === 'LIVRAISON' && data.customerName ? `
                <div style="margin-top: 3px;">
                  Client : <strong>${data.customerName}</strong> ${data.customerPhone ? `(${data.customerPhone})` : ''}
                  ${data.customerAddress ? `<br/><span style="font-size: ${(tpl.serviceInfoFontSize || 9.5) - 1}px;">Adresse : ${data.customerAddress}</span>` : ''}
                </div>
              ` : ''}
            </div>
          `;

        case 'items':
          if (tpl.hiddenBlocks?.includes('items')) return '';
          let borderBottomCss = '1.5px solid #000';
          if (tpl.itemSeparatorStyle === 'dashed') borderBottomCss = '1.5px dashed #000';
          else if (tpl.itemSeparatorStyle === 'double') borderBottomCss = '3px double #000';
          else if (tpl.itemSeparatorStyle === 'none') borderBottomCss = 'none';

          return `
            <div style="margin-bottom: 6px;">
              ${data.items.map(item => {
            const suppNames = (tpl.showSupplements && item.supplements && item.supplements.length > 0)
              ? item.supplements.map(s => {
                const q = (s as any).quantity || 1;
                const qStr = q > 1 ? `${q}x ` : '';
                return `${qStr}${typeof s === 'string' ? s : s.name_fr}`;
              }).join(', ')
              : '';

            let suppStyle = 'border: 1px dashed #000; padding: 1px 4px; display: inline-block; font-weight: 900;';
            if (tpl.supplementsHighlight === 'underline') {
              suppStyle = 'text-decoration: underline; font-weight: 900;';
            } else if (tpl.supplementsHighlight === 'bold_only') {
              suppStyle = 'font-weight: 900;';
            } else if ((tpl.supplementsHighlight as any) === 'badge') {
              suppStyle = 'border: 2px solid #000; padding: 2px 6px; display: inline-block; font-weight: 900; background: #fff;';
            }

            let notesStyle = 'font-weight: bold; margin-top: 2px;';
            if (tpl.notesHighlight === 'boxed') {
              notesStyle = 'font-weight: bold; margin-top: 3px; border: 1.5px solid #000; padding: 2px 5px; border-radius: 3px; background: #fafafa; display: inline-block;';
            } else if (tpl.notesHighlight === 'colored_badge') {
              notesStyle = 'font-weight: 900; margin-top: 3px; border: 1px solid #000; background: #eee; padding: 2px 4px; display: inline-block;';
            } else if (tpl.notesHighlight === 'italic') {
              notesStyle = 'font-style: italic; font-weight: bold; margin-top: 2px;';
            }

            const itemName = tpl.uppercaseItemNames ? (item.name || '').toUpperCase() : (item.name || '');

            let qtyDisplay = `${item.quantity}x`;
            let qtyStyle = `font-size: ${tpl.itemQuantityFontSize || 16}px; font-weight: ${tpl.boldQuantities ? 900 : 700}; min-width: 36px;`;
            if (tpl.itemQuantityStyle === 'badge') {
              qtyStyle += ' border: 1.5px solid #000; border-radius: 3px; padding: 0 4px; text-align: center; display: inline-block;';
            } else if (tpl.itemQuantityStyle === 'compact') {
              qtyStyle += ' min-width: 26px;';
            }

            return `
                  <div style="border-bottom: ${borderBottomCss}; padding: 5px 0; word-break: break-word;">
                    <!-- NOM ET QUANTITE -->
                    <div style="display: table; width: 100%; border-collapse: collapse;">
                      <div style="display: table-cell; vertical-align: top; width: 42px; white-space: nowrap;">
                        <span style="${qtyStyle}">${qtyDisplay}</span>
                      </div>
                      <div style="display: table-cell; vertical-align: top; text-align: left; padding-left: 6px; font-size: ${tpl.itemTitleFontSize || 13.5}px; font-weight: ${tpl.boldItemNames ? 900 : 600}; ${tpl.uppercaseItemNames ? 'text-transform: uppercase;' : ''}; word-break: break-word;">
                        ${itemName}${item.variant ? ` <span style="font-size: ${(tpl.itemTitleFontSize || 13.5) - 2.5}px; font-weight: normal;">(${item.variant})</span>` : ''}
                      </div>
                    </div>

                    <!-- SI MOITIE-MOITIE -->
                    ${tpl.showMultiPartPizzas && item.multiParts && item.multiParts.parts ? `
                      <div style="margin-left: 36px; font-size: ${(tpl.baseFontSize || 11) - 1}px; color: #000; margin-top: 2px;">
                        ${item.multiParts.parts.map((p, idx) => `
                          <div style="margin-top: 1px;">
                            • Moitié ${idx + 1} : <strong>${p.name}</strong>
                          </div>
                        `).join('')}
                      </div>
                    ` : ''}

                    <!-- SUPPLEMENTS QUE LE CHEF DOIT AJOUTER -->
                    ${suppNames ? `
                      <div style="margin-left: 36px; font-size: ${tpl.supplementsFontSize || 12.5}px; color: #000; margin-top: 2px; ${suppStyle}">
                        + AJOUTER : ${suppNames}
                      </div>
                    ` : ''}

                    <!-- BASE INGREDIENTS POUR LE CHEF -->
                    ${tpl.showBaseIngredientsInKitchen && (item as any).ingredients && (item as any).ingredients.length > 0 ? `
                      <div style="margin-left: 36px; font-size: ${(tpl.baseFontSize || 11) - 1.5}px; color: #000; margin-top: 1px;">
                        Base : ${(item as any).ingredients.join(', ')}
                      </div>
                    ` : ''}

                    <!-- NOTES DE CUISSON -->
                    ${tpl.showCookingNotes && item.notes ? `
                      <div style="margin-left: 36px; font-size: ${tpl.cookingNotesFontSize || 9.5}px; color: #000; ${notesStyle}">
                        * NOTE : ${item.notes}
                      </div>
                    ` : ''}
                  </div>
                `;
          }).join('')}
            </div>
          `;

        case 'notes':
          if (tpl.hiddenBlocks?.includes('notes')) return '';
          if (!data.notes && !data.customerNotes) return '';
          return `
            <div style="margin-bottom: 6px; padding: 4px; border: 1.5px dashed #000; border-radius: 4px; font-size: ${tpl.cookingNotesFontSize || 10}px; color: #000;">
              <div style="font-weight: 900; text-decoration: underline;">INSTRUCTION GENERALE COMMANDE :</div>
              <div style="font-weight: bold; margin-top: 2px;">${data.notes || data.customerNotes}</div>
            </div>
          `;

        case 'footer':
          if (tpl.hiddenBlocks?.includes('footer')) return '';
          const spaces = Math.max(0, tpl.bottomSpacingLines ?? 0);
          if (spaces === 0) return '';
          return `<div style="height: ${spaces * 8}px;"></div>`;

        default:
          return '';
      }
    };

    return `
      <div class="thermal-kitchen" style="font-family: -apple-system, BlinkMacSystemFont, 'Cairo', 'Amiri', 'DejaVu Sans', 'Segoe UI', Roboto, Tahoma, Arial, monospace; color: #000; background: #fff; line-height: 1.3; width: 100%; box-sizing: border-box; font-size: ${baseFontSize};">
        ${blocks.map(b => renderBlock(b)).join('')}
      </div>
    `;
  }

  // Imprimer le Bon de Cuisine (Pizzaiolo) uniquement (Image raster native fidèle au modèle HTML)
  public async printKitchenTicket(data: ReceiptPrintData, triggerBrowserPrint = false): Promise<void> {
    this.archiveReceipt(data);
    const config = this.getConfig();
    const paperWidth = data.paperWidth || config.paperWidth || '80mm';

    if (typeof window !== 'undefined') {
      let printArea = document.getElementById('thermal-print-area');
      if (!printArea) {
        printArea = document.createElement('div');
        printArea.id = 'thermal-print-area';
        document.body.appendChild(printArea);
      }
      printArea.className = paperWidth === '58mm' ? 'paper-58mm' : 'paper-80mm';
      printArea.innerHTML = this.generateKitchenTicketHtml(data);
    }

    let nativeSuccess = false;
    let nativeError: string | null = null;

    if (typeof window !== 'undefined' && typeof (window as any).__TAURI_INTERNALS__?.invoke === 'function') {
      try {
        const htmlContent = this.generateKitchenTicketHtml(data);
        const bitmap = await this.htmlToMonochromeBitmap(htmlContent, paperWidth);
        const { invoke } = await import('@tauri-apps/api/core');
        const printerName = this.getSelectedPrinterName();

        await invoke('raw_print_image', {
          data: Array.from(bitmap.data),
          width: bitmap.width,
          height: bitmap.height,
          printerName,
          printer_name: printerName,
          feedLines: 5,
          cut: config.cutterEnabled !== false
        });
        nativeSuccess = true;
      } catch (err: any) {
        nativeError = typeof err === 'string' ? err : (err?.message || 'Erreur impression raster cuisine');
        console.warn('Impression raster image Bon Cuisine non disponible, tentative de repli en mode texte ESC/POS :', err);

        // Repli 1 : Impression texte brute
        try {
          const kitchenText = this.generateKitchenTicketText(data);
          const { invoke } = await import('@tauri-apps/api/core');
          const printerName = this.getSelectedPrinterName();
          await invoke('raw_print_receipt', { content: kitchenText, printerName, printer_name: printerName });
          nativeSuccess = true;
        } catch (textErr: any) {
          console.warn('Repli texte Bon Cuisine également échoué :', textErr);
          nativeError = typeof textErr === 'string' ? textErr : (textErr?.message || nativeError);
        }
      }
    }

    // Repli 2 : Ne déclencher le spouleur navigateur QUE si l'impression matérielle directe n'a pas réussi ET que triggerBrowserPrint est demandé
    if (!nativeSuccess && triggerBrowserPrint && typeof window !== 'undefined') {
      setTimeout(() => {
        window.print();
      }, 50);
    }

    if (!nativeSuccess && nativeError && !triggerBrowserPrint) {
      throw new Error(nativeError);
    }
  }

  // Imprimer les deux tickets (Reçu Client + Bon Cuisine Pizzaiolo)
  // Séquence : 1. Ticket client -> 2. Avance papier (ou découpe si supportée) -> 3. Bon cuisine -> 4. Avance papier finale -> 5. Découpe conditionnelle
  public async printBothTickets(data: ReceiptPrintData, triggerBrowserPrint = false): Promise<void> {
    this.archiveReceipt(data);
    const config = this.getConfig();
    const paperWidth = data.paperWidth || config.paperWidth || '80mm';

    if (typeof window !== 'undefined') {
      let printArea = document.getElementById('thermal-print-area');
      if (!printArea) {
        printArea = document.createElement('div');
        printArea.id = 'thermal-print-area';
        document.body.appendChild(printArea);
      }
      printArea.className = paperWidth === '58mm' ? 'paper-58mm' : 'paper-80mm';
      printArea.innerHTML = `
        <div class="ticket-client" style="page-break-after: always; padding-bottom: 25px;">
          ${this.generateReceiptHtml(data)}
        </div>
        <div style="border-top: 2px dashed #000; margin: 20px 0; text-align: center; font-size: 11px; font-weight: bold;">
          ✄--- COUPER ICI / BON CUISINE ---✄
        </div>
        <div class="ticket-cuisine" style="padding-top: 15px;">
          ${this.generateKitchenTicketHtml(data)}
        </div>
      `;
    }

    let nativeSuccess = false;
    let nativeError: string | null = null;

    if (typeof window !== 'undefined' && typeof (window as any).__TAURI_INTERNALS__?.invoke === 'function') {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const printerName = this.getSelectedPrinterName();
        const cutter = config.cutterEnabled !== false;

        // Étape 1 : Rendu et impression du Reçu Client
        const clientHtml = this.generateReceiptHtml(data);
        const clientBitmap = await this.htmlToMonochromeBitmap(clientHtml, paperWidth);

        await invoke('raw_print_image', {
          data: Array.from(clientBitmap.data),
          width: clientBitmap.width,
          height: clientBitmap.height,
          printerName,
          printer_name: printerName,
          feedLines: 5,
          cut: cutter
        });

        // Pause nécessaire pour que le massicot physique termine son cycle avant de recevoir la suite
        await new Promise(r => setTimeout(r, 600));

        // Étape 2 : Rendu et impression du Bon Cuisine Pizzaiolo
        const kitchenHtml = this.generateKitchenTicketHtml(data);
        const kitchenBitmap = await this.htmlToMonochromeBitmap(kitchenHtml, paperWidth);

        await invoke('raw_print_image', {
          data: Array.from(kitchenBitmap.data),
          width: kitchenBitmap.width,
          height: kitchenBitmap.height,
          printerName,
          printer_name: printerName,
          feedLines: 5,
          cut: cutter
        });

        nativeSuccess = true;
      } catch (err: any) {
        nativeError = typeof err === 'string' ? err : (err?.message || 'Erreur impression double ticket');
        console.warn('Impression raster image combinée non disponible, tentative de repli en mode texte ESC/POS :', err);

        // Repli texte avec deux jobs séparés pour découpe garantie entre les tickets
        try {
          const clientText = this.generateReceiptText(data);
          const kitchenText = this.generateKitchenTicketText(data);
          const { invoke } = await import('@tauri-apps/api/core');
          const printerName = this.getSelectedPrinterName();

          // 1. Reçu client
          await invoke('raw_print_receipt', { content: clientText, printerName, printer_name: printerName });
          // Pause mécanique pour le massicot
          await new Promise(r => setTimeout(r, 600));
          // 2. Bon cuisine
          await invoke('raw_print_receipt', { content: kitchenText, printerName, printer_name: printerName });
          nativeSuccess = true;
        } catch (textErr: any) {
          console.warn('Repli texte combiné également échoué :', textErr);
          nativeError = typeof textErr === 'string' ? textErr : (textErr?.message || nativeError);
        }
      }
    }

    // Repli spouleur navigateur QUE si l'impression directe n'a pas réussi ET que triggerBrowserPrint est demandé
    if (!nativeSuccess && triggerBrowserPrint && typeof window !== 'undefined') {
      setTimeout(() => {
        window.print();
      }, 50);
    }

    if (!nativeSuccess && nativeError && !triggerBrowserPrint) {
      throw new Error(nativeError);
    }
  }

  public async printSetupCharter(storeName: string, dbPin: string): Promise<void> {
    const html = `
      <div class="paper-a4" style="font-family: Arial, sans-serif; color: #000; width: 100%; box-sizing: border-box; background: white; padding: 40px;">
        <div style="text-align: center; border-bottom: 2px solid #000; padding-bottom: 20px; margin-bottom: 30px;">
          <h1 style="font-size: 28px; font-weight: bold; margin: 0; letter-spacing: 2px;">AQUADRO POS</h1>
          <h2 style="font-size: 18px; color: #555; margin: 10px 0 0 0;">DOCUMENT CONFIDENTIEL D'INITIALISATION</h2>
        </div>
        
        <div style="display: flex; justify-content: space-between; margin-bottom: 30px;">
          <div>
            <p style="font-size: 14px; margin: 5px 0;"><strong>MAGASIN :</strong> ${storeName}</p>
            <p style="font-size: 14px; margin: 5px 0;"><strong>DATE :</strong> ${new Date().toLocaleString()}</p>
          </div>
        </div>
        
        <div style="text-align: center; background-color: #fcfcfc; border: 2px solid #000; padding: 20px; border-radius: 8px; margin-bottom: 40px;">
          <h3 style="font-size: 16px; font-weight: bold; margin: 0 0 15px 0;">CODE SECRET DE LA BASE DE DONNÉES (DANGER ZONE PIN)</h3>
          <p style="font-size: 36px; font-weight: bold; letter-spacing: 10px; margin: 10px 0; color: #d32f2f; font-family: monospace;">${dbPin}</p>
          <p style="font-size: 14px; font-weight: bold; color: #d32f2f; margin-top: 15px;">ATTENTION : CE CODE EST STRICTEMENT CONFIDENTIEL.</p>
          <p style="font-size: 12px; color: #555;">Il est requis pour effectuer un Factory Reset et formater la base de données.</p>
        </div>
        
        <div style="border-top: 2px solid #000; margin: 30px 0;"></div>
        
        <h3 style="font-size: 20px; font-weight: bold; margin: 20px 0; text-align: center;">ميثاق الاستخدام (Charte d'Utilisation)</h3>
        
        <div style="background-color: #f9f9f9; border: 1px solid #ccc; padding: 25px; border-radius: 5px; direction: rtl; text-align: right;">
          <p style="font-size: 16px; margin-bottom: 15px; font-weight: bold;">
            بموافقتك على استخدام هذا النظام (Aquadro POS)، فإنك تتعهد وتوافق على الميثاق التالي:
          </p>
          <ul style="font-size: 14px; padding-right: 20px; line-height: 1.8; margin-bottom: 20px;">
            <li>النظام مصمم لتسهيل عمليات البيع والإدارة، ولا يتحمل المطور أي مسؤولية قانونية عن أخطاء إدخال البيانات أو ضياعها.</li>
            <li>الرمز السري لقاعدة البيانات (DB PIN) المطبوع أعلاه هو مسؤوليتك الخاصة. فقدانه أو تسريبه قد يؤدي إلى فقدان بياناتك بالكامل.</li>
            <li>عند قيامك بطلب إعادة ضبط المصنع (Factory Reset) من الإعدادات، فإنك توافق على أن النظام سيقوم بمسح كافة البيانات من الجهاز نهائياً.</li>
            <li>يمنع منعاً باتاً الهندسة العكسية للبرنامج، استنساخه، أو توزيعه بدون إذن كتابي مسبق.</li>
          </ul>
        </div>
        
        <div style="display: flex; justify-content: space-between; margin-top: 60px;">
          <div style="width: 45%; text-align: center;">
            <p style="font-weight: bold; font-size: 16px; margin-bottom: 10px; text-decoration: underline;">Signature du Propriétaire</p>
            <p style="font-size: 12px; color: #666; margin-bottom: 80px;">(Lu et approuvé)</p>
            <div style="border-bottom: 1px dashed #000; width: 80%; margin: 0 auto;"></div>
          </div>
          
          <div style="width: 45%; text-align: center;">
            <p style="font-weight: bold; font-size: 16px; margin-bottom: 10px; text-decoration: underline;">Concepteur du Système</p>
            <p style="font-size: 16px; font-weight: bold; color: #333; margin-top: 30px;">Boudelaa Youcef Seddik</p>
            <p style="font-size: 14px; font-weight: bold; color: #333; margin-top: 5px;">بوضلعة يوسف الصديق</p>
          </div>
        </div>
        
        <div style="text-align: center; margin-top: 60px; font-size: 11px; color: #888; border-top: 1px solid #eee; padding-top: 15px;">
          Document d'initialisation généré par AQUADRO POS.<br/>
          <strong>Veuillez conserver ce document en lieu sûr.</strong>
        </div>
      </div>
    `;

    if (typeof window !== 'undefined') {
      let printArea = document.getElementById('thermal-print-area');
      if (!printArea) {
        printArea = document.createElement('div');
        printArea.id = 'thermal-print-area';
        document.body.appendChild(printArea);
      }
      printArea.className = 'paper-a4';
      printArea.innerHTML = html;

      setTimeout(() => {
        window.print();
      }, 50);
    }
  }
}

export const printerService = PrinterService.getInstance();
