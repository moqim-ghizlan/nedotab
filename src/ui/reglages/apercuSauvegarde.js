import { compter } from "../../core/fusion.js";
import { resumer } from "../../core/differences.js";
import { dateHeure } from "../../core/sauvegardes.js";
import { demander } from "../dialogues/commun.js";
import { el } from "../dom.js";
import { creerIcone } from "../tuile.js";
import { toast } from "../toast.js";

const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? "s" : ""}`;

/** Read-only, foldable tree of folders and sites. */
function arbre(elements) {
  return el(
    "ul",
    { class: "apercu-arbre" },
    elements.map((e) =>
      e.type === "dossier"
        ? el(
            "li",
            {},
            el(
              "details",
              {},
              el("summary", { texte: `${e.titre} (${pluriel(compter(e.items).sites, "site")})` }),
              arbre(e.items),
            ),
          )
        : el(
            "li",
            { class: "apercu-site" },
            el("span", { class: "apercu-icone" }, creerIcone(e)),
            el("span", { texte: e.titre }),
          ),
    ),
  );
}

function liste(titre, elements, texte) {
  if (!elements.length) return null;
  return el(
    "details",
    { class: "apercu-differences" },
    el("summary", { texte: `${titre} (${elements.length})` }),
    el(
      "ul",
      {},
      elements.map((x) => el("li", { texte: texte(x) })),
    ),
  );
}

/**
 * Preview of a backup (or a local copy) before restoring it: header, differences with the
 * current grid, tree; then "Restaurer cette version", confirmed, with "Annuler" for 10 s.
 * @param {{ titre: string, sous: string, source: object }} options
 */
export async function ouvrirApercu(restauration, { titre, sous, source }) {
  const prepare = restauration.preparer(source);
  const d = prepare.differences;
  const { sites, dossiers } = compter(prepare.etat.grille);
  const horsLigne = restauration.enCompte() && restauration.horsLigne();
  const impossible = prepare.lectureSeule
    ? "Créée par une version plus récente de NedoTab : restauration impossible."
    : horsLigne
      ? "Restauration indisponible hors ligne."
      : null;
  const contenu = [
    el("p", {
      class: "dialogue-message",
      texte: `${sous} — ${pluriel(sites, "site")} et ${pluriel(dossiers, "dossier")}`,
    }),
    el("p", { class: "apercu-resume", texte: `Par rapport à maintenant : ${resumer(d)}` }),
    liste("Sites qui reviennent", d.ajoutes, (e) => e.titre),
    liste("Sites qui disparaissent", d.retires, (e) => e.titre),
    liste(
      "Éléments déplacés",
      d.deplaces,
      (x) => `${x.element.titre} → ${x.vers.map((c) => c.titre).join(" › ") || "Accueil"}`,
    ),
    liste("Éléments renommés", d.renommes, (x) => `${x.ancien} → ${x.nouveau}`),
    prepare.fondPerdu
      ? el("p", {
          class: "reglages-note",
          texte: "Son fond d'écran a été supprimé depuis : le fond sera « aucun ».",
        })
      : null,
    el(
      "details",
      { class: "apercu-contenu" },
      el("summary", { texte: "Contenu de la sauvegarde" }),
      arbre(prepare.etat.grille),
    ),
    impossible ? el("p", { class: "compte-erreur", texte: impossible }) : null,
  ].filter(Boolean);
  const choix = await demander({
    titre,
    contenu,
    boutons: [
      { libelle: "Fermer", valeur: false },
      ...(impossible
        ? []
        : [{ libelle: "Restaurer cette version", valeur: true, principal: true }]),
    ],
  });
  if (!choix) return null;
  const perdues = restauration.nonEnvoyees?.() ?? 0;
  const abandon =
    perdues === 1
      ? " 1 modification pas encore envoyée sur votre compte sera abandonnée."
      : perdues > 1
        ? ` ${perdues} modifications pas encore envoyées sur votre compte seront abandonnées.`
        : "";
  const ok = await demander({
    titre: "Restaurer cette version",
    message: `Votre grille actuelle sera remplacée. Une copie en sera gardée et vous pourrez annuler.${abandon}`,
    boutons: [
      { libelle: "Annuler", valeur: false },
      { libelle: "Restaurer", valeur: true, principal: true },
    ],
  });
  if (!ok) return null;
  const r = await restauration.restaurer(source);
  if (!r.ok) {
    toast(r.erreur, { type: "erreur", duree: 7000 });
    return r;
  }
  const date = source.creeLe ? dateHeure(source.creeLe).slice(0, 5) : "";
  toast(
    `Version${date ? ` du ${date}` : ""} restaurée${r.fondPerdu ? " (fond d'écran introuvable)" : ""}`,
    {
      duree: 10000,
      action: { libelle: "Annuler", onClic: () => r.annuler() },
    },
  );
  return r;
}
