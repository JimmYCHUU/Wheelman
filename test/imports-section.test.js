// The Imports section takes the leads from the dashboard's Imports list: they are listed there, not
// in Auction, also with the email intake off, and keep the messages they had in Auction. A customer
// whose auction order is under way stays under that order in Auction. Emails keep their own three
// messages. Nothing from the Imports list teaches Wheelman. Every name, number and car is
// invented; stand-ins play the website, the dashboard, the live auction and the AI.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyTestEnv } from './support/env.js';
import { startStandins, aiBehaviour } from './support/standins.js';
import { world, orders as rawOrders } from './support/fixtures.js';
import { pointConfigAt } from './support/wire.js';
import { sectionRowView } from '../web/new/js/sections.js';
import { rememberOffer } from '../web/new/js/lessons.js';
import { insteadOptions } from '../web/new/js/model.js';

applyTestEnv({ MAIL_INTAKE: '1' });

const now = Date.now();
const MIN = 60e3, HOUR = 60 * MIN, DAY = 24 * HOUR;
let standins, config, db, items, sync, drafter, mail, app, base;
const ai = aiBehaviour({ behave: () => ({
  reply: 'Hello {{NAME}},\n\nThank you for your message.', next_step: 'answered', rung: '', facts_used: [], needs_human: [], hold: false, import_enquiry: false,
}) });

before(async () => {
  standins = await startStandins({ world: world(now), ai });
  ({ config } = await import('../src/config.js'));
  pointConfigAt(config, standins, { port: 0, sessionPath: path.join(os.tmpdir(), `wheelman-imports-section-session-${process.pid}.json`) });
  db = await import('../src/db.js');
  items = await import('../src/items.js');
  sync = await import('../src/sync.js');
  drafter = await import('../src/drafter.js');
  mail = await import('../src/mail.js');
  // The website's list of models we import, which names the car an enquiry is about.
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
const rows = async (section, tab = 'waiting') => (await get(`/api/items?section=${section}&tab=${tab}&limit=1000`)).items;

/** Every list a key is on: each section that is on, on any of its lists. */
async function listedIn(key) {
  const out = [];
  for (const s of ['dashboard', 'marketplace', 'importquery', 'auction']) {
    for (const tab of s === 'auction' ? ['waiting', 'quiet', 'other'] : ['all']) {
      const list = await get(`/api/items?section=${s}&tab=${tab}&limit=1000`);
      if (list.section !== s) break; // switched off: the server answered for Dashboard
      if (list.items.some((r) => r.key === key)) { out.push(s); break; }
    }
  }
  return out;
}

/** With the email intake off for the length of `fn`. */
async function intakeOff(fn) {
  config.mail.switchedOn = false;
  try { return await fn(); } finally { config.mail.switchedOn = true; }
}

/** A lead as the sync stores it. `platform` IMPORTS is the dashboard's Imports list. */
const lead = (id, first, text, { platform = 'carbarnau', source = 'Contact Us Form', conversationId = null, phone } = {}) => db.upsertLead({
  id, conversationId, firstName: first, lastName: 'Invented', phone, email: `${first.toLowerCase()}@example.com`, source, status: 'NEW', platform, state: '',
  leadAt: now - HOUR, updatedAt: now - 5 * MIN, stocks: [], statusHistory: [],
  inquiries: [{ id: id * 10, type: platform === 'IMPORTS' ? 'Import' : 'Contact Us Page', subject: 'Enquiry', text, stockNo: '', at: now - HOUR, status: 'NEW', url: '', leadType: '', staffNotes: [] }],
});
let mid = 994000;
/** A text conversation; `lines` are [direction, body, agoMs], oldest first. */
const conversation = (id, leadId, first, phone, lines, platform = 'carbarnau') => {
  const last = lines[lines.length - 1];
  db.upsertConversation({ id, phone: `+61${phone.replace(/\D/g, '').slice(1)}`, channel: 'SMS', status: 'OPEN', leadId, customerName: `${first} Invented`, latestDirection: last[0], latestAt: now - last[2], latestBody: last[1], leadPlatform: platform, leadStatus: 'NEW', leadEmail: '' });
  for (const [direction, body, ago] of lines) db.upsertMessage({ id: mid++, conversationId: id, direction, body, sentBy: direction === 'OUT' ? 'Alex STONE' : null, status: 'SENT', mediaType: null, at: now - ago, importedAt: now - ago });
};
/** An auction order under way for one of our invented leads, on the number given. */
const storeOrder = (id, leadId, phone) => {
  const [o] = rawOrders(now);
  const who = { ...o.invoiceTo, mobileNumber: phone };
  sync.storeAuctionOrders([{ ...o, id, orderNo: `AS-${id}`, leadId, invoiceTo: who, deliveryTo: who }], { complete: false, now });
};
const lastPrompt = () => ai.seen[ai.seen.length - 1].messages[1].content;
const settled = async (key) => { for (let i = 0; i < 300; i++) { const it = items.itemFromKey(key); if (!drafter.writingNow(it.itemKey, it.anchorKey)) return it; await new Promise((r) => setTimeout(r, 20)); } throw new Error('still writing'); };
const searches = () => standins.calls.filter((c) => c.path === '/auc/api/public/auction-vehicles').length;

const ENQUIRY = ['first_estimate', 'lot_offer', 'lot_short', 'lots_coming', 'search_update', 'deposit_reminder'];
const EMAIL_MESSAGES = ['eligible_cost', 'process', 'ready_to_search'];

// ---- where it is listed ------------------------------------------------------------------------

test('a lead from the Imports list is listed in Imports, also with the email intake off, and one with a live order stays under its order', async () => {
  lead(9401, 'Ines', 'Hi, could you import a Honda N-Box for me? What would it cost?', { platform: 'IMPORTS', source: 'Import', phone: '0491 570 140' });
  assert.deepEqual(await listedIn('l:9401'), ['importquery'], 'in Imports, and on no other list');
  assert.equal((await rows('importquery')).find((r) => r.key === 'l:9401')?.section, 'importquery');
  const { item } = await get('/api/items/l:9401');
  assert.deepEqual([item.section, item.home, item.listed, item.isImport, item.teaches], ['importquery', 'importquery', 'imports', true, false]);

  await intakeOff(async () => {
    const list = await get('/api/items?section=importquery&tab=waiting&limit=1000');
    assert.equal(list.section, 'importquery', 'Imports is on with the intake off');
    assert.equal(typeof list.sections.importquery, 'number');
    assert.deepEqual(await listedIn('l:9401'), ['importquery']);
  });

  // Moved away and back: one list at a time, and back home nothing is remembered.
  let out = await post('/api/items/l:9401/move', { section: 'dashboard' });
  assert.deepEqual([out.json.from, out.json.item.section, out.json.item.listed], ['importquery', 'dashboard', 'moved']);
  assert.deepEqual(await listedIn('l:9401'), ['dashboard']);
  out = await post('/api/items/l:9401/move', { section: 'importquery' });
  assert.deepEqual([out.json.item.section, out.json.item.listed, db.itemMove('l:9401', 9401)], ['importquery', 'imports', null]);
  assert.deepEqual(await listedIn('l:9401'), ['importquery']);

  // An order opens for another lead from the list: the customer is the order's row in Auction.
  lead(9402, 'Jae', 'Auction alert for a Subaru XV Hybrid', { platform: 'IMPORTS', source: 'Auction', conversationId: 99402, phone: '0491 570 142' });
  conversation(99402, 9402, 'Jae', '0491 570 142', [['IN', 'Hi, about the XV on your website', 3 * DAY]], 'IMPORTS');
  assert.deepEqual(await listedIn('c:99402'), ['importquery'], 'no order yet: in Imports');
  storeOrder(701, 9402, '0491 570 142');
  const under = items.itemFromKey('c:99402');
  assert.deepEqual([under.section, under.home, under.underOrder], ['auction', 'auction', 'ao:701']);
  assert.deepEqual(await listedIn('c:99402'), [], 'not a row of its own');
  assert.deepEqual(await listedIn('ao:701'), ['auction'], 'the order stands for the customer');
  await intakeOff(async () => {
    assert.deepEqual(await listedIn('c:99402'), []);
    assert.deepEqual(await listedIn('ao:701'), ['auction']);
  });
  assert.equal((await get('/api/items/c:99402')).item.listed, 'order');
});

// ---- the messages it had in Auction -------------------------------------------------------------

test('an Imports lead keeps the messages it had in Auction, the due one first, and its row says where the enquiry has got to', async () => {
  lead(9403, 'Kit', 'Hi, could you import a Honda N-Box for me? 2019 or newer, under 40,000 km, budget about $16,000.', { platform: 'IMPORTS', source: 'Import', phone: '0491 570 143' });
  let { item } = await get('/api/items/l:9403');
  assert.equal(item.section, 'importquery');
  const ids = item.templates.map((t) => t.id);
  assert.deepEqual(ids.slice(0, 6), ENQUIRY, 'the six enquiry messages first');
  assert.ok(ids.length > 6 && ids.slice(6).every((id) => EMAIL_MESSAGES.includes(id)), `then the Imports templates: ${ids.join(', ')}`);
  assert.equal(item.templates[0].label, 'Thanks, with estimate and deposit');
  assert.deepEqual(item.templates.slice(0, 6).filter((t) => t.best).map((t) => t.id), ['lot_offer'], 'they said what they want: a car to offer is the best');
  assert.equal(item.templates.find((t) => t.due)?.id, 'lot_offer');
  assert.ok(insteadOptions(item).some((o) => o.label === 'Thanks, with estimate and deposit'), 'on the Instead line');

  // The row says where the enquiry has got to, and the new page shows it as the row's reason.
  const row = (await rows('importquery')).find((r) => r.key === 'l:9403');
  assert.match(row.stage, /^Enquiry: /);
  const view = sectionRowView(row, { now }, 'importquery');
  assert.deepEqual([view.reason, view.tone], [row.stage, '']);

  // Picked: written from what the enquiry says, with the deposit as a blank.
  const out = await post('/api/items/l:9403/draft', { message: 'first_estimate' });
  assert.equal(out.json.item.draft.template, 'first_estimate');
  assert.match(out.json.item.draft.reply, /^Hello Kit,\n\nThank you for your Honda N-Box enquiry\./);
  assert.ok(out.json.item.draft.reply.includes('[DEPOSIT AMOUNT?]'), out.json.item.draft.reply);

  // A message picked that is not offered now keeps its name in the list.
  item = (await get('/api/items/l:9403?message=deposit_received')).item;
  assert.deepEqual(item.templates.at(-1), { id: 'deposit_received', label: 'Deposit received', best: false });
});

test('an email in Imports keeps its own three messages and is not offered the auction ones', async () => {
  const stored = mail.storeMailThread(mail.validateMailReport({ v: 1, kind: 'mail', thread: { ref: 'thread-f:imports-section-1' }, subject: 'Importing a Toyota Hiace GDH206',
    messages: [{ ref: 'msg-f:is1', fromEmail: 'hana@example.com', fromName: 'Hana Invented', text: 'Hi, can you import a Toyota Hiace GDH206 for me? What would it cost?', at: now - HOUR }] }, { now }), { now });
  const { item } = await get(`/api/items/${stored.key}`);
  assert.deepEqual([item.channel, item.section, item.listed, item.teaches], ['email', 'importquery', '', true]);
  assert.deepEqual(item.templates.map((t) => t.id).sort(), EMAIL_MESSAGES);
  const row = (await rows('importquery')).find((r) => r.key === stored.key);
  assert.ok(row && !('stage' in row), 'an email row has no enquiry stage');
});

// ---- answered the auction way --------------------------------------------------------------------

test('moving a conversation into Imports searches the auction once, as a move into Auction did', async () => {
  // We answered once with a holding line; they ask again with nothing new. In Dashboard: no search.
  lead(9404, 'Lio', 'Hi, can you get me a Honda N-Box? 2019 or newer, under 40,000 km, budget around $16,000.', { conversationId: 99404, phone: '0491 570 144' });
  conversation(99404, 9404, 'Lio', '0491 570 144', [['IN', 'Hi, can you get me a Honda N-Box? 2019 or newer, under 40,000 km, budget around $16,000.', 3 * HOUR], ['OUT', 'Hello Lio, thank you, we will look into it.', 2 * HOUR], ['IN', 'Any news on the N-Box?', 10 * MIN]]);
  const before = items.itemFromKey('c:99404');
  assert.equal(before.section, 'dashboard');
  await drafter.draftFor(before);
  assert.ok(!/We searched the live auction/.test(lastPrompt()), 'in Dashboard, nothing new: no search');

  // Moved to Imports: the untouched suggestion is written again, from one search of the live auction.
  const was = searches();
  const out = await post('/api/items/c:99404/move', { section: 'importquery' });
  assert.deepEqual([out.json.item.section, out.json.writing], ['importquery', true]);
  const after = await settled('c:99404');
  assert.match(lastPrompt(), /We searched the live auction \(1 Honda N-Box in the coming auctions\) and chose this one/);
  assert.equal(db.latestDraft(after.itemKey, after.anchorKey).context.importStage, 'offer');
  assert.equal(searches() - was, 1, 'searched once');

  // Their next message, with nothing new in it, is answered without another search.
  conversation(99404, 9404, 'Lio', '0491 570 144', [['IN', 'Thanks, I will have a think.', 2 * MIN]]);
  const next = items.itemFromKey('c:99404');
  assert.notEqual(next.anchorKey, after.anchorKey);
  await drafter.draftFor(next);
  assert.equal(searches() - was, 1, 'no second search');
  assert.ok(!/We searched the live auction/.test(lastPrompt()));
});

// ---- learning -------------------------------------------------------------------------------------

test('a conversation from the Imports list teaches nothing in Imports, and Remember is refused', async () => {
  lead(9405, 'Mai', 'Hi, could you import a Daihatsu Copen for me?', { platform: 'IMPORTS', source: 'Import', conversationId: 99405, phone: '0491 570 145' });
  conversation(99405, 9405, 'Mai', '0491 570 145', [['IN', 'Hi, could you import a Daihatsu Copen for me?', 20 * MIN]], 'IMPORTS');
  assert.deepEqual([(await get('/api/items/c:99405')).item.section, (await get('/api/items/c:99405')).item.teaches], ['importquery', false]);
  const d = await drafter.draftFor(items.itemFromKey('c:99405'), { instruction: 'say we can usually find one within a month' });
  assert.equal(d.status, 'ready');

  const remembered = await post(`/api/drafts/${d.id}/remember`, { scope: 'any' });
  assert.deepEqual([remembered.status, remembered.json.error], [400, "Conversations from the dashboard's Imports list do not teach Wheelman."]);
  const copied = await post(`/api/drafts/${d.id}/copied`, { text: 'Hello Mai, yes, we can usually find one within a month.' });
  assert.deepEqual([copied.json.learned, db.getLearned(d.id)], [false, null]);
  assert.equal((await post(`/api/drafts/${d.id}/rating`, { rating: 'good' })).json.learned, false);
  assert.equal(db.getLearned(d.id), null);
  // The new page offers no Remember for it.
  const shown = (await get('/api/items/c:99405')).item;
  assert.equal(shown.draft.instruction, 'say we can usually find one within a month');
  assert.equal(rememberOffer(shown, shown.draft), null);

  // A text moved into Imports from Dashboard teaches there, as before.
  lead(9406, 'Noa', 'Hi, what are your opening hours on Sunday?', { conversationId: 99406, phone: '0491 570 146' });
  conversation(99406, 9406, 'Noa', '0491 570 146', [['IN', 'Hi, what are your opening hours on Sunday?', 15 * MIN]]);
  await post('/api/items/c:99406/move', { section: 'importquery' });
  await settled('c:99406');
  assert.deepEqual([(await get('/api/items/c:99406')).item.section, (await get('/api/items/c:99406')).item.teaches], ['importquery', true]);
});

// ---- written without being asked --------------------------------------------------------------------

test('the background writer writes for Imports texts with the email intake off', async () => {
  const worker = await import('../src/worker.js');
  lead(9407, 'Oli', 'Auction alert for a Subaru XV Hybrid', { platform: 'IMPORTS', source: 'Auction', conversationId: 99407, phone: '0491 570 147' });
  conversation(99407, 9407, 'Oli', '0491 570 147', [['IN', 'Can you find me a Subaru XV Hybrid, 2015, under 120,000 km?', 10 * MIN]], 'IMPORTS');
  await intakeOff(async () => {
    const item = items.itemFromKey('c:99407');
    assert.equal(item.section, 'importquery');
    await worker.draftWaiting({ max: 50 });
  });
  const item = items.itemFromKey('c:99407');
  assert.equal(db.latestDraft(item.itemKey, item.anchorKey)?.status, 'ready', 'written in the background');
});
