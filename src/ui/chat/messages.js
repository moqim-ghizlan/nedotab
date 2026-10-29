import { el } from "../dom.js";
import { rendreMarkdown } from "./markdown.js";

/**
 * The messages of the conversation (V4.11): bubbles of the user (right) and of the assistant
 * (left, full width, Markdown made safe by markdown.js). `role="log"` + `aria-live` announce
 * the new answers. The view follows the end of the conversation unless the user scrolled up to
 * read: a "↓ Derniers messages" button then brings it back.
 */
export function creerMessages({ surReessayer, surCopier }) {
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
  const racine = el("div", { class: "chat-messages" }, liste, bas);

  const enBas = () => liste.scrollHeight - liste.scrollTop - liste.clientHeight < 48;
  function defiler() {
    liste.scrollTop = liste.scrollHeight;
    bas.hidden = true;
  }
  liste.addEventListener("scroll", () => {
    if (enBas()) bas.hidden = true;
  });

  // An answer is rendered once: its safe nodes are kept while the list is rebuilt.
  const reponses = new Map();
  const bulleReponse = (m) => {
    if (!reponses.has(m.id)) {
      const contenu = el("div", { class: "chat-contenu" });
      contenu.append(rendreMarkdown(m.texte));
      reponses.set(
        m.id,
        el(
          "div",
          { class: "chat-bulle chat-bulle--assistant" },
          contenu,
          el("button", {
            type: "button",
            class: "chat-copier",
            texte: "Copier",
            "aria-label": "Copier la réponse",
            onclick: () => surCopier(m),
          }),
        ),
      );
    }
    return reponses.get(m.id);
  };

  /**
   * @param {{ id: number, role: string, texte: string, etat: string, erreur?: string }[]} messages
   * @param {{ enAttente: boolean }} options
   */
  function rendre(messages, { enAttente }) {
    const suivre = enBas();
    const dernier = messages.at(-1);
    const enfants = messages.map((m) => {
      if (m.role === "assistant") return bulleReponse(m);
      const estDernier = m === dernier;
      return el(
        "div",
        {
          class: `chat-bulle chat-bulle--utilisateur${m.etat === "erreur" ? " chat-bulle--erreur" : ""}`,
        },
        el("p", { class: "chat-texte", texte: m.texte }),
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
    liste.replaceChildren(
      ...(enfants.length
        ? enfants
        : [el("p", { class: "chat-vide", texte: "Posez une question à l'assistant." })]),
    );
    // Follow the end, unless the user went up to read (then a button brings them back).
    if (suivre || dernier?.role === "user") defiler();
    else bas.hidden = false;
  }

  return { racine, liste, rendre, defiler };
}
