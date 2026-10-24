// V2.4 browser scenario (emulators): two computers on the same account; changes on one show
// on the other within seconds; intense reorganising costs few writes (counted with the
// document's revision, +1 per write); several tabs, one write; write on page close.
import { attendre, lancerChrome } from "../navigateur.mjs";

const FIRESTORE = "http://127.0.0.1:8080/v1/projects/demo-nedotab/databases/(default)/documents";
async function enLigne(uid) {
  const r = await fetch(`${FIRESTORE}/users/${uid}`, {
    headers: { authorization: "Bearer owner" },
  });
  const d = await r.json();
  return {
    revision: Number(d.fields?.revision?.integerValue ?? 0),
    titres: (d.fields?.grille?.arrayValue?.values ?? []).map(
      (v) => v.mapValue.fields.titre.stringValue,
    ),
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

async function ordinateur(nav, url, grille, emailDeTest) {
  const p = await nav.ouvrir(url);
  await p.sombre(false);
  await p.eval(
    `chrome.storage.local.set({ "pref:emulateurCompte": ${JSON.stringify(emailDeTest)}, etat: { versionSchema: 2, grille: ${JSON.stringify(grille)}, reglages: { theme: "auto", fond: { type: "aucun" } }, reglagesAppareil: {}, ecritPar: "t", majLe: Date.now() } })`,
  );
  await p.aller(url);
  await attendre(400);
  await p.eval(`document.querySelector(".bouton-reglages").click()`);
  await attendre(200);
  await p.eval(`document.querySelector(".bouton-google").click()`);
  await attendre(3500);
  await p.touche("Escape", { vk: 27 });
  return p;
}
const titres = (p) =>
  p.eval(
    `[...document.querySelectorAll(".grille:not(.grille--dossier) > li > .tuile[data-id] .tuile-titre")].map((t) => t.textContent)`,
  );

export async function scenarioTempsReel({ nav, url, verifier, dossier }) {
  const email = "temps-reel@nedotab.test";
  const p = await ordinateur(
    nav,
    url,
    [site("a", "Courriel"), site("b", "Cartes"), site("c", "Météo")],
    email,
  );
  const uid = await p.eval(
    `chrome.storage.local.get("pref:compte").then((r) => r["pref:compte"].uid)`,
  );
  const nav2 = await lancerChrome();
  try {
    const id2 = await nav2.chargerExtension();
    const q = await ordinateur(nav2, `chrome-extension://${id2}/newtab.html`, [], email);
    verifier(
      "Second ordinateur : grille récupérée",
      (await titres(q)).join() === "Courriel,Cartes,Météo",
      (await titres(q)).join(),
    );
    verifier(
      "Indicateur ✓ synchronisé",
      (await q.eval(`document.querySelector(".indicateur-synchro")?.textContent`)) === "✓",
    );

    // Add, move, delete on computer 1 → visible on computer 2
    const attendreSur = async (page, attendu, delai = 6000) => {
      const debut = Date.now();
      while (Date.now() - debut < delai) {
        if ((await titres(page)).join() === attendu) return Date.now() - debut;
        await attendre(150);
      }
      return null;
    };
    await p.eval(
      `[...document.querySelectorAll("[data-action='ajouter']")].find((b) => b.offsetParent).click(); [...document.querySelectorAll(".menu-entree")].find((b) => b.textContent === "Ajouter un site").click()`,
    );
    await attendre(150);
    await p.taper("banque.example");
    await p.touche("Enter", { vk: 13, texte: "\r" });
    let duree = await attendreSur(q, "Courriel,Cartes,Météo,banque.example");
    verifier(
      "Ajout visible sur l'autre ordinateur",
      duree !== null,
      `${duree} ms (dont 1,5 s de regroupement)`,
    );
    await p.eval(`document.querySelector('.tuile[data-id="a"]').focus()`);
    await p.touche("ArrowRight", { vk: 39, modifiers: 1 });
    duree = await attendreSur(q, "Cartes,Courriel,Météo,banque.example");
    verifier("Déplacement visible sur l'autre ordinateur", duree !== null, `${duree} ms`);
    await p.eval(`document.querySelector('.tuile[data-id="c"]').focus()`);
    await p.touche("Delete", { vk: 46 });
    duree = await attendreSur(q, "Cartes,Courriel,banque.example");
    verifier("Suppression visible sur l'autre ordinateur", duree !== null, `${duree} ms`);
    await q.capture(`${dossier}/second-ordinateur.png`);

    // Intense reorganising for ~20 s: few writes
    const avant = (await enLigne(uid)).revision;
    const debut = Date.now();
    let mouvements = 0;
    while (Date.now() - debut < 20000) {
      await p.eval(`document.querySelector(".tuile--site").focus()`);
      await p.touche("ArrowRight", { vk: 39, modifiers: 1 });
      mouvements++;
      await attendre(120);
    }
    await attendre(2500);
    const ecritures = (await enLigne(uid)).revision - avant;
    verifier(
      "Réorganisation intense : moins de 10 écritures",
      ecritures < 10,
      `${mouvements} mouvements en 20 s → ${ecritures} écriture(s)`,
    );
    const final = (await titres(p)).join();
    verifier(
      "Les deux ordinateurs finissent identiques",
      (await attendreSur(q, final)) !== null,
      final,
    );

    // Several tabs on computer 2: one write, all updated. The emulator speaks HTTP/1.1 and
    // Chrome allows 6 connections per host, each tab keeping some open: 3 tabs here (the
    // real Firestore uses HTTP/2, without this limit).
    const onglets = [];
    for (let i = 0; i < 2; i++) {
      onglets.push(await nav2.ouvrir(`chrome-extension://${id2}/newtab.html`));
    }
    await attendre(1500);
    const avantOnglets = (await enLigne(uid)).revision;
    await q.premierPlan();
    await q.eval(`document.querySelector(".tuile--site").focus()`);
    await q.touche("ArrowRight", { vk: 39, modifiers: 1 });
    await attendre(3500);
    const attenduOnglets = (await titres(q)).join();
    let identiques = 0;
    for (const o of onglets) if ((await titres(o)).join() === attenduOnglets) identiques++;
    verifier("3 onglets : tous à jour", identiques === 2, `${identiques}/2`);
    verifier(
      "3 onglets : une seule écriture",
      (await enLigne(uid)).revision - avantOnglets === 1,
      `${(await enLigne(uid)).revision - avantOnglets}`,
    );

    // Close (navigate away) 0.5 s after a change: still written online
    await p.premierPlan();
    await p.eval(`document.querySelector(".tuile--site").focus()`);
    await p.touche("Delete", { vk: 46 });
    const restant = (await titres(p)).join();
    await attendre(500);
    await p.aller("about:blank");
    await attendre(2000);
    // The write started while closing may not reach the server; it is sent at the next
    // start at the latest, before the (older) online state is listened to.
    await p.aller(url);
    await attendre(3500);
    verifier(
      "Fermé 0,5 s après une modification : envoyée au plus tard à la réouverture",
      (await enLigne(uid)).titres.join() === restant,
      `en ligne : ${(await enLigne(uid)).titres.join()} / attendu : ${restant}`,
    );
    verifier("La grille rouverte a gardé la modification", (await titres(p)).join() === restant);
    verifier("Aucune erreur console (temps réel)", q.erreurs.length === 0, q.erreurs.join(" | "));
  } finally {
    await nav2.fermer();
  }
}
