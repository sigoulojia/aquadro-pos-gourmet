// Aquadro POS Algérie V2 — Service d'Impression Thermique (58mm & 80mm ESC/POS)
// Formatage conforme au commerce algérien, mentions DGI, et impulsion tiroir-caisse RJ11

import { CurrencyUtil } from '../core/currency/currency';
import { ZReportSummary } from './caisse.service';

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

export class PrinterService {
  private static instance: PrinterService;
  private lastReceiptData: ReceiptPrintData | null = null;

  private constructor() {}

  public static getInstance(): PrinterService {
    if (!PrinterService.instance) {
      PrinterService.instance = new PrinterService();
    }
    return PrinterService.instance;
  }

  public getConfig(): { paperWidth: '58mm' | '80mm'; autoPrint: boolean; openDrawerOnSale: boolean } {
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('aquadro_printer_config');
        if (raw) return JSON.parse(raw);
      } catch (e) {}
    }
    return {
      paperWidth: '80mm',
      autoPrint: true,
      openDrawerOnSale: true
    };
  }

  public saveConfig(config: { paperWidth: '58mm' | '80mm'; autoPrint: boolean; openDrawerOnSale: boolean }): void {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('aquadro_printer_config', JSON.stringify(config));
      } catch (e) {}
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
      } catch (e) {}
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
      } catch (e) {}
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
      } catch (e) {}
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
  public generateReceiptText(data: ReceiptPrintData): string {
    const is80 = (data.paperWidth || this.getConfig().paperWidth) !== '58mm';
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

    // 1. En-tête : AQUADRO
    out.push(center('AQUADRO'));
    const storeFr = data.storeNameFr || data.storeName;
    if (storeFr && !storeFr.toUpperCase().includes('AQUADRO')) {
      out.push(center(storeFr));
    }
    if (data.storePhone) out.push(center(`Tél : ${data.storePhone}`));
    if (data.storeAddress) out.push(center(data.storeAddress));

    out.push(line);

    // 2. Numéro de commande, Mode de commande et Date
    out.push(center(`COMMANDE N° ${orderNumClean}`));
    const orderTypeLabel = this.getOrderTypeLabel(data.orderType);
    out.push(center(`>>> ${orderTypeLabel} <<<`));
    out.push(twoCols(`Ticket : ${receiptNumClean}`, `Date : ${data.dateTime}`));
    if (data.cashierName) {
      out.push(`Caissier : ${data.cashierName}`);
    }

    if (orderTypeLabel === 'LIVRAISON' && data.customerName) {
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

      if (item.quantity > 1) {
        out.push(`  (${item.quantity} x ${CurrencyUtil.formatDZD(item.unitPrice)})`);
      }

      if (item.multiParts && item.multiParts.parts) {
        item.multiParts.parts.forEach((p, idx) => {
          out.push(`  • Partie ${idx + 1} : ${p.name}`);
        });
      }

      if (item.supplements && item.supplements.length > 0) {
        const supps = item.supplements
          .map(s => (typeof s === 'string' ? s : `${s.name_fr} (+${CurrencyUtil.formatDZD(s.price)})`))
          .join(', ');
        out.push(`  + Supplément : ${supps}`);
      }

      if (item.notes) {
        out.push(`  Note : ${item.notes}`);
      }
    }

    if (data.deliveryFee && data.deliveryFee > 0) {
      out.push(line);
      out.push(twoCols('Frais de livraison :', CurrencyUtil.formatDZD(data.deliveryFee)));
    }

    if (data.discountTotal && data.discountTotal > 0) {
      out.push(twoCols('Remise :', `-${CurrencyUtil.formatDZD(data.discountTotal)}`));
    }

    if (data.taxAmount && data.taxAmount > 0) {
      out.push(twoCols(`TVA (${((data.taxRate || 0) * 100).toFixed(0)}%) :`, CurrencyUtil.formatDZD(data.taxAmount)));
    }

    out.push(separator);

    // 4. Montant net à payer
    const totalTTC = data.totalTTC ?? data.grandTotal ?? 0;
    out.push(twoCols('TOTAL À PAYER :', CurrencyUtil.formatDZD(totalTTC)));

    // 5. Règlements
    const paymentMethod = data.paymentMethod || data.payments?.[0]?.method || 'CASH';
    const tenderedAmount = data.tenderedAmount ?? data.payments?.[0]?.tendered ?? totalTTC;
    const changeGiven = data.changeGiven ?? data.payments?.[0]?.change ?? 0;

    const paymentLabel = paymentMethod === 'CASH'
      ? 'Espèces'
      : (paymentMethod === 'CARD' ? 'Carte bancaire' : (paymentMethod === 'BARIDIMOB' ? 'BaridiMob' : paymentMethod));

    out.push(twoCols('Mode de règlement :', paymentLabel));

    if (paymentMethod === 'CASH' && tenderedAmount > 0) {
      out.push(twoCols('Montant reçu :', CurrencyUtil.formatDZD(tenderedAmount)));
      if (changeGiven > 0) {
        out.push(twoCols('Monnaie rendue :', CurrencyUtil.formatDZD(changeGiven)));
      }
    }

    out.push(separator);

    // 6. Message de remerciement
    out.push(center('Merci pour votre visite !'));
    out.push(center('À bientôt'));

    return out.join('\n');
  }

  // Génération du rendu HTML thermique épuré et lisible pour le client
  public generateReceiptHtml(data: ReceiptPrintData): string {
    const is80 = (data.paperWidth || this.getConfig().paperWidth) !== '58mm';
    const totalTTC = data.totalTTC ?? data.grandTotal ?? 0;
    const paymentMethod = data.paymentMethod || data.payments?.[0]?.method || 'CASH';
    const tenderedAmount = data.tenderedAmount ?? data.payments?.[0]?.tendered ?? totalTTC;
    const changeGiven = data.changeGiven ?? data.payments?.[0]?.change ?? 0;

    const orderNumClean = this.getCleanOrderNumber(data.dailyOrderNumber, data.receiptNumber);
    const receiptNumClean = this.getCleanReceiptNumber(data.receiptNumber, orderNumClean);

    const storeFr = data.storeNameFr || data.storeName || '';
    const orderTypeLabel = this.getOrderTypeLabel(data.orderType);

    let logoHtml = '';
    if (typeof window !== 'undefined') {
      try {
        const logoBase64 = localStorage.getItem('aquadro_store_logo');
        if (logoBase64) {
          logoHtml = `<div style="text-align: center; margin-bottom: 4px;"><img src="${logoBase64}" style="max-width: 110px; max-height: 55px; object-fit: contain;" alt="Logo" /></div>`;
        }
      } catch (e) {}
    }

    const paymentLabel = paymentMethod === 'CASH'
      ? 'Espèces'
      : (paymentMethod === 'CARD' ? 'Carte bancaire' : (paymentMethod === 'BARIDIMOB' ? 'BaridiMob' : paymentMethod));

    return `
      <div class="thermal-receipt" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Courier New', monospace; color: #000; background: #fff; line-height: 1.35; width: 100%; box-sizing: border-box; font-size: 11px;">
        <!-- EN-TETE AQUADRO -->
        <div style="text-align: center; margin-bottom: 8px;">
          ${logoHtml}
          <div style="font-size: 19px; font-weight: 900; letter-spacing: 1.5px; text-transform: uppercase;">AQUADRO</div>
          ${storeFr && !storeFr.toUpperCase().includes('AQUADRO') ? `<div style="font-size: 11px; font-weight: bold; margin-top: 1px;">${storeFr}</div>` : ''}
          ${data.storePhone ? `<div style="font-size: 10px; margin-top: 2px;">Tél : ${data.storePhone}</div>` : ''}
          ${data.storeAddress ? `<div style="font-size: 9.5px; margin-top: 1px;">${data.storeAddress}</div>` : ''}
        </div>

        <!-- NUMÉRO ET TYPE DE COMMANDE -->
        <div style="border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 6px 0; text-align: center; margin-bottom: 8px;">
          <div style="font-size: 18px; font-weight: 900;">COMMANDE #${orderNumClean}</div>
          <div style="font-size: 12px; font-weight: 900; letter-spacing: 0.5px; text-transform: uppercase; margin-top: 1px;">${orderTypeLabel}</div>
        </div>

        <!-- DATE & INFORMATIONS SERVICE -->
        <div style="font-size: 10px; margin-bottom: 8px; border-bottom: 1px dashed #000; padding-bottom: 6px; line-height: 1.4;">
          <div style="display: flex; justify-content: space-between;">
            <span>Ticket : <strong>${receiptNumClean}</strong></span>
            <span>Date : ${data.dateTime}</span>
          </div>
          ${data.cashierName ? `<div>Caissier : <strong>${data.cashierName}</strong></div>` : ''}
          ${orderTypeLabel === 'LIVRAISON' && data.customerName ? `
            <div style="margin-top: 4px; padding-top: 4px; border-top: 1px dotted #000;">
              <div>Client : <strong>${data.customerName}</strong> ${data.customerPhone ? `(${data.customerPhone})` : ''}</div>
              ${data.customerAddress ? `<div>Adresse : ${data.customerAddress}</div>` : ''}
            </div>
          ` : ''}
        </div>

        <!-- LISTE DES ARTICLES COMMANDES -->
        <div style="border-bottom: 1px dashed #000; padding-bottom: 6px; margin-bottom: 8px;">
          <div style="display: flex; justify-content: space-between; font-size: 10px; font-weight: bold; border-bottom: 1px solid #000; padding-bottom: 3px; margin-bottom: 5px;">
            <span>Article</span>
            <span>Total</span>
          </div>
          ${data.items.map(item => {
            const suppNames = item.supplements && item.supplements.length > 0
              ? item.supplements.map(s => typeof s === 'string' ? s : `${s.name_fr} (+${CurrencyUtil.formatDZD(s.price)})`).join(', ')
              : '';
            const unitPriceStr = item.quantity > 1 ? `(${item.quantity} x ${CurrencyUtil.formatDZD(item.unitPrice)})` : '';
            return `
              <div style="margin-bottom: 6px; font-size: 10.5px; word-break: break-word;">
                <div style="display: flex; justify-content: space-between; align-items: baseline;">
                  <div style="font-weight: bold; padding-right: 6px;">
                    ${item.quantity}x ${item.name}${item.variant ? ` (${item.variant})` : ''}
                  </div>
                  <div style="font-weight: bold; white-space: nowrap;">
                    ${CurrencyUtil.formatDZD(item.total)}
                  </div>
                </div>
                ${unitPriceStr ? `<div style="font-size: 9.5px; color: #333; margin-left: 18px;">${unitPriceStr}</div>` : ''}
                ${item.multiParts && item.multiParts.parts ? `
                  <div style="font-size: 9.5px; color: #333; margin-left: 18px; margin-top: 1px;">
                    ${item.multiParts.parts.map((p, idx) => `<div>• Partie ${idx + 1} : ${p.name}</div>`).join('')}
                  </div>
                ` : ''}
                ${suppNames ? `<div style="font-size: 9.5px; color: #222; margin-left: 18px; margin-top: 1px;">+ Supplément : ${suppNames}</div>` : ''}
                ${item.notes ? `<div style="font-size: 9.5px; font-style: italic; color: #444; margin-left: 18px; margin-top: 1px;">Note : ${item.notes}</div>` : ''}
              </div>
            `;
          }).join('')}
        </div>

        <!-- SOUS-TOTAUX ET AJUSTEMENTS -->
        ${(data.deliveryFee && data.deliveryFee > 0) || (data.discountTotal && data.discountTotal > 0) || (data.taxAmount && data.taxAmount > 0) ? `
          <div style="font-size: 10px; margin-bottom: 6px;">
            ${data.deliveryFee && data.deliveryFee > 0 ? `
              <div style="display: flex; justify-content: space-between; padding: 1px 0;">
                <span>Frais de livraison :</span>
                <span>${CurrencyUtil.formatDZD(data.deliveryFee)}</span>
              </div>
            ` : ''}
            ${data.discountTotal && data.discountTotal > 0 ? `
              <div style="display: flex; justify-content: space-between; padding: 1px 0;">
                <span>Remise :</span>
                <span>-${CurrencyUtil.formatDZD(data.discountTotal)}</span>
              </div>
            ` : ''}
            ${data.taxAmount && data.taxAmount > 0 ? `
              <div style="display: flex; justify-content: space-between; padding: 1px 0;">
                <span>TVA (${((data.taxRate || 0) * 100).toFixed(0)}%) :</span>
                <span>${CurrencyUtil.formatDZD(data.taxAmount)}</span>
              </div>
            ` : ''}
          </div>
        ` : ''}

        <!-- TOTAL A PAYER -->
        <div style="border-top: 1.5px solid #000; border-bottom: 1.5px solid #000; padding: 6px 0; margin-bottom: 8px; display: flex; justify-content: space-between; font-size: 15px; font-weight: 900;">
          <span>TOTAL À PAYER :</span>
          <span>${CurrencyUtil.formatDZD(totalTTC)}</span>
        </div>

        <!-- PAIEMENT -->
        <div style="font-size: 10px; line-height: 1.4; margin-bottom: 10px;">
          <div style="display: flex; justify-content: space-between;">
            <span>Mode de règlement :</span>
            <strong>${paymentLabel}</strong>
          </div>
          ${paymentMethod === 'CASH' && tenderedAmount > 0 ? `
            <div style="display: flex; justify-content: space-between;">
              <span>Montant reçu :</span>
              <span>${CurrencyUtil.formatDZD(tenderedAmount)}</span>
            </div>
            ${changeGiven > 0 ? `
              <div style="display: flex; justify-content: space-between; font-weight: bold;">
                <span>Monnaie rendue :</span>
                <span>${CurrencyUtil.formatDZD(changeGiven)}</span>
              </div>
            ` : ''}
          ` : ''}
        </div>

        <!-- PIED DE TICKET AMICAL -->
        <div style="text-align: center; border-top: 1px dashed #000; padding-top: 8px; font-size: 11px;">
          <div style="font-weight: bold;">Merci pour votre visite !</div>
          <div style="font-size: 10px; color: #444; margin-top: 2px;">À bientôt chez AQUADRO</div>
        </div>
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
      } catch (e) {}
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

  // Envoyer la commande d'éjection du tiroir-caisse RJ11
  public async kickCashDrawer(): Promise<boolean> {
    if (typeof window !== 'undefined' && typeof (window as any).__TAURI_INTERNALS__?.invoke === 'function') {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const printerName = localStorage.getItem('aquadro_selected_printer') || null;
        const res: any = await invoke('open_cash_drawer', { pin: 0, printerName });
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
      } catch (e) {}
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
          <div style="display: flex; justify-content: space-between;"><span>Caissier:</span> <span>${data.session.cashier_name}</span></div>
          <div style="display: flex; justify-content: space-between;"><span>Fond Initial:</span> <span>${CurrencyUtil.formatDZD(data.session.opening_float)}</span></div>
          <div style="display: flex; justify-content: space-between;"><span>Ventes Espèces:</span> <span>${CurrencyUtil.formatDZD(data.paymentBreakdown.cash)}</span></div>
          <div style="display: flex; justify-content: space-between;"><span>Ventes CIB/Carte:</span> <span>${CurrencyUtil.formatDZD(data.paymentBreakdown.cib)}</span></div>
          <div style="display: flex; justify-content: space-between;"><span>Crédit/Impayé:</span> <span>${CurrencyUtil.formatDZD(data.paymentBreakdown.credit)}</span></div>
          <div style="display: flex; justify-content: space-between; color: red;"><span>Dépenses:</span> <span>-${CurrencyUtil.formatDZD(data.session.total_cash_expenses)}</span></div>
          <div style="border-top: 1px dashed #000; margin: 6px 0;"></div>
          <div style="display: flex; justify-content: space-between; font-weight: bold;"><span>Total Espèces Attendu:</span> <span>${CurrencyUtil.formatDZD(data.cashInDrawerExpected)}</span></div>
          <div style="display: flex; justify-content: space-between; font-weight: bold;"><span>Espèces Recomptées:</span> <span>${CurrencyUtil.formatDZD(data.cashInDrawerCounted)}</span></div>
          <div style="border-top: 1px dashed #000; margin: 6px 0;"></div>
          <div style="display: flex; justify-content: space-between; font-weight: bold;"><span>Écart:</span> <span>${CurrencyUtil.formatDZD(data.discrepancy)}</span></div>
        </div>
        <div style="border-top: 1px dashed #000; margin: 6px 0;"></div>
        <div style="text-align: center; font-size: 10px; margin-top: 15px;">
          <br/><br/>
          <span>Signature Responsable</span>
        </div>
      </div>
    `;
  }

  public async printZReport(data: ZReportSummary, triggerBrowserPrint = true): Promise<void> {
    const config = this.getConfig();

    if (typeof window !== 'undefined') {
      let printArea = document.getElementById('thermal-print-area');
      if (!printArea) {
        printArea = document.createElement('div');
        printArea.id = 'thermal-print-area';
        document.body.appendChild(printArea);
      }
      const paperWidth = config.paperWidth || '80mm';
      printArea.className = paperWidth === '58mm' ? 'paper-58mm' : 'paper-80mm';
      printArea.innerHTML = this.generateZReportHtml(data);
    }

    if (triggerBrowserPrint && typeof window !== 'undefined') {
      setTimeout(() => {
        window.print();
      }, 50);
    }
  }

  // Imprimer le ticket
  public async printReceipt(data: ReceiptPrintData, triggerBrowserPrint = true): Promise<void> {
    this.archiveReceipt(data);
    const config = this.getConfig();

    if (typeof window !== 'undefined') {

      // Mettre à jour la zone dédiée #thermal-print-area pour @media print
      let printArea = document.getElementById('thermal-print-area');
      if (!printArea) {
        printArea = document.createElement('div');
        printArea.id = 'thermal-print-area';
        document.body.appendChild(printArea);
      }

      // Déterminer si on imprime un reçu A4 Crédit ou un ticket thermique
      const isCredit = data.paymentMethod === 'CREDIT' || data.payments?.[0]?.method === 'CREDIT';

      if (isCredit) {
        printArea.className = 'paper-a4';
        printArea.innerHTML = this.generateA4CreditHtml(data);
      } else {
        const paperWidth = data.paperWidth || config.paperWidth || '80mm';
        printArea.className = paperWidth === '58mm' ? 'paper-58mm' : 'paper-80mm';
        printArea.innerHTML = this.generateReceiptHtml(data);
      }
    }

    const receiptText = this.generateReceiptText(data);

    // Si environnement Tauri natif
    if (typeof window !== 'undefined' && typeof (window as any).__TAURI_INTERNALS__?.invoke === 'function') {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('raw_print_receipt', { content: receiptText, printer_name: null });
      } catch (err) {
        console.warn('Impression native spooler non disponible :', err);
      }
    }

    // Ouvrir le dialogue d'impression système
    if (triggerBrowserPrint && typeof window !== 'undefined') {
      setTimeout(() => {
        window.print();
      }, 50);
    }
  }

  // =========================================================================
  // TICKET CUISINE / BON PIZZAIOLO (POUR LE CHEF)
  // =========================================================================

  // Génération du texte pour Bon de Cuisine (Chef Copy / Pizzaiolo)
  public generateKitchenTicketText(data: ReceiptPrintData): string {
    const is80 = (data.paperWidth || this.getConfig().paperWidth) !== '58mm';
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
    const orderTypeLabel = this.getOrderTypeLabel(data.orderType);

    out.push(separator);
    out.push(center('BON DE CUISINE • PIZZAIOLO'));
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

    // Articles opérationnels pour le Chef (Noms, Ingrédients de base et Suppléments à ajouter)
    for (const item of data.items) {
      out.push(`[ ${item.quantity}x ]  ${(item.name || '').toUpperCase()}${item.variant ? ` (${item.variant})` : ''}`);

      if (item.ingredients && item.ingredients.length > 0) {
        out.push(`    • Ingrédients : ${item.ingredients.join(', ')}`);
      }

      if (item.multiParts && item.multiParts.parts) {
        item.multiParts.parts.forEach((p, idx) => {
          const partIng = p.ingredients && p.ingredients.length > 0 ? ` (${p.ingredients.join(', ')})` : '';
          out.push(`    • Partie ${idx + 1} : ${p.name}${partIng}`);
        });
      }

      if (item.supplements && item.supplements.length > 0) {
        const supps = item.supplements
          .map(s => (typeof s === 'string' ? s : s.name_fr))
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

  // Rendu HTML du Bon de Cuisine pour le Chef (Pizzaiolo)
  public generateKitchenTicketHtml(data: ReceiptPrintData): string {
    const orderNumClean = this.getCleanOrderNumber(data.dailyOrderNumber, data.receiptNumber);
    const orderTypeLabel = this.getOrderTypeLabel(data.orderType);

    return `
      <div class="thermal-kitchen" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Courier New', monospace; color: #000; background: #fff; line-height: 1.35; width: 100%; box-sizing: border-box; font-size: 11px;">
        <!-- EN-TETE BON DE CUISINE -->
        <div style="text-align: center; border: 1.5px solid #000; padding: 6px 4px; margin-bottom: 8px; border-radius: 4px;">
          <div style="font-size: 11px; font-weight: 800; letter-spacing: 1px;">BON DE CUISINE • PIZZAIOLO</div>
          <div style="font-size: 26px; font-weight: 900; line-height: 1.1; margin: 2px 0;">COMMANDE N° ${orderNumClean}</div>
          <div style="font-size: 13px; font-weight: 900; letter-spacing: 0.5px; text-transform: uppercase;">${orderTypeLabel}</div>
        </div>

        <!-- DETAILS DATE & SERVEUR -->
        <div style="font-size: 10px; margin-bottom: 8px; border-bottom: 1px dashed #000; padding-bottom: 4px;">
          <div style="display: flex; justify-content: space-between;">
            <span>Heure : <strong>${data.dateTime}</strong></span>
            ${data.cashierName ? `<span>Serveur : <strong>${data.cashierName}</strong></span>` : ''}
          </div>
          ${orderTypeLabel === 'LIVRAISON' && data.customerName ? `
            <div style="margin-top: 3px;">
              Client : <strong>${data.customerName}</strong> ${data.customerPhone ? `(${data.customerPhone})` : ''}
            </div>
          ` : ''}
        </div>

        <!-- LISTE DES ARTICLES POUR LE CHEF -->
        <div style="margin-bottom: 8px;">
          ${data.items.map(item => {
            const suppNames = item.supplements && item.supplements.length > 0
              ? item.supplements.map(s => typeof s === 'string' ? s : s.name_fr).join(', ')
              : '';
            const ingredientsStr = item.ingredients && item.ingredients.length > 0
              ? item.ingredients.join(', ')
              : '';
            return `
              <div style="border-bottom: 1.5px solid #000; padding: 7px 0; word-break: break-word;">
                <!-- NOM ET QUANTITE -->
                <div style="display: flex; align-items: baseline; gap: 8px;">
                  <span style="font-size: 17px; font-weight: 900; min-width: 40px;">${item.quantity}x</span>
                  <span style="font-size: 14px; font-weight: 900; text-transform: uppercase;">
                    ${(item.name || '').toUpperCase()}${item.variant ? ` <span style="font-size: 11px; font-weight: normal;">(${item.variant})</span>` : ''}
                  </span>
                </div>

                <!-- INGREDIENTS DE BASE DE LA RECETTE -->
                ${ingredientsStr ? `
                  <div style="margin-left: 48px; font-size: 10px; color: #111; margin-top: 2px;">
                    • Ingrédients : <strong>${ingredientsStr}</strong>
                  </div>
                ` : ''}

                <!-- SI MULTI-PARTS (MOITIE-MOITIE / 4 SAISONS) -->
                ${item.multiParts && item.multiParts.parts ? `
                  <div style="margin-left: 48px; font-size: 10px; color: #111; margin-top: 2px;">
                    ${item.multiParts.parts.map((p, idx) => `
                      <div style="margin-top: 1px;">
                        • Partie ${idx + 1} : <strong>${p.name}</strong>
                        ${p.ingredients && p.ingredients.length > 0 ? `<span style="color: #333;"> (${p.ingredients.join(', ')})</span>` : ''}
                      </div>
                    `).join('')}
                  </div>
                ` : ''}

                <!-- SUPPLEMENTS QUE LE CHEF DOIT AJOUTER -->
                ${suppNames ? `
                  <div style="margin-left: 48px; font-size: 11px; font-weight: 900; color: #000; margin-top: 3px; border: 1px dashed #000; padding: 2px 5px; display: inline-block;">
                    + AJOUTER SUPPLÉMENT : ${suppNames}
                  </div>
                ` : ''}

                <!-- NOTES DE CUISSON -->
                ${item.notes ? `
                  <div style="margin-left: 48px; font-size: 10.5px; font-weight: bold; margin-top: 2px;">
                    * NOTE / CUISSON : ${item.notes}
                  </div>
                ` : ''}
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  // Imprimer le Bon de Cuisine (Pizzaiolo) uniquement
  public async printKitchenTicket(data: ReceiptPrintData, triggerBrowserPrint = true): Promise<void> {
    this.archiveReceipt(data);
    const config = this.getConfig();

    if (typeof window !== 'undefined') {
      let printArea = document.getElementById('thermal-print-area');
      if (!printArea) {
        printArea = document.createElement('div');
        printArea.id = 'thermal-print-area';
        document.body.appendChild(printArea);
      }
      const paperWidth = data.paperWidth || config.paperWidth || '80mm';
      printArea.className = paperWidth === '58mm' ? 'paper-58mm' : 'paper-80mm';
      printArea.innerHTML = this.generateKitchenTicketHtml(data);
    }

    const kitchenText = this.generateKitchenTicketText(data);

    if (typeof window !== 'undefined' && typeof (window as any).__TAURI_INTERNALS__?.invoke === 'function') {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('raw_print_receipt', { content: kitchenText, printer_name: null });
      } catch (err) {
        console.warn('Impression native spooler non disponible :', err);
      }
    }

    if (triggerBrowserPrint && typeof window !== 'undefined') {
      setTimeout(() => {
        window.print();
      }, 50);
    }
  }

  // Imprimer les deux tickets (Reçu Client + Bon Cuisine Pizzaiolo)
  public async printBothTickets(data: ReceiptPrintData, triggerBrowserPrint = false): Promise<void> {
    this.archiveReceipt(data);
    const config = this.getConfig();

    if (typeof window !== 'undefined') {
      let printArea = document.getElementById('thermal-print-area');
      if (!printArea) {
        printArea = document.createElement('div');
        printArea.id = 'thermal-print-area';
        document.body.appendChild(printArea);
      }
      const paperWidth = data.paperWidth || config.paperWidth || '80mm';
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

    // ESC/POS raw print with paper feed/cut in between
    const clientText = this.generateReceiptText(data);
    const kitchenText = this.generateKitchenTicketText(data);
    const combinedText = `${clientText}\n\n\n\x1d\x56\x00\n\n${kitchenText}\n\n\n\x1d\x56\x00`;

    if (typeof window !== 'undefined' && typeof (window as any).__TAURI_INTERNALS__?.invoke === 'function') {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('raw_print_receipt', { content: combinedText, printer_name: null });
      } catch (err) {
        console.warn('Impression native spooler non disponible :', err);
      }
    }

    if (triggerBrowserPrint && typeof window !== 'undefined') {
      setTimeout(() => {
        window.print();
      }, 50);
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
