import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// V5.2: l'agent du serveur (Bash). On l'exécute avec un faux curl et un faux « assistant root » :
// rien n'est installé pour de vrai. Règle testée : en cas de doute, la liste actuelle est conservée.
const BASH = ["C:/Program Files/Git/bin/bash.exe", "/bin/bash", "/usr/bin/bash"].find((b) =>
  existsSync(b),
);
const slash = (p) => p.replaceAll("\\", "/");

const EMP = (c) => `$2y$10$${c.repeat(53)}`; // 7 + 53 caractères : forme d'un hash bcrypt
const corps = (version, comptes) =>
  JSON.stringify({
    version,
    comptes: comptes.map(([compte, c]) => ({ compte, empreinte: EMP(c) })),
  });

let dir;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "agent-vpn-"));
  const d = slash(dir);
  writeFileSync(
    join(dir, "env"),
    "VPN_AGENT_URL=https://exemple.test/vpnAgentSynchro\nVPN_AGENT_JETON=jeton_de_test_de_l_agent_0123456789\n",
  );
  writeFileSync(
    join(dir, "curl-faux.sh"),
    [
      "#!/usr/bin/env bash",
      'while [ $# -gt 0 ]; do [ "$1" = "-o" ] && out="$2"; shift; done',
      "cat > /dev/null",
      '[ "${FAUX_RESEAU:-0}" = 1 ] && exit 6',
      'cat "$FAUX_CORPS" > "$out"',
      "printf '%s' \"${FAUX_CODE:-200}\"",
    ].join("\n"),
  );
  writeFileSync(
    join(dir, "appliquer-faux.sh"),
    [
      "#!/usr/bin/env bash",
      `echo "appel" >> "${d}/appels"`,
      `cp "$1" "${d}/installe"`,
    ].join("\n"),
  );
  chmodSync(join(dir, "curl-faux.sh"), 0o755);
  chmodSync(join(dir, "appliquer-faux.sh"), 0o755);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function lancer(reponse, { code = "200", reseau = false } = {}) {
  const d = slash(dir);
  writeFileSync(join(dir, "reponse.json"), reponse);
  return spawnSync(BASH, [slash(join(process.cwd(), "serveur/agent/vpn-agent.sh"))], {
    encoding: "utf8",
    env: {
      ...process.env,
      VPN_AGENT_ENV: `${d}/env`,
      VPN_AGENT_ETAT: `${d}/etat`,
      VPN_AGENT_CURL: `${d}/curl-faux.sh`,
      VPN_AGENT_APPLIQUER: `${d}/appliquer-faux.sh`,
      FAUX_CORPS: `${d}/reponse.json`,
      FAUX_CODE: code,
      FAUX_RESEAU: reseau ? "1" : "0",
    },
  });
}
const appels = () => (existsSync(join(dir, "appels")) ? readFileSync(join(dir, "appels"), "utf8").trim().split("\n").length : 0);
const installe = () => (existsSync(join(dir, "installe")) ? readFileSync(join(dir, "installe"), "utf8") : null);
const version = () => (existsSync(join(dir, "etat", "version")) ? readFileSync(join(dir, "etat", "version"), "utf8").trim() : null);

describe.skipIf(!BASH)("agent du serveur", () => {
  it("nouvelle version : écrit « compte:empreinte », applique une fois, retient la version", () => {
    const r = lancer(corps(5, [["u_abcdefghij", "a"], ["u_0123456789", "B"]]));
    expect(r.status).toBe(0);
    expect(appels()).toBe(1);
    expect(installe().trim().split("\n")).toEqual([`u_abcdefghij:${EMP("a")}`, `u_0123456789:${EMP("B")}`]);
    expect(version()).toBe("5");
    // Journal : un nombre de comptes, jamais un compte ni une empreinte.
    expect(r.stderr).toContain("synchro, 2 comptes");
    expect(r.stderr).not.toMatch(/u_abcdefghij|\$2y\$/);
  });

  it("version inchangée : aucune application, aucun rechargement", () => {
    lancer(corps(5, [["u_abcdefghij", "a"]]));
    const r = lancer(corps(5, [["u_abcdefghij", "a"]]));
    expect(r.status).toBe(0);
    expect(appels()).toBe(1);
  });

  it("nouvelle version après un retrait : la liste est remplacée", () => {
    lancer(corps(5, [["u_abcdefghij", "a"], ["u_0123456789", "B"]]));
    lancer(corps(6, [["u_0123456789", "B"]]));
    expect(appels()).toBe(2);
    expect(installe().trim()).toBe(`u_0123456789:${EMP("B")}`);
    expect(version()).toBe("6");
  });

  it("plus aucun invité : la liste vide est appliquée (réponse valide)", () => {
    lancer(corps(5, [["u_abcdefghij", "a"]]));
    const r = lancer(corps(6, []));
    expect(r.status).toBe(0);
    expect(installe()).toBe("");
    expect(version()).toBe("6");
  });

  it("panne réseau : la liste actuelle est conservée", () => {
    lancer(corps(5, [["u_abcdefghij", "a"]]));
    const r = lancer("", { reseau: true });
    expect(r.status).not.toBe(0);
    expect(appels()).toBe(1);
    expect(installe().trim()).toBe(`u_abcdefghij:${EMP("a")}`);
    expect(version()).toBe("5");
  });

  it.each(["401", "500", "404"])("réponse HTTP %s : liste conservée", (code) => {
    lancer(corps(5, [["u_abcdefghij", "a"]]));
    const r = lancer(corps(9, []), { code });
    expect(r.status).not.toBe(0);
    expect(appels()).toBe(1);
    expect(version()).toBe("5");
  });

  it.each([
    ["page HTML", "<html>erreur</html>"],
    ["JSON vide", ""],
    ["compte au mauvais format", corps(7, [["admin", "a"]])],
    ["empreinte trop courte", '{"version":7,"comptes":[{"compte":"u_abcdefghij","empreinte":"$2y$10$abc"}]}'],
    ["empreinte non bcrypt", `{"version":7,"comptes":[{"compte":"u_abcdefghij","empreinte":"{SHA}${"a".repeat(53)}"}]}`],
    ["champ en plus", `{"version":7,"comptes":[{"compte":"u_abcdefghij","empreinte":"${EMP("a")}","x":1}]}`],
    ["ligne injectée", `{"version":7,"comptes":[{"compte":"u_abcdefghij\\nroot","empreinte":"${EMP("a")}"}]}`],
    ["version non numérique", `{"version":"x","comptes":[]}`],
  ])("réponse invalide (%s) : liste conservée", (_nom, reponse) => {
    lancer(corps(5, [["u_abcdefghij", "a"]]));
    const r = lancer(reponse);
    expect(r.status).not.toBe(0);
    expect(appels()).toBe(1);
    expect(installe().trim()).toBe(`u_abcdefghij:${EMP("a")}`);
    expect(version()).toBe("5");
  });

  it("jeton ou adresse invalide dans l'environnement : rien n'est appelé", () => {
    writeFileSync(join(dir, "env"), "VPN_AGENT_URL=http://exemple.test/x\nVPN_AGENT_JETON=court\n");
    const r = lancer(corps(5, []));
    expect(r.status).not.toBe(0);
    expect(appels()).toBe(0);
  });
});
