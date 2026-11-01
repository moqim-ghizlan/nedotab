import { A } from "../../core/actions.js";
import { trouver } from "../../core/arbre.js";
import { convertir, resume, simuler, statutApres } from "../../core/propositions.js";
import { comptesDe } from "../../core/pages.js";
import { el } from "../dom.js";
import { toast } from "../toast.js";

const ETIQUETTES_STATUT = {
  appliquee: "Appliqué",
  partielle: "Appliqué en partie",
  ignoree: "Ignoré",
};
const ICONES = {
  ajouter_site: "＋",
  creer_dossier: "▣",
  deplacer: "→",
  renommer: "✎",
  supprimer: "✕",
  modifier_tags: "#",
};
/** Sites listed per folder in the preview before "+ n". */
const APERCU_SITES = 4;

/**
 * Cards of the actions proposed by the assistant (V4.16). The model proposes, the user decides:
 * nothing changes before "Appliquer la sélection". Each action goes through the same reducer
 * and the same guards as the interface (src/core/propositions.js), is simulated again right
 * before it is applied (the grid may have changed on another device), and the whole is
 * undoable with the usual "Annuler" toast. A proposal is applied once: its status is kept in
 * the conversation (appliquee, partielle, ignoree) and shown on every device.
 *
 * @param {{
 *   store: { lire: () => object, envoyer: (action: object) => void },
 *   majStatut: (message: object, statut: string) => void,
 *   genererId?: () => string,
 *   notifier?: typeof toast,
 * }} options
 * @returns {{ carte: (message: object) => HTMLElement|null }} `carte` is called at every render
 *   of the conversation: the same node is kept and updated for a given message.
 */
export function creerGestionPropositions({ store, majStatut, genererId, notifier = toast }) {
  const cartes = new Map(); // message key → { noeud, items, selection, ouvert, ... }

  function etatDe(m) {
    const cle = m.fsId ?? m.proposition?.id ?? m.id;
    let c = cartes.get(cle);
    if (!c) {
      const items = convertir(m.proposition, store.lire(), genererId ? { genererId } : {});
      c = {
        noeud: el("div", { class: "chat-proposition" }),
        items,
        // Deletions are never ticked by default.
        selection: new Set(items.filter((i) => !i.destructif).map((i) => i.index)),
        apercu: false,
        occupe: false,
      };
      cartes.set(cle, c);
    }
    return c;
  }

  function appliquer(m, c) {
    // Applied once: a second click (or another device) finds the status already set.
    if (c.occupe || (m.statutProposition ?? "en_attente") !== "en_attente") return;
    c.occupe = true;
    const avant = store.lire();
    const grilleAvant = avant.grille;
    const pages = comptesDe(avant);
    // The grid may have changed since the card was shown: simulate again, right now.
    const { resultats } = simuler(avant, c.items, c.selection);
    const faites = resultats.filter((r) => r.ok);
    if (!faites.length) {
      c.occupe = false;
      notifier("Aucune de ces modifications ne peut être appliquée maintenant.");
      afficher(m, c);
      return;
    }
    for (const r of faites) store.envoyer(r.item.action);
    const statut = statutApres(resultats);
    m.statutProposition = statut;
    majStatut(m, statut);
    c.occupe = false;
    const n = faites.length;
    notifier(`${n} modification${n > 1 ? "s" : ""} appliquée${n > 1 ? "s" : ""}`, {
      duree: 8000,
      action: {
        libelle: "Annuler",
        onClic: () => store.envoyer({ type: A.GRILLE_REMPLACER, grille: grilleAvant, pages }),
      },
    });
    const refusees = resultats.filter((r) => !r.ok && !r.ignore);
    if (refusees.length)
      notifier(
        `${refusees.length} modification${refusees.length > 1 ? "s" : ""} impossible${refusees.length > 1 ? "s" : ""} à appliquer maintenant`,
        { cle: "proposition-refusees" },
      );
    afficher(m, c);
  }

  function ignorer(m, c) {
    if (c.occupe || (m.statutProposition ?? "en_attente") !== "en_attente") return;
    m.statutProposition = "ignoree";
    majStatut(m, "ignoree");
    afficher(m, c);
  }

  /** Folders touched by the simulated actions, with the first sites they hold. */
  function apercuResultat(etatFinal, resultats) {
    const ids = new Set();
    for (const { item, ok } of resultats) {
      if (!ok) continue;
      const a = item.action;
      if (a.type === A.DOSSIER_CREER) ids.add(a.dossier.id);
      if (a.type === A.ELEMENT_DEPLACER && a.versParentId) ids.add(a.versParentId);
    }
    return [...ids].flatMap((id) => {
      const d = trouver(etatFinal.grille, id)?.element;
      if (d?.type !== "dossier") return [];
      const sites = d.items.filter((e) => e.type === "site").map((e) => e.titre);
      const reste = sites.length - APERCU_SITES;
      return [
        `${d.titre} : ${sites.slice(0, APERCU_SITES).join(", ") || "(vide)"}${reste > 0 ? ` (+ ${reste})` : ""}`,
      ];
    });
  }

  function afficher(m, c) {
    const statut = m.statutProposition ?? "en_attente";
    const attente = statut === "en_attente";
    const { etatFinal, resultats } = simuler(store.lire(), c.items, attente ? c.selection : null);
    const lignes = resultats.map(({ item, ok, raison, ignore }) => {
      const refuse = !ok && !ignore && attente;
      const coche = el("input", {
        type: "checkbox",
        id: `prop-${m.id}-${item.index}`,
        checked: c.selection.has(item.index) && !refuse,
        disabled: !attente || refuse || null,
        onchange: (e) => {
          if (e.currentTarget.checked) c.selection.add(item.index);
          else c.selection.delete(item.index);
          afficher(m, c);
        },
      });
      return el(
        "li",
        {
          class: `chat-proposition-ligne${item.destructif ? " chat-proposition-ligne--danger" : ""}${refuse ? " chat-proposition-ligne--refusee" : ""}`,
        },
        attente ? coche : null,
        el(
          "label",
          { for: attente ? `prop-${m.id}-${item.index}` : null },
          el("span", { class: "chat-proposition-icone", "aria-hidden": "true", texte: ICONES[item.outil] ?? "•" }),
          el("span", { texte: item.libelle }),
          refuse ? el("span", { class: "chat-proposition-raison", texte: ` — ${raison}` }) : null,
        ),
      );
    });
    const faisables = resultats.filter((r) => r.ok).length;
    const entete = el(
      "p",
      { class: "chat-proposition-titre" },
      el("strong", { texte: "Modifications proposées" }),
      attente ? null : el("span", { class: "chat-proposition-statut", texte: ` · ${ETIQUETTES_STATUT[statut] ?? statut}` }),
      attente && resume(resultats) ? el("span", { class: "chat-proposition-resume", texte: ` — ${resume(resultats)}` }) : null,
    );
    const apercu = c.apercu ? apercuResultat(etatFinal, resultats) : [];
    c.noeud.replaceChildren(
      entete,
      el("ul", { class: "chat-proposition-liste" }, lignes),
      attente
        ? el(
            "div",
            { class: "chat-proposition-boutons" },
            el("button", {
              type: "button",
              class: "bouton bouton--principal chat-proposition-appliquer",
              texte: "Appliquer la sélection",
              disabled: faisables === 0 || c.occupe || null,
              onclick: () => appliquer(m, c),
            }),
            el("button", {
              type: "button",
              class: "bouton chat-proposition-ignorer",
              texte: "Ignorer",
              onclick: () => ignorer(m, c),
            }),
            el("button", {
              type: "button",
              class: "lien-discret chat-proposition-voir",
              texte: c.apercu ? "Masquer le résultat" : "Voir le résultat",
              "aria-expanded": String(c.apercu),
              onclick: () => {
                c.apercu = !c.apercu;
                afficher(m, c);
              },
            }),
          )
        : null,
      c.apercu && attente
        ? el(
            "ul",
            { class: "chat-proposition-apercu", "aria-label": "Résultat attendu" },
            apercu.length
              ? apercu.map((t) => el("li", { texte: t }))
              : [el("li", { texte: "Aucun dossier concerné." })],
          )
        : null,
    );
  }

  return {
    carte(m) {
      if (!m.proposition?.actions?.length) return null;
      const c = etatDe(m);
      afficher(m, c);
      return c.noeud;
    },
  };
}
