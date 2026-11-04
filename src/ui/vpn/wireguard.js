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

  function dessiner() {
    racine.replaceChildren(
      el("h4", { texte: "VPN pour tout l'appareil (WireGuard)" }),
      note(NOTE_DOUBLE_VPN),
      el(
        "ol",
        { class: "vpn-etapes" },
        el(
          "li",
          {},
          "Installez l'app WireGuard (gratuite) sur l'appareil à protéger : ",
          el("a", {
            href: URL_INSTALLATION,
            target: "_blank",
            rel: "noopener noreferrer",
            texte: "liens officiels",
          }),
          ".",
        ),
        el(
          "li",
          {},
          profil
            ? "Scannez le code ci-dessous."
            : "Affichez votre QR code (ou le fichier de configuration).",
        ),
        el("li", {
          texte: "Dans l'app WireGuard : « Ajouter un tunnel », puis « Scanner un QR code ».",
        }),
        el(
          "li",
          {},
          "Activez le tunnel, puis vérifiez l'adresse vue par les sites : ",
          el("a", {
            href: URL_ECHO,
            target: "_blank",
            rel: "noopener noreferrer",
            texte: "ouvrir un test",
          }),
          " (ligne « ip= », « loc= » = le pays du serveur).",
        ),
      ),
      profil ? blocProfil() : blocDemande(),
    );
  }

  function blocDemande() {
    return el(
      "div",
      { class: "vpn-actions" },
      el("button", {
        type: "button",
        class: "bouton bouton--principal",
        texte: occupe ? "Chargement…" : "Afficher mon QR code",
        disabled: occupe,
        onclick: afficher,
      }),
      el("button", {
        type: "button",
        class: "bouton",
        texte: "Recréer mon profil",
        onclick: recreer,
      }),
    );
  }

  function blocProfil() {
    const zone = el("div", { class: `vpn-qr-zone${revele ? "" : " vpn-qr-zone--flou"}` }, canvas);
    return el(
      "div",
      { class: "vpn-profil" },
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
