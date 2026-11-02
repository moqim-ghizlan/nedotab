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
import { creerFichiers } from "./espacePartageFichiers.js";
import { toast } from "./toast.js";
import { creerCoffreUI } from "./coffre/coffre.js";
import { demander } from "./dialogues/commun.js";
import { creerLienPourElement, ouvrirMesLiens } from "./liensPartage.js";
import {
  DUREES,
  DUREE_DEFAUT,
  MIGRATION_JOURS,
  calculerExpiration,
  dureeParId,
  dureesProlongeables,
  ecartDepuisConfirmation,
  estExpire,
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
 * @param {() => Promise<object>} d.charger loads the Firebase module
 * @param {() => string|null} d.uid
 * @param {(texte: string) => Promise<void>} [d.copier]
 */
export function creerEspacePartage({
  store,
  disponible,
  charger,
  uid,
  copier = copierTexte,
  coffre = creerCoffreUI({ charger, uid }),
}) {
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
  // V4.26: decrypted content of the vault items, in memory only, emptied when the vault locks.
  const dechiffres = new Map(); // id → { contenu, titre } | { corrompu: true }
  const enCours = new Set();

  // V4.27: every item expires. `ecart` = server clock − device clock, learnt when an item we
  // sent is confirmed; the display and the new expiries use the corrected time.
  let dureeId = lireDuree();
  let ecart = 0;
  const enAttenteVus = new Set();
  const expiration = () => calculerExpiration(dureeId, ecart);

  const fichiers = creerFichiers({
    expiration,
    charger,
    uid,
    store,
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
  const messageAjout = el("p", {
    class: "partage-message",
    role: "status",
    "aria-live": "polite",
    hidden: true,
  });
  const envoyer = el("button", {
    type: "button",
    class: "bouton bouton--principal",
    texte: "Envoyer",
    onclick: () => envoyerContenu(),
  });
  const coller = el("button", {
    type: "button",
    class: "bouton",
    texte: "Coller",
    onclick: () => collerPressePapiers(),
  });
  const proposerLien = el("button", {
    type: "button",
    class: "lien-discret",
    hidden: true,
    texte: "Enregistrer comme lien",
    onclick: () => envoyerContenu("lien"),
  });
  const bandeau = el("p", { class: "partage-bandeau", role: "status", hidden: true });
  const selecteurDuree = el(
    "div",
    { class: "partage-durees", role: "radiogroup", "aria-label": "Durée avant suppression" },
    DUREES.map((d) =>
      el("button", {
        type: "button",
        role: "radio",
        class: "partage-duree",
        dataset: { duree: d.id },
        texte: d.libelle,
        onclick: () => choisirDuree(d.id),
      }),
    ),
  );
  const migration = el("div", { class: "partage-migration", role: "status", hidden: true });
  const liste = el("ul", { class: "partage-liste", "aria-live": "polite" });
  const plus = el("button", {
    type: "button",
    class: "bouton partage-plus",
    hidden: true,
    texte: "Voir plus",
    onclick: () => voirPlus(),
  });
  const fermerBouton = el("button", {
    type: "button",
    class: "partage-fermer",
    "aria-label": "Fermer",
    texte: "×",
    onclick: () => fermer(),
  });
  const panneau = el(
    "aside",
    {
      class: "partage",
      role: "dialog",
      "aria-label": "Espace de partage",
      "aria-modal": "false",
      hidden: true,
    },
    el("div", { class: "partage-poignee", "aria-hidden": "true" }),
    el(
      "header",
      { class: "partage-entete" },
      el("h2", { texte: "Espace de partage" }),
      // V4.28: the active share links (create / revoke).
      el("button", {
        type: "button",
        class: "lien-discret",
        texte: "Mes liens",
        onclick: () => ouvrirMesLiens({ charger }),
      }),
      fermerBouton,
    ),
    bandeau,
    coffre.bandeau,
    migration,
    fichiers.quota,
    fichiers.cadreDepot,
    el(
      "div",
      { class: "partage-ajout" },
      champ,
      el(
        "div",
        { class: "partage-ajout-actions" },
        compteurCaracteres,
        fichiers.boutonAjout,
        coller,
        envoyer,
      ),
      coffre.caseChiffrer,
      selecteurDuree,
      fichiers.entree,
      fichiers.message,
      proposerLien,
      messageAjout,
    ),
    liste,
    plus,
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
    for (const b of selecteurDuree.children)
      b.setAttribute("aria-checked", String(b.dataset.duree === dureeId));
  }
  majSelecteur();

  async function choisirProlongation(e) {
    const options = dureesProlongeables(e, ecart);
    if (!options.length) return toast("Durée maximale atteinte");
    const choix = await demander({
      titre: "Prolonger",
      message: "Nouvelle durée à partir de maintenant (30 jours au total depuis l'envoi).",
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
      clair?.contenu !== undefined ? { ...brut, contenu: clair.contenu, titre: clair.titre } : brut;
    const url = brut.chiffre && !clair ? null : lienDe(e);
    const texte = el("div", { class: "partage-texte" });
    if (brut.chiffre && (verrouille || clair?.corrompu)) {
      texte.append(
        el("span", {
          class: "partage-apercu partage-chiffre",
          texte: clair?.corrompu
            ? "🔒 Élément corrompu"
            : coffre.session.estDeverrouille()
              ? "🔒 Déchiffrement…"
              : "🔒 Contenu chiffré",
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
        el("span", { class: "partage-detail", texte: apercu(url, 120) }),
      );
    } else {
      texte.append(el("span", { class: "partage-apercu", texte: apercu(e.contenu) }));
    }
    const copie = el("button", {
      type: "button",
      class: "partage-action",
      hidden: brut.chiffre && (verrouille || clair?.corrompu),
      texte: "Copier",
      "aria-label": "Copier",
      onclick: async (ev) => {
        const b = ev.currentTarget;
        try {
          await copier(e.contenu);
          // Best effort (no guarantee, said in the help): the clipboard is emptied after 30 s.
          if (brut.chiffre) setTimeout(() => copier("").catch(() => {}), 30_000);
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
      url
        ? el("a", {
            class: "partage-action",
            href: url,
            target: "_blank",
            rel: "noopener noreferrer",
            texte: "Ouvrir",
          })
        : null,
      el("button", {
        type: "button",
        class: "partage-action",
        "aria-pressed": String(e.epingle),
        texte: e.epingle ? "Désépingler" : "Épingler",
        onclick: () =>
          action(() => charger().then((fb) => fb.epinglerPartage(uid(), e.id, !e.epingle))),
      }),
      // V4.28: a public link to a COPY of this text or link (the clear content, decrypted if it
      // came from the vault; the copy is re-encrypted with the key of the link).
      e.type !== "fichier" && !(brut.chiffre && (verrouille || clair?.corrompu))
        ? el("button", {
            type: "button",
            class: "partage-action",
            texte: "Créer un lien",
            onclick: () =>
              creerLienPourElement({
                charger,
                copier,
                element: { type: e.type, contenu: e.contenu },
                dureeId,
              }),
          })
        : null,
      e.type === "fichier"
        ? null
        : el("button", {
            type: "button",
            class: "partage-action",
            texte: "Prolonger",
            onclick: () => choisirProlongation(e),
          }),
      el("button", {
        type: "button",
        class: "partage-action partage-action--danger",
        texte: "Supprimer",
        onclick: () => supprimerAvecAnnulation(e),
      }),
    );

    return el(
      "li",
      {
        class: `partage-carte${e.enAttente ? " partage-carte--attente" : ""}${e.epingle ? " partage-carte--epingle" : ""}`,
        dataset: { id: e.id, type: e.type },
      },
      el("span", {
        class: "partage-type",
        "aria-hidden": "true",
        texte: brut.chiffre ? (verrouille ? "🔒" : "🔓") : e.type === "lien" ? "🔗" : "📝",
      }),
      texte,
      libelleExpiration(e, ecart).texte
        ? el("span", {
            class: `partage-expire${libelleExpiration(e, ecart).urgent ? " partage-expire--urgent" : ""}`,
            texte: libelleExpiration(e, ecart).texte,
          })
        : null,
      el("span", {
        class: "partage-meta",
        texte: `${e.enAttente ? "Envoi… · " : ""}${ilYA(e.creeLe)} · depuis ${libelleAppareil(e.appareil)}`,
      }),
      actions,
    );
  }

  function rendre() {
    // An expired item disappears at once (the server deletes it a little later).
    const visibles = elements.filter((e) => !estExpire(e, ecart));
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
          el("span", { class: "partage-vide-icone", "aria-hidden": "true", texte: "⇄" }),
          el("p", { texte: "Envoyez un texte ou un lien d'un appareil à l'autre." }),
          el("p", { class: "partage-aucun", texte: "Aucun élément" }),
        ),
      );
    } else {
      liste.append(
        ...fichiers.cartesEnvoi(),
        ...trier(visibles).map((e) => (e.type === "fichier" ? fichiers.carte(e) : carte(e))),
      );
    }
    dechiffrerVisibles();
    fichiers.elementsVus(elements);
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
      (e) => e.chiffre && e.type !== "fichier" && !dechiffres.has(e.id) && !enCours.has(e.id),
    );
    if (!aFaire.length) return;
    aFaire.forEach((e) => enCours.add(e.id));
    for (const e of aFaire) {
      try {
        dechiffres.set(e.id, await coffre.dechiffrer(e));
      } catch {
        dechiffres.set(e.id, { corrompu: true });
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
    const r = creerElement({ contenu: brut, type });
    if (!r.ok) return montrerErreur(r.erreur);
    const chiffre = coffre.veutChiffrer();
    // V4.26: the vault must be open (created or unlocked) BEFORE anything is sent.
    if (chiffre && !(await coffre.assurerDeverrouille())) return;
    envoiEnCours = true;
    rendre();
    try {
      const fb = await charger();
      // Same content already there: it goes back to the top (not for the vault: contents are unreadable).
      const doublon = chiffre
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
                          epingle: e.epingle,
                          appareil: e.appareil,
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
      const cibles = [...panneau.querySelectorAll("button, a[href], textarea")].filter(
        (n) => !n.disabled && !n.closest("[hidden]"),
      );
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
      !e.target.closest?.(".toast, .menu, dialog")
    )
      fermer();
  };

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
