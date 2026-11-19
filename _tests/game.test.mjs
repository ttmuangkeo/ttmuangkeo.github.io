// Unit tests for the pixel-room game logic. Run: node --test _tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PALETTE, SPRITES, validateSprite } from '../assets/game/sprites.js';

const OBJECT_IDS = ['pennant', 'map', 'laptop', 'pager', 'logbook', 'keys', 'camera', 'mailbox'];
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

test('OBJECTS has the 8 ids in order', () => {
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
