// Builds the office furniture and objects as Three.js meshes. Every piece wears its existing
// front-on sprite on the side that faces the room; boxy pieces get plain sides and tops in a
// colour sampled from that sprite. World units are sprite pixels (see view.js).
import * as THREE from 'three';
import { SPRITES, PALETTE, WINDOW } from './sprites.js';
import { OBJECTS, DECOR, ROOM } from './objects.js';
import { WALL_H } from './view.js';
import { spriteTexture, spriteFrames, edgeColour } from './textures.js';

const OFF = 0.4; // lift flat pieces off the wall or floor so they never z-fight it

function opacity(key) {
  const rows = SPRITES[key].frames[0];
  let solid = 0;
  for (const r of rows) for (const c of r) if (c !== '.') solid++;
  return solid / (rows.length * rows[0].length);
}

function faceMaterial(key, { emissive = false } = {}) {
  const map = spriteTexture(key, 0);
  const m = new THREE.MeshLambertMaterial({ map, alphaTest: 0.5 });
  if (emissive) { m.emissive = new THREE.Color(0xffffff); m.emissiveMap = map; m.emissiveIntensity = 0.3; }
  return m;
}

function plane(material, w, h, shadow = true) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
  if (shadow) {
    mesh.castShadow = true;
    mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: material.map, alphaTest: 0.5 });
  }
  mesh.receiveShadow = true;
  return mesh;
}

const colour = (key) => new THREE.Color(PALETTE[key] || '#2b2f33');

// One placed piece. Returns { group, entry } where entry carries the face corners and frame swapping.
function buildPiece(key, sprite, at, opts = {}) {
  const s = SPRITES[sprite];
  const w = s.w, h = s.h;
  const group = new THREE.Group();
  const mat = faceMaterial(sprite, { emissive: !!opts.emissive });
  const extra = [];   // other materials that show the same sprite (desk back legs)
  let corners, box, billboard = null;

  if (opts.billboard) {
    billboard = new THREE.Sprite(new THREE.SpriteMaterial({ map: spriteTexture(sprite, 0), alphaTest: 0.5 }));
    billboard.center.set(0.5, 0);
    const cx = at.x + w / 2, cz = at.z + (at.d ?? 0) / 2;
    billboard.position.set(cx, 0, cz);
    billboard.scale.set(w, h, 1);
    group.add(billboard);
    box = new THREE.Box3(new THREE.Vector3(at.x, 0, cz - 1), new THREE.Vector3(at.x + w, h, cz + 1));
    corners = [[at.x, h, cz], [at.x + w, h, cz], [at.x + w, 0, cz], [at.x, 0, cz]];
  } else if (opts.flat) {
    const d = at.d;
    const m = plane(mat, w, d, false);
    m.rotation.x = -Math.PI / 2;
    m.position.set(at.x + w / 2, OFF, at.z + d / 2);
    group.add(m);
    box = new THREE.Box3(new THREE.Vector3(at.x, 0, at.z), new THREE.Vector3(at.x + w, 1, at.z + d));
    corners = [[at.x, OFF, at.z], [at.x + w, OFF, at.z], [at.x + w, OFF, at.z + d], [at.x, OFF, at.z + d]];
  } else if (at.on === 'left') {
    const y0 = WALL_H - at.y - h;
    const m = plane(mat, w, h, false);
    m.rotation.y = Math.PI / 2;
    m.position.set(OFF, y0 + h / 2, at.z + w / 2);
    group.add(m);
    box = new THREE.Box3(new THREE.Vector3(0, y0, at.z), new THREE.Vector3(1, y0 + h, at.z + w));
    corners = [[OFF, y0 + h, at.z + w], [OFF, y0 + h, at.z], [OFF, y0, at.z], [OFF, y0, at.z + w]];
  } else {
    let x0 = at.x, y0, z0, d;
    if (at.on === 'back') { y0 = WALL_H - at.y - h; z0 = at.z ?? 0; d = at.d ?? 0; }
    else if (at.on === 'hang') { y0 = WALL_H - h; z0 = at.z; d = 0; }
    else { y0 = at.on === 'desk' ? ROOM.deskTop : 0; z0 = at.z; d = at.d; }
    const zf = z0 + d + OFF;
    const front = plane(mat, w, h, at.on !== 'back' || d > 0);
    front.position.set(x0 + w / 2, y0 + h / 2, zf);
    group.add(front);
    if (sprite === 'desk') {
      // a white top slab, and the sprite again at the back for the rear legs
      const top = new THREE.Mesh(new THREE.BoxGeometry(w - 2, 2, d), new THREE.MeshLambertMaterial({ color: colour('9') }));
      top.position.set(x0 + w / 2, ROOM.deskTop - 1, z0 + d / 2);
      top.castShadow = top.receiveShadow = true;
      const back = plane(faceMaterial(sprite), w, h);
      back.position.set(x0 + w / 2, y0 + h / 2, z0 + 1);
      extra.push(back.material);
      group.add(top, back);
    } else if (d > 1 && opacity(sprite) >= 0.6) {
      const side = colour(edgeColour(sprite, 'right')), lid = colour(edgeColour(sprite, 'top'));
      const mats = [side, side, lid, side, side, side].map((c) => new THREE.MeshLambertMaterial({ color: c }));
      const body = new THREE.Mesh(new THREE.BoxGeometry(w - 0.4, h - 0.4, d), mats);
      body.position.set(x0 + w / 2, y0 + h / 2, z0 + d / 2);
      body.castShadow = body.receiveShadow = true;
      group.add(body);
    }
    box = new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x0 + w, y0 + h, z0 + Math.max(d, 1)));
    corners = [[x0, y0 + h, zf], [x0 + w, y0 + h, zf], [x0 + w, y0, zf], [x0, y0, zf]];
  }

  group.traverse((o) => { o.userData.key = key; });
  const frames = spriteFrames(sprite);
  const entry = {
    key, sprite, group, box, billboard,
    material: billboard ? billboard.material : mat,
    corners: corners.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
    frame: 0,
    setFrame(i) {
      const tex = frames[((i % frames.length) + frames.length) % frames.length];
      entry.frame = i;
      entry.material.map = tex;
      if (entry.material.emissiveMap) entry.material.emissiveMap = tex;
      for (const m of extra) m.map = tex;
    },
  };
  return entry;
}

function buildWindow() {
  const { x, y, w, h } = WINDOW;
  const mat = new THREE.MeshBasicMaterial({ map: spriteTexture('window_day', 0) });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  const y0 = WALL_H - y - h;
  m.position.set(x + w / 2, y0 + h / 2, 0.2);
  const group = new THREE.Group();
  group.add(m);
  group.traverse((o) => { o.userData.key = 'window'; });
  return {
    key: 'window', sprite: 'window_day', group, material: mat, billboard: null,
    box: new THREE.Box3(new THREE.Vector3(x, y0, 0), new THREE.Vector3(x + w, y0 + h, 1)),
    corners: [[x, y0 + h, 0.2], [x + w, y0 + h, 0.2], [x + w, y0, 0.2], [x, y0, 0.2]].map(([a, b, c]) => new THREE.Vector3(a, b, c)),
    setSky(key, i) { mat.map = spriteTexture(key, i % SPRITES[key].frames.length); },
  };
}

export function buildProps() {
  const group = new THREE.Group();
  const entries = new Map();
  const seen = new Map();
  for (const d of DECOR) {
    const n = (seen.get(d.sprite) || 0) + 1;
    seen.set(d.sprite, n);
    const key = n === 1 ? d.sprite : `${d.sprite}${n}`;
    const e = buildPiece(key, d.sprite, d.at, { flat: d.flat, billboard: d.billboard, emissive: d.sprite === 'pendant' });
    entries.set(key, e);
    group.add(e.group);
  }
  for (const o of OBJECTS) {
    const e = buildPiece(o.id, o.sprite, o.at, { emissive: o.id === 'laptop' });
    entries.set(o.id, e);
    group.add(e.group);
  }
  const win = buildWindow();
  entries.set('window', win);
  group.add(win.group);
  return { group, entries };
}
