/**
 * V5.2: identifiers of the VPN guests (pure, no Firebase). The proxy password is random (32
 * characters), shown once to the guest and kept only as a bcrypt fingerprint (what the proxy
 * of the server reads) and as an AES-GCM copy (so that it can be shown again on a new device).
 */
import bcrypt from "bcryptjs";
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";

const ALPHABET_COMPTE = "abcdefghijklmnopqrstuvwxyz0123456789";
const ALPHABET_MDP = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

export const COUT_BCRYPT = 10;
export const EMAIL_MAX = 254;
const FORME_EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

/** Lower case, no surrounding space (same rule as normaliserEmail in src/core/authEmail.js). */
export const normaliserEmail = (email) =>
  String(email ?? "")
    .trim()
    .toLowerCase();

export const emailValide = (email) => {
  const e = normaliserEmail(email);
  return e.length > 0 && e.length <= EMAIL_MAX && FORME_EMAIL.test(e);
};

/** SHA-256 (hex) of the normalised e-mail: the id of an invitation. */
export const hashEmail = (email) =>
  createHash("sha256").update(normaliserEmail(email), "utf8").digest("hex");

const tirer = (alphabet, n) => Array.from({ length: n }, () => alphabet[randomInt(alphabet.length)]).join("");

/** "u_" + 10 random characters: the proxy login (never the e-mail, never the uid). */
export const genererCompte = () => `u_${tirer(ALPHABET_COMPTE, 10)}`;

/** 32 random characters, without look-alike characters (0/O, 1/l/I). */
export const genererMotDePasse = () => tirer(ALPHABET_MDP, 32);

/**
 * bcrypt fingerprint in the "$2y$" form that the proxy (htpasswd, glibc crypt) reads.
 * The cost is a parameter so that the tests can use a cheap one.
 */
export function empreinteBcrypt(motDePasse, cout = COUT_BCRYPT) {
  return bcrypt.hashSync(motDePasse, cout).replace(/^\$2[ab]\$/, "$2y$");
}

/** True when `motDePasse` matches the fingerprint (used by the tests only). */
export const empreinteCorrespond = (motDePasse, empreinte) =>
  bcrypt.compareSync(motDePasse, empreinte.replace(/^\$2y\$/, "$2a$"));

/** Constant-time comparison of two secrets (the token of the server agent). */
export function secretsEgaux(a, b) {
  const x = createHash("sha256").update(String(a ?? ""), "utf8").digest();
  const y = createHash("sha256").update(String(b ?? ""), "utf8").digest();
  return timingSafeEqual(Buffer.from(x), Buffer.from(y)) && String(a ?? "") !== "";
}
