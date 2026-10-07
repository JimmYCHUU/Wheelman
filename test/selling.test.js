// Selling: where a customer is on the way to a sale, the one move and the one question the reply
// gets, the checks that refuse pressure and filler, and the saved next step. All data is invented;
// a stand-in AI service on this computer plays the model.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { applyTestEnv } from './support/env.js';
import { startStandins, aiBehaviour } from './support/standins.js';

applyTestEnv({ DAILY_DRAFT_LIMIT: '200' });

const now = Date.now();
const MIN = 60e3, HOUR = 3600e3, DAY = 24 * HOUR;

let standins, db, items, drafter, promptModule, sync, checks, selling, appServer, base;
const ai = aiBehaviour();
const seen = ai.seen;

before(async () => {
  standins = await startStandins({ ai });
  const { config } = await import('../src/config.js');
  config.llm.gemini.url = `${standins.base}/chat`;
  config.port = 0;
  db = await import('../src/db.js');
  items = await import('../src/items.js');
  drafter = await import('../src/drafter.js');
  promptModule = await import('../src/prompt.js');
  sync = await import('../src/sync.js');
  checks = await import('../src/checks.js');
  selling = await import('../src/selling.js');
  const car = (id, stockNo, title, model, extra = {}) => ({ id, stockNo, year: title.slice(0, 4), title, make: title.split(' ')[1].toUpperCase(), model, modelCode: 'ABC10', auPublishPrice: 28900, odometer: 60000, seats: 8, status: 'PUBLISHED', soldStatus: 'UnSold', stockIn: 'Online', outline: ['6 Months NSW Registration', '5-Year Extended Warranty'], ...extra });
  sync.storeVehicles([car(1, '1300', '2021 Toyota Noah X', 'Noah'), car(2, '1200', '2020 Toyota Hiace DX', 'Hiace', { soldStatus: 'SOLD', stockIn: 'Sold' })]);
  appServer = await (await import('../src/server.js')).startServer();
  base = `http://127.0.0.1:${appServer.address().port}`;
});

after(async () => { appServer?.close(); appServer?.closeAllConnections?.(); await standins.close(); });

// A plain item, enough for saleStage: it reads only these fields.
const plain = ({ situations = ['general'], texts = [], events = [], channel = 'sms', deal = null, vehicles = [], state = 'NSW', pendingText = '' } = {}) => ({
  channel, deal, vehicles, lead: { state }, pendingText: pendingText || texts.filter((t) => t.who === 'customer').map((t) => t.text).at(-1) || '',
  situation: { all: situations, primary: situations[0] },
  timeline: [...texts.map((t, i) => ({ who: t.who, text: t.text, at: now - (texts.length - i) * HOUR })), ...events.map((e) => ({ who: 'customer', event: e, at: now - MIN }))],
});
const stage = (opts) => selling.saleStage(plain(opts), { now });

test('where the customer is: interest, proof, fit, commit, buyer', () => {
  const first = stage({ situations: ['availability'], texts: [{ who: 'customer', text: 'Is the Noah still available?' }] });
  assert.deepEqual([first.rung, first.move, first.allowsUrgency], ['interest', 'invite_inspection', false]);
  assert.match(first.question, /see it/);

  const price = stage({ situations: ['price_negotiation'], texts: [{ who: 'customer', text: 'Hi' }, { who: 'us', text: 'Hi, yes it is.' }, { who: 'customer', text: "What's your best price?" }] });
  assert.deepEqual([price.rung, price.move], ['fit', 'invite_before_price']);
  assert.match(price.question, /cash/i);
  assert.equal(stage({ situations: ['price_negotiation', 'finance'], texts: [{ who: 'customer', text: 'Best price on finance?' }] }).question, '', 'what they already said is not asked again');

  const history = stage({ situations: ['history_kms'], texts: [{ who: 'customer', text: 'How many kms and any accident history?' }] });
  assert.deepEqual([history.rung, history.move], ['proof', 'offer_proof']);

  const far = stage({ situations: ['inspection_booking'], texts: [{ who: 'customer', text: 'I am in Brisbane, can I see it somehow?' }] });
  assert.deepEqual([far.rung, far.move, far.far], ['proof', 'offer_online_inspection', true]);
  assert.match(far.question, /postcode/);
  assert.equal(stage({ situations: ['delivery_interstate'], texts: [{ who: 'customer', text: 'Can you deliver to 4350?' }] }).question, '', 'a postcode already given is not asked for');

  const hold = stage({ situations: ['deposit_hold'], texts: [{ who: 'customer', text: 'Can you hold it for me until Saturday?' }] });
  assert.deepEqual([hold.rung, hold.move, hold.allowsUrgency], ['commit', 'propose_deposit', true]);
  assert.ok(hold.signals.some((s) => /hold/.test(s)));

  const again = stage({ situations: ['deposit_hold'], texts: [{ who: 'customer', text: 'Can you hold it?' }, { who: 'us', text: 'A $1,000 refundable holding deposit takes it off the market for you.' }, { who: 'customer', text: 'How do I pay the deposit?' }] });
  assert.deepEqual([again.rung, again.move, again.allowsUrgency, again.told.deposit], ['commit', 'confirm_step', false, true]);

  const arranged = stage({ situations: ['general'], texts: [{ who: 'customer', text: 'Can I come Saturday at 10?' }, { who: 'us', text: 'See you Saturday at 10.' }, { who: 'customer', text: 'Great, see you then. Does it have a tow bar?' }] });
  assert.deepEqual([arranged.rung, arranged.move], ['commit', 'propose_deposit']);
  const declined = stage({ situations: ['general'], texts: [{ who: 'customer', text: 'Can I come Saturday?' }, { who: 'us', text: 'See you Saturday at 10.' }, { who: 'customer', text: 'Sorry, we have already bought elsewhere.' }] });
  assert.equal(declined.rung, 'interest', 'a decline after an arranged visit is not a commitment');
  const cannot = stage({ situations: ['inspection_booking'], texts: [{ who: 'customer', text: 'Can I come Saturday?' }, { who: 'us', text: 'See you Saturday at 10.' }, { who: 'customer', text: "Sorry, I can't make it down on Saturday after all." }] });
  assert.notEqual(cannot.rung, 'commit', 'not being able to come is not a commitment either');
  const no = stage({ situations: ['general'], texts: [{ who: 'customer', text: 'Is the Noah available?' }, { who: 'us', text: 'Yes, it is here at Lidcombe.' }, { who: 'customer', text: "Thanks but I've found another car, I'll pass." }] });
  assert.deepEqual([no.move, no.question], ['accept_no', ''], 'a no is accepted: no next step, no question');
  assert.match(no.moveText, /no next step, no question/);

  const booked = stage({ situations: ['inspection_booking'], events: ['Customer booked an inspection through the website: Saturday 10:00'] });
  assert.deepEqual([booked.rung, booked.move], ['commit', 'propose_deposit']);

  const buyer = stage({ situations: ['after_sale'], deal: { source: 'lead_status' }, texts: [{ who: 'customer', text: 'When will it be ready?' }] });
  assert.deepEqual([buyer.rung, buyer.move], ['buyer', 'after_sale_step']);
  assert.equal(stage({ situations: ['complaint'], texts: [{ who: 'customer', text: 'I want a refund, this is a scam.' }] }).move, 'hold');
  assert.equal(stage({ situations: ['availability'], vehicles: [{ id: 2, soldStatus: 'SOLD', stockIn: 'Sold' }], texts: [{ who: 'customer', text: 'Is the Hiace still available?' }] }).move, 'offer_alternative');
  assert.equal(stage({ situations: ['availability'], channel: 'marketplace', texts: [{ who: 'customer', text: 'still available?' }] }).question, 'Would you like to come and see it?');
  assert.equal(selling.saleStage({ order: { id: 1 }, situation: { all: ['general'] }, timeline: [] }), null, 'an auction order has its own plan');
  assert.equal(selling.saleStage({ imports: { kind: 'ask' }, situation: { all: ['import_sourcing'] }, timeline: [] }), null, 'so does an import enquiry');
});

test('the lines the AI is told', () => {
  const lines = selling.stageLines(stage({ situations: ['deposit_hold'], texts: [{ who: 'customer', text: 'Can you hold it?' }] })).join('\n');
  assert.match(lines, /Where they are: ready to commit/);
  assert.match(lines, /ask only this one/);
  assert.match(lines, /takes the car off the market/);
  assert.match(lines, /Set "rung" in your answer to "commit"/);
  const quiet = selling.stageLines(stage({ situations: ['availability'], texts: [{ who: 'customer', text: 'Still available?' }] })).join('\n');
  assert.match(quiet, /No urgency of any kind/);
});

test('the checks refuse pressure and unbacked claims, and warn on filler, two questions and no next step', () => {
  const facts = 'Vehicle: 2021 Toyota Noah X. Advertised price $28,900. Odometer 60,000 km. Seats 8.';
  const run = (body, extra = {}) => checks.checkDraft({ reply: body, body, allowedText: facts, ...extra });
  const codes = (r) => r.map((c) => `${c.level}:${c.code}`);

  assert.ok(codes(run('Let us know if you have any questions.')).includes('warn:filler'));
  assert.ok(codes(run('Please let us know if you would like to come and see it.')).includes('warn:filler'));
  assert.ok(codes(run('Cash or finance? Which day suits?')).includes('warn:questions'));
  assert.ok(!codes(run('Which day suits you to see it?')).includes('warn:questions'), 'one question is fine');
  assert.ok(codes(run('A few other buyers are interested, so be quick.')).includes('fail:urgency'));
  assert.ok(codes(run('It has no accidents and is in perfect condition.')).includes('fail:claim'));
  assert.ok(codes(run('Approval is guaranteed with our lender.')).includes('fail:claim'));
  const mechanism = 'A $1,000 refundable holding deposit takes it off the market for you.';
  assert.ok(codes(run(mechanism)).includes('warn:urgency'), 'the deposit mechanism is a warning when the customer has not shown real interest');
  assert.ok(!codes(run(mechanism, { stage: { rung: 'commit', move: 'propose_deposit', allowsUrgency: true, aim: 'the deposit' } })).some((c) => /urgency/.test(c)), 'and fine once they have');

  const interest = { rung: 'interest', move: 'invite_inspection', allowsUrgency: false, aim: 'get them to see the car' };
  assert.ok(codes(run('The Noah has 8 seats.', { stage: interest })).includes('warn:next-step'));
  assert.ok(!codes(run('The Noah has 8 seats. You are welcome to come and see it any day.', { stage: interest })).includes('warn:next-step'));
  assert.ok(!codes(run('The Noah has 8 seats. Would Saturday suit?', { stage: interest })).includes('warn:next-step'));
  assert.equal(checks.worst(run('The Noah has 8 seats.')), 'ok', 'without a stage, a bare statement is not judged on its next step');
  assert.ok(!codes(run('See you Saturday at 10.', { stage: { rung: 'buyer', move: 'after_sale_step', allowsUrgency: false, aim: 'x' } })).includes('warn:next-step'));
  assert.ok(!codes(run('No worries, thank you for letting us know.', { stage: { rung: 'interest', move: 'accept_no', allowsUrgency: false, aim: 'x' } })).includes('warn:next-step'), 'a no gets no next step');

  const note = checks.retryNote(run('Other buyers are interested.'));
  assert.match(note, /Do not say or imply that other people are interested/);
  assert.match(checks.retryNote(run('No accidents.')), /Say nothing about accidents/);
});

test('the replay score', () => {
  const good = selling.salesScore({ body: 'Yes, the Noah is here with the auction sheet to match. You are welcome to come and see it any day.', rung: 'interest', situations: ['availability'], firstReply: true });
  assert.equal(good.score, 6, JSON.stringify(good.parts));
  const poor = selling.salesScore({ body: 'Yes, it is available. Other buyers are interested. Let us know if you have any questions. Cash? Finance?', rung: 'interest', situations: ['availability'] });
  assert.ok(poor.score <= 3);
  assert.ok(poor.notes.includes('filler') && poor.notes.includes('urgency') && poor.notes.includes('more than one question'));
  const proofless = selling.salesScore({ body: 'It has done 60,000 km. You are welcome to come and see it.', rung: 'proof', situations: ['history_kms'] });
  assert.equal(proofless.parts.proof, false);
});

// ---- through the drafter, with the stand-in AI ------------------------------------------------------

let mid = 1;
const lead = (id, conv, first, phone, extra = {}) => db.upsertLead({ id, conversationId: conv, firstName: first, lastName: 'Test', phone, email: '', source: 'carsales', status: 'FOLLOW_UP', platform: 'CARSALES', state: 'NSW', leadAt: now - 2 * HOUR, updatedAt: now - HOUR, stocks: [], inquiries: [], statusHistory: [], ...extra });
const conv = (id, leadId, name, phone) => db.upsertConversation({ id, phone, channel: 'SMS', status: 'OPEN', leadId, customerName: name, latestDirection: 'IN', latestAt: now - MIN, latestBody: 'x' });
const msg = (conversationId, direction, body, agoMs) => db.upsertMessage({ id: mid++, conversationId, direction, body, sentBy: direction === 'OUT' ? 'Dana' : null, status: 'SENT', mediaType: null, at: now - agoMs, importedAt: now - agoMs });
const script = (...replies) => { seen.length = 0; ai.script = replies.map((reply) => ({ reply, needs_human: [], facts_used: [], hold: false })); };

test('a reply that invents interest from other buyers is rejected and written again; the next step and the rung are saved and shown', async () => {
  lead(1, 11, 'Priya', '0491 570 101', { stocks: ['1300'] });
  conv(11, 1, 'Priya Test', '+61491570101');
  msg(11, 'IN', 'Is the Noah still available?', 10 * MIN);
  const item = items.buildItem({ conversationId: 11 });
  assert.deepEqual([item.isNewEnquiry, item.situation.primary], [true, 'availability']);

  const asked = promptModule.buildPrompt(item, { now });
  const user = asked.user;
  const at = (s) => user.indexOf(s);
  assert.ok(at('=== VEHICLE FACTS ===') < at("=== THIS CUSTOMER'S NEXT STEP ===") && at("=== THIS CUSTOMER'S NEXT STEP ===") < at('=== STANDARD FIRST REPLY ==='), 'the next step comes after the facts and before the first-reply rules');
  assert.match(user, /Where they are: interested/);
  assert.match(user, /then one sentence that offers the next step/);
  assert.match(asked.system, /"rung"/);
  assert.equal(asked.stage.rung, 'interest');

  script(
    'Hi {{NAME}},\nYes, the Noah is available. A few other buyers are interested, so be quick.',
    'Hi {{NAME}},\nYes, the Noah is here, 60,000 km with the auction sheet to match. You are welcome to come and see it any day.',
  );
  const d = await drafter.draftFor(item, { now });
  assert.equal(seen.length, 2, 'the first draft was rejected and a second one asked for');
  assert.match(seen[1].messages[1].content, /Do not say or imply that other people are interested/);
  assert.ok(!d.checks.some((c) => c.level === 'fail'), JSON.stringify(d.checks));
  assert.match(d.reply, /welcome to come and see it/);
  assert.deepEqual([d.rung, d.nextStep], ['interest', '']);

  const saved = db.getDraft(d.id);
  assert.deepEqual([saved.rung, saved.next_step, saved.context.rung, saved.context.move], ['interest', null, 'interest', 'invite_inspection']);
  const shown = (await (await fetch(`${base}/api/items/c:11`)).json()).item;
  assert.equal(shown.draft.rung, 'interest');
  assert.match(shown.draft.rungLabel, /interested/);
});
