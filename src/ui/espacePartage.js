import { libelleAppareil } from "../core/appareil.js";
import {
  LIMITE_CARACTERES,
  LIMITE_ELEMENTS,
  PAGE_ELEMENTS,
  apercu,
  creerElement,
  detecterType,
  estPlein,
  ilYA,
  longueur,
  trier,
  trouverDoublon,
  urlSure,
  validerContenu,
} from "../core/espacePartage.js";
import { domaine } from "../core/url.js";
import { el } from "./dom.js";
import { vibrer } from "./haptique.js";
import { toast } from "./toast.js";

const CLE_VU = "nedotab:partageVu";

/**
 * Sharing space panel (V4.24): texts and links sent from one device to the others. A side
 * panel (380 px) on a wide screen, a full-screen sheet on a phone. Everything the user or a
 * copied page wrote is shown with textContent, never innerHTML; a link is clickable only when
 * its address is http or https.
 *
 * @param {object} d
 * @param {import("../core/store.js").Store} d.store
 * @param {() => boolean} d.disponible signed in and synchronised (account mode)
 * @param {() => Promise<object>} d.charger loads the Firebase module
 * @param {() => string|null} d.uid
 * @param {(texte: string) => Promise<void>} [d.copier]
 */
export function creerEspacePartage({ store, disponible, charger, uid, copier = copierTexte }) {
  let ouvert = false;
  let elements = [];
  let compteur = 0;
  let statut = "chargement"; // chargement | ok | erreur
  let depuisCache = false;
  let limite = PAGE_ELEMENTS;
  let peutPlus = false;
  let arret = [];
  let retourFocus = null;
  let envoiEnCours = false;
  const erreurs = new Map(); // contenu → message, for "Réessayer"

  // --- Elements of the DOM --------------------------------------------------------------------
  const pastille = el("span", { class: "partage-pastille", hidden: true, "aria-hidden": "true" });
  const bouton = el(
    "button",
    {
      type: "button",
      class: "partage-bouton",
      "aria-label": "Espace de partage",
      title: "Espace de partage",
      hidden: true,
      onclick: () => (ouvert ? fermer() : ouvrir()),
    },
    el("span", { class: "partage-bouton-icone", "aria-hidden": "true", texte: "⇄" }),
    pastille,
  );
  const champ = el("textarea", {
    id: "partage-champ",
    class: "partage-champ",
    rows: "3",
    placeholder: "Texte ou lien à envoyer",
    "aria-label": "Texte ou lien à envoyer",
    spellcheck: "false",
  });
  const compteurCaracteres = el("span", { class: "partage-compte", "aria-live": "polite" });
  const messageAjout = el("p", { class: "partage-message", role: "status", "aria-live": "polite", hidden: true });
  const envoyer = el("button", { type: "button", class: "bouton bouton--principal", texte: "Envoyer", onclick: () => envoyerContenu() });
  const coller = el("button", { type: "button", class: "bouton", texte: "Coller", onclick: () => collerPressePapiers() });
  const proposerLien = el("button", {
    type: "button",
    class: "lien-discret",
    hidden: true,
    texte: "Enregistrer comme lien",
    onclick: () => envoyerContenu("lien"),
  });
  const bandeau = el("p", { class: "partage-bandeau", role: "status", hidden: true });
  const liste = el("ul", { class: "partage-liste", "aria-live": "polite" });
  const plus = el("button", { type: "button", class: "bouton partage-plus", hidden: true, texte: "Voir plus", onclick: () => voirPlus() });
  const fermerBouton = el("button", { type: "button", class: "partage-fermer", "aria-label": "Fermer", texte: "×", onclick: () => fermer() });
  const panneau = el(
    "aside",
    { class: "partage", role: "dialog", "aria-label": "Espace de partage", "aria-modal": "false", hidden: true },
    el("div", { class: "partage-poignee", "aria-hidden": "true" }),
    el("header", { class: "partage-entete" }, el("h2", { texte: "Espace de partage" }), fermerBouton),
    bandeau,
    el(
      "div",
      { class: "partage-ajout" },
      champ,
      el("div", { class: "partage-ajout-actions" }, compteurCaracteres, coller, envoyer),
      proposerLien,
      messageAjout,
    ),
    liste,
    plus,
  );

  const lienDe = (e) => (e.type === "lien" ? urlSure(e.contenu) : null);

  // --- Rendering ------------------------------------------------------------------------------
  function carte(e) {
    const url = lienDe(e);
    const texte = el("div", { class: "partage-texte" });
    if (url) {
      // Only an http(s) address becomes a link; the text is the domain and the address.
      texte.append(
        el("a", { class: "partage-lien", href: url, target: "_blank", rel: "noopener noreferrer", texte: domaine(url) }),
        el("span", { class: "partage-detail", texte: apercu(url, 120) }),
      );
    } else {
      texte.append(el("span", { class: "partage-apercu", texte: apercu(e.contenu) }));
    }
    const copie = el("button", {
      type: "button",
      class: "partage-action",
      texte: "Copier",
      "aria-label": "Copier",
      onclick: async (ev) => {
        const b = ev.currentTarget;
        try {
          await copier(e.contenu);
          b.textContent = "Copié ✓";
          vibrer(store, 12);
          setTimeout(() => (b.textContent = "Copier"), 1500);
        } catch {
          toast("Copie impossible : sélectionnez le texte à la main.", { type: "erreur" });
        }
      },
    });
    const actions = el(
      "div",
      { class: "partage-actions" },
      copie,
      url ? el("a", { class: "partage-action", href: url, target: "_blank", rel: "noopener noreferrer", texte: "Ouvrir" }) : null,
      el("button", {
        type: "button",
        class: "partage-action",
        "aria-pressed": String(e.epingle),
        texte: e.epingle ? "Désépingler" : "Épingler",
        onclick: () => action(() => charger().then((fb) => fb.epinglerPartage(uid(), e.id, !e.epingle))),
      }),
      el("button", { type: "button", class: "partage-action partage-action--danger", texte: "Supprimer", onclick: () => supprimerAvecAnnulation(e) }),
    );
    return el(
      "li",
      { class: `partage-carte${e.enAttente ? " partage-carte--attente" : ""}${e.epingle ? " partage-carte--epingle" : ""}`, dataset: { id: e.id, type: e.type } },
      el("span", { class: "partage-type", "aria-hidden": "true", texte: e.type === "lien" ? "🔗" : "📝" }),
      texte,
      el("span", {
        class: "partage-meta",
        texte: `${e.enAttente ? "Envoi… · " : ""}${ilYA(e.creeLe)} · depuis ${libelleAppareil(e.appareil)}`,
      }),
      actions,
    );
  }

  function rendre() {
    const hors = typeof navigator !== "undefined" && navigator.onLine === false;
    bandeau.hidden = !(hors || depuisCache);
    bandeau.textContent = hors ? "Hors ligne — vos envois partiront à la reconnexion." : "Contenu du cache — mise à jour en cours…";
    liste.replaceChildren();
    if (statut === "chargement" && elements.length === 0) {
      for (let i = 0; i < 3; i++) liste.append(el("li", { class: "partage-carte partage-squelette", "aria-hidden": "true" }));
    } else if (statut === "erreur") {
      liste.append(
        el(
          "li",
          { class: "partage-carte partage-carte--erreur", role: "alert" },
          el("span", { texte: "Impossible de lire l'espace de partage." }),
          el("button", { type: "button", class: "partage-action", texte: "Réessayer", onclick: () => demarrerEcoute() }),
        ),
      );
    } else if (elements.length === 0) {
      liste.append(
        el(
          "li",
          { class: "partage-vide" },
          el("span", { class: "partage-vide-icone", "aria-hidden": "true", texte: "⇄" }),
          el("p", { texte: "Envoyez un texte ou un lien d'un appareil à l'autre." }),
          el("p", { class: "partage-aucun", texte: "Aucun élément" }),
        ),
      );
    } else {
      liste.append(...trier(elements).map(carte));
    }
    plus.hidden = !peutPlus;
    compteurCaracteres.textContent = longueur(champ.value) > LIMITE_CARACTERES * 0.8 ? `${longueur(champ.value).toLocaleString("fr-FR")} / ${LIMITE_CARACTERES.toLocaleString("fr-FR")}` : "";
    const plein = estPlein(compteur);
    envoyer.disabled = envoiEnCours;
    messageAjout.hidden = !plein && !messageAjout.textContent;
    if (plein) {
      messageAjout.hidden = false;
      messageAjout.textContent = `${LIMITE_ELEMENTS} éléments maximum — supprimez-en pour continuer.`;
    }
    proposerLien.hidden = !(detecterType(champ.value) === "lien" && champ.value.trim() !== "");
  }

  // --- Actions --------------------------------------------------------------------------------
  const montrerErreur = (message) => {
    messageAjout.hidden = !message;
    messageAjout.textContent = message ?? "";
  };

  async function action(f) {
    try {
      await f();
    } catch {
      toast("Action impossible pour l'instant.", { type: "erreur" });
    }
  }

  async function envoyerContenu(type = "texte") {
    const brut = champ.value;
    montrerErreur(validerContenu(brut));
    if (validerContenu(brut)) return;
    if (estPlein(compteur)) return rendre();
    const r = creerElement({ contenu: brut, type });
    if (!r.ok) return montrerErreur(r.erreur);
    envoiEnCours = true;
    rendre();
    try {
      const fb = await charger();
      const doublon = trouverDoublon(elements, r.element);
      // Same content already there: it goes back to the top instead of a second copy.
      if (doublon) await fb.remonterPartage(uid(), doublon.id);
      else await fb.ajouterAuPartage(uid(), r.element);
      champ.value = "";
      montrerErreur(null);
      if (!ouvert) toast("Envoyé");
    } catch (e) {
      erreurs.set(brut, e?.code ?? "erreur");
      montrerErreur(
        e?.code === "permission-denied"
          ? `${LIMITE_ELEMENTS} éléments maximum, ou contenu refusé. Supprimez-en pour continuer.`
          : "Envoi impossible. Réessayez.",
      );
    } finally {
      envoiEnCours = false;
      rendre();
    }
  }

  async function collerPressePapiers() {
    try {
      const texte = await navigator.clipboard.readText();
      if (texte) {
        champ.value = texte;
        rendre();
      }
    } catch {
      // Refused (iOS, permission): the field itself accepts a manual paste.
      montrerErreur("Collez le contenu directement dans le champ.");
      champ.focus();
    }
  }

  async function supprimerAvecAnnulation(e) {
    try {
      const fb = await charger();
      await fb.supprimerDuPartage(uid(), e.id);
      toast("Supprimé", {
        duree: 5000,
        action: { libelle: "Annuler", onClic: () => action(() => fb.restaurerPartage(uid(), e)) },
      });
    } catch {
      toast("Suppression impossible pour l'instant.", { type: "erreur" });
    }
  }

  async function voirPlus() {
    limite += PAGE_ELEMENTS;
    demarrerEcoute();
  }

  // --- Listening: one listener, detached when closed AND hidden -----------------------------
  function arreterEcoute() {
    arret.forEach((f) => f());
    arret = [];
  }

  async function demarrerEcoute() {
    arreterEcoute();
    if (!disponible() || !uid()) return;
    statut = elements.length ? "ok" : "chargement";
    rendre();
    try {
      const fb = await charger();
      const stops = [
        fb.ecouterEspacePartage(
          uid(),
          (liste_, infos) => {
            elements = liste_;
            statut = "ok";
            depuisCache = infos.depuisCache && !infos.enAttente;
            peutPlus = infos.plein && liste_.length >= limite;
            majPastille();
            rendre();
          },
          () => {
            statut = "erreur";
            rendre();
          },
          limite,
        ),
        fb.ecouterCompteurPartage(uid(), (nb) => {
          compteur = nb;
          rendre();
        }),
      ];
      arret = stops;
    } catch {
      statut = "erreur";
      rendre();
    }
  }

  const dernierVu = () => {
    try {
      return Number(localStorage.getItem(CLE_VU)) || 0;
    } catch {
      return 0;
    }
  };
  const noterVu = () => {
    try {
      localStorage.setItem(CLE_VU, String(Math.max(dernierVu(), ...elements.map((e) => e.creeLe ?? 0))));
    } catch {
      /* the dot is only a comfort */
    }
  };
  function majPastille() {
    if (ouvert) return noterVu();
    const vu = dernierVu();
    // First use on this device: nothing is "new" yet.
    if (vu === 0) return noterVu();
    pastille.hidden = !elements.some((e) => (e.creeLe ?? 0) > vu && e.appareil !== typeLocal());
  }
  const typeLocal = () => (import.meta.env.VITE_TARGET === "pwa" ? undefined : "extension");

  // --- Open / close -----------------------------------------------------------------------------
  function ouvrir() {
    if (!disponible()) return;
    ouvert = true;
    retourFocus = document.activeElement;
    panneau.hidden = false;
    bouton.setAttribute("aria-expanded", "true");
    pastille.hidden = true;
    if (!arret.length) demarrerEcoute();
    noterVu();
    rendre();
    // No automatic focus on a phone: the keyboard would pop up on its own.
    if (matchMedia("(min-width: 900px)").matches) champ.focus();
    else fermerBouton.focus();
    document.addEventListener("keydown", surTouche);
    setTimeout(() => document.addEventListener("pointerdown", surExterieur), 0);
  }

  function fermer() {
    if (!ouvert) return;
    ouvert = false;
    panneau.hidden = true;
    bouton.setAttribute("aria-expanded", "false");
    document.removeEventListener("keydown", surTouche);
    document.removeEventListener("pointerdown", surExterieur);
    if (document.hidden) arreterEcoute();
    (retourFocus?.isConnected ? retourFocus : bouton).focus?.();
  }

  const surTouche = (e) => {
    if (e.key === "Escape" && !document.querySelector("dialog[open]:modal, .menu")) {
      e.preventDefault();
      fermer();
    } else if (e.key === "Tab") {
      // Focus kept inside the panel while it is open.
      const cibles = [...panneau.querySelectorAll("button, a[href], textarea")].filter((n) => !n.disabled && !n.closest("[hidden]"));
      if (cibles.length === 0) return;
      const premier = cibles[0];
      const dernier = cibles.at(-1);
      if (e.shiftKey && document.activeElement === premier) {
        e.preventDefault();
        dernier.focus();
      } else if (!e.shiftKey && document.activeElement === dernier) {
        e.preventDefault();
        premier.focus();
      }
    }
  };
  const surExterieur = (e) => {
    if (!panneau.contains(e.target) && !bouton.contains(e.target) && !e.target.closest?.(".toast, .menu, dialog")) fermer();
  };

  champ.addEventListener("input", () => {
    montrerErreur(null);
    rendre();
  });
  champ.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      envoyerContenu();
    }
  });

  // The listener follows the visibility of the tab (Safari suspends it in the background).
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (!ouvert) arreterEcoute();
    } else if (disponible() && (ouvert || bouton.hidden === false)) demarrerEcoute();
  });
  addEventListener("online", rendre);
  addEventListener("offline", rendre);

  /** Shows the button when the account is usable; stops everything otherwise. */
  function actualiser() {
    const dispo = disponible();
    bouton.hidden = !dispo;
    if (!dispo) {
      arreterEcoute();
      if (ouvert) fermer();
      elements = [];
      compteur = 0;
      return;
    }
    if (!arret.length && !document.hidden) demarrerEcoute();
  }

  return {
    bouton,
    panneau,
    ouvrir,
    fermer,
    actualiser,
    estOuvert: () => ouvert,
    /** Tests: elements shown. */
    elements: () => elements,
  };
}

/** Copies a text: the clipboard API, or a hidden field where it is missing (older Safari). */
async function copierTexte(texte) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(texte);
  const t = el("textarea", { value: texte, style: "position:fixed;left:-1000px;top:-1000px", "aria-hidden": "true" });
  document.body.append(t);
  t.select();
  const ok = document.execCommand?.("copy");
  t.remove();
  if (!ok) throw new Error("copie impossible");
}
