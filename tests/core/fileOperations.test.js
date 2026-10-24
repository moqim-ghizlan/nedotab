import { describe, expect, it } from "vitest";
import { A } from "../../src/core/actions.js";
import {
  ajouter,
  FILE_MAX,
  fusionnerFiles,
  retirerJusqua,
  validerFile,
} from "../../src/core/fileOperations.js";
import { etatInitial } from "../../src/core/modele.js";

const op = (idOp, creeLe = 0, type = A.ELEMENT_SUPPRIMER) => ({
  idOp,
  creeLe,
  action: { type, id: idOp },
});

describe("file d'opérations", () => {
  it("ajouter puis retirer jusqu'à une opération confirmée", () => {
    let file = [];
    for (const id of ["1", "2", "3"]) file = ajouter(file, op(id)).file;
    expect(retirerJusqua(file, "2").map((o) => o.idOp)).toEqual(["3"]);
    expect(retirerJusqua(file, "inconnue")).toBe(file);
  });

  it("une restauration remplace les opérations antérieures", () => {
    const file = [op("1"), op("2")];
    const r = ajouter(file, op("3", 0, A.GRILLE_RESTAURER));
    expect(r.file.map((o) => o.idOp)).toEqual(["3"]);
  });

  it(`au-delà de ${FILE_MAX} opérations : compactée en un seul état local`, () => {
    const file = Array.from({ length: FILE_MAX }, (_, i) => op(`${i}`, i));
    const local = { ...etatInitial(), grille: [{ id: "x" }] };
    const r = ajouter(file, op("dernier", FILE_MAX), local);
    expect(r.compactee).toBe(true);
    expect(r.file).toHaveLength(1);
    expect(r.file[0]).toMatchObject({
      idOp: "dernier",
      action: { type: A.SYNCHRO_APPLIQUER, grille: local.grille, reglages: local.reglages },
    });
  });

  it("données abîmées écartées", () => {
    expect(validerFile([op("1"), null, { idOp: 2 }, { idOp: "3", creeLe: 1 }, "x"])).toEqual([
      op("1"),
    ]);
    expect(validerFile(undefined)).toEqual([]);
  });

  it("files de plusieurs onglets fusionnées dans l'ordre de création, sans doublon", () => {
    const r = fusionnerFiles([op("a", 1), op("c", 5)], [op("b", 3), op("a", 1)]);
    expect(r.map((o) => o.idOp)).toEqual(["a", "b", "c"]);
  });
});
