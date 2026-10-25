import { el } from "../dom.js";

export const LARGEUR_ZONE_PX = 72;
export const DELAI_PREMIER_MS = 600;
export const DELAI_SUIVANT_MS = 900;
export const DELAI_POINT_MS = 400;

/**
 * Edge zones of the home pages during a drag (V2.11). Holding the dragged tile in the left
 * or right zone for DELAI_PREMIER_MS turns the page, then again every DELAI_SUIVANT_MS while
 * it stays. The zone shows the wait: a light that rises along the edge over the delay, and
 * a chevron. Hovering a dot of the indicator for DELAI_POINT_MS goes to that page.
 *
 * @param {HTMLElement} fenetre clipping box of the pages (the zones are placed in it)
 * @param {{ peutAller: (sens: -1|1) => boolean, aller: (sens: -1|1) => void,
 *           pageDuPoint: (x: number, y: number) => number|null, allerA: (page: number) => void }} options
 */
export function creerZonesBord(fenetre, { peutAller, aller, pageDuPoint, allerA }) {
  const zone = (sens) =>
    el(
      "div",
      { class: `zone-bord zone-bord--${sens < 0 ? "gauche" : "droite"}`, "aria-hidden": "true" },
      el("span", { class: "zone-bord-jauge" }),
      el("span", { class: "zone-bord-chevron", texte: sens < 0 ? "‹" : "›" }),
    );
  const zones = { [-1]: zone(-1), [1]: zone(1) };
  fenetre.append(zones[-1], zones[1]);

  let actif = false;
  let sensCourant = 0;
  let minuteur = null;
  let point = null; // { page, minuteur }

  const sensSous = (x, y) => {
    const r = fenetre.getBoundingClientRect();
    if (y < r.top || y > r.bottom) return 0;
    if (x <= r.left + LARGEUR_ZONE_PX) return -1;
    if (x >= r.right - LARGEUR_ZONE_PX) return 1;
    return 0;
  };

  const majDisponibles = () => {
    for (const s of [-1, 1]) zones[s].classList.toggle("zone-bord--inerte", !peutAller(s));
  };

  const quitter = () => {
    clearTimeout(minuteur);
    minuteur = null;
    if (sensCourant) zones[sensCourant].classList.remove("zone-bord--armee");
    sensCourant = 0;
  };

  const armer = (sens, delai) => {
    const z = zones[sens];
    // Restart the light: it rises over the delay before the page turns.
    z.classList.remove("zone-bord--armee");
    void z.offsetWidth;
    z.style.setProperty("--delai-zone", `${delai}ms`);
    z.classList.add("zone-bord--armee");
    minuteur = setTimeout(() => {
      if (!peutAller(sens)) return quitter();
      aller(sens);
      majDisponibles();
      if (peutAller(sens)) armer(sens, DELAI_SUIVANT_MS);
      else quitter();
    }, delai);
  };

  const oublierPoint = () => {
    clearTimeout(point?.minuteur);
    point = null;
  };

  return {
    debut() {
      actif = true;
      fenetre.classList.add("zones-bord--visibles");
      majDisponibles();
    },
    fin() {
      actif = false;
      quitter();
      oublierPoint();
      fenetre.classList.remove("zones-bord--visibles");
    },
    /** Follows the pointer during a drag. */
    suivre(x, y) {
      if (!actif) return;
      const sens = sensSous(x, y);
      if (sens !== sensCourant) {
        quitter();
        if (sens && peutAller(sens)) {
          sensCourant = sens;
          armer(sens, DELAI_PREMIER_MS);
        }
      }
      const page = pageDuPoint(x, y);
      if (page !== point?.page) {
        oublierPoint();
        if (page != null)
          point = { page, minuteur: setTimeout(() => allerA(page), DELAI_POINT_MS) };
      }
    },
    /** True in an active zone: no folder is made with a tile under it. */
    dansZone: (x, y) => actif && sensSous(x, y) !== 0,
    majDisponibles,
  };
}
