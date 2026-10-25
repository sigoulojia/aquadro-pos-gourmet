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
  ArrowRight
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
      setHwid(status.hwid);
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
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCopyHwid = async () => {
    try {
      await navigator.clipboard.writeText(hwid);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      const input = document.createElement('input');
      input.value = hwid;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handlePasteKey = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setLicenseKey(text.trim());
      }
    } catch {
      // Ignore
    }
  };

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanKey = licenseKey.trim();
    if (!cleanKey) {
      setError('الرجاء إدخال مفتاح الترخيص المشفر');
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
        setError(result.message || 'فشل تنشيط الترخيص. تأكد من صحة المفتاح.');
      }
    } catch (err: any) {
      const msg = err?.message || String(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const isTrialActive = currentStatus?.is_trial_active && !currentStatus?.is_licensed;
  const isTrialExpired = currentStatus?.is_trial_expired && !currentStatus?.is_licensed;
  const canSkip = isTrialActive || canClose;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/85 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div
        className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-stone-200 overflow-hidden flex flex-col"
        dir="rtl"
      >
        {/* Header مع Dégradé أسطوري */}
        <div className="relative bg-gradient-to-r from-stone-900 via-stone-800 to-amber-950 p-6 text-white text-right">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3 space-x-reverse">
              <div className="w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-inner">
                {successStatus ? (
                  <ShieldCheck className="w-7 h-7 text-emerald-400" />
                ) : isTrialActive ? (
                  <Clock className="w-7 h-7 text-amber-400 animate-pulse" />
                ) : (
                  <Lock className="w-6 h-6 text-red-400" />
                )}
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                  <span>{successStatus ? 'البرنامج مرخص بالكامل' : isTrialActive ? 'تفعيل النسخة التجريبية (Démo)' : 'تنشيط رخصة النظام'}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono border ${
                    successStatus
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                      : isTrialActive
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                      : 'bg-red-500/20 text-red-300 border-red-500/30'
                  }`}>
                    {successStatus ? 'OFFICIAL' : isTrialActive ? `TRIAL ${currentStatus?.trial_days_remaining || 7}J` : 'LOCKED'}
                  </span>
                </h2>
                <p className="text-xs text-stone-300 mt-0.5">
                  Aquadro POS Algérie — حماية مشفرة ومربوطة بخصائص العتاد (HWID)
                </p>
              </div>
            </div>

            {canSkip && onClose && (
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-stone-400 hover:text-white hover:bg-white/10 transition-colors"
                title="إغلاق"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* Corps de la modale */}
        <div className="p-6 space-y-4 flex-1 overflow-y-auto max-h-[80vh]">
          {/* Bannière de Statut Démo ou Expiré */}
          {isTrialActive && !successStatus && (
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-300/80 rounded-xl p-3 text-right flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-amber-900 font-bold">
                <Clock className="w-4 h-4 text-[#E87524]" />
                <span>أنت حالياً في الفترة التجريبية المجانية (7 أيام).</span>
              </div>
              <span className="bg-[#E87524] text-white text-xs font-black px-2.5 py-0.5 rounded-full shadow-xs">
                متبقي {currentStatus?.trial_days_remaining} أيام
              </span>
            </div>
          )}

          {isTrialExpired && !successStatus && (
            <div className="bg-red-50 border border-red-300 rounded-xl p-3.5 text-right flex items-start gap-2.5 text-red-900 text-xs">
              <ShieldAlert className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold">⚠️ انتهت فترة التجربة المجانية (7 أيام) لهذا الحاسوب.</p>
                <p className="text-[11px] text-red-700 leading-relaxed">
                  تم قفل النظام لحماية بياناتك وحقوق النسخة. للحصول على مفتاح التنشيط الدائم ومتابعة نشاط المحل، يرجى نسخ كود جهازك (HWID) أدناه وإرساله إلى الموزع المعتمد لاستلام مفتاح التفعيل الرسمي.
                </p>
              </div>
            </div>
          )}

          {successStatus ? (
            /* Écran de Succès */
            <div className="text-center py-6 space-y-4">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-lg animate-bounce">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-stone-900">
                  تم تنشيط البرنامج بنجاح لهذا الجهاز !
                </h3>
                <p className="text-xs text-stone-500">
                  النسخة أصبحت مرخصة بالكامل ومحمية ضد القرصنة
                </p>
              </div>

              <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 text-xs space-y-2 text-right">
                <div className="flex justify-between items-center py-1 border-b border-stone-200">
                  <span className="text-stone-500">اسم المتجر / المحل :</span>
                  <span className="font-bold text-stone-800">{successStatus.store_name || '—'}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-stone-200">
                  <span className="text-stone-500">نوع الترخيص :</span>
                  <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                    {successStatus.is_lifetime ? 'مدى الحياة (LIFETIME)' : successStatus.license_type || 'محدد'}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-stone-200">
                  <span className="text-stone-500">معرف الجهاز المرخص (HWID) :</span>
                  <span className="font-mono text-stone-600 font-semibold">{successStatus.hwid}</span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-stone-500">الصلاحية :</span>
                  <span className="font-semibold text-stone-700">
                    {successStatus.is_lifetime ? 'غير محددة (دائم)' : successStatus.expires_at || '—'}
                  </span>
                </div>
              </div>

              <button
                onClick={() => {
                  if (onClose) onClose();
                }}
                className="w-full mt-4 py-3 bg-[#E87524] hover:bg-[#D46317] text-white font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                <span>متابعة استخدام البرنامج</span>
              </button>
            </div>
          ) : (
            /* Écran d'Activation Normal */
            <>
              {/* Carte HWID - Empreinte Matérielle */}
              <div className="bg-gradient-to-br from-amber-50 to-orange-50/50 border border-amber-200/80 rounded-xl p-4 text-right space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-amber-600" />
                    <span>رمز الجهاز الفريد (HWID الخاص بحاسوبك) :</span>
                  </span>
                  <span className="text-[10px] text-amber-700 bg-amber-100/80 px-2 py-0.5 rounded-full font-medium">
                    غير قابل للتكرار
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-white border border-amber-300 rounded-lg px-3 py-2 text-stone-900 font-mono text-sm font-bold tracking-wider text-center select-all shadow-sm">
                    {hwid || 'جاري قراءة معطيات الجهاز...'}
                  </div>

                  <button
                    type="button"
                    onClick={handleCopyHwid}
                    disabled={!hwid}
                    className={`px-3 py-2 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all shadow-sm ${
                      copied
                        ? 'bg-emerald-600 text-white'
                        : 'bg-[#E87524] hover:bg-[#D46317] text-white'
                    }`}
                  >
                    {copied ? (
                      <>
                        <Check className="w-4 h-4" />
                        <span>تم النسخ!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        <span>نسخ الرمز</span>
                      </>
                    )}
                  </button>
                </div>

                <p className="text-[11px] text-stone-600 leading-relaxed pt-1">
                  💡 <strong>كيفية التنشيط :</strong> انسخ هذا الرمز وأرسله إلى الموزع المعتمد لاستلام مفتاح التنشيط المشفر الخاص بجهازك ومحلك ومحمي من الاستعمال على أي حاسوب آخر.
                </p>
              </div>

              {/* Formulaire de saisie de clé */}
              <form onSubmit={handleActivate} className="space-y-4 text-right">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-stone-800 flex items-center gap-1">
                      <Lock className="w-3.5 h-3.5 text-[#E87524]" />
                      <span>مفتاح الترخيص المشفر (License Key) :</span>
                    </label>
                    <button
                      type="button"
                      onClick={handlePasteKey}
                      className="text-[11px] text-[#E87524] hover:text-[#D46317] font-semibold flex items-center gap-1 transition-colors"
                    >
                      <ClipboardPaste className="w-3.5 h-3.5" />
                      <span>لصق من الحافظة</span>
                    </button>
                  </div>

                  <textarea
                    rows={2}
                    value={licenseKey}
                    onChange={(e) => setLicenseKey(e.target.value)}
                    placeholder="الصق هنا المفتاح الذي يبدأ بـ AQLIC-..."
                    className="w-full p-2.5 text-xs font-mono bg-stone-50 border border-stone-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#E87524] focus:border-transparent text-stone-800 resize-none transition-all"
                  />
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl text-xs flex items-start gap-2 animate-in slide-in-from-top-1">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
                    <span className="leading-relaxed">{error}</span>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={loading || !licenseKey.trim()}
                    className="flex-1 py-3 bg-[#E87524] hover:bg-[#D46317] disabled:opacity-50 text-white font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 text-xs"
                  >
                    {loading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>جاري التحقق...</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4" />
                        <span>تنشيط البرنامج الآن</span>
                      </>
                    )}
                  </button>

                  {/* Bouton pour sauter pendant l'essai gratuit 7 jours */}
                  {canSkip && onClose && (
                    <button
                      type="button"
                      onClick={onClose}
                      className="py-3 px-4 bg-stone-100 hover:bg-stone-200 text-stone-800 font-bold rounded-xl transition-all text-xs flex items-center justify-center gap-1.5"
                    >
                      <span>تخطي ومتابعة التجربة ({currentStatus?.trial_days_remaining || 7} أيام)</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </form>
            </>
          )}

          {/* Pied de page Support */}
          <div className="pt-3 border-t border-stone-200 flex items-center justify-between text-[11px] text-stone-500">
            <span className="flex items-center gap-1">
              <PhoneCall className="w-3 h-3 text-[#E87524]" />
              <span>مصلحة الزبائن والتراخيص : Aquadro Systems Algérie</span>
            </span>
            <span className="text-[10px] bg-stone-100 text-stone-600 px-2 py-0.5 rounded font-mono">
              Algérie 2026
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
