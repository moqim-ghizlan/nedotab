import { PALETTE, couleurDepuisTexte, lettrePourSite } from "../../core/couleurs.js";
import { el } from "../dom.js";
import { trouverIconeEtTitre } from "../services/icones.js";
import { compterGraphemes, importerImage, verifierUrlImage } from "../services/imageIcone.js";

const MODES = [
  ["auto", "Automatique"],
  ["lettre", "Lettre"],
  ["url", "Adresse d'image"],
  ["import", "Importer"],
];

function modeDe(icone) {
  if (icone?.type === "lettre") return "lettre";
  if (icone?.type === "image") return "import";
  if (icone?.type === "url" && icone.source === "perso") return "url";
  return "auto";
}

/**
 * Icon section of the site dialog: four modes (automatic, letter and colour, image from a
 * URL, imported image). `lireSite()` gives the current title and URL of the dialog;
 * `onChange(icone)` is called with every new candidate icon.
 */
export function creerEditeurIcone({ iconeInitiale, lireSite, onChange }) {
  let icone = { ...iconeInitiale };
  let mode = modeDe(icone);
  const definir = (nouvelle) => {
    icone = nouvelle;
    onChange(icone);
  };

  // --- automatic ---------------------------------------------------------------------
  const etatAuto = el("span", { class: "icone-etat" });
  let rechercheAuto = null;
  const redetecter = async () => {
    const { url } = lireSite();
    if (!url) {
      etatAuto.textContent = "Saisissez d'abord une adresse valide.";
      return;
    }
    rechercheAuto?.abort();
    rechercheAuto = new AbortController();
    etatAuto.textContent = "Recherche…";
    const r = await trouverIconeEtTitre(url, { signal: rechercheAuto.signal });
    if (rechercheAuto.signal.aborted) return;
    etatAuto.textContent =
      r.icone.type === "lettre" ? "Aucune icône trouvée : pastille lettre." : "";
    definir(r.icone);
  };
  const panneauAuto = el(
    "div",
    { class: "icone-panneau", dataset: { mode: "auto" } },
    el("button", { type: "button", class: "bouton", texte: "Re-détecter", onclick: redetecter }),
    etatAuto,
  );

  // --- letter ------------------------------------------------------------------------
  const champLettre = el("input", {
    type: "text",
    class: "champ-lettre",
    "aria-label": "Lettre ou emoji (2 caractères au plus)",
    autocomplete: "off",
  });
  const nuancier = el("div", { class: "nuancier", role: "radiogroup", "aria-label": "Couleur" });
  const couleurCourante = () =>
    (icone.type === "lettre" && icone.couleur) || couleurDepuisTexte(lireSite().url);
  const appliquerLettre = (couleur = couleurCourante()) => {
    const texte = champLettre.value.trim();
    const lettre = { type: "lettre", couleur };
    if (texte) lettre.texte = texte;
    definir(lettre);
    for (const b of nuancier.children)
      b.setAttribute("aria-checked", String(b.dataset.couleur === couleur));
  };
  for (const couleur of PALETTE) {
    nuancier.append(
      el("button", {
        type: "button",
        class: "nuance",
        role: "radio",
        style: `background:${couleur}`,
        "aria-label": couleur,
        "aria-checked": "false",
        dataset: { couleur },
        onclick: () => appliquerLettre(couleur),
      }),
    );
  }
  champLettre.addEventListener("input", () => {
    while (compterGraphemes(champLettre.value) > 2)
      champLettre.value = [...champLettre.value].slice(0, -1).join("");
    appliquerLettre();
  });
  const panneauLettre = el(
    "div",
    { class: "icone-panneau", dataset: { mode: "lettre" } },
    champLettre,
    nuancier,
  );

  // --- image from a URL --------------------------------------------------------------
  const champImage = el("input", {
    type: "url",
    inputmode: "url",
    placeholder: "https://exemple.com/logo.png",
    "aria-label": "Adresse de l'image",
    autocomplete: "off",
  });
  const etatImage = el("span", { class: "icone-etat" });
  champImage.addEventListener("change", async () => {
    etatImage.textContent = "Vérification…";
    const r = await verifierUrlImage(champImage.value);
    etatImage.textContent = r.ok ? "" : r.erreur;
    if (r.ok) definir({ type: "url", valeur: r.url, source: "perso" });
  });
  const panneauUrl = el(
    "div",
    { class: "icone-panneau", dataset: { mode: "url" } },
    champImage,
    etatImage,
  );

  // --- imported image ----------------------------------------------------------------
  const champFichier = el("input", {
    type: "file",
    accept: "image/png,image/jpeg,image/webp,image/svg+xml",
    "aria-label": "Choisir une image",
  });
  const etatFichier = el("span", { class: "icone-etat" });
  champFichier.addEventListener("change", async () => {
    const fichier = champFichier.files?.[0];
    if (!fichier) return;
    etatFichier.textContent = "Préparation…";
    const r = await importerImage(fichier);
    etatFichier.textContent = r.ok ? `${(r.poids / 1024).toFixed(1)} Ko` : r.erreur;
    if (r.ok) definir({ type: "image", valeur: r.dataUrl });
  });
  const panneauImport = el(
    "div",
    { class: "icone-panneau", dataset: { mode: "import" } },
    champFichier,
    etatFichier,
  );

  // --- mode switch -------------------------------------------------------------------
  const onglets = el("div", {
    class: "segments",
    role: "radiogroup",
    "aria-label": "Type d'icône",
  });
  const panneaux = [panneauAuto, panneauLettre, panneauUrl, panneauImport];
  const afficherMode = (m) => {
    mode = m;
    for (const b of onglets.children) b.setAttribute("aria-checked", String(b.dataset.mode === m));
    for (const p of panneaux) p.hidden = p.dataset.mode !== m;
  };
  for (const [m, libelle] of MODES) {
    onglets.append(
      el("button", {
        type: "button",
        class: "segment",
        role: "radio",
        dataset: { mode: m },
        texte: libelle,
        onclick: () => {
          afficherMode(m);
          if (m === "lettre") {
            champLettre.value ||=
              icone.type === "lettre" && icone.texte ? icone.texte : lettrePourSite(lireSite());
            appliquerLettre();
          }
          if (m === "auto" && icone.type !== "url") redetecter();
        },
      }),
    );
  }
  if (icone.type === "lettre") champLettre.value = icone.texte ?? "";
  if (mode === "url") champImage.value = icone.valeur;
  afficherMode(mode);
  for (const b of nuancier.children) {
    b.setAttribute(
      "aria-checked",
      String(icone.type === "lettre" && b.dataset.couleur === icone.couleur),
    );
  }

  const racine = el(
    "fieldset",
    { class: "icone-editeur" },
    el("legend", { texte: "Icône" }),
    onglets,
    ...panneaux,
  );
  return {
    racine,
    lire: () => ({ ...icone }),
    mode: () => mode,
    redetecter,
    arreter: () => rechercheAuto?.abort(),
  };
}
