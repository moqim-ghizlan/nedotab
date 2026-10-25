import { existsSync, readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";

/** Size, colour type and RGBA pixels of a PNG written by scripts/generer-icones.js. */
function lirePng(chemin) {
  const o = readFileSync(chemin);
  expect(o.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  let pos = 8;
  let ihdr = null;
  const idat = [];
  while (pos < o.length) {
    const longueur = o.readUInt32BE(pos);
    const type = o.subarray(pos + 4, pos + 8).toString();
    const donnees = o.subarray(pos + 8, pos + 8 + longueur);
    if (type === "IHDR") ihdr = donnees;
    if (type === "IDAT") idat.push(donnees);
    pos += 12 + longueur;
  }
  const largeur = ihdr.readUInt32BE(0);
  const hauteur = ihdr.readUInt32BE(4);
  const brut = inflateSync(Buffer.concat(idat));
  return { largeur, hauteur, typeCouleur: ihdr[9], brut, ligne: 1 + largeur * 4 };
}

const manifeste = JSON.parse(readFileSync("public/manifest.webmanifest", "utf8"));
const index = readFileSync("index.html", "utf8");

describe("installation sur l'écran d'accueil (V3.1)", () => {
  it("manifeste complet : nom court, plein écran, portée cohérente", () => {
    expect(manifeste.short_name.length).toBeLessThanOrEqual(12);
    expect(manifeste.display).toBe("standalone");
    expect(manifeste.start_url.startsWith(manifeste.scope)).toBe(true);
    expect(manifeste.icons.some((i) => i.purpose === "maskable")).toBe(true);
    expect(manifeste.icons.some((i) => i.sizes === "512x512" && i.purpose === "any")).toBe(true);
  });

  it("chaque icône référencée existe, à la taille annoncée", () => {
    const references = [
      ...manifeste.icons.map((i) => [i.src, i.sizes]),
      ...[...index.matchAll(/href="(\/icons\/[^"]+\.png)"/g)].map((m) => [m[1], null]),
    ];
    for (const [src, tailles] of references) {
      const chemin = `public${src}`;
      expect(existsSync(chemin), chemin).toBe(true);
      if (tailles) {
        const { largeur, hauteur } = lirePng(chemin);
        expect(`${largeur}x${hauteur}`).toBe(tailles);
      }
    }
  });

  it("icône iOS : 180 × 180, entièrement opaque (iOS remplirait la transparence en noir)", () => {
    const { largeur, hauteur, typeCouleur, brut, ligne } = lirePng(
      "public/icons/apple-touch-icon.png",
    );
    expect([largeur, hauteur]).toEqual([180, 180]);
    expect(typeCouleur).toBe(6); // RGBA, unfiltered rows
    for (let y = 0; y < hauteur; y++) {
      expect(brut[y * ligne]).toBe(0);
      for (let x = 0; x < largeur; x++) expect(brut[y * ligne + 1 + x * 4 + 3]).toBe(255);
    }
  });

  it("le <head> annonce le manifeste, l'icône iOS et le plein écran", () => {
    expect(index).toContain('rel="manifest" href="/manifest.webmanifest"');
    expect(index).toContain('rel="apple-touch-icon" href="/icons/apple-touch-icon.png"');
    expect(index).toContain('name="apple-mobile-web-app-capable" content="yes"');
    expect(index).toContain("viewport-fit=cover");
  });
});
