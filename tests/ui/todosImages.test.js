import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ErreurImage, preparerImage } from "../../src/ui/todos/compresserImage.js";
import { creerGalerieTodo } from "../../src/ui/todos/galerieTodo.js";

afterEach(() => document.body.replaceChildren());
const vraiSetTimeout = globalThis.setTimeout;
const attendre = () => new Promise((r) => vraiSetTimeout(r, 0));

/** A canvas that records what is drawn; `toBlob` answers with the asked type (or `reponse`). */
function fauxCanvas(reponse = null, tailles = []) {
  return (l, h) => {
    tailles.push([l, h]);
    return {
      width: l,
      height: h,
      getContext: () => ({ drawImage() {}, fillRect() {}, set fillStyle(_) {} }),
      toBlob: (cb, type) => cb(new Blob(["pixels"], { type: reponse ?? type })),
    };
  };
}

describe("preparerImage", () => {
  it("applique l'orientation EXIF, réduit à 1 920 px et ré-encode (donc plus d'EXIF)", async () => {
    const original = new Blob(["EXIF-GPS-48.85,2.35"], { type: "image/jpeg" });
    const creerBitmap = vi.fn(async () => ({ width: 4000, height: 3000, close: vi.fn() }));
    const tailles = [];
    const r = await preparerImage(original, { creerBitmap, creerCanvas: fauxCanvas(null, tailles) });
    expect(creerBitmap).toHaveBeenCalledWith(original, { imageOrientation: "from-image" });
    expect(tailles[0]).toEqual([1920, 1440]);
    expect(tailles[1]).toEqual([240, 180]);
    expect(r).toMatchObject({ largeur: 1920, hauteur: 1440, typeMime: "image/webp", ext: "webp" });
    // The result is made from the canvas: the bytes of the original (and its GPS) are not in it.
    expect(r.blob).not.toBe(original);
    expect(await r.blob.text()).not.toContain("GPS");
  });
  it("repli en JPEG quand le navigateur ne sait pas encoder en WebP", async () => {
    const creerBitmap = async () => ({ width: 100, height: 50, close() {} });
    const r = await preparerImage(new Blob(["x"]), {
      creerBitmap,
      creerCanvas: (l, h) => ({
        getContext: () => ({ drawImage() {}, fillRect() {}, set fillStyle(_) {} }),
        toBlob: (cb, type) => cb(new Blob(["p"], { type: type === "image/webp" ? "image/png" : type })),
        width: l,
        height: h,
      }),
    });
    expect(r).toMatchObject({ typeMime: "image/jpeg", ext: "jpg" });
  });
  it("une petite image n'est pas agrandie", async () => {
    const r = await preparerImage(new Blob(["x"]), {
      creerBitmap: async () => ({ width: 300, height: 200, close() {} }),
      creerCanvas: fauxCanvas(),
    });
    expect([r.largeur, r.hauteur]).toEqual([300, 200]);
  });
  it("un fichier qui n'est pas une image est refusé avec un message clair", async () => {
    const creerBitmap = async () => {
      throw new Error("decode");
    };
    await expect(preparerImage(new Blob(["MZ"]), { creerBitmap })).rejects.toBeInstanceOf(ErreurImage);
    await expect(preparerImage(new Blob(["MZ"]), { creerBitmap })).rejects.toThrow(/ne peut pas être lue/);
  });
  it("libère le bitmap", async () => {
    const close = vi.fn();
    await preparerImage(new Blob(["x"]), {
      creerBitmap: async () => ({ width: 10, height: 10, close }),
      creerCanvas: fauxCanvas(),
    });
    expect(close).toHaveBeenCalled();
  });
});

function monterGalerie({ images = [], octets = 0, enLigne = true } = {}) {
  Object.defineProperty(navigator, "onLine", { value: enLigne, configurable: true });
  const envoyerImage = vi.fn(async (_id, _img, opts) => {
    opts?.surProgres?.(0.5);
    return { promesse: Promise.resolve({ id: "x" }), annuler: vi.fn() };
  });
  const donnees = {
    etat: () => ({ compteurs: { octets } }),
    envoyerImage,
    lireImage: vi.fn(async () => new Blob(["png"], { type: "image/png" })),
    majNoteImage: vi.fn(async () => {}),
    reordonnerImages: vi.fn(async () => {}),
    supprimerImage: vi.fn(async () => {}),
  };
  const preparer = vi.fn(async (f) => ({ blob: new Blob([f.name]), mini: new Blob(["m"]), ext: "webp", typeMime: "image/webp", largeur: 1, hauteur: 1 }));
  const g = creerGalerieTodo({ donnees, preparer });
  const dialogue = document.createElement("dialog");
  dialogue.innerHTML = '<div class="todo-editeur-depot" hidden></div>';
  dialogue.append(g.racine);
  document.body.append(dialogue);
  const assurerExistence = vi.fn(async () => "t1");
  g.monter({ dialogue, id: () => "t1", assurerExistence });
  g.maj({ images });
  return { g, donnees, preparer, assurerExistence, dialogue };
}
const f = (name, type = "image/jpeg") => new File(["contenu"], name, { type });
const img = (i) => ({ id: String(i).padStart(32, "0"), chemin: `todos/u/t1/${String(i).padStart(32, "0")}.webp`, note: `n${i}`, taille: 10, typeMime: "image/webp", largeur: 1, hauteur: 1, ordre: i });

describe("galerie d'images", () => {
  it("ajoute plusieurs images une par une, avec progression", async () => {
    const { g, donnees, preparer } = monterGalerie();
    await g.ajouterFichiers([f("a.jpg"), f("b.png", "image/png")]);
    expect(preparer).toHaveBeenCalledTimes(2);
    expect(donnees.envoyerImage).toHaveBeenCalledTimes(2);
    expect(donnees.envoyerImage.mock.calls[0][0]).toBe("t1");
  });
  it("hors ligne : message clair, rien n'est envoyé", async () => {
    const { g, donnees, assurerExistence } = monterGalerie({ enLigne: false });
    await g.ajouterFichiers([f("a.jpg")]);
    expect(g.racine.textContent).toContain("Ajout d'image impossible hors ligne.");
    expect(donnees.envoyerImage).not.toHaveBeenCalled();
    expect(assurerExistence).not.toHaveBeenCalled();
  });
  it("la 11e image est refusée avec un message", async () => {
    const { g, donnees } = monterGalerie({ images: Array.from({ length: 10 }, (_, i) => img(i)) });
    await g.ajouterFichiers([f("a.jpg")]);
    expect(donnees.envoyerImage).not.toHaveBeenCalled();
    expect(g.racine.textContent).toContain("10 images au maximum");
    expect(g.bouton.disabled).toBe(true);
  });
  it("refuse SVG, GIF, HEIC sans rien envoyer", async () => {
    const { g, donnees } = monterGalerie();
    await g.ajouterFichiers([f("a.svg", "image/svg+xml")]);
    expect(g.racine.textContent).toContain("SVG");
    await g.ajouterFichiers([f("a.gif", "image/gif")]);
    expect(g.racine.textContent).toContain("GIF");
    await g.ajouterFichiers([f("a.heic", "image/heic")]);
    expect(g.racine.textContent).toContain("HEIC");
    expect(donnees.envoyerImage).not.toHaveBeenCalled();
  });
  it("une image illisible : message, pas d'erreur muette, bouton Réessayer", async () => {
    const { donnees } = monterGalerie();
    const preparer = async () => {
      throw new ErreurImage("Cette image ne peut pas être lue. Choisissez une photo JPEG, PNG ou WebP.");
    };
    const g2 = creerGalerieTodo({ donnees, preparer });
    document.body.append(g2.racine);
    g2.monter({ dialogue: document.querySelector("dialog"), id: () => "t1", assurerExistence: async () => "t1" });
    await g2.ajouterFichiers([f("a.jpg")]);
    expect(g2.racine.textContent).toContain("ne peut pas être lue");
    expect(g2.racine.textContent).toContain("Réessayer");
  });
  it("affiche une vignette par image, la note en texte (jamais en HTML)", async () => {
    const { g } = monterGalerie({
      images: [{ ...img(1), note: "<img src=x onerror=alert(1)>" }, img(2)],
    });
    const notes = [...g.racine.querySelectorAll(".todo-image-note")].map((n) => n.value);
    expect(notes).toEqual(["<img src=x onerror=alert(1)>", "n2"]);
    expect(g.racine.querySelectorAll("img").length).toBe(2);
    expect(g.racine.querySelector("[onerror]")).toBeNull();
    expect(g.racine.querySelector(".todo-vignette-image").alt).toContain("onerror");
  });
  it("la note est enregistrée 1,5 s après la dernière frappe", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { g, donnees } = monterGalerie({ images: [img(1)] });
    const champ = g.racine.querySelector(".todo-image-note");
    for (const t of ["a", "ab", "abc"]) {
      champ.value = t;
      champ.dispatchEvent(new Event("input", { bubbles: true }));
    }
    await vi.advanceTimersByTimeAsync(1600);
    vi.useRealTimers();
    expect(donnees.majNoteImage).toHaveBeenCalledOnce();
    expect(donnees.majNoteImage).toHaveBeenCalledWith("t1", img(1).id, "abc");
  });
  it("fermer écrit les notes en attente", async () => {
    const { g, donnees } = monterGalerie({ images: [img(1)] });
    const champ = g.racine.querySelector(".todo-image-note");
    champ.value = "à la volée";
    champ.dispatchEvent(new Event("input", { bubbles: true }));
    g.liberer();
    expect(donnees.majNoteImage).toHaveBeenCalledWith("t1", img(1).id, "à la volée");
  });
  it("la visionneuse s'ouvre au clic sur la vignette", async () => {
    const dlg = HTMLDialogElement.prototype;
    if (typeof dlg.showModal !== "function") {
      dlg.showModal = function () {
        this.setAttribute("open", "");
      };
      dlg.close = function () {
        this.removeAttribute("open");
        this.dispatchEvent(new Event("close"));
      };
    }
    URL.createObjectURL ??= () => "blob:test";
    URL.revokeObjectURL ??= () => {};
    const { g, donnees } = monterGalerie({ images: [img(1), img(2)] });
    g.racine.querySelector(".todo-vignette").click();
    await attendre();
    await attendre();
    const v = document.querySelector(".visionneuse");
    expect(v).not.toBeNull();
    expect(v.textContent).toContain("1 / 2");
    expect(donnees.lireImage).toHaveBeenCalledWith(img(1).chemin);
    v.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    await attendre();
    expect(v.textContent).toContain("2 / 2");
    expect(v.querySelector(".visionneuse-note").textContent).toBe("n2");
  });
});

describe("pas de lien public (V6.4)", () => {
  const lister = (d) =>
    readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? lister(join(d, e.name)) : [join(d, e.name)]));
  it("aucune occurrence de getDownloadURL dans le code ni dans les fonctions", () => {
    for (const fichier of [...lister("src"), ...lister("functions/src")]) {
      expect(readFileSync(fichier, "utf8"), fichier).not.toMatch(/getDownloadURL/);
    }
  });
  it("les images sont lues avec getBlob", () => {
    expect(readFileSync("src/firebase/todosImages.js", "utf8")).toContain("getBlob");
  });
});
