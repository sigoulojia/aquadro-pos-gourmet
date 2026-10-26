// Pizzeria POS Algérie — Barre Latérale Navigation Complète ERP & Restauration
// Architecture selon les rôles :
// - Caissier : Accès restreint uniquement à la Caisse (Vente), Tableau de bord, Historique des Ventes, et Besoins du Magasin.
// - Propriétaire (Owner) : Contrôle total sur l'ensemble de l'ERP.
// Logo dynamique synchronisé en temps réel avec le logo configuré par le propriétaire.

import React, { useState, useEffect } from "react";
import {
  UtensilsCrossed,
  LayoutDashboard,
  Pizza,
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
  Settings,
  ClipboardList
} from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { useI18n } from "../../i18n";
import { storeNeedsService } from "../../services/storeNeeds.service";
import { db } from "../../db/sqlite";
import { APP_VERSION } from "../../constants/app";

export type NavView =
  | "pos"
  | "dashboard"
  | "needs"
  | "sales"
  | "products"
  | "inventory"
  | "customers"
  | "caisse"
  | "credits"
  | "expenses"
  | "reports"
  | "journal"
  | "users"
  | "settings";

interface SidebarProps {
  currentView: NavView;
  onNavigate: (view: NavView) => void;
}

const SidebarComponent: React.FC<SidebarProps> = ({ currentView, onNavigate }) => {
  const { user, hasPermission } = useAuth();
  const { t } = useI18n();

  const [storeLogo, setStoreLogo] = useState<string | null>(() => {
    return localStorage.getItem('aquadro_store_logo') || localStorage.getItem('pizzeria_store_logo');
  });
  const [storeName, setStoreName] = useState<string>("Pizzeria");
  const [pendingNeedsCount, setPendingNeedsCount] = useState<number>(0);
  const logoInputRef = React.useRef<HTMLInputElement>(null);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        const base64 = reader.result;
        setStoreLogo(base64);
        localStorage.setItem('aquadro_store_logo', base64);
        localStorage.setItem('pizzeria_store_logo', base64);
        window.dispatchEvent(new Event('store_logo_updated'));
      }
    };
    reader.readAsDataURL(file);
  };

  // Synchronisation dynamique du logo en temps réel
  useEffect(() => {
    const handleLogoUpdate = () => {
      const logo = localStorage.getItem('aquadro_store_logo') || localStorage.getItem('pizzeria_store_logo');
      setStoreLogo(logo);
    };
    window.addEventListener('storage', handleLogoUpdate);
    window.addEventListener('store_logo_updated', handleLogoUpdate);
    return () => {
      window.removeEventListener('storage', handleLogoUpdate);
      window.removeEventListener('store_logo_updated', handleLogoUpdate);
    };
  }, []);

  // Nom du magasin
  useEffect(() => {
    db.select<{ name_fr?: string; name?: string }>("SELECT name_fr, name FROM stores LIMIT 1")
      .then(res => {
        if (res && res.length > 0) {
          setStoreName(res[0].name_fr || res[0].name || "Pizzeria");
        }
      })
      .catch(() => {});
  }, []);

  // Compteur des besoins en attente
  useEffect(() => {
    const refreshNeeds = () => {
      storeNeedsService.getPendingCount().then(setPendingNeedsCount).catch(() => {});
    };
    refreshNeeds();
    window.addEventListener('store_needs_updated', refreshNeeds);
    return () => window.removeEventListener('store_needs_updated', refreshNeeds);
  }, []);

  const isCashier = user?.role === 'cashier';

  // Liste complète des modules
  const allNavItems: Array<{
    id: NavView;
    label: string;
    icon: React.ReactNode;
    permission?: string;
    shortcut?: string;
    cashierAllowed?: boolean;
    badge?: number;
  }> = [
    { id: "pos", label: "Caisse Pizzeria", icon: <UtensilsCrossed className="w-5 h-5" />, shortcut: "F1", cashierAllowed: true },
    { id: "dashboard", label: t("nav.dashboard", "Tableau de bord"), icon: <LayoutDashboard className="w-5 h-5" />, shortcut: "F2", cashierAllowed: false },
    { id: "sales", label: t("nav.sales", "Historique Ventes"), icon: <Receipt className="w-5 h-5" />, shortcut: "F5", cashierAllowed: true },
    { id: "needs", label: "Besoins du Magasin", icon: <ClipboardList className="w-5 h-5" />, shortcut: "F6", cashierAllowed: true, badge: pendingNeedsCount },
    { id: "products", label: "Pizzas & Boissons", icon: <Pizza className="w-5 h-5" />, shortcut: "F3", cashierAllowed: false },
    { id: "inventory", label: "Ingrédients & Recettes", icon: <CookingPot className="w-5 h-5" />, shortcut: "F4", cashierAllowed: false },
    { id: "customers", label: t("nav.customers", "Clients & Fidélité"), icon: <Users className="w-5 h-5" />, cashierAllowed: false },
    { id: "credits", label: "Règlements & Paiements", icon: <CreditCard className="w-5 h-5" />, shortcut: "F7", cashierAllowed: false },
    { id: "caisse", label: t("nav.caisse", "Session de Caisse"), icon: <Vault className="w-5 h-5" />, shortcut: "F8", cashierAllowed: false },
    { id: "expenses", label: t("nav.expenses", "Dépenses & Charges"), icon: <Wallet className="w-5 h-5" />, shortcut: "F9", cashierAllowed: false },
    { id: "journal", label: "Journal d Activité", icon: <History className="w-5 h-5" />, shortcut: "F10", cashierAllowed: false },
    { id: "reports", label: t("nav.reports", "Rapports & Stats"), icon: <BarChart3 className="w-5 h-5" />, permission: "reports.view", shortcut: "F11", cashierAllowed: false },
    { id: "users", label: t("nav.users", "Personnel & Rôles"), icon: <UserCog className="w-5 h-5" />, permission: "users.manage", cashierAllowed: false },
    { id: "settings", label: t("nav.settings", "Paramètres"), icon: <Settings className="w-5 h-5" />, cashierAllowed: false }
  ];

  // Si l'utilisateur est Caissier : il ne voit STRICTEMENT QUE ses 4 modules autorisés
  const visibleNavItems = allNavItems.filter(item => {
    if (isCashier) {
      return item.cashierAllowed === true;
    }
    if (item.permission && !hasPermission(item.permission)) {
      return false;
    }
    return true;
  });

  return (
    <aside className="w-60 lg:w-64 bg-white border-r border-stone-200 flex flex-col justify-between py-2.5 px-2 select-none z-20 shrink-0 text-stone-800 text-xs shadow-xs">
      <div className="flex-1 overflow-y-auto space-y-1 pr-0.5 scrollbar-thin">
        {/* En-tête avec LOGO RÉEL DU MAGASIN et Rôle Utilisateur */}
        <div className="px-3 py-2.5 text-xs font-black text-stone-800 border-b border-stone-200 mb-2 flex items-center gap-2.5 bg-stone-50 rounded-xl">
          <input
            type="file"
            ref={logoInputRef}
            onChange={handleLogoUpload}
            accept="image/*"
            className="hidden"
          />
          <div
            onClick={() => {
              if (!isCashier) {
                logoInputRef.current?.click();
              }
            }}
            className={`w-9 h-9 rounded-xl bg-white border border-stone-200 overflow-hidden flex items-center justify-center shrink-0 shadow-2xs relative group ${
              !isCashier ? 'cursor-pointer hover:border-[#E87524]' : ''
            }`}
            title={!isCashier ? "Cliquer pour changer le logo du magasin (انقر لتغيير لوغو المحل)" : undefined}
          >
            <img
              src={storeLogo || "/pizzeria-logo.jpg"}
              alt="Logo Pizzeria"
              className="w-full h-full object-contain p-0.5"
            />
            {!isCashier && (
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-[8px] text-white font-bold text-center">
                تغيير
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <span className="font-black text-xs text-stone-900 block truncate">
              {storeName}
            </span>
            <span className={`text-[10px] font-bold block ${isCashier ? "text-[#E87524]" : "text-emerald-700"}`}>
              {isCashier ? "Caisse Comptoir" : "Propriétaire (Admin)"}
            </span>
          </div>
        </div>

        {/* Éléments de Navigation */}
        {visibleNavItems.map(item => {
          const isActive = currentView === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`w-full group flex items-center justify-between px-2.5 py-2 rounded-xl text-left transition-all duration-150 cursor-pointer ${
                isActive
                  ? "bg-orange-50 text-[#E87524] font-bold shadow-xs ring-1 ring-[#E87524]/20"
                  : "hover:bg-stone-50 text-stone-700 hover:text-[#E87524]"
              }`}
            >
              <div className="flex items-center space-x-2.5 min-w-0">
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all ${
                    isActive
                      ? "bg-[#E87524] text-white shadow-sm shadow-orange-500/30 scale-102"
                      : "bg-stone-50 text-stone-600 border border-stone-200 group-hover:bg-orange-50 group-hover:text-[#E87524] group-hover:border-[#E87524]/30"
                  }`}
                >
                  {item.icon}
                </div>
                <span className="truncate text-xs">{item.label}</span>
              </div>

              <div className="flex items-center gap-1.5">
                {/* Badge notification pour les besoins en attente */}
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="bg-red-500 text-white text-[10px] font-black px-1.5 py-0.2 rounded-full font-mono">
                    {item.badge}
                  </span>
                )}

                {item.shortcut && (
                  <span
                    className={`hidden sm:inline-block text-[10px] font-mono px-1.5 py-0.5 rounded transition-colors ${
                      isActive
                        ? "bg-[#E87524]/20 text-[#E87524] font-bold"
                        : "text-stone-400 group-hover:text-stone-600 bg-stone-100"
                    }`}
                  >
                    {item.shortcut}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Pied de la Barre Latérale */}
      <div className="pt-2 border-t border-stone-200 px-1 space-y-1">
        <div className="flex items-center justify-between px-2 py-1 text-[11px] text-stone-500 bg-stone-50 rounded-lg">
          <span className="truncate">{user?.name || "Employé"}</span>
          <span className="font-bold text-[10px] text-stone-600 font-mono">
            {isCashier ? "CAISSIER" : "OWNER"}
          </span>
        </div>
        <div className="flex items-center justify-between px-2 text-[10px] text-stone-400 font-mono">
          <span>Aquadro POS</span>
          <span className="font-semibold text-stone-500">v{APP_VERSION}</span>
        </div>
      </div>
    </aside>
  );
};

export const Sidebar = React.memo(SidebarComponent);
