import { CONFIRMER_AU_DELA, MESSAGE_MAX, preparerEnvoi } from "../../core/chat.js";
import {
  fusionner,
  idConversation,
  idMessage,
  MESSAGES_CHARGES,
  titreDepuis,
} from "../../core/conversations.js";
import { iaPrete } from "../../core/ia.js";
import { etatModes } from "../../core/modeRecherche.js";
import { el } from "../dom.js";
import { messageErreurIa } from "../messagesIa.js";
import { toast } from "../toast.js";
import { creerBoutonRobot } from "./boutonRobot.js";
import { geometrieFeuille } from "./geometrie.js";
import { creerHistorique } from "./historique.js";
import { creerMessages } from "./messages.js";
import { masquerBlocActions, TEXTE_PROPOSITION_PAR_DEFAUT } from "../../core/outils.js";
import { texteSansReferences, traduireReferences } from "./referencesSites.js";
import { creerSaisie } from "./saisie.js";

/** The streamed answer is rendered again at most this often (V4.12). */
export const INTERVALLE_RENDU_MS = 50;

/**
 * Chat window with the assistant (V4.11): a side panel on a computer or a wide tablet (the
 * grid stays usable on its left, the panel is not modal), a full-screen sheet on a phone. The
 * conversation lives in memory only (lost when the tab closes: the history is V4.15).
 *
 * @param {{
 *   contexteIa: () => Promise<object>,
 *   appeler: (messages: { role: string, texte: string }[]) => Promise<{ texte: string, modele?: string }>,
 *   flux?: (messages: object[], options: { signal: AbortSignal }) => AsyncIterable<
 *     { type: "texte", delta: string } | { type: "fin", modele?: string } | { type: "erreur", code: string }>,
 *   ouvrirReglagesIa?: () => void,
 *   confirmer?: (infos: { titre: string, message: string, valider: string }) => Promise<boolean>,
 *   copier?: (texte: string) => Promise<void>,
 *   notifier?: (message: string) => void,
 *   trouverSite?: (id: string) => object|null,
 *   afficherSite?: (id: string) => void,
 *   proposer?: { carte: (message: object) => HTMLElement|null },
 *   conversations?: {
 *     creer: (c: { id: string, titre: string }) => Promise<unknown>,
 *     ecrireMessage: (convId: string, m: { id: string, texte: string, origine: string|null }) => Promise<unknown>,
 *     ecouter: (convId: string, rappel: (docs: object[]) => void) => () => void,
 *     chargerAvant: (convId: string, avantMs: number) => Promise<{ messages: object[], suite: boolean }>,
 *     supprimerMessage: (convId: string, msgId: string) => Promise<unknown>,
 *     majStatut: (convId: string, msgId: string, statut: string) => Promise<unknown>,
 *     lister: Function, renommer: Function, supprimer: Function,
 *   }|null,
 * }} options
 */
export function creerChat({
  contexteIa,
  appeler,
  flux = async function* (messages) {
    const r = await appeler(messages);
    yield { type: "texte", delta: String(r?.texte ?? "") };
    yield { type: "fin", modele: r?.modele };
  },
  ouvrirReglagesIa = () => {},
  confirmer = async () => true,
  copier = (texte) => navigator.clipboard.writeText(texte),
  notifier = (message) => toast(message),
  trouverSite = () => null,
  afficherSite,
  conversations = null,
  proposer = null,
}) {
  let messages = []; // { id, role, texte, date, etat: "envoi" | "ok" | "erreur", erreur? }
  let enAttente = false;
  let modes = etatModes(null);
  let modele = "";
  let ouvert = false;
  let sequence = 0; // a stopped or replaced answer is ignored when it arrives
  let compteurId = 0;
  let controleur = null; // closes the stream being read (the server then cancels the provider)
  let minuteurRendu = null; // the streamed answer is rendered at most every INTERVALLE_RENDU_MS
  // V4.15 (with `conversations`): the conversation is stored, the panel follows it live.
  let convId = null;
  let arretEcoute = null;
  let derniersDocs = [];
  let peutCharger = false;
  let precedentsCharges = false; // older messages were loaded: the live window no longer decides
  let vueHistorique = false;

  const bouton = creerBoutonRobot({ surClic: () => ouvrir() });
  const titreModele = el("span", { class: "chat-modele" });
  const boutonHistorique = el("button", {
    type: "button",
    class: "chat-entete-bouton chat-historique-bouton",
    texte: "Historique",
    "aria-pressed": "false",
    hidden: !conversations,
    onclick: () => basculerHistorique(),
  });
  const nouvelle = el("button", {
    type: "button",
    class: "chat-entete-bouton",
    texte: "Nouvelle conversation",
    onclick: () => nouvelleConversation(),
  });
  const fermerBouton = el("button", {
    type: "button",
    class: "chat-entete-bouton chat-fermer",
    "aria-label": "Fermer l'assistant",
    texte: "✕",
    onclick: () => fermer(),
  });
  const entete = el(
    "header",
    { class: "chat-entete" },
    el("span", { class: "chat-poignee", "aria-hidden": "true" }),
    el(
      "div",
      { class: "chat-titres" },
      el("h2", { id: "chat-titre", class: "chat-titre", texte: "Assistant" }),
      titreModele,
    ),
    nouvelle,
    boutonHistorique,
    fermerBouton,
  );
  const liste = creerMessages({
    trouverSite,
    afficherSite,
    surChargerPrecedents: () => chargerPrecedents(),
    carteProposition: (m) => proposer?.carte(m) ?? null,
    surReessayer: (m) => demanderReponse(m),
    surReessayerReponse: (m) => {
      const i = messages.indexOf(m);
      const question = messages.slice(0, i).findLast((x) => x.role === "user");
      if (i < 0 || !question) return;
      messages.splice(i, 1);
      // The stopped answer is deleted from the conversation: the history must end with the question.
      if (conversations && convId && m.fsId)
        conversations.supprimerMessage(convId, m.fsId).catch(() => {});
      demanderReponse(question);
    },
    surCopier: (m) =>
      copier(masquerBlocActions(m.texte)).then(
        () => notifier("Réponse copiée"),
        () => notifier("Copie impossible"),
      ),
  });
  const saisie = creerSaisie({
    surEnvoyer: (texte) => envoyer(texte),
    surArreter: () => arreter(),
  });
  const historique = conversations
    ? creerHistorique({
        lister: conversations.lister,
        renommer: conversations.renommer,
        supprimer: conversations.supprimer,
        surOuvrir: (c) => ouvrirConversation(c),
        surSupprimee: (id) => {
          if (id === convId) nouvelleConversation({ sansConfirmer: true });
        },
        surNouvelle: () => nouvelleConversation({ sansConfirmer: true }),
        idOuverte: () => convId,
        notifier: (m) => notifier(m),
      })
    : null;
  const avis = el("div", { class: "chat-avis", hidden: true });
  const panneau = el(
    "section",
    {
      class: "chat",
      role: "dialog",
      "aria-modal": "false",
      "aria-labelledby": "chat-titre",
      hidden: true,
    },
    entete,
    liste.racine,
    ...(historique ? [historique.racine] : []),
    avis,
    saisie.racine,
  );

  function rendre() {
    liste.rendre(messages, {
      enAttente: enAttente && messages.at(-1)?.etat !== "flux",
      peutCharger,
    });
    liste.racine.hidden = vueHistorique;
    saisie.racine.hidden = vueHistorique;
    boutonHistorique.setAttribute("aria-pressed", String(vueHistorique));
    titreModele.textContent = modele;
    titreModele.hidden = !modele;
    nouvelle.disabled = messages.length === 0 && !enAttente;
    saisie.definirAttente(enAttente);
    saisie.activer(modes.envoi);
    // Not ready (no key) or offline: what to do, and the input is off.
    avis.hidden = modes.envoi || !modes.message;
    avis.replaceChildren(
      ...(avis.hidden
        ? []
        : [
            el("p", { texte: modes.message }),
            modes.action === "reglages"
              ? el("button", {
                  type: "button",
                  class: "bouton bouton--principal",
                  texte: "Ouvrir les réglages de l'assistant",
                  onclick: () => {
                    fermer({ rendreLeFocus: false });
                    ouvrirReglagesIa();
                  },
                })
              : null,
          ]),
    );
  }

  /** Reads the AI state: the button is hidden (and the panel closed) when it is unusable. */
  async function actualiser() {
    try {
      modes = etatModes(iaPrete(await contexteIa()));
    } catch {
      modes = etatModes(null);
    }
    bouton.hidden = !modes.afficher || ouvert;
    document.body.classList.toggle("avec-robot", modes.afficher && !ouvert);
    if (!modes.afficher && ouvert) fermer({ rendreLeFocus: false });
    rendre();
  }

  function ouvrir() {
    if (ouvert || !modes.afficher) return;
    ouvert = true;
    panneau.hidden = false;
    document.documentElement.classList.add("chat-ouvert");
    bouton.hidden = true;
    document.body.classList.remove("avec-robot");
    rendre();
    saisie.focus();
    liste.defiler();
    actualiser(); // the key or the connection may have changed
  }

  function fermer({ rendreLeFocus = true } = {}) {
    if (!ouvert) return;
    ouvert = false;
    panneau.hidden = true;
    document.documentElement.classList.remove("chat-ouvert");
    bouton.hidden = !modes.afficher;
    document.body.classList.toggle("avec-robot", modes.afficher);
    if (rendreLeFocus && modes.afficher) bouton.focus();
  }

  const basculer = () => (ouvert ? fermer() : ouvrir());

  async function envoyer(texte) {
    if (!modes.envoi || enAttente) return;
    const message = { id: ++compteurId, role: "user", texte, date: Date.now(), etat: "envoi" };
    messages.push(message);
    await demanderReponse(message);
  }

  /** Renders the streamed answer again, at most once per interval. */
  function programmerRendu(reponse) {
    minuteurRendu ??= setTimeout(() => {
      minuteurRendu = null;
      liste.majReponse(reponse);
    }, INTERVALLE_RENDU_MS);
  }

  function annulerRendu() {
    clearTimeout(minuteurRendu);
    minuteurRendu = null;
  }

  /**
   * A question from elsewhere (the search bar, V4.13): the panel opens and the question joins
   * the current conversation (never a new one). `sites`: the first sites found, shown in a card.
   * When an answer is being written or the assistant is not ready, the question is only put in
   * the field, to be sent by the user.
   */
  async function poserQuestion(texte, { origine = null, sites = [] } = {}) {
    const question = String(texte ?? "")
      .trim()
      .slice(0, MESSAGE_MAX);
    if (!question) return false;
    // The state read when the page opened may be old (settings and keys arrive later): the
    // search bar reads it again when it gets the focus, the chat does the same here.
    await actualiser();
    if (!modes.afficher) return null; // not ready, offline, or the assistant is off
    ouvrir();
    if (!modes.envoi || enAttente) {
      saisie.remplir(question);
      return false;
    }
    const message = {
      id: ++compteurId,
      role: "user",
      texte: question,
      date: Date.now(),
      etat: "envoi",
      ...(origine ? { origine } : {}),
      ...(sites.length ? { sites: sites.slice(0, 3) } : {}),
    };
    messages.push(message);
    demanderReponse(message);
    return true;
  }

  async function demanderReponse(message) {
    if (!modes.envoi || enAttente) return;
    message.etat = "envoi";
    delete message.erreur;
    enAttente = true;
    const numero = ++sequence;
    const mien = new AbortController();
    controleur = mien;
    let reponse = null; // the assistant message, created with the first chunk of text
    let echec = null; // an error code (sent by the server) or an Error (network)
    rendre();
    try {
      if (conversations) {
        // V4.15: the user's message is stored first (the server reads the history there).
        if (!message.ecrit) {
          try {
            await assurerConversation(message.texte);
            message.fsId ??= idMessage();
            await conversations.ecrireMessage(convId, {
              id: message.fsId,
              texte: message.texte,
              origine: message.origine ?? null,
            });
            message.ecrit = true;
          } catch (e) {
            if (numero !== sequence) return;
            delete message.fsId; // not written: it must not be taken for a stored one
            enAttente = false;
            controleur = null;
            message.etat = "erreur";
            message.erreur = messageErreurIa(e);
            rendre();
            return;
          }
        }
        if (numero !== sequence) return;
      }
      // Memory mode: a past answer goes back with the titles of the sites it cited. With a
      // stored conversation the server builds the history itself.
      const entree = conversations
        ? convId
        : preparerEnvoi(
            messages.map((m) =>
              m.role === "assistant"
                ? { ...m, texte: texteSansReferences(m.texte, trouverSite) }
                : m,
            ),
          ).messages;
      for await (const e of flux(entree, { signal: mien.signal })) {
        if (numero !== sequence) return;
        if (e.type === "texte" && e.delta) {
          if (reponse) {
            reponse.texte += e.delta;
            programmerRendu(reponse);
          } else {
            message.etat = "ok";
            reponse = {
              id: ++compteurId,
              role: "assistant",
              texte: e.delta,
              date: Date.now(),
              etat: "flux",
            };
            messages.push(reponse);
            rendre();
          }
        } else if (e.type === "enregistre") {
          if (reponse && e.messageId) reponse.fsId = e.messageId;
        } else if (e.type === "fin") {
          if (e.modele) modele = e.modele;
          if (reponse && e.messageId) reponse.fsId = e.messageId;
          // The table "s12 → real id" arrives with the end: the text keeps the real ids.
          // V4.16: the ```actions block leaves the text, the validated proposal replaces it.
          if (reponse) {
            reponse.texte = traduireReferences(masquerBlocActions(reponse.texte), e.sites);
            if (e.proposition) {
              if (!reponse.texte.trim()) reponse.texte = TEXTE_PROPOSITION_PAR_DEFAUT;
              reponse.proposition = e.proposition;
              reponse.statutProposition = "en_attente";
            }
            if (e.consulte) reponse.consulte = true;
          }
        } else if (e.type === "erreur") echec = e.code;
      }
    } catch (e) {
      if (numero !== sequence) return;
      echec = e ?? "erreur";
    }
    if (numero !== sequence) return;
    annulerRendu();
    controleur = null;
    enAttente = false;
    if (reponse) {
      reponse.etat = "ok";
      // Not stored by the server (as far as we know): replaced by the stored one if it comes.
      if (conversations && !reponse.fsId) reponse.provisoire = true;
      if (echec) {
        reponse.interrompu = true;
        reponse.echec = true;
      }
    } else {
      message.etat = "erreur";
      message.erreur = messageErreurIa(
        typeof echec === "string" ? { details: { code: echec } } : echec,
      );
    }
    rendre();
    appliquerDocs(); // what another device wrote while the answer was received
    if (ouvert) saisie.focus();
  }

  // --- V4.15: stored conversations ----------------------------------------------------------

  /** The conversation is created with the first message (title: its first words). */
  async function assurerConversation(texte) {
    if (convId) return;
    const id = idConversation();
    await conversations.creer({ id, titre: titreDepuis(texte) });
    convId = id;
    ecouter();
  }

  function arreterEcoute() {
    arretEcoute?.();
    arretEcoute = null;
    derniersDocs = [];
  }

  function ecouter() {
    arreterEcoute();
    const id = convId;
    arretEcoute = conversations.ecouter(id, (docs) => {
      if (id !== convId) return;
      derniersDocs = docs;
      if (!precedentsCharges) peutCharger = docs.length >= MESSAGES_CHARGES;
      appliquerDocs();
    });
  }

  /** Merges what is stored with what the panel shows (another device, opening). */
  function appliquerDocs() {
    if (!conversations || !derniersDocs.length) return;
    const avant = messages;
    messages = fusionner(messages, derniersDocs, {
      nouvelId: () => ++compteurId,
      accepterAssistant: !enAttente, // while receiving, the answer is adopted by its id
    });
    if (messages !== avant) rendre();
  }

  async function chargerPrecedents() {
    const plusAncien = messages.find((m) => m.fsId)?.date;
    if (!convId || !plusAncien) return;
    try {
      const r = await conversations.chargerAvant(convId, plusAncien);
      messages = fusionner(messages, r.messages, { nouvelId: () => ++compteurId });
      peutCharger = r.suite;
      precedentsCharges = true;
    } catch {
      notifier("Messages précédents indisponibles");
    }
    rendre();
  }

  /** The status of a proposal (applied, ignored): kept in the conversation, shown everywhere. */
  function majStatutProposition(message, statut) {
    message.statutProposition = statut;
    if (conversations && convId && message.fsId)
      conversations
        .majStatut(convId, message.fsId, statut)
        .catch(() => notifier("Statut de la proposition non enregistré"));
    rendre();
  }

  function basculerHistorique() {
    vueHistorique = !vueHistorique;
    if (vueHistorique) historique.ouvrir();
    else historique.fermer();
    rendre();
  }

  /** Opens a conversation of the list: its last 50 messages, then the live view. */
  function ouvrirConversation(c) {
    if (enAttente) return notifier("Attendez la fin de la réponse en cours.");
    sequence++;
    annulerRendu();
    messages = [];
    peutCharger = false;
    precedentsCharges = false;
    convId = c.id;
    vueHistorique = false;
    historique.fermer();
    ecouter();
    rendre();
    saisie.focus();
  }

  /**
   * Stops the answer. A text already received stays, marked "(interrompu)", and the stream is
   * closed (the server cancels the provider); with nothing received yet, the message can be
   * sent again.
   */
  function arreter() {
    if (!enAttente) return;
    sequence++;
    controleur?.abort();
    controleur = null;
    annulerRendu();
    enAttente = false;
    const dernier = messages.at(-1);
    if (dernier?.etat === "flux") {
      dernier.etat = "ok";
      dernier.interrompu = true;
      // The server keeps the text it had: the stored message will replace this one.
      if (conversations && !dernier.fsId) dernier.provisoire = true;
    } else if (dernier?.etat === "envoi") {
      dernier.etat = "erreur";
      dernier.erreur = "arrêté.";
    }
    rendre();
    saisie.focus();
  }

  async function nouvelleConversation({ sansConfirmer = false } = {}) {
    if (!sansConfirmer && !conversations && messages.length > CONFIRMER_AU_DELA) {
      const ok = await confirmer({
        titre: "Nouvelle conversation ?",
        message: "La conversation en cours sera effacée.",
        valider: "Nouvelle conversation",
      });
      if (!ok) return;
    }
    sequence++;
    controleur?.abort();
    controleur = null;
    annulerRendu();
    messages = [];
    enAttente = false;
    // Stored conversations are kept (the history has them): a new one only starts empty.
    convId = null;
    peutCharger = false;
    precedentsCharges = false;
    vueHistorique = false;
    historique?.fermer();
    arreterEcoute();
    rendre();
    saisie.focus();
  }

  panneau.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || e.defaultPrevented) return;
    e.preventDefault();
    e.stopPropagation();
    fermer();
  });

  // Phone: a swipe down on the header closes the sheet.
  let departY = null;
  entete.addEventListener("touchstart", (e) => (departY = e.touches[0].clientY), { passive: true });
  entete.addEventListener(
    "touchend",
    (e) => {
      if (departY !== null && e.changedTouches[0].clientY - departY > 80) fermer();
      departY = null;
    },
    { passive: true },
  );

  // The keyboard of a phone must not hide the input: follow the visible height.
  // V4.18: the sheet follows the visible area (height and scroll offset of the visual viewport),
  // also when the keyboard bar of an iPad changes the height.
  const suivreClavier = () => {
    const v = globalThis.visualViewport;
    if (!v) return;
    const g = geometrieFeuille({
      hauteurVisible: v.height,
      decalageHaut: v.offsetTop,
      hauteurFenetre: globalThis.innerHeight,
    });
    panneau.style.setProperty("--chat-hauteur", `${g.hauteur}px`);
    panneau.style.setProperty("--chat-decalage", `${g.decalage}px`);
  };
  globalThis.visualViewport?.addEventListener("resize", suivreClavier);
  globalThis.visualViewport?.addEventListener("scroll", suivreClavier);

  // Ctrl/Cmd+I opens or closes the assistant (when it is available).
  document.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() !== "i" || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
    if (!modes.afficher || document.querySelector("dialog[open]:modal")) return;
    e.preventDefault();
    basculer();
  });
  addEventListener("online", actualiser);
  addEventListener("offline", actualiser);
  actualiser();

  return {
    bouton,
    panneau,
    ouvrir,
    fermer,
    basculer,
    actualiser,
    poserQuestion,
    estOuvert: () => ouvert,
    idConversation: () => convId,
    majStatutProposition,
  };
}
