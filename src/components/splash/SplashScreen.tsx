// Aquadro POS — Ultra-Fast, Featherweight Startup Splash Screen
// Chargement instantané et discret avec animation de points remplis (sans écran bleu lourd)

import React, { useState, useEffect } from 'react';
import { db } from '../../db/sqlite';
import { authService } from '../../services/auth.service';
import { ScannerInputManager } from '../../core/keyboard/ScannerInputManager';
import { logger } from '../../services/logger.service';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface SplashScreenProps {
  onReady: () => void;
  onFatalError?: (error: string) => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onReady, onFatalError }) => {
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [storeLogo] = useState<string | null>(() => 
    localStorage.getItem('aquadro_store_logo') || localStorage.getItem('pizzeria_store_logo')
  );

  const runInitialization = async () => {
    setFatalError(null);

    try {
      logger.info('STARTUP', 'Initialisation instantanée des sous-systèmes...');

      // Initialiser d'abord la base de données, puis restaurer la session authentifiée
      await db.initialize();
      await authService.initSession();

      // Attacher le scanner code-barres USB instantanément
      ScannerInputManager.getInstance();

      logger.info('STARTUP', 'Système prêt — transition immédiate.');
      
      // Transition fluide immédiate
      onReady();
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      logger.error('STARTUP_FATAL', 'Erreur critique au démarrage', errMsg);
      setFatalError(errMsg);
      if (onFatalError) onFatalError(errMsg);
    }
  };

  useEffect(() => {
    runInitialization();
  }, []);

  return (
    <div className="h-screen w-screen bg-[#F7F8FA] flex flex-col items-center justify-center select-none font-sans relative overflow-hidden">
      <div className="flex flex-col items-center text-center p-6 max-w-sm w-full">
        {/* Logo du commerce ou icône Aquadro */}
        <div className="w-16 h-16 rounded-2xl bg-white shadow-md shadow-orange-500/10 flex items-center justify-center mb-4 ring-2 ring-orange-200/60 overflow-hidden border border-stone-200">
          <img
            src={storeLogo || "/pizzeria-logo.jpg"}
            alt="Logo"
            className="w-full h-full object-contain p-1.5"
            onError={(e) => {
              // Fallback icône si l'image n'est pas encore présente
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
        </div>

        <h2 className="text-xl font-black text-stone-800 tracking-tight mb-1">
          Aquadro POS
        </h2>
        <p className="text-xs text-stone-500 font-medium mb-6">
          جاري فتح نقطة البيع...
        </p>

        {fatalError ? (
          /* Carte d'erreur de secours en cas de problème SQLite */
          <div className="w-full bg-red-50 border border-red-200 rounded-xl p-4 text-right shadow-sm">
            <div className="flex items-center gap-2 text-red-700 font-bold text-xs mb-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>تعذر تشغيل قاعدة البيانات المحلية</span>
            </div>
            <p className="text-[11px] text-red-600 mb-3 font-mono bg-white p-2 rounded border border-red-100 break-words text-left">
              {fatalError}
            </p>
            <button
              onClick={runInitialization}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-semibold rounded-lg shadow-sm transition"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>إعادة المحاولة</span>
            </button>
          </div>
        ) : (
          /* Animation simple et ultra-légère de points qui se remplissent */
          <div className="flex items-center justify-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#E87524] animate-bounce [animation-delay:-0.32s]"></span>
            <span className="w-2.5 h-2.5 rounded-full bg-[#E87524] animate-bounce [animation-delay:-0.16s]"></span>
            <span className="w-2.5 h-2.5 rounded-full bg-[#E87524] animate-bounce"></span>
          </div>
        )}
      </div>
    </div>
  );
};
