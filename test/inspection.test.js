// Inspection requests: the in-person booking link by default, the online video inspection link
// when the customer says they live far away. All data is invented.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { applyTestEnv } from './support/env.js';
import { startStandins, aiBehaviour } from './support/standins.js';

applyTestEnv({ DAILY_DRAFT_LIMIT: '50' });

const PAGE = 'https://www.carbarn.com.au/vehicles/toyota/noah/zrr80g/1159';
const ONSITE = `${PAGE}#inspection=onsite`;
const ONLINE = `${PAGE}#inspection=online`;

let standins;
const ai = aiBehaviour();
const seen = ai.seen;
const now = Date.now();

before(async () => {
  standins = await startStandins({ ai });
  const { config } = await import('../src/config.js');
  config.llm.gemini.url = `${standins.base}/chat`;

  const { upsertLead, upsertConversation, upsertMessage, upsertVehicle } = await import('../src/db.js');
  const { normalizeVehicle } = await import('../src/normalize.js');
  upsertVehicle(normalizeVehicle({ id: 1, stockNo: '1159', year: '2021', title: '2021 Toyota Noah X (8 Seater)', make: 'TOYOTA', model: 'Noah', modelCode: 'ZRR80G', auPublishPrice: 28900, odometer: 62733, status: 'PUBLISHED', soldStatus: 'UnSold', stockIn: 'Online' }));
  upsertVehicle(normalizeVehicle({ id: 2, stockNo: '1300', year: '2020', title: '2020 Toyota Hiace DX', make: 'TOYOTA', model: 'Hiace', modelCode: 'GDH206V', auPublishPrice: 33900, odometer: 98000, status: 'PUBLISHED', soldStatus: 'UnSold', stockIn: 'Transit' }));

  let mid = 1;
  const customer = (id, first, state, stock, text) => {
    upsertLead({ id, conversationId: id + 100, firstName: first, lastName: 'Test', phone: '0400111222', email: 'someone@example.com', source: 'carsales', status: 'FOLLOW_UP', platform: 'CARSALES', state, leadAt: now - 3600e3, updatedAt: now - 3600e3, stocks: [stock], inquiries: [] });
    upsertConversation({ id: id + 100, phone: '+61400111222', channel: 'SMS', status: 'OPEN', leadId: id, customerName: `${first} Test`, latestDirection: 'IN', latestAt: now - 120e3, latestBody: 'x' });
    upsertMessage({ id: mid++, conversationId: id + 100, direction: 'IN', body: text, sentBy: null, status: 'SENT', mediaType: null, at: now - 120e3, importedAt: now - 120e3 });
  };
  customer(1, 'Priya', 'NSW', '1159', 'Can I come and have a look at the Noah this weekend?');
  customer(2, 'Tom', '', '1159', 'I live in Melbourne. Is there any way I can inspect it?');
  customer(3, 'Ana', 'QLD', '1159', 'Can I inspect the car before buying?');
  customer(4, 'Ken', 'NSW', '1300', 'Can I come and see the Hiace tomorrow?');
  customer(5, 'Max', 'NSW', '1159', 'How many seats does it have?');
});

after(() => standins.close());

const item = async (conversationId) => (await import('../src/items.js')).buildItem({ conversationId });
const draft = async (conversationId, reply) => {
  const { draftFor } = await import('../src/drafter.js');
  seen.length = 0;
  ai.script = [{ reply, needs_human: [], facts_used: [], hold: false }];
  const d = await draftFor(await item(conversationId), { save: false, now });
  return { d, asked: seen[0].messages[1].content };
};
const note = (d) => d.checks.find((c) => c.code === 'inspection-link');

test('a customer who wants to see the car is given the in-person booking link', async () => {
  const { inspectionPlan } = await import('../src/prompt.js');
  const plan = inspectionPlan(await item(101));
  assert.equal(plan.kind, 'onsite');
  assert.equal(plan.url, ONSITE);

  const { d, asked } = await draft(101, `Hi {{NAME}},\nYou are welcome to inspect the Noah at our Lidcombe yard. You can book a time here:\n${ONSITE}\nPlease call or text before visiting.`);
  assert.match(asked, /=== INSPECTION ===/);
  // On a first reply the booking link is part of the standard block, so the AI is told not to type it.
  assert.match(asked, /The link itself is added under your text automatically \("Book your inspection:"\), so do not write it/);
  assert.ok(d.reply.includes(`Book your inspection:\n${ONSITE}`));
  assert.equal((d.reply.match(/#inspection=onsite/g) || []).length, 1, 'the link the AI typed is dropped, the block gives it once');
  assert.equal(note(d), undefined);
  assert.ok(!d.checks.some((c) => c.level === 'fail'), JSON.stringify(d.checks));
});

test('on a first reply the booking link is there even when the AI forgets it', async () => {
  const { d } = await draft(101, 'Hi {{NAME}},\nYes, you are welcome to come and see it any day.');
  assert.ok(d.reply.includes(`Book your inspection:\n${ONSITE}`));
  assert.equal(note(d), undefined);
});

test('a customer who says they live far away is given the online video inspection link', async () => {
  const { inspectionPlan } = await import('../src/prompt.js');
  const plan = inspectionPlan(await item(102));
  assert.equal(plan.kind, 'online');
  assert.equal(plan.url, ONLINE);

  const { d, asked } = await draft(102, `Hi {{NAME}},\nWe can do an online video inspection by WhatsApp or FaceTime. You can book a time here:\n${ONLINE}`);
  assert.match(asked, /Offer an online video inspection: a live video call on WhatsApp or FaceTime/);
  assert.match(asked, /do not give the in-person booking link/);
  assert.ok(d.reply.includes(`Book your inspection:\n${ONLINE}`));
  assert.ok(!d.reply.includes(ONSITE));
  assert.equal(note(d), undefined);
  assert.ok(!d.checks.some((c) => c.level === 'fail'), JSON.stringify(d.checks));
});

test('a record in another state is only a hint: both links are offered and the reply never says where the customer lives', async () => {
  const { inspectionPlan } = await import('../src/prompt.js');
  const plan = inspectionPlan(await item(103));
  assert.equal(plan.kind, 'onsite');
  assert.deepEqual(plan.urls, [ONSITE, ONLINE]);
  const { d, asked } = await draft(103, `Hi {{NAME}},\nYou are welcome to inspect it. You can book a time here:\n${ONSITE}\nIf you cannot make it to Lidcombe, we can do a video call instead:\n${ONLINE}`);
  assert.match(asked, /Do not say or imply where the customer lives/);
  assert.ok(!/CUSTOMER LOCATION|QLD|Queensland/.test(asked), 'the state on the record is not given to the AI');
  assert.equal(note(d), undefined);
  assert.ok(!d.checks.some((c) => c.level === 'fail'), JSON.stringify(d.checks));
});

test('a customer who said they are far away, but is given the in-person link, is pointed out', async () => {
  const { draftFor } = await import('../src/drafter.js');
  const wrong = { reply: `Hi {{NAME}},\nYou can book an inspection here:\n${ONSITE}`, needs_human: [], facts_used: [], hold: false };
  ai.script = [wrong, wrong]; // the AI makes the same mistake on its second attempt
  const d = await draftFor(await item(102), { save: false, now });
  // The in-person link was not supplied for this customer, so it is not accepted at all.
  assert.ok(d.checks.some((c) => c.code === 'link' && c.level === 'fail'), JSON.stringify(d.checks));
  assert.match(note(d).message, /far away.*in-person booking link/);
});

test('a car that is not at the yard yet gets no booking link', async () => {
  const { inspectionPlan, buildPrompt } = await import('../src/prompt.js');
  const it = await item(104);
  const plan = inspectionPlan(it);
  assert.equal(plan.kind, null);
  assert.match(plan.lines.join(' '), /cannot be inspected in person or by video yet/);
  assert.ok(!buildPrompt(it, { now }).user.includes('#inspection='), 'no booking link is supplied for a car in transit');
});

test('nothing about inspections is added when the customer did not ask to see the car', async () => {
  const { inspectionPlan, buildPrompt } = await import('../src/prompt.js');
  const it = await item(105);
  assert.equal(inspectionPlan(it).lines.length, 0);
  const p = buildPrompt(it, { now }).user;
  assert.ok(!p.includes('=== INSPECTION ==='));
  // No booking link is supplied at all, so one cannot be offered unasked.
  assert.ok(!p.includes('#inspection='));
  assert.ok(p.includes(PAGE), 'the vehicle page link is still supplied');
});

test('pickup times, opening hours and booking references are not inspection requests', async () => {
  const { classify } = await import('../src/situations.js');
  const wants = (t) => classify(t).all.includes('inspection_booking');
  for (const t of ['What time can I pick it up tomorrow?', 'My booking reference is 12345', 'Are you open on Sunday?', 'I had a look at the review online', 'I will come to pick it up at 3', 'Can I come and pay the balance on Friday?', 'I see the price has changed'])
    assert.equal(wants(t), false, t);
  for (const t of ['Can I inspect it?', 'Could I test drive it on Saturday', 'Can I come and have a look this weekend?', 'I would like to come and see it', 'Can we come down tomorrow?', 'Is it possible to see the car in person', 'When is a good time to come and view it?', 'Can I book an inspection'])
    assert.equal(wants(t), true, t);
  assert.ok(classify('Are you open on Sunday?').all.includes('location_hours'));
});

test('how "far away" is recognised', async () => {
  const { livesFarAway } = await import('../src/situations.js');
  for (const text of ['I live in Melbourne', 'We are interstate', "we aren't able to come all the way there to test drive", 'It is too far for me to drive', "I'm in WA", 'I am 5 hours away', 'Would buy sight unseen', 'I am not in Sydney'])
    assert.equal(livesFarAway(text), true, text);
  for (const text of ['Is it still available?', "I can't come today, how about tomorrow?", 'Can I come at 2pm?', "Can't make it down today, sorry", 'Where are you located?'])
    assert.equal(livesFarAway(text), false, text);
  assert.equal(livesFarAway('Can I inspect it?', 'VIC'), true);
  assert.equal(livesFarAway('Can I inspect it?', 'NSW'), false);
  assert.equal(livesFarAway('Can I inspect it?', ''), false);
});
