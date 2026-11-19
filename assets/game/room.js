// Pixel room homepage: builds the room once JS runs. If anything throws, the static
// fallback (intro + story link) stays on screen instead of a blank page.
import { SPRITES, paintSprite } from './sprites.js';
import { OBJECTS, DECOR, ROOM } from './objects.js';
import { fitScale, buildGrid, findPath, nextWalkId, walkSpeed, NATIVE_W, NATIVE_H } from './grid.js';

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
    show(sheet, i = 0) {
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
    // Walks to a cell. Resolves true on arrival, false if a newer walk took over.
    async walkTo(target) {
      const id = (tim.walkId = nextWalkId(tim.walkId));
      const path = findPath(grid, tim.cell(), target);
      if (!path.length) return tim.cell().col === target.col && tim.cell().row === target.row;
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
            tim.show(`tim_walk_${dir}`, Math.floor((travelled + dist * k) / 4));
            if (k < 1) requestAnimationFrame(tick); else resolve();
          };
          requestAnimationFrame(tick);
        });
        if (id !== tim.walkId) return false;
        travelled += dist;
      }
      tim.show('tim_idle_down');
      return true;
    },
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
  const btn = scene.buttons.find((b) => b.dataset.object === id);
  const sprite = SPRITES[o.sprite];
  const objCanvas = btn.querySelector('canvas');
  const setObjFrame = (i) => {
    const c = paintSprite(sprite.frames[Math.min(i, sprite.frames.length - 1)]);
    objCanvas.getContext('2d').clearRect(0, 0, objCanvas.width, objCanvas.height);
    objCanvas.getContext('2d').drawImage(c, 0, 0);
  };
  if (reducedMotion()) {
    tim.show(o.face === 'left' ? 'tim_walk_left' : 'tim_use');
    return true;
  }
  const steps = 4;
  for (let i = 0; i < steps; i++) {
    tim.show(o.face === 'left' ? 'tim_walk_left' : 'tim_use', i);
    setObjFrame(i % 2);
    await sleep(USE_MS / steps);
  }
  setObjFrame(0);
  tim.show(o.face === 'left' ? 'tim_walk_left' : 'tim_use', 0);
  return true;
}

// Absolutely positions an element in native room pixels; CSS multiplies by --s.
function place(el, x, y, w, h) {
  el.style.setProperty('--x', x);
  el.style.setProperty('--y', y);
  el.style.setProperty('--w', w);
  el.style.setProperty('--h', h);
  el.style.zIndex = String(10 + y + h); // deeper on screen = drawn in front
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

  for (const d of DECOR) {
    const s = SPRITES[d.sprite];
    const c = spriteCanvas(d.sprite);
    c.classList.add('layer');
    place(c, d.x, d.y, s.w, s.h);
    if (d.flat) c.style.zIndex = '1';
    room.append(c);
  }

  const tip = doc.createElement('div');
  tip.className = 'tip';
  tip.hidden = true;
  room.append(tip);

  const buttons = OBJECTS.map((o) => {
    const s = SPRITES[o.sprite];
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = 'obj';
    b.dataset.object = o.id;
    b.setAttribute('aria-label', o.ariaLabel);
    b.append(spriteCanvas(o.sprite));
    place(b, o.x, o.y, s.w, s.h);
    const show = () => {
      tip.textContent = o.label;
      place(tip, o.x + s.w / 2, Math.max(2, o.y - 7), 0, 0);
      tip.style.zIndex = '500';
      tip.hidden = false;
    };
    const hide = () => { tip.hidden = true; };
    b.addEventListener('pointerenter', show);
    b.addEventListener('focus', show);
    b.addEventListener('pointerleave', hide);
    b.addEventListener('blur', hide);
    room.append(b);
    return b;
  });
  return { buttons, tip };
}

function layout(room) {
  const hud = doc.querySelector('.hud');
  const hudH = hud ? hud.getBoundingClientRect().height : 0;
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
    for (const b of scene.buttons) {
      b.addEventListener('click', (e) => { e.stopPropagation(); scene.use(b.dataset.object); });
    }
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
