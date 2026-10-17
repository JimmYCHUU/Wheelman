// Where a conversation is listed, and moving it. A lead from the dashboard's Imports list is an
// auction customer: it is listed in Auction, under its order once there is one. The owner can move
// any conversation between Dashboard, Import Query and Auction, in every direction, and back; a
// Facebook chat can leave Marketplace but nothing moves into it. Every name, number and car is
// invented; stand-ins play the website, the dashboard and the AI.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { applyTestEnv } from './support/env.js';
import { startStandins, aiBehaviour } from './support/standins.js';
import { world, orders as rawOrders } from './support/fixtures.js';
import { pointConfigAt } from './support/wire.js';

applyTestEnv({ MAIL_INTAKE: '1', MARKETPLACE_ENABLED: '1' });

const now = Date.now();
const HOUR = 3600e3, MIN = 60e3;
let standins, config, db, items, sync, drafter, app, base;
const ai = aiBehaviour({ behave: () => ({
  reply: 'Hello {{NAME}},\n\nThank you for your message.', next_step: 'answered', rung: '', facts_used: [], needs_human: [], hold: false, import_enquiry: false,
}) });

before(async () => {
  standins = await startStandins({ world: world(now), ai });
  ({ config } = await import('../src/config.js'));
  pointConfigAt(config, standins, { port: 0 });
  db = await import('../src/db.js');
  items = await import('../src/items.js');
  sync = await import('../src/sync.js');
  drafter = await import('../src/drafter.js');
  const eligible = await import('../src/eligible.js');
  try { fs.unlinkSync(config.importQuery.modelsPath); } catch { /* none yet */ }
  await eligible.refreshEligibleModels({ now });
  await sync.syncVehicles({ force: true });
  app = await (await import('../src/server.js')).startServer();
  base = `http://127.0.0.1:${app.address().port}`;
});

after(async () => {
  await new Promise((r) => { app.close(r); app.closeAllConnections?.(); });
  await standins.close();
  try { fs.unlinkSync(config.importQuery.modelsPath); } catch { /* gone */ }
});

const get = async (p) => (await fetch(base + p)).json();
const post = async (p, body = {}) => { const r = await fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, json: await r.json() }; };
const keys = async (section, tab = 'waiting') => (await get(`/api/items?section=${section}&tab=${tab}&limit=1000`)).items.map((r) => r.key);

/** A lead as the sync stores it. `platform` IMPORTS is the dashboard's Imports list. */
const lead = (id, first, text, { platform = 'carbarnau', source = 'Contact Us Form', conversationId = null, phone = `0491 570 ${id}` } = {}) => db.upsertLead({
  id, conversationId, firstName: first, lastName: 'Invented', phone, email: `${first.toLowerCase()}@example.com`, source, status: 'NEW', platform, state: '',
  leadAt: now - HOUR, updatedAt: now - 5 * MIN, stocks: [], statusHistory: [],
  inquiries: [{ id: id * 10, type: platform === 'IMPORTS' ? 'Import' : 'Contact Us Page', subject: 'Enquiry', text, stockNo: '', at: now - HOUR, status: 'NEW', url: '', leadType: '', staffNotes: [] }],
});

// ---- Imports AU leads are auction customers -------------------------------------------------------

test('a lead from the Imports list with no order is listed in Auction as an enquiry, and not in Dashboard', async () => {
  lead(9101, 'Ari', 'Hi, could you import a Honda N-Box for me? What would it cost?', { platform: 'IMPORTS', source: 'Import' });
  assert.ok((await keys('auction')).includes('l:9101'), 'listed in Auction');
  assert.ok(!(await keys('dashboard')).includes('l:9101'), 'not in Dashboard');
  const row = (await get('/api/items?section=auction&tab=waiting&limit=1000')).items.find((r) => r.key === 'l:9101');
  assert.equal(row.section, 'auction');
  assert.match(row.stage, /^Enquiry: /);
  const { item } = await get('/api/items/l:9101');
  assert.equal(item.section, 'auction');
});

// ---- moving ---------------------------------------------------------------------------------------

test('a conversation moves between Dashboard, Auction and Import Query in every direction, and Undo takes it back', async () => {
  lead(9102, 'Bea', 'Hi, what are your opening hours on Sunday?');
  let { item } = await get('/api/items/l:9102');
  assert.deepEqual([item.section, item.moves], ['dashboard', ['importquery', 'auction']]);

  let out = await post('/api/items/l:9102/move', { section: 'auction' });
  assert.equal(out.status, 200);
  assert.deepEqual([out.json.from, out.json.item.section, out.json.item.moves], ['dashboard', 'auction', ['dashboard', 'importquery']]);
  assert.ok((await keys('auction')).includes('l:9102'));
  assert.ok(!(await keys('dashboard')).includes('l:9102'));

  out = await post('/api/items/l:9102/move', { section: 'importquery' });
  assert.deepEqual([out.json.from, out.json.item.section], ['auction', 'importquery']);
  assert.ok((await keys('importquery')).includes('l:9102'));
  assert.ok(!(await keys('auction')).includes('l:9102'));

  out = await post('/api/items/l:9102/move', { section: 'auction' });
  assert.deepEqual([out.json.from, out.json.item.section], ['importquery', 'auction']);

  // Undo is a move back to where it was. Back in its own section, the move is forgotten.
  out = await post('/api/items/l:9102/move', { section: 'dashboard' });
  assert.deepEqual([out.json.from, out.json.item.section], ['auction', 'dashboard']);
  assert.equal(db.itemMove('l:9102', 9102), null);
  assert.ok((await keys('dashboard')).includes('l:9102'));

  // An Imports lead can go to Dashboard, and back to Auction.
  out = await post('/api/items/l:9101/move', { section: 'dashboard' });
  assert.deepEqual([out.json.from, out.json.item.section], ['auction', 'dashboard']);
  assert.ok((await keys('dashboard')).includes('l:9101'));
  assert.ok(!(await keys('auction')).includes('l:9101'));
  out = await post('/api/items/l:9101/move', { section: 'auction' });
  assert.equal(out.json.item.section, 'auction');
  assert.equal(db.itemMove('l:9101', 9101), null, 'back where it belongs: nothing to remember');

  // What is refused.
  assert.equal((await post('/api/items/l:9102/move', { section: 'marketplace' })).status, 400, 'nothing moves into Marketplace');
  assert.equal((await post('/api/items/l:9102/move', { section: 'dashboard' })).status, 400, 'already there');
  assert.equal((await post('/api/items/l:9102/move', { section: 'nowhere' })).status, 400);
  assert.equal((await post('/api/items/l:999999/move', { section: 'auction' })).status, 404);
});

// ---- moved into Auction: answered as an auction customer -----------------------------------------

const lastPrompt = () => ai.seen[ai.seen.length - 1].messages[1].content;
const settled = async (key) => { for (let i = 0; i < 300; i++) { const it = items.itemFromKey(key); if (!drafter.writingNow(it.itemKey, it.anchorKey)) return it; await new Promise((r) => setTimeout(r, 20)); } throw new Error('still writing'); };
let mid = 990000;
const conversation = (id, leadId, first, lines) => {
  db.upsertConversation({ id, phone: `+61491570${String(leadId).slice(-3)}`, channel: 'SMS', status: 'OPEN', leadId, customerName: `${first} Invented`, latestDirection: lines[lines.length - 1][0], latestAt: now - lines[lines.length - 1][2], latestBody: lines[lines.length - 1][1], leadPlatform: 'carbarnau', leadStatus: 'NEW', leadEmail: '' });
  for (const [direction, body, ago] of lines) db.upsertMessage({ id: mid++, conversationId: id, direction, body, sentBy: direction === 'OUT' ? 'Alex STONE' : null, status: 'SENT', mediaType: null, at: now - ago, importedAt: now - ago });
};

test('a customer who gave the car and what they want, moved to Auction, is searched for and offered a car, not asked again', async () => {
  // We answered once with a holding line; they ask again with nothing new. In Dashboard that is an
  // ordinary turn of the conversation: no search.
  lead(9103, 'Theo', 'Hi, can you get me a Honda N-Box? 2019 or newer, under 40,000 km, budget around $16,000.', { conversationId: 99103, phone: '0491 570 913' });
  conversation(99103, 9103, 'Theo', [['IN', 'Hi, can you get me a Honda N-Box? 2019 or newer, under 40,000 km, budget around $16,000.', 3 * HOUR], ['OUT', 'Hello Theo, thank you, we will look into it.', 2 * HOUR], ['IN', 'Any news on the N-Box?', 10 * MIN]]);
  const before = items.itemFromKey('c:99103');
  assert.equal(before.section, 'dashboard');
  const d = await drafter.draftFor(before);
  assert.equal(d.status, 'ready');
  assert.ok(!/We searched the live auction/.test(lastPrompt()), 'in Dashboard, nothing new: no search');

  // Moved to Auction: the untouched suggestion is written again, from a search of the live auction.
  const out = await post('/api/items/c:99103/move', { section: 'auction' });
  assert.deepEqual([out.json.item.section, out.json.writing], ['auction', true]);
  const after = await settled('c:99103');
  assert.match(lastPrompt(), /We searched the live auction \(1 Honda N-Box in the coming auctions\) and chose this one/);
  const offer = db.latestDraft(after.itemKey, after.anchorKey);
  assert.equal(offer.context.importStage, 'offer');
  assert.match(offer.reply, /Vehicle details:/);
  assert.ok((await keys('auction')).includes('c:99103'));
});

test('a car named in their words is read for the search once the conversation is in Auction, even one of a model on the yard', async () => {
  // An Alphard is on the yard and they used no import words: in Dashboard it is an ordinary enquiry.
  lead(9104, 'Uma', 'Looking for a Toyota Alphard Welcab, 2018 or newer, under 60,000 km, budget $50k.', { phone: '0491 570 914' });
  const before = items.itemFromKey('l:9104');
  assert.deepEqual([before.section, before.imports], ['dashboard', null]);
  await post('/api/items/l:9104/move', { section: 'auction' });
  const after = await settled('l:9104');
  assert.equal(after.imports.forms[0].car, 'Toyota Alphard Welcab');
  assert.equal(after.imports.judged, 'placed');
  assert.match(lastPrompt(), /=== IMPORT ENQUIRY ===/);
  assert.match(lastPrompt(), /Alphard Welcab/);
  assert.equal(db.latestDraft(after.itemKey, after.anchorKey).context.importStage, 'none', 'searched: none in the coming auctions');
});
