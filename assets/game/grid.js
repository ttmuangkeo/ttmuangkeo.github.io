// Pure helpers for the room: scaling, the walk grid, and pathfinding.

// A walk grid over the room. Rows above floorTopRow are wall; blocked cells are furniture.
export function buildGrid(cols, rows, blocked = [], floorTopRow = 0) {
  const solid = new Set(blocked.map(([c, r]) => `${c},${r}`));
  return {
    cols, rows,
    walkable(col, row) {
      return col >= 0 && col < cols && row >= floorTopRow && row < rows && !solid.has(`${col},${row}`);
    },
  };
}

// Breadth-first search with 4-neighbours. Returns the cells to step through,
// excluding `from` and including `to`; [] if unreachable or already there.
export function findPath(grid, from, to) {
  if (from.col === to.col && from.row === to.row) return [];
  if (!grid.walkable(to.col, to.row)) return [];
  const key = (c, r) => `${c},${r}`;
  const prev = new Map([[key(from.col, from.row), null]]);
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift();
    if (cur.col === to.col && cur.row === to.row) break;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = { col: cur.col + dc, row: cur.row + dr };
      const k = key(n.col, n.row);
      if (!prev.has(k) && grid.walkable(n.col, n.row)) { prev.set(k, cur); queue.push(n); }
    }
  }
  if (!prev.has(key(to.col, to.row))) return [];
  const path = [];
  for (let c = to; c && !(c.col === from.col && c.row === from.row); c = prev.get(key(c.col, c.row))) path.push({ col: c.col, row: c.row });
  return path.reverse();
}

// Base speed for short walks; long walks speed up so no walk takes more than 1.2 s.
export const BASE_SPEED = 48;     // native px per second
export const MAX_WALK_S = 1.2;
export function walkSpeed(pathLength) { return Math.max(BASE_SPEED, pathLength / MAX_WALK_S); }

// Each walk gets an id; a walk loop stops as soon as a newer id exists (re-targeting).
export function nextWalkId(current) { return current + 1; }

export const NATIVE_W = 160;
export const NATIVE_H = 100;

// Desktop: the largest whole-number scale that fits under the HUD (crisp pixels).
// Phones: fill the width, accepting slightly uneven pixels.
export function fitScale(vw, vh, hudH, isPhone) {
  if (isPhone) return vw / NATIVE_W;
  return Math.max(1, Math.floor(Math.min(vw / NATIVE_W, (vh - hudH) / NATIVE_H)));
}
