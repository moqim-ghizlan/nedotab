/**
 * V5.10: availability watch of the VPN proxy (without Firebase around, like fonctions.js).
 * Every 10 minutes a scheduled function opens a TLS connection to the proxy and asks for a tunnel
 * with a dedicated technical account (limit 1 Go, no WireGuard profile, never a guest). Three
 * failures in a row raise the alert; the first success ends it. Nothing but the state is stored.
 *
 * vpn/config/surveillance/etat      { echecs, alerte, horsLigneDepuis?, enLigneDepuis?, dernierTest }
 * vpn/config/acces/technique   { compte, empreinte, motDePasseChiffre, technique: true, ... }
 */
import { Buffer } from "node:buffer";
import tls from "node:tls";
import { chiffrer, dechiffrer } from "../chiffrement.js";
import { ErreurVpn } from "./fonctions.js";
import { empreinteBcrypt, genererCompte, genererMotDePasse } from "./identifiants.js";
import { monterVersion } from "./version.js";

export const ECHECS_ALERTE = 3;
export const UID_TECHNIQUE = "technique";
const CIBLE = "example.com:443";

/** New state after one test. `t` is the clock in ms. Pure. */
export function evaluer(etat, ok, t) {
  const avant = {
    echecs: 0,
    alerte: false,
    horsLigneDepuis: null,
    enLigneDepuis: null,
    premierEchec: null,
    ...etat,
  };
  if (ok) {
    return {
      ...avant,
      echecs: 0,
      alerte: false,
      premierEchec: null,
      horsLigneDepuis: null,
      enLigneDepuis: avant.horsLigneDepuis || !avant.enLigneDepuis ? t : avant.enLigneDepuis,
      dernierTest: t,
    };
  }
  const echecs = avant.echecs + 1;
  const premierEchec = avant.premierEchec ?? t;
  const alerte = echecs >= ECHECS_ALERTE;
  return {
    ...avant,
    echecs,
    premierEchec,
    alerte,
    horsLigneDepuis: alerte ? premierEchec : avant.horsLigneDepuis,
    enLigneDepuis: alerte ? null : avant.enLigneDepuis,
    dernierTest: t,
  };
}

/**
 * Real probe: TLS to the proxy, then CONNECT with Basic authentication. Online = "200".
 * `connecter` is replaceable for the tests. The password is only in the request, never logged.
 */
export function sonder(
  { domaine, port = 443, compte, motDePasse },
  { connecter = tls.connect, delaiMs = 10_000 } = {},
) {
  return new Promise((resolve) => {
    let fini = false;
    const fin = (r) => {
      if (fini) return;
      fini = true;
      try {
        socket.destroy();
      } catch {
        /* already closed */
      }
      resolve(r);
    };
    const socket = connecter({ host: domaine, port, servername: domaine, timeout: delaiMs }, () => {
      const auth = Buffer.from(`${compte}:${motDePasse}`).toString("base64");
      socket.write(
        `CONNECT ${CIBLE} HTTP/1.1\r\nHost: ${CIBLE}\r\nProxy-Authorization: Basic ${auth}\r\n\r\n`,
      );
    });
    let recu = "";
    socket.on("data", (d) => {
      recu += d.toString("latin1");
      const m = /^HTTP\/1\.[01] (\d{3})/.exec(recu);
      if (m) fin({ ok: m[1] === "200", code: Number(m[1]) });
    });
    socket.on("timeout", () => fin({ ok: false, code: 0 }));
    socket.on("error", () => fin({ ok: false, code: 0 }));
    socket.on("close", () => fin({ ok: false, code: 0 }));
  });
}

export function creerSurveillanceVpn({
  db,
  cle,
  sonde = sonder,
  maintenant = () => Date.now(),
  cout,
  journal = () => {},
}) {
  const lire = async (chemin) => {
    const s = await db.doc(chemin).get();
    return s.exists ? s.data() : null;
  };

  return {
    /** Admin, once: creates the technical account that the agent adds to the proxy. */
    async initialiser(auth) {
      if (auth?.token?.admin !== true)
        throw new ErreurVpn("permission-denied", "Action réservée à l'administrateur.");
      if (await lire(`vpn/config/acces/${UID_TECHNIQUE}`)) return { ok: true, dejaFait: true };
      const motDePasse = genererMotDePasse();
      await db.doc(`vpn/config/acces/${UID_TECHNIQUE}`).set({
        compte: genererCompte(),
        empreinte: empreinteBcrypt(motDePasse, cout),
        motDePasseChiffre: chiffrer(motDePasse, cle(), UID_TECHNIQUE),
        creeLe: maintenant(),
        actif: true,
        technique: true,
        limiteMensuelleGo: 1,
      });
      await db.doc("vpn/config/surveillance/etat").set({ echecs: 0, alerte: false });
      await monterVersion(db, maintenant);
      return { ok: true, dejaFait: false };
    },

    /** The scheduled test. Does nothing until `initialiser` has been called. */
    async verifier() {
      const acces = await lire(`vpn/config/acces/${UID_TECHNIQUE}`);
      const config = await lire("vpn/config");
      if (!acces || !config?.domaineProxy) return { actif: false };
      const resultat = await sonde({
        domaine: config.domaineProxy,
        port: config.portProxy ?? 443,
        compte: acces.compte,
        motDePasse: dechiffrer(acces.motDePasseChiffre, cle(), UID_TECHNIQUE),
      });
      const avant = (await lire("vpn/config/surveillance/etat")) ?? {};
      const apres = evaluer(avant, resultat.ok, maintenant());
      await db.doc("vpn/config/surveillance/etat").set(apres);
      // State changes only: "hors ligne" and "retour en ligne".
      if (apres.alerte !== !!avant.alerte) journal({ horsLigne: apres.alerte });
      return { actif: true, ok: resultat.ok, alerte: apres.alerte };
    },

    /** What the owner's screen shows: online / offline since, alert. */
    async etat() {
      const s = await lire("vpn/config/surveillance/etat");
      if (!s) return { actif: false, enLigne: null, depuis: null, alerte: false };
      return {
        actif: true,
        enLigne: s.dernierTest ? !s.alerte && s.echecs < ECHECS_ALERTE : null,
        depuis: s.alerte ? (s.horsLigneDepuis ?? null) : (s.enLigneDepuis ?? null),
        alerte: s.alerte === true,
      };
    },
  };
}
