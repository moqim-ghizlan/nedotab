import { validerResultat } from "../../core/imagesTodo.js";
import { ErreurImage, preparerImage } from "./compresserImage.js";

/**
 * Sends the picture of an EXISTING todo: compressed and cleaned of its EXIF block first, then
 * uploaded. Never throws: the answer says what to show the user.
 * @returns {Promise<{ ok: true } | { ok: false, erreur: string }>}
 */
export async function televerserPhoto({ donnees, todoId, fichier, pisteId = null, preparer = preparerImage, surProgres }) {
  if (typeof navigator !== "undefined" && navigator.onLine === false)
    return { ok: false, erreur: "Ajout de photo impossible hors ligne." };
  try {
    const prete = await preparer(fichier);
    const ok = validerResultat(prete.blob.size, donnees.etat().compteurs.octets);
    if (!ok.ok) return { ok: false, erreur: ok.erreur };
    const { promesse } = await donnees.envoyerImage(todoId, prete, { surProgres, ...(pisteId ? { pisteId } : {}) });
    await promesse;
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      erreur:
        e instanceof ErreurImage
          ? e.message
          : e?.code === "not-found"
            ? "Ce todo a été supprimé sur un autre appareil."
            : "La photo n'a pas pu être envoyée. Réessayez.",
    };
  }
}
