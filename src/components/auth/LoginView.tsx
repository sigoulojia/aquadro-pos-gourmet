import React, { useState, useEffect } from "react";
import { authService } from "../../services/auth.service";
import { db } from "../../db/sqlite";

export const LoginView: React.FC = () => {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [storeName, setStoreName] = useState("");
  const [storeLogo, setStoreLogo] = useState<string | null>(() => localStorage.getItem('aquadro_store_logo') || localStorage.getItem('pizzeria_store_logo'));

  useEffect(() => {
    db.select<{ name_fr?: string; name?: string }>("SELECT name_fr, name FROM stores LIMIT 1")
      .then(rows => {
        if (rows.length > 0) {
          setStoreName(rows[0].name_fr || rows[0].name || "");
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= "0" && e.key <= "9") {
        setPin(prev => (prev.length < 8 ? prev + e.key : prev));
        setError("");
      } else if (e.key === "Backspace") {
        setPin(prev => prev.slice(0, -1));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleNumberClick = (num: string) => {
    if (pin.length < 8) {
      setPin(prev => prev + num);
      setError("");
    }
  };

  const handleDelete = () => {
    setPin(prev => prev.slice(0, -1));
  };

  const handleLogin = async () => {
    if (!pin) return;
    try {
      await authService.loginWithPin(pin);
    } catch (err: any) {
      setError(err?.message || "Code PIN incorrect.");
      setPin("");
    }
  };

  useEffect(() => {
    const handleEnter = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        handleLogin();
      }
    };
    window.addEventListener("keydown", handleEnter);
    return () => window.removeEventListener("keydown", handleEnter);
  }, [pin]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-[#F7F8FA] font-sans p-4 select-none">
      <div className="bg-white p-8 rounded-2xl shadow-xl max-w-sm w-full border border-stone-200">
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-white shadow-lg shadow-orange-500/10 flex items-center justify-center mx-auto mb-3 ring-4 ring-orange-100/50 overflow-hidden border border-stone-200">
            <img
              src={storeLogo || "/pizzeria-logo.jpg"}
              alt="Logo Pizzeria"
              className="w-full h-full object-contain p-1"
            />
          </div>
          <h1 className="text-2xl font-black text-stone-900 tracking-tight">Pizzeria POS</h1>
          <p className="text-xs text-stone-500 mt-1 font-medium">{storeName ? `${storeName} • Caisse` : "Point de Vente & Caisse Pizzeria"}</p>
          <p className="text-xs text-orange-800 bg-orange-50 py-1 px-3 rounded-full inline-block mt-2 font-mono font-bold border border-orange-200/50">
            Entrez votre code PIN caissier
          </p>
        </div>

        {/* Indicateurs de PIN */}
        <div className="mb-6 text-center">
          <div className="flex justify-center gap-2.5 mb-2">
            {[...Array(4)].map((_, i) => (
              <div 
                key={i} 
                className={`w-3.5 h-3.5 rounded-full transition-all duration-200 ${
                  i < pin.length 
                    ? "bg-[#E87524] scale-110 shadow-xs shadow-orange-400" 
                    : "bg-stone-200"
                }`}
              />
            ))}
          </div>
          {error && <p className="text-[#B9362B] text-xs font-semibold mt-2">{error}</p>}
        </div>

        {/* Pavé Numérique Chaleureux */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
            <button
              key={num}
              onClick={() => handleNumberClick(num.toString())}
              className="h-13 bg-stone-50 hover:bg-orange-50 active:bg-orange-100 rounded-xl text-xl font-bold text-stone-800 transition-colors border border-stone-200 active:scale-95 shadow-xs cursor-pointer"
            >
              {num}
            </button>
          ))}
          <button
            onClick={handleDelete}
            className="h-13 bg-red-50 hover:bg-red-100 active:bg-red-200 rounded-xl text-xl font-bold text-[#B9362B] transition-colors border border-red-200 active:scale-95 shadow-xs cursor-pointer"
            title="Effacer"
          >
            ⌫
          </button>
          <button
            onClick={() => handleNumberClick("0")}
            className="h-13 bg-stone-50 hover:bg-orange-50 active:bg-orange-100 rounded-xl text-xl font-bold text-stone-800 transition-colors border border-stone-200 active:scale-95 shadow-xs cursor-pointer"
          >
            0
          </button>
          <button
            onClick={handleLogin}
            className="h-13 bg-[#E87524] hover:bg-[#D46317] active:bg-[#B9362B] rounded-xl text-lg font-bold text-white transition-all shadow-md shadow-orange-500/20 active:scale-95 flex items-center justify-center cursor-pointer"
          >
            OK
          </button>
        </div>

        {/* Version & Sécurité */}
        <div className="pt-3 border-t border-stone-200 flex flex-col items-center">
          <span className="text-[11px] text-stone-400 font-mono font-medium">
            Aquadro POS Gourmet v1.0.5 Stable
          </span>
        </div>
      </div>
    </div>
  );
};
