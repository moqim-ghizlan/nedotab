import { A } from "../../core/actions.js";
import { couleurDepuisTexte } from "../../core/couleurs.js";
import { creerSite } from "../../core/modele.js";
import { estimerTaille, niveauTaille } from "../../core/taille.js";
import { cleUrl, domaine, normaliserUrl } from "../../core/url.js";
import { plateforme } from "../../platform/index.js";
import { el } from "../dom.js";
import { creerEditeurIcone } from "./editerIcone.js";
import { trouverIconeEtTitre } from "../services/icones.js";
import { creerIcone } from "../tuile.js";

function urlsDe(elements, acc = new Set()) {
  for (const e of elements) {
    if (e.type === "site") acc.add(cleUrl(e.url));
    else if (e.items) urlsDe(e.items, acc);
  }
  return acc;
}

/**
 * Explains and asks for the optional "read sites" permission. chrome.permissions.request is
 * called directly in the click handler (no await before it), otherwise Chrome refuses.
 */
function blocPermission({ onAccordee }) {
  const bloc = el(
    "div",
    { class: "permission", hidden: true },
    el("p", {
      texte: "Autoriser l'accès aux sites pour récupérer automatiquement leur nom et leur icône ?",
    }),
  );
  const boutons = el(
    "div",
    { class: "permission-actions" },
    el("button", {
      type: "button",
      class: "bouton",
      texte: "Plus tard",
      onclick: () => {
        bloc.hidden = true;
        plateforme.preferences.ecrire("permissionSitesPlusTard", true);
        lien.hidden = false;
      },
    }),
    el("button", {
      type: "button",
      class: "bouton bouton--principal",
      texte: "Autoriser",
      onclick: () => {
        plateforme.permissionsSites.demander().then((ok) => {
          bloc.hidden = true;
          lien.hidden = ok;
          if (ok) onAccordee();
        });
      },
    }),
  );
  bloc.append(boutons);
  const lien = el("button", {
    type: "button",
    class: "lien-discret",
    hidden: true,
    texte: "Autoriser l'accès aux sites pour de meilleures icônes",
    onclick: () => {
      plateforme.permissionsSites.demander().then((ok) => {
        lien.hidden = ok;
        if (ok) onAccordee();
      });
    },
  });
  (async () => {
    if (!plateforme.permissionsSites.disponible) return;
    if (await plateforme.permissionsSites.contient().catch(() => true)) return;
    const plusTard = await plateforme.preferences.lire("permissionSitesPlusTard");
    if (plusTard) lien.hidden = false;
    else bloc.hidden = false;
  })();
  return [bloc, lien];
}

/** "Ajouter un site" dialog (native <dialog>, focus and Escape handled by the browser). */
export function ouvrirAjoutSite(store, { apresAjout, parentId = null } = {}) {
  const champUrl = el("input", {
    id: "ajout-url",
    name: "url",
    type: "url",
    inputmode: "url",
    autocapitalize: "off", // iOS keyboard (V3.4): no capital, no correction of addresses
    autocorrect: "off",
    enterkeyhint: "done",
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
  const apercu = el("div", { class: "apercu", "aria-hidden": "true" });
  const avertissement = el("p", { class: "champ-avertissement", hidden: true });
  const boutonAjouter = el("button", {
    type: "submit",
    class: "bouton bouton--principal",
    texte: "Ajouter",
  });

  // --- automatic title and icon -------------------------------------------------------
  let titreModifie = false;
  let recherche = null; // { url, controleur, promesse }
  const lettre = (url) => ({ type: "lettre", couleur: couleurDepuisTexte(url) });
  const montrerApercu = (url, icone, enCours) => {
    apercu.replaceChildren(
      creerIcone({ titre: champTitre.value || domaine(url), url, icone }),
      ...(enCours ? [el("span", { class: "apercu-attente" })] : []),
    );
    apercu.classList.toggle("apercu--vide", !url);
  };
  const lancerRecherche = () => {
    const r = normaliserUrl(champUrl.value);
    if (!r.ok) return;
    if (recherche?.url === r.url) return;
    recherche?.controleur.abort();
    const controleur = new AbortController();
    montrerApercu(r.url, lettre(r.url), true);
    const promesse = trouverIconeEtTitre(r.url, { signal: controleur.signal });
    recherche = { url: r.url, controleur, promesse };
    promesse.then((res) => {
      if (recherche?.url !== r.url || controleur.signal.aborted) return;
      if (!titreModifie) champTitre.value = res.titre;
      montrerApercu(r.url, res.icone, false);
    });
  };
  let minuteur;
  champUrl.addEventListener("input", () => {
    clearTimeout(minuteur);
    minuteur = setTimeout(lancerRecherche, 600);
  });
  champUrl.addEventListener("blur", lancerRecherche);
  champUrl.addEventListener("paste", () => setTimeout(lancerRecherche, 0));
  champTitre.addEventListener("input", () => {
    titreModifie = champTitre.value.trim() !== "";
  });
  const [permission, lienPermission] = blocPermission({
    onAccordee: () => {
      recherche = null;
      lancerRecherche();
    },
  });

  const dialogue = el(
    "dialog",
    { class: "dialogue", "aria-labelledby": "ajout-titre-dialogue" },
    el(
      "form",
      { method: "dialog", novalidate: true, class: "formulaire" },
      el(
        "div",
        { class: "dialogue-entete" },
        apercu,
        el("h2", { id: "ajout-titre-dialogue", class: "dialogue-titre", texte: "Ajouter un site" }),
      ),
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
      permission,
      avertissement,
      el(
        "div",
        { class: "dialogue-actions" },
        lienPermission,
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
  montrerApercu("", lettre(""), false);

  let doublonAccepte = null;
  champUrl.addEventListener("input", () => {
    const r = normaliserUrl(champUrl.value);
    champTitre.placeholder = r.ok ? domaine(r.url) : "";
    erreurUrl.textContent = "";
    champUrl.removeAttribute("aria-invalid");
    if (doublonAccepte !== cleUrl(r.url)) {
      avertissement.hidden = true;
      boutonAjouter.textContent = "Ajouter";
    }
  });

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
    // Adding never waits for the network: the search goes on and updates the tile later.
    if (recherche?.url !== r.url) {
      recherche = null;
      lancerRecherche();
    }
    const titreSaisi = champTitre.value.trim();
    const site = creerSite({ titre: titreSaisi || domaine(r.url), url: r.url });
    store.envoyer({ type: A.SITE_AJOUTER, site, parentId });
    const enCours = recherche;
    enCours?.promesse.then((res) => {
      const changements = { icone: res.icone };
      if (!titreSaisi) changements.titre = res.titre;
      store.envoyer({ type: A.SITE_MODIFIER, id: site.id, changements });
    });
    recherche = null; // keep the search running after the dialog closes
    dialogue.close();
    apresAjout?.(site);
  });
  dialogue.addEventListener("close", () => {
    recherche?.controleur.abort();
    clearTimeout(minuteur);
    dialogue.remove();
  });
  document.body.append(dialogue);
  dialogue.showModal();
  champUrl.focus();
  return dialogue;
}

/**
 * "Modifier le site" dialog: same fields as the add dialog, plus the icon editor and a live
 * preview of the tile. Escape or "Annuler" leaves the site untouched.
 */
export function ouvrirEditionSite(store, site, { apresModification } = {}) {
  const champUrl = el("input", {
    id: "edition-url",
    type: "url",
    inputmode: "url",
    autocapitalize: "off", // iOS keyboard (V3.4): no capital, no correction of addresses
    autocorrect: "off",
    enterkeyhint: "done",
    autocomplete: "off",
    spellcheck: "false",
    value: site.url,
    "aria-describedby": "edition-url-erreur",
  });
  const erreurUrl = el("p", { id: "edition-url-erreur", class: "champ-erreur" });
  const champTitre = el("input", {
    id: "edition-titre",
    type: "text",
    autocomplete: "off",
    maxlength: "60",
    value: site.titre,
  });
  const caseNouvelleIcone = el("input", {
    id: "edition-maj-icone",
    type: "checkbox",
    checked: true,
  });
  const blocNouvelleIcone = el(
    "label",
    { class: "case-a-cocher", for: "edition-maj-icone", hidden: true },
    caseNouvelleIcone,
    el("span", { texte: "Mettre à jour l'icône pour la nouvelle adresse" }),
  );
  const apercu = el("div", { class: "apercu apercu--grand", "aria-hidden": "true" });
  const lireSite = () => {
    const r = normaliserUrl(champUrl.value);
    return { titre: champTitre.value.trim(), url: r.ok ? r.url : "" };
  };
  const majApercu = () => {
    const { titre, url } = lireSite();
    apercu.replaceChildren(
      creerIcone({
        titre: titre || domaine(url || site.url),
        url: url || site.url,
        icone: editeur.lire(),
      }),
      el("span", { class: "apercu-titre", texte: titre || domaine(url || site.url) }),
    );
  };
  const editeur = creerEditeurIcone({
    iconeInitiale: site.icone,
    lireSite,
    onChange: majApercu,
    importBloque: () => niveauTaille(estimerTaille(store.lire())) === "bloque",
  });
  champTitre.addEventListener("input", majApercu);
  champUrl.addEventListener("input", () => {
    const { url } = lireSite();
    erreurUrl.textContent = "";
    champUrl.removeAttribute("aria-invalid");
    blocNouvelleIcone.hidden = !url || url === site.url || editeur.mode() !== "auto";
    majApercu();
  });

  const dialogue = el(
    "dialog",
    { class: "dialogue dialogue--large", "aria-labelledby": "edition-titre-dialogue" },
    el(
      "form",
      { method: "dialog", novalidate: true, class: "formulaire" },
      el("h2", {
        id: "edition-titre-dialogue",
        class: "dialogue-titre",
        texte: "Modifier le site",
      }),
      apercu,
      el(
        "div",
        { class: "champ" },
        el("label", { for: "edition-titre", texte: "Nom" }),
        champTitre,
      ),
      el(
        "div",
        { class: "champ" },
        el("label", { for: "edition-url", texte: "Adresse" }),
        champUrl,
        erreurUrl,
      ),
      blocNouvelleIcone,
      editeur.racine,
      el(
        "div",
        { class: "dialogue-actions" },
        el("button", {
          type: "button",
          class: "bouton",
          texte: "Annuler",
          onclick: () => dialogue.close(),
        }),
        el("button", { type: "submit", class: "bouton bouton--principal", texte: "Enregistrer" }),
      ),
    ),
  );
  dialogue.querySelector("form").addEventListener("submit", (e) => {
    e.preventDefault();
    const r = normaliserUrl(champUrl.value);
    if (!r.ok) {
      erreurUrl.textContent = r.erreur;
      champUrl.setAttribute("aria-invalid", "true");
      champUrl.focus();
      return;
    }
    const titre = champTitre.value.trim() || domaine(r.url);
    const urlChangee = r.url !== site.url;
    const changements = { titre, url: r.url, icone: editeur.lire() };
    store.envoyer({ type: A.SITE_MODIFIER, id: site.id, changements });
    if (urlChangee && editeur.mode() === "auto" && caseNouvelleIcone.checked) {
      trouverIconeEtTitre(r.url).then((res) =>
        store.envoyer({ type: A.SITE_MODIFIER, id: site.id, changements: { icone: res.icone } }),
      );
    }
    dialogue.close();
    apresModification?.(site);
  });
  dialogue.addEventListener("close", () => {
    editeur.arreter();
    dialogue.remove();
  });
  document.body.append(dialogue);
  majApercu();
  dialogue.showModal();
  champTitre.focus();
  champTitre.select();
  return dialogue;
}
