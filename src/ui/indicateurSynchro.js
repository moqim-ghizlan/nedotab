import { el } from "./dom.js";

const ETATS = {
  synchronise: { symbole: "✓", libelle: "Synchronisé" },
  attente: { symbole: "⟳", libelle: "Envoi en attente" },
  erreur: { symbole: "⚠", libelle: "Synchronisation impossible" },
};

/**
 * Small badge on the account avatar: ✓ synced, ⟳ write pending, ⚠ error (message on hover,
 * retry on click). No permanent animation.
 */
export function creerIndicateurSynchro(synchro) {
  const pastille = el("button", { type: "button", class: "indicateur-synchro", hidden: true });
  pastille.addEventListener("click", (e) => {
    e.stopPropagation();
    if (synchro.lire().statut === "erreur") synchro.reessayer();
  });
  const rendre = (s) => {
    const info = s.mode === "compte" ? ETATS[s.statut] : null;
    pastille.hidden = !info;
    if (!info) return;
    pastille.dataset.statut = s.statut;
    pastille.textContent = info.symbole;
    const message =
      s.statut === "erreur" && s.erreur ? `${s.erreur} — cliquer pour réessayer` : info.libelle;
    pastille.title = message;
    pastille.setAttribute("aria-label", message);
  };
  rendre(synchro.lire());
  synchro.abonner(rendre);
  return pastille;
}
