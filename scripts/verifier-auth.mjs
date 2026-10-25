// V3.2: each target carries only its own Google sign-in. Run after both builds:
// the extension uses chrome.identity (no redirect pages), the web app the redirect.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const lire = (cible) => {
  const dossier = join("dist", cible, "assets");
  return readdirSync(dossier)
    .filter((f) => f.endsWith(".js"))
    .map((f) => readFileSync(join(dossier, f), "utf8"))
    .join("\n");
};

const regles = [
  ["extension", "__/auth/handler", false, "pages de redirection de l'application web"],
  ["extension", "identity.getAuthToken", true, "connexion par chrome.identity"],
  ["pwa", "__/auth/handler", true, "connexion par redirection"],
  ["pwa", "identity.getAuthToken", false, "code chrome.identity de l'extension"],
];

let echec = false;
for (const [cible, motif, attendu, quoi] of regles) {
  const present = lire(cible).includes(motif);
  const ok = present === attendu;
  if (!ok) echec = true;
  console.log(
    `${ok ? "OK " : "ERR"} ${cible} : ${attendu ? "contient" : "ne contient pas"} ${quoi}`,
  );
}
process.exit(echec ? 1 : 0);
