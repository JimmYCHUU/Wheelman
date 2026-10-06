// Times, money and counts in words, all in Sydney time. Pure functions: no DOM, no state.

const TZ = 'Australia/Sydney';
const fmtTime = new Intl.DateTimeFormat('en-AU', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true });
const fmtDay = new Intl.DateTimeFormat('en-AU', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' });
const fmtShort = new Intl.DateTimeFormat('en-AU', { timeZone: TZ, day: 'numeric', month: 'short' });
const fmtWeekday = new Intl.DateTimeFormat('en-AU', { timeZone: TZ, weekday: 'long' });
const fmtKey = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

/** "4:05 pm", with a no-break space so the time never wraps between the number and am or pm. */
export const clock = (ms) => (ms ? fmtTime.format(new Date(ms)).replace(' ', ' ') : '');
/** "2026-10-06", the Sydney day a moment falls on */
export const dayKey = (ms) => fmtKey.format(new Date(ms));

export function daysAgo(ms, now = Date.now()) {
  const a = Date.parse(dayKey(now) + 'T00:00:00Z');
  const b = Date.parse(dayKey(ms) + 'T00:00:00Z');
  return Math.round((a - b) / 86400000);
}

/** "Today", "Yesterday", or "Monday 29 September" */
export function dayLabel(ms, now = Date.now()) {
  const d = daysAgo(ms, now);
  if (d === 0) return 'Today';
  if (d === 1) return 'Yesterday';
  return fmtDay.format(new Date(ms));
}

/** The time on a list row: a clock today, "Yesterday", a weekday this week, else "29 Sep". */
export function listTime(ms, now = Date.now()) {
  if (!ms) return '';
  const d = daysAgo(ms, now);
  if (d === 0) return clock(ms);
  if (d === 1) return 'Yesterday';
  if (d < 7) return fmtWeekday.format(new Date(ms));
  return fmtShort.format(new Date(ms));
}

/** "just now", "5 min ago", "3 h ago", "2 days ago" */
export function ago(ms, now = Date.now()) {
  const m = Math.max(0, Math.round((now - ms) / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const hrs = Math.round(m / 60);
  if (hrs < 48) return `${hrs} h ago`;
  return `${Math.round(hrs / 24)} days ago`;
}

export const money = (n) => (n === null || n === undefined || n === '' ? '' : '$' + Number(n).toLocaleString('en-AU'));
export const km = (n) => (n ? `${Number(n).toLocaleString('en-AU')} km` : '');
export const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;

/** "PR" from "Priya Raman"; '' when there is no name. */
export function initials(name) {
  const clean = String(name || '').trim();
  if (!clean) return '';
  const parts = clean.split(/\s+/);
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/** A stable number from 0 to 7 for a name, so the same person always gets the same avatar colour. */
export function hue(name) {
  let hash = 0;
  for (const ch of String(name || '').trim().toLowerCase()) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return hash % 8;
}
