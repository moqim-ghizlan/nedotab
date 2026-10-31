import { A } from "../../core/actions.js";
import {
  avecActif,
  avecQuestionBarre,
  avecSitesChat,
  EXPLICATIONS_IA,
  FOURNISSEURS,
  iaDe,
} from "../../core/ia.js";
import { LIBELLES_MODES_SITES_CHAT, MODES_SITES_CHAT } from "../../core/besoinContexteSites.js";
import { LIBELLES_PREFERENCES, PREFERENCES_QUESTION } from "../../core/routageQuestion.js";
import { dateHeure } from "../../core/sauvegardes.js";
import { plateforme } from "../../platform/index.js";
import { demander } from "../dialogues/commun.js";
import { el } from "../dom.js";
import { creerServiceIa } from "../services/ia.js";
import { ouvrirRattrapage } from "./rattrapage.js";
import { toast } from "../toast.js";

/**
 * "Assistant IA" section of the settings (V4.1): on/off and my Gemini key (stored encrypted
 * on the server, never shown again). The model is imposed by the server, so there is nothing
 * to choose and no model to check. The switch is a synced setting (reglages.ia); the key is
 * not: only its state (provider, last 4 characters, valid or not) is read from the server.
 */
export function sectionIa({ store, session, service = creerServiceIa() }) {
  let config = null; // config/ia
  let cles = null; // [{ fournisseur, fin, ajouteLe, valide }] | null while loading
  let erreurCles = null;
  let quota = null; // { limite, utilises, restant, defaut, max } | null
  const racine = el("div", { class: "ia-reglages" });
  const section = el(
    "section",
    { class: "reglages-section", "aria-labelledby": "titre-ia" },
    el("h3", { id: "titre-ia", texte: "Assistant IA" }),
    racine,
  );

  const enCompte = () => session?.synchro?.lire().mode === "compte";
  const ia = () => iaDe(store.lire().reglages);
  const changer = (suivante) =>
    store.envoyer({ type: A.REGLAGES_MODIFIER, changements: { ia: suivante } });
  const nomFournisseur = (id) => config?.fournisseurs.find((f) => f.id === id)?.nom ?? id;
  const fournisseursOffertes = () =>
    (config?.fournisseurs ?? []).filter((f) => f.actif && FOURNISSEURS.includes(f.id));
  const cleDe = (id) => cles?.find((c) => c.fournisseur === id) ?? null;
  const avecCle = () => (cles ?? []).filter((c) => c.valide !== false).map((c) => c.fournisseur);

  async function charger() {
    if (!enCompte()) return;
    config = await service.config();
    const r = await service.etatCles();
    cles = r.ok ? r.valeur : null;
    erreurCles = r.ok ? null : r.erreur;
    if (r.ok && service.quota) {
      const q = await service.quota();
      quota = q.ok ? q.valeur : null;
    }
    rendre();
  }

  // --- keys ------------------------------------------------------------------------------------
  /** Sheet to type a key: it is sent at once and the field is emptied, whatever happens. */
  async function demanderCle(fournisseur, remplacer) {
    const f = fournisseursOffertes().find((x) => x.id === fournisseur);
    const champ = el("input", {
      id: "ia-cle",
      type: "password",
      name: "cle-assistant",
      autocomplete: "off",
      autocapitalize: "off",
      spellcheck: "false",
      placeholder: "Collez votre clé ici",
    });
    const erreur = el("p", { class: "champ-erreur", role: "alert" });
    const ok = await demander({
      titre: `${remplacer ? "Remplacer" : "Ajouter"} ma clé ${f?.nom ?? fournisseur}`,
      contenu: [
        el(
          "div",
          { class: "champ" },
          el("label", { for: "ia-cle", texte: "Clé API" }),
          champ,
          erreur,
        ),
        f?.lienCle
          ? el("a", {
              href: f.lienCle,
              target: "_blank",
              rel: "noopener",
              texte: "Où trouver ma clé ?",
            })
          : null,
        el("p", {
          class: "reglages-note",
          texte:
            "Votre clé est chiffrée et n'est jamais affichée ni renvoyée à votre appareil. Les appels sont facturés par le fournisseur sur votre compte.",
        }),
      ].filter(Boolean),
      boutons: [
        { libelle: "Annuler", valeur: false },
        { libelle: "Enregistrer", valeur: true, principal: true },
      ],
    });
    const valeur = champ.value.trim();
    champ.value = "";
    if (!ok || !valeur) return;
    toast("Vérification de la clé auprès du fournisseur…", { duree: 3000, cle: "ia-cle" });
    const r = await service.enregistrerCle(fournisseur, valeur);
    if (!r.ok) {
      toast(r.erreur, { type: "erreur", duree: 7000, cle: "ia-cle" });
      return;
    }
    toast(`Clé …${r.valeur.fin} enregistrée`, { duree: 3000, cle: "ia-cle" });
    await charger();
  }

  async function retirerCle(fournisseur) {
    const ok = await demander({
      titre: "Supprimer ma clé",
      message: `Votre clé ${nomFournisseur(fournisseur)} sera supprimée du serveur. Vous pourrez en ajouter une autre.`,
      boutons: [
        { libelle: "Annuler", valeur: false },
        { libelle: "Supprimer", valeur: true, principal: true, danger: true },
      ],
    });
    if (!ok) return;
    const r = await service.supprimerCle(fournisseur);
    if (!r.ok) toast(r.erreur, { type: "erreur", duree: 6000 });
    await charger();
  }

  // --- daily limit ---------------------------------------------------------------------------
  /** The user raises (or lowers) their own daily limit, within the ceiling set by the server. */
  async function changerLimite(champ, bouton) {
    const valeur = Number(champ.value);
    if (!Number.isInteger(valeur) || valeur < 1 || valeur > quota.max) {
      toast(`Entrez un nombre entier entre 1 et ${quota.max}.`, { type: "erreur", duree: 5000 });
      return;
    }
    bouton.disabled = true;
    const r = await service.definirQuota(valeur);
    if (!r.ok) {
      toast(r.erreur, { type: "erreur", duree: 6000 });
      bouton.disabled = false;
      return;
    }
    quota = r.valeur;
    toast(`Limite quotidienne : ${quota.limite} appels`, { duree: 3000, cle: "ia-quota" });
    rendre();
  }

  // --- test ------------------------------------------------------------------------------------
  /** "OK · 820 ms" or the reason, shown in `sortie`. One tiny call, counted in the quota. */
  async function essayer(fournisseur, sortie, bouton) {
    bouton.disabled = true;
    sortie.textContent = "Test en cours…";
    const r = await service.tester(fournisseur);
    bouton.disabled = false;
    sortie.textContent = r.ok
      ? r.valeur.ok
        ? `OK · ${r.valeur.latenceMs} ms`
        : `Réponse reçue en ${r.valeur.latenceMs} ms, mais pas « OK »`
      : r.erreur;
    sortie.classList.toggle("ia-test--erreur", !r.ok);
    if (r.ok) await charger();
  }

  // --- screen ----------------------------------------------------------------------------------
  function rendre() {
    const reglages = ia();
    const compte = enCompte();
    const note = (texte) => el("p", { class: "reglages-note", texte });
    if (!compte) {
      racine.replaceChildren(note(EXPLICATIONS_IA["mode-local"]));
      return;
    }
    const prete = !!config && !!cles;
    const inactif = !reglages.actif;

    const interrupteur = el("input", {
      type: "checkbox",
      role: "switch",
      class: "interrupteur-bouton",
      checked: reglages.actif,
      onchange: (e) => changer(avecActif(ia(), e.currentTarget.checked)),
    });
    const activation = el(
      "label",
      { class: "interrupteur" },
      el(
        "span",
        { class: "interrupteur-texte" },
        el("span", { texte: "Activer l'assistant" }),
        el("span", {
          class: "reglages-note",
          texte: "Propose des tags et une description pour vos sites.",
        }),
      ),
      interrupteur,
    );

    // V4.13: where a question asked in the search bar goes.
    const choixQuestion = el(
      "select",
      {
        class: "galerie-select",
        id: "ia-question-barre",
        onchange: (e) => changer(avecQuestionBarre(ia(), e.currentTarget.value)),
      },
      PREFERENCES_QUESTION.map((p) =>
        el("option", {
          value: p,
          texte: LIBELLES_PREFERENCES[p],
          selected: (reglages.questionBarre ?? "auto") === p,
        }),
      ),
    );
    const questionBarre = reglages.actif
      ? el(
          "div",
          { class: "ia-question-barre" },
          el("label", {
            class: "reglages-note",
            for: "ia-question-barre",
            texte: "Quand je pose une question dans la barre",
          }),
          choixQuestion,
        )
      : null;

    // V4.14: whether the chat may read the sites to answer.
    const choixSitesChat = el(
      "select",
      {
        class: "galerie-select",
        id: "ia-sites-chat",
        onchange: (e) => changer(avecSitesChat(ia(), e.currentTarget.value)),
      },
      MODES_SITES_CHAT.map((m) =>
        el("option", {
          value: m,
          texte: LIBELLES_MODES_SITES_CHAT[m],
          selected: (reglages.sitesChat ?? "auto") === m,
        }),
      ),
    );
    const sitesChat = reglages.actif
      ? el(
          "div",
          { class: "ia-question-barre" },
          el("label", {
            class: "reglages-note",
            for: "ia-sites-chat",
            texte: "Le chat peut consulter mes sites",
          }),
          choixSitesChat,
        )
      : null;

    // What the user should know once, kept together and quiet.
    const mentions = el(
      "ul",
      { class: "ia-mentions" },
      el("li", {
        texte:
          "Les appels sont facturés par Google sur votre compte. Rien n'est envoyé tant que l'assistant est désactivé.",
      }),
      plateforme.capacites?.extraitServeur
        ? el("li", {
            texte:
              "Sur iPhone et iPad, la page est lue par notre serveur pour proposer des tags, sans aucune donnée de connexion.",
          })
        : null,
    );

    const lignesCles = fournisseursOffertes().map((f) => {
      const c = cleDe(f.id);
      return el(
        "li",
        { class: "ia-cle" },
        el(
          "div",
          { class: "ia-cle-texte" },
          el("strong", { texte: f.nom }),
          el(
            "span",
            { class: c?.valide === false ? "ia-cle-etat ia-cle-etat--alerte" : "ia-cle-etat" },
            el("span", {
              class: `ia-pastille${c ? (c.valide === false ? " ia-pastille--alerte" : " ia-pastille--ok") : ""}`,
              "aria-hidden": "true",
            }),
            c
              ? c.valide === false
                ? `Clé …${c.fin} · À vérifier`
                : `Clé …${c.fin} · ajoutée le ${dateHeure(c.ajouteLe ?? Date.now()).slice(0, 10)}`
              : "Pas de clé",
          ),
        ),
        el(
          "div",
          { class: "ia-cle-actions" },
          el("button", {
            type: "button",
            class: "bouton",
            texte: c ? "Remplacer" : "Ajouter ma clé",
            disabled: inactif || !prete,
            onclick: () => demanderCle(f.id, !!c),
          }),
          c
            ? el("button", {
                type: "button",
                class: "lien-discret",
                texte: "Supprimer",
                disabled: inactif,
                "aria-label": `Supprimer ma clé ${f.nom}`,
                onclick: () => retirerCle(f.id),
              })
            : null,
        ),
      );
    });

    // First start: no key yet → two steps.
    const guide =
      reglages.actif && prete && avecCle().length === 0
        ? el(
            "ol",
            { class: "ia-guide" },
            el("li", { texte: "Créez une clé Gemini (lien « Où trouver ma clé ? »)." }),
            el("li", { texte: "Ajoutez-la ci-dessous (« Ajouter ma clé »)." }),
          )
        : null;

    const sortie = el("span", { class: "ia-test", "aria-live": "polite" });
    const testeur = avecCle().length
      ? (() => {
          const bouton = el("button", {
            type: "button",
            class: "bouton",
            texte: "Tester ma clé",
            disabled: inactif,
          });
          bouton.addEventListener("click", () => essayer(avecCle()[0], sortie, bouton));
          return el(
            "div",
            { class: "ia-usage ia-carte-pied" },
            bouton,
            sortie,
            el("span", {
              class: "ia-discret",
              texte: "Clé chiffrée, jamais renvoyée à votre appareil.",
            }),
          );
        })()
      : null;

    // V4.6: complete the sites saved before the AI was on (asks, explains the cost, estimates).
    const service = session?.rattrapage;
    const etatTraitement = service?.lire();
    const enCours = etatTraitement && ["en_cours", "pause"].includes(etatTraitement.etat);
    const completer =
      service && reglages.actif && avecCle().length
        ? el(
            "div",
            { class: "ia-carte ia-carte--action" },
            el(
              "div",
              { class: "ia-carte-texte" },
              el("strong", { texte: "Compléter mes sites" }),
              el("span", {
                class: "ia-discret",
                texte: enCours
                  ? `Traitement en cours : ${etatTraitement.restants.length} sites restants.`
                  : "Génère les tags et descriptions des sites déjà enregistrés. Facturé sur votre clé.",
              }),
            ),
            el("button", {
              type: "button",
              class: "bouton bouton--principal ia-bouton",
              texte: enCours ? "Voir le traitement" : "Compléter",
              onclick: () => ouvrirRattrapage(service, store),
            }),
          )
        : null;

    // Empty slots (null) must not reach replaceChildren: they would be written as "null".
    const carteQuota =
      quota && reglages.actif && avecCle().length
        ? (() => {
            const champ = el("input", {
              id: "ia-limite",
              type: "number",
              class: "ia-limite",
              min: "1",
              max: String(quota.max),
              step: "1",
              inputmode: "numeric",
              value: String(quota.limite),
            });
            const bouton = el("button", {
              type: "button",
              class: "bouton",
              texte: "Enregistrer",
              onclick: () => changerLimite(champ, bouton),
            });
            return el(
              "div",
              { class: "ia-carte ia-carte--action" },
              el(
                "div",
                { class: "ia-carte-texte" },
                el("label", { for: "ia-limite", texte: "Limite quotidienne d'appels" }),
                el("span", {
                  class: "ia-discret",
                  texte: `${quota.utilises} utilisés aujourd'hui sur ${quota.limite} (maximum ${quota.max}). Remis à zéro chaque nuit.`,
                }),
              ),
              el("div", { class: "ia-limite-champ" }, champ, bouton),
            );
          })()
        : null;
    const carteCle = fournisseursOffertes().length
      ? el("div", { class: "ia-carte" }, el("ul", { class: "ia-liste" }, lignesCles), testeur)
      : null;
    racine.replaceChildren(
      ...[
        activation,
        questionBarre,
        sitesChat,
        erreurCles ? el("p", { class: "compte-erreur", role: "alert", texte: erreurCles }) : null,
        !prete && !erreurCles ? note("Chargement…") : null,
        guide,
        carteCle,
        completer,
        carteQuota,
        mentions,
      ].filter(Boolean),
    );
  }

  rendre();
  charger();
  // Follows the settings (another device) and the account state; stops with the panel.
  let vue = JSON.stringify(store.lire().reglages.ia ?? null);
  const arretStore = store.abonner(() => {
    if (!section.isConnected) return arretStore();
    const suivante = JSON.stringify(store.lire().reglages.ia ?? null);
    if (suivante === vue) return;
    vue = suivante;
    rendre();
  });
  const arretSynchro = session?.synchro?.abonner?.(() => {
    if (!section.isConnected) return arretSynchro?.();
    if (enCompte() && !cles) charger();
    else rendre();
  });
  return { section };
}
