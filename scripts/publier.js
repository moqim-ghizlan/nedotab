// Prepares a release locally: extension build → remote-code check → zip + SHA-256 →
// copy of the zip into the site → site build with the version injected.
// Nothing is uploaded or deployed: publishing is done by the owner, or with their consent.
import { execSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { inflateRawSync } from "node:zlib";

const run = (cmd) => execSync(cmd, { stdio: "inherit" });
const { version } = JSON.parse(readFileSync("package.json", "utf8"));
const [maj, min] = version.split(".");
const zip = `release/NedoTab-V${maj}.${min}-Extension.zip`;

run("npm run package");

/** Names and manifest of a zip written by scripts/empaqueter.js (central directory). */
function lireZip(octets) {
  const fin = octets.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  let pos = octets.readUInt32LE(fin + 16);
  const noms = [];
  let manifeste = null;
  for (let i = 0; i < octets.readUInt16LE(fin + 10); i++) {
    const taille = octets.readUInt32LE(pos + 20);
    const lnom = octets.readUInt16LE(pos + 28);
    const local = octets.readUInt32LE(pos + 42);
    const nom = octets.subarray(pos + 46, pos + 46 + lnom).toString();
    noms.push(nom);
    if (nom === "manifest.json") {
      const debut = local + 30 + octets.readUInt16LE(local + 26) + octets.readUInt16LE(local + 28);
      manifeste = JSON.parse(inflateRawSync(octets.subarray(debut, debut + taille)).toString());
    }
    pos += 46 + lnom + octets.readUInt16LE(pos + 30) + octets.readUInt16LE(pos + 32);
  }
  return { noms, manifeste };
}

const { noms, manifeste } = lireZip(readFileSync(zip));
if (!noms.includes("manifest.json")) throw new Error("manifest.json n'est pas à la racine du zip");
if (manifeste?.version !== version)
  throw new Error(`Version du manifeste ${manifeste?.version} ≠ ${version}`);
console.log(
  `Zip vérifié : ${noms.length} fichiers, manifest.json à la racine, version ${version}.`,
);

const dossier = "site/public/telechargement";
mkdirSync(dossier, { recursive: true });
for (const ancien of readdirSync(dossier)) rmSync(`${dossier}/${ancien}`);
copyFileSync(zip, `${dossier}/NedoTab-${version}.zip`);
run("npm run build:site");
run("node scripts/verifier-liens.js dist/site");
console.log(`Prêt : release/ et dist/site/ (NedoTab-${version}.zip). Rien n'a été mis en ligne.`);
