import { registerSW } from "virtual:pwa-register";
import { URL_SITE } from "../core/constantes.js";
import { doitVerifier, raisonOccupe } from "../core/miseAJour.js";
import { plateforme } from "../platform/index.js";
import { el } from "./dom.js";
import { definirMiseAJour } from "./etatMiseAJour.js";
import { toast } from "./toast.js";

const CLE_VERSION = "versionVue";
const ATTENTE_ENVOI_MAX_MS = 3000;
const TEXTE_BANDEAU = "Une nouvelle version est disponible";

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

const CHAMP_TEXTE =
  "input:not([type=checkbox], [type=radio], [type=button], [type=submit]), textarea, [contenteditable]";

/**
 * Something is going on that a reload would break: a window is open, an icon is being
 * dragged, or text is being typed (a field with the cursor in it AND something written: the
 * search bar has the focus on a fresh page and is empty, that is not a typing in progress).
 */
const raisonAttente = () => {
  const actif = document.activeElement;
  const champ = actif?.closest?.(CHAMP_TEXTE);
  return raisonOccupe({
    fenetreOuverte: !!document.querySelector("dialog[open]"),
    glisserEnCours: document.body.classList.contains("glisser-en-cours"),
    saisieEnCours: !!champ && String(champ.value ?? champ.textContent ?? "").trim() !== "",
  });
};

const MESSAGES_ATTENTE = {
  fenetre: "Fermez la fenêtre ouverte, puis touchez Recharger.",
  glisser: "Terminez le déplacement, puis touchez Recharger.",
  saisie: "Terminez ce que vous écrivez, puis touchez Recharger.",
};

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
  let minuteurMessage = null;

  const recharger = async (bouton) => {
    if (bouton) bouton.disabled = true;
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
        const raison = raisonAttente();
        if (raison) {
          // Said in the banner itself: a toast would be hidden under it.
          message.textContent = MESSAGES_ATTENTE[raison];
          clearTimeout(minuteurMessage);
          minuteurMessage = setTimeout(() => (message.textContent = TEXTE_BANDEAU), 5000);
          return;
        }
        recharger(bouton);
      },
    });
    const message = el("span", { texte: TEXTE_BANDEAU });
    bandeau = el(
      "div",
      { class: "bandeau-maj", role: "status" },
      message,
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
    onNeedRefresh: () => {
      // The settings offer it too (the banner may be closed). A click there is a clear request:
      // no check for an open window (the settings are one).
      definirMiseAJour({ disponible: true, appliquer: () => recharger(null) });
      afficherBandeau();
    },
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
