// Loads dist/extension in a real Chrome (headless), runs the checks of the current version
// and saves screenshots to docs/v<x.y>/evidence/. Usage: npm run verifier:navigateur
import { readFileSync } from "node:fs";
import { lancerChrome, attendre } from "./navigateur.mjs";

const version = JSON.parse(readFileSync("dist/extension/manifest.json", "utf8")).version;
const dossier = `docs/v${version.split(".").slice(0, 2).join(".")}/evidence`;
const resultats = [];
const verifier = (nom, ok, detail = "") => {
  resultats.push({ nom, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${nom}${detail ? ` (${detail})` : ""}`);
};

const nav = await lancerChrome({ headless: !process.argv.includes("--visible") });
try {
  const id = await nav.chargerExtension();
  verifier("ID d'extension stable", id === "imegmpimokhlnlhcmaogimnlgcfgefnn", id);
  const p = await nav.ouvrir(`chrome-extension://${id}/newtab.html`);
  await attendre(400);
  const texte = await p.eval("document.body.innerText");
  verifier("Nom et version affichés", texte.includes("NedoTab") && texte.includes(version));
  await p.capture(`${dossier}/clair.png`);
  await p.sombre(true);
  await p.capture(`${dossier}/sombre.png`);
  verifier("Aucune erreur console", p.erreurs.length === 0, p.erreurs.join(" | "));
} finally {
  await nav.fermer();
}
const echecs = resultats.filter((r) => !r.ok).length;
console.log(`${resultats.length - echecs}/${resultats.length} vérifications réussies.`);
process.exit(echecs ? 1 : 0);
