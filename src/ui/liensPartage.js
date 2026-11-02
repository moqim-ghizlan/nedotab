import { validerMotDePasse } from "../core/coffre.js";
import { DUREES, formaterTempsRestant } from "../core/expirationPartage.js";
import { LIENS_ACTIFS_MAX, OUVERTURES_PROPOSEES, libelleOuvertures } from "../core/lienPartage.js";
import { demander } from "./dialogues/commun.js";
import { el } from "./dom.js";
import { toast } from "./toast.js";

/**
 * Share links, owner side (V4.28): create (duration, openings, optional password), copy the
 * complete link, list "Mes liens" and revoke (cancellable for 5 s). The link contains the key
 * and is NOT kept: it cannot be shown again once the dialog is closed (said before closing).
 */

const MESSAGES = {
  unavailable: "Les liens sont temporairement désactivés.",
  "permission-denied": "La création de liens n'est pas ouverte à ce compte.",
  "resource-exhausted": `Limite atteinte (${LIENS_ACTIFS_MAX} liens actifs, 10 créations par heure).`,
  "invalid-argument": "Lien refusé : vérifiez le contenu et les paramètres.",
};
const erreurLisible = (e) => {
  const code = String(e?.code ?? "").replace("functions/", "");
  if (typeof navigator !== "undefined" && navigator.onLine === false)
    return "Reconnectez-vous pour créer un lien.";
  return MESSAGES[code] ?? "Impossible pour l'instant. Réessayez.";
};

function pastilles(libelle, options, courant, surChoix) {
  const groupe = el("div", { class: "partage-durees", role: "radiogroup", "aria-label": libelle });
  const maj = () =>
    groupe.childNodes.forEach((b) =>
      b.setAttribute("aria-checked", String(b.dataset.v === String(courant()))),
    );
  options.forEach((o) =>
    groupe.append(
      el("button", {
        type: "button",
        role: "radio",
        class: "partage-duree",
        dataset: { v: String(o.valeur) },
        texte: o.libelle,
        onclick: () => {
          surChoix(o.valeur);
          maj();
        },
      }),
    ),
  );
  maj();
  return el(
    "div",
    { class: "champ" },
    el("span", { class: "lien-discret", texte: libelle }),
    groupe,
  );
}

/**
 * @param {object} d
 * @param {() => Promise<object>} d.charger Firebase module
 * @param {(texte: string) => Promise<void>} d.copier
 * @param {{ type: "texte"|"lien", contenu: string }} d.element the CLEAR content (decrypted if it came from the vault)
 * @param {string} d.dureeId default duration
 */
export async function creerLienPourElement({ charger, copier, element, dureeId = "1j" }) {
  let duree = dureeId;
  let ouvertures = 1;
  let protege = false;
  const mdp = el("input", {
    type: "password",
    class: "coffre-champ",
    autocomplete: "new-password",
    "aria-label": "Mot de passe du lien",
    hidden: true,
  });
  const jauge = el("p", { class: "coffre-jauge", "aria-live": "polite", hidden: true });
  mdp.addEventListener("input", () => (jauge.textContent = validerMotDePasse(mdp.value).message));
  const interrupteur = el("input", {
    type: "checkbox",
    id: "lien-mdp",
    onchange: (e) => {
      protege = e.target.checked;
      mdp.hidden = jauge.hidden = !protege;
    },
  });
  const message = el("p", {
    class: "coffre-message coffre-message--erreur",
    role: "alert",
    hidden: true,
  });

  for (;;) {
    const r = await demander({
      titre: "Créer un lien",
      message:
        "Toute personne qui a le lien complet peut ouvrir une copie de cet élément, sans compte. Vous pouvez le révoquer à tout moment.",
      contenu: [
        pastilles(
          "Durée",
          DUREES.map((d) => ({ valeur: d.id, libelle: d.libelle })),
          () => duree,
          (v) => (duree = v),
        ),
        pastilles(
          "Ouvertures",
          OUVERTURES_PROPOSEES.map((n) => ({
            valeur: n,
            libelle: n === 0 ? "Illimité" : String(n),
          })),
          () => ouvertures,
          (v) => (ouvertures = v),
        ),
        el(
          "label",
          { class: "partage-chiffrer", for: "lien-mdp" },
          interrupteur,
          el("span", { texte: " Protéger par un mot de passe" }),
        ),
        mdp,
        jauge,
        message,
      ],
      boutons: [
        { libelle: "Annuler", valeur: null },
        { libelle: "Créer le lien", valeur: "ok", principal: true },
      ],
    });
    if (r !== "ok") return null;
    if (protege && !validerMotDePasse(mdp.value).ok) {
      message.hidden = false;
      message.textContent = validerMotDePasse(mdp.value).message;
      continue;
    }
    message.hidden = true;
    try {
      const fb = await charger();
      const octets = new TextEncoder().encode(element.contenu);
      const res = await fb.creerLienPartage(
        { type: element.type, octets },
        { dureeId: duree, ouverturesMax: ouvertures, motDePasse: protege ? mdp.value : null },
      );
      await afficherLien(res.lien, copier);
      return res;
    } catch (e) {
      toast(erreurLisible(e), { type: "erreur" });
      return null;
    }
  }
}

async function afficherLien(lien, copier) {
  const boite = el("code", {
    class: "coffre-cle",
    texte: lien,
    style: "word-break:break-all;font-size:0.8rem",
  });
  const copie = el("button", {
    type: "button",
    class: "bouton bouton--principal",
    texte: "Copier le lien",
  });
  copie.addEventListener("click", async () => {
    try {
      await copier(lien);
      copie.textContent = "Copié ✓";
    } catch {
      toast("Copie impossible : sélectionnez le lien à la main.", { type: "erreur" });
    }
  });
  const partager = navigator.share
    ? el("button", {
        type: "button",
        class: "bouton",
        texte: "Partager",
        onclick: () => navigator.share({ url: lien }).catch(() => {}),
      })
    : null;
  await demander({
    titre: "Votre lien",
    message:
      "Ce lien contient la clé : copiez-le en entier. Il ne pourra plus être affiché après la fermeture de cette fenêtre.",
    contenu: [boite, el("div", { class: "coffre-ligne" }, copie, partager)],
    boutons: [{ libelle: "Fermer", valeur: "ok", principal: true }],
  });
}

/** "Mes liens actifs": one card per link with a counter and a revoke button (cancellable for 5 s). */
export async function ouvrirMesLiens({ charger }) {
  const liste = el("ul", { class: "partage-liste" });
  const maintenant = () => Date.now();
  let liens = [];
  const rendre = () => {
    liste.replaceChildren();
    if (!liens.length) liste.append(el("li", { class: "partage-vide", texte: "Aucun lien actif" }));
    for (const l of liens) {
      liste.append(
        el(
          "li",
          { class: "partage-carte", dataset: { id: l.idLien } },
          el("span", {
            class: "partage-type",
            "aria-hidden": "true",
            texte: l.motDePasse ? "🔒" : "🔗",
          }),
          el(
            "div",
            { class: "partage-texte" },
            el("span", {
              class: "partage-apercu",
              texte: `${{ texte: "Texte", lien: "Lien", fichier: "Fichier" }[l.type]} · ${libelleOuvertures(l)}`,
            }),
            el("span", {
              class: "partage-detail",
              texte: `expire dans ${formaterTempsRestant(l.expireLe - maintenant())}${l.motDePasse ? " · protégé par mot de passe" : ""}${l.verrouille ? " · verrouillé" : ""}${l.suspendu ? " · suspendu" : ""}`,
            }),
          ),
          el("button", {
            type: "button",
            class: "partage-action partage-action--danger",
            texte: "Révoquer",
            onclick: () => revoquer(l),
          }),
        ),
      );
    }
  };
  function revoquer(l) {
    // Cancellable for 5 seconds: the server is called only when the delay is over.
    liens = liens.filter((x) => x !== l);
    rendre();
    let annule = false;
    toast("Lien révoqué", {
      duree: 5000,
      action: {
        libelle: "Annuler",
        onClic: () => {
          annule = true;
          liens = [...liens, l].sort((a, b) => b.creeLe - a.creeLe);
          rendre();
        },
      },
    });
    setTimeout(async () => {
      if (annule) return;
      try {
        await (await charger()).revoquerLien(l.idLien);
      } catch {
        toast("Révocation impossible pour l'instant.", { type: "erreur" });
      }
    }, 5000);
  }
  try {
    liens = await (await charger()).listerLiens();
  } catch (e) {
    return toast(erreurLisible(e), { type: "erreur" });
  }
  rendre();
  await demander({
    titre: "Mes liens actifs",
    contenu: [liste],
    boutons: [{ libelle: "Fermer", valeur: "ok", principal: true }],
  });
}
