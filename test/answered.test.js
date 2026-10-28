// Who answered a conversation elsewhere: the phone, a colleague on the dashboard, an auto-reply,
// or Wheelman's own suggestion. Invented data only; phones in 0491 570 1xx.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { applyTestEnv } from './support/env.js';
import { startStandins } from './support/standins.js';

applyTestEnv();

const MIN = 60e3, HOUR = 3600e3;
const now = Date.now();
let standins, app, base, db, phone, parse, answeredBy;

before(async () => {
  standins = await startStandins({});
  const { config } = await import('../src/config.js');
  config.port = 0;
  db = await import('../src/db.js');
  phone = await import('../src/phone.js');
  parse = await import('../extension/parse.js');
  ({ answeredBy } = await import('../src/answered.js'));
  app = await (await import('../src/server.js')).startServer();
  base = `http://127.0.0.1:${app.address().port}`;
});

after(async () => { await new Promise((r) => { app.close(r); app.closeAllConnections?.(); }); await standins.close(); });

let mid = 1;
/** A dashboard customer who asked a question; returns the item key. */
function customer(id, first, phoneNo, question) {
  db.upsertLead({ id, conversationId: id + 600, firstName: first, lastName: 'Test', phone: phoneNo, email: '', source: 'carsales', status: 'FOLLOW_UP', platform: 'CARSALES', state: 'NSW', leadAt: now - 3 * HOUR, updatedAt: now - 50 * MIN, stocks: [], inquiries: [], statusHistory: [] });
  db.upsertConversation({ id: id + 600, phone: `+61${phoneNo.replace(/\D/g, '').slice(1)}`, channel: 'SMS', status: 'OPEN', leadId: id, customerName: `${first} Test`, latestDirection: 'IN', latestAt: now - 50 * MIN, latestBody: 'x' });
  say(id + 600, 'IN', question, 50 * MIN);
  return `c:${id + 600}`;
}
const say = (conv, direction, body, agoMs, sentBy = null) => db.upsertMessage({ id: mid++, conversationId: conv, direction, body, sentBy, status: 'SENT', mediaType: null, at: now - agoMs, importedAt: now - agoMs });
const get = async (path) => (await fetch(base + path)).json();
const rowOf = async (key) => (await get('/api/items?tab=all&limit=1000')).items.find((r) => r.key === key);
const itemOf = async (key) => (await get(`/api/items/${key}`)).item;

test('a reply sent from the phone is answered on the phone', async () => {
  const key = customer(1, 'Ava', '0491 570 101', 'What is your best price on the Hiace?');
  const t = parse.parseListItem({ ref: 'r-ava', name: '+61 491 570 101', snippet: 'You: Hi Ava, the best we can do is $32,500 drive away.', when: 'now', whenTitle: '', unread: false }, { now: now - 5 * MIN });
  phone.storePhoneReport(phone.validateReport({ v: 1, seenAt: now - 5 * MIN, hidden: true, path: '/web/conversations', signedOut: false, found: { listItems: 1, parsed: 1 }, threads: [t] }, { now: now - 5 * MIN }), { now: now - 5 * MIN });
  const row = await rowOf(key);
  assert.equal(row.state, 'answered');
  assert.deepEqual([row.answered.how, row.answered.by], ['phone', '']);
  assert.ok(row.answered.at > now - 10 * MIN);
  assert.deepEqual((await itemOf(key)).answered, row.answered, 'the open conversation says the same');
});

test('a reply typed on the dashboard by a colleague names them', async () => {
  const key = customer(2, 'Ben', '0491 570 102', 'Can I see it on Saturday?');
  say(602, 'OUT', 'Yes, Saturday at 10 works. See you then.', 20 * MIN, 'Dana');
  const row = await rowOf(key);
  assert.equal(row.state, 'answered');
  assert.equal(row.answered.how, 'dashboard');
  assert.ok(row.answered.by, 'the sender is named');
  assert.equal(row.answered.at, now - 20 * MIN);
});

test('an auto-reply says so', async () => {
  db.upsertMpConversation({ id: 4101, account: 'Carbarn', buyerName: 'Cleo Market', stockId: '', lastDirection: 'out', lastMessageAt: now - 15 * MIN, archived: false });
  db.replaceMpMessages(4101, [
    { id: 410101, seq: 0, direction: 'in', source: 'buyer', text: 'Is it still available?', status: '', hasMedia: false, at: now - 30 * MIN },
    { id: 410102, seq: 1, direction: 'out', source: 'auto', text: 'Yes, it is still available.', status: 'sent', hasMedia: false, at: now - 15 * MIN },
  ], 'sig-answered');
  const item = await itemOf('mp:4101');
  assert.equal(item.state, 'answered');
  assert.deepEqual([item.answered.how, item.answered.by, item.answered.at], ['auto', '', now - 15 * MIN]);
});

test('a copied suggestion that was sent is answered with Wheelman\'s suggestion', async () => {
  const key = customer(3, 'Dev', '0491 570 103', 'Is the Shuttle still available?');
  const anchor = (await itemOf(key)).anchor;
  const id = db.insertDraft({ itemKey: key, anchorKey: anchor, reply: 'Hi Dev, yes the Shuttle is still available. Would you like to come and see it?', status: 'ready' });
  db.recordCopied(id, 'Hi Dev, yes the Shuttle is still available. Would you like to come and see it?');
  say(603, 'OUT', 'Hi Dev, yes the Shuttle is still available. Would you like to come and see it?', 10 * MIN, 'Dana');
  const row = await rowOf(key);
  assert.equal(row.state, 'answered');
  assert.deepEqual([row.answered.how, row.answered.by], ['wheelman', '']);
  // A copy that went unused: the colleague wrote something else, so it is theirs.
  const other = customer(4, 'Eli', '0491 570 104', 'Do you have any utes?');
  const id2 = db.insertDraft({ itemKey: other, anchorKey: (await itemOf(other)).anchor, reply: 'Hi Eli, we have three utes in stock right now.', status: 'ready' });
  db.recordCopied(id2, 'Hi Eli, we have three utes in stock right now.');
  say(604, 'OUT', 'Call me on the shop line about utes.', 8 * MIN, 'Dana');
  assert.equal((await rowOf(other)).answered.how, 'dashboard');
});

test('a waiting conversation has no answered field', async () => {
  const key = customer(5, 'Fay', '0491 570 105', 'Do you take trade-ins?');
  const row = await rowOf(key);
  assert.equal(row.state, 'awaiting');
  assert.equal(row.answered, null);
  assert.equal((await itemOf(key)).answered, null);
});

test('answeredBy is null unless our reply is the newest message', () => {
  const t = [{ who: 'customer', key: 'a', at: 1, text: 'Hi' }, { who: 'us', key: 'b', at: 2, text: 'Hello', by: 'Dana' }, { who: 'customer', key: 'c', at: 3, text: 'Thanks, one more' }];
  assert.equal(answeredBy(t, null), null);
  assert.equal(answeredBy([], null), null);
  assert.deepEqual(answeredBy(t.slice(0, 2), null), { how: 'dashboard', by: 'Dana', at: 2 });
});

test('a staff note is not an answer, and a real reply before it still is', () => {
  const c = { who: 'customer', key: 'a', at: 1, text: 'Hi' };
  const note = { who: 'us', internal: true, key: 'n', at: 3, text: 'SMS sent', by: 'Dana' };
  assert.equal(answeredBy([c, note], null), null);
  assert.deepEqual(answeredBy([c, { who: 'us', key: 'b', at: 2, text: 'Hello', by: 'Dana' }, note], null), { how: 'dashboard', by: 'Dana', at: 2 });
});

test('a Marketplace reply typed by a person names nobody', () => {
  const t = [{ who: 'customer', key: 'a', at: 1, text: 'Hi' }, { who: 'us', via: 'Marketplace', key: 'b', at: 2, text: 'Hello', by: 'Typed by a person' }];
  assert.deepEqual(answeredBy(t, null), { how: 'dashboard', by: '', at: 2 });
});

test('a copied suggestion sent with one word changed is still Wheelman\'s, and a recorded outcome counts', async () => {
  const key = customer(6, 'Gus', '0491 570 106', 'Is the Noah still for sale?');
  const text = 'Hi Gus, yes the Noah is still for sale. Would you like to come and see it this week?';
  const id = db.insertDraft({ itemKey: key, anchorKey: (await itemOf(key)).anchor, reply: text, status: 'ready' });
  db.recordCopied(id, text);
  say(606, 'OUT', text.replace('this week', 'on Saturday'), 6 * MIN, 'Dana');
  assert.equal((await rowOf(key)).answered.how, 'wheelman');

  const other = customer(7, 'Hal', '0491 570 107', 'Do you have a Prado?');
  const id2 = db.insertDraft({ itemKey: other, anchorKey: (await itemOf(other)).anchor, reply: 'Hi Hal, we have one Prado at the moment.', status: 'ready' });
  db.recordCopied(id2, 'Hi Hal, we have one Prado at the moment.');
  say(607, 'OUT', 'Totally different words here.', 5 * MIN, 'Dana');
  assert.equal((await rowOf(other)).answered.how, 'dashboard');
  db.recordOutcome(id2, { sentText: 'Totally different words here.', sentBy: 'Dana', sentAt: now - 5 * MIN, similarity: 0.9 });
  assert.equal((await rowOf(other)).answered.how, 'wheelman');
});
