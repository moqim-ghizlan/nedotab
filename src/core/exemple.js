import { creerSite } from "./modele.js";

const SITES = [
  ["Wikipédia", "https://fr.wikipedia.org"],
  ["Gmail", "https://mail.google.com"],
  ["OpenStreetMap", "https://www.openstreetmap.org"],
  ["Le Monde", "https://www.lemonde.fr"],
  ["GitHub", "https://github.com"],
  ["YouTube", "https://www.youtube.com"],
  ["MDN", "https://developer.mozilla.org"],
  ["Météo-France", "https://meteofrance.com"],
];

/** Example data, used by the tests (and V1.1 only on screen). */
export function exemple() {
  return SITES.map(([titre, url], i) =>
    creerSite({ titre, url, id: `exemple-${i + 1}`, creeLe: 0 }),
  );
}
