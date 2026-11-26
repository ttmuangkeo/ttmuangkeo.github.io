// The 3D office: renderer, an eye-level camera that follows Tim (scroll out for the whole room),
// lights, the room shell and the props.
// Renders at a low resolution and lets CSS scale it up crisp. Everything the HTML overlays
// need (projection, picking, prop rectangles) is in render pixels, origin top-left.
// createWorld throws when WebGL is unavailable; the caller falls back to the static page.
import * as THREE from 'three';
import { cameraPose, cameraYaw, followFocus, zoomBlend, clampSwing, clampZoom, worldToCell, ROOM_W, ROOM_D, WALL_H, APRON } from './view.js';
import { ROOM, OBJECTS } from './objects.js';
import { spriteTexture, refreshTextures } from './textures.js';
import { buildProps } from './props.js';

const OBJECT_IDS = new Set(OBJECTS.map((o) => o.id));
const FRAME_MS = 33;           // at most ~30 fps
const SUN_K = 0.6, AMB_K = 0.8, LAMP_K = 90;
const FOLLOW_MS = 180;         // time constant of the camera easing after Tim (or a peeked prop)

function shell() {
  const g = new THREE.Group();
  const mat = (key) => new THREE.MeshLambertMaterial({ map: spriteTexture(key) });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W, ROOM_D), mat('floor'));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(ROOM_W / 2, 0, ROOM_D / 2);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W, WALL_H), mat('wall_back'));
  back.position.set(ROOM_W / 2, WALL_H / 2, 0);
  const left = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_D, WALL_H), mat('wall_left'));
  left.rotation.y = Math.PI / 2;
  left.position.set(0, WALL_H / 2, ROOM_D / 2);
  // Eye level only: a strip of floor past the open front, and a right wall closing the room.
  // The overview leaves both off, so it reads as the open cutaway it was.
  // (it runs past both side walls too, so the corners beyond their front edges are floor, not void)
  const apronW = ROOM_W + 2 * APRON;
  const apronGeo = new THREE.PlaneGeometry(apronW, APRON);
  const uv = apronGeo.attributes.uv;
  for (let i = 0; i < uv.count; i++) { // the floor texture's front strip, unstretched
    uv.setXY(i, (uv.getX(i) * apronW - APRON) / ROOM_W, uv.getY(i) * (APRON / ROOM_D));
  }
  const apron = new THREE.Mesh(apronGeo, mat('floor'));
  apron.rotation.x = -Math.PI / 2;
  apron.position.set(ROOM_W / 2, 0, ROOM_D + APRON / 2);
  const right = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_D, WALL_H), mat('wall_left'));
  right.rotation.y = -Math.PI / 2;
  right.position.set(ROOM_W, WALL_H / 2, ROOM_D / 2);
  for (const m of [floor, back, left, right, apron]) { m.receiveShadow = true; m.userData.key = 'shell'; }
  g.add(floor, back, left, right, apron);
  g.userData.eyeLevel = [right, apron];
  return g;
}

export function createWorld(container, frame) {
  const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const canvas = renderer.domElement;
  canvas.className = 'px world';
  canvas.setAttribute('aria-hidden', 'true');
  container.prepend(canvas);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#eee8da');
  const camera = new THREE.PerspectiveCamera(35, 16 / 9, 10, 4000);

  const hemi = new THREE.HemisphereLight(0xffffff, 0xd9c8a8, 0.5);
  const sun = new THREE.DirectionalLight(0xffffff, 0.8);
  sun.position.set(ROOM_W / 2 + 160, 220, ROOM_D / 2 + 200);
  sun.target.position.set(ROOM_W / 2, 0, ROOM_D / 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -200, right: 200, top: 200, bottom: -200, near: 1, far: 900 });
  sun.shadow.bias = -0.0015;
  sun.shadow.radius = 3;
  const tint = new THREE.AmbientLight(0x000000, 0);
  const lamps = [158, 180].map((x) => {
    const l = new THREE.PointLight(0xffd08a, 0, 160, 1);
    l.position.set(x + 4.5, WALL_H - 14, 16);
    return l;
  });
  const room = shell();
  scene.add(hemi, sun, sun.target, tint, ...lamps, room);

  const { group: props, entries } = buildProps();
  scene.add(props);

  let swing = 0, zoom = 1, dirty = true, last = 0, raf = 0, lost = false, mark = null;
  // The follow camera eases its focus toward the goal: a peeked prop if any, else Tim.
  let focus = null, subject = null, peeked = null, eased = 0;
  const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const goal = () => followFocus(peeked ?? subject ?? { x: ROOM_W / 2, z: ROOM_D / 2 }, camera.aspect);
  // Moves the focus toward the goal for the time since the last step; true once it has arrived.
  const ease = (now) => {
    const g = goal();
    const dt = Math.min(100, now - (eased || now));
    eased = now;
    if (!focus || still()) focus = g;
    else {
      const k = 1 - Math.exp(-dt / FOLLOW_MS);
      focus = { x: focus.x + (g.x - focus.x) * k, z: focus.z + (g.z - focus.z) * k };
      if (Math.hypot(g.x - focus.x, g.z - focus.z) < 0.05) focus = g;
    }
    return focus === g;
  };
  const renderCbs = [];
  const ray = new THREE.Raycaster();
  const v = new THREE.Vector3();

  const world = {
    canvas, scene, camera, renderer, entries, frame,

    resize(f) {
      world.frame = frame = f;
      renderer.setSize(f.renderW, f.renderH, false);
      canvas.style.width = `${f.renderW * f.scale}px`;
      canvas.style.height = `${f.renderH * f.scale}px`;
      camera.aspect = f.renderW / f.renderH;
      world.updateCamera();
    },
    updateCamera() {
      focus ??= goal();
      const p = cameraPose(swing, camera.aspect, zoom, focus);
      camera.position.set(p.position.x, p.position.y, p.position.z);
      camera.fov = p.fov;
      for (const m of room.userData.eyeLevel) m.visible = zoomBlend(zoom) < 0.5;
      camera.lookAt(p.target.x, p.target.y, p.target.z);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      world.invalidate();
    },
    setSwing(deg) { swing = clampSwing(deg); world.updateCamera(); },
    swing: () => swing,
    setZoom(z) { zoom = clampZoom(z); world.updateCamera(); },
    zoom: () => zoom,
    yaw: () => cameraYaw(swing, zoom),
    // Tim's floor position; the camera eases after it (the first call snaps there).
    follow(x, z) {
      const first = !subject;
      subject = { x, z };
      if (first) { focus = goal(); world.updateCamera(); } else world.invalidate();
    },
    // Look at a floor point instead of Tim (keyboard focus on an off-screen prop); null looks back.
    peek(p) { peeked = p ? { x: p.x, z: p.z } : null; world.invalidate(); },
    focus: () => focus && { ...focus },

    setFrame(key, i) { const e = entries.get(key); if (e?.setFrame) { e.setFrame(i); world.invalidate(); } },
    setSky(key, i) { entries.get('window').setSky(key, i); world.invalidate(); },
    setLight(light) {
      sun.color.set(light.sun.color); sun.intensity = light.sun.intensity * SUN_K;
      hemi.color.set(light.ambient.color); hemi.intensity = light.ambient.intensity * AMB_K;
      for (const l of lamps) l.intensity = light.lamps * LAMP_K;
      tint.color.set(light.tint ?? 0x000000); tint.intensity = light.tint === null ? 0 : 0.5;
      const glow = 0.25 + light.lamps * 0.5;
      for (const e of entries.values()) {
        if (e.material.emissiveMap) e.material.emissiveIntensity = e.highlighted ? glow + 0.5 : glow;
        if (e.billboard) { const k = Math.min(1, 0.35 + light.ambient.intensity * 0.6 + light.sun.intensity * 0.25); e.billboard.material.color.setScalar(k); }
      }
      world.light = light;
      world.invalidate();
    },
    highlight(key) {
      for (const e of entries.values()) {
        const on = e.key === key;
        if (on === !!e.highlighted || !e.material) continue;
        e.highlighted = on;
        if (e.material.emissiveMap) e.material.emissiveIntensity += on ? 0.5 : -0.5;
        else if (e.material.emissive) e.material.emissive.setScalar(on ? 0.18 : 0);
        else if (e.billboard) e.material.color.multiplyScalar(on ? 1.25 : 0.8);
      }
      world.invalidate();
    },

    project(p) {
      v.set(p.x, p.y, p.z).project(camera);
      return { x: ((v.x + 1) / 2) * frame.renderW, y: ((1 - v.y) / 2) * frame.renderH };
    },
    rectOf(key) {
      const b = entries.get(key).box;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
        const p = world.project({ x, y, z });
        x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
      }
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    },
    anchorOf(key) {
      const c = entries.get(key).corners;
      const s = c.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / c.length);
      return { x: s.x, y: s.y, z: s.z };
    },
    quadOf(key) { return entries.get(key).corners.map((p) => { const q = world.project(p); return [q.x, q.y]; }); },

    ndcAt(clientX, clientY) {
      const r = canvas.getBoundingClientRect();
      return new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -(((clientY - r.top) / r.height) * 2 - 1));
    },
    pickFloor(clientX, clientY) {
      ray.setFromCamera(world.ndcAt(clientX, clientY), camera);
      const hit = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
      if (!hit) return null;
      const cell = worldToCell({ x: hit.x, z: hit.z });
      return cell.col >= 0 && cell.col < ROOM.cols && cell.row >= 0 && cell.row < ROOM.rows ? cell : null;
    },
    pickObject(clientX, clientY) {
      ray.setFromCamera(world.ndcAt(clientX, clientY), camera);
      // the nearest thing under the pointer, walls and furniture included, counts only if it is an object
      const hit = ray.intersectObjects(scene.children, true).find((h) => h.object.visible && h.object.userData.key && !h.object.userData.noPick);
      const key = hit?.object.userData.key;
      return OBJECT_IDS.has(key) ? key : null;
    },

    // A small ring where a floor click sent Tim; it fades over 600 ms (shows still under reduced motion).
    markFloor(cell) {
      world.lastMark = { ...cell };
      if (mark) scene.remove(mark);
      const m = new THREE.Mesh(new THREE.RingGeometry(3, 5, 16), new THREE.MeshBasicMaterial({ color: 0xd9622b, transparent: true, depthWrite: false }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(cell.col * 8 + 4, 0.6, cell.row * 8 + 4);
      m.userData.noPick = true;
      mark = m;
      scene.add(m);
      world.invalidate();
      const t0 = performance.now();
      const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
      const fade = (now) => {
        if (mark !== m) return;
        const k = (now - t0) / 600;
        if (k >= 1) { scene.remove(m); mark = null; world.invalidate(); return; }
        if (!still) { m.material.opacity = 1 - k; m.scale.setScalar(1 + k * 0.4); world.invalidate(); }
        requestAnimationFrame(fade);
      };
      requestAnimationFrame(fade);
    },
    lastMark: null,

    add(obj) { scene.add(obj); world.invalidate(); },
    onRender(cb) { renderCbs.push(cb); },
    renderNow() {
      if (lost) return;
      const now = performance.now();
      const settled = ease(now);
      const p = cameraPose(swing, camera.aspect, zoom, focus);
      camera.position.set(p.position.x, p.position.y, p.position.z);
      camera.lookAt(p.target.x, p.target.y, p.target.z);
      camera.updateMatrixWorld();
      renderer.render(scene, camera);
      dirty = false;
      last = now;
      for (const cb of renderCbs) cb();
      if (!settled) world.invalidate(); else eased = 0;
    },
    invalidate() {
      dirty = true;
      if (raf) return;
      const tick = (now) => {
        raf = 0;
        if (!dirty || lost) return; // while the context is lost, the restore handler renders
        if (now - last >= FRAME_MS) world.renderNow();
        if (dirty && !raf) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    },
  };

  const contextCbs = [];
  world.onContext = (cb) => contextCbs.push(cb);
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; for (const cb of contextCbs) cb('lost'); });
  canvas.addEventListener('webglcontextrestored', () => { lost = false; refreshTextures(); world.renderNow(); for (const cb of contextCbs) cb('restored'); });

  world.resize(frame);
  return world;
}
