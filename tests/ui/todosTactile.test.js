import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SEUIL_BALAYAGE_PX,
  balayageValide,
  brancherGestes,
  suivreBalayage,
} from "../../src/ui/todos/balayage.js";
import { GROS_FICHIER, preparerImage } from "../../src/ui/todos/compresserImage.js";
import { creerGalerieTodo } from "../../src/ui/todos/galerieTodo.js";
import { creerPanneauTodos } from "../../src/ui/todos/panneauTodos.js";

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
  delete globalThis.matchMedia_;
});

const vraiSetTimeout = globalThis.setTimeout;
const attendre = () => new Promise((r) => vraiSetTimeout(r, 0));

describe("suivreBalayage (logique pure)", () => {
  it("verrouille l'axe vertical dès qu'on défile", () => {
    expect(suivreBalayage({ dx: -4, dy: 30, axe: null })).toEqual({ axe: "y", decalage: 0 });
    // Une fois verrouillé en vertical, un geste qui dérive de côté ne devient pas un balayage.
    expect(suivreBalayage({ dx: -120, dy: 30, axe: "y" })).toEqual({ axe: "y", decalage: 0 });
  });
  it("verrouille l'axe horizontal seulement si le geste est nettement horizontal", () => {
    expect(suivreBalayage({ dx: -40, dy: 5, axe: null })).toEqual({ axe: "x", decalage: -40 });
    expect(suivreBalayage({ dx: -30, dy: 25, axe: null }).axe).toBeNull(); // diagonale : on attend
    expect(suivreBalayage({ dx: -30, dy: 12, axe: null }).axe).toBe("x");
    expect(suivreBalayage({ dx: -30, dy: 21, axe: null }).axe).toBeNull();
  });
  it("la ligne ne suit que vers la gauche", () => {
    expect(suivreBalayage({ dx: 50, dy: 2, axe: "x" }).decalage).toBe(0);
    expect(suivreBalayage({ dx: -50, dy: 2, axe: "x" }).decalage).toBe(-50);
  });
  it("seuil de suppression : 96 px ou 40 % d'une ligne étroite", () => {
    expect(balayageValide(-(SEUIL_BALAYAGE_PX + 1), 500)).toBe(true);
    expect(balayageValide(-60, 500)).toBe(false);
    expect(balayageValide(-90, 200)).toBe(true); // 40 % de 200 = 80
    expect(balayageValide(-70, 200)).toBe(false);
    expect(balayageValide(0, 360)).toBe(false);
  });
});

function ptr(type, x, y, extra = {}) {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(e, { pointerType: "touch", pointerId: 1, clientX: x, clientY: y, button: 0, ...extra });
  return e;
}
function liste() {
  const ul = document.createElement("ul");
  ul.innerHTML =
    '<li data-id="a"><button class="todo-corps">A</button><button class="todo-poignee">::</button></li><li data-id="b"><button class="todo-corps">B</button></li>';
  document.body.append(ul);
  return ul;
}

describe("brancherGestes", () => {
  it("un balayage vers la gauche assez long supprime la ligne touchée", () => {
    const ul = liste();
    const surBalayage = vi.fn();
    brancherGestes(ul, { surBalayage });
    const cible = ul.querySelector('[data-id="a"] .todo-corps');
    cible.dispatchEvent(ptr("pointerdown", 300, 100));
    cible.dispatchEvent(ptr("pointermove", 250, 102));
    cible.dispatchEvent(ptr("pointermove", 150, 104));
    cible.dispatchEvent(ptr("pointerup", 150, 104));
    expect(surBalayage).toHaveBeenCalledWith("a");
    expect(ul.querySelector('[data-id="a"]').style.translate).toBe("");
  });
  it("un balayage trop court, un défilement vertical et une diagonale ne suppriment rien", () => {
    const ul = liste();
    const surBalayage = vi.fn();
    brancherGestes(ul, { surBalayage });
    const cible = ul.querySelector('[data-id="a"] .todo-corps');
    cible.dispatchEvent(ptr("pointerdown", 300, 100));
    cible.dispatchEvent(ptr("pointermove", 270, 101));
    cible.dispatchEvent(ptr("pointerup", 270, 101));
    cible.dispatchEvent(ptr("pointerdown", 300, 100));
    cible.dispatchEvent(ptr("pointermove", 298, 160));
    cible.dispatchEvent(ptr("pointermove", 100, 170)); // dérive de côté APRÈS un défilement
    cible.dispatchEvent(ptr("pointerup", 100, 170));
    cible.dispatchEvent(ptr("pointerdown", 300, 100));
    cible.dispatchEvent(ptr("pointermove", 240, 140));
    cible.dispatchEvent(ptr("pointerup", 200, 150));
    expect(surBalayage).not.toHaveBeenCalled();
  });
  it("l'annulation du navigateur (pointercancel) remet la ligne en place sans supprimer", () => {
    const ul = liste();
    const surBalayage = vi.fn();
    brancherGestes(ul, { surBalayage });
    const cible = ul.querySelector('[data-id="a"] .todo-corps');
    cible.dispatchEvent(ptr("pointerdown", 300, 100));
    cible.dispatchEvent(ptr("pointermove", 100, 101));
    cible.dispatchEvent(ptr("pointercancel", 100, 101));
    expect(surBalayage).not.toHaveBeenCalled();
    expect(ul.querySelector('[data-id="a"]').style.translate).toBe("");
  });
  it("la souris et la poignée de déplacement gardent leur geste", () => {
    const ul = liste();
    const surBalayage = vi.fn();
    brancherGestes(ul, { surBalayage });
    const souris = ul.querySelector('[data-id="a"] .todo-corps');
    souris.dispatchEvent(ptr("pointerdown", 300, 100, { pointerType: "mouse" }));
    souris.dispatchEvent(ptr("pointermove", 100, 100, { pointerType: "mouse" }));
    souris.dispatchEvent(ptr("pointerup", 100, 100, { pointerType: "mouse" }));
    const poignee = ul.querySelector(".todo-poignee");
    poignee.dispatchEvent(ptr("pointerdown", 300, 100));
    poignee.dispatchEvent(ptr("pointermove", 100, 100));
    poignee.dispatchEvent(ptr("pointerup", 100, 100));
    expect(surBalayage).not.toHaveBeenCalled();
  });
  it("un appui long immobile ouvre le menu ; un doigt qui bouge, non", () => {
    vi.useFakeTimers();
    const ul = liste();
    const surAppuiLong = vi.fn();
    brancherGestes(ul, { surAppuiLong });
    const cible = ul.querySelector('[data-id="b"] .todo-corps');
    cible.dispatchEvent(ptr("pointerdown", 40, 60));
    vi.advanceTimersByTime(600);
    expect(surAppuiLong).toHaveBeenCalledWith("b", 40, 60);
    cible.dispatchEvent(ptr("pointerup", 40, 60));
    // Le clic qui suit le relâchement n'ouvre pas la ligne.
    const clic = new MouseEvent("click", { bubbles: true, cancelable: true });
    cible.dispatchEvent(clic);
    expect(clic.defaultPrevented).toBe(true);
    surAppuiLong.mockClear();
    cible.dispatchEvent(ptr("pointerdown", 40, 60));
    cible.dispatchEvent(ptr("pointermove", 40, 90));
    vi.advanceTimersByTime(600);
    expect(surAppuiLong).not.toHaveBeenCalled();
  });
});

describe("balayage dans la liste des todos", () => {
  it("balayer une ligne la supprime avec « Annuler » ; annuler rend la ligne", async () => {
    const fb = {
      ecouterSujets: (_u, rappel) => {
        queueMicrotask(() => rappel([{ id: "s1", nom: "S", ordre: 1, couleur: null, creeLe: 1, nbRestants: 1, nbTotal: 1 }], { depuisCache: false, enAttente: false }));
        return () => {};
      },
      ecouterCompteursTodos: (_u, rappel) => {
        queueMicrotask(() => rappel({ nbSujets: 1, nbTodos: 1, octets: 0 }));
        return () => {};
      },
      ecouterTodos: (_u, _s, rappel) => {
        queueMicrotask(() =>
          rappel(
            [{ id: "a", v: 1, sujetId: "s1", titre: "Pain", description: "", echeance: null, fait: false, faitLe: null, creeLe: 1, modifieLe: 1, ordre: 1, images: [] }],
            { depuisCache: false, enAttente: false, plein: false },
          ),
        );
        return () => {};
      },
      compterEnRetardTodos: async () => 0,
      supprimerTodo: vi.fn(async () => {}),
    };
    const p = creerPanneauTodos({ disponible: () => true, charger: async () => fb, uid: () => "u1" });
    document.body.append(p.bouton, p.panneau);
    p.ouvrir();
    await attendre();
    p.ouvrirSujet("s1");
    await attendre();
    await attendre();
    const cible = p.panneau.querySelector('[data-id="a"] .todo-corps');
    cible.dispatchEvent(ptr("pointerdown", 300, 100));
    cible.dispatchEvent(ptr("pointermove", 200, 101));
    cible.dispatchEvent(ptr("pointermove", 100, 102));
    cible.dispatchEvent(ptr("pointerup", 100, 102));
    expect(p.panneau.querySelector('[data-id="a"]')).toBeNull();
    document.querySelector(".toast-action").click();
    expect(p.panneau.querySelector('[data-id="a"]')).not.toBeNull();
    expect(fb.supprimerTodo).not.toHaveBeenCalled();
  });
});

describe("images sur iPhone", () => {
  it("écran tactile : le bouton propose « Photothèque » et « Prendre une photo »", () => {
    globalThis.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
    const g = creerGalerieTodo({ donnees: { etat: () => ({ compteurs: { octets: 0 } }) } });
    document.body.append(g.racine, g.bouton);
    const champs = [...g.racine.querySelectorAll('input[type="file"]')];
    expect(champs).toHaveLength(2);
    expect(champs.filter((c) => c.getAttribute("capture") === "environment")).toHaveLength(1);
    for (const c of champs) expect(c.accept).toBe("image/jpeg,image/png,image/webp");
    g.bouton.click();
    const libelles = [...document.querySelectorAll(".menu-entree")].map((b) => b.textContent);
    expect(libelles).toEqual(["Photothèque", "Prendre une photo"]);
  });

  it("une grosse photo est réduite pendant son décodage (mémoire), sinon décodée normalement", async () => {
    const grosse = new Blob([new Uint8Array(1)]);
    Object.defineProperty(grosse, "size", { value: GROS_FICHIER + 1 });
    const bitmap = { width: 2560, height: 1920, close() {} };
    const creerBitmap = vi.fn(async () => bitmap);
    const canvas = (l, h) => ({ width: l, height: h, getContext: () => ({ drawImage() {}, fillRect() {}, set fillStyle(_) {} }), toBlob: (cb, t) => cb(new Blob(["p"], { type: t })) });
    await preparerImage(grosse, { creerBitmap, creerCanvas: canvas });
    expect(creerBitmap.mock.calls[0][1]).toMatchObject({ imageOrientation: "from-image", resizeWidth: 2560 });
    // Le navigateur refuse l'option : repli sur le décodage normal.
    const refuse = vi
      .fn()
      .mockRejectedValueOnce(new Error("option"))
      .mockResolvedValueOnce(bitmap);
    await preparerImage(grosse, { creerBitmap: refuse, creerCanvas: canvas });
    expect(refuse).toHaveBeenCalledTimes(2);
    expect(refuse.mock.calls[1][1]).toEqual({ imageOrientation: "from-image" });
  });

  it("une petite image garde l'appel simple", async () => {
    const creerBitmap = vi.fn(async () => ({ width: 10, height: 10, close() {} }));
    const canvas = (l, h) => ({ width: l, height: h, getContext: () => ({ drawImage() {}, fillRect() {}, set fillStyle(_) {} }), toBlob: (cb, t) => cb(new Blob(["p"], { type: t })) });
    await preparerImage(new Blob(["x"]), { creerBitmap, creerCanvas: canvas });
    expect(creerBitmap).toHaveBeenCalledTimes(1);
    expect(creerBitmap.mock.calls[0][1]).toEqual({ imageOrientation: "from-image" });
  });
});

describe("extension inchangée (V6.9)", () => {
  const lister = (d) =>
    readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? lister(join(d, e.name)) : [join(d, e.name)]));
  it("aucune API de Chrome ni d'iOS appelée directement par les todos : tout passe par src/platform/", () => {
    for (const f of [...lister("src/ui/todos"), "src/ui/reglages/todos.js", "src/firebase/todos.js", "src/firebase/todosImages.js"]) {
      const source = readFileSync(f, "utf8");
      expect(source, f).not.toMatch(/\bchrome\./);
      expect(source, f).not.toMatch(/navigator\.share\b|navigator\.canShare/);
    }
  });
  it("aucun eruda ni ?debug dans les todos", () => {
    for (const f of lister("src/ui/todos")) expect(readFileSync(f, "utf8"), f).not.toMatch(/eruda/);
  });
});
