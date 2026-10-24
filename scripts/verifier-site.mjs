// Checks the built showcase site in a real Chrome: every page on desktop and phone width,
// dark mode, no request to a third-party host, basic accessibility; then installs the
// extension from the site's zip and checks that an update keeps the user's sites.
// Usage: npm run verifier:site (after npm run publier)
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join } from "node:path";
import { inflateRawSync } from "node:zlib";
import { attendre, lancerChrome } from "./navigateur.mjs";

const RACINE = "dist/site";
const { version } = JSON.parse(readFileSync("package.json", "utf8"));
const PREUVES = `docs/v${version.split(".").slice(0, 2).join(".")}/evidence`;
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".webp": "image/webp",
  ".png": "image/png",
  ".zip": "application/zip",
};

const resultats = [];
const verifier = (nom, ok, detail = "") => {
  resultats.push(!!ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${nom}${detail ? ` (${detail})` : ""}`);
};

const serveur = createServer((req, res) => {
  let chemin = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (chemin.endsWith("/")) chemin += "index.html";
  try {
    const octets = readFileSync(join(RACINE, chemin));
    res.writeHead(200, { "content-type": TYPES[extname(chemin)] ?? "application/octet-stream" });
    res.end(octets);
  } catch {
    res.writeHead(404);
    res.end("introuvable");
  }
});
await new Promise((ok) => serveur.listen(0, "127.0.0.1", ok));
const base = `http://127.0.0.1:${serveur.address().port}/`;

/** Extracts the zip written by scripts/empaqueter.js into `dossier`. */
function extraire(zip, dossier) {
  const o = readFileSync(zip);
  const fin = o.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  let pos = o.readUInt32LE(fin + 16);
  for (let i = 0; i < o.readUInt16LE(fin + 10); i++) {
    const taille = o.readUInt32LE(pos + 20);
    const lnom = o.readUInt16LE(pos + 28);
    const local = o.readUInt32LE(pos + 42);
    const nom = o.subarray(pos + 46, pos + 46 + lnom).toString();
    const debut = local + 30 + o.readUInt16LE(local + 26) + o.readUInt16LE(local + 28);
    mkdirSync(dirname(join(dossier, nom)), { recursive: true });
    writeFileSync(join(dossier, nom), inflateRawSync(o.subarray(debut, debut + taille)));
    pos += 46 + lnom + o.readUInt16LE(pos + 30) + o.readUInt16LE(pos + 32);
  }
}

const nav = await lancerChrome({ largeur: 1440, hauteur: 900, langue: "fr" });
try {
  const p = await nav.ouvrir();
  const requetes = new Set();
  await p.envoyer("Network.enable");
  nav.surEvenement((m) => {
    if (m.method === "Network.requestWillBeSent") requetes.add(new URL(m.params.request.url).host);
  });
  const pages = readdirSync(RACINE).filter((f) => f.endsWith(".html"));
  for (const page of pages) {
    await p.sombre(false);
    await p.taille(1440, 900);
    await p.aller(base + page);
    await attendre(400);
    const audit = await p.eval(`(() => ({
      lang: document.documentElement.lang,
      h1: document.querySelectorAll("h1").length,
      sansAlt: [...document.images].filter((i) => !i.hasAttribute("alt")).length,
      titre: document.title,
      description: !!document.querySelector('meta[name="description"]'),
      sautTitres: (() => { let prec = 1, saut = false; for (const h of document.querySelectorAll("main h1, main h2, main h3")) { const n = +h.tagName[1]; if (n > prec + 1) saut = true; prec = n; } return saut; })(),
    }))()`);
    verifier(
      `${page} : lang, un seul h1, alt, description, titres sans saut`,
      audit.lang === "fr" &&
        audit.h1 === 1 &&
        audit.sansAlt === 0 &&
        audit.description &&
        !audit.sautTitres,
      audit.titre,
    );
    await p.capture(`${PREUVES}/site-${page.replace(".html", "")}.png`);
    await p.taille(390, 844, true);
    await attendre(250);
    const debord = await p.eval(`document.documentElement.scrollWidth - innerWidth`);
    verifier(`${page} : pas de défilement horizontal sur téléphone`, debord <= 0, `${debord}px`);
    if (page === "index.html" || page === "installation.html") {
      await p.capture(`${PREUVES}/site-${page.replace(".html", "")}-mobile.png`);
    }
  }
  await p.taille(1440, 900);
  await p.sombre(true);
  await p.aller(base + "index.html");
  await attendre(400);
  await p.capture(`${PREUVES}/site-index-sombre.png`);
  const tiers = [...requetes].filter((h) => !h.startsWith("127.0.0.1"));
  verifier("Aucune requête vers un domaine tiers", tiers.length === 0, tiers.join(", "));
  verifier("Aucune erreur console sur le site", p.erreurs.length === 0, p.erreurs.join(" | "));

  // Download link of the home page points to the zip of this version
  const lien = await p.eval(`document.querySelector(".bouton-principal").getAttribute("href")`);
  verifier(
    "Bouton de téléchargement → zip de la version",
    lien === `./telechargement/NedoTab-${version}.zip`,
    lien,
  );
} finally {
  await nav.fermer();
}

// Update procedure: an older version installed from a folder, sites added, folder content
// replaced with the zip of the site, extension reloaded → same id, sites kept.
{
  const dossierExt = mkdtempSync(join(tmpdir(), "nedotab-installe-"));
  cpSync("dist/extension", dossierExt, { recursive: true });
  const m = JSON.parse(readFileSync(join(dossierExt, "manifest.json"), "utf8"));
  m.version = "1.10.0";
  writeFileSync(join(dossierExt, "manifest.json"), JSON.stringify(m));
  const nav2 = await lancerChrome();
  try {
    const id = await nav2.chargerExtension(dossierExt);
    const p = await nav2.ouvrir(`chrome-extension://${id}/newtab.html`);
    await attendre(300);
    await p.eval(
      `chrome.storage.local.set({ etat: { versionSchema: 1, grille: [{ id: "a", type: "site", titre: "Mon site", url: "https://exemple.fr", icone: { type: "lettre", couleur: "#2c6b5a" }, creeLe: 0 }], reglages: { theme: "auto", fond: { type: "aucun" } }, ecritPar: "t", majLe: 1 } })`,
    );
    // Replace the folder content with the zip downloaded from the site, then reload.
    rmSync(dossierExt, { recursive: true, force: true });
    mkdirSync(dossierExt);
    extraire(join(RACINE, "telechargement", `NedoTab-${version}.zip`), dossierExt);
    const id2 = await nav2.chargerExtension(dossierExt);
    const p2 = await nav2.ouvrir(`chrome-extension://${id2}/newtab.html`);
    await attendre(400);
    const apres = await p2.eval(
      `({ v: chrome.runtime.getManifest().version, sites: [...document.querySelectorAll(".tuile--site")].map((t) => t.textContent) })`,
    );
    verifier(
      "Mise à jour depuis le zip du site : même identifiant",
      id2 === id && id === "imegmpimokhlnlhcmaogimnlgcfgefnn",
      id2,
    );
    verifier(
      "Mise à jour : nouvelle version et sites conservés",
      apres.v === version && apres.sites.join() === "MMon site",
      JSON.stringify(apres),
    );
  } finally {
    await nav2.fermer();
    rmSync(dossierExt, { recursive: true, force: true });
  }
}

serveur.close();
const echecs = resultats.filter((r) => !r).length;
console.log(`${resultats.length - echecs}/${resultats.length} vérifications réussies.`);
process.exit(echecs ? 1 : 0);
