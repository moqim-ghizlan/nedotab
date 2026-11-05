// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { copierMarkdown, exporterTodo } from "../../src/ui/todos/exporterTodo.js";

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
});

const vraiSetTimeout = globalThis.setTimeout;
const attendre = () => new Promise((r) => vraiSetTimeout(r, 0));
const todo = (images = []) => ({
  id: "t1",
  titre: "Rapport : v2",
  description: "du texte",
  creeLe: new Date(2026, 10, 4, 12).getTime(),
  modifieLe: new Date(2026, 10, 5, 12).getTime(),
  echeance: null,
  fait: false,
  images,
});
const image = (i) => ({ id: `i${i}`, chemin: `todos/u/t/${i}.webp`, note: `n${i}`, typeMime: "image/webp", ordre: i });
const blob = (n) => new Blob([new Uint8Array(n).fill(7)], { type: "image/webp" });

describe("exporterTodo", () => {
  it("sans image : un fichier .md au nom valide", async () => {
    const livrer = vi.fn(async () => "telecharge");
    const r = await exporterTodo({ todo: todo(), sujet: { nom: "Travail" }, lireImage: vi.fn(), livrer });
    expect(r).toMatchObject({ ok: true, nom: "Rapport-v2.md" });
    const fichier = livrer.mock.calls[0][0];
    expect(fichier.name).toBe("Rapport-v2.md");
    expect(await fichier.text()).toContain('titre: "Rapport : v2"');
    expect(document.querySelector(".toast").textContent).toContain("Exporté ✓");
  });

  it("avec images : un .zip, images lues UNE PAR UNE, avec progression", async () => {
    let enCours = 0;
    let maxSimultane = 0;
    const lireImage = vi.fn(async () => {
      enCours++;
      maxSimultane = Math.max(maxSimultane, enCours);
      await attendre();
      enCours--;
      return blob(10);
    });
    const livrer = vi.fn(async () => "telecharge");
    const r = await exporterTodo({ todo: todo([image(1), image(2), image(3)]), sujet: null, lireImage, livrer });
    expect(maxSimultane).toBe(1);
    expect(lireImage.mock.calls.map((c) => c[0])).toEqual(["todos/u/t/1.webp", "todos/u/t/2.webp", "todos/u/t/3.webp"]);
    expect(r).toMatchObject({ ok: true, nom: "Rapport-v2.zip" });
    const fichier = livrer.mock.calls[0][0];
    expect(fichier.type).toBe("application/zip");
    const octets = new Uint8Array(await fichier.arrayBuffer());
    const texte = new TextDecoder("latin1").decode(octets);
    for (const nom of ["Rapport-v2/Rapport-v2.md", "Rapport-v2/images/01.webp", "Rapport-v2/images/03.webp"])
      expect(texte).toContain(nom);
  });

  it("annulation en cours d'export : rien n'est livré", async () => {
    const lireImage = vi.fn(async () => {
      await attendre();
      return blob(5);
    });
    const livrer = vi.fn(async () => "telecharge");
    const promesse = exporterTodo({ todo: todo([image(1), image(2), image(3)]), sujet: null, lireImage, livrer });
    await attendre();
    document.querySelector(".toast-action").click();
    const r = await promesse;
    expect(r).toMatchObject({ ok: false, annule: true });
    expect(livrer).not.toHaveBeenCalled();
    expect(lireImage.mock.calls.length).toBeLessThan(3);
    expect(document.querySelector(".toast").textContent).toContain("Export annulé");
  });

  it("hors ligne avec des images : message clair, rien n'est lu", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    const lireImage = vi.fn();
    const livrer = vi.fn();
    const r = await exporterTodo({ todo: todo([image(1)]), sujet: null, lireImage, livrer });
    expect(r).toMatchObject({ ok: false, erreur: "Hors ligne : les images ne sont pas disponibles" });
    expect(lireImage).not.toHaveBeenCalled();
    expect(livrer).not.toHaveBeenCalled();
  });

  it("hors ligne sans image : l'export texte marche", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    const livrer = vi.fn(async () => "telecharge");
    expect((await exporterTodo({ todo: todo(), sujet: null, lireImage: vi.fn(), livrer })).ok).toBe(true);
  });

  it("une image illisible arrête l'export avec un message", async () => {
    const livrer = vi.fn();
    const r = await exporterTodo({
      todo: todo([image(1)]),
      sujet: null,
      lireImage: async () => {
        throw new Error("storage/object-not-found");
      },
      livrer,
    });
    expect(r.ok).toBe(false);
    expect(livrer).not.toHaveBeenCalled();
  });

  it("feuille de partage refusée (geste trop ancien) : un bouton « Partager » donne un nouveau geste", async () => {
    const livrer = vi.fn().mockResolvedValueOnce("bloque").mockResolvedValueOnce("partage");
    await exporterTodo({ todo: todo(), sujet: null, lireImage: vi.fn(), livrer });
    document.querySelector(".toast-action").click();
    await attendre();
    expect(livrer).toHaveBeenCalledTimes(2);
    expect(livrer.mock.calls[1][0]).toBe(livrer.mock.calls[0][0]);
  });
});

describe("copierMarkdown", () => {
  it("copie le texte sans images", async () => {
    const copier = vi.fn(async () => {});
    expect(await copierMarkdown({ todo: todo([image(1)]), sujet: { nom: "S" }, copier })).toBe(true);
    expect(copier.mock.calls[0][0]).toContain("# Rapport : v2");
    expect(copier.mock.calls[0][0]).not.toContain("images/");
    expect(document.querySelector(".toast").textContent).toContain("Copié en Markdown");
  });
  it("presse-papiers refusé : message qui dit quoi faire", async () => {
    const copier = vi.fn(async () => {
      throw new Error("NotAllowedError");
    });
    expect(await copierMarkdown({ todo: todo(), sujet: null, copier })).toBe(false);
    expect(document.querySelector(".toast").textContent).toContain("autorisez le presse-papiers");
  });
});
