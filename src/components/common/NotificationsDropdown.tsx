// Aquadro POS Algérie — Panneau Déroulant des Notifications & Alertes Proactives
// Affiche en temps réel les ruptures de stock, besoins du magasin, péremptions et alertes caisse.

import React, { useState, useEffect } from 'react';
import { notificationService, AppNotification, NotificationSeverity } from '../../services/notification.service';
import { NavView } from './Sidebar';
import {
  Bell,
  CheckCheck,
  RefreshCw,
  AlertTriangle,
  AlertCircle,
  PackageX,
  ShoppingBag,
  CalendarClock,
  Info,
  CheckCircle2,
  ExternalLink,
  X,
  Check,
  Trash2
} from 'lucide-react';

interface NotificationsDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate?: (view: NavView) => void;
}

export const NotificationsDropdown: React.FC<NotificationsDropdownProps> = ({
  isOpen,
  onClose,
  onNavigate
}) => {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [filter, setFilter] = useState<'ALL' | 'need' | 'stock' | 'system'>('ALL');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const loadNotifications = async () => {
    setIsLoading(true);
    try {
      const data = await notificationService.getAllNotifications();
      setNotifications(data);
    } catch (e) {
      console.error('Erreur chargement notifications', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadNotifications();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleUpdate = () => {
      loadNotifications();
    };
    window.addEventListener('notifications_updated', handleUpdate);
    window.addEventListener('store_needs_updated', handleUpdate);
    return () => {
      window.removeEventListener('notifications_updated', handleUpdate);
      window.removeEventListener('store_needs_updated', handleUpdate);
    };
  }, []);

  if (!isOpen) return null;

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const filteredNotifications = notifications.filter(n => {
    if (filter === 'ALL') return true;
    if (filter === 'need') return n.type === 'need';
    if (filter === 'stock') return n.type === 'stock' || n.type === 'fefo';
    if (filter === 'system') return n.type === 'caisse' || n.type === 'sync' || n.type === 'system';
    return true;
  });

  const handleMarkAllRead = () => {
    notificationService.markAllAsRead(notifications);
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
  };

  const handleClearAll = () => {
    notificationService.clearAllNotifications(notifications);
    setNotifications([]);
  };

  const handleDismissItem = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    notificationService.dismissNotification(id);
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const handleItemClick = (n: AppNotification) => {
    notificationService.markAsRead(n.id);
    setNotifications(prev => prev.map(item => item.id === n.id ? { ...item, isRead: true } : item));
    if (n.targetView && onNavigate) {
      onNavigate(n.targetView as NavView);
      onClose();
    }
  };

  const handleToggleRead = (e: React.MouseEvent, n: AppNotification) => {
    e.stopPropagation();
    if (n.isRead) {
      notificationService.markAsUnread(n.id);
      setNotifications(prev => prev.map(item => item.id === n.id ? { ...item, isRead: false } : item));
    } else {
      notificationService.markAsRead(n.id);
      setNotifications(prev => prev.map(item => item.id === n.id ? { ...item, isRead: true } : item));
    }
  };

  const getIcon = (n: AppNotification) => {
    switch (n.type) {
      case 'need':
        return <ShoppingBag className="w-4 h-4 text-amber-600" />;
      case 'stock':
        return <PackageX className="w-4 h-4 text-red-600" />;
      case 'fefo':
        return <CalendarClock className="w-4 h-4 text-purple-600" />;
      case 'caisse':
        return <AlertTriangle className="w-4 h-4 text-blue-600" />;
      case 'sync':
        return <Info className="w-4 h-4 text-stone-600" />;
      default:
        return <AlertCircle className="w-4 h-4 text-stone-600" />;
    }
  };

  const getSeverityBadge = (severity: NotificationSeverity) => {
    switch (severity) {
      case 'critical':
        return <span className="text-[9px] uppercase font-black px-1.5 py-0.5 rounded bg-red-100 text-red-700">Urgent</span>;
      case 'warning':
        return <span className="text-[9px] uppercase font-black px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">Alerte</span>;
      case 'info':
        return <span className="text-[9px] uppercase font-black px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">Info</span>;
      default:
        return null;
    }
  };

  return (
    <>
      {/* Backdrop invisible pour fermer en cliquant à l'extérieur */}
      <div 
        className="fixed inset-0 z-40" 
        onClick={onClose}
      />

      <div className="absolute right-0 sm:right-6 top-12 mt-2 w-[92vw] sm:w-[420px] bg-white border border-stone-200 rounded-2xl shadow-2xl z-50 overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in slide-in-from-top-2 duration-150">
        {/* Entête */}
        <div className="p-3.5 bg-white border-b border-stone-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-orange-50 border border-orange-200/70 flex items-center justify-center text-[#E87524]">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-stone-900 text-sm">Notifications & Alertes</h3>
                {unreadCount > 0 && (
                  <span className="bg-red-500 text-white text-[10px] font-black px-1.5 py-0.2 rounded-full font-mono">
                    {unreadCount}
                  </span>
                )}
              </div>
              <p className="text-[10px] text-stone-500 font-medium">Alertes stocks, besoins magasin et caisse</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={loadNotifications}
              disabled={isLoading}
              className="p-1.5 text-stone-500 hover:text-stone-800 hover:bg-stone-100 rounded-lg transition-colors cursor-pointer"
              title="Actualiser les alertes"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-[#E87524]' : ''}`} />
            </button>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="p-1.5 text-stone-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                title="Tout marquer comme lu"
              >
                <CheckCheck className="w-4 h-4" />
              </button>
            )}
            {notifications.length > 0 && (
              <button
                onClick={handleClearAll}
                className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold text-red-600 hover:text-white bg-red-50 hover:bg-red-600 rounded-lg transition-colors border border-red-200 cursor-pointer shadow-2xs"
                title="تفريغ كل الإشعارات (Tout effacer)"
              >
                <Trash2 className="w-3 h-3" />
                <span>تفريغ الإشعارات</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-lg transition-colors ml-1 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Filtres par catégorie */}
        <div className="flex items-center gap-1.5 px-3 py-2 bg-stone-50/80 border-b border-stone-200 text-xs overflow-x-auto scrollbar-none">
          <button
            onClick={() => setFilter('ALL')}
            className={`px-2.5 py-1 rounded-lg font-bold text-[11px] whitespace-nowrap transition-colors ${
              filter === 'ALL'
                ? 'bg-stone-900 text-white shadow-xs'
                : 'bg-white text-stone-600 hover:bg-stone-200/60 border border-stone-200'
            }`}
          >
            Toutes ({notifications.length})
          </button>
          <button
            onClick={() => setFilter('stock')}
            className={`px-2.5 py-1 rounded-lg font-bold text-[11px] whitespace-nowrap transition-colors ${
              filter === 'stock'
                ? 'bg-red-600 text-white shadow-xs'
                : 'bg-white text-stone-600 hover:bg-stone-200/60 border border-stone-200'
            }`}
          >
            Stocks & Ingrédients
          </button>
          <button
            onClick={() => setFilter('need')}
            className={`px-2.5 py-1 rounded-lg font-bold text-[11px] whitespace-nowrap transition-colors ${
              filter === 'need'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-white text-stone-600 hover:bg-stone-200/60 border border-stone-200'
            }`}
          >
            Besoins Magasin
          </button>
          <button
            onClick={() => setFilter('system')}
            className={`px-2.5 py-1 rounded-lg font-bold text-[11px] whitespace-nowrap transition-colors ${
              filter === 'system'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-white text-stone-600 hover:bg-stone-200/60 border border-stone-200'
            }`}
          >
            Système & Caisse
          </button>
        </div>

        {/* Liste des notifications */}
        <div className="flex-1 overflow-y-auto divide-y divide-stone-100 max-h-[380px]">
          {filteredNotifications.length === 0 ? (
            <div className="py-12 px-6 flex flex-col items-center justify-center text-center">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 mb-3">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-stone-800 mb-1">Tout est en ordre</h4>
              <p className="text-xs text-stone-500 max-w-xs">
                Aucune alerte active dans cette catégorie. Vos stocks et processus sont sous contrôle.
              </p>
            </div>
          ) : (
            filteredNotifications.map((n) => {
              return (
                <div
                  key={n.id}
                  onClick={() => handleItemClick(n)}
                  className={`p-3.5 transition-colors flex items-start gap-3 cursor-pointer group hover:bg-orange-50/40 relative ${
                    n.isRead ? 'bg-white opacity-75' : 'bg-orange-50/20'
                  }`}
                >
                  {/* Puce non-lu */}
                  {!n.isRead && (
                    <span className="absolute left-1.5 top-5 w-1.5 h-1.5 rounded-full bg-[#E87524]" />
                  )}

                  {/* Icône Catégorie */}
                  <div className="w-8 h-8 rounded-xl bg-stone-100 border border-stone-200/70 flex items-center justify-center shrink-0 mt-0.5">
                    {getIcon(n)}
                  </div>

                  {/* Corps */}
                  <div className="flex-1 min-w-0 pr-1">
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className={`text-xs font-bold truncate ${n.isRead ? 'text-stone-700' : 'text-stone-900 font-extrabold'}`}>
                        {n.title}
                      </span>
                      {getSeverityBadge(n.severity)}
                    </div>
                    <p className="text-[11px] text-stone-600 leading-snug mb-1.5 line-clamp-2">
                      {n.message}
                    </p>
                    <div className="flex items-center justify-between text-[10px] text-stone-400">
                      <span>{new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      {n.targetView && (
                        <span className="text-[#E87524] font-bold flex items-center gap-1 group-hover:underline">
                          <span>Accéder</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions rapides : marquer comme lu et effacer */}
                  <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-all">
                    <button
                      onClick={(e) => handleToggleRead(e, n)}
                      className="p-1 rounded text-stone-400 hover:text-stone-700 hover:bg-stone-200/70 transition-all cursor-pointer"
                      title={n.isRead ? "Marquer comme non lu" : "Marquer comme lu"}
                    >
                      {n.isRead ? <CheckCheck className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={(e) => handleDismissItem(e, n.id)}
                      className="p-1 rounded text-stone-400 hover:text-red-600 hover:bg-red-50 transition-all cursor-pointer"
                      title="Effacer cette notification (تفريغ)"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Pied du panneau */}
        <div className="p-2.5 bg-stone-50 border-t border-stone-200 flex items-center justify-between text-[11px] text-stone-500">
          <span>{filteredNotifications.length} alerte(s) listée(s)</span>
          <div className="flex items-center gap-3">
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-[#E87524] hover:text-[#d06316] font-bold cursor-pointer"
              >
                Tout marquer comme lu
              </button>
            )}
            {notifications.length > 0 && (
              <button
                onClick={handleClearAll}
                className="text-red-600 hover:text-red-700 font-bold cursor-pointer"
              >
                تفريغ الكل (Effacer tout)
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
};
