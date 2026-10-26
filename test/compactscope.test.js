// Which writes use the compact prompt style. The replay measured it on one kind of write only: a
// plain reply to a customer's text on the dashboard. With PROMPT_STYLE=compact that write is
// compact, and every other one (a Prompt or Rewrite, Could be better, a template, a follow-up,
// Marketplace, an Import Query email, Auction) keeps the full style until it is replayed too. A
// style given for one write (the replay, the tests) is used as given. Each draft keeps the style
// it was written in. All data is invented; a stand-in AI service on this computer plays the model.
// Numbers 0491 570 2xx are this file's.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { applyTestEnv } from './support/env.js';
import { startStandins, aiBehaviour } from './support/standins.js';

applyTestEnv({ DAILY_DRAFT_LIMIT: '200' });
delete process.env.PROMPT_STYLE;

const now = Date.now();
const MIN = 60e3, HOUR = 3600e3, DAY = 24 * HOUR;

let standins, config, db, items, drafter, fitter;
const ai = aiBehaviour();
const seen = ai.seen;

before(async () => {
  standins = await startStandins({ ai });
  ({ config } = await import('../src/config.js'));
  config.llm.gemini.url = `${standins.base}/chat`;
  db = await import('../src/db.js');
  items = await import('../src/items.js');
  drafter = await import('../src/drafter.js');
  fitter = await import('../src/fitter.js');
  const sync = await import('../src/sync.js');
  sync.storeVehicles([{ id: 1, stockNo: '4826', year: '2018', title: '2018 Toyota Voxy ZS', make: 'TOYOTA', model: 'Voxy', modelCode: 'ZRR80', auPublishPrice: 27490, odometer: 71300, seats: 8, status: 'PUBLISHED', soldStatus: 'UnSold', stockIn: 'Online', outline: ['6 Months NSW Registration'] }]);
});

after(async () => { await standins.close(); });

let mid = 1;
const customer = (n, first) => {
  const id = 200 + n;
  db.upsertLead({ id, conversationId: id, firstName: first, lastName: 'Test', phone: `0491 570 2${String(n).padStart(2, '0')}`, email: '', source: 'carsales', status: 'FOLLOW_UP', platform: 'CARSALES', state: 'NSW', leadAt: now - 2 * DAY, updatedAt: now - HOUR, stocks: ['4826'], inquiries: [], statusHistory: [] });
  db.upsertConversation({ id, phone: `+614915702${String(n).padStart(2, '0')}`, channel: 'SMS', status: 'OPEN', leadId: id, customerName: `${first} Test`, latestDirection: 'IN', latestAt: now - MIN, latestBody: 'x' });
  db.upsertMessage({ id: mid++, conversationId: id, direction: 'IN', body: 'Is the Voxy still available?', sentBy: null, status: 'SENT', mediaType: null, at: now - 5 * MIN, importedAt: now - 5 * MIN });
  return () => items.buildItem({ conversationId: id });
};

// The style of the requests one write sent: the full style's rules carry the whole SELLING
// playbook, the compact style's do not.
const sentIn = () => [...new Set(seen.map((b) => (String(b.messages?.[0]?.content || '').includes('=== SELLING ===') ? 'full' : 'compact')))];
const write = async (item, opts = {}) => {
  seen.length = 0;
  const d = await drafter.draftFor(item, { save: false, now, ...opts });
  return { d, sent: sentIn() };
};
// PROMPT_STYLE=compact for the length of one test, as config.js reads it.
const asCompact = async (fn) => {
  const was = config.llm.promptStyle;
  config.llm.promptStyle = 'compact';
  try { return await fn(); } finally { config.llm.promptStyle = was; }
};

test('with PROMPT_STYLE=compact, a plain reply to a text on the dashboard is written in the compact style', async () => {
  const item = customer(1, 'Henrietta');
  await asCompact(async () => {
    const { d, sent } = await write(item());
    assert.deepEqual(sent, ['compact']);
    assert.equal(d.context.style, 'compact');
  });
});

test('with PROMPT_STYLE=compact, a Prompt, Could be better, a template and a follow-up keep the full style', async () => {
  const item = customer(2, 'Bartholomew');
  await asCompact(async () => {
    const prompted = await write(item(), { instruction: 'Keep it short' });
    assert.deepEqual(prompted.sent, ['full'], 'a Prompt or Rewrite');
    assert.equal(prompted.d.context.style, 'full');

    const coached = await write(item(), { coaching: { note: 'Shorter, please.', draft: 'Hello, yes the Voxy is still here.' } });
    assert.deepEqual(coached.sent, ['full'], 'Could be better');

    const tpl = { id: 'x', label: 'X', masked: fitter.maskTemplate({ part: 'Hello {{NAME}},\n\nThe Voxy is still available.', values: {} }), wordChecks: [], factsUsed: [] };
    const fitted = await write(item(), { template: tpl });
    assert.deepEqual(fitted.sent, ['full'], 'a template');

    const followUp = item();
    followUp.followUp = { id: 1, kind: 'after_visit', reason: 'they came in to see the Voxy', data: {} };
    followUp.anchorKey = 'fu:1';
    followUp.isFirstReply = false;
    const fu = await write(followUp);
    assert.deepEqual(fu.sent, ['full'], 'a follow-up');
    assert.equal(fu.d.context.style, 'full');

    // A style given for the write is used as given: the replay asks for compact on every case.
    const given = await write(item(), { instruction: 'Keep it short', style: 'compact' });
    assert.deepEqual(given.sent, ['compact']);
    assert.equal(given.d.context.style, 'compact');
  });
});

test('with PROMPT_STYLE=compact, a Marketplace chat, an auction order, an import customer and an email keep the full style', async () => {
  const item = customer(3, 'Seraphina');
  await asCompact(async () => {
    assert.equal(drafter.styleFor(item()), 'compact', 'the plain text it is measured on');
    // The shapes src/items.js gives each kind of item.
    const chat = { ...item(), itemKey: 'mp:9', channel: 'marketplace', section: 'marketplace', marketplace: { id: 9, listingPrice: '', engine: { notes: [] } } };
    assert.equal(drafter.styleFor(chat), 'full', 'Marketplace');
    const sent = await write(chat);
    assert.deepEqual(sent.sent, ['full'], 'Marketplace, as sent');
    assert.equal(drafter.styleFor({ ...item(), itemKey: 'ao:9', channel: 'auction', section: 'auction', order: { id: 9 } }), 'full', 'an auction order');
    assert.equal(drafter.styleFor({ ...item(), imports: { order: null } }), 'full', 'an import customer');
    assert.equal(drafter.styleFor({ ...item(), section: 'auction' }), 'full', 'a text listed in Auction');
    assert.equal(drafter.styleFor({ ...item(), itemKey: 'em:9', channel: 'email', section: 'importquery', mail: { id: 9 } }), 'full', 'an Import Query email');
    assert.equal(drafter.styleFor(item(), { instruction: 'Keep it short' }), 'full', 'a Prompt');
    assert.equal(drafter.styleFor(item(), { instruction: 'Keep it short', style: 'compact' }), 'compact', 'a style given');
  });
});

test('with PROMPT_STYLE=full (or unset) every write is full, as before', async () => {
  assert.equal(config.llm.promptStyle, 'full');
  const item = customer(4, 'Augustin');
  const { d, sent } = await write(item());
  assert.deepEqual(sent, ['full']);
  assert.equal(d.context.style, 'full');
  assert.equal(drafter.styleFor(item()), 'full');
});

test('a saved draft keeps the style it was written in: full by default, compact when compact was used', async () => {
  const item = customer(5, 'Philomena');
  const plain = await drafter.draftFor(item(), { now });
  assert.equal(db.getDraft(plain.id).context.style, 'full');
  const compact = await drafter.draftFor(item(), { now, style: 'compact' });
  assert.equal(db.getDraft(compact.id).context.style, 'compact');
});
