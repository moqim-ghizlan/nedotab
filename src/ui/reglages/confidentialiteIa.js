import { A } from "../../core/actions.js";
import { REGLAGES_CONFIDENTIALITE, permis } from "../../core/confidentialiteIa.js";
import { effacerTagsGeneres } from "../../core/effacement.js";
import { compterSitesExclus } from "../../core/exclusion.js";
import { avecActif, avecConfidentialite, iaDe } from "../../core/ia.js";
import { comptesDe } from "../../core/pages.js";
import { chargerFirebase } from "../../firebase/charger.js";
import { demander } from "../dialogues/commun.js";
import { el } from "../dom.js";
import { messageErreurIa } from "../messagesIa.js";
import { toast } from "../toast.js";

/**
 * Settings → AI privacy (V4.20): what the AI may see, the elements hidden from it, and the
 * erasures. The choices are written in reglages.ia.confidentialite (synchronised) and APPLIED BY
 * THE SERVER: this screen only reflects them.
 */
export function creerSectionConfidentialite({ store }) {
  const racine = el("details", { class: "ia-confidentialite" });
  const resume = el("summary", { texte: "Confidentialité de l'IA" });

  async function confirmer(titre, message, libelle) {
    return (
      (await demander({
        titre,
        message: `${message} Cette action est définitive. Pensez à exporter vos données avant (Réglages → Mes données).`,
        boutons: [
          { libelle: "Annuler", valeur: false },
          { libelle, valeur: true, danger: true, principal: true },
        ],
      })) === true
    );
  }

  const appeler = async (nom, donnees) => (await chargerFirebase()).appelerIa(nom, donnees);

  /** Server side: conversations, cache, statistics. */
  async function effacerServeur(quoi, message) {
    try {
      const r = await appeler("iaEffacer", { quoi });
      toast(message);
      return r;
    } catch (e) {
      toast(messageErreurIa(e), { type: "erreur", duree: 8000 });
      return null;
    }
  }

  function effacerTags() {
    const etat = store.lire();
    const { grille, efface } = effacerTagsGeneres(etat.grille);
    if (!efface) return toast("Aucun tag généré par l'IA à effacer.");
    const avant = etat.grille;
    const pages = comptesDe(etat);
    store.envoyer({ type: A.GRILLE_REMPLACER, grille, pages });
    toast(`Tags et descriptions effacés sur ${efface} site${efface > 1 ? "s" : ""}`, {
      duree: 8000,
      action: {
        libelle: "Annuler",
        onClic: () => store.envoyer({ type: A.GRILLE_REMPLACER, grille: avant, pages }),
      },
    });
  }

  async function effacerCles() {
    try {
      const cles = await appeler("iaEtatCles");
      for (const c of cles) await appeler("iaSupprimerCle", { fournisseur: c.fournisseur });
      toast(cles.length ? "Clés supprimées" : "Aucune clé enregistrée");
    } catch (e) {
      toast(messageErreurIa(e), { type: "erreur", duree: 8000 });
    }
  }

  const effacements = [
    {
      id: "conversations",
      libelle: "Effacer l'historique des conversations",
      titre: "Effacer les conversations ?",
      message: "Toutes vos conversations avec l'assistant, sur tous vos appareils, seront effacées.",
      action: () => effacerServeur("conversations", "Historique effacé"),
    },
    {
      id: "cache",
      libelle: "Effacer le cache de l'IA",
      titre: "Effacer le cache ?",
      message: "Les réponses mémorisées pour éviter de payer deux fois seront effacées.",
      action: () => effacerServeur("cache", "Cache effacé"),
    },
    {
      id: "usage",
      libelle: "Effacer les statistiques d'usage",
      titre: "Effacer les statistiques ?",
      message: "Le suivi de consommation (appels, jetons, coût estimé) sera remis à zéro.",
      action: () => effacerServeur("usage", "Statistiques effacées"),
    },
    {
      id: "tags",
      libelle: "Effacer les tags et descriptions générés par l'IA",
      titre: "Effacer les tags générés ?",
      message:
        "Les tags et descriptions proposés par l'IA seront retirés de vos sites. Ceux que vous avez écrits vous-même sont conservés.",
      action: effacerTags,
    },
    {
      id: "cles",
      libelle: "Supprimer mes clés",
      titre: "Supprimer vos clés ?",
      message: "Vos clés d'IA enregistrées seront supprimées de nos serveurs.",
      action: effacerCles,
    },
    {
      id: "tout",
      libelle: "Tout effacer et désactiver l'IA",
      titre: "Tout effacer ?",
      message:
        "Conversations, cache, statistiques, tags générés et clés seront effacés, puis l'assistant sera désactivé.",
      action: async () => {
        const r = await effacerServeur("serveur", "Données de l'IA effacées");
        if (!r) return;
        effacerTags();
        await effacerCles();
        store.envoyer({
          type: A.REGLAGES_MODIFIER,
          changements: { ia: avecActif(iaDe(store.lire().reglages), false) },
        });
      },
    },
  ];

  function rendre() {
    const reglages = iaDe(store.lire().reglages);
    const exclus = compterSitesExclus(store.lire().grille);
    racine.replaceChildren(
      resume,
      el("p", {
        class: "reglages-note",
        texte:
          "Par défaut, l'assistant reçoit les titres, adresses, tags et descriptions de vos sites et vos messages. Ces choix sont appliqués par nos serveurs.",
      }),
      el(
        "ul",
        { class: "ia-confidentialite-liste" },
        REGLAGES_CONFIDENTIALITE.map((r) => {
          const id = `conf-${r.cle}`;
          return el(
            "li",
            {},
            el("input", {
              type: "checkbox",
              id,
              checked: permis(reglages.confidentialite, r.cle),
              onchange: (e) =>
                store.envoyer({
                  type: A.REGLAGES_MODIFIER,
                  changements: {
                    ia: avecConfidentialite(
                      iaDe(store.lire().reglages),
                      r.cle,
                      e.currentTarget.checked,
                    ),
                  },
                }),
            }),
            el(
              "label",
              { for: id },
              el("span", { texte: r.libelle }),
              el("span", { class: "reglages-note", texte: ` — ${r.aide}` }),
            ),
          );
        }),
      ),
      el("p", {
        class: "reglages-note",
        texte: exclus
          ? `${exclus} site${exclus > 1 ? "s" : ""} masqué${exclus > 1 ? "s" : ""} à l'IA. Pour en masquer d'autres : menu d'un site ou d'un dossier → « Ne pas montrer à l'IA ».`
          : "Aucun site masqué à l'IA. Pour en masquer : menu d'un site ou d'un dossier → « Ne pas montrer à l'IA ».",
      }),
      el("h3", { class: "ia-confidentialite-titre", texte: "Effacer" }),
      el(
        "div",
        { class: "ia-confidentialite-boutons" },
        effacements.map((e) =>
          el("button", {
            type: "button",
            class: `bouton${e.id === "tout" ? " bouton--danger" : ""}`,
            id: `effacer-${e.id}`,
            texte: e.libelle,
            onclick: async () => {
              if (await confirmer(e.titre, e.message, "Effacer")) await e.action();
            },
          }),
        ),
      ),
    );
  }

  rendre();
  // The checkboxes follow the settings (another device).
  let vue = JSON.stringify(iaDe(store.lire().reglages).confidentialite ?? null);
  const arret = store.abonner(() => {
    if (!racine.isConnected) return arret();
    const suivante = JSON.stringify(iaDe(store.lire().reglages).confidentialite ?? null);
    if (suivante !== vue) {
      vue = suivante;
      rendre();
    }
  });
  return { section: racine };
}
