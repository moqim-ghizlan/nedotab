import { describe, expect, it, vi } from "vitest";
import { reduire } from "../../src/core/actions.js";
import { etatInitial } from "../../src/core/modele.js";
import { creerStore } from "../../src/core/store.js";
import { creerRestauration } from "../../src/ui/services/restauration.js";

const site = (id) => ({ id, type: "site", titre: id, url: `https://${id}.fr`, creeLe: 0 });

function monter({ mode = "compte", statut = "synchronise", creer = vi.fn(async () => "id") } = {}) {
  const store = creerStore({ ...etatInitial(), grille: [site("a"), site("b")] }, reduire);
  const fb = { creerSauvegarde: creer, rotation: vi.fn(async () => 0) };
  const copies = [];
  const r = creerRestauration({
    store,
    session: {
      synchro: { lire: () => ({ mode, statut }) },
      compte: { lire: () => ({ profil: { uid: "u" } }) },
    },
    charger: async () => fb,
    plat: { copies: { enregistrer: async (e) => copies.push(e) } },
  });
  return { store, fb, r, copies };
}
const sauvegarde = (grille, extra = {}) => ({
  id: "s1",
  versionSchema: 2,
  grille,
  reglages: { theme: "sombre", fond: { type: "aucun" }, fonds: [] },
  creeLe: 0,
  ...extra,
});

describe("restauration", () => {
  it("restaurer puis annuler → état strictement identique", async () => {
    const m = monter();
    const avant = structuredClone(m.store.lire());
    const res = await m.r.restaurer(sauvegarde([site("x")]));
    expect(res.ok).toBe(true);
    expect(m.store.lire().grille.map((e) => e.id)).toEqual(["x"]);
    expect(m.store.lire().reglages.theme).toBe("sombre");
    expect(m.fb.creerSauvegarde).toHaveBeenCalledWith(
      "u",
      expect.anything(),
      expect.objectContaining({ type: "avant-restauration" }),
    );
    res.annuler();
    expect(m.store.lire()).toEqual(avant);
    expect(m.fb.creerSauvegarde).toHaveBeenCalledTimes(1); // no new safety copy for the undo
  });
  it("sauvegarde d'un schéma ancien : migrée", async () => {
    const m = monter();
    const vieille = {
      versionSchema: 1,
      grille: [site("x")],
      reglages: { theme: "auto", fond: { type: "image", ref: "local:z", dominante: "#000000" } },
    };
    expect((await m.r.restaurer(vieille)).ok).toBe(true);
    expect(m.store.lire().reglages.fond).toEqual({ type: "aucun" });
  });
  it("version future : refusée", async () => {
    const m = monter();
    expect((await m.r.restaurer(sauvegarde([site("x")], { versionSchema: 9 }))).ok).toBe(false);
  });
  it("échec de la copie de sécurité → aucune modification", async () => {
    const m = monter({ creer: vi.fn(async () => Promise.reject(new Error("réseau"))) });
    const avant = m.store.lire();
    const res = await m.r.restaurer(sauvegarde([site("x")]));
    expect(res).toEqual({
      ok: false,
      erreur: "Impossible de créer une copie de sécurité, restauration annulée.",
    });
    expect(m.store.lire()).toBe(avant);
  });
  it("hors ligne en mode compte : refusée", async () => {
    const m = monter({ statut: "hors-ligne" });
    expect((await m.r.restaurer(sauvegarde([site("x")]))).ok).toBe(false);
    expect(m.fb.creerSauvegarde).not.toHaveBeenCalled();
  });
  it("mode local : copie locale avant la restauration", async () => {
    const m = monter({ mode: "local" });
    expect((await m.r.restaurer(sauvegarde([site("x")]))).ok).toBe(true);
    expect(m.copies).toHaveLength(1);
    expect(m.fb.creerSauvegarde).not.toHaveBeenCalled();
  });
  it("fond d'écran supprimé depuis : fond « aucun » et signalé", async () => {
    const m = monter();
    const fond = {
      id: "f1",
      chemin: "users/u/fonds/f1.webp",
      dominante: "#123456",
      largeur: 1,
      hauteur: 1,
      taille: 1,
      ajouteLe: 1,
    };
    const prepare = m.r.preparer(
      sauvegarde([], {
        reglages: { theme: "auto", fond: { type: "image", id: "f1" }, fonds: [fond] },
      }),
    );
    expect(prepare.fondPerdu).toBe(true);
    expect(prepare.etat.reglages.fond).toEqual({ type: "aucun" });
    expect(prepare.etat.reglages.fonds).toEqual([]);
  });
  it("aperçu : différences calculées avec l'état actuel", () => {
    const m = monter();
    const d = m.r.preparer(sauvegarde([site("a"), site("c")])).differences;
    expect(d.ajoutes.map((e) => e.id)).toEqual(["c"]);
    expect(d.retires.map((e) => e.id)).toEqual(["b"]);
  });
});
