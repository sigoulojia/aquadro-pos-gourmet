// Aquadro POS Algérie — Service de Traçabilité des Ouvertures du Tiroir-Caisse
// Enregistre chaque impulsion électrique RJ11 (manuelle, encaissement, test) avec horodatage et utilisateur responsable

import { db } from '../db/sqlite';

export interface DrawerLogEntry {
  id: string;
  opened_at: string;
  user_name: string;
  role: string;
  reason: string;
}

export class DrawerLogService {
  private static instance: DrawerLogService;
  private readonly STORAGE_KEY = 'aquadro_drawer_open_logs';

  private constructor() {}

  public static getInstance(): DrawerLogService {
    if (!DrawerLogService.instance) {
      DrawerLogService.instance = new DrawerLogService();
    }
    return DrawerLogService.instance;
  }

  // Enregistrer une ouverture du tiroir dans la base SQLite et localStorage
  public async logOpening(reason: string, userName?: string, role?: string): Promise<DrawerLogEntry> {
    const entry: DrawerLogEntry = {
      id: `drw-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      opened_at: new Date().toISOString(),
      user_name: userName || this.getCurrentUserName() || 'Utilisateur',
      role: role || this.getCurrentUserRole() || 'Caissier',
      reason: reason || 'Ouverture manuelle'
    };

    // 1. Sauvegarde dans localStorage pour accès instantané
    if (typeof localStorage !== 'undefined') {
      try {
        const existing = this.getLocalLogs();
        existing.unshift(entry);
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(existing.slice(0, 100)));
      } catch (e) {
        console.warn('Erreur stockage local log tiroir:', e);
      }
    }

    // 2. Journalisation d'audit dans la table audit_logs SQLite
    try {
      await db.execute(
        `INSERT INTO audit_logs (id, user_id, user_name, action, entity_type, entity_id, details, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entry.id,
          'system',
          entry.user_name,
          'DRAWER_OPEN',
          'CASH_DRAWER',
          entry.id,
          entry.reason,
          entry.opened_at
        ]
      );
    } catch (e) {
      // Ignorer si table audit_logs temporairement occupée
    }

    return entry;
  }

  // Récupérer la liste des ouvertures récentes
  public async getRecentLogs(limit: number = 50): Promise<DrawerLogEntry[]> {
    const local = this.getLocalLogs();
    if (local.length > 0) {
      return local.slice(0, limit);
    }

    try {
      const rows = await db.select<{ id: string; user_name: string; details: string; created_at: string }>(
        `SELECT id, user_name, details, created_at 
         FROM audit_logs 
         WHERE action = 'DRAWER_OPEN' 
         ORDER BY created_at DESC 
         LIMIT ?`,
        [limit]
      );
      if (rows && rows.length > 0) {
        return rows.map(r => ({
          id: r.id,
          opened_at: r.created_at,
          user_name: r.user_name || 'Utilisateur',
          role: 'Personnel',
          reason: r.details || 'Ouverture du tiroir'
        }));
      }
    } catch (e) {}

    return [];
  }

  // Vérifier si le tiroir-caisse est activé globalement
  public isDrawerEnabled(): boolean {
    if (typeof localStorage !== 'undefined') {
      const val = localStorage.getItem('aquadro_drawer_enabled');
      if (val === 'false') return false;
      const manual = localStorage.getItem('aquadro_allow_manual_drawer');
      if (manual === 'false') return false;
    }
    return true;
  }

  public setDrawerEnabled(enabled: boolean): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('aquadro_drawer_enabled', enabled ? 'true' : 'false');
      localStorage.setItem('aquadro_allow_manual_drawer', enabled ? 'true' : 'false');
      window.dispatchEvent(new Event('drawer_setting_changed'));
    }
  }

  // Vérifier si l'Admin a autorisé l'ouverture manuelle du tiroir
  public isManualDrawerAllowed(): boolean {
    return this.isDrawerEnabled();
  }

  public setManualDrawerAllowed(allowed: boolean): void {
    this.setDrawerEnabled(allowed);
  }

  private getLocalLogs(): DrawerLogEntry[] {
    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(this.STORAGE_KEY);
        if (raw) return JSON.parse(raw);
      } catch (e) {}
    }
    return [];
  }

  private getCurrentUserName(): string | null {
    if (typeof localStorage !== 'undefined') {
      try {
        const u = localStorage.getItem('pizzeria_current_user');
        if (u) {
          const parsed = JSON.parse(u);
          return parsed.name || parsed.username || null;
        }
      } catch (e) {}
    }
    return null;
  }

  private getCurrentUserRole(): string | null {
    if (typeof localStorage !== 'undefined') {
      try {
        const u = localStorage.getItem('pizzeria_current_user');
        if (u) {
          const parsed = JSON.parse(u);
          return parsed.role || null;
        }
      } catch (e) {}
    }
    return null;
  }
}

export const drawerLogService = DrawerLogService.getInstance();
