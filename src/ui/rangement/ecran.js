import { A } from "../../core/actions.js";
import { aplatir } from "../../core/arbre.js";
import { groupesDoublons, propositionGarder } from "../../core/doublons.js";
import {
  attenteRestante,
  estimation,
  fusionnerVerifications,
  LIBELLES_STATUTS,
  peutProposerSuppression,
  peutRevérifier,
  purger,
  STATUTS_A_CONFIRMER,
} from "../../core/verification.js";
import { chargerFirebase } from "../../firebase/charger.js";
import { demander } from "../dialogues/commun.js";
import { el } from "../dom.js";
import { creerGestionPropositions } from "../chat/carteProposition.js";
import { messageErreurIa } from "../messagesIa.js";
import { toast } from "../toast.js";

const CLE_STOCKAGE = "nedotab.verifications";
const PAR_APPEL = 50;

const lireStockage = () => {
  try {
    return JSON.parse(localStorage.getItem(CLE_STOCKAGE) ?? "{}") ?? {};
  } catch {
    return {};
  }
};
const ecrireStockage = (v) => {
  try {
    localStorage.setItem(CLE_STOCKAGE, JSON.stringify(v));
  } catch {
    /* storage unavailable: the results just are not kept */
  }
};

const sitesDe = (grille) =>
  aplatir(grille).flatMap(({ element, chemin }) =>
    element.type === "site" ? [{ ...element, chemin: chemin.map((d) => d.titre) }] : [],
  );

/**
 * "Ranger mes sites" (V4.17): duplicates (local, no AI), sites that no longer answer (server,
 * on demand) and tidying suggestions (AI). Every change goes through the confirmation card of
 * V4.16 (deletions listed and unticked, "Annuler" toast): nothing is applied by itself, and
 * there is deliberately no "Tout appliquer".
 */
export function creerEcranRangement({ store, enCompte = () => false }) {
  let onglet = "doublons";
  let verifications = lireStockage();
  let enCours = false;
  let progression = "";
  let suggestions = null; // { groupes } | { erreur }
  let portee = "accueil";
  let minuteur = null;
  const messages = new Map(); // a card per proposal, kept while the screen is open

  const gestion = creerGestionPropositions({
    store,
    majStatut: (m, statut) => {
      m.statutProposition = statut;
      rendre();
    },
  });
  /** A message-like object for the card of a proposal. */
  const messageDe = (cle, proposition) => {
    if (!messages.has(cle)) {
      messages.set(cle, { id: cle, proposition, statutProposition: "en_attente" });
    }
    return messages.get(cle);
  };

  const racine = el("div", { class: "rangement" });
  const choisirOnglet = (nom) => {
    onglet = nom;
    rendre();
  };

  function ongletsBarre(nbDoublons, nbVerif) {
    const bouton = (nom, texte) =>
      el("button", {
        type: "button",
        role: "tab",
        class: "rangement-onglet",
        "aria-selected": String(onglet === nom),
        texte,
        onclick: () => choisirOnglet(nom),
      });
    return el(
      "div",
      { class: "rangement-onglets", role: "tablist" },
      bouton("doublons", `Doublons (${nbDoublons})`),
      bouton("verifier", `Sites à vérifier${nbVerif ? ` (${nbVerif})` : ""}`),
      bouton("suggestions", "Suggestions"),
    );
  }

  // --- Doublons ---------------------------------------------------------------------------
  function vueDoublons(g) {
    const { exacts, probables } = g;
    if (!exacts.length && !probables.length)
      return [el("p", { class: "reglages-note", texte: "Aucun doublon détecté." })];
    const groupe = (gr, probable) => {
      const cle = `doublon-${gr.cle}`;
      const choisi = messages.get(cle)?.garde ?? null;
      return el(
        "section",
        { class: "rangement-groupe" },
        el("h3", {
          class: "rangement-groupe-titre",
          texte: `${probable ? "Doublon probable" : "Doublon exact"} : ${gr.cle}`,
        }),
        el(
          "ul",
          { class: "rangement-copies" },
          gr.copies.map((c) =>
            el(
              "li",
              {},
              el("span", {
                texte: `« ${c.titre} » — ${c.chemin.length ? c.chemin.join(" › ") : "Accueil"}`,
              }),
              el("button", {
                type: "button",
                class: "bouton",
                "aria-pressed": String(choisi === c.id),
                texte: "Garder celle-ci",
                onclick: () => {
                  messages.delete(cle);
                  const m = messageDe(cle, propositionGarder(gr, c.id));
                  m.garde = c.id;
                  rendre();
                },
              }),
            ),
          ),
        ),
        choisi ? gestion.carte(messageDe(cle, null)) : null,
      );
    };
    return [...exacts.map((x) => groupe(x, false)), ...probables.map((x) => groupe(x, true))];
  }

  // --- Sites à vérifier -------------------------------------------------------------------
  async function verifier(ids) {
    if (!enCompte()) return toast("Connectez-vous pour vérifier vos sites.");
    enCours = true;
    rendre();
    try {
      const fb = await chargerFirebase();
      let acquis = verifications;
      for (let i = 0; i < ids.length; i += PAR_APPEL) {
        progression = `${Math.min(i + PAR_APPEL, ids.length)} / ${ids.length}`;
        rendre();
        const r = await fb.appelerIa("iaVerifierSites", { ids: ids.slice(i, i + PAR_APPEL) });
        acquis = fusionnerVerifications(acquis, r.resultats, Date.now());
      }
      verifications = acquis;
      ecrireStockage(verifications);
    } catch (e) {
      toast(messageErreurIa(e), { type: "erreur", duree: 8000 });
    }
    enCours = false;
    progression = "";
    rendre();
    planifierRevérification();
  }

  /** Suspect sites are checked again by themselves 10 minutes later, while the screen is open. */
  function planifierRevérification() {
    clearTimeout(minuteur);
    const maintenant = Date.now();
    const attentes = Object.values(verifications)
      .filter((v) => STATUTS_A_CONFIRMER.includes(v.statut) && !v.confirme)
      .map((v) => attenteRestante(v, maintenant));
    if (!attentes.length || !racine.isConnected) return;
    minuteur = setTimeout(() => {
      if (!racine.isConnected) return;
      const ids = suspectsARevérifier();
      if (ids.length) verifier(ids);
    }, Math.min(...attentes) + 1000);
  }
  const suspectsARevérifier = () =>
    Object.entries(verifications)
      .filter(([, v]) => peutRevérifier(v, Date.now()))
      .map(([id]) => id);

  function vueVerifier(sites) {
    const parId = new Map(sites.map((s) => [s.id, s]));
    const entrees = Object.entries(verifications).filter(([id]) => parId.has(id));
    const revoir = suspectsARevérifier();
    const haut = [
      el("p", {
        class: "reglages-note",
        texte: `${estimation(sites.length)}. Aucune vérification n'est faite sans votre demande ; un site n'est jamais déclaré mort sur une seule erreur.`,
      }),
      el("div", { class: "rangement-boutons" },
        el("button", {
          type: "button",
          class: "bouton bouton--principal",
          texte: enCours ? `Vérification… ${progression}` : "Vérifier mes sites",
          disabled: enCours || !sites.length || null,
          onclick: () => verifier(sites.map((s) => s.id)),
        }),
        revoir.length
          ? el("button", {
              type: "button",
              class: "bouton",
              texte: `Revérifier ${revoir.length} site${revoir.length > 1 ? "s" : ""}`,
              disabled: enCours || null,
              onclick: () => verifier(revoir),
            })
          : null,
      ),
    ];
    const groupes = new Map();
    for (const [id, v] of entrees) {
      if (v.statut === "ok") continue;
      if (!groupes.has(v.statut)) groupes.set(v.statut, []);
      groupes.get(v.statut).push([id, v]);
    }
    const sections = [...groupes].map(([statut, liste]) =>
      el(
        "section",
        { class: "rangement-groupe" },
        el("h3", { class: "rangement-groupe-titre", texte: `${LIBELLES_STATUTS[statut]} (${liste.length})` }),
        el(
          "ul",
          { class: "rangement-copies" },
          liste.map(([id, v]) => ligneVerifiee(parId.get(id), v)),
        ),
      ),
    );
    if (entrees.length && !sections.length)
      sections.push(el("p", { class: "reglages-note", texte: "Tous les sites vérifiés répondent." }));
    return [...haut, ...sections];
  }

  function ligneVerifiee(site, v) {
    const suppr = peutProposerSuppression(v);
    const cle = `verif-${site.id}`;
    let action = null;
    if (suppr) {
      action = el("button", {
        type: "button",
        class: "bouton bouton--danger",
        texte: "Supprimer…",
        onclick: () => {
          messageDe(cle, { id: cle, actions: [{ outil: "supprimer", element: site.id }] });
          rendre();
        },
      });
    } else if (v.statut === "redirige" && v.urlFinale) {
      action = el("button", {
        type: "button",
        class: "bouton",
        texte: "Mettre à jour l'adresse",
        onclick: async () => {
          const ok = await demander({
            titre: "Mettre à jour l'adresse ?",
            message: `« ${site.titre} » : ${site.url} → ${v.urlFinale}`,
            boutons: [
              { libelle: "Annuler", valeur: false },
              { libelle: "Mettre à jour", valeur: true, principal: true },
            ],
          });
          if (ok !== true) return;
          const avant = store.lire().grille;
          store.envoyer({ type: A.SITE_MODIFIER, id: site.id, changements: { url: v.urlFinale } });
          delete verifications[site.id];
          ecrireStockage(verifications);
          toast("Adresse mise à jour", {
            action: { libelle: "Annuler", onClic: () => store.envoyer({ type: A.GRILLE_REMPLACER, grille: avant }) },
          });
          rendre();
        },
      });
    }
    const attente =
      !suppr && (v.statut === "introuvable" || v.statut === "injoignable")
        ? " — à confirmer par une seconde vérification dans 10 minutes"
        : "";
    return el(
      "li",
      {},
      el("span", { texte: `« ${site.titre} » — ${site.url}${attente}` }),
      action,
      messages.has(cle) ? gestion.carte(messages.get(cle)) : null,
    );
  }

  // --- Suggestions ------------------------------------------------------------------------
  async function suggerer() {
    if (!enCompte()) return toast("Connectez-vous pour utiliser l'assistant.");
    enCours = true;
    suggestions = null;
    rendre();
    try {
      const fb = await chargerFirebase();
      suggestions = await fb.appelerIa("iaSuggererRangement", { portee });
      for (const k of [...messages.keys()]) if (k.startsWith("rangement-")) messages.delete(k);
    } catch (e) {
      suggestions = { erreur: messageErreurIa(e) };
    }
    enCours = false;
    rendre();
  }

  function vueSuggestions() {
    const haut = el(
      "div",
      { class: "rangement-boutons" },
      el(
        "select",
        {
          class: "galerie-select",
          "aria-label": "Portée du rangement",
          onchange: (e) => (portee = e.currentTarget.value),
        },
        el("option", { value: "accueil", texte: "La page d'accueil", selected: portee === "accueil" }),
        el("option", { value: "tout", texte: "Toute la collection", selected: portee === "tout" }),
      ),
      el("button", {
        type: "button",
        class: "bouton bouton--principal",
        texte: enCours ? "Réflexion…" : "Proposer un rangement",
        disabled: enCours || null,
        onclick: () => suggerer(),
      }),
    );
    const note = el("p", {
      class: "reglages-note",
      texte:
        "L'assistant lit les titres, domaines, tags et descriptions de vos sites (1 appel, compté dans votre limite quotidienne). Vous validez chaque groupe, un par un.",
    });
    let corps = [];
    if (suggestions?.erreur) corps = [el("p", { class: "compte-erreur", role: "alert", texte: suggestions.erreur })];
    else if (suggestions && !suggestions.groupes.length)
      corps = [el("p", { class: "reglages-note", texte: "Rien à ranger de mieux pour l'instant." })];
    else if (suggestions)
      corps = suggestions.groupes.map((g, i) =>
        el(
          "section",
          { class: "rangement-groupe" },
          el("h3", { class: "rangement-groupe-titre", texte: g.titre }),
          g.explication ? el("p", { class: "reglages-note", texte: g.explication }) : null,
          gestion.carte(messageDe(`rangement-${i}`, g.proposition)),
        ),
      );
    return [haut, note, ...corps];
  }

  function rendre() {
    const grille = store.lire().grille;
    const sites = sitesDe(grille);
    const doublons = groupesDoublons(grille);
    verifications = purger(verifications, new Set(sites.map((s) => s.id)), Date.now());
    const nbVerif = Object.values(verifications).filter((v) => v.statut !== "ok").length;
    const corps =
      onglet === "doublons"
        ? vueDoublons(doublons)
        : onglet === "verifier"
          ? vueVerifier(sites)
          : vueSuggestions();
    racine.replaceChildren(
      ongletsBarre(doublons.exacts.length + doublons.probables.length, nbVerif),
      el("div", { class: "rangement-corps", role: "tabpanel" }, ...corps),
    );
  }

  rendre();
  return { racine, rendre, arreter: () => clearTimeout(minuteur) };
}

/** Opens the screen in a dialog. */
export async function ouvrirRangement({ store, enCompte, retourFocus }) {
  const ecran = creerEcranRangement({ store, enCompte });
  await demander({
    titre: "Ranger mes sites",
    contenu: [ecran.racine],
    boutons: [{ libelle: "Fermer", valeur: true, principal: true }],
    retourFocus,
  });
  ecran.arreter();
}
