// Whole-conversation scenarios: who the customer is, what the AI is told, and how a good and a
// bad reply are judged. All data is invented. A stand-in AI service on this computer plays the model.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { applyTestEnv } from './support/env.js';
import { startStandins, aiBehaviour } from './support/standins.js';

applyTestEnv({ DAILY_DRAFT_LIMIT: '200' });

const now = Date.now();
const MIN = 60e3, HOUR = 3600e3, DAY = 24 * HOUR;
const stamp = (agoMs) => new Date(now - agoMs).toISOString().slice(0, 19); // the dashboard writes times with no zone

let standins, db, items, drafter, promptModule, sync, appServer;
const ai = aiBehaviour();
const seen = ai.seen;

before(async () => {
  standins = await startStandins({ ai });
  const { config } = await import('../src/config.js');
  config.llm.gemini.url = `${standins.base}/chat`;
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

after(async () => { appServer?.close(); appServer?.closeAllConnections?.(); await standins.close(); });

let mid = 1;
const lead = (id, conv, first, phone, extra = {}) => db.upsertLead({ id, conversationId: conv, firstName: first, lastName: 'Test', phone, email: '', source: 'carsales', status: 'FOLLOW_UP', platform: 'CARSALES', state: 'NSW', leadAt: now - 2 * HOUR, updatedAt: now - HOUR, stocks: [], inquiries: [], statusHistory: [], ...extra });
const conv = (id, leadId, name, phone) => db.upsertConversation({ id, phone, channel: 'SMS', status: 'OPEN', leadId, customerName: name, latestDirection: 'IN', latestAt: now - MIN, latestBody: 'x' });
const msg = (conversationId, direction, body, agoMs, extra = {}) => db.upsertMessage({ id: mid++, conversationId, direction, body, sentBy: direction === 'OUT' ? 'Dana' : null, status: 'SENT', mediaType: null, at: now - agoMs, importedAt: now - agoMs, ...extra });
const item = (id) => items.buildItem({ conversationId: id });
const ask = (id) => promptModule.buildPrompt(item(id), { now }).user;
const draft = async (id, ...replies) => {
  seen.length = 0;
  ai.script =replies.map((reply) => ({ reply, needs_human: /\[CHECK\?\]/.test(reply) ? [{ marker: '[CHECK?]', reason: 'A person must find it.' }] : /\[DATE\?\]/.test(reply) ? [{ marker: '[DATE?]', reason: 'A person must confirm the date.' }] : [], facts_used: [], hold: false }));
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
const block = (url, booking = '') => [
  ...(url ? [`Vehicle details:\n${url}`] : []),
  ...(booking ? [`Book your inspection:\n${booking}`] : []),
  'Our location:\n📍 Unit D3, 128-130 Frances Street, Lidcombe NSW 2141',
  'Google Maps:\nhttps://maps.app.goo.gl/EQfdkTE7FYDF4DTT8',
  '🕛 Open 7 days, 8 AM–5 PM.',
  'Feel free to visit us or call\n📞 0423 840 130\nTeam Carbarn',
].join('\n\n');
const fails = (d) => d.checks.filter((c) => c.level === 'fail').map((c) => c.code);

test('a new enquiry asking where we are gets a short answer and then the exact standard block', async () => {
  lead(7, 220, 'Wren', '0421 000 001', { stocks: ['1300'] });
  conv(220, 7, 'Wren Test', '+61421000001');
  msg(220, 'IN', 'Hi, where are you located and what time do you close?', 5 * MIN);
  assert.equal(item(220).isNewEnquiry, true);

  // Asked where we are, the AI answers in its own sentence. This is the one case where it may give the address and hours itself.
  const answer = 'Hi {{NAME}},\nWe are at 128 Frances Street, Lidcombe, and we are open until 5 PM every day.';
  const { d, asked, attempts } = await draft(220, answer);
  assert.match(asked, /=== STANDARD FIRST REPLY ===\nThis is a brand-new enquiry\. Our standard block is added below your text automatically/);
  assert.match(asked, /this vehicle's page link, the inspection booking link, our address, the Google Maps link, the opening hours and our phone number\./);
  assert.match(asked, /Never point at the block: no "below", "see below" or "details are below"/);
  assert.match(asked, /They asked where we are or when we are open, so answer that in your own sentence/);
  // Someone asking where we are is planning to visit, so the block carries the booking link as well.
  assert.match(asked, /=== INSPECTION ===\nThe customer asked where we are or when we are open, which usually means they plan to visit/);
  assert.equal(d.reply, `Hi Wren,\nWe are at 128 Frances Street, Lidcombe, and we are open until 5 PM every day.\n\n${block(NOAH, `${NOAH}#inspection=onsite`)}`, 'exact to the character, symbols included');
  assert.ok(!/Regards/.test(d.reply), 'the block takes the place of the sign-off');
  assert.equal(attempts, 1);
  assert.deepEqual(fails(d), []);
  assert.ok(!d.checks.some((c) => c.code === 'emoji'), 'the symbols in the block are not the AI\'s');

  // Pointing at the block instead of answering is sent back.
  const pointer = 'Hi {{NAME}},\nYou are welcome to visit us. Our address and opening hours are below.';
  const pointed = await draft(220, pointer, pointer);
  assert.equal(pointed.attempts, 2);
  assert.ok(fails(pointed.d).includes('block-pointer'), JSON.stringify(pointed.d.checks));

  // When nobody asked where we are, the AI typing the address or the hours itself is sent back once.
  lead(34, 247, 'Yuki', '0421 000 028', { stocks: ['1300'] });
  conv(247, 34, 'Yuki Test', '+61421000028');
  msg(247, 'IN', 'Is the Noah still available?', 5 * MIN);
  const typed = 'Hi {{NAME}},\nYes, it is. We are at Unit D3, 128-130 Frances Street, Lidcombe, open 8 AM to 5 PM.';
  const second = await draft(247, typed, typed);
  assert.equal(second.attempts, 2);
  assert.ok(fails(second.d).includes('block-repeat'), JSON.stringify(second.d.checks));
  assert.ok(!/They asked where we are/.test(second.asked));
  assert.ok(!/=== INSPECTION ===/.test(second.asked), 'asking whether a car is available is not asking to visit');

  // The car's page link on a line of its own is simply dropped: the block gives it.
  const linked = await draft(247, `Hi {{NAME}},\nYes, the Noah is available.\nMore details here:\n${NOAH}`);
  assert.equal(linked.d.reply, `Hi Yuki,\nYes, the Noah is available.\n\n${block(NOAH)}`);
  assert.equal(linked.attempts, 1);
});

test('a customer who asks where we are, later in a conversation, is offered the booking link too', async () => {
  lead(35, 248, 'Zara', '0421 000 029', { stocks: ['1300'] });
  conv(248, 35, 'Zara Test', '+61421000029');
  msg(248, 'IN', 'Is the Noah still available?', 3 * HOUR);
  msg(248, 'OUT', 'Yes, it is available.', 170 * MIN);
  msg(248, 'IN', 'Great. What is your address and are you open on Sunday?', 5 * MIN);
  const plan = promptModule.inspectionPlan(item(248));
  assert.equal(plan.kind, 'onsite');
  assert.equal(plan.must, false, 'it is offered, not required');
  const { d } = await draft(248, `We are at 128 Frances Street, Lidcombe, and we are open on Sunday from 8 AM to 5 PM.\nYou can book a time here:\n${NOAH}#inspection=onsite`);
  assert.deepEqual(fails(d), [], JSON.stringify(d.checks));

  // A car that is sold or not here yet gets no booking link for a "where are you" question.
  lead(36, 249, 'Abe', '0421 000 030', { stocks: ['1500'] }); // the Prius, sold long ago
  conv(249, 36, 'Abe Test', '+61421000030');
  msg(249, 'IN', 'Where are you located?', 5 * MIN);
  assert.equal(promptModule.inspectionPlan(item(249)).kind, null);
  assert.ok(!ask(249).includes('#inspection='));
});

test('a model the customer asks us to import brings its page on our website into the request', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const { config } = await import('../src/config.js');
  const knowledge = await import('../src/knowledge.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wheelman-import-'));
  const page = (name, title) => fs.writeFileSync(path.join(dir, `${name}.md`), `<!-- source: https://www.carbarn.com.au/importing/${name} | saved: 2026-10-01 -->\n\nImport ${title} | Carbarn\n\n# ${title} Import to Australia\n`);
  page('suzuki-hustler-jb64w', 'Suzuki Hustler JB64W');
  page('suzuki-hustler-sierra-jb74w', 'Suzuki Hustler Sierra JB74W');
  page('honda-fit-hybrid-gp5', 'Honda Fit Hybrid GP5');
  page('bmw-x5-m50d-g05', 'BMW X5 M50d G05');
  const kept = config.importPagesDir;
  config.importPagesDir = dir;
  try {
    const urls = (t) => knowledge.importPagesFor(t).map((p) => p.url.split('/').pop());
    assert.deepEqual(urls('Do you have a Suzuki Hustler? Can you import one?'), ['suzuki-hustler-jb64w', 'suzuki-hustler-sierra-jb74w']);
    assert.deepEqual(urls('can you get me a hustler sierra from japan'), ['suzuki-hustler-sierra-jb74w', 'suzuki-hustler-jb64w']);
    assert.deepEqual(urls('Can you import a Honda Fit?'), ['honda-fit-hybrid-gp5']);
    assert.deepEqual(urls('Will it fit in my garage if you import it?'), [], 'a short model name counts only with its make');
    assert.deepEqual(urls('Can you import a Toyota Century?'), []);

    lead(37, 250, 'Bo', '0421 000 031');
    conv(250, 37, 'Bo Test', '+61421000031');
    msg(250, 'IN', 'Do you have a Suzuki Hustler? If not, can you import one for me from Japan?', 5 * MIN);
    const link = 'https://www.carbarn.com.au/importing/suzuki-hustler-jb64w';
    const { d, asked } = await draft(250, `Hi {{NAME}},\nWe can source a Suzuki Hustler from Japan for you.\nMore details:\n${link}`);
    assert.ok(asked.includes(`=== IMPORTING PAGES ON OUR WEBSITE ===\nThe customer named a model we can import to order. Its page on our website:\n- Suzuki Hustler JB64W: ${link}`));
    assert.ok(d.reply.includes(`More details:\n${link}`));
    assert.ok(!d.checks.some((c) => c.code === 'link'), JSON.stringify(d.checks));
    // A link to a page that does not exist is still rejected.
    const made = 'Hi {{NAME}},\nWe can import it.\nMore details:\nhttps://www.carbarn.com.au/importing/suzuki-hustler-zz99';
    const bad = await draft(250, made, made);
    assert.ok(fails(bad.d).includes('link'));
  } finally {
    config.importPagesDir = kept;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a new enquiry asking to inspect gets the booking link inside the block, once', async () => {
  lead(8, 221, 'Xavi', '0421 000 002', { stocks: ['1300'] });
  conv(221, 8, 'Xavi Test', '+61421000002');
  msg(221, 'IN', 'Can I come and inspect the Noah this weekend?', 5 * MIN);
  // The AI types the link anyway. The line is dropped, with its lead-in, because the block gives it.
  const { d, asked } = await draft(221, `Hi {{NAME}},\nYou are welcome to inspect the Noah. Please choose a time here:\n${NOAH}#inspection=onsite`);
  assert.match(asked, /Our address, map link and opening hours follow your text automatically/);
  assert.match(asked, /this vehicle's page link, the inspection booking link, our address/);
  assert.ok(!/add the address, the Google Maps link/.test(asked));
  assert.equal(d.reply, `Hi Xavi,\nYou are welcome to inspect the Noah.\n\n${block(NOAH, `${NOAH}#inspection=onsite`)}`);
  assert.deepEqual(fails(d), [], JSON.stringify(d.checks));

  // Typed inside a sentence it cannot be dropped cleanly, so the reply is sent back.
  const inline = `Hi {{NAME}},\nYou can book at ${NOAH}#inspection=onsite any time.`;
  const again = await draft(221, inline, inline);
  assert.ok(fails(again.d).includes('block-repeat'));
});

test('the block leaves out the car and booking parts when there is nothing to point to', async () => {
  lead(9, 222, 'Yara', '0421 000 003', { stocks: ['1500'] }); // the Prius, sold long ago
  conv(222, 9, 'Yara Test', '+61421000003');
  msg(222, 'IN', 'Is the Prius still available?', 5 * MIN);
  const sold = await draft(222, 'Hi {{NAME}},\nUnfortunately, that Prius has been sold.');
  assert.equal(sold.d.reply, `Hi Yara,\nUnfortunately, that Prius has been sold.\n\n${block('')}`);
  assert.ok(!/Vehicle details|Book your inspection/.test(sold.d.reply));

  lead(10, 223, 'Zane', '0421 000 004');
  conv(223, 10, 'Zane Test', '+61421000004');
  msg(223, 'IN', 'Do you have any vans?', 5 * MIN);
  const none = await draft(223, 'Hi {{NAME}},\nYes, we have several vans in stock. Which size are you after?');
  assert.ok(none.d.reply.endsWith(block('')));
  assert.ok(!/Vehicle details|Book your inspection/.test(none.d.reply));
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
  ai.script =[{ reply: 'Hi {{NAME}},\nSorry to hear that. We will look into this and come back to you shortly.', needs_human: [], facts_used: [], hold: true }];
  const held = await drafter.draftFor(item(224), { save: false, now });
  assert.ok(held.reply.endsWith('Regards,\nTeam Carbarn'), held.reply);
});

test('the standard block is never learned, only the lines a person changed above it', async () => {
  const learn = await import('../src/learn.js');
  lead(12, 225, 'Bea', '0421 000 006', { stocks: ['1300'] });
  conv(225, 12, 'Bea Test', '+61421000006');
  msg(225, 'IN', 'Does the Noah have a reversing camera?', 5 * MIN);
  seen.length = 0;
  ai.script =[{ reply: 'Hi {{NAME}},\nWe will check whether the Noah has a reversing camera [CHECK?].', needs_human: [{ marker: '[CHECK?]', reason: 'not in the records' }], facts_used: [], hold: false }];
  const d = await drafter.draftFor(item(225), { now });
  assert.ok(d.reply.includes('📍'));

  const unchanged = learn.onCopied(item(225), d.id, d.reply.replace(' [CHECK?]', ''));
  assert.equal(unchanged.learned, true, 'filling in the blank is a change worth learning');
  const row = db.allLearned().find((l) => l.draft_id === d.id);
  assert.ok(!/📍|Frances|0423|maps\.app|Vehicle details|Our location|Team Carbarn|carbarn\.com\.au/.test(row.final_text), row.final_text);
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
  ai.script =replies.map((reply) => ({ reply, needs_human: /\[(CHECK|DATE)\?\]/.test(reply) ? [{ marker: reply.match(/\[(CHECK|DATE)\?\]/)[0], reason: 'A person must confirm.' }] : [], facts_used: [], hold: false }));
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

// ---- the booking link whenever a customer wants to see a car ---------------------------------

test('every way of asking to see a car counts, and a goodbye does not', async () => {
  const { classify } = await import('../src/situations.js');
  const wants = (t) => classify(t).all.includes('inspection_booking');
  for (const t of ['Hi, is this car available to see this Saturday? Could you please confirm the address', 'Can I inspect tomorrow?', 'Can I see it tomorrow arvo?', 'Is it available for a viewing?', 'Could I view this one on Sunday', 'When can I look at this van?'])
    assert.equal(wants(t), true, t);
  for (const t of ['See you this Saturday', 'Thank you, will message before visiting', 'I cannot see this working for us', 'Is it still available?', 'What time can I pick it up tomorrow?'])
    assert.equal(wants(t), false, t);
});

test('a customer who asks to inspect tomorrow gets the booking link, or the reply is sent back', async () => {
  // Inside a conversation there is no block under the reply, so the AI's own lines must carry the link.
  lead(17, 230, 'Gus', '0421 000 011', { stocks: ['1300'] });
  conv(230, 17, 'Gus Test', '+61421000011');
  msg(230, 'IN', 'Is the Noah still available?', 3 * HOUR);
  msg(230, 'OUT', 'Yes, it is available.', 170 * MIN);
  msg(230, 'IN', 'Can I inspect it tomorrow?', 5 * MIN);
  const without = 'Yes, you are welcome to come tomorrow.';
  const bad = await draft(230, without, without);
  assert.equal(bad.attempts, 2, 'a reply with no booking link is sent back once');
  assert.ok(fails(bad.d).includes('inspection-link'), JSON.stringify(bad.d.checks));
  assert.match(bad.asked, /If they named only a day, say that day is fine and still give the link/);

  const good = await draft(230, without, `Yes, tomorrow is fine. Please choose a time here:\n${NOAH}#inspection=onsite`);
  assert.equal(good.attempts, 2);
  assert.deepEqual(fails(good.d), []);
  assert.ok(good.d.reply.includes(`${NOAH}#inspection=onsite`));
});

test('the booking link follows a customer who asked to see the car earlier and has not been given it', async () => {
  lead(18, 231, 'Hana', '0421 000 012', { stocks: ['1300'] });
  conv(231, 18, 'Hana Test', '+61421000012');
  msg(231, 'IN', 'Hi, is this car available to see this Saturday? Could you please confirm the address', 3 * HOUR);
  msg(231, 'OUT', 'Hello Hana,\nYes, the Noah is available to see this Saturday. We are in Lidcombe, open 8am to 5pm.', 170 * MIN);
  msg(231, 'IN', 'Thank you, will message before visiting', 5 * MIN);
  const it = item(231);
  assert.ok(!it.situation.all.includes('inspection_booking'), 'the message that is waiting does not ask to inspect');
  const plan = promptModule.inspectionPlan(it);
  assert.equal(plan.kind, 'onsite');
  assert.equal(plan.must, false);

  const withLink = await draft(231, `No worries. You can choose a time for Saturday here:\n${NOAH}#inspection=onsite`);
  assert.match(withLink.asked, /=== INSPECTION ===\nEarlier in this conversation the customer asked to see this vehicle, and we have not sent them the booking link yet/);
  assert.deepEqual(fails(withLink.d), [], JSON.stringify(withLink.d.checks));
  // Leaving it out here is pointed out, not rejected.
  const withoutLink = await draft(231, 'No worries. Talk soon.');
  assert.equal(withoutLink.attempts, 1);
  assert.ok(withoutLink.d.checks.some((c) => c.level === 'warn' && c.code === 'inspection-link'));

  // Once the link has gone out, or a visit is confirmed, it is not pushed again.
  msg(231, 'OUT', `No worries. Choose a time here: ${NOAH}#inspection=onsite`, 4 * MIN);
  msg(231, 'IN', 'Great, and does it have a tow bar?', 2 * MIN);
  assert.equal(promptModule.inspectionPlan(item(231)).kind, null);
});

test('asking for the inspection link in Rewrite supplies the real booking link', async () => {
  lead(19, 232, 'Ilse', '0421 000 013', { stocks: ['1300'] });
  conv(232, 19, 'Ilse Test', '+61421000013');
  msg(232, 'IN', 'Is the Noah still available?', 3 * HOUR);
  msg(232, 'OUT', 'Yes, it is available.', 170 * MIN);
  msg(232, 'IN', 'Ok. Does it come with a spare key?', 5 * MIN);
  assert.equal(promptModule.inspectionPlan(item(232)).kind, null, 'nothing about inspecting without the instruction');

  const pageOnly = `We will check on the spare key [CHECK?]. You are welcome to book a time to see it here:\n${NOAH}`;
  const booking = `We will check on the spare key [CHECK?]. You are welcome to book a time to see it here:\n${NOAH}#inspection=onsite`;
  const { d, asked, attempts } = await draftAt(232, now, 'Suggest he books an inspection. Add the inspection link', pageOnly, booking);
  assert.match(asked, /Our staff asked, in their instruction for this draft, for the inspection booking link/);
  assert.ok(asked.includes(`${NOAH}#inspection=onsite`));
  assert.equal(attempts, 2, "the car's page link is not the booking link");
  assert.deepEqual(fails(d), [], JSON.stringify(d.checks));
  assert.ok(d.reply.includes(`${NOAH}#inspection=onsite`));
});

// ---- learning what to say from what the team sends ---------------------------------------------

test('what the team really sent for a similar message is shown, whoever sent it, with nothing of the other customer in it', async () => {
  const practice = await import('../src/practice.js');
  // Sent two days ago by someone who is not one of the two voices, signed with their own name.
  lead(20, 233, 'Jude', '0421 000 014', { stocks: ['1300'], leadAt: now - 3 * DAY, updatedAt: now - 2 * DAY });
  conv(233, 20, 'Jude Test', '+61421000014');
  msg(233, 'IN', 'Do you take trade ins? I have a 2015 Corolla', 2 * DAY);
  msg(233, 'OUT', `Hi Jude,\nYes, we take trade-ins. Please send the rego, the kilometres and a few photos of your car.\nWe could offer around $7,500 for it.\nMore on the Noah here:\n${NOAH}\n\nRegards,\nCasey from Carbarn`, 2 * DAY - 10 * MIN, { sentBy: 'someone.else' });

  // A text sent exactly as Wheelman suggested is Wheelman's own wording: it is not learned.
  lead(21, 234, 'Kai', '0421 000 015', { stocks: ['1300'], leadAt: now - 3 * DAY, updatedAt: now - 2 * DAY });
  conv(234, 21, 'Kai Test', '+61421000015');
  const q = mid;
  msg(234, 'IN', 'Do you accept a trade in on the Noah?', 2 * DAY);
  const own = 'Yes, we accept trade-ins. Please send us a few photos of your vehicle and its odometer reading.';
  db.insertDraft({ itemKey: 'c:234', anchorKey: `m:${q}`, situation: 'trade_in', reply: `Hi Kai,\n${own}\n\nRegards,\nTeam Carbarn`, status: 'ready', checks: [] });
  msg(234, 'OUT', `Hi Kai,\n${own}\n\nRegards,\nTeam Carbarn`, 2 * DAY - 10 * MIN);

  lead(22, 235, 'Lou', '0421 000 016', { stocks: ['1300'] });
  conv(235, 22, 'Lou Test', '+61421000016');
  msg(235, 'IN', 'Hi do you do trade ins? I have a Mazda 3 to trade', 5 * MIN);

  const rows = practice.recentPractice({ now });
  assert.ok(rows.every((r) => /^c:\d+$/.test(r.itemKey)), 'dashboard conversations only');
  assert.ok(rows.some((r) => r.itemKey === 'c:233'));
  assert.ok(!rows.some((r) => r.itemKey === 'c:234'), 'Wheelman does not learn from its own unchanged text');

  const asked = ask(235);
  assert.match(asked, /=== WHAT OUR TEAM REALLY SENT FOR SIMILAR MESSAGES ===\nRecent replies our team sent to other customers/);
  const section = asked.split('=== WHAT OUR TEAM REALLY SENT FOR SIMILAR MESSAGES ===')[1].split('\n===')[0];
  assert.match(section, /We sent: Hi \{\{NAME\}\}, \/ Yes, we take trade-ins\. Please send the rego, the kilometres and a few photos of your car\./);
  assert.match(section, /We could offer around \[amount\] for it/);
  assert.match(section, /More on the Noah here: \/ \[vehicle page link\]/);
  for (const other of ['Jude', 'Casey', '7,500', '7500', NOAH, 'Regards'])
    assert.ok(!section.includes(other), `carried over from the other customer: ${other}`);

  // A label copied into the reply is rejected.
  const copied = 'Hi {{NAME}},\nYes, we take trade-ins. More on the Noah here: [vehicle page link]';
  const bad = await draft(235, copied, copied);
  assert.ok(fails(bad.d).includes('label'), JSON.stringify(bad.d.checks));
});

test('a reply that is only the standard block teaches nothing, and the block is shown as a label', async () => {
  const practice = await import('../src/practice.js');
  lead(23, 236, 'Mae', '0421 000 017', { stocks: ['1300'], leadAt: now - 2 * DAY, updatedAt: now - DAY });
  conv(236, 23, 'Mae Test', '+61421000017');
  msg(236, 'IN', 'What are your opening hours on Sunday?', DAY);
  msg(236, 'OUT', `Hello,\n\n${block(NOAH)}`, DAY - 5 * MIN);
  lead(24, 237, 'Ned', '0421 000 018', { stocks: ['1300'], leadAt: now - 2 * DAY, updatedAt: now - DAY });
  conv(237, 24, 'Ned Test', '+61421000018');
  msg(237, 'IN', 'Are you open on Sunday? Where do I find you?', DAY);
  msg(237, 'OUT', `Hi Ned,\nYes, we are open on Sundays. You are welcome to drop in.\n\n${block(NOAH, `${NOAH}#inspection=onsite`)}`, DAY - 5 * MIN);

  // A name the record does not have, tacked onto a chatty line, is masked; an address is left alone.
  lead(25, 238, 'Pat', '0421 000 019', { stocks: ['1300'], leadAt: now - 2 * DAY, updatedAt: now - DAY });
  conv(238, 25, 'Pat Test', '+61421000019');
  msg(238, 'IN', 'Can I drop in around noon to drop off the paperwork?', DAY);
  msg(238, 'OUT', 'No worries Zed\nWe are at Unit D3, 128 Frances Street', DAY - 5 * MIN);

  const rows = practice.recentPractice({ now });
  assert.ok(!rows.some((r) => r.itemKey === 'c:236'));
  const ned = rows.find((r) => r.itemKey === 'c:237');
  assert.equal(ned.reply, 'Hi {{NAME}},\nYes, we are open on Sundays. You are welcome to drop in.\n[then our standard address block]');
  assert.equal(ned.hadBlock, true);
  assert.equal(rows.find((r) => r.itemKey === 'c:238').reply, 'No worries {{NAME}}\nWe are at Unit D3, 128 Frances Street');
});

test('a customer who asked to inspect and then says he is far away gets the online link', async () => {
  lead(26, 239, 'Quin', '0421 000 020', { stocks: ['1300'] });
  conv(239, 26, 'Quin Test', '+61421000020');
  msg(239, 'IN', 'When is a good day to inspect the Noah?', 30 * MIN);
  msg(239, 'OUT', `You are welcome any day. Please book a time here: ${NOAH}#inspection=onsite`, 25 * MIN);
  msg(239, 'IN', "Too far away, I'm in Brisbane", 5 * MIN);
  const plan = promptModule.inspectionPlan(item(239));
  assert.equal(plan.kind, 'online');
  assert.equal(plan.must, true);

  const without = 'We can arrange transport to Brisbane. Would you like an online video inspection?';
  const bad = await draft(239, without, without);
  assert.ok(fails(bad.d).includes('inspection-link'), JSON.stringify(bad.d.checks));
  const good = await draft(239, `No worries. We can also do an online video inspection. You can choose a time here:\n${NOAH}#inspection=online`);
  assert.deepEqual(fails(good.d), [], JSON.stringify(good.d.checks));
});

// ---- what the owner says about a suggestion ----------------------------------------------------

test('"Good reply" makes a suggestion the model for similar messages; taking it back forgets it', async () => {
  const learn = await import('../src/learn.js');
  const { startServer } = await import('../src/server.js');
  appServer = await startServer();
  const base = `http://127.0.0.1:${appServer.address().port}`;
  const tell = (path, body) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());

  lead(28, 241, 'Sia', '0421 000 022', { stocks: ['1300'] });
  conv(241, 28, 'Sia Test', '+61421000022');
  msg(241, 'IN', 'How many seats does the Noah have?', 5 * MIN);
  seen.length = 0;
  ai.script =[{ reply: 'Hi {{NAME}},\nThe Noah has 5 seats.', needs_human: [], facts_used: [], hold: false }];
  const d = await drafter.draftFor(item(241), { now });
  assert.ok(d.reply.includes('📍'), 'a new enquiry: the suggestion ends with the block');

  // The button on the page.
  const out = await tell(`/api/drafts/${d.id}/rating`, { rating: 'good' });
  assert.equal(out.learned, true);
  const row = db.getLearned(d.id);
  assert.equal(row.source, 'approved');
  assert.equal(row.final_text, 'Hi {{NAME}},\nThe Noah has 5 seats.', 'the name and the address block are not part of what is kept');
  assert.equal((await (await fetch(`${base}/api/status`)).json()).learned.approved, 1);

  // Copying it and sending it unchanged does not undo the approval.
  learn.onCopied(item(241), d.id, d.reply);
  assert.equal(db.getLearned(d.id)?.source, 'approved');

  // A similar message from someone else: the approved reply is shown as the way to write it.
  lead(29, 242, 'Tao', '0421 000 023', { stocks: ['1300'] });
  conv(242, 29, 'Tao Test', '+61421000023');
  msg(242, 'IN', 'Hi, how many seats does the Noah have?', 4 * MIN);
  const asked = ask(242);
  assert.match(asked, /=== HOW THE OWNER WANTS THIS HANDLED ===/);
  assert.match(asked, /Approved as written, for a similar message\n  Customer: How many seats does the Noah have\?\n  You wrote: Hi \{\{NAME\}\}, \/ The Noah has 5 seats\.\n  Handle this one the same way/);
  const section = asked.split('=== HOW THE OWNER WANTS THIS HANDLED ===')[1].split('\n===')[0];
  assert.ok(!/Sia|📍|Frances/.test(section));

  // Taking the approval back.
  assert.equal((await tell(`/api/drafts/${d.id}/rating`, { rating: '' })).learned, false);
  assert.equal(db.getLearned(d.id), null);
  assert.ok(!/Approved as written/.test(ask(242)));
});

test('"Could be better" is coaching: a lesson is taken from it, and the lesson, not the wording, is what is kept', async () => {
  const learn = await import('../src/learn.js');
  const base = `http://127.0.0.1:${appServer.address().port}`;
  const tell = (path, body) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
  const d = db.latestDraft('c:241', item(241).anchorKey);
  const note = 'Too short for Sia. She already knows it is a people mover, so tell her about the other seating layouts we have and invite her to come and see it. Jordan looks after these, no need to tell the customer that.';
  const lesson = { scope: 'vehicle_details', when: 'a customer asks how many seats a car has', do: 'Give the number, mention other seating layouts we stock, and invite the customer to come and see the car.', internal: false };

  // Two AI requests follow: one to take the lesson from the note, one to write the reply again.
  seen.length = 0;
  ai.script =[
    { lessons: [lesson, { scope: 'nonsense', when: 'any reply', do: 'Keep staff arrangements to ourselves.', internal: true }] },
    { reply: 'Hi {{NAME}},\nThe Noah has 5 seats, and we have seven and eight seat people movers as well. You are welcome to come and see them.', needs_human: [], facts_used: [], hold: false },
  ];
  const out = await tell(`/api/drafts/${d.id}/advice`, { note });
  assert.equal(out.learned, true);
  assert.equal(seen.length, 2);
  assert.deepEqual(out.lessons[0], lesson);
  assert.equal(out.lessons[1].scope, 'any', 'a scope the app does not know becomes "any"');
  assert.match(out.item.draft.reply, /seven and eight seat people movers/);
  assert.equal(db.getDraft(d.id).rating, 'edit');

  // The lesson request: the note goes with the customer's name taken out.
  const lessonAsk = seen[0].messages[1].content;
  assert.match(seen[0].messages[0].content, /It teaches how to handle this kind of message\. It is not text for a customer\./);
  assert.ok(lessonAsk.includes('Too short for {{NAME}}.') && !lessonAsk.includes('Sia'));
  // The rewrite request: the note is coaching, not wording.
  const rewriteAsk = seen[1].messages[1].content;
  assert.match(rewriteAsk, /=== THE OWNER'S COACHING ON YOUR LAST DRAFT ===\nYour last draft for this message was:\nHi \{\{NAME\}\},\nThe Noah has 5 seats\./);
  assert.match(rewriteAsk, /It is written to you, about how to handle this message\. It is not text for the customer/);
  assert.match(rewriteAsk, /do not repeat the note's wording/);

  const stored = db.allAdvice()[0];
  assert.ok(!stored.note.includes('Sia'));
  assert.equal(stored.lessons.length, 2);

  // A similar message later: the lesson is shown, the owner's own words are not.
  const similar = ask(242);
  const section = similar.split('=== HOW THE OWNER WANTS THIS HANDLED ===')[1].split('\n===')[0];
  assert.match(section, /It is not wording for the customer: act on it, and never repeat its words in a reply/);
  assert.match(section, /- When a customer asks how many seats a car has: Give the number, mention other seating layouts we stock, and invite the customer to come and see the car\./);
  assert.match(section, /- INTERNAL\. When any reply: Keep staff arrangements to ourselves\./);
  assert.ok(!/Too short for|She already knows|Jordan/.test(section), 'the note itself is not replayed');

  // A different kind of message gets only the lesson that applies to every reply.
  lead(30, 243, 'Una', '0421 000 024', { stocks: ['1300'] });
  conv(243, 30, 'Una Test', '+61421000024');
  msg(243, 'IN', 'Is the price negotiable?', 3 * MIN);
  const other = ask(243);
  assert.ok(!other.includes('mention other seating layouts'));
  assert.match(other, /- INTERNAL\. When any reply: Keep staff arrangements to ourselves\./);

  // A rewrite that pastes the owner's words is sent back.
  const pasted = 'Hi {{NAME}},\nShe already knows it is a people mover, so we have other seating layouts.';
  seen.length = 0;
  ai.script =[pasted, pasted].map((reply) => ({ reply, needs_human: [], facts_used: [], hold: false }));
  const copied = await drafter.draftFor(item(241), { save: false, now, coaching: { note, draft: d.reply } });
  assert.equal(seen.length, 2);
  assert.ok(fails(copied).includes('coaching-copied'), JSON.stringify(copied.checks));

  // An empty note is nothing, and asks the AI nothing.
  seen.length = 0;
  assert.equal((await tell(`/api/drafts/${d.id}/advice`, { note: '   ' })).learned, false);
  assert.equal(seen.length, 0);

  // A note written while no AI model could answer is kept, shown as a note until its lesson is worked out.
  lead(33, 246, 'Xin', '0421 000 027', { stocks: ['1300'] });
  conv(246, 33, 'Xin Test', '+61421000027');
  msg(246, 'IN', 'Is the price on the Noah negotiable at all?', 6 * MIN);
  db.insertAdvice({ draftId: null, itemKey: 'c:246', situations: ['price_negotiation'], firstReply: true, customerText: 'Is the price on the Noah negotiable at all?', draftText: 'Hi {{NAME}},\nThe price is [PRICE?].', note: 'Invite them to inspect first, we talk price in person.' });
  assert.match(ask(243), /A coaching note on a similar message, in the owner's own words\. Take the lesson from it; do not quote it\.\n  You had written: Hi \{\{NAME\}\}, \/ The price is \[PRICE\?\]\.\n  The note: Invite them to inspect first/);
  seen.length = 0;
  ai.script =[{ lessons: [{ scope: 'price_negotiation', when: 'a customer asks for a better price', do: 'Invite them to inspect the car first; price is discussed in person.', internal: false }] }];
  assert.equal(await learn.distilPending(), 1);
  const after = ask(243);
  assert.match(after, /- When a customer asks for a better price: Invite them to inspect the car first; price is discussed in person\./);
  assert.ok(!after.includes('we talk price in person'), 'once the lesson is known, the note is no longer shown');
});

test('when the car asked about has gone, the page listing our other cars of that model is offered', async () => {
  // 1400 is the Alphard with somebody else's deposit; 1700 is another Alphard, available.
  const asked = ask(210);
  const link = 'https://www.carbarn.com.au/used-cars/toyota/alphard';
  assert.ok(asked.includes(`All our Toyota Alphard vehicles in stock (1 available now): ${link}`));
  const { d } = await draft(210, `Hi {{NAME}},\nUnfortunately, that Alphard is reserved. Our other Alphards are here:\n${link}`);
  assert.ok(!d.checks.some((c) => c.code === 'link'), JSON.stringify(d.checks));
  // A car with no other of its model in stock gets no such line.
  assert.ok(!ask(222).includes('All our Toyota Prius vehicles'));
});

test('asking to see a car by its model name counts as wanting to inspect', async () => {
  lead(31, 244, 'Vera', '0421 000 025', { stocks: ['1300'] });
  conv(244, 31, 'Vera Test', '+61421000025');
  msg(244, 'IN', "I'm in Perth. Is there any way to see the Noah before buying?", 5 * MIN);
  const it = item(244);
  assert.ok(it.situation.all.includes('inspection_booking'));
  assert.equal(promptModule.inspectionPlan(it).kind, 'online');

  lead(32, 245, 'Wade', '0421 000 026', { stocks: ['1300'] });
  conv(245, 32, 'Wade Test', '+61421000026');
  msg(245, 'IN', 'Can I see the Noah photos and the price history?', 5 * MIN);
  assert.ok(!item(245).situation.all.includes('inspection_booking'), 'asking to see its photos is not asking to inspect');
});

test('someone who writes to a staff member by name is not a brand-new enquiry, so gets no address block', async () => {
  // voice/people.example.json names Alex and Sam as the two voices.
  lead(27, 240, 'Rory', '0421 000 021');
  conv(240, 27, 'Rory Test', '+61421000021');
  msg(240, 'IN', 'Hi Sam, sorry can we change the appointment to 10:45 tomorrow instead?', 5 * MIN);
  const it = item(240);
  assert.equal(it.isFirstReply, true);
  assert.equal(it.isNewEnquiry, false);
  const { d, asked } = await draft(240, 'No worries, {{NAME}}. See you tomorrow at 10:45.');
  assert.ok(!/=== STANDARD FIRST REPLY ===/.test(asked));
  assert.equal(d.reply, 'No worries, Rory. See you tomorrow at 10:45.\n\nRegards,\nTeam Carbarn');
});

test('a short reply that matches an earlier one is only noted, and a car trim name is not taken for an address', async () => {
  const { checkDraft } = await import('../src/checks.js');
  const { redact } = await import('../src/redact.js');
  const short = checkDraft({ reply: 'Hi Ann,\nYour inspection is confirmed. See you on Saturday at 10 am.', body: 'Hi {{NAME}},\nYour inspection is confirmed. See you on Saturday at 10 am.', examples: ['Hi {{NAME}},\nYour inspection is confirmed. See you on Saturday at 10 am.'], customerText: 'Saturday 10 am' });
  assert.ok(short.some((c) => c.level === 'warn' && c.code === 'copied'));
  assert.ok(!short.some((c) => c.level === 'fail'));
  const long = 'Hi {{NAME}},\nUnfortunately that van has been sold. We have two similar vans in stock at the moment and you are welcome to come and see them any day this week.';
  assert.ok(checkDraft({ reply: long, body: long, examples: [long] }).some((c) => c.level === 'fail' && c.code === 'copied'));

  assert.equal(redact('Is the 2019 Nissan Serena Highway Star V still available?', {}), 'Is the 2019 Nissan Serena Highway Star V still available?');
  assert.equal(redact('I live at 12 Great Western Highway', {}), 'I live at [ADDRESS]');
});
