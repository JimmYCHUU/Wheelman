// Each lesson's history and where it came from, and a suggestion that teaches nothing says so.
// All data is invented. A stand-in AI service plays the model; the page's own routes are called.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyTestEnv } from './support/env.js';
import { startStandins, aiBehaviour } from './support/standins.js';

applyTestEnv({ DAILY_DRAFT_LIMIT: '200' });

const now = Date.now();
const MIN = 60e3, HOUR = 3600e3;
let standins, app, base, db, items, learn;
const ai = aiBehaviour({ behave: () => ({ reply: 'Hello {{NAME}},\nCertainly.', needs_human: [], facts_used: [], hold: false }) });

before(async () => {
  standins = await startStandins({ ai });
  const { config } = await import('../src/config.js');
  config.llm.gemini.url = `${standins.base}/chat`;
  config.port = 0;
  db = await import('../src/db.js');
  items = await import('../src/items.js');
  learn = await import('../src/learn.js');
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
const draftOf = async (key) => (await get(`/api/items/${key}`)).item.draft;
const anchorOf = (key) => items.itemFromKey(key).anchorKey;

test('every lesson lists where it came from, its scope, its date, its use and its history', async () => {
  const key = customer(41, 'Lia', 'Is the Noah still available?');
  const id = db.insertRemember({ itemKey: key, scope: 'price_negotiation', instruction: 'Keep it to three lines.', at: now - 3 * HOUR });
  await post(`/api/lessons/${id}/switch`, { on: false });
  await post(`/api/lessons/${id}/switch`, { on: true });
  const note = db.insertAdvice({ draftId: null, itemKey: key, situations: [], firstReply: false, customerText: 'Is it available?', draftText: 'Yes it is.', note: 'Too curt.', lessons: [{ scope: 'any', when: '', do: 'Be warmer.', internal: false }], at: now - 2 * HOUR });
  db.countLessonUse([note]);
  const { lessons } = await get('/api/playbook/lessons');
  const remembered = lessons.find((l) => l.id === id);
  assert.deepEqual(remembered.history.map((e) => e.what), ['made', 'off', 'on']);
  assert.deepEqual(remembered.from, { instruction: 'Keep it to three lines.' });
  assert.equal(remembered.scope, 'price_negotiation');
  const noted = lessons.find((l) => l.id === note);
  assert.deepEqual(noted.from, { note: 'Too curt.', customer: 'Is it available?', draft: 'Yes it is.' });
  const plain = (await get('/api/lessons')).lessons;
  for (const l of lessons) {
    const same = plain.find((p) => p.id === l.id && p.n === l.n);
    assert.equal(l.usedCount, same.usedCount);
    assert.equal(l.at, same.at);
  }
  assert.equal(noted.usedCount, 1);
  assert.equal(db.insertRemember({ itemKey: key, scope: 'price_negotiation', instruction: 'Keep it to three lines.' }), id);
  const again = (await get('/api/playbook/lessons')).lessons.find((l) => l.id === id);
  assert.deepEqual(again.history.map((e) => e.what), ['made', 'off', 'on', 'again']);
});

test('a lesson taught before this update has its making in its history', async () => {
  const key = customer(42, 'Mo', 'Any colours?');
  const id = db.insertAdvice({ draftId: null, itemKey: key, situations: [], firstReply: false, customerText: 'a', draftText: 'b', note: 'Older note.', lessons: [{ scope: 'any', when: '', do: 'Older lesson.', internal: false }], at: now - 9 * HOUR });
  db.openDb().prepare('DELETE FROM lesson_events WHERE advice_id = ?').run(id);
  const { lessons } = await get('/api/playbook/lessons');
  assert.deepEqual(lessons.find((x) => x.id === id).history, [{ what: 'made', at: now - 9 * HOUR }]);
});

test("a suggestion from the auction's wording file says it teaches nothing, and neither page offers a way to teach from it", async () => {
  const key = customer(43, 'Ned', 'Can you import a Honda N-Box for me?');
  db.insertDraft({ itemKey: key, anchorKey: anchorOf(key), situation: 'availability', reply: 'Yes.', status: 'ready', checks: [] });
  assert.equal((await draftOf(key)).teaches, true);
  db.insertDraft({ itemKey: key, anchorKey: anchorOf(key), situation: 'import_sourcing', reply: 'Thank you for your enquiry.', status: 'ready', checks: [], instruction: 'Rewrite it.', context: { message: 'first_estimate' } });
  assert.equal((await draftOf(key)).teaches, false);
  assert.match(readFileSync(new URL('../web/app.js', import.meta.url), 'utf8'), /const teach = !!item\.teaches && d\.teaches !== false;/);
  assert.match(readFileSync(new URL('../web/new/js/lessons.js', import.meta.url), 'utf8'), /draft\.teaches === false/);
});

test("a follow-up's suggestion and one written in Auction say they teach nothing", async () => {
  const key = customer(44, 'Oli', 'Is the Noah still for sale?');
  const item = items.itemFromKey(key);
  assert.equal(learn.draftTeaches(item, { item_key: key, anchor_key: 'fu:3', context: {} }), false);
  assert.equal(learn.draftTeaches(item, { item_key: key, anchor_key: item.anchorKey, context: { followUp: true } }), false);
  assert.equal(learn.draftTeaches(item, { item_key: key, anchor_key: 'out:deposit', context: {} }), false);
  assert.equal(learn.draftTeaches(item, { item_key: key, anchor_key: item.anchorKey, context: {} }), true);
  db.insertDraft({ itemKey: key, anchorKey: item.anchorKey, situation: 'availability', reply: 'Yes.', status: 'ready', checks: [], context: { section: 'auction' } });
  assert.equal((await draftOf(key)).teaches, false, 'written in Auction');
  const key2 = customer(45, 'Pip', 'Is the Noah available?');
  db.insertDraft({ itemKey: key2, anchorKey: anchorOf(key2), situation: 'availability', reply: 'Yes.', status: 'ready', checks: [] });
  assert.equal((await post(`/api/items/${key2}/move`, { section: 'auction' })).item.section, 'auction');
  assert.equal((await draftOf(key2)).teaches, false, 'listed in Auction');
});
