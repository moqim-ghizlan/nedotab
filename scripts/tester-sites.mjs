// Runs the "read the page" step of the icon chain on real sites from Node (no CORS here,
// like the extension once the site permission is granted) and prints a Markdown table.
// Usage: node scripts/tester-sites.mjs [url ...]
import { Window } from "happy-dom";
import { classerIcones, extraireInfos, iconesDuManifeste } from "../src/core/infosPage.js";
import { normaliserUrl } from "../src/core/url.js";
import { lireJson, lirePage } from "../src/platform/reseau.js";

const SITES = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      "github.com",
      "wikipedia.org",
      "youtube.com",
      "notion.so",
      "lemonde.fr",
      "mail.google.com",
      "example.com",
      "http://github.com",
      "https://nexistepas.invalid",
    ];

const fenetre = new Window();

async function iconeAccessible(href) {
  try {
    const r = await fetch(href, { redirect: "follow", signal: AbortSignal.timeout(4000) });
    const type = r.headers.get("content-type") || "";
    return r.ok && (type.startsWith("image/") || /\.(ico|svg|png)(\?|$)/.test(href));
  } catch {
    return false;
  }
}

async function google(url) {
  const domaine = new URL(url).hostname.replace(/^www\./, "");
  try {
    const r = await fetch(`https://www.google.com/s2/favicons?domain=${domaine}&sz=128`, {
      signal: AbortSignal.timeout(4000),
    });
    const octets = new Uint8Array(await r.arrayBuffer());
    // PNG width is stored big-endian at byte 16.
    const largeur = (octets[16] << 24) | (octets[17] << 16) | (octets[18] << 8) | octets[19];
    return r.ok ? largeur : 0;
  } catch {
    return 0;
  }
}

console.log("| Site | Titre trouvé | Icône (HTML) | Google s2 | Résultat |");
console.log("|---|---|---|---|---|");
for (const saisie of SITES) {
  const { url } = normaliserUrl(saisie);
  const page = await lirePage(url);
  let titre = "(domaine)";
  let icone = "—";
  if (page) {
    const doc = new fenetre.DOMParser().parseFromString(page.html, "text/html");
    const infos = extraireInfos(doc, page.urlFinale, url);
    titre = infos.titre;
    let candidats = infos.icones;
    if (infos.manifeste) {
      const json = await lireJson(infos.manifeste);
      if (json) candidats = [...candidats, ...iconesDuManifeste(json, infos.manifeste)];
    }
    for (const c of classerIcones(candidats)) {
      if (await iconeAccessible(c.href)) {
        icone = `${c.rel} ${c.taille || ""}`.trim();
        break;
      }
    }
  }
  const g = await google(url);
  const resultat = icone !== "—" ? "icône du site" : g >= 32 ? "icône Google" : "pastille lettre";
  console.log(`| ${saisie} | ${titre} | ${icone} | ${g ? `${g} px` : "—"} | ${resultat} |`);
}
