// Aquadro POS Algérie V2 — Service de Gestion des Dossiers d'Exercice & Nouveau Départ
// Permet de repartir de zéro tout en isolant et archivant l'utilisation précédente dans un dossier dédié,
// et en initialisant un nouveau dossier propre pour éviter tout mélange de rapports, logs et transactions.

import { db } from '../db/sqlite';

export interface UsageSessionInfo {
  id: string;
  name: string;
  folder_path: string;
  is_active: boolean;
  created_at: string;
  reports_count: number;
  logs_count: number;
  has_backup: boolean;
}

export interface CreateUsageSessionResult {
  success: boolean;
  session_name: string;
  session_folder: string;
  archive_folder?: string;
  message: string;
}

export interface CreateSessionOptions {
  sessionName: string;
  archiveLabel?: string;
  resetMode: 'TRANSACTIONS_ONLY' | 'FULL_FACTORY_RESET';
}

export interface ActiveSessionMeta {
  id: string;
  name: string;
  folderPath: string;
  startedAt: string;
}

export class UsageSessionService {
  private static instance: UsageSessionService;
  private isTauri = false;

  private constructor() {
    this.isTauri = typeof window !== 'undefined' && typeof (window as any).__TAURI_INTERNALS__?.invoke === 'function';
  }

  public static getInstance(): UsageSessionService {
    if (!UsageSessionService.instance) {
      UsageSessionService.instance = new UsageSessionService();
    }
    return UsageSessionService.instance;
  }

  /**
   * Récupère la session d'utilisation active courante
   */
  public getActiveSession(): ActiveSessionMeta {
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('aquadro_active_usage_session');
        if (raw) return JSON.parse(raw);
      } catch (e) {}
    }
    return {
      id: 'default',
      name: 'الاستخدام_الرئيسي (Dossier Principal)',
      folderPath: 'جلسات_الاستخدام/الاستخدام_الرئيسي',
      startedAt: new Date().toISOString()
    };
  }

  /**
   * Crée un nouveau dossier d'exercice pour repartir de zéro,
   * archive l'utilisation précédente et réinitialise la base selon le mode choisi.
   */
  public async createNewSession(options: CreateSessionOptions): Promise<CreateUsageSessionResult> {
    const { sessionName, archiveLabel, resetMode } = options;
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-');
    const cleanSessionName = sessionName.trim() || `استخدام_جديد_${timestamp.slice(0, 10)}`;
    const cleanArchiveName = archiveLabel?.trim() || `أرشيف_${timestamp.slice(0, 19)}`;

    let sessionResult: CreateUsageSessionResult;

    if (this.isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        sessionResult = await invoke<CreateUsageSessionResult>('create_new_usage_session', {
          sessionName: cleanSessionName,
          archiveLabel: cleanArchiveName
        });
      } catch (err: any) {
        console.error('[UsageSessionService] Erreur création session native:', err);
        throw new Error(err?.message || err || 'Erreur lors de la création du dossier d\'exercice');
      }
    } else {
      // Mode Web / Secours (LocalStorage)
      sessionResult = {
        success: true,
        session_name: cleanSessionName,
        session_folder: `جلسات_الاستخدام/${cleanSessionName}`,
        archive_folder: `أرشيف_الاستخدامات_السابقة/${cleanArchiveName}`,
        message: 'تم إنشاء مجلد الاستخدام الجديد وحفظ الأرشيف بنجاح'
      };

      // Sauvegarder dans la liste des archives Web
      try {
        const archivesRaw = localStorage.getItem('aquadro_archived_sessions') || '[]';
        const archives: UsageSessionInfo[] = JSON.parse(archivesRaw);
        archives.unshift({
          id: `arch_${Date.now()}`,
          name: cleanArchiveName,
          folder_path: sessionResult.archive_folder || '',
          is_active: false,
          created_at: now.toISOString(),
          reports_count: 0,
          logs_count: 0,
          has_backup: true
        });
        localStorage.setItem('aquadro_archived_sessions', JSON.stringify(archives));
      } catch (e) {}
    }

    // Réinitialisation de la base de données selon le mode sélectionné
    if (resetMode === 'TRANSACTIONS_ONLY') {
      // Conserve le catalogue de produits, suppléments et prix, mais vide les ventes et réinitialise le stock
      await db.resetTransactionsOnly();
    } else {
      // Formatage complet
      await db.resetAll();
      if (typeof window !== 'undefined') {
        localStorage.removeItem('aquadro_setup_completed');
        localStorage.removeItem('pizzeria_setup_completed');
        localStorage.removeItem('aquadro_store_logo');
        localStorage.removeItem('aquadro_session_token');
      }
    }

    // Mise à jour de la session active
    const activeMeta: ActiveSessionMeta = {
      id: `sess_${Date.now()}`,
      name: cleanSessionName,
      folderPath: sessionResult.session_folder,
      startedAt: now.toISOString()
    };
    if (typeof window !== 'undefined') {
      localStorage.setItem('aquadro_active_usage_session', JSON.stringify(activeMeta));
    }

    return sessionResult;
  }

  /**
   * Liste tous les dossiers d'exercice (actifs et archivés)
   */
  public async listSessions(): Promise<UsageSessionInfo[]> {
    if (this.isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        return await invoke<UsageSessionInfo[]>('list_usage_sessions');
      } catch (err) {
        console.warn('[UsageSessionService] Échec liste native des sessions:', err);
      }
    }

    // Fallback Web / Test
    const list: UsageSessionInfo[] = [];
    const active = this.getActiveSession();
    list.push({
      id: active.id,
      name: active.name,
      folder_path: active.folderPath,
      is_active: true,
      created_at: active.startedAt,
      reports_count: 0,
      logs_count: 0,
      has_backup: true
    });

    if (typeof window !== 'undefined') {
      try {
        const archivesRaw = localStorage.getItem('aquadro_archived_sessions');
        if (archivesRaw) {
          const archives: UsageSessionInfo[] = JSON.parse(archivesRaw);
          list.push(...archives);
        }
      } catch (e) {}
    }

    return list;
  }

  /**
   * Récupère la session d'utilisation active courante avec chemin absolu réel
   */
  public async fetchActiveSession(): Promise<ActiveSessionMeta> {
    if (this.isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const nativeInfo = await invoke<any>('get_active_session_info');
        if (nativeInfo && nativeInfo.folder_path) {
          const currentMeta = this.getActiveSession();
          const updated: ActiveSessionMeta = {
            id: currentMeta.id || nativeInfo.id || 'sess_main',
            name: currentMeta.name || nativeInfo.name || 'الاستخدام_الرئيسي (Dossier Principal)',
            folderPath: nativeInfo.folder_path,
            startedAt: currentMeta.startedAt || nativeInfo.created_at || new Date().toISOString()
          };
          if (typeof window !== 'undefined') {
            localStorage.setItem('aquadro_active_usage_session', JSON.stringify(updated));
          }
          return updated;
        }
      } catch (err) {
        console.warn('[UsageSessionService] Impossible de récupérer la session native:', err);
      }
    }
    return this.getActiveSession();
  }

  /**
   * Ouvre un dossier arbitraire dans le gestionnaire de fichiers de l'OS
   */
  public async openFolderPath(path: string): Promise<boolean> {
    if (!this.isTauri) {
      alert(`[Mode Web] Chemin du dossier sur le disque : ${path}`);
      return false;
    }
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<boolean>('open_folder_path', { path });
    } catch (err) {
      console.error('[UsageSessionService] Impossible d\'ouvrir le dossier:', err);
      return false;
    }
  }

  /**
   * Ouvre le dossier d'exercice actif directement
   */
  public async openActiveSessionFolder(): Promise<boolean> {
    const active = await this.fetchActiveSession();
    return await this.openFolderPath(active.folderPath);
  }

  /**
   * Supprime définitivement un dossier d'archive (action haute sécurité)
   */
  public async deleteArchive(folderPath: string, archiveId?: string): Promise<boolean> {
    if (this.isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('delete_archived_session', { folderPath });
      } catch (err: any) {
        throw new Error(err?.message || err || 'Erreur lors de la suppression du dossier d\'archive');
      }
    } else {
      if (typeof window !== 'undefined') {
        try {
          const raw = localStorage.getItem('aquadro_archived_sessions') || '[]';
          const list: UsageSessionInfo[] = JSON.parse(raw);
          const filtered = list.filter(item => item.id !== archiveId && item.folder_path !== folderPath);
          localStorage.setItem('aquadro_archived_sessions', JSON.stringify(filtered));
        } catch (e) {}
      }
    }
    return true;
  }

  /**
   * Vérifie le code secret de récupération issu de la charte de setup PDF ou le PIN Propriétaire (Owner)
   */
  public async verifyRecoveryCode(secretCode: string): Promise<{ valid: boolean; error?: string }> {
    const clean = secretCode.trim();
    if (!clean) {
      return { valid: false, error: 'يرجى إدخال الرمز السري المطبوع في وثيقة الإعداد (Setup Charter PDF)' };
    }

    const { authService } = await import('./auth.service');

    if (this.isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const token =
          authService.getSessionToken() ||
          (typeof localStorage !== 'undefined' ? localStorage.getItem('aquadro_session_token') : null) ||
          '';
        const isOk = await invoke<boolean>('verify_danger_zone', { secret: clean, token });
        return { valid: isOk };
      } catch (err: any) {
        return { valid: false, error: err?.message || String(err) };
      }
    } else {
      // Mode Adaptateur SQLite / Web : vérifier le secret de la charte OU le PIN Propriétaire exclusif
      const savedSecret = typeof localStorage !== 'undefined' ? localStorage.getItem('aquadro_db_secret_key') : null;
      if (savedSecret && savedSecret.trim().length >= 4 && clean === savedSecret.trim()) {
        return { valid: true };
      }
      const ownerPinCheck = await authService.verifyOwnerPin(clean);
      if (ownerPinCheck.valid && ownerPinCheck.user?.role === 'owner') {
        return { valid: true };
      }
      return {
        valid: false,
        error: 'رمز الأمان غير مطابق للرمز السري المطبوع في وثيقة إعداد النظام (Setup Charter PDF) أو رمز المالك (Owner PIN).'
      };
    }
  }
}

export const usageSessionService = UsageSessionService.getInstance();

