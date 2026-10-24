// Pizzeria POS Algérie — Section des Besoins du Magasin (Store Needs & Approvisionnement)
// Permet au Caissier de signaler les produits, ingrédients et fournitures manquants,
// et permet à l'Owner de savoir exactement quoi acheter pour le réapprovisionnement de la pizzeria.

import React, { useState, useEffect } from "react";
import { storeNeedsService, StoreNeed } from "../../services/storeNeeds.service";
import { useAuth } from "../../hooks/useAuth";
import { useToast } from "../common/Toast";
import {
  ClipboardList,
  Plus,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Trash2,
  X,
  Package,
  User,
  Check,
  RotateCcw
} from "lucide-react";

export const StoreNeedsView: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [needs, setNeeds] = useState<StoreNeed[]>([]);
  const [filter, setFilter] = useState<"ALL" | "PENDING" | "COMPLETED">("PENDING");
  const [showAddModal, setShowAddModal] = useState<boolean>(false);

  // Formulaire d'ajout
  const [itemName, setItemName] = useState("");
  const [quantityNeeded, setQuantityNeeded] = useState("");
  const [urgency, setUrgency] = useState<"NORMAL" | "URGENT">("NORMAL");
  const [notes, setNotes] = useState("");

  const isOwner = user?.role === "owner" || user?.role === "manager";

  const loadNeeds = async () => {
    const list = await storeNeedsService.getNeeds(filter);
    setNeeds(list);
  };

  useEffect(() => {
    loadNeeds();
    const handleUpdate = () => loadNeeds();
    window.addEventListener("store_needs_updated", handleUpdate);
    return () => window.removeEventListener("store_needs_updated", handleUpdate);
  }, [filter]);

  const handleAddNeed = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemName.trim()) {
      showToast("Veuillez saisir le nom du produit ou fourniture", "warning");
      return;
    }

    try {
      const requester = user?.name || "Caissier";
      await storeNeedsService.addNeed({
        item_name: itemName,
        quantity_needed: quantityNeeded,
        urgency,
        notes,
        requested_by: requester
      });

      showToast("Besoin enregistré pour le propriétaire !", "success");
      setItemName("");
      setQuantityNeeded("");
      setUrgency("NORMAL");
      setNotes("");
      setShowAddModal(false);
      loadNeeds();
    } catch (err: any) {
      showToast(`Erreur : ${err?.message || err}`, "error");
    }
  };

  const handleMarkCompleted = async (id: string) => {
    try {
      await storeNeedsService.markAsCompleted(id);
      showToast("Article marqué comme acheté / réapprovisionné (تم إنهاء الاحتياج)", "success");
      loadNeeds();
    } catch (err: any) {
      showToast(`Erreur : ${err?.message || err}`, "error");
    }
  };

  const handleMarkPending = async (id: string) => {
    try {
      await storeNeedsService.markAsPending(id);
      showToast("Demande remise en attente d'achat (أعيد لقيد الانتظار)", "info");
      loadNeeds();
    } catch (err: any) {
      showToast(`Erreur : ${err?.message || err}`, "error");
    }
  };

  const handleDelete = async (id: string, name: string) => {
    try {
      await storeNeedsService.deleteNeed(id);
      showToast(`Demande "${name}" supprimée`, "info");
      loadNeeds();
    } catch (err: any) {
      showToast(`Erreur : ${err?.message || err}`, "error");
    }
  };

  const pendingCount = needs.filter(n => n.status === "PENDING").length;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#F7F8FA] font-sans select-none text-xs">
      {/* En-tête sobre */}
      <div className="bg-white px-5 py-3.5 border-b border-stone-200 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-2xs">
        <div>
          <h1 className="text-base font-extrabold text-stone-900 flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-[#E87524]" />
            <span>Besoins & Approvisionnement du Magasin</span>
          </h1>
          <p className="text-xs text-stone-500 mt-0.5">
            {isOwner
              ? "Liste des produits, ingrédients et fournitures manquants signalés par la caisse à réapprovisionner."
              : "Signalez au propriétaire (Owner) les produits et fournitures dont le magasin a besoin."}
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="w-full sm:w-auto px-4 py-2 rounded-xl bg-[#E87524] hover:bg-[#D46317] text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>+ Signaler un Produit Manquant</span>
        </button>
      </div>

      {/* Barre de Filtres */}
      <div className="px-5 py-2.5 bg-white/70 border-b border-[#E9DCCB] flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setFilter("PENDING")}
            className={`px-3 py-1 rounded-lg font-bold text-xs transition-all cursor-pointer ${
              filter === "PENDING"
                ? "bg-[#E87524] text-white shadow-2xs"
                : "bg-white text-stone-600 hover:bg-[#FFF3EB] border border-[#E9DCCB]"
            }`}
          >
            En Attente d'Achat ({pendingCount})
          </button>

          <button
            onClick={() => setFilter("COMPLETED")}
            className={`px-3 py-1 rounded-lg font-bold text-xs transition-all cursor-pointer ${
              filter === "COMPLETED"
                ? "bg-[#E87524] text-white shadow-2xs"
                : "bg-white text-stone-600 hover:bg-[#FFF3EB] border border-[#E9DCCB]"
            }`}
          >
            Achetés / Réglés
          </button>

          <button
            onClick={() => setFilter("ALL")}
            className={`px-3 py-1 rounded-lg font-bold text-xs transition-all cursor-pointer ${
              filter === "ALL"
                ? "bg-[#E87524] text-white shadow-2xs"
                : "bg-white text-stone-600 hover:bg-[#FFF3EB] border border-[#E9DCCB]"
            }`}
          >
            Tous
          </button>
        </div>
      </div>

      {/* Liste des Besoins */}
      <div className="flex-1 overflow-y-auto p-5 space-y-2.5">
        {needs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 text-stone-400">
            <Package className="w-10 h-10 text-[#E87524]/40 mb-2" />
            <p className="font-bold text-[#292522] text-xs">
              {filter === "PENDING" ? "Aucun besoin en attente !" : "Aucune demande trouvée"}
            </p>
            <p className="text-[11px] text-stone-500 mt-1 max-w-sm">
              Tout est bien approvisionné pour l'instant. Cliquez sur le bouton en haut pour signaler un besoin.
            </p>
          </div>
        ) : (
          needs.map(need => {
            const isUrgent = need.urgency === "URGENT";
            const isCompleted = need.status === "COMPLETED";

            return (
              <div
                key={need.id}
                className={`p-3.5 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs transition-all ${
                  isCompleted
                    ? "bg-stone-50/70 border-stone-200 opacity-70"
                    : isUrgent
                    ? "bg-red-50/40 border-red-200"
                    : "bg-white border-[#E9DCCB]"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {/* Badge Urgence */}
                    {isUrgent ? (
                      <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded text-[10px] font-black uppercase flex items-center gap-1 border border-red-200">
                        <AlertTriangle className="w-3 h-3" />
                        <span>Urgent / Rupture</span>
                      </span>
                    ) : (
                      <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-[10px] font-bold border border-blue-200">
                        Normal
                      </span>
                    )}

                    {/* Statut Acheté */}
                    {isCompleted && (
                      <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Acheté</span>
                      </span>
                    )}

                    {/* Titre Produit */}
                    <h3 className="font-extrabold text-sm text-[#292522] truncate">
                      {need.item_name}
                    </h3>
                  </div>

                  {/* Quantité & Détails */}
                  <div className="text-xs text-stone-600 flex flex-wrap items-center gap-x-4 gap-y-1">
                    {need.quantity_needed && (
                      <span>
                        Quantité nécessaire : <strong className="text-stone-900">{need.quantity_needed}</strong>
                      </span>
                    )}

                    <span className="flex items-center gap-1 text-[11px] text-stone-400">
                      <User className="w-3 h-3" />
                      <span>{need.requested_by}</span>
                    </span>

                    <span className="flex items-center gap-1 text-[11px] text-stone-400">
                      <Clock className="w-3 h-3" />
                      <span>{new Date(need.created_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</span>
                    </span>
                  </div>

                  {/* Remarque */}
                  {need.notes && (
                    <p className="text-[11px] text-stone-700 mt-1.5 italic bg-[#FFF8EF]/80 px-2.5 py-1 rounded border border-[#E9DCCB]/60">
                      Note : {need.notes}
                    </p>
                  )}
                </div>

                {/* Actions : إنهاء الاحتياج / Marquer comme Terminé, ou Rétablir, ou Supprimer */}
                <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                  {!isCompleted ? (
                    <button
                      type="button"
                      onClick={() => handleMarkCompleted(need.id)}
                      className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                      title="إنهاء هذا الاحتياج (تم توفيره أو شراؤه) / Marquer comme Terminé"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>إنهاء الاحتياج / Terminer</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleMarkPending(need.id)}
                      className="px-3 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs flex items-center gap-1.5 border border-stone-300 transition-colors cursor-pointer"
                      title="إعادة الفتح وقيد الانتظار / Remettre en attente"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>إعادة الفتح / Rétablir</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleDelete(need.id, need.item_name)}
                    className="p-1.5 rounded-lg text-stone-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                    title="Supprimer la demande (حذف)"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal d'Ajout d'un Besoin */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 select-none backdrop-blur-xs">
          <div className="bg-white border border-stone-200 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col text-xs text-stone-800">
            <div className="px-5 py-4 border-b border-stone-200 bg-stone-50 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-extrabold text-stone-800">Signaler un Produit / Fourniture Manquante</h3>
                <p className="text-[11px] text-stone-500">
                  Cette information sera immédiatement visible par le propriétaire pour les achats.
                </p>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-stone-400 hover:text-stone-600 p-1 rounded hover:bg-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddNeed} className="p-5 space-y-3.5">
              <div>
                <label className="block text-stone-700 font-bold mb-1">
                  Nom de l'article / Produit / Ingrédient nécessaire *
                </label>
                <input
                  type="text"
                  placeholder="ex: Fromage Mozzarella, Boîtes 33cm, Serviettes, Coca 33cl..."
                  value={itemName}
                  onChange={e => setItemName(e.target.value)}
                  className="w-full px-3 py-2 bg-[#FFF8EF]/50 border border-[#E9DCCB] rounded-xl text-xs focus:ring-1 focus:ring-[#E87524] outline-none"
                  autoFocus
                  required
                />
                {/* Raccourcis rapides d'articles courants / مستهلكات وتغليف */}
                <div className="flex flex-wrap gap-1 mt-2">
                  {[
                    { label: "علب بيتزا", val: "Boîtes à Pizza" },
                    { label: "ورق مناديل", val: "Serviettes en papier" },
                    { label: "أكياس تغليف", val: "Sacs emballage kraft" },
                    { label: "رول ورق caisse", val: "Rouleaux papier caisse 80mm" },
                    { label: "مواد تنظيف", val: "Produits de nettoyage & javel" },
                    { label: "جبن موزاريلا", val: "Mozzarella râpée" },
                    { label: "فرينة بيتزا", val: "Farine pizza T55" },
                    { label: "صلصة طماطم", val: "Sauce tomate pizza" }
                  ].map((sug, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setItemName(sug.val)}
                      className="px-2 py-0.5 rounded-lg bg-stone-100 hover:bg-[#FFF3EB] hover:text-[#E87524] text-[10px] text-stone-600 border border-stone-200 transition-colors cursor-pointer"
                    >
                      {sug.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-stone-700 font-bold mb-1">
                  Quantité nécessaire estimée
                </label>
                <input
                  type="text"
                  placeholder="ex: 5 cartons, 10 kg, 20 pièces..."
                  value={quantityNeeded}
                  onChange={e => setQuantityNeeded(e.target.value)}
                  className="w-full px-3 py-2 bg-[#FFF8EF]/50 border border-[#E9DCCB] rounded-xl text-xs focus:ring-1 focus:ring-[#E87524] outline-none"
                />
              </div>

              <div>
                <label className="block text-stone-700 font-bold mb-1">Degré d'urgence</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setUrgency("NORMAL")}
                    className={`py-2 px-3 rounded-xl border font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      urgency === "NORMAL"
                        ? "bg-blue-50 border-blue-400 text-blue-700 ring-1 ring-blue-300"
                        : "bg-white border-[#E9DCCB] text-stone-600 hover:bg-stone-50"
                    }`}
                  >
                    <span>Normal (Prévoyance)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setUrgency("URGENT")}
                    className={`py-2 px-3 rounded-xl border font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      urgency === "URGENT"
                        ? "bg-red-50 border-red-400 text-red-700 ring-1 ring-red-300"
                        : "bg-white border-[#E9DCCB] text-stone-600 hover:bg-stone-50"
                    }`}
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Urgent (Rupture)</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-stone-700 font-bold mb-1">
                  Remarque / Précision pour le propriétaire (optionnel)
                </label>
                <textarea
                  rows={2}
                  placeholder="ex: Il reste seulement 2 paquets dans la réserve..."
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-[#FFF8EF]/50 border border-[#E9DCCB] rounded-xl text-xs focus:ring-1 focus:ring-[#E87524] outline-none"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl border border-[#E9DCCB] bg-white text-stone-600 hover:bg-stone-100 font-bold text-xs cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-[#E87524] hover:bg-[#D46317] text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
                >
                  Enregistrer le Besoin
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
