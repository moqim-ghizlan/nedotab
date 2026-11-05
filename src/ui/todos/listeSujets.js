import Sortable from "sortablejs";
import {
  COULEURS_SUJET,
  LIMITE_SUJETS,
  NOM_SUJET_MAX,
  estPleinSujets,
} from "../../core/sujets.js";
import { demander } from "../dialogues/commun.js";
import { brancherGestes } from "./balayage.js";
import { el } from "../dom.js";
import { icone } from "../icones.js";
import { ouvrirMenu } from "../menuContextuel.js";
import { toast } from "../toast.js";

const REDUIT = () => globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

const LIBELLES_COULEURS = {
  pin: "Pin",
  mer: "Mer",
  ciel: "Ciel",
  prune: "Prune",
  rose: "Rose",
  ambre: "Ambre",
  sable: "Sable",
  ardoise: "Ardoise",
};

/** "Aucun todo", "Tout est fait" or "3 restants": what the line says under the name. */
export function resumeSujet(s) {
  if (s.nbTotal === 0) return "Aucun todo";
  if (s.nbRestants === 0) return "Tout est fait";
  return s.nbRestants === 1 ? "1 restant" : `${s.nbRestants} restants`;
}

/**
 * List of the subjects (V6.1): create, rename in place, colour, remove (with a 5 s "Annuler"),
 * reorder by dragging (SortableJS, 300 ms on touch) or with the arrows on the grip. Names are
 * only ever written with textContent. The lines are kept between two renders (stable keys): the
 * focus, a rename in progress and a drag are never interrupted by a snapshot.
 *
 * @param {object} d
 * @param {ReturnType<import("./donneesTodos.js").creerDonneesTodos>} d.donnees
 * @param {(id: string) => void} d.onOuvrir opens the todos of a subject
 */
export function creerListeSujets({ donnees, onOuvrir }) {
  const lignes = new Map(); // id → { li, corps, nom, resume, barre, plus, poignee }
  let enRenommage = null;
  let glisse = false;
  let renduEnAttente = false;

  const message = el("p", { class: "todos-message", role: "status", "aria-live": "polite", hidden: true });
  const champ = el("input", {
    type: "text",
    class: "todos-champ",
    placeholder: "Nouveau sujet",
    "aria-label": "Nom du nouveau sujet",
    maxlength: String(NOM_SUJET_MAX * 2),
    autocomplete: "off",
  });
  const ajouter = el(
    "button",
    { type: "submit", class: "todos-bouton-ajout", "aria-label": "Ajouter le sujet", title: "Ajouter le sujet" },
    icone("ajouter", { taille: 20 }),
  );
  const formulaire = el("form", { class: "todos-ajout", novalidate: true }, champ, ajouter);
  const liste = el("ul", { class: "todos-sujets" });
  const vide = el("p", {
    class: "todos-vide",
    texte: "Aucun sujet — créez-en un pour ranger vos todos",
    hidden: true,
  });
  const racine = el("div", { class: "todos-vue" }, formulaire, message, vide, liste);

  function dire(texte, erreur = false) {
    message.textContent = texte ?? "";
    message.hidden = !texte;
    message.classList.toggle("todos-message--erreur", !!erreur);
  }

  formulaire.addEventListener("submit", async (e) => {
    e.preventDefault();
    const nom = champ.value;
    if (!nom.trim()) return dire("Donnez un nom au sujet.", true);
    const r = await donnees.ajouterSujet(nom);
    if (!r.ok) return dire(r.erreur, true);
    dire(null);
    champ.value = "";
    champ.focus();
  });
  champ.addEventListener("input", () => message.classList.contains("todos-message--erreur") && dire(null));

  // --- One line -------------------------------------------------------------------------------
  function creerLigne(s) {
    const barre = el("span", { class: "todos-sujet-barre", "aria-hidden": "true" });
    const nom = el("span", { class: "todos-sujet-nom" });
    const resume = el("span", { class: "todos-sujet-resume" });
    const corps = el(
      "button",
      { type: "button", class: "todos-sujet-corps", onclick: () => onOuvrir(s.id) },
      barre,
      el("span", { class: "todos-sujet-textes" }, nom, resume),
      icone("chevron", { taille: 16 }),
    );
    const poignee = el(
      "button",
      {
        type: "button",
        class: "todos-poignee",
        "aria-label": "Déplacer le sujet (flèches haut et bas)",
        title: "Glisser pour déplacer",
      },
      icone("poignee", { taille: 18 }),
    );
    const plus = el(
      "button",
      { type: "button", class: "todos-plus", "aria-haspopup": "menu", title: "Actions du sujet" },
      icone("points", { taille: 18 }),
    );
    const li = el("li", { class: "todos-sujet", dataset: { id: s.id } }, poignee, corps, plus);
    const ligne = { li, corps, nom, resume, barre, plus, poignee, id: s.id };
    plus.addEventListener("click", () => menu(ligne, plus));
    li.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      menu(ligne, null, e);
    });
    poignee.addEventListener("keydown", (e) => touchePoignee(e, ligne));
    return ligne;
  }

  function majLigne(ligne, s) {
    ligne.sujet = s;
    if (enRenommage !== s.id) ligne.nom.textContent = s.nom;
    ligne.resume.textContent = resumeSujet(s);
    ligne.corps.setAttribute("aria-label", `${s.nom}, ${resumeSujet(s)}`);
    ligne.plus.setAttribute("aria-label", `Actions du sujet ${s.nom}`);
    ligne.li.dataset.couleur = s.couleur ?? "";
    ligne.li.classList.toggle("todos-sujet--attente", !!s.enAttente);
  }

  function menu(ligne, bouton, evt) {
    const s = ligne.sujet;
    const r = bouton?.getBoundingClientRect();
    ouvrirMenu({
      x: evt?.clientX ?? r.left,
      y: evt?.clientY ?? r.bottom + 4,
      libelle: `Actions du sujet ${s.nom}`,
      retourFocus: bouton ?? ligne.corps,
      entrees: [
        { libelle: "Renommer", onChoix: () => renommer(ligne) },
        { libelle: "Changer la couleur…", onChoix: () => choisirCouleur(s) },
        "-",
        { libelle: "Supprimer…", danger: true, onChoix: () => supprimer(s) },
      ],
    });
  }

  function renommer(ligne) {
    const s = ligne.sujet;
    enRenommage = s.id;
    const saisie = el("input", {
      type: "text",
      class: "todos-champ todos-champ--en-place",
      value: s.nom,
      "aria-label": "Nouveau nom du sujet",
      maxlength: String(NOM_SUJET_MAX * 2),
    });
    ligne.nom.replaceChildren(saisie);
    let fini = false;
    const terminer = async (valider) => {
      if (fini) return;
      fini = true;
      enRenommage = null;
      ligne.nom.textContent = s.nom;
      if (valider) {
        const r = await donnees.renommer(s.id, saisie.value);
        if (!r.ok) dire(r.erreur, true);
      }
      ligne.corps.focus();
      if (renduEnAttente) rendre();
    };
    saisie.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        terminer(true);
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        terminer(false);
      }
    });
    saisie.addEventListener("blur", () => terminer(true));
    saisie.focus();
    saisie.select();
  }

  async function choisirCouleur(s) {
    let choix;
    const pastilles = el(
      "div",
      { class: "todos-couleurs", role: "group", "aria-label": "Couleur du sujet" },
      [null, ...COULEURS_SUJET].map((c) =>
        el("button", {
          type: "button",
          class: `todos-couleur${c === (s.couleur ?? null) ? " todos-couleur--choisie" : ""}`,
          dataset: { couleur: c ?? "" },
          "aria-label": c ? LIBELLES_COULEURS[c] : "Aucune couleur",
          "aria-pressed": String(c === (s.couleur ?? null)),
          onclick: (ev) => {
            choix = c;
            ev.currentTarget.closest("dialog").close();
          },
        }),
      ),
    );
    await demander({
      titre: "Couleur du sujet",
      contenu: [pastilles],
      boutons: [{ libelle: "Annuler", valeur: null }],
    });
    if (choix === undefined || choix === (s.couleur ?? null)) return;
    const r = await donnees.colorer(s.id, choix);
    if (!r.ok) dire(r.erreur, true);
  }

  async function supprimer(s) {
    if (s.nbTotal > 0) {
      const ok = await demander({
        titre: "Supprimer ce sujet ?",
        message: `« ${s.nom} » et ${s.nbTotal === 1 ? "son todo" : `ses ${s.nbTotal} todos`} seront supprimés.`,
        boutons: [
          { libelle: "Annuler", valeur: false },
          { libelle: "Supprimer", valeur: true, danger: true },
        ],
      });
      if (!ok) return;
    }
    const attente = donnees.supprimerSujet(s.id);
    toast("Supprimé", {
      action: { libelle: "Annuler", onClic: () => attente.annuler() },
      cle: "todos-suppression",
    });
  }

  // --- Reordering ------------------------------------------------------------------------------
  function touchePoignee(e, ligne) {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    const cible = e.key === "ArrowUp" ? ligne.li.previousElementSibling : ligne.li.nextElementSibling;
    if (!cible) return;
    if (e.key === "ArrowUp") liste.insertBefore(ligne.li, cible);
    else liste.insertBefore(ligne.li, cible.nextElementSibling);
    ligne.poignee.focus();
    envoyerOrdre(ligne.id);
  }

  async function envoyerOrdre(id) {
    const li = lignes.get(id)?.li;
    const avant = li?.previousElementSibling?.dataset.id ?? null;
    const r = await donnees.deplacerSujet(id, avant);
    if (!r.ok) dire(r.erreur, true);
  }

  // Touch (V6.9): a long press opens the menu of the subject.
  const gestes = brancherGestes(liste, {
    surAppuiLong: (id, x, y) => lignes.get(id) && menu(lignes.get(id), null, { clientX: x, clientY: y }),
  });

  const tri = Sortable.create(liste, {
    handle: ".todos-poignee",
    animation: REDUIT() ? 0 : 150,
    delay: 300,
    delayOnTouchOnly: true,
    scroll: true,
    forceFallback: false,
    onStart: () => {
      glisse = true;
    },
    onEnd: (evt) => {
      glisse = false;
      envoyerOrdre(evt.item.dataset.id).finally(() => renduEnAttente && rendre());
    },
  });

  // --- Render ------------------------------------------------------------------------------------
  function rendre() {
    // Never while dragging or typing a new name: the next snapshot will do it.
    if (glisse || enRenommage) {
      renduEnAttente = true;
      return;
    }
    renduEnAttente = false;
    const { sujets, compteurs } = donnees.etat();
    const vus = new Set();
    let precedent = null;
    for (const s of sujets) {
      vus.add(s.id);
      let ligne = lignes.get(s.id);
      if (!ligne) {
        ligne = creerLigne(s);
        lignes.set(s.id, ligne);
      }
      majLigne(ligne, s);
      // Only moves the node when it is not already at the right place.
      const attendu = precedent ? precedent.nextElementSibling : liste.firstElementChild;
      if (attendu !== ligne.li) liste.insertBefore(ligne.li, attendu);
      precedent = ligne.li;
    }
    for (const [id, ligne] of lignes) {
      if (vus.has(id)) continue;
      ligne.li.remove();
      lignes.delete(id);
    }
    const plein = estPleinSujets(compteurs.nbSujets) || sujets.length >= LIMITE_SUJETS;
    champ.disabled = plein;
    ajouter.disabled = plein;
    champ.placeholder = plein ? `${LIMITE_SUJETS} sujets maximum` : "Nouveau sujet";
    vide.hidden = sujets.length > 0 || donnees.etat().statut !== "ok";
  }

  return {
    racine,
    rendre,
    /** Focus on the field "Nouveau sujet" (on a wide screen only: no keyboard on a phone). */
    focusAjout: () => champ.focus(),
    liberer() {
      gestes();
      tri.destroy();
    },
  };
}
