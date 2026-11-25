// Tiny element builder shared by the panel mini-games.
export function h(doc, tag, props = {}, ...kids) {
  const el = doc.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v);
  }
  el.append(...kids);
  return el;
}

// Absolutely positions an overlay element in render pixels; CSS multiplies by --s.
// Deeper on screen (larger y + h) stacks in front.
export function place(el, x, y, w, h) {
  el.style.setProperty('--x', x);
  el.style.setProperty('--y', y);
  el.style.setProperty('--w', w);
  el.style.setProperty('--h', h);
  el.style.zIndex = String(Math.round(10 + y + h));
}
