// Unit tests for the pixel-room game logic. Run: node --test _tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PALETTE, SPRITES, validateSprite } from '../assets/game/sprites.js';

const OBJECT_IDS = ['pennant', 'map', 'laptop', 'pager', 'logbook', 'keys', 'camera', 'rack', 'mailbox'];
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
  const required = ['room', ...OBJECT_IDS, 'desk', 'shelf', 'rug', 'mug', ...TIM_SHEETS,
    ...OBJECT_IDS.map((id) => `icon_${id}`)];
  for (const key of required) assert.ok(SPRITES[key], `missing sprite ${key}`);
});

test('room is 160x100', () => {
  assert.equal(SPRITES.room.w, 160);
  assert.equal(SPRITES.room.h, 100);
});

test('tim frames share one size and have the right counts', () => {
  const { w, h } = SPRITES.tim_idle_down;
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
import { OBJECTS, ROOM } from '../assets/game/objects.js';
import { fitScale } from '../assets/game/grid.js';

test('OBJECTS has the 9 ids in order', () => {
  assert.deepEqual(OBJECTS.map((o) => o.id), OBJECT_IDS);
});

test("every object's sprite exists and lies inside 160x100", () => {
  for (const o of OBJECTS) {
    const s = SPRITES[o.sprite];
    assert.ok(s, `${o.id}: sprite ${o.sprite}`);
    assert.ok(o.x >= 0 && o.y >= 0 && o.x + s.w <= 160 && o.y + s.h <= 100, `${o.id} out of bounds`);
    assert.ok(o.label && o.ariaLabel, `${o.id} needs label and ariaLabel`);
  }
});

test('useSpots are walkable floor cells', () => {
  const blocked = new Set(ROOM.blocked.map(([c, r]) => `${c},${r}`));
  for (const o of OBJECTS) {
    const { col, row } = o.useSpot;
    assert.ok(col >= 0 && col < ROOM.cols, `${o.id} col`);
    assert.ok(row >= ROOM.floorTopRow && row < ROOM.rows, `${o.id} row ${row} not on floor`);
    assert.ok(!blocked.has(`${col},${row}`), `${o.id} useSpot is blocked`);
  }
});

test('fitScale on desktop is the largest whole number that fits', () => {
  assert.equal(fitScale(1280, 800, 48, false), 7);
  assert.equal(fitScale(300, 200, 48, false), 1);
  assert.ok(Number.isInteger(fitScale(1920, 1080, 52, false)));
});

test('fitScale on phones fits the width', () => {
  assert.equal(fitScale(375, 812, 48, true), 375 / 160);
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
  const g = buildGrid(ROOM.cols, ROOM.rows, ROOM.blocked, ROOM.floorTopRow);
  for (const o of OBJECTS) {
    const path = findPath(g, ROOM.start, o.useSpot);
    assert.ok(path.length > 0, `${o.id} unreachable`);
  }
});

test('the walk grid treats the wall rows as blocked', () => {
  const g = buildGrid(ROOM.cols, ROOM.rows, ROOM.blocked, ROOM.floorTopRow);
  assert.equal(g.walkable(5, ROOM.floorTopRow - 1), false);
  assert.equal(g.walkable(ROOM.start.col, ROOM.start.row), true);
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
import { KEY_DIRS, KONAMI, nextCell, objectInReach, createSequence } from '../assets/game/controls.js';
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
    assert.equal(SPRITES[`window_${p}`]?.w, 30, p);
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

test('the rack stands on the floor clear of the mailbox, used from its left', () => {
  const rack = OBJECTS.find((o) => o.id === 'rack');
  assert.equal(rack.face, 'right');
  const blocked = new Set(ROOM.blocked.map(([c, r]) => `${c},${r}`));
  const s = SPRITES.rack;
  const footCols = [Math.floor(rack.x / 8), Math.floor((rack.x + s.w - 1) / 8)];
  for (const c of footCols) assert.ok(blocked.has(`${c},${Math.floor((rack.y + s.h - 1) / 8)}`), `rack foot col ${c} blocked`);
  assert.equal(rack.useSpot.col, footCols[0] - 1);
  assert.equal(SPRITES.rack.frames.length, 2, 'rack lights blink');
});
