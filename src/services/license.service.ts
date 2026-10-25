// Aquadro POS Algérie V2 — Service de Licence & Protection Matérielle (Aegis License Shield)
// Communique avec le Kernel Rust pour vérifier le verrouillage matériel (HWID),
// activer de nouvelles licences cryptographiques et protéger les transactions.

export interface LicenseStatusResponse {
  is_licensed: boolean;
  hwid: string;
  store_name?: string;
  license_type?: string;
  expires_at?: string;
  days_remaining?: number;
  is_lifetime: boolean;
  error?: string;
  // Période d'essai Démo 7 jours
  is_trial_active: boolean;
  is_trial_expired: boolean;
  trial_days_remaining: number;
}

export interface ActivationResult {
  success: boolean;
  message: string;
  status: LicenseStatusResponse;
}

export class LicenseService {
  private static instance: LicenseService;
  private isTauri = false;
  private cachedStatus: LicenseStatusResponse | null = null;

  private constructor() {
    this.isTauri = typeof window !== 'undefined' && typeof (window as any).__TAURI_INTERNALS__?.invoke === 'function';
  }

  public static getInstance(): LicenseService {
    if (!LicenseService.instance) {
      LicenseService.instance = new LicenseService();
    }
    return LicenseService.instance;
  }

  /**
   * Vérifie le statut de la licence auprès du kernel Rust ou du cache local
   */
  public async getStatus(forceRefresh = false): Promise<LicenseStatusResponse> {
    if (!forceRefresh && this.cachedStatus) {
      return this.cachedStatus;
    }

    if (this.isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const status = await invoke<LicenseStatusResponse>('get_license_status');
        this.cachedStatus = status;
        return status;
      } catch (err: any) {
        console.error('[LicenseService] Échec appel statut kernel:', err);
        return {
          is_licensed: false,
          hwid: 'AQ-ERREUR-COMMUNICATION',
          is_lifetime: false,
          error: err?.message || String(err),
          is_trial_active: false,
          is_trial_expired: true,
          trial_days_remaining: 0,
        };
      }
    }

    // Fallback environnement Web / Tests Vitest
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('aquadro_web_license_status');
        if (saved) {
          const parsed = JSON.parse(saved);
          this.cachedStatus = parsed;
          return parsed;
        }
      } catch (e) {}
    }

    // Par défaut en environnement de test web : licence active par défaut pour les tests
    const defaultWebStatus: LicenseStatusResponse = {
      is_licensed: true,
      hwid: 'AQ-DEV0-TEST-SIMU-2026',
      store_name: 'Aquadro Gourmet Pizzeria (Test Mode)',
      license_type: 'LIFETIME',
      expires_at: '2099-12-31',
      days_remaining: 36500,
      is_lifetime: true,
      is_trial_active: false,
      is_trial_expired: false,
      trial_days_remaining: 0,
    };
    this.cachedStatus = defaultWebStatus;
    return defaultWebStatus;
  }

  /**
   * Active une clé de licence cryptographique
   */
  public async activate(key: string): Promise<ActivationResult> {
    const cleanKey = key.trim();
    if (!cleanKey) {
      throw new Error('الرجاء إدخال مفتاح الترخيص');
    }

    if (this.isTauri) {
      const { invoke } = await import('@tauri-apps/api/core');
      const result = await invoke<ActivationResult>('activate_license_key', { key: cleanKey });
      this.cachedStatus = result.status;
      return result;
    }

    // Fallback mode Web
    const webStatus: LicenseStatusResponse = {
      is_licensed: true,
      hwid: 'AQ-DEV0-TEST-SIMU-2026',
      store_name: 'Pizzeria Aquadro Gourmet (Web Mode)',
      license_type: 'LIFETIME',
      expires_at: '2099-12-31',
      days_remaining: 36500,
      is_lifetime: true,
      is_trial_active: false,
      is_trial_expired: false,
      trial_days_remaining: 0,
    };
    if (typeof window !== 'undefined') {
      localStorage.setItem('aquadro_web_license_status', JSON.stringify(webStatus));
    }
    this.cachedStatus = webStatus;

    return {
      success: true,
      message: 'تم تنشيط البرنامج بنجاح (Mode Web)',
      status: webStatus
    };
  }

  /**
   * Efface le cache pour forcer une réévaluation
   */
  public clearCache(): void {
    this.cachedStatus = null;
  }
}

export const licenseService = LicenseService.getInstance();
