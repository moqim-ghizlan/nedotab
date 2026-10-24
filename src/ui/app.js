import { A, reduire } from "../core/actions.js";
import { listerDossiers } from "../core/arbre.js";
import { NOM_APP } from "../core/constantes.js";
import { migrer } from "../core/migration.js";
import { creerDossier } from "../core/modele.js";
import { creerStore } from "../core/store.js";
import { plateforme } from "../platform/index.js";
import { demanderNomDossier } from "./dialogues/commun.js";
import { ouvrirAjoutSite } from "./dialogues/dialogueSite.js";
import { el } from "./dom.js";
import { ouvrirFenetreDossier } from "./fenetreDossier.js";
import { ouvrirMenu } from "./menuContextuel.js";
import { brancherPersistance } from "./persistance.js";
import { toast } from "./toast.js";
import { creerVueGrille } from "./vueGrille.js";

/** Actions after which a folder that became empty is reported (not remote loads or undo). */
const ACTIONS_LOCALES = new Set([A.ELEMENT_SUPPRIMER, A.ELEMENT_DEPLACER]);

export async function demarrerApp(racine) {
  const stockage = plateforme.stockage();
  let brut = null;
  let versionConnue = null;
  let chargementRate = false;
  try {
    const lu = await stockage.lire();
    brut = lu.etat;
    versionConnue = lu.meta?.majLe ?? null;
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
  const annonces = el("div", { class: "visuellement-cache", "aria-live": "polite" });
  racine.replaceChildren(page, pied, annonces);
  const annoncer = (texte) => {
    annonces.textContent = "";
    requestAnimationFrame(() => (annonces.textContent = texte));
  };

  const ouvrirDossier = (id, tuile) =>
    ouvrirFenetreDossier(store, id, {
      retourFocus: tuile,
      lectureSeule: () => lectureSeule,
      annoncer,
    });

  const nouveauDossier = async (retourFocus) => {
    const titre = await demanderNomDossier({ retourFocus });
    if (titre == null) return;
    const dossier = creerDossier({ titre: titre.trim() || "Dossier" });
    store.envoyer({ type: A.DOSSIER_CREER, dossier, parentId: null });
    accueil.focaliser(dossier.id);
  };

  /** The home "+" offers a site or a folder. */
  const menuAjout = (bouton) => {
    const rect = bouton.getBoundingClientRect();
    ouvrirMenu({
      x: rect.left,
      y: rect.bottom + 4,
      retourFocus: bouton,
      libelle: "Ajouter",
      entrees: [
        {
          libelle: "Ajouter un site",
          onChoix: () =>
            ouvrirAjoutSite(store, { apresAjout: (site) => accueil.focaliser(site.id) }),
        },
        { libelle: "Nouveau dossier", onChoix: () => nouveauDossier(bouton) },
      ],
    });
  };

  const accueil = creerVueGrille({
    store,
    conteneur: grilleEl,
    lectureSeule: () => lectureSeule,
    annoncer,
    ouvrirDossier,
    apresFusion: (id) =>
      ouvrirFenetreDossier(store, id, {
        lectureSeule: () => lectureSeule,
        annoncer,
        editerTitre: true,
      }),
    ajouter: menuAjout,
    libelleAjout: "Ajouter un site ou un dossier",
  });
  vide
    .querySelector("button")
    .addEventListener("click", (e) => !lectureSeule && menuAjout(e.currentTarget));

  const rendre = () => {
    const estVide = store.lire().grille.length === 0;
    vide.hidden = !estVide;
    grilleEl.hidden = estVide;
    accueil.demanderRendu();
  };
  rendre();

  // A folder emptied by a local action: offer to delete it (never automatically).
  let precedent = store.lire().grille;
  store.abonner((etatCourant, action) => {
    rendre();
    const avant = precedent;
    precedent = etatCourant.grille;
    if (!ACTIONS_LOCALES.has(action.type)) return;
    const pleins = new Set(
      listerDossiers(avant)
        .filter((d) => d.dossier.items.length)
        .map((d) => d.dossier.id),
    );
    const vides = listerDossiers(etatCourant.grille).filter(
      (d) => d.dossier.items.length === 0 && pleins.has(d.dossier.id),
    );
    for (const { dossier } of vides) {
      toast(`Le dossier « ${dossier.titre} » est vide`, {
        cle: "dossierVide",
        duree: 8000,
        action: {
          libelle: "Supprimer le dossier",
          onClic: () =>
            store.envoyer({ type: A.DOSSIER_SUPPRIMER, id: dossier.id, mode: "avecContenu" }),
        },
      });
    }
  });

  brancherPersistance(store, stockage, {
    reduire,
    versionConnue,
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
