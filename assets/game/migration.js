// The server rack mini-game: Tim's EWS -> Microsoft Graph cutover, replayed one stage at a time.
// The backend IDs change underneath; what the agent sees never does. The account, records, IDs and
// credentials here are made up, and the panel says so. Only the swap rules are the real ones.
import { h } from './dom.js';

// EWS IDs use "/" and "+"; Graph IDs use "-" and "_". Every other character stays put.
export const toGraphId = (id) => id.replace(/\//g, '-').replace(/\+/g, '_');
export const toEwsId = (id) => id.replace(/-/g, '/').replace(/_/g, '+');
export const swappedAt = (ews) => [...ews].flatMap((c, i) => (c === '/' || c === '+' ? [i] : []));

export const RECORDS = [
  { kind: 'contact', label: 'Contact', detail: 'Dana Cho · buyer, pre-approved', ews: 'AAMkADk2Zj+QxR7/LmT0AAA=' },
  { kind: 'event', label: 'Calendar', detail: 'Showing · 412 Pine St · Thu 2:00 PM', ews: 'AAMkAGI2T/G5+bW9qN+0AAA=' },
  { kind: 'task', label: 'Task', detail: 'Send disclosure packet · due Fri', ews: 'AAMkAD/hc8+RwKp3/eVBAAA=' },
];
export const NEW_EVENT = { kind: 'event', label: 'Calendar', detail: 'Open house · 88 Cedar Ave · Sat 11:00 AM', id: 'AAMkAGQ1-x_Yp2Lk0nRwAAA=' };

// The real check, run on the demo records: everything converted, nothing else touched.
const converted = RECORDS.map((r) => toGraphId(r.ews));
const leftovers = converted.filter((g) => /[+/]/.test(g)).length;
const untouched = RECORDS.every((r, i) => [...r.ews].every((c, j) => swappedAt(r.ews).includes(j) || converted[i][j] === c));

export const STAGES = [
  { id: 'register', button: 'Register the app', lines: [
    ['azure', 'new app registration for Microsoft Graph'],
    ['azure', 'client_id ••••   tenant_id ••••'],
    ['azure', 'client secret •••• created'],
  ] },
  { id: 'permissions', button: 'Grant permissions', lines: [
    ['perm', 'Contacts.ReadWrite · contacts'],
    ['perm', 'Calendars.ReadWrite · calendar'],
    ['perm', 'Mail.Send · email sent from the CRM'],
    ['ok', 'admin consent granted'],
  ] },
  { id: 'pause', button: 'Pause sync', lines: [
    ['$', 'script 1: every account → sync=false'],
    ['ok', 'nothing reads or writes a mailbox while the IDs change'],
  ] },
  { id: 'transform', button: 'Transform IDs', lines: [
    ['$', 'script 2: transform stored IDs, exchange → ms_graph'],
    ['rule', '/ → -   + → _   every other character stays'],
    ['db', 'one transaction per agent, child records first, batches of 100'],
  ] },
  { id: 'check', button: 'Check the IDs', lines: [
    ['check', `${converted.length} of ${RECORDS.length} IDs converted`],
    ['check', `${leftovers} IDs still contain + or /`],
    ['check', untouched ? 'every other character matches the original' : 'a character changed that should not have'],
  ] },
  { id: 'resume', button: 'Resume sync', lines: [
    ['$', 'every account → sync=true'],
    ['graph', `first sync through Graph: 1 new event, ${RECORDS.length} records still linked`],
  ] },
];

const CAPTIONS = {
  ready: 'Synced and working. Watch this side while you run the cutover.',
  register: 'No change for Sam.',
  permissions: 'No change for Sam.',
  pause: 'Still no change. Sync is paused for a short window, and nothing here moves.',
  transform: 'Every ID underneath just changed. Sam sees the same records.',
  check: 'No change for Sam.',
  resume: 'One new event came in through Graph. Everything else is right where Sam left it.',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createMigrationPanel({ onContact, doc = globalThis.document } = {}) {
  function render(body, ctx) {
    let step = 0;
    let running = false;
    const pause = (ms = 380) => sleep(ctx.reduced ? 0 : ms);

    const pill = h(doc, 'span', { class: 'mig-pill', 'data-sync': 'on', text: 'sync=true' });
    const account = h(doc, 'p', { class: 'mig-account' },
      h(doc, 'span', { text: 'Sam Rivera · Harbor Realty · Microsoft 365' }), pill);

    const steps = h(doc, 'ol', { class: 'mig-steps' },
      ...STAGES.map((s, i) => h(doc, 'li', { 'data-state': i === 0 ? 'now' : 'todo', ...(i === 0 ? { 'aria-current': 'step' } : {}) }, s.button)));
    const go = h(doc, 'button', { type: 'button', class: 'bubble-btn bubble-btn--ink mig-go', onclick: () => runStage() });
    const setGo = () => { go.textContent = `▶ ${step + 1} of ${STAGES.length} · ${STAGES[step].button}`; };
    setGo();

    const log = h(doc, 'div', { class: 'inc-log mig-log', role: 'log', 'aria-live': 'polite', 'aria-label': 'Migration log', tabindex: '-1' });
    const line = (tag, text) => log.append(h(doc, 'p', {}, h(doc, 'span', { class: `inc-tag inc-tag--${tag}`, text: tag }), text));
    line('$', `ready: ${RECORDS.length} synced records stored with EWS IDs`);

    const idFormat = h(doc, 'span', { class: 'mig-format', text: 'EWS' });
    const idCells = RECORDS.map((r) => h(doc, 'code', { class: 'mig-id' }));
    const paintId = (cell, id, marks = []) => {
      cell.replaceChildren(...[...id].map((c, i) => (marks.includes(i) ? h(doc, 'mark', { text: c }) : c)));
    };
    RECORDS.forEach((r, i) => paintId(idCells[i], r.ews));
    const ids = h(doc, 'table', { class: 'mig-ids' },
      h(doc, 'caption', {}, 'Stored IDs · ', idFormat),
      h(doc, 'tbody', {}, ...RECORDS.map((r, i) => h(doc, 'tr', {}, h(doc, 'th', { scope: 'row', text: r.label }), h(doc, 'td', {}, idCells[i])))));

    const item = (r) => h(doc, 'li', { 'data-kind': r.kind }, h(doc, 'span', { class: 'mig-kind', text: r.label }), r.detail);
    const sees = h(doc, 'ul', { class: 'mig-sees' }, ...RECORDS.map(item));
    const caption = h(doc, 'p', { class: 'mig-caption', 'aria-live': 'polite', text: CAPTIONS.ready });

    const result = h(doc, 'div', { class: 'inc-result mig-result', hidden: '' });

    body.replaceChildren(
      h(doc, 'p', { class: 'inc-note', text: 'Simulated cutover. This replays how I moved every mailbox from EWS to Microsoft Graph before Microsoft retired EWS. The account, records, IDs and credentials are made up; the two swap rules are the real ones.' }),
      account,
      steps,
      h(doc, 'div', { class: 'mig-split' },
        h(doc, 'section', { class: 'mig-side', 'aria-label': 'Backend' }, h(doc, 'h3', { text: 'Backend' }), ids, log),
        h(doc, 'section', { class: 'mig-side mig-side--agent', 'aria-label': 'What Sam sees' },
          h(doc, 'h3', { text: 'What Sam sees' }), h(doc, 'div', { class: 'mig-app' }, sees), caption)),
      h(doc, 'p', { class: 'mig-go-row' }, go), // after the split, pinned to the panel's bottom edge
      result,
    );

    const setSync = (on) => { pill.dataset.sync = on ? 'on' : 'off'; pill.textContent = on ? 'sync=true' : 'sync=false'; };

    async function transformIds() {
      for (const [i, r] of RECORDS.entries()) {
        const at = swappedAt(r.ews);
        let id = r.ews;
        for (const [k, pos] of at.entries()) {
          await pause(160);
          if (!ctx.alive()) return false;
          id = id.slice(0, pos) + toGraphId(id[pos]) + id.slice(pos + 1);
          paintId(idCells[i], id, at.slice(0, k + 1));
        }
        line('id', `${r.label.toLowerCase()} · ${at.length} characters swapped`);
      }
      idFormat.textContent = 'Graph';
      return true;
    }

    async function runStage() {
      if (running || step >= STAGES.length) return;
      running = true;
      go.setAttribute('aria-disabled', 'true');
      const s = STAGES[step];
      for (const [tag, text] of s.lines) {
        await pause();
        if (!ctx.alive()) return;
        line(tag, text);
        log.scrollTop = log.scrollHeight;
      }
      if (s.id === 'pause') setSync(false);
      if (s.id === 'transform' && !(await transformIds())) return;
      if (s.id === 'resume') {
        setSync(true);
        const fresh = item(NEW_EVENT);
        fresh.classList.add('is-new');
        sees.append(fresh);
      }
      caption.textContent = CAPTIONS[s.id];
      log.scrollTop = log.scrollHeight;

      const lis = steps.children;
      lis[step].dataset.state = 'done';
      lis[step].removeAttribute('aria-current');
      step++;
      running = false;
      go.removeAttribute('aria-disabled');
      if (step < STAGES.length) {
        lis[step].dataset.state = 'now';
        lis[step].setAttribute('aria-current', 'step');
        setGo();
        return;
      }
      await pause();
      if (!ctx.alive()) return;
      finish();
    }

    function finish() {
      go.parentElement.hidden = true;
      const headline = h(doc, 'p', { class: 'inc-verdict', tabindex: '-1', text: 'Sam never noticed.' });
      result.replaceChildren(
        headline,
        h(doc, 'p', { text: 'Across 500+ companies and 500K+ users, nobody did. When Microsoft retired EWS, every reachable mailbox was already on Graph.' }),
        h(doc, 'p', { class: 'inc-foot', text: 'The same two rules run in reverse, so the move could be undone if it ever had to be.' }),
        h(doc, 'p', { class: 'inc-actions' },
          h(doc, 'button', { type: 'button', class: 'bubble-btn bubble-btn--ink', text: 'Run it again', onclick: () => { render(body, ctx); body.scrollTop = 0; body.querySelector('.mig-go')?.focus(); } }),
          h(doc, 'button', { type: 'button', class: 'bubble-btn', text: 'Get in touch', onclick: () => onContact?.() })),
      );
      result.hidden = false;
      result.scrollIntoView?.({ block: 'nearest' });
      headline.focus();
    }
  }

  return { title: 'The EWS → Graph cutover', story: '#features', render };
}
