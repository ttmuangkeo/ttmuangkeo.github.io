// The pager mini-game: a simulated Jira ticket run through the steps of Tim's real
// Claude triage skill (read the ticket via the Atlassian MCP, score it, probe the repo).
// Every ticket, file name and number here is made up, and the panel says so.

export const VERDICTS = { bug: 'Real bug', 'not-bug': 'Not a bug', 'needs-info': 'Needs more info' };

export function verdictFor(score) {
  if (score >= 0.65) return 'bug';
  if (score <= 0.3) return 'not-bug';
  return 'needs-info';
}

export const TICKETS = [
  {
    key: 'SUP-1042', priority: 'High',
    title: 'Calendar events stopped syncing after a password reset',
    body: 'An agent reset their Microsoft 365 password on Tuesday. Since then, new Outlook events never show up in the CRM calendar. Other agents at the brokerage are fine.',
    signals: ['one user, started right after a password reset', 'Outlook only, Google accounts unaffected', '401 errors in the sync logs for this mailbox'],
    score: 0.86,
    probes: ['search the repo: "refresh_token" in the calendar sync', 'git log -S "invalid_grant" over the last 90 days'],
    finding: 'calendar_sync/token_refresh.rb gives up after invalid_grant instead of asking the user to reconnect',
    next: 'route to engineering with the repro steps and the suspect file',
    outcome: 'Escalated with the evidence attached. The fix prompts the agent to reconnect, and Support gets a heads-up for the next one.',
  },
  {
    key: 'SUP-1057', priority: 'Medium',
    title: 'Phone numbers missing on contacts imported from Google',
    body: 'Several agents say contacts pulled in from Gmail have no phone number in the CRM, even though the number is in Google Contacts.',
    signals: ['many users, all on Google accounts', 'only mobile numbers missing, work numbers fine', 'started after last week\'s contacts release'],
    score: 0.78,
    probes: ['search the repo: "phoneNumbers" in the contact mapper', 'diff last week\'s release for contact field mapping'],
    finding: 'contact_mapper.rb maps "home" and "work" phone types but drops "mobile"',
    next: 'route to engineering, link the release, flag the affected accounts',
    outcome: 'Escalated with the exact mapping gap. One-line fix plus a backfill for the affected contacts.',
  },
  {
    key: 'SUP-1063', priority: 'High',
    title: 'Emails stopped appearing in the CRM',
    body: 'A broker says none of their emails have shown up in the CRM since Friday. Marked urgent.',
    signals: ['one user, mailbox status is "disconnected" since Friday', 'no other accounts with the same symptom', 'no deploys to email sync in 14 days'],
    score: 0.18,
    probes: ['git log on the email sync service: no changes in 14 days', 'search error tracking: nothing new for other mailboxes'],
    finding: 'the mailbox was disconnected on the user\'s side; the sync is working as designed',
    next: 'send Support the reconnect steps; no engineering ticket needed',
    outcome: 'Support walked the broker through reconnecting in five minutes. Engineering never had to stop what they were doing.',
  },
  {
    key: 'SUP-1071', priority: 'Low',
    title: 'Search results look wrong',
    body: 'Customer says search is "showing the wrong stuff" sometimes.',
    signals: ['no account, search terms or example listing', 'no steps to reproduce', 'can\'t tell which search (contacts, listings or email)'],
    score: 0.42,
    probes: ['git log on search over 30 days: one unrelated change', 'search error tracking: no new errors'],
    finding: 'not enough detail to tie this to any code yet',
    next: 'ask the reporter for the account, the exact search and a screenshot, then re-score',
    outcome: 'The ticket goes back to Support with three specific questions instead of sitting in the engineering queue.',
  },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function h(doc, tag, props = {}, ...kids) {
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

// The panel definition the room's panel system renders (no story-page content).
export function createIncidentPanel({ onContact, doc = globalThis.document, start = Math.floor(Math.random() * TICKETS.length) } = {}) {
  let index = start;

  function render(body, ctx) {
    const t = TICKETS[index % TICKETS.length];
    const verdict = verdictFor(t.score);
    const guessRow = h(doc, 'p', { class: 'inc-guess-row' });
    const guess = h(doc, 'fieldset', { class: 'inc-guess' }, h(doc, 'legend', { text: 'Your call first: what is it?' }), guessRow);
    const log = h(doc, 'div', { class: 'inc-log', role: 'log', 'aria-live': 'polite', 'aria-label': 'Triage skill output', tabindex: '-1' });
    const bar = h(doc, 'span', { class: 'inc-bar-fill' });
    const scoreText = h(doc, 'span', { class: 'inc-score', text: '–' });
    const meter = h(doc, 'div', { class: 'inc-meter', 'data-verdict': verdict },
      h(doc, 'span', { class: 'inc-meter-label', text: 'Validity score' }),
      h(doc, 'span', { class: 'inc-bar', 'aria-hidden': 'true' }, bar), scoreText);
    const result = h(doc, 'div', { class: 'inc-result', hidden: '' });
    const run = h(doc, 'div', { class: 'inc-run', hidden: '' }, log, meter, result);

    for (const [id, label] of Object.entries(VERDICTS)) {
      guessRow.append(h(doc, 'button', {
        type: 'button', class: 'bubble-btn', 'data-guess': id, 'aria-pressed': 'false', text: label,
        onclick: (e) => runTriage(id, e.currentTarget),
      }));
    }

    body.replaceChildren(
      h(doc, 'p', { class: 'inc-note', text: 'Simulated ticket. This replays what my Claude triage skill does on every new Jira ticket: read it through the Atlassian MCP, score how likely it is to be a real bug, and send probes into the GitHub repo. The ticket and code here are made up.' }),
      h(doc, 'article', { class: 'inc-ticket' },
        h(doc, 'p', { class: 'inc-key', text: `${t.key} · Priority: ${t.priority} · From: CS manager` }),
        h(doc, 'h3', { text: t.title }),
        h(doc, 'p', { text: t.body })),
      guess, run,
    );

    const line = (tag, text) => log.append(h(doc, 'p', {}, h(doc, 'span', { class: `inc-tag inc-tag--${tag}`, text: tag }), text));

    async function runTriage(choice, btn) {
      for (const b of guessRow.querySelectorAll('button')) { b.disabled = true; b.setAttribute('aria-pressed', String(b === btn)); }
      run.hidden = false;
      log.focus();
      const pause = () => sleep(ctx.reduced ? 0 : 420);
      const steps = [
        ['$', `triage ${t.key}`],
        ['jira', `read ${t.key} through the Atlassian MCP`],
        ...t.signals.map((s) => ['signal', s]),
        ['score', `${t.score.toFixed(2)} → ${VERDICTS[verdict].toLowerCase()}`],
        ...t.probes.map((p) => ['probe', p]),
        ['found', t.finding],
        ['next', t.next],
      ];
      for (const [tag, text] of steps) {
        await pause();
        if (!ctx.alive()) return;
        line(tag, text);
        meter.scrollIntoView?.({ block: 'nearest' }); // keep the newest line and the score in view
        if (tag === 'score') {
          meter.style.setProperty('--v', t.score);
          meter.classList.add('is-scored');
          scoreText.textContent = t.score.toFixed(2);
        }
      }
      await pause();
      if (!ctx.alive()) return;
      const agreed = choice === verdict;
      result.replaceChildren(
        h(doc, 'p', { class: 'inc-verdict', text: agreed ? `You called it: ${VERDICTS[verdict]}.` : `The skill says ${VERDICTS[verdict]}. You said ${VERDICTS[choice]}.` }),
        h(doc, 'p', { text: t.outcome }),
        h(doc, 'p', { class: 'inc-foot', text: 'On the real thing, engineers start every ticket with a score, the suspect code and a next step instead of a blank description.' }),
        h(doc, 'p', { class: 'inc-actions' },
          h(doc, 'button', { type: 'button', class: 'bubble-btn bubble-btn--ink', text: 'Another ticket', onclick: () => { index++; render(body, ctx); body.scrollTop = 0; body.querySelector('.inc-guess button')?.focus(); } }),
          h(doc, 'button', { type: 'button', class: 'bubble-btn', text: 'Get in touch', onclick: () => onContact?.() })),
      );
      result.hidden = false;
      result.scrollIntoView?.({ block: 'nearest' });
    }
  }

  return { title: 'Pager: live triage', story: '#features', render };
}
