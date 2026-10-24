// V1.10 browser scenario: instant search (/, Ctrl+K), levels, folders opened at their level,
// web search with the default engine, Ctrl+Enter, address proposal, safe highlighting.
import { attendre } from "../navigateur.mjs";

const site = (id, titre, url) => ({
  id,
  type: "site",
  titre,
  url,
  icone: { type: "lettre", couleur: "#2c6b5a" },
  creeLe: 0,
});
const dossier = (id, titre, items) => ({ id, type: "dossier", titre, items, creeLe: 0 });

function etatDeDepart() {
  return {
    versionSchema: 1,
    grille: [
      site("gh", "GitHub", "https://github.com"),
      site("dig", "Digital Magazine", "https://example.org/digital"),
      site("gl", "GitLab", "https://gitlab.com"),
      site("xss", '<img src=x onerror="window.pirate=1">Piège', "https://example.com"),
      dossier("travail", "Travail", [
        dossier("clients", "Clients", [
          dossier("projets", "Projets", [site("crm", "Mon CRM", "https://example.net/crm")]),
        ]),
      ]),
    ],
    reglages: { theme: "auto", fond: { type: "aucun" } },
  };
}

export async function scenarioRecherche({ nav, url, verifier, dossier: evidence }) {
  const p = await nav.ouvrir(url);
  await p.sombre(false);
  await p.eval(
    `chrome.storage.local.set({ etat: { ...${JSON.stringify(etatDeDepart())}, ecritPar: "test", majLe: 1 } })`,
  );
  const recharger = async () => {
    await p.aller(url);
    await attendre(300);
  };
  await recharger();
  const resultats = () =>
    p.eval(
      `[...document.querySelectorAll(".resultat")].map((r) => [...r.children].filter((c) => !c.classList.contains("resultat-icone") || c.classList.contains("resultat-icone--symbole")).map((c) => c.textContent).join("") + (r.getAttribute("aria-selected") === "true" ? " [*]" : ""))`,
    );
  const chercher = async (texte) => {
    await p.eval(
      `(() => { const c = document.getElementById("recherche"); c.focus(); c.value = ""; c.dispatchEvent(new Event("input")); })()`,
    );
    await p.taper(texte);
    await attendre(100);
  };

  // "/" anywhere puts the focus in the search
  await p.souris("mousePressed", 40, 600);
  await p.souris("mouseReleased", 40, 600, { buttons: 0 });
  await p.touche("/", { vk: 191, code: "Slash", texte: "/" });
  await attendre(100);
  verifier(
    "« / » place le focus dans la recherche",
    await p.eval(`document.activeElement?.id === "recherche"`),
  );
  verifier(
    "« / » n'est pas écrit dans le champ",
    (await p.eval(`document.getElementById("recherche").value`)) === "",
  );
  await p.eval(`document.activeElement.blur()`);
  await p.touche("k", { vk: 75, code: "KeyK", modifiers: 2 });
  await attendre(100);
  verifier(
    "Ctrl+K place le focus dans la recherche",
    await p.eval(`document.activeElement?.id === "recherche"`),
  );

  // "git": GitHub and GitLab first, first one preselected, highlight
  await p.taper("git");
  await attendre(100);
  let r = await resultats();
  verifier(
    "« git » : résultats instantanés, premier présélectionné",
    r[0].startsWith("Git") && r[0].endsWith("[*]") && r[1].startsWith("Git"),
    r.join(" | "),
  );
  verifier(
    "Mise en évidence avec <mark>",
    (await p.eval(`document.querySelector(".resultat mark")?.textContent`)) === "Git",
  );
  verifier(
    "Combobox accessible",
    await p.eval(
      `(() => { const c = document.getElementById("recherche"); return c.getAttribute("aria-expanded") === "true" && c.getAttribute("aria-activedescendant") === "resultat-0"; })()`,
    ),
  );
  await p.capture(`${evidence}/recherche-git.png`);
  await p.touche("ArrowDown", { vk: 40 });
  verifier("↓ change de résultat", (await resultats())[1].endsWith("[*]"));
  await p.touche("ArrowUp", { vk: 38 });
  await p.touche("ArrowUp", { vk: 38 });
  verifier("↑ boucle sur la dernière ligne (web)", (await resultats()).at(-1).endsWith("[*]"));

  // Site at level 3, path shown
  await chercher("crm");
  r = await resultats();
  verifier(
    "Site au niveau 3 avec son chemin",
    r[0].includes("Mon CRM") && r[0].includes("Accueil › Travail › Clients › Projets"),
    r[0],
  );

  // Safe highlighting: an HTML title stays text
  await chercher("piege");
  verifier(
    "Titre HTML affiché en texte, rien d'injecté",
    await p.eval(
      `!document.querySelector(".resultat img") && !window.pirate && document.querySelector(".resultat-titre").textContent.startsWith("<img")`,
    ),
  );

  // A folder opens directly at its level
  await chercher("projets");
  await p.touche("Enter", { vk: 13, texte: "\r" });
  await attendre(300);
  const ariane = await p.eval(
    `[...document.querySelectorAll(".ariane-element")].map((e) => e.textContent).join(" › ")`,
  );
  verifier(
    "Dossier trouvé : fenêtre ouverte à ce niveau",
    ariane === "Accueil › Travail › Clients › Projets",
    ariane,
  );
  await p.capture(`${evidence}/recherche-dossier.png`);
  await p.touche("Escape", { vk: 27 });
  await p.touche("Escape", { vk: 27 });
  await p.touche("Escape", { vk: 27 });
  await attendre(200);

  // Address typed: "Aller sur…" first
  await chercher("wikipedia.org/wiki/Paris");
  r = await resultats();
  verifier(
    "Adresse tapée : « Aller sur… » en premier",
    r[0].startsWith("↗Aller sur wikipedia.org/wiki/Paris"),
    r[0],
  );

  // Escape clears, then removes the focus
  await p.touche("Escape", { vk: 27 });
  verifier(
    "Échap vide le champ",
    (await p.eval(`document.getElementById("recherche").value`)) === "",
  );
  await p.touche("Escape", { vk: 27 });
  verifier(
    "Second Échap retire le focus",
    await p.eval(`document.activeElement?.id !== "recherche"`),
  );

  // "/" typed in another field does not jump to the search
  await p.eval(`document.querySelector(".tuile--ajout").click()`);
  await attendre(100);
  await p.eval(
    `[...document.querySelectorAll(".menu-entree")].find((b) => b.textContent === "Ajouter un site").click()`,
  );
  await attendre(150);
  await p.touche("/", { vk: 191, code: "Slash", texte: "/" });
  verifier(
    "« / » dans un champ de saisie reste dans ce champ",
    await p.eval(`document.activeElement?.id === "ajout-url"`),
  );
  await p.touche("Escape", { vk: 27 });
  await attendre(100);

  // Ctrl+Enter: new tab
  const onglets = async () =>
    (await nav.envoyer("Target.getTargets")).targetInfos.filter((t) => t.type === "page").length;
  const avant = await onglets();
  await chercher("gitlab");
  await p.touche("Enter", { vk: 13, texte: "\r", modifiers: 2 });
  await attendre(800);
  verifier("Ctrl+Entrée ouvre un nouvel onglet", (await onglets()) === avant + 1);
  verifier("… et la page reste en place", (await p.eval("location.href")).endsWith("newtab.html"));

  verifier("Aucune erreur console (recherche)", p.erreurs.length === 0, p.erreurs.join(" | "));

  // Enter on a site: current tab
  await chercher("github");
  await p.touche("Enter", { vk: 13, texte: "\r" });
  await attendre(1500);
  const apresSite = await p.eval("location.href");
  verifier(
    "Entrée ouvre le site dans l'onglet courant",
    apresSite.startsWith("https://github.com"),
    apresSite,
  );

  // Nothing found: default search engine (chrome.search.query)
  await recharger();
  await chercher("recette tarte");
  r = await resultats();
  verifier(
    "Aucun résultat : seule la ligne web",
    r.length === 1 && r[0].includes("Rechercher « recette tarte » sur le web"),
    r.join(" | "),
  );
  await p.touche("Enter", { vk: 13, texte: "\r" });
  await attendre(2500);
  const apresWeb = await p.eval("location.href").catch(() => "");
  verifier(
    "Entrée : recherche avec le moteur par défaut",
    /recette/.test(decodeURIComponent(apresWeb)) && !apresWeb.startsWith("chrome-extension"),
    apresWeb.slice(0, 80),
  );
}
