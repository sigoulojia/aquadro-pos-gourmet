// Aquadro POS Algérie V2 — Service de Gestion des Documents Commerciaux
// Numérotation séquentielle inviolable (Factures, Tickets, Avoirs, Bons de Livraison)

import { db } from '../db/sqlite';
import { DocumentType, DocumentRecord } from '../types/database';

export class DocumentService {
  private static instance: DocumentService;

  private constructor() {}

  public static getInstance(): DocumentService {
    if (!DocumentService.instance) {
      DocumentService.instance = new DocumentService();
    }
    return DocumentService.instance;
  }

  // Obtenir le prochain numéro séquentiel immuable
  public async getNextNumber(type: DocumentType): Promise<string> {
    const year = new Date().getFullYear();
    const rows = await db.select<{ last_sequence_number: number }>(
      'SELECT last_sequence_number FROM document_sequences WHERE document_type = ? AND current_year = ?',
      [type, year]
    );

    let next = 1;
    if (rows.length > 0) {
      next = rows[0].last_sequence_number + 1;
      await db.execute(
        'UPDATE document_sequences SET last_sequence_number = ? WHERE document_type = ? AND current_year = ?',
        [next, type, year]
      );
    } else {
      await db.execute(
        'INSERT INTO document_sequences (document_type, current_year, last_sequence_number) VALUES (?, ?, ?)',
        [type, year, next]
      );
    }

    const prefixes: Record<DocumentType, string> = {
      TICKET: 'TKT',
      FACTURE: 'FAC',
      AVOIR: 'AVO',
      BON_LIVRAISON: 'BL',
      COMMANDE: 'BC'
    };

    return `${prefixes[type]}-${year}-${next.toString().padStart(6, '0')}`;
  }

  // Enregistrer un document
  public async registerDocument(doc: {
    type: DocumentType;
    referenceId: string;
    customerOrSupplierName?: string;
    totalTtc: number;
  }): Promise<DocumentRecord> {
    const docNumber = await this.getNextNumber(doc.type);
    const record: DocumentRecord = {
      id: `doc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      document_type: doc.type,
      document_number: docNumber,
      reference_id: doc.referenceId,
      customer_or_supplier_name: doc.customerOrSupplierName,
      total_ttc: doc.totalTtc,
      created_at: new Date().toISOString()
    };

    await db.execute(
      `INSERT INTO commercial_documents (
        id, document_type, document_number, reference_id,
        customer_or_supplier_name, total_ttc, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        record.id, record.document_type, record.document_number, record.reference_id,
        record.customer_or_supplier_name || null, record.total_ttc, record.created_at
      ]
    );

    return record;
  }

  // Synchroniser les ventes existantes vers les documents commerciaux pour que tout apparaisse
  public async syncFromSales(): Promise<void> {
    try {
      const sales = await db.select<any>('SELECT * FROM sales ORDER BY created_at DESC LIMIT 200');
      const docs = await db.select<any>('SELECT reference_id FROM commercial_documents');
      const existingRefs = new Set(docs.map(d => d.reference_id));

      for (const s of sales) {
        const ref = s.receipt_number || s.id;
        if (!existingRefs.has(ref)) {
          const docNumber = await this.getNextNumber('TICKET');
          const docId = `doc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
          await db.execute(
            `INSERT INTO commercial_documents (
              id, document_type, document_number, reference_id,
              customer_or_supplier_name, total_ttc, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              docId,
              'TICKET',
              docNumber,
              ref,
              s.customer_name || s.notes || 'Comptoir',
              s.total_ttc || 0,
              s.created_at || new Date().toISOString()
            ]
          );
          existingRefs.add(ref);
        }
      }
    } catch (e) {
      console.warn('Erreur synchronisation documents depuis ventes:', e);
    }
  }

  // Créer une Facture Commerciale formelle (pour entreprise, traiteur ou événement)
  public async createInvoice(data: {
    customerName: string;
    customerNif?: string;
    customerRc?: string;
    customerAddress?: string;
    customerPhone?: string;
    totalTtc: number;
    notes?: string;
    items?: Array<{ name: string; quantity: number; unitPrice: number; total: number }>;
  }): Promise<DocumentRecord> {
    const docNumber = await this.getNextNumber('FACTURE');
    const docId = `doc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const ref = `FAC-REF-${Date.now().toString().slice(-6)}`;
    const now = new Date().toISOString();

    const clientNotes = [
      data.customerNif ? `NIF: ${data.customerNif}` : '',
      data.customerRc ? `RC: ${data.customerRc}` : '',
      data.customerAddress ? `Adr: ${data.customerAddress}` : '',
      data.customerPhone ? `Tél: ${data.customerPhone}` : '',
      data.notes ? `Note: ${data.notes}` : ''
    ].filter(Boolean).join(' | ');

    const customerDisplay = `${data.customerName}${clientNotes ? ` (${clientNotes})` : ''}`;

    await db.execute(
      `INSERT INTO commercial_documents (
        id, document_type, document_number, reference_id,
        customer_or_supplier_name, total_ttc, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        docId,
        'FACTURE',
        docNumber,
        ref,
        customerDisplay,
        data.totalTtc,
        now
      ]
    );

    // Si des articles sont fournis, on peut créer une vente associée pour l'historique
    if (data.items && data.items.length > 0) {
      const saleId = `sale-${docId}`;
      try {
        const users = await db.select<{ id: string }>('SELECT id FROM users LIMIT 1');
        const cashierId = users.length > 0 ? users[0].id : 'usr-owner';
        const idempotencyKey = `inv-${docId}-${Math.random().toString(36).substring(2, 8)}`;

        await db.execute(
          `INSERT OR IGNORE INTO products (
            id, sku, barcode, name_fr, name_ar, selling_price_ttc, purchase_cost,
            min_selling_price_ttc, current_stock, min_stock_alert, is_active, created_at, updated_at
          ) VALUES ('prod-custom', 'SKU-CUSTOM', 'BC-CUSTOM', 'Article Facturé', 'مقال مفوتر', 0, 0, 0, 100, 0, 1, ?, ?)`,
          [now, now]
        );

        await db.execute(
          `INSERT INTO sales (
            id, receipt_number, cashier_id, subtotal_ht, discount_amount,
            tax_amount, total_ttc, status, idempotency_key, sync_status, created_at
          ) VALUES (?, ?, ?, ?, 0, 0, ?, 'COMPLETED', ?, 'PENDING', ?)`,
          [
            saleId,
            docNumber,
            cashierId,
            data.totalTtc,
            data.totalTtc,
            idempotencyKey,
            now
          ]
        );

        for (const item of data.items) {
          const itemId = `item-${Math.random().toString(36).substring(2, 8)}`;
          await db.execute(
            `INSERT INTO sale_items (
              id, sale_id, product_id, product_name, quantity, unit_price_ttc,
              discount_amount, total_ttc, unit_purchase_cost_snapshot,
              unit_purchase_price, unit_price, notes, created_at
            ) VALUES (?, ?, 'prod-custom', ?, ?, ?, 0, ?, 0, 0, ?, ?, ?)`,
            [
              itemId,
              saleId,
              item.name,
              item.quantity,
              item.unitPrice,
              item.total,
              item.unitPrice,
              data.notes || null,
              now
            ]
          );
        }
      } catch (err) {
        console.warn('Vente associée à la facture ignorée:', err);
      }
    }

    return {
      id: docId,
      document_type: 'FACTURE',
      document_number: docNumber,
      reference_id: ref,
      customer_or_supplier_name: customerDisplay,
      total_ttc: data.totalTtc,
      created_at: now
    };
  }

  // Convertir un Ticket de caisse existant en Facture Commerciale
  public async convertTicketToInvoice(ticket: DocumentRecord, clientInfo: {
    customerName: string;
    customerNif?: string;
    customerRc?: string;
    customerAddress?: string;
    customerPhone?: string;
  }): Promise<DocumentRecord> {
    const docNumber = await this.getNextNumber('FACTURE');
    const docId = `doc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    const clientNotes = [
      clientInfo.customerNif ? `NIF: ${clientInfo.customerNif}` : '',
      clientInfo.customerRc ? `RC: ${clientInfo.customerRc}` : '',
      clientInfo.customerAddress ? `Adr: ${clientInfo.customerAddress}` : '',
      clientInfo.customerPhone ? `Tél: ${clientInfo.customerPhone}` : '',
      `Issu du Ticket: ${ticket.document_number}`
    ].filter(Boolean).join(' | ');

    const customerDisplay = `${clientInfo.customerName} (${clientNotes})`;

    await db.execute(
      `INSERT INTO commercial_documents (
        id, document_type, document_number, reference_id,
        customer_or_supplier_name, total_ttc, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        docId,
        'FACTURE',
        docNumber,
        ticket.reference_id,
        customerDisplay,
        ticket.total_ttc,
        now
      ]
    );

    return {
      id: docId,
      document_type: 'FACTURE',
      document_number: docNumber,
      reference_id: ticket.reference_id,
      customer_or_supplier_name: customerDisplay,
      total_ttc: ticket.total_ttc,
      created_at: now
    };
  }

  // Récupérer les articles associés à un document
  public async getDocumentItems(doc: DocumentRecord): Promise<Array<{ name: string; quantity: number; unit_price: number; total_price: number }>> {
    try {
      // 1. Chercher par receipt_number ou reference_id ou id dans sales
      const sales = await db.select<any>(
        'SELECT id FROM sales WHERE receipt_number = ? OR id = ? OR receipt_number = ? LIMIT 1',
        [doc.reference_id, doc.reference_id, doc.document_number]
      );

      if (sales.length > 0) {
        const saleId = sales[0].id;
        const rawItems = await db.select<any>(
          'SELECT * FROM sale_items WHERE sale_id = ?',
          [saleId]
        );
        if (rawItems.length > 0) {
          return rawItems.map((it: any) => ({
            name: it.product_name || it.name || 'Article',
            quantity: Number(it.quantity) || 1,
            unit_price: Number(it.unit_price_ttc ?? it.unit_price ?? 0),
            total_price: Number(it.total_ttc ?? it.total_price ?? 0)
          }));
        }
      }
    } catch {}

    // Repli article générique
    return [
      {
        name: `Prestation Restauration (${doc.document_type === 'FACTURE' ? 'Facturation' : 'Consommation'})`,
        quantity: 1,
        unit_price: doc.total_ttc,
        total_price: doc.total_ttc
      }
    ];
  }

  // Liste des documents
  public async getDocuments(type?: DocumentType, limit: number = 100): Promise<DocumentRecord[]> {
    let query = 'SELECT * FROM commercial_documents';
    const params: any[] = [];
    if (type) {
      query += ' WHERE document_type = ?';
      params.push(type);
    }
    query += ` ORDER BY created_at DESC LIMIT ${limit}`;
    return await db.select<DocumentRecord>(query, params);
  }
}

export const documentService = DocumentService.getInstance();
