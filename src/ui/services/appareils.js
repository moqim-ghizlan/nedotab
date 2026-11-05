import {
  nomParDefaut,
  peutAjouterAppareil,
  trouverAppareil,
  validerNomAppareil,
  vuLeAJourner,
} from "../../core/appareils.js";
import { typeAppareil } from "../../core/appareil.js";

/**
 * Named devices of the signed-in account (T12): the list, the identity of this device, the
 * first-launch question. The id is the persistent random id of the installation
 * (`plateforme.idAppareil`); the name is a label chosen by the user.
 *
 * @param {{ charger: () => Promise<object>, uid: () => string|null,
 *   idAppareil: () => Promise<string>, preferences: { ecrire: Function },
 *   demanderNom: (infos: object) => Promise<object>, type?: string }} d
 */
export function creerServiceAppareils({
  charger,
  uid,
  idAppareil,
  preferences,
  demanderNom,
  type = typeAppareil(import.meta.env.VITE_TARGET),
}) {
  let liste = [];
  let id = null;
  let arret = null;
  let uidEcoute = null;
  let demande = false;
  let touche = false;
  let chargee = false;
  const abonnes = new Set();
  const notifier = () => abonnes.forEach((f) => f());

  const ecrireIdentite = async () => {
    const fb = await charger();
    fb.definirIdentiteAppareil({ id, nom: trouverAppareil(liste, id)?.nom ?? null });
  };

  async function premierLancement() {
    if (demande) return;
    demande = true;
    // No second window over the first-synchronisation choice or any other open dialog.
    while (document.querySelector("dialog[open]")) await new Promise((r) => setTimeout(r, 1500));
    const suggestion = nomParDefaut(type, liste);
    const choix = await demanderNom({ suggestion, existants: liste });
    const u = uid();
    if (!u) return void (demande = false);
    const fb = await charger();
    if (choix.mode === "reprendre") {
      // This installation becomes the chosen device: its id replaces the local one.
      await preferences.ecrire("idAppareil", choix.id);
      id = choix.id;
      await ecrireIdentite();
      notifier();
      return;
    }
    if (!peutAjouterAppareil(liste)) return;
    const v = validerNomAppareil(choix.nom, liste, id);
    await fb.enregistrerAppareil(u, { id, nom: v.ok ? v.nom : suggestion, type });
  }

  function surListe(l, { depuisCache }) {
    liste = l;
    const moi = trouverAppareil(liste, id);
    ecrireIdentite().catch(() => {});
    notifier();
    if (!depuisCache) chargee = true;
    // Only the server's answer says whether this device is really unknown.
    if (!moi && chargee && !depuisCache) premierLancement().catch(() => (demande = false));
    else if (moi && !touche && vuLeAJourner(moi.vuLe)) {
      touche = true;
      charger()
        .then((fb) => fb.toucherAppareil(uid(), id))
        .catch(() => {});
    }
  }

  return {
    liste: () => liste,
    id: () => id,
    /** Name of this device, or null while it has none. */
    nom: () => trouverAppareil(liste, id)?.nom ?? null,
    abonner(f) {
      abonnes.add(f);
      return () => abonnes.delete(f);
    },
    /** Called when the account is usable (signed in and synchronised). */
    async demarrer() {
      const u = uid();
      if (!u) return this.arreter();
      if (arret && uidEcoute === u) return;
      this.arreter();
      uidEcoute = u;
      id = await idAppareil();
      const fb = await charger();
      arret = fb.ecouterAppareils(u, surListe);
    },
    arreter() {
      arret?.();
      arret = null;
      uidEcoute = null;
      liste = [];
      demande = false;
      touche = false;
      chargee = false;
      notifier();
    },
    async renommer(cible, nom) {
      const v = validerNomAppareil(nom, liste, cible);
      if (!v.ok) return v;
      const fb = await charger();
      await fb.renommerAppareilDistant(uid(), cible, v.nom);
      return { ok: true, nom: v.nom };
    },
    async retirer(cible) {
      if (cible === id) return { ok: false, erreur: "Impossible de retirer cet appareil." };
      const fb = await charger();
      await fb.retirerAppareilDistant(uid(), cible);
      return { ok: true };
    },
  };
}
