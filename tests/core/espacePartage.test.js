import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  LIMITE_CARACTERES,
  apercu,
  creerElement,
  detecterType,
  exporterElements,
  ilYA,
  lireElement,
  trier,
  trouverDoublon,
  urlSure,
  validerContenu,
} from "../../src/core/espacePartage.js";
import { creerExport } from "../../src/core/export.js";

describe("validation du contenu", () => {
  it("vide ou espaces seuls refusé", () => {
    expect(validerContenu("")).not.toBeNull();
    expect(validerContenu("   \n ")).not.toBeNull();
  });
  it("20 000 caractères acceptés, 20 001 refusés", () => {
    expect(validerContenu("x".repeat(LIMITE_CARACTERES))).toBeNull();
    expect(validerContenu("x".repeat(LIMITE_CARACTERES + 1))).toMatch(/20\s?000/);
  });
  it("les emoji comptent pour un caractère", () => {
    expect(validerContenu("😀".repeat(LIMITE_CARACTERES))).toBeNull();
  });
});

describe("liens", () => {
  it("http, https et sans protocole acceptés", () => {
    expect(urlSure("http://exemple.fr/a")).toBe("http://exemple.fr/a");
    expect(urlSure("https://exemple.fr")).toBe("https://exemple.fr");
    expect(urlSure("exemple.fr/chemin")).toBe("https://exemple.fr/chemin");
  });
  it.each(["javascript:alert(1)", "data:text/html,<b>x</b>", "file:///etc/passwd", "ftp://x.fr", "blob:https://x.fr/1", "vbscript:x"])(
    "%s n'est jamais un lien",
    (v) => {
      expect(urlSure(v)).toBeNull();
      expect(detecterType(v)).toBe("texte");
      expect(creerElement({ contenu: v, type: "lien" }).ok).toBe(false);
    },
  );
  it("une phrase n'est pas un lien ; un texte collé n'est jamais converti sans demande", () => {
    expect(detecterType("bonjour tout le monde")).toBe("texte");
    expect(creerElement({ contenu: "https://exemple.fr" }).element.type).toBe("texte");
    expect(creerElement({ contenu: "https://exemple.fr", type: "lien" }).element.type).toBe("lien");
  });
});

describe("éléments", () => {
  it("création : titre, appareil borné, non épinglé", () => {
    const r = creerElement({ contenu: "https://www.exemple.fr/p", type: "lien", appareil: "x".repeat(100) });
    expect(r.element).toMatchObject({ type: "lien", titre: "exemple.fr", epingle: false });
    expect(r.element.appareil).toHaveLength(64);
  });
  it("aperçu tronqué sans couper un emoji", () => {
    const a = apercu("😀".repeat(50), 10);
    expect([...a]).toHaveLength(10);
    expect(a.endsWith("…")).toBe(true);
    expect(a).not.toContain("�");
    expect(apercu("court")).toBe("court");
  });
  it("doublon : même lien (à la casse et au / final près) ou même texte", () => {
    const liste = [
      { type: "lien", contenu: "https://Exemple.fr/" },
      { type: "texte", contenu: "bonjour" },
    ];
    expect(trouverDoublon(liste, { type: "lien", contenu: "https://exemple.fr" })).toBe(liste[0]);
    expect(trouverDoublon(liste, { type: "texte", contenu: " bonjour " })).toBe(liste[1]);
    expect(trouverDoublon(liste, { type: "texte", contenu: "autre" })).toBeUndefined();
  });
  it("tri : épinglés d'abord, puis les plus récents ; en attente tout en haut", () => {
    const l = [
      { id: "a", creeLe: 1000, epingle: false },
      { id: "b", creeLe: 3000, epingle: false },
      { id: "c", creeLe: 500, epingle: true },
      { id: "d", creeLe: null, epingle: false },
    ];
    expect(trier(l).map((e) => e.id)).toEqual(["c", "d", "b", "a"]);
  });
  it("lecture d'un document : valeurs aberrantes écartées", () => {
    expect(lireElement("x", { type: "autre", contenu: "a" })).toBeNull();
    expect(lireElement("x", { type: "texte", contenu: 3 })).toBeNull();
    expect(lireElement("x", { type: "texte", contenu: "a", creeLe: { toMillis: () => 42 } }).creeLe).toBe(42);
  });
  it("date relative", () => {
    const t = 1_000_000_000_000;
    expect(ilYA(t - 10_000, t)).toBe("à l'instant");
    expect(ilYA(t - 3 * 60_000, t)).toBe("il y a 3 min");
    expect(ilYA(t - 2 * 3_600_000, t)).toBe("il y a 2 h");
    expect(ilYA(null, t)).toBe("à l'instant");
  });
});

describe("export RGPD et IA", () => {
  it("l'export contient l'espace de partage ; les sauvegardes n'en contiennent pas", () => {
    const etat = { versionSchema: 3, grille: [], reglages: {} };
    const e = creerExport(etat, {
      version: "x",
      plateforme: "pwa",
      espacePartage: [{ id: "1", type: "texte", contenu: "salut", titre: "salut", appareil: "iphone", epingle: true, creeLe: 5 }],
    });
    expect(e.espacePartage).toEqual(exporterElements([{ type: "texte", contenu: "salut", titre: "salut", appareil: "iphone", epingle: true, creeLe: 5 }]));
    expect(e.espacePartage[0].id).toBeUndefined();
    expect(creerExport(etat, { version: "x", plateforme: "pwa" }).espacePartage).toBeUndefined();
  });
  it("jamais de contenu du partage envoyé à l'IA ni écrit dans les journaux", () => {
    const fichiers = [
      "src/core/listeCompacte.js",
      "src/core/ia.js",
      "src/core/chat.js",
      "src/core/preFiltre.js",
      "src/core/besoinContexteSites.js",
      "src/core/journal.js",
      "src/ui/journal.js",
      "functions/src/ia/fonctions.js",
      "functions/src/partage/listeCompacte.js",
    ];
    for (const f of fichiers) {
      const source = readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
      expect(source, f).not.toMatch(/espacePartage/i);
    }
    for (const f of readdirSync(new URL("../../functions/src/ia/", import.meta.url)).filter((n) => n.endsWith(".js"))) {
      expect(readFileSync(new URL(`../../functions/src/ia/${f}`, import.meta.url), "utf8")).not.toMatch(/espacePartage/i);
    }
  });
});
