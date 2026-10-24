// Checks that every internal link of the built site points to an existing file, and that
// the version shown is the one of package.json. Usage: node scripts/verifier-liens.js dist/site
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, posix } from "node:path";

/** Internal links (href/src) of an HTML page: no scheme, no anchor-only, no mailto. */
export function liensInternes(html) {
  const liens = [];
  for (const m of html.matchAll(/\s(?:href|src|srcset)="([^"]+)"/g)) {
    const valeur = m[1].split(/\s+/)[0];
    if (/^([a-z][a-z0-9+.-]*:|#|\/\/)/i.test(valeur)) continue;
    liens.push(valeur.split("#")[0].split("?")[0]);
  }
  return liens.filter(Boolean);
}

export function verifierSite(dossier, version) {
  const erreurs = [];
  const pages = readdirSync(dossier).filter((f) => f.endsWith(".html"));
  for (const page of pages) {
    const html = readFileSync(join(dossier, page), "utf8");
    for (const lien of liensInternes(html)) {
      if (!existsSync(join(dossier, posix.normalize(lien)))) erreurs.push(`${page} → ${lien}`);
    }
    if (/%[A-Z_]+%/.test(html))
      erreurs.push(`${page} : valeur non remplacée ${html.match(/%[A-Z_]+%/)[0]}`);
    if (version && !html.includes(version)) erreurs.push(`${page} : version ${version} absente`);
  }
  return { pages: pages.length, erreurs };
}

if (process.argv[1]?.endsWith("verifier-liens.js")) {
  const dossier = process.argv[2] || "dist/site";
  const { version } = JSON.parse(readFileSync("package.json", "utf8"));
  const { pages, erreurs } = verifierSite(dossier, version);
  for (const e of erreurs) console.error(`ERREUR ${e}`);
  if (erreurs.length) process.exit(1);
  console.log(`${pages} pages : liens internes valides, version ${version} affichée partout.`);
}
