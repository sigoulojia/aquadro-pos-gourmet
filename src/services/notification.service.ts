// Aquadro POS Algérie — Service Centralisé des Notifications & Alertes Proactives
// Surveille en temps réel : Ruptures de stock ingrédients & produits, besoins du magasin,
// dates de péremption FEFO, statut de caisse et synchronisation hors-ligne.

import { db } from '../db/sqlite';
import { storeNeedsService } from './storeNeeds.service';
import { caisseService } from './caisse.service';
import { syncService } from './sync.service';

export type NotificationType = 'need' | 'stock' | 'fefo' | 'caisse' | 'sync' | 'system';
export type NotificationSeverity = 'info' | 'warning' | 'critical' | 'success';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  severity: NotificationSeverity;
  timestamp: string;
  targetView?: 'pos' | 'dashboard' | 'needs' | 'products' | 'inventory' | 'sales' | 'caisse' | 'expenses' | 'settings' | 'credits' | 'journal' | 'reports';
  data?: any;
  isRead?: boolean;
}

const STORAGE_KEY_READ_IDS = 'aquadro_read_notification_ids';
const STORAGE_KEY_DISMISSED_IDS = 'aquadro_dismissed_notification_ids';

export class NotificationService {
  private static instance: NotificationService;

  private constructor() {}

  public static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  private getReadIds(): string[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_READ_IDS);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  private setReadIds(ids: string[]): void {
    try {
      localStorage.setItem(STORAGE_KEY_READ_IDS, JSON.stringify(ids));
      window.dispatchEvent(new Event('notifications_updated'));
    } catch (e) {
      console.error('Erreur sauvegarde notification read IDs', e);
    }
  }

  private getDismissedIds(): string[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_DISMISSED_IDS);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  private setDismissedIds(ids: string[]): void {
    try {
      localStorage.setItem(STORAGE_KEY_DISMISSED_IDS, JSON.stringify(ids));
      window.dispatchEvent(new Event('notifications_updated'));
    } catch (e) {
      console.error('Erreur sauvegarde notification dismissed IDs', e);
    }
  }

  public clearAllNotifications(notifications?: AppNotification[]): void {
    const current = this.getDismissedIds();
    if (notifications && notifications.length > 0) {
      for (const n of notifications) {
        if (!current.includes(n.id)) {
          current.push(n.id);
        }
      }
    }
    this.setDismissedIds(current);
  }

  public dismissNotification(id: string): void {
    const current = this.getDismissedIds();
    if (!current.includes(id)) {
      current.push(id);
      this.setDismissedIds(current);
    }
  }

  public markAsRead(id: string): void {
    const current = this.getReadIds();
    if (!current.includes(id)) {
      current.push(id);
      this.setReadIds(current);
    }
  }

  public markAllAsRead(notifications?: AppNotification[]): void {
    const current = this.getReadIds();
    if (notifications && notifications.length > 0) {
      for (const n of notifications) {
        if (!current.includes(n.id)) {
          current.push(n.id);
        }
      }
    }
    this.setReadIds(current);
  }

  public markAsUnread(id: string): void {
    let current = this.getReadIds();
    current = current.filter(x => x !== id);
    this.setReadIds(current);
  }

  public async getAllNotifications(): Promise<AppNotification[]> {
    const list: AppNotification[] = [];
    const readIds = this.getReadIds();

    try {
      // 1. Besoins du magasin en attente (Demandes d'achat des caissiers/cuisiniers)
      const needs = await storeNeedsService.getNeeds();
      const pendingNeeds = needs.filter(n => n.status === 'PENDING');
      for (const need of pendingNeeds) {
        const isUrgent = need.urgency === 'URGENT';
        list.push({
          id: `need-${need.id}`,
          type: 'need',
          title: isUrgent ? `Besoin Urgent : ${need.item_name}` : `Besoin Magasin : ${need.item_name}`,
          message: `${need.quantity_needed ? `Quantité : ${need.quantity_needed}. ` : ''}${need.notes ? `Note : ${need.notes}. ` : ''}Demandé par ${need.requested_by}`,
          severity: isUrgent ? 'critical' : 'warning',
          timestamp: need.created_at,
          targetView: 'needs',
          data: need,
          isRead: readIds.includes(`need-${need.id}`)
        });
      }
    } catch (e) {
      console.warn('NotificationService: Erreur récupération besoins', e);
    }

    try {
      // 2. Alertes Stock & Ruptures Ingrédients (Matières premières de la Pizzeria)
      const ingredients = await db.select<any>(
        'SELECT * FROM ingredients WHERE is_active = 1 AND current_stock <= min_stock_alert ORDER BY current_stock ASC'
      );
      for (const ing of ingredients) {
        const stock = Number(ing.current_stock || 0);
        const min = Number(ing.min_stock_alert || 0);
        const isOut = stock <= 0;

        list.push({
          id: `stock-ing-${ing.id}`,
          type: 'stock',
          title: isOut ? `Rupture Ingrédient : ${ing.name_fr}` : `Stock Faible : ${ing.name_fr}`,
          message: isOut
            ? `L'ingrédient ${ing.name_fr} est épuisé (0 ${ing.unit}). Risque d'arrêt de production des pizzas associées.`
            : `Stock restant : ${stock} ${ing.unit} (Seuil d'alerte : ${min} ${ing.unit}).`,
          severity: isOut ? 'critical' : 'warning',
          timestamp: ing.updated_at || ing.created_at || new Date().toISOString(),
          targetView: 'inventory',
          data: ing,
          isRead: readIds.includes(`stock-ing-${ing.id}`)
        });
      }
    } catch (e) {
      console.warn('NotificationService: Erreur récupération stock ingrédients', e);
    }

    try {
      // 3. Alertes Stock Produits / Boissons / Desserts
      const products = await db.select<any>(
        'SELECT * FROM products WHERE is_active = 1 AND min_stock_alert > 0 AND current_stock <= min_stock_alert ORDER BY current_stock ASC'
      );
      for (const prod of products) {
        const stock = Number(prod.current_stock || 0);
        const min = Number(prod.min_stock_alert || 0);
        const isOut = stock <= 0;
        const name = prod.name_fr || prod.name || 'Produit';

        list.push({
          id: `stock-prod-${prod.id}`,
          type: 'stock',
          title: isOut ? `Rupture Produit : ${name}` : `Stock Faible : ${name}`,
          message: isOut
            ? `Article épuisé en réserve (${stock} unités).`
            : `Stock restant : ${stock} unités (Seuil minimal : ${min}).`,
          severity: isOut ? 'critical' : 'warning',
          timestamp: prod.updated_at || prod.created_at || new Date().toISOString(),
          targetView: 'products',
          data: prod,
          isRead: readIds.includes(`stock-prod-${prod.id}`)
        });
      }
    } catch (e) {
      console.warn('NotificationService: Erreur récupération stock produits', e);
    }

    try {
      // 4. Péremptions FEFO (Lots expirant bientôt ou déjà expirés)
      const batches = await db.select<any>(
        'SELECT pb.*, p.name_fr, p.name FROM product_batches pb LEFT JOIN products p ON pb.product_id = p.id WHERE pb.current_stock > 0 ORDER BY pb.expiration_date ASC LIMIT 10'
      );
      const now = new Date();
      for (const batch of batches) {
        if (!batch.expiration_date) continue;
        const expDate = new Date(batch.expiration_date);
        const diffDays = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        if (diffDays <= 7) {
          const isExpired = diffDays <= 0;
          const prodName = batch.name_fr || batch.name || 'Produit';
          list.push({
            id: `fefo-${batch.id}`,
            type: 'fefo',
            title: isExpired ? `Lot Expiré : ${prodName}` : `Péremption Proche : ${prodName}`,
            message: isExpired
              ? `Le lot ${batch.batch_number} (${batch.current_stock} pcs) a expiré le ${batch.expiration_date}. Retirez-le du stock.`
              : `Le lot ${batch.batch_number} expire dans ${diffDays} jour(s) (${batch.expiration_date}). Priorisez la vente FEFO.`,
            severity: isExpired ? 'critical' : 'warning',
            timestamp: batch.created_at || new Date().toISOString(),
            targetView: 'inventory',
            data: batch,
            isRead: readIds.includes(`fefo-${batch.id}`)
          });
        }
      }
    } catch (e) {
      console.warn('NotificationService: Erreur récupération lots FEFO', e);
    }

    try {
      // 5. Statut de Caisse (Session fermée)
      const activeSession = await caisseService.getActiveSession();
      if (!activeSession) {
        list.push({
          id: 'caisse-status-closed',
          type: 'caisse',
          title: 'Caisse Non Ouverte',
          message: "Aucune session de caisse n'est ouverte pour le moment. Veuillez ouvrir la caisse avant d'encaisser des ventes.",
          severity: 'info',
          timestamp: new Date().toISOString(),
          targetView: 'caisse',
          isRead: readIds.includes('caisse-status-closed')
        });
      }
    } catch (e) {
      console.warn('NotificationService: Erreur récupération session caisse', e);
    }

    try {
      // 6. Synchronisation Hors Ligne (Outbox en attente)
      const pendingSync = await syncService.getPendingCount();
      if (pendingSync > 0) {
        list.push({
          id: 'sync-outbox-pending',
          type: 'sync',
          title: 'Opérations en Attente Cloud',
          message: `${pendingSync} transaction(s) en attente de synchronisation vers le serveur cloud.`,
          severity: 'info',
          timestamp: new Date().toISOString(),
          targetView: 'settings',
          isRead: readIds.includes('sync-outbox-pending')
        });
      }
    } catch (e) {
      console.warn('NotificationService: Erreur récupération sync', e);
    }

    // Filtrer les notifications effacées / vidées par l'utilisateur
    const dismissedIds = this.getDismissedIds();
    const activeList = list.filter(n => !dismissedIds.includes(n.id));

    // Tri : Non lues d'abord, puis par criticité (critical > warning > info), puis date
    return activeList.sort((a, b) => {
      if (a.isRead !== b.isRead) {
        return a.isRead ? 1 : -1;
      }
      const sevScore = { critical: 3, warning: 2, info: 1, success: 0 };
      if (sevScore[a.severity] !== sevScore[b.severity]) {
        return sevScore[b.severity] - sevScore[a.severity];
      }
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });
  }

  public async getUnreadCount(): Promise<number> {
    const all = await this.getAllNotifications();
    return all.filter(n => !n.isRead).length;
  }
}

export const notificationService = NotificationService.getInstance();
