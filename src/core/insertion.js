/**
 * Where an element dropped at (x, y) goes among tiles laid out in reading order (V3.10.1:
 * an icon taken out of a folder onto the home grid). The row closest to the point is taken,
 * then the tile closest in that row: before it on its left half, after it on its right
 * half. Below the last row, the element goes at the end.
 *
 * @param {Array<{ left: number, top: number, right: number, bottom: number, width: number }>} rects
 *        the tiles' rectangles, in order
 * @returns {number} insertion index, from 0 to rects.length
 */
export function indexInsertion(rects, x, y) {
  if (!rects.length) return 0;
  if (y > Math.max(...rects.map((r) => r.bottom))) return rects.length;
  const ecartY = (r) => Math.max(r.top - y, 0, y - r.bottom);
  const ecartX = (r) => Math.max(r.left - x, 0, x - r.right);
  const rangee = Math.min(...rects.map(ecartY));
  let meilleur = -1;
  rects.forEach((r, i) => {
    if (ecartY(r) !== rangee) return;
    if (meilleur < 0 || ecartX(r) < ecartX(rects[meilleur])) meilleur = i;
  });
  const r = rects[meilleur];
  return meilleur + (x > r.left + r.width / 2 ? 1 : 0);
}
