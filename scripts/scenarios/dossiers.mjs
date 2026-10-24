// V1.6 browser scenario: folders (create two ways, move into, open, rename in place,
// add inside, delete in both modes with undo, empty folder notice, two tabs).
import { attendre } from "../navigateur.mjs";

const SITES = ["wikipedia.org", "github.com", "lemonde.fr", "openstreetmap.org", "youtube.com"];

function etatDeDepart() {
  const grille = SITES.map((domaine, i) => ({
    id: `s${i}`,
    type: "site",
    titre: domaine,
    url: `https://${domaine}`,
    icone: { type: "lettre", couleur: "#2c6b5a" },
    creeLe: 0,
  }));
  return { versionSchema: 1, grille, reglages: { theme: "auto", fond: { type: "aucun" } } };
}

export async function scenarioDossiers({ nav, url, verifier, dossier }) {
  const p = await nav.ouvrir(url);
  await p.sombre(false);
  await p.eval(
    `chrome.storage.local.set({ etat: { ...${JSON.stringify(etatDeDepart())}, ecritPar: "test", majLe: 1 } })`,
  );
  await p.aller(url);
  await attendre(300);

  const ids = () =>
    p.eval(
      `[...document.querySelectorAll(".grille:not(.grille--dossier) > li > .tuile[data-id]")].map((t) => t.dataset.id).join()`,
    );
  const cliquerMenu = (texte) =>
    p.eval(
      `[...document.querySelectorAll(".menu-entree")].find((b) => b.textContent.startsWith(${JSON.stringify(texte)}))?.click()`,
    );
  const menuDe = async (id) => {
    await p.eval(`document.querySelector('.tuile[data-id="${id}"]').focus()`);
    await p.touche("F10", { vk: 121, modifiers: 8 });
    await attendre(100);
  };
  const nommer = async (nom) => {
    await attendre(150);
    await p.eval(`document.getElementById("nom-dossier").select()`);
    await p.taper(nom);
    await p.touche("Enter", { vk: 13, texte: "\r" });
    await attendre(200);
  };
  const idDossier = (titre) =>
    p.eval(
      `[...document.querySelectorAll(".tuile--dossier")].find((t) => t.querySelector(".tuile-titre").textContent === ${JSON.stringify(titre)})?.dataset.id`,
    );

  // 1. Empty folder from the "+" menu
  await p.eval(`document.querySelector(".tuile--ajout").click()`);
  await attendre(100);
  verifier(
    "« + » propose site ou dossier",
    (await p.eval(`document.querySelectorAll(".menu-entree").length`)) === 2,
  );
  await cliquerMenu("Nouveau dossier");
  await nommer("Travail");
  const travail = await idDossier("Travail");
  verifier(
    "Dossier vide « Travail » créé",
    !!travail &&
      (await p.eval(
        `!!document.querySelector('.tuile[data-id="${travail}"] .tuile-icone--dossier-vide')`,
      )),
  );

  // 2. "Créer un dossier avec ce site": the folder takes the site's place
  await menuDe("s2");
  await cliquerMenu("Créer un dossier avec ce site");
  await nommer("Lecture");
  const lecture = await idDossier("Lecture");
  verifier("Dossier créé à la place du site", (await ids()).split(",")[2] === lecture, await ids());

  // 3. "Déplacer vers…" three sites into Travail
  for (const id of ["s0", "s1", "s3"]) {
    await menuDe(id);
    await cliquerMenu("Déplacer vers");
    await attendre(150);
    await p.eval(
      `[...document.querySelectorAll(".arbre-noeud")].find((b) => b.textContent.includes("Travail")).click()`,
    );
    await attendre(150);
  }
  const minis = await p.eval(
    `document.querySelectorAll('.tuile[data-id="${travail}"] .mini:not(.mini--vide)').length`,
  );
  verifier("Aperçu : 3 mini-icônes", minis === 3, `${minis}`);
  const libelle = await p.eval(
    `document.querySelector('.tuile[data-id="${travail}"]').getAttribute("aria-label")`,
  );
  verifier("Libellé accessible du dossier", libelle === "Dossier Travail, 3 éléments", libelle);
  await p.capture(`${dossier}/dossiers-accueil.png`);

  // 4. Open with Enter, reorder, rename in place, add a site inside
  await p.eval(`document.querySelector('.tuile[data-id="${travail}"]').focus()`);
  await p.touche("Enter", { vk: 13, texte: "\r" });
  await attendre(300);
  verifier(
    "Entrée ouvre la fenêtre du dossier",
    await p.eval(`!!document.querySelector(".fenetre-dossier[open]")`),
  );
  const dedans = () =>
    p.eval(
      `[...document.querySelectorAll(".grille--dossier .tuile[data-id]")].map((t) => t.dataset.id).join()`,
    );
  verifier("Contenu du dossier", (await dedans()) === "s0,s1,s3", await dedans());
  await p.eval(`document.querySelector('.grille--dossier .tuile[data-id="s0"]').focus()`);
  await p.touche("ArrowRight", { vk: 39, modifiers: 1 });
  await attendre(150);
  verifier("Réorganisation dans le dossier", (await dedans()) === "s1,s0,s3", await dedans());
  await p.eval(`document.querySelector(".fenetre-titre").click()`);
  await attendre(100);
  await p.eval(`document.querySelector(".fenetre-titre-champ").select()`);
  await p.taper("Boulot");
  await p.touche("Enter", { vk: 13, texte: "\r" });
  await attendre(150);
  verifier(
    "Renommé sur place",
    (await p.eval(`document.querySelector(".fenetre-titre").textContent`)) === "Boulot",
  );
  await p.eval(`document.querySelector(".grille--dossier .tuile--ajout").click()`);
  await attendre(100);
  await cliquerMenu("Ajouter un site");
  await attendre(200);
  await p.taper("meteofrance.com");
  await p.touche("Enter", { vk: 13, texte: "\r" });
  await attendre(300);
  verifier("Site ajouté dans le dossier", (await dedans()).split(",").length === 4);
  await p.capture(`${dossier}/fenetre-dossier.png`);

  // "⋯" menu of a tile inside the folder window: shown above the window, and usable
  await p.eval(`document.querySelector(".fenetre-dossier[open] .tuile-plus").click()`);
  await attendre(200);
  const menuDevant = await p.eval(`(() => {
    const m = document.querySelector(".menu");
    if (!m) return "aucun menu";
    const r = m.getBoundingClientRect();
    const dessus = document.elementFromPoint(r.left + r.width / 2, r.top + 12);
    return m.contains(dessus) ? "ok" : (dessus?.className || dessus?.tagName);
  })()`);
  verifier("Menu « ⋯ » dans un dossier : au premier plan", menuDevant === "ok", menuDevant);
  await p.capture(`${dossier}/menu-dans-dossier.png`);
  await p.touche("Escape", { vk: 27 });
  await attendre(150);
  verifier(
    "Échap ferme le menu, la fenêtre du dossier reste ouverte",
    await p.eval(
      `!document.querySelector(".menu") && !!document.querySelector(".fenetre-dossier[open]")`,
    ),
  );

  // Second tab: the open folder follows changes made in the first one
  const p2 = await nav.ouvrir(url);
  await attendre(300);
  await p2.eval(`document.querySelector('.tuile[data-id="${travail}"]').click()`);
  await attendre(200);
  await p.premierPlan();
  await p.eval(`document.querySelector(".fenetre-titre").click()`);
  await p.eval(`document.querySelector(".fenetre-titre-champ").select()`);
  await p.taper("Pro");
  await p.touche("Enter", { vk: 13, texte: "\r" });
  await attendre(900);
  verifier(
    "Fenêtre ouverte dans l'autre onglet mise à jour",
    (await p2.eval(`document.querySelector(".fenetre-titre")?.textContent`)) === "Pro",
  );

  await p.touche("Escape", { vk: 27 });
  await attendre(200);
  verifier(
    "Échap ferme et rend le focus au dossier",
    await p.eval(
      `!document.querySelector(".fenetre-dossier") && document.activeElement?.dataset.id === "${travail}"`,
    ),
  );

  // 5. Delete the folder keeping its sites, then undo
  const avant = await ids();
  await menuDe(travail);
  await cliquerMenu("Supprimer");
  await attendre(200);
  verifier(
    "Confirmation pour un dossier non vide",
    (await p.eval(`document.querySelector(".dialogue-message")?.textContent || ""`)).includes(
      "4 sites",
    ),
  );
  await p.capture(`${dossier}/confirmation.png`);
  await p.eval(
    `document.querySelector('.bouton--principal[data-valeur="viderDansParent"]').click()`,
  );
  await attendre(200);
  const vide = (await ids()).split(",");
  const pos = avant.split(",").indexOf(travail);
  verifier(
    "Sites remis à la place du dossier",
    vide.slice(pos, pos + 4).join() === "s1,s0,s3," + vide[pos + 3] && !vide.includes(travail),
    vide.join(),
  );
  await p.eval(`document.querySelector(".toast-action").click()`);
  await attendre(200);
  verifier("Annuler : dossier restauré", (await ids()) === avant);

  // "Tout supprimer"
  await menuDe(travail);
  await cliquerMenu("Supprimer");
  await attendre(200);
  await p.eval(`document.querySelector('[data-valeur="avecContenu"]').click()`);
  await attendre(200);
  verifier("Tout supprimer", !(await ids()).includes(travail) && !(await ids()).includes("s0"));
  await p.eval(`document.querySelector(".toast-action").click()`);
  await attendre(200);

  // 6. Emptying a folder: notice with "Supprimer le dossier"
  await p.eval(`document.querySelector('.tuile[data-id="${lecture}"]').click()`);
  await attendre(300);
  await p.eval(`document.querySelector('.grille--dossier .tuile[data-id="s2"]').focus()`);
  await p.touche("Delete", { vk: 46 });
  await attendre(200);
  const toasts = await p.eval(
    `[...document.querySelectorAll(".toast")].map((t) => t.textContent).join(" | ")`,
  );
  verifier(
    "Dossier vidé : proposition de le supprimer",
    toasts.includes("est vide") && toasts.includes("Annuler"),
    toasts,
  );
  await p.capture(`${dossier}/dossier-vide.png`);
  await p.eval(
    `[...document.querySelectorAll(".toast")].find((t) => t.textContent.includes("est vide")).querySelector(".toast-action").click()`,
  );
  await attendre(300);
  verifier("Dossier vide supprimé sur demande", !(await ids()).includes(lecture));
  verifier(
    "Aucune erreur console (dossiers)",
    p.erreurs.length + p2.erreurs.length === 0,
    [...p.erreurs, ...p2.erreurs].join(" | "),
  );
  await p.sombre(true);
  await p.capture(`${dossier}/dossiers-sombre.png`);
}
