import { describe, expect, it } from "vitest";
import {
  dateRelative,
  fusionner,
  idConversation,
  idMessage,
  messageDepuisDoc,
  TITRE_PAR_DEFAUT,
  titreDepuis,
  titreValide,
} from "../../src/core/conversations.js";

describe("titreDepuis", () => {
  it("les 6 premiers mots, première lettre en majuscule", () => {
    expect(titreDepuis("comment configurer un serveur DNS sur mon routeur maison ?")).toBe(
      "Comment configurer un serveur DNS sur",
    );
  });
  it("retire adresses, Markdown et ponctuation de bord", () => {
    expect(titreDepuis("**Explique** https://exemple.com/x `le` DNS, svp.")).toBe(
      "Explique le DNS svp",
    );
  });
  it("garde le point d'interrogation final, limite à 80 caractères, défaut si vide", () => {
    expect(titreDepuis("Pourquoi le ciel est bleu?")).toBe("Pourquoi le ciel est bleu?");
    expect(titreDepuis("a".repeat(200)).length).toBe(80);
    expect(titreDepuis("   ")).toBe(TITRE_PAR_DEFAUT);
    expect(titreDepuis("https://exemple.com")).toBe(TITRE_PAR_DEFAUT);
  });
});

describe("titreValide", () => {
  it("nettoie, refuse le vide, tronque", () => {
    expect(titreValide("  Mon   titre ")).toBe("Mon titre");
    expect(titreValide("   ")).toBeNull();
    expect(titreValide("x".repeat(100))).toHaveLength(80);
  });
});

describe("identifiants", () => {
  it("conversation : motif accepté par le serveur ; message : trié comme l'heure", () => {
    expect(idConversation()).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(idConversation()).not.toBe(idConversation());
    expect(idMessage(5) < idMessage(12)).toBe(true);
    expect(idMessage(1730000000000)).toMatch(/^1730000000000-[0-9a-f]{8}$/);
  });
});

describe("dateRelative", () => {
  const n = Date.UTC(2026, 9, 31, 12);
  it.each([
    [n - 10_000, "à l'instant"],
    [n - 5 * 60_000, "il y a 5 min"],
    [n - 3 * 3600_000, "il y a 3 h"],
    [n - 30 * 3600_000, "hier"],
    [n - 4 * 86400_000, "il y a 4 j"],
  ])("%s → %s", (ms, attendu) => expect(dateRelative(ms, n)).toBe(attendu));
  it("au-delà d'une semaine : la date ; inconnue : vide", () => {
    expect(dateRelative(n - 30 * 86400_000, n)).toMatch(/2026/);
    expect(dateRelative(null, n)).toBe("");
  });
});

describe("fusionner (messages stockés et messages du panneau)", () => {
  let compteur = 100;
  const nouvelId = () => ++compteur;
  const doc = (id, role, creeLe, extra = {}) => ({
    id,
    role,
    texte: id,
    creeLe,
    etat: "ok",
    ...extra,
  });

  it("ouverture : tous les messages stockés, dans l'ordre du temps", () => {
    const r = fusionner([], [doc("b", "assistant", 20), doc("a", "user", 10)], { nouvelId });
    expect(r.map((m) => m.fsId)).toEqual(["a", "b"]);
    expect(r[1]).toMatchObject({ role: "assistant", etat: "ok", date: 20 });
  });
  it("un message déjà connu n'est pas dupliqué ; rien de nouveau → même tableau", () => {
    const locaux = [{ id: 1, fsId: "a", role: "user", texte: "a", date: 10, etat: "ok" }];
    expect(fusionner(locaux, [doc("a", "user", 10)], { nouvelId })).toBe(locaux);
  });
  it("l'heure du serveur remplace l'heure locale d'un message connu", () => {
    const locaux = [{ id: 1, fsId: "a", role: "user", texte: "a", date: 5, etat: "ok" }];
    const r = fusionner(locaux, [doc("a", "user", 10)], { nouvelId });
    expect(r[0].date).toBe(10);
  });
  it("message en cours d'envoi (sans fsId) : reste à la fin", () => {
    const attente = { id: 1, role: "user", texte: "en cours", date: 1, etat: "envoi" };
    const r = fusionner([attente], [doc("z", "assistant", 50)], { nouvelId });
    expect(r.map((m) => m.texte)).toEqual(["z", "en cours"]);
  });
  it("réponse en cours de réception : les messages assistant stockés sont ignorés", () => {
    const r = fusionner([], [doc("a", "user", 1), doc("b", "assistant", 2)], {
      nouvelId,
      accepterAssistant: false,
    });
    expect(r.map((m) => m.fsId)).toEqual(["a"]);
  });
  it("heure du serveur pas encore connue (écriture en attente) et état erreur : ignorés", () => {
    const r = fusionner(
      [],
      [doc("a", "user", null), doc("b", "assistant", 3, { etat: "erreur" })],
      { nouvelId },
    );
    expect(r).toEqual([]);
  });
  it("réponse provisoire (arrêtée ici) : adoptée par sa version stockée, jamais en double", () => {
    const provisoire = {
      id: 9,
      role: "assistant",
      texte: "Le DNS traduit les no",
      date: 1,
      etat: "ok",
      interrompu: true,
      provisoire: true,
    };
    const r = fusionner(
      [provisoire],
      [doc("b", "assistant", 20, { texte: "Le DNS traduit les noms en adresses.", etat: "interrompu" })],
      { nouvelId },
    );
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      id: 9,
      fsId: "b",
      texte: "Le DNS traduit les noms en adresses.",
      date: 20,
    });
    expect(r[0].provisoire).toBeUndefined();
  });
  it("une réponse stockée qui n'a rien à voir avec la provisoire est ajoutée", () => {
    const provisoire = { id: 9, role: "assistant", texte: "Autre chose", date: 1, etat: "ok", provisoire: true };
    const r = fusionner([provisoire], [doc("b", "assistant", 20, { texte: "Tout à fait différent" })], {
      nouvelId,
    });
    expect(r).toHaveLength(2);
  });
  it("réponse interrompue", () => {
    expect(messageDepuisDoc(doc("a", "assistant", 1, { etat: "interrompu" }), 7)).toMatchObject({
      interrompu: true,
      etat: "ok",
    });
  });
});
