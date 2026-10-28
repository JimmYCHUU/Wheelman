// Send on Facebook against the server and the stand-in Marketplace engine: a real store over the
// real routes, Liam's chat written on open, the engine refusing the first reply, Try again, and the
// chat as the server answers a Send. Invented data only.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { applyTestEnv } from './support/env.js';
import { startStandins, aiBehaviour } from './support/standins.js';
import { marketplace, chatRow, chatMessage } from './support/fixtures.js';
import { mainFor, sendFailedWords } from '../web/new/js/channel.js';
import { boxViewOf } from '../web/new/js/boxsections.js';
import { createStore } from '../web/new/js/store.js';
import { createApi } from '../web/new/js/api.js';
import { liveChecks, boxText } from '../web/new/js/model.js';
import { clock } from '../web/lib/format.js';
import { fakeTimers } from './support/newpage-fakes.js';

applyTestEnv({ MARKETPLACE_ENABLED: '1', DASHBOARD_USERNAME: '', DASHBOARD_PASSWORD: '' });

const now = Date.now();
const ai = aiBehaviour({ behave: () => ({ reply: 'Thanks for your message. The price is [PRICE?].', needs_human: [{ marker: '[PRICE?]', reason: 'A person decides the price.' }], facts_used: [], hold: false }) });
let standins, app, base;

before(async () => {
  standins = await startStandins({ world: { now, chats: marketplace(now) }, ai });
  const { config } = await import('../src/config.js');
  config.marketplace.url = `${standins.engineBase}/inbox`;
  config.llm.gemini.url = `${standins.base}/chat`;
  await (await import('../src/sync.js')).syncMarketplace();
  app = await (await import('../src/server.js')).startServer();
  base = `http://127.0.0.1:${app.address().port}`;
});

after(async () => {
  if (app) await new Promise((r) => { app.close(r); app.closeAllConnections?.(); });
  if (standins) await standins.close();
});

/** Waits for the store to be done with something it does not hand back (a write on open). */
async function until(ok) {
  for (let i = 0; i < 400 && !ok(); i++) await new Promise((r) => setTimeout(r, 10));
  assert.ok(ok(), 'it happened');
}

const mainNow = (s) => {
  const text = s.typed !== null ? s.typed : boxText(s.item.draft);
  const ready = s.item.draft && s.item.draft.status === 'ready' ? s.item.draft : null;
  return mainFor({ item: s.item, text, checks: liveChecks(ready, text), overridden: s.overridden, sending: s.sending[s.key] });
};

test('a failed send keeps the text, says why and offers Try again', async () => {
  standins.world.refuseSendOnce = new Set([501]);
  const api = createApi({ fetch: (p, init) => fetch(base + p, init), go: () => {} });
  const storage = { getItem: () => null, setItem() {} };
  const store = createStore({ api, clipboard: { async writeText() {} }, storage, now: Date.now, timers: fakeTimers(), keepalive: (p, b) => api(p, b) });
  // Liam's chat, opened from Marketplace's Needs reply: written as it opens.
  await store.actions.setSection('marketplace', { key: 'mp:501' });
  await until(() => store.get().writing === null && !!(store.get().item && store.get().item.draft));
  const d = store.get().item.draft;
  assert.equal(d.status, 'ready');
  assert.match(d.reply, /\[PRICE\?\]/);
  const text = d.reply.replace(/\[PRICE\?\]/g, '$28,900');
  store.actions.type(text);

  // The engine's phone is offline: refused, once. The server says so in its own words, so it is "Not sent".
  assert.equal(await store.actions.send(), 'failed');
  let s = store.get();
  const error = 'The Marketplace system did not accept the reply: the phone is offline';
  assert.deepEqual(s.sending['mp:501'], { state: 'failed', error, outcome: 'refused', anchor: s.item.anchor, text });
  assert.equal(s.typed, text, 'the text stays');
  assert.equal(s.item.state, 'awaiting');
  assert.equal(sendFailedWords(error, 'refused'), 'Not sent. The Marketplace system did not accept the reply: the phone is offline. Your text is still in the box.');
  assert.equal(mainNow(s).label, 'Try again');
  assert.equal(standins.world.chats.get(501).messages.filter((m) => m.direction === 'out').length, 0, 'nothing reached the buyer');

  // Try again: Marketplace and the chat are read again first, then the reply goes, once.
  assert.equal(await store.actions.send(), 'sent');
  s = store.get();
  const posts = standins.engineSeen.filter((r) => r.method === 'POST');
  assert.deepEqual(posts.map((r) => `${r.path} ${JSON.parse(r.body).text}`), [`/inbox/conversations/501/reply ${text}`, `/inbox/conversations/501/reply ${text}`], 'refused once, then taken');
  assert.equal(standins.world.chats.get(501).messages.filter((m) => m.direction === 'out').length, 1, 'one reply reached the buyer');
  assert.deepEqual(s.sending, {});
  assert.equal(s.toast.message, 'Sent. It is on its way to the buyer.');
  // As the server answers a Send: answered with Wheelman's suggestion, and no suggestion shown.
  assert.equal(s.item.state, 'answered');
  assert.equal(s.item.draft, null);
  assert.equal(s.item.answered.how, 'wheelman');
  assert.equal(s.item.marketplace.sending, true);
  assert.equal(boxViewOf(s, Date.now()).sentence, 'Sent on Facebook at ' + clock(s.item.answered.at) + ". The engine's phone is typing it into the chat.");
  assert.ok(!s.rows.some((r) => r.key === 'mp:501'), 'no longer in Needs reply');
  // The refusal was once: the stand-in has forgotten it.
  assert.equal(standins.world.refuseSendOnce.size, 0);

  // Try again pressed once more (a button left on screen): the chat has a reply since, so nothing is posted.
  assert.equal(await store.actions.send(), null, 'nothing waits to be sent: the box holds no text now');
  assert.equal(standins.engineSeen.filter((r) => r.method === 'POST').length, 2);
});

test('a reply the engine took is answered as sent even when Wheelman cannot keep its own record of it', async () => {
  // The engine answers with a record id Wheelman's database cannot keep: its own note of the reply
  // fails after the engine has taken it.
  standins.world.nextReplyId = 1e300;
  const api = createApi({ fetch: (p, init) => fetch(base + p, init), go: () => {} });
  const store = createStore({ api, clipboard: { async writeText() {} }, storage: { getItem: () => null, setItem() {} }, now: Date.now, timers: fakeTimers(), keepalive: (p, b) => api(p, b) });
  await store.actions.setSection('marketplace', { key: 'mp:504' });
  await until(() => store.get().writing === null && !!(store.get().item && store.get().item.draft));
  const text = store.get().item.draft.reply.replace(/\[[A-Z][A-Z0-9 &'/-]{1,30}\?\]/g, '$27,500');
  store.actions.type(text);
  const reply = () => standins.engineSeen.filter((r) => r.method === 'POST' && r.path === '/inbox/conversations/504/reply');

  // The route answers success: the reply went.
  assert.equal(await store.actions.send(), 'sent');
  const s = store.get();
  assert.deepEqual(s.sending, {});
  assert.equal(s.typed, null);
  assert.equal(s.toast.message, 'Sent. It is on its way to the buyer.');
  assert.equal(reply().length, 1);
  // Not in Wheelman's own thread yet, so the chat still reads as waiting; its suggestion is noted as
  // sent here, so the box says Sent and offers no Send.
  assert.equal(s.item.state, 'awaiting');
  assert.ok(s.item.draft.sentHereAt);
  assert.equal(boxViewOf(s, Date.now()).sentence, 'Sent on Facebook at ' + clock(s.item.draft.sentHereAt) + '.');
  // Pressed anyway (a button left on screen): nothing goes, so the buyer never gets it twice.
  assert.equal(await store.actions.send(), null);
  assert.equal(reply().length, 1);
  // The step that failed is logged with the app's own logger.
  const server = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
  assert.match(server, /logLine\('marketplace', `\$\{item\.itemKey\}: the reply was sent, but \$\{what\}: \$\{e\.message\}`\)/);
});

test('an engine that does not answer in time may have taken the reply: Try again reads Marketplace again and posts nothing', async () => {
  // The engine record the last test left with an id no database keeps: as the real engine's would be.
  for (const c of standins.world.chats.values()) for (const m of c.messages) if (m.id === 1e300) m.id = 9001;
  const { config } = await import('../src/config.js');
  const { syncMarketplace } = await import('../src/sync.js');
  standins.world.chats.set(510, { row: chatRow(510, 'Rosa Invented', 5, Date.now()), messages: [chatMessage(510, 'in', 'phone', 'Is the Noah still available?', 5, Date.now())] });
  await syncMarketplace();
  const real = createApi({ fetch: (p, init) => fetch(base + p, init), go: () => {} });
  const calls = [];
  const api = (p, b) => { calls.push((b === undefined ? 'GET ' : 'POST ') + p); return real(p, b); };
  const store = createStore({ api, clipboard: { async writeText() {} }, storage: { getItem: () => null, setItem() {} }, now: Date.now, timers: fakeTimers(), keepalive: (p, b) => api(p, b) });
  await store.actions.setSection('marketplace', { key: 'mp:510' });
  await until(() => store.get().writing === null && !!(store.get().item && store.get().item.draft));
  const text = store.get().item.draft.reply.replace(/\[[A-Z][A-Z0-9 &'/-]{1,30}\?\]/g, '$28,900');
  store.actions.type(text);
  const replies = () => standins.engineSeen.filter((r) => r.method === 'POST' && r.path === '/inbox/conversations/510/reply');

  // The engine queues the reply but answers after Wheelman has stopped waiting.
  const wait = config.marketplace.sendTimeoutMs;
  config.marketplace.sendTimeoutMs = 200;
  standins.world.replyDelayMs = 700;
  try {
    assert.equal(await store.actions.send(), 'failed');
  } finally { config.marketplace.sendTimeoutMs = wait; }
  let s = store.get();
  const error = 'The Marketplace system did not answer in time, so the reply may have gone.';
  assert.deepEqual([s.sending['mp:510'].outcome, s.sending['mp:510'].error], ['unknown', error], 'not a refusal: the route answers 504');
  assert.equal(sendFailedWords(error, 'unknown'), 'Wheelman could not tell whether this reply went. ' + error);
  assert.equal(replies().length, 1);
  assert.equal(standins.world.chats.get(510).messages.filter((m) => m.direction === 'out').length, 1, 'the engine has it, queued');
  await new Promise((r) => setTimeout(r, 800)); // the engine's late answer goes nowhere

  // Try again: Wheelman reads Marketplace again first (Check now's sync), then the chat, which
  // now shows the reply: nothing is posted.
  calls.length = 0;
  assert.equal(await store.actions.send(), 'replied');
  assert.deepEqual(calls.slice(0, 2), ['POST /api/sync', 'GET /api/items/mp:510']);
  assert.ok(!calls.includes('POST /api/items/mp:510/send'));
  assert.equal(replies().length, 1, 'the buyer gets it once');
  s = store.get();
  assert.deepEqual(s.sending, {});
  assert.equal(s.typed, null);
  assert.equal(s.item.state, 'answered');
  // The route says it in its own words, with its own status.
  const marketplaceSrc = fs.readFileSync(new URL('../src/marketplace.js', import.meta.url), 'utf8');
  assert.match(marketplaceSrc, /AbortSignal\.timeout\(config\.marketplace\.sendTimeoutMs \|\| 20000\)/);
  const server = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
  assert.match(server, /if \(!e\.mayHaveGone\) return send\(res, 502, \{ error: e\.message \}\);/);
  assert.match(server, /send\(res, 504, \{ error: e\.message \}\);/);
});

test('POST /api/sync with marketplace reads Marketplace only: after a read already under way, a fresh one', async () => {
  const worker = await import('../src/worker.js');
  const post = (body) => fetch(base + '/api/sync', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const lists = () => standins.engineSeen.filter((r) => r.method === 'GET' && r.path === '/inbox/conversations').length;
  const dashboard = worker.state.lastSync;
  // A Marketplace read under way (the background's), held at the engine's chat list as it stood when asked.
  let release;
  standins.world.listWait = new Promise((r) => { release = r; });
  const listed = lists();
  const running = worker.runMarketplaceSync();
  await until(() => lists() > listed);
  const earlier = worker.state.mpSync;
  assert.equal(await worker.runMarketplaceSync(), earlier, 'any other caller still takes the earlier result at once');
  // Meanwhile the engine records a chat the read under way cannot see.
  standins.world.chats.set(512, { row: chatRow(512, 'Sol Invented', 1, Date.now()), messages: [chatMessage(5120, 'in', 'phone', 'Is it still for sale?', 1, Date.now())] });
  // A pass of writing under way: draftWaiting, if it were started, would ask for one more.
  worker.state.drafting = true;
  worker.state.draftAgain = false;
  try {
    let answered = null;
    const asked = post({ marketplace: true }).then((r) => { answered = r; return r; });
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(answered, null, 'it waits for the read under way');
    delete standins.world.listWait;
    release();
    assert.equal((await asked).status, 200);
    const done = await running;
    assert.notEqual(done, earlier);
    assert.ok(done.ok);
    // It waited for that read, then had a fresh one, begun after the request: the chat the engine
    // recorded meanwhile is in Wheelman.
    assert.notEqual(worker.state.mpSync, done, 'a fresh read after the one under way');
    assert.ok(worker.state.mpSync.ok);
    assert.equal(lists(), listed + 2);
    const fresh = await (await fetch(base + '/api/items/mp:512')).json();
    assert.equal(fresh.item && fresh.item.name, 'Sol Invented');
    assert.equal(worker.state.lastSync, dashboard, 'no dashboard check');
    assert.equal(worker.state.draftAgain, false, 'nothing written');
    // With no read under way, Marketplace is read now.
    const seen = standins.engineSeen.length;
    assert.equal((await post({ marketplace: true })).status, 200);
    assert.ok(standins.engineSeen.slice(seen).some((r) => r.method === 'GET' && r.path === '/inbox/conversations'));
    assert.notEqual(worker.state.mpSync, done);
    assert.equal(worker.state.lastSync, dashboard);
    // A read that fails is said, so the page posts nothing.
    standins.world.listDown = true;
    const down = await post({ marketplace: true });
    delete standins.world.listDown;
    assert.equal(down.status, 502);
    assert.match((await down.json()).error, /^The content engine returned 503/);
    // Every other caller, as before: the dashboard check and a pass of writing too.
    assert.equal((await post({})).status, 200);
    assert.notEqual(worker.state.lastSync, dashboard);
    assert.equal(worker.state.draftAgain, true);
  } finally {
    worker.state.drafting = false;
    worker.state.draftAgain = false;
  }
});
