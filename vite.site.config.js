// Showcase site build (separate from the extension): site/ → dist/site/.
// Shared header/footer partials, values injected at build time (version, download, legal).
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import { changelogVersHtml } from "./scripts/changelog-vers-html.js";
import config from "./site/site.config.js";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const PAGES = [
  "index",
  "installation",
  "installer-iphone",
  "mise-a-jour",
  "faq",
  "confidentialite",
  "mentions-legales",
];

const echapper = (t) =>
  String(t).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );

/** Download of the current version, copied by `npm run publier` into site/public. */
function telechargement() {
  const nom = `NedoTab-${pkg.version}.zip`;
  const chemin = resolve("site/public/telechargement", nom);
  if (!existsSync(chemin)) return { nom, present: false, taille: "—", sha256: "non disponible" };
  const octets = readFileSync(chemin);
  return {
    nom,
    present: true,
    taille: `${Math.max(1, Math.round(statSync(chemin).size / 1024))} Ko`,
    sha256: createHash("sha256").update(octets).digest("hex"),
  };
}

function dateVersion() {
  const m = readFileSync("CHANGELOG.md", "utf8").match(
    new RegExp(`## \\[${pkg.version.replace(/\./g, "\\.")}\\] - (\\d{4})-(\\d{2})-(\\d{2})`),
  );
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

function gabarits() {
  const partiel = (nom) => readFileSync(resolve("site/partials", `${nom}.html`), "utf8");
  return {
    name: "gabarits-site",
    transformIndexHtml(html, ctx) {
      const page = ctx.filename.split(/[\\/]/).pop().replace(".html", "");
      const zip = telechargement();
      const valeurs = {
        VERSION: pkg.version,
        DATE_VERSION: dateVersion(),
        ZIP_NOM: zip.nom,
        ZIP_TAILLE: zip.taille,
        ZIP_SHA256: zip.sha256,
        URL_PUBLIQUE: config.urlPublique,
        CANONICAL: `${config.urlPublique}${page === "index" ? "" : `${page}.html`}`,
        DEPOT: config.depot,
        EDITEUR: echapper(config.editeur),
        CONTACT: echapper(config.contact),
        REGION_DONNEES: echapper(config.regionDonnees),
        DATE_CONFIDENTIALITE: echapper(config.dateConfidentialite),
        HEBERGEUR_NOM: echapper(config.hebergeur.nom),
        HEBERGEUR_ADRESSE: echapper(config.hebergeur.adresse),
        HEBERGEUR_NOTE: config.hebergeur.confirme ? "" : " (À CONFIRMER)",
      };
      let resultat = html
        .replace("<!-- @entete -->", partiel("entete"))
        .replace("<!-- @pied -->", partiel("pied"))
        .replace("<!-- @versions -->", changelogVersHtml(readFileSync("CHANGELOG.md", "utf8")))
        .replace(`data-page="${page}"`, `data-page="${page}" aria-current="page"`);
      for (const [cle, valeur] of Object.entries(valeurs))
        resultat = resultat.split(`%${cle}%`).join(valeur);
      return resultat;
    },
  };
}

export default defineConfig({
  root: "site",
  base: "./",
  publicDir: "public",
  build: {
    outDir: "../dist/site",
    emptyOutDir: true,
    rollupOptions: {
      input: Object.fromEntries(PAGES.map((p) => [p, resolve("site", `${p}.html`)])),
    },
  },
  plugins: [gabarits()],
});
