import { el } from "../dom.js";
import { masquerBlocActions } from "../../core/outils.js";
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
}) {
  const liste = el("div", {
    class: "chat-liste",
    role: "log",
    "aria-live": "polite",
    "aria-label": "Conversation avec l'assistant",
    tabindex: "0",
  });
  const bas = el("button", {
    type: "button",
    class: "chat-bas",
    texte: "↓ Derniers messages",
    hidden: true,
    onclick: () => defiler(),
  });
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
  const bulleReponse = (m) => {
    let e = reponses.get(m.id);
    if (!e) {
      const contenu = el("div", { class: "chat-contenu" });
      const pied = el("div", { class: "chat-pied" });
      const copier = el("button", {
        type: "button",
        class: "chat-copier",
        texte: "Copier",
        "aria-label": "Copier la réponse",
        onclick: () => surCopier(m),
      });
      const actions = el("div", { class: "chat-actions-zone" });
      const bulle = el(
        "div",
        { class: "chat-bulle chat-bulle--assistant" },
        contenu,
        actions,
        pied,
        copier,
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
        rendreAvecSites(texte, { trouver: trouverSite, afficher: afficherSite, fluxEnCours: enFlux }),
      );
      e.rendu = cle;
    }
    e.actions.replaceChildren(...[enFlux ? null : carteProposition(m)].filter(Boolean));
    e.bulle.classList.toggle("chat-bulle--flux", enFlux);
    e.bulle.setAttribute("aria-busy", String(enFlux));
    e.copier.hidden = enFlux;
    e.pied.replaceChildren(
      ...(m.consulte && !enFlux
        ? [el("p", { class: "chat-consulte", texte: "L'assistant a consulté vos sites pour cette réponse" })]
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
    const enfants = messages.flatMap((m) => {
      if (m.role === "assistant") return [bulleReponse(m)];
      const estDernier = m === dernier;
      const bulle = el(
        "div",
        {
          class: `chat-bulle chat-bulle--utilisateur${m.etat === "erreur" ? " chat-bulle--erreur" : ""}`,
        },
        el("p", { class: "chat-texte", texte: m.texte }),
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
      return m.sites?.length ? [bulle, carteSites(m.sites)] : [bulle];
    });
    if (enAttente)
      enfants.push(
        el(
          "div",
          {
            class: "chat-bulle chat-bulle--assistant chat-attente",
            "aria-label": "L'assistant écrit…",
          },
          el("span", { class: "chat-point", "aria-hidden": "true" }),
          el("span", { class: "chat-point", "aria-hidden": "true" }),
          el("span", { class: "chat-point", "aria-hidden": "true" }),
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
    liste.replaceChildren(
      ...(enfants.length
        ? enfants
        : [el("p", { class: "chat-vide", texte: "Posez une question à l'assistant." })]),
    );
    // Follow the end, unless the user went up to read (then a button brings them back).
    if (suivre || dernier?.role === "user") defiler();
    else bas.hidden = false;
  }

  return { racine, liste, rendre, majReponse, defiler };
}
