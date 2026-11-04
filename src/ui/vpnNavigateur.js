import { LIBELLE_RESERVE } from "../core/vpn.js";
import { MESSAGES } from "../core/vpnProxy.js";
import { blocConnexionVpn } from "./connexionVpn.js";
import { el } from "./dom.js";

/**
 * V5.3: the VPN switch of the extension, shared by the toolbar window and the settings.
 * It shows the REAL state (chrome.proxy), never the wanted one. The proxy password is never
 * shown here. Firebase is only loaded (through `service`) when the identifiers are missing.
 *
 * @param {{ vpn: ReturnType<import("../platform/extension/vpn.js").creerVpn>,
 *   service: ReturnType<import("./services/vpn.js").creerServiceVpn>,
 *   verification?: ReturnType<import("../platform/extension/verificationVpn.js").creerVerificationVpn>|null,
 *   options?: boolean, apres?: () => void }} p
 */
export function blocVpnNavigateur({
  vpn,
  service,
  verification = null,
  options = false,
  apres = () => {},
}) {
  const racine = el("div", { class: "vpn-nav" });
  let occupe = false;
  let message = null;

  const interrupteur = el("input", {
    type: "checkbox",
    role: "switch",
    id: `vpn-nav-${Math.random().toString(36).slice(2, 8)}`,
    class: "vpn-nav-interrupteur",
  });
  const texteEtat = el("span", { class: "vpn-nav-etat", role: "status" });
  const detail = el("p", { class: "reglages-note vpn-nav-detail" });
  const alerte = el("p", { class: "vpn-nav-alerte", role: "alert" });
  const actionsErreur = el("div", { class: "vpn-actions" });
  const zoneOptions = el("div", { class: "vpn-nav-options" });
  // V5.4: what the sites really see (only where a check exists).
  const connexion = verification
    ? blocConnexionVpn({ verification, vpn, historique: options, apres: () => rafraichir() })
    : null;
  racine.append(
    el(
      "label",
      { class: "vpn-nav-ligne", for: interrupteur.id },
      el("span", { class: "vpn-nav-titre", texte: "VPN du navigateur" }),
      interrupteur,
    ),
    texteEtat,
    detail,
    alerte,
    actionsErreur,
    connexion?.racine,
    zoneOptions,
  );

  async function rafraichir() {
    let e;
    try {
      e = await vpn.etat();
    } catch {
      e = { actif: false, voulu: false, aAcces: false, erreur: null };
    }
    interrupteur.checked = e.actif;
    interrupteur.disabled = occupe;
    texteEtat.textContent = occupe
      ? "…"
      : e.actif
        ? "Activé — Chrome passe par le serveur"
        : e.voulu
          ? "Activé en attente… Chrome n'utilise pas encore le serveur"
          : "Désactivé";
    detail.textContent = e.actif && e.pays ? `Pays prévu : ${e.pays}` : "";
    const texte = message ?? e.messageErreur;
    alerte.textContent = texte ?? "";
    alerte.hidden = !texte;
    actionsErreur.replaceChildren();
    if (e.erreur === "serveur") {
      actionsErreur.append(
        el("button", {
          type: "button",
          class: "bouton",
          texte: "Réessayer",
          onclick: async () => {
            await vpn.effacerErreur();
            await rafraichir();
          },
        }),
        el("button", {
          type: "button",
          class: "bouton",
          texte: "Désactiver le VPN",
          onclick: () => arreter(),
        }),
      );
    }
    if (e.erreur === "trafic") {
      actionsErreur.append(
        el("button", {
          type: "button",
          class: "bouton",
          texte: "Tester à nouveau",
          onclick: () => connexion?.lancer(true),
        }),
        el("button", {
          type: "button",
          class: "bouton",
          texte: "Désactiver le VPN",
          onclick: () => arreter(),
        }),
      );
    }
    if (e.erreur === "identifiants") {
      actionsErreur.append(
        el("button", {
          type: "button",
          class: "bouton",
          texte: "Rafraîchir mes identifiants",
          onclick: () => rafraichirIdentifiants(),
        }),
      );
    }
    if (options) dessinerOptions(e);
  }

  function dessinerOptions(e) {
    const caseNav = el("input", { type: "checkbox", id: `${interrupteur.id}-priv` });
    caseNav.checked = !!e.incognito;
    caseNav.addEventListener("change", async () => {
      message = null;
      if (e.voulu) {
        const r = await vpn.activer({ incognito: caseNav.checked, demanderPermission: false });
        if (!r.ok) message = r.raison;
      } else {
        // Remembered for the next activation (the scope is only set when the VPN is on).
        await vpn.definirIncognito?.(caseNav.checked);
      }
      await rafraichir();
    });
    zoneOptions.replaceChildren(
      el(
        "label",
        { class: "vpn-nav-option", for: caseNav.id },
        caseNav,
        " Aussi en navigation privée",
      ),
      el(
        "div",
        { class: "vpn-actions" },
        el("button", {
          type: "button",
          class: "bouton",
          texte: "Rafraîchir mes identifiants",
          onclick: () => rafraichirIdentifiants(),
        }),
        el("button", {
          type: "button",
          class: "bouton bouton--danger",
          texte: "Oublier mes identifiants sur cet ordinateur",
          onclick: () => oublier(),
        }),
      ),
      el("p", {
        class: "reglages-note",
        texte:
          "Le VPN de l'extension concerne uniquement Google Chrome. Pour tout l'ordinateur ou l'iPhone, utilisez WireGuard (bientôt).",
      }),
    );
  }

  async function arreter() {
    occupe = true;
    await rafraichir();
    await vpn.desactiver();
    occupe = false;
    message = null;
    await rafraichir();
    apres();
  }

  /** Fetches the identifiers of this account (needs the sign-in) and keeps them locally. */
  async function chargerIdentifiants() {
    const r = await service.acces();
    if (!r.ok) return r.erreur;
    if (!r.valeur) return LIBELLE_RESERVE;
    await vpn.memoriserAcces(r.valeur);
    return null;
  }

  async function rafraichirIdentifiants() {
    occupe = true;
    message = null;
    await rafraichir();
    const erreur = await chargerIdentifiants();
    if (erreur) message = erreur;
    else {
      const e = await vpn.etat();
      if (e.voulu || e.erreur) {
        const r = await vpn.activer({ demanderPermission: false });
        if (!r.ok) message = r.raison;
      }
    }
    occupe = false;
    await rafraichir();
    apres();
  }

  async function oublier() {
    await vpn.oublier();
    message = null;
    await rafraichir();
    apres();
  }

  interrupteur.addEventListener("change", async () => {
    message = null;
    if (!interrupteur.checked) return arreter();
    occupe = true;
    interrupteur.disabled = true;
    // The host permission is asked first, in the click itself (a user gesture is needed).
    const permise = await vpn.permission();
    if (!permise) message = MESSAGES.permission;
    else {
      const e = await vpn.etat();
      if (!e.aAcces) message = await chargerIdentifiants();
      if (!message) {
        const r = await vpn.activer({ demanderPermission: false });
        if (!r.ok) message = r.raison;
      }
    }
    occupe = false;
    await rafraichir();
    apres();
    // V5.4: automatic test on activation.
    if (!message) connexion?.lancer(true);
  });

  rafraichir();
  // Another window (settings, toolbar, worker) may change the state: follow it.
  globalThis.chrome?.storage?.onChanged?.addListener?.(() => {
    if (!occupe) rafraichir();
  });
  return { racine, rafraichir };
}
