import { dateHeure, NOM_MAX } from "../../core/sauvegardes.js";
import { demander } from "../dialogues/commun.js";
import { el } from "../dom.js";
import { toast } from "../toast.js";

const TYPES = {
  auto: { symbole: "⟲", libelle: "Automatique" },
  manuelle: { symbole: "★", libelle: "Manuelle" },
  "avant-restauration": { symbole: "↺", libelle: "Avant restauration" },
};

const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? "s" : ""}`;

/**
 * "Sauvegardes" section of the settings (read-only list in V2.7): "Sauvegarder
 * maintenant", filter All / Automatic / Manual, pages of 20, deletion of manual backups.
 * The list is only loaded when the section is opened (each backup is a full document).
 */
export function sectionSauvegardes(service) {
  const contenu = el("div", { class: "sauvegardes" });
  const section = el(
    "section",
    { class: "reglages-section", "aria-labelledby": "titre-sauvegardes" },
    el("h3", { id: "titre-sauvegardes", texte: "Sauvegardes" }),
    contenu,
  );
  let filtre = null;
  let suite = null;
  const liste = el("ul", { class: "liste-sauvegardes" });
  const plus = el("button", {
    type: "button",
    class: "lien-discret",
    texte: "Afficher plus",
    hidden: true,
  });
  const etat = el("p", { class: "reglages-note", "aria-live": "polite" });

  const ligne = (s) => {
    const t = TYPES[s.type] ?? TYPES.auto;
    return el(
      "li",
      { class: "sauvegarde", dataset: { id: s.id } },
      el("span", {
        class: "sauvegarde-type",
        title: t.libelle,
        "aria-label": t.libelle,
        texte: t.symbole,
      }),
      el(
        "div",
        { class: "sauvegarde-texte" },
        el("strong", { texte: s.nom || t.libelle }),
        el("span", {
          texte: `${s.creeLe ? dateHeure(s.creeLe) : "En cours…"}, ${s.appareil === "pwa" ? "iPhone / iPad" : "Chrome"}, ${pluriel(s.nbSites ?? 0, "site")} et ${pluriel(s.nbDossiers ?? 0, "dossier")}`,
        }),
      ),
      s.type === "manuelle"
        ? el("button", {
            type: "button",
            class: "lien-discret",
            texte: "Supprimer",
            "aria-label": `Supprimer la sauvegarde ${s.nom ?? ""}`,
            onclick: async () => {
              const ok = await demander({
                titre: "Supprimer cette sauvegarde",
                message: `« ${s.nom || "Sauvegarde manuelle"} » sera supprimée définitivement.`,
                boutons: [
                  { libelle: "Annuler", valeur: false },
                  { libelle: "Supprimer", valeur: true, principal: true, danger: true },
                ],
              });
              if (!ok) return;
              const fb = await service.charger();
              await fb.supprimerSauvegarde(service.uid(), s.id);
              charger(true);
            },
          })
        : null,
    );
  };

  async function charger(depuisLeDebut) {
    if (depuisLeDebut) {
      suite = null;
      liste.replaceChildren();
    }
    etat.textContent = "Chargement…";
    try {
      const fb = await service.charger();
      const r = await fb.listerSauvegardes(service.uid(), { type: filtre, apres: suite });
      suite = r.suite;
      liste.append(...r.sauvegardes.map(ligne));
      plus.hidden = !suite;
      etat.textContent = liste.children.length ? "" : "Aucune sauvegarde pour l'instant.";
    } catch {
      etat.textContent = "Liste indisponible hors ligne.";
    }
  }
  plus.addEventListener("click", () => charger(false));

  const filtres = el("div", { class: "segments", role: "radiogroup", "aria-label": "Filtre" });
  for (const [valeur, texte] of [
    [null, "Toutes"],
    ["auto", "Automatiques"],
    ["manuelle", "Manuelles"],
  ]) {
    filtres.append(
      el("button", {
        type: "button",
        class: "segment",
        role: "radio",
        "aria-checked": String(valeur === filtre),
        texte,
        onclick: (e) => {
          filtre = valeur;
          for (const b of filtres.children)
            b.setAttribute("aria-checked", String(b === e.currentTarget));
          charger(true);
        },
      }),
    );
  }

  const sauvegarder = async () => {
    const champ = el("input", {
      id: "nom-sauvegarde",
      type: "text",
      maxlength: String(NOM_MAX),
      autocomplete: "off",
    });
    const ok = await demander({
      titre: "Sauvegarder maintenant",
      contenu: [
        el(
          "div",
          { class: "champ" },
          el("label", { for: "nom-sauvegarde", texte: "Nom (facultatif)" }),
          champ,
        ),
      ],
      boutons: [
        { libelle: "Annuler", valeur: false },
        { libelle: "Sauvegarder", valeur: true, principal: true },
      ],
    });
    if (!ok) return;
    const r = await service.sauvegarderManuelle(champ.value);
    if (!r.ok) {
      toast(r.erreur, { type: "erreur", duree: 7000 });
      return;
    }
    toast("Sauvegarde créée");
    charger(true);
  };

  if (!service.enCompte()) {
    contenu.append(
      el("p", {
        class: "reglages-note",
        texte: "Connectez-vous pour activer les sauvegardes automatiques.",
      }),
    );
  } else {
    contenu.append(
      el("p", {
        class: "reglages-note",
        texte:
          "Une sauvegarde automatique par jour (30 gardées) ; les sauvegardes manuelles ne sont jamais effacées automatiquement.",
      }),
      el("button", {
        type: "button",
        class: "bouton",
        texte: "Sauvegarder maintenant",
        onclick: sauvegarder,
      }),
      filtres,
      liste,
      plus,
      etat,
    );
    charger(true);
  }
  return { section };
}
