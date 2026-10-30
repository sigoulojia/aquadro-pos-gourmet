// Aquadro POS Algérie V2 — Service d'Authentification & Rôles Employés (RBAC)
// Integration avec Rust Session Manager (Security Fortress)

import { db, isPlaceholderSeedUser, isPlaceholderSeedStore } from '../db/sqlite';
import { User, UserRole, Store } from '../types/database';
import { SecurityUtil } from '../core/security/security';
import { SecurityUtil as HashUtil } from '../utils/security';
import { invoke as tauriInvoke } from '@tauri-apps/api/core';

const isTauri = typeof window !== 'undefined' && typeof (window as any).__TAURI_INTERNALS__?.invoke === 'function';

export interface SetupPayloadInput {
  store_name_fr: string;
  store_name_ar?: string;
  address: string;
  wilaya?: string;
  commune?: string;
  phone: string;
  email?: string | null;
  rc?: string;
  nif?: string;
  nis?: string;
  activity?: string;
  fiscal_regime?: string;
  tva_rate: number;
  owner_name: string;
  owner_phone: string;
  owner_pin: string;
  current_owner_pin?: string;
  token?: string;
}

export async function verifyPinCredential(
  inputPin: string,
  storedHash: string | undefined | null
): Promise<boolean> {
  if (!storedHash || !inputPin || typeof storedHash !== 'string' || typeof inputPin !== 'string') {
    return false;
  }
  const trimmedHash = storedHash.trim();
  const trimmedPin = inputPin.trim();
  if (!trimmedHash || !trimmedPin) {
    return false;
  }

  // Reject any legacy mock-hash-* or raw plaintext PIN
  if (trimmedHash.startsWith('mock-hash-') || trimmedHash === trimmedPin) {
    return false;
  }

  // 1. Argon2id hash ($argon2id$...) -> delegate to Rust backend when running in Tauri
  if (HashUtil.isValidArgon2Hash(trimmedHash)) {
    if (isTauri) {
      try {
        return Boolean(
          await tauriInvoke<boolean>('verify_pin_credential', {
            pin: trimmedPin,
            hash: trimmedHash
          })
        );
      } catch {
        return false;
      }
    }
    return false;
  }

  // 2. Salted SHA-256 hash (<salt>:<64-hex-chars>)
  if (HashUtil.isValidSaltedSha256Hash(trimmedHash)) {
    try {
      return await HashUtil.verifyCredential(trimmedPin, trimmedHash);
    } catch {
      return false;
    }
  }

  return false;
}

async function executeSafeSetupUpsert(
  payload: SetupPayloadInput,
  authContext?: { token?: string | null; currentOwnerPin?: string | null }
): Promise<void> {
  await db.ensureInitialized();

  // 1. Validate the new owner PIN strictly before any database operation
  const pinValidation = SecurityUtil.validateNewPin(payload.owner_pin);
  if (!pinValidation.valid) {
    throw new Error(pinValidation.error || 'Code PIN Propriétaire non conforme.');
  }

  // 2. Inspect existing store and active owner state (excluding unconfigured seed placeholders)
  const existingStores = await db.select<{ id: string; name_fr?: string; name?: string }>(
    'SELECT * FROM stores LIMIT 1'
  );
  const activeOwners = await db.select<{ id: string; pin_hash: string }>(
    "SELECT id, pin_hash FROM users WHERE role = 'owner' AND is_active = 1 ORDER BY created_at ASC"
  );

  const configuredStores = existingStores.filter(s => !isPlaceholderSeedStore(s));
  const configuredActiveOwners = activeOwners.filter(o => !isPlaceholderSeedUser(o));

  // If a configured active owner already exists, require explicit Owner authorization before modifying owner or store
  if (configuredActiveOwners.length > 0) {
    let authorized = false;

    const candidateToken = authContext?.token || payload.token || null;
    if (candidateToken) {
      const tokenUser = await verifyTokenUser(candidateToken);
      if (tokenUser && tokenUser.role === 'owner' && configuredActiveOwners.some(o => o.id === tokenUser.id)) {
        authorized = true;
      }
    }

    const candidateCurrentPin =
      authContext?.currentOwnerPin || payload.current_owner_pin || null;
    if (!authorized && candidateCurrentPin) {
      for (const owner of configuredActiveOwners) {
        if (await verifyPinCredential(candidateCurrentPin, owner.pin_hash)) {
          authorized = true;
          break;
        }
      }
    }

    if (!authorized) {
      // Si un jeton de session était présent mais a expiré ou est invalide, nettoyer la session
      // afin que l'interface redemande l'authentification au lieu de conserver une session obsolète.
      if (candidateToken) {
        await AuthService.getInstance().logout();
      }
      throw new Error(
        'Action non autorisée : La base de données est déjà configurée. Une authentification Propriétaire (Owner) est requise pour modifier la configuration initiale.'
      );
    }
  }

  const now = new Date().toISOString();
  const storeId =
    configuredStores.length > 0 && configuredStores[0].id ? configuredStores[0].id : 'store-alg-01';

  const allOwners = await db.select<{ id: string; pin_hash?: string }>(
    "SELECT id, pin_hash FROM users WHERE role = 'owner' ORDER BY created_at ASC"
  );
  const configuredAllOwners = allOwners.filter(o => !isPlaceholderSeedUser(o));
  const ownerId =
    configuredAllOwners.length > 0 && configuredAllOwners[0].id
      ? configuredAllOwners[0].id
      : 'usr-owner-01';

  // Hash the new owner PIN with salted SHA-256 (never store plaintext)
  const hashedOwnerPin = await HashUtil.hashCredential(payload.owner_pin.trim());
  const normalizedEmail =
    typeof payload.email === 'string' && payload.email.trim().length > 0
      ? payload.email.trim()
      : null;

  await db.execute('PRAGMA foreign_keys = ON;');
  await db.execute('BEGIN IMMEDIATE;');

  try {
    await db.execute(
      `INSERT INTO stores (
        id, name_fr, name_ar, wilaya, commune, address, phone, email,
        rc_number, nif_number, nis_number, ai_number, fiscal_regime,
        default_tva_rate, receipt_header, receipt_footer, currency, is_active,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name_fr = excluded.name_fr,
        name_ar = excluded.name_ar,
        wilaya = excluded.wilaya,
        commune = excluded.commune,
        address = excluded.address,
        phone = excluded.phone,
        email = COALESCE(excluded.email, stores.email),
        rc_number = excluded.rc_number,
        nif_number = excluded.nif_number,
        nis_number = excluded.nis_number,
        fiscal_regime = excluded.fiscal_regime,
        default_tva_rate = excluded.default_tva_rate,
        updated_at = excluded.updated_at`,
      [
        storeId,
        payload.store_name_fr || 'Aquadro Pizzeria',
        payload.store_name_ar || payload.store_name_fr || 'Aquadro Pizzeria',
        payload.wilaya || 'Alger',
        payload.commune || 'Alger',
        payload.address || '',
        payload.phone || '',
        normalizedEmail,
        payload.rc || '',
        payload.nif || '',
        payload.nis || '',
        'AI-0000',
        payload.fiscal_regime || 'IFU',
        Number(payload.tva_rate) || 0,
        'Bienvenue !',
        'Merci de votre visite',
        'DZD',
        1,
        now,
        now
      ]
    );

    await db.execute(
      `INSERT INTO users (
        id, store_id, name, role, pin_hash, phone, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        store_id = excluded.store_id,
        name = excluded.name,
        role = 'owner',
        pin_hash = excluded.pin_hash,
        phone = excluded.phone,
        is_active = 1,
        updated_at = excluded.updated_at`,
      [
        ownerId,
        storeId,
        payload.owner_name || 'Propriétaire',
        'owner',
        hashedOwnerPin,
        payload.owner_phone || payload.phone || '',
        1,
        now,
        now
      ]
    );

    // Nettoyer les éventuels enregistrements d'amorçage non configurés (SEED_USERS / SEED_STORE)
    for (const owner of activeOwners) {
      if (owner.id !== ownerId && isPlaceholderSeedUser(owner)) {
        try {
          await db.execute(`DELETE FROM users WHERE id = ?`, [owner.id]);
        } catch {}
      }
    }

    // Rattacher les utilisateurs et produits existants sans store_id (ou sur le store d'amorçage) au magasin actif
    await db.execute(`UPDATE users SET store_id = ? WHERE store_id IS NULL`, [storeId]);
    await db.execute(`UPDATE products SET store_id = ? WHERE store_id IS NULL`, [storeId]);
    for (const st of existingStores) {
      if (st.id !== storeId && isPlaceholderSeedStore(st)) {
        await db.execute(`UPDATE users SET store_id = ? WHERE store_id = ?`, [storeId, st.id]);
        await db.execute(`UPDATE products SET store_id = ? WHERE store_id = ?`, [storeId, st.id]);
        try {
          await db.execute(`DELETE FROM stores WHERE id = ?`, [st.id]);
        } catch {}
      }
    }

    await db.execute('COMMIT;');
  } catch (err) {
    try {
      await db.execute('ROLLBACK;');
    } catch {}
    throw err;
  }

  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('pizzeria_setup_completed', 'true');
    localStorage.setItem('aquadro_setup_completed', 'true');
  }
  db.markSetupVerifiedInMemory(true);
}

async function verifyTokenUser(token?: string | null): Promise<User | null> {
  const rawToken = String(token || '');
  if (!rawToken.startsWith('dev-token-')) {
    return null;
  }
  const id = rawToken.replace('dev-token-', '');
  const users = await db.select<User>('SELECT * FROM users WHERE id = ? AND is_active = 1', [id]);
  if (users.length === 0 || isPlaceholderSeedUser(users[0])) {
    return null;
  }
  return users[0];
}

async function invoke(cmd: string, args?: any): Promise<any> {
  if (isTauri) {
    return await tauriInvoke(cmd, args);
  }
  switch (cmd) {
    case 'check_setup_status': {
      return await db.isSetupCompleted();
    }
    case 'complete_setup': {
      const payload: SetupPayloadInput = args?.payload || args;
      await executeSafeSetupUpsert(payload, {
        token: args?.token ?? payload?.token ?? AuthService.getInstance().getSessionToken(),
        currentOwnerPin:
          args?.currentOwnerPin ??
          args?.current_owner_pin ??
          payload?.current_owner_pin ??
          null
      });
      return {};
    }
    case 'setup_db_secret': {
      const trimmedSecret = String(args?.secret || '').trim();
      if (!trimmedSecret) {
        throw new Error('Le code secret ne peut pas être vide');
      }
      const activeOwners = await db.select<{ id: string; pin_hash: string }>(
        "SELECT id, pin_hash FROM users WHERE role = 'owner' AND is_active = 1"
      );
      const configuredOwners = activeOwners.filter(o => !isPlaceholderSeedUser(o));
      if (configuredOwners.length > 0) {
        const candidateToken = args?.token ?? AuthService.getInstance().getSessionToken();
        const caller = await verifyTokenUser(candidateToken);
        if (!caller || caller.role !== 'owner') {
          if (candidateToken) {
            await AuthService.getInstance().logout();
          }
          throw new Error(
            'Action non autorisée : Session Propriétaire requise pour modifier le code secret.'
          );
        }
      }
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('aquadro_db_secret_key', trimmedSecret);
      }
      return {};
    }
    case 'get_store': {
      const stores = await db.select<Store>('SELECT * FROM stores LIMIT 1');
      const configured = stores.filter(s => !isPlaceholderSeedStore(s));
      return configured[0] || stores[0] || null;
    }
    case 'update_store': {
      const activeOwners = await db.select<{ id: string; pin_hash: string }>(
        "SELECT id, pin_hash FROM users WHERE role = 'owner' AND is_active = 1"
      );
      const configuredOwners = activeOwners.filter(o => !isPlaceholderSeedUser(o));
      if (configuredOwners.length > 0) {
        const candidateToken = args?.token ?? AuthService.getInstance().getSessionToken();
        const caller = await verifyTokenUser(candidateToken);
        if (!caller || caller.role !== 'owner') {
          if (candidateToken) {
            await AuthService.getInstance().logout();
          }
          throw new Error(
            'Action non autorisée : Session Propriétaire requise pour modifier les paramètres du magasin.'
          );
        }
      }
      const st = args?.store || {};
      const now = new Date().toISOString();
      await db.execute(
        `UPDATE stores SET
          name_fr = ?, name_ar = ?, wilaya = ?, commune = ?, address = ?, phone = ?,
          email = ?, rc_number = ?, nif_number = ?, nis_number = ?, ai_number = ?,
          fiscal_regime = ?, default_tva_rate = ?, receipt_header = ?, receipt_footer = ?,
          currency = ?, is_active = ?, updated_at = ?
        WHERE id = ?`,
        [
          st.name_fr || '',
          st.name_ar || '',
          st.wilaya || '',
          st.commune || '',
          st.address || '',
          st.phone || '',
          st.email || null,
          st.rc_number || '',
          st.nif_number || '',
          st.nis_number || '',
          st.ai_number || 'AI-0000',
          st.fiscal_regime || 'IFU',
          Number(st.default_tva_rate) || 0,
          st.receipt_header || null,
          st.receipt_footer || null,
          st.currency || 'DZD',
          st.is_active !== undefined ? st.is_active : 1,
          now,
          st.id || 'store-alg-01'
        ]
      );
      return {};
    }
    case 'authenticate_user': {
      const allUsers = await db.select<User>('SELECT * FROM users WHERE is_active = 1');
      const configuredUsers = allUsers.filter(u => !isPlaceholderSeedUser(u));
      if (configuredUsers.length === 0) {
        throw new Error(
          "Aucun utilisateur actif configuré. Veuillez compléter l'assistant d'installation."
        );
      }
      for (const u of configuredUsers) {
        if (await verifyPinCredential(args?.pin, u.pin_hash)) {
          return { token: `dev-token-${u.id}`, user: u };
        }
      }
      throw new Error('Code PIN incorrect');
    }
    case 'verify_session': {
      const caller = await verifyTokenUser(args?.token);
      if (caller) return caller;
      throw new Error('Session expirée');
    }
    case 'get_users': {
      const caller = await verifyTokenUser(args?.token);
      if (!caller || caller.role !== 'owner') {
        throw new Error('Accès refusé : Seul le propriétaire est autorisé à effectuer cette action.');
      }
      return await db.select<User>('SELECT * FROM users WHERE is_active = 1 ORDER BY name ASC');
    }
    case 'create_user': {
      const caller = await verifyTokenUser(args?.token);
      if (!caller || caller.role !== 'owner') {
        throw new Error('Accès refusé : Seul le propriétaire est autorisé à effectuer cette action.');
      }
      const pinCheck = SecurityUtil.validateNewPin(String(args?.pin || ''));
      if (!pinCheck.valid) {
        throw new Error(pinCheck.error || 'Code PIN non conforme.');
      }
      const hashedPin = await HashUtil.hashCredential(String(args.pin).trim());
      const now = new Date().toISOString();
      const stores = await db.select<{ id: string }>('SELECT id FROM stores LIMIT 1');
      const storeId = stores.length > 0 ? stores[0].id : null;
      const newId = `usr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      await db.execute(
        `INSERT INTO users (id, store_id, name, role, pin_hash, phone, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        [newId, storeId, args.name, args.role, hashedPin, args.phone || null, now, now]
      );
      const created = await db.select<User>('SELECT * FROM users WHERE id = ?', [newId]);
      return created[0];
    }
    case 'update_user_pin': {
      const caller = await verifyTokenUser(args?.token);
      if (!caller || caller.role !== 'owner') {
        throw new Error('Accès refusé : Seul le propriétaire est autorisé à effectuer cette action.');
      }
      const pinCheck = SecurityUtil.validateNewPin(String(args?.pin || ''));
      if (!pinCheck.valid) {
        throw new Error(pinCheck.error || 'Code PIN non conforme.');
      }
      const hashedPin = await HashUtil.hashCredential(String(args.pin).trim());
      const now = new Date().toISOString();
      await db.execute(`UPDATE users SET pin_hash = ?, updated_at = ? WHERE id = ?`, [
        hashedPin,
        now,
        args.id
      ]);
      return {};
    }
    case 'deactivate_user': {
      const caller = await verifyTokenUser(args?.token);
      if (!caller || caller.role !== 'owner') {
        throw new Error('Accès refusé : Seul le propriétaire est autorisé à effectuer cette action.');
      }
      const targetUsers = await db.select<User>('SELECT * FROM users WHERE id = ?', [args?.id]);
      if (targetUsers.length > 0 && targetUsers[0].role === 'owner') {
        const activeOwners = await db.select<User>(
          "SELECT * FROM users WHERE role = 'owner' AND is_active = 1"
        );
        if (activeOwners.length <= 1) {
          throw new Error('Impossible de désactiver le dernier compte propriétaire actif.');
        }
      }
      const now = new Date().toISOString();
      await db.execute(`UPDATE users SET is_active = 0, updated_at = ? WHERE id = ?`, [
        now,
        args.id
      ]);
      return {};
    }
    case 'logout_user':
      return true;
    case 'hash_new_pin': {
      const pinCheck = SecurityUtil.validateNewPin(String(args?.pin || ''));
      if (!pinCheck.valid) {
        throw new Error(pinCheck.error || 'Code PIN non conforme.');
      }
      return await HashUtil.hashCredential(String(args.pin).trim());
    }
    case 'verify_pin_credential': {
      return await verifyPinCredential(String(args?.pin || ''), String(args?.hash || ''));
    }
    default:
      return {};
  }
}

export class AuthService {
  private static instance: AuthService;
  private currentUser: User | null = null;
  private sessionToken: string | null = null;
  private listeners: Array<(user: User | null) => void> = [];
  private idleTimeout: NodeJS.Timeout | null = null;
  private readonly IDLE_LIMIT = 60 * 60 * 1000; // 1 heure (60 minutes) pour confort caisse

  private constructor() {
    this.setupIdleWatcher();
  }

  private setupIdleWatcher() {
    if (typeof window === 'undefined') return;
    window.addEventListener('mousemove', this.resetIdleTimeout);
    window.addEventListener('keydown', this.resetIdleTimeout);
    window.addEventListener('click', this.resetIdleTimeout);
  }

  private resetIdleTimeout = () => {
    if (this.idleTimeout) clearTimeout(this.idleTimeout);
    if (this.currentUser) {
      this.idleTimeout = setTimeout(() => {
        console.log("Déconnexion automatique pour inactivité (1 heure)");
        this.logout();
      }, this.IDLE_LIMIT);
    }
  };

  public static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  public getSessionToken(): string | null {
    return this.sessionToken;
  }

  public async initSession(): Promise<User | null> {
    const savedToken =
      (typeof localStorage !== 'undefined' ? localStorage.getItem('aquadro_session_token') : null) ||
      this.sessionToken;
    if (savedToken) {
      try {
        const user: User = await invoke('verify_session', { token: savedToken });
        this.sessionToken = savedToken;
        this.currentUser = user;
        this.notify();
        return user;
      } catch (e) {
        console.warn("Session expirée ou invalide:", e);
        await this.logout();
      }
    }
    this.currentUser = null;
    this.sessionToken = null;
    this.notify();
    return null;
  }

  public getCurrentUser(): User | null {
    return this.currentUser;
  }

  public async logout(): Promise<void> {
    const token = this.sessionToken;
    this.currentUser = null;
    this.sessionToken = null;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('aquadro_session_token');
      }
    } catch {}
    this.notify();

    if (token) {
      try {
        await invoke('logout_user', { token });
      } catch (e) {
        console.error("Erreur déconnexion backend", e);
      }
    }
  }

  public subscribe(listener: (user: User | null) => void): () => void {
    this.listeners.push(listener);
    listener(this.currentUser);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notify(): void {
    this.resetIdleTimeout();
    for (const listener of this.listeners) {
      listener(this.currentUser);
    }
  }

  public async completeSetup(
    payload: SetupPayloadInput,
    options?: { currentOwnerPin?: string; token?: string | null }
  ): Promise<void> {
    const effectiveToken =
      options?.token !== undefined
        ? options.token
        : this.sessionToken ||
          (typeof localStorage !== 'undefined' ? localStorage.getItem('aquadro_session_token') : null);
    const effectiveOwnerPin = options?.currentOwnerPin || payload.current_owner_pin;
    try {
      await invoke('complete_setup', {
        payload: {
          ...payload,
          ...(effectiveOwnerPin ? { current_owner_pin: effectiveOwnerPin } : {}),
          ...(effectiveToken ? { token: effectiveToken } : {})
        },
        token: effectiveToken,
        currentOwnerPin: effectiveOwnerPin,
        current_owner_pin: effectiveOwnerPin
      });
    } catch (err: any) {
      const msg = String(err?.message || err || '');
      if (effectiveToken && (msg.includes('Session expirée') || msg.includes('Session Propriétaire'))) {
        await this.logout();
      }
      throw err;
    }
  }

  public async setupDbSecret(secret: string, token?: string | null): Promise<void> {
    const effectiveToken =
      token !== undefined
        ? token
        : this.sessionToken ||
          (typeof localStorage !== 'undefined' ? localStorage.getItem('aquadro_session_token') : null);
    await invoke('setup_db_secret', {
      secret,
      token: effectiveToken
    });
  }

  public async getStore(): Promise<Store | null> {
    return await invoke('get_store');
  }

  public async updateStore(store: Partial<Store>, token?: string | null): Promise<void> {
    const effectiveToken =
      token !== undefined
        ? token
        : this.sessionToken ||
          (typeof localStorage !== 'undefined' ? localStorage.getItem('aquadro_session_token') : null);
    try {
      await invoke('update_store', {
        store,
        token: effectiveToken
      });
    } catch (err: any) {
      const msg = String(err?.message || err || '');
      if (effectiveToken && (msg.includes('Session expirée') || msg.includes('Session Propriétaire'))) {
        await this.logout();
      }
      throw err;
    }
  }

  public async getAllUsers(): Promise<User[]> {
    if (!this.sessionToken) return [];
    try {
      return await invoke('get_users', { token: this.sessionToken });
    } catch {
      return [];
    }
  }

  public async loginWithPin(pin: string): Promise<User | null> {
    try {
      const response: { token: string; user: User } = await invoke('authenticate_user', { pin });
      this.sessionToken = response.token;
      this.currentUser = response.user;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('aquadro_session_token', response.token);
      }
      this.notify();
      return response.user;
    } catch (error: any) {
      // Propagation de l'erreur (ex: Rate limit ou PIN invalide) pour l'UI
      throw new Error(error);
    }
  }

  // Vérifier si un PIN saisi appartient exclusivement au Propriétaire (Owner)
  public async verifyOwnerPin(inputPin: string): Promise<{ valid: boolean; user?: User }> {
    try {
      const response: { token: string; user: User } = await invoke('authenticate_user', { pin: inputPin });
      await invoke('logout_user', { token: response.token });
      if (response.user.role === 'owner') {
        return { valid: true, user: response.user };
      }
      return { valid: false };
    } catch {
      return { valid: false };
    }
  }

  // Vérifier si un PIN saisi appartient à un Manager ou Owner (utile pour les overrides d'UI)
  public async verifyManagerOrOwnerPin(inputPin: string): Promise<{ valid: boolean; user?: User }> {
    try {
      const response: { token: string; user: User } = await invoke('authenticate_user', { pin: inputPin });
      if (['owner', 'manager'].includes(response.user.role)) {
        // Déconnecter immédiatement ce token car on vérifie juste, on ne veut pas écraser la session courante
        await invoke('logout_user', { token: response.token });
        return { valid: true, user: response.user };
      }
      return { valid: false };
    } catch (e) {
      return { valid: false };
    }
  }

  public async verifyManagerPin(inputPin: string): Promise<User | null> {
    const res = await this.verifyManagerOrOwnerPin(inputPin);
    return res.valid && res.user ? res.user : null;
  }

  // Vérifier si un PIN saisi appartient à un Caissier, Manager ou Propriétaire (pour autoriser le remboursement)
  public async verifyRefundAuthorizationPin(inputPin: string): Promise<{ valid: boolean; user?: User }> {
    try {
      const response: { token: string; user: User } = await invoke('authenticate_user', { pin: inputPin });
      if (['owner', 'manager', 'cashier'].includes(response.user.role)) {
        await invoke('logout_user', { token: response.token });
        return { valid: true, user: response.user };
      }
      return { valid: false };
    } catch (e) {
      return { valid: false };
    }
  }

  // Créer un utilisateur avec code PIN sécurisé (Le hachage se fait en Rust)
  public async createUser(data: {
    name: string;
    role: UserRole;
    pin: string;
    phone?: string;
  }): Promise<User> {
    const validation = SecurityUtil.validateNewPin(data.pin);
    if (!validation.valid) {
      throw new Error(validation.error);
    }
    if (!this.sessionToken) throw new Error("Non authentifié");

    return await invoke('create_user', {
      name: data.name.trim(),
      role: data.role,
      pin: data.pin,
      phone: data.phone?.trim() || null,
      token: this.sessionToken
    });
  }

  // Changer le code PIN d'un utilisateur existant
  public async updateUserPin(userId: string, newPin: string): Promise<void> {
    const validation = SecurityUtil.validateNewPin(newPin);
    if (!validation.valid) {
      throw new Error(validation.error);
    }
    if (!this.sessionToken) throw new Error("Non authentifié");
    
    await invoke('update_user_pin', { id: userId, pin: newPin, token: this.sessionToken });
  }

  // Désactiver (soft-delete) un utilisateur
  public async deactivateUser(userId: string): Promise<void> {
    if (!this.sessionToken) throw new Error("Non authentifié");
    await invoke('deactivate_user', { id: userId, token: this.sessionToken });
  }

  // Permission RBAC de base pour le frontend (Le Backend valide toujours de façon authoritaire)
  public hasPermission(permission: string, user: User | null = this.currentUser): boolean {
    if (!user) return false;
    if (user.role === 'owner') return true;
    if (user.role === 'manager') {
      return !['users.manage', 'fiscal.settings', 'backup.restore', 'products.view_cost'].includes(permission);
    }
    // Caissier : POS, vente, consultation des ventes, clients et remboursements
    return ['pos.checkout', 'pos.search', 'sales.view', 'customers.view', 'sales.refund'].includes(permission);
  }
}

export const authService = AuthService.getInstance();
