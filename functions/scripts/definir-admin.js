#!/usr/bin/env node
/**
 * V5.2 — Gives the "admin" role (custom claim) to the owner. Run by the owner, with his own
 * rights (`gcloud auth application-default login`, or GOOGLE_APPLICATION_CREDENTIALS).
 * Usage (from functions/): node scripts/definir-admin.js <email> --projet=nedotab-app
 * Then sign out and in again in the app (or refresh the token) so that the claim appears.
 */
import process from "node:process";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const [email, ...options] = process.argv.slice(2);
const projet = options.find((o) => o.startsWith("--projet="))?.slice("--projet=".length);
if (!email || !projet) {
  console.error("Usage : node scripts/definir-admin.js <email> --projet=<id>");
  process.exit(1);
}

initializeApp({ projectId: projet });
const utilisateur = await getAuth().getUserByEmail(email);
if (!utilisateur.emailVerified) throw new Error("L'adresse e-mail de ce compte n'est pas vérifiée.");
await getAuth().setCustomUserClaims(utilisateur.uid, { ...(utilisateur.customClaims ?? {}), admin: true });
console.log(`Rôle admin donné à ${email} sur ${projet}. Reconnectez-vous dans l'application.`);
