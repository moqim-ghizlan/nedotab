/** V5.4: flag emoji and French name of a country from its ISO 3166-1 alpha-2 code (pure). */

const CODE = /^[A-Za-z]{2}$/;

/** "FR" → 🇫🇷 ; anything that is not two letters → "". */
export function drapeau(code) {
  if (typeof code !== "string" || !CODE.test(code)) return "";
  return [...code.toUpperCase()]
    .map((c) => String.fromCodePoint(0x1f1a5 + c.charCodeAt(0)))
    .join("");
}

/** "FR" → "France" (the code itself when the name is unknown, "" when invalid). */
export function nomPays(code) {
  if (typeof code !== "string" || !CODE.test(code)) return "";
  const c = code.toUpperCase();
  try {
    const nom = new Intl.DisplayNames(["fr"], { type: "region" }).of(c);
    return nom && nom !== c ? nom : c;
  } catch {
    return c;
  }
}
