import { COULEURS_SUJET, NOM_SUJET_MAX } from "../../core/sujets.js";
import { demander } from "../dialogues/commun.js";
import { el } from "../dom.js";
import { icone } from "../icones.js";
import { ouvrirMenu } from "../menuContextuel.js";
import { toast } from "../toast.js";
import { reconcilier } from "./listeCle.js";

const NOMS_COULEURS = { pin: "Pin", mer: "Mer", ciel: "Ciel", prune: "Prune", rose: "Rose", ambre: "Ambre", sable: "Sable", ardoise: "Ardoise" };

/**
 * The subjects as a strip of tabs at the top of the panel: one tap changes the subject, "+" adds
 * one, "⋯" renames, colours or removes the chosen one. A removal asks first when the subject holds
 * todos, then can be cancelled for 5 s. Names are only ever written with textContent.
 *
 * @param {object} d
 * @param {ReturnType<import("./donneesTodos.js").creerDonneesTodos>} d.donnees
 */
export function creerBandeauSujets({ donnees }) {
  const lignes = new Map();
  // The chosen subject is one button; it opens the LIST of all the subjects (there can be many).
  const onglets = el("div", { class: "sujets-liste", role: "listbox", "aria-label": "Sujets", hidden: true });
  const courantPoint = el("span", { class: "sujet-point", "aria-hidden": "true" });
  const courantNom = el("span", { class: "sujet-courant-nom" });
  const courantReste = el("span", { class: "sujet-reste", hidden: true });
  const courantBtn = el(
    "button",
    { type: "button", class: "sujet-courant", "aria-haspopup": "listbox", "aria-expanded": "false", onclick: () => basculerListe(onglets.hidden) },
    courantPoint,
    courantNom,
    courantReste,
    icone("bas", { taille: 16 }),
  );
  const plus = el("button", { type: "button", class: "sujets-plus", "aria-label": "Nouveau sujet", title: "Nouveau sujet", onclick: () => ouvrirFormulaire(true) }, icone("ajouter", { taille: 18 }));
  const menu = el("button", { type: "button", class: "sujets-menu", "aria-haspopup": "menu", "aria-label": "Actions du sujet", title: "Actions du sujet", onclick: () => ouvrirActions() }, icone("points", { taille: 18 }));
  const champ = el("input", { type: "text", class: "todos-champ", placeholder: "Nom du sujet", "aria-label": "Nom du nouveau sujet", maxlength: String(NOM_SUJET_MAX * 2), autocomplete: "off", enterkeyhint: "done" });
  const message = el("p", { class: "todos-message", role: "status", "aria-live": "polite", hidden: true });
  const creer = el("button", { type: "submit", class: "bouton bouton--principal", texte: "Créer" });
  const formulaire = el("form", { class: "sujets-formulaire", novalidate: true, hidden: true }, champ, creer);
  const racine = el("div", { class: "sujets" }, el("div", { class: "sujets-rangee" }, courantBtn, plus, menu), onglets, formulaire, message);

  function basculerListe(ouvrir) {
    onglets.hidden = !ouvrir;
    courantBtn.setAttribute("aria-expanded", String(ouvrir));
    if (ouvrir) (onglets.querySelector('[aria-selected="true"]') ?? onglets.querySelector("[role=option]"))?.focus();
  }

  function ouvrirFormulaire(oui) {
    formulaire.hidden = !oui;
    message.hidden = true;
    if (oui) champ.focus();
    else plus.focus();
  }
  formulaire.addEventListener("submit", async (e) => {
    e.preventDefault();
    const r = await donnees.ajouterSujet(champ.value);
    if (!r.ok) {
      message.textContent = r.erreur;
      message.hidden = false;
      message.classList.add("todos-message--erreur");
      return;
    }
    champ.value = "";
    ouvrirFormulaire(false);
  });
  formulaire.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !formulaire.hidden && donnees.etat().sujets.length > 0) {
      e.preventDefault();
      e.stopPropagation();
      ouvrirFormulaire(false);
    }
  });

  function creerLigne(s) {
    const point = el("span", { class: "sujet-point", "aria-hidden": "true" });
    const nom = el("span", { class: "sujet-nom" });
    const reste = el("span", { class: "sujet-reste" });
    const li = el("button", { type: "button", role: "option", class: "sujet", onclick: () => { donnees.choisir(s.id); basculerListe(false); courantBtn.focus(); } }, point, nom, reste);
    li.dataset.id = s.id;
    const ligne = {
      li,
      maj(x) {
        nom.textContent = x.nom;
        reste.textContent = x.nbRestants > 0 ? String(x.nbRestants) : "";
        reste.hidden = x.nbRestants === 0;
        li.dataset.couleur = x.couleur ?? "";
        const actif = donnees.etat().sujetId === x.id;
        li.setAttribute("aria-selected", String(actif));
        li.tabIndex = actif ? 0 : -1;
        li.setAttribute("aria-label", `${x.nom}${x.nbRestants ? `, ${x.nbRestants} à faire` : ""}`);
      },
    };
    ligne.maj(s);
    return ligne;
  }

  // Arrows move in the list, Escape closes it.
  onglets.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      basculerListe(false);
      courantBtn.focus();
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    const liste = [...onglets.querySelectorAll("[role=option]")];
    const i = liste.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    liste[e.key === "Home" ? 0 : e.key === "End" ? liste.length - 1 : (i + (e.key === "ArrowDown" ? 1 : -1) + liste.length) % liste.length].focus();
  });

  // --- Actions on the chosen subject -------------------------------------------------------------------------
  const courant = () => {
    const e = donnees.etat();
    return e.sujets.find((s) => s.id === e.sujetId) ?? null;
  };

  async function demanderNom(s) {
    const saisie = el("input", { type: "text", class: "todos-champ", value: s.nom, "aria-label": "Nom du sujet", maxlength: String(NOM_SUJET_MAX * 2) });
    const ok = await demander({
      titre: "Renommer le sujet",
      contenu: [saisie],
      boutons: [{ libelle: "Annuler", valeur: false }, { libelle: "Renommer", valeur: true, principal: true }],
    });
    if (!ok) return;
    const r = await donnees.renommer(s.id, saisie.value);
    if (!r.ok) toast(r.erreur, { type: "erreur" });
  }

  async function demanderCouleur(s) {
    let choix;
    const pastilles = el(
      "div",
      { class: "todos-couleurs", role: "group", "aria-label": "Couleur du sujet" },
      [null, ...COULEURS_SUJET].map((c) =>
        el("button", {
          type: "button",
          class: `todos-couleur${c === (s.couleur ?? null) ? " todos-couleur--choisie" : ""}`,
          dataset: { couleur: c ?? "" },
          "aria-label": c ? NOMS_COULEURS[c] : "Aucune couleur",
          "aria-pressed": String(c === (s.couleur ?? null)),
          onclick: (ev) => {
            choix = c;
            ev.currentTarget.closest("dialog").close();
          },
        }),
      ),
    );
    await demander({ titre: "Couleur du sujet", contenu: [pastilles], boutons: [{ libelle: "Annuler", valeur: null }] });
    if (choix === undefined || choix === (s.couleur ?? null)) return;
    const r = await donnees.colorer(s.id, choix);
    if (!r.ok) toast(r.erreur, { type: "erreur" });
  }

  async function demanderSuppression(s) {
    if (s.nbTotal > 0) {
      const ok = await demander({
        titre: "Supprimer ce sujet ?",
        message: `« ${s.nom} » et ${s.nbTotal === 1 ? "son todo" : `ses ${s.nbTotal} todos`} seront supprimés.`,
        boutons: [{ libelle: "Annuler", valeur: false }, { libelle: "Supprimer", valeur: true, danger: true }],
      });
      if (!ok) return;
    }
    const attente = donnees.supprimerSujet(s.id);
    toast("Sujet supprimé", { action: { libelle: "Annuler", onClic: () => attente.annuler() }, cle: "todos-suppression" });
  }

  function ouvrirActions() {
    const s = courant();
    if (!s) return;
    const r = menu.getBoundingClientRect();
    ouvrirMenu({
      x: r.right - 180,
      y: r.bottom + 4,
      libelle: `Actions du sujet ${s.nom}`,
      retourFocus: menu,
      entrees: [
        { libelle: "Renommer", onChoix: () => demanderNom(s) },
        { libelle: "Changer la couleur", onChoix: () => demanderCouleur(s) },
        "-",
        { libelle: "Supprimer le sujet", danger: true, onChoix: () => demanderSuppression(s) },
      ],
    });
  }

  function rendre() {
    const e = donnees.etat();
    reconcilier(onglets, lignes, e.sujets, creerLigne);
    // The chosen subject, on the button; the list marks it.
    for (const l of lignes.values()) {
      const choisi = l.li.dataset.id === e.sujetId;
      l.li.setAttribute("aria-selected", String(choisi));
      l.li.tabIndex = choisi ? 0 : -1;
    }
    const actuel = e.sujets.find((x) => x.id === e.sujetId);
    courantNom.textContent = actuel?.nom ?? "Choisir un sujet";
    courantBtn.dataset.couleur = actuel?.couleur ?? "";
    courantReste.textContent = actuel?.nbRestants ? String(actuel.nbRestants) : "";
    courantReste.hidden = !actuel?.nbRestants;
    const vide = e.sujets.length === 0;
    menu.hidden = vide;
    courantBtn.hidden = vide;
    if (vide) basculerListe(false);
    // With no subject the form below is the welcome: no "+" beside it.
    plus.hidden = vide;
    plus.disabled = e.compteurs.nbSujets >= 30;
    plus.title = plus.disabled ? "30 sujets maximum" : "Nouveau sujet";
    // Nothing yet: the form is the welcome.
    if (vide && e.statut === "ok" && formulaire.hidden) formulaire.hidden = false;
  }

  return { racine, rendre, focusAjout: () => ouvrirFormulaire(true), formulaireVisible: () => !formulaire.hidden };
}
