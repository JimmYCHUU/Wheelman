// Tests for the Marketplace section, against a stand-in content engine and a stand-in AI service
// running on this computer. All data is invented. Nothing real is contacted.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import { applyTestEnv } from './support/env.js';
import { startStandins, aiBehaviour } from './support/standins.js';

// The dashboard login is left blank: Marketplace must not need it. The model names are the app's
// own defaults, because these tests check which model each kind of customer is given.
applyTestEnv({
  DAILY_DRAFT_LIMIT: '50', DASHBOARD_USERNAME: '', DASHBOARD_PASSWORD: '', MARKETPLACE_ENABLED: '1',
  GEMINI_MODEL: 'gemini-3.8-flash', GEMINI_FALLBACK_MODELS: 'gemini-3.7-flash,gemini-3.5-flash,gemini-3.5-flash-lite',
});

const now = Date.now();
const iso = (minsAgo) => new Date(now - minsAgo * 60e3).toISOString();

// ---- the stand-in content engine and AI (test/support/standins.js), fed from here ----

const chats = new Map(); // id -> { row, messages }
const ai = aiBehaviour({ behave: () => ({ reply: 'Yes, it is still available.', needs_human: [], facts_used: [], hold: false }) });
const aiSeen = ai.seen;         // every request the AI received, parsed
const usedUpModels = ai.usedUp; // models that answer "today's free allowance is used up"

const row = (id, buyer, minsAgo, extra = {}) => ({
  id, device: 'dev-1', device_name: 'Yard phone 1', device_timezone: 'Australia/Sydney',
  thread_id: `thread-secret-${id}`, buyer_name: buyer, kind: 'buyer', thread_name: buyer,
  listing_title: '2021 Toyota Noah X', title: buyer, last_snippet: 'snippet',
  last_message_at: iso(minsAgo), last_inbound_at: iso(minsAgo), last_outbound_at: null, last_direction: 'in',
  unread: true, archived: false, pending_outbound: 0, failed_outbound: 0, listing_price: '$28,900', lead_id: null,
  participants: ['participant-secret-1'],
  car: { post_id: 1, vehicle_id: 1, stock_id: '1159', title: '2021 Toyota Noah X (8 Seater)', price: '$28,900', listing_url: 'https://www.facebook.com/marketplace/item/246813', image: 'https://img.example/secret-photo.jpg', dashboard_url: 'https://dash.example/secret-page' },
  agent: { enabled: true, device_enabled: true, stage: 'opened', state: '', locked: false, lock_reason: '', lock_detail: '', due_at: null,
    lead: { phone: '0400 999 888', phone_confidence: 'high', email: 'buyer@example.com', name: buyer, kinds: [], booking: '', budget: '', trade_in: '', notes: {} } },
  ...extra,
});
const message = (id, direction, source, text, minsAgo, status = direction === 'in' ? '' : 'sent', extra = {}) => ({
  id, direction, source, text, status, sent_via: '', error: '', artifact: '', artifact_url: 'https://img.example/secret-artifact.jpg',
  phone_ts: now - minsAgo * 60e3, sent_at: direction === 'out' ? iso(minsAgo) : null, seen_at: null, created_at: iso(minsAgo),
  has_media: false, mentions: [], attachments: [], ...extra,
});

function seed() {
  // 501: the buyer wrote last
  chats.set(501, { row: row(501, 'Liam Carter', 20), messages: [message(1, 'in', 'phone', 'Hi, is this still available? Thanks, Liam. Call me on 0400 999 888', 20)] });
  // 502: the auto-reply has already answered
  chats.set(502, { row: row(502, 'Mia Chen', 30, { last_direction: 'out', last_outbound_at: iso(29) }), messages: [message(2, 'in', 'phone', 'Is this still available?', 30), message(3, 'out', 'agent', 'Yes it is. When would you like to see it?', 29)] });
  // 503: the reply failed to send, so the buyer is still waiting
  chats.set(503, { row: row(503, 'Noah Patel', 40, { failed_outbound: 1 }), messages: [message(4, 'in', 'phone', 'Can I come and see it on Saturday?', 40), message(5, 'out', 'agent', 'Yes, Saturday works.', 39, 'failed')] });
  // 504: the auto-reply named a price of its own, and the engine noted a budget
  chats.set(504, { row: row(504, 'Ava Jones', 10, { agent: { enabled: true, device_enabled: true, stage: 'qualifying', locked: false, lead: { phone: '', email: '', name: 'Ava Jones', budget: '$20,000', trade_in: '', notes: {}, kinds: [] } } }),
    messages: [message(6, 'in', 'phone', 'What is the price?', 15), message(7, 'out', 'auto', 'It is $25,000 drive away.', 14), message(8, 'in', 'phone', 'Can you do any better?', 10)] });
  // 505: archived, although the buyer wrote last
  chats.set(505, { row: row(505, 'Eli Brown', 50, { archived: true }), messages: [message(9, 'in', 'phone', 'Is it available?', 50)] });
}

let standins, engineSeen, appServer, config;
const listen = (handler) => new Promise((resolve) => { const s = http.createServer(handler); s.listen(0, '127.0.0.1', () => resolve(s)); });

before(async () => {
  seed();
  standins = await startStandins({ world: { now, chats }, ai });
  engineSeen = standins.engineSeen; // every request the engine received: { method, path }
  ({ config } = await import('../src/config.js'));
  config.marketplace.url = `${standins.engineBase}/inbox`;
  config.llm.gemini.url = `${standins.base}/chat`;

  const { upsertVehicle } = await import('../src/db.js');
  const { normalizeVehicle } = await import('../src/normalize.js');
  upsertVehicle(normalizeVehicle({ id: 1, stockNo: '1159', year: '2021', title: '2021 Toyota Noah X (8 Seater)', make: 'TOYOTA', model: 'Noah', modelCode: 'ZRR80G', auPublishPrice: 28900, odometer: 62733, seats: 8, fuel: 'Petrol', transmission: 'Automatic', status: 'PUBLISHED', soldStatus: 'UnSold', stockIn: 'Online', outline: ['6 Months NSW Registration'] }));
});

after(async () => {
  if (appServer) await new Promise((r) => { appServer.close(r); appServer.closeAllConnections?.(); });
  await standins.close();
});

const load = async () => ({
  mp: await import('../src/marketplace.js'),
  sync: await import('../src/sync.js'),
  items: await import('../src/items.js'),
  drafter: await import('../src/drafter.js'),
  db: await import('../src/db.js'),
  learn: await import('../src/learn.js'),
  worker: await import('../src/worker.js'),
});

// ---- read-only -----------------------------------------------------------------------

test('the Marketplace inbox is only ever read: GET, on the allowed addresses', async () => {
  const { sync } = await load();
  engineSeen.length = 0;
  const result = await sync.syncMarketplace();
  assert.equal(result.chatsUpdated, 5);
  assert.ok(engineSeen.length >= 6);
  for (const r of engineSeen) {
    assert.equal(r.method, 'GET');
    assert.match(r.path, /^\/inbox\/conversations(\/\d+)?$/);
  }
});

test('reading is three GET addresses; the one write is the reply address, and only sendReply can use it', async () => {
  const { mp } = await load();
  engineSeen.length = 0;
  for (const path of ['/conversations/501/reply', '/conversations/501/send', '/send', '/conversations/abc', '/conversations/501/../../admin', '/agent/toggle', '']) {
    await assert.rejects(() => mp.get(path), /Blocked/);
  }
  // sendReply refuses before any request leaves: no chat, nothing to say, or too much.
  await assert.rejects(() => mp.sendReply('abc', 'Hello'), /Not a Marketplace chat/);
  await assert.rejects(() => mp.sendReply(0, 'Hello'), /Not a Marketplace chat/);
  await assert.rejects(() => mp.sendReply(501, '   '), /nothing to send/);
  await assert.rejects(() => mp.sendReply(501, 'x'.repeat(2001)), /too long/);
  assert.equal(engineSeen.length, 0, 'no request may leave for a blocked address or an unusable reply');
  // The module can read, and send one reply. It cannot mark read, archive, retry, or touch the auto-reply.
  assert.deepEqual(Object.keys(mp).filter((name) => /post|send|reply|write|update|delete|toggle|archive|read|retry|agent|lock|fetch\b/i.test(name)), ['sendReply']);
  const source = fs.readFileSync(new URL('../src/marketplace.js', import.meta.url), 'utf8');
  assert.equal((source.match(/method:\s*['"](POST|PUT|PATCH|DELETE)['"]/gi) || []).length, 1, 'one write request in the whole module');
  assert.equal((source.match(/method:\s*['"]POST['"]/g) || []).length, 1);
});

test('a redirect from the engine is refused, not followed', async () => {
  const { mp } = await load();
  engineSeen.length = 0;
  await assert.rejects(() => mp.get('/devices'), /could not be reached/);
  assert.deepEqual(engineSeen.map((r) => r.path), ['/inbox/devices']);
});

test('a chat that has not changed is not fetched again', async () => {
  const { sync } = await load();
  engineSeen.length = 0;
  const result = await sync.syncMarketplace();
  assert.equal(result.chatsUpdated, 0);
  assert.deepEqual(engineSeen.map((r) => r.path), ['/inbox/conversations']);
});

test('identifiers, image addresses and captured contact details are not stored', async () => {
  const { db } = await load();
  const d = db.openDb();
  const stored = JSON.stringify([d.prepare('SELECT * FROM mp_conversations').all(), d.prepare('SELECT * FROM mp_messages').all()]);
  for (const secret of ['thread-secret', 'participant-secret', 'secret-photo', 'secret-artifact', 'secret-page', 'buyer@example.com', '0400 999 888 "', 'phone_confidence'])
    assert.ok(!stored.includes(secret), `stored: ${secret}`);
  assert.ok(stored.includes('facebook.com/marketplace/item/246813'), 'the Facebook listing link is kept');
});

// ---- who is waiting ------------------------------------------------------------------

test('a chat is waiting when the buyer wrote last; a failed reply does not count as a reply', async () => {
  const { items } = await load();
  assert.equal(items.itemFromKey('mp:501').state, 'awaiting');
  assert.equal(items.itemFromKey('mp:501').itemKey, 'mp:501');
  assert.equal(items.itemFromKey('mp:501').channel, 'marketplace');
  assert.equal(items.itemFromKey('mp:502').state, 'answered');
  const failed = items.itemFromKey('mp:503');
  assert.equal(failed.state, 'awaiting');
  assert.equal(failed.marketplace.needsPerson, true);
  assert.equal(items.itemFromKey('mp:505').state, 'closed');
  const waiting = items.listItems({ source: 'marketplace', states: ['awaiting'] }).map((i) => i.itemKey);
  assert.deepEqual(waiting, ['mp:503', 'mp:504', 'mp:501'], 'chats that need a person come first, then newest first');
  // The dashboard list never contains Marketplace chats, and the other way round.
  assert.deepEqual(items.listItems({ states: ['awaiting', 'ack', 'closed', 'optout', 'other'] }).map((i) => i.itemKey), []);
  assert.equal(items.itemFromKey('m:501'), null);
  assert.equal(items.itemFromKey('mp:99999'), null);
});

test('the car is matched from the listing, and the auto-reply is labelled', async () => {
  const { items } = await load();
  assert.equal(items.itemFromKey('mp:501').vehicles[0].stockNo, '1159');
  const answered = items.itemFromKey('mp:502');
  const ours = answered.timeline.find((e) => e.who === 'us');
  assert.equal(ours.auto, true);
  assert.equal(ours.by, 'Auto-reply');
  assert.match(ours.key, /^fm:\d+$/);
});

// ---- drafting ------------------------------------------------------------------------

test('the buyer\'s name and number never reach the AI service, and the reply is a short chat line', async () => {
  const { items, drafter } = await load();
  aiSeen.length = 0;
  ai.script = [{ reply: 'Hi {{NAME}},\n\nYes, it is still available. Would you like to come and see it?\n\nRegards,\nTeam Carbarn', needs_human: [], facts_used: ['Available now'], hold: false }];
  const d = await drafter.draftFor(items.itemFromKey('mp:501'));
  const sent = JSON.stringify(aiSeen[0]);
  for (const secret of ['Liam', 'Carter', '0400 999 888', '0400999888', 'buyer@example.com', 'thread-secret', 'Yard phone 1'])
    assert.ok(!sent.includes(secret), `leaked: ${secret}`);
  assert.match(aiSeen[0].messages[0].content, /FACEBOOK MARKETPLACE CHAT/);
  assert.match(aiSeen[0].messages[1].content, /CHANNEL: Facebook Marketplace chat/);
  assert.equal(d.status, 'ready');
  assert.equal(d.reply, 'Yes, it is still available. Would you like to come and see it?', 'no greeting line and no sign-off');
  assert.ok(!d.checks.some((c) => c.level === 'fail'), JSON.stringify(d.checks));
});

test('an SMS suggestion still gets its greeting and sign-off', async () => {
  const { finishReply } = await import('../src/checks.js');
  assert.equal(finishReply('Hi {{NAME}},\n\nYes it is.', { first_name: 'Priya' }), 'Hi Priya,\n\nYes it is.\n\nRegards,\nTeam Carbarn');
  assert.equal(finishReply('Hi {{NAME}},\n\nYes it is.', { first_name: 'Priya' }, { signOff: '', chat: true }), 'Yes it is.');
});

test('a price that only the auto-reply or the engine\'s notes mention is not accepted as ours', async () => {
  const { items, drafter } = await load();
  const item = items.itemFromKey('mp:504');
  assert.equal(item.state, 'awaiting');
  aiSeen.length = 0;
  ai.script = [
    { reply: 'As mentioned, it is $25,000 drive away.', needs_human: [], facts_used: [], hold: false },
    { reply: 'We can meet your budget of $20,000.', needs_human: [], facts_used: [], hold: false },
  ];
  const d = await drafter.draftFor(item, { save: false });
  assert.equal(aiSeen.length, 2, 'the first attempt is rejected and tried once more');
  assert.match(aiSeen[0].messages[1].content, /AUTO-REPLY/);
  assert.match(aiSeen[0].messages[1].content, /NOTES FROM THE MARKETPLACE SYSTEM \(UNCONFIRMED\)/);
  assert.ok(d.checks.some((c) => c.level === 'fail' && c.code === 'customer-figure'), JSON.stringify(d.checks));

  // The advertised price from the dashboard is fine.
  ai.script = [{ reply: 'It is $28,900. The best we can do is [PRICE?].', needs_human: [{ marker: '[PRICE?]', reason: 'A person decides discounts.' }], facts_used: [], hold: false }];
  const ok = await drafter.draftFor(item, { save: false });
  assert.ok(!ok.checks.some((c) => c.level === 'fail'), JSON.stringify(ok.checks));
});

test('a long Marketplace reply is flagged, and a price difference with the Facebook listing is pointed out', async () => {
  const { items, drafter, db, sync } = await load();
  chats.get(504).row.car.price = '$27,900';
  chats.get(504).row.last_message_at = iso(9);
  await sync.syncMarketplace();
  ai.script = [{ reply: 'Yes it is available. ' + 'We are open every day and you are welcome to come and see it any time that suits you. '.repeat(3), needs_human: [], facts_used: [], hold: false }];
  const d = await drafter.draftFor(items.itemFromKey('mp:504'), { save: false });
  assert.ok(d.checks.some((c) => c.code === 'long' && /Marketplace chat/.test(c.message)), JSON.stringify(d.checks));
  const note = d.checks.find((c) => c.code === 'listing-price');
  assert.ok(note, JSON.stringify(d.checks));
  assert.match(note.message, /\$27,900.*\$28,900/);
  assert.ok(db.countRows('mp_messages') > 0);
});

test('on Marketplace the booking link and the car\'s page link go in the reply itself, and pass the checks', async () => {
  const { items, drafter } = await load();
  // 503: "Can I come and see it on Saturday?" No standard block follows a Marketplace reply, so
  // the AI is asked to write the booking link itself, and a reply that carries it passes.
  const item = items.itemFromKey('mp:503');
  const url = item.vehicles[0].url;
  assert.ok(url, 'the listing is matched to a car with a page');
  aiSeen.length = 0;
  ai.script = [{ reply: `You are welcome to come and see it on Saturday. Book a time that suits you here:\n${url}#inspection=onsite`, needs_human: [], facts_used: [], hold: false }];
  const d = await drafter.draftFor(item, { save: false });
  assert.equal(aiSeen.length, 1, 'accepted first time');
  const asked = aiSeen[0].messages[1].content;
  assert.match(asked, /=== INSPECTION ===/);
  assert.match(asked, /give this in-person booking link/);
  assert.ok(!/added under your text automatically/.test(asked), 'the AI writes the link itself');
  assert.ok(!/=== STANDARD FIRST REPLY ===/.test(asked));
  assert.match(aiSeen[0].messages[0].content, /Links are given here as they are in a text message/);
  assert.equal(d.status, 'ready');
  assert.ok(d.reply.includes(`${url}#inspection=onsite`), d.reply);
  assert.ok(!d.checks.some((c) => c.level === 'fail'), JSON.stringify(d.checks));
  assert.ok(!d.checks.some((c) => c.code === 'inspection-link'), JSON.stringify(d.checks));

  // A first reply that gives the car's page link: the page is in our records, so it passes too,
  // and the link line does not count towards the length.
  ai.script = [{ reply: `Yes, it is still available.\nMore details:\n${url}\nWould you like to come and see it?`, needs_human: [], facts_used: [], hold: false }];
  const first = await drafter.draftFor(items.itemFromKey('mp:501'), { save: false });
  assert.ok(first.reply.includes(url), first.reply);
  assert.ok(!first.checks.some((c) => c.level === 'fail'), JSON.stringify(first.checks));
  assert.ok(!first.checks.some((c) => c.code === 'long'), JSON.stringify(first.checks));

  // A link that is not in our records is still refused.
  const stray = { reply: 'Book here:\nhttps://example.com/book/123', needs_human: [], facts_used: [], hold: false };
  ai.script = [stray, stray];
  const bad = await drafter.draftFor(items.itemFromKey('mp:501'), { save: false });
  assert.ok(bad.checks.some((c) => c.level === 'fail' && c.code === 'link'), JSON.stringify(bad.checks));
});

// ---- never learned from --------------------------------------------------------------

test('copying a Marketplace suggestion teaches Wheelman nothing and keeps none of the text', async () => {
  const { items, db, learn } = await load();
  const item = items.itemFromKey('mp:501');
  const draft = db.latestDraft(item.itemKey, item.anchorKey);
  assert.ok(draft, 'the suggestion from the earlier test was saved');
  const out = learn.onCopied(item, draft.id, 'Yes mate, still here. Come down any day.');
  assert.equal(out.learned, false);
  assert.equal(db.allLearned().length, 0);
  assert.equal(db.getDraft(draft.id).copied_text, null);
  assert.ok(db.getDraft(draft.id).copied_at > 0);
  assert.equal(learn.learnFrom(item, draft, 'Yes mate, still here. Come down any day.', 'sent').learned, false);
  assert.equal(learn.canLearnFrom('mp:501'), false);
  assert.throws(() => db.upsertLearned({ draftId: draft.id, itemKey: 'mp:501', finalText: 'Yes mate, still here.', source: 'copied' }), /only dashboard/);
  assert.equal(db.allLearned().length, 0);
});

test('the example bank and the outcome tracking never look at Marketplace data', async () => {
  const { db, worker } = await load();
  for (const file of ['voicebank.js', 'examples.js', 'voice.js']) {
    const source = fs.readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');
    assert.ok(!/mp_|marketplace/i.test(source), `${file} must not read Marketplace data`);
  }
  assert.equal(db.draftsAwaitingOutcome().filter((d) => d.item_key.startsWith('mp:')).length, 0);
  assert.equal(worker.updateOutcomes(), 0);
});

// ---- the page's data -----------------------------------------------------------------

test('the page gets two separate sections, each with its own waiting count', async () => {
  const { startServer } = await import('../src/server.js');
  appServer = await startServer();
  const base = `http://127.0.0.1:${appServer.address().port}`;
  const get = async (path) => (await fetch(base + path)).json();

  const market = await get('/api/items?section=marketplace&tab=waiting');
  assert.equal(market.section, 'marketplace');
  assert.ok(market.items.length >= 2);
  assert.ok(market.items.every((i) => i.key.startsWith('mp:') && i.section === 'marketplace'));
  assert.equal(market.sections.marketplace, market.items.length);
  assert.equal(market.sections.dashboard, 0);
  assert.equal(market.items[0].key, 'mp:503');
  assert.equal(market.items[0].needsPerson, true);
  assert.equal(market.items[0].account, 'Yard phone 1');

  const dash = await get('/api/items?tab=waiting');
  assert.equal(dash.section, 'dashboard');
  assert.equal(dash.items.length, 0);
  assert.equal(dash.sections.marketplace, market.items.length);

  const one = await get('/api/items/mp:502');
  assert.equal(one.item.channel, 'marketplace');
  assert.equal(one.item.state, 'answered');
  assert.equal(one.item.marketplace.account, 'Yard phone 1');
  assert.equal(one.item.marketplace.listingUrl, 'https://www.facebook.com/marketplace/item/246813');
  assert.equal(one.item.thread.find((e) => e.who === 'us').auto, true);
  assert.ok(!JSON.stringify(one).includes('thread-secret'));

  // Copy pressed on the page for a Marketplace suggestion: nothing is learned.
  const { db, items } = await load();
  const item = items.itemFromKey('mp:501');
  const draft = db.latestDraft(item.itemKey, item.anchorKey);
  const res = await fetch(`${base}/api/drafts/${draft.id}/copied`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'Some edited text that must not be kept.' }) });
  const copied = await res.json();
  assert.equal(copied.learned, false);
  assert.equal(db.allLearned().length, 0);
  assert.equal(db.getDraft(draft.id).copied_text, null);

  // "Good reply" and "Could be better" on a Marketplace suggestion teach nothing either.
  const tell = (path, body) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
  assert.equal((await tell(`/api/drafts/${draft.id}/rating`, { rating: 'good' })).learned, false);
  assert.equal((await tell(`/api/drafts/${draft.id}/advice`, { note: 'Too long, say the price first' })).learned, false);
  assert.equal(db.allLearned().length, 0);
  assert.equal(db.allAdvice().length, 0);
  assert.throws(() => db.insertAdvice({ draftId: draft.id, itemKey: 'mp:501', note: 'x' }), /only dashboard conversations/);

  // Dismiss works on a Marketplace chat, and only on keys the page is allowed to use.
  const post = (path) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  const closed = items.itemFromKey('mp:505');
  assert.equal((await post('/api/items/mp:505/dismiss')).status, 200);
  assert.equal(db.isDismissed('mp:505', closed.anchorKey), true);
  assert.equal((await post('/api/items/mp:99999/dismiss')).status, 404);
  assert.equal((await post('/api/items/fm:1/dismiss')).status, 404);

  // A dismissed chat is not lost: it is listed under "No reply needed" and can be put back.
  const waitingBefore = (await get('/api/items?section=marketplace&tab=waiting')).items.map((i) => i.key);
  assert.ok(waitingBefore.includes('mp:504'));
  assert.equal((await post('/api/items/mp:504/dismiss')).status, 200);
  const afterDismiss = await get('/api/items?section=marketplace&tab=waiting');
  assert.ok(!afterDismiss.items.some((i) => i.key === 'mp:504'));
  assert.equal(afterDismiss.counts.waiting, waitingBefore.length - 1);
  const quiet = await get('/api/items?section=marketplace&tab=quiet');
  const kept = quiet.items.find((i) => i.key === 'mp:504');
  assert.ok(kept, 'the dismissed chat is listed under No reply needed');
  assert.equal(kept.dismissed, true);
  assert.equal(kept.state, 'awaiting');
  assert.equal(quiet.counts.quiet, quiet.items.length);
  const restored = await (await post('/api/items/mp:504/restore')).json();
  assert.equal(restored.item.dismissed, false);
  assert.deepEqual((await get('/api/items?section=marketplace&tab=waiting')).items.map((i) => i.key), waitingBefore);
  assert.ok(!(await get('/api/items?section=marketplace&tab=quiet')).items.some((i) => i.key === 'mp:504'));
  assert.equal((await post('/api/items/mp:99999/restore')).status, 404);

  // Opening a chat clears its number badge. The chat still waits for a reply.
  const row = async () => (await get('/api/items?section=marketplace&tab=waiting')).items.find((i) => i.key === 'mp:503');
  const unreadBefore = (await row()).unread;
  assert.ok(unreadBefore >= 1);
  // The numbers on the page count waiting chats with new messages, in each section.
  const listBefore = await get('/api/items?section=marketplace&tab=waiting');
  assert.equal(listBefore.unread.marketplace, listBefore.items.filter((i) => i.unread).length);
  assert.equal(listBefore.unread.dashboard, 0);
  assert.equal((await get('/api/items?tab=waiting')).unread.marketplace, listBefore.unread.marketplace, 'the same number is reported from the other section');
  assert.equal((await post('/api/items/mp:503/seen')).status, 200);
  const listAfter = await get('/api/items?section=marketplace&tab=waiting');
  assert.equal(listAfter.unread.marketplace, listBefore.unread.marketplace - 1, 'viewing a chat takes it out of the count');
  assert.equal(listAfter.counts.waiting, listBefore.counts.waiting, 'it is still waiting for a reply');
  const read = await row();
  assert.equal(read.unread, 0);
  assert.equal(read.unanswered, unreadBefore, 'still unanswered, only no longer unread');
  assert.equal(read.state, 'awaiting');
  // A newer customer message would have a different key, so it counts as unread again.
  assert.equal(db.isSeen('mp:503', read.anchor), true);
  assert.equal(db.isSeen('mp:503', 'fm:999999'), false);
  assert.equal((await post('/api/items/mp:99999/seen')).status, 404);
});

// ---- the worker ------------------------------------------------------------------------

test('once a reply appears in the chat, it is no longer waiting', async () => {
  const { items, sync } = await load();
  const c = chats.get(501);
  c.messages.push(message(20, 'out', 'dashboard', 'Yes, still available. Come down any day.', 2));
  Object.assign(c.row, { last_direction: 'out', last_outbound_at: iso(2), last_message_at: iso(2) });
  const result = await sync.syncMarketplace();
  assert.equal(result.chatsUpdated, 1);
  const item = items.itemFromKey('mp:501');
  assert.equal(item.state, 'answered');
  assert.equal(item.timeline.at(-1).by, 'Typed by a person');
});

test('Marketplace has its own allowance, and dashboard customers are drafted first', async () => {
  const { worker, db } = await load();
  const t = Date.now();
  db.upsertLead({ id: 801, conversationId: 901, firstName: 'Priya', lastName: 'Raman', phone: '0400111222', email: 'someone@example.com', source: 'carsales', status: 'FOLLOW_UP', platform: 'CARSALES', state: 'NSW', leadAt: t - 3600e3, updatedAt: t - 3600e3, stocks: ['1159'], inquiries: [] });
  db.upsertConversation({ id: 901, phone: '+61400111222', channel: 'SMS', status: 'OPEN', leadId: 801, customerName: 'Priya Raman', latestDirection: 'IN', latestAt: t - 600e3, latestBody: 'x' });
  db.upsertMessage({ id: 7001, conversationId: 901, direction: 'IN', body: 'Is the Noah still available?', sentBy: null, status: 'SENT', mediaType: null, at: t - 600e3, importedAt: t - 600e3 });

  // With the Marketplace allowance used up, only the dashboard customer gets a suggestion.
  config.marketplace.dailyDrafts = db.mpDraftsLastDay();
  aiSeen.length = 0; ai.script = [];
  assert.equal(await worker.draftWaiting(), 1);
  assert.ok(db.openDb().prepare("SELECT 1 FROM drafts WHERE item_key = 'c:901' AND status = 'ready'").get());
  assert.equal(db.openDb().prepare("SELECT COUNT(*) AS n FROM drafts WHERE item_key = 'mp:503'").get().n, 0);
  assert.deepEqual([...new Set(aiSeen.map((b) => b.model))], ['gemini-3.8-flash'], 'a dashboard customer gets the best model');

  // With allowance, the waiting Marketplace chats are drafted too, by the small model only.
  config.marketplace.dailyDrafts = 60;
  aiSeen.length = 0;
  const made = await worker.draftWaiting();
  assert.equal(made, 2, 'mp:503 and mp:504');
  assert.deepEqual([...new Set(aiSeen.map((b) => b.model))], ['gemini-3.5-flash-lite'], 'the better models are kept for dashboard customers');
  assert.equal(db.openDb().prepare("SELECT COUNT(*) AS n FROM drafts WHERE item_key = 'mp:503' AND status = 'ready'").get().n, 1);
  assert.equal(await worker.draftWaiting(), 0);
});

test('when the engine cannot be reached, the dashboard side carries on and the status says so', async () => {
  const { worker, db } = await load();
  const t = Date.now();
  const closed = await listen(() => {});
  const port = closed.address().port;
  await new Promise((r) => closed.close(r));
  config.marketplace.url = `http://127.0.0.1:${port}/inbox`;

  const result = await worker.runMarketplaceSync();
  assert.equal(result.ok, false);
  assert.match(result.message, /could not be reached/);

  db.upsertMessage({ id: 7002, conversationId: 901, direction: 'OUT', body: 'Yes, it is available.', sentBy: 'Dana', status: 'SENT', mediaType: null, at: t - 300e3, importedAt: t - 300e3 });
  db.upsertMessage({ id: 7003, conversationId: 901, direction: 'IN', body: 'Great, can I come on Sunday?', sentBy: null, status: 'SENT', mediaType: null, at: t - 200e3, importedAt: t - 200e3 });
  db.upsertConversation({ id: 901, phone: '+61400111222', channel: 'SMS', status: 'OPEN', leadId: 801, customerName: 'Priya Raman', latestDirection: 'IN', latestAt: t - 200e3, latestBody: 'x' });
  ai.script = [];
  assert.equal(await worker.draftWaiting(), 1, 'the dashboard customer is still drafted');

  const status = worker.statusReport();
  assert.equal(status.marketplace.enabled, true);
  assert.equal(status.marketplace.lastSync.ok, false);
  // The dashboard login is not filled in for this test, and Marketplace did not need it.
  assert.ok(status.missing.some((m) => /dashboard/.test(m)));
});

test('when the small model has used up its day, only Marketplace waits: dashboard customers are still written for', async () => {
  const { worker, db, sync } = await load();
  const llm = await import('../src/llm.js');
  const t = Date.now();
  config.marketplace.url = `${standins.engineBase}/inbox`;
  chats.set(506, { row: row(506, 'Zoe Hart', 3), messages: [message(60, 'in', 'phone', 'Is the Noah still for sale?', 3)] });
  await sync.syncMarketplace();
  db.upsertLead({ id: 802, conversationId: 902, firstName: 'Omar', lastName: 'Haddad', phone: '0400111333', email: '', source: 'carsales', status: 'NEW', platform: 'CARSALES', state: 'NSW', leadAt: t - 3600e3, updatedAt: t - 300e3, stocks: ['1159'], inquiries: [] });
  db.upsertConversation({ id: 902, phone: '+61400111333', channel: 'SMS', status: 'OPEN', leadId: 802, customerName: 'Omar Haddad', latestDirection: 'IN', latestAt: t - 300e3, latestBody: 'x' });
  db.upsertMessage({ id: 7010, conversationId: 902, direction: 'IN', body: 'How many seats does the Noah have?', sentBy: null, status: 'SENT', mediaType: null, at: t - 300e3, importedAt: t - 300e3 });

  llm.resetModelState();
  usedUpModels.add('gemini-3.5-flash-lite');
  aiSeen.length = 0; ai.script = [];
  const real = globalThis.setTimeout;
  globalThis.setTimeout = (f, ms, ...a) => real(f, Math.min(ms, 5), ...a); // no real waiting between tries
  try {
    assert.equal(await worker.draftWaiting(), 1, 'the dashboard customer');
    assert.ok(db.openDb().prepare("SELECT 1 FROM drafts WHERE item_key = 'c:902' AND status = 'ready' AND model = 'gemini-3.8-flash'").get());
    const chat = db.openDb().prepare("SELECT status, error FROM drafts WHERE item_key = 'mp:506' ORDER BY id DESC").get();
    assert.equal(chat.status, 'failed');
    assert.match(chat.error, /^The AI models used for Marketplace have used up their allowance for today\. Marketplace suggestions start again by themselves around /);
    assert.deepEqual([...new Set(aiSeen.map((b) => b.model))], ['gemini-3.8-flash', 'gemini-3.5-flash-lite'], 'no better model was asked for the chat');
    assert.ok(worker.state.mpHoldUntil > Date.now() + 50 * 60e3, 'Marketplace waits about an hour');
    assert.ok(worker.state.pausedUntil < Date.now(), 'the dashboard is not paused');
    assert.equal(worker.state.lastDraftError, null, 'nothing red on the page');

    // While Marketplace waits, nothing is asked for it, and a new dashboard message is still answered.
    db.upsertMessage({ id: 7011, conversationId: 902, direction: 'OUT', body: 'It has 8 seats.', sentBy: 'Dana', status: 'SENT', mediaType: null, at: t - 200e3, importedAt: t - 200e3 });
    db.upsertMessage({ id: 7012, conversationId: 902, direction: 'IN', body: 'Thanks. Is it petrol or hybrid?', sentBy: null, status: 'SENT', mediaType: null, at: t - 100e3, importedAt: t - 100e3 });
    db.upsertConversation({ id: 902, phone: '+61400111333', channel: 'SMS', status: 'OPEN', leadId: 802, customerName: 'Omar Haddad', latestDirection: 'IN', latestAt: t - 100e3, latestBody: 'x' });
    aiSeen.length = 0;
    assert.equal(await worker.draftWaiting(), 1);
    assert.ok(aiSeen.every((b) => b.model === 'gemini-3.8-flash'));
  } finally { globalThis.setTimeout = real; usedUpModels.clear(); llm.resetModelState(); worker.state.mpHoldUntil = 0; }
});

// ---- sending ---------------------------------------------------------------------------

const post = (base, path, body = {}) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('Send: the reply goes to the engine\'s reply address, shows in the chat on its way, and the chat leaves Waiting', async () => {
  const { items, db, sync } = await load();
  config.marketplace.url = `${standins.engineBase}/inbox`;
  const base = `http://127.0.0.1:${appServer.address().port}`;
  const get = async (path) => (await fetch(base + path)).json();

  // 506: Zoe Hart, "Is the Noah still for sale?", waiting.
  await sync.syncMarketplace();
  const item = items.itemFromKey('mp:506');
  assert.equal(item.state, 'awaiting');
  const draft = db.latestDraft(item.itemKey, item.anchorKey);
  assert.ok(draft, 'the suggestion from the earlier test');

  // A blank is never sent, and neither is nothing.
  engineSeen.length = 0;
  let res = await post(base, '/api/items/mp:506/send', { text: 'The best we can do is [PRICE?]. Delivery is [DELIVERY COST?].', draftId: draft.id });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /^Fill in the blanks before sending: \[PRICE\?\], \[DELIVERY COST\?\]\.$/);
  res = await post(base, '/api/items/mp:506/send', { text: '   ' });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /nothing to send/);
  assert.equal(engineSeen.length, 0, 'nothing reached the engine');

  // Only a Marketplace chat has a send. A dashboard conversation, a lead, an order, a phone thread,
  // a model reply, a message key or an unknown chat does not.
  for (const key of ['c:901', 'l:801', 'ao:1', 'ph:1', 'tr:1', 'fm:1', 'm:1', 'mp:99999']) {
    assert.equal((await post(base, `/api/items/${key}/send`, { text: 'Hello' })).status, 404, key);
  }
  assert.equal(engineSeen.length, 0);

  // The real thing: exactly the text in the box, to the one address, as JSON.
  const text = 'Yes, it is still here. Would you like to come and see it?';
  res = await post(base, '/api/items/mp:506/send', { text, draftId: draft.id });
  assert.equal(res.status, 200, JSON.stringify(await res.clone().json()));
  const out = await res.json();
  assert.equal(out.ok, true);
  assert.equal(out.queued, false);
  const writes = engineSeen.filter((r) => r.method !== 'GET');
  assert.deepEqual(writes.map((r) => `${r.method} ${r.path}`), ['POST /inbox/conversations/506/reply']);
  assert.deepEqual(JSON.parse(writes[0].body), { text, urls: [] });
  assert.ok(engineSeen.some((r) => r.method === 'GET' && r.path === '/inbox/conversations/506'), 'the chat was read back after sending');

  // On the page: the reply is in the thread, marked as on its way, and the chat is no longer waiting.
  assert.equal(out.item.state, 'answered');
  assert.equal(out.item.marketplace.sending, true);
  const last = out.item.thread[out.item.thread.length - 1];
  assert.equal(last.who, 'us');
  assert.equal(last.text, text);
  assert.equal(last.sending, true);
  assert.equal(last.by, 'Typed by a person');
  assert.equal(last.auto, false);
  // Answered, so no suggestion is shown with it any more: the chat is not waiting on one.
  assert.equal(out.item.draft, null);
  const waiting = await get('/api/items?section=marketplace&tab=waiting');
  assert.ok(!waiting.items.some((i) => i.key === 'mp:506'), 'no longer waiting');
  const all = await get('/api/items?section=marketplace&tab=all');
  const row = all.items.find((i) => i.key === 'mp:506');
  assert.equal(row.state, 'answered');
  assert.equal(row.preview.who, 'us');
  assert.equal(row.preview.text, text);

  // Nothing is learned, and no text is kept beyond the engine's own record of the message.
  assert.equal(db.allLearned().length, 0);
  const kept = db.getDraft(draft.id);
  assert.equal(kept.copied_text, null);
  assert.equal(kept.sent_text, null);
  assert.ok(kept.sent_here_at > 0, 'Send is noted on the suggestion');
  assert.equal(kept.edited_text, text, 'what was in the box is kept with the suggestion, as any edit is');
  assert.equal(db.draftsAwaitingOutcome().some((d) => d.id === draft.id), false);

  // Once the engine's phone has typed it, the next read shows it as sent.
  const c = chats.get(506);
  const m = c.messages[c.messages.length - 1];
  assert.equal(m.status, 'queued');
  assert.equal(m.source, 'dashboard');
  Object.assign(m, { status: 'sent', sent_at: new Date().toISOString() });
  Object.assign(c.row, { pending_outbound: 0, last_message_at: new Date().toISOString() });
  const read = await sync.syncMarketplace();
  assert.equal(read.chatsUpdated, 1);
  const after = items.itemFromKey('mp:506');
  assert.equal(after.state, 'answered');
  assert.equal(after.marketplace.sending, false);
  assert.equal(after.timeline.at(-1).sending, false);
  assert.equal(after.timeline.at(-1).by, 'Typed by a person');
});

test('Send: a refused or unreachable engine changes nothing; an offline phone means queued; a queued auto-reply still keeps the buyer waiting', async () => {
  const { items, sync } = await load();
  const base = `http://127.0.0.1:${appServer.address().port}`;
  chats.set(507, { row: row(507, 'Ivy Lane', 2), messages: [message(70, 'in', 'phone', 'Does it have 8 seats?', 2)] });
  await sync.syncMarketplace();
  assert.equal(items.itemFromKey('mp:507').state, 'awaiting');

  // The engine says no.
  standins.world.engineRefusesSend = true;
  let res = await post(base, '/api/items/mp:507/send', { text: 'Yes, it has 8 seats.' });
  assert.equal(res.status, 502);
  assert.match((await res.json()).error, /did not accept the reply: the phone is offline/);
  standins.world.engineRefusesSend = false;
  assert.equal(items.itemFromKey('mp:507').state, 'awaiting', 'still waiting');
  assert.equal(chats.get(507).messages.length, 1, 'nothing was added to the chat');

  // The engine cannot be reached at all.
  const closed = await listen(() => {});
  const port = closed.address().port;
  await new Promise((r) => closed.close(r));
  config.marketplace.url = `http://127.0.0.1:${port}/inbox`;
  res = await post(base, '/api/items/mp:507/send', { text: 'Yes, it has 8 seats.' });
  assert.equal(res.status, 502);
  assert.match((await res.json()).error, /could not be reached .*so the reply was not sent/);
  config.marketplace.url = `${standins.engineBase}/inbox`;
  assert.equal(items.itemFromKey('mp:507').state, 'awaiting');

  // The engine takes it but its phone is offline: the reply is queued, and the page is told so.
  standins.world.workerOnline = false;
  res = await post(base, '/api/items/mp:507/send', { text: 'Yes, it has 8 seats.' });
  assert.equal(res.status, 200);
  const out = await res.json();
  assert.equal(out.queued, true);
  assert.equal(out.item.state, 'answered');
  assert.equal(out.item.marketplace.sending, true);
  standins.world.workerOnline = true;

  // A queued reply from the engine's own auto-reply is not the same thing: the buyer still waits on it.
  chats.set(508, { row: row(508, 'Theo Park', 3, { last_direction: 'out', pending_outbound: 1, last_outbound_at: iso(1), last_message_at: iso(1) }), messages: [message(80, 'in', 'phone', 'Is it automatic?', 3), message(81, 'out', 'agent', 'Yes, it is automatic.', 1, 'queued')] });
  await sync.syncMarketplace();
  const held = items.itemFromKey('mp:508');
  assert.equal(held.state, 'awaiting', 'a queued auto-reply has not reached the buyer');
  assert.equal(held.marketplace.replyComing, true);
  assert.ok(!held.timeline.some((e) => e.who === 'us'));
});
