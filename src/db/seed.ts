// Pizzeria POS Algérie — Structure Initiale Vierge (Production Factory State)
// Aucune donnée factice : le propriétaire configure sa pizzeria lors du premier démarrage.

export const SEED_STORE = null;

export const SEED_ROLES = [
  { id: "role-owner", name: "owner", description: "Propriétaire / Gérant (accès total)", created_at: new Date().toISOString() },
  { id: "role-admin", name: "admin", description: "Administrateur système et catalogue", created_at: new Date().toISOString() },
  { id: "role-manager", name: "manager", description: "Responsable de salle / Caissier en chef", created_at: new Date().toISOString() },
  { id: "role-cashier", name: "cashier", description: "Caissier / Serveur (prise de commande)", created_at: new Date().toISOString() }
];

export const SEED_PERMISSIONS = [
  { id: "p1", code: "pos.checkout", description: "Encaissement des commandes et règlement", category: "POS" },
  { id: "p2", code: "pos.hold_resume", description: "Mise en attente et reprise de commande", category: "POS" },
  { id: "p3", code: "pos.apply_discount", description: "Application de remises exceptionnelles", category: "POS" },
  { id: "p4", code: "pos.void_sale", description: "Annulation d une commande en cours", category: "POS" },
  { id: "p5", code: "sales.view", description: "Consultation de l historique des commandes", category: "Sales" },
  { id: "p6", code: "sales.refund", description: "Traitement des remboursements et retours", category: "Sales" },
  { id: "p7", code: "inventory.view", description: "Consultation des stocks", category: "Inventory" },
  { id: "p8", code: "inventory.adjust", description: "Ajustement de stock", category: "Inventory" },
  { id: "p9", code: "products.view_cost", description: "Consultation des prix d achat", category: "Products" },
  { id: "p10", code: "products.manage", description: "Gestion de la carte et des pizzas", category: "Products" },
  { id: "p11", code: "reports.view", description: "Rapports des ventes et clôture Z", category: "Reports" },
  { id: "p12", code: "users.manage", description: "Gestion du personnel et codes PIN", category: "Users" },
  { id: "p13", code: "settings.manage", description: "Configuration pizzeria et imprimante", category: "Settings" },
  { id: "p14", code: "ai.assistant", description: "Assistant pizzeria", category: "AI" }
];

export const SEED_USERS: any[] = [];

export const SEED_CATEGORIES = [
  { id: "cat-pizza", name_fr: "Pizzas", name_ar: "بيتزا", created_at: new Date().toISOString() },
  { id: "cat-drink", name_fr: "Boissons", name_ar: "مشروبات", created_at: new Date().toISOString() }
];

export const SEED_BRANDS: any[] = [];
export const SEED_SUPPLIERS: any[] = [];
export const SEED_PRODUCTS: any[] = [];
export const SEED_CUSTOMERS: any[] = [];
export const SEED_BATCHES: any[] = [];
