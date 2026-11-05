import { el } from "../dom.js";
import { icone } from "../icones.js";
import { rapatrierToasts } from "../toast.js";

/**
 * Full-screen viewer of the pictures of a todo (V6.4): the picture, its note under it, arrows
 * (← → and buttons), Escape. The picture is read from Storage with getBlob and shown through a
 * local blob: address, REVOKED when the viewer closes or the picture changes. The note is text.
 *
 * @param {object} d
 * @param {() => object[]} d.images the pictures in their order (read again at each move)
 * @param {number} d.index
 * @param {(chemin: string) => Promise<Blob>} d.lire
 * @param {HTMLElement} [d.retourFocus]
 */
export function ouvrirVisionneuse({ images, index, lire, retourFocus }) {
  let i = Math.min(Math.max(0, index), Math.max(0, images().length - 1));
  let url = null;
  let jeton = 0; // a late answer for a picture we left is ignored

  const img = el("img", { class: "visionneuse-image", alt: "" });
  const note = el("p", { class: "visionneuse-note" });
  const etat = el("p", { class: "visionneuse-etat", role: "status", "aria-live": "polite" });
  const compteur = el("span", { class: "visionneuse-compteur", "aria-live": "polite" });
  const precedent = el(
    "button",
    { type: "button", class: "visionneuse-fleche visionneuse-fleche--gauche", "aria-label": "Image précédente", onclick: () => aller(i - 1) },
    icone("retour", { taille: 22 }),
  );
  const suivant = el(
    "button",
    { type: "button", class: "visionneuse-fleche visionneuse-fleche--droite", "aria-label": "Image suivante", onclick: () => aller(i + 1) },
    icone("chevron", { taille: 22 }),
  );
  const fermer = el(
    "button",
    { type: "button", class: "todos-fermer visionneuse-fermer", "aria-label": "Fermer", onclick: () => dialogue.close() },
    icone("fermer", { taille: 18 }),
  );
  const dialogue = el(
    "dialog",
    { class: "visionneuse", "aria-label": "Visionneuse d'images" },
    el("div", { class: "visionneuse-haut" }, compteur, fermer),
    el("div", { class: "visionneuse-scene" }, precedent, img, suivant),
    etat,
    note,
  );

  function liberer() {
    if (url) URL.revokeObjectURL(url);
    url = null;
    img.removeAttribute("src");
  }

  async function aller(n) {
    const liste = images();
    if (liste.length === 0) return dialogue.close();
    i = Math.min(Math.max(0, n), liste.length - 1);
    const courante = liste[i];
    const moi = ++jeton;
    liberer();
    img.alt = courante.note || "Image du todo";
    note.textContent = courante.note ?? "";
    note.hidden = !courante.note;
    compteur.textContent = `${i + 1} / ${liste.length}`;
    precedent.disabled = i === 0;
    suivant.disabled = i === liste.length - 1;
    etat.textContent = "Chargement…";
    try {
      const blob = await lire(courante.chemin);
      if (moi !== jeton) return;
      url = URL.createObjectURL(blob);
      img.src = url;
      etat.textContent = "";
    } catch {
      if (moi === jeton) etat.textContent = "Cette image est introuvable.";
    }
  }

  dialogue.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      aller(i - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      aller(i + 1);
    }
  });
  dialogue.addEventListener("close", () => {
    jeton++;
    liberer();
    rapatrierToasts();
    dialogue.remove();
    retourFocus?.focus?.();
  });
  document.body.append(dialogue);
  dialogue.showModal();
  aller(i);
  fermer.focus();
  return { fermer: () => dialogue.open && dialogue.close(), aller, dialogue };
}
