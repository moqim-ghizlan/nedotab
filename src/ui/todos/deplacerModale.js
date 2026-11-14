import { boiteDeBase, limiterDecalage } from "../../core/positionFenetre.js";

/**
 * Makes a `<dialog>` movable with the mouse by its header, never out of the visible frame (lot B).
 * The browser keeps laying the window out (centred); only the CSS `translate` property is changed,
 * so the position goes back to the centre every time the window is opened. Mouse only: on a phone
 * the window is a sheet.
 * @returns {() => void} removes the listeners
 */
export function rendreDeplacable(dialogue, entete) {
  let decalage = { x: 0, y: 0 };
  let depart = null;

  const cadre = () => ({
    width: document.documentElement.clientWidth || window.innerWidth,
    height: document.documentElement.clientHeight || window.innerHeight,
  });
  const appliquer = (d) => {
    decalage = d;
    dialogue.style.translate = d.x || d.y ? `${d.x}px ${d.y}px` : "";
  };
  const rentrer = () => {
    if (decalage.x === 0 && decalage.y === 0) return;
    appliquer(limiterDecalage(decalage, boiteDeBase(dialogue.getBoundingClientRect(), decalage), cadre()));
  };

  const surAppui = (e) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    if (e.target.closest("button, a, input, select, textarea")) return;
    if (window.matchMedia?.("(max-width: 699px)").matches) return;
    depart = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      decalage: { ...decalage },
      base: boiteDeBase(dialogue.getBoundingClientRect(), decalage),
    };
    entete.setPointerCapture?.(e.pointerId);
    entete.classList.add("modale-todo-entete--saisie");
    e.preventDefault();
  };
  const surMouvement = (e) => {
    if (!depart || e.pointerId !== depart.id) return;
    appliquer(
      limiterDecalage(
        { x: depart.decalage.x + e.clientX - depart.x, y: depart.decalage.y + e.clientY - depart.y },
        depart.base,
        cadre(),
      ),
    );
  };
  const surRelache = (e) => {
    if (!depart || e.pointerId !== depart.id) return;
    entete.releasePointerCapture?.(e.pointerId);
    entete.classList.remove("modale-todo-entete--saisie");
    depart = null;
  };

  entete.addEventListener("pointerdown", surAppui);
  entete.addEventListener("pointermove", surMouvement);
  entete.addEventListener("pointerup", surRelache);
  entete.addEventListener("pointercancel", surRelache);
  window.addEventListener("resize", rentrer);
  return () => {
    window.removeEventListener("resize", rentrer);
    entete.removeEventListener("pointerdown", surAppui);
    entete.removeEventListener("pointermove", surMouvement);
    entete.removeEventListener("pointerup", surRelache);
    entete.removeEventListener("pointercancel", surRelache);
  };
}
