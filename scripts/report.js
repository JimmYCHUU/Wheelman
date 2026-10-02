// How well the suggestions are doing: how many were sent almost as written, split by who the
// customer was, and which checks fire most. Counts only: no customer text is printed.
//
//   npm run report              -> the last 14 days
//   npm run report -- 30        -> the last 30 days

import { openDb, closeDb } from '../src/db.js';
import { formatSydney } from '../src/time.js';

const days = Math.max(1, Math.min(365, Number(process.argv[2]) || 14));
const since = Date.now() - days * 24 * 3600 * 1000;
const db = openDb();

const parse = (s, fallback) => { try { return s ? JSON.parse(s) : fallback; } catch { return fallback; } };
const drafts = db.prepare('SELECT * FROM drafts WHERE created_at >= ? ORDER BY id').all(since)
  .map((r) => ({ ...r, context: parse(r.context_json, null), checks: parse(r.checks_json, []) }));
const dashboard = drafts.filter((d) => /^[cl]:/.test(d.item_key));
const marketplace = drafts.filter((d) => /^mp:/.test(d.item_key));

const pct = (n, of) => (of ? `${Math.round((n / of) * 100)}%` : '-');
const median = (a) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : null);
const pad = (s, n) => String(s).padEnd(n);
const num = (s, n = 8) => String(s).padStart(n);
const line = (...cols) => console.log(cols.join(''));

// One customer message can have several suggestions (rewrites). The one that was copied, or else
// the newest, stands for the message.
const messages = new Map();
for (const d of dashboard) {
  const k = `${d.item_key}|${d.anchor_key}`;
  if (!messages.has(k)) messages.set(k, []);
  messages.get(k).push(d);
}
const reps = [...messages.values()].map((list) => ({ list, rep: list.find((d) => d.copied_at) || list[list.length - 1] }));

const groupOf = (d) => (!d.context ? 'Written before this was recorded' : d.context.buyer ? 'Buyers' : d.context.newEnquiry ? 'New enquiries' : 'Others, mid-conversation');
const GROUPS = ['Buyers', 'New enquiries', 'Others, mid-conversation', 'Written before this was recorded'];

console.log(`\nWheelman report: the last ${days} days (to ${formatSydney(Date.now())})\n`);
const count = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
console.log(`Dashboard: ${count(dashboard.length, 'suggestion')} written for ${count(messages.size, 'customer message')}.`);
console.log(`Marketplace: ${count(marketplace.length, 'suggestion')} written, ${marketplace.filter((d) => d.copied_at).length} copied. (Marketplace replies are not tracked further.)\n`);

console.log('WHAT HAPPENED TO THE SUGGESTIONS (dashboard, one row per kind of customer)');
line(pad('', 34), num('messages'), num('replied'), num('as is', 9), num('edited', 9), num('rewritten', 11), num('overtaken', 11), num('match', 8));
const row = (label, set) => {
  const answered = set.filter((x) => x.rep.status === 'answered');
  const close = answered.filter((x) => (x.rep.similarity ?? 0) >= 0.8).length;
  const edited = answered.filter((x) => (x.rep.similarity ?? 0) >= 0.5 && (x.rep.similarity ?? 0) < 0.8).length;
  const superseded = set.filter((x) => x.rep.status === 'superseded').length;
  const m = median(answered.map((x) => x.rep.similarity ?? 0));
  line(pad(label, 34), num(set.length), num(answered.length), num(`${close} (${pct(close, answered.length)})`, 9), num(`${edited} (${pct(edited, answered.length)})`, 9),
    num(answered.length - close - edited, 11), num(superseded, 11), num(m === null ? '-' : `${Math.round(m * 100)}%`, 8));
};
for (const g of GROUPS) { const set = reps.filter((x) => groupOf(x.rep) === g); if (set.length) row(g, set); }
row('All', reps);
console.log('  replied: we sent a reply straight after that message.   as is: 80% or more of the wording was kept.');
console.log('  edited: 50 to 80% kept.   rewritten: less than half kept.   overtaken: the customer wrote again before anyone replied.\n');

console.log('BY AI MODEL (dashboard)');
const models = new Map();
for (const x of reps) { const k = x.rep.model || '(none)'; if (!models.has(k)) models.set(k, []); models.get(k).push(x); }
for (const [model, set] of [...models.entries()].sort((a, b) => b[1].length - a[1].length)) {
  const answered = set.filter((x) => x.rep.status === 'answered');
  line(pad(`  ${model}`, 44), num(set.length), '  written,  ', `${pct(answered.filter((x) => (x.rep.similarity ?? 0) >= 0.8).length, answered.length)} of ${answered.length} replied were sent as is`);
}

console.log('\nASKING AGAIN');
const rewritten = [...messages.values()].filter((l) => l.length > 1);
console.log(`  Messages with more than one suggestion: ${rewritten.length} of ${messages.size} (${pct(rewritten.length, messages.size)}).`);
console.log(`  Most suggestions for one message: ${Math.max(0, ...[...messages.values()].map((l) => l.length))}.`);
console.log(`  Suggestions written with an instruction from you: ${dashboard.filter((d) => d.instruction).length}.`);
console.log(`  Could not be written (AI error): ${dashboard.filter((d) => d.status === 'failed').length}.   Customer opted out: ${dashboard.filter((d) => d.status === 'blocked').length}.`);
console.log(`  Conversations dismissed: ${db.prepare('SELECT COUNT(*) AS n FROM dismissed WHERE at >= ?').get(since).n}.`);

console.log('\nWHAT THE CHECKS FOUND (all suggestions; "stops" means the AI was asked to write it again)');
const codes = new Map();
const written = drafts.filter((d) => d.reply);
for (const d of written) {
  for (const c of d.checks) {
    if (c.level === 'ok') continue;
    const k = `${c.level}|${c.code}`;
    codes.set(k, (codes.get(k) || 0) + 1);
  }
}
const LEVEL = { fail: 'stops', input: 'needs you', warn: 'note' };
for (const [k, n] of [...codes.entries()].sort((a, b) => b[1] - a[1])) {
  const [level, code] = k.split('|');
  line(pad(`  ${code}`, 22), pad(LEVEL[level] || level, 12), num(n, 5), `  (${pct(n, written.length)} of suggestions)`);
}
if (!codes.size) console.log('  Nothing.');
const clean = written.filter((d) => d.checks.every((c) => c.level === 'ok')).length;
console.log(`  Passed every check: ${clean} of ${written.length} (${pct(clean, written.length)}).`);

console.log('\nLINKS AND THE STANDARD REPLY (dashboard)');
const ready = dashboard.filter((d) => d.reply);
const booking = ready.filter((d) => d.reply.includes('#inspection=')).length;
const block = ready.filter((d) => d.reply.includes('📍')).length;
console.log(`  Suggestions with an inspection booking link: ${booking} of ${ready.length} (${pct(booking, ready.length)}). Your team's own texts: under 1%.`);
console.log(`  Suggestions ending with the standard address block: ${block} of ${ready.length} (${pct(block, ready.length)}).`);
const learned = db.prepare('SELECT COUNT(*) AS n FROM learned WHERE at >= ?').get(since).n;
console.log(`  Replies you changed that Wheelman learned from: ${learned}.\n`);

closeDb();
