import "./ui/styles/tokens.css";
import "./ui/styles/base.css";
import "./ui/styles/dialogues.css";
import "./ui/styles/menus.css";
import "./ui/styles/selecteurDossier.css";
import "./ui/styles/ajout.css";
import "./ui/styles/popup.css";
import "./ui/styles/composants.css";
import "./ui/styles/ajoutFenetre.css";
import { reduire } from "./core/actions.js";
import { lireOnglet } from "./core/ajoutRapide.js";
import { migrer } from "./core/migration.js";
import { creerStore } from "./core/store.js";
import { plateforme } from "./platform/index.js";
import { appliquerCacheDemarrage } from "./ui/apparence.js";
import { ecranAjout } from "./ui/popup/ecranAjout.js";

/**
 * T4: the "add this site" window, opened by the toolbar popup at 75 % of the screen, centred.
 * The page to add comes in the address (u = address, t = title): the window is its own tab,
 * so the active tab is no longer the page. Closing it (Escape, Annuler, after adding) closes
 * the window.
 */
async function demarrer() {
  appliquerCacheDemarrage();
  const racine = document.getElementById("ajout");
  const params = new URLSearchParams(location.search);
  const onglet = lireOnglet({ url: params.get("u"), titre: params.get("t") });
  const stockage = plateforme.stockage();
  let brut = null;
  let erreurLecture = false;
  try {
    brut = (await stockage.lire()).etat;
  } catch {
    erreurLecture = true;
  }
  const { etat, lectureSeule } = migrer(brut);
  const store = creerStore(etat, reduire, { geler: false });
  const chromeApi = globalThis.chrome;
  const ouvrirNedoTab = () => {
    chromeApi.tabs.create({ url: chromeApi.runtime.getURL("newtab.html") });
    window.close();
  };
  if (!onglet.ok) {
    racine.append(Object.assign(document.createElement("p"), { textContent: onglet.raison }));
    return;
  }
  await ecranAjout({
    racine,
    store,
    stockage,
    onglet,
    retour: () => window.close(),
    peutEcrire: !erreurLecture && !lectureSeule,
    ouvrirNedoTab,
    disposition: "fenetre",
  });
}

demarrer();
