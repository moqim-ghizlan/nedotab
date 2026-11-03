import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as fb from "../../src/firebase/index.js";
import {
  chiffrerElement,
  chiffrerFichier,
  creerCoffre,
  dechiffrerElement,
  dechiffrerFichier,
} from "../../src/core/coffre.js";

// V4.25 : le module d'envoi (src/firebase/espacePartageFichiers.js) contre les émulateurs
// Auth, Firestore et Storage : un seul chemin d'écriture, jamais d'orphelin.
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
const fichier = (nom, octets, type = "application/pdf") =>
  new File([new Uint8Array(octets)], nom, { type });

async function contenu(uid) {
  const el = await (
    await fetch(`${FIRESTORE}/users/${uid}/espacePartage`, { headers: proprietaire })
  ).json();
  const meta = await (
    await fetch(`${FIRESTORE}/users/${uid}/espacePartageMeta/usage`, { headers: proprietaire })
  ).json();
  const st = await (
    await fetch(`${STOCKAGE}?prefix=${encodeURIComponent(`partages/${uid}/`)}`, {
      headers: proprietaire,
    })
  ).json();
  return {
    elements: (el.documents ?? []).length,
    octets: Number(meta.fields?.octets?.integerValue ?? 0),
    nb: Number(meta.fields?.nb?.integerValue ?? 0),
    fichiers: (st.items ?? []).length,
  };
}
const meta = (uid, nb, octets) =>
  fetch(`${FIRESTORE}/users/${uid}/espacePartageMeta/usage`, {
    method: "PATCH",
    headers: { ...proprietaire, "content-type": "application/json" },
    body: JSON.stringify({
      fields: { nb: { integerValue: String(nb) }, octets: { integerValue: String(octets) } },
    }),
  });

let uid;
beforeAll(async () => {
  uid = (await connecter("fichiers")).uid;
});
afterAll(() => fb.deconnecter({ obtenirJeton: async () => null, oublierJeton: async () => {} }));

describe("envoi de fichiers (émulateurs)", () => {
  it("envoi : le fichier, l'élément et les deux compteurs, avec progression", async () => {
    const progres = [];
    const { promesse } = fb.envoyerFichierPartage(uid, fichier("rapport final.pdf", 4096), (p) =>
      progres.push(p),
    );
    const id = await promesse;
    expect(id).toBeTruthy();
    expect(progres.at(-1)).toBe(1);
    expect(await contenu(uid)).toEqual({ elements: 1, octets: 4096, nb: 1, fichiers: 1 });
    // getBlob only exists in a browser: the content is read through the emulator here.
    const chemin = encodeURIComponent(`partages/${uid}/${id}/rapport final.pdf`);
    const lu = await fetch(`${STOCKAGE}/${chemin}?alt=media`, { headers: proprietaire });
    expect((await lu.arrayBuffer()).byteLength).toBe(4096);
  });

  it("suppression : élément, fichier et octets disparaissent", async () => {
    const tous = await fb.lireToutLePartage(uid);
    const e = tous.find((x) => x.type === "fichier");
    await fb.supprimerFichierPartage(uid, e);
    expect(await contenu(uid)).toEqual({ elements: 0, octets: 0, nb: 0, fichiers: 0 });
  });

  it("annulation avant l'envoi : ni fichier ni document", async () => {
    const { promesse, annuler } = fb.envoyerFichierPartage(
      uid,
      fichier("gros.pdf", 2 * 1024 * 1024),
    );
    annuler();
    await expect(promesse).rejects.toBeTruthy();
    expect(await contenu(uid)).toEqual({ elements: 0, octets: 0, nb: 0, fichiers: 0 });
  });

  it("lot Firestore refusé (espace plein) : le fichier envoyé est supprimé aussitôt", async () => {
    await meta(uid, 1, 200 * 1024 * 1024 - 10);
    const { promesse } = fb.envoyerFichierPartage(uid, fichier("trop.pdf", 5000));
    await expect(promesse).rejects.toMatchObject({ code: "permission-denied" });
    const c = await contenu(uid);
    expect(c.fichiers).toBe(0);
    expect(c.elements).toBe(0);
    await meta(uid, 0, 0);
  });

  it("réconciliation : un fichier sans élément (orphelin) est supprimé, les compteurs sont corrigés", async () => {
    await fb.envoyerFichierPartage(uid, fichier("vrai.pdf", 100)).promesse;
    // A leftover: the element is removed behind the app's back, the file stays.
    const id2 = await fb.envoyerFichierPartage(uid, fichier("orphelin.pdf", 50)).promesse;
    await fetch(`${FIRESTORE}/users/${uid}/espacePartage/${id2}`, {
      method: "DELETE",
      headers: proprietaire,
    });
    await meta(uid, 9, 9999);
    const r = await fb.reconcilierPartage(uid);
    expect(r).toMatchObject({ nb: 1, octets: 100, orphelins: 1 });
    expect(await contenu(uid)).toEqual({ elements: 1, octets: 100, nb: 1, fichiers: 1 });
  });

  it("vider l'espace : éléments, fichiers et compteurs", async () => {
    await fb.viderLePartage(uid);
    expect(await contenu(uid)).toEqual({ elements: 0, octets: 0, nb: 0, fichiers: 0 });
  });

  it("fichier chiffré (V4.26) : Storage et Firestore ne montrent ni nom ni contenu, et tout se relit", async () => {
    const { vk } = await creerCoffre("une phrase de passe solide 2026", { iterations: 310_000 });
    const clair = new Uint8Array(3000).map((_, i) => i % 251);
    const f = new File([clair], "divorce-avocat.pdf", { type: "application/pdf" });
    const { promesse } = fb.envoyerFichierPartage(uid, f, undefined, undefined, {
      chiffrerOctets: (id, o) => chiffrerFichier(vk, uid, id, o),
      chiffrerNom: (id, e) => chiffrerElement(vk, uid, id, e),
    });
    const id = await promesse;
    const el = (await fb.lireToutLePartage(uid)).find((x) => x.id === id);
    expect(el.chiffre).toBe(true);
    expect(JSON.stringify(el)).not.toContain("divorce");
    expect(el.chemin).toBe(`partages/${uid}/${id}/fichier.bin`);
    expect(el.taille).toBe(3000 + 28);
    const lu = await fetch(`${STOCKAGE}/${encodeURIComponent(el.chemin)}?alt=media`, {
      headers: proprietaire,
    });
    const octets = new Uint8Array(await lu.arrayBuffer());
    expect(octets.length).toBe(3028);
    expect(new Uint8Array(await dechiffrerFichier(vk, uid, id, octets))).toEqual(clair);
    expect(await dechiffrerElement(vk, uid, id, el.contenu)).toEqual({
      contenu: "divorce-avocat.pdf",
      titre: "application/pdf",
      libelle: "",
      description: "",
    });
    await fb.supprimerFichierPartage(uid, el);
  });
});
