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
  injected = (await send('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.clear(); } catch {} ${before}` })).identifier;
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
  await send('Page.navigate', { url: 'about:blank' }); await sleep(150);
  await send('Page.navigate', { url: BASE }); await sleep(1500);
}
const panel = () => ev(`({ open: document.getElementById('panel').open, obj: document.getElementById('panel').dataset.object })`);

const results = [];
async function scenario(name, fn) {
  try { const why = await fn(); results.push([name, !why, why || '']); }
  catch (e) { results.push([name, false, String(e)]); }
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
  for (let i = 0; i < 60; i++) { if ((await ev(`(() => { const t = document.querySelector('.tim').style; return t.getPropertyValue('--x') + ',' + t.getPropertyValue('--y'); })()`)) === '31,36') break; await sleep(40); }
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
  await open({ w: 375, h: 812, mobile: true, before: `try { localStorage.setItem('tim-room-found', JSON.stringify(['pennant','map','laptop','pager','logbook','keys','camera'])); } catch {}` });
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

ws.close(); cleanup();
let failed = 0;
for (const [name, ok, why] of results) { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ': ' + why}`); if (!ok) failed++; }
process.exit(failed ? 1 : 0);
