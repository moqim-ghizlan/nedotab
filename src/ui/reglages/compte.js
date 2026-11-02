import { el } from "../dom.js";
import { creerAvatar } from "../avatar.js";
import { icone } from "../icones.js";
import { URL_SITE } from "../../core/constantes.js";
import { abonnerMiseAJour, lireMiseAJour } from "../etatMiseAJour.js";
import { libelleMethodes, methodesDeConnexion, validerMotDePasse } from "../../core/authEmail.js";
import {
  creerAttenteVerification,
  creerFormulaireConnexion,
  demanderMotsDePasse,
} from "../connexion.js";
import { toast } from "../toast.js";

/** What happens to the account's data: the privacy page of the site (V2.10). */
const lienConfidentialite = () =>
  el("a", {
    href: `${URL_SITE}confidentialite.html`,
    target: "_blank",
    rel: "noopener",
    texte: "Vos données et la confidentialité",
  });

/** Google "G" logo (brand asset kept locally, as required for sign-in buttons). */
function logoGoogle() {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 48 48");
  svg.setAttribute("width", "18");
  svg.setAttribute("height", "18");
  svg.setAttribute("aria-hidden", "true");
  const traces = [
    [
      "#EA4335",
      "M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z",
    ],
    [
      "#4285F4",
      "M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z",
    ],
    [
      "#FBBC05",
      "M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z",
    ],
    [
      "#34A853",
      "M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z",
    ],
  ];
  for (const [couleur, d] of traces) {
    const p = document.createElementNS(ns, "path");
    p.setAttribute("fill", couleur);
    p.setAttribute("d", d);
    svg.append(p);
  }
  return svg;
}

/**
 * "Compte" of the settings panel: a card at the top drawn over a copy of the user's own
 * background. `session` gathers the account (compte), the synchronisation (synchro) and the
 * actions that chain them (connecter, deconnecter, synchroniser, restaurerCopie). Returns
 * the card, the account deletion zone (shown elsewhere in the panel), the privacy link and
 * a teardown.
 */
export function sectionCompte(session) {
  const { compte, synchro } = session;
  const contenu = el("div", { class: "compte" });
  const section = el(
    "section",
    { class: "reglages-section carte-compte", "aria-labelledby": "titre-compte" },
    el("h3", { id: "titre-compte", class: "visuellement-cache", texte: "Compte" }),
    contenu,
  );
  const danger = el("div", { class: "zone-danger-conteneur" });
  const bouton = (texte, onclick, classe = "bouton") =>
    el("button", { type: "button", class: classe, texte, onclick });
  const action = (nom, texte, onclick, { classe = "", titre } = {}) =>
    el(
      "button",
      { type: "button", class: `carte-action ${classe}`.trim(), title: titre, onclick },
      icone(nom, { taille: 16 }),
      el("span", { texte }),
    );
  const erreurAvecReessai = (message, reessayer) =>
    el(
      "p",
      { class: "compte-erreur", role: "alert" },
      el("span", { texte: message }),
      bouton("Réessayer", reessayer, "lien-discret"),
    );

  /** "Ajouter un mot de passe" (Google account) / "Changer le mot de passe" (e-mail account). */
  function boutonsMotDePasse(profil) {
    const { google, motDePasse } = methodesDeConnexion(profil.fournisseurs);
    if (motDePasse) {
      return [
        action("restaurer", "Changer le mot de passe", async () => {
          const v = await demanderMotsDePasse({
            titre: "Changer le mot de passe",
            message: "Confirmez votre identité avec votre mot de passe actuel.",
            champs: [
              { id: "mdp-actuel", libelle: "Mot de passe actuel", autocomplete: "current-password" },
              { id: "mdp-nouveau", libelle: "Nouveau mot de passe", autocomplete: "new-password" },
            ],
          });
          if (!v) return;
          const erreur = validerMotDePasse(v[1]);
          if (erreur) return toast(erreur, { type: "erreur", duree: 6000 });
          const r = await compte.changerMotDePasse(v[0], v[1]);
          toast(r.ok ? "Mot de passe modifié" : r.erreur, { type: r.ok ? "info" : "erreur", duree: 6000 });
        }),
      ];
    }
    if (google) {
      return [
        action("restaurer", "Ajouter un mot de passe", async () => {
          // Re-authenticating with Google first (same uid afterwards: no data moves).
          if (!(await compte.reconnecter())) {
            return toast("Reconnectez-vous avec Google pour continuer.", { type: "erreur", duree: 6000 });
          }
          const v = await demanderMotsDePasse({
            titre: "Ajouter un mot de passe",
            message: "Vous pourrez ensuite vous connecter avec Google ou avec votre e-mail et ce mot de passe. Vos données restent les mêmes.",
            champs: [{ id: "mdp-ajout", libelle: "Mot de passe (10 caractères au moins)", autocomplete: "new-password" }],
          });
          if (!v) return;
          const erreur = validerMotDePasse(v[0]);
          if (erreur) return toast(erreur, { type: "erreur", duree: 6000 });
          const r = await compte.ajouterMotDePasse(v[0]);
          toast(r.ok ? "Mot de passe ajouté" : r.erreur, { type: r.ok ? "info" : "erreur", duree: 6000 });
        }),
      ];
    }
    return [];
  }

  const rendre = () => {
    const etat = compte.lire();
    if (etat.statut === "verification" && etat.profil) {
      danger.replaceChildren();
      contenu.replaceChildren(
        creerAttenteVerification({
          email: etat.profil.email,
          jaiVerifie: () => session.verifierEmail(),
          renvoyer: () => compte.renvoyerVerification(),
          deconnecter: () => session.deconnecter(),
        }),
      );
      return;
    }
    const sync = synchro?.lire() ?? { mode: "local" };
    if (etat.statut === "connecte" && etat.profil) {
      const [statut, court, detail] = sync.enCours
        ? ["en-cours", "Synchronisation…", "Synchronisation en cours."]
        : sync.mode === "compte"
          ? ["actif", "Synchronisé", "Vos sites sont enregistrés sur votre compte."]
          : ["local", "Pas encore synchronisé", "Vos sites restent sur cet appareil."];
      contenu.replaceChildren(
        el(
          "div",
          { class: "compte-profil" },
          creerAvatar(etat.profil, { taille: 52 }),
          el(
            "div",
            { class: "compte-identite" },
            el("strong", { texte: etat.profil.nom || etat.profil.email }),
            etat.profil.nom ? el("span", { texte: etat.profil.email }) : null,
            el("span", {
              class: "compte-methode",
              texte: `Connexion : ${libelleMethodes(methodesDeConnexion(etat.profil.fournisseurs)) || "Google"}`,
            }),
            el(
              "p",
              { class: "compte-statut", dataset: { statut }, title: detail, "aria-live": "polite" },
              el("span", { class: "compte-statut-point", "aria-hidden": "true" }),
              court,
              el("span", { class: "visuellement-cache", texte: ` : ${detail}` }),
            ),
          ),
        ),
        ...(sync.erreur ? [erreurAvecReessai(sync.erreur, () => session.synchroniser())] : []),
        el(
          "div",
          { class: "compte-actions" },
          sync.mode !== "compte" && !sync.enCours
            ? action("synchroniser", "Synchroniser", () => session.synchroniser(), {
                classe: "carte-action--principale",
                titre: "Synchroniser maintenant",
              })
            : null,
          lireMiseAJour().disponible
            ? action(
                "synchroniser",
                "Mettre à jour",
                () => lireMiseAJour().appliquer?.(),
                {
                  classe: "carte-action--principale",
                  titre: "Une nouvelle version est disponible : recharger l'application",
                },
              )
            : null,
          action("restaurer", "Restaurer la copie", () => session.restaurerCopie(), {
            titre: "Restaurer la copie de cet appareil",
          }),
          ...boutonsMotDePasse(etat.profil),
          action("deconnexion", "Se déconnecter", () => session.deconnecter()),
        ),
      );
      danger.replaceChildren(
        ...(session.supprimerCompte
          ? [
              el(
                "details",
                { class: "zone-danger" },
                el("summary", { texte: "Supprimer mon compte" }),
                el(
                  "div",
                  { class: "zone-danger-corps" },
                  el("p", {
                    class: "reglages-note",
                    texte:
                      "Supprime définitivement votre compte et tout ce qui y est enregistré (sites, réglages, sauvegardes, fonds d'écran).",
                  }),
                  bouton(
                    "Supprimer mon compte…",
                    () => session.supprimerCompte(),
                    "bouton bouton--danger",
                  ),
                ),
              ),
            ]
          : []),
      );
      return;
    }
    danger.replaceChildren();
    const enCours = etat.statut === "connexion";
    contenu.replaceChildren(
      el("p", {
        class: "compte-invitation",
        texte: "Connectez-vous pour retrouver vos sites sur vos autres appareils.",
      }),
      el(
        "button",
        {
          type: "button",
          class: "bouton-google",
          disabled: enCours,
          onclick: () => session.connecter(),
        },
        logoGoogle(),
        el("span", { texte: enCours ? "Connexion…" : "Se connecter avec Google" }),
      ),
      ...(etat.erreur ? [erreurAvecReessai(etat.erreur, () => session.connecter())] : []),
      el("p", { class: "connexion-separateur", texte: "ou" }),
      creerFormulaireConnexion({
        connecterEmail: (email, mdp, options) => session.connecterEmail(email, mdp, options),
        reinitialiser: (email) => compte.reinitialiser(email),
        horsLigne: () => navigator.onLine === false,
      }),
    );
  };
  rendre();
  const arrets = [
    compte.abonner(rendre),
    synchro?.abonner(rendre),
    abonnerMiseAJour(rendre),
  ].filter(Boolean);
  return {
    section,
    danger,
    confidentialite: el("p", { class: "reglages-liens" }, lienConfidentialite()),
    arreter: () => arrets.forEach((a) => a()),
  };
}
