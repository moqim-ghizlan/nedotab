import { listeDossiers } from "../../core/rattrapage.js";
import { el } from "../dom.js";

const RAISONS = {
  manuelle: "Traitement en pause.",
  interrompu: "Le traitement a été interrompu (application fermée).",
  "cle-invalide": "Pause : votre clé Gemini est refusée. Remplacez-la dans les réglages.",
  "cle-sans-credit": "Pause : votre clé n'a plus de crédit chez Google.",
  "cle-absente": "Pause : aucune clé enregistrée.",
  "ia-desactivee": "Pause : l'assistant IA est désactivé.",
  "quota-depasse": "Limite quotidienne atteinte : le traitement reprendra demain, là où il s'est arrêté. Vous pouvez aussi relever la limite dans Réglages → IA, puis reprendre.",
  "quota-pages-depasse":
    "Limite de lecture de pages par notre serveur atteinte pour aujourd'hui : le traitement reprendra demain. Dans l'extension Chrome, la page est lue par votre ordinateur et cette limite ne s'applique pas.",
  "pas-de-modele": "Pause : aucun modèle d'IA n'est disponible.",
};

const LIBELLES_ECHEC = {
  "adresse-interdite": "adresse non autorisée",
  "reponse-invalide": "réponse inutilisable",
  "fournisseur-indisponible": "service indisponible",
};

const PORTEES = [
  ["sansTags", "Les sites sans tags"],
  ["dossier", "Un dossier précis"],
  ["tout", "Tous les sites (hors tags écrits à la main)"],
];

const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? "s" : ""}`;

/**
 * "Compléter mes sites" (V4.6): the dialog that explains the cost, shows the estimate, then
 * the progress (pause, resume, stop) and the final report. Closing the dialog does not stop
 * the processing; the section of the settings shows it again.
 * @param {ReturnType<import("../services/rattrapage.js").creerRattrapage>} service
 */
export function ouvrirRattrapage(service, store) {
  const dialogue = el("dialog", { class: "dialogue dialogue--rattrapage", "aria-labelledby": "titre-rattrapage" });
  let portee = "sansTags";
  let dossierId = null;
  let apercu = null; // { ids, sites, appels, quotaRestant, traitables, partiel }
  let desabonner = () => {};

  const fermer = () => dialogue.close();
  const bouton = (texte, onclick, options = {}) =>
    el("button", { type: "button", class: `bouton${options.principal ? " bouton--principal" : ""}`, texte, onclick, disabled: options.desactive });

  async function mettreAJourApercu() {
    apercu = null;
    rendre();
    apercu = await service.estimer({ portee, dossierId });
    rendre();
  }

  function vueChoix() {
    const dossiers = listeDossiers(store.lire().grille);
    if (portee === "dossier" && !dossierId) dossierId = dossiers[0]?.id ?? null;
    const choixPortee = el(
      "select",
      { id: "rattrapage-portee", onchange: (e) => ((portee = e.currentTarget.value), mettreAJourApercu()) },
      PORTEES.map(([valeur, libelle]) => el("option", { value: valeur, texte: libelle, selected: valeur === portee })),
    );
    const choixDossier =
      portee === "dossier"
        ? el(
            "select",
            { id: "rattrapage-dossier", onchange: (e) => ((dossierId = e.currentTarget.value), mettreAJourApercu()) },
            dossiers.map((d) => el("option", { value: d.id, texte: d.titre, selected: d.id === dossierId })),
          )
        : null;
    const n = apercu?.sites ?? 0;
    const estimationTexte = !apercu
      ? "Calcul en cours…"
      : n === 0
        ? "Aucun site à compléter."
        : `${pluriel(n, "site")} à compléter · ${pluriel(apercu.appels, "appel")}${
            apercu.quotaRestant == null ? "" : ` · quota restant aujourd'hui : ${apercu.quotaRestant}`
          }`;
    return [
      el("h2", { id: "titre-rattrapage", class: "dialogue-titre", texte: "Compléter mes sites" }),
      el("p", { class: "dialogue-message", texte: "L'assistant propose des tags et une description pour vos sites déjà enregistrés. Vos tags écrits à la main ne sont jamais modifiés." }),
      el("div", { class: "champ" }, el("label", { for: "rattrapage-portee", texte: "Quels sites ?" }), choixPortee, choixDossier),
      el("p", { class: "rattrapage-estimation", "aria-live": "polite", texte: estimationTexte }),
      apercu?.partiel
        ? el("p", { class: "reglages-note", texte: `${pluriel(apercu.sites, "site")} ne pourront pas tous être traités aujourd'hui : ${apercu.traitables} le seront, le reste pourra être relancé demain.` })
        : null,
      el(
        "p",
        { class: "rattrapage-facture", role: "note" },
        el("strong", { texte: "Cette action est facturée. " }),
        el("span", { texte: "Chaque site utilise un appel à l'API Gemini avec votre propre clé : Google vous facture ces appels sur votre compte, pas NedoTab. Sur iPhone et iPad, notre serveur lit aussi la page du site. Vous pouvez mettre le traitement en pause ou l'arrêter à tout moment." }),
      ),
      el(
        "div",
        { class: "dialogue-actions dialogue-actions--empile" },
        bouton("Annuler", fermer),
        bouton(`Lancer (${apercu?.traitables ?? 0})`, async () => {
          const ids = apercu.ids.slice(0, apercu.traitables);
          await service.demarrer(ids);
        }, { principal: true, desactive: !apercu || apercu.traitables === 0 }),
      ),
    ];
  }

  function vueProgression(e) {
    const faits = e.total - e.restants.length;
    const enPause = e.etat === "pause";
    const reste = e.restants.length;
    const duree = Math.max(1, Date.now() - e.debut);
    const traites = e.ok + e.echecs.length;
    const secondes = traites > 2 && !enPause ? Math.round((reste * (duree / traites)) / 1000) : null;
    return [
      el("h2", { id: "titre-rattrapage", class: "dialogue-titre", texte: "Compléter mes sites" }),
      el("progress", { class: "rattrapage-barre", max: String(e.total), value: String(faits), "aria-label": "Progression" }),
      el("p", { class: "rattrapage-estimation", "aria-live": "polite", texte: `${faits} / ${e.total}${secondes != null ? ` · environ ${secondes < 90 ? `${secondes} s` : `${Math.round(secondes / 60)} min`} restantes` : ""}` }),
      enPause ? el("p", { class: "reglages-note", role: "status", texte: RAISONS[e.raison] ?? RAISONS.manuelle }) : null,
      el(
        "div",
        { class: "dialogue-actions dialogue-actions--empile" },
        enPause ? bouton("Reprendre", () => service.reprendre(), { principal: true }) : bouton("Pause", () => service.pause()),
        bouton("Arrêter", () => service.arreter()),
        bouton("Fermer", fermer),
      ),
    ];
  }

  function vueRapport(e) {
    const arrete = e.raison === "arrete";
    return [
      el("h2", { id: "titre-rattrapage", class: "dialogue-titre", texte: arrete ? "Traitement arrêté" : "Traitement terminé" }),
      el("p", { class: "rattrapage-estimation", texte: `${pluriel(e.ok, "site")} complété${e.ok > 1 ? "s" : ""} · ${pluriel(e.echecs.length, "échec")}` }),
      e.echecs.length
        ? el(
            "ul",
            { class: "rattrapage-echecs" },
            e.echecs.map((x) => el("li", { texte: `${x.titre || "Site"} : ${LIBELLES_ECHEC[x.code] ?? "échec"}` })),
          )
        : null,
      el(
        "div",
        { class: "dialogue-actions dialogue-actions--empile" },
        e.echecs.length ? bouton("Réessayer les échecs", () => service.reessayerEchecs(), { principal: true }) : null,
        bouton("Fermer", () => {
          service.oublier();
          fermer();
        }),
      ),
    ];
  }

  function rendre() {
    const e = service.lire();
    const contenu = e.etat === "en_cours" || e.etat === "pause" ? vueProgression(e) : e.etat === "termine" ? vueRapport(e) : vueChoix();
    dialogue.replaceChildren(el("form", { method: "dialog", class: "formulaire", onsubmit: (ev) => ev.preventDefault() }, ...contenu.filter(Boolean)));
  }

  desabonner = service.abonner(rendre);
  dialogue.addEventListener("close", () => {
    desabonner();
    dialogue.remove();
  });
  document.body.append(dialogue);
  dialogue.showModal();
  if (service.lire().etat === "inactif") mettreAJourApercu();
  else rendre();
  return dialogue;
}
