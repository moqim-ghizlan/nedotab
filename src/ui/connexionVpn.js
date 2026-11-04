import { couleurEtat, INTERVALLE_AUTO_MS } from "../core/diagnosticVpn.js";
import { drapeau, nomPays } from "../core/drapeau.js";
import { el } from "./dom.js";

const SYMBOLES = { ok: "✓", echec: "✗", inconnu: "–" };
const heure = (t) =>
  new Date(t).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

/**
 * V5.4: what the sites really see (country, address), the normal address (hidden by default),
 * the latency and the "Tester" button. It shows what was MEASURED, with its date. While this
 * block is on screen: a light check on opening, every 15 minutes and when the network changes
 * (the background worker keeps no timer).
 *
 * @param {{ verification: ReturnType<import("../platform/extension/verificationVpn.js").creerVerificationVpn>,
 *   vpn: { etat: () => Promise<any>, effacerErreur?: () => Promise<void>, desactiver: () => Promise<void> },
 *   historique?: boolean, maintenant?: () => number, apres?: () => void }} p
 */
export function blocConnexionVpn({
  verification,
  vpn,
  historique = false,
  maintenant = Date.now,
  apres = () => {},
}) {
  const racine = el("div", { class: "vpn-verif", hidden: true });
  let occupe = false;
  let normaleVisible = false;
  let actif = false;

  async function dessiner() {
    const [memo, e] = await Promise.all([
      verification.lire().catch(() => ({ normale: null, derniere: null, historique: [] })),
      vpn.etat().catch(() => ({})),
    ]);
    actif = !!e.actif;
    racine.hidden = !(e.actif || e.voulu);
    if (racine.hidden) return;
    const d = memo.derniere;
    const couleur = occupe ? "attente" : e.actif ? couleurEtat(d, maintenant()) : "echec";
    racine.dataset.etat = couleur;
    racine.className = `vpn-verif vpn-verif--${couleur}`;

    const titre = d?.pays
      ? `${drapeau(d.pays)} ${nomPays(d.pays)}`.trim()
      : d
        ? "Pays inconnu"
        : "Pas encore vérifié";
    const lignes = [];
    if (d?.ip) lignes.push(donnee("Les sites voient", d.ip));
    lignes.push(
      memo.normale
        ? donnee(
            "Votre adresse habituelle",
            normaleVisible ? memo.normale.ip : "•••••••••",
            el("button", {
              type: "button",
              class: "lien-discret",
              texte: normaleVisible ? "Masquer" : "Afficher",
              "aria-pressed": String(normaleVisible),
              onclick: () => {
                normaleVisible = !normaleVisible;
                dessiner();
              },
            }),
          )
        : donnee("Votre adresse habituelle", "inconnue"),
    );
    if (d?.latenceMs != null) lignes.push(donnee("Latence", `${d.latenceMs} ms`));
    if (d) lignes.push(donnee("Vérifié le", heure(d.le)));

    racine.replaceChildren(
      el(
        "div",
        { class: "vpn-verif-tete" },
        el("span", { class: "vpn-verif-pastille", "aria-hidden": "true" }),
        el("strong", { class: "vpn-verif-pays", texte: titre }),
      ),
      d ? el("p", { class: "vpn-verif-message", role: "status", texte: d.message }) : null,
      el("div", { class: "vpn-verif-donnees" }, lignes),
      d?.etapes?.some((s) => s.statut !== "inconnu")
        ? el(
            "ol",
            { class: "vpn-verif-etapes" },
            d.etapes.map((s) =>
              el("li", { class: `vpn-verif-etape vpn-verif-etape--${s.statut}` }, [
                el("span", { "aria-hidden": "true", texte: SYMBOLES[s.statut] }),
                ` ${s.libelle}`,
              ]),
            ),
          )
        : null,
      actions(d),
      historique ? blocHistorique(memo.historique) : null,
    );
  }

  const donnee = (libelle, valeur, extra = null) =>
    el(
      "div",
      { class: "vpn-donnee" },
      el("span", { class: "vpn-donnee-libelle", texte: libelle }),
      el("code", { class: "vpn-donnee-valeur", texte: valeur }),
      extra,
    );

  function actions(d) {
    const boutons = [
      el("button", {
        type: "button",
        class: "bouton",
        texte: occupe ? "Test en cours…" : d?.action === "reessayer" ? "Réessayer" : "Tester",
        disabled: occupe || !actif,
        onclick: () => lancer(true),
      }),
    ];
    if (d?.action === "desactiver" || d?.action === "reessayer")
      boutons.push(
        el("button", {
          type: "button",
          class: "bouton",
          texte: "Désactiver le VPN",
          onclick: async () => {
            await vpn.desactiver();
            await dessiner();
            apres();
          },
        }),
      );
    return el("div", { class: "vpn-actions" }, boutons);
  }

  function blocHistorique(liste) {
    if (!liste.length) return null;
    return el(
      "details",
      { class: "vpn-verif-historique" },
      el("summary", { texte: `Derniers tests (${liste.length})` }),
      el(
        "ul",
        {},
        liste.map((h) =>
          el("li", {
            texte: `${heure(h.le)} — ${LIBELLES[h.global] ?? h.global}${h.pays ? ` · ${drapeau(h.pays)} ${h.pays}` : ""}${h.latenceMs != null ? ` · ${h.latenceMs} ms` : ""}`,
          }),
        ),
      ),
    );
  }

  /** @param {boolean} manuel  the button (history kept); false: light check. */
  async function lancer(manuel) {
    if (occupe) return;
    occupe = true;
    await dessiner();
    try {
      await (manuel ? verification.tester({ manuel: true }) : verification.verifierSiPerime());
    } catch {
      /* the result is read from the storage below */
    }
    occupe = false;
    await dessiner();
    apres();
  }

  // Light checks, only while this block lives in an open page.
  const surReseau = () => actif && lancer(false);
  const minuterie = setInterval(() => actif && lancer(false), INTERVALLE_AUTO_MS);
  globalThis.addEventListener?.("online", surReseau);
  globalThis.navigator?.connection?.addEventListener?.("change", surReseau);
  const arreter = () => {
    clearInterval(minuterie);
    globalThis.removeEventListener?.("online", surReseau);
    globalThis.navigator?.connection?.removeEventListener?.("change", surReseau);
  };
  globalThis.addEventListener?.("pagehide", arreter, { once: true });

  globalThis.chrome?.storage?.onChanged?.addListener?.(() => {
    if (!occupe) dessiner().catch(() => {});
  });
  dessiner()
    .then(() => actif && lancer(false))
    .catch(() => {});

  return { racine, dessiner, lancer, arreter };
}

const LIBELLES = {
  ok: "vérifié",
  incertain: "non confirmé",
  fuite: "trafic hors VPN",
  echec: "échec",
};
