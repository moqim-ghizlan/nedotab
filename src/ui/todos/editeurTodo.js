import { decider, memoireSession } from "../../core/conflitTodo.js";
import { creerDiffere } from "../../core/differe.js";
import { ajouterJours, jourLocal, lundiProchain } from "../../core/echeances.js";
import { ilYA } from "../../core/espacePartage.js";
import { outilMarkdown, rendreMarkdown } from "../../core/markdown.js";
import { DESCRIPTION_MAX, TITRE_MAX, echeanceValide, longueur } from "../../core/todos.js";
import { demander } from "../dialogues/commun.js";
import { el } from "../dom.js";
import { icone } from "../icones.js";
import { rapatrierToasts, toast } from "../toast.js";
import { ouvrirMenu } from "../menuContextuel.js";
import { copierMarkdown, exporterTodo } from "./exporterTodo.js";
import { creerGalerieTodo } from "./galerieTodo.js";
import { SANS_TITRE } from "./ligneTodo.js";

let ouvert = null;

/** "à l'instant", "il y a 3 min", "hier", or "le 12 nov." for an older date. */
function quand(ms) {
  const relatif = ilYA(ms);
  return /^\d/.test(relatif) ? `le ${relatif}` : relatif;
}

/**
 * The editor of a todo (V6.3), like a blank `.md` file: title, Markdown description, due date,
 * in any order, nothing mandatory. A big window over the panel.
 *
 * - LAZY creation: "Nouveau todo" (todoId = null) writes nothing. The todo is created at the first
 *   useful input (a title, a description or a due date), with an id made on the device so the
 *   next writes can queue offline. Opening and closing an empty editor writes nothing.
 * - Typing is written 1.5 s after the last key and at once on close; only the changed fields.
 * - A snapshot never replaces a field that has the focus, is being composed (IME), or waits to
 *   be sent; if another device changed such a field, a banner offers to reload it.
 * - The preview (Markdown → sanitised nodes) is built only when asked for, never per keystroke.
 *
 * @param {object} d
 * @param {ReturnType<import("./donneesTodos.js").creerDonneesTodos>} d.donnees
 * @param {string|null} d.todoId null: a new todo
 * @param {string} d.sujetId subject of a new todo
 * @param {HTMLElement} [d.retourFocus]
 */
export function ouvrirEditeur({
  donnees,
  todoId = null,
  sujetId,
  retourFocus,
  // Plugged parts of the window (V6.4: the pictures). Each: { racine, bouton, monter, maj, liberer }.
  complements = [creerGalerieTodo({ donnees })],
}) {
  ouvert?.fermer();
  let id = todoId;
  const depart = id ? donnees.etat().todos.find((t) => t.id === id) : null;
  if (id && !depart) return null;
  let sujetCourant = depart?.sujetId ?? sujetId;
  let enAttente = {}; // fields typed and not yet sent
  // What the screen was last in line with, and what this editor last sent (its own echo).
  let base = { titre: depart?.titre ?? "", description: depart?.description ?? "", echeance: depart?.echeance ?? "" };
  const envoye = {};
  const distants = {}; // fields in conflict: the value of the other device
  let pret = Promise.resolve(); // the id of the todo is known once this resolves
  let enVol = 0; // writes issued and not yet acknowledged
  let composition = false;
  let etat = "enregistre"; // enregistre | enCours | horsLigne
  let ferme = false;
  let vu = !!depart; // the todo has been seen in a snapshot

  const differe = creerDiffere(() => envoyer());

  // --- Elements ---------------------------------------------------------------------------------
  const titre = el("input", {
    type: "text",
    class: "todos-champ todo-editeur-titre",
    id: "todo-titre",
    "aria-label": "Titre",
    placeholder: "Titre",
    maxlength: String(TITRE_MAX * 2),
    autocomplete: "off",
  });
  const description = el("textarea", {
    class: "todo-editeur-description",
    id: "todo-description",
    "aria-label": "Description",
    placeholder: "Écrivez en Markdown…",
    maxlength: String(DESCRIPTION_MAX * 2),
  });
  const apercu = el("div", {
    class: "todo-editeur-apercu markdown",
    "aria-label": "Aperçu de la description",
    role: "region",
    hidden: true,
  });
  const compteur = el("span", { class: "todo-editeur-compteur", "aria-live": "polite", hidden: true });
  const echeance = el("input", { type: "date", class: "todos-champ", id: "todo-echeance" });
  const rapide = (libelle, jour) =>
    el("button", {
      type: "button",
      class: "todo-rapide",
      texte: libelle,
      onclick: () => poserEcheance(jour()),
    });
  const raccourcisDate = el(
    "div",
    { class: "todo-editeur-rapides", role: "group", "aria-label": "Échéances rapides" },
    rapide("Aujourd'hui", () => jourLocal()),
    rapide("Demain", () => ajouterJours(jourLocal(), 1)),
    rapide("Semaine prochaine", () => lundiProchain(jourLocal())),
    rapide("Effacer", () => null),
  );
  const choixSujet = el("select", { class: "todos-champ", id: "todo-sujet", "aria-label": "Sujet" });
  const fait = el("input", { type: "checkbox", id: "todo-fait" });
  const dates = el("p", { class: "todo-editeur-dates" });
  const message = el("p", { class: "todos-message todos-message--erreur", role: "alert", hidden: true });
  const statut = el("span", { class: "todo-editeur-statut", role: "status", "aria-live": "polite" });
  // Banner of the conflicts (V6.7): the text tells what happened, the buttons what can be done.
  const texteBandeau = el("span", { class: "todo-editeur-bandeau-texte" });
  const boutonGarder = el("button", { type: "button", class: "lien-discret", texte: "Garder ma version", onclick: () => garderMaVersion() });
  const boutonPrendre = el("button", { type: "button", class: "lien-discret", texte: "Prendre l'autre", onclick: () => prendreLAutre() });
  const boutonVoir = el("button", { type: "button", class: "lien-discret", texte: "Voir ma version", onclick: () => voirMaVersion() });
  const bandeau = el(
    "div",
    { class: "todo-editeur-bandeau", role: "status", hidden: true },
    texteBandeau,
    boutonGarder,
    boutonPrendre,
    boutonVoir,
  );

  const boutonApercu = el(
    "button",
    {
      type: "button",
      class: "todos-fermer",
      "aria-pressed": "false",
      "aria-label": "Aperçu",
      title: "Aperçu de la description",
      onclick: () => basculer(),
    },
    icone("oeil", { taille: 18 }),
  );
  const boutonPlus = el(
    "button",
    {
      type: "button",
      class: "todos-fermer",
      "aria-haspopup": "menu",
      "aria-label": "Plus d'actions",
      title: "Plus d'actions",
      onclick: () => menuPlus(),
    },
    icone("points", { taille: 18 }),
  );
  const boutonFermer = el(
    "button",
    {
      type: "button",
      class: "todos-fermer",
      "aria-label": "Fermer",
      title: "Fermer (Échap)",
      onclick: () => fermer(),
    },
    icone("fermer", { taille: 18 }),
  );
  const outil = (cle, libelle, contenu, titreBouton) =>
    el("button", {
      type: "button",
      class: "todo-outil",
      "aria-label": libelle,
      title: titreBouton ?? libelle,
      texte: contenu,
      onclick: () => appliquerOutil(cle),
    });
  const barre = el(
    "div",
    { class: "todo-editeur-outils", role: "toolbar", "aria-label": "Mise en forme" },
    outil("gras", "Gras", "G", "Gras (Ctrl+B)"),
    outil("italique", "Italique", "I", "Italique (Ctrl+I)"),
    outil("liste", "Liste", "•", "Liste à puces"),
    outil("case", "Case à cocher", "☐", "Liste de cases à cocher"),
  );

  const dialogue = el(
    "dialog",
    { class: "dialogue todo-editeur", "aria-label": "Éditeur de todo" },
    el(
      "div",
      { class: "todo-editeur-cadre" },
      el(
        "div",
        { class: "todo-editeur-haut" },
        statut,
        el("span", { class: "todo-editeur-espace" }),
        boutonApercu,
        ...complements.map((c) => c.bouton),
        boutonPlus,
        boutonFermer,
      ),
      bandeau,
      el("div", { class: "todo-editeur-depot", hidden: true, "aria-hidden": "true", texte: "Déposez vos images ici" }),
      titre,
      barre,
      description,
      apercu,
      compteur,
      ...complements.map((c) => c.racine).filter(Boolean),
      el(
        "div",
        { class: "todo-editeur-pied" },
        el("label", { class: "todo-editeur-label", for: "todo-echeance" }, "Échéance"),
        echeance,
        raccourcisDate,
        el("label", { class: "todo-editeur-label", for: "todo-sujet" }, "Sujet"),
        choixSujet,
        el("label", { class: "todo-editeur-label todo-editeur-fait", for: "todo-fait" }, fait, "Fait"),
      ),
      dates,
      message,
    ),
  );

  // --- Writes (one after the other) ---------------------------------------------------------------
  const fixerEtat = (e) => {
    etat = e;
    const texte = e === "enCours" ? "Enregistrement…" : e === "horsLigne" ? "Hors ligne" : "Enregistré ✓";
    statut.textContent = id || e === "enCours" ? texte : "";
  };

  const utile = (champs) =>
    (typeof champs.titre === "string" && champs.titre.trim() !== "") ||
    (typeof champs.description === "string" && champs.description.trim() !== "") ||
    champs.echeance != null;

  /** A write is issued at once (the SDK keeps their order, offline too): we do not wait for it. */
  function lancer(promesse) {
    enVol++;
    fixerEtat(navigator.onLine === false ? "horsLigne" : "enCours");
    return promesse
      .catch(() => ({ ok: false, erreur: "L'enregistrement a échoué. Réessayez." }))
      .then((r) => {
        message.hidden = r.ok;
        if (!r.ok) message.textContent = r.erreur;
        return r;
      })
      .finally(() => {
        enVol--;
        if (enVol === 0) fixerEtat(navigator.onLine === false ? "horsLigne" : "enregistre");
      });
  }

  function envoyer() {
    const champs = enAttente;
    enAttente = {};
    if (Object.keys(champs).length === 0) return pret;
    for (const cle of ["titre", "description", "echeance"])
      if (cle in champs) envoye[cle] = champs[cle] ?? "";
    // Nothing exists yet: wait for the first useful input.
    if (!id && !utile(champs)) {
      enAttente = { ...champs, ...enAttente };
      return pret;
    }
    // Only getting the id of a new todo is awaited, so the next writes find it.
    pret = pret.then(async () => {
      if (!id) {
        const neuf = await donnees.nouvelIdTodo();
        id = neuf;
        lancer(donnees.creerTodoAvecId(sujetCourant, valeursPourCreation(champs), neuf)).then((r) => {
          if (!r.ok && id === neuf) id = null;
        });
      } else {
        lancer(donnees.majTodo(id, champs)).then((r) => {
          if (!r.ok && r.code === "not-found") supprimeAilleurs(champs);
        });
      }
    });
    return pret;
  }

  /** Values of the first write: what was typed, and the fields already on screen. */
  const valeursPourCreation = (champs) => ({
    titre: champs.titre ?? titre.value.trim(),
    description: champs.description ?? description.value,
    echeance: champs.echeance !== undefined ? champs.echeance : echeance.value || null,
  });

  function planifier(cle, valeur) {
    enAttente = { ...enAttente, [cle]: valeur };
    fixerEtat("enCours");
    differe.appeler(true);
  }

  async function supprimeAilleurs(champs) {
    const rep = await demander({
      titre: "Ce todo a été supprimé sur un autre appareil",
      message: "Voulez-vous le recréer avec votre version ?",
      boutons: [
        { libelle: "Abandonner", valeur: false },
        { libelle: "Le recréer", valeur: true, principal: true },
      ],
    });
    if (rep) {
      const neuf = await donnees.nouvelIdTodo();
      const r = await donnees.creerTodoAvecId(
        sujetCourant,
        { titre: titre.value.trim(), description: description.value, echeance: echeance.value || null, ...champs },
        neuf,
      );
      if (r.ok) id = neuf;
    } else {
      id = null;
      dialogue.close();
    }
  }

  // --- Typing --------------------------------------------------------------------------------------
  titre.addEventListener("input", () => planifier("titre", titre.value.trim()));
  description.addEventListener("input", () => {
    planifier("description", description.value);
    majCompteur();
  });
  for (const champ of [titre, description]) {
    champ.addEventListener("compositionstart", () => {
      composition = true;
    });
    champ.addEventListener("compositionend", () => {
      composition = false;
      planifier(champ === titre ? "titre" : "description", champ === titre ? champ.value.trim() : champ.value);
    });
  }
  echeance.addEventListener("change", () => {
    const v = echeance.value || null; // an erased date field gives "": no due date
    if (v !== null && !echeanceValide(v)) return;
    planifier("echeance", v);
    differe.vider();
  });
  /** A quick button: the same path as the date field (null erases the due date). */
  function poserEcheance(jour) {
    echeance.value = jour ?? "";
    planifier("echeance", jour);
    differe.vider();
  }
  fait.addEventListener("change", () => {
    if (id) donnees.cocher(id);
  });
  choixSujet.addEventListener("change", async () => {
    const vers = choixSujet.value;
    if (!id) {
      sujetCourant = vers;
      return;
    }
    differe.vider();
    await pret;
    const r = await donnees.deplacerVersSujet(id, vers);
    if (r.ok) sujetCourant = vers;
    else {
      choixSujet.value = sujetCourant;
      message.textContent = r.erreur;
      message.hidden = false;
    }
  });

  function majCompteur() {
    const n = longueur(description.value);
    compteur.hidden = n < 18_000;
    compteur.textContent = `${n.toLocaleString("fr-FR")} / ${DESCRIPTION_MAX.toLocaleString("fr-FR")}`;
  }

  // --- Markdown tools, preview ----------------------------------------------------------------------
  function appliquerOutil(cle) {
    if (!apercu.hidden) return;
    const r = outilMarkdown(description.value, description.selectionStart, description.selectionEnd, cle);
    description.value = r.valeur;
    description.setSelectionRange(r.debut, r.fin);
    description.focus();
    description.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function basculer() {
    const voir = apercu.hidden;
    if (voir) apercu.replaceChildren(rendreMarkdown(description.value));
    apercu.hidden = !voir;
    description.hidden = voir;
    barre.hidden = voir;
    boutonApercu.setAttribute("aria-pressed", String(voir));
    boutonApercu.setAttribute("aria-label", voir ? "Écrire" : "Aperçu");
    boutonApercu.title = voir ? "Revenir à l'écriture" : "Aperçu de la description";
    // The focus follows the mode: the field when writing, the button when reading.
    if (voir) boutonApercu.focus();
    else description.focus();
  }

  dialogue.addEventListener("keydown", (e) => {
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key === "Enter") {
      e.preventDefault();
      fermer();
    } else if (ctrl && (e.key === "b" || e.key === "B") && e.target === description) {
      e.preventDefault();
      appliquerOutil("gras");
    } else if (ctrl && (e.key === "i" || e.key === "I") && e.target === description) {
      e.preventDefault();
      appliquerOutil("italique");
    }
  });
  // Escape: the native "cancel" of the dialog closes it; the "close" event below sends the rest.

  // --- Menu "⋯": export (V6.6) --------------------------------------------------------------------
  /** The todo as it is on screen (what was typed counts even if not yet sent). */
  function todoCourant() {
    const t = donnees.trouver(id);
    return {
      ...t,
      titre: titre.value.trim(),
      description: description.value,
      echeance: echeance.value || null,
    };
  }
  const sujetCourantObjet = () => donnees.etat().sujets.find((s) => s.id === sujetCourant) ?? null;

  function menuPlus() {
    const r = boutonPlus.getBoundingClientRect();
    const existe = !!id && !!donnees.trouver(id);
    const avecImages = existe && (donnees.trouver(id).images?.length ?? 0) > 0;
    ouvrirMenu({
      x: r.left,
      y: r.bottom + 4,
      libelle: "Plus d'actions",
      retourFocus: boutonPlus,
      entrees: [
        {
          libelle: avecImages ? "Exporter en .zip" : "Exporter en .md",
          desactive: !existe,
          info: "Écrivez d'abord quelque chose",
          onChoix: () => {
            differe.vider();
            exporterTodo({ todo: todoCourant(), sujet: sujetCourantObjet(), lireImage: (c) => donnees.lireImage(c) });
          },
        },
        {
          libelle: "Copier en Markdown",
          desactive: !existe,
          info: "Écrivez d'abord quelque chose",
          // Called straight from the click: the clipboard needs a user gesture.
          onChoix: () => copierMarkdown({ todo: todoCourant(), sujet: sujetCourantObjet() }),
        },
      ],
    });
  }

  // --- Snapshots from the server --------------------------------------------------------------------
  const sale = (cle) => cle in enAttente;
  const occupe = (champ, cle) => document.activeElement === champ || composition || sale(cle);

  function afficher() {
    if (!id) return;
    const t = donnees.etat().todos.find((x) => x.id === id);
    if (!t) {
      // Removed here (Annuler is still possible) or elsewhere. Not before the todo has appeared
      // once: a todo just created is in the cache a moment after its id is known.
      if (vu && !ferme && dialogue.open) dialogue.close();
      return;
    }
    vu = true;
    const remplaces = [];
    const poser = (champ, cle, valeur, normaliser) => {
      const decision = decider({
        local: champ.value,
        distante: valeur,
        base: base[cle],
        envoye: envoye[cle],
        occupe: occupe(champ, cle),
        normaliser,
      });
      if (decision === "conflit") distants[cle] = valeur;
      else if (decision === "remplace") {
        // Another device changed a free field: its text takes the place, ours is kept in memory.
        memoireSession.garder(id, cle, champ.value);
        champ.value = valeur;
        remplaces.push(cle);
      } else if (!occupe(champ, cle) && champ.value !== valeur && valeur !== base[cle]) {
        champ.value = valeur;
      }
      if (decision !== "conflit") delete distants[cle];
      base[cle] = valeur;
    };
    poser(titre, "titre", t.titre, (v) => v.trim());
    poser(description, "description", t.description);
    poser(echeance, "echeance", t.echeance ?? "");
    majBandeau(remplaces);
    fait.checked = !!t.fait;
    fait.disabled = false;
    sujetCourant = t.sujetId;
    if (choixSujet.value !== t.sujetId) choixSujet.value = t.sujetId;
    dates.textContent = `Créé ${quand(t.creeLe)} · Modifié ${quand(t.modifieLe)}`;
    majCompteur();
    for (const c of complements) c.maj?.(t);
    if (!apercu.hidden) apercu.replaceChildren(rendreMarkdown(description.value));
  }

  const CHAMPS = { titre, description, echeance };
  const NOMS = { titre: "le titre", description: "la description", echeance: "l'échéance" };
  const liste_ = (cles) => cles.map((c) => NOMS[c]).join(", ");

  /** Shows what happened: a conflict on a field being typed, or a field replaced by the other device. */
  function majBandeau(remplaces = []) {
    const conflits = Object.keys(distants);
    if (conflits.length) {
      texteBandeau.textContent = `Modifié sur un autre appareil : ${liste_(conflits)}.`;
      boutonGarder.hidden = false;
      boutonPrendre.hidden = false;
      boutonVoir.hidden = true;
      bandeau.hidden = false;
    } else if (remplaces.length) {
      texteBandeau.textContent = `Modifié sur un autre appareil : ${liste_(remplaces)}. Votre version est gardée 10 minutes.`;
      boutonGarder.hidden = true;
      boutonPrendre.hidden = true;
      boutonVoir.hidden = false;
      bandeau.hidden = false;
    } else if (!boutonVoir.hidden && !bandeau.hidden) {
      // The "replaced" notice stays until the user acts on it or closes the window.
    } else {
      bandeau.hidden = true;
    }
  }

  /** "Garder ma version": the text on screen is sent and wins (the last write wins). */
  function garderMaVersion() {
    for (const cle of Object.keys(distants)) {
      delete distants[cle];
      const valeur = cle === "titre" ? titre.value.trim() : CHAMPS[cle].value || (cle === "echeance" ? null : "");
      planifier(cle, valeur);
    }
    differe.vider();
    bandeau.hidden = true;
  }

  /** "Prendre l'autre": the other device's text replaces ours, which stays 10 minutes in memory. */
  function prendreLAutre() {
    for (const [cle, valeur] of Object.entries(distants)) {
      memoireSession.garder(id, cle, CHAMPS[cle].value);
      CHAMPS[cle].value = valeur;
      delete enAttente[cle];
      delete distants[cle];
    }
    if (Object.keys(enAttente).length === 0) differe.annuler();
    texteBandeau.textContent = "Version de l'autre appareil reprise. La vôtre est gardée 10 minutes.";
    boutonGarder.hidden = true;
    boutonPrendre.hidden = true;
    boutonVoir.hidden = false;
    fixerEtat("enregistre");
  }

  /** "Voir ma version": brings back the text that was replaced (and sends it, as any edit). */
  function voirMaVersion() {
    for (const cle of ["titre", "description", "echeance"]) {
      const gardee = memoireSession.lire(id, cle);
      if (gardee === undefined) continue;
      CHAMPS[cle].value = gardee;
      memoireSession.oublier(id, cle);
      planifier(cle, cle === "titre" ? gardee.trim() : cle === "echeance" ? gardee || null : gardee);
    }
    differe.vider();
    bandeau.hidden = true;
  }

  // --- Open / close -------------------------------------------------------------------------------------
  function remplirSujets() {
    choixSujet.replaceChildren(
      ...donnees.etat().sujets.map((s) => el("option", { value: s.id, texte: s.nom })),
    );
    choixSujet.value = sujetCourant;
  }
  remplirSujets();

  if (depart) {
    titre.value = depart.titre;
    description.value = depart.description;
    echeance.value = depart.echeance ?? "";
  } else {
    fait.disabled = true;
    dates.textContent = "Rien n'est enregistré tant que vous n'avez rien écrit.";
  }
  afficher();
  majCompteur();
  const desabonner = donnees.abonner(afficher);
  const surEnLigne = () => {
    if (etat === "horsLigne" && navigator.onLine !== false) fixerEtat("enregistre");
  };
  addEventListener("online", surEnLigne);

  /** Closes after sending what waits. An existing todo emptied of everything is offered for removal. */
  async function fermer() {
    if (ferme) return;
    differe.vider();
    await pret;
    if (id && !titre.value.trim() && !description.value.trim() && !echeance.value) {
      const supprimer = await demander({
        titre: "Supprimer ce todo vide ?",
        message: "Il n'a ni titre, ni description, ni échéance.",
        boutons: [
          { libelle: "Le garder", valeur: false },
          { libelle: "Supprimer", valeur: true, danger: true },
        ],
      });
      if (supprimer) {
        const attente = donnees.supprimerTodo(id);
        toast("Todo supprimé", {
          action: { libelle: "Annuler", onClic: () => attente.annuler() },
          cle: "todos-suppression",
        });
      }
    }
    if (dialogue.open) dialogue.close();
  }

  dialogue.addEventListener("cancel", (e) => {
    // Escape: send what waits before closing (and ask about an emptied todo).
    e.preventDefault();
    fermer();
  });
  dialogue.addEventListener("close", () => {
    ferme = true;
    differe.vider();
    desabonner();
    removeEventListener("online", surEnLigne);
    rapatrierToasts();
    dialogue.remove();
    if (ouvert?.dialogue === dialogue) ouvert = null;
    for (const c of complements) c.liberer?.();
    (retourFocus?.isConnected ? retourFocus : null)?.focus?.();
  });

  document.body.append(dialogue);
  dialogue.showModal();
  // No automatic focus on a phone: the keyboard would pop up (V6.9). On a wide screen: the title.
  if (globalThis.matchMedia?.("(min-width: 900px)").matches) titre.focus();
  ouvert = {
    dialogue,
    fermer: () => (dialogue.open ? dialogue.close() : undefined),
    /** Tests and V6.4: the id of the todo, null while nothing is written. */
    id: () => id,
    attendre: () => pret,
    titre,
    description,
    echeance,
    sansTitre: SANS_TITRE,
  };
  for (const c of complements) c.monter?.({ dialogue, id: () => id, assurerExistence: () => assurerExistence() });
  return ouvert;

  /** V6.4: an image needs the todo to exist; creates it (empty) when it does not yet. */
  async function assurerExistence() {
    differe.vider();
    await pret;
    if (id) return id;
    const neuf = await donnees.nouvelIdTodo();
    const r = await donnees.creerTodoAvecId(sujetCourant, valeursPourCreation({}), neuf);
    if (!r.ok) throw new Error(r.erreur);
    id = neuf;
    fait.disabled = false;
    return id;
  }
}
