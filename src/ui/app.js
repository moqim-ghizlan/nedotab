import { A, reduire } from "../core/actions.js";
import { listerDossiers } from "../core/arbre.js";
import { NOM_APP } from "../core/constantes.js";
import { migrer } from "../core/migration.js";
import { creerDossier } from "../core/modele.js";
import { expliquer, messageIgnorees } from "../core/rejeu.js";
import { fondEffectif, fondsAPurger } from "../core/reglages.js";
import { chargerFirebase } from "../firebase/charger.js";
import { creerStore } from "../core/store.js";
import { plateforme } from "../platform/index.js";
import { demander, demanderNomDossier } from "./dialogues/commun.js";
import { ouvrirAjoutSite } from "./dialogues/dialogueSite.js";
import { el } from "./dom.js";
import { ouvrirFenetreDossier } from "./fenetreDossier.js";
import { ouvrirMenu } from "./menuContextuel.js";
import { appliquerReglages, configurerFondsCompte } from "./apparence.js";
import { creerRecherche } from "./recherche.js";
import { ouvrirReglages } from "./reglages.js";
import { creerAvatar } from "./avatar.js";
import { creerCompte } from "./services/compte.js";
import { creerSynchro } from "./services/synchro.js";
import { creerSauvegardes } from "./services/sauvegardes.js";
import { creerRestauration } from "./services/restauration.js";
import { creerDonnees } from "./services/donnees.js";
import { creerIndicateurSynchro } from "./indicateurSynchro.js";
import { demanderChoixPremiereSynchro } from "./dialogues/premiereSynchro.js";
import { brancherPersistance } from "./persistance.js";
import { activerJournal } from "./journal.js";
import { toast } from "./toast.js";
import { ouvrirSitesDansNouvelOnglet } from "./tuile.js";
import { creerVueGrille } from "./vueGrille.js";

/** V2.9: operations that could not be applied after a change made on another device. */
function signalerIgnorees(ignorees) {
  toast(messageIgnorees(ignorees.length), {
    cle: "ignorees",
    duree: 10000,
    action: {
      libelle: "Détails",
      onClic: () =>
        demander({
          titre: "Modifications non appliquées",
          contenu: [
            el(
              "ul",
              { class: "liste-ignorees" },
              ignorees.map((i) => el("li", { texte: expliquer(i) })),
            ),
          ],
          boutons: [{ libelle: "Fermer", valeur: true, principal: true }],
        }),
    },
  });
}

/** Actions after which a folder that became empty is reported (not remote loads or undo). */
const ACTIONS_LOCALES = new Set([A.ELEMENT_SUPPRIMER, A.ELEMENT_DEPLACER]);

export async function demarrerApp(racine) {
  const stockage = plateforme.stockage();
  let brut = null;
  let versionConnue = null;
  let chargementRate = false;
  try {
    const lu = await stockage.lire();
    brut = lu.etat;
    versionConnue = lu.meta?.majLe ?? null;
  } catch (e) {
    console.error("Lecture du stockage impossible", e);
    chargementRate = true;
  }
  const { etat, lectureSeule: versionFuture } = migrer(brut);
  // Never overwrite the storage with an empty state when the load failed.
  const lectureSeule = versionFuture || chargementRate;
  const store = creerStore(etat, reduire);

  const grilleEl = el("ul", { class: "grille", "aria-label": "Mes sites" });
  const vide = el(
    "section",
    { class: "vide", hidden: true },
    el("p", { class: "vide-texte", texte: "Ajoutez votre premier site" }),
    el("button", {
      type: "button",
      class: "vide-bouton",
      "aria-label": "Ajouter un site",
      dataset: { action: "ajouter" },
      texte: "+",
    }),
  );
  const bandeau = lectureSeule
    ? el("p", {
        class: "bandeau",
        role: "alert",
        texte: versionFuture
          ? "Données créées par une version plus récente : mettez à jour l'extension. Lecture seule."
          : "Vos données n'ont pas pu être lues. Lecture seule pour ne rien perdre.",
      })
    : null;
  const page = el("main", { class: "page" }, bandeau, vide, grilleEl);
  const pied = el("footer", { class: "pied", texte: `${NOM_APP} ${plateforme.getVersion()}` });
  const annonces = el("div", {
    id: "annonces",
    class: "visuellement-cache",
    "aria-live": "polite",
  });
  // One settings button: the gear alone, or the account avatar with the gear as a small badge.
  const boutonCompte = el("span", { class: "bouton-compte", hidden: true });
  const boutonReglages = el(
    "button",
    {
      type: "button",
      class: "bouton-reglages",
      "aria-label": "Réglages",
      title: "Réglages",
      onclick: () => ouvrirReglages(store, { retourFocus: boutonReglages, session }),
    },
    boutonCompte,
    el("span", { class: "reglages-symbole", "aria-hidden": "true", texte: "⚙" }),
  );
  // Account: Firebase is only loaded when a user signed in before (indicator) or signs in.
  const compte = creerCompte();
  compte.abonner((e) => {
    const connecte = e.statut === "connecte" && e.profil;
    boutonCompte.hidden = !connecte;
    boutonReglages.classList.toggle("avec-compte", !!connecte);
    const libelle = connecte ? `Réglages — compte : ${e.profil.nom || e.profil.email}` : "Réglages";
    boutonReglages.setAttribute("aria-label", libelle);
    boutonReglages.title = libelle;
    if (connecte) boutonCompte.replaceChildren(creerAvatar(e.profil, { taille: 32 }));
  });
  const synchro = creerSynchro({
    store,
    compte,
    demanderChoix: demanderChoixPremiereSynchro,
    informer: (message) => toast(message, { duree: 6000 }),
    signalerIgnorees,
    lireMajLocale: async () => (await stockage.lire().catch(() => null))?.meta?.majLe ?? null,
  });
  synchro.abonner((e) => boutonCompte.classList.toggle("en-synchro", e.enCours));
  synchro.abonner((e) => {
    if (e.erreur && !e.enCours) {
      toast(e.erreur, {
        type: "erreur",
        cle: "synchro",
        duree: 8000,
        action: { libelle: "Réessayer", onClic: () => synchro.lancerPremiereSynchro() },
      });
    }
  });
  /** Actions of the account section: sign-in chains the first synchronisation. */
  const session = {
    compte,
    synchro,
    async connecter() {
      if (await compte.connecter()) await synchro.lancerPremiereSynchro();
    },
    synchroniser: () => synchro.lancerPremiereSynchro(),
    async deconnecter() {
      if (synchro.modificationsNonEnvoyees() > 0) {
        const quand = await demander({
          titre: "Se déconnecter",
          message: "Des modifications n'ont pas encore été envoyées. Se déconnecter quand même ?",
          boutons: [
            { libelle: "Annuler", valeur: false },
            { libelle: "Se déconnecter quand même", valeur: true, danger: true },
          ],
        });
        if (!quand) return;
      }
      const garder = await demander({
        titre: "Se déconnecter",
        message: "Garder une copie de vos sites sur cet ordinateur ?",
        boutons: [
          { libelle: "Annuler", valeur: null },
          { libelle: "Non, vider cet ordinateur", valeur: "non" },
          { libelle: "Oui, garder une copie", valeur: "oui", principal: true },
        ],
      });
      if (!garder) return;
      await synchro.quitter({ garderCopie: garder === "oui" });
      await compte.deconnecter();
      // Without a copy, Firestore's cache was erased and Firestore stopped: start afresh,
      // once the emptied grid is really saved (the debounced save would be lost on reload).
      if (garder === "non") {
        await stockage.sauvegarder(store.lire());
        location.reload();
      }
    },
    /**
     * V2.10: deletes the account and all its data (Cloud Function). Explanation, export
     * offered first, "SUPPRIMER" typed, recent Google sign-in, then the server deletes
     * everything; this device goes back to local mode. On failure nothing changes here.
     */
    async supprimerCompte() {
      const champ = el("input", {
        id: "confirmer-suppression",
        type: "text",
        autocomplete: "off",
        spellcheck: "false",
      });
      const garder = el("input", { type: "checkbox", id: "garder-apres-suppression" });
      const promesse = demander({
        titre: "Supprimer mon compte",
        message:
          "Vos sites, dossiers, réglages, sauvegardes et fonds d'écran enregistrés sur votre compte seront supprimés définitivement, ainsi que le compte lui-même. Cette action ne peut pas être annulée.",
        contenu: [
          el("button", {
            type: "button",
            class: "bouton",
            texte: "Exporter mes données d'abord",
            onclick: () => session.donnees.exporter(),
          }),
          el(
            "label",
            { class: "reglages-case", for: "garder-apres-suppression" },
            garder,
            el("span", { texte: "Garder une copie de mes sites sur cet ordinateur" }),
          ),
          el(
            "div",
            { class: "champ" },
            el("label", {
              for: "confirmer-suppression",
              texte: "Pour confirmer, tapez SUPPRIMER",
            }),
            champ,
          ),
        ],
        boutons: [
          { libelle: "Annuler", valeur: false },
          { libelle: "Supprimer définitivement", valeur: true, principal: true, danger: true },
        ],
      });
      const confirmer = champ.closest("form").querySelector(".bouton--danger");
      confirmer.disabled = true;
      champ.addEventListener("input", () => {
        confirmer.disabled = champ.value.trim() !== "SUPPRIMER";
      });
      if (!(await promesse) || champ.value.trim() !== "SUPPRIMER") return false;

      // A recent sign-in is required by the server.
      if (!(await compte.reconnecter())) {
        toast("Reconnectez-vous pour confirmer : rien n'a été supprimé.", {
          type: "erreur",
          duree: 7000,
        });
        return false;
      }
      synchro.suspendre();
      try {
        await (await chargerFirebase()).supprimerMonCompte();
      } catch (e) {
        synchro.reprendre();
        toast(
          e?.code === "functions/failed-precondition"
            ? "Reconnectez-vous pour confirmer : rien n'a été supprimé."
            : "Suppression impossible pour l'instant : rien n'a été supprimé. Réessayez plus tard.",
          { type: "erreur", duree: 9000 },
        );
        return false;
      }
      // Deleted on the server: forget everything tied to the account on this device.
      await synchro.quitter({ garderCopie: garder.checked, envoyer: false });
      await compte.oublier();
      await plateforme.copies.effacerTout().catch(() => {});
      await (await chargerFirebase()).effacerCache?.().catch(() => {});
      await stockage.sauvegarder(store.lire());
      try {
        localStorage.setItem(
          "nedotab:annonce",
          "Votre compte et toutes ses données ont été supprimés.",
        );
      } catch {
        /* the message is only a courtesy */
      }
      location.reload();
      return true;
    },
    async restaurerCopie() {
      const ok = await demander({
        titre: "Restaurer la copie de cet ordinateur",
        message:
          "Vos sites seront remplacés par la dernière copie faite avant une synchronisation.",
        boutons: [
          { libelle: "Annuler", valeur: false },
          { libelle: "Restaurer", valeur: true, principal: true },
        ],
      });
      if (!ok) return;
      toast(
        (await synchro.restaurerCopie()) ? "Copie restaurée" : "Aucune copie sur cet ordinateur",
      );
    },
  };
  session.sauvegardes = creerSauvegardes({ store, session });
  session.restauration = creerRestauration({ store, session });
  session.donnees = creerDonnees({ store, session });
  // Automatic backup: once the account is synced (first server snapshot), at most daily.
  let sauvegardeVerifiee = false;
  synchro.abonner((e) => {
    if (e.mode !== "compte" || e.statut !== "synchronise" || sauvegardeVerifiee) return;
    sauvegardeVerifiee = true;
    session.sauvegardes.verifierAuto().catch(() => (sauvegardeVerifiee = false));
  });
  compte.demarrer().then(() => synchro.demarrer());
  // Test builds against the emulators only: inspection hook for the browser scenarios.
  if (import.meta.env.VITE_UTILISER_EMULATEURS === "true")
    globalThis.__nedotab = { store, synchro, compte, session, firebase: chargerFirebase };
  const groupeCompte = el(
    "span",
    { class: "compte-avatar" },
    boutonReglages,
    creerIndicateurSynchro(synchro),
  );
  const barre = el("div", { class: "barre-haut" }, groupeCompte);
  racine.replaceChildren(barre, page, pied, annonces);
  const annoncer = (texte) => {
    annonces.textContent = "";
    requestAnimationFrame(() => (annonces.textContent = texte));
  };

  const ouvrirDossier = (id, tuile) =>
    ouvrirFenetreDossier(store, id, {
      retourFocus: tuile,
      lectureSeule: () => lectureSeule,
      annoncer,
    });

  // Search bar above the grid; a folder found opens directly at its level.
  const recherche = creerRecherche(store, { ouvrirDossier: (id) => ouvrirDossier(id) });
  page.insertBefore(recherche.racine, vide);

  const nouveauDossier = async (retourFocus) => {
    const titre = await demanderNomDossier({ retourFocus });
    if (titre == null) return;
    const dossier = creerDossier({ titre: titre.trim() || "Dossier" });
    store.envoyer({ type: A.DOSSIER_CREER, dossier, parentId: null });
    accueil.focaliser(dossier.id);
  };

  /** The home "+" offers a site or a folder. */
  const menuAjout = (bouton) => {
    const rect = bouton.getBoundingClientRect();
    ouvrirMenu({
      x: rect.left,
      y: rect.bottom + 4,
      retourFocus: bouton,
      libelle: "Ajouter",
      entrees: [
        {
          libelle: "Ajouter un site",
          onChoix: () =>
            ouvrirAjoutSite(store, { apresAjout: (site) => accueil.focaliser(site.id) }),
        },
        { libelle: "Nouveau dossier", onChoix: () => nouveauDossier(bouton) },
      ],
    });
  };

  const accueil = creerVueGrille({
    store,
    conteneur: grilleEl,
    lectureSeule: () => lectureSeule,
    annoncer,
    ouvrirDossier,
    apresFusion: (id) =>
      ouvrirFenetreDossier(store, id, {
        lectureSeule: () => lectureSeule,
        annoncer,
        editerTitre: true,
      }),
    ajouter: menuAjout,
    libelleAjout: "Ajouter un site ou un dossier",
  });
  vide
    .querySelector("button")
    .addEventListener("click", (e) => !lectureSeule && menuAjout(e.currentTarget));

  const rendre = () => {
    const estVide = store.lire().grille.length === 0;
    vide.hidden = !estVide;
    grilleEl.hidden = estVide;
    accueil.demanderRendu();
  };
  rendre();
  performance.mark("nedotab:grille");
  performance.measure("nedotab:premier-rendu", "nedotab:debut", "nedotab:grille");

  // Theme and background follow the settings (also when another tab changes them).
  let fondsCompteConfigures = false;
  /** Cached pictures that left the library (deleted here or on another device). */
  const purgerCacheFonds = async () => {
    const enCache = await plateforme.fichiers.listerCacheFonds().catch(() => []);
    for (const id of fondsAPurger(enCache, store.lire().reglages)) {
      plateforme.fichiers.supprimerCacheFond(id).catch(() => {});
    }
  };
  // The background shown is the device's local picture if any, else the synced one.
  const visibles = (e) => ({ ...e.reglages, fond: fondEffectif(e) });
  /** Device-only settings (V2.9): forced columns of the home grid, debug log. */
  const appliquerAppareil = (r = {}) => {
    const racineDoc = document.documentElement;
    if (r.colonnes) {
      racineDoc.dataset.colonnes = String(r.colonnes);
      racineDoc.style.setProperty("--colonnes", String(r.colonnes));
    } else {
      delete racineDoc.dataset.colonnes;
      racineDoc.style.removeProperty("--colonnes");
    }
    activerJournal(r.debug);
  };
  let appliques = store.lire();
  appliquerReglages(visibles(appliques));
  appliquerAppareil(appliques.reglagesAppareil);
  ouvrirSitesDansNouvelOnglet(appliques.reglages.nouvelOnglet);
  store.abonner((e) => {
    if (e.reglages !== appliques.reglages || e.reglagesAppareil !== appliques.reglagesAppareil) {
      appliques = e;
      appliquerReglages(visibles(e));
      appliquerAppareil(e.reglagesAppareil);
      ouvrirSitesDansNouvelOnglet(e.reglages.nouvelOnglet);
      purgerCacheFonds();
    }
  });

  // Account mode: library pictures are downloaded from Storage (once, then cached).
  synchro.abonner((e) => {
    if (e.mode !== "compte" || fondsCompteConfigures) return;
    fondsCompteConfigures = true;
    configurerFondsCompte(async (chemin) => (await chargerFirebase()).telechargerFond(chemin));
    appliquerReglages(visibles(store.lire()));
  });

  // A folder emptied by a local action: offer to delete it (never automatically).
  let precedent = store.lire().grille;
  store.abonner((etatCourant, action) => {
    rendre();
    const avant = precedent;
    precedent = etatCourant.grille;
    if (!ACTIONS_LOCALES.has(action.type)) return;
    const pleins = new Set(
      listerDossiers(avant)
        .filter((d) => d.dossier.items.length)
        .map((d) => d.dossier.id),
    );
    const vides = listerDossiers(etatCourant.grille).filter(
      (d) => d.dossier.items.length === 0 && pleins.has(d.dossier.id),
    );
    for (const { dossier } of vides) {
      toast(`Le dossier « ${dossier.titre} » est vide`, {
        cle: "dossierVide",
        duree: 8000,
        action: {
          libelle: "Supprimer le dossier",
          onClic: () =>
            store.envoyer({ type: A.DOSSIER_SUPPRIMER, id: dossier.id, mode: "avecContenu" }),
        },
      });
    }
  });

  brancherPersistance(store, stockage, {
    reduire,
    versionConnue,
    lectureSeule: () => lectureSeule,
    onErreur: (e) => {
      console.error(e);
      toast("Enregistrement impossible (espace plein ?). Vos changements restent affichés.", {
        type: "erreur",
        duree: 8000,
      });
    },
  });
  // Message left before a reload (account deleted, V2.10).
  try {
    const annonce = localStorage.getItem("nedotab:annonce");
    if (annonce) {
      localStorage.removeItem("nedotab:annonce");
      toast(annonce, { duree: 8000 });
    }
  } catch {
    /* storage unavailable: nothing to show */
  }
  return store;
}
