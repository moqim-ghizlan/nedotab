import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// happy-dom n'a pas de canvas : le dessin est remplacé, le reste est le vrai composant.
const dessinerQr = vi.fn();
const effacerQr = vi.fn();
vi.mock("../../src/ui/vpn/qr.js", () => ({
  dessinerQr: (...a) => dessinerQr(...a),
  effacerQr: (...a) => effacerQr(...a),
}));
const demander = vi.fn();
vi.mock("../../src/ui/dialogues/commun.js", () => ({ demander: (...a) => demander(...a) }));
vi.mock("../../src/ui/toast.js", () => ({ toast: vi.fn() }));

import { blocWireguard } from "../../src/ui/vpn/wireguard.js";

const CONF = "[Interface]\nPrivateKey = CLE-PRIVEE-DE-TEST\n\n[Peer]\n";
const PROFIL = { config: CONF, nomProfil: "p_abcdefghij", pays: "Allemagne" };

function monter({
  profil = { ok: true, valeur: PROFIL },
  partager = vi.fn(async () => "telecharge"),
} = {}) {
  const service = {
    profil: vi.fn(async () => profil),
    recreerProfil: vi.fn(async () => ({ ok: true, valeur: { ok: true } })),
  };
  const b = blocWireguard({ service, partager, duree: 60_000 });
  document.body.append(b.racine);
  return { b, service, partager };
}
const bouton = (t) => [...document.querySelectorAll("button")].find((x) => x.textContent === t);
const attendre = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers();
  document.body.replaceChildren();
  dessinerQr.mockReset();
  effacerQr.mockReset();
  demander.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("QR code WireGuard", () => {
  it("rien n'est demandé au serveur avant le clic ; le QR est flouté jusqu'à « Révéler »", async () => {
    const { service } = monter();
    expect(service.profil).not.toHaveBeenCalled();
    bouton("Afficher mon QR code").click();
    await attendre();
    expect(dessinerQr).toHaveBeenCalledWith(expect.anything(), CONF);
    expect(document.querySelector(".vpn-qr-zone--flou")).not.toBeNull();
    expect(document.body.textContent).toContain("Ne le montrez à personne");
    bouton("Révéler").click();
    expect(document.querySelector(".vpn-qr-zone--flou")).toBeNull();
  });

  it("masqué automatiquement après 60 secondes", async () => {
    monter();
    bouton("Afficher mon QR code").click();
    await attendre();
    await vi.advanceTimersByTimeAsync(59_000);
    expect(document.querySelector("canvas")).not.toBeNull();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(document.querySelector("canvas")).toBeNull();
    expect(effacerQr).toHaveBeenCalled();
    expect(bouton("Afficher mon QR code")).toBeDefined();
  });

  it("masqué quand on quitte l'écran", async () => {
    monter();
    bouton("Afficher mon QR code").click();
    await attendre();
    globalThis.dispatchEvent(new Event("pagehide"));
    expect(document.querySelector("canvas")).toBeNull();
  });

  it("la configuration n'est jamais écrite dans un stockage", async () => {
    const ecritures = [];
    for (const cible of [globalThis.localStorage, globalThis.sessionStorage]) {
      const origine = cible.setItem.bind(cible);
      vi.spyOn(cible, "setItem").mockImplementation((k, v) => {
        ecritures.push(`${k}=${v}`);
        origine(k, v);
      });
    }
    const { partager } = monter();
    bouton("Afficher mon QR code").click();
    await attendre();
    bouton("Révéler").click();
    bouton("Télécharger le fichier de configuration").click();
    await attendre();
    expect(partager).toHaveBeenCalled();
    expect(ecritures.join("\n")).not.toMatch(/CLE-PRIVEE|Interface/);
    expect(JSON.stringify(globalThis.localStorage)).not.toMatch(/CLE-PRIVEE/);
  });

  it("fichier .conf nommé d'après le profil", async () => {
    const { partager } = monter();
    bouton("Afficher mon QR code").click();
    await attendre();
    bouton("Télécharger le fichier de configuration").click();
    await attendre();
    const fichier = partager.mock.calls[0][0];
    expect(fichier.name).toBe("p_abcdefghij.conf");
    expect(await fichier.text()).toBe(CONF);
  });

  it("profil en préparation : message, pas de QR", async () => {
    monter({
      profil: { ok: false, erreur: "Votre profil est en préparation, réessayez dans une minute." },
    });
    bouton("Afficher mon QR code").click();
    await attendre();
    expect(document.querySelector("canvas")).toBeNull();
    expect(dessinerQr).not.toHaveBeenCalled();
  });

  it("recréer : confirmation puis appel, l'ancien QR disparaît", async () => {
    demander.mockResolvedValue(true);
    const { service } = monter();
    bouton("Afficher mon QR code").click();
    await attendre();
    document.querySelectorAll("button");
    bouton("Masquer").click();
    bouton("Recréer mon profil").click();
    await attendre();
    expect(service.recreerProfil).toHaveBeenCalled();
    expect(document.querySelector("canvas")).toBeNull();
  });

  it("recréer annulé : aucun appel", async () => {
    demander.mockResolvedValue(false);
    const { service } = monter();
    bouton("Recréer mon profil").click();
    await attendre();
    expect(service.recreerProfil).not.toHaveBeenCalled();
  });
});
