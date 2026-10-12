// The review: the same real conversations written two ways, for the owner to judge blind on the
// Review page (http://localhost:3210/review). Side A is the current voice on the dashboard's model
// unless told otherwise; side B must differ from it in its voice files, its model, or both.
//
//   npm run review -- --b-voice voice-next                                   the voice: A as it is, B from a folder holding house-voice.md and sales-playbook.md
//   npm run review -- --a-model openai/gpt-5.6 --b-model gemini/gemini-3.8-flash --n 40 --confirm   the model
//   --n 30             how many cases (20 unless set; at most 40 when a paid model is in the run)
//   --first | --buyers only first replies to new enquiries | only customers who had already bought
//   --since 60         only replies sent in the last 60 days
//   --situation price_negotiation   only one kind of message
//   --confirm          needed whenever a paid model is in the run; the cost is printed first
//
// Uses AI requests: one or two per case per side. Output: one file under data/review/ holding real
// customer text, read by the Review page. Nothing leaves this computer but the usual requests.

import fs from 'node:fs';
import path from 'node:path';
import { config } from '../src/config.js';
import { openDb, closeDb } from '../src/db.js';
import { buildItem } from '../src/items.js';
import { collectCases, spread, itemAt } from '../src/replaycases.js';
import { draftFor } from '../src/drafter.js';
import { comparable } from '../src/learn.js';
import { wordCount } from '../src/text.js';
import { providers } from '../src/llm.js';
import { worst } from '../src/checks.js';
import { salesScore } from '../src/selling.js';
import { farAway } from '../src/situations.js';
import { budgetStatus, costAud, isFree } from '../src/budget.js';
import { newRunId, writeRun, summarise } from '../src/review.js';

const DAY = 24 * 3600 * 1000;
const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? String(args[i + 1] || '') : ''; };
const has = (name) => args.includes(name);
const fail = (message) => { console.log(message); process.exit(1); };

let n = Math.max(1, Math.min(200, Number(flag('--n')) || 20));
const only = has('--buyers') ? 'buyers' : has('--first') ? 'first' : null;
const sinceDays = Math.max(0, Number(flag('--since')) || 0);
const situation = flag('--situation');

const parsePin = (s) => {
  if (!s) return null;
  const i = s.indexOf('/');
  if (i <= 0 || i === s.length - 1) fail(`--a-model and --b-model take provider/model, for example openai/gpt-5.6. Got "${s}".`);
  return { provider: s.slice(0, i), model: s.slice(i + 1) };
};
const sideOf = (letter) => {
  const voice = flag(`--${letter}-voice`);
  const pin = parsePin(flag(`--${letter}-model`));
  return {
    voice: voice ? path.resolve(voice) : config.voiceDir,
    pin,
    label: [voice ? `voice from ${voice}` : 'the current voice', pin ? `${pin.provider}/${pin.model}` : "the dashboard's model"].join(', '),
  };
};
const A = sideOf('a');
const B = sideOf('b');
if (!flag('--b-voice') && !flag('--b-model')) fail('Side B must differ from side A: give --b-voice <folder> and/or --b-model provider/model.');
for (const s of [A, B]) {
  if (!fs.existsSync(path.join(s.voice, 'house-voice.md')) || !fs.existsSync(path.join(s.voice, 'sales-playbook.md'))) fail(`${s.voice} must hold house-voice.md and sales-playbook.md.`);
  if (s.pin && !config.llm[s.pin.provider]?.apiKey) fail(`No key for ${s.pin.provider} is filled in, so ${s.pin.provider}/${s.pin.model} cannot be asked.`);
}
if (!providers().length) fail('No AI key is filled in yet, so the review cannot run. Choose the AI on the page (the cog) or fill in a key in .env.');

// ---- the cost guard: paid requests are printed, estimated and confirmed before anything is asked ----
const firstModel = (side) => side.pin || (providers()[0] ? { provider: providers()[0].name, model: providers()[0].model } : null);
const paid = [A, B].filter((s) => { const m = firstModel(s); return m && !isFree(m.provider, m.model); });
const budget = budgetStatus();
if (paid.length) {
  if (n > 40) { console.log(`A paid model is in the run, so at most 40 cases are written (asked for ${n}).`); n = 40; }
  const requests = n * paid.length * 2;
  let estimate = 0;
  for (const s of paid) {
    const m = firstModel(s);
    const row = budget.byModel.find((r) => r.provider === m.provider && r.model === m.model);
    // This month's average request on that model, else a typical one: the request is long, the answer short.
    const per = row && row.requests ? { tokensIn: row.tokensIn / row.requests, tokensOut: row.tokensOut / row.requests } : { tokensIn: 11000, tokensOut: 800 };
    const c = costAud({ provider: m.provider, model: m.model, ...per });
    estimate = estimate === null || c === null ? null : estimate + c * n * 2;
  }
  console.log(`Up to ${requests} paid requests: ${n} cases, ${paid.length} paid side${paid.length === 1 ? '' : 's'}, and the one retry each may need.`);
  console.log(`Estimated cost: ${estimate === null ? `unknown, a model in the run has no price in ${config.aiPricesPath}` : `about A$${estimate.toFixed(2)}`}. This month so far: A$${budget.spentAud.toFixed(2)} of the A$${budget.budgetAud} budget.`);
  if (budget.level === 'over' || (estimate !== null && budget.budgetAud > 0 && budget.spentAud + estimate > budget.budgetAud)) fail(`That would pass this month's budget of A$${budget.budgetAud}. Raise AI_MONTHLY_BUDGET_AUD in .env, or run fewer cases.`);
  if (!has('--confirm')) fail('Add --confirm to run it.');
}

// ---- the cases, and both sides of each ---------------------------------------------------------
const db = openDb();
const since = sinceDays ? Date.now() - sinceDays * DAY : 0;
const sample = spread(collectCases(db, { only, since, situation }), n);
if (!sample.length) fail('No usable past exchange matches. A case is a customer message that one of our people answered.');
console.log(`\nA: ${A.label}\nB: ${B.label}\nTesting ${sample.length} past exchange${sample.length === 1 ? '' : 's'}. The sides are shuffled on the page, so rate them blind.\n`);

const voiceWas = config.voiceDir;
async function writeSide(side, item, c) {
  config.voiceDir = side.voice;
  try {
    const d = await draftFor(item, { save: false, holdOutConversation: true, now: c.at, pin: side.pin });
    const level = d.status === 'ready' ? worst(d.checks) : 'error';
    const far = farAway(item.pendingText, item.lead?.state).far;
    const score = d.reply
      ? salesScore({ body: comparable(d.reply), nextStep: d.nextStep, rung: d.rung, situations: item.situation.all, channel: 'sms', farAway: far, firstReply: item.isNewEnquiry })
      : { score: 0, parts: {}, notes: ['no reply'] };
    const usage = d.usage || null;
    return {
      reply: d.reply || '', status: d.status, error: d.error || '', checks: d.checks || [], level, score,
      words: d.reply ? wordCount(comparable(d.reply)) : 0, provider: d.provider || '', model: d.model || '', usage,
      costAud: usage && d.provider ? costAud({ provider: d.provider, model: d.model, tokensIn: usage.in, tokensOut: usage.out }) : null,
      daily: !!d.daily,
    };
  } finally { config.voiceDir = voiceWas; }
}

const run = {
  id: newRunId(), createdAt: Date.now(),
  sides: { A: { voice: A.voice, model: A.pin, label: A.label }, B: { voice: B.voice, model: B.pin, label: B.label } },
  filter: { n, only, sinceDays, situation },
  cases: [],
};
let stopped = '';
for (const [i, c] of sample.entries()) {
  const full = buildItem({ conversationId: c.conversationId });
  const item = itemAt(full, c.cut, c.at);
  process.stdout.write(`${String(i + 1).padStart(3)}/${sample.length}  ${item.situation.primary.padEnd(22)} `);
  const a = await writeSide(A, item, c);
  const b = await writeSide(B, item, c);
  console.log(`A ${a.level} ${a.score.score}/6   B ${b.level} ${b.score.score}/6`);
  run.cases.push({
    i, conversationId: c.conversationId, situation: item.situation.primary, label: item.situation.label,
    kind: item.deal ? 'buyer' : item.isNewEnquiry ? 'new' : 'mid',
    customer: item.pending.map((e) => [e.event ? `(${e.event})` : '', e.text].filter(Boolean).join(' ')).join('\n'),
    actual: c.actual, vehicle: item.vehicles[0]?.title || '', at: c.at,
    left: Math.random() < 0.5 ? 'A' : 'B',
    A: a, B: b, vote: null,
  });
  if (a.daily || b.daily) { stopped = 'The AI allowance or the budget is used up. Stopping early.'; break; }
}
if (stopped) console.log(`\n${stopped}`);

const file = writeRun(run);
const s = summarise(run);
console.log(`\nWritten: A ${s.A.written}, B ${s.B.written} of ${run.cases.length}. Sales score out of 6: A ${s.A.score}, B ${s.B.score}. Failed a hard check: A ${s.A.fails}, B ${s.B.fails}. Median words: A ${s.A.medianWords}, B ${s.B.medianWords}.`);
console.log(`Cost: A about A$${s.A.costAud.toFixed(2)}, B about A$${s.B.costAud.toFixed(2)}${s.A.unpriced || s.B.unpriced ? ' (a model has no price, so part of it is not counted)' : ''}.`);
console.log(`\nSaved to ${file}\nRate it on the Review page: http://localhost:${config.port}/review`);
closeDb();
