/**
 * Cloud Functions of NedoTab (region europe-west1). V2.10: complete deletion of an account,
 * done by the server (Admin SDK): a series of calls from the browser could stop halfway.
 * V4.0: the AI functions (keys of the users, quota), see src/ia/ and docs/ia.md.
 */
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { logger } from "firebase-functions";
import { defineInt, defineSecret } from "firebase-functions/params";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { AGE_CONNEXION_MAX_S, connexionRecente, stockageAbsent } from "./regles.js";
import { creerLecteurConfig } from "./src/ia/config.js";
import { versErreurAppel } from "./src/ia/erreurs.js";
import { creerFonctionsIa } from "./src/ia/fonctions.js";
import { FOURNISSEURS } from "./src/ia/fournisseurs/index.js";
import { parseHTML } from "linkedom";
import { extraireContenu } from "./src/partage/extraitPage.js";
import { consommer } from "./src/quota.js";
import { recupererPage, sonderSite } from "./src/reseau/recupererPage.js";
import { creerVerificationSites } from "./src/sites/verifier.js";

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
    try {
      await getStorage()
        .bucket()
        .deleteFiles({ prefix: `users/${uid}/` });
    } catch (e) {
      if (!stockageAbsent(e)) throw e;
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
    try {
      return await verifierSites(requete.auth.uid, requete.data);
    } catch (e) {
      const { code, message, details } = versErreurAppel(e);
      if (code === "internal") logger.error("verification : erreur interne", { nom: e?.name });
      throw new HttpsError(code, message, details);
    }
  },
);
