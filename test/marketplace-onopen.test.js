// A Facebook chat is written when it is opened, on either page, and never in the background: the
// server says which chats qualify (writeOnOpen), and both pages ask the one shared rule
// (web/lib/onopen.js) once. Against a stand-in content engine; all data is invented.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { applyTestEnv } from './support/env.js';
import { startStandins, aiBehaviour } from './support/standins.js';
import { chatRow, chatMessage } from './support/fixtures.js';
import { writesOnOpen } from '../web/lib/onopen.js';

applyTestEnv({ MARKETPLACE_ENABLED: '1', DASHBOARD_USERNAME: '', DASHBOARD_PASSWORD: '' });

const now = Date.now();
const DAYS = 24 * 60; // minutes
const chats = new Map([
  // Waiting, the buyer's message three days old.
  [601, { row: chatRow(601, 'Kai Invented', 3 * DAYS, now), messages: [chatMessage(61, 'in', 'phone', 'Is the Noah still for sale?', 3 * DAYS, now)] }],
  // Archived on Marketplace, although the buyer wrote last.
  [602, { row: chatRow(602, 'Lou Invented', 30, now, { archived: true }), messages: [chatMessage(62, 'in', 'phone', 'Is it available?', 30, now)] }],
  // Not marked as a buyer.
  [603, { row: chatRow(603, 'Mo Invented', 20, now, { kind: 'seller' }), messages: [chatMessage(63, 'in', 'phone', 'I can sell you mine instead', 20, now)] }],
  // A photo with no words.
  [604, { row: chatRow(604, 'Nell Invented', 10, now), messages: [chatMessage(64, 'in', 'phone', '', 10, now, '', { has_media: true })] }],
  // Answered by the auto-reply: nobody is waiting.
  [605, { row: chatRow(605, 'Oz Invented', 40, now, { last_direction: 'out' }), messages: [chatMessage(65, 'in', 'phone', 'Is it automatic?', 40, now), chatMessage(66, 'out', 'agent', 'Yes, it is automatic.', 39, now)] }],
]);

let standins, app, base;

before(async () => {
  standins = await startStandins({ world: { now, chats }, ai: aiBehaviour() });
  const { config } = await import('../src/config.js');
  config.marketplace.url = `${standins.engineBase}/inbox`;
  config.llm.gemini.url = `${standins.base}/chat`;
  await (await import('../src/sync.js')).syncMarketplace();
  // One dashboard customer waiting: written ahead in the background as today, never on open.
  const db = await import('../src/db.js');
  db.upsertLead({ id: 811, conversationId: 911, firstName: 'Pia', lastName: 'Invented', phone: '0491570181', email: '', source: 'carsales', status: 'NEW', platform: 'CARSALES', state: 'NSW', leadAt: now - 3600e3, updatedAt: now - 3600e3, stocks: [], inquiries: [] });
  db.upsertConversation({ id: 911, phone: '+61491570181', channel: 'SMS', status: 'OPEN', leadId: 811, customerName: 'Pia Invented', latestDirection: 'IN', latestAt: now - 600e3, latestBody: 'x' });
  db.upsertMessage({ id: 9111, conversationId: 911, direction: 'IN', body: 'Is the Hiace still available?', sentBy: null, status: 'SENT', mediaType: null, at: now - 600e3, importedAt: now - 600e3 });
  app = await (await import('../src/server.js')).startServer();
  base = `http://127.0.0.1:${app.address().port}`;
});

after(async () => {
  if (app) await new Promise((r) => { app.close(r); app.closeAllConnections?.(); });
  await standins.close();
});

const open = async (key) => (await (await fetch(`${base}/api/items/${key}`)).json()).item;

test('a waiting buyer is written on open however old the message; an archived chat, one not marked as a buyer and a photo with no words are not', async () => {
  const old = await open('mp:601');
  assert.equal(old.state, 'awaiting');
  assert.equal(old.writeOnOpen, true, 'three days old, and still written when opened');
  assert.equal(old.draft, null, 'nothing was written before it was opened');
  assert.equal(writesOnOpen(old), true);

  const archived = await open('mp:602');
  assert.equal(archived.writeOnOpen, false);
  assert.match(archived.note, /archived on Marketplace/);
  const seller = await open('mp:603');
  assert.equal(seller.state, 'awaiting');
  assert.equal(seller.writeOnOpen, false);
  assert.match(seller.autoReason, /not marked as a buyer/);
  const photo = await open('mp:604');
  assert.equal(photo.state, 'awaiting');
  assert.equal(photo.writeOnOpen, false);
  assert.match(photo.autoReason, /photo or attachment with no words/);
  assert.equal((await open('mp:605')).writeOnOpen, false, 'answered: nobody is waiting');
  // Only Facebook chats: a dashboard customer is written ahead in the background, as before.
  const dash = await open('c:911');
  assert.equal(dash.state, 'awaiting');
  assert.equal(dash.writeOnOpen, false);
  for (const item of [archived, seller, photo, dash]) assert.equal(writesOnOpen(item), false, item.key);
});

test('writesOnOpen asks once: never over a draft, a write on its way, a dismissed chat or one that is not waiting', () => {
  const waiting = { key: 'mp:1', writeOnOpen: true, state: 'awaiting', dismissed: false, draft: null, writing: false };
  assert.equal(writesOnOpen(waiting), true);
  assert.equal(writesOnOpen({ ...waiting, draft: { id: 1, status: 'ready' } }), false, 'written already');
  assert.equal(writesOnOpen({ ...waiting, draft: { id: 2, status: 'failed', error: 'Busy.' } }), false, 'a failed suggestion waits for Try again');
  assert.equal(writesOnOpen({ ...waiting, writing: true }), false, 'a write is on its way');
  assert.equal(writesOnOpen({ ...waiting, dismissed: true }), false);
  assert.equal(writesOnOpen({ ...waiting, state: 'answered' }), false);
  assert.equal(writesOnOpen({ ...waiting, writeOnOpen: false }), false);
  assert.equal(writesOnOpen({ ...waiting, writeOnOpen: 'yes' }), false, 'only the server saying so');
  const { writeOnOpen, ...unsaid } = waiting;
  assert.equal(writeOnOpen, true);
  assert.equal(writesOnOpen(unsaid), false, 'a conversation the server says nothing about');
  assert.equal(writesOnOpen(null), false);
  assert.equal(writesOnOpen(undefined), false);
});
