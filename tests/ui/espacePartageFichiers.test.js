import { afterEach, describe, expect, it, vi } from "vitest";
import { reduire } from "../../src/core/actions.js";
import { etatInitial } from "../../src/core/modele.js";
import { creerStore } from "../../src/core/store.js";
import { creerFichiers } from "../../src/ui/espacePartageFichiers.js";

afterEach(() => document.body.replaceChildren());
const attendre = () => new Promise((r) => setTimeout(r, 0));
const MO = 1024 * 1024;
const fichier = (nom, taille = 100, type = "application/pdf") => ({ name: nom, size: taille, type });

function monter({ octets = 0, envoi, details, editerDetails } = {}) {
  const store = creerStore(etatInitial(), reduire);
  const liste = document.createElement("ul");
  const rendre = vi.fn(() => liste.replaceChildren(...f.cartesEnvoi()));
  const fb = {
    envoyerFichierPartage: vi.fn(
      envoi ??
        (() => ({
          promesse: Promise.resolve("id1"),
          annuler: () => {},
        })),
    ),
    lireFichierPartage: vi.fn(async () => new Blob([new Uint8Array(10)], { type: "image/png" })),
    supprimerFichierPartage: vi.fn(async () => {}),
    modifierDetailsPartage: vi.fn(async () => {}),
  };
  const viderDetails = vi.fn();
  const f = creerFichiers({ charger: async () => fb, uid: () => "u1", store, rendre, octets: () => octets, details, viderDetails, editerDetails });
  document.body.append(f.quota, f.message, liste);
  return { f, fb, liste, rendre, viderDetails };
}

describe("fichiers du partage (V4.25)", () => {
  it("fichier trop gros : « Maximum 25 Mo », aucun envoi", async () => {
    const { f, fb } = monter();
    await f.ajouter([fichier("a.pdf", 26 * MO)]);
    expect(fb.envoyerFichierPartage).not.toHaveBeenCalled();
    expect(f.message.textContent).toContain("Maximum 25 Mo");
  });
  it("type refusé : « Ce type de fichier n'est pas accepté »", async () => {
    const { f, fb } = monter();
    await f.ajouter([fichier("setup.exe")]);
    expect(fb.envoyerFichierPartage).not.toHaveBeenCalled();
    expect(f.message.textContent).toContain("Ce type de fichier n'est pas accepté");
  });
  it("quota plein : message « libérez de l'espace »", async () => {
    const { f, fb } = monter({ octets: 200 * MO });
    await f.ajouter([fichier("a.pdf", 10)]);
    expect(fb.envoyerFichierPartage).not.toHaveBeenCalled();
    expect(f.message.textContent).toContain("libérez de l'espace");
  });
  it("hors ligne : « Reconnectez-vous pour envoyer »", async () => {
    const { f, fb } = monter();
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    await f.ajouter([fichier("a.pdf")]);
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    expect(fb.envoyerFichierPartage).not.toHaveBeenCalled();
    expect(f.message.textContent).toContain("Reconnectez-vous pour envoyer");
  });
  it("envoi réussi : la carte d'envoi disparaît (la carte du fichier vient de la base)", async () => {
    const { f, fb } = monter();
    await f.ajouter([fichier("a.pdf")]);
    await attendre();
    await attendre();
    expect(fb.envoyerFichierPartage).toHaveBeenCalledTimes(1);
    expect(f.nbEnvois()).toBe(0);
  });
  it("échec : « Réessayer » relance l'envoi ; « Abandonner » le retire", async () => {
    let essais = 0;
    const { f, liste } = monter({
      envoi: () => {
        essais++;
        return { promesse: essais === 1 ? Promise.reject(Object.assign(new Error("x"), { code: "storage/retry-limit-exceeded" })) : Promise.resolve("ok"), annuler: () => {} };
      },
    });
    await f.ajouter([fichier("a.pdf")]);
    await attendre();
    await attendre();
    expect(liste.textContent).toContain("Interrompu — Réessayer");
    [...liste.querySelectorAll("button")].find((b) => b.textContent === "Réessayer").click();
    await attendre();
    await attendre();
    expect(essais).toBe(2);
    expect(f.nbEnvois()).toBe(0);
  });
  it("annulation par l'utilisateur : rien ne reste, aucun message d'erreur", async () => {
    let rejeter;
    const { f, liste } = monter({
      envoi: () => ({
        promesse: new Promise((_, ko) => (rejeter = ko)),
        annuler: () => rejeter(Object.assign(new Error("annulé"), { code: "annule" })),
      }),
    });
    await f.ajouter([fichier("a.pdf")]);
    await attendre();
    await attendre();
    expect(f.nbEnvois()).toBe(1);
    [...liste.querySelectorAll("button")].find((b) => b.textContent === "Annuler").click();
    await attendre();
    await attendre();
    expect(f.nbEnvois()).toBe(0);
    expect(liste.textContent).not.toContain("Échec");
  });
  it("la barre de progression est accessible (aria-valuenow)", async () => {
    let progres;
    const { f, liste } = monter({
      envoi: (_u, _f, surProgres) => {
        progres = surProgres;
        return { promesse: new Promise(() => {}), annuler: () => {} };
      },
    });
    await f.ajouter([fichier("a.pdf")]);
    await attendre();
    await attendre();
    progres(0.5);
    const barre = liste.querySelector("[role=progressbar]");
    expect(barre.getAttribute("aria-valuenow")).toBe("50");
  });
  it("quota : « 38 Mo sur 200 Mo », orange à 80 %, rouge à 100 %, avec du texte", () => {
    const a = monter({ octets: 38 * MO });
    a.f.majQuota();
    expect(a.f.quota.textContent).toContain("38 Mo sur 200 Mo");
    const b = monter({ octets: 170 * MO });
    b.f.majQuota();
    expect(b.f.quota.dataset.niveau).toBe("avertissement");
    expect(b.f.quota.textContent).toContain("bientôt plein");
    const c = monter({ octets: 200 * MO });
    c.f.majQuota();
    expect(c.f.quota.dataset.niveau).toBe("plein");
    expect(c.f.quota.getAttribute("aria-valuenow")).toBe(String(200 * MO));
  });
  it("cartes : SVG sans bouton « Voir » et avec avertissement ; image avec « Voir »", () => {
    const { f } = monter();
    const svg = f.carte({ id: "1", type: "fichier", contenu: "dessin.svg", typeMime: "image/svg+xml", taille: 10, chemin: "partages/u1/1/dessin.svg" });
    expect([...svg.querySelectorAll("button")].map((b) => b.textContent)).not.toContain("Voir");
    expect(svg.textContent).toContain("jamais affiché");
    expect(svg.querySelector("img")).toBeNull();
    const png = f.carte({ id: "2", type: "fichier", contenu: "photo.png", typeMime: "image/png", taille: 10, chemin: "partages/u1/2/photo.png" });
    expect([...png.querySelectorAll("button")].map((b) => b.textContent)).toContain("Voir");
  });
  it("miniature : toujours là après un nouveau rendu (carte construite hors de la page)", async () => {
    const { f, fb } = monter();
    if (!URL.createObjectURL) URL.createObjectURL = () => "blob:x";
    const brut = { id: "4", type: "fichier", contenu: "photo.png", typeMime: "image/png", taille: 10, chemin: "partages/u1/4/photo.png" };
    for (let n = 0; n < 3; n++) {
      const c = f.carte(brut); // built detached, like rendre() does
      await attendre();
      document.body.append(c);
      expect(c.querySelector("img.partage-miniature")).not.toBeNull();
      c.remove();
    }
    expect(fb.lireFichierPartage).toHaveBeenCalledTimes(1);
  });
  it("V4.31 : le titre et la description saisis partent avec le fichier, puis sont vidés", async () => {
    const { f, fb, viderDetails } = monter({ details: () => ({ titre: "Vacances", description: "plage" }) });
    await f.ajouter([fichier("a.pdf")]);
    await attendre();
    expect(fb.envoyerFichierPartage.mock.calls[0][5]).toEqual({ titre: "Vacances", description: "plage" });
    expect(viderDetails).toHaveBeenCalled();
  });
  it("V4.31 : carte avec titre et description ; « Modifier » enregistre les nouveaux", async () => {
    const editerDetails = vi.fn(async () => ({ titre: "", description: "nouvelle" }));
    const { f, fb } = monter({ editerDetails });
    const c = f.carte({ id: "5", type: "fichier", contenu: "a.pdf", titre: "Vacances", description: "plage", typeMime: "application/pdf", taille: 10, chemin: "partages/u1/5/a.pdf" });
    expect(c.querySelector(".partage-titre").textContent).toBe("Vacances");
    expect(c.textContent).toContain("plage");
    [...c.querySelectorAll("button")].find((b) => b.textContent === "Modifier").click();
    await attendre();
    await attendre();
    expect(editerDetails).toHaveBeenCalledWith(
      expect.objectContaining({ titre: "Vacances", description: "plage" }),
    );
    expect(editerDetails.mock.calls[0][0].element.id).toBe("5");
    // An empty title: the name of the file again.
    expect(fb.modifierDetailsPartage).toHaveBeenCalledWith("u1", "5", { titre: "a.pdf", description: "nouvelle" });
    const sans = f.carte({ id: "6", type: "fichier", contenu: "b.pdf", titre: "b.pdf", typeMime: "application/pdf", taille: 10, chemin: "partages/u1/6/b.pdf" });
    expect(sans.querySelector(".partage-titre")).toBeNull();
  });
  it("nom affiché en texte : un nom piégé ne crée aucun élément", () => {
    const { f } = monter();
    const c = f.carte({ id: "3", type: "fichier", contenu: '<img src=x onerror=alert(1)>.pdf', typeMime: "application/pdf", taille: 10, chemin: "partages/u1/3/x.pdf" });
    expect(c.querySelector(".partage-nom img")).toBeNull();
    expect(c.querySelector(".partage-nom").textContent).toContain("<img");
  });
  it("zone de dépôt : cadre « Déposer ici » seulement pendant un glissement de fichiers", () => {
    const { f } = monter();
    const zone = document.createElement("div");
    document.body.append(zone);
    f.brancherZone(zone);
    expect(f.cadreDepot.hidden).toBe(true);
    const ev = new Event("dragenter", { bubbles: true, cancelable: true });
    ev.dataTransfer = { types: ["Files"] };
    zone.dispatchEvent(ev);
    expect(f.cadreDepot.hidden).toBe(false);
    zone.dispatchEvent(new Event("dragleave", { bubbles: true }));
    expect(f.cadreDepot.hidden).toBe(true);
    const texte = new Event("dragenter", { bubbles: true, cancelable: true });
    texte.dataTransfer = { types: ["text/plain"] };
    zone.dispatchEvent(texte);
    expect(f.cadreDepot.hidden).toBe(true);
  });
  it("le sélecteur de fichiers est ouvert par un vrai clic", () => {
    const { f } = monter();
    const clic = vi.spyOn(f.entree, "click");
    f.boutonAjout.click();
    expect(clic).toHaveBeenCalled();
    expect(f.entree.accept).toBe("*/*");
  });
});
