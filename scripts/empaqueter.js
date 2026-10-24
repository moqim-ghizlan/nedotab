// Builds release/NedoTab-V<x.y>-Extension.zip from the content of dist/extension
// (manifest.json at the root of the archive) and writes its SHA-256 next to it.
// Minimal ZIP writer (deflate + central directory) to avoid any extra dependency.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { crc32, deflateRawSync } from "node:zlib";

const SOURCE = "dist/extension";
const manifest = JSON.parse(readFileSync(join(SOURCE, "manifest.json"), "utf8"));
const [maj, min] = manifest.version.split(".");
const nom = `NedoTab-V${maj}.${min}-Extension.zip`;

function* fichiers(dossier) {
  for (const n of readdirSync(dossier).sort()) {
    const chemin = join(dossier, n);
    if (statSync(chemin).isDirectory()) yield* fichiers(chemin);
    else if (!n.endsWith(".map")) yield chemin;
  }
}

const locaux = [];
const centraux = [];
let decalage = 0;
for (const chemin of fichiers(SOURCE)) {
  const nomFichier = Buffer.from(relative(SOURCE, chemin).split("\\").join("/"));
  const donnees = readFileSync(chemin);
  const comprime = deflateRawSync(donnees, { level: 9 });
  const crc = crc32(donnees);
  const entete = Buffer.alloc(30);
  entete.writeUInt32LE(0x04034b50, 0);
  entete.writeUInt16LE(20, 4);
  entete.writeUInt16LE(0x0800, 6);
  entete.writeUInt16LE(8, 8);
  entete.writeUInt16LE(0, 10);
  entete.writeUInt16LE(0x21, 12);
  entete.writeUInt32LE(crc, 14);
  entete.writeUInt32LE(comprime.length, 18);
  entete.writeUInt32LE(donnees.length, 22);
  entete.writeUInt16LE(nomFichier.length, 26);
  locaux.push(entete, nomFichier, comprime);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x0800, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt16LE(0, 12);
  central.writeUInt16LE(0x21, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(comprime.length, 20);
  central.writeUInt32LE(donnees.length, 24);
  central.writeUInt16LE(nomFichier.length, 28);
  central.writeUInt32LE(decalage, 42);
  centraux.push(central, nomFichier);
  decalage += entete.length + nomFichier.length + comprime.length;
}
const repertoire = Buffer.concat(centraux);
const fin = Buffer.alloc(22);
fin.writeUInt32LE(0x06054b50, 0);
fin.writeUInt16LE(centraux.length / 2, 8);
fin.writeUInt16LE(centraux.length / 2, 10);
fin.writeUInt32LE(repertoire.length, 12);
fin.writeUInt32LE(decalage, 16);
const zip = Buffer.concat([...locaux, repertoire, fin]);

mkdirSync("release", { recursive: true });
writeFileSync(join("release", nom), zip);
const empreinte = createHash("sha256").update(zip).digest("hex");
writeFileSync(join("release", `${nom}.sha256`), `${empreinte}  ${nom}\n`);
console.log(`release/${nom} (${(zip.length / 1024).toFixed(1)} Ko, version ${manifest.version})`);
console.log(`SHA-256 ${empreinte}`);
