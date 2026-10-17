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

// The stand-in AI fits the template it is given: it rewords one phrase and keeps every marker.
const ai = aiBehaviour({ behave: (req) => {
  const user = req.messages?.[1]?.content || '';
  const m = user.match(/<<<\n([\s\S]*?)\n>>>/);
  const reply = m ? m[1].replace('Thank you for your', 'Many thanks for your') : 'Hello {{NAME}},\n\nThank you for your message.';
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

test('a Marketplace template opens with a thank-you, has no greeting or sign-off, and its links say they came from Facebook', async () => {
  const d = (await post('/api/items/mp:504/draft', { message: 'price_question' })).json.item.draft;
  assert.match(d.reply, /^Thank you for your message, Ava\./);
  assert.ok(!/Regards|Team Carbarn/.test(d.reply), d.reply);
  assert.ok(/utm_source=facebook/.test(d.reply), d.reply);
});

test('an Import Query template answers with the figures our website has for the model', async () => {
  const d = (await post(`/api/items/${mailKey}/draft`, { message: 'eligible_cost' })).json.item.draft;
  assert.match(d.reply, /^Hello Wren,/);
  assert.ok(d.reply.includes('Toyota Hiace'), d.reply);
  assert.ok(d.reply.includes('$57,781') && d.reply.includes('$4,545'), d.reply);
  assert.ok(d.reply.includes('/importing/toyota-hiace-gdh206'));
});

test('in Auction, what you type into the box goes to the AI as well as filling in the facts; the same again asks nothing', async () => {
  let before = ai.seen.length;
  let d = (await post('/api/items/ao:503/draft', { message: 'bid_lost', instruction: 'we bid 300000, sold for 1.31m' })).json.item.draft;
  assert.equal(ai.seen.length - before, 1);
  assert.match(lastUser(), /INSTRUCTION FROM OUR STAFF[\s\S]*we bid 300000, sold for 1\.31m/);
  assert.ok(d.reply.includes('¥1,310,000'));
  before = ai.seen.length;
  d = (await post('/api/items/ao:503/draft', { message: 'bid_lost', instruction: 'we bid 300000, sold for 1.31m' })).json.item.draft;
  assert.equal(ai.seen.length, before, 'Refresh figures with the same words: no new request');
});

// ---- the files ------------------------------------------------------------------------------------

test('every template file reads cleanly: each message has a label, says when it fits, and uses only facts Wheelman fills in', async () => {
  const { checkTemplates } = await import('../src/sectiontemplates.js');
  const problems = checkTemplates();
  assert.deepEqual(problems, []);
});
