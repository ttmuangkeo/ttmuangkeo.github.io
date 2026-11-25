// Behavioural tests for the pixel room in headless Chrome with real key events.
// Run from the repo root:  node _tests/room.browser.mjs
// Starts its own static server and Chrome; exits non-zero if any scenario fails.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const httpPort = 8600 + Math.floor(Math.random() * 300);
const cdpPort = 9600 + Math.floor(Math.random() * 300);
const BASE = `http://127.0.0.1:${httpPort}/`;

const server = spawn('python3', ['-m', 'http.server', String(httpPort), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'room-test-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${prof}`, '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
const cleanup = () => { try { chrome.kill(); server.kill(); fs.rmSync(prof, { recursive: true, force: true, maxRetries: 5 }); } catch { /* ignore */ } };

let tabs;
for (let i = 0; i < 60; i++) { try { tabs = await (await fetch(`http://127.0.0.1:${cdpPort}/json`)).json(); await fetch(BASE); break; } catch { await sleep(150); } }
const ws = new WebSocket(tabs.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = {};
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) { pend[d.id](d.result || d.error); delete pend[d.id]; } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (e) => (await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })).result?.value;
const key = async (k, kc, mods = 0) => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: k, windowsVirtualKeyCode: kc, modifiers: mods, text: k === 'Enter' ? '\r' : undefined });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k, windowsVirtualKeyCode: kc, modifiers: mods });
  await sleep(80);
};
await send('Runtime.enable'); await send('Page.enable');
let injected = null;
async function open({ w = 1280, h = 800, mobile = false, before = '' } = {}) {
  if (injected) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: injected });
  injected = (await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__errs = []; addEventListener('error', (e) => window.__errs.push(String(e.message))); addEventListener('unhandledrejection', (e) => window.__errs.push(String(e.reason))); try { localStorage.clear(); } catch {} ${before}` })).identifier;
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
  await send('Page.navigate', { url: 'about:blank' }); await sleep(150);
  await send('Page.navigate', { url: BASE }); await sleep(1500);
}
const panel = () => ev(`({ open: document.getElementById('panel').open, obj: document.getElementById('panel').dataset.object })`);

const results = [];
const ONLY = process.env.ONLY; // ONLY="part of a name" runs just the matching scenarios
async function scenario(name, fn) {
  if (ONLY && !name.includes(ONLY)) return;
  const t0 = Date.now();
  try { const why = await fn(); results.push([name, !why, why || '']); }
  catch (e) { results.push([name, false, String(e)]); }
  if (process.env.VERBOSE) console.log(`  ${((Date.now() - t0) / 1000).toFixed(1)}s ${name}`);
}

await scenario('shift+tab right after opening stays inside the panel', async () => {
  await open();
  await ev(`document.querySelector('[data-object="laptop"]').focus()`);
  await key('Enter', 13); await sleep(2500);
  if (!(await panel()).open) return 'panel did not open';
  await key('Tab', 9, 8); // Shift+Tab
  const inside = await ev(`document.getElementById('panel').contains(document.activeElement)`);
  return inside ? '' : `focus escaped to ${await ev('document.activeElement.textContent.trim().slice(0,20)')}`;
});

await scenario('clicking a new object during a use animation opens the new panel only', async () => {
  await open();
  await ev(`document.querySelector('[data-object="logbook"]').click()`);
  // wait until Tim stands at the logbook spot, then click the mailbox mid-animation
  for (let i = 0; i < 60; i++) { if ((await ev(`(() => { const t = document.querySelector('.tim').style; return t.getPropertyValue('--x') + ',' + t.getPropertyValue('--y'); })()`)) === '79,68') break; await sleep(40); } // 79,68: Tim at the binder's use spot (10,10)
  await sleep(150);
  await ev(`document.querySelector('[data-object="mailbox"]').click()`);
  for (let i = 0; i < 35; i++) {
    const p = await panel();
    if (p.open && p.obj !== 'mailbox') return `wrong panel opened: ${p.obj}`;
    await sleep(100);
  }
  const p = await panel();
  return p.open && p.obj === 'mailbox' ? '' : `panel ${JSON.stringify(p)}`;
});

await scenario('a panel never pops open after the visitor opened another one', async () => {
  await open();
  await ev(`document.querySelector('[data-object="camera"]').click()`);
  await sleep(200);
  await ev(`document.querySelector('[data-hud="contact"]').click()`); // mailbox opens right away
  await sleep(400);
  await ev(`document.getElementById('panel').close()`);
  await sleep(2500); // Tim's earlier camera walk must not open its panel now
  const p = await panel();
  return p.open ? `stray panel opened: ${p.obj}` : '';
});

await scenario('HUD Get in touch works while another panel is open', async () => {
  await open();
  await ev(`document.querySelector('[data-object="map"]').click()`); await sleep(2600);
  await ev(`document.querySelector('[data-hud="contact"]').click()`); await sleep(500);
  const p = await panel();
  return p.open && p.obj === 'mailbox' ? '' : `panel ${JSON.stringify(p)}`;
});

await scenario('HUD Get in touch works after a panel was closed while loading', async () => {
  await open({ before: `const f = window.fetch; window.fetch = (u, o) => String(u).includes('/story/') ? new Promise(() => {}) : f(u, o);` });
  await ev(`document.querySelector('[data-hud="contact"]').click()`); await sleep(300);
  await key('Escape', 27); await sleep(200);
  await ev(`document.querySelector('[data-hud="contact"]').click()`); await sleep(300);
  const p = await panel();
  return p.open && p.obj === 'mailbox' ? '' : `second open ignored: ${JSON.stringify(p)}`;
});

await scenario('mailbox panel still shows the email when the story fails to load', async () => {
  await open({ before: `const f = window.fetch; window.fetch = (u, o) => String(u).includes('/story/') ? Promise.reject(new Error('offline')) : f(u, o);` });
  await ev(`document.querySelector('[data-hud="contact"]').click()`); await sleep(600);
  const has = await ev(`!!document.querySelector('#panel a[href^="mailto:tim.muangkeo@gmail.com"]')`);
  return has ? '' : 'no mailto link in the mailbox panel';
});

await scenario('phones show the role in the HUD', async () => {
  await open({ w: 375, h: 812, mobile: true });
  const r = await ev(`(() => { const e = document.querySelector('.hud-role'); const b = e.getBoundingClientRect(); return getComputedStyle(e).display !== 'none' && b.width > 0 && b.height > 0; })()`);
  return r ? '' : 'role hidden on phones';
});

await scenario('completion bubble message is fully visible on phones', async () => {
  await open({ w: 375, h: 812, mobile: true, before: `try { localStorage.setItem('tim-room-found', JSON.stringify(['pennant','map','laptop','pager','logbook','keys','camera','rack'])); } catch {}` });
  // the injected clear() runs first, then our setItem
  await ev(`document.querySelector('.tray-btn[data-object="mailbox"]').click()`); await sleep(2600);
  await ev(`document.getElementById('panel').close()`); await sleep(300);
  const r = await ev(`(() => { const b = document.querySelector('#room .bubble'); if (!b) return 'no bubble'; const room = document.getElementById('room').getBoundingClientRect(); const br = b.getBoundingClientRect(); return br.top >= room.top - 1 && br.bottom <= room.bottom + 1 && br.left >= -1 && br.right <= innerWidth + 1 ? '' : 'bubble outside the room: ' + Math.round(br.top) + ' vs room ' + Math.round(room.top); })()`);
  return r;
});

await scenario('panel header is not hidden under a wrapped HUD at mid widths', async () => {
  await open({ w: 700, h: 600 });
  await ev(`document.querySelector('[data-hud="contact"]').click()`); await sleep(500);
  const r = await ev(`(() => { const hud = document.querySelector('.hud').getBoundingClientRect(); const p = document.getElementById('panel').getBoundingClientRect(); return { hud: Math.round(hud.bottom), panel: Math.round(p.top) }; })()`);
  return r.panel >= r.hud ? '' : `panel top ${r.panel} under HUD bottom ${r.hud}`;
});

const hold = async (k, kc, ms) => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: k, windowsVirtualKeyCode: kc });
  await sleep(ms);
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k, windowsVirtualKeyCode: kc });
  await sleep(250);
};
const timXY = () => ev(`(() => { const t = document.querySelector('.tim').style; return [+t.getPropertyValue('--x'), +t.getPropertyValue('--y')]; })()`);
const reduceMotion = (on) => send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: on ? 'reduce' : 'no-preference' }] });

await scenario('arrow keys walk Tim and E uses what he is standing next to', async () => {
  await open();
  const [, y0] = await timXY();
  await hold('ArrowUp', 38, 1200); // from the rug straight up to the wall, under the trail map
  const [, y1] = await timXY();
  if (!(y1 < y0 - 20)) return `Tim did not walk up: ${y0} -> ${y1}`;
  const tip = await ev(`document.querySelector('#room .tip').hidden ? '' : document.querySelector('#room .tip').textContent`);
  if (tip !== 'E · Trail map') return `reach hint was ${JSON.stringify(tip)}`;
  await key('e', 69); await sleep(2200);
  const p = await panel();
  return p.open && p.obj === 'map' ? '' : `panel ${JSON.stringify(p)}`;
});

await scenario('the Konami code brings up the northern lights', async () => {
  await open();
  const before = await ev(`document.getElementById('room').dataset.sky`);
  if (!/^(dawn|day|dusk|night)(_rain)?$/.test(before || '')) return `window sky is ${before}`;
  for (const [k, kc] of [['ArrowUp', 38], ['ArrowUp', 38], ['ArrowDown', 40], ['ArrowDown', 40], ['ArrowLeft', 37], ['ArrowRight', 39], ['ArrowLeft', 37], ['ArrowRight', 39], ['b', 66], ['a', 65]]) await key(k, kc);
  const sky = await ev(`document.getElementById('room').dataset.sky`);
  return sky === 'aurora' ? '' : `sky is ${sky}`;
});

await scenario('the pager panel runs a triage ticket to a verdict, then Get in touch works', async () => {
  await reduceMotion(true);
  try {
    await open();
    await ev(`document.querySelector('[data-object="pager"]').click()`); await sleep(1500);
    if ((await panel()).obj !== 'pager') return 'pager panel did not open';
    await ev(`document.querySelector('#panel .inc-callout button').click()`); await sleep(300);
    if ((await panel()).obj !== 'incident') return `triage panel did not open: ${JSON.stringify(await panel())}`;
    await ev(`document.querySelector('#panel [data-guess="bug"]').click()`); await sleep(400);
    const r = await ev(`(() => { const d = document.getElementById('panel'); return { lines: d.querySelectorAll('.inc-log p').length, done: !d.querySelector('.inc-result').hidden, focus: d.contains(document.activeElement), score: d.querySelector('.inc-score').textContent }; })()`);
    if (!(r.lines >= 6 && r.done && r.focus && /^0\.\d\d$/.test(r.score))) return `triage run incomplete: ${JSON.stringify(r)}`;
    await ev(`[...document.querySelectorAll('#panel .inc-actions button')].find((b) => b.textContent === 'Get in touch').click()`); await sleep(500);
    const p = await panel();
    return p.open && p.obj === 'mailbox' ? '' : `Get in touch opened ${JSON.stringify(p)}`;
  } finally { await reduceMotion(false); }
});

await scenario('the pager goes off once per visit and Triage it opens the game', async () => {
  const fast = `const st = window.setTimeout; window.setTimeout = (f, ms, ...a) => st(f, ms === 15000 ? 50 : ms, ...a);`;
  await open({ w: 1280, h: 720, before: `try { sessionStorage.clear(); } catch {} ${fast}` }); // scale 4: least room right of the pager
  const bubble = await ev(`!!document.querySelector('#room .bubble--pager') && document.querySelector('[data-object="pager"]').classList.contains('is-buzzing')`);
  if (!bubble) return 'pager did not buzz';
  const fit = await ev(`(() => { const b = document.querySelector('#room .bubble--pager').getBoundingClientRect(); const r = document.getElementById('room').getBoundingClientRect(); return { inside: b.left >= r.left && b.right <= r.right && b.top >= r.top, w: Math.round(b.width), h: Math.round(b.height) }; })()`);
  if (!fit.inside || fit.w < 1.5 * fit.h) return `pager bubble squeezed or outside the room: ${JSON.stringify(fit)}`;
  await ev(`document.querySelector('#room .bubble--pager .bubble-btn--ink').click()`); await sleep(300);
  const p = await panel();
  if (!(p.open && p.obj === 'incident')) return `Triage it opened ${JSON.stringify(p)}`;
  await open({ before: fast });
  return (await ev(`!!document.querySelector('#room .bubble--pager')`)) ? 'pager buzzed again in the same visit' : '';
});

await scenario('the server rack runs the EWS to Graph cutover while the agent view stays put', async () => {
  await reduceMotion(true);
  try {
    await open();
    await ev(`document.querySelector('[data-object="rack"]').click()`); await sleep(1800);
    if ((await panel()).obj !== 'rack') return `rack panel did not open: ${JSON.stringify(await panel())}`;
    const sees = () => ev(`[...document.querySelectorAll('#panel .mig-sees li')].map((li) => li.textContent)`);
    const before = await sees();
    const first = await ev(`document.querySelector('#panel .mig-id').textContent`);
    if (!/[+/]/.test(first)) return `ids do not start in EWS form: ${first}`;
    for (let i = 0; i < 6; i++) {
      const mid = await sees();
      if (i < 5 && JSON.stringify(mid) !== JSON.stringify(before)) return `agent view changed before stage ${i + 1}`;
      if (i === 3 && (await ev(`document.querySelector('#panel .mig-pill').textContent`)) !== 'sync=false') return 'sync was not paused before the transform';
      await ev(`document.querySelector('#panel .mig-go').focus(); document.querySelector('#panel .mig-go').click()`); await sleep(300);
    }
    const r = await ev(`(() => { const d = document.getElementById('panel'); return { ids: [...d.querySelectorAll('.mig-id')].map((c) => c.textContent), pill: d.querySelector('.mig-pill').textContent, done: !d.querySelector('.mig-result').hidden, focus: d.contains(document.activeElement) }; })()`);
    if (r.ids.some((x) => /[+/]/.test(x)) || r.pill !== 'sync=true' || !r.done || !r.focus) return `cutover incomplete: ${JSON.stringify(r)}`;
    const after = await sees();
    if (after.length !== before.length + 1 || JSON.stringify(after.slice(0, before.length)) !== JSON.stringify(before)) return `agent view changed: ${JSON.stringify(after)}`;
    if (!(await ev(`document.querySelector('[data-object="rack"]').classList.contains('is-found')`))) return 'rack not marked found';
    await ev(`[...document.querySelectorAll('#panel .inc-actions button')].find((b) => b.textContent === 'Run it again').click()`); await sleep(200);
    const reset = await ev(`({ id: document.querySelector('#panel .mig-id').textContent, n: document.querySelectorAll('#panel .mig-sees li').length })`);
    if (reset.id !== first || reset.n !== before.length) return `Run it again did not reset: ${JSON.stringify(reset)}`;
    await ev(`document.getElementById('panel').close()`); await sleep(200);
    await ev(`document.querySelector('[data-object="rack"]').click()`); await sleep(1800);
    for (let i = 0; i < 6; i++) { await ev(`document.querySelector('#panel .mig-go').click()`); await sleep(250); }
    await ev(`[...document.querySelectorAll('#panel .inc-actions button')].find((b) => b.textContent === 'Get in touch').click()`); await sleep(500);
    const p = await panel();
    return p.open && p.obj === 'mailbox' ? '' : `Get in touch opened ${JSON.stringify(p)}`;
  } finally { await reduceMotion(false); }
});

await scenario('closing the rack mid-run stops it cleanly, and the Incident log links to it', async () => {
  await open();
  await ev(`document.querySelector('[data-object="pager"]').click()`);
  let btn = [];
  for (let i = 0; i < 50 && !btn.length; i++) { await sleep(100); btn = await ev(`[...document.querySelectorAll('#panel .inc-callout button')].map((b) => b.textContent)`); }
  if (!btn.includes('▶ Run the cutover')) return `no cutover callout: ${JSON.stringify(btn)}`;
  await ev(`[...document.querySelectorAll('#panel .inc-callout button')].find((b) => b.textContent === '▶ Run the cutover').click()`); await sleep(300);
  if ((await panel()).obj !== 'rack') return 'callout did not open the rack panel';
  await ev(`document.querySelector('#panel .mig-go').click()`); await sleep(150);
  await key('Escape', 27); await sleep(1500);
  const errs = await ev(`window.__errs || []`);
  const p = await panel();
  return !p.open && !errs.length ? '' : `after close: ${JSON.stringify({ p, errs })}`;
});

await scenario('on phones a tap on the monitors opens the monitors, not the pager', async () => {
  await open({ w: 375, h: 812, mobile: true });
  const hit = await ev(`(() => { const r = document.querySelector('[data-object="laptop"]').getBoundingClientRect(); return [0.6, 0.8, 0.95].map((k) => document.elementFromPoint(r.left + r.width * k, r.top + r.height / 2)?.closest('.obj')?.dataset.object); })()`);
  return hit.every((h) => h === 'laptop') ? '' : `taps hit ${JSON.stringify(hit)}`;
});

await scenario('the counter and tray count every object', async () => {
  await open({ w: 375, h: 812, mobile: true });
  const r = await ev(`({ hud: document.querySelector('.hud-found').textContent.replace(/\\s+/g, ' ').trim(), tray: document.querySelector('.tray-head').textContent, buttons: document.querySelectorAll('.tray-btn').length, cols: getComputedStyle(document.querySelector('.tray-grid')).gridTemplateColumns.split(' ').length, scroll: document.documentElement.scrollWidth > innerWidth })`);
  return r.hud === 'Found 0/12' && r.tray.endsWith('0/12') && r.buttons === 12 && r.cols === 3 && !r.scroll ? '' : JSON.stringify(r);
});

await scenario('the whiteboard shows four numbers on desktop and hides on phones', async () => {
  await open();
  await sleep(600);
  const r = await ev(`(() => {
    const wb = document.querySelector('[data-object="whiteboard"]').getBoundingClientRect();
    const lines = [...document.querySelectorAll('#room .board-overlay .board-line')];
    return { n: lines.length, texts: lines.map((l) => l.textContent.trim()),
      inside: lines.every((l) => { const b = l.getBoundingClientRect(); return b.width > 0 && b.left >= wb.left && b.right <= wb.right && b.top >= wb.top && b.bottom <= wb.bottom; }) };
  })()`);
  if (r.n !== 4 || r.texts.some((t) => !t) || !r.inside) return `desktop ${JSON.stringify(r)}`;
  await open({ w: 375, h: 812, mobile: true });
  await sleep(600);
  const shown = await ev(`(() => { const o = document.querySelector('#room .board-overlay'); return !!o && getComputedStyle(o).display !== 'none' && o.getBoundingClientRect().width > 0; })()`);
  return shown ? 'overlay visible on a phone' : '';
});

await scenario('the room fits a 1280x720 laptop with no scrolling', async () => {
  await open({ w: 1280, h: 720 });
  const r = await ev(`({ h: document.documentElement.scrollHeight, w: document.documentElement.scrollWidth, ih: innerHeight, iw: innerWidth })`);
  return r.h <= r.ih && r.w <= r.iw ? '' : JSON.stringify(r);
});

await scenario('a failed story fetch leaves the whiteboard empty without errors', async () => {
  await open({ before: `const f = window.fetch; window.fetch = (u, o) => String(u).includes('/story/') ? Promise.reject(new Error('offline')) : f(u, o);` });
  await sleep(600);
  const r = await ev(`({ errs: window.__errs, text: (document.querySelector('#room .board-overlay')?.textContent || '').trim() })`);
  return !r.errs.length && !r.text ? '' : JSON.stringify(r);
});

await scenario('every one of the twelve objects opens a panel with content', async () => {
  await open();
  const ids = await ev(`[...document.querySelectorAll('#room .obj')].map((b) => b.dataset.object)`);
  if (ids.length !== 12) return `${ids.length} objects`;
  const bad = [];
  for (const id of ids) {
    await ev(`document.querySelector('[data-object="${id}"]').click()`);
    let p = {};
    for (let i = 0; i < 50; i++) { await sleep(100); p = await ev(`(() => { const d = document.getElementById('panel'); return { open: d.open, obj: d.dataset.object, len: d.querySelector('.panel-body, .inc-log, .mig-log')?.textContent.trim().length || 0, loading: !!d.querySelector('.panel-loading') }; })()`); if (p.open && p.obj === id && p.len > 40 && !p.loading) break; }
    if (!(p.open && p.obj === id && p.len > 40)) bad.push(`${id}: ${JSON.stringify(p)}`);
    await key('Escape', 27); await sleep(300);
  }
  const errs = await ev(`window.__errs || []`);
  return bad.length || errs.length ? JSON.stringify({ bad, errs }) : '';
});

ws.close(); cleanup();
let failed = 0;
for (const [name, ok, why] of results) { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ': ' + why}`); if (!ok) failed++; }
process.exit(failed ? 1 : 0);
