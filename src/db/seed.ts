// Aquadro POS Algérie — Base Vierge Prête Pour La Production
// Aucune donnée factice ou par défaut : l'utilisateur entre tout lui-même

export const SEED_STORE = {
  id: 'store-001',
  name: 'Aquadro Pizzeria Gourmet',
  code: 'AQUADRO-01',
  address: '',
  phone: '',
  email: '',
  tax_number: '',
  receipt_header: 'AQUADRO\nPIZZERIA GOURMET',
  receipt_footer: 'MERCI DE VOTRE VISITE',
  currency: 'DZD',
  tax_rate: 0.0,
  is_active: 1,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};

export const SEED_ROLES = [
  { id: 'role-owner', name: 'owner', description: 'Propriétaire du magasin (accès total)', created_at: new Date().toISOString() },
  { id: 'role-admin', name: 'admin', description: 'Administrateur système et catalogue', created_at: new Date().toISOString() },
  { id: 'role-manager', name: 'manager', description: 'Responsable de magasin (remises, retours, clôture)', created_at: new Date().toISOString() },
  { id: 'role-cashier', name: 'cashier', description: 'Caissier (encaissement, scan codes-barres)', created_at: new Date().toISOString() }
];

export const SEED_PERMISSIONS = [
  { id: 'p1', code: 'pos.checkout', description: 'Encaissement des ventes et règlement', category: 'POS' },
  { id: 'p2', code: 'pos.hold_resume', description: 'Mise en attente et reprise de panier', category: 'POS' },
  { id: 'p3', code: 'pos.apply_discount', description: 'Application de remises exceptionnelles', category: 'POS' },
  { id: 'p4', code: 'pos.void_sale', description: 'Annulation d\'une vente en cours', category: 'POS' },
  { id: 'p5', code: 'sales.view', description: 'Consultation de l\'historique des ventes', category: 'Sales' },
  { id: 'p6', code: 'sales.refund', description: 'Traitement des remboursements et retours', category: 'Sales' },
  { id: 'p7', code: 'inventory.view', description: 'Consultation des stocks', category: 'Inventory' },
  { id: 'p8', code: 'inventory.adjust', description: 'Ajustement de stock (avarié, périmé, inventaire)', category: 'Inventory' },
  { id: 'p9', code: 'products.view_cost', description: 'Consultation des prix d\'achat et marges', category: 'Products' },
  { id: 'p10', code: 'products.manage', description: 'Gestion du catalogue produits', category: 'Products' },
  { id: 'p11', code: 'purchases.manage', description: 'Bons de commande et réception fournisseurs', category: 'Purchases' },
  { id: 'p12', code: 'reports.view', description: 'Rapports financiers, marges et clôture Z', category: 'Reports' },
  { id: 'p13', code: 'users.manage', description: 'Gestion des employés et des codes PIN', category: 'Users' },
  { id: 'p14', code: 'settings.manage', description: 'Configuration imprimante ticket et TVA', category: 'Settings' },
  { id: 'p15', code: 'ai.assistant', description: 'Utilisation du copilote IA', category: 'AI' }
];

// Seul compte Admin pour la première connexion (Code PIN par défaut: 1234)
export const SEED_USERS = [
  {
    id: 'user-001',
    store_id: 'store-001',
    role_id: 'role-owner',
    role: 'owner' as const,
    name: 'Admin',
    email: 'admin@aquadro.dz',
    pin_hash: 'a1b2c3d4e5f60718:8f258a12e34567890abcdef1234567890abcdef1234567890abcdef123456789',
    phone: '',
    is_active: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
];

// Zéro données par défaut — l'utilisateur saisit l'intégralité de son catalogue et ses partenaires
export const SEED_CATEGORIES: any[] = [];
export const SEED_BRANDS: any[] = [];
export const SEED_SUPPLIERS: any[] = [];
export const SEED_PRODUCTS: any[] = [];
export const SEED_CUSTOMERS: any[] = [];
export const SEED_BATCHES: any[] = [];
