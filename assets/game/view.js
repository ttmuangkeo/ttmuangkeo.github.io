// Pure geometry for the 3D room: cells and world units, the render frame, the camera,
// camera-relative facing, and the CSS transform that pins HTML onto a projected quad.
// World units are sprite pixels: x runs 0 (left wall) to 240, z runs 0 (back wall) to 112
// toward the camera, and y runs 0 (floor) to 72 (top of the walls). No DOM, no Three.js.

export const CELL = 8;
export const WALL_H = 72;
export const ROOM_W = 240;
export const ROOM_D = 112;

// Two camera poses, blended by zoom: an eye-level RPG camera that follows Tim (zoom 1) and the
// whole-room overview (ZOOM_MAX), reached by scrolling out on desktop.
export const DEFAULT_YAW = 18; // overview, degrees; turned toward the left wall so its slats read
export const PITCH = 50;       // overview, degrees looking down
export const FOV = 35;         // overview vertical field of view, degrees
export const FOLLOW_YAW = 10;
export const FOLLOW_PITCH = 30;
export const FOLLOW_FOV = 40;
export const FOLLOW_DIST = 160;
export const FOLLOW_Y = 24;    // height of the point the follow camera looks at
export const FOLLOW_LEAD = 16; // the camera looks this far behind Tim (toward the back wall)
export const SWING_MIN = -10;  // degrees; any further and the camera nears the left wall's plane
export const SWING_MAX = 30;
export const ZOOM_MIN = 1;     // eye level, following Tim
export const ZOOM_MAX = 2;     // the whole room

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

function orbit(target, yawDeg, pitchDeg, d) {
  const yaw = yawDeg * RAD, p = pitchDeg * RAD;
  return {
    x: target.x + d * Math.sin(yaw) * Math.cos(p),
    y: target.y + d * Math.sin(p),
    z: target.z + d * Math.cos(yaw) * Math.cos(p),
  };
}
const place = (yawDeg, d) => orbit(TARGET, yawDeg, PITCH, d);

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
  return { x: dot(d, r) / (depth * t * aspect), y: dot(d, u) / (depth * t), depth };
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

function overviewPose(yawOffset, aspect) {
  return { position: place(DEFAULT_YAW + clampSwing(yawOffset), fitDistance(aspect)), target: { ...TARGET }, fov: FOV };
}

function followPose(focus, yawOffset) {
  const target = { x: focus.x, y: FOLLOW_Y, z: focus.z };
  return { position: orbit(target, FOLLOW_YAW + clampSwing(yawOffset), FOLLOW_PITCH, FOLLOW_DIST), target, fov: FOLLOW_FOV };
}

// A point is off screen when it is behind the camera, above/below the frame, or past `side` (-1 left, +1 right).
const offFrame = (pose, aspect, p, side) => {
  const n = projectNdc(pose, aspect, p);
  return n.depth <= 0 || Math.abs(n.y) > 1 || side * n.x >= 1;
};
// The largest (dir +1) or smallest (dir -1) value in [lo, hi] for which ok holds, ok being monotone.
function edge(ok, lo, hi, dir) {
  if (dir < 0) [lo, hi] = [hi, lo];
  if (!ok(lo)) return null;
  for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (ok(mid)) lo = mid; else hi = mid; }
  return lo;
}
const H_SAMPLES = [0, WALL_H / 2, WALL_H];

export const APRON = 48;       // floor past the open front, so the eye-level camera never shows the void below it
const FOCUS_Z_MIN = 24;        // near the back wall the camera stops, keeping the wall's top in frame
const FOCUS_Z_MAX = ROOM_D - FOLLOW_LEAD;

const xCache = new Map();
// How far the follow camera (at no swing, looking at depth z) may slide sideways before the frame
// shows past the open front edge of either side wall.
function xBounds(aspect, z) {
  const key = `${aspect.toFixed(4)}:${z}`;
  if (xCache.has(key)) return xCache.get(key);
  const pose = (x) => followPose({ x, z }, 0);
  const xMax = edge((x) => H_SAMPLES.every((y) => offFrame(pose(x), aspect, { x: ROOM_W, y, z: ROOM_D }, 1)), 0, ROOM_W, 1);
  const xMin = edge((x) => H_SAMPLES.every((y) => offFrame(pose(x), aspect, { x: 0, y, z: ROOM_D }, -1)), 0, ROOM_W, -1);
  const b = xMax === null || xMin === null || xMin > xMax ? [ROOM_W / 2, ROOM_W / 2] : [xMin, xMax];
  xCache.set(key, b);
  return b;
}

// Where the follow camera looks for Tim (or any floor point) at (x, z): a little behind him, kept inside the room.
export function followFocus(point, aspect) {
  const z = Math.round(Math.min(FOCUS_Z_MAX, Math.max(FOCUS_Z_MIN, point.z - FOLLOW_LEAD)));
  const [x0, x1] = xBounds(aspect, z);
  return { x: Math.min(x1, Math.max(x0, point.x)), z };
}

const lerp = (a, b, t) => a + (b - a) * t;
const lerp3 = (a, b, t) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t) });
// 0 at eye level, 1 at the overview, eased so the swoop starts and lands gently.
export function zoomBlend(zoom) {
  const t = (clampZoom(zoom) - ZOOM_MIN) / (ZOOM_MAX - ZOOM_MIN);
  return t * t * (3 - 2 * t);
}

// The camera's yaw (degrees) at a swing and zoom; walking sprites face relative to this.
export function cameraYaw(yawOffset, zoom = ZOOM_MIN) {
  return lerp(FOLLOW_YAW, DEFAULT_YAW, zoomBlend(zoom)) + clampSwing(yawOffset);
}

// The camera for a swing offset (clamped), a zoom, and the follow focus (already clamped by followFocus;
// defaults to the middle of the room). Zoom 1 is eye level, ZOOM_MAX the fitted whole-room overview.
export function cameraPose(yawOffset, aspect, zoom = ZOOM_MIN, focus = null) {
  const t = zoomBlend(zoom);
  const near = followPose(focus ?? followFocus({ x: ROOM_W / 2, z: ROOM_D / 2 }, aspect), yawOffset);
  if (t === 0) return near;
  const far = overviewPose(yawOffset, aspect);
  if (t === 1) return far;
  return { position: lerp3(near.position, far.position, t), target: lerp3(near.target, far.target, t), fov: lerp(near.fov, far.fov, t) };
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
