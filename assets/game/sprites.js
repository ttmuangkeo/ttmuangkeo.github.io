// Original pixel art for the room, authored as pixel maps in code.
// Each frame is an array of strings; each character is a PALETTE key ("." = transparent).
// Bigger pieces are drawn with tiny rect/pixel helpers so they stay readable and easy to edit.

export const PALETTE = {
  '.': null,
  k: '#1a1714', // outline
  K: '#1f2a22', // ink
  w: '#6b5a45', W: '#5d4e3c', // wall planks
  f: '#8a6f4f', F: '#7a6145', // floor boards
  b: '#5a3b22', B: '#4a3020', h: '#7a5534', // desk wood
  r: '#d9622b', R: '#a8441a', o: '#c95a36', // rust / rug
  p: '#eee8da', P: '#d8cdb3', // paper
  g: '#3d4a3a', G: '#2c3629', // green jacket
  s: '#e2b48f', S: '#c9946d', // skin
  H: '#1b1b1b', // hair
  n: '#2a3140', N: '#1f2530', // pants
  t: '#c8a26b', // boots
  c: '#2b2f33', C: '#1d2023', m: '#555b60', l: '#9aa0a4', // charcoal / greys
  e: '#6fd38a', E: '#3fa862', // screen
  u: '#9fc6d6', U: '#e9f2f5', i: '#f4f6f7', v: '#5f6f7a', // sky, cloud, snow, mountain
  y: '#f2d34b', a: '#1f4e8a', x: '#e0483a', // gold, Alaska blue, alert red
  d: '#1b2340', D: '#3a4a78', // night sky, dusk sky
  j: '#f2a65a', J: '#e07a8a', Z: '#cfe0ea', // sunset orange, dawn/dusk pink, dawn haze
  q: '#7fe0b0', Q: '#9b7fd6', z: '#3b4a5c', // aurora green, aurora violet, night mountain
  // ---- daylight office ----
  1: '#e9e5dc', 2: '#dcd7cc', A: '#f3f0ea',   // off-white wall, its shade, its highlight
  3: '#9db3a3', 4: '#8aa291',                 // sage accent wall + slats
  5: '#c9c3b6',                               // trim
  6: '#d2b48a', 7: '#c3a378', 0: '#b99a70',   // oak floor, plank lines, floor shadow
  8: '#2b2f33', 9: '#f4f2ee',                 // matte black hardware, white desk top
  L: '#4f8f5a', M: '#3a6e44',                 // plant, plant shade
  O: '#d97a4a', T: '#b9603a',                 // terracotta sofa + shade
  V: '#e8dcc6', X: '#d9c8a8',                 // cream rug + edge
  Y: '#ffffff',
  '[': '#9fd0ec', ']': '#b8ddf1', '{': '#d4ebf6', // Seattle day sky bands
  '}': '#6fa8c8', '(': '#7d93a6', ')': '#a9bccb', // Elliott Bay, daytime towers, Rainier
  '<': '#151b2b', '>': '#1a2540',               // night towers, night water
};

// ---------- tiny drawing helpers (pure) ----------
function grid(w, h, fill = '.') {
  return Array.from({ length: h }, () => Array(w).fill(fill));
}
function rect(g, x, y, w, h, c) {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (g[j] && i >= 0 && i < g[j].length) g[j][i] = c;
}
function px(g, x, y, c) { if (g[y] && x >= 0 && x < g[y].length) g[y][x] = c; }
function frame(g) { return g.map((row) => row.join('')); }
function box(g, x, y, w, h, fill, edge = 'k') { rect(g, x, y, w, h, edge); rect(g, x + 1, y + 1, w - 2, h - 2, fill); }
function mirror(rows) { return rows.map((r) => [...r].reverse().join('')); }
function sheet(w, h, frames) { return { w, h, frames }; }

// ---------- room backdrop 240x135: a bright Seattle office ----------
export const FLOOR_Y = 72;
// The window opening in the backdrop; the live sky canvas is laid exactly over it.
export const WINDOW = { x: 138, y: 8, w: 66, h: 46 };

function drawRoom() {
  const g = grid(240, 135);
  rect(g, 0, 0, 240, FLOOR_Y, '1');                                   // off-white wall
  rect(g, 0, 0, 66, FLOOR_Y, '3');                                    // sage slat accent wall
  for (let x = 3; x < 66; x += 5) rect(g, x, 4, 1, FLOOR_Y - 7, '4');
  rect(g, 66, 3, 1, FLOOR_Y - 3, '2');                                // accent wall edge
  rect(g, 67, 4, 1, FLOOR_Y - 7, 'A');
  rect(g, 0, 0, 240, 3, '5'); rect(g, 0, 3, 240, 1, '2');             // ceiling trim + shadow line
  // light oak floor: wide planks with staggered seams, darker where it meets the wall
  rect(g, 0, FLOOR_Y, 240, 135 - FLOOR_Y, '6');
  rect(g, 0, FLOOR_Y, 240, 2, '7');
  for (let y = FLOOR_Y + 8, row = 0; y < 135; y += 8, row++) {
    rect(g, 0, y, 240, 1, '7');
    for (let x = (row * 37) % 64; x < 240; x += 64) rect(g, x, y - 7, 1, 7, '7');
  }
  rect(g, 0, FLOOR_Y - 4, 240, 3, '9'); rect(g, 0, FLOOR_Y - 1, 240, 1, '5'); // white baseboard
  // window: black frame, white sill
  const { x, y, w, h } = WINDOW;
  box(g, x - 2, y - 2, w + 4, h + 4, '[', '8');
  rect(g, x - 4, y + h + 2, w + 8, 2, '9'); rect(g, x - 4, y + h + 4, w + 8, 1, '5');
  return frame(g);
}

// ---------- window (WINDOW.w x WINDOW.h): Seattle, the Space Needle and Rainier ----------
// phase: dawn | day | dusk | night | aurora. f (0/1) twinkles stars, ripples the aurora, moves rain.
export const SKY_PHASES = ['dawn', 'day', 'dusk', 'night', 'aurora'];
const TOWERS = [[0, 6, 13], [6, 5, 20], [11, 6, 11], [24, 6, 17], [30, 5, 24], [35, 6, 12], [47, 5, 8], [52, 6, 5], [58, 4, 7], [62, 4, 4]];
function drawWindow(phase, f = 0, rain = false) {
  const { w: W, h: H } = WINDOW;
  const g = grid(W, H);
  const dark = phase === 'night' || phase === 'aurora';
  const WATER = H - 7;
  const bands = rain
    ? { dawn: ['l', 'Z', 'Z'], day: ['m', 'l', 'l'], dusk: ['D', 'D', 'J'], night: ['d', 'd', 'd'], aurora: ['d', 'd', 'D'] }[phase]
    : { dawn: ['Z', 'J', 'j'], day: ['[', ']', '{'], dusk: ['D', 'J', 'j'], night: ['d', 'd', 'D'], aurora: ['d', 'd', 'D'] }[phase];
  rect(g, 0, 0, W, 12, bands[0]); rect(g, 0, 12, W, 12, bands[1]); rect(g, 0, 24, W, WATER - 24, bands[2]);
  if (phase === 'day' && !rain) { rect(g, 6, 5, 14, 2, 'U'); rect(g, 9, 4, 7, 1, 'U'); rect(g, 40, 8, 10, 2, 'U'); }
  if (phase === 'dawn' && !rain) rect(g, 52, 20, 3, 3, 'y');
  if (dark && !rain) {
    [[3, 2], [9, 6], [14, 2], [27, 4], [33, 9], [40, 3], [49, 7], [56, 2], [62, 5], [23, 10], [36, 14]]
      .forEach(([sx, sy], i) => { if ((i + f) % 3) px(g, sx, sy, 'i'); });
    rect(g, 56, 3, 3, 3, 'U'); px(g, 56, 3, bands[0]);                     // moon
  }
  if (phase === 'aurora') {                                                 // northern lights curtain
    for (let ax = 0; ax < W; ax++) {
      const ay = 3 + Math.round(2 + 2 * Math.sin((ax + f * 3) / 4));
      px(g, ax, ay, 'q'); px(g, ax, ay + 1, (ax + f) % 4 ? 'q' : 'Q'); px(g, ax, ay + 2, 'q'); if (ax % 2) px(g, ax, ay + 3, 'Q');
    }
  }
  // Mount Rainier, snow-capped, behind the towers
  for (let r = 0; r < 22; r++) {
    const half = 2 + Math.round(r * 1.7);
    rect(g, 44 - half, 15 + r, half * 2, 1, r < 6 ? (dark ? 'l' : 'i') : (dark ? 'z' : ')'));
  }
  // downtown towers with lit windows
  TOWERS.forEach(([tx, tw, th], i) => {
    const top = WATER - th;
    rect(g, tx, top, tw, th, dark ? '<' : '(');
    rect(g, tx, top, 1, th, dark ? 'C' : ')');
    for (let wy = top + 2; wy < WATER - 1; wy += 3) for (let wx = tx + 1; wx < tx + tw - 1; wx += 2) {
      if ((wx + wy + i) % 3) px(g, wx, wy, dark ? ((wx * 7 + wy + i) % 5 ? 'y' : '<') : ')');
    }
  });
  // the Space Needle
  const nx = 19, nc = dark ? 'l' : 'i';
  rect(g, nx, 8, 1, WATER - 8, nc); rect(g, nx - 1, 22, 3, WATER - 22, nc); rect(g, nx - 2, WATER - 3, 5, 3, nc);
  rect(g, nx - 5, 11, 11, 2, nc); rect(g, nx - 3, 10, 7, 1, nc); rect(g, nx - 3, 13, 7, 1, dark ? 'C' : 'v');
  rect(g, nx, 4, 1, 6, nc);
  if (dark) { px(g, nx, 4, 'x'); rect(g, nx - 4, 12, 9, 1, 'y'); }
  // Elliott Bay
  rect(g, 0, WATER, W, H - WATER, dark ? '>' : '}');
  for (let rx = 2; rx < W; rx += 7) px(g, rx + (f % 2), WATER + 2 + (rx % 3), dark ? 'y' : 'U');
  if (rain) for (let rx = 2; rx < W; rx += 4) {                              // rain streaks
    const ry = 1 + ((rx * 5 + f * 4) % (H - 4));
    px(g, rx, ry, dark ? 'v' : 'U'); px(g, rx, ry + 1, dark ? 'v' : 'U');
  }
  rect(g, 21, 0, 2, H, '8'); rect(g, 43, 0, 2, H, '8');                      // mullions
  return frame(g);
}

// ---------- objects ----------
function drawPennant() {           // Alaska-blue pennant with a gold dipper
  const g = grid(18, 14);
  rect(g, 0, 0, 2, 14, 'k');
  for (let y = 0; y < 11; y++) rect(g, 2, y, Math.max(1, Math.round(16 * (1 - Math.abs(y - 5) / 6))), 1, 'a');
  [[4, 4], [6, 4], [7, 5], [9, 5], [9, 6], [11, 6], [12, 4]].forEach(([x, y]) => px(g, x, y, 'y'));
  return frame(g);
}
function drawMap(unrolled) {       // trail map: Anchorage -> Seattle dashed route
  const g = grid(34, 22);
  if (!unrolled) { box(g, 0, 0, 34, 22, 'p'); }
  else { box(g, 0, 0, 34, 22, 'U'); }
  rect(g, 1, 1, 32, 1, 'P');
  const pts = [[4, 6], [7, 8], [10, 7], [13, 10], [16, 9], [19, 12], [22, 13], [25, 12], [28, 16]];
  pts.forEach(([x, y], i) => { if (i % 2 === 0 || unrolled) px(g, x, y, 'r'); px(g, x + 1, y, i % 2 ? 'R' : 'r'); });
  box(g, 3, 5, 3, 3, 'K', 'K'); box(g, 27, 15, 3, 3, 'K', 'K'); // ANC and SEA pins
  rect(g, 4, 17, 6, 1, 'K'); rect(g, 4, 19, 9, 1, 'P');           // legend lines
  return frame(g);
}
function drawDesk() {
  const g = grid(46, 22);
  rect(g, 0, 0, 46, 5, 'b'); rect(g, 0, 0, 46, 1, 'h'); rect(g, 0, 4, 46, 1, 'B');
  rect(g, 2, 5, 3, 17, 'B'); rect(g, 41, 5, 3, 17, 'B');
  rect(g, 30, 5, 11, 8, 'b'); rect(g, 31, 8, 9, 1, 'B'); px(g, 35, 7, 'y'); // drawer
  return frame(g);
}
function drawLaptop(on) {
  const g = grid(18, 9);
  rect(g, 2, 0, 14, 7, 'C'); rect(g, 3, 1, 12, 5, on ? 'e' : 'E');
  if (on) { rect(g, 4, 2, 6, 1, 'K'); rect(g, 4, 4, 8, 1, 'K'); }
  rect(g, 0, 7, 18, 2, 'c'); rect(g, 0, 8, 18, 1, 'C');
  return frame(g);
}
function drawMug(steam) {
  const g = grid(6, 8);
  if (steam) { px(g, 1, 0, 'P'); px(g, 2, 1, 'P'); px(g, 1, 2, 'P'); }
  rect(g, 0, 3, 4, 5, 'r'); rect(g, 0, 3, 4, 1, 'R'); rect(g, 4, 4, 2, 1, 'r'); rect(g, 5, 4, 1, 3, 'r'); rect(g, 4, 6, 2, 1, 'r');
  return frame(g);
}
function drawPager(lit) {          // pager with an alert light
  const g = grid(7, 7);
  box(g, 0, 2, 7, 5, 'c'); rect(g, 1, 3, 5, 2, 'e'); rect(g, 2, 0, 3, 2, lit ? 'x' : 'R');
  return frame(g);
}
function drawShelf() {             // bookshelf (the logbook is a separate object on it)
  const g = grid(22, 28);
  box(g, 0, 0, 22, 28, 'B', 'k');
  rect(g, 1, 9, 20, 1, 'k'); rect(g, 1, 18, 20, 1, 'k');
  [[2, 'a', 6], [4, 'r', 7], [6, 'g', 5], [8, 'P', 7], [11, 'R', 6]].forEach(([x, c, hgt]) => rect(g, x, 9 - hgt, 2, hgt, c));
  [[2, 'y', 6], [4, 'v', 7], [6, 'p', 8], [9, 'o', 6], [12, 'l', 7], [15, 'g', 6]].forEach(([x, c, hgt]) => rect(g, x, 18 - hgt, 2, hgt, c));
  rect(g, 3, 22, 6, 4, 'P'); rect(g, 12, 21, 7, 5, 'c'); // boxes on the bottom shelf
  return frame(g);
}
function drawLogbook(open) {
  const g = grid(9, 8);
  if (!open) { box(g, 1, 0, 7, 8, 'R'); rect(g, 3, 2, 3, 1, 'y'); rect(g, 1, 0, 1, 8, 'k'); }
  else { box(g, 0, 2, 9, 6, 'p'); rect(g, 4, 2, 1, 6, 'k'); rect(g, 1, 4, 2, 1, 'P'); rect(g, 6, 4, 2, 1, 'P'); }
  return frame(g);
}
function drawKeys(jingle) {        // wall hook with truck keys
  const g = grid(8, 10);
  rect(g, 0, 0, 8, 2, 'b'); rect(g, 0, 0, 8, 1, 'h');
  const dx = jingle ? 1 : 0;
  rect(g, 3 + dx, 2, 1, 2, 'l'); box(g, 2 + dx, 4, 4, 4, 'm', 'C'); rect(g, 3 + dx, 8, 1, 2, 'l'); px(g, 4 + dx, 9, 'l');
  px(g, 3 + dx, 5, 'r');
  return frame(g);
}
function drawCamera(flash) {       // camera bag with a lens peeking out
  const g = grid(16, 13);
  rect(g, 3, 0, 10, 2, 'C');
  box(g, 0, 2, 16, 11, 'c', 'C');
  rect(g, 1, 3, 14, 1, 'm');
  box(g, 5, 5, 6, 6, 'm', 'C'); rect(g, 7, 7, 2, 2, flash ? 'U' : 'u');
  px(g, 13, 4, 'r');
  return frame(g);
}
function drawMailbox(open) {
  const g = grid(12, 22);
  rect(g, 5, 9, 2, 13, 'k');
  box(g, 0, 2, 12, 8, 'o', 'R');
  rect(g, 1, 3, 10, 1, 'r');
  if (open) { rect(g, 11, 1, 1, 8, 'R'); rect(g, 2, 5, 6, 3, 'p'); }
  else { rect(g, 9, 0, 2, 4, 'y'); }
  return frame(g);
}
function drawRack(f) {             // server rack: four units with blinking status lights
  const g = grid(14, 24);
  box(g, 0, 0, 14, 22, 'c');
  rect(g, 1, 22, 2, 2, 'k'); rect(g, 11, 22, 2, 2, 'k');         // feet
  [2, 7, 12, 17].forEach((y, i) => {
    box(g, 1, y, 12, 4, 'C', 'k');
    rect(g, 2, y + 1, 6, 1, 'm'); rect(g, 2, y + 2, 4, 1, 'm');    // vents
    const on = (i + f) % 2 === 0;
    px(g, 10, y + 1, on ? 'e' : 'E'); px(g, 11, y + 1, on ? 'E' : 'e');
    px(g, 10, y + 2, i === 1 ? (f ? 'y' : 'j') : 'E');
  });
  return frame(g);
}
function drawRug() {
  const g = grid(44, 18);
  box(g, 0, 0, 44, 18, 'o', 'R');
  rect(g, 3, 3, 38, 12, 'r');
  for (let x = 6; x < 38; x += 6) rect(g, x, 8, 3, 2, 'P');
  return frame(g);
}

// ---------- mini Tim (10x20): short black hair, green rain jacket, tan boots ----------
const HEAD_DOWN = ['...HHHH...', '..HHHHHH..', '..HHHHHH..', '..HssssH..', '..sKssKs..', '..ssssss..', '...sSSs...'];
const HEAD_UP = ['...HHHH...', '..HHHHHH..', '..HHHHHH..', '..HHHHHH..', '..HHHHHH..', '..sHHHHs..', '...sSSs...'];
const HEAD_SIDE = ['...HHHH...', '..HHHHHH..', '..HHHHHH..', '..ssHHHH..', '..sKsHHH..', '..ssssHH..', '...sSs....'];
const BODY = ['..gggggg..', '.gggGGggg.', '.ggggGggg.', '.ggggGggg.', '.sggGGggs.'];
const BODY_SIDE = ['...gggg...', '..gggggg..', '..ggGggg..', '..ggGggg..', '..gsGggg..'];
const HIPS = ['..nnnnnn..', '..nnnnnn..', '..nnNNnn..'];
const HIPS_SIDE = ['...nnnn...', '...nnnn...', '...nnNn...'];
const LEGS = {
  stand: ['..nn..nn..', '..nn..nn..', '..nn..nn..', '.ttt..ttt.', '.ttt..ttt.'],
  stepL: ['..nn..nn..', '.nn....nn.', '.nn....nn.', 'ttt....ttt', '..........'],
  stepR: ['..nn..nn..', '...nnnn...', '...nnnn...', '..tt..tt..', '..tt..tt..'],
  side0: ['...n..n...', '..n....n..', '..n....n..', '.tt...tt..', '..........'],
  side1: ['...nnnn...', '...nnnn...', '...nn.n...', '...ttttt..', '..........'],
};
const tim = (head, body, hips, legs) => [...head, ...body, ...hips, ...legs];
const BREATHE = ['..gggggg..', '.gggggggg.', '.ggggGggg.', '.ggggGggg.', '.sggGGggs.'];
const USE_0 = ['..gggggg..', '.gggGGggg.', 'sggggGggs.', '.ggggGggg.', '..ggGGgg..'];
const USE_1 = ['s.gggggg.s', 'sgggGGgggs', '.ggggGggg.', '.ggggGggg.', '..ggGGgg..'];
const WAVE_0 = ['..gggggg.s', '.gggGGgggs', '.ggggGggg.', '.ggggGggg.', '.sggGGgg..'];
const WAVE_1 = ['..gggggg..', '.gggGGggg.s', '.ggggGgggs', '.ggggGggg.', '.sggGGgg..'].map((r) => r.slice(0, 10));

const walkSide = [
  tim(HEAD_SIDE, BODY_SIDE, HIPS_SIDE, LEGS.side0),
  tim(HEAD_SIDE, BODY_SIDE, HIPS_SIDE, LEGS.side1),
  tim(HEAD_SIDE, BODY_SIDE, HIPS_SIDE, LEGS.side0),
  tim(HEAD_SIDE, BODY_SIDE, HIPS_SIDE, LEGS.side1),
];

// ---------- 16x16 tray icons ----------
function icon(draw) { const g = grid(16, 16); draw(g); return sheet(16, 16, [frame(g)]); }
function fit(src, g, ox, oy) { src.forEach((row, y) => [...row].forEach((c, x) => { if (c !== '.') px(g, ox + x, oy + y, c); })); }

const PENNANT = drawPennant();
const MAP = drawMap(false);
const LAPTOP = drawLaptop(true);
const PAGER = drawPager(false);
const LOGBOOK = drawLogbook(false);
const KEYS = drawKeys(false);
const CAMERA = drawCamera(false);
const MAILBOX = drawMailbox(false);
const RACK = drawRack(0);

export const SPRITES = {
  room: sheet(240, 135, [drawRoom()]),
  pennant: sheet(18, 14, [PENNANT]),
  map: sheet(34, 22, [MAP, drawMap(true)]),
  desk: sheet(46, 22, [drawDesk()]),
  laptop: sheet(18, 9, [LAPTOP, drawLaptop(false)]),
  mug: sheet(6, 8, [drawMug(true), drawMug(false)]),
  pager: sheet(7, 7, [PAGER, drawPager(true)]),
  shelf: sheet(22, 28, [drawShelf()]),
  logbook: sheet(9, 8, [LOGBOOK, drawLogbook(true)]),
  keys: sheet(8, 10, [KEYS, drawKeys(true)]),
  camera: sheet(16, 13, [CAMERA, drawCamera(true)]),
  mailbox: sheet(12, 22, [MAILBOX, drawMailbox(true)]),
  rack: sheet(14, 24, [RACK, drawRack(1)]),
  rug: sheet(44, 18, [drawRug()]),

  tim_idle_down: sheet(10, 20, [tim(HEAD_DOWN, BODY, HIPS, LEGS.stand), tim(HEAD_DOWN, BREATHE, HIPS, LEGS.stand)]),
  tim_walk_down: sheet(10, 20, [LEGS.stand, LEGS.stepL, LEGS.stand, LEGS.stepR].map((l) => tim(HEAD_DOWN, BODY, HIPS, l))),
  tim_walk_up: sheet(10, 20, [LEGS.stand, LEGS.stepL, LEGS.stand, LEGS.stepR].map((l) => tim(HEAD_UP, BODY, HIPS, l))),
  tim_walk_left: sheet(10, 20, walkSide),
  tim_walk_right: sheet(10, 20, walkSide.map(mirror)),
  tim_use: sheet(10, 20, [tim(HEAD_UP, USE_0, HIPS, LEGS.stand), tim(HEAD_UP, USE_1, HIPS, LEGS.stand)]),
  tim_wave: sheet(10, 20, [tim(HEAD_DOWN, WAVE_0, HIPS, LEGS.stand), tim(HEAD_DOWN, WAVE_1, HIPS, LEGS.stand)]),

  icon_pennant: icon((g) => fit(PENNANT, g, 0, 1)),
  icon_map: icon((g) => { box(g, 0, 2, 16, 12, 'p'); [[3, 5], [5, 7], [7, 6], [9, 9], [11, 8]].forEach(([x, y]) => px(g, x, y, 'r')); box(g, 2, 4, 3, 3, 'K', 'K'); box(g, 11, 9, 3, 3, 'K', 'K'); }),
  icon_laptop: icon((g) => fit(LAPTOP, g, -1, 4)),
  icon_pager: icon((g) => { box(g, 2, 5, 12, 9, 'c'); rect(g, 4, 7, 8, 3, 'e'); rect(g, 6, 2, 4, 3, 'x'); }),
  icon_logbook: icon((g) => { box(g, 3, 1, 10, 14, 'R'); rect(g, 3, 1, 2, 14, 'k'); rect(g, 7, 4, 4, 1, 'y'); rect(g, 7, 6, 3, 1, 'y'); }),
  icon_keys: icon((g) => { rect(g, 7, 0, 2, 3, 'l'); box(g, 4, 3, 8, 7, 'm', 'C'); px(g, 7, 6, 'r'); rect(g, 7, 10, 2, 5, 'l'); px(g, 9, 13, 'l'); px(g, 9, 11, 'l'); }),
  icon_camera: icon((g) => fit(CAMERA, g, 0, 2)),
  icon_rack: icon((g) => { box(g, 2, 0, 12, 16, 'c'); [2, 6, 10].forEach((y) => { box(g, 3, y, 10, 3, 'C', 'k'); rect(g, 4, y + 1, 4, 1, 'm'); px(g, 10, y + 1, 'e'); px(g, 11, y + 1, y === 6 ? 'y' : 'E'); }); }),
  icon_mailbox: icon((g) => { box(g, 1, 3, 14, 8, 'o', 'R'); rect(g, 2, 4, 12, 1, 'r'); rect(g, 12, 1, 2, 5, 'y'); rect(g, 7, 11, 2, 5, 'k'); }),
};
// window_<phase> and window_<phase>_rain (no rain under the aurora), two frames each
for (const phase of SKY_PHASES) {
  SPRITES[`window_${phase}`] = sheet(WINDOW.w, WINDOW.h, [drawWindow(phase, 0), drawWindow(phase, 1)]);
  if (phase !== 'aurora') SPRITES[`window_${phase}_rain`] = sheet(WINDOW.w, WINDOW.h, [drawWindow(phase, 0, true), drawWindow(phase, 1, true)]);
}

export function validateSprite(s) {
  const problems = [];
  if (!s || !Array.isArray(s.frames) || s.frames.length === 0) return ['no frames'];
  s.frames.forEach((f, fi) => {
    if (f.length !== s.h) problems.push(`frame ${fi}: ${f.length} rows, want ${s.h}`);
    f.forEach((row, ri) => {
      if (row.length !== s.w) problems.push(`frame ${fi} row ${ri}: ${row.length} chars, want ${s.w}`);
      for (const ch of row) if (!(ch in PALETTE)) { problems.push(`frame ${fi} row ${ri}: unknown key ${ch}`); break; }
    });
  });
  return problems;
}

// Paints one frame onto a new canvas at native resolution (1 px per map cell).
export function paintSprite(rows, palette = PALETTE, doc = globalThis.document) {
  const c = doc.createElement('canvas');
  c.width = rows[0].length; c.height = rows.length;
  const ctx = c.getContext('2d');
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const col = palette[row[x]];
      if (col) { ctx.fillStyle = col; ctx.fillRect(x, y, 1, 1); }
    }
  });
  return c;
}
