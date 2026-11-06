import { libelleAppareilAffiche } from "../../core/appareils.js";
import { creerDiffere } from "../../core/differe.js";
import { cheminMini, validerImage, validerResultat } from "../../core/imagesTodo.js";
import { DESCRIPTION_MAX, TITRE_MAX } from "../../core/todos.js";
import { vibrer } from "../haptique.js";
import { el } from "../dom.js";
import { icone } from "../icones.js";
import { ErreurImage, preparerImage } from "./compresserImage.js";
import { ouvrirVisionneuse } from "./visionneuse.js";

export const SANS_TITRE = "Sans titre";
const tactile = () => !!globalThis.matchMedia?.("(pointer: coarse)").matches;

/**
 * One todo: a line (tick, title, small picture) that opens IN PLACE to show what a todo holds,
 * which is all there is: a title, a description and one picture. Typing is saved 1.5 s after the
 * last key and when the line closes; only the changed fields are written. A snapshot never
 * replaces a field that has the focus or waits to be saved. Everything the user wrote goes
 * through textContent / value, never HTML.
 *
 * @param {object} d
 * @param {ReturnType<import("./donneesTodos.js").creerDonneesTodos>} d.donnees
 * @param {object} d.todo
 * @param {(id: string, ouvrir: boolean) => void} d.surBascule asks the list to open / close this line
 * @param {import("../../core/store.js").Store} [d.store]
 * @param {typeof preparerImage} [d.preparer] (tests)
 */
export function creerLigneTodo({ donnees, todo, surBascule, store, preparer = preparerImage, appareils = null }) {
  let courant = todo;
  let ouvert = false;
  let miniUrl = null;
  let miniChemin = null;
  let photoUrl = null;
  let photoChemin = null;
  let envoi = null; // { part: number } while a picture is on its way
  let aEcrire = {}; // typed, not yet sent

  // --- The line ---------------------------------------------------------------------------------
  const case_ = el(
    "button",
    {
      type: "button",
      class: "todo-case",
      role: "checkbox",
      "aria-checked": "false",
      onclick: () => {
        if (store) vibrer(store, 8);
        donnees.cocher(courant.id);
      },
    },
    icone("coche", { taille: 16 }),
  );
  const titre = el("span", { class: "todo-titre" });
  const indices = el("span", { class: "todo-indices", "aria-hidden": "true" });
  const mini = el("img", { class: "todo-mini", alt: "", decoding: "async", hidden: true });
  const corps = el(
    "button",
    { type: "button", class: "todo-corps", "aria-expanded": "false", onclick: () => surBascule(courant.id, !ouvert) },
    mini,
    el("span", { class: "todo-textes" }, titre, indices),
    icone("chevron", { taille: 16 }),
  );

  // --- What opens ----------------------------------------------------------------------------------
  const champTitre = el("input", {
    type: "text",
    class: "todo-champ todo-champ--titre",
    "aria-label": "Titre",
    placeholder: "Titre",
    maxlength: String(TITRE_MAX * 2),
    autocomplete: "off",
  });
  const champDescription = el("textarea", {
    class: "todo-champ todo-champ--description",
    "aria-label": "Description",
    placeholder: "Ajouter une description",
    rows: "3",
    maxlength: String(DESCRIPTION_MAX),
  });
  const message = el("p", { class: "todo-message", role: "status", "aria-live": "polite", hidden: true });
  const zonePhoto = el("div", { class: "todo-photo-zone" });
  const dates = el("dl", { class: "todo-dates" });
  const champFichier = el("input", {
    type: "file",
    accept: "image/jpeg,image/png,image/webp",
    hidden: true,
    tabindex: "-1",
    "aria-hidden": "true",
    onchange: () => ajouterPhoto(champFichier.files?.[0]).finally(() => (champFichier.value = "")),
  });
  // Phones: the camera has its own field (Safari turns HEIC into JPEG because of `accept`).
  const champCamera = el("input", {
    type: "file",
    accept: "image/jpeg,image/png,image/webp",
    capture: "environment",
    hidden: true,
    tabindex: "-1",
    "aria-hidden": "true",
    onchange: () => ajouterPhoto(champCamera.files?.[0]).finally(() => (champCamera.value = "")),
  });
  const supprimer = el("button", {
    type: "button",
    class: "todo-supprimer",
    texte: "Supprimer le todo",
    onclick: () => surSuppression?.(courant.id),
  });
  let surSuppression = null;
  const interieur = el(
    "div",
    { class: "todo-detail-interieur" },
    champTitre,
    champDescription,
    zonePhoto,
    message,
    dates,
    el("div", { class: "todo-actions" }, supprimer),
    champFichier,
    champCamera,
  );
  const detail = el("div", { class: "todo-detail", id: `todo-detail-${todo.id}` }, interieur);
  detail.inert = true;
  corps.setAttribute("aria-controls", detail.id);
  const li = el("li", { class: "todo", dataset: { id: todo.id } }, el("div", { class: "todo-tete" }, case_, corps), detail);

  // --- Dates and device ------------------------------------------------------------------------------
  const quand = (ms) =>
    ms == null ? "à l'instant" : new Date(ms).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });
  function rendreDates(t) {
    const depuis = t.appareil || t.appareilId ? libelleAppareilAffiche({ appareilId: t.appareilId, appareil: t.appareil }, appareils?.liste?.() ?? []) : "";
    dates.replaceChildren(
      el("dt", { texte: "Créé" }),
      el("dd", { texte: `${quand(t.creeLe)}${depuis ? `, depuis ${depuis}` : ""}` }),
      el("dt", { texte: "Modifié" }),
      el("dd", { texte: quand(t.modifieLe) }),
    );
  }

  // --- Saving ----------------------------------------------------------------------------------------
  const differe = creerDiffere(() => envoyer(), 1500);
  async function envoyer() {
    const champs = aEcrire;
    aEcrire = {};
    if (Object.keys(champs).length === 0) return;
    const r = await donnees.majTodo(courant.id, champs);
    dire(r.ok ? null : r.erreur);
  }
  champTitre.addEventListener("input", () => {
    // An empty title is not saved: the previous one stays.
    if (champTitre.value.trim()) aEcrire = { ...aEcrire, titre: champTitre.value.trim() };
    else delete aEcrire.titre;
    differe.appeler(true);
  });
  champDescription.addEventListener("input", () => {
    aEcrire = { ...aEcrire, description: champDescription.value };
    autoHauteur();
    differe.appeler(true);
  });
  const autoHauteur = () => {
    champDescription.style.height = "auto";
    champDescription.style.height = `${Math.min(champDescription.scrollHeight, 320)}px`;
  };

  function dire(texte) {
    message.textContent = texte ?? "";
    message.hidden = !texte;
  }

  // --- The picture ------------------------------------------------------------------------------------
  async function charger(chemin, cible, ancien, poser) {
    if (ancien.chemin === chemin) return;
    poser(chemin, null);
    if (!chemin) return;
    try {
      const url = URL.createObjectURL(await donnees.lireImage(chemin));
      if (ancien.chemin !== chemin) return URL.revokeObjectURL(url); // another picture came meanwhile
      poser(chemin, url);
      cible.src = url;
      cible.hidden = false;
    } catch {
      cible.hidden = true;
    }
  }

  async function ajouterPhoto(fichier) {
    if (!fichier || envoi) return;
    if (navigator.onLine === false) return dire("Ajout de photo impossible hors ligne.");
    const v = validerImage(fichier, { nbImages: courant.images.length, octetsUtilises: donnees.etat().compteurs.octets });
    if (!v.ok) return dire(v.erreur);
    dire(null);
    envoi = { part: 0 };
    rendrePhoto();
    try {
      const prete = await preparer(fichier);
      const ok = validerResultat(prete.blob.size, donnees.etat().compteurs.octets);
      if (!ok.ok) throw new ErreurImage(ok.erreur, ok.code);
      const { promesse } = await donnees.envoyerImage(courant.id, prete, {
        surProgres: (p) => {
          envoi.part = p;
          rendrePhoto();
        },
      });
      await promesse;
    } catch (e) {
      dire(
        e instanceof ErreurImage
          ? e.message
          : e?.code === "not-found"
            ? "Ce todo a été supprimé sur un autre appareil."
            : "La photo n'a pas pu être envoyée. Réessayez.",
      );
    }
    envoi = null;
    rendrePhoto();
  }

  async function retirerPhoto() {
    const image = courant.images[0];
    if (!image) return;
    const r = await donnees.supprimerImage(courant.id, image);
    dire(r.ok ? null : r.erreur);
  }

  function voirPhoto() {
    ouvrirVisionneuse({
      images: () => courant.images,
      index: 0,
      lire: (chemin) => donnees.lireImage(chemin),
      retourFocus: zonePhoto.querySelector("button"),
    });
  }

  function rendrePhoto() {
    const image = courant.images[0];
    zonePhoto.replaceChildren();
    if (envoi) {
      zonePhoto.append(
        el("div", { class: "todo-envoi", role: "status" }, el("span", { texte: "Envoi de la photo…" }), el("progress", { max: "1", value: String(envoi.part), "aria-label": "Envoi de la photo" })),
      );
      return;
    }
    if (image) {
      const img = el("img", { class: "todo-photo-image", alt: "Photo du todo", decoding: "async" });
      if (photoUrl && photoChemin === image.chemin) img.src = photoUrl;
      zonePhoto.append(
        el("button", { type: "button", class: "todo-photo", "aria-label": "Voir la photo en grand", onclick: voirPhoto }, img),
        el("button", { type: "button", class: "todo-lien", texte: "Retirer la photo", onclick: retirerPhoto }),
      );
      return;
    }
    zonePhoto.append(
      el("button", { type: "button", class: "todo-ajout-photo", onclick: () => champFichier.click() }, icone("image", { taille: 18 }), el("span", { texte: "Ajouter une photo" })),
    );
    // (append(null) would write the word "null")
    if (tactile()) zonePhoto.append(el("button", { type: "button", class: "todo-lien", texte: "Prendre une photo", onclick: () => champCamera.click() }));
  }

  // Ctrl+V with a picture in the clipboard (a pasted text stays a pasted text).
  detail.addEventListener("paste", (e) => {
    const f = [...(e.clipboardData?.files ?? [])].find((x) => x.type.startsWith("image/"));
    if (!f) return;
    e.preventDefault();
    ajouterPhoto(f);
  });

  // --- Updating --------------------------------------------------------------------------------------------
  function maj(t) {
    courant = t;
    const nom = t.titre || SANS_TITRE;
    titre.textContent = nom;
    titre.classList.toggle("todo-titre--vide", !t.titre);
    indices.textContent = t.description ? t.description.split("\n")[0].slice(0, 90) : "";
    indices.hidden = !t.description;
    li.classList.toggle("todo--faite", !!t.fait);
    li.classList.toggle("todo--attente", !!t.enAttente);
    case_.setAttribute("aria-checked", String(!!t.fait));
    case_.setAttribute("aria-label", `${t.fait ? "Rouvrir" : "Terminer"} : ${nom}`);
    // A snapshot never replaces what is being typed or waits to be saved.
    if (document.activeElement !== champTitre && !("titre" in aEcrire)) champTitre.value = t.titre;
    if (document.activeElement !== champDescription && !("description" in aEcrire)) {
      champDescription.value = t.description;
      if (ouvert) autoHauteur();
    }
    const image = t.images[0] ?? null;
    charger(image ? cheminMini(image.chemin) : null, mini, { get chemin() { return miniChemin; } }, (c, u) => {
      miniChemin = c;
      if (miniUrl && miniUrl !== u) URL.revokeObjectURL(miniUrl);
      miniUrl = u;
    });
    if (!image) mini.hidden = true;
    if (ouvert && image) chargerPhoto(image);
    if (!envoi) rendrePhoto();
    rendreDates(t);
  }

  function chargerPhoto(image) {
    charger(image.chemin, new Image(), { get chemin() { return photoChemin; } }, (c, u) => {
      photoChemin = c;
      if (photoUrl && photoUrl !== u) URL.revokeObjectURL(photoUrl);
      photoUrl = u;
      if (u) rendrePhoto();
    });
  }

  function basculer(oui) {
    ouvert = oui;
    li.classList.toggle("todo--ouvert", oui);
    corps.setAttribute("aria-expanded", String(oui));
    detail.inert = !oui;
    if (oui) {
      champTitre.value = aEcrire.titre ?? courant.titre;
      champDescription.value = aEcrire.description ?? courant.description;
      autoHauteur();
      if (courant.images[0]) chargerPhoto(courant.images[0]);
      rendrePhoto();
    } else {
      differe.vider();
      dire(null);
    }
  }

  function liberer() {
    differe.vider();
    for (const u of [miniUrl, photoUrl]) if (u) URL.revokeObjectURL(u);
    miniUrl = photoUrl = null;
  }

  maj(todo);
  return {
    li,
    maj,
    basculer,
    liberer,
    vider: () => differe.vider(),
    estOuvert: () => ouvert,
    id: todo.id,
    corps,
    focusTitre: () => champTitre.focus(),
    surSuppression(f) {
      surSuppression = f;
    },
    /** Tests. */
    ajouterPhoto,
  };
}
