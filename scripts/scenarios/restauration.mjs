// V2.8 browser scenario (emulators): preview with differences, restore, "Annuler" within
// 10 s, restore later from the "avant restauration" backup, disabled offline.
import { attendre } from "../navigateur.mjs";

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
const ouvrirReglages = async (p) => {
  if (!(await p.eval(`!!document.querySelector(".reglages")`))) {
    await p.eval(`document.querySelector(".bouton-reglages").click()`);
  }
  await attendre(1500);
};
const ligne = (p, texte) =>
  `[...document.querySelectorAll(".liste-sauvegardes:not(.liste-copies) .sauvegarde")].find((l) => l.querySelector("strong").textContent.startsWith(${JSON.stringify(texte)}))`;

export async function scenarioRestauration({ nav, url, verifier, dossier }) {
  const p = await nav.ouvrir(url);
  await p.sombre(false);
  const grille = [
    site("a", "Courriel"),
    site("b", "Cartes"),
    site("c", "Météo"),
    site("d", "Banque"),
    site("e", "Recettes"),
  ];
  await p.eval(
    `chrome.storage.local.set({ "pref:emulateurCompte": "restauration@nedotab.test", etat: { versionSchema: 2, grille: ${JSON.stringify(grille)}, reglages: { theme: "auto", fond: { type: "aucun" }, fonds: [] }, reglagesAppareil: {}, ecritPar: "t", majLe: Date.now() } })`,
  );
  await p.aller(url);
  await attendre(400);
  await p.eval(`document.querySelector(".bouton-reglages").click()`);
  await attendre(200);
  await p.eval(`document.querySelector(".bouton-google").click()`);
  await attendre(4000);

  // Manual backup, then reorganise and delete
  await p.eval(`__nedotab.session.sauvegardes.sauvegarderManuelle("Avant grand rangement")`);
  await p.touche("Escape", { vk: 27 });
  await p.eval(`(() => {
    const s = __nedotab.store;
    s.envoyer({ type: "ELEMENT_SUPPRIMER", id: "a" });
    s.envoyer({ type: "ELEMENT_SUPPRIMER", id: "b" });
    s.envoyer({ type: "ELEMENT_DEPLACER", id: "e", versParentId: null, versIndex: 0 });
  })()`);
  await attendre(2500);
  const reorganise = await titres(p);

  // Preview with differences
  await ouvrirReglages(p);
  await p.eval(`${ligne(p, "Avant grand rangement")}.querySelector("button").click()`);
  await attendre(400);
  const resume = await p.eval(
    `document.querySelector("dialog[open] .apercu-resume")?.textContent ?? ""`,
  );
  verifier("Aperçu : différences avec maintenant", resume.includes("+2 sites"), resume);
  await p.capture(`${dossier}/apercu-sauvegarde.png`);

  // Restore, confirm
  await p.eval(`document.querySelector("dialog[open] .bouton--principal").click()`);
  await attendre(300);
  verifier(
    "Confirmation demandée",
    (
      await p.eval(`document.querySelector("dialog[open] .dialogue-message")?.textContent ?? ""`)
    ).includes("Une copie en sera gardée"),
  );
  await p.eval(`document.querySelector("dialog[open] .bouton--principal").click()`);
  await attendre(1500);
  verifier(
    "Grille restaurée",
    (await titres(p)) === "Courriel,Cartes,Météo,Banque,Recettes",
    await titres(p),
  );
  const toast = await p.eval(
    `[...document.querySelectorAll(".toast")].map((t) => t.textContent).join("|")`,
  );
  verifier(
    "Toast « … restaurée — Annuler »",
    /restaurée/.test(toast) && toast.includes("Annuler"),
    toast,
  );

  // Undo within 10 s
  await p.eval(
    `[...document.querySelectorAll(".toast")].find((t) => t.textContent.includes("restaurée")).querySelector(".toast-action").click()`,
  );
  await attendre(800);
  verifier(
    "Annuler : retour à l'état réorganisé",
    (await titres(p)) === reorganise,
    await titres(p),
  );

  // Restore again, then later from the "avant restauration" backup
  await ouvrirReglages(p);
  await p.eval(`${ligne(p, "Avant grand rangement")}.querySelector("button").click()`);
  await attendre(300);
  await p.eval(`document.querySelector("dialog[open] .bouton--principal").click()`);
  await attendre(300);
  await p.eval(`document.querySelector("dialog[open] .bouton--principal").click()`);
  await attendre(12000); // the toast is gone
  await p.touche("Escape", { vk: 27 });
  await ouvrirReglages(p);
  const avant = await p.eval(
    `(() => { const l = ${ligne(p, "Avant la restauration du")}; return l ? [l.className, l.textContent] : null; })()`,
  );
  verifier(
    "Sauvegarde « Avant la restauration du … » mise en évidence",
    avant && avant[0].includes("sauvegarde--avant"),
    avant?.[1],
  );
  await p.eval(`${ligne(p, "Avant la restauration du")}.querySelector("button").click()`);
  await attendre(300);
  await p.eval(`document.querySelector("dialog[open] .bouton--principal").click()`);
  await attendre(300);
  await p.eval(`document.querySelector("dialog[open] .bouton--principal").click()`);
  await attendre(1500);
  verifier(
    "Plus tard : retour à l'état réorganisé depuis « avant restauration »",
    (await titres(p)) === reorganise,
    await titres(p),
  );

  // Offline: restore disabled with an explanation
  await p.envoyer("Network.enable");
  await p.envoyer("Network.emulateNetworkConditions", {
    offline: true,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
  await attendre(800);
  await p.eval(`${ligne(p, "Avant grand rangement")}?.querySelector("button")?.click()`);
  await attendre(400);
  const horsLigne = await p.eval(
    `({ bouton: !!document.querySelector("dialog[open] .bouton--principal"), texte: document.querySelector("dialog[open]")?.textContent ?? "" })`,
  );
  verifier(
    "Hors ligne : restauration désactivée et expliquée",
    !horsLigne.bouton && horsLigne.texte.includes("indisponible hors ligne"),
    horsLigne.texte.slice(-60),
  );
  await p.envoyer("Network.emulateNetworkConditions", {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
  const autres = p.erreurs.filter((e) => !/Could not reach Cloud Firestore backend/.test(e));
  verifier("Aucune erreur console (restauration)", autres.length === 0, autres.join(" | "));
}
