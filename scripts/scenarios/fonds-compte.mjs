// V2.6 browser scenario (emulators with Storage): account backgrounds library. Upload with
// progress, active everywhere, downloaded once per device, 10 maximum, deletion after the
// undo delay, shown offline from the cache.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { genererImagesTest } from "../generer-images-test.mjs";
import { attendre, lancerChrome } from "../navigateur.mjs";

const STORAGE = "http://127.0.0.1:9199/v0/b/demo-nedotab.appspot.com/o";
async function fichiersStorage(uid) {
  const r = await fetch(`${STORAGE}?prefix=${encodeURIComponent(`users/${uid}/fonds/`)}`, {
    headers: { authorization: "Bearer owner" },
  });
  const d = await r.json();
  // The listing has no size: read each object's metadata.
  return Promise.all(
    (d.items ?? []).map(async (i) => {
      const m = await fetch(`${STORAGE}/${encodeURIComponent(i.name)}`, {
        headers: { authorization: "Bearer owner" },
      }).then((x) => x.json());
      return { nom: i.name, taille: Number(m.size) };
    }),
  );
}

async function connecter(nav, url, email) {
  const p = await nav.ouvrir(url);
  await p.sombre(false);
  await p.eval(`chrome.storage.local.set({ "pref:emulateurCompte": ${JSON.stringify(email)} })`);
  await p.aller(url);
  await attendre(400);
  await p.eval(`document.querySelector(".bouton-reglages").click()`);
  await attendre(200);
  await p.eval(`document.querySelector(".bouton-google").click()`);
  await attendre(3500);
  await p.touche("Escape", { vk: 27 });
  return p;
}
const ouvrirFondImage = async (p) => {
  await p.eval(`document.querySelector(".bouton-reglages").click()`);
  await attendre(300);
  await p.eval(
    `document.querySelector('.reglages [aria-label="Type de fond"] [data-valeur="image"]').click()`,
  );
  await attendre(300);
};
const fondAffiche = (p) =>
  p.eval(`getComputedStyle(document.getElementById("fond")).backgroundImage`);

export async function scenarioFondsCompte({ nav, url, verifier, dossier }) {
  const email = "fonds-compte@nedotab.test";
  const images = genererImagesTest(mkdtempSync(join(tmpdir(), "nedotab-fonds-")));
  const p = await connecter(nav, url, email);
  const uid = await p.eval(
    `chrome.storage.local.get("pref:compte").then((r) => r["pref:compte"].uid)`,
  );

  await ouvrirFondImage(p);
  verifier(
    "Mode compte : bibliothèque « 0 / 10 »",
    (await p.eval(`document.querySelector(".bibliotheque-fonds")?.textContent ?? ""`)).includes(
      "0 / 10 fonds",
    ),
  );
  await p.envoyer("DOM.enable");
  await p.fichiers('.bibliotheque-fonds input[type="file"]', [images.simple]);
  await attendre(5000);
  const fichiers = await fichiersStorage(uid);
  verifier(
    "Fichier dans Storage, dans le bon dossier, < 5 Mo",
    fichiers.length === 1 && fichiers[0].taille < 5 * 1024 * 1024,
    JSON.stringify(fichiers),
  );
  verifier("Fond actif et affiché", (await fondAffiche(p)).startsWith('url("blob:'));
  const etatEnLigne = await p.eval(`__nedotab.store.lire().reglages`);
  verifier(
    "Réglages synchronisés : bibliothèque et fond actif",
    etatEnLigne.fonds.length === 1 && etatEnLigne.fond.id === etatEnLigne.fonds[0].id,
  );
  await p.capture(`${dossier}/bibliotheque-fonds.png`);
  await p.touche("Escape", { vk: 27 });

  // Second computer: the background appears, downloaded once; more tabs download nothing
  const nav2 = await lancerChrome();
  try {
    const id2 = await nav2.chargerExtension();
    const url2 = `chrome-extension://${id2}/newtab.html`;
    const telechargements = [];
    nav2.surEvenement((m) => {
      if (
        m.method === "Network.requestWillBeSent" &&
        /9199\/.*alt=media/.test(m.params.request.url)
      ) {
        telechargements.push(m.params.request.url);
      }
    });
    const q = await connecter(nav2, url2, email);
    await attendre(2500);
    verifier(
      "Second ordinateur : le fond apparaît",
      (await fondAffiche(q)).startsWith('url("blob:'),
    );
    const avant = telechargements.length;
    for (let i = 0; i < 2; i++) {
      const o = await nav2.ouvrir();
      await o.envoyer("Network.enable");
      await o.aller(url2);
      await attendre(1500);
      verifier(
        `Onglet ${i + 2} : fond affiché depuis le cache`,
        (await fondAffiche(o)).startsWith('url("blob:'),
      );
    }
    verifier(
      "Aucun nouveau téléchargement après le premier",
      telechargements.length === avant,
      `${telechargements.length - avant} de plus`,
    );

    // Offline with the background cached: still shown
    const h = await nav2.ouvrir();
    await h.envoyer("Network.enable");
    await h.envoyer("Network.emulateNetworkConditions", {
      offline: true,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
    await h.aller(url2);
    await attendre(1500);
    verifier("Hors ligne : fond en cache affiché", (await fondAffiche(h)).startsWith('url("blob:'));
  } finally {
    await nav2.fermer();
  }

  // 10 maximum: the add button is disabled at 10
  await p.eval(`(() => {
    for (let i = 0; i < 9; i++) __nedotab.store.envoyer({ type: "FOND_AJOUTER", fond: { id: "faux-" + i, chemin: "users/${uid}/fonds/faux-" + i + ".webp", dominante: "#335577", largeur: 10, hauteur: 10, taille: 10, ajouteLe: 1 } });
  })()`);
  await ouvrirFondImage(p);
  const plein = await p.eval(
    `({ texte: document.querySelector(".bibliotheque-fonds").textContent, desactive: document.querySelector('.bibliotheque-fonds input[type="file"]').disabled })`,
  );
  verifier(
    "10 fonds : « 10 / 10 », ajout désactivé",
    plein.texte.includes("10 / 10") && plein.desactive,
    JSON.stringify(plein).slice(0, 160),
  );
  await p.eval(
    `(() => { for (let i = 0; i < 9; i++) __nedotab.store.envoyer({ type: "FOND_SUPPRIMER", id: "faux-" + i }); })()`,
  );
  await attendre(300);

  // Delete the real one: gone from the library at once, from Storage after the undo delay
  await p.eval(`document.querySelector(".vignette-supprimer").click()`);
  await attendre(500);
  verifier(
    "Suppression : retiré de la bibliothèque, fond « aucun »",
    (await p.eval(`__nedotab.store.lire().reglages.fond.type`)) === "aucun",
  );
  verifier(
    "… encore dans Storage pendant le délai d'annulation",
    (await fichiersStorage(uid)).length === 1,
  );
  await attendre(6500);
  verifier("… supprimé de Storage après le délai", (await fichiersStorage(uid)).length === 0);
  verifier("Aucune erreur console (fonds)", p.erreurs.length === 0, p.erreurs.join(" | "));
}
