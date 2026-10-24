// Replay test: takes real customer messages that one of our salespeople answered, hides their answer
// from the agent, writes a suggestion in each prompt style, and compares full against compact.
//
//   npm run replay -- --n 20                         -> counts the cases and prints an estimate; asks nothing of the AI
//   npm run replay -- --n 400 --confirm              -> runs it, on a COPY of the database (DB_PATH)
//   npm run replay -- --resume eval/out/replay-<time> --confirm   -> carries on where a run stopped
//
// Flags: --n <1..400> (default 20), --styles full,compact, --sample-full <n> (full style on the first n
// cases only), --resume <run dir>, --gap <seconds> between requests, --confirm.
// Refuses to run unless DB_PATH points at a copy of the database. Offline apart from the AI provider.
// Output (real customer text; keep it local): eval/out/replay-<timestamp>/ with results.jsonl,
// replies.jsonl, summary.json and cases.html.

import fs from 'node:fs';
import path from 'node:path';
import { config } from '../src/config.js';
import { requireCopy } from '../src/livedb.js';

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const has = (name) => args.includes(name);

const resumeDir = flag('--resume') ? path.resolve(config.root, flag('--resume')) : null;
const saved = resumeDir && fs.existsSync(path.join(resumeDir, 'run.json')) ? JSON.parse(fs.readFileSync(path.join(resumeDir, 'run.json'), 'utf8')) : {};
const wanted = Math.max(1, Math.min(400, Number(flag('--n')) || saved.n || 20));
const styles = (flag('--styles') ?? (saved.styles || ['full', 'compact']).join(',')).split(',').map((s) => s.trim()).filter((s) => s === 'full' || s === 'compact');
const sampleFullArg = flag('--sample-full') ?? saved.sampleFull;
const sampleFull = sampleFullArg === undefined || sampleFullArg === null ? undefined : Math.max(0, Number(sampleFullArg));
if (!styles.length) { console.log('--styles must name full, compact or both.'); process.exit(1); }
if (flag('--gap') !== undefined) config.llm.secondsBetween = Math.max(0, Number(flag('--gap')) || 0);

const REQUEST_TOKENS = { full: 15500, compact: 4000 };

// Both the dry run and the real run read the database copy, so both refuse the live one.
try { requireCopy(config.dbPath); } catch (e) { console.log(e.message); process.exit(1); }
const confirmed = has('--confirm');
if (confirmed) config.offline = true;

const { openDb, closeDb } = await import('../src/db.js');
const { buildItem } = await import('../src/items.js');
const { collectCases, spread, itemAt } = await import('../src/replaycases.js');
const { draftFor } = await import('../src/drafter.js');
const { providers } = await import('../src/llm.js');
const { runReplay, caseKey, offlineFetch } = await import('../src/replayrun.js');
const { pairStats } = await import('../src/replaystats.js');
const { displayOfVoice } = await import('../src/people.js');
const { formatSydney } = await import('../src/time.js');

if (confirmed && !providers().length) {
  console.log('No AI key is filled in yet, so the replay test cannot run. Fill in GEMINI_API_KEY in .env first.');
  process.exit(1);
}

const readLines = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const before = resumeDir ? readLines(path.join(resumeDir, 'results.jsonl')) : [];

const db = openDb();
const cases = spread(collectCases(db, {}), wanted);
if (!confirmed) {
  // Dry run: the database copy is read, nothing is sent. With --resume only the cases not yet done count.
  const done = new Set(before.filter((r) => !r.error && r.worst !== 'fail').map((r) => `${r.key}|${r.style}`));
  const estimate = styles.map((s) => {
    const requests = cases.filter((c, i) => !(s === 'full' && sampleFull !== undefined && i >= sampleFull) && !done.has(`${caseKey(c)}|${s}`)).length;
    return { style: s, requests, tokens: requests * REQUEST_TOKENS[s] };
  });
  console.log(`Found ${cases.length} cases to replay (up to ${wanted} asked for).${resumeDir ? ' Cases already done are not counted below.' : ''}`);
  for (const e of estimate) console.log(`  ${e.style}: ${e.requests} requests, about ${e.tokens.toLocaleString('en-AU')} tokens in`);
  console.log(`  total: ${estimate.reduce((s, e) => s + e.requests, 0)} requests, about ${estimate.reduce((s, e) => s + e.tokens, 0).toLocaleString('en-AU')} tokens in`);
  console.log('\nNothing was sent. Add --confirm to run it.');
  closeDb();
  process.exit(0);
}

// Offline is enforced: only the AI providers' hosts may be reached.
const aiHosts = ['gemini', 'openai', 'openrouter'].map((p) => { try { return new URL(config.llm[p].url).host; } catch { return ''; } }).filter(Boolean);
const guard = offlineFetch(aiHosts, globalThis.fetch);
globalThis.fetch = guard.fetch;

console.log(`Found ${cases.length} cases to replay (styles: ${styles.join(', ')}).`);

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const runDir = resumeDir || path.join(config.root, 'eval', 'out', `replay-${stamp}`);
fs.mkdirSync(runDir, { recursive: true });
fs.writeFileSync(path.join(runDir, 'run.json'), JSON.stringify({ n: wanted, styles, sampleFull: sampleFull ?? null }));
const resultsFile = path.join(runDir, 'results.jsonl');
const repliesFile = path.join(runDir, 'replies.jsonl');
if (before.length) console.log(`Resuming: ${before.length} results already in ${runDir}.`);

// The reply text of each draft, kept beside the numbers for the side-by-side page.
const lastReply = new Map();
const draft = async (item, opts) => {
  lastReply.delete(opts.style); // a draft that throws must not leave the last case's reply behind
  const d = await draftFor(item, opts);
  lastReply.set(opts.style, { reply: d.reply || '', error: d.error || '', checks: d.checks || [] });
  return d;
};
let landed = 0;
const { stopped } = await runReplay({
  cases, styles, sampleFull, resumeFrom: before, draft,
  onResult: (r) => {
    fs.appendFileSync(resultsFile, `${JSON.stringify(r)}\n`);
    fs.appendFileSync(repliesFile, `${JSON.stringify({ key: r.key, style: r.style, ...(lastReply.get(r.style) ?? { reply: '', error: r.error || '', checks: [] }) })}\n`);
    landed++;
    process.stdout.write(`  ${String(landed).padStart(4)} ${r.style.padEnd(7)} similarity ${r.similarity.toFixed(2)}  ${r.worst}\n`);
  },
});
if (stopped === 'daily') console.log('\nDaily AI allowance reached. Stopped; run again with --resume to carry on.');
if (stopped === 'error') console.log('\nA draft failed. Stopped; the results so far are kept. Run again with --resume to carry on.');

// Report.
const results = readLines(resultsFile);
const replies = new Map(readLines(repliesFile).map((r) => [`${r.key}|${r.style}`, r]));
const stats = pairStats(results);
fs.writeFileSync(path.join(runDir, 'summary.json'), JSON.stringify({ ...stats, stopped, cases: cases.length, blocked: guard.blocked }, null, 1));

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const sim = (key, style) => results.findLast((r) => r.key === key && r.style === style)?.similarity;
const cell = (key, style) => {
  const r = replies.get(`${key}|${style}`);
  if (!r) return '<em>not run</em>';
  const s = sim(key, style);
  return `${esc(r.reply || r.error)}<div class="score">overlap with theirs: ${s === undefined ? '' : Math.round(s * 100)}%</div>`;
};
const rows = cases.map((c, i) => {
  const key = caseKey(c);
  const item = itemAt(buildItem({ conversationId: c.conversationId }), c.cut, c.at);
  return `<section class="case"><div class="head"><b>Case ${i + 1}</b> ${esc(item.situation.label)} · answered by ${esc(c.author ? displayOfVoice(c.author) : 'the team')} · ${esc(formatSydney(c.at))}</div>
<div class="q"><div class="k">What was sent to the agent</div>${esc(item.pending.map((e) => [e.event ? `(${e.event})` : '', e.text].filter(Boolean).join(' ')).join('\n'))}</div>
<div class="cols"><div><div class="k">What they actually sent</div>${esc(c.actual)}</div>
<div><div class="k">Full</div>${cell(key, 'full')}</div>
<div><div class="k">Compact</div>${cell(key, 'compact')}</div></div></section>`;
}).join('\n');
const f = (n) => (Math.round(n * 100) / 100).toString();
fs.writeFileSync(path.join(runDir, 'cases.html'), `<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><title>Replay: full against compact</title>
<style>body{font:15px/1.5 "Segoe UI",system-ui,sans-serif;margin:0;background:#f4f5f3;color:#1b1f1a}main{max-width:1400px;margin:0 auto;padding:24px 16px 80px}
.case{background:#fff;border:1px solid #dfe2dc;border-radius:10px;margin-bottom:16px;overflow:hidden}.head{background:#f8f9f7;border-bottom:1px solid #dfe2dc;padding:9px 14px;font-size:13px;color:#5d655a}
.q{padding:12px 14px;border-bottom:1px solid #dfe2dc;white-space:pre-wrap;background:#e4efe9}.cols{display:grid;grid-template-columns:1fr 1fr 1fr}.cols>div{padding:12px 14px;white-space:pre-wrap;overflow-wrap:anywhere}.cols>div+div{border-left:1px solid #dfe2dc}
.k{font-size:11.5px;letter-spacing:.06em;text-transform:uppercase;color:#838b7f;font-weight:650;margin-bottom:6px}.score{margin-top:8px;font-size:13px;color:#5d655a}
@media(max-width:900px){.cols{grid-template-columns:1fr}.cols>div+div{border-left:0;border-top:1px solid #dfe2dc}}</style></head><body><main>
<h1>Replay: full against compact</h1>
<p>${stats.paired} cases answered in both styles. Median overlap: full ${f(stats.full.medianSimilarity)}, compact ${f(stats.compact.medianSimilarity)}. Gate: ${stats.gate.pass ? 'pass' : `fail (${esc(stats.gate.reasons.join('; '))})`}. Contains real customer text: keep this file on this computer.</p>
${rows}</main></body></html>`);

const blockedList = Object.entries(guard.blocked);
console.log(blockedList.length ? `\nBlocked requests (offline): ${blockedList.map(([h, n]) => `${h} x${n}`).join(', ')}` : '\nBlocked requests (offline): none');
console.log(`\nPaired cases: ${stats.paired}. Median similarity: full ${f(stats.full.medianSimilarity)}, compact ${f(stats.compact.medianSimilarity)}.`);
console.log(`Gate: ${stats.gate.pass ? 'pass' : `fail. ${stats.gate.reasons.join('; ')}`}`);
console.log(`\nOpen this file in your browser to compare side by side:\n  ${path.join(runDir, 'cases.html')}`);
closeDb();
