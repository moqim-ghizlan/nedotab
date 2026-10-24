// V1.8 browser scenario: drag between levels — site + site held 500 ms → folder,
// drop into a folder, breadcrumb drop, refused 4th level, undo, fast moves, reload.
import { attendre } from "../navigateur.mjs";

const site = (id, domaine) => ({
  id,
  type: "site",
  titre: domaine,
  url: `https://${domaine}`,
  icone: { type: "lettre", couleur: "#2c6b5a" },
  creeLe: 0,
});
const dossier = (id, titre, items) => ({ id, type: "dossier", titre, items, creeLe: 0 });

function etatDeDepart() {
  return {
    versionSchema: 1,
    grille: [
      site("github", "github.com"),
      site("gitlab", "gitlab.com"),
      site("wiki", "wikipedia.org"),
      dossier("travail", "Travail", [
        dossier("clients", "Clients", [
          site("c1", "client1.fr"),
          dossier("projets", "Projets", [site("p1", "projet1.fr"), site("p2", "projet2.fr")]),
        ]),
      ]),
      site("monde", "lemonde.fr"),
      site("osm", "openstreetmap.org"),
    ],
    reglages: { theme: "auto", fond: { type: "aucun" } },
  };
}

export async function scenarioFusion({ nav, url, verifier, dossier: evidence }) {
  const p = await nav.ouvrir(url);
  await p.sombre(false);
  await p.eval(
    `chrome.storage.local.set({ etat: { ...${JSON.stringify(etatDeDepart())}, ecritPar: "test", majLe: 1 } })`,
  );
  await p.aller(url);
  await attendre(300);

  const portee = (dansFenetre) =>
    dansFenetre ? ".grille--dossier" : ".grille:not(.grille--dossier)";
  const centre = (id, dansFenetre = false) =>
    p.eval(
      `(() => { const r = document.querySelector('${portee(dansFenetre)} .tuile[data-id="${id}"] .tuile-icone').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`,
    );
  const centreSelecteur = (sel) =>
    p.eval(
      `(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`,
    );
  /** Drags from (ax, ay) to (x, y), then holds `tenir` ms before releasing. */
  async function glisser([ax, ay], [x, y], tenir = 0) {
    await p.souris("mouseMoved", ax, ay, { buttons: 0 });
    await p.souris("mousePressed", ax, ay);
    for (let i = 1; i <= 10; i++) {
      await p.souris("mouseMoved", ax + ((x - ax) * i) / 10, ay + ((y - ay) * i) / 10);
      await attendre(20);
    }
    if (tenir) {
      // small moves inside the central zone while holding, like a real hand
      for (let t = 0; t < tenir; t += 100) {
        await p.souris("mouseMoved", x + ((t / 100) % 2), y);
        await attendre(100);
      }
    }
    await p.souris("mouseReleased", x, y, { buttons: 0 });
    await attendre(350);
  }
  const etatTexte = () =>
    p.eval(`chrome.storage.local.get("etat").then(() => 0) && (() => {
      const texte = (l) => l.map((e) => e.type === "dossier" ? e.titre + "[" + texte(e.items) + "]" : e.id).join(" ");
      return [...document.querySelectorAll(".grille:not(.grille--dossier) > li > .tuile[data-id]")].length;
    })()`);
  const nbSites = () =>
    p.eval(
      `chrome.storage.local.get("etat").then(({ etat }) => { let n = 0; const v = (l) => l.forEach((e) => e.type === "site" ? n++ : v(e.items)); v(etat.grille); return n; })`,
    );
  const structure = () =>
    p.eval(
      `chrome.storage.local.get("etat").then(({ etat }) => { const t = (l) => l.map((e) => e.type === "dossier" ? e.titre + "[" + t(e.items) + "]" : e.id).join(" "); return t(etat.grille); })`,
    );
  const fermerFenetre = async () => {
    for (let i = 0; i < 4 && (await p.eval(`!!document.querySelector(".fenetre-dossier")`)); i++) {
      await p.touche("Escape", { vk: 27 });
      await attendre(150);
    }
  };
  void etatTexte;

  // 1. GitHub held over GitLab: halo then folder, opened with the title being edited
  const [gx, gy] = await centre("github");
  const [lx, ly] = await centre("gitlab");
  await p.souris("mouseMoved", gx, gy, { buttons: 0 });
  await p.souris("mousePressed", gx, gy);
  for (let i = 1; i <= 10; i++) {
    await p.souris("mouseMoved", gx + ((lx - gx) * i) / 10, gy + ((ly - gy) * i) / 10);
    await attendre(20);
  }
  for (let t = 0; t < 700; t += 100) {
    await p.souris("mouseMoved", lx + ((t / 100) % 2), ly);
    await attendre(100);
  }
  verifier(
    "Survol maintenu : halo sur la cible",
    await p.eval(`!!document.querySelector('.tuile[data-id="gitlab"].cible--fusion')`),
  );
  await p.capture(`${evidence}/halo-fusion.png`);
  await p.souris("mouseReleased", lx, ly, { buttons: 0 });
  await attendre(400);
  verifier(
    "Dossier créé et ouvert, titre en édition",
    await p.eval(
      `!!document.querySelector(".fenetre-dossier") && document.activeElement?.classList.contains("fenetre-titre-champ")`,
    ),
  );
  const contenu = await p.eval(
    `[...document.querySelectorAll(".grille--dossier .tuile[data-id]")].map((t) => t.dataset.id).join()`,
  );
  verifier("Le dossier contient [cible, source]", contenu === "gitlab,github", contenu);
  await p.taper("Code");
  await p.touche("Enter", { vk: 13, texte: "\r" });
  await attendre(200);
  await p.capture(`${evidence}/fusion-ouverte.png`);
  await fermerFenetre();
  verifier(
    "Dossier « Code » à la place de GitLab",
    (await structure()).startsWith("Code[gitlab github] wiki"),
    await structure(),
  );

  // 2. Undo of the merge is available from the toast
  // (the toast was replaced by the rename? no: rename does not use toasts)
  const toastFusion = await p.eval(
    `[...document.querySelectorAll(".toast")].map((t) => t.textContent).join("|")`,
  );
  verifier("Toast « Dossier créé — Annuler »", toastFusion.includes("Dossier créé"), toastFusion);

  // 3. Fast drag over other tiles without stopping: plain reorder, no folder
  const avantRapide = await structure();
  await glisser(await centre("wiki"), await centre("osm"));
  const apresRapide = await structure();
  verifier(
    "Passage rapide : simple réordonnancement",
    !apresRapide.includes("Dossier[") && apresRapide !== avantRapide,
    apresRapide,
  );

  // 4. A site held over a folder goes inside; preview updated
  await glisser(await centre("monde"), await centre("travail"), 700);
  verifier(
    "Site déposé dans un dossier",
    (await structure()).includes("Travail[Clients[c1 Projets[p1 p2]] monde]"),
    await structure(),
  );
  verifier(
    "Aperçu mis à jour",
    (await p.eval(
      `document.querySelectorAll('.tuile[data-id="travail"] .mini:not(.mini--vide)').length`,
    )) === 4,
  );

  // 5. Fourth level refused: in Projets (level 3), p1 held over p2 → red, toast, unchanged
  await p.eval(`document.querySelector('.tuile[data-id="travail"]').click()`);
  await attendre(250);
  await p.eval(`document.querySelector('.grille--dossier .tuile[data-id="clients"]').click()`);
  await attendre(250);
  await p.eval(`document.querySelector('.grille--dossier .tuile[data-id="projets"]').click()`);
  await attendre(300);
  const avantRefus = await structure();
  const [p1x, p1y] = await centre("p1", true);
  const [p2x, p2y] = await centre("p2", true);
  await p.souris("mouseMoved", p1x, p1y, { buttons: 0 });
  await p.souris("mousePressed", p1x, p1y);
  for (let i = 1; i <= 10; i++) {
    await p.souris("mouseMoved", p1x + ((p2x - p1x) * i) / 10, p1y + ((p2y - p1y) * i) / 10);
    await attendre(20);
  }
  for (let t = 0; t < 700; t += 100) {
    await p.souris("mouseMoved", p2x + ((t / 100) % 2), p2y);
    await attendre(100);
  }
  verifier(
    "4ᵉ niveau : cible en rouge",
    await p.eval(
      `!!document.querySelector('.grille--dossier .tuile[data-id="p2"].cible--refusee')`,
    ),
  );
  await p.capture(`${evidence}/cible-refusee.png`);
  await p.souris("mouseReleased", p2x, p2y, { buttons: 0 });
  await attendre(400);
  const toastRefus = await p.eval(
    `[...document.querySelectorAll(".toast")].map((t) => t.textContent).join("|")`,
  );
  verifier(
    "4ᵉ niveau : toast et rien ne change",
    toastRefus.includes("3 niveaux") && (await structure()) === avantRefus,
    toastRefus,
  );

  // 6. Breadcrumb drop: p1 held over "Accueil" goes up to the home grid
  const [ax, ay] = await centreSelecteur('.ariane-segment[data-cible=""]');
  await glisser(await centre("p1", true), [ax, ay], 600);
  verifier(
    "Dépôt sur « Accueil » du fil d'Ariane",
    (await structure()).endsWith("p1") || (await structure()).includes(" p1"),
    await structure(),
  );
  verifier(
    "La fenêtre reste au niveau courant",
    (await p.eval(`document.querySelector(".fenetre-titre")?.textContent`)) === "Projets",
  );
  const toastAriane = await p.eval(
    `[...document.querySelectorAll(".toast")].map((t) => t.textContent).join("|")`,
  );
  verifier(
    "Toast « Déplacé dans Accueil — Annuler »",
    toastAriane.includes("Déplacé dans Accueil"),
    toastAriane,
  );
  await p.eval(
    `[...document.querySelectorAll(".toast")].find((t) => t.textContent.includes("Déplacé")).querySelector(".toast-action").click()`,
  );
  await attendre(900);
  verifier(
    "Annuler : p1 revient dans Projets",
    (await structure()).includes("Projets[p1 p2]"),
    await structure(),
  );

  // 7. Ctrl+Shift+↑: p2 goes up to Clients, after Projets
  await p.eval(`document.querySelector('.grille--dossier .tuile[data-id="p2"]').focus()`);
  await p.touche("ArrowUp", { vk: 38, modifiers: 2 | 8 });
  await attendre(900);
  verifier(
    "Ctrl+Maj+↑ remonte d'un niveau",
    (await structure()).includes("Clients[c1 Projets[p1] p2]"),
    await structure(),
  );
  await fermerFenetre();

  // 8. Twenty fast manipulations: no tile duplicated or lost
  const total = await nbSites();
  for (let i = 0; i < 20; i++) {
    const ids = await p.eval(
      `[...document.querySelectorAll(".grille:not(.grille--dossier) > li > .tuile[data-id]")].map((t) => t.dataset.id)`,
    );
    const a = ids[i % ids.length];
    const b = ids[(i * 3 + 1) % ids.length];
    if (a === b) continue;
    await glisser(await centre(a), await centre(b), i % 4 === 0 ? 650 : 0);
    await fermerFenetre();
  }
  await attendre(500);
  const totalApres = await nbSites();
  const ids = await p.eval(
    `chrome.storage.local.get("etat").then(({ etat }) => { const a = []; const v = (l) => l.forEach((e) => { a.push(e.id); if (e.items) v(e.items); }); v(etat.grille); return a; })`,
  );
  verifier(
    "20 manipulations rapides : aucun site perdu ou dupliqué",
    totalApres === total && new Set(ids).size === ids.length,
    `${total} → ${totalApres}`,
  );

  // 9. Reload: everything kept
  const avantRechargement = await structure();
  await p.aller(url);
  await attendre(300);
  verifier("Rechargement : tout est conservé", (await structure()) === avantRechargement);
  await p.capture(`${evidence}/apres-manipulations.png`);
  verifier("Aucune erreur console (fusion)", p.erreurs.length === 0, p.erreurs.join(" | "));
}
