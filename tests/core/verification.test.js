import { describe, expect, it } from "vitest";
import {
  attenteRestante,
  DELAI_REVERIFICATION_MS as DELAI,
  estimation,
  fusionnerVerifications,
  peutProposerSuppression,
  peutRevérifier,
  purger,
  VALIDITE_MS,
} from "../../src/core/verification.js";

const T0 = 1_000_000;

describe("double vérification", () => {
  it("une seule erreur : jamais de suppression proposée", () => {
    const v = fusionnerVerifications({}, [{ id: "a", statut: "introuvable", code: 404 }], T0);
    expect(v.a).toMatchObject({ statut: "introuvable", confirme: false, premierVu: T0 });
    expect(peutProposerSuppression(v.a)).toBe(false);
  });

  it("deuxième vérification trop tôt (< 10 min) : pas confirmé, pas encore revérifiable", () => {
    const v1 = fusionnerVerifications({}, [{ id: "a", statut: "injoignable" }], T0);
    const v2 = fusionnerVerifications(v1, [{ id: "a", statut: "injoignable" }], T0 + DELAI - 1);
    expect(v2.a.confirme).toBe(false);
    expect(v2.a.premierVu).toBe(T0);
    expect(peutRevérifier(v1.a, T0 + DELAI - 1)).toBe(false);
    expect(attenteRestante(v1.a, T0 + 60_000)).toBe(DELAI - 60_000);
  });

  it("même erreur 10 minutes après : confirmé, suppression proposable", () => {
    const v1 = fusionnerVerifications({}, [{ id: "a", statut: "introuvable", code: 404 }], T0);
    expect(peutRevérifier(v1.a, T0 + DELAI)).toBe(true);
    const v2 = fusionnerVerifications(v1, [{ id: "a", statut: "introuvable", code: 404 }], T0 + DELAI);
    expect(v2.a.confirme).toBe(true);
    expect(peutProposerSuppression(v2.a)).toBe(true);
  });

  it("l'erreur a disparu entre-temps, ou a changé : on repart de zéro", () => {
    const v1 = fusionnerVerifications({}, [{ id: "a", statut: "introuvable" }], T0);
    const ok = fusionnerVerifications(v1, [{ id: "a", statut: "ok" }], T0 + DELAI);
    expect(ok.a).toMatchObject({ statut: "ok", confirme: false });
    const autre = fusionnerVerifications(v1, [{ id: "a", statut: "injoignable" }], T0 + DELAI);
    expect(autre.a).toMatchObject({ confirme: false, premierVu: T0 + DELAI });
  });

  it("bloqué (403/429), erreur serveur, redirigé : jamais de suppression, même répétés", () => {
    for (const statut of ["bloque", "erreur-serveur", "redirige", "non-verifiable"]) {
      const v1 = fusionnerVerifications({}, [{ id: "a", statut }], T0);
      const v2 = fusionnerVerifications(v1, [{ id: "a", statut }], T0 + 2 * DELAI);
      expect(peutProposerSuppression(v2.a)).toBe(false);
      expect(v2.a.confirme).toBe(false);
    }
  });

  it("la nouvelle adresse d'un site redirigé est gardée", () => {
    const v = fusionnerVerifications({}, [{ id: "a", statut: "redirige", urlFinale: "https://neuf.fr/" }], T0);
    expect(v.a.urlFinale).toBe("https://neuf.fr/");
  });
});

describe("purger / estimation", () => {
  it("résultats de plus de 7 jours ou de sites disparus oubliés", () => {
    const v = {
      a: { statut: "ok", vuLe: T0 },
      b: { statut: "ok", vuLe: T0 - VALIDITE_MS - 1 },
      c: { statut: "ok", vuLe: T0 },
    };
    expect(Object.keys(purger(v, new Set(["a", "b"]), T0))).toEqual(["a"]);
  });
  it("estimation lisible", () => {
    expect(estimation(1)).toBe("1 site, environ 2 s");
    expect(estimation(312)).toMatch(/^312 sites, environ \d+ min$/);
  });
});
