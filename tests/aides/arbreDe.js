/**
 * Builds a grid from a mini syntax: names are sites, a name followed by [ ... ] is a folder
 * with that content. Example: arbreDe("A[B[C[]] D] E").
 */
export function arbreDe(texte) {
  const jetons = texte.match(/[A-Za-z0-9_]+|\[|\]/g) ?? [];
  let i = 0;
  const lireListe = () => {
    const liste = [];
    while (i < jetons.length && jetons[i] !== "]") {
      const nom = jetons[i++];
      if (jetons[i] === "[") {
        i++;
        const items = lireListe();
        i++; // "]"
        liste.push({ id: nom, type: "dossier", titre: nom, items, creeLe: 0 });
      } else {
        liste.push({
          id: nom,
          type: "site",
          titre: nom,
          url: `https://${nom.toLowerCase()}.fr`,
          creeLe: 0,
        });
      }
    }
    return liste;
  };
  return lireListe();
}

/** Back to the mini syntax (handy in assertions). */
export function texteDe(grille) {
  return grille
    .map((e) => (e.type === "dossier" ? `${e.id}[${texteDe(e.items)}]` : e.id))
    .join(" ");
}

/** Deep freeze, to prove that a function never mutates its input. */
export function geler(objet) {
  if (objet && typeof objet === "object" && !Object.isFrozen(objet)) {
    Object.freeze(objet);
    Object.values(objet).forEach(geler);
  }
  return objet;
}
