// Where a conversation is listed, and moving it. A lead from the dashboard's Imports list is an
// auction customer: it is listed in Auction, under its order once there is one. The owner can move
// any conversation between Dashboard, Import Query and Auction, in every direction, and back; a
// Facebook chat can leave Marketplace but nothing moves into it. Every name, number and car is
// invented; stand-ins play the website, the dashboard and the AI.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
  pointConfigAt(config, standins, { port: 0, sessionPath: path.join(os.tmpdir(), `wheelman-placement-session-${process.pid}.json`) });
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
  assert.deepEqual([item.section, item.listed, item.isImport], ['auction', 'imports', true], 'answered as an import enquiry, and the page can say why it is here');
});

// ---- moving ---------------------------------------------------------------------------------------

test('a conversation moves between Dashboard, Auction and Import Query in every direction, and Undo takes it back', async () => {
  lead(9102, 'Bea', 'Hi, what are your opening hours on Sunday?');
  let { item } = await get('/api/items/l:9102');
  assert.deepEqual([item.section, item.moves], ['dashboard', ['auction', 'importquery']]);

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

// ---- one row per auction customer ----------------------------------------------------------------

test('a customer with an auction order is one row in Auction, the order, and a new text from them is answered there', async () => {
  lead(9105, 'Vic', 'Auction alert for a Subaru XV Hybrid', { platform: 'IMPORTS', source: 'Auction', conversationId: 99105, phone: '0491 570 915' });
  conversation(99105, 9105, 'Vic', [['IN', 'Hi, I asked about an XV on your website', 3 * 24 * HOUR]]);
  const [o] = rawOrders(now);
  sync.storeAuctionOrders([{ ...o, id: 601, orderNo: 'AS-601', leadId: 9105 }], { complete: false, now });
  assert.ok((await keys('auction')).includes('ao:601'));
  for (const tab of ['waiting', 'quiet', 'other']) assert.ok(!(await keys('auction', tab)).includes('c:99105'), `the order stands for the customer (${tab})`);
  assert.ok(!(await keys('dashboard')).includes('c:99105'));

  // A text from them after the order opened (the one before it was dealt with when it opened).
  conversation(99105, 9105, 'Vic', [['IN', 'Is anything coming up at auction this week?', 5 * MIN]]);
  let row = (await get('/api/items?section=auction&tab=waiting')).items.find((r) => r.key === 'ao:601');
  assert.deepEqual([row.dueKind, row.preview.text], ['reply', 'Is anything coming up at auction this week?']);
  const { item } = await get('/api/items/ao:601');
  assert.equal(item.order.replying, true);
  const out = await post('/api/items/ao:601/draft', {});
  assert.equal(out.status, 200);
  assert.match(ai.seen[ai.seen.length - 1].messages[0].content, /replies by text message \(SMS\) to customers who have an auction order/);
  assert.match(lastPrompt(), /They texted us/);
  assert.match(lastPrompt(), /Is anything coming up at auction this week\?/);

  // A text more than a week old is not raised as waiting on the order: it shows in its thread.
  const o601 = db.getOrder(601);
  const orders = await import('../src/orders.js');
  assert.equal(orders.orderStatus(o601, { copied: new Map(), dismissed: new Set(), pastes: [], lastCopyAt: 0, texts: items.orderTexts(o601) }, { now: now + 8 * 24 * HOUR }).kind === 'reply', false);

  // Our text back answers it.
  conversation(99105, 9105, 'Vic', [['OUT', 'Hello Vic, two are coming up on Friday.', 2 * MIN]]);
  row = (await get('/api/items?section=auction&tab=waiting')).items.find((r) => r.key === 'ao:601');
  assert.notEqual(row?.dueKind, 'reply');

  // Moved to Dashboard: listed there again, and its texts are answered there, not on the order.
  await post('/api/items/c:99105/move', { section: 'dashboard' });
  conversation(99105, 9105, 'Vic', [['IN', 'Also, do you have any Noahs?', MIN]]);
  assert.ok((await keys('dashboard')).includes('c:99105'));
  row = (await get('/api/items?section=auction&tab=waiting')).items.find((r) => r.key === 'ao:601');
  assert.notEqual(row?.dueKind, 'reply');
});

// ---- Facebook chats and emails ---------------------------------------------------------------------

test('a Facebook chat and an email can leave their own section and come back; each is still answered the way it came in', async () => {
  await sync.syncMarketplace();
  assert.ok((await keys('marketplace')).includes('mp:501'));
  let out = await post('/api/items/mp:501/move', { section: 'dashboard' });
  assert.equal(out.status, 200);
  assert.deepEqual([out.json.from, out.json.item.section, out.json.item.channel, out.json.item.teaches], ['marketplace', 'dashboard', 'marketplace', false]);
  assert.deepEqual(out.json.item.moves, ['auction', 'importquery', 'marketplace'], 'it can go back to Marketplace');
  assert.ok((await keys('dashboard')).includes('mp:501'));
  assert.ok(!(await keys('marketplace')).includes('mp:501'));
  out = await post('/api/items/mp:501/move', { section: 'marketplace' });
  assert.deepEqual([out.json.item.section, db.itemMove('mp:501')], ['marketplace', null]);

  const mail = await import('../src/mail.js');
  const stored = mail.storeMailThread(mail.validateMailReport({ v: 1, kind: 'mail', thread: { ref: 'thread-f:placement-1' }, subject: 'A Honda N-Box', messages: [{ ref: 'msg-f:p1', fromEmail: 'wren@example.com', fromName: 'Wren Invented', text: 'Hi, can you find me a Honda N-Box, 2019 or newer?', at: now - HOUR }] }, { now }), { now });
  out = await post(`/api/items/${stored.key}/move`, { section: 'auction' });
  assert.deepEqual([out.json.from, out.json.item.section, out.json.item.channel], ['importquery', 'auction', 'email']);
  assert.ok((await keys('auction')).includes(stored.key));
  assert.ok(!(await keys('importquery')).includes(stored.key));
  out = await post(`/api/items/${stored.key}/move`, { section: 'dashboard' });
  assert.equal(out.json.item.section, 'dashboard');
  assert.ok((await keys('dashboard')).includes(stored.key));
  out = await post(`/api/items/${stored.key}/move`, { section: 'importquery' });
  assert.deepEqual([out.json.item.section, db.itemMove(stored.key)], ['importquery', null]);

  // An auction order never moves.
  assert.equal((await post('/api/items/ao:601/move', { section: 'dashboard' })).status, 400);
});

test('a move follows the lead into the text conversation that starts later, and Import Query switched off sends it home', async () => {
  lead(9106, 'Wil', 'Hi, what time do you open on Saturday?', { phone: '0491 570 916' });
  await post('/api/items/l:9106/move', { section: 'auction' });
  conversation(99106, 9106, 'Wil', [['IN', 'Hello again', 5 * MIN]]);
  lead(9106, 'Wil', 'Hi, what time do you open on Saturday?', { phone: '0491 570 916', conversationId: 99106 });
  assert.equal(items.itemFromKey('c:99106').section, 'auction');
  assert.ok((await keys('auction')).includes('c:99106'));

  await post('/api/items/c:99106/move', { section: 'importquery' });
  config.mail.switchedOn = false;
  try {
    const item = items.itemFromKey('c:99106');
    assert.deepEqual([item.section, item.home], ['dashboard', 'dashboard'], 'a section that is off lists nothing');
    assert.ok(!(await post('/api/items/c:99106/move', { section: 'importquery' })).json.item);
  } finally { config.mail.switchedOn = true; }
  assert.equal(items.itemFromKey('c:99106').section, 'importquery', 'and is where it was once the section is on again');
});

// ---- learning ------------------------------------------------------------------------------------------

test('nothing is learned while a conversation is in Auction, and it teaches again once it is back in Dashboard', async () => {
  lead(9107, 'Xan', 'Hi, is the Noah still available?', { conversationId: 99107, phone: '0491 570 917' });
  conversation(99107, 9107, 'Xan', [['IN', 'Hi, is the Noah still available?', 20 * MIN]]);
  await post('/api/items/c:99107/move', { section: 'auction' });
  let item = await settled('c:99107');
  assert.equal((await get('/api/items/c:99107')).item.teaches, false, 'no teaching buttons in Auction');
  const inAuction = db.latestDraft(item.itemKey, item.anchorKey);
  assert.equal(inAuction.context.section, 'auction');
  let out = await post(`/api/drafts/${inAuction.id}/copied`, { text: 'Hello Xan, yes it is here, come and see it any day.' });
  assert.deepEqual([out.json.learned, db.getLearned(inAuction.id)], [false, null]);

  await post('/api/items/c:99107/move', { section: 'dashboard' });
  assert.equal((await get('/api/items/c:99107')).item.teaches, true);
  // What was written while it was in Auction still teaches nothing.
  out = await post(`/api/drafts/${inAuction.id}/copied`, { text: 'Hello Xan, yes it is here. Come any day.' });
  assert.equal(out.json.learned, false);
  item = items.itemFromKey('c:99107');
  const d = await drafter.draftFor(item, { instruction: 'say yes' });
  out = await post(`/api/drafts/${d.id}/copied`, { text: 'Hello Xan, yes, the Noah is here. When would suit you to see it?' });
  assert.equal(out.json.learned, true);
});

// ---- written without being asked ---------------------------------------------------------------------

test('the background writer writes for enquiries in Auction and for orders a customer has texted', async () => {
  const worker = await import('../src/worker.js');
  lead(9108, 'Yan', 'Auction alert for a Subaru XV Hybrid', { platform: 'IMPORTS', source: 'Auction', conversationId: 99108, phone: '0491 570 918' });
  conversation(99108, 9108, 'Yan', [['IN', 'Can you find me a Subaru XV Hybrid, 2015, under 120,000 km?', 10 * MIN]]);
  lead(9109, 'Zed', 'Auction alert for a Subaru XV Hybrid', { platform: 'IMPORTS', source: 'Auction', conversationId: 99109, phone: '0491 570 919' });
  const [o] = rawOrders(now);
  sync.storeAuctionOrders([{ ...o, id: 602, orderNo: 'AS-602', leadId: 9109 }], { complete: false, now });
  conversation(99109, 9109, 'Zed', [['IN', 'Did we win the auction yesterday?', 6 * MIN]]);

  await worker.draftWaiting({ max: 50 });
  const enquiry = items.itemFromKey('c:99108');
  assert.equal(db.latestDraft(enquiry.itemKey, enquiry.anchorKey)?.status, 'ready', 'the enquiry in Auction');
  const order = items.itemFromKey('ao:602');
  assert.match(order.anchorKey, /^m:/);
  assert.equal(db.latestDraft(order.itemKey, order.anchorKey)?.status, 'ready', 'the order, for their text');
});


// ---- found in review: nothing is lost under an order, and each rule holds once ----------------------

/** An auction order for one of our invented leads, on the number given. */
const storeOrder = (id, leadId, phone) => {
  const [o] = rawOrders(now);
  const who = { ...o.invoiceTo, mobileNumber: phone };
  sync.storeAuctionOrders([{ ...o, id, orderNo: `AS-${id}`, leadId, invoiceTo: who, deliveryTo: who }], { complete: false, now });
};
const orderRow = async (key) => (await get('/api/items?section=auction&tab=waiting&limit=1000')).items.find((r) => r.key === key);

test("an auction customer's enquiry that the order does not read is listed in Auction as its own row, never lost", async () => {
  lead(9111, 'Kai', 'Auction alert for a Subaru XV Hybrid', { platform: 'IMPORTS', source: 'Auction', conversationId: 99111, phone: '0491 570 921' });
  conversation(99111, 9111, 'Kai', [['IN', 'Hi, about the XV', 3 * 24 * HOUR]]);
  storeOrder(603, 9111, '0491 570 921');
  // A new website lead from the same number, with no text conversation: the order reads only its own lead's conversation.
  lead(9112, 'Kai', 'Do you also have any Noahs on the yard?', { phone: '0491 570 921' });
  assert.ok((await keys('auction')).includes('l:9112'), 'listed with the auction customers');

  // A new website enquiry on the order's own lead: waiting on the order, like a text.
  db.upsertLead({ id: 9111, conversationId: 99111, firstName: 'Kai', lastName: 'Invented', phone: '0491 570 921', email: 'kai@example.com', source: 'Auction', status: 'NEW', platform: 'IMPORTS', state: '', leadAt: now - 4 * 24 * HOUR, updatedAt: now - MIN, stocks: [], statusHistory: [],
    inquiries: [{ id: 91110, type: 'Auction', subject: 'Enquiry', text: 'Auction alert for a Subaru XV Hybrid', stockNo: '', at: now - 4 * 24 * HOUR, status: 'NEW', url: '', leadType: '', staffNotes: [] },
      { id: 91111, type: 'Import', subject: 'Enquiry', text: 'Could you also look for a 2016 one with lower kilometres?', stockNo: '', at: now - 2 * MIN, status: 'NEW', url: '', leadType: '', staffNotes: [] }] });
  const row = await orderRow('ao:603');
  assert.deepEqual([row?.dueKind, row?.preview.text], ['reply', 'Could you also look for a 2016 one with lower kilometres?']);

  // The order's number belongs to another conversation than its lead's: the lead's own conversation is a row of its own.
  lead(9113, 'Lou', 'Auction alert for a Subaru XV Hybrid', { platform: 'IMPORTS', source: 'Auction', conversationId: 99113, phone: '0491 570 923' });
  db.upsertConversation({ id: 99114, phone: '+61491570924', channel: 'SMS', status: 'OPEN', leadId: null, customerName: 'Lou Invented', latestDirection: 'IN', latestAt: now - 3 * 24 * HOUR, latestBody: 'This is my other number' });
  storeOrder(604, 9113, '0491 570 924');
  conversation(99113, 9113, 'Lou', [['IN', 'Any update on my order?', 5 * MIN]]);
  assert.equal(db.getOrder(604).conversationId, 99114, 'the order reads the conversation on its own number');
  assert.ok((await keys('auction')).includes('c:99113'), "the lead's own conversation is not hidden");
});

test('Dismiss on an order clears every message that was waiting, not only the newest', async () => {
  lead(9115, 'Mo', 'Auction alert for a Subaru XV Hybrid', { platform: 'IMPORTS', source: 'Auction', conversationId: 99115, phone: '0491 570 925' });
  storeOrder(605, 9115, '0491 570 925');
  conversation(99115, 9115, 'Mo', [['IN', 'Hello?', 6 * MIN], ['IN', 'Did you get my message?', 4 * MIN]]);
  assert.equal((await orderRow('ao:605')).dueKind, 'reply');
  assert.equal((await post('/api/items/ao:605/dismiss')).status, 200);
  assert.notEqual((await orderRow('ao:605'))?.dueKind, 'reply');
});

test('an Imports lead that nobody moved is searched for only when it tells us something new', async () => {
  lead(9116, 'Noor', 'Hi, can you get me a Honda N-Box? 2019 or newer, under 40,000 km.', { platform: 'IMPORTS', source: 'Import', conversationId: 99116, phone: '0491 570 926' });
  conversation(99116, 9116, 'Noor', [['OUT', 'Hello Noor, thank you, we will look into it.', 30 * MIN], ['IN', 'Thanks, I will pay the deposit tomorrow.', 10 * MIN]]);
  const item = items.itemFromKey('c:99116');
  assert.equal(item.section, 'auction');
  await drafter.draftFor(item);
  assert.ok(!/We searched the live auction/.test(lastPrompt()), 'no search for a message with nothing new');
});

test('treated as an import enquiry and then moved to Auction, the car is read from their words', async () => {
  lead(9117, 'Ivy', 'Looking for a Toyota Alphard Welcab, 2018 or newer, budget $50k.', { phone: '0491 570 927' });
  await post('/api/items/l:9117/ruling', { kind: 'import' });
  await settled('l:9117');
  await post('/api/items/l:9117/move', { section: 'auction' });
  const after = await settled('l:9117');
  assert.match(lastPrompt(), /=== IMPORT ENQUIRY ===[\s\S]*Alphard Welcab/);
  assert.equal(db.latestDraft(after.itemKey, after.anchorKey).context.importStage, 'none');
});

test("an order says where its customer's texts are answered, and they can be sent to Dashboard and back", async () => {
  let order = (await get('/api/items/ao:605')).item.order;
  assert.deepEqual(order.texts, { key: 'c:99115', here: true });
  await post('/api/items/c:99115/move', { section: 'dashboard' });
  order = (await get('/api/items/ao:605')).item.order;
  assert.deepEqual(order.texts, { key: 'c:99115', here: false });
  assert.ok((await keys('dashboard')).includes('c:99115'));
  await post('/api/items/c:99115/move', { section: 'auction' });
  assert.equal((await get('/api/items/ao:605')).item.order.texts.here, true);
  assert.equal(db.itemMove('c:99115', 9115), null);
});

test('a conversation last seen weeks ago leaves Dashboard as soon as an order opens for it', async () => {
  db.upsertLead({ id: 9118, conversationId: 99118, firstName: 'Oz', lastName: 'Invented', phone: '0491 570 928', email: 'oz@example.com', source: 'Contact Us Form', status: 'NEW', platform: 'carbarnau', state: '', leadAt: now - 30 * 24 * HOUR, updatedAt: now - 30 * 24 * HOUR, stocks: [], statusHistory: [], inquiries: [] });
  conversation(99118, 9118, 'Oz', [['IN', 'Is the Noah still available?', 30 * 24 * HOUR]]);
  assert.ok((await keys('dashboard')).includes('c:99118'));
  storeOrder(606, 9118, '0491 570 928');
  assert.ok(!(await keys('dashboard')).includes('c:99118'), 'under its order now');
});

test('a number seen only on the phone, moved to Auction, is answered as an import enquiry', async () => {
  const phone = await import('../src/phone.js');
  const t0 = Date.now();
  phone.storePhoneReport(phone.validateReport({ v: 1, seenAt: t0, hidden: true, path: '/web/conversations', signedOut: false, found: { listItems: 1, parsed: 1 },
    threads: [{ ref: 'r9', name: '0491 570 929', kind: 'number', unread: true, latest: { direction: 'in', text: 'Can you find me a Honda N-Box from Japan?', media: null, truncated: false, when: '3 min', at: t0 - 3 * MIN, precision: 'minute' } }] }));
  const key = (await keys('dashboard', 'all')).find((k) => k.startsWith('ph:') && items.itemFromKey(k)?.phone === '0491 570 929');
  assert.ok(key, 'listed in Dashboard');
  const out = await post(`/api/items/${key}/move`, { section: 'auction' });
  assert.deepEqual([out.json.item.section, out.json.item.isImport], ['auction', true]);
});
