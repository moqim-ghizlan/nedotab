import { describe, expect, it } from "vitest";
import { MESSAGES_MAX, TOTAL_MAX, compteurVisible, preparerEnvoi } from "../../src/core/chat.js";

const m = (role, texte, etat = "ok") => ({ role, texte, etat });

describe("preparerEnvoi", () => {
  it("petite conversation : tout est envoyé, rien n'est tronqué", () => {
    const r = preparerEnvoi([m("user", "a"), m("assistant", "b"), m("user", "c")]);
    expect(r.messages).toEqual([
      { role: "user", texte: "a" },
      { role: "assistant", texte: "b" },
      { role: "user", texte: "c" },
    ]);
    expect(r.tronque).toBe(false);
  });
  it("plus de 40 messages : les plus anciens partent, le dernier reste", () => {
    const tous = Array.from({ length: 61 }, (_, i) => m(i % 2 ? "assistant" : "user", `t${i}`));
    const r = preparerEnvoi(tous);
    expect(r.messages.length).toBeLessThanOrEqual(MESSAGES_MAX);
    expect(r.messages.at(-1)).toEqual({ role: "user", texte: "t60" });
    expect(r.messages[0].role).toBe("user");
    expect(r.tronque).toBe(true);
  });
  it("30 000 caractères au plus ; le dernier message de l'utilisateur est toujours présent", () => {
    const gros = "x".repeat(4000);
    const tous = [];
    for (let i = 0; i < 6; i++) tous.push(m("user", gros), m("assistant", gros));
    tous.push(m("user", gros));
    const r = preparerEnvoi(tous);
    const total = r.messages.reduce((n, x) => n + x.texte.length, 0);
    expect(total).toBeLessThanOrEqual(TOTAL_MAX);
    expect(r.messages.at(-1).role).toBe("user");
    expect(r.messages[0].role).toBe("user");
    expect(r.tronque).toBe(true);
  });
  it("un message en erreur plus ancien est écarté ; celui qu'on réessaie (le dernier) reste", () => {
    const r = preparerEnvoi([
      m("user", "perdu", "erreur"),
      m("user", "neuf"),
      m("assistant", "rép"),
      m("user", "dernier", "erreur"),
    ]);
    expect(r.messages.map((x) => x.texte)).toEqual(["neuf", "rép", "dernier"]);
  });
  it("compteur à partir de 3 500 caractères", () => {
    expect(compteurVisible(3499)).toBe(false);
    expect(compteurVisible(3500)).toBe(true);
  });
});
