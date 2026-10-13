// The Prompt line and what surrounds it on the server: one write at a time for one customer
// message, a reply from the owner's prompt outranking a plain one, a failed write retried with its
// prompt, the hold while the line is open, the retry time in the status, and a text the phone brings
// in being written for at once. All data is invented. A stand-in AI service plays the model.
import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { applyTestEnv } from './support/env.js';
import { startStandins, aiBehaviour } from './support/standins.js';

applyTestEnv({ DAILY_DRAFT_LIMIT: '200' });

const now = Date.now();
const MIN = 60e3, HOUR = 3600e3;
const ADDON = `chrome-extension://${'a'.repeat(32)}`;
let standins, app, base, config, db, items, worker, llm, parse;
const ai = aiBehaviour({ behave: () => ({ reply: 'No worries.', needs_human: [], facts_used: [], hold: false }) });

before(async () => {
  standins = await startStandins({ ai });
  ({ config } = await import('../src/config.js'));
  config.llm.gemini.url = `${standins.base}/chat`;
  config.port = 0;
  db = await import('../src/db.js');
  items = await import('../src/items.js');
  worker = await import('../src/worker.js');
  llm = await import('../src/llm.js');
  parse = await import('../extension/parse.js');
  app = await (await import('../src/server.js')).startServer();
  base = `http://127.0.0.1:${app.address().port}`;
});

after(async () => { await new Promise((r) => { app.close(r); app.closeAllConnections?.(); }); await standins.close(); });

beforeEach(() => { llm.resetModelState(); worker.state.holdUntil = 0; worker.state.pausedUntil = 0; worker.state.lastDraftError = null; ai.down = false; ai.script = []; ai.seen.length = 0; });

let mid = 1;
/** A customer in the middle of a conversation, waiting on their newest text. Numbers 0491 570 7xx are this file's. */
function customer(id, first, question) {
  const conv = 700 + id;
  db.upsertLead({ id: conv, conversationId: conv, firstName: first, lastName: 'Test', phone: `0491 570 70${id}`, email: '', source: 'carsales', status: 'FOLLOW_UP', platform: 'CARSALES', state: 'NSW', leadAt: now - 3 * HOUR, updatedAt: now - 5 * MIN, stocks: [], inquiries: [], statusHistory: [] });
  db.upsertConversation({ id: conv, phone: `+6149157070${id}`, channel: 'SMS', status: 'OPEN', leadId: conv, customerName: `${first} Test`, latestDirection: 'IN', latestAt: now - 5 * MIN, latestBody: 'x' });
  const say = (direction, body, agoMs) => db.upsertMessage({ id: mid++, conversationId: conv, direction, body, sentBy: direction === 'OUT' ? 'Dana' : null, status: 'SENT', mediaType: null, at: now - agoMs, importedAt: now - agoMs });
  say('IN', 'Hello, are you there?', 26 * HOUR);
  say('OUT', 'Hello, yes we are. How can we help?', 25 * HOUR);
  say('IN', question, 5 * MIN);
  return `c:${conv}`;
}
const post = async (path, body = {}) => { const res = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return { status: res.status, ...(await res.json()) }; };
const get = async (path) => (await fetch(base + path)).json();
const anchorOf = (key) => items.itemFromKey(key).anchorKey;
const rowsFor = (key) => db.openDb().prepare('SELECT COUNT(*) AS n FROM drafts WHERE item_key = ?').get(key).n;
const userPrompt = (n) => ai.seen[n].messages[1].content;
const until = async (fn, ms = 5000) => { const end = Date.now() + ms; while (!fn()) { if (Date.now() > end) throw new Error('timed out waiting'); await new Promise((r) => setTimeout(r, 10)); } };
/** A scripted model answer the test hands out when it chooses, so a write can be kept under way. */
function delayed() { let release; const promise = new Promise((r) => { release = r; }); return { promise, release }; }
const answer = (reply) => ({ reply, needs_human: [], facts_used: [], hold: false });
/** Runs something without really waiting between the AI's tries. */
async function quickly(fn) {
  const real = globalThis.setTimeout;
  globalThis.setTimeout = (f, ms, ...a) => real(f, Math.min(ms, 5), ...a);
  try { return await fn(); } finally { globalThis.setTimeout = real; }
}
// A POST the way the phone add-on makes it: its own origin and header (fetch would not let a test set them).
function rawPost(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data), origin: ADDON, 'x-wheelman-phone': '1' } }, (res) => {
      let text = '';
      res.on('data', (c) => { text += c; });
      res.on('end', () => { let json = {}; try { json = JSON.parse(text); } catch { /* not json */ } resolve({ status: res.statusCode, body: json }); });
    });
    req.on('error', reject);
    req.end(data);
  });
}

test('two plain writes for one message make one request and one suggestion', async () => {
  const key = customer(1, 'Uma', 'Do you have any Strada-type vans at a similar price?');
  const g = delayed();
  ai.script = [g.promise];
  const first = post(`/api/items/${key}/draft`, { instruction: '' });
  await until(() => ai.seen.length === 1);
  const second = post(`/api/items/${key}/draft`, { instruction: '' });
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(ai.seen.length, 1, 'the second write joined the one under way');
  g.release(answer('Hi {{NAME}},\nNot at the moment. If you have a model in mind, we can source one for you.'));
  const [a, b] = await Promise.all([first, second]);
  assert.ok(a.ok && b.ok, `${a.error} ${b.error}`);
  assert.equal(a.item.draft.id, b.item.draft.id, 'both were given the same suggestion');
  assert.deepEqual([rowsFor(key), ai.seen.length], [1, 1]);
});

test("a reply from the owner's prompt outranks a plain one that finishes after it", async () => {
  const key = customer(2, 'Vik', 'Any Strada type utes around the same price?');
  const prompt = 'we have none of that kind at the moment; if he names a model we can source one';
  const g1 = delayed(), g2 = delayed();
  ai.script = [g1.promise, g2.promise];
  const plain = post(`/api/items/${key}/draft`, { instruction: '' });
  await until(() => ai.seen.length === 1);
  const prompted = post(`/api/items/${key}/draft`, { instruction: prompt });
  await until(() => ai.seen.length === 2);
  assert.ok(!userPrompt(0).includes('=== INSTRUCTION FROM OUR STAFF') && userPrompt(1).includes('=== INSTRUCTION FROM OUR STAFF FOR THIS DRAFT ==='), 'the prompted write is its own request');
  g2.release(answer('Hi {{NAME}},\nWe have none of that kind at the moment. If you have a model in mind, we can source one for you.'));
  const b = await prompted;
  assert.ok(b.ok, b.error);
  assert.equal(b.item.draft.instruction, prompt);
  g1.release(answer('Hi {{NAME}},\nYes, we have a few utes. You are welcome to come and see them.'));
  const a = await plain;
  assert.equal(a.item.draft.id, b.item.draft.id, 'the page is shown the prompted reply, not the plain one');
  assert.equal(rowsFor(key), 1, 'the plain one was not kept');
  assert.ok(db.latestDraft(key, anchorOf(key)).reply.includes('none of that kind'));
});

test('a plain write that fails after a prompted reply was written leaves nothing over it', async () => {
  const key = customer(3, 'Wes', 'Got anything like a Strada?');
  const g = delayed();
  ai.script = [g.promise];
  await quickly(async () => {
    const plain = post(`/api/items/${key}/draft`, { instruction: '' });
    await until(() => ai.seen.length === 1);
    // The owner's own write for this message lands meanwhile.
    db.insertDraft({ itemKey: key, anchorKey: anchorOf(key), situation: 'general', reply: 'Hi {{NAME}},\nNot at the moment. We can source one for you.', status: 'ready', instruction: 'none; offer to source', checks: [] });
    ai.down = true;
    g.release({ status: 503 });
    const a = await plain;
    assert.equal(a.ok, false);
    assert.deepEqual([a.item.draft.status, a.item.draft.instruction], ['ready', 'none; offer to source'], 'the page still has the prompted reply');
  });
  assert.equal(rowsFor(key), 1);
  assert.equal(db.openDb().prepare("SELECT COUNT(*) AS n FROM drafts WHERE item_key = ? AND status = 'failed'").get(key).n, 0, 'no failed row was written over it');
});

test('the background retry of a failed write keeps the prompt', async () => {
  const key = customer(4, 'Xan', 'Do you have a Strada or similar?');
  const prompt = 'none in stock; we can source one if they name a model, lowest on a similar ute $27,500';
  const id = db.insertDraft({ itemKey: key, anchorKey: anchorOf(key), situation: 'general', reply: '', status: 'failed', error: 'busy', checks: [], instruction: prompt });
  db.openDb().prepare('UPDATE drafts SET created_at = ? WHERE id = ?').run(Date.now() - 11 * MIN, id);
  ai.script = [answer('Hi {{NAME}},\nNone in stock at the moment. The lowest on a similar ute is $27,500. If you name a model, we can source one for you.')];
  assert.ok(await worker.draftWaiting() >= 1);
  assert.ok(ai.seen.some((r) => r.messages[1].content.includes(prompt)), 'the retry carried the prompt');
  const d = db.latestDraft(key, anchorOf(key));
  assert.deepEqual([d.status, d.instruction, d.checks.some((c) => c.code === 'figure')], ['ready', prompt, false], 'and its figure is allowed');
});

test('the page can see a write under way, whoever started it', async () => {
  const key = customer(5, 'Yara', 'What colours do you have the Noah in?');
  const g = delayed();
  ai.script = [g.promise];
  const p = post(`/api/items/${key}/draft`, { instruction: '' });
  await until(() => ai.seen.length === 1);
  let shown = (await get(`/api/items/${key}`)).item;
  assert.deepEqual([shown.writing, shown.draft], [true, null]);
  g.release(answer('Hi {{NAME}},\nWhite and silver at the moment. You are welcome to come and see them.'));
  await p;
  shown = (await get(`/api/items/${key}`)).item;
  assert.deepEqual([shown.writing, shown.draft.status], [false, 'ready']);
});

test('the automatic write waits while the Prompt line is open, and not after', async () => {
  const held = customer(6, 'Zed', 'Any people movers at the moment?');
  const other = customer(7, 'Ava', 'Is the Noah automatic?');
  const on = await post(`/api/items/${held}/hold`, { on: true });
  assert.deepEqual([on.ok, on.until > Date.now()], [true, true]);
  assert.ok(worker.isHeld(held));
  await worker.draftWaiting();
  assert.ok(!db.latestDraft(held, anchorOf(held)), 'held: nothing written for it');
  assert.ok(db.latestDraft(other, anchorOf(other)), 'everyone else is written for as usual');
  assert.equal((await post(`/api/items/${held}/hold`, { on: false })).until, null);
  assert.ok(!worker.isHeld(held));
  await worker.draftWaiting();
  assert.ok(db.latestDraft(held, anchorOf(held)), 'the line was closed unused: written as before');
  // A hold lapses by itself, and a write from the page ends it.
  const third = customer(8, 'Ben', 'Does the Hiace have a tow bar?');
  worker.holdItem(third, -1);
  assert.ok(!worker.isHeld(third));
  worker.holdItem(third);
  assert.ok((await post(`/api/items/${third}/draft`, { instruction: 'yes it does; invite them to see it' })).ok);
  assert.ok(!worker.isHeld(third));
  assert.equal((await post('/api/items/c:999999/hold', { on: true })).status, 404);
});

test('the status says when writing starts again after busy or used-up models', async () => {
  worker.state.holdUntil = Date.now() + 4 * MIN;
  let s = await get('/api/status');
  assert.deepEqual([s.retryAt, s.retryWhy], [worker.state.holdUntil, 'busy']);
  worker.state.pausedUntil = Date.now() + HOUR;
  s = await get('/api/status');
  assert.deepEqual([s.retryAt, s.retryWhy], [worker.state.pausedUntil, 'daily']);
  worker.state.holdUntil = 0; worker.state.pausedUntil = 0;
  s = await get('/api/status');
  assert.deepEqual([s.retryAt, s.retryWhy, s.marketplace.retryAt], [null, null, null]);
});

test('a text the phone brings in before the dashboard is written for straight away', async () => {
  // A dashboard customer whose newest text the phone sees first. The dashboard login is left blank
  // here, so the check it sets off comes straight back and the write follows.
  db.upsertLead({ id: 709, conversationId: 709, firstName: 'Cal', lastName: 'Test', phone: '0491 570 709', email: '', source: 'carsales', status: 'FOLLOW_UP', platform: 'CARSALES', state: 'NSW', leadAt: now - 3 * HOUR, updatedAt: now - HOUR, stocks: [], inquiries: [], statusHistory: [] });
  db.upsertConversation({ id: 709, phone: '+61491570709', channel: 'SMS', status: 'OPEN', leadId: 709, customerName: 'Cal Test', latestDirection: 'OUT', latestAt: now - HOUR, latestBody: 'x' });
  db.upsertMessage({ id: mid++, conversationId: 709, direction: 'OUT', body: 'Hi Cal, the Hiace is at the yard whenever you would like to see it.', sentBy: 'Dana', status: 'SENT', mediaType: null, at: now - HOUR, importedAt: now - HOUR });
  const thread = parse.parseListItem({ ref: 'r-cal', name: '+61 491 570 709', snippet: 'Do you have anything like a Strada at a similar price?', when: 'now', whenTitle: '', unread: true }, { now });
  const report = { v: 1, seenAt: now, hidden: true, path: '/web/conversations', signedOut: false, found: { listItems: 1, parsed: 1 }, threads: [thread] };
  const saved = { switchedOn: config.phone.switchedOn, writeAtOnce: config.phone.writeAtOnce, baseUrl: config.dashboard.baseUrl };
  config.phone.switchedOn = true; config.phone.writeAtOnce = true; config.dashboard.baseUrl = '';
  worker.state.draftRun = null;
  ai.script = [answer('Hi {{NAME}},\nNot at the moment. If you have a model in mind, we can source one for you.')];
  try {
    const res = await rawPost('/api/phone/messages', report);
    assert.deepEqual([res.status, res.body.stored], [200, 1]);
    assert.ok(worker.state.draftRun, 'a check and a write pass were set off at once');
    await worker.state.draftRun;
    const it = items.itemFromKey('c:709');
    assert.ok(/^pm:/.test(it.anchorKey), 'waiting on the text the phone saw');
    assert.equal(db.latestDraft('c:709', it.anchorKey)?.status, 'ready');
    assert.ok(ai.seen.some((r) => r.messages[1].content.includes('anything like a Strada')));
    // The same report again stores nothing and sets nothing off.
    worker.state.draftRun = null;
    assert.equal((await rawPost('/api/phone/messages', report)).body.stored, 0);
    assert.equal(worker.state.draftRun, null);
  } finally {
    Object.assign(config.phone, { switchedOn: saved.switchedOn, writeAtOnce: saved.writeAtOnce });
    config.dashboard.baseUrl = saved.baseUrl;
  }
});
