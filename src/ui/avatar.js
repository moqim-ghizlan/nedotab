import { couleurDepuisTexte } from "../core/couleurs.js";
import { el } from "./dom.js";

/** Round avatar: the Google photo, or the initial on a colour when there is none or it fails. */
export function creerAvatar(profil, { taille = 32 } = {}) {
  const initiale = (profil?.nom || profil?.email || "?").trim().charAt(0).toLocaleUpperCase("fr");
  const repli = () =>
    el("span", {
      class: "avatar avatar--initiale",
      style: `width:${taille}px;height:${taille}px;background:${couleurDepuisTexte(profil?.email ?? "")}`,
      "aria-hidden": "true",
      texte: initiale,
    });
  if (!profil?.photo) return repli();
  const img = el("img", {
    class: "avatar",
    src: profil.photo,
    alt: "",
    width: String(taille),
    height: String(taille),
    referrerpolicy: "no-referrer",
  });
  img.addEventListener("error", () => img.replaceWith(repli()), { once: true });
  return img;
}
