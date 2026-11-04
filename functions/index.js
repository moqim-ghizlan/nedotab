/**
 * Cloud Functions of NedoTab (region europe-west1). V2.10: complete deletion of an account,
 * done by the server (Admin SDK): a series of calls from the browser could stop halfway.
 * V4.0: the AI functions (keys of the users, quota), see src/ia/ and docs/ia.md.
 */
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { logger } from "firebase-functions";
import { defineInt, defineSecret } from "firebase-functions/params";
import { createHash } from "node:crypto";
import process from "node:process";
import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { AGE_CONNEXION_MAX_S, connexionRecente, emailVerifie, stockageAbsent } from "./regles.js";
import { nettoyerComptes } from "./src/nettoyageComptes.js";
import { creerLecteurConfig } from "./src/ia/config.js";
import { versErreurAppel } from "./src/ia/erreurs.js";
import { creerFonctionsIa } from "./src/ia/fonctions.js";
import { FOURNISSEURS } from "./src/ia/fournisseurs/index.js";
import { parseHTML } from "linkedom";
import { extraireContenu } from "./src/partage/extraitPage.js";
import { consommer } from "./src/quota.js";
import { recupererPage, sonderSite } from "./src/reseau/recupererPage.js";
import { nettoyerEspacePartage } from "./src/espacePartage/nettoyer.js";
import { ErreurLien, creerLiens } from "./src/espacePartage/liens/liens.js";
import { reconcilierEspacePartage } from "./src/espacePartage/reconcilier.js";
import { creerVerificationSites } from "./src/sites/verifier.js";
import { creerProfilsVpn, ErreurProfil } from "./src/vpn/agentProfils.js";
import { creerFonctionsVpn, ErreurVpn } from "./src/vpn/fonctions.js";

initializeApp();

// Recent sign-in required (seconds). Lowered only for the emulator tests (.env.demo-nedotab).
const AGE_MAX = defineInt("AGE_CONNEXION_MAX_S", { default: AGE_CONNEXION_MAX_S });

export const supprimerMonCompte = onCall(
  {
    region: "europe-west1",
    maxInstances: 5,
    timeoutSeconds: 120,
    // App Check stays off for now, as decided in V2.2 (the extension cannot attest itself
    // yet); to be turned on with the rest of App Check.
    enforceAppCheck: false,
  },
  async (requete) => {
    if (!requete.auth) {
      throw new HttpsError("unauthenticated", "Connectez-vous pour supprimer votre compte.");
    }
    const { uid, token } = requete.auth;
    if (!connexionRecente(token.auth_time, Date.now(), AGE_MAX.value())) {
      throw new HttpsError("failed-precondition", "Reconnectez-vous pour confirmer.");
    }
    // Data first, the Auth account last: if anything fails, the user can try again.
    const db = getFirestore();
    await db.recursiveDelete(db.doc(`users/${uid}`));
    // V4.28: the share links of the account (documents and encrypted copies).
    await liens.supprimerLiensDe(uid);
    // V5.2: no VPN access may outlive its account (the agent drops it within a minute).
    await vpn.retirerAccesDe(uid);
    // Backgrounds (users/{uid}/) and files of the sharing space (partages/{uid}/, V4.25).
    for (const prefix of [`users/${uid}/`, `partages/${uid}/`]) {
      try {
        await getStorage().bucket().deleteFiles({ prefix });
      } catch (e) {
        if (!stockageAbsent(e)) throw e;
      }
    }
    await getAuth().deleteUser(uid);
    // Never the uid, the e-mail or any data of the user in the logs.
    logger.info("compte supprimé");
    return { ok: true };
  },
);

// --- V4.0: AI functions ---------------------------------------------------------------------
// Every AI call goes through here: the user's own key, stored encrypted (users/{uid}/prive/ia),
// decrypted only in memory for the time of a call, never sent back to the browser.

const IA_CLE_CHIFFREMENT = defineSecret("IA_CLE_CHIFFREMENT");

const lireConfigIa = creerLecteurConfig(getFirestore());
const fonctionsIa = creerFonctionsIa({
  db: getFirestore(),
  secret: () => IA_CLE_CHIFFREMENT.value(),
  fournisseurs: FOURNISSEURS,
  config: lireConfigIa,
  consommer: (uid, options) => consommer(getFirestore(), uid, options),
  increment: (n) => FieldValue.increment(n),
  // Provider, model, duration, tokens, error code: never the key nor the messages.
  // V4.5: the page is read by the server through recupererPage (anti-SSRF), then summarised.
  lirePage: async (url) => {
    const { html, urlFinale } = await recupererPage(url);
    return extraireContenu(parseHTML(html).document, urlFinale);
  },
  journal: (infos) => logger.info("ia", infos),
});

const OPTIONS_IA = {
  region: "europe-west1",
  secrets: [IA_CLE_CHIFFREMENT],
  maxInstances: 10,
  timeoutSeconds: 60,
  memory: "256MiB",
  // Same as supprimerMonCompte: App Check is not enforced yet (decision of V2.2).
  enforceAppCheck: false,
};

/** onCall around one AI function: signed-in user, errors turned into callable errors. */
const appelIa = (fonction) =>
  onCall(OPTIONS_IA, async (requete) => {
    if (!requete.auth)
      throw new HttpsError("unauthenticated", "Connectez-vous pour utiliser l'IA.");
    if (!emailVerifie(requete.auth))
      throw new HttpsError("permission-denied", "Vérifiez votre adresse e-mail pour utiliser l'IA.");
    try {
      return await fonction(requete.auth.uid, requete.data);
    } catch (e) {
      const { code, message, details } = versErreurAppel(e);
      if (code === "internal") logger.error("ia : erreur interne", { nom: e?.name });
      throw new HttpsError(code, message, details);
    }
  });

export const iaEnregistrerCle = appelIa(fonctionsIa.enregistrerCle);
export const iaSupprimerCle = appelIa(fonctionsIa.supprimerCle);
export const iaEtatCles = appelIa(fonctionsIa.etatCles);
export const iaTester = appelIa(fonctionsIa.tester);
export const iaGenererTags = appelIa(fonctionsIa.genererTags);
export const iaProposerSite = appelIa(fonctionsIa.proposerSite);
export const iaChat = appelIa(fonctionsIa.chatConversation);
export const iaSupprimerConversation = appelIa(fonctionsIa.supprimerConversation);
/**
 * V4.12: the chat answer streamed to the browser (callable streaming, docs/decisions.md). A
 * request that does not accept a stream is refused: the browser then uses iaChat.
 */
export const iaChatFlux = onCall(
  { ...OPTIONS_IA, timeoutSeconds: 120 },
  async (requete, reponse) => {
    if (!requete.auth)
      throw new HttpsError("unauthenticated", "Connectez-vous pour utiliser l'IA.");
    if (!emailVerifie(requete.auth))
      throw new HttpsError("permission-denied", "Vérifiez votre adresse e-mail pour utiliser l'IA.");
    if (!requete.acceptsStreaming)
      throw new HttpsError("failed-precondition", "Flux non pris en charge.");
    try {
      return await fonctionsIa.chatFluxConversation(requete.auth.uid, requete.data, {
        envoyerMorceau: (morceau) => reponse.sendChunk(morceau),
        signal: reponse.signal,
      });
    } catch (e) {
      const { code, message, details } = versErreurAppel(e);
      if (code === "internal") logger.error("ia : erreur interne", { nom: e?.name });
      throw new HttpsError(code, message, details);
    }
  },
);
export const iaRechercher = appelIa(fonctionsIa.rechercher);
export const iaSuggererRangement = appelIa(fonctionsIa.suggererRangement);
export const iaConsommation = appelIa(fonctionsIa.consommation);
export const iaEffacer = appelIa(fonctionsIa.effacer);
export const iaQuotaRestant = appelIa(fonctionsIa.quotaRestant);
export const iaDefinirQuota = appelIa(fonctionsIa.definirQuota);

// --- V4.17: do the sites of the user still answer? (no AI call, own daily quota) -------------
const verifierSites = creerVerificationSites({
  db: getFirestore(),
  consommer: (uid, options) => consommer(getFirestore(), uid, options),
  sonder: sonderSite,
});
export const iaVerifierSites = onCall(
  { region: "europe-west1", maxInstances: 5, timeoutSeconds: 60, memory: "256MiB", enforceAppCheck: false },
  async (requete) => {
    if (!requete.auth)
      throw new HttpsError("unauthenticated", "Connectez-vous pour vérifier vos sites.");
    if (!emailVerifie(requete.auth))
      throw new HttpsError("permission-denied", "Vérifiez votre adresse e-mail pour continuer.");
    try {
      return await verifierSites(requete.auth.uid, requete.data);
    } catch (e) {
      const { code, message, details } = versErreurAppel(e);
      if (code === "internal") logger.error("verification : erreur interne", { nom: e?.name });
      throw new HttpsError(code, message, details);
    }
  },
);

// --- V4.23: cleanup of the e-mail accounts never verified ---------------------------------------
export const nettoyageComptesNonVerifies = onSchedule(
  { schedule: "every day 04:00", timeZone: "Europe/Paris", region: "europe-west1", maxInstances: 1 },
  async () => {
    const n = await nettoyerComptes(getAuth());
    logger.info("comptes non vérifiés supprimés", { nombre: n });
  },
);

// --- V4.27: expiry of the sharing space (every item expires, files included) -------------------
const stockagePartage = {
  async supprimerFichier(chemin) {
    // Idempotent: a file already gone is not an error.
    await getStorage().bucket().file(chemin).delete({ ignoreNotFound: true });
  },
};
export const nettoyerEspacePartageProgramme = onSchedule(
  { schedule: "every 10 minutes", region: "europe-west1", maxInstances: 1, timeoutSeconds: 120 },
  async () => {
    const r = await nettoyerEspacePartage({
      db: getFirestore(),
      stockage: stockagePartage,
      valeurs: { increment: (n) => FieldValue.increment(n), timestamp: (ms) => Timestamp.fromMillis(ms) },
    });
    // Volumes only: never a name, a path or a content.
    logger.info("espace de partage nettoyé", { ...r, ...(await liens.nettoyerLiens()) });
  },
);
export const reconcilierEspacePartageProgramme = onSchedule(
  { schedule: "every day 03:30", timeZone: "Europe/Paris", region: "europe-west1", maxInstances: 1, timeoutSeconds: 300 },
  async () => {
    const bucket = getStorage().bucket();
    const r = await reconcilierEspacePartage({
      db: getFirestore(),
      stockage: {
        lister: async (uid) => (await bucket.getFiles({ prefix: `partages/${uid}/` }))[0].map((f) => f.name),
        supprimer: (chemin) => bucket.file(chemin).delete({ ignoreNotFound: true }),
      },
    });
    logger.info("espace de partage réconcilié", r);
  },
);

// --- V4.28: public share links (the only public door of the application) ------------------------
const bucketLiens = () => getStorage().bucket();
const sel = process.env.SEL_EMPREINTE_PARTAGE ?? process.env.GCLOUD_PROJECT ?? "nedotab";
const liens = creerLiens({
  db: getFirestore(),
  stockage: {
    ecrire: (chemin, octets) => bucketLiens().file(chemin).save(octets, { contentType: "application/octet-stream", resumable: false }),
    lire: async (chemin) => (await bucketLiens().file(chemin).download())[0],
    supprimer: (chemin) => bucketLiens().file(chemin).delete({ ignoreNotFound: true }),
  },
  horodatage: (ms) => Timestamp.fromMillis(ms),
  // V4.31: severity ERROR on purpose, a Cloud Monitoring log-based alert e-mails the owner.
  // Volumes only: no token, no address.
  alerter: (infos) => logger.error("SIGNALEMENT_LIEN_PARTAGE", infos),
  // Salted and rotating (10 min): the address itself is never stored nor logged.
  empreinteAdresse: (adresse, t) =>
    createHash("sha256").update(`${adresse}:${sel}:${Math.floor(t / 600_000)}`).digest("base64url"),
});

const CODES_APPEL = {
  desactive: "unavailable",
  interdit: "permission-denied",
  invalide: "invalid-argument",
  plein: "resource-exhausted",
  limite: "resource-exhausted",
};
const appelLien = (f) =>
  onCall(
    { region: "europe-west1", maxInstances: 5, timeoutSeconds: 60, memory: "512MiB", enforceAppCheck: false },
    async (requete) => {
      if (!requete.auth) throw new HttpsError("unauthenticated", "Connectez-vous pour gérer vos liens.");
      if (!emailVerifie(requete.auth))
        throw new HttpsError("permission-denied", "Vérifiez votre adresse e-mail pour continuer.");
      try {
        const r = await f(requete.auth.uid, requete.data ?? {});
        logger.info("lien de partage", { action: f.name }); // a volume, never a token or a content
        return r;
      } catch (e) {
        if (e instanceof ErreurLien) throw new HttpsError(CODES_APPEL[e.code] ?? "internal", e.message);
        logger.error("lien de partage : erreur interne", { nom: e?.name });
        throw new HttpsError("internal", "Erreur interne.");
      }
    },
  );
export const creerLienPartage = appelLien(function creer(uid, d) {
  return liens.creer(uid, d);
});
export const listerLiensPartage = appelLien(function lister(uid) {
  return liens.lister(uid);
});
export const revoquerLienPartage = appelLien(function revoquer(uid, d) {
  return liens.revoquer(uid, d.idLien);
});

const STATUTS_PUBLICS = { indisponible: 404, verrouille: 423, "mot-de-passe": 401, limite: 429, invalide: 400 };
/** Public endpoint (no account): POST JSON, same-origin through the Hosting rewrite. */
const publique = (f) =>
  onRequest(
    { region: "europe-west1", maxInstances: 5, timeoutSeconds: 60, memory: "512MiB", cors: false },
    async (req, res) => {
      res.set({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Content-Type": "application/json" });
      const projet = process.env.GCLOUD_PROJECT;
      const origine = req.get("origin");
      if (req.method !== "POST" || (origine && ![`https://${projet}.web.app`, `https://${projet}.firebaseapp.com`].includes(origine))) {
        res.status(404).send(JSON.stringify({ erreur: "indisponible" }));
        return;
      }
      const adresse = String(req.get("x-forwarded-for") ?? req.ip ?? "").split(",")[0].trim();
      try {
        res.status(200).send(JSON.stringify(await f(req.body ?? {}, adresse)));
      } catch (e) {
        if (e instanceof ErreurLien) {
          res.status(STATUTS_PUBLICS[e.code] ?? 404).send(JSON.stringify({ erreur: e.code, ...(e.details ?? {}) }));
        } else {
          logger.error("lien public : erreur interne", { nom: e?.name });
          res.status(500).send(JSON.stringify({ erreur: "interne" }));
        }
      }
    },
  );
export const ouvrirLienPartage = publique((corps, adresse) => liens.ouvrir(corps, adresse));
export const signalerLienPartage = publique((corps, adresse) => liens.signaler(corps, adresse));

// --- V5.2: private VPN (guests only) ----------------------------------------------------------
// The owner (custom claim admin) invites by e-mail; a guest receives his own proxy identifiers;
// the server of the VPN reads the active accounts through vpnAgentSynchro with a secret token
// (it never holds a Firebase service account). See docs/vpn.md and serveur/agent/.
const VPN_CLE_CHIFFREMENT = defineSecret("VPN_CLE_CHIFFREMENT");
const VPN_JETON_AGENT = defineSecret("VPN_JETON_AGENT");

const vpn = creerFonctionsVpn({
  db: getFirestore(),
  cle: () => VPN_CLE_CHIFFREMENT.value(),
  jetonAgent: () => VPN_JETON_AGENT.value(),
  utilisateurParEmail: async (email) => {
    try {
      const u = await getAuth().getUserByEmail(email);
      return { uid: u.uid, emailVerified: u.emailVerified };
    } catch (e) {
      if (e?.code === "auth/user-not-found") return null;
      throw e;
    }
  },
  consommer: (uid, options) => consommer(getFirestore(), uid, options),
  // Only a number of accounts: never an e-mail, a login or a destination.
  journal: (infos) => logger.info("vpn : synchro", infos),
});

const OPTIONS_VPN = {
  region: "europe-west1",
  secrets: [VPN_CLE_CHIFFREMENT, VPN_JETON_AGENT],
  maxInstances: 5,
  timeoutSeconds: 30,
  memory: "256MiB",
  enforceAppCheck: false,
};

/** onCall around one VPN function: signed-in user required, errors turned into callable errors. */
const appelVpn = (fonction) =>
  onCall(OPTIONS_VPN, async (requete) => {
    if (!requete.auth) throw new HttpsError("unauthenticated", "Connectez-vous pour utiliser le VPN.");
    try {
      return await fonction(requete.auth, requete.data ?? {});
    } catch (e) {
      if (e instanceof ErreurVpn) throw new HttpsError(e.code, e.message);
      logger.error("vpn : erreur interne", { nom: e?.name });
      throw new HttpsError("internal", "Erreur interne.");
    }
  });

export const vpnInviter = appelVpn((auth, donnees) => vpn.inviter(auth, donnees));
export const vpnRevoquer = appelVpn((auth, donnees) => vpn.revoquer(auth, donnees));
export const vpnListeInvites = appelVpn((auth) => vpn.listeInvites(auth));
export const vpnObtenirAcces = appelVpn((auth) => vpn.obtenirAcces(auth));
export const vpnRegenererMotDePasse = appelVpn((auth) => vpn.regenererMotDePasse(auth));

/** The server agent: GET with "Authorization: Bearer <token>"; nothing else is accepted. */
export const vpnAgentSynchro = onRequest(
  { region: "europe-west1", secrets: [VPN_JETON_AGENT], maxInstances: 2, timeoutSeconds: 30, memory: "256MiB", cors: false },
  async (req, res) => {
    res.set({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Content-Type": "application/json" });
    const jeton = /^Bearer (.+)$/.exec(req.get("authorization") ?? "")?.[1];
    if (req.method !== "GET") {
      res.status(404).send(JSON.stringify({ erreur: "indisponible" }));
      return;
    }
    try {
      const reponse = await vpn.synchro(jeton);
      if (!reponse) {
        res.status(401).send(JSON.stringify({ erreur: "non autorisé" }));
        return;
      }
      res.status(200).send(JSON.stringify(reponse));
    } catch (e) {
      logger.error("vpn : synchro en erreur", { nom: e?.name });
      res.status(500).send(JSON.stringify({ erreur: "interne" }));
    }
  },
);

// --- V5.7: WireGuard profiles. Same token as the sync agent; the server sees profile names only.
const profilsVpn = creerProfilsVpn({
  db: getFirestore(),
  cle: () => VPN_CLE_CHIFFREMENT.value(),
  jetonAgent: () => VPN_JETON_AGENT.value(),
  journal: (infos) => logger.info("vpn : profils", infos), // counts only, never a key
});
const OPTIONS_AGENT = {
  region: "europe-west1",
  secrets: [VPN_CLE_CHIFFREMENT, VPN_JETON_AGENT],
  maxInstances: 2,
  timeoutSeconds: 30,
  memory: "256MiB",
  cors: false,
};
const STATUTS_PROFIL = { "invalid-argument": 400, "not-found": 404 };

/** Wrapper of the two agent endpoints: bearer token, JSON, nothing else accepted. */
const pointAgent = (methode, traiter) =>
  onRequest(OPTIONS_AGENT, async (req, res) => {
    res.set({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Content-Type": "application/json" });
    const jeton = /^Bearer (.+)$/.exec(req.get("authorization") ?? "")?.[1];
    if (req.method !== methode) {
      res.status(404).send(JSON.stringify({ erreur: "indisponible" }));
      return;
    }
    try {
      const reponse = await traiter(jeton, req.body ?? {});
      if (!reponse) {
        res.status(401).send(JSON.stringify({ erreur: "non autorisé" }));
        return;
      }
      res.status(200).send(JSON.stringify(reponse));
    } catch (e) {
      if (e instanceof ErreurProfil) {
        res.status(STATUTS_PROFIL[e.code] ?? 400).send(JSON.stringify({ erreur: e.code }));
        return;
      }
      logger.error("vpn : profils en erreur", { nom: e?.name });
      res.status(500).send(JSON.stringify({ erreur: "interne" }));
    }
  });

export const vpnAgentProfils = pointAgent("GET", (jeton) => profilsVpn.lister(jeton));
export const vpnAgentDeposerProfil = pointAgent("POST", (jeton, corps) => profilsVpn.deposer(jeton, corps));
