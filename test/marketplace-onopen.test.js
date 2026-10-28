// A Facebook chat is written when it is opened, on either page, and never in the background: the
// server says which chats qualify (writeOnOpen), and both pages ask the one shared rule
// (web/lib/onopen.js) once. Against a stand-in content engine; all data is invented.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { applyTestEnv } from './support/env.js';
import { startStandins, aiBehaviour } from './support/standins.js';
import { chatRow, chatMessage } from './support/fixtures.js';
import { writesOnOpen, noSuggestionKey } from '../web/lib/onopen.js';
import { t, COPY } from '../web/lib/copy.js';

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
  // Waiting, never opened: moved to Imports in the last test.
  [606, { row: chatRow(606, 'Pip Invented', 15, now), messages: [chatMessage(67, 'in', 'phone', 'Could you bring one in from Japan for me?', 15, now)] }],
]);

const ai = aiBehaviour();
let standins, app, base;

before(async () => {
  standins = await startStandins({ world: { now, chats }, ai });
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
  // The background pass runs first: it writes the dashboard customer, and no chat.
  const worker = await import('../src/worker.js');
  const db = await import('../src/db.js');
  assert.equal(await worker.draftWaiting(), 1, 'the dashboard customer');
  assert.ok(db.openDb().prepare("SELECT 1 FROM drafts WHERE item_key = 'c:911' AND status = 'ready'").get());
  assert.equal(db.openDb().prepare("SELECT COUNT(*) AS n FROM drafts WHERE item_key LIKE 'mp:%'").get().n, 0);
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

test('the old page says No suggestion yet for a waiting Facebook chat, never that one will be written', () => {
  // A buyer who wrote again while the chat was open, or a chat opened without writing (the next row
  // after a Dismiss): nothing writes it in the background, so the box says so, beside Write it now.
  assert.equal(t(noSuggestionKey({ channel: 'marketplace', state: 'awaiting', writeOnOpen: true, draft: null })), 'No suggestion yet.');
  // A Dashboard text keeps its words: it is written ahead in the background.
  assert.equal(t(noSuggestionKey({ channel: 'sms', state: 'awaiting', draft: null })), 'A suggestion will be written within a few minutes.');
  assert.equal(t(noSuggestionKey({ channel: 'email', state: 'awaiting', draft: null })), 'A suggestion will be written within a few minutes.');
  // The old page takes its words from this rule (web/app.js renderComposer), and from nowhere else.
  const page = fs.readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
  assert.match(page, /import \{ writesOnOpen, noSuggestionKey \} from '\.\/lib\/onopen\.js'/);
  assert.match(page, /: t\(noSuggestionKey\(item\)\)\);/);
  assert.doesNotMatch(page, /t\('composer\.waiting'\)/);
});

test('a refused Facebook write never says Wheelman will try again by itself', async () => {
  const llm = await import('../src/llm.js');
  const { config } = await import('../src/config.js');
  const words = async (role) => { try { await llm.complete('system', 'user', { role }); return ''; } catch (e) { return e.message; } };
  const busy = async (role) => { llm.resetModelState(); ai.down = true; try { return await words(role); } finally { ai.down = false; } };
  const usedUp = async (role) => {
    llm.resetModelState();
    for (const m of config.llm.gemini.models) ai.usedUp.add(m);
    try { return await words(role); } finally { ai.usedUp.clear(); }
  };
  const models = config.llm.gemini.models;
  const small = config.llm.marketplaceModel;
  const real = globalThis.setTimeout;
  globalThis.setTimeout = (f, ms, ...a) => real(f, Math.min(ms, 5), ...a); // no real waiting between tries
  try {
    // Marketplace sharing the dashboard's model, then with a small model of its own.
    for (const split of [false, true]) {
      if (split) { config.llm.gemini.models = ['model-a', 'model-b']; config.llm.marketplaceModel = 'model-b'; }
      for (const said of [await busy('marketplace'), await usedUp('marketplace')]) {
        assert.ok(said, 'the write was refused');
        assert.doesNotMatch(said, /by itself|by themselves|tries again|start again/i, said);
        assert.match(said, /Try again (in a few minutes|after \S.*)\.$/, said);
      }
    }
    // The Dashboard's words stay exactly as they are: its customers are written ahead in the background.
    assert.equal(await busy('write'), 'No AI model could answer just now. The free models are busy or have used up their allowance for today. Wheelman tries again by itself in a few minutes.');
    assert.match(await usedUp('write'), /^Every free AI model has used up its allowance for today\. Suggestions start again by themselves around \S/);
    config.llm.gemini.models = models;
    config.llm.marketplaceModel = small;

    // A Facebook chat written from the page carries the words to its box.
    llm.resetModelState();
    ai.down = true;
    const out = await (await fetch(`${base}/api/items/mp:601/draft`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).json();
    ai.down = false;
    assert.equal(out.item.draft.status, 'failed');
    assert.equal(out.item.draft.error, 'No AI model could answer just now. The free models are busy or have used up their allowance for today. Try again in a few minutes.');
  } finally {
    globalThis.setTimeout = real;
    ai.down = false;
    ai.usedUp.clear();
    config.llm.gemini.models = models;
    config.llm.marketplaceModel = small;
    llm.resetModelState();
  }
});

test('the old page has no retry words for a Facebook chat, since nothing retries one', () => {
  assert.equal(Object.hasOwn(COPY, 'composer.retry.marketplace'), false);
  assert.ok(!fs.readFileSync(new URL('../web/app.js', import.meta.url), 'utf8').includes('composer.retry.marketplace'));
});

test('a move writes a Facebook chat again only where opening it would write it', async () => {
  const db = await import('../src/db.js');
  const { writingNow } = await import('../src/drafter.js');
  const items = await import('../src/items.js');
  const move = async (key, section) => (await fetch(`${base}/api/items/${key}/move`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ section }) })).json();
  const stored = (key) => db.openDb().prepare('SELECT COUNT(*) AS n FROM drafts WHERE item_key = ?').get(key).n;
  const settled = async (key) => { const it = items.itemFromKey(key); for (let i = 0; i < 200 && writingNow(it.itemKey, it.anchorKey); i++) await new Promise((r) => setTimeout(r, 20)); };
  // A waiting buyer, moved to Imports: written again, as opening it would write it.
  let out = await move('mp:606', 'importquery');
  assert.deepEqual([out.item.section, out.writing], ['importquery', true]);
  await settled('mp:606');
  assert.equal(stored('mp:606'), 1);
  // A chat not marked as a buyer, and a photo with no words: moved either way, and never written by a move.
  for (const key of ['mp:603', 'mp:604']) {
    out = await move(key, 'importquery');
    assert.deepEqual([out.item.section, out.writing], ['importquery', false], key);
    out = await move(key, 'marketplace');
    assert.deepEqual([out.item.section, out.writing], ['marketplace', false], key);
    await settled(key);
    assert.equal(stored(key), 0, key);
  }
});
