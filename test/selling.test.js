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

test('an import email names one model; the landed-figure line gives only the facts that decide it', async () => {
  assert.match(promptModule.systemPrompt('email'), /name one, the closest to what they asked about/);
  const { decidesLine } = await import('../src/imports.js');
  assert.equal(decidesLine({ km: 128000, grade: 'R' }), 'It has 128,000 km and auction grade R.');
  assert.equal(decidesLine({ km: 0, grade: '' }), '');
  assert.equal(decidesLine({ km: 53000 }), 'It has 53,000 km.');
});

test('where the customer is: interest, proof, fit, commit, buyer', () => {
  const first = stage({ situations: ['availability'], texts: [{ who: 'customer', text: 'Is the Noah still available?' }] });
  assert.deepEqual([first.rung, first.move, first.allowsUrgency], ['interest', 'invite_inspection', false]);
  assert.equal(first.question, '', 'no canned question: the invitation is the next step');

  const price = stage({ situations: ['price_negotiation'], texts: [{ who: 'customer', text: 'Hi' }, { who: 'us', text: 'Hi, yes it is.' }, { who: 'customer', text: "What's your best price?" }] });
  assert.deepEqual([price.rung, price.move], ['fit', 'invite_before_price']);
  assert.equal(price.question, '', 'the price reply is added by code: nothing to ask');
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
  assert.notEqual(arranged.rung, 'commit', 'a visit not yet taken is not a commitment');
  const declined = stage({ situations: ['general'], texts: [{ who: 'customer', text: 'Can I come Saturday?' }, { who: 'us', text: 'See you Saturday at 10.' }, { who: 'customer', text: 'Sorry, we have already bought elsewhere.' }] });
  assert.equal(declined.rung, 'interest', 'a decline after an arranged visit is not a commitment');
  const cannot = stage({ situations: ['inspection_booking'], texts: [{ who: 'customer', text: 'Can I come Saturday?' }, { who: 'us', text: 'See you Saturday at 10.' }, { who: 'customer', text: "Sorry, I can't make it down on Saturday after all." }] });
  assert.notEqual(cannot.rung, 'commit', 'not being able to come is not a commitment either');
  const no = stage({ situations: ['general'], texts: [{ who: 'customer', text: 'Is the Noah available?' }, { who: 'us', text: 'Yes, it is here at Lidcombe.' }, { who: 'customer', text: "Thanks but I've found another car, I'll pass." }] });
  assert.deepEqual([no.move, no.question], ['accept_no', ''], 'a no is accepted: no next step, no question');
  assert.match(no.moveText, /no next step, no question/);

  const booked = stage({ situations: ['inspection_booking'], events: ['Customer booked an inspection through the website: Saturday 10:00'] });
  assert.deepEqual([booked.rung, booked.move, booked.allowsUrgency], ['interest', 'confirm_or_link', false]);

  const buyer = stage({ situations: ['after_sale'], deal: { source: 'lead_status' }, texts: [{ who: 'customer', text: 'When will it be ready?' }] });
  assert.deepEqual([buyer.rung, buyer.move], ['buyer', 'after_sale_step']);
  assert.equal(stage({ situations: ['complaint'], texts: [{ who: 'customer', text: 'I want a refund, this is a scam.' }] }).move, 'hold');
  assert.equal(stage({ situations: ['availability'], vehicles: [{ id: 2, soldStatus: 'SOLD', stockIn: 'Sold' }], texts: [{ who: 'customer', text: 'Is the Hiace still available?' }] }).move, 'offer_alternative');
  assert.equal(stage({ situations: ['availability'], channel: 'marketplace', texts: [{ who: 'customer', text: 'still available?' }] }).question, '', 'no canned question on Marketplace either');
  assert.equal(selling.saleStage({ order: { id: 1 }, situation: { all: ['general'] }, timeline: [] }), null, 'an auction order has its own plan');
  assert.equal(selling.saleStage({ imports: { kind: 'ask' }, situation: { all: ['import_sourcing'] }, timeline: [] }), null, 'so does an import enquiry');
});

// The price: a buyer who has not agreed it is never asked for the deposit, whatever came before.
const car = [{ id: 9, price: 23900, soldStatus: 'UnSold', stockIn: 'Online', status: 'PUBLISHED' }];
const LINK = 'You can book an inspection here:\nhttps://www.carbarn.com.au/vehicles/toyota/noah/zrr80/1300#inspection=onsite';
const linkSent = [{ who: 'customer', text: 'Is it still available?' }, { who: 'us', text: `Yes, it is available.\n${LINK}` }];
const visitSet = [{ who: 'customer', text: 'Can I come Saturday at 10?' }, { who: 'us', text: 'See you Saturday at 10.' }];
const PRICE_BLOCK = 'The price includes 6 months NSW registration. Government charges are extra.\n\nWe generally keep our prices competitive considering everything included, but we may offer a small discount for a serious buyer.';

test('a booking link we sent is an invitation, not an arranged visit', () => {
  const s = stage({ vehicles: car, situations: ['vehicle_details'], texts: [...linkSent, { who: 'customer', text: 'Does it have a tow bar?' }] });
  assert.notEqual(s.rung, 'commit');
  assert.ok(!s.signals.length, s.signals.join('; '));
  assert.equal(s.allowsUrgency, false);
  const later = stage({ vehicles: car, texts: [...visitSet, { who: 'customer', text: "It's ok I can come another time" }] });
  assert.notEqual(later.rung, 'commit', 'coming another time is not a commitment');
  assert.equal(later.move, 'accept_deferral', 'it is accepted, not sold to');
});

test('no deposit while the price is not agreed: an offer, a budget, or "too dear" keeps them working out the cost', async () => {
  const { classify } = await import('../src/situations.js');
  for (const text of ['Would you take 19k?', 'Hi would u consider 16k', 'My budget is $14000, could you consider it?', '22 will do', 'Too expensive for me', 'Give me fair price', 'Can do 14k if you are neg', 'Ok then my offer is 10000 plus my van']) {
    assert.ok(classify(text).all.includes('price_negotiation'), `"${text}" is a price question`);
    for (const before of [linkSent, visitSet]) {
      const s = stage({ vehicles: car, situations: classify(text).all, texts: [...before, { who: 'customer', text }] });
      assert.equal(s.rung, 'fit', `${text}: ${s.rung}`);
      assert.ok(!['propose_deposit', 'confirm_step'].includes(s.move), `${text}: ${s.move}`);
      assert.equal(s.allowsUrgency, false, text);
    }
  }
  // Asking to hold it on our terms is still a commitment; asking to hold it at their own lower figure is not.
  assert.equal(stage({ vehicles: car, situations: ['deposit_hold'], texts: [{ who: 'customer', text: 'Can you hold it for me until Saturday?' }] }).move, 'propose_deposit');
  assert.notEqual(stage({ vehicles: car, situations: ['deposit_hold', 'price_negotiation'], texts: [{ who: 'customer', text: 'I can put a deposit down if you do 20k' }] }).move, 'propose_deposit');
});

test('a buyer who accepts our price, or the figure our staff gave, is ready for the deposit', () => {
  const offered = [{ who: 'customer', text: 'Best price?' }, { who: 'us', text: 'We can do $22,900 for you.' }];
  const yes = stage({ vehicles: car, texts: [...offered, { who: 'customer', text: 'Ok 22,900 is fine, I will take it' }] });
  assert.deepEqual([yes.rung, yes.move, yes.allowsUrgency], ['commit', 'propose_deposit', true]);
  assert.ok(yes.signals.includes('accepted our price'), yes.signals.join('; '));
  assert.equal(stage({ vehicles: car, texts: [...offered, { who: 'customer', text: 'Deal' }] }).move, 'propose_deposit');
  const less = stage({ vehicles: car, situations: ['price_negotiation'], texts: [...offered, { who: 'customer', text: 'I will take it for 21k' }] });
  assert.equal(less.rung, 'fit', 'less than our figure is still an offer');
  for (const text of ["I'll take it to my mechanic first", 'I will take it for a test drive on Saturday'])
    assert.ok(!stage({ vehicles: car, texts: [...offered, { who: 'customer', text }] }).signals.includes('accepted our price'), text);
});

test('a buyer walking away over the price, or being rude, gets a polite close: no blank, no link, no deposit', () => {
  for (const text of ["I'll keep saving, 18 k is all I have and I don't need the warranty. Anyway all the best", 'Still not worth it mate', 'You are dreaming, idiot', 'Never mind, too dear for me. Good luck with it']) {
    const s = stage({ vehicles: car, texts: [...linkSent, { who: 'customer', text }] });
    assert.deepEqual([s.move, s.question, s.allowsUrgency], ['part_well', '', false], text);
    assert.notEqual(s.rung, 'commit', text);
  }
  const words = selling.MOVES.part_well.text;
  assert.match(words, /\[PRICE\?\]/, 'the move says no blank');
  assert.match(words, /no link/i);
  assert.match(words, /deposit/i);
  assert.match(selling.stageLines(stage({ vehicles: car, texts: [{ who: 'customer', text: 'Still not worth it mate' }] })).join('\n'), /offer no next step/i);
  // Someone still coming to see it is not leaving.
  assert.notEqual(stage({ vehicles: car, situations: ['inspection_booking'], texts: [{ who: 'customer', text: 'Never mind the kms, can I come and see it Saturday?' }] }).move, 'part_well');
});

test('a counter-offer after we answered the price is answered with a blank, not with the price reply again', () => {
  const s = stage({ vehicles: car, situations: ['price_negotiation'], texts: [{ who: 'customer', text: 'Best price?' }, { who: 'us', text: PRICE_BLOCK }, { who: 'customer', text: 'Would you take 20k?' }] });
  assert.deepEqual([s.move, s.rung], ['answer_offer', 'fit']);
  assert.match(s.moveText, /\[PRICE\?\]/);
  assert.match(s.moveText, /never (say|tell)/i);
  const typed = stage({ vehicles: car, situations: ['price_negotiation'], texts: [{ who: 'customer', text: 'Best price?' }, { who: 'us', text: 'We can do $22,900 for you.' }, { who: 'customer', text: 'Would you take 20k?' }] });
  assert.equal(typed.move, 'answer_offer', 'a figure our staff typed answers the price question too');
  assert.equal(stage({ vehicles: car, situations: ['price_negotiation'], texts: [{ who: 'customer', text: 'Would you take 20k?' }] }).move, 'invite_before_price', 'the first price question still gets the price reply');
});

test('on Marketplace the invitation to see the car is given once', () => {
  const invited = [{ who: 'customer', text: 'Is it available?' }, { who: 'us', text: 'Yes, it is available, and you are welcome to inspect it at our Lidcombe showroom.' }, { who: 'customer', text: 'Is it the 2.5 or the 3.5?' }];
  const chat = stage({ channel: 'marketplace', vehicles: car, situations: ['vehicle_details'], texts: invited });
  assert.match(selling.stageLines(chat).join('\n'), /already invited them/);
  const sms = stage({ vehicles: car, situations: ['vehicle_details'], texts: invited });
  assert.doesNotMatch(selling.stageLines(sms).join('\n'), /already invited them/);
  const fresh = stage({ channel: 'marketplace', vehicles: car, situations: ['availability'], texts: [{ who: 'customer', text: 'Is it available?' }] });
  assert.doesNotMatch(selling.stageLines(fresh).join('\n'), /already invited them/);
});

test('on Marketplace the moves end on the buyer\'s number, not the booking link or the price reply block', () => {
  const see = stage({ channel: 'marketplace', vehicles: car, situations: ['inspection_booking'], texts: [{ who: 'customer', text: 'Can I come and see it tomorrow?' }] });
  assert.match(see.moveText, /send us their number and the day and time/i);
  assert.doesNotMatch(see.moveText, /follow INSPECTION for the link/);
  const price = stage({ channel: 'marketplace', vehicles: car, situations: ['price_negotiation'], texts: [{ who: 'customer', text: 'Is the price negotiable?' }] });
  assert.equal(price.move, 'invite_before_price');
  assert.match(price.moveText, /\[PRICE\?\]/);
  assert.match(price.moveText, /their number/);
  assert.doesNotMatch(price.moveText, /added under your text by code/);
  const sms = stage({ vehicles: car, situations: ['price_negotiation'], texts: [{ who: 'customer', text: 'Is the price negotiable?' }] });
  assert.match(sms.moveText, /added under your text by code/, 'a text still gets the price reply block');
  // Asking for their number is the invitation on Marketplace, given once in a chat.
  const asked = stage({ channel: 'marketplace', vehicles: car, situations: ['vehicle_details'], texts: [{ who: 'customer', text: 'Can I see it?' }, { who: 'us', text: 'Send us your number and the time that suits you, and we will get the inspection booked for you.' }, { who: 'customer', text: 'Is it the hybrid?' }] });
  assert.match(selling.stageLines(asked).join('\n'), /already invited them/);
  // "Send me your number and I'll give you a call" ends on a next step.
  assert.ok(selling.NEXT_STEP_SIGNS.test("Keen to see it? Send me your number and I'll give you a call."));
  assert.ok(selling.NEXT_STEP_SIGNS.test('Send us your number and we will call you.'));
});

test('the lines the AI is told', () => {
  const lines = selling.stageLines(stage({ situations: ['deposit_hold'], texts: [{ who: 'customer', text: 'Can you hold it?' }] })).join('\n');
  assert.match(lines, /Where they are: ready to commit/);
  assert.match(lines, /Ask no question: end on the next step/);
  const asking = selling.stageLines(stage({ situations: ['delivery_interstate'], texts: [{ who: 'customer', text: 'Do you deliver to Brisbane?' }] })).join('\n');
  assert.match(asking, /ask only this one, in your own words: "What is your postcode/);
  assert.match(lines, /takes the car off the market/);
  assert.match(lines, /Set "rung" in your answer to "commit"/);
  const quiet = selling.stageLines(stage({ situations: ['availability'], texts: [{ who: 'customer', text: 'Still available?' }] })).join('\n');
  assert.match(quiet, /No urgency of any kind/);
});

test('a figure the customer gave may be named as theirs, never as ours', () => {
  const facts = 'Vehicle: 2021 Toyota Noah X. Advertised price $28,900.';
  const run = (body, customerText, extra = {}) => checks.checkDraft({ reply: body, body, allowedText: facts, customerText, ...extra }).map((c) => `${c.level}:${c.code}`);
  assert.ok(!run('Thank you for your offer of $15,000. Regarding your offer, [PRICE?].', 'can do 15k if you are neg').includes('fail:customer-figure'));
  assert.ok(!run('You were hoping for $30,000 for your STI. Our offer of $27,000 stands.', 'I was hoping to get a minimum of $30,000', { allowedText: `${facts}\nWe can offer you $27,000 for your STI.` }).includes('fail:customer-figure'));
  assert.ok(run('We can do $15,000 for you.', 'can do 15k').includes('fail:customer-figure'));
  assert.ok(run('Thank you for your offer of $15,000, which we can accept.', 'can do 15k').includes('fail:customer-figure'), 'an acceptance verb beside their figure still fails');
  assert.ok(run('Your $15,000 offer is a deal.', 'can do 15k').includes('fail:customer-figure'));
  assert.ok(run('Thank you for your offer of $15,000. We can do $15,000 for you.', 'can do 15k').includes('fail:customer-figure'), 'the same figure stated as ours in a second sentence still fails');
  for (const plain of ['Your offer of $15,000 works for us.', 'Your offer of $15,000 is fine.', 'As you have asked, we will sell it at $15,000.']) assert.ok(run(plain, 'can do 15k').includes('fail:customer-figure'), plain);
});

test('the voice: the first sentence names what the person gave, and a form is already read', () => {
  const voice = promptModule.systemPrompt('sms');
  assert.match(voice, /The first sentence names what this person just gave us/);
  assert.match(voice, /never the opener for an offer, a location, a trade-in or a thank-you/);
  assert.match(voice, /End on one step chosen from what they said/);
  assert.match(voice, /\| Thank you for your message \/ Thank you for your enquiry \| \(nothing: name what they gave us\) \|/);
  assert.match(voice, /A lead form's fields and the engine's auto-reply are the customer's words/);
  assert.doesNotMatch(voice, /The first sentence answers what was asked\./);
  assert.match(voice, /Never match slang, abbreviations, emoji or capitals\./, 'kept word for word');
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
  const poor = selling.salesScore({ body: 'No worries mate, it is available. Other buyers are interested. Cash? Finance?', rung: 'interest', situations: ['availability'] });
  assert.ok(poor.score <= 3, JSON.stringify(poor.parts));
  assert.ok(poor.notes.includes('informal or apologetic wording') && poor.notes.includes('urgency or a claim') && poor.notes.includes('a question that was not needed, or a needed one missing'), poor.notes.join(' | '));
  const proofless = selling.salesScore({ body: 'It has done 60,000 km. You are welcome to come and see it.', rung: 'proof', situations: ['history_kms'] });
  assert.equal(proofless.parts.dueBlocks, false);
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

test('a word that rates the car or the deal is pointed out; the grade scale and a variant name are not', () => {
  const run = (body) => checks.checkDraft({ reply: body, body, allowedText: 'Vehicle: 1995 Mitsubishi GTO. Odometer 18,052 km. Auction grade 4.5. Variant G Limited.' }).map((c) => `${c.level}:${c.code}`);
  for (const b of ['The GTO is an exceptional classic with only 18,052 km.', 'It is a superb luxury hybrid sedan.', 'An excellent 8-seater family van, so it is ready to drive away.', 'A rare 4WD classic.', 'The 5-year warranty is there for your peace of mind.', 'Remarkably efficient at 5.0 L/100 km.', 'What an amazing car.', 'Auction grade 4.5 is excellent. An excellent van.'])
    assert.ok(run(b).includes('warn:rating'), b);
  for (const b of ['Auction grade 4.5 is excellent with minor marks.', 'The G Limited has 18,052 km on the export certificate.', 'The price includes 6 months NSW registration.'])
    assert.ok(!run(b).includes('warn:rating'), b);
  assert.ok(!checks.checkDraft({ reply: 'x', body: 'A superb car.', instructed: true }).some((c) => c.code === 'rating'));
  assert.match(promptModule.systemPrompt('sms'), /No adjective or adverb that rates the car or the deal/);
  assert.match(promptModule.systemPrompt('marketplace'), /Register under VOICE still applies here/);
});

test('the register: slang and apologies are pointed out, "plus on-roads" is refused, and the length bands fit the voice', () => {
  const facts = 'Vehicle: 2021 Toyota Noah X. Advertised price $28,900.';
  const run = (body, extra = {}) => checks.checkDraft({ reply: body, body, allowedText: facts, ...extra });
  const codes = (r) => r.map((c) => `${c.level}:${c.code}`);
  assert.ok(codes(run('No worries, the Noah is available.')).includes('warn:register'));
  assert.ok(codes(run('Sorry to bother you, is Saturday still fine?')).includes('warn:register'));
  assert.ok(codes(run('Hope this helps.')).includes('warn:filler'));
  assert.ok(!codes(run('Certainly. The Noah is available for inspection at our Lidcombe showroom.')).includes('warn:register'));
  assert.ok(codes(run('The Noah is $28,900 plus on-roads.')).includes('fail:wording'));
  assert.match(checks.retryNote(run('The Noah is $28,900 plus on-roads.')), /Never "plus on-roads"/);
  assert.ok(selling.SLANG.test('Too easy, see you then') && selling.SERVILE.test('If that works for you'), 'the register words the review score uses');
  const words = (n) => Array.from({ length: n }, () => 'alpha').join(' ');
  assert.ok(!codes(run(words(74))).includes('warn:long'), 'a first reply has 70 words with a little slack');
  assert.ok(codes(run(words(76))).includes('warn:long'));
  assert.ok(!codes(run(words(54), { inConversation: true })).includes('warn:long'));
  assert.ok(codes(run(words(56), { inConversation: true })).includes('warn:long'));
  assert.ok(!codes(run(words(89), { channel: 'marketplace' })).includes('warn:long'), 'a Marketplace reply has room to sell: up to 90 words');
  assert.ok(codes(run(words(91), { channel: 'marketplace' })).includes('warn:long'));
  assert.ok(!codes(run('Thank you for your offer.', { stage: { rung: 'fit', move: 'part_well', allowsUrgency: false, aim: 'x' } })).includes('warn:next-step'), 'a polite close gets no next step');
});

test('a reply that refuses or runs down an offer is sent back: the figure is a person\'s decision', () => {
  const facts = 'Vehicle: 2021 Toyota Noah X. Advertised price $28,900.';
  const run = (body) => checks.checkDraft({ reply: body, body, allowedText: facts });
  const codes = (r) => r.map((c) => `${c.level}:${c.code}`);
  for (const body of ['Thank you for your offer. We cannot match that figure, but [PRICE?].', 'We cannot offer that discount.', 'An offer of [PRICE?] is below what we can accept.', 'Thank you, but your offer is too low.', 'That is too far below our asking price.']) {
    assert.ok(codes(run(body)).includes('fail:wording'), body);
  }
  assert.match(checks.retryNote(run('We cannot offer that discount.')), /Never say that their offer is too low/);
  for (const body of ['Thank you for your offer. Regarding your offer, [PRICE?].', 'We cannot hold a vehicle without a deposit.', 'We do not offer rent-to-own plans, but finance can be arranged.']) {
    assert.ok(!codes(run(body)).includes('fail:wording'), body);
  }
});

test('the Marketplace length band in the replay score matches the check', () => {
  const words = (n) => Array.from({ length: n }, () => 'alpha').join(' ');
  assert.equal(selling.salesScore({ body: words(88), channel: 'marketplace' }).parts.length, true);
  assert.equal(selling.salesScore({ body: words(92), channel: 'marketplace' }).parts.length, false);
});

test('a buyer leaving over the price gets no price reply and no invitation; a second offer gets no second price reply', () => {
  const priced = (convId, leadId, name, phone, last) => {
    lead(leadId, convId, name, phone, { stocks: ['1300'] });
    conv(convId, leadId, `${name} Test`, phone.replace(/^0/, '+61').replace(/\s/g, ''));
    msg(convId, 'IN', 'Is the Noah still available? Can I come and see it?', 5 * HOUR);
    msg(convId, 'OUT', `Hello ${name},\nYes, it is.\n${LINK}`, 4 * HOUR);
    msg(convId, 'IN', 'What is your best price?', 3 * HOUR);
    msg(convId, 'OUT', PRICE_BLOCK, 2 * HOUR);
    msg(convId, 'IN', last, 10 * MIN);
    return items.buildItem({ conversationId: convId });
  };

  const leaving = promptModule.buildPrompt(priced(61, 41, 'Omar', '0491 570 161', "25k and I'm tapped out, all the best"), { now });
  assert.equal(leaving.stage.move, 'part_well');
  assert.equal(leaving.price.on, false, 'no price reply for a buyer who is leaving');
  assert.ok(!/=== PRICE REPLY ===/.test(leaving.user));
  assert.ok(!leaving.inspection.block, 'and no invitation added under the text');
  assert.ok(!/takes the car off the market/.test(leaving.user.split('=== BUSINESS FACTS ===')[0]), 'and no deposit line');

  const again = promptModule.buildPrompt(priced(62, 42, 'Lena', '0491 570 162', 'Would you take 25k?'), { now });
  assert.equal(again.stage.move, 'answer_offer');
  assert.equal(again.price.on, false, 'the price reply was sent already');
  assert.match(again.user, /\[PRICE\?\]/);

  // The block goes only to the first price question, and never to a trade-in.
  const noah = { url: 'https://www.carbarn.com.au/vehicles/toyota/noah/zrr80/1300', price: 23900, soldStatus: 'UnSold', stockIn: 'Online', status: 'PUBLISHED' };
  const priceItem = plain({ situations: ['price_negotiation'], vehicles: [noah], texts: [{ who: 'customer', text: 'What is your best price?' }] });
  const first = promptModule.pricePlan(priceItem, noah, { stage: { move: 'invite_before_price' } });
  assert.equal(first.on, true);
  const lines = first.lines.join('\n');
  assert.match(lines, /names what this customer gave us/);
  assert.doesNotMatch(lines, /place the vehicle: that it is available for inspection at Lidcombe/);
  const tradeIn = plain({ situations: ['price_negotiation', 'trade_in'], vehicles: [noah], texts: [{ who: 'customer', text: 'I have an offer of $31,000 for my van from Carsales, is the Noah hybrid?' }] });
  assert.equal(promptModule.pricePlan(tradeIn, noah, { stage: { move: 'invite_before_price' } }).on, false, 'a trade-in is not answered with the price block');
  assert.equal(promptModule.pricePlan(priceItem, noah, { stage: { move: 'propose_deposit' } }).on, false, 'an accepted figure is not answered with the price block');
});

test('on Marketplace an opening thank-you and an unasked link are pointed out', () => {
  const run = (body, extra = {}) => checks.checkDraft({ reply: body, body, allowedText: 'Vehicle: 2021 Toyota Noah X.', channel: 'marketplace', inConversation: true, ...extra }).map((c) => `${c.level}:${c.code}`);
  assert.ok(run('Thank you for your message. Yes, it is available.').includes('warn:opener'));
  assert.ok(run('Thank you for your enquiry, {{NAME}}. Yes.').includes('warn:opener'));
  assert.ok(!run('Thank you for your offer. The lowest we can do on the Noah is [PRICE?].').includes('warn:opener'), 'an offer is something they gave');
  assert.ok(!run('Yes, it is available.').includes('warn:opener'));
  assert.ok(!checks.checkDraft({ reply: 'Thank you for your message.', body: 'Thank you for your message.', channel: 'sms' }).some((c) => c.code === 'opener'), 'SMS keeps its own rules');
  assert.ok(run('Thank you for your message. Yes.', { instructed: true }).every((c) => c !== 'warn:opener'), 'a Prompt sets it aside');
  assert.match(promptModule.systemPrompt('marketplace'), /A bare figure \("15k", "\$17000", "24 will do", "I have15000k"\) is an offer/);
  assert.match(promptModule.systemPrompt('marketplace'), /one short line above the three paragraphs reflects it/);
  assert.match(promptModule.systemPrompt('marketplace'), /"Rego include\?" gives nothing/);
  const flatMarketplace = promptModule.systemPrompt('marketplace').replace(/\s+/g, ' ');
  assert.match(flatMarketplace, /and nothing else apart from the one line described at the end of this bullet/);
  assert.match(flatMarketplace, /No link and no other sentence beyond that one line\./);
  assert.match(promptModule.systemPrompt('sms').replace(/\s+/g, ' '), /one short line above the paragraphs may reflect it/);
});

test('the deposit waits for the buyer: a booking, a finance application or a visit still to come is not a commitment; seeing the car, holding it or accepting the figure is', () => {
  const finance = stage({ vehicles: car, situations: ['finance'], events: ['Customer submitted a finance application through the website.'] });
  assert.notEqual(finance.rung, 'commit'); assert.equal(finance.allowsUrgency, false);
  const seen = stage({ vehicles: car, texts: [{ who: 'customer', text: 'Thanks for the test drive yesterday, does it come with two keys?' }] });
  assert.deepEqual([seen.rung, seen.move], ['commit', 'propose_deposit']);
  assert.ok(seen.signals.includes('they have seen the car'), seen.signals.join('; '));
  const video = stage({ vehicles: car, texts: [{ who: 'customer', text: 'I watched the walkaround video, looks good' }] });
  assert.equal(video.rung, 'commit');
  // A dated visit, so the day it names is known whatever day the test runs on.
  const visitDay = new Date(now + 2 * DAY).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'Australia/Sydney' });
  const past = selling.saleStage(plain({ vehicles: car, texts: [{ who: 'customer', text: `Can I come on ${visitDay} at 10?` }, { who: 'us', text: `See you on ${visitDay} at 10.` }, { who: 'customer', text: 'Great car. Does it have a tow bar?' }] }), { now: now + 9 * DAY });
  assert.ok(past.signals.includes('the visit we arranged has taken place and they wrote again'), past.signals.join('; '));
  assert.equal(past.rung, 'commit');
  assert.equal(stage({ vehicles: car, situations: ['deposit_hold'], texts: [{ who: 'customer', text: 'Can you hold it for me until Saturday?' }] }).move, 'propose_deposit');
  assert.equal(stage({ vehicles: car, situations: ['deposit_hold'], events: ['Customer started the online purchase steps on the website.'] }).rung, 'commit');
});

test('a visit arranged for a weekday counts as taken once its nearest date has passed', () => {
  const thu = Date.parse('2026-10-15T10:00:00+11:00');
  const item = plain({ vehicles: car });
  item.timeline = [{ who: 'customer', text: 'Can I come Saturday at 10?', at: thu }, { who: 'us', text: 'See you Saturday at 10.', at: thu + HOUR }, { who: 'customer', text: 'Great car. Does it have a tow bar?', at: thu + 2 * HOUR }];
  item.pendingText = 'Great car. Does it have a tow bar?';
  const monday = selling.saleStage(item, { now: Date.parse('2026-10-19T10:00:00+11:00') });
  assert.ok(monday.signals.includes('the visit we arranged has taken place and they wrote again'), monday.signals.join('; '));
  assert.equal(monday.rung, 'commit');
  const friday = selling.saleStage(item, { now: Date.parse('2026-10-16T10:00:00+11:00') });
  assert.ok(!friday.signals.includes('the visit we arranged has taken place and they wrote again'));
  assert.notEqual(friday.rung, 'commit');
});

test('the licence and email are asked for only once they say yes to the deposit', () => {
  const proposed = [{ who: 'customer', text: 'Can you hold it?' }, { who: 'us', text: 'A $1,000 refundable holding deposit takes it off the market for you.' }];
  const yes = stage({ vehicles: car, situations: ['deposit_hold'], texts: [...proposed, { who: 'customer', text: "Yes let's do it, how do I pay?" }] });
  assert.deepEqual([yes.move, yes.told.deposit, yes.told.depositAgreed], ['confirm_step', true, true]);
  assert.match(selling.stageLines(yes).join('\n'), /ask for a photo of their driver licence and their email address/);
  const notYet = stage({ vehicles: car, situations: ['deposit_hold'], texts: [...proposed, { who: 'customer', text: 'Is the deposit refundable?' }] });
  assert.equal(notYet.told.depositAgreed, false);
  assert.match(selling.stageLines(notYet).join('\n'), /do not ask for their licence or email/);
  assert.match(selling.MOVES.propose_deposit.text, /Do not ask for their driver licence or email address yet/);
  assert.doesNotMatch(selling.MOVES.propose_deposit.text, /we need a photo|photo of their driver licence/);
  assert.match(selling.MOVES.ask_trade_in_details.text, /No deposit is proposed with a trade-in figure/);
});

test('a deposit, a licence ask or "remains for sale" before the buyer is there is pointed out', () => {
  const run = (body, stage) => checks.checkDraft({ reply: body, body, allowedText: 'Vehicle: 2021 Toyota Noah X.', stage, situation: { all: ['general'] } }).map((c) => `${c.level}:${c.code}`);
  const interest = { rung: 'interest', move: 'confirm_or_link', allowsUrgency: false, aim: 'x', told: { deposit: false, depositAgreed: false } };
  const early = run('Yes, 9:00 am suits well. To take the vehicle off the market while you decide, we suggest securing it with a $1,000 refundable holding deposit. Until a deposit is paid, the vehicle remains for sale.', interest);
  assert.ok(early.includes('warn:deposit-early') && early.includes('warn:urgency'), early.join(' '));
  assert.ok(run('To proceed with the invoice, please send through a photo of your driver licence and your email address.', interest).includes('warn:deposit-early'));
  const agreed = { rung: 'commit', move: 'confirm_step', allowsUrgency: false, aim: 'x', told: { deposit: true, depositAgreed: true } };
  assert.ok(!run('Please send through a photo of your driver licence and your email address, and we will email the invoice.', agreed).includes('warn:deposit-early'));
  const commit = { rung: 'commit', move: 'propose_deposit', allowsUrgency: true, aim: 'x', told: { deposit: false, depositAgreed: false } };
  assert.ok(!run('A $1,000 refundable holding deposit takes the Noah off the market for you.', commit).includes('warn:deposit-early'));
  assert.ok(!checks.checkDraft({ reply: 'x', body: 'A $1,000 refundable holding deposit takes it off the market.', stage: interest, instructed: true }).some((c) => c.code === 'deposit-early'), 'a Prompt sets it aside');
});

test('the voice: a booking, a finance application, a thumbs-up or a deferral is not the moment for the deposit', () => {
  assert.match(promptModule.systemPrompt('sms'), /They have deferred \(a later day, a "not today", an "I'll let you know"\)/);
  const flat = promptModule.systemPrompt('sms').replace(/\s+/g, ' ');
  assert.doesNotMatch(flat, /a customer who has booked to see it is\./);
  assert.match(flat, /a customer who has seen it, or accepted our figure, is\./);
});

test('a deferral is answered like a no: accepted in a line, nothing sold', () => {
  for (const text of ["I'll let you know in the next couple of days", "It's ok I can come another time", 'I am not coming today, stuck at work', "Leave it with me, I'll chat with my partner", 'Need to think about it']) {
    const s = stage({ vehicles: car, texts: [...visitSet, { who: 'customer', text }] });
    assert.deepEqual([s.move, s.question, s.allowsUrgency], ['accept_deferral', '', false], text);
    assert.notEqual(s.rung, 'commit', text);
    assert.match(selling.stageLines(s).join('\n'), /offer no next step/i, text);
  }
  const asked = stage({ vehicles: car, situations: ['vehicle_details'], texts: [{ who: 'customer', text: "I'll let you know. Does it have a tow bar?" }] });
  assert.equal(asked.move, 'accept_deferral');
  assert.match(asked.moveText, /Answer anything they asked/);
  const buyer = stage({ situations: ['after_sale'], deal: { source: 'lead_status' }, texts: [{ who: 'customer', text: 'Leave it with me, I will chat with my partner about the balance.' }] });
  assert.equal(buyer.move, 'after_sale_step', 'a buyer after the sale keeps the after-sale move');
  assert.equal(stage({ vehicles: car, texts: [{ who: 'customer', text: "Thanks but I've found another car, I'll pass." }] }).move, 'accept_no', 'a no is still a no');
  assert.ok(selling.QUIET_MOVES.has('accept_deferral'));
  for (const [text, situations] of [['Can I see it next week Saturday at 10?', ['inspection_booking']], ['I want to discuss finance options', ['finance']], ['Is it still available? Not yet sold I hope', ['availability']], ['I need to decide between this and the Alphard, what is the price?', ['price_negotiation']]]) {
    assert.notEqual(stage({ vehicles: car, situations, texts: [{ who: 'customer', text }] }).move, 'accept_deferral', text);
  }
  const priced = stage({ vehicles: car, situations: ['price_negotiation'], texts: [...linkSent, { who: 'customer', text: "I'll think about it, would you take 19k?" }] });
  assert.ok(['invite_before_price', 'answer_offer'].includes(priced.move), priced.move);
  assert.equal(priced.allowsUrgency, false);
});

test('a deposit, a link or a blank in a polite close is pointed out', () => {
  const run = (body, stage) => checks.checkDraft({ reply: body, body, allowedText: 'Vehicle: 2021 Toyota Noah X. https://www.carbarn.com.au/vehicles/toyota/noah/zrr80/1300#inspection=onsite', stage, situation: { all: ['general'] } }).map((c) => `${c.level}:${c.code}`);
  const deferral = { rung: 'interest', move: 'accept_deferral', allowsUrgency: false, aim: 'x', told: { deposit: false, depositAgreed: false } };
  const r = run('That is completely fine. Until a deposit is paid the Noah remains for sale, so we suggest securing it with a $1,000 refundable holding deposit.', deferral);
  assert.ok(r.includes('warn:quiet-close') && r.includes('warn:urgency'), r.join(' '));
  assert.ok(run('Certainly. You can book here:\nhttps://www.carbarn.com.au/vehicles/toyota/noah/zrr80/1300#inspection=onsite', deferral).includes('warn:quiet-close'));
  const fine = run('Thank you for letting us know. The Noah remains available at our Lidcombe showroom.', deferral);
  assert.ok(!fine.includes('warn:quiet-close') && !fine.includes('warn:next-step'), fine.join(' '));
  const asked = checks.checkDraft({ reply: 'x', body: 'Certainly. Here is the link:\nhttps://www.carbarn.com.au/vehicles/toyota/noah/zrr80/1300#inspection=onsite', allowedText: 'https://www.carbarn.com.au/vehicles/toyota/noah/zrr80/1300#inspection=onsite', customerText: "I'll let you know, can you send me the link?", stage: deferral, situation: { all: ['general'] } });
  assert.ok(!asked.some((c) => c.code === 'quiet-close'), 'a link they asked for');
  const parting = { rung: 'fit', move: 'part_well', allowsUrgency: false, aim: 'x', told: { deposit: false, depositAgreed: false } };
  assert.ok(run('Thank you for the offer. Our best price is [PRICE?].', parting).includes('warn:quiet-close'), 'a buyer leaving over the price is not quoted');
  assert.ok(!run('Thank you for the offer, and all the best with your search.', parting).includes('warn:quiet-close'));
  assert.ok(!checks.checkDraft({ reply: 'x', body: 'A $1,000 holding deposit secures it.', stage: deferral, instructed: true }).some((c) => c.code === 'quiet-close'));
});

test('a holding line beside a blank, or two deferrals, is pointed out; a plain blank with a step is not', () => {
  const run = (body, extra = {}) => checks.checkDraft({ reply: body, body, allowedText: 'Vehicle: 2021 Toyota Noah X.', ...extra }).map((c) => `${c.level}:${c.code}`);
  assert.ok(run('Regarding your offer, we will confirm whether that figure is possible: [PRICE?].').includes('warn:holding-blank'));
  assert.ok(run('We will check on the deposit and confirm with you shortly: [CHECK?].').includes('warn:holding-blank'));
  assert.ok(run('We will have our team review them and come back to you shortly with a trade-in value: [TRADE-IN VALUE?].').includes('warn:holding-blank'));
  assert.ok(!run('If you decide not to go ahead, the deposit is [CHECK?]. Let us know either way.').includes('warn:holding-blank'));
  assert.ok(!run('From those, the trade-in value we can offer is [TRADE-IN VALUE?]. If that works for you, let us know a time to see the Noah.').includes('warn:holding-blank'));
  assert.ok(run('We will check the progress on the registration [CHECK?]. We will confirm shortly so you can collect the vehicle.').includes('warn:two-deferrals'));
  assert.ok(!run('Before we bid, our team in Japan inspects the car. We will send the auction sheet once it is listed.').includes('warn:two-deferrals'), 'what we do as a process is not a deferral');
  assert.ok(!run('Thank you for letting us know. We are looking into this and will come back to you shortly.').includes('warn:two-deferrals'), 'the one complaint holding line stays');
  assert.ok(!checks.checkDraft({ reply: 'x', body: 'We will check and confirm: [CHECK?].', instructed: true }).some((c) => c.code === 'holding-blank'));
  assert.ok(run('We will confirm the delivery date shortly: [DATE?].').includes('warn:holding-blank'));
  assert.ok(run('We will check the photos and confirm shortly: [TRADE-IN VALUE?].').includes('warn:holding-blank'));
  assert.ok(!run('We will send the auction sheet shortly once it is listed: [CHECK?].').includes('warn:holding-blank'));
  const workshop = run('We will check with the workshop. The fitting cost is [CHECK?].');
  assert.ok(!workshop.includes('warn:holding-blank') && !workshop.includes('warn:two-deferrals'));
  const voice = promptModule.systemPrompt('sms');
  assert.match(voice, /Never a holding line beside a blank/);
  assert.doesNotMatch(voice, /Otherwise write "We will check and come back to you shortly\."/);
  assert.match(voice, /After the sentence with its blank, one step the person can take now/);
  const time = checks.checkDraft({ reply: 'x', body: 'See you on Friday.', said: [{ who: 'customer', text: 'When will it be ready?', at: Date.now() }], allowedText: '' });
  assert.doesNotMatch(checks.retryNote(time, { channel: 'sms' }), /say we will check and come back/);
});

test('the voice: the rule is said for the person, not the dealership', () => {
  const v = promptModule.systemPrompt('sms').replace(/\s+/g, ' ');
  assert.match(v, /Formal, addressed to the person, plain\./);
  assert.doesNotMatch(v, /Formal, corporate, plain/);
  assert.match(v, /A reply never opens on the dealership's reasons/);
  assert.match(v, /say what this person can do instead, addressed to them and their car/);
  assert.match(v, /the first sentence shows we heard it, and the figure still does not move/);
  assert.match(v, /You were hoping for \$30,000 for your STI/);
  assert.match(v, /"No softening" means the figure holds/);
  assert.match(v, /say what the next step will show them/);
});

test('below commitment the holding deposit is not mentioned; it is when they asked about it or are committing', () => {
  const interest = stage({ situations: ['general'], texts: [{ who: 'customer', text: 'Thx I would want to see in flesh' }] });
  assert.match(selling.stageLines(interest).join('\n'), /Do not propose or mention the holding deposit/);
  const commit = stage({ situations: ['deposit_hold'], texts: [{ who: 'customer', text: 'Can you hold it for me until Saturday?' }] });
  assert.doesNotMatch(selling.stageLines(commit).join('\n'), /Do not propose or mention the holding deposit/);
  const asked = stage({ situations: ['deposit_hold', 'price_negotiation'], texts: [{ who: 'customer', text: 'How much is the deposit?' }] });
  assert.equal(asked.askedDeposit, true);
  assert.doesNotMatch(selling.stageLines(asked).join('\n'), /Do not propose or mention the holding deposit/);
});

test('a buyer who is only asking is asked for nothing; a budget is named as theirs', () => {
  const asking = stage({ channel: 'marketplace', situations: ['price_negotiation'], texts: [{ who: 'customer', text: "What's the lowest price, I am just asking" }] });
  assert.equal(asking.browsing, true);
  assert.match(asking.moveText, /\[PRICE\?\]/);
  assert.doesNotMatch(asking.moveText, /their number/);
  assert.match(selling.stageLines(asking).join('\n'), /ask for nothing/);
  const sms = stage({ channel: 'sms', situations: ['price_negotiation'], texts: [{ who: 'customer', text: "What's the lowest price, I am just asking" }] });
  assert.match(selling.stageLines(sms).join('\n'), /ask for nothing/);
  const negotiable = stage({ channel: 'marketplace', situations: ['price_negotiation'], texts: [{ who: 'customer', text: 'Is the price negotiable?' }] });
  assert.equal(negotiable.browsing, false);
  assert.match(negotiable.moveText, /their number/);
  const flat = promptModule.systemPrompt('marketplace').replace(/\s+/g, ' ');
  assert.match(flat, /A budget is something they gave us: name it as theirs first/);
  assert.match(flat, /answer that with the full stock list link/);
});

test('a buyer asking for other cars in their range gets the stock list, not this car\'s price', () => {
  const text = 'My budget is around 10k\nYou have cars around this range?';
  const noah = { url: 'https://www.carbarn.com.au/vehicles/toyota/noah/zrr80/1300', price: 23900, soldStatus: 'UnSold', stockIn: 'Online', status: 'PUBLISHED' };
  const mk = (channel, t) => plain({ channel, situations: ['price_negotiation'], vehicles: [noah], texts: [{ who: 'customer', text: t }] });
  const mp = selling.saleStage(mk('marketplace', text), { now });
  assert.equal(mp.askedOtherCars, true);
  assert.match(mp.moveText, /full stock list link/);
  assert.doesNotMatch(mp.moveText, /their number/);
  assert.doesNotMatch(mp.moveText, /\[PRICE\?\]/);
  const smsItem = mk('sms', text);
  const sms = selling.saleStage(smsItem, { now });
  assert.equal(sms.moveText, mp.moveText);
  assert.equal(promptModule.pricePlan(smsItem, noah, { stage: sms }).on, false);
  assert.equal(selling.saleStage(mk('marketplace', 'Is the price negotiable?'), { now }).askedOtherCars, false);
  assert.equal(selling.saleStage(mk('marketplace', 'Do you have any other options for finance?'), { now }).askedOtherCars, false, 'a finance question is not a question about other cars');
  assert.equal(selling.saleStage(mk('marketplace', 'Does it come in another colour? Any other ones?'), { now }).askedOtherCars, true, 'documented: "any other ones" reads as other cars');
});

test('a car still in transit may be held, a browsing text gets the price without the invitation, and a browsing offer reply asks for no number', () => {
  const car = (stockIn) => ({ url: 'https://www.carbarn.com.au/vehicles/toyota/noah/zrr80/1300', price: 23900, soldStatus: 'UnSold', stockIn, status: 'PUBLISHED' });
  const interest = (stockIn) => selling.stageLines(selling.saleStage(plain({ situations: ['general'], vehicles: [car(stockIn)], texts: [{ who: 'customer', text: 'Thx I would want to see in flesh' }] }), { now })).join('\n');
  assert.match(interest('Online'), /Do not propose or mention the holding deposit/);
  assert.doesNotMatch(interest('Transit'), /Do not propose or mention the holding deposit/);
  assert.doesNotMatch(interest('Japan'), /Do not propose or mention the holding deposit/);
  const noah = car('Online');
  const sms = (t) => { const item = plain({ situations: ['price_negotiation'], vehicles: [noah], texts: [{ who: 'customer', text: t }] }); return promptModule.pricePlan(item, noah, { stage: selling.saleStage(item, { now }) }); };
  const asking = sms("What's your best price, just asking");
  assert.equal(asking.on, true);
  assert.equal(asking.inspectionUrl, '');
  assert.match(sms("What's your best price").inspectionUrl, /#inspection=/);
  const again = stage({ channel: 'marketplace', situations: ['price_negotiation'], texts: [{ who: 'customer', text: 'Hi, price?' }, { who: 'us', text: 'The lowest we can do on the Noah is $23,000.' }, { who: 'customer', text: 'Would you do 21k? just asking' }] });
  assert.equal(again.move, 'answer_offer');
  assert.doesNotMatch(again.moveText, /their number/);
});
