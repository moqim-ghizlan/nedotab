import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/ui/services/icones.js", () => ({
  chargerImage: vi.fn(async () => ({ naturalWidth: 400, naturalHeight: 300 })),
}));

const { compterGraphemes, importerImage, poidsDataUrl, POIDS_MAX } =
  await import("../../src/ui/services/imageIcone.js");

function simulerCanvas(base64) {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage() {} });
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
    `data:image/webp;base64,${base64}`,
  );
}

afterEach(() => vi.restoreAllMocks());
URL.createObjectURL ??= () => "blob:x";
URL.revokeObjectURL ??= () => {};

describe("importerImage", () => {
  it("refuse une image trop lourde après compression", async () => {
    simulerCanvas("A".repeat(Math.ceil(((POIDS_MAX + 100) * 4) / 3)));
    const r = await importerImage(new File(["x"], "photo.png", { type: "image/png" }));
    expect(r).toEqual({
      ok: false,
      erreur: "Image trop détaillée, essayez une image plus simple.",
    });
  });
  it("accepte une image légère", async () => {
    simulerCanvas("A".repeat(400));
    const r = await importerImage(new File(["x"], "logo.svg", { type: "image/svg+xml" }));
    expect(r.ok).toBe(true);
    expect(r.dataUrl.startsWith("data:image/webp")).toBe(true);
  });
  it("refuse les formats non pris en charge", async () => {
    const r = await importerImage(new File(["x"], "a.gif", { type: "image/gif" }));
    expect(r.ok).toBe(false);
  });
});

describe("utilitaires", () => {
  it("poidsDataUrl", () => {
    expect(poidsDataUrl("data:image/png;base64,QUJD")).toBe(3);
    expect(poidsDataUrl("data:image/png;base64,QUI=")).toBe(2);
  });
  it("un emoji composé compte pour un", () => {
    expect(compterGraphemes("✈️")).toBe(1);
    expect(compterGraphemes("👩‍👩‍👧A")).toBe(2);
  });
});

describe("fond : dimensions", async () => {
  const { dimensionsReduites } = await import("../../src/ui/services/imageFond.js");
  it("le plus grand côté fait au plus 2560 px", () => {
    expect(dimensionsReduites(4032, 3024)).toEqual({ largeur: 2560, hauteur: 1920 });
    expect(dimensionsReduites(1000, 3000)).toEqual({ largeur: 853, hauteur: 2560 });
    expect(dimensionsReduites(800, 600)).toEqual({ largeur: 800, hauteur: 600 });
  });
});
