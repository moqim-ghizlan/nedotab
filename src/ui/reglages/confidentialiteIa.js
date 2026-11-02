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

/** The switches, by what they are about (the keys come from the shared module). */
const GROUPES = [
  { titre: "Vos sites", cles: ["titresAdresses", "tagsDescriptions", "chemins"] },
  { titre: "Pages web", cles: ["lirePages", "lectureServeur"] },
  { titre: "Conversations", cles: ["historique"] },
];
const PAR_CLE = Object.fromEntries(REGLAGES_CONFIDENTIALITE.map((r) => [r.cle, r]));
/** What each switch of "Vos sites" lets through, as the nouns of the sentence that sums them up. */
const DANS_LA_PHRASE = {
  titresAdresses: ["titres", "adresses"],
  tagsDescriptions: ["tags", "descriptions"],
  chemins: ["noms de dossiers"],
};

/** "a, b et c". */
const liste = (mots) =>
  mots.length < 2 ? (mots[0] ?? "") : `${mots.slice(0, -1).join(", ")} et ${mots.at(-1)}`;

/**
 * Settings → AI privacy (V4.20): what the AI may see, the elements hidden from it, and the
 * erasures. The choices are written in reglages.ia.confidentialite (synchronised) and APPLIED BY
 * THE SERVER: this screen only reflects them. At the top, one sentence says in plain words what
 * the assistant receives right now, and follows the switches.
 */
export function creerSectionConfidentialite({ store }) {
  const racine = el("details", { class: "ia-confidentialite" });

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
      libelle: "Historique des conversations",
      detail: "Toutes vos conversations, sur tous vos appareils.",
      titre: "Effacer les conversations ?",
      message: "Toutes vos conversations avec l'assistant, sur tous vos appareils, seront effacées.",
      action: () => effacerServeur("conversations", "Historique effacé"),
    },
    {
      id: "cache",
      libelle: "Cache de l'IA",
      detail: "Les réponses mémorisées pour ne pas payer deux fois.",
      titre: "Effacer le cache ?",
      message: "Les réponses mémorisées pour éviter de payer deux fois seront effacées.",
      action: () => effacerServeur("cache", "Cache effacé"),
    },
    {
      id: "usage",
      libelle: "Statistiques d'usage",
      detail: "Le suivi des appels, des jetons et du coût estimé.",
      titre: "Effacer les statistiques ?",
      message: "Le suivi de consommation (appels, jetons, coût estimé) sera remis à zéro.",
      action: () => effacerServeur("usage", "Statistiques effacées"),
    },
    {
      id: "tags",
      libelle: "Tags et descriptions générés",
      detail: "Ceux que vous avez écrits vous-même sont conservés.",
      titre: "Effacer les tags générés ?",
      message:
        "Les tags et descriptions proposés par l'IA seront retirés de vos sites. Ceux que vous avez écrits vous-même sont conservés.",
      action: effacerTags,
    },
    {
      id: "cles",
      libelle: "Mes clés d'IA",
      detail: "Supprimées de nos serveurs ; l'assistant s'arrête jusqu'à une nouvelle clé.",
      titre: "Supprimer vos clés ?",
      message: "Vos clés d'IA enregistrées seront supprimées de nos serveurs.",
      action: effacerCles,
    },
  ];
  const tout = {
    id: "tout",
    libelle: "Tout effacer et désactiver l'IA",
    detail: "Conversations, cache, statistiques, tags générés et clés.",
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
  };

  const ligneEffacement = (e, { danger = false } = {}) =>
    el(
      "li",
      { class: `ia-conf-effacement${danger ? " ia-conf-effacement--danger" : ""}` },
      el(
        "div",
        { class: "ia-conf-effacement-texte" },
        el("strong", { texte: e.libelle }),
        el("span", { class: "reglages-note", texte: e.detail }),
      ),
      el("button", {
        type: "button",
        class: `bouton ia-conf-effacer${danger ? " bouton--danger" : ""}`,
        id: `effacer-${e.id}`,
        texte: "Effacer",
        "aria-label": `Effacer : ${e.libelle}`,
        onclick: async () => {
          if (await confirmer(e.titre, e.message, "Effacer")) await e.action();
        },
      }),
    );

  function interrupteur(reglages, cle) {
    const r = PAR_CLE[cle];
    return el(
      "label",
      { class: "interrupteur ia-conf-ligne", for: `conf-${cle}` },
      el(
        "span",
        { class: "interrupteur-texte" },
        el("span", { texte: r.libelle }),
        el("span", { class: "reglages-note", texte: r.aide }),
      ),
      el("input", {
        type: "checkbox",
        role: "switch",
        class: "interrupteur-bouton",
        id: `conf-${cle}`,
        checked: permis(reglages.confidentialite, cle),
        onchange: (e) =>
          store.envoyer({
            type: A.REGLAGES_MODIFIER,
            changements: {
              ia: avecConfidentialite(
                iaDe(store.lire().reglages),
                cle,
                e.currentTarget.checked,
              ),
            },
          }),
      }),
    );
  }

  /** What the assistant receives, in one sentence, from the three switches about the sites. */
  function phrase(reglages) {
    const recus = Object.keys(DANS_LA_PHRASE).filter((c) => permis(reglages.confidentialite, c));
    const refuses = Object.keys(DANS_LA_PHRASE).filter((c) => !permis(reglages.confidentialite, c));
    // Without titles and addresses nothing about the sites can be used: the rest goes nowhere.
    const aucun = !permis(reglages.confidentialite, "titresAdresses");
    return el(
      "div",
      { class: "ia-conf-phrase", role: "status" },
      el("p", {
        class: "ia-conf-recu",
        texte: aucun
          ? "L'assistant ne reçoit rien sur vos sites."
          : `L'assistant reçoit de vos sites : ${liste(recus.flatMap((c) => DANS_LA_PHRASE[c]))}.`,
      }),
      refuses.length && !aucun
        ? el("p", {
            class: "reglages-note",
            texte: `Il ne reçoit pas : ${liste(refuses.flatMap((c) => DANS_LA_PHRASE[c]))}.`,
          })
        : null,
      el("p", {
        class: "reglages-note",
        texte: "Vos messages au chat lui sont toujours transmis : sans eux, pas de réponse.",
      }),
    );
  }

  function rendre() {
    // A switch that was just used keeps the keyboard focus after the sentence is redrawn.
    const actif = racine.contains(document.activeElement) ? document.activeElement.id : "";
    const reglages = iaDe(store.lire().reglages);
    const exclus = compterSitesExclus(store.lire().grille);
    const refus = Object.keys(reglages.confidentialite ?? {}).length;
    const contenu = [
      el(
        "summary",
        { class: "ia-conf-resume" },
        el("span", { class: "ia-conf-titre", texte: "Confidentialité de l'IA" }),
        el("span", {
          class: `ia-conf-etat${refus ? " ia-conf-etat--limite" : ""}`,
          texte: refus ? `${refus} limité${refus > 1 ? "s" : ""}` : "Par défaut",
        }),
      ),
      phrase(reglages),
      ...GROUPES.map((g) =>
        el(
          "section",
          { class: "ia-conf-groupe" },
          el("h3", { class: "ia-conf-groupe-titre", texte: g.titre }),
          el("div", { class: "ia-conf-lignes" }, g.cles.map((c) => interrupteur(reglages, c))),
        ),
      ),
      el(
        "p",
        { class: `ia-conf-masques${exclus ? " ia-conf-masques--actif" : ""}` },
        el("strong", {
          texte: exclus
            ? `${exclus} site${exclus > 1 ? "s" : ""} masqué${exclus > 1 ? "s" : ""} à l'IA`
            : "Aucun site masqué à l'IA",
        }),
        el("span", {
          class: "reglages-note",
          texte: "Menu d'un site ou d'un dossier → « Ne pas montrer à l'IA ».",
        }),
      ),
      el(
        "section",
        { class: "ia-conf-groupe ia-conf-zone-effacement" },
        el("h3", { class: "ia-conf-groupe-titre", texte: "Effacer mes données" }),
        el("p", {
          class: "reglages-note",
          texte: "Définitif. Exportez vos données avant si vous voulez en garder une copie.",
        }),
        el("ul", { class: "ia-conf-effacements" }, [
          ...effacements.map((e) => ligneEffacement(e)),
          ligneEffacement(tout, { danger: true }),
        ]),
      ),
    ];
    racine.replaceChildren(...contenu);
    if (actif) racine.querySelector(`#${CSS.escape(actif)}`)?.focus();
  }

  rendre();
  // The switches follow the settings (another device).
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
