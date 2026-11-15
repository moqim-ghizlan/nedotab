import { libelleAppareilAffiche } from "../../core/appareils.js";
import { validerImage } from "../../core/imagesTodo.js";
import { PISTES_MAX, PISTE_DESCRIPTION_MAX, PISTE_TITRE_MAX, creerPiste, imageDePiste, nouvelIdPiste, pisteVide } from "../../core/pistes.js";
import { TITRE_MAX } from "../../core/todos.js";
import { nomTelechargementImage } from "../../core/imageSortie.js";
import { actionsImage, boutonsActionsImage } from "../copierImage.js";
import { confirmerSuppression } from "../dialogues/confirmerSuppression.js";
import { el } from "../dom.js";
import { icone } from "../icones.js";
import { ouvrirMenu } from "../menuContextuel.js";
import { rapatrierToasts, toast } from "../toast.js";
import { rendreDeplacable } from "./deplacerModale.js";
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
 * The window to create or edit a todo: its title, its pistes (each with a title, a description and
 * one picture; PISTES_MAX at most), the subject, and (when it exists) Delete. Nothing is written
 * before "Enregistrer"; "Annuler", Escape and the backdrop leave everything as it was. Only the
 * fields that changed are written (partial writes). Everything the user wrote goes through value /
 * textContent, never HTML. A phone gets a sheet over the screen.
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
  const etat = { occupe: false };
  /** The pistes being edited. `nouvelle`: a picture chosen in this window, not yet sent. */
  const pistes = [];
  /** Pistes deleted in this window (their saved picture is deleted when the window is saved). */
  const retirees = [];
  const urls = new Set();

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
  const choixSujet = el("select", { id: `${id}-sujet`, class: "todo-champ todo-champ--sujet" });
  const message = el("p", { class: "modale-todo-message", role: "alert", hidden: true });
  const listePistes = el("div", { class: "modale-pistes" });
  const ajoutPiste = el("button", { type: "button", class: "modale-pistes-ajout", onclick: () => ajouterPiste() }, icone("plus", { taille: 16 }), el("span", { texte: "Ajouter une piste" }));
  const dates = el("div", { class: "todo-dates" });

  let pisteCible = null; // the piste waiting for the file chosen in one of the two inputs
  const champFichier = el("input", { type: "file", accept: "image/jpeg,image/png,image/webp", hidden: true, tabindex: "-1", "aria-hidden": "true" });
  const champCamera = el("input", { type: "file", accept: "image/jpeg,image/png,image/webp", capture: "environment", hidden: true, tabindex: "-1", "aria-hidden": "true" });
  for (const c of [champFichier, champCamera])
    c.addEventListener("change", () => {
      choisirPhoto(pisteCible, c.files?.[0]);
      c.value = "";
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
      el("div", { class: "modale-todo-champ" }, el("span", { class: "modale-todo-etiquette", id: `${id}-pistes`, texte: "Pistes" }), listePistes, ajoutPiste),
      champ("Sujet", choixSujet),
      edition ? dates : null,
      message,
      champFichier,
      champCamera,
    ),
    el("footer", { class: "modale-todo-pied" }, fait, supprimer, el("span", { class: "modale-todo-espace" }), annuler, enregistrer),
  );
  const dialogue = el("dialog", { class: "modale-todo", role: "dialog", "aria-modal": "true", "aria-labelledby": `${id}-h` }, formulaire);
  listePistes.setAttribute("aria-labelledby", `${id}-pistes`);
  listePistes.setAttribute("role", "list");

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

  champTitre.addEventListener("input", () => {
    // A title is one line: a break typed or pasted becomes a space.
    if (/[\r\n]/.test(champTitre.value)) champTitre.value = champTitre.value.replace(/\s*[\r\n]+\s*/g, " ");
    autoHauteur(champTitre, 140);
    dire(null);
  });
  champTitre.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      listePistes.querySelector("input, textarea")?.focus();
    }
  });

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

  // --- The pistes --------------------------------------------------------------------------------------------
  const aUneImage = (p) => !!p.nouvelle || (!!p.existante && !p.retirerExistante);

  function nouvellePiste(base = {}) {
    return { ...creerPiste(base, nouvelIdPiste), existante: base.existante ?? null, retirerExistante: false, nouvelle: null, nouvelleUrl: null, miniUrl: null };
  }

  function majBoutonAjout() {
    ajoutPiste.disabled = pistes.length >= PISTES_MAX;
    ajoutPiste.title = ajoutPiste.disabled ? `${PISTES_MAX} pistes au maximum` : "";
  }

  function ajouterPiste(base = {}) {
    if (pistes.length >= PISTES_MAX) {
      dire(`${PISTES_MAX} pistes au maximum.`);
      return null;
    }
    const p = nouvellePiste(base);
    pistes.push(p);
    dire(null);
    rendrePistes(p.id);
    return p;
  }

  async function retirerPiste(p) {
    if (!pisteVide(p, !!p.nouvelle) || p.existante) {
      const ok = await confirmerSuppression({ titre: "Supprimer la piste ?", message: "La piste, son texte et son image seront supprimés à l'enregistrement.", retourFocus: null });
      if (!ok) return;
    }
    if (p.nouvelleUrl) URL.revokeObjectURL(p.nouvelleUrl);
    pistes.splice(pistes.indexOf(p), 1);
    p.supprimee = true;
    retirees.push(p);
    rendrePistes();
    (listePistes.querySelector(".modale-piste input, .modale-piste textarea") ?? ajoutPiste).focus();
  }

  function deplacerPiste(p, pas) {
    const i = pistes.indexOf(p);
    const j = i + pas;
    if (j < 0 || j >= pistes.length) return;
    pistes.splice(i, 1);
    pistes.splice(j, 0, p);
    rendrePistes(p.id, true);
  }

  function choisirPhoto(p, f) {
    if (!f) return;
    const cible = p ?? pistes.find((x) => !aUneImage(x)) ?? ajouterPiste();
    if (!cible) return;
    const v = validerImage(f, { nbImages: 0, octetsUtilises: donnees.etat().compteurs.octets });
    if (!v.ok) return dire(v.erreur);
    if (cible.nouvelleUrl) URL.revokeObjectURL(cible.nouvelleUrl);
    cible.nouvelle = f;
    cible.nouvelleUrl = URL.createObjectURL(f);
    urls.add(cible.nouvelleUrl);
    // One picture per piste: the new one replaces the saved one when the window is saved.
    if (cible.existante) cible.retirerExistante = true;
    dire(null);
    rendrePistes(cible.id);
  }

  async function retirerImage(p) {
    if (p.nouvelle) {
      URL.revokeObjectURL(p.nouvelleUrl);
      p.nouvelle = p.nouvelleUrl = null;
      if (p.existante) p.retirerExistante = false;
    } else if (p.existante && !p.retirerExistante) {
      const ok = await confirmerSuppression({ titre: "Retirer l'image ?", message: "L'image de cette piste sera supprimée à l'enregistrement.", retourFocus: null });
      if (!ok) return;
      p.retirerExistante = true;
    }
    rendrePistes(p.id);
  }

  /** A large preview of the picture, and under it one line: name · copy · download · remove. */
  function ligneImage(p, { src, nom, ouvrir, actions = [] }) {
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
        el("button", { type: "button", class: "modale-todo-retirer", "aria-label": "Retirer l'image", title: "Retirer l'image", onclick: () => retirerImage(p) }, icone("fermer", { taille: 16 })),
      ),
    );
  }

  function zoneImage(p) {
    const zone = el("div", { class: "modale-todo-photo", role: "group", "aria-label": "Image de la piste" });
    if (p.nouvelle) {
      const n = p.nouvelle.name && p.nouvelle.name !== "image.png" ? p.nouvelle.name : "Image collée";
      zone.append(ligneImage(p, { src: p.nouvelleUrl, nom: n }));
      return zone;
    }
    const image = p.existante && !p.retirerExistante ? p.existante : null;
    if (image) {
      const libelle = () => p.titre || todo?.titre || "";
      zone.append(
        ligneImage(p, {
          src: p.miniUrl,
          nom: "Image de la piste",
          ouvrir: (e) => ouvrirVisionneuse({ images: () => [image], index: 0, lire: (c) => donnees.lireImage(c), retourFocus: e?.currentTarget ?? null, titre: libelle() }),
          actions: boutonsActionsImage(
            actionsImage({ lire: () => donnees.lireImage(image.chemin), nom: () => nomTelechargementImage({ titre: libelle(), typeMime: image.typeMime }) }),
            "modale-todo-action",
          ),
        }),
      );
      if (!p.miniUrl) {
        donnees
          .lireImage(image.chemin)
          .then((blob) => {
            if (!dialogue.isConnected || p.supprimee) return;
            p.miniUrl = URL.createObjectURL(blob);
            urls.add(p.miniUrl);
            const v = zone.querySelector(".modale-todo-miniature");
            if (v) v.src = p.miniUrl;
          })
          .catch(() => {});
      }
      return zone;
    }
    zone.append(
      el("button", { type: "button", class: "todo-ajout-photo", onclick: () => ((pisteCible = p), champFichier.click()) }, icone("image", { taille: 18 }), el("span", { texte: "Ajouter une image" })),
    );
    // (append(null) would write the word "null")
    if (tactile()) zone.append(el("button", { type: "button", class: "todo-lien", texte: "Prendre une photo", onclick: () => ((pisteCible = p), champCamera.click()) }));
    return zone;
  }

  function carte(p, i) {
    const idp = `${id}-p${i}`;
    const titre = el("input", { id: `${idp}-t`, type: "text", class: "todo-champ modale-piste-titre", placeholder: "Titre de la piste", maxlength: String(PISTE_TITRE_MAX), autocomplete: "off", "aria-label": `Titre de la piste ${i + 1}` });
    titre.value = p.titre;
    titre.addEventListener("input", () => {
      p.titre = titre.value.replace(/\s+/g, " ");
      dire(null);
    });
    const description = el("textarea", { id: `${idp}-d`, class: "todo-champ todo-champ--description modale-piste-description", rows: "3", placeholder: "Notes, détails…", maxlength: String(PISTE_DESCRIPTION_MAX), "aria-label": `Description de la piste ${i + 1}` });
    description.value = p.description;
    description.addEventListener("input", () => {
      p.description = description.value;
      autoHauteur(description, 320);
    });
    titre.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        description.focus();
      }
    });
    const bouton = (classe, libelle, ic, onclick, desactive = false) =>
      el("button", { type: "button", class: `modale-piste-action ${classe}`, "aria-label": `${libelle} (piste ${i + 1})`, title: libelle, disabled: desactive, onclick }, icone(ic, { taille: 16 }));
    const section = el(
      "section",
      { class: "modale-piste", role: "listitem", dataset: { id: p.id } },
      el(
        "div",
        { class: "modale-piste-entete" },
        el("span", { class: "modale-piste-numero", texte: `Piste ${i + 1}` }),
        el(
          "div",
          { class: "modale-piste-actions" },
          bouton("modale-piste-monter", "Monter", "haut", () => deplacerPiste(p, -1), i === 0),
          bouton("modale-piste-descendre", "Descendre", "bas", () => deplacerPiste(p, 1), i === pistes.length - 1),
          bouton("modale-piste-supprimer", "Supprimer la piste", "poubelle", () => retirerPiste(p)),
        ),
      ),
      titre,
      description,
      zoneImage(p),
    );
    p.champs = { titre, description };
    return section;
  }

  /** Draws the pistes again (what was typed is in the objects); `focusId`: the piste to focus. */
  function rendrePistes(focusId = null, focusDeplacement = false) {
    listePistes.replaceChildren(...pistes.map((p, i) => carte(p, i)));
    listePistes.hidden = pistes.length === 0;
    majBoutonAjout();
    for (const p of pistes) if (p.champs) autoHauteur(p.champs.description, 320);
    if (!focusId) return;
    const cible = listePistes.querySelector(`.modale-piste[data-id="${CSS.escape(focusId)}"]`);
    if (focusDeplacement) cible?.querySelector(".modale-piste-monter:not(:disabled), .modale-piste-descendre:not(:disabled)")?.focus();
    else cible?.querySelector(".modale-piste-titre")?.focus();
  }

  // Ctrl+V with a picture in the clipboard, or a picture dropped on the window.
  const imageDe = (liste) => [...(liste ?? [])].find((f) => f.type?.startsWith("image/"));
  const pisteDeLaCible = (e) => {
    const sec = e.target?.closest?.(".modale-piste");
    return sec ? (pistes.find((p) => p.id === sec.dataset.id) ?? null) : null;
  };
  dialogue.addEventListener("paste", (e) => {
    const f = imageDe(e.clipboardData?.files);
    if (!f) return;
    e.preventDefault();
    choisirPhoto(pisteDeLaCible(e), f);
  });
  dialogue.addEventListener("dragover", (e) => [...(e.dataTransfer?.types ?? [])].includes("Files") && e.preventDefault());
  dialogue.addEventListener("drop", (e) => {
    const f = imageDe(e.dataTransfer?.files);
    if (!f) return;
    e.preventDefault();
    choisirPhoto(pisteDeLaCible(e), f);
  });

  // --- Saving ------------------------------------------------------------------------------------------------------
  function occuper(oui) {
    etat.occupe = oui;
    enregistrer.disabled = oui;
    annuler.disabled = oui;
  }

  /** The pistes to keep: the empty ones (no text, no picture) are left out. */
  const aGarder = () => pistes.filter((p) => !pisteVide({ ...p, imageId: p.existante && !p.retirerExistante ? p.existante.id : null }, !!p.nouvelle));
  /** What is stored for a piste: its picture stays only when it is neither replaced nor removed. */
  const donneePiste = (p) => ({ id: p.id, titre: p.titre.trim(), description: p.description, imageId: p.nouvelle || p.retirerExistante ? null : (p.existante?.id ?? null) });

  async function envoyerImages(todoId, liste) {
    for (const p of liste.filter((x) => x.nouvelle)) {
      const envoi = await televerserPhoto({ donnees, todoId, fichier: p.nouvelle, pisteId: p.id, preparer });
      if (!envoi.ok) toast(edition ? envoi.erreur : `Todo ajouté, mais ${envoi.erreur.charAt(0).toLowerCase()}${envoi.erreur.slice(1)}`, { type: "erreur", duree: 8000 });
    }
  }

  formulaire.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (etat.occupe) {
      basculerFait = false;
      return;
    }
    const titre = champTitre.value.replace(/\s+/g, " ").trim();
    const gardees = aGarder();
    dire(null);
    if (!edition) {
      if (!titre && !gardees.some((p) => p.nouvelle)) return dire("Écrivez un titre ou joignez une image.");
      occuper(true);
      const r = await donnees.ajouterTodo(titre || "Photo", { sujetId: choixSujet.value || sujetId, pistes: gardees.map(donneePiste) });
      if (!r.ok) {
        occuper(false);
        return dire(r.erreur);
      }
      dialogue.close();
      // The pictures go after the todo exists; a failure is told, the todo is kept.
      await envoyerImages(r.id, gardees);
      return;
    }
    if (!titre) {
      basculerFait = false;
      return dire("Le titre ne peut pas être vide.");
    }
    occuper(true);
    const champs = {};
    if (titre !== todo.titre) champs.titre = titre;
    const voulues = gardees.map(donneePiste);
    const avant = (todo.pistes ?? []).map((p) => ({ id: p.id, titre: p.titre, description: p.description, imageId: p.imageId ?? null }));
    // An old todo (version 1) is saved in the new format as soon as its pistes are touched.
    if (JSON.stringify(voulues) !== JSON.stringify(avant)) champs.pistes = voulues;
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
    // Pictures to delete: removed or replaced ones, and those of the pistes that were deleted.
    const aSupprimer = [...pistes, ...retirees]
      .filter((p) => p.existante && (p.retirerExistante || p.supprimee || !gardees.includes(p)))
      .map((p) => p.existante)
      .filter((im, i, tous) => tous.findIndex((x) => x.id === im.id) === i);
    for (const image of aSupprimer) {
      const r = await donnees.supprimerImage(todo.id, image);
      if (!r.ok) {
        occuper(false);
        return dire(r.erreur);
      }
    }
    dialogue.close();
    await envoyerImages(todo.id, gardees);
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
  const retirerDeplacement = rendreDeplacable(dialogue, formulaire.querySelector(".modale-todo-entete"));
  dialogue.addEventListener("close", () => {
    retirerDeplacement();
    for (const u of urls) URL.revokeObjectURL(u);
    for (const p of pistes) if (p.nouvelleUrl) URL.revokeObjectURL(p.nouvelleUrl);
    rapatrierToasts();
    dialogue.remove();
    (retourFocus?.isConnected ? retourFocus : null)?.focus?.();
  });

  document.body.append(dialogue);
  dialogue.showModal();
  // The pistes of the todo (an old todo shows its one piste); a new todo starts with an empty one.
  if (edition) for (const p of todo.pistes ?? []) pistes.push(nouvellePiste({ ...p, existante: imageDePiste(todo, p) }));
  else pistes.push(nouvellePiste());
  rendrePistes();
  autoHauteur(champTitre, 140);
  // Measured again once the window is laid out (the width is final then).
  requestAnimationFrame(() => {
    autoHauteur(champTitre, 140);
    for (const p of pistes) if (p.champs) autoHauteur(p.champs.description, 320);
  });
  if (fichier) choisirPhoto(pistes[0] ?? null, fichier);
  if (!edition || grandEcran()) champTitre.focus();
  else fermerBtn.focus();
  return { dialogue, fermer: () => dialogue.open && dialogue.close() };
}
