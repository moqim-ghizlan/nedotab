import {
  ErreurCoffre,
  changerMotDePasse,
  chiffrerElement,
  creerCoffre,
  dechiffrerElement,
  chiffrerFichier,
  dechiffrerFichier,
  deverrouiller,
  deverrouillerParSecours,
  groupesAVerifier,
  regenererCleSecours,
  reinitialiserParSecours,
  validerMotDePasse,
  verifierGroupes,
} from "../../core/coffre.js";
import { creerSessionCoffre, delaiApresErreurs } from "../../core/sessionCoffre.js";
import { demander } from "../dialogues/commun.js";
import { el } from "../dom.js";
import { toast } from "../toast.js";

/**
 * Vault interface (V4.26): creation wizard, unlock, banner, encrypt / decrypt helpers. All
 * the cryptography is in core/coffre.js; this file only drives dialogs and the session. The
 * password and the key never leave this module except toward core/coffre.js.
 *
 * Tone: calm, reassuring; no red except for the destruction.
 */
export function creerCoffreUI({ charger, uid, session = creerSessionCoffre() }) {
  let meta = null; // description of the vault, null = none (or not loaded yet)
  let charge = false;
  let erreurs = 0;

  const etat = el("span", { class: "coffre-etat", role: "status", "aria-live": "polite" });
  const action = el("button", { type: "button", class: "lien-discret coffre-action" });
  const bandeau = el("p", { class: "coffre-bandeau", hidden: true }, etat, action);
  const case_ = el("input", { type: "checkbox", id: "partage-chiffrer" });
  const caseChiffrer = el(
    "label",
    { class: "partage-chiffrer", hidden: true },
    case_,
    el("span", { texte: " Chiffrer (vault)" }),
  );
  let surChangement = () => {};

  const fb = () => charger();

  function rendre() {
    const dispo = !!uid();
    caseChiffrer.hidden = !dispo;
    bandeau.hidden = !dispo || !meta;
    if (!meta) return;
    if (session.estDeverrouille()) {
      const min = session.minutesRestantes();
      etat.textContent = `Vault ouvert — se verrouille dans ${min} min`;
      action.textContent = "Verrouiller maintenant";
      action.onclick = () => session.verrouiller();
    } else {
      etat.textContent = "Vault verrouillé 🔒";
      action.textContent = "Déverrouiller";
      action.onclick = () => demanderDeverrouillage();
    }
  }

  async function actualiser() {
    if (!uid()) return;
    try {
      meta = await (await fb()).lireMetaCoffre(uid());
      charge = true;
    } catch {
      /* offline: the banner stays as it was */
    }
    rendre();
    surChangement();
  }

  session.surDeverrouille(() => {
    rendre();
    surChangement();
  });
  session.surVerrouille(() => {
    case_.checked = false;
    rendre();
    surChangement();
  });
  setInterval(() => session.estDeverrouille() && rendre(), 30_000);
  document.addEventListener("visibilitychange", () => session.visibilite(document.hidden));

  // --- Dialog pieces ---------------------------------------------------------------------------
  let n = 0;
  function champMdp(libelle, autocomplete) {
    const id = `coffre-mdp-${++n}`;
    const input = el("input", {
      id,
      type: "password",
      autocomplete,
      spellcheck: "false",
      autocapitalize: "none",
      class: "coffre-champ",
    });
    const oeil = el("button", {
      type: "button",
      class: "lien-discret",
      "aria-label": "Afficher le mot de passe",
      texte: "👁",
      onclick: () => {
        input.type = input.type === "password" ? "text" : "password";
      },
    });
    return {
      input,
      noeud: el(
        "div",
        { class: "champ" },
        el("label", { for: id, texte: libelle }),
        el("div", { class: "coffre-ligne" }, input, oeil),
      ),
    };
  }
  const texteMessage = (m, erreur = false) =>
    el("p", {
      class: `coffre-message${erreur ? " coffre-message--erreur" : ""}`,
      role: "alert",
      texte: m ?? "",
      hidden: !m,
    });

  async function copier(texte) {
    try {
      await navigator.clipboard.writeText(texte);
      toast("Copié");
    } catch {
      toast("Copie impossible : notez la clé à la main.", { type: "erreur" });
    }
  }

  /** The secret key is shown ONCE; the user must retype 3 random groups before going on. */
  async function afficherCleSecours(cle) {
    const indexes = groupesAVerifier();
    const boite = el("div", { class: "coffre-cle", "aria-label": "Clé de secours", texte: cle });
    const r = await demander({
      titre: "Votre clé de secours",
      message:
        "Cette clé n'est affichée qu'une fois. Sans elle ET sans votre mot de passe, le contenu du vault est perdu définitivement.",
      contenu: [
        boite,
        el(
          "div",
          { class: "coffre-ligne" },
          el("button", {
            type: "button",
            class: "bouton",
            texte: "Copier",
            onclick: () => copier(cle),
          }),
          el("button", {
            type: "button",
            class: "bouton",
            texte: "Enregistrer",
            onclick: () => {
              const url = URL.createObjectURL(
                new Blob([`Clé de secours NedoTab\n\n${cle}\n`], { type: "text/plain" }),
              );
              const a = el("a", { href: url, download: "cle-secours-nedotab.txt" });
              document.body.append(a);
              a.click();
              a.remove();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            },
          }),
        ),
      ],
      boutons: [{ libelle: "J'ai noté la clé", valeur: "ok", principal: true }],
    });
    if (r !== "ok") return false;
    for (;;) {
      const champs = indexes.map((i) =>
        el("input", {
          type: "text",
          class: "coffre-champ",
          "aria-label": `Groupe ${i + 1}`,
          placeholder: `Groupe ${i + 1}`,
          maxlength: "4",
          autocomplete: "off",
          autocapitalize: "characters",
        }),
      );
      const msg = texteMessage(null, true);
      const v = await demander({
        titre: "Vérification",
        message: `Retapez les groupes ${indexes.map((i) => i + 1).join(", ")} de votre clé de secours.`,
        contenu: [...champs, msg],
        boutons: [
          { libelle: "Revoir la clé", valeur: "retour" },
          { libelle: "Vérifier", valeur: "ok", principal: true },
        ],
      });
      if (v === "retour" || v == null) return afficherCleSecours(cle);
      if (
        verifierGroupes(
          cle,
          indexes,
          champs.map((c) => c.value),
        )
      )
        return true;
      toast("Ces groupes ne correspondent pas.", { type: "erreur" });
    }
  }

  /** Two fields + live strength gauge (text). @returns {Promise<string|null>} the password */
  async function demanderNouveauMdp(titre = "Choisissez un mot de passe") {
    for (let message = null; ;) {
      const a = champMdp("Mot de passe", "new-password");
      const b = champMdp("Confirmez", "new-password");
      const jauge = el("p", {
        class: "coffre-jauge",
        "aria-live": "polite",
        texte: "Essayez une phrase de 4 mots.",
      });
      a.input.addEventListener("input", () => {
        jauge.textContent = a.input.value
          ? validerMotDePasse(a.input.value).message
          : "Essayez une phrase de 4 mots.";
      });
      const r = await demander({
        titre,
        message:
          "La sécurité dépend de la force de votre mot de passe. Il n'est jamais envoyé à NedoTab.",
        contenu: [a.noeud, jauge, b.noeud, texteMessage(message, true)],
        boutons: [
          { libelle: "Annuler", valeur: null },
          { libelle: "Continuer", valeur: "ok", principal: true },
        ],
      });
      if (r !== "ok") return null;
      const v = validerMotDePasse(a.input.value);
      if (!v.ok) message = v.message;
      else if (a.input.value !== b.input.value) message = "Les deux mots de passe sont différents.";
      else return a.input.value;
    }
  }

  // --- Creation wizard (4 screens) -------------------------------------------------------------
  async function assistantCreation() {
    const intro = await demander({
      titre: "Qu'est-ce que le vault ?",
      message:
        "Le vault chiffre vos éléments sur cet appareil, avec un mot de passe que vous seul connaissez. Appareil → illisible → cloud : NedoTab, Firebase et son propriétaire ne voient que des données illisibles. Si vous perdez le mot de passe ET la clé de secours, rien ne peut être récupéré.",
      boutons: [
        { libelle: "Plus tard", valeur: null },
        { libelle: "Continuer", valeur: "ok", principal: true },
      ],
    });
    if (intro !== "ok") return false;
    const mdp = await demanderNouveauMdp();
    if (!mdp) return false;
    toast("Calcul en cours…");
    let c;
    try {
      c = await creerCoffre(mdp);
    } catch (e) {
      toast(e.message, { type: "erreur" });
      return false;
    }
    if (!(await afficherCleSecours(c.cleSecours))) return false;
    const r = await (await fb()).creerMetaCoffre(uid(), c.meta);
    if (r.existe) {
      toast("Un vault existe déjà : saisissez son mot de passe.");
      await actualiser();
      return demanderDeverrouillage();
    }
    await actualiser();
    session.deverrouiller(c.vk);
    toast("Vault créé");
    return true;
  }

  // --- Unlock ---------------------------------------------------------------------------------
  async function demanderDeverrouillage() {
    if (session.estDeverrouille()) return true;
    for (let message = null; ;) {
      const wait = delaiApresErreurs(erreurs);
      const m = champMdp("Mot de passe du vault", "current-password");
      const r = await demander({
        titre: "Déverrouiller le vault",
        contenu: [m.noeud, texteMessage(message, true)],
        boutons: [
          { libelle: "Mot de passe oublié ?", valeur: "oubli" },
          { libelle: "Annuler", valeur: null },
          { libelle: "Déverrouiller", valeur: "ok", principal: true },
        ],
      });
      if (r === "oubli") return reinitialiser();
      if (r !== "ok") return false;
      if (wait) await new Promise((ok) => setTimeout(ok, wait));
      toast("Calcul…");
      try {
        session.deverrouiller(await deverrouiller(meta, m.input.value));
        erreurs = 0;
        return true;
      } catch (e) {
        erreurs++;
        message =
          e instanceof ErreurCoffre && e.code === "mot-de-passe"
            ? "Mot de passe incorrect."
            : e.message;
      }
    }
  }

  async function reinitialiser() {
    for (let message = null; ;) {
      const cle = el("input", {
        type: "text",
        class: "coffre-champ",
        "aria-label": "Clé de secours",
        placeholder: "XXXX-XXXX-XXXX-XXXX-XXXX-XXXX",
        autocomplete: "off",
        autocapitalize: "characters",
        spellcheck: "false",
      });
      const r = await demander({
        titre: "Mot de passe oublié",
        message:
          "Saisissez votre clé de secours. Vous choisirez ensuite un nouveau mot de passe et une nouvelle clé : rien n'est perdu. Sans la clé, vous pouvez détruire le vault dans les réglages.",
        contenu: [cle, texteMessage(message, true)],
        boutons: [
          { libelle: "Annuler", valeur: null },
          { libelle: "Continuer", valeur: "ok", principal: true },
        ],
      });
      if (r !== "ok") return false;
      try {
        await deverrouillerParSecours(meta, cle.value); // checks the key before asking for a password
      } catch {
        message = "Clé de secours incorrecte.";
        continue;
      }
      const mdp = await demanderNouveauMdp("Nouveau mot de passe");
      if (!mdp) return false;
      const res = await reinitialiserParSecours(meta, cle.value, mdp);
      if (!(await afficherCleSecours(res.cleSecours))) return false;
      await (await fb()).majEnveloppesCoffre(uid(), res.meta);
      await actualiser();
      session.deverrouiller(res.vk);
      return true;
    }
  }

  /** Ensures the vault is unlocked, offering to create or unlock it. @returns {Promise<boolean>} */
  async function assurerDeverrouille() {
    if (!charge) await actualiser();
    if (session.estDeverrouille()) return true;
    return meta ? demanderDeverrouillage() : assistantCreation();
  }

  // --- Settings ---------------------------------------------------------------------------------
  async function changerMdp() {
    const a = champMdp("Mot de passe actuel", "current-password");
    const r = await demander({
      titre: "Changer le mot de passe",
      contenu: [a.noeud],
      boutons: [
        { libelle: "Annuler", valeur: null },
        { libelle: "Continuer", valeur: "ok", principal: true },
      ],
    });
    if (r !== "ok") return;
    try {
      await deverrouiller(meta, a.input.value);
    } catch {
      return toast("Mot de passe incorrect.", { type: "erreur" });
    }
    const nouveau = await demanderNouveauMdp("Nouveau mot de passe");
    if (!nouveau) return;
    await (
      await fb()
    ).majEnveloppesCoffre(uid(), await changerMotDePasse(meta, a.input.value, nouveau));
    await actualiser();
    toast("Mot de passe changé");
  }

  async function nouvelleCle() {
    const a = champMdp("Mot de passe du vault", "current-password");
    const r = await demander({
      titre: "Régénérer la clé de secours",
      message: "L'ancienne clé ne fonctionnera plus.",
      contenu: [a.noeud],
      boutons: [
        { libelle: "Annuler", valeur: null },
        { libelle: "Continuer", valeur: "ok", principal: true },
      ],
    });
    if (r !== "ok") return;
    try {
      const res = await regenererCleSecours(meta, a.input.value);
      if (!(await afficherCleSecours(res.cleSecours)))
        return toast("Annulé : l'ancienne clé reste valable.");
      await (await fb()).majEnveloppesCoffre(uid(), res.meta);
      await actualiser();
    } catch {
      toast("Mot de passe incorrect.", { type: "erreur" });
    }
  }

  async function detruire() {
    const champ = el("input", {
      type: "text",
      class: "coffre-champ",
      "aria-label": "Tapez DÉTRUIRE",
      autocomplete: "off",
    });
    const r = await demander({
      titre: "Détruire le vault",
      message:
        "Tous les éléments chiffrés (textes, liens, fichiers) seront supprimés définitivement. Tapez DÉTRUIRE pour confirmer.",
      contenu: [champ],
      boutons: [
        { libelle: "Annuler", valeur: null },
        { libelle: "Détruire", valeur: "ok", principal: true, danger: true },
      ],
    });
    if (r !== "ok" || champ.value.trim().toUpperCase() !== "DÉTRUIRE")
      return r === "ok" && toast("Saisie incorrecte : rien n'a été détruit.");
    const nb = await (await fb()).detruireCoffre(uid());
    session.verrouiller();
    meta = null;
    rendre();
    surChangement();
    toast(`Vault détruit (${nb} élément${nb > 1 ? "s" : ""} supprimé${nb > 1 ? "s" : ""})`);
  }

  /** The "Sécurité → Vault" section of the settings. */
  function sectionReglages() {
    const delai = el(
      "select",
      {
        "aria-label": "Verrouillage automatique",
        onchange: (e) => session.definirDelai(Number(e.target.value)),
      },
      [5, 15, 30, 60].map((m) =>
        el("option", { value: String(m), selected: m === 15, texte: `${m} min d'inactivité` }),
      ),
    );
    const contenu = el("div", { class: "coffre-reglages" });
    const maj = () => {
      contenu.replaceChildren();
      if (!meta) {
        contenu.append(
          el("p", {
            texte:
              "Aucun vault. Chiffrez vos éléments sur l'appareil avec un mot de passe que vous seul connaissez.",
          }),
          el("button", {
            type: "button",
            class: "bouton bouton--principal",
            texte: "Créer un vault",
            onclick: () => assistantCreation(),
          }),
        );
        return;
      }
      contenu.append(
        el("button", {
          type: "button",
          class: "bouton",
          texte: "Changer le mot de passe",
          onclick: () => changerMdp(),
        }),
        el("button", {
          type: "button",
          class: "bouton",
          texte: "Régénérer la clé de secours",
          onclick: () => nouvelleCle(),
        }),
        el("label", {}, el("span", { texte: "Verrouillage automatique " }), delai),
        el(
          "div",
          { class: "coffre-zone-danger" },
          el("p", { texte: "Zone dangereuse : détruire le vault supprime tous ses éléments." }),
          el("button", {
            type: "button",
            class: "bouton bouton--danger",
            texte: "Détruire le vault",
            onclick: () => detruire(),
          }),
        ),
      );
    };
    const ancien = surChangement;
    surChangement = () => {
      ancien();
      maj();
    };
    actualiser().then(maj);
    return contenu;
  }

  return {
    bandeau,
    caseChiffrer,
    sectionReglages,
    session,
    actualiser,
    assurerDeverrouille,
    /** True when the next item must be encrypted (box ticked). */
    veutChiffrer: () => case_.checked,
    aUnCoffre: () => !!meta,
    onChange: (f) => {
      const ancien = surChangement;
      surChangement = () => {
        ancien();
        f();
      };
    },
    /** @returns {(id: string, e: {contenu: string, titre: string}) => Promise<string>} */
    chiffrer: async (id, e) => chiffrerElement(session.cle(), uid(), id, e),
    /** Encrypts the bytes of a file (id = the id of its element: authenticated data). */
    chiffrerOctets: async (id, octets) => chiffrerFichier(session.cle(), uid(), id, octets),
    dechiffrerOctets: async (id, octets) => dechiffrerFichier(session.cle(), uid(), id, octets),
    /** @returns {Promise<{contenu: string, titre: string}>} (throws ErreurCoffre "corrompu") */
    dechiffrer: async (e) => dechiffrerElement(session.cle(), uid(), e.id, e.contenu),
  };
}
