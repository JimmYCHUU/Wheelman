// A template change shown on three conversations before it is saved. The preview is the template
// filled in word for word with each conversation's facts, with no AI, inside a store of its own: a
// suggestion written at the same moment keeps the wording in use, and nothing is saved. Nothing
// outside this computer is read in a preview: the auction feed and the website's list answer as
// unreachable, so their figures are blanks. The wording read is the repository's own voice/ files;
// every change here is invented and never saved. Stand-ins play the dashboard, the website, the
// auction and the AI. Every name and number is invented.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyTestEnv } from './support/env.js';
import { startStandins, aiBehaviour } from './support/standins.js';
import { world, rawLead, rawConversation, rawMessage, sydneyDay } from './support/fixtures.js';
import { pointConfigAt } from './support/wire.js';

applyTestEnv({ DAILY_DRAFT_LIMIT: '200', MAIL_INTAKE: '1' });
delete process.env.PROMPT_STYLE;

// The stand-in AI gives a template it is asked to fit back as it is, so a suggestion shows the
// wording it was written from.
const ai = aiBehaviour({ behave: (req) => {
  const fit = String(req.messages?.[1]?.content || '').match(/<<<\n([\s\S]*?)\n>>>/);
  return { reply: fit ? fit[1] : 'Hello {{NAME}},\n\nThank you for your message.', next_step: '', rung: '', facts_used: [], needs_human: [], hold: false };
} });

const now = Date.now();
const MIN = 60e3;
const DAY = 24 * 3600e3;
const invented = world(now);
// Five texts about a car we have at the showroom, the newest a minute ago: newer than anyone else
// in the fixtures' Dashboard. Each asks whether it is still there; Cato is in Brisbane.
const ASKS = [
  [601, ['Arlo', 'Invented', '0491 570 160'], '1159', 'Is the Noah still available?', 1],
  [602, ['Bryn', 'Invented', '0491 570 161'], '1201', 'Is the Hiace still available?', 2],
  [603, ['Cato', 'Invented', '0491 570 162'], '1700', 'Is the Serena still available? I am in Brisbane so I cannot get down to Sydney.', 3],
  [604, ['Dace', 'Invented', '0491 570 163'], '1159', 'Is the Noah still for sale?', 4],
  [605, ['Ezra', 'Invented', '0491 570 164'], '1201', 'Is the Hiace still for sale?', 5],
];
for (const [id, who, stock, ask, mins] of ASKS) {
  const lead = rawLead(id, id, who, now, { stocks: [stock], agoMs: mins * MIN + MIN });
  invented.leads.carbarnau.push(lead);
  invented.conversations.push({ row: rawConversation(id, lead, who, { direction: 'IN', at: now - mins * MIN, body: ask }), messages: [rawMessage(id * 10, id, 'IN', ask, mins * MIN, now)] });
}
// Three customers on the dashboard's Imports list with no order: listed in Imports, as texts. Gus
// filled in the auction alert form and gave a target bid; Hal and Ivo only named the car.
const GUS_FORM = 'Auction alert request — notify when a matching vehicle enters the Japan auction feed.\n\nMake: Subaru\nModel: XV Hybrid\nGrade: Not provided\nMax odometer: Not provided\nLanded budget: Not provided\n\nAdditional notes: 2014 or newer please. My target bid is ¥450,000.';
for (const [id, who, type, text, mins] of [
  [611, ['Gus', 'Invented', '0491 570 165'], 'Auction', GUS_FORM, 10],
  [612, ['Hal', 'Invented', '0491 570 166'], 'Import', 'Hi, could you import a Honda N-Box for me?', 12],
  [613, ['Ivo', 'Invented', '0491 570 167'], 'Import', 'Could you find me a Daihatsu Copen from Japan?', 14],
]) {
  invented.leads.IMPORTS.push(rawLead(id, null, who, now, { platform: 'IMPORTS', source: type, agoMs: mins * MIN, inquiries: [{ type, subject: type === 'Auction' ? 'Auction alert for Subaru XV Hybrid' : 'Import enquiry', text, agoMs: mins * MIN }] }));
}

let standins, config, db, items, wording, wordingedit, sectiontemplates, ordermessages, eligible, app, base, mailKey;

before(async () => {
  standins = await startStandins({ world: invented, ai });
  ({ config } = await import('../src/config.js'));
  pointConfigAt(config, standins, { port: 0, sessionPath: path.join(os.tmpdir(), `wheelman-playbook-preview-session-${process.pid}.json`) });
  db = await import('../src/db.js');
  items = await import('../src/items.js');
  wording = await import('../src/wording.js');
  wordingedit = await import('../src/wordingedit.js');
  sectiontemplates = await import('../src/sectiontemplates.js');
  ordermessages = await import('../src/ordermessages.js');
  eligible = await import('../src/eligible.js');
  // The website's list, read once outside any preview and kept on this computer.
  try { fs.unlinkSync(config.importQuery.modelsPath); } catch { /* none yet */ }
  assert.equal((await eligible.refreshEligibleModels({ now })).ok, true);
  await (await import('../src/sync.js')).syncAll();
  // Jade wrote to Gmail two minutes ago about importing a Hiace GDH206 and an Audi Q7 4MC, which the
  // website lists as price on request.
  const mail = await import('../src/mail.js');
  mailKey = mail.storeMailThread(mail.validateMailReport({ v: 1, kind: 'mail', thread: { ref: 'thread-f:preview-1' }, subject: 'Importing a Toyota Hiace GDH206',
    messages: [{ ref: 'msg-f:p1', fromEmail: 'jade@example.com', fromName: 'Jade Invented', text: 'Hi, can you import a Toyota Hiace GDH206 for me? Is it eligible, and what would it cost landed? I would also like a price on an Audi Q7 4MC.', at: now - 2 * MIN }] }, { now }), { now }).key;
  app = await (await import('../src/server.js')).startServer();
  base = `http://127.0.0.1:${app.address().port}`;
});

after(async () => {
  if (app) await new Promise((r) => { app.close(r); app.closeAllConnections?.(); });
  await standins?.close();
  try { fs.unlinkSync(config.importQuery.modelsPath); } catch { /* gone */ }
});

const get = async (p) => { const r = await fetch(base + p); return { status: r.status, ...(await r.json()) }; };
const post = async (p, body = {}) => { const r = await fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, ...(await r.json()) }; };
const preview = (name, part, text) => post('/api/playbook/preview', { name, part, text });
const own = (name, part) => wording.fileParts(name).find((p) => p.part === part).text;
const rows = () => db.countRows('playbook_versions');
const DASHBOARD = 'dashboard-messages.md';
const AUCTION = 'auction-messages.md';
const SAID = 'Yes, the {car} is still available.';
const CHANGED = 'Yes, the {car} is here and ready for you today.';

test('a preview shows the changed wording on three conversations where it is offered, newest first', async () => {
  const count = rows();
  const out = await preview(DASHBOARD, 'still_available', own(DASHBOARD, 'still_available').replace(SAID, CHANGED));
  assert.equal(out.status, 200, out.error);
  assert.equal(out.none, undefined);
  assert.deepEqual(out.previews.map((p) => [p.key, p.name, p.section, p.car, p.fits]), [
    ['c:601', 'Arlo Invented', 'dashboard', '2021 Toyota Noah X (8 Seater)', true],
    ['c:602', 'Bryn Invented', 'dashboard', '2020 Toyota Hiace DX', true],
    ['c:603', 'Cato Invented', 'dashboard', '2016 Nissan Serena Highway Star', true],
  ]);
  for (const p of out.previews) {
    // The changed words, filled in with the conversation's own car, and the first name put back.
    assert.ok(p.text.includes(`Yes, the ${p.car} is here and ready for you today.`), p.text);
    assert.ok(!p.text.includes('is still available'), p.text);
    assert.match(p.text, new RegExp(`^Good (morning|afternoon|evening) ${p.name.split(' ')[0]},`), p.text);
    assert.ok(!/\{\{NAME\}\}|\{[a-z_]+\}/.test(p.text), p.text);
  }
  // Each card names the customer and the car as the conversation's row in the list does.
  const listed = (await get('/api/items?section=dashboard&tab=all&limit=1000')).items;
  for (const p of out.previews) {
    const row = listed.find((r) => r.key === p.key);
    assert.deepEqual([p.name, p.car], [row.name, row.car], p.key);
  }
  // Nothing was saved, and the wording in use is the file's.
  assert.equal(rows(), count);
  assert.match((await sectiontemplates.composeSectionTemplate(items.itemFromKey('c:601'), 'still_available')).text, /is still available\./);
});

test('with fewer than three where it fits, the preview fills up from the same section and says they are not offered there', async () => {
  // Isla is the only Dashboard customer with a trade-in; the newest others fill up.
  const text = own(DASHBOARD, 'trade_in').replace('{sign_off}', 'We look forward to seeing it.\n\n{sign_off}');
  const out = await preview(DASHBOARD, 'trade_in', text);
  assert.equal(out.status, 200, out.error);
  assert.deepEqual(out.previews.map((p) => [p.key, p.fits]), [['c:203', true], ['c:601', false], ['c:602', false]]);
  for (const p of out.previews) assert.ok(p.text.includes('We look forward to seeing it.'), p.text);
  assert.equal(out.previews[0].name, 'Isla Moreau');
});

test("a preview's wording never reaches a suggestion written at the same time", async () => {
  const count = rows();
  const stamp = db.versionsStamp();
  const text = own(DASHBOARD, 'still_available').replace(SAID, CHANGED);
  // In this process: Still available is written for Priya while the preview is under way, holding its words.
  const [shown, written] = await Promise.all([
    wordingedit.previewWording({ name: DASHBOARD, part: 'still_available', text }),
    sectiontemplates.composeSectionTemplate(items.itemFromKey('c:201'), 'still_available'),
  ]);
  assert.ok(written.text.includes('is still available.') && !written.text.includes('here and ready'), written.text);
  assert.ok(shown.previews[0].text.includes('is here and ready for you today'));
  // Through the routes: the preview and Priya's suggestion of Still available, started together, twice over.
  const [p1, d1, p2, d2] = await Promise.all([
    preview(DASHBOARD, 'still_available', text),
    post('/api/items/c:201/draft', { message: 'still_available' }),
    preview(DASHBOARD, 'still_available', text),
    post('/api/items/c:201/draft', { message: 'still_available' }),
  ]);
  for (const d of [d1.item.draft, d2.item.draft]) {
    assert.equal(d.status, 'ready', d.error);
    assert.ok(d.reply.includes('Yes, the 2021 Toyota Noah X (8 Seater) is still available.'), d.reply);
    assert.ok(!d.reply.includes('here and ready for you today'), d.reply);
  }
  for (const p of [p1, p2]) {
    assert.equal(p.status, 200, p.error);
    assert.ok(p.previews.every((x) => x.text.includes('is here and ready for you today')));
  }
  // No version row is added, and the Playbook's stamp has not moved.
  assert.equal(rows(), count);
  assert.equal(db.versionsStamp(), stamp);
});

test("a preview reads nothing from outside: the auction and the website's list are not asked", async () => {
  // The list kept on this computer is three days old, so outside a preview it would be read again.
  const file = config.importQuery.modelsPath;
  const kept = JSON.parse(fs.readFileSync(file, 'utf8'));
  fs.writeFileSync(file, JSON.stringify({ ...kept, fetchedAt: now - 3 * DAY }));
  const auction = () => standins.calls.filter((c) => c.path.startsWith('/auc/')).length;
  const site = () => standins.calls.filter((c) => c.path.startsWith('/api/import-eligible')).length;
  const allowance = () => Number(db.getMeta(`import_research:${sydneyDay(Date.now())}`, 0)) || 0;
  // Every request to any stand-in: the dashboard, its media, the website, the auction, the AI and the content engine.
  const anything = () => standins.calls.length + standins.engineSeen.length;
  const [a0, s0, r0, n0] = [auction(), site(), allowance(), anything()];

  // An enquiry message that works out a landed total from the auction at Gus's target bid.
  const estimate = await preview(AUCTION, 'first_estimate', own(AUCTION, 'first_estimate').replace('Thank you for your {car_wanted} enquiry.', 'Thank you for asking us about the {car_wanted}.'));
  assert.equal(estimate.status, 200, estimate.error);
  assert.deepEqual(estimate.previews.map((p) => p.key), ['l:611', 'l:612', 'l:613']);
  const gus = estimate.previews[0];
  assert.ok(gus.text.includes('Thank you for asking us about the Subaru XV Hybrid.'), gus.text);
  assert.ok(gus.text.includes('¥450,000'), gus.text);
  // The auction answers as unreachable: the total is the blank the message would have.
  assert.ok(gus.text.includes('[LANDED TOTAL?]'), gus.text);
  assert.ok(gus.text.includes('[DEPOSIT LINK?]'), gus.text);
  // The other enquiry messages that read the live auction, and an email's template that reads the website's list.
  for (const part of ['lots_coming', 'lot_offer', 'lot_short']) {
    const out = await preview(AUCTION, part, own(AUCTION, part).replace('Hello {{NAME}},', 'Hello {{NAME}}, and thank you,'));
    assert.equal(out.status, 200, `${part}: ${out.error}`);
    assert.ok(out.previews.length === 3 && out.previews.every((p) => p.text.includes('and thank you,')), part);
  }
  const email = await preview('importquery-messages.md', 'eligible_cost', own('importquery-messages.md', 'eligible_cost').replace('Thank you for your enquiry.', 'Thank you for writing to us.'));
  assert.equal(email.status, 200, email.error);
  const jade = email.previews.find((p) => p.key === mailKey);
  assert.ok(jade && jade.fits, JSON.stringify(email.previews.map((p) => p.key)));
  assert.ok(jade.text.includes('Thank you for writing to us.'), jade.text);
  // The figures come from the list kept on this computer.
  assert.ok(jade.text.includes('$57,781') && jade.text.includes('$4,545'), jade.text);
  assert.equal(jade.name, 'Jade Invented');

  assert.equal(auction(), a0, 'the auction feed was not asked');
  assert.equal(site(), s0, "the website's list was not asked");
  assert.equal(allowance(), r0, "a preview does not use the day's allowance of live website requests");
  assert.equal(anything(), n0, 'nothing was asked of any stand-in: no AI, no dashboard, no media');

  // Outside a preview both are read as before: the list again, as it is old, and the auction for Gus's total.
  const fresh = await eligible.refreshEligibleModelsIfStale({ now: Date.now() });
  assert.ok(fresh.ok && fresh.requests > 0, JSON.stringify(fresh));
  assert.ok(site() > s0);
  const real = await ordermessages.composeMessage(ordermessages.enquiryOrder(items.itemFromKey('l:611')), 'first_estimate');
  assert.ok(auction() > a0);
  assert.ok(!real.text.includes('[LANDED TOTAL?]'), real.text);
});

test('an auction message is previewed on three orders, and an enquiry message on three Imports texts', async () => {
  // An order message: on the three newest orders in Auction it is offered to.
  const update = own(AUCTION, 'progress_update').replace('We will keep you updated.', 'We will keep you posted every step of the way.');
  const orders = await preview(AUCTION, 'progress_update', update);
  assert.equal(orders.status, 200, orders.error);
  assert.deepEqual(orders.previews.map((p) => p.key).sort(), ['ao:504', 'ao:505', 'ao:506']);
  const lastAt = (key) => items.itemFromKey(key).orderRow.lastAt;
  const keys = orders.previews.map((p) => p.key);
  assert.deepEqual(keys, [...keys].sort((a, b) => lastAt(b) - lastAt(a)), 'newest first');
  for (const p of orders.previews) {
    assert.equal(p.section, 'auction');
    assert.equal(p.fits, true);
    assert.ok(p.text.includes('We will keep you posted every step of the way.'), p.text);
    assert.ok(p.text.startsWith(`Hello ${p.name.split(' ')[0]},`), p.text);
    assert.ok(p.text.includes('[NEXT STEP?]'), p.text);
  }
  assert.deepEqual(orders.previews.map((p) => p.name).sort(), ['Pia Lindqvist', 'Quin Marsh', 'Rhea Castellano']);
  const orderRowsListed = (await get('/api/items?section=auction&tab=all&limit=1000')).everything;
  for (const p of orders.previews) {
    const row = orderRowsListed.find((r) => r.key === p.key);
    assert.deepEqual([p.name, p.car], [row.name, row.car], p.key);
  }

  // An enquiry message: on the three newest Imports texts, never an email.
  const search = own(AUCTION, 'search_update').replace("We'll keep searching", 'We will keep looking');
  const asks = await preview(AUCTION, 'search_update', search);
  assert.equal(asks.status, 200, asks.error);
  assert.deepEqual(asks.previews.map((p) => [p.key, p.name, p.section, p.car, p.fits]), [
    ['l:611', 'Gus Invented', 'importquery', 'Subaru XV Hybrid', true],
    ['l:612', 'Hal Invented', 'importquery', 'Honda N-Box', true],
    ['l:613', 'Ivo Invented', 'importquery', 'Daihatsu Copen', true],
  ]);
  const importsListed = (await get('/api/items?section=importquery&tab=all&limit=1000')).items;
  for (const p of asks.previews) {
    assert.ok(p.text.includes(`Just an update on your ${p.car}.`), p.text);
    assert.ok(p.text.includes('We will keep looking'), p.text);
    const row = importsListed.find((r) => r.key === p.key);
    assert.deepEqual([p.name, p.car], [row.name, row.car], p.key);
  }
});

test("the auction file's short pieces are previewed in the messages that use them, each on the newest order it is offered to", async () => {
  // Every "where" line, the result line, a car of ours and when it arrives: each changed a little.
  const pieces = own(AUCTION, '')
    .replace(/^(@where_[a-z]+: .*)$/gm, '$1, as of today')
    .replace('@outcome_unknown: we did not win it.', '@outcome_unknown: we did not win it this time.')
    .replace('@alternative: {n}. {title}', '@alternative: Car {n}: {title}')
    .replace('expected to arrive by', 'due to arrive by');
  const out = await preview(AUCTION, '', pieces);
  assert.equal(out.status, 200, out.error);
  assert.equal(out.none, undefined);
  assert.equal(out.previews.length, 3);
  const [update, lost, stock] = out.previews;
  assert.equal(new Set(out.previews.map((p) => p.key)).size, 3, 'three different orders');
  for (const [p, type] of [[update, 'progress_update'], [lost, 'bid_lost'], [stock, 'bid_lost_stock']]) {
    assert.equal(p.section, 'auction');
    assert.equal(p.fits, true, type);
    assert.ok(items.itemFromKey(p.key).order && (await import('../src/orders.js')).messagesFor(items.itemFromKey(p.key).order).includes(type), `${p.key} is offered ${type}`);
    assert.ok(!/\{[a-z_]+\}/.test(p.text), p.text);
  }
  assert.ok(update.text.includes(', as of today.'), update.text);
  assert.match(update.note, /Progress update/);
  assert.match(update.note, /@where_[a-z]+/);
  assert.ok(lost.text.includes('we did not win it this time.'), lost.text);
  assert.match(lost.note, /@outcome_unknown/);
  assert.match(lost.note, /@missed/);
  assert.match(lost.note, /@passed_in/);
  assert.ok(stock.text.includes('Car 1:') && stock.text.includes('due to arrive by'), stock.text);
  assert.match(stock.note, /@alternative/);
  assert.match(stock.note, /@arriving/);
});

test('a block is previewed on three conversations with a car', async () => {
  // The price reply, with what each car's Included list says.
  const price = own('price-reply.md', '').replace('The price includes {inclusions}.', 'Included in the price: {inclusions}.');
  const out = await preview('price-reply.md', '', price);
  assert.equal(out.status, 200, out.error);
  assert.deepEqual(out.previews.map((p) => [p.key, p.car, p.fits]), [
    ['c:601', '2021 Toyota Noah X (8 Seater)', true],
    ['c:602', '2020 Toyota Hiace DX', true],
    ['c:603', '2016 Nissan Serena Highway Star', true],
  ]);
  const included = ['6 months NSW registration, a 5-year extended warranty and 1 year roadside assistance', '6 months NSW registration', '6 months NSW registration'];
  const where = ['onsite', 'onsite', 'online'];
  out.previews.forEach((p, i) => {
    assert.ok(p.text.startsWith(`Included in the price: ${included[i]}. Government charges are extra.`), p.text);
    assert.ok(p.text.includes(`#inspection=${where[i]}`), p.text);
  });

  // The other blocks: the first-reply details and the invitation, with each car's own links.
  const details = await preview('first-reply.md', '', own('first-reply.md', '').replace('Please call or text before visiting.', 'Please call or text us before you visit.'));
  assert.equal(details.status, 200, details.error);
  assert.deepEqual(details.previews.map((p) => p.key), ['c:601', 'c:602', 'c:603']);
  for (const p of details.previews) {
    assert.ok(p.text.includes('Please call or text us before you visit.'), p.text);
    assert.match(p.text, /^Vehicle details:\nhttps?:\/\/\S+/, p.text);
  }
  const invite = await preview('inspection-invite.md', '', own('inspection-invite.md', '').replace("we'll arrange it for you.", 'we will set it up for you.'));
  assert.equal(invite.status, 200, invite.error);
  assert.deepEqual(invite.previews.map((p) => [p.key, p.fits]), [['c:601', true], ['c:602', true], ['c:603', true]]);
  const [arlo, bryn, cato] = invite.previews;
  for (const p of [arlo, bryn]) {
    assert.match(p.text, /^You can book an inspection here:\n\S+#inspection=onsite\nOr let us know your preferred date and time, and we will set it up for you\.\nPlease call or text before visiting\.$/, p.text);
    assert.match(p.note, /@onsite/);
    assert.match(p.note, /@online/);
  }
  assert.match(cato.text, /^You can book an online video inspection \(a live video call on WhatsApp or FaceTime\) here:\n\S+#inspection=online\nOr let us know your preferred date and time, and we will set it up for you\.\nPlease call or text before visiting\.$/, cato.text);
  assert.match(cato.note, /@online/);
  assert.match(cato.note, /@onsite/);

  // The two blocks the enquiry messages hold, on the Imports texts. The first reply to an import
  // enquiry, offered where they have not yet said what they want.
  const askText = own('import-ask.md', '').replace('we can keep the search focused', 'we can focus the search');
  const ask = await preview('import-ask.md', '', askText);
  assert.equal(ask.status, 200, ask.error);
  assert.deepEqual(ask.previews.map((p) => [p.key, p.fits]), [['l:612', true], ['l:613', true], ['l:611', false]]);
  for (const p of ask.previews) {
    assert.ok(p.text.startsWith(`Hello ${p.name.split(' ')[0]}, thank you for your ${p.car} enquiry.`), p.text);
    assert.ok(p.text.includes('we can focus the search'), p.text);
    assert.ok(p.text.includes('📍 136 Frances Street') && !p.text.includes('---'), p.text);
  }
  // The offer of a car found in the live auction: the auction is not read in a preview, so its
  // car and figures are blanks, and the deposit link stays a blank.
  const offer = await preview('auction-offer.md', '', own('auction-offer.md', '').replace('We do not bid blindly.', 'We never bid blindly.'));
  assert.equal(offer.status, 200, offer.error);
  assert.deepEqual(offer.previews.map((p) => p.key), ['l:611', 'l:612', 'l:613']);
  for (const p of offer.previews) {
    assert.ok(p.text.startsWith(`Hello ${p.name.split(' ')[0]},\n\nWe found this ${p.car} in [WHICH AUCTION?].`), p.text);
    assert.ok(p.text.includes('We never bid blindly.'), p.text);
    for (const blank of ['[BID?]', '[LANDED TOTAL?]', '[LINK?]', '[DEPOSIT LINK?]']) assert.ok(p.text.includes(blank), `${blank}: ${p.text}`);
    assert.ok(p.text.includes('approximately AUD [LANDED TOTAL?].\nIt has [KM?] and auction grade [GRADE?].'), p.text);
    assert.ok(!/\{[a-z_]+\}|¥\d|NaN/.test(p.text), p.text);
    assert.match(p.note, /@suggested\b/);
    assert.match(p.note, /@suggested_both/);
    assert.match(p.note, /@own/);
  }
  const signed = `${own(AUCTION, 'lot_offer')}\n\n{lot_title}, {lot_km}: {lot_url}\n\nRegards,\n{sender}`;
  const found = await preview(AUCTION, 'lot_offer', signed);
  assert.equal(found.status, 200, found.error);
  assert.deepEqual(found.previews.map((p) => p.key), ['l:611', 'l:612', 'l:613']);
  for (const p of found.previews) {
    assert.ok(!/\{[a-z_]+\}/.test(p.text), p.text);
    assert.ok(p.text.includes(`[WHICH CAR?], [KM?]: [LINK?]\n\nRegards,\n${config.firstReplySender}\n\n`), p.text);
    assert.ok(p.text.includes('It has [KM?] and auction grade [GRADE?].'), p.text);
  }
});

test('a conversation that cannot be written shows its blanks, and the others are written', async () => {
  // Cato's Serena comes back from the dashboard with its Included list in a shape the price reply
  // cannot read, so writing his price reply fails. Its record is put back afterwards.
  const database = db.openDb();
  const stored = database.prepare("SELECT id, data_json FROM vehicles WHERE stock_no = '1700'").get();
  database.prepare('UPDATE vehicles SET data_json = ? WHERE id = ?').run(JSON.stringify({ ...JSON.parse(stored.data_json), outline: '6 Months NSW Registration' }), stored.id);
  try {
    const out = await preview('price-reply.md', '', own('price-reply.md', '').replace('The price includes {inclusions}.', 'Included in the price: {inclusions}.'));
    assert.equal(out.status, 200, out.error);
    assert.deepEqual(out.previews.map((p) => p.key), ['c:601', 'c:602', 'c:603']);
    const [arlo, bryn, cato] = out.previews;
    for (const p of [arlo, bryn]) {
      assert.ok(p.text.startsWith('Included in the price: 6 months NSW registration'), p.text);
      assert.equal(p.note, undefined);
    }
    assert.ok(cato.text.startsWith('Included in the price: [INCLUSIONS?]. Government charges are extra.'), cato.text);
    assert.ok(cato.text.includes('[INSPECTION INVITE?]') && !/\{|@no_inclusions/.test(cato.text), cato.text);
    assert.equal(cato.note, 'Wheelman could not write this one from its records just now, so its facts are left as blanks.');
    assert.equal(cato.name, 'Cato Invented');
  } finally {
    database.prepare('UPDATE vehicles SET data_json = ? WHERE id = ?').run(stored.data_json, stored.id);
  }
});

test('a preview is refused as a save is, a voice rule has none, and with nothing to show it on it says so', async () => {
  const count = rows();
  const voice = await preview('house-voice.md', 'Length', own('house-voice.md', 'Length'));
  assert.deepEqual([voice.status, voice.error], [400, 'Voice rules have no preview: only the AI can show their effect.']);
  const missing = await preview(DASHBOARD, 'no_such_message', 'Words.');
  assert.deepEqual([missing.status, missing.error], [404, 'That wording is not in the Playbook.']);
  const blank = await preview(AUCTION, 'first_estimate', own(AUCTION, 'first_estimate').replace('[DEPOSIT LINK?]', ''));
  assert.deepEqual([blank.status, blank.error], [400, 'The deposit link stays a blank: keep [DEPOSIT LINK?] in this message.']);
  const fact = await preview(DASHBOARD, 'trade_in', own(DASHBOARD, 'trade_in').replace('{sign_off}', '{colour}\n\n{sign_off}'));
  assert.deepEqual([fact.status, fact.error], [400, '{colour} is not a fact Wheelman fills in here.']);
  // No Facebook chat is read in this test: Marketplace has no conversation yet.
  const empty = await preview('marketplace-messages.md', 'polite_close', own('marketplace-messages.md', 'polite_close'));
  assert.equal(empty.status, 200, empty.error);
  assert.deepEqual(empty, { status: 200, previews: [], none: 'There is no conversation in this section to show it on yet.' });
  // The short pieces go into other messages by code: there is no conversation to show them on alone.
  const pieces = await preview(DASHBOARD, '', own(DASHBOARD, ''));
  assert.equal(pieces.status, 200, pieces.error);
  assert.deepEqual(pieces.previews, []);
  assert.match(pieces.none, /short pieces/);
  const get405 = await get('/api/playbook/preview');
  assert.equal(get405.status, 405);
  assert.equal(rows(), count, 'a preview saves nothing');
});
