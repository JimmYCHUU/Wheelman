// Replay test: takes real customer messages that one of our salespeople answered, hides their answer
// from the agent, writes a suggestion, and puts both side by side in a page for you to judge.
//
//   npm run replay              -> 20 cases
//   npm run replay -- 60        -> 60 cases
//   npm run replay -- --buyers  -> only messages from people who had already bought
//   npm run replay -- --first   -> only first replies to brand-new enquiries (the standard reply)
//
// Uses AI requests (one or two per case). Output: eval/out/replay.html (contains real customer text; keep it local).

import fs from 'node:fs';
import { displayOfVoice } from '../src/people.js';
import path from 'node:path';
import { config } from '../src/config.js';
import { openDb, closeDb } from '../src/db.js';
import { buildItem, finishItem } from '../src/items.js';
import { attribute, cleanForExample, buildFrequencyIndex, stripSignature, stripLocationBlock } from '../src/voice.js';
import { draftFor } from '../src/drafter.js';
import { comparable } from '../src/learn.js';
import { isAcknowledgement, similarity, wordCount } from '../src/text.js';
import { providers } from '../src/llm.js';
import { worst } from '../src/checks.js';
import { formatSydney } from '../src/time.js';

const args = process.argv.slice(2);
const wanted = Math.max(1, Math.min(200, Number(args.find((a) => /^\d+$/.test(a))) || 20));
const only = args.includes('--buyers') ? 'buyers' : args.includes('--first') ? 'first' : null;
if (!providers().length) {
  console.log('No AI key is filled in yet, so the replay test cannot run. Fill in GEMINI_API_KEY in .env first.');
  process.exit(1);
}

const db = openDb();
const isFrequentTemplate = buildFrequencyIndex(db.prepare("SELECT conversation_id, body FROM messages WHERE direction = 'OUT'").all());

/**
 * The conversation as it stood just before our reply at position `cut`, judged as it would have
 * been at that moment: who was waiting, whether they were already a buyer, which car.
 */
const itemAt = (full, cut, at) => finishItem({
  itemKey: full.itemKey, channel: 'sms', lead: full.lead, hasLeadRecord: full.hasLeadRecord,
  conversation: full.conversation, conversationId: full.conversationId, phone: full.phone,
}, full.timeline.slice(0, cut), { now: at });

// 1. Collect candidate cases: a customer message followed by a genuine reply from one of the voices.
const cases = [];
for (const conv of db.prepare('SELECT id FROM conversations ORDER BY latest_at DESC').all()) {
  const full = buildItem({ conversationId: conv.id });
  if (!full) continue;
  const t = full.timeline;
  for (let i = 1; i < t.length; i++) {
    const e = t[i];
    if (e.who !== 'us' || e.internal) continue;
    if (t[i - 1].who !== 'customer') continue;
    const author = attribute(e.by, e.text);
    // The standard first reply is often nothing but "Hello," and the block, so for --first the
    // reply does not have to be a clean example of someone's own writing.
    if (only !== 'first') {
      if (!author) continue;
      if (!cleanForExample({ body: e.text, conversation_id: conv.id }, isFrequentTemplate).body) continue;
    }
    const pending = [];
    for (let k = i - 1; k >= 0 && t[k].who === 'customer'; k--) pending.unshift(t[k]);
    const text = pending.map((p) => p.text).filter(Boolean).join('\n');
    if (!text || pending.every((p) => !p.text || isAcknowledgement(p.text))) continue;
    const item = itemAt(full, i, e.at);
    if (item.state !== 'awaiting') continue;
    if (only === 'buyers' && !item.deal) continue;
    if (only === 'first' && !item.isNewEnquiry) break; // only the very first reply can qualify
    // Their whole answer may span two or three texts sent within minutes.
    const actual = [];
    for (let k = i; k < t.length && t[k].who === 'us' && !t[k].internal && t[k].at - e.at < 15 * 60 * 1000; k++) actual.push(only === 'first' ? stripSignature(t[k].text) : stripSignature(stripLocationBlock(t[k].text)));
    cases.push({ conversationId: conv.id, cut: i, author, actual: actual.filter(Boolean).join('\n'), situation: item.situation.primary, at: e.at });
    break; // one case per conversation keeps the sample varied
  }
}

// 2. Spread the sample across situations.
const bySituation = new Map();
for (const c of cases) { if (!bySituation.has(c.situation)) bySituation.set(c.situation, []); bySituation.get(c.situation).push(c); }
const sample = [];
while (sample.length < wanted && [...bySituation.values()].some((a) => a.length)) {
  for (const arr of bySituation.values()) { if (arr.length && sample.length < wanted) sample.push(arr.shift()); }
}
console.log(`Found ${cases.length} usable past exchanges. Testing ${sample.length}.\n`);

// 3. Draft each one as if the real answer had not been written yet.
const rows = [];
for (const [n, c] of sample.entries()) {
  const full = buildItem({ conversationId: c.conversationId });
  const item = itemAt(full, c.cut, c.at);
  process.stdout.write(`${String(n + 1).padStart(3)}/${sample.length}  ${item.situation.primary.padEnd(22)} ${(item.deal ? 'buyer' : item.isNewEnquiry ? 'new enquiry' : '').padEnd(12)} `);
  // Draft as if it were the moment they replied, so the time of day matches.
  const d = await draftFor(item, { save: false, holdOutConversation: true, now: c.at });
  const level = d.status === 'ready' ? worst(d.checks) : 'error';
  console.log(level);
  rows.push({ c, item, d, level, match: d.reply ? similarity(comparable(d.reply), comparable(c.actual)) : 0 });
  if (d.daily) { console.log('\nDaily AI allowance reached. Stopping early.'); break; }
}

// 4. Report.
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const done = rows.filter((r) => r.d.status === 'ready');
const tally = (level) => done.filter((r) => r.level === level).length;
const median = (a) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : 0);
const summary = {
  tested: rows.length, written: done.length,
  passedAllChecks: tally('ok'), styleWarnings: tally('warn'), needsYourInput: tally('input'), failedFactCheck: tally('fail'),
  medianWordsOurs: median(done.map((r) => wordCount(comparable(r.d.reply)))),
  medianWordsTheirs: median(done.map((r) => wordCount(comparable(r.c.actual)))),
};

const html = `<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><title>Replay test</title>
<style>
body{font:15px/1.5 "Segoe UI",system-ui,sans-serif;margin:0;background:#f4f5f3;color:#1b1f1a}
main{max-width:1200px;margin:0 auto;padding:24px 16px 80px}
h1{font-size:22px;margin:0 0 4px} .lead{color:#5d655a;margin:0 0 18px}
.sum{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:22px}
.stat{background:#fff;border:1px solid #dfe2dc;border-radius:10px;padding:10px 14px;min-width:150px}
.stat b{display:block;font-size:22px}
.case{background:#fff;border:1px solid #dfe2dc;border-radius:10px;margin-bottom:16px;overflow:hidden}
.head{background:#f8f9f7;border-bottom:1px solid #dfe2dc;padding:9px 14px;font-size:13px;color:#5d655a;display:flex;gap:12px;flex-wrap:wrap}
.head b{color:#1b1f1a}
.q{padding:12px 14px;border-bottom:1px solid #dfe2dc;white-space:pre-wrap;overflow-wrap:anywhere;border-left:3px solid #1f5f4a;background:#e4efe9}
.cols{display:grid;grid-template-columns:1fr 1fr}
.cols>div{padding:12px 14px;white-space:pre-wrap;overflow-wrap:anywhere}
.cols>div+div{border-left:1px solid #dfe2dc}
.k{font-size:11.5px;letter-spacing:.06em;text-transform:uppercase;color:#838b7f;font-weight:650;margin-bottom:6px}
.flag{font-size:13px;margin-top:8px;padding:5px 9px;border-radius:7px}
.fail{background:#fbeae7;color:#a4291f}.input{background:#e6eef8;color:#1d4f86}.warn{background:#fbf1dc;color:#8a5a00}.ok{background:#e3f1e7;color:#22683f}
.score{margin-top:10px;font-size:13px;color:#5d655a}
@media(max-width:800px){.cols{grid-template-columns:1fr}.cols>div+div{border-left:0;border-top:1px solid #dfe2dc}}
</style></head><body><main>
<h1>Replay test</h1>
<p class="lead">Real customer messages, the reply our salesperson actually sent, and what the agent would have suggested without seeing it. Written ${esc(formatSydney(Date.now()))} using ${esc(done[0]?.d.model || 'no model')}. Contains real customer text: keep this file on this computer.</p>
<div class="sum">
<div class="stat"><b>${summary.written} / ${summary.tested}</b>suggestions written</div>
<div class="stat"><b>${summary.passedAllChecks}</b>passed every check</div>
<div class="stat"><b>${summary.needsYourInput}</b>left a blank for a person</div>
<div class="stat"><b>${summary.failedFactCheck}</b>failed the fact check</div>
<div class="stat"><b>${summary.styleWarnings}</b>style warnings</div>
<div class="stat"><b>${summary.medianWordsOurs} vs ${summary.medianWordsTheirs}</b>median words: agent vs them</div>
</div>
${rows.map((r, i) => `<section class="case">
<div class="head"><span><b>Case ${i + 1}</b></span><span>${esc(r.item.situation.label)}</span><span>${r.item.deal ? 'already a buyer' : r.item.isNewEnquiry ? 'new enquiry' : 'mid-conversation'}</span><span>answered by ${esc(r.c.author ? displayOfVoice(r.c.author) : 'the team')}</span><span>${esc(formatSydney(r.c.at))}</span><span>${r.item.vehicles[0] ? esc(r.item.vehicles[0].title) : 'no vehicle matched'}</span></div>
<div class="q"><div class="k">Customer wrote</div>${esc(r.item.pending.map((e) => [e.event ? '(' + e.event + ')' : '', e.text].filter(Boolean).join(' ')).join('\n'))}</div>
<div class="cols">
<div><div class="k">What they actually sent</div>${esc(r.c.actual)}</div>
<div><div class="k">Agent's suggestion</div>${r.d.status === 'ready' ? esc(r.d.reply) : '<em>' + esc(r.d.error || 'No suggestion') + '</em>'}
${(r.d.checks || []).map((c) => `<div class="flag ${esc(c.level)}">${esc(c.message)}</div>`).join('')}
<div class="score">Wording overlap with their reply: ${Math.round(r.match * 100)}%</div></div>
</div></section>`).join('\n')}
</main></body></html>`;

const outDir = path.join(config.root, 'eval', 'out');
fs.mkdirSync(outDir, { recursive: true });
const file = path.join(outDir, 'replay.html');
fs.writeFileSync(file, html);
fs.writeFileSync(path.join(outDir, 'replay-summary.json'), JSON.stringify(summary, null, 1));
fs.writeFileSync(path.join(outDir, 'replay-cases.json'), JSON.stringify(rows.map((r) => ({
  situation: r.item.situation.primary, author: r.c.author, vehicle: r.item.vehicles[0]?.title || null,
  customer: r.item.pending.map((e) => [e.event, e.text].filter(Boolean).join(' ')).join('\n'),
  actual: r.c.actual, suggestion: r.d.reply || '', model: r.d.model || '', status: r.d.status, error: r.d.error || '',
  checks: r.d.checks || [], factsUsed: r.d.factsUsed || [], match: r.match,
})), null, 1));

console.log('\nSummary');
for (const [k, v] of Object.entries(summary)) console.log(`  ${k}: ${v}`);
console.log(`\nOpen this file in your browser to compare side by side:\n  ${file}`);
closeDb();
