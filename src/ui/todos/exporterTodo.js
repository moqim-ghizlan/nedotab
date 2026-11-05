import { nomExport, planArchive, todoVersMarkdown } from "../../core/exportTodo.js";
import { creerZip } from "../../core/zip.js";
import { plateforme } from "../../platform/index.js";
import { telecharger } from "../../platform/partage.js";
import { toast } from "../toast.js";

/** Gives the file: the share sheet where there is one (iPhone), else a download. No `downloads` permission. */
export const livrerParDefaut = (fichier) =>
  plateforme.partagerFichier
    ? plateforme.partagerFichier(fichier)
    : (telecharger(fichier, fichier.name, fichier.type), "telecharge");

/**
 * Delivers a prepared file. If the browser refuses the share sheet because the tap is too old
 * (the archive took time to build: iPhone), a "Partager" button gives a fresh tap.
 */
async function remettre(fichier, livrer) {
  const mode = await livrer(fichier);
  if (mode === "bloque") {
    toast("Fichier prêt", {
      duree: 60_000,
      cle: "todos-export",
      action: { libelle: "Partager", onClic: () => livrer(fichier) },
    });
  } else {
    toast("Exporté ✓", { cle: "todos-export" });
  }
  return mode;
}

/**
 * Exports ONE todo (V6.6): a `.md` file, or a `.zip` (the `.md` and an `images/` folder) when the
 * todo has pictures. The pictures are read from Storage ONE BY ONE (memory: up to 10 × 5 MB), with
 * a progress toast and a cancel button; offline, the export is refused with a clear message. The
 * file is written to the user's downloads and goes nowhere else; no address is created.
 *
 * @param {object} d
 * @param {object} d.todo the todo (pictures included)
 * @param {{ nom?: string }|null} d.sujet
 * @param {(chemin: string) => Promise<Blob>} d.lireImage
 * @param {(fichier: File) => Promise<string>|string} [d.livrer] (tests, share sheet of V6.9)
 * @returns {Promise<{ ok: true, nom: string, mode: string } | { ok: false, erreur: string, annule?: boolean }>}
 */
export async function exporterTodo({ todo, sujet, lireImage, livrer = livrerParDefaut, maintenant = new Date() }) {
  const images = todo.images ?? [];
  if (images.length === 0) {
    const nom = nomExport(todo);
    const fichier = new File([todoVersMarkdown(todo, sujet)], nom, { type: "text/markdown" });
    const mode = await remettre(fichier, livrer);
    return { ok: true, nom, mode };
  }
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    const erreur = "Hors ligne : les images ne sont pas disponibles";
    toast(erreur, { type: "erreur", cle: "todos-export" });
    return { ok: false, erreur };
  }
  const plan = planArchive(todo);
  let annule = false;
  const fichiers = [];
  try {
    for (let i = 0; i < images.length; i++) {
      if (annule) break;
      toast(`Préparation… ${i + 1}/${images.length}`, {
        duree: 120_000,
        cle: "todos-export",
        action: { libelle: "Annuler", onClic: () => (annule = true) },
      });
      const blob = await lireImage(images[i].chemin);
      if (annule) break;
      fichiers.push({
        nom: plan.images[i].chemin,
        octets: new Uint8Array(await blob.arrayBuffer()),
      });
    }
  } catch {
    const erreur = "Une image n'a pas pu être lue : l'export a été arrêté.";
    toast(erreur, { type: "erreur", cle: "todos-export" });
    return { ok: false, erreur };
  }
  if (annule) {
    toast("Export annulé", { cle: "todos-export" });
    return { ok: false, erreur: "Export annulé", annule: true };
  }
  const md = new TextEncoder().encode(todoVersMarkdown(todo, sujet));
  const nom = nomExport(todo);
  const fichier = new File([creerZip([{ nom: plan.cheminMd, octets: md }, ...fichiers], maintenant)], nom, {
    type: "application/zip",
  });
  const mode = await remettre(fichier, livrer);
  return { ok: true, nom, mode };
}

/**
 * "Copier en Markdown": the text only (no pictures), written to the clipboard. It must be called
 * from a click: the browser refuses `writeText` without a user gesture.
 */
export async function copierMarkdown({ todo, sujet, copier = (t) => navigator.clipboard.writeText(t) }) {
  try {
    await copier(todoVersMarkdown(todo, sujet, { images: false }));
    toast("Copié en Markdown", { cle: "todos-export" });
    return true;
  } catch {
    toast("La copie a échoué : autorisez le presse-papiers puis réessayez.", { type: "erreur", cle: "todos-export" });
    return false;
  }
}
