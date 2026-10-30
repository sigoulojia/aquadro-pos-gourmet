// Aquadro POS Algérie V2 — Service de Gestion des Ventes & Remboursements Contrôlés
// Historique immuable, réimpression et remboursements autorisés par code PIN Responsable

import { db } from '../db/sqlite';
import { Sale, SaleItem, Payment, Refund, RefundItem, Product } from '../types/database';
import { inventoryService } from './inventory.service';
import { caisseService } from './caisse.service';
import { CurrencyUtil } from '../core/currency/currency';
import { recipeService } from './recipe.service';
import { supplementService } from './supplement.service';

export interface ProcessRefundPayload {
  saleId: string;
  cashierId: string;
  cashierName: string;
  itemsToRefund: Array<{
    saleItemId: string;
    productId: string;
    quantity: number;
    unitPrice?: number;
    unitPurchasePrice?: number;
    restock: boolean;
  }>;
  reason: string;
  paymentMethod?: 'CASH' | 'CIB' | 'EDAHABIA' | 'BARIDIMOB' | 'CREDIT';
  managerPin?: string;
  sessionId?: string;
}

export class SalesService {
  private static instance: SalesService;

  private constructor() {}

  public static getInstance(): SalesService {
    if (!SalesService.instance) {
      SalesService.instance = new SalesService();
    }
    return SalesService.instance;
  }

  public async getSales(limit: number = 100): Promise<Sale[]> {
    const sales = await db.select<Sale>(
      `SELECT * FROM sales ORDER BY created_at DESC LIMIT ${limit}`
    );
    const allItems = await db.select<SaleItem>('SELECT * FROM sale_items');
    const allPayments = await db.select<Payment>('SELECT * FROM payments');
    const allProducts = await db.select<Product>('SELECT * FROM products');
    const productMap = new Map(allProducts.map(p => [p.id, p]));

    return sales.map(s => ({
      ...s,
      items: allItems
        .filter(i => i.sale_id === s.id)
        .map(i => {
          const prod = productMap.get(i.product_id);
          let parsedSupplements = (i as any).supplements;
          if (typeof parsedSupplements === 'string' && parsedSupplements.trim().startsWith('[')) {
            try {
              parsedSupplements = JSON.parse(parsedSupplements);
            } catch {}
          }
          return {
            ...i,
            product_name: (i as any).product_name || prod?.name_fr || (prod as any)?.name || 'Article',
            supplements: parsedSupplements,
            notes: (i as any).notes
          };
        }),
      payments: allPayments.filter(p => p.sale_id === s.id)
    }));
  }

  public async getSaleById(saleId: string): Promise<Sale | null> {
    const sales = await db.select<Sale>('SELECT * FROM sales WHERE id = ?', [saleId]);
    if (sales.length === 0) return null;

    const sale = sales[0];
    const rawItems = await db.select<SaleItem>('SELECT * FROM sale_items WHERE sale_id = ?', [saleId]);
    const allProducts = await db.select<Product>('SELECT * FROM products');
    const productMap = new Map(allProducts.map(p => [p.id, p]));

    sale.items = rawItems.map(i => {
      const prod = productMap.get(i.product_id);
      let parsedSupplements = (i as any).supplements;
      if (typeof parsedSupplements === 'string' && parsedSupplements.trim().startsWith('[')) {
        try {
          parsedSupplements = JSON.parse(parsedSupplements);
        } catch {}
      }
      return {
        ...i,
        unit_price: (i as any).unit_price || i.unit_price_ttc,
        product_name: (i as any).product_name || prod?.name_fr || (prod as any)?.name || 'Article',
        supplements: parsedSupplements,
        notes: (i as any).notes
      };
    });
    sale.payments = await db.select<Payment>('SELECT * FROM payments WHERE sale_id = ?', [saleId]);
    return sale;
  }

  // Calculer et incrémenter le numéro de commande du jour (ex: #1, #2, #3...)
  public async getNextDailyOrderNumber(): Promise<number> {
    const todayPrefix = new Date().toISOString().slice(0, 10); // Format: YYYY-MM-DD
    const localKey = `pizzeria_daily_order_counter_${todayPrefix}`;
    let countInDb = 0;
    try {
      const res = await db.select<{ count: number }>(
        `SELECT COUNT(*) as count FROM sales WHERE created_at LIKE ?`,
        [`${todayPrefix}%`]
      );
      if (res && res.length > 0 && res[0].count !== undefined) {
        countInDb = Number(res[0].count);
      }
    } catch (e) {
      console.warn('Erreur comptage ventes du jour pour le numéro de ticket:', e);
    }
    const rawVal = localStorage.getItem(localKey);
    const localVal = (rawVal && !isNaN(Number(rawVal))) ? Number(rawVal) : 0;
    const nextNum = Math.max(countInDb, localVal) + 1;
    localStorage.setItem(localKey, nextNum.toString());
    return nextNum;
  }


  // Traiter un retour / remboursement avec validation cumulative des quantités et réversion comptable
  public async processRefund(payload: ProcessRefundPayload & { items?: any[] }): Promise<Refund> {
    const sale = await this.getSaleById(payload.saleId);
    if (!sale) {
      throw new Error(`Vente introuvable : ${payload.saleId}`);
    }
    if ((sale.status as string) === 'CANCELLED') {
      throw new Error(`Impossible de rembourser une vente annulée (${sale.receipt_number}).`);
    }
    if (sale.status === 'REFUNDED') {
      throw new Error(`Cette vente (${sale.receipt_number}) a déjà été intégralement remboursée.`);
    }

    const itemsToRefund = payload.items || payload.itemsToRefund || [];
    if (!itemsToRefund || itemsToRefund.length === 0) {
      throw new Error('Veuillez sélectionner au moins un article à rembourser.');
    }

    // Récupérer les remboursements déjà effectués sur cette vente pour empêcher tout sur-remboursement cumulé
    const existingRefunds = await db.select<Refund>(
      'SELECT id, refund_amount FROM refunds WHERE original_sale_id = ?',
      [sale.id]
    );
    const existingRefundIds = new Set(existingRefunds.map(r => r.id));
    const previouslyRefundedAmount = existingRefunds.reduce(
      (sum, r) => CurrencyUtil.add(sum, Number(r.refund_amount) || 0),
      0
    );

    const allRefundItems = existingRefundIds.size > 0
      ? await db.select<RefundItem>('SELECT * FROM refund_items')
      : [];
    const refundedQtyBySaleItem = new Map<string, number>();
    for (const ri of allRefundItems) {
      if (existingRefundIds.has(ri.refund_id)) {
        const prevQty = refundedQtyBySaleItem.get(ri.sale_item_id) || 0;
        refundedQtyBySaleItem.set(ri.sale_item_id, prevQty + (Number(ri.quantity) || 0));
      }
    }

    let totalRefundAmount = 0;
    const refundItemsList: RefundItem[] = [];
    const refundId = `ref-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const refundReceipt = `REF-AVO-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
    const now = new Date().toISOString();

    // Suivre aussi les quantités demandées dans le même appel pour éviter les doublons de lignes dans itemsToRefund
    const requestedInBatchBySaleItem = new Map<string, number>();

    for (const rItem of itemsToRefund) {
      if (!rItem.quantity || rItem.quantity <= 0) {
        throw new Error('La quantité à rembourser doit être strictement positive.');
      }

      const origItem = sale.items?.find(i => i.id === rItem.saleItemId);
      if (!origItem) {
        throw new Error(`Ligne de vente introuvable : ${rItem.saleItemId}`);
      }

      const alreadyRefundedQty = refundedQtyBySaleItem.get(rItem.saleItemId) || 0;
      const batchRequestedQty = (requestedInBatchBySaleItem.get(rItem.saleItemId) || 0) + rItem.quantity;
      requestedInBatchBySaleItem.set(rItem.saleItemId, batchRequestedQty);

      const remainingRefundableQty = origItem.quantity - alreadyRefundedQty;
      if (batchRequestedQty > remainingRefundableQty + 1e-9) {
        throw new Error(
          `Quantité excessive : Vous ne pouvez pas rembourser ${rItem.quantity} unité(s) ` +
          `alors que seulement ${remainingRefundableQty} unité(s) restent remboursables sur ${origItem.quantity} achetée(s).`
        );
      }

      const unitPrice = rItem.unitPrice !== undefined
        ? rItem.unitPrice
        : (rItem.refundPrice !== undefined ? rItem.refundPrice : origItem.unit_price_ttc);
      const lineRefund = CurrencyUtil.multiply(unitPrice, rItem.quantity);
      totalRefundAmount = CurrencyUtil.add(totalRefundAmount, lineRefund);

      const refundItem: RefundItem = {
        id: `refi-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        refund_id: refundId,
        sale_item_id: rItem.saleItemId,
        product_id: rItem.productId || origItem.product_id,
        product_name: origItem.product_name,
        quantity: rItem.quantity,
        refund_price: unitPrice,
        unit_purchase_price: origItem.unit_purchase_cost_snapshot,
        restock_inventory: rItem.restock ? 1 : 0
      };

      refundItemsList.push(refundItem);

      // Si réintégration en stock autorisée
      if (rItem.restock) {
        // 1. Réintégration stock produit global / lot
        try {
          await inventoryService.recordMovement({
            productId: refundItem.product_id,
            batchId: origItem.batch_id,
            movementType: 'RETURN',
            quantityChange: rItem.quantity,
            reason: `Retour marchandise avoir ${refundReceipt} (Vente originale: ${sale.receipt_number})`,
            referenceId: refundReceipt,
            unitCostSnapshot: origItem.unit_purchase_cost_snapshot,
            userId: payload.cashierId,
            userName: payload.cashierName
          });
        } catch (invErr) {
          console.warn('[SalesService] Erreur réintégration stock produit:', invErr);
        }

        // 2. Réintégration stock des ingrédients de la recette (Pizzas, plats cuisinés)
        try {
          if (refundItem.product_id) {
            await recipeService.restoreRecipeIngredientsForRefund(refundItem.product_id, rItem.quantity);
          }
        } catch (recipeErr) {
          console.warn('[SalesService] Erreur réintégration ingrédients recette:', recipeErr);
        }

        // 3. Réintégration des suppléments si présents sur la ligne de vente
        try {
          let supplementsList = origItem.supplements;
          if (typeof supplementsList === 'string' && supplementsList.trim().startsWith('[')) {
            supplementsList = JSON.parse(supplementsList);
          }
          if (Array.isArray(supplementsList) && supplementsList.length > 0) {
            const suppsToRestore: Array<{ supplementId: string; quantity: number }> = [];
            for (const s of supplementsList) {
              const sId = typeof s === 'string' ? s : (s.id || s.supplementId);
              const sQty = ((s as any).quantity || 1) * rItem.quantity;
              if (sId) {
                suppsToRestore.push({ supplementId: sId, quantity: sQty });
              }
            }
            if (suppsToRestore.length > 0) {
              await supplementService.restoreSupplementStock(suppsToRestore);
            }
          }
        } catch (suppErr) {
          console.warn('[SalesService] Erreur réintégration suppléments:', suppErr);
        }
      }
    }

    // Ne jamais stocker le code PIN en clair dans la base de données
    const sanitizedAuthMarker = payload.managerPin
      ? `AUTHORIZED_BY_${payload.cashierId || 'MANAGER'}`
      : undefined;

    const refund: Refund = {
      id: refundId,
      original_sale_id: sale.id,
      receipt_number: refundReceipt,
      cashier_id: payload.cashierId,
      cashier_name: payload.cashierName,
      refund_amount: totalRefundAmount,
      payment_method: payload.paymentMethod || sale.payments?.[0]?.payment_method || 'CASH',
      reason: payload.reason,
      authorized_by_pin: sanitizedAuthMarker,
      created_at: now,
      items: refundItemsList
    };

    // Insérer le remboursement dans SQLite
    await db.execute(
      `INSERT INTO refunds (
        id, original_sale_id, receipt_number, cashier_id, refund_amount,
        payment_method, reason, authorized_by_pin, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        refund.id, refund.original_sale_id, refund.receipt_number,
        refund.cashier_id, refund.refund_amount, refund.payment_method,
        refund.reason, refund.authorized_by_pin || null, refund.created_at
      ]
    );

    for (const ri of refundItemsList) {
      await db.execute(
        `INSERT INTO refund_items (
          id, refund_id, sale_item_id, product_id, quantity, refund_price,
          unit_purchase_price, restock_inventory
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          ri.id, ri.refund_id, ri.sale_item_id, ri.product_id, ri.quantity,
          ri.refund_price, ri.unit_purchase_price, ri.restock_inventory
        ]
      );
    }

    // Mettre à jour le statut de la vente originale en tenant compte du cumul des remboursements
    const cumulativeRefundedAmount = CurrencyUtil.add(previouslyRefundedAmount, totalRefundAmount);
    const allItemsFullyRefunded = (sale.items || []).every(orig => {
      const prev = refundedQtyBySaleItem.get(orig.id) || 0;
      const cur = requestedInBatchBySaleItem.get(orig.id) || 0;
      return prev + cur >= orig.quantity - 1e-9;
    });
    const isFullRefund = cumulativeRefundedAmount >= sale.total_ttc || allItemsFullyRefunded;
    const newStatus = isFullRefund ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
    await db.execute('UPDATE sales SET status = ? WHERE id = ?', [newStatus, sale.id]);

    // Si la vente originale a été payée à CREDIT, réduire la dette du client à hauteur du remboursement
    if (refund.payment_method === 'CREDIT' && sale.customer_id) {
      const custRows = await db.select<{ id: string; current_debt: number }>(
        'SELECT id, current_debt FROM customers WHERE id = ?',
        [sale.customer_id]
      );
      if (custRows.length > 0) {
        const newDebt = Math.max(0, CurrencyUtil.subtract(custRows[0].current_debt || 0, totalRefundAmount));
        await db.execute('UPDATE customers SET current_debt = ? WHERE id = ?', [newDebt, sale.customer_id]);
      }
    }

    // Si remboursé en espèces, déduire de la session de caisse
    if (refund.payment_method === 'CASH') {
      const activeSession = payload.sessionId
        ? await caisseService.getSessionById(payload.sessionId)
        : await caisseService.getActiveSession();

      if (activeSession && activeSession.status === 'OPEN') {
        await caisseService.recordRefundToSession(activeSession.id, totalRefundAmount);
      }
    }

    // Inscrire dans le journal d'audit légal
    await db.execute(
      `INSERT INTO audit_logs (
        id, user_id, user_name, action, entity_type, entity_id, details, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        payload.cashierId || 'system',
        payload.cashierName || 'Caissier',
        'PROCESS_REFUND',
        'SALE',
        sale.id,
        `Remboursement avoir ${refundReceipt} de ${totalRefundAmount} DA (${payload.reason})`,
        now
      ]
    );

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('sales_updated'));
      window.dispatchEvent(new Event('inventory_updated'));
      window.dispatchEvent(new Event('products_updated'));
      window.dispatchEvent(new Event('recipes_updated'));
      window.dispatchEvent(new Event('supplements_updated'));
    }

    return refund;
  }
}

export const salesService = SalesService.getInstance();
