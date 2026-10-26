#!/usr/bin/env node
/**
 * V4.0 — Writes config/ia (providers offered, suggested models, daily quota), run by the
 * owner. The model ids are taken from the providers' documentation at that moment and put
 * in a copy of config-ia.exemple.json: they are never written in the code.
 *
 * Usage (from functions/, signed in with `gcloud auth application-default login` or with
 * GOOGLE_APPLICATION_CREDENTIALS):
 *   node scripts/initialiser-config-ia.js chemin/config-ia.json --projet=nedotab-app
 */
import { readFileSync } from "node:fs";
import process from "node:process";
import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { normaliserConfig } from "../src/ia/config.js";

const [fichier, ...options] = process.argv.slice(2);
const projet = options.find((o) => o.startsWith("--projet="))?.slice("--projet=".length);
if (!fichier || !projet) {
  console.error("Usage : node scripts/initialiser-config-ia.js config-ia.json --projet=<id>");
  process.exit(1);
}

const brute = JSON.parse(readFileSync(fichier, "utf8"));
if (JSON.stringify(brute).includes("<"))
  throw new Error("Le fichier contient encore des valeurs d'exemple « <…> » : complétez-les.");
const config = normaliserConfig(brute);
for (const m of config.modelesSuggeres) {
  if (!config.fournisseurs.some((f) => f.id === m.fournisseur))
    throw new Error(`Modèle ${m.id} : fournisseur inconnu ${m.fournisseur}.`);
}

initializeApp({ projectId: projet });
await getFirestore()
  .doc("config/ia")
  .set({ ...config, majLe: FieldValue.serverTimestamp() });
console.log(
  `config/ia écrit sur ${projet} : ${config.fournisseurs.filter((f) => f.actif).length} fournisseur(s) actif(s), ${config.modelesSuggeres.length} modèle(s), quota ${config.quotaQuotidien}/jour.`,
);
