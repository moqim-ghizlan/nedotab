import { abreger, formaterDiagnostic } from "../../core/diagnostic.js";
import { normaliserUrl } from "../../core/url.js";
import { plateforme } from "../../platform/index.js";
import { entrees } from "../entrees.js";
import { modeDebug, ouvrirConsole } from "../debug.js";
import { el } from "../dom.js";
import { icone } from "../icones.js";
import { journalInterne } from "../journal.js";
import { toast } from "../toast.js";

/** Facts about the state of the app, as label → value (see formaterDiagnostic). */
async function rassembler({ store, session }) {
  const synchro = session?.synchro?.lire() ?? {};
  const etat = store.lire();
  let sw = "aucun";
  let caches = "—";
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration)
      sw = registration.active?.state ?? registration.waiting?.state ?? "installation";
    if (globalThis.caches) caches = (await globalThis.caches.keys()).join(", ") || "aucun";
  } catch {
    sw = "indisponible";
  }
  const idAppareil = await plateforme.idAppareil?.().catch(() => null);
  return {
    Version: plateforme.getVersion(),
    Plateforme: plateforme.capacites?.nom,
    Mode: synchro.mode ?? "local",
    Appareil: abreger(idAppareil),
    Réseau: navigator.onLine ? "en ligne" : "hors ligne",
    Synchro: synchro.statut ?? "—",
    "Erreur de synchro": synchro.erreur ?? "aucune",
    "Taille de l'état": `${new Blob([JSON.stringify(etat)]).size} octets`,
    "Service worker": sw,
    Caches: caches,
    Capacités: JSON.stringify(plateforme.capacites ?? {}),
    Entrées: JSON.stringify(entrees().lire()),
    Écran: `${innerWidth}×${innerHeight}`,
  };
}

const VALEURS_LONGUES = 90;

/** State of a fact, to colour its pill: "ok", "attention", "erreur" or nothing. */
function etatDuFait(cle, valeur) {
  if (cle === "Réseau") return valeur === "en ligne" ? "ok" : "attention";
  if (cle === "Erreur de synchro") return valeur === "aucune" ? null : "erreur";
  if (cle === "Synchro") return valeur === "synchronise" ? "ok" : valeur === "—" ? null : "attention";
  return null;
}

/** The facts as a key / value table; long values are folded with "Voir plus". */
function tableDesFaits(faits) {
  const table = el("dl", { class: "table-cles" });
  for (const [cle, valeur] of Object.entries(faits)) {
    const texte = String(valeur ?? "—");
    const etat = etatDuFait(cle, texte);
    const dd = el("dd", {});
    if (etat) dd.append(el("span", { class: "pastille-etat", dataset: { etat }, texte }));
    else if (texte.length > VALEURS_LONGUES) {
      dd.classList.add("replie");
      dd.append(el("span", { texte }));
    } else dd.textContent = texte;
    const ligne = el("div", { class: "table-cles-ligne" }, el("dt", { texte: cle }), dd);
    if (dd.classList.contains("replie")) {
      const plus = el("button", {
        type: "button",
        class: "voir-plus",
        "aria-expanded": "false",
        texte: "Voir plus",
        onclick: () => {
          const ouvert = dd.classList.toggle("replie");
          plus.textContent = ouvert ? "Voir plus" : "Voir moins";
          plus.setAttribute("aria-expanded", String(!ouvert));
        },
      });
      dd.after(plus);
      ligne.append(plus);
      // the button sits in the value column
      plus.style.gridColumn = "2";
    }
    table.append(ligne);
  }
  return table;
}

/** "Voir l'extrait d'une URL" (V4.3): what the page reader would give to the AI. */
function outilExtrait() {
  const champ = el("input", {
    type: "url",
    class: "champ-texte",
    placeholder: "https://exemple.com/page",
    "aria-label": "Adresse dont voir l'extrait",
    autocapitalize: "off",
    autocorrect: "off",
    spellcheck: "false",
  });
  const resultat = el("pre", { class: "diagnostic-texte diagnostic-texte--haut", "aria-live": "polite" });
  const voir = async () => {
    const saisie = normaliserUrl(champ.value);
    if (!saisie.ok) {
      resultat.textContent = saisie.erreur;
      return;
    }
    resultat.textContent = "Lecture…";
    const extrait = await plateforme.lireExtrait?.(saisie.url).catch(() => null);
    resultat.textContent = extrait
      ? JSON.stringify(extrait, null, 2)
      : "Aucun extrait : permission d'accès aux sites non accordée, ou page illisible.";
  };
  champ.addEventListener("keydown", (e) => {
    if (e.key === "Enter") voir();
  });
  return el(
    "div",
    { class: "diagnostic-extrait" },
    el("p", {
      class: "reglages-note",
      texte: "Voir l'extrait d'une URL : le résumé que l'IA recevrait (extension uniquement).",
    }),
    el(
      "div",
      { class: "groupe-champ" },
      champ,
      el("button", {
        type: "button",
        class: "bouton bouton--principal",
        texte: "Voir l'extrait",
        onclick: voir,
      }),
    ),
    resultat,
  );
}

/**
 * "Diagnostic" section of the settings (V3.10), shown only while the diagnostic mode is on:
 * the facts and the last 50 log entries, to copy; force a sync; empty the interface cache;
 * open the console.
 */
export function sectionDiagnostic({ store, session }) {
  const faitsZone = el("div", { class: "diagnostic-faits" });
  const sortie = el("pre", { class: "diagnostic-texte", "aria-live": "polite" });
  let derniersFaits = {};
  const texte = async () => {
    derniersFaits = await rassembler({ store, session });
    return formaterDiagnostic(derniersFaits, journalInterne.dernieres(50));
  };
  const rafraichir = async () => {
    sortie.textContent = await texte();
    faitsZone.replaceChildren(tableDesFaits(derniersFaits));
  };
  const copier = async () => {
    try {
      await navigator.clipboard.writeText(await texte());
      toast("Diagnostic copié", { duree: 2500 });
    } catch {
      toast("Copie impossible : sélectionnez le texte ci-dessous.", { type: "erreur" });
    }
  };

  const bouton = (libelle, onclick, classe = "bouton", nomIcone = null) =>
    el(
      "button",
      { type: "button", class: classe, onclick },
      nomIcone ? icone(nomIcone, { taille: 16 }) : null,
      libelle,
    );

  const section = el(
    "section",
    {
      class: "reglages-section carte-reglage",
      "aria-labelledby": "titre-diagnostic",
      hidden: true,
    },
    el("h3", { id: "titre-diagnostic", class: "carte-reglage-titre" }, icone("avance", { taille: 18 }), "Diagnostic"),
    el("p", {
      class: "reglages-note",
      texte:
        "Informations techniques, sans adresse ni identifiant personnel. Copiez-les pour les envoyer en cas de problème.",
    }),
    el(
      "div",
      { class: "grille-boutons" },
      bouton("Copier le diagnostic", copier, "bouton bouton--principal", "copier"),
      bouton("Actualiser", rafraichir, "bouton", "synchroniser"),
      session?.synchro?.reessayer
        ? bouton(
            "Forcer la synchronisation",
            () => {
              session.synchro.reessayer();
              toast("Synchronisation relancée", { duree: 2500 });
            },
            "bouton",
            "synchroniser",
          )
        : null,
      bouton("Ouvrir la console", async () => {
        if (!(await ouvrirConsole().catch(() => false)))
          toast("Console indisponible ici (utilisez les outils de développement).");
      }, "bouton", "avance"),
      bouton(
        "Vider le cache de l'interface",
        async () => {
          try {
            const registrations = (await navigator.serviceWorker?.getRegistrations()) ?? [];
            await Promise.all(registrations.map((r) => r.unregister()));
            for (const nom of (await globalThis.caches?.keys()) ?? [])
              await globalThis.caches.delete(nom);
          } catch {
            // Nothing more to clear.
          }
          location.reload();
        },
        "bouton bouton--danger",
        "poubelle",
      ),
    ),
    plateforme.capacites?.lirePagesWeb ? outilExtrait() : null,
    faitsZone,
    el("p", { class: "reglages-libelle", texte: "Journal et détails" }),
    sortie,
  );

  // Visible with the mode, and the text is read when it is turned on.
  const maj = () => {
    const visible = modeDebug(store);
    if (visible && section.hidden) rafraichir();
    section.hidden = !visible;
  };
  store.abonner(maj);
  maj();
  return section;
}
