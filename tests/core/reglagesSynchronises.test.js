import { afterEach, describe, expect, it } from "vitest";
import { A, reduire } from "../../src/core/actions.js";
import { valider } from "../../src/core/migration.js";
import { etatInitial } from "../../src/core/modele.js";
import {
  definirProfilAppareil,
  modifierReglagesEtat,
  profilDeType,
  vueDepuisReglages,
} from "../../src/core/reglages.js";

afterEach(() => definirProfilAppareil("pc"));

const silencieux = () => {};
const etat = (extra = {}) => ({ ...etatInitial(), ...extra });

describe("réglages sauvegardés dans le compte (T10)", () => {
  it("un réglage global va dans reglages.apparence", () => {
    const e = modifierReglagesEtat(etat(), { formeIcones: "rond" });
    expect(e.reglages.apparence).toEqual({ formeIcones: "rond" });
    expect(e.reglagesAppareil.formeIcones).toBe("rond");
  });
  it("un réglage d'écran va dans parAppareil du profil", () => {
    definirProfilAppareil("telephone");
    const e = modifierReglagesEtat(etat(), { colonnes: 4, retourHaptique: true });
    expect(e.reglages.parAppareil).toEqual({ telephone: { colonnes: 4, retourHaptique: true } });
    expect(e.reglages.apparence).toEqual({});
  });
  it("retrouvé sur un nouvel appareil vierge (même profil)", () => {
    const a = modifierReglagesEtat(etat(), { colonnes: 7, formeIcones: "carre" });
    const nouveau = valider({ ...etatInitial(), reglages: a.reglages }, silencieux, silencieux);
    expect(nouveau.reglagesAppareil).toMatchObject({ colonnes: 7, formeIcones: "carre" });
  });
  it("un réglage d'écran n'est pas appliqué à un autre type d'appareil", () => {
    const a = modifierReglagesEtat(etat(), { colonnes: 7, formeIcones: "carre" });
    definirProfilAppareil("telephone");
    const tel = valider({ ...etatInitial(), reglages: a.reglages }, silencieux, silencieux);
    expect(tel.reglagesAppareil.colonnes).toBeUndefined();
    expect(tel.reglagesAppareil.formeIcones).toBe("carre"); // global
  });
  it("retour à la valeur par défaut : propagé (absent = défaut une fois synchronisé)", () => {
    const a = modifierReglagesEtat(etat(), { formeIcones: "rond" });
    const b = modifierReglagesEtat(a, { formeIcones: "arrondi" });
    expect(b.reglages.apparence).toEqual({});
    const autre = etat({ reglagesAppareil: { formeIcones: "rond" }, reglages: b.reglages });
    expect(vueDepuisReglages(autre.reglagesAppareil, autre.reglages).formeIcones).toBeUndefined();
  });
  it("migration : ancien état local sans rien dans le compte garde ses réglages", () => {
    const ancien = { ...etatInitial(), reglagesAppareil: { colonnes: 5, ombreIcones: "forte", styleDossier: "icone" } };
    const v = valider(ancien, silencieux, silencieux);
    expect(v.reglagesAppareil).toMatchObject({ colonnes: 5, ombreIcones: "forte", styleDossier: "icone" });
    // idempotent
    expect(valider(v, silencieux, silencieux)).toEqual(v);
    // pushing them up writes them to the account
    const pousse = modifierReglagesEtat(v, v.reglagesAppareil);
    expect(pousse.reglages.apparence).toEqual({ ombreIcones: "forte", styleDossier: "icone" });
    expect(pousse.reglages.parAppareil.pc).toEqual({ colonnes: 5 });
  });
  it("valeurs invalides ⇒ défauts, clés inconnues et profils inconnus ignorés", () => {
    const v = valider(
      etat({
        reglages: {
          ...etatInitial().reglages,
          apparence: { formeIcones: "triangle", colonnes: 4, ombreIcones: "forte" },
          parAppareil: { pc: { colonnes: 99, debug: true }, frigo: { colonnes: 4 } },
        },
      }),
      silencieux,
      silencieux,
    );
    expect(v.reglages.apparence).toEqual({ ombreIcones: "forte" });
    expect(v.reglages.parAppareil).toEqual({ pc: { debug: true } });
  });
  it("restauration d'une sauvegarde : l'apparence revient (annulable)", () => {
    const avant = modifierReglagesEtat(etat(), { formeIcones: "rond", colonnes: 6 });
    const modifie = modifierReglagesEtat(avant, { formeIcones: "carre", colonnes: 3 });
    const restaure = reduire(modifie, { type: A.GRILLE_RESTAURER, etat: { grille: [], reglages: avant.reglages } });
    expect(restaure.reglagesAppareil).toMatchObject({ formeIcones: "rond", colonnes: 6 });
    const annule = reduire(restaure, { type: A.GRILLE_RESTAURER, etat: { grille: [], reglages: modifie.reglages } });
    expect(annule.reglagesAppareil).toMatchObject({ formeIcones: "carre", colonnes: 3 });
  });
  it("une ancienne sauvegarde sans ces clés ne remet pas l'apparence à zéro", () => {
    const e = modifierReglagesEtat(etat(), { formeIcones: "rond" });
    const vieux = { grille: [], reglages: etatInitial().reglages };
    const r = reduire(e, { type: A.GRILLE_RESTAURER, etat: vieux });
    expect(r.reglagesAppareil.formeIcones).toBe("rond");
  });
  it("le fond local reste local", () => {
    const fond = { type: "image", ref: "local:x", dominante: "#123456" };
    const e = etat({ reglagesAppareil: { fond } });
    const v = valider(e, silencieux, silencieux);
    expect(v.reglagesAppareil.fond).toBeDefined();
    expect(JSON.stringify(modifierReglagesEtat(v, { colonnes: 5 }).reglages)).not.toContain("local:x");
  });
  it("profils par type d'appareil", () => {
    expect(profilDeType("iphone")).toBe("telephone");
    expect(profilDeType("pwa")).toBe("telephone");
    expect(profilDeType("ipad")).toBe("tablette");
    expect(profilDeType("extension")).toBe("pc");
  });
});
