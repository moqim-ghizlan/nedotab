import { describe, expect, it } from "vitest";
import { DUREE_MEMOIRE_MS, creerMemoire, decider } from "../../src/core/conflitTodo.js";

describe("decider", () => {
  const base = { local: "ma saisie", distante: "ma saisie", base: "avant", occupe: false };
  it("même texte des deux côtés : rien à faire", () => {
    expect(decider(base)).toBe("aucun");
  });
  it("le serveur n'a pas changé (ma saisie est en route) : rien à faire", () => {
    expect(decider({ ...base, distante: "avant", occupe: true })).toBe("aucun");
    expect(decider({ ...base, distante: "avant", occupe: false })).toBe("aucun");
  });
  it("l'écho de ma propre écriture n'est pas un conflit", () => {
    expect(decider({ ...base, local: "plus récent", distante: "ma saisie", envoye: "ma saisie", occupe: true })).toBe("aucun");
  });
  it("champ occupé que l'autre appareil a changé : conflit", () => {
    expect(decider({ ...base, local: "en cours", distante: "autre", occupe: true })).toBe("conflit");
  });
  it("champ libre que l'autre appareil a changé : remplacé", () => {
    expect(decider({ ...base, local: "ancien", distante: "autre", occupe: false })).toBe("remplace");
  });
  it("le titre est comparé rogné (on stocke sans espaces autour)", () => {
    const trim = (v) => v.trim();
    expect(decider({ local: "titre ", distante: "titre", base: "ti", occupe: true, normaliser: trim })).toBe("aucun");
  });
});

describe("mémoire des versions remplacées", () => {
  it("garde dix minutes en mémoire, puis oublie", () => {
    let t = 1_000;
    const m = creerMemoire(() => t);
    m.garder("a", "titre", "ma version");
    expect(m.lire("a", "titre")).toBe("ma version");
    t += DUREE_MEMOIRE_MS - 1;
    expect(m.lire("a", "titre")).toBe("ma version");
    t += 2;
    expect(m.lire("a", "titre")).toBeUndefined();
    expect(m.taille()).toBe(0);
  });
  it("une entrée par todo et par champ ; oublier ; vider à la déconnexion", () => {
    const m = creerMemoire(() => 0);
    m.garder("a", "titre", "1");
    m.garder("a", "description", "2");
    m.garder("b", "titre", "3");
    expect(m.lire("a", "description")).toBe("2");
    m.oublier("a", "titre");
    expect(m.lire("a", "titre")).toBeUndefined();
    m.vider();
    expect(m.taille()).toBe(0);
  });
  it("rien n'est écrit dans le stockage de l'appareil", () => {
    const m = creerMemoire();
    m.garder("a", "titre", "secret");
    expect(JSON.stringify(globalThis.localStorage ?? {})).not.toContain("secret");
  });
});
