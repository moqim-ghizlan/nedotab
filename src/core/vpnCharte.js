/**
 * V5.10: the charter every guest accepts once, before the first activation. DRAFT to be read and
 * validated by the owner before publication (docs/plan/v5/v5.10.md). Raising CHARTE_VERSION
 * (here AND in functions/src/vpn/fonctions.js) asks everybody to accept again.
 */
export const CHARTE_VERSION = 1;
export const CODE_CHARTE = "CHARTE_REQUISE";

export const CHARTE_TITRE = "Charte d'utilisation du VPN";
export const CHARTE_POINTS = [
  "Ce VPN est un service privé, offert par le propriétaire du serveur, sans aucune garantie : il peut s'arrêter ou changer à tout moment.",
  "L'adresse du serveur est au nom du propriétaire. Toute activité illégale est interdite, et vous en restez responsable.",
  "Le propriétaire voit uniquement le volume de données que vous consommez par mois, jamais les sites que vous visitez.",
  "Votre accès peut être retiré à tout moment, sans préavis.",
  "Ne partagez ni vos identifiants, ni votre QR code, ni votre fichier de configuration : ils sont personnels.",
  "Le VPN change l'adresse vue par les sites, il ne vous rend pas anonyme.",
];
export const CHARTE_REFUSEE =
  "Vous devez accepter la charte pour utiliser le VPN. Réessayez quand vous voulez.";

/** Does this failed call mean "accept the charter first"? */
export const exigeCharte = (r) =>
  !r?.ok && r?.code === "functions/failed-precondition" && r?.message === CODE_CHARTE;
