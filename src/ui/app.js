import { NOM_APP } from "../core/constantes.js";
import { plateforme } from "../platform/index.js";

export function demarrerApp(racine) {
  const titre = document.createElement("h1");
  titre.className = "marque";
  titre.textContent = NOM_APP;
  const version = document.createElement("p");
  version.className = "version";
  version.textContent = plateforme.getVersion();
  racine.replaceChildren(titre, version);
}
