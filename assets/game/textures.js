// Three.js textures painted from the code-authored sprites: nearest-neighbour, no mipmaps,
// so every sprite pixel stays a crisp block in the low-res render.
import * as THREE from 'three';
import { SPRITES, paintSprite } from './sprites.js';

const cache = new Map();

export function spriteTexture(key, frame = 0) {
  const id = `${key}#${frame}`;
  if (cache.has(id)) return cache.get(id);
  const sheet = SPRITES[key];
  if (!sheet) throw new Error(`no sprite ${key}`);
  const tex = new THREE.CanvasTexture(paintSprite(sheet.frames[Math.min(frame, sheet.frames.length - 1)]));
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set(id, tex);
  return tex;
}

// Every frame of a sheet, in order.
export function spriteFrames(key) {
  return SPRITES[key].frames.map((_, i) => spriteTexture(key, i));
}

// After a lost WebGL context comes back, every texture has to be uploaded again.
export function refreshTextures() {
  for (const tex of cache.values()) tex.needsUpdate = true;
}

// The most common opaque colour along one edge of a sprite frame, for a box's plain sides.
export function edgeColour(key, edge = 'right') {
  const rows = SPRITES[key].frames[0];
  const pick = edge === 'top' ? [...rows.find((r) => /[^.]/.test(r))] : rows.map((r) => [...r].reverse().find((c) => c !== '.'));
  const counts = new Map();
  for (const c of pick) if (c && c !== '.' && c !== 'k') counts.set(c, (counts.get(c) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '8';
}
