import { describe, expect, it, vi } from "vitest";
import { chiffrerPourLien, preuveMotDePasseLien } from "../../src/core/coffre.js";
import {
  deballer,
  emballer,
  formaterLien,
  genererLien,
  nomSur,
  adresseSure,
} from "../../src/core/lienPartage.js";
import { demarrer } from "../../src/receveur/reception.js";

const ITER = 310_000;
const b64u = (o) => Buffer.from(o).toString("base64url");

/** A fake server holding one link. */
async function serveur({
  type = "texte",
  contenu = "bonjour",
  nom = "",
  mdp = null,
  ouverturesMax = 5,
  extra = {},
} = {}) {
  const { jeton, cle } = genererLien();
  const octets = new TextEncoder().encode(contenu);
  const donnees = await chiffrerPourLien({
    cle,
    jeton,
    motDePasse: mdp,
    octets: emballer({ type, nom, typeMime: "text/html", octets }),
    iterations: ITER,
  });
  const etat = { ouvertures: 0, essais: 0, appels: [] };
  const preuve = mdp ? await preuveMotDePasseLien(mdp, jeton, ITER) : null;
  const requete = vi.fn(async (url, init) => {
    const corps = JSON.parse(init.body);
    etat.appels.push({ url, corps, init });
    const rep = (statut, json) => ({ ok: statut < 300, status: statut, json: async () => json });
    if (url.endsWith("/signaler")) return rep(200, { ok: true });
    if (corps.jeton !== jeton) return rep(404, { erreur: "indisponible" });
    if (corps.action === "info")
      return rep(200, {
        type,
        taille: donnees.length,
        motDePasse: !!mdp,
        iterations: mdp ? ITER : null,
        verrouille: false,
      });
    if (mdp && corps.preuve !== preuve) {
      etat.essais++;
      return rep(401, { erreur: "mot-de-passe", restants: 5 - etat.essais });
    }
    if (etat.ouvertures >= ouverturesMax && !corps.ticket)
      return rep(404, { erreur: "indisponible" });
    if (!corps.ticket) etat.ouvertures++;
    return rep(200, {
      ticket: "ticket1",
      type,
      donnees: b64u(donnees),
      iterations: mdp ? ITER : null,
      ...extra,
    });
  });
  return { jeton, cle, requete, etat };
}

function page(fragment, deps) {
  document.body.innerHTML = '<main id="recevoir"></main>';
  const racine = document.getElementById("recevoir");
  const effacer = vi.fn();
  const copier = vi.fn(async () => {});
  const telecharger = vi.fn();
  const ouvrirLien = vi.fn();
  demarrer({
    racine,
    fragment,
    effacerFragment: effacer,
    copier,
    telecharger,
    ouvrirLien,
    ...deps,
  });
  return { racine, effacer, copier, telecharger, ouvrirLien };
}
const attendre = async (cond) => {
  for (let i = 0; i < 400 && !cond(); i++) await new Promise((r) => setTimeout(r, 5));
  expect(Boolean(cond())).toBe(true);
};
const bouton = (racine, texte) =>
  [...racine.querySelectorAll("button")].find((b) => b.textContent.startsWith(texte));

describe("page de réception", () => {
  it("efface le fragment de l'URL dès la lecture ; lien incomplet : message clair, aucune requête", async () => {
    const requete = vi.fn();
    const p = page("#abc", { requete });
    expect(p.effacer).toHaveBeenCalledTimes(1);
    await attendre(() => p.racine.textContent.includes("Le lien est incomplet"));
    expect(requete).not.toHaveBeenCalled();
  });

  it("n'écrit ni dans localStorage ni dans les cookies ; la requête ne porte pas la clé", async () => {
    const s = await serveur();
    const set = vi.spyOn(Storage.prototype, "setItem");
    const p = page(`#${s.jeton}.${s.cle}`, { requete: s.requete });
    await attendre(() => bouton(p.racine, "Ouvrir"));
    bouton(p.racine, "Ouvrir").click();
    await attendre(() => p.racine.textContent.includes("Texte reçu"));
    expect(set).not.toHaveBeenCalled();
    expect(document.cookie).toBe("");
    for (const a of s.etat.appels) {
      expect(JSON.stringify(a)).not.toContain(s.cle);
      expect(a.url.startsWith("/api/lien/")).toBe(true);
      expect(a.init.credentials).toBe("omit");
      expect(a.init.referrerPolicy).toBe("no-referrer");
    }
    set.mockRestore();
  });

  it("l'ouverture n'est comptée qu'au clic sur « Ouvrir » (pas au chargement)", async () => {
    const s = await serveur();
    const p = page(`#${s.jeton}.${s.cle}`, { requete: s.requete });
    await attendre(() => bouton(p.racine, "Ouvrir"));
    expect(s.etat.ouvertures).toBe(0);
    expect(p.racine.textContent).toContain("NedoTab ne le vérifie pas");
    bouton(p.racine, "Ouvrir").click();
    await attendre(() => s.etat.ouvertures === 1);
  });

  it("HTML et javascript: dans le contenu : affichés comme texte, jamais interprétés", async () => {
    const piege = '<img src=x onerror="window.pwn=1"><script>window.pwn=2</script>';
    const s = await serveur({ contenu: piege });
    const p = page(`#${s.jeton}.${s.cle}`, { requete: s.requete });
    await attendre(() => bouton(p.racine, "Ouvrir"));
    bouton(p.racine, "Ouvrir").click();
    await attendre(() => p.racine.querySelector("pre"));
    expect(p.racine.querySelector("pre").textContent).toBe(piege);
    expect(p.racine.querySelector("img, script")).toBeNull();
    expect(window.pwn).toBeUndefined();
  });

  it("un lien javascript: n'est pas proposé à l'ouverture ; un lien https demande deux clics", async () => {
    const mauvais = await serveur({ type: "lien", contenu: "javascript:alert(1)" });
    const p1 = page(`#${mauvais.jeton}.${mauvais.cle}`, { requete: mauvais.requete });
    await attendre(() => bouton(p1.racine, "Ouvrir"));
    bouton(p1.racine, "Ouvrir").click();
    await attendre(() => p1.racine.querySelector("pre"));
    expect(bouton(p1.racine, "Ouvrir (à vos risques)")).toBeUndefined();
    expect(adresseSure("javascript:alert(1)")).toBeNull();
    expect(adresseSure("data:text/html,<b>")).toBeNull();

    const bon = await serveur({ type: "lien", contenu: "https://exemple.org/page" });
    const p2 = page(`#${bon.jeton}.${bon.cle}`, { requete: bon.requete });
    await attendre(() => bouton(p2.racine, "Ouvrir"));
    bouton(p2.racine, "Ouvrir").click();
    await attendre(() => bouton(p2.racine, "Ouvrir (à vos risques)"));
    expect(p2.racine.textContent).toContain("Ce lien vient d'une personne externe");
    bouton(p2.racine, "Ouvrir (à vos risques)").click();
    expect(p2.ouvrirLien).not.toHaveBeenCalled();
    bouton(p2.racine, "Confirmer").click();
    expect(p2.ouvrirLien).toHaveBeenCalledWith("https://exemple.org/page");
    expect(p2.racine.querySelector("a[href^='http']")).toBeNull();
  });

  it("un fichier se télécharge seulement (type neutre, nom nettoyé), sans aperçu", async () => {
    const s = await serveur({
      type: "fichier",
      nom: "../rapport‮gpj.exe",
      contenu: "<html>x</html>",
    });
    const p = page(`#${s.jeton}.${s.cle}`, { requete: s.requete });
    await attendre(() => bouton(p.racine, "Ouvrir"));
    bouton(p.racine, "Ouvrir").click();
    await attendre(() => bouton(p.racine, "Télécharger"));
    expect(p.racine.querySelector("img, iframe, object, embed, video, audio")).toBeNull();
    bouton(p.racine, "Télécharger").click();
    const [blob, nom] = p.telecharger.mock.calls[0];
    expect(blob.type).toBe("application/octet-stream");
    expect(nom).toBe("rapportgpj.exe");
  });

  it("lien protégé : mauvais mot de passe → essais restants ; bon mot de passe → contenu", async () => {
    const s = await serveur({ mdp: "une phrase de passe pour le lien" });
    const p = page(`#${s.jeton}.${s.cle}`, { requete: s.requete });
    await attendre(() => bouton(p.racine, "Déverrouiller"));
    p.racine.querySelector("input").value = "faux faux faux faux";
    bouton(p.racine, "Déverrouiller").click();
    await attendre(() => p.racine.textContent.includes("il reste 4 essais"));
    p.racine.querySelector("input").value = "une phrase de passe pour le lien";
    bouton(p.racine, "Déverrouiller").click();
    await attendre(() => p.racine.textContent.includes("Texte reçu"));
    expect(p.racine.querySelector("pre").textContent).toBe("bonjour");
  });

  it("lien indisponible : un seul message neutre", async () => {
    const s = await serveur();
    const autre = genererLien();
    const p = page(`#${autre.jeton}.${autre.cle}`, { requete: s.requete });
    await attendre(() => p.racine.textContent.includes("Ce lien n'est plus disponible."));
  });

  it("signaler appelle le serveur avec le jeton seulement", async () => {
    const s = await serveur();
    const p = page(`#${s.jeton}.${s.cle}`, { requete: s.requete });
    await attendre(() => bouton(p.racine, "Signaler"));
    bouton(p.racine, "Signaler").click();
    await attendre(() => s.etat.appels.some((a) => a.url.endsWith("/signaler")));
    expect(s.etat.appels.find((a) => a.url.endsWith("/signaler")).corps).toEqual({
      jeton: s.jeton,
    });
  });
});

describe("emballage du contenu", () => {
  it("aller-retour et refus d'un format invalide", () => {
    const o = new Uint8Array([1, 2, 3]);
    expect(
      deballer(emballer({ type: "fichier", nom: "a.bin", typeMime: "x/y", octets: o })),
    ).toMatchObject({ type: "fichier", nom: "a.bin", octets: o });
    expect(deballer(new Uint8Array([0, 0, 0, 200, 1]))).toBeNull();
    expect(deballer(new Uint8Array([1]))).toBeNull();
    expect(deballer(emballer({ type: "exe", octets: o }))).toBeNull();
  });
  it("nom sûr", () => {
    expect(nomSur("")).toBe("fichier");
    expect(nomSur("a/b\\c")).toBe("abc");
  });
  it("formaterLien garde la clé dans le fragment", () => {
    expect(formaterLien("https://x.web.app/", "J", "K")).toBe("https://x.web.app/r#J.K");
  });
});
