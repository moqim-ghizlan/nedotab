/**
 * Position of a draggable window kept inside its frame (pure, no DOM).
 * The window is laid out by the browser (centred); the user only adds an offset `{x, y}`.
 */

const nombre = (n) => (Number.isFinite(n) ? n : 0);

/**
 * The offset limited so the whole window stays visible.
 * @param {{x:number,y:number}} decalage wanted offset from the laid-out position
 * @param {{left:number,top:number,width:number,height:number}} base the window's box at offset 0
 * @param {{width:number,height:number}} cadre the visible frame
 */
export function limiterDecalage(decalage, base, cadre) {
  const borne = (valeur, min, max) => (min > max ? min : Math.min(max, Math.max(min, valeur)));
  return {
    x: borne(nombre(decalage?.x), -base.left, cadre.width - base.left - base.width),
    y: borne(nombre(decalage?.y), -base.top, cadre.height - base.top - base.height),
  };
}

/** The box the window would have at offset 0, from its current box and offset. */
export const boiteDeBase = (boite, decalage) => ({
  left: boite.left - nombre(decalage?.x),
  top: boite.top - nombre(decalage?.y),
  width: boite.width,
  height: boite.height,
});
