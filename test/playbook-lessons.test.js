// Edits made again and again, proposed as lessons in the Playbook: Keep as a lesson, Not a rule, and
// Undo of each, and a kept edit lesson in the requests it belongs to. All data is invented. A
// stand-in AI service on this computer plays the model; the page's own routes are called.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { applyTestEnv } from './support/env.js';
import { startStandins, aiBehaviour } from './support/standins.js';

applyTestEnv({ DAILY_DRAFT_LIMIT: '200' });

const now = Date.now();
const MIN = 60e3, HOUR = 3600e3;
let standins, app, base, db, items, promptModule;

before(async () => {
  standins = await startStandins({ ai: aiBehaviour() });
  const { config } = await import('../src/config.js');
  config.llm.gemini.url = `${standins.base}/chat`;
  config.port = 0;
  db = await import('../src/db.js');
  items = await import('../src/items.js');
  promptModule = await import('../src/prompt.js');
  app = await (await import('../src/server.js')).startServer();
  base = `http://127.0.0.1:${app.address().port}`;
});

after(async () => { await new Promise((r) => { app.close(r); app.closeAllConnections?.(); }); await standins.close(); });

let mid = 1;
function customer(id, first, question) {
  db.upsertLead({ id, conversationId: id + 500, firstName: first, lastName: 'Test', phone: `0491 570 1${String(id).padStart(2, '0')}`, email: '', source: 'carsales', status: 'FOLLOW_UP', platform: 'CARSALES', state: 'NSW', leadAt: now - 30 * HOUR, updatedAt: now - 5 * MIN, stocks: [], inquiries: [], statusHistory: [] });
  db.upsertConversation({ id: id + 500, phone: `+614915701${String(id).padStart(2, '0')}`, channel: 'SMS', status: 'OPEN', leadId: id, customerName: `${first} Test`, latestDirection: 'IN', latestAt: now - 5 * MIN, latestBody: 'x' });
  db.upsertMessage({ id: mid++, conversationId: id + 500, direction: 'IN', body: question, sentBy: null, status: 'SENT', mediaType: null, at: now - 5 * MIN, importedAt: now - 5 * MIN });
  return `c:${id + 500}`;
}
const post = async (path, body = {}) => { const res = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return { status: res.status, ...(await res.json()) }; };
const get = async (path) => (await fetch(base + path)).json();
const decide = (key, decision) => post('/api/playbook/proposals', { key, decision });
const playbook = () => get('/api/playbook/lessons');

let anchor = 0;
/** A suggestion Wheelman wrote for this customer, copied with an edit: what learnFrom keeps of it. */
function copiedEdit(key, wrote, sent, { situations = ['availability'], at = now - HOUR } = {}) {
  const id = db.insertDraft({ itemKey: key, anchorKey: `m:${9000 + ++anchor}`, situation: situations[0], reply: wrote, status: 'ready', checks: [] });
  db.recordCopied(id, sent);
  db.upsertLearned({ draftId: id, itemKey: key, situations, firstReply: false, customerText: 'Is it still available?', draftText: wrote, finalText: sent, source: 'copied', changed: true, similarity: 0.9, at });
  return id;
}
/** Each test forgets the rows it made, so what it proposed is not waiting in the next one. */
const forget = (ids) => ids.forEach((id) => db.deleteLearned(id));
const KINDLY = [
  ['Could you kindly send us your number?', 'Could you send us your number?'],
  ['Kindly let us know a time.', 'Let us know a time.'],
  ['Please kindly confirm the day.', 'Please confirm the day.'],
  ['We can kindly hold it for you.', 'We can hold it for you.'],
];
const ASSIST = [
  ['We are happy to assist.', 'We are happy to help.'],
  ['Let us know if we can assist with anything else.', 'Let us know if we can help with anything else.'],
  ['Our team can assist you on the day.', 'Our team can help you on the day.'],
];

test('Keep makes a lesson from the edit, with its examples, and it is not proposed again', async () => {
  const key = customer(51, 'Ari', 'Is the Noah still available?');
  const made = KINDLY.map(([w, s], i) => copiedEdit(key, w, s, { at: now - (4 - i) * HOUR }));
  let listed = await playbook();
  const p = listed.proposals.find((x) => x.key === 'sms|remove|kindly|');
  assert.deepEqual([p.kind, p.removed, p.added, p.channel, p.scope, p.count, p.examples.length], ['remove', 'kindly', '', 'sms', 'availability', 4, 3]);
  assert.deepEqual(p.examples[0], { before: 'We can kindly hold it for you.', after: 'We can hold it for you.', at: now - HOUR });
  assert.deepEqual(listed.notRules, []);

  const out = await decide(p.key, 'keep');
  assert.equal(out.status, 200, out.error);
  assert.deepEqual([out.lesson.do, out.lesson.kind, out.lesson.channel, out.lesson.scope, out.lesson.off], ['Leave out “kindly”.', 'edit', 'sms', 'availability', false]);
  listed = await playbook();
  const lesson = listed.lessons.find((l) => l.id === out.lesson.id);
  assert.deepEqual([lesson.do, lesson.kind, lesson.from.examples.length, lesson.from.count], ['Leave out “kindly”.', 'edit', 3, 4]);
  assert.deepEqual(lesson.from.examples, p.examples);
  assert.equal(lesson.from.key, p.key, 'the edit it was kept from, so the Playbook can tell when that edit waits again');
  assert.deepEqual(lesson.history.map((e) => e.what), ['made', 'kept']);
  assert.ok(!listed.proposals.some((x) => x.key === p.key), 'not proposed again');
  // The old page's list of lessons has it too, in its usual shape.
  assert.deepEqual(Object.keys((await get('/api/lessons')).lessons.find((l) => l.id === lesson.id)).sort(), ['at', 'channel', 'do', 'id', 'kind', 'lastUsedAt', 'n', 'off', 'scope', 'usedCount']);

  // Put back as it was for the tests after this one: undone, and the rows forgotten.
  await decide(p.key, 'undo');
  forget(made);
});

test('Not a rule is remembered, Keep it after all makes the lesson, and Undo puts each back', async () => {
  const key = customer(52, 'Bex', 'Can you help with the paperwork?');
  const made = ASSIST.map(([w, s], i) => copiedEdit(key, w, s, { situations: [['availability', 'deposit_hold', 'finance'][i]], at: now - (3 - i) * HOUR }));
  const K = 'sms|replace|assist|help';
  const proposed = (await playbook()).proposals.find((x) => x.key === K);
  assert.deepEqual([proposed.removed, proposed.added, proposed.scope, proposed.count], ['assist', 'help', 'any', 3]);

  // Not a rule: kept with the proposal as it stood, and proposed no more.
  let out = await decide(K, 'reject');
  assert.deepEqual([out.status, out.lesson], [200, undefined]);
  let listed = await playbook();
  assert.ok(!listed.proposals.some((x) => x.key === K));
  assert.deepEqual(listed.notRules.find((x) => x.key === K), proposed);
  // Keep it after all.
  out = await decide(K, 'keep');
  assert.equal(out.status, 200, out.error);
  assert.deepEqual([out.lesson.do, out.lesson.scope, out.lesson.off], ['Write “help”, not “assist”.', 'any', false]);
  const id = out.lesson.id;
  listed = await playbook();
  assert.ok(!listed.notRules.some((x) => x.key === K) && !listed.proposals.some((x) => x.key === K));
  assert.equal(listed.lessons.find((l) => l.id === id).history.at(-1).what, 'kept');
  // Undo: the lesson is switched off and the edit is proposed again.
  out = await decide(K, 'undo');
  assert.deepEqual([out.status, out.lesson.id, out.lesson.off], [200, id, true]);
  listed = await playbook();
  const undone = listed.lessons.find((l) => l.id === id);
  assert.deepEqual([undone.off, undone.history.map((e) => e.what)], [true, ['made', 'kept', 'undone']]);
  assert.ok(listed.proposals.some((x) => x.key === K), 'proposed again');
  // Not a rule, then Undo: proposed again, and the lesson stays off.
  await decide(K, 'reject');
  assert.ok((await playbook()).notRules.some((x) => x.key === K));
  out = await decide(K, 'undo');
  assert.equal(out.status, 200);
  listed = await playbook();
  assert.ok(listed.proposals.some((x) => x.key === K) && !listed.notRules.some((x) => x.key === K));
  assert.equal(listed.lessons.find((l) => l.id === id).off, true);
  assert.equal(listed.lessons.find((l) => l.id === id).history.at(-1).what, 'undone', 'an Undo of Not a rule writes nothing to a lesson already off');

  // Something else is refused, in words.
  assert.deepEqual(await decide('sms|remove|nothing like it|', 'keep'), { status: 404, error: 'That proposal is no longer waiting.' });
  assert.deepEqual(await decide(K, 'maybe'), { status: 400, error: 'Say keep, not a rule or undo.' });
  forget(made);
});

test('a kept edit lesson goes into texts of its channel, never a Marketplace request, and not once switched off', async () => {
  const key = customer(53, 'Cal', 'Is the Noah still for sale?');
  // Edits on messages of three kinds: the lesson is for every reply.
  const made = KINDLY.slice(0, 3).map(([w, s], i) => copiedEdit(key, w, s, { situations: [['availability', 'inspection_booking', 'price_negotiation'][i]] }));
  const out = await decide('sms|remove|kindly|', 'keep');
  assert.equal(out.status, 200, out.error);
  assert.equal(out.lesson.scope, 'any');
  const LESSON = '- Leave out “kindly”.';
  const asked = (k) => promptModule.buildPrompt(items.itemFromKey(k), { now: Date.now() }).user;
  const text = customer(54, 'Dot', 'Does the Noah have a third row?');
  assert.ok(asked(text).includes(LESSON), 'in a text request');

  // A Marketplace chat: a lesson from a Could be better note goes in, the edit lesson does not.
  db.upsertMpConversation({ id: 4201, account: 'Carbarn', buyerName: 'Eda Market', stockId: '', lastDirection: 'in', lastMessageAt: now - HOUR, archived: false });
  db.replaceMpMessages(4201, [{ id: 420101, seq: 0, direction: 'in', source: 'buyer', text: 'Is it still there?', status: '', hasMedia: false, at: now - HOUR }], 'sig');
  const note = db.insertAdvice({ draftId: null, itemKey: key, situations: [], firstReply: false, customerText: 'x', draftText: 'y', note: 'n', lessons: [{ scope: 'any', when: '', do: 'Answer the question in the first line.', internal: false }] });
  const chat = asked('mp:4201');
  assert.ok(chat.includes('- Answer the question in the first line.'), 'the lessons are in the Marketplace request');
  assert.ok(!chat.includes(LESSON), 'not in a Marketplace request');
  db.deleteAdvice(note);
  // An email is not taught by texts.
  assert.ok(!(await import('../src/learn.js')).ownerGuidance({ situations: ['availability'], primary: 'availability', text: 'available?', firstReply: false, channel: 'email' }).lessons.some((l) => l.do === 'Leave out “kindly”.'));

  // Switched off, it is in no request.
  assert.equal((await post(`/api/lessons/${out.lesson.id}/switch`, { on: false })).status, 200);
  assert.ok(!asked(text).includes(LESSON), 'not once switched off');
  forget(made);
});

test('the status counts the lessons waiting to be reviewed', async () => {
  const key = customer(55, 'Eli', 'Is the Noah still for sale?');
  const made = [
    ...['We truly value your time.', 'It is truly a great car.', 'We truly appreciate it.'].map((w) => copiedEdit(key, w, w.replace('truly ', ''))),
    ...['Ready to purchase today?', 'You can purchase it online.', 'Thanks for choosing to purchase with us.'].map((w) => copiedEdit(key, w, w.replace('purchase', 'buy'))),
  ];
  assert.equal((await get('/api/status')).playbook.toReview, 2);
  assert.equal((await decide('sms|remove|truly|', 'keep')).status, 200);
  assert.deepEqual((await get('/api/status')).playbook, { toReview: 1 });
  // Proposals that cannot be read leave the rest of the status as it is, with nothing to review.
  db.openDb().exec('ALTER TABLE edit_rules RENAME TO edit_rules_away');
  try {
    const res = await fetch(base + '/api/status');
    assert.equal(res.status, 200);
    assert.deepEqual((await res.json()).playbook, { toReview: 0 });
  } finally {
    db.openDb().exec('ALTER TABLE edit_rules_away RENAME TO edit_rules');
  }
  assert.deepEqual((await get('/api/status')).playbook, { toReview: 1 });
  forget(made);
});

test('Not a rule on an edit kept as a lesson switches the lesson off', async () => {
  const key = customer(56, 'Fay', 'Is the Noah still for sale?');
  const made = ['We sincerely thank you.', 'It is sincerely ready.', 'We sincerely hope so.'].map((w) => copiedEdit(key, w, w.replace('sincerely ', '')));
  const K = 'sms|remove|sincerely|';
  const { lesson } = await decide(K, 'keep');
  const out = await decide(K, 'reject');
  assert.deepEqual([out.status, out.lesson.id, out.lesson.off], [200, lesson.id, true]);
  const listed = await playbook();
  assert.deepEqual(listed.lessons.find((l) => l.id === lesson.id).history.map((e) => e.what), ['made', 'kept', 'off']);
  assert.ok(listed.notRules.some((x) => x.key === K) && !listed.proposals.some((x) => x.key === K));
  forget(made);
});

test('an edit lesson switched on again from the Lessons list is kept, and is no longer waiting to be reviewed', async () => {
  const key = customer(57, 'Gus', 'Is the Noah still for sale?');
  const made = ['We genuinely care.', 'It is genuinely clean.', 'We genuinely hope so.'].map((w) => copiedEdit(key, w, w.replace('genuinely ', '')));
  const K = 'sms|remove|genuinely|';
  const { lesson } = await decide(K, 'keep');
  await decide(K, 'undo');
  assert.equal((await get('/api/status')).playbook.toReview, 1, 'undone: waiting again');
  const out = await post(`/api/lessons/${lesson.id}/switch`, { on: true });
  assert.deepEqual([out.status, out.lesson.id, out.lesson.off], [200, lesson.id, false]);
  assert.equal((await get('/api/status')).playbook.toReview, 0);
  const listed = await playbook();
  assert.ok(!listed.proposals.some((x) => x.key === K) && !listed.notRules.some((x) => x.key === K));
  assert.deepEqual(listed.lessons.find((l) => l.id === lesson.id).history.map((e) => e.what), ['made', 'kept', 'undone', 'on', 'kept']);
  // Switched off and on again once it is kept: an ordinary switch, nothing more.
  await post(`/api/lessons/${lesson.id}/switch`, { on: false });
  await post(`/api/lessons/${lesson.id}/switch`, { on: true });
  assert.deepEqual((await playbook()).lessons.find((l) => l.id === lesson.id).history.map((e) => e.what).slice(-2), ['off', 'on']);
  forget(made);
});

test("a learned row saved again with other situations changes the proposal's scope", async () => {
  const key = customer(58, 'Hal', 'Is the Noah still for sale?');
  const at = now - 2 * HOUR;
  const texts = ['We certainly can.', 'It is certainly ready.', 'We certainly hope so.'];
  const made = texts.map((w) => copiedEdit(key, w, w.replace('certainly ', ''), { situations: ['availability'], at }));
  const K = 'sms|remove|certainly|';
  assert.equal((await playbook()).proposals.find((x) => x.key === K).scope, 'availability');
  db.upsertLearned({ draftId: made[0], itemKey: key, situations: ['finance'], firstReply: false, customerText: 'Is it still available?', draftText: texts[0], finalText: texts[0].replace('certainly ', ''), source: 'copied', changed: true, similarity: 0.9, at });
  assert.equal((await playbook()).proposals.find((x) => x.key === K).scope, 'any');
  forget(made);
});
