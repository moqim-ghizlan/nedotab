import { CHARTE_POINTS, CHARTE_TITRE } from "../../core/vpnCharte.js";
import { demander } from "../dialogues/commun.js";
import { el } from "../dom.js";

/** Shows the charter; resolves true only if the guest accepts it. */
export function demanderCharte() {
  return demander({
    titre: CHARTE_TITRE,
    message: "Lisez ces règles avant d'utiliser le VPN pour la première fois.",
    contenu: [
      el(
        "ul",
        { class: "vpn-charte" },
        CHARTE_POINTS.map((p) => el("li", { texte: p })),
      ),
    ],
    boutons: [
      { libelle: "Refuser", valeur: false },
      { libelle: "J'ai lu et j'accepte", valeur: true, principal: true },
    ],
  });
}
