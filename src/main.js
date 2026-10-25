import "./ui/styles/tokens.css";
import "./ui/styles/base.css";
import "./ui/styles/grille.css";
import "./ui/styles/dialogues.css";
import "./ui/styles/menus.css";
import "./ui/styles/dossiers.css";
import "./ui/styles/reglages.css";
import { appliquerCacheDemarrage } from "./ui/apparence.js";
import { demarrerApp } from "./ui/app.js";
import { plateforme } from "./platform/index.js";

performance.mark("nedotab:debut");
// Theme and background colour from the startup cache, before anything is drawn.
appliquerCacheDemarrage();
// Extension: a new tab page may be replaced by a copy that gets the cursor (V2.10.7).
plateforme.prendreLeCurseur().then((remplacee) => {
  if (!remplacee) demarrerApp(document.getElementById("app"));
});
