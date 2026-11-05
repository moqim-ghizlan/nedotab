import {
  AVERTISSEMENT_FICHIER,
  AVERTISSEMENT_QR,
  DUREE_QR_MS,
  NOTE_DOUBLE_VPN,
  nomFichierConf,
  URL_ECHO,
  URL_INSTALLATION,
} from "../../core/vpnWireguard.js";
import { plateforme } from "../../platform/index.js";
import { demander } from "../dialogues/commun.js";
import { el } from "../dom.js";
import { icone } from "../icones.js";
import { toast } from "../toast.js";
import { dessinerQr, effacerQr } from "./qr.js";

/**
 * Settings → VPN → "VPN pour tout l'appareil (WireGuard)" (V5.8), for guests.
 * The configuration holds a private key: it only lives in this closure while it is shown
 * (60 s, or until the page is left) and is never written to a storage, a state or a log.
 *
 * @param {{ service: { profil: () => Promise<any>, recreerProfil: () => Promise<any> },
 *   partager?: (fichier: File) => Promise<string>, duree?: number }} p
 */
export function blocWireguard({
  service,
  partager = (f) => plateforme.partagerFichier(f),
  duree = DUREE_QR_MS,
}) {
  let profil = null; // { config, nomProfil } — memory only
  let revele = false;
  let occupe = false;
  let minuterie = null;
  const racine = el("div", { class: "vpn-wireguard" });
  const canvas = el("canvas", {
    class: "vpn-qr",
    role: "img",
    "aria-label": "QR code du profil WireGuard",
  });

  function masquer() {
    clearTimeout(minuterie);
    minuterie = null;
    profil = null;
    revele = false;
    effacerQr(canvas);
    dessiner();
  }

  async function afficher() {
    if (occupe) return;
    occupe = true;
    dessiner();
    const r = await service.profil();
    occupe = false;
    if (!r.ok || !r.valeur) {
      toast(r.erreur ?? "Profil indisponible pour l'instant.", {
        type: "erreur",
        duree: 6000,
        cle: "vpn",
      });
      return dessiner();
    }
    profil = r.valeur;
    dessiner();
    dessinerQr(canvas, profil.config);
    clearTimeout(minuterie);
    minuterie = setTimeout(masquer, duree);
  }

  async function fichier() {
    if (!profil) return;
    const f = new File([profil.config], nomFichierConf(profil.nomProfil), {
      type: "application/octet-stream",
    });
    const r = await partager(f);
    if (r === "telecharge" || r === "partage")
      toast("Importez le fichier dans l'app WireGuard, puis supprimez-le.", {
        duree: 6000,
        cle: "vpn",
      });
  }

  async function recreer() {
    const ok = await demander({
      titre: "Recréer mon profil",
      message:
        "L'ancien profil cessera de fonctionner (en moins de 2 minutes). Il faudra importer le nouveau dans l'app WireGuard.",
      boutons: [
        { libelle: "Annuler", valeur: false },
        { libelle: "Recréer", valeur: true, principal: true, danger: true },
      ],
    });
    if (!ok) return;
    masquer();
    const r = await service.recreerProfil();
    toast(
      r.ok ? "Nouveau profil demandé : réessayez dans une minute." : r.erreur,
      r.ok ? { duree: 4000, cle: "vpn" } : { type: "erreur", duree: 6000, cle: "vpn" },
    );
  }

  const note = (texte) => el("p", { class: "reglages-note", texte });

  /** A step: a number in a circle (a tick once done), a short title, one line, its action. */
  const etape = (numero, titre, explication, { fait = false, contenu = [] } = {}) =>
    el(
      "li",
      { class: "etape", dataset: { fait: String(fait) } },
      el("span", { class: "etape-numero", "aria-hidden": "true" }, fait ? icone("coche", { taille: 18 }) : String(numero)),
      el(
        "div",
        { class: "etape-corps" },
        el("h5", { texte: titre }),
        explication ? el("p", { texte: explication }) : null,
        ...contenu,
      ),
    );

  function dessiner() {
    const lienInstall = el("a", {
      class: "bouton",
      href: URL_INSTALLATION,
      target: "_blank",
      rel: "noopener noreferrer",
    }, icone("ouvrir", { taille: 16 }), "Installer WireGuard");
    racine.replaceChildren(
      el("h4", { texte: "VPN pour tout l'appareil (WireGuard)" }),
      note(NOTE_DOUBLE_VPN),
      el(
        "ol",
        { class: "etapes" },
        etape(1, "Installer l'app WireGuard", "Gratuite, sur l'appareil à protéger.", {
          contenu: [lienInstall],
        }),
        etape(
          2,
          "Afficher mon QR code",
          profil ? "Scannez le code ci-dessous." : "Ou récupérez le fichier de configuration.",
          { fait: !!profil, contenu: [profil ? blocProfil() : blocDemande()] },
        ),
        etape(
          3,
          "Dans WireGuard : ajouter le tunnel",
          "« Ajouter un tunnel », puis « Scanner un QR code », et activez-le.",
        ),
        etape(
          4,
          "Tester que ça marche",
          "La ligne « loc= » doit afficher le pays du serveur.",
          {
            contenu: [
              el("a", {
                class: "bouton",
                href: URL_ECHO,
                target: "_blank",
                rel: "noopener noreferrer",
              }, icone("ouvrir", { taille: 16 }), "Ouvrir un test d'adresse"),
            ],
          },
        ),
      ),
      note("Le VPN change l'adresse IP vue par les sites ; il ne rend pas anonyme."),
      !profil && !occupe
        ? el("button", {
            type: "button",
            class: "bouton bouton--danger",
            texte: "Recréer mon profil",
            onclick: recreer,
          })
        : null,
    );
  }

  function blocDemande() {
    return el("button", {
      type: "button",
      class: "bouton bouton--principal",
      texte: occupe ? "Chargement…" : "Afficher mon QR code",
      disabled: occupe,
      onclick: afficher,
    });
  }

  function blocProfil() {
    const zone = el("div", { class: `vpn-qr-zone${revele ? "" : " vpn-qr-zone--flou"}` }, canvas);
    return el(
      "div",
      { class: "carte-qr vpn-profil" },
      el("p", { class: "vpn-nav-alerte", role: "alert", texte: AVERTISSEMENT_QR }),
      zone,
      el(
        "div",
        { class: "vpn-actions" },
        revele
          ? null
          : el("button", {
              type: "button",
              class: "bouton bouton--principal",
              texte: "Révéler",
              onclick: () => {
                revele = true;
                zone.classList.remove("vpn-qr-zone--flou");
                dessiner();
                dessinerQr(canvas, profil.config);
              },
            }),
        el("button", { type: "button", class: "bouton", texte: "Masquer", onclick: masquer }),
        el("button", {
          type: "button",
          class: "bouton",
          texte:
            typeof globalThis.navigator?.share === "function" && plateforme.capacites.nom === "pwa"
              ? "Ouvrir dans WireGuard"
              : "Télécharger le fichier de configuration",
          onclick: fichier,
        }),
      ),
      note(AVERTISSEMENT_FICHIER),
      note(`Ce code disparaît après ${Math.round(duree / 1000)} secondes.`),
      el("button", {
        type: "button",
        class: "bouton bouton--danger",
        texte: "Recréer mon profil",
        onclick: recreer,
      }),
    );
  }

  // Leaving the page or the tab hides the code at once.
  globalThis.addEventListener?.("pagehide", masquer);
  globalThis.document?.addEventListener?.("visibilitychange", () => {
    if (globalThis.document.visibilityState === "hidden" && profil) masquer();
  });

  dessiner();
  return { racine, masquer, afficher };
}
