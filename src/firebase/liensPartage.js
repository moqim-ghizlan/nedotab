import { httpsCallable } from "firebase/functions";
import { chiffrerPourLien, preuveMotDePasseLien } from "../core/coffre.js";
import { emballer, formaterLien, genererLien } from "../core/lienPartage.js";
import { obtenirApp } from "./app.js";
import { obtenirFonctions } from "./fonctions.js";

/**
 * Share links (V4.28), owner side. The content is encrypted HERE with a fresh key; the server
 * receives the encrypted copy, a hash-able proof of the password (never the password) and
 * parameters. The key exists only in the returned link: it is not stored anywhere.
 */
const appeler = async (nom, donnees = {}) =>
  (await httpsCallable(obtenirFonctions(), nom)(donnees)).data;

/** Origin of the reception page: the Hosting site of the project (the extension has no web origin). */
export function origineReception() {
  const { projectId } = obtenirApp();
  const hote = globalThis.location?.hostname ?? "";
  return /\.(web\.app|firebaseapp\.com)$/.test(hote)
    ? globalThis.location.origin
    : `https://${projectId}.web.app`;
}

const b64u = (octets) => {
  let s = "";
  for (let i = 0; i < octets.length; i += 0x8000)
    s += String.fromCharCode(...octets.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

/**
 * @param {{ type: "texte"|"lien"|"fichier", octets: Uint8Array, nom?: string, typeMime?: string }} contenu clear content
 * @param {{ dureeId: string, ouverturesMax: number, motDePasse?: string|null }} options
 * @returns {Promise<{ lien: string, idLien: string, expireLe: number }>}
 */
export async function creerLien(contenu, { dureeId, ouverturesMax, motDePasse = null }) {
  const { jeton, cle } = genererLien();
  const donnees = await chiffrerPourLien({ cle, jeton, motDePasse, octets: emballer(contenu) });
  const iterations = 600_000;
  const r = await appeler("creerLienPartage", {
    jeton,
    type: contenu.type,
    dureeId,
    ouverturesMax,
    motDePasse: !!motDePasse,
    ...(motDePasse
      ? { preuve: await preuveMotDePasseLien(motDePasse, jeton, iterations), iterations }
      : {}),
    donnees: b64u(donnees),
  });
  return {
    lien: formaterLien(origineReception(), jeton, cle),
    idLien: r.idLien,
    expireLe: r.expireLe,
  };
}

export const listerLiens = () => appeler("listerLiensPartage");
export const revoquerLien = (idLien) => appeler("revoquerLienPartage", { idLien });
