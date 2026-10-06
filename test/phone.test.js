// The phone add-on: texts seen on the business phone through Google Messages for web, reported by
// the browser add-on in extension/, kept apart from the dashboard's tables and merged into its
// conversations by phone number. All names and numbers are invented. A stand-in service plays the AI.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { applyTestEnv } from './support/env.js';
import { startStandins, aiBehaviour } from './support/standins.js';

applyTestEnv();

const MIN = 60e3;
const HOUR = 3600e3;
const ADDON = `chrome-extension://${'a'.repeat(32)}`;
let standins, app, base, config, db, items, phone, worker, parse, learn, voicebank, drafter, normalize;
const ai = aiBehaviour({ behave: () => ({ reply: 'Hi {{NAME}},\nYes, it is still available. Would you like to come and see it?', needs_human: [], facts_used: [], hold: false }) });

before(async () => {
  standins = await startStandins({ ai });
  ({ config } = await import('../src/config.js'));
  config.llm.gemini.url = `${standins.base}/chat`;
  config.port = 0;
  db = await import('../src/db.js');
  items = await import('../src/items.js');
  phone = await import('../src/phone.js');
  worker = await import('../src/worker.js');
  parse = await import('../extension/parse.js');
  learn = await import('../src/learn.js');
  voicebank = await import('../src/voicebank.js');
  drafter = await import('../src/drafter.js');
  normalize = await import('../src/normalize.js');
  app = await (await import('../src/server.js')).startServer();
  base = `http://127.0.0.1:${app.address().port}`;
});

after(async () => { await new Promise((r) => { app.close(r); app.closeAllConnections?.(); }); await standins.close(); });

// A POST with whatever origin and headers the test wants (fetch would not let a test set them).
function rawPost(path, body, { origin = ADDON, header = '1', type = 'application/json' } = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const headers = { 'content-type': type, 'content-length': Buffer.byteLength(data) };
    if (origin) headers.origin = origin;
    if (header) headers['x-wheelman-phone'] = header;
    const req = http.request(`${base}${path}`, { method: 'POST', headers }, (res) => {
      let text = '';
      res.on('data', (c) => { text += c; });
      res.on('end', () => { let json = {}; try { json = JSON.parse(text); } catch { /* not json */ } resolve({ status: res.statusCode, body: json }); });
    });
    req.on('error', reject);
    req.end(data);
  });
}
const get = async (p) => (await fetch(base + p)).json();

// One conversation as the add-on reports it, built the way reader.js and parse.js build it.
const thread = (name, snippet, when, { now = Date.now(), ref = null, whenTitle = '', unread = false } = {}) =>
  parse.parseListItem({ ref: ref ?? `r-${name.replace(/\W/g, '')}`, name, snippet, when, whenTitle, unread }, { now });
const report = (threads, seenAt = Date.now()) => ({ v: 1, seenAt, hidden: true, path: '/web/conversations', signedOut: false, found: { listItems: threads.length, parsed: threads.length }, threads });
const store = (threads, now = Date.now()) => phone.storePhoneReport(phone.validateReport(report(threads, now), { now }), { now });
const threadId = (name) => db.listPhoneThreads().find((t) => t.name === name).id;
const rows = (name) => db.getPhoneMessages(threadId(name));

// Dashboard records, as the sync stores them.
let mid = 1;
const now0 = Date.now();
const lead = (id, convId, first, last, phoneNo) => db.upsertLead({ id, conversationId: convId, firstName: first, lastName: last, phone: phoneNo, email: '', source: 'carsales', status: 'NEW', platform: 'CARSALES', state: 'NSW', leadAt: now0 - HOUR, updatedAt: now0 - HOUR, stocks: [], inquiries: [] });
const conv = (id, leadId, phoneNo, name, latestAt) => db.upsertConversation({ id, phone: phoneNo, channel: 'SMS', status: 'OPEN', leadId, customerName: name, latestDirection: 'IN', latestAt, latestBody: 'x' });
const msg = (conversationId, direction, body, at, importedAt = at) => db.upsertMessage({ id: mid++, conversationId, direction, body, sentBy: direction === 'OUT' ? 'Alex STONE' : null, status: 'SENT', mediaType: null, at, importedAt });

// ---- reading the list -------------------------------------------------------------------------------

test('the short times on the Messages list are read as moments, with how precisely they are known', () => {
  // Tuesday 6 October 2026, 2 pm in Sydney (daylight saving has begun: +11).
  const now = Date.UTC(2026, 9, 6, 3, 0, 0);
  const at = (s, title = '') => parse.parseWhen(s, { now, title });
  assert.deepEqual(at('now'), { at: now, precision: 'exact' });
  assert.deepEqual(at('5 min'), { at: now - 5 * MIN, precision: 'minute' });
  assert.deepEqual(at('2 hr'), { at: now - 2 * HOUR, precision: 'hour' });
  assert.deepEqual(at('10:31 AM'), { at: Date.UTC(2026, 9, 5, 23, 31), precision: 'minute' }, 'a clock time earlier than now is today');
  assert.deepEqual(at('3:30 PM'), { at: Date.UTC(2026, 9, 5, 4, 30), precision: 'minute' }, 'a clock time later than now is yesterday');
  assert.deepEqual(at('Yesterday'), { at: Date.UTC(2026, 9, 5, 1, 0), precision: 'day' }, 'midday on that day');
  assert.deepEqual(at('Mon'), { at: Date.UTC(2026, 9, 5, 1, 0), precision: 'day' });
  assert.deepEqual(at('Tue'), { at: Date.UTC(2026, 8, 29, 2, 0), precision: 'day' }, 'the same weekday as today means a week ago (before daylight saving: +10)');
  assert.deepEqual(at('Oct 1'), { at: Date.UTC(2026, 9, 1, 2, 0), precision: 'day' });
  assert.deepEqual(at('1 Oct'), { at: Date.UTC(2026, 9, 1, 2, 0), precision: 'day' });
  assert.deepEqual(at('Dec 25'), { at: Date.UTC(2025, 11, 25, 1, 0), precision: 'day' }, 'a date later than today is last year');
  assert.deepEqual(at('Mon', '6 Oct 2026, 10:31 am'), { at: Date.UTC(2026, 9, 5, 23, 31), precision: 'exact' }, 'a full date in the tooltip wins');
  assert.deepEqual(at('Mon', 'Tuesday, October 6, 2026 at 10:31 AM'), { at: Date.UTC(2026, 9, 5, 23, 31), precision: 'exact' });
  assert.equal(at('whenever'), null);
});

test('the latest-message line is read: who sent it, photos, texts cut short, and what kind of sender it is', () => {
  assert.deepEqual(parse.parseSnippet('You: Yes it is still available'), { direction: 'out', text: 'Yes it is still available', media: null, truncated: false });
  assert.deepEqual(parse.parseSnippet('Is the Hiace still available?'), { direction: 'in', text: 'Is the Hiace still available?', media: null, truncated: false });
  assert.deepEqual(parse.parseSnippet('Hi there, I was wondering whether the van…'), { direction: 'in', text: 'Hi there, I was wondering whether the van', media: null, truncated: true });
  assert.deepEqual(parse.parseSnippet('📷 Photo'), { direction: 'in', text: '', media: 'photo', truncated: false });
  assert.deepEqual(parse.parseSnippet('You: Video'), { direction: 'out', text: '', media: 'attachment', truncated: false });
  for (const [name, kind] of [['+61 491 570 110', 'number'], ['0491 570 110', 'number'], ['(02) 9876 5432', 'number'], ['444', 'shortcode'], ['AUSPOST', 'alpha'], ['CarbarnAU', 'alpha'], ['Dave Plumber', 'contact'], ['Priya', 'contact']]) {
    assert.equal(parse.senderKind(name), kind, name);
  }
  // The add-on's idea of a phone number is the same as Wheelman's.
  for (const s of ['+61 491 570 110', '0491 570 110', '61491570110', '491570110', '444', 'Dave', '+1 415 555 0100']) assert.equal(parse.phoneKey(s), normalize.phoneKey(s), s);
  const t = thread('0491 570 110', 'You: On its way…', '3 min', { now: 1000 * MIN, unread: true });
  assert.deepEqual(t, { ref: 'r-0491570110', name: '0491 570 110', phoneKey: '491570110', kind: 'number', unread: true, latest: { direction: 'out', text: 'On its way', media: null, truncated: true, when: '3 min', at: 997 * MIN, precision: 'minute' } });
});

// ---- taking the report in ---------------------------------------------------------------------------

test('a report is taken only from the add-on, on its own route, with its header', async () => {
  const r = report([thread('0491 570 120', 'Is the Hiace still available?', 'now')]);
  assert.equal((await rawPost('/api/phone/messages', r, { origin: 'https://evil.example' })).status, 403, 'a web page');
  assert.equal((await rawPost('/api/phone/messages', r, { header: '' })).status, 403, 'the add-on without its header');
  assert.equal((await rawPost('/api/phone/messages', r, { type: 'text/plain' })).status, 403, 'not JSON');
  assert.equal((await rawPost('/api/items/c:1/dismiss', {}, {})).status, 403, 'the add-on on any other route');
  assert.equal((await rawPost('/api/phone/messages', { v: 2 }, {})).status, 400, 'not a report');
  config.phone.switchedOn = false;
  assert.equal((await rawPost('/api/phone/messages', r, {})).status, 403, 'switched off in .env');
  config.phone.switchedOn = true;
  const ok = await rawPost('/api/phone/messages', r, {});
  assert.equal(ok.status, 200);
  assert.deepEqual([ok.body.ok, ok.body.stored, ok.body.threads], [true, 1, 1]);
  const status = await get('/api/phone/status');
  assert.ok(status.on && status.lastReportAt > 0 && !status.stale && !status.signedOut && !status.listUnreadable, JSON.stringify(status));
  assert.ok((await get('/api/status')).phone.lastReportAt > 0, 'the page sees it too');
  // The page's own requests are as before.
  assert.equal((await rawPost('/api/items/c:1/dismiss', {}, { origin: `http://127.0.0.1:${app.address().port}`, header: '' })).status, 404);
});

test('a report keeps only what is new: the same list again stores nothing; a new text is timed to now; a text cut short grows', () => {
  const now = Date.now();
  const t1 = thread('0491 570 121', 'Hello, is the Noah available', 'Yesterday', { now });
  const t2 = thread('0491 570 122', 'You: Sure, come by tomorrow', '10 min', { now });
  const t3 = thread('0491 570 123', 'Hi there, I was wondering whether the Hiace with the…', '2 hr', { now });
  let out = store([t1, t2, t3], now);
  assert.deepEqual([out.stored, out.changed, out.threads], [3, 3, 3]);
  out = store([t1, t2, t3], now + 30e3);
  assert.deepEqual([out.stored, out.changed], [0, 0], 'the same list half a minute later');
  assert.deepEqual(rows('0491 570 121').map((m) => [m.direction, m.precision, m.source]), [['IN', 'day', 'list']], 'a text that was already there keeps the rough time the list gives');
  assert.deepEqual(rows('0491 570 122').map((m) => [m.direction, m.at, m.precision]), [['OUT', now - 10 * MIN, 'minute']]);
  assert.deepEqual(rows('0491 570 123').map((m) => [m.text, m.truncated]), [['Hi there, I was wondering whether the Hiace with the', 1]]);

  // A new text arrives: it is timed to when the add-on saw it.
  const t1b = thread('0491 570 121', 'Hello? Anyone there', 'now', { now: now + 60e3 });
  out = store([t1b, t2, t3], now + 60e3);
  assert.deepEqual([out.stored, out.changed], [1, 1]);
  assert.deepEqual(rows('0491 570 121').map((m) => [m.text, m.at, m.precision]).slice(1), [['Hello? Anyone there', now + 60e3, 'exact']]);

  // The list later shows the whole of a text it cut short: the stored copy grows, with no second row.
  out = store([t1b, t2, thread('0491 570 123', 'Hi there, I was wondering whether the Hiace with the high roof is still for sale', '2 hr', { now: now + 90e3 })], now + 90e3);
  assert.deepEqual([out.stored, out.changed], [0, 1]);
  assert.deepEqual(rows('0491 570 123').map((m) => [m.text, m.truncated]), [['Hi there, I was wondering whether the Hiace with the high roof is still for sale', 0]]);

  // Nothing in the report is trusted for the number: it is worked out from the name here.
  const t = db.getPhoneThread(threadId('0491 570 122'));
  assert.deepEqual([t.phone_key, t.kind, t.conversation_id, t.lead_id], ['491570122', 'number', null, null]);
});

// ---- merging with the dashboard ---------------------------------------------------------------------

test('a text the dashboard also has is shown once; one it missed is shown, marked, and answered', async () => {
  const now = Date.now();
  lead(301, 401, 'Priya', 'Raman', '0491570124');
  conv(401, 301, '+61491570124', 'Priya Raman', now - 40 * MIN);
  msg(401, 'OUT', 'Hi Priya, yes the Noah is available. Would you like to come and see it?', now - 50 * MIN);
  msg(401, 'IN', 'Is the Noah still available?', now - 40 * MIN, now - 40 * MIN);
  // The add-on saw the same text 40 seconds after the dashboard imported it.
  store([thread('+61 491 570 124', 'Is the Noah still available?', 'now', { now: now - 40 * MIN + 40e3 })], now - 40 * MIN + 40e3);
  let item = items.itemFromKey('c:401');
  assert.deepEqual(item.timeline.map((e) => [e.key.replace(/\d+/, 'n'), e.who, !!e.phoneOnly]), [['m:n', 'us', false], ['m:n', 'customer', false]], 'the dashboard copy stays; the phone copy is not added');
  assert.deepEqual([item.state, item.anchorKey.replace(/\d+/, 'n')], ['awaiting', 'm:n'], 'waiting on the dashboard message, as before');

  // Then a text the dashboard never got.
  store([thread('+61 491 570 124', 'Can I come Saturday morning?', 'now', { now: now - 5 * MIN })], now - 5 * MIN);
  item = items.itemFromKey('c:401');
  const last = item.timeline[item.timeline.length - 1];
  assert.ok(/^pm:\d+$/.test(last.key), last.key);
  assert.deepEqual([last.who, last.text, last.phoneOnly, last.via, last.at], ['customer', 'Can I come Saturday morning?', true, 'SMS (phone)', now - 5 * MIN]);
  assert.deepEqual([item.state, item.anchorKey, item.autoDraft], ['awaiting', last.key, true]);
  const d = await drafter.draftFor(item);
  assert.equal(d.status, 'ready');
  const shown = (await get('/api/items/c:401')).item;
  assert.deepEqual([shown.thread.at(-1).phone, shown.thread.at(-1).key, !!shown.draft?.reply, shown.phoneOnly], [true, last.key, true, false]);
  assert.equal(shown.thread[0].phone, false);

  // The same words three hours later are a real nudge, not a copy.
  store([thread('+61 491 570 124', 'Can I come Saturday morning?', 'now', { now: now + 3 * HOUR })], now + 3 * HOUR);
  item = items.itemFromKey('c:401');
  assert.equal(item.timeline.filter((e) => e.text === 'Can I come Saturday morning?').length, 2);
});

test('when the phone saw a text before the dashboard did, the dashboard copy takes over the phone key, so the suggestion stays attached', async () => {
  const now = Date.now();
  lead(302, 402, 'Tom', 'Bell', '0491570125');
  conv(402, 302, '+61491570125', 'Tom Bell', now - 30 * MIN);
  msg(402, 'OUT', 'Hi Tom, the Hiace is at the yard.', now - HOUR);
  // The phone saw it first, and a suggestion was written for it.
  store([thread('+61 491 570 125', 'What is your best price?', 'now', { now: now - 30 * MIN })], now - 30 * MIN);
  let item = items.itemFromKey('c:402');
  const anchor = item.anchorKey;
  assert.ok(/^pm:/.test(anchor) && item.timeline.at(-1).phoneOnly);
  assert.equal((await drafter.draftFor(item)).status, 'ready');
  // The dashboard catches up three minutes later.
  msg(402, 'IN', 'What is your best price?', now - 30 * MIN + 20e3, now - 27 * MIN);
  item = items.itemFromKey('c:402');
  const last = item.timeline.at(-1);
  assert.deepEqual([last.key, last.phoneOnly, last.via, item.timeline.length], [anchor, undefined, 'SMS', 2], 'one entry, the dashboard one, under the phone key');
  assert.ok(db.latestDraft('c:402', anchor), 'the suggestion is still there');
});

test('a number the dashboard has never seen is listed as Phone only; codes and sender ids are not customers; a saved contact is', async () => {
  const now = Date.now();
  store([
    thread('0491 570 126', 'Hi, do you have any Hiace vans under 30k?', 'now', { now }),
    thread('444', 'Hi, is the car still available?', 'now', { now }),
    thread('AUSPOST', 'Your parcel arrives Monday.', 'now', { now }),
    thread('Dave Plumber', 'Hi mate, is the Alphard still there?', 'now', { now }),
  ], now);
  const all = items.listItems({ states: ['awaiting', 'other', 'answered'], maxAgeHours: 72 });
  const of = (name) => all.find((i) => i.itemKey === `ph:${threadId(name)}`);
  const number = of('0491 570 126');
  assert.ok(number && number.phoneOnly);
  assert.deepEqual([number.state, number.autoDraft, number.phone, number.channel], ['awaiting', false, '0491 570 126', 'sms']);
  assert.match(number.autoReason, /no customer record/);
  assert.equal(of('444').state, 'other');
  assert.equal(of('AUSPOST').state, 'other');
  assert.match(of('AUSPOST').note, /short code or a sender name/);
  const dave = of('Dave Plumber');
  assert.deepEqual([dave.state, dave.autoDraft, dave.lead.first_name, dave.hasLeadRecord], ['awaiting', false, 'Dave', false], 'a saved contact is waiting under its name, but nothing is written for it unasked either');
  assert.match(dave.autoReason, /only on the phone/);
  assert.equal(learn.canLearnFrom(dave.itemKey), false);

  // On the page: a Phone only row, and the conversation opens.
  const list = await get('/api/items?section=dashboard&tab=waiting&hours=72');
  const row = list.items.find((r) => r.key === number.itemKey);
  assert.ok(row && row.phoneOnly && row.phone === '0491 570 126' && row.unanswered === 1, JSON.stringify(row));
  const other = await get('/api/items?section=dashboard&tab=other&hours=72');
  assert.ok(other.items.some((r) => r.key === of('444').itemKey));
  const shown = (await get(`/api/items/${number.itemKey}`)).item;
  assert.deepEqual([shown.phoneOnly, shown.noLead, shown.thread.length, shown.thread[0].phone, shown.autoDraft], [true, true, 1, true, false]);
  assert.match(shown.autoReason, /no customer record/);
  assert.equal((await drafter.draftFor(number)).status, 'ready', '"Write it now" works');
});

test('a saved contact whose name the dashboard knows merges into that conversation', () => {
  const now = Date.now();
  conv(403, null, '+61491570127', 'Maria Lopes', now - 20 * MIN);
  msg(403, 'OUT', 'Hi Maria, the Vezel is ready to collect.', now - 20 * MIN);
  store([thread('Maria Lopes', 'Great, I will come at 4', 'now', { now: now - MIN })], now - MIN);
  assert.equal(db.getPhoneThread(threadId('Maria Lopes')).conversation_id, 403);
  const item = items.itemFromKey('c:403');
  assert.deepEqual(item.timeline.map((e) => [e.who, !!e.phoneOnly]), [['us', false], ['customer', true]]);
  assert.ok(!items.listItems({ states: ['awaiting', 'other', 'answered'] }).some((i) => i.itemKey === `ph:${threadId('Maria Lopes')}`), 'no Phone only row for it');
});

test('once the dashboard has the number, a Phone only conversation moves under the dashboard key with its marks', async () => {
  const now = Date.now();
  store([thread('0491 570 128', 'Do you deliver to Newcastle?', 'now', { now: now - 10 * MIN })], now - 10 * MIN);
  const key = `ph:${threadId('0491 570 128')}`;
  const item = items.itemFromKey(key);
  assert.equal((await drafter.draftFor(item)).status, 'ready');
  db.dismiss(key, item.anchorKey);
  db.markSeen(key, item.anchorKey);
  // The dashboard catches up with a conversation for the number (its copy of the text, two minutes later).
  conv(404, null, '+61491570128', '0491 570 128', now - 8 * MIN);
  msg(404, 'IN', 'Do you deliver to Newcastle?', now - 10 * MIN, now - 8 * MIN);
  assert.equal(db.rekeyPhoneThreads(), 1);
  assert.equal(db.getPhoneThread(threadId('0491 570 128')).conversation_id, 404);
  const moved = items.itemFromKey(key);
  assert.equal(moved.itemKey, 'c:404', 'the old key leads to the dashboard conversation');
  assert.equal(moved.anchorKey, item.anchorKey, 'the phone saw it first, so the key stays');
  assert.ok(db.latestDraft('c:404', item.anchorKey) && db.isDismissed('c:404', item.anchorKey) && db.isSeen('c:404', item.anchorKey));
  assert.ok(!db.latestDraft(key, item.anchorKey));
  assert.ok(!items.listItems({ states: ['awaiting', 'other', 'answered'] }).some((i) => i.itemKey === key));
});

// ---- never learned from -----------------------------------------------------------------------------

test('a reply sent from the phone counts as sent, after a grace period, and teaches nothing', async () => {
  const now = Date.now();
  lead(303, 405, 'Sam', 'Ortiz', '0491570129');
  conv(405, 303, '+61491570129', 'Sam Ortiz', now - 30 * MIN);
  msg(405, 'IN', 'What is your best price on the Hiace?', now - 30 * MIN);
  const item = items.itemFromKey('c:405');
  assert.equal((await drafter.draftFor(item)).status, 'ready');
  // Someone answered from the phone two minutes ago: too soon to be sure the dashboard will not get it.
  store([thread('+61 491 570 129', 'You: Hi Sam, the best we can do is $32,500 drive away.', 'now', { now: now - 2 * MIN })], now - 2 * MIN);
  let seen = items.itemFromKey('c:405');
  assert.ok(seen.timeline.at(-1).phoneOnly && seen.timeline.at(-1).who === 'us');
  assert.equal(seen.state, 'answered');
  const learnedBefore = db.allLearned().length;
  worker.updateOutcomes();
  assert.equal(db.latestDraft('c:405', item.anchorKey).status, 'ready', 'left open for now');
  // Twenty minutes on, still only on the phone: closed as answered from the phone, nothing learned.
  db.openDb().prepare('UPDATE phone_messages SET at = ? WHERE thread_id = ?').run(now - 20 * MIN, threadId('+61 491 570 129'));
  worker.updateOutcomes();
  const after = db.latestDraft('c:405', item.anchorKey);
  assert.deepEqual([after.status, after.sent_by, after.sent_text], ['answered', 'phone', 'Hi Sam, the best we can do is $32,500 drive away.']);
  assert.equal(db.allLearned().length, learnedBefore);
  assert.throws(() => db.upsertLearned({ itemKey: 'ph:1', draftId: 1, finalText: 'x', source: 'sent' }), /only dashboard/);
  const bank = voicebank.buildVoiceBank({ write: false });
  assert.ok(!bank.examples.some((e) => /32,500/.test(e.reply)), 'the example bank never sees a reply typed on the phone');
  seen = items.itemFromKey('c:405');
  assert.equal(seen.timeline.at(-1).phoneOnly, true);
});
