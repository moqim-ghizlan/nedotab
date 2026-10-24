// Loads dist/extension in a real Chrome (headless), runs the end-to-end checks and saves
// screenshots to docs/v<x.y>/evidence/. Usage: npm run verifier:navigateur [-- --visible]
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { genererImagesTest } from "./generer-images-test.mjs";
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
    JSON.stringify(manifeste.permissions) === JSON.stringify(["storage", "favicon"]) &&
      !manifeste.host_permissions,
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

  // V1.3 — icons without the site permission (Google, then letter badge)
  const blocPermission = await p.eval(`(async () => {
    document.querySelector("[data-action='ajouter']").click();
    await new Promise((r) => setTimeout(r, 300));
    const visible = !document.querySelector(".permission").hidden;
    document.querySelector("dialog").close();
    return visible;
  })()`);
  verifier("Permission des sites proposée (non demandée à l'installation)", blocPermission);
  await attendre(6000);
  const sourceGithub = await p.eval(
    `[...document.querySelectorAll(".tuile--site")].find((t) => t.href.includes("github"))?.querySelector("img")?.src || ""`,
  );
  verifier(
    "Sans permission : icône via Google",
    sourceGithub.includes("google.com/s2/favicons"),
    sourceGithub,
  );
  await ajouterSite(p, "nexistepas.invalid");
  await attendre(3000);
  verifier(
    "Site inexistant : pastille lettre",
    await p.eval(
      `!!document.querySelector(".tuile--site:last-of-type, .case:nth-last-child(2) .tuile-icone--lettre")`,
    ),
  );
  // V1.4 — context menu, edit, icons, delete and undo
  const idDe = (texte) =>
    p.eval(
      `[...document.querySelectorAll(".tuile--site")].find((t) => t.textContent.includes(${JSON.stringify(texte)}))?.dataset.id`,
    );
  const ordre = () =>
    p.eval(`[...document.querySelectorAll(".tuile--site")].map((t) => t.dataset.id).join()`);
  const rectTuile = (id) =>
    p.eval(
      `(() => { const r = document.querySelector('.tuile[data-id="${id}"]').getBoundingClientRect(); return [r.x + r.width / 2, r.y + 20]; })()`,
    );
  const idGithub = await idDe("github");
  const [gx, gy] = await rectTuile(idGithub);
  await p.souris("mousePressed", gx, gy, { button: "right", buttons: 2 });
  await p.souris("mouseReleased", gx, gy, { button: "right", buttons: 0 });
  await attendre(150);
  verifier("Clic droit sur une tuile : menu", await p.eval(`!!document.querySelector(".menu")`));
  await p.capture(`${dossier}/menu.png`);
  await p.touche("Escape", { vk: 27 });
  await attendre(100);
  verifier("Échap ferme le menu", await p.eval(`!document.querySelector(".menu")`));
  await p.souris("mousePressed", 40, 700, { button: "right", buttons: 2 });
  await p.souris("mouseReleased", 40, 700, { button: "right", buttons: 0 });
  await attendre(100);
  verifier(
    "Clic droit sur le fond : pas de menu NedoTab",
    await p.eval(`!document.querySelector(".menu")`),
  );
  await p.touche("Escape", { vk: 27 });

  // F2 → edit: rename and letter ✈️ on blue
  await p.eval(`document.querySelector('.tuile[data-id="${idGithub}"]').focus()`);
  await p.touche("F2", { vk: 113 });
  await attendre(200);
  verifier(
    "F2 ouvre « Modifier le site »",
    await p.eval(`!!document.getElementById("edition-titre")`),
  );
  await p.eval(`document.getElementById("edition-titre").select()`);
  await p.taper("Code");
  await p.eval(`document.querySelector('.segment[data-mode="lettre"]').click()`);
  await p.eval(
    `(() => { const c = document.querySelector(".champ-lettre"); c.value = ""; c.focus(); })()`,
  );
  await p.taper("✈️");
  await p.eval(`document.querySelector('.nuance[data-couleur="#3a5ba0"]').click()`);
  await p.capture(`${dossier}/edition-lettre.png`);
  await p.eval(`document.querySelector("dialog form").requestSubmit()`);
  await attendre(200);
  const github = await p.eval(
    `(() => { const t = document.querySelector('.tuile[data-id="${idGithub}"]'); return [t.textContent, t.querySelector(".tuile-icone").style.background]; })()`,
  );
  verifier(
    "Renommé « Code », lettre ✈️ sur fond bleu",
    github[0] === "✈️Code" && github[1].includes("58, 91, 160"),
    github.join(" / "),
  );

  // Imported images: 3.5 MB simple picture accepted, pure noise refused
  const images = genererImagesTest(mkdtempSync(join(tmpdir(), "nedotab-img-")));
  const idWiki = await idDe("wikipedia");
  await p.eval(`document.querySelector('.tuile[data-id="${idWiki}"]').focus()`);
  await p.touche("F2", { vk: 113 });
  await attendre(200);
  await p.eval(`document.querySelector('.segment[data-mode="import"]').click()`);
  await p.envoyer("DOM.enable");
  await p.fichiers('input[type="file"]', [images.bruit]);
  await attendre(1500);
  const refus = await p.eval(
    `document.querySelector('.icone-panneau[data-mode="import"] .icone-etat').textContent`,
  );
  verifier(
    "Photo de bruit (469 Ko) : compressée sous 16 Ko",
    /Ko$/.test(refus) && parseFloat(refus) <= 16,
    refus,
  );
  await p.fichiers('input[type="file"]', [images.simple]);
  await attendre(1500);
  const accepte = await p.eval(
    `document.querySelector('.icone-panneau[data-mode="import"] .icone-etat').textContent`,
  );
  verifier("PNG de 3,5 Mo redimensionné et accepté", /Ko$/.test(accepte), accepte);
  await p.capture(`${dossier}/edition-import.png`);
  await p.eval(`document.querySelector("dialog form").requestSubmit()`);
  await attendre(200);
  const srcWiki = await p.eval(
    `document.querySelector('.tuile[data-id="${idWiki}"] img')?.src || ""`,
  );
  verifier(
    "Icône importée stockée en WebP",
    srcWiki.startsWith("data:image/webp"),
    srcWiki.slice(0, 30),
  );

  // Delete then undo: same place; two deletions in a row: only the last can be undone
  const ordreAvant = await ordre();
  const idMonde = await idDe("lemonde");
  await p.eval(`document.querySelector('.tuile[data-id="${idMonde}"]').focus()`);
  await p.touche("Delete", { vk: 46 });
  await attendre(150);
  verifier(
    "Suppr supprime, toast affiché",
    (await p.eval(`document.querySelector(".toast")?.textContent || ""`)).includes("supprimé"),
  );
  verifier(
    "Focus sur la tuile suivante",
    await p.eval(`document.activeElement?.classList.contains("tuile")`),
  );
  await p.capture(`${dossier}/toast.png`);
  await p.eval(`document.querySelector(".toast-action").click()`);
  await attendre(150);
  verifier("Annuler : la tuile revient à la même place", (await ordre()) === ordreAvant);
  const idOsm = await idDe("openstreetmap");
  const idMdn = await idDe("mozilla");
  await p.eval(`document.querySelector('.tuile[data-id="${idOsm}"]').focus()`);
  await p.touche("Delete", { vk: 46 });
  await attendre(100);
  await p.eval(`document.querySelector('.tuile[data-id="${idMdn}"]').focus()`);
  await p.touche("Delete", { vk: 46 });
  await attendre(100);
  await p.eval(`document.querySelector(".toast-action").click()`);
  await attendre(150);
  const apres = await ordre();
  verifier(
    "Deux suppressions : seule la dernière est annulable",
    apres.includes(idMdn) && !apres.includes(idOsm),
  );
  await attendre(900);
  verifier(
    "Modification visible dans l'autre onglet",
    (await p2.eval(`document.querySelector('.tuile[data-id="${idGithub}"]')?.textContent`)) ===
      "✈️Code",
  );

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

// V1.3 — with the site permission granted (test copy with host_permissions)
{
  const copie = mkdtempSync(join(tmpdir(), "nedotab-ext-"));
  cpSync("dist/extension", copie, { recursive: true });
  const m = JSON.parse(readFileSync(join(copie, "manifest.json"), "utf8"));
  m.host_permissions = m.optional_host_permissions;
  writeFileSync(join(copie, "manifest.json"), JSON.stringify(m));
  const nav2 = await lancerChrome();
  try {
    const id = await nav2.chargerExtension(copie);
    const p = await nav2.ouvrir(`chrome-extension://${id}/newtab.html`);
    await p.sombre(false);
    await attendre(300);
    await p.eval(`document.querySelector("[data-action='ajouter']").click()`);
    await attendre(150);
    await p.taper("lemonde.fr");
    await p.eval(`document.getElementById("ajout-url").blur()`);
    await attendre(5000);
    const titre = await p.eval(`document.getElementById("ajout-titre").value`);
    verifier("Avec permission : titre lu dans la page", titre === "Le Monde.fr", titre);
    await p.capture(`${dossier}/apercu-lemonde.png`);
    await p.eval(`document.querySelector("dialog form").requestSubmit()`);
    for (const site of ["github.com", "wikipedia.org", "youtube.com"]) {
      await ajouterSite(p, site);
    }
    await attendre(7000);
    const sources = await p.eval(
      `[...document.querySelectorAll(".tuile--site")].map((t) => [t.textContent, t.querySelector("img")?.src || "lettre"])`,
    );
    for (const [nom, src] of sources) console.log(`      ${nom} → ${src}`);
    verifier(
      "Avec permission : icônes des sites eux-mêmes",
      sources.filter(([, src]) => src !== "lettre" && !src.includes("google.com/s2")).length >= 3,
    );
    await p.capture(`${dossier}/icones-reelles.png`);
    verifier(
      "Aucune erreur console (avec permission)",
      p.erreurs.length === 0,
      p.erreurs.join(" | "),
    );
  } finally {
    await nav2.fermer();
    rmSync(copie, { recursive: true, force: true });
  }
}
const echecs = resultats.filter((r) => !r.ok).length;
console.log(`${resultats.length - echecs}/${resultats.length} vérifications réussies.`);
process.exit(echecs ? 1 : 0);
