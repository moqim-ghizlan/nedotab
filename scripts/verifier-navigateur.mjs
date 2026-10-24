// Loads dist/extension in a real Chrome (headless), runs the end-to-end checks and saves
// screenshots to docs/v<x.y>/evidence/. Usage: npm run verifier:navigateur [-- --visible]
import { readFileSync } from "node:fs";
import { lancerChrome, attendre } from "./navigateur.mjs";

const version = JSON.parse(readFileSync("dist/extension/manifest.json", "utf8")).version;
const dossier = `docs/v${version.split(".").slice(0, 2).join(".")}/evidence`;
const resultats = [];
const verifier = (nom, ok, detail = "") => {
  resultats.push({ nom, ok: !!ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${nom}${detail ? ` (${detail})` : ""}`);
};

/** Opens the add dialog, types a URL (and title) and submits with Enter. */
async function ajouterSite(p, url, titre) {
  await p.eval(`document.querySelector("[data-action='ajouter']:not([hidden] *)").click()`);
  await attendre(150);
  await p.taper(url);
  if (titre) {
    await p.eval(`document.getElementById("ajout-titre").focus()`);
    await p.taper(titre);
  }
  await p.touche("Enter", { vk: 13, texte: "\r" });
  await attendre(200);
}

const nombreTuiles = (p) => p.eval(`document.querySelectorAll(".tuile--site").length`);

const nav = await lancerChrome({ headless: !process.argv.includes("--visible") });
try {
  const id = await nav.chargerExtension();
  const url = `chrome-extension://${id}/newtab.html`;
  verifier("ID d'extension stable", id === "imegmpimokhlnlhcmaogimnlgcfgefnn", id);
  const p = await nav.ouvrir(url);
  await p.sombre(false);
  await attendre(300);

  // V1.0
  verifier("Version affichée", (await p.eval("document.body.innerText")).includes(version));
  const manifeste = await p.eval("chrome.runtime.getManifest()");
  verifier(
    "Permissions minimales",
    JSON.stringify(manifeste.permissions) === JSON.stringify(["storage"]),
    JSON.stringify(manifeste.permissions),
  );

  // V1.2 — empty state
  verifier(
    "État vide au premier lancement",
    await p.eval(`!document.querySelector(".vide").hidden`),
  );
  await p.capture(`${dossier}/vide.png`);

  // V1.2 — refused URL
  await ajouterSite(p, "javascript:alert(1)");
  const erreur = await p.eval(`document.getElementById("ajout-url-erreur")?.textContent`);
  verifier("URL javascript: refusée", !!erreur, erreur);
  await p.capture(`${dossier}/url-refusee.png`);
  await p.touche("Escape", { vk: 27 });
  await attendre(150);

  // V1.2 — add with keyboard only
  await ajouterSite(p, "wikipedia.org");
  const titre = await p.eval(`document.querySelector(".tuile--site .tuile-titre")?.textContent`);
  verifier("Ajout de wikipedia.org (titre = domaine)", titre === "wikipedia.org", titre);
  verifier(
    "Focus sur la nouvelle tuile",
    await p.eval(`document.activeElement?.classList.contains("tuile--site")`),
  );
  for (const site of ["github.com", "lemonde.fr", "openstreetmap.org", "developer.mozilla.org"]) {
    await ajouterSite(p, site);
  }
  verifier("Cinq sites ajoutés", (await nombreTuiles(p)) === 5);

  // V1.1 — keyboard and layout
  await p.eval(`document.querySelector(".tuile").focus()`);
  await p.touche("ArrowRight", { vk: 39 });
  verifier(
    "Flèche droite déplace le focus",
    await p.eval(`document.activeElement === document.querySelectorAll(".tuile")[1]`),
  );

  // V1.2 — duplicate warning
  await ajouterSite(p, "https://www.github.com/");
  verifier(
    "Doublon signalé",
    await p.eval(`!document.querySelector(".champ-avertissement")?.hidden`),
  );
  await p.capture(`${dossier}/doublon.png`);
  await p.touche("Escape", { vk: 27 });
  await attendre(150);
  verifier("Doublon non ajouté sans confirmation", (await nombreTuiles(p)) === 5);

  // V1.2 — persistence and sync between tabs
  await attendre(500);
  const p2 = await nav.ouvrir(url);
  await attendre(300);
  verifier("Second onglet : sites relus", (await nombreTuiles(p2)) === 5);
  await ajouterSite(p2, "meteofrance.com");
  await attendre(900);
  verifier("Premier onglet synchronisé sans recharger", (await nombreTuiles(p)) === 6);
  await ajouterSite(p, "youtube.com");
  await attendre(900);
  verifier("Second onglet n'a rien perdu", (await nombreTuiles(p2)) === 7);
  await p.aller(url);
  await attendre(300);
  verifier("Rechargement : sites conservés", (await nombreTuiles(p)) === 7);

  await p.capture(`${dossier}/clair.png`);
  await p.sombre(true);
  await p.capture(`${dossier}/sombre.png`);
  await p.sombre(false);
  await p.taille(400, 800);
  await attendre(200);
  verifier(
    "Pas de défilement horizontal à 400 px",
    await p.eval("document.documentElement.scrollWidth <= 400"),
  );
  await p.capture(`${dossier}/mobile-400.png`);
  await p.taille(1280, 800);

  verifier(
    "Aucune erreur console",
    p.erreurs.length + p2.erreurs.length === 0,
    [...p.erreurs, ...p2.erreurs].join(" | "),
  );
} finally {
  await nav.fermer();
}
const echecs = resultats.filter((r) => !r.ok).length;
console.log(`${resultats.length - echecs}/${resultats.length} vérifications réussies.`);
process.exit(echecs ? 1 : 0);
