// V1.7 browser scenario: three levels of folders, breadcrumb, Escape, back button,
// "Déplacer vers…" tree with refused destinations, preview in depth, reload.
import { attendre } from "../navigateur.mjs";

const site = (id, domaine) => ({
  id,
  type: "site",
  titre: domaine,
  url: `https://${domaine}`,
  icone: { type: "lettre", couleur: "#2c6b5a" },
  creeLe: 0,
});

function etatDeDepart() {
  return {
    versionSchema: 1,
    grille: [
      { id: "travail", type: "dossier", titre: "Travail", items: [], creeLe: 0 },
      site("s1", "github.com"),
      site("s2", "lemonde.fr"),
      {
        id: "h",
        type: "dossier",
        titre: "Haut",
        items: [{ id: "hs", type: "dossier", titre: "Sous", items: [], creeLe: 0 }],
        creeLe: 0,
      },
    ],
    reglages: { theme: "auto", fond: { type: "aucun" } },
  };
}

export async function scenarioImbrication({ nav, url, verifier, dossier }) {
  const p = await nav.ouvrir(url);
  await p.sombre(false);
  await p.eval(
    `chrome.storage.local.set({ etat: { ...${JSON.stringify(etatDeDepart())}, ecritPar: "test", majLe: 1 } })`,
  );
  await p.aller(url);
  await attendre(300);

  const titreFenetre = () =>
    p.eval(`document.querySelector(".fenetre-titre")?.textContent ?? null`);
  const ariane = () =>
    p.eval(
      `[...document.querySelectorAll(".ariane-element")].map((e) => e.textContent).join(" › ")`,
    );
  const cliquerMenu = (texte) =>
    p.eval(
      `[...document.querySelectorAll(".menu-entree")].find((b) => b.textContent.startsWith(${JSON.stringify(texte)}))?.click()`,
    );
  const nouveauDossierIci = async (nom) => {
    await p.eval(`document.querySelector(".grille--dossier .tuile--ajout").click()`);
    await attendre(100);
    await cliquerMenu("Nouveau dossier");
    await attendre(150);
    await p.eval(`document.getElementById("nom-dossier").select()`);
    await p.taper(nom);
    await p.touche("Enter", { vk: 13, texte: "\r" });
    await attendre(200);
  };
  const ouvrirIci = async (titre) => {
    await p.eval(
      `[...document.querySelectorAll(".grille--dossier .tuile--dossier")].find((t) => t.querySelector(".tuile-titre").textContent === ${JSON.stringify(titre)}).focus()`,
    );
    await p.touche("Enter", { vk: 13, texte: "\r" });
    await attendre(250);
  };
  const escape = async () => {
    await p.touche("Escape", { vk: 27 });
    await attendre(200);
  };

  // 1. Three levels: Accueil › Travail › Clients › Projets
  await p.eval(`document.querySelector('.tuile[data-id="travail"]').focus()`);
  await p.touche("Enter", { vk: 13, texte: "\r" });
  await attendre(250);
  await nouveauDossierIci("Clients");
  await ouvrirIci("Clients");
  await nouveauDossierIci("Projets");
  await ouvrirIci("Projets");
  verifier("Trois niveaux de dossiers", (await titreFenetre()) === "Projets");
  verifier(
    "Une seule fenêtre de dossier",
    (await p.eval(`document.querySelectorAll(".fenetre-dossier").length`)) === 1,
  );
  verifier(
    "Fil d'Ariane complet",
    (await ariane()) === "Accueil › Travail › Clients › Projets",
    await ariane(),
  );
  verifier(
    "Dernier segment : emplacement courant",
    await p.eval(
      `document.querySelector(".ariane-courant").getAttribute("aria-current") === "location"`,
    ),
  );
  await p.eval(`document.querySelector(".grille--dossier .tuile--ajout").click()`);
  await attendre(100);
  const entree = await p.eval(
    `(() => { const b = [...document.querySelectorAll(".menu-entree")].find((b) => b.textContent.startsWith("Nouveau dossier")); return [b.getAttribute("aria-disabled"), b.textContent]; })()`,
  );
  verifier(
    "Niveau 3 : « Nouveau dossier » désactivé et expliqué",
    entree[0] === "true" && entree[1].includes("3 niveaux maximum"),
    entree[1],
  );
  await p.capture(`${dossier}/niveau-3.png`);
  await escape(); // closes the menu

  // 2. Breadcrumb: back to Travail directly, focus on Clients
  await p.eval(`document.querySelector('.ariane-segment[data-cible="travail"]').click()`);
  await attendre(250);
  verifier(
    "Clic sur « Travail » : retour direct au niveau 1",
    (await titreFenetre()) === "Travail",
  );
  verifier(
    "Focus sur le dossier d'où l'on vient",
    await p.eval(`document.activeElement?.textContent.endsWith("Clients")`),
  );
  verifier(
    "Pas de bouton retour au niveau 1",
    await p.eval(`document.querySelector(".fenetre-retour").hidden`),
  );

  // 3. Escape goes up level by level, then closes
  await ouvrirIci("Clients");
  await ouvrirIci("Projets");
  verifier(
    "Bouton retour visible au niveau 3",
    await p.eval(`!document.querySelector(".fenetre-retour").hidden`),
  );
  await escape();
  verifier("Échap : Projets → Clients", (await titreFenetre()) === "Clients");
  await escape();
  verifier("Échap : Clients → Travail", (await titreFenetre()) === "Travail");
  await escape();
  verifier(
    "Échap au niveau 1 : fermeture, focus sur la tuile",
    await p.eval(
      `!document.querySelector(".fenetre-dossier") && document.activeElement?.dataset.id === "travail"`,
    ),
  );

  // 4. "Déplacer vers…" Travail: Clients and Projets refused (loop)
  const etatsArbre = async (id) => {
    await p.eval(`document.querySelector('.tuile[data-id="${id}"]').focus()`);
    await p.touche("F10", { vk: 121, modifiers: 8 });
    await attendre(100);
    await cliquerMenu("Déplacer vers");
    await attendre(200);
    return p.eval(
      `Object.fromEntries([...document.querySelectorAll(".arbre-noeud")].map((n) => [n.querySelector(".arbre-titre").textContent, n.getAttribute("aria-disabled") ? (n.querySelector(".destination-note")?.textContent || "désactivé") : "ok"]))`,
    );
  };
  let arbre = await etatsArbre("travail");
  verifier(
    "Travail → Clients / Projets : boucle refusée",
    arbre.Clients.includes("lui-même") && arbre.Projets.includes("lui-même"),
    JSON.stringify(arbre),
  );
  verifier("Emplacement actuel marqué", arbre.Accueil === "(actuel)");
  await p.capture(`${dossier}/deplacer-arbre.png`);
  await escape();
  arbre = await etatsArbre("h");
  verifier(
    "Dossier de hauteur 2 → niveau 2 refusé",
    arbre.Clients.includes("3 niveaux") && arbre.Travail === "ok",
    JSON.stringify(arbre),
  );
  // Keyboard in the tree: ↓ to Travail, Enter
  await p.eval(
    `[...document.querySelectorAll(".arbre-noeud")].find((n) => n.textContent.includes("Travail")).focus()`,
  );
  await p.touche("Enter", { vk: 13, texte: "\r" });
  await attendre(250);
  verifier(
    "Déplacement au clavier dans l'arbre",
    await p.eval(`!document.querySelector('.grille:not(.grille--dossier) .tuile[data-id="h"]')`),
  );

  // 5. Preview in depth: a site moved into Projets shows on Travail
  await p.eval(`document.querySelector('.tuile[data-id="s2"]').focus()`);
  await p.touche("F10", { vk: 121, modifiers: 8 });
  await attendre(100);
  await cliquerMenu("Déplacer vers");
  await attendre(200);
  await p.eval(
    `[...document.querySelectorAll(".arbre-noeud")].find((n) => n.textContent.includes("Projets")).click()`,
  );
  await attendre(250);
  const minis = await p.eval(
    `document.querySelectorAll('.tuile[data-id="travail"] .mini:not(.mini--vide)').length`,
  );
  verifier("Aperçu de Travail : site trouvé en profondeur", minis === 1, `${minis}`);
  await p.capture(`${dossier}/apercu-profondeur.png`);

  // 6. Reload: structure intact
  await attendre(500);
  await p.aller(url);
  await attendre(300);
  const structure = await p.eval(`chrome.storage.local.get("etat").then(({ etat }) => {
    const texte = (l) => l.map((e) => e.type === "dossier" ? e.titre + "[" + texte(e.items) + "]" : e.titre).join(" ");
    return texte(etat.grille);
  })`);
  verifier(
    "Structure intacte après rechargement",
    structure === "Travail[Clients[Projets[lemonde.fr]] Haut[Sous[]]] github.com",
    structure,
  );
  verifier("Aucune erreur console (imbrication)", p.erreurs.length === 0, p.erreurs.join(" | "));
}
