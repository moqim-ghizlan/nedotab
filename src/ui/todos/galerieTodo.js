import { creerDiffere } from "../../core/differe.js";
import {
  IMAGES_MAX,
  NOTE_MAX,
  niveauQuota,
  texteQuota,
  validerImage,
  validerResultat,
} from "../../core/imagesTodo.js";
import { el } from "../dom.js";
import { icone } from "../icones.js";
import { ouvrirMenu } from "../menuContextuel.js";
import { toast } from "../toast.js";
import { ErreurImage, preparerImage } from "./compresserImage.js";
import { reconcilier } from "./listeCle.js";
import { ouvrirVisionneuse } from "./visionneuse.js";

const aDesImages = (e) => [...(e.dataTransfer?.types ?? [])].includes("Files");

/**
 * Gallery of the pictures of a todo, plugged into the editor (V6.4): add by dropping files on the
 * whole sheet, by pasting (Ctrl+V) or with the button; thumbnails (read lazily from Storage with
 * their own small file), one note per picture (saved 1.5 s after the last key), viewer, reorder,
 * remove. Pictures are added ONE AT A TIME (memory), compressed and cleaned of their EXIF block
 * first. Not available offline (clear message).
 *
 * The editor calls: `monter` once the window exists, `maj(todo)` at every snapshot, `liberer()`
 * on close.
 *
 * @param {object} d
 * @param {ReturnType<import("./donneesTodos.js").creerDonneesTodos>} d.donnees
 * @param {typeof preparerImage} [d.preparer] (tests)
 */
export function creerGalerieTodo({ donnees, preparer = preparerImage }) {
  let images = [];
  let contexte = null; // { dialogue, id, assurerExistence }
  let observateur = null;
  const lignes = new Map();
  const urls = new Map(); // path of the thumbnail → local address
  const notes = new Map(); // image id → delayed write
  const envois = []; // { cle, nom, part, annuler, erreur }

  const message = el("p", { class: "todos-message", role: "status", "aria-live": "polite", hidden: true });
  const quota = el("p", { class: "todo-galerie-quota", hidden: true });
  const liste = el("ul", { class: "todo-galerie", "aria-label": "Images du todo" });
  const progres = el("ul", { class: "todo-envois", "aria-label": "Envois en cours" });
  const racine = el("section", { class: "todo-galerie-zone", "aria-label": "Images" }, message, liste, progres, quota);
  const champFichier = el("input", {
    type: "file",
    accept: "image/jpeg,image/png,image/webp",
    multiple: true,
    hidden: true,
    "aria-hidden": "true",
    tabindex: "-1",
    onchange: () => {
      ajouterFichiers([...champFichier.files]);
      champFichier.value = "";
    },
  });
  const bouton = el(
    "button",
    {
      type: "button",
      class: "todos-fermer",
      "aria-label": "Ajouter une image",
      title: "Ajouter une image",
      onclick: () => champFichier.click(),
    },
    icone("image", { taille: 18 }),
  );
  racine.append(champFichier);

  function dire(texte, erreur = true) {
    message.textContent = texte ?? "";
    message.hidden = !texte;
    message.classList.toggle("todos-message--erreur", !!texte && erreur);
  }

  const octets = () => donnees.etat().compteurs.octets ?? 0;

  // --- Adding ------------------------------------------------------------------------------------
  async function ajouterFichiers(fichiers) {
    const images_ = fichiers.filter(Boolean);
    if (images_.length === 0) return;
    if (navigator.onLine === false) return dire("Ajout d'image impossible hors ligne.");
    dire(null);
    let todoId;
    try {
      todoId = await contexte.assurerExistence();
    } catch {
      return dire("Le todo n'a pas pu être créé : réessayez.");
    }
    for (const fichier of images_) {
      const v = validerImage(fichier, {
        nbImages: images.length + envois.filter((e) => !e.erreur).length,
        octetsUtilises: octets(),
      });
      if (!v.ok) {
        dire(v.erreur);
        if (v.code === "limite") break;
        continue;
      }
      await envoyerUn(todoId, fichier);
    }
  }

  async function envoyerUn(todoId, fichier) {
    const envoi = { cle: `e${Math.random().toString(36).slice(2)}`, nom: fichier.name, part: 0, annuler: null, erreur: null };
    envois.push(envoi);
    rendreEnvois();
    const retirer = () => {
      const i = envois.indexOf(envoi);
      if (i >= 0) envois.splice(i, 1);
      rendreEnvois();
    };
    try {
      const prete = await preparer(fichier);
      const ok = validerResultat(prete.blob.size, octets());
      if (!ok.ok) throw new ErreurImage(ok.erreur, ok.code);
      const { promesse, annuler } = await donnees.envoyerImage(todoId, prete, {
        surProgres: (p) => {
          envoi.part = p;
          rendreEnvois();
        },
      });
      envoi.annuler = annuler;
      await promesse;
      retirer();
    } catch (e) {
      if (e?.code === "annule") return retirer();
      envoi.erreur =
        e instanceof ErreurImage
          ? e.message
          : e?.code === "limite"
            ? `${IMAGES_MAX} images au maximum par todo.`
            : e?.code === "not-found"
              ? "Ce todo a été supprimé sur un autre appareil."
              : "Interrompu";
      envoi.reessayer = () => {
        retirer();
        return envoyerUn(todoId, fichier);
      };
      envoi.abandonner = retirer;
      rendreEnvois();
    }
  }

  function rendreEnvois() {
    progres.replaceChildren(
      ...envois.map((e) =>
        el(
          "li",
          { class: "todo-envoi" },
          el("span", { class: "todo-envoi-nom", texte: e.nom }),
          e.erreur
            ? el("span", { class: "todos-message--erreur", texte: e.erreur })
            : el("progress", { max: "1", value: String(e.part), "aria-label": `Envoi de ${e.nom}` }),
          e.erreur
            ? el("button", { type: "button", class: "lien-discret", texte: "Réessayer", onclick: () => e.reessayer?.() })
            : null,
          el("button", {
            type: "button",
            class: "lien-discret",
            texte: e.erreur ? "Abandonner" : "Annuler",
            onclick: () => (e.erreur ? e.abandonner?.() : e.annuler?.()),
          }),
        ),
      ),
    );
  }

  // --- Thumbnails -----------------------------------------------------------------------------------
  const cheminMini = (chemin) => chemin.replace(/\.([a-z0-9]+)$/i, "_mini.$1");

  async function chargerMini(ligne) {
    const chemin = cheminMini(ligne.image.chemin);
    if (urls.has(chemin)) return (ligne.img.src = urls.get(chemin));
    try {
      const blob = await donnees.lireImage(chemin);
      const url = URL.createObjectURL(blob);
      urls.set(chemin, url);
      if (ligne.li.isConnected) ligne.img.src = url;
      else URL.revokeObjectURL(url), urls.delete(chemin);
    } catch {
      ligne.vignette.classList.add("todo-vignette--absente");
    }
  }

  function surVisible(ligne) {
    if (typeof IntersectionObserver === "undefined") return chargerMini(ligne);
    observateur ??= new IntersectionObserver((entrees) => {
      for (const e of entrees) {
        if (!e.isIntersecting) continue;
        observateur.unobserve(e.target);
        const l = [...lignes.values()].find((x) => x.li === e.target);
        if (l) chargerMini(l);
      }
    });
    observateur.observe(ligne.li);
  }

  // --- Lines -----------------------------------------------------------------------------------------
  function creerLigne(image) {
    const img = el("img", { class: "todo-vignette-image", alt: "", decoding: "async" });
    const vignette = el(
      "button",
      { type: "button", class: "todo-vignette", onclick: () => voir(image.id) },
      img,
    );
    const champNote = el("textarea", {
      class: "todo-image-note",
      rows: "2",
      maxlength: String(NOTE_MAX),
      placeholder: "Note",
      "aria-label": "Note de l'image",
    });
    const plus = el(
      "button",
      { type: "button", class: "todos-plus", "aria-haspopup": "menu", title: "Actions de l'image" },
      icone("points", { taille: 18 }),
    );
    const li = el("li", { class: "todo-image", dataset: { id: image.id } }, vignette, champNote, plus);
    const ligne = { li, img, vignette, champNote, plus, image, id: image.id };
    const differe = creerDiffere((texte) => donnees.majNoteImage(contexte.id(), image.id, texte).catch(() => dire("La note n'a pas pu être enregistrée.")), 1500);
    notes.set(image.id, differe);
    champNote.addEventListener("input", () => differe.appeler(champNote.value));
    plus.addEventListener("click", () => menu(ligne));
    ligne.maj = (neuve) => {
      ligne.image = neuve;
      // A snapshot never replaces a note being typed.
      if (document.activeElement !== champNote && !differe.enAttente()) champNote.value = neuve.note ?? "";
      img.alt = neuve.note || "Image du todo";
      vignette.setAttribute("aria-label", `Voir l'image${neuve.note ? ` : ${neuve.note}` : ""}`);
    };
    ligne.maj(image);
    surVisible(ligne);
    return ligne;
  }

  function voir(id) {
    ouvrirVisionneuse({
      images: () => images,
      index: Math.max(0, images.findIndex((i) => i.id === id)),
      lire: (chemin) => donnees.lireImage(chemin),
      retourFocus: lignes.get(id)?.vignette,
    });
  }

  function menu(ligne) {
    const i = images.findIndex((x) => x.id === ligne.id);
    const r = ligne.plus.getBoundingClientRect();
    ouvrirMenu({
      x: r.left,
      y: r.bottom + 4,
      libelle: "Actions de l'image",
      retourFocus: ligne.plus,
      entrees: [
        { libelle: "Voir", onChoix: () => voir(ligne.id) },
        ...(i > 0 ? [{ libelle: "Déplacer avant", onChoix: () => deplacer(i, i - 1) }] : []),
        ...(i < images.length - 1 ? [{ libelle: "Déplacer après", onChoix: () => deplacer(i, i + 1) }] : []),
        "-",
        { libelle: "Supprimer", danger: true, onChoix: () => supprimer(ligne.image) },
      ],
    });
  }

  async function deplacer(de, vers) {
    const ids = images.map((x) => x.id);
    const [bouge] = ids.splice(de, 1);
    ids.splice(vers, 0, bouge);
    try {
      await donnees.reordonnerImages(contexte.id(), ids);
    } catch {
      dire("L'ordre n'a pas pu être enregistré.");
    }
  }

  async function supprimer(image) {
    try {
      await donnees.supprimerImage(contexte.id(), image);
      toast("Image supprimée");
    } catch {
      dire("L'image n'a pas pu être supprimée. Réessayez.");
    }
  }

  // --- Plugged into the editor --------------------------------------------------------------------
  function rendre() {
    reconcilier(liste, lignes, images, creerLigne);
    const n = images.length;
    const q = niveauQuota(octets(), 200 * 1024 * 1024);
    quota.hidden = n === 0 && q.niveau === "ok";
    quota.textContent = `${n === 1 ? "1 image" : `${n} images`} sur ${IMAGES_MAX} · ${texteQuota(octets())}`;
    quota.classList.toggle("todo-galerie-quota--alerte", q.niveau !== "ok");
    bouton.disabled = n >= IMAGES_MAX;
    bouton.title = n >= IMAGES_MAX ? `${IMAGES_MAX} images au maximum` : "Ajouter une image";
  }

  function monter(ctx) {
    contexte = ctx;
    const depot = ctx.dialogue.querySelector(".todo-editeur-depot");
    let profondeur = 0;
    ctx.dialogue.addEventListener("dragenter", (e) => {
      if (!aDesImages(e)) return;
      profondeur++;
      depot.hidden = false;
    });
    ctx.dialogue.addEventListener("dragleave", (e) => {
      if (!aDesImages(e)) return;
      profondeur = Math.max(0, profondeur - 1);
      if (profondeur === 0) depot.hidden = true;
    });
    ctx.dialogue.addEventListener("dragover", (e) => aDesImages(e) && e.preventDefault());
    ctx.dialogue.addEventListener("drop", (e) => {
      if (!aDesImages(e)) return;
      e.preventDefault();
      profondeur = 0;
      depot.hidden = true;
      ajouterFichiers([...e.dataTransfer.files]);
    });
    // Ctrl+V: only when the clipboard holds a picture (a pasted text stays a pasted text).
    ctx.dialogue.addEventListener("paste", (e) => {
      const fichiers = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
      if (fichiers.length === 0) return;
      e.preventDefault();
      ajouterFichiers(fichiers);
    });
    rendre();
  }

  return {
    racine,
    bouton,
    monter,
    maj(todo) {
      images = todo?.images ?? [];
      rendre();
    },
    /** Writes the waiting notes and frees the local addresses of the thumbnails. */
    liberer() {
      for (const d of notes.values()) d.vider();
      for (const e of envois) e.annuler?.();
      observateur?.disconnect();
      for (const url of urls.values()) URL.revokeObjectURL(url);
      urls.clear();
    },
    /** Tests. */
    ajouterFichiers,
    images: () => images,
  };
}
