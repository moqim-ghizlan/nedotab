import { describe, expect, it } from "vitest";
import { doitAfficherBandeau, navigateurIos } from "../../src/core/installation.js";

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPAD_SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const IPHONE_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1";
const MAC_SAFARI = IPAD_SAFARI;
const WINDOWS_CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

describe("aide à l'installation sur l'écran d'accueil", () => {
  it("reconnaît Safari sur iPhone et sur iPad (qui se dit Mac), pas les autres", () => {
    expect(navigateurIos({ userAgent: IPHONE_SAFARI })).toEqual({ ios: true, safari: true });
    expect(navigateurIos({ userAgent: IPAD_SAFARI, maxTouchPoints: 5 })).toEqual({
      ios: true,
      safari: true,
    });
    expect(navigateurIos({ userAgent: IPHONE_CHROME })).toEqual({ ios: true, safari: false });
    expect(navigateurIos({ userAgent: MAC_SAFARI, maxTouchPoints: 0 })).toEqual({
      ios: false,
      safari: false,
    });
    expect(navigateurIos({ userAgent: WINDOWS_CHROME })).toEqual({ ios: false, safari: false });
  });

  it("bandeau : iOS + Safari + non installée + non refermé → affiché ; sinon masqué", () => {
    const base = { ios: true, safari: true, installee: false, ferme: false };
    expect(doitAfficherBandeau(base)).toBe(true);
    expect(doitAfficherBandeau({ ...base, installee: true })).toBe(false);
    expect(doitAfficherBandeau({ ...base, ferme: true })).toBe(false);
    expect(doitAfficherBandeau({ ...base, safari: false })).toBe(false);
    expect(doitAfficherBandeau({ ...base, ios: false, safari: false })).toBe(false);
  });
});
