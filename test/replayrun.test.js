// The replay runner: a result per case and style, full on a sample only, resuming, stopping when the
// daily allowance is used, and the paired comparison with its gate. The drafter is a stand-in; all
// data is invented. Numbers 0491 570 8xx are this file's.
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { applyTestEnv } from './support/env.js';

applyTestEnv();

const now = Date.now();
const HOUR = 3600e3;
let runReplay, pairStats, cases;

before(async () => {
  const db = await import('../src/db.js');
  ({ runReplay } = await import('../src/replayrun.js'));
  ({ pairStats } = await import('../src/replaystats.js'));
  cases = [];
  for (let n = 1; n <= 3; n++) {
    const id = 800 + n;
    db.upsertLead({ id, conversationId: id, firstName: `Rin${n}`, lastName: 'Test', phone: `0491 570 8${n}7`, email: '', source: 'carsales', status: 'FOLLOW_UP', platform: 'CARSALES', state: 'NSW', leadAt: now - 48 * HOUR, updatedAt: now - HOUR, stocks: [], inquiries: [], statusHistory: [] });
    db.upsertConversation({ id, phone: `+61491570${n}87`, channel: 'SMS', status: 'OPEN', leadId: id, customerName: `Rin${n} Test`, latestDirection: 'OUT', latestAt: now - HOUR, latestBody: 'x' });
    db.upsertMessage({ id: id * 10, conversationId: id, direction: 'IN', body: 'Is it still available?', sentBy: null, status: 'SENT', mediaType: null, at: now - 3 * HOUR, importedAt: now - 3 * HOUR });
    db.upsertMessage({ id: id * 10 + 1, conversationId: id, direction: 'OUT', body: 'Yes it is, come and see it.', sentBy: 'Dana', status: 'SENT', mediaType: null, at: now - 2 * HOUR, importedAt: now - 2 * HOUR });
    cases.push({ conversationId: id, cut: 1, author: null, actual: 'Yes it is, come and see it.', situation: 'availability', at: now - 2 * HOUR });
  }
});

const ready = (reply = 'Yes it is, come and see it.') => ({ status: 'ready', reply, checks: [], model: 'stand-in', usage: { in: 3000, out: 100 }, nextStep: '', rung: '' });

test('full runs on the first sampleFull cases only; compact runs on all', async () => {
  const calls = [];
  const draft = async (item, opts) => { calls.push(opts); return ready(); };
  const { results, stopped } = await runReplay({ cases, styles: ['full', 'compact'], sampleFull: 2, draft });
  assert.equal(stopped, null);
  assert.equal(results.filter((r) => r.style === 'full').length, 2);
  assert.equal(results.filter((r) => r.style === 'compact').length, 3);
  assert.deepEqual(calls[0], { save: false, holdOutConversation: true, now: cases[0].at, style: 'full' });
  const r = results[0];
  assert.equal(r.similarity, 1);
  assert.equal(r.worst, 'ok');
  assert.equal(r.tokensIn, 3000);
  assert.equal(r.tokensOut, 100);
  assert.equal(r.model, 'stand-in');
  assert.equal(typeof r.salesOurs, 'number');
  assert.equal(typeof r.salesTheirs, 'number');
});

test('resumeFrom skips what was already run', async () => {
  const seen = [];
  const draft = async () => ready();
  const first = await runReplay({ cases, styles: ['compact'], draft, onResult: (r) => seen.push(r) });
  assert.equal(first.results.length, 3);
  const { results } = await runReplay({ cases, styles: ['compact'], draft, resumeFrom: [seen[0]] });
  assert.equal(results.length, 2);
  assert.ok(!results.some((r) => r.key === seen[0].key));
});

test('the daily allowance used up stops the run and keeps the results so far', async () => {
  let n = 0;
  const landed = [];
  const draft = async () => (++n > 2 ? { status: 'failed', reply: '', daily: true, checks: [{ level: 'fail' }] } : ready());
  const { results, stopped } = await runReplay({ cases, styles: ['compact'], draft, onResult: (r) => landed.push(r) });
  assert.equal(stopped, 'daily');
  assert.equal(results.length, 2);
  assert.equal(landed.length, 2);
});

test('another failure stops the run as an error', async () => {
  const { results, stopped } = await runReplay({ cases, styles: ['compact'], draft: async () => { throw new Error('boom'); } });
  assert.equal(stopped, 'error');
  assert.equal(results.length, 0);
});

const row = (key, style, similarity, extra = {}) => ({ key, style, similarity, salesOurs: 3, salesTheirs: 3, worst: 'ok', tokensIn: style === 'full' ? 15500 : 3900, tokensOut: 100, model: 'm', ms: 1, ...extra });

test('pairStats fails the gate when compact is more than 0.02 below full', () => {
  const s = pairStats([row('a', 'full', 0.6), row('a', 'compact', 0.5)]);
  assert.equal(s.paired, 1);
  assert.equal(s.gate.pass, false);
  assert.ok(s.gate.reasons.includes('compact median similarity 0.50 is more than 0.02 below full 0.60'));
});

test('pairStats passes when compact is close, with equal close80 and fail rate and 3,900 median tokens', () => {
  const s = pairStats([row('a', 'full', 0.6), row('a', 'compact', 0.59)]);
  assert.deepEqual(s.gate, { pass: true, reasons: [] });
  assert.equal(s.compact.medianTokensIn, 3900);
});

test('pairStats counts only cases present in both styles', () => {
  const s = pairStats([row('a', 'full', 0.6), row('a', 'compact', 0.6), row('b', 'compact', 0.1), row('c', 'compact', 0.1)]);
  assert.equal(s.paired, 1);
  assert.equal(s.compact.n, 1);
  assert.equal(s.compact.medianSimilarity, 0.6);
});

test('pairStats fails the gate on a higher fail rate or heavier prompts', () => {
  const bad = pairStats([row('a', 'full', 0.9), row('a', 'compact', 0.9, { worst: 'fail', tokensIn: 5000 })]);
  assert.equal(bad.gate.pass, false);
  assert.equal(bad.gate.reasons.length, 2);
});
