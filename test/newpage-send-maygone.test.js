// After a send the Marketplace engine did not answer in time (504), the server keeps a note for that
// chat, so a reply that may have gone is never sent twice from any page: a reload, another device or
// the old page. The next send on that chat first has a fresh Marketplace read and the chat looked at,
// and is answered 409 "This reply has gone already." when our reply is there; otherwise it goes as
// normal. The real routes and the stand-in engine. Invented data only.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { applyTestEnv } from './support/env.js';
import { startStandins, aiBehaviour } from './support/standins.js';
import { chatRow, chatMessage } from './support/fixtures.js';
import { boxViewOf } from '../web/new/js/boxsections.js';
import { createStore } from '../web/new/js/store.js';
import { createApi } from '../web/new/js/api.js';
import { boxText } from '../web/new/js/model.js';
import { fakeTimers } from './support/newpage-fakes.js';

applyTestEnv({ MARKETPLACE_ENABLED: '1', DASHBOARD_USERNAME: '', DASHBOARD_PASSWORD: '' });

const ai = aiBehaviour({ behave: () => ({ reply: 'Thanks for your message. The price is [PRICE?].', needs_human: [{ marker: '[PRICE?]', reason: 'A person decides the price.' }], facts_used: [], hold: false }) });
const GONE = 'This reply has gone already.';
const TIMED_OUT = 'The Marketplace system did not answer in time, so the reply may have gone.';
let standins, app, base, config;

before(async () => {
  standins = await startStandins({ world: { now: Date.now(), chats: new Map() }, ai });
  ({ config } = await import('../src/config.js'));
  config.marketplace.url = `${standins.engineBase}/inbox`;
  config.llm.gemini.url = `${standins.base}/chat`;
  app = await (await import('../src/server.js')).startServer();
  base = `http://127.0.0.1:${app.address().port}`;
});

after(async () => {
  if (app) await new Promise((r) => { app.close(r); app.closeAllConnections?.(); });
  if (standins) await standins.close();
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(ok, what = 'it happened') {
  for (let i = 0; i < 400 && !(await ok()); i++) await sleep(10);
  assert.ok(await ok(), what);
}
/** A buyer waiting on us, in the engine and in Wheelman. */
async function buyer(id, name) {
  standins.world.chats.set(id, { row: chatRow(id, name, 5, Date.now()), messages: [chatMessage(id * 10, 'in', 'phone', 'Is the Noah still available?', 5, Date.now())] });
  await (await import('../src/sync.js')).syncMarketplace();
}
/** A page: the new page's store over the real routes, with nothing in memory from before. */
const page = () => {
  const api = createApi({ fetch: (p, init) => fetch(base + p, init), go: () => {} });
  return createStore({ api, clipboard: { async writeText() {} }, storage: { getItem: () => null, setItem() {} }, now: Date.now, timers: fakeTimers(), keepalive: (p, b) => api(p, b) });
};
/** A POST as the old page makes one. */
const post = async (p, body) => {
  const r = await fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, json: await r.json() };
};
const chat = async (key) => (await (await fetch(base + '/api/items/' + key)).json()).item;
const replies = (id) => standins.engineSeen.filter((r) => r.method === 'POST' && r.path === `/inbox/conversations/${id}/reply`);
/** A send the engine takes but answers after Wheelman has stopped waiting: the route answers 504. */
async function timesOut(send) {
  const wait = config.marketplace.sendTimeoutMs;
  config.marketplace.sendTimeoutMs = 200;
  standins.world.replyDelayMs = 700;
  try { return await send(); } finally { config.marketplace.sendTimeoutMs = wait; }
}

test('after a send that timed out, a fresh page that presses Send is answered 409 and the buyer gets the reply once', async () => {
  await buyer(513, 'Ines Invented');
  const a = page();
  await a.actions.setSection('marketplace', { key: 'mp:513' });
  await until(() => a.get().writing === null && !!(a.get().item && a.get().item.draft));
  const text = a.get().item.draft.reply.replace(/\[PRICE\?\]/g, '$28,900');
  a.actions.type(text);
  // The engine takes it and answers too late, while Marketplace cannot be read (so the read the 504
  // starts brings nothing).
  standins.world.listDown = true;
  assert.equal(await timesOut(() => a.actions.send()), 'failed');
  assert.deepEqual([a.get().sending['mp:513'].outcome, a.get().sending['mp:513'].error], ['unknown', TIMED_OUT]);
  assert.equal(replies(513).length, 1);
  await sleep(800); // the engine's late answer goes nowhere

  // A fresh page (a reload, another device): Wheelman's copy of the chat still waits, and this page
  // has no record of the send. The same text is in the box.
  const b = page();
  await b.actions.setSection('marketplace', { key: 'mp:513' });
  assert.equal(b.get().item.state, 'awaiting');
  assert.deepEqual([b.get().sending, b.get().unconfirmed], [{}, {}], 'nothing in memory');
  if (boxText(b.get().item.draft) !== text) b.actions.type(text);
  standins.world.listDown = false;
  // Send: the server reads Marketplace afresh, finds the reply in the chat, and answers 409. Nothing goes twice.
  assert.equal(await b.actions.send(), 'replied');
  assert.equal(replies(513).length, 1, 'the buyer gets it once');
  const s = b.get();
  assert.deepEqual(s.sending, {});
  assert.equal(s.typed, null);
  assert.equal(s.toast.message, GONE);
  assert.equal(s.item.state, 'answered');
  // Its suggestion is noted as sent from here now, so the box says it went from Wheelman.
  assert.match(boxViewOf(s, Date.now()).sentence, /^Sent on Facebook at /);
});

test("the old page's send is checked the same way, and a chat that cannot be read first sends nothing", async () => {
  await buyer(514, 'Joel Invented');
  const text = 'Yes, it is still here. Would you like to see it?';
  standins.world.listDown = true;
  const first = await timesOut(() => post('/api/items/mp:514/send', { text, draftId: null }));
  assert.deepEqual([first.status, first.json.error], [504, TIMED_OUT]);
  await sleep(800);
  // While Marketplace cannot be read, a send on that chat posts nothing and says why. The note stays.
  const blind = await post('/api/items/mp:514/send', { text, draftId: null });
  assert.equal(blind.status, 502);
  assert.match(blind.json.error, /^Wheelman could not read the Marketplace chat first\. The content engine returned 503/);
  assert.equal(replies(514).length, 1);
  // Readable again: the reply is in the chat, so 409, and nothing more is posted.
  standins.world.listDown = false;
  const again = await post('/api/items/mp:514/send', { text, draftId: null });
  assert.deepEqual([again.status, again.json], [409, { error: GONE, gone: true, same: true }]);
  assert.equal(replies(514).length, 1);
  assert.equal((await chat('mp:514')).state, 'answered', 'every page sees it answered now');
});

test('the 504 starts a Marketplace read of its own, and a reply that did not go is sent as normal', async () => {
  // Marketplace readable: the read the 504 starts brings the queued reply into Wheelman by itself.
  await buyer(515, 'Kai Invented');
  const text = 'Yes, it is still here.';
  assert.equal((await timesOut(() => post('/api/items/mp:515/send', { text, draftId: null }))).status, 504);
  await until(async () => (await chat('mp:515')).state === 'answered', 'the chat shows the reply without another read');
  assert.equal((await post('/api/items/mp:515/send', { text, draftId: null })).status, 409);
  assert.equal(replies(515).length, 1);

  // The engine did not keep it after all: the next send reads Marketplace afresh, finds nothing, and sends.
  await buyer(516, 'Lena Invented');
  standins.world.listDown = true;
  assert.equal((await timesOut(() => post('/api/items/mp:516/send', { text, draftId: null }))).status, 504);
  await sleep(800);
  const c = standins.world.chats.get(516);
  c.messages = c.messages.filter((m) => m.direction !== 'out');
  Object.assign(c.row, { last_direction: 'in', pending_outbound: 0, last_message_at: new Date().toISOString() });
  standins.world.listDown = false;
  const sent = await post('/api/items/mp:516/send', { text, draftId: null });
  assert.equal(sent.status, 200);
  assert.equal(replies(516).length, 2, 'the first, which did not stay, and this one');
  assert.equal(c.messages.filter((m) => m.direction === 'out').length, 1, 'one reply in the chat');
  // The note was checked once: the next send on that chat is as any other, with no read first.
  const lists = () => standins.engineSeen.filter((r) => r.method === 'GET' && r.path === '/inbox/conversations').length;
  const read = lists();
  assert.equal((await post('/api/items/mp:516/send', { text: 'And one more thing.', draftId: null })).status, 200);
  assert.equal(lists(), read);
  assert.equal(replies(516).length, 3);
});

// ---- PR 5b, Task 0a: the same words are never sent to a buyer twice

const lists = () => standins.engineSeen.filter((r) => r.method === 'GET' && r.path === '/inbox/conversations').length;
/** The buyer writes again, in the engine and in Wheelman. */
async function writesAgain(id, text) {
  const all = [...standins.world.chats.values()].flatMap((x) => x.messages.map((m) => Number(m.id) || 0));
  const c = standins.world.chats.get(id);
  c.messages.push(chatMessage(Math.max(0, ...all) + 1, 'in', 'phone', text, 0, Date.now()));
  Object.assign(c.row, { last_direction: 'in', last_message_at: new Date().toISOString() });
  await (await import('../src/sync.js')).syncMarketplace();
}

test('a second press with the same words after "This reply has gone already." is refused again, from the old page too', async () => {
  await buyer(517, 'Mila Invented');
  const text = 'Yes, it is still here. Come by on Saturday.';
  assert.equal((await timesOut(() => post('/api/items/mp:517/send', { text, draftId: null }))).status, 504);
  await until(async () => (await chat('mp:517')).state === 'answered', 'the chat shows the reply');
  for (const press of [1, 2]) {
    const again = await post('/api/items/mp:517/send', { text, draftId: null });
    assert.deepEqual([again.status, again.json], [409, { error: GONE, gone: true, same: true }], `press ${press}`);
  }
  assert.equal(replies(517).length, 1, 'the buyer gets it once');
});

test('the reply that timed out is refused again after the buyer wrote, and other words go', async () => {
  await buyer(518, 'Nils Invented');
  const text = 'Yes, it is still here.';
  assert.equal((await timesOut(() => post('/api/items/mp:518/send', { text, draftId: null }))).status, 504);
  await until(async () => (await chat('mp:518')).state === 'answered', 'the chat shows the reply');
  await writesAgain(518, 'Great, can I see it tomorrow?');
  assert.equal((await chat('mp:518')).state, 'awaiting', 'the buyer is waiting again');
  // The words that went: refused, whatever the buyer wrote since.
  const same = await post('/api/items/mp:518/send', { text, draftId: null });
  assert.deepEqual([same.status, same.json], [409, { error: GONE, gone: true, same: true }]);
  // Other words go.
  const other = await post('/api/items/mp:518/send', { text: 'Yes, tomorrow at 10 works.', draftId: null });
  assert.equal(other.status, 200);
  assert.equal(replies(518).length, 2);
});

test('the 409 says whether the words sent are the ones that went, compared on the tagged text', async () => {
  // The box's link carries another tag; the server tags it utm_source=marketplace before it goes.
  await buyer(519, 'Oona Invented');
  const text = `Here it is: ${config.site.baseUrl}/vehicles/1159?utm_source=facebook`;
  assert.equal((await timesOut(() => post('/api/items/mp:519/send', { text, draftId: null }))).status, 504);
  await until(async () => (await chat('mp:519')).state === 'answered', 'the chat shows the reply');
  assert.match(replies(519)[0].body, /utm_source=marketplace/);
  const same = await post('/api/items/mp:519/send', { text, draftId: null });
  assert.deepEqual([same.status, same.json], [409, { error: GONE, gone: true, same: true }]);
  assert.equal(replies(519).length, 1);

  // Other words, with nothing from the buyer since that reply: 409 once, saying they are not the
  // words that went; the same words pressed again go.
  await buyer(520, 'Pia Invented');
  assert.equal((await timesOut(() => post('/api/items/mp:520/send', { text: 'Yes, it is still here.', draftId: null }))).status, 504);
  await until(async () => (await chat('mp:520')).state === 'answered', 'the chat shows the reply');
  const other = 'Yes, it is still here today. Come by any time after 10.';
  const first = await post('/api/items/mp:520/send', { text: other, draftId: null });
  assert.deepEqual([first.status, first.json], [409, { error: GONE, gone: true, same: false }]);
  assert.equal(replies(520).length, 1);
  assert.equal((await post('/api/items/mp:520/send', { text: other, draftId: null })).status, 200);
  assert.equal(replies(520).length, 2);
});

test('the same words as our reply since the buyer last wrote are refused on any chat, and a reply that did not reach the buyer can be sent again', async () => {
  await buyer(521, 'Quinn Invented');
  const text = 'Yes, it is still here. Would you like to see it?';
  assert.equal((await post('/api/items/mp:521/send', { text, draftId: null })).status, 200);
  const read = lists();
  const again = await post('/api/items/mp:521/send', { text, draftId: null });
  assert.deepEqual([again.status, again.json], [409, { error: GONE, gone: true, same: true }]);
  assert.equal(lists(), read, 'no Marketplace read first');
  assert.equal(replies(521).length, 1);
  // The engine takes it but cannot deliver it: it is not in the chat, so the same words go again.
  await buyer(522, 'Rhea Invented');
  standins.world.failDeliveryOnce = new Set([522]);
  assert.equal((await post('/api/items/mp:522/send', { text, draftId: null })).status, 200);
  assert.equal((await chat('mp:522')).marketplace.failed, 1, 'not delivered');
  assert.equal((await post('/api/items/mp:522/send', { text, draftId: null })).status, 200);
  assert.equal(replies(522).length, 2);
});
