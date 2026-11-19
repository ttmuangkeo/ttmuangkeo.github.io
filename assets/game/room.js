// Pixel room homepage: builds the room once JS runs. If anything throws, the static
// fallback (intro + story link) stays on screen instead of a blank page.
import { SPRITES, paintSprite } from './sprites.js';
import { OBJECTS, DECOR } from './objects.js';
import { fitScale, NATIVE_W, NATIVE_H } from './grid.js';

const doc = document;
const PHONE_QUERY = '(max-width: 640px), (orientation: portrait) and (max-width: 900px)';

// Absolutely positions an element in native room pixels; CSS multiplies by --s.
function place(el, x, y, w, h) {
  el.style.setProperty('--x', x);
  el.style.setProperty('--y', y);
  el.style.setProperty('--w', w);
  el.style.setProperty('--h', h);
  el.style.zIndex = String(10 + y + h); // deeper on screen = drawn in front
}

function spriteCanvas(key, frame = 0) {
  const c = paintSprite(SPRITES[key].frames[frame]);
  c.className = 'px';
  c.setAttribute('aria-hidden', 'true');
  return c;
}

function buildRoom(room) {
  const backdrop = spriteCanvas('room');
  backdrop.classList.add('layer');
  place(backdrop, 0, 0, NATIVE_W, NATIVE_H);
  backdrop.style.zIndex = '0';
  room.append(backdrop);

  for (const d of DECOR) {
    const s = SPRITES[d.sprite];
    const c = spriteCanvas(d.sprite);
    c.classList.add('layer');
    place(c, d.x, d.y, s.w, s.h);
    if (d.flat) c.style.zIndex = '1';
    room.append(c);
  }

  const tip = doc.createElement('div');
  tip.className = 'tip';
  tip.hidden = true;
  room.append(tip);

  const buttons = OBJECTS.map((o) => {
    const s = SPRITES[o.sprite];
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = 'obj';
    b.dataset.object = o.id;
    b.setAttribute('aria-label', o.ariaLabel);
    b.append(spriteCanvas(o.sprite));
    place(b, o.x, o.y, s.w, s.h);
    const show = () => {
      tip.textContent = o.label;
      place(tip, o.x + s.w / 2, Math.max(2, o.y - 7), 0, 0);
      tip.style.zIndex = '500';
      tip.hidden = false;
    };
    const hide = () => { tip.hidden = true; };
    b.addEventListener('pointerenter', show);
    b.addEventListener('focus', show);
    b.addEventListener('pointerleave', hide);
    b.addEventListener('blur', hide);
    room.append(b);
    return b;
  });
  return { buttons, tip };
}

function layout(room) {
  const hud = doc.querySelector('.hud');
  const hudH = hud ? hud.getBoundingClientRect().height : 0;
  const phone = matchMedia(PHONE_QUERY).matches;
  const vw = doc.documentElement.clientWidth;
  const s = fitScale(vw, innerHeight - 32, hudH, phone);
  room.style.setProperty('--s', s);
  doc.documentElement.classList.toggle('is-phone', phone);
}

export function init() {
  const room = doc.getElementById('room');
  try {
    if (!room) throw new Error('#room missing');
    const scene = buildRoom(room);
    layout(room);
    addEventListener('resize', () => layout(room));
    doc.documentElement.classList.add('game-ready');
    return scene;
  } catch (err) {
    console.error('Pixel room failed to start; showing the fallback.', err);
    doc.documentElement.classList.remove('game-ready');
    if (room) room.replaceChildren();
    return null;
  }
}

init();
