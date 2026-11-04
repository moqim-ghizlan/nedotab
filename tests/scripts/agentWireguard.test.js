import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// V5.7 : l'agent WireGuard (Python) avec un faux wg-easy et de fausses fonctions.
const PYTHON = ["python3", "python"].find(
  (p) => spawnSync(p, ["--version"], { encoding: "utf8" }).status === 0,
);
const AGENT = join(process.cwd(), "serveur/agent/vpn-wg-agent.py");
const HARNAIS = join(process.cwd(), "tests/scripts/wg_agent_harness.py");

const A = "p_aaaaaaaaaa";
const B = "p_bbbbbbbbbb";
const C = "p_cccccccccc";

function lancer(scenario) {
  const r = spawnSync(PYTHON, ["-I", HARNAIS, AGENT], {
    input: JSON.stringify(scenario),
    encoding: "utf8",
  });
  expect(r.status, r.stderr).toBe(0);
  return { ...JSON.parse(r.stdout), sortie: r.stdout + r.stderr };
}
const profils = (...l) => l.map(([nomProfil, depose = false]) => ({ nomProfil, depose }));
const supprimes = (r) =>
  r.appels.filter(([m]) => m === "DELETE").map(([, u]) => u.split("/").pop());
const crees = (r) => r.appels.filter(([m, u]) => m === "POST" && u.endsWith("/api/client")).length;

describe.skipIf(!PYTHON)("agent WireGuard", () => {
  it("invités {A, B}, clients {B, C} : crée A, supprime C, garde B", () => {
    const r = lancer({
      profils: profils([A], [B, true]),
      clients: [
        { id: 2, name: B },
        { id: 3, name: C },
      ],
    });
    expect(r.erreur).toBeNull();
    expect(supprimes(r)).toEqual(["3"]);
    expect(crees(r)).toBe(1);
    expect(r.deposes.map((d) => d.nomProfil)).toEqual([A]);
  });

  it("jamais de clé privée dans la sortie ni dans le journal", () => {
    const r = lancer({ profils: profils([A]), clients: [] });
    expect(r.deposes[0].a_cle).toBe(true);
    expect(r.sortie).not.toContain("CLE-PRIVEE");
    expect(r.journal.join("\n")).not.toMatch(/CLE-PRIVEE|PrivateKey|p_aaaaaaaaaa/);
  });

  it("échec de l'API wg-easy : aucune suppression ni création", () => {
    const r = lancer({ profils: profils([A]), clients: [{ id: 3, name: C }], wg_code: 500 });
    expect(r.erreur).toMatch(/wg-easy/);
    expect(supprimes(r)).toEqual([]);
    expect(crees(r)).toBe(0);
  });

  it.each([
    ["HTTP 401", { profils_code: 401 }],
    ["HTML", { profils_brut: "<html>erreur</html>" }],
    ["champ en plus", { profils_brut: '{"profils":[],"x":1}' }],
    ["nom invalide", { profils_brut: '{"profils":[{"nomProfil":"../x","depose":false}]}' }],
    ["depose absent", { profils_brut: `{"profils":[{"nomProfil":"${A}"}]}` }],
  ])("réponse des fonctions invalide (%s) : rien n'est supprimé", (_n, extra) => {
    const r = lancer({ clients: [{ id: 3, name: C }], profils: [], ...extra });
    expect(r.erreur).not.toBeNull();
    expect(supprimes(r)).toEqual([]);
  });

  it("réponse wg-easy de forme inattendue : rien n'est supprimé", () => {
    const r = lancer({ profils: profils(), wg_brut: '{"clients":[]}' });
    expect(r.erreur).toBe("forme");
    expect(supprimes(r)).toEqual([]);
  });

  it("les clients qui ne portent pas un nom géré ne sont jamais touchés", () => {
    const r = lancer({ profils: profils(), clients: [{ id: 9, name: "test-manuel" }] });
    expect(supprimes(r)).toEqual([]);
  });

  it("dernier invité retiré : son client est supprimé", () => {
    const r = lancer({ profils: profils(), clients: [{ id: 3, name: C }] });
    expect(supprimes(r)).toEqual(["3"]);
  });

  it("client existant sans copie en base : configuration redéposée, pas recréé", () => {
    const r = lancer({ profils: profils([A, false]), clients: [{ id: 5, name: A }] });
    expect(crees(r)).toBe(0);
    expect(r.deposes.map((d) => d.nomProfil)).toEqual([A]);
  });

  it("dépôt refusé : le client est gardé, nouvel essai à la minute suivante", () => {
    const r = lancer({ profils: profils([A]), clients: [], depot_code: 500 });
    expect(supprimes(r)).toEqual([]);
    expect(r.journal.join(" ")).toMatch(/depot refuse/);
  });

  it("tout est à jour : aucun appel d'écriture", () => {
    const r = lancer({ profils: profils([A, true]), clients: [{ id: 2, name: A }] });
    expect(r.appels.filter(([m]) => m !== "GET")).toEqual([]);
  });
});
