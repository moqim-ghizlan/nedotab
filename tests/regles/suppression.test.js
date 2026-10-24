import { afterAll, describe, expect, it } from "vitest";
import { etatInitial } from "../../src/core/modele.js";
import * as fb from "../../src/firebase/index.js";

// V2.10: the supprimerMonCompte Cloud Function on the emulators (Auth, Functions, Firestore,
// Storage). AGE_CONNEXION_MAX_S is 3 s here (functions/.env.demo-nedotab).
const FIRESTORE = "http://127.0.0.1:8080/v1/projects/demo-nedotab/databases/(default)/documents";
const STOCKAGE = "http://127.0.0.1:9199/v0/b/demo-nedotab.appspot.com/o";
const proprietaire = { authorization: "Bearer owner" };

const connecter = (nom) =>
  fb.connecter({
    obtenirJeton: async () => ({
      idToken: JSON.stringify({
        sub: `google-${nom}`,
        email: `${nom}@nedotab.test`,
        email_verified: true,
      }),
    }),
  });
const site = (id) => ({ id, type: "site", titre: id, url: `https://${id}.fr`, creeLe: 0 });
const image = () => new Blob([new Uint8Array(64)], { type: "image/webp" });
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

/** Everything stored for `uid`: main document, backups, files. */
async function contenu(uid) {
  const doc = await fetch(`${FIRESTORE}/users/${uid}`, { headers: proprietaire });
  const sauvegardes = await (
    await fetch(`${FIRESTORE}/users/${uid}/sauvegardes`, { headers: proprietaire })
  ).json();
  const fichiers = await (
    await fetch(`${STOCKAGE}?prefix=${encodeURIComponent(`users/${uid}/`)}`, {
      headers: proprietaire,
    })
  ).json();
  return {
    document: doc.status === 200,
    sauvegardes: (sauvegardes.documents ?? []).length,
    fichiers: (fichiers.items ?? []).length,
  };
}

/** A user with a grid, 3 backups and 2 background pictures. */
async function remplir(nom) {
  const { uid } = await connecter(nom);
  const etat = { ...etatInitial(), grille: [site("a"), site("b")] };
  await fb.ecrireDocument(uid, etat, "test", 1);
  for (let i = 0; i < 3; i++)
    await fb.creerSauvegarde(uid, etat, { type: "manuelle", nom: `S${i}` });
  for (const id of ["f1", "f2"]) await fb.envoyerFond(fb.cheminFond(uid, id), image()).promesse;
  return uid;
}

afterAll(() => fb.deconnecter({ obtenirJeton: async () => null, oublierJeton: async () => {} }));

describe("supprimerMonCompte (émulateurs)", () => {
  it("grille, 3 sauvegardes, 2 fonds et compte : tout supprimé ; un autre utilisateur intact", async () => {
    const autre = await remplir("autre-utilisateur");
    const uid = await remplir("a-supprimer");
    expect(await contenu(uid)).toEqual({ document: true, sauvegardes: 3, fichiers: 2 });

    await connecter("a-supprimer"); // recent sign-in, as the interface asks for
    await fb.supprimerMonCompte();
    expect(await contenu(uid)).toEqual({ document: false, sauvegardes: 0, fichiers: 0 });
    // The Auth account is gone: signing in again creates a new account.
    const nouveau = await connecter("a-supprimer");
    expect(nouveau.uid).not.toBe(uid);
    expect(await contenu(autre)).toEqual({ document: true, sauvegardes: 3, fichiers: 2 });
  });

  it("sans être connecté : refusé", async () => {
    await fb.deconnecter({ obtenirJeton: async () => null, oublierJeton: async () => {} });
    await expect(fb.supprimerMonCompte()).rejects.toMatchObject({
      code: "functions/unauthenticated",
    });
  });

  it("connexion trop ancienne : « Reconnectez-vous pour confirmer », rien supprimé", async () => {
    const uid = await remplir("connexion-ancienne");
    await attendre(4500); // > AGE_CONNEXION_MAX_S of the emulators (3 s)
    await expect(fb.supprimerMonCompte()).rejects.toMatchObject({
      code: "functions/failed-precondition",
      message: expect.stringMatching(/^Reconnectez-vous pour confirmer/),
    });
    expect(await contenu(uid)).toEqual({ document: true, sauvegardes: 3, fichiers: 2 });
  });
});
