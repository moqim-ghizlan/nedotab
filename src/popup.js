import "./ui/styles/tokens.css";
import "./ui/styles/base.css";
import "./ui/styles/dialogues.css";
import "./ui/styles/menus.css";
import "./ui/styles/selecteurDossier.css";
import "./ui/styles/ajout.css";
import "./ui/styles/popup.css";
import { appliquerCacheDemarrage } from "./ui/apparence.js";
import { demarrerPopup } from "./ui/popup/popup.js";

appliquerCacheDemarrage();
demarrerPopup(document.getElementById("popup"));
