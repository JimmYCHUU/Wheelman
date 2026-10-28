// Send on Facebook after the engine took the reply: one it could not deliver (never "Sent"; Send it
// again reads the chat first and posts once), a success answered with no chat, a reply's words looked
// for only after the message they answered, and a failed send's row. The store with a fake server.
// Invented data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { sentSince } from '../web/new/js/channel.js';
import { boxViewOf, sectionBox, deliveryFailed } from '../web/new/js/boxsections.js';
import { sectionRowView } from '../web/new/js/sections.js';
import { clock } from '../web/lib/format.js';
import { draft, settle, paths, setup } from './support/newpage-fakes.js';
import { AT, DAY, FB, SENT, TYPING, OFFLINE, fb, sends, takes, failure, mainNow, sentWith } from './support/newpage-send-fakes.js';

const BOX = fs.readFileSync(new URL('../web/new/js/ui/messagebox.js', import.meta.url), 'utf8');
const TEXT = 'The price is $28,900. Would you like to see it?';
// Waiting in the thread, its suggestion sent from here (sentHereAt), and the engine saying a reply
// failed to reach the buyer: its failed outbound is not in the thread, it is counted.
const UNDELIVERED = { ...FB, draft: draft(21, { reply: TEXT, sentHereAt: AT }), marketplace: { ...FB.marketplace, failed: 1, unsent: 1 } };
const AGAIN = { label: 'Send it again', act: 'resend', main: true };

test('a reply the engine took but could not deliver says so, never Sent, and Send it again posts once', async () => {
  // Nothing says a reply failed: sent from here, waiting for the chat to show it.
  const fine = { ...UNDELIVERED, marketplace: { ...FB.marketplace, failed: 0 } };
  assert.equal(sectionBox({ item: fine, now: AT + 60e3 }).sentence, 'Sent on Facebook at ' + clock(AT) + '.');
  assert.equal(deliveryFailed(fine), false);
  // A reply failed: it did not reach the buyer, in red, with Send it again.
  assert.equal(deliveryFailed(UNDELIVERED), true);
  assert.deepEqual(sectionBox({ item: UNDELIVERED, now: AT + 60e3 }), { kind: 'quiet', tone: 'bad', sentence: 'The reply sent at ' + clock(AT) + ' did not reach the buyer.', button: AGAIN, tell: true,
    suggestion: TEXT, suggestionLabel: 'The reply that did not reach the buyer', copy: true });
  assert.equal(sectionBox({ item: UNDELIVERED, now: AT + DAY }).sentence, 'The reply sent yesterday did not reach the buyer.');
  assert.equal(sectionBox({ item: UNDELIVERED, writing: true }).kind, 'writing');
  // A newer suggestion for the same message (Write a reply anyway) is the editor, as any suggestion is.
  assert.equal(sectionBox({ item: { ...UNDELIVERED, draft: draft(22, { reply: 'Hello Liam.' }) }, now: AT }).kind, 'editor');

  const a = fb(UNDELIVERED);
  await a.store.actions.open('mp:1');
  // A plain Send is never taken for a suggestion sent from here.
  assert.equal(await a.store.actions.send(), null);
  assert.equal(sends(a).length, 0);
  // Send it again: Marketplace and the chat are read first, then that suggestion's text goes, once.
  let answer = null;
  a.data.on = { '/api/items/mp:1/send': () => new Promise((r) => { answer = () => { a.data.items['mp:1'] = SENT; r({ ok: true, queued: false, item: SENT }); }; }) };
  a.calls.length = 0;
  const going = a.store.actions.send({ again: true });
  assert.equal(await a.store.actions.send({ again: true }), null, 'a second press while it goes');
  await settle();
  answer();
  assert.equal(await going, 'sent');
  assert.deepEqual(paths(a.calls).slice(0, 3), ['POST /api/sync', 'GET /api/items/mp:1', 'POST /api/items/mp:1/send']);
  assert.deepEqual(sends(a).map((c) => c.body), [{ text: TEXT, draftId: 21 }]);
  assert.equal(boxViewOf(a.store.get(), AT).sentence, TYPING);

  // The reply shows in the chat after all by the time it is pressed: nothing is posted.
  const b = fb(UNDELIVERED);
  await b.store.actions.open('mp:1');
  b.data.items['mp:1'] = sentWith(TEXT);
  assert.equal(await b.store.actions.send({ again: true }), 'replied');
  assert.equal(sends(b).length, 0);
  // Only for a reply that did not reach the buyer.
  const c = fb(fine);
  await c.store.actions.open('mp:1');
  assert.equal(await c.store.actions.send({ again: true }), null);
  assert.equal(sends(c).length, 0);
  // The message box presses it from the quiet line, says Sending… while it goes, and says why if it fails.
  assert.match(BOX, /resend: \(\) => actions\.send\(\{ again: true \}\)/);
  assert.match(BOX, /resending \? html`<button type="button" class="btn main" disabled>Sending…<\/button>`/);
  assert.match(BOX, /resendFailed \? html`<div class="context bad" role="alert">/);
});

test('a send the engine took that fails to deliver at once does not say Sent', async () => {
  const a = fb();
  a.data.on = { '/api/items/mp:1/send': () => { a.data.items['mp:1'] = UNDELIVERED; return { ok: true, queued: false, item: UNDELIVERED }; } };
  await a.store.actions.open('mp:1');
  a.store.actions.type(TEXT);
  assert.equal(await a.store.actions.send(), 'sent');
  assert.equal(a.store.get().toast, null, 'the box says it did not reach the buyer');
  assert.equal(boxViewOf(a.store.get(), AT + 60e3).tone, 'bad');
  // Out of sight, the toast says so with Open.
  let onScreen = true;
  const b = fb({}, () => onScreen);
  b.data.on = { '/api/items/mp:1/send': () => { onScreen = false; b.data.items['mp:1'] = UNDELIVERED; return { ok: true, queued: false, item: UNDELIVERED }; } };
  await b.store.actions.open('mp:1');
  b.store.actions.type(TEXT);
  await b.store.actions.send();
  assert.equal(b.store.get().toast.message, 'The reply to Liam Invented did not reach the buyer.');
  assert.equal(b.store.get().toast.action.label, 'Open');
});

test('a send answered with no chat marks the suggestion sent here until a chat is taken', async () => {
  const a = fb();
  a.data.on = { '/api/items/mp:1/send': () => ({ ok: true, queued: false, item: null }) };
  await a.store.actions.open('mp:1');
  a.store.actions.type(TEXT);
  a.data.fail.add('/api/items?'); // the refresh after it fails too, so only the mark tells
  assert.equal(await a.store.actions.send(), 'sent');
  let s = a.store.get();
  assert.equal(s.typed, null);
  assert.equal(s.item.draft.sentHereAt, 1000, "the store's clock");
  assert.equal(boxViewOf(s, 2000).sentence, 'Sent on Facebook at ' + clock(1000) + '.');
  assert.equal(await a.store.actions.send(), null, 'Send on Facebook is not offered again');
  assert.equal(sends(a).length, 1);
  // The next chat taken stands in its place.
  a.data.fail.delete('/api/items?');
  a.data.items['mp:1'] = SENT;
  await a.store.actions.refresh();
  s = a.store.get();
  assert.equal(s.item.state, 'answered');
  assert.equal(boxViewOf(s, AT).sentence, TYPING);
});

test("a reply's words are looked for only after the message it answered", async () => {
  const typed = 'Yes, it is still here.';
  // An older reply with the same words, before the message this one answers, is not it.
  const older = { ...FB, anchor: 'fm:3', thread: [{ key: 'fm:1', who: 'customer', text: 'Is it still here?' }, { key: 'fm:2', who: 'us', text: typed }, { key: 'fm:3', who: 'customer', text: 'And now?' }] };
  assert.equal(sentSince(older, 'fm:3', typed), false);
  // With the message it answered not in the thread shown, nothing counts.
  assert.equal(sentSince({ ...older, thread: older.thread.slice(1) }, 'fm:1', typed), false);
  assert.equal(sentSince(older, 'fm:9', typed), false);
  assert.equal(sentSince(sentWith(typed), 'fm:1', typed), true);
  // So the read before a send never swallows a new reply with the same words as an old one.
  const a = fb(older);
  a.data.on = { '/api/items/mp:1/send': () => { throw failure('Wheelman is not responding. Check that it is running.'); } };
  await a.store.actions.open('mp:1');
  a.store.actions.type(typed);
  assert.equal(await a.store.actions.send(), 'failed');
  takes(a);
  assert.equal(await a.store.actions.send(), 'sent');
  assert.equal(sends(a).length, 2);
});

test('a failed send is Not sent on its row when refused, Not confirmed when its outcome is unknown, and Copy ends it', async () => {
  const row = { key: 'mp:1', anchor: 'fm:1', name: 'Liam Invented', unread: 0, state: 'awaiting', preview: { who: 'customer', text: 'Hi' } };
  const as = (outcome) => sectionRowView(row, { now: AT, sending: { state: 'failed', error: 'x', outcome, anchor: 'fm:1', text: 'x' } }, 'marketplace');
  assert.deepEqual([as('refused').reason, as('refused').tone], ['Not sent', 'bad']);
  assert.deepEqual([as('elsewhere').reason, as('elsewhere').tone], ['Not sent', 'bad']);
  assert.deepEqual([as('unknown').reason, as('unknown').tone], ['Not confirmed', 'warn']);
  // Copy after a failed send: Jim is sending it by hand, so the failure ends and the row says Copied.
  const a = fb();
  a.data.on = { '/api/items/mp:1/send': () => { throw failure(OFFLINE, 502); } };
  await a.store.actions.open('mp:1');
  a.store.actions.type(TEXT);
  await a.store.actions.send();
  assert.equal(mainNow(a.store.get()).label, 'Try again');
  await a.store.actions.copy({});
  const s = a.store.get();
  assert.deepEqual(s.sending, {});
  const copied = sectionRowView(row, { now: AT, doneAnchor: s.done['mp:1'], sending: s.sending['mp:1'] }, 'marketplace');
  assert.deepEqual([copied.reason, copied.tone], ['Copied', '']);
  assert.match(boxViewOf(s, AT).sentence, /^Copied at /);
});

// ---- the final fix wave

test('a reply that did not reach the buyer is shown with a quiet Copy, and once copied the box says Copied as its row does', async () => {
  const view = sectionBox({ item: UNDELIVERED, now: AT + 60e3 });
  assert.deepEqual([view.suggestion, view.suggestionLabel, view.copy], [TEXT, 'The reply that did not reach the buyer', true]);
  // The message box shows it as a ghost line with that label, and a quiet Copy beside Send it again.
  assert.match(BOX, /<span class="ghost-label">\$\{view\.suggestionLabel \|\| 'The suggestion that was here'\}<\/span>/);
  assert.match(BOX, /view\.copy && !resending \? html`<button type="button" class="btn quiet" onClick=\$\{\(\) => actions\.copy\(\{\}\)\}>Copy<\/button>`/);
  // Copied: the text Send it again would send, with nothing of it told to the server.
  const a = fb(UNDELIVERED);
  await a.store.actions.open('mp:1');
  await a.store.actions.copy({});
  assert.deepEqual(a.written, [TEXT]);
  assert.deepEqual(a.calls.find((c) => c.path === '/api/drafts/21/copied').body, { text: '' });
  // The box follows the row: Copied, with Put back.
  const row = { key: 'mp:1', anchor: 'fm:1', name: 'Liam Invented', unread: 0, state: 'awaiting', preview: { who: 'customer', text: 'Hi' } };
  let s = a.store.get();
  assert.equal(sectionRowView(row, { now: AT, doneAnchor: s.done['mp:1'], sending: s.sending['mp:1'], unconfirmed: s.unconfirmed['mp:1'] }, 'marketplace').reason, 'Copied');
  assert.match(boxViewOf(s, AT).sentence, /^Copied at /);
  // Put back: it did not reach the buyer, with Send it again, as before.
  a.store.actions.putBack();
  s = a.store.get();
  assert.equal(boxViewOf(s, AT).button.label, 'Send it again');
});

test('a reply sent from here that the chat still does not show after ten minutes says Wheelman cannot see it yet', async () => {
  const a = setup({}, { now: () => AT });
  a.data.items['mp:1'] = { ...FB };
  a.data.on = { '/api/items/mp:1/send': () => ({ ok: true, queued: false, item: null }) };
  await a.store.actions.open('mp:1');
  a.store.actions.type(TEXT);
  a.data.fail.add('/api/items?'); // the refresh after it fails too, so the suggestion keeps the store's mark
  assert.equal(await a.store.actions.send(), 'sent');
  const s = a.store.get();
  assert.equal(s.item.draft.sentHereAt, AT, "the store's clock");
  const said = (now) => { const v = boxViewOf(s, now); return [v.tone, v.sentence]; };
  assert.deepEqual(said(AT + 9 * 60e3), ['good', 'Sent on Facebook at ' + clock(AT) + '.']);
  assert.deepEqual(said(AT + 10 * 60e3), ['', 'Sent on Facebook at ' + clock(AT) + '. Wheelman cannot see this reply in the chat yet.']);
  // Once the chat shows it, it is green, however long ago.
  assert.equal(sectionBox({ item: SENT, now: AT + DAY }).tone, 'good');
});
