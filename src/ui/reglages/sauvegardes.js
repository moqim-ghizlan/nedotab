import { libelleAppareilAffiche } from "../../core/appareils.js";
import { dateHeure, dateRelative, NOM_MAX } from "../../core/sauvegardes.js";
import { plateforme } from "../../platform/index.js";
import { demander } from "../dialogues/commun.js";
import { ouvrirApercu } from "./apercuSauvegarde.js";
import { el } from "../dom.js";
import { toast } from "../toast.js";

const TYPES = {
  auto: { symbole: "⟲", libelle: "Automatique" },
  manuelle: { symbole: "★", libelle: "Manuelle" },
  "avant-restauration": { symbole: "↺", libelle: "Avant restauration" },
};

/**
 * Finger: a swipe to the left on a row asks to delete it (V3.8). The row follows the finger
 * a little and comes back; a mostly vertical gesture is a scroll and is left alone.
 */
function glisserPourSupprimer(ligne, supprimer) {
  let depart = null;
  ligne.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "touch") depart = { x: e.clientX, y: e.clientY, id: e.pointerId };
  });
  ligne.addEventListener("pointermove", (e) => {
    if (!depart || e.pointerId !== depart.id) return;
    const dx = e.clientX - depart.x;
    if (dx < 0 && Math.abs(dx) > Math.abs(e.clientY - depart.y)) {
      ligne.style.transform = `translateX(${Math.max(dx, -96)}px)`;
    }
  });
  const fin = (e) => {
    if (!depart || e.pointerId !== depart.id) return;
    const dx = e.clientX - depart.x;
    const dy = e.clientY - depart.y;
    depart = null;
    ligne.style.transform = "";
    if (e.type === "pointerup" && dx < -70 && Math.abs(dx) > Math.abs(dy) * 1.5) supprimer();
  };
  ligne.addEventListener("pointerup", fin);
  ligne.addEventListener("pointercancel", fin);
}

const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? "s" : ""}`;

/**
 * "Sauvegardes" section of the settings (read-only list in V2.7): "Sauvegarder
 * maintenant", filter All / Automatic / Manual, pages of 20, deletion of manual backups.
 * The list is only loaded when the section is opened (each backup is a full document).
 */
export function sectionSauvegardes(service, restauration, appareils = null) {
  /** T12: "work-pc" (current name by id) or the kind of device for older copies. */
  const nomAppareil = (s) =>
    libelleAppareilAffiche({ appareilId: s.appareilId, type: s.appareil }, appareils?.liste() ?? []);
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

  /** "Aperçu" button: preview, then restore (the list reloads: a safety copy was added). */
  const boutonApercu = (titre, sous, source, apres) =>
    el("button", {
      type: "button",
      class: "lien-discret",
      texte: "Aperçu",
      "aria-label": `Aperçu de ${titre}`,
      onclick: async () => {
        const r = await ouvrirApercu(restauration, { titre, sous, source });
        if (r?.ok) apres();
      },
    });

  /** Copies of this computer (V2.3): same preview and restore. */
  const copies = el("ul", { class: "liste-sauvegardes liste-copies" });
  const titreCopies = el("p", {
    class: "reglages-libelle",
    texte: "Copies sur cet appareil",
    hidden: true,
  });
  const chargerCopies = async () => {
    const liste = await plateforme.copies.lister().catch(() => []);
    titreCopies.hidden = liste.length === 0;
    copies.replaceChildren(
      ...liste.map((c) => {
        const sous = `Copie du ${dateHeure(c.date)}`;
        return el(
          "li",
          { class: "sauvegarde" },
          el("span", { class: "sauvegarde-type", "aria-hidden": "true", texte: "⌂" }),
          el("div", { class: "sauvegarde-texte" }, el("strong", { texte: sous })),
          restauration
            ? boutonApercu("Copie de cet appareil", sous, { ...c.etat, creeLe: c.date }, () => {
                chargerCopies();
                if (service.enCompte()) charger(true);
              })
            : null,
        );
      }),
    );
  };

  /** Deletion of a manual backup, after confirmation. */
  const supprimerSauvegarde = async (s) => {
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
  };

  const ligne = (s) => {
    const t = TYPES[s.type] ?? TYPES.auto;
    const sous = `${s.creeLe ? dateHeure(s.creeLe) : "En cours…"}, ${nomAppareil(s)}`;
    return el(
      "li",
      {
        class: `sauvegarde${s.type === "avant-restauration" ? " sauvegarde--avant" : ""}`,
        dataset: { id: s.id },
      },
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
          texte: `${s.creeLe ? dateRelative(s.creeLe) : "En cours…"}, ${nomAppareil(s)}, ${pluriel(s.nbSites ?? 0, "site")} et ${pluriel(s.nbDossiers ?? 0, "dossier")}`,
        }),
      ),
      restauration ? boutonApercu(s.nom || t.libelle, sous, s, () => charger(true)) : null,
      s.type === "manuelle"
        ? el("button", {
            type: "button",
            class: "lien-discret",
            texte: "Supprimer",
            "aria-label": `Supprimer la sauvegarde ${s.nom ?? ""}`,
            onclick: () => supprimerSauvegarde(s),
          })
        : null,
    );
  };

  let chargement = false;
  async function charger(depuisLeDebut) {
    if (chargement && !depuisLeDebut) return;
    chargement = true;
    try {
      await chargerPage(depuisLeDebut);
    } finally {
      chargement = false;
    }
  }
  async function chargerPage(depuisLeDebut) {
    if (depuisLeDebut) {
      suite = null;
      liste.replaceChildren();
    }
    etat.textContent = "Chargement…";
    try {
      const fb = await service.charger();
      const r = await fb.listerSauvegardes(service.uid(), { type: filtre, apres: suite });
      suite = r.suite;
      liste.append(
        ...r.sauvegardes.map((s) => {
          const li = ligne(s);
          if (s.type === "manuelle") glisserPourSupprimer(li, () => supprimerSauvegarde(s));
          return li;
        }),
      );
      plus.hidden = !suite;
      etat.textContent = liste.children.length ? "" : "Aucune sauvegarde pour l'instant.";
    } catch {
      etat.textContent = "Liste indisponible hors ligne.";
    }
  }
  plus.addEventListener("click", () => charger(false));
  // Pages of 20 load by themselves when the end of the list comes near (finger scrolling).
  if (globalThis.IntersectionObserver) {
    new IntersectionObserver(
      (entrees) => {
        if (entrees.some((e) => e.isIntersecting) && !plus.hidden) charger(false);
      },
      { rootMargin: "200px" },
    ).observe(plus);
  }

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
      titreCopies,
      copies,
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
      titreCopies,
      copies,
    );
    charger(true);
  }
  chargerCopies();
  return { section };
}
