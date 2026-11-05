import {
  formaterOctets,
  jourCourt,
  LIBELLES_ETAT,
  TEXTE_PROPRIETAIRE,
} from "../../core/vpnConsommation.js";
import { demander } from "../dialogues/commun.js";
import { el } from "../dom.js";
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

  function carte(i) {
    const champ = el("input", {
      type: "number",
      min: "1",
      step: "1",
      inputmode: "numeric",
      placeholder: "illimité",
      value: i.limiteGo ?? "",
      "aria-label": `Limite mensuelle de ${i.email} en Go`,
    });
    const limite = () => {
      const brut = champ.value.trim();
      const go = brut === "" ? null : Number(brut);
      if (go !== null && !(Number.isFinite(go) && go >= 1))
        return toast("Limite invalide (1 Go au moins, ou vide pour illimité).", { type: "erreur" });
      return agir(() => service.definirLimite(i.email, go), "Limite enregistrée.");
    };
    return el(
      "li",
      { class: `vpn-carte vpn-carte--${i.etat}` },
      el("strong", { texte: i.email }),
      el("span", {
        class: "reglages-note",
        texte: `${LIBELLES_ETAT[i.etat] ?? i.etat}${i.raison === "limite" ? " (limite atteinte)" : i.raison === "securite" ? " (sécurité du serveur)" : ""} · dernière activité ${jourCourt(i.derniereActivite)}`,
      }),
      el("span", {
        texte: `Proxy ${formaterOctets(i.octetsProxy)} · WireGuard ${formaterOctets(i.octetsWireguard)}`,
      }),
      i.etat === "revoque"
        ? null
        : el(
            "div",
            { class: "vpn-actions" },
            champ,
            el("span", { texte: "Go" }),
            el("button", {
              type: "button",
              class: "bouton",
              texte: "Enregistrer la limite",
              onclick: limite,
            }),
            i.etat === "coupe"
              ? el("button", {
                  type: "button",
                  class: "bouton",
                  texte: "Rétablir",
                  onclick: () => agir(() => service.retablir(i.email), "Accès rétabli."),
                })
              : el("button", {
                  type: "button",
                  class: "bouton bouton--danger",
                  texte: "Couper maintenant",
                  onclick: () => couper(i),
                }),
          ),
    );
  }

  function dessiner() {
    racine.replaceChildren(
      el("h4", { texte: "Consommation du mois" }),
      el("p", { class: "reglages-note", texte: TEXTE_PROPRIETAIRE }),
    );
    if (erreur) return racine.append(el("p", { class: "reglages-note", texte: erreur }));
    if (!donnees) return racine.append(el("p", { class: "reglages-note", texte: "Chargement…" }));
    const s = donnees.serveur;
    const pct = Math.min(100, Math.round((s.octets / (s.limiteGo * 1e9)) * 100));
    racine.append(
      el("p", {
        texte: `Serveur : ${formaterOctets(s.octets)} sur ${formaterOctets(s.limiteGo * 1e9)} gratuits (${pct} %)`,
      }),
      el("progress", {
        class: "vpn-barre",
        max: "100",
        value: String(pct),
        "aria-label": "Trafic du serveur ce mois-ci",
      }),
      pct >= 80
        ? el("p", {
            class: "vpn-nav-alerte",
            role: "alert",
            texte: `Le serveur approche de sa limite gratuite${s.securite ? " : la coupure de sécurité a suspendu les invités" : ""}.`,
          })
        : null,
      ligneSurveillance(donnees.surveillance),
      graphiqueServeur(s.jours),
      coupureSecurite(s),
      avance(),
      donnees.invites.length
        ? el("ul", { class: "vpn-cartes" }, donnees.invites.map(carte))
        : el("p", { class: "reglages-note", texte: "Aucun invité pour l'instant." }),
    );
  }

  const heure = (ms) =>
    new Date(ms).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

  /** "Serveur : en ligne depuis 08:30" / "hors ligne depuis 14:10" (watch every 10 minutes). */
  function ligneSurveillance(v) {
    if (!v?.actif)
      return el(
        "p",
        { class: "reglages-note" },
        "Surveillance de disponibilité inactive. ",
        el("button", {
          type: "button",
          class: "lien-discret",
          texte: "Activer",
          onclick: () => agir(() => service.initialiserSurveillance(), "Surveillance activée."),
        }),
      );
    const depuis = v.depuis ? ` depuis ${heure(v.depuis)}` : "";
    if (v.enLigne === null)
      return el("p", { class: "reglages-note", texte: "Serveur : premier test en attente." });
    return el("p", {
      class: v.alerte ? "vpn-nav-alerte" : "reglages-note",
      role: v.alerte ? "alert" : "status",
      texte: v.enLigne ? `Serveur : en ligne${depuis}` : `Serveur : hors ligne${depuis}`,
    });
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

  function coupureSecurite(s) {
    const c = el("input", { type: "checkbox", id: "vpn-securite" });
    c.checked = s.coupureSecurite;
    c.addEventListener("change", () =>
      agir(
        () => service.coupureSecurite(c.checked),
        c.checked ? "Coupure de sécurité activée." : "Coupure de sécurité désactivée.",
      ),
    );
    return el(
      "label",
      { class: "vpn-nav-option", for: "vpn-securite" },
      c,
      " Suspendre les invités à 95 % du trafic gratuit (pas le propriétaire)",
    );
  }

  dessiner();
  charger();
  return { racine, charger };
}
