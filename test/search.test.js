// The new page's one search, and the deal stage on a conversation. All data is invented.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { applyTestEnv } from './support/env.js';
import { startStandins, aiBehaviour } from './support/standins.js';

applyTestEnv({ DAILY_DRAFT_LIMIT: '200' });

const now = Date.now();
const MIN = 60e3, HOUR = 3600e3;
let standins, app, base, db, normalize;
const ai = aiBehaviour({ behave: () => ({ reply: 'Certainly.', needs_human: [], facts_used: [], hold: false }) });

before(async () => {
  standins = await startStandins({ ai });
  const { config } = await import('../src/config.js');
  config.llm.gemini.url = `${standins.base}/chat`;
  config.port = 0;
  db = await import('../src/db.js');
  normalize = await import('../src/normalize.js');
  app = await (await import('../src/server.js')).startServer();
  base = `http://127.0.0.1:${app.address().port}`;
});

after(async () => { await new Promise((r) => { app.close(r); app.closeAllConnections?.(); }); await standins.close(); });

const get = async (p) => { const r = await fetch(base + p); return { status: r.status, body: await r.json() }; };
const search = async (q) => { const r = await get(`/api/search?q=${encodeURIComponent(q)}`); assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body; };

let mid = 1;
function customer(id, first, phone, texts, { stocks = [], status = 'FOLLOW_UP' } = {}) {
  db.upsertLead({ id, conversationId: id + 300, firstName: first, lastName: 'Searchable', phone, email: '', source: 'carsales', status, platform: 'CARSALES', state: 'NSW', leadAt: now - 3 * HOUR, updatedAt: now - 5 * MIN, stocks, inquiries: [], statusHistory: [] });
  db.upsertConversation({ id: id + 300, phone: `+61${phone.replace(/\D/g, '').slice(1)}`, channel: 'SMS', status: 'OPEN', leadId: id, customerName: `${first} Searchable`, latestDirection: 'IN', latestAt: now - 5 * MIN, latestBody: 'x' });
  texts.forEach(([direction, body, agoMs]) => db.upsertMessage({ id: mid++, conversationId: id + 300, direction, body, sentBy: direction === 'OUT' ? 'Dana' : null, status: 'SENT', mediaType: null, at: now - agoMs, importedAt: now - agoMs }));
  return `c:${id + 300}`;
}

test('search finds a customer by name and by 3 phone digits across sections', async () => {
  const dash = customer(1, 'Zelda', '0491 570 123', [['IN', 'Hello there', 2 * HOUR]]);
  db.upsertMpConversation({ id: 77, account: 'Carbarn', buyerName: 'Zelda Marketplace', stockId: '', lastDirection: 'in', lastMessageAt: now - HOUR, archived: false });
  db.replaceMpMessages(77, [{ id: 7701, seq: 0, direction: 'in', source: 'buyer', text: 'Is it still there?', status: '', hasMedia: false, at: now - HOUR }], 'sig');
  const byName = await search('zelda');
  assert.ok(byName.customers.some((r) => r.key === dash && r.section === 'dashboard'));
  const byDigits = await search('570 123');
  assert.ok(byDigits.customers.some((r) => r.key === dash));
  assert.deepEqual(Object.keys(byName).sort(), ['cars', 'customers', 'messages']);
  assert.ok(byName.customers.length <= 20);
});

test('search finds a car by stock number', async () => {
  db.upsertVehicle({ id: 501, stockNo: '9501', title: '2019 Toyota Voxy', year: '2019', make: 'TOYOTA', model: 'Voxy', modelCode: 'ZRR80', status: 'PUBLISHED', soldStatus: 'UnSold', stockIn: 'Online', price: 30000, odometer: 50000 });
  const r = await search('9501');
  assert.equal(r.cars[0].stockNo, '9501');
});

test('search finds words in messages, newest first, with a snippet', async () => {
  customer(2, 'Odette', '0491 570 124', [['IN', 'Do you have a zebra-striped wagon?', 5 * HOUR]]);
  customer(3, 'Piers', '0491 570 125', [['OUT', 'We can look for a ZEBRA-striped one', HOUR], ['IN', 'x'.repeat(300) + ' zebra-striped ' + 'y'.repeat(300), 3 * HOUR]]);
  const { messages } = await search('zebra-striped');
  assert.equal(messages.length, 3);
  assert.deepEqual(messages.map((m) => m.at), [...messages.map((m) => m.at)].sort((a, b) => b - a));
  assert.deepEqual(messages.map((m) => m.who), ['us', 'customer', 'customer']);
  assert.ok(messages.every((m) => m.text.length <= 140 && /zebra-striped/i.test(m.text)));
  const long = messages.find((m) => m.text.startsWith('…'));
  assert.ok(long && long.text.endsWith('…'));
  assert.deepEqual(Object.keys(messages[0]).sort(), ['at', 'key', 'name', 'section', 'text', 'who']);
  assert.match(messages[0].key, /^c:\d+$/);
});

test('search treats % _ and quotes as plain text', async () => {
  customer(4, 'Quill', '0491 570 126', [['IN', "Is 100% of it paid? Mr O'Brien asked", HOUR], ['IN', 'the a_b code', 2 * HOUR], ['IN', 'the axb code', 3 * HOUR], ['IN', 'a 1000 value', 4 * HOUR]]);
  assert.deepEqual((await search('100%')).messages.map((m) => m.text.includes('100%')), [true]);
  assert.equal((await search("O'Brien")).messages.length, 1);
  const ab = await search('a_b');
  assert.equal(ab.messages.length, 1);
  assert.match(ab.messages[0].text, /a_b/);
  assert.equal((await search('%%')).messages.length, 0);
  assert.equal((await get('/api/search?q=' + encodeURIComponent("'; DROP TABLE messages; --"))).status, 200);
  assert.equal((await search('\\\\')).messages.length, 0);
});

test("customer search finds an auction order under Finished", async () => {
  const order = normalize.normalizeOrder({
    id: 9601, orderNo: 'AS-9601', stage: 'CANCELLED', source: 'LIVE_AUCTION', lotPhase: 'SOURCING', depositState: 'NONE',
    cancelledAt: new Date(now - 2 * 24 * HOUR).toISOString(), createdAt: new Date(now - 20 * 24 * HOUR).toISOString(),
    invoiceTo: { firstName: 'Wilhelmina', lastName: 'Finished', mobileNumber: '0491 570 132', email: 'wilhelmina@example.com' },
    reqMake: 'Toyota', reqModel: 'Alphard', reqModelCode: 'AGH30', items: [], payments: [],
  });
  db.upsertOrder(order, { now });
  const { customers } = await search('wilhelmina');
  const hit = customers.find((r) => r.key === 'ao:9601');
  assert.ok(hit, JSON.stringify(customers));
  assert.deepEqual([hit.section, hit.state], ['auction', 'closed']);
});

test('a query under 2 characters returns nothing', async () => {
  for (const q of ['', ' a ', 'z']) assert.deepEqual(await search(q), { customers: [], cars: [], messages: [] });
  assert.deepEqual((await get('/api/search')).body, { customers: [], cars: [], messages: [] });
});

test('the item carries its deal stage', async () => {
  db.upsertVehicle({ id: 502, stockNo: '9502', title: '2020 Toyota Noah', year: '2020', make: 'TOYOTA', model: 'Noah', modelCode: 'ZRR80W', status: 'PUBLISHED', soldStatus: 'UnSold', stockIn: 'Online', price: 27900, odometer: 70000 });
  const key = customer(5, 'Rhea', '0491 570 127', [['IN', 'I would like to buy it', 4 * HOUR], ['OUT', 'Great, thanks for the deposit', 3 * HOUR]], { stocks: ['9502'] });
  db.upsertSale({ vehicleId: 502, saleId: 9502, stockNo: '9502', stage: 'PENDING_PAYMENT', soldAt: now - HOUR, paid: 'part', phones: normalize.phoneKeys('0491570127'), email: '' });
  const { item } = (await get(`/api/items/${key}`)).body;
  assert.equal(item.deal.stage, 'deposit_paid');
  assert.deepEqual(Object.keys(item.deal).sort(), ['source', 'stage', 'stageText']);
  const plain = (await get(`/api/items/${customer(6, 'Sol', '0491 570 128', [['IN', 'Hi', HOUR]])}`)).body.item;
  assert.equal(plain.deal, null);
});

test('every existing route answers as before', async () => {
  const list = (await get('/api/items?tab=all')).body;
  assert.ok(Array.isArray(list.items) && list.items.length > 0);
  assert.ok('counts' in list && 'sections' in list && 'unread' in list);
  const { item } = (await get(`/api/items/${list.items[0].key}`)).body;
  for (const f of ['key', 'name', 'thread', 'draft', 'vehicle', 'templates', 'channel', 'marketplace', 'leadStatus', 'writing']) assert.ok(f in item, f);
  assert.ok('deal' in item);
  assert.equal((await get('/api/vehicles?q=9501')).body.cars[0].stockNo, '9501');
  const r = await fetch(base + '/api/search?q=zelda', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.notEqual(r.status, 200);
});

test('search over 50,000 invented messages answers in under 300 ms', async () => {
  // Fifty conversations of a thousand messages. The lists are built once after a write (the page's
  // own list does it); that is not the search, so it is done before the clock starts.
  db.transaction(() => {
    for (let c = 0; c < 50; c++) {
      db.upsertConversation({ id: 900 + c, phone: `+614915702${String(c).padStart(2, '0')}`, channel: 'SMS', status: 'OPEN', leadId: null, customerName: `Bulk ${c} Invented`, latestDirection: 'IN', latestAt: now, latestBody: 'x' });
      for (let i = 0; i < 1000; i++) {
        const n = c * 1000 + i;
        db.upsertMessage({ id: 100000 + n, conversationId: 900 + c, direction: i % 2 ? 'IN' : 'OUT', body: `Message number ${n} about a wagon, the weather and the price${n === 49000 ? ' with a quokka' : ''}`, sentBy: null, status: 'SENT', mediaType: null, at: now - n * MIN, importedAt: now });
      }
    }
  });
  await get('/api/items?tab=all');
  const t0 = performance.now();
  const r = await search('quokka');
  const ms = performance.now() - t0;
  assert.equal(r.messages.length, 1);
  const t1 = performance.now();
  const many = await search('wagon');
  const ms2 = performance.now() - t1;
  assert.equal(many.messages.length, 20);
  assert.ok(ms < 300 && ms2 < 300, `${ms.toFixed(0)} and ${ms2.toFixed(0)} ms`);
});
