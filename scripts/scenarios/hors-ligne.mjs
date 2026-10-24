// V2.5 browser scenario (emulators): offline use in account mode. Changes made offline are
// kept, survive closing the tab, and are sent when the network is back; offline badge;
// sign-out warning; several tabs share Firestore's cache without "failed-precondition".
import { attendre } from "../navigateur.mjs";

const FIRESTORE = "http://127.0.0.1:8080/v1/projects/demo-nedotab/databases/(default)/documents";
async function titresEnLigne(uid) {
  const r = await fetch(`${FIRESTORE}/users/${uid}`, {
    headers: { authorization: "Bearer owner" },
  });
  const d = await r.json();
  return (d.fields?.grille?.arrayValue?.values ?? []).map(
    (v) => v.mapValue.fields.titre.stringValue,
  );
}
const titres = (p) =>
  p.eval(
    `[...document.querySelectorAll(".grille:not(.grille--dossier) > li > .tuile[data-id] .tuile-titre")].map((t) => t.textContent)`,
  );
const indicateur = (p) =>
  p.eval(`document.querySelector(".indicateur-synchro")?.dataset.statut ?? null`);

async function horsLigne(p, actif) {
  await p.envoyer("Network.enable");
  await p.envoyer("Network.emulateNetworkConditions", {
    offline: actif,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
}

async function ajouter(p, adresse) {
  await p.eval(
    `[...document.querySelectorAll("[data-action='ajouter']")].find((b) => b.offsetParent).click(); [...document.querySelectorAll(".menu-entree")].find((b) => b.textContent === "Ajouter un site").click()`,
  );
  await attendre(150);
  await p.taper(adresse);
  await p.touche("Enter", { vk: 13, texte: "\r" });
  await attendre(300);
}

export async function scenarioHorsLigne({ nav, url, verifier, dossier }) {
  const p = await nav.ouvrir(url);
  await p.sombre(false);
  await p.eval(
    `chrome.storage.local.set({ "pref:emulateurCompte": "hors-ligne@nedotab.test", etat: { versionSchema: 2, grille: [{ id: "a", type: "site", titre: "Courriel", url: "https://courriel.example", icone: { type: "lettre", couleur: "#2c6b5a" }, creeLe: 0 }, { id: "b", type: "site", titre: "Cartes", url: "https://cartes.example", icone: { type: "lettre", couleur: "#2c6b5a" }, creeLe: 0 }], reglages: { theme: "auto", fond: { type: "aucun" } }, reglagesAppareil: {}, ecritPar: "t", majLe: Date.now() } })`,
  );
  await p.aller(url);
  await attendre(400);
  await p.eval(`document.querySelector(".bouton-reglages").click()`);
  await attendre(200);
  await p.eval(`document.querySelector(".bouton-google").click()`);
  await attendre(3500);
  await p.touche("Escape", { vk: 27 });
  const uid = await p.eval(
    `chrome.storage.local.get("pref:compte").then((r) => r["pref:compte"].uid)`,
  );
  // The first snapshot comes from the cache: wait for the server's answer (at most 10 s).
  for (let i = 0; i < 40 && (await indicateur(p)) !== "synchronise"; i++) await attendre(250);
  verifier("Connecté et synchronisé", (await indicateur(p)) === "synchronise", await indicateur(p));

  // Offline: badge, changes kept locally
  await horsLigne(p, true);
  await attendre(500);
  verifier("Coupure réseau : indicateur « hors ligne »", (await indicateur(p)) === "hors-ligne");
  const titre = await p.eval(`document.querySelector(".indicateur-synchro").title`);
  verifier(
    "Message clair, pas d'erreur rouge",
    titre.startsWith("Hors ligne — vos modifications seront envoyées"),
    titre,
  );
  for (const s of ["banque.example", "meteo.example", "recettes.example"]) await ajouter(p, s);
  await p.eval(`document.querySelector('.tuile[data-id="a"]').focus()`);
  await p.touche("End", { vk: 35, modifiers: 1 });
  await p.eval(`document.querySelector('.tuile[data-id="b"]').focus()`);
  await p.touche("ArrowRight", { vk: 39, modifiers: 1 });
  await attendre(2500); // the writes are handed to Firestore's offline queue
  const attendu = (await titres(p)).join();
  verifier(
    "Hors ligne : rien n'est encore sur le serveur",
    (await titresEnLigne(uid)).length === 2,
  );
  await p.capture(`${dossier}/hors-ligne.png`);

  // Sign-out while offline: warning about unsent changes
  await p.eval(`document.querySelector(".bouton-reglages").click()`);
  await attendre(200);
  await p.eval(
    `[...document.querySelectorAll(".compte button")].find((b) => b.textContent === "Se déconnecter").click()`,
  );
  await attendre(300);
  const avertissement = await p.eval(
    `document.querySelector("dialog[open] .dialogue-message")?.textContent ?? ""`,
  );
  verifier(
    "Déconnexion hors ligne : avertissement",
    avertissement.includes("n'ont pas encore été envoyées"),
    avertissement,
  );
  await p.eval(
    `[...document.querySelectorAll("dialog[open] button")].find((b) => b.textContent === "Annuler").click()`,
  );
  await attendre(200);
  await p.touche("Escape", { vk: 27 });

  // Close the tab while offline, reopen offline: the changes are still there
  await nav.envoyer("Target.closeTarget", { targetId: p.targetId });
  await attendre(500);
  const q = await nav.ouvrir();
  await horsLigne(q, true);
  await q.aller(url);
  await attendre(1500);
  verifier(
    "Rouvert hors ligne : modifications visibles",
    (await titres(q)).join() === attendu,
    (await titres(q)).join(),
  );
  verifier(
    "Rouvert hors ligne : indicateur « hors ligne »",
    (await indicateur(q)) === "hors-ligne",
  );

  // Network back: sent, then ✓
  await horsLigne(q, false);
  let synchronise = false;
  for (let i = 0; i < 40 && !synchronise; i++) {
    await attendre(250);
    synchronise = (await titresEnLigne(uid)).join() === attendu;
  }
  verifier(
    "Retour du réseau : les modifications arrivent sur le serveur",
    synchronise,
    (await titresEnLigne(uid)).join(),
  );
  await attendre(1500);
  verifier(
    "Retour du réseau : indicateur ✓",
    (await indicateur(q)) === "synchronise",
    await indicateur(q),
  );

  // Four tabs at once: shared cache, no "failed-precondition"
  const onglets = [];
  for (let i = 0; i < 3; i++) onglets.push(await nav.ouvrir(url));
  await attendre(3000);
  const erreurs = [q, ...onglets]
    .flatMap((o) => o.erreurs)
    .filter((e) => /failed-precondition/i.test(e));
  verifier(
    "4 onglets : aucune erreur « failed-precondition »",
    erreurs.length === 0,
    erreurs.join(" | "),
  );
  // While offline, Firestore logs that the backend is unreachable: expected here.
  const autres = q.erreurs.filter((e) => !/Could not reach Cloud Firestore backend/.test(e));
  verifier("Aucune autre erreur console (hors ligne)", autres.length === 0, autres.join(" | "));
}
