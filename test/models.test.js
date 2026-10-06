// What happens when the free AI models are busy, or have used up their daily allowance.
// A stand-in AI service on this computer plays three models. All data is invented.
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { applyTestEnv } from './support/env.js';

applyTestEnv({ GEMINI_FALLBACK_MODELS: 'model-b,model-c' });

// This file keeps its own stand-in AI: each model answers in its own way, with the services'
// exact refusal bodies, which the shared stand-in (test/support/standins.js) does not play.
const now = Date.now();
const MIN = 60e3;
let server, llm, db, items, drafter, worker;
const asked = [];      // the model each request was for, in order
let behave = {};       // model -> what it answers

// The refusals, shaped like the real ones.
const usedUp = (model, seconds = 63956) => ({ status: 429, text: JSON.stringify([{ error: { code: 429, status: 'RESOURCE_EXHAUSTED',
  message: `You exceeded your current quota, please check your plan and billing details.\n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 20, model: ${model}\nPlease retry in 17h45m56.7s.`,
  details: [{ violations: [{ quotaMetric: 'generativelanguage.googleapis.com/generate_content_free_tier_requests', quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier', quotaValue: '20' }] }, { retryDelay: `${seconds}s` }] } }], null, 2) });
const busyMinute = () => ({ status: 429, text: JSON.stringify([{ error: { code: 429, message: 'Quota exceeded.\nPlease retry in 34.5s.', details: [{ violations: [{ quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier' }] }, { retryDelay: '34s' }] } }], null, 2) });
const overloaded = () => ({ status: 503, text: JSON.stringify({ error: { message: 'The model is overloaded. Please try again later.' } }) });
const answers = (reply = 'Hi {{NAME}},\nYes, it is available.') => ({ status: 200, text: JSON.stringify({ choices: [{ message: { content: JSON.stringify({ reply, needs_human: [], facts_used: [], hold: false }) }, finish_reason: 'stop' }] }) });
const rejected = () => ({ status: 401, text: JSON.stringify({ error: { message: 'API key not valid. Please pass a valid API key.' } }) });

before(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const model = JSON.parse(body).model;
      asked.push(model);
      const out = (behave[model] || answers)();
      res.writeHead(out.status, { 'content-type': 'application/json' });
      res.end(out.text);
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { config } = await import('../src/config.js');
  config.llm.gemini.url = `http://127.0.0.1:${server.address().port}/chat`;
  llm = await import('../src/llm.js');
  db = await import('../src/db.js');
  items = await import('../src/items.js');
  drafter = await import('../src/drafter.js');
  worker = await import('../src/worker.js');

  let mid = 1;
  for (const [id, first] of [[1, 'Ava'], [2, 'Ben']]) {
    db.upsertLead({ id, conversationId: id + 100, firstName: first, lastName: 'Test', phone: `0400 111 00${id}`, email: '', source: 'carsales', status: 'NEW', platform: 'CARSALES', state: 'NSW', leadAt: now - 60 * MIN, updatedAt: now - 5 * MIN, stocks: [], inquiries: [], statusHistory: [] });
    db.upsertConversation({ id: id + 100, phone: `+6140011100${id}`, channel: 'SMS', status: 'OPEN', leadId: id, customerName: `${first} Test`, latestDirection: 'IN', latestAt: now - 5 * MIN, latestBody: 'x' });
    db.upsertMessage({ id: mid++, conversationId: id + 100, direction: 'IN', body: 'Hi, do you have any vans at the moment?', sentBy: null, status: 'SENT', mediaType: null, at: now - 5 * MIN, importedAt: now - 5 * MIN });
  }
});

after(() => new Promise((r) => { server.close(r); server.closeAllConnections?.(); }));

beforeEach(() => { llm.resetModelState(); asked.length = 0; behave = {}; worker.state.holdUntil = 0; worker.state.pausedUntil = 0; worker.state.lastDraftError = null; });

/** Runs something without really waiting between tries. */
async function quickly(fn) {
  const real = globalThis.setTimeout;
  globalThis.setTimeout = (f, ms, ...a) => real(f, Math.min(ms, 5), ...a);
  try { return await fn(); } finally { globalThis.setTimeout = real; }
}
const item = (id) => items.buildItem({ conversationId: id });

test('a refusal is read for how long to wait, and whether the day\'s allowance is gone', () => {
  assert.equal(llm.retrySeconds('{ "retryDelay": "63956s" }'), 63956);
  assert.equal(llm.retrySeconds('Please retry in 17h45m56.7s.'), 63957);
  assert.equal(llm.retrySeconds('Please retry in 34.5s.'), 35);
  assert.equal(llm.retrySeconds('Please retry in 2m10s.'), 130);
  assert.equal(llm.retrySeconds('Please retry shortly.'), 0);
  assert.equal(llm.retrySeconds('anything', '12'), 12);
  assert.equal(llm.isDailyLimit('"quotaId": "GenerateRequestsPerDayPerProjectPerModel-FreeTier"'), true);
  assert.equal(llm.isDailyLimit('"quotaId": "GenerateRequestsPerMinutePerProjectPerModel-FreeTier"', 35), false);
  assert.equal(llm.isDailyLimit('Rate limit exceeded: free-models-per-day.'), true);
  assert.equal(llm.isDailyLimit('temporarily rate-limited upstream. Please retry shortly'), false);
  assert.equal(llm.isDailyLimit('no words about it', 5 * 3600), true, 'told to wait hours: the day is gone');
});

test('a model that has used up its day is set aside, and the next model writes', async () => {
  behave = { 'model-a': () => usedUp('model-a') };
  const first = await quickly(() => llm.complete('s', 'u'));
  assert.equal(first.model, 'model-b');
  assert.deepEqual(asked, ['model-a', 'model-b']);

  // It is not asked again until its allowance returns. The others are not affected.
  asked.length = 0;
  const second = await quickly(() => llm.complete('s', 'u'));
  assert.equal(second.model, 'model-b');
  assert.deepEqual(asked, ['model-b']);
  const status = llm.modelStatus();
  const hours = (status[0].usedUpUntil - Date.now()) / 3600e3;
  assert.ok(hours > 17.5 && hours < 18, `back in about ${hours} hours`);
  assert.equal(status[1].usedUpUntil, null);
});

test('when every model has used up its day, it says so plainly and stops asking', async () => {
  behave = { 'model-a': () => usedUp('model-a'), 'model-b': () => usedUp('model-b', 7200), 'model-c': () => usedUp('model-c') };
  const d = await quickly(() => drafter.draftFor(item(101), { save: false }));
  assert.equal(d.status, 'failed');
  assert.equal(d.daily, true);
  assert.equal(d.temporary, true);
  assert.match(d.error, /^Every free AI model has used up its allowance for today\. Suggestions start again by themselves around /);
  assert.ok(!/429|quota|googleapis/i.test(d.error), 'the technical answer is kept for the log, not shown');
  assert.deepEqual(asked, ['model-a', 'model-b', 'model-c']);

  asked.length = 0;
  await assert.rejects(() => llm.complete('s', 'u'), (e) => e.daily === true && /^Every free AI model has used up/.test(e.message));
  assert.equal(asked.length, 0, 'no model is asked while all are used up');

  // What the services actually answered travels with the error, for the log.
  llm.resetModelState();
  await assert.rejects(() => quickly(() => llm.complete('s', 'u')), (e) => /Quota exceeded for metric/.test(e.detail) && /model-c/.test(e.detail));
});

test('Marketplace chats are asked of the small model onwards, and never of the better ones', async () => {
  const { config } = await import('../src/config.js');
  const kept = config.llm.marketplaceModel;
  config.llm.marketplaceModel = 'model-c';
  try {
    assert.deepEqual(llm.providers({ marketplace: true }).map((p) => p.model), ['model-c']);
    assert.deepEqual(llm.modelStatus().map((m) => m.marketplace), [false, false, true]);
    const chat = await quickly(() => llm.complete('s', 'u', { marketplace: true }));
    assert.equal(chat.model, 'model-c');
    assert.deepEqual(asked, ['model-c']);

    // Its day is used up: Marketplace says so and stops. Dashboard customers still get the best model.
    behave = { 'model-c': () => usedUp('model-c') };
    asked.length = 0;
    await assert.rejects(() => quickly(() => llm.complete('s', 'u', { marketplace: true })), (e) => e.daily === true && /^The AI models used for Marketplace have used up their allowance for today/.test(e.message));
    assert.deepEqual(asked, ['model-c']);
    asked.length = 0;
    assert.equal((await quickly(() => llm.complete('s', 'u'))).model, 'model-a');

    // With no small model named, or one that is not in the list, there is no split.
    config.llm.marketplaceModel = '';
    assert.equal(llm.providers({ marketplace: true }).length, 3);
    config.llm.marketplaceModel = 'some-other-model';
    assert.equal(llm.providers({ marketplace: true }).length, 3);
  } finally { config.llm.marketplaceModel = kept; }
});

test('busy models give a plain message that needs nobody, and a rejected key one that does', async () => {
  behave = { 'model-a': busyMinute, 'model-b': overloaded, 'model-c': busyMinute };
  const busy = await quickly(() => drafter.draftFor(item(101), { save: false }));
  assert.equal(busy.status, 'failed');
  assert.equal(busy.temporary, true);
  assert.equal(busy.daily, false);
  assert.equal(busy.error, 'No AI model could answer just now. The free models are busy or have used up their allowance for today. Wheelman tries again by itself in a few minutes.');
  assert.equal(llm.modelStatus().filter((m) => m.usedUpUntil).length, 0, 'a per-minute limit is not the end of the day');

  llm.resetModelState();
  behave = { 'model-a': rejected, 'model-b': rejected, 'model-c': rejected };
  const key = await quickly(() => drafter.draftFor(item(101), { save: false }));
  assert.equal(key.temporary, false);
  assert.match(key.error, /rejected the key in the \.env file.*API key not valid/);
});

test('the background loop keeps quiet about busy models, waits, and tries again', async () => {
  behave = { 'model-a': overloaded, 'model-b': overloaded, 'model-c': overloaded };
  assert.equal(await quickly(() => worker.draftWaiting()), 0);
  assert.equal(worker.state.lastDraftError, null, 'nothing is put on the page for a problem that fixes itself');
  assert.ok(worker.state.holdUntil > Date.now() + 3 * MIN);
  const afterFirst = asked.length;
  assert.equal(afterFirst, 6, 'one customer was tried, on every model twice, and then it stopped');
  assert.equal(await quickly(() => worker.draftWaiting()), 0);
  assert.equal(asked.length, afterFirst, 'nothing is asked while it waits');

  // The failed try is ten minutes old and the models are back: both customers get their suggestion.
  db.openDb().prepare("UPDATE drafts SET created_at = created_at - ? WHERE status = 'failed'").run(11 * MIN);
  worker.state.holdUntil = 0;
  llm.resetModelState();
  behave = {};
  assert.equal(await quickly(() => worker.draftWaiting()), 2);
});

test('a message is tried three times in an hour, and again after that', async () => {
  db.upsertLead({ id: 3, conversationId: 103, firstName: 'Cy', lastName: 'Test', phone: '0400 111 003', email: '', source: 'carsales', status: 'NEW', platform: 'CARSALES', state: 'NSW', leadAt: now - 60 * MIN, updatedAt: now - 5 * MIN, stocks: [], inquiries: [], statusHistory: [] });
  db.upsertConversation({ id: 103, phone: '+61400111003', channel: 'SMS', status: 'OPEN', leadId: 3, customerName: 'Cy Test', latestDirection: 'IN', latestAt: now - 5 * MIN, latestBody: 'x' });
  db.upsertMessage({ id: 50, conversationId: 103, direction: 'IN', body: 'Do you have any vans?', sentBy: null, status: 'SENT', mediaType: null, at: now - 5 * MIN, importedAt: now - 5 * MIN });
  const it = item(103);
  const d = db.openDb();
  for (const minutesAgo of [50, 35, 20]) {
    const id = db.insertDraft({ itemKey: it.itemKey, anchorKey: it.anchorKey, situation: 'general', reply: '', status: 'failed', error: 'busy', checks: [] });
    d.prepare('UPDATE drafts SET created_at = ? WHERE id = ?').run(Date.now() - minutesAgo * MIN, id);
  }
  assert.equal(await quickly(() => worker.draftWaiting()), 0, 'three failed tries in the last hour: left alone for now');
  assert.equal(asked.length, 0);

  // Half an hour later the oldest two are more than an hour old.
  d.prepare("UPDATE drafts SET created_at = created_at - ? WHERE item_key = ? AND status = 'failed'").run(30 * MIN, it.itemKey);
  assert.equal(await quickly(() => worker.draftWaiting()), 1);
});
