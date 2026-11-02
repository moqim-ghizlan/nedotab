import { describe, expect, it, vi } from "vitest";
import {
  ErreurCoffre,
  changerMotDePasse,
  chiffrerElement,
  chiffrerFichier,
  chiffrerOctets,
  creerCoffre,
  dechiffrerElement,
  dechiffrerFichier,
  depuisB64u,
  depuisTexte,
  deverrouiller,
  deverrouillerParSecours,
  genererCleSecours,
  groupesAVerifier,
  normaliserCleSecours,
  regenererCleSecours,
  reinitialiserParSecours,
  ressembleAChiffre,
  tailleAffichee,
  validerMotDePasse,
  verifierGroupes,
  versB64u,
} from "../../src/core/coffre.js";
import { creerSessionCoffre, delaiApresErreurs } from "../../src/core/sessionCoffre.js";

const MDP = "une phrase de passe solide 2026";
const ITER = 310_000; // faster than the 600 000 of production, same code path
const hex = (u) => [...u].map((x) => x.toString(16).padStart(2, "0")).join("");

describe("vecteurs de référence", () => {
  it("PBKDF2-HMAC-SHA256 (RFC 7914, c=1)", async () => {
    const base = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode("passwd"),
      "PBKDF2",
      false,
      ["deriveBits"],
    );
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt: new TextEncoder().encode("salt"), iterations: 1, hash: "SHA-256" },
      base,
      256,
    );
    expect(hex(new Uint8Array(bits))).toBe(
      "55ac046e56e3089fec1691c22544b605f94185216dde0465e68b9d57c20dacbc",
    );
  });

  it("AES-GCM (NIST, cas de test 2)", async () => {
    const k = await crypto.subtle.importKey("raw", new Uint8Array(16), "AES-GCM", false, [
      "encrypt",
    ]);
    const ct = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: new Uint8Array(12) },
      k,
      new Uint8Array(16),
    );
    expect(hex(new Uint8Array(ct))).toBe(
      "0388dace60b6a392f328c2b971b2fe78ab6e47d42cec13bdf53a67b21257bddf",
    );
  });
});

describe("mot de passe", () => {
  it("refuse court, courant, répétitif", () => {
    expect(validerMotDePasse("court").ok).toBe(false);
    expect(validerMotDePasse("court").niveau).toBe("trop-court");
    expect(validerMotDePasse("motdepasse123").ok).toBe(false);
    expect(validerMotDePasse("aaaaaaaaaaaaaaaa").ok).toBe(false);
  });
  it("accepte une phrase de 4 mots (solide) et un mot de passe correct", () => {
    expect(validerMotDePasse("chat rouge bleu lune")).toMatchObject({ ok: true, niveau: "solide" });
    expect(validerMotDePasse("kjhgfdsapoiu")).toMatchObject({ ok: true, niveau: "correct" });
  });
  it("NFKC : deux formes Unicode du même mot de passe donnent le même résultat", async () => {
    const a = "café noir été matin"; // composed
    const b = "café noir été matin"; // combining accents
    const { meta } = await creerCoffre(a, { iterations: ITER });
    await expect(deverrouiller(meta, b)).resolves.toBeTruthy();
  });
});

describe("clé de secours", () => {
  it("24 symboles en 6 groupes de 4, tolère espaces, minuscules, I/O", () => {
    const c = genererCleSecours();
    expect(c).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){5}[0-9A-HJKMNP-TV-Z]{4}$/);
    expect(normaliserCleSecours(c.toLowerCase().replaceAll("-", " "))).toBe(c.replaceAll("-", ""));
    expect(normaliserCleSecours("trop-court")).toBeNull();
  });
  it("vérification de 3 groupes au hasard", () => {
    const c = genererCleSecours();
    const idx = groupesAVerifier();
    expect(idx).toHaveLength(3);
    const bons = idx.map((i) => c.split("-")[i]);
    expect(verifierGroupes(c, idx, bons)).toBe(true);
    expect(verifierGroupes(c, idx, ["AAAA", "BBBB", "CCCC"])).toBe(false);
  });
});

describe("vault : création, déverrouillage, secours", () => {
  it("mauvais mot de passe → échec propre ; bon → clé non extractable", async () => {
    const { meta, vk } = await creerCoffre(MDP, { iterations: ITER });
    expect(vk.extractable).toBe(false);
    await expect(deverrouiller(meta, "mauvais mot de passe 1")).rejects.toMatchObject({
      code: "mot-de-passe",
    });
    const vk2 = await deverrouiller(meta, MDP);
    expect(vk2.extractable).toBe(false);
  });

  it("la clé de secours déverrouille, une fausse échoue", async () => {
    const { meta, vk, cleSecours } = await creerCoffre(MDP, { iterations: ITER });
    const chiffre = await chiffrerElement(vk, "u1", "e1", { contenu: "secret", titre: "t" });
    const vk2 = await deverrouillerParSecours(meta, cleSecours);
    expect((await dechiffrerElement(vk2, "u1", "e1", chiffre)).contenu).toBe("secret");
    await expect(deverrouillerParSecours(meta, genererCleSecours())).rejects.toMatchObject({
      code: "cle-secours",
    });
    await expect(deverrouillerParSecours(meta, "nope")).rejects.toMatchObject({
      code: "cle-secours",
    });
  });

  it("changement de mot de passe : anciens éléments lisibles, ancien mot de passe refusé", async () => {
    const { meta, vk } = await creerCoffre(MDP, { iterations: ITER });
    const chiffre = await chiffrerElement(vk, "u1", "e1", { contenu: "avant", titre: "" });
    const meta2 = await changerMotDePasse(meta, MDP, "un autre mot de passe 2027");
    await expect(deverrouiller(meta2, MDP)).rejects.toMatchObject({ code: "mot-de-passe" });
    const vk2 = await deverrouiller(meta2, "un autre mot de passe 2027");
    expect((await dechiffrerElement(vk2, "u1", "e1", chiffre)).contenu).toBe("avant");
    await expect(
      changerMotDePasse(meta, "faux faux faux faux", "encore une phrase 2028"),
    ).rejects.toBeInstanceOf(ErreurCoffre);
    await expect(changerMotDePasse(meta, MDP, "court")).rejects.toMatchObject({
      code: "mot-de-passe",
    });
  });

  it("réinitialisation par clé de secours : éléments lisibles, nouvelle clé différente, ancienne clé morte", async () => {
    const { meta, vk, cleSecours } = await creerCoffre(MDP, { iterations: ITER });
    const chiffre = await chiffrerElement(vk, "u1", "e1", { contenu: "garde", titre: "" });
    const r = await reinitialiserParSecours(meta, cleSecours, "nouvelle phrase de passe 99");
    expect(r.cleSecours).not.toBe(cleSecours);
    expect((await dechiffrerElement(r.vk, "u1", "e1", chiffre)).contenu).toBe("garde");
    await expect(deverrouiller(r.meta, MDP)).rejects.toBeTruthy();
    await expect(deverrouillerParSecours(r.meta, cleSecours)).rejects.toBeTruthy();
    await expect(deverrouillerParSecours(r.meta, r.cleSecours)).resolves.toBeTruthy();
  });

  it("régénérer la clé de secours exige le mot de passe", async () => {
    const { meta, cleSecours } = await creerCoffre(MDP, { iterations: ITER });
    const r = await regenererCleSecours(meta, MDP);
    await expect(deverrouillerParSecours(r.meta, cleSecours)).rejects.toBeTruthy();
    await expect(deverrouillerParSecours(r.meta, r.cleSecours)).resolves.toBeTruthy();
    await expect(regenererCleSecours(meta, "faux faux faux faux")).rejects.toBeTruthy();
  });

  it("refuse un vault d'une version inconnue ou des itérations trop faibles", async () => {
    const { meta } = await creerCoffre(MDP, { iterations: ITER });
    await expect(deverrouiller({ ...meta, version: 99 }, MDP)).rejects.toMatchObject({
      code: "format",
    });
    await expect(deverrouiller({ ...meta, iterations: 10 }, MDP)).rejects.toBeTruthy();
  });

  it("le meta ne contient ni mot de passe ni clé en clair", async () => {
    const { meta, cleSecours } = await creerCoffre(MDP, { iterations: ITER });
    const json = JSON.stringify(meta);
    expect(json).not.toContain(MDP);
    expect(json).not.toContain(cleSecours.replaceAll("-", ""));
    expect(Object.keys(meta).sort()).toEqual([
      "enveloppeMdp",
      "enveloppeSecours",
      "iterations",
      "sel1",
      "sel2",
      "version",
    ]);
  });
});

describe("éléments chiffrés", () => {
  it.each([
    ["texte", "bonjour"],
    ["vide", ""],
    ["emoji", "👨‍👩‍👧 café ✓ 日本語"],
    ["20 000 caractères", "x".repeat(20_000)],
  ])("aller-retour : %s", async (_n, contenu) => {
    const { vk } = await creerCoffre(MDP, { iterations: ITER });
    const c = await chiffrerElement(vk, "u1", "e1", { contenu, titre: "mon titre" });
    expect(ressembleAChiffre(c)).toBe(true);
    expect(c).not.toContain("mon titre");
    expect(await dechiffrerElement(vk, "u1", "e1", c)).toEqual({ contenu, titre: "mon titre", description: "", libelle: "" });
  });
  it("V4.31 : le titre écrit pour un fichier (libelle) est chiffré avec le reste", async () => {
    const { vk } = await creerCoffre(MDP, { iterations: ITER });
    const c = await chiffrerElement(vk, "u1", "e1", { contenu: "a.png", titre: "image/png", libelle: "Vacances", description: "plage" });
    expect(c).not.toContain("Vacances");
    expect(await dechiffrerElement(vk, "u1", "e1", c)).toEqual({ contenu: "a.png", titre: "image/png", description: "plage", libelle: "Vacances" });
  });

  it("fichier de 25 Mo", async () => {
    const { vk } = await creerCoffre(MDP, { iterations: ITER });
    const o = new Uint8Array(25 * 1024 * 1024);
    for (let i = 0; i < o.length; i += 4096) o[i] = i % 251;
    const c = await chiffrerFichier(vk, "u1", "f1", o);
    expect(c.length).toBe(o.length + 12 + 16);
    const d = await dechiffrerFichier(vk, "u1", "f1", c);
    expect(d.length).toBe(o.length);
    expect(d[4096 * 100]).toBe(o[4096 * 100]);
  }, 60_000);

  it("un bit modifié → « Élément corrompu », jamais un contenu partiel", async () => {
    const { vk } = await creerCoffre(MDP, { iterations: ITER });
    const c = depuisTexte(await chiffrerElement(vk, "u1", "e1", { contenu: "abc", titre: "" }));
    const o = depuisB64u(c.donnees);
    o[0] ^= 1;
    await expect(
      dechiffrerElement(vk, "u1", "e1", `v1.${c.iv}.${versB64u(o)}`),
    ).rejects.toMatchObject({ code: "corrompu" });
  });

  it("copié vers un autre id ou un autre uid → échec (AAD)", async () => {
    const { vk } = await creerCoffre(MDP, { iterations: ITER });
    const c = await chiffrerElement(vk, "u1", "e1", { contenu: "abc", titre: "" });
    await expect(dechiffrerElement(vk, "u1", "e2", c)).rejects.toMatchObject({ code: "corrompu" });
    await expect(dechiffrerElement(vk, "u2", "e1", c)).rejects.toMatchObject({ code: "corrompu" });
  });

  it("autre vault → échec ; format inconnu → échec", async () => {
    const a = await creerCoffre(MDP, { iterations: ITER });
    const b = await creerCoffre(MDP, { iterations: ITER });
    const c = await chiffrerElement(a.vk, "u1", "e1", { contenu: "abc", titre: "" });
    await expect(dechiffrerElement(b.vk, "u1", "e1", c)).rejects.toMatchObject({
      code: "corrompu",
    });
    await expect(dechiffrerElement(a.vk, "u1", "e1", "n'importe quoi")).rejects.toMatchObject({
      code: "format",
    });
  });

  it("IV jamais réutilisé (10 000 chiffrements)", async () => {
    const { vk } = await creerCoffre(MDP, { iterations: ITER });
    const ivs = new Set();
    const o = new Uint8Array(1);
    for (let i = 0; i < 10_000; i++) ivs.add((await chiffrerOctets(vk, "u", "e", o)).iv);
    expect(ivs.size).toBe(10_000);
  }, 60_000);

  it("taille affichée arrondie aux 64 Ko supérieurs", () => {
    expect(tailleAffichee(1)).toBe(65536);
    expect(tailleAffichee(65536)).toBe(65536);
    expect(tailleAffichee(65537)).toBe(131072);
  });
});

describe("aucun secret dans le stockage ni les journaux", () => {
  it("création + usage n'écrivent rien dans localStorage / sessionStorage / console", async () => {
    const espions = [
      vi.spyOn(console, "log"),
      vi.spyOn(console, "warn"),
      vi.spyOn(console, "error"),
      vi.spyOn(console, "info"),
    ];
    const ls = { setItem: vi.fn() };
    vi.stubGlobal("localStorage", ls);
    vi.stubGlobal("sessionStorage", ls);
    const { vk } = await creerCoffre(MDP, { iterations: ITER });
    await chiffrerElement(vk, "u1", "e1", { contenu: "x", titre: "" });
    expect(ls.setItem).not.toHaveBeenCalled();
    espions.forEach((e) => expect(e).not.toHaveBeenCalled());
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
});

describe("session : verrouillage", () => {
  it("verrouille après l'inactivité (horloge simulée) et prévient les abonnés", () => {
    vi.useFakeTimers();
    const s = creerSessionCoffre({ inactiviteMin: 15 });
    const verrou = vi.fn();
    s.surVerrouille(verrou);
    s.deverrouiller({});
    expect(s.estDeverrouille()).toBe(true);
    vi.advanceTimersByTime(14 * 60_000);
    s.activite(); // activity postpones
    vi.advanceTimersByTime(14 * 60_000);
    expect(s.estDeverrouille()).toBe(true);
    vi.advanceTimersByTime(2 * 60_000);
    expect(s.estDeverrouille()).toBe(false);
    expect(s.cle()).toBeNull();
    expect(verrou).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("verrouille quand l'onglet reste caché trop longtemps, pas pour un court passage", () => {
    let t = 0;
    const s = creerSessionCoffre({ arrierePlanMin: 5, maintenant: () => t });
    s.deverrouiller({});
    s.visibilite(true);
    t = 2 * 60_000;
    s.visibilite(false);
    expect(s.estDeverrouille()).toBe(true);
    s.visibilite(true);
    t += 6 * 60_000;
    s.visibilite(false);
    expect(s.estDeverrouille()).toBe(false);
    s.verrouiller();
  });

  it("verrouillage manuel et délai croissant après 5 erreurs", () => {
    const s = creerSessionCoffre();
    s.deverrouiller({});
    s.verrouiller();
    expect(s.estDeverrouille()).toBe(false);
    expect(delaiApresErreurs(4)).toBe(0);
    expect(delaiApresErreurs(5)).toBe(2000);
    expect(delaiApresErreurs(6)).toBe(4000);
    expect(delaiApresErreurs(50)).toBe(60_000);
  });
});
