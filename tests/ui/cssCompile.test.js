import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The CSS minifier keeps only "-webkit-backdrop-filter" when it follows "backdrop-filter" in the
 * same rule, and Chrome ignores the prefixed one: the blur of the folder window stayed on the
 * whole page while an icon was taken out. "backdrop-filter" is written alone (the build adds the
 * prefix for Safari).
 */
describe("CSS source : flou jamais suivi de sa version -webkit-", () => {
  const dossier = "src/ui/styles";
  for (const nom of readdirSync(dossier).filter((n) => n.endsWith(".css"))) {
    it(nom, () => {
      const css = readFileSync(`${dossier}/${nom}`, "utf8");
      expect(css).not.toMatch(/(^|[\s;{])backdrop-filter\s*:[^;]*;\s*-webkit-backdrop-filter/);
    });
  }
});
