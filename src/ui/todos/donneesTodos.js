import { creerSujet, estPleinSujets, renommerSujet, trierSujets } from "../../core/sujets.js";
import {
  creerTodo,
  estPleinTodos,
  ordreEntre,
  trierTodos,
} from "../../core/todos.js";
import { toast } from "../toast.js";
import { ecrireLocal, lireLocal } from "./memoireLocale.js";

/** Time left to cancel a removal before it is really written. */
export const DELAI_ANNULATION_MS = 5000;

/** A message for a Firestore error (no technical code shown). */
export function messageErreur(e) {
  if (e?.code === "permission-denied") return "Refusé : limite atteinte ou compte non autorisé.";
  if (e?.code === "unavailable") return "Hors ligne : l'action part dès que la connexion revient.";
  return "L'opération a échoué. Réessayez.";
}

/**
 * Data of the todo panel: the subjects, the todos of the CHOSEN subject, and the actions. The
 * interface never calls Firestore itself. One listener per kind at a time, stopped when the panel
 * closes and the tab is hidden. A removal is hidden at once and written 5 s later ("Annuler").
 * A tick is written 300 ms after the last click (the final state only).
 *
 * @param {object} d
 * @param {() => Promise<object>} d.charger loads the Firebase module
 * @param {() => string|null} d.uid
 */
export function creerDonneesTodos({ charger, uid }) {
  const abonnes = new Set();
  const etat = {
    statut: "chargement", // chargement | ok | erreur
    sujets: [],
    compteurs: { nbSujets: 0, nbTodos: 0, octets: 0 },
    sujetId: null,
    todos: [],
    todosStatut: "chargement",
    enAttente: false,
  };
  let arrets = [];
  let arretTodos = null;
  let demarre = false;
  const suppressions = new Map(); // "sujet:id" | "todo:id" → { minuteur, ecrire }
  const cochages = new Map(); // todo id → { fait, minuteur }
  const fb = () => charger();
  const notifier = () => abonnes.forEach((f) => f());

  const sujetsVisibles = () => trierSujets(etat.sujets.filter((s) => !suppressions.has(`sujet:${s.id}`)));
  const todosVisibles = () =>
    trierTodos(
      etat.todos
        .filter((t) => !suppressions.has(`todo:${t.id}`))
        .map((t) => (cochages.has(t.id) ? { ...t, fait: cochages.get(t.id).fait } : t)),
    );
  const trouver = (id) => etat.todos.find((t) => t.id === id);

  // --- Listeners ---------------------------------------------------------------------------------
  async function demarrerTodos() {
    const id = uid();
    const sujetId = etat.sujetId;
    if (!id || !sujetId || arretTodos) return;
    try {
      const m = await fb();
      if (etat.sujetId !== sujetId || arretTodos) return;
      arretTodos = m.ecouterTodos(
        id,
        sujetId,
        (todos, meta) => {
          etat.todos = todos;
          etat.todosStatut = "ok";
          etat.enAttente = meta.enAttente;
          notifier();
        },
        () => {
          etat.todosStatut = "erreur";
          notifier();
        },
      );
    } catch {
      etat.todosStatut = "erreur";
      notifier();
    }
  }

  function arreterTodos() {
    arretTodos?.();
    arretTodos = null;
  }

  async function demarrer() {
    const id = uid();
    if (!id || demarre) return;
    demarre = true;
    etat.statut = "chargement";
    notifier();
    try {
      const m = await fb();
      if (!demarre) return;
      arrets.push(
        m.ecouterSujets(
          id,
          (sujets, meta) => {
            etat.sujets = sujets;
            etat.statut = "ok";
            etat.enAttente = meta.enAttente;
            // The chosen subject: the remembered one, else the first; never a removed one.
            const visibles = sujetsVisibles();
            if (!visibles.some((s) => s.id === etat.sujetId)) {
              const garde = lireLocal("dernierSujet");
              choisir(visibles.find((s) => s.id === garde)?.id ?? visibles[0]?.id ?? null, false);
            }
            notifier();
          },
          () => {
            etat.statut = "erreur";
            notifier();
          },
        ),
        m.ecouterCompteursTodos(
          id,
          (c) => {
            etat.compteurs = c;
            notifier();
          },
          () => {},
        ),
      );
      if (etat.sujetId) demarrerTodos();
      reprendre();
    } catch {
      demarre = false;
      etat.statut = "erreur";
      notifier();
    }
  }

  function arreter() {
    demarre = false;
    arrets.forEach((a) => a());
    arrets = [];
    arreterTodos();
  }

  /** Shows the todos of another subject (one listener: the previous one is dropped). */
  function choisir(id, memoriser = true) {
    if (id === etat.sujetId && (arretTodos || !id)) return;
    viderCochages();
    arreterTodos();
    etat.sujetId = id;
    etat.todos = [];
    etat.todosStatut = "chargement";
    if (memoriser && id) ecrireLocal("dernierSujet", id);
    if (id && demarre) demarrerTodos();
    notifier();
  }

  // --- Delayed removals and ticks ------------------------------------------------------------------
  // A removal waits 5 s ("Annuler"). If the page is closed or reloaded in between, the async write
  // would be lost: so the removal is also noted on this device (ids only, never a text) and
  // finished at the next start. It is forgotten once written or cancelled.
  const lireEnAttente = () => {
    try {
      return JSON.parse(lireLocal("suppressions") ?? "[]");
    } catch {
      return [];
    }
  };
  const noterEnAttente = (cle, charge) =>
    ecrireLocal("suppressions", JSON.stringify([...lireEnAttente().filter((x) => x.cle !== cle), { cle, uid: uid(), ...charge }]));
  const oublierEnAttente = (cle) => {
    const reste = lireEnAttente().filter((x) => x.cle !== cle);
    ecrireLocal("suppressions", reste.length ? JSON.stringify(reste) : null);
  };

  function differer(cle, ecrire, charge = null) {
    let fini = false;
    const lancer = () => {
      if (fini) return;
      fini = true;
      clearTimeout(entree.minuteur);
      suppressions.delete(cle);
      Promise.resolve(ecrire())
        .then(() => oublierEnAttente(cle))
        .catch(() => {
          // Told, and the element comes back: nothing is lost silently.
          toast("La suppression a échoué : l'élément a été gardé. Réessayez.", { type: "erreur", duree: 8000 });
        })
        .finally(notifier);
    };
    const entree = { minuteur: setTimeout(lancer, DELAI_ANNULATION_MS), ecrire: lancer };
    suppressions.set(cle, entree);
    if (charge) noterEnAttente(cle, charge);
    notifier();
    return {
      annuler() {
        if (fini) return;
        fini = true;
        clearTimeout(entree.minuteur);
        suppressions.delete(cle);
        oublierEnAttente(cle);
        notifier();
      },
    };
  }

  /** Finishes the removals interrupted by a reload (of this account only). */
  async function reprendre() {
    const id = uid();
    for (const x of lireEnAttente()) {
      if (x.uid !== id || suppressions.has(x.cle)) continue;
      try {
        const m = await fb();
        if (x.type === "sujet") await m.supprimerSujet(id, x.id);
        else await m.supprimerTodo(id, x.id, { sujetId: x.sujetId, fait: x.fait, images: x.images ?? [] });
        oublierEnAttente(x.cle);
      } catch {
        /* kept: tried again at the next start */
      }
    }
  }

  function ecrireCochage(id) {
    const p = cochages.get(id);
    if (!p) return;
    clearTimeout(p.minuteur);
    cochages.delete(id);
    const t = trouver(id);
    if (t && t.fait !== p.fait) {
      fb()
        .then((m) => m.majTodo(uid(), id, { fait: p.fait }, { sujetId: t.sujetId }))
        .catch(() => {})
        .finally(notifier);
    }
    notifier();
  }
  const viderCochages = () => [...cochages.keys()].forEach(ecrireCochage);
  const viderTout = () => {
    [...suppressions.values()].forEach((e) => e.ecrire());
    viderCochages();
  };
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => document.hidden && viderTout());
    addEventListener("pagehide", viderTout);
  }

  const resultat = async (action) => {
    try {
      return { ok: true, ...(await action()) };
    } catch (e) {
      return { ok: false, erreur: messageErreur(e) };
    }
  };

  // --- Subjects --------------------------------------------------------------------------------------
  async function ajouterSujet(nom, couleur = null) {
    if (estPleinSujets(etat.compteurs.nbSujets)) return { ok: false, erreur: "30 sujets maximum." };
    const r = creerSujet({ nom, couleur, ordre: ordreEntre(sujetsVisibles().at(-1)?.ordre ?? null, null) });
    if (!r.ok) return r;
    const res = await resultat(async () => ({ id: await (await fb()).creerSujetTodos(uid(), r.sujet) }));
    if (res.ok) choisir(res.id);
    return res;
  }

  async function renommer(id, nom) {
    const actuel = etat.sujets.find((s) => s.id === id);
    if (!actuel) return { ok: false, erreur: "Ce sujet n'existe plus." };
    const r = renommerSujet(actuel, nom);
    if (!r.ok) return r;
    if (r.sujet.nom === actuel.nom) return { ok: true };
    return resultat(async () => void (await (await fb()).majSujet(uid(), id, { nom: r.sujet.nom })));
  }

  const colorer = (id, couleur) =>
    resultat(async () => void (await (await fb()).majSujet(uid(), id, { couleur })));

  /** Hides the subject at once and removes it, with its todos and pictures, after the delay. */
  const supprimerSujet = (id) => differer(`sujet:${id}`, async () => (await fb()).supprimerSujet(uid(), id), { type: "sujet", id });

  // --- Todos -------------------------------------------------------------------------------------------
  /** A new todo at the top of the list of the chosen subject (or of `sujetId`), with its description. */
  async function ajouterTodo(titre, { sujetId = etat.sujetId, description = "" } = {}) {
    if (!sujetId) return { ok: false, erreur: "Créez d'abord un sujet." };
    if (estPleinTodos(etat.compteurs.nbTodos)) return { ok: false, erreur: "500 todos maximum." };
    const premier = sujetId === etat.sujetId ? todosVisibles().find((t) => !t.fait) : null;
    const r = creerTodo({ sujetId, titre, description, ordre: ordreEntre(null, premier?.ordre ?? null) });
    if (!r.ok) return r;
    return resultat(async () => ({ id: await (await fb()).creerTodo(uid(), r.todo) }));
  }

  /** Partial update: only what changed (title, description). */
  const majTodo = (id, champs) =>
    resultat(async () => void (await (await fb()).majTodo(uid(), id, champs, { sujetId: trouver(id)?.sujetId })));

  function cocher(id) {
    const t = trouver(id);
    if (!t) return;
    const actuel = cochages.has(id) ? cochages.get(id).fait : t.fait;
    clearTimeout(cochages.get(id)?.minuteur);
    cochages.set(id, { fait: !actuel, minuteur: setTimeout(() => ecrireCochage(id), 300) });
    notifier();
  }

  /** Moves a todo to another subject (one batch with both counters): it goes to the top. */
  async function deplacer(id, versId) {
    const t = trouver(id);
    if (!t) return { ok: false, erreur: "Ce todo n'existe plus." };
    if (!etat.sujets.some((s) => s.id === versId))
      return { ok: false, erreur: "Ce sujet n'existe plus. Rien n'a été déplacé." };
    return resultat(async () =>
      void (await (await fb()).deplacerTodo(uid(), id, { depuis: t.sujetId, vers: versId, ordre: -Date.now(), fait: t.fait })),
    );
  }

  function supprimerTodo(id) {
    const t = trouver(id);
    if (!t) return { annuler() {} };
    const charge = { type: "todo", id, sujetId: t.sujetId, fait: t.fait, images: t.images.map((i) => ({ id: i.id, chemin: i.chemin, taille: i.taille })) };
    return differer(`todo:${id}`, async () => (await fb()).supprimerTodo(uid(), id, { sujetId: t.sujetId, fait: t.fait, images: t.images }), charge);
  }

  // --- The picture of a todo (one) ----------------------------------------------------------------------
  const envoyerImage = async (todoId, image, options) =>
    (await fb()).envoyerImageTodo(uid(), todoId, image, options);
  const lireImage = async (chemin) => (await fb()).lireImageTodo(chemin);
  const supprimerImage = (todoId, image) =>
    resultat(async () => void (await (await fb()).supprimerImageTodo(uid(), todoId, image)));

  return {
    /** Snapshot for the views: removals hidden, ticks applied. */
    etat: () => ({ ...etat, sujets: sujetsVisibles(), todos: todosVisibles() }),
    abonner(f) {
      abonnes.add(f);
      return () => abonnes.delete(f);
    },
    demarrer,
    arreter,
    choisir,
    ajouterSujet,
    renommer,
    colorer,
    supprimerSujet,
    ajouterTodo,
    majTodo,
    cocher,
    supprimerTodo,
    deplacer,
    envoyerImage,
    lireImage,
    supprimerImage,
    viderCochages,
    trouver,
    notifier,
    reinitialiser() {
      arreter();
      etat.sujets = [];
      etat.sujetId = null;
      etat.todos = [];
      etat.compteurs = { nbSujets: 0, nbTodos: 0, octets: 0 };
      etat.statut = "chargement";
      notifier();
    },
  };
}
