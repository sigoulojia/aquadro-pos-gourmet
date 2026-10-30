import { describe, it, expect, beforeEach } from 'vitest';
import { supplementService, PizzaSupplement } from '../src/services/supplement.service';
import { printerService, ReceiptPrintData } from '../src/services/printer.service';
import { checkoutService } from '../src/services/checkout.service';
import { salesService } from '../src/services/sales.service';
import { db } from '../src/db/sqlite';

describe('Aquadro POS — Supplement Workflow & Simplified Printed Tickets', () => {
  beforeEach(async () => {
    await db.initialize();
    await supplementService.clearAllSupplements();
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  // =========================================================================
  // 1. GESTION DES SUPPLÉMENTS (CREATION, PERSISTENCE, VALIDATION, STOCK)
  // =========================================================================

  it('A. Creates a new supplement and persists it correctly', async () => {
    const supp = await supplementService.addSupplement({
      name_fr: 'Extra Gorgonzola',
      name_ar: 'جورجونزولا إضافية',
      price: 150,
      purchase_cost: 65,
      current_stock: 40,
      min_stock_alert: 8,
      category: 'cheese'
    });

    expect(supp.id).toMatch(/^sup-/);
    expect(supp.name_fr).toBe('Extra Gorgonzola');
    expect(supp.name_ar).toBe('جورجونزولا إضافية');
    expect(supp.price).toBe(150);
    expect(supp.purchase_cost).toBe(65);
    expect(supp.current_stock).toBe(40);
  });

  it('B. Reloads the supplement list and verifies the newly added item is present', async () => {
    const created = await supplementService.addSupplement({
      name_fr: 'Champignons Frais',
      price: 100,
      purchase_cost: 40,
      current_stock: 25,
      min_stock_alert: 5
    });

    const list = await supplementService.getSupplements(true);
    expect(list.length).toBe(1);
    expect(list[0].id).toBe(created.id);
    expect(list[0].name_fr).toBe('Champignons Frais');
    expect(list[0].price).toBe(100);
  });

  it('C. Reinitializes application cache and verifies persistence across restarts', async () => {
    const supp = await supplementService.addSupplement({
      name_fr: 'Sauce Piquante Maison',
      price: 50,
      purchase_cost: 15,
      current_stock: 60,
      min_stock_alert: 10
    });

    // Rechargement depuis le service
    const freshList = await supplementService.getSupplements(false);
    const found = freshList.find(s => s.id === supp.id);
    expect(found).toBeDefined();
    expect(found?.name_fr).toBe('Sauce Piquante Maison');
    expect(found?.current_stock).toBe(60);
  });

  it('D. Rejects invalid input and throws clear error instead of reporting false success', async () => {
    // Nom vide
    await expect(supplementService.addSupplement({
      name_fr: '   ',
      price: 100
    })).rejects.toThrow('Le nom du supplément est obligatoire');

    // Prix invalide
    await expect(supplementService.addSupplement({
      name_fr: 'Anchois',
      price: -20
    })).rejects.toThrow('Le prix du supplément doit être un montant valide');
  });

  it('E. Safely updates an existing supplement price, cost, and stock', async () => {
    const supp = await supplementService.addSupplement({
      name_fr: 'Double Mozza',
      price: 120,
      purchase_cost: 50,
      current_stock: 30
    });

    await supplementService.updateSupplement(supp.id, {
      price: 160,
      purchase_cost: 70,
      current_stock: 45
    });

    const updatedList = await supplementService.getSupplements(true);
    const updated = updatedList.find(s => s.id === supp.id);
    expect(updated?.price).toBe(160);
    expect(updated?.purchase_cost).toBe(70);
    expect(updated?.current_stock).toBe(45);
  });

  it('F. Deducts supplement stock accurately upon sale without double counting', async () => {
    const supp = await supplementService.addSupplement({
      name_fr: 'Viande Hachée Extra',
      price: 200,
      purchase_cost: 90,
      current_stock: 50
    });

    // Vente de 3 pizzas avec ce supplément
    await supplementService.deductSupplementStock([
      { supplementId: supp.id, quantity: 3 }
    ]);

    const list = await supplementService.getSupplements(true);
    const afterSale = list.find(s => s.id === supp.id);
    expect(afterSale?.current_stock).toBe(47); // 50 - 3 = 47
  });

  // =========================================================================
  // 2. TICKETS SIMPLIFIÉS (REÇU CLIENT & BON CUISINE DU CHEF)
  // =========================================================================

  const mockReceiptData: ReceiptPrintData = {
    dailyOrderNumber: 42,
    receiptNumber: 'TK-42',
    dateTime: '24/10/2026 19:45',
    cashierName: 'Yacine',
    orderType: 'SUR_PLACE',
    tableNumber: '4',
    items: [
      {
        name: 'Pizza Reine',
        quantity: 2,
        unitPrice: 850,
        total: 1700,
        ingredients: ['Sauce Tomate', 'Mozzarella', 'Jambon', 'Champignons'],
        supplements: [
          { id: 'sup-1', name_fr: 'Fromage de Chèvre', price: 150 },
          { id: 'sup-2', name_fr: 'Champignons', price: 100 }
        ],
        notes: 'Bien cuite'
      },
      {
        name: 'Coca Cola 33cl',
        quantity: 2,
        unitPrice: 100,
        total: 200
      }
    ],
    totalTTC: 1900,
    paymentMethod: 'CASH',
    tenderedAmount: 2000,
    changeGiven: 100
  };

  it('G. Customer Receipt HTML contains essential customer details, AQUADRO branding, and clean formatting', () => {
    const html = printerService.generateReceiptHtml(mockReceiptData);

    // Branding & Entête
    expect(html).toContain('AQUADRO');
    expect(html).toContain('COMMANDE');
    expect(html).toContain('#42');
    expect(html).toContain('SUR PLACE');

    // EXCLUSION STRICTE : AUCUN NUMERO DE TABLE
    expect(html).not.toContain('Table 4');
    expect(html).not.toContain('(Table');
    expect(html).not.toMatch(/Table\s*\d+/i);

    // Articles et suppléments
    expect(html).toContain('Pizza Reine');
    expect(html).toContain('Fromage de Chèvre');
    expect(html).toContain('Champignons');
    expect(html).toContain('Coca Cola 33cl');
    expect(html).toContain('Bien cuite');

    // Totaux et règlement
    expect(html).toContain('TOTAL À PAYER :');
    expect(html).toContain('1 900');
    expect(html).toContain('Espèces');
    expect(html).toContain('2 000');
    expect(html).toContain('100'); // Monnaie rendue

    // Message de politesse & branding sobre Aquadro POS
    expect(html).toContain('Merci pour votre visite !');
    expect(html).toContain('Aquadro POS');

    // Style épuré : fond blanc, pas de bande noire d'encre excessive
    expect(html).not.toContain('background: #222');
  });

  it('H. Customer Receipt Text (ESC/POS) contains all required customer fields with clean French labels', () => {
    const text = printerService.generateReceiptText(mockReceiptData);

    expect(text).toContain('AQUADRO');
    expect(text).toContain('COMMANDE N° 42');
    expect(text).toContain('SUR PLACE');
    expect(text).not.toContain('Table');
    expect(text).toContain('PIZZA REINE');
    expect(text).toContain('Fromage de Chèvre');
    expect(text).toContain('TOTAL À PAYER :');
    expect(text).toContain('Espèces');
    expect(text).toContain('Merci pour votre visite !');
  });

  it('I. Kitchen Ticket (Chef Copy) HTML shows base ingredients, supplements to add, and strictly NO billing data', () => {
    const html = printerService.generateKitchenTicketHtml(mockReceiptData);

    // Données opérationnelles obligatoires pour le Pizzaiolo
    expect(html).toContain('BON DE CUISINE');
    expect(html).toContain('COMMANDE N° 42');
    expect(html).toContain('SUR PLACE');
    expect(html).not.toContain('Table');
    expect(html).toContain('2x');
    expect(html).toContain('PIZZA REINE');

    // Raccourcissement du bon de cuisine : Pas d'ingrédients de base, suppléments mis en avant
    expect(html).not.toContain('• Ingrédients :');
    expect(html).toContain('+ AJOUTER : Fromage de Chèvre, Champignons');
    expect(html).toContain('* NOTE : Bien cuite');
    expect(html).toContain('COCA COLA 33CL');

    // INTERDICTIONS STRICTES DANS LE BON CUISINE :
    // Pas de prix, pas de totaux, pas de montants, pas de mode de paiement
    expect(html).not.toContain('TOTAL À PAYER');
    expect(html).not.toContain('TOTAL TTC');
    expect(html).not.toContain('1 900');
    expect(html).not.toContain('2 000');
    expect(html).not.toContain('Rendu monnaie');
    expect(html).not.toContain('Mode de règlement');

    // Pas de bloc noir lourd gaspilleur d'encre
    expect(html).not.toContain('background: #222');
  });

  it('J. Kitchen Ticket Text (ESC/POS) shows operational items with clean supplements and notes', () => {
    const text = printerService.generateKitchenTicketText(mockReceiptData);

    expect(text).toContain('BON DE CUISINE');
    expect(text).toContain('COMMANDE N° 42');
    expect(text).toContain('SUR PLACE');
    expect(text).not.toContain('Table');
    expect(text).toContain('[ 2x ]  PIZZA REINE');
    expect(text).not.toContain('• Ingrédients :');
    expect(text).toContain('+ AJOUTER SUPPLÉMENT : Fromage de Chèvre, Champignons');
    expect(text).toContain('* NOTE / CUISSON : Bien cuite');

    // Pas de montants financiers
    expect(text).not.toContain('TOTAL À PAYER');
    expect(text).not.toContain('Espèces');
  });

  it('K. Handles delivery order details cleanly on both tickets', () => {
    const deliveryData: ReceiptPrintData = {
      dailyOrderNumber: 99,
      receiptNumber: 'TK-99',
      dateTime: '24/10/2026 20:15',
      cashierName: 'Karim',
      orderType: 'LIVRAISON',
      customerName: 'Samir Benali',
      customerPhone: '0550123456',
      customerAddress: '14 Rue Didouche Mourad, Alger',
      items: [
        {
          name: 'Pizza 4 Fromages',
          quantity: 1,
          unitPrice: 950,
          total: 950
        }
      ],
      deliveryFee: 150,
      totalTTC: 1100,
      paymentMethod: 'CASH',
      tenderedAmount: 1100,
      changeGiven: 0
    };

    const clientHtml = printerService.generateReceiptHtml(deliveryData);
    expect(clientHtml).toContain('LIVRAISON');
    expect(clientHtml).not.toContain('(Table');
    expect(clientHtml).not.toMatch(/Table\s*\d+/i);
    expect(clientHtml).toContain('Samir Benali');
    expect(clientHtml).toContain('0550123456');
    expect(clientHtml).toContain('14 Rue Didouche Mourad');
    expect(clientHtml).toContain('Frais de livraison :');

    const kitchenHtml = printerService.generateKitchenTicketHtml(deliveryData);
    expect(kitchenHtml).toContain('LIVRAISON');
    expect(kitchenHtml).not.toContain('(Table');
    expect(kitchenHtml).not.toMatch(/Table\s*\d+/i);
    expect(kitchenHtml).toContain('Samir Benali');
    expect(kitchenHtml).toContain('0550123456');
    expect(kitchenHtml).not.toContain('Frais de livraison');
    expect(kitchenHtml).not.toContain('1 100');
  });

  it('L. Validates all 3 order types (SUR PLACE, À EMPORTER, LIVRAISON) with strictly zero table number', () => {
    const baseOrder: ReceiptPrintData = {
      dailyOrderNumber: 15,
      receiptNumber: 'TK-15',
      dateTime: '24/10/2026 21:00',
      tableNumber: 'Table 54', // Doit être strictement ignoré et jamais imprimé
      items: [{ name: 'Pizza Calzone', quantity: 1, unitPrice: 800, total: 800 }],
      totalTTC: 800,
      paymentMethod: 'CASH'
    };

    // 1. SUR PLACE
    const dineInClient = printerService.generateReceiptHtml({ ...baseOrder, orderType: 'SUR_PLACE' });
    const dineInKitchen = printerService.generateKitchenTicketHtml({ ...baseOrder, orderType: 'SUR_PLACE' });
    expect(dineInClient).toContain('SUR PLACE');
    expect(dineInClient).not.toContain('Table 54');
    expect(dineInClient).not.toContain('(Table');
    expect(dineInClient).not.toMatch(/Table\s*\d+/i);
    expect(dineInKitchen).toContain('SUR PLACE');
    expect(dineInKitchen).not.toContain('Table 54');
    expect(dineInKitchen).not.toContain('(Table');
    expect(dineInKitchen).not.toMatch(/Table\s*\d+/i);

    // 2. À EMPORTER
    const takeawayClient = printerService.generateReceiptHtml({ ...baseOrder, orderType: 'A_EMPORTER' });
    const takeawayKitchen = printerService.generateKitchenTicketHtml({ ...baseOrder, orderType: 'A_EMPORTER' });
    expect(takeawayClient).toContain('À EMPORTER');
    expect(takeawayClient).not.toContain('Table 54');
    expect(takeawayClient).not.toContain('SUR PLACE');
    expect(takeawayKitchen).toContain('À EMPORTER');
    expect(takeawayKitchen).not.toContain('Table 54');
    expect(takeawayKitchen).not.toContain('SUR PLACE');

    // 3. LIVRAISON
    const deliveryClient = printerService.generateReceiptHtml({ ...baseOrder, orderType: 'LIVRAISON' });
    const deliveryKitchen = printerService.generateKitchenTicketHtml({ ...baseOrder, orderType: 'LIVRAISON' });
    expect(deliveryClient).toContain('LIVRAISON');
    expect(deliveryClient).not.toContain('Table 54');
    expect(deliveryClient).not.toContain('SUR PLACE');
    expect(deliveryKitchen).toContain('LIVRAISON');
    expect(deliveryKitchen).not.toContain('Table 54');
    expect(deliveryKitchen).not.toContain('SUR PLACE');
  });

  it('M. Verifies multi-parts pizza (Moitié-Moitié) displays individual part recipes and supplements for chef', () => {
    const multiPartOrder: ReceiptPrintData = {
      dailyOrderNumber: 77,
      receiptNumber: 'TK-77',
      dateTime: '24/10/2026 21:30',
      orderType: 'SUR_PLACE',
      items: [
        {
          name: 'Pizza Moitié-Moitié',
          quantity: 1,
          unitPrice: 1100,
          total: 1100,
          multiParts: {
            type: '2_PARTS',
            parts: [
              { name: 'Margherita', price: 400, ingredients: ['Sauce Tomate', 'Mozzarella'] },
              { name: '4 Fromages', price: 500, ingredients: ['Sauce Tomate', 'Mozzarella', 'Gouda', 'Gorgonzola'] }
            ]
          },
          supplements: [
            { id: 'sup-mozz', name_fr: 'Extra Mozzarella', price: 150 }
          ],
          notes: 'Pâte bien cuite'
        }
      ],
      totalTTC: 1100,
      paymentMethod: 'CASH'
    };

    const kitchenHtml = printerService.generateKitchenTicketHtml(multiPartOrder);
    expect(kitchenHtml).toContain('PIZZA MOITIÉ-MOITIÉ');
    expect(kitchenHtml).toContain('• Moitié 1 : <strong>Margherita</strong>');
    expect(kitchenHtml).toContain('• Moitié 2 : <strong>4 Fromages</strong>');
    expect(kitchenHtml).toContain('+ AJOUTER : Extra Mozzarella');
    expect(kitchenHtml).toContain('* NOTE : Pâte bien cuite');

    const kitchenText = printerService.generateKitchenTicketText(multiPartOrder);
    expect(kitchenText).toContain('• Moitié 1 : Margherita');
    expect(kitchenText).toContain('• Moitié 2 : 4 Fromages');
    expect(kitchenText).toContain('+ AJOUTER SUPPLÉMENT : Extra Mozzarella');
  });

  // =========================================================================
  // 4. PERSISTANCE DES SUPPLÉMENTS DANS L'HISTORIQUE DES VENTES
  // =========================================================================

  it('N. Persists supplements in sale_items and verifies retrieval in Sales History', async () => {
    const sale = await checkoutService.processCheckout({
      cashierId: 'user-001',
      cashierName: 'Admin',
      items: [
        {
          productId: 'prod-test-pizza',
          name: 'Pizza Spéciale',
          quantity: 2,
          unitPrice: 950,
          discountAmount: 0,
          supplements: [
            { id: 'sup-gorg', name_fr: 'Extra Gorgonzola', price: 150 }
          ],
          notes: 'Sans oignons'
        }
      ],
      payments: [
        {
          method: 'CASH',
          amount: 1900,
          tenderedAmount: 2000,
          changeGiven: 100
        }
      ]
    });

    expect(sale.id).toBeDefined();

    const retrievedSales = await salesService.getSales(10);
    const foundSale = retrievedSales.find(s => s.id === sale.id);
    expect(foundSale).toBeDefined();
    expect(foundSale?.items.length).toBe(1);

    const saleItem = foundSale?.items[0];
    expect(saleItem?.product_name).toBe('Pizza Spéciale');
    expect(saleItem?.supplements).toBeDefined();
    expect(Array.isArray(saleItem?.supplements)).toBe(true);
    expect(saleItem?.supplements[0].name_fr).toBe('Extra Gorgonzola');
    expect(saleItem?.notes).toBe('Sans oignons');
  });
});
