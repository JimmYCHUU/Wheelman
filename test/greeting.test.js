// The greeting and the sign-off are used once a day per customer, not on every message.
// All data is invented. A stand-in AI service on this computer plays the model.
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

let server;
const seen = [];
// The model keeps greeting every time, as it tends to. The app must tidy that up itself.
const reply = { reply: 'Hi {{NAME}},\n\nYes, Saturday at 10 am works.', needs_human: [], facts_used: [], hold: false };
const now = Date.now();
const MIN = 60e3, HOUR = 3600e3;

before(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      seen.push(JSON.parse(body));
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(reply) }, finish_reason: 'stop' }] }));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { config } = await import('../src/config.js');
  config.llm.gemini.url = `http://127.0.0.1:${server.address().port}/chat`;

  const { upsertLead, upsertConversation, upsertMessage } = await import('../src/db.js');
  let mid = 1;
  const customer = (id, first, messages) => {
    upsertLead({ id, conversationId: id + 100, firstName: first, lastName: 'Test', phone: '0400111222', email: 'someone@example.com', source: 'carsales', status: 'FOLLOW_UP', platform: 'CARSALES', state: 'NSW', leadAt: now - 48 * HOUR, updatedAt: now - HOUR, stocks: [], inquiries: [] });
    upsertConversation({ id: id + 100, phone: '+61400111222', channel: 'SMS', status: 'OPEN', leadId: id, customerName: `${first} Test`, latestDirection: 'IN', latestAt: now - MIN, latestBody: 'x' });
    for (const [direction, body, agoMs] of messages) upsertMessage({ id: mid++, conversationId: id + 100, direction, body, sentBy: direction === 'OUT' ? 'Dana' : null, status: 'SENT', mediaType: null, at: now - agoMs, importedAt: now - agoMs });
  };
  // 1: never written to
  customer(1, 'Priya', [['IN', 'Can I come on Saturday at 10 am?', 2 * MIN]]);
  // 2: we wrote a few minutes ago, today
  customer(2, 'Tom', [['IN', 'Is it available?', 6 * MIN], ['OUT', 'Hi Tom,\nYes, it is available.\n\nRegards,\nTeam Carbarn', 4 * MIN], ['IN', 'Can I come on Saturday at 10 am?', 2 * MIN]]);
  // 3: we last wrote the day before yesterday
  customer(3, 'Ana', [['IN', 'Is it available?', 50 * HOUR], ['OUT', 'Hi Ana,\nYes, it is available.\n\nRegards,\nTeam Carbarn', 49 * HOUR], ['IN', 'Can I come on Saturday at 10 am?', 2 * MIN]]);
});

after(() => new Promise((r) => { server.close(r); server.closeAllConnections?.(); }));

const draft = async (conversationId) => {
  const { buildItem } = await import('../src/items.js');
  const { draftFor } = await import('../src/drafter.js');
  seen.length = 0;
  const d = await draftFor(buildItem({ conversationId }), { save: false, now });
  return { d, asked: seen[0].messages[1].content };
};

test('the first reply to a new enquiry gets the greeting and the standard block in place of the sign-off', async () => {
  const { d } = await draft(101);
  assert.ok(d.reply.startsWith('Hi Priya,\n\nYes, Saturday at 10 am works.\n\nOur location:\n📍 Unit D3, '), d.reply);
  assert.ok(d.reply.endsWith('Feel free to visit us or call\n📞 0423 840 130\nTeam Carbarn'), d.reply);
  assert.ok(!/Regards/.test(d.reply));
});

test('a second reply on the same day has no greeting and no sign-off', async () => {
  const { d, asked } = await draft(102);
  assert.equal(d.reply, 'Yes, Saturday at 10 am works.');
  assert.match(asked, /already written to this customer today/);
  assert.ok(!d.checks.some((c) => c.level === 'fail'), JSON.stringify(d.checks));
});

test('the next day the greeting and the sign-off come back', async () => {
  const { d, asked } = await draft(103);
  assert.equal(d.reply, 'Hi Ana,\n\nYes, Saturday at 10 am works.\n\nRegards,\nTeam Carbarn');
  assert.ok(!/already written to this customer today/.test(asked));
});

test('only a real greeting is removed', async () => {
  const { dropGreeting } = await import('../src/checks.js');
  assert.equal(dropGreeting('Hi {{NAME}},\n\nYes it is.'), 'Yes it is.');
  assert.equal(dropGreeting('Hi {{NAME}}, yes it is.'), 'Yes it is.');
  assert.equal(dropGreeting('Good morning, {{NAME}}.\nIt arrives on Friday.'), 'It arrives on Friday.');
  assert.equal(dropGreeting('Hello,\nNo worries.'), 'No worries.');
  assert.equal(dropGreeting('Hiace vans are in stock.'), 'Hiace vans are in stock.');
  assert.equal(dropGreeting('Yes, it is available.'), 'Yes, it is available.');
  assert.equal(dropGreeting('Hi {{NAME}},'), 'Hi {{NAME}},');
});
