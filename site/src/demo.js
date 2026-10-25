// Home page demo: a miniature NedoTab grid whose folders really open, down to the third
// level. It replaces the static screenshot only when the script runs.

const site = (titre, couleur, lettre = titre[0]) => ({ type: "site", titre, couleur, lettre });
const dossier = (titre, items) => ({ type: "dossier", titre, items });

const GRILLE = [
  site("Courriel", "#517cc2"),
  site("Agenda", "#2f4f86"),
  site("Météo", "#7f9bd0"),
  dossier("Travail", [
    site("Documents", "#517cc2"),
    site("Tableur", "#2f4f86"),
    dossier("Clients", [
      site("Dupont & fils", "#cf76b8", "D"),
      site("L'Atelier", "#a85a9a", "L"),
      dossier("Projets", [
        site("Refonte 2026", "#cf76b8", "R"),
        site("Maquettes", "#d493d9"),
        site("Rapport", "#8a4f86"),
      ]),
      site("Factures", "#d493d9"),
    ]),
    site("Visio", "#6b8fcf"),
    site("Équipe", "#04080c", "É"),
  ]),
  site("Journal", "#cf76b8"),
  site("Vidéos", "#04080c"),
  site("Radio", "#d493d9"),
  dossier("Loisirs", [
    site("Séries", "#a85a9a"),
    site("Cinéma", "#cf76b8"),
    site("Lectures", "#517cc2"),
    site("Jeux", "#2f4f86"),
  ]),
  site("Banque", "#2f4f86"),
  site("Encyclopédie", "#a85a9a"),
  site("Photos", "#6b8fcf"),
];

/** First four sites found depth-first: the preview of a folder tile. */
function apercu(items, trouves = []) {
  for (const el of items) {
    if (trouves.length === 4) break;
    if (el.type === "site") trouves.push(el);
    else apercu(el.items, trouves);
  }
  return trouves;
}

/** Ink letters on light tiles, white letters on dark ones. */
function teinter(el, couleur) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(couleur.slice(i, i + 2), 16));
  el.style.setProperty("--c", couleur);
  el.style.color = 0.299 * r + 0.587 * g + 0.114 * b > 165 ? "#04080c" : "#ffffff";
}

const creer = (balise, classe, texte) => {
  const el = document.createElement(balise);
  if (classe) el.className = classe;
  if (texte !== undefined) el.textContent = texte;
  return el;
};

function tuile(el, ouvrir) {
  const li = creer("li", "d-tuile");
  const corps = el.type === "dossier" ? creer("button", "d-case") : creer("span", "d-case");
  const icone = creer("span", el.type === "dossier" ? "d-icone d-icone--dossier" : "d-icone");
  if (el.type === "site") {
    icone.textContent = el.lettre;
    teinter(icone, el.couleur);
  } else {
    for (const s of apercu(el.items)) {
      const mini = creer("span", "d-mini", s.lettre);
      teinter(mini, s.couleur);
      icone.append(mini);
    }
    corps.type = "button";
    corps.setAttribute("aria-label", `Ouvrir le dossier ${el.titre}`);
    corps.addEventListener("click", () => ouvrir(el));
  }
  icone.setAttribute("aria-hidden", "true");
  corps.append(icone, creer("span", "d-nom", el.titre));
  li.append(corps);
  return li;
}

export function monterDemo(hote) {
  const fenetre = creer("div", "d-fenetre");
  fenetre.setAttribute("role", "region");
  fenetre.setAttribute("aria-label", "Démonstration : une page NedoTab, ses dossiers s'ouvrent");
  const barre = creer("div", "d-barre");
  barre.setAttribute("aria-hidden", "true");
  barre.append(creer("span", "d-onglet", "Nouvel onglet"));
  const page = creer("div", "d-page");
  const recherche = creer("div", "d-recherche", "Rechercher dans vos sites");
  recherche.setAttribute("aria-hidden", "true");
  recherche.append(creer("kbd", "", "/"));
  const grille = creer("ul", "d-grille");
  const voile = creer("div", "d-voile");
  const panneau = creer("div", "d-panneau");
  panneau.setAttribute("role", "dialog");
  panneau.setAttribute("aria-modal", "false");
  page.append(recherche, grille, voile, panneau);
  fenetre.append(barre, page);

  const legende = creer("p", "d-legende");
  hote.replaceChildren(fenetre, legende);

  let chemin = []; // open folders, from level 1 to 3

  function afficher(focaliser) {
    const profondeur = chemin.length;
    page.dataset.profondeur = profondeur;
    grille.inert = profondeur > 0;
    legende.textContent =
      profondeur === 0
        ? "Ouvrez le dossier Travail : il en contient un autre, qui en contient un autre."
        : profondeur === 3
          ? "Troisième niveau, le plus profond. Le fil d'Ariane ramène où vous voulez."
          : "Cliquez sur un élément du fil d'Ariane pour remonter.";
    if (!profondeur) {
      panneau.hidden = true;
      return;
    }
    const courant = chemin[profondeur - 1];
    const ariane = creer("ol", "d-ariane");
    ariane.setAttribute("aria-label", "Fil d'Ariane");
    ["Accueil", ...chemin.map((d) => d.titre)].forEach((nom, i) => {
      const li = creer("li", `n${i}`);
      if (i === profondeur) {
        li.append(creer("span", "", nom));
        li.lastChild.setAttribute("aria-current", "location");
      } else {
        const b = creer("button", "", nom);
        b.type = "button";
        b.addEventListener("click", () => aller(chemin.slice(0, i)));
        li.append(b);
      }
      ariane.append(li);
    });
    const fermer = creer("button", "d-fermer");
    fermer.type = "button";
    fermer.setAttribute("aria-label", "Fermer le dossier");
    fermer.textContent = "×";
    fermer.addEventListener("click", () => aller([]));
    const titre = creer("p", "d-titre", courant.titre);
    titre.id = "d-titre";
    panneau.setAttribute("aria-labelledby", "d-titre");
    const contenu = creer("ul", "d-grille d-grille--dossier");
    for (const el of courant.items) contenu.append(tuile(el, (d) => aller([...chemin, d])));
    const tete = creer("div", "d-tete");
    tete.append(ariane, fermer);
    panneau.replaceChildren(tete, titre, contenu);
    panneau.dataset.niveau = profondeur;
    panneau.hidden = false;
    // Restart the opening animation on every level change.
    panneau.classList.remove("d-panneau--entre");
    void panneau.offsetWidth;
    panneau.classList.add("d-panneau--entre");
    if (focaliser) (contenu.querySelector("button") ?? fermer).focus({ preventScroll: true });
  }

  function aller(nouveau, focaliser = true) {
    const ferme = chemin.length && !nouveau.length;
    chemin = nouveau;
    afficher(focaliser);
    if (ferme && focaliser) grille.querySelector("button")?.focus({ preventScroll: true });
  }

  for (const el of GRILLE) grille.append(tuile(el, (d) => aller([d])));
  page.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && chemin.length) aller(chemin.slice(0, -1));
  });
  afficher(false);

  // One guided walk-through, down to the third level, the first time the demo is seen.
  // Any interaction stops it; skipped when the visitor prefers reduced motion.
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const minuteries = [];
  const arreter = () => minuteries.splice(0).forEach(clearTimeout);
  for (const evt of ["pointerdown", "keydown", "wheel"])
    fenetre.addEventListener(evt, arreter, { once: true, capture: true });
  const travail = GRILLE[3];
  const clients = travail.items[2];
  const projets = clients.items[2];
  const etapes = [[travail], [travail, clients], [travail, clients, projets]];
  const obs = new IntersectionObserver(
    ([entree]) => {
      if (!entree.isIntersecting) return;
      obs.disconnect();
      etapes.forEach((c, i) => minuteries.push(setTimeout(() => aller(c, false), 1400 + i * 1700)));
    },
    { threshold: 0.6 },
  );
  obs.observe(fenetre);
}
