// Generates the extension icons (rounded teal tile with a 2x2 grid mark) as PNG files,
// without any dependency: pixels are computed with 4x4 supersampling and encoded with zlib.
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
function couleur(x, y) {
  if (!dansRectArrondi(x, y, 0.02, 0.02, 0.98, 0.98, 0.22)) return null;
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

function png(taille) {
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
          const c = couleur((px + (sx + 0.5) / ss) / taille, (py + (sy + 0.5) / ss) / taille);
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
console.log("Icônes générées.");
