import "./recevoir.css";
import { demarrer } from "./reception.js";

demarrer({
  racine: document.getElementById("recevoir"),
  fragment: location.hash,
  // The fragment holds the key: it leaves the address bar (history, shared screenshot).
  effacerFragment: () => history.replaceState(null, "", location.pathname),
  requete: (...a) => fetch(...a),
  copier: (texte) => navigator.clipboard.writeText(texte),
  telecharger: (blob, nom) => {
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href: url, download: nom });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
  ouvrirLien: (adresse) => window.open(adresse, "_blank", "noopener,noreferrer"),
});
