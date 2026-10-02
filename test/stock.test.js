// Matching a lead to its car. Portals write our stock numbers in their own ways; every form must
// lead to the same car. All data is invented.
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_PATH = ':memory:';
process.env.MARKETPLACE_ENABLED = '0';
process.env.VOICE_PEOPLE_FILE = 'voice/people.example.json';

const db = await import('../src/db.js');
const sync = await import('../src/sync.js');
const items = await import('../src/items.js');
const text = await import('../src/text.js');
const normalize = await import('../src/normalize.js');
const promptModule = await import('../src/prompt.js');

const now = Date.now();
const MIN = 60e3, HOUR = 3600e3;
const car = (id, stockNo, year, title, extra = {}) => ({ id, stockNo, year: String(year), title, make: title.split(' ')[1].toUpperCase(), model: title.split(' ')[2], modelCode: 'ABC10', auPublishPrice: 21900, odometer: 60000, status: 'PUBLISHED', soldStatus: 'UnSold', stockIn: 'Online', ...extra });
sync.storeVehicles([
  car(1, '1300', 2021, '2021 Toyota Noah X'),
  car(2, '771', 2017, '2017 Toyota Crown Royal', { soldStatus: 'SOLD', stockIn: 'Sold', status: 'UNPUBLISHED' }),
  car(3, 'T02', 2014, '2014 Nissan Leaf Electric', { soldStatus: 'Sold', stockIn: 'Sold', status: 'UNPUBLISHED', bodyType: 'Hatchback', fuel: 'Electric' }),
  car(4, 't07', 2021, '2021 Toyota Hilux Workmate'),
  car(5, '1310', 2015, '2015 Nissan Leaf X', { bodyType: 'Hatchback', fuel: 'Electric' }),
]);
const find = (ref) => text.resolveStock(ref, db.getVehicleByStock)?.stockNo ?? null;

test('portal stock references are read as the stock number they stand for', () => {
  const stocks = (s) => text.stockCandidates(s).map((c) => (c.year ? `${c.stock}@${c.year}` : c.stock));
  assert.deepEqual(stocks('1300'), ['1300']);
  assert.deepEqual(stocks('20211300'), ['20211300', '1300@2021']);
  assert.deepEqual(stocks('2014T02'), ['2014T02', 'T02@2014']);
  assert.deepEqual(stocks('2015t04'), ['2015t04', 'T04@2015']);
  assert.ok(stocks('CSCBT02').includes('T02'));
  assert.ok(stocks('ATCB606').includes('606'));
  assert.deepEqual(stocks('null'), [], 'the word "null" is not a stock number');
  assert.deepEqual(stocks(''), []);
});

test('every way a portal writes a stock number finds the same car', () => {
  assert.equal(find('1300'), '1300');
  assert.equal(find('20211300'), '1300');
  assert.equal(find('DDR1300'), '1300');
  // Stock numbers that start with a letter, with a year or a portal code in front.
  assert.equal(find('T02'), 'T02');
  assert.equal(find('2014T02'), 'T02');
  assert.equal(find('CSCBT02'), 'T02');
  // Upper and lower case are the same stock number, whichever way the dashboard stored it.
  assert.equal(find('t02'), 'T02');
  assert.equal(find('T07'), 't07');
  assert.equal(find('2021T07'), 't07');
  // A portal's year can be one more or less than ours (build year against first registration).
  assert.equal(find('2018771'), '771');
  assert.equal(find('2016771'), '771');
  // Further apart, it is a different car that happens to share the digits.
  assert.equal(find('2020771'), null);
  assert.equal(find('20051300'), null);
  assert.equal(find('null'), null);
  assert.equal(find('NKE165-7211659'), null, 'a chassis number is not a stock number');
});

test('a stock list entry of "null" is dropped when a lead is stored', () => {
  assert.deepEqual(normalize.normalizeLead({ id: 1, stocks: [null, 'null', ' 1300 '], inquiries: [] }).stocks, ['1300']);
});

test('a lead whose stock number has a letter and a year gets its car, and a sold car brings a similar one', () => {
  db.upsertLead({ id: 1, conversationId: 501, firstName: 'Ivy', lastName: 'Test', phone: '0400 555 001', email: '', source: 'carsales', status: 'NEW', platform: 'CARSALES', state: 'NSW', leadAt: now - 2 * HOUR, updatedAt: now - HOUR, stocks: ['2014T02'], inquiries: [], statusHistory: [] });
  db.upsertConversation({ id: 501, phone: '+61400555001', channel: 'SMS', status: 'OPEN', leadId: 1, customerName: 'Ivy Test', latestDirection: 'IN', latestAt: now - MIN, latestBody: 'x' });
  db.upsertMessage({ id: 1, conversationId: 501, direction: 'IN', body: 'Hi, is the Leaf still available?', sentBy: null, status: 'SENT', mediaType: null, at: now - 5 * MIN, importedAt: now - 5 * MIN });

  const it = items.buildItem({ conversationId: 501 });
  assert.equal(it.vehicles[0].stockNo, 'T02');
  const asked = promptModule.buildPrompt(it, { now }).user;
  assert.match(asked, /Vehicle: 2014 Nissan Leaf Electric/);
  assert.match(asked, /Availability: Sold/);
  assert.match(asked, /=== SIMILAR VEHICLES AVAILABLE NOW ===\n- 2015 Nissan Leaf X/);
  assert.ok(!/No vehicle could be matched/.test(asked));
});
