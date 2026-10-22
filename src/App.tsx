// Pizzeria POS Algérie — Application Principale Desktop & Caisse Pizzeria
// Intégration complète : Assistant Setup, Écran Caisse Pizzas & Boissons, Gestion ERP Complète (Stocks, Achats, Caisse, Dépenses, Journal, Rapports)

import React, { useState, useEffect } from "react";
import { I18nProvider } from "./i18n";
import { ToastProvider } from "./components/common/Toast";
import { Navbar } from "./components/common/Navbar";
import { Sidebar, NavView } from "./components/common/Sidebar";
import { PosView } from "./components/pos/PosView";
import { DashboardView } from "./components/dashboard/DashboardView";
import { ProductsView } from "./components/products/ProductsView";
import { InventoryView } from "./components/inventory/InventoryView";
import { SalesView } from "./components/sales/SalesView";
import { CustomersView } from "./components/customers/CustomersView";
import { CaisseView } from "./components/caisse/CaisseView";
import { ExpensesView } from "./components/expenses/ExpensesView";
import { ReportsView } from "./components/reports/ReportsView";
import { DocumentsView } from "./components/documents/DocumentsView";
import { JournalView } from "./components/journal/JournalView";
import { CreditsView } from "./components/credits/CreditsView";
import { UsersView } from "./components/users/UsersView";
import { SettingsView } from "./components/settings/SettingsView";
import { AIAssistantDrawer } from "./components/ai/AIAssistantDrawer";
import { SetupWizard } from "./components/setup/SetupWizard";
import { LoginView } from "./components/auth/LoginView";
import { authService } from "./services/auth.service";
import { User } from "./types/database";
import { SplashScreen } from "./components/splash/SplashScreen";
import { UpdateNotificationModal } from "./components/common/UpdateNotificationModal";
import { updateService } from "./services/update.service";
import { logger } from "./services/logger.service";

export const AppContent: React.FC = () => {
  const [currentView, setCurrentView] = useState<NavView>("pos");
  const [isAIOpen, setIsAIOpen] = useState<boolean>(false);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [showSetup, setShowSetup] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  useEffect(() => {
    const unsubscribe = authService.subscribe((user) => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  const handleAppReady = () => {
    const completed =
      localStorage.getItem("pizzeria_setup_completed") ||
      localStorage.getItem("aquadro_setup_completed");
    if (!completed) {
      setShowSetup(true);
    }
    setIsInitializing(false);
    logger.info("APPLICATION", "Pizzeria POS prêt et actif");

    // Non-blocking silent background update check
    updateService.checkForUpdates(true).catch((err) => {
      logger.warn("UPDATER", `Vérification mise à jour en arrière-plan ignorée: ${err}`);
    });
  };

  // Raccourcis clavier globaux POS et Navigation ERP F1-F12
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const fKeyMap: Record<string, NavView> = {
        "F1": "pos",
        "F2": "dashboard",
        "F3": "products",
        "F4": "inventory",
        "F5": "sales",
        "F6": "customers",
        "F7": "credits",
        "F8": "caisse",
        "F9": "expenses",
        "F10": "journal",
        "F11": "reports",
        "F12": "documents"
      };

      if (fKeyMap[e.key]) {
        e.preventDefault();
        setCurrentView(fKeyMap[e.key]);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  if (isInitializing) {
    return <SplashScreen onReady={handleAppReady} />;
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-[#FFF8EF] text-[#292522] overflow-hidden font-sans">
      {/* Assistant de premier démarrage (si non complété) */}
      {showSetup && (
        <SetupWizard
          onComplete={() => {
            localStorage.setItem("pizzeria_setup_completed", "true");
            localStorage.setItem("aquadro_setup_completed", "true");
            setShowSetup(false);
          }}
        />
      )}

      {!currentUser ? (
        <LoginView />
      ) : (
        <>
          {/* Barre Supérieure Topbar Pizzeria */}
          <Navbar
            onToggleAI={() => setIsAIOpen(!isAIOpen)}
            isAIOpen={isAIOpen}
            onNavigateToSettings={() => setCurrentView("settings")}
          />

          {/* Zone Centrale : Navigation Latérale Complète + Vue Active */}
          <div className="flex-1 flex overflow-hidden">
            <Sidebar
              currentView={currentView}
              onNavigate={(view) => setCurrentView(view)}
            />

            <main className="flex-1 flex overflow-hidden bg-[#FFF8EF]">
              {currentView === "pos" && <PosView />}
              {currentView === "dashboard" && (
                <DashboardView
                  onNavigateToPOS={() => setCurrentView("pos")}
                  onNavigateToInventory={() => setCurrentView("inventory")}
                />
              )}
              {currentView === "products" && <ProductsView />}
              {currentView === "inventory" && <InventoryView />}
              {currentView === "sales" && <SalesView />}
              {currentView === "customers" && <CustomersView />}
              {currentView === "caisse" && <CaisseView />}
              {currentView === "expenses" && <ExpensesView />}
              {currentView === "reports" && <ReportsView />}
              {currentView === "documents" && <DocumentsView />}
              {currentView === "credits" && <CreditsView />}
              {currentView === "journal" && <JournalView />}
              {currentView === "users" && <UsersView />}
              {currentView === "settings" && <SettingsView />}
            </main>
          </div>

          {/* Tiroir Assistant IA Copilote */}
          <AIAssistantDrawer
            isOpen={isAIOpen}
            onClose={() => setIsAIOpen(false)}
          />

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
