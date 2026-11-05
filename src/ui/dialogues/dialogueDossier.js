import { A } from "../../core/actions.js";
import { el } from "../dom.js";
import { creerIconeDossier } from "../tuileDossier.js";
import { demander } from "./commun.js";
import { creerEditeurIcone } from "./editerIcone.js";

/**
 * "Modifier le dossier" (T11): name and icon. The icon editor is the one of the sites (no
 * "automatic" mode: a folder has no favicon; built-in glyphs instead). Cancel changes nothing.
 */
export async function ouvrirEditionDossier(store, dossier, { retourFocus, apresModification } = {}) {
  let titre = dossier.titre;
  let icone = dossier.icone ?? null;
  const apercu = el("div", { class: "dossier-apercu-dialogue" });
  const champ = el("input", {
    id: "dossier-nom",
    type: "text",
    maxlength: "40",
    autocomplete: "off",
    value: titre,
    placeholder: "Dossier",
  });
  const dessiner = () =>
    apercu.replaceChildren(
      el(
        "div",
        { class: "tuile tuile--dossier" },
        creerIconeDossier({ ...dossier, titre, ...(icone ? { icone } : { icone: undefined }) }),
      ),
    );
  champ.addEventListener("input", () => {
    titre = champ.value;
  });
  const editeur = creerEditeurIcone({
    iconeInitiale: icone ?? {},
    lireSite: () => ({ titre: champ.value, url: "" }),
    onChange: (i) => {
      icone = i;
      dessiner();
    },
    modes: ["glyphe", "lettre", "url", "import"],
    modeInitial: icone ? undefined : "glyphe",
  });
  dessiner();
  const ok = await demander({
    titre: "Modifier le dossier",
    contenu: [
      apercu,
      el("div", { class: "champ" }, el("label", { for: "dossier-nom", texte: "Nom" }), champ),
      editeur.racine,
    ],
    boutons: [
      ...(dossier.icone ? [{ libelle: "Réinitialiser l'icône", valeur: "reset", danger: true }] : []),
      { libelle: "Annuler", valeur: false },
      { libelle: "Enregistrer", valeur: true, principal: true },
    ],
    retourFocus,
  });
  editeur.arreter();
  if (!ok) return false;
  if (ok === "reset") {
    store.envoyer({ type: A.DOSSIER_ICONE, id: dossier.id, icone: null });
  } else {
    if (champ.value.trim() && champ.value.trim() !== dossier.titre)
      store.envoyer({ type: A.DOSSIER_RENOMMER, id: dossier.id, titre: champ.value });
    // An untouched editor leaves the icon as it was.
    const lue = editeur.lire();
    const choisie = icone && lue && Object.keys(lue).length ? lue : dossier.icone;
    if (choisie && JSON.stringify(choisie) !== JSON.stringify(dossier.icone ?? null))
      store.envoyer({ type: A.DOSSIER_ICONE, id: dossier.id, icone: choisie });
  }
  apresModification?.();
  return true;
}
