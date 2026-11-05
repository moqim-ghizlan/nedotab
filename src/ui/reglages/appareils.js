import { derniereActivite } from "../../core/appareils.js";
import { libelleAppareil } from "../../core/appareil.js";
import { demander } from "../dialogues/commun.js";
import { el } from "../dom.js";
import { toast } from "../toast.js";

/**
 * "Mes appareils" (T12): the name of this device (renamable in place) and the list of the
 * account's devices. Removing a device deletes only its entry in the list, never data.
 * Names are written with textContent only.
 * @param {{ appareils: object }} session
 */
export function creerBlocAppareils(session) {
  const service = session.appareils;
  const racine = el("section", { class: "appareils", "aria-labelledby": "titre-appareils" });
  if (!service) {
    racine.hidden = true;
    return racine;
  }
  const edition = false;
  const message = "";

  async function renommer(id, nomActuel) {
    const champ = el("input", {
      id: "renommer-appareil",
      type: "text",
      maxlength: "30",
      autocomplete: "off",
      value: nomActuel,
    });
    const ok = await demander({
      titre: "Renommer l'appareil",
      contenu: [
        el("div", { class: "champ" }, el("label", { for: "renommer-appareil", texte: "Nom" }), champ),
      ],
      boutons: [
        { libelle: "Annuler", valeur: false },
        { libelle: "Renommer", valeur: true, principal: true },
      ],
    });
    if (!ok) return;
    try {
      const r = await service.renommer(id, champ.value);
      if (!r.ok) toast(r.erreur, { type: "erreur" });
    } catch {
      toast("Renommage impossible pour le moment.", { type: "erreur" });
    }
  }

  async function retirer(a) {
    const ok = await demander({
      titre: `Retirer « ${a.nom} » ?`,
      message:
        "Seule son entrée dans la liste disparaît. Vos sites et vos éléments partagés ne sont pas touchés.",
      boutons: [
        { libelle: "Annuler", valeur: false },
        { libelle: "Retirer", valeur: true, principal: true, danger: true },
      ],
    });
    if (!ok) return;
    try {
      await service.retirer(a.id);
    } catch {
      toast("Retrait impossible pour le moment.", { type: "erreur" });
    }
  }

  function rendre() {
    if (edition) return;
    const liste = service.liste();
    const moi = liste.find((a) => a.id === service.id());
    const autres = liste.filter((a) => a.id !== service.id());
    const hors = typeof navigator !== "undefined" && navigator.onLine === false;
    const enfants = [
      el("h3", { id: "titre-appareils", class: "reglages-sous-titre", texte: "Mes appareils" }),
      el(
        "div",
        { class: "appareil-ici" },
        el("span", { class: "appareil-pastille", texte: "Cet appareil" }),
        el("strong", { class: "appareil-nom", texte: moi?.nom ?? "Sans nom" }),
        moi ? el("span", { class: "appareil-type", texte: libelleAppareil(moi.type) }) : null,
        moi
          ? el("button", {
              type: "button",
              class: "bouton bouton--petit",
              texte: "Renommer",
              onclick: () => renommer(moi.id, moi.nom),
            })
          : null,
      ),
      autres.length
        ? el(
            "ul",
            { class: "appareils-liste" },
            autres.map((a) =>
              el(
                "li",
                { class: "appareil-ligne" },
                el(
                  "div",
                  { class: "appareil-infos" },
                  el("strong", { class: "appareil-nom", texte: a.nom }),
                  el("span", {
                    class: "appareil-detail",
                    texte: `${libelleAppareil(a.type)}${a.vuLe ? `, vu ${derniereActivite(a.vuLe)}` : ""}`,
                  }),
                ),
                el("button", {
                  type: "button",
                  class: "bouton bouton--petit",
                  texte: "Renommer",
                  "aria-label": `Renommer ${a.nom}`,
                  onclick: () => renommer(a.id, a.nom),
                }),
                el("button", {
                  type: "button",
                  class: "bouton bouton--petit bouton--danger",
                  texte: "Retirer",
                  "aria-label": `Retirer ${a.nom} de la liste`,
                  onclick: () => retirer(a),
                }),
              ),
            ),
          )
        : el("p", {
            class: "reglages-note",
            texte: moi
              ? "Vos autres appareils apparaîtront ici dès qu'ils seront connectés."
              : "Chargement de la liste…",
          }),
      hors || message
        ? el("p", {
            class: "reglages-note",
            role: "status",
            texte: hors ? "Hors ligne : les changements partent à la reconnexion." : message,
          })
        : null,
    ];
    racine.replaceChildren(...enfants.filter(Boolean));
  }
  service.abonner(rendre);
  window.addEventListener("online", rendre);
  window.addEventListener("offline", rendre);
  rendre();
  return racine;
}
