import {
  lireConsommation,
  messageAlerte,
  phraseConsommation,
  TEXTE_INVITE,
} from "../../core/vpnConsommation.js";
import { el, remplacer } from "../dom.js";

/**
 * Settings → VPN, for a guest (V5.9): this month's volume against the limit, the message when it
 * is reached or cut. Volumes only; the guest is told what the owner can see.
 *
 * @param {{ service: { consommation: () => Promise<any> } }} p
 */
export function blocConsommation({ service }) {
  const racine = el("div", { class: "vpn-consommation" });
  racine.append(el("p", { class: "reglages-note", texte: "Chargement de la consommation…" }));

  (async () => {
    const r = await service.consommation?.().catch(() => null);
    const c = r?.ok ? lireConsommation(r.valeur) : null;
    if (!c) return racine.replaceChildren();
    const alerte = messageAlerte(c);
    remplacer(
      racine,
      el("h4", { texte: "Ma consommation" }),
      el("p", { class: "vpn-conso-phrase", texte: phraseConsommation(c) }),
      c.pourcent === null
        ? null
        : el("progress", {
            class: "vpn-barre",
            max: "100",
            value: String(c.pourcent),
            "aria-label": "Part de la limite mensuelle utilisée",
          }),
      c.joursRestants === null
        ? null
        : el("p", {
            class: "reglages-note",
            texte: `${c.joursRestants} jour${c.joursRestants > 1 ? "s" : ""} avant la remise à zéro.`,
          }),
      alerte ? el("p", { class: "vpn-nav-alerte", role: "alert", texte: alerte }) : null,
      el("p", { class: "reglages-note", texte: TEXTE_INVITE }),
    );
  })();

  return { racine };
}
