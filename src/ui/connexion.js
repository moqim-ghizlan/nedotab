import {
  attenteRenvoi,
  validerEmail,
  validerMotDePasse,
} from "../core/authEmail.js";
import { demander } from "./dialogues/commun.js";
import { el } from "./dom.js";
import { icone } from "./icones.js";

/**
 * Sign-in form with e-mail and password (V4.23), under the Google button of the account card,
 * and the screen "Vérifiez votre boîte mail". Real labels, errors announced (aria-live), the
 * browser's password manager works (autocomplete values), the eye button shows the password.
 * The password lives in the field only: it is emptied after use, never stored.
 */

function champMotDePasse({ id, libelle, autocomplete }) {
  const champ = el("input", {
    id,
    type: "password",
    autocomplete,
    required: true,
    spellcheck: "false",
    autocapitalize: "none",
    class: "connexion-champ",
  });
  const oeil = el("button", {
    type: "button",
    class: "connexion-oeil",
    "aria-label": "Afficher le mot de passe",
    "aria-pressed": "false",
    onclick: () => {
      const visible = champ.type === "password";
      champ.type = visible ? "text" : "password";
      oeil.setAttribute("aria-pressed", String(visible));
      oeil.setAttribute("aria-label", visible ? "Masquer le mot de passe" : "Afficher le mot de passe");
    },
  });
  oeil.append(icone("oeil", { taille: 16 }));
  const erreur = el("p", { class: "connexion-erreur", role: "alert", hidden: true });
  const groupe = el(
    "div",
    { class: "champ" },
    el("label", { for: id, texte: libelle }),
    el("div", { class: "connexion-mdp" }, champ, oeil),
    erreur,
  );
  return { champ, groupe, erreur };
}

const afficherErreur = (noeud, message) => {
  noeud.textContent = message ?? "";
  noeud.hidden = !message;
};

/**
 * @param {{ connecterEmail: Function, reinitialiser: Function, hors?: () => boolean }} d
 *   connecterEmail(email, mdp, { creer }) → { ok, erreur }; reinitialiser(email) → { ok, erreur }
 * @returns {HTMLElement}
 */
export function creerFormulaireConnexion({ connecterEmail, reinitialiser, horsLigne = () => false }) {
  let creation = false;
  const email = el("input", {
    id: "connexion-email",
    type: "email",
    autocomplete: "email",
    inputmode: "email",
    required: true,
    autocapitalize: "none",
    spellcheck: "false",
    class: "connexion-champ",
  });
  const erreurEmail = el("p", { class: "connexion-erreur", role: "alert", hidden: true });
  const mdp = champMotDePasse({
    id: "connexion-mdp",
    libelle: "Mot de passe",
    autocomplete: "current-password",
  });
  const statut = el("p", { class: "connexion-statut", "aria-live": "polite", hidden: true });
  const principal = el("button", { type: "submit", class: "bouton bouton--principal" });
  const bascule = el("button", { type: "button", class: "lien-discret" });
  const oubli = el("button", {
    type: "button",
    class: "lien-discret",
    texte: "Mot de passe oublié ?",
  });
  const aide = el("p", { class: "reglages-note", hidden: true });

  const maj = () => {
    principal.textContent = creation ? "Créer mon compte" : "Se connecter";
    bascule.textContent = creation ? "J'ai déjà un compte" : "Créer un compte";
    mdp.champ.setAttribute("autocomplete", creation ? "new-password" : "current-password");
    oubli.hidden = creation;
    aide.hidden = !creation;
    aide.textContent = "Au moins 10 caractères. Un e-mail de confirmation vous sera envoyé.";
    afficherErreur(erreurEmail, null);
    afficherErreur(mdp.erreur, null);
    statut.hidden = true;
  };

  const occupe = (oui) => {
    principal.disabled = oui;
    principal.textContent = oui ? "Patientez…" : creation ? "Créer mon compte" : "Se connecter";
  };

  const formulaire = el(
    "form",
    { class: "connexion-formulaire", novalidate: true },
    el("div", { class: "champ" }, el("label", { for: "connexion-email", texte: "Adresse e-mail" }), email, erreurEmail),
    mdp.groupe,
    aide,
    statut,
    principal,
    el("div", { class: "connexion-liens" }, bascule, oubli),
  );
  formulaire.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    afficherErreur(erreurEmail, validerEmail(email.value));
    afficherErreur(mdp.erreur, creation ? validerMotDePasse(mdp.champ.value) : mdp.champ.value ? null : "Saisissez un mot de passe.");
    if (!erreurEmail.hidden || !mdp.erreur.hidden) return;
    if (horsLigne()) {
      afficherErreur(mdp.erreur, "Connexion internet nécessaire.");
      return;
    }
    occupe(true);
    const r = await connecterEmail(email.value, mdp.champ.value, { creer: creation });
    mdp.champ.value = ""; // never kept in the page
    occupe(false);
    if (!r.ok) afficherErreur(mdp.erreur, r.erreur);
  });
  bascule.addEventListener("click", () => {
    creation = !creation;
    maj();
    mdp.champ.value = "";
  });
  oubli.addEventListener("click", async () => {
    afficherErreur(erreurEmail, validerEmail(email.value));
    if (!erreurEmail.hidden) {
      email.focus();
      return;
    }
    if (horsLigne()) {
      afficherErreur(erreurEmail, "Connexion internet nécessaire.");
      return;
    }
    const r = await reinitialiser(email.value);
    statut.hidden = false;
    // Same message whether or not the account exists.
    statut.textContent = r.ok
      ? "Si un compte existe avec cette adresse, un e-mail de réinitialisation vient d'être envoyé. Pensez à vérifier les indésirables."
      : r.erreur;
  });
  maj();
  return formulaire;
}

/**
 * Screen shown after the sign-up (or a sign-in with an address not verified yet): nothing
 * of the data is reachable until the address is verified.
 * @param {{ email: string, jaiVerifie: Function, renvoyer: Function, deconnecter: Function,
 *           maintenant?: () => number }} d
 */
export function creerAttenteVerification({
  email,
  jaiVerifie,
  renvoyer,
  deconnecter,
  maintenant = Date.now,
}) {
  let dernierEnvoi = maintenant(); // the e-mail has just been sent
  const message = el("p", { class: "connexion-statut", "aria-live": "polite" });
  const verifier = el("button", {
    type: "button",
    class: "bouton bouton--principal",
    texte: "J'ai vérifié",
    onclick: async () => {
      verifier.disabled = true;
      const ok = await jaiVerifie();
      verifier.disabled = false;
      if (!ok) message.textContent = "L'adresse n'est pas encore vérifiée. Cliquez sur le lien de l'e-mail, puis réessayez.";
    },
  });
  const renvoi = el("button", {
    type: "button",
    class: "bouton",
    texte: "Renvoyer l'e-mail",
    onclick: async () => {
      const attente = attenteRenvoi(dernierEnvoi, maintenant());
      if (attente > 0) {
        message.textContent = `Patientez ${attente} s avant de renvoyer l'e-mail.`;
        return;
      }
      dernierEnvoi = maintenant();
      const r = await renvoyer();
      message.textContent = r.ok ? "E-mail renvoyé." : r.erreur;
    },
  });
  return el(
    "div",
    { class: "connexion-verification" },
    el("h4", { texte: "Vérifiez votre boîte mail" }),
    el("p", {
      texte: `Un e-mail de confirmation a été envoyé à ${email}. Cliquez sur le lien qu'il contient, puis revenez ici. Il peut arriver dans les indésirables.`,
    }),
    el("div", { class: "compte-actions" }, verifier, renvoi),
    message,
    el("button", {
      type: "button",
      class: "lien-discret",
      texte: "Utiliser une autre adresse (se déconnecter)",
      onclick: () => deconnecter(),
    }),
  );
}

/**
 * Asks for one or more passwords in a dialog. The fields are emptied right after: a password
 * is never kept. @returns {Promise<string[]|null>} the values, or null when cancelled
 */
export async function demanderMotsDePasse({ titre, message, champs }) {
  const saisies = champs.map(({ id, autocomplete }) =>
    el("input", { id, type: "password", autocomplete, class: "connexion-champ", required: true }),
  );
  const contenu = champs.map(({ id, libelle }, i) =>
    el("div", { class: "champ" }, el("label", { for: id, texte: libelle }), saisies[i]),
  );
  const ok = await demander({
    titre,
    message,
    contenu,
    boutons: [
      { libelle: "Annuler", valeur: false },
      { libelle: "Valider", valeur: true, principal: true },
    ],
  });
  const valeurs = saisies.map((s) => s.value);
  saisies.forEach((s) => (s.value = ""));
  return ok ? valeurs : null;
}
