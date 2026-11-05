import { derniereActivite, validerNomAppareil } from "../../core/appareils.js";
import { libelleAppareil } from "../../core/appareil.js";
import { el } from "../dom.js";
import { demander } from "./commun.js";

const SUGGESTIONS = ["Maison", "Travail", "Téléphone"];

/** "Déjà dans ma liste ?": the devices of the account, to take one of them back. */
async function choisirExistant(existants) {
  const choix = await demander({
    titre: "Cet appareil est-il déjà dans la liste ?",
    message: "Choisissez-le pour reprendre son nom et éviter un doublon.",
    pile: true,
    boutons: [
      ...existants.map((a) => ({
        libelle: a.nom,
        detail: `${libelleAppareil(a.type)}${a.vuLe ? `, vu ${derniereActivite(a.vuLe)}` : ""}`,
        valeur: `id:${a.id}`,
      })),
      { libelle: "Nouvel appareil", valeur: "nouveau" },
    ],
  });
  return typeof choix === "string" && choix.startsWith("id:") ? choix.slice(3) : null;
}

/**
 * First launch on a device (T12): "Comment appelez-vous cet appareil ?". Never blocking:
 * "Plus tard" keeps the suggested name.
 * @returns {Promise<{ mode: "nom", nom: string } | { mode: "reprendre", id: string }>}
 */
export async function demanderNomAppareil({ suggestion, existants = [] }) {
  for (;;) {
    const champ = el("input", {
      id: "nom-appareil",
      type: "text",
      maxlength: "30",
      autocomplete: "off",
      value: suggestion,
      "aria-describedby": "nom-appareil-erreur",
    });
    const erreur = el("p", { id: "nom-appareil-erreur", class: "champ-erreur", role: "alert" });
    const puces = el(
      "div",
      { class: "puces-suggestions" },
      SUGGESTIONS.map((nom) =>
        el("button", {
          type: "button",
          class: "puce",
          texte: nom,
          onclick: () => {
            champ.value = nom;
            champ.focus();
          },
        }),
      ),
    );
    const resultat = await demander({
      titre: "Comment appelez-vous cet appareil ?",
      message:
        "Ce nom s'affiche dans l'espace de partage et les sauvegardes (« depuis Maison »). Vous pourrez le changer dans les réglages.",
      contenu: [
        el("div", { class: "champ" }, el("label", { for: "nom-appareil", texte: "Nom" }), champ),
        erreur,
        puces,
      ],
      boutons: [
        { libelle: "Plus tard", valeur: "plus-tard" },
        ...(existants.length ? [{ libelle: "Déjà dans ma liste…", valeur: "existant" }] : []),
        { libelle: "Enregistrer", valeur: "ok", principal: true },
      ],
    });
    if (resultat === "existant") {
      const id = await choisirExistant(existants);
      if (id) return { mode: "reprendre", id };
      continue;
    }
    if (resultat === "plus-tard" || resultat == null) return { mode: "nom", nom: suggestion };
    const verdict = validerNomAppareil(champ.value, existants);
    if (verdict.ok) return { mode: "nom", nom: verdict.nom };
    // Invalid or already used: say why and ask again with what was typed.
    suggestion = champ.value.trim() || suggestion;
    await demander({
      titre: "Nom refusé",
      message: verdict.erreur,
      boutons: [{ libelle: "Modifier", valeur: true, principal: true }],
    });
  }
}
