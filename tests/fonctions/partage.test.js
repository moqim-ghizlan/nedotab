import { readdirSync, readFileSync } from "node:fs";
import { Window } from "happy-dom";
import { parseHTML } from "linkedom";
import { describe, expect, it } from "vitest";
import { extraireContenu as extraireServeur } from "../../functions/src/partage/extraitPage.js";
import { extraireContenu as extraireClient } from "../../src/core/extraitPage.js";

const lire = (chemin) => readFileSync(new URL(chemin, import.meta.url), "utf8");

describe("code partagé client / serveur", () => {
  it.each(["extraitPage", "confidentialiteUrl", "infosPage", "url", "listeCompacte", "preFiltre", "besoinContexteSites", "outils", "estimation", "confidentialiteIa"])(
    "%s : copie identique",
    (nom) => {
      const copie = lire(`../../functions/src/partage/${nom}.js`).split("\n").slice(1).join("\n");
      expect(copie.replace(/\r/g, "")).toBe(lire(`../../src/core/${nom}.js`).replace(/\r/g, ""));
    },
  );
});

describe("extraction serveur (linkedom) = extraction client sur les fixtures V4.3", () => {
  const fenetre = new Window();
  const dossier = new URL("../fixtures/pages/contenu/", import.meta.url);
  for (const nom of readdirSync(dossier).filter((f) => f.endsWith(".html"))) {
    it(nom, () => {
      const source = readFileSync(new URL(nom, dossier), "utf8");
      const url = "https://www.exemple.com/page";
      const client = extraireClient(
        new fenetre.DOMParser().parseFromString(source, "text/html"),
        url,
      );
      expect(extraireServeur(parseHTML(source).document, url)).toEqual(client);
    });
  }
});
