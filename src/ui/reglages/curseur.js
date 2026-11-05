import { el } from "../dom.js";

/** A slider with its value written next to its label. */
export function curseurAvecValeur(libelle, input, format) {
  const valeur = el("output", { class: "reglages-valeur", for: input.id });
  const maj = () => (valeur.textContent = format(Number(input.value)));
  input.addEventListener("input", maj);
  maj();
  const tete =
    typeof libelle === "string" ? el("p", { class: "reglages-libelle", texte: libelle }) : libelle;
  tete.append(valeur);
  return { racine: el("div", { class: "reglages-curseur" }, tete, input), maj };
}
