// The new page's model: pure functions (no DOM, no globals) that turn the server's data into what
// the page shows, in plain words. The browser loads this as a module and the tests import it in Node.
import { blanksIn } from '../../lib/blank.js';
import { listTime, ago, clock } from '../../lib/format.js';
import { listOf } from '../../lib/copy.js';

export const SECTIONS = [
  { id: 'dashboard', label: 'Dashboard', ready: true },
  { id: 'marketplace', label: 'Marketplace', ready: false },
  { id: 'importquery', label: 'Imports', ready: false },
  { id: 'auction', label: 'Auction', ready: false },
];

// These ids are the server's `tab` values.
export const CHIPS = [
  { id: 'waiting', label: 'Needs reply' },
  { id: 'followups', label: 'Follow-ups' },
  { id: 'all', label: 'All' },
];

/** What one list row shows. doneAnchor is the anchor of the row just copied, waiting to show on the dashboard. */
export function rowView(row, { now, doneAnchor } = {}) {
  const done = doneAnchor !== undefined && doneAnchor !== null && doneAnchor === row.anchor;
  const p = row.preview || {};
  let preview = p.text || '';
  if (!preview && p.media) preview = 'Photo';
  else if (p.who === 'us') preview = 'You: ' + preview;
  let reason = '';
  if (done) reason = 'Copied, waiting for it to show on the dashboard';
  else if (row.followUp) reason = 'Follow-up: ' + row.followUp.reason;
  else if (row.flag === 'fail') reason = 'Check failed';
  else if (row.flag === 'input') reason = 'Blank to fill';
  else if (row.flag === 'error') reason = 'Not written yet';
  else if (row.phoneOnly) reason = 'Phone only';
  return {
    key: row.key,
    name: row.name || row.phone || row.email || 'Unknown number',
    when: listTime(row.lastAt, now),
    car: row.car || '',
    preview,
    reason,
    unread: done ? 0 : row.unread,
    done,
  };
}

/** Who a thread message is from, or null for an event line. */
export function whoLabel(m, customerName) {
  if (m.event) return null;
  if (m.who === 'customer') return customerName || 'Customer';
  if (m.auto) return 'Auto-reply';
  if (m.phone) return 'Us, from the phone';
  if (m.by) return 'Us · ' + m.by;
  return 'Us';
}

/** Text split into plain text and blanks: [{kind:'text',text}|{kind:'blank',label,raw}]. */
export function segments(text) {
  const s = String(text || '');
  const out = [];
  let at = 0;
  for (const b of blanksIn(s)) {
    if (b.index > at) out.push({ kind: 'text', text: s.slice(at, b.index) });
    out.push({ kind: 'blank', label: b.kind, raw: b.text });
    at = b.index + b.length;
  }
  if (at < s.length) out.push({ kind: 'text', text: s.slice(at) });
  return out;
}

export const joinSegments = (segs) => segs.map((x) => (x.kind === 'blank' ? x.raw : x.text)).join('');

/** A new array with the i-th blank turned into text; an empty value keeps the blank. */
export function fillBlank(segs, i, value) {
  const v = String(value ?? '').trim();
  if (!v || !segs[i] || segs[i].kind !== 'blank') return segs.slice();
  return segs.map((x, n) => (n === i ? { kind: 'text', text: v } : x));
}

/** What the suggestion box holds: the person's edit (a cleared box is ''), else what Wheelman wrote. */
export function boxText(draft) {
  if (!draft) return '';
  if (draft.edited !== null && draft.edited !== undefined) return draft.edited;
  return draft.reply || '';
}

export function checkLines(checks) {
  const at = (level) => (checks || []).filter((c) => c.level === level).map((c) => c.message);
  return { fails: at('fail'), warns: at('warn'), inputs: at('input') };
}

/** The one main button. */
export function mainAction({ text, checks, overridden }) {
  if (!overridden && (checks || []).some((c) => c.level === 'fail')) return { kind: 'blocked', label: 'Fix the check first', secondary: null };
  const n = blanksIn(text).length;
  if (n) return { kind: 'fill', label: n === 1 ? 'Fill 1 blank' : 'Fill ' + n + ' blanks', secondary: n === 1 ? 'Copy with the blank' : 'Copy with the blanks' };
  return { kind: 'copy', label: 'Copy reply', secondary: null };
}

export function statusWords(status, now) {
  const { missing = [], syncing, drafting, lastSync } = status || {};
  if (missing.length) return { tone: 'bad', text: 'Set-up needed: ' + listOf(missing) };
  if (syncing) return { tone: 'busy', text: 'Checking for new messages' };
  if (drafting) return { tone: 'busy', text: 'Writing' };
  if (lastSync && lastSync.ok) return { tone: 'ok', text: 'Up to date, checked ' + ago(lastSync.at, now) };
  if (lastSync) return { tone: 'bad', text: 'Dashboard not reached since ' + clock(lastSync.at) };
  return { tone: 'busy', text: 'Starting' };
}

/** "Write it instead" choices: at most 3, best first, never the one already in use. */
export function insteadOptions(item) {
  const current = item.template || '';
  const out = current !== '' ? [{ id: '', label: 'A reply to what they wrote' }] : [];
  const all = item.templates || [];
  const ordered = [...all.filter((t) => t.best === true), ...all.filter((t) => t.best !== true)];
  for (const t of ordered) {
    if (out.length >= 3) break;
    if (t.id !== current) out.push({ id: t.id, label: t.label });
  }
  return out;
}

export function wordCount(text) {
  const s = String(text || '');
  const words = s.trim() ? s.trim().split(/\s+/).length : 0;
  return { words, texts: Math.ceil(s.length / 160) };
}
