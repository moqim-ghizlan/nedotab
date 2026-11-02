import {
  ICONES_FAMILLE,
  QUOTA_MAX,
  TAILLE_MAX_RESEAU_MOBILE,
  apercuPossible,
  avertissementTelechargement,
  familleDe,
  formaterTaille,
  niveauQuota,
  nomAffiche,
  telechargementSeulement,
  texteQuota,
  tronquerMilieu,
  validerFichier,
} from "../core/espacePartageFichiers.js";
import { demander } from "./dialogues/commun.js";
import { el } from "./dom.js";
import { vibrer } from "./haptique.js";
import { toast } from "./toast.js";

/** Thumbnails: only small images, downloaded once and kept in memory for the session. */
const MINIATURE_MAX = 8 * 1024 * 1024;
/** Opened files kept in memory (the session only, never stored: the content may be private). */
const CACHE_MAX = 60 * 1024 * 1024;

/**
 * Files and images of the sharing space (V4.25): add (picker, drop, paste), send with progress
 * and cancel, thumbnails, download / share, viewer, quota bar. A file is read with getBlob and
 * shown through a local blob: URL (revoked on close); SVG and HTML are never previewed.
 *
 * @param {object} d
 * @param {() => Promise<object>} d.charger
 * @param {() => string} d.uid
 * @param {import("../core/store.js").Store} d.store
 * @param {() => void} d.rendre asks the panel to draw again
 * @param {() => number} d.octets bytes used by the account (counter)
 */
export function creerFichiers({
  charger,
  uid,
  store,
  rendre,
  octets,
  expiration,
  coffre = null,
  creerLien = null,
}) {
  const envois = []; // { cle, fichier, part, etat: "envoi"|"echec"|"interrompu", erreur, annuler }
  const cache = new Map(); // id → Blob
  const miniatures = new Map(); // id → blob: URL
  const enCours = new Set();
  // V4.26: name and type of the encrypted files, in memory only while the vault is open.
  const metas = new Map(); // id → { contenu: name, typeMime } | { corrompu: true }
  let elementsVus = [];

  const entree = el("input", {
    type: "file",
    multiple: true,
    hidden: true,
    "aria-hidden": "true",
    tabindex: "-1",
    // A wide `accept` (no restriction): the sort is done by validerFichier.
    accept: "*/*",
    onchange: (e) => {
      ajouter([...e.currentTarget.files]);
      e.currentTarget.value = "";
    },
  });
  const message = el("p", {
    class: "partage-message",
    role: "status",
    "aria-live": "polite",
    hidden: true,
  });
  const dire = (texte) => {
    message.textContent = texte ?? "";
    message.hidden = !texte;
  };
  // The picker must be opened by a real click.
  const boutonAjout = el("button", {
    type: "button",
    class: "bouton partage-trombone",
    "aria-label": "Ajouter un fichier",
    title: "Ajouter un fichier",
    texte: "📎 Fichier",
    onclick: () => entree.click(),
  });

  // --- Quota -----------------------------------------------------------------------------------
  const barre = el("div", { class: "partage-quota-barre" });
  const texteBarre = el("span", { class: "partage-quota-texte" });
  const quota = el(
    "div",
    {
      class: "partage-quota",
      role: "progressbar",
      "aria-valuemin": "0",
      "aria-valuemax": String(QUOTA_MAX),
    },
    el("div", { class: "partage-quota-piste" }, barre),
    texteBarre,
  );
  function majQuota() {
    const o = octets();
    const { part, niveau } = niveauQuota(o);
    barre.style.width = `${(part * 100).toFixed(1)}%`;
    quota.dataset.niveau = niveau;
    quota.setAttribute("aria-valuenow", String(o));
    quota.setAttribute("aria-valuetext", texteQuota(o));
    // Text, not only colour: the level is also written.
    texteBarre.textContent = `${texteQuota(o)}${niveau === "plein" ? " — plein, libérez de l'espace" : niveau === "avertissement" ? " — bientôt plein" : ""}`;
    quota.hidden = o === 0 && envois.length === 0 && !elementsVus.some((e) => e.type === "fichier");
  }

  // --- Sending ---------------------------------------------------------------------------------
  const utilisesParLesEnvois = () =>
    envois.filter((e) => e.etat === "envoi").reduce((n, e) => n + e.fichier.size, 0);

  async function ajouter(fichiers) {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      dire("Reconnectez-vous pour envoyer.");
      return;
    }
    for (const f of fichiers) {
      const r = validerFichier(f, { octetsUtilises: octets() + utilisesParLesEnvois() });
      if (!r.ok) {
        dire(`${tronquerMilieu(f.name, 24)} : ${r.erreur}`);
        continue;
      }
      // A big file on a mobile network costs the user: ask first.
      if (f.size > TAILLE_MAX_RESEAU_MOBILE && reseauMobile()) {
        const ok = await demander({
          titre: "Envoyer un gros fichier ?",
          message: `${nomAffiche(f.name)} pèse ${formaterTaille(f.size)} et vous êtes sur le réseau mobile.`,
          boutons: [
            { libelle: "Annuler", valeur: false },
            { libelle: "Envoyer", valeur: true, principal: true },
          ],
        });
        if (!ok) continue;
      }
      dire(null);
      // V4.26: encrypted on the device before the send, the vault must be open first.
      const chiffre = !!coffre?.veutChiffrer();
      if (chiffre && !(await coffre.assurerDeverrouille())) return;
      demarrer({
        chiffre,
        cle: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        fichier: f,
        part: 0,
        etat: "envoi",
      });
    }
  }

  async function demarrer(envoi) {
    if (!envois.includes(envoi)) envois.push(envoi);
    envoi.etat = "envoi";
    envoi.part = 0;
    envoi.erreur = null;
    rendre();
    try {
      const fb = await charger();
      const { promesse, annuler } = fb.envoyerFichierPartage(
        uid(),
        envoi.fichier,
        (p) => {
          envoi.part = p;
          majProgres(envoi);
        },
        expiration?.(),
        envoi.chiffre && coffre
          ? {
              chiffrerOctets: (id, o) => coffre.chiffrerOctets(id, o),
              chiffrerNom: (id, e) => coffre.chiffrer(id, e),
            }
          : null,
      );
      envoi.annuler = annuler;
      await promesse;
      envois.splice(envois.indexOf(envoi), 1);
      vibrer(store, 15);
    } catch (e) {
      // Cancelled by the user: nothing to say. Cancelled by the system (Safari when the phone
      // locks) is an interruption, shown as such with "Réessayer".
      if (e?.code === "annule" || (e?.code === "storage/canceled" && envoi.annule)) {
        envois.splice(envois.indexOf(envoi), 1);
      } else {
        // Offline, locked phone, refused by the rules: never a silence.
        envoi.etat = [
          "storage/retry-limit-exceeded",
          "storage/unknown",
          "storage/canceled",
        ].includes(e?.code)
          ? "interrompu"
          : "echec";
        envoi.erreur =
          e?.code === "permission-denied"
            ? "Refusé : espace plein ou fichier non accepté."
            : envoi.etat === "interrompu"
              ? "Interrompu — Réessayer"
              : "Échec de l'envoi";
      }
    }
    rendre();
  }

  const majProgres = (envoi) => {
    const n = document.querySelector(`[data-envoi="${envoi.cle}"]`);
    if (!n) return;
    const pct = Math.round(envoi.part * 100);
    n.querySelector(".partage-progres-barre").style.width = `${pct}%`;
    n.querySelector("[role=progressbar]").setAttribute("aria-valuenow", String(pct));
    n.querySelector(".partage-pourcent").textContent = `${pct} %`;
  };

  function carteEnvoi(envoi) {
    const { fichier } = envoi;
    const pct = Math.round(envoi.part * 100);
    const echec = envoi.etat !== "envoi";
    return el(
      "li",
      {
        class: `partage-carte partage-carte--fichier${echec ? " partage-carte--erreur" : ""}`,
        dataset: { envoi: envoi.cle },
      },
      el("span", {
        class: "partage-type",
        "aria-hidden": "true",
        texte: ICONES_FAMILLE[familleDe(fichier.name, fichier.type)],
      }),
      el(
        "div",
        { class: "partage-texte" },
        el("span", {
          class: "partage-nom",
          title: nomAffiche(fichier.name),
          texte: tronquerMilieu(fichier.name),
        }),
        echec
          ? el("span", {
              class: "partage-detail",
              role: "alert",
              texte: `${envoi.erreur} — ${formaterTaille(fichier.size)}`,
            })
          : el(
              "div",
              { class: "partage-progres" },
              el(
                "div",
                {
                  class: "partage-progres-piste",
                  role: "progressbar",
                  "aria-valuemin": "0",
                  "aria-valuemax": "100",
                  "aria-valuenow": String(pct),
                  "aria-label": `Envoi de ${nomAffiche(fichier.name)}`,
                },
                el("div", { class: "partage-progres-barre", style: `width:${pct}%` }),
              ),
              el("span", { class: "partage-pourcent", texte: `${pct} %` }),
            ),
      ),
      el(
        "div",
        { class: "partage-actions" },
        echec
          ? el("button", {
              type: "button",
              class: "partage-action",
              texte: "Réessayer",
              onclick: () => demarrer(envoi),
            })
          : null,
        el("button", {
          type: "button",
          class: "partage-action",
          texte: echec ? "Abandonner" : "Annuler",
          onclick: () => {
            envoi.annule = true;
            envoi.annuler?.();
            if (echec) {
              envois.splice(envois.indexOf(envoi), 1);
              rendre();
            }
          },
        }),
      ),
    );
  }

  // --- Reading ---------------------------------------------------------------------------------
  async function obtenirBlob(e) {
    if (cache.has(e.id)) return cache.get(e.id);
    let blob = await (await charger()).lireFichierPartage(e.chemin);
    if (e.chiffre) {
      // Decrypted in memory; the type is the one stored in the encrypted block.
      const clair = await coffre.dechiffrerOctets(e.id, new Uint8Array(await blob.arrayBuffer()));
      blob = new Blob([clair], { type: e.typeMime || "application/octet-stream" });
    }
    cache.set(e.id, blob);
    // Memory only: the oldest ones go when the session holds too much.
    let total = [...cache.values()].reduce((n, b) => n + b.size, 0);
    for (const [id, b] of cache) {
      if (total <= CACHE_MAX || id === e.id) break;
      cache.delete(id);
      total -= b.size;
    }
    return blob;
  }

  async function obtenirFichier(e) {
    const blob = await obtenirBlob(e);
    // The type is forced: never text/html, never an image/svg opened in the app's context.
    const type = telechargementSeulement(e.contenu, e.typeMime)
      ? "application/octet-stream"
      : blob.type || e.typeMime || "application/octet-stream";
    return new File([blob], nomAffiche(e.contenu), { type });
  }

  async function telecharger(e) {
    try {
      const fichier = await obtenirFichier(e);
      // iPhone / iPad (installed app): `a[download]` is unreliable, the share sheet is not.
      if (
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [fichier] }) &&
        estTactile()
      ) {
        await navigator.share({ files: [fichier] });
        return;
      }
      const url = URL.createObjectURL(fichier);
      if ("download" in HTMLAnchorElement.prototype) {
        const a = el("a", { href: url, download: fichier.name });
        document.body.append(a);
        a.click();
        a.remove();
      } else {
        window.open(url, "_blank", "noopener");
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      if (err?.name === "AbortError") return; // the share sheet was closed
      toast("Téléchargement impossible pour l'instant.", { type: "erreur" });
    }
  }

  async function partager(e) {
    try {
      await navigator.share({ files: [await obtenirFichier(e)] });
    } catch (err) {
      if (err?.name !== "AbortError") await telecharger(e);
    }
  }

  async function supprimer(e) {
    try {
      await (await charger()).supprimerFichierPartage(uid(), e);
      cache.delete(e.id);
      const u = miniatures.get(e.id);
      if (u) URL.revokeObjectURL(u);
      miniatures.delete(e.id);
      toast("Fichier supprimé");
    } catch {
      toast("Suppression impossible pour l'instant.", { type: "erreur" });
    }
  }

  // --- Thumbnails and viewer ----------------------------------------------------------------------
  async function miniature(e, cadre) {
    if (!apercuPossible(e.contenu, e.typeMime) || e.taille > MINIATURE_MAX) return;
    try {
      if (!miniatures.has(e.id)) miniatures.set(e.id, URL.createObjectURL(await obtenirBlob(e)));
      if (!cadre.isConnected) return;
      const img = el("img", {
        class: "partage-miniature",
        alt: nomAffiche(e.contenu),
        src: miniatures.get(e.id),
        draggable: "false",
      });
      // A picture the browser cannot show (HEIC on a computer): the family icon stays.
      img.addEventListener("error", () => img.remove(), { once: true });
      cadre.replaceChildren(img);
    } catch {
      /* the icon of the family stays */
    }
  }

  async function ouvrirVisionneuse(e) {
    const images = elementsVus.filter(
      (x) => x.type === "fichier" && apercuPossible(x.contenu, x.typeMime),
    );
    let i = Math.max(
      0,
      images.findIndex((x) => x.id === e.id),
    );
    const img = el("img", { class: "partage-visionneuse-image", alt: "", draggable: "false" });
    const legende = el("p", { class: "partage-visionneuse-legende" });
    let url = null;
    const afficher = async () => {
      const courant = images[i];
      legende.textContent = `${nomAffiche(courant.contenu)} (${i + 1}/${images.length})`;
      img.alt = nomAffiche(courant.contenu);
      try {
        if (url) URL.revokeObjectURL(url);
        url = URL.createObjectURL(await obtenirBlob(courant));
        img.src = url;
      } catch {
        legende.textContent = "Image indisponible pour l'instant.";
      }
    };
    const fermer = () => {
      document.removeEventListener("keydown", touche, true);
      if (url) URL.revokeObjectURL(url);
      fond.remove();
      retour?.focus?.();
    };
    const touche = (ev) => {
      if (ev.key === "Escape") {
        ev.preventDefault();
        ev.stopPropagation();
        fermer();
      } else if (ev.key === "ArrowRight" && images.length > 1) {
        i = (i + 1) % images.length;
        afficher();
      } else if (ev.key === "ArrowLeft" && images.length > 1) {
        i = (i - 1 + images.length) % images.length;
        afficher();
      }
    };
    const retour = document.activeElement;
    const fond = el(
      "div",
      {
        class: "partage-visionneuse",
        role: "dialog",
        "aria-label": "Aperçu de l'image",
        "aria-modal": "true",
      },
      el("button", {
        type: "button",
        class: "partage-fermer",
        "aria-label": "Fermer",
        texte: "×",
        onclick: fermer,
      }),
      img,
      legende,
    );
    // A tap on the picture or the background closes too (no key on a phone).
    fond.addEventListener("click", (ev) => (ev.target === fond || ev.target === img) && fermer());
    document.addEventListener("keydown", touche, true);
    document.body.append(fond);
    fond.querySelector("button").focus();
    await afficher();
  }

  // --- Cards ---------------------------------------------------------------------------------------
  function carte(brut) {
    // V4.26: a locked encrypted file shows a padlock, no name, no preview.
    let e = brut;
    if (brut.chiffre) {
      const m = metas.get(brut.id);
      if (!m?.contenu) return carteVerrouillee(brut, m?.corrompu);
      e = { ...brut, contenu: m.contenu, typeMime: m.typeMime };
    }
    const famille = familleDe(e.contenu, e.typeMime);
    const cadre = el("span", {
      class: "partage-vignette",
      "aria-hidden": "true",
      texte: ICONES_FAMILLE[famille],
    });
    miniature(e, cadre);
    const avertissement = avertissementTelechargement(e.contenu, e.typeMime);
    const peutVoir = apercuPossible(e.contenu, e.typeMime);
    return el(
      "li",
      {
        class: `partage-carte partage-carte--fichier${e.enAttente ? " partage-carte--attente" : ""}`,
        dataset: { id: e.id, type: "fichier" },
      },
      cadre,
      el(
        "div",
        { class: "partage-texte" },
        el("span", {
          class: "partage-nom",
          title: nomAffiche(e.contenu),
          texte: tronquerMilieu(e.contenu),
        }),
        el("span", {
          class: "partage-detail",
          texte: `${formaterTaille(e.taille)}${avertissement ? ` · ${avertissement}` : ""}`,
        }),
      ),
      el(
        "div",
        { class: "partage-actions" },
        peutVoir
          ? el("button", {
              type: "button",
              class: "partage-action",
              texte: "Voir",
              onclick: () => ouvrirVisionneuse(e),
            })
          : null,
        el("button", {
          type: "button",
          class: "partage-action",
          texte: "Télécharger",
          onclick: () => telecharger(e),
        }),
        // V4.28: a public link to a COPY of the file (5 MB at most), decrypted if it was in the vault.
        creerLien && e.taille <= 5 * 1024 * 1024
          ? el("button", {
              type: "button",
              class: "partage-action",
              texte: "Créer un lien",
              onclick: async () => {
                try {
                  const blob = await obtenirBlob(e);
                  creerLien(e, new Uint8Array(await blob.arrayBuffer()));
                } catch {
                  toast("Lien impossible pour l'instant.", { type: "erreur" });
                }
              },
            })
          : null,
        typeof navigator.share === "function" && estTactile()
          ? el("button", {
              type: "button",
              class: "partage-action",
              texte: "Partager",
              onclick: () => partager(e),
            })
          : null,
        el("button", {
          type: "button",
          class: "partage-action partage-action--danger",
          texte: "Supprimer",
          onclick: () => supprimer(e),
        }),
      ),
    );
  }

  function carteVerrouillee(e, corrompu) {
    return el(
      "li",
      { class: "partage-carte partage-carte--fichier", dataset: { id: e.id, type: "fichier" } },
      el("span", { class: "partage-vignette", "aria-hidden": "true", texte: "🔒" }),
      el(
        "div",
        { class: "partage-texte" },
        el("span", {
          class: "partage-nom partage-chiffre",
          texte: corrompu ? "Élément corrompu" : "Fichier chiffré",
        }),
        el("span", { class: "partage-detail", texte: formaterTaille(e.taille) }),
      ),
      el(
        "div",
        { class: "partage-actions" },
        el("button", {
          type: "button",
          class: "partage-action partage-action--danger",
          texte: "Supprimer",
          onclick: () => supprimer(e),
        }),
      ),
    );
  }

  /** Reads (in memory) the name and type of the encrypted files while the vault is open. */
  async function dechiffrerNoms(liste) {
    if (!coffre?.session.estDeverrouille()) return;
    const aFaire = liste.filter((e) => e.type === "fichier" && e.chiffre && !metas.has(e.id));
    if (!aFaire.length) return;
    for (const e of aFaire) {
      try {
        const r = await coffre.dechiffrer(e);
        metas.set(e.id, { contenu: r.contenu, typeMime: r.titre });
      } catch {
        metas.set(e.id, { corrompu: true });
      }
    }
    rendre();
  }
  coffre?.session.surVerrouille(() => {
    metas.clear();
    cache.clear();
    for (const u of miniatures.values()) URL.revokeObjectURL(u);
    miniatures.clear();
    rendre();
  });

  // --- Drag and drop (computer) and paste ----------------------------------------------------------
  const cadreDepot = el("div", {
    class: "partage-depot",
    hidden: true,
    "aria-hidden": "true",
    texte: "Déposer ici",
  });
  function brancherZone(zone) {
    let niveau = 0;
    const porteFichiers = (ev) => [...(ev.dataTransfer?.types ?? [])].includes("Files");
    zone.addEventListener("dragenter", (ev) => {
      if (!porteFichiers(ev)) return;
      ev.preventDefault();
      niveau++;
      cadreDepot.hidden = false;
    });
    zone.addEventListener("dragover", (ev) => porteFichiers(ev) && ev.preventDefault());
    zone.addEventListener("dragleave", () => {
      niveau = Math.max(0, niveau - 1);
      if (niveau === 0) cadreDepot.hidden = true;
    });
    zone.addEventListener("drop", (ev) => {
      if (!porteFichiers(ev)) return;
      ev.preventDefault();
      niveau = 0;
      cadreDepot.hidden = true;
      ajouter([...ev.dataTransfer.files]);
    });
    zone.addEventListener("paste", (ev) => {
      const fichiers = [...(ev.clipboardData?.files ?? [])];
      if (fichiers.length === 0) return;
      ev.preventDefault();
      ajouter(fichiers);
    });
  }

  return {
    entree,
    boutonAjout,
    quota,
    message,
    cadreDepot,
    brancherZone,
    carte,
    cartesEnvoi: () => envois.map(carteEnvoi),
    nbEnvois: () => envois.length,
    ajouter,
    /** The panel tells which elements it shows (viewer, quota visibility). */
    elementsVus: (liste) => {
      elementsVus = liste;
      dechiffrerNoms(liste);
      majQuota();
    },
    majQuota,
    /** Closing the panel frees the memory: blob URLs revoked, opened files forgotten. */
    liberer: () => {
      for (const u of miniatures.values()) URL.revokeObjectURL(u);
      miniatures.clear();
      cache.clear();
      enCours.clear();
    },
  };
}

function reseauMobile() {
  const c = globalThis.navigator?.connection;
  return c?.type === "cellular" || ["slow-2g", "2g", "3g"].includes(c?.effectiveType);
}

const estTactile = () => globalThis.matchMedia?.("(pointer: coarse)").matches ?? false;
