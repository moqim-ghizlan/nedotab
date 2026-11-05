import { A } from "../../core/actions.js";
import { emplacementValide, siteExistant } from "../../core/ajoutRapide.js";
import { couleurDepuisTexte } from "../../core/couleurs.js";
import { ajouter as ajouterOperation } from "../../core/fileOperations.js";
import { creerSite } from "../../core/modele.js";
import { decrire } from "../../core/rejeu.js";
import { DESCRIPTION_MAX, tagsUtilises } from "../../core/tags.js";
import { domaine } from "../../core/url.js";
import { plateforme } from "../../platform/index.js";
import { creerChampTags } from "../champTags.js";
import { creerEditeurIcone } from "../dialogues/editerIcone.js";
import { el } from "../dom.js";
import { champFlottant, creerApercuAjout, creerChampLieu } from "../ajoutPieces.js";
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
  // T4: "fenetre" = the large add window (two columns, icon editor in view).
  disposition = "popup",
}) {
  const fenetre = disposition === "fenetre";
  const grille = () => store.lire().grille;
  const existant = siteExistant(grille(), onglet.url);
  const touches = new Set();
  let propositionIa = null; // { tags, description } while the user has not changed them

  const dernier = await plateforme.preferences.lire("dernierDossierAjout").catch(() => null);
  const champNom = el("input", {
    id: "p-nom",
    type: "text",
    maxlength: "60",
    value: onglet.titre || domaine(onglet.url),
  });
  const champUrl = el("input", { id: "p-url", type: "text", value: onglet.url, readonly: true });
  // Place: a button showing the path opens the shared folder tree (T1).
  const champLieu = creerChampLieu({
    grille: grille(),
    selection: dernier,
    id: "p-lieu",
    onChoix: () => touches.add("dossier"),
  });
  // Same small API as the old <select>.
  const lieu = {
    get value() {
      return champLieu.lire() ?? "";
    },
    set value(id) {
      champLieu.definir(id || null);
    },
  };
  const apercu = creerApercuAjout(() => ({ titre: champNom.value.trim(), url: onglet.url }));
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
  champNom.addEventListener("input", () => {
    touches.add("titre");
    majApercu();
  });
  description.addEventListener("input", () => {
    touches.add("description");
    propositionIa = null;
  });
  const dire = (texte) => {
    message.hidden = !texte;
    message.textContent = texte ?? "";
  };

  // Icon and title found in the background: they never block the display.
  const recherchee = trouverIconeEtTitre(onglet.url)
    .then((r) => {
      if (!touches.has("titre") && !onglet.titre && r.titre) champNom.value = r.titre;
    })
    .catch(() => {});

  // Icon (collapsed): automatic by default; importing an image opens a system dialog that may
  // close this window, so the other modes are the ones to prefer here.
  const editeurIcone = creerEditeurIcone({
    iconeInitiale: { type: "lettre", couleur: couleurDepuisTexte(onglet.url) },
    lireSite: () => ({ titre: champNom.value, url: onglet.url }),
    onChange: () => majApercu(),
    modeInitial: "auto",
  });
  function majApercu(enCours = false) {
    apercu.maj(editeurIcone.lire(), enCours);
  }
  // Automatic by default: the detection runs now; the letter stays the fallback.
  majApercu(true);
  const detectee = editeurIcone
    .redetecter()
    .catch(() => {})
    .then(() => majApercu());
  const hors = typeof navigator !== "undefined" && navigator.onLine === false;
  const boutonIa = el("button", {
    type: "button",
    class: "bouton bouton-ia",
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
      boutonIa.setAttribute("aria-busy", String(e === "attente"));
      annulerIa.hidden = e !== "attente";
      boutonIa.textContent = e === "ok" ? "Régénérer" : "Remplir avec l'IA";
      if (e === "attente") etatIa.textContent = "L'IA réfléchit…";
      if (e === "erreur") {
        etatIa.textContent = "";
        dire(m);
        // Google sign-in cannot run in this small window (it closes on the first click
        // outside): send the user to NedoTab, where the session is then shared.
        if (/connect/i.test(m ?? ""))
          etatIa.append(
            el("button", {
              type: "button",
              class: "lien-discret",
              texte: "Ouvrir NedoTab pour vous connecter",
              onclick: ouvrirNedoTab,
            }),
          );
      }
      if (e === "annule") etatIa.textContent = "";
    },
  });

  async function enregistrer() {
    if (!peutEcrire) return dire("Le stockage n'est pas lisible : ouvrez NedoTab pour le réparer.");
    ia.annuler(); // an answer arriving after the save must change nothing
    const parentId = emplacementValide(grille(), lieu.value || null);
    await Promise.race([
      Promise.all([recherchee, detectee]),
      new Promise((ok) => setTimeout(ok, 1500)),
    ]);
    const site = creerSite({
      titre: champNom.value.trim() || domaine(onglet.url),
      url: onglet.url,
      icone: editeurIcone.lire(),
    });
    // Account mode: the sync of the open page only sees operations, never a reloaded state.
    const operations = [];
    const envoyer = (action) => {
      operations.push({
        idOp: globalThis.crypto.randomUUID(),
        action,
        creeLe: Date.now(),
        ...decrire(store.lire(), action),
      });
      store.envoyer(action);
    };
    envoyer({ type: A.SITE_AJOUTER, site, parentId });
    const tags = champTags.lire();
    const desc = description.value.trim();
    if (tags.length || desc) {
      // Proposals kept as they are stay "ok" (no second AI call); anything typed is manual.
      const garde =
        propositionIa &&
        (!tags.length || propositionIa.tags) &&
        (!desc || propositionIa.description);
      envoyer(
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
      const synchro = await plateforme.preferences.lire("synchro").catch(() => null);
      if (synchro?.uid) {
        let file = [];
        for (const operation of operations) file = ajouterOperation(file, operation).file;
        await plateforme.operations.ecrire(globalThis.crypto.randomUUID(), {
          uid: synchro.uid,
          file,
        });
      }
      await plateforme.preferences.ecrire("dernierDossierAjout", parentId);
    } catch (e) {
      return dire(`Enregistrement impossible : ${e?.message ?? "réessayez"}.`);
    }
    const chemin = champLieu.chemin(parentId);
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
    onclick: () => enregistrer().catch((e) => dire(`Erreur : ${e?.message ?? e}`)),
  });
  const bandeauDoublon = existant
    ? el(
        "div",
        { class: "ajout-alerte", role: "status" },
        el("p", {}, "Ce site est déjà dans ", el("strong", { texte: existant.chemin }), "."),
        el(
          "div",
          { class: "ajout-alerte-actions" },
          el("button", {
            type: "button",
            class: "bouton",
            texte: "Modifier l'existant",
            onclick: ouvrirNedoTab,
          }),
          el("button", {
            type: "button",
            class: "bouton",
            texte: "Ajouter quand même",
            onclick: (e) => {
              e.target.closest(".ajout-alerte").hidden = true;
              ajouter.disabled = false;
            },
          }),
        ),
      )
    : null;
  if (fenetre) {
    // Large window: preview on the left, the form in blocks on the right, a sticky footer.
    const titreCarte = (texte, pour) =>
      el("label", { class: "ajout-carte-titre", for: pour, texte });
    racine.replaceChildren(
      el(
        "div",
        { class: "ajout-fenetre", role: "dialog", "aria-label": "Ajouter ce site" },
        el(
          "div",
          { class: "ajout-fenetre-corps" },
          el(
            "aside",
            { class: "ajout-fenetre-gauche" },
            apercu.racine,
            el("p", {
              class: "ajout-fenetre-aide",
              texte: "Voici la carte telle qu'elle apparaîtra sur votre accueil.",
            }),
          ),
          el(
            "div",
            { class: "ajout-fenetre-droite" },
            bandeauDoublon,
            message,
            el(
              "section",
              { class: "ajout-carte" },
              champFlottant(champUrl, "Adresse"),
              champFlottant(champNom, "Nom"),
            ),
            el(
              "section",
              { class: "ajout-carte" },
              titreCarte("Emplacement", "p-lieu"),
              champLieu.racine,
            ),
            el("section", { class: "ajout-carte" }, editeurIcone.racine),
            el(
              "section",
              { class: "ajout-carte" },
              el("div", { class: "popup-ligne" }, boutonIa, annulerIa, etatIa),
              champTags.racine,
              el(
                "details",
                { class: "ajout-repliable" },
                el("summary", { texte: "Description" }),
                description,
              ),
            ),
          ),
        ),
        el(
          "footer",
          { class: "ajout-fenetre-pied" },
          el("button", {
            type: "button",
            class: "bouton",
            texte: "Annuler",
            onclick: () => window.close(),
          }),
          ajouter,
        ),
      ),
    );
  } else {
  racine.replaceChildren(
    el(
      "div",
      { class: "popup-ecran" },
      el(
        "div",
        { class: "popup-corps" },
        el(
          "div",
          { class: "ajout" },
          apercu.racine,
          bandeauDoublon,
          message,
          el(
            "section",
            { class: "ajout-carte" },
            champFlottant(champUrl, "Adresse"),
            champFlottant(champNom, "Nom"),
          ),
          el(
            "section",
            { class: "ajout-carte" },
            el("label", { class: "ajout-carte-titre", for: "p-lieu", texte: "Emplacement" }),
            champLieu.racine,
          ),
          el(
            "section",
            { class: "ajout-carte" },
            el("div", { class: "popup-ligne" }, boutonIa, annulerIa, etatIa),
            el(
              "details",
              { class: "popup-icone ajout-repliable" },
              el("summary", { texte: "Icône" }),
              editeurIcone.racine,
            ),
            champTags.racine,
            el(
              "details",
              { class: "ajout-repliable" },
              el("summary", { texte: "Description" }),
              description,
            ),
          ),
        ),
      ),
      el(
        "div",
        { class: "popup-barre" },
        el("button", { type: "button", class: "bouton", texte: "Retour", onclick: retour }),
        el(
          "div",
          { class: "droite ajout-pied-droite" },
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
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") window.close();
    else if (
      fenetre &&
      e.key === "Enter" &&
      !ajouter.disabled &&
      !e.target.closest?.("textarea, button, summary, [role=tree], [role=treeitem], .ajout-lieu-panneau, .champ-tags")
    ) {
      e.preventDefault();
      ajouter.click();
    }
  });
  champNom.focus();
}
