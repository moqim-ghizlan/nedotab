/**
 * Keyboard shortcuts of NedoTab (V3.9), listed once: the help window ("?") reads this table.
 * The handlers live next to what they act on (search, grid, tiles, windows); `touche` is
 * written for people, with "Cmd" standing for Ctrl on a computer without a Mac keyboard.
 */
export const RACCOURCIS = [
  { groupe: "Recherche", touche: "/", action: "Chercher dans mes sites" },
  { groupe: "Recherche", touche: "Cmd + K", action: "Chercher dans mes sites" },
  { groupe: "Recherche", touche: "Entrée", action: "Ouvrir le résultat choisi" },
  { groupe: "Recherche", touche: "Cmd + Entrée", action: "Ouvrir dans un nouvel onglet" },
  { groupe: "Grille", touche: "← → ↑ ↓", action: "Aller d'une icône à l'autre" },
  { groupe: "Grille", touche: "Entrée", action: "Ouvrir le site ou le dossier" },
  { groupe: "Grille", touche: "Alt + flèches", action: "Déplacer l'icône" },
  { groupe: "Grille", touche: "Cmd + Maj + ↑", action: "Sortir l'icône du dossier" },
  { groupe: "Icône", touche: "F2  ou  E", action: "Modifier" },
  { groupe: "Icône", touche: "Suppr  ou  ⌫", action: "Supprimer (avec « Annuler »)" },
  { groupe: "Icône", touche: "Maj + F10  ou  Menu", action: "Ouvrir le menu de l'icône" },
  { groupe: "Fenêtres", touche: "Échap", action: "Fermer, ou remonter d'un niveau" },
  { groupe: "Fenêtres", touche: "Cmd + ,", action: "Ouvrir les réglages" },
  { groupe: "Aide", touche: "?", action: "Afficher cette aide" },
];

/** The shortcuts grouped for display: [[groupe, [{ touche, action }, …]], …] in table order. */
export function raccourcisParGroupe(table = RACCOURCIS) {
  const groupes = new Map();
  for (const { groupe, touche, action } of table) {
    if (!groupes.has(groupe)) groupes.set(groupe, []);
    groupes.get(groupe).push({ touche, action });
  }
  return [...groupes];
}
