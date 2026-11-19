// Pure helpers for the room: scaling now; the walk grid and pathfinding arrive with mini Tim.

export const NATIVE_W = 160;
export const NATIVE_H = 100;

// Desktop: the largest whole-number scale that fits under the HUD (crisp pixels).
// Phones: fill the width, accepting slightly uneven pixels.
export function fitScale(vw, vh, hudH, isPhone) {
  if (isPhone) return vw / NATIVE_W;
  return Math.max(1, Math.floor(Math.min(vw / NATIVE_W, (vh - hudH) / NATIVE_H)));
}
