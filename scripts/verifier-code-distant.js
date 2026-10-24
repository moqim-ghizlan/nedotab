// Fails (exit 1) if the built package contains remote code or dynamic code evaluation.
// Plain URL strings are data, not code, and are not reported.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const MOTIFS = [
  /<script[^>]+src=["']?https?:/i,
  /import\(\s*["'`]https?:/,
  /import\s+["'`]https?:/,
  /from\s+["'`]https?:/,
  /importScripts\(\s*["'`]https?:/,
  /\beval\(/,
  /new Function\(/,
];

export function analyserTexte(texte) {
  const problemes = [];
  texte.split(/\r?\n/).forEach((ligne, i) => {
    for (const motif of MOTIFS) {
      if (motif.test(ligne)) problemes.push({ ligne: i + 1, motif: String(motif) });
    }
  });
  return problemes;
}

function* fichiers(dossier) {
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) yield* fichiers(chemin);
    else if ([".html", ".js", ".mjs"].includes(extname(nom))) yield chemin;
  }
}

if (process.argv[1] && process.argv[1].endsWith("verifier-code-distant.js")) {
  const dossier = process.argv[2] || "dist/extension";
  let erreurs = 0;
  for (const f of fichiers(dossier)) {
    for (const p of analyserTexte(readFileSync(f, "utf8"))) {
      console.error(`${f}:${p.ligne} — motif interdit ${p.motif}`);
      erreurs++;
    }
  }
  if (erreurs) {
    console.error(`${erreurs} problème(s) de code distant.`);
    process.exit(1);
  }
  console.log(`Aucun code distant dans ${dossier}.`);
}
