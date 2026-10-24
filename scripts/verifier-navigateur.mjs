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
  verifier("Version affichée", texte.includes(version));
  verifier("Grille de tuiles", (await p.eval("document.querySelectorAll('.tuile').length")) >= 6);
  await p.eval("document.querySelector('.tuile').focus()");
  await p.touche("ArrowRight", { vk: 39 });
  verifier(
    "Flèche droite déplace le focus",
    await p.eval("document.activeElement === document.querySelectorAll('.tuile')[1]"),
  );
  await p.taille(400, 800);
  await attendre(200);
  verifier(
    "Pas de défilement horizontal à 400 px",
    await p.eval("document.documentElement.scrollWidth <= 400"),
  );
  await p.capture(`${dossier}/mobile-400.png`);
  await p.taille(1280, 800);
  await p.sombre(false);
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
