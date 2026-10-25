// Generates the icons (teal background with a 2x2 grid mark) as PNG files, without any
// dependency: pixels are computed with 4x4 supersampling and encoded with zlib. The drawing
// below is the single source of every icon (V3.1), in three forms:
// - "tuile": rounded tile on a transparent background (extension, favicon, "any" icons);
// - "plein": square and opaque, for iOS (apple-touch-icon: iOS rounds the corners itself and
//   fills any transparency with black);
// - "masquable": opaque, the mark inside the central safe zone (Android "maskable" icon).
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync, crc32 } from "node:zlib";

const TAILLES = [16, 32, 48, 128, 192, 512];
const FOND = [44, 107, 90];
const MARQUE = [245, 247, 242];

function dansRectArrondi(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

// Coordinates are in a 0..1 square.
function couleur(x0, y0, forme = "tuile") {
  if (forme === "tuile" && !dansRectArrondi(x0, y0, 0.02, 0.02, 0.98, 0.98, 0.22)) return null;
  // Maskable: the mark shrunk around the centre, well inside the 80 % safe circle.
  const echelle = forme === "masquable" ? 0.82 : 1;
  const x = 0.5 + (x0 - 0.5) / echelle;
  const y = 0.5 + (y0 - 0.5) / echelle;
  const cases = [
    [0.24, 0.24],
    [0.53, 0.24],
    [0.24, 0.53],
  ];
  for (const [cx, cy] of cases) {
    if (dansRectArrondi(x, y, cx, cy, cx + 0.23, cy + 0.23, 0.06)) return MARQUE;
  }
  // The fourth cell is a ring: the "folder" of the grid.
  const ext = dansRectArrondi(x, y, 0.53, 0.53, 0.76, 0.76, 0.06);
  const int = dansRectArrondi(x, y, 0.575, 0.575, 0.715, 0.715, 0.03);
  if (ext && !int) return MARQUE;
  return FOND;
}

function png(taille, forme = "tuile") {
  const ss = 4;
  const lignes = [];
  for (let py = 0; py < taille; py++) {
    const ligne = Buffer.alloc(1 + taille * 4);
    for (let px = 0; px < taille; px++) {
      let r = 0,
        g = 0,
        b = 0,
        a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const c = couleur(
            (px + (sx + 0.5) / ss) / taille,
            (py + (sy + 0.5) / ss) / taille,
            forme,
          );
          if (c) {
            r += c[0];
            g += c[1];
            b += c[2];
            a += 1;
          }
        }
      }
      const o = 1 + px * 4;
      if (a) {
        ligne[o] = Math.round(r / a);
        ligne[o + 1] = Math.round(g / a);
        ligne[o + 2] = Math.round(b / a);
      }
      ligne[o + 3] = Math.round((a / (ss * ss)) * 255);
    }
    lignes.push(ligne);
  }
  const bloc = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(taille, 0);
  ihdr.writeUInt32BE(taille, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    bloc("IHDR", ihdr),
    bloc("IDAT", deflateSync(Buffer.concat(lignes))),
    bloc("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync("extension/icons", { recursive: true });
for (const t of [16, 32, 48, 128]) writeFileSync(`extension/icons/${t}.png`, png(t));
mkdirSync("public/icons", { recursive: true });
for (const t of TAILLES) writeFileSync(`public/icons/${t}.png`, png(t));
// Web app (V3.1): manifest icons, iOS home screen icon, favicon.
writeFileSync("public/icons/icon-192.png", png(192));
writeFileSync("public/icons/icon-512.png", png(512));
writeFileSync("public/icons/icon-maskable-512.png", png(512, "masquable"));
writeFileSync("public/icons/apple-touch-icon.png", png(180, "plein"));
writeFileSync("public/icons/favicon-32.png", png(32));
console.log("Icônes générées.");
