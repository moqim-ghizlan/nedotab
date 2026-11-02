/**
 * Vault (V4.26): end-to-end encryption of sharing-space items, ON THE DEVICE. The ONLY module
 * that calls `crypto.subtle` (PBKDF2 + AES-GCM, nothing invented). No DOM, no Firebase: the
 * server never receives the password nor any key.
 *
 *   password ──PBKDF2(salt1)──► KEK-pw ─┐ wrap (AES-GCM)
 *   secret key ─PBKDF2(salt2)─► KEK-sk ─┤
 *                                       ▼
 *               VAULT KEY (VK, 256 random bits, never derived from a password)
 *                                       │ encrypts (AES-GCM, new IV, AAD = uid:id:v)
 *                                       ▼
 *                                  vault items
 *
 * Unrelated to functions/src/chiffrement.js (server-side encryption of the AI keys, V4.0).
 */

export const VERSION_COFFRE = 1;
export const ITERATIONS = 600_000;
export const ITERATIONS_MIN = 310_000;
export const LONGUEUR_CLE_SECOURS = 24;
const OCTETS_IV = 12;
const OCTETS_SEL = 16;
// No I, L, O, U (Crockford): a secret key written on paper is not ambiguous. 32 symbols = 5 bits.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

const subtle = () => {
  const c = globalThis.crypto;
  if (!c?.subtle)
    throw new Error("Le chiffrement n'est pas disponible ici (connexion non sécurisée ?).");
  return c.subtle;
};
const aleatoire = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));
const encodeur = new TextEncoder();
const decodeur = new TextDecoder("utf-8", { fatal: true });

/* ---------- base64url ---------- */

export function versB64u(octets) {
  let s = "";
  for (let i = 0; i < octets.length; i += 0x8000)
    s += String.fromCharCode(...octets.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function depuisB64u(texte) {
  if (typeof texte !== "string" || !/^[A-Za-z0-9_-]*$/.test(texte))
    throw new Error("Donnée illisible.");
  const b = atob(texte.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

/* ---------- password strength ---------- */

// The most common passwords (an embedded list: no strength-meter library, see CLAUDE.md).
const COURANTS = new Set(
  `123456 123456789 12345678 1234567890 123456789012 password password1 password123 motdepasse motdepasse1
  motdepasse123 azerty azerty123 azertyuiop qwerty qwerty123 qwertyuiop abc123 111111 000000 123123 654321
  iloveyou monkey dragon football baseball letmein admin welcome login master sunshine princess shadow
  superman michael jordan soleil bonjour bonjour123 marseille doudou chocolat loulou nicolas julien
  aaaaaa aaaaaaaa azerty1234 1q2w3e4r 1q2w3e4r5t 123qwe zaq12wsx trustno1 passw0rd p@ssw0rd p@ssword
  nedotab nedotab123 vaultvault coffrefort coffre123 changeme secret secret123 test1234 testtest
  hello123 hellohello iloveyou1 liverpool arsenal chelsea barcelona 987654321 147258369 159753
  12341234 11111111 00000000 88888888 1234qwer qwer1234 asdfghjkl asdf1234 zxcvbnm zxcvbnm123 pokemon
  naruto batman starwars matrix freedom whatever cheese computer internet ordinateur famille
  maison amour bonheur 123abc abcdef abcd1234 abcdefgh motdepasse2024 motdepasse2025 password2024
  password2025 azerty2024 azerty2025 france123 paris123 football1 jesuisla lolilol azertyazerty`
    .split(/\s+/)
    .filter(Boolean),
);

/** NFKC: an "é" typed on an iPhone is the same password as the "é" of a PC. */
export const normaliserMotDePasse = (mdp) => String(mdp ?? "").normalize("NFKC");

/**
 * @returns {{ ok: boolean, niveau: "trop-court"|"faible"|"correct"|"solide", message: string }}
 * Accepted: 12 characters or more, or a phrase of 4 words; never a common password.
 */
export function validerMotDePasse(mdp) {
  const m = normaliserMotDePasse(mdp);
  const n = [...m].length;
  const mots = m
    .trim()
    .split(/\s+/)
    .filter((x) => x.length >= 2);
  const phrase = mots.length >= 4 && n >= 12;
  if (n < 12 && !(mots.length >= 4 && n >= 10))
    return {
      ok: false,
      niveau: "trop-court",
      message: "Trop court : 12 caractères ou une phrase de 4 mots.",
    };
  const compact = m.toLowerCase().replace(/\s+/g, "");
  if (
    COURANTS.has(compact) ||
    /^(.)\1+$/.test(compact) ||
    /^(?:0123456789|abcdefghij|azertyuiop|qwertyuiop)/.test(compact)
  )
    return {
      ok: false,
      niveau: "faible",
      message: "Ce mot de passe est trop courant. Essayez une phrase de 4 mots.",
    };
  const classes = [/[a-zà-ÿ]/, /[A-ZÀ-Ý]/, /\d/, /[^\p{L}\p{N}]/u].filter((r) => r.test(m)).length;
  if (new Set(compact).size < 5)
    return {
      ok: false,
      niveau: "faible",
      message: "Trop répétitif. Essayez une phrase de 4 mots.",
    };
  if (phrase || n >= 16 || (n >= 12 && classes >= 3))
    return {
      ok: true,
      niveau: "solide",
      message: "Solide. La sécurité dépend de la force de votre mot de passe.",
    };
  return {
    ok: true,
    niveau: "correct",
    message: "Correct. Une phrase de 4 mots serait plus solide.",
  };
}

/* ---------- secret key ---------- */

/** 24 symbols (120 bits) in groups of 4: "ABCD-EFGH-…". Shown once. */
export function genererCleSecours() {
  const o = aleatoire(LONGUEUR_CLE_SECOURS);
  const s = [...o].map((x) => ALPHABET[x % 32]).join("");
  return s.match(/.{4}/g).join("-");
}

/** Ignores spaces, dashes and case; I/L → 1 and O → 0 (as Crockford). Null when malformed. */
export function normaliserCleSecours(saisie) {
  const s = String(saisie ?? "")
    .toUpperCase()
    .replace(/[\s-]+/g, "")
    .replace(/[IL]/g, "1")
    .replace(/O/g, "0");
  return s.length === LONGUEUR_CLE_SECOURS && [...s].every((c) => ALPHABET.includes(c)) ? s : null;
}

/** Three random groups (0-based indexes) the user must retype to prove the key was noted. */
export function groupesAVerifier(nb = 3) {
  const idx = [0, 1, 2, 3, 4, 5];
  for (let i = idx.length - 1; i > 0; i--) {
    const j = aleatoire(1)[0] % (i + 1);
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx.slice(0, nb).sort((a, b) => a - b);
}

export function verifierGroupes(cle, indexes, saisies) {
  const groupes = String(cle).split("-");
  return indexes.every(
    (i, k) =>
      groupes[i] ===
      String(saisies[k] ?? "")
        .trim()
        .toUpperCase()
        .replace(/[IL]/g, "1")
        .replace(/O/g, "0"),
  );
}

/* ---------- key derivation and wrapping ---------- */

async function deriverKek(secret, sel, iterations, usages) {
  if (!Number.isInteger(iterations) || iterations < ITERATIONS_MIN)
    throw new Error("Paramètres du vault invalides.");
  const base = await subtle().importKey("raw", encodeur.encode(secret), "PBKDF2", false, [
    "deriveKey",
  ]);
  return subtle().deriveKey(
    { name: "PBKDF2", salt: sel, iterations, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    usages,
  );
}

const aadEnveloppe = (v, type) => encodeur.encode(`vault:${type}:${v}`);

async function envelopper(kek, vkOctets, v, type) {
  const iv = aleatoire(OCTETS_IV);
  const ct = new Uint8Array(
    await subtle().encrypt(
      { name: "AES-GCM", iv, additionalData: aadEnveloppe(v, type) },
      kek,
      vkOctets,
    ),
  );
  return `v${v}.${versB64u(iv)}.${versB64u(ct)}`;
}

async function desenvelopper(kek, texte, v, type) {
  const [, , iv, ct] = /^v(\d+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(String(texte)) ?? [];
  if (!iv) throw new Error("Vault illisible.");
  return new Uint8Array(
    await subtle().decrypt(
      { name: "AES-GCM", iv: depuisB64u(iv), additionalData: aadEnveloppe(v, type) },
      kek,
      depuisB64u(ct),
    ),
  );
}

/** The VK as a CryptoKey that cannot be read back (extractable: false). */
const importerVk = (octets) =>
  subtle().importKey("raw", octets, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);

export class ErreurCoffre extends Error {
  constructor(code, message) {
    super(message);
    this.code = code; // "mot-de-passe" | "cle-secours" | "corrompu" | "format"
  }
}

/**
 * Creates a vault. @returns {Promise<{ meta: object, vk: CryptoKey, cleSecours: string }>}
 * `meta` is what goes to users/{uid}/vaultMeta/cle: only wrapped keys and salts.
 */
export async function creerCoffre(motDePasse, { iterations = ITERATIONS } = {}) {
  const verif = validerMotDePasse(motDePasse);
  if (!verif.ok) throw new ErreurCoffre("mot-de-passe", verif.message);
  const vkOctets = aleatoire(32);
  const cleSecours = genererCleSecours();
  const meta = await fabriquerMeta(
    vkOctets,
    normaliserMotDePasse(motDePasse),
    normaliserCleSecours(cleSecours),
    iterations,
  );
  const vk = await importerVk(vkOctets);
  vkOctets.fill(0);
  return { meta, vk, cleSecours };
}

async function fabriquerMeta(vkOctets, mdp, cle, iterations, base = {}) {
  const sel1 = aleatoire(OCTETS_SEL);
  const sel2 = aleatoire(OCTETS_SEL);
  const [kekMdp, kekSec] = await Promise.all([
    deriverKek(mdp, sel1, iterations, ["encrypt", "decrypt"]),
    deriverKek(cle, sel2, iterations, ["encrypt", "decrypt"]),
  ]);
  return {
    version: VERSION_COFFRE,
    sel1: versB64u(sel1),
    sel2: versB64u(sel2),
    iterations,
    enveloppeMdp: await envelopper(kekMdp, vkOctets, VERSION_COFFRE, "mdp"),
    enveloppeSecours: await envelopper(kekSec, vkOctets, VERSION_COFFRE, "secours"),
    ...base,
  };
}

function verifierMeta(meta) {
  if (
    !meta ||
    meta.version !== VERSION_COFFRE ||
    typeof meta.sel1 !== "string" ||
    typeof meta.sel2 !== "string"
  )
    throw new ErreurCoffre("format", "Vault d'une version inconnue.");
}

async function ouvrirVkOctets(meta, secret, selChamp, enveloppeChamp, type, codeErreur) {
  verifierMeta(meta);
  const kek = await deriverKek(secret, depuisB64u(meta[selChamp]), meta.iterations, ["decrypt"]);
  try {
    return await desenvelopper(kek, meta[enveloppeChamp], meta.version, type);
  } catch (e) {
    if (e instanceof ErreurCoffre) throw e;
    throw new ErreurCoffre(
      codeErreur,
      codeErreur === "mot-de-passe" ? "Mot de passe incorrect." : "Clé de secours incorrecte.",
    );
  }
}

/** @returns {Promise<CryptoKey>} the VK, or throws ErreurCoffre("mot-de-passe") */
export async function deverrouiller(meta, motDePasse) {
  const o = await ouvrirVkOctets(
    meta,
    normaliserMotDePasse(motDePasse),
    "sel1",
    "enveloppeMdp",
    "mdp",
    "mot-de-passe",
  );
  const vk = await importerVk(o);
  o.fill(0);
  return vk;
}

/** Same with the secret key. Throws ErreurCoffre("cle-secours"). */
export async function deverrouillerParSecours(meta, cleSecours) {
  const cle = normaliserCleSecours(cleSecours);
  if (!cle) throw new ErreurCoffre("cle-secours", "Clé de secours incorrecte.");
  const o = await ouvrirVkOctets(meta, cle, "sel2", "enveloppeSecours", "secours", "cle-secours");
  const vk = await importerVk(o);
  o.fill(0);
  return vk;
}

/**
 * New password: the VK is re-wrapped, nothing is re-encrypted. A new secret key is NOT made
 * (the old one stays valid). @returns {Promise<object>} the new `meta`
 */
export async function changerMotDePasse(meta, ancien, nouveau) {
  const verif = validerMotDePasse(nouveau);
  if (!verif.ok) throw new ErreurCoffre("mot-de-passe", verif.message);
  const o = await ouvrirVkOctets(
    meta,
    normaliserMotDePasse(ancien),
    "sel1",
    "enveloppeMdp",
    "mdp",
    "mot-de-passe",
  );
  const sel1 = aleatoire(OCTETS_SEL);
  const kek = await deriverKek(normaliserMotDePasse(nouveau), sel1, meta.iterations, ["encrypt"]);
  const enveloppeMdp = await envelopper(kek, o, meta.version, "mdp");
  o.fill(0);
  return { ...meta, sel1: versB64u(sel1), enveloppeMdp };
}

/**
 * Forgotten password: the secret key opens the VK, a new password AND a new secret key are
 * made (the old key is spent). Items stay readable. @returns {{ meta, cleSecours, vk }}
 */
export async function reinitialiserParSecours(meta, cleSecours, nouveauMdp) {
  const verif = validerMotDePasse(nouveauMdp);
  if (!verif.ok) throw new ErreurCoffre("mot-de-passe", verif.message);
  const cle = normaliserCleSecours(cleSecours);
  if (!cle) throw new ErreurCoffre("cle-secours", "Clé de secours incorrecte.");
  const o = await ouvrirVkOctets(meta, cle, "sel2", "enveloppeSecours", "secours", "cle-secours");
  const nouvelle = genererCleSecours();
  const m = await fabriquerMeta(
    o,
    normaliserMotDePasse(nouveauMdp),
    normaliserCleSecours(nouvelle),
    meta.iterations,
    {
      creeLe: meta.creeLe,
    },
  );
  const vk = await importerVk(o);
  o.fill(0);
  return { meta: m, cleSecours: nouvelle, vk };
}

/** Regenerates the secret key only (needs the password). */
export async function regenererCleSecours(meta, motDePasse) {
  const o = await ouvrirVkOctets(
    meta,
    normaliserMotDePasse(motDePasse),
    "sel1",
    "enveloppeMdp",
    "mdp",
    "mot-de-passe",
  );
  const nouvelle = genererCleSecours();
  const sel2 = aleatoire(OCTETS_SEL);
  const kek = await deriverKek(normaliserCleSecours(nouvelle), sel2, meta.iterations, ["encrypt"]);
  const enveloppeSecours = await envelopper(kek, o, meta.version, "secours");
  o.fill(0);
  return { meta: { ...meta, sel2: versB64u(sel2), enveloppeSecours }, cleSecours: nouvelle };
}

/* ---------- items ---------- */

const aad = (uid, id, v) => encodeur.encode(`${uid}:${id}:${v}`);

/** Encrypts bytes. @returns {{ v: number, iv: string, donnees: string }} (a NEW IV every time) */
export async function chiffrerOctets(vk, uid, id, octets) {
  const iv = aleatoire(OCTETS_IV);
  const ct = new Uint8Array(
    await subtle().encrypt(
      { name: "AES-GCM", iv, additionalData: aad(uid, id, VERSION_COFFRE) },
      vk,
      octets,
    ),
  );
  return { v: VERSION_COFFRE, iv: versB64u(iv), donnees: versB64u(ct) };
}

/** @throws ErreurCoffre("corrompu") when altered, copied elsewhere or opened with another key */
export async function dechiffrerOctets(vk, uid, id, chiffre) {
  if (!chiffre || chiffre.v !== VERSION_COFFRE)
    throw new ErreurCoffre("format", "Format de chiffrement inconnu.");
  try {
    return new Uint8Array(
      await subtle().decrypt(
        { name: "AES-GCM", iv: depuisB64u(chiffre.iv), additionalData: aad(uid, id, chiffre.v) },
        vk,
        depuisB64u(chiffre.donnees),
      ),
    );
  } catch {
    throw new ErreurCoffre("corrompu", "Élément corrompu.");
  }
}

/** Single-string form stored in the `contenu` field: "v1.<iv>.<data>". */
export const versTexte = (c) => `v${c.v}.${c.iv}.${c.donnees}`;

export function depuisTexte(texte) {
  const m = /^v(\d+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(String(texte ?? ""));
  if (!m) throw new ErreurCoffre("format", "Élément chiffré illisible.");
  return { v: Number(m[1]), iv: m[2], donnees: m[3] };
}

/** True when `texte` has the shape of an encrypted content (the rules check the same shape). */
export const ressembleAChiffre = (texte) =>
  /^v\d+\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$/.test(String(texte ?? ""));

/**
 * Encrypts what the item shows: its content AND its title/name (decision 4), in one block.
 * @returns {Promise<string>} the string to store in `contenu`
 */
export async function chiffrerElement(vk, uid, id, { contenu, titre = "" }) {
  const octets = encodeur.encode(JSON.stringify({ contenu, titre }));
  return versTexte(await chiffrerOctets(vk, uid, id, octets));
}

/** @returns {Promise<{ contenu: string, titre: string }>} */
export async function dechiffrerElement(vk, uid, id, texte) {
  const octets = await dechiffrerOctets(vk, uid, id, depuisTexte(texte));
  try {
    const o = JSON.parse(decodeur.decode(octets));
    return { contenu: String(o.contenu ?? ""), titre: String(o.titre ?? "") };
  } catch {
    throw new ErreurCoffre("corrompu", "Élément corrompu.");
  }
}

/** A file: bytes → `iv(12) || ciphertext`, ready for Storage. The name is encrypted separately. */
export async function chiffrerFichier(vk, uid, id, octets) {
  const c = await chiffrerOctets(vk, uid, id, octets);
  const iv = depuisB64u(c.iv);
  const ct = depuisB64u(c.donnees);
  const sortie = new Uint8Array(iv.length + ct.length);
  sortie.set(iv);
  sortie.set(ct, iv.length);
  return sortie;
}

export async function dechiffrerFichier(vk, uid, id, octets) {
  if (octets.length < OCTETS_IV + 16) throw new ErreurCoffre("corrompu", "Élément corrompu.");
  return dechiffrerOctets(vk, uid, id, {
    v: VERSION_COFFRE,
    iv: versB64u(octets.subarray(0, OCTETS_IV)),
    donnees: versB64u(octets.subarray(OCTETS_IV)),
  });
}

/** Size shown for an encrypted file: rounded up to the next 64 KB (the real size stays visible in Storage). */
export const tailleAffichee = (octets) => Math.ceil(octets / 65536) * 65536;
