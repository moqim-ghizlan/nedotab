import {
  creerExportTodos,
  nomFichierExportTodos,
  resumeImport,
  validerImportTodos,
  verifierTailleImport,
} from "../../core/exportTodos.js";
import { plateforme } from "../../platform/index.js";
import { demander } from "../dialogues/commun.js";
import { el } from "../dom.js";
import { toast } from "../toast.js";
import { livrerParDefaut } from "../todos/exporterTodo.js";

export const MOT_CONFIRMATION = "SUPPRIMER";

/**
 * "Todos" section of the settings (V6.7): export of the subjects and todos as JSON, import (an
 * addition after a preview, never a replacement), recount of the counters, removal of everything
 * (typing the word SUPPRIMER). Texts the user wrote are only ever shown with textContent.
 *
 * @param {object} d
 * @param {ReturnType<import("../todos/donneesTodos.js").creerDonneesTodos>} d.donnees
 * @param {(fichier: File) => Promise<string>|string} [d.livrer]
 */
export function sectionTodos({ donnees, livrer = livrerParDefaut, version = "", maintenant = () => new Date() }) {
  const etat = el("p", { class: "reglages-note", role: "status", "aria-live": "polite" });
  const occupe = (bouton, vrai) => {
    bouton.disabled = vrai;
    bouton.setAttribute("aria-busy", String(vrai));
  };
  const horsLigne = () => typeof navigator !== "undefined" && navigator.onLine === false;

  // --- Export ---------------------------------------------------------------------------------
  const exporter = el("button", {
    type: "button",
    class: "bouton",
    texte: "Exporter mes todos (JSON)",
    onclick: async () => {
      occupe(exporter, true);
      etat.textContent = "Préparation du fichier…";
      try {
        const { sujets, todos } = await donnees.lireTout();
        const nom = nomFichierExportTodos(maintenant());
        const contenu = creerExportTodos(
          { sujets, todos },
          { version: version || (import.meta.env?.VITE_VERSION ?? ""), plateforme: plateforme.capacites?.nom ?? "extension", maintenant: maintenant().getTime() },
        );
        const fichier = new File([JSON.stringify(contenu, null, 2)], nom, { type: "application/json" });
        const mode = await livrer(fichier);
        etat.textContent = mode === "annule" ? "" : `Fichier « ${nom} » prêt. Il n'est pas chiffré : gardez-le en lieu sûr.`;
      } catch {
        etat.textContent = "L'export a échoué (hors ligne ?). Réessayez.";
      }
      occupe(exporter, false);
    },
  });

  // --- Import ---------------------------------------------------------------------------------
  const champFichier = el("input", {
    type: "file",
    accept: "application/json,.json",
    hidden: true,
    "aria-label": "Fichier d'export des todos",
  });
  champFichier.addEventListener("change", async () => {
    const choisi = champFichier.files?.[0];
    champFichier.value = "";
    if (!choisi) return;
    if (horsLigne()) {
      etat.textContent = "Import impossible hors ligne : reconnectez-vous puis réessayez.";
      return;
    }
    const trop = verifierTailleImport(choisi.size);
    if (trop) {
      etat.textContent = trop;
      return;
    }
    const contenu = await choisi.text().catch(() => null);
    const compteurs = donnees.etat().compteurs;
    const lu = validerImportTodos(contenu, {
      sujetsExistants: compteurs.nbSujets,
      todosExistants: compteurs.nbTodos,
    });
    if (!lu.ok) {
      etat.textContent = lu.erreur;
      toast(lu.erreur, { type: "erreur", duree: 9000 });
      return;
    }
    const notes = ["Les éléments du fichier sont ajoutés à vos todos : rien n'est remplacé."];
    if (lu.resume.imagesIgnorees) notes.push("Les images ne sont pas dans ce fichier : elles ne sont pas importées.");
    if (lu.resume.tronque) notes.push("Les limites (30 sujets, 500 todos) sont atteintes : la suite du fichier est ignorée.");
    const ok = await demander({
      titre: "Importer des todos",
      message: `${resumeImport(lu.resume)} — Importer ?`,
      contenu: [el("ul", { class: "reglages-note" }, notes.map((n) => el("li", { texte: n })))],
      boutons: [
        { libelle: "Annuler", valeur: false },
        { libelle: "Importer", valeur: true, principal: true },
      ],
    });
    if (!ok) return;
    let annule = false;
    occupe(importer, true);
    const arret = el("button", { type: "button", class: "lien-discret", texte: "Annuler l'import", onclick: () => (annule = true) });
    etat.replaceChildren(el("span", { texte: "Import… " }), arret);
    try {
      const r = await donnees.importer(lu.plan, {
        annule: () => annule,
        surProgres: (fait, total) => {
          etat.firstChild.textContent = `Import… ${fait}/${total} `;
        },
      });
      etat.textContent = r.annule
        ? `Import arrêté : ${r.sujets} sujet(s) et ${r.todos} todo(s) ajoutés.`
        : `Importé : ${r.sujets} sujet(s) et ${r.todos} todo(s).`;
    } catch {
      etat.textContent = "L'import s'est arrêté (limite atteinte ou réseau). Ce qui est déjà ajouté reste.";
    }
    occupe(importer, false);
  });
  const importer = el("button", { type: "button", class: "bouton", texte: "Importer…", onclick: () => champFichier.click() });

  // --- Recount ----------------------------------------------------------------------------------
  const recalculer = el("button", {
    type: "button",
    class: "bouton",
    texte: "Recalculer les compteurs",
    onclick: async () => {
      occupe(recalculer, true);
      etat.textContent = "Recomptage…";
      try {
        const c = await donnees.recalculer();
        etat.textContent = `Compteurs corrigés : ${c.nbSujets} sujet(s), ${c.nbTodos} todo(s).`;
      } catch {
        etat.textContent = "Le recomptage a échoué (hors ligne ?). Réessayez.";
      }
      occupe(recalculer, false);
    },
  });

  // --- Remove everything ----------------------------------------------------------------------
  const supprimer = el("button", {
    type: "button",
    class: "bouton bouton--danger",
    texte: "Supprimer tous mes todos",
    onclick: async () => {
      if (horsLigne()) {
        etat.textContent = "Suppression impossible hors ligne.";
        return;
      }
      const saisie = el("input", {
        type: "text",
        class: "todos-champ",
        "aria-label": `Tapez ${MOT_CONFIRMATION} pour confirmer`,
        placeholder: MOT_CONFIRMATION,
        autocomplete: "off",
      });
      const c = donnees.etat().compteurs;
      const ok = await demander({
        titre: "Supprimer tous vos todos ?",
        message: `${c.nbTodos} todo(s), ${c.nbSujets} sujet(s) et toutes les images seront supprimés. Cette action est définitive. Tapez ${MOT_CONFIRMATION} pour confirmer.`,
        contenu: [saisie],
        boutons: [
          { libelle: "Annuler", valeur: false },
          { libelle: "Tout supprimer", valeur: true, danger: true },
        ],
      });
      if (!ok) return;
      if (saisie.value.trim() !== MOT_CONFIRMATION) {
        etat.textContent = `Rien n'a été supprimé : il fallait taper ${MOT_CONFIRMATION}.`;
        return;
      }
      occupe(supprimer, true);
      etat.textContent = "Suppression…";
      try {
        await donnees.toutSupprimer({ surProgres: (n) => (etat.textContent = `Suppression… ${n} todo(s)`) });
        etat.textContent = "Tous vos todos ont été supprimés.";
      } catch {
        etat.textContent = "La suppression s'est arrêtée. Relancez-la : ce qui est supprimé le reste.";
      }
      occupe(supprimer, false);
    },
  });

  const section = el(
    "section",
    { class: "reglages-section", "aria-labelledby": "titre-todos" },
    el("h3", { id: "titre-todos", texte: "Todos" }),
    el("p", {
      class: "reglages-note",
      texte:
        "Vos sujets et vos todos ne font pas partie des sauvegardes : exportez-les ici. Le fichier n'est pas chiffré.",
    }),
    el("div", { class: "reglages-boutons" }, exporter, importer),
    el("div", { class: "reglages-boutons" }, recalculer, supprimer),
    champFichier,
    etat,
  );
  return { section };
}
