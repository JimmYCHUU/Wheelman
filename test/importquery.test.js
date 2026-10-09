// The Import Query section: email threads the owner sends from Gmail with the add-on's button,
// taken in on their own route, kept in their own tables, listed under their own section, and
// never learned from. All names and addresses are invented. A stand-in service plays the AI.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { applyTestEnv } from './support/env.js';
import { startStandins, aiBehaviour } from './support/standins.js';

applyTestEnv();

const DAY = 24 * 3600e3;
const ADDON = `chrome-extension://${'a'.repeat(32)}`;
const now = Date.now();
let standins, app, base, config, db, items, mail, mailparse, worker, learn, voicebank;
const ai = aiBehaviour({ behave: () => ({ reply: 'Hi {{NAME}},\nYes, it can be imported.', needs_human: [], facts_used: [], hold: false }) });

before(async () => {
  standins = await startStandins({ ai });
  ({ config } = await import('../src/config.js'));
  config.llm.gemini.url = `${standins.base}/chat`;
  config.port = 0;
  db = await import('../src/db.js');
  items = await import('../src/items.js');
  mail = await import('../src/mail.js');
  mailparse = await import('../extension/mailparse.js');
  worker = await import('../src/worker.js');
  learn = await import('../src/learn.js');
  voicebank = await import('../src/voicebank.js');
  app = await (await import('../src/server.js')).startServer();
  base = `http://127.0.0.1:${app.address().port}`;
});

after(async () => { await new Promise((r) => { app.close(r); app.closeAllConnections?.(); }); await standins.close(); });

// A POST with whatever origin and headers the test wants (fetch would not let a test set them).
function rawPost(path, body, { origin = ADDON, header = 'x-wheelman-mail', value = '1', type = 'application/json' } = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const headers = { 'content-type': type, 'content-length': Buffer.byteLength(data) };
    if (origin) headers.origin = origin;
    if (header) headers[header] = value;
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
const post = (path, body = {}) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

// One thread as the Gmail button reads it off the page: the customer asks, we answer (with the
// quoted history under our reply), the customer writes again but Gmail has that one folded.
const CUSTOMER = { text: 'Priya Raman <priya@example.com>', email: 'priya@example.com' };
const OURS = { text: 'Sales', email: 'Sales@Carbarn.com.au' };
const rawMessage = (n, from, dateTitle, bodyText, extra = {}) => ({
  ref: `msg-f:${n}`, fromText: from.text, fromEmail: from.email, fromName: from.text.includes('<') ? '' : from.text,
  to: [{ text: from === OURS ? CUSTOMER.text : 'info@carbarn.com.au', email: from === OURS ? CUSTOMER.email : 'info@carbarn.com.au' }],
  dateTitle, dateText: dateTitle, bodyText, collapsed: false, attachments: 0, ...extra,
});
const rawThread = () => ({
  threadRef: 'thread-f:k8s0q2v7w1p4z9',
  subject: 'Importing a Toyota Hiace GDH206',
  containers: 3,
  messages: [
    rawMessage(1, CUSTOMER, 'Mon, 5 Oct 2026, 10:31 am', 'Hi,\n\nCan you import a Toyota Hiace GDH206 for me? What would it cost landed?\n\nThanks,\nPriya'),
    rawMessage(2, OURS, 'Mon, 5 Oct 2026, 2:05 pm', 'Hi Priya,\n\nYes, the GDH206 is on our eligible list.\n\nRegards,\nSam Lee\n\nOn Mon, 5 Oct 2026 at 10:31, Priya Raman\n<priya@example.com> wrote:\n> Hi,\n> Can you import a Toyota Hiace GDH206 for me?'),
    rawMessage(3, CUSTOMER, 'Tue, 6 Oct 2026, 9:12 am', '', { collapsed: true }),
  ],
});
const report = (raw = rawThread(), at = now) => mailparse.buildMailReport(raw, { now: at });
const sydney = (ms) => Object.fromEntries(new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', day: 'numeric', month: 'numeric', hour: 'numeric', minute: '2-digit', hour12: false }).formatToParts(new Date(ms)).map((p) => [p.type, p.value]));

// ---- the add-on's parser, in Node ---------------------------------------------------------------

test('the Gmail parser: addresses in three forms, dates, bodies without the quoted history, and the report', () => {
  assert.deepEqual(mailparse.parseAddress('Priya Raman <Priya@Example.com>'), { name: 'Priya Raman', email: 'priya@example.com' });
  assert.deepEqual(mailparse.parseAddress('priya@example.com'), { name: '', email: 'priya@example.com' });
  assert.deepEqual(mailparse.parseAddress('Sales', 'sales@carbarn.com.au'), { name: 'Sales', email: 'sales@carbarn.com.au' });
  assert.deepEqual(mailparse.parseAddress('"Raman, Priya" <priya@example.com>'), { name: 'Raman, Priya', email: 'priya@example.com' });
  assert.deepEqual(mailparse.parseAddress('not an address'), { name: 'not an address', email: '' });

  const body = mailparse.cleanBody('Hi Priya,\r\n\r\nYes it can.   \r\n\r\nRegards,\r\nSam\r\n\r\nOn Mon, 5 Oct 2026 at 10:31, Priya Raman\n<priya@example.com> wrote:\n> Hi,\n> Can you import');
  assert.equal(body.text, 'Hi Priya,\n\nYes it can.\n\nRegards,\nSam');
  assert.equal(body.quotedStripped, true);
  assert.equal(mailparse.cleanBody('Thanks\n\n> earlier\n> lines\n').text, 'Thanks');
  assert.equal(mailparse.cleanBody('Hello\n\n---------- Forwarded message ---------\nFrom: x').text, 'Hello');
  assert.equal(mailparse.cleanBody('Hello\n\nFrom: Sam\nSent: Monday\nTo: Priya').text, 'Hello');
  assert.deepEqual(mailparse.cleanBody('Plain text with no quote.\n\nRegards,\nSam'), { text: 'Plain text with no quote.\n\nRegards,\nSam', quotedStripped: false });

  const at = mailparse.parseMailDate('Mon, 5 Oct 2026, 10:31 am', { now });
  assert.deepEqual([sydney(at).day, sydney(at).month, sydney(at).hour, sydney(at).minute], ['5', '10', '10', '31']);
  assert.equal(mailparse.parseMailDate('yesterday', { now }), null);

  const r = report();
  assert.equal(r.v, 1);
  assert.equal(r.kind, 'mail');
  assert.equal(r.thread.ref, 'thread-f:k8s0q2v7w1p4z9');
  assert.equal(r.subject, 'Importing a Toyota Hiace GDH206');
  assert.equal(r.messages.length, 3);
  assert.deepEqual(r.found, { containers: 3, parsed: 3, collapsed: 1 });
  assert.deepEqual([r.messages[0].fromName, r.messages[0].fromEmail, r.messages[0].to], ['Priya Raman', 'priya@example.com', ['info@carbarn.com.au']]);
  assert.equal(r.messages[1].fromEmail, 'sales@carbarn.com.au', 'addresses are lower-cased');
  assert.ok(!/wrote:/.test(r.messages[1].text) && r.messages[1].quotedStripped, 'the quoted history is cut');
  assert.equal(r.messages[1].text, 'Hi Priya,\n\nYes, the GDH206 is on our eligible list.\n\nRegards,\nSam Lee');
  assert.equal(r.messages[2].collapsed, true);
  assert.ok(r.messages[0].at < r.messages[1].at && r.messages[1].at < r.messages[2].at);

  // The limits are applied before anything is sent: the newest 200 messages, 20,000 characters each.
  const big = rawThread();
  big.messages = Array.from({ length: 201 }, (_, i) => rawMessage(100 + i, CUSTOMER, 'Mon, 5 Oct 2026, 10:31 am', `message ${i} ` + 'x'.repeat(25000)));
  const cut = report(big);
  assert.equal(cut.messages.length, 200);
  assert.equal(cut.messages[0].ref, 'msg-f:101');
  assert.equal(cut.messages[0].text.length, 20000);
});

// ---- taking a thread in ----------------------------------------------------------------------

test('a thread is taken only from the add-on, on its own route, with its own header', async () => {
  const r = report();
  assert.equal((await rawPost('/api/mail/threads', r, { origin: 'https://evil.example' })).status, 403, 'a web page');
  assert.equal((await rawPost('/api/mail/threads', r, { header: '' })).status, 403, 'the add-on without its header');
  assert.equal((await rawPost('/api/mail/threads', r, { header: 'x-wheelman-phone' })).status, 403, "the phone reader's header on the mail route");
  assert.equal((await rawPost('/api/phone/messages', { v: 1, threads: [] }, { header: 'x-wheelman-mail' })).status, 403, 'the mail header on the phone route');
  assert.equal((await rawPost('/api/mail/threads', r, { type: 'text/plain' })).status, 403, 'not JSON');
  assert.equal((await rawPost('/api/items/c:1/dismiss', {}, {})).status, 403, 'the add-on on any other route');
  assert.equal((await rawPost('/api/mail/threads', { v: 1, kind: 'phone', messages: [] }, {})).status, 400, 'not a mail report');
  config.phone.addonId = 'b'.repeat(32);
  assert.equal((await rawPost('/api/mail/threads', r, {})).status, 403, 'another add-on than the one named in .env');
  config.phone.addonId = '';
  config.mail.switchedOn = false;
  assert.equal((await rawPost('/api/mail/threads', r, {})).status, 403, 'switched off in .env');
  config.mail.switchedOn = true;
  const ok = await rawPost('/api/mail/threads', r, {});
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.deepEqual([ok.body.ok, ok.body.key, ok.body.isNew, ok.body.added, ok.body.updated, ok.body.messages, ok.body.collapsed], [true, 'em:1', true, 3, 0, 3, 1]);
  assert.equal((await get('/api/status')).mail.last.key, 'em:1', 'the page sees it');
  // The page's own requests are as before.
  assert.equal((await rawPost('/api/items/c:1/dismiss', {}, { origin: `http://127.0.0.1:${app.address().port}`, header: '' })).status, 404);
});

test('a report is checked: limits, time clamps, which side a sender is on, and what cannot be told apart', () => {
  assert.throws(() => mail.validateMailReport({ v: 1, kind: 'mail', messages: [] }), /no messages/);
  assert.throws(() => mail.validateMailReport({ v: 1, kind: 'mail', messages: [{ text: 'no ref, no sender, no time' }] }), /Expand all/);
  const r = report();
  r.messages[0].at = now + 30 * DAY;        // a time in the future is pulled back to about now
  r.messages[1].at = now - 10 * 365 * DAY;  // ten years back is kept: past threads will be sent in bulk
  r.messages[2].at = now - 30 * 365 * DAY;  // thirty years back is not
  r.subject = 'S'.repeat(400);
  const v = mail.validateMailReport(r, { now });
  assert.ok(v.messages[0].at <= now + 5 * 60e3);
  assert.ok(Math.abs(v.messages[1].at - (now - 10 * 365 * DAY)) < 1000);
  assert.ok(v.messages[2].at >= now - 15 * 365 * DAY);
  assert.equal(v.subject.length, 300);
  assert.deepEqual(v.messages.map((m) => m.direction), ['IN', 'OUT', 'IN']);
  assert.equal(v.found.collapsed, 1);

  // Ours: the domain, any case, and a sub-domain. Not ours: a look-alike, or another domain.
  for (const e of ['sales@carbarn.com.au', 'Sales@CARBARN.com.au', 'x@mail.carbarn.com.au']) assert.equal(mail.isOurs(e), true, e);
  for (const e of ['x@carbarn.com.au.evil.com', 'x@notcarbarn.com.au', 'x@example.com', '', 'carbarn.com.au']) assert.equal(mail.isOurs(e), false, e);
  assert.equal(mail.isOurs('x@example.org', ['example.org']), true, 'the domains are a setting');

  // A message with no time of its own keeps its place: a second before the one after it.
  const t = report();
  t.messages[0].at = null;
  const u = mail.validateMailReport(t, { now });
  assert.equal(u.messages[0].approx, true);
  assert.ok(u.messages[0].at < u.messages[1].at);
  assert.equal(u.messages[1].approx, false);
});

test('a thread sent again adds only what is new; a folded message arriving in full is filled in; no ids still dedupes', () => {
  const again = mail.storeMailThread(mail.validateMailReport(report(), { now }), { now });
  assert.deepEqual([again.isNew, again.added, again.updated, again.messages], [false, 0, 0, 3]);
  assert.equal(db.getMailMessages(1).length, 3);

  // We replied; the thread is sent again with the folded message now shown in full and our new reply.
  const r = rawThread();
  r.messages[2] = rawMessage(3, CUSTOMER, 'Tue, 6 Oct 2026, 9:12 am', 'Great. What deposit do you need?');
  r.messages.push(rawMessage(4, OURS, 'Tue, 6 Oct 2026, 11:40 am', 'Hi Priya,\n\nThe refundable auction deposit for that one is $4,545.\n\nRegards,\nSam Lee'));
  const more = mail.storeMailThread(mail.validateMailReport(report(r), { now }), { now });
  assert.deepEqual([more.added, more.updated, more.messages, more.collapsed], [1, 1, 4, 0]);
  const rows = db.getMailMessages(1);
  assert.equal(rows[2].text, 'Great. What deposit do you need?');
  assert.equal(rows[2].collapsed, 0);
  assert.equal(rows[3].direction, 'OUT');
  const thread = db.getMailThread(1);
  assert.deepEqual([thread.customer_name, thread.customer_email, thread.email_key, thread.last_direction, thread.message_count, thread.collapsed_count], ['Priya Raman', 'priya@example.com', 'priya@example.com', 'OUT', 4, 0]);
  assert.equal(thread.first_at, rows[0].at);
  assert.equal(thread.last_at, rows[3].at);

  // The same thread without Gmail's ids, twice: the sender and the time tell the messages apart.
  const stampBefore = db.oldRowsStamp();
  const noIds = rawThread();
  noIds.threadRef = '';
  noIds.subject = 'A Hiace with no ids';
  for (const m of noIds.messages) m.ref = '';
  noIds.messages[2] = rawMessage(0, CUSTOMER, 'Tue, 6 Oct 2026, 9:12 am', 'Still keen.', { ref: '' });
  const first = mail.storeMailThread(mail.validateMailReport(report(noIds), { now }), { now });
  const second = mail.storeMailThread(mail.validateMailReport(report(noIds), { now }), { now });
  assert.deepEqual([first.isNew, first.added, second.isNew, second.added, second.messages], [true, 3, false, 0, 3]);
  assert.equal(first.key, 'em:2');
  assert.notEqual(db.oldRowsStamp(), stampBefore, 'the older rows are rebuilt when a thread changes');
  // Never shrunk: a shorter text of a message already stored changes nothing.
  const shorter = rawThread();
  shorter.messages[0].bodyText = 'Hi';
  const kept = mail.storeMailThread(mail.validateMailReport(report(shorter), { now }), { now });
  assert.equal(kept.updated, 0);
  assert.ok(db.getMailMessages(1)[0].text.length > 2);
});

// ---- the item and the section ---------------------------------------------------------------

test('a thread is an item of its own kind: waiting when the customer wrote last, answered after our reply, never drafted yet', async () => {
  const two = items.itemFromKey('em:2');
  assert.equal(two.channel, 'email');
  assert.equal(two.state, 'awaiting');
  assert.deepEqual([two.lead.first_name, two.lead.last_name, two.lead.email, two.lead.source], ['Priya', 'Raman', 'priya@example.com', 'Email']);
  assert.equal(two.hasLeadRecord, true);
  assert.equal(two.imports, null);
  assert.equal(two.isNewEnquiry, false);
  assert.ok(two.timeline.every((e) => /^mm:\d+$/.test(e.key) && e.via === 'Email'));
  assert.equal(two.timeline[1].who, 'us');
  assert.equal(two.timeline[1].by, 'Sales');
  assert.equal(two.autoDraft, false);
  assert.match(two.autoReason, /next update/);
  assert.equal(two.mail.subject, 'A Hiace with no ids');

  const one = items.itemFromKey('em:1');
  assert.equal(one.state, 'answered', 'we wrote last');
  assert.equal(one.timeline.at(-1).by, 'Sales');
  assert.equal(items.itemFromKey('em:99'), null);
  assert.equal(items.itemFromKey('mm:1'), null);

  // A long email whose footer says "unsubscribe" is not an opt-out; a short one is.
  const footer = rawThread();
  footer.threadRef = 'thread-f:footer';
  footer.subject = 'Alphard question';
  footer.messages = [rawMessage(50, CUSTOMER, 'Wed, 7 Oct 2026, 8:00 am', 'Hi, is the Alphard AGH30W eligible? ' + 'I would like to know the landed cost and the timeline. '.repeat(4) + '\n\nTo unsubscribe from these emails, click here.')];
  mail.storeMailThread(mail.validateMailReport(report(footer), { now }), { now });
  assert.equal(items.itemFromKey('em:3').state, 'awaiting');
  const stop = rawThread();
  stop.threadRef = 'thread-f:stop';
  stop.subject = 'Unsubscribe';
  stop.messages = [rawMessage(60, CUSTOMER, 'Wed, 7 Oct 2026, 8:05 am', 'Please unsubscribe me.')];
  mail.storeMailThread(mail.validateMailReport(report(stop), { now }), { now });
  assert.equal(items.itemFromKey('em:4').state, 'optout');

  const { item } = await get('/api/items/em:2');
  assert.deepEqual([item.channel, item.section, item.source, item.email, item.teaches, item.mail.subject, item.mail.customerEmail, item.mail.draftsOff], ['email', 'importquery', 'Email', 'priya@example.com', false, 'A Hiace with no ids', 'priya@example.com', true]);
  assert.equal(item.thread[0].via, 'Email');
  assert.equal(item.thread.at(-1).who, 'customer');
  assert.equal(item.thread[1].by, 'Sales');
  assert.equal(item.draft, null);
  assert.equal(item.marketplace, null);
});

test('the section lists the threads, counts them, searches them, and is off with the intake', async () => {
  const waiting = await get('/api/items?section=importquery&tab=waiting');
  assert.equal(waiting.section, 'importquery');
  assert.deepEqual(waiting.items.map((r) => r.key), ['em:3', 'em:2'], 'newest customer message first; the answered and the opt-out threads are not waiting');
  const row = waiting.items.find((r) => r.key === 'em:2');
  assert.deepEqual([row.section, row.car, row.email, row.collapsed, row.name], ['importquery', 'A Hiace with no ids', 'priya@example.com', 0, 'Priya Raman']);
  assert.equal(waiting.sections.importquery, 2);
  assert.equal(waiting.unread.importquery, 2);
  assert.equal(waiting.counts.waiting, 2);
  const all = await get('/api/items?section=importquery&tab=all');
  assert.ok(all.items.some((r) => r.key === 'em:1'), 'the answered thread is on the All list');
  assert.equal((await get('/api/items?section=importquery&tab=all&q=priya@')).items.length, 4, 'a search finds the address');
  assert.equal((await get('/api/items?section=importquery&tab=all&q=no+ids')).items.map((r) => r.key).join(), 'em:2', 'and the subject');
  assert.ok(!(await get('/api/items?tab=all')).items.some((r) => r.key.startsWith('em:')), 'never under the dashboard');
  assert.equal((await get('/api/items?tab=waiting')).sections.importquery, 2, 'the count is reported from the other sections too');

  config.mail.switchedOn = false;
  const off = await get('/api/items?section=importquery&tab=waiting');
  assert.equal(off.section, 'dashboard', 'the section is off with the intake');
  assert.equal(off.sections.importquery, null);
  assert.equal(items.itemFromKey('em:2'), null);
  config.mail.switchedOn = true;
});

test('dismiss, seen and put back work on a thread', async () => {
  const before = (await get('/api/items?section=importquery&tab=waiting')).items.map((r) => r.key);
  assert.equal((await post('/api/items/em:2/dismiss')).status, 200);
  const afterDismiss = await get('/api/items?section=importquery&tab=waiting');
  assert.ok(!afterDismiss.items.some((r) => r.key === 'em:2'));
  const quiet = await get('/api/items?section=importquery&tab=quiet');
  const kept = quiet.items.find((r) => r.key === 'em:2');
  assert.ok(kept && kept.dismissed && kept.state === 'awaiting', 'dismissed, not lost');
  const restored = await (await post('/api/items/em:2/restore')).json();
  assert.equal(restored.item.dismissed, false);
  assert.deepEqual((await get('/api/items?section=importquery&tab=waiting')).items.map((r) => r.key), before);
  const unreadBefore = (await get('/api/items?section=importquery&tab=waiting')).unread.importquery;
  assert.equal((await post('/api/items/em:2/seen')).status, 200);
  assert.equal((await get('/api/items?section=importquery&tab=waiting')).unread.importquery, unreadBefore - 1);
  assert.equal((await post('/api/items/em:99/dismiss')).status, 404);
});

// ---- never learned from -----------------------------------------------------------------

test('nothing from an email thread reaches what Wheelman has learned', async () => {
  assert.equal(learn.canLearnFrom('em:2'), false);
  assert.throws(() => db.upsertLearned({ draftId: 1, itemKey: 'em:2', finalText: 'Yes, it can be imported.', source: 'copied' }), /only dashboard/);
  assert.throws(() => db.insertAdvice({ draftId: 1, itemKey: 'em:2', note: 'x' }), /only dashboard/);
  // A suggestion for a thread, copied: Copy is noted, the text is not kept, nothing is learned.
  const item = items.itemFromKey('em:2');
  const id = db.insertDraft({ itemKey: item.itemKey, anchorKey: item.anchorKey, situation: 'import_sourcing', status: 'ready', reply: 'Yes, it can be imported.', needsHuman: [], factsUsed: [], checks: [], provider: 'none', model: 'test', exampleIds: [], context: { channel: 'email' } });
  const copied = await (await post(`/api/drafts/${id}/copied`, { text: 'Yes, it can be imported, Priya.' })).json();
  assert.equal(copied.learned, false);
  assert.equal(db.getDraft(id).copied_text, null);
  assert.ok(db.getDraft(id).copied_at > 0);
  assert.equal(db.allLearned().length, 0);
  assert.equal((await (await post(`/api/drafts/${id}/rating`, { rating: 'good' })).json()).learned, false);
  assert.equal((await (await post(`/api/drafts/${id}/advice`, { note: 'shorter' })).json()).learned, false);
  assert.equal(db.allLearned().length, 0);
  assert.equal(db.allAdvice().length, 0);
  assert.equal(worker.updateOutcomes(), 0, 'outcomes are tracked for dashboard conversations only');
  assert.equal(db.getDraft(id).status, 'ready');
  const bank = JSON.stringify(voicebank.buildVoiceBank({ write: false }));
  assert.ok(!bank.includes('eligible list') && !bank.includes('priya'), 'the example bank never sees an email');
  // The worker writes nothing for a thread: suggested replies for emails come with the research step.
  assert.equal(await worker.draftWaiting(), 0);
  assert.equal(db.openDb().prepare("SELECT COUNT(*) AS n FROM drafts WHERE item_key LIKE 'em:%'").get().n, 1, 'only the one this test inserted');
});
