// Send on Facebook: every send that is not the first press on a fresh suggestion (Try again, Send it
// again, and any send on a chat with a send not confirmed since, a Copy since too) has Wheelman read
// Marketplace first (POST /api/sync, Marketplace only), then the chat, and posts only when its reply
// is not in the chat already. And a reply that did not reach the buyer says so on its row. The store
// with a fake server. Invented data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { sendFailedWords, sendFor, sendOutcome, sameText } from '../web/new/js/channel.js';
import { sectionRowView } from '../web/new/js/sections.js';
import { boxViewOf, sectionBox } from '../web/new/js/boxsections.js';
import { NOT_RESPONDING, createApi } from '../web/new/js/api.js';
import { clock } from '../web/lib/format.js';
import { draft, paths } from './support/newpage-fakes.js';
import { AT, FB, SENT, ASKED, TYPING, OFFLINE, fb, sends, takes, failure, mainNow, sentWith } from './support/newpage-send-fakes.js';

const source = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const TEXT = 'The price is $28,900. Would you like to see it?';
// Waiting in the thread, its suggestion sent from here, and the engine saying a reply failed.
const UNDELIVERED = { ...FB, draft: draft(21, { reply: TEXT, sentHereAt: AT }), marketplace: { ...FB.marketplace, failed: 1, unsent: 1 } };
const TIMED_OUT = 'The Marketplace system did not answer in time, so the reply may have gone.';
const ENGINE_DOWN = 'The content engine could not be reached (timed out).';
const CHECK = 'POST /api/sync';
const syncs = (a) => a.calls.filter((c) => c.path === '/api/sync');
/** Marketplace's read brings this chat in (the engine had the reply). */
const engineHas = (a, item) => { a.data.on = { ...a.data.on, '/api/sync': () => { a.data.items['mp:1'] = item; return {}; } }; };

test('Send it again after its own unknown outcome reads Marketplace first, and posts nothing once the engine has it', async () => {
  const a = fb(UNDELIVERED);
  a.data.on = { '/api/items/mp:1/send': () => { throw failure(TIMED_OUT, 504); } };
  await a.store.actions.open('mp:1');
  assert.equal(await a.store.actions.send({ again: true }), 'failed');
  assert.equal(a.store.get().sending['mp:1'].outcome, 'unknown');
  // Pressed again: Marketplace is read first, and the chat now shows the reply, so nothing is posted.
  engineHas(a, sentWith(TEXT));
  a.calls.length = 0;
  assert.equal(await a.store.actions.send({ again: true }), 'replied');
  assert.deepEqual(paths(a.calls).slice(0, 2), [CHECK, 'GET /api/items/mp:1']);
  assert.deepEqual(syncs(a).map((c) => c.body), [{ marketplace: true }], 'Marketplace only');
  assert.equal(sends(a).length, 0, 'no second copy');
  assert.deepEqual(a.store.get().sending, {});
  assert.deepEqual(a.store.get().unconfirmed, {});
  // The engine did not have it: read first, then it goes, once.
  const b = fb(UNDELIVERED);
  b.data.on = { '/api/items/mp:1/send': () => { throw failure(TIMED_OUT, 504); } };
  await b.store.actions.open('mp:1');
  await b.store.actions.send({ again: true });
  takes(b);
  b.calls.length = 0;
  assert.equal(await b.store.actions.send({ again: true }), 'sent');
  assert.deepEqual(paths(b.calls).slice(0, 3), [CHECK, 'GET /api/items/mp:1', 'POST /api/items/mp:1/send']);
  assert.equal(sends(b).length, 1);
});

test('the first Send it again reads Marketplace first too', async () => {
  // An older auto-reply failed, and this reply went while Wheelman's own record of it did not: the
  // chat reads "did not reach the buyer". Marketplace's read shows the reply, so nothing is posted.
  const a = fb(UNDELIVERED);
  await a.store.actions.open('mp:1');
  engineHas(a, sentWith(TEXT));
  a.calls.length = 0;
  assert.equal(await a.store.actions.send({ again: true }), 'replied');
  assert.deepEqual(paths(a.calls).slice(0, 2), [CHECK, 'GET /api/items/mp:1']);
  assert.equal(sends(a).length, 0, 'never a second copy');
  // Not in the chat: read first, then sent once.
  const b = fb(UNDELIVERED);
  await b.store.actions.open('mp:1');
  takes(b);
  b.calls.length = 0;
  assert.equal(await b.store.actions.send({ again: true }), 'sent');
  assert.deepEqual(paths(b.calls).slice(0, 3), [CHECK, 'GET /api/items/mp:1', 'POST /api/items/mp:1/send']);
});

test('a Copy after a failed or unconfirmed send does not spare the next send its read of Marketplace', async () => {
  const typed = 'Yes, it is still here.';
  // Could not be told, then copied (the row says Copied) and put back: Send reads Marketplace first.
  const a = fb();
  a.data.on = { '/api/items/mp:1/send': () => { throw failure(NOT_RESPONDING); } };
  await a.store.actions.open('mp:1');
  a.store.actions.type(typed);
  assert.equal(await a.store.actions.send(), 'failed');
  await a.store.actions.copy({});
  assert.deepEqual(a.store.get().sending, {}, 'the failure the box showed is over');
  a.store.actions.putBack();
  assert.equal(mainNow(a.store.get()).label, 'Send on Facebook');
  // The reply had gone after all: the read shows it, and nothing is posted.
  engineHas(a, sentWith(typed));
  a.calls.length = 0;
  assert.equal(await a.store.actions.send(), 'replied');
  assert.deepEqual(paths(a.calls).slice(0, 2), [CHECK, 'GET /api/items/mp:1']);
  assert.equal(sends(a).length, 0);
  // Refused, then copied and put back: the next Send reads first too, and goes.
  const b = fb();
  b.data.on = { '/api/items/mp:1/send': () => { throw failure(OFFLINE, 502); } };
  await b.store.actions.open('mp:1');
  b.store.actions.type(typed);
  await b.store.actions.send();
  await b.store.actions.copy({});
  b.store.actions.putBack();
  takes(b);
  b.calls.length = 0;
  assert.equal(await b.store.actions.send(), 'sent');
  assert.deepEqual(paths(b.calls).slice(0, 3), [CHECK, 'GET /api/items/mp:1', 'POST /api/items/mp:1/send']);
  assert.deepEqual(b.store.get().unconfirmed, {}, 'confirmed: nothing is left to read first');
  // The first press on a fresh suggestion posts at once.
  const c = fb();
  takes(c);
  await c.store.actions.open('mp:1');
  c.store.actions.type(typed);
  c.calls.length = 0;
  assert.equal(await c.store.actions.send(), 'sent');
  assert.equal(paths(c.calls)[0], 'POST /api/items/mp:1/send');
  assert.equal(syncs(c).length, 0);
});

test('a send that cannot read Marketplace first posts nothing, and says why', async () => {
  const a = fb();
  a.data.on = { '/api/items/mp:1/send': () => { throw failure(NOT_RESPONDING); } };
  await a.store.actions.open('mp:1');
  a.store.actions.type(TEXT);
  await a.store.actions.send();
  a.data.on['/api/sync'] = () => { throw failure(ENGINE_DOWN, 502); };
  a.calls.length = 0;
  assert.equal(await a.store.actions.send(), 'failed');
  assert.deepEqual(paths(a.calls), [CHECK], 'nothing posted, and the chat as it was');
  let s = a.store.get();
  assert.equal(sendFailedWords(s.sending['mp:1'].error, s.sending['mp:1'].outcome),
    'Wheelman could not tell whether this reply went. The Marketplace chat could not be read first. ' + ENGINE_DOWN);
  assert.equal(s.typed, TEXT);
  assert.equal(mainNow(s).label, 'Try again');
  // After a Copy too: nothing is posted, and the failure is said against the chat on screen.
  await a.store.actions.copy({});
  a.store.actions.putBack();
  assert.equal(await a.store.actions.send(), 'failed');
  s = a.store.get();
  assert.ok(sendFor(s.item, s.sending[s.key]), 'said in the box');
  assert.equal(sends(a).length, 0, 'nothing posted since the first');
  // A refused send whose next read fails: "Not sent", the text kept. Out of sight, a toast says it.
  let onScreen = true;
  const b = fb({}, () => onScreen);
  b.data.on = { '/api/items/mp:1/send': () => { throw failure(OFFLINE, 502); } };
  await b.store.actions.open('mp:1');
  b.store.actions.type(TEXT);
  await b.store.actions.send();
  b.data.on['/api/sync'] = () => { onScreen = false; throw failure(ENGINE_DOWN, 502); };
  assert.equal(await b.store.actions.send(), 'failed');
  s = b.store.get();
  assert.equal(sendFailedWords(s.sending['mp:1'].error, s.sending['mp:1'].outcome),
    'Not sent. The Marketplace chat could not be read first. ' + ENGINE_DOWN + ' Your text is still in the box.');
  assert.equal(s.toast.message, 'Not sent to Liam Invented. The Marketplace chat could not be read first. ' + ENGINE_DOWN);
  assert.equal(s.toast.action.label, 'Open');
  assert.equal(sends(b).length, 1);
  // After a 409 too, the reason the read failed is what is said.
  const c = fb();
  c.data.on = { '/api/items/mp:1/send': () => { throw failure('This reply is already on its way.', 409); } };
  await c.store.actions.open('mp:1');
  c.store.actions.type(TEXT);
  await c.store.actions.send();
  c.data.on['/api/sync'] = () => { throw failure(ENGINE_DOWN, 502); };
  assert.equal(await c.store.actions.send(), 'failed');
  s = c.store.get();
  assert.match(sendFailedWords(s.sending['mp:1'].error, s.sending['mp:1'].outcome), /^Not sent\. The Marketplace chat could not be read first\./);
  assert.equal(sends(c).length, 1);
  // Marketplace can be read again: it goes.
  onScreen = true;
  delete a.data.on['/api/sync'];
  takes(a);
  assert.equal(await a.store.actions.send(), 'sent');
  assert.equal(sends(a).length, 1, 'once, since the first');
});

test('a reply that did not reach the buyer says Not delivered on its row', async () => {
  const row = { key: 'mp:1', anchor: 'fm:1', name: 'Liam Invented', unread: 0, state: 'awaiting', preview: { who: 'customer', text: 'Hi' } };
  const undelivered = { anchor: 'fm:1', outcome: 'undelivered' };
  const view = (r, o) => sectionRowView(r, { now: AT, ...o }, 'marketplace');
  assert.deepEqual([view(row, { unconfirmed: undelivered }).reason, view(row, { unconfirmed: undelivered }).tone], ['Not delivered', 'bad']);
  // Not once the buyer wrote again, the chat is answered, or a reply was copied to go by hand.
  assert.equal(view({ ...row, anchor: 'fm:3' }, { unconfirmed: undelivered }).reason, '');
  assert.notEqual(view({ ...row, state: 'answered', answered: { how: 'wheelman', by: '', at: AT } }, { unconfirmed: undelivered }).reason, 'Not delivered');
  assert.equal(view(row, { unconfirmed: undelivered, doneAnchor: 'fm:1' }).reason, 'Copied');
  // A send not confirmed is said by its own failure while it stands; a send that did not go says so first.
  assert.equal(view(row, { unconfirmed: { anchor: 'fm:1', outcome: 'unknown' } }).reason, '');
  assert.equal(view(row, { unconfirmed: undelivered, sending: { state: 'failed', error: 'x', outcome: 'refused', anchor: 'fm:1', text: 'x' } }).reason, 'Not sent');

  // Through the store: a send the engine took but could not deliver.
  const a = fb();
  a.data.on = { '/api/items/mp:1/send': () => { a.data.items['mp:1'] = UNDELIVERED; return { ok: true, queued: false, item: UNDELIVERED }; } };
  await a.store.actions.open('mp:1');
  a.store.actions.type(TEXT);
  assert.equal(await a.store.actions.send(), 'sent');
  const rowNow = () => { const s = a.store.get(); return view(row, { doneAnchor: s.done['mp:1'], sending: s.sending['mp:1'], unconfirmed: s.unconfirmed['mp:1'] }); };
  assert.deepEqual([rowNow().reason, rowNow().tone], ['Not delivered', 'bad']);
  // Send it again, read first and sent: the row is as before.
  takes(a);
  a.calls.length = 0;
  assert.equal(await a.store.actions.send({ again: true }), 'sent');
  assert.equal(paths(a.calls)[0], CHECK);
  assert.equal(rowNow().reason, '');
  // Opened later (after a reload, say): the chat as the server has it is noted, so its row says it too.
  const b = fb(UNDELIVERED);
  await b.store.actions.open('mp:1');
  assert.deepEqual(b.store.get().unconfirmed['mp:1'], undelivered);
  assert.match(source('../web/new/js/ui/list.js'), /sectionRowView\(r, \{ now, doneAnchor: state\.done\[r\.key\], sending: state\.sending\[r\.key\], unconfirmed: state\.unconfirmed\[r\.key\] \}, section\)/);
});

// ---- the final fix wave

const GONE = 'This reply has gone already.';
/** The server's 409 for a reply that had gone: same says whether the words sent are the ones that went. */
const gone = (same = true) => Object.assign(failure(GONE, 409), { gone: true, same });

test('a 409 that says the reply has gone already shows it sent, and nothing more is posted', async () => {
  // The page's api carries the server's word, and a send reads it as its own outcome.
  const api = (same) => createApi({ fetch: async () => ({ status: 409, ok: false, json: async () => ({ error: GONE, gone: true, same }) }), go: () => {} });
  await assert.rejects(api(true)('/api/items/mp:1/send', {}), (e) => e.status === 409 && e.gone === true && e.same === true && e.message === GONE);
  await assert.rejects(api(false)('/api/items/mp:1/send', {}), (e) => e.status === 409 && e.gone === true && e.same === false);
  assert.equal(sendOutcome(gone()), 'gone');
  assert.equal(sendOutcome(failure('This reply is already on its way.', 409)), 'elsewhere');
  // A fresh page (nothing in memory) presses Send on a chat whose earlier reply timed out: the
  // server read Marketplace, found that reply, and answered 409.
  const typed = 'Yes, it is still here.';
  const a = fb();
  a.data.on = { '/api/items/mp:1/send': () => { a.data.items['mp:1'] = { ...SENT, thread: [ASKED, { key: 'fm:2', who: 'us', text: typed, sending: true }] }; throw gone(); } };
  await a.store.actions.open('mp:1');
  a.store.actions.type(typed);
  assert.equal(await a.store.actions.send(), 'replied');
  const s = a.store.get();
  assert.equal(sends(a).length, 1, 'the one press, answered 409');
  assert.deepEqual([s.sending, s.unconfirmed, s.typed], [{}, {}, null]);
  assert.equal(s.item.state, 'answered', 'the chat as it is now');
  assert.equal(s.toast.message, GONE);
  assert.equal(boxViewOf(s, AT).sentence, TYPING);
  // Out of sight, the toast names the buyer.
  let onScreen = true;
  const b = fb({}, () => onScreen);
  b.data.on = { '/api/items/mp:1/send': () => { onScreen = false; b.data.items['mp:1'] = SENT; throw gone(); } };
  await b.store.actions.open('mp:1');
  b.store.actions.type(typed);
  assert.equal(await b.store.actions.send(), 'replied');
  assert.equal(b.store.get().toast.message, 'The reply to Liam Invented has gone already.');
});

test('a 409 after a timed-out send keeps a different reply in the box', async () => {
  const went = 'Yes, it is still here.';
  const other = 'Yes, it is still here today. Come by any time after 10.';
  // The chat as the server has it after its check: answered by the reply that timed out.
  const answeredBy = { ...SENT, thread: [ASKED, { key: 'fm:2', who: 'us', text: went, sending: true }] };
  const a = fb();
  a.data.on = { '/api/items/mp:1/send': () => { a.data.items['mp:1'] = answeredBy; throw gone(false); } };
  await a.store.actions.open('mp:1');
  a.store.actions.type(other);
  assert.equal(await a.store.actions.send(), 'replied');
  let s = a.store.get();
  assert.equal(s.typed, other, 'his words stay');
  assert.equal(s.toast.message, GONE);
  assert.deepEqual([s.sending, s.unconfirmed], [{}, {}]);
  assert.equal(s.item.state, 'answered', 'the chat as it is now');
  // The box shows the sent state above his text, and its button sends it.
  const view = boxViewOf(s, AT);
  assert.deepEqual([view.kind, view.context, view.elsewhere], ['editor', 'Sent on Facebook at ' + clock(AT) + '. Your text is kept.', true]);
  assert.equal(mainNow(s).label, 'Send on Facebook');
  takes(a);
  assert.equal(await a.store.actions.send(), 'sent');
  assert.deepEqual(sends(a).map((c) => c.body.text), [other, other], 'the 409, then his reply');
  assert.equal(a.store.get().typed, null);
  // A suggestion in the box with other words than the reply that went stays too.
  const b = fb({ draft: draft(22, { reply: other }) });
  b.data.on = { '/api/items/mp:1/send': () => { b.data.items['mp:1'] = answeredBy; throw gone(false); } };
  await b.store.actions.open('mp:1');
  assert.equal(await b.store.actions.send(), 'replied');
  assert.equal(b.store.get().typed, other);
  assert.equal(boxViewOf(b.store.get(), AT).kind, 'editor');
  // The chat cannot be read after the 409: his words stay, and his next press reads Marketplace first.
  const c = fb();
  c.data.on = { '/api/items/mp:1/send': () => { c.data.fail.add('/api/items/mp:1'); throw gone(false); } };
  await c.store.actions.open('mp:1');
  c.store.actions.type(other);
  assert.equal(await c.store.actions.send(), 'replied');
  s = c.store.get();
  assert.equal(s.typed, other);
  assert.ok(s.unconfirmed['mp:1'], 'read first next time');
  // The words of the reply in the chat are not offered again: the box is the sent state. (The text
  // that went leaves the box after a 409, as the test above shows.)
  assert.equal(sectionBox({ item: answeredBy, typed: true, typedText: went, now: AT }).kind, 'quiet');
  assert.equal(sectionBox({ item: answeredBy, typed: true, typedText: other, now: AT }).kind, 'editor');
});

test('a 409 clears the box only when the server says these words are the ones that went', async () => {
  // The server compares the words on its own tagged text: the box's link carries utm_source=facebook,
  // which the server tags utm_source=marketplace, and the page's own comparison says they differ.
  const link = 'https://www.carbarn.com.au/vehicles/1159';
  const typed = 'Here it is: ' + link + '?utm_source=facebook';
  const inChat = 'Here it is: ' + link + '?utm_source=marketplace';
  assert.equal(sameText(typed, inChat), false, 'the page alone cannot tell');
  const a = fb();
  a.data.on = { '/api/items/mp:1/send': () => { a.data.items['mp:1'] = sentWith(inChat); throw gone(true); } };
  await a.store.actions.open('mp:1');
  a.store.actions.type(typed);
  assert.equal(await a.store.actions.send(), 'replied');
  assert.deepEqual([a.store.get().typed, a.store.get().sending], [null, {}]);
  // The server says these are other words: they stay, even where the thread shows the box's very words.
  const other = 'Yes, it is still here today. Come by any time after 10.';
  const b = fb();
  b.data.on = { '/api/items/mp:1/send': () => { b.data.items['mp:1'] = sentWith(other); throw gone(false); } };
  await b.store.actions.open('mp:1');
  b.store.actions.type(other);
  assert.equal(await b.store.actions.send(), 'replied');
  assert.equal(b.store.get().typed, other);
});
