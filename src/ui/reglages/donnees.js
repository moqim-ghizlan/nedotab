import { dateHeure } from "../../core/sauvegardes.js";
import { el } from "../dom.js";
import { toast } from "../toast.js";
import { ouvrirApercu } from "./apercuSauvegarde.js";

/**
 * "Mes données" section of the settings (V2.10): export to a file (also without an
 * account), backgrounds as a ZIP, import of an export file (Replace or Merge).
 */
export function sectionDonnees({ donnees, restauration, store }) {
  const etat = el("p", { class: "reglages-note", "aria-live": "polite" });
  const sauvegardes = el("input", { type: "checkbox", id: "export-sauvegardes", checked: true });
  const choixSauvegardes = donnees.enCompte()
    ? el(
        "label",
        { class: "reglages-case", for: "export-sauvegardes" },
        sauvegardes,
        el("span", { texte: "Inclure mes sauvegardes" }),
      )
    : null;

  const exporter = el("button", {
    type: "button",
    class: "bouton",
    texte: "Exporter mes données",
    onclick: async () => {
      exporter.disabled = true;
      etat.textContent = "Préparation du fichier…";
      const r = await donnees.exporter({ inclureSauvegardes: sauvegardes.checked });
      exporter.disabled = false;
      etat.textContent = r.ok ? `Fichier « ${r.nom} » téléchargé.` : r.erreur;
    },
  });

  const fonds = el("button", {
    type: "button",
    class: "lien-discret",
    texte: "Télécharger mes fonds d'écran (.zip)",
    hidden: true,
    onclick: async () => {
      etat.textContent = "Préparation de l'archive…";
      const r = await donnees.telechargerFonds();
      etat.textContent = r.ok
        ? `${r.nombre} fond${r.nombre > 1 ? "s" : ""} d'écran téléchargé${r.nombre > 1 ? "s" : ""}.`
        : r.erreur;
    },
  });
  donnees.fondsATelecharger().then((l) => (fonds.hidden = l.length === 0));

  const fichier = el("input", {
    type: "file",
    accept: "application/json,.json",
    hidden: true,
    "aria-label": "Fichier d'export NedoTab",
  });
  fichier.addEventListener("change", async () => {
    const choisi = fichier.files?.[0];
    fichier.value = "";
    if (!choisi) return;
    const lu = await donnees.lireFichier(choisi);
    if (!lu.ok) {
      toast(lu.erreur, { type: "erreur", duree: 9000 });
      etat.textContent = lu.erreur;
      return;
    }
    etat.textContent = "";
    const notes = [];
    if (lu.sauvegardes) {
      notes.push(
        "Les sauvegardes contenues dans le fichier ne sont pas importées : seule la grille l'est.",
      );
    }
    if (lu.aplati) {
      notes.push(
        "Des dossiers trop profonds seront aplatis pour respecter 3 niveaux (aucun site perdu).",
      );
    }
    notes.push(
      "Fusionner : les sites absents de votre grille sont ajoutés dans un dossier « Importé le … ».",
    );
    await ouvrirApercu(restauration, {
      titre: "Importer un fichier",
      sous: `Export${lu.exporteLe ? ` du ${dateHeure(Date.parse(lu.exporteLe))}` : ""}`,
      source: lu.etat,
      libelleRestaurer: "Remplacer ma grille",
      succes: "Fichier importé",
      libelleContenu: "Contenu du fichier",
      notes,
      autreChoix: {
        libelle: "Fusionner",
        onChoix: () => {
          const r = donnees.fusionner(lu);
          if (!r.action) {
            toast("Tous les sites de ce fichier sont déjà dans votre grille.");
            return;
          }
          const id = r.action.dossier.id;
          toast(
            `${r.ajoutes} site${r.ajoutes > 1 ? "s" : ""} ajouté${r.ajoutes > 1 ? "s" : ""} dans « ${r.action.dossier.titre} »`,
            {
              duree: 10000,
              action: {
                libelle: "Annuler",
                onClic: () => store.envoyer({ type: "ELEMENT_SUPPRIMER", id }),
              },
            },
          );
        },
      },
    });
  });
  const importer = el("button", {
    type: "button",
    class: "bouton",
    texte: "Importer un fichier",
    onclick: () => fichier.click(),
  });

  const section = el(
    "section",
    { class: "reglages-section", "aria-labelledby": "titre-donnees" },
    el("h3", { id: "titre-donnees", texte: "Mes données" }),
    el("p", {
      class: "reglages-note",
      texte:
        "Téléchargez tous vos sites, dossiers et réglages dans un fichier, ou reprenez-les depuis un export.",
    }),
    choixSauvegardes,
    el("div", { class: "reglages-boutons" }, exporter, importer),
    fonds,
    fichier,
    etat,
  );
  return { section };
}
