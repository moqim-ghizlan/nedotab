import { dechiffrerDepuisLien, preuveMotDePasseLien } from "../core/coffre.js";
import {
  MESSAGE_INDISPONIBLE,
  adresseSure,
  analyserLien,
  deballer,
  nomSur,
} from "../core/lienPartage.js";

/**
 * Reception page of a share link (V4.28): no account, no Firebase SDK, no storage (no
 * localStorage, no cookie), no external resource. The key lives in the URL fragment: it is read
 * once and ERASED from the address bar. Everything received is shown with textContent; a file is
 * only ever downloaded, never opened in the page; a link is never opened without a second,
 * explicit click.
 *
 * @param {object} d
 * @param {HTMLElement} d.racine
 * @param {string} d.fragment location.hash
 * @param {(fragmentVide: string) => void} d.effacerFragment replaceState
 * @param {typeof fetch} d.requete
 * @param {(texte: string) => Promise<void>} d.copier
 * @param {(blob: Blob, nom: string) => void} d.telecharger
 * @param {(adresse: string) => void} d.ouvrirLien
 */
export function demarrer({
  racine,
  fragment,
  effacerFragment,
  requete,
  copier,
  telecharger,
  ouvrirLien,
  doc = document,
}) {
  const lien = analyserLien(`#${String(fragment).replace(/^#/, "")}`);
  effacerFragment(); // the key must not stay in the history nor in a screenshot
  let ticket = null;
  let info = null;

  const noeud = (tag, props = {}, ...enfants) => {
    const n = doc.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === "texte") n.textContent = v;
      else if (k === "onclick") n.addEventListener("click", v);
      else n.setAttribute(k, v === true ? "" : v);
    }
    n.append(...enfants.flat().filter(Boolean));
    return n;
  };
  const pied = () =>
    noeud(
      "footer",
      {},
      noeud("button", { type: "button", texte: "Signaler ce contenu", onclick: signaler }),
      noeud("a", { href: "/", texte: "À propos de NedoTab" }),
    );
  function afficher(...enfants) {
    racine.replaceChildren(...enfants);
    const cible = racine.querySelector("input, button.principal");
    cible?.focus?.();
  }
  const message = (titre, detail, ...plus) =>
    afficher(
      noeud("h1", { texte: titre }),
      noeud("p", { class: "erreur", role: "alert", texte: detail }),
      ...plus,
    );

  async function appeler(chemin, corps) {
    const r = await requete(`/api/lien/${chemin}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corps),
      credentials: "omit",
      referrerPolicy: "no-referrer",
      cache: "no-store",
    });
    const json = await r.json().catch(() => ({}));
    return { ok: r.ok, statut: r.status, json };
  }

  async function signaler() {
    if (!lien.ok) return;
    try {
      await appeler("signaler", { jeton: lien.jeton });
    } catch {
      /* best effort */
    }
    const b = racine.querySelector("footer button");
    if (b) b.textContent = "Merci, c'est signalé";
  }

  const taille = (o) =>
    o < 1024 * 1024
      ? `${Math.max(1, Math.round(o / 1024))} Ko`
      : `${(o / 1024 / 1024).toFixed(1)} Mo`;
  const libelleType = { texte: "Un texte", lien: "Un lien", fichier: "Un fichier" };

  async function etapeInfo() {
    if (!lien.ok)
      return message(
        "Lien incomplet",
        lien.raison === "incomplet"
          ? "Le lien est incomplet — demandez-en un nouveau."
          : MESSAGE_INDISPONIBLE,
      );
    afficher(noeud("h1", { texte: "Chargement…" }));
    try {
      const r = await appeler("ouvrir", { jeton: lien.jeton, action: "info" });
      if (!r.ok) return message("Élément partagé", MESSAGE_INDISPONIBLE);
      info = r.json;
      etapeOuvrir();
    } catch {
      message(
        "Élément partagé",
        "Erreur réseau.",
        noeud("button", {
          type: "button",
          class: "principal",
          texte: "Réessayer",
          onclick: etapeInfo,
        }),
      );
    }
  }

  function etapeOuvrir(erreur = null) {
    const champ = info.motDePasse
      ? noeud("input", {
          type: "password",
          id: "mdp",
          autocomplete: "current-password",
          "aria-label": "Mot de passe du lien",
        })
      : null;
    const bouton = noeud("button", {
      type: "button",
      class: "principal",
      texte: info.motDePasse ? "Déverrouiller" : "Ouvrir",
      onclick: () => ouvrir(champ, bouton),
    });
    champ?.addEventListener("keydown", (e) => e.key === "Enter" && bouton.click());
    afficher(
      noeud("h1", { texte: "Quelqu'un vous a partagé un élément" }),
      noeud(
        "div",
        { class: "carte" },
        noeud("p", {
          class: "detail",
          texte: `${libelleType[info.type] ?? "Un élément"} · ${taille(info.taille)}`,
        }),
        noeud("p", {
          class: "avertissement",
          texte: "Contenu partagé par un utilisateur de NedoTab. NedoTab ne le vérifie pas.",
        }),
        info.verrouille
          ? noeud("p", {
              class: "erreur",
              role: "alert",
              texte: "Ce lien est verrouillé après trop d'essais.",
            })
          : null,
        champ,
        erreur ? noeud("p", { class: "erreur", role: "alert", texte: erreur }) : null,
        info.verrouille ? null : bouton,
      ),
      pied(),
    );
  }

  async function ouvrir(champ, bouton) {
    bouton.disabled = true;
    bouton.textContent = "Déchiffrement…";
    const motDePasse = champ?.value || null;
    try {
      const corps = { jeton: lien.jeton, action: "ouvrir", ...(ticket ? { ticket } : {}) };
      if (info.motDePasse) {
        if (!motDePasse) return etapeOuvrir("Saisissez le mot de passe.");
        corps.preuve = await preuveMotDePasseLien(motDePasse, lien.jeton, info.iterations);
      }
      const r = await appeler("ouvrir", corps);
      if (r.statut === 401) {
        const n = r.json.restants ?? 0;
        return etapeOuvrir(`Mot de passe incorrect — il reste ${n} essai${n > 1 ? "s" : ""}.`);
      }
      if (r.statut === 423) {
        info.verrouille = true;
        return etapeOuvrir();
      }
      if (!r.ok) return message("Élément partagé", MESSAGE_INDISPONIBLE);
      ticket = r.json.ticket;
      const octets = Uint8Array.from(
        atob(r.json.donnees.replace(/-/g, "+").replace(/_/g, "/")),
        (c) => c.charCodeAt(0),
      );
      const clair = await dechiffrerDepuisLien({
        cle: lien.cle,
        jeton: lien.jeton,
        motDePasse,
        donnees: octets,
        iterations: r.json.iterations ?? undefined,
      });
      const contenu = deballer(clair);
      if (!contenu) throw new Error("illisible");
      montrer(contenu);
    } catch (e) {
      if (e?.name === "TypeError") {
        // Network cut after the count: the receipt (2 minutes) lets the same browser try again.
        return message(
          "Élément partagé",
          "Erreur réseau.",
          noeud("button", {
            type: "button",
            class: "principal",
            texte: "Réessayer",
            onclick: () => etapeOuvrir(),
          }),
        );
      }
      message(
        "Élément partagé",
        "Déchiffrement impossible : le lien est peut-être incomplet ou le mot de passe incorrect.",
      );
    }
  }

  function montrer({ type, nom, typeMime, octets }) {
    const texte = () => new TextDecoder().decode(octets);
    const copie = (valeur) => {
      const b = noeud("button", { type: "button", texte: "Copier" });
      b.addEventListener("click", async () => {
        try {
          await copier(valeur);
          b.textContent = "Copié ✓";
        } catch {
          b.textContent = "Copie impossible";
        }
      });
      return b;
    };
    if (type === "fichier") {
      const dl = noeud("button", { type: "button", class: "principal", texte: "Télécharger" });
      // Always a download, with a neutral type: the page never opens or previews the file.
      dl.addEventListener("click", () =>
        telecharger(new Blob([octets], { type: "application/octet-stream" }), nomSur(nom)),
      );
      afficher(
        noeud("h1", { texte: "Fichier reçu" }),
        noeud(
          "div",
          { class: "carte" },
          noeud("p", { texte: nomSur(nom) }),
          noeud("p", {
            class: "detail",
            texte: `${taille(octets.length)}${typeMime ? ` · ${typeMime}` : ""}`,
          }),
          dl,
        ),
        pied(),
      );
      return;
    }
    const valeur = texte();
    const adresse = type === "lien" ? adresseSure(valeur) : null;
    const carte = noeud(
      "div",
      { class: "carte" },
      noeud("pre", { class: "contenu", texte: valeur }),
      copie(valeur),
    );
    if (adresse) {
      carte.append(
        noeud("p", {
          class: "avertissement",
          texte:
            "Ce lien vient d'une personne externe. Copiez-le ou ouvrez-le seulement si vous avez confiance.",
        }),
      );
      const ouvrirBtn = noeud("button", { type: "button", texte: "Ouvrir (à vos risques)" });
      let arme = false;
      ouvrirBtn.addEventListener("click", () => {
        if (!arme) {
          arme = true;
          ouvrirBtn.textContent = "Confirmer l'ouverture";
          return;
        }
        ouvrirLien(adresse);
      });
      carte.append(ouvrirBtn);
    }
    afficher(noeud("h1", { texte: type === "lien" ? "Lien reçu" : "Texte reçu" }), carte, pied());
  }

  etapeInfo();
}
