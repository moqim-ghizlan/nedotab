import { describe, expect, it } from "vitest";
import { analyserCandidats, genreAdresse } from "../../src/core/analyseIce.js";

const c = (adresse, typ = "host") => `candidate:1 1 udp 2122260223 ${adresse} 54321 typ ${typ}`;

describe("analyse des candidats ICE", () => {
  it("adresse publique autre que celle du serveur : fuite", () => {
    const a = analyserCandidats([c("203.0.113.9", "srflx")], { ipServeur: "198.51.100.1" });
    expect(a.fuite).toBe(true);
    expect(a.publiques).toEqual(["203.0.113.9"]);
  });
  it("l'adresse du serveur ou l'adresse vue est permise", () => {
    expect(
      analyserCandidats([c("198.51.100.1", "srflx")], { ipServeur: "198.51.100.1" }).fuite,
    ).toBe(false);
    expect(analyserCandidats([c("198.51.100.1")], { ipVue: "198.51.100.1" }).fuite).toBe(false);
  });
  it("les candidats mDNS .local sont ignorés", () => {
    const a = analyserCandidats([c("a1b2c3d4-0000.local")]);
    expect(a).toMatchObject({ fuite: false, locales: [], problemes: [] });
  });
  it("adresse locale en clair : signalée, mais pas une fuite publique", () => {
    const a = analyserCandidats([c("192.168.1.20")]);
    expect(a.fuite).toBe(false);
    expect(a.locales).toEqual(["192.168.1.20"]);
    expect(a.problemes).toHaveLength(1);
  });
  it("IPv6 : publique détectée, locale et lien-local distinguées", () => {
    expect(genreAdresse("2001:db8::1")).toBe("publique");
    expect(genreAdresse("fe80::1")).toBe("locale");
    expect(genreAdresse("fd12::1")).toBe("locale");
    expect(analyserCandidats([c("2001:db8::1")], { ipVue: "2001:DB8::1" }).fuite).toBe(false);
  });
  it("lignes invalides ou fin de collecte ignorées", () => {
    expect(analyserCandidats(["", null, "candidate:x", "pas un candidat"]).fuite).toBe(false);
    expect(analyserCandidats(undefined).problemes).toEqual([]);
  });
});
