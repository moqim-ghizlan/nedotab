import { afterEach, describe, expect, it } from "vitest";
import { creerBoutonEdition, definirEdition, enEdition } from "../../src/ui/modeEdition.js";

afterEach(() => {
  definirEdition(false);
  document.body.replaceChildren();
});

describe("mode Modifier la grille", () => {
  it("le bouton bascule le mode et son libellé", () => {
    const bouton = creerBoutonEdition();
    document.body.append(bouton);
    expect(bouton.textContent).toBe("Modifier");
    bouton.click();
    expect(enEdition()).toBe(true);
    expect(bouton.textContent).toBe("OK");
    expect(bouton.getAttribute("aria-pressed")).toBe("true");
    bouton.click();
    expect(enEdition()).toBe(false);
    expect(bouton.textContent).toBe("Modifier");
  });

  it("Échap quitte le mode", () => {
    document.body.append(creerBoutonEdition());
    definirEdition(true);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(enEdition()).toBe(false);
  });
});
