import { CONFIRMER_AU_DELA, preparerEnvoi } from "../../core/chat.js";
import { iaPrete } from "../../core/ia.js";
import { etatModes } from "../../core/modeRecherche.js";
import { el } from "../dom.js";
import { messageErreurIa } from "../messagesIa.js";
import { toast } from "../toast.js";
import { creerBoutonRobot } from "./boutonRobot.js";
import { creerMessages } from "./messages.js";
import { creerSaisie } from "./saisie.js";

/**
 * Chat window with the assistant (V4.11): a side panel on a computer or a wide tablet (the
 * grid stays usable on its left, the panel is not modal), a full-screen sheet on a phone. The
 * conversation lives in memory only (lost when the tab closes: the history is V4.15).
 *
 * @param {{
 *   contexteIa: () => Promise<object>,
 *   appeler: (messages: { role: string, texte: string }[]) => Promise<{ texte: string, modele?: string }>,
 *   ouvrirReglagesIa?: () => void,
 *   confirmer?: (infos: { titre: string, message: string, valider: string }) => Promise<boolean>,
 *   copier?: (texte: string) => Promise<void>,
 *   notifier?: (message: string) => void,
 * }} options
 */
export function creerChat({
  contexteIa,
  appeler,
  ouvrirReglagesIa = () => {},
  confirmer = async () => true,
  copier = (texte) => navigator.clipboard.writeText(texte),
  notifier = (message) => toast(message),
}) {
  let messages = []; // { id, role, texte, date, etat: "envoi" | "ok" | "erreur", erreur? }
  let enAttente = false;
  let modes = etatModes(null);
  let modele = "";
  let ouvert = false;
  let sequence = 0; // a stopped or replaced answer is ignored when it arrives
  let compteurId = 0;

  const bouton = creerBoutonRobot({ surClic: () => ouvrir() });
  const titreModele = el("span", { class: "chat-modele" });
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
    fermerBouton,
  );
  const liste = creerMessages({
    surReessayer: (m) => demanderReponse(m),
    surCopier: (m) =>
      copier(m.texte).then(
        () => notifier("Réponse copiée"),
        () => notifier("Copie impossible"),
      ),
  });
  const saisie = creerSaisie({
    surEnvoyer: (texte) => envoyer(texte),
    surArreter: () => arreter(),
  });
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
    avis,
    saisie.racine,
  );

  function rendre() {
    liste.rendre(messages, { enAttente });
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

  async function demanderReponse(message) {
    if (!modes.envoi || enAttente) return;
    message.etat = "envoi";
    delete message.erreur;
    enAttente = true;
    const numero = ++sequence;
    rendre();
    try {
      const { messages: envoyes } = preparerEnvoi(messages);
      const r = await appeler(envoyes);
      if (numero !== sequence) return;
      message.etat = "ok";
      messages.push({
        id: ++compteurId,
        role: "assistant",
        texte: String(r?.texte ?? ""),
        date: Date.now(),
        etat: "ok",
      });
      if (r?.modele) modele = r.modele;
    } catch (e) {
      if (numero !== sequence) return;
      message.etat = "erreur";
      message.erreur = messageErreurIa(e);
    }
    enAttente = false;
    rendre();
    if (ouvert) saisie.focus();
  }

  /** Stops the wait: the answer, if it comes, is ignored; the message can be sent again. */
  function arreter() {
    if (!enAttente) return;
    sequence++;
    enAttente = false;
    const dernier = messages.at(-1);
    if (dernier?.etat === "envoi") {
      dernier.etat = "erreur";
      dernier.erreur = "arrêté.";
    }
    rendre();
    saisie.focus();
  }

  async function nouvelleConversation() {
    if (messages.length > CONFIRMER_AU_DELA) {
      const ok = await confirmer({
        titre: "Nouvelle conversation ?",
        message: "La conversation en cours sera effacée.",
        valider: "Nouvelle conversation",
      });
      if (!ok) return;
    }
    sequence++;
    messages = [];
    enAttente = false;
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
  globalThis.visualViewport?.addEventListener("resize", () => {
    panneau.style.setProperty("--chat-hauteur", `${globalThis.visualViewport.height}px`);
  });

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

  return { bouton, panneau, ouvrir, fermer, basculer, actualiser, estOuvert: () => ouvert };
}
