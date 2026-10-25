// Aquadro POS Algérie V2 — Barre Supérieure Sobre & Professionnelle (Navbar)
// Design épuré : Fond blanc, bordures grises, informations de caisse, synchronisation et langue

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useI18n } from '../../i18n';
import { caisseService } from '../../services/caisse.service';
import { syncService } from '../../services/sync.service';
import { printerService } from '../../services/printer.service';
import { authService } from '../../services/auth.service';
import { User, CashSession } from '../../types/database';
import { db } from '../../db/sqlite';
import { drawerLogService } from '../../services/drawerLog.service';
import { useToast } from './Toast';
import {
  Clock,
  Globe,
  Wifi,
  WifiOff,
  UserCheck,
  ChevronDown,
  Sparkles,
  KeyRound,
  CheckCircle,
  AlertCircle,
  LogOut,
  Vault,
  Bell,
  ShieldCheck
} from 'lucide-react';
import { NotificationsDropdown } from './NotificationsDropdown';
import { notificationService } from '../../services/notification.service';
import { NavView } from './Sidebar';
import { licenseService, LicenseStatusResponse } from '../../services/license.service';


// Composant horloge isolé pour empêcher tout re-render de la barre complète (Optimisation i5 3e Gen / CPU modeste)
const TimeDisplay: React.FC = React.memo(() => {
  const [timeStr, setTimeStr] = useState<string>(() => {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  });

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setTimeStr(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return <span>{timeStr}</span>;
});

interface NavbarProps {
  onToggleAI: () => void;
  isAIOpen: boolean;
  onNavigateToSettings: () => void;
  onNavigate?: (view: NavView) => void;
}

const NavbarComponent: React.FC<NavbarProps> = ({ onToggleAI, isAIOpen, onNavigateToSettings, onNavigate }) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const userMenuRef = React.useRef<HTMLDivElement>(null);
  const { language, setLanguage, t } = useI18n();
  const [session, setSession] = useState<CashSession | null>(null);
  const [pendingSync, setPendingSync] = useState<number>(0);
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [showUserMenu, setShowUserMenu] = useState<boolean>(false);
  const [showNotifications, setShowNotifications] = useState<boolean>(false);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState<number>(0);
  const [drawerPulseNotice, setDrawerPulseNotice] = useState<boolean>(false);
  const [isManualDrawerAllowed, setIsManualDrawerAllowed] = useState<boolean>(() => drawerLogService.isManualDrawerAllowed());
  const [storeName, setStoreName] = useState<string>("");
  const [storeLogo, setStoreLogo] = useState<string | null>(() => {
    return localStorage.getItem('aquadro_store_logo') || localStorage.getItem('pizzeria_store_logo');
  });
  const [licenseStatus, setLicenseStatus] = useState<LicenseStatusResponse | null>(null);

  useEffect(() => {
    const handleLicenseUpdate = (e?: any) => {
      if (e?.detail) {
        setLicenseStatus(e.detail);
      } else {
        licenseService.getStatus(true).then(setLicenseStatus).catch(() => {});
      }
    };
    handleLicenseUpdate();
    window.addEventListener('license_status_updated', handleLicenseUpdate);
    return () => window.removeEventListener('license_status_updated', handleLicenseUpdate);
  }, []);

  useEffect(() => {
    const handleDrawerSetting = () => {
      setIsManualDrawerAllowed(drawerLogService.isManualDrawerAllowed());
    };
    window.addEventListener('drawer_setting_changed', handleDrawerSetting);
    return () => {
      window.removeEventListener('drawer_setting_changed', handleDrawerSetting);
    };
  }, []);

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

  useEffect(() => {
    db.select<{ name_fr?: string; name?: string }>("SELECT name_fr, name FROM stores LIMIT 1")
      .then(res => {
        if (res && res.length > 0) {
          setStoreName(res[0].name_fr || res[0].name || "");
        }
      })
      .catch(() => {});
  }, []);



  useEffect(() => {
    const refreshStatus = async () => {
      try {
        const active = await caisseService.getActiveSession();
        setSession(active);
        const pending = await syncService.getPendingCount();
        setPendingSync(pending);
        setIsOnline(navigator.onLine);
      } catch (err) {
        // Ignorer les erreurs temporaires lors des transitions d'authentification
      }
    };
    refreshStatus();
    const interval = setInterval(refreshStatus, 20000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const refreshNotifications = async () => {
      if (user?.role === 'cashier') {
        setUnreadNotificationsCount(0);
        return;
      }
      try {
        const count = await notificationService.getUnreadCount();
        setUnreadNotificationsCount(count);
      } catch (e) {
        console.warn('Erreur rafraîchissement notifications navbar', e);
      }
    };
    refreshNotifications();
    const interval = setInterval(refreshNotifications, 15000);
    window.addEventListener('notifications_updated', refreshNotifications);
    window.addEventListener('store_needs_updated', refreshNotifications);
    return () => {
      clearInterval(interval);
      window.removeEventListener('notifications_updated', refreshNotifications);
      window.removeEventListener('store_needs_updated', refreshNotifications);
    };
  }, [user?.role]);

  const handleKickDrawer = async () => {
    try {
      await printerService.kickCashDrawer('Ouverture manuelle (Barre supérieure)', user?.name || 'Responsable', user?.role);
      setDrawerPulseNotice(true);
      setTimeout(() => setDrawerPulseNotice(false), 2000);
      showToast('Signal d\'ouverture envoyé au tiroir-caisse avec succès', 'success');
    } catch (err: any) {
      showToast(err.message || 'Impossible d\'ouvrir le tiroir-caisse', 'error');
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    };
    if (showUserMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showUserMenu]);

  const handleLogout = async () => {
    setShowUserMenu(false);
    try {
      await authService.logout();
    } catch (e) {
      console.error("Erreur déconnexion:", e);
    }
  };

  return (
    <header className="h-14 bg-white border-b border-stone-200 px-4 flex items-center justify-between select-none z-30 text-stone-800 text-xs shadow-xs">
      {/* 1. Établissement & Nom du Magasin */}
      <div className="flex items-center space-x-3">
        <div className="flex items-center space-x-2.5">
          <div className="w-9 h-9 sm:w-10 sm:h-10 bg-white rounded-xl flex items-center justify-center shadow-xs ring-1 ring-stone-200 overflow-hidden shrink-0">
            <img
              src={storeLogo || "/pizzeria-logo.jpg"}
              alt="Logo Pizzeria"
              className="w-full h-full object-contain p-0.5"
            />
          </div>
          <div>
            <span className="font-black tracking-tight text-stone-900 text-sm sm:text-base flex items-center gap-2">
              <span>Pizzeria POS</span>
              {storeName ? (
                <span className="text-[10px] sm:text-xs bg-orange-50 text-[#E87524] border border-orange-200/60 px-2 py-0.5 rounded-md font-mono font-bold">
                  {storeName}
                </span>
              ) : null}
            </span>
          </div>
        </div>

        {/* État de la Session de Caisse Active */}
        <div className="hidden md:flex items-center space-x-2 px-2.5 py-1 rounded-xl border text-[11px] font-bold bg-stone-50 border-stone-200 shadow-2xs">
          <span className={`w-2 h-2 rounded-full ${session ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
          <span className="text-stone-700">
            {session ? `${t('caisse.statusOpen')} (${session.cashier_name})` : t('caisse.statusClosed')}
          </span>
        </div>
      </div>

      {/* 2. Actions Matérielles & Synchronisation */}
      <div className="flex items-center space-x-2">
        {/* Impulsion Tiroir-Caisse RJ11 (Masqué pour le caissier, activable/désactivable par l'Admin) */}
        {user?.role !== 'cashier' && isManualDrawerAllowed && (
          <button
            onClick={handleKickDrawer}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border text-xs sm:text-[13px] font-bold transition-all shadow-2xs cursor-pointer active:scale-95 ${
              drawerPulseNotice
                ? 'bg-emerald-100 border-emerald-400 text-emerald-800'
                : 'bg-stone-50 hover:bg-stone-100 border-stone-200 text-stone-800'
            }`}
            title="Envoyer impulsion électrique 24V au tiroir-caisse RJ11"
          >
            <Vault className="w-4 h-4 text-[#E87524]" />
            <span>{drawerPulseNotice ? 'Tiroir Ouvert' : 'Tiroir'}</span>
          </button>
        )}

        {/* Statut Réseau & Synchronisation Outbox */}
        <button 
          onClick={user?.role === 'owner' ? onNavigateToSettings : undefined}
          className={`flex items-center space-x-1.5 px-2 py-1 rounded border border-gray-200 bg-gray-50 text-[11px] text-gray-600 ${user?.role === 'owner' ? 'hover:bg-gray-100 cursor-pointer' : 'cursor-default'}`}
          title={user?.role === 'owner' ? "Aller à la file d'attente de synchronisation" : "Statut du réseau"}
        >
          {isOnline ? (
            <Wifi className="w-3.5 h-3.5 text-emerald-600" />
          ) : (
            <WifiOff className="w-3.5 h-3.5 text-amber-600" />
          )}
          <span>{isOnline ? t('app.online') : t('app.offline')}</span>
          {pendingSync > 0 ? (
            <span className="flex items-center space-x-1 text-amber-700 font-semibold bg-amber-100 px-1.5 py-0.5 rounded ml-1">
              <AlertCircle className="w-3 h-3" />
              <span>{pendingSync} outbox</span>
            </span>
          ) : (
            <span className="flex items-center space-x-1 text-emerald-700 font-semibold bg-emerald-100 px-1.5 py-0.5 rounded ml-1">
              <CheckCircle className="w-3 h-3" />
              <span>Sync</span>
            </span>
          )}
        </button>

        {/* Badge Statut de Licence (Actif / Démo / Expiré) */}
        {licenseStatus?.is_licensed ? (
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('open_license_modal'))}
            className="flex items-center space-x-1.5 space-x-reverse px-2.5 py-1 rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold transition-all shadow-2xs cursor-pointer"
            title={`البرنامج مفعل رسمياً: ${licenseStatus.store_name || ''} (${licenseStatus.is_lifetime ? 'مدى الحياة' : licenseStatus.expires_at || ''})`}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>مفعل {licenseStatus.is_lifetime ? '(دائم)' : ''}</span>
          </button>
        ) : licenseStatus?.is_trial_active ? (
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('open_license_modal'))}
            className="flex items-center space-x-1.5 space-x-reverse px-2.5 py-1 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-bold transition-all shadow-2xs animate-pulse cursor-pointer"
            title="فترة تجريبية 7 أيام — انقر لتفعيل الترخيص الدائم"
          >
            <Clock className="w-3.5 h-3.5 text-[#E87524]" />
            <span>تجريبي: متبقي {licenseStatus.trial_days_remaining} أيام</span>
          </button>
        ) : licenseStatus?.is_trial_expired ? (
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('open_license_modal'))}
            className="flex items-center space-x-1.5 space-x-reverse px-2.5 py-1 rounded-xl border border-red-300 bg-red-50 hover:bg-red-100 text-red-900 text-xs font-bold transition-all shadow-2xs cursor-pointer animate-pulse"
            title="انتهت الفترة التجريبية — يتطلب التفعيل"
          >
            <AlertCircle className="w-3.5 h-3.5 text-red-600" />
            <span>غير مفعل</span>
          </button>
        ) : null}

        {/* Horloge Locale */}
        <div className="hidden sm:flex items-center space-x-1 px-2 py-1 rounded border border-gray-200 bg-gray-50 text-gray-600 font-mono text-[11px]">
          <Clock className="w-3.5 h-3.5 text-gray-400" />
          <TimeDisplay />
        </div>
      </div>

      {/* 3. Copilote & Profil Caissier */}
      <div className="flex items-center space-x-2">

        {/* Bouton Notifications & Alertes Proactives (Réservé au Propriétaire / Admin) */}
        {user?.role !== 'cashier' && (
          <div className="relative">
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className={`relative flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-bold transition-all shadow-2xs cursor-pointer active:scale-95 ${
                showNotifications
                  ? 'bg-orange-50 border-[#E87524] text-[#E87524]'
                  : unreadNotificationsCount > 0
                  ? 'bg-white hover:bg-orange-50/50 border-orange-300 text-stone-800'
                  : 'bg-stone-50 hover:bg-stone-100 border-stone-200 text-stone-700'
              }`}
              title="Notifications & Alertes du magasin (إشعارات وتنبيهات)"
            >
              <div className="relative flex items-center justify-center">
                <Bell className={`w-3.5 h-3.5 ${unreadNotificationsCount > 0 ? 'text-[#E87524]' : 'text-stone-500'}`} />
                {unreadNotificationsCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500 animate-pulse ring-2 ring-white" />
                )}
              </div>
              <span className="hidden sm:inline">Notifications</span>
              {unreadNotificationsCount > 0 && (
                <span className="bg-red-500 text-white text-[10px] font-black px-1.5 py-0.2 rounded-full font-mono ml-0.5">
                  {unreadNotificationsCount}
                </span>
              )}
            </button>

            <NotificationsDropdown
              isOpen={showNotifications}
              onClose={() => setShowNotifications(false)}
              onNavigate={onNavigate}
            />
          </div>
        )}

        {/* Bouton Assistant IA (Réservé au Propriétaire / Admin) */}
        {user?.role !== 'cashier' && (
          <button
            onClick={onToggleAI}
            className={`flex items-center space-x-1 px-2.5 py-1 rounded border text-xs font-medium transition-colors ${
              isAIOpen
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white hover:bg-gray-50 text-gray-700 border-gray-300'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{t('app.retailCopilot')}</span>
          </button>
        )}

        {/* Menu Utilisateur / Changement de Caissier */}
        <div className="relative" ref={userMenuRef}>
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center space-x-1.5 px-2.5 py-1 rounded border border-gray-300 bg-white hover:bg-gray-50 transition-colors cursor-pointer"
          >
            <UserCheck className="w-3.5 h-3.5 text-gray-500" />
            <span className="font-semibold text-gray-900">{user?.name || 'Caissier'}</span>
            <span className="text-[10px] uppercase font-bold px-1.5 py-0.2 rounded bg-gray-100 text-gray-600 border border-gray-200">
              {user?.role}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
          </button>

          {showUserMenu && (
            <div className="absolute right-0 mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg p-1.5 z-50 animate-in fade-in">
              <div className="px-2 py-1 border-b border-gray-100 mb-1">
                <span className="text-[11px] font-semibold text-gray-500 uppercase">Mon Compte</span>
              </div>
              <div className="space-y-0.5">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center space-x-2 px-2 py-2 rounded text-left text-xs text-red-600 hover:bg-red-50 font-semibold transition-colors cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Se déconnecter</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export const Navbar = React.memo(NavbarComponent);
