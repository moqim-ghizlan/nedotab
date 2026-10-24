import { A } from "../../core/actions.js";
import { creerSite } from "../../core/modele.js";
import { cleUrl, domaine, normaliserUrl } from "../../core/url.js";
import { el } from "../dom.js";

function urlsDe(elements, acc = new Set()) {
  for (const e of elements) {
    if (e.type === "site") acc.add(cleUrl(e.url));
    else if (e.items) urlsDe(e.items, acc);
  }
  return acc;
}

/** "Ajouter un site" dialog (native <dialog>, focus and Escape handled by the browser). */
export function ouvrirAjoutSite(store, { apresAjout } = {}) {
  const champUrl = el("input", {
    id: "ajout-url",
    name: "url",
    type: "url",
    inputmode: "url",
    autocomplete: "off",
    spellcheck: "false",
    placeholder: "exemple.com",
    "aria-describedby": "ajout-url-erreur",
    required: true,
  });
  const erreurUrl = el("p", { id: "ajout-url-erreur", class: "champ-erreur" });
  const champTitre = el("input", {
    id: "ajout-titre",
    name: "titre",
    type: "text",
    autocomplete: "off",
    maxlength: "60",
  });
  const avertissement = el("p", { class: "champ-avertissement", hidden: true });
  const boutonAjouter = el("button", {
    type: "submit",
    class: "bouton bouton--principal",
    texte: "Ajouter",
  });
  const dialogue = el(
    "dialog",
    { class: "dialogue", "aria-labelledby": "ajout-titre-dialogue" },
    el(
      "form",
      { method: "dialog", novalidate: true, class: "formulaire" },
      el("h2", { id: "ajout-titre-dialogue", class: "dialogue-titre", texte: "Ajouter un site" }),
      el(
        "div",
        { class: "champ" },
        el("label", { for: "ajout-url", texte: "Adresse" }),
        champUrl,
        erreurUrl,
      ),
      el(
        "div",
        { class: "champ" },
        el("label", { for: "ajout-titre", texte: "Nom (facultatif)" }),
        champTitre,
      ),
      avertissement,
      el(
        "div",
        { class: "dialogue-actions" },
        el("button", {
          type: "button",
          class: "bouton",
          texte: "Annuler",
          onclick: () => dialogue.close(),
        }),
        boutonAjouter,
      ),
    ),
  );

  let doublonAccepte = null;
  const majApercu = () => {
    const r = normaliserUrl(champUrl.value);
    champTitre.placeholder = r.ok ? domaine(r.url) : "";
    erreurUrl.textContent = "";
    champUrl.removeAttribute("aria-invalid");
    if (doublonAccepte !== cleUrl(r.url)) {
      avertissement.hidden = true;
      boutonAjouter.textContent = "Ajouter";
    }
  };
  champUrl.addEventListener("input", majApercu);

  dialogue.querySelector("form").addEventListener("submit", (e) => {
    e.preventDefault();
    const r = normaliserUrl(champUrl.value);
    if (!r.ok) {
      erreurUrl.textContent = r.erreur;
      champUrl.setAttribute("aria-invalid", "true");
      champUrl.focus();
      return;
    }
    const cle = cleUrl(r.url);
    if (urlsDe(store.lire().grille).has(cle) && doublonAccepte !== cle) {
      doublonAccepte = cle;
      avertissement.textContent = "Ce site est déjà dans votre grille. Ajouter quand même ?";
      avertissement.hidden = false;
      boutonAjouter.textContent = "Ajouter quand même";
      boutonAjouter.focus();
      return;
    }
    const site = creerSite({ titre: champTitre.value.trim() || domaine(r.url), url: r.url });
    store.envoyer({ type: A.SITE_AJOUTER, site, parentId: null });
    dialogue.close();
    apresAjout?.(site);
  });
  dialogue.addEventListener("close", () => dialogue.remove());
  document.body.append(dialogue);
  dialogue.showModal();
  champUrl.focus();
  return dialogue;
}
