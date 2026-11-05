import { POLITIQUE_WEBRTC } from "../../core/vpnProxy.js";
import { plateforme } from "../../platform/index.js";
import { el } from "../dom.js";

/** Public STUN server used to make the browser reveal its candidates (it learns nothing else). */
export const STUN = "stun:stun.l.google.com:19302";
/** DNS leak test opened by the user in a new tab (the result is read by the user). */
export const URL_TEST_DNS = "https://www.dnsleaktest.com/";
/** WebRTC leak test opened by the user on a real site. */
export const URL_TEST_WEBRTC = "https://browserleaks.com/webrtc";

/** Collects the ICE candidates of a throw-away connection (5 s at most). */
export function collecterCandidats({ Rtc = globalThis.RTCPeerConnection, delaiMs = 5000 } = {}) {
  return new Promise((resolve) => {
    if (!Rtc) return resolve({ candidats: [], disponible: false });
    const candidats = [];
    let pc;
    const fin = () => {
      try {
        pc?.close();
      } catch {
        /* already closed */
      }
      resolve({ candidats, disponible: true });
    };
    try {
      pc = new Rtc({ iceServers: [{ urls: STUN }] });
      pc.createDataChannel("test");
      pc.onicecandidate = (e) => {
        if (!e.candidate) return fin();
        candidats.push(e.candidate.candidate);
      };
      pc.createOffer().then((o) => pc.setLocalDescription(o), fin);
      setTimeout(fin, delaiMs);
    } catch {
      fin();
    }
  });
}

/**
 * Settings → VPN → "Tester les fuites" (V5.5). Each line is a MEASURE (address seen by sites,
 * WebRTC candidates, policies read from Chrome). The DNS test is done by the user on a public
 * service: it is explained, not claimed.
 */
export async function demarrerTestFuites(
  racine,
  {
    vpn = plateforme.vpnNavigateur?.(),
    verification = plateforme.verificationVpn?.(),
    chromeApi = globalThis.chrome,
  } = {},
) {
  const liste = el("ul", { class: "fuites-liste" });
  const global = el("p", { class: "fuites-global", role: "status", texte: "Test en cours…" });
  racine.replaceChildren(
    el("h1", { texte: "Tester les fuites" }),
    el("p", {
      class: "reglages-note",
      texte:
        "Ce test vérifie ce que les sites peuvent apprendre de vous malgré le VPN. Il ne garantit pas l'absence de toute fuite.",
    }),
    global,
    liste,
  );
  const lignes = [];
  const ajouter = (statut, libelle, detail) => {
    lignes.push(statut);
    liste.append(
      el(
        "li",
        { class: `fuites-ligne fuites-ligne--${statut}` },
        el("strong", { texte: `${{ ok: "✓", echec: "✗", inconnu: "–" }[statut]} ${libelle}` }),
        detail ? el("span", { class: "reglages-note", texte: detail }) : null,
      ),
    );
  };

  const etat = await vpn?.etat().catch(() => null);
  if (!etat?.actif) {
    global.textContent = "Activez d'abord le VPN : il n'y a rien à tester sinon.";
    return;
  }

  // 1. Address seen by the sites (V5.4)
  const verif = await verification?.tester({ manuel: true }).catch(() => null);
  if (!verif || verif.global === "echec" || verif.global === "fuite")
    ajouter("echec", "Adresse vue par les sites", verif?.message ?? "Mesure impossible.");
  else
    ajouter(verif.global === "ok" ? "ok" : "inconnu", "Adresse vue par les sites", verif.message);

  // 2. WebRTC: NOT measured from this page. Seen on 2026-11-05: this extension page exposes the
  // real address even with the policy set, while a real site (browserleaks.com/webrtc) sees none.
  // A measure that disagrees with what sites see would be misleading, so the user checks on a site.
  liste.append(
    el(
      "li",
      { class: "fuites-ligne fuites-ligne--inconnu" },
      el("strong", { texte: "– WebRTC (à vérifier sur un vrai site)" }),
      el("span", {
        class: "reglages-note",
        texte:
          "Cette page n'est pas un site : elle ne représente pas ce que les sites voient. Ouvrez le test ci-dessous : « Public IP Address » doit afficher un tiret, ou l'adresse du serveur.",
      }),
      el("a", {
        href: URL_TEST_WEBRTC,
        target: "_blank",
        rel: "noopener noreferrer",
        texte: "Ouvrir le test WebRTC",
      }),
    ),
  );

  // 3. Policies as Chrome reports them
  try {
    const w = await chromeApi.privacy.network.webRTCIPHandlingPolicy.get({});
    const bon = w.value === POLITIQUE_WEBRTC && w.levelOfControl === "controlled_by_this_extension";
    ajouter(
      bon ? "ok" : "echec",
      "Politique WebRTC",
      bon
        ? "WebRTC ne peut pas utiliser de connexion hors proxy."
        : "La politique n'est pas posée par NedoTab (une autre extension la contrôle, ou le VPN vient d'être activé).",
    );
  } catch {
    ajouter("inconnu", "Politique WebRTC", "Lecture impossible.");
  }
  try {
    const p = await chromeApi.proxy.settings.get({ incognito: false });
    const bon = p.levelOfControl === "controlled_by_this_extension";
    ajouter(
      bon ? "ok" : "echec",
      "Contrôle du proxy",
      bon
        ? "Le proxy de Chrome est contrôlé par NedoTab."
        : "Un autre contrôle du proxy est actif.",
    );
  } catch {
    ajouter("inconnu", "Contrôle du proxy", "Lecture impossible.");
  }

  // 4. DNS: done by the user
  liste.append(
    el(
      "li",
      { class: "fuites-ligne fuites-ligne--inconnu" },
      el("strong", { texte: "– DNS (à vérifier vous-même)" }),
      el("span", {
        class: "reglages-note",
        texte:
          "Chrome envoie le nom du site au serveur, qui le résout. Pour le vérifier, ouvrez le test ci-dessous et lancez « Extended test » : seuls des résolveurs du serveur doivent apparaître, jamais ceux de votre fournisseur d'accès. Relancez dans un nouvel onglet après chaque changement.",
      }),
      el("a", {
        href: URL_TEST_DNS,
        target: "_blank",
        rel: "noopener noreferrer",
        texte: "Ouvrir le test DNS",
      }),
    ),
  );

  global.textContent = lignes.includes("echec")
    ? "Problèmes détectés : voir ci-dessous."
    : "Aucune fuite détectée par ces vérifications (le test DNS reste à faire à la main).";
}
