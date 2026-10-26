import { abreger, formaterDiagnostic } from "../../core/diagnostic.js";
import { chargerFirebase } from "../../firebase/charger.js";
import { messageErreurIa } from "../messagesIa.js";
import { plateforme } from "../../platform/index.js";
import { entrees } from "../entrees.js";
import { modeDebug, ouvrirConsole } from "../debug.js";
import { el } from "../dom.js";
import { journalInterne } from "../journal.js";
import { toast } from "../toast.js";

/**
 * "Tester une clé IA" (V4.0, temporary: replaced by the AI settings of V4.1). Saves a key
 * through the server (checked, then stored encrypted), shows what the server keeps of it
 * (provider, last 4 characters), runs a minimal call. The key typed is cleared from the
 * field as soon as it is sent and is never kept nor logged here.
 */
function testeurIa(session) {
  const etat = el("p", { class: "reglages-note", "aria-live": "polite" });
  const fournisseur = el(
    "select",
    { "aria-label": "Fournisseur" },
    el("option", { value: "openai", texte: "OpenAI (GPT)" }),
    el("option", { value: "gemini", texte: "Google (Gemini) — V4.1" }),
  );
  const cle = el("input", {
    type: "password",
    autocomplete: "off",
    spellcheck: "false",
    placeholder: "Clé API",
    "aria-label": "Clé API",
  });
  const modele = el("input", {
    type: "text",
    autocomplete: "off",
    spellcheck: "false",
    placeholder: "Identifiant exact du modèle",
    "aria-label": "Modèle",
  });
  const appeler = async (nom, donnees, enCours) => {
    if (session?.synchro?.lire().mode !== "compte") {
      etat.textContent = "Connectez-vous et synchronisez d'abord votre compte.";
      return null;
    }
    etat.textContent = enCours;
    try {
      const fb = await chargerFirebase();
      return await fb.appelerIa(nom, donnees);
    } catch (e) {
      etat.textContent = messageErreurIa(e);
      return null;
    }
  };
  const afficherEtat = async () => {
    const liste = await appeler("iaEtatCles", {}, "Lecture des clés…");
    if (!liste) return;
    etat.textContent = liste.length
      ? liste
          .map(
            (c) => `${c.fournisseur} : …${c.fin} (${c.valide === false ? "invalide" : "valide"})`,
          )
          .join(" · ")
      : "Aucune clé enregistrée.";
  };
  const bouton = (libelle, onclick) =>
    el("button", { type: "button", class: "bouton", texte: libelle, onclick });

  return el(
    "div",
    { class: "diagnostic-ia" },
    el("h4", { texte: "Tester une clé IA" }),
    el("div", { class: "reglages-boutons" }, fournisseur, cle),
    el(
      "div",
      { class: "reglages-boutons" },
      bouton("Enregistrer la clé", async () => {
        const valeur = cle.value.trim();
        cle.value = "";
        if (!valeur) return;
        const r = await appeler(
          "iaEnregistrerCle",
          { fournisseur: fournisseur.value, cle: valeur },
          "Vérification de la clé auprès du fournisseur…",
        );
        if (r) etat.textContent = `Clé …${r.fin} enregistrée (chiffrée).`;
      }),
      bouton("État des clés", afficherEtat),
      bouton("Supprimer la clé", async () => {
        const r = await appeler(
          "iaSupprimerCle",
          { fournisseur: fournisseur.value },
          "Suppression…",
        );
        if (r) afficherEtat();
      }),
    ),
    el(
      "div",
      { class: "reglages-boutons" },
      modele,
      bouton("Tester", async () => {
        const r = await appeler(
          "iaTester",
          { fournisseur: fournisseur.value, modele: modele.value.trim() },
          "Appel de test…",
        );
        if (r)
          etat.textContent = r.ok
            ? `OK en ${r.latenceMs} ms (${r.modele}).`
            : `Réponse reçue en ${r.latenceMs} ms mais pas « OK » (${r.modele}).`;
      }),
    ),
    etat,
  );
}

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

/**
 * "Diagnostic" section of the settings (V3.10), shown only while the diagnostic mode is on:
 * the facts and the last 50 log entries, to copy; force a sync; empty the interface cache;
 * open the console.
 */
export function sectionDiagnostic({ store, session }) {
  const sortie = el("pre", { class: "diagnostic-texte", "aria-live": "polite" });
  const texte = async () =>
    formaterDiagnostic(await rassembler({ store, session }), journalInterne.dernieres(50));
  const rafraichir = async () => (sortie.textContent = await texte());

  const bouton = (libelle, onclick) =>
    el("button", { type: "button", class: "bouton", texte: libelle, onclick });

  const section = el(
    "section",
    { class: "reglages-section", "aria-labelledby": "titre-diagnostic", hidden: true },
    el("h3", { id: "titre-diagnostic", texte: "Diagnostic" }),
    el("p", {
      class: "reglages-note",
      texte:
        "Informations techniques, sans adresse ni identifiant personnel. Copiez-les pour les envoyer en cas de problème.",
    }),
    el(
      "div",
      { class: "reglages-boutons" },
      bouton("Copier le diagnostic", async () => {
        try {
          await navigator.clipboard.writeText(await texte());
          toast("Diagnostic copié", { duree: 2500 });
        } catch {
          toast("Copie impossible : sélectionnez le texte ci-dessous.", { type: "erreur" });
        }
      }),
      bouton("Actualiser", rafraichir),
    ),
    el(
      "div",
      { class: "reglages-boutons" },
      session?.synchro?.reessayer
        ? bouton("Forcer la synchronisation", () => {
            session.synchro.reessayer();
            toast("Synchronisation relancée", { duree: 2500 });
          })
        : null,
      bouton("Vider le cache de l'interface", async () => {
        try {
          const registrations = (await navigator.serviceWorker?.getRegistrations()) ?? [];
          await Promise.all(registrations.map((r) => r.unregister()));
          for (const nom of (await globalThis.caches?.keys()) ?? [])
            await globalThis.caches.delete(nom);
        } catch {
          // Nothing more to clear.
        }
        location.reload();
      }),
      bouton("Ouvrir la console", async () => {
        if (!(await ouvrirConsole().catch(() => false)))
          toast("Console indisponible ici (utilisez les outils de développement).");
      }),
    ),
    sortie,
    testeurIa(session),
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
