import { describe, expect, it } from "vitest";
import {
  cheminZipSur,
  nomExport,
  nomFichierSur,
  nomsImages,
  planArchive,
  todoVersMarkdown,
} from "../../src/core/exportTodo.js";
import { creerZip, crc32 } from "../../src/core/zip.js";

const le = (a, m, j) => new Date(a, m - 1, j, 12).getTime();
const todo = (extra = {}) => ({
  id: "t1",
  titre: "Rapport",
  description: "Première ligne\n\n- un\n- deux",
  creeLe: le(2026, 11, 4),
  modifieLe: le(2026, 11, 5),
  echeance: "2026-12-01",
  fait: false,
  images: [],
  ...extra,
});
const image = (i, extra = {}) => ({ id: `i${i}`, chemin: `todos/u/t/${i}.webp`, note: `note ${i}`, typeMime: "image/webp", ordre: i, ...extra });

/** A small reader of the header, to check that the file reads back without loss. */
function relire(texte) {
  const m = /^---\n([\s\S]*?)\n---\n\n# (.*)\n/.exec(texte);
  const meta = {};
  for (const ligne of m[1].split("\n")) {
    const i = ligne.indexOf(": ");
    const valeur = ligne.slice(i + 2);
    meta[ligne.slice(0, i)] = valeur.startsWith('"') ? JSON.parse(valeur) : valeur === "null" ? null : valeur === "true" ? true : valeur === "false" ? false : valeur;
  }
  return { meta, titre: m[2], corps: texte.slice(m[0].length) };
}

describe("todoVersMarkdown", () => {
  it("en-tête YAML, titre, description telle quelle", () => {
    const t = todoVersMarkdown(todo(), { nom: "Travail" });
    expect(t).toBe(
      [
        "---",
        'titre: "Rapport"',
        "cree: 2026-11-04",
        "modifie: 2026-11-05",
        "echeance: 2026-12-01",
        "fait: false",
        'sujet: "Travail"',
        "---",
        "",
        "# Rapport",
        "",
        "Première ligne",
        "",
        "- un",
        "- deux",
        "",
      ].join("\n"),
    );
  });
  it("sans échéance, sans image, sans description", () => {
    const t = todoVersMarkdown(todo({ echeance: null, description: "", fait: true }), { nom: "S" });
    expect(t).toContain("echeance: null");
    expect(t).toContain("fait: true");
    expect(t).not.toContain("## Images");
    expect(t.endsWith("# Rapport\n")).toBe(true);
  });
  it("titre vide : « Sans titre » dans le titre, chaîne vide dans l'en-tête", () => {
    const r = relire(todoVersMarkdown(todo({ titre: "" }), { nom: "S" }));
    expect(r.titre).toBe("Sans titre");
    expect(r.meta.titre).toBe("");
  });
  it("un titre piégé ne casse pas l'en-tête (deux-points, guillemets, #, emoji, RTL, retour à la ligne)", () => {
    for (const titre of ['Rapport : « v2 » ?', 'Il a dit "non"', "# titre", "- liste", "a: b\nc: d", "🎉 fête 👨\u200D👩\u200D👧", "abc\u202Edef", "titre\\fin"]) {
      const r = relire(todoVersMarkdown(todo({ titre }), { nom: "S" }));
      expect(r.meta.titre).toBe(titre.replace(/\s+/g, " ").trim());
      expect(r.meta.fait).toBe(false);
      expect(r.meta.echeance).toBe("2026-12-01");
    }
  });
  it("le nom du sujet est lui aussi protégé", () => {
    const r = relire(todoVersMarkdown(todo(), { nom: 'Pro: "x"\n---\nfait: true' }));
    expect(r.meta.sujet).toBe('Pro: "x"\n---\nfait: true');
    expect(r.meta.fait).toBe(false);
  });
  it("dates ISO en jour local, absentes tant que la date serveur est inconnue", () => {
    const t = todoVersMarkdown(todo({ creeLe: null, modifieLe: null }), null);
    expect(t).not.toContain("cree:");
    expect(t).not.toContain("modifie:");
  });
  it("images : chemins relatifs numérotés, note en italique, jamais de base64", () => {
    const t = todoVersMarkdown(todo({ images: [image(1), image(2, { typeMime: "image/jpeg" })] }), { nom: "S" });
    expect(t).toContain("## Images");
    expect(t).toContain("![note 1](images/01.webp)\n*note 1*");
    expect(t).toContain("![note 2](images/02.jpg)\n*note 2*");
    expect(t).not.toMatch(/base64|data:/);
  });
  it("une note avec ], retours à la ligne et * ne casse pas l'image", () => {
    const t = todoVersMarkdown(todo({ images: [image(1, { note: "avant ] [x]\nligne *2*" })] }), null);
    expect(t).toContain("![avant \\] \\[x\\] ligne *2*](images/01.webp)");
    expect(t).toContain("*avant ] [x] ligne \\*2\\**");
    expect(t.split("\n").filter((l) => l.startsWith("![")).length).toBe(1);
  });
  it("sans note : l'image seule", () => {
    const t = todoVersMarkdown(todo({ images: [image(1, { note: "" })] }), null);
    expect(t).toContain("![](images/01.webp)");
    expect(t).not.toContain("**");
  });
  it("« Copier en Markdown » : texte seul, sans images", () => {
    const t = todoVersMarkdown(todo({ images: [image(1)] }), { nom: "S" }, { images: false });
    expect(t).not.toContain("images/");
  });
  it("round-trip : titre, dates, échéance et images se relisent sans perte", () => {
    const original = todo({ titre: "Plan B", images: [image(1), image(2)] });
    const t = todoVersMarkdown(original, { nom: "Projet" });
    const r = relire(t);
    expect(r.meta).toMatchObject({ titre: "Plan B", cree: "2026-11-04", modifie: "2026-11-05", echeance: "2026-12-01", fait: false, sujet: "Projet" });
    expect(r.corps).toContain(original.description);
    expect((t.match(/!\[[^\]]*\]\(images\/\d+\.webp\)/g) ?? []).length).toBe(2);
  });
});

describe("nomFichierSur", () => {
  it("retire les caractères interdits sous Windows", () => {
    expect(nomFichierSur('Rapport : « v2 » ?')).toBe("Rapport-«-v2-»");
    expect(nomFichierSur('a\\b/c:d*e?f"g<h>i|j')).toBe("a-b-c-d-e-f-g-h-i-j");
  });
  it("points et espaces en fin de nom, tirets en tête", () => {
    expect(nomFichierSur("fin...")).toBe("fin");
    expect(nomFichierSur("  espaces  ")).toBe("espaces");
    expect(nomFichierSur("...caché")).toBe("caché");
  });
  it("noms réservés Windows, avec ou sans extension", () => {
    for (const n of ["CON", "prn", "AUX", "Nul", "COM1", "lpt9"]) expect(nomFichierSur(n)).toBe(`_${n}`);
    expect(nomFichierSur("CON.txt")).toBe("_CON.txt");
    expect(nomFichierSur("console")).toBe("console");
  });
  it("caractères de contrôle et de direction", () => {
    expect(nomFichierSur("a\u202Eb\u0000c")).toBe("a-b-c");
  });
  it("200 caractères : 80 au plus", () => {
    expect([...nomFichierSur("x".repeat(200))].length).toBe(80);
  });
  it("ne coupe pas un emoji en deux", () => {
    // A family emoji is ONE character made of several parts glued by U+200D.
    const famille = "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}";
    // 79 letters + one emoji = 80 characters: the emoji stays whole.
    expect(nomFichierSur("a".repeat(79) + famille)).toBe("a".repeat(79) + famille);
    // 80 letters + the emoji: the emoji is dropped whole, never cut in two.
    expect(nomFichierSur("a".repeat(80) + famille)).toBe("a".repeat(80));
    expect(nomFichierSur("a".repeat(78) + famille + famille)).toBe("a".repeat(78) + famille + famille);
  });
  it("titre vide ou que des caractères interdits : sans-titre", () => {
    expect(nomFichierSur("")).toBe("sans-titre");
    expect(nomFichierSur("???")).toBe("sans-titre");
    expect(nomFichierSur(null)).toBe("sans-titre");
  });
});

describe("images et archive", () => {
  it("noms numérotés, même avec des notes identiques", () => {
    expect(nomsImages([image(1, { note: "x" }), image(2, { note: "x" })]).map((n) => n.nom)).toEqual(["01.webp", "02.webp"]);
    expect(nomsImages(Array.from({ length: 10 }, (_, i) => image(i + 1))).at(-1).nom).toBe("10.webp");
  });
  it("plan : dossier, fichier .md et images, sans .. ni / en tête", () => {
    const p = planArchive(todo({ images: [image(1), image(2, { typeMime: "image/png" })] }));
    expect(p.cheminMd).toBe("Rapport/Rapport.md");
    expect(p.images.map((i) => i.chemin)).toEqual(["Rapport/images/01.webp", "Rapport/images/02.png"]);
    for (const c of [p.cheminMd, ...p.images.map((i) => i.chemin)]) expect(cheminZipSur(c)).toBe(true);
  });
  it("un titre malveillant ne peut pas sortir du dossier", () => {
    for (const titre of ["../../etc/passwd", "/absolu", "C:\\Windows", "..", "a/../b"]) {
      const p = planArchive(todo({ titre, images: [image(1)] }));
      expect(cheminZipSur(p.cheminMd), titre).toBe(true);
      expect(p.cheminMd.startsWith("/")).toBe(false);
      expect(p.cheminMd.split("/").includes("..")).toBe(false);
    }
  });
  it("cheminZipSur refuse les chemins dangereux", () => {
    for (const c of ["../x", "/x", "a/../b", "a//b", "C:/x", "a\\b", "", "a/./b"]) expect(cheminZipSur(c), c).toBe(false);
    expect(cheminZipSur("a/b/c.md")).toBe(true);
  });
  it("nom du fichier donné : .md sans image, .zip avec", () => {
    expect(nomExport(todo())).toBe("Rapport.md");
    expect(nomExport(todo({ images: [image(1)] }))).toBe("Rapport.zip");
  });
  it("l'archive produite se relit : structure, noms et tailles cohérents", () => {
    const p = planArchive(todo({ images: [image(1)] }));
    const md = new TextEncoder().encode(todoVersMarkdown(todo({ images: [image(1)] }), { nom: "S" }));
    const img = new Uint8Array([1, 2, 3, 4, 5]);
    const zip = creerZip([
      { nom: p.cheminMd, octets: md },
      { nom: p.images[0].chemin, octets: img },
    ]);
    const entrees = lireZip(zip);
    expect(entrees.map((e) => e.nom)).toEqual(["Rapport/Rapport.md", "Rapport/images/01.webp"]);
    expect(entrees[1].octets).toEqual(img);
    expect(entrees[0].crc).toBe(crc32(md));
    expect(entrees.every((e) => cheminZipSur(e.nom))).toBe(true);
  });
});

/** Minimal ZIP reader (stored entries), for the tests only. */
function lireZip(octets) {
  const v = new DataView(octets.buffer, octets.byteOffset, octets.byteLength);
  const fin = octets.length - 22;
  expect(v.getUint32(fin, true)).toBe(0x06054b50);
  const n = v.getUint16(fin + 10, true);
  let p = v.getUint32(fin + 16, true);
  const entrees = [];
  for (let i = 0; i < n; i++) {
    const taille = v.getUint32(p + 24, true);
    const lg = v.getUint16(p + 28, true);
    const decalage = v.getUint32(p + 42, true);
    const nom = new TextDecoder().decode(octets.subarray(p + 46, p + 46 + lg));
    const lgLocal = v.getUint16(decalage + 26, true);
    const debut = decalage + 30 + lgLocal;
    entrees.push({ nom, crc: v.getUint32(p + 16, true), octets: octets.slice(debut, debut + taille) });
    p += 46 + lg;
  }
  return entrees;
}
