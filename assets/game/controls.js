// Pure helpers for keyboard play: which keys move Tim, where a step lands,
// what he can reach from where he stands, and secret key sequences.

export const KEY_DIRS = {
  ArrowUp: 'up', w: 'up', W: 'up',
  ArrowDown: 'down', s: 'down', S: 'down',
  ArrowLeft: 'left', a: 'left', A: 'left',
  ArrowRight: 'right', d: 'right', D: 'right',
};

const STEP = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

// The on-screen D-pad (phones): a thumb at (dx, dy) px from the pad's centre points one way,
// whichever axis it leans on more; inside the dead zone it points nowhere.
export function padDir(dx, dy, dead = 6) {
  if (Math.hypot(dx, dy) < dead) return null;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}

// The key each pad direction stands for, so the D-pad and A/B can enter the Konami code too.
export const PAD_KEYS = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };

export function nextCell({ col, row }, dir) {
  const [dc, dr] = STEP[dir];
  return { col: col + dc, row: row + dr };
}

// The object whose use spot is within `reach` steps of the cell (closest first,
// then in OBJECTS order), or null when nothing is close enough.
export function objectInReach(cell, objects, reach = 1) {
  let best = null;
  let bestDist = Infinity;
  for (const o of objects) {
    const d = Math.abs(o.useSpot.col - cell.col) + Math.abs(o.useSpot.row - cell.row);
    if (d <= reach && d < bestDist) { best = o; bestDist = d; }
  }
  return best;
}

export const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];

// Returns a function fed one key at a time; it returns true when the sequence completes.
// Letter keys match either case.
export function createSequence(seq) {
  let i = 0;
  return (key) => {
    const k = key.length === 1 ? key.toLowerCase() : key;
    if (k === seq[i]) {
      i++;
      if (i === seq.length) { i = 0; return true; }
      return false;
    }
    i = k === seq[0] ? 1 : 0;
    return false;
  };
}
