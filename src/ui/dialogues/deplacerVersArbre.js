import { A } from "../../core/actions.js";
import { peutPlacer, trouver } from "../../core/arbre.js";
import { el } from "../dom.js";
import { RAISONS } from "../messages.js";
import { demander } from "./commun.js";

/** Tree nodes: home then every folder, depth-first, with their parent node. */
function noeuds(grille) {
  const liste = [{ id: null, titre: "Accueil", niveau: 0, parent: null, enfants: [] }];
  const visiter = (elements, parent) => {
    for (const e of elements) {
      if (e.type !== "dossier") continue;
      const n = { id: e.id, titre: e.titre, niveau: parent.niveau + 1, parent, enfants: [] };
      parent.enfants.push(n);
      liste.push(n);
      visiter(e.items, n);
    }
  };
  visiter(grille, liste[0]);
  return liste;
}

/**
 * "Déplacer vers…" as a tree (home + every folder). Each destination is checked with
 * peutPlacer: invalid ones are disabled and explain why; the current place is marked.
 * Keyboard: ↑ ↓ move, → / ← expand or collapse, Enter chooses.
 * Resolves to the chosen parent id (null = home) or undefined when cancelled.
 */
export async function ouvrirDeplacerVers(store, id, { retourFocus } = {}) {
  const grille = store.lire().grille;
  const r = trouver(grille, id);
  if (!r) return undefined;
  const actuel = r.parent?.id ?? null;
  const tous = noeuds(grille);
  const replies = new Set();
  let choix;

  const arbre = el("ul", { class: "arbre", role: "tree", "aria-label": "Destinations" });
  const items = new Map();
  for (const n of tous) {
    const verdict =
      n.id === actuel ? { ok: false, raison: "ACTUEL" } : peutPlacer(grille, id, n.id);
    const note = n.id === actuel ? "(actuel)" : verdict.ok ? "" : RAISONS[verdict.raison];
    const li = el(
      "li",
      {
        class: "arbre-noeud",
        role: "treeitem",
        tabindex: "-1",
        "aria-level": String(n.niveau + 1),
        "aria-expanded": n.enfants.length ? "true" : null,
        "aria-disabled": verdict.ok ? null : "true",
        title: note || null,
        style: `padding-left:${10 + n.niveau * 20}px`,
        dataset: { id: n.id ?? "" },
      },
      el("span", {
        class: "arbre-fleche",
        "aria-hidden": "true",
        texte: n.enfants.length ? "▾" : "",
      }),
      el("span", { class: "destination-icone", "aria-hidden": "true", texte: n.id ? "▣" : "⌂" }),
      el("span", { class: "arbre-titre", texte: n.titre }),
      note ? el("span", { class: "destination-note", texte: note }) : null,
    );
    li.addEventListener("click", (e) => {
      if (e.target.closest(".arbre-fleche") && n.enfants.length) {
        basculer(n);
        return;
      }
      choisir(n, verdict);
    });
    items.set(n, { li, verdict });
    arbre.append(li);
  }

  const visible = (n) => {
    for (let p = n.parent; p; p = p.parent) if (replies.has(p)) return false;
    return true;
  };
  const actualiser = () => {
    for (const [n, { li }] of items) {
      li.hidden = !visible(n);
      if (n.enfants.length) {
        li.setAttribute("aria-expanded", String(!replies.has(n)));
        li.querySelector(".arbre-fleche").textContent = replies.has(n) ? "▸" : "▾";
      }
    }
  };
  const basculer = (n) => {
    if (replies.has(n)) replies.delete(n);
    else replies.add(n);
    actualiser();
  };
  const choisir = (n, verdict) => {
    if (!verdict.ok) return;
    choix = n.id;
    arbre.closest("dialog").close();
  };

  arbre.addEventListener("keydown", (e) => {
    const visibles = tous.filter(visible);
    const courant = tous.find((n) => items.get(n).li === document.activeElement);
    if (!courant) return;
    const i = visibles.indexOf(courant);
    const aller = (n) => {
      e.preventDefault();
      if (n) items.get(n).li.focus();
    };
    if (e.key === "ArrowDown") aller(visibles[i + 1]);
    else if (e.key === "ArrowUp") aller(visibles[i - 1]);
    else if (e.key === "Home") aller(visibles[0]);
    else if (e.key === "End") aller(visibles.at(-1));
    else if (e.key === "ArrowRight" && courant.enfants.length) {
      e.preventDefault();
      if (replies.has(courant)) basculer(courant);
      else aller(courant.enfants[0]);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      if (courant.enfants.length && !replies.has(courant)) basculer(courant);
      else aller(courant.parent);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      choisir(courant, items.get(courant).verdict);
    }
  });

  const attente = demander({
    titre: `Déplacer « ${r.element.titre} » vers…`,
    contenu: [arbre],
    boutons: [{ libelle: "Annuler", valeur: false }],
    retourFocus,
  });
  // Start on the first valid destination.
  const premier = tous.find((n) => items.get(n).verdict.ok) ?? tous[0];
  items.get(premier).li.focus();
  await attente;
  if (choix === undefined) return undefined;
  store.envoyer({ type: A.ELEMENT_DEPLACER, id, versParentId: choix });
  return choix;
}
