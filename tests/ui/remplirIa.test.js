import { describe, expect, it, vi } from "vitest";
import { creerRemplissageIa } from "../../src/ui/popup/remplirIa.js";

const grille = [{ id: "d1", type: "dossier", titre: "Travail", items: [] }];

function monter(
  reponse,
  {
    touches = new Set(),
    formulaire = { titre: "", tags: [], description: "", dossierId: null },
  } = {},
) {
  const appelerIa = vi.fn(() => reponse);
  const appliquer = vi.fn();
  const etats = [];
  const r = creerRemplissageIa({
    formulaire: () => formulaire,
    touches: () => touches,
    grille: () => grille,
    onglet: { url: "https://a.fr", titre: "A" },
    appliquer,
    surEtat: (e, m) => etats.push([e, m]),
    charger: async () => ({ appelerIa }),
  });
  return { r, appelerIa, appliquer, etats };
}

describe("Remplir avec l'IA (fenêtre)", () => {
  it("un clic = un appel ; remplit sans écraser un champ modifié", async () => {
    const m = monter(
      Promise.resolve({ titre: "IA", tags: ["t"], description: "d", dossier: "d1" }),
      {
        touches: new Set(["titre"]),
        formulaire: { titre: "Mon nom", tags: [], description: "", dossierId: null },
      },
    );
    await m.r.lancer();
    expect(m.appelerIa).toHaveBeenCalledTimes(1);
    expect(m.appelerIa.mock.calls[0][0]).toBe("iaProposerSite");
    const [formulaire, remplis] = m.appliquer.mock.calls[0];
    expect(formulaire.titre).toBe("Mon nom");
    expect(remplis).toEqual(["tags", "description", "dossier"]);
    expect(formulaire.dossierId).toBe("d1");
    expect(m.etats.map((e) => e[0])).toEqual(["attente", "ok"]);
  });

  it("annulée : la réponse qui arrive ensuite est ignorée", async () => {
    let fin;
    const m = monter(new Promise((ok) => (fin = ok)));
    const p = m.r.lancer();
    m.r.annuler();
    fin({ titre: "Tard", tags: ["x"], description: "d", dossier: "d1" });
    await p;
    expect(m.appliquer).not.toHaveBeenCalled();
    expect(m.etats.at(-1)[0]).toBe("annule");
  });

  it("erreur : message lisible, formulaire intact", async () => {
    const m = monter(Promise.reject({ code: "functions/unauthenticated" }));
    await m.r.lancer();
    expect(m.appliquer).not.toHaveBeenCalled();
    expect(m.etats.at(-1)).toEqual(["erreur", "Connectez-vous pour utiliser l'IA."]);
  });
});
