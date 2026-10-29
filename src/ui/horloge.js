import { affichageHeureDe } from "../core/reglages.js";
import { el } from "./dom.js";

/**
 * Time and date above the search bar (V4.5.9), shown only when the device setting asks for it.
 * It redraws once a minute, and only while it is shown.
 */
export function creerHorloge(store) {
  const heure = el("span", { class: "horloge-heure" });
  const date = el("span", { class: "horloge-date" });
  const racine = el("div", { class: "horloge", "aria-hidden": "true" }, heure, date);
  let minuteur = null;
  const mode = () => affichageHeureDe(store.lire().reglagesAppareil);

  const dessiner = () => {
    clearTimeout(minuteur);
    const m = mode();
    racine.hidden = m === "aucun";
    if (m === "aucun") return;
    const maintenant = new Date();
    heure.textContent = maintenant.toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: m === "12h",
    });
    date.textContent = maintenant.toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    const reste = 60000 - (maintenant.getSeconds() * 1000 + maintenant.getMilliseconds());
    minuteur = setTimeout(dessiner, reste + 50);
  };

  let precedent = mode();
  store.abonner(() => {
    const m = mode();
    if (m === precedent) return;
    precedent = m;
    dessiner();
  });
  dessiner();
  return { racine };
}
