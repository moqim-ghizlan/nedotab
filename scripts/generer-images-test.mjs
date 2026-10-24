// Generates the images used by the browser test of the icon import (V1.4):
// a ~2 MB PNG that becomes a small icon, and a pure-noise PNG that stays too detailed.
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { crc32, deflateSync } from "node:zlib";

function png(taille, pixel, niveau = 6) {
  const lignes = [];
  for (let y = 0; y < taille; y++) {
    const l = Buffer.alloc(1 + taille * 3);
    for (let x = 0; x < taille; x++) l.set(pixel(x, y), 1 + x * 3);
    lignes.push(l);
  }
  const bloc = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(taille, 0);
  ihdr.writeUInt32BE(taille, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    bloc("IHDR", ihdr),
    bloc("IDAT", deflateSync(Buffer.concat(lignes), { level: niveau })),
    bloc("IEND", Buffer.alloc(0)),
  ]);
}

export function genererImagesTest(dossier) {
  mkdirSync(dossier, { recursive: true });
  const alea = randomBytes(1 << 20);
  let pos = 0;
  const hasard = () => alea[pos++ & 0xfffff];
  // Smooth picture with light grain: heavy file, simple once reduced to 96 px.
  const lisse = png(
    1100,
    (x, y) => {
      const d = Math.hypot(x - 550, y - 550) < 380;
      const g = hasard() & 15;
      return d ? [44 + g, 107 + g, 90 + g] : [240 - g, 236 - g, 225 - g];
    },
    0,
  );
  writeFileSync(join(dossier, "grande-simple.png"), lisse);
  const bruit = png(400, () => [hasard(), hasard(), hasard()]);
  writeFileSync(join(dossier, "bruit.png"), bruit);
  console.log(
    `grande-simple.png ${(lisse.length / 1048576).toFixed(2)} Mo, bruit.png ${(bruit.length / 1024).toFixed(0)} Ko`,
  );
  return { simple: join(dossier, "grande-simple.png"), bruit: join(dossier, "bruit.png") };
}
