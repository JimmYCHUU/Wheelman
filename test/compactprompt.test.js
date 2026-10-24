// The compact prompt style: a short voice card in place of the whole house-voice file, and only
// the sales playbook's sections that fit this message, chosen by its situation. A switch,
// PROMPT_STYLE, picks the style; without it every request is the full style, as before.
// All data is invented; a stand-in AI service on this computer plays the model. Numbers
// 0491 570 6xx are this file's.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { applyTestEnv } from './support/env.js';

applyTestEnv({ DAILY_DRAFT_LIMIT: '200' });
// No PROMPT_STYLE: the default must be the full style.
delete process.env.PROMPT_STYLE;

const now = Date.now();
const MIN = 60e3, HOUR = 3600e3, DAY = 24 * HOUR;

let config, db, items, drafter, promptModule, playbook, sync, llm, server, base;
// The stand-in AI answers in plain words, never JSON, and keeps what it was sent.
const seen = [];

before(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      try { seen.push(JSON.parse(body)); } catch { seen.push({}); }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: 'Certainly, the vehicle is available for inspection at our Lidcombe showroom.' }, finish_reason: 'stop' }] }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  ({ config } = await import('../src/config.js'));
  config.llm.gemini.url = `${base}/chat`;
  db = await import('../src/db.js');
  items = await import('../src/items.js');
  drafter = await import('../src/drafter.js');
  promptModule = await import('../src/prompt.js');
  playbook = await import('../src/playbook.js');
  sync = await import('../src/sync.js');
  llm = await import('../src/llm.js');
  sync.storeVehicles([{ id: 1, stockNo: '2614', year: '2019', title: '2019 Toyota Alphard SC', make: 'TOYOTA', model: 'Alphard', modelCode: 'AGH30', auPublishPrice: 41990, odometer: 63800, seats: 7, status: 'PUBLISHED', soldStatus: 'UnSold', stockIn: 'Online', outline: ['6 Months NSW Registration', '5-Year Extended Warranty'] }]);
});

after(async () => { await new Promise((resolve) => server.close(resolve)); });

let mid = 1;
const customer = (n, first, history) => {
  const id = 600 + n;
  db.upsertLead({ id, conversationId: id, firstName: first, lastName: 'Test', phone: `0491 570 6${String(n).padStart(2, '0')}`, email: '', source: 'carsales', status: 'FOLLOW_UP', platform: 'CARSALES', state: 'NSW', leadAt: now - 2 * DAY, updatedAt: now - HOUR, stocks: ['2614'], inquiries: [], statusHistory: [] });
  db.upsertConversation({ id, phone: `+614915706${String(n).padStart(2, '0')}`, channel: 'SMS', status: 'OPEN', leadId: id, customerName: `${first} Test`, latestDirection: 'IN', latestAt: now - MIN, latestBody: 'x' });
  for (const [direction, body, ago] of history) db.upsertMessage({ id: mid++, conversationId: id, direction, body, sentBy: direction === 'OUT' ? 'Dana' : null, status: 'SENT', mediaType: null, at: now - ago, importedAt: now - ago });
  return () => items.buildItem({ conversationId: id });
};

// The owner's confirmed rules, as the compact style must still carry them.
const CONFIRMED = ['never "Hi"', 'first reply of the day', 'No worries', 'emoji', 'one exclamation mark', 'deposit is the only urgency', 'selling fast', 'one question', 'never stated', 'lower', 'only if our staff', '[PRICE?]', 'Answer first'];

test('the compact system prompt for a text is 4,000 characters or fewer and keeps every confirmed rule', () => {
  const rules = promptModule.systemPrompt('sms', { style: 'compact' });
  assert.ok(rules.length <= 4000, `${rules.length} characters`);
  for (const phrase of CONFIRMED) assert.ok(rules.includes(phrase), `missing: ${phrase}`);
  // The card itself keeps them all, inside its own limit, with no editor's comment sent.
  const card = promptModule.voiceCard();
  assert.ok(card.length <= 2400, `${card.length} characters`);
  for (const phrase of CONFIRMED) assert.ok(card.includes(phrase), `card missing: ${phrase}`);
  assert.ok(!card.includes('<!--'));
});

test('the compact system prompt has its sections in order, and the playbook is not among them', () => {
  for (const channel of ['sms', 'marketplace', 'auction', 'email']) {
    const rules = promptModule.systemPrompt(channel, { style: 'compact' });
    assert.ok(!rules.includes('=== SELLING ==='), channel);
    const order = ['=== VOICE ===', '=== WHERE FACTS COME FROM ===', '=== PROMISES AND TIMES ===', '=== WHEN OUR STAFF GIVE AN INSTRUCTION ===', '=== OUTPUT ==='].map((h) => rules.indexOf(h));
    assert.ok(order.every((at, i) => at > 0 && (i === 0 || at > order[i - 1])), `${channel}: ${order}`);
    assert.ok(rules.startsWith('You are Wheelman'), channel);
  }
  // The channel rules stay as they are, between the voice and the facts.
  const chat = promptModule.systemPrompt('marketplace', { style: 'compact' });
  assert.ok(chat.indexOf('=== THIS CHANNEL: FACEBOOK MARKETPLACE CHAT ===') > chat.indexOf('=== VOICE ==='));
  assert.ok(chat.indexOf('=== THIS CHANNEL: FACEBOOK MARKETPLACE CHAT ===') < chat.indexOf('=== WHERE FACTS COME FROM ==='));
  assert.ok(promptModule.systemPrompt('email', { style: 'compact' }).includes('=== THIS CHANNEL: EMAIL (AN IMPORT ENQUIRY) ==='));
  // The full style is untouched: no style is the full style.
  assert.equal(promptModule.systemPrompt('sms'), promptModule.systemPrompt('sms', { style: 'full' }));
  assert.ok(promptModule.systemPrompt('sms').includes('=== SELLING ==='));
});

test('the playbook is parsed on its ## headings', () => {
  const sections = playbook.playbookSections();
  const headings = sections.map((s) => s.heading);
  for (const h of ['Where the customer is, and the move', 'The price question', 'After the sale', 'Complaints are held', 'Words that end a conversation, and words we never use']) assert.ok(headings.includes(h), h);
  assert.ok(sections.every((s) => s.body && !s.body.startsWith('## ')));
});

test('a price question gets the price section, not the after-sale one, inside 3,500 characters', () => {
  const text = playbook.playbookFor({ situation: 'price', rung: 'interest', channel: 'sms' });
  assert.ok(text.includes('The price question'), text);
  assert.ok(!text.includes('After the sale'), text);
  assert.ok(text.includes('Where the customer is, and the move'));
  assert.ok(text.includes('Words that end a conversation, and words we never use'));
  assert.ok(text.length <= 3500, `${text.length} characters`);
  // The price section's first paragraph is always there.
  const first = playbook.playbookSections().find((s) => s.heading === 'The price question').body.split(/\n\s*\n/)[0];
  assert.ok(text.includes(first), 'first paragraph of the price section');
  // On a text, the Marketplace paragraphs and the moves table stay out.
  assert.ok(!/^On Facebook Marketplace/m.test(text), 'no Marketplace paragraph on a text');
  assert.ok(!/^\|/m.test(text), 'no moves table');
  assert.ok(!/^On Facebook Marketplace/m.test(playbook.playbookFor({ situation: 'inspection', rung: 'interest', channel: 'sms' })), 'no Marketplace paragraph on a text');
  assert.ok(/^On Facebook Marketplace/m.test(playbook.playbookFor({ situation: 'inspection', rung: 'interest', channel: 'marketplace' })), 'Marketplace paragraph on Marketplace');
});

test('the situations pick their sections, a complaint first, and every result stays within 3,500 characters', () => {
  const pick = (situation, rung = 'interest', channel = 'sms') => playbook.playbookFor({ situation, rung, channel });
  assert.match(pick('complaint', 'buyer'), /Complaints are held/);
  assert.doesNotMatch(pick('complaint', 'buyer'), /After the sale/);
  assert.match(pick('after_sale', 'buyer'), /After the sale/);
  assert.match(pick('import'), /Imports: trust documents first/);
  assert.match(pick('no'), /Accepting a no/);
  assert.match(pick('far'), /The far-away customer/);
  assert.match(pick('inspection'), /Inviting an inspection/);
  assert.match(pick('hold', 'commit'), /Holding the car: the deposit is the only urgency/);
  assert.match(pick('gone'), /The sold or reserved car/);
  assert.match(pick('not_at_showroom'), /A car that is not at the showroom yet/);
  // Nothing particular: the always-sent sections only.
  const plain = pick('');
  assert.match(plain, /Where the customer is, and the move/);
  assert.match(plain, /Words that end a conversation/);
  assert.equal(plain.match(/^## /gm).length, 2);
  for (const s of ['price', 'inspection', 'far', 'hold', 'gone', 'not_at_showroom', 'after_sale', 'no', 'complaint', 'import', '']) {
    for (const channel of ['sms', 'marketplace', 'auction', 'email']) assert.ok(pick(s, 'interest', channel).length <= 3500, `${s} ${channel}`);
  }
});

test('buildPrompt with no style is the full style, byte for byte; compact carries the selling advice in the user prompt', () => {
  assert.equal(config.llm.promptStyle, 'full');
  const item = customer(1, 'Marisol', [['IN', 'Is the Alphard still available?', 2 * DAY], ['OUT', 'Hello Marisol, yes it is.', 2 * DAY - HOUR], ['IN', "What's your best price?", 5 * MIN]]);
  const plain = promptModule.buildPrompt(item(), { now });
  const full = promptModule.buildPrompt(item(), { now, style: 'full' });
  assert.equal(plain.system, full.system);
  assert.equal(plain.user, full.user);
  assert.ok(!plain.user.includes('=== SELLING FOR THIS MESSAGE ==='));

  const compact = promptModule.buildPrompt(item(), { now, style: 'compact' });
  assert.equal(compact.system, promptModule.systemPrompt('sms', { style: 'compact' }));
  const selling = compact.user.split('=== SELLING FOR THIS MESSAGE ===')[1];
  assert.ok(selling, 'the selling section is in the user prompt');
  assert.match(selling, /The price question/);
});

test('a buyer\'s complaint gets the complaint section in a compact request', () => {
  const item = customer(2, 'Tobias', [['IN', 'Is the Alphard still available?', 3 * DAY], ['OUT', 'Hello Tobias, yes it is.', 3 * DAY - HOUR], ['IN', 'I am not happy, the air conditioning is still broken and I want a refund', 5 * MIN]])();
  item.deal = { source: 'lead_status', stageText: 'they have bought the vehicle', onFile: [], notOnFile: [], others: [], signals: [] };
  const compact = promptModule.buildPrompt(item, { now, style: 'compact' });
  const selling = compact.user.split('=== SELLING FOR THIS MESSAGE ===')[1];
  assert.match(selling, /Complaints are held/);
  assert.doesNotMatch(selling, /## After the sale/);
});

test('an AI answer that is not JSON is handled in the compact style as in the full style', async () => {
  llm.resetModelState();
  const item = customer(3, 'Annika', [['IN', 'Is the Alphard still available?', 5 * MIN]]);
  seen.length = 0;
  const [full, compact] = await Promise.all([
    drafter.draftFor(item(), { save: false, now }),
    drafter.draftFor(item(), { save: false, now, style: 'compact' }),
  ]);
  assert.equal(compact.status, full.status);
  assert.notEqual(full.status, 'ready');
  assert.equal(compact.reply, '');
  // The compact request really was the compact one.
  const systems = seen.map((b) => b.messages?.[0]?.content || '');
  assert.ok(systems.some((s) => s.includes('=== SELLING ===')), 'a full request was sent');
  assert.ok(systems.some((s) => !s.includes('=== SELLING ===') && s.includes('=== VOICE ===')), 'a compact request was sent');
});
