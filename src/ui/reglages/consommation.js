import { A } from "../../core/actions.js";
import { avecLimites, iaDe } from "../../core/ia.js";
import { formaterEuros, SEUIL_ALERTE } from "../../core/estimation.js";
import { chargerFirebase } from "../../firebase/charger.js";
import { demander } from "../dialogues/commun.js";
import { el } from "../dom.js";
import { messageErreurIa } from "../messagesIa.js";

const NS = "http://www.w3.org/2000/svg";
const LIBELLES_USAGES = {
  tags: "Tags",
  recherche: "Recherche",
  chat: "Discussion",
  rangement: "Rangement",
};

const nombre = (n) => new Intl.NumberFormat("fr-FR").format(n ?? 0);
const dateMaj = (ms) => (ms ? new Date(ms).toLocaleDateString("fr-FR") : null);

/** Bars per day of the month: SVG made here, colours from the tokens, values also in a table. */
export function graphiqueJours(jours, { mesure = "appels", jourDuMois }) {
  const valeurs = Array.from({ length: 31 }, (_, i) => jours?.[String(i + 1)]?.[mesure] ?? 0);
  const dernier = Math.max(jourDuMois, ...valeurs.map((v, i) => (v > 0 ? i + 1 : 0)));
  const max = Math.max(...valeurs, mesure === "appels" ? 1 : 0.0001);
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${dernier * 14} 80`);
  svg.setAttribute("class", "conso-graphique");
  svg.setAttribute("role", "img");
  svg.setAttribute(
    "aria-label",
    `${mesure === "appels" ? "Appels" : "Coût estimé"} par jour ce mois-ci`,
  );
  valeurs.slice(0, dernier).forEach((v, i) => {
    const h = Math.round((v / max) * 70);
    const barre = document.createElementNS(NS, "rect");
    barre.setAttribute("x", String(i * 14 + 2));
    barre.setAttribute("y", String(76 - h));
    barre.setAttribute("width", "10");
    barre.setAttribute("height", String(Math.max(h, v > 0 ? 1 : 0)));
    barre.setAttribute("rx", "2");
    barre.setAttribute("class", "conso-barre");
    const titre = document.createElementNS(NS, "title");
    titre.textContent = `Le ${i + 1} : ${mesure === "appels" ? `${v} appel${v > 1 ? "s" : ""}` : formaterEuros(v)}`;
    barre.append(titre);
    svg.append(barre);
  });
  return svg;
}

/**
 * Screen "Consommation" (V4.19): what the AI costs the user, as an ESTIMATE (the amount really
 * billed is the provider's), by day / usage, the 12 last months, the calls saved by the cache,
 * and the personal limits (day and month, in calls and in estimated euros).
 */
export async function ouvrirConsommation({ store, retourFocus }) {
  let donnees = null;
  let erreur = null;
  let mesure = "appels";
  const racine = el("div", { class: "conso" });

  async function charger() {
    try {
      donnees = await (await chargerFirebase()).appelerIa("iaConsommation");
      erreur = null;
    } catch (e) {
      erreur = messageErreurIa(e);
    }
    rendre();
  }

  function champLimite(periode, type, etiquette) {
    const limites = iaDe(store.lire().reglages).limites;
    const champ = el("input", {
      type: "number",
      min: "0",
      step: type === "euros" ? "0.01" : "1",
      inputmode: "decimal",
      class: "conso-limite",
      id: `limite-${periode}-${type}`,
      value: limites?.[periode]?.[type] ?? "",
      placeholder: "aucune",
    });
    champ.addEventListener("change", () => {
      const brut = limites ?? {};
      const v = champ.value === "" ? undefined : Number(champ.value);
      const periodeAvant = { ...(brut[periode] ?? {}) };
      if (v === undefined || !(v > 0)) delete periodeAvant[type];
      else periodeAvant[type] = v;
      const suivantes = { ...brut, [periode]: periodeAvant };
      const ia = avecLimites(iaDe(store.lire().reglages), suivantes);
      store.envoyer({ type: A.REGLAGES_MODIFIER, changements: { ia } });
      charger();
    });
    return el("label", { class: "conso-champ", for: champ.id }, el("span", { texte: etiquette }), champ);
  }

  function rendre() {
    if (erreur) return racine.replaceChildren(el("p", { class: "compte-erreur", role: "alert", texte: erreur }));
    if (!donnees) return racine.replaceChildren(el("p", { class: "reglages-note", texte: "Chargement…" }));
    const d = donnees;
    const total = d.ceMois.total ?? {};
    const jourDuMois = Number(d.jour.slice(8, 10));
    const sansPrix = d.ceMois.sansPrix > 0;
    const alertes = d.etatLimites?.alertes ?? [];
    const atteinte = d.etatLimites?.atteinte;
    const cout = (v) => (v == null ? "prix inconnu" : formaterEuros(v));
    const parUsage = Object.entries(d.ceMois.parUsage ?? {});

    const contenu = [
      atteinte
        ? el("p", { class: "compte-erreur", role: "alert", texte: "Votre limite personnelle est atteinte : l'IA est suspendue jusqu'à la prochaine période. Vous pouvez l'ajuster ci-dessous." })
        : alertes.length
          ? el("p", { class: "reglages-note conso-alerte", role: "status", texte: `Vous avez utilisé ${alertes[0].pourcent} % de votre limite ${alertes[0].periode === "jour" ? "du jour" : "du mois"}.` })
          : null,
      el(
        "section",
        { class: "conso-bloc" },
        el("h3", { texte: "Aujourd'hui" }),
        el("p", { texte: `${nombre(d.aujourdhui.appels)} appel${d.aujourdhui.appels > 1 ? "s" : ""} · ${sansPrix && !d.aujourdhui.coutEstime ? "coût inconnu" : formaterEuros(d.aujourdhui.coutEstime)}` }),
      ),
      el(
        "section",
        { class: "conso-bloc" },
        el("h3", { texte: "Ce mois-ci" }),
        el("p", { texte: `${nombre(total.appels)} appels · ${nombre((total.jetonsEntree ?? 0) + (total.jetonsSortie ?? 0))} jetons · ${sansPrix && !total.coutEstime ? "coût inconnu" : formaterEuros(total.coutEstime ?? 0)}` }),
        el(
          "div",
          { class: "conso-choix", role: "group", "aria-label": "Mesure du graphique" },
          ["appels", "coutEstime"].map((m) =>
            el("button", {
              type: "button",
              class: "bouton",
              "aria-pressed": String(mesure === m),
              texte: m === "appels" ? "Appels" : "Coût estimé",
              onclick: () => {
                mesure = m;
                rendre();
              },
            }),
          ),
        ),
        graphiqueJours(d.ceMois.jours, { mesure, jourDuMois }),
        parUsage.length
          ? el(
              "table",
              { class: "conso-tableau" },
              el("caption", { texte: "Par usage" }),
              el("thead", {}, el("tr", {}, ...["Usage", "Appels", "Jetons", "Coût estimé"].map((t) => el("th", { scope: "col", texte: t })))),
              el(
                "tbody",
                {},
                parUsage.map(([u, b]) =>
                  el("tr", {}, el("th", { scope: "row", texte: LIBELLES_USAGES[u] ?? u }), el("td", { texte: nombre(b.appels) }), el("td", { texte: nombre((b.jetonsEntree ?? 0) + (b.jetonsSortie ?? 0)) }), el("td", { texte: cout(b.coutEstime) })),
                ),
              ),
            )
          : null,
        el("p", { class: "reglages-note", texte: d.ceMois.appelsEvites ? `${nombre(d.ceMois.appelsEvites)} appel${d.ceMois.appelsEvites > 1 ? "s" : ""} évité${d.ceMois.appelsEvites > 1 ? "s" : ""} grâce au cache ce mois-ci.` : "Aucun appel évité par le cache pour l'instant." }),
      ),
      d.precedents.length
        ? el(
            "section",
            { class: "conso-bloc" },
            el("h3", { texte: "Mois précédents" }),
            el("ul", { class: "conso-mois" }, d.precedents.map((p) => el("li", { texte: `${p.mois} : ${nombre(p.total.appels)} appels · ${formaterEuros(p.total.coutEstime ?? 0)}` }))),
          )
        : null,
      el(
        "section",
        { class: "conso-bloc" },
        el("h3", { texte: "Limiter mon usage" }),
        el("p", { class: "reglages-note", texte: `Une alerte discrète apparaît à ${Math.round(SEUIL_ALERTE * 100)} % ; à 100 %, l'IA est suspendue jusqu'à la prochaine période. Laissez vide pour ne pas limiter.` }),
        champLimite("jour", "appels", "Appels par jour"),
        champLimite("jour", "euros", "Euros estimés par jour"),
        champLimite("mois", "appels", "Appels par mois"),
        champLimite("mois", "euros", "Euros estimés par mois"),
      ),
      el("p", { class: "reglages-note", texte: `Estimation fondée sur les tarifs publics${dateMaj(d.prix.majLe) ? ` du ${dateMaj(d.prix.majLe)}` : ""}. Le montant réel est celui facturé par votre fournisseur (console de votre clé).${sansPrix ? " Certains appels n'ont pas de prix connu : leurs jetons sont comptés mais pas leur coût." : ""}` }),
    ];
    racine.replaceChildren(...contenu.filter(Boolean));
  }

  rendre();
  charger();
  await demander({
    titre: "Consommation de l'IA",
    contenu: [racine],
    boutons: [{ libelle: "Fermer", valeur: true, principal: true }],
    retourFocus,
  });
}
