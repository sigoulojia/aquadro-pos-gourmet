// Aquadro POS Algérie V2 — Assistant de Configuration Initiale (First-Run Wizard)
// Design sobre blanc ERP, conformité fiscale DGI (IFU / Régime Réel) et création sécurisée du compte Propriétaire

import React, { useState, useRef, useEffect } from 'react';
import { SecurityUtil } from '../../core/security/security';
import { printerService } from '../../services/printer.service';
import { authService } from '../../services/auth.service';
import { backupService } from '../../services/backup.service';
import { db } from '../../db/sqlite';
import { AlgeriaCities } from '../../data/AlgeriaCities';
import {
  Building2,
  FileSpreadsheet,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  Pizza,
  Upload
} from 'lucide-react';

interface SetupWizardProps {
  onComplete: () => void;
}

export const SetupWizard: React.FC<SetupWizardProps> = ({ onComplete }) => {
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [hasPrinted, setHasPrinted] = useState(false);
  const [verifyPin, setVerifyPin] = useState('');
  const [generatedDbSecret, setGeneratedDbSecret] = useState('');
  const [isRestoringBackup, setIsRestoringBackup] = useState(false);
  const [pendingRestoreBackup, setPendingRestoreBackup] = useState<{
    content: string;
    storeName: string;
    productsCount: number;
  } | null>(null);
  const [restoreNewPin, setRestoreNewPin] = useState('');
  const [restoreConfirmPin, setRestoreConfirmPin] = useState('');
  const [restorePinError, setRestorePinError] = useState('');
  const backupInputRef = useRef<HTMLInputElement | null>(null);

  // Étape 1 : Identité Magasin
  const [storeName, setStoreName] = useState('');
  const [storeNameAr, setStoreNameAr] = useState('');
  const [legalForm, setLegalForm] = useState('PHYSIQUE');
  const [wilaya, setWilaya] = useState('');
  const [commune, setCommune] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [logo, setLogo] = useState<string | null>(null);

  // Étape 2 : Régime Fiscal
  const [fiscalRegime, setFiscalRegime] = useState<'IFU' | 'REEL'>('IFU');
  const [tvaRate, setTvaRate] = useState<number>(0);
  const [rc, setRc] = useState('');
  const [nif, setNif] = useState('');
  const [nis, setNis] = useState('');
  const [activity, setActivity] = useState('');

  // Étape 3 : Compte Propriétaire
  const [ownerName, setOwnerName] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Si la base de données est déjà configurée et qu'aucun Propriétaire authentifié
  // n'a demandé une reconfiguration, rediriger immédiatement vers l'écran de connexion normal.
  useEffect(() => {
    let mounted = true;
    db.isSetupCompleted()
      .then(alreadyConfigured => {
        if (mounted && alreadyConfigured && authService.getCurrentUser()?.role !== 'owner') {
          localStorage.setItem('aquadro_setup_completed', 'true');
          localStorage.setItem('pizzeria_setup_completed', 'true');
          onComplete();
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [onComplete]);

  const handleRestoreFromSetup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMessage('');
    setRestorePinError('');
    setIsRestoringBackup(true);

    try {
      const content = await file.text();
      // Pré-valider la sauvegarde de manière non destructive avant d'inviter l'utilisateur à définir son PIN
      const validated = backupService.validateAndNormalizeBackup(content);
      const storeNameResolved =
        validated.tables.stores?.[0]?.name_fr ||
        validated.tables.stores?.[0]?.name_ar ||
        'Magasin Aquadro';
      const productsCount = validated.tables.products?.length || 0;

      setPendingRestoreBackup({
        content,
        storeName: storeNameResolved,
        productsCount
      });
      setRestoreNewPin('');
      setRestoreConfirmPin('');
      setRestorePinError('');
    } catch (err: any) {
      setErrorMessage(
        err?.message || 'Impossible de valider ce fichier de sauvegarde. Vos données actuelles sont intactes.'
      );
    } finally {
      setIsRestoringBackup(false);
      if (backupInputRef.current) {
        backupInputRef.current.value = '';
      }
    }
  };

  const handleCancelRestore = () => {
    setPendingRestoreBackup(null);
    setRestoreNewPin('');
    setRestoreConfirmPin('');
    setRestorePinError('');
    if (backupInputRef.current) {
      backupInputRef.current.value = '';
    }
  };

  const handleExecuteRestoreWithPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingRestoreBackup) return;

    setRestorePinError('');

    const pinVal = SecurityUtil.validateNewPin(restoreNewPin);
    if (!pinVal.valid) {
      setRestorePinError(pinVal.error || 'Code PIN non conforme.');
      return;
    }

    if (restoreNewPin !== restoreConfirmPin) {
      setRestorePinError('La confirmation du code PIN ne correspond pas.');
      return;
    }

    setIsRestoringBackup(true);
    try {
      await backupService.restoreBackup(pendingRestoreBackup.content, undefined, {
        fromSetup: true,
        newOwnerPin: restoreNewPin
      });
      localStorage.setItem('aquadro_setup_completed', 'true');
      localStorage.setItem('pizzeria_setup_completed', 'true');
      onComplete();
    } catch (err: any) {
      setRestorePinError(err?.message || 'Erreur lors de la restauration.');
    } finally {
      setIsRestoringBackup(false);
    }
  };

  const handleNextStep1 = (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeName.trim() || !phone.trim()) {
      setErrorMessage('Veuillez renseigner le nom du magasin et le numéro de téléphone.');
      return;
    }
    setErrorMessage('');
    setCurrentStep(2);
  };

  const handleNextStep2 = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMessage('');
    setCurrentStep(3);
  };

  const handleNextStep3 = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    // Rejet strict des codes par défaut (1234, 1111, 5678)
    const pinVal = SecurityUtil.validateNewPin(pin);
    if (!pinVal.valid) {
      setErrorMessage(pinVal.error || 'Code PIN non conforme.');
      return;
    }

    if (pin !== pinConfirm) {
      setErrorMessage('La confirmation du code PIN ne correspond pas.');
      return;
    }
    
    // Générer le secret si pas encore fait
    if (!generatedDbSecret) {
      setGeneratedDbSecret(Math.floor(100000 + Math.random() * 900000).toString());
    }

    setCurrentStep(4);
  };

  const handlePrintCharter = async () => {
    try {
      await printerService.printSetupCharter(storeName, generatedDbSecret);
      setHasPrinted(true);
    } catch (err: any) {
      setErrorMessage(`Erreur d'impression : ${err.message}`);
    }
  };

  const handleFinalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (verifyPin !== pin) {
      setErrorMessage('Le PIN de vérification est incorrect.');
      return;
    }

    try {
      // Vérifier si la base est déjà configurée sans session Propriétaire active :
      // si oui, basculer directement vers l'écran de connexion normal sans écraser la base.
      const alreadyConfigured = await db.isSetupCompleted();
      if (alreadyConfigured && authService.getCurrentUser()?.role !== 'owner') {
        localStorage.setItem('aquadro_setup_completed', 'true');
        localStorage.setItem('pizzeria_setup_completed', 'true');
        onComplete();
        return;
      }

      // Setup payload matching Rust struct
      const payload = {
        store_name_fr: storeName,
        store_name_ar: storeNameAr,
        address: address,
        wilaya: wilaya,
        commune: commune,
        phone: phone,
        email: email.trim() || null,
        rc: rc,
        nif: nif,
        nis: nis,
        activity: activity,
        fiscal_regime: fiscalRegime,
        tva_rate: fiscalRegime === 'IFU' ? 0 : tvaRate,
        owner_name: ownerName,
        owner_phone: ownerPhone,
        owner_pin: pin,
      };

      // 1. Sauvegarder le DB Secret dans le Keyring OS (Rust) et localStorage
      try {
        await authService.setupDbSecret(generatedDbSecret);
      } catch (keyringErr) {
        console.warn('Keyring non disponible, sauvegarde locale:', keyringErr);
      }
      if (generatedDbSecret) {
        localStorage.setItem('aquadro_db_secret_key', generatedDbSecret);
      }

      // Sauvegarder le logo du magasin s'il a été sélectionné
      if (logo) {
        localStorage.setItem('aquadro_store_logo', logo);
        localStorage.setItem('pizzeria_store_logo', logo);
        window.dispatchEvent(new Event('store_logo_updated'));
      }

      // 2. Exécuter l'initialisation atomique de la BDD via authService (transmet le token Propriétaire si présent)
      await authService.completeSetup(payload);

      // 3. Connexion automatique pour ne pas avoir à retaper le PIN
      await authService.loginWithPin(pin);

      localStorage.setItem('aquadro_setup_completed', 'true');
      localStorage.setItem('pizzeria_setup_completed', 'true');
      onComplete();
    } catch (err: any) {
      setErrorMessage(`Erreur d'initialisation : ${err}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 select-none">
      <div className="bg-white border border-gray-300 w-full max-w-2xl rounded shadow-2xl overflow-hidden flex flex-col text-xs text-gray-800">
        {/* En-tête Wizard */}
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <Pizza className="w-5 h-5 text-[#E87524]" />
              <span>Assistant d'Installation Initiale • Pizzeria POS Algérie</span>
            </h2>
            <p className="text-[11px] text-gray-500">
              Configuration de la pizzeria / restaurant, du régime fiscal DGI et du compte Propriétaire
            </p>
          </div>

          <div className="flex items-center space-x-2 font-mono text-xs">
            <span className={`px-2.5 py-1 rounded font-bold ${currentStep === 1 ? 'bg-[#E87524] text-white' : 'bg-gray-200 text-gray-600'}`}>1</span>
            <span className="text-gray-400">→</span>
            <span className={`px-2.5 py-1 rounded font-bold ${currentStep === 2 ? 'bg-[#E87524] text-white' : 'bg-gray-200 text-gray-600'}`}>2</span>
            <span className="text-gray-400">→</span>
            <span className={`px-2.5 py-1 rounded font-bold ${currentStep === 3 ? 'bg-[#E87524] text-white' : 'bg-gray-200 text-gray-600'}`}>3</span>
            <span className="text-gray-400">→</span>
            <span className={`px-2.5 py-1 rounded font-bold ${currentStep === 4 ? 'bg-[#E87524] text-white' : 'bg-gray-200 text-gray-600'}`}>4</span>
          </div>
        </div>

        {/* Message d'erreur */}
        {errorMessage && (
          <div className="mx-6 mt-4 p-3 rounded bg-red-50 border border-red-200 flex items-center space-x-2 text-red-800 text-xs">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Corps */}
        <div className="p-6">
          {pendingRestoreBackup ? (
            <div data-testid="restore-pin-setup-card" className="space-y-4">
              <div className="flex items-center space-x-2 text-[#E87524] font-bold border-b border-gray-200 pb-2">
                <ShieldCheck className="w-5 h-5" />
                <span className="text-sm">Restauration de Sauvegarde — Nouveau code PIN Propriétaire</span>
              </div>

              <div className="p-3.5 rounded border border-orange-200 bg-orange-50/80 space-y-2">
                <div className="flex items-center gap-2 font-bold text-gray-900 text-xs">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Fichier de sauvegarde validé avec succès</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-gray-700 pt-1">
                  <div>
                    <span className="text-gray-500">Établissement : </span>
                    <strong className="text-gray-900">{pendingRestoreBackup.storeName}</strong>
                  </div>
                  <div>
                    <span className="text-gray-500">Articles / Produits : </span>
                    <strong className="text-gray-900">{pendingRestoreBackup.productsCount}</strong>
                  </div>
                </div>
                <div className="text-[11px] text-gray-600 pt-1 border-t border-orange-200 leading-relaxed">
                  Pour garantir un accès sécurisé immédiat, définissez le nouveau code PIN du compte Propriétaire (4 à 8 chiffres). L'ancien code contenu dans la sauvegarde sera remplacé de façon atomique et sécurisée.
                </div>
              </div>

              {restorePinError && (
                <div className="p-3 rounded bg-red-50 border border-red-200 flex items-center space-x-2 text-red-800 text-xs">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>{restorePinError}</span>
                </div>
              )}

              <form onSubmit={handleExecuteRestoreWithPin} className="space-y-4">
                <div>
                  <label htmlFor="restore-new-pin" className="block font-bold text-gray-700 mb-1">
                    Nouveau code PIN Propriétaire (4 à 8 chiffres) <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="restore-new-pin"
                    data-testid="restore-new-pin"
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={8}
                    required
                    value={restoreNewPin}
                    onChange={e => setRestoreNewPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="••••"
                    className="w-full p-2.5 border border-gray-300 rounded text-xs text-gray-900 font-mono tracking-widest"
                  />
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    Chiffres uniquement. Les codes trop simples (ex: 1234, 1111, 5678) sont interdits.
                  </p>
                </div>

                <div>
                  <label htmlFor="restore-confirm-pin" className="block font-bold text-gray-700 mb-1">
                    Confirmer le nouveau code PIN Propriétaire <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="restore-confirm-pin"
                    data-testid="restore-confirm-pin"
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={8}
                    required
                    value={restoreConfirmPin}
                    onChange={e => setRestoreConfirmPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="••••"
                    className="w-full p-2.5 border border-gray-300 rounded text-xs text-gray-900 font-mono tracking-widest"
                  />
                </div>

                <div className="pt-3 border-t border-gray-200 flex items-center justify-between">
                  <button
                    type="button"
                    data-testid="restore-cancel-btn"
                    disabled={isRestoringBackup}
                    onClick={handleCancelRestore}
                    className="px-3.5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded flex items-center space-x-1.5 border border-gray-300 disabled:opacity-50"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Annuler</span>
                  </button>

                  <button
                    type="submit"
                    data-testid="restore-submit-btn"
                    disabled={isRestoringBackup}
                    className="px-5 py-2.5 bg-[#E87524] hover:bg-[#D46317] text-white font-bold rounded flex items-center space-x-2 shadow disabled:opacity-50"
                  >
                    {isRestoringBackup ? (
                      <span>Restauration en cours...</span>
                    ) : (
                      <>
                        <span>Confirmer & Restaurer</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <>
              {/* ÉTAPE 1 : Identité Magasin */}
              {currentStep === 1 && (
                <form onSubmit={handleNextStep1} className="space-y-4">
              {/* Restauration directe d'une sauvegarde JSON existante après réinstallation */}
              <div className="p-3 rounded border border-orange-200 bg-orange-50/70 flex items-center justify-between gap-3">
                <div>
                  <div className="font-bold text-gray-900">
                    Vous avez déjà une sauvegarde Aquadro POS ? (استعادة نسخة احتياطية سابقة)
                  </div>
                  <div className="text-[11px] text-gray-600">
                    Restaurez directement votre base de données JSON existante sans reconfigurer le magasin.
                  </div>
                </div>
                <input
                  ref={backupInputRef}
                  data-testid="setup-restore-backup-input"
                  type="file"
                  accept=".json,application/json"
                  onChange={handleRestoreFromSetup}
                  className="hidden"
                />
                <button
                  type="button"
                  data-testid="setup-restore-backup-btn"
                  disabled={isRestoringBackup}
                  onClick={() => backupInputRef.current?.click()}
                  className="px-3 py-2 rounded bg-[#E87524] hover:bg-[#d16317] text-white font-bold flex items-center gap-1.5 shrink-0 disabled:opacity-50"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>{isRestoringBackup ? 'Restauration...' : 'Restaurer (.json)'}</span>
                </button>
              </div>

              <div className="flex items-center space-x-2 text-[#E87524] font-bold border-b border-gray-200 pb-2 mb-4">
                <Building2 className="w-4 h-4" />
                <span>Étape 1 : Coordonnées du Magasin</span>
              </div>

              <div className="mb-4">
                <label className="block font-bold text-gray-700 mb-1">Logo du Magasin (Optionnel)</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onloadend = () => setLogo(reader.result as string);
                      reader.readAsDataURL(file);
                    }
                  }}
                  className="w-full text-xs text-gray-700 file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-[#E87524] hover:file:bg-blue-100"
                />
                {logo && <img src={logo} alt="Logo" className="h-12 mt-2 object-contain" />}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Nom du magasin (Français)</label>
                  <input
                    type="text"
                    required
                    value={storeName}
                    onChange={e => setStoreName(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded text-xs text-gray-900"
                  />
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">اسم المحل (بالعربية)</label>
                  <input
                    type="text"
                    dir="rtl"
                    required
                    value={storeNameAr}
                    onChange={e => setStoreNameAr(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded text-xs text-gray-900 text-right"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Forme Juridique</label>
                  <select
                    value={legalForm}
                    onChange={e => setLegalForm(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded text-xs text-gray-900 bg-white"
                  >
                    <option value="SARL">SARL</option>
                    <option value="EURL">EURL</option>
                    <option value="SPA">SPA</option>
                    <option value="PHYSIQUE">Personne Physique</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">Wilaya</label>
                  <select
                    value={wilaya}
                    onChange={e => {
                      setWilaya(e.target.value);
                      const wilayaCode = parseInt(e.target.value.split(' - ')[0], 10);
                      const communesList = AlgeriaCities.getCommunes(wilayaCode);
                      if (communesList.length > 0) setCommune(communesList[0]);
                    }}
                    className="w-full p-2 border border-gray-300 rounded text-xs text-gray-900 bg-white"
                  >
                    {AlgeriaCities.getWilayas().map(w => (
                      <option key={w.code} value={w.label}>{w.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">Commune / Daira</label>
                  <select
                    required
                    value={commune}
                    onChange={e => setCommune(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded text-xs text-gray-900 bg-white"
                  >
                    {wilaya ? (
                      AlgeriaCities.getCommunes(parseInt(wilaya.split(' - ')[0], 10)).map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))
                    ) : (
                      <option value="">Sélectionnez d'abord une wilaya</option>
                    )}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Adresse complète</label>
                <input
                  type="text"
                  required
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded text-xs text-gray-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Téléphone Magasin</label>
                  <input
                    type="text"
                    required
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded text-xs text-gray-900"
                  />
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">Email Magasin</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded text-xs text-gray-900"
                  />
                </div>
              </div>

              <div className="pt-3 flex justify-end">
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#E87524] hover:bg-[#D46317] text-white font-bold rounded flex items-center space-x-1.5"
                >
                  <span>Continuer vers la Fiscalité</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </form>
          )}

          {/* ÉTAPE 2 : Régime Fiscal DGI */}
          {currentStep === 2 && (
            <form onSubmit={handleNextStep2} className="space-y-4">
              <div className="flex items-center space-x-2 text-[#E87524] font-bold border-b border-gray-200 pb-2">
                <FileSpreadsheet className="w-4 h-4" />
                <span>Étape 2 : Régime Fiscal Algérien & Numéros d'Identification</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div
                  onClick={() => {
                    setFiscalRegime('IFU');
                    setTvaRate(0);
                  }}
                  className={`p-3 border rounded cursor-pointer transition-colors ${
                    fiscalRegime === 'IFU'
                      ? 'border-blue-600 bg-blue-50/50'
                      : 'border-gray-300 bg-gray-50 hover:bg-white'
                  }`}
                >
                  <div className="font-bold text-gray-900 mb-1">Régime IFU (Forfaitaire)</div>
                  <p className="text-[11px] text-gray-500 leading-snug">
                    Vente directe en TTC. Non assujetti à la TVA selon directive DGI. Recommandé pour la majorité des boutiques indépendantes.
                  </p>
                </div>

                <div
                  onClick={() => {
                    setFiscalRegime('REEL');
                    setTvaRate(19);
                  }}
                  className={`p-3 border rounded cursor-pointer transition-colors ${
                    fiscalRegime === 'REEL'
                      ? 'border-blue-600 bg-blue-50/50'
                      : 'border-gray-300 bg-gray-50 hover:bg-white'
                  }`}
                >
                  <div className="font-bold text-gray-900 mb-1">Régime Réel (Assujetti TVA)</div>
                  <p className="text-[11px] text-gray-500 leading-snug">
                    Application de la TVA (19% ou 9%) avec ventilation HT + TVA sur factures et tickets de caisse.
                  </p>
                </div>
              </div>

              {fiscalRegime === 'REEL' && (
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Taux de TVA standard :</label>
                  <select
                    value={tvaRate}
                    onChange={e => setTvaRate(parseFloat(e.target.value))}
                    className="w-full p-2 border border-gray-300 rounded text-xs bg-white text-gray-900"
                  >
                    <option value={19}>19% — Taux Normal (Compléments alimentaires, accessoires)</option>
                    <option value={9}>9% — Taux Réduit (Produits diététiques spécifiques)</option>
                  </select>
                </div>
              )}

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">
                    RC <span className="text-[10px] text-gray-400 font-normal">(Optionnel / إختياري)</span>
                  </label>
                  <input
                    type="text"
                    placeholder=""
                    value={rc}
                    onChange={e => setRc(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded text-xs font-mono text-gray-900"
                  />
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">
                    NIF <span className="text-[10px] text-gray-400 font-normal">(Optionnel / إختياري)</span>
                  </label>
                  <input
                    type="text"
                    placeholder=""
                    value={nif}
                    onChange={e => setNif(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded text-xs font-mono text-gray-900"
                  />
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">
                    NIS <span className="text-[10px] text-gray-400 font-normal">(Optionnel / إختياري)</span>
                  </label>
                  <input
                    type="text"
                    placeholder=""
                    value={nis}
                    onChange={e => setNis(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded text-xs font-mono text-gray-900"
                  />
                </div>
              </div>

              <div className="pt-3 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setCurrentStep(1)}
                  className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded flex items-center space-x-1.5 border border-gray-300 text-xs"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Retour</span>
                </button>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => handleNextStep2()}
                    className="px-3 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold rounded flex items-center space-x-1.5 border border-stone-300 text-xs cursor-pointer"
                  >
                    <span>تخطي هذه المرحلة (Skip)</span>
                    <ArrowRight className="w-3.5 h-3.5 text-stone-500" />
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-[#E87524] hover:bg-[#D46317] text-white font-bold rounded flex items-center space-x-1.5 text-xs shadow-xs cursor-pointer"
                  >
                    <span>Continuer vers la Sécurité</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* ÉTAPE 3 : Compte Propriétaire & Code PIN */}
          {currentStep === 3 && (
            <form onSubmit={handleNextStep3} className="space-y-4">
              <div className="flex items-center space-x-2 text-[#E87524] font-bold border-b border-gray-200 pb-2">
                <ShieldCheck className="w-4 h-4" />
                <span>Étape 3 : Compte Propriétaire & Sécurisation PIN</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Nom du Propriétaire / Gérant</label>
                  <input
                    type="text"
                    required
                    value={ownerName}
                    onChange={e => setOwnerName(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded text-xs text-gray-900"
                  />
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">Téléphone de contact</label>
                  <input
                    type="text"
                    required
                    value={ownerPhone}
                    onChange={e => setOwnerPhone(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded text-xs text-gray-900"
                  />
                </div>
              </div>

              <div className="p-3 bg-amber-50 border border-amber-300 rounded text-amber-900 text-xs">
                <span className="font-bold">Politique de Sécurité Stricte :</span>
                <p className="mt-1 text-[11px]">
                  Les codes PIN de démonstration ou évidents (ex: <strong>1234, 1111, 5678, 0000</strong>) 
                  sont formellement rejetés par le système. Choisissez un code PIN personnel sécurisé de 4 à 8 chiffres.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Code PIN Propriétaire (4-8 chiffres)</label>
                  <input
                    type="password"
                    required
                    maxLength={8}
                    value={pin}
                    onChange={e => setPin(e.target.value)}
                    placeholder="••••"
                    className="w-full p-2 border border-gray-300 rounded text-xs text-gray-900 font-mono tracking-widest"
                  />
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">Confirmer le Code PIN</label>
                  <input
                    type="password"
                    required
                    maxLength={8}
                    value={pinConfirm}
                    onChange={e => setPinConfirm(e.target.value)}
                    placeholder="••••"
                    className="w-full p-2 border border-gray-300 rounded text-xs text-gray-900 font-mono tracking-widest"
                  />
                </div>
              </div>

              <div className="pt-3 flex justify-between">
                <button
                  type="button"
                  onClick={() => setCurrentStep(2)}
                  className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded flex items-center space-x-1.5 border border-gray-300"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Retour</span>
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#E87524] hover:bg-[#D46317] text-white font-bold rounded flex items-center space-x-1.5"
                >
                  <span>Continuer vers la Finalisation</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </form>
          )}

          {/* ÉTAPE 4 : Impression & Vérification Finale */}
          {currentStep === 4 && (
            <form onSubmit={handleFinalSubmit} className="space-y-4">
              <div className="flex items-center space-x-2 text-[#E87524] font-bold border-b border-gray-200 pb-2">
                <CheckCircle2 className="w-4 h-4" />
                <span>Étape 4 : Impression Obligatoire & Activation</span>
              </div>
              
              <div className="bg-blue-50 border border-blue-200 p-4 rounded text-center">
                <h3 className="font-bold text-blue-900 mb-2 text-sm">Étape obligatoire : Document d'Initialisation</h3>
                <p className="text-xs text-blue-800 mb-4">
                  Il est strictement obligatoire d'imprimer et de signer la charte d'utilisation et le DB SECRET PIN avant de lancer le système.
                </p>
                <button
                  type="button"
                  onClick={handlePrintCharter}
                  className="mx-auto px-4 py-3 bg-[#E87524] hover:bg-[#D46317] text-white font-bold rounded shadow flex items-center space-x-2 transition-transform transform active:scale-95"
                >
                  <FileSpreadsheet className="w-5 h-5" />
                  <span>Générer et Imprimer le Document A4</span>
                </button>
              </div>

              {hasPrinted && (
                <div className="mt-6 p-4 border border-emerald-200 bg-emerald-50 rounded animate-in fade-in zoom-in duration-300">
                  <h3 className="font-bold text-emerald-900 mb-2">Vérification de sécurité</h3>
                  <p className="text-xs text-emerald-800 mb-3">
                    Pour confirmer que vous avez bien imprimé le document et pour activer le système, veuillez saisir le Code PIN Propriétaire que vous venez de créer à l'étape précédente.
                  </p>
                  
                  <div className="flex flex-col items-center space-y-3">
                    <input
                      type="password"
                      required
                      value={verifyPin}
                      onChange={e => setVerifyPin(e.target.value)}
                      placeholder="Votre PIN Propriétaire..."
                      className="w-64 p-3 border-2 border-emerald-300 focus:border-emerald-500 rounded text-center text-lg font-mono tracking-widest text-gray-900 outline-none"
                    />
                    
                    <button
                      type="submit"
                      disabled={!verifyPin}
                      className="w-64 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded shadow flex justify-center items-center space-x-2 disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-5 h-5" />
                      <span>Terminer et Démarrer</span>
                    </button>
                  </div>
                </div>
              )}

              <div className="pt-3 flex justify-start">
                <button
                  type="button"
                  onClick={() => setCurrentStep(3)}
                  className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded flex items-center space-x-1.5 border border-gray-300"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Retour à l'étape 3</span>
                </button>
              </div>
            </form>
          )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
