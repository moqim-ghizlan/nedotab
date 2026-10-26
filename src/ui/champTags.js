import {
  decouperTags,
  normaliserTag,
  normaliserTags,
  TAG_LONGUEUR_MAX,
  TAGS_MAX,
} from "../core/tags.js";
import { el } from "./dom.js";

let compteur = 0;

/**
 * Tags field (V4.2): the tags are chips; Enter, comma or semicolon validates the one being
 * typed, × removes one, Backspace in the empty field removes the last one. A pasted list is
 * split into tags. The tags already used elsewhere in the grid are offered while typing.
 *
 * @param {{ tags?: string[], suggestions?: () => string[], onChange?: () => void,
 *           libelle?: string }} options
 * @returns {{ racine: HTMLElement, lire: () => string[], definir: (tags: string[]) => void,
 *            champ: HTMLInputElement }}
 */
export function creerChampTags({
  tags = [],
  suggestions = () => [],
  onChange = () => {},
  libelle = "Tags",
} = {}) {
  const id = `champ-tags-${++compteur}`;
  let liste = normaliserTags(tags);
  const puces = el("ul", { class: "tags-puces", "aria-label": `${libelle} choisis` });
  const champ = el("input", {
    id,
    type: "text",
    class: "tags-saisie",
    list: `${id}-suggestions`,
    placeholder: "Ajouter un tag",
    maxlength: String(TAG_LONGUEUR_MAX + 20),
    autocomplete: "off",
    autocapitalize: "off",
    autocorrect: "off",
    spellcheck: "false",
    enterkeyhint: "done",
    "aria-describedby": `${id}-aide`,
  });
  const suggestionsListe = el("datalist", { id: `${id}-suggestions` });
  const aide = el("p", { id: `${id}-aide`, class: "tags-aide" });
  const racine = el(
    "div",
    { class: "tags" },
    el("div", { class: "tags-zone" }, puces, champ, suggestionsListe),
    aide,
  );

  function rendre() {
    puces.replaceChildren(
      ...liste.map((tag) =>
        el(
          "li",
          { class: "tag-puce" },
          el("span", { texte: tag }),
          el("button", {
            type: "button",
            class: "tag-retirer",
            "aria-label": `Retirer le tag ${tag}`,
            texte: "×",
            onclick: () => {
              retirer(tag);
              champ.focus();
            },
          }),
        ),
      ),
    );
    const complet = liste.length >= TAGS_MAX;
    champ.hidden = complet;
    aide.textContent = complet
      ? `${TAGS_MAX} tags : c'est le maximum.`
      : `${liste.length} / ${TAGS_MAX} · Entrée ou virgule pour valider`;
    const deja = new Set(liste);
    suggestionsListe.replaceChildren(
      ...suggestions()
        .filter((t) => !deja.has(t))
        .slice(0, 30)
        .map((t) => el("option", { value: t })),
    );
  }

  function ajouter(brut) {
    const tags = normaliserTags([...liste, ...decouperTags(brut)]);
    if (tags.length === liste.length) return false;
    liste = tags;
    rendre();
    onChange();
    return true;
  }

  function retirer(tag) {
    liste = liste.filter((t) => t !== tag);
    rendre();
    onChange();
  }

  /** What is typed becomes a tag (or is dropped when nothing is left of it). */
  function valider() {
    const texte = champ.value;
    champ.value = "";
    if (normaliserTag(texte) == null) return;
    ajouter(texte);
  }

  champ.addEventListener("keydown", (e) => {
    if (e.isComposing) return;
    if (e.key === "Enter" || e.key === "," || e.key === ";") {
      // Enter must not submit the form while a tag is being typed.
      if (e.key === "Enter" && champ.value.trim() === "") return;
      e.preventDefault();
      valider();
    } else if (e.key === "Backspace" && champ.value === "" && liste.length) {
      e.preventDefault();
      retirer(liste.at(-1));
    }
  });
  // A pasted list ("a, b, c"), or a suggestion chosen in the list, is split at once.
  champ.addEventListener("input", () => {
    if (/[,;\n]/.test(champ.value)) valider();
  });
  champ.addEventListener("change", () => {
    if (suggestions().includes(champ.value.trim().toLowerCase())) valider();
  });
  champ.addEventListener("blur", valider);

  rendre();
  return {
    racine,
    champ,
    lire: () => [...liste],
    definir(nouveaux) {
      liste = normaliserTags(nouveaux);
      rendre();
    },
  };
}
