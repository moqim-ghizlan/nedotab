// V1.9 browser scenario: settings panel, themes, plain colour, gradient, imported picture
// in IndexedDB (replaced, not accumulated), veil and blur, startup cache, display time.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { genererImagesTest } from "../generer-images-test.mjs";
import { attendre } from "../navigateur.mjs";

export async function scenarioApparence({ nav, url, verifier, dossier }) {
  const p = await nav.ouvrir(url);
  await p.sombre(false);
  await p.eval(`chrome.storage.local.set({ etat: { versionSchema: 1, grille: [
    { id: "a", type: "site", titre: "github.com", url: "https://github.com", icone: { type: "lettre", couleur: "#2c6b5a" }, creeLe: 0 },
    { id: "b", type: "site", titre: "lemonde.fr", url: "https://lemonde.fr", icone: { type: "lettre", couleur: "#3a5ba0" }, creeLe: 0 }
  ], reglages: { theme: "auto", fond: { type: "aucun" } }, ecritPar: "test", majLe: 1 } })`);
  await p.aller(url);
  await attendre(300);
  const theme = () => p.eval(`document.documentElement.dataset.theme`);
  const segment = (groupe, valeur) =>
    p.eval(
      `document.querySelector('.reglages [aria-label="${groupe}"] [data-valeur="${valeur}"]').click()`,
    );
  const fond = () =>
    p.eval(
      `(() => { const s = getComputedStyle(document.getElementById("fond")); return { couleur: s.backgroundColor, image: s.backgroundImage, classe: document.body.className }; })()`,
    );
  const etatReglages = () =>
    // The picture background is device-only (reglagesAppareil, schema 2).
    p.eval(
      `chrome.storage.local.get("etat").then(({ etat }) => ({ ...etat.reglages, fond: etat.reglagesAppareil?.fond ?? etat.reglages.fond }))`,
    );

  // Panel
  await p.eval(`document.querySelector(".bouton-reglages").click()`);
  await attendre(200);
  const sections = await p.eval(
    `[...document.querySelectorAll(".reglages-section h3")].map((h) => h.textContent).join(", ")`,
  );
  verifier(
    "Panneau Réglages en sections",
    sections === "Compte, Apparence, Sauvegardes, Mes données, Autorisations, Stockage, À propos",
    sections,
  );
  verifier(
    "La grille reste visible (panneau non modal)",
    await p.eval(`!document.querySelector(".reglages").matches(":modal")`),
  );

  // Themes
  await segment("Thème", "sombre");
  await attendre(100);
  verifier("Thème sombre", (await theme()) === "sombre");
  await segment("Thème", "clair");
  await attendre(100);
  verifier("Thème clair", (await theme()) === "clair");
  await segment("Thème", "auto");
  await p.sombre(true);
  await attendre(150);
  verifier("Automatique : suit le système en direct", (await theme()) === "sombre");
  await p.sombre(false);
  await attendre(150);
  verifier("Automatique : retour au clair", (await theme()) === "clair");

  // Plain colour
  await segment("Type de fond", "couleur");
  await p.eval(`document.querySelector('.nuance[data-couleur="#1e293b"]').click()`);
  await attendre(150);
  let f = await fond();
  verifier(
    "Couleur unie appliquée",
    f.couleur === "rgb(30, 41, 59)" && f.classe.includes("fond-sombre"),
    JSON.stringify(f),
  );
  const couleurTitre = await p.eval(
    `getComputedStyle(document.querySelector(".tuile-titre")).color`,
  );
  verifier("Titres clairs sur fond sombre", couleurTitre === "rgb(255, 255, 255)", couleurTitre);
  await p.capture(`${dossier}/fond-couleur.png`);

  // Gradient
  await segment("Type de fond", "degrade");
  await p.eval(`document.querySelector('.degrade[data-degrade="aurore"]').click()`);
  await attendre(150);
  f = await fond();
  verifier(
    "Dégradé appliqué, texte foncé",
    f.image.startsWith("linear-gradient") && f.classe.includes("fond-clair"),
    f.image.slice(0, 40),
  );
  await p.capture(`${dossier}/fond-degrade.png`);

  // Picture: stored in IndexedDB, only a reference in the state
  const images = genererImagesTest(mkdtempSync(join(tmpdir(), "nedotab-fond-")));
  await segment("Type de fond", "image");
  await p.envoyer("DOM.enable");
  await p.fichiers('.reglages input[type="file"][accept^="image/"]', [images.simple]);
  await attendre(2500);
  let r = await etatReglages();
  verifier(
    "Image : référence locale et couleur dominante dans l'état",
    r.fond.type === "image" &&
      r.fond.ref.startsWith("local:") &&
      /^#[0-9a-f]{6}$/.test(r.fond.dominante),
    JSON.stringify(r.fond),
  );
  const tailleEtat = await p.eval(
    `chrome.storage.local.get(null).then((t) => JSON.stringify(t).length)`,
  );
  verifier("Aucune image dans chrome.storage", tailleEtat < 5000, `${tailleEtat} caractères`);
  const cles = () =>
    p.eval(
      `new Promise((ok) => { const r = indexedDB.open("nedotab"); r.onsuccess = () => { const q = r.result.transaction("fichiers").objectStore("fichiers").getAllKeys(); q.onsuccess = () => ok(q.result); }; })`,
    );
  verifier("Image dans IndexedDB", (await cles()).length === 1);
  f = await fond();
  verifier("Image affichée", f.image.startsWith('url("blob:'), f.image.slice(0, 30));
  const refAvant = r.fond.ref;
  await p.fichiers('.reglages input[type="file"][accept^="image/"]', [images.bruit]);
  await attendre(2500);
  r = await etatReglages();
  const clesApres = await cles();
  verifier(
    "Remplacement : l'ancienne image est supprimée",
    r.fond.ref !== refAvant &&
      clesApres.length === 1 &&
      clesApres[0] === `fond:${r.fond.ref.slice(6)}`,
    JSON.stringify(clesApres),
  );

  // Veil and blur, live
  await p.eval(
    `(() => { const v = document.getElementById("reglage-voile"); v.value = "0.6"; v.dispatchEvent(new Event("input")); const b = document.getElementById("reglage-flou"); b.value = "8"; b.dispatchEvent(new Event("input")); })()`,
  );
  await attendre(200);
  const effets = await p.eval(
    `(() => { const s = getComputedStyle(document.getElementById("fond")); return [s.getPropertyValue("--voile-fond"), s.filter]; })()`,
  );
  verifier(
    "Voile et flou en direct",
    effets[0].trim() === "0.6" && effets[1] === "blur(8px)",
    effets.join(" / "),
  );
  await p.capture(`${dossier}/fond-image.png`);

  // Autorisations and storage sections
  const autorisation = await p.eval(
    `[...document.querySelectorAll(".reglages-section")].find((s) => s.querySelector("h3").textContent === "Autorisations").textContent`,
  );
  verifier(
    "Autorisations : état et bouton",
    autorisation.includes("non accordé") && autorisation.includes("Autoriser"),
    autorisation,
  );
  const stockage = await p.eval(
    `[...document.querySelectorAll(".reglages-section")].find((s) => s.querySelector("h3").textContent === "Stockage").textContent`,
  );
  verifier("Stockage : taille des données", /Données : [\d.,]+ Ko/.test(stockage), stockage);
  await p.touche("Escape", { vk: 27 });
  await attendre(300);
  verifier("Échap ferme le panneau", await p.eval(`!document.querySelector(".reglages")`));

  // Startup: theme + dominant colour applied at once, image afterwards; display time
  await attendre(500);
  const mesures = [];
  for (let i = 0; i < 10; i++) {
    const q = await nav.ouvrir(url);
    await attendre(150);
    const m = await q.eval(`(() => {
      const fond = document.getElementById("fond");
      return { couleur: fond && getComputedStyle(fond).backgroundColor, rendu: performance.getEntriesByName("nedotab:premier-rendu")[0]?.duration };
    })()`);
    mesures.push(m);
    await nav.envoyer("Target.closeTarget", { targetId: q.targetId });
  }
  const sansCouleur = mesures.filter((m) => !m.couleur || m.couleur === "rgba(0, 0, 0, 0)");
  const temps = mesures
    .map((m) => m.rendu)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  verifier("10 onglets : couleur de fond présente dès l'ouverture", sansCouleur.length === 0);
  verifier(
    "Premier rendu de la grille < 100 ms (médiane)",
    temps[Math.floor(temps.length / 2)] < 100,
    `médiane ${temps[Math.floor(temps.length / 2)]?.toFixed(1)} ms, max ${temps.at(-1)?.toFixed(1)} ms`,
  );

  // Background changed elsewhere while the settings are open: the panel follows the type
  await p.premierPlan();
  await p.aller(url);
  await attendre(400);
  await p.eval(`document.querySelector(".bouton-reglages").click()`);
  await attendre(300);
  const autre = await nav.ouvrir(url);
  await attendre(400);
  await autre.eval(`document.querySelector(".bouton-reglages").click()`);
  await attendre(300);
  const typeVoulu =
    (await p.eval(
      `document.querySelector('[aria-label="Type de fond"] [aria-checked="true"]').dataset.valeur`,
    )) === "degrade"
      ? "couleur"
      : "degrade";
  await autre.eval(
    `document.querySelector('[aria-label="Type de fond"] [data-valeur="${typeVoulu}"]').click()`,
  );
  await attendre(1200);
  await p.premierPlan();
  const panneau = await p.eval(`({
    choisi: document.querySelector('[aria-label="Type de fond"] [aria-checked="true"]').dataset.valeur,
    couleur: !document.querySelector(".nuancier--fond").closest("[hidden]"),
    degrade: !document.querySelector(".degrades").hidden,
  })`);
  verifier(
    "Fond changé dans un autre onglet, réglages ouverts : le bon panneau s'affiche",
    panneau.choisi === typeVoulu &&
      panneau[typeVoulu] &&
      !panneau[typeVoulu === "degrade" ? "couleur" : "degrade"],
    JSON.stringify(panneau),
  );
  verifier("Aucune erreur console (apparence)", p.erreurs.length === 0, p.erreurs.join(" | "));
  return { temps };
}
