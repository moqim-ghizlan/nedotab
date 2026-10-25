import { doitAfficherBandeau, navigateurIos } from "../core/installation.js";
import { plateforme } from "../platform/index.js";
import { el } from "./dom.js";
import { icone } from "./icones.js";

const CLE_FERME = "bandeauInstallationFerme";

/** The iOS "Share" symbol (a square with an arrow going up), drawn here: no image file. */
function iconePartage() {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  for (const [k, v] of Object.entries({
    viewBox: "0 0 24 24",
    width: "18",
    height: "18",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "1.8",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
    class: "bandeau-installation-partage",
  }))
    svg.setAttribute(k, v);
  for (const d of [
    "M12 15V3",
    "M8 7l4-4 4 4",
    "M8 10H6a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1h-2",
  ]) {
    const p = document.createElementNS(ns, "path");
    p.setAttribute("d", d);
    svg.append(p);
  }
  return svg;
}

/**
 * Small banner at the bottom of the page in Safari on iPhone and iPad (V3.1): how to add the
 * app to the home screen. Never on a computer nor in the installed app; once closed, it
 * stays closed on this device.
 */
export async function monterBandeauInstallation() {
  if (!plateforme.capacites.installable) return null;
  const { ios, safari } = navigateurIos(globalThis.navigator);
  const ferme = !!(await plateforme.preferences.lire(CLE_FERME).catch(() => false));
  if (!doitAfficherBandeau({ ios, safari, installee: plateforme.estInstallee(), ferme }))
    return null;

  const bandeau = el(
    "aside",
    { class: "bandeau-installation", "aria-label": "Installer NedoTab" },
    el("img", { class: "bandeau-installation-icone", src: "/icons/apple-touch-icon.png", alt: "" }),
    el(
      "p",
      {},
      el("strong", { texte: "Ajoutez NedoTab à votre écran d'accueil" }),
      el("span", {}, "Touchez ", iconePartage(), " Partager, puis « Sur l'écran d'accueil »."),
    ),
    el(
      "button",
      {
        type: "button",
        class: "bandeau-installation-fermer",
        "aria-label": "Fermer",
        onclick: () => {
          plateforme.preferences.ecrire(CLE_FERME, true).catch(() => {});
          bandeau.classList.add("bandeau-installation--sortie");
          setTimeout(() => bandeau.remove(), 200);
        },
      },
      icone("fermer", { taille: 16 }),
    ),
  );
  document.body.append(bandeau);
  return bandeau;
}
