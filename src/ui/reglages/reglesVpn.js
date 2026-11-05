import { A } from "../../core/actions.js";
import { aplatir } from "../../core/arbre.js";
import {
  LISTE_MAX,
  normaliserDomaine,
  reglesVpnDe,
  validerReglesVpn,
} from "../../core/domainesVpn.js";
import { choisirSites } from "../dialogues/choisirSites.js";
import { el, remplacer } from "../dom.js";
import { icone } from "../icones.js";
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
    const mode = (valeur, libelle) =>
      el("button", {
        type: "button",
        class: "segment",
        role: "radio",
        "aria-checked": String(r.mode === valeur),
        texte: libelle,
        onclick: () => r.mode !== valeur && enregistrer({ ...r, mode: valeur }),
      });
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
    let filtre = "";
    const puces = el("ul", { class: "vpn-puces" });
    const majPuces = () => {
      const liste = r[cle].filter((d) => d.includes(filtre));
      puces.replaceChildren(
        ...liste.map((d) =>
          el(
            "li",
            { class: "vpn-puce" },
            el("span", { texte: d }),
            el("button", {
              type: "button",
              class: "vpn-puce-retrait",
              "aria-label": `Retirer ${d}`,
              title: `Retirer ${d}`,
              texte: "✕",
              onclick: () => enregistrer({ ...r, [cle]: r[cle].filter((x) => x !== d) }),
            }),
          ),
        ),
      );
    };
    // A search field only when the list is long.
    const recherche =
      r[cle].length > 10
        ? el("input", {
            type: "search",
            placeholder: "Rechercher dans la liste",
            "aria-label": "Rechercher dans la liste",
            oninput: (e) => {
              filtre = e.currentTarget.value.trim().toLowerCase();
              majPuces();
            },
          })
        : null;
    majPuces();

    remplacer(
      racine,
      el("h4", { texte: "Règles par site" }),
      el(
        "div",
        { class: "segments", role: "radiogroup", "aria-label": "Mode des règles" },
        mode("tout_sauf", "Tout par le VPN, sauf…"),
        mode("seulement", "Seulement ces sites"),
      ),
      el("p", {
        class: "reglages-note",
        texte:
          r.mode === "tout_sauf"
            ? "Ces sites passent en direct, sans le VPN. Un domaine couvre ses sous-domaines."
            : "Seuls ces sites passent par le VPN. Un domaine couvre ses sous-domaines.",
      }),
      el(
        "div",
        { class: "groupe-champ" },
        champ,
        el("button", {
          type: "button",
          class: "bouton bouton--principal",
          texte: "Ajouter",
          onclick: ajouter,
        }),
      ),
      recherche,
      r[cle].length
        ? puces
        : el("p", {
            class: "reglages-note vpn-vide",
            texte:
              r.mode === "tout_sauf"
                ? "Aucune exception : tout passe par le VPN."
                : "Liste vide : rien ne passe par le VPN.",
          }),
      blocDepuisSites(r, cle),
      suggestionDejaVue()
        ? null
        : el(
            "div",
            { class: "carte-info", role: "note" },
            icone("oeil", { taille: 18 }),
            el(
              "p",
              {},
              "Les banques et services de streaming bloquent parfois les connexions venant de serveurs : mettez-les en direct. ",
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
          ),
    );
  }

  /** "Choisir parmi mes sites": opens the picker window (search, compact list, counter). */
  function blocDepuisSites(r, cle) {
    const domaines = [
      ...new Set(
        aplatir(store.lire().grille)
          .filter(({ element }) => element.type === "site")
          .map(({ element }) => normaliserDomaine(element.url))
          .filter(Boolean),
      ),
    ].sort();
    if (!domaines.length) return null;
    const bouton = el(
      "button",
      {
        type: "button",
        class: "bouton",
        onclick: async () => {
          const choix = await choisirSites({ domaines, dejaAjoutes: r[cle], retourFocus: bouton });
          if (choix) ajouterDomaines(choix);
        },
      },
      icone("ajouter", { taille: 16 }),
      "Choisir parmi mes sites",
    );
    return bouton;
  }

  dessiner();
  return { racine, dessiner };
}
