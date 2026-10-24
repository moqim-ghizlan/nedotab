/**
 * Cloud Functions of NedoTab (region europe-west1). V2.10: complete deletion of an account,
 * done by the server (Admin SDK): a series of calls from the browser could stop halfway.
 */
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { logger } from "firebase-functions";
import { defineInt } from "firebase-functions/params";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { AGE_CONNEXION_MAX_S, connexionRecente, stockageAbsent } from "./regles.js";

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
