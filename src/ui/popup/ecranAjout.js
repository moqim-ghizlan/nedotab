import { A } from "../../core/actions.js";
import { dossiersCibles, emplacementValide, siteExistant } from "../../core/ajoutRapide.js";
import { couleurDepuisTexte } from "../../core/couleurs.js";
import { creerSite } from "../../core/modele.js";
import { DESCRIPTION_MAX, tagsUtilises } from "../../core/tags.js";
import { domaine } from "../../core/url.js";
import { plateforme } from "../../platform/index.js";
import { creerChampTags } from "../champTags.js";
import { el } from "../dom.js";
import { trouverIconeEtTitre } from "../services/icones.js";
import { creerRemplissageIa } from "./remplirIa.js";

/**
 * Add form of the toolbar window (V4.29), filled from the active tab. Nothing is saved
 * until "Ajouter"; the AI only fills fields the user has not touched. The save goes through
 * the store actions, then is written to the storage AT ONCE (the window closes as soon as it
 * loses the focus: a debounced write would be lost).
 */
export async function ecranAjout({
  racine,
  store,
  stockage,
  onglet,
  retour,
  peutEcrire,
  ouvrirNedoTab,
}) {
  const grille = () => store.lire().grille;
  const existant = siteExistant(grille(), onglet.url);
  const touches = new Set();
  let propositionIa = null; // { tags, description } while the user has not changed them
  let icone = { type: "lettre", couleur: couleurDepuisTexte(onglet.url) };

  const dernier = await plateforme.preferences.lire("dernierDossierAjout").catch(() => null);
  const cibles = dossiersCibles(grille());
  const champNom = el("input", {
    id: "p-nom",
    type: "text",
    maxlength: "60",
    value: onglet.titre || domaine(onglet.url),
  });
  const champUrl = el("input", { id: "p-url", type: "text", value: onglet.url, readonly: true });
  const lieu = el(
    "select",
    { id: "p-lieu" },
    cibles.map((c) =>
      el("option", {
        value: c.id ?? "",
        texte: `${"  ".repeat(Math.max(0, c.niveau - 1))}${c.chemin}`,
      }),
    ),
  );
  lieu.value = emplacementValide(grille(), dernier) ?? "";
  const recherche = el("input", {
    type: "search",
    placeholder: "Chercher un dossier",
    "aria-label": "Chercher un dossier",
    hidden: cibles.length < 9,
  });
  recherche.addEventListener("input", () => {
    const q = recherche.value.toLowerCase();
    for (const o of lieu.options) o.hidden = q !== "" && !o.textContent.toLowerCase().includes(q);
  });
  const champTags = creerChampTags({
    suggestions: () => tagsUtilises(grille()),
    onChange: () => {
      touches.add("tags");
      propositionIa = null;
    },
  });
  const description = el("textarea", {
    id: "p-desc",
    rows: "3",
    maxlength: String(DESCRIPTION_MAX),
  });
  const message = el("p", {
    class: "popup-bandeau",
    role: "status",
    "aria-live": "polite",
    hidden: true,
  });
  const etatIa = el("span", { class: "popup-ia-propose", "aria-live": "polite" });
  champNom.addEventListener("input", () => touches.add("titre"));
  description.addEventListener("input", () => {
    touches.add("description");
    propositionIa = null;
  });
  lieu.addEventListener("change", () => touches.add("dossier"));
  const dire = (texte) => {
    message.hidden = !texte;
    message.textContent = texte ?? "";
  };

  // Icon and title found in the background: they never block the display.
  const recherchee = trouverIconeEtTitre(onglet.url)
    .then((r) => {
      icone = r.icone;
      if (!touches.has("titre") && !onglet.titre && r.titre) champNom.value = r.titre;
    })
    .catch(() => {});

  const hors = typeof navigator !== "undefined" && navigator.onLine === false;
  const boutonIa = el("button", {
    type: "button",
    class: "bouton",
    texte: "Remplir avec l'IA",
    disabled: hors,
    title: hors ? "Hors ligne : l'IA est indisponible" : "",
    onclick: () => {
      dire(null);
      ia.lancer();
    },
  });
  const annulerIa = el("button", {
    type: "button",
    class: "lien-discret",
    texte: "Annuler l'IA",
    hidden: true,
    onclick: () => ia.annuler(),
  });
  const ia = creerRemplissageIa({
    onglet,
    grille,
    touches: () => touches,
    formulaire: () => ({
      titre: champNom.value,
      tags: champTags.lire(),
      description: description.value,
      dossierId: lieu.value || null,
    }),
    appliquer: (f, remplis) => {
      if (remplis.includes("titre")) champNom.value = f.titre;
      if (remplis.includes("tags")) champTags.definir(f.tags);
      if (remplis.includes("description")) description.value = f.description;
      if (remplis.includes("dossier")) lieu.value = f.dossierId ?? "";
      // Applying a proposal is not a manual edit.
      touches.delete("tags");
      touches.delete("description");
      propositionIa = {
        tags: remplis.includes("tags") ? f.tags : null,
        description: remplis.includes("description") ? f.description : null,
      };
      etatIa.textContent = remplis.length
        ? `Proposé par l'IA : ${remplis.join(", ")}`
        : "Rien à remplir : vos saisies sont conservées.";
    },
    surEtat: (e, m) => {
      boutonIa.disabled = e === "attente" || hors;
      annulerIa.hidden = e !== "attente";
      boutonIa.textContent = e === "ok" ? "Régénérer" : "Remplir avec l'IA";
      if (e === "attente") etatIa.textContent = "L'IA réfléchit…";
      if (e === "erreur") {
        etatIa.textContent = "";
        dire(m);
      }
      if (e === "annule") etatIa.textContent = "";
    },
  });

  async function enregistrer() {
    if (!peutEcrire) return dire("Le stockage n'est pas lisible : ouvrez NedoTab pour le réparer.");
    ia.annuler(); // an answer arriving after the save must change nothing
    const parentId = emplacementValide(grille(), lieu.value || null);
    await Promise.race([recherchee, new Promise((ok) => setTimeout(ok, 1500))]);
    const site = creerSite({
      titre: champNom.value.trim() || domaine(onglet.url),
      url: onglet.url,
      icone,
    });
    store.envoyer({ type: A.SITE_AJOUTER, site, parentId });
    const tags = champTags.lire();
    const desc = description.value.trim();
    if (tags.length || desc) {
      // Proposals kept as they are stay "ok" (no second AI call); anything typed is manual.
      const garde =
        propositionIa &&
        (!tags.length || propositionIa.tags) &&
        (!desc || propositionIa.description);
      store.envoyer(
        garde
          ? {
              type: A.SITE_DEFINIR_IA,
              id: site.id,
              etat: "ok",
              tags,
              description: desc,
              majLe: Date.now(),
            }
          : {
              type: A.SITE_MODIFIER,
              id: site.id,
              changements: { tags, description: desc, tagsManuels: true },
            },
      );
    }
    try {
      await stockage.sauvegarder(store.lire());
      await plateforme.preferences.ecrire("dernierDossierAjout", parentId);
    } catch {
      return dire("Enregistrement impossible. Réessayez.");
    }
    const chemin = cibles.find((c) => c.id === parentId)?.chemin ?? "Accueil";
    racine.replaceChildren(
      el("div", { class: "popup-choix" }, el("p", { role: "status", texte: `Ajouté à ${chemin}` })),
    );
    setTimeout(() => window.close(), 900);
  }

  const ajouter = el("button", {
    type: "button",
    class: "bouton bouton--principal",
    texte: "Ajouter",
    disabled: !!existant,
    onclick: () => enregistrer(),
  });
  const bandeauDoublon = existant
    ? el(
        "div",
        { class: "popup-bandeau", role: "status" },
        el("span", { texte: `Déjà dans ${existant.chemin}. ` }),
        el("button", {
          type: "button",
          class: "lien-discret",
          texte: "Modifier",
          onclick: ouvrirNedoTab,
        }),
        el("button", {
          type: "button",
          class: "lien-discret",
          texte: "Ajouter quand même",
          onclick: (e) => {
            e.target.parentElement.hidden = true;
            ajouter.disabled = false;
          },
        }),
      )
    : null;
  racine.replaceChildren(
    el(
      "div",
      { class: "popup-ecran" },
      el(
        "div",
        { class: "popup-corps" },
        bandeauDoublon,
        el("div", { class: "popup-ligne" }, boutonIa, annulerIa, etatIa),
        message,
        el("div", { class: "champ" }, el("label", { for: "p-nom", texte: "Nom" }), champNom),
        el("div", { class: "champ" }, el("label", { for: "p-url", texte: "Adresse" }), champUrl),
        el(
          "div",
          { class: "champ" },
          el("label", { for: "p-lieu", texte: "Emplacement" }),
          recherche,
          lieu,
        ),
        champTags.racine,
        el(
          "div",
          { class: "champ" },
          el("label", { for: "p-desc", texte: "Description" }),
          description,
        ),
      ),
      el(
        "div",
        { class: "popup-barre" },
        el("button", { type: "button", class: "bouton", texte: "Retour", onclick: retour }),
        el(
          "div",
          { class: "droite" },
          el("button", {
            type: "button",
            class: "bouton",
            texte: "Annuler",
            onclick: () => window.close(),
          }),
          ajouter,
        ),
      ),
    ),
  );
  document.addEventListener("keydown", (e) => e.key === "Escape" && window.close(), { once: true });
  champNom.focus();
}
