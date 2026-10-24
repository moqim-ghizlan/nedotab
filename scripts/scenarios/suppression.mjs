// V2.10 browser scenario (emulators, with Functions): account deletion from the settings.
// Explanation, export offered, "SUPPRIMER" typed, recent sign-in, Cloud Function, then this
// device is back in local mode (copy kept on request) and nothing is left on the server.
import { attendre } from "../navigateur.mjs";

const FIRESTORE = "http://127.0.0.1:8080/v1/projects/demo-nedotab/databases/(default)/documents";
const site = (id, titre) => ({
  id,
  type: "site",
  titre,
  url: `https://${id}.example`,
  icone: { type: "lettre", couleur: "#2c6b5a" },
  creeLe: 0,
});

export async function scenarioSuppression({ nav, url, verifier, dossier }) {
  const p = await nav.ouvrir(url);
  await p.sombre(false);
  const grille = [site("a", "Courriel"), site("b", "Cartes")];
  await p.eval(
    `chrome.storage.local.set({ "pref:emulateurCompte": "suppression@nedotab.test", etat: { versionSchema: 2, grille: ${JSON.stringify(grille)}, reglages: { theme: "auto", fond: { type: "aucun" }, fonds: [] }, reglagesAppareil: {}, ecritPar: "t", majLe: Date.now() } })`,
  );
  await p.aller(url);
  await attendre(400);
  await p.eval(`document.querySelector(".bouton-reglages").click()`);
  await attendre(200);
  await p.eval(`document.querySelector(".bouton-google").click()`);
  for (let i = 0; i < 40; i++) {
    await attendre(250);
    if (await p.eval(`__nedotab.synchro.lire().statut === "synchronise"`)) break;
  }
  const uid = await p.eval(`__nedotab.compte.lire().profil.uid`);
  await p.eval(`__nedotab.session.sauvegardes.sauvegarderManuelle("Avant suppression")`);
  const enLigne = async () =>
    (await fetch(`${FIRESTORE}/users/${uid}`, { headers: { authorization: "Bearer owner" } }))
      .status === 200;
  verifier("Compte rempli (document en ligne)", await enLigne());

  // Danger zone, set apart at the bottom of the account section
  await p.eval(`document.querySelector(".reglages-corps").scrollTop = 0`);
  const zone = await p.eval(`document.querySelector(".zone-danger")?.textContent ?? ""`);
  verifier(
    "Zone « Supprimer mon compte » dans la section Compte",
    zone.includes("Supprimer mon compte…"),
    zone,
  );
  await p.eval(
    `[...document.querySelectorAll(".zone-danger button")].find((b) => b.textContent === "Supprimer mon compte…").click()`,
  );
  await attendre(300);
  const dialogue = await p.eval(`document.querySelector("dialog[open]:modal")?.textContent ?? ""`);
  verifier(
    "Explication : ce qui sera supprimé, définitif ; export proposé",
    dialogue.includes("définitivement") && dialogue.includes("Exporter mes données d'abord"),
    dialogue.slice(0, 100),
  );
  const desactive = () =>
    p.eval(`document.querySelector("dialog[open]:modal .bouton--danger").disabled`);
  verifier("« Supprimer définitivement » désactivé sans la saisie", await desactive());
  await p.eval(`document.getElementById("confirmer-suppression").focus()`);
  await p.taper("supprimer");
  verifier("Saisie incorrecte (minuscules) : toujours désactivé", await desactive());
  await p.eval(`document.getElementById("confirmer-suppression").select()`);
  await p.taper("SUPPRIMER");
  verifier("« SUPPRIMER » tapé : bouton activé", !(await desactive()));
  await p.eval(`document.getElementById("garder-apres-suppression").click()`);
  await p.capture(`${dossier}/suppression-compte.png`);
  await p.eval(`document.querySelector("dialog[open]:modal .bouton--danger").click()`);

  // Deleted on the server, page reloaded in local mode with a message
  let supprime = false;
  for (let i = 0; i < 40 && !supprime; i++) {
    await attendre(250);
    supprime = !(await enLigne());
  }
  verifier("Document du compte supprimé en ligne", supprime);
  await attendre(2500);
  const sauvegardes = await (
    await fetch(`${FIRESTORE}/users/${uid}/sauvegardes`, {
      headers: { authorization: "Bearer owner" },
    })
  ).json();
  verifier("Sauvegardes supprimées", !(sauvegardes.documents ?? []).length);
  const toast = await p.eval(
    `[...document.querySelectorAll(".toast")].map((t) => t.textContent).join("|")`,
  );
  verifier(
    "Message « Votre compte et toutes ses données ont été supprimés »",
    toast.includes("ont été supprimés"),
    toast,
  );
  verifier(
    "Copie gardée à la demande : les sites restent sur cet ordinateur",
    (await p.eval(
      `[...document.querySelectorAll(".tuile[data-id] .tuile-titre")].map((t) => t.textContent).join()`,
    )) === "Courriel,Cartes",
  );
  const local = await p.eval(
    `chrome.storage.local.get(null).then((t) => ({ compte: t["pref:compte"] ?? null, synchro: t["pref:synchro"] ?? null, copies: Object.keys(t).filter((k) => k.startsWith("copieAvantSynchro:")).length }))`,
  );
  verifier(
    "Cet ordinateur : déconnecté, plus de synchronisation ni de copie liée au compte",
    !local.compte?.connecte && !local.synchro?.uid && local.copies === 0,
    JSON.stringify(local),
  );
  await p.eval(`document.querySelector(".bouton-reglages").click()`);
  await attendre(300);
  verifier(
    "Réglages : proposer de se connecter à nouveau",
    await p.eval(`!!document.querySelector(".bouton-google")`),
  );
  const erreurs = p.erreurs.filter((e) => !/Could not reach Cloud Firestore backend/.test(e));
  verifier("Aucune erreur console (suppression)", erreurs.length === 0, erreurs.join(" | "));
}
