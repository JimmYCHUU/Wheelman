// Facts by markers, in the compact prompt style: every figure and link in our records reaches the
// AI as a marker such as {{F3}}, code puts the value back, and a figure the AI typed itself that
// nobody wrote in the conversation fails the draft. The full style is untouched. All data is
// invented; a stand-in AI service on this computer plays the model. Numbers 0491 570 4xx are this
// file's.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { applyTestEnv } from './support/env.js';
import { startStandins, aiBehaviour } from './support/standins.js';

applyTestEnv({ DAILY_DRAFT_LIMIT: '200' });
delete process.env.PROMPT_STYLE;

const now = Date.now();
const MIN = 60e3, HOUR = 3600e3, DAY = 24 * HOUR;

let standins, db, items, drafter, promptModule, sync, facts, checks;
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
  facts = await import('../src/factmarkers.js');
  checks = await import('../src/checks.js');
  sync.storeVehicles([{ id: 1, stockNo: '3147', year: '2020', title: '2020 Toyota Noah Si', make: 'TOYOTA', model: 'Noah', modelCode: 'ZRR80', auPublishPrice: 36990, odometer: 41200, seats: 8, status: 'PUBLISHED', soldStatus: 'UnSold', stockIn: 'Online', outline: ['6 Months NSW Registration', '5-Year Extended Warranty'] }]);
});

after(async () => { await standins.close(); });

let mid = 1;
const customer = (n, first, history) => {
  const id = 400 + n;
  db.upsertLead({ id, conversationId: id, firstName: first, lastName: 'Test', phone: `0491 570 4${String(n).padStart(2, '0')}`, email: '', source: 'carsales', status: 'FOLLOW_UP', platform: 'CARSALES', state: 'NSW', leadAt: now - 2 * DAY, updatedAt: now - HOUR, stocks: ['3147'], inquiries: [], statusHistory: [] });
  db.upsertConversation({ id, phone: `+614915704${String(n).padStart(2, '0')}`, channel: 'SMS', status: 'OPEN', leadId: id, customerName: `${first} Test`, latestDirection: 'IN', latestAt: now - MIN, latestBody: 'x' });
  for (const [direction, body, ago] of history) db.upsertMessage({ id: mid++, conversationId: id, direction, body, sentBy: direction === 'OUT' ? 'Dana' : null, status: 'SENT', mediaType: null, at: now - ago, importedAt: now - ago });
  return () => items.buildItem({ conversationId: id });
};
const answer = (reply, more = {}) => ({ reply, needs_human: [], facts_used: [], hold: false, ...more });
const script = (...answers) => { seen.length = 0; ai.script = answers; };
const codes = (list) => list.map((c) => c.code);
const fails = (list) => list.filter((c) => c.level === 'fail').map((c) => c.code);
const section = (user, name) => (user.split(`=== ${name} ===`)[1] || '').split(/\n=== /)[0];

// What writeDraft gives assessReply, built by hand: our records may be quoted, the customer's words are theirs.
const assessWith = (item, prompt, reply, { staffSaid = '', byCode = false } = {}) => drafter.assessReply(item, prompt, answer(reply), {
  allowed: {
    trusted: [prompt.vehicleText, item.timeline.filter((e) => e.who === 'us').map((e) => e.text).join('\n')].join('\n'),
    policy: [prompt.businessFactsText, prompt.websiteText].join('\n'),
    customer: item.timeline.filter((e) => e.who !== 'us').map((e) => e.text).join('\n'),
  },
  said: [], staffSaid, now, byCode,
});
const markerFor = (prompt, value) => {
  const m = prompt.factMarkers.find((x) => x.value === value);
  assert.ok(m, `no marker for ${value}: ${JSON.stringify(prompt.factMarkers)}`);
  return `{{${m.name}}}`;
};

test('masking a line of our records gives one marker per figure or link, and restoring gives the line back exactly', () => {
  const line = 'Price: $36,990 · 41,200 km · harbour.example/cars/T14';
  const { masked, markers } = facts.maskTrusted({ 'VEHICLE FACTS': line });
  assert.equal(markers.length, 3, JSON.stringify(markers));
  assert.deepEqual(markers.map((m) => m.name), ['F1', 'F2', 'F3']);
  assert.deepEqual(markers.map((m) => m.value), ['$36,990', '41,200', 'harbour.example/cars/T14']);
  assert.equal(masked['VEHICLE FACTS'], 'Price: {{F1}} · {{F2}} km · {{F3}}');
  assert.equal(facts.restoreFacts(masked['VEHICLE FACTS'], markers), line);

  // The same value always gets the same name, across sections; a blank for a person is never masked.
  const two = facts.maskTrusted({ 'VEHICLE FACTS': line, 'BUSINESS FACTS': 'Hold it for $1,000. The Noah is $36,990. Open from 9 am. Call 0491 570 427. Trade-in: [TRADE-IN VALUE?]' });
  assert.match(two.masked['BUSINESS FACTS'], /The Noah is \{\{F1\}\}\./);
  assert.match(two.masked['BUSINESS FACTS'], /\[TRADE-IN VALUE\?\]$/);
  assert.ok(!two.markers.some((m) => m.value.includes('?]')), 'no blank among the markers');
  assert.deepEqual(two.markers.slice(3).map((m) => m.value), ['$1,000', '9 am', '0491 570 427']);
  assert.equal(facts.restoreFacts(two.masked['BUSINESS FACTS'], two.markers), 'Hold it for $1,000. The Noah is $36,990. Open from 9 am. Call 0491 570 427. Trade-in: [TRADE-IN VALUE?]');
});

test('a model year stays plain text and is never a typed figure; other four-digit numbers are still facts', () => {
  const name = facts.maskTrusted({ 'VEHICLE FACTS': 'Vehicle: 2019 Toyota Harrier\nYear: 2019\nBuilt: 03/2019' });
  assert.equal(name.masked['VEHICLE FACTS'], 'Vehicle: 2019 Toyota Harrier\nYear: 2019\nBuilt: 03/2019');
  assert.deepEqual(name.markers, []);
  const postcode = facts.maskTrusted({ 'BUSINESS FACTS': 'Address: 136 Frances Street, Lidcombe NSW 2141.' });
  assert.equal(postcode.masked['BUSINESS FACTS'], 'Address: 136 Frances Street, Lidcombe NSW {{F1}}.');
  assert.deepEqual(postcode.markers.map((m) => m.value), ['2141']);
  assert.deepEqual(facts.inventedLiterals('It is the 2017 model.', { allowedText: '' }), []);
  assert.deepEqual(facts.inventedLiterals('Built in 1979, stock 2141.', { allowedText: '' }), ['1979', '2141']);
});

test('a figure the AI typed itself is found; one the customer wrote, or a marker, is not', () => {
  const allowedText = 'Would you take $24k for the Noah? Can I come at 10:30? See harbour.example/cars/T14 and call me on 0491 570 418';
  assert.deepEqual(facts.inventedLiterals('It is $31,990.', { allowedText: 'Is the Noah still available?' }), ['$31,990']);
  assert.deepEqual(facts.inventedLiterals('It is {{F1}}.', { allowedText: '' }), []);
  // Review Focus 3: the customer's own figure, in the k shorthand or written out.
  assert.deepEqual(facts.inventedLiterals('Thank you for your offer of $24k.', { allowedText }), []);
  assert.deepEqual(facts.inventedLiterals('Thank you for your offer of $24,000.', { allowedText }), []);
  assert.deepEqual(facts.inventedLiterals('See you at 10:30 am. The page is https://harbour.example/cars/T14/ and we will call 0491570418.', { allowedText }), []);
  assert.deepEqual(facts.inventedLiterals('We can do $23k, 5 days a week, at harbour.example/cars/T15.', { allowedText }), ['$23k', '5 days', 'harbour.example/cars/T15']);
});

test('a marker that is not one of ours is found, and restoring never leaves a marker in the text', () => {
  const { markers } = facts.maskTrusted({ 'VEHICLE FACTS': 'Price: $36,990 · 41,200 km · harbour.example/cars/T14' });
  assert.deepEqual(facts.unknownMarkers('{{F9}}', markers), ['{{F9}}']);
  assert.deepEqual(facts.unknownMarkers('It is {{F1}} with {F2} km.', markers), ['{F2}']);
  assert.deepEqual(facts.unknownMarkers('It is {{F1}}, {{K1}} and {{NAME}}.', markers), []);
  assert.equal(facts.restoreFacts('{{F9}}', markers), '[CHECK?]');
  assert.equal(facts.restoreFacts('It is {{F1}} with {F2} km.', markers), 'It is $36,990 with [CHECK?] km.');
  // A dollar sign written in front of a price marker is not written twice.
  assert.equal(facts.restoreFacts('It is ${{F1}}.', markers), 'It is $36,990.');
  // What the AI wrote beside the reply gets the facts back too.
  assert.deepEqual(facts.restoreAnswer({ reply: 'It is {{F1}}.', next_step: 'see it at {{F3}}', facts_used: ['price {{F1}}'], needs_human: [{ marker: '[PRICE?]', reason: 'below {{F1}}' }], hold: false }, markers),
    { reply: 'It is $36,990.', next_step: 'see it at harbour.example/cars/T14', facts_used: ['price $36,990'], needs_human: [{ marker: '[PRICE?]', reason: 'below $36,990' }], hold: false });
});

test('the compact request shows our records as markers; the conversation and the instruction keep their own words', () => {
  const item = customer(1, 'Ingrid', [['IN', 'Is the Noah still available?', 2 * DAY], ['OUT', 'Good morning Ingrid, yes it is.', 2 * DAY - HOUR], ['IN', 'Would you take $24k for it?', 5 * MIN]])();
  const compact = promptModule.buildPrompt(item, { now, style: 'compact', instruction: 'Tell her $35,500 is our best price' });
  assert.ok(Array.isArray(compact.factMarkers) && compact.factMarkers.length > 0);
  const vehicle = section(compact.user, 'VEHICLE FACTS');
  assert.ok(vehicle.includes(markerFor(compact, '$36,990')), vehicle);
  // The model year reads as it is (Ruling 2): "2020 Toyota Noah Si", not a marker.
  assert.ok(vehicle.includes('Vehicle: 2020 Toyota Noah Si'), vehicle);
  assert.ok(!/\$36,990|41,200|https?:\/\//.test(vehicle), vehicle);
  assert.ok(!compact.user.includes('$36,990'), 'the price is nowhere in the request');
  assert.ok(section(compact.user, 'CONVERSATION SO FAR').includes('$24k'));
  assert.ok(section(compact.user, 'INSTRUCTION FROM OUR STAFF FOR THIS DRAFT').includes('$35,500'));
  // The values themselves stay with code: the facts the checks read are unmasked.
  assert.ok(compact.vehicleText.includes('$36,990'));

  const full = promptModule.buildPrompt(item, { now });
  assert.equal(full.factMarkers, null);
  assert.ok(section(full.user, 'VEHICLE FACTS').includes('$36,990'));
  assert.equal(full.user, promptModule.buildPrompt(item, { now, style: 'full' }).user);

  // The rule, in the compact rules only.
  const sentence = 'Prices, distances, dates, phone numbers and links in our records appear as markers such as {{F3}}. Write the marker where the fact goes; never write the figure yourself.';
  assert.ok(promptModule.systemPrompt('sms', { style: 'compact' }).split('=== WHERE FACTS COME FROM ===')[1].split('=== PROMISES AND TIMES ===')[0].includes(sentence));
  assert.ok(!promptModule.systemPrompt('sms').includes('{{F3}}'));
});

test('compact: a figure the AI typed fails figure-raw, a marker is put back and passes, an unknown marker fails marker-unknown', () => {
  const item = customer(2, 'Ottilie', [['IN', 'Hello, is the Noah still at your yard?', 2 * DAY], ['OUT', 'Good morning Ottilie, yes it is.', 2 * DAY - HOUR], ['IN', 'Is it still available?', 5 * MIN]])();
  const prompt = promptModule.buildPrompt(item, { now, style: 'compact' });

  const typed = assessWith(item, prompt, 'It is $31,990.');
  assert.ok(fails(typed.checks).includes('figure-raw'), JSON.stringify(typed.checks));
  assert.deepEqual(typed.checks.find((c) => c.code === 'figure-raw').tokens, ['$31,990']);

  const marked = assessWith(item, prompt, `It is ${markerFor(prompt, '$36,990')}.`);
  assert.equal(marked.body, 'It is $36,990.');
  assert.ok(marked.reply.startsWith('It is $36,990.'), marked.reply);
  assert.deepEqual(fails(marked.checks), [], JSON.stringify(marked.checks));

  // Review Focus 2: a marker that does not exist fails, and never reaches the reply.
  const unknown = `{{F${prompt.factMarkers.length + 9}}}`;
  const made = assessWith(item, prompt, `It is ${unknown}.`);
  assert.ok(fails(made.checks).includes('marker-unknown'), JSON.stringify(made.checks));
  assert.ok(!/\{\{F/.test(made.reply) && !/\{\{F/.test(made.body), made.reply);
  assert.ok(made.reply.includes('[CHECK?]'), made.reply);
  assert.ok(!codes(made.checks).includes('placeholder'), 'the marker is a blank now, not a leftover placeholder');
});

test('compact: the customer\'s own figure, repeated as theirs, is not figure-raw (Review Focus 3)', () => {
  const item = customer(3, 'Leopold', [['IN', 'Is the Noah still available?', 2 * DAY], ['OUT', 'Good morning Leopold, yes it is.', 2 * DAY - HOUR], ['IN', 'Would you take $24k for it?', 5 * MIN]])();
  const prompt = promptModule.buildPrompt(item, { now, style: 'compact' });
  const d = assessWith(item, prompt, 'Thank you for your offer of $24k.');
  assert.ok(!codes(d.checks).includes('figure-raw'), JSON.stringify(d.checks));
  // A figure from our staff's instruction is theirs to give too.
  const told = assessWith(item, prompt, 'Our best price is $35,500.', { staffSaid: 'Tell him $35,500 is our best price' });
  assert.ok(!codes(told.checks).includes('figure-raw'), JSON.stringify(told.checks));
});

test('full style: no markers, and assessReply behaves as it always has', () => {
  const item = customer(4, 'Wilhelmina', [['IN', 'Hello, is the Noah still at your yard?', 2 * DAY], ['OUT', 'Good morning Wilhelmina, yes it is.', 2 * DAY - HOUR], ['IN', 'Is it still available?', 5 * MIN]])();
  const prompt = promptModule.buildPrompt(item, { now });
  assert.equal(prompt.factMarkers, null);
  const typed = assessWith(item, prompt, 'It is $31,990.');
  assert.ok(fails(typed.checks).includes('figure'), JSON.stringify(typed.checks));
  assert.ok(!codes(typed.checks).some((c) => c === 'figure-raw' || c === 'marker-unknown'));
  // A marker is just a leftover placeholder in the full style, as before.
  const left = assessWith(item, prompt, 'It is {{F1}}.');
  assert.equal(left.body, 'It is {{F1}}.');
  assert.ok(fails(left.checks).includes('placeholder'), JSON.stringify(left.checks));
  assert.ok(!codes(left.checks).includes('marker-unknown'));
  assert.equal(assessWith(item, prompt, 'It is $36,990.').body, 'It is $36,990.');
});

test('compact draft: a typed figure goes back once with the markers as the AI saw them, and the facts come back in every field', async () => {
  const item = customer(5, 'Margarethe', [['IN', 'Hello, is the Noah still at your yard?', 2 * DAY], ['OUT', 'Good morning Margarethe, yes it is.', 2 * DAY - HOUR], ['IN', 'Is it still available?', 5 * MIN]]);
  const price = markerFor(promptModule.buildPrompt(item(), { now, style: 'compact' }), '$36,990');
  script(answer(`It is ${price}, or $31,990 to you.`), answer(`It is ${price}.`, { facts_used: [`Advertised price ${price}`], next_step: `confirm ${price}` }));
  const d = await drafter.draftFor(item(), { now, save: false, style: 'compact' });
  assert.equal(seen.length, 2, 'one second request');
  const retry = seen[1].messages[1].content;
  assert.ok(retry.includes('Write facts only as their markers.'), 'the retry note says how to write facts');
  assert.ok(retry.includes(`Your rejected draft was:\nIt is ${price}, or $31,990 to you.`), retry.slice(-400));
  assert.ok(!seen.some((b) => b.messages.some((m) => m.content.includes('$36,990'))), 'the price never went to the AI');
  assert.ok(d.reply.startsWith('It is $36,990.'), d.reply);
  assert.ok(!codes(d.checks).includes('figure-raw'), JSON.stringify(d.checks));
  assert.deepEqual(d.factsUsed, ['Advertised price $36,990']);
  assert.equal(d.nextStep, 'confirm $36,990');
});

test('compact draft: a made-up marker written twice is never shown as a marker', async () => {
  const item = customer(6, 'Rosalind', [['IN', 'Hello, is the Noah still at your yard?', 2 * DAY], ['OUT', 'Good morning Rosalind, yes it is.', 2 * DAY - HOUR], ['IN', 'Is it still available?', 5 * MIN]]);
  script(answer('It is {{F990}}.'), answer('Yes, it is {{F991}}.'));
  const d = await drafter.draftFor(item(), { now, save: false, style: 'compact' });
  assert.equal(seen.length, 2, 'the usual one second request');
  assert.ok(!/\{\{F/.test(d.reply), d.reply);
  assert.ok(d.reply.includes('[CHECK?]'), d.reply);
  assert.ok(fails(d.checks).includes('marker-unknown'), JSON.stringify(d.checks));
});

test('compact: code\'s own wording (the standard opening of an offer, a template word for word) is not checked for typed figures', () => {
  const item = customer(7, 'Cosima', [['IN', 'Hello, is the Noah still at your yard?', 2 * DAY], ['OUT', 'Good morning Cosima, yes it is.', 2 * DAY - HOUR], ['IN', 'Is it still available?', 5 * MIN]])();
  const prompt = promptModule.buildPrompt(item, { now, style: 'compact' });
  const opening = 'We have found a 2015 Toyota Alphard with 63,800 km that may be worth considering.';
  assert.ok(codes(assessWith(item, prompt, opening).checks).includes('figure-raw'), 'the AI typing it fails');
  assert.ok(!codes(assessWith(item, prompt, opening, { byCode: true }).checks).includes('figure-raw'), 'code writing it does not');
});

test('compact template fitting: the facts come back, and a fitting with a fact marker in it is not kept to be used again', async () => {
  const fitter = await import('../src/fitter.js');
  const item = customer(8, 'Evander', [['IN', 'Hello, is the Noah still at your yard?', 2 * DAY], ['OUT', 'Good morning Evander, yes it is.', 2 * DAY - HOUR], ['IN', 'Is it still available?', 5 * MIN]]);
  const tpl = { id: 'x', label: 'X', masked: fitter.maskTemplate({ part: 'Hello {{NAME}},\n\nThe Noah is still available.', values: {} }), wordChecks: [], factsUsed: [] };
  const price = markerFor(promptModule.buildPrompt(item(), { now, style: 'compact', importPlan: fitter.templatePlan(tpl) }), '$36,990');
  script(answer(`Hello {{NAME}},\n\nThe Noah is still available, at ${price}.`));
  const marked = await drafter.draftFor(item(), { now, save: false, style: 'compact', template: tpl });
  assert.equal(seen.length, 1, JSON.stringify(marked.checks));
  assert.match(marked.reply, /The Noah is still available, at \$36,990\./);
  assert.equal(marked.context.fitted, null, 'its markers are numbered afresh in every request');
  script(answer('Hello {{NAME}},\n\nYes, the Noah is still available.'));
  const plain = await drafter.draftFor(item(), { now, save: false, style: 'compact', template: tpl });
  assert.equal(plain.context.fitted, 'Hello {{NAME}},\n\nYes, the Noah is still available.');
});

test('compact: a figure from our own rules in the request passes; one found only in what other customers were sent fails', () => {
  const item = customer(9, 'Thaddeus', [['IN', 'Is the Noah still available?', 2 * DAY], ['OUT', 'Good morning Thaddeus, yes it is.', 2 * DAY - HOUR], ['IN', 'I would like to buy it. How do I hold it?', 5 * MIN]])();
  const prompt = promptModule.buildPrompt(item, { now, style: 'compact' });
  // The SELLING section's deposit is our own rule.
  assert.ok(section(prompt.user, 'SELLING FOR THIS MESSAGE').includes('$1,000'));
  assert.ok(!codes(assessWith(item, prompt, 'A $1,000 holding deposit takes the Noah off the market for you.').checks).includes('figure-raw'));
  // The Marketplace channel rules' inclusions are ours too.
  const chatRules = { ...prompt, system: promptModule.systemPrompt('marketplace', { style: 'compact' }) };
  assert.ok(!codes(assessWith(item, chatRules, 'The price includes 6 months rego, a fresh roadworthy and a 5-year warranty.').checks).includes('figure-raw'));

  // A price that is only in a learning section (another customer's car) is not ours to type.
  const learning = (heading, body) => ({ ...prompt, user: prompt.user.replace('\n=== CONVERSATION SO FAR ===', `\n=== ${heading} ===\n${body}\n\n=== CONVERSATION SO FAR ===`) });
  const example = learning('EXAMPLES OF HOW WE REPLY', 'Example 1\n  Customer: how much to hold it\n  We replied: It is $29,950 and a deposit holds it.');
  assert.ok(example.user.includes('$29,950'));
  assert.ok(fails(assessWith(item, example, 'It is $29,950.').checks).includes('figure-raw'));
  for (const heading of ['HOW OUR STAFF CHANGED EARLIER SUGGESTIONS', 'WHAT OUR TEAM REALLY SENT FOR SIMILAR MESSAGES', 'HOW WE ANSWERED SIMILAR IMPORT EMAILS']) {
    assert.ok(fails(assessWith(item, learning(heading, 'Case 1\n  Customer: how much\n  Staff used: It is $29,950.'), 'It is $29,950.').checks).includes('figure-raw'), heading);
  }
  // The owner's guidance: an approved reply to another customer is learning; the owner's own lesson is ours.
  const owner = learning('HOW THE OWNER WANTS THIS HANDLED', 'The owner of the business reads your suggestions and coaches you.\n- When they ask to hold it: the holding deposit is $1,250.\nApproved as written, for a similar message\n  Customer: how much\n  You wrote: It is $29,950.\n  Handle this one the same way.');
  assert.ok(fails(assessWith(item, owner, 'It is $29,950.').checks).includes('figure-raw'));
  assert.ok(!codes(assessWith(item, owner, 'The holding deposit is $1,250.').checks).includes('figure-raw'));
});

test('compact: a figure from the coaching draft our staff commented on may be repeated', () => {
  const item = customer(10, 'Philippa', [['IN', 'Is the Noah still available?', 2 * DAY], ['OUT', 'Good morning Philippa, yes it is.', 2 * DAY - HOUR], ['IN', 'Is it still available?', 5 * MIN]])();
  const coaching = { draft: 'Yes, and delivery to Newcastle is $450.', note: 'Shorter, please.' };
  const prompt = promptModule.buildPrompt(item, { now, style: 'compact', coaching });
  const d = drafter.assessReply(item, prompt, answer('Yes, and delivery is $450.'), { allowed: { trusted: prompt.vehicleText, policy: '', customer: '' }, said: [], staffSaid: coaching.note, coaching, now });
  assert.ok(!codes(d.checks).includes('figure-raw'), JSON.stringify(d.checks));
});

test('the second request says to write facts as markers only when a fact check fired', () => {
  const line = 'Write facts only as their markers.';
  assert.ok(checks.retryNote([{ level: 'fail', code: 'figure-raw', message: 'x' }]).includes(line));
  assert.ok(checks.retryNote([{ level: 'fail', code: 'marker-unknown', message: 'x' }]).includes(line));
  assert.ok(!checks.retryNote([{ level: 'fail', code: 'figure', message: 'x' }]).includes(line));
});
