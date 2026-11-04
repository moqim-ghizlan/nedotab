import {
  attenteRenvoi,
  MOT_DE_PASSE_MIN,
  validerEmail,
  validerMotDePasse,
} from "../core/authEmail.js";
import { demander } from "./dialogues/commun.js";
import { el } from "./dom.js";
import { icone } from "./icones.js";

/**
 * Sign-in form with e-mail and password (V4.23), and the screen "Vérifiez votre boîte mail".
 * Real labels, errors announced (aria-live), the browser's password manager works
 * (autocomplete values), the eye button shows the password. The password lives in the field
 * only: it is emptied after use, never stored.
 *
 * One form, three views: sign in, sign up (with a confirmation field) and "forgotten
 * password". Google comes last, as a round button under the form.
 */

function champMotDePasse({ id, libelle, autocomplete, avecOeil = true }) {
  const champ = el("input", {
    id,
    type: "password",
    autocomplete,
    required: true,
    spellcheck: "false",
    autocapitalize: "none",
    class: "connexion-champ",
  });
  const oeil = avecOeil
    ? el("button", {
        type: "button",
        class: "connexion-oeil",
        "aria-label": "Afficher le mot de passe",
        "aria-pressed": "false",
        onclick: () => {
          const visible = champ.type === "password";
          champ.type = visible ? "text" : "password";
          oeil.setAttribute("aria-pressed", String(visible));
          oeil.setAttribute(
            "aria-label",
            visible ? "Masquer le mot de passe" : "Afficher le mot de passe",
          );
        },
      })
    : null;
  oeil?.append(icone("oeil", { taille: 16 }));
  const erreur = el("p", { class: "connexion-erreur", role: "alert", hidden: true });
  const groupe = el(
    "div",
    { class: "champ" },
    el("label", { for: id, texte: libelle }),
    el("div", { class: "connexion-mdp" }, champ, oeil),
    erreur,
  );
  return { champ, groupe, erreur, oeil };
}

function champEmail(id) {
  const champ = el("input", {
    id,
    type: "email",
    autocomplete: "email",
    inputmode: "email",
    required: true,
    autocapitalize: "none",
    spellcheck: "false",
    class: "connexion-champ",
  });
  const erreur = el("p", { class: "connexion-erreur", role: "alert", hidden: true });
  const groupe = el(
    "div",
    { class: "champ" },
    el("label", { for: id, texte: "Adresse e-mail" }),
    champ,
    erreur,
  );
  return { champ, groupe, erreur };
}

const afficherErreur = (noeud, message) => {
  noeud.textContent = message ?? "";
  noeud.hidden = !message;
};

const TEXTES = {
  connexion: {
    titre: "Bon retour",
    texte: "Retrouvez vos sites sur tous vos appareils.",
    action: "Se connecter",
  },
  creation: {
    titre: "Créez votre compte",
    texte: "Vos sites et vos réglages vous suivent sur chaque appareil.",
    action: "Créer mon compte",
  },
  oubli: {
    titre: "Mot de passe oublié",
    texte: "Saisissez votre adresse e-mail : nous vous envoyons un lien pour en choisir un nouveau.",
    action: "Envoyer le lien",
  },
};

/**
 * @param {{ connecterEmail: Function, reinitialiser: Function, horsLigne?: () => boolean,
 *           boutonGoogle?: HTMLElement|null }} d
 *   connecterEmail(email, mdp, { creer }) → { ok, erreur }; reinitialiser(email) → { ok, erreur }
 * @returns {HTMLElement}
 */
export function creerFormulaireConnexion({
  connecterEmail,
  reinitialiser,
  horsLigne = () => false,
  boutonGoogle = null,
}) {
  let vue = "connexion"; // "connexion" | "creation" | "oubli"
  let dernierEnvoi = 0;

  const email = champEmail("connexion-email");
  const mdp = champMotDePasse({
    id: "connexion-mdp",
    libelle: "Mot de passe",
    autocomplete: "current-password",
  });
  const mdp2 = champMotDePasse({
    id: "connexion-mdp2",
    libelle: "Confirmer le mot de passe",
    autocomplete: "new-password",
    avecOeil: false,
  });
  // One eye for both fields.
  mdp.oeil.addEventListener("click", () => {
    mdp2.champ.type = mdp.champ.type;
  });

  const regleLongueur = el("li", { texte: `Au moins ${MOT_DE_PASSE_MIN} caractères` });
  const regleIdentiques = el("li", { texte: "Les deux mots de passe sont identiques" });
  const regles = el("ul", { class: "connexion-regles", "aria-label": "Conditions du mot de passe" }, regleLongueur, regleIdentiques);
  const aide = el("p", {
    class: "reglages-note",
    texte: "Un e-mail de confirmation vous sera envoyé.",
  });
  const majRegles = () => {
    const a = mdp.champ.value;
    const b = mdp2.champ.value;
    regleLongueur.dataset.ok = String([...a].length >= MOT_DE_PASSE_MIN);
    regleIdentiques.dataset.ok = String(a !== "" && a === b);
  };
  mdp.champ.addEventListener("input", majRegles);
  mdp2.champ.addEventListener("input", majRegles);

  const principal = el("button", { type: "submit", class: "bouton bouton--principal" });
  const oubli = el("button", {
    type: "button",
    class: "lien-discret connexion-oubli",
    texte: "Mot de passe oublié ?",
  });

  const ongletConnexion = el("button", {
    type: "button",
    role: "tab",
    class: "connexion-onglet",
    texte: "Connexion",
  });
  const ongletCreation = el("button", {
    type: "button",
    role: "tab",
    class: "connexion-onglet",
    texte: "Créer un compte",
  });
  const onglets = el(
    "div",
    { class: "connexion-onglets", role: "tablist" },
    ongletConnexion,
    ongletCreation,
  );

  const titre = el("h4", { class: "connexion-titre" });
  const sousTitre = el("p", { class: "connexion-sous-titre" });

  // --- "Forgotten password" view -------------------------------------------------------
  const emailOubli = champEmail("connexion-email-oubli");
  const retour = el(
    "button",
    { type: "button", class: "connexion-retour" },
    icone("retour", { taille: 16 }),
    el("span", { texte: "Connexion" }),
  );
  const envoyer = el("button", { type: "submit", class: "bouton bouton--principal" });
  const succes = el(
    "div",
    { class: "connexion-succes", role: "status", hidden: true },
    el("span", { class: "connexion-succes-icone", "aria-hidden": "true" }, icone("coche", { taille: 18 })),
    el(
      "div",
      {},
      el("strong", { texte: "Vérifiez votre boîte mail" }),
      el("p", { class: "connexion-succes-texte" }),
    ),
  );
  const blocOubli = el("div", { class: "connexion-bloc" }, emailOubli.groupe, succes, envoyer);

  // --- Sign-in / sign-up view ----------------------------------------------------------
  const alternatives = boutonGoogle
    ? el(
        "div",
        { class: "connexion-alternatives" },
        el("p", { class: "connexion-separateur", texte: "ou continuer avec" }),
        boutonGoogle,
      )
    : null;
  const blocPrincipal = el(
    "div",
    { class: "connexion-bloc" },
    onglets,
    email.groupe,
    mdp.groupe,
    oubli,
    mdp2.groupe,
    regles,
    aide,
    principal,
    alternatives,
  );
  const statut = el("p", { class: "connexion-statut", "aria-live": "polite", hidden: true });

  const maj = () => {
    const creation = vue === "creation";
    const enOubli = vue === "oubli";
    blocPrincipal.hidden = enOubli;
    blocOubli.hidden = !enOubli;
    retour.hidden = !enOubli;
    ongletConnexion.setAttribute("aria-selected", String(vue === "connexion"));
    ongletCreation.setAttribute("aria-selected", String(creation));
    mdp.champ.setAttribute("autocomplete", creation ? "new-password" : "current-password");
    mdp2.groupe.hidden = !creation;
    regles.hidden = !creation;
    aide.hidden = !creation;
    oubli.hidden = creation;
    titre.textContent = TEXTES[vue].titre;
    sousTitre.textContent = TEXTES[vue].texte;
    principal.textContent = TEXTES[vue === "creation" ? "creation" : "connexion"].action;
    envoyer.textContent = dernierEnvoi && !succes.hidden ? "Renvoyer le lien" : TEXTES.oubli.action;
    for (const e of [email.erreur, mdp.erreur, mdp2.erreur, emailOubli.erreur]) afficherErreur(e, null);
    statut.hidden = true;
    majRegles();
  };

  const aller = (v) => {
    vue = v;
    mdp.champ.value = "";
    mdp2.champ.value = "";
    if (v === "oubli") {
      emailOubli.champ.value = email.champ.value;
      succes.hidden = true;
      dernierEnvoi = 0;
    }
    maj();
    (v === "oubli" ? emailOubli.champ : email.champ).focus?.();
  };

  const occupe = (oui) => {
    principal.disabled = oui;
    principal.textContent = oui
      ? "Patientez…"
      : TEXTES[vue === "creation" ? "creation" : "connexion"].action;
  };

  async function envoyerReinitialisation() {
    afficherErreur(emailOubli.erreur, validerEmail(emailOubli.champ.value));
    if (!emailOubli.erreur.hidden) {
      emailOubli.champ.focus();
      return;
    }
    if (horsLigne()) {
      afficherErreur(emailOubli.erreur, "Connexion internet nécessaire.");
      return;
    }
    const attente = dernierEnvoi ? attenteRenvoi(dernierEnvoi, Date.now()) : 0;
    if (attente > 0) {
      afficherErreur(emailOubli.erreur, `Patientez ${attente} s avant de renvoyer l'e-mail.`);
      return;
    }
    envoyer.disabled = true;
    const r = await reinitialiser(emailOubli.champ.value);
    envoyer.disabled = false;
    if (!r.ok) {
      afficherErreur(emailOubli.erreur, r.erreur);
      return;
    }
    afficherErreur(emailOubli.erreur, null);
    dernierEnvoi = Date.now();
    // Same message whether or not the account exists.
    succes.querySelector(".connexion-succes-texte").textContent =
      `Si un compte existe avec ${emailOubli.champ.value.trim()}, un e-mail de réinitialisation vient d'être envoyé. Pensez à vérifier les indésirables.`;
    succes.hidden = false;
    envoyer.textContent = "Renvoyer le lien";
  }

  const formulaire = el(
    "form",
    { class: "connexion-formulaire", novalidate: true },
    retour,
    el("div", { class: "connexion-entete" }, titre, sousTitre),
    blocPrincipal,
    blocOubli,
    statut,
  );
  formulaire.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (vue === "oubli") return envoyerReinitialisation();
    const creation = vue === "creation";
    afficherErreur(email.erreur, validerEmail(email.champ.value));
    afficherErreur(
      mdp.erreur,
      creation
        ? validerMotDePasse(mdp.champ.value)
        : mdp.champ.value
          ? null
          : "Saisissez un mot de passe.",
    );
    afficherErreur(
      mdp2.erreur,
      creation && !mdp.erreur.textContent && mdp.champ.value !== mdp2.champ.value
        ? "Les deux mots de passe ne sont pas identiques."
        : null,
    );
    if (!email.erreur.hidden || !mdp.erreur.hidden || !mdp2.erreur.hidden) return;
    if (horsLigne()) {
      afficherErreur(mdp.erreur, "Connexion internet nécessaire.");
      return;
    }
    occupe(true);
    const r = await connecterEmail(email.champ.value, mdp.champ.value, { creer: creation });
    mdp.champ.value = ""; // never kept in the page
    mdp2.champ.value = "";
    majRegles();
    occupe(false);
    if (!r.ok) afficherErreur(mdp.erreur, r.erreur);
  });
  ongletConnexion.addEventListener("click", () => vue !== "connexion" && aller("connexion"));
  ongletCreation.addEventListener("click", () => vue !== "creation" && aller("creation"));
  oubli.addEventListener("click", () => aller("oubli"));
  retour.addEventListener("click", () => aller("connexion"));
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
