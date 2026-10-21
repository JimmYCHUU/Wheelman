// Follow-ups: a conversation we replied to last is put in front of the owner again when there is a
// reason to write: an inspection's booked time has passed, or the customer has gone quiet after
// our reply. The follow-up is written when the conversation is opened from the Follow-ups list,
// copied by a person, and never learned from. Every name, number and car here is invented; the
// phone numbers are in the 0491 570 1xx range reserved for fiction.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { applyTestEnv } from './support/env.js';
import { startStandins, aiBehaviour } from './support/standins.js';
import { world, sydneyNaive } from './support/fixtures.js';
import { pointConfigAt } from './support/wire.js';
import { parseDashboardTime, sydneyDay } from '../src/time.js';

applyTestEnv();

const MIN = 60e3;
const HOUR = 3600e3;
const DAY = 24 * HOUR;
// A fixed "now": two in the afternoon, Sydney time, today (or yesterday while today's is still to
// come), so every due time the engine works out lands inside working hours whatever the clock says.
const NOW = (() => { const d = parseDashboardTime(`${sydneyDay(Date.now())}T14:00`); return d <= Date.now() ? d : d - DAY; })();

let standins, config, db, sync, items, followup, normalize, st, checks, app, base;
const ai = aiBehaviour();

before(async () => {
  standins = await startStandins({ world: world(Date.now()), ai });
  ({ config } = await import('../src/config.js'));
  pointConfigAt(config, standins, { port: 0, sessionPath: path.join(os.tmpdir(), `wheelman-followup-session-${process.pid}.json`) });
  db = await import('../src/db.js');
  sync = await import('../src/sync.js');
  items = await import('../src/items.js');
  followup = await import('../src/followup.js');
  normalize = await import('../src/normalize.js');
  st = await import('../src/sectiontemplates.js');
  checks = await import('../src/checks.js');
  // A second Noah in stock, so one of the cars has a similar car to offer.
  standins.world.vehicles.push({ id: 9, stockNo: '1160', year: '2020', title: '2020 Toyota Noah Si', make: 'TOYOTA', model: 'Noah', modelCode: 'ZRR80W', auPublishPrice: 27900, odometer: 70000, seats: 8, fuel: 'Petrol', transmission: 'Automatic', color: 'Silver', status: 'PUBLISHED', soldStatus: 'UnSold', stockIn: 'Online', outline: ['6 Months NSW Registration'], chassisNo: 'ZRR80-0202020' });
  await sync.syncAll();
  app = await (await import('../src/server.js')).startServer();
  base = `http://127.0.0.1:${app.address().port}`;
});

after(async () => {
  if (app) await new Promise((r) => { app.close(r); app.closeAllConnections?.(); });
  if (standins) await standins.close();
});

// ---- invented conversations, as the sync stores them --------------------------------------------

let mid = 5000;
let iid = 7000;
const phoneOf = (n) => `0491570${120 + n}`;
const lead = (id, convId, first, phoneNo, { at = NOW - 3 * DAY, stocks = ['1201'], inquiries = [], status = 'NEW' } = {}) =>
  db.upsertLead({ id, conversationId: convId, firstName: first, lastName: 'Invented', phone: phoneNo, email: '', source: 'carsales', status, platform: 'CARSALES', state: 'NSW', leadAt: at, updatedAt: at, stocks, inquiries });
const conv = (id, leadId, phoneNo, name, latestAt, direction = 'OUT') =>
  db.upsertConversation({ id, phone: `+61${phoneNo.slice(1)}`, channel: 'SMS', status: 'OPEN', leadId, customerName: name, latestDirection: direction, latestAt, latestBody: 'x' });
const msg = (conversationId, direction, body, at) =>
  db.upsertMessage({ id: mid++, conversationId, direction, body, sentBy: direction === 'OUT' ? 'Alex STONE' : null, status: 'SENT', mediaType: null, at, importedAt: at });
const inquiry = (text, { stockNo = '1201', at = NOW - 3 * DAY, type = 'Carsales', staffNotes = [] } = {}) =>
  ({ id: iid++, type, subject: 'Vehicle enquiry', text, stockNo, at, status: 'NEW', url: '', leadType: '', priceAtTime: null, loanAmount: null, depositAmount: null, years: null, staffNotes, financeStatus: null, weeklyRepayment: null, stockStatus: null, actionType: null, sourceBlock: null, videoViewed: false });
const clockOf = (at) => new Intl.DateTimeFormat('en-US', { timeZone: 'Australia/Sydney', hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(at));
const bookingInquiry = (at, { stockNo = '1201', bookedAt = at - 26 * HOUR, testDrive = false } = {}) => inquiry(
  testDrive ? `A Test Drive has been requested by the user for the scheduled time: ${sydneyNaive(at).slice(0, 10)} ${clockOf(at)}. Please review and confirm the request.`
    : `Preferred inspection: On-site on ${sydneyNaive(at).slice(0, 10)} at ${clockOf(at)}.`,
  { type: testDrive ? 'Book Inspection' : 'product_page_inspection', stockNo, at: bookedAt });

/** A conversation where we replied last: the customer's text, then ours, with the lead's enquiries. */
function replied(n, name, { inAt = NOW - 62 * HOUR, outAt = NOW - 61 * HOUR, inText = 'Is the van still available?', outText = `Hello ${name}, yes it is available. Would you like to come and see it?`, stocks = ['1201'], inquiries = [], ours = null } = {}) {
  const id = 300 + n;
  const phoneNo = phoneOf(n);
  lead(id, id, name, phoneNo, { stocks, inquiries });
  const texts = ours || [[outAt, outText]];
  if (inText) msg(id, 'IN', inText, inAt);
  for (const [at, text] of texts) msg(id, 'OUT', text, at);
  const last = texts[texts.length - 1];
  conv(id, id, phoneNo, `${name} Invented`, last ? last[0] : inAt, last ? 'OUT' : 'IN');
  return `c:${id}`;
}

const refresh = () => followup.refreshFollowUps({ now: NOW });
/** The AI stand-in answering a fitting with the message itself, markers kept. */
const echoFit = (req) => { const m = (req.messages?.[1]?.content || '').match(/<<<\n([\s\S]*?)\n>>>/); return { reply: m ? m[1] : 'Hello {{NAME}},\n\nTeam Carbarn here.', next_step: '', facts_used: [], needs_human: [], hold: false }; };
const openFor = (key) => db.openFollowUps().filter((r) => r.item_key === key);

// ---- the settings -------------------------------------------------------------------------------

test('the follow-up settings have their defaults', () => {
  assert.deepEqual(config.followUp, { on: true, quietHours: 60, afterInspectionHours: 3, maxAgeDays: 14, reminderHour: 16, stockDays: 30 });
});

// ---- the table ----------------------------------------------------------------------------------

test('a follow-up occasion is raised once, closed, reopened, and moves with a rekeyed lead', () => {
  const id = db.insertFollowUp({ itemKey: 'l:900', leadId: 900, kind: 'quiet', occasion: 'quiet:m:1', sinceAt: 1000, reason: 'Quiet 3 days', template: 'quiet_nudge', dueAt: 2000, data: { a: 1 } });
  assert.ok(id > 0);
  assert.equal(db.insertFollowUp({ itemKey: 'l:900', leadId: 900, kind: 'quiet', occasion: 'quiet:m:1', sinceAt: 1000, reason: 'x', template: 'quiet_nudge', dueAt: 2000 }), null, 'the same occasion is never raised twice');
  assert.deepEqual([db.getFollowUp(id).data, db.openFollowUpFor('l:900').id, db.openFollowUps().map((r) => r.id), db.followUpsFor('l:900').length], [{ a: 1 }, id, [id], 1]);
  db.closeFollowUp(id, 'copied', { draftId: 7 });
  assert.deepEqual([db.getFollowUp(id).done_how, db.getFollowUp(id).draft_id, db.openFollowUpFor('l:900')], ['copied', 7, null]);
  db.reopenFollowUp(id);
  assert.deepEqual([db.getFollowUp(id).done_how, db.getFollowUp(id).done_at], [null, null]);
  db.upsertLead({ id: 900, conversationId: 901, firstName: 'Quin', lastName: 'Marsh', phone: '0491570121', email: '', source: 'carsales', status: 'NEW', platform: 'CARSALES', state: 'NSW', leadAt: 1, updatedAt: 1, stocks: [], inquiries: [] });
  db.rekeyLeadItems();
  assert.equal(db.getFollowUp(id).item_key, 'c:901', 'the row follows the lead into its text conversation');
  assert.equal(db.lastDismissedAt('c:901'), 0);
  db.dismiss('c:901', 'm:5');
  assert.ok(db.lastDismissedAt('c:901') > 0);
  assert.equal(db.getFollowUp(999), null);
  // The row is closed again so the engine's tests below start from nothing open.
  db.closeFollowUp(id, 'lapsed');
});

test('a follow-up draft is never waiting for an outcome', () => {
  const a = db.insertDraft({ itemKey: 'c:901', anchorKey: 'fu:1', status: 'ready', reply: 'x' });
  const b = db.insertDraft({ itemKey: 'c:901', anchorKey: 'm:5', status: 'ready', reply: 'y' });
  assert.deepEqual(db.draftsAwaitingOutcome().map((d) => d.id).filter((x) => x === a || x === b), [b]);
});

// ---- the engine ---------------------------------------------------------------------------------

test('due times fall inside working hours', () => {
  const two = parseDashboardTime('2026-10-21T02:00'), seven = parseDashboardTime('2026-10-21T19:00'), eleven = parseDashboardTime('2026-10-21T11:00');
  assert.deepEqual([followup.atSensibleHour(two), followup.atSensibleHour(seven), followup.atSensibleHour(eleven)], [parseDashboardTime('2026-10-21T09:00'), parseDashboardTime('2026-10-22T09:00'), eleven]);
});

test('an inspection whose booked time has passed raises one follow-up at a sensible hour', () => {
  const visit = NOW - 4 * HOUR;
  const key = replied(1, 'Quin', { inText: '', inquiries: [bookingInquiry(visit)], ours: [[visit - 25 * HOUR, 'Hello Quin, your inspection of the Hiace is booked. See you then.']] });
  refresh();
  const rows = openFor(key);
  assert.equal(rows.length, 1);
  const r = rows[0];
  assert.deepEqual([r.kind, r.reason, r.template, r.since_at, r.due_at, r.data.deposit, r.data.where], ['inspection_passed', 'Inspection passed', 'after_inspection', visit, NOW - HOUR, true, 'onsite']);
  refresh();
  assert.equal(openFor(key).length, 1, 'raised once');
});

test('a test drive reads the same way', () => {
  const visit = NOW - 5 * HOUR;
  const key = replied(2, 'Pia', { inText: '', inquiries: [bookingInquiry(visit, { testDrive: true })], ours: [[visit - 25 * HOUR, 'Hello Pia, your test drive is booked. See you then.']] });
  refresh();
  assert.deepEqual(openFor(key).map((r) => [r.reason, r.data.kind]), [['Test drive passed', 'test_drive']]);
});

test('they said they cannot come: no follow-up', () => {
  const visit = NOW - 4 * HOUR;
  const key = replied(3, 'Sol', { inAt: NOW - 5 * HOUR, inText: "Sorry, I can't make it today after all", inquiries: [bookingInquiry(visit)], ours: [[visit - 25 * HOUR, 'Hello Sol, your inspection is booked. See you then.'], [NOW - 4.5 * HOUR, 'No problem, another day suits us too.']] });
  refresh();
  assert.deepEqual(openFor(key), []);
});

test('they wrote after the booked time: the ordinary reply, not a follow-up', () => {
  const visit = NOW - 4 * HOUR;
  const key = replied(4, 'Tess', { inAt: NOW - 2 * HOUR, inText: 'When can I pick it up?', inquiries: [bookingInquiry(visit)], ours: [[visit - 25 * HOUR, 'Hello Tess, your inspection is booked. See you then.']] });
  conv(304, 304, phoneOf(4), 'Tess Invented', NOW - 2 * HOUR, 'IN');
  refresh();
  assert.deepEqual([items.itemFromKey(key).state, openFor(key)], ['awaiting', []]);
});

test('a reply 61 hours ago with nothing since is quiet', () => {
  const key = replied(5, 'Remy', { stocks: ['1159'] });
  refresh();
  const rows = openFor(key);
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0].kind, rows[0].reason, rows[0].template, rows[0].since_at, rows[0].due_at], ['quiet', 'Quiet 3 days', 'quiet_nudge', NOW - 62 * HOUR, NOW - HOUR]);
});

test('30 hours is not quiet yet', () => {
  const key = replied(6, 'Omar', { inAt: NOW - 31 * HOUR, outAt: NOW - 30 * HOUR });
  refresh();
  assert.deepEqual(openFor(key), []);
});

test('a staff note is not a reply: nothing is raised', () => {
  // The enquiry came through a portal with no text of its own on the dashboard; a staff note says it was dealt with.
  const key = replied(7, 'Nina', { inText: '', inquiries: [inquiry('Is the van still available?', { at: NOW - 62 * HOUR, staffNotes: [{ by: 'Alex', text: 'SMS Sent', at: NOW - 61 * HOUR }] })], ours: [] });
  conv(307, 307, phoneOf(7), 'Nina Invented', NOW - 62 * HOUR, 'IN');
  refresh();
  assert.deepEqual([items.itemFromKey(key).state, openFor(key)], ['answered', []]);
});

test('three texts in five minutes are one burst, so the nudge is still allowed', () => {
  const key = replied(8, 'Kofi', { stocks: ['1700'], ours: [[NOW - 61 * HOUR, 'Hello Kofi, yes it is available.'], [NOW - 61 * HOUR + 2 * MIN, 'It is at our Lidcombe showroom.'], [NOW - 61 * HOUR + 4 * MIN, 'Would you like to come and see it?']] });
  refresh();
  assert.equal(openFor(key).length, 1);
});

test('two bursts since they last wrote: nothing more', () => {
  const key = replied(9, 'Maria', { inAt: NOW - 80 * HOUR, ours: [[NOW - 70 * HOUR, 'Hello Maria, yes it is available.'], [NOW - 61 * HOUR, 'Hello again, it is still available if you would like to see it.']] });
  refresh();
  assert.deepEqual(openFor(key), []);
});

test('a future booking, a no, an opt-out, a buyer, a dismissed conversation and a sold car get nothing', () => {
  const future = replied(10, 'Eli', { inquiries: [bookingInquiry(NOW + DAY, { bookedAt: NOW - 70 * HOUR })], ours: [[NOW - 61 * HOUR, 'Hello Eli, your inspection is booked. See you then.']] });
  const no = replied(11, 'Dana', { inText: 'Not interested thanks', outText: 'Thank you for letting us know.' });
  const stop = replied(12, 'Brad', { inText: 'STOP', ours: [] });
  conv(312, 312, phoneOf(12), 'Brad Invented', NOW - 62 * HOUR, 'IN');
  const buyer = replied(13, 'Yuki', { stocks: ['1600'] });
  db.upsertSale({ vehicleId: 7, saleId: 9077, stockNo: '1600', stage: 'PENDING_PAYMENT', soldAt: NOW - DAY, paid: 'part', phones: normalize.phoneKeys(phoneOf(13)), email: '' });
  const dismissed = replied(14, 'Isla');
  db.dismiss(dismissed, items.itemFromKey(dismissed).anchorKey);
  const sold = replied(15, 'Tom', { stocks: ['1200'] });
  const old = replied(16, 'Rhea', { inAt: NOW - 21 * DAY, outAt: NOW - 20 * DAY });
  refresh();
  for (const key of [future, no, stop, buyer, dismissed, sold, old]) assert.deepEqual(openFor(key), [], key);
  assert.ok(items.itemFromKey(buyer).deal, 'the sale on that number makes them a buyer');
});

test('a new customer message closes the row as answered; the car selling closes it as lapsed', async () => {
  const quiet = 'c:305';
  msg(305, 'IN', 'Still interested, is it there this weekend?', NOW - 10 * MIN);
  conv(305, 305, phoneOf(5), 'Remy Invented', NOW - 10 * MIN, 'IN');
  refresh();
  assert.equal(db.followUpsFor(quiet)[0].done_how, 'answered');
  // Kofi asked about the Serena; it sells before anyone follows up.
  const serena = standins.world.vehicles.find((v) => v.id === 8);
  Object.assign(serena, { status: 'UNPUBLISHED', soldStatus: 'Sold', stockIn: 'Sold' });
  await sync.syncAll({ vehicles: { force: true } });
  refresh();
  assert.equal(db.followUpsFor('c:308')[0].done_how, 'lapsed');
});

// ---- the list, the routes and the worker --------------------------------------------------------

const get = async (p) => (await fetch(base + p)).json();
const post = async (p, body = {}) => { const r = await fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, json: await r.json() }; };

test('the Follow-ups list shows the due rows with their reason, newest due first, and All carries no tag', async () => {
  const list = await get('/api/items?section=dashboard&tab=followups');
  const row = list.items.find((r) => r.key === 'c:301');
  assert.ok(row, 'the passed inspection is listed');
  assert.deepEqual([row.followUp.reason, row.followUp.done, row.followUp.template, row.anchor, list.counts.followups >= 2], ['Inspection passed', '', 'after_inspection', `fu:${row.followUp.id}`, true]);
  assert.ok(list.items.findIndex((r) => r.key === 'c:301') < list.items.findIndex((r) => r.key === 'c:302'), 'the one due most recently comes first');
  const plain = (await get('/api/items?section=dashboard&tab=all')).items.find((r) => r.key === 'c:301');
  assert.deepEqual([plain.followUp, plain.anchor.startsWith('fu:')], [undefined, false]);
  assert.equal((await get('/api/items?section=auction&tab=followups')).items.length, 0, 'only the dashboard has follow-ups');
});

test('a conversation is opened with its follow-up in hand', async () => {
  const row = db.openFollowUpFor('c:301');
  const { item } = await get(`/api/items/c:301?followup=${row.id}`);
  assert.deepEqual([item.anchor, item.followUp.id, item.followUp.reason, item.template, item.firstReply], [`fu:${row.id}`, row.id, 'Inspection passed', 'after_inspection', false]);
  const plain = (await get('/api/items/c:301')).item;
  assert.deepEqual([plain.followUp.id, plain.followUp.done, plain.anchor.startsWith('fu:')], [row.id, '', false], 'opened from All: the follow-up is known, the anchor is the conversation\'s own');
});

test('a closed or stale follow-up is refused a draft', async () => {
  const id = db.openFollowUpFor('c:302').id;
  db.closeFollowUp(id, 'dismissed');
  const refused = await post('/api/items/c:302/draft', { followup: id, message: 'after_inspection' });
  assert.deepEqual([refused.status, refused.json.error], [400, 'This follow-up is done. Put it back first.']);
  db.reopenFollowUp(id);
  // Pia writes before anyone follows up: that message is what to answer.
  msg(302, 'IN', 'Loved the van, can I come back with my partner on Saturday?', NOW - 10 * MIN);
  conv(302, 302, phoneOf(2), 'Pia Invented', NOW - 10 * MIN, 'IN');
  const stale = await post('/api/items/c:302/draft', { followup: id, message: 'after_inspection' });
  assert.deepEqual([stale.status, stale.json.error, db.getFollowUp(id).done_how], [400, 'They have written since. Reply to that instead.', 'answered']);
});

test('Dismiss and Put back', async () => {
  const id = db.openFollowUpFor('c:301').id;
  const d = await post(`/api/followups/${id}/dismiss`);
  assert.deepEqual([d.status, d.json.item.followUp.done, d.json.item.key], [200, 'dismissed', 'c:301']);
  assert.ok(!(await get('/api/items?section=dashboard&tab=followups')).items.some((r) => r.key === 'c:301'), 'it leaves the list');
  const r = await post(`/api/followups/${id}/restore`);
  assert.deepEqual([r.status, r.json.item.followUp.done], [200, '']);
  assert.ok((await get('/api/items?section=dashboard&tab=followups')).items.some((r) => r.key === 'c:301'), 'and is back');
  assert.equal((await post('/api/followups/99999/dismiss')).status, 404);
});

test('Check now refreshes the follow-ups', async () => {
  const key = replied(17, 'Liam', { stocks: ['1159'] });
  // No AI key for the moment, so the check writes no suggestions in the background while later tests script the AI.
  const apiKey = config.llm.gemini.apiKey;
  config.llm.gemini.apiKey = '';
  try { await post('/api/sync'); } finally { config.llm.gemini.apiKey = apiKey; }
  assert.deepEqual(openFor(key).map((r) => r.reason), ['Quiet 3 days']);
});

// ---- the two messages and their facts -----------------------------------------------------------

test('the follow-up messages are offered to a follow-up only, the due one first', async () => {
  const row = db.openFollowUpFor('c:301');
  const list = (await get(`/api/items/c:301?followup=${row.id}`)).item.templates;
  assert.deepEqual([list[0].id, list[0].due, list[0].label], ['after_inspection', true, 'After the inspection']);
  assert.ok(!(await get('/api/items/c:301')).item.templates.some((t) => t.id === 'after_inspection'), 'not on the ordinary list');
  assert.ok(!(await get('/api/items/c:202')).item.templates.some((t) => /after_inspection|quiet_nudge/.test(t.id)));
  assert.deepEqual(st.checkTemplates(), []);
});

test('the words for the booked day and time', () => {
  const wed = parseDashboardTime('2026-10-21T14:00');
  assert.deepEqual([st.bookedDayWords(wed, wed + 2 * HOUR), st.bookedDayWords(wed, wed + DAY), st.bookedDayWords(wed, wed + 3 * DAY), st.bookedTimeWords(wed), st.bookedTimeWords(wed + 30 * MIN)],
    ['today', 'yesterday', 'on Wednesday 21 October', '2 pm', '2:30 pm']);
});

test('the one new thing: the documents, then the video, then a similar car, then a time to come in', () => {
  const noah = db.getVehicleByStock('1159');
  const hiace = db.getVehicleByStock('1201');
  const media = { documents: [{ type: 'EXPORT_CERTIFICATE', link: 'https://docs.example/export.pdf', shareable: true }, { type: 'AUCTION_SHEET', link: 'https://docs.example/sheet.png', shareable: true }], videos: [{ label: 'Walkaround 360', link: 'https://videos.example/walk.mp4', shareable: true }] };
  const item = (texts, v = noah) => ({ timeline: texts.map((t, i) => ({ who: 'us', text: t, at: i + 1 })), vehicles: [v], lead: { inquiries: [] }, deal: null });
  const docs = st.newThingFor(item([]), media);
  assert.equal(docs.kind, 'documents');
  assert.match(docs.text, /export certificate[\s\S]*https:\/\/docs\.example\/export\.pdf[\s\S]*https:\/\/docs\.example\/sheet\.png/i);
  const video = st.newThingFor(item(['Here is the auction sheet.']), media);
  assert.deepEqual([video.kind, /https:\/\/videos\.example\/walk\.mp4/.test(video.text)], ['video', true]);
  const similar = st.newThingFor(item(['Here is the auction sheet and the walkaround video.']), media);
  assert.deepEqual([similar.kind, /2020 Toyota Noah Si/.test(similar.text), /\$27,900/.test(similar.text), /70,000 km/.test(similar.text)], ['similar', true, true, true]);
  const visit = st.newThingFor(item(['Here is the auction sheet and the walkaround video.'], hiace), media);
  assert.deepEqual([visit.kind, /#inspection=onsite/.test(visit.text)], ['visit', true]);
  // "Would you like to come and see it?" offers no booking link: the hours and the link are still new.
  assert.equal(st.newThingFor(item(['Here is the auction sheet and the walkaround video. Would you like to come and see it?'], hiace), media).kind, 'visit', 'invited in words only');
  assert.equal(st.newThingFor(item(['Here is the auction sheet and the walkaround video. You can book a time here:\nhttps://www.carbarn.com.au/vehicles/toyota/hiace/gdh206v/1201#inspection=onsite'], hiace), media), null, 'everything has been offered');
  assert.equal(st.newThingFor(item([], hiace), null).kind, 'visit', 'with no media to hand, the documents and the video are not offered');
});

test('a follow-up greets and signs off even on a day we have already written', async () => {
  const row = db.openFollowUpFor('c:301');
  const item = items.itemFromKey('c:301', { followUp: row.id });
  const visit = row.data.bookedAt;
  // Ten minutes after our confirmation went out: an ordinary message that day would drop the greeting.
  const composed = await st.composeSectionTemplate(item, 'after_inspection', { now: visit - 25 * HOUR + 10 * MIN });
  assert.match(composed.text, /^Good morning {{NAME}},\n\nTeam Carbarn here\. How did you find the 2020 Toyota Hiace DX on \w+day \d+ \w+\?\n\nA \$1,000 refundable holding deposit takes it off the market for you; until then it stays for sale\.\n\nRegards,\nTeam Carbarn$/);
  const after = await st.composeSectionTemplate(item, 'after_inspection', { now: visit + 4 * HOUR });
  assert.match(after.text, /How did you find the 2020 Toyota Hiace DX today\?/);
});

test('a follow-up written word for word names Carbarn, the booked day and the deposit', async () => {
  ai.down = true;
  try {
    const row = db.openFollowUpFor('c:301');
    const out = await post('/api/items/c:301/draft', { followup: row.id, message: 'after_inspection' });
    const d = out.json.item.draft;
    assert.deepEqual([out.status, d.template, d.provider, out.json.item.anchor], [200, 'after_inspection', 'none', `fu:${row.id}`]);
    assert.match(d.reply, /^Good (morning|afternoon|evening) Quin,\n\nTeam Carbarn here\. How did you find the 2020 Toyota Hiace DX (today|yesterday)\?\n\nA \$1,000 refundable holding deposit takes it off the market for you; until then it stays for sale\.\n\nRegards,\nTeam Carbarn$/);
  } finally { ai.down = false; }
});

// ---- what the AI is told, the checks, and nothing learned ---------------------------------------

test('the follow-up checks: Carbarn in the first sentence, never "just checking in" or "did you come"', () => {
  const codes = (body, kind = 'quiet') => checks.followUpChecks({ body, kind }).map((c) => `${c.level}:${c.code}`);
  assert.deepEqual(codes('Good afternoon Quin,\n\nTeam Carbarn here. How did you find the van today?\n\nA $1,000 refundable holding deposit takes it off the market for you.\n\nRegards,\nTeam Carbarn'), []);
  assert.deepEqual(codes('Hello Quin,\n\nJust checking in on the van. Did you make it on Tuesday?'), ['fail:followup-identify', 'fail:followup-banned', 'warn:followup-new']);
  assert.deepEqual(codes('Team Carbarn here, following on from the van. Were you able to come in?'), ['fail:followup-banned', 'warn:followup-new']);
  assert.ok(codes(`Team Carbarn here. ${'word '.repeat(60)}Welcome to come and see it.`).includes('warn:followup-long'));
  assert.deepEqual(codes('Team Carbarn here. A reminder of your inspection tomorrow at 2 pm.', 'reminder'), []);
});

test('a reply that checks in or asks whether they came is sent back once, and the AI is told it is a follow-up', async () => {
  const id = db.openFollowUpFor('c:317').id;
  // First the AI "just checks in" and asks whether they came; sent back, it fits the message as given.
  ai.script.push({ reply: 'Hello {{NAME}},\n\nJust checking in on the {{K1}}. Did you make it in?', next_step: '', facts_used: [], needs_human: [], hold: false });
  const echo = (req) => { const m = (req.messages?.[1]?.content || '').match(/<<<\n([\s\S]*?)\n>>>/); return { reply: m ? m[1] : 'Hello {{NAME}},\n\nTeam Carbarn here.', next_step: '', facts_used: [], needs_human: [], hold: false }; };
  const seenBefore = ai.seen.length;
  ai.behave = echo;
  let out;
  try { out = await post('/api/items/c:317/draft', { followup: id, message: 'quiet_nudge' }); } finally { ai.behave = null; }
  const d = out.json.item.draft;
  assert.deepEqual([out.status, d.status, d.template, ai.seen.length - seenBefore], [200, 'ready', 'quiet_nudge', 2]);
  assert.ok(!d.checks.some((c) => c.code === 'followup-banned' || c.code === 'followup-identify'), JSON.stringify(d.checks));
  assert.match(d.reply, /^Good (morning|afternoon|evening) Liam,\n\nTeam Carbarn here, following on from the 2021 Toyota Noah X \(8 Seater\)\./);
  assert.match(d.reply, /export certificate[\s\S]*Regards,\nTeam Carbarn$/, 'the one new thing, then the sign-off');
  const asked = ai.seen[ai.seen.length - 1].messages[1].content;
  assert.match(asked, /=== FOLLOW-UP ===/);
  assert.match(asked, /=== THERE IS NO NEW MESSAGE ===/);
  assert.doesNotMatch(asked, /THE CUSTOMER IS WAITING FOR/);
  assert.match(ai.seen[ai.seen.length - 1].messages[1].content, /Never "just checking in"/);
  assert.match(d.checks.map((c) => c.message).join('\n'), /Fitted to this customer|Figures and links match/);
});

test('Copy on a follow-up counts as done and teaches nothing; Put back makes it due again', async () => {
  const id = db.openFollowUpFor('c:317').id;
  const learnedBefore = db.countRows('learned');
  const item = (await get(`/api/items/c:317?followup=${id}`)).item;
  assert.deepEqual([item.teaches, item.draft.status, item.draft.context === undefined], [false, 'ready', true]);
  const out = await post(`/api/drafts/${item.draft.id}/copied`, { text: `${item.draft.reply} Changed by hand.` });
  assert.deepEqual([out.json.followUpDone, out.json.learned, out.json.why, db.getFollowUp(id).done_how, db.getFollowUp(id).draft_id, db.countRows('learned')], [true, false, 'a follow-up', 'copied', item.draft.id, learnedBefore]);
  assert.ok(!db.draftsAwaitingOutcome().some((x) => x.id === item.draft.id));
  assert.ok(!(await get('/api/items?section=dashboard&tab=followups')).items.some((r) => r.key === 'c:317'), 'it left the list');
  assert.equal((await get(`/api/items/c:317?followup=${id}`)).item.followUp.done, 'copied');
  assert.deepEqual([(await post(`/api/drafts/${item.draft.id}/rating`, { rating: 'good' })).json.learned, db.countRows('learned')], [false, learnedBefore]);
  await post(`/api/followups/${id}/restore`);
  assert.equal(db.getFollowUp(id).done_how, null);
  assert.ok((await get('/api/items?section=dashboard&tab=followups')).items.some((r) => r.key === 'c:317'), 'and is back');
});

test('a conversation opened with its follow-up carries the anchor and the template', () => {
  const row = db.openFollowUpFor('c:301');
  const item = items.itemFromKey('c:301', { followUp: row.id });
  assert.deepEqual([item.anchorKey, item.templatePick, item.followUp.id, item.isFirstReply, item.followUpDue], [`fu:${row.id}`, 'after_inspection', row.id, false, undefined]);
  const plain = items.itemFromKey('c:301');
  assert.deepEqual([plain.followUp, plain.followUpDue.id, plain.anchorKey.startsWith('fu:')], [undefined, row.id, false], 'opened from All it knows a follow-up is due, but the anchor is the conversation\'s own');
  assert.equal(items.itemFromKey('c:306', { followUp: row.id }).followUp, undefined, 'a follow-up of another conversation is ignored');
});

// ---- after the whole-branch review ---------------------------------------------------------------

test('a follow-up closed as answered or lapsed is no longer in hand: the conversation keeps its own anchor', async () => {
  const key = replied(40, 'Nora');
  refresh();
  const id = openFor(key)[0].id;
  db.closeFollowUp(id, 'answered');
  const item = items.itemFromKey(key, { followUp: id });
  assert.deepEqual([item.followUp, item.anchorKey.startsWith('fu:')], [undefined, false], 'the box falls back to the conversation');
  assert.equal((await get(`/api/items/${key}?followup=${id}`)).item.followUp, null);
  db.reopenFollowUp(id);
  db.closeFollowUp(id, 'dismissed');
  assert.equal(items.itemFromKey(key, { followUp: id }).followUp.id, id, 'a dismissed one is still in hand, for Put back');
  db.closeFollowUp(id, 'lapsed');
});

test('an inspection follow-up stands when its conversation falls out of the fortnight the worker reads, until the visit is a week old', () => {
  const visit = NOW - 4 * HOUR;
  const confirmedAt = NOW - 12 * DAY;
  const n = 41; const id = 300 + n; const phoneNo = phoneOf(n);
  lead(id, id, 'Omar', phoneNo, { at: confirmedAt - HOUR, inquiries: [bookingInquiry(visit, { bookedAt: confirmedAt - HOUR })] });
  msg(id, 'OUT', 'Hello Omar, your inspection of the Hiace is booked. See you then.', confirmedAt);
  conv(id, id, phoneNo, 'Omar Invented', confirmedAt);
  refresh();
  const row = openFor(`c:${id}`)[0];
  assert.ok(row, 'raised while the conversation is still read');
  // Read with a shorter fortnight, so the conversation is no longer among the ones the worker reads.
  const shorter = { ...config.followUp, maxAgeDays: 10 };
  followup.refreshFollowUps({ now: NOW + DAY, cfg: shorter });
  assert.equal(db.getFollowUp(row.id).done_how, null, 'still due the next day');
  followup.refreshFollowUps({ now: NOW + 8 * DAY, cfg: shorter });
  assert.equal(db.getFollowUp(row.id).done_how, 'lapsed', 'a week after the visit the reason has passed');
});

test('a sent follow-up never teaches, even through an older suggestion for the booking', async () => {
  const visit = NOW - 5 * HOUR;
  const n = 42; const id = 300 + n; const phoneNo = phoneOf(n); const key = `c:${id}`;
  // A website booking dealt with by phone: a staff note, no text of ours on the dashboard.
  const booking = bookingInquiry(visit, { bookedAt: visit - 30 * HOUR });
  booking.staffNotes = [{ by: 'Alex', text: 'Phoned to confirm', at: visit - 29 * HOUR }];
  lead(id, id, 'Pia', phoneNo, { inquiries: [booking] });
  conv(id, id, phoneNo, 'Pia Invented', visit - 30 * HOUR, 'IN');
  // While the booking was waiting, Wheelman had written an ordinary suggestion for it.
  const bookingKey = items.itemFromKey(key).timeline.find((e) => e.booking)?.key;
  const older = db.insertDraft({ itemKey: key, anchorKey: bookingKey, status: 'ready', reply: 'Hello Pia, your inspection is booked. See you then.' });
  refresh();
  const row = openFor(key)[0];
  assert.ok(row, 'the inspection follow-up is raised');
  ai.down = true;
  let written;
  try { written = (await post(`/api/items/${key}/draft`, { followup: row.id, message: 'after_inspection' })).json.item.draft; } finally { ai.down = false; }
  assert.equal(written.status, 'ready');
  await post(`/api/drafts/${written.id}/copied`, { text: written.reply });
  // The owner pastes it into the dashboard; the next check brings it back as a text of ours.
  msg(id, 'OUT', written.reply, NOW - HOUR);
  const learnedBefore = db.countRows('learned');
  const worker = await import('../src/worker.js');
  worker.updateOutcomes();
  assert.equal(db.countRows('learned'), learnedBefore, 'nothing learned from the follow-up');
  assert.equal(db.getDraft(older).status, 'superseded', 'the older suggestion is not scored against it either');
});

test('the AI is told a time to come in was offered only once the booking link went out', async () => {
  const key = replied(43, 'Sana', { outText: 'Hello Sana, yes it is available. Would you like to come and see it?' });
  refresh();
  const id = openFor(key)[0].id;
  const echo = (req) => { const m = (req.messages?.[1]?.content || '').match(/<<<\n([\s\S]*?)\n>>>/); return { reply: m ? m[1] : 'Hello {{NAME}},\n\nTeam Carbarn here.', next_step: '', facts_used: [], needs_human: [], hold: false }; };
  ai.behave = echo;
  let out;
  try { out = await post(`/api/items/${key}/draft`, { followup: id, message: 'quiet_nudge' }); } finally { ai.behave = null; }
  const asked = ai.seen[ai.seen.length - 1].messages[1].content;
  assert.match(asked, /Already offered to this customer in this conversation: nothing yet\./);
  assert.match(out.json.item.draft.reply, /#inspection=onsite/, 'the hours and the booking link are the one new thing');
});

// ---- PR 2: the booking in hand, messages written by code, the booking confirmation, the reminder ----

test('the words for when a booking is: today, tomorrow, or the day', () => {
  const wed = parseDashboardTime('2026-10-21T14:00');
  assert.deepEqual([st.bookedWhenWords(wed, wed - 2 * HOUR), st.bookedWhenWords(wed, wed - DAY), st.bookedWhenWords(wed, wed - 3 * DAY)], ['today', 'tomorrow', 'on Wednesday 21 October']);
});

test('the booking in hand: the newest booking the customer made, and its facts', async () => {
  const visit = NOW + DAY;
  const key = replied(50, 'Tara', { inText: '', inquiries: [bookingInquiry(visit, { bookedAt: NOW - HOUR })], ours: [] });
  const item = items.itemFromKey(key);
  assert.deepEqual(st.bookingInHand(item), { kind: 'inspection', where: 'onsite', at: visit });
  const { values } = await st.composeSectionTemplate(item, 'price_question', { now: NOW });
  assert.deepEqual([values.booking_kind, values.booked_when, values.booked_time, values.address, values.if_onsite, values.if_online], ['inspection', 'tomorrow', '2 pm', '136 Frances Street, Lidcombe NSW 2141', true, false]);
  assert.equal(st.bookingInHand(items.itemFromKey('c:305')), null, 'no booking, nothing in hand');
  assert.equal((await st.composeSectionTemplate(items.itemFromKey('c:305'), 'price_question', { now: NOW })).values.booked_when, null);
});

test('a message marked @fit: no is written by code, word for word; a Prompt still goes to the AI', async () => {
  const seenBefore = ai.seen.length;
  const out = await post('/api/items/c:350/draft', { message: 'booking_confirmed' });
  const d = out.json.item.draft;
  assert.deepEqual([out.status, d?.status, d?.template, d?.provider, d?.model, ai.seen.length - seenBefore], [200, 'ready', 'booking_confirmed', 'none', 'your wording', 0]);
  assert.match(d.checks.map((c) => c.message).join('\n'), /Written by code from your wording "Booking confirmed"/);
  ai.behave = echoFit;
  try { assert.equal((await post('/api/items/c:350/draft', { message: 'booking_confirmed', instruction: 'add that we are closed on Sunday' })).status, 200); } finally { ai.behave = null; }
  assert.equal(ai.seen.length - seenBefore, 1, 'a Prompt goes to the AI');
});

test('a booking just made is answered first with Booking confirmed; online and test-drive bookings read right', async () => {
  const list = (await get('/api/items/c:350')).item.templates;
  assert.deepEqual([list[0].id, list[0].best], ['booking_confirmed', true]);
  const d = (await post('/api/items/c:350/draft', { message: 'booking_confirmed' })).json.item.draft;
  assert.match(d.reply, /^Good (morning|afternoon|evening) Tara,\n\nTeam Carbarn here\. Your inspection of the 2020 Toyota Hiace DX is (today|tomorrow) at 2 pm\.\n\nWe are at 136 Frances Street, Lidcombe NSW 2141\. If the time no longer suits, let us know and we will find another\.\n\nRegards,\nTeam Carbarn$/);
  const online = replied(55, 'Yara', { inText: '', inquiries: [inquiry(`Preferred inspection: Online on ${sydneyNaive(NOW + DAY).slice(0, 10)} at 09:30 AM.`, { type: 'product_page_inspection', at: NOW - HOUR })], ours: [] });
  const o = (await post(`/api/items/${online}/draft`, { message: 'booking_confirmed' })).json.item.draft;
  assert.match(o.reply, /at 9:30 am\.\n\nWe will call you at that time on this number and walk you around the car on video\./);
  assert.doesNotMatch(o.reply, /Frances Street/);
  const drive = replied(56, 'Zed', { inText: '', inquiries: [bookingInquiry(NOW + DAY, { bookedAt: NOW - HOUR, testDrive: true })], ours: [] });
  assert.match((await post(`/api/items/${drive}/draft`, { message: 'booking_confirmed' })).json.item.draft.reply, /Your test drive of the 2020 Toyota Hiace DX is (today|tomorrow) at 2 pm\./);
  assert.ok(!(await get('/api/items/c:305')).item.templates.some((t) => t.id === 'booking_confirmed'), 'not offered without a booking');
  assert.deepEqual(st.checkTemplates(), []);
});

// ---- the reminder the day before a booked visit --------------------------------------------------

const tomorrowAt2 = () => parseDashboardTime(`${sydneyDay(NOW + DAY)}T14:00`);
const fourToday = () => parseDashboardTime(`${sydneyDay(NOW)}T16:00`);

test('a booking for tomorrow raises a reminder at four the day before, hanging on the booked time', () => {
  const visit = tomorrowAt2();
  const key = replied(51, 'Uma', { inText: '', inquiries: [bookingInquiry(visit, { bookedAt: NOW - 3 * DAY })], ours: [[NOW - 3 * DAY + HOUR, 'Hello Uma, your inspection of the Hiace is booked. See you then.']] });
  followup.refreshFollowUps({ now: NOW });
  assert.equal(openFor(key).length, 0, 'two in the afternoon: not yet');
  followup.refreshFollowUps({ now: fourToday() + 30 * MIN });
  const r = openFor(key)[0];
  assert.ok(r, 'raised after four');
  assert.deepEqual([r.kind, r.reason, r.template, r.since_at, r.due_at, r.data], ['reminder', 'Inspection tomorrow', 'inspection_reminder', visit, fourToday(), { bookedAt: visit, where: 'onsite', kind: 'inspection' }]);
  followup.refreshFollowUps({ now: fourToday() + HOUR });
  assert.equal(openFor(key).length, 1, 'raised once');
});

test('no reminder when they booked after the reminder time, or we have written since it, or they cannot come', () => {
  const visit = tomorrowAt2();
  const late = replied(52, 'Vik', { inText: '', inquiries: [bookingInquiry(NOW + 3 * HOUR, { bookedAt: NOW - HOUR })], ours: [[NOW - 30 * MIN, 'Hello Vik, see you at five.']] });
  const evening = replied(53, 'Wes', { inText: '', inquiries: [bookingInquiry(visit, { bookedAt: fourToday() + 10 * MIN })], ours: [[fourToday() + 15 * MIN, 'Hello Wes, your inspection is booked for tomorrow at 2 pm.']] });
  const wrote = replied(54, 'Xan', { inText: '', inquiries: [bookingInquiry(visit, { bookedAt: NOW - 2 * DAY })], ours: [[fourToday() + 5 * MIN, 'Hello Xan, just confirming tomorrow at 2 pm.']] });
  const cannot = replied(57, 'Ana', { inText: '', inquiries: [bookingInquiry(visit, { bookedAt: NOW - 2 * DAY })], ours: [[NOW - 2 * DAY + HOUR, 'Hello Ana, your inspection is booked.']] });
  msg(357, 'IN', "Sorry, can't make it tomorrow after all.", NOW - HOUR);
  msg(357, 'OUT', 'No problem Ana, let us know another day.', NOW - 30 * MIN);
  conv(357, 357, phoneOf(57), 'Ana Invented', NOW - 30 * MIN);
  followup.refreshFollowUps({ now: fourToday() + 30 * MIN });
  assert.deepEqual([openFor(late), openFor(evening), openFor(wrote), openFor(cannot)], [[], [], [], []]);
});

test('their "see you tomorrow", answered before the hour, keeps the reminder; a copied reminder never blocks the follow-up after the visit', () => {
  const visit = tomorrowAt2();
  const key = replied(58, 'Bea', { inText: '', inquiries: [bookingInquiry(visit, { bookedAt: NOW - 2 * DAY })], ours: [[NOW - 2 * DAY + HOUR, 'Hello Bea, your inspection is booked for tomorrow at 2 pm.']] });
  msg(358, 'IN', 'Thanks, see you tomorrow', NOW - 2 * HOUR);
  msg(358, 'OUT', 'See you then Bea.', NOW - HOUR);
  conv(358, 358, phoneOf(58), 'Bea Invented', NOW - HOUR);
  followup.refreshFollowUps({ now: fourToday() + 30 * MIN });
  const r = openFor(key)[0];
  assert.equal(r?.kind, 'reminder');
  db.closeFollowUp(r.id, 'copied');
  followup.refreshFollowUps({ now: visit + 4 * HOUR });
  assert.deepEqual(openFor(key).map((x) => x.kind), ['inspection_passed'], 'how did it go, the day after the reminder');
  assert.equal(db.getFollowUp(r.id).done_how, 'copied', 'the reminder row is left as it was');
});

test('the reminder is written by code when opened from Follow-ups, first in Which message? and marked due', async () => {
  // A conversation of its own: the refresh the day after the visit, above, lapsed Uma's reminder as it should.
  const key = replied(59, 'Cleo', { inText: '', inquiries: [bookingInquiry(tomorrowAt2(), { bookedAt: NOW - 3 * DAY })], ours: [[NOW - 3 * DAY + HOUR, 'Hello Cleo, your inspection of the Hiace is booked. See you then.']] });
  followup.refreshFollowUps({ now: fourToday() + 30 * MIN });
  const r = openFor(key)[0];
  assert.equal(r?.kind, 'reminder');
  const list = (await get(`/api/items/${key}?followup=${r.id}`)).item.templates;
  assert.deepEqual([list[0]?.id, list[0]?.due], ['inspection_reminder', true]);
  const seenBefore = ai.seen.length;
  // The draft route judges "still due" by the clock: with the reminder hour at 0, a visit tomorrow is due from 9 am the day before.
  const was = config.followUp.reminderHour;
  config.followUp.reminderHour = 0;
  let d;
  try { d = (await post(`/api/items/${key}/draft`, { followup: r.id, message: 'inspection_reminder' })).json.item.draft; } finally { config.followUp.reminderHour = was; }
  assert.deepEqual([d?.status, d?.provider, ai.seen.length - seenBefore, d?.checks.filter((c) => /^followup-/.test(c.code))], ['ready', 'none', 0, []]);
  assert.match(d.reply, /^Good (morning|afternoon|evening) Cleo,\n\nTeam Carbarn here\. A reminder of your inspection of the 2020 Toyota Hiace DX (today|tomorrow) at 2 pm\.\n\nWe are at 136 Frances Street, Lidcombe NSW 2141\. If the time no longer suits, let us know and we will find another\.\n\nRegards,\nTeam Carbarn$/);
  assert.equal((await get('/api/items?section=dashboard&tab=followups')).items.find((x) => x.key === key).followUp.reason, 'Inspection tomorrow');
});

// ---- after the whole-branch review ---------------------------------------------------------------

test('Booking confirmed reads right for a visit two or more days ahead', async () => {
  const visit = parseDashboardTime(`${sydneyDay(NOW + 3 * DAY)}T14:00`);
  const key = replied(60, 'Fay', { inText: '', inquiries: [bookingInquiry(visit, { bookedAt: NOW - HOUR })], ours: [] });
  const d = (await post(`/api/items/${key}/draft`, { message: 'booking_confirmed' })).json.item.draft;
  assert.match(d.reply, /Your inspection of the 2020 Toyota Hiace DX is on \w+day \d{1,2} \w+ at 2 pm\./);
  assert.doesNotMatch(d.reply, /for on/);
});

test('Booking confirmed is offered only for a booking still to come that nobody has answered', async () => {
  const asked = replied(61, 'Gus', { inText: 'Can I come and see it on Saturday?', ours: [] });
  assert.ok(!(await get(`/api/items/${asked}`)).item.templates.some((t) => t.id === 'booking_confirmed'), 'a question about coming is not a booking');
  const past = replied(62, 'Hal', { inText: '', inquiries: [bookingInquiry(NOW - 10 * DAY, { bookedAt: NOW - 11 * DAY })], ours: [] });
  assert.ok(!(await get(`/api/items/${past}`)).item.templates.some((t) => t.id === 'booking_confirmed'), 'a visit already past');
  const answered = replied(63, 'Ida', { inText: '', inquiries: [bookingInquiry(NOW + DAY, { bookedAt: NOW - 2 * HOUR })], ours: [[NOW - HOUR, 'Hello Ida, your inspection is booked for tomorrow at 2 pm.']] });
  assert.ok(!(await get(`/api/items/${answered}`)).item.templates.some((t) => t.id === 'booking_confirmed'), 'already answered');
  const list = (await get('/api/items/c:350')).item.templates;
  assert.deepEqual([list[0].id, list[0].best], ['booking_confirmed', true], 'still first for a booking just made');
});

// ---- PR 3: stock news ------------------------------------------------------------------------------

test("the stock list's changes are kept as events: landed, a price down by $100 or more, sold; nothing on first sight or from a stale row", () => {
  const voxy = (extra) => ({ id: 900, stockNo: '9900', title: '2019 Toyota Voxy', year: '2019', make: 'TOYOTA', model: 'Voxy', modelCode: 'ZRR80', status: 'PUBLISHED', soldStatus: 'UnSold', stockIn: 'Transit', price: 30000, odometer: 50000, ...extra });
  db.upsertVehicle(voxy({}), { now: NOW - 5 * HOUR });
  assert.deepEqual(db.vehicleEventsFor(900, 0), [], 'first sight');
  db.upsertVehicle(voxy({ stockIn: 'Online' }), { now: NOW - 4 * HOUR });
  db.upsertVehicle(voxy({ stockIn: 'Online', price: 29950 }), { now: NOW - 3 * HOUR });
  db.upsertVehicle(voxy({ stockIn: 'Online', price: 29800 }), { now: NOW - 2 * HOUR });
  db.upsertVehicle(voxy({ stockIn: 'Online', price: 29800 }), { now: NOW - HOUR });
  db.upsertVehicle(voxy({ stockIn: 'Sold', soldStatus: 'Sold', price: 29800 }), { now: NOW });
  assert.deepEqual(db.vehicleEventsFor(900, 0).map((e) => [e.event, e.at, e.data]), [['landed', NOW - 4 * HOUR, { from: 'transit', to: 'available' }], ['price', NOW - 2 * HOUR, { from: 29950, to: 29800 }], ['sold', NOW, { from: 'available', to: 'sold' }]]);
  // Other cars have news of their own from the tests above (the Serena sold); this car's recent news is the sale.
  assert.deepEqual(db.vehicleEventsSince(NOW - 90 * MIN).filter((e) => e.vehicle_id === 900).map((e) => e.event), ['sold']);
  // A row last seen three days ago: whatever changed since is not news.
  db.upsertVehicle(voxy({ id: 901, stockNo: '9901' }), { now: NOW - 3 * DAY });
  db.upsertVehicle(voxy({ id: 901, stockNo: '9901', stockIn: 'Online', price: 20000 }), { now: NOW });
  assert.deepEqual(db.vehicleEventsFor(901, 0), [], 'stale row');
});

test('a Prompt on the reminder tells the AI the visit is still to come, not to ask how it went', async () => {
  const key = replied(64, 'Jo', { inText: '', inquiries: [bookingInquiry(tomorrowAt2(), { bookedAt: NOW - 3 * DAY })], ours: [[NOW - 3 * DAY + HOUR, 'Hello Jo, your inspection of the Hiace is booked. See you then.']] });
  followup.refreshFollowUps({ now: fourToday() + 30 * MIN });
  const r = openFor(key)[0];
  assert.equal(r?.kind, 'reminder');
  const was = config.followUp.reminderHour;
  config.followUp.reminderHour = 0;
  ai.behave = echoFit;
  let out;
  try { out = await post(`/api/items/${key}/draft`, { followup: r.id, message: 'inspection_reminder', instruction: 'add that parking is on the street' }); } finally { ai.behave = null; config.followUp.reminderHour = was; }
  assert.equal(out.status, 200);
  const asked = ai.seen[ai.seen.length - 1].messages[1].content;
  assert.match(asked, /still to come/);
  const stray = asked.match(/.{0,80}(as if the visit happened|ask how it went|nder 50 words).{0,40}/);
  assert.equal(stray, null, stray && stray[0]);
});
