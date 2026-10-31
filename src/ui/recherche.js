import { decouperRequete, indexer, rechercher, suggererTags } from "../core/recherche.js";
import { normaliserUrl } from "../core/url.js";
import { plateforme } from "../platform/index.js";
import { el } from "./dom.js";
import { creerIcone, ouvrirSite, sitesDansNouvelOnglet } from "./tuile.js";
import { creerIconeDossier } from "./tuileDossier.js";
import { entrees } from "./entrees.js";
import { exemplesQuestions } from "../core/exemplesQuestions.js";
import {
  QUESTION_MAX,
  apresSaisie,
  autreMode,
  compteurVisible,
  etatModes,
  modeApresTouche,
} from "../core/modeRecherche.js";
import { iaDe, iaPrete } from "../core/ia.js";
import { decider, intentionValide } from "../core/routageQuestion.js";
import { creerSelecteurMode } from "./selecteurMode.js";
import { toast } from "./toast.js";
import { messageErreurIa } from "./messagesIa.js";

const CHAMPS_SAISIE = "input, textarea, select, [contenteditable]";

/** Title with <mark> around the matched ranges, built from text nodes only. */
function titreSurligne(titre, plages) {
  const span = el("span", { class: "resultat-titre" });
  let pos = 0;
  for (const [debut, fin] of plages) {
    if (debut > pos) span.append(document.createTextNode(titre.slice(pos, debut)));
    span.append(el("mark", { texte: titre.slice(debut, fin) }));
    pos = fin;
  }
  if (pos < titre.length) span.append(document.createTextNode(titre.slice(pos)));
  return span;
}

/** Why a site matched (tag or description), with <mark> on the word; text nodes only. */
function raisonSurlignee(raison) {
  const span = el("span", { class: "resultat-raison", title: raison.texte });
  const { texte, plages } = raison;
  if (raison.champ === "tag") span.append(document.createTextNode("tag : "));
  let pos = 0;
  for (const [debut, fin] of plages) {
    if (debut > pos) span.append(document.createTextNode(texte.slice(pos, debut)));
    span.append(el("mark", { texte: texte.slice(debut, fin) }));
    pos = fin;
  }
  if (pos < texte.length) span.append(document.createTextNode(texte.slice(pos)));
  return span;
}

/** Last word of the field when it starts with "#" (a tag being typed), without the "#". */
function tagEnCours(texte) {
  const m = texte.match(/(?:^|\s)#(\S*)$/);
  return m ? m[1] : null;
}

/** Text typed that looks like an address ("exemple.com/page"), or null. */
function adresseTapee(texte) {
  const t = texte.trim();
  if (!t || /\s/.test(t) || !t.includes(".")) return null;
  const r = normaliserUrl(t);
  return r.ok ? r.url : null;
}

const PLACEHOLDERS = {
  rechercher: "Rechercher dans vos sites…",
  demander: "Posez une question… (ex. : l'outil pour retoucher des photos)",
};

/**
 * Search bar above the grid (combobox + listbox). Instant, no network: the web search only
 * happens on Enter when nothing local fits, with the user's default engine.
 */
export function creerRecherche(
  store,
  {
    ouvrirDossier,
    contexteIa = null,
    ouvrirReglagesIa = () => {},
    demanderIa = null, // async (question) => { intention, resultats: [{ id, score }] } (V4.9)
    poserAuChat = null, // (question, { origine, sites }) => void: the assistant's chat (V4.13)
  },
) {
  const champ = el("input", {
    type: "search",
    class: "recherche-champ",
    id: "recherche",
    placeholder: "Rechercher dans vos sites…",
    autocomplete: "off",
    spellcheck: "false",
    role: "combobox",
    "aria-expanded": "false",
    "aria-controls": "recherche-resultats",
    "aria-autocomplete": "list",
    "aria-label": "Rechercher dans vos sites",
  });
  // V4.8: "rechercher" (local, instant) or "demander" (a question for the AI). Never kept
  // between two tabs: one always starts in "rechercher".
  let mode = "rechercher";
  let modes = etatModes(null); // what the AI state allows
  let clavier = false;
  let precedent = "";
  const selecteur = creerSelecteurMode({ surChoix: (m) => changerMode(m) });
  const compteur = el("span", { class: "recherche-compteur", "aria-hidden": "true", hidden: true });
  // The "/" shortcut needs a keyboard: the hint shows while one is probable (V3.9), and goes
  // away when it is unplugged (a bare tablet, a phone).
  const placeholder = () => {
    champ.placeholder = PLACEHOLDERS[mode] + (clavier && mode === "rechercher" ? " (/)" : "");
  };
  entrees().ecouter((e) => {
    clavier = e.clavier;
    placeholder();
  });
  const liste = el("ul", {
    class: "recherche-resultats",
    id: "recherche-resultats",
    role: "listbox",
    "aria-label": "Résultats",
    hidden: true,
  });
  const etat = el("p", { class: "visuellement-cache", "aria-live": "polite" });
  const racine = el(
    "div",
    { class: "recherche", role: "search" },
    el("span", { class: "recherche-loupe", "aria-hidden": "true" }),
    selecteur.racine,
    champ,
    compteur,
    liste,
    etat,
  );

  let options = []; // { type: "site" | "dossier" | "adresse" | "web", ... }
  let actif = 0;

  const choisirActif = (i) => {
    if (options.length === 0) return;
    actif = (i + options.length) % options.length;
    for (const [j, li] of [...liste.querySelectorAll('[role="option"]')].entries()) {
      li.setAttribute("aria-selected", String(j === actif));
      if (j === actif) li.scrollIntoView({ block: "nearest" });
    }
    champ.setAttribute("aria-activedescendant", `resultat-${actif}`);
  };

  const fermerListe = () => {
    liste.hidden = true;
    champ.setAttribute("aria-expanded", "false");
    champ.removeAttribute("aria-activedescendant");
  };

  const rendre = () => (mode === "demander" ? rendreQuestion() : rendreRecherche());

  /** What each row shows (icon, title…): one builder for the search and the question modes. */
  function contenuOption(o) {
    const symbole = (texte) =>
      el("span", { class: "resultat-icone resultat-icone--symbole", texte });
    const titre = (texte) => el("span", { class: "resultat-titre", texte });
    switch (o.type) {
      case "adresse":
        return [symbole("↗"), titre(`Aller sur ${o.url.replace(/^https?:\/\//, "")}`)];
      case "tag":
        return [symbole("#"), titre(o.tag)];
      case "web":
        return [symbole("⌕"), titre(`Rechercher « ${o.texte} » sur le web`)];
      case "exemple":
        return [symbole("✦"), titre(o.texte)];
      case "envoyer":
        return [symbole("↵"), titre(`Envoyer : « ${o.texte} »`)];
      case "chat":
        return [symbole("✦"), titre("Demander à l'assistant à la place")];
      case "message":
        return [symbole("!"), titre(o.texte)];
      case "attente":
        return [symbole("…"), titre(o.texte)];
      case "annuler":
        return [symbole("✕"), titre("Annuler")];
      default: {
        const { entree, plages, raison } = o.resultat;
        return [
          el(
            "span",
            { class: "resultat-icone" },
            entree.type === "dossier"
              ? creerIconeDossier(entree.element)
              : creerIcone(entree.element),
          ),
          titreSurligne(entree.titre, plages),
          entree.domaine ? el("span", { class: "resultat-domaine", texte: entree.domaine }) : null,
          entree.chemin.length
            ? el("span", { class: "resultat-chemin", texte: entree.cheminTexte })
            : null,
          raison && ["tag", "description", "assistant"].includes(raison.champ) && raison.texte
            ? raisonSurlignee(raison)
            : null,
        ];
      }
    }
  }

  /** "GitHub, dépôt de code" for an assistant result with a reason; null otherwise. */
  const libelleAccessible = (o) => {
    const r = o.resultat?.raison;
    return r?.champ === "assistant" ? `${o.resultat.entree.titre}, ${r.texte}` : null;
  };

  /** The list is built from `options`, with an optional heading that is not an option. */
  function monterListe(entete = null) {
    liste.replaceChildren(
      ...(entete
        ? [el("li", { class: "resultat-entete", role: "presentation", texte: entete })]
        : []),
      ...options.map((o, i) => {
        const inerte = o.type === "attente" || (o.type === "message" && !o.action);
        const li = el(
          "li",
          {
            id: `resultat-${i}`,
            class: `resultat resultat--${o.type}`,
            role: "option",
            "aria-selected": "false",
            "aria-disabled": inerte ? "true" : null,
            // The reason is part of the option's name for screen readers (V4.10).
            "aria-label": libelleAccessible(o),
          },
          ...contenuOption(o),
        );
        li.addEventListener("mousedown", (e) => e.preventDefault()); // keep the focus in the field
        li.addEventListener("click", (e) => valider(i, { nouvelOnglet: e.ctrlKey || e.metaKey }));
        li.addEventListener("auxclick", (e) => {
          if (e.button === 1) valider(i, { nouvelOnglet: true });
        });
        return li;
      }),
    );
    liste.hidden = options.length === 0;
    champ.setAttribute("aria-expanded", String(options.length > 0));
    if (options.length) choisirActif(0);
  }

  // V4.9: the last question of the session and what the assistant answered (nothing is kept
  // after the tab is closed). `etat`: "chargement" | "resultats" | "aucun" | "erreur".
  let assistant = null;
  let sequence = 0; // a cancelled or replaced question ignores its late answer

  /** Rows of the assistant's answer, rebuilt from the current grid (a deleted site is dropped). */
  function vueAssistant() {
    const grille = store.lire().grille;
    const index = indexer(grille);
    const web = { type: "web", texte: assistant.texte };
    // V4.13: the user can always send the question to the chat instead.
    const chat = poserAuChat && !assistant.sansChat ? [{ type: "chat" }] : [];
    const sites = (ids) =>
      ids
        .map((id) => index.find((e) => e.id === id && e.type === "site"))
        .filter(Boolean)
        .map((entree) => ({
          type: "site",
          resultat: {
            entree,
            plages: [],
            // V4.10: the reason given by the assistant, shown under the title.
            raison: assistant.raisons?.[entree.id]
              ? { champ: "assistant", texte: assistant.raisons[entree.id], plages: [] }
              : null,
          },
        }));
    if (assistant.etat === "chargement")
      return {
        options: [{ type: "attente", texte: "Recherche dans vos sites…" }, { type: "annuler" }],
      };
    if (assistant.etat === "resultats") {
      const trouves = sites(assistant.ids);
      if (trouves.length)
        return { entete: "Résultats de l'assistant", options: [...trouves, ...chat, web] };
    }
    if (assistant.etat === "erreur") {
      const locaux = rechercher(index, assistant.texte).map((resultat) => ({
        type: resultat.entree.type,
        resultat,
      }));
      return {
        entete: locaux.length ? "Voici les résultats de la recherche simple" : null,
        options: [{ type: "message", texte: assistant.message }, ...locaux, ...chat, web],
      };
    }
    return {
      options: [{ type: "message", texte: "Aucun de vos sites ne correspond" }, ...chat, web],
    };
  }

  /** Question mode: examples while empty, then "Envoyer"; no instant results while typing. */
  const rendreQuestion = () => {
    const texte = champ.value.trim();
    options = [];
    let entete = null;
    if (!modes.envoi) {
      if (modes.message)
        options.push({ type: "message", texte: modes.message, action: modes.action });
    } else if (
      assistant &&
      (texte === assistant.texte || (!texte && assistant.etat !== "chargement"))
    ) {
      const vue = vueAssistant();
      options = vue.options;
      entete = !texte ? `Dernière question : « ${assistant.texte} »` : (vue.entete ?? null);
      const n = options.filter((o) => o.resultat).length;
      etat.textContent = n ? `${n} résultat${n > 1 ? "s" : ""}` : "";
    } else if (!texte) {
      for (const q of exemplesQuestions(store.lire().grille))
        options.push({ type: "exemple", texte: q });
    } else options.push({ type: "envoyer", texte });
    monterListe(entete);
    mettreAJourCompteur();
  };

  const mettreAJourCompteur = () => {
    const n = [...champ.value].length;
    const voir = mode === "demander" && compteurVisible(n);
    compteur.hidden = !voir;
    if (voir) compteur.textContent = `${n}/${QUESTION_MAX}`;
  };

  const rendreRecherche = () => {
    const texte = champ.value;
    if (!texte.trim()) {
      options = [];
      liste.replaceChildren();
      fermerListe();
      return;
    }
    const grille = store.lire().grille;
    const resultats = rechercher(indexer(grille), texte);
    options = [];
    const adresse = adresseTapee(texte);
    if (adresse) options.push({ type: "adresse", url: adresse });
    for (const r of resultats) options.push({ type: r.entree.type, resultat: r });
    // "#": the tags to pick from (most used first, completed as you type).
    const debutTag = tagEnCours(texte);
    if (debutTag !== null) {
      for (const tag of suggererTags(grille, debutTag)) options.push({ type: "tag", tag });
    }
    const filtreSeul = decouperRequete(texte).mots.length === 0;
    if (!(debutTag === "" && filtreSeul && !resultats.length))
      options.push({ type: "web", texte: texte.trim() });

    // The first result is preselected (the address proposal comes first when typed).
    monterListe();
    const n = options.filter((o) => o.resultat).length;
    const nTags = options.filter((o) => o.type === "tag").length;
    if (n) etat.textContent = `${n} résultat${n > 1 ? "s" : ""}`;
    else if (nTags)
      etat.textContent = `${nTags} tag${nTags > 1 ? "s" : ""} proposé${nTags > 1 ? "s" : ""}`;
    else etat.textContent = "Aucun site trouvé, Entrée pour chercher sur le web";
  };

  const ouvrirUrl = (url, nouvelOnglet) => ouvrirSite(url, { nouvelOnglet });

  /** Web search: a new tab when asked (Ctrl, middle click) or chosen in the settings. */
  const chercherSurLeWeb = (texte, nouvelOnglet) =>
    plateforme.rechercherSurLeWeb(texte, {
      nouvelOnglet: nouvelOnglet || !!store.lire().reglages.rechercheNouvelOnglet,
    });

  const TYPES_QUESTION = new Set(["exemple", "envoyer", "message", "attente", "annuler", "chat"]);

  function valider(i, { nouvelOnglet = false } = {}) {
    const o = options[i];
    if (mode === "demander" && (!o || TYPES_QUESTION.has(o.type))) {
      validerQuestion(o);
      return;
    }
    if (!o) {
      if (champ.value.trim()) chercherSurLeWeb(champ.value.trim(), nouvelOnglet);
      return;
    }
    if (o.type === "tag") {
      champ.value = champ.value.replace(/#\S*$/, `#${o.tag} `);
      champ.focus();
      rendre();
    } else if (o.type === "adresse") ouvrirUrl(o.url, nouvelOnglet);
    else if (o.type === "web") chercherSurLeWeb(o.texte, nouvelOnglet);
    else if (o.type === "site")
      ouvrirUrl(o.resultat.entree.element.url, nouvelOnglet || sitesDansNouvelOnglet());
    else if (o.type === "dossier") {
      fermerListe();
      ouvrirDossier(o.resultat.entree.id);
    }
  }

  function validerQuestion(o) {
    if (!modes.envoi) {
      if (o?.action === "reglages" || (!o && modes.action === "reglages")) {
        fermerListe();
        ouvrirReglagesIa();
      }
      return;
    }
    if (o?.type === "chat") {
      if (assistant?.texte) versLeChat(assistant.texte);
      return;
    }
    if (o?.type === "exemple") {
      champ.value = o.texte;
      precedent = champ.value;
      champ.focus();
      rendre();
      return;
    }
    if (o?.type === "annuler") {
      sequence++; // the late answer is ignored
      assistant = null;
      rendre();
      return;
    }
    if (o?.type === "attente" || o?.type === "message") return;
    const question = (o?.texte ?? champ.value).trim();
    if (question) poserQuestion(question);
  }

  /** The question leaves the bar for the chat (one conversation, V4.13). */
  function versLeChat(question, sites = []) {
    sequence++; // a late answer of the search is ignored
    assistant = null;
    champ.value = "";
    precedent = "";
    fermerListe();
    changerMode("rechercher", { annoncer: false });
    mettreAJourCompteur();
    // null: the chat cannot open (assistant not ready): the question goes back in the bar.
    if (poserAuChat(question, { origine: "barre", sites }) === null) {
      champ.value = question;
      precedent = question;
      changerMode("demander", { annoncer: false });
      toast("L'assistant n'est pas disponible pour l'instant.");
    }
  }

  /**
   * Enter in the question mode. The local rules decide first (routageQuestion.js): a general
   * question goes straight to the chat, with no call to the search. Otherwise one call to the
   * smart search, whose answer says what the user wanted: sites, a question or both.
   */
  async function poserQuestion(question) {
    const decision = poserAuChat
      ? decider(question, {
          preference: iaDe(store.lire().reglages).questionBarre,
          index: indexer(store.lire().grille),
        })
      : { vers: "site" };
    if (decision.vers === "chat") {
      versLeChat(question);
      return;
    }
    if (!demanderIa) {
      toast("Bientôt disponible");
      return;
    }
    const numero = ++sequence;
    assistant = { texte: question, etat: "chargement" };
    rendre();
    try {
      const reponse = await demanderIa(question);
      if (numero !== sequence) return;
      // A question the local rules already took for a site search stays one.
      const intention = decision.vers === "site" ? "site" : intentionValide(reponse?.intention);
      if (intention === "question" && poserAuChat) {
        versLeChat(question);
        return;
      }
      const ids = (reponse?.resultats ?? []).map((r) => r.id);
      const raisons = Object.fromEntries(
        (reponse?.resultats ?? []).filter((r) => r.raison).map((r) => [r.id, String(r.raison)]),
      );
      assistant = {
        texte: question,
        etat: ids.length ? "resultats" : "aucun",
        ids,
        raisons,
        sansChat: intention === "les_deux",
      };
      if (intention === "les_deux" && poserAuChat) {
        const index = indexer(store.lire().grille);
        const sites = ids
          .map((id) => index.find((e) => e.id === id && e.type === "site"))
          .filter(Boolean)
          .slice(0, 3)
          .map((e) => ({ titre: e.titre, url: e.element.url }));
        poserAuChat(question, { origine: "barre", sites });
      }
    } catch (e) {
      if (numero !== sequence) return;
      assistant = { texte: question, etat: "erreur", message: messageErreurIa(e) };
    }
    if (mode === "demander") rendre();
  }

  /** Changes the mode (click, "?", Tab, Ctrl+J, Backspace) and says so to screen readers. */
  function changerMode(m, { annoncer = true } = {}) {
    if (m === mode || (m === "demander" && !modes.afficher)) return;
    mode = m;
    const question = mode === "demander";
    racine.classList.toggle("recherche--demander", question);
    selecteur.definir(mode);
    placeholder();
    const libelle = question ? "Poser une question à l'assistant" : "Rechercher dans vos sites";
    champ.setAttribute("aria-label", libelle);
    champ.setAttribute("enterkeyhint", question ? "send" : "search");
    if (question) champ.setAttribute("maxlength", String(QUESTION_MAX));
    else champ.removeAttribute("maxlength");
    if (annoncer) etat.textContent = question ? "Mode question" : "Mode recherche";
    champ.focus();
    rendre();
  }

  /** Reads the AI state: the selector is hidden (and the bar back in "rechercher") if unusable. */
  async function actualiserIa() {
    if (!contexteIa) return;
    try {
      modes = etatModes(iaPrete(await contexteIa()));
    } catch {
      modes = etatModes(null);
    }
    selecteur.afficher(modes.afficher);
    racine.classList.toggle("recherche--modes", modes.afficher);
    if (!modes.afficher && mode === "demander") changerMode("rechercher", { annoncer: false });
    else if (mode === "demander") rendre();
  }
  selecteur.definir(mode);
  champ.setAttribute("enterkeyhint", "search");
  actualiserIa();
  addEventListener("online", actualiserIa);
  addEventListener("offline", actualiserIa);

  champ.addEventListener("input", () => {
    const r = apresSaisie({ mode, avant: precedent, apres: champ.value, actif: modes.afficher });
    precedent = r.valeur;
    if (r.valeur !== champ.value) champ.value = r.valeur;
    if (r.mode !== mode) changerMode(r.mode);
    else rendre();
  });
  champ.addEventListener("focus", () => {
    actualiserIa();
    if (mode === "demander" || champ.value.trim()) rendre();
  });
  champ.addEventListener("keydown", (e) => {
    // Only the browser knows if a key belongs to a composition (accent dead key, IME). A flag
    // kept by hand could stay set when a composition is cut short, and Enter did nothing.
    if (e.isComposing || e.keyCode === 229) return;
    const nouveau = modeApresTouche({
      mode,
      touche: e.key,
      valeurVide: champ.value === "",
      ctrl: e.ctrlKey || e.metaKey,
      maj: e.shiftKey,
      actif: modes.afficher,
    });
    if (nouveau && e.key !== "Backspace") e.preventDefault();
    if (nouveau) {
      changerMode(nouveau);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (liste.hidden) rendre();
      else choisirActif(actif + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      choisirActif(actif - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      valider(liste.hidden ? -1 : actif, { nouvelOnglet: e.ctrlKey || e.metaKey });
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (champ.value) {
        champ.value = "";
        precedent = "";
        rendre();
      } else {
        fermerListe();
        champ.blur();
      }
    }
  });
  // Click outside closes the list without clearing the field.
  document.addEventListener("pointerdown", (e) => {
    if (!racine.contains(e.target)) fermerListe();
  });
  // Results follow the grid while the list is open (other tab, edit…).
  store.abonner(() => {
    if (!liste.hidden) rendre();
  });

  /** "/" or Ctrl/Cmd+K anywhere (not while typing in a field) puts the focus in the search. */
  document.addEventListener("keydown", (e) => {
    const raccourci =
      (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey) ||
      (e.key.toLowerCase() === "k" && (e.ctrlKey || e.metaKey) && !e.altKey);
    if (
      !raccourci ||
      e.target.closest?.(CHAMPS_SAISIE) ||
      document.querySelector("dialog[open]:modal") ||
      racine.offsetParent === null // hidden by the "Barre de recherche" setting (V4.5.3)
    )
      return;
    e.preventDefault();
    champ.focus();
    champ.select();
  });

  /** Ctrl/Cmd+J: switches the mode from anywhere on the page. */
  document.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() !== "j" || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
    if (
      !modes.afficher ||
      racine.offsetParent === null ||
      document.querySelector("dialog[open]:modal")
    )
      return;
    if (e.target === champ) return; // handled by the field itself
    e.preventDefault();
    changerMode(autreMode(mode));
  });

  return { racine, champ };
}
