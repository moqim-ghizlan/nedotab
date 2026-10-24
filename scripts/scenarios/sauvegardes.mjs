// V2.7 browser scenario (emulators): automatic backup once synced, a single one for several
// tabs, manual named backup, list in the settings, deletion of a manual one, local mode text.
import { attendre } from "../navigateur.mjs";

const FIRESTORE = "http://127.0.0.1:8080/v1/projects/demo-nedotab/databases/(default)/documents";
async function sauvegardes(uid) {
  const r = await fetch(`${FIRESTORE}/users/${uid}/sauvegardes?pageSize=100`, {
    headers: { authorization: "Bearer owner" },
  });
  const d = await r.json();
  return (d.documents ?? []).map((x) => ({
    type: x.fields.type.stringValue,
    nom: x.fields.nom?.stringValue ?? null,
  }));
}

export async function scenarioSauvegardes({ nav, url, verifier, dossier }) {
  const p = await nav.ouvrir(url);
  await p.sombre(false);
  // Local mode first: the section explains how to get backups
  await p.eval(`document.querySelector(".bouton-reglages").click()`);
  await attendre(300);
  const local = await p.eval(`document.querySelector(".sauvegardes")?.textContent ?? ""`);
  verifier(
    "Sans compte : « Connectez-vous pour activer les sauvegardes automatiques »",
    local.includes("Connectez-vous pour activer les sauvegardes automatiques"),
    local,
  );
  await p.touche("Escape", { vk: 27 });

  await p.eval(
    `chrome.storage.local.set({ "pref:emulateurCompte": "sauvegardes@nedotab.test", etat: { versionSchema: 2, grille: [{ id: "a", type: "site", titre: "Courriel", url: "https://courriel.example", icone: { type: "lettre", couleur: "#2c6b5a" }, creeLe: 0 }, { id: "d", type: "dossier", titre: "Travail", items: [], creeLe: 0 }], reglages: { theme: "auto", fond: { type: "aucun" }, fonds: [] }, reglagesAppareil: {}, ecritPar: "t", majLe: Date.now() } })`,
  );
  await p.aller(url);
  await attendre(400);
  await p.eval(`document.querySelector(".bouton-reglages").click()`);
  await attendre(200);
  await p.eval(`document.querySelector(".bouton-google").click()`);
  await attendre(4500);
  const uid = await p.eval(`__nedotab.compte.lire().profil.uid`);
  let liste = await sauvegardes(uid);
  verifier(
    "Une sauvegarde automatique après la synchronisation",
    liste.filter((s) => s.type === "auto").length === 1,
    JSON.stringify(liste),
  );

  // More tabs within the hour: still one automatic backup
  for (let i = 0; i < 3; i++) await nav.ouvrir(url);
  await attendre(3500);
  liste = await sauvegardes(uid);
  verifier(
    "4 onglets dans l'heure : une seule sauvegarde automatique",
    liste.filter((s) => s.type === "auto").length === 1,
  );

  // Manual named backup from the settings
  await p.premierPlan();
  await p.aller(url);
  await attendre(1500);
  await p.eval(`document.querySelector(".bouton-reglages").click()`);
  await attendre(1500);
  const lignes = await p.eval(`document.querySelectorAll(".liste-sauvegardes .sauvegarde").length`);
  verifier("Réglages : la liste montre la sauvegarde automatique", lignes === 1, `${lignes}`);
  const texte = await p.eval(
    `document.querySelector(".liste-sauvegardes .sauvegarde")?.textContent ?? ""`,
  );
  verifier(
    "Date, appareil et contenu affichés",
    /\d\d\/\d\d\/\d{4} \d\d:\d\d, Chrome, 1 site et 1 dossier/.test(texte),
    texte,
  );
  await p.eval(
    `[...document.querySelectorAll(".sauvegardes button")].find((b) => b.textContent === "Sauvegarder maintenant").click()`,
  );
  await attendre(300);
  await p.eval(`document.getElementById("nom-sauvegarde").focus()`);
  await p.taper("Avant grand rangement");
  await p.touche("Enter", { vk: 13, texte: "\r" });
  await attendre(2500);
  liste = await sauvegardes(uid);
  verifier(
    "Sauvegarde manuelle nommée enregistrée",
    liste.some((s) => s.type === "manuelle" && s.nom === "Avant grand rangement"),
  );
  const premiere = await p.eval(
    `document.querySelector(".liste-sauvegardes .sauvegarde strong")?.textContent`,
  );
  verifier("Visible en tête de liste", premiere === "Avant grand rangement", premiere);
  await p.capture(`${dossier}/sauvegardes.png`);

  // Filter, then delete the manual one
  await p.eval(
    `[...document.querySelectorAll('.sauvegardes [aria-label="Filtre"] button')].find((b) => b.textContent === "Manuelles").click()`,
  );
  await attendre(1500);
  verifier(
    "Filtre « Manuelles »",
    (await p.eval(`document.querySelectorAll(".liste-sauvegardes .sauvegarde").length`)) === 1,
  );
  await p.eval(`document.querySelector(".liste-sauvegardes .sauvegarde button").click()`);
  await attendre(300);
  await p.eval(`document.querySelector("dialog[open] .bouton--principal").click()`);
  await attendre(2000);
  liste = await sauvegardes(uid);
  verifier(
    "Sauvegarde manuelle supprimée après confirmation",
    !liste.some((s) => s.type === "manuelle"),
  );
  verifier("Aucune erreur console (sauvegardes)", p.erreurs.length === 0, p.erreurs.join(" | "));
}
