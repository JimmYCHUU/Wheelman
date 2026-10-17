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
  if (fitting === 'invent') reply = reply.replace('Thank you for your', 'For only $9,999, thank you for your');
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
  await sync.syncVehicles({ force: true });
  await sync.syncAuctionOrders({ now });
  app = await (await import('../src/server.js')).startServer();
  base = `http://127.0.0.1:${app.address().port}`;
});

after(async () => {
  await new Promise((r) => { app.close(r); app.closeAllConnections?.(); });
  await standins.close();
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
