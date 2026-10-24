// Screenshots of the real extension for the showcase site (site/public/captures/).
// Fresh Chrome profile in French, generic sites only (letter and emoji icons, no personal
// data, no network icons). Usage: npm run captures (after npm run build:extension)
import { mkdirSync } from "node:fs";
import { attendre, lancerChrome } from "./navigateur.mjs";

const SORTIE = "site/public/captures";
mkdirSync(SORTIE, { recursive: true });

const site = (id, titre, couleur, texte) => ({
  id,
  type: "site",
  titre,
  url: `https://${id}.example`,
  icone: texte ? { type: "lettre", couleur, texte } : { type: "lettre", couleur },
  creeLe: 0,
});
const dossier = (id, titre, items) => ({ id, type: "dossier", titre, items, creeLe: 0 });

const GRILLE = [
  site("encyclopedie", "Encyclopédie", "#4a5560"),
  site("courriel", "Courriel", "#1f6f8b", "✉️"),
  site("cartes", "Cartes", "#2f6e3b", "🗺️"),
  site("actualites", "Actualités", "#a33a3a"),
  site("meteo", "Météo", "#3a5ba0", "☀️"),
  dossier("travail", "Travail", [
    site("agenda", "Agenda", "#5b4ea8"),
    site("documents", "Documents", "#1f6f8b"),
    dossier("clients", "Clients", [
      site("dupont", "Dupont & fils", "#a2501c"),
      site("atelier", "L'Atelier", "#7d3f98"),
      dossier("projets", "Projets", [site("refonte", "Refonte 2026", "#2c6b5a")]),
    ]),
    site("compta", "Comptabilité", "#7a5c12"),
  ]),
  site("musique", "Musique", "#9c3b6e", "🎧"),
  site("recettes", "Recettes", "#a2501c", "🍲"),
  dossier("loisirs", "Loisirs", [
    site("velo", "Sorties vélo", "#4f6b1f"),
    site("cinema", "Cinéma", "#a33a3a"),
    site("lecture", "Lecture", "#5b4ea8"),
    site("jardin", "Jardin", "#2f6e3b"),
  ]),
  site("banque", "Banque", "#2c6b5a"),
  site("code", "Code", "#4a5560", "⌘"),
  site("photos", "Photos", "#1f6f8b", "📷"),
];

const etat = (reglages) => ({
  versionSchema: 1,
  grille: GRILLE,
  reglages: { theme: "clair", fond: { type: "aucun" }, ...reglages },
  ecritPar: "captures",
  majLe: Date.now(),
});

const nav = await lancerChrome({ largeur: 1024, hauteur: 640, langue: "fr" });
try {
  const id = await nav.chargerExtension();
  const url = `chrome-extension://${id}/newtab.html`;
  const p = await nav.ouvrir(url);
  await p.taille(1024, 640);
  const preparer = async (reglages, sombre = false) => {
    await p.sombre(sombre);
    await p.eval(`chrome.storage.local.set({ etat: ${JSON.stringify(etat(reglages))} })`);
    await p.aller(url);
    await attendre(500);
    await p.eval(`document.activeElement?.blur()`);
  };

  await preparer({ theme: "clair", fond: { type: "degrade", valeur: "brume" } });
  await p.capture(`${SORTIE}/accueil-clair.webp`);

  await preparer({ theme: "sombre", fond: { type: "degrade", valeur: "nuit" } }, true);
  await p.capture(`${SORTIE}/accueil-sombre.webp`);

  // Folder window at level 3 with its breadcrumb
  await preparer({ theme: "clair", fond: { type: "degrade", valeur: "brume" } });
  await p.eval(`document.querySelector('.tuile[data-id="travail"]').click()`);
  await attendre(250);
  await p.eval(`document.querySelector('.grille--dossier .tuile[data-id="clients"]').click()`);
  await attendre(400);
  await p.eval(`document.activeElement?.blur()`);
  await p.capture(`${SORTIE}/dossiers.webp`);

  // Instant search
  await preparer({ theme: "clair", fond: { type: "degrade", valeur: "sable" } });
  await p.eval(`document.getElementById("recherche").focus()`);
  await p.taper("re");
  await attendre(200);
  await p.capture(`${SORTIE}/recherche.webp`);

  // Drag: hold over another tile → folder halo
  await preparer({ theme: "clair", fond: { type: "degrade", valeur: "aurore" } });
  const centre = (tid) =>
    p.eval(
      `(() => { const r = document.querySelector('.tuile[data-id="${tid}"] .tuile-icone').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`,
    );
  const [ax, ay] = await centre("musique");
  const [bx, by] = await centre("meteo");
  await p.souris("mouseMoved", ax, ay, { buttons: 0 });
  await p.souris("mousePressed", ax, ay);
  for (let i = 1; i <= 12; i++) {
    await p.souris("mouseMoved", ax + ((bx - ax) * i) / 12, ay + ((by - ay) * i) / 12);
    await attendre(25);
  }
  for (let t = 0; t < 700; t += 100) {
    await p.souris("mouseMoved", bx + ((t / 100) % 2), by);
    await attendre(100);
  }
  await p.capture(`${SORTIE}/glisser.webp`);
  await p.souris("mouseReleased", 1300, 800, { buttons: 0 });
  await attendre(300);

  // Backgrounds and settings panel
  await preparer({ theme: "sombre", fond: { type: "degrade", valeur: "crepuscule" } }, true);
  await p.eval(`document.querySelector(".bouton-reglages").click()`);
  await attendre(300);
  await p.eval(`document.activeElement?.blur()`);
  await p.capture(`${SORTIE}/reglages.webp`);

  // Edit dialog with the icon editor
  await preparer({ theme: "clair", fond: { type: "aucun" } });
  await p.eval(`document.querySelector('.tuile[data-id="meteo"]').focus()`);
  await p.touche("F2", { vk: 113 });
  await attendre(300);
  await p.eval(`document.querySelector('.segment[data-mode="lettre"]').click()`);
  await attendre(150);
  await p.eval(`document.activeElement?.blur()`);
  await p.capture(`${SORTIE}/edition.webp`);

  // Open Graph image 1200 x 630
  await p.taille(1200, 630);
  await preparer({ theme: "clair", fond: { type: "degrade", valeur: "lagon" } });
  await p.capture(`${SORTIE}/og-image.png`);
  await p.taille(1024, 640);

  // Installation guide: chrome://extensions in developer mode, with NedoTab loaded
  const ext = await nav.ouvrir("chrome://extensions/");
  await ext.taille(1280, 800);
  await ext.sombre(false);
  await attendre(800);
  await ext
    .eval(`chrome.developerPrivate.updateProfileConfiguration({ inDeveloperMode: true })`)
    .catch(() => {});
  await attendre(800);
  await ext.capture(`${SORTIE}/installation-extensions.webp`);
  console.log("Captures écrites dans", SORTIE);
} finally {
  await nav.fermer();
}
