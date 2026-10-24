import { reduire } from "../core/actions.js";
import { NOM_APP } from "../core/constantes.js";
import { exemple } from "../core/exemple.js";
import { etatInitial } from "../core/modele.js";
import { creerStore } from "../core/store.js";
import { plateforme } from "../platform/index.js";
import { activerClavierGrille, rendreGrille } from "./grille.js";

export function demarrerApp(racine) {
  const page = document.createElement("main");
  page.className = "page";
  const grilleEl = document.createElement("ul");
  grilleEl.className = "grille";
  grilleEl.setAttribute("aria-label", "Mes sites");
  page.append(grilleEl);

  const pied = document.createElement("footer");
  pied.className = "pied";
  pied.textContent = `${NOM_APP} ${plateforme.getVersion()}`;
  racine.replaceChildren(page, pied);

  const store = creerStore({ ...etatInitial(), grille: exemple() }, reduire);
  store.abonner((etat) => rendreGrille(grilleEl, etat.grille));
  rendreGrille(grilleEl, store.lire().grille);
  activerClavierGrille(grilleEl);
  return store;
}
