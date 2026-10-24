import { reduire } from "../core/actions.js";
import { NOM_APP } from "../core/constantes.js";
import { migrer } from "../core/migration.js";
import { creerStore } from "../core/store.js";
import { plateforme } from "../platform/index.js";
import { ouvrirAjoutSite } from "./dialogues/ajouterSite.js";
import { el } from "./dom.js";
import { activerClavierGrille, rendreGrille } from "./grille.js";
import { brancherPersistance } from "./persistance.js";
import { toast } from "./toast.js";

export async function demarrerApp(racine) {
  const stockage = plateforme.stockage();
  let brut = null;
  let chargementRate = false;
  try {
    brut = await stockage.charger();
  } catch (e) {
    console.error("Lecture du stockage impossible", e);
    chargementRate = true;
  }
  const { etat, lectureSeule: versionFuture } = migrer(brut);
  // Never overwrite the storage with an empty state when the load failed.
  const lectureSeule = versionFuture || chargementRate;
  const store = creerStore(etat, reduire);

  const grilleEl = el("ul", { class: "grille", "aria-label": "Mes sites" });
  const vide = el(
    "section",
    { class: "vide", hidden: true },
    el("p", { class: "vide-texte", texte: "Ajoutez votre premier site" }),
    el("button", {
      type: "button",
      class: "vide-bouton",
      "aria-label": "Ajouter un site",
      dataset: { action: "ajouter" },
      texte: "+",
    }),
  );
  const bandeau = lectureSeule
    ? el("p", {
        class: "bandeau",
        role: "alert",
        texte: versionFuture
          ? "Données créées par une version plus récente : mettez à jour l'extension. Lecture seule."
          : "Vos données n'ont pas pu être lues. Lecture seule pour ne rien perdre.",
      })
    : null;
  const page = el("main", { class: "page" }, bandeau, vide, grilleEl);
  const pied = el("footer", { class: "pied", texte: `${NOM_APP} ${plateforme.getVersion()}` });
  racine.replaceChildren(page, pied);

  const rendre = (e) => {
    const estVide = e.grille.length === 0;
    vide.hidden = !estVide;
    grilleEl.hidden = estVide;
    rendreGrille(grilleEl, e.grille, { avecAjout: !lectureSeule });
  };
  store.abonner(rendre);
  rendre(store.lire());
  activerClavierGrille(grilleEl);

  const focaliser = (site) =>
    requestAnimationFrame(() =>
      grilleEl.querySelector(`[data-id="${CSS.escape(site.id)}"]`)?.focus(),
    );
  page.addEventListener("click", (e) => {
    if (e.target.closest("[data-action='ajouter']") && !lectureSeule) {
      ouvrirAjoutSite(store, { apresAjout: focaliser });
    }
  });

  brancherPersistance(store, stockage, {
    lectureSeule: () => lectureSeule,
    onErreur: (e) => {
      console.error(e);
      toast("Enregistrement impossible (espace plein ?). Vos changements restent affichés.", {
        type: "erreur",
        duree: 8000,
      });
    },
  });
  return store;
}
