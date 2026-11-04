/** V5.5: what the VPN does and does not do, told plainly (shown in Settings → VPN). */

export const VPN_FAIT = [
  "Les sites voient l'adresse du serveur et son pays, pas la vôtre.",
  "Votre fournisseur d'accès ne voit plus les sites visités dans Chrome : il voit seulement une connexion vers le serveur.",
];

export const VPN_NE_FAIT_PAS = [
  "Il ne rend pas anonyme : vos comptes connectés (Google, réseaux sociaux…) vous identifient toujours.",
  "Le fuseau horaire, la langue et d'autres caractéristiques de votre navigateur restent visibles des sites.",
  "Si vous autorisez la géolocalisation d'un site, il peut connaître votre position réelle.",
  "Il ne concerne que Chrome (WireGuard couvrira le reste de l'ordinateur).",
  "Il ne rend pas légal ce qui ne l'est pas.",
];

export const NOTE_WEBRTC =
  "Quand le VPN est actif, WebRTC n'a plus le droit d'utiliser de connexion directe : certaines visioconférences peuvent être moins fluides, ou ne pas fonctionner.";
