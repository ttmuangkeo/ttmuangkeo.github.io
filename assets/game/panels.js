// What each object's panel shows. Content is never written here: each panel is assembled
// at runtime from the story page (/story/) using these selectors, so the facts always match
// the fact-checked Field Manual text. `story` is the matching story-mode anchor.

export const PANELS = {
  pennant: {
    title: 'Where it started',
    story: '#trailhead',
    pick: ['#trailhead h1', '#trailhead .hero-role', '#trailhead .hero-bio', '[data-stop="uaa"] .stop-caption', '[data-stop="uaa"] .stop-photo', '[data-stop="ga"] .stop-caption'],
  },
  map: {
    title: 'The route',
    story: '#route',
    pick: ['#route .stops'],
  },
  whiteboard: {
    title: 'By the numbers',
    story: '#features',
    pick: ['#features .numbers'],
  },
  laptop: {
    title: 'What I build',
    story: '#features',
    pick: ['#trailhead .hero-meta', '#features .feature:nth-of-type(3)', '#features .feature:nth-of-type(4)'],
  },
  pager: {
    title: 'Incident log',
    story: '#features',
    pick: ['#features .feature:nth-of-type(1)', '#features .feature:nth-of-type(2)', '#log .entry:nth-of-type(1) .entry-body', '#log .entry:nth-of-type(2) .entry-body'],
  },
  logbook: {
    title: 'Field log',
    story: '#log',
    pick: ['#log .worked-at-wrap', '#log .log-list', '#log .log-foot'],
  },
  toolbox: {
    title: 'Toolkit',
    story: '#features',
    pick: ['#features .toolkit'],
  },
  plaque: {
    title: 'Clients & team',
    story: '#log',
    pick: ['#log .clients'],
  },
  keys: {
    title: 'Basecamp: sitrepp.io',
    story: '#basecamp',
    pick: ['#basecamp .basecamp-intro', '#basecamp .basecamp-list', '#basecamp .stack-tags', '#basecamp .basecamp-cta', '#basecamp .basecamp-photo'],
  },
  camera: {
    title: 'Off-trail: Summit Peak',
    story: '#offtrail',
    pick: ['#offtrail .offtrail-copy', '#offtrail .offtrail-photo', '#offtrail .strip'],
  },
  mailbox: {
    title: "Let's talk",
    story: '#contact',
    pick: ['#contact .contact-copy', '#contact .contact-photo'],
  },
};
