import { A } from "../../core/actions.js";
import { FONDS_MAX, TAILLE_FOND_MAX } from "../../core/reglages.js";
import { chargerFirebase } from "../../firebase/charger.js";
import { plateforme } from "../../platform/index.js";
import { el } from "../dom.js";
import { preparerImageFond } from "../services/imageFond.js";
import { toast } from "../toast.js";

/** Deletion in Storage waits for the end of the "Annuler" toast. */
export const DELAI_SUPPRESSION_MS = 5000;

/**
 * Backgrounds library of the account (V2.6), shown in the settings in account mode:
 * thumbnails, "n / 10", add with progress and cancel, set as active, delete with undo,
 * clean up orphan files, offer to send this device's local picture.
 */
export function creerBibliothequeFonds({ store, session }) {
  const uid = () => session.compte.lire().profil?.uid;
  const reglages = () => store.lire().reglages;
  const compteur = el("p", { class: "reglages-note" });
  const grille = el("div", {
    class: "bibliotheque",
    role: "radiogroup",
    "aria-label": "Vos fonds",
  });
  const etat = el("p", { class: "reglages-note", "aria-live": "polite" });
  const progression = el("progress", { class: "progression", max: "1", value: "0", hidden: true });
  const boutonAnnuler = el("button", {
    type: "button",
    class: "lien-discret",
    texte: "Annuler l'envoi",
    hidden: true,
  });
  const fichier = el("input", {
    type: "file",
    accept: "image/jpeg,image/png,image/webp",
    "aria-label": "Ajouter un fond à votre compte",
  });
  const orphelins = el("p", { class: "reglages-note", hidden: true });
  const migration = el("div", { class: "permission", hidden: true });
  const urls = [];

  const libererUrls = () => urls.splice(0).forEach((u) => URL.revokeObjectURL(u));

  async function rendre() {
    libererUrls();
    const r = reglages();
    const fonds = r.fonds ?? [];
    compteur.textContent = `${fonds.length} / ${FONDS_MAX} fonds sur votre compte`;
    fichier.disabled = fonds.length >= FONDS_MAX;
    const vignettes = [];
    for (const f of fonds) {
      const actif = r.fond?.type === "image" && r.fond.id === f.id;
      const vignette = el("button", {
        type: "button",
        class: "vignette",
        role: "radio",
        "aria-checked": String(actif),
        "aria-label": `Fond ajouté le ${new Date(f.ajouteLe).toLocaleDateString("fr")}`,
        style: `background-color:${f.dominante}`,
        onclick: () =>
          store.envoyer({
            type: A.REGLAGES_MODIFIER,
            changements: { fond: { type: "image", id: f.id } },
          }),
      });
      const blob = await plateforme.fichiers.lireCacheFond(f.id).catch(() => null);
      if (blob) {
        const url = URL.createObjectURL(blob);
        urls.push(url);
        vignette.style.backgroundImage = `url("${url}")`;
      }
      vignettes.push(
        el(
          "div",
          { class: "vignette-case" },
          vignette,
          el("button", {
            type: "button",
            class: "vignette-supprimer",
            "aria-label": "Supprimer ce fond",
            texte: "×",
            onclick: () => supprimer(f),
          }),
        ),
      );
    }
    grille.replaceChildren(...vignettes);
  }

  /** Removed from the library at once; the file goes when the undo time is over. */
  function supprimer(f) {
    const etaitActif = reglages().fond?.id === f.id;
    store.envoyer({ type: A.FOND_SUPPRIMER, id: f.id });
    let annule = false;
    const minuteur = setTimeout(async () => {
      if (annule) return;
      const fb = await chargerFirebase();
      await fb.supprimerFondStockage(f.chemin).catch(() => {});
      plateforme.fichiers.supprimerCacheFond(f.id).catch(() => {});
    }, DELAI_SUPPRESSION_MS);
    toast("Fond supprimé", {
      duree: DELAI_SUPPRESSION_MS,
      action: {
        libelle: "Annuler",
        onClic: () => {
          annule = true;
          clearTimeout(minuteur);
          store.envoyer({ type: A.FOND_AJOUTER, fond: f, activer: etaitActif });
        },
      },
    });
  }

  /** Uploads a prepared picture; the library is updated only once the file is in Storage. */
  async function envoyer(blob, infos) {
    if ((reglages().fonds ?? []).length >= FONDS_MAX) {
      etat.textContent = `Vous avez déjà ${FONDS_MAX} fonds : supprimez-en un pour en ajouter.`;
      return false;
    }
    if (blob.size > TAILLE_FOND_MAX) {
      etat.textContent = "Image trop lourde après préparation (5 Mo au plus).";
      return false;
    }
    const fb = await chargerFirebase();
    const id = globalThis.crypto.randomUUID();
    const chemin = fb.cheminFond(uid(), id);
    progression.hidden = boutonAnnuler.hidden = false;
    progression.value = 0;
    etat.textContent = "Envoi du fond…";
    const { promesse, annuler } = fb.envoyerFond(chemin, blob, {
      surProgression: (p) => (progression.value = p),
    });
    boutonAnnuler.onclick = annuler;
    try {
      await promesse;
      await plateforme.fichiers.ecrireCacheFond(id, blob).catch(() => {});
      store.envoyer({
        type: A.FOND_AJOUTER,
        activer: true,
        fond: {
          id,
          chemin,
          dominante: infos.dominante,
          largeur: infos.largeur,
          hauteur: infos.hauteur,
          taille: blob.size,
          ajouteLe: Date.now(),
        },
      });
      etat.textContent = "Fond ajouté à votre compte.";
      return true;
    } catch (e) {
      etat.textContent =
        e?.code === "storage/canceled"
          ? "Envoi annulé."
          : "L'envoi a échoué : le fond n'a pas été ajouté.";
      return false;
    } finally {
      progression.hidden = boutonAnnuler.hidden = true;
    }
  }

  fichier.addEventListener("change", async () => {
    const f = fichier.files?.[0];
    fichier.value = "";
    if (!f) return;
    etat.textContent = "Préparation de l'image…";
    const r = await preparerImageFond(f);
    if (!r.ok) {
      etat.textContent = r.erreur;
      return;
    }
    await envoyer(r.blob, r);
  });

  /** Files in Storage that are not in the library (e.g. a crash between upload and save). */
  async function verifierOrphelins() {
    try {
      const fb = await chargerFirebase();
      const chemins = await fb.listerFondsStockage(uid());
      const connus = new Set((reglages().fonds ?? []).map((f) => f.chemin));
      const perdus = chemins.filter((c) => !connus.has(c));
      orphelins.hidden = perdus.length === 0;
      if (!perdus.length) return;
      orphelins.replaceChildren(
        el("span", {
          texte: `${perdus.length} fichier${perdus.length > 1 ? "s" : ""} inutilisé${perdus.length > 1 ? "s" : ""} dans votre espace. `,
        }),
        el("button", {
          type: "button",
          class: "lien-discret",
          texte: "Nettoyer",
          onclick: async () => {
            await Promise.all(perdus.map((c) => fb.supprimerFondStockage(c).catch(() => {})));
            orphelins.hidden = true;
          },
        }),
      );
    } catch {
      orphelins.hidden = true; // offline: checked another time
    }
  }

  /** This device has a local picture: offer to send it to the account. */
  async function proposerMigration() {
    const local = store.lire().reglagesAppareil?.fond;
    if (!local?.ref || (await plateforme.preferences.lire("migrationFondRefusee"))) return;
    migration.hidden = false;
    migration.replaceChildren(
      el("p", {
        texte:
          "Envoyer le fond de cet appareil sur votre compte pour le retrouver sur vos autres appareils ?",
      }),
      el(
        "div",
        { class: "permission-actions" },
        el("button", {
          type: "button",
          class: "bouton",
          texte: "Non, le garder ici",
          onclick: () => {
            plateforme.preferences.ecrire("migrationFondRefusee", true);
            migration.hidden = true;
          },
        }),
        el("button", {
          type: "button",
          class: "bouton bouton--principal",
          texte: "Envoyer",
          onclick: async () => {
            migration.hidden = true;
            const id = local.ref.slice("local:".length);
            const blob = await plateforme.fichiers.lireFond(id).catch(() => null);
            if (!blob) {
              etat.textContent = "Le fond de cet appareil est introuvable.";
              return;
            }
            const img = await createImageBitmap(blob);
            const ok = await envoyer(blob, {
              dominante: local.dominante,
              largeur: img.width,
              hauteur: img.height,
            });
            if (ok) plateforme.fichiers.supprimerFond(id).catch(() => {});
          },
        }),
      ),
    );
  }

  const racine = el(
    "div",
    { class: "bibliotheque-fonds" },
    migration,
    compteur,
    grille,
    el("label", { class: "reglages-libelle", texte: "Ajouter un fond" }),
    fichier,
    progression,
    boutonAnnuler,
    etat,
    orphelins,
  );
  rendre();
  verifierOrphelins();
  proposerMigration();
  const arreter = store.abonner(() => rendre());
  return {
    racine,
    arreter: () => {
      arreter();
      libererUrls();
    },
  };
}
