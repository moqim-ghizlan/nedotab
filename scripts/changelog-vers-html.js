// Turns CHANGELOG.md into the version list of the "Mise à jour" page.
// Only the "Ajouté" / "Corrigé" / "Modifié" sections are kept (tests and notes are for us).

const echapper = (t) =>
  t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** Inline Markdown subset: `code` and **bold**, on already escaped text. */
function enLigne(texte) {
  return echapper(texte)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

const SECTIONS_PUBLIQUES = ["Ajouté", "Corrigé", "Modifié"];

/** @returns {{ version: string, date: string, sections: { titre: string, points: string[] }[] }[]} */
export function lireChangelog(markdown) {
  const versions = [];
  let version = null;
  let section = null;
  let point = null;
  for (const ligne of markdown.split(/\r?\n/)) {
    const v = ligne.match(/^## \[([^\]]+)\] - (\d{4})-(\d{2})-(\d{2})/);
    if (v) {
      version = { version: v[1], date: `${v[4]}/${v[3]}/${v[2]}`, sections: [] };
      versions.push(version);
      section = point = null;
      continue;
    }
    const s = ligne.match(/^### (.+)/);
    if (s && version) {
      section = { titre: s[1].trim(), points: [] };
      version.sections.push(section);
      point = null;
      continue;
    }
    if (!section) continue;
    if (/^- /.test(ligne)) {
      point = ligne.slice(2).trim();
      section.points.push(point);
    } else if (/^\s+\S/.test(ligne) && point !== null && !/^\s+-/.test(ligne)) {
      // continuation of the previous bullet
      section.points[section.points.length - 1] += ` ${ligne.trim()}`;
    } else if (/^\s+- /.test(ligne)) {
      section.points[section.points.length - 1] += ` ${ligne.trim().slice(2)}`;
    }
  }
  return versions;
}

export function changelogVersHtml(markdown) {
  return lireChangelog(markdown)
    .map((v) => {
      const sections = v.sections
        .filter((s) => SECTIONS_PUBLIQUES.includes(s.titre) && s.points.length)
        .map(
          (s) =>
            `<h4>${echapper(s.titre)}</h4><ul>${s.points.map((p) => `<li>${enLigne(p)}</li>`).join("")}</ul>`,
        )
        .join("");
      return `<details class="version"><summary><span class="version-numero">${echapper(v.version)}</span> <span class="version-date">${echapper(v.date)}</span></summary>${sections}</details>`;
    })
    .join("\n");
}
