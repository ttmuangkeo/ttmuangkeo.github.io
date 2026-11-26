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

const ORTHO = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

// Dijkstra over 8 neighbours (diagonals cost √2, never cutting a blocked corner).
// Orthogonal steps are tried first, so equal-cost ties stay straight.
function findPath8(grid, from, to) {
  const key = (c, r) => `${c},${r}`;
  const dist = new Map([[key(from.col, from.row), 0]]);
  const prev = new Map([[key(from.col, from.row), null]]);
  const open = [{ ...from, d: 0 }];
  const done = new Set();
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].d < open[bi].d - 1e-9) bi = i;
    const cur = open.splice(bi, 1)[0];
    const ck = key(cur.col, cur.row);
    if (done.has(ck)) continue;
    done.add(ck);
    if (cur.col === to.col && cur.row === to.row) break;
    for (const [dc, dr] of [...ORTHO, ...DIAG]) {
      const n = { col: cur.col + dc, row: cur.row + dr };
      if (!grid.walkable(n.col, n.row)) continue;
      const diagonal = dc !== 0 && dr !== 0;
      if (diagonal && !(grid.walkable(cur.col + dc, cur.row) && grid.walkable(cur.col, cur.row + dr))) continue;
      const nd = cur.d + (diagonal ? Math.SQRT2 : 1);
      const nk = key(n.col, n.row);
      if (nd < (dist.get(nk) ?? Infinity) - 1e-9) { dist.set(nk, nd); prev.set(nk, cur); open.push({ ...n, d: nd }); }
    }
  }
  if (!prev.has(key(to.col, to.row))) return [];
  const path = [];
  for (let c = to; c && !(c.col === from.col && c.row === from.row); c = prev.get(key(c.col, c.row))) path.push({ col: c.col, row: c.row });
  return path.reverse();
}

// Breadth-first search with 4-neighbours (or Dijkstra with 8 when `diagonal`). Returns the
// cells to step through, excluding `from` and including `to`; [] if unreachable or already there.
export function findPath(grid, from, to, { diagonal = false } = {}) {
  if (from.col === to.col && from.row === to.row) return [];
  if (!grid.walkable(to.col, to.row)) return [];
  if (diagonal) return findPath8(grid, from, to);
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
export const BASE_SPEED = 48;     // world units (sprite pixels) per second
export const MAX_WALK_S = 1.2;
export function walkSpeed(pathLength) { return Math.max(BASE_SPEED, pathLength / MAX_WALK_S); }

// Each walk gets an id; a walk loop stops as soon as a newer id exists (re-targeting).
export function nextWalkId(current) { return current + 1; }
