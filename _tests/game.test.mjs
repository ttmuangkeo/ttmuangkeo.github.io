// Unit tests for the pixel-room game logic. Run: node --test _tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PALETTE, SPRITES, WINDOW, EMOTES, validateSprite } from '../assets/game/sprites.js';

const OBJECT_IDS = ['pennant', 'map', 'whiteboard', 'laptop', 'pager', 'logbook', 'toolbox', 'plaque', 'keys', 'camera', 'rack', 'mailbox'];
const GAME_PANELS = ['rack']; // objects whose panel is a mini-game, not story content
const TIM_SHEETS = ['tim_idle_down', 'tim_walk_down', 'tim_walk_up', 'tim_walk_left', 'tim_walk_right', 'tim_use', 'tim_wave'];

test('every sprite validates', () => {
  for (const [key, s] of Object.entries(SPRITES)) {
    assert.deepEqual(validateSprite(s), [], `sprite ${key}`);
  }
});

test('validateSprite catches bad rows and unknown palette keys', () => {
  const bad = { w: 3, h: 2, frames: [['...', '..']] };
  assert.ok(validateSprite(bad).length > 0, 'short row must be reported');
  const unknown = { w: 2, h: 1, frames: [['.?']] };
  assert.ok(validateSprite(unknown).length > 0, 'unknown key must be reported');
  const empty = { w: 1, h: 1, frames: [] };
  assert.ok(validateSprite(empty).length > 0, 'no frames must be reported');
});

test('required sprites exist', () => {
  const required = ['wall_back', 'wall_left', 'floor', ...OBJECT_IDS, 'desk', 'shelf', 'rug', 'mug', 'sofa', 'plant', 'pendant', ...TIM_SHEETS,
    ...OBJECT_IDS.map((id) => `icon_${id}`)];
  for (const key of required) assert.ok(SPRITES[key], `missing sprite ${key}`);
});

test('the window fits inside the room', () => {
  assert.ok(WINDOW.x >= 0 && WINDOW.y >= 0 && WINDOW.x + WINDOW.w <= 240 && WINDOW.y + WINDOW.h <= 72, JSON.stringify(WINDOW));
});

test('tim frames share one size and have the right counts', () => {
  const { w, h } = SPRITES.tim_idle_down;
  assert.deepEqual([w, h], [24, 36], 'chibi Tim is 24x36');
  for (const key of TIM_SHEETS) {
    assert.equal(SPRITES[key].w, w, key);
    assert.equal(SPRITES[key].h, h, key);
  }
  assert.equal(SPRITES.tim_idle_down.frames.length, 2);
  for (const d of ['down', 'up', 'left', 'right']) assert.equal(SPRITES[`tim_walk_${d}`].frames.length, 4, d);
  assert.equal(SPRITES.tim_use.frames.length, 2);
  assert.equal(SPRITES.tim_wave.frames.length, 2);
});

test('tray icons are 16x16', () => {
  for (const id of OBJECT_IDS) {
    assert.equal(SPRITES[`icon_${id}`].w, 16, id);
    assert.equal(SPRITES[`icon_${id}`].h, 16, id);
  }
});

test('palette keys are single characters with "." transparent', () => {
  for (const k of Object.keys(PALETTE)) assert.equal(k.length, 1, k);
  assert.equal(PALETTE['.'], null);
});

// ---------- Task 3: objects and scaling ----------
import { OBJECTS, DECOR, ROOM, WINDOW_SPOT } from '../assets/game/objects.js';

test('OBJECTS has the 12 ids in order', () => {
  assert.deepEqual(OBJECTS.map((o) => o.id), OBJECT_IDS);
});

test('every object and decor piece lies inside the room', () => {
  for (const o of [...OBJECTS, ...DECOR]) {
    const s = SPRITES[o.sprite], a = o.at;
    assert.ok(s && a, `${o.id ?? o.sprite}: sprite and placement`);
    if (o.id) assert.ok(o.label && o.ariaLabel, `${o.id} needs label and ariaLabel`);
    assert.ok(['back', 'left', 'floor', 'desk', 'hang'].includes(a.on), `${o.id ?? o.sprite} mount ${a.on}`);
    if (a.on === 'back') assert.ok(a.x >= 0 && a.x + s.w <= 240 && a.y >= 0 && a.y + s.h <= 72, o.id ?? o.sprite);
    if (a.on === 'left') assert.ok(a.z >= 0 && a.z + s.w <= 112 && a.y >= 0 && a.y + s.h <= 72, o.id ?? o.sprite);
    if (a.on === 'hang') assert.ok(a.x >= 0 && a.x + s.w <= 240 && a.z >= 0 && a.z <= 112, o.sprite);
    if (a.on === 'floor' || a.on === 'desk') assert.ok(a.x >= 0 && a.x + s.w <= 240 && a.z >= 0 && a.z + a.d <= 112, o.id ?? o.sprite);
  }
});

test('back-wall pieces and the window never overlap', () => {
  const rects = [...OBJECTS, ...DECOR].filter((o) => o.at.on === 'back')
    .map((o) => ({ n: o.id ?? o.sprite, x: o.at.x, y: o.at.y, w: SPRITES[o.sprite].w, h: SPRITES[o.sprite].h }))
    .concat([{ n: 'window', ...WINDOW }]);
  for (const a of rects) for (const b of rects) if (a !== b && a.n !== 'shelf' && b.n !== 'shelf')
    assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y, `${a.n} overlaps ${b.n}`);
});

test('walking straight up from the start reaches the trail map', () => {
  const map = OBJECTS.find((o) => o.id === 'map');
  assert.deepEqual(map.useSpot, { col: ROOM.start.col, row: 0 });
  const g = buildGrid(ROOM.cols, ROOM.rows, ROOM.blocked);
  for (let r = 0; r <= ROOM.start.row; r++) assert.ok(g.walkable(ROOM.start.col, r), `row ${r}`);
});

test('the window spot is walkable and under the window', () => {
  const g = buildGrid(ROOM.cols, ROOM.rows, ROOM.blocked);
  assert.ok(g.walkable(WINDOW_SPOT.col, WINDOW_SPOT.row));
  const x = WINDOW_SPOT.col * 8 + 4; assert.ok(x >= WINDOW.x && x <= WINDOW.x + WINDOW.w);
});

test('the monitors cycle at least three screens and the plant sways', () => {
  assert.ok(SPRITES.laptop.frames.length >= 3, 'monitor frames');
  assert.equal(SPRITES.plant.frames.length, 2, 'plant frames');
});

test('no two objects have use spots within one step of each other', () => {
  for (const a of OBJECTS) for (const b of OBJECTS) {
    if (a === b) continue;
    const d = Math.abs(a.useSpot.col - b.useSpot.col) + Math.abs(a.useSpot.row - b.useSpot.row);
    assert.ok(d > 2, `${a.id} and ${b.id} use spots are ${d} apart`);
  }
});

test('no floor cell is within reach of two objects', () => {
  const g = buildGrid(ROOM.cols, ROOM.rows, ROOM.blocked);
  for (let c = 0; c < ROOM.cols; c++) for (let r = 0; r < ROOM.rows; r++) {
    if (!g.walkable(c, r)) continue;
    const near = OBJECTS.filter((o) => Math.abs(o.useSpot.col - c) + Math.abs(o.useSpot.row - r) <= 1).map((o) => o.id);
    assert.ok(near.length <= 1, `(${c},${r}) reaches ${near.join(' and ')}`);
  }
});

test('the room grid is 30x14 and every row is floor', () => {
  assert.deepEqual([ROOM.cols, ROOM.rows, ROOM.cell], [30, 14, 8]);
  assert.equal(ROOM.floorTopRow, undefined);
});

test('useSpots are walkable floor cells', () => {
  const g = buildGrid(ROOM.cols, ROOM.rows, ROOM.blocked);
  for (const o of OBJECTS) assert.ok(g.walkable(o.useSpot.col, o.useSpot.row), `${o.id} useSpot ${JSON.stringify(o.useSpot)}`);
});

// ---------- Task 4: walk grid and pathfinding ----------
import { buildGrid, findPath, nextWalkId } from '../assets/game/grid.js';

test('findPath walks a straight line', () => {
  const g = buildGrid(5, 3, []);
  assert.deepEqual(findPath(g, { col: 0, row: 1 }, { col: 3, row: 1 }),
    [{ col: 1, row: 1 }, { col: 2, row: 1 }, { col: 3, row: 1 }]);
});

test('findPath routes around a blocked cell', () => {
  const g = buildGrid(3, 3, [[1, 1]]);
  const path = findPath(g, { col: 0, row: 1 }, { col: 2, row: 1 });
  assert.equal(path.length, 4);
  assert.ok(!path.some((p) => p.col === 1 && p.row === 1), 'path must avoid the blocked cell');
  assert.deepEqual(path.at(-1), { col: 2, row: 1 });
});

test('findPath returns [] when unreachable', () => {
  const g = buildGrid(3, 3, [[1, 0], [1, 1], [1, 2]]);
  assert.deepEqual(findPath(g, { col: 0, row: 0 }, { col: 2, row: 2 }), []);
});

test('findPath returns [] for the same cell', () => {
  const g = buildGrid(3, 3, []);
  assert.deepEqual(findPath(g, { col: 1, row: 1 }, { col: 1, row: 1 }), []);
});

test('every object useSpot is reachable from where Tim starts', () => {
  const g = buildGrid(ROOM.cols, ROOM.rows, ROOM.blocked);
  for (const o of OBJECTS) {
    const path = findPath(g, ROOM.start, o.useSpot, { diagonal: true });
    assert.ok(path.length > 0, `${o.id} unreachable`);
  }
});

test('retarget: a newer walk id supersedes the old one', () => {
  const first = nextWalkId(0);
  const second = nextWalkId(first);
  assert.ok(second > first);
  assert.notEqual(first, second);
});

import { walkSpeed } from '../assets/game/grid.js';

test('walkSpeed keeps any walk at or under 1.2 seconds', () => {
  assert.equal(walkSpeed(24), 48);            // short walks use the base speed
  assert.ok(200 / walkSpeed(200) <= 1.2 + 1e-9); // long walks speed up
});

// ---------- Task 5: panels and found state ----------
import { PANELS } from '../assets/game/panels.js';
import { createFoundState, OBJECT_IDS as STATE_IDS } from '../assets/game/state.js';

test('PANELS covers every story object with a title and selectors', () => {
  assert.deepEqual(Object.keys(PANELS), OBJECT_IDS.filter((id) => !GAME_PANELS.includes(id)));
  for (const [id, p] of Object.entries(PANELS)) {
    assert.ok(p.title && typeof p.title === 'string', `${id} title`);
    assert.ok(Array.isArray(p.pick) && p.pick.length > 0, `${id} pick`);
    assert.ok(p.story && p.story.startsWith('#'), `${id} story anchor`);
  }
});

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}

test('found-state is idempotent', () => {
  const s = createFoundState(memoryStorage());
  assert.equal(s.markFound('map'), true);
  assert.equal(s.markFound('map'), false);
  assert.equal(s.count(), 1);
  assert.equal(s.isFound('map'), true);
  assert.equal(s.isFound('laptop'), false);
});

test('found-state persists through storage', () => {
  const store = memoryStorage();
  createFoundState(store).markFound('camera');
  assert.equal(createFoundState(store).isFound('camera'), true);
});

test('found-state survives throwing storage', () => {
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  const s = createFoundState(broken);
  assert.equal(s.markFound('keys'), true);
  assert.equal(s.count(), 1);
  const none = createFoundState(undefined);
  assert.equal(none.markFound('keys'), true);
});

test('allFound only after every object, and ignores unknown ids', () => {
  const s = createFoundState(memoryStorage());
  s.markFound('not-a-thing');
  assert.equal(s.count(), 0);
  OBJECT_IDS.filter((id) => id !== 'mailbox').forEach((id) => s.markFound(id));
  assert.equal(s.allFound(), false);
  s.markFound('mailbox');
  assert.equal(s.allFound(), true);
});

// ---------- keyboard play, the window sky, and the pager mini-game ----------
import { KEY_DIRS, KONAMI, PAD_KEYS, nextCell, objectInReach, createSequence, padDir } from '../assets/game/controls.js';
import { skyPhase, isRaining, skyNow } from '../assets/game/sky.js';
import { TICKETS, VERDICTS, verdictFor, createIncidentPanel } from '../assets/game/incident.js';
import { SKY_PHASES } from '../assets/game/sprites.js';

test('arrows and WASD map to the four directions', () => {
  for (const [keys, dir] of [[['ArrowUp', 'w', 'W'], 'up'], [['ArrowDown', 's', 'S'], 'down'], [['ArrowLeft', 'a', 'A'], 'left'], [['ArrowRight', 'd', 'D'], 'right']]) {
    for (const k of keys) assert.equal(KEY_DIRS[k], dir, k);
  }
  assert.deepEqual(nextCell({ col: 3, row: 7 }, 'up'), { col: 3, row: 6 });
  assert.deepEqual(nextCell({ col: 3, row: 7 }, 'right'), { col: 4, row: 7 });
});

test('objectInReach finds the object Tim is standing at or next to', () => {
  for (const o of OBJECTS) assert.equal(objectInReach(o.useSpot, OBJECTS)?.id, o.id, o.id);
  assert.equal(objectInReach(ROOM.start, OBJECTS), null);
  const pager = OBJECTS.find((o) => o.id === 'pager').useSpot;
  assert.equal(objectInReach({ col: pager.col + 1, row: pager.row }, OBJECTS)?.id, 'pager');
});

test('padDir reads a thumb on the D-pad as one of four directions', () => {
  assert.equal(padDir(0, -30), 'up');
  assert.equal(padDir(0, 30), 'down');
  assert.equal(padDir(-30, 5), 'left');
  assert.equal(padDir(30, -5), 'right');
  assert.equal(padDir(20, -25), 'up');    // mostly up wins over a little right
  assert.equal(padDir(3, -4), null);      // inside the dead zone at the centre
  assert.equal(padDir(3, -4, 2), 'up');   // a smaller dead zone
});

test('the D-pad and A/B buttons speak the Konami code', () => {
  const seq = createSequence(KONAMI);
  const pad = ['up', 'up', 'down', 'down', 'left', 'right', 'left', 'right'].map((d) => PAD_KEYS[d]);
  assert.equal([...pad, 'b', 'a'].map(seq).at(-1), true);
});

test('createSequence fires on the Konami code and recovers from mistakes', () => {
  const seq = createSequence(KONAMI);
  const feed = (keys) => keys.map((k) => seq(k));
  assert.deepEqual(feed(KONAMI).at(-1), true);
  assert.ok(!feed(['ArrowUp', 'ArrowDown']).some(Boolean));
  const again = createSequence(KONAMI);
  // a wrong key mid-way, then a full correct run (letters in either case)
  ['ArrowUp', 'ArrowUp', 'x'].forEach(again);
  assert.equal(KONAMI.slice(0, -2).concat(['B', 'A']).map(again).at(-1), true);
});

test('skyPhase follows Seattle daylight', () => {
  assert.equal(skyPhase(12, 5), 'day');     // June noon
  assert.equal(skyPhase(22.5, 5), 'night'); // June 10:30 PM
  assert.equal(skyPhase(21, 5), 'dusk');    // June 9 PM
  assert.equal(skyPhase(17.5, 11), 'night'); // December 5:30 PM
  assert.equal(skyPhase(16.3, 11), 'dusk');
  assert.equal(skyPhase(7.8, 11), 'dawn');
});

test('skyNow reads Seattle time and rain is stable within an hour', () => {
  const s = skyNow(new Date('2026-11-20T04:00:00Z'));
  assert.equal(s.label, '8:00 PM');
  assert.equal(s.phase, 'night');
  assert.match(s.text, /^Seattle · 8:00 PM · /);
  const a = new Date('2026-11-20T20:05:00Z'), b = new Date('2026-11-20T20:55:00Z');
  assert.equal(isRaining(a, 10), isRaining(b, 10));
  let wet = 0;
  for (let h = 0; h < 2000; h++) wet += isRaining(new Date(Date.UTC(2026, 0, 1) + h * 3_600_000), 0);
  assert.ok(wet > 600 && wet < 1200, `January rain share ${wet}/2000`);
});

test('every window sky has a sprite, with rain variants except the aurora', () => {
  for (const p of SKY_PHASES) {
    assert.equal(SPRITES[`window_${p}`]?.w, WINDOW.w, p);
    assert.equal(SPRITES[`window_${p}`].h, WINDOW.h, p);
    assert.equal(SPRITES[`window_${p}`].frames.length, 2, p);
    assert.equal(Boolean(SPRITES[`window_${p}_rain`]), p !== 'aurora', `${p} rain`);
  }
});

test('triage tickets are complete and their scores match their verdicts', () => {
  assert.ok(TICKETS.length >= 3);
  const verdicts = new Set(TICKETS.map((t) => verdictFor(t.score)));
  assert.deepEqual([...verdicts].sort(), Object.keys(VERDICTS).sort(), 'every verdict appears at least once');
  for (const t of TICKETS) {
    assert.match(t.key, /^SUP-\d+$/);
    for (const f of ['title', 'body', 'finding', 'next', 'outcome']) assert.ok(t[f], `${t.key} ${f}`);
    assert.ok(t.signals.length && t.probes.length, `${t.key} signals/probes`);
    assert.ok(t.score > 0 && t.score < 1, `${t.key} score`);
  }
  const panel = createIncidentPanel({ doc: {} });
  assert.equal(typeof panel.render, 'function');
  assert.ok(panel.title && panel.story.startsWith('#'));
});

test('a visitor who found the 9 old objects still has the 3 new ones to find', () => {
  const store = memoryStorage();
  store.setItem('tim-room-found', JSON.stringify(['pennant', 'map', 'laptop', 'pager', 'logbook', 'keys', 'camera', 'rack', 'mailbox']));
  const s = createFoundState(store);
  assert.equal(s.count(), 9);
  assert.equal(s.allFound(), false);
  ['whiteboard', 'toolbox', 'plaque'].forEach((id) => s.markFound(id));
  assert.equal(s.allFound(), true);
});

test('found-state ids come from OBJECTS', () => {
  assert.deepEqual(STATE_IDS, OBJECTS.map((o) => o.id));
});

// ---------- the server rack: EWS -> Graph cutover ----------
import { toGraphId, toEwsId, swappedAt, RECORDS, NEW_EVENT, STAGES, createMigrationPanel } from '../assets/game/migration.js';

test('toGraphId swaps / for - and + for _, and nothing else', () => {
  assert.equal(toGraphId('AA+b/C+d/='), 'AA_b-C_d-=');
  assert.equal(toEwsId('AA_b-C_d-='), 'AA+b/C+d/=');
  assert.equal(toGraphId('plainAAA='), 'plainAAA=');
});

test('every demo record has an EWS-style id that round-trips', () => {
  assert.equal(RECORDS.length, 3);
  for (const r of RECORDS) {
    assert.match(r.ews, /\+/, `${r.label} needs a +`);
    assert.match(r.ews, /\//, `${r.label} needs a /`);
    assert.doesNotMatch(r.ews, /[-_]/, `${r.label} must not already look like Graph`);
    const g = toGraphId(r.ews);
    assert.doesNotMatch(g, /[+/]/, r.label);
    assert.equal(toEwsId(g), r.ews, r.label);
    assert.ok(r.kind && r.label && r.detail, r.label);
  }
  assert.doesNotMatch(NEW_EVENT.id, /[+/]/, 'the new event arrives with a Graph id');
});

test('swappedAt lists exactly the characters the transform changes', () => {
  for (const r of RECORDS) {
    const g = toGraphId(r.ews);
    const diff = [...r.ews].flatMap((c, i) => (c === g[i] ? [] : [i]));
    assert.deepEqual(swappedAt(r.ews), diff, r.label);
    assert.ok(diff.length >= 2);
  }
});

test('the cutover runs in six stages in the runbook order', () => {
  assert.deepEqual(STAGES.map((s) => s.button),
    ['Register the app', 'Grant permissions', 'Pause sync', 'Transform IDs', 'Check the IDs', 'Resume sync']);
  for (const s of STAGES) assert.ok(s.lines.length >= 2 && s.lines.length <= 4, `${s.id} has 2-4 lines`);
  const text = STAGES.flatMap((s) => s.lines.map(([, t]) => t)).join('\n');
  for (const p of ['Contacts.ReadWrite', 'Calendars.ReadWrite', 'Mail.Send', 'sync=false', 'sync=true', 'client_id', 'tenant_id']) {
    assert.ok(text.includes(p), `stage text mentions ${p}`);
  }
  assert.doesNotMatch(text, /[0-9a-f]{8}-[0-9a-f]{4}/i, 'no real-looking GUIDs');
  const panel = createMigrationPanel({ doc: {} });
  assert.equal(typeof panel.render, 'function');
  assert.ok(panel.title && panel.story.startsWith('#'));
});

test('the rack stands on the floor in the front-right corner, used from its left', () => {
  const rack = OBJECTS.find((o) => o.id === 'rack');
  assert.equal(rack.face, 'right');
  assert.equal(rack.at.on, 'floor');
  const blocked = new Set(ROOM.blocked.map(([c, r]) => `${c},${r}`));
  const c0 = Math.floor(rack.at.x / 8), c1 = Math.floor((rack.at.x + SPRITES.rack.w - 1) / 8);
  const r0 = Math.floor(rack.at.z / 8), r1 = Math.floor((rack.at.z + rack.at.d - 1) / 8);
  for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) assert.ok(blocked.has(`${c},${r}`), `rack cell ${c},${r} blocked`);
  assert.ok(rack.at.x + SPRITES.rack.w > 200 && rack.at.z + rack.at.d > 80, 'front-right corner');
  assert.equal(rack.useSpot.col, c0 - 1);
  assert.equal(SPRITES.rack.frames.length, 2, 'rack lights blink');
});

// ---------- 3D view ----------
import * as V from '../assets/game/view.js';

test('cell and world coordinates round-trip at cell centres', () => {
  assert.deepEqual(V.cellToWorld({ col: 0, row: 0 }), { x: 4, z: 4 });
  assert.deepEqual(V.cellToWorld({ col: 29, row: 13 }), { x: 236, z: 108 });
  assert.deepEqual(V.worldToCell({ x: 236.9, z: 108 }), { col: 29, row: 13 });
});

test('frameFor: desktop is ~16:9 at an integer scale, never wider than the viewport', () => {
  assert.deepEqual(V.frameFor(1280, 768, 48, false), { renderW: 416, renderH: 234, scale: 3 });
  assert.deepEqual(V.frameFor(1280, 688, 64, false), { renderW: 554, renderH: 311, scale: 2 });
  for (const [vw, vh, hud] of [[1440, 868, 52], [1920, 1048, 52], [700, 568, 90]]) {
    const f = V.frameFor(vw, vh, hud, false);
    assert.ok(Number.isInteger(f.scale) && f.scale >= 1);
    assert.ok(f.renderW * f.scale <= vw - 32 && f.renderH * f.scale <= vh - hud);
    assert.ok(f.renderW >= 300 && f.renderW <= 700, `renderW ${f.renderW}`);
  }
});

test('frameFor: phones render 240x180 and fill the width', () => {
  assert.deepEqual(V.frameFor(375, 780, 48, true), { renderW: 240, renderH: 180, scale: 375 / 240 });
});

test('clampSwing keeps the swing between -10 and +30 degrees', () => {
  assert.equal(V.clampSwing(-50), -10); assert.equal(V.clampSwing(45), 30); assert.equal(V.clampSwing(7), 7);
});

test('the camera stays outside the open front and on the room side of the left wall across swing, zoom and focus', () => {
  for (const aspect of [16 / 9, 4 / 3]) for (let s = V.SWING_MIN; s <= V.SWING_MAX; s += 5) for (const zoom of [1, 1.5, 2])
    for (const at of [{ x: 0, z: 0 }, { x: 240, z: 0 }, { x: 0, z: 112 }, { x: 240, z: 112 }]) {
      const { position: p } = V.cameraPose(s, aspect, zoom, V.followFocus(at, aspect));
      assert.ok(p.x > 0 && p.z > V.ROOM_D && p.y > V.WALL_H, `swing ${s} zoom ${zoom}: ${JSON.stringify(p)}`);
    }
});

test('the eye-level camera looks low and close; the overview looks down from farther away', () => {
  const near = V.cameraPose(0, 16 / 9, 1), far = V.cameraPose(0, 16 / 9, 2);
  const pitch = (pose) => Math.atan2(pose.position.y - pose.target.y, Math.hypot(pose.position.x - pose.target.x, pose.position.z - pose.target.z)) * 180 / Math.PI;
  const dist = (pose) => Math.hypot(pose.position.x - pose.target.x, pose.position.y - pose.target.y, pose.position.z - pose.target.z);
  assert.ok(Math.abs(pitch(near) - V.FOLLOW_PITCH) < 1e-6 && pitch(near) <= 30, `eye-level pitch ${pitch(near)}`);
  assert.ok(Math.abs(pitch(far) - V.PITCH) < 1e-6);
  assert.ok(dist(near) < dist(far) / 2, `${dist(near)} vs ${dist(far)}`);
});

test('the follow focus tracks Tim and never lets the frame run past the side walls', () => {
  for (const aspect of [16 / 9, 4 / 3]) {
    const mid = V.followFocus({ x: 120, z: 60 }, aspect);
    assert.equal(mid.x, 120);
    assert.equal(mid.z, 60 - V.FOLLOW_LEAD);
    for (let x = 0; x <= 240; x += 20) for (let z = 0; z <= 112; z += 16) {
      const f = V.followFocus({ x, z }, aspect);
      const pose = V.cameraPose(0, aspect, 1, f);
      for (const y of [0, 36, 72]) {
        const l = V.projectNdc(pose, aspect, { x: 0, y, z: V.ROOM_D }), r = V.projectNdc(pose, aspect, { x: 240, y, z: V.ROOM_D });
        assert.ok(l.x <= -1 + 1e-6 || Math.abs(l.y) > 1, `${aspect} tim ${x},${z}: left wall edge at ${JSON.stringify(l)}`);
        assert.ok(r.x >= 1 - 1e-6 || Math.abs(r.y) > 1, `${aspect} tim ${x},${z}: right wall edge at ${JSON.stringify(r)}`);
      }
    }
  }
});

test('the camera yaw blends from eye level to the overview and adds the swing', () => {
  assert.equal(V.cameraYaw(0, 1), V.FOLLOW_YAW);
  assert.equal(V.cameraYaw(0, 2), V.DEFAULT_YAW);
  assert.equal(V.cameraYaw(10, 1), V.FOLLOW_YAW + 10);
  assert.ok(V.cameraYaw(0, 1.5) > V.FOLLOW_YAW && V.cameraYaw(0, 1.5) < V.DEFAULT_YAW);
});

test('the overview frames the whole room at desktop and phone aspects', () => {
  for (const aspect of [16 / 9, 4 / 3]) {
    const pose = V.cameraPose(0, aspect, V.ZOOM_MAX);
    for (const x of [0, 240]) for (const y of [0, 72]) for (const z of [0, 112]) {
      const n = V.projectNdc(pose, aspect, { x, y, z });
      assert.ok(Math.abs(n.x) <= 1 && Math.abs(n.y) <= 1, `${aspect} corner ${x},${y},${z} -> ${JSON.stringify(n)}`);
    }
  }
});

test('facingFor is camera-relative', () => {
  assert.equal(V.facingFor(0, 1, 0), 'down'); assert.equal(V.facingFor(0, -1, 0), 'up');
  assert.equal(V.facingFor(1, 0, 0), 'right'); assert.equal(V.facingFor(-1, 0, 0), 'left');
  assert.equal(V.facingFor(1, 0, 90), 'down'); // camera on the +x side: walking +x comes toward it
});

test('quadMatrix maps the rectangle corners onto the quad', () => {
  const quad = [[10, 5], [110, 12], [104, 80], [8, 70]];
  const m = V.quadMatrix(52, 34, quad);
  const apply = (x, y) => { const w = m[3] * x + m[7] * y + m[15]; return [(m[0] * x + m[4] * y + m[12]) / w, (m[1] * x + m[5] * y + m[13]) / w]; };
  [[0, 0], [52, 0], [52, 34], [0, 34]].forEach(([x, y], i) => {
    const [px, py] = apply(x, y);
    assert.ok(Math.abs(px - quad[i][0]) < 0.01 && Math.abs(py - quad[i][1]) < 0.01, `corner ${i}`);
  });
  assert.match(V.quadTransform(52, 34, quad), /^matrix3d\(([-\d.e]+,\s*){15}[-\d.e]+\)$/);
});

// ---------- diagonal paths ----------
test('diagonal findPath takes the diagonal across open floor', () => {
  const g = buildGrid(5, 5, []);
  assert.deepEqual(findPath(g, { col: 0, row: 0 }, { col: 3, row: 3 }, { diagonal: true }),
    [{ col: 1, row: 1 }, { col: 2, row: 2 }, { col: 3, row: 3 }]);
});
test('diagonal findPath never cuts a blocked corner', () => {
  const g = buildGrid(3, 3, [[1, 0]]);
  const path = findPath(g, { col: 0, row: 0 }, { col: 1, row: 1 }, { diagonal: true });
  assert.deepEqual(path, [{ col: 0, row: 1 }, { col: 1, row: 1 }]);
});
test('diagonal findPath prefers straight runs over zigzags of equal cost', () => {
  const g = buildGrid(6, 3, []);
  const path = findPath(g, { col: 0, row: 1 }, { col: 5, row: 1 }, { diagonal: true });
  assert.ok(path.every((p) => p.row === 1), JSON.stringify(path));
});

// ---------- lighting ----------
import { lightFor } from '../assets/game/sky.js';
test('lightFor follows the Seattle sky', () => {
  const day = lightFor({ phase: 'day' }), dawn = lightFor({ phase: 'dawn' }), night = lightFor({ phase: 'night' });
  assert.ok(day.sun.intensity > dawn.sun.intensity && dawn.sun.intensity > night.sun.intensity);
  assert.ok(night.lamps > day.lamps);
  assert.ok(lightFor({ phase: 'day', rain: true }).sun.intensity < day.sun.intensity);
  const warm = (c) => ((c >> 16) & 255) - (c & 255);
  assert.ok(warm(dawn.sun.color) > warm(day.sun.color), 'dawn light is warmer');
  assert.equal(day.tint, null);
  const a = lightFor({ phase: 'night', aurora: true }).tint;
  assert.ok(a !== null && ((a >> 8) & 255) > ((a >> 16) & 255), 'aurora tint is green-led');
});

// ---------- chibi Tim and emotes ----------
test('every emote is an 11x11 sprite', () => {
  assert.deepEqual(EMOTES, ['alert', 'heart', 'dots', 'note', 'zzz']);
  for (const k of EMOTES) {
    const s = SPRITES[`emote_${k}`];
    assert.ok(s, k); assert.equal(s.w, 11, k); assert.equal(s.h, 11, k);
    assert.deepEqual(validateSprite(s), [], k);
  }
});
test('chibi Tim has a big head with hair and eyes', () => {
  for (const key of TIM_SHEETS) for (const f of SPRITES[key].frames)
    assert.ok(f.slice(0, 14).some((row) => row.includes('H')), `${key} has no hair in the top 40%`);
  const eyes = SPRITES.tim_idle_down.frames[0].slice(8, 14).join('').split('').filter((c) => c === 'K').length;
  assert.ok(eyes >= 2, `eyes: ${eyes}`);
});

// ---------- room shell textures ----------
test('the room shell has wall and floor textures at world size', () => {
  assert.deepEqual([SPRITES.wall_back.w, SPRITES.wall_back.h], [240, 72]);
  assert.deepEqual([SPRITES.wall_left.w, SPRITES.wall_left.h], [112, 72]);
  assert.deepEqual([SPRITES.floor.w, SPRITES.floor.h], [240, 112]);
});

test('the 2D room backdrop and native-size scaling are gone', async () => {
  assert.equal(SPRITES.room, undefined);
  const grid = await import('../assets/game/grid.js');
  assert.equal(grid.fitScale, undefined);
  assert.equal(grid.NATIVE_W, undefined);
});

test('zoom runs from eye level (1) to the overview (2)', () => {
  assert.deepEqual([V.clampZoom(0.5), V.clampZoom(3), V.clampZoom(1.1)], [1, 2, 1.1]);
  assert.deepEqual([V.zoomBlend(1), V.zoomBlend(2), V.zoomBlend(1.5)], [0, 1, 0.5]);
});
