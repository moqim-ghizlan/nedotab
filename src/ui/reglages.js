import { A } from "../core/actions.js";
import { parcourir } from "../core/arbre.js";
import { estimerTaille, niveauTaille } from "../core/taille.js";
import { URL_SITE } from "../core/constantes.js";
import { FLOU_MAX, fondEffectif, NOMS_DEGRADES, VOILE_MAX } from "../core/reglages.js";
import { plateforme } from "../platform/index.js";
import { el } from "./dom.js";
import { icone } from "./icones.js";
import { creerBibliothequeFonds } from "./reglages/bibliothequeFonds.js";
import { sectionCompte } from "./reglages/compte.js";
import { sectionSauvegardes } from "./reglages/sauvegardes.js";
import { sectionDonnees } from "./reglages/donnees.js";
import { COULEURS_FOND, cssDegrade, DEGRADES } from "./fonds.js";
import { preparerImageFond } from "./services/imageFond.js";
import { poidsDataUrl } from "./services/imageIcone.js";

let ouvert = null;

const ONGLETS = [
  ["apparence", "Apparence"],
  ["sauvegardes", "Sauvegardes"],
  ["donnees", "Données"],
  ["avance", "Avancé"],
];
const CLE_ONGLET = "nedotab:onglet-reglages";
const SORTIE_MS = 140;

/** Label of a setting kept on this device only (never synced, V2.9). */
const libelleAppareil = (texte) =>
  el(
    "p",
    { class: "reglages-libelle" },
    texte,
    el("span", { class: "mention-appareil", texte: "Sur cet appareil uniquement" }),
  );

const ko = (octets) => `${(octets / 1024).toFixed(octets < 10240 ? 1 : 0)} Ko`;

/** A row of mutually exclusive buttons (radio group). */
function segments(libelle, options, valeur, onChoix) {
  const groupe = el("div", { class: "segments", role: "radiogroup", "aria-label": libelle });
  const maj = (v) => {
    for (const b of groupe.children) b.setAttribute("aria-checked", String(b.dataset.valeur === v));
  };
  for (const [v, texte] of options) {
    groupe.append(
      el("button", {
        type: "button",
        class: "segment",
        role: "radio",
        dataset: { valeur: v },
        texte,
        onclick: () => {
          maj(v);
          onChoix(v);
        },
      }),
    );
  }
  maj(valeur);
  return { groupe, maj };
}

function section(titre, ...contenu) {
  return el("section", { class: "reglages-section" }, el("h3", { texte: titre }), ...contenu);
}

/**
 * Settings panel on the right (non-modal: the grid stays visible behind and every change
 * shows live, without a "Save" button). Built as independent sections so that later
 * versions can add theirs (account, AI…).
 */
export function ouvrirReglages(store, { retourFocus, session } = {}) {
  if (ouvert) {
    ouvert.fermer();
    return null;
  }
  const lire = () => ({ ...store.lire().reglages, fond: fondEffectif(store.lire()) });
  const modifier = (changements) => store.envoyer({ type: A.REGLAGES_MODIFIER, changements });

  // --- Apparence -------------------------------------------------------------------------
  const theme = segments(
    "Thème",
    [
      ["auto", "Automatique"],
      ["clair", "Clair"],
      ["sombre", "Sombre"],
    ],
    lire().theme,
    (v) => modifier({ theme: v }),
  );

  // Device-only: forced number of columns of the home grid (automatic by default).
  const colonnes = segments(
    "Colonnes",
    [["auto", "Auto"], ...["4", "5", "6", "7", "8"].map((n) => [n, n])],
    String(store.lire().reglagesAppareil?.colonnes ?? "auto"),
    (v) => modifier({ colonnes: v === "auto" ? null : Number(v) }),
  );

  const nuancesCouleur = el(
    "div",
    { class: "nuancier nuancier--fond", role: "radiogroup", "aria-label": "Couleur du fond" },
    COULEURS_FOND.map((c) =>
      el("button", {
        type: "button",
        class: "nuance",
        role: "radio",
        style: `background:${c}`,
        "aria-label": c,
        dataset: { couleur: c },
        onclick: () => modifier({ fond: { type: "couleur", valeur: c } }),
      }),
    ),
  );
  const choixCouleur = el("input", {
    type: "color",
    class: "choix-couleur",
    "aria-label": "Autre couleur",
    value: lire().fond.type === "couleur" ? lire().fond.valeur : "#e4e8e1",
  });
  choixCouleur.addEventListener("input", () =>
    modifier({ fond: { type: "couleur", valeur: choixCouleur.value } }),
  );

  const nuancesDegrade = el(
    "div",
    { class: "degrades", role: "radiogroup", "aria-label": "Dégradé" },
    NOMS_DEGRADES.map((nom) =>
      el("button", {
        type: "button",
        class: "degrade",
        role: "radio",
        style: `background:${cssDegrade(nom)}`,
        "aria-label": DEGRADES[nom].libelle,
        title: DEGRADES[nom].libelle,
        dataset: { degrade: nom },
        onclick: () => modifier({ fond: { type: "degrade", valeur: nom } }),
      }),
    ),
  );

  const fichier = el("input", {
    type: "file",
    accept: "image/jpeg,image/png,image/webp",
    "aria-label": "Choisir une image de fond",
  });
  const etatImage = el("p", { class: "reglages-note", "aria-live": "polite" });
  const voile = el("input", {
    type: "range",
    min: "0",
    max: String(VOILE_MAX),
    step: "0.05",
    id: "reglage-voile",
  });
  const flou = el("input", {
    type: "range",
    min: "0",
    max: String(FLOU_MAX),
    step: "1",
    id: "reglage-flou",
  });
  const reglerImage = (cle, valeur) => {
    const fond = lire().fond;
    if (fond.type === "image") modifier({ fond: { ...fond, [cle]: valeur } });
  };
  voile.addEventListener("input", () => reglerImage("voile", Number(voile.value)));
  flou.addEventListener("input", () => reglerImage("flou", Number(flou.value)));
  fichier.addEventListener("change", async () => {
    const f = fichier.files?.[0];
    if (!f) return;
    etatImage.textContent = "Préparation de l'image…";
    const r = await preparerImageFond(f);
    if (!r.ok) {
      etatImage.textContent = r.erreur;
      return;
    }
    const id = globalThis.crypto.randomUUID();
    try {
      await plateforme.fichiers.enregistrerFond(id, r.blob);
    } catch {
      etatImage.textContent = "Enregistrement de l'image impossible.";
      return;
    }
    const ancien = lire().fond;
    modifier({
      fond: {
        type: "image",
        ref: `local:${id}`,
        dominante: r.dominante,
        voile: ancien.type === "image" ? ancien.voile : 0.25,
        flou: ancien.type === "image" ? ancien.flou : 0,
      },
    });
    // One active picture only: the previous one is removed from IndexedDB.
    if (ancien.type === "image")
      plateforme.fichiers.supprimerFond(ancien.ref.slice(6)).catch(() => {});
    etatImage.textContent = `Image ${r.largeur} × ${r.hauteur}, ${ko(r.blob.size)}.`;
    fichier.value = "";
  });

  const bibliotheque =
    session?.synchro?.lire().mode === "compte" ? creerBibliothequeFonds({ store, session }) : null;
  const panneaux = {
    aucun: el("p", { class: "reglages-note", texte: "Fond du thème." }),
    couleur: el("div", { class: "reglages-ligne" }, nuancesCouleur, choixCouleur),
    degrade: nuancesDegrade,
    image: el(
      "div",
      { class: "reglages-image" },
      // Account mode: the pictures go to the account's library (Storage), else stay local.
      bibliotheque ? bibliotheque.racine : fichier,
      bibliotheque ? null : etatImage,
      bibliotheque
        ? null
        : el("p", { class: "reglages-note", texte: "Image gardée sur cet appareil uniquement." }),
      el("label", { for: "reglage-voile", texte: "Voile" }),
      voile,
      el("label", { for: "reglage-flou", texte: "Flou" }),
      flou,
    ),
  };
  const typeFond = segments(
    "Type de fond",
    [
      ["aucun", "Aucun"],
      ["couleur", "Couleur"],
      ["degrade", "Dégradé"],
      ["image", "Image"],
    ],
    lire().fond.type,
    (v) => {
      afficherPanneau(v);
      if (v === "aucun") modifier({ fond: { type: "aucun" } });
      if (v === "couleur" && lire().fond.type !== "couleur") {
        modifier({ fond: { type: "couleur", valeur: choixCouleur.value } });
      }
      if (v === "degrade" && lire().fond.type !== "degrade") {
        modifier({ fond: { type: "degrade", valeur: NOMS_DEGRADES[0] } });
      }
      if (v === "image" && lire().fond.type !== "image" && !bibliotheque) fichier.click();
    },
  );
  const afficherPanneau = (type) => {
    for (const [t, p] of Object.entries(panneaux)) p.hidden = t !== type;
  };
  // Type of the background last applied: a change coming from elsewhere (another device,
  // another tab) also switches the panel; a click on a type keeps its own panel.
  let typeApplique = lire().fond.type;

  // --- Autorisations -------------------------------------------------------------------
  const etatPermission = el("p", { class: "reglages-note" });
  const boutonPermission = el("button", { type: "button", class: "bouton" });
  const majPermission = async () => {
    if (!plateforme.permissionsSites.disponible) {
      etatPermission.textContent = "Non disponible sur cette plateforme.";
      boutonPermission.hidden = true;
      return;
    }
    const ok = await plateforme.permissionsSites.contient().catch(() => false);
    etatPermission.textContent = ok
      ? "Accès aux sites accordé : le nom et l'icône des sites sont lus directement."
      : "Accès aux sites non accordé : les icônes viennent du service de Google ou de Chrome.";
    boutonPermission.textContent = ok ? "Retirer l'accès" : "Autoriser l'accès aux sites";
    boutonPermission.dataset.accorde = String(ok);
  };
  boutonPermission.addEventListener("click", () => {
    // Called directly in the click handler: Chrome requires a user gesture.
    const demande =
      boutonPermission.dataset.accorde === "true"
        ? plateforme.permissionsSites.retirer()
        : plateforme.permissionsSites.demander();
    demande.then(majPermission, majPermission);
  });

  // --- Stockage --------------------------------------------------------------------------
  const etatStockage = el("p", { class: "reglages-note" });
  const majStockage = () => {
    const etat = store.lire();
    const poids = estimerTaille(etat);
    const images = [...parcourir(etat.grille)].filter((e) => e.icone?.type === "image");
    const poidsImages = images.reduce((s, e) => s + poidsDataUrl(e.icone.valeur), 0);
    const niveau = niveauTaille(poids);
    etatStockage.textContent =
      `Données : ${ko(poids)} sur 1 024 Ko. Icônes personnalisées : ${images.length} (${ko(poidsImages)}).` +
      (niveau === "avertissement"
        ? " Votre grille approche de la limite : préférez les icônes automatiques aux images importées."
        : niveau === "bloque"
          ? " Limite presque atteinte : l'import d'images pour les icônes est bloqué."
          : "");
    etatStockage.classList.toggle("reglages-note--alerte", niveau !== "ok");
  };

  // --- Compte (account) -----------------------------------------------------------------
  const compteUi = session ? sectionCompte(session) : null;

  // --- panel: account card on top, then one tab at a time -----------------------------------
  const contenus = {
    apparence: [
      section(
        "Apparence",
        el("p", { class: "reglages-libelle", texte: "Thème" }),
        theme.groupe,
        el("p", { class: "reglages-libelle", texte: "Fond" }),
        typeFond.groupe,
        ...Object.values(panneaux),
        libelleAppareil("Colonnes"),
        colonnes.groupe,
      ),
    ],
    sauvegardes: session?.sauvegardes
      ? [sectionSauvegardes(session.sauvegardes, session.restauration).section]
      : null,
    donnees: session?.donnees
      ? [
          sectionDonnees({ donnees: session.donnees, restauration: session.restauration, store })
            .section,
          compteUi?.confidentialite,
          compteUi?.danger,
        ]
      : null,
    avance: [
      section("Autorisations", etatPermission, boutonPermission),
      section("Stockage", etatStockage),
      section(
        "À propos",
        el("p", {
          class: "reglages-note",
          texte: `Version installée : ${plateforme.getVersion()}`,
        }),
        el(
          "label",
          { class: "reglages-case" },
          el("input", {
            type: "checkbox",
            checked: !!store.lire().reglagesAppareil?.debug,
            onchange: (e) => modifier({ debug: e.currentTarget.checked }),
          }),
          el("span", { texte: "Journal de débogage dans la console" }),
          el("span", { class: "mention-appareil", texte: "Sur cet appareil uniquement" }),
        ),
        el(
          "p",
          { class: "reglages-liens" },
          el("a", { href: URL_SITE, target: "_blank", rel: "noopener", texte: "Site du projet" }),
          el("a", {
            href: `${URL_SITE}mise-a-jour.html`,
            target: "_blank",
            rel: "noopener",
            texte: "Guide de mise à jour",
          }),
        ),
      ),
    ],
  };
  const onglets = ONGLETS.filter(([cle]) => contenus[cle]);
  const panneauxOnglets = Object.fromEntries(
    onglets.map(([cle, libelle]) => [
      cle,
      el(
        "div",
        {
          class: "onglet-panneau",
          id: `onglet-panneau-${cle}`,
          role: "tabpanel",
          "aria-label": libelle,
          hidden: true,
        },
        ...contenus[cle],
      ),
    ]),
  );
  const curseur = el("span", { class: "onglets-curseur", "aria-hidden": "true" });
  const barreOnglets = el(
    "div",
    { class: "reglages-onglets", role: "tablist", "aria-label": "Rubriques des réglages" },
    curseur,
    onglets.map(([cle, libelle]) =>
      el(
        "button",
        {
          type: "button",
          class: "onglet",
          role: "tab",
          id: `onglet-${cle}`,
          "aria-controls": `onglet-panneau-${cle}`,
          dataset: { onglet: cle },
          onclick: () => choisirOnglet(cle),
        },
        icone(cle),
        el("span", { texte: libelle }),
      ),
    ),
  );
  barreOnglets.addEventListener("keydown", (e) => {
    const sens = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (!sens) return;
    e.preventDefault();
    const i = onglets.findIndex(([cle]) => cle === ongletActif);
    const [suivant] = onglets[(i + sens + onglets.length) % onglets.length];
    choisirOnglet(suivant);
    barreOnglets.querySelector(`[data-onglet="${suivant}"]`).focus();
  });
  const corps = el("div", { class: "reglages-corps" }, Object.values(panneauxOnglets));

  let ongletActif = null;
  function choisirOnglet(cle) {
    if (cle === ongletActif) return;
    const ordre = onglets.map(([c]) => c);
    const sens =
      ongletActif && ordre.indexOf(cle) < ordre.indexOf(ongletActif) ? "gauche" : "droite";
    const premier = ongletActif === null;
    ongletActif = cle;
    for (const b of barreOnglets.querySelectorAll(".onglet")) {
      const actif = b.dataset.onglet === cle;
      b.setAttribute("aria-selected", String(actif));
      b.tabIndex = actif ? 0 : -1;
    }
    for (const [c, p] of Object.entries(panneauxOnglets)) {
      p.hidden = c !== cle;
      if (c === cle && !premier) p.dataset.entree = sens;
    }
    corps.scrollTop = 0;
    placerCurseur();
    try {
      localStorage.setItem(CLE_ONGLET, cle);
    } catch {
      /* the remembered tab is only a convenience */
    }
  }
  function placerCurseur() {
    const b = barreOnglets.querySelector(`[data-onglet="${ongletActif}"]`);
    if (!b) return;
    curseur.style.setProperty("--x", `${b.offsetLeft}px`);
    curseur.style.setProperty("--l", `${b.offsetWidth}px`);
  }

  const panneau = el(
    "dialog",
    { class: "reglages", "aria-labelledby": "reglages-titre", tabindex: "-1" },
    el(
      "header",
      { class: "reglages-entete" },
      el("h2", { id: "reglages-titre", texte: "Réglages" }),
      el(
        "button",
        {
          type: "button",
          class: "reglages-fermer",
          "aria-label": "Fermer les réglages",
          onclick: () => fermer(),
        },
        icone("fermer"),
      ),
    ),
    compteUi?.section,
    barreOnglets,
    corps,
  );

  // The account card shows a copy of the user's own background, kept in step with it. Only
  // the values set on the layer are copied: without any, the card follows the theme's colour.
  const calque = document.getElementById("fond");
  const copierFond = () => {
    if (!compteUi) return;
    const s = compteUi.section.style;
    const fond = calque?.style;
    const visible = fond && calque.dataset.type !== "aucun";
    if (visible && fond.backgroundColor) s.setProperty("--carte-couleur", fond.backgroundColor);
    else s.removeProperty("--carte-couleur");
    if (visible && fond.backgroundImage) s.setProperty("--carte-image", fond.backgroundImage);
    else if (visible) s.setProperty("--carte-image", "none");
    else s.removeProperty("--carte-image");
    s.setProperty("--carte-voile", (visible && fond.getPropertyValue("--voile-fond")) || "0");
  };
  const observateur = calque ? new MutationObserver(copierFond) : null;
  observateur?.observe(calque, { attributes: true });

  const actualiser = () => {
    const r = lire();
    theme.maj(r.theme);
    typeFond.maj(r.fond.type);
    if (r.fond.type !== typeApplique) {
      typeApplique = r.fond.type;
      afficherPanneau(r.fond.type);
    }
    colonnes.maj(String(store.lire().reglagesAppareil?.colonnes ?? "auto"));
    for (const b of nuancesCouleur.children) {
      b.setAttribute(
        "aria-checked",
        String(r.fond.type === "couleur" && b.dataset.couleur === r.fond.valeur),
      );
    }
    for (const b of nuancesDegrade.children) {
      b.setAttribute(
        "aria-checked",
        String(r.fond.type === "degrade" && b.dataset.degrade === r.fond.valeur),
      );
    }
    voile.disabled = flou.disabled = r.fond.type !== "image";
    if (r.fond.type === "image") {
      voile.value = String(r.fond.voile);
      flou.value = String(r.fond.flou);
    }
    majStockage();
  };
  const desabonner = store.abonner(actualiser);

  const surTouche = (e) => {
    if (e.key === "Escape" && !document.querySelector("dialog[open]:modal")) {
      e.preventDefault();
      fermer();
    }
  };
  function fermer() {
    desabonner();
    compteUi?.arreter();
    bibliotheque?.arreter();
    observateur?.disconnect();
    document.removeEventListener("keydown", surTouche);
    ouvert = null;
    retourFocus?.focus();
    // Short exit slide, then the panel leaves the page.
    panneau.classList.add("reglages--sortie");
    setTimeout(() => {
      panneau.close();
      panneau.remove();
    }, SORTIE_MS);
  }
  document.addEventListener("keydown", surTouche);

  document.body.append(panneau);
  afficherPanneau(lire().fond.type);
  actualiser();
  copierFond();
  majPermission();
  panneau.show();
  let memorise = null;
  try {
    memorise = localStorage.getItem(CLE_ONGLET);
  } catch {
    /* no remembered tab */
  }
  choisirOnglet(onglets.some(([c]) => c === memorise) ? memorise : onglets[0][0]);
  // The tab cursor only glides once it has found its first place.
  requestAnimationFrame(() => barreOnglets.classList.add("reglages-onglets--pret"));
  // Focus goes to the panel itself: Tab then reaches its controls in order.
  panneau.focus({ preventScroll: true });
  ouvert = { fermer };
  return ouvert;
}
