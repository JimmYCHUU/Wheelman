// No look-ahead: a draft written for a past moment sees only the learning material that existed
// then. Learned replies, corrections, owner lessons, the team's sent replies and the example bank
// dated after that moment stay out; the same rows dated before it go in. All data is invented.
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { applyTestEnv } from './support/env.js';

applyTestEnv();

const DAY = 24 * 3600e3;
const MIN = 60e3;
const asOf = Date.now() - 10 * DAY; // a fixed moment in the past
const earlier = asOf - DAY;
const later = asOf + 2 * DAY;

const q = { situations: ['trade_in'], primary: 'trade_in', text: 'Do you take trade ins? I have an old Corolla to trade', firstReply: true, excludeItemKey: 'c:1' };
const customer = 'Do you take trade ins? I have an old Corolla to trade';

let db, learn, practice, examples, config;
let mid = 880000;

before(async () => {
  ({ config } = await import('../src/config.js'));
  db = await import('../src/db.js');
  learn = await import('../src/learn.js');
  practice = await import('../src/practice.js');
  examples = await import('../src/examples.js');
});

const learned = (draftId, itemKey, at, extra = {}) => db.upsertLearned({
  draftId, itemKey, situations: ['trade_in'], firstReply: true, customerText: customer,
  draftText: `Draft ${draftId}`, finalText: `Final reply number ${draftId} about trade ins`, source: 'sent', changed: false, at, ...extra,
});

test('learned replies, corrections and owner lessons dated after the moment stay out; the same rows before it go in', () => {
  learned(9101, 'c:9101', earlier);
  learned(9102, 'c:9102', later);
  learned(9103, 'c:9103', earlier, { changed: true, similarity: 0.5, draftText: 'Drafted wording one', finalText: 'Used wording one' });
  learned(9104, 'c:9104', later, { changed: true, similarity: 0.5, draftText: 'Drafted wording two', finalText: 'Used wording two' });
  learned(9105, 'c:9105', earlier, { source: 'approved', finalText: 'Approved reply before' });
  learned(9106, 'c:9106', later, { source: 'approved', finalText: 'Approved reply after' });
  const note = (draftId, itemKey, at, lessons) => db.insertAdvice({ draftId, itemKey, situations: ['trade_in'], firstReply: true, customerText: customer, draftText: 'x', note: 'coach', lessons, at });
  note(9107, 'c:9107', earlier, [{ scope: 'any', do: 'Always ask for the odometer reading first', internal: false }]);
  note(9108, 'c:9108', later, [{ scope: 'any', do: 'Always mention the Saturday opening hours', internal: false }]);
  note(9109, 'c:9109', earlier, null);
  note(9110, 'c:9110', later, null);

  const ids = (rows) => rows.map((r) => r.id || r.used);
  const ex = learn.learnedExamples(q, 5, asOf);
  assert.ok(ids(ex).includes('learned-9101'), 'the earlier learned reply is shown');
  assert.ok(!ids(ex).includes('learned-9102'), 'the later learned reply is not');

  const fx = learn.corrections(q, 5, asOf).map((c) => c.used);
  assert.ok(fx.includes('Used wording one'));
  assert.ok(!fx.includes('Used wording two'));

  const g = learn.ownerGuidance(q, asOf);
  assert.deepEqual(g.approved.map((r) => r.final_text), ['Approved reply before']);
  assert.deepEqual(g.lessons.map((l) => l.do), ['Always ask for the odometer reading first']);
  assert.deepEqual(g.raw.map((r) => r.draft_id), [9109]);

  // At the default (now), nothing is hidden: the live app is unchanged.
  const live = learn.ownerGuidance(q);
  assert.equal(live.lessons.length, 2);
  assert.equal(live.approved.length, 2);
});

test('the example bank hides replies sent after the moment', () => {
  const row = (id, at) => ({ id, conversationId: Number(id.slice(1)), author: 'team', situations: ['trade_in'], primary: 'trade_in', firstReply: true, customer, events: [], reply: `Yes we take trade ins, reply ${id}`, replyWords: 30, at });
  fs.writeFileSync(config.examplesPath, JSON.stringify({ examples: [row('x1', earlier), row('x2', later)] }));
  const ids = examples.pickExamples(q, 6, asOf).map((e) => e.id);
  assert.deepEqual(ids, ['x1']);
  assert.deepEqual(examples.pickExamples(q, 6).map((e) => e.id).sort(), ['x1', 'x2'], 'default now shows both');
});

test('the team\'s sent replies after the moment stay out of practiceFor, and the cache follows the moment', () => {
  const lead = (id, conv, first, phone) => db.upsertLead({ id, conversationId: conv, firstName: first, lastName: 'Test', phone, email: '', source: 'carsales', status: 'FOLLOW_UP', platform: 'CARSALES', state: 'NSW', leadAt: asOf - 5 * DAY, updatedAt: asOf - 4 * DAY, stocks: [], inquiries: [], statusHistory: [] });
  const conv = (id, leadId, name, phone, at) => db.upsertConversation({ id, phone, channel: 'SMS', status: 'OPEN', leadId, customerName: name, latestDirection: 'OUT', latestAt: at, latestBody: 'x' });
  const msg = (conversationId, direction, body, at) => db.upsertMessage({ id: mid++, conversationId, direction, body, sentBy: direction === 'OUT' ? 'Dana' : null, status: 'SENT', mediaType: null, at, importedAt: at });
  const reply = 'Yes, we take trade-ins. Please send the rego, the kilometres and a few photos of your car.';
  lead(8101, 8101, 'Wade', '0421 555 391'); conv(8101, 8101, 'Wade Test', '+61421555391', earlier);
  msg(8101, 'IN', customer, earlier - 10 * MIN); msg(8101, 'OUT', `Hi Wade,\n${reply}`, earlier);
  lead(8102, 8102, 'Vera', '0421 555 392'); conv(8102, 8102, 'Vera Test', '+61421555392', later);
  msg(8102, 'IN', customer, later - 10 * MIN); msg(8102, 'OUT', `Hi Vera,\n${reply}`, later);

  practice.resetPractice();
  const keys = (now) => practice.practiceFor(q, 3, now).map((r) => r.itemKey);
  const past = keys(asOf);
  assert.deepEqual(past, ['c:8101'], 'only the earlier exchange');
  assert.ok(keys(later + DAY).includes('c:8102'), 'a later moment sees the later exchange');
  assert.deepEqual(keys(asOf), ['c:8101'], 'and going back again hides it again');
});
