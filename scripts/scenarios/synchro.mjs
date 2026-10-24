// V2.3 browser scenario (extension built with VITE_UTILISER_EMULATEURS=true, Auth and
// Firestore emulators running): first synchronisation from two "computers" (two fresh
// Chrome profiles) on the same test account.
import { attendre, lancerChrome } from "../navigateur.mjs";

const site = (id, titre, url) => ({
  id,
  type: "site",
  titre,
  url,
  icone: { type: "lettre", couleur: "#2c6b5a" },
  creeLe: 0,
});

const FIRESTORE = "http://127.0.0.1:8080/v1/projects/demo-nedotab/databases/(default)/documents";
async function documentEnLigne(uid) {
  const r = await fetch(`${FIRESTORE}/users/${uid}`, {
    headers: { authorization: "Bearer owner" },
  });
  return r.ok ? r.json() : null;
}
const titresEnLigne = (doc) =>
  (doc?.fields?.grille?.arrayValue?.values ?? []).map((v) => v.mapValue.fields.titre.stringValue);

async function ouvrirAvec(nav, url, grille) {
  const p = await nav.ouvrir(url);
  await p.sombre(false);
  await p.eval(
    `chrome.storage.local.set({ etat: { versionSchema: 2, grille: ${JSON.stringify(grille)}, reglages: { theme: "auto", fond: { type: "aucun" } }, reglagesAppareil: {}, ecritPar: "test", majLe: Date.now() } })`,
  );
  await p.aller(url);
  await attendre(400);
  return p;
}

async function seConnecter(p) {
  await p.eval(`document.querySelector(".bouton-reglages").click()`);
  await attendre(200);
  await p.eval(`document.querySelector(".bouton-google").click()`);
}

export async function scenarioSynchro({ nav, url, verifier, dossier }) {
  // Computer 1: three local sites, account still empty → sent
  const p = await ouvrirAvec(nav, url, [
    site("a", "Courriel", "https://courriel.example"),
    site("b", "Cartes", "https://cartes.example"),
    site("c", "Météo", "https://meteo.example"),
  ]);
  await seConnecter(p);
  await attendre(3500);
  const toast1 = await p.eval(
    `[...document.querySelectorAll(".toast")].map((t) => t.textContent).join("|")`,
  );
  verifier(
    "Compte vide : « Vos 3 sites sont maintenant sur votre compte »",
    toast1.includes("Vos 3 sites sont maintenant sur votre compte"),
    toast1,
  );
  const uid = await p.eval(
    `chrome.storage.local.get("pref:compte").then((r) => r["pref:compte"].uid)`,
  );
  let doc = await documentEnLigne(uid);
  verifier(
    "Firestore : les 3 sites sont en ligne",
    titresEnLigne(doc).join() === "Courriel,Cartes,Météo",
    titresEnLigne(doc).join(),
  );
  verifier(
    "Firestore : uniquement les champs autorisés",
    Object.keys(doc.fields).sort().join() === "grille,majLe,majPar,reglages,revision,versionSchema",
    Object.keys(doc.fields).join(),
  );
  const statut = await p.eval(`document.querySelector(".compte")?.textContent ?? ""`);
  verifier(
    "Réglages : synchronisation activée",
    statut.includes("Synchronisation activée"),
    statut,
  );
  await p.capture(`${dossier}/synchro-activee.png`);

  // A local change is written online ~1.5 s later
  await p.touche("Escape", { vk: 27 });
  await p.eval(
    `[...document.querySelectorAll("[data-action='ajouter']")].find((b) => b.offsetParent).click(); [...document.querySelectorAll(".menu-entree")].find((b) => b.textContent === "Ajouter un site").click()`,
  );
  await attendre(200);
  await p.taper("recettes.example");
  await p.touche("Enter", { vk: 13, texte: "\r" });
  await attendre(3000);
  doc = await documentEnLigne(uid);
  verifier(
    "Modification locale envoyée en ligne",
    titresEnLigne(doc).length === 4,
    titresEnLigne(doc).join(),
  );
  verifier("Aucune erreur console (ordinateur 1)", p.erreurs.length === 0, p.erreurs.join(" | "));

  // Computer 2 (fresh profile): two local sites, one already in the account → choice
  const nav2 = await lancerChrome();
  try {
    const id2 = await nav2.chargerExtension();
    const url2 = `chrome-extension://${id2}/newtab.html`;
    const q = await ouvrirAvec(nav2, url2, [
      site("x", "Cartes (doublon)", "https://www.cartes.example/"),
      site("y", "Banque", "https://banque.example"),
    ]);
    await seConnecter(q);
    await attendre(3000);
    const dialogue = await q.eval(
      `document.querySelector("dialog[open] .dialogue-titre")?.textContent ?? ""`,
    );
    verifier(
      "Second ordinateur : fenêtre de choix",
      dialogue === "Des sites existent déjà sur votre compte",
      dialogue,
    );
    const cotes = await q.eval(
      `[...document.querySelectorAll(".choix-cote")].map((c) => c.textContent).join(" | ")`,
    );
    verifier(
      "Chiffres concrets des deux côtés",
      cotes.includes("4 sites") && cotes.includes("2 sites"),
      cotes,
    );
    verifier(
      "« Fusionner » mis en avant",
      (await q.eval(`document.querySelector("dialog[open] .bouton--principal")?.textContent`)) ===
        "Fusionner les deux",
    );
    await q.capture(`${dossier}/choix-premiere-synchro.png`);
    await q.eval(`document.querySelector("dialog[open] .bouton--principal").click()`);
    await attendre(3000);
    const titres = await q.eval(
      `[...document.querySelectorAll(".grille:not(.grille--dossier) > li > .tuile[data-id] .tuile-titre")].map((t) => t.textContent)`,
    );
    verifier(
      "Fusion : sites du compte puis dossier « Importé de cet ordinateur »",
      titres.slice(0, 4).join() === "Courriel,Cartes,Météo,recettes.example" &&
        /^Importé de cet ordinateur/.test(titres[4]),
      titres.join(),
    );
    const importe = await q.eval(
      `document.querySelector(".grille:not(.grille--dossier) > li:nth-child(5) .tuile").getAttribute("aria-label")`,
    );
    verifier(
      "Doublon non recopié (seul Banque est importé)",
      importe.endsWith("1 élément"),
      importe,
    );
    doc = await documentEnLigne(uid);
    verifier("Résultat de la fusion enregistré en ligne", titresEnLigne(doc).length === 5);

    // Sign-out without keeping a copy, then restore the copy
    await q.eval(
      `[...document.querySelectorAll(".compte button")].find((b) => b.textContent === "Se déconnecter").click()`,
    );
    await attendre(300);
    await q.eval(
      `[...document.querySelectorAll("dialog[open] button")].find((b) => b.textContent.startsWith("Non")).click()`,
    );
    await attendre(1500);
    verifier(
      "Déconnexion « Non » : grille vide",
      (await q.eval(`document.querySelectorAll(".tuile--site, .tuile--dossier").length`)) === 0,
    );
    // The page reloads after a sign-out without copy: open the settings again.
    await q.eval(`document.querySelector(".bouton-reglages").click()`);
    await attendre(300);
    await attendre(200);
    verifier(
      "Déconnecté : la section propose de se connecter",
      (await q.eval(`document.querySelector(".compte").textContent`)).includes(
        "Se connecter avec Google",
      ),
    );
    verifier("Aucune erreur console (ordinateur 2)", q.erreurs.length === 0, q.erreurs.join(" | "));
  } finally {
    await nav2.fermer();
  }
}
