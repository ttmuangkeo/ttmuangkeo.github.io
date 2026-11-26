// Chibi Tim in the 3D room: a camera-facing sprite anchored at his feet, a soft shadow,
// a name tag and emote bubbles (HTML, positioned by projecting world points).
// Walking keeps the old contract: walkTo resolves true on arrival, false if a newer walk took over.
import * as THREE from 'three';
import { SPRITES, paintSprite } from './sprites.js';
import { spriteTexture } from './textures.js';
import { buildGrid, findPath, walkSpeed, nextWalkId } from './grid.js';
import { cellToWorld, worldToCell, facingFor, DEFAULT_YAW } from './view.js';
import { ROOM } from './objects.js';
import { place } from './dom.js';

const SCALE = 0.75;                     // world units per Tim sprite pixel
const TIM_W = 24 * SCALE, TIM_H = 36 * SCALE;
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createTim(world, room, { start }) {
  const doc = room.ownerDocument;
  const mat = new THREE.SpriteMaterial({ map: spriteTexture('tim_idle_down', 0), alphaTest: 0.5 });
  const sprite = new THREE.Sprite(mat);
  sprite.center.set(0.5, 0);
  sprite.scale.set(TIM_W, TIM_H, 1);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(7, 20),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  for (const o of [sprite, shadow]) o.userData.noPick = true;
  world.add(sprite);
  world.add(shadow);

  const tag = doc.createElement('div');
  tag.className = 'tim';
  tag.setAttribute('aria-hidden', 'true');
  tag.textContent = 'Tim';
  room.append(tag);
  let emoteEl = null, emoteTimer = 0;

  const grid = buildGrid(ROOM.cols, ROOM.rows, ROOM.blocked);
  const yaw = () => DEFAULT_YAW + world.swing();

  const tim = {
    sprite, el: tag, grid,
    pos: cellToWorld(start),
    walkId: 0,
    walking: false,
    pose: 'idle',
    lastAction: performance.now(),
    stride: 0, // distance walked so far, so chained one-cell steps keep cycling the walk frames
    show(sheet, i = 0) {
      tim.pose = sheet === 'tim_idle_down' ? 'idle' : sheet;
      const n = SPRITES[sheet].frames.length;
      mat.map = spriteTexture(sheet, ((i % n) + n) % n);
      world.invalidate();
    },
    face(dir) {
      tim.show({ up: 'tim_walk_up', left: 'tim_walk_left', right: 'tim_walk_right' }[dir] ?? 'tim_idle_down', 0);
    },
    moveTo(x, z) {
      tim.pos = { x, z };
      sprite.position.set(x, 0, z);
      shadow.position.set(x, 0.5, z);
      world.invalidate();
    },
    cell() { return worldToCell(tim.pos); },
    feetPoint() { return { x: tim.pos.x, y: 0, z: tim.pos.z }; },
    headPoint() { return { x: tim.pos.x, y: TIM_H + 3, z: tim.pos.z }; },
    emote(kind, ms = 1800) {
      const s = SPRITES[`emote_${kind}`];
      if (!s) return;
      emoteEl?.remove();
      clearTimeout(emoteTimer);
      const el = doc.createElement('span');
      el.className = 'emote';
      el.dataset.emote = kind;
      el.setAttribute('aria-hidden', 'true');
      const c = paintSprite(s.frames[0], undefined, doc);
      c.className = 'px';
      el.append(c);
      room.append(el);
      emoteEl = el;
      reproject();
      emoteTimer = setTimeout(() => { if (emoteEl === el) { el.remove(); emoteEl = null; } }, ms);
    },
    emoting: () => emoteEl?.dataset.emote ?? null,
    clearEmote(kind) {
      if (!emoteEl || (kind && emoteEl.dataset.emote !== kind)) return;
      clearTimeout(emoteTimer);
      emoteEl.remove();
      emoteEl = null;
    },
    // Walks to a cell. Resolves true on arrival, false if a newer walk took over.
    // settle: false keeps the walk pose at the end (keyboard steps chain into the next one).
    async walkTo(target, { settle = true, diagonal = true } = {}) {
      const id = (tim.walkId = nextWalkId(tim.walkId));
      tim.lastAction = performance.now();
      tim.walking = true;
      try { return await tim.walkPath(id, target, settle, diagonal); } finally { if (id === tim.walkId) tim.walking = false; }
    },
    async walkPath(id, target, settle, diagonal) {
      const path = findPath(grid, tim.cell(), target, { diagonal });
      const here = tim.cell();
      if (!path.length) return here.col === target.col && here.row === target.row;
      if (reducedMotion() && path.length === 1) { // a single keyboard step: move, no fade
        const end = cellToWorld(target);
        tim.moveTo(end.x, end.z);
        await sleep(90);
        return id === tim.walkId;
      }
      if (reducedMotion()) {
        sprite.visible = false; tag.style.opacity = '0';
        world.invalidate();
        await sleep(120);
        if (id !== tim.walkId) { sprite.visible = true; tag.style.opacity = ''; return false; }
        const end = cellToWorld(target);
        tim.moveTo(end.x, end.z);
        sprite.visible = true; tag.style.opacity = '';
        return true;
      }
      // the first step starts from wherever he is now (he may be mid-cell after a retarget)
      let length = 0, prev = tim.pos;
      for (const step of path) { const p = cellToWorld(step); length += Math.hypot(p.x - prev.x, p.z - prev.z); prev = p; }
      const speed = walkSpeed(length);
      let travelled = 0;
      for (const step of path) {
        const goal = cellToWorld(step);
        const dx = goal.x - tim.pos.x, dz = goal.z - tim.pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.01) continue;
        const sheet = `tim_walk_${facingFor(dx, dz, yaw())}`;
        const start = { ...tim.pos };
        let t0 = null;
        await new Promise((resolve) => {
          const tick = (now) => {
            if (id !== tim.walkId) return resolve();
            if (t0 === null) t0 = now;
            const k = Math.min(1, (((now - t0) / 1000) * speed) / dist);
            tim.moveTo(start.x + dx * k, start.z + dz * k);
            tim.show(sheet, Math.floor((tim.stride + travelled + dist * k) / 6));
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

  function reproject() {
    const feet = world.project(tim.feetPoint());
    place(tag, feet.x, feet.y, 0, 0);
    if (emoteEl) { const head = world.project(tim.headPoint()); place(emoteEl, head.x, head.y, 0, 0); emoteEl.style.zIndex = '550'; }
  }
  world.onRender(reproject);

  tim.moveTo(tim.pos.x, tim.pos.z);
  tim.show('tim_idle_down');
  reproject();
  return tim;
}
