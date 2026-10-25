import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Key,
  Copy,
  Check,
  RotateCcw,
  Calendar,
  Building2,
  HardDrive,
  Info,
  CheckCircle2,
  Sparkles
} from 'lucide-react';
import { licenseService, LicenseStatusResponse } from '../../services/license.service';
import { LicenseActivationModal } from '../license/LicenseActivationModal';

export const LicenseSettingsSection: React.FC = () => {
  const [status, setStatus] = useState<LicenseStatusResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const res = await licenseService.getStatus(true);
      setStatus(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleCopyHwid = async () => {
    if (!status?.hwid) return;
    try {
      await navigator.clipboard.writeText(status.hwid);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center text-stone-500 gap-2">
        <div className="w-4 h-4 border-2 border-[#E87524] border-t-transparent rounded-full animate-spin" />
        <span className="text-xs">جاري فحص حالة الترخيص والحماية...</span>
      </div>
    );
  }

  const isLicensed = status?.is_licensed ?? false;

  return (
    <div className="space-y-6 text-right" dir="rtl">
      {/* En-tête Statut */}
      <div className={`p-6 rounded-2xl border transition-all ${
        isLicensed
          ? 'bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent border-emerald-500/30'
          : 'bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent border-amber-500/30'
      }`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-4 space-x-reverse">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm ${
              isLicensed
                ? 'bg-emerald-500/20 text-emerald-600 border border-emerald-500/30'
                : 'bg-amber-500/20 text-amber-600 border border-amber-500/30'
            }`}>
              {isLicensed ? <ShieldCheck className="w-8 h-8" /> : <ShieldAlert className="w-8 h-8" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-stone-900">
                  {isLicensed
                    ? 'البرنامج مرخص ومفعل رسمياً'
                    : status?.is_trial_active
                    ? 'البرنامج يعمل بالنسخة التجريبية (Démo)'
                    : 'النسخة غير مفعلة (انتهت التجربة)'}
                </h3>
                <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                  isLicensed
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                    : status?.is_trial_active
                    ? 'bg-amber-100 text-amber-800 border-amber-300'
                    : 'bg-red-100 text-red-800 border-red-300'
                }`}>
                  {isLicensed
                    ? (status?.is_lifetime ? 'مدى الحياة (LIFETIME)' : 'ترخيص سنوي')
                    : status?.is_trial_active
                    ? `فترة تجريبية (متبقي ${status?.trial_days_remaining} أيام)`
                    : 'انتهت الفترة التجريبية'}
                </span>
              </div>
              <p className="text-xs text-stone-500 mt-1">
                نظام الحماية الرقمية Aegis Shield v2 — توقيع مشفر HMAC-SHA256 مربوط بالعتاد
              </p>
            </div>
          </div>

          <button
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2.5 bg-[#E87524] hover:bg-[#D46317] text-white text-xs font-bold rounded-xl shadow-sm transition-all flex items-center justify-center gap-2"
          >
            <Key className="w-4 h-4" />
            <span>{isLicensed ? 'تجديد أو تغيير المفتاح' : 'تنشيط النسخة الآن'}</span>
          </button>
        </div>
      </div>

      {/* Grille des Détails du Matériel & Licence */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Identifiant Matériel HWID */}
        <div className="p-4 bg-stone-50 border border-stone-200 rounded-xl space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-stone-700 flex items-center gap-1.5">
              <HardDrive className="w-4 h-4 text-[#E87524]" />
              <span>معرف الجهاز المشفر (HWID) :</span>
            </span>
            <button
              onClick={handleCopyHwid}
              className={`text-[11px] px-2.5 py-1 rounded font-bold flex items-center gap-1 transition-all ${
                copied
                  ? 'bg-emerald-600 text-white'
                  : 'bg-stone-200 hover:bg-stone-300 text-stone-700'
              }`}
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'تم النسخ!' : 'نسخ'}</span>
            </button>
          </div>
          <div className="p-2.5 bg-white border border-stone-300 rounded-lg font-mono text-xs font-bold text-stone-800 tracking-wider text-center select-all">
            {status?.hwid || '—'}
          </div>
          <p className="text-[10px] text-stone-500">
            هذا الرمز يتولد حصرياً من اللوحة الأم ومعالج هذا الحاسوب لضمان عدم تشغيل البرنامج على أجهزة أخرى.
          </p>
        </div>

        {/* Détails du Magasin & Validité */}
        <div className="p-4 bg-stone-50 border border-stone-200 rounded-xl space-y-3">
          <span className="text-xs font-bold text-stone-700 flex items-center gap-1.5">
            <Building2 className="w-4 h-4 text-[#E87524]" />
            <span>معلومات الترخيص :</span>
          </span>

          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between py-1 border-b border-stone-200">
              <span className="text-stone-500">المتجر المرخص له :</span>
              <span className="font-bold text-stone-800">{status?.store_name || (status?.is_trial_active ? 'نسخة تجريبية للمحل' : 'غير مسجل')}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-stone-200">
              <span className="text-stone-500">الحالة / الصلاحية :</span>
              <span className="font-semibold text-stone-800">
                {status?.is_lifetime ? 'مدى الحياة (دائم)' : status?.expires_at || (status?.is_trial_active ? `تجربة مجانية (${status.trial_days_remaining} أيام)` : 'منتهية')}
              </span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-stone-500">الأيام المتبقية :</span>
              <span className="font-bold text-emerald-700">
                {status?.is_lifetime ? '∞ غير محدودة' : status?.days_remaining !== undefined ? `${status.days_remaining} يوم` : status?.is_trial_active ? `${status?.trial_days_remaining} يوم تجريبي` : '0 يوم'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Information d'assistance client */}
      <div className="p-4 bg-stone-50 border border-stone-200 rounded-xl text-xs space-y-2 text-stone-700">
        <div className="flex items-center gap-1.5 font-bold text-stone-800">
          <Info className="w-4 h-4 text-[#E87524]" />
          <span>الدعم الفني وتفعيل الترخيص :</span>
        </div>
        <p className="text-[11px] leading-relaxed text-stone-600">
          لتفعيل النسخة الدائمة أو تمديد صلاحية البرنامج، انسخ معرّف الجهاز (HWID) وتواصل مع الموزع المعتمد لاستلام مفتاح التفعيل الرسمي الخاص بمحلك.
        </p>
      </div>

      {/* Modale d'activation */}
      <LicenseActivationModal
        isOpen={isModalOpen}
        canClose={true}
        onClose={() => setIsModalOpen(false)}
        onActivated={(newStatus) => {
          setStatus(newStatus);
          setIsModalOpen(false);
        }}
      />
    </div>
  );
};
