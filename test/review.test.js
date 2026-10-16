// The review: past exchanges collected for a replay, a run file of two sides, the owner's votes
// through the page's routes, and the sales score as the review and the report judge a reply.
// All names, numbers and messages are invented; the run files go to a scratch folder.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { applyTestEnv } from './support/env.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wheelman-review-'));
applyTestEnv({ REVIEW_DIR: dir });

const db = await import('../src/db.js');
const review = await import('../src/review.js');
const selling = await import('../src/selling.js');
const replay = await import('../src/replaycases.js');
const items = await import('../src/items.js');

let app, base;
before(async () => {
  db.openDb();
  app = await (await import('../src/server.js')).startServer();
  base = `http://127.0.0.1:${app.address().port}`;
});
after(async () => {
  await new Promise((r) => { app.close(r); app.closeAllConnections?.(); });
  fs.rmSync(dir, { recursive: true, force: true });
});

/** A request to the page's own server: from this computer, or as cloudflared hands one on. */
function call(method, p, { body = null, tunnel = false } = {}) {
  return new Promise((resolve, reject) => {
    const data = body === null ? '' : JSON.stringify(body);
    const headers = { ...(tunnel ? { host: 'quiet-river-invented.trycloudflare.com', 'cf-ray': '8a1b2c3d4e5f-SYD', 'cf-connecting-ip': '203.0.113.5', 'x-forwarded-proto': 'https' } : {}) };
    if (data) { headers['content-type'] = 'application/json'; headers['content-length'] = Buffer.byteLength(data); }
    const req = http.request(`${base}${p}`, { method, headers }, (res) => {
      let text = '';
      res.on('data', (c) => { text += c; });
      res.on('end', () => { let json = null; try { json = JSON.parse(text); } catch { /* html */ } resolve({ status: res.statusCode, text, json }); });
    });
    req.on('error', reject);
    req.end(data);
  });
}

const side = (reply, score, extra = {}) => ({ reply, status: 'ready', error: '', checks: [], level: 'ok', score: { score, parts: {}, notes: [] }, words: reply.split(/\s+/).length, provider: 'gemini', model: 'model-a', usage: { in: 1000, out: 100 }, costAud: 0.01, ...extra });
const sampleRun = (id) => ({
  id, createdAt: Date.now(),
  sides: { A: { voice: 'voice', model: null, label: 'the current voice' }, B: { voice: 'voice-next', model: null, label: 'voice from voice-next' } },
  filter: { n: 2, only: null, sinceDays: 0, situation: '' },
  cases: [
    { i: 0, conversationId: 1, situation: 'availability', label: 'Is it still available', kind: 'new', customer: 'Is the Noah still available?', actual: 'Yes it is.', vehicle: '2021 Toyota Noah', at: Date.now(), left: 'B', A: side('Yes, the Noah is here.', 5), B: side('Yes, the 2021 Noah is available for inspection at our Lidcombe showroom.', 6), vote: null },
    { i: 1, conversationId: 2, situation: 'price_negotiation', label: 'Best price', kind: 'mid', customer: 'Best price?', actual: 'Come and see it first.', vehicle: '', at: Date.now(), left: 'A', A: side('We talk price at the yard.', 4, { level: 'fail', checks: [{ level: 'fail', code: 'urgency', message: 'x' }] }), B: side('The price includes six months of registration.', 5), vote: null },
  ],
});

test('the sales score, as the review and the report judge a reply: six points in the formal register', () => {
  const good = selling.salesScore({ body: 'Yes, the 2021 Noah is available for inspection at our Lidcombe showroom. It has 62,733 km verified on the export certificate.', rung: 'interest', situations: ['availability'], firstReply: true });
  assert.equal(good.score, 6, JSON.stringify(good.parts));
  const poor = selling.salesScore({ body: 'No worries mate, it is available. Other buyers are interested. Cash? Finance?', rung: 'interest', situations: ['availability'] });
  assert.equal(poor.parts.register, false, 'slang');
  assert.equal(poor.parts.noUrgency, false);
  assert.equal(poor.parts.questionOnlyWhenNeeded, false, 'two questions');
  assert.ok(poor.notes.includes('informal or apologetic wording'));
  // A question is right only when one was needed; none is right only when none was.
  const asks = 'The vehicle is available. What is your postcode, so that we can quote the delivery?';
  assert.equal(selling.salesScore({ body: asks, question: 'What is your postcode?' }).parts.questionOnlyWhenNeeded, true);
  assert.equal(selling.salesScore({ body: asks, question: '' }).parts.questionOnlyWhenNeeded, false, 'none was needed');
  assert.equal(selling.salesScore({ body: 'The vehicle is available for inspection.', question: 'What is your postcode?' }).parts.questionOnlyWhenNeeded, false, 'one was needed');
  assert.equal(selling.salesScore({ body: 'The vehicle is available for inspection.' }).parts.questionOnlyWhenNeeded, true, 'not known: one or none is fine');
  // A block that was due counts only when it is there; proof likewise.
  assert.equal(selling.salesScore({ body: 'We look forward to seeing you.', due: { price: true, priceGiven: false } }).parts.dueBlocks, false);
  assert.equal(selling.salesScore({ body: 'We look forward to seeing you.', due: { price: true, priceGiven: true } }).parts.dueBlocks, true);
  assert.equal(selling.salesScore({ body: 'It has done 60,000 km. You are welcome to come and see it.', rung: 'proof', situations: ['history_kms'] }).parts.dueBlocks, false);
  assert.equal(selling.salesScore({ body: 'Sorry to bother you, it is available!!', situations: ['availability'] }).parts.register, false, 'apologetic, and two exclamation marks');
  assert.equal(selling.salesScore({ body: 'Yes, available at Lidcombe. Book an inspection below.', channel: 'marketplace' }).parts.length, true);
  assert.equal(selling.salesScore({ body: new Array(95).fill('word').join(' '), channel: 'marketplace' }).parts.length, false, 'over 90 words in a chat');
});

test('a run is written whole, listed newest first, read by name, and never from a name that is not plain', () => {
  const older = sampleRun('2026-10-11-0900-00');
  older.createdAt -= 1000;
  review.writeRun(older);
  review.writeRun(sampleRun('2026-10-12-1432-05'));
  assert.deepEqual(review.listRuns().map((r) => r.id), ['2026-10-12-1432-05', '2026-10-11-0900-00']);
  assert.equal(review.listRuns()[0].n, 2);
  assert.equal(review.listRuns()[0].rated, 0);
  assert.equal(review.readRun('2026-10-12-1432-05').cases.length, 2);
  assert.equal(review.readRun('../2026-10-12-1432-05'), null);
  assert.equal(review.readRun('nobody'), null);
  assert.throws(() => review.writeRun({ id: 'a/b', cases: [] }), /plain name/);
  assert.ok(!fs.readdirSync(dir).some((f) => f.endsWith('.tmp')), 'nothing half-written is left');
});

test("the owner's vote is kept with the side it stood for, and the tallies follow", () => {
  review.writeRun(sampleRun('2026-10-12-1500-00'));
  const first = review.vote('2026-10-12-1500-00', 0, 'left');
  assert.equal(first.case.vote.side, 'B', 'left was B on this case');
  assert.equal(first.summary.wins.B, 1);
  const second = review.vote('2026-10-12-1500-00', 1, 'both_poor');
  assert.equal(second.case.vote.side, null);
  assert.equal(second.summary.wins.poor, 1);
  assert.equal(second.summary.rated, 2);
  assert.equal(second.summary.unrated, 0);
  assert.equal(second.summary.A.score, 4.5);
  assert.equal(second.summary.B.score, 5.5);
  assert.equal(second.summary.A.fails, 1);
  assert.equal(second.summary.A.costAud, 0.02);
  assert.deepEqual(second.summary.bySituation.map((r) => [r.situation, r.A, r.B, r.poor]), [['availability', 0, 1, 0], ['price_negotiation', 0, 0, 1]]);
  assert.equal(review.readRun('2026-10-12-1500-00').cases[0].vote.pick, 'left', 'saved to the file');
  assert.throws(() => review.vote('2026-10-12-1500-00', 7, 'left'), /not in the run/);
  assert.throws(() => review.vote('2026-10-12-1500-00', 0, 'maybe'), /Pick/);
  assert.throws(() => review.vote('nobody', 0, 'left'), /not here/);
  // The vote can be taken back by voting again.
  assert.equal(review.vote('2026-10-12-1500-00', 0, 'right').case.vote.side, 'A');
});

test("the page's routes: the runs, one run with its tallies, a vote; never through the team link", async () => {
  review.writeRun(sampleRun('2026-10-12-1600-00'));
  const list = await call('GET', '/api/review');
  assert.equal(list.status, 200);
  assert.ok(list.json.runs.some((r) => r.id === '2026-10-12-1600-00'));
  const run = await call('GET', '/api/review/2026-10-12-1600-00');
  assert.equal(run.status, 200);
  assert.equal(run.json.cases.length, 2);
  assert.equal(run.json.summary.n, 2);
  assert.equal((await call('GET', '/api/review/nobody')).status, 404);
  assert.equal((await call('GET', '/api/review/..%2Fx')).status, 404);
  const voted = await call('POST', '/api/review/2026-10-12-1600-00/vote', { body: { case: 1, pick: 'right' } });
  assert.equal(voted.status, 200);
  assert.equal(voted.json.case.vote.side, 'B', 'left was A on the second case, so right is B');
  assert.equal(voted.json.summary.wins.B, 1);
  assert.equal((await call('POST', '/api/review/2026-10-12-1600-00/vote', { body: { case: 1, pick: 'maybe' } })).status, 400);
  const page = await call('GET', '/review');
  assert.equal(page.status, 200);
  assert.match(page.text, /review\.js/);
  assert.ok(!/Noah/.test(page.text), 'the page itself carries no customer text');
  // Through the tunnel the review is refused outright: the runs hold real customer text.
  for (const p of ['/api/review', '/api/review/2026-10-12-1600-00', '/review', '/review.html']) assert.equal((await call('GET', p, { tunnel: true })).status, 403, p);
  assert.equal((await call('POST', '/api/review/2026-10-12-1600-00/vote', { body: { case: 0, pick: 'left' }, tunnel: true })).status, 403);
});

test('past exchanges are collected as the conversation stood before our reply, with the real reply kept aside', () => {
  const now = Date.now();
  const MIN = 60e3;
  let mid = 900;
  const msg = (conversationId, direction, body, agoMs, sentBy = null) => db.upsertMessage({ id: mid++, conversationId, direction, body, sentBy, status: 'SENT', mediaType: null, at: now - agoMs, importedAt: now - agoMs });
  db.upsertLead({ id: 71, conversationId: 701, firstName: 'Priya', lastName: 'Test', phone: '0491 570 101', email: '', source: 'carsales', status: 'NEW', platform: 'CARSALES', state: 'NSW', leadAt: now - 3 * 60 * MIN, updatedAt: now - 3 * 60 * MIN, stocks: [], inquiries: [] });
  db.upsertConversation({ id: 701, phone: '+61491570101', channel: 'SMS', status: 'OPEN', leadId: 71, customerName: 'Priya Test', latestDirection: 'OUT', latestAt: now - 100 * MIN, latestBody: 'x' });
  msg(701, 'IN', 'Hi, is the Noah still available?', 120 * MIN);
  msg(701, 'OUT', 'Hi Priya,\nYes, it is here and ready to see. We open at 8 on Saturday, so any time from then.', 100 * MIN, 'Alex STONE');
  // A second conversation with only an acknowledgement is no case.
  db.upsertLead({ id: 72, conversationId: 702, firstName: 'Ravi', lastName: 'Test', phone: '0491 570 102', email: '', source: 'carsales', status: 'NEW', platform: 'CARSALES', state: 'NSW', leadAt: now - 3 * 60 * MIN, updatedAt: now - 3 * 60 * MIN, stocks: [], inquiries: [] });
  db.upsertConversation({ id: 702, phone: '+61491570102', channel: 'SMS', status: 'OPEN', leadId: 72, customerName: 'Ravi Test', latestDirection: 'OUT', latestAt: now - 50 * MIN, latestBody: 'x' });
  msg(702, 'IN', 'Thanks!', 60 * MIN);
  msg(702, 'OUT', 'No worries.', 50 * MIN, 'Alex STONE');

  const all = replay.collectCases(db.openDb());
  const one = all.find((c) => c.conversationId === 701);
  assert.ok(one, JSON.stringify(all));
  assert.equal(one.author, 'alex', 'a reply by one of the voices');
  assert.match(one.actual, /Yes, it is here and ready to see/);
  assert.equal(one.situation, 'availability');
  assert.ok(!all.some((c) => c.conversationId === 702), 'a thank-you answered is no case');
  assert.ok(replay.collectCases(db.openDb(), { situation: 'finance' }).every((c) => c.situation === 'finance'));
  assert.ok(replay.collectCases(db.openDb(), { since: now - 10 * MIN }).every((c) => c.at >= now - 10 * MIN));
  assert.equal(replay.collectCases(db.openDb(), { only: 'first' }).find((c) => c.conversationId === 701)?.conversationId, 701, 'a first reply to a new enquiry');
  const full = items.buildItem({ conversationId: 701 });
  const before = replay.itemAt(full, one.cut, one.at);
  assert.equal(before.state, 'awaiting', 'as it stood before our reply');
  assert.equal(replay.spread(all, 1).length, 1);
});
