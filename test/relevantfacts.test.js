// The compact style sends only the business facts and how-we-work paragraphs this message needs.
// All topics here are invented and passed in; no real knowledge file is read for the retrieval checks.
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { applyTestEnv } from './support/env.js';

applyTestEnv({ DAILY_DRAFT_LIMIT: '200' });
delete process.env.PROMPT_STYLE;

const TOPICS = [
  { title: 'Our address', status: 'confirmed', answer: '1 Example Road, Testville.' },
  { title: 'Opening hours', status: 'confirmed', answer: 'Every day, 9 to 5.' },
  { title: 'Holding deposit', status: 'confirmed', answer: 'A refundable deposit holds a car.' },
  { title: 'Trade-ins', status: 'working', answer: 'We take trade-ins; a person values the car.' },
  { title: 'Extended warranty when not included', status: 'confirmed', answer: 'A person quotes the extended warranty cost.' },
  { title: 'Roof racks', status: 'needs_answer', answer: '' },
];

let knowledge, promptModule, config, db, items, sync;
before(async () => {
  knowledge = await import('../src/knowledge.js');
  promptModule = await import('../src/prompt.js');
  ({ config } = await import('../src/config.js'));
  db = await import('../src/db.js');
  items = await import('../src/items.js');
  sync = await import('../src/sync.js');
});

test('a trade-in question gets the trade-in topic and the core topics, not an unrelated one', () => {
  const out = knowledge.relevantFacts('What is my trade-in worth?', { topics: TOPICS });
  assert.match(out, /^- Trade-ins: /m);
  for (const t of ['Our address', 'Opening hours', 'Holding deposit']) assert.ok(out.includes(`- ${t}: `), t);
  assert.ok(!out.includes('Extended warranty'));
});

test('a message with no useful words still carries exactly the core topics', () => {
  const out = knowledge.relevantFacts('is it still available?', { topics: TOPICS });
  assert.deepEqual(out.split('\n').map((l) => l.split(':')[0]), ['- Our address', '- Opening hours', '- Holding deposit']);
  assert.equal(knowledge.relevantFacts('', { topics: TOPICS }).split('\n').length, 3);
});

test('a topic with no confirmed answer is never included, even when asked about', () => {
  const out = knowledge.relevantFacts('Do you sell roof racks?', { topics: TOPICS });
  assert.ok(!out.includes('Roof racks'));
});

test('max limits the non-core topics, and the lines read as the full list writes them', () => {
  const many = [...TOPICS.slice(0, 3), ...['alpha', 'beta', 'gamma'].map((w) => ({ title: `Spare ${w} tyre`, status: 'confirmed', answer: `Line one\nline two ${w}` }))];
  const out = knowledge.relevantFacts('spare tyre alpha beta gamma', { topics: many, max: 2 });
  assert.equal(out.split('\n').length, 5);
  assert.ok(out.includes('- Spare alpha tyre: Line one line two alpha'));
});

test('relevantOperations picks paragraphs sharing two or more words, and is empty otherwise', () => {
  const text = 'We register every vehicle in New South Wales only.\n\nA spare key is an extra that a person quotes.\n\nPlates are standard.';
  assert.equal(knowledge.relevantOperations('Can I register it in New South Wales?', { text }), 'We register every vehicle in New South Wales only.');
  assert.equal(knowledge.relevantOperations('hello there', { text }), '');
  assert.equal(knowledge.relevantOperations('registered', { text }), '');
});

test('a compact price-question prompt is about 4,000 tokens (16,000 characters) or fewer', () => {
  const id = 790;
  const now = Date.now();
  sync.storeVehicles([{ id: 1, stockNo: '2614', year: '2019', title: '2019 Toyota Alphard SC', make: 'TOYOTA', model: 'Alphard', modelCode: 'AGH30', auPublishPrice: 41990, odometer: 63800, seats: 7, status: 'PUBLISHED', soldStatus: 'UnSold', stockIn: 'Online', outline: ['6 Months NSW Registration'] }]);
  db.upsertLead({ id, conversationId: id, firstName: 'Petra', lastName: 'Test', phone: '0491 570 790', email: '', source: 'carsales', status: 'FOLLOW_UP', platform: 'CARSALES', state: 'NSW', leadAt: now - 86400e3, updatedAt: now - 3600e3, stocks: ['2614'], inquiries: [], statusHistory: [] });
  db.upsertConversation({ id, phone: '+61491570790', channel: 'SMS', status: 'OPEN', leadId: id, customerName: 'Petra Test', latestDirection: 'IN', latestAt: now - 60e3, latestBody: 'x' });
  db.upsertMessage({ id: 9001, conversationId: id, direction: 'IN', body: "What's your best price on the Alphard?", sentBy: null, status: 'SENT', mediaType: null, at: now - 60e3, importedAt: now - 60e3 });
  const item = items.buildItem({ conversationId: id });
  const full = promptModule.buildPrompt(item, { now, style: 'full' });
  const compact = promptModule.buildPrompt(item, { now, style: 'compact' });
  assert.ok(compact.system.length + compact.user.length <= 16000, `${compact.system.length + compact.user.length} characters`);
  assert.ok(compact.system.length + compact.user.length < full.system.length + full.user.length);
  assert.equal(config.llm.promptStyle, 'full');
});
