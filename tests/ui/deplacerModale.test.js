import { afterEach, describe, expect, it } from "vitest";
import { rendreDeplacable } from "../../src/ui/todos/deplacerModale.js";

afterEach(() => document.body.replaceChildren());

function monter() {
  const dialogue = document.createElement("dialog");
  const entete = document.createElement("header");
  const bouton = document.createElement("button");
  entete.append(bouton);
  dialogue.append(entete);
  document.body.append(dialogue);
  // A 400x300 window centred in a 1000x800 frame, moved by its translate.
  dialogue.getBoundingClientRect = () => {
    const [x, y] = (dialogue.style.translate || "0px 0px").split(" ").map(parseFloat);
    return { left: 300 + x, top: 250 + y, width: 400, height: 300, right: 0, bottom: 0 };
  };
  Object.defineProperty(document.documentElement, "clientWidth", { value: 1000, configurable: true });
  Object.defineProperty(document.documentElement, "clientHeight", { value: 800, configurable: true });
  rendreDeplacable(dialogue, entete);
  return { dialogue, entete, bouton };
}

const evt = (type, cible, x, y) => {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(e, { pointerType: "mouse", button: 0, pointerId: 1, clientX: x, clientY: y });
  cible.dispatchEvent(e);
};

describe("fenêtre des todos déplaçable", () => {
  it("suit la souris par l'en-tête", () => {
    const { dialogue, entete } = monter();
    evt("pointerdown", entete, 500, 260);
    evt("pointermove", entete, 540, 280);
    expect(dialogue.style.translate).toBe("40px 20px");
    evt("pointerup", entete, 540, 280);
  });
  it("ne sort jamais du cadre", () => {
    const { dialogue, entete } = monter();
    evt("pointerdown", entete, 500, 260);
    evt("pointermove", entete, 5000, -5000);
    expect(dialogue.style.translate).toBe("300px -250px");
  });
  it("ne démarre pas depuis un bouton", () => {
    const { dialogue, bouton } = monter();
    evt("pointerdown", bouton, 500, 260);
    evt("pointermove", bouton, 540, 280);
    expect(dialogue.style.translate).toBe("");
  });
});
