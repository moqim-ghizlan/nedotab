import { A, reduire } from "../core/actions.js";
import { listerDossiers, trouver as trouverElement } from "../core/arbre.js";
import { NOM_APP, URL_SITE } from "../core/constantes.js";
import { migrer } from "../core/migration.js";
import { creerDossier } from "../core/modele.js";
import { expliquer, messageIgnorees } from "../core/rejeu.js";
import {
  affichageAccueilDe,
  COTE_TELEPHONE,
  fondEffectif,
  fondsAPurger,
  styleDossierDe,
  ombreIconesDe,
  espacementDe,
  formeIconesDe,
} from "../core/reglages.js";
import { petitCote, suivreClavier } from "./ecran.js";
import { chargerFirebase } from "../firebase/charger.js";
import { creerStore } from "../core/store.js";
import { plateforme } from "../platform/index.js";
import { iaDe } from "../core/ia.js";
import { creerEnrichissement, installerEnrichissement } from "./services/enrichissement.js";
import { creerRattrapage } from "./services/rattrapage.js";
import { creerServiceIa } from "./services/ia.js";
import { demander, demanderNomDossier } from "./dialogues/commun.js";
import { ouvrirAjoutSite, ouvrirEditionSite } from "./dialogues/dialogueSite.js";
import { el } from "./dom.js";
import { ouvrirFenetreDossier } from "./fenetreDossier.js";
import { ouvrirMenu } from "./menuContextuel.js";
import { appliquerReglages, configurerFondsCompte } from "./apparence.js";
import { creerHorloge } from "./horloge.js";
import { creerRecherche } from "./recherche.js";
import { permis } from "../core/confidentialiteIa.js";
import { exemplesQuestions } from "../core/exemplesQuestions.js";
import { creerGestionPropositions } from "./chat/carteProposition.js";
import { creerChat } from "./chat/panneau.js";
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
import { monterBadgeDebug, modeDebug } from "./debug.js";
import { activerJournal, capturerErreurs } from "./journal.js";
import { toast } from "./toast.js";
import { methodesDeConnexion } from "../core/authEmail.js";
import { demanderMotsDePasse } from "./connexion.js";
import {
  definirSurVisite,
  ouvrirSitesAvec,
  ouvrirSitesDansNouvelOnglet,
  suivreOuverturesTuiles,
} from "./tuile.js";
import { creerServiceVisites } from "./services/visites.js";
import { creerServiceUsage } from "./services/usage.js";
import { creerFrequents } from "./frequents.js";
import { creerEspacePartage } from "./espacePartage.js";
import { brancherRaccourcisGlobaux } from "./aideRaccourcis.js";
import { creerBoutonEdition } from "./modeEdition.js";
import { creerVueGrille } from "./vueGrille.js";
import { creerAccueilPagine } from "./pages/accueilPagine.js";
import { monterBandeauInstallation } from "./bandeauInstallation.js";
import { comptesDe, grilleAccueil, grilleTelephone } from "../core/pages.js";

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

  // Home grid: pages (V2.11, default) or one scrolling grid, rebuilt when the setting changes.
  const zoneAccueil = el("div", { class: "accueil" });
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
    ? el(
        "p",
        { class: "bandeau", role: "alert" },
        el("span", {
          texte: versionFuture
            ? "Une nouvelle version est nécessaire : vos données ont été créées par une version plus récente. Lecture seule. "
            : "Vos données n'ont pas pu être lues. Lecture seule pour ne rien perdre.",
        }),
        versionFuture
          ? el("a", {
              href: `${URL_SITE}mise-a-jour.html`,
              target: "_blank",
              rel: "noopener",
              texte: "Comment mettre à jour",
            })
          : null,
      )
    : null;
  const page = el("main", { class: "page" }, bandeau, vide, zoneAccueil);
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
      // Web app (V3.2): the page leaves for Google; the way back is handled at startup.
      if (await compte.connecter()) await synchro.lancerPremiereSynchro();
    },
    synchroniser: () => synchro.lancerPremiereSynchro(),
    /** V4.23: e-mail + password (sign-up or sign-in); the sync starts once the address is verified. */
    async connecterEmail(email, mdp, { creer = false } = {}) {
      const r = creer ? await compte.inscrire(email, mdp) : await compte.connecterEmail(email, mdp);
      if (r.ok && r.verifie) await synchro.lancerPremiereSynchro();
      return r;
    },
    /** "J'ai vérifié" of the screen "Vérifiez votre boîte mail". */
    async verifierEmail() {
      if (!(await compte.actualiserVerification())) return false;
      await synchro.lancerPremiereSynchro();
      return true;
    },
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
        message: "Garder une copie de vos sites sur cet appareil ?",
        boutons: [
          { libelle: "Annuler", valeur: null },
          { libelle: "Non, vider cet appareil", valeur: "non" },
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
            el("span", { texte: "Garder une copie de mes sites sur cet appareil" }),
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

      // A recent sign-in is required by the server: the password for an e-mail account
      // (V4.23, the password is asked, used once and forgotten), Google otherwise.
      let reconnecte;
      if (methodesDeConnexion(compte.lire().profil?.fournisseurs).motDePasse) {
        const v = await demanderMotsDePasse({
          titre: "Confirmez votre identité",
          message: "Saisissez votre mot de passe pour supprimer le compte.",
          champs: [
            { id: "mdp-suppression", libelle: "Mot de passe", autocomplete: "current-password" },
          ],
        });
        const r = v ? await compte.reconnecterMotDePasse(v[0]) : { ok: false };
        if (r.erreur) toast(r.erreur, { type: "erreur", duree: 7000 });
        reconnecte = r.ok;
      } else reconnecte = await compte.reconnecter();
      if (!reconnecte) {
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
        titre: "Restaurer la copie de cet appareil",
        message:
          "Vos sites seront remplacés par la dernière copie faite avant une synchronisation.",
        boutons: [
          { libelle: "Annuler", valeur: false },
          { libelle: "Restaurer", valeur: true, principal: true },
        ],
      });
      if (!ok) return;
      toast((await synchro.restaurerCopie()) ? "Copie restaurée" : "Aucune copie sur cet appareil");
    },
  };
  session.sauvegardes = creerSauvegardes({ store, session });
  session.restauration = creerRestauration({ store, session });
  session.donnees = creerDonnees({ store, session });
  // V4.4: tags and description proposed by the AI after an adding (extension only).
  // AI state read by the tag generation (V4.4) and by the search bar's question mode (V4.8).
  let clesIa = null;
  async function contexteIa() {
    const modeCompte = synchro.lire().mode === "compte";
    const ia = iaDe(store.lire().reglages);
    if (modeCompte && ia.actif && navigator.onLine && !clesIa?.length) {
      const r = await creerServiceIa().etatCles();
      if (r.ok) clesIa = r.valeur;
    }
    return { ia, modeCompte, enLigne: navigator.onLine, cles: clesIa ?? [] };
  }
  {
    const moteur = creerEnrichissement({
      store,
      plateforme,
      appeler: async (nom, donnees) => (await chargerFirebase()).appelerIa(nom, donnees),
      contexte: contexteIa,
    });
    installerEnrichissement(moteur);
    // V4.6: catch-up of the existing sites, only on request (Settings → AI).
    session.rattrapage = creerRattrapage({
      store,
      enrichissement: moteur,
      quotaRestant: async () =>
        (await (await chargerFirebase()).appelerIa("iaQuotaRestant", {})).restant,
      preferences: plateforme.preferences,
      idAppareil: plateforme.idAppareil,
    });
    session.rattrapage.retrouver().catch(() => {});
  }
  // Automatic backup: once the account is synced (first server snapshot), at most daily.
  let sauvegardeVerifiee = false;
  synchro.abonner((e) => {
    if (e.mode !== "compte" || e.statut !== "synchronise" || sauvegardeVerifiee) return;
    sauvegardeVerifiee = true;
    session.sauvegardes.verifierAuto().catch(() => (sauvegardeVerifiee = false));
  });
  // V3.3: without IndexedDB (some private windows of Safari) the account works, not offline.
  let cacheVerifie = false;
  synchro.abonner((e) => {
    if (e.mode !== "compte" || cacheVerifie) return;
    cacheVerifie = true;
    chargerFirebase()
      .then((fb) => fb.cacheHorsLigneDisponible())
      .then((ok) => {
        if (!ok)
          toast("Ce navigateur ne garde pas vos sites hors ligne (navigation privée ?).", {
            duree: 7000,
          });
      })
      .catch(() => {});
  });
  compte.demarrer().then(async (retour) => {
    // Back from Google in the web app (V3.2): same as a sign-in from the account section.
    if (retour === "connexion") return synchro.lancerPremiereSynchro();
    if (retour === "confirmation")
      toast("Identité confirmée : relancez « Supprimer mon compte » dans les 4 minutes.", {
        duree: 9000,
      });
    return synchro.demarrer();
  });
  // Web app in Safari on iPhone and iPad (V3.1): how to add it to the home screen.
  monterBandeauInstallation();
  // V3.10: unhandled errors are kept in the internal log; "DEBUG" badge while diagnostic is on.
  capturerErreurs();
  monterBadgeDebug(store);
  // V3.9: "?" shows the shortcuts, Cmd/Ctrl + "," the settings.
  brancherRaccourcisGlobaux({
    ouvrirReglages: () => ouvrirReglages(store, { retourFocus: boutonReglages, session }),
  });
  // V3.7: service worker and "new version" banner, in the web app only.
  if (import.meta.env.VITE_TARGET === "pwa") {
    import("./miseAJour.js").then((m) =>
      m.brancherMiseAJour({
        // What is still waiting goes out first: the local save, then the account queue
        // (kept on this device anyway: nothing is lost if the 3 s run out).
        avantRechargement: async () => {
          persistance.vider();
          const fini = (e) => e.mode !== "compte" || e.statut === "synchronise";
          if (fini(synchro.lire())) return;
          await new Promise((ok) => {
            const arret = synchro.abonner((e) => {
              if (!fini(e)) return;
              arret();
              ok();
            });
          });
        },
      }),
    );
  }
  suivreClavier();
  // Test builds against the emulators only: inspection hook for the browser scenarios.
  if (import.meta.env.VITE_UTILISER_EMULATEURS === "true")
    globalThis.__nedotab = { store, synchro, compte, session, firebase: chargerFirebase };
  const groupeCompte = el(
    "span",
    { class: "compte-avatar" },
    boutonReglages,
    creerIndicateurSynchro(synchro),
  );
  const barre = el(
    "div",
    { class: "barre-haut" },
    lectureSeule ? null : creerBoutonEdition(),
    groupeCompte,
  );
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
      versAccueil: (x, y) => accueil?.positionDepot(x, y) ?? null,
    });

  // V4.21: visits of the sites opened from NedoTab, and the usage ranking of the search.
  const suiviActif = () => !store.lire().reglages.sansSuiviUsage;
  const uidConnecte = () =>
    session.synchro.lire().mode === "compte" ? (compte.lire().profil?.uid ?? null) : null;
  const visites = creerServiceVisites({
    prefs: plateforme.preferences,
    actif: suiviActif,
    uid: uidConnecte,
    base: async () => {
      const fb = await chargerFirebase();
      return { envoyer: fb.envoyerVisites, majServeur: fb.majServeur };
    },
  });
  const usage = creerServiceUsage({
    store,
    uid: uidConnecte,
    charger: chargerFirebase,
    visites,
    actif: suiviActif,
  });
  session.visites = visites;
  session.usage = usage;
  /** "Effacer l'historique d'utilisation": the document of the database and the local ones. */
  session.effacerUsage = async () => {
    await visites.vider();
    const u = uidConnecte();
    if (u) await (await chargerFirebase()).effacerVisites(u);
    await usage.actualiser();
  };
  definirSurVisite((id) => visites.enregistrerAvantNavigation(id));
  suivreOuverturesTuiles(document);
  visites.demarrer();
  usage.actualiser();
  // A change of the account (sign-in) or of the tracking setting reloads the ranking.
  let suiviAvant = suiviActif();
  let grilleAvant = store.lire().grille;
  store.abonner(() => {
    if (suiviActif() !== suiviAvant) {
      suiviAvant = suiviActif();
      if (!suiviAvant) visites.vider();
      usage.actualiser();
    } else if (store.lire().grille !== grilleAvant) usage.recalculer();
    grilleAvant = store.lire().grille;
  });
  // First synchronisation: the visits made while signed out join the database.
  let etaitEnCompte = false;
  synchro.abonner((e) => {
    const enCompte = e.mode === "compte";
    if (enCompte && !etaitEnCompte) {
      visites
        .fusionnerLocalesDansBase()
        .catch(() => {})
        .then(() => usage.actualiser());
    }
    etaitEnCompte = enCompte;
  });

  // V4.22: row "Les plus utilisés" under the search bar (stays still while the page is open).
  const frequents = creerFrequents({
    store,
    usage,
    suiviActif,
    lectureSeule,
    afficherDansGrille: (id) => afficherSite(id),
    modifierSite: (id) => {
      const r = trouverElement(store.lire().grille, id);
      if (r?.element.type === "site") ouvrirEditionSite(store, r.element, {});
    },
  });

  // Search bar above the grid; a folder found opens directly at its level.
  const recherche = creerRecherche(store, {
    frequents,
    lireClassementUsage: () => usage.classement(),
    ouvrirDossier: (id) => ouvrirDossier(id),
    contexteIa,
    demanderIa: async (question) =>
      (await chargerFirebase()).appelerIa("iaRechercher", { question }),
    // V4.13: a question of the bar goes to the chat (the chat is created just below).
    poserAuChat: (question, options) => chat.poserQuestion(question, options),
    ouvrirReglagesIa: () =>
      ouvrirReglages(store, { retourFocus: boutonReglages, session, onglet: "ia" }),
  });
  // V4.14: the sites cited by the chat are looked up in the grid as it is now.
  const trouverSite = (id) => {
    const r = trouverElement(store.lire().grille, id);
    if (r?.element.type !== "site") return null;
    const { element: site } = r;
    return { id, site, titre: site.titre, url: site.url, chemin: r.chemin.map((d) => d.titre) };
  };
  const afficherSite = (id) => {
    const r = trouverElement(store.lire().grille, id);
    if (r?.element.type !== "site") return;
    // On a phone the chat covers the grid; on a wide screen it stays beside it.
    if (matchMedia("(max-width: 899px)").matches) chat.fermer({ rendreLeFocus: false });
    if (r.parent) ouvrirDossier(r.parent.id);
    setTimeout(() => {
      const tuile = document.querySelector(`.tuile[data-id="${CSS.escape(id)}"]`);
      if (!tuile) return;
      tuile.scrollIntoView({ block: "center", behavior: "smooth" });
      tuile.classList.add("tuile--reperee");
      setTimeout(() => tuile.classList.remove("tuile--reperee"), 2000);
    }, 150);
  };
  // V4.15: the conversations are stored in the account (Firebase is loaded on first use).
  const uidCompte = () => session.compte.lire().profil?.uid;
  const avecFb = async (f) => {
    const uid = uidCompte();
    if (!uid) throw new Error("non connecté");
    return f(await chargerFirebase(), uid);
  };
  const conversations = {
    creer: (c) => avecFb((fb, uid) => fb.creerConversation(uid, c)),
    ecrireMessage: (convId, m) => avecFb((fb, uid) => fb.ecrireMessageUtilisateur(uid, convId, m)),
    // Live view: the listener is started once Firebase is loaded; it returns its stop function.
    ecouter: (convId, rappel) => {
      let arret = null;
      let arrete = false;
      avecFb((fb, uid) => fb.ecouterMessages(uid, convId, rappel, () => {})).then(
        (stop) => {
          if (arrete) stop();
          else arret = stop;
        },
        () => {},
      );
      return () => {
        arrete = true;
        arret?.();
      };
    },
    chargerAvant: (convId, avantMs) =>
      avecFb((fb, uid) => fb.chargerMessagesAvant(uid, convId, avantMs)),
    supprimerMessage: (convId, msgId) =>
      avecFb((fb, uid) => fb.supprimerMessage(uid, convId, msgId)),
    majStatut: (convId, msgId, statut) =>
      avecFb((fb, uid) => fb.majStatutProposition(uid, convId, msgId, statut)),
    lister: (options) => avecFb((fb, uid) => fb.listerConversations(uid, options)),
    renommer: (id, titre) => avecFb((fb, uid) => fb.renommerConversation(uid, id, titre)),
    supprimer: (id) => avecFb((fb) => fb.supprimerConversation(id)),
  };
  // V4.16: cards of the actions proposed by the assistant (nothing changes without a click).
  const proposer = creerGestionPropositions({
    store,
    majStatut: (m, statut) => chat.majStatutProposition(m, statut),
  });
  // V4.11: the assistant, opened by the robot button (hidden while the AI is unusable).
  const chat = creerChat({
    contexteIa,
    appeler: async (conversation) => {
      const fb = await chargerFirebase();
      return fb.appelerIa("iaChat", fb.donneesChat(conversation));
    },
    // V4.12: streamed answer; iaChat is the fallback when the stream cannot be opened.
    // V4.15: the browser gives only the id of the conversation, the server reads the history.
    flux: async function* (convId, options) {
      const fb = await chargerFirebase();
      yield* fb.fluxAvecRepli(
        { ouvrir: fb.lireFluxChat, complet: (c) => fb.appelerIa("iaChat", fb.donneesChat(c)) },
        convId,
        options,
      );
    },
    conversations,
    ouvrirReglagesIa: () =>
      ouvrirReglages(store, { retourFocus: boutonReglages, session, onglet: "ia" }),
    trouverSite,
    afficherSite,
    proposer,
    historiqueActif: () => permis(iaDe(store.lire().reglages).confidentialite, "historique"),
    // V4.30: questions to start with, made locally from the user's tags (never sent).
    exemples: () => exemplesQuestions(store.lire().grille),
    confirmer: async ({ titre, message, valider }) =>
      (await demander({
        titre,
        message,
        boutons: [
          { libelle: "Annuler", valeur: false },
          { libelle: valider, valeur: true, principal: true },
        ],
      })) === true,
  });
  document.body.append(chat.bouton, chat.panneau);
  // V4.29: the side panel of the toolbar button shows this page with the assistant open.
  if (new URL(location.href).searchParams.get("panneau") === "chat") {
    document.documentElement.dataset.panneau = "chat";
    setTimeout(() => chat.ouvrir(), 0);
  }
  // V4.24: sharing space (texts and links between the devices of the account).
  const partage = creerEspacePartage({
    store,
    disponible: () => uidConnecte() !== null,
    charger: chargerFirebase,
    uid: uidConnecte,
  });
  session.partage = partage;
  document.body.append(partage.bouton, partage.panneau);
  synchro.abonner(() => partage.actualiser());
  compte.abonner(() => partage.actualiser());
  partage.actualiser();
  // The settings arrive after the first render and change in the settings panel: the robot
  // follows them (the search bar does the same on focus).
  let reglagesIaVus = JSON.stringify(store.lire().reglages?.ia ?? null);
  store.abonner(() => {
    const vus = JSON.stringify(store.lire().reglages?.ia ?? null);
    if (vus === reglagesIaVus) return;
    reglagesIaVus = vus;
    chat.actualiser();
  });
  addEventListener("focus", () => chat.actualiser());
  // The account is connected a moment after the page opens (the robot stayed hidden until
  // the first question): the chat reads the AI state again when the synchronisation mode changes.
  let modeSynchroVu = synchro.lire().mode;
  synchro.abonner((e) => {
    if (e.mode === modeSynchroVu) return;
    modeSynchroVu = e.mode;
    chat.actualiser();
  });
  usage.abonner(() => recherche.usageChange());
  const boutonAjoutRecherche = el("button", {
    type: "button",
    class: "recherche-ajout",
    "aria-label": "Ajouter un site ou un dossier",
    title: "Ajouter un site ou un dossier",
    texte: "+",
  });
  boutonAjoutRecherche.addEventListener(
    "click",
    (e) => !lectureSeule && menuAjout(e.currentTarget),
  );
  const ligneRecherche = el(
    "div",
    { class: "recherche-ligne" },
    boutonAjoutRecherche,
    recherche.racine,
  );
  page.insertBefore(ligneRecherche, vide);
  ligneRecherche.after(frequents.racine);
  page.insertBefore(creerHorloge(store).racine, ligneRecherche);
  // New tab taken over from Chrome's address bar (V2.10.7): the cursor goes to the search.
  // The "?focus=1" marker is then removed from the address shown by Chrome.
  if (new URLSearchParams(location.search).has("focus")) {
    recherche.champ.focus();
    history.replaceState(history.state, "", location.pathname);
  }

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

  const estVide = () => store.lire().grille.length === 0;
  let accueil = null;
  let modeAccueil = null;
  let conteneurAccueil = null;
  /** Builds the home grid for `mode` ("pages" | "defilement"), replacing the previous one. */
  const monterAccueil = (mode) => {
    accueil?.detruire();
    modeAccueil = mode;
    const pagination =
      mode === "pages"
        ? creerAccueilPagine({
            annoncer,
            actif: () => !estVide(),
            disposition: () => ({
              comptes: comptesDe(store.lire()),
              ...grilleAccueil(store.lire().reglages),
              // A phone shows the pages with its own grid (V3.4): 8 columns are unreadable.
              affichage:
                petitCote() < COTE_TELEPHONE
                  ? grilleTelephone(globalThis.innerWidth, globalThis.innerHeight)
                  : null,
            }),
          })
        : null;
    conteneurAccueil = pagination
      ? pagination.racine
      : el("ul", { class: "grille", "aria-label": "Mes sites" });
    zoneAccueil.replaceChildren(conteneurAccueil, ...(pagination ? [pagination.indicateur] : []));
    document.documentElement.classList.toggle("accueil-en-pages", !!pagination);
    accueil = creerVueGrille({
      store,
      conteneur: conteneurAccueil,
      lectureSeule: () => lectureSeule,
      annoncer,
      ouvrirDossier,
      apresFusion: (id) =>
        ouvrirFenetreDossier(store, id, {
          lectureSeule: () => lectureSeule,
          annoncer,
          editerTitre: true,
          versAccueil: (x, y) => accueil?.positionDepot(x, y) ?? null,
        }),
      ajouter: menuAjout,
      libelleAjout: "Ajouter un site ou un dossier",
      // The home "+" sits next to the search bar instead of ending the grid.
      tuileAjout: false,
      pagination,
    });
  };
  // V3.4: one scrolling grid by default on a phone, pages elsewhere.
  const modeVoulu = () => affichageAccueilDe(store.lire().reglagesAppareil);
  vide
    .querySelector("button")
    .addEventListener("click", (e) => !lectureSeule && menuAjout(e.currentTarget));

  const rendre = () => {
    if (modeVoulu() !== modeAccueil) monterAccueil(modeVoulu());
    vide.hidden = !estVide();
    zoneAccueil.hidden = estVide();
    accueil.demanderRendu();
  };
  rendre();
  // A phone turned: its page grid changes (V3.4).
  globalThis
    .matchMedia?.("(orientation: landscape)")
    .addEventListener?.("change", () => accueil.demanderRendu());
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
    racineDoc.style.setProperty("--taille-tuiles", String((r.tailleTuiles ?? 100) / 100));
    racineDoc.dataset.animationPage = r.animationPage ?? "glisse";
    racineDoc.dataset.animationDossier = r.animationDossier ?? "zoom";
    document.dispatchEvent(new Event("nedotab:taille-tuiles"));
    racineDoc.style.setProperty("--taille-titres", String((r.tailleTitres ?? 100) / 100));
    racineDoc.toggleAttribute("data-taille-titres", !!r.tailleTitres);
    racineDoc.dataset.ombreIcones = ombreIconesDe(r);
    racineDoc.dataset.styleDossier = styleDossierDe(r);
    racineDoc.style.setProperty("--opacite-dossier", String((r.opaciteDossier ?? 100) / 100));
    racineDoc.toggleAttribute("data-opacite-dossier", !!r.opaciteDossier);
    racineDoc.dataset.forme = formeIconesDe(r);
    racineDoc.dataset.espacement = espacementDe(r);
    document.dispatchEvent(new Event("nedotab:taille-tuiles"));
    activerJournal(r.debug || modeDebug(store));
    plateforme.garderBarreChrome(!!r.barreChrome);
    ouvrirSitesAvec(plateforme.capacites.choixNavigateur ? r.navigateur : null);
  };
  /** Interface switches of the synced settings, as attributes of the page (V4.5.2). */
  const appliquerPreferences = (r) => {
    const racineDoc = document.documentElement;
    racineDoc.toggleAttribute("data-animations-reduites", !!r.animationsReduites);
    racineDoc.toggleAttribute("data-masquer-recherche", !!r.masquerRecherche);
    racineDoc.toggleAttribute("data-masquer-titres", !!r.masquerTitres);
    document.dispatchEvent(new Event("nedotab:taille-tuiles"));
  };
  let appliques = store.lire();
  appliquerPreferences(appliques.reglages);
  appliquerReglages(visibles(appliques));
  appliquerAppareil(appliques.reglagesAppareil);
  ouvrirSitesDansNouvelOnglet(appliques.reglages.nouvelOnglet);
  store.abonner((e) => {
    if (e.reglages !== appliques.reglages || e.reglagesAppareil !== appliques.reglagesAppareil) {
      appliques = e;
      appliquerPreferences(e.reglages);
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

  const persistance = brancherPersistance(store, stockage, {
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
