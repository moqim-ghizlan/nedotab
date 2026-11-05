#!/usr/bin/env node
/**
 * V5.2 — Writes vpn/config (domain and port of the proxy, country, on/off), run by the owner.
 * Usage (from functions/): node scripts/initialiser-config-vpn.js <domaine> <pays> --projet=<id>
 * Example: node scripts/initialiser-config-vpn.js nedotab-vpn.duckdns.org Allemagne --projet=nedotab-app
 */
import process from "node:process";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const [domaine, pays, ...options] = process.argv.slice(2);
const projet = options.find((o) => o.startsWith("--projet="))?.slice("--projet=".length);
if (!domaine || !pays || !projet) {
  console.error("Usage : node scripts/initialiser-config-vpn.js <domaine> <pays> --projet=<id>");
  process.exit(1);
}
if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domaine)) throw new Error("Domaine invalide.");

initializeApp({ projectId: projet });
await getFirestore().doc("vpn/config").set(
  { domaineProxy: domaine, portProxy: 443, pays, actif: true },
  { merge: true }, // V5.10 : ne pas effacer limiteServeurGo, coupureSecurite…
);
console.log(`vpn/config écrit sur ${projet} : ${domaine}:443 (${pays}).`);
