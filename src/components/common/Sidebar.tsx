// Pizzeria POS Algérie — Barre Latérale Navigation Complète ERP & Restauration
// Architecture complète : Caisse Pizzeria, Gestion du Magasin, Stocks Ingrédients, Clôture Z et Paramètres

import React from "react";
import {
  UtensilsCrossed,
  LayoutDashboard,
  Package,
  CookingPot,
  Receipt,
  Users,
  CreditCard,
  Vault,
  Wallet,
  History,
  BarChart3,
  FileText,
  UserCog,
  Settings
} from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { useI18n } from "../../i18n";

export type NavView =
  | "pos"
  | "dashboard"
  | "products"
  | "inventory"
  | "sales"
  | "customers"
  | "caisse"
  | "credits"
  | "expenses"
  | "reports"
  | "documents"
  | "journal"
  | "users"
  | "settings";

interface SidebarProps {
  currentView: NavView;
  onNavigate: (view: NavView) => void;
}

const SidebarComponent: React.FC<SidebarProps> = ({ currentView, onNavigate }) => {
  const { hasPermission } = useAuth();
  const { t } = useI18n();

  const navItems: Array<{
    id: NavView;
    label: string;
    icon: React.ReactNode;
    permission?: string;
    shortcut?: string;
  }> = [
    { id: "pos", label: "Caisse Pizzeria", icon: <UtensilsCrossed className="w-4 h-4" />, shortcut: "F1" },
    { id: "dashboard", label: t("nav.dashboard", "Tableau de bord"), icon: <LayoutDashboard className="w-4 h-4" />, shortcut: "F2" },
    { id: "products", label: "Pizzas & Boissons", icon: <Package className="w-4 h-4" />, shortcut: "F3" },
    { id: "inventory", label: "Ingrédients & Recettes", icon: <CookingPot className="w-4 h-4" />, shortcut: "F4" },
    { id: "sales", label: t("nav.sales", "Commandes & Ventes"), icon: <Receipt className="w-4 h-4" />, shortcut: "F5" },
    { id: "customers", label: t("nav.customers", "Clients & Fidélité"), icon: <Users className="w-4 h-4" />, shortcut: "F6" },
    { id: "credits", label: "Gestion des Crédits", icon: <CreditCard className="w-4 h-4" />, shortcut: "F7" },
    { id: "caisse", label: t("nav.caisse", "Session de Caisse"), icon: <Vault className="w-4 h-4" />, shortcut: "F8" },
    { id: "expenses", label: t("nav.expenses", "Dépenses & Charges"), icon: <Wallet className="w-4 h-4" />, shortcut: "F9" },
    { id: "journal", label: "Journal d Activité", icon: <History className="w-4 h-4" />, shortcut: "F10" },
    { id: "reports", label: t("nav.reports", "Rapports & Stats"), icon: <BarChart3 className="w-4 h-4" />, permission: "reports.view", shortcut: "F11" },
    { id: "documents", label: t("nav.documents", "Factures & Bons"), icon: <FileText className="w-4 h-4" />, shortcut: "F12" },
    { id: "users", label: t("nav.users", "Personnel & Rôles"), icon: <UserCog className="w-4 h-4" />, permission: "users.manage" },
    { id: "settings", label: t("nav.settings", "Paramètres"), icon: <Settings className="w-4 h-4" /> }
  ];

  return (
    <aside className="w-56 bg-white border-r border-[#E9DCCB] flex flex-col justify-between py-2 px-1.5 select-none z-20 shrink-0 text-[#292522] text-xs shadow-sm">
      <div className="flex-1 overflow-y-auto space-y-0.5 pr-0.5">
        <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-stone-500 border-b border-[#E9DCCB]/60 mb-1 flex items-center justify-between">
          <span>Gestion Pizzeria</span>
          <span className="text-[9px] bg-amber-100 text-[#E87524] px-1 py-0.2 rounded font-mono font-bold">ERP</span>
        </div>
        {navItems.map(item => {
          if (item.permission && !hasPermission(item.permission)) {
            return null;
          }

          const isActive = currentView === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-left transition-all font-medium ${
                isActive
                  ? "bg-[#FFF3EB] text-[#E87524] font-bold border-l-4 border-[#E87524] shadow-xs"
                  : "hover:bg-[#FFF8EF] text-[#292522] hover:text-[#E87524]"
              }`}
            >
              <div className="flex items-center space-x-2">
                <span className={isActive ? "text-[#E87524]" : "text-stone-500"}>{item.icon}</span>
                <span className="truncate text-xs">{item.label}</span>
              </div>
              {item.shortcut && (
                <span className={`text-[10px] font-mono px-1 py-0.2 rounded border ${
                  isActive
                    ? "bg-[#E87524]/10 text-[#E87524] border-[#E87524]/20"
                    : "bg-[#FFF8EF] text-stone-500 border-[#E9DCCB]"
                }`}>
                  {item.shortcut}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Pied de barre latérale Pizzeria */}
      <div className="pt-2 border-t border-[#E9DCCB] px-2 text-[10px] text-stone-500 flex items-center justify-between font-mono bg-[#FFF8EF]/50 p-1.5 rounded mt-1">
        <span className="font-bold text-[#E87524]">PIZZERIA POS</span>
        <span className="text-emerald-700 font-bold flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
          SQLITE OK
        </span>
      </div>
    </aside>
  );
};

export const Sidebar = React.memo(SidebarComponent);
