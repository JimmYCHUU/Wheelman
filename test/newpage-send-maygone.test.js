// After a send the Marketplace engine did not answer in time (504), the server keeps a note for that
// chat, so a reply that may have gone is never sent twice from any page: a reload, another device or
// the old page. The next send on that chat first has a fresh Marketplace read and the chat looked at,
// and is answered 409 "This reply has gone already." when our reply is there; otherwise it goes as
// normal. The real routes and the stand-in engine. Invented data only.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { applyTestEnv } from './support/env.js';
import { startStandins, aiBehaviour } from './support/standins.js';
import { chatRow, chatMessage } from './support/fixtures.js';
import { boxViewOf, sectionBox } from '../web/new/js/boxsections.js';
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

test('a reply that timed out and went reads Answered on Facebook, not on the dashboard', async () => {
  await buyer(590, 'Mia Invented');
  assert.equal((await timesOut(() => post('/api/items/mp:590/send', { text: 'Yes, it is still here.', draftId: null }))).status, 504);
  await until(async () => (await chat('mp:590')).state === 'answered', 'the read the 504 starts brings the reply in');
  const item = await chat('mp:590');
  assert.equal(item.answered.how, 'facebook');
  assert.match(sectionBox({ item, now: Date.now() }).sentence, /^Answered on Facebook .*No reply needed\.$/);
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

// ---- Task 0a, fix round 1

const ok = (r) => [r.status, r.json];
const goneSame = (same) => [409, { error: GONE, gone: true, same }];
/** A 504 on this chat whose reply the engine took, read into Wheelman by the read the 504 starts. */
async function timedOutAndShown(id, text) {
  assert.equal((await timesOut(() => post(`/api/items/mp:${id}/send`, { text, draftId: null }))).status, 504);
  await until(async () => (await chat(`mp:${id}`)).state === 'answered', 'the chat shows the reply');
  await sleep(800); // the engine's late answer goes nowhere
}
/** The engine reports a queued reply failed (its phone could not type it), and Wheelman reads it. */
async function failsLater(id, text) {
  const c = standins.world.chats.get(id);
  c.messages.find((x) => x.direction === 'out' && x.text === text).status = 'failed';
  Object.assign(c.row, { failed_outbound: (c.row.failed_outbound || 0) + 1, pending_outbound: 0, last_message_at: new Date().toISOString() });
  await (await import('../src/sync.js')).syncMarketplace();
}

test('a reply that timed out and was found while on its way, then did not reach the buyer, can be sent again', async () => {
  // Found while queued, other words held once; then it fails, and Send it again goes, once.
  await buyer(523, 'Sami Invented');
  const text = 'Yes, it is still here.';
  await timedOutAndShown(523, text);
  assert.deepEqual(ok(await post('/api/items/mp:523/send', { text: 'Also, it has new tyres.', draftId: null })), goneSame(false));
  await failsLater(523, text);
  assert.equal((await chat('mp:523')).state, 'awaiting', 'the buyer is waiting again');
  assert.equal((await post('/api/items/mp:523/send', { text, draftId: null })).status, 200);
  assert.equal(replies(523).length, 2);
  // In the chat now: those words are refused again.
  assert.deepEqual(ok(await post('/api/items/mp:523/send', { text, draftId: null })), goneSame(true));
  // Found while queued by its own words pressed again; then it fails, and Send it again goes.
  await buyer(524, 'Tara Invented');
  const words = 'Yes, it is still here. Come by on Saturday.';
  await timedOutAndShown(524, words);
  assert.deepEqual(ok(await post('/api/items/mp:524/send', { text: words, draftId: null })), goneSame(true));
  await failsLater(524, words);
  assert.equal((await post('/api/items/mp:524/send', { text: words, draftId: null })).status, 200);
  assert.equal(replies(524).length, 2);
});

test('a found note holds after the buyer writes and after the engine refuses a send, and a later send taken ends it', async () => {
  await buyer(525, 'Uli Invented');
  const text = 'Yes, it is still here.';
  const other = 'Yes, tomorrow at 10 works.';
  await timedOutAndShown(525, text);
  assert.deepEqual(ok(await post('/api/items/mp:525/send', { text, draftId: null })), goneSame(true), 'found');
  await writesAgain(525, 'Great, can I see it tomorrow?');
  assert.deepEqual(ok(await post('/api/items/mp:525/send', { text, draftId: null })), goneSame(true), 'after the buyer wrote');
  // The engine refuses other words (502): the note stays.
  standins.world.refuseSendOnce = new Set([525]);
  assert.equal((await post('/api/items/mp:525/send', { text: other, draftId: null })).status, 502);
  assert.deepEqual(ok(await post('/api/items/mp:525/send', { text, draftId: null })), goneSame(true), 'after the refusal');
  assert.equal(replies(525).length, 2, 'the first and the refused one');
  // The engine takes them: the note is over, and the reply that timed out is words like any other.
  assert.equal((await post('/api/items/mp:525/send', { text: other, draftId: null })).status, 200);
  assert.equal((await post('/api/items/mp:525/send', { text, draftId: null })).status, 200);
  assert.equal(replies(525).length, 4);
});

test('a 504 sets a fresh note in place of any', async () => {
  await buyer(526, 'Vera Invented');
  const first = 'Yes, it is still here.';
  const second = 'Yes, it is still here today. Come by any time after 10.';
  await timedOutAndShown(526, first);
  assert.deepEqual(ok(await post('/api/items/mp:526/send', { text: first, draftId: null })), goneSame(true));
  assert.deepEqual(ok(await post('/api/items/mp:526/send', { text: second, draftId: null })), goneSame(false), 'held once');
  // Pressed again, it goes and times out too: the note is now its own, held once again for other words.
  assert.equal((await timesOut(() => post('/api/items/mp:526/send', { text: second, draftId: null }))).status, 504);
  await until(async () => (await chat('mp:526')).thread.filter((e) => e.who === 'us').length === 2, 'both replies show');
  await sleep(800);
  assert.deepEqual(ok(await post('/api/items/mp:526/send', { text: 'See you then.', draftId: null })), goneSame(false), 'the fresh note holds other words once');
  assert.deepEqual(ok(await post('/api/items/mp:526/send', { text: second, draftId: null })), goneSame(true));
  assert.equal(replies(526).length, 2);
});

/** A POST whose body is sent only when finish() is called: the server has the request, and waits for its words. */
function postLater(p, body) {
  const data = JSON.stringify(body);
  const req = http.request(base + p, { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } });
  const answer = new Promise((resolve, reject) => {
    req.on('response', (res) => { let s = ''; res.on('data', (c) => { s += c; }); res.on('end', () => resolve({ status: res.statusCode, json: JSON.parse(s) })); });
    req.on('error', reject);
  });
  req.flushHeaders();
  return { finish: () => { req.end(data); return answer; } };
}

test('a send whose words arrive after another send on that chat went is checked against the chat as it is then', async () => {
  await buyer(527, 'Wim Invented');
  const text = 'Yes, it is still here.';
  standins.world.replyDelayMs = 300; // the engine takes its time, but answers in time
  const first = post('/api/items/mp:527/send', { text, draftId: null });
  await sleep(60);
  const second = postLater('/api/items/mp:527/send', { text, draftId: null });
  await sleep(60);
  assert.equal((await first).status, 200);
  assert.deepEqual(ok(await second.finish()), goneSame(true));
  assert.equal(replies(527).length, 1);
});

test('a reply the engine took that Wheelman could not record is noted, so the same words are refused from another page', async () => {
  // The engine answers with no record of the reply, and the chat cannot be read back after it.
  await buyer(528, 'Xia Invented');
  const text = 'Yes, it is still here.';
  standins.world.bareReplyOnce = new Set([528]);
  standins.world.detailFailOnce = new Set([528]);
  assert.equal((await post('/api/items/mp:528/send', { text, draftId: null })).status, 200);
  assert.equal((await chat('mp:528')).state, 'awaiting', 'not in Wheelman yet');
  assert.deepEqual(ok(await post('/api/items/mp:528/send', { text, draftId: null })), goneSame(true));
  assert.equal(replies(528).length, 1);
});

// ---- PR 5b, final review

test("a reply the engine took that its read of the chat does not list yet is noted, so the same words are refused", async () => {
  // The read just after the send answers the chat as it stood before the reply: Wheelman's copy
  // loses the reply it had just put in.
  await buyer(529, 'Yuki Invented');
  const text = 'Yes, it is still here.';
  standins.world.staleReadOnce = new Set([529]);
  assert.equal((await post('/api/items/mp:529/send', { text, draftId: null })).status, 200);
  assert.equal((await chat('mp:529')).state, 'awaiting', 'not in Wheelman yet');
  assert.deepEqual(ok(await post('/api/items/mp:529/send', { text, draftId: null })), goneSame(true));
  assert.equal(replies(529).length, 1);
});

test("the read before a send on a chat with a note fetches that chat's messages, whatever its summary says", async () => {
  // The read just after the send answers the chat's current summary with the messages from before
  // the reply: Wheelman's copy has the summary that a later list shows, without the reply.
  await buyer(531, 'Abe Invented');
  const text = 'Yes, it is still here.';
  standins.world.laggingReadOnce = new Set([531]);
  assert.equal((await post('/api/items/mp:531/send', { text, draftId: null })).status, 200);
  assert.equal((await chat('mp:531')).state, 'awaiting', 'not in Wheelman yet');
  // The send's own read first finds the reply in the chat: the same words are refused.
  assert.deepEqual(ok(await post('/api/items/mp:531/send', { text, draftId: null })), goneSame(true));
  assert.equal(replies(531).length, 1);

  // The page's read before a send ({ marketplace: true }) fetches it too: the chat then shows the reply.
  await buyer(532, 'Bea Invented');
  standins.world.laggingReadOnce = new Set([532]);
  assert.equal((await post('/api/items/mp:532/send', { text, draftId: null })).status, 200);
  assert.equal((await chat('mp:532')).state, 'awaiting', 'not in Wheelman yet');
  assert.equal((await post('/api/sync', { marketplace: true })).status, 200);
  assert.equal((await chat('mp:532')).state, 'answered');
  assert.deepEqual(ok(await post('/api/items/mp:532/send', { text, draftId: null })), goneSame(true));
  assert.equal(replies(532).length, 1);

  // An ordinary read still skips a chat whose summary has not changed.
  await buyer(533, 'Cai Invented');
  standins.world.laggingReadOnce = new Set([533]);
  assert.equal((await post('/api/items/mp:533/send', { text, draftId: null })).status, 200);
  const reads = () => standins.engineSeen.filter((r) => r.method === 'GET' && r.path === '/inbox/conversations/533').length;
  const was = reads();
  await (await import('../src/sync.js')).syncMarketplace();
  assert.equal(reads(), was);
});

test('a found note holds while its reply is in the chat, though the reply it came after did not reach the buyer', async () => {
  // Our first reply is on its way, so the chat ends with it; the second times out, and went.
  await buyer(530, 'Zola Invented');
  const first = 'Yes, it is still here.';
  const second = 'It has new tyres too.';
  assert.equal((await post('/api/items/mp:530/send', { text: first, draftId: null })).status, 200);
  assert.equal((await timesOut(() => post('/api/items/mp:530/send', { text: second, draftId: null }))).status, 504);
  await until(async () => (await chat('mp:530')).thread.filter((e) => e.who === 'us').length === 2, 'both replies show');
  await sleep(800); // the engine's late answer goes nowhere
  assert.deepEqual(ok(await post('/api/items/mp:530/send', { text: second, draftId: null })), goneSame(true), 'found');
  // The first fails and leaves the chat, then the buyer writes: the second is still there, and refused.
  await failsLater(530, first);
  await writesAgain(530, 'Great, can I see it tomorrow?');
  assert.deepEqual(ok(await post('/api/items/mp:530/send', { text: second, draftId: null })), goneSame(true));
  assert.equal(replies(530).length, 2);
});
