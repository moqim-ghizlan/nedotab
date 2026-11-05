import { describe, expect, it } from "vitest";
import { ajouter, el, remplacer } from "../../src/ui/dom.js";

// Régression : un enfant « sauté » (null, undefined, false) ne doit pas s'afficher en texte
// (replaceChildren / append natifs écrivent « null » : vu dans Réglages → VPN).
describe("remplacer / ajouter", () => {
  it("ignorent null, undefined et false", () => {
    const p = el("div");
    remplacer(p, el("span", { texte: "a" }), null, undefined, false, [
      el("b", { texte: "b" }),
      null,
    ]);
    expect(p.textContent).toBe("ab");
    ajouter(p, null, el("i", { texte: "c" }), undefined);
    expect(p.textContent).toBe("abc");
  });
});
