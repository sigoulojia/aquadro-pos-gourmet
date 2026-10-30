// Aquadro POS Algérie V2 — Service d'Encaissement & Intégrité Financière (CheckoutService)
// RÈGLE CRITIQUE : Snapshot immuable du coût d'achat, allocation FEFO, génération du numéro de ticket, déduction atomique.

import { db } from '../db/sqlite';
import { Sale, SaleItem, Payment, PaymentMethod } from '../types/database';
import { inventoryService } from './inventory.service';
import { caisseService } from './caisse.service';
import { CurrencyUtil } from '../core/currency/currency';
import { documentService } from './document.service';
import { recipeService } from './recipe.service';
import { supplementService } from './supplement.service';

export interface CheckoutItemInput {
  productId: string;
  name: string;
  sku?: string;
  quantity: number;
  unitPrice: number;     // Prix unitaire TTC
  discountAmount: number;// Remise unitaire
  supplements?: any;
  multiParts?: Array<{ id?: string; name: string; price: number }>;
  notes?: string;
}

export interface PaymentInput {
  method: PaymentMethod;
  amount: number;
  tenderedAmount: number;
  changeGiven: number;
  tpeAuthReference?: string;
}

export interface ProcessCheckoutPayload {
  cashierId: string;
  cashierName: string;
  sessionId?: string;
  customerId?: string;
  customerName?: string;
  items: CheckoutItemInput[];
  payments: PaymentInput[];
  discountAmount?: number;
  notes?: string;
  deductRecipeAndSupplements?: boolean;
}

export class CheckoutService {
  private static instance: CheckoutService;

  private constructor() {}

  public static getInstance(): CheckoutService {
    if (!CheckoutService.instance) {
      CheckoutService.instance = new CheckoutService();
    }
    return CheckoutService.instance;
  }

  private parseSupplementsArray(supplements: any): any[] {
    if (!supplements) return [];
    if (Array.isArray(supplements)) return supplements;
    if (typeof supplements === 'string' && supplements.trim().startsWith('[')) {
      try {
        const parsed = JSON.parse(supplements);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  }

  // Assure qu'une pizza multi-parties possède ses lignes de recette proportionnelles enregistrées
  // afin que le calcul du coût matière (COGS), la déduction des ingrédients et le remboursement fonctionnent de manière uniforme.
  private async ensureMultiPartRecipeLinked(item: CheckoutItemInput): Promise<void> {
    if (!item.multiParts || item.multiParts.length === 0 || !item.productId) return;
    try {
      const now = new Date().toISOString();
      await db.execute(
        `INSERT OR IGNORE INTO products (
          id, sku, barcode, name_fr, name_ar, selling_price_ttc, purchase_cost,
          min_selling_price_ttc, current_stock, min_stock_alert, is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'بيتزا متعددة', ?, 0, 0, 100, 0, 1, ?, ?)`,
        [item.productId, `SKU-${item.productId}`, `BC-${item.productId}`, item.name || 'Pizza Multi', Math.round(item.unitPrice || 0), now, now]
      );

      const existingRecipe = await recipeService.getRecipeForProduct(item.productId);
      if (existingRecipe.length === 0) {
        const fraction = 1 / item.multiParts.length;
        const aggMap = new Map<string, { qty: number; unit?: string }>();
        for (const part of item.multiParts) {
          if (!part.id) continue;
          const partRecipe = await recipeService.getRecipeForProduct(part.id);
          for (const ri of partRecipe) {
            const prev = aggMap.get(ri.ingredient_id) || { qty: 0, unit: ri.unit_display };
            aggMap.set(ri.ingredient_id, {
              qty: prev.qty + ri.quantity_required * fraction,
              unit: prev.unit || ri.unit_display
            });
          }
        }
        const entries: Array<{ ingredient_id: string; quantity_required: number; unit_display?: string }> = [];
        for (const [ingId, info] of aggMap.entries()) {
          if (info.qty > 0) {
            entries.push({
              ingredient_id: ingId,
              quantity_required: Number(info.qty.toFixed(6)),
              unit_display: info.unit
            });
          }
        }
        if (entries.length > 0) {
          await recipeService.saveRecipe(item.productId, entries);
        }
      }
    } catch (err) {
      console.warn('[CheckoutService] Liaison recette multi-parties ignorée:', err);
    }
  }

  private async resolveEffectiveUnitPurchaseCost(item: CheckoutItemInput, baseBatchCost: number): Promise<number> {
    const explicitCost = Number(baseBatchCost) || 0;
    if (explicitCost > 0) {
      return Math.round(explicitCost);
    }

    let unitCost = 0;

    if (item.productId) {
      try {
        const recipeDetails = await recipeService.getRecipeForProduct(item.productId);
        if (recipeDetails.length > 0) {
          const recipeCost = recipeDetails.reduce((sum, r) => sum + (Number(r.cost_for_portion) || 0), 0);
          unitCost += Math.round(recipeCost);
        }
      } catch {}
    }

    const supps = this.parseSupplementsArray(item.supplements);
    if (supps.length > 0) {
      let allSuppsCatalog: any[] | null = null;
      for (const s of supps) {
        const sQty = Number(s?.quantity) || 1;
        let sCost = Number(s?.purchase_cost);
        if (!Number.isFinite(sCost) || sCost <= 0) {
          const sId = typeof s === 'string' ? s : (s?.id || s?.supplementId);
          if (sId) {
            if (!allSuppsCatalog) {
              try {
                allSuppsCatalog = await supplementService.getSupplements(true);
              } catch {
                allSuppsCatalog = [];
              }
            }
            const catalogList = allSuppsCatalog || [];
            const found = catalogList.find((x: any) => x.id === sId);
            sCost = Number(found?.purchase_cost) || 0;
          } else {
            sCost = 0;
          }
        }
        unitCost += Math.round(sCost * sQty);
      }
    }

    return Math.max(0, Math.round(unitCost));
  }

  private async deductRecipesAndSupplementsForItems(items: CheckoutItemInput[]): Promise<void> {
    const supplementsToDeduct: Array<{ supplementId: string; quantity: number }> = [];
    for (const item of items) {
      const supps = this.parseSupplementsArray(item.supplements);
      for (const s of supps) {
        const sId = typeof s === 'string' ? s : (s?.id || s?.supplementId);
        if (sId) {
          supplementsToDeduct.push({
            supplementId: sId,
            quantity: (Number(s?.quantity) || 1) * item.quantity
          });
        }
      }
    }
    if (supplementsToDeduct.length > 0) {
      try {
        await supplementService.deductSupplementStock(supplementsToDeduct);
      } catch (suppErr) {
        console.warn('[CheckoutService] Erreur déduction stock suppléments:', suppErr);
      }
    }

    for (const item of items) {
      try {
        await this.ensureMultiPartRecipeLinked(item);
        if (item.productId) {
          await recipeService.deductRecipeIngredientsForSale(item.productId, item.quantity);
        }
      } catch (recipeErr) {
        console.warn('[CheckoutService] Erreur déduction ingrédients recette:', recipeErr);
      }
    }
  }

  // Traitement atomique de l'encaissement (Délégué au Backend Rust en environnement Tauri)
  public async processCheckout(payload: ProcessCheckoutPayload): Promise<Sale> {
    if (!payload.items || payload.items.length === 0) {
      throw new Error('Le panier est vide. Impossible de finaliser la vente.');
    }
    if (!payload.payments || payload.payments.length === 0) {
      throw new Error('Aucun moyen de paiement fourni.');
    }

    // Validation stricte des articles et des règlements (Protection intégrité financière)
    for (const item of payload.items) {
      if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
        throw new Error(`Quantité invalide pour l'article "${item.name || item.productId}".`);
      }
      if (!Number.isFinite(item.unitPrice) || item.unitPrice < 0) {
        throw new Error(`Prix unitaire invalide pour l'article "${item.name || item.productId}".`);
      }
      const disc = item.discountAmount || 0;
      if (!Number.isFinite(disc) || disc < 0 || disc > item.unitPrice) {
        throw new Error(`Remise invalide pour l'article "${item.name || item.productId}".`);
      }
    }

    const globalDiscount = payload.discountAmount || 0;
    if (!Number.isFinite(globalDiscount) || globalDiscount < 0) {
      throw new Error('Montant de remise globale invalide.');
    }

    for (const p of payload.payments) {
      if (!Number.isFinite(p.amount) || p.amount <= 0) {
        throw new Error('Le montant du règlement doit être strictement supérieur à zéro.');
      }
      if (!Number.isFinite(p.tenderedAmount) || p.tenderedAmount < 0) {
        throw new Error('Le montant encaissé est invalide.');
      }
      if (p.method === 'CASH' && p.tenderedAmount < p.amount) {
        throw new Error('Le montant espèces remis est inférieur au montant du règlement.');
      }
    }

    const isTauri = typeof window !== 'undefined' && typeof (window as any).__TAURI_INTERNALS__?.invoke === 'function';

    if (isTauri) {
      const { invoke } = await import('@tauri-apps/api/core');

      const idempotencyKey = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });

      // Préparation de la payload pour le Rust
      const rustPayload = {
        idempotencyKey: idempotencyKey,
        cashierId: payload.cashierId,
        sessionId: payload.sessionId || null,
        customerId: payload.customerId || null,
        items: payload.items.map(item => ({
          productId: item.productId,
          quantity: item.quantity,
          unitPriceTtc: Math.round(item.unitPrice),
          discountAmount: Math.round(item.discountAmount || 0),
          supplements: item.supplements ? (typeof item.supplements === 'string' ? item.supplements : JSON.stringify(item.supplements)) : null,
          notes: item.notes || null
        })),
        payments: payload.payments.map(p => ({
          paymentMethod: p.method,
          amount: Math.round(p.amount),
          tenderedAmount: Math.round(p.tenderedAmount)
        }))
      };

      try {
        const response: any = await invoke('process_checkout', { payload: rustPayload });
        const saleId = response?.saleId || response?.sale_id || `sale-${Date.now()}`;
        const receiptNumber = response?.receiptNumber || response?.receipt_number || `TK-${Date.now().toString().slice(-6)}`;
        const totalTtc = response?.totalTtc !== undefined ? response.totalTtc : (response?.total_ttc || 0);

        if (payload.deductRecipeAndSupplements) {
          await this.deductRecipesAndSupplementsForItems(payload.items);
        }

        // Enregistrer automatiquement le document commercial officiel (Ticket)
        try {
          await documentService.registerDocument({
            type: 'TICKET',
            referenceId: receiptNumber,
            customerOrSupplierName: payload.customerName || (payload.notes ? payload.notes : 'Client Comptoir'),
            totalTtc: totalTtc
          });
        } catch (docErr) {
          console.warn('Enregistrement document commercial ignoré :', docErr);
        }
        
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('sale_completed'));
          window.dispatchEvent(new Event('sales_updated'));
        }

        return {
          id: saleId,
          receipt_number: receiptNumber,
          total_ttc: totalTtc,
          status: 'COMPLETED',
          session_id: payload.sessionId,
          cashier_id: payload.cashierId,
          cashier_name: payload.cashierName,
          customer_id: payload.customerId,
          customer_name: payload.customerName,
          created_at: new Date().toISOString(),
          items: [],
          payments: []
        } as unknown as Sale;
      } catch (err: any) {
        console.warn('[CheckoutService] Rust process_checkout échoué, bascule automatique vers le moteur SQLite direct :', err);
        // Ne pas bloquer la caisse : repli immédiat sur le moteur SQLite direct ci-dessous
      }
    }

    // --- Mode Hors-Tauri / Environnement de Tests Automatisés (Vitest/Node) ---
    // 1. Calcul des totaux
    let calculatedSubtotal = 0;
    for (const item of payload.items) {
      const lineTotal = CurrencyUtil.multiply(
        CurrencyUtil.subtract(item.unitPrice, item.discountAmount || 0),
        item.quantity
      );
      calculatedSubtotal = CurrencyUtil.add(calculatedSubtotal, lineTotal);
    }
    const finalTotalTTC = Math.max(0, CurrencyUtil.subtract(calculatedSubtotal, globalDiscount));

    // 2. Vérification des règlements
    const totalPaid = payload.payments.reduce((sum, p) => CurrencyUtil.add(sum, p.amount), 0);
    if (totalPaid < finalTotalTTC) {
      throw new Error(
        `Paiement insuffisant : Requis ${CurrencyUtil.formatDZD(finalTotalTTC)}, ` +
        `Versé ${CurrencyUtil.formatDZD(totalPaid)}.`
      );
    }

    const totalCreditAmount = payload.payments
      .filter(p => p.method === 'CREDIT')
      .reduce((sum, p) => CurrencyUtil.add(sum, p.amount), 0);
    if (totalCreditAmount > 0 && !payload.customerId) {
      throw new Error('Une vente à crédit nécessite obligatoirement la sélection d\'un client.');
    }

    const saleId = `sale-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const randSeq = Math.floor(1000 + Math.random() * 9000).toString();
    const internalRef = `REC-${dateStr}-${randSeq}`;

    // Enregistrer le document officiel (Ticket)
    await documentService.registerDocument({
      type: 'TICKET',
      referenceId: internalRef,
      customerOrSupplierName: payload.customerName || undefined,
      totalTtc: finalTotalTTC
    });
    
    const receiptNumber = internalRef;
    const idempotencyKey = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
    const createdAt = now.toISOString();

    // 3. Traiter chaque article selon FEFO et déduire le stock
    const saleItems: SaleItem[] = [];

    for (const item of payload.items) {
      await this.ensureMultiPartRecipeLinked(item);

      // Allocation FEFO
      const allocation = await inventoryService.allocateFefoBatches(item.productId, item.quantity);

      for (const alloc of allocation.allocations) {
        const effectiveUnitCost = await this.resolveEffectiveUnitPurchaseCost(item, alloc.unitPurchaseCost);

        const itemLineTotal = CurrencyUtil.multiply(
          CurrencyUtil.subtract(item.unitPrice, item.discountAmount || 0),
          alloc.quantityAllocated
        );

        const saleItem: SaleItem = {
          id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          sale_id: saleId,
          product_id: item.productId,
          product_name: item.name,
          sku: item.sku,
          batch_id: alloc.batchId !== 'default-batch' ? alloc.batchId : undefined,
          batch_number: alloc.batchNumber,
          quantity: alloc.quantityAllocated,
          unit_price_ttc: item.unitPrice,
          discount_amount: item.discountAmount || 0,
          total_ttc: itemLineTotal,
          unit_purchase_cost_snapshot: effectiveUnitCost,
          unit_purchase_price: effectiveUnitCost,
          unit_price: item.unitPrice,
          supplements: item.supplements ? (typeof item.supplements === 'string' ? item.supplements : JSON.stringify(item.supplements)) : null,
          notes: item.notes || undefined,
          created_at: createdAt
        };

        saleItems.push(saleItem);

        // Note: inventoryService.recordMovement met déjà à jour products.current_stock ET product_batches.current_stock (si batchId fourni)
        await inventoryService.recordMovement({
          productId: item.productId,
          batchId: alloc.batchId !== 'default-batch' ? alloc.batchId : undefined,
          movementType: 'SALE',
          quantityChange: -alloc.quantityAllocated,
          reason: `Vente ${receiptNumber} (Lot: ${alloc.batchNumber})`,
          referenceId: receiptNumber,
          unitCostSnapshot: effectiveUnitCost,
          userId: payload.cashierId,
          userName: payload.cashierName
        });
      }
    }

    // 3b. Déduire les ingrédients de la fiche technique (recette) et le stock des suppléments si demandé
    if (payload.deductRecipeAndSupplements) {
      await this.deductRecipesAndSupplementsForItems(payload.items);
    }

    // 4. Enregistrer la vente principale dans SQLite
    const sale: Sale = {
      id: saleId,
      receipt_number: receiptNumber,
      session_id: payload.sessionId,
      cashier_id: payload.cashierId,
      cashier_name: payload.cashierName,
      customer_id: payload.customerId,
      customer_name: payload.customerName,
      subtotal_ht: calculatedSubtotal,
      discount_amount: globalDiscount,
      tax_amount: 0,
      total_ttc: finalTotalTTC,
      status: 'COMPLETED',
      idempotency_key: idempotencyKey,
      sync_status: 'PENDING',
      created_at: createdAt,
      items: saleItems,
      payments: []
    };

    await db.execute(
      `INSERT INTO sales (
        id, receipt_number, session_id, cashier_id, customer_id,
        subtotal_ht, discount_amount, tax_amount, total_ttc, status,
        idempotency_key, sync_status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        sale.id, sale.receipt_number, sale.session_id || null, sale.cashier_id,
        sale.customer_id || null, sale.subtotal_ht, sale.discount_amount,
        sale.tax_amount, sale.total_ttc, sale.status, sale.idempotency_key,
        sale.sync_status, sale.created_at
      ]
    );

    // 5. Insérer les lignes de vente
    for (const si of saleItems) {
      await db.execute(
        `INSERT INTO sale_items (
          id, sale_id, product_id, product_name, batch_id, quantity, unit_price_ttc,
          discount_amount, total_ttc, unit_purchase_cost_snapshot,
          unit_purchase_price, unit_price, supplements, notes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          si.id, si.sale_id, si.product_id, si.product_name, si.batch_id || null, si.quantity,
          si.unit_price_ttc, si.discount_amount, si.total_ttc,
          si.unit_purchase_cost_snapshot,
          si.unit_purchase_cost_snapshot, si.unit_price_ttc,
          si.supplements || null, si.notes || null, si.created_at
        ]
      );
    }

    // 6. Insérer les paiements et mettre à jour la session de caisse
    const paymentsList: Payment[] = [];
    for (const p of payload.payments) {
      const payment: Payment = {
        id: `pay-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        sale_id: saleId,
        payment_method: p.method,
        amount: p.amount,
        tendered_amount: p.tenderedAmount,
        change_given: p.changeGiven,
        tpe_auth_reference: p.tpeAuthReference,
        created_at: createdAt
      };

      await db.execute(
        `INSERT INTO payments (
          id, sale_id, payment_method, amount, tendered_amount,
          change_given, tpe_auth_reference, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          payment.id, payment.sale_id, payment.payment_method, payment.amount,
          payment.tendered_amount, payment.change_given, payment.tpe_auth_reference || null,
          payment.created_at
        ]
      );

      paymentsList.push(payment);

      if (payload.sessionId) {
        await caisseService.recordSaleToSession(payload.sessionId, p.amount, p.method);
      }
    }

    sale.payments = paymentsList;

    if (payload.customerId) {
      const custs = await db.select<any>('SELECT * FROM customers WHERE id = ?', [payload.customerId]);
      if (custs.length > 0) {
        const c = custs[0];
        const pointsEarned = Math.floor(finalTotalTTC / 100);
        const newPoints = (c.loyalty_points || 0) + pointsEarned;
        const newSpent = CurrencyUtil.add(c.total_spent || 0, finalTotalTTC);
        const newDebt = totalCreditAmount > 0
          ? CurrencyUtil.add(c.current_debt || 0, totalCreditAmount)
          : (c.current_debt || 0);

        await db.execute(
          'UPDATE customers SET loyalty_points = ?, total_spent = ?, current_debt = ? WHERE id = ?',
          [newPoints, newSpent, newDebt, c.id]
        );
      }
    }

    await db.execute(
      `INSERT INTO sync_operations (
        id, table_name, record_id, action, payload, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        `sync-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        'sales',
        sale.id,
        'INSERT',
        JSON.stringify({ sale, items: saleItems, payments: paymentsList }),
        'PENDING',
        createdAt
      ]
    );

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('sale_completed'));
      window.dispatchEvent(new Event('sales_updated'));
    }

    return sale;
  }

  // Compatibilité tests et workflows tiers
  public async completeSale(
    cart: any,
    payments: PaymentInput[],
    cashierId: string = 'usr-csh-01',
    cashierName: string = 'Caissier',
    store?: any,
    customer?: any
  ): Promise<{ sale: Sale & { total_amount: number }; changeGiven: number }> {
    const rawItems = cart.items || cart || [];
    const items: CheckoutItemInput[] = rawItems.map((i: any) => ({
      productId: i.product_id || i.productId || i.id,
      name: i.name || i.product_name || 'Article',
      sku: i.sku,
      quantity: i.quantity || 1,
      unitPrice: i.unit_price || i.unitPrice || i.selling_price || 0,
      discountAmount: i.discount_amount || i.discountAmount || 0
    }));

    const attachedCustomer = customer || cart.customer;
    const sale = await this.processCheckout({
      cashierId,
      cashierName,
      customerId: attachedCustomer?.id,
      customerName: attachedCustomer?.name,
      items,
      payments
    });

    const totalChange = payments.reduce((sum, p) => CurrencyUtil.add(sum, p.changeGiven || 0), 0);
    const saleResult: any = {
      ...sale,
      total_amount: sale.total_ttc
    };

    return { sale: saleResult, changeGiven: totalChange };
  }
}

export const checkoutService = CheckoutService.getInstance();
