import { describe, it, expect, beforeEach } from 'vitest';

const memoryStore: Record<string, string> = {};
const mockLocalStorage = {
  getItem: (k: string) => memoryStore[k] ?? null,
  setItem: (k: string, v: string) => { memoryStore[k] = String(v); },
  removeItem: (k: string) => { delete memoryStore[k]; },
  clear: () => {
    Object.keys(memoryStore).forEach(k => delete memoryStore[k]);
  }
};

(globalThis as any).window = globalThis;
(globalThis as any).localStorage = mockLocalStorage;

import { printerService, DEFAULT_RECEIPT_TEMPLATE_CONFIG, ReceiptPrintData } from '../src/services/printer.service';

describe('PrinterService — Payment Method & Mode de Règlement Configuration', () => {
  beforeEach(() => {
    mockLocalStorage.clear();
  });

  const sampleReceiptData: ReceiptPrintData = {
    receiptNumber: 'TK-20261026-001',
    dailyOrderNumber: 15,
    dateTime: '26/10/2026 18:30',
    cashierName: 'Caissier 1',
    orderType: 'SUR_PLACE',
    storeName: 'Aquadro Pizzeria',
    items: [
      {
        name: 'Pizza Margherita',
        quantity: 2,
        unitPrice: 650,
        totalPrice: 1300
      }
    ],
    totalTTC: 1300,
    paymentMethod: 'CASH',
    tenderedAmount: 1500,
    changeGiven: 200
  };

  it('renders Mode de règlement when showPaymentMethod is true', () => {
    const config = {
      ...DEFAULT_RECEIPT_TEMPLATE_CONFIG,
      showPaymentMethod: true,
      paymentMethodLabel: 'Mode de règlement',
      showTenderedAndChange: true
    };

    const html = printerService.generateReceiptHtml(sampleReceiptData, config);
    expect(html).toContain('Mode de règlement :');
    expect(html).toContain('Espèces');
    expect(html).toContain('Montant reçu :');
    expect(html).toContain('Monnaie rendue :');

    const text = printerService.generateReceiptText(sampleReceiptData, config);
    expect(text).toContain('Mode de règlement');
    expect(text).toContain('Espèces');
    expect(text).toContain('Montant reçu :');
    expect(text).toContain('Monnaie rendue :');
  });

  it('completely hides Mode de règlement and tendered/change when showPaymentMethod is false', () => {
    const config = {
      ...DEFAULT_RECEIPT_TEMPLATE_CONFIG,
      showPaymentMethod: false,
      showTenderedAndChange: true
    };

    const html = printerService.generateReceiptHtml(sampleReceiptData, config);
    expect(html).not.toContain('Mode de règlement');
    expect(html).not.toContain('Montant reçu :');
    expect(html).not.toContain('Monnaie rendue :');

    const text = printerService.generateReceiptText(sampleReceiptData, config);
    expect(text).not.toContain('Mode de règlement');
    expect(text).not.toContain('Montant reçu :');
    expect(text).not.toContain('Monnaie rendue :');
  });

  it('supports custom paymentMethodLabel (e.g., Arabic or French variant)', () => {
    const config = {
      ...DEFAULT_RECEIPT_TEMPLATE_CONFIG,
      showPaymentMethod: true,
      paymentMethodLabel: 'طريقة الدفع'
    };

    const html = printerService.generateReceiptHtml(sampleReceiptData, config);
    expect(html).toContain('طريقة الدفع :');

    const text = printerService.generateReceiptText(sampleReceiptData, config);
    expect(text).toContain('طريقة الدفع');
  });

  it('auto-migrates missing payment block in legacy saved template configs', () => {
    // Simulate legacy config without payment block in blockOrder
    const legacyConfig = {
      headerTitle: 'Aquadro Pizzeria',
      blockOrder: ['header', 'order_banner', 'order_info', 'items', 'subtotals', 'total', 'footer']
    };
    mockLocalStorage.setItem('aquadro_receipt_template_config', JSON.stringify(legacyConfig));

    const loaded = printerService.getTemplateConfig();
    expect(loaded.blockOrder).toContain('payment');
    // Ensure payment is inserted right before footer
    const paymentIndex = loaded.blockOrder.indexOf('payment');
    const footerIndex = loaded.blockOrder.indexOf('footer');
    expect(paymentIndex).toBe(footerIndex - 1);
  });
});
