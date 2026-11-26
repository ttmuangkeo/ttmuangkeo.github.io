// Pixel office homepage, rendered in 3D: builds the room once JS runs. If anything throws, the static
// fallback (intro + story link) stays on screen instead of a blank page.
import { SPRITES, paintSprite } from './sprites.js';
import { OBJECTS, ROOM, WINDOW_SPOT } from './objects.js';
import { nextWalkId } from './grid.js';
import { PANELS } from './panels.js';
import { createFoundState } from './state.js';
import { KEY_DIRS, KONAMI, PAD_KEYS, nextCell, objectInReach, createSequence, padDir } from './controls.js';
import { skyNow, lightFor } from './sky.js';
import { frameFor, quadTransform } from './view.js';
import { createWorld } from './world.js';
import { createTim } from './tim.js';
import { place } from './dom.js';
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

// A speech bubble anchored to a point in render pixels. `at` is re-read on every reproject,
// so bubbles follow their anchor through resizes and camera swings.
function showBubble(room, scene, html, { x, y, at, actions = [] } = {}) {
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
  b.anchor = at ?? (() => ({ x, y }));
  const p = b.anchor();
  place(b, p.x, p.y, 0, 0);
  b.style.zIndex = '600';
  room.append(b);
  requestAnimationFrame(() => keepInside(room, b)); // after the caller adds its placement class
  return b;
}

// Nudges a bubble back inside the room when its anchor would push it past an edge.
function keepInside(room, b) {
  if (!b.isConnected) return;
  b.style.translate = '';
  const r = room.getBoundingClientRect(), q = b.getBoundingClientRect();
  const dx = Math.max(0, r.left + 4 - q.left) - Math.max(0, q.right - (r.right - 4));
  const dy = Math.max(0, r.top + 4 - q.top) - Math.max(0, q.bottom - (r.bottom - 4));
  if (dx || dy) b.style.translate = `${dx}px ${dy}px`;
}

const doc = document;
const PHONE_QUERY = '(max-width: 640px), (orientation: portrait) and (max-width: 900px)';
const USE_MS = 700;
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const topCentre = (scene) => () => ({ x: scene.view.w / 2, y: 4 });

// Walks Tim to an object and plays its use animation. Resolves true if he got there.
async function useObject(tim, scene, id) {
  const o = OBJECTS.find((obj) => obj.id === id);
  const arrived = await tim.walkTo(o.useSpot);
  if (!arrived) return false;
  const walk = tim.walkId;               // any newer walk or panel change bumps this
  const stillMine = () => walk === tim.walkId;
  const setObjFrame = (i) => scene.world.setFrame(id, i);
  const pose = { left: 'tim_walk_left', right: 'tim_walk_right' }[o.face] ?? 'tim_use';
  if (reducedMotion()) {
    tim.show(pose);
    return stillMine();
  }
  if (o.anim === 'photo') {
    const flash = doc.createElement('div');
    flash.className = 'flash';
    place(flash, 0, 0, scene.view.w, scene.view.h);
    flash.style.zIndex = '700';
    scene.room.append(flash);
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

function spriteCanvas(key, frame = 0) {
  const c = paintSprite(SPRITES[key].frames[frame]);
  c.className = 'px';
  c.setAttribute('aria-hidden', 'true');
  return c;
}

// The HTML layer over the 3D room: one real button per object, laid over its prop,
// and the one tooltip. reproject() re-lays everything after any render.
function buildOverlay(room, world) {
  const tip = doc.createElement('div');
  tip.className = 'tip';
  tip.hidden = true;
  room.append(tip);
  let tipAnchor = null;

  const tipAt = (x, y, text) => {
    tip.textContent = text;
    tipAnchor = () => ({ x, y });
    place(tip, x, Math.max(2, y), 0, 0);
    tip.style.zIndex = '500';
    tip.hidden = false;
  };
  const topOf = (key) => { const r = world.rectOf(key); return { x: r.x + r.w / 2, y: r.y - 2 }; };
  const tipFor = (o, text = o.label) => {
    tip.textContent = text;
    tipAnchor = () => topOf(o.id);
    const p = tipAnchor();
    place(tip, p.x, Math.max(2, p.y), 0, 0);
    tip.style.zIndex = '500';
    tip.hidden = false;
  };
  const hide = () => { tip.hidden = true; tipAnchor = null; };

  const buttons = OBJECTS.map((o) => {
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = 'obj';
    b.dataset.object = o.id;
    b.setAttribute('aria-label', o.ariaLabel);
    // A button covers its prop's whole on-screen box (plus touch padding), which can overlap a
    // neighbour; under the pointer, the prop actually hit wins (keyboard focus uses the button's own).
    const pointed = (e) => OBJECTS.find((x) => x.id === world.pickObject(e.clientX, e.clientY)) ?? o;
    let shown = null;
    const show = (target) => { if (shown === target) return; shown = target; tipFor(target); world.highlight(target.id); };
    const off = () => { shown = null; hide(); world.highlight(null); };
    b.addEventListener('pointerenter', (e) => show(pointed(e)));
    b.addEventListener('pointermove', (e) => show(pointed(e)));
    // keyboard focus brings an off-screen prop into view; the camera goes back to Tim on blur
    b.addEventListener('focus', () => { if (b.matches(':focus-visible')) world.peek(world.anchorOf(o.id)); show(o); });
    b.addEventListener('pointerleave', off);
    b.addEventListener('blur', () => { world.peek(null); off(); });
    room.append(b);
    return b;
  });

  const extra = []; // other overlays that follow the world (window hit area, whiteboard numbers)
  const reproject = () => {
    let top = 0;
    for (const b of buttons) {
      const r = world.rectOf(b.dataset.object);
      place(b, r.x, r.y, r.w, r.h);
      top = Math.max(top, Number(b.style.zIndex));
    }
    // `above` lifts a button over every other object's padded hit area (the monitors over the pager)
    for (const b of buttons) {
      const o = OBJECTS.find((x) => x.id === b.dataset.object);
      if (o.above) b.style.zIndex = String(top + o.above);
    }
    if (tipAnchor && !tip.hidden) { const p = tipAnchor(); place(tip, p.x, Math.max(2, p.y), 0, 0); tip.style.zIndex = '500'; }
    for (const bub of room.querySelectorAll('.bubble')) { if (bub.anchor) { const p = bub.anchor(); place(bub, p.x, p.y, 0, 0); bub.style.zIndex = '600'; keepInside(room, bub); } }
    for (const f of extra) f();
  };
  world.onRender(reproject);
  return { buttons, tip, tipAt, tipFor, hideTip: hide, reproject, follow: (f) => extra.push(f) };
}

// ---------- the whiteboard: the four headline numbers, read from the story page ----------
// Desktop only (CSS hides it on phones). aria-hidden: the whiteboard's panel says the same thing.
// The overlay is laid out at the board's sprite size and pinned onto its projected face with a
// matrix3d, so it stays crisp HTML text. If the story can't load, the board keeps its sketch.
function createBoard(scene) {
  const btn = scene.buttons.find((b) => b.dataset.object === 'whiteboard');
  if (!btn) return;
  const { w: BW, h: BH } = SPRITES.whiteboard;
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
    const pin = () => {
      const s = scene.frame.scale;
      const r = scene.world.rectOf('whiteboard');
      const quad = scene.world.quadOf('whiteboard').map(([x, y]) => [(x - r.x) * s, (y - r.y) * s]);
      board.style.transform = quadTransform(BW * s, BH * s, quad);
    };
    scene.follow(pin);
    pin();
  }).catch(() => {});
}

// ---------- the window: Seattle's real time of day, rain now and then, a secret aurora ----------
function createWindow(room, scene) {
  const { world } = scene;
  // Pointer-only hit area: hover shows Seattle's time; five quick taps call up the aurora
  // (keyboard visitors get the same secret with the Konami code).
  const hit = doc.createElement('div');
  hit.className = 'win';
  hit.setAttribute('aria-hidden', 'true');
  room.append(hit);
  scene.follow(() => { const r = world.rectOf('window'); place(hit, r.x, r.y, r.w, r.h); hit.style.zIndex = '2'; });

  let now = skyNow();
  let auroraUntil = 0;
  let frame = 0;
  const aurora = () => Date.now() < auroraUntil;
  const key = () => (aurora() ? 'window_aurora' : `window_${now.phase}${now.rain ? '_rain' : ''}`);
  const draw = () => {
    const k = key();
    world.setSky(k, frame % 2);
    world.setLight(lightFor({ phase: now.phase, rain: now.rain && !aurora(), aurora: aurora() }));
    room.dataset.sky = k.replace('window_', '');
  };
  const text = () => (aurora() ? 'Northern lights · just like home' : now.text);
  hit.addEventListener('pointerenter', () => { const r = world.rectOf('window'); scene.tipAt(r.x + r.w / 2, r.y - 2, text()); });
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
    isRaining: () => now.rain && !aurora(),
    tick(t) { frame = t; draw(); },
    aurora() {
      auroraUntil = Date.now() + 60_000;
      frame = 0;
      draw();
      scene.hideTip();
      const b = showBubble(room, scene, 'Northern lights! Just like back home in Alaska.', { at: topCentre(scene) });
      b.classList.add('bubble--top');
      setTimeout(() => b.remove(), 5000);
      scene.tim.wave();
      setTimeout(draw, 60_100);
    },
  };
  draw();
  return sky;
}

// ---------- step-by-step play: arrows/WASD or the phone D-pad walk, E or A uses what Tim is next to ----------
// Both inputs share one walker, so holding a direction walks cell by cell either way.
function setupKeyboard(scene) {
  const { tim } = scene;
  const held = []; // directions in press order; the latest one wins
  let stepping = false;
  const konami = createSequence(KONAMI);
  const useKey = () => (matchMedia(PHONE_QUERY).matches ? 'A' : 'E');
  const reachable = () => objectInReach(tim.cell(), OBJECTS);
  const hint = () => {
    const o = reachable();
    if (o) scene.tipFor(o, `${useKey()} · ${o.label}`); else scene.hideTip();
  };
  const run = async () => {
    if (stepping) return;
    stepping = true;
    let facingWall = false;
    try {
      while (held.length && !scene.panels.isOpen()) {
        const dir = held.at(-1);
        const next = nextCell(tim.cell(), dir);
        if (!tim.grid.walkable(next.col, next.row)) { tim.face(dir); facingWall = true; break; }
        if (!(await tim.walkTo(next, { settle: false }))) break;
        hint();
      }
    } finally {
      stepping = false;
      if (!tim.walking && !facingWall) tim.show('tim_idle_down');
    }
  };
  const press = (dir) => {
    if (!held.includes(dir)) held.push(dir);
    run();
  };
  const release = (dir) => {
    const i = held.indexOf(dir);
    if (i >= 0) held.splice(i, 1);
  };
  // Uses whatever Tim is next to; returns false (with a nudge over his head) when nothing is.
  const use = () => {
    const o = reachable();
    if (o) {
      scene.hideTip();
      scene.activate(o.id, scene.buttons.find((b) => b.dataset.object === o.id));
      return true;
    }
    const h = scene.world.project(tim.headPoint());
    scene.tipAt(h.x, h.y, 'Walk up to something first');
    setTimeout(scene.hideTip, 1400);
    return false;
  };
  const secret = (key) => { if (konami(key)) scene.sky.aurora(); };
  addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || scene.panels.isOpen()) return;
    if (e.target.closest?.('input, textarea, select, [contenteditable]')) return;
    if (!e.repeat) secret(e.key);
    const dir = KEY_DIRS[e.key];
    if (dir) {
      e.preventDefault(); // arrows would scroll the page
      press(dir);
      return;
    }
    if ((e.key === 'e' || e.key === 'E') && !e.repeat && use()) e.preventDefault();
  });
  addEventListener('keyup', (e) => release(KEY_DIRS[e.key]));
  addEventListener('blur', () => { held.length = 0; });
  return { press, release, releaseAll: () => { held.length = 0; }, use, secret };
}

// ---------- phones: a handheld-style D-pad and A/B buttons under the room ----------
// The D-pad is one surface: the thumb can slide from one arm to another without lifting.
// A uses what Tim is next to, B makes him wave; both, with the pad, also enter the Konami code.
// Pointer-only (aria-hidden): the object tray below does the same job for screen readers.
function buildPad(scene, mover) {
  const pad = doc.createElement('div');
  pad.className = 'pad';
  pad.setAttribute('aria-hidden', 'true');
  pad.innerHTML = `
    <div class="pad-dpad">
      <span class="pad-arm pad-arm--up" data-dir="up"></span>
      <span class="pad-arm pad-arm--right" data-dir="right"></span>
      <span class="pad-arm pad-arm--down" data-dir="down"></span>
      <span class="pad-arm pad-arm--left" data-dir="left"></span>
      <span class="pad-hub"></span>
    </div>
    <p class="pad-hint"><b>A</b> look<br><b>B</b> wave</p>
    <div class="pad-ab">
      <button type="button" class="pad-btn pad-btn--b" tabindex="-1" data-btn="b">B</button>
      <button type="button" class="pad-btn pad-btn--a" tabindex="-1" data-btn="a">A</button>
    </div>`;
  const dpad = pad.querySelector('.pad-dpad');
  const buzz = () => { try { navigator.vibrate?.(8); } catch { /* not allowed */ } };
  let pointer = null, dir = null;
  const point = (next) => {
    if (next === dir) return;
    if (dir) mover.release(dir);
    dir = next;
    dpad.dataset.dir = dir ?? '';
    if (dir) { buzz(); mover.secret(PAD_KEYS[dir]); mover.press(dir); }
  };
  const aim = (e) => {
    const r = dpad.getBoundingClientRect();
    point(padDir(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2), r.width * 0.08));
  };
  dpad.addEventListener('pointerdown', (e) => {
    if (pointer !== null || scene.panels.isOpen()) return;
    e.preventDefault(); // no text selection, callout or double-tap zoom
    pointer = e.pointerId;
    dpad.setPointerCapture?.(e.pointerId);
    aim(e);
  });
  dpad.addEventListener('pointermove', (e) => { if (e.pointerId === pointer) aim(e); });
  const lift = (e) => { if (e.pointerId !== pointer) return; pointer = null; point(null); };
  dpad.addEventListener('pointerup', lift);
  dpad.addEventListener('pointercancel', lift);
  dpad.addEventListener('lostpointercapture', lift);
  addEventListener('blur', () => { pointer = null; point(null); mover.releaseAll(); });

  for (const b of pad.querySelectorAll('.pad-btn')) {
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (scene.panels.isOpen()) return;
      buzz();
      b.classList.add('is-down');
      mover.secret(b.dataset.btn);
      if (b.dataset.btn === 'a') mover.use(); else scene.tim.wave();
    });
    const up = () => b.classList.remove('is-down');
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('pointerleave', up);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  pad.addEventListener('contextmenu', (e) => e.preventDefault()); // long-press menus on the pad
  doc.getElementById('stage').after(pad);
  return pad;
}

// ---------- the pager goes off once per visit and invites a triage run ----------
const PAGE_AFTER_MS = 15_000;
function setupPager(room, scene) {
  const btn = scene.buttons.find((b) => b.dataset.object === 'pager');
  let session;
  try { session = sessionStorage; } catch { session = undefined; }
  let buzzing = false;
  const draw = (i) => scene.world.setFrame('pager', i);
  // On desktop the bubble hangs up and to the left of the pager, so it has the room's width to wrap in.
  const pagerCorner = () => { const r = scene.world.rectOf('pager'); return { x: r.x + r.w, y: r.y }; };
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
        { at: phone ? topCentre(scene) : pagerCorner, actions: [go, later] });
      b.classList.add('bubble--pager', phone ? 'bubble--top' : 'bubble--left');
      scene.onPagerBuzz?.();
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

// ---------- camera swing (desktop): right-drag or a sideways trackpad swipe; wheel scrolls out to the whole room ----------
// Never on phones (one finger always means walk/tap) and never while a panel is open.
// Four seconds after the last nudge the view eases back to the default (or snaps, under reduced motion).
const SWING_PER_PX = 0.25;
const SWING_RETURN_MS = 4000;
function setupSwing(room, scene) {
  const { world } = scene;
  const allowed = () => !matchMedia(PHONE_QUERY).matches && !scene.panels.isOpen();
  let drag = null, lastInput = 0, easing = 0;
  const nudged = () => { lastInput = performance.now(); scheduleReturn(); };
  room.addEventListener('contextmenu', (e) => e.preventDefault()); // only the room: right-click elsewhere stays normal
  room.addEventListener('pointerdown', (e) => {
    if (e.button !== 2 || !allowed()) return;
    drag = { x: e.clientX, from: world.swing(), id: e.pointerId };
    room.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  });
  room.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    world.setSwing(drag.from + (e.clientX - drag.x) * SWING_PER_PX);
    nudged();
  });
  const end = (e) => { if (drag && e.pointerId === drag.id) { drag = null; nudged(); } };
  room.addEventListener('pointerup', end);
  room.addEventListener('pointercancel', end);
  room.addEventListener('wheel', (e) => {
    if (!allowed()) return;
    e.preventDefault();
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) world.setSwing(world.swing() - e.deltaX * 0.1);
    else world.setZoom(world.zoom() + e.deltaY * 0.0025);
    nudged();
  }, { passive: false });
  function scheduleReturn() {
    if (easing) return;
    const step = (now) => {
      easing = 0;
      if (drag || (world.swing() === 0 && world.zoom() === 1)) return;
      if (now - lastInput < SWING_RETURN_MS) { easing = requestAnimationFrame(step); return; }
      if (reducedMotion()) { world.setSwing(0); world.setZoom(1); return; }
      const s = world.swing(), z = world.zoom();
      const d = Math.min(Math.abs(s), 60 / 30); // ~60°/s at 30 fps
      world.setSwing(Math.abs(s) <= d ? 0 : s - Math.sign(s) * d);
      world.setZoom(Math.abs(z - 1) <= 0.03 ? 1 : z - Math.sign(z - 1) * 0.03);
      easing = requestAnimationFrame(step);
    };
    easing = requestAnimationFrame(step);
  }
}

function currentFrame() {
  const hud = doc.querySelector('.hud');
  const hudH = hud ? hud.getBoundingClientRect().height : 0;
  doc.documentElement.style.setProperty('--hud-h', `${Math.ceil(hudH)}px`);
  const phone = matchMedia(PHONE_QUERY).matches;
  doc.documentElement.classList.toggle('is-phone', phone);
  return frameFor(doc.documentElement.clientWidth, innerHeight - 32, hudH, phone);
}

function layout(room, scene) {
  const f = currentFrame();
  scene.frame = f;
  scene.view = { w: f.renderW, h: f.renderH };
  room.style.setProperty('--s', f.scale);
  room.style.setProperty('--rw', f.renderW);
  room.style.setProperty('--rh', f.renderH);
  scene.world.resize(f);
  scene.world.renderNow();
}

export function init() {
  const room = doc.getElementById('room');
  try {
    if (!room) throw new Error('#room missing');
    const frame = currentFrame();
    const world = createWorld(room, frame);
    const scene = { room, world, frame, view: { w: frame.renderW, h: frame.renderH } };
    Object.assign(scene, buildOverlay(room, world));
    room.scene = scene; // for the browser tests
    const tim = createTim(world, room, { start: ROOM.start });
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
    scene.mover = setupKeyboard(scene);
    buildPad(scene, scene.mover);
    setupSwing(room, scene);
    // Emotes: alert when the pager goes off, a heart when everything is found (both also under
    // reduced motion, as still images); the rest are idle chatter in the idle loop below.
    scene.onPagerBuzz = () => tim.emote('alert', 2500);
    scene.onCelebrate = () => tim.emote('heart', 2500);
    scene.onWander = () => tim.emote('note', 1500);
    scene.onFloorWalk = (cell) => world.markFloor(cell);
    let lastInput = performance.now();
    const woke = () => { lastInput = performance.now(); tim.clearEmote('zzz'); };
    addEventListener('pointerdown', woke);
    addEventListener('keydown', woke);
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
      const bubble = showBubble(room, scene, 'You found everything! Want to talk?', { at: topCentre(scene), actions: [contact, resume] });
      bubble.classList.add('bubble--top');
      scene.onCelebrate?.();
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
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        // pointer clicks go to the prop under the pointer; keyboard clicks (detail 0) to the button's own object
        const id = (e.detail && world.pickObject(e.clientX, e.clientY)) || b.dataset.object;
        scene.activate(id, scene.buttons.find((x) => x.dataset.object === id) ?? b);
      });
    }
    // If the GPU drops the WebGL context and it doesn't come back, show the static page again.
    let lostTimer = 0;
    world.onContext((state) => {
      clearTimeout(lostTimer);
      if (state === 'lost') lostTimer = setTimeout(() => doc.documentElement.classList.remove('game-ready'), 4000);
      else doc.documentElement.classList.add('game-ready');
    });
    // HUD "Get in touch" opens the mailbox panel right away (the mailto link stays as the no-JS fallback).
    doc.querySelector('[data-hud="contact"]')?.addEventListener('click', (e) => {
      e.preventDefault();
      scene.panels.open('mailbox', e.currentTarget, { replace: true });
    });
    // Warm the story page in the background so the first panel opens instantly.
    (window.requestIdleCallback || ((f) => setTimeout(f, 1200)))(() => loadStory().catch(() => {}));

    layout(room, scene);
    addEventListener('resize', () => layout(room, scene));

    // Welcome: Tim waves and says hi; the bubble goes away on the first interaction.
    const helloText = matchMedia(PHONE_QUERY).matches
      ? "Hey, I'm Tim — just a kid from Alaska. Walk me around with the D-pad and press A to look at things."
      : "Hey, I'm Tim — just a kid from Alaska. Walk with the arrow keys or WASD and press E to look at things, or just click around.";
    // On phones the room is small, so the greeting hangs under Tim instead of over the desk.
    const phone = matchMedia(PHONE_QUERY).matches;
    const hello = showBubble(room, scene, helloText, { at: () => world.project(phone ? tim.feetPoint() : tim.headPoint()) });
    hello.classList.add('bubble--hello', ...(phone ? ['bubble--below'] : []));
    tim.wave();
    const dismiss = () => { hello.remove(); removeEventListener('pointerdown', dismiss); removeEventListener('keydown', dismiss); };
    addEventListener('pointerdown', dismiss);
    addEventListener('keydown', dismiss);

    // Idle life: breathing, steam off the mug, rack lights, scrolling monitors, a swaying plant
    // and an occasional wander. Paused when the tab is hidden, a panel is open, Tim is busy,
    // or the visitor prefers reduced motion.
    let tick = 0;
    setInterval(() => {
      if (document.hidden || reducedMotion() || scene.panels.isOpen()) return;
      tick++;
      scene.sky.tick(tick);
      scene.pager.tick(tick);
      world.setFrame('rack', tick % 2);
      world.setFrame('mug', tick % 2); // steam
      if (tick % 2 === 0 && !tim.walking) world.setFrame('laptop', tick / 2); // code scrolls, graphs move
      if (tick % 3 === 0) world.setFrame('plant', tick / 3);
      if (tim.walking) return;
      if (tim.pose === 'idle') tim.show('tim_idle_down', tick % 2);
      if (performance.now() - lastInput > 30_000) { if (!tim.emoting()) tim.emote('zzz', 600_000); return; } // dozing: no wandering
      if (!tim.emoting() && Math.random() < 0.01) tim.emote('dots', 1500); // about once a minute
      if (performance.now() - tim.lastAction > 12000) {
        scene.onWander?.();
        const spots = [];
        for (let r = 0; r < ROOM.rows; r++) for (let c = 0; c < ROOM.cols; c++) if (tim.grid.walkable(c, r)) spots.push({ col: c, row: r });
        const rainy = scene.sky.isRaining() && Math.random() < 1 / 3;
        if (rainy) tim.walkTo(WINDOW_SPOT).then((ok) => { if (ok) tim.face('up'); });
        else tim.walkTo(spots[Math.floor(Math.random() * spots.length)]);
      }
    }, 600);
    room.addEventListener('click', (e) => { // floor click: just walk there
      const target = world.pickFloor(e.clientX, e.clientY);
      if (target && tim.grid.walkable(target.col, target.row)) { scene.onFloorWalk?.(target); tim.walkTo(target); }
    });
    world.renderNow();
    doc.documentElement.classList.add('game-ready');
    performance.mark?.('room-ready');
    layout(room, scene); // the HUD may change height once the game is ready
    return scene;
  } catch (err) {
    console.error('Pixel room failed to start; showing the fallback.', err);
    doc.documentElement.classList.remove('game-ready');
    if (room) room.replaceChildren();
    return null;
  }
}

init();
