import { creerExport, nomFichierExport } from "../../core/export.js";
import { actionFusion, validerImport, verifierTailleFichier } from "../../core/import.js";
import { genererIdParDefaut } from "../../core/modele.js";
import { creerZip } from "../../core/zip.js";
import { chargerFirebase } from "../../firebase/charger.js";
import { plateforme } from "../../platform/index.js";
import { blobFondCompte } from "../apparence.js";

const EXTENSIONS = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** Gives the user a file (Blob + <a download>), in the extension and in the PWA. */
export function telecharger(contenu, nom, type) {
  const url = URL.createObjectURL(new Blob([contenu], { type }));
  const lien = Object.assign(document.createElement("a"), { href: url, download: nom });
  document.body.append(lien);
  lien.click();
  lien.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/**
 * The user's data (V2.10): export to a JSON file (also without an account), backgrounds as
 * a ZIP, import of an export file (Replace through the restoration of V2.8, or Merge).
 */
export function creerDonnees({
  store,
  session,
  charger = chargerFirebase,
  plat = plateforme,
  genererId = genererIdParDefaut,
}) {
  const enCompte = () => session?.synchro?.lire().mode === "compte";
  const uid = () => session?.compte?.lire().profil?.uid;

  /** Every backup of the account (pages of 20), for the export. */
  async function toutesLesSauvegardes() {
    const fb = await charger();
    const resultat = [];
    let apres = null;
    do {
      const page = await fb.listerSauvegardes(uid(), { apres });
      resultat.push(...page.sauvegardes);
      apres = page.suite;
    } while (apres);
    return resultat;
  }

  /** @returns {Promise<{ ok: true, nom: string } | { ok: false, erreur: string }>} */
  async function exporter({ inclureSauvegardes = true, maintenant = new Date() } = {}) {
    let sauvegardes;
    if (enCompte() && inclureSauvegardes) {
      try {
        sauvegardes = await toutesLesSauvegardes();
      } catch {
        return {
          ok: false,
          erreur: "Sauvegardes indisponibles hors ligne : exportez sans elles ou réessayez.",
        };
      }
    }
    const contenu = creerExport(store.lire(), {
      version: plat.getVersion(),
      plateforme: plat.capacites?.nom ?? "extension",
      maintenant: maintenant.getTime(),
      sauvegardes,
    });
    const nom = nomFichierExport(maintenant);
    telecharger(JSON.stringify(contenu, null, 2), nom, "application/json");
    return { ok: true, nom };
  }

  /** Background pictures of the user: the account's library and this device's picture. */
  async function fondsATelecharger() {
    const etat = store.lire();
    const liste = [];
    for (const f of etat.reglages.fonds ?? []) {
      liste.push({ nom: `fond-${liste.length + 1}`, lire: () => blobFondCompte(f) });
    }
    const local = etat.reglagesAppareil?.fond;
    if (local?.ref) {
      const id = local.ref.slice("local:".length);
      liste.push({ nom: "fond-cet-appareil", lire: () => plat.fichiers.lireFond(id) });
    }
    return liste;
  }

  /** @returns {Promise<{ ok: true, nombre: number } | { ok: false, erreur: string }>} */
  async function telechargerFonds({ maintenant = new Date() } = {}) {
    const fichiers = [];
    for (const f of await fondsATelecharger()) {
      const blob = await f.lire().catch(() => null);
      if (!blob) continue;
      const ext = EXTENSIONS[blob.type] ?? "img";
      fichiers.push({ nom: `${f.nom}.${ext}`, octets: new Uint8Array(await blob.arrayBuffer()) });
    }
    if (!fichiers.length) return { ok: false, erreur: "Aucun fond d'écran à télécharger." };
    const nom = nomFichierExport(maintenant).replace(/\.json$/, "-fonds.zip");
    telecharger(creerZip(fichiers, maintenant), nom, "application/zip");
    return { ok: true, nombre: fichiers.length };
  }

  /**
   * Reads and checks a file chosen by the user. Nothing is changed here.
   * @returns {Promise<ReturnType<typeof validerImport>>}
   */
  async function lireFichier(fichier) {
    const tropGros = verifierTailleFichier(fichier.size);
    if (tropGros) return { ok: false, erreur: tropGros };
    const texte = await fichier.text().catch(() => null);
    if (texte == null) return { ok: false, erreur: "Fichier illisible." };
    return validerImport(texte);
  }

  /** "Fusionner": imported sites not already there, in a folder "Importé le …". */
  function fusionner(lu, maintenant = Date.now()) {
    const r = actionFusion(store.lire().grille, lu.etat.grille, { genererId, maintenant });
    if (r.action) store.envoyer(r.action);
    return r;
  }

  return { exporter, telechargerFonds, fondsATelecharger, lireFichier, fusionner, enCompte };
}
