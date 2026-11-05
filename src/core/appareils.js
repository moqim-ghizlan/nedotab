/**
 * Named devices of an account (T12). Pure: no DOM, no Firebase. A device is an id (random,
 * stored on the device) and a name chosen by the user ("work-pc"). The list lives in
 * users/{uid}/appareils/{id}; nothing technical is collected (no fingerprint, no user agent).
 *
 * @typedef {{ id: string, nom: string, type: string, creeLe?: number, vuLe?: number }} Appareil
 */
import { libelleAppareil } from "./appareil.js";

export const NOM_APPAREIL_MAX = 30;
export const APPAREILS_MAX = 20;
export const TYPES_APPAREIL = ["extension", "pwa", "iphone", "ipad", "navigateur"];

/** Same name test whatever the case or the accents ("Maison" = "maison" = "Maïson"). */
export const cleNom = (nom) =>
  String(nom ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("fr")
    .trim();

// Control characters, and anything that looks like a tag.
// eslint-disable-next-line no-control-regex
const CONTROLE = /[\u0000-\u001f\u007f-\u009f]/;
const BALISE = /[<>]/;

/**
 * Checks a device name. `existants` are the other devices; `idCourant` is the one being
 * named (it may keep its own name).
 * @returns {{ ok: true, nom: string } | { ok: false, erreur: string }}
 */
export function validerNomAppareil(nom, existants = [], idCourant = null) {
  const brut = String(nom ?? "");
  if (CONTROLE.test(brut)) return { ok: false, erreur: "Caractères non autorisés." };
  const propre = brut.replace(/\s+/g, " ").trim();
  if (!propre) return { ok: false, erreur: "Donnez un nom à cet appareil." };
  if (BALISE.test(propre)) return { ok: false, erreur: "Les signes < et > ne sont pas autorisés." };
  if ([...propre].length > NOM_APPAREIL_MAX)
    return { ok: false, erreur: `${NOM_APPAREIL_MAX} caractères au plus.` };
  const cle = cleNom(propre);
  if (existants.some((a) => a.id !== idCourant && cleNom(a.nom) === cle))
    return { ok: false, erreur: "Un autre appareil porte déjà ce nom." };
  return { ok: true, nom: propre };
}

/** Suggested name: "Chrome", "iPhone"… and a number when it is taken ("Chrome 2"). */
export function nomParDefaut(type, existants = []) {
  const base = libelleAppareil(type);
  const pris = new Set(existants.map((a) => cleNom(a.nom)));
  if (!pris.has(cleNom(base))) return base;
  for (let n = 2; n <= APPAREILS_MAX + 1; n++) {
    const nom = `${base} ${n}`;
    if (!pris.has(cleNom(nom))) return nom;
  }
  return base;
}

export const trouverAppareil = (liste, id) =>
  (Array.isArray(liste) ? liste : []).find((a) => a.id === id) ?? null;

/**
 * How an item or a backup names its device. 1) the CURRENT name found by id (a renamed device
 * renames all its old items); 2) the name written at the time; 3) the kind of device. Never
 * throws.
 */
export function libelleAppareilAffiche({ appareilId, appareil, type } = {}, liste = []) {
  const connu = appareilId ? trouverAppareil(liste, appareilId) : null;
  if (connu?.nom) return connu.nom;
  if (typeof appareil === "string" && appareil && !TYPES_APPAREIL.includes(appareil))
    return appareil; // a name written at the time
  return libelleAppareil(type ?? appareil);
}

export const peutAjouterAppareil = (liste) => (liste?.length ?? 0) < APPAREILS_MAX;

/** New list with the device added (refused when full or when the name is invalid). */
export function ajouterAppareil(liste, appareil) {
  const v = validerNomAppareil(appareil?.nom, liste, appareil?.id);
  if (!v.ok || !appareil.id) return { ok: false, erreur: v.erreur ?? "Appareil invalide.", liste };
  const sans = liste.filter((a) => a.id !== appareil.id);
  if (sans.length >= APPAREILS_MAX)
    return { ok: false, erreur: `${APPAREILS_MAX} appareils au plus.`, liste };
  return { ok: true, liste: [...sans, { ...appareil, nom: v.nom }] };
}

export function renommerAppareil(liste, id, nom) {
  const v = validerNomAppareil(nom, liste, id);
  if (!v.ok) return { ok: false, erreur: v.erreur, liste };
  if (!trouverAppareil(liste, id)) return { ok: false, erreur: "Appareil introuvable.", liste };
  return { ok: true, liste: liste.map((a) => (a.id === id ? { ...a, nom: v.nom } : a)) };
}

/** Removing the current device is refused; no data is deleted, only the list entry. */
export function retirerAppareil(liste, id, idCourant) {
  if (id === idCourant) return { ok: false, erreur: "Impossible de retirer cet appareil.", liste };
  return { ok: true, liste: liste.filter((a) => a.id !== id) };
}

/** Cleans a stored document (anything wrong falls back or drops the entry). */
export function appareilDepuisDoc(id, d) {
  if (typeof id !== "string" || !id || !d || typeof d.nom !== "string") return null;
  const nom = d.nom.replace(/\s+/g, " ").trim().slice(0, NOM_APPAREIL_MAX);
  if (!nom) return null;
  return {
    id,
    nom,
    type: TYPES_APPAREIL.includes(d.type) ? d.type : "navigateur",
    creeLe: d.creeLe?.toMillis?.() ?? (Number.isFinite(d.creeLe) ? d.creeLe : undefined),
    vuLe: d.vuLe?.toMillis?.() ?? (Number.isFinite(d.vuLe) ? d.vuLe : undefined),
  };
}

const JOUR = 86_400_000;
/** "il y a 2 h" for the list; vuLe is written once a day at most, so the grain is coarse. */
export function derniereActivite(ms, maintenant = Date.now()) {
  if (!Number.isFinite(ms)) return "";
  const d = Math.max(0, maintenant - ms);
  if (d < 3_600_000) return "il y a moins d'1 h";
  if (d < JOUR) return `il y a ${Math.floor(d / 3_600_000)} h`;
  const j = Math.floor(d / JOUR);
  return j === 1 ? "hier" : `il y a ${j} j`;
}

/** True when `vuLe` is more than a day old: time to write it again. */
export const vuLeAJourner = (vuLe, maintenant = Date.now()) =>
  !Number.isFinite(vuLe) || maintenant - vuLe >= JOUR;
