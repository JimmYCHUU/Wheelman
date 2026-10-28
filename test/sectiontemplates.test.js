// "Which message?" in every section: Dashboard, Marketplace and Import Query offer the owner's
// templates that fit the conversation (voice/*-messages.md), the best fit first. A template picked
// is filled with this conversation's facts and fitted to the customer by the AI; a Prompt changes
// it the way the owner says. Every name, number and car is invented; stand-ins play the dashboard,
// the website, the content engine and the AI.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyTestEnv } from './support/env.js';
import { startStandins, aiBehaviour } from './support/standins.js';
import { world } from './support/fixtures.js';
import { pointConfigAt } from './support/wire.js';

applyTestEnv({ MAIL_INTAKE: '1', MARKETPLACE_ENABLED: '1', AUCTION_FIT: '1' });

const now = Date.now();
const HOUR = 3600e3;
let standins, config, db, sync, app, base, mailKey;

// The stand-in AI fits the template it is given: it rewords one phrase and keeps every marker. A
// figure in the staff's instruction that the message does not have yet, it puts in a sentence.
const ai = aiBehaviour({ behave: (req) => {
  const user = req.messages?.[1]?.content || '';
  const m = user.match(/<<<\n([\s\S]*?)\n>>>/);
  let reply = m ? m[1].replace('Thank you for your', 'Many thanks for your') : 'Hello {{NAME}},\n\nThank you for your message.';
  const asked = (user.split('=== INSTRUCTION FROM OUR STAFF FOR THIS DRAFT ===')[1] || '').split('\n')[1] || '';
  const extra = [...new Set(asked.match(/\{\{K\d+\}\}/g) || [])].filter((k) => !reply.includes(k));
  if (m && extra.length) reply += `\n\nWe can offer ${extra.join(' and ')}.`;
  return { reply, next_step: '', rung: '', facts_used: [], needs_human: [], hold: false };
} });

before(async () => {
  standins = await startStandins({ world: world(now), ai });
  ({ config } = await import('../src/config.js'));
  pointConfigAt(config, standins, { port: 0, sessionPath: path.join(os.tmpdir(), `wheelman-sectiontemplates-session-${process.pid}.json`) });
  db = await import('../src/db.js');
  sync = await import('../src/sync.js');
  const eligible = await import('../src/eligible.js');
  try { fs.unlinkSync(config.importQuery.modelsPath); } catch { /* none yet */ }
  await eligible.refreshEligibleModels({ now });
  await sync.syncAll();
  await sync.syncMarketplace();
  const mail = await import('../src/mail.js');
  mailKey = mail.storeMailThread(mail.validateMailReport({ v: 1, kind: 'mail', thread: { ref: 'thread-f:templates-1' }, subject: 'Importing a Toyota Hiace GDH206',
    messages: [{ ref: 'msg-f:t1', fromEmail: 'wren@example.com', fromName: 'Wren Invented', text: 'Hi, can you import a Toyota Hiace GDH206 for me? Is it eligible, and what would it cost landed?', at: now - HOUR }] }, { now }), { now }).key;
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
const offered = async (key) => (await get(`/api/items/${key}`)).item.templates;
const lastUser = () => ai.seen[ai.seen.length - 1]?.messages?.[1]?.content || '';

// ---- which templates are offered -----------------------------------------------------------------

test('each section offers the templates that fit the conversation, the best fit first', async () => {
  // A price question about a car at the showroom.
  let list = await offered('c:202');
  assert.equal(list[0].id, 'price_question');
  assert.equal(list[0].best, true);
  assert.ok(list.some((t) => t.id === 'where_and_when'), 'one for any conversation, last');
  assert.ok(!list.some((t) => ['finance', 'their_offer', 'car_sold'].includes(t.id)), list.map((t) => t.id).join(', '));
  // A trade-in; a car that has sold; someone in Brisbane who wants to see the car.
  assert.equal((await offered('c:203'))[0].id, 'trade_in');
  assert.equal((await offered('c:210'))[0].id, 'car_sold');
  list = await offered('c:205');
  assert.ok(list.some((t) => t.id === 'video_inspection') && !list.some((t) => t.id === 'book_inspection'), list.map((t) => t.id).join(', '));
  // A Marketplace chat asking for a better price; an import email about an eligible model.
  assert.equal((await offered('mp:504'))[0].id, 'price_question');
  assert.equal((await offered(mailKey))[0].id, 'eligible_cost');
  // An auction order has its own list.
  assert.deepEqual(await offered('ao:501'), []);
});

// ---- writing from a template ---------------------------------------------------------------------

test('a template picked in Dashboard is written with the facts of this conversation and fitted to the customer', async () => {
  const out = await post('/api/items/c:202/draft', { message: 'price_question' });
  const d = out.json.item.draft;
  assert.equal(d.template, 'price_question');
  assert.equal(out.json.item.template, 'price_question');
  assert.match(d.reply, /Many thanks for your interest in the 2021 Toyota Noah X \(8 Seater\)\./, "the AI's words");
  assert.ok(d.reply.includes('Government charges are extra'), 'your price reply, word for word');
  assert.ok(d.reply.includes('#inspection=onsite'), 'with the booking link');
  assert.notEqual(d.provider, 'none');
});

test('a Prompt changes the template the way you say, its facts kept', async () => {
  const before = ai.seen.length;
  const out = await post('/api/items/c:202/draft', { message: 'price_question', instruction: 'Also say we are open this Sunday.' });
  assert.equal(ai.seen.length - before, 1);
  assert.match(lastUser(), /=== INSTRUCTION FROM OUR STAFF FOR THIS DRAFT ===\nAlso say we are open this Sunday\./);
  assert.match(lastUser(), /THE MESSAGE TO FIT TO THIS CUSTOMER/);
  const d = out.json.item.draft;
  assert.equal(d.template, 'price_question');
  assert.equal(d.instruction, 'Also say we are open this Sunday.');
});

test('a Marketplace message has the shape the team sends: the first reply in three paragraphs with the car\'s figures, no greeting line or sign-off, and links tagged as from Marketplace', async () => {
  // mp:501: "Hi, is this still available?" about the Noah: $28,900, 62,733 km, no auction grade recorded,
  // Included list of 6 months registration and the 5-year warranty.
  const first = (await post('/api/items/mp:501/draft', { message: 'still_available' })).json.item.draft;
  assert.equal(first.reply, "Hi Liam, yes it's still available, $28,900 with 62,733 km.\n\nIt's a Japanese import, km verified against the auction documents, and the price includes 6 months rego and a 5-year warranty.\n\nKeen to see it? Send me your number and I'll give you a call.");
  // mp:504: "Can you do any better?" The figure is a person's; the next step is their number.
  const price = (await post('/api/items/mp:504/draft', { message: 'price_question' })).json.item.draft;
  assert.match(price.reply, /^The lowest we can do on the 2021 Toyota Noah X \(8 Seater\) is \[PRICE\?\]\.\n\nIf that works for you, send us your number/);
  assert.ok(!/Regards|Team Carbarn|^Hello|^Thank you|price includes|#inspection=/.test(price.reply), price.reply);
  // Finance: the form on the car's own page, tagged as coming from Marketplace.
  const finance = (await post('/api/items/mp:504/draft', { message: 'finance' })).json.item.draft;
  assert.ok(finance.reply.includes('/1159?utm_source=marketplace#finance'), finance.reply);
  assert.ok(!/utm_source=facebook/.test(finance.reply), finance.reply);
});

test('an Import Query template answers with the figures our website has for the model', async () => {
  const d = (await post(`/api/items/${mailKey}/draft`, { message: 'eligible_cost' })).json.item.draft;
  assert.match(d.reply, /^Hello Wren,/);
  assert.ok(d.reply.includes('Toyota Hiace'), d.reply);
  assert.ok(d.reply.includes('$57,781') && d.reply.includes('$4,545'), d.reply);
  assert.ok(d.reply.includes('/importing/toyota-hiace-gdh206'));
});

test('a figure typed into a Prompt reaches the AI only as a marker, and comes back exactly as typed', async () => {
  const before = ai.seen.length;
  const d = (await post('/api/items/c:202/draft', { message: 'price_question', instruction: 'Tell them we can offer $27,500 if they come in this week.' })).json.item.draft;
  assert.equal(ai.seen.length - before, 1);
  assert.ok(!lastUser().includes('27,500'), 'the figure is not in the request');
  assert.match(lastUser(), /=== INSTRUCTION FROM OUR STAFF FOR THIS DRAFT ===\nTell them we can offer \{\{K\d+\}\} if they come in this week\./);
  assert.match(d.reply, /We can offer \$27,500\./, d.reply);
  assert.equal(d.instruction, 'Tell them we can offer $27,500 if they come in this week.', 'kept as you typed it');
});

test('in Auction, what you type into the box goes to the AI as well as filling in the facts, its amounts only as markers; the same again asks nothing', async () => {
  const typed = 'we bid 300000, sold for 1.31m, our purchase 2.38m';
  let before = ai.seen.length;
  let d = (await post('/api/items/ao:503/draft', { message: 'bid_lost', instruction: typed })).json.item.draft;
  assert.equal(ai.seen.length - before, 1);
  assert.match(lastUser(), /INSTRUCTION FROM OUR STAFF[\s\S]*we bid \{\{K\d+\}\}, sold for \{\{K\d+\}\}, our purchase \{\{K\d+\}\}/);
  for (const amount of ['300000', '300,000', '1.31m', '1,310,000', '2.38m']) assert.ok(!lastUser().includes(amount), `"${amount}" reaches the AI`);
  assert.ok(d.reply.includes('¥1,310,000'));
  before = ai.seen.length;
  d = (await post('/api/items/ao:503/draft', { message: 'bid_lost', instruction: typed })).json.item.draft;
  assert.equal(ai.seen.length, before, 'Refresh figures with the same words: no new request');
});

// ---- what is never offered, and what is said when a fact is missing ----------------------------------

test('a customer who asked not to be contacted is offered no message, and none is written', async () => {
  assert.deepEqual(await offered('c:207'), []);
  const before = ai.seen.length;
  const out = await post('/api/items/c:207/draft', { message: 'where_and_when' });
  assert.notEqual(out.json.item.draft?.status, 'ready');
  assert.equal(ai.seen.length, before, 'no request');
});

test('an Import Query message about a model we could not find keeps its answer, with blanks to fill in', async () => {
  const mail = await import('../src/mail.js');
  const key = mail.storeMailThread(mail.validateMailReport({ v: 1, kind: 'mail', thread: { ref: 'thread-f:templates-2' }, subject: 'Importing a Holden',
    messages: [{ ref: 'msg-f:t2', fromEmail: 'quill@example.com', fromName: 'Quill Invented', text: 'Can you import a Holden Commodore VF? Is it eligible, and what would it cost landed?', at: now - HOUR }] }, { now }), { now }).key;
  const d = (await post(`/api/items/${key}/draft`, { message: 'eligible_cost' })).json.item.draft;
  assert.ok(d.reply.includes('[MODEL?]') && d.reply.includes('[LANDED COST?]'), d.reply);
  assert.ok(!/:\s*$/m.test(d.reply.replace(/^Hello .*,$/m, '')), `no heading left without its link: ${d.reply}`);
});

test('with no AI to ask, a Dashboard message is written word for word, and the note says how to fit it later', async () => {
  ai.down = true;
  try {
    const d = (await post('/api/items/c:203/draft', { message: 'trade_in' })).json.item.draft;
    assert.equal(d.status, 'ready');
    const note = d.checks.find((c) => c.code === 'template-word-for-word');
    assert.ok(note && !/later check/.test(note.message) && /Rewrite/.test(note.message), note?.message);
  } finally { ai.down = false; }
});

test('the list follows the section a conversation was moved to: a text in Import Query, an email in Auction', async () => {
  const qs = await import('../src/sectiontemplates.js');
  const { template } = await import('../src/templates.js');
  const iq = Object.keys(template('importquery-messages.md').sections);
  assert.equal((await post('/api/items/c:203/move', { section: 'importquery' })).status, 200);
  try {
    // A text in Imports: the enquiry messages it would have had in Auction first, then Imports' own.
    const list = await offered('c:203');
    const { ENQUIRY_MESSAGES } = await import('../src/ordermessages.js');
    assert.deepEqual(list.slice(0, 6).map((t) => t.id), ENQUIRY_MESSAGES);
    assert.ok(list.length > 6 && list.slice(6).every((t) => iq.includes(t.id)), list.map((t) => t.id).join(', '));
  } finally { await post('/api/items/c:203/move', { section: 'dashboard' }); }
  assert.equal((await post(`/api/items/${mailKey}/move`, { section: 'auction' })).status, 200);
  try {
    const list = await offered(mailKey);
    assert.ok(list.some((t) => t.id === 'first_estimate'), list.map((t) => t.id).join(', '));
  } finally { await post(`/api/items/${mailKey}/move`, { section: 'importquery' }); }
  assert.ok(qs.templatesFor);
});

test('a conversation moved to another section is written that section\'s message: an email in Auction, a text in Import Query', async () => {
  // An email moved to Auction: one of Auction's messages, in the email's own format (greeted and signed).
  assert.equal((await post(`/api/items/${mailKey}/move`, { section: 'auction' })).status, 200);
  try {
    const out = await post(`/api/items/${mailKey}/draft`, { message: 'first_estimate' });
    assert.equal(out.json.ok, true, out.json.error);
    const d = out.json.item.draft;
    assert.equal(d.template, 'first_estimate');
    assert.match(d.reply, /^Hello Wren,/);
    assert.ok(d.reply.includes('Hiace'), d.reply);
  } finally { await post(`/api/items/${mailKey}/move`, { section: 'importquery' }); }
  // A text moved to Import Query: Import Query's message, with the website's figures for the model they named.
  assert.equal((await post('/api/items/c:203/move', { section: 'importquery' })).status, 200);
  try {
    const out = await post('/api/items/c:203/draft', { message: 'eligible_cost' });
    assert.equal(out.json.ok, true, out.json.error);
    const d = out.json.item.draft;
    assert.ok(d.reply.includes('Toyota Hiace') && d.reply.includes('$57,781'), d.reply);
    assert.ok(!/Hello Isla/.test(d.reply) || /Regards/.test(d.reply), 'a text is greeted as a text');
  } finally { await post('/api/items/c:203/move', { section: 'dashboard' }); }
});

test('a message shown that no longer fits stays in the list, so the list always says what is in the box', async () => {
  const { item } = await get('/api/items/c:202?message=trade_in');
  assert.equal(item.template, 'trade_in');
  assert.ok(item.templates.some((t) => t.id === 'trade_in' && t.label === 'Trade-in'), item.templates.map((t) => t.id).join(', '));
});

// A conversation built by hand, for the cases the fixtures do not have.
const conversation = (over = {}) => ({
  itemKey: 'c:990', anchorKey: 'm:1', channel: 'sms', section: 'dashboard', state: 'awaiting', hasName: true,
  timeline: [{ who: 'customer', text: over.pendingText || 'Is it still available?', at: now - HOUR }], pendingText: 'Is it still available?',
  lead: { first_name: 'Rhea', last_name: 'Invented', state: 'NSW', signals: {} }, deal: null, isFirstReply: true,
  situation: { primary: 'availability', all: ['availability'] }, vehicles: [], ...over,
});
const car = (over = {}) => ({ title: '2019 Toyota Voxy ZS', stockNo: '1201', price: 24900, odometer: 81000, url: 'https://www.carbarn.com.au/vehicles/toyota/voxy/zrr80/1201', stockIn: 'online', status: 'PUBLISHED', soldStatus: '', outline: ['6 Months NSW Registration'], ...over });

test('a car whose state is unknown is never said to be available, and one being prepared is not said to be at the showroom', async () => {
  const qs = await import('../src/sectiontemplates.js');
  const unknown = conversation({ vehicles: [car({ stockIn: '' })] });
  assert.ok(!qs.templatesFor(unknown).some((t) => t.id === 'still_available'), qs.templatesFor(unknown).map((t) => t.id).join(', '));
  assert.match((await qs.composeSectionTemplate(unknown, 'first_reply', { now })).text, /Thank you for your enquiry about the 2019 Toyota Voxy ZS\./);
  const arrived = conversation({ vehicles: [car({ stockIn: 'arrived', status: 'DRAFT' })] });
  assert.ok(qs.templatesFor(arrived).some((t) => t.id === 'car_on_its_way'));
  const text = (await qs.composeSectionTemplate(arrived, 'car_on_its_way', { now })).text;
  assert.ok(!/at our Lidcombe showroom, being prepared|as soon as it arrives/.test(text), text);
});

test('a message about the car is not offered without one, nor for a sold car; a heading never stands without its link', async () => {
  const qs = await import('../src/sectiontemplates.js');
  const ids = (it) => qs.templatesFor(it).map((t) => t.id);
  const warranty = { primary: 'warranty', all: ['warranty', 'history_kms', 'rego_roadworthy'] };
  assert.ok(!ids(conversation({ situation: warranty })).includes('warranty'), 'no car');
  const sold = ids(conversation({ situation: warranty, vehicles: [car({ soldStatus: 'SOLD' })] }));
  for (const id of ['warranty', 'history', 'registration']) assert.ok(!sold.includes(id), `${id} offered for a sold car`);
  const text = (await qs.composeSectionTemplate(conversation({ vehicles: [car({ url: '' })] }), 'still_available', { now })).text;
  assert.ok(!/Vehicle details:/.test(text), text);
});

test('a text in Import Query that names an eligible model is offered "Ready to search", as an email is', async () => {
  const qs = await import('../src/sectiontemplates.js');
  const text = conversation({
    section: 'importquery', isFirstReply: false, pendingText: 'Yes please, what would it cost landed?',
    situation: { primary: 'import_sourcing', all: ['import_sourcing'] },
    imports: { kind: 'import', forms: [{ kind: 'import', make: 'Toyota', model: 'Hiace', modelCode: 'GDH206', car: 'Toyota Hiace', judged: true }], order: null, judged: 'placed' },
    timeline: [{ who: 'us', text: 'Thank you for your enquiry.', at: now - 2 * HOUR }, { who: 'customer', text: 'Yes please, what would it cost landed?', at: now - HOUR }],
  });
  const ids = qs.templatesFor(text).map((t) => t.id);
  assert.ok(ids.includes('ready_to_search'), ids.join(', '));
  const none = qs.templatesFor({ ...text, imports: { kind: 'import', forms: [], order: null, judged: 'placed' } }).map((t) => t.id);
  assert.ok(!none.includes('ready_to_search'), none.join(', '));
});

test('"Where and when we are open" signs off only on the first message of the day, and gives the hours once', async () => {
  const qs = await import('../src/sectiontemplates.js');
  const later = conversation({ isFirstReply: false, timeline: [{ who: 'us', text: 'Yes, it is available.', at: now - 2 * 60e3 }, { who: 'customer', text: 'Where are you?', at: now - 60e3 }] });
  const text = (await qs.composeSectionTemplate(later, 'where_and_when', { now })).text;
  assert.ok(!text.trim().endsWith(config.firstReplySender), text);
  assert.equal((text.match(/8 AM/g) || []).length, 1, text);
});

test('a template written word for word in Auction keeps where it was written, so it never teaches', async () => {
  const { draftFromTemplate } = await import('../src/templatedraft.js');
  const d = await draftFromTemplate(conversation({ section: 'auction' }), { id: 'x', label: 'X', composed: { text: 'Hello', part: 'Hello', values: {}, tail: '' }, save: false });
  assert.equal(d.context.section, 'auction');
  assert.deepEqual(d.context.situations, ['availability']);
});

// ---- the files ------------------------------------------------------------------------------------

test('every template file reads cleanly: each message has a label, says when it fits, and uses only facts Wheelman fills in', async () => {
  const { checkTemplates } = await import('../src/sectiontemplates.js');
  const problems = checkTemplates();
  assert.deepEqual(problems, []);
});
