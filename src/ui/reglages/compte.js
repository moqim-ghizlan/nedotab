import { el } from "../dom.js";
import { creerAvatar } from "../avatar.js";

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

/** "Compte" section of the settings panel. Returns the section and a teardown. */
export function sectionCompte(compte) {
  const contenu = el("div", { class: "compte" });
  const section = el(
    "section",
    { class: "reglages-section", "aria-labelledby": "titre-compte" },
    el("h3", { id: "titre-compte", texte: "Compte" }),
    contenu,
  );

  const rendre = (etat) => {
    if (etat.statut === "connecte" && etat.profil) {
      contenu.replaceChildren(
        el(
          "div",
          { class: "compte-profil" },
          creerAvatar(etat.profil, { taille: 44 }),
          el(
            "div",
            { class: "compte-identite" },
            el("strong", { texte: etat.profil.nom || etat.profil.email }),
            etat.profil.nom ? el("span", { texte: etat.profil.email }) : null,
          ),
        ),
        el("p", {
          class: "reglages-note",
          texte:
            "Vos sites restent pour l'instant sur cet ordinateur ; la synchronisation arrive bientôt.",
        }),
        el("button", {
          type: "button",
          class: "bouton",
          texte: "Se déconnecter",
          onclick: () => compte.deconnecter(),
        }),
      );
      return;
    }
    const enCours = etat.statut === "connexion";
    contenu.replaceChildren(
      el("p", {
        class: "reglages-note",
        texte: "Connectez-vous pour synchroniser vos sites entre vos appareils (bientôt).",
      }),
      el(
        "button",
        {
          type: "button",
          class: "bouton-google",
          disabled: enCours,
          onclick: () => compte.connecter(),
        },
        logoGoogle(),
        el("span", { texte: enCours ? "Connexion…" : "Se connecter avec Google" }),
      ),
      ...(etat.erreur
        ? [
            el(
              "p",
              { class: "compte-erreur", role: "alert" },
              el("span", { texte: etat.erreur }),
              el("button", {
                type: "button",
                class: "lien-discret",
                texte: "Réessayer",
                onclick: () => compte.connecter(),
              }),
            ),
          ]
        : []),
    );
  };
  rendre(compte.lire());
  const arreter = compte.abonner(rendre);
  return { section, arreter };
}
