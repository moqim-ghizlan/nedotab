import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { changelogVersHtml, lireChangelog } from "../../scripts/changelog-vers-html.js";
import { liensInternes, verifierSite } from "../../scripts/verifier-liens.js";

describe("liens du site", () => {
  it("ne garde que les liens internes", () => {
    const html = `<a href="./faq.html#x">a</a><a href="https://x.fr">b</a><a href="#haut">c</a>
      <img src="./captures/a.webp"><a href="mailto:a@b.c">d</a><source srcset="./captures/b.webp 2x">`;
    expect(liensInternes(html)).toEqual(["./faq.html", "./captures/a.webp", "./captures/b.webp"]);
  });
  it("signale une page manquante, une valeur non remplacée et une version absente", () => {
    const d = mkdtempSync(join(tmpdir(), "site-"));
    mkdirSync(join(d, "captures"));
    writeFileSync(join(d, "captures", "a.webp"), "");
    writeFileSync(
      join(d, "index.html"),
      `<a href="./absente.html">x</a><img src="./captures/a.webp"> 1.2.3`,
    );
    writeFileSync(join(d, "faq.html"), `%VERSION%`);
    const { erreurs } = verifierSite(d, "1.2.3");
    expect(erreurs).toEqual([
      "faq.html : valeur non remplacée %VERSION%",
      "faq.html : version 1.2.3 absente",
      "index.html → ./absente.html",
    ]);
  });
});

describe("CHANGELOG vers HTML", () => {
  const md = `# Changelog

## [1.1.0] - 2026-10-24

### Ajouté

- Une **grande** fonction avec \`code\`
  sur deux lignes.
- <script>alert(1)</script>

### Tests

- 20 tests.

## [1.0.0] - 2026-10-20

### Ajouté

- Début.
`;
  it("lit versions, dates et sections", () => {
    const v = lireChangelog(md);
    expect(v.map((x) => [x.version, x.date])).toEqual([
      ["1.1.0", "24/10/2026"],
      ["1.0.0", "20/10/2026"],
    ]);
    expect(v[0].sections[0].points[0]).toBe("Une **grande** fonction avec `code` sur deux lignes.");
  });
  it("garde les sections publiques, échappe le HTML", () => {
    const html = changelogVersHtml(md);
    expect(html).toContain("<strong>grande</strong>");
    expect(html).toContain("<code>code</code>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("20 tests");
  });
});
