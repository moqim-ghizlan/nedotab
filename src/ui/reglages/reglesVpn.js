import { A } from "../../core/actions.js";
import { aplatir } from "../../core/arbre.js";
import {
  LISTE_MAX,
  normaliserDomaine,
  reglesVpnDe,
  validerReglesVpn,
} from "../../core/domainesVpn.js";
import { el, remplacer } from "../dom.js";
import { toast } from "../toast.js";

const CLE_SUGGESTION = "nedotab:vpn:suggestion-vue";

function suggestionDejaVue() {
  try {
    return globalThis.localStorage?.getItem(CLE_SUGGESTION) === "1";
  } catch {
    return true; // storage unavailable: never nag
  }
}
function marquerSuggestionVue() {
  try {
    globalThis.localStorage?.setItem(CLE_SUGGESTION, "1");
  } catch {
    /* nothing kept */
  }
}

/**
 * Settings → VPN → "Règles par site" (V5.6). The rules are a synced setting (reglages.vpn); the
 * proxy is updated by suivreReglesVpn (app.js) when the state changes.
 *
 * @param {{ store: import("../../core/store.js").Store }} p
 */
export function blocReglesVpn({ store }) {
  const racine = el("div", { class: "vpn-regles" });

  const regles = () => reglesVpnDe(store.lire().reglages);
  const enregistrer = (suivantes) => {
    store.envoyer({ type: A.REGLAGES_MODIFIER, changements: { vpn: validerReglesVpn(suivantes) } });
    dessiner();
  };

  function ajouterDomaines(entrees) {
    const r = regles();
    const cle = r.mode === "tout_sauf" ? "exceptions" : "liste";
    const valides = entrees.map(normaliserDomaine).filter(Boolean);
    const nouveaux = valides.filter((d) => !r[cle].includes(d));
    if (!valides.length)
      return toast("Domaine invalide (exemple : exemple.com).", { type: "erreur" });
    if (r[cle].length + nouveaux.length > LISTE_MAX)
      return toast(`${LISTE_MAX} sites au plus dans une liste.`, { type: "erreur" });
    if (nouveaux.length) enregistrer({ ...r, [cle]: [...r[cle], ...nouveaux] });
  }

  function dessiner() {
    const r = regles();
    const cle = r.mode === "tout_sauf" ? "exceptions" : "liste";
    const nom = `vpn-mode-${Math.random().toString(36).slice(2, 6)}`;
    const mode = (valeur, libelle) => {
      const radio = el("input", { type: "radio", name: nom, value: valeur });
      radio.checked = r.mode === valeur;
      radio.addEventListener("change", () => enregistrer({ ...r, mode: valeur }));
      return el("label", { class: "vpn-nav-option" }, radio, ` ${libelle}`);
    };
    const champ = el("input", {
      type: "text",
      autocomplete: "off",
      spellcheck: "false",
      maxlength: "253",
      placeholder: "exemple.com",
      "aria-label": "Domaine à ajouter",
    });
    const ajouter = () => {
      ajouterDomaines([champ.value]);
    };
    champ.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        ajouter();
      }
    });

    remplacer(
      racine,
      el("h4", { texte: "Règles par site" }),
      el(
        "div",
        { class: "vpn-regles-modes", role: "radiogroup", "aria-label": "Mode" },
        mode("tout_sauf", "Tout par le VPN, sauf ces sites (en direct)"),
        mode("seulement", "Seulement ces sites par le VPN"),
      ),
      el("p", {
        class: "reglages-note",
        texte:
          "Un domaine couvre ses sous-domaines : exemple.com inclut www.exemple.com et mail.exemple.com.",
      }),
      el(
        "div",
        { class: "vpn-inviter" },
        champ,
        el("button", {
          type: "button",
          class: "bouton bouton--principal",
          texte: "Ajouter",
          onclick: ajouter,
        }),
      ),
      r[cle].length
        ? el(
            "ul",
            { class: "vpn-liste" },
            r[cle].map((d) =>
              el(
                "li",
                { class: "vpn-invite" },
                el("strong", { texte: d }),
                el("button", {
                  type: "button",
                  class: "bouton",
                  texte: "Retirer",
                  "aria-label": `Retirer ${d}`,
                  onclick: () => enregistrer({ ...r, [cle]: r[cle].filter((x) => x !== d) }),
                }),
              ),
            ),
          )
        : el("p", {
            class: "reglages-note",
            texte:
              r.mode === "tout_sauf"
                ? "Aucune exception : tout passe par le VPN."
                : "Liste vide : rien ne passe par le VPN.",
          }),
      blocDepuisSites(r, cle),
      suggestionDejaVue()
        ? null
        : el(
            "p",
            { class: "reglages-note", role: "note" },
            "Les banques et services de streaming bloquent parfois les connexions venant de serveurs. Vous pouvez les mettre en direct. ",
            el("button", {
              type: "button",
              class: "lien-discret",
              texte: "Compris",
              onclick: () => {
                marquerSuggestionVue();
                dessiner();
              },
            }),
          ),
    );
  }

  /** "Ajouter depuis mes sites": the domains of the grid, to tick. */
  function blocDepuisSites(r, cle) {
    const domaines = [
      ...new Set(
        aplatir(store.lire().grille)
          .filter(({ element }) => element.type === "site")
          .map(({ element }) => normaliserDomaine(element.url))
          .filter(Boolean),
      ),
    ]
      .filter((d) => !r[cle].includes(d))
      .sort();
    if (!domaines.length) return null;
    const coches = new Set();
    const bouton = el("button", {
      type: "button",
      class: "bouton",
      texte: "Ajouter la sélection",
      disabled: true,
      onclick: () => ajouterDomaines([...coches]),
    });
    return el(
      "details",
      { class: "vpn-depuis-sites" },
      el("summary", { texte: "Ajouter depuis mes sites" }),
      el(
        "ul",
        { class: "vpn-liste" },
        domaines.map((d) => {
          const c = el("input", { type: "checkbox", "aria-label": d });
          c.addEventListener("change", () => {
            if (c.checked) coches.add(d);
            else coches.delete(d);
            bouton.disabled = coches.size === 0;
          });
          return el("li", { class: "vpn-invite" }, el("label", {}, c, ` ${d}`));
        }),
      ),
      bouton,
    );
  }

  dessiner();
  return { racine, dessiner };
}
