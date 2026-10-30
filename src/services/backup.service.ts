// Aquadro POS — Runtime & Backup Service
// Interface unifiée avec le moteur natif Rust de sauvegarde atomique SQLite (VACUUM INTO),
// intégrité de la base (PRAGMA integrity_check) et migration JSON complète protégée par PIN Propriétaire.

import { db, isPlaceholderSeedStore, isPlaceholderSeedUser } from '../db/sqlite';
import { authService } from './auth.service';
import { licenseService } from './license.service';
import { SEED_ROLES, SEED_PERMISSIONS } from '../db/seed';
import { SecurityUtil as PasswordPolicy } from '../core/security/security';
import { SecurityUtil as HashUtil } from '../utils/security';

export interface RuntimePathsInfo {
  app_data_dir: string;
  database_path: string;
  logs_dir: string;
  backups_dir: string;
  config_dir: string;
}

export interface BackupInfo {
  filename: string;
  filepath: string;
  size_bytes: number;
  created_at: string;
  is_valid: boolean;
}

export interface IntegrityReport {
  is_healthy: boolean;
  checks: string[];
}

export interface JsonBackupMetadata {
  id: string;
  filename: string;
  createdAt: string;
  sizeBytes: number;
  tableCounts: Record<string, number>;
  totalRecords?: number;
  schemaVersion?: number;
  jsonContent?: string;
}

export interface BackupAppSettings {
  aquadro_receipt_template_config?: string | null;
  aquadro_kitchen_ticket_template_config?: string | null;
  aquadro_printer_config?: string | null;
  aquadro_selected_printer?: string | null;
  aquadro_store_logo?: string | null;
  pizzeria_store_logo?: string | null;
  pizzeria_delivery_fee?: string | null;
  aquadro_manual_drawer_allowed?: string | null;
  aquadro_drawer_enabled?: string | null;
  pizzeria_setup_completed?: string | null;
  aquadro_setup_completed?: string | null;
}

export interface RestoreOptions {
  fromSetup?: boolean;
  overwriteDevicePrinter?: boolean;
  newOwnerPin?: string;
}

export const BACKUP_SCHEMA_VERSION = 2;
export const BACKUP_FORMAT_IDENTIFIER = 'AQUADRO_POS_BACKUP_V2';

/**
 * Ordre topologique strict parent -> enfant basé sur les clés étrangères réelles du schéma SQLite.
 * L'insertion DOIT suivre cet ordre exact ; la suppression DOIT suivre l'ordre inverse exact.
 */
export const BACKUP_TABLES_TOPOLOGICAL_ORDER: readonly string[] = [
  'stores',
  'roles',
  'permissions',
  'categories',
  'brands',
  'suppliers',
  'customers',
  'ingredients',
  'pizza_supplements',
  'store_needs',
  'document_sequences',
  'users',
  'products',
  'recipe_items',
  'product_batches',
  'cash_sessions',
  'purchases',
  'purchase_items',
  'inventory_movements',
  'expenses',
  'customer_payments',
  'supplier_payments',
  'sales',
  'sale_items',
  'payments',
  'refunds',
  'refund_items',
  'commercial_documents',
  'audit_logs',
  'sync_operations'
] as const;

/**
 * Paramètres applicatifs portables (modèles de tickets, logo, frais de livraison, options tiroir).
 * Lors d'une restauration, si une clé portable est absente de la sauvegarde, l'ancienne valeur locale est nettoyée.
 */
export const PORTABLE_APP_SETTINGS_KEYS: Array<keyof BackupAppSettings> = [
  'aquadro_receipt_template_config',
  'aquadro_kitchen_ticket_template_config',
  'aquadro_printer_config',
  'aquadro_store_logo',
  'pizzeria_store_logo',
  'pizzeria_delivery_fee',
  'aquadro_manual_drawer_allowed',
  'aquadro_drawer_enabled'
];

/**
 * Paramètres matériels liés au poste local (ne jamais écraser un périphérique existant sauf demande explicite).
 */
export const DEVICE_SPECIFIC_SETTINGS_KEYS: Array<keyof BackupAppSettings> = [
  'aquadro_selected_printer'
];

/**
 * Clés de licence, HWID, jetons cryptographiques et états d'activation
 * qui ne doivent JAMAIS être exportés ni restaurés dans une sauvegarde JSON.
 * La licence est strictement locale au terminal et à l'installation matérielle.
 */
export const EXCLUDED_LICENSE_SETTINGS_KEYS: readonly string[] = [
  'aquadro_web_license_status',
  'aquadro_license',
  'aquadro_license_key',
  'aquadro_pos_lic',
  'aquadro_hwid',
  'aquadro_trial_info',
  'aquadro_activation_code',
  'hwid',
  'license',
  'license_key',
  'license_status',
  'is_licensed'
] as const;

/**
 * Clés sensibles liées au poste local qui ne doivent JAMAIS être exportées ni écrasées par une sauvegarde JSON.
 */
export const EXCLUDED_SECRET_SETTINGS_KEYS: readonly string[] = [
  'aquadro_db_secret_key',
  'aquadro_session_token',
  ...EXCLUDED_LICENSE_SETTINGS_KEYS
] as const;

/**
 * Liste blanche explicite (Allowlist) stricte des clés de paramètres applicatifs autorisées à l'exportation et à la restauration.
 * TOUTE clé hors de cette liste blanche est formellement ignorée et exclue.
 */
export const ALLOWED_EXPORT_APP_SETTINGS_KEYS: readonly (keyof BackupAppSettings)[] = [
  'aquadro_receipt_template_config',
  'aquadro_kitchen_ticket_template_config',
  'aquadro_printer_config',
  'aquadro_store_logo',
  'pizzeria_store_logo',
  'pizzeria_delivery_fee',
  'aquadro_manual_drawer_allowed',
  'aquadro_drawer_enabled',
  'aquadro_selected_printer',
  'pizzeria_setup_completed',
  'aquadro_setup_completed'
] as const;

export const ALLOWED_EXPORT_SETTINGS_SET: ReadonlySet<string> = new Set<string>(ALLOWED_EXPORT_APP_SETTINGS_KEYS);

/**
 * Vérifie si une clé de configuration est sensible ou liée à la licence/sécurité.
 */
export function isDisallowedSecurityOrLicenseKey(key: string): boolean {
  if (!key || typeof key !== 'string') return true;
  const lower = key.toLowerCase().trim();

  // 1. Appartenance à la liste d'exclusion explicite
  if (EXCLUDED_SECRET_SETTINGS_KEYS.some(k => k.toLowerCase() === lower)) {
    return true;
  }

  // 2. Détection par motif de sécurité / licence
  if (
    lower.includes('license') ||
    lower.includes('licence') ||
    lower.includes('hwid') ||
    lower.includes('aqlic') ||
    lower.includes('secret') ||
    lower.includes('token') ||
    lower.includes('credential') ||
    lower.includes('signature') ||
    lower.includes('private_key') ||
    lower.includes('vendor_key')
  ) {
    return true;
  }

  return false;
}

/**
 * Vérifie si une valeur sérialisée contient une clé de licence ou des données sensibles.
 */
export function isDisallowedLicenseOrSecretValue(val: any): boolean {
  if (val === null || val === undefined) return false;
  const str = typeof val === 'string' ? val : JSON.stringify(val);

  // Détecte les clés de licence Aquadro format AQLIC-...
  if (str.includes('AQLIC-') || str.includes('aegis_trial') || str.includes('aquadro_pos.lic')) {
    return true;
  }

  // Détecte les structures sérialisées de statut de licence (ex: {"is_licensed":true,"hwid":"..."})
  if (
    (str.includes('"is_licensed"') || str.includes("'is_licensed'")) &&
    (str.includes('"hwid"') || str.includes("'hwid'") || str.includes('license_type'))
  ) {
    return true;
  }

  return false;
}

const APP_SETTINGS_KEYS: Array<keyof BackupAppSettings> = [
  ...PORTABLE_APP_SETTINGS_KEYS,
  ...DEVICE_SPECIFIC_SETTINGS_KEYS,
  'pizzeria_setup_completed',
  'aquadro_setup_completed'
];

const TABLE_REQUIRED_PRIMARY_KEY: Record<string, string> = {
  stores: 'id',
  roles: 'id',
  permissions: 'id',
  categories: 'id',
  brands: 'id',
  suppliers: 'id',
  customers: 'id',
  ingredients: 'id',
  pizza_supplements: 'id',
  store_needs: 'id',
  document_sequences: 'document_type',
  users: 'id',
  products: 'id',
  recipe_items: 'id',
  product_batches: 'id',
  cash_sessions: 'id',
  purchases: 'id',
  purchase_items: 'id',
  inventory_movements: 'id',
  expenses: 'id',
  customer_payments: 'id',
  supplier_payments: 'id',
  sales: 'id',
  sale_items: 'id',
  payments: 'id',
  refunds: 'id',
  refund_items: 'id',
  commercial_documents: 'id',
  audit_logs: 'id',
  sync_operations: 'id'
};

const TABLE_ALLOWED_COLUMNS: Record<string, Set<string>> = {
  stores: new Set([
    'id', 'name_fr', 'name_ar', 'wilaya', 'commune', 'address', 'phone', 'email',
    'rc_number', 'nif_number', 'nis_number', 'ai_number', 'fiscal_regime',
    'default_tva_rate', 'receipt_header', 'receipt_footer', 'currency',
    'is_active', 'created_at', 'updated_at'
  ]),
  roles: new Set(['id', 'name', 'description']),
  permissions: new Set(['id', 'role_id', 'resource', 'action']),
  categories: new Set(['id', 'name_fr', 'name_ar', 'created_at']),
  brands: new Set(['id', 'name', 'created_at']),
  suppliers: new Set([
    'id', 'name', 'contact_person', 'phone', 'email',
    'rc_number', 'nif_number', 'current_balance', 'created_at'
  ]),
  customers: new Set([
    'id', 'name', 'phone', 'wilaya', 'notes',
    'credit_limit', 'current_debt', 'loyalty_points', 'created_at'
  ]),
  ingredients: new Set([
    'id', 'name_fr', 'name_ar', 'unit', 'current_stock', 'min_stock_alert',
    'cost_per_unit', 'is_active', 'created_at', 'updated_at'
  ]),
  pizza_supplements: new Set([
    'id', 'name_fr', 'name_ar', 'purchase_cost', 'price', 'current_stock',
    'min_stock_alert', 'category', 'is_active', 'created_at'
  ]),
  store_needs: new Set([
    'id', 'item_name', 'quantity_needed', 'urgency', 'notes',
    'requested_by', 'status', 'created_at', 'completed_at'
  ]),
  document_sequences: new Set(['document_type', 'current_year', 'last_sequence_number']),
  users: new Set([
    'id', 'store_id', 'name', 'role', 'pin_hash', 'phone',
    'is_active', 'created_at', 'updated_at'
  ]),
  products: new Set([
    'id', 'store_id', 'category_id', 'brand_id', 'sku', 'barcode', 'additional_barcodes',
    'name_fr', 'name_ar', 'variant', 'size_weight', 'unit_of_measure', 'box_conversion_ratio',
    'purchase_cost', 'selling_price_ttc', 'min_selling_price_ttc', 'tva_rate',
    'current_stock', 'min_stock_alert', 'image_url', 'is_active', 'created_at', 'updated_at'
  ]),
  recipe_items: new Set([
    'id', 'product_id', 'ingredient_id', 'quantity_required', 'unit_display', 'created_at'
  ]),
  product_batches: new Set([
    'id', 'product_id', 'batch_number', 'expiration_date', 'current_stock', 'purchase_cost', 'created_at'
  ]),
  cash_sessions: new Set([
    'id', 'cashier_id', 'cashier_name', 'opened_at', 'closed_at', 'status',
    'opening_float', 'total_cash_sales', 'total_card_sales', 'total_qr_sales',
    'total_credit_sales', 'total_cash_refunds', 'total_cash_expenses',
    'expected_cash_drawer', 'actual_counted_cash', 'cash_discrepancy',
    'closing_notes', 'closed_by_manager_name'
  ]),
  purchases: new Set([
    'id', 'supplier_id', 'order_number', 'total_cost', 'status', 'ordered_at', 'received_at'
  ]),
  purchase_items: new Set([
    'id', 'purchase_id', 'product_id', 'quantity_ordered', 'quantity_received',
    'purchase_cost', 'batch_number', 'expiration_date'
  ]),
  inventory_movements: new Set([
    'id', 'product_id', 'batch_id', 'movement_type', 'quantity_change',
    'previous_stock', 'new_stock', 'reference_id', 'reason',
    'unit_cost_snapshot', 'user_id', 'created_at'
  ]),
  expenses: new Set([
    'id', 'category', 'amount', 'payment_method', 'description', 'date', 'user_id', 'created_at'
  ]),
  customer_payments: new Set([
    'id', 'customer_id', 'amount', 'payment_method', 'reference', 'cashier_id', 'created_at'
  ]),
  supplier_payments: new Set([
    'id', 'supplier_id', 'amount', 'payment_method', 'reference', 'user_id', 'created_at'
  ]),
  sales: new Set([
    'id', 'receipt_number', 'session_id', 'cashier_id', 'customer_id',
    'subtotal_ht', 'discount_amount', 'tax_amount', 'total_ttc',
    'status', 'idempotency_key', 'sync_status', 'created_at'
  ]),
  sale_items: new Set([
    'id', 'sale_id', 'product_id', 'product_name', 'batch_id',
    'quantity', 'unit_price_ttc', 'discount_amount', 'total_ttc',
    'unit_purchase_cost_snapshot', 'supplements', 'notes', 'created_at'
  ]),
  payments: new Set([
    'id', 'sale_id', 'payment_method', 'amount', 'tendered_amount',
    'change_given', 'tpe_auth_reference', 'created_at'
  ]),
  refunds: new Set([
    'id', 'original_sale_id', 'receipt_number', 'cashier_id',
    'refund_amount', 'payment_method', 'reason', 'authorized_by_pin', 'created_at'
  ]),
  refund_items: new Set([
    'id', 'refund_id', 'sale_item_id', 'product_id',
    'quantity', 'refund_price', 'unit_purchase_price', 'restock_inventory'
  ]),
  commercial_documents: new Set([
    'id', 'document_type', 'document_number', 'reference_id',
    'customer_or_supplier_name', 'total_ttc', 'created_at'
  ]),
  audit_logs: new Set([
    'id', 'user_id', 'user_name', 'action', 'entity_type', 'entity_id', 'details', 'created_at'
  ]),
  sync_operations: new Set([
    'id', 'table_name', 'record_id', 'action', 'payload',
    'status', 'retry_count', 'last_error', 'created_at', 'synced_at'
  ])
};

interface ForeignKeySpec {
  childTable: string;
  childCol: string;
  parentTable: string;
  parentCol: string;
  required: boolean;
}

const BACKUP_FK_SPECS: ForeignKeySpec[] = [
  { childTable: 'users', childCol: 'store_id', parentTable: 'stores', parentCol: 'id', required: false },
  { childTable: 'products', childCol: 'store_id', parentTable: 'stores', parentCol: 'id', required: false },
  { childTable: 'products', childCol: 'category_id', parentTable: 'categories', parentCol: 'id', required: true },
  { childTable: 'products', childCol: 'brand_id', parentTable: 'brands', parentCol: 'id', required: false },
  { childTable: 'recipe_items', childCol: 'product_id', parentTable: 'products', parentCol: 'id', required: true },
  { childTable: 'recipe_items', childCol: 'ingredient_id', parentTable: 'ingredients', parentCol: 'id', required: true },
  { childTable: 'product_batches', childCol: 'product_id', parentTable: 'products', parentCol: 'id', required: true },
  { childTable: 'cash_sessions', childCol: 'cashier_id', parentTable: 'users', parentCol: 'id', required: true },
  { childTable: 'purchases', childCol: 'supplier_id', parentTable: 'suppliers', parentCol: 'id', required: true },
  { childTable: 'purchase_items', childCol: 'purchase_id', parentTable: 'purchases', parentCol: 'id', required: true },
  { childTable: 'purchase_items', childCol: 'product_id', parentTable: 'products', parentCol: 'id', required: true },
  { childTable: 'inventory_movements', childCol: 'product_id', parentTable: 'products', parentCol: 'id', required: true },
  { childTable: 'inventory_movements', childCol: 'batch_id', parentTable: 'product_batches', parentCol: 'id', required: false },
  { childTable: 'inventory_movements', childCol: 'user_id', parentTable: 'users', parentCol: 'id', required: true },
  { childTable: 'expenses', childCol: 'user_id', parentTable: 'users', parentCol: 'id', required: true },
  { childTable: 'customer_payments', childCol: 'customer_id', parentTable: 'customers', parentCol: 'id', required: true },
  { childTable: 'customer_payments', childCol: 'cashier_id', parentTable: 'users', parentCol: 'id', required: true },
  { childTable: 'sales', childCol: 'session_id', parentTable: 'cash_sessions', parentCol: 'id', required: false },
  { childTable: 'sales', childCol: 'cashier_id', parentTable: 'users', parentCol: 'id', required: true },
  { childTable: 'sale_items', childCol: 'sale_id', parentTable: 'sales', parentCol: 'id', required: true },
  { childTable: 'sale_items', childCol: 'product_id', parentTable: 'products', parentCol: 'id', required: true },
  { childTable: 'sale_items', childCol: 'batch_id', parentTable: 'product_batches', parentCol: 'id', required: false },
  { childTable: 'payments', childCol: 'sale_id', parentTable: 'sales', parentCol: 'id', required: true },
  { childTable: 'refunds', childCol: 'original_sale_id', parentTable: 'sales', parentCol: 'id', required: true },
  { childTable: 'refunds', childCol: 'cashier_id', parentTable: 'users', parentCol: 'id', required: true },
  { childTable: 'refund_items', childCol: 'refund_id', parentTable: 'refunds', parentCol: 'id', required: true },
  { childTable: 'refund_items', childCol: 'product_id', parentTable: 'products', parentCol: 'id', required: true }
];

export interface ValidatedBackupPayload {
  schemaVersion: number;
  isLegacy: boolean;
  tables: Record<string, Record<string, any>[]>;
  appSettings: BackupAppSettings;
}

function normalizeLegacyRowForSchema(table: string, rawRow: Record<string, any>, nowIso: string): Record<string, any> {
  const row = { ...rawRow };
  if (table === 'stores') {
    if (!row.name_fr) row.name_fr = row.name || 'Aquadro Pizzeria Gourmet';
    if (!row.name_ar || String(row.name_ar).trim() === '') {
      row.name_ar = row.legal_name || row.name_fr;
    }
    if (row.wilaya === undefined || row.wilaya === null) row.wilaya = 'Alger';
    if (row.commune === undefined || row.commune === null) row.commune = 'Alger';
    if (row.address === undefined || row.address === null) row.address = '';
    if (row.phone === undefined || row.phone === null) row.phone = '';
    if (row.rc_number === undefined || row.rc_number === null) row.rc_number = '';
    if (row.nif_number === undefined || row.nif_number === null) row.nif_number = '';
    if (row.nis_number === undefined || row.nis_number === null) row.nis_number = '';
    if (row.ai_number === undefined || row.ai_number === null) row.ai_number = '';
    if (!row.fiscal_regime) row.fiscal_regime = 'IFU';
    if (!row.created_at) row.created_at = nowIso;
    if (!row.updated_at) row.updated_at = nowIso;
  } else if (table === 'categories') {
    if (!row.name_fr && row.name) row.name_fr = row.name;
    if (!row.name_ar || String(row.name_ar).trim() === '') {
      row.name_ar = row.name_fr || 'Catégorie';
    }
    if (!row.created_at) row.created_at = nowIso;
  } else if (table === 'products') {
    if (!row.name_fr && row.name) row.name_fr = row.name;
    if (!row.name_ar || String(row.name_ar).trim() === '') {
      row.name_ar = row.name_fr || '';
    }
    if (row.current_stock === undefined || row.current_stock === null) {
      row.current_stock = 0;
    }
    if (!row.created_at) row.created_at = nowIso;
    if (!row.updated_at) row.updated_at = nowIso;
  } else if (table === 'ingredients') {
    if (!row.name_fr && row.name) row.name_fr = row.name;
    if (!row.name_ar || String(row.name_ar).trim() === '') {
      row.name_ar = row.name_fr || 'Ingrédient';
    }
    if (row.current_stock === undefined || row.current_stock === null) {
      row.current_stock = 0;
    }
    if (!row.created_at) row.created_at = nowIso;
    if (!row.updated_at) row.updated_at = nowIso;
  } else if (table === 'pizza_supplements') {
    if (!row.name_fr && row.name) row.name_fr = row.name;
    if (!row.name_ar || String(row.name_ar).trim() === '') {
      row.name_ar = row.name_fr || 'Supplément';
    }
    if (row.current_stock === undefined || row.current_stock === null) {
      row.current_stock = 0;
    }
    if (!row.created_at) row.created_at = nowIso;
  } else if (table === 'product_batches') {
    if (row.current_stock === undefined && row.quantity !== undefined) {
      row.current_stock = row.quantity;
    }
    if (row.current_stock === undefined || row.current_stock === null) {
      row.current_stock = 0;
    }
    if (!row.created_at) row.created_at = nowIso;
  } else if (table === 'customers') {
    if (!row.name && row.full_name) {
      row.name = row.full_name;
    }
    if (!row.created_at) row.created_at = nowIso;
  } else if (table === 'suppliers') {
    if (!row.name && row.company_name) {
      row.name = row.company_name;
    }
    if (row.contact_person === undefined && row.contact_name !== undefined) {
      row.contact_person = row.contact_name;
    }
    if (!row.created_at) row.created_at = nowIso;
  }
  return row;
}

export class BackupService {
  private static instance: BackupService;
  private isTauri = false;

  private constructor() {
    this.isTauri = typeof window !== 'undefined' && typeof (window as any).__TAURI_INTERNALS__?.invoke === 'function';
  }

  public static getInstance(): BackupService {
    if (!BackupService.instance) {
      BackupService.instance = new BackupService();
    }
    return BackupService.instance;
  }

  /**
   * Récupère les chemins système AppData résolus
   */
  public async getRuntimePaths(): Promise<RuntimePathsInfo | null> {
    if (!this.isTauri) {
      return {
        app_data_dir: 'Navigateur / LocalStorage',
        database_path: 'pizzeria_pos.db',
        logs_dir: 'Navigateur Console',
        backups_dir: 'Téléchargements',
        config_dir: 'LocalStorage',
      };
    }
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<RuntimePathsInfo>('get_runtime_paths');
    } catch (err) {
      console.warn('[BackupService] Impossible d\'obtenir les chemins runtime:', err);
      return null;
    }
  }

  /**
   * Crée un instantané atomique natif SQLite (VACUUM INTO) dans AppData/backups/
   */
  public async createBackup(label?: string): Promise<BackupInfo | null> {
    if (this.isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        return await invoke<BackupInfo>('create_database_backup', { label: label || 'manual' });
      } catch (err) {
        console.error('[BackupService] Échec création de sauvegarde native:', err);
        throw err;
      }
    } else {
      // Mode web / secours : génère un fichier JSON complet
      const jsonMeta = await this.exportJsonBackup();
      return {
        filename: jsonMeta.filename,
        filepath: 'Downloads/' + jsonMeta.filename,
        size_bytes: jsonMeta.sizeBytes,
        created_at: jsonMeta.createdAt,
        is_valid: true,
      };
    }
  }

  /**
   * Liste les sauvegardes physiques présentes dans AppData/backups/
   */
  public async listBackups(): Promise<BackupInfo[]> {
    if (!this.isTauri) return [];
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<BackupInfo[]>('list_database_backups');
    } catch (err) {
      console.warn('[BackupService] Échec liste des sauvegardes:', err);
      return [];
    }
  }

  /**
   * Exécute un diagnostic d'intégrité de la base de données
   */
  public async verifyDatabaseIntegrity(): Promise<IntegrityReport> {
    if (!this.isTauri) {
      const fkViolations = await db.select<any>('PRAGMA foreign_key_check;');
      const healthy = !Array.isArray(fkViolations) || fkViolations.length === 0;
      return {
        is_healthy: healthy,
        checks: healthy
          ? ['Intégrité référentielle et structurelle vérifiée (OK)']
          : fkViolations.map(v => `Violation FK: ${v.table} -> ${v.parent}`)
      };
    }
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<IntegrityReport>('verify_database_integrity');
    } catch (err) {
      console.error('[BackupService] Échec vérification d\'intégrité:', err);
      return { is_healthy: false, checks: [String(err)] };
    }
  }

  /**
   * Exporte un dump structuré complet au format JSON incluant l'ensemble des 30 tables métier
   * ainsi que les configurations applicatives (modèles de tickets, imprimante, logo, frais de livraison).
   */
  public async exportJsonBackup(): Promise<JsonBackupMetadata> {
    await db.ensureInitialized();

    const exportPayload: Record<string, any> = {
      _backup_meta: {
        format: BACKUP_FORMAT_IDENTIFIER,
        schemaVersion: BACKUP_SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
        appVersion: '1.0.2'
      }
    };

    const tableCounts: Record<string, number> = {};
    let totalRecords = 0;

    for (const table of BACKUP_TABLES_TOPOLOGICAL_ORDER) {
      try {
        const rows = await db.select(`SELECT * FROM ${table}`);
        const safeRows = Array.isArray(rows) ? rows : [];
        exportPayload[table] = safeRows;
        tableCounts[table] = safeRows.length;
        totalRecords += safeRows.length;
      } catch {
        if (table === 'roles') {
          exportPayload[table] = [...SEED_ROLES];
        } else if (table === 'permissions') {
          exportPayload[table] = [...SEED_PERMISSIONS];
        } else {
          exportPayload[table] = [];
        }
        tableCounts[table] = exportPayload[table].length;
        totalRecords += exportPayload[table].length;
      }
    }

    // Sauvegarder également les configurations applicatives autorisées (Allowlist stricte)
    // RÈGLE ABSOLUE : Aucune clé de licence, aucun HWID, aucun jeton ou signature ne peut être exporté.
    const appSettings: BackupAppSettings = {};
    if (typeof localStorage !== 'undefined') {
      for (const key of ALLOWED_EXPORT_APP_SETTINGS_KEYS) {
        if (isDisallowedSecurityOrLicenseKey(key)) continue;
        const val = localStorage.getItem(key);
        if (val !== null && !isDisallowedLicenseOrSecretValue(val)) {
          appSettings[key] = val;
        }
      }
    }
    exportPayload._app_settings = appSettings;

    // Assainir toute fuite indirecte potentielle dans audit_logs
    if (Array.isArray(exportPayload.audit_logs)) {
      exportPayload.audit_logs = exportPayload.audit_logs.map((log: any) => {
        if (log && typeof log.details === 'string' && isDisallowedLicenseOrSecretValue(log.details)) {
          return { ...log, details: '[REDACTED_SECURITY_DATA]' };
        }
        return log;
      });
    }

    const data = JSON.stringify(exportPayload, null, 2);
    const now = new Date();
    const dateStr = now.toISOString().replace(/[:.]/g, '-');
    const filename = `aquadro_backup_${dateStr}.json`;

    const sizeBytes = typeof Blob !== 'undefined' ? new Blob([data]).size : Buffer.byteLength(data, 'utf8');

    const metadata: JsonBackupMetadata = {
      id: `bkp-${Date.now()}`,
      filename,
      createdAt: now.toISOString(),
      sizeBytes,
      tableCounts,
      totalRecords,
      schemaVersion: BACKUP_SCHEMA_VERSION,
      jsonContent: data
    };

    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('aquadro_last_backup_json', data);
        localStorage.setItem('aquadro_last_backup_meta', JSON.stringify({
          id: metadata.id,
          filename: metadata.filename,
          createdAt: metadata.createdAt,
          sizeBytes: metadata.sizeBytes,
          tableCounts: metadata.tableCounts,
          totalRecords: metadata.totalRecords,
          schemaVersion: metadata.schemaVersion
        }));
      } catch { }
    }

    if (
      typeof window !== 'undefined' &&
      typeof document !== 'undefined' &&
      typeof Blob !== 'undefined' &&
      typeof URL !== 'undefined' &&
      typeof URL.createObjectURL === 'function'
    ) {
      try {
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } catch {
        // Ignorer en environnement de test sans navigateur complet
      }
    }

    const user = authService.getCurrentUser();
    try {
      await db.execute(
        `INSERT INTO audit_logs (id, user_id, user_name, action, entity_type, entity_id, details, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          user?.id || 'system',
          user?.name || 'Système',
          'BACKUP_JSON_EXPORTED',
          'SYSTEM',
          filename,
          `Sauvegarde JSON exportée : ${filename} (${metadata.sizeBytes} octets)`,
          new Date().toISOString()
        ]
      );
    } catch { }

    return metadata;
  }

  /**
   * Validation stricte et normalisation des sauvegardes (V2 et Legacy V1)
   * Vérifie la syntaxe JSON, la version de schéma, les champs requis, les types de colonnes
   * et l'intégrité référentielle (clés étrangères) AVANT toute modification de la base de données.
   */
  public validateAndNormalizeBackup(jsonData: string): ValidatedBackupPayload {
    if (!jsonData || typeof jsonData !== 'string' || !jsonData.trim()) {
      throw new Error('Fichier de sauvegarde vide ou invalide.');
    }

    let parsed: any;
    try {
      parsed = JSON.parse(jsonData);
    } catch {
      throw new Error('Format JSON corrompu : impossible de décoder le fichier de sauvegarde.');
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Structure de sauvegarde invalide : un objet JSON racine est requis.');
    }

    // Vérification de la version du schéma si _backup_meta est présent
    let schemaVersion = 1;
    let isLegacy = true;
    if (parsed._backup_meta !== undefined) {
      if (typeof parsed._backup_meta !== 'object' || parsed._backup_meta === null) {
        throw new Error('Métadonnées de sauvegarde (_backup_meta) invalides.');
      }
      if (
        parsed._backup_meta.schemaVersion !== undefined &&
        (typeof parsed._backup_meta.schemaVersion !== 'number' ||
          parsed._backup_meta.schemaVersion < 1 ||
          parsed._backup_meta.schemaVersion > BACKUP_SCHEMA_VERSION)
      ) {
        throw new Error(
          `Version de schéma de sauvegarde non supportée (${String(parsed._backup_meta.schemaVersion)}).`
        );
      }
      schemaVersion = parsed._backup_meta.schemaVersion ?? BACKUP_SCHEMA_VERSION;
      isLegacy = schemaVersion < 2;
    }

    // Validation de présence des collections essentielles :
    // - `products` doit toujours être un tableau
    // - En format V2 (`!isLegacy`), `stores` doit obligatoirement être un tableau
    // - En format Legacy V1 (`isLegacy`), `stores` peut être omis (`undefined`) ou vide (`[]`) — il sera synthétisé plus bas.
    if (!Array.isArray(parsed.products)) {
      throw new Error(
        'Structure de sauvegarde invalide : la table essentielle "products" est manquante ou invalide.'
      );
    }
    if (!isLegacy && !Array.isArray(parsed.stores)) {
      throw new Error(
        'Structure de sauvegarde invalide : les tables essentielles (stores, products) sont manquantes ou invalides.'
      );
    }
    if (isLegacy && parsed.stores !== undefined && !Array.isArray(parsed.stores)) {
      throw new Error(
        'Structure de sauvegarde invalide : le champ "stores" doit être un tableau.'
      );
    }

    // Support de l'alias legacy `batches` -> `product_batches`
    if (!Array.isArray(parsed.product_batches) && Array.isArray(parsed.batches)) {
      parsed.product_batches = parsed.batches;
    }

    const nowIso = new Date().toISOString();
    const normalizedTables: Record<string, Record<string, any>[]> = {};

    for (const table of BACKUP_TABLES_TOPOLOGICAL_ORDER) {
      const rawTableData = parsed[table];
      if (rawTableData !== undefined && !Array.isArray(rawTableData)) {
        throw new Error(`Format invalide pour la table "${table}" : un tableau d'enregistrements est attendu.`);
      }
      const rows: any[] = Array.isArray(rawTableData) ? rawTableData : [];
      const pkCol = TABLE_REQUIRED_PRIMARY_KEY[table] || 'id';
      const allowedCols = TABLE_ALLOWED_COLUMNS[table];

      const cleanedRows: Record<string, any>[] = [];
      for (let i = 0; i < rows.length; i++) {
        const rawRow = rows[i];
        if (!rawRow || typeof rawRow !== 'object' || Array.isArray(rawRow)) {
          throw new Error(`Enregistrement invalide dans la table "${table}" à l'index ${i}.`);
        }

        const pkVal = rawRow[pkCol];
        if (pkVal === undefined || pkVal === null || String(pkVal).trim() === '') {
          throw new Error(
            `Champ clé primaire requis "${pkCol}" manquant dans la table "${table}" (enregistrement #${i + 1}).`
          );
        }

        const normalizedRow = normalizeLegacyRowForSchema(table, rawRow, nowIso);
        const cleaned: Record<string, any> = {};
        for (const [k, v] of Object.entries(normalizedRow)) {
          if (!allowedCols || allowedCols.has(k)) {
            if (v !== undefined && typeof v === 'object' && v !== null) {
              cleaned[k] = JSON.stringify(v);
            } else {
              cleaned[k] = v ?? null;
            }
          }
        }
        cleanedRows.push(cleaned);
      }

      normalizedTables[table] = cleanedRows;
    }

    // Gestion explicite des sauvegardes legacy V1 où `stores` était omis (`undefined`) ou vide (`[]`)
    if (isLegacy && normalizedTables.stores.length === 0) {
      normalizedTables.stores.push({
        id: 'store-alg-01',
        name_fr: 'Aquadro Pizzeria Gourmet',
        name_ar: 'بيتزا أكوادرو',
        wilaya: 'Alger',
        commune: 'Alger',
        address: 'Alger, Algérie',
        phone: '0550 00 00 00',
        email: null,
        rc_number: 'RC-0000',
        nif_number: 'NIF-0000',
        nis_number: 'NIS-0000',
        ai_number: 'AI-0000',
        fiscal_regime: 'IFU',
        default_tva_rate: 9.0,
        receipt_header: 'Bienvenue chez Aquadro POS',
        receipt_footer: 'Merci de votre visite !',
        currency: 'DZD',
        is_active: 1,
        created_at: nowIso,
        updated_at: nowIso
      });
    }

    if (normalizedTables.stores.length === 0) {
      throw new Error('La sauvegarde ne contient aucun magasin (table stores vide).');
    }

    const primaryStoreId = String(normalizedTables.stores[0].id);

    // Garantir que les utilisateurs et produits legacy sans store_id soient rattachés au magasin principal
    // uniquement si store_id est null/undefined/"". Si un store_id explicite invalide est fourni, la vérification FK le rejettera.
    for (const user of normalizedTables.users) {
      if (user.store_id === null || user.store_id === undefined || user.store_id === '') {
        user.store_id = primaryStoreId;
      }
      if (user.is_active === undefined || user.is_active === null) {
        user.is_active = 1;
      }
      if (!user.created_at) user.created_at = nowIso;
      if (!user.updated_at) user.updated_at = nowIso;
    }

    const hasOwnerAccount = normalizedTables.users.some(u => u.role === 'owner');
    if (!hasOwnerAccount) {
      throw new Error('La sauvegarde ne contient aucun compte Propriétaire (Owner).');
    }

    for (const product of normalizedTables.products) {
      if (product.store_id === null || product.store_id === undefined || product.store_id === '') {
        product.store_id = primaryStoreId;
      }
      if (typeof product.selling_price_ttc !== 'number' || Number.isNaN(product.selling_price_ttc)) {
        throw new Error(`Prix de vente invalide pour le produit "${String(product.id)}".`);
      }
      if (!product.name_fr || typeof product.name_fr !== 'string') {
        throw new Error(`Nom de produit (name_fr) manquant pour le produit "${String(product.id)}".`);
      }
      if (!product.name_ar || typeof product.name_ar !== 'string' || !product.name_ar.trim()) {
        product.name_ar = product.name_fr;
      }
      const stockNum = Number(product.current_stock ?? 0);
      if (Number.isNaN(stockNum) || stockNum < 0) {
        throw new Error(
          `Stock négatif ou invalide (${String(product.current_stock)}) pour le produit "${String(product.id)}".`
        );
      }
      product.current_stock = stockNum;
      if (!product.created_at) product.created_at = nowIso;
      if (!product.updated_at) product.updated_at = nowIso;
    }

    // Validation stricte du stock non-négatif (Gate 1C CHECK(current_stock >= 0.0)) sur product_batches, ingredients et pizza_supplements
    for (const batch of normalizedTables.product_batches) {
      const batchStock = Number(batch.current_stock ?? 0);
      if (Number.isNaN(batchStock) || batchStock < 0) {
        throw new Error(
          `Stock de lot négatif ou invalide (${String(batch.current_stock)}) pour le lot "${String(batch.id)}".`
        );
      }
      batch.current_stock = batchStock;
    }

    for (const ing of normalizedTables.ingredients) {
      const ingStock = Number(ing.current_stock ?? 0);
      if (Number.isNaN(ingStock) || ingStock < 0) {
        throw new Error(
          `Stock d'ingrédient négatif ou invalide (${String(ing.current_stock)}) pour "${String(ing.id)}".`
        );
      }
      ing.current_stock = ingStock;
    }

    for (const sup of normalizedTables.pizza_supplements) {
      const supStock = Number(sup.current_stock ?? 0);
      if (Number.isNaN(supStock) || supStock < 0) {
        throw new Error(
          `Stock de supplément négatif ou invalide (${String(sup.current_stock)}) pour "${String(sup.id)}".`
        );
      }
      sup.current_stock = supStock;
    }

    // Garantir les catégories structurelles de base si absentes de la sauvegarde
    const existingCatIds = new Set(normalizedTables.categories.map(c => String(c.id)));
    if (!existingCatIds.has('cat-pizza')) {
      normalizedTables.categories.push({
        id: 'cat-pizza',
        name_fr: 'Pizzas',
        name_ar: 'بيتزا',
        created_at: nowIso
      });
    }
    if (!existingCatIds.has('cat-drink')) {
      normalizedTables.categories.push({
        id: 'cat-drink',
        name_fr: 'Boissons',
        name_ar: 'مشروبات',
        created_at: nowIso
      });
    }

    // Garantir les séquences de documents de base si absentes
    const existingSeqTypes = new Set(normalizedTables.document_sequences.map(s => String(s.document_type)));
    const currentYear = new Date().getFullYear();
    for (const docType of ['TICKET', 'FACTURE', 'AVOIR', 'BON_LIVRAISON', 'COMMANDE']) {
      if (!existingSeqTypes.has(docType)) {
        normalizedTables.document_sequences.push({
          document_type: docType,
          current_year: currentYear,
          last_sequence_number: 0
        });
      }
    }

    // Validation stricte des relations de clés étrangères (obligatoires NOT NULL et optionnelles) dans les données à restaurer
    const pkSets: Record<string, Set<string>> = {};
    for (const table of BACKUP_TABLES_TOPOLOGICAL_ORDER) {
      const pkCol = TABLE_REQUIRED_PRIMARY_KEY[table] || 'id';
      pkSets[table] = new Set(normalizedTables[table].map(r => String(r[pkCol])));
    }

    for (const fk of BACKUP_FK_SPECS) {
      const childRows = normalizedTables[fk.childTable] || [];
      const parentSet = pkSets[fk.parentTable] || new Set<string>();

      for (const row of childRows) {
        const fkValue = row[fk.childCol];
        const isEmpty = fkValue === undefined || fkValue === null || String(fkValue).trim() === '';

        if (isEmpty) {
          if (fk.required) {
            throw new Error(
              `Intégrité référentielle invalide : le champ clé étrangère requis ${fk.childTable}.${fk.childCol} est manquant ou vide (enregistrement "${String(row.id || '')}").`
            );
          }
          // Normaliser "" vers null pour les clés étrangères optionnelles afin d'éviter une erreur FK SQLite
          row[fk.childCol] = null;
          continue;
        }

        if (!parentSet.has(String(fkValue))) {
          throw new Error(
            `Intégrité référentielle invalide : ${fk.childTable}.${fk.childCol}="${String(fkValue)}" fait référence à un enregistrement inexistant dans ${fk.parentTable}.${fk.parentCol}.`
          );
        }
      }
    }

    // Filtrage strict par allowlist des configurations applicatives :
    // Toute clé absente de l'allowlist est impérativement rejetée.
    // Toute donnée de licence (clé, statut, HWID) ou secret cryptographique est strictement exclu.
    const appSettings: BackupAppSettings = {};
    if (
      parsed._app_settings &&
      typeof parsed._app_settings === 'object' &&
      !Array.isArray(parsed._app_settings)
    ) {
      for (const [k, v] of Object.entries(parsed._app_settings)) {
        if (
          ALLOWED_EXPORT_SETTINGS_SET.has(k) &&
          !isDisallowedSecurityOrLicenseKey(k) &&
          typeof v === 'string' &&
          !isDisallowedLicenseOrSecretValue(v)
        ) {
          (appSettings as any)[k] = v;
        }
      }
    }

    return {
      schemaVersion,
      isLegacy,
      tables: normalizedTables,
      appSettings
    };
  }

  /**
   * Restauration atomique et sécurisée de la base depuis un fichier JSON.
   * - Protégée par le PIN Propriétaire (sauf lors de la restauration initiale sur une base vierge depuis SetupWizard avec `options.fromSetup = true`).
   * - Valide intégralement le JSON, le schéma et les clés étrangères AVANT d'ouvrir la transaction.
   * - En production Tauri, exécute toute la transaction destructive via la commande Rust `restore_json_backup_atomic` sur une connexion SQLite unique acquise.
   * - En environnement adaptateur/test SQLite direct, exécute la transaction sur la connexion unique de l'adaptateur.
   * - N'ignore JAMAIS une erreur d'insertion. En cas d'erreur, effectue un ROLLBACK complet pour préserver la base existante.
   * - Applique une politique stricte pour `_app_settings` (nettoie les clés portables absentes, préserve `aquadro_db_secret_key` et l'imprimante matérielle locale).
   */
  public async restoreBackup(
    jsonData: string,
    ownerPin?: string,
    options?: RestoreOptions
  ): Promise<boolean> {
    const fromSetup = Boolean(options?.fromSetup);
    const newOwnerPin = options?.newOwnerPin?.trim() || null;
    await db.ensureInitialized();

    // Vérifier si la base est véritablement vierge et non configurée (aucun magasin configuré, aucun utilisateur configuré, aucune vente, aucun produit)
    const existingStores = await db.select<{ id: string; name_fr?: string; name?: string }>(
      'SELECT * FROM stores LIMIT 1'
    );
    const existingUsers = await db.select<{ id: string; pin_hash?: string }>(
      'SELECT id, pin_hash FROM users LIMIT 5'
    );
    const existingSales = await db.select<{ id: string }>('SELECT id FROM sales LIMIT 1');
    const existingProducts = await db.select<{ id: string }>('SELECT id FROM products LIMIT 1');

    const configuredStores = existingStores.filter(s => !isPlaceholderSeedStore(s));
    const configuredUsers = existingUsers.filter(u => !isPlaceholderSeedUser(u));

    const isUnconfiguredAndEmpty =
      configuredStores.length === 0 &&
      configuredUsers.length === 0 &&
      existingSales.length === 0 &&
      existingProducts.length === 0;
    const isAlreadyConfigured = !isUnconfiguredAndEmpty;

    let authorizedUserId = 'system';
    let authorizedUserName = 'Système (Setup)';

    // Si on n'est pas dans le SetupWizard OU si la base n'est pas vierge/non-configurée, exiger le PIN Propriétaire
    if (!fromSetup || isAlreadyConfigured) {
      const pinCheck = await authService.verifyManagerOrOwnerPin(ownerPin || '');
      if (!pinCheck.valid || pinCheck.user?.role !== 'owner') {
        throw new Error('Action non autorisée : La restauration nécessite impérativement le code PIN du Propriétaire (Owner).');
      }
      authorizedUserId = pinCheck.user.id;
      authorizedUserName = pinCheck.user.name;
    }

    // Pré-validation du nouveau code PIN Propriétaire en premier-lancement
    if (fromSetup && !isAlreadyConfigured && newOwnerPin) {
      const pinValidation = PasswordPolicy.validateNewPin(newOwnerPin);
      if (!pinValidation.valid) {
        throw new Error(pinValidation.error || 'Nouveau code PIN Propriétaire non conforme.');
      }
    }

    // Étape 1 : Validation complète et normalisation AVANT toute modification de la base de données
    const validated = this.validateAndNormalizeBackup(jsonData);

    // Si un nouveau PIN Propriétaire est fourni lors de la restauration initiale,
    // hacher et mettre à jour l'utilisateur Propriétaire dans le jeu de données avant transaction
    if (fromSetup && !isAlreadyConfigured && newOwnerPin) {
      const hashedNewPin = await HashUtil.hashCredential(newOwnerPin);
      const ownerUser = validated.tables.users.find(u => u.role === 'owner');
      if (!ownerUser) {
        throw new Error('La sauvegarde restaurée ne contient aucun compte Propriétaire (Owner).');
      }
      ownerUser.pin_hash = hashedNewPin;
      ownerUser.is_active = 1;
      ownerUser.updated_at = new Date().toISOString();
    }

    // Capturer l'état localStorage précédent pour pouvoir le restaurer en cas d'échec
    // ou préserver l'identité locale matérielle et la licence du poste cible
    const previousLocalStorage: Record<string, string | null> = {};
    if (typeof localStorage !== 'undefined') {
      for (const key of [
        ...APP_SETTINGS_KEYS,
        ...EXCLUDED_SECRET_SETTINGS_KEYS,
        ...EXCLUDED_LICENSE_SETTINGS_KEYS
      ]) {
        previousLocalStorage[key] = localStorage.getItem(key);
      }
    }

    // Étape 2 : Transaction atomique SQLite
    if (this.isTauri) {
      // En production Tauri, exécuter la restauration atomique via une connexion SQLite unique côté Rust
      const { invoke } = await import('@tauri-apps/api/core');
      try {
        await invoke<boolean>('restore_json_backup_atomic', {
          tablesPayload: validated.tables,
          ownerPin: ownerPin || null,
          fromSetup: fromSetup && !isAlreadyConfigured,
          newOwnerPin: (fromSetup && !isAlreadyConfigured && newOwnerPin) ? newOwnerPin : null
        });
      } catch (tauriErr: any) {
        if (typeof localStorage !== 'undefined') {
          for (const [k, v] of Object.entries(previousLocalStorage)) {
            if (v === null) {
              localStorage.removeItem(k);
            } else {
              localStorage.setItem(k, v);
            }
          }
        }
        licenseService.clearCache();
        throw new Error(`Échec de restauration : ${tauriErr?.message || String(tauriErr)}`);
      }
    } else {
      await db.execute('PRAGMA foreign_keys = ON;');
      await db.execute('BEGIN IMMEDIATE;');

      try {
        // 2a. Vider les tables existantes dans l'ordre topologique inverse strict (enfants -> parents)
        const reverseTables = [...BACKUP_TABLES_TOPOLOGICAL_ORDER].reverse();
        for (const table of reverseTables) {
          if (table === 'roles' || table === 'permissions') {
            try {
              await db.execute(`DELETE FROM ${table}`);
            } catch {
              // Table optionnelle RBAC mémoire non présente dans le schéma SQLite
            }
          } else {
            await db.execute(`DELETE FROM ${table}`);
          }
        }

        // 2b. Insérer toutes les tables dans l'ordre topologique parent -> enfant sans jamais masquer les erreurs
        for (const table of BACKUP_TABLES_TOPOLOGICAL_ORDER) {
          const rows = validated.tables[table] || [];
          if (rows.length === 0) continue;

          for (const row of rows) {
            const cols = Object.keys(row);
            if (cols.length === 0) continue;

            const placeholders = cols.map(() => '?').join(', ');
            const values = cols.map(c => (row[c] !== undefined ? row[c] : null));

            if (table === 'roles' || table === 'permissions') {
              try {
                await db.execute(
                  `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`,
                  values
                );
              } catch (optErr: any) {
                const msg = String(optErr?.message || optErr || '');
                if (!msg.toLowerCase().includes('no such table')) {
                  throw optErr;
                }
              }
            } else {
              await db.execute(
                `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`,
                values
              );
            }
          }
        }

        // 2c. Vérifier la présence d'au moins un compte Propriétaire actif
        const activeOwners = await db.select<any>(
          "SELECT id FROM users WHERE role = 'owner' AND is_active = 1 LIMIT 1"
        );
        if (!activeOwners || activeOwners.length === 0) {
          throw new Error('La sauvegarde restaurée ne contient aucun compte Propriétaire (Owner) actif.');
        }

        // 2d. Vérifier l'intégrité référentielle SQLite avant de valider la transaction
        const fkViolations = await db.select<any>('PRAGMA foreign_key_check;');
        if (Array.isArray(fkViolations) && fkViolations.length > 0) {
          const first = fkViolations[0];
          throw new Error(
            `Violation de clé étrangère détectée après restauration sur la table "${String(first.table)}" (parent: "${String(first.parent)}").`
          );
        }

        await db.execute('COMMIT;');
      } catch (txError: any) {
        try {
          await db.execute('ROLLBACK;');
        } catch (rbErr) {
          console.error('[BackupService] Erreur lors du ROLLBACK:', rbErr);
        }
        if (typeof localStorage !== 'undefined') {
          for (const [k, v] of Object.entries(previousLocalStorage)) {
            if (v === null) {
              localStorage.removeItem(k);
            } else {
              localStorage.setItem(k, v);
            }
          }
        }
        licenseService.clearCache();
        throw new Error(`Échec de restauration : ${txError?.message || String(txError)}`);
      }
    }

    // Étape 3 : Appliquer la politique explicite pour les configurations applicatives hors-SQLite
    if (typeof localStorage !== 'undefined') {
      // 3a. Paramètres portables : appliquer si présents dans la sauvegarde, sinon supprimer les anciennes valeurs obsolètes
      for (const key of PORTABLE_APP_SETTINGS_KEYS) {
        if (isDisallowedSecurityOrLicenseKey(key)) continue;
        const val = validated.appSettings[key];
        if (typeof val === 'string' && !isDisallowedLicenseOrSecretValue(val)) {
          localStorage.setItem(key, val);
        } else {
          localStorage.removeItem(key);
        }
      }

      // 3b. Paramètres matériels liés au terminal (ex: imprimante sélectionnée) :
      // Ne pas écraser l'imprimante existante du poste cible sauf si aucune n'est définie ou si `overwriteDevicePrinter` est demandé
      const backupPrinter = validated.appSettings.aquadro_selected_printer;
      if (
        typeof backupPrinter === 'string' &&
        backupPrinter.trim() !== '' &&
        !isDisallowedLicenseOrSecretValue(backupPrinter)
      ) {
        const currentLocalPrinter = localStorage.getItem('aquadro_selected_printer');
        if (!currentLocalPrinter || options?.overwriteDevicePrinter === true) {
          localStorage.setItem('aquadro_selected_printer', backupPrinter);
        }
      }

      // 3c. RÈGLE CRUCIALE : PROTECTION INVIOLABLE DU STATUT DE LICENCE ET DE LA CLÉ LOCALE DU TERMINAL CIBLE
      // - Garantir que la clé secrète locale de la base (`aquadro_db_secret_key`) n'est jamais écrasée
      if (previousLocalStorage['aquadro_db_secret_key'] !== undefined) {
        if (previousLocalStorage['aquadro_db_secret_key'] === null) {
          localStorage.removeItem('aquadro_db_secret_key');
        } else {
          localStorage.setItem('aquadro_db_secret_key', previousLocalStorage['aquadro_db_secret_key']);
        }
      }

      // - Garantir que le statut de licence local du poste cible (aquadro_web_license_status et clés de licence)
      //   est scrupuleusement préservé dans son état d'origine exact :
      //   * Si le poste cible était non-licencié (ou sans licence), il RESTE non-licencié.
      //   * Si le poste cible avait une licence légitime valide (liée à son propre HWID), il la CONSERVE intacte.
      //   * Le HWID et l'identité de licence du poste cible ne sont JAMAIS remplacés.
      for (const licKey of EXCLUDED_LICENSE_SETTINGS_KEYS) {
        const prevVal = previousLocalStorage[licKey];
        if (prevVal !== undefined) {
          if (prevVal === null) {
            localStorage.removeItem(licKey);
          } else {
            localStorage.setItem(licKey, prevVal);
          }
        }
      }

      // 3d. Verrouiller l'état de configuration initiale pour ne jamais rouvrir SetupWizard après restauration
      localStorage.setItem('pizzeria_setup_completed', 'true');
      localStorage.setItem('aquadro_setup_completed', 'true');
    }

    db.markSetupVerifiedInMemory(true);

    // Invalider le cache mémoire de LicenseService pour forcer une réévaluation stricte du statut local
    licenseService.clearCache();

    // Journaliser l'opération dans audit_logs avec les colonnes réelles du schéma SQLite (si non déjà journalisé par Rust)
    if (!this.isTauri) {
      try {
        await db.execute(
          `INSERT INTO audit_logs (id, user_id, user_name, action, entity_type, entity_id, details, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            authorizedUserId,
            authorizedUserName,
            'DATABASE_RESTORED',
            'SYSTEM',
            'pizzeria_pos.db',
            JSON.stringify({
              restoredBy: authorizedUserName,
              fromSetup,
              schemaVersion: validated.schemaVersion,
              isLegacy: validated.isLegacy
            }),
            new Date().toISOString()
          ]
        );
      } catch { }
    }

    return true;
  }
}

export const backupService = BackupService.getInstance();

