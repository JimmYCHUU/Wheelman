// The conversation list: every conversation ever stored, newest first, so an old thread with a new
// message comes to the top; and a name on every row the records or the customer's own words can
// give one. All names and numbers are invented.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { applyTestEnv } from './support/env.js';

applyTestEnv();

const MIN = 60e3;
const HOUR = 3600e3;
const DAY = 24 * HOUR;
let app, base, config, db, items, signature, people;

before(async () => {
  ({ config } = await import('../src/config.js'));
  config.port = 0;
  db = await import('../src/db.js');
  items = await import('../src/items.js');
  signature = await import('../src/signature.js');
  people = await import('../src/people.js');
  app = await (await import('../src/server.js')).startServer();
  base = `http://127.0.0.1:${app.address().port}`;
});

after(async () => { await new Promise((r) => { app.close(r); app.closeAllConnections?.(); }); });

const get = async (p) => (await fetch(base + p)).json();

// Dashboard records, as the sync stores them.
let mid = 1;
const now = Date.now();
const lead = (id, convId, first, last, phoneNo, at = now - HOUR) => db.upsertLead({ id, conversationId: convId, firstName: first, lastName: last, phone: phoneNo, email: '', source: 'carsales', status: 'NEW', platform: 'CARSALES', state: 'NSW', leadAt: at, updatedAt: at, stocks: [], inquiries: [] });
const conv = (id, leadId, phoneNo, name, latestAt) => db.upsertConversation({ id, phone: phoneNo, channel: 'SMS', status: 'OPEN', leadId, customerName: name, latestDirection: 'IN', latestAt, latestBody: 'x' });
const msg = (conversationId, direction, body, at) => db.upsertMessage({ id: mid++, conversationId, direction, body, sentBy: direction === 'OUT' ? 'Alex STONE' : null, status: 'SENT', mediaType: null, at, importedAt: at });
const keysOf = (list) => list.items.map((r) => r.key);

test('every conversation is listed, newest first, and an old thread with a new message comes to the top', async () => {
  lead(1, 11, 'Priya', 'Raman', '0491570101', now - 30 * DAY);
  conv(11, 1, '+61491570101', 'Priya Raman', now - 30 * DAY);
  msg(11, 'IN', 'Hi, is the Noah still available?', now - 30 * DAY);
  lead(2, 12, 'Tom', 'Bell', '0491570102');
  conv(12, 2, '+61491570102', 'Tom Bell', now - 2 * HOUR);
  msg(12, 'IN', 'What is your best price?', now - 2 * HOUR);

  const all = await get('/api/items?section=dashboard&tab=waiting');
  assert.deepEqual(keysOf(all), ['c:12', 'c:11'], 'a month-old conversation is listed, after the newer one');
  assert.equal(all.hours, null, 'no time window');
  const window = await get('/api/items?section=dashboard&tab=waiting&hours=72');
  assert.deepEqual([keysOf(window), window.hours], [['c:12'], 72], 'a window is still there for whoever asks for one');

  const old = all.items.find((r) => r.key === 'c:11');
  assert.deepEqual([old.unread, all.unread.dashboard], [0, 1], 'a month-old unanswered text is listed, not flagged as new');

  // The old thread gets a new message.
  msg(11, 'IN', 'Any update?', now - 10 * MIN);
  conv(11, 1, '+61491570101', 'Priya Raman', now - 10 * MIN);
  const again = await get('/api/items?section=dashboard&tab=waiting');
  assert.deepEqual(keysOf(again), ['c:11', 'c:12'], 'it comes to the top');
  assert.ok(again.items[0].unread >= 1, 'and is new again');
});

test('a number without a record of its own takes the name the dashboard knows for it from an earlier enquiry', async () => {
  lead(3, 13, 'Maria', 'Lopes', '0491570103', now - 60 * DAY);
  conv(13, 3, '+61491570103', 'Maria Lopes', now - 60 * DAY + HOUR);
  msg(13, 'IN', 'Is the Hiace still for sale?', now - 60 * DAY);
  msg(13, 'OUT', 'Hi Maria, yes it is.', now - 60 * DAY + HOUR);
  // The same number writes again months later; the dashboard opened a fresh conversation with no name.
  conv(14, null, '+61491570103', '', now - HOUR);
  msg(14, 'IN', 'Hi, do you still have the Hiace?', now - HOUR);

  const item = items.itemFromKey('c:14');
  assert.deepEqual([item.lead.first_name, item.lead.last_name, item.lead.nameOnly, item.hasName, item.hasLeadRecord], ['Maria', 'Lopes', true, true, false]);
  const row = (await get('/api/items?section=dashboard&tab=waiting')).items.find((r) => r.key === 'c:14');
  assert.equal(row.name, 'Maria Lopes');
});

test('a customer who signs a text is shown by that name, with the number beneath; the AI is not told the name', async () => {
  conv(15, null, '+61491570104', '', now - HOUR);
  msg(15, 'IN', 'Hi, is the Alphard still available? Thanks, Liam', now - HOUR);

  const row = (await get('/api/items?section=dashboard&tab=waiting')).items.find((r) => r.key === 'c:15');
  assert.deepEqual([row.name, row.phone], ['Liam', '+61491570104']);
  const item = items.itemFromKey('c:15');
  assert.deepEqual([!item.lead, item.hasName], [true, false], 'no record and no name for the prompt: the greeting stays "Hi,"');
  const shown = (await get('/api/items/c:15')).item;
  assert.deepEqual([shown.name, shown.firstName, shown.phone], ['Liam', '', '+61491570104']);
});

test('two different signed names, or a staff name, give no name; the row shows the number', async () => {
  conv(16, null, '+61491570105', '', now - HOUR);
  msg(16, 'IN', 'It is Mark here, is the Noah available?', now - 2 * HOUR);
  msg(16, 'IN', 'Thanks, Sarah', now - HOUR);
  const staff = people.loadPeople().words[0];
  const Staff = staff[0].toUpperCase() + staff.slice(1);
  conv(17, null, '+61491570106', '', now - HOUR);
  msg(17, 'IN', `Is the Hiace still there? Thanks ${Staff}`, now - HOUR);

  const list = await get('/api/items?section=dashboard&tab=waiting');
  assert.equal(list.items.find((r) => r.key === 'c:16').name, '', 'two people on one number: no guess');
  assert.equal(list.items.find((r) => r.key === 'c:17').name, '', 'thanking one of us by name is not signing');
});

test('the signature reader: what counts as a signed name and what does not', () => {
  const { signedNameIn, signedName } = signature;
  assert.equal(signedNameIn('Hi, is the Alphard still available? Thanks, Liam'), 'Liam');
  assert.equal(signedNameIn('Kind regards, Jo Smith.'), 'Jo Smith');
  assert.equal(signedNameIn('Cheers Mark'), 'Mark');
  assert.equal(signedNameIn("Hi, it's Mark here, is the Noah available?"), 'Mark');
  assert.equal(signedNameIn('Hello, my name is Priya Raman, is the Noah available?'), 'Priya Raman');
  assert.equal(signedNameIn('Dave here. Is the Hiace still for sale?'), 'Dave');
  assert.equal(signedNameIn("I'm interested in the Noah"), '');
  assert.equal(signedNameIn("I'm Keen to see it"), '');
  assert.equal(signedNameIn('Thanks mate'), '');
  assert.equal(signedNameIn('Thanks heaps'), '');
  assert.equal(signedNameIn('Thanks Monday'), '');
  assert.equal(signedNameIn('Thanks again'), '');
  assert.equal(signedNameIn('Come here on Saturday'), '');
  assert.equal(signedNameIn('thanks, liam'), '', 'a lower-case word is not taken for a name');
  assert.equal(signedNameIn(''), '');
  const thread = (texts) => texts.map((text, i) => ({ who: 'customer', text, at: i }));
  assert.equal(signedName(thread(['Hi, is it available? Thanks, Liam', 'Great, thanks Liam Carter'])), 'Liam Carter', 'the fullest form of the one name');
  assert.equal(signedName(thread(['Thanks, Liam', 'Thanks, Sarah'])), '', 'two names: none');
  assert.equal(signedName([{ who: 'us', text: 'Hi, Alex here from the yard' }]), '', 'our own texts never name the customer');
  assert.equal(signedName([]), '');
});

test('"All" holds every conversation, newest message first whoever wrote it; a reply keeps it in place and takes it out of Waiting', async () => {
  lead(61, 61, 'Zoe', 'Campbell', '0491570161');
  conv(61, 61, '+61491570161', 'Zoe Campbell', now - 3 * HOUR);
  msg(61, 'IN', 'Hi, is the Serena still available?', now - 3 * HOUR);
  lead(62, 62, 'Yusuf', 'Demir', '0491570162');
  conv(62, 62, '+61491570162', 'Yusuf Demir', now - 2 * HOUR);
  msg(62, 'IN', 'Can I see the Alphard on Saturday?', now - 2 * HOUR);

  let all = await get('/api/items?section=dashboard&tab=all&limit=1000');
  let keys = all.items.map((r) => r.key);
  assert.ok(keys.indexOf('c:62') < keys.indexOf('c:61'), 'newest message first');
  assert.equal(all.counts.all, all.total);
  assert.ok((await get('/api/items?section=dashboard&tab=waiting&limit=1000')).items.some((r) => r.key === 'c:61'));

  // We reply to the older one.
  msg(61, 'OUT', 'Hi Zoe, yes it is. Would you like to come and see it?', now - 10 * MIN);
  db.upsertConversation({ id: 61, phone: '+61491570161', channel: 'SMS', status: 'OPEN', leadId: 61, customerName: 'Zoe Campbell', latestDirection: 'OUT', latestAt: now - 10 * MIN, latestBody: 'x' });
  all = await get('/api/items?section=dashboard&tab=all&limit=1000');
  keys = all.items.map((r) => r.key);
  assert.ok(keys.includes('c:61') && keys.indexOf('c:61') < keys.indexOf('c:62'), 'the replied-to conversation is still listed, and first');
  const row = all.items.find((r) => r.key === 'c:61');
  assert.deepEqual([row.state, row.preview.who, row.unread], ['answered', 'us', 0]);
  const waiting = await get('/api/items?section=dashboard&tab=waiting&limit=1000');
  assert.ok(!waiting.items.some((r) => r.key === 'c:61'), 'and no longer waiting');
  assert.ok(waiting.items.some((r) => r.key === 'c:62'));
});

test('the list comes twenty at a time, "Load older conversations" brings twenty more, and a search looks through every row', async () => {
  const LASTS = ['Field', 'Stone', 'River', 'Hill', 'Wood', 'Lake', 'Marsh', 'Glen', 'Vale', 'Brook'];
  for (let i = 21; i <= 50; i++) {
    lead(i, i, 'Harper', LASTS[i % 10], `04915701${String(i).padStart(2, '0')}`);
    conv(i, i, `+614915701${String(i).padStart(2, '0')}`, `Harper ${LASTS[i % 10]}`, now - i * HOUR);
    msg(i, 'IN', i === 37 ? 'Do you have a Delica with a fridge?' : `Is the car ${i} still available?`, now - i * HOUR);
  }
  const first = await get('/api/items?section=dashboard&tab=waiting');
  assert.equal(first.items.length, 20, 'twenty rows to start with');
  assert.ok(first.total > 20, 'and the total says there are more');
  const more = await get('/api/items?section=dashboard&tab=waiting&limit=40');
  assert.equal(more.items.length, Math.min(40, more.total));
  assert.deepEqual(more.items.slice(0, 20).map((r) => r.key), first.items.map((r) => r.key), 'the first twenty stay the same, newest first');
  const everything = await get('/api/items?section=dashboard&tab=waiting&limit=1000');
  assert.equal(everything.items.length, everything.total);

  const byWord = await get('/api/items?section=dashboard&tab=waiting&q=fridge');
  assert.deepEqual([byWord.total, byWord.items.map((r) => r.key)], [1, ['c:37']], 'a word from a message, wherever the row is');
  const byDigits = await get('/api/items?section=dashboard&tab=waiting&q=' + encodeURIComponent('5701 45'));
  assert.deepEqual(byDigits.items.map((r) => r.key), ['c:45'], 'digits of the number in any spacing');
  const byName = await get('/api/items?section=dashboard&tab=waiting&q=harper');
  assert.deepEqual([byName.total, byName.items.length], [30, 20], 'many matches still come twenty at a time');
  const none = await get('/api/items?section=dashboard&tab=waiting&q=zzzz');
  assert.deepEqual([none.total, none.items], [0, []]);
});
