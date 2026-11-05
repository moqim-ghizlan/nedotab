// V5.10 — Rechiffre les mots de passe proxy et les profils WireGuard avec une NOUVELLE clé
// VPN_CLE_CHIFFREMENT. À lancer UNE fois, depuis l'ordinateur du propriétaire, connecté à gcloud
// (identifiants par défaut de l'application), AVANT de déployer les fonctions avec la nouvelle clé.
//
//   VPN_CLE_ANCIENNE=<ancienne clé base64> VPN_CLE_NOUVELLE=<nouvelle clé base64> \
//   GCLOUD_PROJECT=<projet> node functions/scripts/migrer-cle-vpn.mjs
//
// Les clés passent par l'environnement (jamais un argument, jamais un journal). Un document qui
// ne se déchiffre pas avec l'ancienne clé est laissé tel quel et compté en échec.
import process from "node:process";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { migrerCle } from "../src/vpn/rotation.js";

const ancienne = process.env.VPN_CLE_ANCIENNE;
const nouvelle = process.env.VPN_CLE_NOUVELLE;
if (!ancienne || !nouvelle) {
  console.error("Variables VPN_CLE_ANCIENNE et VPN_CLE_NOUVELLE requises.");
  process.exit(1);
}
initializeApp();
const bilan = await migrerCle(getFirestore(), ancienne, nouvelle);
console.log(
  `Mots de passe : ${bilan.motsDePasse} · profils : ${bilan.profils} · échecs : ${bilan.echecs}`,
);
process.exit(bilan.echecs ? 2 : 0);
