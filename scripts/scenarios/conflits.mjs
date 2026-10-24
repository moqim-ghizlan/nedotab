// V2.9 browser scenario (emulators): two computers on the same account, the first offline.
// Its changes are replayed on the server's version when the network is back: nothing done
// on the second one is lost; an operation that no longer applies is reported. Synced and
// device-only settings; queue left by a tab closed offline, sent by the next tab.
import { attendre, lancerChrome } from "../navigateur.mjs";

const FIRESTORE = "http://127.0.0.1:8080/v1/projects/demo-nedotab/databases/(default)/documents";
async function enLigne(uid) {
  const r = await fetch(`${FIRESTORE}/users/${uid}`, {
    headers: { authorization: "Bearer owner" },
  });
  const d = await r.json();
  return {
    titres: (d.fields?.grille?.arrayValue?.values ?? []).map(
      (v) => v.mapValue.fields.titre.stringValue,
    ),
    reglages: Object.keys(d.fields?.reglages?.mapValue?.fields ?? {}),
    theme: d.fields?.reglages?.mapValue?.fields?.theme?.stringValue,
  };
}
const site = (id, titre) => ({
  id,
  type: "site",
  titre,
  url: `https://${id}.example`,
  icone: { type: "lettre", couleur: "#2c6b5a" },
  creeLe: 0,
});
const titres = (p) =>
  p.eval(
    `[...document.querySelectorAll(".grille:not(.grille--dossier) > li > .tuile[data-id] .tuile-titre")].map((t) => t.textContent).join(",")`,
  );
const envoyer = (p, actions) =>
  p.eval(`(() => { for (const a of ${JSON.stringify(actions)}) __nedotab.store.envoyer(a); })()`);
async function reseau(p, actif) {
  await p.envoyer("Network.enable");
  await p.envoyer("Network.emulateNetworkConditions", {
    offline: !actif,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
}
async function ordinateur(nav, url, grille, email) {
  const p = await nav.ouvrir(url);
  await p.sombre(false);
  await p.eval(
    `chrome.storage.local.set({ "pref:emulateurCompte": ${JSON.stringify(email)}, etat: { versionSchema: 2, grille: ${JSON.stringify(grille)}, reglages: { theme: "auto", fond: { type: "aucun" }, fonds: [] }, reglagesAppareil: {}, ecritPar: "t", majLe: Date.now() } })`,
  );
  await p.aller(url);
  await attendre(400);
  await p.eval(`document.querySelector(".bouton-reglages").click()`);
  await attendre(200);
  await p.eval(`document.querySelector(".bouton-google").click()`);
  // Signed in and listening to the account (the first sign-in on the emulators is slow).
  for (let i = 0; i < 60; i++) {
    await attendre(250);
    if (await p.eval(`__nedotab.synchro.lire().statut === "synchronise"`)) break;
  }
  await attendre(500);
  await p.touche("Escape", { vk: 27 });
  return p;
}
async function attendreQue(f, ms = 8000) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    if (await f()) return true;
    await attendre(250);
  }
  return false;
}

export async function scenarioConflits({ nav, url, verifier, dossier }) {
  const email = "conflits@nedotab.test";
  const depart = [
    site("a", "Courriel"),
    site("b", "Cartes"),
    site("c", "Météo"),
    site("d", "Banque"),
  ];
  const p = await ordinateur(nav, url, depart, email);
  const uid = await p.eval(`__nedotab.compte.lire().profil.uid`);
  const nav2 = await lancerChrome();
  try {
    const id2 = await nav2.chargerExtension();
    const url2 = `chrome-extension://${id2}/newtab.html`;
    const q = await ordinateur(nav2, url2, [], email); // empty: takes the account's grid
    verifier(
      "Deux ordinateurs sur le même compte",
      (await titres(q)) === "Courriel,Cartes,Météo,Banque",
      await titres(q),
    );

    // 1. Computer 1 offline: 3 sites added, "Banque" renamed. Computer 2: 2 renamed, 1 deleted.
    await p.premierPlan();
    await reseau(p, false);
    await attendre(500);
    await envoyer(p, [
      { type: "SITE_AJOUTER", site: site("n1", "Recettes") },
      { type: "SITE_AJOUTER", site: site("n2", "Musique") },
      { type: "SITE_AJOUTER", site: site("n3", "Journal") },
      { type: "SITE_MODIFIER", id: "d", changements: { titre: "Ma banque" } },
    ]);
    await attendre(2500);
    verifier(
      "Hors ligne : rien n'est envoyé (pas de transaction sans réseau)",
      (await enLigne(uid)).titres.join() === "Courriel,Cartes,Météo,Banque",
    );
    const enAttente = await p.eval(
      `chrome.storage.local.get(null).then((t) => Object.entries(t).filter(([c]) => c.startsWith("operationsEnAttente:")).map(([, v]) => v.file.length))`,
    );
    verifier(
      "File d'opérations persistée dans chrome.storage.local",
      enAttente.includes(4),
      JSON.stringify(enAttente),
    );
    await q.premierPlan();
    await envoyer(q, [
      { type: "SITE_MODIFIER", id: "b", changements: { titre: "Plans" } },
      { type: "SITE_MODIFIER", id: "c", changements: { titre: "Ciel" } },
      { type: "ELEMENT_SUPPRIMER", id: "d" },
    ]);
    verifier(
      "Ordinateur 2 : ses changements sont en ligne",
      await attendreQue(async () => (await enLigne(uid)).titres.join() === "Courriel,Plans,Ciel"),
    );

    // 2. Network back on computer 1: replayed on the server's version.
    await p.premierPlan();
    await reseau(p, true);
    const attendu = "Courriel,Plans,Ciel,Recettes,Musique,Journal";
    verifier(
      "Retour du réseau : tout est cohérent en ligne",
      await attendreQue(async () => (await enLigne(uid)).titres.join() === attendu, 15000),
      (await enLigne(uid)).titres.join(),
    );
    verifier(
      "Ordinateur 1 : les deux séries de changements",
      await attendreQue(async () => (await titres(p)) === attendu),
      await titres(p),
    );
    verifier(
      "Ordinateur 2 : les deux séries de changements",
      await attendreQue(async () => (await titres(q)) === attendu),
      await titres(q),
    );
    const toast = await p.eval(
      `[...document.querySelectorAll(".toast")].map((t) => t.textContent).join("|")`,
    );
    verifier(
      "Toast « 1 modification n'a pas pu être appliquée … » avec « Détails »",
      toast.includes("1 modification n'a pas pu être appliquée") && toast.includes("Détails"),
      toast,
    );
    await p.eval(
      `[...document.querySelectorAll(".toast")].find((t) => t.textContent.includes("pas pu")).querySelector(".toast-action").click()`,
    );
    await attendre(300);
    const details = await p.eval(`document.querySelector("dialog[open]")?.textContent ?? ""`);
    verifier(
      "Détails : « Renommer « Banque » → ignoré, site supprimé ailleurs »",
      details.includes("Renommer « Banque » → ignoré, site supprimé ailleurs"),
      details,
    );
    await p.capture(`${dossier}/conflit-details.png`);
    await p.eval(`document.querySelector("dialog[open] .bouton--principal").click()`);
    await attendre(200);

    // 3. Synced settings vs device-only ones
    await q.premierPlan();
    await envoyer(q, [{ type: "REGLAGES_MODIFIER", changements: { theme: "sombre" } }]);
    verifier(
      "Thème changé sur l'ordinateur 2 → change sur l'ordinateur 1",
      await attendreQue(() => p.eval(`__nedotab.store.lire().reglages.theme === "sombre"`)),
    );
    await p.premierPlan();
    await p.eval(`document.querySelector(".bouton-reglages").click()`);
    await attendre(300);
    const mention = await p.eval(
      `[...document.querySelectorAll(".mention-appareil")].map((m) => m.parentElement.textContent).join("|")`,
    );
    verifier(
      "Réglages : « Sur cet appareil uniquement » à côté des réglages locaux",
      mention.includes("Colonnes") && mention.includes("Journal de débogage"),
      mention,
    );
    await p.eval(
      `[...document.querySelectorAll('[aria-label="Colonnes"] .segment')].find((b) => b.textContent === "5").click()`,
    );
    await attendre(300);
    const colonnes = await p.eval(
      `getComputedStyle(document.querySelector(".grille:not(.grille--dossier)")).gridTemplateColumns.split(" ").length`,
    );
    verifier("Colonnes forcées à 5 sur l'ordinateur 1", colonnes === 5, `${colonnes}`);
    await p.capture(`${dossier}/colonnes-forcees.png`);
    await p.touche("Escape", { vk: 27 });
    await attendre(2500);
    verifier(
      "Colonnes : restent locales (rien en ligne, ordinateur 2 automatique)",
      !(await enLigne(uid)).reglages.includes("colonnes") &&
        !(await q.eval(`document.documentElement.dataset.colonnes ?? null`)),
    );

    // 4. Chrome closed offline with pending operations, reopened online → sent.
    await reseau(p, false);
    await attendre(400);
    await envoyer(p, [{ type: "SITE_AJOUTER", site: site("n4", "Cinéma") }]);
    await attendre(300);
    await p.aller("about:blank"); // the tab is closed before any network
    await reseau(p, true);
    await attendre(800);
    await p.aller(url);
    verifier(
      "Fermé hors ligne puis rouvert : les opérations en attente sont envoyées",
      await attendreQue(async () => (await enLigne(uid)).titres.includes("Cinéma"), 12000),
      (await enLigne(uid)).titres.join(),
    );
    verifier(
      "… et arrivent sur l'ordinateur 2",
      await attendreQue(async () => (await titres(q)).endsWith("Cinéma")),
    );
    const erreurs = [...p.erreurs, ...q.erreurs].filter(
      (e) => !/Could not reach Cloud Firestore backend|ERR_INTERNET_DISCONNECTED/.test(e),
    );
    verifier("Aucune erreur console (conflits)", erreurs.length === 0, erreurs.join(" | "));
  } finally {
    await nav2.fermer();
  }
}
