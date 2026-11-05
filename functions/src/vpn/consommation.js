/**
 * V5.9: what the guests and the owner can read and do about the traffic (without Firebase around).
 * Volumes only. The owner sees a volume per friend, never a site; a guest sees his own volume.
 */
import { ErreurVpn, MESSAGE_RESERVE } from "./fonctions.js";
import { LIMITE_DEFAUT_GO, LIMITE_SERVEUR_GO, SEUIL_ALERTE } from "./rapport.js";
import { GO, jourParis, joursRestants } from "./temps.js";
import { hashEmail, normaliserEmail } from "./identifiants.js";
import { monterVersion } from "./version.js";

export function creerConsommationVpn({ db, maintenant = () => Date.now(), surveillance = null }) {
  const lire = async (chemin) => {
    const s = await db.doc(chemin).get();
    return s.exists ? s.data() : null;
  };
  const exigerAdmin = (auth) => {
    if (auth?.token?.admin !== true)
      throw new ErreurVpn("permission-denied", "Action réservée à l'administrateur.");
  };
  const limiteDe = (acces, config) =>
    acces.limiteMensuelleGo === undefined
      ? (config?.limiteParDefautGo ?? LIMITE_DEFAUT_GO)
      : acces.limiteMensuelleGo;

  /** uid of the guest with this e-mail (an accepted invitation), else not-found. */
  async function uidDe(email) {
    const inv = await lire(`vpn/config/invitations/${hashEmail(normaliserEmail(email))}`);
    if (!inv?.uid) throw new ErreurVpn("not-found", "Invité introuvable.");
    return inv.uid;
  }

  async function changerSuspension(uid, valeur) {
    const acces = await lire(`vpn/config/acces/${uid}`);
    if (!acces) throw new ErreurVpn("not-found", "Invité introuvable.");
    await db.doc(`vpn/config/acces/${uid}`).set({ suspendu: valeur }, { merge: true });
    await monterVersion(db, maintenant);
  }

  return {
    /** A guest: this month's volume, his limit, the days left. */
    async maConsommation(auth) {
      if (auth?.token?.email_verified !== true)
        throw new ErreurVpn("permission-denied", MESSAGE_RESERVE);
      const acces = await lire(`vpn/config/acces/${auth.uid}`);
      if (!acces || acces.actif !== true) throw new ErreurVpn("permission-denied", MESSAGE_RESERVE);
      const config = await lire("vpn/config");
      const { mois } = jourParis(maintenant());
      const u = await lire(`vpn/config/usage/${auth.uid}_${mois}`);
      const limiteGo = limiteDe(acces, config);
      const octets = u?.total ?? 0;
      return {
        octets,
        limiteGo,
        pourcent: limiteGo ? Math.min(100, Math.round((octets / (limiteGo * GO)) * 100)) : null,
        alerte: limiteGo ? octets / (limiteGo * GO) >= SEUIL_ALERTE : false,
        suspendu: acces.suspendu ?? null,
        joursRestants: joursRestants(maintenant()),
      };
    },

    /** The owner: one line per friend, and the server total of the month with its daily curve. */
    async tableau(auth) {
      exigerAdmin(auth);
      const { mois } = jourParis(maintenant());
      const config = await lire("vpn/config");
      const [invitations, acces] = await Promise.all([
        db.collection("vpn/config/invitations").get(),
        db.collection("vpn/config/acces").get(),
      ]);
      const parUid = new Map(acces.docs.map((d) => [d.id, d.data()]));
      const lignes = [];
      for (const d of invitations.docs) {
        const i = d.data();
        const a = i.uid ? parUid.get(i.uid) : null;
        const u = a ? await lire(`vpn/config/usage/${i.uid}_${mois}`) : null;
        const jours = Object.values(u?.jours ?? {});
        lignes.push({
          email: i.email,
          etat:
            i.statut === "revoquee" || !a || a.actif !== true
              ? "revoque"
              : a.suspendu
                ? "coupe"
                : "actif",
          raison: a?.suspendu ?? null,
          octetsProxy: jours.reduce((n, j) => n + j.proxy, 0),
          octetsWireguard: jours.reduce((n, j) => n + j.wireguard, 0),
          limiteGo: a ? limiteDe(a, config) : null,
          derniereActivite: a?.derniereActivite ?? null,
        });
      }
      lignes.sort(
        (x, y) => y.octetsProxy + y.octetsWireguard - (x.octetsProxy + x.octetsWireguard),
      );
      const s = await lire(`vpn/config/serveur/${mois}`);
      return {
        invites: lignes,
        serveur: {
          octets: s?.total ?? 0,
          limiteGo: config?.limiteServeurGo ?? LIMITE_SERVEUR_GO,
          jours: s?.jours ?? {},
          securite: s?.securite === true,
          coupureSecurite: config?.coupureSecurite !== false,
        },
        mois,
        // V5.10: "Serveur : en ligne / hors ligne depuis HH:MM"
        surveillance: surveillance ? await surveillance.etat() : { actif: false },
      };
    },

    async definirLimite(auth, { email, limiteGo } = {}) {
      exigerAdmin(auth);
      const valide =
        limiteGo === null || (Number.isFinite(limiteGo) && limiteGo >= 1 && limiteGo <= 100000);
      if (!valide)
        throw new ErreurVpn("invalid-argument", "Limite invalide (1 Go au moins, ou illimitée).");
      const uid = await uidDe(email);
      await db.doc(`vpn/config/acces/${uid}`).set({ limiteMensuelleGo: limiteGo }, { merge: true });
      return { ok: true };
    },

    /** Cut now: the agent applies it at its next sync (one minute at most), proxy and WireGuard. */
    async couper(auth, { email } = {}) {
      exigerAdmin(auth);
      await changerSuspension(await uidDe(email), "manuel");
      return { ok: true };
    },

    async retablir(auth, { email } = {}) {
      exigerAdmin(auth);
      await changerSuspension(await uidDe(email), null);
      return { ok: true };
    },

    async definirCoupureSecurite(auth, { active } = {}) {
      exigerAdmin(auth);
      if (typeof active !== "boolean") throw new ErreurVpn("invalid-argument", "Valeur invalide.");
      await db.doc("vpn/config").set({ coupureSecurite: active }, { merge: true });
      return { ok: true };
    },
  };
}
