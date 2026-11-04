/**
 * V5.2: the VPN functions, without Firebase around them so that they can be tested (`deps`
 * brings the database, the secrets, the Auth lookup, the clock and the quota).
 *
 * vpn/config                              { domaineProxy, portProxy, pays, actif }
 * vpn/etat                                { version }  goes up at every change of the accounts
 * vpn/config/invitations/{emailHash}      { email, invitePar, invitationLe, statut, uid? }
 * vpn/config/acces/{uid}                  { compte, empreinte, motDePasseChiffre, emailHash,
 *                                           creeLe, actif, revoqueLe? }
 * The browser can neither read nor write any of it (firestore.rules): only these functions.
 * Never in a log: e-mail, uid, account name or password.
 */
import { chiffrer, dechiffrer } from "../chiffrement.js";
import {
  emailValide,
  empreinteBcrypt,
  genererCompte,
  genererMotDePasse,
  hashEmail,
  normaliserEmail,
  secretsEgaux,
} from "./identifiants.js";

export const QUOTA_OBTENIR_PAR_JOUR = 30;
export const MESSAGE_RESERVE = "Le VPN est réservé aux invités.";

const CHEMIN = {
  config: "vpn/config",
  etat: "vpn/etat",
  invitation: (h) => `vpn/config/invitations/${h}`,
  invitations: "vpn/config/invitations",
  acces: (uid) => `vpn/config/acces/${uid}`,
  profil: (uid) => `vpn/config/profils/${uid}`,
  listeAcces: "vpn/config/acces",
};

export class ErreurVpn extends Error {
  /** @param {string} code a callable code ("permission-denied", "invalid-argument"…) */
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/**
 * @param {{
 *   db: any,
 *   cle: () => string,
 *   jetonAgent: () => string,
 *   utilisateurParEmail: (email: string) => Promise<{ uid: string, emailVerified: boolean } | null>,
 *   consommer: (uid: string, options: object) => Promise<unknown>,
 *   maintenant?: () => number,
 *   cout?: number,
 *   journal?: (infos: object) => void,
 * }} deps
 */
export function creerFonctionsVpn({
  db,
  cle,
  jetonAgent,
  utilisateurParEmail,
  consommer,
  maintenant = () => Date.now(),
  cout,
  journal = () => {},
}) {
  const lire = async (chemin) => {
    const s = await db.doc(chemin).get();
    return s.exists ? s.data() : null;
  };

  /** The version the agent compares: strictly increasing, even within the same millisecond. */
  async function monterVersion() {
    const actuel = (await lire(CHEMIN.etat))?.version ?? 0;
    const version = Math.max(maintenant(), actuel + 1);
    await db.doc(CHEMIN.etat).set({ version });
    return version;
  }

  async function config() {
    const c = await lire(CHEMIN.config);
    if (!c || c.actif === false || !c.domaineProxy) {
      throw new ErreurVpn("failed-precondition", "Le VPN n'est pas disponible pour le moment.");
    }
    return c;
  }

  /** Creates (or renews) the identifiers of `uid` and returns the clear password, once. */
  async function creerAcces(uid, emailHash) {
    const motDePasse = genererMotDePasse();
    const existant = await lire(CHEMIN.acces(uid));
    await db.doc(CHEMIN.acces(uid)).set({
      compte: existant?.compte ?? genererCompte(),
      empreinte: empreinteBcrypt(motDePasse, cout),
      motDePasseChiffre: chiffrer(motDePasse, cle(), uid),
      emailHash,
      creeLe: existant?.creeLe ?? maintenant(),
      actif: true,
    });
    await monterVersion();
    return motDePasse;
  }

  /** The invitation of this verified e-mail becomes "acceptee" and the access exists. */
  async function accepter(uid, emailHash) {
    await db.doc(CHEMIN.invitation(emailHash)).set({ statut: "acceptee", uid }, { merge: true });
    const acces = await lire(CHEMIN.acces(uid));
    if (!acces || acces.actif !== true) await creerAcces(uid, emailHash);
  }

  const exigerAdmin = (auth) => {
    if (auth?.token?.admin !== true)
      throw new ErreurVpn("permission-denied", "Action réservée à l'administrateur.");
  };

  return {
    /** Admin: invites an e-mail address; a user who already exists (verified) is accepted now. */
    async inviter(auth, { email } = {}) {
      exigerAdmin(auth);
      if (!emailValide(email)) throw new ErreurVpn("invalid-argument", "Adresse e-mail invalide.");
      const normalise = normaliserEmail(email);
      const h = hashEmail(normalise);
      const actuelle = await lire(CHEMIN.invitation(h));
      if (actuelle?.statut === "acceptee") {
        const acces = actuelle.uid ? await lire(CHEMIN.acces(actuelle.uid)) : null;
        if (acces?.actif === true) return { statut: "acceptee" };
      }
      await db.doc(CHEMIN.invitation(h)).set({
        email: normalise,
        invitePar: auth.uid,
        invitationLe: maintenant(),
        statut: "en_attente",
      });
      const utilisateur = await utilisateurParEmail(normalise);
      if (utilisateur?.emailVerified === true) {
        await accepter(utilisateur.uid, h);
        return { statut: "acceptee" };
      }
      return { statut: "en_attente" };
    },

    /** Admin: removes an access (by e-mail or by uid); the agent drops it within a minute. */
    async revoquer(auth, { emailOuUid } = {}) {
      exigerAdmin(auth);
      const cible = String(emailOuUid ?? "").trim();
      if (!cible) throw new ErreurVpn("invalid-argument", "Indiquez une adresse e-mail.");
      let h;
      let uid;
      if (cible.includes("@")) {
        h = hashEmail(cible);
        uid = (await lire(CHEMIN.invitation(h)))?.uid ?? null;
      } else {
        uid = cible;
        h = (await lire(CHEMIN.acces(uid)))?.emailHash ?? null;
      }
      if (!h && !uid) throw new ErreurVpn("not-found", "Invité introuvable.");
      if (h && (await lire(CHEMIN.invitation(h))))
        await db.doc(CHEMIN.invitation(h)).set({ statut: "revoquee" }, { merge: true });
      if (uid && (await lire(CHEMIN.acces(uid)))) {
        await db
          .doc(CHEMIN.acces(uid))
          .set({ actif: false, revoqueLe: maintenant() }, { merge: true });
        await db.doc(CHEMIN.profil(uid)).delete(); // V5.7: the WireGuard profile goes too
        await monterVersion();
      }
      return { ok: true };
    },

    /** Admin: the invitations and their state. Never a password, never a login. */
    async listeInvites(auth) {
      exigerAdmin(auth);
      const [invitations, acces] = await Promise.all([
        db.collection(CHEMIN.invitations).get(),
        db.collection(CHEMIN.listeAcces).get(),
      ]);
      const actifs = new Set(acces.docs.filter((d) => d.data().actif === true).map((d) => d.id));
      const invites = invitations.docs
        .map((d) => {
          const i = d.data();
          return {
            email: i.email,
            statut: i.statut,
            invitationLe: i.invitationLe ?? null,
            acces: i.statut === "acceptee" && actifs.has(i.uid),
          };
        })
        .sort((a, b) => (b.invitationLe ?? 0) - (a.invitationLe ?? 0));
      return { invites };
    },

    /** Any signed-in user: identifiers of an invited, verified account; refused otherwise. */
    async obtenirAcces(auth) {
      if (auth?.token?.email_verified !== true || !auth.token.email)
        throw new ErreurVpn("permission-denied", MESSAGE_RESERVE);
      const { uid } = auth;
      const h = hashEmail(auth.token.email);
      const invitation = await lire(CHEMIN.invitation(h));
      if (!invitation || invitation.statut === "revoquee")
        throw new ErreurVpn("permission-denied", MESSAGE_RESERVE);
      if (invitation.statut === "acceptee" && invitation.uid && invitation.uid !== uid) {
        // The e-mail now belongs to another account (the first one was deleted): re-issue.
        await db.doc(CHEMIN.invitation(h)).set({ statut: "en_attente" }, { merge: true });
      }
      const c = await config();
      await limiter(consommer, uid);
      await accepter(uid, h);
      const acces = await lire(CHEMIN.acces(uid));
      return {
        domaine: c.domaineProxy,
        port: c.portProxy ?? 443,
        compte: acces.compte,
        motDePasse: dechiffrer(acces.motDePasseChiffre, cle(), uid),
        pays: c.pays ?? null,
      };
    },

    /** A guest asks for a new password (doubt): the old one stops working at the next sync. */
    async regenererMotDePasse(auth) {
      if (auth?.token?.email_verified !== true)
        throw new ErreurVpn("permission-denied", MESSAGE_RESERVE);
      const { uid } = auth;
      const acces = await lire(CHEMIN.acces(uid));
      if (!acces || acces.actif !== true) throw new ErreurVpn("permission-denied", MESSAGE_RESERVE);
      const c = await config();
      await limiter(consommer, uid);
      const motDePasse = await creerAcces(uid, acces.emailHash);
      return {
        domaine: c.domaineProxy,
        port: c.portProxy ?? 443,
        compte: acces.compte,
        motDePasse,
        pays: c.pays ?? null,
      };
    },

    /** Account deleted: its access disappears (no VPN account may outlive its owner). */
    async retirerAccesDe(uid) {
      const acces = await lire(CHEMIN.acces(uid));
      if (!acces) return;
      await db.doc(CHEMIN.acces(uid)).delete();
      await db.doc(CHEMIN.profil(uid)).delete(); // V5.7
      if (acces.emailHash)
        await db
          .doc(CHEMIN.invitation(acces.emailHash))
          .set({ statut: "revoquee" }, { merge: true });
      await monterVersion();
    },

    /**
     * What the agent of the server reads: { version, comptes: [{ compte, empreinte }] } for the
     * active accesses only. `jeton` is the bearer token; anything else gets `null` (401).
     */
    async synchro(jeton) {
      if (!secretsEgaux(jeton, jetonAgent())) return null;
      const [etat, acces] = await Promise.all([
        lire(CHEMIN.etat),
        db.collection(CHEMIN.listeAcces).where("actif", "==", true).get(),
      ]);
      // V5.9: a suspended guest (limit reached, safety cut, owner's decision) is left out.
      const comptes = acces.docs
        .filter((d) => !d.data().suspendu)
        .map((d) => ({ compte: d.data().compte, empreinte: d.data().empreinte }))
        .sort((a, b) => a.compte.localeCompare(b.compte));
      journal({ comptes: comptes.length });
      return { version: etat?.version ?? 0, comptes };
    },
  };
}

async function limiter(consommer, uid) {
  try {
    await consommer(uid, { limite: QUOTA_OBTENIR_PAR_JOUR, document: "quotaVpn" });
  } catch (e) {
    if (e?.limite !== undefined)
      throw new ErreurVpn("resource-exhausted", "Trop de demandes aujourd'hui, réessayez demain.");
    throw e;
  }
}
