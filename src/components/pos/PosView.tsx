// Pizzeria POS Algérie — Écran de Vente au Comptoir Pizzeria (Cashier POS)
// Conçu spécifiquement pour une pizzeria : Menu visuel direct, sélection 1-clic, personnalisation suppléments,
// pizzas multi-saveurs (2 saisons / 4 saisons), service livraison avec gestion du stock des suppléments,
// et impression double tickets (Ticket Client + Bon Cuisine Chef). Style sobre, rapide et fonctionnel.

import React, { useState, useEffect, useMemo } from "react";
import { productService } from "../../services/product.service";
import { db } from "../../db/sqlite";
import { checkoutService, CheckoutItemInput } from "../../services/checkout.service";
import { caisseService } from "../../services/caisse.service";
import { printerService } from "../../services/printer.service";
import { salesService } from "../../services/sales.service";
import { supplementService, PizzaSupplement } from "../../services/supplement.service";
import { recipeService, ProductIngredientStatus } from "../../services/recipe.service";
import { ReceiptModal } from "../common/ReceiptModal";
import { PizzaCustomizerModal } from "./PizzaCustomizerModal";
import { MultiPartPizzaModal } from "./MultiPartPizzaModal";
import { SupplementsManagerModal } from "../products/SupplementsManagerModal";
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
  Sparkles,
  Pizza,
  Coffee,
  Cake,
  Utensils,
  ShoppingBag,
  Receipt,
  ChefHat,
  Bike,
  Layers,
  Settings2,
  Phone,
  MapPin,
  User,
  AlertTriangle,
  Send
} from "lucide-react";

export interface CartItem extends CheckoutItemInput {
  cartItemId: string;
  category_id?: string;
  name_ar?: string;
  variant?: string;
  supplements?: PizzaSupplement[];
  multiParts?: { name: string; price: number; id?: string }[];
  notes?: string;
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
      if (!saved) return [];
      const parsed: CartItem[] = JSON.parse(saved);
      return parsed.map((item, idx) => ({
        ...item,
        cartItemId: item.cartItemId || `${item.productId}-${idx}-${Date.now()}`
      }));
    } catch {
      return [];
    }
  });

  // Type de Commande : Sur Place, À Emporter, ou Livraison
  const [orderType, setOrderType] = useState<"SUR_PLACE" | "A_EMPORTER" | "LIVRAISON">("SUR_PLACE");
  const [tableNumber, setTableNumber] = useState<string>("Table 1");

  // Champs spécifiques Livraison
  const [deliveryFee, setDeliveryFee] = useState<number>(() => {
    const saved = localStorage.getItem("pizzeria_delivery_fee");
    return saved ? parseFloat(saved) || 200 : 200;
  });
  const [deliveryCustomerName, setDeliveryCustomerName] = useState<string>("");
  const [deliveryPhone, setDeliveryPhone] = useState<string>("");
  const [deliveryAddress, setDeliveryAddress] = useState<string>("");
  const [deliveryDriver, setDeliveryDriver] = useState<string>("");

  // Modals Pizzeria
  const [customizingProduct, setCustomizingProduct] = useState<Product | null>(null);
  const [showMultiPartModal, setShowMultiPartModal] = useState<boolean>(false);
  const [multiPartInitialMode, setMultiPartInitialMode] = useState<"2_PARTS" | "4_PARTS">("2_PARTS");
  const [showSupplementsManager, setShowSupplementsManager] = useState<boolean>(false);

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
  const [ingredientStatusMap, setIngredientStatusMap] = useState<Record<string, ProductIngredientStatus>>({});
  const [outOfStockModalProduct, setOutOfStockModalProduct] = useState<Product | null>(null);
  const [outOfStockRequested, setOutOfStockRequested] = useState<boolean>(false);
  const [isRestockingFromPos, setIsRestockingFromPos] = useState<boolean>(false);

  useEffect(() => {
    loadProducts();
    caisseService.getActiveSession().then(setActiveSession).catch(() => {});
    const last = printerService.getLastReceipt();
    if (last) setLastReceipt(last);
    db.select<any>("SELECT * FROM stores LIMIT 1")
      .then(rows => {
        if (rows && rows.length > 0) setCurrentStore(rows[0]);
      })
      .catch(() => {});
  }, []);

  const loadProducts = async () => {
    try {
      const list = await productService.getProducts(true);
      setProducts(list.filter(p => p.is_active === 1));
      const statusMap = await recipeService.getAllProductsIngredientStatus();
      setIngredientStatusMap(statusMap);
    } catch (e) {
      console.warn("Erreur chargement produits:", e);
    }
  };

  // Catégories Pizzeria sobres
  const categories = [
    { id: "ALL", label: "Tout le Menu", icon: Sparkles },
    { id: "cat-pizza", label: "Pizzas", icon: Pizza },
    { id: "cat-drink", label: "Boissons", icon: Coffee }
  ];

  // Filtrage ultra-rapide
  const filteredProducts = useMemo(() => {
    const q = search.toLowerCase().trim();
    return products.filter(p => {
      const isPizzaOrDrink = !p.category_id || p.category_id === "cat-pizza" || p.category_id === "cat-drink";
      if (!isPizzaOrDrink) return false;

      const matchesCat = selectedCategory === "ALL" || p.category_id === selectedCategory;
      if (!matchesCat) return false;

      return (
        !q ||
        p.name_fr.toLowerCase().includes(q) ||
        (p.name_ar && p.name_ar.toLowerCase().includes(q)) ||
        (p.variant && p.variant.toLowerCase().includes(q))
      );
    });
  }, [products, selectedCategory, search]);

  const isViewingPizzas = selectedCategory === "ALL" || selectedCategory === "cat-pizza";
  const searchLower = search.toLowerCase().trim();
  const showMultiPartCards = isViewingPizzas && (
    !searchLower ||
    searchLower.includes("moitié") ||
    searchLower.includes("moitie") ||
    searchLower.includes("نصف") ||
    searchLower.includes("saison") ||
    searchLower.includes("فصول") ||
    searchLower.includes("pizza") ||
    searchLower.includes("بيتزا")
  );

  const isPizzaProduct = (product: Product) => {
    return !product.category_id || product.category_id === "cat-pizza" || product.name_fr.toLowerCase().includes("pizza");
  };

  // Clic sur une carte :
  // Si Moitié-Moitié ou 4 Saisons -> ouvre directement le modal multi-saveurs
  // Si pizza standard -> ouvre la personnalisation (suppléments / notes / quantité)
  // Si boisson -> ajout direct au panier
  const handleProductCardClick = (product: Product) => {
    const lowerName = (product.name_fr || "").toLowerCase();
    const arName = product.name_ar || "";
    if (lowerName.includes("moitié") || lowerName.includes("moitie") || arName.includes("نصفين") || lowerName.includes("saison") || arName.includes("فصلين")) {
      setMultiPartInitialMode("2_PARTS");
      setShowMultiPartModal(true);
      return;
    }

    if (isPizzaProduct(product)) {
      const ingStatus = ingredientStatusMap[product.id];
      if (ingStatus?.hasRecipe && !ingStatus.isAvailable) {
        // Pizza avec ingrédients manquants : afficher modal d'alerte et de réapprovisionnement
        setOutOfStockModalProduct(product);
        setOutOfStockRequested(false);
        return;
      }
      setCustomizingProduct(product);
    } else {
      handleQuickAdd(product);
    }
  };

  // Ajout direct 1-clic
  const handleQuickAdd = (product: Product, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();

    setCart(prev => {
      const idx = prev.findIndex(
        item => item.productId === product.id && (!item.supplements || item.supplements.length === 0) && !item.notes && !item.multiParts
      );

      if (idx >= 0) {
        const next = [...prev];
        next[idx].quantity += 1;
        return next;
      }

      return [
        ...prev,
        {
          cartItemId: `${product.id}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
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

  // Ajout depuis le Customizer de Pizza (avec suppléments & notes)
  const handleAddCustomizedPizza = (customized: {
    product: Product;
    quantity: number;
    supplements: PizzaSupplement[];
    notes: string;
    totalUnitPrice: number;
  }) => {
    const displayName = customized.product.name_fr || (customized.product as any).name || "Pizza";

    setCart(prev => [
      ...prev,
      {
        cartItemId: `cust-${customized.product.id}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        productId: customized.product.id,
        name: displayName,
        name_ar: customized.product.name_ar,
        variant: customized.product.variant,
        category_id: customized.product.category_id,
        quantity: customized.quantity,
        unitPrice: customized.totalUnitPrice,
        discountAmount: 0,
        supplements: customized.supplements,
        notes: customized.notes
      }
    ]);

    setCustomizingProduct(null);
    showToast(`${customized.quantity}x ${displayName} ajouté`, "success");
  };

  // Ajout depuis le Modal Multi-Saveurs (Moitié-Moitié ou 4 Saisons)
  const handleAddMultiPartPizza = (item: {
    compositeProduct: Product;
    quantity: number;
    supplements: PizzaSupplement[];
    notes: string;
    totalUnitPrice: number;
    multiParts: {
      type: "2_PARTS";
      parts: Array<{ name: string; price: number; id: string }>;
    };
  }) => {
    setCart(prev => [
      ...prev,
      {
        cartItemId: `multi-${item.compositeProduct.id}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        productId: item.compositeProduct.id,
        name: item.compositeProduct.name_fr,
        category_id: "cat-pizza",
        quantity: item.quantity,
        unitPrice: item.totalUnitPrice,
        discountAmount: 0,
        supplements: item.supplements,
        multiParts: item.multiParts.parts,
        notes: item.notes
      }
    ]);

    setShowMultiPartModal(false);
    showToast(`${item.quantity}x ${item.compositeProduct.name_fr} ajouté`, "success");
  };

  // Modification quantité
  const handleUpdateQuantity = (cartItemId: string, delta: number) => {
    setCart(prev => {
      return prev
        .map(item => {
          if (item.cartItemId === cartItemId) {
            const nextQty = item.quantity + delta;
            return nextQty > 0 ? { ...item, quantity: nextQty } : null;
          }
          return item;
        })
        .filter((item): item is CartItem => item !== null);
    });
  };

  // Suppression d'article
  const handleRemoveItem = (cartItemId: string) => {
    setCart(prev => prev.filter(item => item.cartItemId !== cartItemId));
  };

  // Annulation commande
  const handleCancelOrder = () => {
    if (cart.length === 0) return;
    setCart([]);
    showToast("تم إلغاء وتفريغ السلة بنجاح", "info");
  };

  // Calculs totaux
  const subtotal = cart.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const totalItemsCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const activeDeliveryFee = orderType === "LIVRAISON" ? Number(deliveryFee) || 0 : 0;
  const totalAmount = subtotal + activeDeliveryFee;

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

  // Finaliser la vente, Déduire le stock des suppléments & Impression Double Tickets
  const handleFinalizeSale = async () => {
    if (cart.length === 0 || isProcessing) return;

    if (paymentMethod === "CASH" && tenderedNumeric < totalAmount) {
      showToast("Le montant reçu est inférieur au total", "warning");
      return;
    }

    setIsProcessing(true);
    try {
      const dailyOrderNumber = await salesService.getNextDailyOrderNumber();
      const cashierName = user?.name || "كاشير المحل";
      const cashierId = user?.id || "usr-cashier";

      const orderTypeLabel =
        orderType === "SUR_PLACE"
          ? `Sur Place - ${tableNumber}`
          : orderType === "A_EMPORTER"
          ? "À Emporter"
          : `Livraison - ${deliveryCustomerName || "Client"} (${deliveryPhone || "Sans tél"}) - ${deliveryAddress || "Sans adresse"}`;

      const sale: Sale = await checkoutService.processCheckout({
        cashierId,
        cashierName,
        sessionId: activeSession?.id,
        items: [
          ...cart.map(item => ({
            productId: item.productId,
            name: item.name,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discountAmount: 0,
            supplements: item.supplements,
            notes: item.notes
          })),
          ...(activeDeliveryFee > 0 ? [{
            productId: 'prod-delivery-fee',
            name: 'Frais de Livraison',
            quantity: 1,
            unitPrice: activeDeliveryFee,
            discountAmount: 0
          }] : [])
        ],
        payments: [
          {
            method: paymentMethod,
            amount: totalAmount,
            tenderedAmount: paymentMethod === "CASH" ? tenderedNumeric : totalAmount,
            changeGiven: changeGiven
          }
        ],
        notes: orderTypeLabel
      });

      // Déduction automatique du stock des suppléments vendus (en tenant compte des portions 2x, 3x)
      const supplementsToDeduct: Array<{ supplementId: string; quantity: number }> = [];
      for (const item of cart) {
        if (item.supplements && item.supplements.length > 0) {
          for (const s of item.supplements) {
            supplementsToDeduct.push({
              supplementId: s.id,
              quantity: ((s as any).quantity || 1) * item.quantity
            });
          }
        }
      }
      if (supplementsToDeduct.length > 0) {
        await supplementService.deductSupplementStock(supplementsToDeduct);
      }

      // Déduction automatique du stock des ingrédients de la recette (Backend SQLite)
      for (const item of cart) {
        try {
          if (item.productId && !item.productId.startsWith('multi-')) {
            await recipeService.deductRecipeIngredientsForSale(item.productId, item.quantity);
          } else if (item.multiParts && item.multiParts.length > 0) {
            // Pour Moitié-Moitié ou 4 Saisons : déduire proportionnellement les ingrédients de chaque partie
            const fraction = 1 / item.multiParts.length;
            for (const part of item.multiParts) {
              if (part.id) {
                await recipeService.deductRecipeIngredientsForSale(part.id, item.quantity * fraction);
              }
            }
          }
        } catch (recipeErr) {
          console.warn("Erreur déduction recette:", recipeErr);
        }
      }

      // Construction des données complètes pour tickets thermiques
      const validDailyOrderNum = (dailyOrderNumber && String(dailyOrderNumber) !== 'undefined' && !isNaN(Number(dailyOrderNumber)))
        ? Number(dailyOrderNumber)
        : 1;
      const validReceiptNum = (sale?.receipt_number && String(sale.receipt_number).trim() !== '' && String(sale.receipt_number) !== 'undefined')
        ? sale.receipt_number
        : `TK-${validDailyOrderNum}`;

      const receiptData: any = {
        saleId: sale?.id || `sale-${Date.now()}`,
        receiptNumber: validReceiptNum,
        dailyOrderNumber: validDailyOrderNum,
        dateTime: new Date().toLocaleString("fr-FR"),
        date: new Date().toLocaleDateString("fr-FR"),
        time: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
        cashierName: cashierName || "Caissier",
        orderType,
        tableNumber: orderType === "SUR_PLACE" ? tableNumber : undefined,
        deliveryFee: activeDeliveryFee,
        customerName: orderType === "LIVRAISON" ? deliveryCustomerName : undefined,
        customerPhone: orderType === "LIVRAISON" ? deliveryPhone : undefined,
        customerAddress: orderType === "LIVRAISON" ? deliveryAddress : undefined,
        driverName: orderType === "LIVRAISON" ? deliveryDriver : undefined,
        storeName: currentStore?.name_fr || currentStore?.name || "PIZZERIA GOURMET",
        storeNameFr: currentStore?.name_fr || currentStore?.name || "PIZZERIA GOURMET",
        storeNameAr: currentStore?.name_ar || "بيتزيريا",
        storeAddress: currentStore?.address || "",
        storePhone: currentStore?.phone || "",
        rcNumber: currentStore?.rc_number || "",
        nifNumber: currentStore?.nif_number || "",
        aiNumber: currentStore?.art_imposition || "",
        items: await Promise.all(cart.map(async i => {
          let baseIngredients: string[] = [];
          if (ingredientStatusMap[i.productId]?.recipeItems?.length) {
            baseIngredients = ingredientStatusMap[i.productId].recipeItems
              .map(r => r.ingredient_name_fr)
              .filter(Boolean);
          } else if (i.productId) {
            try {
              const details = await recipeService.getRecipeForProduct(i.productId);
              baseIngredients = details.map(d => d.ingredient_name_fr).filter(Boolean);
            } catch (e) {}
          }

          let partsWithIngredients: Array<{ name: string; price: number; ingredients?: string[] }> | undefined = undefined;
          if (i.multiParts && i.multiParts.length > 0) {
            partsWithIngredients = await Promise.all(i.multiParts.map(async p => {
              let partIngredients: string[] = [];
              if (p.id && ingredientStatusMap[p.id]?.recipeItems?.length) {
                partIngredients = ingredientStatusMap[p.id].recipeItems
                  .map(r => r.ingredient_name_fr)
                  .filter(Boolean);
              } else if (p.id) {
                try {
                  const details = await recipeService.getRecipeForProduct(p.id);
                  partIngredients = details.map(d => d.ingredient_name_fr).filter(Boolean);
                } catch (e) {}
              }
              return {
                name: p.name,
                price: p.price,
                ingredients: partIngredients
              };
            }));
          }

          return {
            name: i.name,
            variant: i.variant,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            total: i.quantity * i.unitPrice,
            ingredients: baseIngredients,
            supplements: i.supplements,
            multiParts: partsWithIngredients ? {
              type: '2_PARTS' as '2_PARTS',
              parts: partsWithIngredients
            } : undefined,
            notes: i.notes
          };
        })),
        totalTTC: totalAmount,
        paymentMethod: paymentMethod === "CASH" ? "CASH" : "CARD",
        tenderedAmount: paymentMethod === "CASH" ? tenderedNumeric : totalAmount,
        changeGiven: changeGiven,
        taxAmount: 0,
        currency: "DZD"
      };

      printerService.archiveReceipt(receiptData);
      setLastReceipt(receiptData);
      setShowPayModal(false);
      setCart([]);
      setShowReceiptModal(true);
      
      // Recharger immédiatement l'état des portions restantes pour mettre à jour les cartes
      try {
        const updatedStatus = await recipeService.getAllProductsIngredientStatus();
        setIngredientStatusMap(updatedStatus);
      } catch (reloadErr) {
        console.warn("Could not reload ingredient status", reloadErr);
      }

      // Ouverture automatique du tiroir-caisse pour les règlements en espèces
      if (paymentMethod === "CASH") {
        try {
          await printerService.kickCashDrawer(`Encaissement Espèces Commande #${validReceiptNum}`, user?.name || "Caissier", user?.role);
        } catch (drawerErr) {
          console.warn("Impulsion tiroir-caisse:", drawerErr);
        }
      }

      // Impression automatique si activée dans les paramètres
      const printerCfg = printerService.getConfig();
      if (printerCfg.autoPrint !== false) {
        try {
          await printerService.printBothTickets(receiptData, true);
          showToast("تم الدفع بنجاح وإرسال التيكت للطباعة !", "success");
        } catch (printErr) {
          console.warn("Impression directe:", printErr);
          showToast("تم تسجيل الطلب وتجهيز التيكت للمعاينة والطباعة", "success");
        }
      } else {
        showToast("تم تسجيل الطلب وتجهيز التيكت", "success");
      }
    } catch (err: any) {
      showToast(`Erreur d'encaissement : ${err?.message || err}`, "error");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex-1 flex overflow-hidden select-none bg-[#F7F8FA] font-sans">
      {/* ========================================================================= */}
      {/* COLONNE GAUCHE (70%) : MENU VISUEL PROPRE & DIRECT SANS BANNIÈRES ENCOMBRANTES */}
      {/* ========================================================================= */}
      <div className="flex-1 flex flex-col overflow-hidden border-r border-stone-200">
        {/* Barre Supérieure du Menu : Onglets Catégories, Moitié-Moitié, 4 Saisons & Recherche */}
        <div className="bg-white px-4 py-2.5 border-b border-stone-200 flex flex-col sm:flex-row items-center justify-between gap-2.5 shadow-2xs">
          {/* Onglets Catégories + Raccourcis Moitié-Moitié & 4 Saisons intégrés sobrement */}
          <div className="flex items-center space-x-1.5 overflow-x-auto w-full sm:w-auto pb-0.5 sm:pb-0 scrollbar-none">
            {categories.map(cat => {
              const isSelected = selectedCategory === cat.id;
              const IconComp = cat.icon;
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                    isSelected
                      ? "bg-[#E87524] text-white shadow-xs"
                      : "bg-stone-50 text-stone-700 hover:bg-orange-50 hover:text-[#E87524] border border-stone-200"
                  }`}
                >
                  <IconComp className="w-3.5 h-3.5 shrink-0" />
                  <span>{cat.label}</span>
                </button>
              );
            })}

            {/* Séparateur sobre */}
            <div className="h-5 w-[1px] bg-stone-200 mx-1 shrink-0" />

            {/* Bouton Pizza Moitié - Moitié */}
            <button
              onClick={() => {
                setMultiPartInitialMode("2_PARTS");
                setShowMultiPartModal(true);
              }}
              className="px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 bg-stone-50 hover:bg-orange-50 text-stone-700 hover:text-[#E87524] border border-stone-200 transition-all cursor-pointer whitespace-nowrap"
              title="Pizza 2 goûts (Moitié - Moitié)"
            >
              <Layers className="w-3.5 h-3.5 text-[#E87524]" />
              <span>Moitié - Moitié</span>
            </button>

            {/* Bouton Gérer les Suppléments & Stock (Réservé au Propriétaire / Admin - Interdit au caissier) */}
            {user?.role !== 'cashier' && (
              <button
                onClick={() => setShowSupplementsManager(true)}
                className="px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 bg-stone-50 hover:bg-orange-50 text-stone-600 hover:text-[#E87524] border border-stone-200 transition-all cursor-pointer whitespace-nowrap"
                title="Gérer les suppléments, coûts et stock"
              >
                <Settings2 className="w-3.5 h-3.5" />
                <span>Suppléments (Stock)</span>
              </button>
            )}
          </div>

          {/* Recherche rapide */}
          <div className="relative w-full sm:w-60">
            <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-2.5 pointer-events-none" />
            <input
              type="text"
              placeholder="Rechercher..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-7 py-1.5 rounded-lg bg-stone-50 border border-stone-200 text-xs text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-1 focus:ring-[#E87524]"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-2 text-stone-400 hover:text-stone-600"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Grille des Cartes Produits Pizzeria — Pure, simple et spacieuse */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          {filteredProducts.length === 0 && !showMultiPartCards ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 text-stone-400">
              <UtensilsCrossed className="w-10 h-10 text-[#E87524]/40 mb-2.5" />
              <p className="font-bold text-[#292522] text-xs">
                {products.length === 0 ? "Votre menu est vide" : "Aucun article trouvé"}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {/* Cartes Spéciales Pizzas dans la catégorie PIZZA : Moitié-Moitié et 4 Saisons */}
              {showMultiPartCards && (
                <>
                  {/* Carte Pizza Moitié - Moitié */}
                  <div
                    onClick={() => {
                      setMultiPartInitialMode("2_PARTS");
                      setShowMultiPartModal(true);
                    }}
                    className="bg-linear-to-br from-white to-[#FFF9F2] rounded-xl border-2 border-dashed border-[#E87524]/60 p-3 flex flex-col justify-between transition-all duration-150 cursor-pointer relative group select-none shadow-2xs hover:shadow-sm hover:border-[#E87524] active:scale-[0.99]"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <div className="w-9 h-9 rounded-lg bg-[#FFF3EB] border border-[#E87524]/30 text-[#E87524] flex items-center justify-center shadow-2xs group-hover:scale-105 transition-transform">
                          <Layers className="w-5 h-5 text-[#E87524]" />
                        </div>
                        <span className="bg-[#FFF3EB] text-[#E87524] font-black text-[11px] px-2 py-0.5 rounded border border-[#E87524]/20 font-mono">
                          حسب الذوق
                        </span>
                      </div>
                      <h3 className="font-bold text-[#292522] text-xs leading-tight group-hover:text-[#E87524] transition-colors">
                        بيتزا نصفين (Moitié - Moitié)
                      </h3>
                      <p className="text-[10px] text-stone-600 font-arabic line-clamp-1 mt-0.5" dir="rtl">
                        اختر نصفين بأذواق مختلفة في بيتزا واحدة
                      </p>
                      <span className="inline-block mt-1 text-[10px] font-bold text-[#E87524] bg-orange-100/70 px-1.5 py-0.5 rounded">
                        2 أذواق • 2 Saveurs
                      </span>
                    </div>
                    <div className="mt-2.5 pt-1.5 border-t border-[#E9DCCB]/60 flex items-center justify-between text-[11px] text-[#E87524] font-bold">
                      <span>تركيب البيتزا</span>
                      <div className="w-5 h-5 rounded-md bg-[#E87524] text-white flex items-center justify-center">
                        <Plus className="w-3 h-3" />
                      </div>
                    </div>
                  </div>
                </>
              )}
              {filteredProducts.map(product => {
                const isPizza = isPizzaProduct(product);
                const ingStatus = ingredientStatusMap[product.id];
                const isOutOfIngredients = isPizza && ingStatus?.hasRecipe && !ingStatus.isAvailable;
                const cartQty = cart
                  .filter(item => item.productId === product.id)
                  .reduce((sum, item) => sum + item.quantity, 0);

                return (
                  <div
                    key={product.id}
                    onClick={() => handleProductCardClick(product)}
                    className={`bg-white rounded-xl border p-3 flex flex-col justify-between transition-all duration-150 cursor-pointer relative group select-none shadow-2xs hover:shadow-sm active:scale-[0.99] ${
                      isOutOfIngredients
                        ? "border-amber-300 bg-amber-50/30 hover:border-amber-400"
                        : cartQty > 0
                        ? "border-[#E87524] ring-1 ring-[#E87524]/30 bg-[#FFFDFB]"
                        : "border-[#E9DCCB] hover:border-[#E87524]/60 hover:bg-[#FFFCF7]"
                    }`}
                  >
                    {/* Badge Quantité */}
                    {cartQty > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 bg-[#E87524] text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center shadow-sm ring-2 ring-white">
                        {cartQty}
                      </span>
                    )}

                    {/* Badge Disponibilité & Nombre de Pizzas Réalisables selon Ingrédients */}
                    {isPizza && ingStatus?.hasRecipe && (
                      <span className={`absolute -top-2 left-2 text-[10px] font-extrabold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-2xs border ${
                        ingStatus.maxPortions > 10
                          ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                          : ingStatus.maxPortions > 0
                          ? "bg-amber-50 text-amber-800 border-amber-300"
                          : "bg-rose-50 text-rose-700 border-rose-300"
                      }`}>
                        {ingStatus.maxPortions > 0 ? (
                          <>
                            <Pizza className="w-3 h-3 text-emerald-600 shrink-0 inline" />
                            <span>{ingStatus.maxPortions} متوفرة</span>
                          </>
                        ) : (
                          <>
                            <AlertTriangle className="w-3 h-3 text-rose-600 animate-pulse" />
                            <span>نفاد المقادير (0)</span>
                          </>
                        )}
                      </span>
                    )}
                    {isOutOfIngredients && !ingStatus?.hasRecipe && (
                      <span className="absolute -top-2 left-2 bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-extrabold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-2xs">
                        <AlertTriangle className="w-3 h-3 text-amber-600 animate-pulse" />
                        <span>نقص مقادير</span>
                      </span>
                    )}

                    <div>
                      {/* Photo réelle haute qualité ou Icône */}
                      {product.image_url ? (
                        <div className="w-full h-28 sm:h-32 rounded-xl overflow-hidden mb-2 bg-stone-100 border border-[#E9DCCB] relative flex items-center justify-center shadow-2xs">
                          <img
                            src={product.image_url}
                            alt={product.name_fr}
                            className={`w-full h-full object-cover group-hover:scale-105 transition-transform duration-200 ${
                              isOutOfIngredients ? "filter grayscale-30" : ""
                            }`}
                          />
                          <span className="absolute top-1.5 right-1.5 bg-black/75 backdrop-blur-xs text-white font-black text-[11px] px-1.5 py-0.5 rounded shadow-xs font-mono">
                            {CurrencyUtil.formatDZD(product.selling_price_ttc)}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between mb-2">
                          <div className={`w-9 h-9 rounded-lg border flex items-center justify-center shadow-2xs ${
                            isOutOfIngredients
                              ? "bg-amber-100 border-amber-300 text-amber-700"
                              : "bg-[#FFF8EF] border-[#E9DCCB] text-[#E87524]"
                          }`}>
                            {product.category_id === "cat-drink" ? (
                              <Coffee className="w-4 h-4" />
                            ) : product.category_id === "cat-dessert" ? (
                              <Cake className="w-4 h-4" />
                            ) : (
                              <Pizza className="w-4 h-4" />
                            )}
                          </div>
                          <span className="bg-[#FFF3EB] text-[#E87524] font-black text-xs px-2 py-0.5 rounded border border-[#E87524]/20 font-mono">
                            {CurrencyUtil.formatDZD(product.selling_price_ttc)}
                          </span>
                        </div>
                      )}

                      {/* Titre & Description */}
                      <h3 className="font-bold text-[#292522] text-xs leading-tight line-clamp-1 group-hover:text-[#E87524] transition-colors">
                        {product.name_fr}
                      </h3>
                      {product.name_ar && (
                        <p className="text-[10px] text-stone-500 font-arabic line-clamp-1 mt-0.5" dir="rtl">
                          {product.name_ar}
                        </p>
                      )}
                      {product.variant && (
                        <p className="text-[10px] text-stone-500 line-clamp-1 mt-1 leading-snug">
                          {product.variant}
                        </p>
                      )}
                    </div>

                    {/* Ligne inférieure simple */}
                    <div className="mt-2.5 pt-1.5 border-t border-[#E9DCCB]/60 flex items-center justify-between text-[11px] text-stone-600 font-semibold">
                      <span className="truncate max-w-[120px]">
                        {isPizza && ingStatus?.hasRecipe
                          ? (ingStatus.maxPortions > 0 ? `${ingStatus.maxPortions} متوفرة` : "نفاد المقادير")
                          : (isPizza ? "Choisir" : "Ajouter")}
                      </span>
                      <div className={`w-5 h-5 rounded-md flex items-center justify-center transition-colors ${
                        isOutOfIngredients
                          ? "bg-amber-200 text-amber-900 group-hover:bg-amber-300"
                          : "bg-[#FFF3EB] text-[#E87524] group-hover:bg-[#E87524] group-hover:text-white"
                      }`}>
                        {isOutOfIngredients ? <AlertTriangle className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
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
      {/* COLONNE DROITE (30%) : COMMANDE EN COURS, SERVICE & TOTAL                 */}
      {/* ========================================================================= */}
      <div className="w-84 lg:w-92 bg-white flex flex-col justify-between overflow-hidden shadow-xs shrink-0 border-l border-stone-200">
        {/* En-tête : Type de commande */}
        <div className="p-3 border-b border-stone-200 bg-stone-50 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Receipt className="w-4 h-4 text-[#E87524]" />
              <h2 className="font-extrabold text-xs text-stone-800">Commande en cours</h2>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  const last = lastReceipt || printerService.getLastReceipt();
                  if (last) {
                    setLastReceipt(last);
                    setShowReceiptModal(true);
                  } else {
                    showToast("لا يوجد تيكت سابق محفوظ للطباعة", "info");
                  }
                }}
                className="px-2 py-0.5 rounded-lg bg-orange-50 hover:bg-[#E87524] text-[#E87524] hover:text-white border border-[#E87524]/30 text-[10.5px] font-bold flex items-center gap-1 transition-all cursor-pointer shadow-2xs"
                title="Afficher et réimprimer le dernier ticket (آخر تيكيت)"
              >
                <Printer className="w-3 h-3" />
                <span>آخر تيكيت</span>
              </button>
              <span className="text-[11px] font-bold text-[#E87524] bg-white px-2 py-0.5 rounded-full border border-stone-200">
                {totalItemsCount} article{totalItemsCount > 1 ? "s" : ""}
              </span>
            </div>
          </div>

          {/* Toggle 3 Services Sobre : Sur Place / À Emporter / Livraison */}
          <div className="grid grid-cols-3 gap-1 bg-white p-1 rounded-lg border border-stone-200">
            <button
              onClick={() => setOrderType("SUR_PLACE")}
              className={`py-1.5 text-[11px] font-bold rounded transition-all flex items-center justify-center gap-1 cursor-pointer ${
                orderType === "SUR_PLACE"
                  ? "bg-[#E87524] text-white shadow-2xs"
                  : "text-stone-600 hover:text-[#292522]"
              }`}
            >
              <Utensils className="w-3 h-3" />
              <span>Sur Place</span>
            </button>

            <button
              onClick={() => setOrderType("A_EMPORTER")}
              className={`py-1.5 text-[11px] font-bold rounded transition-all flex items-center justify-center gap-1 cursor-pointer ${
                orderType === "A_EMPORTER"
                  ? "bg-[#E87524] text-white shadow-2xs"
                  : "text-stone-600 hover:text-[#292522]"
              }`}
            >
              <ShoppingBag className="w-3 h-3" />
              <span>À Emporter</span>
            </button>

            <button
              onClick={() => setOrderType("LIVRAISON")}
              className={`py-1.5 text-[11px] font-bold rounded transition-all flex items-center justify-center gap-1 cursor-pointer ${
                orderType === "LIVRAISON"
                  ? "bg-[#E87524] text-white shadow-2xs"
                  : "text-stone-600 hover:text-[#292522]"
              }`}
            >
              <Bike className="w-3 h-3" />
              <span>Livraison</span>
            </button>
          </div>

          {/* Configuration Sur Place */}
          {orderType === "SUR_PLACE" && (
            <div className="flex items-center gap-2 bg-white px-2.5 py-1 rounded-lg border border-[#E9DCCB]">
              <span className="text-xs font-bold text-stone-600 whitespace-nowrap">Table :</span>
              <input
                type="text"
                value={tableNumber}
                onChange={e => setTableNumber(e.target.value)}
                placeholder=""
                className="w-full text-xs font-bold text-[#292522] bg-transparent focus:outline-none"
              />
            </div>
          )}

          {/* Configuration Service Livraison (Simple, Directe et Sobre) */}
          {orderType === "LIVRAISON" && (
            <div className="bg-white rounded-lg border border-[#E9DCCB] p-2 space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-stone-700 flex items-center gap-1">
                  <Bike className="w-3.5 h-3.5 text-[#E87524]" />
                  <span>Frais / Gain Livreur :</span>
                </span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={0}
                    step={10}
                    value={deliveryFee}
                    onChange={e => setDeliveryFee(parseFloat(e.target.value) || 0)}
                    className="w-16 px-1.5 py-0.5 rounded border border-[#E9DCCB] text-xs font-bold font-mono text-[#E87524] text-right bg-stone-50"
                  />
                  <span className="text-[11px] text-stone-500 font-bold">DA</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <input
                  type="tel"
                  value={deliveryPhone}
                  onChange={e => setDeliveryPhone(e.target.value)}
                  placeholder=""
                  className="w-full px-2 py-1 rounded border border-[#E9DCCB] text-[11px] font-mono bg-white focus:outline-none"
                />
                <input
                  type="text"
                  value={deliveryCustomerName}
                  onChange={e => setDeliveryCustomerName(e.target.value)}
                  placeholder=""
                  className="w-full px-2 py-1 rounded border border-[#E9DCCB] text-[11px] bg-white focus:outline-none"
                />
              </div>

              <input
                type="text"
                value={deliveryAddress}
                onChange={e => setDeliveryAddress(e.target.value)}
                placeholder=""
                className="w-full px-2 py-1 rounded border border-[#E9DCCB] text-[11px] bg-white focus:outline-none"
              />
            </div>
          )}
        </div>

        {/* Liste des Articles dans la Commande */}
        <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-stone-400 select-none">
              <Pizza className="w-8 h-8 text-[#E87524]/60 mb-1.5" />
              <p className="font-bold text-stone-600 text-xs">Commande vide</p>
              <p className="text-[11px] text-stone-400 mt-0.5">
                Sélectionnez les pizzas et boissons
              </p>
            </div>
          ) : (
            cart.map(item => (
              <div
                key={item.cartItemId}
                className="bg-[#FFFDFB] rounded-lg border border-[#E9DCCB] p-2 flex flex-col gap-1 shadow-2xs"
              >
                <div className="flex items-center justify-between gap-1.5">
                  <div className="flex-1 min-w-0 pr-1">
                    <h4 className="font-bold text-xs text-[#292522] truncate">{item.name}</h4>
                    <span className="text-[11px] text-[#E87524] font-semibold font-mono">
                      {CurrencyUtil.formatDZD(item.unitPrice)}
                    </span>
                  </div>

                  {/* Contrôles Quantité (-) [qty] (+) */}
                  <div className="flex items-center gap-1 bg-white border border-[#E9DCCB] rounded p-0.5 shrink-0">
                    <button
                      onClick={() => handleUpdateQuantity(item.cartItemId, -1)}
                      className="w-5 h-5 rounded flex items-center justify-center text-stone-600 hover:bg-stone-100 transition-colors cursor-pointer"
                      title="Diminuer"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="w-5 text-center font-bold text-xs text-[#292522]">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => handleUpdateQuantity(item.cartItemId, 1)}
                      className="w-5 h-5 rounded flex items-center justify-center text-stone-600 hover:bg-stone-100 transition-colors cursor-pointer"
                      title="Augmenter"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Total Ligne & Bouton Poubelle */}
                  <div className="text-right pl-1 flex items-center gap-1 shrink-0">
                    <span className="font-bold text-xs text-[#292522] font-mono">
                      {CurrencyUtil.formatDZD(item.quantity * item.unitPrice)}
                    </span>
                    <button
                      onClick={() => handleRemoveItem(item.cartItemId)}
                      className="text-stone-400 hover:text-red-600 p-0.5 rounded transition-colors cursor-pointer"
                      title="Supprimer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Composition Multi-Parts */}
                {item.multiParts && item.multiParts.length > 0 && (
                  <div className="text-[10px] text-stone-600 bg-stone-50 px-1.5 py-0.5 rounded border border-stone-200">
                    {item.multiParts.map(p => p.name).join(" + ")}
                  </div>
                )}

                {/* Suppléments / Extras */}
                {item.supplements && item.supplements.length > 0 && (
                  <div className="text-[10px] text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 flex items-center gap-1 flex-wrap">
                    <span className="font-bold">+ Extras :</span>
                    <span>
                      {item.supplements
                        .map(s => `${(s as any).quantity > 1 ? `${(s as any).quantity}x ` : ''}${s.name_fr || (s as any).name}`)
                        .join(", ")}
                    </span>
                  </div>
                )}

                {/* Notes Chef */}
                {item.notes && (
                  <div className="text-[10px] text-amber-900 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 italic">
                    Note : {item.notes}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Pied de Commande : Totaux & Encaissement Direct */}
        <div className="p-3 border-t border-stone-200 bg-stone-50 space-y-2">
          <div className="flex items-center justify-between text-xs text-stone-600 font-medium">
            <span>Sous-total</span>
            <span className="font-mono">{CurrencyUtil.formatDZD(subtotal)}</span>
          </div>

          {orderType === "LIVRAISON" && (
            <div className="flex items-center justify-between text-xs text-[#E87524] font-bold">
              <span>Frais de Livraison</span>
              <span className="font-mono">+{CurrencyUtil.formatDZD(activeDeliveryFee)}</span>
            </div>
          )}

          <div className="flex items-center justify-between pt-1 border-t border-stone-200">
            <span className="font-extrabold text-xs text-stone-800">TOTAL À PAYER</span>
            <span className="font-black text-xl text-[#E87524] font-mono tracking-tight">
              {CurrencyUtil.formatDZD(totalAmount)}
            </span>
          </div>

          <div className="grid grid-cols-4 gap-2 pt-0.5">
            <button
              onClick={handleCancelOrder}
              disabled={cart.length === 0}
              className="col-span-1 py-2.5 bg-white hover:bg-red-50 text-stone-500 hover:text-red-700 border border-stone-200 rounded-lg font-bold text-xs flex flex-col items-center justify-center transition-all disabled:opacity-40 cursor-pointer"
              title="Annuler la commande"
            >
              <Trash2 className="w-3.5 h-3.5 mb-0.5" />
              <span className="text-[9px]">Annuler</span>
            </button>

            <button
              onClick={handleStartCheckout}
              disabled={cart.length === 0}
              className="col-span-3 py-2.5 bg-[#E87524] hover:bg-[#D46317] active:bg-[#B9362B] text-white rounded-lg font-black text-sm flex items-center justify-center gap-1.5 shadow-sm transition-all disabled:opacity-40 active:scale-[0.99] cursor-pointer"
            >
              <CheckCircle className="w-4 h-4" />
              <span>ENCAISSER ({CurrencyUtil.formatDZD(totalAmount)})</span>
            </button>
          </div>
        </div>
      </div>

      {/* Modal de Règlement Simple */}
      {showPayModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 select-none backdrop-blur-xs">
          <div className="bg-white border border-stone-200 w-full max-w-sm rounded-xl shadow-2xl overflow-hidden flex flex-col text-xs text-stone-800">
            <div className="px-4 py-3 border-b border-stone-200 bg-stone-50 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-extrabold text-stone-800">Règlement de la Commande</h3>
                <p className="text-[11px] text-stone-500">
                  {orderType === "SUR_PLACE" ? `Sur Place (${tableNumber})` : orderType === "A_EMPORTER" ? "À Emporter" : "Livraison"} • {totalItemsCount} article{totalItemsCount > 1 ? "s" : ""}
                </p>
              </div>
              <button
                onClick={() => setShowPayModal(false)}
                className="text-stone-400 hover:text-stone-600 p-1 rounded hover:bg-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              <div className="bg-stone-50/70 p-3 rounded-lg border border-stone-200 text-center">
                <span className="text-[10px] text-stone-500 font-semibold uppercase tracking-wider">Montant Total</span>
                <p className="text-2xl font-black text-[#E87524] font-mono mt-0.5">
                  {CurrencyUtil.formatDZD(totalAmount)}
                </p>
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1 text-xs">Moyen de paiement</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentMethod("CASH");
                      setTenderedInput(totalAmount.toString());
                    }}
                    className={`p-2.5 rounded-lg border flex items-center justify-center gap-1.5 font-bold text-xs transition-all cursor-pointer ${
                      paymentMethod === "CASH"
                        ? "bg-[#FFF3EB] border-[#E87524] text-[#E87524]"
                        : "bg-white border-[#E9DCCB] text-[#292522] hover:bg-stone-50"
                    }`}
                  >
                    <Banknote className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Espèces (Cash)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setPaymentMethod("EDAHABIA");
                      setTenderedInput(totalAmount.toString());
                    }}
                    className={`p-2.5 rounded-lg border flex items-center justify-center gap-1.5 font-bold text-xs transition-all cursor-pointer ${
                      paymentMethod !== "CASH"
                        ? "bg-[#FFF3EB] border-[#E87524] text-[#E87524]"
                        : "bg-white border-[#E9DCCB] text-[#292522] hover:bg-stone-50"
                    }`}
                  >
                    <CreditCard className="w-3.5 h-3.5 text-blue-600" />
                    <span>Carte CIB / Dahabia</span>
                  </button>
                </div>
              </div>

              {paymentMethod === "CASH" && (
                <div className="space-y-2 bg-stone-50 p-2.5 rounded-lg border border-stone-200">
                  <div className="flex justify-between items-center mb-0.5">
                    <label className="font-bold text-stone-700 text-xs">Montant Reçu (DZD)</label>
                    <div className="flex gap-1 font-mono text-[9px]">
                      {[totalAmount, Math.ceil(totalAmount / 500) * 500, Math.ceil(totalAmount / 1000) * 1000].filter((v, i, a) => v >= totalAmount && a.indexOf(v) === i).slice(0, 3).map(val => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setTenderedInput(val.toString())}
                          className="px-1.5 py-0.5 rounded bg-white border border-stone-200 hover:border-orange-300 text-stone-700 cursor-pointer"
                        >
                          {val}
                        </button>
                      ))}
                    </div>
                  </div>
                  <input
                    type="number"
                    min={totalAmount}
                    value={tenderedInput}
                    onChange={e => setTenderedInput(e.target.value)}
                    className="w-full text-base font-black font-mono text-center py-1.5 px-2 bg-white border border-stone-200 rounded text-stone-800 focus:ring-1 focus:ring-[#E87524] focus:outline-none"
                    autoFocus
                  />

                  <div className="flex items-center justify-between bg-white p-2 rounded border border-stone-200">
                    <span className="font-bold text-xs text-stone-600">Monnaie à rendre :</span>
                    <span className="font-black text-base text-emerald-600 font-mono">
                      {CurrencyUtil.formatDZD(changeGiven)}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="p-3 border-t border-stone-200 bg-stone-50 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setShowPayModal(false)}
                className="px-3 py-2 rounded-lg border border-stone-200 bg-white font-bold text-xs text-stone-600 hover:bg-stone-100 transition-colors cursor-pointer"
              >
                Retour
              </button>

              <button
                type="button"
                onClick={handleFinalizeSale}
                disabled={isProcessing || (paymentMethod === "CASH" && tenderedNumeric < totalAmount)}
                className="flex-1 py-2 rounded-lg bg-[#E87524] hover:bg-[#D46317] text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all disabled:opacity-40 cursor-pointer"
              >
                <CheckCircle className="w-3.5 h-3.5" />
                <span>{isProcessing ? "Validation..." : "Valider & Imprimer 2 Tickets"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Personnalisation Pizza & Suppléments */}
      {customizingProduct && (
        <PizzaCustomizerModal
          isOpen={true}
          product={customizingProduct}
          onClose={() => setCustomizingProduct(null)}
          onAddToCart={handleAddCustomizedPizza}
          onOpenSupplementsManager={() => {
            setCustomizingProduct(null);
            setShowSupplementsManager(true);
          }}
        />
      )}

      {/* Modal Pizza Moitié-Moitié (2 Saisons) */}
      {showMultiPartModal && (
        <MultiPartPizzaModal
          isOpen={true}
          availablePizzas={products}
          onClose={() => setShowMultiPartModal(false)}
          onAddToCart={handleAddMultiPartPizza}
        />
      )}

      {/* Modal Gestion des Suppléments & Stock */}
      {showSupplementsManager && (
        <SupplementsManagerModal
          isOpen={true}
          onClose={() => setShowSupplementsManager(false)}
        />
      )}

      {/* Modal Aperçu Double Tickets (Client + Chef) */}
      {showReceiptModal && lastReceipt && (
        <ReceiptModal
          isOpen={true}
          receiptData={lastReceipt}
          onClose={() => setShowReceiptModal(false)}
        />
      )}

      {/* Modal Caisse : Ingrédients Épuisés & Demande d'Approvisionnement Rapide */}
      {outOfStockModalProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 select-none backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white border border-stone-200 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col text-xs text-stone-800">
            <div className="px-5 py-4 border-b border-stone-200 bg-stone-50 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-stone-800">
                    المقادير غير كافية لتحضير البيتزا
                  </h3>
                  <p className="text-[11px] text-amber-800 font-bold">
                    {outOfStockModalProduct.name_fr}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setOutOfStockModalProduct(null)}
                className="text-stone-400 hover:text-stone-700 p-1.5 rounded-lg hover:bg-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 leading-relaxed text-[11px]">
                ⚠️ لا يمكن تسجيل طلب هذه البيتزا حالياً لأن مخزون المطبخ من المواد الأولية نفد أو غير كافٍ.
              </div>

              {/* Liste des ingrédients manquants */}
              {(() => {
                const status = ingredientStatusMap[outOfStockModalProduct.id];
                const missing = status?.missingIngredients || [];
                return (
                  <div className="space-y-2">
                    <div className="font-extrabold text-stone-700 text-xs">
                      المقادير الناقصة في المطبخ ({missing.length}):
                    </div>
                    <div className="divide-y divide-stone-100 border border-[#E9DCCB] rounded-xl overflow-hidden bg-[#FFFDFB]">
                      {missing.map(m => (
                        <div key={m.ingredient_id} className="p-2.5 flex items-center justify-between text-xs">
                          <div>
                            <span className="font-bold text-[#292522]">{m.name_fr}</span>
                            {m.name_ar && <span className="text-[10px] text-stone-500 mr-1.5">({m.name_ar})</span>}
                            <div className="text-[10px] text-red-600 font-bold">
                              المطلوب: {m.quantity_required} {m.unit} | المتوفر: {m.current_stock} {m.unit}
                            </div>
                          </div>
                          {/* Restock rapide +5 */}
                          <button
                            onClick={async () => {
                              setIsRestockingFromPos(true);
                              try {
                                await recipeService.quickRestockIngredient(m.ingredient_id, 5, 'Réapprovisionnement rapide comptoir');
                                showToast(`تمت إضافة +5 ${m.unit} إلى ${m.name_fr}`, 'success');
                                await loadProducts();
                                setOutOfStockModalProduct(null);
                              } catch (err: any) {
                                showToast(`Erreur : ${err?.message || err}`, 'error');
                              } finally {
                                setIsRestockingFromPos(false);
                              }
                            }}
                            disabled={isRestockingFromPos}
                            className="px-2.5 py-1 rounded-lg bg-[#FFF3EB] hover:bg-[#E87524] hover:text-white text-[#E87524] border border-[#E9DCCB] font-bold text-[11px] transition-colors"
                            title="تزويد المطبخ بـ +5 وحدة فوراً"
                          >
                            +5 {m.unit}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Action : Envoyer demande d'approvisionnement */}
              <div className="pt-2">
                <button
                  onClick={async () => {
                    const status = ingredientStatusMap[outOfStockModalProduct.id];
                    const missing = status?.missingIngredients || [];
                    for (const m of missing) {
                      await recipeService.requestIngredientRestock({
                        ingredientId: m.ingredient_id,
                        productName: outOfStockModalProduct.name_fr,
                        requestedBy: user?.name || 'كاشير المحل'
                      });
                    }
                    setOutOfStockRequested(true);
                    showToast('تم إرسال طلب المقادير لمالك المحل في احتياجات المتجر بنجاح', 'success');
                  }}
                  disabled={outOfStockRequested}
                  className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer ${
                    outOfStockRequested
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 cursor-default'
                      : 'bg-[#E87524] hover:bg-[#D46317] text-white'
                  }`}
                >
                  {outOfStockRequested ? (
                    <>
                      <CheckCircle className="w-4 h-4 text-emerald-600" />
                      <span>تم إرسال الطلب لمالك المحل</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>طلب المقادير من الإدارة (إرسال لاحتياجات المتجر)</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="px-5 py-3 border-t border-stone-200 bg-stone-50 flex justify-end">
              <button
                onClick={() => setOutOfStockModalProduct(null)}
                className="px-4 py-1.5 rounded-lg bg-stone-200 hover:bg-stone-300 text-stone-700 font-bold text-xs"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
