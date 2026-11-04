import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// V5.9 : l'agent de rapport (Python), sans réseau. Des volumes, jamais une destination.
const PYTHON = ["python3", "python"].find(
  (p) => spawnSync(p, ["--version"], { encoding: "utf8" }).status === 0,
);
const AGENT = join(process.cwd(), "serveur/agent/vpn-rapport-agent.py");
const HARNAIS = join(process.cwd(), "tests/scripts/rapport_agent_harness.py");

function lancer(scenario) {
  const r = spawnSync(PYTHON, ["-I", HARNAIS, AGENT], {
    input: JSON.stringify(scenario),
    encoding: "utf8",
  });
  expect(r.status, r.stderr).toBe(0);
  return JSON.parse(r.stdout);
}
const P = "p_aaaaaaaaaa";
const U = "u_bbbbbbbbbb";

describe.skipIf(!PYTHON)("agent de rapport", () => {
  it("différences de compteurs : progression, remise à zéro, profil neuf, premier passage", () => {
    const r = lancer({
      diffs: [
        [150, 100, false], // progression normale
        [30, 100, false], // remise à zéro (redémarrage) : repart de la nouvelle valeur
        [500, null, false], // profil neuf : son compteur est parti de zéro
        [500, null, true], // premier passage de l'agent : base, pas d'historique
        [100, 100, false],
      ],
    });
    expect(r.diff).toEqual([50, 30, 500, 0, 0]);
  });

  it("interface de la route par défaut", () => {
    const route =
      "Iface\tDestination\tGateway\tFlags\tRefCnt\tUse\tMetric\tMask\n" +
      "ens3\t00000000\t0100000A\t0003\t0\t0\t100\t00000000\n" +
      "ens3\t0000000A\t00000000\t0001\t0\t0\t100\t0000FFFF\n";
    expect(lancer({ route }).iface).toBe("ens3");
  });

  it("premier rapport : base posée, aucun volume WireGuard ni serveur compté", () => {
    const r = lancer({ etat: {}, wg: [{ name: P, transferRx: 5000, transferTx: 7000 }], tx: 9_000_000 });
    expect(r.envoyes[0]).toEqual({ parCompte: {}, serveur: { octetsSortants: 0 } });
    expect(r.etat.wg[P]).toEqual([5000, 7000]);
    expect(r.etat.tx_serveur).toBe(9_000_000);
  });

  it("rapport suivant : différences WireGuard, octets proxy additionnés, serveur", () => {
    const r = lancer({
      etat: { wg: { [P]: [1000, 2000] }, tx_serveur: 1_000_000 },
      wg: [{ name: P, transferRx: 1500, transferTx: 2600 }, { name: "test-manuel", transferRx: 9, transferTx: 9 }],
      proxy: `${U} 4096\n${U} 4\nroot 99\nu_court 5\n`,
      tx: 1_250_000,
    });
    expect(r.envoyes[0]).toEqual({
      parCompte: {
        [U]: { octetsProxy: 4100, octetsWireguard: 0 },
        [P]: { octetsProxy: 0, octetsWireguard: 1100 },
      },
      serveur: { octetsSortants: 250_000 },
    });
    expect(r.etat.wg).toEqual({ [P]: [1500, 2600] });
  });

  it("envoi refusé : les derniers relevés sont gardés, les octets du proxy aussi", () => {
    const r = lancer({
      etat: { wg: { [P]: [0, 0] }, tx_serveur: 10 },
      wg: [{ name: P, transferRx: 100, transferTx: 100 }],
      proxy: `${U} 777\n`,
      tx: 500,
      code: 500,
    });
    expect(r.erreur).toMatch(/http 500/);
    expect(r.etat.wg[P]).toEqual([0, 0]);
    expect(r.etat.tx_serveur).toBe(10);
    expect(r.etat.proxy_attente).toEqual({ [U]: 777 });
  });

  it("aucune destination dans le rapport ni le journal (que des comptes et des octets)", () => {
    const r = lancer({
      etat: { wg: {}, tx_serveur: 0 },
      wg: [{ name: P, transferRx: 1, transferTx: 1 }],
      proxy: `${U} 10 https://exemple.org/page\n`,
      tx: 5,
    });
    expect(JSON.stringify(r)).not.toMatch(/exemple|http:|https:|\.org/);
    expect(JSON.stringify(r.envoyes)).toMatch(/octets/);
  });
});
