// Inspection requests: the in-person booking link by default, the online video inspection link
// when the customer says they live far away. All data is invented.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

process.env.DB_PATH = ':memory:';
process.env.SIGN_OFF = 'Regards,\\nTeam Carbarn';
process.env.GEMINI_API_KEY = 'test-key';
process.env.OPENROUTER_API_KEY = '';
process.env.SECONDS_BETWEEN_DRAFTS = '0';
process.env.DAILY_DRAFT_LIMIT = '50';
process.env.MARKETPLACE_ENABLED = '0';

const PAGE = 'https://www.carbarn.com.au/vehicles/toyota/noah/zrr80g/1159';
const ONSITE = `${PAGE}#inspection=onsite`;
const ONLINE = `${PAGE}#inspection=online`;

let server;
const seen = [];
let script = [];
const now = Date.now();

before(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      seen.push(JSON.parse(body));
      const next = script.shift() || { reply: 'Hi {{NAME}},\nNo worries.', needs_human: [], facts_used: [], hold: false };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(next) }, finish_reason: 'stop' }] }));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { config } = await import('../src/config.js');
  config.llm.gemini.url = `http://127.0.0.1:${server.address().port}/chat`;

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

after(() => new Promise((r) => { server.close(r); server.closeAllConnections?.(); }));

const item = async (conversationId) => (await import('../src/items.js')).buildItem({ conversationId });
const draft = async (conversationId, reply) => {
  const { draftFor } = await import('../src/drafter.js');
  seen.length = 0;
  script = [{ reply, needs_human: [], facts_used: [], hold: false }];
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
  assert.ok(asked.includes(`in-person booking link so they can choose a day and time: ${ONSITE}`));
  assert.ok(d.reply.includes(ONSITE));
  assert.equal(note(d), undefined);
  assert.ok(!d.checks.some((c) => c.level === 'fail'), JSON.stringify(d.checks));
});

test('a reply that forgets the booking link is pointed out', async () => {
  const { d } = await draft(101, 'Hi {{NAME}},\nYes, you are welcome to come and see it any day.');
  assert.match(note(d).message, /no inspection booking link/);
  // A confirmed time is a fair answer without the link.
  const confirmed = await draft(101, 'Hi {{NAME}},\nNo worries. See you on Saturday.');
  assert.equal(note(confirmed.d), undefined);
});

test('a customer who says they live far away is given the online video inspection link', async () => {
  const { inspectionPlan } = await import('../src/prompt.js');
  const plan = inspectionPlan(await item(102));
  assert.equal(plan.kind, 'online');
  assert.equal(plan.url, ONLINE);

  const { d, asked } = await draft(102, `Hi {{NAME}},\nWe can do an online video inspection by WhatsApp or FaceTime. You can book a time here:\n${ONLINE}`);
  assert.ok(asked.includes(`Give this booking link so they can choose a day and time: ${ONLINE}`));
  assert.match(asked, /do not give the in-person booking link/);
  assert.equal(note(d), undefined);
  assert.ok(!d.checks.some((c) => c.level === 'fail'), JSON.stringify(d.checks));
});

test('a customer whose record is in another state also gets the online link, and the wrong link is pointed out', async () => {
  const { inspectionPlan } = await import('../src/prompt.js');
  assert.equal(inspectionPlan(await item(103)).kind, 'online');
  const { d } = await draft(103, `Hi {{NAME}},\nYou can book an inspection here:\n${ONSITE}`);
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
  // Both links are still in the vehicle facts, for when the reply offers a next step.
  assert.ok(p.includes(ONSITE) && p.includes(ONLINE));
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
