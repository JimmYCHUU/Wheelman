// Drafting the right things, and learning the right lessons. All data is invented.
// No AI service is needed: suggestions are inserted directly.
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyTestEnv } from './support/env.js';

applyTestEnv();

const db = await import('../src/db.js');
const items = await import('../src/items.js');
const text = await import('../src/text.js');
const normalize = await import('../src/normalize.js');
const sync = await import('../src/sync.js');
const worker = await import('../src/worker.js');
const time = await import('../src/time.js');

const now = Date.now();
const MIN = 60e3, HOUR = 3600e3;
let mid = 1;

const lead = (id, conv, first, extra = {}) => db.upsertLead({ id, conversationId: conv, firstName: first, lastName: 'Test', phone: '0400111222', email: 'someone@example.com', source: 'carsales', status: 'FOLLOW_UP', platform: 'CARSALES', state: 'NSW', leadAt: now - 2 * HOUR, updatedAt: now - HOUR, stocks: [], inquiries: [], statusHistory: [], ...extra });
const conv = (id, leadId, name, extra = {}) => db.upsertConversation({ id, phone: '+61400111222', channel: 'SMS', status: 'OPEN', leadId, customerName: name, latestDirection: 'IN', latestAt: now - MIN, latestBody: 'x', ...extra });
const msg = (conversationId, direction, body, agoMs, extra = {}) => {
  const id = mid++;
  db.upsertMessage({ id, conversationId, direction, body, sentBy: direction === 'OUT' ? 'Dana' : null, status: 'SENT', mediaType: null, at: now - agoMs, importedAt: now - agoMs, ...extra });
  return id;
};
const item = (conversationId) => items.buildItem({ conversationId });

// ---- what needs no reply -----------------------------------------------------------------

test('happy noises and laughter need no reply; anything with a real point still does', () => {
  for (const t of ['Awesome! I’m excited', 'Hahahaha', "Can't wait!", 'Looking forward to it', 'ok great haha', 'Wow thanks', 'lol ok', 'Sweet, thanks mate', 'Perfect, so excited'])
    assert.equal(text.isAcknowledgement(t), true, t);
  for (const t of ["Can't today", 'Haha, what time do you close', "I'm excited, when can I pick it up", 'Hello', 'Looking forward to hearing about the price', "Can't wait to see it, what's the address", 'Thanks, is it still available?'])
    assert.equal(text.isAcknowledgement(t), false, t);
});

test('an automatic notice is filed as not a customer even when the number has a lead; a real customer never is', () => {
  lead(1, 101, 'Vera'); conv(101, 1, 'Vera Test');
  msg(101, 'IN', 'You have 1 missed call. Missed call service: 61400000000 called at 2:14 pm.', 5 * MIN);
  assert.equal(item(101).state, 'other');

  lead(2, 102, 'Omar'); conv(102, 2, 'Omar Test');
  msg(102, 'IN', 'Sorry I missed your call earlier. I left you a voicemail about the code for the gate.', 5 * MIN);
  assert.equal(item(102).state, 'awaiting', 'a customer with a lead who mentions a voicemail is still a customer');
});

test('a text of ours that failed, or is stuck in the queue, does not count as a reply', () => {
  lead(3, 103, 'Lina'); conv(103, 3, 'Lina Test');
  msg(103, 'IN', 'Is it still available?', 30 * MIN);
  msg(103, 'OUT', 'Yes, it is still available.', 20 * MIN, { status: 'FAILED' });
  assert.equal(item(103).state, 'awaiting', 'the failed text never reached her');
  assert.ok(!item(103).timeline.some((e) => e.who === 'us'));

  // The retry with the same words, a minute later, did go out.
  msg(103, 'OUT', 'Yes, it is still available.', 19 * MIN);
  assert.equal(item(103).state, 'answered');
  assert.equal(item(103).timeline.filter((e) => e.who === 'us').length, 1);

  lead(4, 104, 'Ravi'); conv(104, 4, 'Ravi Test');
  msg(104, 'IN', 'Is it still available?', 60 * MIN);
  msg(104, 'OUT', 'Yes it is.', 40 * MIN, { status: 'QUEUED' });
  assert.equal(item(104).state, 'awaiting', 'queued for 40 minutes means it was not sent');

  lead(5, 105, 'Nora'); conv(105, 5, 'Nora Test');
  msg(105, 'IN', 'Is it still available?', 10 * MIN);
  msg(105, 'OUT', 'Yes it is.', 1 * MIN, { status: 'QUEUED' });
  assert.equal(item(105).state, 'answered', 'queued a minute ago is on its way');
});

test('nothing is written automatically for a message more than a day old', () => {
  lead(6, 106, 'Theo'); conv(106, 6, 'Theo Test');
  msg(106, 'IN', 'Does it have a tow bar fitted?', 30 * HOUR);
  const old = item(106);
  assert.equal(old.state, 'awaiting');
  assert.equal(old.autoDraft, false);
  assert.match(old.autoReason, /more than a day old/);

  lead(7, 107, 'Iris'); conv(107, 7, 'Iris Test');
  msg(107, 'IN', 'Does it have a tow bar fitted?', 3 * HOUR);
  assert.equal(item(107).autoDraft, true);
});

// ---- one item per customer ---------------------------------------------------------------

test('an enquiry keeps its suggestion when the lead later gains a conversation', () => {
  const enquiry = { id: 900, type: 'carsales', text: 'Hello, is this one still available and can I see it on Saturday', at: now - 10 * MIN, staffNotes: [] };
  lead(8, null, 'Kai', { inquiries: [enquiry] });
  const before = items.buildItem({ leadId: 8 });
  assert.equal(before.itemKey, 'l:8');
  assert.equal(before.anchorKey, 'i:900');
  const draftId = db.insertDraft({ itemKey: before.itemKey, anchorKey: before.anchorKey, situation: 'availability', reply: 'Hi Kai,\nYes it is.', status: 'ready', checks: [] });
  db.dismiss('l:8', 'i:900');
  db.markSeen('l:8', 'i:900');

  // The portal relays the same words as a text, which creates the conversation.
  lead(8, 108, 'Kai', { inquiries: [enquiry] });
  conv(108, 8, 'Kai Test');
  msg(108, 'IN', 'Hello, is this one still available and can I see it on Saturday', 9 * MIN);
  assert.equal(db.rekeyLeadItems(), 1);

  const after = items.buildItem({ conversationId: 108 });
  assert.equal(after.itemKey, 'c:108');
  assert.equal(after.anchorKey, 'i:900', 'the relayed text is the same enquiry, so the key does not change');
  assert.equal(after.pending.length, 1, 'the enquiry and its relayed copy are one message');
  assert.equal(db.latestDraft('c:108', 'i:900').id, draftId, 'the suggestion moved with it: no second one is written');
  assert.equal(db.isDismissed('c:108', 'i:900'), true);
  assert.equal(db.isSeen('c:108', 'i:900'), true);
  assert.equal(db.latestDraft('l:8', 'i:900'), undefined);
  assert.equal(db.rekeyLeadItems(), 0);
});

// ---- comparing with what was sent, and learning from it ------------------------------------

test('if the customer wrote again before we replied, the suggestion is superseded and teaches nothing', () => {
  lead(10, 110, 'Bea'); conv(110, 10, 'Bea Test');
  const first = msg(110, 'IN', 'I will give you my new plate number soon', 30 * MIN);
  const id = db.insertDraft({ itemKey: 'c:110', anchorKey: `m:${first}`, situation: 'after_sale', reply: 'Hi Bea,\nThank you, we will note it down.', status: 'ready', checks: [], context: { situations: ['after_sale'], firstReply: true } });
  msg(110, 'IN', 'Also when will the van be ready?', 20 * MIN);
  msg(110, 'OUT', 'The van will be ready to pick up on Friday.', 10 * MIN);

  worker.updateOutcomes();
  const d = db.getDraft(id);
  assert.equal(d.status, 'superseded');
  assert.equal(d.sent_text, null, 'the reply answered her later message, not this one');
  assert.equal(db.allLearned().filter((r) => r.item_key === 'c:110').length, 0);
});

test('our reply is the texts we sent in a row; a later reply to a later message is not part of it', () => {
  lead(11, 111, 'Cleo'); conv(111, 11, 'Cleo Test');
  const anchor = msg(111, 'IN', 'Is the Hiace still available?', 40 * MIN);
  const older = db.insertDraft({ itemKey: 'c:111', anchorKey: `m:${anchor}`, situation: 'availability', reply: 'Hi Cleo,\nYes, the Hiace is available. Feel welcome to visit.\n\nRegards,\nTeam Carbarn', status: 'ready', checks: [], context: { situations: ['availability'], firstReply: true } });
  const newer = db.insertDraft({ itemKey: 'c:111', anchorKey: `m:${anchor}`, situation: 'availability', reply: 'Hi Cleo,\nYes, the Hiace is available and you can visit any day.\n\nRegards,\nTeam Carbarn', status: 'ready', checks: [], context: { situations: ['availability'], firstReply: true } });
  msg(111, 'OUT', 'Hi Cleo, yes the Hiace is still available.', 30 * MIN);
  msg(111, 'OUT', 'You can come any day, we are open 7 days.', 29 * MIN);
  msg(111, 'IN', 'Great, what is your best price?', 20 * MIN);
  msg(111, 'OUT', 'The lowest we can do is $31,500.', 10 * MIN);

  assert.equal(worker.updateOutcomes(), 2, 'both suggestions for the message get the outcome');
  const d = db.getDraft(newer);
  assert.equal(d.status, 'answered');
  assert.equal(d.sent_text, 'Hi Cleo, yes the Hiace is still available.\nYou can come any day, we are open 7 days.');
  assert.ok(!/31,500/.test(d.sent_text));
  assert.equal(db.getDraft(older).status, 'answered');

  const rows = db.allLearned().filter((r) => r.item_key === 'c:111');
  assert.equal(rows.length, 1, 'one lesson per customer message');
  assert.equal(rows[0].draft_id, newer, 'taken from the newest suggestion');
  assert.deepEqual(rows[0].situations, ['availability'], 'filed under what the message was about when the suggestion was written');
  assert.equal(rows[0].first_reply, 1);
  assert.ok(!/Cleo/.test(rows[0].final_text));
});

test('the suggestion that was copied teaches, even when a newer one exists', async () => {
  const learn = await import('../src/learn.js');
  lead(12, 112, 'Dev'); conv(112, 12, 'Dev Test');
  const anchor = msg(112, 'IN', 'How many seats does the Noah have?', 40 * MIN);
  const copied = db.insertDraft({ itemKey: 'c:112', anchorKey: `m:${anchor}`, situation: 'vehicle_details', reply: 'Hi Dev,\nThe Noah has eight seats in total.', status: 'ready', checks: [], context: { situations: ['vehicle_details'], firstReply: true } });
  learn.onCopied(item(112), copied, 'Hi Dev,\nThe Noah has eight seats.');
  const newer = db.insertDraft({ itemKey: 'c:112', anchorKey: `m:${anchor}`, situation: 'vehicle_details', reply: 'Hi Dev,\nIt seats eight people comfortably.', status: 'ready', checks: [], context: { situations: ['vehicle_details'], firstReply: true } });
  msg(112, 'OUT', 'Hi Dev, the Noah has eight seats.', 30 * MIN);
  worker.updateOutcomes();
  const rows = db.allLearned().filter((r) => r.item_key === 'c:112');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].draft_id, copied);
  assert.equal(rows[0].source, 'sent');
  assert.notEqual(rows[0].draft_id, newer);
});

test('the standard address block is never learned, and similarity ignores it', () => {
  const block = '📍Location: Unit D3, 128–130 Frances Street, Lidcombe NSW 2141.\n\n📍Google Maps: https://maps.app.goo.gl/EQfdkTE7FYDF4DTT8\n\n🕗Hours: 8 AM – 5 PM. Open 7 days. Please call or text before visiting.';
  lead(13, 113, 'Eli'); conv(113, 13, 'Eli Test');
  const a = msg(113, 'IN', 'Where are you located?', 40 * MIN);
  const id = db.insertDraft({ itemKey: 'c:113', anchorKey: `m:${a}`, situation: 'location_hours', reply: 'Hi Eli,\nWe are at Unit D3, 128–130 Frances Street, Lidcombe.\n\nRegards,\nTeam Carbarn', status: 'ready', checks: [], context: { situations: ['location_hours'], firstReply: true } });
  msg(113, 'OUT', `Hello,\n${block}`, 30 * MIN);
  worker.updateOutcomes();
  assert.equal(db.getDraft(id).status, 'answered');
  assert.equal(db.allLearned().filter((r) => r.item_key === 'c:113').length, 0, 'a greeting plus the block teaches nothing');

  // A personal line above the block is what gets compared and learned.
  lead(14, 114, 'Finn'); conv(114, 14, 'Finn Test');
  const b = msg(114, 'IN', 'Is the Corolla available and where are you?', 40 * MIN);
  const id2 = db.insertDraft({ itemKey: 'c:114', anchorKey: `m:${b}`, situation: 'availability', reply: 'Hi Finn,\nYes, the Corolla is available at our yard.\n\nRegards,\nTeam Carbarn', status: 'ready', checks: [], context: { situations: ['availability', 'location_hours'], firstReply: true } });
  msg(114, 'OUT', `Hi Finn, yes the Corolla is available and ready to view.\n${block}`, 30 * MIN);
  worker.updateOutcomes();
  const row = db.allLearned().find((r) => r.item_key === 'c:114');
  assert.ok(row);
  assert.ok(!/Frances|maps\.app|8 AM/.test(row.final_text), 'the block is not part of the lesson');
  assert.ok(db.getDraft(id2).similarity > 0.5, String(db.getDraft(id2).similarity));
});

test('the voice bank does not take back a text that Wheelman wrote', async () => {
  const { buildVoiceBank } = await import('../src/voicebank.js');
  lead(15, 115, 'Gus'); conv(115, 15, 'Gus Test');
  const a = msg(115, 'IN', 'Is the Prius still available for sale?', 40 * MIN);
  db.insertDraft({ itemKey: 'c:115', anchorKey: `m:${a}`, situation: 'availability', reply: 'Hi Gus,\nYes, the Prius is still available and ready to drive away today.\n\nRegards,\nTeam Carbarn', status: 'ready', checks: [] });
  msg(115, 'OUT', 'Hi Gus,\nYes, the Prius is still available and ready to drive away today.', 30 * MIN, { sentBy: 'Alex STONE' });

  lead(16, 116, 'Hana'); conv(116, 16, 'Hana Test');
  msg(116, 'IN', 'How many seats does the Vellfire have?', 40 * MIN);
  msg(116, 'OUT', 'It has seven seats and two sliding doors.', 30 * MIN, { sentBy: 'Alex STONE' });

  const bank = buildVoiceBank({ write: false });
  const replies = bank.examples.map((e) => e.reply);
  assert.ok(replies.some((r) => /seven seats/.test(r)), 'a genuine reply is kept');
  assert.ok(!replies.some((r) => /ready to drive away today/.test(r)), 'Wheelman cannot learn from its own text');
  assert.equal(bank.skipped['written by Wheelman'], 1);
});

// ---- what is kept from the dashboard -------------------------------------------------------

test('phone numbers written in different ways compare equal', () => {
  const { phoneKey, phoneKeys } = normalize;
  assert.equal(phoneKey('+61 400 111 222'), '400111222');
  assert.equal(phoneKey('0400 111 222'), '400111222');
  assert.equal(phoneKey('61400111222'), '400111222');
  assert.equal(phoneKey('400111222'), '400111222');
  assert.equal(phoneKey('12345'), '');
  assert.equal(phoneKey('0400111222 0400999888'), '');
  assert.deepEqual(phoneKeys('0400 111 222 | +61400999888'), ['400111222', '400999888']);
  assert.deepEqual(phoneKeys(null, ''), []);
});

test('dates from the dashboard are read in all three forms', () => {
  assert.equal(time.parseDashboardDate('2026-09-24'), '2026-09-24');
  assert.equal(time.parseDashboardDate('23/09/2026'), '2026-09-23');
  assert.equal(time.parseDashboardDate('2026-09-20T10:15:00.250731'), '2026-09-20');
  assert.equal(time.parseDashboardDate(''), null);
  assert.equal(time.parseDashboardDate('not a date'), null);
  assert.equal(time.formatDay('2026-09-24'), '24 Sep 2026');
});

test('a sale is kept as a small digest: no amount, no name, no readable phone or email', () => {
  const raw = {
    id: 7, stockNo: '1300', year: '2020', title: '2020 Toyota Hiace DX', make: 'TOYOTA', model: 'Hiace', modelCode: 'GDH206V', auPublishPrice: 33900, status: 'PUBLISHED', soldStatus: 'UnSold', stockIn: 'Online',
    blueSlipDate: '2026-09-24', registrationCompletedDate: '2026-09-25', rmsInspectionIssueDate: '23/09/2026', registrationNumber: 'ZZZ99Q',
    salesInfo: { salesId: 55, deliveryStatus: 'PENDING_PAYMENT', salesDateTime: '2026-09-20T10:15:00.250731', totalPrice: 31750, paidAmount: 1000, customerName: 'Zed Buyer', customerMobile: '0411 222 333', customerEmail: 'Zed.Buyer@Example.com' },
    paymentSummary: { fobJpy: 987654, outstandingAud: 4321 },
    grossCost: 21000, fob: 1500000,
  };
  sync.storeVehicles([raw]);

  const row = db.openDb().prepare('SELECT * FROM sales WHERE vehicle_id = 7').get();
  assert.equal(row.stage, 'PENDING_PAYMENT');
  assert.equal(row.paid, 'part');
  assert.equal(row.stock_no, '1300');
  assert.ok(row.sold_at > 0);
  const stored = JSON.stringify([row, db.openDb().prepare('SELECT * FROM vehicles WHERE id = 7').get()]);
  for (const secret of ['Zed', 'Buyer', '411222333', '0411', 'example.com', 'Example.com', '31750', '987654', '4321', '21000', '1500000', 'ZZZ99Q', 'paymentSummary', 'salesInfo'])
    assert.ok(!stored.includes(secret), `stored: ${secret}`);

  // The same buyer, texting from the same number written another way, is matched.
  const found = db.salesFor({ phones: normalize.phoneKeys('+61 411 222 333') });
  assert.equal(found.length, 1);
  assert.equal(found[0].matchedBy, 'phone');
  assert.equal(db.salesFor({ emails: ['zed.buyer@example.com'] })[0].matchedBy, 'email');
  assert.equal(db.salesFor({ phones: normalize.phoneKeys('0400 111 222') }).length, 0);

  // Progress dates are kept with the vehicle; the plate itself is not.
  const v = db.getVehicleByStock('1300');
  assert.deepEqual(v.progress, { blueSlip: '2026-09-24', regoDone: '2026-09-25', inspectionIssued: '2026-09-23', lastSeenShipping: null, hasPlate: true });

  assert.equal(normalize.normalizeSale({ ...raw, salesInfo: { ...raw.salesInfo, paidAmount: 31750 } }).paid, 'full');
  assert.equal(normalize.normalizeSale({ ...raw, salesInfo: { ...raw.salesInfo, paidAmount: 0 } }).paid, 'none');
  assert.equal(normalize.normalizeSale({ ...raw, salesInfo: null }), null);

  // When the dashboard no longer shows a sale on the car, the digest goes too.
  sync.storeVehicles([{ ...raw, salesInfo: null }]);
  assert.equal(db.salesFor({ phones: normalize.phoneKeys('0411222333') }).length, 0);
});

test('a lead keeps its stages, and a conversation keeps the summary of a lead this app does not store', () => {
  const l = normalize.normalizeLead({ id: 1, leadStatus: 'FOLLOW_UP', statusHistory: [{ status: 'NEW', time: '2026-09-01T09:00:00', changedBy: 'Some Staff' }, { status: 'DEPOSIT_RECEIVED', time: '2026-09-10T09:00:00', changedBy: 'Some Staff' }] });
  assert.deepEqual(l.statusHistory.map((h) => h.status), ['NEW', 'DEPOSIT_RECEIVED']);
  assert.ok(!JSON.stringify(l).includes('Some Staff'), 'who changed the status is not kept');

  const c = normalize.normalizeConversation({ id: 120, phoneNumber: '+61400111222', channel: 'SMS', status: 'OPEN', lead: { id: 7693, customerName: 'Pat Importer', platform: 'IMPORTS', currentStatus: 'CONTACTED', customerEmail: 'pat@example.com' }, latestMessageAt: '2026-09-29T16:26:00' });
  assert.equal(c.leadPlatform, 'IMPORTS');
  assert.equal(c.leadStatus, 'CONTACTED');

  db.upsertConversation({ ...c, latestAt: now - 5 * MIN });
  msg(120, 'IN', 'Can you email me a copy of the blue slip before Friday?', 5 * MIN);
  const it = item(120);
  assert.equal(it.hasLeadRecord, true, 'the dashboard has a lead for this person, so they are a known customer');
  assert.equal(it.lead.status, 'CONTACTED');
  assert.equal(it.lead.platform, 'IMPORTS');
  assert.equal(it.autoDraft, true);
});
