import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ICONES_FAMILLE,
  QUOTA_MAX,
  TAILLE_MAX,
  apercuPossible,
  avertissementTelechargement,
  cheminStockage,
  creerFile,
  extensionDe,
  familleDe,
  formaterTaille,
  niveauQuota,
  nomAffiche,
  nomRefuse,
  nomSur,
  telechargementSeulement,
  tronquerMilieu,
  validerFichier,
} from "../../src/core/espacePartageFichiers.js";

const f = (name, size = 1000, type = "") => ({ name, size, type });

describe("validation d'un fichier", () => {
  it("25 Mo pile accepté, 25 Mo + 1 refusé", () => {
    expect(validerFichier(f("a.pdf", TAILLE_MAX)).ok).toBe(true);
    const r = validerFichier(f("a.pdf", TAILLE_MAX + 1));
    expect(r).toMatchObject({ ok: false, code: "trop-gros" });
    expect(r.erreur).toContain("Maximum 25 Mo");
  });
  it("fichier vide refusé", () => {
    expect(validerFichier(f("a.txt", 0)).code).toBe("vide");
  });
  it.each(["setup.exe", "SETUP.EXE", "photo.jpg.exe", "x.msi", "run.bat", "run.cmd", "a.sh", "a.js", "a.jar", "a.apk", "a.dmg", "a.scr", "a.ps1"])(
    "%s refusé",
    (nom) => {
      expect(nomRefuse(nom)).toBe(true);
      expect(validerFichier(f(nom)).code).toBe("type");
    },
  );
  it("type MIME exécutable refusé même avec un nom innocent", () => {
    expect(validerFichier(f("photo.png", 10, "application/x-msdownload")).code).toBe("type");
    expect(validerFichier(f("a.txt", 10, "application/javascript")).code).toBe("type");
  });
  it("zip, pdf, svg, html acceptés comme fichiers", () => {
    for (const nom of ["a.zip", "a.pdf", "a.svg", "a.html", "a.heic"]) expect(validerFichier(f(nom)).ok).toBe(true);
  });
  it("quota : dépasser d'un octet est refusé", () => {
    expect(validerFichier(f("a.pdf", 10), { octetsUtilises: QUOTA_MAX - 10 }).ok).toBe(true);
    expect(validerFichier(f("a.pdf", 11), { octetsUtilises: QUOTA_MAX - 10 }).code).toBe("quota");
  });
});

describe("noms", () => {
  it("nom avec « ../../x » : assaini, aucun séparateur ni point double", () => {
    const n = nomSur("../../x");
    expect(n).not.toMatch(/[/\\]/);
    expect(n).not.toContain("..");
    expect(n).not.toMatch(/^\./);
  });
  it("RTL : « facture‮fdp.exe » perd le caractère de direction et reste refusé", () => {
    const piege = "facture‮fdp.exe";
    expect(nomAffiche(piege)).toBe("facturefdp.exe");
    expect(nomRefuse(piege)).toBe(true);
    expect(nomSur(piege)).not.toMatch(/[‪-‮]/);
  });
  it("nom vide ou fait de caractères de contrôle : « fichier »", () => {
    expect(nomAffiche("")).toBe("fichier");
    expect(nomAffiche("\u0000\u0007")).toBe("fichier");
    expect(nomSur("")).toBe("fichier");
  });
  it("nom de 300 caractères : 100 au plus dans le chemin, extension gardée", () => {
    const long = `${"a".repeat(300)}.pdf`;
    const n = nomSur(long);
    expect([...n].length).toBeLessThanOrEqual(100);
    expect(n.endsWith(".pdf")).toBe(true);
    expect([...nomAffiche(long)].length).toBeLessThanOrEqual(200);
  });
  it("Unicode normalisé NFC", () => {
    expect(nomAffiche("é.txt")).toBe("é.txt");
  });
  it("chemin Storage : partages/{uid}/{id}/{nom sûr}, deux fichiers de même nom ne se heurtent pas", () => {
    expect(cheminStockage("u1", "id1", "a b.pdf")).toBe("partages/u1/id1/a b.pdf");
    expect(cheminStockage("u1", "id1", "a.pdf")).not.toBe(cheminStockage("u1", "id2", "a.pdf"));
  });
  it("troncature au milieu en gardant l'extension", () => {
    const t = tronquerMilieu("rapport-final-de-l-annee-complete-2026.pdf", 24);
    expect([...t].length).toBeLessThanOrEqual(24);
    expect(t.endsWith("2026.pdf") || t.endsWith(".pdf")).toBe(true);
    expect(t).toContain("…");
    expect(tronquerMilieu("court.txt")).toBe("court.txt");
  });
  it("extension", () => {
    expect(extensionDe("A.PDF")).toBe("pdf");
    expect(extensionDe("sans")).toBe("");
  });
});

describe("familles, aperçus, avertissements", () => {
  it("familles", () => {
    expect(familleDe("a.pdf")).toBe("pdf");
    expect(familleDe("a.xlsx")).toBe("tableur");
    expect(familleDe("a.zip")).toBe("archive");
    expect(familleDe("a.mp3")).toBe("audio");
    expect(familleDe("a.mov")).toBe("video");
    expect(familleDe("a.docx")).toBe("document");
    expect(familleDe("a.jpg", "image/jpeg")).toBe("image");
    expect(familleDe("a.xyz")).toBe("autre");
    for (const famille of ["image", "pdf", "document", "tableur", "archive", "audio", "video", "autre"])
      expect(ICONES_FAMILLE[famille]).toBeTruthy();
  });
  it("SVG et HTML : jamais d'aperçu, téléchargement seulement", () => {
    for (const [nom, type] of [["a.svg", "image/svg+xml"], ["a.svg", ""], ["a.html", "text/html"], ["a.htm", ""]]) {
      expect(apercuPossible(nom, type)).toBe(false);
      expect(telechargementSeulement(nom, type)).toBe(true);
      expect(avertissementTelechargement(nom, type)).toMatch(/code/);
    }
    expect(apercuPossible("a.png", "image/png")).toBe(true);
    expect(apercuPossible("a.heic", "image/heic")).toBe(false); // icône générique, pas d'erreur
  });
  it("archive : avertissement ; pdf : aucun", () => {
    expect(avertissementTelechargement("a.zip")).toMatch(/Archive/);
    expect(avertissementTelechargement("a.pdf")).toBeNull();
  });
});

describe("quota et tailles", () => {
  it("niveaux : orange dès 80 %, rouge à 100 %", () => {
    expect(niveauQuota(QUOTA_MAX * 0.5).niveau).toBe("ok");
    expect(niveauQuota(QUOTA_MAX * 0.8).niveau).toBe("avertissement");
    expect(niveauQuota(QUOTA_MAX).niveau).toBe("plein");
    expect(niveauQuota(QUOTA_MAX * 2).part).toBe(1);
  });
  it("formatage", () => {
    expect(formaterTaille(12)).toBe("12 o");
    expect(formaterTaille(1536)).toBe("1,5 Ko");
    expect(formaterTaille(25 * 1024 * 1024)).toBe("25 Mo");
    expect(formaterTaille(38 * 1024 * 1024)).toBe("38 Mo");
  });
});

describe("file de transferts", () => {
  it("jamais plus de deux à la fois", async () => {
    const file = creerFile(2);
    let actifs = 0;
    let max = 0;
    const job = () =>
      new Promise((ok) => {
        actifs++;
        max = Math.max(max, actifs);
        setTimeout(() => (actifs--, ok()), 10);
      });
    await Promise.all(Array.from({ length: 6 }, () => file.ajouter(job)));
    expect(max).toBe(2);
  });
});

describe("sécurité du code", () => {
  const parcourir = (dossier) =>
    readdirSync(dossier).flatMap((n) => {
      const p = join(dossier, n);
      return statSync(p).isDirectory() ? parcourir(p) : p.endsWith(".js") ? [p] : [];
    });
  it("aucune occurrence de getDownloadURL (lien public) dans le code", () => {
    const racine = new URL("../../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
    for (const dossier of ["src", "functions/src"]) {
      for (const fichier of parcourir(join(racine, dossier))) {
        expect(readFileSync(fichier, "utf8"), fichier).not.toMatch(/getDownloadURL/);
      }
    }
    expect(readFileSync(join(racine, "functions/index.js"), "utf8")).not.toMatch(/getDownloadURL|getSignedUrl/);
  });
});
