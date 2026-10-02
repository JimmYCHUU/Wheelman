// Whole-conversation scenarios: who the customer is, what the AI is told, and how a good and a
// bad reply are judged. All data is invented. A stand-in AI service on this computer plays the model.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

process.env.DB_PATH = ':memory:';
process.env.SIGN_OFF = 'Regards,\\nTeam Carbarn';
process.env.GEMINI_API_KEY = 'test-key';
process.env.OPENROUTER_API_KEY = '';
process.env.SECONDS_BETWEEN_DRAFTS = '0';
process.env.DAILY_DRAFT_LIMIT = '200';
process.env.MARKETPLACE_ENABLED = '0';
process.env.VOICE_PEOPLE_FILE = 'voice/people.example.json';

const now = Date.now();
const MIN = 60e3, HOUR = 3600e3, DAY = 24 * HOUR;
const stamp = (agoMs) => new Date(now - agoMs).toISOString().slice(0, 19); // the dashboard writes times with no zone

let server, db, items, drafter, promptModule, sync;
const seen = [];
let script = [];

before(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      seen.push(JSON.parse(body));
      const next = script.shift() || { reply: 'Hi {{NAME}},\nNo worries.', needs_human: [], facts_used: [], hold: false };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(next) }, finish_reason: 'stop' }] }));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { config } = await import('../src/config.js');
  config.llm.gemini.url = `http://127.0.0.1:${server.address().port}/chat`;
  db = await import('../src/db.js');
  items = await import('../src/items.js');
  drafter = await import('../src/drafter.js');
  promptModule = await import('../src/prompt.js');
  sync = await import('../src/sync.js');

  const car = (id, stockNo, title, model, extra = {}) => ({ id, stockNo, year: title.slice(0, 4), title, make: title.split(' ')[1].toUpperCase(), model, modelCode: 'ABC10', auPublishPrice: 21900, odometer: 60000, seats: 5, status: 'PUBLISHED', soldStatus: 'UnSold', stockIn: 'Online', outline: ['6 Months NSW Registration'], ...extra });
  const sale = (id, status, total, paid, mobile, email, agoMs) => ({ salesId: id, deliveryStatus: status, salesDateTime: stamp(agoMs), totalPrice: total, paidAmount: paid, customerName: 'Somebody Private', customerMobile: mobile, customerEmail: email });
  sync.storeVehicles([
    // 1161: deposit paid ten days ago by the buyer on 0412 888 301; registered, no blue slip date on file
    car(1, '1161', '2019 Honda Shuttle Hybrid', 'Shuttle', { registrationCompletedDate: '2026-09-25', rmsInspectionIssueDate: '23/09/2026', registrationNumber: 'AB12CD', salesInfo: sale(9001, 'PENDING_PAYMENT', 21900, 1000, '0412 888 301', 'buyer.one@example.com', 10 * DAY) }),
    // 1200: the same buyer's earlier purchase, long delivered
    car(2, '1200', '2020 Toyota Hiace DX', 'Hiace', { soldStatus: 'SOLD', stockIn: 'Sold', salesInfo: sale(9002, 'VEHICLE_DELIVERED', 30000, 30000, '0412888301', 'buyer.one@example.com', 200 * DAY) }),
    // 1300: ordinary stock
    car(3, '1300', '2021 Toyota Noah X', 'Noah'),
    // 1400: still shown as available, but somebody else has paid a deposit
    car(4, '1400', '2018 Toyota Alphard S', 'Alphard', { salesInfo: sale(9004, 'PENDING_PAYMENT', 21900, 1000, '0499 000 111', 'other@example.com', 2 * DAY) }),
    // 1500: delivered long ago to 0413 111 222
    car(5, '1500', '2017 Toyota Prius S', 'Prius', { soldStatus: 'SOLD', stockIn: 'Sold', salesInfo: sale(9005, 'VEHICLE_DELIVERED', 18000, 18000, '0413 111 222', 'past@example.com', 200 * DAY) }),
    // 1600: paid in full twenty days ago; the buyer texts from a number the sale does not have
    car(6, '1600', '2022 Toyota Corolla Touring', 'Corolla', { salesInfo: sale(9006, 'PAYMENT_COMPLETED', 25000, 25000, '0414 000 000', 'Email.Buyer@example.com', 20 * DAY) }),
    car(7, '1700', '2018 Toyota Alphard G', 'Alphard'),
  ]);
});

after(() => new Promise((r) => { server.close(r); server.closeAllConnections?.(); }));

let mid = 1;
const lead = (id, conv, first, phone, extra = {}) => db.upsertLead({ id, conversationId: conv, firstName: first, lastName: 'Test', phone, email: '', source: 'carsales', status: 'FOLLOW_UP', platform: 'CARSALES', state: 'NSW', leadAt: now - 2 * HOUR, updatedAt: now - HOUR, stocks: [], inquiries: [], statusHistory: [], ...extra });
const conv = (id, leadId, name, phone) => db.upsertConversation({ id, phone, channel: 'SMS', status: 'OPEN', leadId, customerName: name, latestDirection: 'IN', latestAt: now - MIN, latestBody: 'x' });
const msg = (conversationId, direction, body, agoMs, extra = {}) => db.upsertMessage({ id: mid++, conversationId, direction, body, sentBy: direction === 'OUT' ? 'Dana' : null, status: 'SENT', mediaType: null, at: now - agoMs, importedAt: now - agoMs, ...extra });
const item = (id) => items.buildItem({ conversationId: id });
const ask = (id) => promptModule.buildPrompt(item(id), { now }).user;
const draft = async (id, ...replies) => {
  seen.length = 0;
  script = replies.map((reply) => ({ reply, needs_human: /\[CHECK\?\]/.test(reply) ? [{ marker: '[CHECK?]', reason: 'A person must find it.' }] : /\[DATE\?\]/.test(reply) ? [{ marker: '[DATE?]', reason: 'A person must confirm the date.' }] : [], facts_used: [], hold: false }));
  const d = await drafter.draftFor(item(id), { save: false, now });
  return { d, sent: JSON.stringify(seen[0]), asked: seen[0].messages[1].content, attempts: seen.length };
};

// ---- buyers ------------------------------------------------------------------------------

test('a buyer who asks for a document is answered as a buyer, about their own car', async () => {
  // No lead is stored for this person: only the phone number links them to the sale.
  conv(201, null, 'Brad Quimby', '+61412888301');
  msg(201, 'IN', 'Can you email me a copy of the blue slip to get it organised before Friday?', 5 * MIN);

  const it = item(201);
  assert.equal(it.deal.source, 'sale');
  assert.equal(it.deal.matchedBy, 'phone', '+61 412 888 301 is the same number as 0412 888 301');
  assert.equal(it.deal.stage, 'deposit_paid');
  assert.equal(it.vehicles[0].stockNo, '1161', 'the car they are buying, though no stock number is in the conversation');
  assert.deepEqual(it.deal.others.map((o) => o.stockNo), ['1200'], 'their earlier purchase is noted, the newest sale is the subject');
  assert.equal(it.isNewEnquiry, false);
  assert.equal(it.autoDraft, true);
  assert.ok(it.situation.all.includes('after_sale'));

  const { d, sent, asked, attempts } = await draft(201, 'Hi {{NAME}},\nNo worries. We will check on the blue slip for your Shuttle and email it through [CHECK?].');
  assert.match(asked, /=== WHO THIS IS ===\nAn existing buyer, not a new enquiry/);
  assert.match(asked, /Stage: a deposit is recorded; the balance is not yet recorded as paid/);
  assert.match(asked, /On file: registration completed: 25 Sep 2026; RMS inspection report issued: 23 Sep 2026\./);
  assert.match(asked, /Not on file: blue slip\. That does not mean it has not happened/);
  assert.match(asked, /existing buyer\. Earlier contact was by phone, email or in person/);
  assert.match(asked, /This is the customer's own vehicle/);
  assert.ok(!/ask them which one/.test(asked));
  assert.ok(!asked.includes('#inspection='), 'no booking link for a buyer');
  assert.ok(!/SIMILAR VEHICLES/.test(asked));
  const vehicleSection = asked.split('=== VEHICLE FACTS ===')[1].split('\n===')[0];
  assert.ok(!/Advertised price:|Vehicle page:/.test(vehicleSection), 'their own car has no price or listing on offer');
  for (const secret of ['Brad', 'Quimby', '412888301', '0412', 'buyer.one@example.com', 'Somebody Private', '21,900', '21900', 'AB12CD'])
    assert.ok(!sent.includes(secret), `leaked: ${secret}`);
  assert.equal(attempts, 1);
  assert.equal(d.status, 'ready');
  assert.ok(!d.checks.some((c) => c.level === 'fail'), JSON.stringify(d.checks));
  assert.ok(d.checks.some((c) => c.code === 'marker'), 'the blank tells the owner there is something to find');
});

test('a reply that asks a buyer which car they mean is rejected', async () => {
  const bad = 'Hi {{NAME}},\nCould you please let us know which vehicle you are referring to?';
  const { d, attempts } = await draft(201, bad, bad);
  assert.equal(attempts, 2, 'the AI is asked once more');
  assert.ok(d.checks.some((c) => c.level === 'fail' && c.code === 'buyer-ask'), JSON.stringify(d.checks));

  const thanks = 'Hi {{NAME}},\nThank you for your enquiry. We will come back to you.';
  const second = await draft(201, thanks, thanks);
  assert.ok(second.d.checks.some((c) => c.code === 'buyer-ask'));
});

test('a buyer giving a plate number is not offered an inspection or other cars', async () => {
  lead(1, 202, 'Mia', '0414 999 888', { email: 'email.buyer@example.com' });
  conv(202, 1, 'Mia Test', '+61414999888');
  msg(202, 'IN', 'Hi, the plate number I want is going to be MIA22. What time can I come to pick it up?', 5 * MIN);

  const it = item(202);
  assert.equal(it.deal.matchedBy, 'email', 'she texts from a number the sale does not have, so her email links her to it');
  assert.equal(it.deal.stage, 'paid_in_full');
  assert.equal(it.vehicles[0].stockNo, '1600');
  assert.ok(!it.situation.all.includes('inspection_booking'));
  assert.equal(promptModule.inspectionPlan(it).lines.length, 0);
  const asked = ask(202);
  assert.match(asked, /Stage: paid in full; not yet recorded as handed over/);
  assert.ok(!asked.includes('#inspection='));
  assert.match(asked, /use \[DATE\?\] unless our staff gave one/);
});

test('a lead marked "deposit received" is a buyer even with no sale record', async () => {
  lead(2, 203, 'Noel', '0420 111 000', { status: 'DEPOSIT_RECEIVED', stocks: ['1300'], statusHistory: [{ status: 'NEW', at: now - 9 * DAY }, { status: 'DEPOSIT_RECEIVED', at: now - 3 * DAY }] });
  conv(203, 2, 'Noel Test', '+61420111000');
  msg(203, 'IN', 'When will the van be ready to pick up?', 5 * MIN);
  const it = item(203);
  assert.equal(it.deal.source, 'lead_status');
  assert.equal(it.deal.recorded, false);
  assert.equal(it.vehicles[0].stockNo, '1300');
  const asked = ask(203);
  assert.match(asked, /An existing buyer, not a new enquiry: the lead is marked "deposit received"/);
  assert.match(asked, /state no detail of the sale that is not in the conversation/);

  // A stage in the history counts too, unless the lead was lost afterwards.
  lead(3, 204, 'Olga', '0420 222 000', { statusHistory: [{ status: 'DEPOSIT_RECEIVED', at: now - 5 * DAY }, { status: 'FOLLOW_UP', at: now - 4 * DAY }] });
  conv(204, 3, 'Olga Test', '+61420222000');
  msg(204, 'IN', 'Any news on my car?', 5 * MIN);
  assert.equal(item(204).deal.source, 'lead_status');

  lead(4, 205, 'Pia', '0420 333 000', { statusHistory: [{ status: 'DEPOSIT_RECEIVED', at: now - 5 * DAY }, { status: 'FAILED', at: now - 4 * DAY }] });
  conv(205, 4, 'Pia Test', '+61420333000');
  msg(205, 'IN', 'Do you have any other vans?', 5 * MIN);
  assert.equal(item(205).deal, null, 'the sale fell through');
});

test('our own earlier texts can show that someone is a buyer', async () => {
  conv(206, null, 'Quin Buyer', '+61420444000');
  msg(206, 'IN', 'I have paid the deposit', 9 * DAY);
  msg(206, 'OUT', 'Thank you, we have received your deposit. Registration will be done this week.', 9 * DAY - MIN);
  msg(206, 'IN', 'Any update on the rego?', 5 * MIN);
  const it = item(206);
  assert.equal(it.deal.source, 'messages');
  const asked = ask(206);
  assert.match(asked, /This customer appears to be a buyer, not a new enquiry\. Our earlier messages to them say: "Thank you, we have received your deposit\."/);

  // Telling an enquirer that somebody else has paid a deposit does not make them a buyer.
  conv(207, null, 'Ruth Asker', '+61420555000');
  msg(207, 'IN', 'Is the Alphard available?', 2 * DAY);
  msg(207, 'OUT', 'Unfortunately a deposit has been taken on that vehicle by another customer.', 2 * DAY - MIN);
  msg(207, 'IN', 'Ok, do you have another one?', 5 * MIN);
  assert.equal(item(207).deal, null);
});

test('someone who bought long ago, or a buyer asking about a different car, is a returning customer', async () => {
  conv(208, null, 'Sam Past', '+61413111222');
  msg(208, 'IN', 'Hi, do you have any hybrids under 20k at the moment?', 5 * MIN);
  const past = item(208);
  assert.equal(past.deal, null, 'a sale delivered 200 days ago is not a purchase in progress');
  assert.equal(past.pastBuyer.title, '2017 Toyota Prius S');
  assert.equal(past.isNewEnquiry, true);
  assert.match(ask(208), /RETURNING CUSTOMER: our records show they bought 2017 Toyota Prius S from us/);

  // The Shuttle buyer now asks about the Noah, by its link.
  conv(209, null, 'Brad Quimby', '+61412888301');
  msg(209, 'IN', 'Is this one still available? https://www.carbarn.com.au/vehicles/toyota/noah/abc10/1300', 5 * MIN);
  const other = item(209);
  assert.equal(other.deal, null);
  assert.ok(other.pastBuyer);
  assert.equal(other.vehicles[0].stockNo, '1300');
});

test('a car with somebody else\'s deposit on it is not offered as available', async () => {
  const deal = await import('../src/deal.js');
  lead(5, 210, 'Tess', '0420 666 000', { stocks: ['1400'] });
  conv(210, 5, 'Tess Test', '+61420666000');
  msg(210, 'IN', 'Is the Alphard still available? Can I come and see it?', 5 * MIN);
  const it = item(210);
  assert.equal(it.deal, null);
  assert.equal(deal.reservedByAnother(it.vehicles[0]), true);
  const asked = ask(210);
  assert.match(asked, /Availability: Reserved\. Another customer has paid a deposit on this vehicle/);
  assert.ok(!/Available now at the Lidcombe yard\n/.test(asked.split('=== SIMILAR')[0].split('=== VEHICLE FACTS ===')[1]));
  assert.ok(!asked.includes('1400#inspection='), 'no booking link for a reserved car');
  assert.match(asked, /=== SIMILAR VEHICLES AVAILABLE NOW ===\n- 2018 Toyota Alphard G/);
  // The buyer of that car is not told their own car is reserved.
  conv(211, null, 'Uma Owner', '+61499000111');
  msg(211, 'IN', 'When can I pick up my Alphard?', 5 * MIN);
  assert.equal(deal.reservedByAnother(item(211).vehicles[0], item(211).deal), false);
  assert.match(ask(211), /This is the customer's own vehicle/);
});

// ---- memory ------------------------------------------------------------------------------

test('a long conversation keeps its first message and what we already told the customer', async () => {
  lead(6, 212, 'Vic', '0420 777 000', { stocks: ['1300'] });
  conv(212, 6, 'Vic Test', '+61420777000');
  msg(212, 'IN', 'Hello, I am after a family car with seven seats for around twenty thousand.', 20 * DAY);
  msg(212, 'OUT', 'Hi Vic,\nThe lowest we can do on the Noah is $20,500.\n\n📍Location: Unit D3, 128–130 Frances Street, Lidcombe NSW 2141.\n📍Google Maps: https://maps.app.goo.gl/EQfdkTE7FYDF4DTT8\n🕗Hours: 8 AM – 5 PM. Open 7 days.', 20 * DAY - MIN);
  msg(212, 'IN', 'Thanks, can you send the export certificate?', 19 * DAY);
  msg(212, 'OUT', 'We will send you the export certificate shortly.', 19 * DAY - MIN);
  for (let i = 0; i < 24; i++) {
    msg(212, 'IN', `Question number ${i + 1} about the car, with enough words in it to take up some room in the conversation history.`, (18 - i * 0.5) * DAY);
    msg(212, 'OUT', `Answer number ${i + 1}, which is also long enough to take up a fair amount of room in the conversation history.`, (18 - i * 0.5) * DAY - MIN);
  }
  msg(212, 'IN', 'Ok. Is that price you gave me still good?', 5 * MIN);

  const asked = ask(212);
  assert.match(asked, /I am after a family car with seven seats[^\n]*\n\(that was the first message in this conversation\)/);
  assert.match(asked, /\(\d+ messages in between are not shown\)/);
  assert.match(asked, /=== WHAT WE HAVE ALREADY TOLD THIS CUSTOMER ===/);
  assert.match(asked, /- We quoted: "The lowest we can do on the Noah is \$20,500\."/);
  assert.match(asked, /- We said: "We will send you the export certificate shortly\."/);
  assert.match(asked, /Our address, map link and opening hours were sent on/);
  assert.ok(!/Question number 3 about/.test(asked), 'the middle of the conversation is left out');
  assert.match(asked, /Question number 24 about/);
  assert.ok(asked.length < 60000);

  // A price we quoted earlier is ours to repeat, even though that message is no longer shown.
  const { d } = await draft(212, 'Yes, $20,500 still stands.');
  assert.ok(!d.checks.some((c) => c.level === 'fail'), JSON.stringify(d.checks));
});

// ---- the standard first reply --------------------------------------------------------------

const NOAH = 'https://www.carbarn.com.au/vehicles/toyota/noah/abc10/1300';
const block = (url) => [
  '📍Location: Unit D3, 128–130 Frances Street, Lidcombe NSW 2141.',
  '📍Google Maps: https://maps.app.goo.gl/EQfdkTE7FYDF4DTT8',
  '🕗Hours: 8 AM – 5 PM. Open 7 days. Please call or text before visiting.',
  ...(url ? [`Check More Details:\n${url}`] : []),
  'Team Carbarn\n📞 0423 840 130',
].join('\n\n');
const fails = (d) => d.checks.filter((c) => c.level === 'fail').map((c) => c.code);

test('a new enquiry asking where we are gets a short answer and then the exact standard block', async () => {
  lead(7, 220, 'Wren', '0421 000 001', { stocks: ['1300'] });
  conv(220, 7, 'Wren Test', '+61421000001');
  msg(220, 'IN', 'Hi, where are you located and what time do you close?', 5 * MIN);
  assert.equal(item(220).isNewEnquiry, true);

  const { d, asked, attempts } = await draft(220, 'Hi {{NAME}},\nYou are welcome to visit us. Our address and opening hours are below.');
  assert.match(asked, /=== STANDARD FIRST REPLY ===\nThis is a brand-new enquiry\. Our standard block is added below your text automatically/);
  assert.match(asked, /a "Check More Details" line with this vehicle's page link/);
  assert.equal(d.reply, `Hi Wren,\nYou are welcome to visit us. Our address and opening hours are below.\n\n${block(NOAH)}`, 'exact to the character, symbols included');
  assert.ok(!/Regards/.test(d.reply), 'the block takes the place of the sign-off');
  assert.equal(attempts, 1);
  assert.deepEqual(fails(d), []);
  assert.ok(!d.checks.some((c) => c.code === 'emoji'), 'the symbols in the block are not the AI\'s');

  // The AI typing the address or the hours itself is sent back once.
  const typed = 'Hi {{NAME}},\nWe are at Unit D3, 128-130 Frances Street, Lidcombe, open 8 AM to 5 PM.';
  const second = await draft(220, typed, typed);
  assert.equal(second.attempts, 2);
  assert.ok(fails(second.d).includes('block-repeat'), JSON.stringify(second.d.checks));

  // The car's page link on a line of its own is simply dropped: the block gives it.
  const linked = await draft(220, `Hi {{NAME}},\nYes, the Noah is available.\nMore details here:\n${NOAH}`);
  assert.equal(linked.d.reply, `Hi Wren,\nYes, the Noah is available.\n\n${block(NOAH)}`);
  assert.equal(linked.attempts, 1);
});

test('a new enquiry asking to inspect gets the booking link, then the block', async () => {
  lead(8, 221, 'Xavi', '0421 000 002', { stocks: ['1300'] });
  conv(221, 8, 'Xavi Test', '+61421000002');
  msg(221, 'IN', 'Can I come and inspect the Noah this weekend?', 5 * MIN);
  const { d, asked } = await draft(221, `Hi {{NAME}},\nYou are welcome to inspect the Noah. Please choose a time here:\n${NOAH}#inspection=onsite`);
  assert.match(asked, /Our address, map link and opening hours follow your text automatically/);
  assert.ok(!/add the address, the Google Maps link/.test(asked));
  assert.equal(d.reply, `Hi Xavi,\nYou are welcome to inspect the Noah. Please choose a time here:\n${NOAH}#inspection=onsite\n\n${block(NOAH)}`);
  assert.deepEqual(fails(d), [], JSON.stringify(d.checks));
});

test('the block leaves out "Check More Details" when there is no car on offer to point to', async () => {
  lead(9, 222, 'Yara', '0421 000 003', { stocks: ['1500'] }); // the Prius, sold long ago
  conv(222, 9, 'Yara Test', '+61421000003');
  msg(222, 'IN', 'Is the Prius still available?', 5 * MIN);
  const sold = await draft(222, 'Hi {{NAME}},\nUnfortunately, that Prius has been sold.');
  assert.equal(sold.d.reply, `Hi Yara,\nUnfortunately, that Prius has been sold.\n\n${block('')}`);
  assert.ok(!/Check More Details/.test(sold.d.reply));

  lead(10, 223, 'Zane', '0421 000 004');
  conv(223, 10, 'Zane Test', '+61421000004');
  msg(223, 'IN', 'Do you have any vans?', 5 * MIN);
  const none = await draft(223, 'Hi {{NAME}},\nYes, we have several vans in stock. Which size are you after?');
  assert.ok(none.d.reply.endsWith(block('')));
  assert.ok(!/Check More Details/.test(none.d.reply));
  assert.ok(!/this vehicle's page link/.test(none.asked));
});

test('a buyer, a reply later in a conversation and a holding reply do not get the block', async () => {
  const buyer = await draft(201, 'Hi {{NAME}},\nNo worries. We will check on the blue slip and email it through [CHECK?].');
  assert.ok(!/=== STANDARD FIRST REPLY ===/.test(buyer.asked));
  assert.ok(buyer.d.reply.endsWith('Regards,\nTeam Carbarn'));
  assert.ok(!buyer.d.reply.includes('📍'));

  const later = await draft(212, 'Yes, $20,500 still stands.');
  assert.ok(!later.d.reply.includes('📍'));

  // A complaint as a first message is held for a person: no address block under it.
  lead(11, 224, 'Abel', '0421 000 005', { stocks: ['1300'] });
  conv(224, 11, 'Abel Test', '+61421000005');
  msg(224, 'IN', 'I want a refund, this is unacceptable.', 5 * MIN);
  seen.length = 0;
  script = [{ reply: 'Hi {{NAME}},\nSorry to hear that. We will look into this and come back to you shortly.', needs_human: [], facts_used: [], hold: true }];
  const held = await drafter.draftFor(item(224), { save: false, now });
  assert.ok(held.reply.endsWith('Regards,\nTeam Carbarn'), held.reply);
});

test('the standard block is never learned, only the lines a person changed above it', async () => {
  const learn = await import('../src/learn.js');
  lead(12, 225, 'Bea', '0421 000 006', { stocks: ['1300'] });
  conv(225, 12, 'Bea Test', '+61421000006');
  msg(225, 'IN', 'Does the Noah have a reversing camera?', 5 * MIN);
  seen.length = 0;
  script = [{ reply: 'Hi {{NAME}},\nWe will check whether the Noah has a reversing camera [CHECK?].', needs_human: [{ marker: '[CHECK?]', reason: 'not in the records' }], facts_used: [], hold: false }];
  const d = await drafter.draftFor(item(225), { now });
  assert.ok(d.reply.includes('📍'));

  const unchanged = learn.onCopied(item(225), d.id, d.reply.replace(' [CHECK?]', ''));
  assert.equal(unchanged.learned, true, 'filling in the blank is a change worth learning');
  const row = db.allLearned().find((l) => l.draft_id === d.id);
  assert.ok(!/📍|Frances|0423|maps\.app|Check More Details|Team Carbarn/.test(row.final_text), row.final_text);
  assert.ok(!/📍|Frances|0423/.test(row.draft_text));

  const same = learn.onCopied(item(225), d.id, d.reply);
  assert.equal(same.learned, false);
});

// ---- promises, days and places ---------------------------------------------------------------

/** A Sydney clock time on the day before today, so everything around it is safely in the past. */
const sydney = async (hhmm, daysAgo = 1) => {
  const time = await import('../src/time.js');
  return time.parseDashboardTime(`${time.sydneyDay(now - daysAgo * DAY)} ${hhmm}:00`);
};
const draftAt = async (id, at, instruction, ...replies) => {
  seen.length = 0;
  script = replies.map((reply) => ({ reply, needs_human: /\[(CHECK|DATE)\?\]/.test(reply) ? [{ marker: reply.match(/\[(CHECK|DATE)\?\]/)[0], reason: 'A person must confirm.' }] : [], facts_used: [], hold: false }));
  const d = await drafter.draftFor(item(id), { save: false, now: at, instruction });
  return { d, asked: seen[0].messages[1].content, retry: seen[1]?.messages[1].content || '', attempts: seen.length };
};

test('"this afternoon" at 8:44 pm is rejected, even when the instruction asked for it', async () => {
  const at = await sydney('20:44');
  lead(13, 226, 'Cal', '0421 000 007', { status: 'DEPOSIT_RECEIVED', stocks: ['1300'], statusHistory: [{ status: 'DEPOSIT_RECEIVED', at: at - 3 * DAY }] });
  conv(226, 13, 'Cal Test', '+61421000007');
  msg(226, 'IN', 'Can you send me a copy of the blue slip please?', now - (at - 8 * HOUR));

  const instruction = 'Tell him we will send the blue slip this afternoon';
  const { d, asked, retry, attempts } = await draftAt(226, at, instruction,
    'Hi {{NAME}},\nNo worries. We will send the blue slip through this afternoon.',
    'Hi {{NAME}},\nNo worries. We will send the blue slip through shortly.');
  assert.match(asked, /Follow it for what to say\..*It does not override the rules on facts and times/);
  assert.equal(attempts, 2, 'sent back once');
  assert.match(asked, /This was written 8 hours ago/);
  assert.match(retry, /"this afternoon" has already passed: it is 8:44\spm in Sydney/);
  assert.match(retry, /Do not swap one day or time for another/);
  assert.deepEqual(fails(d), []);
  assert.match(d.reply, /through shortly\./);

  // The same promise in the early afternoon is fine: staff asked for it.
  const early = await draftAt(226, at - 7 * HOUR - 30 * MIN, instruction, 'Hi {{NAME}},\nNo worries. We will send the blue slip through this afternoon.');
  assert.deepEqual(fails(early.d), [], JSON.stringify(early.d.checks));
  assert.equal(early.attempts, 1);
});

test('"see you tomorrow" is rejected when the customer said this morning', async () => {
  const at = await sydney('09:30');
  lead(14, 227, 'Dee', '0421 000 008', { stocks: ['1300'] });
  conv(227, 14, 'Dee Test', '+61421000008');
  msg(227, 'IN', 'Is the Noah available?', now - (at - 3 * HOUR));
  msg(227, 'OUT', 'Yes, it is available.', now - (at - 170 * MIN));
  msg(227, 'IN', 'Great, I will come this morning to see it', now - (at - 5 * MIN));

  const wrong = 'No worries, see you tomorrow.';
  const bad = await draftAt(227, at, '', wrong, wrong);
  assert.equal(bad.attempts, 2);
  assert.ok(fails(bad.d).includes('day-mismatch'), JSON.stringify(bad.d.checks));

  const good = await draftAt(227, at, '', 'No worries, see you this morning.');
  assert.deepEqual(fails(good.d), [], JSON.stringify(good.d.checks));
});

test('promises, days and places are judged against what was actually said', async () => {
  const { promiseChecks, dayRefs } = await import('../src/promises.js');
  const time = await import('../src/time.js');
  const at = await sydney('10:00');
  const yesterday = at - DAY;
  const codes = (p) => promiseChecks({ now: at, ...p }).map((c) => `${c.level}:${c.code}`);
  const customer = (text, when = at - 10 * MIN) => ({ who: 'customer', text, at: when });
  const us = (text, when = at - 5 * MIN) => ({ who: 'us', text, at: when });

  // "tomorrow", written yesterday, means today.
  assert.deepEqual(codes({ body: 'See you tomorrow.', said: [customer('Can I come tomorrow at 10?', yesterday)] }), ['fail:day-mismatch']);
  assert.deepEqual(codes({ body: `See you on ${time.sydneyWeekday(at)}.`, said: [customer('Can I come tomorrow at 10?', yesterday)] }), []);
  assert.deepEqual(codes({ body: 'See you on Saturday at 10 am.', said: [customer('Can I come sat at 10?')] }), []);
  assert.deepEqual(codes({ body: 'See you on Sunday.', said: [customer('Can I come sat at 10?')] }), ['fail:day-mismatch']);
  // A written date counts as that day.
  const inThree = at + 3 * DAY;
  const [, mm, dd] = time.sydneyDay(inThree).split('-');
  assert.deepEqual(codes({ body: `See you on ${time.sydneyWeekday(inThree)}.`, said: [customer(`I can come on ${Number(dd)}/${Number(mm)}`)] }), []);
  // Invitations, questions, opening hours and well-wishes are not arrangements.
  for (const body of ['You are welcome to come tomorrow between 8 AM and 5 PM.', 'Would Saturday suit you?', 'We are open 7 days, including Sunday.', 'Have a great Sunday.'])
    assert.deepEqual(codes({ body, said: [customer('When can I see it?')] }), [], body);
  // A day invented for something of ours.
  assert.deepEqual(codes({ body: 'It will be ready on Friday.', said: [customer('When will it be ready?')] }), ['fail:day-mismatch', 'fail:promise']);
  assert.deepEqual(codes({ body: 'It will be ready [DATE?].', said: [customer('When will it be ready?')] }), []);
  assert.deepEqual(codes({ body: 'It will be ready on Friday.', said: [customer('When will it be ready?')], instruction: 'ready friday' }), []);
  // The customer naming a day does not make the car ready that day. Only our side can say so.
  assert.deepEqual(codes({ body: 'We will have both vehicles ready for you on Tuesday.', said: [customer('Ok I will collect both Tuesday then')] }), ['fail:promise']);
  assert.deepEqual(codes({ body: 'We will have both vehicles ready for you on Tuesday.', said: [us('Both will be ready on Tuesday.', at - HOUR), customer('Ok I will collect both Tuesday then')] }), []);
  assert.deepEqual(codes({ body: 'No worries, see you on Tuesday. We will let you know once it is ready.', said: [customer('Ok I will collect both Tuesday then')] }), []);

  // Promises.
  assert.deepEqual(codes({ body: 'We will email the invoice today.', said: [customer('Can I get the invoice?')] }), ['fail:promise']);
  assert.deepEqual(codes({ body: 'We will email the invoice today.', said: [customer('Can I get the invoice?')], instruction: 'say we will email it today' }), []);
  assert.deepEqual(codes({ body: 'We will email the invoice today.', said: [customer('Can I get the invoice?'), us('I will email the invoice today.', at - 2 * HOUR), customer('Still waiting')] }), []);
  assert.deepEqual(codes({ body: 'We will send the invoice shortly.', said: [customer('Can I get the invoice?')] }), ['warn:promise']);
  assert.deepEqual(codes({ body: 'We will check and send the invoice [CHECK?].', said: [customer('Can I get the invoice?')] }), []);
  assert.deepEqual(codes({ body: 'We will send you some photos shortly.', said: [customer('Any photos?')] }), []);
  assert.deepEqual(codes({ body: 'We will check and come back to you shortly.', said: [customer('Is the rego done?')] }), []);
  assert.deepEqual(codes({ body: 'We’ll hold the car for you until Friday.', said: [customer('Can you hold it until Friday?')] }), ['fail:promise'], 'the customer asking is not staff agreeing');

  // A time of day that is over. `at` is 10 am.
  assert.deepEqual(codes({ body: 'We will send it this afternoon.', said: [], instruction: 'send it this afternoon' }), []);
  assert.deepEqual(promiseChecks({ now: at + 3 * HOUR, body: 'See you this morning.', said: [customer('I will come this morning')] }).map((c) => c.code), ['time-passed']);
  assert.deepEqual(promiseChecks({ now: at + 8 * HOUR, body: 'It was registered this morning.', said: [] }), [], 'something that already happened is not a promise');
  assert.deepEqual(promiseChecks({ now: at + 8 * HOUR, body: 'See you today.', said: [customer('today?', at + 7 * HOUR)] }).map((c) => `${c.level}:${c.code}`), ['warn:time-late']);

  // Places.
  assert.deepEqual(codes({ body: 'We can arrange delivery to Queensland.', said: [customer('Do you deliver?')] }), ['fail:location']);
  assert.deepEqual(codes({ body: 'We can arrange delivery to Queensland.', said: [customer('Do you deliver to QLD?')] }), []);
  assert.deepEqual(codes({ body: 'We can arrange delivery to Queensland.', said: [customer('I am in Brisbane, do you deliver?')] }), []);
  assert.deepEqual(codes({ body: 'We can arrange delivery to Melbourne.', said: [customer('Do you deliver?')], knownText: 'We deliver to Melbourne and Brisbane every week.' }), []);

  assert.deepEqual(dayRefs('see you tomorrow', at).map((r) => r.dates[0]), [time.sydneyDay(at + DAY)]);
});

test('a place the customer never mentioned is rejected, and one they did mention is not', async () => {
  // Her record says Victoria. She has not said so, and the AI is not told.
  lead(15, 228, 'Eve', '0421 000 009', { state: 'VIC', stocks: ['1300'] });
  conv(228, 15, 'Eve Test', '+61421000009');
  msg(228, 'IN', 'Can I come and inspect the Noah?', 5 * MIN);
  const guess = `Hi {{NAME}},\nYou are welcome to inspect it: ${NOAH}#inspection=onsite\nIf Victoria is too far, we can do a video call instead: ${NOAH}#inspection=online`;
  const bad = await draft(228, guess, guess);
  assert.ok(!/\bVIC\b|Victoria/.test(bad.asked), 'where the record says she lives is not given to the AI');
  assert.ok(fails(bad.d).includes('location'), JSON.stringify(bad.d.checks));

  lead(16, 229, 'Finn', '0421 000 010', { stocks: ['1300'] });
  conv(229, 16, 'Finn Test', '+61421000010');
  msg(229, 'IN', 'I am in Brisbane. Is there a way to see the Noah before buying?', 5 * MIN);
  const ok = await draft(229, `Hi {{NAME}},\nNo worries, Brisbane is no problem. You can book an online video inspection here:\n${NOAH}#inspection=online`);
  assert.deepEqual(fails(ok.d), [], JSON.stringify(ok.d.checks));
});
