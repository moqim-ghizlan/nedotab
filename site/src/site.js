import "./site.css";
import { monterDemo } from "./demo.js";

// "Copier" buttons: chrome:// addresses cannot be opened from a web page.
for (const bouton of document.querySelectorAll("[data-copier]")) {
  bouton.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(bouton.dataset.copier);
      bouton.textContent = "Copié";
    } catch {
      bouton.textContent = "Sélectionnez et copiez l'adresse";
    }
    setTimeout(() => (bouton.textContent = "Copier"), 2500);
  });
}

const hoteDemo = document.querySelector("[data-demo]");
if (hoteDemo) monterDemo(hoteDemo);
