import { CONVERSATIONS_MAX, dateRelative, titreValide } from "../../core/conversations.js";
import { el } from "../dom.js";
import { toast } from "../toast.js";

/** The deletion is really done after this time, so that "Annuler" works (like the backgrounds, V2.6). */
export const DELAI_SUPPRESSION_MS = 5000;

/**
 * List of the conversations (V4.15), shown in the chat panel in place of the messages: title,
 * start of the last message, relative date and number of messages, most recent first, 20 at a
 * time. Opening, renaming (pencil), deleting (undo possible for 5 s). Every text goes through
 * textContent.
 *
 * @param {{
 *   lister: (options: { apres: number|null }) => Promise<{ conversations: object[], suite: boolean }>,
 *   renommer: (id: string, titre: string) => Promise<unknown>,
 *   supprimer: (id: string) => Promise<unknown>,
 *   surOuvrir: (conversation: object) => void,
 *   surSupprimee?: (id: string) => void,
 *   surNouvelle: () => void,
 *   idOuverte?: () => string|null,
 *   notifier?: (message: string) => void,
 *   maintenant?: () => number,
 * }} options
 */
export function creerHistorique({
  lister,
  renommer,
  supprimer,
  surOuvrir,
  surSupprimee = () => {},
  surNouvelle,
  idOuverte = () => null,
  notifier = (message) => toast(message),
  maintenant = () => Date.now(),
}) {
  let conversations = [];
  let suite = false;
  let chargement = false;
  let erreur = false;
  let enSuppression = new Set(); // hidden at once, really deleted when the undo time is over

  const liste = el("ul", { class: "chat-historique-liste" });
  const etat = el("p", { class: "chat-historique-etat", role: "status" });
  const plus = el("button", {
    type: "button",
    class: "chat-entete-bouton chat-historique-plus",
    texte: "Charger plus",
    hidden: true,
    onclick: () => charger({ suite: true }),
  });
  const nouvelle = el("button", {
    type: "button",
    class: "bouton bouton--principal chat-historique-nouvelle",
    texte: "Nouvelle conversation",
    onclick: () => surNouvelle(),
  });
  const racine = el(
    "div",
    { class: "chat-historique", hidden: true },
    el("div", { class: "chat-historique-haut" }, nouvelle),
    liste,
    etat,
    plus,
    el("p", {
      class: "chat-historique-note",
      texte: `Les conversations au-delà de ${CONVERSATIONS_MAX} sont supprimées automatiquement (les plus anciennes d'abord).`,
    }),
  );

  function ligne(c) {
    const meta = [
      dateRelative(c.majLe, maintenant()),
      `${c.nbMessages} message${c.nbMessages > 1 ? "s" : ""}`,
    ]
      .filter(Boolean)
      .join(" · ");
    const ouvrir = el(
      "button",
      {
        type: "button",
        class: "chat-historique-ouvrir",
        "aria-current": idOuverte() === c.id ? "true" : null,
        onclick: () => surOuvrir(c),
      },
      el("strong", { class: "chat-historique-titre", texte: c.titre }),
      c.apercu ? el("span", { class: "chat-historique-apercu", texte: c.apercu }) : null,
      el("span", { class: "chat-historique-meta", texte: meta }),
    );
    const item = el(
      "li",
      { class: "chat-historique-ligne", dataset: { id: c.id } },
      ouvrir,
      el("button", {
        type: "button",
        class: "chat-historique-action",
        "aria-label": `Renommer « ${c.titre} »`,
        texte: "✎",
        onclick: () => editerTitre(c, item, ouvrir),
      }),
      el("button", {
        type: "button",
        class: "chat-historique-action chat-historique-supprimer",
        "aria-label": `Supprimer « ${c.titre} »`,
        texte: "🗑",
        onclick: () => retirer(c),
      }),
    );
    return item;
  }

  function afficher() {
    const visibles = conversations.filter((c) => !enSuppression.has(c.id));
    liste.replaceChildren(...visibles.map(ligne));
    plus.hidden = !suite || chargement;
    etat.textContent = chargement
      ? "Chargement…"
      : erreur
        ? "Historique indisponible pour l'instant."
        : visibles.length === 0
          ? "Aucune conversation pour l'instant."
          : "";
  }

  /** Reads a page; `{ suite: true }` adds the next one, else the list starts again. */
  async function charger({ suite: suivante = false } = {}) {
    if (chargement) return;
    chargement = true;
    erreur = false;
    afficher();
    try {
      const apres = suivante ? (conversations.at(-1)?.majLe ?? null) : null;
      const r = await lister({ apres });
      conversations = suivante ? [...conversations, ...r.conversations] : r.conversations;
      suite = r.suite;
    } catch {
      erreur = true;
    }
    chargement = false;
    afficher();
  }

  function editerTitre(c, item, ouvrir) {
    const champ = el("input", {
      type: "text",
      class: "chat-historique-champ",
      value: c.titre,
      maxlength: "80",
      "aria-label": "Nouveau titre",
    });
    let fini = false;
    const terminer = async (valider) => {
      if (fini) return;
      fini = true;
      const titre = valider ? titreValide(champ.value) : null;
      if (titre && titre !== c.titre) {
        try {
          await renommer(c.id, titre);
          c.titre = titre;
        } catch {
          notifier("Renommage impossible");
        }
      }
      afficher();
    };
    champ.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        terminer(true);
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        terminer(false);
      }
    });
    champ.addEventListener("blur", () => terminer(true));
    ouvrir.replaceWith(champ);
    champ.focus();
    champ.select();
    void item;
  }

  /** Hidden at once; the server deletes it when the undo time is over. */
  function retirer(c) {
    enSuppression.add(c.id);
    afficher();
    let annule = false;
    const minuteur = setTimeout(async () => {
      if (annule) return;
      try {
        await supprimer(c.id);
        conversations = conversations.filter((x) => x.id !== c.id);
        surSupprimee(c.id);
      } catch {
        notifier("Suppression impossible");
      }
      enSuppression.delete(c.id);
      afficher();
    }, DELAI_SUPPRESSION_MS);
    toast("Conversation supprimée", {
      duree: DELAI_SUPPRESSION_MS,
      cle: `conversation-${c.id}`,
      action: {
        libelle: "Annuler",
        onClic: () => {
          annule = true;
          clearTimeout(minuteur);
          enSuppression.delete(c.id);
          afficher();
        },
      },
    });
  }

  return {
    racine,
    /** Shows the list (read again from the start). */
    ouvrir: () => {
      racine.hidden = false;
      return charger();
    },
    fermer: () => {
      racine.hidden = true;
    },
    charger,
  };
}
