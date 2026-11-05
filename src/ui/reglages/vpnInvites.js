import {
  formaterOctets,
  jourCourt,
  LIBELLES_ETAT,
  TEXTE_PROPRIETAIRE,
} from "../../core/vpnConsommation.js";
import { demander } from "../dialogues/commun.js";
import { ajouter, el, remplacer } from "../dom.js";
import { ouvrirMenu } from "../menuContextuel.js";
import { toast } from "../toast.js";

const NS = "http://www.w3.org/2000/svg";

/** Small bar chart of the server traffic per day (own SVG, no library). */
export function graphiqueServeur(jours) {
  const entrees = Object.entries(jours ?? {}).sort(([a], [b]) => a.localeCompare(b));
  const max = Math.max(1, ...entrees.map(([, v]) => v));
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 310 60");
  svg.setAttribute("class", "vpn-graphique");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Trafic sortant du serveur par jour");
  entrees.forEach(([jour, valeur], i) => {
    const h = Math.max(1, Math.round((valeur / max) * 56));
    const r = document.createElementNS(NS, "rect");
    r.setAttribute("x", String(i * 10));
    r.setAttribute("y", String(58 - h));
    r.setAttribute("width", "8");
    r.setAttribute("height", String(h));
    const t = document.createElementNS(NS, "title");
    t.textContent = `${jour} : ${formaterOctets(valeur)}`;
    r.append(t);
    svg.append(r);
  });
  return svg;
}

/**
 * Settings → VPN → Invités, for the owner (V5.9): volume of the month per friend (proxy and
 * WireGuard), limit, state, last day of activity; cut now, restore, change the limit. Cards
 * rather than a wide table, readable on an iPhone. Volumes only: no site is ever shown.
 *
 * @param {{ service: any, apres?: () => void }} p
 */
export function blocTableauInvites({ service, apres = () => {} }) {
  const racine = el("div", { class: "vpn-tableau" });
  let donnees = null;
  let erreur = null;

  async function charger() {
    const r = (await service.tableau?.()) ?? { ok: false, erreur: "Consommation indisponible." };
    donnees = r.ok ? r.valeur : null;
    erreur = r.ok ? null : r.erreur;
    dessiner();
  }

  async function agir(appel, message) {
    const r = await appel();
    if (!r.ok) return toast(r.erreur, { type: "erreur", duree: 6000, cle: "vpn" });
    toast(message, { duree: 3000, cle: "vpn" });
    await charger();
    apres();
  }

  async function couper(i) {
    const ok = await demander({
      titre: "Couper maintenant",
      message: `${i.email} n'aura plus accès au VPN (proxy et WireGuard) en moins de 2 minutes. Vous pourrez le rétablir.`,
      boutons: [
        { libelle: "Annuler", valeur: false },
        { libelle: "Couper", valeur: true, principal: true, danger: true },
      ],
    });
    if (ok) await agir(() => service.couper(i.email), "Accès coupé.");
  }

  /** Modify the monthly limit of a guest: a field with its unit written inside ("Go"). */
  async function modifierLimite(i) {
    const champ = el("input", {
      id: "vpn-limite",
      type: "number",
      min: "1",
      step: "1",
      inputmode: "numeric",
      placeholder: "illimité",
      value: i.limiteGo ?? "",
      "aria-label": `Limite mensuelle de ${i.email} en Go`,
    });
    const ok = await demander({
      titre: "Modifier la limite",
      message: `Volume mensuel de ${i.email}. Laissez vide pour illimité.`,
      contenu: [
        el(
          "div",
          { class: "champ" },
          el("label", { for: "vpn-limite", texte: "Limite mensuelle" }),
          el("div", { class: "champ-suffixe" }, champ, el("span", { class: "suffixe", texte: "Go" })),
        ),
      ],
      boutons: [
        { libelle: "Annuler", valeur: false },
        { libelle: "Enregistrer la limite", valeur: true, principal: true },
      ],
    });
    if (!ok) return;
    const brut = champ.value.trim();
    const go = brut === "" ? null : Number(brut);
    if (go !== null && !(Number.isFinite(go) && go >= 1))
      return toast("Limite invalide (1 Go au moins, ou vide pour illimité).", { type: "erreur" });
    return agir(() => service.definirLimite(i.email, go), "Limite enregistrée.");
  }

  /** One guest: initial, e-mail, state pill, last activity, volume against the limit, "⋯" menu. */
  function carte(i) {
    const limiteOctets = i.limiteGo ? i.limiteGo * 1e9 : null;
    const total = (i.octetsProxy ?? 0) + (i.octetsWireguard ?? 0);
    const pct = limiteOctets ? Math.min(100, (total / limiteOctets) * 100) : null;
    const etatPastille = i.etat === "actif" ? "ok" : i.etat === "revoque" ? "erreur" : "attention";
    const menu = el("button", {
      type: "button",
      class: "vpn-menu",
      "aria-haspopup": "menu",
      "aria-label": `Actions pour ${i.email}`,
      title: "Actions",
      texte: "⋯",
    });
    menu.addEventListener("click", () => {
      const r = menu.getBoundingClientRect();
      ouvrirMenu({
        x: r.right - 200,
        y: r.bottom + 4,
        retourFocus: menu,
        libelle: `Actions pour ${i.email}`,
        entrees: [
          { libelle: "Modifier la limite…", onChoix: () => modifierLimite(i) },
          "-",
          i.etat === "coupe"
            ? {
                libelle: "Rétablir",
                onChoix: () => agir(() => service.retablir(i.email), "Accès rétabli."),
              }
            : { libelle: "Couper maintenant", danger: true, onChoix: () => couper(i) },
        ],
      });
    });
    return el(
      "li",
      { class: `vpn-carte vpn-carte--${i.etat}` },
      el("span", { class: "vpn-initiale", "aria-hidden": "true", texte: (i.email[0] ?? "?").toUpperCase() }),
      el(
        "div",
        { class: "vpn-carte-corps" },
        el("strong", { class: "vpn-carte-email", texte: i.email }),
        el(
          "span",
          { class: "vpn-carte-ligne" },
          el("span", {
            class: "pastille-etat",
            dataset: { etat: etatPastille },
            texte: `${LIBELLES_ETAT[i.etat] ?? i.etat}${i.raison === "limite" ? " (limite atteinte)" : i.raison === "securite" ? " (sécurité)" : ""}`,
          }),
          el("span", { class: "reglages-note", texte: `Dernière activité : ${jourCourt(i.derniereActivite)}` }),
        ),
        el("span", {
          class: "barre-legende",
          texte: `${formaterOctets(total)} / ${limiteOctets ? formaterOctets(limiteOctets) : "illimité"}`,
        }),
        pct === null
          ? null
          : el(
              "div",
              {
                class: "barre barre--fine",
                role: "progressbar",
                "aria-valuenow": String(Math.round(pct)),
                "aria-valuemin": "0",
                "aria-valuemax": "100",
                "aria-label": `Volume de ${i.email} ce mois-ci`,
                dataset: { niveau: pct > 95 ? "alerte" : pct > 80 ? "attention" : "ok" },
              },
              el("span", { style: `width:${pct}%` }),
            ),
      ),
      i.etat === "revoque" ? null : menu,
    );
  }

  /** "Novembre 2026, remise à zéro le 1er". */
  const periode = () => {
    const mois = new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
    return `${mois.charAt(0).toUpperCase()}${mois.slice(1)}, remise à zéro le 1er`;
  };

  /** Volume per channel (proxy of the browser / WireGuard), summed over the guests. */
  function repartition(invites) {
    const proxy = invites.reduce((n, i) => n + (i.octetsProxy ?? 0), 0);
    const wg = invites.reduce((n, i) => n + (i.octetsWireguard ?? 0), 0);
    const max = Math.max(1, proxy, wg);
    const ligne = (nom, octets) =>
      el(
        "div",
        { class: "vpn-canal" },
        el("span", { class: "vpn-canal-nom", texte: nom }),
        el("span", { class: "vpn-canal-valeur", texte: formaterOctets(octets) }),
        el(
          "div",
          { class: "barre barre--fine", "aria-hidden": "true" },
          el("span", { style: `width:${(octets / max) * 100}%` }),
        ),
      );
    return el(
      "div",
      { class: "vpn-canaux" },
      ligne("Proxy du navigateur", proxy),
      ligne("WireGuard (appareil entier)", wg),
    );
  }

  function dessiner() {
    remplacer(racine);
    if (erreur) return racine.append(el("p", { class: "reglages-note", texte: erreur }));
    if (!donnees) return racine.append(el("p", { class: "reglages-note", texte: "Chargement…" }));
    const s = donnees.serveur;
    const limite = s.limiteGo * 1e9;
    const pct = Math.min(100, (s.octets / limite) * 100);
    const niveau = pct > 95 ? "alerte" : pct > 80 ? "attention" : "ok";
    // A single bar or a lonely tick tells nothing: the chart needs a few days of traffic.
    const joursUtiles = Object.values(s.jours ?? {}).filter((v) => v > 0).length;
    ajouter(
      racine,
      el(
        "section",
        { class: "carte-reglage" },
        el("h4", { class: "carte-reglage-titre", texte: "Consommation du mois" }),
        el("p", { class: "reglages-note", texte: periode() }),
        el(
          "p",
          { class: "vpn-grand-chiffre" },
          el("strong", { texte: formaterOctets(s.octets) }),
          el("span", { texte: ` / ${formaterOctets(limite)} inclus` }),
        ),
        el(
          "div",
          {
            class: "barre",
            role: "progressbar",
            "aria-label": "Trafic du serveur ce mois-ci",
            "aria-valuenow": String(Math.round(pct)),
            "aria-valuemin": "0",
            "aria-valuemax": "100",
            dataset: { niveau },
          },
          el("span", { style: `width:${Math.max(pct, pct > 0 ? 1 : 0)}%` }),
        ),
        el("p", {
          class: "barre-legende",
          texte: `${pct < 1 && pct > 0 ? "moins de 1" : Math.round(pct)} % du trafic gratuit du serveur`,
        }),
        repartition(donnees.invites),
        niveau !== "ok"
          ? el("p", {
              class: "vpn-nav-alerte",
              role: "alert",
              texte: `Le serveur approche de sa limite gratuite${s.securite ? " : la coupure de sécurité a suspendu les invités" : ""}.`,
            })
          : null,
        joursUtiles >= 3 ? graphiqueServeur(s.jours) : null,
        el("p", { class: "reglages-note", texte: TEXTE_PROPRIETAIRE }),
      ),
      ligneSurveillance(donnees.surveillance),
      coupureSecurite(s),
      el("h4", { texte: "Invités" }),
      donnees.invites.length
        ? el("ul", { class: "vpn-cartes" }, donnees.invites.map(carte))
        : el("p", { class: "reglages-note", texte: "Aucun invité pour l'instant." }),
      avance(),
    );
  }

  const heure = (ms) =>
    new Date(ms).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

  /** Availability watch as a status card: a pill and, when off, an "Activer" button. */
  function ligneSurveillance(v) {
    const carteStatut = (etat, pastille, texte, action = null) =>
      el(
        "div",
        { class: "carte-reglage ligne-statut", role: v?.alerte ? "alert" : "status" },
        el("span", { class: "pastille-etat", dataset: { etat }, texte: pastille }),
        el("p", { class: "texte", texte }),
        action,
      );
    if (!v?.actif)
      return carteStatut(
        "neutre",
        "Surveillance inactive",
        "Le serveur n'est pas testé automatiquement.",
        el("button", {
          type: "button",
          class: "bouton bouton--principal",
          texte: "Activer",
          onclick: () => agir(() => service.initialiserSurveillance(), "Surveillance activée."),
        }),
      );
    const depuis = v.depuis ? ` depuis ${heure(v.depuis)}` : "";
    if (v.enLigne === null)
      return carteStatut("neutre", "En attente", "Premier test du serveur en attente.");
    return carteStatut(
      v.enLigne ? "ok" : "erreur",
      v.enLigne ? "En ligne" : "Hors ligne",
      v.enLigne ? `Serveur joignable${depuis}.` : `Serveur injoignable${depuis}.`,
    );
  }

  /** Rotation after a doubt or a compromise: asks first, says what the guests will have to do. */
  function avance() {
    const demande = (titre, message, appel, fait) =>
      el("button", {
        type: "button",
        class: "bouton bouton--danger",
        texte: titre,
        onclick: async () => {
          const ok = await demander({
            titre,
            message,
            boutons: [
              { libelle: "Annuler", valeur: false },
              { libelle: "Continuer", valeur: true, principal: true, danger: true },
            ],
          });
          if (ok) await agir(appel, fait);
        },
      });
    return el(
      "details",
      { class: "vpn-avance" },
      el("summary", { texte: "Sécurité : renouveler les accès de tous" }),
      demande(
        "Nouveaux mots de passe pour tous",
        "Chaque invité devra cliquer sur « Rafraîchir mes identifiants » dans son extension. À faire en cas de doute.",
        () => service.regenererTous(),
        "Nouveaux mots de passe générés.",
      ),
      demande(
        "Recréer tous les profils WireGuard",
        "Tous les anciens profils cessent de marcher : chaque ami devra importer son nouveau QR code. À réserver à une compromission.",
        () => service.recreerTousProfils(),
        "Profils à recréer : l'agent les renouvelle en une minute.",
      ),
    );
  }

  /** Setting row: title and description on the left, the switch on the right. */
  function coupureSecurite(s) {
    const c = el("input", {
      type: "checkbox",
      role: "switch",
      class: "interrupteur-bouton",
      id: "vpn-securite",
    });
    c.checked = s.coupureSecurite;
    c.addEventListener("change", () =>
      agir(
        () => service.coupureSecurite(c.checked),
        c.checked ? "Coupure de sécurité activée." : "Coupure de sécurité désactivée.",
      ),
    );
    return el(
      "label",
      { class: "interrupteur", for: "vpn-securite" },
      el(
        "span",
        { class: "interrupteur-texte" },
        el("span", { texte: "Suspendre les invités à 95 %" }),
        el("span", {
          class: "reglages-note",
          texte: "Quand le trafic gratuit du serveur est presque épuisé. Le propriétaire n'est pas coupé.",
        }),
      ),
      c,
    );
  }

  dessiner();
  charger();
  return { racine, charger };
}
