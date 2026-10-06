// The message box as an editor: what is typed over a suggestion is kept, the suggestion can be
// cleared and brought back, and Wheelman learns from the changes. All data is invented.
// A stand-in AI service on this computer plays the model; the page's own routes are called.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { applyTestEnv } from './support/env.js';
import { startStandins, aiBehaviour } from './support/standins.js';

applyTestEnv({ DAILY_DRAFT_LIMIT: '200' });

const now = Date.now();
const MIN = 60e3, HOUR = 3600e3;
let standins, app, base, db, items, promptModule, worker;
const ai = aiBehaviour({ behave: () => ({ reply: 'No worries.', needs_human: [], facts_used: [], hold: false }) });

before(async () => {
  standins = await startStandins({ ai });
  const { config } = await import('../src/config.js');
  config.llm.gemini.url = `${standins.base}/chat`;
  config.port = 0;
  db = await import('../src/db.js');
  items = await import('../src/items.js');
  promptModule = await import('../src/prompt.js');
  worker = await import('../src/worker.js');
  app = await (await import('../src/server.js')).startServer();
  base = `http://127.0.0.1:${app.address().port}`;
});

after(async () => { await new Promise((r) => { app.close(r); app.closeAllConnections?.(); }); await standins.close(); });

let mid = 1;
/** A customer in the middle of a conversation, so the reply is plain lines with no address block. */
function customer(id, first, question) {
  db.upsertLead({ id, conversationId: id + 300, firstName: first, lastName: 'Test', phone: `0491 570 3${String(id).padStart(2, '0')}`, email: '', source: 'carsales', status: 'FOLLOW_UP', platform: 'CARSALES', state: 'NSW', leadAt: now - 3 * HOUR, updatedAt: now - 5 * MIN, stocks: [], inquiries: [], statusHistory: [] });
  db.upsertConversation({ id: id + 300, phone: `+6149157030${id}`, channel: 'SMS', status: 'OPEN', leadId: id, customerName: `${first} Test`, latestDirection: 'IN', latestAt: now - 5 * MIN, latestBody: 'x' });
  const say = (direction, body, agoMs) => db.upsertMessage({ id: mid++, conversationId: id + 300, direction, body, sentBy: direction === 'OUT' ? 'Dana' : null, status: 'SENT', mediaType: null, at: now - agoMs, importedAt: now - agoMs });
  say('IN', 'Hello, are you there?', 26 * HOUR);
  say('OUT', 'Hello, yes we are. How can we help?', 25 * HOUR);
  say('IN', question, 5 * MIN);
  return `c:${id + 300}`;
}
const post = async (path, body = {}) => { const res = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return { status: res.status, ...(await res.json()) }; };
const get = async (path) => (await fetch(base + path)).json();
const draftOf = async (key) => (await get(`/api/items/${key}`)).item.draft;
const rowOf = async (key) => (await get('/api/items?tab=waiting')).items.find((r) => r.key === key);
/** Has Wheelman write a suggestion with the given text. */
async function suggest(key, reply, needsHuman = []) {
  ai.script = [{ reply, needs_human: needsHuman, facts_used: [], hold: false }];
  const out = await post(`/api/items/${key}/draft`, { instruction: '' });
  assert.equal(out.ok, true, out.error);
  return out.item.draft;
}

test('what is typed over a suggestion is kept with it, and it can be cleared and brought back', async () => {
  const key = customer(1, 'Ivy', 'Do you have any people movers, and what is your best price on one?');
  const d = await suggest(key, 'Hi {{NAME}},\nYes, we have a few people movers. Our best price on one is [PRICE?].', [{ marker: '[PRICE?]', reason: 'A person decides the price.' }]);
  assert.equal(d.edited, null, 'untouched');
  assert.equal((await rowOf(key)).flag, 'input', 'a blank to fill');

  // The blank is filled in and a line is added. The edit is kept; the suggestion itself is not changed.
  const mine = d.reply.replace('[PRICE?]', '$27,500 for the Noah') + '\nCome and see it any day.';
  const saved = await post(`/api/drafts/${d.id}/edit`, { text: mine });
  assert.deepEqual([saved.status, saved.ok, saved.edited, saved.cleared], [200, true, true, false]);
  const again = await draftOf(key);
  assert.equal(again.edited, mine);
  assert.equal(again.reply, d.reply);
  assert.ok(again.editedAt >= now);
  assert.equal((await rowOf(key)).flag, 'ok', 'the list no longer asks for a blank that has been filled');

  // Cleared: an empty box, nothing flagged in the list.
  const cleared = await post(`/api/drafts/${d.id}/edit`, { text: '' });
  assert.deepEqual([cleared.edited, cleared.cleared], [true, true]);
  assert.equal((await draftOf(key)).edited, '');
  assert.equal((await rowOf(key)).flag, 'none');

  // Brought back: the box holds the suggestion as written again.
  const back = await post(`/api/drafts/${d.id}/edit`, { text: d.reply });
  assert.equal(back.edited, false);
  assert.equal((await draftOf(key)).edited, null);
  assert.equal((await rowOf(key)).flag, 'input');

  // Typing alone teaches nothing.
  assert.equal(db.countRows('learned'), 0);
  assert.equal((await post(`/api/drafts/${d.id}/edit`, {})).status, 400);
  assert.equal((await post('/api/drafts/999999/edit', { text: 'x' })).status, 404);
});

test('Good reply approves the text as it stands, changes and all, and the approval follows later changes', async () => {
  const key = customer(2, 'Jon', 'Are you open on Sunday? I would like to look at a people mover.');
  const d = await suggest(key, 'Hi {{NAME}},\nYes, we are open on Sunday.');
  const mine = 'Hi Jon,\nYes, we are open on Sunday from 8 AM to 5 PM. Send us a text before you come and we will have the people movers out the front.';
  await post(`/api/drafts/${d.id}/edit`, { text: mine });
  const approved = await post(`/api/drafts/${d.id}/rating`, { rating: 'good' });
  assert.equal(approved.learned, true);

  let kept = db.getLearned(d.id);
  assert.deepEqual([kept.source, kept.changed], ['approved', 1]);
  assert.match(kept.final_text, /Send us a text before you come and we will have the people movers out the front\./);
  assert.match(kept.draft_text, /^Hi[^\n]*\nYes, we are open on Sunday\.$/, 'what Wheelman wrote is kept beside it');
  assert.ok(!/Jon/.test(kept.final_text + kept.customer_text), 'no customer name is kept');

  // A similar message from someone else: the owner's version is shown as the model, as a correction.
  const other = customer(3, 'Kim', 'Are you open on Sunday? I want to look at a people mover.');
  const asked = promptModule.buildPrompt(items.itemFromKey(other), { now }).user;
  assert.match(asked, /Corrected by the owner and approved, for a similar message/);
  assert.match(asked, /You wrote: Hi[^\n]*Yes, we are open on Sunday\.\n  The owner changed it to: Hi[^\n]*Send us a text before you come/);
  assert.match(asked, /Handle this one the way the owner's version does/);

  // Changed again after approving: the model follows the text.
  await post(`/api/drafts/${d.id}/edit`, { text: `${mine}\nSee you then.` });
  kept = db.getLearned(d.id);
  assert.match(kept.final_text, /See you then\.$/);
  assert.equal(kept.source, 'approved');

  // Copying that same approved text keeps it as approved.
  const copied = await post(`/api/drafts/${d.id}/copied`, { text: `${mine}\nSee you then.` });
  assert.equal(copied.learned, true);
  assert.equal(db.getLearned(d.id).source, 'approved');

  // Emptied: an empty box cannot be a good reply, so the approval is taken back.
  const cleared = await post(`/api/drafts/${d.id}/edit`, { text: '  ' });
  assert.equal(cleared.rating, '');
  assert.equal(db.getLearned(d.id), null);
  assert.equal((await draftOf(key)).rating, '');
});

test('a changed reply teaches when it is copied, and when it is seen sent', async () => {
  const key = customer(4, 'Lena', 'Is the van still for sale?');
  const d = await suggest(key, 'Hi {{NAME}},\nYes, the van is still for sale.');
  const mine = 'Hi Lena,\nYes, the van is still for sale. It has just been serviced, so it is ready to drive away.';
  await post(`/api/drafts/${d.id}/edit`, { text: mine });
  assert.equal(db.getLearned(d.id), null, 'not yet: it has only been typed');

  const copied = await post(`/api/drafts/${d.id}/copied`, { text: mine });
  assert.deepEqual([copied.learned, copied.changed], [true, true]);
  assert.deepEqual([db.getLearned(d.id).source, db.getLearned(d.id).changed], ['copied', 1]);

  // The reply appears in the dashboard conversation: what was really sent takes its place.
  db.upsertMessage({ id: mid++, conversationId: 304, direction: 'OUT', body: `${mine} Come and see it this week.`, sentBy: 'Dana', status: 'SENT', mediaType: null, at: now - MIN, importedAt: now - MIN });
  worker.updateOutcomes();
  const sent = db.getLearned(d.id);
  assert.equal(sent.source, 'sent');
  assert.match(sent.final_text, /Come and see it this week\.$/);
});

test('an edit to a Marketplace suggestion is kept like any other, and never learned from', async () => {
  const before = db.countRows('learned');
  const id = db.insertDraft({ itemKey: 'mp:77', anchorKey: 'fm:1', situation: 'availability', reply: 'Yes, it is still available.', status: 'ready', checks: [] });
  const saved = await post(`/api/drafts/${id}/edit`, { text: 'Yes it is. When would you like to come and see it?' });
  assert.deepEqual([saved.ok, saved.edited], [true, true]);
  assert.equal(db.getDraft(id).edited_text, 'Yes it is. When would you like to come and see it?');

  assert.equal((await post(`/api/drafts/${id}/rating`, { rating: 'good' })).learned, false);
  await post(`/api/drafts/${id}/edit`, { text: 'Yes it is. Come any day this week.' });
  await post(`/api/drafts/${id}/copied`, { text: 'Yes it is. Come any day this week.' });
  assert.equal(db.countRows('learned'), before, 'nothing from Marketplace is learned');
  assert.equal(db.getDraft(id).copied_text, null, 'and the copied text is not kept');
});
