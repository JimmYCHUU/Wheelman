// Templates fitted to the customer by the AI. A template is the owner's wording with its facts
// filled in by code. Before the AI sees it, every fact, figure, link and blank is replaced by a
// marker; the AI reshapes the words around the markers for this customer, and code puts the facts
// back exactly. A marker lost or invented means the template is used word for word. Every name,
// number and car is invented; stand-ins play the dashboard, the website and the AI.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyTestEnv } from './support/env.js';
import { startStandins, aiBehaviour } from './support/standins.js';
import { world } from './support/fixtures.js';
import { pointConfigAt } from './support/wire.js';

applyTestEnv();

const now = Date.now();
let config, templates, fitter, standins, db, items, sync, app, base;

// The stand-in AI fits the template it is given: it rewords one sentence and keeps every marker
// (keep), loses a marker (lose), or adds a figure of its own (invent).
let fitting = 'keep';
const ai = aiBehaviour({ behave: (req) => {
  const user = req.messages?.[1]?.content || '';
  const m = user.match(/<<<\n([\s\S]*?)\n>>>/);
  let reply = m ? m[1] : 'Hello {{NAME}},\nThank you.';
  if (fitting === 'keep') reply = reply.replace('Thank you for your', 'Many thanks for your');
  if (fitting === 'lose') reply = reply.replace(/\{\{K1\}\}/, 'your car');
  if (fitting === 'invent') reply = reply.replace('\n\n', '\n\nIt can be yours for only $9,999.\n\n');
  // A blank of its own: every blank the message needs is already a marker.
  if (fitting === 'blank') reply = reply.replace('\n\n', '\n\nWe will confirm the date: [DATE?].\n\n');
  // A promise of a time nobody on our side gave: rejected, so the request is made a second time.
  if (fitting === 'promise') reply = m ? reply.replace(/(\{\{K\d+\}\} AUD is due on your \{\{K\d+\}\})/, '$1, and we will book shipping by 3 pm tomorrow') : 'Hello {{NAME}},\n\nThe payment of {{DUE}} AUD is due on your car, and we will book shipping by 3 pm tomorrow.';
  return { reply, next_step: '', rung: '', facts_used: [], needs_human: [], hold: false };
} });

before(async () => {
  standins = await startStandins({ world: world(now), ai });
  ({ config } = await import('../src/config.js'));
  pointConfigAt(config, standins, { port: 0, sessionPath: path.join(os.tmpdir(), `wheelman-templates-session-${process.pid}.json`) });
  templates = await import('../src/templates.js');
  fitter = await import('../src/fitter.js');
  db = await import('../src/db.js');
  items = await import('../src/items.js');
  sync = await import('../src/sync.js');
  // The website's list of models we import, which names the car an enquiry is about.
  const eligible = await import('../src/eligible.js');
  try { fs.unlinkSync(config.importQuery.modelsPath); } catch { /* none yet */ }
  await eligible.refreshEligibleModels({ now });
  await sync.syncVehicles({ force: true });
  await sync.syncAuctionOrders({ now });
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
const asked = () => ai.seen.length;
const lastRequest = () => JSON.stringify(ai.seen[ai.seen.length - 1]?.messages || []);

// ---- the wording file ------------------------------------------------------------------------------

test("a part of a wording file carries its own details: its label and when it fits; the file's short pieces stay the file's", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wheelman-voice-'));
  const was = config.voiceDir;
  config.voiceDir = dir;
  try {
    fs.writeFileSync(path.join(dir, 'sample-messages.md'), [
      '# notes are never read',
      '@greeting: Hello',
      '===== price_question =====',
      '@label: Price question',
      '@fits: price question, their offer',
      '@not: buyer',
      'Hello {{NAME}},',
      '',
      'The price is {price}.',
      '===== polite_close =====',
      '@label: Polite close',
      'Thank you, {{NAME}}.',
    ].join('\n'));
    const t = templates.template('sample-messages.md');
    assert.deepEqual(t.snippets, { greeting: 'Hello' });
    assert.equal(t.sections.price_question, 'Hello {{NAME}},\n\nThe price is {price}.');
    assert.deepEqual(t.meta.price_question, { label: 'Price question', fits: 'price question, their offer', not: 'buyer' });
    assert.deepEqual(t.meta.polite_close, { label: 'Polite close' });
  } finally { config.voiceDir = was; fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---- markers -----------------------------------------------------------------------------------------

const PART = [
  'Hello {{NAME}},',
  '',
  'Thank you for your {car_wanted} enquiry.',
  '',
  'Target auction bid: approx. {target_bid} JPY',
  '',
  '{if_deposit}The refundable deposit is {deposit_amount}. Call us on 0423 840 130 or see https://www.carbarn.com.au/how-importing-works for how it works.',
  '',
  '[DEPOSIT LINK?]',
  '',
  'Regards,',
  '{sender}',
].join('\n');
const VALUES = { car_wanted: 'Subaru XV Hybrid', target_bid: '¥226,000', if_deposit: true, deposit_amount: '$1,650', sender: 'Team Carbarn' };

test('every fact, figure, link, phone number and blank becomes a marker, and comes back exactly', () => {
  const m = fitter.maskTemplate({ part: PART, values: VALUES, tail: 'Vehicle details:\n2015 Subaru XV\n121,000 km' });
  assert.equal(m.text, templates.fillParts(PART, VALUES) + '\n\nVehicle details:\n2015 Subaru XV\n121,000 km');
  for (const fact of ['Subaru XV Hybrid', '226,000', '1,650', '0423 840 130', 'https://', '[DEPOSIT LINK?]', 'Team Carbarn', '121,000']) {
    assert.ok(!m.masked.includes(fact), `"${fact}" reaches the AI`);
  }
  assert.match(m.masked, /^Hello \{\{NAME\}\},\n\nThank you for your \{\{K1\}\} enquiry\./, 'the wording around the facts is kept, the name marker too');
  assert.equal(fitter.unmask(m.masked, m.markers), m.text, 'unmasked, it is the filled template exactly');
});

test('a marker lost, written twice or made up is caught; with an instruction a marker may be left out, never changed', () => {
  const m = fitter.maskTemplate({ part: PART, values: VALUES });
  assert.equal(fitter.checkMarkers(m.masked, m.markers).ok, true);
  const lost = m.masked.replace('{{K2}}', '');
  assert.deepEqual(fitter.checkMarkers(lost, m.markers).missing, ['K2']);
  assert.deepEqual(fitter.checkMarkers(`${m.masked} {{K2}}`, m.markers).doubled, ['K2']);
  assert.deepEqual(fitter.checkMarkers(`${m.masked} {{K99}}`, m.markers).unknown, ['K99']);
  assert.equal(fitter.checkMarkers(lost, m.markers, { optional: true }).ok, true);
  assert.equal(fitter.checkMarkers(`${lost} {{K99}}`, m.markers, { optional: true }).ok, false);
  // A fact the template names twice keeps one marker, and comes back twice.
  const twice = fitter.maskTemplate({ part: 'Your {car}.\n\nWe will look for a {car}.', values: { car: 'Honda N-Box' } });
  assert.equal(twice.masked, 'Your {{K1}}.\n\nWe will look for a {{K1}}.');
  assert.equal(fitter.checkMarkers(twice.masked, twice.markers).ok, true);
  assert.deepEqual(fitter.checkMarkers('Your {{K1}}.', twice.markers).missing, ['K1'], 'once is one short');
});

// ---- an auction message, fitted -----------------------------------------------------------------------

test('an auction message is fitted to the customer by the AI, with every figure put back by code and none sent to it', async () => {
  config.auction.fit = true;
  fitting = 'keep';
  const before = asked();
  const out = await post('/api/items/ao:501/draft', { message: 'first_estimate' });
  assert.equal(out.status, 200);
  const d = out.json.item.draft;
  assert.equal(asked() - before, 1, `one request: ${JSON.stringify(d.checks)}`);
  assert.match(d.reply, /^Hello Nina,\n\nMany thanks for your Subaru XV Hybrid enquiry\./, "the AI's words");
  assert.ok(d.reply.includes('Target auction bid: approx. ¥226,000 JPY'), 'the figures, exactly');
  assert.ok(d.reply.includes('Estimated Landed Total: $10,277 AUD'));
  assert.ok(d.reply.includes('The refundable auction deposit required to start bidding is $1,650 AUD.'));
  const sent = lastRequest();
  // No amount and no name: the car they asked for is context the AI may know (it is told it with the order).
  for (const secret of ['226,000', '10,277', '1,650', 'Nina', 'Halvorsen']) assert.ok(!sent.includes(secret), `"${secret}" reached the AI`);
  assert.equal(d.template, 'first_estimate');
  assert.notEqual(d.provider, 'none');
});

test('a fitting that loses a fact or adds a figure is tried once more, then the template is used word for word', async () => {
  config.auction.fit = true;
  for (const mode of ['lose', 'invent']) {
    fitting = mode;
    const before = asked();
    const out = await post('/api/items/ao:501/draft', { message: 'search_update' });
    const d = out.json.item.draft;
    assert.equal(asked() - before, 2, `${mode}: asked twice`);
    assert.equal(d.provider, 'none', mode);
    assert.ok(d.checks.some((c) => c.code === 'template-word-for-word'), `${mode}: the page says it is word for word`);
    assert.ok(!/9,999|your car/.test(d.reply), `${mode}: nothing of the bad fitting is kept`);
    assert.match(d.reply, /^Hello Nina,/);
  }
  fitting = 'keep';
});

test('each template keeps its own suggestion: going back to one already written asks nothing, and "Car found, short" is not "Car found, full"', async () => {
  config.auction.fit = true;
  fitting = 'keep';
  await post('/api/items/ao:501/draft', { message: 'first_estimate' });
  let out = await post('/api/items/ao:501/draft', { message: 'lot_offer' });
  assert.equal(out.json.item.draft.template, 'lot_offer');
  const offer = out.json.item.draft.reply;
  const before = asked();
  const short = (await get('/api/items/ao:501?message=lot_short')).item;
  assert.equal(short.draft, null, 'the short one has not been written yet');
  const full = (await get('/api/items/ao:501?message=lot_offer')).item;
  assert.equal(full.draft.reply, offer, 'the full one is still there');
  const first = (await get('/api/items/ao:501?message=first_estimate')).item;
  assert.match(first.draft.reply, /Many thanks for your Subaru XV Hybrid enquiry/, 'the first one, as it was fitted');
  assert.equal(asked(), before, 'no request for any of that');
});

test('what you add is put into the same fitting with no new request, as long as the wording around it is the same', async () => {
  config.auction.fit = true;
  fitting = 'keep';
  let out = await post('/api/items/ao:503/draft', { message: 'bid_lost' });
  assert.match(out.json.item.draft.reply, /\[SOLD PRICE\?\]/);
  const before = asked();
  out = await post('/api/items/ao:503/draft', { message: 'bid_lost', instruction: 'we bid 300000, sold for 1.31m' });
  assert.equal(asked(), before, 'no new request');
  const d = out.json.item.draft;
  assert.ok(d.reply.includes('¥300,000') && d.reply.includes('¥1,310,000'), d.reply);
  assert.ok(!d.reply.includes('[SOLD PRICE?]'));
  assert.equal(d.instruction, 'we bid 300000, sold for 1.31m', 'what you added is kept with it');
});

test('with no AI to ask, the message is still written, word for word', async () => {
  config.auction.fit = true;
  ai.down = true;
  try {
    const out = await post('/api/items/ao:501/draft', { message: 'deposit_reminder' });
    const d = out.json.item.draft;
    assert.equal(d.status, 'ready');
    assert.equal(d.provider, 'none');
    assert.match(d.reply, /^Hello Nina,/);
    assert.ok(d.checks.some((c) => c.code === 'template-word-for-word'));
  } finally { ai.down = false; }
});

test('the message that is due is fitted in the background only while the settings say so', async () => {
  const messages = await import('../src/ordermessages.js');
  const drafter = await import('../src/drafter.js');
  config.auction.fit = true;
  config.auction.fitInBackground = false;
  let before = asked();
  await messages.prepareOrders(items.buildOrderItem, { now, fitWith: drafter.draftFor });
  assert.equal(asked(), before, 'switched off: word for word, no request');
  const pia = db.latestDraft('ao:504', items.buildOrderItem(504).anchorKey, 'secured');
  assert.equal(pia.provider, 'none');
  config.auction.fitInBackground = true;
  db.openDb().prepare("DELETE FROM drafts WHERE item_key = 'ao:504'").run();
  before = asked();
  await messages.prepareOrders(items.buildOrderItem, { now, fitWith: drafter.draftFor });
  assert.ok(asked() > before, 'switched on: fitted');
  assert.notEqual(db.latestDraft('ao:504', items.buildOrderItem(504).anchorKey, 'secured').provider, 'none');
});

// ---- found in review --------------------------------------------------------------------------------

test('a second request after a rejected fitting carries no amount and no name either', async () => {
  config.auction.fit = true;
  fitting = 'promise';
  try {
    const before = asked();
    await post('/api/items/ao:505/draft', { message: 'payment_due' });
    assert.equal(asked() - before, 2, 'asked a second time');
    const second = lastRequest();
    for (const secret of ['10,777', 'Quin', 'Marsh']) assert.ok(!second.includes(secret), `"${secret}" reached the AI in the second request`);
  } finally { fitting = 'keep'; }
});

test('a second request for a reply to what an auction customer wrote carries no amount either', async () => {
  fitting = 'promise';
  try {
    const before = asked();
    await post('/api/items/ao:505/paste', { direction: 'in', text: 'How much do I still owe?' });
    assert.equal(asked() - before, 2, 'asked a second time');
    const second = lastRequest();
    for (const secret of ['10,777', 'Quin', 'Marsh']) assert.ok(!second.includes(secret), `"${secret}" reached the AI in the second request`);
  } finally { fitting = 'keep'; }
});

test('the request to fit a message asks for that, not for a reply: no rule against its own thank-you, greeting or blanks', async () => {
  config.auction.fit = true;
  fitting = 'keep';
  // Written earlier in this file: forgotten, so it is fitted afresh.
  db.openDb().prepare("DELETE FROM drafts WHERE item_key = 'ao:501' AND template = 'first_estimate'").run();
  await post('/api/items/ao:501/draft', { message: 'first_estimate' });
  const sent = lastRequest();
  assert.match(sent, /THE MESSAGE TO FIT TO THIS CUSTOMER/);
  for (const clash of ['Do not thank them for an enquiry', 'wrote to us on WhatsApp', 'Open with the greeting for this hour', 'write [DEPOSIT LINK?]', 'Use [DATE?] or [CHECK?]', 'THE CUSTOMER IS WAITING FOR A REPLY TO']) {
    assert.ok(!sent.includes(clash), `the request still says "${clash}"`);
  }
});

test('a blank the AI adds of its own is caught: every blank the message needs is already in it', async () => {
  config.auction.fit = true;
  fitting = 'blank';
  try {
    const before = asked();
    const d = (await post('/api/items/ao:501/draft', { message: 'lots_coming' })).json.item.draft;
    assert.equal(asked() - before, 2);
    assert.ok(!d.reply.includes('[DATE?]'), d.reply);
    assert.ok(d.checks.some((c) => c.code === 'template-word-for-word'));
  } finally { fitting = 'keep'; }
});

test('a message written word for word while the AI was away says so, and is fitted on a later check unless you changed it', async () => {
  const messages = await import('../src/ordermessages.js');
  const drafter = await import('../src/drafter.js');
  config.auction.fit = true;
  config.auction.fitInBackground = true;
  fitting = 'keep';
  const anchor = items.buildOrderItem(504).anchorKey;
  const forget = () => db.openDb().prepare("DELETE FROM drafts WHERE item_key = 'ao:504'").run();
  const prepare = (at = now, extra = {}) => messages.prepareOrders(items.buildOrderItem, { now: at, fitWith: drafter.draftFor, ...extra });

  forget();
  ai.down = true;
  try { await prepare(); } finally { ai.down = false; }
  let d = db.latestDraft('ao:504', anchor, 'secured');
  assert.equal(d.provider, 'none');
  assert.ok(d.checks.some((c) => c.code === 'template-word-for-word' && /not available/.test(c.message)), 'the reason is the AI, not a fact');

  let before = asked();
  await prepare();
  assert.equal(asked(), before, 'too soon: left as it is');
  await prepare(now + 31 * 60e3);
  assert.ok(asked() > before, 'half an hour on: fitted');
  assert.notEqual(db.latestDraft('ao:504', anchor, 'secured').provider, 'none');

  // While the AI is paused (its allowance, or a busy spell), the background writes word for word, to fit later.
  forget();
  before = asked();
  await prepare(now, { aiPaused: true });
  assert.equal(asked(), before, 'nothing asked while paused');
  d = db.latestDraft('ao:504', anchor, 'secured');
  assert.equal(d.context.fitLater, true);
  // One you changed in the meantime is yours: it is not written over.
  db.recordEdit(d.id, 'Hello Pia, your Hiace is secured. I will call you this afternoon.');
  await prepare(now + 31 * 60e3);
  assert.equal(asked(), before, 'changed by you: left alone');
});

test('whatever goes wrong in fitting, the message is still written, word for word', async () => {
  const messages = await import('../src/ordermessages.js');
  const broken = async () => ({ status: 'failed', error: 'something unexpected', checks: [] });
  const d = await messages.draftOrderMessage(items.buildOrderItem(501), { type: 'search_update', fitWith: broken });
  assert.equal(d.status, 'ready');
  assert.equal(d.provider, 'none');
  assert.match(d.reply, /^Hello Nina,/);
});

test("a promise that is the owner's own wording is not flagged as one nobody made", async () => {
  config.auction.fit = true;
  fitting = 'keep';
  db.openDb().prepare("DELETE FROM drafts WHERE item_key = 'ao:501' AND template = 'deposit_reminder'").run();
  const d = (await post('/api/items/ao:501/draft', { message: 'deposit_reminder' })).json.item.draft;
  assert.notEqual(d.provider, 'none');
  assert.ok(!d.checks.some((c) => /Make sure someone will do it/i.test(c.message)), JSON.stringify(d.checks));
});

// ---- enquiries in Auction have the same "Which message?" list ---------------------------------------

test('an enquiry in Auction has "Which message?" too: the messages that fit before an order, the best for where it has got to marked', async () => {
  config.auction.fit = false;
  const HOUR = 3600e3, MIN = 60e3;
  db.upsertLead({ id: 9301, conversationId: null, firstName: 'Ana', lastName: 'Invented', phone: '0491 570 931', email: 'ana@example.com', source: 'Import', status: 'NEW', platform: 'IMPORTS', state: '',
    leadAt: now - HOUR, updatedAt: now - MIN, stocks: [], statusHistory: [],
    inquiries: [{ id: 93010, type: 'Import', subject: 'Import enquiry', text: 'Hi, could you import a Honda N-Box for me? 2019 or newer, under 40,000 km, budget about $16,000.', stockNo: '', at: now - HOUR, status: 'NEW', url: '', leadType: '', staffNotes: [] }] });
  let { item } = await get('/api/items/l:9301');
  assert.equal(item.section, 'auction');
  assert.deepEqual(item.templates.map((t) => t.id), ['first_estimate', 'lot_offer', 'lot_short', 'lots_coming', 'search_update', 'deposit_reminder']);
  assert.deepEqual(item.templates.map((t) => t.label).slice(0, 2), ['Thanks, with estimate and deposit', 'Car found, full']);
  assert.equal(item.templates.find((t) => t.due)?.id, 'lot_offer', 'they said what they want: a car to offer');

  // Picked: written from what the enquiry says. No order yet, so the deposit is a blank, and nothing says they have one.
  const out = await post('/api/items/l:9301/draft', { message: 'first_estimate' });
  const d = out.json.item.draft;
  assert.equal(d.template, 'first_estimate');
  assert.equal(out.json.item.template, 'first_estimate');
  assert.match(d.reply, /^Hello Ana,\n\nThank you for your Honda N-Box enquiry\./);
  assert.ok(d.reply.includes('2019 model or newer'), d.reply);
  assert.ok(d.reply.includes('[DEPOSIT AMOUNT?]'));

  // Picked again: the one already written; the first choice is the reply to what they wrote.
  item = (await get('/api/items/l:9301?message=first_estimate')).item;
  assert.equal(item.draft.id, d.id);
  item = (await get('/api/items/l:9301?message=')).item;
  assert.equal(item.template, '');
  assert.notEqual(item.draft?.id, d.id, 'the reply to what they wrote is its own');

  // A conversation in Dashboard has no list yet.
  const theo = await get('/api/items?section=dashboard&tab=waiting&limit=1');
  if (theo.items[0]) assert.deepEqual((await get(`/api/items/${theo.items[0].key}`)).item.templates, []);
});
