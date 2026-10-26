/**
 * Giving the user a file (V3.8): the share sheet of the system when there is one (iPhone,
 * iPad: Files, AirDrop, Mail…), else a download (<a download>). Used by both targets; the
 * extension passes `partage: false`.
 */

/** Gives the user a file as a download (Blob + <a download>). */
export function telecharger(contenu, nom, type) {
  const url = URL.createObjectURL(new Blob([contenu], { type }));
  const lien = Object.assign(document.createElement("a"), { href: url, download: nom });
  document.body.append(lien);
  lien.click();
  lien.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** Can this browser share a file with the system share sheet? */
export function peutPartager(fichier, nav = globalThis.navigator) {
  return typeof nav?.share === "function" && !!nav.canShare?.({ files: [fichier] });
}

/**
 * Shares the file, or downloads it. Must be called straight from the tap that asked for it
 * (the share sheet needs a user gesture): prepare the file BEFORE.
 *
 * @param {File} fichier
 * @param {{ nav?: Navigator, partage?: boolean, titre?: string,
 *           telecharger?: (contenu: Blob, nom: string, type: string) => void }} options
 * @returns {Promise<"partage"|"telecharge"|"annule"|"bloque">}
 *   "annule": the user closed the sheet (nothing to report); "bloque": the system refused
 *   because the gesture had expired — the caller offers a button to try again at once.
 */
export async function partagerFichier(
  fichier,
  {
    nav = globalThis.navigator,
    partage = true,
    titre = "Export NedoTab",
    telecharger: tel = telecharger,
  } = {},
) {
  if (partage && peutPartager(fichier, nav)) {
    try {
      await nav.share({ files: [fichier], title: titre });
      return "partage";
    } catch (e) {
      if (e?.name === "AbortError") return "annule";
      if (e?.name === "NotAllowedError") return "bloque";
      // Any other failure: the file must still reach the user.
    }
  }
  tel(fichier, fichier.name, fichier.type);
  return "telecharge";
}
