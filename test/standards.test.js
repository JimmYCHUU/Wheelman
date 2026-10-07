// Model replies: hand-written scenarios on invented customers and cars, rated by the owner on the
// page under Standards. An approved one is shown to the AI as the standard for messages like it.
// Nothing from a scenario is ever learned, and showing one costs no AI request.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyTestEnv } from './support/env.js';
import { startStandins, aiBehaviour } from './support/standins.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wheelman-standards-'));
const MD = path.join(dir, 'model-replies.md');
const STATE = path.join(dir, 'model-replies.json');
const FILE = `# Model replies (a test copy)

## 1. Is it still available
Situation: availability
Rung: interest
Channel: sms
Vehicle: MR1
Name: Priya
Customer:
Hi, is the Noah still available?
Reply:
Hi {{NAME}},
Yes, the 2021 Noah is here at Lidcombe. It has done 62,733 km, with the auction sheet to match.
You are welcome to come and see it any day. Would a weekday after work or Saturday morning suit you?

## 2. Hold it for me
Situation: deposit_hold
Rung: commit
Channel: sms
Vehicle: MR1
Name: Tom
CUSTOMER: Is the Noah still available?
US: Hi Tom, yes, the Noah is here at Lidcombe. You are welcome to come and see it any day.
Customer:
Can you hold it for me until Saturday?
Reply:
Hi {{NAME}},
We hold a car with a $1,000 refundable holding deposit, which takes it off the market for you. Until then it stays for sale.
To send the invoice we need a photo of your driver licence and your email address. Would you like to secure it?

## 3. Marketplace: still available
Situation: availability
Rung: interest
Channel: marketplace
Vehicle: MR4
Name: Yuki
Customer:
Is this still available?
Reply:
Yes, the N-Box is here at Lidcombe, 41,000 km with the auction sheet to match. Happy to send the walkaround video, or you are welcome to come and see it any day.

## 4. Far away
Situation: delivery_interstate inspection_booking
Rung: proof
Channel: sms
Vehicle: MR3
Name: Dana
State: VIC
CUSTOMER: Can I come and see the Alphard?
US: Hi Dana, of course. Here is the booking link: {onsite_link}
Customer:
Actually I'm in Melbourne so can't come up. Any other way to see it?
Reply:
Hi {{NAME}},
No worries. Most of our interstate buyers do a live video inspection on WhatsApp or FaceTime, and then we send the car down by car carrier.
Book a time here: {online_link}
What is your postcode, so we can quote the delivery?

## 5. Already a buyer
Situation: after_sale
Rung: buyer
Channel: sms
Vehicle: MR1
Name: Kofi
Buyer: yes
CUSTOMER: Deposit paid, thanks.
US: Hi Kofi, received, thank you.
Customer:
When will the car be ready to pick up?
Reply:
Hi {{NAME}},
We are finishing the roadworthy, the service and the detail now, and the pickup day is confirmed with you as soon as the roadworthy is done.

## 6. Half written
Situation: availability
Customer:
Is it there?
`;
fs.writeFileSync(MD, FILE);
applyTestEnv({ MODEL_REPLIES_PATH: MD, MODEL_REPLIES_STATE_PATH: STATE });

const now = Date.now();
const MIN = 60e3, HOUR = 3600e3, DAY = 24 * HOUR;
let standins, config, db, items, mr, drafter, promptModule, situations, app, base;
const ai = aiBehaviour();
const seen = ai.seen;

before(async () => {
  standins = await startStandins({ ai });
  ({ config } = await import('../src/config.js'));
  config.llm.gemini.url = `${standins.base}/chat`;
  config.port = 0;
  db = await import('../src/db.js');
  items = await import('../src/items.js');
  mr = await import('../src/modelreplies.js');
  drafter = await import('../src/drafter.js');
  promptModule = await import('../src/prompt.js');
  situations = await import('../src/situations.js');
  app = await (await import('../src/server.js')).startServer();
  base = `http://127.0.0.1:${app.address().port}`;
});

after(async () => {
  await new Promise((r) => { app.close(r); app.closeAllConnections?.(); });
  await standins.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const get = async (p) => (await fetch(base + p)).json();
const send = (p, body) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const post = (p, body) => send(p, body).then((r) => r.json());
const state = () => JSON.parse(fs.readFileSync(STATE, 'utf8'));

test('the file: every scenario with its lines, earlier messages and a reply; a half-written one is left out', () => {
  const all = mr.parseModelReplies(FILE);
  assert.deepEqual(all.map((s) => s.id), [1, 2, 3, 4, 5]);
  const hold = all[1];
  assert.deepEqual([hold.title, hold.situation, hold.rung, hold.channel, hold.vehicle, hold.name, hold.state, hold.buyer], ['Hold it for me', 'deposit_hold', 'commit', 'sms', 'MR1', 'Tom', 'NSW', false]);
  assert.deepEqual(hold.earlier, [{ kind: 'customer', text: 'Is the Noah still available?' }, { kind: 'us', text: 'Hi Tom, yes, the Noah is here at Lidcombe. You are welcome to come and see it any day.' }]);
  assert.equal(hold.customer, 'Can you hold it for me until Saturday?');
  assert.match(hold.reply, /^Hi \{\{NAME\}\},\nWe hold a car/);
  assert.equal(all[2].channel, 'marketplace');
  assert.deepEqual([all[4].buyer, all[3].state], [true, 'VIC']);
  assert.equal(mr.parseModelReplies(FILE.replace(/\n/g, '\r\n')).length, 5, 'Windows line endings are fine');
  assert.deepEqual(mr.standardsCounts(), { total: 5, toRate: 5, approved: 0, rejected: 0 });
});

test('a scenario becomes a conversation in the usual shape: the invented car, the situation, and the links filled in', () => {
  const first = mr.scenarioItem(1, { now });
  assert.deepEqual([first.itemKey, first.anchorKey, first.channel, first.isFirstReply, first.isNewEnquiry, first.state], ['tr:1', 'tr:1:customer', 'sms', true, true, 'awaiting']);
  assert.deepEqual([first.lead.first_name, first.lead.nameOnly, first.hasName, first.lead.status, first.phone], ['Priya', true, true, 'NEW', '']);
  assert.deepEqual([first.situation.primary, first.vehicles[0].stockNo, first.vehicles[0].title], ['availability', 'MR1', '2021 Toyota Noah X (8 Seater)']);
  assert.deepEqual([first.standard.id, first.standard.status, first.standard.title, first.standard.note], [1, 'PROPOSED', 'Is it still available', '']);
  assert.doesNotMatch(first.standard.proposed, /\{[a-z_]+\}/, 'no placeholder left');

  const hold = mr.scenarioItem(2, { now });
  assert.deepEqual([hold.timeline.length, hold.pending.length, hold.isFirstReply, hold.isNewEnquiry, hold.situation.primary], [3, 1, false, false, 'deposit_hold']);
  assert.deepEqual(hold.timeline.map((e) => e.who), ['customer', 'us', 'customer']);
  assert.ok(hold.timeline[1].at < now - DAY, 'earlier messages are days old, so a greeting is due again');

  const far = mr.scenarioItem(4, { now });
  const car = mr.MODEL_VEHICLES.MR3;
  assert.ok(car.url, 'the invented car has a page of its own');
  assert.ok(far.timeline[1].text.endsWith(`${car.url}#inspection=onsite`), "the booking link we sent is the invented car's own");
  assert.ok(far.standard.proposed.includes(`${car.url}#inspection=online`), 'and the online one in the reply');
  assert.equal(mr.fillLinks('see {vehicle_url}', null), 'see {vehicle_url}', 'no car, no links');

  const buyer = mr.scenarioItem(5, { now });
  assert.deepEqual([!!buyer.deal, buyer.lead.status, buyer.situation.primary], [true, 'DEPOSIT_RECEIVED', 'after_sale']);
  const chat = mr.scenarioItem(3, { now });
  assert.deepEqual([chat.channel, chat.marketplace.listingTitle, chat.isNewEnquiry], ['marketplace', '2019 Honda N-Box Custom', false]);
  assert.equal(mr.scenarioItem(99), null);
  assert.equal(items.itemFromKey('tr:2').itemKey, 'tr:2');
  assert.equal(items.itemFromKey('tr:99'), null);
});

test('opening a scenario: the hand-written reply is finished and checked like a suggestion, once, with no AI request', async () => {
  seen.length = 0;
  const { item } = await get('/api/items/tr:1');
  assert.deepEqual(item.standard, { id: 1, title: 'Is it still available', status: 'PROPOSED', note: '', rung: 'interest', situation: 'availability' });
  assert.equal(seen.length, 0, 'no AI request');
  assert.deepEqual([item.draft.provider, item.draft.model, item.draft.status, item.draft.rung], ['none', 'the model reply as written', 'ready', 'interest']);
  assert.match(item.draft.reply, /^Hi Priya,\nYes, the 2021 Noah/);
  assert.ok(item.draft.reply.includes('📍'), 'a first reply ends with the standard block');
  assert.ok(item.draft.checks.every((c) => c.level !== 'fail'), JSON.stringify(item.draft.checks));
  assert.deepEqual([item.name, item.firstName, item.phone, item.channel], ['Priya', 'Priya', '', 'sms']);
  const again = (await get('/api/items/tr:1')).item;
  assert.equal(again.draft.id, item.draft.id, 'the same draft the second time');
  const chat = (await get('/api/items/tr:3')).item;
  assert.deepEqual([chat.channel, chat.draft.provider, chat.draft.reply.includes('📍')], ['marketplace', 'none', false]);
});

test('the Standards section: To rate, Approved and Set aside, in the order of the file', async () => {
  const waiting = await get('/api/items?section=standards&tab=waiting');
  assert.deepEqual(waiting.items.map((r) => r.key), ['tr:1', 'tr:2', 'tr:3', 'tr:4', 'tr:5']);
  const row = waiting.items[0];
  assert.deepEqual([row.section, row.standardStatus, row.car, row.name, row.phone, row.preview.text], ['standards', 'PROPOSED', 'Is it still available', 'Priya', '', 'Hi, is the Noah still available?']);
  assert.deepEqual((await get('/api/items?section=standards&tab=quiet')).items, []);
  assert.deepEqual((await get('/api/items?section=standards&tab=other')).items, []);
  assert.deepEqual([waiting.sections.standards, waiting.counts.waiting, waiting.total], [5, 5, 5], 'the section is on while scenarios exist');
  const listed = await get('/api/standards');
  assert.deepEqual(listed.counts, { total: 5, toRate: 5, approved: 0, rejected: 0 });
  assert.deepEqual(listed.scenarios.map((s) => [s.key, s.status, s.channel]), [['tr:1', 'PROPOSED', 'sms'], ['tr:2', 'PROPOSED', 'sms'], ['tr:3', 'PROPOSED', 'marketplace'], ['tr:4', 'PROPOSED', 'sms'], ['tr:5', 'PROPOSED', 'sms']]);
  assert.ok(!(await get('/api/items?section=dashboard&tab=all')).items.some((r) => /^tr:/.test(r.key)), 'never among the customers');
});

test('"Good reply" approves the text as it stands in the box as the standard; nothing is learned, no AI is asked', async () => {
  const { item } = await get('/api/items/tr:1');
  seen.length = 0;
  const out = await post(`/api/drafts/${item.draft.id}/rating`, { rating: 'good' });
  assert.deepEqual(out, { ok: true, learned: false, standard: true, why: '' });
  assert.equal(seen.length, 0);
  const saved = state()['1'];
  assert.equal(saved.status, 'APPROVED');
  assert.match(saved.reply, /^Hi \{\{NAME\}\},\nYes, the 2021 Noah/);
  assert.ok(!/Priya|📍/.test(saved.reply), 'the name and the standard block are not part of the standard');
  assert.equal(db.getLearned(item.draft.id), null, 'never learned');
  assert.equal((await get('/api/status')).learned.approved, 0);
  assert.deepEqual((await get('/api/standards')).counts, { total: 5, toRate: 4, approved: 1, rejected: 0 });
  assert.deepEqual((await get('/api/items?section=standards&tab=quiet')).items.map((r) => [r.key, r.standardStatus]), [['tr:1', 'APPROVED']]);
  assert.equal((await get('/api/items/tr:1')).item.standard.status, 'APPROVED');

  // Taking it back, then approving again.
  assert.equal((await post(`/api/drafts/${item.draft.id}/rating`, { rating: '' })).standard, true);
  assert.equal(state()['1'].status, 'PROPOSED');
  await post(`/api/drafts/${item.draft.id}/rating`, { rating: 'good' });
  assert.equal(state()['1'].status, 'APPROVED');

  // Edited in the box first: the edited text is what becomes the standard.
  const chat = (await get('/api/items/tr:3')).item;
  const edited = 'Yes, the N-Box is here at Lidcombe with the auction sheet to match. You are welcome to come and see it any day.';
  const kept = await post(`/api/drafts/${chat.draft.id}/edit`, { text: edited });
  assert.ok(kept.savedAt && !kept.learned, 'the edit is kept, and teaches nothing');
  await post(`/api/drafts/${chat.draft.id}/rating`, { rating: 'good' });
  assert.deepEqual([state()['3'].status, state()['3'].reply], ['APPROVED', edited]);
  assert.equal(mr.scenarioItem(3).standard.proposed, edited, 'and is what the scenario shows from now on');
  assert.equal((await get('/api/status')).learned.changed || 0, 0);
});

test('"Could be better" keeps the note with the scenario and writes the reply again; no lesson is taken, nothing is learned', async () => {
  const { item } = await get('/api/items/tr:2');
  seen.length = 0;
  ai.script = [{ reply: 'Hi {{NAME}},\nA $1,000 refundable holding deposit takes the Noah off the market for you until Saturday. Send a photo of your driver licence and your email address and the invoice follows by email.', needs_human: [], facts_used: [], hold: false, next_step: 'the deposit', rung: 'commit' }];
  const out = await post(`/api/drafts/${item.draft.id}/advice`, { note: 'Say what the deposit does in the first line.' });
  assert.deepEqual([out.ok, out.learned, out.standard, out.lessons], [true, false, true, []]);
  assert.equal(seen.length, 1, 'one AI request: the rewrite, and no request for a lesson');
  const asked = seen[0].messages[1].content;
  assert.match(asked, /=== THE OWNER'S COACHING ON YOUR LAST DRAFT ===/);
  assert.ok(!/\bTom\b/.test(asked), "the invented customer's name is still not sent");
  assert.match(out.item.draft.reply, /^Hi Tom,\nA \$1,000 refundable holding deposit/);
  assert.deepEqual([state()['2'].status, state()['2'].note], ['CHANGED', 'Say what the deposit does in the first line.']);
  assert.equal(db.getDraft(item.draft.id).rating, 'edit');
  assert.equal((await get('/api/status')).learned.notes || 0, 0);
  const waiting = await get('/api/items?section=standards&tab=waiting');
  assert.equal(waiting.items.find((r) => r.key === 'tr:2').standardStatus, 'CHANGED', 'still to rate');
  assert.equal((await get('/api/items/tr:2')).item.standard.note, 'Say what the deposit does in the first line.');

  // Rating the new version approves that text.
  await post(`/api/drafts/${out.item.draft.id}/rating`, { rating: 'good' });
  assert.match(state()['2'].reply, /^Hi \{\{NAME\}\},\nA \$1,000 refundable holding deposit/);
  assert.equal((await post(`/api/drafts/${out.item.draft.id}/advice`, { note: '  ' })).ok, false, 'an empty note changes nothing');
  assert.equal(state()['2'].status, 'APPROVED');
});

test('Set aside and Put back, from the details panel', async () => {
  assert.equal((await post('/api/standards/4/status', { status: 'REJECTED' })).item.standard.status, 'REJECTED');
  assert.deepEqual((await get('/api/items?section=standards&tab=other')).items.map((r) => [r.key, r.standardStatus]), [['tr:4', 'REJECTED']]);
  assert.ok(!(await get('/api/items?section=standards&tab=waiting')).items.some((r) => r.key === 'tr:4'));
  assert.deepEqual((await get('/api/standards')).counts, { total: 5, toRate: 1, approved: 3, rejected: 1 });
  assert.equal((await post('/api/standards/4/status', { status: 'PROPOSED' })).item.standard.status, 'PROPOSED');
  assert.ok((await get('/api/items?section=standards&tab=waiting')).items.some((r) => r.key === 'tr:4'));
  assert.equal((await send('/api/standards/4/status', { status: 'MAYBE' })).status, 400);
  assert.equal((await send('/api/standards/99/status', { status: 'REJECTED' })).status, 404);
});

test('an approved model reply is shown to the AI as the standard for a message like it, and a lifted sentence is caught', async () => {
  // Approved so far: 1 (availability, SMS), 2 (deposit, SMS), 3 (availability, Marketplace, as edited).
  const want = (text, primary, rung, channel = 'sms') => mr.modelReplies({ text, primary, situations: [primary], rung, channel }, 3);
  assert.deepEqual(want('Hi, is the Alphard still available?', 'availability', 'interest').map((p) => p.id), [1, 3], 'the SMS standard first for a text');
  assert.deepEqual(want('Is this still available?', 'availability', 'interest', 'marketplace').map((p) => p.id), [3, 1], 'the chat standard first for a chat');
  assert.match(want('Is the Noah available?', 'availability', 'interest')[0].reply, /^Hi \{\{NAME\}\},\nYes, the 2021 Noah/);
  assert.deepEqual(want('Do you do finance?', 'finance', 'fit').map((p) => p.id), [], 'nothing close enough');
  assert.deepEqual(mr.modelReplies({ text: 'Is it available?', primary: 'availability', situations: ['availability'], rung: 'interest', channel: 'sms', excludeItemKey: 'tr:1' }).map((p) => p.id), [3], 'a scenario never sees its own text');
  assert.deepEqual(want('Can you hold it?', 'deposit_hold', 'commit').map((p) => p.id), [2]);
  assert.deepEqual(want('When can I pick it up?', 'after_sale', 'buyer').map((p) => p.id), [], 'not approved: not shown');

  // An invented dashboard customer with the same kind of question.
  db.upsertLead({ id: 1, conversationId: 11, firstName: 'Noor', lastName: 'Test', phone: '0491570131', email: '', source: 'carsales', status: 'NEW', platform: 'CARSALES', state: 'NSW', leadAt: now - HOUR, updatedAt: now - HOUR, stocks: [], inquiries: [], statusHistory: [] });
  db.upsertConversation({ id: 11, phone: '+61491570131', channel: 'SMS', status: 'OPEN', leadId: 1, customerName: 'Noor Test', latestDirection: 'IN', latestAt: now - MIN, latestBody: 'x' });
  db.upsertMessage({ id: 1, conversationId: 11, direction: 'IN', body: 'Hi, is the Alphard still available?', sentBy: null, status: 'SENT', mediaType: null, at: now - MIN, importedAt: now - MIN });
  const asked = promptModule.buildPrompt(items.itemFromKey('c:11'), { now }).user;
  assert.match(asked, /=== MODEL REPLIES ===/);
  const section = asked.split('=== MODEL REPLIES ===')[1].split('\n===')[0];
  assert.match(section, /Yes, the 2021 Noah is here at Lidcombe/);
  assert.match(section, /match the moves, the one question and the length/i);
  assert.ok(!/Priya|Tom|Yuki|📍/.test(section), 'no invented name and no address block');

  db.upsertLead({ id: 2, conversationId: 12, firstName: 'Omar', lastName: 'Test', phone: '0491570132', email: '', source: 'carsales', status: 'NEW', platform: 'CARSALES', state: 'NSW', leadAt: now - HOUR, updatedAt: now - HOUR, stocks: [], inquiries: [], statusHistory: [] });
  db.upsertConversation({ id: 12, phone: '+61491570132', channel: 'SMS', status: 'OPEN', leadId: 2, customerName: 'Omar Test', latestDirection: 'IN', latestAt: now - MIN, latestBody: 'x' });
  db.upsertMessage({ id: 2, conversationId: 12, direction: 'IN', body: 'Do you do finance on the Noah?', sentBy: null, status: 'SENT', mediaType: null, at: now - MIN, importedAt: now - MIN });
  assert.doesNotMatch(promptModule.buildPrompt(items.itemFromKey('c:12'), { now }).user, /=== MODEL REPLIES ===/, 'a different kind of message gets no standard');

  // The standard's own sentences, lifted into a reply for the real customer, are refused as copied.
  const lifted = drafter.assessProposed(items.itemFromKey('c:11'), mr.scenarioItem(1).standard.proposed, { now });
  assert.ok(lifted.checks.some((c) => c.code === 'copied' && c.level === 'fail'), JSON.stringify(lifted.checks));
});

test('the model replies shipped with Wheelman: complete, on invented cars, in the two voices, and clean on the checks', () => {
  const prev = [config.modelRepliesPath, config.modelRepliesStatePath];
  config.modelRepliesPath = fileURLToPath(new URL('../voice/model-replies.md', import.meta.url));
  config.modelRepliesStatePath = path.join(dir, 'shipped-state.json');
  try {
    const all = mr.loadModelReplies();
    assert.ok(all.length >= 30, `${all.length} scenarios`);
    assert.deepEqual(all.map((s) => s.id), all.map((s, i) => i + 1), 'numbered in order');
    assert.ok(all.some((s) => s.channel === 'marketplace') && all.some((s) => s.buyer) && all.some((s) => s.state !== 'NSW'));
    const RUNGS = ['interest', 'proof', 'fit', 'commit', 'buyer'];
    const known = new Set([...Object.keys(situations.SITUATIONS), 'general']);
    const NEVER = ['urgency', 'next-step', 'filler', 'claim', 'questions', 'copied', 'marker', 'figures', 'links', 'promise'];
    for (const s of all) {
      const at = `#${s.id} ${s.title}`;
      assert.ok(RUNGS.includes(s.rung), `${at}: rung`);
      assert.ok(mr.MODEL_VEHICLES[s.vehicle], `${at}: vehicle`);
      for (const sit of s.situation.split(/\s+/)) assert.ok(known.has(sit), `${at}: situation ${sit}`);
      assert.ok(s.name && s.customer && s.reply, `${at}: complete`);
      assert.ok((s.reply.match(/\?/g) || []).length <= 1, `${at}: one question at most`);
      const first = s.channel === 'sms' && !s.earlier.some((e) => e.kind === 'us');
      if (s.channel === 'sms') assert.match(s.reply, /^Hi \{\{NAME\}\},\n/, `${at}: greets by name`);
      else assert.doesNotMatch(s.reply, /^Hi\b|Regards/, `${at}: a chat reply has no greeting or sign-off`);
      if (first) {
        assert.ok(s.reply.split(/\s+/).length <= 45, `${at}: a first reply stays under 45 words`);
        assert.doesNotMatch(s.reply, /https?:|\{\w+_(url|link)\}|\b04\d{2}\b/, `${at}: a first reply leaves the links to the block`);
      }
      const item = mr.scenarioItem(s.id, { now });
      assert.doesNotMatch(item.standard.proposed, /\{[a-z_]+\}/, `${at}: links filled`);
      const out = drafter.assessProposed(item, item.standard.proposed, { now });
      const bad = out.checks.filter((c) => c.level === 'fail' || c.level === 'input' || NEVER.includes(c.code));
      assert.deepEqual(bad, [], `${at}: ${JSON.stringify(bad)}`);
    }
  } finally {
    [config.modelRepliesPath, config.modelRepliesStatePath] = prev;
  }
});
