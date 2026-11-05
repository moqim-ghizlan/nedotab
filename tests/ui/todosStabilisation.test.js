import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { creerPanneauTodos } from "../../src/ui/todos/panneauTodos.js";

afterEach(() => {
  document.body.replaceChildren();
  try {
    localStorage.clear();
  } catch {
    /* none */
  }
});
beforeEach(() => {
  try {
    localStorage.clear();
  } catch {
    /* none */
  }
});

const vraiSetTimeout = globalThis.setTimeout;
const attendre = () => new Promise((r) => vraiSetTimeout(r, 0));
const sujet = (id, extra = {}) => ({ id, nom: `Sujet ${id}`, ordre: 1000, couleur: null, creeLe: 1, nbRestants: 0, nbTotal: 0, enAttente: false, ...extra });
const todo = (i, extra = {}) => ({
  id: `t${i}`,
  v: 1,
  sujetId: "s1",
  titre: `Todo numéro ${i}`,
  description: "",
  echeance: i % 3 === 0 ? "2026-12-01" : null,
  fait: i % 7 === 0,
  faitLe: null,
  creeLe: i,
  modifieLe: i,
  ordre: i * 1000,
  images: [],
  enAttente: false,
  ...extra,
});

async function monter({ todos = [], options = {} } = {}) {
  let rappelTodos = null;
  const fb = {
    ecouterSujets: (_u, rappel) => {
      queueMicrotask(() => rappel([sujet("s1"), sujet("s2")], { depuisCache: false, enAttente: false }));
      return () => {};
    },
    ecouterCompteursTodos: (_u, rappel) => {
      queueMicrotask(() => rappel({ nbSujets: 2, nbTodos: todos.length, octets: 0 }));
      return () => {};
    },
    ecouterTodos: (_u, _s, rappel) => {
      rappelTodos = rappel;
      queueMicrotask(() => rappel(todos, { depuisCache: false, enAttente: false, plein: false }));
      return () => {};
    },
    compterEnRetardTodos: async () => 0,
    majTodo: vi.fn(async () => {}),
  };
  const p = creerPanneauTodos({ disponible: () => true, charger: async () => fb, uid: () => "u1", ...options });
  document.body.append(p.bouton, p.panneau);
  p.ouvrir();
  await attendre();
  await attendre();
  return { p, fb, pousser: (t) => rappelTodos(t, { depuisCache: false, enAttente: false, plein: false }) };
}

describe("performance : 500 todos", () => {
  it("ouvre un sujet de 500 todos et réagit à un instantané sans recréer les lignes", async () => {
    const todos = Array.from({ length: 500 }, (_, i) => todo(i + 1));
    const { p, pousser } = await monter({ todos });
    const debut = performance.now();
    p.ouvrirSujet("s1");
    await attendre();
    const ouverture = performance.now() - debut;
    expect(p.panneau.querySelectorAll(".todo-ligne").length).toBe(500 - Math.floor(500 / 7) + Math.floor(500 / 7) - 0);
    const premiere = p.panneau.querySelector(".todos-liste:not(.todos-liste--faits) .todo-ligne");
    const t1 = performance.now();
    pousser(todos.map((t) => (t.id === "t2" ? { ...t, titre: "modifié" } : t)));
    const instantane = performance.now() - t1;
    expect(p.panneau.querySelector(".todos-liste:not(.todos-liste--faits) .todo-ligne")).toBe(premiere);
    // Generous bounds for a test runner (the real measure, in Chrome, is in the checklist).
    expect(ouverture).toBeLessThan(3000);
    expect(instantane).toBeLessThan(1000);
  });
});

describe("accessibilité", () => {
  it("chaque bouton, champ et case du panneau a un nom accessible", async () => {
    const { p } = await monter({ todos: [todo(1), todo(2, { fait: true })] });
    const nomDe = (n) =>
      n.getAttribute("aria-label") ||
      n.getAttribute("title") ||
      n.textContent.trim() ||
      n.getAttribute("placeholder") ||
      (n.id && document.querySelector(`label[for="${n.id}"]`)?.textContent) ||
      "";
    const verifier = () => {
      for (const n of p.panneau.querySelectorAll("button, input:not([type=file]), select, textarea")) {
        if (n.closest("[hidden]")) continue;
        expect(nomDe(n), n.outerHTML.slice(0, 120)).not.toBe("");
      }
    };
    verifier(); // the subjects
    p.ouvrirSujet("s1");
    await attendre();
    verifier(); // the todos
  });

  it("onglets : rôle tablist / tab, un seul arrêt de tabulation, flèches pour changer", async () => {
    const { p } = await monter();
    const liste = p.panneau.querySelector('[role="tablist"]');
    const [a, b] = liste.querySelectorAll('[role="tab"]');
    expect(a.getAttribute("aria-selected")).toBe("true");
    expect(b.tabIndex).toBe(-1);
    a.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }));
    expect(b.getAttribute("aria-selected")).toBe("true");
    expect(a.getAttribute("aria-selected")).toBe("false");
  });

  it("zones annoncées : statut, messages et enregistrement en aria-live", async () => {
    const { p } = await monter();
    expect(p.panneau.querySelector(".todos-etat").getAttribute("aria-live")).toBe("polite");
    p.ouvrirSujet("s1");
    await attendre();
    expect(p.panneau.querySelector(".todos-message").getAttribute("aria-live")).toBe("polite");
  });

  it("la case d'un todo est une vraie case (role checkbox + aria-checked) de 44 px", async () => {
    const { p } = await monter({ todos: [todo(1)] });
    p.ouvrirSujet("s1");
    await attendre();
    const c = p.panneau.querySelector(".todo-case");
    expect(c.getAttribute("role")).toBe("checkbox");
    expect(c.getAttribute("aria-checked")).toBe("false");
    const css = readFileSync("src/ui/styles/todos.css", "utf8");
    expect(css).toMatch(/\.todo-case \{[^}]*width: 44px;[^}]*height: 44px;/s);
  });

  it("la feuille de style gère le focus visible, le mouvement réduit et le contraste forcé", () => {
    const css = readFileSync("src/ui/styles/todos.css", "utf8");
    for (const classe of [".todo-case", ".todo-corps", ".todos-bouton", ".todos-sujet-corps", ".todo-vignette", ".todos-onglet"])
      expect(css, classe).toContain(`${classe}:focus-visible`);
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain("forced-colors: active");
    // 16 px: no automatic zoom of iOS on the fields.
    expect(css).toMatch(/\.todos-champ \{[^}]*font-size: 1rem;/s);
  });
});

describe("mémoire locale de l'appareil (V6.8)", () => {
  it("rouvre le dernier sujet et garde le dernier filtre / tri, seulement si demandé", async () => {
    const todos = [todo(1)];
    const a = await monter({ todos, options: { memoriser: true } });
    a.p.ouvrirSujet("s1");
    await attendre();
    a.p.panneau.querySelectorAll(".todos-menu-bouton")[0].click();
    [...document.querySelectorAll(".menu-entree")].find((b) => b.textContent === "En retard").click();
    document.body.replaceChildren();

    const b = await monter({ todos, options: { memoriser: true } });
    await attendre();
    expect(b.p.sujetOuvert()).toBe("s1");
    expect(b.p.panneau.querySelectorAll(".todos-menu-bouton")[0].textContent).toContain("En retard");
    document.body.replaceChildren();

    const c = await monter({ todos });
    await attendre();
    expect(c.p.sujetOuvert()).toBeNull();
  });
  it("ne mémorise ni titre ni texte : des identifiants et des choix de menu", async () => {
    const a = await monter({ todos: [todo(1)], options: { memoriser: true } });
    a.p.ouvrirSujet("s1");
    await attendre();
    const valeurs = Object.keys(localStorage).filter((k) => k.startsWith("nedotab:todos:")).map((k) => localStorage.getItem(k));
    expect(valeurs.join(" ")).not.toContain("Todo numéro");
  });
  it("un sujet disparu n'est pas rouvert", async () => {
    localStorage.setItem("nedotab:todos:dernierSujet", "fantome");
    const a = await monter({ options: { memoriser: true } });
    await attendre();
    expect(a.p.sujetOuvert()).toBeNull();
  });
});

describe("revue de sécurité (V6.8, problème 4)", () => {
  const lister = (d) =>
    readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? lister(join(d, e.name)) : [join(d, e.name)]));
  const lire = (f) => readFileSync(f, "utf8");

  it("aucun innerHTML / outerHTML / insertAdjacentHTML / document.write dans src/ui/todos", () => {
    for (const f of lister("src/ui/todos")) expect(lire(f), f).not.toMatch(/\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML|document\.write/);
  });
  it("le seul rendu de Markdown passe par rendreMarkdown (marked + DOMPurify)", () => {
    const utilisent = lister("src/ui/todos").filter((f) => /from "marked"/.test(lire(f)));
    expect(utilisent.map((f) => f.replace(/\\/g, "/"))).toEqual(["src/ui/todos/rendreMarkdown.js"]);
    expect(lire("src/ui/todos/rendreMarkdown.js")).toContain("DOMPurify");
  });
  it("aucun getDownloadURL, aucune adresse de fichier dans la base", () => {
    for (const f of [...lister("src"), ...lister("functions/src")]) expect(lire(f), f).not.toMatch(/getDownloadURL/);
  });
  it("le journal et les fonctions ne reçoivent aucun contenu de todo", () => {
    expect(lire("src/core/journal.js")).not.toMatch(/todos?\b.*(titre|description|note)/i);
    for (const f of lister("functions/src").filter((x) => x.endsWith(".js") && /todos/.test(x))) {
      const source = lire(f);
      expect(source, f).not.toMatch(/logger\.(info|warn|error)\([^)]*(titre|description|note)/);
    }
    expect(lire("functions/index.js")).toContain('logger.info("todos réconciliés", r)');
  });
  it("aucun todo dans l'IA, le chat ni la recherche intelligente", () => {
    const fichiers = [
      ...lister("src/ui/chat"),
      ...lister("src/core").filter((f) => /(^|[\\/])(ia|chat|listeCompacte|preFiltre|routageQuestion|rechercheIa|propositions|confidentialiteIa|messagesIa)/i.test(f)),
      ...lister("functions/src/ia"),
      "src/firebase/ia.js",
      "src/firebase/iaFlux.js",
    ];
    for (const f of fichiers)
      expect(lire(f), f).not.toMatch(/\/todos\.js|\/sujets\.js|firebase\/todos|ecouterTodos|ecouterSujets/);
  });
  it("aucune permission ajoutée au manifest depuis la V6.0", () => {
    const manifeste = JSON.parse(lire("extension/manifest.json"));
    expect(manifeste.permissions).toEqual([
      "storage", "favicon", "search", "identity", "activeTab", "sidePanel", "proxy", "webRequest", "webRequestAuthProvider", "privacy",
    ]);
    expect(manifeste.optional_host_permissions).toEqual(["https://*/*", "http://*/*"]);
    expect(manifeste.permissions).not.toContain("alarms");
    expect(manifeste.permissions).not.toContain("notifications");
    expect(manifeste.permissions).not.toContain("downloads");
  });
  it("aucune dépendance ajoutée : seulement celles que le projet autorise", () => {
    const pkg = JSON.parse(lire("package.json"));
    expect(Object.keys(pkg.dependencies).sort()).toEqual(["dompurify", "firebase", "marked", "qrcode", "sortablejs"]);
  });
  it("aucun script distant dans les fichiers todos", () => {
    for (const f of lister("src/ui/todos")) expect(lire(f), f).not.toMatch(/https?:\/\/[^\s"']*\.js\b/);
  });
});
