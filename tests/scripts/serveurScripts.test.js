import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// V5.10 : les scripts du serveur (Bash) sont syntaxiquement valides (bash -n), commencent par
// set -euo pipefail (sauf les outils de lecture), et ne contiennent aucun secret en dur.
// shellcheck n'est pas disponible partout : `npm run lint:serveur` le lance là où il existe.
const BASH = ["C:/Program Files/Git/bin/bash.exe", "/bin/bash", "/usr/bin/bash"].find((b) =>
  existsSync(b),
);
const RACINE = join(process.cwd(), "serveur");
const dossiers = ["scripts", "agent"].map((d) => join(RACINE, d));
const scripts = dossiers.flatMap((d) =>
  readdirSync(d)
    .filter((f) => f.endsWith(".sh"))
    .map((f) => join(d, f)),
);

describe.skipIf(!BASH)("scripts du serveur", () => {
  it.each(scripts.map((s) => [s.slice(RACINE.length + 1).replaceAll("\\", "/"), s]))(
    "%s : syntaxe valide",
    (_nom, chemin) => {
      const r = spawnSync(BASH, ["-n", chemin.replaceAll("\\", "/")], { encoding: "utf8" });
      expect(r.stderr).toBe("");
      expect(r.status).toBe(0);
    },
  );

  it.each(scripts.map((s) => [s.slice(RACINE.length + 1).replaceAll("\\", "/"), s]))(
    "%s : mode strict et pas de secret en dur",
    (nom, chemin) => {
      const t = readFileSync(chemin, "utf8");
      // Les outils de lecture (audit, etat, agents) restent sans -e : une erreur ne les arrête pas.
      expect(t).toMatch(/^set -[a-z]*u[a-z]*o pipefail/m);
      expect(t).not.toMatch(/(password|mot_de_passe|jeton)\s*=\s*["']?[A-Za-z0-9]{20,}/i);
      expect(t).not.toMatch(/AGE-SECRET-KEY-/);
    },
  );

  it("la sauvegarde ne passe jamais par un fichier en clair et n'inclut pas les comptes", () => {
    const t = readFileSync(join(RACINE, "scripts/sauvegarder.sh"), "utf8");
    expect(t).toMatch(/\| age -r/);
    expect(t).not.toMatch(/etc\/squid\/comptes/);
    expect(t).not.toMatch(/\.tar\.gz"?\s*$/m);
  });

  it("l'audit est en lecture seule : aucune commande qui modifie", () => {
    const t = readFileSync(join(RACINE, "scripts/audit.sh"), "utf8");
    expect(t).not.toMatch(
      /\b(rm|mv|chmod|chown|systemctl (start|stop|restart|enable|disable)|ufw (allow|deny|enable)|iptables -[AIDF])\b/,
    );
  });
});
