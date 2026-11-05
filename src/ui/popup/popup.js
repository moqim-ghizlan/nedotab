import { reduire } from "../../core/actions.js";
import { dimensionsFenetreAjout, lireOnglet } from "../../core/ajoutRapide.js";
import { migrer } from "../../core/migration.js";
import { creerStore } from "../../core/store.js";
import { domaine } from "../../core/url.js";
import { plateforme } from "../../platform/index.js";
import { iconeRobot } from "../chat/boutonRobot.js";
import { el } from "../dom.js";
import { icone } from "../icones.js";
import { ouvrirChat } from "./chatLateral.js";
import { ecranAjout } from "./ecranAjout.js";
import { creerServiceVpn } from "../services/vpn.js";
import { blocVpnNavigateur } from "../vpnNavigateur.js";
import { blocRegleSite } from "./regleSite.js";

/**
 * Toolbar window (V4.29): two choices. The active tab is read ONCE, when the window opens
 * (activeTab only lasts for that tab and the address can change afterwards). The state comes
 * from the same storage as the New Tab pages; an open page reloads it through
 * chrome.storage.onChanged and merges its own pending changes (persistance.js).
 */
export async function demarrerPopup(racine, { chromeApi = globalThis.chrome } = {}) {
  let onglet = { ok: false, raison: "Aucun onglet actif." };
  let faviconUrl = "";
  try {
    const [tab] = (await chromeApi?.tabs?.query({ active: true, currentWindow: true })) ?? [];
    if (tab) {
      onglet = lireOnglet({ url: tab.url, titre: tab.title });
      ouvrirChat.windowId = tab.windowId ?? null;
      faviconUrl = onglet.ok ? plateforme.urlFaviconNavigateur(onglet.url, 32) : "";
    }
  } catch {
    /* no tab readable: the add screen explains */
  }
  // T9: "Bouton robot dans le navigateur" (kept by the page as a small device preference).
  const boutonChat =
    (await plateforme.preferences.lire("boutonChatNavigateur").catch(() => true)) !== false;
  const stockage = plateforme.stockage();
  // The state is only read when "Ajouter ce site" is clicked: the window shows up at once
  // instead of waiting for the whole storage (the slowness reported in V4.30).
  async function charger() {
    let brut = null;
    let erreurLecture = false;
    try {
      brut = (await stockage.lire()).etat;
    } catch {
      erreurLecture = true;
    }
    const { etat, lectureSeule } = migrer(brut);
    return {
      store: creerStore(etat, reduire, { geler: false }),
      peutEcrire: !erreurLecture && !lectureSeule,
    };
  }

  const ouvrirNedoTab = () => {
    chromeApi.tabs.create({ url: chromeApi.runtime.getURL("newtab.html") });
    window.close();
  };

  /** Opens the add window at 75 % of the screen. @returns {Promise<boolean>} true when it opened */
  async function ouvrirFenetreAjout() {
    if (!onglet.ok || !chromeApi?.windows?.create) return false;
    try {
      const e = globalThis.screen ?? {};
      const dims = dimensionsFenetreAjout({
        largeur: e.availWidth,
        hauteur: e.availHeight,
        gauche: e.availLeft,
        haut: e.availTop,
      });
      const adresse = new URL(chromeApi.runtime.getURL("ajout.html"));
      adresse.searchParams.set("u", onglet.url);
      adresse.searchParams.set("t", onglet.titre ?? "");
      await chromeApi.windows.create({ url: adresse.href, type: "popup", focused: true, ...dims });
      window.close();
      return true;
    } catch {
      return false;
    }
  }

  function accueil() {
    // V4.30: icons only; the label stays the button's name (read, shown as a tooltip).
    const libelle = (texte) => el("span", { class: "visuellement-cache", texte });
    const ajouter = el(
      "button",
      {
        type: "button",
        class: "bouton bouton--principal popup-icone",
        title: "Ajouter ce site",
        disabled: !onglet.ok,
        onclick: async () => {
          ajouter.disabled = true;
          // T4: a large window, centred, independent of the button (a popup is capped at
          // 800 x 600 and always hangs under the button). Fallback: the small form below.
          if (await ouvrirFenetreAjout()) return;
          try {
            const { store, peutEcrire } = await charger();
            await ecranAjout({
              racine,
              store,
              stockage,
              onglet,
              retour: accueil,
              peutEcrire,
              ouvrirNedoTab,
            });
          } catch (e) {
            console.error("ECRAN", e);
            ajouter.disabled = false;
          }
        },
      },
      icone("ajouter", { taille: 26 }),
      libelle("Ajouter ce site"),
    );
    const chat = el(
      "button",
      {
        type: "button",
        class: "bouton popup-icone",
        title: "Ouvrir le chat",
        onclick: () => ouvrirChat(),
      },
      iconeRobot({ taille: 28 }),
      libelle("Ouvrir le chat"),
    );
    racine.replaceChildren(
      el(
        "div",
        { class: "popup-ecran" },
        el(
          "div",
          { class: "popup-entete" },
          faviconUrl ? el("img", { src: faviconUrl, alt: "", width: "32", height: "32" }) : null,
          el(
            "div",
            {},
            el("div", {
              class: "popup-titre",
              texte: onglet.ok ? onglet.titre || domaine(onglet.url) : "NedoTab",
            }),
            el("div", { class: "popup-domaine", texte: onglet.ok ? domaine(onglet.url) : "" }),
          ),
        ),
        el(
          "div",
          { class: "popup-choix", role: "group", "aria-label": "Actions" },
          onglet.ok
            ? null
            : el("p", { class: "popup-bandeau", role: "status", texte: onglet.raison }),
          ajouter,
          boutonChat ? chat : null,
        ),
        plateforme.capacites.vpnNavigateur
          ? el(
              "div",
              { class: "popup-vpn" },
              blocVpnNavigateur({
                vpn: plateforme.vpnNavigateur(),
                service: creerServiceVpn(),
                verification: plateforme.verificationVpn(),
              }).racine,
            )
          : null,
        el(
          "p",
          { class: "popup-pied" },
          el("button", {
            type: "button",
            class: "lien-discret",
            texte: "Ouvrir NedoTab",
            onclick: ouvrirNedoTab,
          }),
        ),
      ),
    );
    (onglet.ok || !boutonChat ? ajouter : chat).focus();
    // V5.6: the rule of this site, once the state is read (the window is already shown).
    if (plateforme.capacites.vpnNavigateur) {
      blocRegleSite({
        onglet,
        charger,
        stockage,
        vpn: plateforme.vpnNavigateur(),
        chromeApi,
      })
        .then((bloc) => bloc && racine.querySelector(".popup-vpn")?.append(bloc))
        .catch(() => {});
    }
  }
  racine.addEventListener("keydown", (e) => {
    const suivant = { ArrowDown: true, ArrowRight: true, ArrowUp: false, ArrowLeft: false }[e.key];
    if (suivant === undefined) return;
    const boutons = [...racine.querySelectorAll(".popup-choix button:not(:disabled)")];
    const i = boutons.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    boutons[(i + (suivant ? 1 : boutons.length - 1)) % boutons.length].focus();
  });
  accueil();
}
