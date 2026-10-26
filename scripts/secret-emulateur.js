#!/usr/bin/env node
/**
 * V4.0 — The emulators need a value for the IA_CLE_CHIFFREMENT secret (functions/
 * .secret.local, read by the Functions emulator only). A random one is made for this
 * computer if there is none; it never goes to the repository (.gitignore) nor to the
 * real project, whose secret lives in Secret Manager.
 */
import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";

const fichier = "functions/.secret.local";
if (!existsSync(fichier)) {
  writeFileSync(fichier, `IA_CLE_CHIFFREMENT=${randomBytes(32).toString("base64")}\n`);
  console.log(`${fichier} créé (secret de test, émulateurs seulement).`);
}
