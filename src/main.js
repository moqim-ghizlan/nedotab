import "./ui/styles/tokens.css";
import "./ui/styles/base.css";
import "./ui/styles/grille.css";
import "./ui/styles/dialogues.css";
import "./ui/styles/menus.css";
import "./ui/styles/dossiers.css";
import "./ui/styles/reglages.css";
import { appliquerCacheDemarrage } from "./ui/apparence.js";
import { demarrerApp } from "./ui/app.js";

performance.mark("nedotab:debut");
// Theme and background colour from the startup cache, before anything is drawn.
appliquerCacheDemarrage();
demarrerApp(document.getElementById("app"));
