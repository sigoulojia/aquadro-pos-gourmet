// Aquadro POS Algérie V2 — Module Unifié de Gestion des Dossiers d'Exercice, Archives & Formatage Complet
// Permet de gérer les sessions d'utilisation, isoler les données, ouvrir les dossiers sur le disque,
// et effectuer le formatage complet ou la suppression d'archives exclusivement avec le code secret
// imprimé sur la charte d'initialisation Setup Charter PDF.

import React, { useState, useEffect } from 'react';
import {
  Folder,
  FolderPlus,
  FolderArchive,
  FolderOpen,
  RotateCcw,
  AlertTriangle,
  ShieldCheck,
  CheckCircle2,
  Calendar,
  FileText,
  Database,
  ArrowRight,
  Sparkles,
  HardDrive,
  Lock,
  Layers,
  Clock,
  Check,
  Trash2,
  Key,
  ShieldAlert,
  Info
} from 'lucide-react';
import {
  usageSessionService,
  UsageSessionInfo,
  ActiveSessionMeta
} from '../../services/usageSession.service';
import { backupService } from '../../services/backup.service';
import { db } from '../../db/sqlite';

interface UsageSessionsSectionProps {
  onShowToast: (message: string, type: 'info' | 'success' | 'warning' | 'error') => void;
}

export const UsageSessionsSection: React.FC<UsageSessionsSectionProps> = ({ onShowToast }) => {
  const [activeSession, setActiveSession] = useState<ActiveSessionMeta>(() => usageSessionService.getActiveSession());
  const [sessions, setSessions] = useState<UsageSessionInfo[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Modal 1 : Nouveau dossier d'exercice & nouveau départ
  const [showModal, setShowModal] = useState<boolean>(false);
  const [newSessionName, setNewSessionName] = useState<string>('');
  const [archiveLabel, setArchiveLabel] = useState<string>('');
  const [resetMode, setResetMode] = useState<'TRANSACTIONS_ONLY' | 'FULL_FACTORY_RESET'>('TRANSACTIONS_ONLY');
  const [securityPin, setSecurityPin] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Modal 2 : Formatage Complet (DANGER ZONE)
  const [showFormatModal, setShowFormatModal] = useState<boolean>(false);
  const [formatSecret, setFormatSecret] = useState<string>('');
  const [hasAgreedFormat, setHasAgreedFormat] = useState<boolean>(false);
  const [isFormatting, setIsFormatting] = useState<boolean>(false);

  // Modal 3 : Suppression d'une archive scellée
  const [archiveToDelete, setArchiveToDelete] = useState<UsageSessionInfo | null>(null);
  const [deleteSecret, setDeleteSecret] = useState<string>('');
  const [isDeletingArchive, setIsDeletingArchive] = useState<boolean>(false);

  // Charger la liste des sessions avec les chemins absolus réels
  const loadSessions = async () => {
    setIsLoading(true);
    try {
      const current = await usageSessionService.fetchActiveSession();
      setActiveSession(current);
      const list = await usageSessionService.listSessions();
      setSessions(list);
    } catch (err: any) {
      console.warn('Erreur chargement des sessions:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSessions();
  }, []);

  // Ouvrir le modal Nouveau Dossier
  const handleOpenModal = () => {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = now.toTimeString().slice(0, 5).replace(':', 'h');
    setNewSessionName(`استخدام_جديد_${dateStr}`);
    setArchiveLabel(`أرشيف_${activeSession.name.replace(/[^a-zA-Z0-9_\u0600-\u06FF]/g, '_')}_${dateStr}_${timeStr}`);
    setSecurityPin('');
    setShowModal(true);
  };

  // Soumission de la création du nouveau dossier d'utilisation
  const handleCreateSession = async () => {
    if (!newSessionName.trim()) {
      onShowToast('يرجى إدخال اسم لمجلد الاستخدام الجديد', 'warning');
      return;
    }

    if (!securityPin.trim()) {
      onShowToast('يرجى إدخال رمز الأمان السري المطبوع في ورقة ميثاق الإعداد الأولي (Setup Charter PDF)', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      // Vérification stricte du code secret de récupération
      const verification = await usageSessionService.verifyRecoveryCode(securityPin);
      if (!verification.valid) {
        onShowToast(verification.error || 'رمز الأمان غير مطابق للرمز السري المطبوع في وثيقة إعداد النظام (Setup Charter PDF).', 'error');
        setIsSubmitting(false);
        return;
      }

      onShowToast('جاري أرشفة الاستخدام الحالي وإنشاء المجلد الجديد...', 'info');

      const result = await usageSessionService.createNewSession({
        sessionName: newSessionName,
        archiveLabel: archiveLabel,
        resetMode: resetMode
      });

      onShowToast(result.message || 'تم إنشاء مجلد الاستخدام الجديد بنجاح !', 'success');
      setShowModal(false);

      // Rafraîchir l'application pour charger le nouvel environnement propre
      setTimeout(() => {
        window.location.reload();
      }, 1400);
    } catch (err: any) {
      onShowToast(`خطأ أثناء إنشاء الاستخدام الجديد : ${err?.message || err}`, 'error');
      setIsSubmitting(false);
    }
  };

  // Exécution du Formatage Complet (Repartir de zéro avec l'assistant)
  const handleExecuteFormatageComplet = async () => {
    if (!hasAgreedFormat) {
      onShowToast('يرجى الموافقة على شروط الميثاق قبل المتابعة', 'warning');
      return;
    }

    if (!formatSecret.trim()) {
      onShowToast('يرجى إدخال رمز الأمان السري المطبوع في وثيقة الإعداد الأولي (Setup Charter PDF)', 'warning');
      return;
    }

    setIsFormatting(true);
    try {
      // 1. Vérification stricte du code secret de récupération de la charte PDF
      const checkResult = await usageSessionService.verifyRecoveryCode(formatSecret);
      if (!checkResult.valid) {
        onShowToast(checkResult.error || 'رمز الأمان غير مطابق للرمز السري المطبوع في وثيقة إعداد النظام (Setup Charter PDF). تم رفض العملية.', 'error');
        setIsFormatting(false);
        return;
      }

      // 2. Création d'une sauvegarde de précaution avant formatage
      try {
        onShowToast('جاري حفظ نسخة احتياطية من البيانات قبل التنسيق...', 'info');
        await backupService.createBackup('formatage_securise');
      } catch (backupErr) {
        console.warn('Backup before format warning:', backupErr);
      }

      // 3. Effacement complet de la base de données
      onShowToast('جاري تهيئة قاعدة البيانات ومسح الإعدادات...', 'info');
      await db.resetAll();

      // 4. Nettoyage du stockage local et des tokens de session
      localStorage.removeItem('aquadro_setup_completed');
      localStorage.removeItem('pizzeria_setup_completed');
      localStorage.removeItem('aquadro_store_logo');
      localStorage.removeItem('pizzeria_store_logo');
      localStorage.removeItem('aquadro_session_token');
      localStorage.removeItem('aquadro_active_usage_session');
      localStorage.removeItem('aquadro_archived_sessions');

      onShowToast('تمت التهيئة الكاملة بنجاح! جاري الانتقال إلى معالج الإعداد...', 'success');
      setShowFormatModal(false);

      setTimeout(() => {
        window.location.reload();
      }, 1200);
    } catch (err: any) {
      onShowToast(`فشل في عملية التهيئة الكاملة: ${err?.message || err}`, 'error');
      setIsFormatting(false);
    }
  };

  // Suppression d'un dossier d'archive avec vérification du code secret
  const handleDeleteArchive = async () => {
    if (!archiveToDelete) return;

    if (!deleteSecret.trim()) {
      onShowToast('يرجى إدخال رمز الأمان السري المطبوع في وثيقة الإعداد الأولي (Setup Charter PDF)', 'warning');
      return;
    }

    setIsDeletingArchive(true);
    try {
      const checkResult = await usageSessionService.verifyRecoveryCode(deleteSecret);
      if (!checkResult.valid) {
        onShowToast(checkResult.error || 'رمز الأمان غير مطابق للرمز السري المطبوع في وثيقة إعداد النظام (Setup Charter PDF).', 'error');
        setIsDeletingArchive(false);
        return;
      }

      await usageSessionService.deleteArchive(archiveToDelete.folder_path, archiveToDelete.id);
      onShowToast('تم حذف مجلد الأرشيف نهائياً بنجاح', 'success');
      setArchiveToDelete(null);
      setDeleteSecret('');
      await loadSessions();
    } catch (err: any) {
      onShowToast(`تعذر حذف الأرشيف : ${err?.message || err}`, 'error');
    } finally {
      setIsDeletingArchive(false);
    }
  };

  // Ouvrir un dossier dans l'explorateur du système (chemin absolu)
  const handleOpenFolder = async (path: string) => {
    try {
      const opened = await usageSessionService.openFolderPath(path);
      if (opened) {
        onShowToast('تم فتح المجلد في حاسوبك بنجاح', 'info');
      }
    } catch (err: any) {
      onShowToast(`تعذر فتح المجلد : ${err?.message || err}`, 'error');
    }
  };

  const archivedSessions = sessions.filter(s => !s.is_active);

  return (
    <div className="space-y-6 animate-in fade-in duration-150 text-right" dir="rtl">
      {/* ========================================================================= */}
      {/* 1. BARRE DE TITRE & ACTIONS                                               */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-2xl border border-[#E9DCCB] p-5 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#FFF3EB] to-[#FFE2CC] border border-[#E87524]/30 text-[#E87524] flex items-center justify-center shrink-0 shadow-xs">
              <FolderArchive className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-black text-[#292522] flex items-center gap-2">
                <span>فترات وجلسات الاستخدام، الأرشيف والتهيئة الشاملة</span>
                <span className="bg-[#FFF3EB] text-[#E87524] text-[10px] font-black px-2.5 py-0.5 rounded-full border border-[#E87524]/20 shadow-2xs">
                  نظام الأمان الموحد
                </span>
              </h2>
              <p className="text-xs text-stone-500 mt-0.5">
                عزل بيانات كل موسم وفترة عمل، إدارة الأرشيف بأمان تام، والتهيئة الكاملة المحمية بالرمز السري المطبوع
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <button
            type="button"
            onClick={() => handleOpenFolder(activeSession.folderPath)}
            className="px-3.5 py-2 rounded-xl bg-white hover:bg-stone-50 border border-stone-200 text-stone-700 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
            title="فتح مجلد الاستخدام الحالي في مستكشف الملفات"
          >
            <FolderOpen className="w-4 h-4 text-stone-500" />
            <span>فتح مجلد الاستخدام الحالي</span>
          </button>

          <button
            type="button"
            onClick={handleOpenModal}
            className="px-4 py-2 rounded-xl bg-[#E87524] hover:bg-[#D46317] text-white text-xs font-black transition-all flex items-center gap-2 cursor-pointer shadow-xs active:scale-95"
            title="إنشاء مجلد جديد وإعادة نقطة الصفر مع أرشفة السابق"
          >
            <FolderPlus className="w-4 h-4" />
            <span>بدء استخدام جديد وأرشفة السابق</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setHasAgreedFormat(false);
              setFormatSecret('');
              setShowFormatModal(true);
            }}
            className="px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
            title="تهيئة كاملة للنظام والعودة لمعالج الإعداد"
          >
            <AlertTriangle className="w-4 h-4" />
            <span>Formatage complet</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. BANNIERE DE LA SESSION ACTIVE COURANTE                                 */}
      {/* ========================================================================= */}
      <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-white rounded-2xl border border-emerald-200/80 p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-600 text-white shadow-2xs">
                <span className="w-2 h-2 rounded-full bg-white animate-pulse"></span>
                <span>فترة الاستخدام النشطة حالياً (En Cours)</span>
              </span>
              <span className="text-xs text-stone-400 font-medium">|</span>
              <span className="text-xs text-stone-500 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                <span>بدأت في : {new Date(activeSession.startedAt).toLocaleString('fr-DZ')}</span>
              </span>
            </div>

            <h3 className="text-base font-black text-stone-800 flex items-center gap-2">
              <Folder className="w-5 h-5 text-emerald-600" />
              <span>{activeSession.name}</span>
            </h3>

            <p className="text-xs text-stone-600 font-mono bg-white/80 border border-emerald-200/60 px-3 py-1.5 rounded-lg inline-block text-left" dir="ltr">
              📂 {activeSession.folderPath}
            </p>
          </div>

          <button
            type="button"
            onClick={() => handleOpenFolder(activeSession.folderPath)}
            className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-xs shrink-0"
          >
            <FolderOpen className="w-4 h-4" />
            <span>استعراض محتويات المجلد</span>
          </button>
        </div>

        <div className="mt-4 pt-3 border-t border-emerald-200/50 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-emerald-950 font-medium">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>التقارير الحالية تنزل تلقائياً في هذا المجلد المحدد</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>سجلات النشاط معزولة ومحمية بالكامل</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>بيانات المبيعات مفصولة عن الفترات السابقة لتجنب أي تداخل</span>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. LISTE DES ARCHIVES PRECEDENTES SCELLEES                                */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-2xl border border-[#E9DCCB] p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-[#E9DCCB]/60 pb-3">
          <div className="flex items-center gap-2">
            <FolderArchive className="w-4 h-4 text-[#E87524]" />
            <h3 className="font-bold text-[#292522] text-sm">
              أرشيف فترات الاستخدام السابقة (Dossiers Archivés & Scellés)
            </h3>
          </div>
          <span className="text-xs text-stone-500 font-medium">
            {archivedSessions.length} استخدام مؤرشف ومحفوظ بأمان
          </span>
        </div>

        {archivedSessions.length === 0 ? (
          <div className="text-center py-10 bg-stone-50/70 rounded-xl border border-stone-200/80 space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-white border border-stone-200 flex items-center justify-center mx-auto text-stone-400 shadow-2xs">
              <FolderArchive className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-stone-700">لا توجد فترات استخدام سابقة مؤرشفة بعد</h4>
            <p className="text-xs text-stone-500 max-w-md mx-auto">
              عندما تقوم بالضغط على "بدء استخدام جديد وأرشفة السابق"، سيتم نقل وتجميد الفترة الحالية بكل تقاريرها وسجلاتها هنا تلقائياً لكي لا تضيع أبداً.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {archivedSessions.map((session) => (
              <div
                key={session.id}
                className="p-4 bg-stone-50/80 hover:bg-orange-50/30 rounded-xl border border-stone-200 transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-2xs"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white border border-stone-300 text-stone-600 flex items-center justify-center shrink-0 shadow-2xs mt-0.5">
                    <FolderArchive className="w-5 h-5 text-[#E87524]" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-stone-800">{session.name}</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-stone-200 text-stone-700">
                        مؤرشف ومجمد
                      </span>
                    </div>

                    <p className="text-[11px] text-stone-500 mt-0.5 flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-stone-400" />
                      <span>تاريخ الأرشفة : {new Date(session.created_at).toLocaleString('fr-DZ')}</span>
                    </p>

                    <p className="text-[10px] text-stone-500 font-mono mt-1 text-left" dir="ltr">
                      📂 {session.folder_path}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  <button
                    type="button"
                    onClick={() => handleOpenFolder(session.folder_path)}
                    className="px-3.5 py-1.5 rounded-xl bg-white hover:bg-stone-100 border border-stone-200 text-stone-700 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  >
                    <FolderOpen className="w-3.5 h-3.5 text-stone-500" />
                    <span>فتح مجلد الأرشيف</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setArchiveToDelete(session);
                      setDeleteSecret('');
                    }}
                    className="p-2 rounded-xl text-stone-400 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 transition-all cursor-pointer"
                    title="حذف هذا الأرشيف نهائياً (يتطلب رمز الأمان السري من PDF)"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 4. CARTE DÉDIÉE : FORMATAGE COMPLET DGI & INITIALISATION A ZERO           */}
      {/* ========================================================================= */}
      <div className="bg-gradient-to-r from-red-50/70 via-orange-50/40 to-white rounded-2xl border border-red-200 p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl bg-red-100 text-red-600 flex items-center justify-center font-bold">
                <AlertTriangle className="w-4 h-4" />
              </span>
              <h3 className="text-sm font-black text-red-950">
                منطقة العمليات الحرجة : Formatage complet (التهيئة الشاملة للنظام)
              </h3>
            </div>
            <p className="text-xs text-stone-600">
              مسح شامل لكافة المنتجات والمعاملات والإعدادات والعودة إلى معالج الإعداد الأولي (Setup Wizard).
              هذه العملية خطيرة للغاية ومحمية حصرياً برمز الأمان السري المطبوع في ورقة ميثاق الإعداد (Setup Charter PDF).
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setHasAgreedFormat(false);
              setFormatSecret('');
              setShowFormatModal(true);
            }}
            className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-xs shrink-0 active:scale-95"
          >
            <RotateCcw className="w-4 h-4" />
            <span>تهيئة النظام بالكامل (Formatage)</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL 1 : NOUVEAU DOSSIER D'EXERCICE & REINITIALISATION                   */}
      {/* ========================================================================= */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl border border-[#E9DCCB] max-w-lg w-full p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            {/* Titre Modal */}
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-[#FFF3EB] border border-[#E87524]/30 text-[#E87524] flex items-center justify-center shrink-0">
                  <FolderPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-stone-900">
                    بدء استخدام جديد وأرشفة الفترة السابقة
                  </h3>
                  <span className="text-[11px] text-stone-500">
                    Nouveau Dossier d'Exercice & Archivage Sécurisé
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !isSubmitting && setShowModal(false)}
                className="w-8 h-8 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 flex items-center justify-center cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Note d'information rassurante */}
            <div className="p-3.5 bg-amber-50/80 border border-amber-200/80 rounded-2xl flex items-start gap-2.5 text-xs text-amber-900">
              <ShieldCheck className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block">لن تفقد أي بيانات سابقة !</span>
                <span>
                  سيقوم البرنامج تلقائياً بنقل قاعدة البيانات، كافة التقارير، وسجلات النشاط الحالية وتجميدها في مجلد أرشيف خاص، ثم فتح مجلد جديد ونظيف تماماً للبدء من الصفر.
                </span>
              </div>
            </div>

            {/* Formulaire */}
            <div className="space-y-4 text-xs">
              {/* Nom du nouveau dossier */}
              <div>
                <label className="block font-bold text-stone-700 mb-1">
                  1. اسم مجلد الاستخدام الجديد (Nom du nouveau dossier) :
                </label>
                <input
                  type="text"
                  value={newSessionName}
                  onChange={e => setNewSessionName(e.target.value)}
                  placeholder="مثال: موسم_صيف_2026 أو استخدام_جديد_2"
                  className="w-full px-3.5 py-2.5 bg-[#FFF8EF]/50 border border-[#E9DCCB] rounded-xl font-bold text-stone-900 focus:ring-2 focus:ring-[#E87524] focus:outline-none"
                  disabled={isSubmitting}
                />
              </div>

              {/* Nom du dossier d'archivage */}
              <div>
                <label className="block font-bold text-stone-700 mb-1">
                  2. اسم مجلد أرشفة الاستخدام السابق (Nom de l'archive) :
                </label>
                <input
                  type="text"
                  value={archiveLabel}
                  onChange={e => setArchiveLabel(e.target.value)}
                  placeholder="أرشيف_استخدام_سابق"
                  className="w-full px-3.5 py-2.5 bg-[#FFF8EF]/50 border border-[#E9DCCB] rounded-xl text-stone-800 focus:outline-none"
                  disabled={isSubmitting}
                />
              </div>

              {/* Choix du mode de réinitialisation */}
              <div>
                <label className="block font-bold text-stone-700 mb-2">
                  3. نوع تصفير البيانات للبدء من الصفر :
                </label>
                <div className="space-y-2">
                  <label
                    onClick={() => setResetMode('TRANSACTIONS_ONLY')}
                    className={`p-3 rounded-xl border flex items-start gap-3 cursor-pointer transition-colors ${
                      resetMode === 'TRANSACTIONS_ONLY'
                        ? 'bg-[#FFF3EB] border-[#E87524] ring-1 ring-[#E87524]'
                        : 'bg-stone-50 border-stone-200 hover:bg-stone-100'
                    }`}
                  >
                    <input
                      type="radio"
                      name="resetMode"
                      checked={resetMode === 'TRANSACTIONS_ONLY'}
                      onChange={() => setResetMode('TRANSACTIONS_ONLY')}
                      className="accent-[#E87524] mt-0.5 cursor-pointer"
                    />
                    <div>
                      <span className="font-bold text-stone-800 block">
                        تصفير المعاملات والمبيعات والمخزون فقط (موصى به للمطاعم)
                      </span>
                      <span className="text-[11px] text-stone-500">
                        يحتفظ بقائمة البيتزا والمنتجات والمشروبات والإضافات والأسعار حتى لا تعيد كتابتها، مع تصفير المبيعات ورصيد الصندوق والمخزون للبدء من جديد.
                      </span>
                    </div>
                  </label>

                  <label
                    onClick={() => setResetMode('FULL_FACTORY_RESET')}
                    className={`p-3 rounded-xl border flex items-start gap-3 cursor-pointer transition-colors ${
                      resetMode === 'FULL_FACTORY_RESET'
                        ? 'bg-red-50 border-red-500 ring-1 ring-red-500'
                        : 'bg-stone-50 border-stone-200 hover:bg-stone-100'
                    }`}
                  >
                    <input
                      type="radio"
                      name="resetMode"
                      checked={resetMode === 'FULL_FACTORY_RESET'}
                      onChange={() => setResetMode('FULL_FACTORY_RESET')}
                      className="accent-red-600 mt-0.5 cursor-pointer"
                    />
                    <div>
                      <span className="font-bold text-red-900 block">
                        تصفير شامل 100% (إعادة ضبط المصنع بالكامل)
                      </span>
                      <span className="text-[11px] text-red-700">
                        مسح كافة المنتجات والمعاملات والبدء من شاشة الترحيب والإعداد الأولي (مع الاحتفاظ بنسخة الأرشيف).
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Code Secret de Récupération (Setup Charter PDF) */}
              <div className="p-3.5 bg-red-50/60 border border-red-200/80 rounded-2xl space-y-1.5">
                <label className="block font-bold text-red-900 mb-1 flex items-center gap-1.5">
                  <Key className="w-4 h-4 text-red-600" />
                  <span>4. الرمز السري من وثيقة الإعداد (Setup Charter PDF) :</span>
                </label>
                <p className="text-[11px] text-stone-600">
                  أدخل الرمز السري المطبوع في ورقة ميثاق الإعداد الأولي. تم إلغاء قبول رمز البائع أو المالك العادي لمنع أي تصفير غير مصرح به.
                </p>
                <input
                  type="password"
                  value={securityPin}
                  onChange={e => setSecurityPin(e.target.value)}
                  placeholder="الرمز السري المطبوع في PDF..."
                  className="w-full px-3.5 py-2.5 bg-white border border-red-300 rounded-xl text-center text-base font-mono tracking-widest text-stone-900 focus:ring-2 focus:ring-red-500 focus:outline-none"
                  disabled={isSubmitting}
                />
              </div>
            </div>

            {/* Boutons d'Action */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-200">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                disabled={isSubmitting}
                className="px-4 py-2.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-bold transition-colors cursor-pointer"
              >
                إلغاء
              </button>

              <button
                type="button"
                onClick={handleCreateSession}
                disabled={isSubmitting || !securityPin.trim()}
                className="px-5 py-2.5 rounded-xl bg-[#E87524] hover:bg-[#D46317] text-white text-xs font-black transition-all flex items-center gap-2 cursor-pointer shadow-md disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>جاري التجهيز والأرشفة...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>تأكيد، أرشفة وبدء الاستخدام الجديد</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2 : FORMATAGE COMPLET DGI                                           */}
      {/* ========================================================================= */}
      {showFormatModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl border border-red-200 max-w-lg w-full overflow-hidden flex flex-col max-h-[92vh] shadow-2xl">
            {/* Header Rouge Danger */}
            <div className="p-5 bg-gradient-to-r from-red-600 to-red-700 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-base font-black">Formatage Complet (التهيئة الشاملة)</h3>
                  <span className="text-[11px] text-red-100">مسح كافة البيانات والعودة لنقطة الصفر</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !isFormatting && setShowFormatModal(false)}
                className="w-8 h-8 rounded-lg text-white/80 hover:text-white hover:bg-white/10 flex items-center justify-center cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Corps */}
            <div className="p-6 space-y-4 overflow-y-auto flex-1 text-xs">
              <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-red-950 space-y-2">
                <span className="font-black text-sm flex items-center gap-1.5 text-red-700">
                  <ShieldAlert className="w-4 h-4" />
                  <span>تنبيه أمان صارم وميثاق الاستخدام</span>
                </span>
                <p className="leading-relaxed">
                  هذه العملية ستقوم بحذف جميع المنتجات، المبيعات، الصناديق والمستخدمين وإعادة النظام إلى معالج الترحيب الأولي.
                </p>
                <ul className="list-disc pr-5 space-y-1 text-[11px] text-red-800">
                  <li>سيتم إنشاء نسخة احتياطية محلية تلقائية قبل المسح لحماية بياناتك من الضياع التام.</li>
                  <li>لا يمكن تنفيذ هذه العملية بواسطة رمز البائع أو رمز الدخول العادي للمالك.</li>
                  <li>تتطلب هذه العملية حصرياً إدخال الرمز السري المطبوع في ورقة ميثاق الإعداد (Setup Charter PDF).</li>
                </ul>
              </div>

              <label className="flex items-start gap-2.5 p-3 rounded-xl border border-stone-200 bg-stone-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasAgreedFormat}
                  onChange={e => setHasAgreedFormat(e.target.checked)}
                  className="mt-0.5 rounded text-red-600 focus:ring-red-500 w-4 h-4 accent-red-600 cursor-pointer"
                />
                <span className="text-xs font-bold text-stone-800 leading-relaxed">
                  أؤكد موافقتي التامة على الشروط، وأرغب في تنزيل نسخة احتياطية ومسح كافة البيانات للعودة إلى نقطة الصفر.
                </span>
              </label>

              {hasAgreedFormat && (
                <div className="p-4 bg-[#FFF8EF] border border-[#E9DCCB] rounded-2xl space-y-2 animate-in fade-in duration-200">
                  <label className="block font-bold text-stone-800 flex items-center gap-1.5">
                    <Key className="w-4 h-4 text-[#E87524]" />
                    <span>أدخل الرمز السري لقاعدة البيانات (المطبوع في ورقة Setup PDF) :</span>
                  </label>
                  <p className="text-[11px] text-stone-500">
                    أدخل الرمز السري المكون من 6 أرقام الموجود في وثيقة "DOCUMENT CONFIDENTIEL D'INITIALISATION" التي قمت بحفظها أول مرة.
                  </p>
                  <input
                    type="password"
                    value={formatSecret}
                    onChange={e => setFormatSecret(e.target.value)}
                    placeholder="الرمز السري المطبوع..."
                    className="w-full p-2.5 bg-white border border-[#E9DCCB] rounded-xl text-center text-lg font-mono tracking-widest text-stone-900 focus:border-red-500 focus:ring-2 focus:ring-red-500 focus:outline-none"
                    disabled={isFormatting}
                  />
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="p-4 border-t border-stone-200 bg-stone-50 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowFormatModal(false)}
                disabled={isFormatting}
                className="px-4 py-2 bg-stone-200 hover:bg-stone-300 text-stone-800 font-bold rounded-xl text-xs transition-colors cursor-pointer"
              >
                إلغاء وتراجع
              </button>

              <button
                type="button"
                onClick={handleExecuteFormatageComplet}
                disabled={!hasAgreedFormat || !formatSecret.trim() || isFormatting}
                className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs flex items-center gap-2 disabled:opacity-50 transition-all cursor-pointer shadow-md"
              >
                {isFormatting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>جاري التنسيق والمسح...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>حفظ نسخة احتياطية ثم مسح كل شيء</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3 : SUPPRESSION D'UN DOSSIER D'ARCHIVE                              */}
      {/* ========================================================================= */}
      {archiveToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl border border-red-200 max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 border-b border-stone-200 pb-3">
              <div className="w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-stone-900">حذف مجلد الأرشيف نهائياً</h3>
                <span className="text-[11px] text-stone-500">{archiveToDelete.name}</span>
              </div>
            </div>

            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-900 space-y-1">
              <span className="font-bold block">تحذير أمان :</span>
              <span>
                سيتم حذف كافة التقارير وسجلات النشاط ونسخة قاعدة البيانات الخاصة بهذا الأرشيف من القرص الصلب نهائياً.
              </span>
            </div>

            <div className="space-y-1.5 text-xs">
              <label className="block font-bold text-stone-800">
                أدخل الرمز السري من ورقة ميثاق الإعداد الأولي (Setup Charter PDF) :
              </label>
              <input
                type="password"
                value={deleteSecret}
                onChange={e => setDeleteSecret(e.target.value)}
                placeholder="الرمز السري المطبوع..."
                className="w-full px-3.5 py-2.5 bg-[#FFF8EF]/50 border border-[#E9DCCB] rounded-xl text-center text-sm font-mono tracking-widest text-stone-900 focus:ring-2 focus:ring-red-500 focus:outline-none"
                disabled={isDeletingArchive}
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-200">
              <button
                type="button"
                onClick={() => setArchiveToDelete(null)}
                disabled={isDeletingArchive}
                className="px-4 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-bold transition-colors cursor-pointer"
              >
                إلغاء
              </button>

              <button
                type="button"
                onClick={handleDeleteArchive}
                disabled={isDeletingArchive || !deleteSecret.trim()}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
              >
                {isDeletingArchive ? 'جاري الحذف...' : 'تأكيد الحذف النهائي'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
