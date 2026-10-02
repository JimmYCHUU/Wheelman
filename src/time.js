// The dashboard stores most timestamps as Sydney local time with no zone marker.
// This computer may be in another timezone, so conversion is always explicit.

const TZ = 'Australia/Sydney';
const dtf = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
});

function sydneyParts(epochMs) {
  const p = Object.fromEntries(dtf.formatToParts(new Date(epochMs)).map((x) => [x.type, x.value]));
  return { year: +p.year, month: +p.month, day: +p.day, hour: +p.hour, minute: +p.minute, second: +p.second };
}

function offsetMs(epochMs) {
  const p = sydneyParts(epochMs);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(epochMs / 1000) * 1000;
}

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

/** Parse any timestamp format the dashboard uses into epoch milliseconds (or null). */
export function parseDashboardTime(s) {
  if (s === null || s === undefined || s === '') return null;
  if (typeof s === 'number') return s;
  const str = String(s).trim();

  // Has an explicit zone: trust it.
  if (/([zZ]|[+-]\d\d:?\d\d)$/.test(str)) {
    const t = Date.parse(str.replace(/(\.\d{3})\d+/, '$1'));
    return Number.isNaN(t) ? null : t;
  }

  let naive = null;
  let m = str.match(/^(\d{4})-(\d\d)-(\d\d)[T ](\d\d):(\d\d)(?::(\d\d))?/);
  if (m) {
    naive = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  } else {
    // "Sep 29, 2026, 06:59:11 PM"
    m = str.match(/^([A-Za-z]{3})[a-z]*\.? (\d{1,2}), (\d{4}),? (\d{1,2}):(\d\d)(?::(\d\d))? ?([AP]M)?$/i);
    if (!m) return null;
    const month = MONTHS[m[1].toLowerCase()];
    if (month === undefined) return null;
    let hour = +m[4];
    const ap = (m[7] || '').toUpperCase();
    if (ap === 'PM' && hour < 12) hour += 12;
    if (ap === 'AM' && hour === 12) hour = 0;
    naive = Date.UTC(+m[3], month, +m[2], hour, +m[5], +(m[6] || 0));
  }
  // Two passes settle the offset correctly around daylight-saving changes.
  let guess = naive - offsetMs(naive);
  guess = naive - offsetMs(guess);
  return guess;
}

/**
 * A calendar date from the dashboard, as "YYYY-MM-DD", or null.
 * The dashboard writes dates three ways: "2026-09-24", "24/09/2026" and a full timestamp.
 */
export function parseDashboardDate(s) {
  if (s === null || s === undefined || s === '') return null;
  const str = String(s).trim();
  let m = str.match(/^(\d{4})-(\d\d)-(\d\d)$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const t = parseDashboardTime(str);
  return t ? sydneyDay(t) : null;
}

/** "24 Sep 2026" from "2026-09-24". */
export function formatDay(day) {
  const m = String(day || '').match(/^(\d{4})-(\d\d)-(\d\d)$/);
  if (!m) return '';
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${Number(m[3])} ${names[Number(m[2]) - 1]} ${m[1]}`;
}

/** "Mon 29 Sep, 6:37 pm" in Sydney time. */
export function formatSydney(epochMs) {
  if (!epochMs) return '';
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(new Date(epochMs));
}

/** Sydney calendar day key, e.g. "2026-09-29". */
export function sydneyDay(epochMs = Date.now()) {
  const p = sydneyParts(epochMs);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Part of day in Sydney, used to choose between "Hi" and "Good morning". */
export function sydneyHour(epochMs = Date.now()) {
  return sydneyParts(epochMs).hour;
}

export function sydneyWeekday(epochMs = Date.now()) {
  return new Intl.DateTimeFormat('en-AU', { timeZone: TZ, weekday: 'long' }).format(new Date(epochMs));
}
