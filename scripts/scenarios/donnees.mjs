// V2.10 browser scenario (local mode): export to a file, delete sites, import it back with
// "Remplacer" (everything returns, then "Annuler"), "Fusionner" another file (folder
// "Importé le …"), a file with a javascript: address is refused and changes nothing.
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { attendre } from "../navigateur.mjs";

const site = (id, titre) => ({
  id,
  type: "site",
  titre,
  url: `https://${id}.example`,
  icone: { type: "lettre", couleur: "#2c6b5a" },
  creeLe: 0,
});

/** Ids and titles of a grid, depth-first (what an export must keep). */
const structure = (liste) =>
  liste
    .map((e) =>
      e.type === "dossier"
        ? `${e.id}:${e.titre}[${structure(e.items)}]`
        : `${e.id}:${e.titre}:${e.url}`,
    )
    .join(",");

export async function scenarioDonnees({ nav, url, verifier, dossier }) {
  const p = await nav.ouvrir(url);
  await p.sombre(false);
  const grille = [
    site("a", "Courriel"),
    site("b", "Cartes"),
    { id: "d", type: "dossier", titre: "Travail", items: [site("c", "Agenda")], creeLe: 0 },
    site("e", "Météo"),
  ];
  await p.eval(
    `chrome.storage.local.set({ etat: { versionSchema: 2, grille: ${JSON.stringify(grille)}, reglages: { theme: "sombre", fond: { type: "aucun" }, fonds: [] }, reglagesAppareil: {}, ecritPar: "t", majLe: Date.now() } })`,
  );
  await p.aller(url);
  await attendre(400);
  const titres = () =>
    p.eval(
      `[...document.querySelectorAll(".grille:not(.grille--dossier) > li > .tuile[data-id] .tuile-titre")].map((t) => t.textContent).join(",")`,
    );
  const depart = await titres();
  const ouvrirReglages = async () => {
    if (!(await p.eval(`!!document.querySelector(".reglages[open]")`))) {
      await p.eval(`document.querySelector(".bouton-reglages").click()`);
      await attendre(400);
    }
  };
  const bouton = (texte) =>
    p.eval(
      `[...document.querySelectorAll(".reglages button")].find((b) => b.textContent === ${JSON.stringify(texte)})?.click()`,
    );
  const dialogue = () => p.eval(`document.querySelector("dialog[open]")?.textContent ?? ""`);
  const choisir = (texte) =>
    p.eval(
      `[...document.querySelectorAll("dialog[open] button")].find((b) => b.textContent === ${JSON.stringify(texte)})?.click()`,
    );
  const temp = mkdtempSync(join(tmpdir(), "nedotab-import-"));
  const importer = async (nom, contenu) => {
    const chemin = join(temp, nom);
    writeFileSync(chemin, contenu);
    await ouvrirReglages();
    await p.fichiers('.reglages input[type="file"][accept^="application/json"]', [chemin]);
    await p.eval(
      `document.querySelector('.reglages input[type="file"][accept^="application/json"]').dispatchEvent(new Event("change"))`,
    );
    await attendre(600);
  };

  // 1. Export: the file handed to the browser is captured (no real download in tests)
  await p.eval(`(() => {
    window.__exports = [];
    const cliquer = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (this.download) window.__exports.push({ nom: this.download, href: this.href });
      else cliquer.call(this);
    };
  })()`);
  await ouvrirReglages();
  const section = await p.eval(
    `document.getElementById("titre-donnees")?.parentElement.textContent ?? ""`,
  );
  verifier(
    "Réglages : section « Mes données » sans compte",
    section.includes("Exporter mes données"),
    section.slice(0, 80),
  );
  await bouton("Exporter mes données");
  await attendre(500);
  const exporte = await p.eval(
    `(async () => { const e = window.__exports.at(-1); return e && { nom: e.nom, texte: await (await fetch(e.href)).text() }; })()`,
  );
  const json = exporte && JSON.parse(exporte.texte);
  verifier(
    "Export : nedotab-AAAA-MM-JJ.json, format, grille complète",
    /^nedotab-\d{4}-\d\d-\d\d\.json$/.test(exporte?.nom) &&
      json.format === "nedotab-export" &&
      structure(json.grille) === structure(grille),
    exporte?.nom,
  );
  await p.capture(`${dossier}/mes-donnees.png`);
  await p.touche("Escape", { vk: 27 });

  // 2. Delete sites, then import the export with "Remplacer"
  for (const id of ["a", "b", "e"]) {
    await p.eval(`document.querySelector('.tuile[data-id="${id}"]').focus()`);
    await p.touche("Delete", { vk: 46 });
    await attendre(150);
  }
  verifier("Trois sites supprimés", (await titres()) === "Travail", await titres());
  await importer("export.json", exporte.texte);
  const apercu = await dialogue();
  verifier(
    "Aperçu de l'import : différences, Remplacer et Fusionner proposés",
    apercu.includes("+3 sites") &&
      apercu.includes("Remplacer ma grille") &&
      apercu.includes("Fusionner"),
    apercu.slice(0, 120),
  );
  await p.capture(`${dossier}/import-apercu.png`);
  await choisir("Remplacer ma grille");
  await attendre(300);
  verifier(
    "Confirmation avant de remplacer",
    (await dialogue()).includes("Une copie en sera gardée"),
  );
  await choisir("Restaurer");
  await attendre(800);
  verifier("Remplacer : tout revient", (await titres()) === depart, await titres());
  const toast = await p.eval(
    `[...document.querySelectorAll(".toast")].map((t) => t.textContent).join("|")`,
  );
  verifier(
    "Toast « Fichier importé — Annuler »",
    toast.includes("Fichier importé") && toast.includes("Annuler"),
    toast,
  );

  // 3. "Fusionner" a file from elsewhere: new sites in "Importé le …", duplicates ignored
  const autre = {
    ...json,
    grille: [site("a", "Courriel"), site("n1", "Recettes"), site("n2", "Musique")],
  };
  await importer("autre.json", JSON.stringify(autre));
  await choisir("Fusionner");
  await attendre(600);
  const apres = await titres();
  verifier(
    "Fusionner : dossier « Importé le … » ajouté à la fin",
    /,Importé le \d\d\/\d\d\/\d{4}$/.test(apres),
    apres,
  );
  const dedans = await p.eval(
    `(async () => { const { etat } = await chrome.storage.local.get("etat"); const d = etat.grille.at(-1); return d.items.map((e) => e.titre + ":" + (e.id === "n1" || e.id === "n2")).join(); })()`,
  );
  verifier(
    "Fusionner : 2 nouveaux sites (doublon ignoré), nouveaux identifiants",
    dedans === "Recettes:false,Musique:false",
    dedans,
  );

  // 4. A hand-edited file with a javascript: address: refused, nothing changes
  const avantPiege = await titres();
  const piege = JSON.stringify(
    { ...json, grille: [...json.grille, { ...site("x", "Piège"), url: "javascript:alert(1)" }] },
    null,
    2,
  );
  await importer("piege.json", piege);
  const erreur = await p.eval(
    `[...document.querySelectorAll(".toast")].map((t) => t.textContent).join("|")`,
  );
  verifier(
    "Fichier avec javascript: refusé, ligne indiquée",
    /Ligne \d+ : adresse refusée \(javascript:\)/.test(erreur) &&
      !(await p.eval(`!!document.querySelector("dialog[open]:modal")`)),
    erreur,
  );
  verifier("Fichier refusé : rien n'a changé", (await titres()) === avantPiege);
  await importer("casse.json", "{ pas du json");
  verifier(
    "Fichier illisible : message clair",
    (
      await p.eval(`[...document.querySelectorAll(".toast")].map((t) => t.textContent).join("|")`)
    ).includes("JSON invalide"),
  );
  verifier("Aucune erreur console (mes données)", p.erreurs.length === 0, p.erreurs.join(" | "));
}
