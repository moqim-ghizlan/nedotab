/**
 * V5.3: pure rules of the browser VPN (no chrome.*, no DOM). The proxy configuration, the
 * decision to answer a proxy authentication request, and the count of refused identifiers.
 * Nothing here stores or logs a password.
 */

/** Local storage key (chrome.storage.local): never part of the synced document. */
export const CLE_VPN = "nedotab:vpn";

/** Refused identifiers: more than this many answers within the window means "refused". */
export const ECHECS_MAX = 3;
export const FENETRE_ECHECS_MS = 20_000;

export const MESSAGES = {
  serveur: "Le serveur VPN ne répond pas.",
  identifiants: "Vos identifiants ne sont plus valides. Rafraîchissez-les.",
  autreExtension: "Une autre extension contrôle déjà le proxy de Chrome : désactivez-la d'abord.",
  politique: "Le proxy de Chrome est géré par votre organisation : le VPN ne peut pas s'activer.",
  permission:
    "Sans l'accès aux sites, NedoTab ne peut pas fournir automatiquement le mot de passe au serveur : le VPN reste désactivé.",
  incognito:
    "Pour la navigation privée, autorisez d'abord NedoTab dans les paramètres de l'extension (« Autoriser en navigation privée »).",
  trafic:
    "Attention, votre trafic ne passe pas par le VPN. Une autre extension ou un réglage a peut-être pris le contrôle.",
  webrtcAutre:
    "Une autre extension contrôle WebRTC : une visioconférence pourrait révéler votre vraie adresse.",
  pasAcces: "Aucun accès VPN sur cet ordinateur. Connectez-vous avec un compte invité.",
};

/**
 * Does this chrome.proxy.onProxyError mean the SERVER is unreachable? Only those do. A tunnel
 * that fails (ERR_TUNNEL_CONNECTION_FAILED) means one destination could not be reached through a
 * working proxy: it says nothing about the server and must not raise the alarm.
 */
const ERREURS_SERVEUR = [
  "ERR_PROXY_CONNECTION_FAILED",
  "ERR_PROXY_CERTIFICATE_INVALID",
  "ERR_CONNECTION_REFUSED",
  "ERR_CONNECTION_TIMED_OUT",
  "ERR_NAME_NOT_RESOLVED",
];
export const estPanneServeur = (details) =>
  details?.fatal !== false &&
  ERREURS_SERVEUR.some((nom) => String(details?.error ?? "").includes(nom));

/**
 * V5.5: addresses that never go through the VPN, so that the box and the devices at home keep
 * working. Nothing else is excluded by default (site exclusions come in V5.6, on request).
 */
export const BYPASS_LOCAL = [
  "<local>",
  "10.0.0.0/8",
  "172.16.0.0/12",
  "192.168.0.0/16",
  "127.0.0.1",
  "[::1]",
];

/** WebRTC may not use UDP outside the proxy while the VPN is on. */
export const POLITIQUE_WEBRTC = "disable_non_proxied_udp";

/** Can this extension set a privacy setting? (levelOfControl of chrome.privacy). */
export const reglageControlable = (niveau) =>
  niveau === "controllable_by_this_extension" || niveau === "controlled_by_this_extension";

/** chrome.proxy value: HTTPS proxy of the project, local addresses stay direct. */
export function configProxy({ domaine, port }) {
  return {
    mode: "fixed_servers",
    rules: {
      singleProxy: { scheme: "https", host: domaine, port: port ?? 443 },
      bypassList: [...BYPASS_LOCAL],
    },
  };
}

/** Why the proxy cannot be set, from chrome.proxy.settings.get().levelOfControl (else null). */
export function raisonNonControlable(niveau) {
  if (niveau === "controlled_by_other_extensions") return MESSAGES.autreExtension;
  if (niveau === "not_controllable") return MESSAGES.politique;
  return null;
}

/** Is the proxy really set by us, for this access? The interface shows the real state. */
export function estReellementActif(reglage, acces) {
  if (!acces || reglage?.levelOfControl !== "controlled_by_this_extension") return false;
  // V5.6: with per-site rules the proxy is a script naming the server.
  if (reglage.value?.mode === "pac_script")
    return String(reglage.value.pacScript?.data ?? "").includes(`HTTPS ${acces.domaine}:`);
  const p = reglage.value?.rules?.singleProxy;
  return reglage.value?.mode === "fixed_servers" && p?.host === acces.domaine;
}

/**
 * Identifiers are given ONLY to the proxy of the project: a proxy challenge (not a site's) from
 * the exact host (and port) of the access.
 */
export function estDemandeDuProxy(details, acces) {
  return (
    !!acces &&
    details?.isProxy === true &&
    details.challenger?.host === acces.domaine &&
    (details.challenger.port === undefined || details.challenger.port === (acces.port ?? 443))
  );
}

/**
 * Counts the answers given within the window. `etat` is {n, depuis}; the result says whether the
 * proxy keeps asking (identifiers refused) and the new state.
 */
export function suivreDemande(etat, maintenant) {
  const frais = !!etat && maintenant - etat.depuis <= FENETRE_ECHECS_MS;
  const n = (frais ? etat.n : 0) + 1;
  return { refuse: n > ECHECS_MAX, etat: { n, depuis: frais ? etat.depuis : maintenant } };
}
