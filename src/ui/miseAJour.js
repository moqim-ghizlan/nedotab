import { registerSW } from "virtual:pwa-register";
import { URL_SITE } from "../core/constantes.js";
import { doitVerifier, peutRecharger } from "../core/miseAJour.js";
import { plateforme } from "../platform/index.js";
import { el } from "./dom.js";
import { toast } from "./toast.js";

const CLE_VERSION = "versionVue";
const ATTENTE_ENVOI_MAX_MS = 3000;

const lire = () => {
  try {
    return localStorage.getItem(CLE_VERSION);
  } catch {
    return null;
  }
};
const ecrire = (v) => {
  try {
    localStorage.setItem(CLE_VERSION, v);
  } catch {
    // Private window: the toast may come again, no harm.
  }
};

/** Something is going on that a reload would break. */
const occupe = () =>
  !peutRecharger({
    fenetreOuverte: !!document.querySelector("dialog[open]"),
    glisserEnCours: document.body.classList.contains("glisser-en-cours"),
    saisieEnCours: !!document.activeElement?.closest?.(
      "input, textarea, select, [contenteditable]",
    ),
  });

/**
 * Service worker of the web app (V3.7): the interface opens offline, and a new version is
 * offered in a banner ("Recharger"), never applied by itself in the middle of an action.
 * @param {{ avantRechargement?: () => Promise<void> }} options avantRechargement: sends what is
 *        still waiting (local save, account queue) before the page reloads
 */
export function brancherMiseAJour({ avantRechargement = async () => {} } = {}) {
  if (!("serviceWorker" in navigator)) return;
  let bandeau = null;
  let verifiee = Date.now();

  const recharger = async (bouton) => {
    bouton.disabled = true;
    await Promise.race([
      avantRechargement().catch(() => {}),
      new Promise((r) => setTimeout(r, ATTENTE_ENVOI_MAX_MS)),
    ]);
    await mettreAJour(true);
  };

  const afficherBandeau = () => {
    if (bandeau?.isConnected) return;
    const bouton = el("button", {
      type: "button",
      class: "bandeau-maj-bouton",
      texte: "Recharger",
      onclick: () => {
        if (occupe()) {
          toast("Terminez d'abord ce que vous faites, puis rechargez.", { duree: 4000 });
          return;
        }
        recharger(bouton);
      },
    });
    bandeau = el(
      "div",
      { class: "bandeau-maj", role: "status" },
      el("span", { texte: "Une nouvelle version est disponible" }),
      bouton,
      el("button", {
        type: "button",
        class: "bandeau-maj-fermer",
        "aria-label": "Plus tard",
        texte: "×",
        onclick: () => bandeau.remove(),
      }),
    );
    document.body.append(bandeau);
  };

  const mettreAJour = registerSW({
    onNeedRefresh: afficherBandeau,
    onOfflineReady: () => toast("L'app fonctionne maintenant hors ligne", { duree: 4000 }),
    onRegisteredSW: (_url, registration) => {
      if (!registration) return;
      // Back in the foreground: look for a new version, at most once an hour.
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState !== "visible" || !doitVerifier(verifiee, Date.now())) return;
        verifiee = Date.now();
        registration.update().catch(() => {});
      });
    },
  });

  // After an update: once, which version and where to read what changed.
  const version = plateforme.getVersion();
  const precedente = lire();
  if (precedente && precedente !== version) {
    toast(`Mise à jour vers la version ${version}`, {
      duree: 8000,
      action: {
        libelle: "Nouveautés",
        onClic: () => window.open(`${URL_SITE}mise-a-jour.html`, "_blank", "noopener"),
      },
    });
  }
  ecrire(version);
}
