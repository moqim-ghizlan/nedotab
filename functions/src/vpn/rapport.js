/**
 * V5.9: the traffic report of the server agent, and the limits it triggers (without Firebase
 * around, like fonctions.js). ONLY VOLUMES are received: bytes per proxy account / WireGuard
 * profile, and the bytes sent by the server. No destination exists anywhere in this module.
 *
 * vpn/config/usage/{uid}_{AAAA-MM}   { jours: { "21": { proxy, wireguard } }, total, alerte80? }
 * vpn/config/serveur/{AAAA-MM}       { jours: { "21": octets }, total, securite? }
 * vpn/config/acces/{uid}             + limiteMensuelleGo, suspendu ("limite"|"securite"|"manuel"|null)
 * vpn/config                         + limiteServeurGo (10 000 = 10 To, Always Free), coupureSecurite
 */
import { secretsEgaux } from "./identifiants.js";
import { GO, jourParis } from "./temps.js";
import { monterVersion } from "./version.js";

export const LIMITE_SERVEUR_GO = 10_000; // "10 TB per month of outbound data" (docs.oracle.com)
export const LIMITE_DEFAUT_GO = 50;
export const SEUIL_ALERTE = 0.8;
export const SEUIL_SERVEUR_ALERTE = 0.8;
export const SEUIL_SERVEUR_COUPURE = 0.95;

const COMPTE = /^u_[a-z0-9]{10}$/;
const PROFIL = /^p_[a-z0-9]{10}$/;
const OCTETS_MAX = 2 ** 50;
const entier = (v) => Number.isSafeInteger(v) && v >= 0 && v <= OCTETS_MAX;

export class ErreurRapport extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/** Exact shape or nothing: { parCompte: { <u_… | p_…>: { octetsProxy, octetsWireguard } }, serveur: { octetsSortants } }. */
export function rapportValide(r) {
  if (!r || typeof r !== "object" || Object.keys(r).sort().join() !== "parCompte,serveur")
    return false;
  if (
    !r.serveur ||
    Object.keys(r.serveur).join() !== "octetsSortants" ||
    !entier(r.serveur.octetsSortants)
  )
    return false;
  if (!r.parCompte || typeof r.parCompte !== "object" || Array.isArray(r.parCompte)) return false;
  return Object.entries(r.parCompte).every(
    ([cle, v]) =>
      (COMPTE.test(cle) || PROFIL.test(cle)) &&
      v &&
      Object.keys(v).sort().join() === "octetsProxy,octetsWireguard" &&
      entier(v.octetsProxy) &&
      entier(v.octetsWireguard),
  );
}

export function creerRapportVpn({
  db,
  jetonAgent,
  maintenant = () => Date.now(),
  journal = () => {},
}) {
  const lire = async (chemin) => {
    const s = await db.doc(chemin).get();
    return s.exists ? s.data() : null;
  };

  /** The owner is never suspended by the safety cut: his own invitation was sent by himself. */
  async function estProprietaire(uid, acces) {
    if (!acces.emailHash) return false;
    const inv = await lire(`vpn/config/invitations/${acces.emailHash}`);
    return inv?.invitePar === uid;
  }

  return {
    async enregistrer(jeton, rapport) {
      if (!secretsEgaux(jeton, jetonAgent())) return null;
      if (!rapportValide(rapport)) throw new ErreurRapport("invalid-argument", "Rapport invalide.");
      const { mois, jour } = jourParis(maintenant());
      const config = (await lire("vpn/config")) ?? {};
      const snap = await db.collection("vpn/config/acces").get();
      const parCle = new Map();
      for (const d of snap.docs) {
        const a = d.data();
        if (a.compte) parCle.set(a.compte, d.id);
        if (a.nomProfil) parCle.set(a.nomProfil, d.id);
      }

      // 1. Per guest: add the day's bytes, then check the limit.
      const deltas = new Map(); // uid → { proxy, wireguard }
      for (const [cle, v] of Object.entries(rapport.parCompte)) {
        const uid = parCle.get(cle);
        if (!uid) continue;
        const d = deltas.get(uid) ?? { proxy: 0, wireguard: 0 };
        if (COMPTE.test(cle)) d.proxy += v.octetsProxy;
        else d.wireguard += v.octetsWireguard;
        deltas.set(uid, d);
      }
      let changement = false;
      for (const [uid, d] of deltas) {
        if (!d.proxy && !d.wireguard) continue;
        const chemin = `vpn/config/usage/${uid}_${mois}`;
        const u = (await lire(chemin)) ?? { jours: {}, total: 0 };
        const j = u.jours[jour] ?? { proxy: 0, wireguard: 0 };
        j.proxy += d.proxy;
        j.wireguard += d.wireguard;
        u.jours[jour] = j;
        u.total += d.proxy + d.wireguard;
        const acces = await lire(`vpn/config/acces/${uid}`);
        const limiteGo =
          acces.limiteMensuelleGo === undefined
            ? (config.limiteParDefautGo ?? LIMITE_DEFAUT_GO)
            : acces.limiteMensuelleGo;
        const maj = { derniereActivite: `${mois}-${jour}` };
        if (limiteGo !== null) {
          const ratio = u.total / (limiteGo * GO);
          if (ratio >= SEUIL_ALERTE) u.alerte80 = true;
          if (ratio >= 1 && !acces.suspendu) {
            maj.suspendu = "limite";
            changement = true;
          }
        }
        await db.doc(chemin).set(u);
        await db.doc(`vpn/config/acces/${uid}`).set(maj, { merge: true });
      }

      // 2. The server: monthly total against the free allowance.
      const cheminS = `vpn/config/serveur/${mois}`;
      const s = (await lire(cheminS)) ?? { jours: {}, total: 0 };
      s.jours[jour] = (s.jours[jour] ?? 0) + rapport.serveur.octetsSortants;
      s.total += rapport.serveur.octetsSortants;
      const limiteServeur = (config.limiteServeurGo ?? LIMITE_SERVEUR_GO) * GO;
      if (
        s.total >= SEUIL_SERVEUR_COUPURE * limiteServeur &&
        config.coupureSecurite !== false &&
        !s.securite
      ) {
        s.securite = true;
        for (const d of snap.docs) {
          const a = d.data();
          if (a.actif !== true || a.suspendu || a.technique === true || (await estProprietaire(d.id, a)))
            continue;
          await db.doc(`vpn/config/acces/${d.id}`).set({ suspendu: "securite" }, { merge: true });
          changement = true;
        }
        journal({ coupureSecurite: true });
      }
      await db.doc(cheminS).set(s);

      if (changement) await monterVersion(db, maintenant);
      journal({ comptes: deltas.size });
      return { ok: true };
    },
  };
}
