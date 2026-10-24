import { describe, expect, it } from "vitest";
import { analyserTexte } from "../../scripts/verifier-code-distant.js";

describe("verifier-code-distant", () => {
  it("signale un script distant et eval", () => {
    expect(analyserTexte('<script src="https://cdn.x/a.js"></script>')).toHaveLength(1);
    expect(analyserTexte('import("https://x.com/m.js")')).toHaveLength(1);
    expect(analyserTexte("eval(code)")).toHaveLength(1);
  });
  it("ignore les simples chaînes d'URL", () => {
    expect(analyserTexte('const u = "https://www.google.com/s2/favicons";')).toHaveLength(0);
  });
});
