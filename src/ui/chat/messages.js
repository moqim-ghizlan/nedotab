import { el } from "../dom.js";
import { icone } from "../icones.js";
import { iconeRobot } from "./boutonRobot.js";
import { masquerBlocActions } from "../../core/outils.js";
import {
  cleJour,
  dateLongueMessage,
  formaterHeureMessage,
  heureVisible,
  libelleJour,
} from "../../core/conversations.js";
import { referencesDe, rendreAvecSites } from "./referencesSites.js";

/**
 * The messages of the conversation (V4.11): bubbles of the user (right) and of the assistant
 * (left, full width, Markdown made safe by markdown.js). `role="log"` + `aria-live` announce
 * the new answers. The view follows the end of the conversation unless the user scrolled up to
 * read: a "↓ Derniers messages" button then brings it back.
 *
 * V4.12: an answer being streamed ({ etat: "flux" }) is rendered again from its whole text by
 * `majReponse` (the panel calls it at most every 50 ms), always through markdown.js. While it
 * streams the list is not a live region (a screen reader would read every chunk): a status
 * line announces the end once.
 */
export function creerMessages({
  surReessayer,
  surCopier,
  surReessayerReponse = () => {},
  trouverSite = () => null,
  afficherSite,
  surChargerPrecedents = () => {},
  carteProposition = () => null,
  exemples = () => [],
  surExemple = () => {},
  // T13: time under the bubbles (display only, never sent to the AI).
  afficherHeure = () => true,
  format24h = () => true,
}) {
  const liste = el("div", {
    class: "chat-liste",
    role: "log",
    "aria-live": "polite",
    "aria-label": "Conversation avec l'assistant",
    tabindex: "0",
  });
  const bas = el(
    "button",
    { type: "button", class: "chat-bas", hidden: true, onclick: () => defiler() },
    icone("bas", { taille: 14 }),
    el("span", { texte: "Derniers messages" }),
  );
  const annonce = el("p", { class: "chat-annonce", role: "status" });
  const racine = el("div", { class: "chat-messages" }, liste, bas, annonce);

  let etaitEnFlux = false;
  function annoncer(texte) {
    annonce.textContent = "";
    setTimeout(() => (annonce.textContent = texte), 50);
  }

  const enBas = () => liste.scrollHeight - liste.scrollTop - liste.clientHeight < 48;
  function defiler() {
    liste.scrollTop = liste.scrollHeight;
    bas.hidden = true;
  }
  liste.addEventListener("scroll", () => {
    if (enBas()) bas.hidden = true;
  });

  // An answer is a bubble that is kept: only its content is rendered again when its text grows.
  const reponses = new Map();
  let dernierId = null;
  // V4.30: a message appears with a short movement the first time only (the list is drawn
  // again at each change, the same bubble must not move again).
  const vus = new Set();
  let premierRendu = true;
  const entree = (noeud, id) => {
    if (vus.has(id)) return noeud;
    vus.add(id);
    if (premierRendu) return noeud;
    noeud.classList.add("chat-entree");
    noeud.addEventListener("animationend", () => noeud.classList.remove("chat-entree"), {
      once: true,
    });
    return noeud;
  };
  /** <time> of a message: absolute, steady, full date on hover. Empty without a date. */
  const heureDe = (m, suivant) => {
    if (!afficherHeure() || !heureVisible(m, suivant)) return null;
    const options = { format24h: format24h() };
    const t = new Date(m.date);
    return el("time", {
      class: "chat-heure",
      datetime: Number.isNaN(t.getTime()) ? null : t.toISOString(),
      title: dateLongueMessage(m.date, options),
      texte: formaterHeureMessage(m.date, Date.now(), options),
    });
  };
  const bulleReponse = (m, suivant = null) => {
    let e = reponses.get(m.id);
    if (!e) {
      const contenu = el("div", { class: "chat-contenu" });
      const pied = el("div", { class: "chat-pied" });
      const copier = el(
        "button",
        {
          type: "button",
          class: "chat-copier",
          "aria-label": "Copier la réponse",
          title: "Copier la réponse",
          onclick: () => surCopier(m),
        },
        icone("copier", { taille: 14 }),
        el("span", { texte: "Copier" }),
      );
      const actions = el("div", { class: "chat-actions-zone" });
      const bulle = el(
        "div",
        { class: "chat-bulle chat-bulle--assistant" },
        el("span", { class: "chat-avatar", "aria-hidden": "true" }, iconeRobot({ taille: 18 })),
        el("div", { class: "chat-corps" }, contenu, actions, pied, copier),
      );
      e = { bulle, contenu, actions, pied, copier, rendu: null };
      reponses.set(m.id, e);
    }
    const enFlux = m.etat === "flux";
    // V4.14: the cards follow the grid (a site deleted since becomes "introuvable").
    const sites = referencesDe(m.texte)
      .map((id) => {
        const s = trouverSite(id);
        return s ? `${s.titre}${s.url}` : "-";
      })
      .join("|");
    // V4.16: the ```actions block is never shown, even while it is being written.
    const texte = masquerBlocActions(m.texte);
    const cle = `${enFlux}
${sites}
${texte}`;
    if (e.rendu !== cle) {
      e.contenu.replaceChildren(
        rendreAvecSites(texte, {
          trouver: trouverSite,
          afficher: afficherSite,
          fluxEnCours: enFlux,
        }),
      );
      e.rendu = cle;
    }
    e.actions.replaceChildren(...[enFlux ? null : carteProposition(m)].filter(Boolean));
    e.bulle.classList.toggle("chat-bulle--flux", enFlux);
    e.bulle.setAttribute("aria-busy", String(enFlux));
    e.copier.hidden = enFlux;
    e.pied.replaceChildren(
      ...[heureDe(m, suivant)].filter(Boolean),
      ...(m.consulte && !enFlux
        ? [
            el("p", {
              class: "chat-consulte",
              texte: "L'assistant a consulté vos sites pour cette réponse",
            }),
          ]
        : []),
      ...(m.echec
        ? [
            el(
              "p",
              { class: "chat-interrompu", role: "alert" },
              "Réponse interrompue — ",
              m.id === dernierId
                ? el("button", {
                    type: "button",
                    class: "chat-reessayer",
                    texte: "Réessayer",
                    onclick: () => surReessayerReponse(m),
                  })
                : null,
            ),
          ]
        : m.interrompu
          ? [el("p", { class: "chat-interrompu", texte: "(interrompu)" })]
          : []),
    );
    return e.bulle;
  };

  /** A streamed answer grew: renders it again (the view follows unless the user went up). */
  function majReponse(m) {
    const suivre = enBas();
    bulleReponse(m);
    if (suivre) defiler();
  }

  /** V4.13: the sites found for a question asked in the bar (links to the user's own sites). */
  const carteSites = (sites) =>
    el(
      "div",
      { class: "chat-sites" },
      el("p", { class: "chat-sites-titre", texte: "Sites correspondants" }),
      el(
        "ul",
        { class: "chat-sites-liste" },
        sites
          .filter((s) => /^https?:\/\//i.test(s.url))
          .map((s) =>
            el(
              "li",
              {},
              el("a", {
                href: s.url,
                target: "_blank",
                rel: "noopener noreferrer",
                texte: s.titre,
              }),
            ),
          ),
      ),
    );

  /**
   * @param {{ id: number, role: string, texte: string, etat: string, erreur?: string }[]} messages
   * @param {{ enAttente: boolean }} options
   */
  function rendre(messages, { enAttente, peutCharger = false }) {
    const suivre = enBas();
    const dernier = messages.at(-1);
    dernierId = dernier?.id ?? null;
    const enFlux = messages.some((m) => m.etat === "flux");
    liste.setAttribute("aria-live", enFlux ? "off" : "polite");
    liste.setAttribute("aria-busy", String(enFlux));
    if (etaitEnFlux && !enFlux && dernier?.role === "assistant" && !dernier.interrompu)
      annoncer("Réponse de l'assistant reçue");
    etaitEnFlux = enFlux;
    let jourVu = "";
    const enfants = messages.flatMap((m, i) => {
      const suivant = messages[i + 1] ?? null;
      const cle = cleJour(m.date);
      const separateur =
        cle && cle !== jourVu
          ? [el("p", { class: "chat-jour", role: "separator", texte: libelleJour(m.date) })]
          : [];
      if (cle) jourVu = cle;
      if (m.role === "assistant")
        return [...separateur, entree(bulleReponse(m, suivant), `a${m.id}`)];
      const estDernier = m === dernier;
      const bulle = el(
        "div",
        {
          class: `chat-bulle chat-bulle--utilisateur${m.etat === "erreur" ? " chat-bulle--erreur" : ""}`,
        },
        el("p", { class: "chat-texte", texte: m.texte }),
        heureDe(m, suivant),
        m.origine === "barre"
          ? el("p", { class: "chat-origine", texte: "depuis la barre de recherche" })
          : null,
        m.etat === "erreur"
          ? el(
              "p",
              { class: "chat-echec", role: "alert" },
              `Non envoyé — ${m.erreur ?? "erreur"} `,
              estDernier
                ? el("button", {
                    type: "button",
                    class: "chat-reessayer",
                    texte: "Réessayer",
                    onclick: () => surReessayer(m),
                  })
                : null,
            )
          : null,
      );
      entree(bulle, `u${m.id}`);
      return m.sites?.length ? [...separateur, bulle, carteSites(m.sites)] : [...separateur, bulle];
    });
    if (enAttente)
      enfants.push(
        el(
          "div",
          {
            class: "chat-bulle chat-bulle--assistant chat-attente",
            "aria-label": "L'assistant écrit…",
          },
          el("span", { class: "chat-avatar", "aria-hidden": "true" }, iconeRobot({ taille: 18 })),
          el(
            "span",
            { class: "chat-points" },
            el("span", { class: "chat-point", "aria-hidden": "true" }),
            el("span", { class: "chat-point", "aria-hidden": "true" }),
            el("span", { class: "chat-point", "aria-hidden": "true" }),
          ),
        ),
      );
    if (peutCharger)
      enfants.unshift(
        el("button", {
          type: "button",
          class: "chat-precedents",
          texte: "Charger les messages précédents",
          onclick: () => surChargerPrecedents(),
        }),
      );
    liste.replaceChildren(...(enfants.length ? enfants : [accueil()]));
    premierRendu = false;
    // Follow the end, unless the user went up to read (then a button brings them back).
    if (suivre || dernier?.role === "user") defiler();
    else bas.hidden = false;
  }

  /** Empty conversation: the robot says hello and offers a few questions to start with. */
  function accueil() {
    const questions = exemples().slice(0, 3);
    return el(
      "div",
      { class: "chat-vide" },
      el("span", { class: "chat-vide-robot", "aria-hidden": "true" }, iconeRobot({ taille: 40 })),
      el("p", { class: "chat-vide-titre", texte: "Posez une question à l'assistant." }),
      el("p", {
        class: "chat-vide-texte",
        texte:
          "Il retrouve vos sites, répond à vos questions et peut proposer de ranger la grille.",
      }),
      questions.length
        ? el(
            "div",
            { class: "chat-exemples", role: "group", "aria-label": "Exemples de questions" },
            questions.map((q, i) =>
              el("button", {
                type: "button",
                class: "chat-exemple",
                style: `--i:${i}`,
                texte: q,
                onclick: () => surExemple(q),
              }),
            ),
          )
        : null,
    );
  }

  return { racine, liste, rendre, majReponse, defiler };
}
