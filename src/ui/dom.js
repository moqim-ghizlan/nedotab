/** Small helper to build DOM nodes. Text always goes through textContent. */
export function el(tag, attributs = {}, ...enfants) {
  const noeud = document.createElement(tag);
  for (const [cle, valeur] of Object.entries(attributs)) {
    if (valeur == null || valeur === false) continue;
    if (cle === "class") noeud.className = valeur;
    else if (cle === "texte") noeud.textContent = valeur;
    else if (cle.startsWith("on") && typeof valeur === "function")
      noeud.addEventListener(cle.slice(2), valeur);
    else if (cle === "dataset") Object.assign(noeud.dataset, valeur);
    else noeud.setAttribute(cle, valeur === true ? "" : valeur);
  }
  noeud.append(...enfants.flat().filter((e) => e != null && e !== false));
  return noeud;
}
