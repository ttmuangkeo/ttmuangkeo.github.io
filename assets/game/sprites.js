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

// ---------- room backdrop 160x100 ----------
function drawRoom() {
  const g = grid(160, 100);
  rect(g, 0, 0, 160, 40, 'w');                                   // wall
  for (let x = 0; x < 160; x += 8) rect(g, x, 0, 1, 40, 'W');    // plank seams
  rect(g, 0, 0, 160, 2, 'k');                                    // ceiling trim
  rect(g, 0, 40, 160, 60, 'f');                                  // floor
  for (let y = 46; y < 100; y += 6) rect(g, 0, y, 160, 1, 'F');  // board lines
  for (let y = 40, row = 0; y < 100; y += 6, row++) {            // staggered seams
    for (let x = (row % 2) * 20; x < 160; x += 40) rect(g, x, y, 1, 6, 'F');
  }
  rect(g, 0, 38, 160, 3, 'k');                                   // baseboard
  // window (rig parked outside)
  box(g, 108, 8, 30, 22, 'u');
  rect(g, 110, 10, 26, 6, 'U');
  for (let i = 0; i < 9; i++) rect(g, 112 + i, 20 - i, 18 - 2 * i, 1, i < 3 ? 'i' : 'v'); // mountain
  rect(g, 109, 22, 28, 7, 'P');                                  // ground outside
  rect(g, 112, 21, 14, 4, 'c'); rect(g, 114, 19, 9, 2, 'm');     // truck + rooftop tent
  px(g, 114, 25, 'k'); px(g, 123, 25, 'k'); px(g, 125, 22, 'y'); // wheels + light
  rect(g, 122, 9, 1, 20, 'k'); rect(g, 109, 18, 28, 1, 'k');      // window cross bars
  // door
  box(g, 145, 10, 15, 30, 'b'); rect(g, 147, 12, 11, 12, 'h'); rect(g, 147, 26, 11, 12, 'h');
  px(g, 156, 26, 'y');
  return frame(g);
}

// ---------- window (30x22, laid over the backdrop's window at 108,8) ----------
// phase: dawn | day | dusk | night | aurora. f (0/1) twinkles stars, ripples the aurora, moves rain.
export const SKY_PHASES = ['dawn', 'day', 'dusk', 'night', 'aurora'];
function drawWindow(phase, f = 0, rain = false) {
  const g = grid(30, 22);
  const dark = phase === 'night' || phase === 'aurora';
  const sky = rain
    ? { dawn: 'Z', day: 'l', dusk: 'D', night: 'd', aurora: 'd' }[phase]
    : { dawn: 'Z', day: 'u', dusk: 'D', night: 'd', aurora: 'd' }[phase];
  box(g, 0, 0, 30, 22, sky);
  if (phase === 'day') rect(g, 2, 2, 26, 6, rain ? 'm' : 'U');            // cloud bank
  if (phase === 'dawn') { rect(g, 1, 6, 28, 4, 'J'); if (!rain) rect(g, 21, 6, 2, 2, 'y'); }
  if (phase === 'dusk') { rect(g, 1, 5, 28, 3, 'j'); rect(g, 1, 8, 28, 2, 'J'); }
  if (dark && !rain) {
    [[3, 2], [8, 4], [12, 1], [17, 3], [20, 7], [27, 6], [5, 7], [11, 6]]
      .forEach(([x, y], i) => { if ((i + f) % 3) px(g, x, y, 'i'); });
    rect(g, 24, 2, 2, 2, 'U');                                            // moon
  }
  if (phase === 'aurora') {                                               // northern lights curtain
    for (let x = 1; x < 29; x++) {
      const y = 2 + Math.round(1.5 + 1.5 * Math.sin((x + f * 3) / 3));
      px(g, x, y, 'q'); px(g, x, y + 1, (x + f) % 4 ? 'q' : 'Q'); if (x % 2) px(g, x, y + 2, 'Q');
    }
  }
  for (let i = 0; i < 9; i++) rect(g, 4 + i, 12 - i, 18 - 2 * i, 1, i >= 6 ? (dark ? 'l' : 'i') : (dark ? 'z' : 'v')); // mountain
  rect(g, 1, 14, 28, 7, dark ? 'C' : 'P');                               // ground
  rect(g, 4, 13, 14, 4, 'c'); rect(g, 6, 11, 9, 2, 'm');                 // truck + rooftop tent
  px(g, 6, 17, 'k'); px(g, 15, 17, 'k'); px(g, 17, 14, 'y');             // wheels + headlight
  if (dark) { px(g, 10, 11, 'y'); px(g, 18, 14, 'y'); }                  // tent lantern, headlight glow
  if (rain && !dark) for (let x = 2; x < 28; x += 3) {                   // rain streaks
    const y = 1 + ((x * 5 + f * 4) % 18);
    px(g, x, y, 'U'); px(g, x, y + 1, 'U');
  }
  if (rain && dark) for (let x = 2; x < 28; x += 3) {
    const y = 1 + ((x * 5 + f * 4) % 18);
    px(g, x, y, 'v'); px(g, x, y + 1, 'v');
  }
  rect(g, 14, 1, 1, 20, 'k'); rect(g, 1, 10, 28, 1, 'k');                // window cross bars
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

export const SPRITES = {
  room: sheet(160, 100, [drawRoom()]),
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
  icon_mailbox: icon((g) => { box(g, 1, 3, 14, 8, 'o', 'R'); rect(g, 2, 4, 12, 1, 'r'); rect(g, 12, 1, 2, 5, 'y'); rect(g, 7, 11, 2, 5, 'k'); }),
};
// window_<phase> and window_<phase>_rain (no rain under the aurora), two frames each
for (const phase of SKY_PHASES) {
  SPRITES[`window_${phase}`] = sheet(30, 22, [drawWindow(phase, 0), drawWindow(phase, 1)]);
  if (phase !== 'aurora') SPRITES[`window_${phase}_rain`] = sheet(30, 22, [drawWindow(phase, 0, true), drawWindow(phase, 1, true)]);
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
