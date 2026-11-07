import { describe, expect, it } from "vitest";
import { doitConvertirEnPng, estImageSortie, extensionImage, nomTelechargementImage } from "../../src/core/imageSortie.js";

describe("imageSortie", () => {
  it("reconnaît les images, jamais un SVG", () => {
    expect(estImageSortie("a.webp", "image/webp")).toBe(true);
    expect(estImageSortie("photo.JPG", "")).toBe(true);
    expect(estImageSortie("a.svg", "image/svg+xml")).toBe(false);
    expect(estImageSortie("a.pdf", "application/pdf")).toBe(false);
  });
  it("PNG : copié tel quel ; webp / jpg : convertis", () => {
    expect(doitConvertirEnPng("image/png")).toBe(false);
    expect(doitConvertirEnPng("image/webp")).toBe(true);
    expect(doitConvertirEnPng("image/jpeg")).toBe(true);
  });
  it("extension et nom de téléchargement", () => {
    expect(extensionImage("image/jpeg")).toBe("jpg");
    expect(extensionImage("", "x.jpeg")).toBe("jpg");
    expect(nomTelechargementImage({ nomOrigine: "vacances.jpg", typeMime: "image/jpeg" })).toBe("vacances.jpg");
    expect(nomTelechargementImage({ titre: "Mon todo : à faire ?", typeMime: "image/webp" })).toBe("Mon todo à faire.webp");
    expect(nomTelechargementImage({ titre: "", typeMime: "image/webp" })).toBe("image.webp");
  });
});
