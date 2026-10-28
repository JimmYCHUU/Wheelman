// Send on Facebook against the server and the stand-in Marketplace engine: a real store over the
// real routes, Liam's chat written on open, the engine refusing the first reply, Try again, and the
// chat as the server answers a Send. Invented data only.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { applyTestEnv } from './support/env.js';
import { startStandins, aiBehaviour } from './support/standins.js';
import { marketplace } from './support/fixtures.js';
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
  assert.deepEqual(s.sending['mp:501'], { state: 'failed', error, outcome: 'refused', anchor: s.item.anchor });
  assert.equal(s.typed, text, 'the text stays');
  assert.equal(s.item.state, 'awaiting');
  assert.equal(sendFailedWords(error, 'refused'), 'Not sent. The Marketplace system did not accept the reply: the phone is offline. Your text is still in the box.');
  assert.equal(mainNow(s).label, 'Try again');
  assert.equal(standins.world.chats.get(501).messages.filter((m) => m.direction === 'out').length, 0, 'nothing reached the buyer');

  // Try again: the chat is read again first, then the reply goes, once.
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
