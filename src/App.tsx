// Pizzeria POS Algérie — Application Principale Desktop & Caisse Pizzeria
// Intégration complète : Assistant Setup, Écran Caisse Pizzas & Boissons, Gestion ERP Complète (Stocks, Achats, Caisse, Dépenses, Journal, Rapports)

import React, { useState, useEffect } from "react";
import { I18nProvider } from "./i18n";
import { ToastProvider } from "./components/common/Toast";
import { Navbar } from "./components/common/Navbar";
import { Sidebar, NavView } from "./components/common/Sidebar";
import { PosView } from "./components/pos/PosView";
// Optimisation mémoire & CPU (Lazy loading pour i5 3e Gen & RAM modeste)
const DashboardView = React.lazy(() => import("./components/dashboard/DashboardView").then(m => ({ default: m.DashboardView })));
const ProductsView = React.lazy(() => import("./components/products/ProductsView").then(m => ({ default: m.ProductsView })));
const InventoryView = React.lazy(() => import("./components/inventory/InventoryView").then(m => ({ default: m.InventoryView })));
const SalesView = React.lazy(() => import("./components/sales/SalesView").then(m => ({ default: m.SalesView })));
const CustomersView = React.lazy(() => import("./components/customers/CustomersView").then(m => ({ default: m.CustomersView })));
const CaisseView = React.lazy(() => import("./components/caisse/CaisseView").then(m => ({ default: m.CaisseView })));
const ExpensesView = React.lazy(() => import("./components/expenses/ExpensesView").then(m => ({ default: m.ExpensesView })));
const ReportsView = React.lazy(() => import("./components/reports/ReportsView").then(m => ({ default: m.ReportsView })));
const JournalView = React.lazy(() => import("./components/journal/JournalView").then(m => ({ default: m.JournalView })));
const CreditsView = React.lazy(() => import("./components/credits/CreditsView").then(m => ({ default: m.CreditsView })));
const UsersView = React.lazy(() => import("./components/users/UsersView").then(m => ({ default: m.UsersView })));
const SettingsView = React.lazy(() => import("./components/settings/SettingsView").then(m => ({ default: m.SettingsView })));
const SetupWizard = React.lazy(() => import("./components/setup/SetupWizard").then(m => ({ default: m.SetupWizard })));
const AIAssistantDrawer = React.lazy(() => import("./components/ai/AIAssistantDrawer").then(m => ({ default: m.AIAssistantDrawer })));
const StoreNeedsView = React.lazy(() => import("./components/needs/StoreNeedsView").then(m => ({ default: m.StoreNeedsView })));
import { LoginView } from "./components/auth/LoginView";
import { authService } from "./services/auth.service";
import { User } from "./types/database";
import { SplashScreen } from "./components/splash/SplashScreen";
import { UpdateNotificationModal } from "./components/common/UpdateNotificationModal";
import { updateService } from "./services/update.service";
import { logger } from "./services/logger.service";
import { LicenseActivationModal } from "./components/license/LicenseActivationModal";
import { licenseService, LicenseStatusResponse } from "./services/license.service";
import { db } from "./db/sqlite";

export const AppContent: React.FC = () => {
  const [currentView, setCurrentView] = useState<NavView>("pos");
  const [isAIOpen, setIsAIOpen] = useState<boolean>(false);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [showSetup, setShowSetup] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [licenseStatus, setLicenseStatus] = useState<LicenseStatusResponse | null>(null);
  const [showLicenseModal, setShowLicenseModal] = useState<boolean>(false);

  // Vérification de la licence matérielle au démarrage (Aegis License Shield)
  useEffect(() => {
    licenseService.getStatus(true).then((status) => {
      setLicenseStatus(status);
      if (!status.is_licensed && !status.is_trial_active) {
        setShowLicenseModal(true);
      }
    }).catch((err) => {
      console.error("[License] Erreur vérification licence:", err);
    });

    const handleOpen = () => setShowLicenseModal(true);
    const handleUpdate = (e?: any) => {
      if (e?.detail) {
        setLicenseStatus(e.detail);
        if (e.detail.is_licensed) {
          setShowLicenseModal(false);
        }
      }
    };
    window.addEventListener('open_license_modal', handleOpen);
    window.addEventListener('license_status_updated', handleUpdate);
    return () => {
      window.removeEventListener('open_license_modal', handleOpen);
      window.removeEventListener('license_status_updated', handleUpdate);
    };
  }, []);

  useEffect(() => {
    const unsubscribe = authService.subscribe((user) => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  // Sécurité RBAC : Le caissier ne peut accéder qu'à la caisse, tableau de bord, historique ventes et besoins magasin
  useEffect(() => {
    if (currentUser?.role === "cashier") {
      const allowedViews: NavView[] = ["pos", "dashboard", "sales", "needs"];
      if (!allowedViews.includes(currentView)) {
        setCurrentView("pos");
      }
    }
  }, [currentUser, currentView]);

  const handleAppReady = async () => {
    try {
      const completed = await db.isSetupCompleted();
      if (!completed) {
        setShowSetup(true);
      } else {
        setShowSetup(false);
      }
    } catch {
      const completedFallback =
        localStorage.getItem("pizzeria_setup_completed") ||
        localStorage.getItem("aquadro_setup_completed");
      if (!completedFallback) {
        setShowSetup(true);
      }
    }
    setIsInitializing(false);
    logger.info("APPLICATION", "Pizzeria POS prêt et actif");

    // Non-blocking silent background update check & auto-installation
    updateService.checkAndAutoUpdate().catch((err) => {
      logger.warn("UPDATER", `Vérification mise à jour automatique en arrière-plan: ${err}`);
    });
  };

  // Mise à jour automatique périodique en arrière-plan toutes les 3 heures
  useEffect(() => {
    const updateInterval = setInterval(() => {
      updateService.checkAndAutoUpdate().catch(() => {});
    }, 3 * 60 * 60 * 1000);
    return () => clearInterval(updateInterval);
  }, []);

  // Raccourcis clavier globaux POS et Navigation ERP F1-F12
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCashier = currentUser?.role === "cashier";
      const fKeyMap: Record<string, NavView> = {
        "F1": "pos",
        "F2": "dashboard",
        "F3": "products",
        "F4": "inventory",
        "F5": "sales",
        "F6": "needs",
        "F7": "credits",
        "F8": "caisse",
        "F9": "expenses",
        "F10": "journal",
        "F11": "reports"
      };

      if (fKeyMap[e.key]) {
        // Bloquer les raccourcis non autorisés pour le caissier (Strictement Caisse F1, Ventes F5, Besoins F6)
        if (isCashier && !["pos", "sales", "needs"].includes(fKeyMap[e.key])) {
          return;
        }
        e.preventDefault();
        setCurrentView(fKeyMap[e.key]);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentUser]);

  // Sécurité et Confidentialité Propriétaire : Bloquer strictement le caissier de toute vue privée ou IA
  useEffect(() => {
    if (currentUser?.role === "cashier") {
      if (isAIOpen) {
        setIsAIOpen(false);
      }
      if (!["pos", "sales", "needs"].includes(currentView)) {
        setCurrentView("pos");
      }
    }
  }, [currentUser, currentView, isAIOpen]);

  if (isInitializing) {
    return <SplashScreen onReady={handleAppReady} />;
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-[#F7F8FA] text-[#292522] overflow-hidden font-sans">
      {/* Assistant de premier démarrage (si non complété) */}
      {showSetup && (
        <React.Suspense fallback={null}>
          <SetupWizard
            onComplete={() => {
              localStorage.setItem("pizzeria_setup_completed", "true");
              localStorage.setItem("aquadro_setup_completed", "true");
              setShowSetup(false);
            }}
          />
        </React.Suspense>
      )}

      {/* Barrière de Sécurité et Verrouillage Matériel de Licence */}
      <LicenseActivationModal
        isOpen={showLicenseModal || (licenseStatus !== null && !licenseStatus.is_licensed && licenseStatus.is_trial_expired)}
        canClose={licenseStatus?.is_trial_active || licenseStatus?.is_licensed || false}
        onClose={() => {
          if (licenseStatus?.is_trial_active || licenseStatus?.is_licensed) {
            setShowLicenseModal(false);
          }
        }}
        onActivated={(status) => {
          setLicenseStatus(status);
          setShowLicenseModal(false);
        }}
      />

      {!currentUser ? (
        <LoginView />
      ) : (
        <>
          {/* Barre Supérieure Topbar Pizzeria */}
          <Navbar
            onToggleAI={() => setIsAIOpen(!isAIOpen)}
            isAIOpen={isAIOpen}
            onNavigateToSettings={() => setCurrentView("settings")}
            onNavigate={(view) => setCurrentView(view)}
          />

          {/* Zone Centrale : Navigation Latérale Complète + Vue Active */}
          <div className="flex-1 flex overflow-hidden">
            <Sidebar
              currentView={currentView}
              onNavigate={(view) => setCurrentView(view)}
            />

            <main className="flex-1 flex overflow-hidden bg-[#F7F8FA]">
              {currentView === "pos" ? (
                <PosView />
              ) : (
                <React.Suspense fallback={<div className="flex-1 flex items-center justify-center text-xs text-stone-500 font-medium">Chargement du module...</div>}>
                  {currentView === "dashboard" && (
                    <DashboardView
                      onNavigateToPOS={() => setCurrentView("pos")}
                      onNavigateToInventory={() => setCurrentView("inventory")}
                    />
                  )}
                  {currentView === "needs" && <StoreNeedsView />}
                  {currentView === "products" && <ProductsView />}
                  {currentView === "inventory" && <InventoryView />}
                  {currentView === "sales" && <SalesView />}
                  {currentView === "customers" && <CustomersView />}
                  {currentView === "caisse" && <CaisseView />}
                  {currentView === "expenses" && <ExpensesView />}
                  {currentView === "reports" && <ReportsView />}
                  {currentView === "credits" && <CreditsView />}
                  {currentView === "journal" && <JournalView />}
                  {currentView === "users" && <UsersView />}
                  {currentView === "settings" && <SettingsView />}
                </React.Suspense>
              )}
            </main>
          </div>

          {/* Tiroir Assistant IA Copilote */}
          <React.Suspense fallback={null}>
            <AIAssistantDrawer
              isOpen={isAIOpen}
              onClose={() => setIsAIOpen(false)}
            />
          </React.Suspense>

          {/* Modal de Mise à jour Automatique */}
          <UpdateNotificationModal />
        </>
      )}
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <I18nProvider>
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </I18nProvider>
  );
};

export default App;
