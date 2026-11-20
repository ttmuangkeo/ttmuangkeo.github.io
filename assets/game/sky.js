// What the window shows: Seattle's local time, a rough sun phase, and whether it's raining.
// Pure apart from the default `new Date()`; no network calls.

// Approximate Seattle sunrise and sunset by month, in local clock hours (DST included).
const SUN = [
  [7.9, 16.7], [7.3, 17.5], [7.1, 19.2], [6.6, 19.9], [5.7, 20.6], [5.2, 21.1],
  [5.4, 21.0], [6.1, 20.3], [6.9, 19.3], [7.6, 18.3], [7.1, 16.7], [7.8, 16.3],
];
const TWILIGHT = 0.75; // hours either side of sunrise/sunset

export function skyPhase(hour, month) {
  const [rise, set] = SUN[month];
  if (hour >= rise - TWILIGHT && hour < rise + TWILIGHT) return 'dawn';
  if (hour >= rise + TWILIGHT && hour < set - TWILIGHT) return 'day';
  if (hour >= set - TWILIGHT && hour < set + TWILIGHT) return 'dusk';
  return 'night';
}

// Seattle's local hour (fractional), month (0-11) and a readable time like "9:41 PM".
export function seattleClock(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', month: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23',
  }).formatToParts(date).map((p) => [p.type, p.value]));
  const label = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit' }).format(date);
  return { hour: (Number(parts.hour) % 24) + Number(parts.minute) / 60, month: Number(parts.month) - 1, label };
}

// Share of hours with rain, roughly following Seattle's wet winters and dry summers.
const RAIN_CHANCE = [45, 40, 40, 30, 22, 15, 6, 6, 12, 30, 45, 45];

// Deterministic per clock hour, so every visitor in the same hour sees the same weather.
export function isRaining(date, month) {
  let h = Math.floor(date.getTime() / 3_600_000) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h ^= h >>> 16;
  return (h >>> 0) % 100 < RAIN_CHANCE[month];
}

const WORDS = { dawn: 'sunrise', day: 'daylight', dusk: 'sunset', night: 'night' };

export function skyNow(date = new Date()) {
  const { hour, month, label } = seattleClock(date);
  const phase = skyPhase(hour, month);
  const rain = isRaining(date, month);
  return { phase, rain, label, text: `Seattle · ${label} · ${rain ? 'raining' : WORDS[phase]}` };
}
