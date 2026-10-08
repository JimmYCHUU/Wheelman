// The dashboard's notification feed: a new lead sets off a check at once instead of at the next
// few-minute tick, a change to a car refreshes the vehicle list, and an enquiry from another
// Carbarn site, announced by the feed but never on the Sydney lead list, is counted and left
// alone. All data is invented; the stand-in plays the dashboard and the AI.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { applyTestEnv } from './support/env.js';
import { startStandins, aiBehaviour } from './support/standins.js';
import { pointConfigAt } from './support/wire.js';
import { world as makeWorld, sydneyNaive } from './support/fixtures.js';

applyTestEnv({ NOTIFICATIONS_SECONDS: '30' });

const now = Date.now();
const MIN = 60e3;
const sessionFile = path.join(os.tmpdir(), `wheelman-alerts-session-${process.pid}.json`);
const ai = aiBehaviour();
let standins, calls, config, db, worker, notifications, dash, world;

const LEADS = '/core/user/api/v1/lead/paginated';
const VEHICLES = '/carbarnau/api/v1/vehicles';
const FEED = '/carbarnau/api/notifications';
const hits = (p) => calls.filter((c) => c.path === p).length;
const draftsFor = (itemKey) => db.openDb().prepare('SELECT COUNT(*) AS n FROM drafts WHERE item_key = ?').get(itemKey).n;
/** A brand-new enquiry on the dashboard: the lead, its conversation with one text, and the feed entry. */
function enquiryArrives({ leadId, conversationId, noteId, first, last, phone, text }) {
  const lead = { ...world.leads.carbarnau[0], id: leadId, conversationId, customerFirstName: first, customerLastName: last, customerPhone: phone, customerEmail: `${first.toLowerCase()}@example.com`, leadDate: sydneyNaive(now - 2 * MIN), updatedAt: sydneyNaive(now - MIN), stocks: ['1201'], inquiries: [] };
  world.leads.carbarnau.unshift(lead);
  const shape = world.conversations[0];
  world.conversations.unshift({
    row: { ...shape.row, id: conversationId, phoneNumber: `+61${phone.replace(/\D/g, '').slice(1)}`, lead: { id: leadId, customerName: `${first} ${last}`, platform: lead.platform, currentStatus: lead.leadStatus, customerEmail: lead.customerEmail }, latestMessageDirection: 'IN', latestMessageAt: sydneyNaive(now - 2 * MIN), latestMessageBody: text },
    messages: [{ ...shape.messages[0], id: 9000 + leadId, conversationId, direction: 'IN', body: text, sentBy: null, providerCreatedAt: sydneyNaive(now - 2 * MIN), createdAt: sydneyNaive(now - 2 * MIN + 4000) }],
  });
  world.notifications.unshift(note(noteId, 'LEAD_INQUIRY_RECEIVED', `A new inquiry received from ${first} ${last} for stock 1201.`, `/dashboard/leads?leadId=${leadId}`, 'carsales.com.au', MIN));
}
const note = (id, type, body, url, actor, agoMs = MIN) => ({ id, type, title: type, body, url, actorUsername: actor, read: false, createdAt: new Date(now - agoMs).toISOString() });

before(async () => {
  world = makeWorld(now);
  world.notifications = [
    note(1001, 'LEAD_INQUIRY_RECEIVED', 'A new inquiry received from Priya Raman for stock 1159.', '/dashboard/leads?leadId=101', 'carsales.com.au', 20 * MIN),
    note(1002, 'VEHICLE_VIA_STATUS_UPDATED', 'VIA status updated for vehicle 1 / ABC123 to RFI.', '/dashboard/au-vehicles?chassisNo=ABC123', 'Staff', 10 * MIN),
  ];
  standins = await startStandins({ world, ai });
  calls = standins.calls;
  ({ config } = await import('../src/config.js'));
  pointConfigAt(config, standins, { sessionPath: sessionFile, port: 0 }); // never the real session file
  db = await import('../src/db.js');
  worker = await import('../src/worker.js');
  notifications = await import('../src/notifications.js');
  dash = await import('../src/dashboard.js');
  db.openDb();
  await worker.cycle(); // the first check, on the world as it stands
});

after(async () => { await standins.close(); fs.rmSync(sessionFile, { force: true }); });

test('the feed in one shape: the lead and the stock an entry names, and which entries are about a car', () => {
  const [a, b] = notifications.parseNotifications(world.notifications);
  assert.deepEqual([a.id, a.type, a.leadId, a.stockNo, a.source, a.read], [1001, 'LEAD_INQUIRY_RECEIVED', 101, '1159', 'carsales.com.au', false]);
  assert.ok(a.at > 0);
  assert.deepEqual([b.leadId, b.stockNo, notifications.VEHICLE_TYPES.test(b.type)], [null, '', false], 'an import-approval step changes nothing a reply says');
  for (const type of ['VEHICLE_MARKED_SOLD', 'VEHICLE_PRICE_UPDATED', 'VEHICLE_PUBLISH_STATUS_UPDATED', 'VEHICLE_REGO_COMPLETED']) assert.ok(notifications.VEHICLE_TYPES.test(type), type);
  assert.equal(notifications.parseNotifications([...world.notifications, { id: 'x' }, null, {}]).length, 2, 'entries without an id are left out');
  assert.equal(notifications.parseNotifications(null).length, 0);
  assert.equal(notifications.parseNotifications([{ id: 5, type: 'LEAD_INQUIRY_RECEIVED', body: 'A new inquiry received from 3105550123.', url: '/dashboard/leads?leadId=9' }])[0].stockNo, '', 'no stock named');
});

test('the first read only records where the feed stands: an old backlog sets off nothing', async () => {
  const before = hits(LEADS);
  const r = await worker.checkAlerts();
  assert.deepEqual([r.ok, r.triggered, r.newLeads], [true, false, 0]);
  assert.equal(db.getMeta('notifications_last_id', 0), 1002);
  assert.equal(hits(LEADS), before, 'no check was run');
  assert.equal(hits(FEED), 1);
  const s = worker.statusReport().alerts;
  assert.deepEqual([s.on, s.everySeconds, s.ok, s.triggered], [true, 30, true, false]);
});

test('a new lead on the Sydney list sets off a check at once, so its text is in Wheelman within one poll, and its suggestion follows', async () => {
  enquiryArrives({ leadId: 150, conversationId: 250, noteId: 1003, first: 'Noor', last: 'Test', phone: '0491 570 150', text: 'Hi, is the Hiace still available?' });
  assert.ok(!db.getLead(150), 'not known before the poll');

  const r = await worker.checkAlerts();
  assert.deepEqual([r.ok, r.triggered, r.checks, r.newLeads, r.skipped], [true, true, 1, 1, 0]);
  assert.ok(db.getLead(150), 'the lead was read');
  assert.ok(db.getConversation(250), 'and its conversation');
  assert.equal(db.getMeta('notifications_last_id', 0), 1003);
  assert.match(r.message, /1 new lead/);
  assert.equal(r.lastLeadAt, Date.parse(world.notifications[0].createdAt));
  // The suggestion is written in the background, so the feed loop is not held up by the AI.
  await worker.state.draftRun;
  assert.ok(draftsFor('c:250') >= 1, 'a suggestion was written for it');
});

test('a lead announced while a suggestion is being written for someone else is listed at once; its suggestion follows when the AI is free', async () => {
  enquiryArrives({ leadId: 160, conversationId: 260, noteId: 1004, first: 'Mira', last: 'Test', phone: '0491 570 160', text: 'Is the Hiace automatic?' });
  worker.state.drafting = true; // a suggestion for someone else is being written
  const r = await worker.checkAlerts();
  assert.deepEqual([r.ok, r.triggered, r.checks, r.newLeads], [true, true, 1, 1]);
  assert.ok(db.getLead(160) && db.getConversation(260), 'listed without waiting for the drafting to end');
  assert.equal(draftsFor('c:260'), 0, 'nothing written yet: the AI is busy with someone else');
  assert.equal(worker.state.draftAgain, true, 'one more pass is owed');
  worker.state.drafting = false; // that suggestion is done
  await worker.draftWaiting();
  assert.ok(draftsFor('c:260') >= 1, 'now its suggestion is written');
  assert.equal(worker.state.draftAgain, false);
});

test('a lead announced while a check is already under way is checked for again, since that check began before the feed was read', async () => {
  const underWay = worker.runSync();
  world.notifications.unshift(note(1005, 'LEAD_INQUIRY_RECEIVED', 'A new inquiry received from 3105550199.', '/dashboard/leads?leadId=170', 'Lead Service', MIN));
  const r = await worker.checkAlerts();
  await underWay;
  assert.deepEqual([r.triggered, r.checks, r.newLeads, r.skipped], [true, 2, 1, 1]);
});

test('an enquiry from another Carbarn site is announced but never on the Sydney list: one check, counted, then left alone', async () => {
  world.notifications.unshift(note(1006, 'LEAD_INQUIRY_RECEIVED', 'A new inquiry received from 3105550123.', '/dashboard/leads?leadId=151', 'Lead Service', MIN));
  const before = hits(LEADS);
  let r = await worker.checkAlerts();
  // skippedTotal counts the one announced during the check under way, above, as well.
  assert.deepEqual([r.triggered, r.newLeads, r.skipped, r.skippedTotal], [true, 1, 1, 2]);
  assert.ok(hits(LEADS) > before, 'the check ran');
  assert.ok(!db.getLead(151), 'and the Sydney list did not carry it');
  const again = hits(LEADS);
  r = await worker.checkAlerts();
  assert.deepEqual([r.triggered, r.newLeads, r.skipped, r.skippedTotal], [false, 0, 0, 2], 'nothing new: no second check');
  assert.equal(hits(LEADS), again);
});

test('a change to a car refreshes the vehicle list at the next check instead of in half an hour', async () => {
  const before = hits(VEHICLES);
  await worker.checkAlerts();
  assert.equal(hits(VEHICLES), before, 'the list is fresh, so a quiet poll does not read it');
  world.notifications.unshift(note(1007, 'VEHICLE_PRICE_UPDATED', 'Vehicle price updated for vehicle 1201 / GDH206-0002.', '/dashboard/au-vehicles?chassisNo=GDH206-0002', 'Staff', MIN));
  const r = await worker.checkAlerts();
  assert.deepEqual([r.triggered, r.newLeads, worker.state.vehiclesStale], [true, 0, false]);
  assert.equal(hits(VEHICLES), before + 1, 'read again at once');
});

test('the feed being down is noted on the status and changes nothing else', async () => {
  world.notificationsDown = true;
  const r = await worker.checkAlerts();
  assert.deepEqual([r.ok, r.triggered], [false, false]);
  assert.match(r.message, /503/);
  assert.equal(worker.statusReport().alerts.ok, false);
  world.notificationsDown = false;
  assert.equal((await worker.checkAlerts()).ok, true);
});

test('the feed is on the read-only list, nothing under it is, and every request to the dashboard was a GET', async () => {
  assert.equal((await dash.fetchNotifications(2)).length, 2);
  await assert.rejects(() => dash.get('/carbarnau/api/notifications/1001'), /Blocked/);
  await assert.rejects(() => dash.get('/carbarnau/api/notifications/mark-read'), /Blocked/);
  // The stand-in also plays the AI (/chat) and the website's auction cost calculator (/auc/…),
  // which both take a POST; neither is the dashboard.
  assert.ok(!calls.some((c) => c.method !== 'GET' && !/signin|refreshtoken|^\/auc\/|^\/chat$/.test(c.path)), 'on the dashboard, only the sign-in is ever a POST');
});

test('switched off: the feed is not read at all', async () => {
  const was = config.notificationsSeconds;
  config.notificationsSeconds = 0;
  const n = hits(FEED);
  assert.equal(await worker.checkAlerts(), null);
  assert.equal(hits(FEED), n);
  assert.equal(worker.statusReport().alerts.on, false);
  config.notificationsSeconds = was;
});
