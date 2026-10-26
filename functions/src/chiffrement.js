/**
 * Encryption of the users' AI keys (V4.0): AES-256-GCM, a new random 12-byte IV for every
 * encryption, and associated data (AAD) "uid:provider" so that an encrypted key copied to
 * another user or another provider does not decrypt. The 32-byte secret (base64) comes
 * from Secret Manager (IA_CLE_CHIFFREMENT) and is never written anywhere else.
 */
import { Buffer } from "node:buffer";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export const VERSION_CHIFFREMENT = 1;

function cleDepuis(cleBase64) {
  const cle = Buffer.from(String(cleBase64 ?? ""), "base64");
  if (cle.length !== 32) throw new Error("Secret de chiffrement absent ou invalide (32 octets).");
  return cle;
}

/** Associated data of a key: who it belongs to and for which provider. */
export const donneesAssociees = (uid, fournisseur) => `${uid}:${fournisseur}`;

/**
 * @returns {{ v: number, iv: string, donnees: string, tag: string }} all base64
 */
export function chiffrer(texte, cleBase64, aad) {
  const iv = randomBytes(12);
  const chiffreur = createCipheriv("aes-256-gcm", cleDepuis(cleBase64), iv);
  if (aad != null) chiffreur.setAAD(Buffer.from(aad, "utf8"));
  const donnees = Buffer.concat([chiffreur.update(String(texte), "utf8"), chiffreur.final()]);
  return {
    v: VERSION_CHIFFREMENT,
    iv: iv.toString("base64"),
    donnees: donnees.toString("base64"),
    tag: chiffreur.getAuthTag().toString("base64"),
  };
}

/** Throws when the data, the tag, the secret or the associated data do not match. */
export function dechiffrer(objet, cleBase64, aad) {
  if (objet?.v !== VERSION_CHIFFREMENT) throw new Error("Version de chiffrement inconnue.");
  const dechiffreur = createDecipheriv(
    "aes-256-gcm",
    cleDepuis(cleBase64),
    Buffer.from(objet.iv, "base64"),
  );
  if (aad != null) dechiffreur.setAAD(Buffer.from(aad, "utf8"));
  dechiffreur.setAuthTag(Buffer.from(objet.tag, "base64"));
  return Buffer.concat([
    dechiffreur.update(Buffer.from(objet.donnees, "base64")),
    dechiffreur.final(),
  ]).toString("utf8");
}
