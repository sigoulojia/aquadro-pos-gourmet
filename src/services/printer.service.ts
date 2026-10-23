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
    supplements?: Array<{ id: string; name_fr: string; price: number } | string>;
    multiParts?: {
      type: '2_PARTS' | '4_PARTS';
      parts: Array<{ name: string; price: number }>;
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

  // Génération du texte formaté pour ticket de caisse (ESC/POS simplifié et propre pour Pizzeria)
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

    // 1. Entête du Restaurant (Simple, sans mentions fiscales inutiles)
    const storeFr = data.storeNameFr || data.storeName || 'PIZZERIA GOURMET';
    out.push(center(storeFr.toUpperCase()));
    if (data.storeNameAr) out.push(center(data.storeNameAr));
    if (data.storePhone) out.push(center(`الهاتف: ${data.storePhone}`));
    if (data.storeAddress) out.push(center(data.storeAddress));

    // 2. Bannière N° Commande Proéminente
    out.push(separator);
    out.push(center(`*** طـلـب رقـم : #${orderNumClean} ***`));
    out.push(center(`COMMANDE N° #${orderNumClean}`));
    out.push(separator);

    // 3. Détails du Service & Vente
    const isDelivery = String(data.orderType || '').toUpperCase().includes('LIVRAISON');
    const isTakeaway = String(data.orderType || '').toUpperCase().includes('EMPORTER');
    const orderTypeLabel = isDelivery
      ? 'توصيل منزلي (LIVRAISON)'
      : isTakeaway
      ? 'سفري (À EMPORTER)'
      : `محلي (${data.tableNumber || 'طاولة'}) (SUR PLACE)`;

    out.push(twoCols(`النوع: ${orderTypeLabel}`, ''));
    out.push(twoCols(`التاريخ: ${data.dateTime}`, ''));
    out.push(twoCols(`البائع: ${data.cashierName || 'البائع'}`, `وصل: ${receiptNumClean}`));

    if (isDelivery) {
      if (data.customerName) out.push(`الزبون: ${data.customerName}`);
      if (data.customerPhone) out.push(`الهاتف: ${data.customerPhone}`);
      if (data.customerAddress) out.push(`العنوان: ${data.customerAddress}`);
      if (data.driverName) out.push(`عامل التوصيل: ${data.driverName}`);
    } else if (data.customerName) {
      out.push(`الزبون: ${data.customerName}`);
    }
    out.push(line);

    // 4. Articles vendus (Clair et rapide)
    out.push(twoCols('الطلب / ARTICLE', 'المجموع'));
    out.push(line);

    for (const item of data.items) {
      const itemTitle = item.variant ? `${item.name} (${item.variant})` : item.name;
      out.push(itemTitle);
      if (item.multiParts && item.multiParts.parts) {
        item.multiParts.parts.forEach((p, idx) => {
          out.push(`  • ف ${idx + 1}: ${p.name}`);
        });
      }
      if (item.supplements && item.supplements.length > 0) {
        const supps = item.supplements
          .map(s => (typeof s === 'string' ? s : `${s.name_fr} (+${CurrencyUtil.formatDZD(s.price)})`))
          .join(', ');
        out.push(`  + إضافات: ${supps}`);
      }
      if (item.notes) {
        out.push(`  * ملاحظة: ${item.notes}`);
      }
      const detailStr = `  ${item.quantity} x ${CurrencyUtil.formatDZD(item.unitPrice)}`;
      const totalStr = CurrencyUtil.formatDZD(item.total);
      out.push(twoCols(detailStr, totalStr));
    }

    if (data.deliveryFee && data.deliveryFee > 0) {
      out.push(line);
      out.push(twoCols('رسوم التوصيل:', CurrencyUtil.formatDZD(data.deliveryFee)));
    }

    out.push(separator);

    // 5. Total & Règlements (Simple et net)
    const totalTTC = data.totalTTC ?? data.grandTotal ?? 0;
    const paymentMethod = data.paymentMethod || data.payments?.[0]?.method || 'CASH';
    const tenderedAmount = data.tenderedAmount ?? data.payments?.[0]?.tendered ?? totalTTC;
    const changeGiven = data.changeGiven ?? data.payments?.[0]?.change ?? 0;

    out.push(twoCols('المجموع الكلي (TOTAL):', CurrencyUtil.formatDZD(totalTTC)));

    if (paymentMethod === 'CASH') {
      out.push(twoCols('طريقة الدفع:', 'نقداً (Espèces)'));
      if (tenderedAmount > 0) {
        out.push(twoCols('المدفوع:', CurrencyUtil.formatDZD(tenderedAmount)));
        out.push(twoCols('المتبقي للزبون:', CurrencyUtil.formatDZD(changeGiven)));
      }
    } else {
      out.push(twoCols('طريقة الدفع:', paymentMethod === 'CARD' ? 'بطاقة بنكية' : paymentMethod));
    }

    out.push(separator);

    // 6. Pied de ticket chaleureux
    out.push(center('صحة و عافية'));
    out.push(center('شكراً لزيارتكم ونتشرف بخدمتكم دائماً'));
    out.push(center('MERCI DE VOTRE VISITE'));

    return out.join('\n');
  }

  // Génération du rendu HTML thermique épuré et moderne pour le client
  public generateReceiptHtml(data: ReceiptPrintData): string {
    const is80 = (data.paperWidth || this.getConfig().paperWidth) !== '58mm';
    const totalTTC = data.totalTTC ?? data.grandTotal ?? 0;
    const paymentMethod = data.paymentMethod || data.payments?.[0]?.method || 'CASH';
    const tenderedAmount = data.tenderedAmount ?? data.payments?.[0]?.tendered ?? totalTTC;
    const changeGiven = data.changeGiven ?? data.payments?.[0]?.change ?? 0;

    const orderNumClean = this.getCleanOrderNumber(data.dailyOrderNumber, data.receiptNumber);
    const receiptNumClean = this.getCleanReceiptNumber(data.receiptNumber, orderNumClean);

    const storeFr = data.storeNameFr || data.storeName || 'PIZZERIA GOURMET';
    const storeAr = data.storeNameAr || 'بيتزيريا';

    let logoHtml = '';
    if (typeof window !== 'undefined') {
      try {
        const logoBase64 = localStorage.getItem('aquadro_store_logo') || localStorage.getItem('pizzeria_store_logo');
        if (logoBase64) {
          logoHtml = `<div style="text-align: center; margin-bottom: 6px;"><img src="${logoBase64}" style="max-width: 80px; max-height: 80px; display: inline-block; object-fit: contain;" alt="Logo" /></div>`;
        }
      } catch (e) {}
    }

    const isDelivery = String(data.orderType || '').toUpperCase().includes('LIVRAISON');
    const isTakeaway = String(data.orderType || '').toUpperCase().includes('EMPORTER');
    const orderTypeLabel = isDelivery
      ? 'توصيل منزلي / LIVRAISON'
      : isTakeaway
      ? 'سفري / À EMPORTER'
      : `محلي (${data.tableNumber || 'طاولة'}) / SUR PLACE`;

    return `
      <div class="thermal-receipt" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Courier New', monospace; color: #111; line-height: 1.35; width: 100%; box-sizing: border-box;">
        <!-- EN-TETE DU RESTAURANT -->
        ${logoHtml}
        <div style="text-align: center; margin-bottom: 6px;">
          <div style="font-size: 15px; font-weight: 900; letter-spacing: 0.5px; text-transform: uppercase;">${storeFr}</div>
          ${storeAr ? `<div style="font-size: 13px; font-weight: bold; direction: rtl; margin-top: 2px;">${storeAr}</div>` : ''}
          ${data.storePhone ? `<div style="font-size: 10.5px; margin-top: 2px;">الهاتف: <strong>${data.storePhone}</strong></div>` : ''}
          ${data.storeAddress ? `<div style="font-size: 10px; color: #444; margin-top: 1px;">${data.storeAddress}</div>` : ''}
        </div>

        <!-- BANNIÈRE NUMÉRO DE COMMANDE DU JOUR TRÈS VISIBLE -->
        <div style="border: 2px dashed #111; background: #fafafa; padding: 6px 4px; text-align: center; margin: 6px 0; border-radius: 8px;">
          <div style="font-size: 11px; font-weight: bold; color: #555; direction: rtl;">طلب رقم</div>
          <div style="font-size: 32px; font-weight: 900; letter-spacing: 2px; color: #000; margin: 1px 0; line-height: 1.1;">#${orderNumClean}</div>
          <div style="font-size: 10.5px; font-weight: 800; background: #eee; padding: 2px 8px; display: inline-block; border-radius: 4px; margin-top: 2px;">
            ${orderTypeLabel}
          </div>
          <div style="font-size: 9px; color: #777; font-family: monospace; margin-top: 3px;">وصل: ${receiptNumClean}</div>
        </div>

        <!-- DETAILS VENTE & CAISSIER -->
        <div style="font-size: 10px; margin: 6px 0; border-bottom: 1px dashed #000; padding-bottom: 5px;">
          <div style="display: flex; justify-content: space-between;">
            <span>التاريخ:</span>
            <strong>${data.dateTime}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; margin-top: 2px;">
            <span>البائع:</span>
            <strong>${data.cashierName || 'البائع'}</strong>
          </div>
          ${isDelivery ? `
            <div style="background: #f7f7f7; border: 1px solid #ddd; padding: 5px; margin-top: 4px; border-radius: 4px; font-size: 9.5px;">
              ${data.customerName ? `<div><strong>الزبون:</strong> ${data.customerName}</div>` : ''}
              ${data.customerPhone ? `<div><strong>الهاتف:</strong> <span style="font-weight: bold;">${data.customerPhone}</span></div>` : ''}
              ${data.customerAddress ? `<div><strong>العنوان:</strong> ${data.customerAddress}</div>` : ''}
              ${data.driverName ? `<div><strong>عامل التوصيل:</strong> ${data.driverName}</div>` : ''}
            </div>
          ` : (data.customerName ? `
            <div style="display: flex; justify-content: space-between; margin-top: 2px;">
              <span>الزبون:</span>
              <strong>${data.customerName}</strong>
            </div>
          ` : '')}
        </div>

        <!-- TABLEAU DES ARTICLES -->
        <table style="width: 100%; border-collapse: collapse; font-size: 10.5px; text-align: left;">
          <thead>
            <tr style="border-bottom: 1.5px solid #000; font-size: 10px;">
              <th style="padding: 3px 0; text-align: right; direction: rtl;">الطلب</th>
              <th style="text-align: center; padding: 3px 0; width: 34px;">العدد</th>
              <th style="text-align: right; padding: 3px 0; width: 55px;">السعر</th>
              <th style="text-align: right; padding: 3px 0; width: 60px;">المجموع</th>
            </tr>
          </thead>
          <tbody>
            ${data.items.map(item => {
              const suppNames = item.supplements && item.supplements.length > 0
                ? item.supplements.map(s => typeof s === 'string' ? s : `${s.name_fr} (+${CurrencyUtil.formatDZD(s.price)})`).join(', ')
                : '';
              return `
              <tr>
                <td colspan="4" style="padding-top: 5px; font-weight: bold; text-align: right; direction: rtl;">
                  ${item.name} ${item.variant ? `<span style="font-size: 9.5px; font-weight: normal;">(${item.variant})</span>` : ''}
                  ${item.multiParts && item.multiParts.parts ? `
                    <div style="font-size: 9px; font-weight: normal; color: #444; margin-top: 1px;">
                      ${item.multiParts.parts.map((p, idx) => `<div>• ف ${idx + 1}: ${p.name}</div>`).join('')}
                    </div>
                  ` : ''}
                  ${suppNames ? `<div style="font-size: 9px; font-weight: normal; color: #333;">+ إضافات: ${suppNames}</div>` : ''}
                  ${item.notes ? `<div style="font-size: 9px; font-style: italic; color: #555;">* ملاحظة: ${item.notes}</div>` : ''}
                </td>
              </tr>
              <tr style="border-bottom: 1px dotted #ccc;">
                <td style="padding-bottom: 4px;"></td>
                <td style="text-align: center; padding-bottom: 4px; font-weight: bold;">${item.quantity}</td>
                <td style="text-align: right; padding-bottom: 4px;">${CurrencyUtil.formatDZD(item.unitPrice)}</td>
                <td style="text-align: right; padding-bottom: 4px; font-weight: bold;">${CurrencyUtil.formatDZD(item.total)}</td>
              </tr>
              `;
            }).join('')}
          </tbody>
        </table>

        ${data.deliveryFee && data.deliveryFee > 0 ? `
          <div style="display: flex; justify-content: space-between; font-size: 10.5px; padding: 4px 0; border-top: 1px dotted #000;">
            <span>رسوم التوصيل:</span>
            <strong>${CurrencyUtil.formatDZD(data.deliveryFee)}</strong>
          </div>
        ` : ''}

        <!-- TOTAL GENERAL SIMPLE ET NET -->
        <div style="margin-top: 6px; border-top: 1.5px solid #000; border-bottom: 1.5px solid #000; padding: 6px 0;">
          <div style="display: flex; justify-content: space-between; font-size: 15px; font-weight: 900;">
            <span>المجموع (TOTAL):</span>
            <span>${CurrencyUtil.formatDZD(totalTTC)}</span>
          </div>
        </div>

        <!-- MODE DE PAIEMENT & MONNAIE RENDUE -->
        <div style="font-size: 10px; margin-top: 5px; padding: 2px 0;">
          <div style="display: flex; justify-content: space-between;">
            <span>طريقة الدفع:</span>
            <strong>${paymentMethod === 'CASH' ? 'نقداً (Espèces)' : paymentMethod === 'CARD' ? 'بطاقة بنكية' : paymentMethod}</strong>
          </div>
          ${paymentMethod === 'CASH' && tenderedAmount > 0 ? `
            <div style="display: flex; justify-content: space-between; margin-top: 2px;">
              <span>المدفوع:</span>
              <span>${CurrencyUtil.formatDZD(tenderedAmount)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 11px; font-weight: bold; margin-top: 2px;">
              <span>المتبقي للزبون:</span>
              <span>${CurrencyUtil.formatDZD(changeGiven)}</span>
            </div>
          ` : ''}
        </div>

        <!-- PIED DE TICKET CHALEUREUX -->
        <div style="text-align: center; font-size: 10px; margin-top: 10px; border-top: 1px dashed #000; padding-top: 6px;">
          <div style="font-size: 15px; font-weight: 900; color: #000; margin-bottom: 2px;">صحة و عافية</div>
          <div style="font-size: 11px; font-weight: bold; direction: rtl; margin-bottom: 2px;">شكرًا لزيارتكم ونتشرف بخدمتكم دائماً</div>
          <div style="font-size: 9px; color: #666;">MERCI DE VOTRE VISITE • BON APPÉTIT</div>
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
    this.lastReceiptData = data;
    const config = this.getConfig();

    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('aquadro_last_receipt', JSON.stringify(data));
      } catch (e) {}

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

  // Génération du texte pour Bon de Cuisine (Pizzaiolo)
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

    out.push(separator);
    out.push(center('*** بـون المـطبـخ - الشـيـف ***'));
    out.push(center(`طـلـب رقـم : #${orderNumClean}`));
    out.push(separator);

    const isDelivery = String(data.orderType || '').toUpperCase().includes('LIVRAISON');
    const isTakeaway = String(data.orderType || '').toUpperCase().includes('EMPORTER');
    const typeLabel = isDelivery
      ? '>>> توصيل منزلي / LIVRAISON <<<'
      : isTakeaway
      ? '>>> سفري / À EMPORTER <<<'
      : `>>> محلي / SUR PLACE (${data.tableNumber || 'طاولة 1'}) <<<`;
    out.push(center(typeLabel));

    out.push(twoCols(`الوقت: ${data.dateTime}`, `البائع: ${data.cashierName || 'البائع'}`));

    if (isDelivery) {
      out.push(line);
      if (data.customerName) out.push(`الزبون: ${data.customerName}`);
      if (data.customerPhone) out.push(`الهاتف: ${data.customerPhone}`);
      if (data.customerAddress) out.push(`العنوان: ${data.customerAddress}`);
      if (data.driverName) out.push(`عامل التوصيل: ${data.driverName}`);
    } else if (data.customerName) {
      out.push(`الزبون: ${data.customerName}`);
    }

    out.push(line);
    out.push(twoCols('الكمية - الصنف', 'ملاحظات وإضافات'));
    out.push(line);

    for (const item of data.items) {
      const itemTitle = `${item.quantity}x ${item.name}${item.variant ? ` (${item.variant})` : ''}`;
      out.push(itemTitle);

      if (item.multiParts && item.multiParts.parts) {
        item.multiParts.parts.forEach((p, idx) => {
          out.push(`  • فصل ${idx + 1}: ${p.name}`);
        });
      }

      if (item.supplements && item.supplements.length > 0) {
        const supps = item.supplements
          .map(s => (typeof s === 'string' ? s : s.name_fr))
          .join(', ');
        out.push(`  + إضافات: ${supps}`);
      }

      if (item.notes) {
        out.push(`  * ملاحظة: ${item.notes}`);
      }
    }

    out.push(separator);
    out.push(center('*** بالتوفيق للشيف ***'));

    return out.join('\n');
  }

  // Rendu HTML du Bon de Cuisine pour le Pizzaiolo (plus petit et compact en format tableau)
  public generateKitchenTicketHtml(data: ReceiptPrintData): string {
    const isDelivery = String(data.orderType || '').toUpperCase().includes('LIVRAISON');
    const isTakeaway = String(data.orderType || '').toUpperCase().includes('EMPORTER');
    const orderNumClean = this.getCleanOrderNumber(data.dailyOrderNumber, data.receiptNumber);

    return `
      <div class="thermal-kitchen" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Courier New', monospace; color: #000; line-height: 1.25; width: 100%; max-width: 95%; margin: 0 auto; box-sizing: border-box; font-size: 10px;">
        <!-- EN-TETE BON CUISINE -->
        <div style="text-align: center; border-bottom: 2px solid #000; padding-bottom: 3px; margin-bottom: 4px;">
          <div style="font-size: 14px; font-weight: 900; letter-spacing: 0.5px;">*** بـون المـطبـخ / الشـيـف ***</div>
          <div style="font-size: 9.5px; font-weight: bold; color: #444;">BON CUISINE PIZZAIOLO</div>
        </div>

        <!-- NUMÉRO DE COMMANDE PROÉMINENT DU CHEF -->
        <div style="text-align: center; border: 2px solid #000; background-color: #f2f2f2; padding: 4px 2px; margin-bottom: 4px; border-radius: 6px;">
          <div style="font-size: 10px; font-weight: bold; color: #444;">طلب رقم</div>
          <div style="font-size: 30px; font-weight: 900; letter-spacing: 2px; color: #000; line-height: 1.1;">#${orderNumClean}</div>
        </div>

        <!-- BADGE TYPE DE COMMANDE VISIBLE -->
        <div style="text-align: center; border: 1.5px solid #000; padding: 4px 2px; font-size: 11.5px; font-weight: 900; background-color: #f8f8f8; margin-bottom: 4px; border-radius: 4px;">
          ${isDelivery ? 'توصيل منزلي / LIVRAISON' : isTakeaway ? 'سفري / À EMPORTER' : `محلي (${data.tableNumber || 'طاولة'}) / SUR PLACE`}
        </div>

        ${isDelivery ? `
          <div style="font-size: 9.5px; background: #fafafa; border: 1px dashed #000; padding: 4px; margin-bottom: 4px; border-radius: 3px;">
            ${data.customerName ? `<div><strong>الزبون:</strong> ${data.customerName}</div>` : ''}
            ${data.customerPhone ? `<div><strong>الهاتف:</strong> <span style="font-weight: bold; font-size: 10.5px;">${data.customerPhone}</span></div>` : ''}
            ${data.customerAddress ? `<div><strong>العنوان:</strong> ${data.customerAddress}</div>` : ''}
            ${data.driverName ? `<div><strong>عامل التوصيل:</strong> ${data.driverName}</div>` : ''}
          </div>
        ` : (data.customerName ? `<div style="font-size: 9.5px; margin-bottom: 4px;"><strong>الزبون:</strong> ${data.customerName}</div>` : '')}

        <div style="display: flex; justify-content: space-between; font-size: 9.5px; margin-bottom: 4px; border-bottom: 1px dashed #000; padding-bottom: 2px;">
          <span>الوقت: ${data.dateTime}</span>
          <span>البائع: <strong>${data.cashierName || 'البائع'}</strong></span>
        </div>

        <!-- TABLEAU DES CONTENUS POUR LE CHEF -->
        <table style="width: 100%; border-collapse: collapse; font-size: 10.5px; border: 1.5px solid #000; margin-top: 4px;">
          <thead>
            <tr style="background: #222; color: #fff;">
              <th style="padding: 3px 2px; text-align: center; width: 34px; border: 1px solid #444; font-size: 10px;">العدد</th>
              <th style="padding: 3px 4px; text-align: right; border: 1px solid #444; font-size: 10px; direction: rtl;">الصنف والنوع</th>
              <th style="padding: 3px 4px; text-align: right; border: 1px solid #444; font-size: 10px; direction: rtl;">الإضافات وملاحظات التحضير</th>
            </tr>
          </thead>
          <tbody>
            ${data.items.map((item, idx) => {
              const suppNames = item.supplements && item.supplements.length > 0
                ? item.supplements.map(s => typeof s === 'string' ? s : s.name_fr).join('، ')
                : '';
              return `
                <tr style="border-bottom: 1.5px solid #000; background: ${idx % 2 === 0 ? '#fff' : '#fcfcfc'};">
                  <td style="padding: 4px 2px; text-align: center; font-weight: 900; font-size: 13px; border: 1px solid #000; vertical-align: top;">
                    ${item.quantity}x
                  </td>
                  <td style="padding: 4px; border: 1px solid #000; vertical-align: top; text-align: right; direction: rtl;">
                    <div style="font-weight: 900; font-size: 11.5px; text-transform: uppercase;">${item.name}</div>
                    ${item.variant ? `<div style="font-size: 9.5px; color: #333; margin-top: 1px;">• النوع: <strong>${item.variant}</strong></div>` : ''}
                    ${item.multiParts && item.multiParts.parts ? `
                      <div style="font-size: 9px; color: #222; margin-top: 1px;">
                        ${item.multiParts.parts.map((p, pIdx) => `<div>- ف ${pIdx + 1}: <strong>${p.name}</strong></div>`).join('')}
                      </div>
                    ` : ''}
                  </td>
                  <td style="padding: 4px; border: 1px solid #000; vertical-align: top; text-align: right; direction: rtl;">
                    ${suppNames ? `
                      <div style="font-size: 9.5px; font-weight: bold; color: #000;">
                        + إضافات: ${suppNames}
                      </div>
                    ` : ''}
                    ${item.notes ? `
                      <div style="font-size: 9px; font-weight: bold; color: #b91c1c; margin-top: 2px; background: #fee2e2; padding: 1px 3px; border-radius: 2px;">
                        * ملاحظة: ${item.notes}
                      </div>
                    ` : ''}
                    ${!suppNames && !item.notes && !item.multiParts ? `<span style="color: #888; font-size: 8.5px;">عادي</span>` : ''}
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>

        <!-- PIED DE BON CUISINE -->
        <div style="border-top: 1.5px solid #000; margin-top: 6px; padding-top: 3px; text-align: center; font-size: 9px; font-weight: bold;">
          <div>وقت استلام الطلب: ${data.dateTime} • طلب #${orderNumClean}</div>
          <div style="font-size: 10px; margin-top: 2px;">*** بالتوفيق للشيف ***</div>
        </div>
      </div>
    `;
  }

  // Imprimer le Bon de Cuisine (Pizzaiolo) uniquement
  public async printKitchenTicket(data: ReceiptPrintData, triggerBrowserPrint = true): Promise<void> {
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
    this.lastReceiptData = data;
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
