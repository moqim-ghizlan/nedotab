import { libelleAppareilAffiche } from "../../core/appareils.js";
import { validerImage } from "../../core/imagesTodo.js";
import { DESCRIPTION_MAX, TITRE_MAX } from "../../core/todos.js";
import { nomTelechargementImage } from "../../core/imageSortie.js";
import { actionsImage, boutonsActionsImage } from "../copierImage.js";
import { confirmerSuppression } from "../dialogues/confirmerSuppression.js";
import { el } from "../dom.js";
import { icone } from "../icones.js";
import { ouvrirMenu } from "../menuContextuel.js";
import { rapatrierToasts, toast } from "../toast.js";
import { preparerImage } from "./compresserImage.js";
import { televerserPhoto } from "./envoiPhoto.js";
import { telechargerPdfTodo } from "./pdfTodo.js";
import { telechargerTodo } from "./telechargerTodo.js";
import { ouvrirVisionneuse } from "./visionneuse.js";

const tactile = () => !!globalThis.matchMedia?.("(pointer: coarse)").matches;
const grandEcran = () => !!globalThis.matchMedia?.("(min-width: 700px)").matches;
let compteur = 0;

const quand = (ms) =>
  ms == null ? "à l'instant" : new Date(ms).toLocaleString("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/**
 * The window to create or edit a todo: title, description, one picture, subject, and (when it
 * exists) Delete. Nothing is written before "Enregistrer"; "Annuler", Escape and the backdrop leave
 * everything as it was. Only the fields that changed are written (partial writes). Everything the
 * user wrote goes through value / textContent, never HTML. A phone gets a sheet over the screen.
 *
 * @param {object} d
 * @param {ReturnType<import("./donneesTodos.js").creerDonneesTodos>} d.donnees
 * @param {object|null} [d.todo] the todo to edit; null to create one
 * @param {string} [d.sujetId] the subject proposed for a new todo
 * @param {typeof preparerImage} [d.preparer]
 * @param {object|null} [d.appareils]
 * @param {HTMLElement|null} [d.retourFocus] given the focus back on closing
 * @param {(id: string) => void} [d.surSupprimer] called once the removal is confirmed
 * @param {File} [d.fichier] a picture already chosen (pasted before the window opened)
 */
export function ouvrirModaleTodo({ donnees, todo = null, sujetId, preparer = preparerImage, appareils = null, retourFocus = null, surSupprimer = null, fichier = null }) {
  const edition = !!todo;
  const id = `modale-todo-${++compteur}`;
  const etat = { nouvelle: null, nouvelleUrl: null, retirerExistante: false, miniUrl: null, occupe: false };

  // --- Fields --------------------------------------------------------------------------------------
  const champTitre = el("textarea", {
    id: `${id}-titre`,
    class: "todo-champ todo-champ--titre",
    rows: "1",
    placeholder: "Que faut-il faire ?",
    maxlength: String(TITRE_MAX * 2),
    autocomplete: "off",
    enterkeyhint: "next",
  });
  const champDescription = el("textarea", {
    id: `${id}-description`,
    class: "todo-champ todo-champ--description",
    rows: "4",
    placeholder: "Notes, détails…",
    maxlength: String(DESCRIPTION_MAX),
  });
  const choixSujet = el("select", { id: `${id}-sujet`, class: "todo-champ todo-champ--sujet" });
  const message = el("p", { class: "modale-todo-message", role: "alert", hidden: true });
  const zonePhoto = el("div", { class: "modale-todo-photo" });
  const dates = el("div", { class: "todo-dates" });

  const champFichier = el("input", {
    type: "file",
    accept: "image/jpeg,image/png,image/webp",
    hidden: true,
    tabindex: "-1",
    "aria-hidden": "true",
    onchange: () => {
      choisirPhoto(champFichier.files?.[0]);
      champFichier.value = "";
    },
  });
  const champCamera = el("input", {
    type: "file",
    accept: "image/jpeg,image/png,image/webp",
    capture: "environment",
    hidden: true,
    tabindex: "-1",
    "aria-hidden": "true",
    onchange: () => {
      choisirPhoto(champCamera.files?.[0]);
      champCamera.value = "";
    },
  });

  const champ = (libelle, controle, extra = null) =>
    el("div", { class: "modale-todo-champ" }, el("label", { for: controle.id, class: "modale-todo-etiquette", texte: libelle }), controle, extra);

  // --- Buttons -----------------------------------------------------------------------------------------
  const fermerBtn = el("button", { type: "button", class: "todos-fermer", "aria-label": "Fermer", title: "Fermer (Échap)", onclick: () => dialogue.close() }, icone("fermer", { taille: 18 }));
  // Icons only: the label is the accessible name and the tooltip.
  const annuler = el("button", { type: "button", class: "modale-todo-icone", "aria-label": "Annuler", title: "Annuler (Échap)", onclick: () => dialogue.close() }, icone("fermer", { taille: 20 }));
  const enregistrer = el(
    "button",
    { type: "submit", class: "modale-todo-icone modale-todo-icone--principal", "aria-label": edition ? "Enregistrer" : "Ajouter", title: `${edition ? "Enregistrer" : "Ajouter"} (Ctrl+Entrée)` },
    icone("enregistrer", { taille: 22 }),
  );
  // "Done": saves what was typed AND marks the todo as done (or reopens it) in one gesture.
  let basculerFait = false;
  const fait = edition
    ? el(
        "button",
        {
          type: "submit",
          class: `modale-todo-icone modale-todo-icone--fait${todo.fait ? " modale-todo-icone--fait-actif" : ""}`,
          "aria-pressed": String(!!todo.fait),
          "aria-label": todo.fait ? "Rouvrir le todo" : "Marquer comme fait",
          title: todo.fait ? "Rouvrir le todo (il redevient à faire)" : "Marquer comme fait et enregistrer",
          onclick: () => (basculerFait = true),
        },
        icone("fait", { taille: 22 }),
      )
    : null;
  const nomSujet = () => donnees.etat().sujets.find((x) => x.id === todo.sujetId)?.nom ?? "";
  async function exporter(faire, echec) {
    const ok = await faire({ todo, sujet: nomSujet(), donnees });
    if (!ok) toast(echec, { type: "erreur" });
  }
  async function demanderSuppression(retour = plus) {
    const ok = await confirmerSuppression({ message: `Le todo « ${todo.titre || "Sans titre"} » sera supprimé.`, retourFocus: retour });
    if (!ok) return;
    surSupprimer?.(todo.id);
    dialogue.close();
  }
  // Delete, in the footer too: an icon in the danger colour (the confirmation comes first).
  const supprimer = edition
    ? el(
        "button",
        { type: "button", class: "modale-todo-icone modale-todo-icone--danger", "aria-label": "Supprimer le todo", title: "Supprimer le todo", onclick: () => demanderSuppression(supprimer) },
        icone("poubelle", { taille: 20 }),
      )
    : null;
  // The actions on an existing todo wait behind "⋯": download (.md, .pdf) and delete.
  const plus = edition
    ? el(
        "button",
        {
          type: "button",
          class: "todos-fermer modale-todo-plus",
          "aria-haspopup": "menu",
          "aria-label": "Actions du todo",
          title: "Actions du todo",
          onclick: () => {
            const r = plus.getBoundingClientRect();
            ouvrirMenu({
              x: r.right - 220,
              y: r.bottom + 4,
              libelle: "Actions du todo",
              retourFocus: plus,
              entrees: [
                { libelle: "Télécharger en Markdown (.md)", onChoix: () => exporter(telechargerTodo, "Téléchargement impossible pour l'instant.") },
                { libelle: "Télécharger en PDF", onChoix: () => exporter(telechargerPdfTodo, "Export PDF impossible pour l'instant.") },
                "-",
                { libelle: "Supprimer le todo", danger: true, onChoix: () => demanderSuppression() },
              ],
            });
          },
        },
        icone("points", { taille: 20 }),
      )
    : null;

  const formulaire = el(
    "form",
    { class: "modale-todo-forme", novalidate: true, method: "dialog" },
    el(
      "header",
      { class: "modale-todo-entete" },
      el("h2", { id: `${id}-h`, class: "modale-todo-titre", texte: edition ? "Modifier le todo" : "Nouveau todo" }),
      el("div", { class: "modale-todo-outils" }, plus, fermerBtn),
    ),
    el(
      "div",
      { class: "modale-todo-corps" },
      champ("Titre", champTitre),
      champ("Description", champDescription),
      el("div", { class: "modale-todo-champ" }, el("span", { class: "modale-todo-etiquette", id: `${id}-img`, texte: "Image" }), zonePhoto),
      champ("Sujet", choixSujet),
      edition ? dates : null,
      message,
      champFichier,
      champCamera,
    ),
    el("footer", { class: "modale-todo-pied" }, fait, supprimer, el("span", { class: "modale-todo-espace" }), annuler, enregistrer),
  );
  const dialogue = el("dialog", { class: "modale-todo", role: "dialog", "aria-modal": "true", "aria-labelledby": `${id}-h` }, formulaire);
  zonePhoto.setAttribute("aria-labelledby", `${id}-img`);
  zonePhoto.setAttribute("role", "group");

  // --- Helpers -------------------------------------------------------------------------------------------
  function dire(texte) {
    message.textContent = texte ?? "";
    message.hidden = !texte;
  }
  const autoHauteur = (c, max) => {
    c.style.height = "auto";
    // border-box: the borders are not part of scrollHeight
    c.style.height = `${Math.min(c.scrollHeight + (c.offsetHeight - c.clientHeight), max)}px`;
  };
  const sujets = () => donnees.etat().sujets;
  choixSujet.replaceChildren(...sujets().map((s) => el("option", { value: s.id, texte: s.nom })));
  choixSujet.value = (edition ? todo.sujetId : sujetId) ?? sujets()[0]?.id ?? "";

  champTitre.value = todo?.titre ?? "";
  champDescription.value = todo?.description ?? "";

  champTitre.addEventListener("input", () => {
    // A title is one line: a break typed or pasted becomes a space.
    if (/[\r\n]/.test(champTitre.value)) champTitre.value = champTitre.value.replace(/\s*[\r\n]+\s*/g, " ");
    autoHauteur(champTitre, 140);
    dire(null);
  });
  champTitre.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      champDescription.focus();
    }
  });
  champDescription.addEventListener("input", () => autoHauteur(champDescription, 320));

  if (edition) {
    const depuis = todo.appareil || todo.appareilId ? libelleAppareilAffiche({ appareilId: todo.appareilId, appareil: todo.appareil }, appareils?.liste?.() ?? []) : "";
    const different = todo.modifieLe != null && todo.creeLe != null && Math.abs(todo.modifieLe - todo.creeLe) > 60_000;
    dates.replaceChildren(
      ...[
        el("span", { class: "todo-date" }, icone("horloge", { taille: 14 }), el("span", { texte: `Créé ${quand(todo.creeLe)}` })),
        depuis ? el("span", { class: "todo-date" }, icone("grille", { taille: 14 }), el("span", { texte: depuis })) : null,
        different ? el("span", { class: "todo-date" }, icone("crayon", { taille: 14 }), el("span", { texte: `Modifié ${quand(todo.modifieLe)}` })) : null,
      ].filter(Boolean),
    );
  }

  // --- The picture -----------------------------------------------------------------------------------------
  const existante = () => (edition && !etat.retirerExistante ? (todo.images?.[0] ?? null) : null);

  function choisirPhoto(f) {
    if (!f) return;
    const v = validerImage(f, { nbImages: 0, octetsUtilises: donnees.etat().compteurs.octets });
    if (!v.ok) return dire(v.erreur);
    if (etat.nouvelleUrl) URL.revokeObjectURL(etat.nouvelleUrl);
    etat.nouvelle = f;
    etat.nouvelleUrl = URL.createObjectURL(f);
    // One picture per todo: the new one replaces the saved one when the window is saved.
    if (todo?.images?.[0]) etat.retirerExistante = true;
    dire(null);
    rendrePhoto();
  }

  async function retirer() {
    if (etat.nouvelle) {
      URL.revokeObjectURL(etat.nouvelleUrl);
      etat.nouvelle = etat.nouvelleUrl = null;
    } else if (existante()) {
      const ok = await confirmerSuppression({ titre: "Retirer l'image ?", message: "L'image de ce todo sera supprimée à l'enregistrement.", retourFocus: null });
      if (!ok) return;
      etat.retirerExistante = true;
    }
    rendrePhoto();
    zonePhoto.querySelector("button")?.focus();
  }

  /** A large preview of the picture, and under it one line: name · copy · download · remove. */
  function ligneImage({ src, nom, ouvrir, actions = [] }) {
    const vignette = el("img", { class: "modale-todo-miniature", alt: "Aperçu de l'image", decoding: "async" });
    if (src) vignette.src = src;
    return el(
      "div",
      { class: "modale-todo-image" },
      ouvrir
        ? el("button", { type: "button", class: "modale-todo-apercu", "aria-label": "Voir l'image en grand", title: "Voir en grand", onclick: ouvrir }, vignette)
        : el("div", { class: "modale-todo-apercu modale-todo-apercu--fixe" }, vignette),
      el(
        "div",
        { class: "modale-todo-image-barre" },
        el("span", { class: "modale-todo-nom", title: nom, texte: nom }),
        ...actions,
        el("button", { type: "button", class: "modale-todo-retirer", "aria-label": "Retirer l'image", title: "Retirer l'image", onclick: retirer }, icone("fermer", { taille: 16 })),
      ),
    );
  }

  function rendrePhoto() {
    zonePhoto.replaceChildren();
    const image = existante();
    if (etat.nouvelle) {
      const n = etat.nouvelle.name && etat.nouvelle.name !== "image.png" ? etat.nouvelle.name : "Image collée";
      zonePhoto.append(ligneImage({ src: etat.nouvelleUrl, nom: n }));
      return;
    }
    if (image) {
      const ligne = ligneImage({
        src: etat.miniUrl,
        nom: "Image du todo",
        ouvrir: () => ouvrirVisionneuse({ images: () => todo.images, index: 0, lire: (c) => donnees.lireImage(c), retourFocus: zonePhoto.querySelector("button"), titre: todo.titre }),
        actions: boutonsActionsImage(
          actionsImage({ lire: () => donnees.lireImage(image.chemin), nom: () => nomTelechargementImage({ titre: todo.titre, typeMime: image.typeMime }) }),
          "modale-todo-action",
        ),
      });
      zonePhoto.append(ligne);
      if (!etat.miniUrl) {
        donnees
          .lireImage(image.chemin)
          .then((blob) => {
            if (!dialogue.isConnected) return;
            etat.miniUrl = URL.createObjectURL(blob);
            const v = zonePhoto.querySelector(".modale-todo-miniature");
            if (v) v.src = etat.miniUrl;
          })
          .catch(() => {});
      }
      return;
    }
    zonePhoto.append(
      el("button", { type: "button", class: "todo-ajout-photo", onclick: () => champFichier.click() }, icone("image", { taille: 18 }), el("span", { texte: "Ajouter une image" })),
    );
    // (append(null) would write the word "null")
    if (tactile()) zonePhoto.append(el("button", { type: "button", class: "todo-lien", texte: "Prendre une photo", onclick: () => champCamera.click() }));
  }

  // Ctrl+V with a picture in the clipboard, or a picture dropped on the window.
  const imageDe = (liste) => [...(liste ?? [])].find((f) => f.type?.startsWith("image/"));
  dialogue.addEventListener("paste", (e) => {
    const f = imageDe(e.clipboardData?.files);
    if (!f) return;
    e.preventDefault();
    choisirPhoto(f);
  });
  dialogue.addEventListener("dragover", (e) => [...(e.dataTransfer?.types ?? [])].includes("Files") && e.preventDefault());
  dialogue.addEventListener("drop", (e) => {
    const f = imageDe(e.dataTransfer?.files);
    if (!f) return;
    e.preventDefault();
    choisirPhoto(f);
  });

  // --- Saving ------------------------------------------------------------------------------------------------------
  function occuper(oui) {
    etat.occupe = oui;
    enregistrer.disabled = oui;
    annuler.disabled = oui;
  }

  formulaire.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (etat.occupe) {
      basculerFait = false;
      return;
    }
    const titre = champTitre.value.replace(/\s+/g, " ").trim();
    const description = champDescription.value;
    const photo = etat.nouvelle;
    dire(null);
    if (!edition) {
      if (!titre && !photo) return dire("Écrivez un titre ou joignez une image.");
      occuper(true);
      const r = await donnees.ajouterTodo(titre || "Photo", { sujetId: choixSujet.value || sujetId, description });
      if (!r.ok) {
        occuper(false);
        return dire(r.erreur);
      }
      dialogue.close();
      // The picture goes after the todo exists; a failure is told, the todo is kept.
      if (photo) {
        const envoi = await televerserPhoto({ donnees, todoId: r.id, fichier: photo, preparer });
        if (!envoi.ok) toast(`Todo ajouté, mais ${envoi.erreur.charAt(0).toLowerCase()}${envoi.erreur.slice(1)}`, { type: "erreur", duree: 8000 });
      }
      return;
    }
    if (!titre) {
      basculerFait = false;
      return dire("Le titre ne peut pas être vide.");
    }
    occuper(true);
    const champs = {};
    if (titre !== todo.titre) champs.titre = titre;
    if (description !== todo.description) champs.description = description;
    if (Object.keys(champs).length > 0) {
      const r = await donnees.majTodo(todo.id, champs);
      if (!r.ok) {
        occuper(false);
        return dire(r.erreur);
      }
    }
    if (choixSujet.value && choixSujet.value !== todo.sujetId) {
      const r = await donnees.deplacer(todo.id, choixSujet.value);
      if (!r.ok) {
        occuper(false);
        return dire(r.erreur);
      }
      toast(`Déplacé vers « ${choixSujet.selectedOptions[0]?.textContent ?? ""} »`);
    }
    if (basculerFait) donnees.cocher(todo.id);
    if (etat.retirerExistante && todo.images?.[0]) {
      const r = await donnees.supprimerImage(todo.id, todo.images[0]);
      if (!r.ok) {
        occuper(false);
        return dire(r.erreur);
      }
    }
    dialogue.close();
    if (photo) {
      const envoi = await televerserPhoto({ donnees, todoId: todo.id, fichier: photo, preparer });
      if (!envoi.ok) toast(envoi.erreur, { type: "erreur", duree: 8000 });
    }
  });

  dialogue.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      formulaire.requestSubmit?.();
    }
  });
  // A click on the backdrop closes (the window fills its own box: a click outside it hits the dialog itself).
  dialogue.addEventListener("pointerdown", (e) => {
    if (e.target === dialogue) dialogue.close();
  });
  dialogue.addEventListener("close", () => {
    for (const u of [etat.nouvelleUrl, etat.miniUrl]) if (u) URL.revokeObjectURL(u);
    rapatrierToasts();
    dialogue.remove();
    (retourFocus?.isConnected ? retourFocus : null)?.focus?.();
  });

  document.body.append(dialogue);
  dialogue.showModal();
  rendrePhoto();
  autoHauteur(champTitre, 140);
  autoHauteur(champDescription, 320);
  // Measured again once the window is laid out (the width is final then).
  requestAnimationFrame(() => {
    autoHauteur(champTitre, 140);
    autoHauteur(champDescription, 320);
  });
  if (fichier) choisirPhoto(fichier);
  if (!edition || grandEcran()) champTitre.focus();
  else fermerBtn.focus();
  return { dialogue, fermer: () => dialogue.open && dialogue.close() };
}
