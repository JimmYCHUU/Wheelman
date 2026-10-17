// The owner's Prompt (the Prompt line, or Rewrite) comes first in every section: the section's own
// rules on length, tone, layout and greeting step aside, and only the facts still bind. With a
// Prompt the price reply and the invitation are not added under the text, unless the Prompt asks
// for the booking link; the first-reply block stays. All data is invented; a stand-in AI service on
// this computer plays the model. Numbers 0491 570 9xx are this file's.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { applyTestEnv } from './support/env.js';
import { startStandins, aiBehaviour } from './support/standins.js';

applyTestEnv({ DAILY_DRAFT_LIMIT: '200' });

const now = Date.now();
const MIN = 60e3, HOUR = 3600e3, DAY = 24 * HOUR;

let standins, db, items, drafter, promptModule, sync;
const ai = aiBehaviour();
const seen = ai.seen;

before(async () => {
  standins = await startStandins({ ai });
  const { config } = await import('../src/config.js');
  config.llm.gemini.url = `${standins.base}/chat`;
  db = await import('../src/db.js');
  items = await import('../src/items.js');
  drafter = await import('../src/drafter.js');
  promptModule = await import('../src/prompt.js');
  sync = await import('../src/sync.js');
  sync.storeVehicles([{ id: 1, stockNo: '1300', year: '2021', title: '2021 Toyota Noah X', make: 'TOYOTA', model: 'Noah', modelCode: 'ZRR80', auPublishPrice: 28900, odometer: 60000, seats: 8, status: 'PUBLISHED', soldStatus: 'UnSold', stockIn: 'Online', outline: ['6 Months NSW Registration', '5-Year Extended Warranty'] }]);
});

after(async () => { await standins.close(); });

let mid = 1;
const lead = (id, conv, first, phone) => db.upsertLead({ id, conversationId: conv, firstName: first, lastName: 'Test', phone, email: '', source: 'carsales', status: 'FOLLOW_UP', platform: 'CARSALES', state: 'NSW', leadAt: now - 2 * DAY, updatedAt: now - HOUR, stocks: ['1300'], inquiries: [], statusHistory: [] });
const conv = (id, leadId, name, phone) => db.upsertConversation({ id, phone, channel: 'SMS', status: 'OPEN', leadId, customerName: name, latestDirection: 'IN', latestAt: now - MIN, latestBody: 'x' });
const msg = (conversationId, direction, body, agoMs) => db.upsertMessage({ id: mid++, conversationId, direction, body, sentBy: direction === 'OUT' ? 'Dana' : null, status: 'SENT', mediaType: null, at: now - agoMs, importedAt: now - agoMs });
const script = (...replies) => { seen.length = 0; ai.script = replies.map((reply) => ({ reply, needs_human: [], facts_used: [], hold: false })); };
const customer = (n, first, history) => {
  const id = 900 + n;
  lead(id, id, first, `0491 570 9${String(n).padStart(2, '0')}`);
  conv(id, id, `${first} Test`, `+614915709${String(n).padStart(2, '0')}`);
  for (const [direction, body, ago] of history) msg(id, direction, body, ago);
  return () => items.buildItem({ conversationId: id });
};
const words = (n) => Array.from({ length: n }, () => 'family').join(' ');

test('the Prompt outranks the section\'s rules on length, tone and layout, in every section; the facts still bind', () => {
  for (const channel of ['sms', 'marketplace', 'auction', 'email']) {
    const rules = promptModule.systemPrompt(channel);
    assert.match(rules, /When the request carries INSTRUCTION FROM OUR STAFF FOR THIS DRAFT, it outranks VOICE, SELLING, the channel's rules/, channel);
    assert.match(rules, /how long it is/, channel);
    assert.match(rules, /Only WHERE FACTS COME FROM and PROMISES AND TIMES still bind/, channel);
  }
  const item = customer(1, 'Priya', [['IN', 'Is the Noah still available?', 2 * DAY], ['OUT', 'Hello Priya, yes it is.', 2 * DAY - HOUR], ['IN', 'Does it have a tow bar?', 5 * MIN]])();
  const asked = promptModule.buildPrompt(item, { instruction: 'Write a longer reply about why it suits a big family', now }).user;
  const part = asked.split('=== INSTRUCTION FROM OUR STAFF FOR THIS DRAFT ===')[1];
  assert.match(part, /how long it is/);
  assert.match(part, /our price reply and the invitation to inspect are not added/);
});

test('with a Prompt, a price question gets no price reply under the text, and a long reply is not warned', async () => {
  const item = customer(2, 'Omar', [['IN', 'Is the Noah still available?', 2 * DAY], ['OUT', 'Hello Omar, yes it is.', 2 * DAY - HOUR], ['IN', "What's your best price?", 5 * MIN]]);
  assert.equal(promptModule.buildPrompt(item(), { now }).price.on, true, 'without a Prompt the price reply is added');
  const instruction = 'Tell him $27,500 is our best price and why the Noah is worth it';
  const asked = promptModule.buildPrompt(item(), { instruction, now });
  assert.equal(asked.price.on, false);
  assert.ok(!/=== PRICE REPLY ===/.test(asked.user));

  const long = `Good afternoon {{NAME}},\nThe best we can do on the Noah is $27,500. ${words(70)}`;
  script(long);
  const d = await drafter.draftFor(item(), { instruction, now, save: false });
  assert.equal(seen.length, 1, 'accepted first time');
  assert.ok(d.reply.includes('$27,500'), 'a figure from the Prompt may be used');
  assert.ok(!/small discount for a serious buyer/.test(d.reply), d.reply);
  assert.ok(!d.checks.some((c) => c.code === 'long'), JSON.stringify(d.checks));

  script(long.replace('$27,500', 'well priced'));
  const plain = await drafter.draftFor(item(), { now, save: false });
  assert.ok(plain.checks.some((c) => c.code === 'long'), 'without a Prompt the length band still warns');
});

test('a greeting the Prompt asks for is kept on a second text the same day', async () => {
  const item = customer(3, 'Lena', [['IN', 'Is the Noah still available?', 40 * MIN], ['OUT', 'Hello Lena, yes it is.', 30 * MIN], ['IN', 'Does it have a reversing camera?', 5 * MIN]]);
  script('Hello {{NAME}},\nThank you for your patience. Yes, it has a reversing camera.');
  const asked = await drafter.draftFor(item(), { instruction: 'Greet her by name and thank her for her patience', now, save: false });
  assert.match(asked.reply, /^Hello Lena,/, asked.reply);
  script('Hello {{NAME}},\nYes, it has a reversing camera.');
  const plain = await drafter.draftFor(item(), { now, save: false });
  assert.doesNotMatch(plain.reply, /^Hello Lena/, 'without a Prompt we greet once a day');
});

test('the first-reply block stays under a prompted first reply', async () => {
  const item = customer(4, 'Kai', [['IN', 'Is the Noah still available?', 10 * MIN]]);
  const instruction = 'Tell him it has 8 seats and suits a big family';
  assert.equal(promptModule.buildPrompt(item(), { instruction, now }).standard.on, true);
  script('Good afternoon {{NAME}},\nYes, the Noah is available, with 8 seats for a big family.');
  const d = await drafter.draftFor(item(), { instruction, now, save: false });
  assert.match(d.reply, /Our location:/, d.reply);
});

test('a customer who wants to see the car gets no invitation under a prompted reply, unless the Prompt asks for the booking link', async () => {
  const item = customer(5, 'Ilse', [['IN', 'Is the Noah still available?', 2 * DAY], ['OUT', 'Hello Ilse, yes it is.', 2 * DAY - HOUR], ['IN', 'Can I come and see it on Saturday?', 5 * MIN]]);
  const url = item().vehicles[0].url;
  assert.ok(url);

  const instruction = 'Tell her Saturday morning is quiet, so it is a good time to come';
  const asked = promptModule.buildPrompt(item(), { instruction, now });
  assert.equal(asked.inspection.block, false, 'not added under the text');
  assert.equal(asked.inspection.must, false);
  assert.ok(asked.user.includes(`${url}#inspection=onsite`), 'the AI is given the link to use if it invites her');
  script('Saturday morning is quiet, so it is a good time to come and see the Noah.');
  const d = await drafter.draftFor(item(), { instruction, now, save: false });
  assert.equal(seen.length, 1, 'no rewrite for a missing link');
  assert.ok(!d.reply.includes('#inspection='), d.reply);
  assert.ok(!d.checks.some((c) => c.level === 'fail'), JSON.stringify(d.checks));

  script('Saturday is fine.');
  const linked = await drafter.draftFor(item(), { instruction: 'Say Saturday is fine and send her the booking link', now, save: false });
  assert.ok(linked.reply.includes(`${url}#inspection=onsite`), linked.reply);
});
