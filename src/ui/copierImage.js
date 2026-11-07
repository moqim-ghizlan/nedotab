import { doitConvertirEnPng } from "../core/imageSortie.js";
import { el } from "./dom.js";
import { icone } from "./icones.js";
import { toast } from "./toast.js";

/** The clipboard can take a picture (ClipboardItem exists). Otherwise "Copier l'image" is hidden. */
export const copieImagePossible = () =>
  typeof globalThis.ClipboardItem !== "undefined" && typeof navigator !== "undefined" && typeof navigator.clipboard?.write === "function";

/** webp / jpg → png through a canvas (Chrome only accepts image/png on the clipboard). */
export async function versPng(blob) {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("2d").drawImage(bitmap, 0, 0);
    const png = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!png) throw new Error("conversion");
    return png;
  } finally {
    bitmap.close?.();
  }
}

/**
 * Copies a picture to the clipboard. `source` is a Blob or a function returning a Promise of one.
 * The clipboard item receives a PROMISE of the blob and is written in the same gesture: Safari
 * (iPhone) refuses a copy that waits for the picture before it starts.
 * @returns {Promise<boolean>} success
 */
export async function copierImage(source) {
  if (!copieImagePossible()) return false;
  try {
    const promesse = (async () => {
      const blob = await (typeof source === "function" ? source() : source);
      return doitConvertirEnPng(blob.type) ? versPng(blob) : blob;
    })();
    await navigator.clipboard.write([new ClipboardItem({ "image/png": promesse })]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Saves a file: share sheet on a phone (a[download] is unreliable in an installed iPhone app),
 * download link elsewhere.
 * @returns {Promise<boolean>}
 */
export async function enregistrerFichier(blob, nom) {
  try {
    const fichier = new File([blob], nom, { type: blob.type || "application/octet-stream" });
    const tactile = !!globalThis.matchMedia?.("(pointer: coarse)").matches;
    if (tactile && typeof navigator.canShare === "function" && navigator.canShare({ files: [fichier] })) {
      await navigator.share({ files: [fichier] });
      return true;
    }
    const url = URL.createObjectURL(fichier);
    const a = el("a", { href: url, download: nom });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return true;
  } catch (e) {
    if (e?.name === "AbortError") return true; // the share sheet was closed
    return false;
  }
}

/**
 * THE list of actions on a picture, defined once for the todo viewer, the todo window, the cards
 * of the sharing space and the gallery menu.
 *
 * @param {object} d
 * @param {() => Promise<Blob>} d.lire reads the picture (Storage, cache, decrypted locally)
 * @param {() => string} d.nom file name for the download
 * @returns {{ id: string, libelle: string, icone: string, onChoix: () => Promise<void> }[]}
 */
export function actionsImage({ lire, nom }) {
  const liste = [];
  if (copieImagePossible()) {
    liste.push({
      id: "copier-image",
      libelle: "Copier l'image",
      icone: "copier",
      async onChoix() {
        const ok = await copierImage(lire);
        toast(ok ? "Image copiée" : "Copie impossible", ok ? {} : { type: "erreur" });
      },
    });
  }
  liste.push({
    id: "telecharger-image",
    libelle: "Télécharger",
    icone: "telecharger",
    async onChoix() {
      try {
        const ok = await enregistrerFichier(await lire(), nom());
        if (!ok) toast("Téléchargement impossible pour l'instant.", { type: "erreur" });
      } catch {
        toast("Téléchargement impossible pour l'instant.", { type: "erreur" });
      }
    },
  });
  return liste;
}

/** Round icon buttons for the actions above (loading state while a big picture is read). */
export function boutonsActionsImage(actions, classe = "visionneuse-action") {
  return actions.map((a) => {
    const b = el("button", { type: "button", class: classe, "aria-label": a.libelle, title: a.libelle }, icone(a.icone, { taille: 18 }));
    b.addEventListener("click", async () => {
      if (b.disabled) return;
      b.disabled = true;
      b.setAttribute("aria-busy", "true");
      try {
        await a.onChoix();
      } finally {
        b.disabled = false;
        b.removeAttribute("aria-busy");
      }
    });
    return b;
  });
}
