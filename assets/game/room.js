// Pixel room homepage: builds the room once JS runs. If anything throws, the static
// fallback (intro + story link) stays on screen instead of a blank page.
import { SPRITES, WINDOW as WIN, paintSprite } from './sprites.js';
import { OBJECTS, DECOR, ROOM } from './objects.js';
import { fitScale, buildGrid, findPath, nextWalkId, walkSpeed, NATIVE_W, NATIVE_H } from './grid.js';
import { PANELS } from './panels.js';
import { createFoundState } from './state.js';
import { KEY_DIRS, KONAMI, nextCell, objectInReach, createSequence } from './controls.js';
import { skyNow } from './sky.js';
import { createIncidentPanel } from './incident.js';
import { createMigrationPanel } from './migration.js';

// ---------- panels: content comes from the story page, never duplicated here ----------
let storyPromise = null;
function loadStory() {
  storyPromise ??= fetch('/story/')
    .then((r) => { if (!r.ok) throw new Error(`story ${r.status}`); return r.text(); })
    .then((html) => new DOMParser().parseFromString(html, 'text/html'))
    .catch((err) => { storyPromise = null; throw err; });
  return storyPromise;
}

// Clones the picked story nodes, fixing ../assets paths and dropping scroll-reveal hooks.
function panelContent(story, id) {
  const frag = doc.createDocumentFragment();
  for (const sel of PANELS[id].pick) {
    const node = story.querySelector(sel);
    if (!node) continue;
    const clone = doc.importNode(node, true);
    for (const el of [clone, ...clone.querySelectorAll('*')]) {
      el.classList?.remove('reveal');
      el.removeAttribute?.('id');
      for (const attr of ['src', 'href']) {
        const v = el.getAttribute?.(attr);
        if (v && v.startsWith('../')) el.setAttribute(attr, v.slice(3));
      }
    }
    clone.querySelectorAll('.section-label').forEach((n) => n.remove());
    frag.append(clone);
  }
  return frag;
}

// Panels open non-modally so the HUD (resume, contact, story mode) stays usable.
// The room behind is made inert, a scrim dims it, Esc closes, and Tab stays inside the panel.
function createPanels(scene) {
  const dialog = doc.getElementById('panel');
  const game = doc.getElementById('game');
  const scrim = doc.createElement('div');
  scrim.className = 'scrim';
  scrim.hidden = true;
  doc.body.append(scrim);
  let opener = null;
  let token = 0;       // bumps on every open/close so stale async work can tell it lost
  let state = 'closed';

  const focusables = () => [...dialog.querySelectorAll('a[href], button, summary, [tabindex="0"], input, select, textarea')]
    .filter((el) => !el.closest('[hidden]') && el.getClientRects().length);
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); closePanel(); return; }
    if (e.key !== 'Tab') return;
    const f = focusables();
    if (!f.length) { e.preventDefault(); return; }
    const first = f[0], last = f.at(-1);
    const title = dialog.querySelector('#panel-title');
    const inside = dialog.contains(doc.activeElement);
    const atStart = doc.activeElement === first || doc.activeElement === title;
    if (e.shiftKey && (atStart || !inside)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (doc.activeElement === last || !inside)) { e.preventDefault(); first.focus(); }
  };

  // Runs synchronously when a panel closes (the native close event is async, so a panel
  // replaced by another must not let the old close event tear down the new one).
  const teardown = ({ restoreFocus = true } = {}) => {
    if (state === 'closed') return;
    state = 'closed';
    token++;
    doc.removeEventListener('keydown', onKey);
    game.inert = false;
    scrim.hidden = true;
    doc.documentElement.classList.remove('panel-open');
    dialog.replaceChildren();
    scene.onPanelChange?.();
    if (restoreFocus && opener && opener.isConnected) opener.focus();
    if (restoreFocus) scene.onPanelClosed?.();
  };
  dialog.addEventListener('close', () => { if (!dialog.open) teardown(); });
  const closePanel = () => { teardown(); if (dialog.open) dialog.close(); };
  scrim.onclick = closePanel;

  const show = () => {
    state = 'open';
    token++;
    scene.onPanelChange?.();
    game.inert = true;
    scrim.hidden = false;
    doc.documentElement.classList.add('panel-open');
    dialog.show();
    doc.addEventListener('keydown', onKey);
  };

  return {
    isOpen: () => state === 'open',
    // replace: close whatever is open first (used by the HUD so contact always works).
    async open(id, from, { replace = false } = {}) {
      if (state === 'open') {
        if (!replace) return;
        teardown({ restoreFocus: false });
        if (dialog.open) dialog.close();
      }
      opener = from || doc.activeElement;
      const p = PANELS[id] ?? scene.extraPanels?.[id];
      const head = doc.createElement('header');
      head.className = 'panel-head';
      head.innerHTML = `<h2 id="panel-title" tabindex="-1"></h2><button type="button" class="panel-close" aria-label="Close">×</button>`;
      head.querySelector('h2').textContent = p.title;
      head.querySelector('.panel-close').addEventListener('click', closePanel);
      const body = doc.createElement('div');
      body.className = 'panel-body';
      body.innerHTML = '<p class="panel-loading">Loading…</p>';
      dialog.replaceChildren(head, body);
      dialog.dataset.object = id;
      show();
      const mine = token;
      head.querySelector('h2').focus();
      if (p.render) { // game panels (the pager mini-game) build their own content
        p.render(body, { alive: () => mine === token, reduced: reducedMotion() });
        scene.onPanelOpened?.(id);
        return;
      }
      try {
        const story = await loadStory();
        if (mine !== token) return; // closed or replaced while loading
        body.replaceChildren(panelContent(story, id));
        scene.decoratePanel?.(id, body);
      } catch {
        if (mine !== token) return;
        body.innerHTML = id === 'mailbox'
          ? `<p>Email me at <a href="mailto:tim.muangkeo@gmail.com">tim.muangkeo@gmail.com</a>, or find me on <a href="https://www.linkedin.com/in/ttmuangkeo" rel="noopener">LinkedIn</a>.</p><p><a href="assets/Tim_Muangkeo_Resume.pdf" download>Download my resume</a></p>`
          : `<p>Couldn't load this part. <a href="/story/${p.story}">Read it in story mode →</a></p>`;
      }
      scene.onPanelOpened?.(id);
    },
    close: closePanel,
  };
}

// HUD counter, found sparkles, and the one-time "you found everything" moment.
function createProgress(scene) {
  let storage;
  try { storage = localStorage; } catch { storage = undefined; }
  const found = createFoundState(storage);
  const counter = doc.querySelector('.hud-found');
  const render = () => {
    if (counter) {
      counter.hidden = false;
      counter.querySelector('.hud-count').textContent = String(found.count());
      const total = counter.querySelector('.hud-total');
      if (total) total.textContent = String(OBJECTS.length);
    }
    for (const b of scene.buttons) b.classList.toggle('is-found', found.isFound(b.dataset.object));
    scene.onProgress?.(found);
  };
  render();
  return {
    found,
    mark(id) {
      const first = found.markFound(id);
      render();
      return first && found.allFound();
    },
  };
}

// Phone object tray: one big icon button per object, working exactly like tapping the object.
function buildTray(scene) {
  const tray = doc.getElementById('tray');
  const head = doc.createElement('p');
  head.className = 'tray-head';
  head.innerHTML = `Tap something · Found <span class="tray-count">0</span>/${OBJECTS.length}`;
  const grid = doc.createElement('div');
  grid.className = 'tray-grid';
  const buttons = OBJECTS.map((o) => {
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = 'tray-btn';
    b.dataset.object = o.id;
    b.setAttribute('aria-label', o.ariaLabel);
    const icon = spriteCanvas(`icon_${o.id}`);
    const label = doc.createElement('span');
    label.textContent = o.label;
    b.append(icon, label);
    b.addEventListener('click', () => scene.activate(o.id, b));
    grid.append(b);
    return b;
  });
  tray.replaceChildren(head, grid);
  return {
    render(found) {
      head.querySelector('.tray-count').textContent = String(found.count());
      for (const b of buttons) b.classList.toggle('is-found', found.isFound(b.dataset.object));
    },
  };
}

// On phones the HUD collapses to name + Resume + a menu holding Get in touch / Story mode.
function setupHudMenu() {
  const hud = doc.querySelector('.hud');
  const actions = hud?.querySelector('.hud-actions');
  if (!hud || !actions) return;
  const btn = doc.createElement('button');
  btn.type = 'button';
  btn.className = 'hud-menu';
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-label', 'More links');
  btn.textContent = '☰';
  btn.addEventListener('click', () => {
    const open = btn.getAttribute('aria-expanded') !== 'true';
    btn.setAttribute('aria-expanded', String(open));
    hud.classList.toggle('hud-open', open);
  });
  hud.append(btn);
  actions.addEventListener('click', (e) => {
    if (e.target.closest('a')) { btn.setAttribute('aria-expanded', 'false'); hud.classList.remove('hud-open'); }
  });
}

function showBubble(room, scene, html, { x, y, actions = [] } = {}) {
  room.querySelector('.bubble')?.remove();
  const b = doc.createElement('div');
  b.className = 'bubble';
  b.setAttribute('role', 'status');
  b.innerHTML = `<p>${html}</p>`;
  b.addEventListener('click', (e) => e.stopPropagation()); // don't send Tim walking
  if (actions.length) {
    const row = doc.createElement('p');
    row.className = 'bubble-actions';
    for (const a of actions) row.append(a);
    b.append(row);
  }
  place(b, x, y, 0, 0);
  b.style.zIndex = '600';
  room.append(b);
  return b;
}

const doc = document;
const PHONE_QUERY = '(max-width: 640px), (orientation: portrait) and (max-width: 900px)';
const USE_MS = 700;
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cellFeet = ({ col, row }) => ({ x: col * ROOM.cell + ROOM.cell / 2, y: row * ROOM.cell + ROOM.cell - 1 });

// ---------- mini Tim ----------
function createTim(room) {
  const sheets = {};
  for (const key of ['tim_idle_down', 'tim_walk_down', 'tim_walk_up', 'tim_walk_left', 'tim_walk_right', 'tim_use', 'tim_wave']) {
    sheets[key] = SPRITES[key].frames.map((f) => paintSprite(f));
  }
  const el = doc.createElement('div');
  el.className = 'tim';
  el.setAttribute('aria-hidden', 'true');
  const canvas = doc.createElement('canvas');
  canvas.width = 10; canvas.height = 20; canvas.className = 'px';
  el.append(canvas);
  room.append(el);
  const ctx = canvas.getContext('2d');
  const grid = buildGrid(ROOM.cols, ROOM.rows, ROOM.blocked, ROOM.floorTopRow);

  const tim = {
    el, grid,
    pos: cellFeet(ROOM.start),
    walkId: 0,
    walking: false,
    pose: 'idle',
    lastAction: performance.now(),
    show(sheet, i = 0) {
      tim.pose = sheet === 'tim_idle_down' ? 'idle' : sheet;
      const frames = sheets[sheet];
      ctx.clearRect(0, 0, 10, 20);
      ctx.drawImage(frames[i % frames.length], 0, 0);
    },
    moveTo(x, y) {
      tim.pos = { x, y };
      place(el, x - 5, y - 19, 10, 20);
    },
    cell() {
      return { col: Math.floor(tim.pos.x / ROOM.cell), row: Math.floor(tim.pos.y / ROOM.cell) };
    },
    stride: 0, // distance walked so far, so chained one-cell steps keep cycling the walk frames
    // Walks to a cell. Resolves true on arrival, false if a newer walk took over.
    // settle: false keeps the walk pose at the end (keyboard steps chain into the next one).
    async walkTo(target, { settle = true } = {}) {
      const id = (tim.walkId = nextWalkId(tim.walkId));
      tim.lastAction = performance.now();
      tim.walking = true;
      try { return await tim.walkPath(id, target, settle); } finally { if (id === tim.walkId) tim.walking = false; }
    },
    async walkPath(id, target, settle) {
      const path = findPath(grid, tim.cell(), target);
      if (!path.length) return tim.cell().col === target.col && tim.cell().row === target.row;
      if (reducedMotion() && path.length === 1) { // a single keyboard step: move, no fade
        const end = cellFeet(target);
        tim.moveTo(end.x, end.y);
        await sleep(90);
        return id === tim.walkId;
      }
      if (reducedMotion()) {
        el.style.opacity = '0';
        await sleep(120);
        if (id !== tim.walkId) return false;
        const end = cellFeet(target);
        tim.moveTo(end.x, end.y);
        el.style.opacity = '1';
        return true;
      }
      const speed = walkSpeed(path.length * ROOM.cell);
      let travelled = 0;
      for (const step of path) {
        const goal = cellFeet(step);
        const dx = goal.x - tim.pos.x, dy = goal.y - tim.pos.y;
        const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
        const start = { ...tim.pos };
        const dist = Math.hypot(dx, dy);
        let t0 = null;
        await new Promise((resolve) => {
          const tick = (now) => {
            if (id !== tim.walkId) return resolve();
            if (t0 === null) t0 = now;
            const k = Math.min(1, ((now - t0) / 1000) * speed / dist);
            tim.moveTo(start.x + dx * k, start.y + dy * k);
            tim.show(`tim_walk_${dir}`, Math.floor((tim.stride + travelled + dist * k) / 4));
            if (k < 1) requestAnimationFrame(tick); else resolve();
          };
          requestAnimationFrame(tick);
        });
        if (id !== tim.walkId) { tim.stride += travelled; return false; }
        travelled += dist;
      }
      tim.stride += travelled;
      if (settle) tim.show('tim_idle_down');
      return true;
    },
  };
  // A friendly wave (a still wave pose under reduced motion).
  tim.wave = async () => {
    if (reducedMotion()) { tim.show('tim_wave', 0); await sleep(1200); tim.show('tim_idle_down'); return; }
    for (let i = 0; i < 6; i++) { if (tim.walking) return; tim.show('tim_wave', i); await sleep(200); }
    if (!tim.walking) tim.show('tim_idle_down');
  };
  tim.moveTo(tim.pos.x, tim.pos.y);
  tim.show('tim_idle_down');
  return tim;
}

// Walks Tim to an object and plays its use animation. Resolves true if he got there.
async function useObject(tim, scene, id) {
  const o = OBJECTS.find((obj) => obj.id === id);
  const arrived = await tim.walkTo(o.useSpot);
  if (!arrived) return false;
  const walk = tim.walkId;               // any newer walk or panel change bumps this
  const stillMine = () => walk === tim.walkId;
  const btn = scene.buttons.find((b) => b.dataset.object === id);
  const setObjFrame = (i) => paintFrame(btn, SPRITES[o.sprite], i);
  const pose = { left: 'tim_walk_left', right: 'tim_walk_right' }[o.face] ?? 'tim_use';
  if (reducedMotion()) {
    tim.show(pose);
    return stillMine();
  }
  if (o.anim === 'photo') {
    const flash = doc.createElement('div');
    flash.className = 'flash';
    place(flash, 0, 0, NATIVE_W, NATIVE_H);
    flash.style.zIndex = '700';
    btn.parentElement.append(flash);
    setTimeout(() => flash.remove(), 120);
  }
  const steps = 4;
  for (let i = 0; i < steps; i++) {
    tim.show(pose, i);
    setObjFrame(i % 2);
    await sleep(USE_MS / steps);
    if (!stillMine()) { setObjFrame(0); return false; }
  }
  setObjFrame(0);
  tim.show(pose, 0);
  return stillMine();
}

// Absolutely positions an element in native room pixels; CSS multiplies by --s.
function place(el, x, y, w, h) {
  el.style.setProperty('--x', x);
  el.style.setProperty('--y', y);
  el.style.setProperty('--w', w);
  el.style.setProperty('--h', h);
  el.style.zIndex = String(10 + y + h); // deeper on screen = drawn in front
}

// Redraws an object button's sprite at a given frame (idle blinks, use animations).
function paintFrame(btn, sprite, i) {
  const canvas = btn?.querySelector('canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(paintSprite(sprite.frames[Math.min(i, sprite.frames.length - 1)]), 0, 0);
}

function spriteCanvas(key, frame = 0) {
  const c = paintSprite(SPRITES[key].frames[frame]);
  c.className = 'px';
  c.setAttribute('aria-hidden', 'true');
  return c;
}

function buildRoom(room) {
  const backdrop = spriteCanvas('room');
  backdrop.classList.add('layer');
  place(backdrop, 0, 0, NATIVE_W, NATIVE_H);
  backdrop.style.zIndex = '0';
  room.append(backdrop);

  const decor = {};
  for (const d of DECOR) {
    const s = SPRITES[d.sprite];
    const c = spriteCanvas(d.sprite);
    c.classList.add('layer');
    place(c, d.x, d.y, s.w, s.h);
    if (d.flat) c.style.zIndex = '1';
    room.append(c);
    decor[d.sprite] = c;
  }

  const tip = doc.createElement('div');
  tip.className = 'tip';
  tip.hidden = true;
  room.append(tip);

  // The one tooltip, shown above an object, the window, or Tim.
  const tipAt = (x, y, text) => {
    tip.textContent = text;
    place(tip, x, Math.max(2, y), 0, 0);
    tip.style.zIndex = '500';
    tip.hidden = false;
  };
  const tipFor = (o, text = o.label) => tipAt(o.x + SPRITES[o.sprite].w / 2, o.y - 7, text);
  const hide = () => { tip.hidden = true; };

  const buttons = OBJECTS.map((o) => {
    const s = SPRITES[o.sprite];
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = 'obj';
    b.dataset.object = o.id;
    b.setAttribute('aria-label', o.ariaLabel);
    b.append(spriteCanvas(o.sprite));
    place(b, o.x, o.y, s.w, s.h);
    const show = () => tipFor(o);
    b.addEventListener('pointerenter', show);
    b.addEventListener('focus', show);
    b.addEventListener('pointerleave', hide);
    b.addEventListener('blur', hide);
    room.append(b);
    return b;
  });
  return { buttons, tip, decor, tipAt, tipFor, hideTip: hide };
}

// ---------- the whiteboard: the four headline numbers, read from the story page ----------
// Desktop only (CSS hides it on phones). aria-hidden: the whiteboard's panel says the same thing.
// If the story can't load, the board keeps its sketched lines and nothing is shown.
function createBoard(scene) {
  const btn = scene.buttons.find((b) => b.dataset.object === 'whiteboard');
  if (!btn) return;
  loadStory().then((story) => {
    const lines = [...story.querySelectorAll('#features .numbers li[data-board]')].map((li) => li.dataset.board.trim()).filter(Boolean);
    if (!lines.length) return;
    const board = doc.createElement('span');
    board.className = 'board-overlay';
    board.setAttribute('aria-hidden', 'true');
    const title = doc.createElement('span');
    title.className = 'board-title';
    title.textContent = 'By the numbers';
    board.append(title, ...lines.slice(0, 4).map((text) => {
      const line = doc.createElement('span');
      line.className = 'board-line';
      line.textContent = text;
      return line;
    }));
    btn.append(board);
  }).catch(() => {});
}

// ---------- the window: Seattle's real time of day, rain now and then, a secret aurora ----------
function createWindow(room, scene) {
  const canvas = doc.createElement('canvas');
  canvas.width = WIN.w; canvas.height = WIN.h;
  canvas.className = 'px layer';
  canvas.setAttribute('aria-hidden', 'true');
  place(canvas, WIN.x, WIN.y, WIN.w, WIN.h);
  canvas.style.zIndex = '1';
  room.append(canvas);
  // Pointer-only hit area: hover shows Seattle's time; five quick taps call up the aurora
  // (keyboard visitors get the same secret with the Konami code).
  const hit = doc.createElement('div');
  hit.className = 'win';
  hit.setAttribute('aria-hidden', 'true');
  place(hit, WIN.x, WIN.y, WIN.w, WIN.h);
  hit.style.zIndex = '2';
  room.append(hit);

  const cache = {};
  const frames = (key) => (cache[key] ??= SPRITES[key].frames.map((f) => paintSprite(f)));
  let now = skyNow();
  let auroraUntil = 0;
  let frame = 0;
  const key = () => (Date.now() < auroraUntil ? 'window_aurora' : `window_${now.phase}${now.rain ? '_rain' : ''}`);
  const draw = () => {
    const k = key();
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, WIN.w, WIN.h);
    ctx.drawImage(frames(k)[frame % 2], 0, 0);
    room.dataset.sky = k.replace('window_', '');
  };
  const text = () => (Date.now() < auroraUntil ? 'Northern lights · just like home' : now.text);
  hit.addEventListener('pointerenter', () => scene.tipAt(WIN.x + WIN.w / 2, WIN.y - 7, text()));
  hit.addEventListener('pointerleave', scene.hideTip);
  let taps = 0, lastTap = 0;
  hit.addEventListener('click', (e) => {
    e.stopPropagation(); // the wall isn't floor: don't send Tim walking
    const t = performance.now();
    taps = t - lastTap < 1500 ? taps + 1 : 1;
    lastTap = t;
    if (taps >= 5) { taps = 0; sky.aurora(); }
  });
  setInterval(() => { if (!document.hidden) { now = skyNow(); draw(); } }, 60_000);

  const sky = {
    tick(t) { frame = t; draw(); },
    aurora() {
      auroraUntil = Date.now() + 60_000;
      frame = 0;
      draw();
      scene.hideTip();
      const b = showBubble(room, scene, 'Northern lights! Just like back home in Alaska.', { x: NATIVE_W / 2, y: 4 });
      b.classList.add('bubble--top');
      setTimeout(() => b.remove(), 5000);
      scene.tim.wave();
      setTimeout(draw, 60_100);
    },
  };
  draw();
  return sky;
}

// ---------- keyboard play: arrows/WASD walk, E uses whatever Tim is next to ----------
function setupKeyboard(scene) {
  const { tim } = scene;
  const held = []; // directions in press order; the latest one wins
  let stepping = false;
  const konami = createSequence(KONAMI);
  const reachable = () => objectInReach(tim.cell(), OBJECTS);
  const hint = () => {
    const o = reachable();
    if (o) scene.tipFor(o, `E · ${o.label}`); else scene.hideTip();
  };
  const run = async () => {
    if (stepping) return;
    stepping = true;
    let facingWall = false;
    try {
      while (held.length && !scene.panels.isOpen()) {
        const dir = held.at(-1);
        const next = nextCell(tim.cell(), dir);
        if (!tim.grid.walkable(next.col, next.row)) { tim.show(`tim_walk_${dir}`, 0); facingWall = true; break; }
        if (!(await tim.walkTo(next, { settle: false }))) break;
        hint();
      }
    } finally {
      stepping = false;
      if (!tim.walking && !facingWall) tim.show('tim_idle_down');
    }
  };
  addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || scene.panels.isOpen()) return;
    if (e.target.closest?.('input, textarea, select, [contenteditable]')) return;
    if (!e.repeat && konami(e.key)) scene.sky.aurora();
    const dir = KEY_DIRS[e.key];
    if (dir) {
      e.preventDefault(); // arrows would scroll the page
      if (!held.includes(dir)) held.push(dir);
      run();
      return;
    }
    if ((e.key === 'e' || e.key === 'E') && !e.repeat) {
      const o = reachable();
      if (o) {
        e.preventDefault();
        scene.hideTip();
        scene.activate(o.id, scene.buttons.find((b) => b.dataset.object === o.id));
      } else {
        scene.tipAt(tim.pos.x, tim.pos.y - 24, 'Walk up to something first');
        setTimeout(scene.hideTip, 1400);
      }
    }
  });
  addEventListener('keyup', (e) => {
    const i = held.indexOf(KEY_DIRS[e.key]);
    if (i >= 0) held.splice(i, 1);
  });
  addEventListener('blur', () => { held.length = 0; });
}

// ---------- the pager goes off once per visit and invites a triage run ----------
const PAGE_AFTER_MS = 15_000;
// The desktop pager bubble sits just above the pager on the desk.
const pagerTipX = () => { const o = OBJECTS.find((obj) => obj.id === 'pager'); return o.x + SPRITES.pager.w / 2; };
function setupPager(room, scene) {
  const btn = scene.buttons.find((b) => b.dataset.object === 'pager');
  const canvas = btn.querySelector('canvas');
  const frames = SPRITES.pager.frames.map((f) => paintSprite(f));
  let session;
  try { session = sessionStorage; } catch { session = undefined; }
  let buzzing = false;
  const draw = (i) => { const c = canvas.getContext('2d'); c.clearRect(0, 0, canvas.width, canvas.height); c.drawImage(frames[i], 0, 0); };
  const pager = {
    isBuzzing: () => buzzing,
    stop() {
      if (!buzzing) return;
      buzzing = false;
      btn.classList.remove('is-buzzing');
      draw(0);
      room.querySelector('.bubble--pager')?.remove();
    },
    buzz() {
      if (buzzing || scene.panels.isOpen()) return false;
      buzzing = true;
      try { session?.setItem('tim-room-paged', '1'); } catch { /* ignore */ }
      btn.classList.add('is-buzzing');
      draw(1);
      const go = doc.createElement('button');
      go.type = 'button'; go.className = 'bubble-btn bubble-btn--ink'; go.textContent = 'Triage it';
      go.addEventListener('click', () => { pager.stop(); scene.panels.open('incident', btn); });
      const later = doc.createElement('button');
      later.type = 'button'; later.className = 'bubble-btn'; later.textContent = 'Later';
      later.addEventListener('click', () => pager.stop());
      const phone = matchMedia(PHONE_QUERY).matches;
      const b = showBubble(room, scene, "Tim's pager is going off. Help him triage the ticket?",
        phone ? { x: NATIVE_W / 2, y: 4, actions: [go, later] } : { x: pagerTipX(), y: 52, actions: [go, later] });
      b.classList.add('bubble--pager');
      if (phone) b.classList.add('bubble--top');
      return true;
    },
    tick(t) { if (buzzing) draw(t % 2); },
  };
  let alreadyPaged = false;
  try { alreadyPaged = session?.getItem('tim-room-paged') === '1'; } catch { /* ignore */ }
  if (!alreadyPaged) {
    const attempt = () => { if (document.hidden || !pager.buzz()) setTimeout(attempt, 5000); };
    setTimeout(attempt, PAGE_AFTER_MS);
  }
  return pager;
}

function layout(room) {
  const hud = doc.querySelector('.hud');
  const hudH = hud ? hud.getBoundingClientRect().height : 0;
  doc.documentElement.style.setProperty('--hud-h', `${Math.ceil(hudH)}px`);
  const phone = matchMedia(PHONE_QUERY).matches;
  const vw = doc.documentElement.clientWidth;
  const s = fitScale(vw, innerHeight - 32, hudH, phone);
  room.style.setProperty('--s', s);
  doc.documentElement.classList.toggle('is-phone', phone);
}

export function init() {
  const room = doc.getElementById('room');
  try {
    if (!room) throw new Error('#room missing');
    const scene = buildRoom(room);
    const tim = createTim(room);
    scene.tim = tim;
    scene.use = (id) => useObject(tim, scene, id);
    scene.panels = createPanels(scene);
    const tray = buildTray(scene);
    scene.onProgress = (found) => tray.render(found);
    scene.progress = createProgress(scene);
    setupHudMenu();
    scene.sky = createWindow(room, scene);
    createBoard(scene);
    scene.pager = setupPager(room, scene);
    const pagerBtn = scene.buttons.find((b) => b.dataset.object === 'pager');
    const rackBtn = scene.buttons.find((b) => b.dataset.object === 'rack');
    scene.extraPanels = {
      incident: createIncidentPanel({ onContact: () => scene.panels.open('mailbox', pagerBtn, { replace: true }) }),
      rack: createMigrationPanel({ onContact: () => scene.panels.open('mailbox', rackBtn, { replace: true }) }),
    };
    // The pager's Incident log panel gets a way into both mini-games (triage, and the migration it describes).
    const callout = (html, label, panel, from) => {
      const box = doc.createElement('div');
      box.className = 'inc-callout';
      box.innerHTML = html;
      const go = doc.createElement('button');
      go.type = 'button'; go.className = 'bubble-btn bubble-btn--ink'; go.textContent = label;
      go.addEventListener('click', () => scene.panels.open(panel, from, { replace: true }));
      box.append(go);
      return box;
    };
    scene.decoratePanel = (id, body) => {
      if (id !== 'pager') return;
      body.prepend(
        callout('<p><strong>See it work.</strong> Run a simulated ticket through my Claude triage skill.</p>', '▶ Triage a ticket', 'incident', pagerBtn),
        callout('<p><strong>Run the migration.</strong> Move a mailbox from EWS to Microsoft Graph without the user noticing.</p>', '▶ Run the cutover', 'rack', rackBtn),
      );
    };
    setupKeyboard(scene);
    let pendingCelebration = false;
    scene.onPanelOpened = (id) => {
      if (id === 'pager' || id === 'incident') scene.pager.stop();
      pendingCelebration = scene.progress.mark(id) || pendingCelebration;
    };
    scene.onPanelClosed = () => {
      if (!pendingCelebration) return;
      pendingCelebration = false;
      const contact = doc.createElement('button');
      contact.type = 'button'; contact.className = 'bubble-btn bubble-btn--ink'; contact.textContent = 'Get in touch';
      contact.addEventListener('click', () => { room.querySelector('.bubble')?.remove(); scene.panels.open('mailbox', contact); });
      const resume = doc.createElement('a');
      resume.className = 'bubble-btn'; resume.href = 'assets/Tim_Muangkeo_Resume.pdf'; resume.setAttribute('download', '');
      resume.textContent = 'Download resume';
      const bubble = showBubble(room, scene, 'You found everything! Want to talk?', { x: NATIVE_W / 2, y: 4, actions: [contact, resume] });
      bubble.classList.add('bubble--top');
      contact.focus();
    };
    // Click an object: Tim walks over, uses it, then its panel opens.
    scene.activate = async (id, from) => {
      if (scene.panels.isOpen()) return;
      const arrived = await scene.use(id);
      if (arrived && !scene.panels.isOpen()) await scene.panels.open(id, from);
    };
    // Opening or closing any panel cancels a walk in progress, so no stale panel pops up later.
    scene.onPanelChange = () => { tim.walkId = nextWalkId(tim.walkId); };
    for (const b of scene.buttons) {
      b.addEventListener('click', (e) => { e.stopPropagation(); scene.activate(b.dataset.object, b); });
    }
    // HUD "Get in touch" opens the mailbox panel right away (the mailto link stays as the no-JS fallback).
    doc.querySelector('[data-hud="contact"]')?.addEventListener('click', (e) => {
      e.preventDefault();
      scene.panels.open('mailbox', e.currentTarget, { replace: true });
    });
    // Warm the story page in the background so the first panel opens instantly.
    (window.requestIdleCallback || ((f) => setTimeout(f, 1200)))(() => loadStory().catch(() => {}));

    // Welcome: Tim waves and says hi; the bubble goes away on the first interaction.
    const helloText = matchMedia(PHONE_QUERY).matches
      ? "Hey, I'm Tim — just a kid from Alaska. Tap around."
      : "Hey, I'm Tim — just a kid from Alaska. Walk with the arrow keys or WASD and press E to look at things, or just click around.";
    const hello = showBubble(room, scene, helloText,
      { x: tim.pos.x, y: tim.pos.y - 22 });
    hello.classList.add('bubble--hello');
    tim.wave();
    const dismiss = () => { hello.remove(); removeEventListener('pointerdown', dismiss); removeEventListener('keydown', dismiss); };
    addEventListener('pointerdown', dismiss);
    addEventListener('keydown', dismiss);

    // Idle life: breathing, steam off the mug, and an occasional wander. Paused when the
    // tab is hidden, a panel is open, Tim is busy, or the visitor prefers reduced motion.
    const steamFrames = SPRITES.mug.frames.map((f) => paintSprite(f));
    const mug = scene.decor.mug;
    const rackFrames = SPRITES.rack.frames.map((f) => paintSprite(f));
    const rackCanvas = rackBtn?.querySelector('canvas');
    const laptopBtn = scene.buttons.find((b) => b.dataset.object === 'laptop');
    const plantFrames = SPRITES.plant.frames.map((f) => paintSprite(f));
    const plant = scene.decor.plant;
    let tick = 0;
    setInterval(() => {
      if (document.hidden || reducedMotion() || scene.panels.isOpen()) return;
      tick++;
      scene.sky.tick(tick);
      scene.pager.tick(tick);
      if (rackCanvas) { const r = rackCanvas.getContext('2d'); r.clearRect(0, 0, rackCanvas.width, rackCanvas.height); r.drawImage(rackFrames[tick % 2], 0, 0); }
      if (mug) { const m = mug.getContext('2d'); m.clearRect(0, 0, mug.width, mug.height); m.drawImage(steamFrames[tick % 2], 0, 0); }
      if (tick % 2 === 0 && !tim.walking) paintFrame(laptopBtn, SPRITES.laptop, (tick / 2) % SPRITES.laptop.frames.length); // code scrolls, graphs move
      if (plant && tick % 3 === 0) { const p = plant.getContext('2d'); p.clearRect(0, 0, plant.width, plant.height); p.drawImage(plantFrames[(tick / 3) % 2], 0, 0); }
      if (tim.walking) return;
      if (tim.pose === 'idle') tim.show('tim_idle_down', tick % 2);
      if (performance.now() - tim.lastAction > 12000) {
        const spots = [];
        for (let r = ROOM.floorTopRow + 2; r < ROOM.rows; r++) for (let c = 0; c < ROOM.cols; c++) if (tim.grid.walkable(c, r)) spots.push({ col: c, row: r });
        tim.walkTo(spots[Math.floor(Math.random() * spots.length)]);
      }
    }, 600);
    room.addEventListener('click', (e) => { // floor click: just walk there
      const r = room.getBoundingClientRect();
      const s = r.width / NATIVE_W;
      const target = { col: Math.floor((e.clientX - r.left) / s / ROOM.cell), row: Math.floor((e.clientY - r.top) / s / ROOM.cell) };
      if (tim.grid.walkable(target.col, target.row)) tim.walkTo(target);
    });
    layout(room);
    addEventListener('resize', () => layout(room));
    doc.documentElement.classList.add('game-ready');
    return scene;
  } catch (err) {
    console.error('Pixel room failed to start; showing the fallback.', err);
    doc.documentElement.classList.remove('game-ready');
    if (room) room.replaceChildren();
    return null;
  }
}

init();
