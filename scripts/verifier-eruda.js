#!/usr/bin/env node
/**
 * V3.10 — Eruda (debug console) is in the web app package, as a file of its own that the
 * page does not load by default, and it is NOT in the extension package.
 * Usage: node scripts/verifier-eruda.js   (after build:pwa and build:extension)
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const fichiersJs = (dossier) => {
  if (!existsSync(dossier)) return [];
  return readdirSync(dossier, { recursive: true })
    .map((f) => join(dossier, f))
    .filter((f) => f.endsWith(".js") && statSync(f).isFile());
};
const contientEruda = (f) => /eruda/i.test(readFileSync(f, "utf8"));

let ok = true;
const echec = (m) => {
  console.error(`✘ ${m}`);
  ok = false;
};

const extension = fichiersJs("dist/extension");
if (!extension.length) echec("dist/extension introuvable : lancer npm run build:extension");
for (const f of extension) if (contientEruda(f)) echec(`Eruda dans le paquet extension : ${f}`);

const pwa = fichiersJs("dist/pwa").filter((f) => !/sw\.js$|workbox/.test(f));
if (!pwa.length) echec("dist/pwa introuvable : lancer npm run build:pwa");
const avecEruda = pwa.filter(contientEruda);
if (!avecEruda.length) echec("Eruda absent du paquet web");
// The entry page must not load it: only the lazy chunk may hold the library itself.
const index = readFileSync("dist/pwa/index.html", "utf8");
if (/eruda/i.test(index)) echec("index.html charge Eruda par défaut");
const entree = [...index.matchAll(/src="([^"]+\.js)"/g)].map((m) => m[1].replace(/^\//, ""));
for (const e of entree) {
  const chemin = join("dist/pwa", e);
  if (existsSync(chemin) && readFileSync(chemin, "utf8").length > 0) {
    const poids = statSync(chemin).size;
    if (poids > 0 && /\beruda\.init\b/.test(readFileSync(chemin, "utf8")))
      echec(`le fichier d'entrée contient la bibliothèque Eruda : ${e}`);
  }
}

if (ok) console.log("✔ Eruda : fichier séparé dans le paquet web, absent de l'extension.");
process.exit(ok ? 0 : 1);
