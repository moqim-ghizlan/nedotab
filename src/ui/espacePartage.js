import { libelleAppareilAffiche } from "../core/appareils.js";
import {
  DESCRIPTION_MAX,
  LIMITE_CARACTERES,
  LIMITE_ELEMENTS,
  TITRE_MAX,
  titreDe,
  PAGE_ELEMENTS,
  apercu,
  creerElement,
  detecterType,
  estPlein,
  ilYA,
  longueur,
  nettoyerDetails,
  trier,
  trouverDoublon,
  urlSure,
  validerContenu,
} from "../core/espacePartage.js";
import { domaine } from "../core/url.js";
import { el } from "./dom.js";
import { icone } from "./icones.js";
import {
  boutonAction,
  confirmerAction,
  lienAction,
  rangeeActions,
  tuileType,
} from "./espacePartageActions.js";
import { vibrer } from "./haptique.js";
import { creerFichiers } from "./espacePartageFichiers.js";
import { toast } from "./toast.js";
import { creerCoffreUI } from "./coffre/coffre.js";
import { demander } from "./dialogues/commun.js";
import { creerSelecteurDuree } from "./selecteurDuree.js";
import { creerGalerie } from "./galeriePartage.js";
import { creerLienPourElement, ouvrirMesLiens } from "./liensPartage.js";
import {
  DUREES,
  nouvelleExpiration,
  DUREE_DEFAUT,
  MIGRATION_JOURS,
  calculerExpiration,
  dureeParId,
  dureesProlongeables,
  ecartDepuisConfirmation,
  estExpire,
  estIllimite,
  HEURE,
  maintenantCorrige,
  formaterTempsRestant,
  tempsRestantMs,
  libelleExpiration,
  prolonger,
  sansExpiration,
} from "../core/expirationPartage.js";

const CLE_VU = "nedotab:partageVu";
const CLE_DUREE = "nedotab:partageDuree"; // default duration, per device

const lireDuree = () => {
  try {
    return dureeParId(localStorage.getItem(CLE_DUREE)).id;
  } catch {
    return DUREE_DEFAUT;
  }
};

/**
 * Sharing space panel (V4.24): texts and links sent from one device to the others. A side
 * panel (380 px) on a wide screen, a full-screen sheet on a phone. Everything the user or a
 * copied page wrote is shown with textContent, never innerHTML; a link is clickable only when
 * its address is http or https.
 *
 * @param {object} d
 * @param {import("../core/store.js").Store} d.store
 * @param {() => boolean} d.disponible signed in and synchronised (account mode)
 * @param {() => boolean} [d.actif] the setting "Activer l'espace de partage" (T8): off, nothing is
 *   shown and no request is made
 * @param {() => Promise<object>} d.charger loads the Firebase module
 * @param {() => string|null} d.uid
 * @param {(texte: string) => Promise<void>} [d.copier]
 */
export function creerEspacePartage({
  store,
  disponible: disponibleCompte,
  actif = () => true,
  charger,
  uid,
  copier = copierTexte,
  coffre = creerCoffreUI({ charger, uid }),
  appareils = null,
}) {
  /** T12: name of the device of an item: current name by id, name at the time, then the kind. */
  const nomDe = (e) =>
    libelleAppareilAffiche(
      { appareilId: e.appareilId, appareil: e.appareil },
      appareils?.liste() ?? [],
    );
  const estIci = (e) => !!e.appareilId && e.appareilId === appareils?.id();
  // Usable: signed in AND turned on in the settings. Every check goes through here.
  const disponible = () => disponibleCompte() && actif();
  let ouvert = false;
  let elements = [];
  let compteur = 0;
  let octets = 0;
  let statut = "chargement"; // chargement | ok | erreur
  let depuisCache = false;
  let limite = PAGE_ELEMENTS;
  let peutPlus = false;
  let arret = [];
  let retourFocus = null;
  let envoiEnCours = false;
  const erreurs = new Map(); // contenu → message, for "Réessayer"
  // V4.30: cards whose drawer of actions is open, and the ids already shown (a new one drops in).
  const tiroirsOuverts = new Set();
  const dejaVus = new Set();
  let premierRendu = true;
  // V4.26: decrypted content of the vault items, in memory only, emptied when the vault locks.
  const dechiffres = new Map(); // id → { contenu, titre } | { corrompu: true }
  const enCours = new Set();

  // V4.27: every item expires. `ecart` = server clock − device clock, learnt when an item we
  // sent is confirmed; the display and the new expiries use the corrected time.
  let dureeId = lireDuree();
  let ecart = 0;
  const enAttenteVus = new Set();
  const prevenus = new Set(); // items already warned about
  let visiblesAvant = [];
  const expiration = () => calculerExpiration(dureeId, ecart);

  const fichiers = creerFichiers({
    coffre,
    creerLien: (e, octets) =>
      creerLienPourElement({
        charger,
        copier,
        dureeId,
        element: { type: "fichier", octets, nom: e.contenu, typeMime: e.typeMime },
      }),
    expiration,
    // V4.31: the title and description typed before attaching a file go with it.
    details: () =>
      nettoyerDetails({ titre: champTitre.value, description: champDescription.value }),
    viderDetails: () => viderDetails(),
    editerDetails: (valeurs) => editerDetails(valeurs),
    charger,
    uid,
    store,
    tiroirsOuverts,
    estNouveau: (id) => estNouveau(id),
    pied: (e) => pied(e),
    rendre: () => rendre(),
    octets: () => octets,
  });

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
    icone("partage", { taille: 22 }),
    pastille,
  );
  const champ = el("textarea", {
    id: "partage-champ",
    class: "partage-champ",
    rows: "2",
    placeholder: "Texte ou lien à envoyer",
    "aria-label": "Texte ou lien à envoyer",
    spellcheck: "false",
  });
  // Optional title and description of what is sent.
  const champTitre = el("input", {
    type: "text",
    class: "partage-champ partage-champ--titre",
    placeholder: "Titre (facultatif)",
    "aria-label": "Titre (facultatif)",
    maxlength: String(TITRE_MAX),
    autocomplete: "off",
  });
  const champDescription = el("textarea", {
    class: "partage-champ partage-champ--description",
    rows: "2",
    placeholder: "Description (facultatif)",
    "aria-label": "Description (facultatif)",
    maxlength: String(DESCRIPTION_MAX),
  });
  const compteurCaracteres = el("span", { class: "partage-compte", "aria-live": "polite" });
  // The title and the description stay folded until asked for (most items need neither).
  const extras = el(
    "div",
    { class: "partage-extras", id: "partage-extras", hidden: true },
    champTitre,
    champDescription,
  );
  const basculerExtras = el(
    "button",
    {
      type: "button",
      class: "partage-outil partage-outil--texte",
      "aria-expanded": "false",
      "aria-controls": "partage-extras",
      title: "Ajouter un titre et une description",
      onclick: () => montrerExtras(extras.hidden),
    },
    icone("texte", { taille: 18 }),
    el("span", { class: "partage-outil-libelle", texte: "Titre" }),
  );
  function montrerExtras(oui) {
    extras.hidden = !oui;
    basculerExtras.setAttribute("aria-expanded", String(oui));
    if (oui) champTitre.focus();
  }
  const messageAjout = el("p", {
    class: "partage-message",
    role: "status",
    "aria-live": "polite",
    hidden: true,
  });
  const envoyer = el(
    "button",
    {
      type: "button",
      class: "partage-envoyer",
      title: "Envoyer (Ctrl+Entrée)",
      onclick: () => envoyerContenu(),
    },
    el("span", { texte: "Envoyer" }),
    icone("envoyer", { taille: 18 }),
  );
  const coller = el(
    "button",
    {
      type: "button",
      class: "partage-outil",
      "aria-label": "Coller",
      title: "Coller le presse-papiers",
      onclick: () => collerPressePapiers(),
    },
    icone("coller", { taille: 18 }),
  );
  const proposerLien = el("button", {
    type: "button",
    class: "lien-discret",
    hidden: true,
    texte: "Enregistrer comme lien",
    onclick: () => envoyerContenu("lien"),
  });
  const bandeau = el("p", { class: "partage-bandeau", role: "status", hidden: true });
  const selecteurDureeComposant = creerSelecteurDuree({
    options: DUREES.map((d) => ({ id: d.id, libelle: d.libelle })),
    valeur: dureeId,
    onChoix: (id) => choisirDuree(id),
    libelle: "Durée avant suppression",
    decritPar: "partage-durees-libelle",
  });
  const selecteurDuree = selecteurDureeComposant.racine;
  const migration = el("div", { class: "partage-migration", role: "status", hidden: true });
  const liste = el("ul", { class: "partage-liste", "aria-live": "polite" });
  const plus = el("button", {
    type: "button",
    class: "bouton partage-plus",
    hidden: true,
    texte: "Voir plus",
    onclick: () => voirPlus(),
  });
  const fermerBouton = el(
    "button",
    {
      type: "button",
      class: "partage-fermer",
      "aria-label": "Fermer",
      title: "Fermer (Échap)",
      onclick: () => fermer(),
    },
    icone("fermer", { taille: 18 }),
  );
  const panneau = el(
    "aside",
    {
      class: "partage",
      role: "dialog",
      "aria-labelledby": "partage-titre",
      "aria-modal": "false",
      hidden: true,
    },
    el("div", { class: "partage-poignee", "aria-hidden": "true" }),
    el(
      "header",
      { class: "partage-entete" },
      el(
        "div",
        { class: "partage-entete-titre" },
        el("h2", { id: "partage-titre", texte: "Espace de partage" }),
        fichiers.quota,
      ),
      // V4.28: the active share links (create / revoke).
      el(
        "button",
        {
          type: "button",
          class: "partage-entete-bouton",
          title: "Liens publics actifs",
          onclick: () => ouvrirMesLiens({ charger }),
        },
        icone("lien", { taille: 16 }),
        el("span", { texte: "Mes liens" }),
      ),
      fermerBouton,
    ),
    fichiers.cadreDepot,
    el(
      "div",
      { class: "partage-corps" },
      bandeau,
      coffre.bandeau,
      migration,
      el(
        "div",
        { class: "partage-ajout" },
        el(
          "div",
          { class: "partage-composeur" },
          champ,
          extras,
          el(
            "div",
            { class: "partage-ajout-actions" },
            fichiers.boutonAjout,
            coller,
            basculerExtras,
            compteurCaracteres,
            envoyer,
          ),
        ),
        el(
          "div",
          { class: "partage-options" },
          el(
            "div",
            { class: "partage-option-duree" },
            el(
              "span",
              { id: "partage-durees-libelle", class: "partage-option-libelle" },
              icone("horloge", { taille: 14 }),
              el("span", { texte: "Supprimer après" }),
            ),
            selecteurDuree,
          ),
          coffre.caseChiffrer,
        ),
        fichiers.entree,
        fichiers.message,
        proposerLien,
        messageAjout,
      ),
      liste,
      plus,
    ),
  );

  function choisirDuree(id) {
    dureeId = dureeParId(id).id;
    try {
      localStorage.setItem(CLE_DUREE, dureeId);
    } catch {
      /* the choice then only lasts for this session */
    }
    majSelecteur();
  }
  function majSelecteur() {
    selecteurDureeComposant.definir(dureeId);
  }
  majSelecteur();

  async function choisirProlongation(e) {
    const options = dureesProlongeables(e, ecart);
    if (!options.length) return toast("Durée maximale atteinte");
    const choix = await demander({
      titre: "Prolonger",
      message: "Nouvelle durée à partir de maintenant (31 jours au plus, ou illimité).",
      boutons: [
        { libelle: "Annuler", valeur: null },
        ...options.map((d) => ({ libelle: d.libelle, valeur: d.id })),
      ],
    });
    if (!choix) return;
    const r = prolonger(e, choix, ecart);
    if (!r.ok) return toast(r.erreur);
    action(() => charger().then((fb) => fb.prolongerPartage(uid(), e.id, r.expireLe)));
  }

  const lienDe = (e) => (e.type === "lien" ? urlSure(e.contenu) : null);

  // --- Rendering ------------------------------------------------------------------------------
  function carte(brut) {
    // V4.26: an encrypted item is shown with its decrypted content only while the vault is open.
    const clair = brut.chiffre ? dechiffres.get(brut.id) : null;
    const verrouille = brut.chiffre && !clair?.contenu && !clair?.corrompu;
    const e =
      clair?.contenu !== undefined
        ? { ...brut, contenu: clair.contenu, titre: clair.titre, description: clair.description }
        : brut;
    const url = brut.chiffre && !clair ? null : lienDe(e);
    const texte = el("div", { class: "partage-texte" });
    if (brut.chiffre && (verrouille || clair?.corrompu)) {
      texte.append(
        el("span", {
          class: "partage-apercu partage-chiffre",
          texte: clair?.corrompu
            ? "Élément corrompu"
            : coffre.session.estDeverrouille()
              ? "Déchiffrement…"
              : "Contenu chiffré",
        }),
      );
    } else if (url) {
      // Only an http(s) address becomes a link; the text is the domain and the address.
      texte.append(
        el("a", {
          class: "partage-lien",
          href: url,
          target: "_blank",
          rel: "noopener noreferrer",
          texte: domaine(url),
        }),
        el("span", {
          class: "partage-detail partage-detail--url",
          title: url,
          texte: apercu(url, 120),
        }),
      );
    } else {
      texte.append(el("span", { class: "partage-apercu", texte: apercu(e.contenu) }));
    }
    // A title written by the user (not the automatic one) goes first, the description last.
    if (!(brut.chiffre && (verrouille || clair?.corrompu))) {
      if (e.titre && e.titre !== titreDe(e.type, e.contenu))
        texte.prepend(el("strong", { class: "partage-titre", texte: e.titre }));
      if (e.description)
        texte.append(
          el("span", { class: "partage-detail partage-description", texte: e.description }),
        );
    }
    const masque = brut.chiffre && (verrouille || clair?.corrompu);
    const copie = boutonAction("copier", "Copier", {
      hidden: masque,
      "aria-label": "Copier",
      onclick: async (ev) => {
        const b = ev.currentTarget;
        try {
          await copier(e.contenu);
          // Best effort (no guarantee, said in the help): the clipboard is emptied after 30 s.
          if (brut.chiffre) setTimeout(() => copier("").catch(() => {}), 30_000);
          confirmerAction(b, "Copié ✓");
          vibrer(store, 12);
        } catch {
          toast("Copie impossible : sélectionnez le texte à la main.", { type: "erreur" });
        }
      },
    });
    const actions = rangeeActions(
      brut.id,
      [copie, url ? lienAction("ouvrir", "Ouvrir", url) : null],
      [
        boutonAction("epingle", e.epingle ? "Désépingler" : "Épingler", {
          "aria-pressed": String(e.epingle),
          onclick: () =>
            action(() => charger().then((fb) => fb.epinglerPartage(uid(), e.id, !e.epingle))),
        }),
        // V4.28: a public link to a COPY of this text or link (the clear content, decrypted if it
        // came from the vault; the copy is re-encrypted with the key of the link).
        e.type !== "fichier" && !masque
          ? boutonAction("lien", "Créer un lien", {
              onclick: () =>
                creerLienPourElement({
                  charger,
                  copier,
                  element: { type: e.type, contenu: e.contenu },
                  dureeId,
                }),
            })
          : null,
        !masque
          ? boutonAction("crayon", "Modifier", { onclick: () => modifierTexte(brut, e) })
          : null,
        boutonAction("horloge", "Prolonger", { onclick: () => choisirProlongation(e) }),
        boutonAction("poubelle", "Supprimer", {
          classe: "partage-action--danger",
          onclick: () => supprimerAvecAnnulation(e),
        }),
      ],
      tiroirsOuverts,
    );
    return el(
      "li",
      {
        class: `partage-carte${e.enAttente ? " partage-carte--attente" : ""}${e.epingle ? " partage-carte--epingle" : ""}${estNouveau(brut.id) ? " partage-carte--nouvelle" : ""}`,
        dataset: { id: e.id, type: e.type },
      },
      brut.chiffre
        ? tuileType(verrouille ? "cadenas" : "cadenasOuvert", "coffre")
        : tuileType(e.type === "lien" ? "lien" : "texte", e.type),
      texte,
      ...pied(e),
      actions,
    );
  }

  /** When and where it was sent, and when it goes (texts, links and files alike). */
  function pied(e) {
    const expire = libelleExpiration(e, ecart);
    const restant = tempsRestantMs(e, ecart);
    // Under an hour the pill takes the warning colour (under 15 min it is the urgent one).
    const bientot = restant !== null && restant < 60 * 60_000 && !expire.urgent;
    return [
      el(
        "div",
        { class: "partage-pied" },
        el(
          "span",
          { class: "partage-meta" },
          e.epingle ? icone("epingle", { taille: 12 }) : null,
          el("span", {
            texte: `${e.enAttente ? "Envoi… · " : ""}${ilYA(e.creeLe)} · depuis ${nomDe(e)}${estIci(e) ? " (cet appareil)" : ""}`,
          }),
        ),
        expire.texte
          ? el(
              "span",
              { class: `partage-expire${expire.urgent ? " partage-expire--urgent" : bientot ? " partage-expire--bientot" : ""}` },
              icone("horloge", { taille: 12 }),
              expire.texte,
            )
          : null,
      ),
    ];
  }

  /** A card seen for the first time after the first load: it drops into the list once. */
  function estNouveau(id) {
    if (dejaVus.has(id)) return false;
    dejaVus.add(id);
    return !premierRendu;
  }

  function rendre() {
    // An expired item disappears at once (the server deletes it a little later).
    const visibles = elements.filter((e) => !estExpire(e, ecart));
    // V4.27: a warning five minutes before, and a polite announcement when an item has just gone.
    if (ouvert) {
      const proches = visibles.filter((e) => {
        const ms = tempsRestantMs(e, ecart);
        return ms !== null && ms > 0 && ms <= 5 * 60_000 && !prevenus.has(e.id);
      });
      proches.forEach((e) => prevenus.add(e.id));
      if (proches.length)
        toast(
          `Expire dans ${formaterTempsRestant(Math.min(...proches.map((e) => tempsRestantMs(e, ecart))))}`,
        );
      if (visiblesAvant.some((id) => elements.some((e) => e.id === id && estExpire(e, ecart))))
        toast("Cet élément a expiré");
    }
    visiblesAvant = visibles.map((e) => e.id);
    const sans = sansExpiration(visibles);
    migration.hidden = sans.length === 0;
    migration.replaceChildren();
    if (sans.length) {
      migration.append(
        el("span", {
          texte: `${sans.length} élément${sans.length > 1 ? "s" : ""} sans date d'expiration. `,
        }),
        el("button", {
          type: "button",
          class: "lien-discret",
          texte: `Les faire expirer dans ${MIGRATION_JOURS} jours`,
          onclick: () =>
            action(() =>
              charger().then((fb) =>
                fb.migrerExpirationPartage(
                  uid(),
                  sans.map((e) => e.id),
                  calculerExpiration("7j", ecart),
                ),
              ),
            ),
        }),
      );
    }
    const hors = typeof navigator !== "undefined" && navigator.onLine === false;
    bandeau.hidden = !(hors || depuisCache);
    bandeau.textContent = hors
      ? "Hors ligne — vos envois partiront à la reconnexion."
      : "Contenu du cache — mise à jour en cours…";
    liste.replaceChildren();
    if (statut === "chargement" && elements.length === 0) {
      for (let i = 0; i < 3; i++)
        liste.append(el("li", { class: "partage-carte partage-squelette", "aria-hidden": "true" }));
    } else if (statut === "erreur") {
      liste.append(
        el(
          "li",
          { class: "partage-carte partage-carte--erreur", role: "alert" },
          el("span", { texte: "Impossible de lire l'espace de partage." }),
          el("button", {
            type: "button",
            class: "partage-action",
            texte: "Réessayer",
            onclick: () => demarrerEcoute(),
          }),
        ),
      );
    } else if (elements.length === 0 && fichiers.nbEnvois() === 0) {
      liste.append(
        el(
          "li",
          { class: "partage-vide" },
          el(
            "span",
            { class: "partage-vide-icone", "aria-hidden": "true" },
            icone("partage", { taille: 28 }),
          ),
          el("p", { class: "partage-aucun", texte: "Aucun élément" }),
          el("p", { texte: "Envoyez un texte ou un lien d'un appareil à l'autre." }),
          el("p", {
            class: "partage-vide-astuce",
            texte: "Vous pouvez aussi glisser un fichier ici ou coller une image.",
          }),
        ),
      );
    } else {
      liste.append(
        ...fichiers.cartesEnvoi(),
        ...trier(visibles).map((e) => (e.type === "fichier" ? fichiers.carte(e) : carte(e))),
      );
    }
    if (statut === "ok") premierRendu = false;
    dechiffrerVisibles();
    fichiers.elementsVus(elements);
    boutonGalerie.querySelector(".partage-galerie-nb").textContent = String(visibles.length);
    boutonGalerie.disabled = visibles.length === 0;
    for (const f of ecouteursGalerie) f();
    plus.hidden = !peutPlus;
    compteurCaracteres.textContent =
      longueur(champ.value) > LIMITE_CARACTERES * 0.8
        ? `${longueur(champ.value).toLocaleString("fr-FR")} / ${LIMITE_CARACTERES.toLocaleString("fr-FR")}`
        : "";
    const plein = estPlein(compteur);
    envoyer.disabled = envoiEnCours;
    messageAjout.hidden = !plein && !messageAjout.textContent;
    if (plein) {
      messageAjout.hidden = false;
      messageAjout.textContent = `${LIMITE_ELEMENTS} éléments maximum — supprimez-en pour continuer.`;
    }
    proposerLien.hidden = !(detecterType(champ.value) === "lien" && champ.value.trim() !== "");
  }

  /** Decrypts (in memory) the encrypted items on screen while the vault is open. */
  async function dechiffrerVisibles() {
    if (!coffre.session.estDeverrouille()) return;
    const aFaire = elements.filter(
      // `bloc`: the encrypted text read; a block changed elsewhere ("Modifier") is read again.
      (e) =>
        e.chiffre &&
        e.type !== "fichier" &&
        dechiffres.get(e.id)?.bloc !== e.contenu &&
        !enCours.has(e.id),
    );
    if (!aFaire.length) return;
    aFaire.forEach((e) => enCours.add(e.id));
    for (const e of aFaire) {
      try {
        dechiffres.set(e.id, { ...(await coffre.dechiffrer(e)), bloc: e.contenu });
      } catch {
        dechiffres.set(e.id, { corrompu: true, bloc: e.contenu });
      }
      enCours.delete(e.id);
    }
    rendre();
  }

  // The vault locks: nothing decrypted stays in memory or in the DOM.
  coffre.session.surVerrouille(() => {
    dechiffres.clear();
    rendre();
  });
  coffre.session.surDeverrouille(() => rendre());
  panneau.addEventListener("pointerdown", () => coffre.session.activite());
  panneau.addEventListener("keydown", () => coffre.session.activite());

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
    const r = creerElement({
      contenu: brut,
      type,
      titre: champTitre.value,
      description: champDescription.value,
    });
    if (!r.ok) return montrerErreur(r.erreur);
    const chiffre = coffre.veutChiffrer();
    // V4.26: the vault must be open (created or unlocked) BEFORE anything is sent.
    if (chiffre && !(await coffre.assurerDeverrouille())) return;
    envoiEnCours = true;
    rendre();
    try {
      const fb = await charger();
      // Same content already there: it goes back to the top (not for the vault: contents are unreadable).
      const doublon =
        chiffre || champTitre.value.trim() || champDescription.value.trim()
          ? null
          : trouverDoublon(
              elements.filter((x) => !x.chiffre),
              r.element,
            );
      if (doublon) await fb.remonterPartage(uid(), doublon.id);
      else
        await fb.ajouterAuPartage(
          uid(),
          { ...r.element, chiffre, expireLe: expiration() },
          chiffre ? coffre.chiffrer : null,
        );
      champ.value = "";
      viderDetails();
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

  function viderDetails() {
    champTitre.value = "";
    champDescription.value = "";
    extras.hidden = true;
    basculerExtras.setAttribute("aria-expanded", "false");
  }

  /**
   * V4.31: "Modifier": the title and the description of an item, after it was sent.
   * T4: with `element`, the window also shows when it expires and lets the user extend it
   * (add a duration, or a new one counted from now). Only later dates are offered.
   * @returns {Promise<{ titre: string, description: string, expireLe?: number } | null>}
   *   null when cancelled; `expireLe` only when the user changed it
   */
  async function editerDetails({ titre = "", description = "", element = null }) {
    const t = el("input", {
      id: "partage-modif-titre",
      type: "text",
      value: titre,
      placeholder: "Titre (facultatif)",
      maxlength: String(TITRE_MAX),
      autocomplete: "off",
    });
    const d = el("textarea", {
      id: "partage-modif-description",
      rows: "3",
      placeholder: "Description (facultatif)",
      maxlength: String(DESCRIPTION_MAX),
    });
    d.value = description;
    // --- expiry -------------------------------------------------------------------------
    let choix = { mode: "garder" };
    const avecDuree = Number.isFinite(element?.expireLe);
    const maintenant = Date.now();
    const options = (mode, liste) =>
      liste.map(([id, libelle]) => {
        const r = nouvelleExpiration(element, { mode, duree: id }, ecart, maintenant);
        return { id, libelle, desactive: !r.ok, raison: r.ok ? "" : r.erreur };
      });
    let ajout = null;
    let neuf = null;
    let resume = null;
    let raisonsDuree = null;
    const majResume = () => {
      if (!resume) return;
      const r = nouvelleExpiration(element, choix, ecart, maintenant);
      const apres = r.ok && r.change ? { ...element, expireLe: r.expireLe } : null;
      resume.replaceChildren(
        el("span", { texte: libelleExpiration(element, ecart, maintenant).texte || "illimité" }),
        ...(apres
          ? [
              el("span", { "aria-hidden": "true", texte: " → " }),
              el("strong", { texte: libelleExpiration(apres, ecart, maintenant).texte }),
            ]
          : []),
        ...(apres && !estIllimite(r.expireLe) && r.expireLe < element.expireLe
          ? [
              el("br"),
              el("small", {
                class: "partage-modif-alerte",
                texte: `Cet élément sera supprimé le ${new Date(r.expireLe).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" })}.`,
              }),
            ]
          : []),
      );
    };
    if (avecDuree) {
      const illimite = estIllimite(element.expireLe);
      resume = el("p", { class: "partage-modif-resume", "aria-live": "polite" });
      if (!illimite) {
        ajout = creerSelecteurDuree({
          options: [
            { id: "garder", libelle: "Garder" },
            ...options("ajouter", [
              ["1h", "+ 1 h"],
              ["1j", "+ 1 j"],
              ["7j", "+ 7 j"],
              ["30j", "+ 30 j"],
            ]),
          ],
          valeur: "garder",
          libelle: "Prolonger de",
          onChoix: (id) => {
            choix = id === "garder" ? { mode: "garder" } : { mode: "ajouter", duree: id };
            neuf.definir("garder");
            majResume();
          },
        });
      }
      neuf = creerSelecteurDuree({
        options: [
          { id: "garder", libelle: "Garder" },
          ...options(
            "depuis-maintenant",
            DUREES.map((x) => [x.id, x.libelle]),
          ),
        ],
        valeur: "garder",
        libelle: "Nouvelle durée à partir de maintenant",
        onChoix: (id) => {
          choix = id === "garder" ? { mode: "garder" } : { mode: "depuis-maintenant", duree: id };
          ajout?.definir("garder");
          majResume();
        },
      });
      // A disabled choice always says why, in plain text under the selector.
      const raisons = [
        ...new Set(
          [
            ...(ajout
              ? options("ajouter", [["1h", ""], ["1j", ""], ["7j", ""], ["30j", ""]])
              : []),
            ...options("depuis-maintenant", DUREES.map((x) => [x.id, ""])),
          ]
            .filter((o) => o.desactive && o.raison)
            .map((o) => o.raison),
        ),
      ];
      raisonsDuree = raisons.length
        ? el("p", { class: "partage-modif-raison", texte: raisons.join(" ") })
        : null;
      majResume();
    }
    const ok = await demander({
      titre: "Titre et description",
      contenu: [
        el("div", { class: "champ" }, el("label", { for: t.id, texte: "Titre" }), t),
        el("div", { class: "champ" }, el("label", { for: d.id, texte: "Description" }), d),
        avecDuree
          ? el(
              "section",
              { class: "partage-modif-duree" },
              el("h3", { class: "partage-modif-titre", texte: "Durée de conservation" }),
              resume,
              ajout ? el("p", { class: "partage-modif-libelle", texte: "Prolonger de…" }) : null,
              ajout?.racine ?? null,
              el("p", {
                class: "partage-modif-libelle",
                texte: ajout
                  ? "Ou nouvelle durée à partir de maintenant"
                  : "Nouvelle durée à partir de maintenant",
              }),
              neuf.racine,
              raisonsDuree,
            )
          : null,
      ],
      boutons: [
        { libelle: "Annuler", valeur: false },
        { libelle: "Enregistrer", valeur: true, principal: true },
      ],
    });
    if (!ok) return null;
    const r = nettoyerDetails({ titre: t.value, description: d.value });
    const exp = avecDuree ? nouvelleExpiration(element, choix, ecart, maintenant) : null;
    // Shortening to about an hour deletes the item soon: ask first.
    if (
      exp?.ok &&
      exp.change &&
      !estIllimite(exp.expireLe) &&
      exp.expireLe < element.expireLe &&
      exp.expireLe - maintenantCorrige(ecart, maintenant) <= HEURE
    ) {
      const sur = await demander({
        titre: "Raccourcir la durée ?",
        message: "Cet élément sera supprimé dans environ une heure.",
        boutons: [
          { libelle: "Annuler", valeur: false },
          { libelle: "Raccourcir", valeur: true, principal: true },
        ],
      });
      if (!sur) return null;
    }
    return exp?.ok && exp.change ? { ...r, expireLe: exp.expireLe } : r;
  }

  async function modifierTexte(brut, e) {
    const auto = titreDe(e.type, e.contenu);
    const r = await editerDetails({
      titre: e.titre && e.titre !== auto ? e.titre : "",
      description: e.description ?? "",
      element: brut,
    });
    if (!r) return;
    const titre = r.titre || auto;
    if (brut.chiffre && !coffre.session.estDeverrouille()) return;
    action(async () => {
      const fb = await charger();
      if (brut.chiffre) {
        const clair = { contenu: e.contenu, titre, description: r.description };
        const bloc = await coffre.chiffrer(brut.id, clair);
        await fb.modifierDetailsPartage(uid(), brut.id, { contenu: bloc });
        dechiffres.set(brut.id, { ...clair, bloc });
      } else {
        await fb.modifierDetailsPartage(uid(), brut.id, { titre, description: r.description });
      }
      if (r.expireLe) await fb.prolongerPartage(uid(), brut.id, r.expireLe);
      rendre();
    });
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
      // An encrypted item is re-encrypted under its NEW id: possible only if it was decrypted.
      const clair = e.chiffre ? dechiffres.get(e.id) : null;
      const restaurable =
        !e.chiffre || (clair?.contenu !== undefined && coffre.session.estDeverrouille());
      toast("Supprimé", {
        duree: 5000,
        action: restaurable
          ? {
              libelle: "Annuler",
              onClic: () =>
                action(() =>
                  e.chiffre
                    ? fb.ajouterAuPartage(
                        uid(),
                        {
                          type: e.type,
                          contenu: clair.contenu,
                          titre: clair.titre,
                          description: clair.description,
                          epingle: e.epingle,
                          marque: {
                            appareil: e.appareil,
                            ...(e.appareilId ? { appareilId: e.appareilId } : {}),
                          },
                          chiffre: true,
                        },
                        coffre.chiffrer,
                      )
                    : fb.restaurerPartage(uid(), e),
                ),
            }
          : undefined,
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
            // Learn the clock offset from an item we sent: seen pending, now confirmed.
            for (const e of liste_) {
              if (e.enAttente) enAttenteVus.add(e.id);
              else if (enAttenteVus.delete(e.id) && e.creeLe)
                ecart = ecartDepuisConfirmation(e.creeLe);
            }
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
        fb.ecouterCompteurPartage(uid(), (nb, o) => {
          compteur = nb;
          octets = o;
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
      localStorage.setItem(
        CLE_VU,
        String(Math.max(dernierVu(), ...elements.map((e) => e.creeLe ?? 0))),
      );
    } catch {
      /* the dot is only a comfort */
    }
  };
  function majPastille() {
    if (ouvert) return noterVu();
    const vu = dernierVu();
    // First use on this device: nothing is "new" yet.
    if (vu === 0) return noterVu();
    pastille.hidden = !elements.some(
      (e) =>
        (e.creeLe ?? 0) > vu &&
        (e.appareilId && appareils?.id() ? e.appareilId !== appareils.id() : e.appareil !== typeLocal()),
    );
  }
  const typeLocal = () => (import.meta.env.VITE_TARGET === "pwa" ? undefined : "extension");

  // --- Open / close -----------------------------------------------------------------------------
  function ouvrir() {
    if (!disponible()) return;
    if (ouvert) {
      // Already open: only give the focus back to the sending area.
      if (matchMedia("(min-width: 900px)").matches) champ.focus();
      return;
    }
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
    fichiers.liberer();
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
      const cibles = [
        ...panneau.querySelectorAll("button, a[href], textarea, input:not([type=file])"),
      ].filter((n) => !n.disabled && !n.closest("[hidden]") && n.tabIndex >= 0);
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
    if (
      !panneau.contains(e.target) &&
      !bouton.contains(e.target) &&
      !e.target.closest?.(".toast, .menu, dialog, .partage-visionneuse, .pgal")
    )
      fermer();
  };

  // --- Gallery (T6): full-screen library and viewer, fed by the same data and actions ----------
  const vues = () =>
    trier(elements.filter((e) => !estExpire(e, ecart))).map((brut) => {
      if (brut.type === "fichier") return { ...fichiers.vue(brut), brut };
      const clair = brut.chiffre ? dechiffres.get(brut.id) : null;
      if (brut.chiffre && !clair?.contenu)
        return { ...brut, contenu: "", titre: "", description: "", verrouille: true, brut };
      const e =
        clair?.contenu !== undefined
          ? { ...brut, contenu: clair.contenu, titre: clair.titre, description: clair.description }
          : brut;
      return { ...e, verrouille: false, brut };
    });
  const ecouteursGalerie = new Set();
  const actionsGalerie = (item) => {
    const { brut } = item;
    const liste = [];
    const ajouter = (id, libelle, onChoix, extra = {}) =>
      liste.push({ id, libelle, onChoix, ...extra });
    if (!item.verrouille) {
      if (item.type === "fichier") {
        ajouter("telecharger", "Télécharger", () => fichiers.telecharger(item));
        if (typeof navigator.share === "function" && matchMedia("(pointer: coarse)").matches)
          ajouter("partager", "Partager", () => fichiers.partager(item));
        if (item.taille <= 5 * 1024 * 1024)
          ajouter("lien", "Créer un lien de partage", () => fichiers.lienFichier(item));
      } else {
        ajouter("copier", "Copier", () =>
          copier(item.contenu).then(
            () => toast("Copié"),
            () => toast("Copie impossible", { type: "erreur" }),
          ),
        );
        const url = item.type === "lien" ? urlSure(item.contenu) : null;
        if (url)
          ajouter("ouvrir", "Ouvrir le lien", () =>
            window.open(url, "_blank", "noopener,noreferrer"),
          );
        ajouter("lien", "Créer un lien de partage", () =>
          creerLienPourElement({
            charger,
            copier,
            element: { type: item.type, contenu: item.contenu },
            dureeId,
          }),
        );
      }
      ajouter("modifier", "Modifier le titre et la description", () =>
        item.type === "fichier"
          ? fichiers.modifier(brut, item, item.titre && item.titre !== item.contenu ? item.titre : "")
          : modifierTexte(brut, item),
      );
    } else {
      ajouter("deverrouiller", "Déverrouiller le coffre", () => coffre.assurerDeverrouille());
    }
    ajouter("epingler", item.epingle ? "Désépingler" : "Épingler", () =>
      action(() => charger().then((fb) => fb.epinglerPartage(uid(), item.id, !item.epingle))),
    );
    ajouter("prolonger", "Prolonger la durée", () => choisirProlongation(item));
    liste.push("-");
    ajouter(
      "supprimer",
      "Supprimer",
      () =>
        item.type === "fichier"
          ? fichiers.supprimer(brut)
          : charger().then((fb) => fb.supprimerDuPartage(uid(), item.id)),
      { danger: true },
    );
    return liste;
  };
  const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? "s" : ""}`;
  const galerie = creerGalerie({
    vues,
    abonner: (f) => {
      ecouteursGalerie.add(f);
      return () => ecouteursGalerie.delete(f);
    },
    urlApercu: (item) =>
      item.type === "fichier" && !item.verrouille ? fichiers.urlApercu(item) : Promise.resolve(null),
    deverrouiller: () => coffre.assurerDeverrouille(),
    actions: actionsGalerie,
    ecart: () => ecart,
    appareil: (item) => nomDe(item),
    lot: {
      async supprimer(liste) {
        try {
          const fb = await charger();
          for (const i of liste)
            await (i.type === "fichier"
              ? fb.supprimerFichierPartage(uid(), i.brut)
              : fb.supprimerDuPartage(uid(), i.id));
          toast(`${pluriel(liste.length, "élément")} supprimé${liste.length > 1 ? "s" : ""}`);
        } catch {
          toast("Suppression impossible pour l'instant.", { type: "erreur" });
        }
      },
      async prolonger(liste) {
        const choix = await demander({
          titre: `Prolonger ${pluriel(liste.length, "élément")}`,
          message:
            "Nouvelle durée à partir de maintenant (30 jours au plus depuis l'envoi, ou illimité).",
          boutons: [
            { libelle: "Annuler", valeur: null },
            ...DUREES.map((d) => ({ libelle: d.libelle, valeur: d.id })),
          ],
        });
        if (!choix) return;
        let faits = 0;
        const fb = await charger().catch(() => null);
        for (const i of liste) {
          const r = prolonger(i, choix, ecart);
          if (!r.ok || !fb) continue;
          try {
            await fb.prolongerPartage(uid(), i.id, r.expireLe);
            faits++;
          } catch {
            /* counted as unchanged */
          }
        }
        toast(
          faits
            ? `${faits} prolongé${faits > 1 ? "s" : ""}${faits < liste.length ? `, ${liste.length - faits} inchangé${liste.length - faits > 1 ? "s" : ""}` : ""}`
            : "Rien à prolonger avec cette durée",
        );
      },
      async telecharger(liste) {
        for (const i of liste) {
          await fichiers.telecharger(i);
          await new Promise((ok) => setTimeout(ok, 300));
        }
      },
    },
  });
  const boutonGalerie = el(
    "button",
    { type: "button", class: "partage-galerie-bouton", onclick: () => galerie.ouvrir() },
    icone("grille", { taille: 18 }),
    el("span", { texte: "Ouvrir la galerie" }),
    el("span", { class: "partage-galerie-nb", texte: "0" }),
  );
  panneau.append(el("div", { class: "partage-galerie-pied" }, boutonGalerie));

  fichiers.brancherZone(panneau);

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
  // The remaining time is shown to the minute: refreshed every 30 s, not every second (battery).
  setInterval(() => ouvert && rendre(), 30_000);
  addEventListener("online", rendre);
  addEventListener("offline", rendre);

  /** Shows the button when the account is usable; stops everything otherwise. */
  function actualiser() {
    const dispo = disponible();
    bouton.hidden = !dispo;
    if (!dispo) {
      coffre.session.verrouiller(); // signing out locks the vault
      arreterEcoute();
      if (ouvert) fermer();
      galerie.fermer();
      elements = [];
      compteur = 0;
      octets = 0;
      return;
    }
    if (!arret.length && !document.hidden) demarrerEcoute();
    coffre.actualiser();
  }

  return {
    coffre,
    /** Default duration of a new item (settings). */
    dureeDefaut: () => dureeId,
    definirDuree: choisirDuree,
    bouton,
    panneau,
    ouvrir,
    fermer,
    /** True when the sharing space can be used (signed in, synchronised, enabled). */
    disponible,
    actualiser,
    estOuvert: () => ouvert,
    /** Tests: elements shown. */
    elements: () => elements,
  };
}

/** Copies a text: the clipboard API, or a hidden field where it is missing (older Safari). */
async function copierTexte(texte) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(texte);
  const t = el("textarea", {
    value: texte,
    style: "position:fixed;left:-1000px;top:-1000px",
    "aria-hidden": "true",
  });
  document.body.append(t);
  t.select();
  const ok = document.execCommand?.("copy");
  t.remove();
  if (!ok) throw new Error("copie impossible");
}
