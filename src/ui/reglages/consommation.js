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
const MOIS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

/** Four decimals, so that the figures of a column line up whatever their size. */
const euros4 = (v) => (v == null ? "prix inconnu" : `${v.toFixed(4).replace(".", ",")} €`);
const nombre = (n) => new Intl.NumberFormat("fr-FR").format(n ?? 0);
const appels = (n) => `${nombre(n)} appel${n > 1 ? "s" : ""}`;
const dateMaj = (ms) => (ms ? new Date(ms).toLocaleDateString("fr-FR") : null);
/** "2026-11" → "novembre 2026". */
const nomDuMois = (cle) => `${MOIS[Number(cle.slice(5, 7)) - 1] ?? cle} ${cle.slice(0, 4)}`;

/**
 * Bars per day of the month, drawn here (SVG): one bar a day, today in the accent colour and
 * the other days softer, a baseline, the value of each bar in its title (and the same numbers
 * in the table below).
 */
export function graphiqueJours(jours, { mesure = "appels", jourDuMois }) {
  const valeurs = Array.from({ length: 31 }, (_, i) => jours?.[String(i + 1)]?.[mesure] ?? 0);
  const dernier = Math.max(jourDuMois, ...valeurs.map((v, i) => (v > 0 ? i + 1 : 0)));
  const max = Math.max(...valeurs, mesure === "appels" ? 1 : 0.0001);
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${dernier * 14} 84`);
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("class", "conso-graphique");
  svg.setAttribute("role", "img");
  svg.setAttribute(
    "aria-label",
    `${mesure === "appels" ? "Appels" : "Coût estimé"} par jour ce mois-ci`,
  );
  const base = document.createElementNS(NS, "line");
  base.setAttribute("x1", "0");
  base.setAttribute("x2", String(dernier * 14));
  base.setAttribute("y1", "79.5");
  base.setAttribute("y2", "79.5");
  base.setAttribute("class", "conso-base");
  svg.append(base);
  valeurs.slice(0, dernier).forEach((v, i) => {
    const h = Math.round((v / max) * 70);
    const barre = document.createElementNS(NS, "rect");
    barre.setAttribute("x", String(i * 14 + 2));
    barre.setAttribute("y", String(78 - h));
    barre.setAttribute("width", "10");
    barre.setAttribute("height", String(Math.max(h, v > 0 ? 1 : 0)));
    barre.setAttribute("rx", "2");
    barre.setAttribute(
      "class",
      `conso-barre${i + 1 === jourDuMois ? " conso-barre--aujourdhui" : ""}`,
    );
    const titre = document.createElementNS(NS, "title");
    titre.textContent = `Le ${i + 1} : ${mesure === "appels" ? appels(v) : formaterEuros(v)}`;
    barre.append(titre);
    svg.append(barre);
  });
  return svg;
}

/**
 * Screen "Consommation" (V4.19): what the AI costs the user, as an ESTIMATE (the amount really
 * billed is the provider's). The month's cost comes first; then the days, the usages, the earlier
 * months, the calls the cache saved, and the personal limits (day and month, in calls and in
 * estimated euros).
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

  function champLimite(periode, type) {
    const limites = iaDe(store.lire().reglages).limites;
    const champ = el("input", {
      type: "number",
      min: "0",
      step: type === "euros" ? "0.01" : "1",
      inputmode: "decimal",
      class: "conso-limite",
      id: `limite-${periode}-${type}`,
      value: limites?.[periode]?.[type] ?? "",
      placeholder: "—",
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
    return el(
      "span",
      { class: "conso-champ-boite" },
      champ,
      el("span", { class: "conso-unite", "aria-hidden": "true", texte: type === "euros" ? "€" : "appels" }),
    );
  }

  /** One row of the limits grid: the label, then the field for each period. */
  function ligneLimite(libelle, type) {
    return [
      el("span", { class: "conso-limite-nom", texte: libelle }),
      el("label", { class: "conso-limite-case", for: `limite-jour-${type}` }, el("span", { class: "conso-sr", texte: `${libelle}, par jour` }), champLimite("jour", type)),
      el("label", { class: "conso-limite-case", for: `limite-mois-${type}` }, el("span", { class: "conso-sr", texte: `${libelle}, par mois` }), champLimite("mois", type)),
    ];
  }

  function rendre() {
    if (erreur)
      return racine.replaceChildren(
        el("p", { class: "compte-erreur", role: "alert", texte: erreur }),
      );
    if (!donnees) return racine.replaceChildren(el("p", { class: "reglages-note", texte: "Chargement…" }));
    const d = donnees;
    const total = d.ceMois.total ?? {};
    const jourDuMois = Number(d.jour.slice(8, 10));
    const sansPrix = d.ceMois.sansPrix > 0;
    const alertes = d.etatLimites?.alertes ?? [];
    const atteinte = d.etatLimites?.atteinte;
    const parUsage = Object.entries(d.ceMois.parUsage ?? {});
    const jetons = (total.jetonsEntree ?? 0) + (total.jetonsSortie ?? 0);
    const vide = !total.appels;
    const inconnu = sansPrix && !total.coutEstime;
    const inconnuJour = sansPrix && !d.aujourdhui.coutEstime;

    const contenu = [
      atteinte
        ? el("p", {
            class: "conso-bandeau conso-bandeau--stop",
            role: "alert",
            texte:
              "Votre limite personnelle est atteinte : l'IA est suspendue jusqu'à la prochaine période. Vous pouvez l'ajuster plus bas.",
          })
        : alertes.length
          ? el("p", {
              class: "conso-bandeau conso-alerte",
              role: "status",
              texte: `Vous avez utilisé ${alertes[0].pourcent} % de votre limite ${alertes[0].periode === "jour" ? "du jour" : "du mois"}.`,
            })
          : null,

      // The month first: it is the number people come here to read.
      el(
        "section",
        { class: "conso-resume", "aria-label": "Ce mois-ci" },
        el(
          "div",
          { class: "conso-mois-bloc" },
          el("span", { class: "conso-legende", texte: `Estimé en ${nomDuMois(d.mois)}` }),
          el("span", { class: "conso-valeur", texte: inconnu ? "Prix inconnu" : formaterEuros(total.coutEstime ?? 0) }),
          el(
            "span",
            { class: "conso-details" },
            el("span", { texte: appels(total.appels ?? 0) }),
            el("span", { texte: `${nombre(jetons)} jetons` }),
          ),
        ),
        el(
          "div",
          { class: "conso-jour" },
          el("span", { class: "conso-legende", texte: "Aujourd'hui" }),
          el("span", { class: "conso-valeur conso-valeur--petite", texte: inconnuJour ? "Prix inconnu" : formaterEuros(d.aujourdhui.coutEstime) }),
          el("span", { class: "conso-details", texte: appels(d.aujourdhui.appels) }),
        ),
      ),

      vide
        ? el("p", {
            class: "conso-vide",
            texte:
              "Aucune utilisation ce mois-ci. Les appels de l'assistant (tags, recherche, discussion, rangement) apparaîtront ici.",
          })
        : el(
            "section",
            { class: "conso-bloc" },
            el(
              "div",
              { class: "conso-entete" },
              el("h3", { texte: "Jour par jour" }),
              el(
                "div",
                { class: "segments conso-segments", role: "radiogroup", "aria-label": "Mesure du graphique" },
                [
                  ["appels", "Appels"],
                  ["coutEstime", "Coût"],
                ].map(([m, texte]) =>
                  el("button", {
                    type: "button",
                    class: "segment",
                    role: "radio",
                    "aria-checked": String(mesure === m),
                    texte,
                    onclick: () => {
                      mesure = m;
                      rendre();
                    },
                  }),
                ),
              ),
            ),
            graphiqueJours(d.ceMois.jours, { mesure, jourDuMois }),
            el(
              "div",
              { class: "conso-axe", "aria-hidden": "true" },
              el("span", { texte: "1" }),
              el("span", { texte: String(jourDuMois) }),
            ),
            parUsage.length
              ? el(
                  "table",
                  { class: "conso-tableau" },
                  el("caption", { texte: "Par usage" }),
                  el(
                    "thead",
                    {},
                    el(
                      "tr",
                      {},
                      ...["Usage", "Appels", "Jetons", "Coût"].map((t) =>
                        el("th", { scope: "col", texte: t }),
                      ),
                    ),
                  ),
                  el(
                    "tbody",
                    {},
                    parUsage.map(([u, b]) =>
                      el(
                        "tr",
                        {},
                        el("th", { scope: "row", texte: LIBELLES_USAGES[u] ?? u }),
                        el("td", { texte: nombre(b.appels) }),
                        el("td", { texte: nombre((b.jetonsEntree ?? 0) + (b.jetonsSortie ?? 0)) }),
                        el("td", { texte: euros4(b.coutEstime) }),
                      ),
                    ),
                  ),
                )
              : null,
          ),
      el("p", {
        class: `conso-cache${d.ceMois.appelsEvites ? " conso-cache--actif" : ""}`,
        texte: d.ceMois.appelsEvites
          ? `${nombre(d.ceMois.appelsEvites)} appel${d.ceMois.appelsEvites > 1 ? "s" : ""} évité${d.ceMois.appelsEvites > 1 ? "s" : ""} grâce au cache ce mois-ci.`
          : "Aucun appel évité par le cache pour l'instant.",
      }),

      d.precedents.length
        ? el(
            "section",
            { class: "conso-bloc" },
            el("h3", { texte: "Mois précédents" }),
            el(
              "ul",
              { class: "conso-mois" },
              d.precedents.map((p) =>
                el(
                  "li",
                  { "data-mois": p.mois },
                  el("span", { class: "conso-mois-nom", texte: nomDuMois(p.mois) }),
                  el("span", { texte: appels(p.total.appels) }),
                  el("span", { class: "conso-mois-cout", texte: formaterEuros(p.total.coutEstime ?? 0) }),
                ),
              ),
            ),
          )
        : null,

      el(
        "section",
        { class: "conso-bloc" },
        el("h3", { texte: "Limiter mon usage" }),
        el("p", {
          class: "reglages-note",
          texte: `Une alerte apparaît à ${Math.round(SEUIL_ALERTE * 100)} %. À 100 %, l'IA est suspendue jusqu'à la prochaine période. Laissez vide pour ne pas limiter.`,
        }),
        el(
          "div",
          { class: "conso-limites" },
          el("span", { "aria-hidden": "true" }),
          el("span", { class: "conso-limite-tete", "aria-hidden": "true", texte: "Par jour" }),
          el("span", { class: "conso-limite-tete", "aria-hidden": "true", texte: "Par mois" }),
          ...ligneLimite("Appels", "appels"),
          ...ligneLimite("Euros estimés", "euros"),
        ),
      ),

      el("p", {
        class: "conso-mention",
        texte: `Estimation fondée sur les tarifs publics${dateMaj(d.prix.majLe) ? ` du ${dateMaj(d.prix.majLe)}` : ""}. Le montant réel est celui facturé par votre fournisseur (console de votre clé).${sansPrix ? " Certains appels n'ont pas de prix connu : leurs jetons sont comptés mais pas leur coût." : ""}`,
      }),
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
