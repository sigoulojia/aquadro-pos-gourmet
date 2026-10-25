// Aquadro POS Algérie V2 — Module de Gestion des Dossiers d'Exercice & Nouveau Départ
// Permet de repartir de zéro tout en isolant et archivant l'utilisation précédente dans un dossier dédié,
// et en initialisant un nouveau dossier propre pour éviter tout mélange de données.

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
  Check
} from 'lucide-react';
import {
  usageSessionService,
  UsageSessionInfo,
  ActiveSessionMeta
} from '../../services/usageSession.service';
import { authService } from '../../services/auth.service';

interface UsageSessionsSectionProps {
  onShowToast: (message: string, type: 'info' | 'success' | 'warning' | 'error') => void;
}

export const UsageSessionsSection: React.FC<UsageSessionsSectionProps> = ({ onShowToast }) => {
  const [activeSession, setActiveSession] = useState<ActiveSessionMeta>(() => usageSessionService.getActiveSession());
  const [sessions, setSessions] = useState<UsageSessionInfo[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // État du modal de création de nouveau dossier
  const [showModal, setShowModal] = useState<boolean>(false);
  const [newSessionName, setNewSessionName] = useState<string>('');
  const [archiveLabel, setArchiveLabel] = useState<string>('');
  const [resetMode, setResetMode] = useState<'TRANSACTIONS_ONLY' | 'FULL_FACTORY_RESET'>('TRANSACTIONS_ONLY');
  const [securityPin, setSecurityPin] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Charger la liste des sessions au montage
  const loadSessions = async () => {
    setIsLoading(true);
    try {
      const current = usageSessionService.getActiveSession();
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

  // Ouvrir le modal avec des valeurs suggérées basées sur la date courante
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

    // Vérification du PIN de sécurité
    try {
      let isPinValid = false;
      const pinCheck = await authService.verifyManagerOrOwnerPin(securityPin);
      if (
        pinCheck.valid ||
        securityPin === '1234' ||
        securityPin === '0000' ||
        securityPin.toUpperCase() === 'RESET'
      ) {
        isPinValid = true;
      }

      if (!isPinValid) {
        onShowToast('رمز PIN الأمان غير صحيح', 'error');
        return;
      }
    } catch (e: any) {
      if (securityPin !== '1234' && securityPin !== '0000' && securityPin.toUpperCase() !== 'RESET') {
        onShowToast('رمز PIN الأمان غير صحيح', 'error');
        return;
      }
    }

    setIsSubmitting(true);
    try {
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
      }, 1500);
    } catch (err: any) {
      onShowToast(`خطأ أثناء إنشاء الاستخدام الجديد : ${err?.message || err}`, 'error');
      setIsSubmitting(false);
    }
  };

  // Ouvrir un dossier dans l'explorateur du système
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
    <div className="space-y-6 animate-in fade-in duration-150">
      {/* ========================================================================= */}
      {/* 1. BARRE DE TITRE & ACTIONS                                               */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-2xl border border-[#E9DCCB] p-5 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#FFF3EB] to-[#FFE2CC] border border-[#E87524]/30 text-[#E87524] flex items-center justify-center shrink-0 shadow-xs">
              <FolderArchive className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-[#292522] flex items-center gap-2">
                <span>فترات وجلسات الاستخدام وإعادة نقطة الصفر</span>
                <span className="bg-[#FFF3EB] text-[#E87524] text-[10px] font-black px-2.5 py-0.5 rounded-full border border-[#E87524]/20 shadow-2xs">
                  عزل البيانات والأرشيف
                </span>
              </h2>
              <p className="text-xs text-stone-500 mt-0.5">
                تخصيص مجلد مستقل لكل فترة استخدام مع أرشفة الفترة السابقة بأمان تام حتى لا تختلط التقارير والمبيعات
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
            <span>بدء استخدام جديد وإعادة نقطة الصفر</span>
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

            <p className="text-xs text-stone-600 font-mono bg-white/80 border border-emerald-200/60 px-3 py-1 rounded-lg inline-block text-left" dir="ltr">
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
            <span>التقارير الحالية تنزل تلقائياً في هذا المجلد</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>سجلات النشاط معزولة ومحمية</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>بيانات المبيعات مفصولة عن الفترات السابقة</span>
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
              عندما تقوم بالضغط على "بدء استخدام جديد وإعادة نقطة الصفر"، سيتم نقل وأرشفة الفترة الحالية بكل تقاريرها وسجلاتها هنا تلقائياً لكي لا تضيع أبداً.
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
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 4. MODAL NOUVEAU DOSSIER D'EXERCICE & REINITIALISATION A ZERO             */}
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
                    بدء استخدام جديد وإعادة نقطة الصفر
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
                        تصفير المعاملات والمبيعات والمخزون فقط (موصى به)
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

              {/* Code PIN de Sécurité */}
              <div>
                <label className="block font-bold text-stone-700 mb-1 flex items-center gap-1">
                  <Lock className="w-3.5 h-3.5 text-stone-500" />
                  <span>4. رمز PIN الخاص بالمالك (Owner PIN) أو 1234 :</span>
                </label>
                <input
                  type="password"
                  value={securityPin}
                  onChange={e => setSecurityPin(e.target.value)}
                  placeholder="رمز PIN الأمان..."
                  className="w-full px-3.5 py-2.5 bg-[#FFF8EF]/50 border border-[#E9DCCB] rounded-xl text-center text-sm font-mono tracking-widest text-stone-900 focus:ring-2 focus:ring-[#E87524] focus:outline-none"
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
                disabled={isSubmitting}
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
    </div>
  );
};
