import { describe, expect, it } from "vitest";
import { reduire } from "../../src/core/actions.js";
import { trouver } from "../../src/core/arbre.js";
import { creerExport, nomFichierExport } from "../../src/core/export.js";
import {
  actionFusion,
  nouveauxIds,
  TAILLE_FICHIER_MAX,
  validerImport,
  verifierTailleFichier,
} from "../../src/core/import.js";
import { etatInitial } from "../../src/core/modele.js";
import { crc32, creerZip } from "../../src/core/zip.js";

const site = (id, url = `https://${id}.fr`, extra = {}) => ({
  id,
  type: "site",
  titre: id,
  url,
  icone: { type: "lettre", couleur: "#2c6b5a" },
  creeLe: 1,
  ...extra,
});
const dossier = (id, items) => ({ id, type: "dossier", titre: id, items, creeLe: 1 });
const etat = {
  ...etatInitial(),
  grille: [site("a"), dossier("d", [site("b"), dossier("e", [site("c")])])],
  reglages: { theme: "sombre", fond: { type: "couleur", valeur: "#112233" }, fonds: [] },
};
const options = {
  version: "2.10.0",
  plateforme: "extension",
  maintenant: Date.UTC(2026, 9, 21, 14, 35),
};
const fichier = (surcharge = {}) =>
  JSON.stringify({ ...creerExport(etat, options), ...surcharge }, null, 2);

describe("export", () => {
  it("format, versions, date, application ; seulement la partie synchronisée", () => {
    const e = creerExport({ ...etat, reglagesAppareil: { colonnes: 5 } }, options);
    expect(e).toEqual({
      format: "nedotab-export",
      versionFormat: 1,
      versionSchema: 2,
      exporteLe: "2026-10-21T14:35:00.000Z",
      application: { version: "2.10.0", plateforme: "extension" },
      grille: etat.grille,
      reglages: etat.reglages,
    });
  });
  it("sauvegardes incluses en mode compte (sans champ inattendu)", () => {
    const e = creerExport(etat, {
      ...options,
      sauvegardes: [{ id: "s1", type: "auto", creeLe: 5, grille: [], reglages: {}, autre: 1 }],
    });
    expect(e.sauvegardes).toEqual([
      {
        id: "s1",
        creeLe: 5,
        type: "auto",
        nom: null,
        nbSites: 0,
        nbDossiers: 0,
        grille: [],
        reglages: {},
      },
    ]);
  });
  it("nom de fichier daté", () => {
    expect(nomFichierExport(new Date(2026, 9, 3))).toBe("nedotab-2026-10-03.json");
  });
});

describe("import : Remplacer", () => {
  it("exporter puis importer → état identique (ids compris)", () => {
    const r = validerImport(fichier());
    expect(r.ok).toBe(true);
    expect(r.etat.grille).toEqual(etat.grille);
    expect(r.etat.reglages).toEqual(etat.reglages);
  });
  it("BOM retiré, sauvegardes comptées mais jamais importées", () => {
    const texte = String.fromCharCode(0xfeff) + fichier({ sauvegardes: [{}, {}] });
    const r = validerImport(texte);
    expect(r).toMatchObject({ ok: true, sauvegardes: 2 });
    expect(r.etat).not.toHaveProperty("sauvegardes");
  });
  it("icône importée (data: PNG ≤ 16 Ko) et icône du cache du navigateur acceptées", () => {
    const grille = [
      site("x", "https://x.fr", {
        icone: { type: "image", valeur: "data:image/png;base64,iVBORw0KGgo=" },
      }),
      site("y", "https://y.fr", {
        icone: {
          type: "url",
          valeur: "chrome-extension://imegmpimokhlnlhcmaogimnlgcfgefnn/_favicon/?pageUrl=x",
          source: "chrome",
        },
      }),
    ];
    expect(validerImport(fichier({ grille })).ok).toBe(true);
  });
  it("schéma ancien (1) migré", () => {
    const r = validerImport(fichier({ versionSchema: 1 }));
    expect(r.ok).toBe(true);
    expect(r.etat.grille).toEqual(etat.grille);
  });
  it("dossiers sur 5 niveaux : aplatis, avec avertissement, rien de perdu", () => {
    const profond = [dossier("n1", [dossier("n2", [dossier("n3", [dossier("n4", [site("z")])])])])];
    const r = validerImport(fichier({ grille: profond }));
    expect(r).toMatchObject({ ok: true, aplati: true });
    expect(trouver(r.etat.grille, "z")).not.toBeNull();
  });
});

describe("import : fichiers refusés (rien ne change)", () => {
  const refus = (texte, attendu) => {
    const r = validerImport(texte);
    expect(r.ok).toBe(false);
    expect(r.erreur).toMatch(attendu);
  };
  const avecSite = (s) => fichier({ grille: [site("a"), s] });
  it("1. JSON invalide", () => refus("{ pas du json", /JSON invalide/));
  it("2. fichier tronqué", () => refus(fichier().slice(0, 120), /JSON invalide ou tronqué/));
  it("3. vide", () => refus("", /JSON invalide/));
  it("4. autre format", () => refus(JSON.stringify({ format: "autre" }), /pas un export NedoTab/));
  it("5. tableau au lieu d'un objet", () => refus("[]", /pas un export NedoTab/));
  it("6. schéma futur", () => refus(fichier({ versionSchema: 99 }), /version plus récente/));
  it("7. schéma absent", () =>
    refus(fichier({ versionSchema: "2" }), /Version de données inconnue/));
  it("8. pas de grille", () => refus(fichier({ grille: null }), /Aucune grille/));
  it("9. adresse javascript: avec la ligne", () => {
    const texte = avecSite(site("mal", "javascript:alert(1)"));
    const ligne = texte.split("\n").findIndex((l) => l.includes("javascript:")) + 1;
    refus(texte, new RegExp(`^Ligne ${ligne} : adresse refusée \\(javascript:\\)\\.$`));
  });
  it("10. adresse data: (page HTML)", () =>
    refus(avecSite(site("mal", "data:text/html,<script>")), /adresse refusée \(data:\)/));
  it("11. icône data: HTML", () =>
    refus(
      avecSite(
        site("i", "https://i.fr", {
          icone: { type: "image", valeur: "data:text/html;base64,PHA+" },
        }),
      ),
      /icône refusée/,
    ));
  it("12. icône SVG (scripts possibles)", () =>
    refus(
      avecSite(
        site("i", "https://i.fr", {
          icone: { type: "image", valeur: "data:image/svg+xml;base64,PHN2Zz4=" },
        }),
      ),
      /icône refusée/,
    ));
  it("13. icône de plus de 16 Ko", () =>
    refus(
      avecSite(
        site("i", "https://i.fr", {
          icone: { type: "image", valeur: `data:image/png;base64,${"A".repeat(22000)}` },
        }),
      ),
      /icône trop lourde/,
    ));
  it("14. icône à adresse javascript:", () =>
    refus(
      avecSite(
        site("i", "https://i.fr", {
          icone: { type: "url", valeur: "javascript:x", source: "perso" },
        }),
      ),
      /adresse d'icône refusée/,
    ));
  it("15. titre de 10 000 caractères", () =>
    refus(avecSite(site("t", "https://t.fr", { titre: "x".repeat(10000) })), /titre trop long/));
  it("16. type d'élément inconnu", () =>
    refus(
      fichier({ grille: [{ id: "q", type: "widget", titre: "q" }] }),
      /type d'élément inconnu/,
    ));
  it("17. dossier sans liste", () =>
    refus(
      fichier({ grille: [{ id: "q", type: "dossier", titre: "q", items: "x" }] }),
      /Contenu de dossier invalide/,
    ));
  it("18. identifiant manquant", () =>
    refus(
      fichier({ grille: [{ type: "site", titre: "q", url: "https://q.fr" }] }),
      /identifiant manquant/,
    ));
  it("19. trop volumineux pour un compte (> 950 Ko)", () => {
    const grille = Array.from({ length: 70 }, (_, i) =>
      site(`s${i}`, `https://s${i}.fr`, {
        icone: { type: "image", valeur: `data:image/png;base64,${"A".repeat(20000)}` },
      }),
    );
    refus(fichier({ grille }), /trop volumineux pour un compte/);
  });
  it("20. fichier de plus de 5 Mo refusé avant lecture", () => {
    expect(verifierTailleFichier(TAILLE_FICHIER_MAX + 1)).toMatch(/plus de 5 Mo/);
    expect(verifierTailleFichier(1000)).toBeNull();
  });
});

describe("import : Fusionner", () => {
  let n = 0;
  const genererId = () => `n${n++}`;
  it("nouveaux ids partout", () => {
    const g = nouveauxIds([dossier("d", [site("x")])], genererId);
    expect(g[0].id).not.toBe("d");
    expect(g[0].items[0].id).not.toBe("x");
  });
  it("dossier « Importé le JJ/MM/AAAA » à la fin, doublons exacts ignorés, action rejouable", () => {
    const actuel = { ...etatInitial(), grille: [site("a"), site("autre", "https://autre.fr")] };
    const importe = [site("a"), site("nouveau", "https://nouveau.fr")];
    const r = actionFusion(actuel.grille, importe, {
      genererId,
      maintenant: new Date(2026, 9, 21).getTime(),
    });
    expect(r.ajoutes).toBe(1);
    const apres = reduire(actuel, r.action);
    const d = apres.grille.at(-1);
    expect(d.titre).toBe("Importé le 21/10/2026");
    expect(d.items.map((e) => e.url)).toEqual(["https://nouveau.fr"]);
    expect(d.items[0].id).not.toBe("nouveau");
    expect(reduire(apres, r.action)).toBe(apres); // replayed: nothing more
  });
  it("tout est déjà là : rien à faire", () => {
    const r = actionFusion([site("a")], [site("a")], { genererId, maintenant: 0 });
    expect(r).toEqual({ action: null, ajoutes: 0, aplati: false });
  });
});

describe("zip (fonds d'écran)", () => {
  it("CRC-32 connu", () => {
    expect(crc32(new TextEncoder().encode("hello"))).toBe(0x3610a686);
  });
  it("archive : en-têtes, nombre de fichiers, contenu stocké tel quel", () => {
    const octets = new Uint8Array([1, 2, 3, 4]);
    const zip = creerZip([
      { nom: "fond-1.webp", octets },
      { nom: "fond-é.jpg", octets: new Uint8Array([9]) },
    ]);
    const v = new DataView(zip.buffer);
    expect(v.getUint32(0, true)).toBe(0x04034b50);
    const fin = zip.length - 22;
    expect(v.getUint32(fin, true)).toBe(0x06054b50);
    expect(v.getUint16(fin + 10, true)).toBe(2);
    expect([...zip.slice(30 + 11, 30 + 11 + 4)]).toEqual([1, 2, 3, 4]);
  });
});
