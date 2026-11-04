/**
 * V5.4: pure rules of the VPN connection check (no chrome.*, no DOM, no network).
 * What is MEASURED (the address and country the sites see) is compared with what is expected.
 */

/** Local storage key (chrome.storage.local): the normal IP never leaves this computer. */
export const CLE_VERIF = "nedotab:vpn:verif";
export const HISTORIQUE_MAX = 10;
/** A check older than this is "not verified recently" (orange). */
export const PEREMPTION_MS = 30 * 60_000;
export const INTERVALLE_AUTO_MS = 15 * 60_000;

const V4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const V6 = /^[0-9a-f:]{2,39}$/i;
export const estIp = (s) =>
  typeof s === "string" && (V4.test(s) || (s.includes(":") && V6.test(s) && s.length >= 3));
const famille = (ip) => (ip.includes(":") ? 6 : 4);
const cc = (s) => (typeof s === "string" && /^[A-Za-z]{2}$/.test(s) ? s.toUpperCase() : null);

/** Services of echo, tried in order (no key, no tracker): see docs/decisions.md. */
export const SERVICES = [
  {
    nom: "cloudflare",
    url: "https://www.cloudflare.com/cdn-cgi/trace",
    lire: lireTraceCloudflare,
  },
  { nom: "country.is", url: "https://api.country.is/", lire: lireCountryIs },
];

/** "ip=1.2.3.4\nloc=FR\n…" → { ip, pays } or null. */
export function lireTraceCloudflare(texte) {
  if (typeof texte !== "string") return null;
  const champ = (k) => texte.match(new RegExp(`^${k}=(.+)$`, "m"))?.[1]?.trim();
  const ip = champ("ip");
  return estIp(ip) ? { ip, pays: cc(champ("loc")) } : null;
}

/** { ip, country } → { ip, pays } or null. */
export function lireCountryIs(json) {
  return estIp(json?.ip) ? { ip: json.ip, pays: cc(json.country) } : null;
}

/** First usable answer of a list of [service, answer] (the fallback when the first fails). */
export function premiereReponse(essais) {
  for (const { service, valeur } of essais) {
    const r = service.lire(valeur);
    if (r) return { ...r, service: service.nom };
  }
  return null;
}

/** Same address family only: an IPv4 and an IPv6 never prove anything about each other. */
export function comparerIp(a, b) {
  if (!estIp(a) || !estIp(b)) return "inconnu";
  if (famille(a) !== famille(b)) return "inconnu";
  return a.toLowerCase() === b.toLowerCase() ? "egal" : "different";
}

const moyenne = (l) => (l.length ? Math.round(l.reduce((s, n) => s + n, 0) / l.length) : null);

const ETAPES = [
  ["domaine", "Adresse du serveur trouvée"],
  ["connexion", "Connexion chiffrée au serveur"],
  ["auth", "Identifiants acceptés"],
  ["site", "Accès à un site public"],
  ["ip", "Les sites vous voient depuis le serveur"],
  ["latence", "Latence"],
];

/**
 * @param {{ actif: boolean, voulu: boolean,
 *   echo: { ip: string, pays: string|null } | null, latences?: number[],
 *   erreurVpn?: "serveur"|"identifiants"|null,
 *   ipServeur?: string|null, ipNormale?: string|null }} m  measures
 * @returns {{ global: "ok"|"incertain"|"fuite"|"echec"|"inactif",
 *   etapes: {id: string, libelle: string, statut: "ok"|"echec"|"inconnu"}[],
 *   message: string, action: "reessayer"|"identifiants"|"desactiver"|null,
 *   ip: string|null, pays: string|null, latenceMs: number|null }}
 */
export function diagnostiquer(m) {
  const statuts = Object.fromEntries(ETAPES.map(([id]) => [id, "inconnu"]));
  const fin = (global, message, action = null, extra = {}) => ({
    global,
    etapes: ETAPES.map(([id, libelle]) => ({ id, libelle, statut: statuts[id] })),
    message,
    action,
    ip: m.echo?.ip ?? null,
    pays: m.echo?.pays ?? null,
    latenceMs: extra.latenceMs ?? null,
  });

  if (!m.actif) {
    if (m.voulu)
      return fin(
        "echec",
        "Chrome n'utilise pas le serveur : une autre extension ou un réglage a pris le contrôle du proxy. Désactivez-la, ou désactivez le VPN.",
        "desactiver",
      );
    return fin("inactif", "Le VPN est désactivé : le test n'a rien à vérifier.");
  }
  if (!m.echo) {
    if (m.erreurVpn === "serveur") {
      statuts.connexion = "echec";
      return fin(
        "echec",
        "Le serveur VPN ne répond pas. Réessayez dans un instant ; s'il reste muet, désactivez le VPN.",
        "reessayer",
      );
    }
    statuts.domaine = statuts.connexion = "ok";
    if (m.erreurVpn === "identifiants") {
      statuts.auth = "echec";
      return fin("echec", "Le serveur refuse vos identifiants. Rafraîchissez-les.", "identifiants");
    }
    statuts.site = "echec";
    return fin(
      "echec",
      "Aucun site de test n'a répondu (réseau coupé ou service bloqué). Vérifiez votre connexion, puis réessayez.",
      "reessayer",
    );
  }

  statuts.domaine = statuts.connexion = statuts.auth = statuts.site = "ok";
  const latenceMs = moyenne(m.latences ?? []);
  statuts.latence = latenceMs === null ? "inconnu" : "ok";
  const contreServeur = comparerIp(m.echo.ip, m.ipServeur);
  const contreNormale = comparerIp(m.echo.ip, m.ipNormale);
  const lieu = `${m.echo.pays ?? "pays inconnu"} (${m.echo.ip})`;

  if (contreNormale === "egal") {
    // Same address as without the VPN: the traffic does not go through the server.
    statuts.ip = "echec";
    return fin(
      "fuite",
      "Attention, votre trafic ne passe pas par le VPN : les sites vous voient avec votre adresse habituelle. Une autre extension ou un réglage a peut-être pris le contrôle.",
      "desactiver",
      { latenceMs },
    );
  }
  if (contreServeur === "egal") {
    statuts.ip = "ok";
    return fin("ok", `Le VPN fonctionne : les sites vous voient depuis ${lieu}.`, null, {
      latenceMs,
    });
  }
  // The address is not the server's, nor the normal one (or one of them cannot be compared):
  // shown as uncertain rather than as a leak, the server may leave through another address.
  statuts.ip = "inconnu";
  return fin(
    "incertain",
    contreNormale === "different"
      ? `Les sites vous voient depuis ${lieu}, une adresse différente de la vôtre, mais le serveur n'a pas pu la confirmer.`
      : `Les sites vous voient depuis ${lieu}. Votre adresse habituelle est inconnue : désactivez puis réactivez le VPN pour la mesurer.`,
    null,
    { latenceMs },
  );
}

/** Colour of the indicator: green verified, orange not verified recently / uncertain, red failure. */
export function couleurEtat(derniere, maintenant) {
  if (!derniere) return "attente";
  if (derniere.global === "echec" || derniere.global === "fuite") return "echec";
  if (derniere.global === "ok" && maintenant - derniere.le <= PEREMPTION_MS) return "ok";
  return "attente";
}

/** Adds a test to the history (newest first, 10 at most). Nothing but the result is kept. */
export function ajouterHistorique(historique, entree) {
  return [entree, ...(Array.isArray(historique) ? historique : [])].slice(0, HISTORIQUE_MAX);
}
