// Pure geometry for the 3D room: cells and world units, the render frame, the camera,
// camera-relative facing, and the CSS transform that pins HTML onto a projected quad.
// World units are sprite pixels: x runs 0 (left wall) to 240, z runs 0 (back wall) to 112
// toward the camera, and y runs 0 (floor) to 72 (top of the walls). No DOM, no Three.js.

export const CELL = 8;
export const WALL_H = 72;
export const ROOM_W = 240;
export const ROOM_D = 112;

export const DEFAULT_YAW = 18; // degrees; turned toward the left wall so its slats read
export const PITCH = 50;       // degrees looking down
export const FOV = 35;         // vertical field of view, degrees
export const SWING_MIN = -10;  // degrees; any further and the camera nears the left wall's plane
export const SWING_MAX = 30;
export const ZOOM_MIN = 1;     // the fitted frame; closer would crop the room
export const ZOOM_MAX = 1.15;  // a little farther out

const RAD = Math.PI / 180;
const TARGET = { x: ROOM_W / 2, y: 20, z: ROOM_D / 2 };
const CORNERS = [];
for (const x of [0, ROOM_W]) for (const y of [0, WALL_H]) for (const z of [0, ROOM_D]) CORNERS.push({ x, y, z });

export function cellToWorld({ col, row }) {
  return { x: col * CELL + CELL / 2, z: row * CELL + CELL / 2 };
}

export function worldToCell({ x, z }) {
  return { col: Math.floor(x / CELL), row: Math.floor(z / CELL) };
}

// Desktop: a ~16:9 room at a whole-number pixel scale, rendering 300-700 px wide.
// Phones: a 4:3 room 240 px wide, scaled to fill the width.
export function frameFor(vw, vh, hudH, isPhone) {
  if (isPhone) return { renderW: 240, renderH: 180, scale: vw / 240 };
  const cssW = Math.min(vw - 32, ((vh - hudH) * 16) / 9);
  const scale = Math.max(1, Math.round(cssW / 480));
  const renderW = Math.floor(cssW / scale);
  return { renderW, renderH: Math.floor((renderW * 9) / 16), scale };
}

export function clampZoom(z) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}

export function clampSwing(offsetDeg) {
  return Math.min(SWING_MAX, Math.max(SWING_MIN, offsetDeg));
}

function place(yawDeg, d) {
  const yaw = yawDeg * RAD, p = PITCH * RAD;
  return {
    x: TARGET.x + d * Math.sin(yaw) * Math.cos(p),
    y: TARGET.y + d * Math.sin(p),
    z: TARGET.z + d * Math.cos(yaw) * Math.cos(p),
  };
}

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const norm = (a) => { const l = Math.hypot(a.x, a.y, a.z); return { x: a.x / l, y: a.y / l, z: a.z / l }; };

export function projectNdc(pose, aspect, point) {
  const f = norm(sub(pose.target, pose.position));
  const r = norm(cross(f, { x: 0, y: 1, z: 0 }));
  const u = cross(r, f);
  const d = sub(point, pose.position);
  const t = Math.tan((pose.fov * RAD) / 2);
  const depth = dot(d, f);
  return { x: dot(d, r) / (depth * t * aspect), y: dot(d, u) / (depth * t) };
}

const fitCache = new Map();
// The smallest distance at which the whole room sits inside ±0.95 NDC at the default yaw.
function fitDistance(aspect) {
  const key = aspect.toFixed(4);
  if (fitCache.has(key)) return fitCache.get(key);
  const fits = (d) => {
    const pose = { position: place(DEFAULT_YAW, d), target: TARGET, fov: FOV };
    return CORNERS.every((c) => { const n = projectNdc(pose, aspect, c); return Math.abs(n.x) <= 0.95 && Math.abs(n.y) <= 0.95; });
  };
  let lo = 100, hi = 2000;
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (fits(mid)) hi = mid; else lo = mid; }
  fitCache.set(key, hi);
  return hi;
}

// The camera for a swing offset (clamped). Distance is fitted at the default yaw, so swinging never zooms.
export function cameraPose(yawOffset, aspect, zoom = 1) {
  const d = fitDistance(aspect) * zoom;
  return { position: place(DEFAULT_YAW + clampSwing(yawOffset), d), target: { ...TARGET }, fov: FOV };
}

// Which way a walk of (dx, dz) reads on screen for a camera at yawDeg: 'down' comes toward the camera.
export function facingFor(dx, dz, yawDeg) {
  const yaw = yawDeg * RAD;
  const r = dx * Math.cos(yaw) - dz * Math.sin(yaw);
  const t = dx * Math.sin(yaw) + dz * Math.cos(yaw);
  if (Math.abs(r) > Math.abs(t)) return r > 0 ? 'right' : 'left';
  return t > 0 ? 'down' : 'up';
}

// Column-major CSS matrix3d taking the w×h rectangle (0,0),(w,0),(w,h),(0,h) onto quad[0..3]
// (Heckbert's square-to-quad homography, with z passed through).
export function quadMatrix(w, h, quad) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = quad;
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  const den = dx1 * dy2 - dx2 * dy1;
  const g = (dx3 * dy2 - dx2 * dy3) / den;
  const hh = (dx1 * dy3 - dx3 * dy1) / den;
  const a = x1 - x0 + g * x1, b = x3 - x0 + hh * x3;
  const d = y1 - y0 + g * y1, e = y3 - y0 + hh * y3;
  return [a / w, d / w, 0, g / w, b / h, e / h, 0, hh / h, 0, 0, 1, 0, x0, y0, 0, 1];
}

export function quadTransform(w, h, quad) {
  return `matrix3d(${quadMatrix(w, h, quad).map((n) => +n.toFixed(6)).join(', ')})`;
}
