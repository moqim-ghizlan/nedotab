import { indexer, rechercher } from "../core/recherche.js";
import { normaliserUrl } from "../core/url.js";
import { plateforme } from "../platform/index.js";
import { el } from "./dom.js";
import { creerIcone, sitesDansNouvelOnglet } from "./tuile.js";
import { creerIconeDossier } from "./tuileDossier.js";

const CHAMPS_SAISIE = "input, textarea, select, [contenteditable]";

/** Title with <mark> around the matched ranges, built from text nodes only. */
function titreSurligne(titre, plages) {
  const span = el("span", { class: "resultat-titre" });
  let pos = 0;
  for (const [debut, fin] of plages) {
    if (debut > pos) span.append(document.createTextNode(titre.slice(pos, debut)));
    span.append(el("mark", { texte: titre.slice(debut, fin) }));
    pos = fin;
  }
  if (pos < titre.length) span.append(document.createTextNode(titre.slice(pos)));
  return span;
}

/** Text typed that looks like an address ("exemple.com/page"), or null. */
function adresseTapee(texte) {
  const t = texte.trim();
  if (!t || /\s/.test(t) || !t.includes(".")) return null;
  const r = normaliserUrl(t);
  return r.ok ? r.url : null;
}

/**
 * Search bar above the grid (combobox + listbox). Instant, no network: the web search only
 * happens on Enter when nothing local fits, with the user's default engine.
 */
export function creerRecherche(store, { ouvrirDossier }) {
  const champ = el("input", {
    type: "search",
    class: "recherche-champ",
    id: "recherche",
    placeholder: "Rechercher dans vos sites… (/)",
    autocomplete: "off",
    spellcheck: "false",
    role: "combobox",
    "aria-expanded": "false",
    "aria-controls": "recherche-resultats",
    "aria-autocomplete": "list",
    "aria-label": "Rechercher dans vos sites",
  });
  const liste = el("ul", {
    class: "recherche-resultats",
    id: "recherche-resultats",
    role: "listbox",
    "aria-label": "Résultats",
    hidden: true,
  });
  const etat = el("p", { class: "visuellement-cache", "aria-live": "polite" });
  const racine = el(
    "div",
    { class: "recherche", role: "search" },
    el("span", { class: "recherche-loupe", "aria-hidden": "true" }),
    champ,
    liste,
    etat,
  );

  let options = []; // { type: "site" | "dossier" | "adresse" | "web", ... }
  let actif = 0;
  let composition = false;

  const choisirActif = (i) => {
    if (options.length === 0) return;
    actif = (i + options.length) % options.length;
    for (const [j, li] of [...liste.children].entries()) {
      li.setAttribute("aria-selected", String(j === actif));
      if (j === actif) li.scrollIntoView({ block: "nearest" });
    }
    champ.setAttribute("aria-activedescendant", `resultat-${actif}`);
  };

  const fermerListe = () => {
    liste.hidden = true;
    champ.setAttribute("aria-expanded", "false");
    champ.removeAttribute("aria-activedescendant");
  };

  const rendre = () => {
    const texte = champ.value;
    if (!texte.trim()) {
      options = [];
      liste.replaceChildren();
      fermerListe();
      return;
    }
    const resultats = rechercher(indexer(store.lire().grille), texte);
    options = [];
    const adresse = adresseTapee(texte);
    if (adresse) options.push({ type: "adresse", url: adresse });
    for (const r of resultats) options.push({ type: r.entree.type, resultat: r });
    options.push({ type: "web", texte: texte.trim() });

    liste.replaceChildren(
      ...options.map((o, i) => {
        let contenu;
        if (o.type === "adresse") {
          contenu = [
            el("span", { class: "resultat-icone resultat-icone--symbole", texte: "↗" }),
            el("span", {
              class: "resultat-titre",
              texte: `Aller sur ${o.url.replace(/^https?:\/\//, "")}`,
            }),
          ];
        } else if (o.type === "web") {
          contenu = [
            el("span", { class: "resultat-icone resultat-icone--symbole", texte: "⌕" }),
            el("span", { class: "resultat-titre", texte: `Rechercher « ${o.texte} » sur le web` }),
          ];
        } else {
          const { entree, plages } = o.resultat;
          contenu = [
            el(
              "span",
              { class: "resultat-icone" },
              entree.type === "dossier"
                ? creerIconeDossier(entree.element)
                : creerIcone(entree.element),
            ),
            titreSurligne(entree.titre, plages),
            entree.domaine
              ? el("span", { class: "resultat-domaine", texte: entree.domaine })
              : null,
            entree.chemin.length
              ? el("span", { class: "resultat-chemin", texte: entree.cheminTexte })
              : null,
          ];
        }
        const li = el(
          "li",
          {
            id: `resultat-${i}`,
            class: `resultat resultat--${o.type}`,
            role: "option",
            "aria-selected": "false",
          },
          ...contenu,
        );
        li.addEventListener("mousedown", (e) => e.preventDefault()); // keep the focus in the field
        li.addEventListener("click", (e) => valider(i, { nouvelOnglet: e.ctrlKey || e.metaKey }));
        li.addEventListener("auxclick", (e) => {
          if (e.button === 1) valider(i, { nouvelOnglet: true });
        });
        return li;
      }),
    );
    liste.hidden = false;
    champ.setAttribute("aria-expanded", "true");
    // The first result is preselected (the address proposal comes first when typed).
    choisirActif(0);
    const n = options.filter((o) => o.resultat).length;
    etat.textContent = n
      ? `${n} résultat${n > 1 ? "s" : ""}`
      : "Aucun site trouvé, Entrée pour chercher sur le web";
  };

  const ouvrirUrl = (url, nouvelOnglet) => {
    if (nouvelOnglet) window.open(url, "_blank", "noopener");
    else location.assign(url);
  };

  /** Web search: a new tab when asked (Ctrl, middle click) or chosen in the settings. */
  const chercherSurLeWeb = (texte, nouvelOnglet) =>
    plateforme.rechercherSurLeWeb(texte, {
      nouvelOnglet: nouvelOnglet || !!store.lire().reglages.rechercheNouvelOnglet,
    });

  function valider(i, { nouvelOnglet = false } = {}) {
    const o = options[i];
    if (!o) {
      if (champ.value.trim()) chercherSurLeWeb(champ.value.trim(), nouvelOnglet);
      return;
    }
    if (o.type === "adresse") ouvrirUrl(o.url, nouvelOnglet);
    else if (o.type === "web") chercherSurLeWeb(o.texte, nouvelOnglet);
    else if (o.type === "site")
      ouvrirUrl(o.resultat.entree.element.url, nouvelOnglet || sitesDansNouvelOnglet());
    else if (o.type === "dossier") {
      fermerListe();
      ouvrirDossier(o.resultat.entree.id);
    }
  }

  champ.addEventListener("input", rendre);
  champ.addEventListener("focus", () => champ.value.trim() && rendre());
  champ.addEventListener("compositionstart", () => (composition = true));
  champ.addEventListener("compositionend", () => (composition = false));
  champ.addEventListener("keydown", (e) => {
    if (composition || e.isComposing) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (liste.hidden) rendre();
      else choisirActif(actif + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      choisirActif(actif - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      valider(liste.hidden ? -1 : actif, { nouvelOnglet: e.ctrlKey || e.metaKey });
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (champ.value) {
        champ.value = "";
        rendre();
      } else {
        fermerListe();
        champ.blur();
      }
    }
  });
  // Click outside closes the list without clearing the field.
  document.addEventListener("pointerdown", (e) => {
    if (!racine.contains(e.target)) fermerListe();
  });
  // Results follow the grid while the list is open (other tab, edit…).
  store.abonner(() => {
    if (!liste.hidden) rendre();
  });

  /** "/" or Ctrl/Cmd+K anywhere (not while typing in a field) puts the focus in the search. */
  document.addEventListener("keydown", (e) => {
    const raccourci =
      (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey) ||
      (e.key.toLowerCase() === "k" && (e.ctrlKey || e.metaKey) && !e.altKey);
    if (
      !raccourci ||
      e.target.closest?.(CHAMPS_SAISIE) ||
      document.querySelector("dialog[open]:modal")
    )
      return;
    e.preventDefault();
    champ.focus();
    champ.select();
  });

  return { racine, champ };
}
