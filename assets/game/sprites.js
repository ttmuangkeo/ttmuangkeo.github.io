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

// The window on the back wall, in wall coordinates (y measured down from the top of the wall);
// the live sky texture fills exactly this rectangle.
export const WINDOW = { x: 138, y: 8, w: 66, h: 46 };


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

// ---------- office pieces ----------
function drawWhiteboard() {        // 52x34: the left side stays clear for the numbers overlay
  const g = grid(52, 34);
  box(g, 0, 0, 52, 31, '9', 'l');
  rect(g, 1, 1, 50, 1, 'Y'); rect(g, 1, 29, 50, 1, '2');
  [8, 13, 18, 23].forEach((y, i) => rect(g, 4, y, [22, 17, 24, 14][i], 1, i % 2 ? 'R' : 'a'));
  rect(g, 4, 4, 14, 1, 'K');
  [[38, 8, 'E'], [41, 12, 'E'], [44, 6, 'r'], [47, 15, 'E']].forEach(([x, h, c]) => rect(g, x, 23 - h, 2, h, c));
  rect(g, 37, 23, 13, 1, 'K');
  rect(g, 38, 3, 5, 4, 'y'); rect(g, 44, 3, 5, 4, 'u');
  rect(g, 6, 31, 40, 2, 'l'); rect(g, 6, 33, 40, 1, '5');                // marker tray
  rect(g, 12, 30, 4, 1, 'R'); rect(g, 18, 30, 4, 1, 'a'); rect(g, 24, 30, 4, 1, 'E');
  return frame(g);
}
function drawPennant() {           // framed Alaska-blue felt pennant with a gold dipper
  const g = grid(20, 14);
  box(g, 0, 0, 20, 14, 'p', '8'); rect(g, 1, 1, 18, 1, 'Y');
  for (let y = 0; y < 10; y++) rect(g, 3, 2 + y, Math.max(1, Math.round(15 * (1 - Math.abs(y - 4.5) / 5.5))), 1, 'a');
  [[5, 5], [7, 5], [8, 6], [10, 6], [10, 7], [12, 7], [13, 5]].forEach(([x, y]) => px(g, x, y, 'y'));
  return frame(g);
}
function drawMap(lit) {            // framed trail map: Anchorage -> Seattle dashed route
  const g = grid(26, 18);
  box(g, 0, 0, 26, 18, '9', '8'); rect(g, 2, 2, 22, 14, lit ? 'U' : 'p');
  rect(g, 5, 7, 6, 1, 'P'); rect(g, 12, 11, 7, 1, 'P'); rect(g, 6, 13, 5, 1, 'P'); rect(g, 15, 4, 6, 1, 'P');
  [[5, 4], [7, 5], [9, 6], [11, 6], [13, 8], [15, 9], [17, 10], [19, 12]].forEach(([x, y], i) => { if (i % 2 === 0 || lit) px(g, x, y, 'r'); px(g, x + 1, y, 'R'); });
  rect(g, 3, 3, 2, 2, 'K'); rect(g, 20, 12, 2, 2, 'K');
  return frame(g);
}
function drawPlaque() {            // framed team photo with a brass nameplate
  const g = grid(13, 17);
  box(g, 0, 0, 13, 13, '9', '8');
  rect(g, 2, 2, 9, 9, ']'); rect(g, 2, 8, 9, 3, '6');
  [[3, 'g'], [6, 'r'], [9, 'a']].forEach(([x, c]) => { px(g, x, 4, 'H'); px(g, x, 5, 's'); rect(g, x - 1 + (x === 9 ? 0 : 0), 6, 2, 3, c); });
  rect(g, 2, 13, 9, 4, 'b'); rect(g, 3, 14, 7, 2, 'y'); rect(g, 4, 15, 5, 1, 'j');
  return frame(g);
}
function drawShelf() {             // two floating white shelves; the camera and binder sit on them
  const g = grid(62, 32);
  [12, 28].forEach((y) => { rect(g, 0, y, 62, 1, '9'); rect(g, 0, y + 1, 62, 1, '5'); rect(g, 6, y + 2, 1, 2, '8'); rect(g, 55, y + 2, 1, 2, '8'); });
  [[2, 'a', 9], [4, 'r', 10], [6, 'P', 8], [8, 'g', 10], [10, 'y', 9]].forEach(([x, c, h]) => rect(g, x, 12 - h, 2, h, c));
  for (let i = 0; i < 8; i++) px(g, 13 + Math.floor(i / 2), 11 - i, 'R');           // leaning book
  rect(g, 17, 8, 6, 4, '9'); rect(g, 21, 8, 2, 4, '5');                             // little plant
  [[16, 4], [19, 2], [21, 5], [18, 6]].forEach(([x, y]) => rect(g, x, y, 3, 2, 'L')); px(g, 19, 3, 'M');
  rect(g, 52, 5, 7, 7, '8'); rect(g, 53, 6, 5, 3, 'l'); px(g, 55, 10, 'e');         // speaker
  rect(g, 22, 25, 11, 2, 'a'); rect(g, 23, 23, 9, 2, 'O'); rect(g, 22, 21, 10, 2, 'P'); // book stack
  rect(g, 39, 24, 6, 4, 'O'); rect(g, 39, 24, 6, 1, 'T');                           // succulent
  [[38, 21], [41, 20], [43, 22]].forEach(([x, y]) => rect(g, x, y, 2, 3, 'L'));
  box(g, 50, 19, 7, 9, ']', '8');                                                   // small photo
  return frame(g);
}
function drawDesk() {              // white-top standing desk, black frame, keyboard and mouse
  const g = grid(68, 34);
  rect(g, 24, 1, 18, 3, '8'); for (let x = 25; x < 41; x += 2) px(g, x, 2, 'l'); rect(g, 46, 2, 3, 2, '8');
  rect(g, 0, 4, 68, 2, '9'); rect(g, 0, 4, 68, 1, 'Y'); rect(g, 0, 6, 68, 1, '5');
  rect(g, 4, 7, 60, 2, '8');
  rect(g, 6, 9, 3, 23, '8'); rect(g, 59, 9, 3, 23, '8'); rect(g, 7, 9, 1, 23, 'm'); rect(g, 60, 9, 1, 23, 'm');
  rect(g, 2, 31, 11, 2, '8'); rect(g, 55, 31, 11, 2, '8');
  rect(g, 1, 33, 13, 1, '0'); rect(g, 54, 33, 13, 1, '0');
  return frame(g);
}
function drawMonitors(f) {         // dual monitors: code on the left, a dashboard on the right
  const g = grid(46, 18);
  for (const ox of [0, 25]) {
    box(g, ox, 0, 21, 13, 'N', '8');
    rect(g, ox + 9, 13, 3, 3, '8'); rect(g, ox + 5, 16, 11, 2, '8'); rect(g, ox + 6, 16, 9, 1, 'm');
  }
  const lines = [[1, 6, 'e'], [3, 9, 'u'], [3, 5, 'y'], [1, 11, 'e'], [5, 7, 'u'], [3, 8, 'y'], [1, 10, 'e'], [3, 4, 'u']];
  for (let i = 0; i < 5; i++) { const [x, w, c] = lines[(i + f * 3) % lines.length]; rect(g, 2 + x, 2 + i * 2, w, 1, c); }
  [[3, 6, 4, 8], [5, 4, 7, 9], [6, 8, 5, 7]][f % 3].forEach((h, i) => rect(g, 28 + i * 4, 11 - h, 2, h, i === 2 ? 'y' : 'e'));
  rect(g, 27, 11, 17, 1, 'm');
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
  box(g, 0, 2, 7, 5, '8'); rect(g, 1, 3, 5, 2, 'e'); rect(g, 2, 0, 3, 2, lit ? 'x' : 'R');
  return frame(g);
}
function drawBinder(pulled) {      // blue binder on the lower shelf
  const g = grid(9, 12);
  const y = pulled ? 0 : 1;
  box(g, 0, y, 9, 11, 'a', '8'); rect(g, 2, y + 2, 5, 3, 'p'); rect(g, 3, y + 3, 3, 1, 'K'); px(g, 4, y + 8, 'l');
  return frame(g);
}
function drawToolbox(open) {       // red toolbox with a wrench sticker
  const g = grid(14, 11);
  if (open) { rect(g, 3, 0, 1, 5, 'l'); rect(g, 2, 0, 3, 1, 'l'); rect(g, 9, 1, 1, 4, 'y'); rect(g, 9, 0, 1, 1, '8'); }
  else { rect(g, 4, 0, 6, 1, '8'); rect(g, 4, 1, 1, 2, '8'); rect(g, 9, 1, 1, 2, '8'); }
  box(g, 0, 3, 14, 8, 'r', '8'); rect(g, 1, 4, 12, 1, 'o'); rect(g, 1, 6, 12, 1, 'R');
  px(g, 6, 6, 'y'); px(g, 7, 6, 'y');
  rect(g, 3, 8, 3, 1, 'p'); px(g, 2, 8, 'p'); px(g, 6, 7, 'p');                     // wrench sticker
  return frame(g);
}
function drawKeys(jingle) {        // black wall hook with truck keys
  const g = grid(8, 10);
  rect(g, 0, 0, 8, 2, '8'); rect(g, 0, 0, 8, 1, 'm');
  const dx = jingle ? 1 : 0;
  rect(g, 3 + dx, 2, 1, 2, 'l'); box(g, 2 + dx, 4, 4, 4, 'm', 'C'); rect(g, 3 + dx, 8, 1, 2, 'l'); px(g, 4 + dx, 9, 'l');
  px(g, 3 + dx, 5, 'r');
  return frame(g);
}
function drawCamera(flash) {       // mirrorless camera on the top shelf
  const g = grid(14, 10);
  rect(g, 4, 0, 6, 2, '8'); rect(g, 0, 2, 14, 8, '8'); rect(g, 0, 2, 3, 8, 'c'); rect(g, 1, 3, 12, 1, 'm');
  box(g, 4, 3, 7, 7, 'm', 'C'); rect(g, 6, 5, 3, 3, flash ? 'U' : 'u'); px(g, 6, 5, 'Y');
  px(g, 11, 1, 'r');
  return frame(g);
}
function drawDoor(ajar) {          // oak door with a little rust "let's talk" sign
  const g = grid(22, 50);
  rect(g, 0, 0, 22, 50, '5'); rect(g, 0, 0, 22, 1, 'A');
  rect(g, 2, 2, 18, 48, ajar ? '8' : '6');
  const w = ajar ? 14 : 18;
  rect(g, 2, 2, w, 48, '6');
  for (let x = 5; x < 2 + w; x += 5) rect(g, x, 3, 1, 46, '7');
  rect(g, 2, 2, w, 1, 'A');
  const hx = 2 + w - 4;
  rect(g, hx - 1, 26, 4, 1, '8'); px(g, hx + 2, 27, '8');
  box(g, 4, 11, w - 4, 7, 'r', 'R'); rect(g, 6, 13, w - 8, 1, '9'); rect(g, 7, 15, w - 10, 1, '9');
  return frame(g);
}
function drawRack(f) {             // server rack: four units with blinking status lights
  const g = grid(16, 28);
  box(g, 0, 0, 16, 26, 'c', '8'); rect(g, 1, 1, 14, 1, 'm');
  [3, 8, 13, 18].forEach((y, i) => {
    box(g, 2, y, 12, 4, 'C', '8');
    rect(g, 3, y + 1, 5, 1, 'm'); rect(g, 3, y + 2, 3, 1, 'm');
    const on = (i + f) % 2 === 0;
    px(g, 11, y + 1, on ? 'e' : 'E'); px(g, 12, y + 1, on ? 'E' : 'e');
    px(g, 11, y + 2, i === 1 ? (f ? 'y' : 'j') : 'E');
  });
  rect(g, 2, 23, 12, 1, 'm');
  rect(g, 1, 26, 3, 2, '8'); rect(g, 12, 26, 3, 2, '8');
  return frame(g);
}
function drawSofa() {              // terracotta sofa against the sage wall
  const g = grid(52, 22);
  rect(g, 3, 0, 46, 11, 'O'); rect(g, 3, 0, 46, 1, 'j'); rect(g, 18, 1, 1, 9, 'T'); rect(g, 33, 1, 1, 9, 'T');
  rect(g, 7, 6, 8, 6, 'y'); rect(g, 7, 6, 8, 1, 'Y'); rect(g, 37, 6, 8, 6, 'V'); rect(g, 37, 6, 8, 1, 'Y');
  rect(g, 3, 11, 46, 5, 'O'); rect(g, 3, 11, 46, 1, 'j'); rect(g, 3, 15, 46, 1, 'T'); rect(g, 26, 12, 1, 3, 'T');
  rect(g, 0, 5, 5, 13, 'T'); rect(g, 47, 5, 5, 13, 'T'); rect(g, 0, 5, 5, 1, 'O'); rect(g, 47, 5, 5, 1, 'O');
  rect(g, 3, 16, 46, 2, 'T');
  rect(g, 3, 18, 2, 3, '8'); rect(g, 47, 18, 2, 3, '8'); rect(g, 2, 21, 48, 1, '0');
  return frame(g);
}
function drawPlant(f) {            // tall fiddle-leaf fig in a white pot; f sways the top leaves
  const g = grid(12, 34);
  rect(g, 5, 6, 1, 18, 'M');
  [[0, 2], [6, 0], [0, 8], [7, 6], [1, 13], [7, 12], [0, 18], [6, 18]].forEach(([x, y], i) => {
    const dx = i < 4 && f ? 1 : 0;
    rect(g, x + dx, y + 1, 5, 2, 'L'); rect(g, x + dx + 1, y, 3, 4, 'L'); rect(g, x + dx + 1, y + 2, 3, 1, 'M');
  });
  rect(g, 1, 23, 10, 2, '2'); rect(g, 2, 25, 8, 9, '9'); rect(g, 2, 25, 8, 1, 'Y'); rect(g, 8, 25, 2, 9, '5');
  return frame(g);
}
function drawPendant() {           // short black pendant light with a warm bulb, hung over a mullion
  const g = grid(9, 11);
  rect(g, 4, 0, 1, 4, '8'); rect(g, 2, 4, 5, 1, '8'); rect(g, 1, 5, 7, 2, '8'); rect(g, 0, 7, 9, 1, '8');
  rect(g, 3, 8, 3, 1, 'y'); px(g, 4, 9, 'j');
  return frame(g);
}
function drawRug() {               // big cream rug
  const g = grid(120, 24);
  box(g, 0, 0, 120, 24, 'V', 'X');
  box(g, 3, 3, 114, 18, 'V', 'X');
  for (let x = 10; x < 110; x += 10) rect(g, x, 11, 4, 2, 'X');
  return frame(g);
}

// ---------- the 3D room's shell: back wall, left wall and floor, at world size ----------
function drawBackWall() {          // 240x72: off-white wall, window frame and sill, white baseboard
  const g = grid(240, 72);
  rect(g, 0, 0, 240, 72, '1');
  rect(g, 0, 0, 240, 3, '5'); rect(g, 0, 3, 240, 1, '2');
  rect(g, 0, 68, 240, 3, '9'); rect(g, 0, 71, 240, 1, '5');
  rect(g, 0, 0, 2, 72, '2');                                              // shade in the left corner
  const { x, y, w, h } = WINDOW;
  box(g, x - 2, y - 2, w + 4, h + 4, '[', '8');
  rect(g, x - 4, y + h + 2, w + 8, 2, '9'); rect(g, x - 4, y + h + 4, w + 8, 1, '5');
  return frame(g);
}
function drawLeftWall() {          // 112x72, front edge on the left: sage slats, trim, baseboard
  const g = grid(112, 72);
  rect(g, 0, 0, 112, 72, '3');
  for (let x = 3; x < 112; x += 5) rect(g, x, 4, 1, 64, '4');
  rect(g, 0, 0, 112, 3, '5'); rect(g, 0, 3, 112, 1, '2');
  rect(g, 0, 68, 112, 3, '9'); rect(g, 0, 71, 112, 1, '5');
  rect(g, 110, 0, 2, 72, '4');                                            // shade in the back corner
  return frame(g);
}
function drawFloor() {             // 240x112 light oak: wide planks running left to right, staggered seams
  const g = grid(240, 112);
  rect(g, 0, 0, 240, 112, '6');
  rect(g, 0, 0, 240, 2, '7');
  for (let y = 8, row = 0; y < 112; y += 8, row++) {
    rect(g, 0, y, 240, 1, '7');
    for (let x = (row * 37) % 64; x < 240; x += 64) rect(g, x, y - 7, 1, 7, '7');
  }
  return frame(g);
}

// ---------- chibi Tim (24x36): big head, short black hair, green rain jacket, tan boots ----------
// Built from parts so every pose shares one silhouette. view: 'down' (front), 'up' (back), 'side' (facing left).
function timHead(g, view, oy) {
  const row = (y, x0, x1, c) => rect(g, x0, y + oy, x1 - x0 + 1, 1, c);
  row(0, 7, 16, 'k'); row(1, 5, 18, 'k'); row(1, 7, 16, 'H');
  row(2, 4, 19, 'k'); row(2, 5, 18, 'H');
  for (let y = 3; y <= 9; y++) { row(y, 3, 20, 'k'); row(y, 4, 19, 'H'); }
  row(10, 4, 19, 'k'); row(11, 4, 19, 'k'); row(12, 5, 18, 'k'); row(13, 7, 16, 'k');
  if (view === 'up') {                       // back of the head: all hair, a little neck
    row(10, 5, 18, 'H'); row(11, 5, 18, 'H'); row(12, 6, 17, 'H'); row(13, 8, 15, 'S');
    row(4, 9, 13, 'c'); // hair shine
    return;
  }
  if (view === 'side') {                     // facing left: face on the left, hair wraps the back
    row(6, 4, 11, 's'); row(7, 4, 12, 's'); row(8, 3, 12, 's'); row(9, 3, 12, 's');
    row(10, 5, 12, 's'); row(10, 13, 18, 'H'); row(11, 5, 12, 's'); row(11, 13, 18, 'H');
    row(12, 6, 13, 's'); row(12, 14, 17, 'H'); row(13, 8, 13, 'S');
    px(g, 13, 8 + oy, 's'); px(g, 13, 9 + oy, 'S');           // ear
    px(g, 6, 8 + oy, 'K'); px(g, 6, 9 + oy, 'K'); px(g, 6, 8 + oy, 'K');
    px(g, 7, 11 + oy, 'J'); px(g, 4, 11 + oy, 'S');
    row(3, 8, 12, 'c');
    return;
  }
  // front: fringe, two eyes, blush, a small smile
  row(6, 7, 16, 's'); row(6, 10, 12, 'H');
  row(7, 6, 17, 's'); row(8, 5, 18, 's'); row(9, 5, 18, 's');
  row(10, 5, 18, 's'); row(11, 5, 18, 's'); row(12, 6, 17, 's'); row(13, 8, 15, 'S');
  px(g, 4, 8 + oy, 's'); px(g, 19, 8 + oy, 's');            // ears
  for (const x of [8, 15]) { px(g, x, 8 + oy, 'K'); px(g, x, 9 + oy, 'K'); }
  px(g, 7, 11 + oy, 'J'); px(g, 16, 11 + oy, 'J');
  px(g, 11, 11 + oy, 'S'); px(g, 12, 11 + oy, 'S');
  row(3, 8, 12, 'B');
}
function timBody(g, view, arms, oy) {
  const side = view === 'side';
  const [x0, x1] = side ? [8, 15] : [6, 17];
  rect(g, x0 - 1, 14 + oy, x1 - x0 + 3, 12 - oy, 'k');
  rect(g, x0, 15 + oy, x1 - x0 + 1, 10 - oy, 'g');
  rect(g, x0, 15 + oy, x1 - x0 + 1, 1, 'G');                  // collar shadow
  if (view === 'down') rect(g, 11, 16 + oy, 2, 9 - oy, 'G');  // zipper
  if (side) rect(g, 12, 16 + oy, 1, 8 - oy, 'G');
  const arm = (x, y0, y1) => { rect(g, x - 1, y0 - 1, 4, y1 - y0 + 3, 'k'); rect(g, x, y0, 2, y1 - y0 + 1, 'g'); rect(g, x, y1 + 1, 2, 1, 's'); };
  if (side) { arm(11, 16 + oy, 22); return; }
  const L = 4, R = 18;
  if (arms === 'use0') { arm(L, 11, 16); arm(R, 11, 16); return; }
  if (arms === 'use1') { arm(L, 10, 15); arm(R, 12, 17); return; }
  arm(L, 16 + oy, 22);
  if (arms === 'wave0') arm(R, 9, 14);
  else if (arms === 'wave1') { arm(R + 1, 8, 13); }
  else arm(R, 16 + oy, 22);
}
function timLegs(g, view, legs) {
  rect(g, 6, 25, 12, 4, 'k'); rect(g, 7, 25, 10, 3, 'n'); rect(g, 11, 26, 2, 2, 'N');
  const leg = (x, top, len) => {
    rect(g, x - 1, top, 6, len + 4, 'k');
    rect(g, x, top, 4, len, 'n');
    rect(g, x, top + len, 4, 2, 't'); rect(g, x - 1 + (x < 12 ? 0 : 1), top + len + 1, 5, 2, 't');
    rect(g, x, top + len, 4, 1, 'T');
  };
  if (view === 'side') {
    if (legs === 'side1') { leg(10, 28, 3); return; }
    leg(8, 28, 3); leg(13, 28, 2); return;
  }
  if (legs === 'stepL') { leg(6, 28, 3); leg(14, 27, 2); return; }
  if (legs === 'stepR') { leg(7, 27, 2); leg(13, 28, 3); return; }
  leg(7, 28, 3); leg(13, 28, 3);
}
function timFrame(view, legs = 'stand', arms = 'down', bob = 0) {
  const g = grid(24, 36);
  timLegs(g, view, legs);
  timBody(g, view, arms, bob);
  timHead(g, view, bob);
  return frame(g);
}
const walkSide = ['side0', 'side1', 'side0', 'side1'].map((l, i) => timFrame('side', l, 'down', i % 2));

// ---------- emotes (11x11): a small speech bubble with an icon ----------
export const EMOTES = ['alert', 'heart', 'dots', 'note', 'zzz'];
function emote(draw) {
  const g = grid(11, 11);
  box(g, 0, 0, 11, 9, 'Y', 'k'); rect(g, 3, 9, 2, 1, 'k'); px(g, 3, 10, 'k'); px(g, 4, 8, 'Y');
  draw(g);
  return sheet(11, 11, [frame(g)]);
}
const EMOTE_ART = {
  alert: (g) => { rect(g, 5, 1, 1, 4, 'x'); rect(g, 4, 2, 3, 2, 'x'); px(g, 5, 6, 'x'); },
  heart: (g) => { rect(g, 2, 2, 3, 2, 'x'); rect(g, 6, 2, 3, 2, 'x'); rect(g, 2, 3, 7, 2, 'x'); rect(g, 3, 5, 5, 1, 'x'); px(g, 5, 6, 'x'); px(g, 3, 2, 'J'); },
  dots: (g) => { [2, 5, 8].forEach((x) => px(g, x, 4, 'K')); },
  note: (g) => { rect(g, 5, 1, 1, 5, 'K'); rect(g, 5, 1, 3, 1, 'K'); px(g, 7, 2, 'K'); rect(g, 3, 5, 2, 2, 'K'); },
  zzz: (g) => { rect(g, 2, 2, 4, 1, 'a'); px(g, 4, 3, 'a'); px(g, 3, 4, 'a'); rect(g, 2, 5, 4, 1, 'a'); rect(g, 6, 4, 3, 1, 'a'); px(g, 7, 5, 'a'); rect(g, 6, 6, 3, 1, 'a'); },
};

// ---------- 16x16 tray icons ----------
function icon(draw) { const g = grid(16, 16); draw(g); return sheet(16, 16, [frame(g)]); }
function fit(src, g, ox, oy) { src.forEach((row, y) => [...row].forEach((c, x) => { if (c !== '.') px(g, ox + x, oy + y, c); })); }

const MONITORS = [0, 1, 2].map(drawMonitors);
const TOOLBOX = drawToolbox(false);
const CAMERA = drawCamera(false);

export const SPRITES = {
  wall_back: sheet(240, 72, [drawBackWall()]),
  wall_left: sheet(112, 72, [drawLeftWall()]),
  floor: sheet(240, 112, [drawFloor()]),
  whiteboard: sheet(52, 34, [drawWhiteboard()]),
  pennant: sheet(20, 14, [drawPennant()]),
  map: sheet(26, 18, [drawMap(false), drawMap(true)]),
  plaque: sheet(13, 17, [drawPlaque()]),
  shelf: sheet(62, 32, [drawShelf()]),
  desk: sheet(68, 34, [drawDesk()]),
  laptop: sheet(46, 18, MONITORS),
  mug: sheet(6, 8, [drawMug(true), drawMug(false)]),
  pager: sheet(7, 7, [drawPager(false), drawPager(true)]),
  logbook: sheet(9, 12, [drawBinder(false), drawBinder(true)]),
  toolbox: sheet(14, 11, [TOOLBOX, drawToolbox(true)]),
  keys: sheet(8, 10, [drawKeys(false), drawKeys(true)]),
  camera: sheet(14, 10, [CAMERA, drawCamera(true)]),
  mailbox: sheet(22, 50, [drawDoor(false), drawDoor(true)]),
  rack: sheet(16, 28, [drawRack(0), drawRack(1)]),
  sofa: sheet(52, 22, [drawSofa()]),
  plant: sheet(12, 34, [drawPlant(0), drawPlant(1)]),
  pendant: sheet(9, 11, [drawPendant()]),
  rug: sheet(120, 24, [drawRug()]),

  tim_idle_down: sheet(24, 36, [timFrame('down'), timFrame('down', 'stand', 'down', 1)]),
  tim_walk_down: sheet(24, 36, ['stand', 'stepL', 'stand', 'stepR'].map((l, i) => timFrame('down', l, 'down', i % 2))),
  tim_walk_up: sheet(24, 36, ['stand', 'stepL', 'stand', 'stepR'].map((l, i) => timFrame('up', l, 'down', i % 2))),
  tim_walk_left: sheet(24, 36, walkSide),
  tim_walk_right: sheet(24, 36, walkSide.map(mirror)),
  tim_use: sheet(24, 36, [timFrame('up', 'stand', 'use0'), timFrame('up', 'stand', 'use1')]),
  tim_wave: sheet(24, 36, [timFrame('down', 'stand', 'wave0'), timFrame('down', 'stand', 'wave1')]),

  icon_pennant: icon((g) => { box(g, 0, 1, 16, 13, 'p', '8'); for (let y = 0; y < 9; y++) rect(g, 2, 3 + y, Math.max(1, Math.round(12 * (1 - Math.abs(y - 4) / 5))), 1, 'a'); [[4, 6], [6, 6], [7, 7], [9, 7]].forEach(([x, y]) => px(g, x, y, 'y')); }),
  icon_map: icon((g) => { box(g, 0, 2, 16, 12, '9', '8'); rect(g, 1, 3, 14, 10, 'p'); [[3, 5], [5, 7], [7, 6], [9, 9], [11, 8]].forEach(([x, y]) => px(g, x, y, 'r')); rect(g, 2, 4, 2, 2, 'K'); rect(g, 12, 9, 2, 2, 'K'); }),
  icon_whiteboard: icon((g) => { box(g, 0, 1, 16, 12, '9', 'l'); rect(g, 2, 4, 6, 1, 'a'); rect(g, 2, 7, 5, 1, 'R'); [[10, 3], [12, 5], [14, 2]].forEach(([x, h]) => rect(g, x - 1, 11 - h, 1, h, 'E')); rect(g, 2, 13, 12, 2, 'l'); }),
  icon_laptop: icon((g) => { box(g, 0, 3, 7, 7, 'N', '8'); box(g, 9, 3, 7, 7, 'N', '8'); rect(g, 2, 5, 3, 1, 'e'); rect(g, 2, 7, 2, 1, 'u'); rect(g, 11, 6, 1, 3, 'e'); rect(g, 13, 5, 1, 4, 'y'); rect(g, 3, 10, 1, 2, '8'); rect(g, 12, 10, 1, 2, '8'); rect(g, 1, 12, 14, 2, '8'); }),
  icon_pager: icon((g) => { box(g, 2, 5, 12, 9, '8'); rect(g, 4, 7, 8, 3, 'e'); rect(g, 6, 2, 4, 3, 'x'); }),
  icon_logbook: icon((g) => { box(g, 3, 1, 10, 14, 'a', '8'); rect(g, 5, 3, 6, 4, 'p'); rect(g, 6, 4, 4, 1, 'K'); px(g, 7, 11, 'l'); px(g, 8, 11, 'l'); }),
  icon_toolbox: icon((g) => fit(TOOLBOX, g, 1, 3)),
  icon_plaque: icon((g) => { box(g, 2, 0, 12, 11, '9', '8'); rect(g, 3, 1, 10, 9, ']'); rect(g, 3, 7, 10, 3, '6'); [[5, 'g'], [8, 'r'], [11, 'a']].forEach(([x, c]) => { px(g, x, 3, 'H'); px(g, x, 4, 's'); rect(g, x, 5, 1, 3, c); }); rect(g, 3, 12, 10, 3, 'b'); rect(g, 4, 13, 8, 1, 'y'); }),
  icon_keys: icon((g) => { rect(g, 7, 0, 2, 3, 'l'); box(g, 4, 3, 8, 7, 'm', 'C'); px(g, 7, 6, 'r'); rect(g, 7, 10, 2, 5, 'l'); px(g, 9, 13, 'l'); px(g, 9, 11, 'l'); }),
  icon_camera: icon((g) => fit(CAMERA, g, 1, 3)),
  icon_rack: icon((g) => { box(g, 2, 0, 12, 16, 'c', '8'); [2, 6, 10].forEach((y) => { box(g, 3, y, 10, 3, 'C', '8'); rect(g, 4, y + 1, 4, 1, 'm'); px(g, 10, y + 1, 'e'); px(g, 11, y + 1, y === 6 ? 'y' : 'E'); }); }),
  icon_mailbox: icon((g) => { box(g, 3, 0, 10, 16, '6', '5'); rect(g, 6, 1, 1, 15, '7'); rect(g, 5, 4, 6, 3, 'r'); rect(g, 6, 5, 4, 1, '9'); rect(g, 10, 9, 2, 1, '8'); }),
};
// window_<phase> and window_<phase>_rain (no rain under the aurora), two frames each
for (const phase of SKY_PHASES) {
  SPRITES[`window_${phase}`] = sheet(WINDOW.w, WINDOW.h, [drawWindow(phase, 0), drawWindow(phase, 1)]);
  if (phase !== 'aurora') SPRITES[`window_${phase}_rain`] = sheet(WINDOW.w, WINDOW.h, [drawWindow(phase, 0, true), drawWindow(phase, 1, true)]);
}

for (const k of EMOTES) SPRITES[`emote_${k}`] = emote(EMOTE_ART[k]);

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
