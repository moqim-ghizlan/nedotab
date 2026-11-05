/**
 * Pure helpers of the Markdown editor (V6.3). The rendering itself (marked + DOMPurify, which needs
 * a DOM) is in src/ui/todos/rendreMarkdown.js.
 */

/**
 * The four buttons of the editor, as a pure function of the text and the selection.
 * @param {string} valeur whole text
 * @param {number} debut start of the selection
 * @param {number} fin end of the selection
 * @param {"gras"|"italique"|"liste"|"case"} outil
 * @returns {{ valeur: string, debut: number, fin: number }}
 */
export function outilMarkdown(valeur, debut, fin, outil) {
  const avant = valeur.slice(0, debut);
  const selection = valeur.slice(debut, fin);
  const apres = valeur.slice(fin);
  if (outil === "gras" || outil === "italique") {
    const m = outil === "gras" ? "**" : "*";
    // Already wrapped: take the marks off.
    if (avant.endsWith(m) && apres.startsWith(m) && selection) {
      return {
        valeur: avant.slice(0, -m.length) + selection + apres.slice(m.length),
        debut: debut - m.length,
        fin: fin - m.length,
      };
    }
    return {
      valeur: avant + m + selection + m + apres,
      debut: debut + m.length,
      fin: fin + m.length,
    };
  }
  // A list: the prefix goes at the start of every line touched by the selection.
  const prefixe = outil === "case" ? "- [ ] " : "- ";
  const debutLigne = avant.lastIndexOf("\n") + 1;
  const bloc = valeur.slice(debutLigne, fin);
  const lignes = bloc.split("\n");
  const nouvelles = lignes.map((l) => (l.startsWith(prefixe) ? l.slice(prefixe.length) : prefixe + l));
  const retire = lignes.every((l) => l.startsWith(prefixe));
  const decalage = (retire ? -1 : 1) * prefixe.length;
  return {
    valeur: valeur.slice(0, debutLigne) + nouvelles.join("\n") + apres,
    debut: Math.max(debutLigne, debut + decalage),
    fin: fin + decalage * lignes.length,
  };
}
