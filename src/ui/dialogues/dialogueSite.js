import { A } from "../../core/actions.js";
import { couleurDepuisTexte } from "../../core/couleurs.js";
import { creerSite } from "../../core/modele.js";
import { estimerTaille, niveauTaille } from "../../core/taille.js";
import { DESCRIPTION_MAX, normaliserDescription, tagsUtilises } from "../../core/tags.js";
import { cleUrl, domaine, normaliserUrl } from "../../core/url.js";
import { plateforme } from "../../platform/index.js";
import { champFlottant, creerApercuAjout, creerChampLieu } from "../ajoutPieces.js";
import { creerChampTags } from "../champTags.js";
import { el } from "../dom.js";
import { creerEditeurIcone } from "./editerIcone.js";
import { trouverIconeEtTitre } from "../services/icones.js";
import { creerIcone } from "../tuile.js";
import { enrichir } from "../services/enrichissement.js";

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

/** The site of the grid with this address key, or null. */
function siteParCle(elements, cle) {
  for (const e of elements) {
    if (e.type === "site" && cleUrl(e.url) === cle) return e;
    if (e.items) {
      const r = siteParCle(e.items, cle);
      if (r) return r;
    }
  }
  return null;
}

/**
 * "Ajouter un site" dialog (native <dialog>, focus and Escape handled by the browser).
 * The tile to create is drawn large at the top and follows the address and the name; the place
 * is chosen with the folder tree; a duplicate is shown as an alert with two actions (T3).
 */
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
  const apercu = creerApercuAjout(() => {
    const r = normaliserUrl(champUrl.value);
    return { titre: champTitre.value.trim(), url: r.ok ? r.url : "" };
  });
  const champLieu = creerChampLieu({ grille: store.lire().grille, selection: parentId });
  const boutonAjouter = el("button", {
    type: "submit",
    class: "bouton bouton--principal",
    texte: "Ajouter",
    disabled: true,
  });

  // --- automatic title and icon -------------------------------------------------------
  let titreModifie = false;
  let recherche = null; // { url, controleur, promesse }
  let iconeCourante = { type: "lettre", couleur: couleurDepuisTexte("") };
  const lettre = (url) => ({ type: "lettre", couleur: couleurDepuisTexte(url) });
  const montrerApercu = (icone, enCours) => {
    iconeCourante = icone;
    apercu.maj(icone, enCours);
  };
  const lancerRecherche = () => {
    const r = normaliserUrl(champUrl.value);
    if (!r.ok) return;
    if (recherche?.url === r.url) return;
    recherche?.controleur.abort();
    const controleur = new AbortController();
    montrerApercu(lettre(r.url), true);
    const promesse = trouverIconeEtTitre(r.url, { signal: controleur.signal });
    recherche = { url: r.url, controleur, promesse };
    promesse.then((res) => {
      if (recherche?.url !== r.url || controleur.signal.aborted) return;
      if (!titreModifie) champTitre.value = res.titre;
      montrerApercu(res.icone, false);
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
    apercu.maj(iconeCourante, false);
  });
  const [permission, lienPermission] = blocPermission({
    onAccordee: () => {
      recherche = null;
      lancerRecherche();
    },
  });

  // --- duplicate alert ------------------------------------------------------------------
  let doublonAccepte = null;
  const nomDoublon = el("strong");
  const alerte = el(
    "div",
    { class: "ajout-alerte", role: "status", hidden: true },
    el("p", {}, "Ce site est déjà dans votre grille : ", nomDoublon, "."),
    el(
      "div",
      { class: "ajout-alerte-actions" },
      el("button", {
        type: "button",
        class: "bouton",
        texte: "Modifier l'existant",
        onclick: () => {
          const existant = siteParCle(
            store.lire().grille,
            cleUrl(normaliserUrl(champUrl.value).url),
          );
          dialogue.close();
          if (existant) ouvrirEditionSite(store, existant, {});
        },
      }),
      el("button", {
        type: "button",
        class: "bouton",
        texte: "Ajouter quand même",
        onclick: () => {
          doublonAccepte = cleUrl(normaliserUrl(champUrl.value).url);
          alerte.hidden = true;
          boutonAjouter.focus();
        },
      }),
    ),
  );
  const verifierDoublon = () => {
    const r = normaliserUrl(champUrl.value);
    const existant = r.ok ? siteParCle(store.lire().grille, cleUrl(r.url)) : null;
    alerte.hidden = !existant || doublonAccepte === cleUrl(r.url);
    if (existant) nomDoublon.textContent = existant.titre;
  };

  const dialogue = el(
    "dialog",
    { class: "dialogue dialogue--ajout", "aria-labelledby": "ajout-titre-dialogue" },
    el(
      "form",
      { method: "dialog", novalidate: true, class: "formulaire ajout" },
      el("h2", { id: "ajout-titre-dialogue", class: "dialogue-titre", texte: "Ajouter un site" }),
      apercu.racine,
      alerte,
      el(
        "section",
        { class: "ajout-carte" },
        champFlottant(champUrl, "Adresse du site"),
        erreurUrl,
        champFlottant(champTitre, "Nom (rempli automatiquement)"),
      ),
      el(
        "section",
        { class: "ajout-carte" },
        el("label", { class: "ajout-carte-titre", for: "ajout-lieu", texte: "Emplacement" }),
        champLieu.racine,
      ),
      permission,
      el(
        "div",
        { class: "ajout-pied" },
        lienPermission,
        el(
          "div",
          { class: "ajout-pied-droite" },
          el("button", {
            type: "button",
            class: "bouton",
            texte: "Annuler",
            onclick: () => dialogue.close(),
          }),
          boutonAjouter,
        ),
      ),
    ),
  );
  apercu.maj(iconeCourante, false);

  champUrl.addEventListener("input", () => {
    const r = normaliserUrl(champUrl.value);
    erreurUrl.textContent = "";
    champUrl.removeAttribute("aria-invalid");
    boutonAjouter.disabled = !r.ok;
    apercu.maj(iconeCourante, false);
    verifierDoublon();
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
      verifierDoublon();
      alerte.querySelector("button")?.focus();
      return;
    }
    // Adding never waits for the network: the search goes on and updates the tile later.
    if (recherche?.url !== r.url) {
      recherche = null;
      lancerRecherche();
    }
    const titreSaisi = champTitre.value.trim();
    const site = creerSite({ titre: titreSaisi || domaine(r.url), url: r.url });
    store.envoyer({ type: A.SITE_AJOUTER, site, parentId: champLieu.lire() });
    enrichir(site);
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
  // Tags and description (V4.2): written by hand, they are never overwritten by the AI.
  const champTags = creerChampTags({
    tags: site.tags ?? [],
    suggestions: () => tagsUtilises(store.lire().grille),
  });
  const champDescription = el("textarea", {
    id: "edition-description",
    rows: "3",
    maxlength: String(DESCRIPTION_MAX * 2),
    autocomplete: "off",
    "aria-describedby": "edition-description-compteur",
  });
  champDescription.value = site.description ?? "";
  const compteur = el("span", { id: "edition-description-compteur", class: "champ-compteur" });
  const majCompteur = () => {
    const n = [...champDescription.value].length;
    compteur.textContent = `${Math.min(n, 9999)} / ${DESCRIPTION_MAX}`;
    compteur.classList.toggle("champ-compteur--depasse", n > DESCRIPTION_MAX);
  };
  champDescription.addEventListener("input", majCompteur);
  majCompteur();
  const IA_A_GERER = site.tagsManuels === true;
  const caseIa = IA_A_GERER ? el("input", { id: "edition-laisser-ia", type: "checkbox" }) : null;
  const proposeParIa = site.ia?.etat === "ok" && !site.tagsManuels;
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
        { class: "champ" },
        el("label", { for: champTags.champ.id, texte: "Tags" }),
        champTags.racine,
        proposeParIa
          ? el(
              "p",
              { class: "champ-ia" },
              el("span", { texte: "Proposé par l'IA" }),
              el("button", {
                type: "button",
                class: "lien-discret",
                texte: "Régénérer",
                title: "Demander une nouvelle proposition",
                onclick: () => {
                  enrichir(site, { force: true });
                  dialogue.close();
                },
              }),
            )
          : null,
      ),
      el(
        "div",
        { class: "champ" },
        el("label", { for: "edition-description", texte: "Description" }),
        champDescription,
        compteur,
      ),
      IA_A_GERER
        ? el(
            "label",
            { class: "case-a-cocher", for: "edition-laisser-ia" },
            caseIa,
            el("span", { texte: "Laisser l'IA gérer les tags et la description" }),
          )
        : null,
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
    // Tags and description are sent only when they changed: editing the name alone must not
    // mark the site as written by hand.
    champTags.champ.dispatchEvent(new Event("blur"));
    const tags = champTags.lire();
    const description = normaliserDescription(champDescription.value);
    if (caseIa?.checked) {
      changements.tagsManuels = false;
    } else {
      if (JSON.stringify(tags) !== JSON.stringify(site.tags ?? [])) changements.tags = tags;
      if (description !== (site.description ?? "")) changements.description = description;
    }
    store.envoyer({ type: A.SITE_MODIFIER, id: site.id, changements });
    // New address: a new proposal, unless the user keeps their own tags.
    if (urlChangee && !changements.tags && (!site.tagsManuels || caseIa?.checked))
      enrichir({ ...site, url: r.url, titre });
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
