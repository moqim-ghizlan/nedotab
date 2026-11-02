import { A } from "../core/actions.js";
import { DUREES } from "../core/expirationPartage.js";
import { parcourir } from "../core/arbre.js";
import { estimerTaille, niveauTaille } from "../core/taille.js";
import { URL_SITE } from "../core/constantes.js";
import { LIBELLES_NAVIGATEURS, NAVIGATEURS } from "../core/navigateurs.js";
import {
  affichageAccueilDe,
  styleDossierDe,
  ombreIconesDe,
  affichageHeureDe,
  espacementDe,
  formeIconesDe,
  animationDossierDe,
  animationPageDe,
  COTE_TELEPHONE,
  FLOU_MAX,
  fondEffectif,
  NOMS_DEGRADES,
  VOILE_MAX,
} from "../core/reglages.js";
import { petitCote } from "./ecran.js";
import { plateforme } from "../platform/index.js";
import { el } from "./dom.js";
import { icone } from "./icones.js";
import { creerAvatar } from "./avatar.js";
import { grilleAccueil } from "../core/pages.js";
import { creerBibliothequeFonds } from "./reglages/bibliothequeFonds.js";
import { creerGalerie } from "./reglages/galerie.js";
import { sectionCompte } from "./reglages/compte.js";
import { sectionSauvegardes } from "./reglages/sauvegardes.js";
import { brancherGesteVersion } from "./debug.js";
import { sectionDiagnostic } from "./reglages/diagnostic.js";
import { toast } from "./toast.js";
import { chargerFirebase } from "../firebase/charger.js";
import { demander } from "./dialogues/commun.js";
import { creerSectionFrequents } from "./reglages/frequents.js";
import { iaDe } from "../core/ia.js";
import { sectionDonnees } from "./reglages/donnees.js";
import { ouvrirRangement } from "./rangement/ecran.js";
import { sectionIa } from "./reglages/ia.js";
import { COULEURS_FOND, cssDegrade, DEGRADES } from "./fonds.js";
import { preparerImageFond } from "./services/imageFond.js";
import { poidsDataUrl } from "./services/imageIcone.js";

let ouvert = null;

/** Sections of the panel (V4.30): key, label, what it holds (shown in the phone's list). */
const ONGLETS = [
  ["compte", "Compte", "Connexion, synchronisation, export de vos données"],
  ["apparence", "Apparence", "Thème, fond d'écran, animations"],
  ["accueil", "Accueil", "Grille, icônes, dossiers, horloge"],
  ["general", "Général", "Ouverture des liens, comportement, utilisation"],
  ["partage", "Partage", "Durée de conservation, vault"],
  ["sauvegardes", "Sauvegardes", "Copies datées et restauration"],
  ["ia", "IA", "Assistant, clé, confidentialité"],
  ["avance", "Avancé", "Stockage, diagnostic, à propos"],
];
/** Below this width the sections are a list, and one opens over it (phone, small tablet). */
const LISTE_MAX = "(max-width: 719px)";
const CLE_ONGLET = "nedotab:onglet-reglages";
const SORTIE_MS = 140;

/** Quiet mark of a setting kept on this device only (never synced, V2.9). */
const mentionAppareil = () =>
  el("span", {
    class: "mention-appareil",
    title: "Réglage propre à cet appareil, non synchronisé",
    texte: "Cet appareil",
  });

/** Label of a setting kept on this device only. */
const libelleAppareil = (texte) => el("p", { class: "reglages-libelle" }, texte, mentionAppareil());

/** A slider with its value written next to its label. */
function curseurAvecValeur(libelle, input, format) {
  const valeur = el("output", { class: "reglages-valeur", for: input.id });
  const maj = () => (valeur.textContent = format(Number(input.value)));
  input.addEventListener("input", maj);
  maj();
  const tete =
    typeof libelle === "string" ? el("p", { class: "reglages-libelle", texte: libelle }) : libelle;
  tete.append(valeur);
  return { racine: el("div", { class: "reglages-curseur" }, tete, input), maj };
}

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
export function ouvrirReglages(store, { retourFocus, session, onglet } = {}) {
  if (ouvert) {
    ouvert.fermer();
    return null;
  }
  const lire = () => ({ ...store.lire().reglages, fond: fondEffectif(store.lire()) });
  /** Version line; 7 quick taps on it turn the diagnostic mode on or off (V3.10). */
  const versionApropos = () => {
    const ligne = el("p", {
      class: "reglages-note",
      texte: `Version installée : ${plateforme.getVersion()}`,
    });
    brancherGesteVersion(ligne, () => {
      const actif = !store.lire().reglagesAppareil?.debug;
      store.envoyer({ type: A.REGLAGES_MODIFIER, changements: { debug: actif } });
      toast(actif ? "Mode diagnostic activé" : "Mode diagnostic désactivé", { duree: 3000 });
    });
    return ligne;
  };
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
    [["auto", "Auto"], ...["3", "4", "5", "6", "7", "8", "9", "10"].map((n) => [n, n])],
    String(store.lire().reglagesAppareil?.colonnes ?? "auto"),
    (v) => modifier({ colonnes: v === "auto" ? null : Number(v) }),
  );

  // Device-only: size of the tiles (% of the natural size).
  const tailleTuiles = el("input", {
    type: "range",
    min: "60",
    max: "200",
    step: "10",
    id: "reglage-taille-tuiles",
    "aria-label": "Taille des cartes",
    value: String(store.lire().reglagesAppareil?.tailleTuiles ?? 100),
  });
  tailleTuiles.addEventListener("input", () =>
    modifier({ tailleTuiles: Number(tailleTuiles.value) }),
  );

  // Device-only (V2.11): the home grid in pages, or one grid that scrolls.
  const affichageAccueil = segments(
    "Affichage de l'accueil",
    [
      ["pages", "Pages"],
      ["defilement", "Défilement vertical"],
    ],
    affichageAccueilDe(store.lire().reglagesAppareil),
    (v) => {
      modifier({ affichageAccueil: v });
      montrerSelonAffichage();
    },
  );

  // Device-only: cards with a looping mini demo of each effect (5 prototypes each).
  const cartesAnimation = (libelle, type, options, valeur, onChoix) => {
    const groupe = el("div", {
      class: "demos-animation",
      role: "radiogroup",
      "aria-label": libelle,
    });
    const maj = (v) => {
      for (const b of groupe.children)
        b.setAttribute("aria-checked", String(b.dataset.valeur === v));
    };
    const page = (classe) =>
      el("span", { class: `demo-page ${classe}` }, ...[1, 2, 3, 4].map(() => el("i")));
    for (const [v, texte] of options) {
      groupe.append(
        el(
          "button",
          {
            type: "button",
            class: "demo-animation",
            role: "radio",
            dataset: { valeur: v },
            onclick: () => {
              maj(v);
              onChoix(v);
            },
          },
          el(
            "span",
            { class: "demo-cadre", dataset: { type, effet: v } },
            page("demo-page--a"),
            page("demo-page--b"),
          ),
          el("span", { class: "demo-nom", texte }),
        ),
      );
    }
    maj(valeur);
    return { groupe, maj };
  };
  const animationPage = cartesAnimation(
    "Animation de changement de page",
    "page",
    [
      ["glisse", "Glissement"],
      ["fondu", "Fondu"],
      ["zoom", "Zoom"],
      ["cube", "Cube"],
      ["ressort", "Ressort"],
    ],
    animationPageDe(store.lire().reglagesAppareil),
    (v) => modifier({ animationPage: v }),
  );
  const animationDossier = cartesAnimation(
    "Animation des dossiers",
    "dossier",
    [
      ["zoom", "Zoom"],
      ["fondu", "Fondu"],
      ["bas", "Depuis le bas"],
      ["rebond", "Rebond"],
      ["bascule", "Bascule 3D"],
    ],
    animationDossierDe(store.lire().reglagesAppareil),
    (v) => modifier({ animationDossier: v }),
  );

  // Synced (V2.12): the grid of the home pages, the same on every device.
  const grilleActuelle = () => grilleAccueil(store.lire().reglages);
  const lignesAccueil = segments(
    "Lignes",
    ["2", "3", "4", "5", "6"].map((n) => [n, n]),
    String(grilleActuelle().lignes),
    (v) => modifier({ grilleAccueil: { ...grilleActuelle(), lignes: Number(v) } }),
  );
  const colonnesAccueil = segments(
    "Colonnes de la grille",
    ["4", "5", "6", "7", "8", "9", "10"].map((n) => [n, n]),
    String(grilleActuelle().colonnes),
    (v) => modifier({ grilleAccueil: { ...grilleActuelle(), colonnes: Number(v) } }),
  );
  const reglagesPages = el(
    "div",
    { class: "reglages-groupe" },
    el("p", { class: "reglages-libelle", texte: "Lignes par page" }),
    lignesAccueil.groupe,
    el("p", { class: "reglages-libelle", texte: "Colonnes par page" }),
    colonnesAccueil.groupe,
    // V3.4: a phone shows the same pages with its own grid.
    petitCote() < COTE_TELEPHONE
      ? el("p", {
          class: "reglages-note",
          texte:
            "Sur ce téléphone, les pages s'affichent sur 4 colonnes, coupées en écrans plus petits. Ces réglages valent pour vos ordinateurs et tablettes.",
        })
      : null,
  );
  const reglagesDefilement = el(
    "div",
    { class: "reglages-groupe" },
    libelleAppareil("Colonnes"),
    colonnes.groupe,
  );
  // Pages: the synced grid; one scrolling grid: the device's forced columns.
  const montrerSelonAffichage = () => {
    const pages = affichageAccueilDe(store.lire().reglagesAppareil) === "pages";
    reglagesPages.hidden = !pages;
    reglagesDefilement.hidden = pages;
  };

  // Synced switches (key of the settings, label, explanation, inverse). `inverse`: the switch
  // shows the opposite of the stored flag, for behaviours that are on by default.
  const interrupteurs = [
    [
      "nouvelOnglet",
      "Ouvrir les sites dans un nouvel onglet",
      "Icônes de la grille et des dossiers, sites trouvés par la recherche.",
    ],
    [
      "rechercheNouvelOnglet",
      "Ouvrir les recherches web dans un nouvel onglet",
      "Recherche lancée depuis la barre avec votre moteur habituel.",
    ],
    [
      "gardeDossierOuvert",
      "Fermer le dossier en cliquant à côté",
      "Un clic sur le fond, en dehors de la fenêtre du dossier, la ferme. Désactivé, seule la croix ou Échap la ferme.",
      true,
    ],
    [
      "animationsReduites",
      "Animations réduites",
      "Coupe les animations et les transitions de l'interface. Utile sur un appareil lent.",
    ],
    [
      "masquerRecherche",
      "Masquer la barre de recherche",
      "Libère de la place sur l'accueil. Le raccourci « / » ne fait plus rien.",
    ],
    [
      "masquerTitres",
      "Afficher les titres sous les icônes",
      "Grille et dossiers. Désactivé, seules les icônes restent visibles.",
      true,
    ],
    [
      "confirmerSuppression",
      "Confirmer avant de supprimer",
      "Demande une confirmation avant de supprimer un site ou un dossier vide. Un dossier rempli la demande toujours ; l'annulation reste possible juste après.",
    ],
    [
      "sansSuiviUsage",
      "Mémoriser les sites que j'ouvre depuis NedoTab",
      "NedoTab compte combien de fois vous ouvrez chaque site depuis NedoTab pour trier vos résultats. Les sites que vous visitez ailleurs ne sont pas enregistrés. Désactivé, plus rien n'est enregistré et la recherche trie par pertinence seule.",
      true,
    ],
    [
      "sansUsagePourIa",
      "Partager ma fréquence d'utilisation avec l'assistant IA",
      "L'assistant reçoit, pour chaque site, « fort / moyen / faible / jamais » (jamais le nombre de visites). N'a d'effet que si l'IA est active.",
      true,
    ],
  ].map(([cle, libelle, note, inverse = false]) => {
    const bouton = el("input", {
      type: "checkbox",
      role: "switch",
      class: "interrupteur-bouton",
      dataset: { reglage: cle },
      onchange: (e) => modifier({ [cle]: e.currentTarget.checked !== inverse }),
    });
    const ligne = el(
      "label",
      { class: "interrupteur" },
      el(
        "span",
        { class: "interrupteur-texte" },
        el("span", { texte: libelle }),
        el("span", { class: "reglages-note", texte: note }),
      ),
      bouton,
    );
    return { cle, bouton, ligne, inverse };
  });

  const CLES_LIENS = ["nouvelOnglet", "rechercheNouvelOnglet"];
  const ligneDes = (cles) => interrupteurs.filter((i) => cles.includes(i.cle)).map((i) => i.ligne);

  // Device-only (V4.5.7): shape of the icons.
  const formeIcones = segments(
    "Forme des icônes",
    [
      ["carre", "Carrées"],
      ["arrondi", "Arrondies"],
      ["rond", "Rondes"],
    ],
    formeIconesDe(store.lire().reglagesAppareil),
    (v) => modifier({ formeIcones: v }),
  );

  // Device-only (V4.5.8): space between the tiles.
  const espacement = segments(
    "Espacement des cartes",
    [
      ["serre", "Serré"],
      ["normal", "Normal"],
      ["large", "Large"],
    ],
    espacementDe(store.lire().reglagesAppareil),
    (v) => modifier({ espacement: v }),
  );

  // Device-only (V4.5.9): heure et date.
  const affichageHeure = segments(
    "Heure et date",
    [
      ["aucun", "Masquées"],
      ["24h", "24 h"],
      ["12h", "12 h"],
    ],
    affichageHeureDe(store.lire().reglagesAppareil),
    (v) => modifier({ affichageHeure: v }),
  );

  // Device-only (V4.5.10): taille du texte des titres, in %.
  const tailleTitres = el("input", {
    type: "range",
    min: "80",
    max: "160",
    step: "10",
    id: "reglage-tailleTitres",
    "aria-label": "Taille du texte des titres",
    value: String(store.lire().reglagesAppareil?.tailleTitres ?? 100),
  });
  tailleTitres.addEventListener("input", () =>
    modifier({ tailleTitres: Number(tailleTitres.value) }),
  );

  // Device-only (V4.5.11): ombre sous les icônes.
  const ombreIcones = segments(
    "Ombre sous les icônes",
    [
      ["aucune", "Aucune"],
      ["legere", "Légère"],
      ["forte", "Forte"],
    ],
    ombreIconesDe(store.lire().reglagesAppareil),
    (v) => modifier({ ombreIcones: v }),
  );

  // Device-only (V4.5.12): style des dossiers.
  const styleDossier = segments(
    "Style des dossiers",
    [
      ["apercu", "Aperçu du contenu"],
      ["icone", "Icône de dossier"],
    ],
    styleDossierDe(store.lire().reglagesAppareil),
    (v) => modifier({ styleDossier: v }),
  );

  // Device-only (V4.5.13): opacité de la fenêtre de dossier, in %.
  const opaciteDossier = el("input", {
    type: "range",
    min: "60",
    max: "100",
    step: "5",
    id: "reglage-opaciteDossier",
    "aria-label": "Opacité de la fenêtre de dossier",
    value: String(store.lire().reglagesAppareil?.opaciteDossier ?? 100),
  });
  opaciteDossier.addEventListener("input", () =>
    modifier({ opaciteDossier: Number(opaciteDossier.value) }),
  );

  // Device-only: a short vibration when an icon is picked up and dropped.
  const retourHaptique = el("input", {
    type: "checkbox",
    role: "switch",
    class: "interrupteur-bouton",
    dataset: { reglage: "retourHaptique" },
    onchange: (e) => modifier({ retourHaptique: e.currentTarget.checked }),
  });
  const ligneHaptique = el(
    "label",
    { class: "interrupteur" },
    el(
      "span",
      { class: "interrupteur-texte" },
      el("span", { texte: "Vibration au glisser-déposer" }, mentionAppareil()),
      el("span", {
        class: "reglages-note",
        texte:
          "Une courte vibration quand vous attrapez ou déposez une icône. Selon l'appareil et le navigateur, elle peut ne rien faire.",
      }),
    ),
    retourHaptique,
  );

  // Device-only, on iOS: the browser that opens the sites (Safari otherwise).
  const navigateur = !plateforme.capacites.choixNavigateur
    ? null
    : segments(
        "Ouvrir les sites avec",
        NAVIGATEURS.map((n) => [n, LIBELLES_NAVIGATEURS[n]]),
        store.lire().reglagesAppareil?.navigateur ?? "safari",
        (v) => modifier({ navigateur: v }),
      );

  // Device-only (V2.10.7), where a browser address bar takes the cursor on a new tab.
  const curseurRecherche = !plateforme.capacites.barreAdresse
    ? null
    : el("input", {
        type: "checkbox",
        role: "switch",
        class: "interrupteur-bouton",
        dataset: { reglage: "curseurRecherche" },
        onchange: (e) => modifier({ barreChrome: !e.currentTarget.checked }),
      });

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
  const curseurVoile = curseurAvecValeur(
    el("label", { for: "reglage-voile", class: "reglages-libelle", texte: "Voile" }),
    voile,
    (v) => `${Math.round((v / VOILE_MAX) * 100)} %`,
  );
  const curseurFlou = curseurAvecValeur(
    el("label", { for: "reglage-flou", class: "reglages-libelle", texte: "Flou" }),
    flou,
    (v) => `${v} px`,
  );
  /** A photo is shown: the user's picture, or one of the gallery (V2.13). */
  const estPhoto = (type) => ["image", "galerie", "aleatoire"].includes(type);
  /** The gallery and random backgrounds are set from the "Image" panel. */
  const typeAffiche = (type) => (estPhoto(type) ? "image" : type);
  const reglerImage = (cle, valeur) => {
    const fond = lire().fond;
    if (estPhoto(fond.type)) modifier({ fond: { ...fond, [cle]: valeur } });
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
        voile: estPhoto(ancien.type) ? ancien.voile : 0.25,
        flou: estPhoto(ancien.type) ? ancien.flou : 0,
      },
    });
    // One active picture only: the previous one is removed from IndexedDB.
    if (ancien.type === "image" && ancien.ref)
      plateforme.fichiers.supprimerFond(ancien.ref.slice(6)).catch(() => {});
    etatImage.textContent = `Image ${r.largeur} × ${r.hauteur}, ${ko(r.blob.size)}.`;
    fichier.value = "";
  });

  const bibliotheque =
    session?.synchro?.lire().mode === "compte" ? creerBibliothequeFonds({ store, session }) : null;
  // V2.13: free photos of the gallery, or the user's own pictures.
  const galerie = creerGalerie({
    lire: () => lire().fond,
    choisir: (fond) => modifier({ fond }),
  });
  const mesImages = el(
    "div",
    { class: "reglages-groupe" },
    // Account mode: the pictures go to the account's library (Storage), else stay local.
    bibliotheque ? bibliotheque.racine : fichier,
    bibliotheque ? null : etatImage,
    bibliotheque
      ? null
      : el("p", { class: "reglages-note", texte: "Image gardée sur cet appareil uniquement." }),
  );
  const sourcesImage = { galerie: galerie.racine, mesImages };
  const sourceImage = segments(
    "Source de l'image",
    [
      ["galerie", "Galerie"],
      ["mesImages", "Mes images"],
    ],
    lire().fond.type === "image" ? "mesImages" : "galerie",
    (v) => afficherSource(v),
  );
  const afficherSource = (v) => {
    sourceImage.maj(v);
    for (const [s, p] of Object.entries(sourcesImage)) p.hidden = s !== v;
  };
  const panneaux = {
    aucun: el("p", { class: "reglages-note", texte: "Fond du thème." }),
    couleur: el("div", { class: "reglages-ligne" }, nuancesCouleur, choixCouleur),
    degrade: nuancesDegrade,
    image: el(
      "div",
      { class: "reglages-image" },
      sourceImage.groupe,
      galerie.racine,
      mesImages,
      curseurVoile.racine,
      curseurFlou.racine,
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
    typeAffiche(lire().fond.type),
    (v) => {
      afficherPanneau(v);
      if (v === "aucun") modifier({ fond: { type: "aucun" } });
      if (v === "couleur" && lire().fond.type !== "couleur") {
        modifier({ fond: { type: "couleur", valeur: choixCouleur.value } });
      }
      if (v === "degrade" && lire().fond.type !== "degrade") {
        modifier({ fond: { type: "degrade", valeur: NOMS_DEGRADES[0] } });
      }
      // Image: the gallery comes first; nothing changes until a photo is chosen.
    },
  );
  const afficherPanneau = (type) => {
    for (const [t, p] of Object.entries(panneaux)) p.hidden = t !== type;
  };
  // Type of the background last applied: a change coming from elsewhere (another device,
  // another tab) also switches the panel; a click on a type keeps its own panel.
  let typeApplique = lire().fond.type;
  afficherSource(lire().fond.type === "image" ? "mesImages" : "galerie");

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

  const sectionFrequents = creerSectionFrequents({ store });

  // --- Compte (account) -----------------------------------------------------------------
  const compteUi = session ? sectionCompte(session) : null;

  // --- Sliders with their value (V4.30) -------------------------------------------------------
  const pourcent = (v) => `${v} %`;
  const curseurTuiles = curseurAvecValeur(
    libelleAppareil("Taille des cartes"),
    tailleTuiles,
    pourcent,
  );
  const curseurTitres = curseurAvecValeur(
    libelleAppareil("Taille du texte des titres"),
    tailleTitres,
    pourcent,
  );
  const curseurOpacite = curseurAvecValeur(
    libelleAppareil("Opacité de la fenêtre de dossier"),
    opaciteDossier,
    pourcent,
  );
  const curseurs = [curseurTuiles, curseurTitres, curseurOpacite, curseurVoile, curseurFlou];

  // --- Sections (V4.30: grouped by what the user is looking for) ------------------------------
  const contenus = {
    compte: compteUi
      ? [
          compteUi.section,
          session.donnees
            ? sectionDonnees({
                donnees: session.donnees,
                restauration: session.restauration,
                store,
              }).section
            : null,
          compteUi.confidentialite,
          compteUi.danger,
        ]
      : null,
    apparence: [
      section("Thème", theme.groupe),
      section("Fond d'écran", typeFond.groupe, ...Object.values(panneaux)),
      section(
        "Animations",
        ...ligneDes(["animationsReduites"]),
        libelleAppareil("Passage d'une page à l'autre"),
        animationPage.groupe,
        el("p", {
          class: "reglages-note",
          texte:
            "Effet joué quand l'accueil change de page. Sans effet avec « Animations réduites » ou en défilement vertical.",
        }),
        libelleAppareil("Ouverture des dossiers et sous-dossiers"),
        animationDossier.groupe,
        el("p", {
          class: "reglages-note",
          texte:
            "Effet joué à l'ouverture d'un dossier et quand on entre dans un sous-dossier ou qu'on en sort.",
        }),
      ),
    ],
    accueil: [
      section(
        "Disposition",
        libelleAppareil("Affichage de l'accueil"),
        affichageAccueil.groupe,
        reglagesPages,
        reglagesDefilement,
      ),
      section(
        "Icônes",
        curseurTuiles.racine,
        libelleAppareil("Forme des icônes"),
        formeIcones.groupe,
        libelleAppareil("Espacement des cartes"),
        espacement.groupe,
        libelleAppareil("Ombre sous les icônes"),
        ombreIcones.groupe,
      ),
      section("Titres des icônes", ...ligneDes(["masquerTitres"]), curseurTitres.racine),
      section(
        "Dossiers",
        libelleAppareil("Style des dossiers"),
        styleDossier.groupe,
        curseurOpacite.racine,
        ...ligneDes(["gardeDossierOuvert"]),
      ),
      section(
        "Horloge et recherche",
        libelleAppareil("Heure et date"),
        affichageHeure.groupe,
        ...ligneDes(["masquerRecherche"]),
      ),
      sectionFrequents.section,
    ],
    general: [
      section(
        "Ouverture des liens",
        el("p", { class: "reglages-note", texte: "Votre page NedoTab reste ouverte derrière." }),
        ...ligneDes(CLES_LIENS),
        ...(navigateur
          ? [
              libelleAppareil("Ouvrir les sites avec"),
              navigateur.groupe,
              el("p", {
                class: "reglages-note",
                texte:
                  "Le navigateur choisi doit être installé sur cet appareil, sinon le site ne s'ouvre pas.",
              }),
            ]
          : []),
      ),
      curseurRecherche
        ? section(
            "Nouvel onglet",
            el(
              "label",
              { class: "interrupteur" },
              el(
                "span",
                { class: "interrupteur-texte" },
                el("span", { texte: "Curseur dans la recherche NedoTab" }, mentionAppareil()),
                el("span", {
                  class: "reglages-note",
                  texte:
                    "Vous pouvez taper tout de suite. Chrome affiche alors l'adresse de NedoTab dans sa barre ; désactivé, le curseur reste dans la barre d'adresse.",
                }),
              ),
              curseurRecherche,
            ),
          )
        : null,
      section("Comportement", ...ligneDes(["confirmerSuppression"]), ligneHaptique),
      session
        ? section(
            "Ranger mes sites",
            el("p", {
              class: "reglages-note",
              texte:
                "Doublons, sites qui ne répondent plus et suggestions de rangement. Chaque changement demande votre confirmation et peut être annulé.",
            }),
            el("button", {
              type: "button",
              class: "bouton reglages-bouton-seul",
              texte: "Ranger mes sites…",
              onclick: (e) =>
                ouvrirRangement({
                  store,
                  enCompte: () => session.synchro.lire().mode === "compte",
                  iaActive: () => iaDe(store.lire().reglages).actif,
                  retourFocus: e.currentTarget,
                }),
            }),
          )
        : null,
      session
        ? section(
            "Historique d'utilisation",
            ...ligneDes(["sansSuiviUsage", "sansUsagePourIa"]),
            el("button", {
              type: "button",
              class: "bouton reglages-bouton-seul",
              texte: "Effacer l'historique d'utilisation",
              onclick: async () => {
                const ok = await demander({
                  titre: "Effacer l'historique d'utilisation",
                  message:
                    "Le classement par usage repart de zéro, sur tous vos appareils. Vos sites ne sont pas touchés.",
                  boutons: [
                    { libelle: "Annuler", valeur: false },
                    { libelle: "Effacer", valeur: true, principal: true, danger: true },
                  ],
                });
                if (!ok) return;
                await session.effacerUsage();
                toast("Historique d'utilisation effacé");
              },
            }),
          )
        : null,
    ],
    partage: session?.partage
      ? [
          section(
            "Espace de partage",
            el("p", {
              class: "reglages-note",
              texte:
                "Textes, liens et fichiers envoyés d'un appareil à l'autre (bouton en bas à gauche de l'accueil). Non inclus dans les sauvegardes ; inclus dans l'export de vos données ; jamais envoyés à l'assistant IA.",
            }),
            // V4.27: every item expires; the default duration is per device.
            el(
              "label",
              { class: "reglages-ligne reglages-ligne--choix" },
              el("span", { class: "reglages-libelle" }, "Durée par défaut", mentionAppareil()),
              el(
                "select",
                {
                  class: "reglages-select",
                  "aria-label": "Durée par défaut avant suppression",
                  onchange: (e) => session.partage?.definirDuree(e.target.value),
                },
                DUREES.map((d) =>
                  el("option", {
                    value: d.id,
                    selected: d.id === (session.partage?.dureeDefaut() ?? "1j"),
                    texte: d.libelle,
                  }),
                ),
              ),
            ),
            el("p", {
              class: "reglages-note",
              texte:
                "Les éléments sont supprimés automatiquement, fichiers compris, à l'échéance, sauf si vous choisissez « Illimité ».",
            }),
          ),
          // V4.26: the vault (end-to-end encryption of sharing-space items).
          session.partage.coffre
            ? section(
                "Vault",
                el("p", {
                  class: "reglages-note",
                  texte:
                    "Chiffre des éléments de l'espace de partage sur l'appareil. Le mot de passe et la clé de secours ne sont jamais envoyés ; sans eux, le contenu est irrécupérable. Copier un texte du vault tente d'effacer le presse-papiers après 30 s (sans garantie). Jamais envoyé à l'assistant IA.",
                }),
                session.partage.coffre.sectionReglages(),
              )
            : null,
          section(
            "Entretien",
            el("p", {
              class: "reglages-note",
              texte:
                "Recalcule l'espace utilisé si le compteur semble faux, ou supprime tout ce qui est partagé.",
            }),
            el(
              "div",
              { class: "reglages-boutons" },
              el("button", {
                type: "button",
                class: "bouton",
                texte: "Recalculer le compteur",
                onclick: async () => {
                  try {
                    const fb = await chargerFirebase();
                    const r = await fb.reconcilierPartage(session.compte.lire().profil.uid);
                    toast(
                      `${r.nb} élément${r.nb > 1 ? "s" : ""}, compteur corrigé${r.orphelins ? `, ${r.orphelins} fichier${r.orphelins > 1 ? "s" : ""} orphelin${r.orphelins > 1 ? "s" : ""} supprimé${r.orphelins > 1 ? "s" : ""}` : ""}`,
                    );
                  } catch {
                    toast("Impossible pour l'instant (hors ligne ?).", { type: "erreur" });
                  }
                },
              }),
              el("button", {
                type: "button",
                class: "bouton bouton--danger",
                texte: "Vider l'espace de partage",
                onclick: async () => {
                  const ok = await demander({
                    titre: "Vider l'espace de partage",
                    message:
                      "Tous les textes, liens et fichiers partagés seront supprimés, sur tous vos appareils. Cette action est définitive.",
                    boutons: [
                      { libelle: "Annuler", valeur: false },
                      { libelle: "Tout supprimer", valeur: true, principal: true, danger: true },
                    ],
                  });
                  if (!ok) return;
                  try {
                    await (
                      await chargerFirebase()
                    ).viderLePartage(session.compte.lire().profil.uid);
                    toast("Espace de partage vidé");
                  } catch {
                    toast("Impossible pour l'instant (hors ligne ?).", { type: "erreur" });
                  }
                },
              }),
            ),
          ),
        ]
      : null,
    sauvegardes: session?.sauvegardes
      ? [sectionSauvegardes(session.sauvegardes, session.restauration).section]
      : null,
    ia: session ? [sectionIa({ store, session }).section] : null,
    avance: [
      // Reading other sites needs a permission in the extension only (V3.0: capabilities).
      plateforme.capacites.permissionsSites
        ? section("Autorisations", etatPermission, boutonPermission)
        : null,
      section("Stockage", etatStockage),
      sectionDiagnostic({ store, session }),
      section(
        "À propos",
        versionApropos(),
        el(
          "label",
          { class: "reglages-case" },
          el("input", {
            type: "checkbox",
            checked: !!store.lire().reglagesAppareil?.debug,
            onchange: (e) => modifier({ debug: e.currentTarget.checked }),
          }),
          el("span", { texte: "Journal de débogage dans la console" }),
          mentionAppareil(),
        ),
        el(
          "p",
          { class: "reglages-liens" },
          el("a", { href: URL_SITE, target: "_blank", rel: "noopener", texte: "Site du projet" }),
          el("a", {
            href: `${URL_SITE}mise-a-jour.html`,
            target: "_blank",
            rel: "noopener",
            texte: "Nouveautés",
          }),
          // The extension is updated by hand (zip); the web app updates itself.
          plateforme.capacites.miseAJourManuelle
            ? el("a", {
                href: `${URL_SITE}mise-a-jour.html`,
                target: "_blank",
                rel: "noopener",
                texte: "Guide de mise à jour",
              })
            : null,
          // Web app on a computer (V3.0): the extension does more (new tab, site icons).
          plateforme.capacites.proposerExtension
            ? el("a", {
                href: URL_SITE,
                target: "_blank",
                rel: "noopener",
                texte: "Installer l'extension Chrome",
              })
            : null,
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
          "aria-labelledby": `onglet-${cle}`,
          tabindex: "-1",
          hidden: true,
        },
        el("h3", { class: "onglet-panneau-titre", texte: libelle }),
        ...contenus[cle],
      ),
    ]),
  );

  // The account, in short, at the top of the list: a press opens its section.
  const resumeCompte = el("button", {
    type: "button",
    class: "reglages-resume-compte",
    hidden: !contenus.compte,
    onclick: () => choisirOnglet("compte", { focus: true }),
  });
  const majResume = () => {
    if (!session) return;
    const etat = session.compte.lire();
    const profil = etat.statut === "connecte" ? etat.profil : null;
    const sync = session.synchro?.lire() ?? { mode: "local" };
    resumeCompte.replaceChildren(
      profil
        ? creerAvatar(profil, { taille: 40 })
        : el("span", { class: "reglages-resume-icone" }, icone("compte", { taille: 20 })),
      el(
        "span",
        { class: "reglages-resume-texte" },
        el("strong", { texte: profil ? profil.nom || profil.email : "Se connecter" }),
        el("span", {
          texte: profil
            ? sync.mode === "compte"
              ? "Synchronisé"
              : "Pas encore synchronisé"
            : "Retrouvez vos sites sur tous vos appareils",
        }),
      ),
      icone("chevron", { taille: 16 }),
    );
    resumeCompte.dataset.synchro = profil ? (sync.mode === "compte" ? "oui" : "non") : "aucun";
  };
  majResume();
  const arretsResume = session
    ? [session.compte.abonner?.(majResume), session.synchro?.abonner?.(majResume)].filter(
        (a) => typeof a === "function",
      )
    : [];

  const barreOnglets = el(
    "div",
    {
      class: "reglages-onglets",
      role: "tablist",
      "aria-label": "Rubriques des réglages",
      "aria-orientation": "vertical",
    },
    onglets.map(([cle, libelle, resume]) =>
      el(
        "button",
        {
          type: "button",
          class: "onglet",
          role: "tab",
          id: `onglet-${cle}`,
          "aria-controls": `onglet-panneau-${cle}`,
          dataset: { onglet: cle },
          onclick: () => choisirOnglet(cle, { focus: true }),
        },
        el("span", { class: "onglet-icone" }, icone(cle === "accueil" ? "grille" : cle)),
        el(
          "span",
          { class: "onglet-texte" },
          el("span", { class: "onglet-libelle", texte: libelle }),
          el("span", { class: "onglet-resume", texte: resume }),
        ),
        el("span", { class: "onglet-chevron" }, icone("chevron", { taille: 16 })),
      ),
    ),
  );
  barreOnglets.addEventListener("keydown", (e) => {
    const sens = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    if (!sens) return;
    e.preventDefault();
    const boutons = [...barreOnglets.querySelectorAll(".onglet")];
    const i = boutons.indexOf(document.activeElement);
    const suivant = boutons[(i + sens + boutons.length) % boutons.length];
    suivant.focus();
    // A wide screen shows the section at once; the phone's list waits for Enter.
    if (!enListe()) choisirOnglet(suivant.dataset.onglet);
  });
  const corps = el("div", { class: "reglages-corps" }, Object.values(panneauxOnglets));
  const navigation = el(
    "nav",
    { class: "reglages-nav", "aria-label": "Rubriques" },
    resumeCompte,
    barreOnglets,
  );

  const enListe = () => !!globalThis.matchMedia?.(LISTE_MAX).matches;
  let ongletActif = null;
  /** Shows a section. On a phone it slides over the list (`vue` = "detail"). */
  function choisirOnglet(cle, { focus = false } = {}) {
    const ordre = onglets.map(([c]) => c);
    const sens = ongletActif && ordre.indexOf(cle) < ordre.indexOf(ongletActif) ? "haut" : "bas";
    const meme = cle === ongletActif;
    const premier = ongletActif === null;
    ongletActif = cle;
    panneau.dataset.vue = "detail";
    rubrique.textContent = onglets.find(([c]) => c === cle)?.[1] ?? "";
    for (const b of barreOnglets.querySelectorAll(".onglet")) {
      const actif = b.dataset.onglet === cle;
      b.setAttribute("aria-selected", String(actif));
      b.tabIndex = actif ? 0 : -1;
    }
    for (const [c, p] of Object.entries(panneauxOnglets)) {
      p.hidden = c !== cle;
      if (c === cle && !premier && !meme) p.dataset.entree = sens;
    }
    if (!meme) corps.scrollTop = 0;
    if (focus && enListe()) panneauxOnglets[cle].focus({ preventScroll: true });
    try {
      localStorage.setItem(CLE_ONGLET, cle);
    } catch {
      /* the remembered tab is only a convenience */
    }
  }
  /** Phone: back to the list of sections. */
  function revenirALaListe() {
    panneau.dataset.vue = "liste";
    barreOnglets.querySelector(`[data-onglet="${ongletActif}"]`)?.focus({ preventScroll: true });
  }

  const rubrique = el("span", { class: "reglages-rubrique", "aria-hidden": "true" });
  const panneau = el(
    "dialog",
    { class: "reglages", "aria-labelledby": "reglages-titre", tabindex: "-1" },
    el(
      "header",
      { class: "reglages-entete" },
      el(
        "button",
        {
          type: "button",
          class: "reglages-retour",
          "aria-label": "Retour aux rubriques",
          onclick: () => revenirALaListe(),
        },
        icone("retour"),
      ),
      el("h2", { id: "reglages-titre", texte: "Réglages" }),
      rubrique,
      el(
        "button",
        {
          type: "button",
          class: "reglages-fermer",
          "aria-label": "Fermer les réglages",
          title: "Fermer (Échap)",
          onclick: () => fermer(),
        },
        icone("fermer"),
      ),
    ),
    navigation,
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
    typeFond.maj(typeAffiche(r.fond.type));
    if (r.fond.type !== typeApplique) {
      typeApplique = r.fond.type;
      afficherPanneau(typeAffiche(r.fond.type));
      if (estPhoto(r.fond.type)) afficherSource(r.fond.type === "image" ? "mesImages" : "galerie");
    }
    galerie.maj();
    colonnes.maj(String(store.lire().reglagesAppareil?.colonnes ?? "auto"));
    affichageAccueil.maj(affichageAccueilDe(store.lire().reglagesAppareil));
    animationPage.maj(animationPageDe(store.lire().reglagesAppareil));
    animationDossier.maj(animationDossierDe(store.lire().reglagesAppareil));
    lignesAccueil.maj(String(grilleActuelle().lignes));
    colonnesAccueil.maj(String(grilleActuelle().colonnes));
    montrerSelonAffichage();
    for (const i of interrupteurs) i.bouton.checked = !!r[i.cle] !== i.inverse;
    formeIcones.maj(formeIconesDe(store.lire().reglagesAppareil));
    espacement.maj(espacementDe(store.lire().reglagesAppareil));
    affichageHeure.maj(affichageHeureDe(store.lire().reglagesAppareil));
    tailleTitres.value = String(store.lire().reglagesAppareil?.tailleTitres ?? 100);
    ombreIcones.maj(ombreIconesDe(store.lire().reglagesAppareil));
    styleDossier.maj(styleDossierDe(store.lire().reglagesAppareil));
    opaciteDossier.value = String(store.lire().reglagesAppareil?.opaciteDossier ?? 100);
    retourHaptique.checked = !!store.lire().reglagesAppareil?.retourHaptique;
    navigateur?.maj(store.lire().reglagesAppareil?.navigateur ?? "safari");
    if (curseurRecherche) curseurRecherche.checked = !store.lire().reglagesAppareil?.barreChrome;
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
    voile.disabled = flou.disabled = !estPhoto(r.fond.type);
    if (estPhoto(r.fond.type)) {
      voile.value = String(r.fond.voile);
      flou.value = String(r.fond.flou);
    }
    sectionFrequents.maj(!r.sansSuiviUsage);
    for (const c of curseurs) c.maj();
    majStockage();
  };
  const desabonner = store.abonner(actualiser);

  const surTouche = (e) => {
    if (e.key === "Escape" && !document.querySelector("dialog[open]:modal")) {
      e.preventDefault();
      fermer();
    }
  };
  /**
   * A press outside the panel closes it, and that press does nothing else (no site opened
   * by mistake). Dialogs opened from the panel, toasts and menus count as inside; the
   * settings button closes it by itself.
   */
  const surPressionExterieure = (e) => {
    if (
      panneau.contains(e.target) ||
      document.querySelector("dialog[open]:modal") ||
      e.target.closest?.(".toasts, [role='menu'], .bouton-reglages")
    ) {
      return;
    }
    fermer();
    const avaler = (c) => {
      c.preventDefault();
      c.stopPropagation();
    };
    document.addEventListener("click", avaler, { capture: true, once: true });
    // The click follows the release at once; a press that never becomes a click (a drag)
    // must not swallow a later one.
    document.addEventListener(
      "pointerup",
      () => setTimeout(() => document.removeEventListener("click", avaler, true)),
      { capture: true, once: true },
    );
  };
  function fermer() {
    desabonner();
    compteUi?.arreter();
    arretsResume.forEach((a) => a());
    bibliotheque?.arreter();
    galerie.arreter();
    observateur?.disconnect();
    document.removeEventListener("keydown", surTouche);
    document.removeEventListener("pointerdown", surPressionExterieure, true);
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
  document.addEventListener("pointerdown", surPressionExterieure, true);

  document.body.append(panneau);
  afficherPanneau(typeAffiche(lire().fond.type));
  actualiser();
  copierFond();
  majPermission();
  panneau.show();
  let memorise = onglet ?? null; // asked by the caller (V4.8: the AI tab)
  try {
    memorise ??= localStorage.getItem(CLE_ONGLET);
  } catch {
    /* no remembered tab */
  }
  // Former keys (V4.29: "donnees") lead to the section that now holds their content.
  memorise = { donnees: "compte" }[memorise] ?? memorise;
  choisirOnglet(onglets.some(([c]) => c === memorise) ? memorise : onglets[0][0]);
  // Phone: the list of sections first, unless the caller asked for one (the AI tab).
  if (enListe() && !onglet) panneau.dataset.vue = "liste";
  // Focus goes to the panel itself: Tab then reaches its controls in order.
  panneau.focus({ preventScroll: true });
  ouvert = { fermer };
  return ouvert;
}
