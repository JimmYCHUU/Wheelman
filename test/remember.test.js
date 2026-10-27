// Lessons with a scope and an off switch: Remember keeps a Tell Wheelman instruction as a lesson for
// every later reply of its kind, a lesson can be switched off, and copying a suggestion as written
// counts as approval. All data is invented. A stand-in AI service on this computer plays the model;
// the page's own routes are called.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { applyTestEnv } from './support/env.js';
import { startStandins, aiBehaviour } from './support/standins.js';

applyTestEnv({ DAILY_DRAFT_LIMIT: '200' });

const now = Date.now();
const MIN = 60e3, HOUR = 3600e3;
let standins, app, base, db, items, learn, promptModule, sync;
const ai = aiBehaviour({ behave: () => ({ reply: 'Hello {{NAME}},\nCertainly.', needs_human: [], facts_used: [], hold: false }) });

const REFUSED = 'Marketplace chats, phone-only texts and auction orders do not teach Wheelman.';
const FOLLOW_UPS = 'Follow-ups do not teach Wheelman.';
const AUCTION = 'Auction conversations do not teach Wheelman.';
const NOTHING = 'There is no instruction to remember.';

before(async () => {
  standins = await startStandins({ ai });
  const { config } = await import('../src/config.js');
  config.llm.gemini.url = `${standins.base}/chat`;
  config.port = 0;
  db = await import('../src/db.js');
  items = await import('../src/items.js');
  learn = await import('../src/learn.js');
  promptModule = await import('../src/prompt.js');
  sync = await import('../src/sync.js');
  sync.storeVehicles([{ id: 1, stockNo: '1300', year: '2021', title: '2021 Toyota Noah X', make: 'TOYOTA', model: 'Noah', modelCode: 'ABC10', auPublishPrice: 21900, odometer: 60000, seats: 8, status: 'PUBLISHED', soldStatus: 'UnSold', stockIn: 'Online', outline: ['6 Months NSW Registration'] }]);
  app = await (await import('../src/server.js')).startServer();
  base = `http://127.0.0.1:${app.address().port}`;
});

after(async () => { await new Promise((r) => { app.close(r); app.closeAllConnections?.(); }); await standins.close(); });

let mid = 1;
/**
 * A customer who asked about the Noah (stock 1300). ongoing: we answered them before (25 hours ago,
 * or `oursAgo`), so the reply is plain lines; otherwise it is a brand-new enquiry.
 */
function customer(id, first, question, { ongoing = true, oursAgo = 25 * HOUR } = {}) {
  db.upsertLead({ id, conversationId: id + 500, firstName: first, lastName: 'Test', phone: `0491 570 1${String(id).padStart(2, '0')}`, email: '', source: 'carsales', status: 'FOLLOW_UP', platform: 'CARSALES', state: 'NSW', leadAt: now - 30 * HOUR, updatedAt: now - 5 * MIN, stocks: ['1300'], inquiries: [], statusHistory: [] });
  db.upsertConversation({ id: id + 500, phone: `+614915701${String(id).padStart(2, '0')}`, channel: 'SMS', status: 'OPEN', leadId: id, customerName: `${first} Test`, latestDirection: 'IN', latestAt: now - 5 * MIN, latestBody: 'x' });
  const say = (direction, body, agoMs) => db.upsertMessage({ id: mid++, conversationId: id + 500, direction, body, sentBy: direction === 'OUT' ? 'Dana' : null, status: 'SENT', mediaType: null, at: now - agoMs, importedAt: now - agoMs });
  if (ongoing) {
    say('IN', 'Hello, is the Noah still for sale?', oursAgo + HOUR);
    say('OUT', 'Hello, yes it is. How can we help?', oursAgo);
  }
  say('IN', question, 5 * MIN);
  return `c:${id + 500}`;
}
const post = async (path, body = {}) => { const res = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return { status: res.status, ...(await res.json()) }; };
const get = async (path) => (await fetch(base + path)).json();
const draftOf = async (key) => (await get(`/api/items/${key}`)).item.draft;
/** Has Wheelman write a suggestion with the given text, from an instruction when one is given (Tell Wheelman). */
async function write(key, reply, { instruction = '', needsHuman = [] } = {}) {
  ai.script = [{ reply, needs_human: needsHuman, facts_used: [], hold: false }];
  const out = await post(`/api/items/${key}/draft`, { instruction });
  assert.equal(out.ok, true, out.error);
  return out.item.draft;
}
/** The request the stand-in AI saw last. */
const lastAsked = () => ai.seen[ai.seen.length - 1].messages[1].content;
const asked = (key) => promptModule.buildPrompt(items.itemFromKey(key), { now: Date.now() }).user;
const lessons = async () => (await get('/api/lessons')).lessons;

test('remember stores one lesson with its scope and channel', async () => {
  const key = customer(1, 'Ava', 'What is your best price on the Noah?');
  const d = await write(key, 'Hello {{NAME}},\nThanks for asking about the Noah.', { instruction: 'Do not mention finance.' });
  assert.equal(d.instruction, 'Do not mention finance.');
  // A Could be better note on the same suggestion is not replaced by the lesson.
  const note = db.insertAdvice({ draftId: d.id, itemKey: key, situations: ['price_negotiation'], firstReply: false, customerText: 'x', draftText: 'y', note: 'Shorter, please.', lessons: [] });
  const before = db.countRows('advice');

  const out = await post(`/api/drafts/${d.id}/remember`, { scope: 'price_negotiation' });
  assert.equal(out.status, 200, out.error);
  assert.deepEqual(Object.keys(out.lesson).sort(), ['at', 'channel', 'do', 'id', 'off', 'scope']);
  assert.deepEqual([out.lesson.do, out.lesson.scope, out.lesson.channel, out.lesson.off], ['Do not mention finance.', 'price_negotiation', 'sms', false]);
  assert.ok(out.lesson.at >= now);
  assert.equal(db.countRows('advice'), before + 1, 'one row');

  const row = db.allAdvice().find((a) => a.id === out.lesson.id);
  assert.deepEqual([row.kind, row.channel, row.draft_id, row.note, row.item_key], ['remember', 'sms', null, 'Do not mention finance.', key]);
  assert.deepEqual(row.lessons, [{ scope: 'price_negotiation', when: '', do: 'Do not mention finance.', internal: false }]);
  assert.ok(db.allAdvice().some((a) => a.id === note), 'the Could be better note on the same suggestion is still there');

  // Pressing Remember again keeps the one lesson.
  const again = await post(`/api/drafts/${d.id}/remember`, { scope: 'price_negotiation' });
  assert.equal(again.lesson.id, out.lesson.id);
  assert.equal(db.countRows('advice'), before + 1);

  const listed = (await lessons()).find((l) => l.id === out.lesson.id);
  assert.deepEqual(listed, { id: out.lesson.id, n: 0, kind: 'remember', channel: 'sms', scope: 'price_negotiation', do: 'Do not mention finance.', at: again.lesson.at, off: false, usedCount: 0, lastUsedAt: null });

  // A lesson remembered from an import email is for emails.
  const mail = db.insertRemember({ itemKey: 'em:9', scope: 'any', instruction: 'Give the deposit band in every email.' });
  assert.equal((await lessons()).find((l) => l.id === mail).channel, 'email');
  db.deleteAdvice(mail);
  db.switchLesson(out.lesson.id, false);
});

test('a remembered lesson goes into the next request for the same kind of reply, the same conversation included', async () => {
  const key = customer(2, 'Ben', 'Can you do a better price on the Noah?');
  const d = await write(key, 'Hello {{NAME}},\nThanks for asking about the Noah.', { instruction: 'Never offer free floor mats.' });
  const { lesson } = await post(`/api/drafts/${d.id}/remember`, { scope: 'price_negotiation' });
  assert.ok(lesson?.id);

  // The same conversation, written again with no instruction: the lesson is in the request.
  await write(key, 'Hello {{NAME}},\nThanks for asking about the Noah.');
  assert.match(lastAsked(), /=== HOW THE OWNER WANTS THIS HANDLED ===[\s\S]*\n- Never offer free floor mats\.\n/);
  // Another customer asking about the price gets it too.
  const other = customer(3, 'Cai', 'What is the lowest you would take for the Noah?');
  assert.match(asked(other), /\n- Never offer free floor mats\.\n/);
  // A question of another kind does not, and neither does an email.
  const where = customer(4, 'Dee', 'Where are you located?');
  assert.ok(!asked(where).includes('Never offer free floor mats.'));
  const q = { situations: ['price_negotiation'], primary: 'price_negotiation', text: 'best price', firstReply: false };
  assert.ok(learn.ownerGuidance({ ...q, channel: 'sms', excludeItemKey: key }).lessons.some((l) => l.do === 'Never offer free floor mats.'));
  assert.ok(!learn.ownerGuidance({ ...q, channel: 'email' }).lessons.some((l) => l.do === 'Never offer free floor mats.'));

  // A Could be better note is still held out of its own conversation, as before.
  const note = db.insertAdvice({ draftId: null, itemKey: key, situations: ['price_negotiation'], firstReply: false, customerText: 'x', draftText: 'y', note: 'n', lessons: [{ scope: 'any', when: '', do: 'Keep every reply under fifty words.', internal: false }] });
  assert.ok(!asked(key).includes('Keep every reply under fifty words.'));
  assert.ok(asked(other).includes('Keep every reply under fifty words.'));
  db.deleteAdvice(note);

  // Each lesson carries where it came from.
  const g = learn.ownerGuidance({ ...q, channel: 'sms', excludeItemKey: key });
  const mine = g.lessons.find((l) => l.do === 'Never offer free floor mats.');
  assert.deepEqual([mine.adviceId, mine.n, mine.scope], [lesson.id, 0, 'price_negotiation']);
  db.switchLesson(lesson.id, false);
});

test('a lesson switched off is not put into a request', async () => {
  const key = customer(5, 'Eli', 'Is the price on the Noah negotiable?');
  const d = await write(key, 'Hello {{NAME}},\nThanks for asking about the Noah.', { instruction: 'Always mention the five-year warranty.' });
  const { lesson } = await post(`/api/drafts/${d.id}/remember`, { scope: 'any' });
  assert.ok(asked(key).includes('- Always mention the five-year warranty.'));

  const off = await post(`/api/lessons/${lesson.id}/switch`, { on: false });
  assert.equal(off.status, 200);
  assert.deepEqual([off.lesson.id, off.lesson.off, off.lesson.do], [lesson.id, true, 'Always mention the five-year warranty.']);
  assert.ok(!asked(key).includes('five-year warranty'));
  await write(key, 'Hello {{NAME}},\nThanks for asking about the Noah.');
  assert.ok(!lastAsked().includes('five-year warranty'), 'not in the request the AI was sent');
  assert.equal((await lessons()).find((l) => l.id === lesson.id).off, true, 'still listed, switched off');

  // Switched back on, it is used again.
  assert.equal((await post(`/api/lessons/${lesson.id}/switch`, { on: true })).lesson.off, false);
  assert.ok(asked(key).includes('- Always mention the five-year warranty.'));

  // A lesson taken from a Could be better note is switched off the same way.
  const note = db.insertAdvice({ draftId: null, itemKey: 'c:999', situations: ['price_negotiation'], firstReply: false, customerText: 'x', draftText: 'y', note: 'n', lessons: [{ scope: 'any', when: 'any reply', do: 'Never use exclamation marks in a reply.', internal: false }] });
  assert.ok(asked(key).includes('Never use exclamation marks in a reply.'));
  assert.equal((await post(`/api/lessons/${note}/switch`, { on: false })).lesson.kind, 'note');
  assert.ok(!asked(key).includes('Never use exclamation marks'));

  assert.equal((await post('/api/lessons/999999/switch', { on: false })).status, 404);
  assert.equal((await post(`/api/lessons/${lesson.id}/switch`, {})).status, 400, 'on or off must be said');
  db.switchLesson(lesson.id, false);
});

test('remember is refused for Marketplace, phone-only and orders, and without a scope', async () => {
  const key = customer(6, 'Fay', 'Do you take trade-ins?');
  const before = db.countRows('advice');
  const draft = (itemKey, anchorKey, instruction = 'Be brief.') => db.insertDraft({ itemKey, anchorKey, situation: 'trade_in', reply: 'Yes, we do.', status: 'ready', checks: [], instruction });
  for (const [itemKey, anchorKey] of [['mp:77', 'fm:1'], ['ph:5', 'pm:1'], ['ao:3', 'out:deposit']]) {
    const out = await post(`/api/drafts/${draft(itemKey, anchorKey)}/remember`, { scope: 'any' });
    assert.deepEqual([out.status, out.error], [400, REFUSED], itemKey);
  }
  // A follow-up is refused in words of its own.
  const fu = await post(`/api/drafts/${draft(key, 'fu:9')}/remember`, { scope: 'any' });
  assert.deepEqual([fu.status, fu.error], [400, FOLLOW_UPS]);
  const anchor = items.itemFromKey(key).anchorKey;
  const plain = await post(`/api/drafts/${draft(key, anchor, '')}/remember`, { scope: 'trade_in' });
  assert.deepEqual([plain.status, plain.error], [400, NOTHING]);
  for (const scope of ['', '   ', undefined, 'not_a_kind']) {
    const out = await post(`/api/drafts/${draft(key, anchor)}/remember`, { scope });
    assert.equal(out.status, 400, String(scope));
    assert.ok(out.error && out.error !== REFUSED && out.error !== NOTHING, out.error);
  }
  assert.equal((await post('/api/drafts/999999/remember', { scope: 'any' })).status, 404);
  assert.equal(db.countRows('advice'), before, 'nothing was stored');
});

test('just this once stores nothing', async () => {
  const key = customer(7, 'Gus', 'Can you hold the Noah until Saturday?');
  const before = db.countRows('advice');
  const listed = (await lessons()).length;
  const d = await write(key, 'Hello {{NAME}},\nWe can talk about holding the Noah.', { instruction: 'Say we can hold it with a deposit.' });
  assert.equal(d.instruction, 'Say we can hold it with a deposit.');
  assert.equal(db.countRows('advice'), before, 'a Tell write with no Remember adds no lesson');
  assert.equal((await lessons()).length, listed);
  assert.ok(!asked(customer(8, 'Hal', 'Could you hold the Noah for me?')).includes('hold it with a deposit'));
});

test('copying unchanged counts as approval', async () => {
  const key = customer(9, 'Ida', 'Does the Noah have eight seats?');
  const d = await write(key, 'Hello {{NAME}},\nYes, the Noah has eight seats.');
  assert.equal(d.rating, '');
  // As the box holds it, give or take spaces and line ends.
  const out = await post(`/api/drafts/${d.id}/copied`, { text: `${d.reply.replace(/\n/g, '\r\n')}  ` });
  assert.deepEqual([out.status, out.approved, out.learned], [200, true, true]);
  assert.equal(db.getDraft(d.id).rating, 'good');
  assert.equal((await draftOf(key)).rating, 'good');
  const kept = db.getLearned(d.id);
  assert.deepEqual([kept.source, kept.changed], ['approved', 0]);
  assert.ok(!/Ida/.test(kept.final_text), 'no customer name is kept');

  // A changed copy is not approval: it teaches as a copy, as before.
  const key2 = customer(10, 'Jai', 'Does the Noah have a reversing camera?');
  const e = await write(key2, 'Hello {{NAME}},\nYes, the Noah has a reversing camera.');
  const changed = await post(`/api/drafts/${e.id}/copied`, { text: `${e.reply.split('\n\n')[0]} It also has parking sensors.` });
  assert.equal(changed.approved, undefined);
  assert.equal(db.getDraft(e.id).rating || '', '');
  assert.equal(db.getLearned(e.id).source, 'copied');

  // Marketplace still teaches nothing, copied as written or not.
  const mp = db.insertDraft({ itemKey: 'mp:78', anchorKey: 'fm:2', situation: 'availability', reply: 'Yes, it is still available.', status: 'ready', checks: [] });
  await post(`/api/drafts/${mp}/copied`, { text: 'Yes, it is still available.' });
  assert.equal(db.getDraft(mp).rating || '', '');
  assert.equal(db.getLearned(mp), null);
});

test('copying unchanged with a blank is not approval', async () => {
  const key = customer(11, 'Kit', 'What is the lowest price on the Noah?');
  const d = await write(key, 'Hello {{NAME}},\nOur best price on the Noah is [PRICE?].', { needsHuman: [{ marker: '[PRICE?]', reason: 'A person decides the price.' }] });
  assert.ok(d.reply.includes('[PRICE?]'));
  const out = await post(`/api/drafts/${d.id}/copied`, { text: d.reply });
  assert.equal(out.approved, undefined);
  assert.equal(out.learned, false);
  assert.equal(db.getDraft(d.id).rating || '', '');
  assert.equal(db.getLearned(d.id), null, 'a reply with a blank left in it is never kept as approved');
});

test("a draft records the lessons applied and the rules that fired, and each lesson's use is counted", async () => {
  // A lesson for every reply, remembered from one conversation.
  const from = customer(12, 'Lou', 'Is the Noah a petrol car?');
  const t = await write(from, 'Hello {{NAME}},\nYes, the Noah runs on petrol.', { instruction: 'Thank them for their interest in one short sentence.' });
  const { lesson } = await post(`/api/drafts/${t.id}/remember`, { scope: 'any' });
  // One switched off: never applied, never counted.
  const offNote = db.insertAdvice({ draftId: null, itemKey: 'c:998', situations: [], firstReply: false, customerText: 'x', draftText: 'y', note: 'n', lessons: [{ scope: 'any', when: '', do: 'Sign every reply with a smiley face.', internal: false }] });
  db.switchLesson(offNote, false);

  // A brand-new enquiry about the price: the first-reply details and the price reply go under the AI's lines.
  const key = customer(13, 'Mia', 'Hi, what is your best price on the Noah?', { ongoing: false });
  const d = await write(key, 'Hello {{NAME}},\nThank you for your interest in the Noah.');
  const mine = d.lessonsApplied.find((l) => l.adviceId === lesson.id);
  assert.deepEqual(mine, { adviceId: lesson.id, n: 0, do: 'Thank them for their interest in one short sentence.', scope: 'any', at: lesson.at });
  assert.ok(d.lessonsApplied.every((l) => Object.keys(l).sort().join() === 'adviceId,at,do,n,scope'));
  assert.ok(!d.lessonsApplied.some((l) => l.adviceId === offNote));
  assert.deepEqual(d.rules, { standard: true, price: true, invite: false, media: false, again: false, playbook: false });
  let listed = (await lessons()).find((l) => l.id === lesson.id);
  assert.equal(listed.usedCount, 1);
  assert.ok(listed.lastUsedAt >= now);
  assert.equal((await lessons()).find((l) => l.id === offNote).usedCount, 0);

  // We wrote to this customer earlier today: no greeting and no sign-off, and no block.
  const today = customer(14, 'Ned', 'Does the Noah have a tow bar?', { oursAgo: 20 * MIN });
  const e = await write(today, 'Yes, the Noah has a tow bar.');
  assert.deepEqual(e.rules, { standard: false, price: false, invite: false, media: false, again: true, playbook: false });
  listed = (await lessons()).find((l) => l.id === lesson.id);
  assert.equal(listed.usedCount, 2, 'counted once for each draft kept');

  // No reply written (the customer asked not to be contacted): no rules, no lessons, nothing counted.
  const stop = customer(15, 'Oli', 'STOP');
  await post(`/api/items/${stop}/draft`, { instruction: '' });
  const f = await draftOf(stop);
  assert.deepEqual([f.status, f.lessonsApplied, f.rules], ['blocked', [], null]);
  assert.equal((await lessons()).find((l) => l.id === lesson.id).usedCount, 2);
  db.switchLesson(lesson.id, false);
});

// ---- the final review's fixes ----------------------------------------------------------------

/** Has Wheelman write the same suggestion on both attempts, so a check that fails the first time still fails. */
async function writeTwice(key, reply) {
  const answer = { reply, needs_human: [], facts_used: [], hold: false };
  ai.script = [answer, answer];
  const out = await post(`/api/items/${key}/draft`, { instruction: '' });
  assert.equal(out.ok, true, out.error);
  ai.script = [];
  return out.item.draft;
}
const copy = (id, text) => post(`/api/drafts/${id}/copied`, { text });
const rate = (id, rating) => post(`/api/drafts/${id}/rating`, { rating });

test('copying as written is no approval past a failed check', async () => {
  const key = customer(16, 'Pia', 'Does the Noah have a sunroof?');
  const d = await writeTwice(key, 'Hello {{NAME}},\nYes, and it has done only 120,000 km.');
  assert.ok(d.checks.some((c) => c.level === 'fail'), 'a check failed');
  // Copy anyway: the text is copied as Wheelman wrote it.
  const out = await copy(d.id, d.reply);
  assert.equal(out.approved, undefined);
  assert.equal(db.getDraft(d.id).rating || '', '');
  assert.equal(db.getLearned(d.id), null, 'nothing kept as approved, and nothing as an example');
});

test("copying code's own wording as written is no approval", async () => {
  const key = customer(17, 'Quin', 'Is the Noah still available?');
  // A template used word for word, or the standard wording: provider 'none'.
  const id = db.insertDraft({ itemKey: key, anchorKey: items.itemFromKey(key).anchorKey, situation: 'availability', reply: 'Hello Quin,\nYes, the Noah is still available.', status: 'ready', checks: [], provider: 'none', model: 'your wording' });
  const out = await copy(id, 'Hello Quin,\nYes, the Noah is still available.');
  assert.equal(out.approved, undefined);
  assert.equal(db.getDraft(id).rating || '', '');
  assert.equal(db.getLearned(id), null);
});

test('copying as written is no approval once it was rated Could be better or Not usable', async () => {
  for (const [n, first, rating] of [[18, 'Rex', 'edit'], [19, 'Sol', 'bad']]) {
    const key = customer(n, first, 'Does the Noah have cruise control?');
    const d = await write(key, 'Hello {{NAME}},\nYes, the Noah has cruise control.');
    assert.equal((await rate(d.id, rating)).ok, true);
    const out = await copy(d.id, d.reply);
    assert.equal(out.approved, undefined, rating);
    assert.equal(db.getDraft(d.id).rating, rating, 'the rating stands');
    assert.equal(db.getLearned(d.id), null, rating);
  }
});

test('a copy-approval is taken back by Not usable, Could be better, or taking the rating away', async () => {
  const approve = async (n, first) => {
    const key = customer(n, first, 'Does the Noah have a spare tyre?');
    const d = await write(key, 'Hello {{NAME}},\nYes, the Noah has a full-size spare tyre.');
    assert.equal((await copy(d.id, d.reply)).approved, true);
    assert.equal(db.getLearned(d.id).source, 'approved');
    return d;
  };
  const bad = await approve(20, 'Tao');
  await rate(bad.id, 'bad');
  assert.equal(db.getLearned(bad.id), null, 'Not usable');

  const coached = await approve(21, 'Una');
  const advice = await post(`/api/drafts/${coached.id}/advice`, { note: 'Shorter, and mention the jack is included.' });
  assert.equal(advice.learned, true, advice.why);
  assert.equal(db.getDraft(coached.id).rating, 'edit');
  assert.equal(db.getLearned(coached.id), null, 'Could be better');

  const cleared = await approve(22, 'Vee');
  await rate(cleared.id, '');
  assert.equal(db.getLearned(cleared.id), null, "rating ''");
});

test('copying with a block removed: the sign-off, or the first-reply details alone, count as no change; the price reply does not', async () => {
  const blocks = (d) => d.parts.filter((p) => p.kind === 'block').map((p) => p.label);
  const without = (d, label) => d.parts.filter((p) => p.label !== label).map((p) => p.text).join('\n\n');
  // An ongoing conversation, first reply today: the sign-off.
  const key = customer(24, 'Xia', 'Does the Noah have a sunroof?');
  const f = await write(key, 'Hello {{NAME}},\nNo, the Noah has no sunroof.');
  assert.deepEqual(blocks(f), ['Sign-off']);
  assert.equal((await copy(f.id, without(f, 'Sign-off'))).approved, true, 'the sign-off removed');
  // A brand-new enquiry with no other block: the first-reply details (the address block and what sits above it).
  const key2 = customer(32, 'Gil', 'Hi, does the Noah have eight seats?', { ongoing: false });
  const g = await write(key2, 'Hello {{NAME}},\nYes, the Noah seats eight.');
  assert.deepEqual(blocks(g), ['First-reply details']);
  assert.equal((await copy(g.id, without(g, 'First-reply details'))).approved, true, 'the first-reply details removed');
  // A brand-new enquiry about the price: the price reply removed is a change, learned as a copy.
  const key3 = customer(23, 'Wes', 'Hi, what is your best price on the Noah?', { ongoing: false });
  const e = await write(key3, 'Hello {{NAME}},\nThanks for asking about the Noah.');
  assert.deepEqual(blocks(e), ['Price reply', 'First-reply details']);
  const out = await copy(e.id, without(e, 'Price reply'));
  assert.equal(out.approved, undefined, 'the price reply removed is a change');
  assert.equal(db.getLearned(e.id).source, 'copied');
});

test('remember says whether the lesson was already on, and a repeat dates it afresh', async () => {
  const key = customer(25, 'Yul', 'What is the best you can do on the Noah?');
  const d = await write(key, 'Hello {{NAME}},\nThanks for asking about the Noah.', { instruction: 'Never mention a cash discount.' });
  const first = await post(`/api/drafts/${d.id}/remember`, { scope: 'price_negotiation' });
  assert.deepEqual([first.status, first.wasOn], [200, false], 'made by this press');
  const row = () => db.allAdvice().find((a) => a.id === first.lesson.id);
  db.openDb().prepare('UPDATE advice SET at = ? WHERE id = ?').run(now - 5 * HOUR, first.lesson.id);

  const again = await post(`/api/drafts/${d.id}/remember`, { scope: 'price_negotiation' });
  assert.deepEqual([again.lesson.id, again.wasOn], [first.lesson.id, true], 'already there and on');
  assert.ok(row().at >= now, 'dated afresh');
  assert.equal(again.lesson.at, row().at);

  // Switched off, then remembered again: this press switched it on, so Undo may switch it off.
  db.switchLesson(first.lesson.id, false);
  const back = await post(`/api/drafts/${d.id}/remember`, { scope: 'price_negotiation' });
  assert.deepEqual([back.lesson.id, back.wasOn, back.lesson.off], [first.lesson.id, false, false]);
  assert.equal(row().off, 0);
  // For another kind of reply it is a lesson of its own.
  const other = await post(`/api/drafts/${d.id}/remember`, { scope: 'any' });
  assert.notEqual(other.lesson.id, first.lesson.id);
  assert.equal(other.wasOn, false);
  db.switchLesson(first.lesson.id, false);
  db.switchLesson(other.lesson.id, false);
});

test('remember is refused for a conversation in Auction, or a reply written there', async () => {
  const before = db.countRows('advice');
  // Written while the conversation was in Auction, then moved out.
  const key = customer(26, 'Zoe', 'Can you find me a Noah from Japan?');
  const anchor = items.itemFromKey(key).anchorKey;
  const there = db.insertDraft({ itemKey: key, anchorKey: anchor, situation: 'import_sourcing', reply: 'Yes, we can.', status: 'ready', checks: [], instruction: 'Be brief.', context: { section: 'auction', situations: ['import_sourcing'] } });
  let out = await post(`/api/drafts/${there}/remember`, { scope: 'any' });
  assert.deepEqual([out.status, out.error], [400, AUCTION]);
  // Listed in Auction now.
  const key2 = customer(27, 'Abe', 'Is the Noah still available?');
  const d = db.insertDraft({ itemKey: key2, anchorKey: items.itemFromKey(key2).anchorKey, situation: 'availability', reply: 'Yes, it is.', status: 'ready', checks: [], instruction: 'Be brief.' });
  assert.equal((await post(`/api/items/${key2}/move`, { section: 'auction' })).item.section, 'auction');
  out = await post(`/api/drafts/${d}/remember`, { scope: 'any' });
  assert.deepEqual([out.status, out.error], [400, AUCTION]);
  assert.equal(db.countRows('advice'), before, 'nothing was stored');
  await post(`/api/items/${key2}/move`, { section: 'dashboard' });
});

test('a Remember lesson never reaches a Marketplace request; a Could be better lesson still does', async () => {
  // The reviewer's case: remembered on a dashboard text, c:501.
  const id = db.insertRemember({ itemKey: 'c:501', scope: 'price_negotiation', instruction: 'Always give the booking link and the full price breakdown.' });
  const q = { situations: ['price_negotiation'], primary: 'price_negotiation', text: 'best price?', firstReply: false };
  const said = (channel, excludeItemKey) => learn.ownerGuidance({ ...q, channel, excludeItemKey }).lessons.map((l) => l.do);
  assert.ok(!said('marketplace', 'mp:9').includes('Always give the booking link and the full price breakdown.'), 'not in a Marketplace request');
  assert.ok(said('sms', 'c:777').includes('Always give the booking link and the full price breakdown.'), 'in a text request');
  // Distilled from a Could be better note on a text: used on Marketplace, as today.
  const note = db.insertAdvice({ draftId: null, itemKey: 'c:502', situations: ['price_negotiation'], firstReply: false, customerText: 'x', draftText: 'y', note: 'n', lessons: [{ scope: 'price_negotiation', when: '', do: 'Ask what budget they have in mind.', internal: false }] });
  assert.ok(said('marketplace', 'mp:9').includes('Ask what budget they have in mind.'));
  db.deleteAdvice(note);
  db.switchLesson(id, false);
});
