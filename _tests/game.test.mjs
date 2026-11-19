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
