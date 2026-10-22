// Pizzeria POS Algérie — Écran de Vente au Comptoir Pizzeria (Cashier POS)
// Conçu spécifiquement pour une pizzeria : Menu visuel par cartes, sélection 1-clic, commande claire et encaissement direct

import React, { useState, useEffect } from "react";
import { productService } from "../../services/product.service";
import { db } from "../../db/sqlite";
import { checkoutService, CheckoutItemInput } from "../../services/checkout.service";
import { caisseService } from "../../services/caisse.service";
import { printerService } from "../../services/printer.service";
import { ReceiptModal } from "../common/ReceiptModal";
import { useAuth } from "../../hooks/useAuth";
import { useToast } from "../common/Toast";
import { Product, PaymentMethod, CashSession, Sale } from "../../types/database";
import { CurrencyUtil } from "../../core/currency/currency";
import {
  Search,
  Plus,
  Minus,
  Trash2,
  CheckCircle,
  CreditCard,
  Banknote,
  UtensilsCrossed,
  X,
  Printer,
  Sparkles
} from "lucide-react";

interface CartItem extends CheckoutItemInput {
  category_id?: string;
  name_ar?: string;
  variant?: string;
}

export const PosView: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = sessionStorage.getItem("pizzeria_current_cart");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [orderType, setOrderType] = useState<"SUR_PLACE" | "A_EMPORTER">("SUR_PLACE");
  const [tableNumber, setTableNumber] = useState<string>("Table 1");

  // Sauvegarde automatique du panier courant
  useEffect(() => {
    sessionStorage.setItem("pizzeria_current_cart", JSON.stringify(cart));
  }, [cart]);

  // Modal de paiement
  const [showPayModal, setShowPayModal] = useState<boolean>(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [tenderedInput, setTenderedInput] = useState<string>("");
  const [activeSession, setActiveSession] = useState<CashSession | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [lastReceipt, setLastReceipt] = useState<any | null>(null);
  const [showReceiptModal, setShowReceiptModal] = useState<boolean>(false);
  const [currentStore, setCurrentStore] = useState<any>(null);

  useEffect(() => {
    loadProducts();
    caisseService.getActiveSession().then(setActiveSession);
    const last = printerService.getLastReceipt();
    if (last) setLastReceipt(last);
    db.select<any>("SELECT * FROM stores LIMIT 1")
      .then(rows => { if (rows && rows.length > 0) setCurrentStore(rows[0]); })
      .catch(() => {});
  }, []);

  const loadProducts = async () => {
    const list = await productService.getProducts();
    setProducts(list.filter(p => p.is_active === 1));
  };

  // Catégories Pizzeria : Uniquement Pizzas et Boissons
  const categories = [
    { id: "ALL", label: "Tout le Menu", icon: "✨" },
    { id: "cat-pizza", label: "Pizzas", icon: "🍕" },
    { id: "cat-drink", label: "Boissons", icon: "🥤" }
  ];

  // Filtrage du menu : Uniquement Pizzas et Boissons
  const filteredProducts = products.filter(p => {
    const isPizzaOrDrink = !p.category_id || p.category_id === "cat-pizza" || p.category_id === "cat-drink";
    if (!isPizzaOrDrink) return false;

    const matchesCat = selectedCategory === "ALL" || p.category_id === selectedCategory;
    const q = search.toLowerCase().trim();
    const matchesSearch =
      !q ||
      p.name_fr.toLowerCase().includes(q) ||
      (p.name_ar && p.name_ar.toLowerCase().includes(q)) ||
      (p.variant && p.variant.toLowerCase().includes(q));
    return matchesCat && matchesSearch;
  });

  // Ajout 1-clic au panier
  const handleAddToCart = (product: Product) => {
    setCart(prev => {
      const idx = prev.findIndex(item => item.productId === product.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx].quantity += 1;
        return next;
      }
      return [
        ...prev,
        {
          productId: product.id,
          name: product.name_fr || (product as any).name || "Article",
          name_ar: product.name_ar,
          variant: product.variant || "",
          category_id: product.category_id || undefined,
          quantity: 1,
          unitPrice: product.selling_price_ttc,
          discountAmount: 0
        }
      ];
    });
  };

  // Modification quantité
  const handleUpdateQuantity = (productId: string, delta: number) => {
    setCart(prev => {
      return prev
        .map(item => {
          if (item.productId === productId) {
            const nextQty = item.quantity + delta;
            return nextQty > 0 ? { ...item, quantity: nextQty } : null;
          }
          return item;
        })
        .filter((item): item is CartItem => item !== null);
    });
  };

  // Suppression d article
  const handleRemoveItem = (productId: string) => {
    setCart(prev => prev.filter(item => item.productId !== productId));
  };

  // Annulation commande avec confirmation
  const handleCancelOrder = () => {
    if (cart.length === 0) return;
    if (window.confirm("Voulez-vous vraiment annuler la commande en cours ?")) {
      setCart([]);
      showToast("Commande annulée", "info");
    }
  };

  // Calculs totaux
  const subtotal = cart.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const totalItemsCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const totalAmount = subtotal;

  // Calcul de la monnaie
  const tenderedNumeric = parseFloat(tenderedInput) || 0;
  const changeGiven = paymentMethod === "CASH" ? Math.max(0, tenderedNumeric - totalAmount) : 0;

  // Démarrer encaissement
  const handleStartCheckout = () => {
    if (cart.length === 0) {
      showToast("Veuillez sélectionner au moins un article", "warning");
      return;
    }
    setTenderedInput(totalAmount.toString());
    setPaymentMethod("CASH");
    setShowPayModal(true);
  };

  // Finaliser la vente
  const handleFinalizeSale = async () => {
    if (cart.length === 0 || isProcessing) return;

    if (paymentMethod === "CASH" && tenderedNumeric < totalAmount) {
      showToast("Le montant reçu est inférieur au total", "warning");
      return;
    }

    setIsProcessing(true);
    try {
      const cashierName = user?.name || "Caissier Pizzeria";
      const cashierId = user?.id || "usr-cashier";

      const sale: Sale = await checkoutService.processCheckout({
        cashierId,
        cashierName,
        sessionId: activeSession?.id,
        items: cart,
        payments: [
          {
            method: paymentMethod,
            amount: totalAmount,
            tenderedAmount: paymentMethod === "CASH" ? tenderedNumeric : totalAmount,
            changeGiven: changeGiven
          }
        ],
        notes: `${orderType === "SUR_PLACE" ? "Sur Place" : "A Emporter"} - ${tableNumber}`
      });

      // Construction ticket de caisse Pizzeria
      const receiptData: any = {
        saleId: sale.id,
        receiptNumber: sale.receipt_number,
        dateTime: new Date().toLocaleString("fr-FR"),
        date: new Date().toLocaleDateString("fr-FR"),
        time: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
        cashierName,
        orderType: orderType === "SUR_PLACE" ? "Sur Place" : "À Emporter",
        tableNumber: orderType === "SUR_PLACE" ? tableNumber : undefined,
        storeName: currentStore?.name_fr || currentStore?.name || "Pizzeria",
        storeAddress: currentStore?.address || "",
        storePhone: currentStore?.phone || "",
        items: cart.map(i => ({
          name: i.name,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          total: i.quantity * i.unitPrice
        })),
        totalTTC: totalAmount,
        paymentMethod: paymentMethod === "CASH" ? "Espèces" : "Carte Bancaire",
        tenderedAmount: paymentMethod === "CASH" ? tenderedNumeric : totalAmount,
        changeGiven: changeGiven,
        taxAmount: 0,
        currency: "DZD"
      };

      setLastReceipt(receiptData);
      setShowPayModal(false);
      setCart([]);
      showToast("Commande encaissée avec succès !", "success");

      // Impression automatique ou ouverture aperçu
      try {
        await printerService.printReceipt(receiptData);
      } catch {
        setShowReceiptModal(true);
      }
    } catch (err: any) {
      showToast(`Erreur d encaissement : ${err?.message || err}`, "error");
    } finally {
      setIsProcessing(false);
    }
  };

  // Helper icône par catégorie
  const getProductEmoji = (p: Product) => {
    if (p.category_id === "cat-drink") return "🥤";
    if (p.category_id === "cat-sides") return "🍟";
    if (p.category_id === "cat-dessert") return "🍰";
    return "🍕";
  };

  return (
    <div className="flex-1 flex overflow-hidden select-none bg-[#FFF8EF] font-sans">
      {/* ========================================================================= */}
      {/* COLONNE GAUCHE (70%) : MENU VISUEL & CARTES DES PIZZAS                     */}
      {/* ========================================================================= */}
      <div className="flex-1 flex flex-col overflow-hidden border-r border-[#E9DCCB]">
        {/* Barre Supérieure du Menu : Recherche & Catégories */}
        <div className="bg-white px-5 py-3 border-b border-[#E9DCCB] flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
          {/* Onglets des Catégories Pizzeria */}
          <div className="flex items-center space-x-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0 scrollbar-none">
            {categories.map(cat => {
              const isSelected = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-3.5 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap active:scale-95 ${
                    isSelected
                      ? "bg-[#E87524] text-white shadow-sm shadow-orange-500/25 ring-2 ring-orange-300"
                      : "bg-[#FFF8EF] text-[#292522] hover:bg-[#FFF3EB] hover:text-[#E87524] border border-[#E9DCCB]"
                  }`}
                >
                  <span className="text-sm">{cat.icon}</span>
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </div>

          {/* Recherche rapide */}
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-stone-400 absolute left-3 top-2.5 pointer-events-none" />
            <input
              type="text"
              placeholder="Rechercher pizza, boisson..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-8 py-1.5 rounded-xl bg-[#FFF8EF] border border-[#E9DCCB] text-xs text-[#292522] placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-[#E87524] focus:border-transparent transition-all"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-2.5 text-stone-400 hover:text-stone-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Grille des Cartes Produits Pizzeria */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          {filteredProducts.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 text-stone-400">
              <UtensilsCrossed className="w-12 h-12 text-[#E87524]/40 mb-3" />
              <p className="font-bold text-[#292522] text-sm">
                {products.length === 0 ? "Votre menu est vide pour le moment" : "Aucun article trouvé"}
              </p>
              <p className="text-xs text-stone-500 mt-1 max-w-sm">
                {products.length === 0
                  ? "Le propriétaire peut ajouter ses pizzas et boissons depuis la section Menu & Produits."
                  : "Essayez un autre mot-clé ou catégorie"}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5">
              {filteredProducts.map(product => {
                const cartQty = cart.find(item => item.productId === product.id)?.quantity || 0;

                return (
                  <div
                    key={product.id}
                    onClick={() => handleAddToCart(product)}
                    className={`bg-white rounded-2xl border p-3.5 flex flex-col justify-between transition-all duration-150 cursor-pointer relative group select-none shadow-xs hover:shadow-md active:scale-[0.98] ${
                      cartQty > 0
                        ? "border-[#E87524] ring-2 ring-[#E87524]/20 bg-[#FFFDFB]"
                        : "border-[#E9DCCB] hover:border-[#FFC928] hover:bg-[#FFFCF7]"
                    }`}
                  >
                    {/* Badge Quantité si déjà au panier */}
                    {cartQty > 0 && (
                      <span className="absolute -top-2 -right-2 bg-[#E87524] text-white text-[11px] font-black w-6 h-6 rounded-full flex items-center justify-center shadow-md shadow-orange-500/30 ring-2 ring-white animate-in zoom-in-75 duration-100">
                        {cartQty}
                      </span>
                    )}

                    <div>
                      {/* Icône du produit & Tag Prix */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="w-10 h-10 rounded-xl bg-[#FFF8EF] border border-[#E9DCCB] flex items-center justify-center text-xl shadow-2xs group-hover:scale-105 transition-transform">
                          {getProductEmoji(product)}
                        </div>
                        <span className="bg-[#FFF3EB] text-[#E87524] font-black text-xs px-2 py-1 rounded-lg border border-[#E87524]/20">
                          {CurrencyUtil.formatDZD(product.selling_price_ttc)}
                        </span>
                      </div>

                      {/* Titre & Ingrédients */}
                      <h3 className="font-bold text-[#292522] text-xs leading-tight line-clamp-1 group-hover:text-[#E87524] transition-colors">
                        {product.name_fr}
                      </h3>
                      {product.name_ar && (
                        <p className="text-[11px] text-stone-500 font-arabic line-clamp-1 mt-0.5" dir="rtl">
                          {product.name_ar}
                        </p>
                      )}
                      {product.variant && (
                        <p className="text-[10px] text-stone-600 line-clamp-2 mt-1 leading-snug">
                          {product.variant}
                        </p>
                      )}
                    </div>

                    {/* Bouton d ajout rapide visuel */}
                    <div className="mt-3 pt-2 border-t border-[#E9DCCB]/60 flex items-center justify-between text-[11px] text-stone-700 font-semibold">
                      <span>Ajouter</span>
                      <div className="w-5 h-5 rounded-full bg-[#E87524]/10 text-[#E87524] flex items-center justify-center group-hover:bg-[#E87524] group-hover:text-white transition-colors">
                        <Plus className="w-3 h-3" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* COLONNE DROITE (30%) : COMMANDE EN COURS & ENCAISSEMENT PROMINENT         */}
      {/* ========================================================================= */}
      <div className="w-84 lg:w-96 bg-white flex flex-col justify-between overflow-hidden shadow-sm shrink-0 border-l border-[#E9DCCB]">
        {/* En-tête du Ticket de Caisse */}
        <div className="p-3.5 border-b border-[#E9DCCB] bg-[#FFF8EF]">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <span className="text-base">🧾</span>
              <h2 className="font-extrabold text-sm text-[#292522]">Commande en cours</h2>
            </div>
            <span className="text-xs font-bold text-[#E87524] bg-white px-2 py-0.5 rounded-full border border-[#E9DCCB]">
              {totalItemsCount} article{totalItemsCount > 1 ? "s" : ""}
            </span>
          </div>

          {/* Toggle Sur Place / À Emporter */}
          <div className="grid grid-cols-2 gap-1.5 bg-white p-1 rounded-xl border border-[#E9DCCB]">
            <button
              onClick={() => setOrderType("SUR_PLACE")}
              className={`py-1 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                orderType === "SUR_PLACE"
                  ? "bg-[#E87524] text-white shadow-xs"
                  : "text-stone-600 hover:text-[#292522]"
              }`}
            >
              <span>🍽️</span>
              <span>Sur Place</span>
            </button>
            <button
              onClick={() => setOrderType("A_EMPORTER")}
              className={`py-1 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                orderType === "A_EMPORTER"
                  ? "bg-[#E87524] text-white shadow-xs"
                  : "text-stone-600 hover:text-[#292522]"
              }`}
            >
              <span>🥡</span>
              <span>À Emporter</span>
            </button>
          </div>
        </div>

        {/* Liste des Articles dans la Commande */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-stone-400 select-none">
              <div className="w-14 h-14 rounded-full bg-[#FFF8EF] border border-[#E9DCCB] flex items-center justify-center text-2xl mb-2">
                🍕
              </div>
              <p className="font-bold text-[#292522] text-xs">Commande vide</p>
              <p className="text-[11px] text-stone-500 mt-1 max-w-[180px]">
                Touchez les pizzas et boissons à gauche pour créer la commande
              </p>
            </div>
          ) : (
            cart.map(item => (
              <div
                key={item.productId}
                className="bg-[#FFFDFB] rounded-xl border border-[#E9DCCB] p-2.5 flex items-center justify-between gap-2 shadow-2xs hover:border-[#FFC928] transition-colors"
              >
                {/* Infos article */}
                <div className="flex-1 min-w-0 pr-1">
                  <h4 className="font-bold text-xs text-[#292522] truncate">{item.name}</h4>
                  <p className="text-[11px] text-[#E87524] font-semibold">
                    {CurrencyUtil.formatDZD(item.unitPrice)}
                  </p>
                </div>

                {/* Contrôles Quantité Simple (-) [qty] (+) */}
                <div className="flex items-center gap-1 bg-white border border-[#E9DCCB] rounded-lg p-0.5 shadow-2xs">
                  <button
                    onClick={() => handleUpdateQuantity(item.productId, -1)}
                    className="w-6 h-6 rounded flex items-center justify-center text-stone-600 hover:bg-stone-100 active:scale-95 transition-colors"
                    title="Diminuer"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="w-6 text-center font-bold text-xs text-[#292522]">
                    {item.quantity}
                  </span>
                  <button
                    onClick={() => handleUpdateQuantity(item.productId, 1)}
                    className="w-6 h-6 rounded flex items-center justify-center text-stone-600 hover:bg-stone-100 active:scale-95 transition-colors"
                    title="Augmenter"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>

                {/* Total Ligne & Bouton Poubelle */}
                <div className="text-right pl-1 flex items-center gap-2">
                  <span className="font-black text-xs text-[#292522]">
                    {CurrencyUtil.formatDZD(item.quantity * item.unitPrice)}
                  </span>
                  <button
                    onClick={() => handleRemoveItem(item.productId)}
                    className="text-stone-400 hover:text-[#B9362B] p-1 rounded hover:bg-red-50 transition-colors"
                    title="Supprimer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Pied de Commande : Totaux & Bouton Encaisser Prominent */}
        <div className="p-3.5 border-t border-[#E9DCCB] bg-[#FFF8EF] space-y-3">
          {/* Ligne Sous-Total */}
          <div className="flex items-center justify-between text-xs text-stone-600 font-medium">
            <span>Sous-total HT</span>
            <span>{CurrencyUtil.formatDZD(subtotal)}</span>
          </div>

          {/* Ligne Grand Total */}
          <div className="flex items-center justify-between pt-1 border-t border-[#E9DCCB]/60">
            <span className="font-extrabold text-sm text-[#292522]">TOTAL À PAYER</span>
            <span className="font-black text-2xl text-[#E87524] tracking-tight">
              {CurrencyUtil.formatDZD(totalAmount)}
            </span>
          </div>

          {/* Boutons d Actions */}
          <div className="grid grid-cols-4 gap-2 pt-1">
            {/* Bouton Annuler */}
            <button
              onClick={handleCancelOrder}
              disabled={cart.length === 0}
              className="col-span-1 py-3 bg-white hover:bg-red-50 text-stone-500 hover:text-[#B9362B] border border-[#E9DCCB] hover:border-red-200 rounded-xl font-bold text-xs flex flex-col items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              title="Annuler la commande"
            >
              <Trash2 className="w-4 h-4 mb-0.5" />
              <span className="text-[10px]">Annuler</span>
            </button>

            {/* Bouton Encaisser Prominent Orange */}
            <button
              onClick={handleStartCheckout}
              disabled={cart.length === 0}
              className="col-span-3 py-3.5 bg-[#E87524] hover:bg-[#D46317] active:bg-[#B9362B] text-white rounded-xl font-black text-base flex items-center justify-center gap-2 shadow-lg shadow-orange-500/25 transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.99] cursor-pointer"
            >
              <CheckCircle className="w-5 h-5" />
              <span>ENCAISSER ({CurrencyUtil.formatDZD(totalAmount)})</span>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL DE RÈGLEMENT SIMPLE (ESPÈCES / CARTE CIB)                            */}
      {/* ========================================================================= */}
      {showPayModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 select-none">
          <div className="bg-white border border-[#E9DCCB] w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col text-xs text-[#292522]">
            {/* Header Modal */}
            <div className="px-5 py-4 border-b border-[#E9DCCB] bg-[#FFF8EF] flex items-center justify-between">
              <div>
                <h3 className="text-base font-extrabold text-[#292522]">Règlement de la Commande</h3>
                <p className="text-xs text-stone-500">
                  {orderType === "SUR_PLACE" ? "Sur Place" : "À Emporter"} • {totalItemsCount} article{totalItemsCount > 1 ? "s" : ""}
                </p>
              </div>
              <button
                onClick={() => setShowPayModal(false)}
                className="text-stone-400 hover:text-stone-600 p-1.5 rounded-lg hover:bg-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Corps Modal */}
            <div className="p-5 space-y-4">
              {/* Grand Total à Encaisser */}
              <div className="bg-[#FFFDFB] p-4 rounded-xl border border-[#E9DCCB] text-center">
                <span className="text-xs text-stone-500 font-semibold uppercase tracking-wider">Montant Total à Régler</span>
                <p className="text-3xl font-black text-[#E87524] mt-1">
                  {CurrencyUtil.formatDZD(totalAmount)}
                </p>
              </div>

              {/* Choix Mode de Paiement Simple */}
              <div>
                <label className="block font-bold text-stone-700 mb-1.5 text-xs">Moyen de paiement</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentMethod("CASH");
                      setTenderedInput(totalAmount.toString());
                    }}
                    className={`p-3 rounded-xl border flex items-center justify-center gap-2 font-bold text-xs transition-all ${
                      paymentMethod === "CASH"
                        ? "bg-[#FFF3EB] border-[#E87524] text-[#E87524] ring-2 ring-orange-200"
                        : "bg-white border-[#E9DCCB] text-[#292522] hover:bg-stone-50"
                    }`}
                  >
                    <Banknote className="w-4 h-4 text-emerald-600" />
                    <span>Espèces (Cash)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setPaymentMethod("EDAHABIA");
                      setTenderedInput(totalAmount.toString());
                    }}
                    className={`p-3 rounded-xl border flex items-center justify-center gap-2 font-bold text-xs transition-all ${
                      paymentMethod !== "CASH"
                        ? "bg-[#FFF3EB] border-[#E87524] text-[#E87524] ring-2 ring-orange-200"
                        : "bg-white border-[#E9DCCB] text-[#292522] hover:bg-stone-50"
                    }`}
                  >
                    <CreditCard className="w-4 h-4 text-blue-600" />
                    <span>Carte CIB / Dahabia</span>
                  </button>
                </div>
              </div>

              {/* Détails Espèces : Montant Reçu & Monnaie */}
              {paymentMethod === "CASH" && (
                <div className="space-y-3 bg-[#FFF8EF]/50 p-3 rounded-xl border border-[#E9DCCB]">
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="font-bold text-stone-700 text-xs">Montant Reçu (DZD)</label>
                      {/* Presets rapides de billets */}
                      <div className="flex gap-1 font-mono text-[10px]">
                        {[totalAmount, 1000, 2000].map(val => (
                          <button
                            key={val}
                            type="button"
                            onClick={() => setTenderedInput(val.toString())}
                            className="px-1.5 py-0.5 rounded bg-white border border-[#E9DCCB] hover:border-orange-300 text-stone-700"
                          >
                            {val} DA
                          </button>
                        ))}
                      </div>
                    </div>
                    <input
                      type="number"
                      min={totalAmount}
                      value={tenderedInput}
                      onChange={e => setTenderedInput(e.target.value)}
                      className="w-full text-lg font-black font-mono text-center py-2 px-3 bg-white border border-[#E9DCCB] rounded-lg text-[#292522] focus:ring-2 focus:ring-[#E87524] focus:outline-none"
                      autoFocus
                    />
                  </div>

                  {/* Monnaie à Rendre */}
                  <div className="flex items-center justify-between bg-white p-2.5 rounded-lg border border-[#E9DCCB]">
                    <span className="font-bold text-xs text-stone-600">Monnaie à rendre :</span>
                    <span className="font-black text-lg text-emerald-600">
                      {CurrencyUtil.formatDZD(changeGiven)}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Bouton de Confirmation Finale */}
            <div className="p-4 border-t border-[#E9DCCB] bg-stone-50 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setShowPayModal(false)}
                className="px-4 py-2.5 rounded-xl border border-[#E9DCCB] bg-white font-bold text-xs text-stone-600 hover:bg-stone-100 transition-colors"
              >
                Retour
              </button>

              <button
                type="button"
                onClick={handleFinalizeSale}
                disabled={isProcessing || (paymentMethod === "CASH" && tenderedNumeric < totalAmount)}
                className="flex-1 py-3 rounded-xl bg-[#E87524] hover:bg-[#D46317] active:bg-[#B9362B] text-white font-black text-sm flex items-center justify-center gap-2 shadow-md shadow-orange-500/25 transition-all disabled:opacity-40 cursor-pointer"
              >
                <CheckCircle className="w-4 h-4" />
                <span>{isProcessing ? "Enregistrement..." : "Valider & Imprimer Ticket"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Aperçu Ticket Thermique (si pas d imprimante physique configurée) */}
      {showReceiptModal && lastReceipt && (
        <ReceiptModal
          isOpen={true}
          receiptData={lastReceipt}
          onClose={() => setShowReceiptModal(false)}
        />
      )}
    </div>
  );
};
