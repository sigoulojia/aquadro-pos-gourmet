// Aquadro POS Algérie — Fenêtre de Gestion & Activation de Licence (Design Harmonisé)
// S'intègre naturellement avec le design system Gourmet (#FFF8EF, bordures #E9DCCB, accent #E87524)

import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Copy,
  Check,
  Key,
  Lock,
  Sparkles,
  AlertCircle,
  ClipboardPaste,
  X,
  PhoneCall,
  CheckCircle2,
  Clock,
  ArrowRight,
  HardDrive,
  Building2,
  Calendar,
  Layers
} from 'lucide-react';
import { licenseService, LicenseStatusResponse } from '../../services/license.service';

interface LicenseActivationModalProps {
  isOpen: boolean;
  canClose?: boolean;
  onClose?: () => void;
  onActivated?: (status: LicenseStatusResponse) => void;
}

export const LicenseActivationModal: React.FC<LicenseActivationModalProps> = ({
  isOpen,
  canClose = false,
  onClose,
  onActivated,
}) => {
  const [currentStatus, setCurrentStatus] = useState<LicenseStatusResponse | null>(null);
  const [hwid, setHwid] = useState<string>('');
  const [licenseKey, setLicenseKey] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successStatus, setSuccessStatus] = useState<LicenseStatusResponse | null>(null);

  const refreshStatus = async () => {
    try {
      const status = await licenseService.getStatus(true);
      setCurrentStatus(status);
      setHwid(status.hwid || '');
      if (status.is_licensed) {
        setSuccessStatus(status);
      } else {
        setSuccessStatus(null);
      }
    } catch {
      setHwid('AQ-ERREUR-LECTURE-HWID');
    }
  };

  useEffect(() => {
    if (isOpen) {
      refreshStatus();
      setError(null);
      setLicenseKey('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCopyHwid = async () => {
    try {
      await navigator.clipboard.writeText(hwid);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      const input = document.createElement('input');
      input.value = hwid;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    }
  };

  const handlePasteKey = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setLicenseKey(text.trim());
        setError(null);
      }
    } catch {
      // Ignore
    }
  };

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanKey = licenseKey.trim();
    if (!cleanKey) {
      setError('يرجى إدخال مفتاح الترخيص المشفر');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await licenseService.activate(cleanKey);
      if (result.success && result.status.is_licensed) {
        setSuccessStatus(result.status);
        setCurrentStatus(result.status);
        if (onActivated) {
          onActivated(result.status);
        }
      } else {
        setError(result.message || 'فشل تنشيط الترخيص. تأكد من صحة المفتاح ومطابقته لمعرف هذا الجهاز.');
      }
    } catch (err: any) {
      const msg = err?.message || String(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const isLicensed = currentStatus?.is_licensed;
  const isTrialActive = currentStatus?.is_trial_active && !isLicensed;
  const isTrialExpired = currentStatus?.is_trial_expired && !isLicensed;
  const canSkip = isTrialActive || canClose || isLicensed;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div
        className="w-full max-w-xl bg-white rounded-3xl shadow-2xl border border-[#E9DCCB] overflow-hidden flex flex-col text-right"
        dir="rtl"
      >
        {/* ========================================================================= */}
        {/* 1. EN-TÊTE HARMONISÉ GOURMET POS                                         */}
        {/* ========================================================================= */}
        <div className="px-6 py-5 bg-[#FFF8EF] border-b border-[#E9DCCB] flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-2xs border ${
              isLicensed
                ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                : isTrialActive
                ? 'bg-[#FFF3EB] text-[#E87524] border-[#E87524]/30'
                : 'bg-red-50 text-red-600 border-red-200'
            }`}>
              {isLicensed ? (
                <ShieldCheck className="w-6 h-6" />
              ) : isTrialActive ? (
                <Key className="w-6 h-6 text-[#E87524]" />
              ) : (
                <Lock className="w-6 h-6" />
              )}
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-[#292522]">
                  {isLicensed
                    ? 'تجديد أو تغيير مفتاح الترخيص'
                    : isTrialActive
                    ? 'تنشيط النسخة الرسمية للمحل'
                    : 'تنشيط رخصة النظام'}
                </h3>
                <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border shadow-2xs ${
                  isLicensed
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                    : isTrialActive
                    ? 'bg-amber-100 text-amber-800 border-amber-300'
                    : 'bg-red-100 text-red-800 border-red-300'
                }`}>
                  {isLicensed
                    ? (currentStatus?.is_lifetime ? 'مدى الحياة LIFETIME' : 'ترخيص سنوي')
                    : isTrialActive
                    ? `تجريبي (${currentStatus?.trial_days_remaining} أيام)`
                    : 'غير مفعل'}
                </span>
              </div>
              <p className="text-xs text-stone-500 mt-0.5">
                نظام الحماية الرقمية Aegis Shield — توقيع مشفر HMAC-SHA256 مربوط بعتاد الحاسوب
              </p>
            </div>
          </div>

          {canSkip && onClose && (
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl text-stone-400 hover:text-stone-700 hover:bg-stone-200/60 transition-colors flex items-center justify-center cursor-pointer"
              title="إغلاق"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* ========================================================================= */}
        {/* 2. CORPS DU MODAL                                                         */}
        {/* ========================================================================= */}
        <div className="p-6 space-y-4 max-h-[82vh] overflow-y-auto">
          {/* Bannière Démo ou Expiré */}
          {isTrialActive && !successStatus && (
            <div className="p-3 bg-amber-50/80 border border-amber-200/90 rounded-2xl flex items-center justify-between text-xs text-amber-900">
              <div className="flex items-center gap-2 font-bold">
                <Clock className="w-4 h-4 text-[#E87524]" />
                <span>أنت حالياً تستخدم الفترة التجريبية المجانية (7 أيام).</span>
              </div>
              <span className="bg-[#E87524] text-white text-[11px] font-black px-2.5 py-0.5 rounded-full shadow-2xs">
                متبقي {currentStatus?.trial_days_remaining} أيام
              </span>
            </div>
          )}

          {isTrialExpired && !successStatus && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-2.5 text-xs text-red-950">
              <ShieldAlert className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold">انتهت فترة التجربة المجانية لهذا الجهاز.</p>
                <p className="text-[11px] text-red-700 leading-relaxed">
                  لمتابعة استخدام النظام وحفظ المعاملات، يرجى نسخ معرّف الجهاز (HWID) أدناه وإرساله للموزع للحصول على مفتاح التفعيل الرسمي.
                </p>
              </div>
            </div>
          )}

          {/* Écran de Succès */}
          {successStatus ? (
            <div className="text-center py-4 space-y-4">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto shadow-sm">
                <CheckCircle2 className="w-9 h-9" />
              </div>

              <div className="space-y-1">
                <h3 className="text-base font-black text-stone-900">
                  تم تنشيط رخصة البرنامج بنجاح لهذا الجهاز !
                </h3>
                <p className="text-xs text-stone-500">
                  النسخة مرخصة ومحمية ضد القرصنة، ومرتبطة ببيانات هذا المحل
                </p>
              </div>

              {/* Détails de la licence */}
              <div className="bg-[#FFF8EF] border border-[#E9DCCB] rounded-2xl p-4 text-xs space-y-2 text-right">
                <div className="flex justify-between items-center py-1.5 border-b border-[#E9DCCB]/60">
                  <span className="text-stone-500 flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-[#E87524]" />
                    <span>المتجر المرخص له :</span>
                  </span>
                  <span className="font-black text-stone-900">{successStatus.store_name || '—'}</span>
                </div>

                <div className="flex justify-between items-center py-1.5 border-b border-[#E9DCCB]/60">
                  <span className="text-stone-500 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-[#E87524]" />
                    <span>نوع الترخيص :</span>
                  </span>
                  <span className="font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-md">
                    {successStatus.is_lifetime ? 'مدى الحياة (LIFETIME)' : successStatus.license_type || 'محدد'}
                  </span>
                </div>

                <div className="flex justify-between items-center py-1.5 border-b border-[#E9DCCB]/60">
                  <span className="text-stone-500 flex items-center gap-1.5">
                    <HardDrive className="w-3.5 h-3.5 text-[#E87524]" />
                    <span>معرف الجهاز (HWID) :</span>
                  </span>
                  <span className="font-mono text-stone-700 font-bold text-[11px]">{successStatus.hwid}</span>
                </div>

                <div className="flex justify-between items-center py-1.5">
                  <span className="text-stone-500 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-[#E87524]" />
                    <span>الصلاحية :</span>
                  </span>
                  <span className="font-bold text-stone-800">
                    {successStatus.is_lifetime ? 'دائم وغير محدد' : successStatus.expires_at || '—'}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (onClose) onClose();
                }}
                className="w-full py-3 bg-[#E87524] hover:bg-[#D46317] text-white font-bold rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer text-xs"
              >
                <Check className="w-4 h-4" />
                <span>إغلاق ومتابعة العمل</span>
              </button>
            </div>
          ) : (
            /* Formulaire d'Activation Normal */
            <div className="space-y-4">
              {/* Étape 1 : Identifiant Matériel HWID */}
              <div className="p-4 bg-[#FFF8EF]/70 border border-[#E9DCCB] rounded-2xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-stone-800 flex items-center gap-1.5">
                    <HardDrive className="w-4 h-4 text-[#E87524]" />
                    <span>1. معرّف الجهاز المشفر (HWID الخاص بحاسوبك) :</span>
                  </span>
                  <span className="text-[10px] text-stone-500 bg-white border border-[#E9DCCB] px-2 py-0.5 rounded-full font-medium">
                    بصمة العتاد الفريدة
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-white border border-[#E9DCCB] rounded-xl px-3 py-2 text-stone-900 font-mono text-xs font-bold tracking-wider text-center select-all shadow-2xs" dir="ltr">
                    {hwid || 'جاري قراءة معطيات الجهاز...'}
                  </div>

                  <button
                    type="button"
                    onClick={handleCopyHwid}
                    disabled={!hwid}
                    className={`px-3.5 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer ${
                      copied
                        ? 'bg-emerald-600 text-white'
                        : 'bg-white hover:bg-stone-50 text-stone-700 border border-stone-300'
                    }`}
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>تم النسخ!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-stone-500" />
                        <span>نسخ المعرّف</span>
                      </>
                    )}
                  </button>
                </div>

                <p className="text-[11px] text-stone-500 leading-relaxed">
                  💡 انسخ هذا الرمز وأرسله للموزع المعتمد لاستلام مفتاح التنشيط المخصص لحاسوبك.
                </p>
              </div>

              {/* Étape 2 : Saisie du Code de Licence */}
              <form onSubmit={handleActivate} className="space-y-4">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-stone-800 flex items-center gap-1.5">
                      <Key className="w-3.5 h-3.5 text-[#E87524]" />
                      <span>2. أدخل مفتاح الترخيص (License Key) :</span>
                    </label>

                    <button
                      type="button"
                      onClick={handlePasteKey}
                      className="text-[11px] text-[#E87524] hover:text-[#D46317] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <ClipboardPaste className="w-3.5 h-3.5" />
                      <span>لصق من الحافظة</span>
                    </button>
                  </div>

                  <textarea
                    rows={2}
                    value={licenseKey}
                    onChange={(e) => {
                      setLicenseKey(e.target.value);
                      if (error) setError(null);
                    }}
                    placeholder="الصق المفتاح هنا (يبدأ بـ AQLIC-...)"
                    className="w-full p-3 text-xs font-mono bg-[#FFF8EF]/40 border border-[#E9DCCB] rounded-2xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#E87524] text-stone-800 resize-none transition-all"
                    dir="ltr"
                  />
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-2xl text-xs flex items-start gap-2 animate-in slide-in-from-top-1">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
                    <span className="leading-relaxed">{error}</span>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={loading || !licenseKey.trim()}
                    className="flex-1 py-3 bg-[#E87524] hover:bg-[#D46317] disabled:opacity-50 text-white font-black rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 text-xs cursor-pointer active:scale-98"
                  >
                    {loading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>جاري التحقق والتنشيط...</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4" />
                        <span>{isLicensed ? 'تأكيد تجديد المفتاح' : 'تنشيط البرنامج الآن'}</span>
                      </>
                    )}
                  </button>

                  {canSkip && onClose && (
                    <button
                      type="button"
                      onClick={onClose}
                      className="py-3 px-4 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold rounded-xl transition-all text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <span>{isLicensed ? 'إلغاء' : 'تخطي ومتابعة العمل'}</span>
                    </button>
                  )}
                </div>
              </form>
            </div>
          )}

          {/* ========================================================================= */}
          {/* 3. PIED DE PAGE SUPPORT & CONTACT                                         */}
          {/* ========================================================================= */}
          <div className="pt-3 border-t border-stone-200 flex items-center justify-between text-[11px] text-stone-500">
            <span className="flex items-center gap-1.5">
              <PhoneCall className="w-3.5 h-3.5 text-[#E87524]" />
              <span>مصلحة الزبائن والتراخيص : Aquadro Systems Algérie</span>
            </span>
            <span className="text-[10px] bg-stone-100 text-stone-600 px-2.5 py-0.5 rounded-full font-mono">
              v1.0.8 • 2026
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
