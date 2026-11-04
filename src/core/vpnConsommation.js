/**
 * V5.9: pure helpers for the traffic screens (no DOM, no Firebase). Volumes only: nothing here
 * knows a site. Gigabytes are decimal (1 Go = 10^9 octets), like the limits.
 */

export const TEXTE_PROPRIETAIRE =
  "Vous voyez le volume consommé par chaque ami, jamais les sites visités.";
export const TEXTE_INVITE =
  "Le propriétaire du serveur voit uniquement votre volume de données mensuel.";

const NOMBRE = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 1,
  minimumFractionDigits: 0,
});

/** 12 400 000 000 → "12,4 Go" ; 3 200 000 → "3,2 Mo" ; 0 → "0 Mo". */
export function formaterOctets(octets) {
  const n = Number.isFinite(octets) && octets > 0 ? octets : 0;
  if (n >= 1e12) return `${NOMBRE.format(n / 1e12)} To`;
  if (n >= 1e9) return `${NOMBRE.format(n / 1e9)} Go`;
  return `${NOMBRE.format(n / 1e6)} Mo`;
}

const RAISONS = {
  limite: "Votre limite mensuelle est atteinte : le VPN est coupé jusqu'au 1er du mois prochain.",
  securite:
    "Le serveur a presque épuisé son trafic gratuit du mois : le VPN est suspendu jusqu'au 1er du mois prochain.",
  manuel: "Votre accès a été suspendu par le propriétaire du serveur.",
};

/** What the screen keeps of vpnMaConsommation; anything else is dropped. null when malformed. */
export function lireConsommation(d) {
  if (!d || !Number.isFinite(d.octets) || d.octets < 0) return null;
  return {
    octets: d.octets,
    limiteGo: Number.isFinite(d.limiteGo) ? d.limiteGo : null,
    pourcent: Number.isFinite(d.pourcent) ? d.pourcent : null,
    alerte: d.alerte === true,
    suspendu: typeof d.suspendu === "string" ? d.suspendu : null,
    joursRestants: Number.isInteger(d.joursRestants) ? d.joursRestants : null,
  };
}

/** "Ce mois-ci : 12,4 Go sur 50 Go" (or "sans limite"). */
export function phraseConsommation(c) {
  const vol = formaterOctets(c.octets);
  return c.limiteGo === null
    ? `Ce mois-ci : ${vol} (sans limite)`
    : `Ce mois-ci : ${vol} sur ${NOMBRE.format(c.limiteGo)} Go`;
}

/** The message to show a guest: cut, or 80 % reached, else null. */
export function messageAlerte(c) {
  if (c.suspendu) return RAISONS[c.suspendu] ?? RAISONS.manuel;
  if (c.alerte) return "Vous avez utilisé 80 % de votre limite mensuelle.";
  return null;
}

export const LIBELLES_ETAT = { actif: "Actif", coupe: "Coupé", revoque: "Retiré" };

/** "2026-11-05" → "05/11" (the day only; never a time). */
export const jourCourt = (iso) =>
  /^\d{4}-\d{2}-\d{2}$/.test(iso ?? "") ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "—";
