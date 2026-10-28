// Send on Facebook when a send fails: a 409 from another page, an outcome Wheelman could not tell,
// a refusal after the buyer wrote again, a failure once another chat is open, and the box locked
// while its reply is on its way. Try again never sends a second reply. The store with a fake server.
// Invented data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { sendFailedWords, sendFailedAwayWords, sendFor, sendingNow, sendOutcome, sentSince } from '../web/new/js/channel.js';
import { boxViewOf } from '../web/new/js/boxsections.js';
import { sectionRowView } from '../web/new/js/sections.js';
import { createApi, NOT_RESPONDING } from '../web/new/js/api.js';
import { boxText } from '../web/new/js/model.js';
import { clock } from '../web/lib/format.js';
import { settle, paths } from './support/newpage-fakes.js';
import { AT, FB, SENT, TYPING, OFFLINE, ASKED, fb, sends, takes, failure, mainNow, sentWith } from './support/newpage-send-fakes.js';

const BOX = fs.readFileSync(new URL('../web/new/js/ui/messagebox.js', import.meta.url), 'utf8');
const source = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');

test('a 409 says another page is sending, and Try again posts nothing once that reply has gone', async () => {
  const a = fb();
  a.data.on = { '/api/items/mp:1/send': () => { throw failure('This reply is already on its way.', 409); } };
  await a.store.actions.open('mp:1');
  a.store.actions.type('Yes, it is still here.');
  assert.equal(await a.store.actions.send(), 'failed');
  let s = a.store.get();
  assert.deepEqual(s.sending, { 'mp:1': { state: 'failed', error: 'This reply is already on its way.', outcome: 'elsewhere', anchor: 'fm:1', text: 'Yes, it is still here.' } });
  assert.equal(sendFailedWords(s.sending['mp:1'].error, 'elsewhere'), 'Not sent from here: another page is sending a reply to this chat.');
  assert.equal(s.toast, null, 'the chat is open: the box says it');
  assert.equal(mainNow(s).label, 'Try again');
  // The other page's reply goes: the chat is answered. Try again reads the chat first, and posts nothing.
  a.data.items['mp:1'] = SENT;
  a.calls.length = 0;
  assert.equal(await a.store.actions.send(), 'replied');
  assert.equal(paths(a.calls)[0], 'GET /api/items/mp:1', 'the chat is read before anything is posted');
  assert.equal(sends(a).length, 0, 'no second reply');
  s = a.store.get();
  assert.deepEqual(s.sending, {});
  assert.equal(s.item.state, 'answered');
  assert.equal(boxViewOf(s, AT).sentence, TYPING);
  // The other page still sending when Try again is pressed: the chat is as it was, so it is posted (the server says 409 again).
  const b = fb();
  b.data.on = { '/api/items/mp:1/send': () => { throw failure('This reply is already on its way.', 409); } };
  await b.store.actions.open('mp:1');
  b.store.actions.type('Yes, it is still here.');
  await b.store.actions.send();
  b.calls.length = 0;
  assert.equal(await b.store.actions.send(), 'failed');
  assert.deepEqual(paths(b.calls).slice(0, 2), ['GET /api/items/mp:1', 'POST /api/items/mp:1/send']);
});

test('an unknown outcome where the chat shows the reply on the re-read says Sent, not Not sent', async () => {
  // The server took the send, and its answer never came back: the chat shows our message with the text.
  const a = fb();
  a.data.on = { '/api/items/mp:1/send': () => { a.data.items['mp:1'] = sentWith('Yes, it is still here.'); throw failure(NOT_RESPONDING); } };
  await a.store.actions.open('mp:1');
  a.store.actions.type('Yes, it is still here.');
  assert.equal(await a.store.actions.send(), 'sent');
  let s = a.store.get();
  assert.deepEqual(s.sending, {});
  assert.equal(s.typed, null, 'the text went with the reply');
  assert.equal(s.toast.message, 'Sent. It is on its way to the buyer.');
  assert.equal(boxViewOf(s, AT).sentence, TYPING);
  assert.equal(sends(a).length, 1);

  // No reply on the re-read: it says it could not tell, and Try again reads the chat again before it posts.
  const b = fb();
  b.data.on = { '/api/items/mp:1/send': () => { throw failure(NOT_RESPONDING); } };
  await b.store.actions.open('mp:1');
  b.store.actions.type('Yes, it is still here.');
  assert.equal(await b.store.actions.send(), 'failed');
  s = b.store.get();
  assert.equal(s.sending['mp:1'].outcome, 'unknown');
  assert.equal(sendFailedWords(s.sending['mp:1'].error, 'unknown'), 'Wheelman could not tell whether this reply went. Wheelman is not responding. Check that it is running.');
  takes(b);
  b.calls.length = 0;
  assert.equal(await b.store.actions.send(), 'sent');
  assert.deepEqual(paths(b.calls).slice(0, 3), ['POST /api/sync', 'GET /api/items/mp:1', 'POST /api/items/mp:1/send'], 'Marketplace read again, then the chat, then the send');

  // The chat cannot be read before Try again: nothing is posted.
  const c = fb();
  c.data.on = { '/api/items/mp:1/send': () => { throw failure(NOT_RESPONDING); } };
  await c.store.actions.open('mp:1');
  c.store.actions.type('Yes, it is still here.');
  await c.store.actions.send();
  c.data.fail.add('/api/items/mp:1');
  assert.equal(await c.store.actions.send(), 'failed');
  assert.equal(sends(c).length, 1, 'only the first');
  assert.equal(c.store.get().sending['mp:1'].outcome, 'unknown');
  assert.equal(mainNow(c.store.get()).label, 'Try again');
});

test('the page can tell a send the server refused from one whose outcome it does not know', async () => {
  assert.equal(sendOutcome(failure('This reply is already on its way.', 409)), 'elsewhere');
  for (const status of [400, 401, 403, 404]) assert.equal(sendOutcome(failure('No.', status)), 'refused', String(status));
  assert.equal(sendOutcome(failure(OFFLINE, 502)), 'refused', "the server's own words: the engine said no, or was not reached");
  assert.equal(sendOutcome(failure('HTTP 502', 502, false)), 'unknown', 'a gateway in between, not the server');
  assert.equal(sendOutcome(failure('Something broke', 500)), 'unknown');
  assert.equal(sendOutcome(failure('The Marketplace system did not answer in time, so the reply may have gone.', 504)), 'unknown', 'the engine did not answer in time');
  assert.equal(sendOutcome(failure(NOT_RESPONDING)), 'unknown', 'no answer at all');
  assert.equal(sendOutcome(new Error('x')), 'unknown');
  // The words: "Not sent." only when the server said so.
  assert.equal(sendFailedWords(OFFLINE, 'refused'), 'Not sent. ' + OFFLINE + '. Your text is still in the box.');
  assert.equal(sendFailedWords('Not found', 'unknown'), 'Wheelman could not tell whether this reply went. Not found.');
  // The page's api carries the status, and whether the words are the server's.
  const api = (res) => createApi({ fetch: async () => res, go: () => {} });
  const answer = (status, body) => ({ status, ok: status < 400, json: async () => { if (body === undefined) throw new Error('not json'); return body; } });
  await assert.rejects(api(answer(409, { error: 'This reply is already on its way.' }))('/api/items/mp:1/send', {}), (e) => e.status === 409 && e.said === true && e.message === 'This reply is already on its way.');
  await assert.rejects(api(answer(502))('/api/items/mp:1/send', {}), (e) => e.status === 502 && e.said === false && e.message === 'HTTP 502');
  await assert.rejects(createApi({ fetch: async () => { throw new TypeError('Failed to fetch'); }, go: () => {} })('/x', {}), (e) => e.status === undefined && e.message === NOT_RESPONDING);
  assert.deepEqual(await api(answer(200, { ok: true }))('/x'), { ok: true });
});

test('a send refused after the buyer wrote again is said, against the chat as it is now', async () => {
  const a = fb();
  // While the reply is on its way the buyer writes again, and then the engine refuses it.
  a.data.on = { '/api/items/mp:1/send': () => { a.data.items['mp:1'] = { ...FB, anchor: 'fm:3' }; throw failure(OFFLINE, 502); } };
  await a.store.actions.open('mp:1');
  a.store.actions.type('Yes, it is still here.');
  assert.equal(await a.store.actions.send(), 'failed');
  const s = a.store.get();
  assert.deepEqual(s.sending['mp:1'], { state: 'failed', error: OFFLINE, outcome: 'refused', anchor: 'fm:3', text: 'Yes, it is still here.' });
  assert.equal(s.item.anchor, 'fm:3', 'the new message is on screen');
  assert.equal(s.typed, 'Yes, it is still here.');
  assert.equal(s.context.message, 'New message from the customer. Your text is kept.');
  assert.ok(sendFor(s.item, s.sending[s.key]), 'the failure is said');
  assert.equal(mainNow(s).label, 'Try again');
  // Try again: the chat is as it was when it failed, so it goes.
  takes(a);
  assert.equal(await a.store.actions.send(), 'sent');
});

test('a send that fails after another chat is opened says so, and the chat keeps Try again', async () => {
  const a = fb();
  let refuse = null;
  a.data.on = { '/api/items/mp:1/send': () => new Promise((_, no) => { refuse = () => no(failure(OFFLINE, 502)); }) };
  await a.store.actions.open('mp:1');
  a.store.actions.type('The price is $28,900. Would you like to see it?');
  const going = a.store.actions.send();
  // Jim moves on to the next customer while the reply is on its way, and it is refused.
  await a.store.actions.open('c:1');
  refuse();
  assert.equal(await going, 'failed');
  let s = a.store.get();
  assert.equal(s.key, 'c:1', 'the chat open now stays open');
  assert.equal(s.toast.message, 'Not sent to Liam Invented. ' + OFFLINE + '.');
  // It stays longer than a plain toast, and Open goes to the chat's own address.
  assert.deepEqual({ label: s.toast.action.label, href: s.toast.action.href }, { label: 'Open', href: '#/marketplace/waiting/mp%3A1' });
  await a.timers.advance(5000);
  assert.equal(a.store.get().toast && a.store.get().toast.message, 'Not sent to Liam Invented. ' + OFFLINE + '.', 'still there after 5 s');
  await a.timers.advance(5000);
  assert.equal(a.store.get().toast, null);
  assert.match(source('../web/new/js/ui/toast.js'), /if \(href\) location\.hash = href;/);
  // The other words away from the chat.
  assert.equal(sendFailedAwayWords('', 'Not found'), 'Not sent to the buyer. Not found.');
  assert.equal(sendFailedAwayWords('Liam Invented', 'x', 'elsewhere'), 'Not sent to Liam Invented from here: another page is sending a reply to this chat.');
  assert.equal(sendFailedAwayWords('Liam Invented', NOT_RESPONDING, 'unknown'), 'Wheelman could not tell whether the reply to Liam Invented went. ' + NOT_RESPONDING);
  // Back in the chat: why, the text, and Try again.
  await a.store.actions.open('mp:1');
  s = a.store.get();
  assert.equal(boxText(s.item.draft), 'The price is $28,900. Would you like to see it?', 'the text was saved as Jim left the chat');
  assert.deepEqual(mainNow(s), { kind: 'send', label: 'Try again', secondary: 'Copy', byKey: false });
  assert.equal(sendFor(s.item, s.sending[s.key]).error, OFFLINE);
  takes(a);
  assert.equal(await a.store.actions.send(), 'sent');
  assert.equal(sends(a).length, 2);
});

test('the box cannot be edited while its reply is sending', async () => {
  const a = fb();
  let answer = null;
  a.data.on = { '/api/items/mp:1/send': () => new Promise((yes, no) => { answer = { yes, no }; }) };
  await a.store.actions.open('mp:1');
  a.store.actions.type('Yes, it is still here.');
  assert.equal(sendingNow(a.store.get().item, a.store.get().sending['mp:1']), false);
  const going = a.store.actions.send();
  let s = a.store.get();
  assert.equal(sendingNow(s.item, s.sending[s.key]), true);
  // Typing, Clear, Bring back and Add to reply all go through type(): none takes while it is sending.
  assert.equal(a.store.actions.type('Something else'), false);
  a.store.actions.clear();
  a.store.actions.bringBack();
  assert.equal(a.store.get().typed, 'Yes, it is still here.');
  // Another chat is not held up by it.
  assert.equal(sendingNow({ ...FB, key: 'mp:2' }, undefined), false);
  // Not sent: the box is Jim's again.
  answer.no(failure('The phone is offline.', 502));
  assert.equal(await going, 'failed');
  s = a.store.get();
  assert.equal(sendingNow(s.item, s.sending[s.key]), false);
  assert.equal(a.store.actions.type('Yes, it is still here today.'), true);
  assert.equal(a.store.get().typed, 'Yes, it is still here today.');
  // Sent: the text goes with the reply, as before.
  a.data.on = { '/api/items/mp:1/send': () => new Promise((yes) => { answer = { yes }; }) };
  const again = a.store.actions.send();
  await settle();
  a.data.items['mp:1'] = SENT;
  answer.yes({ ok: true, queued: false, item: SENT });
  assert.equal(await again, 'sent');
  assert.equal(a.store.get().typed, null);
  // The message box locks its editor, Clear, the block Remove, Tell Wheelman and Instead while it is sending.
  assert.match(BOX, /const locked = sendingNow\(item, state\.sending\[state\.key\]\);/);
  assert.match(BOX, /<\$\{Editor\} [^>]*readOnly=\$\{locked\}/);
  assert.match(BOX, /<\$\{Tell\} [^>]*disabled=\$\{locked\}/);
  assert.match(BOX, /class="opt" [^>]*disabled=\$\{locked\}/);
  const editor = source('../web/new/js/ui/editor.js');
  assert.match(editor, /contenteditable=\$\{readOnly \? 'false' :/);
  assert.match(editor, /readOnly=\$\{readOnly\}/);
  // A refused write's own button is locked too, and is never a second "Try again" beside the send's.
  assert.match(BOX, /disabled=\$\{locked\} onClick=\$\{\(\) => actions\.write\(\{ instruction: \(item\.draft && item\.draft\.instruction\) \|\| undefined \}\)\}>\$\{failedSend \? 'Write it again' : 'Try again'\}/);
  // Add to reply while it is sending says it was not added, and leaves the drawer as it is.
  const panel = source('../web/new/js/ui/panel.js');
  assert.match(panel, /if \(actions\.type\(out\.text\) === false\) \{ actions\.toast\(NOT_ADDED\); return; \}\s*if \(overlay\) close\(\);/);
  assert.match(panel, /const NOT_ADDED = 'Not added to the reply: it is sending\.';/);
});

// ---- fix round 2

test('a failure while the phone shows the list gives the toast with Open, and the row says Not sent until it is gone', async () => {
  let onScreen = true;
  const a = fb({}, () => onScreen);
  let refuse = null;
  a.data.on = { '/api/items/mp:1/send': () => new Promise((_, no) => { refuse = () => no(failure(OFFLINE, 502)); }) };
  await a.store.actions.open('mp:1');
  a.store.actions.type('Yes, it is still here.');
  const going = a.store.actions.send();
  // ‹ List on a phone: the store keeps the chat open, hidden behind the list.
  onScreen = false;
  refuse();
  assert.equal(await going, 'failed');
  let s = a.store.get();
  assert.equal(s.key, 'mp:1', 'still the open chat, out of sight');
  assert.equal(s.toast.message, 'Not sent to Liam Invented. ' + OFFLINE + '.');
  assert.deepEqual({ label: s.toast.action.label, href: s.toast.action.href }, { label: 'Open', href: '#/marketplace/waiting/mp%3A1' });
  // Its row says so in red while the failure stands, as the list draws it.
  const row = { key: 'mp:1', anchor: 'fm:1', name: 'Liam Invented', unread: 0, state: 'awaiting', preview: { who: 'customer', text: 'Hi, is this still available?' } };
  const rowNow = () => sectionRowView(row, { now: AT, sending: a.store.get().sending['mp:1'] }, 'marketplace');
  assert.deepEqual([rowNow().reason, rowNow().tone], ['Not sent', 'bad']);
  assert.match(source('../web/new/js/ui/list.js'), /sectionRowView\(r, \{ now, doneAnchor: state\.done\[r\.key\], sending: state\.sending\[r\.key\] \}, section\)/);
  // A failure about an earlier message, or a send on its way, is not a Not sent row.
  assert.equal(sectionRowView({ ...row, anchor: 'fm:3' }, { now: AT, sending: s.sending['mp:1'] }, 'marketplace').reason, '');
  assert.equal(sectionRowView(row, { now: AT, sending: { state: 'sending' } }, 'marketplace').reason, '');
  // Opened and sent: the row is as before.
  onScreen = true;
  takes(a);
  assert.equal(await a.store.actions.send(), 'sent');
  assert.equal(rowNow().reason, '');
  // The page says what is on screen: from 900 px the open chat is; on a phone only when the address names it.
  assert.match(source('../web/new/js/main.js'), /shown: \(key\) => conversationOnScreen\(\{ narrow: NARROW\.matches, storeKey: key, routeKey: parseRoute\(location\.hash\)\.key \}\)/);
  // On screen, a failure is said in the box only.
  const b = fb({}, () => true);
  b.data.on = { '/api/items/mp:1/send': () => { throw failure(OFFLINE, 502); } };
  await b.store.actions.open('mp:1');
  b.store.actions.type('Yes, it is still here.');
  await b.store.actions.send();
  assert.equal(b.store.get().toast, null);
});

test('text that went is never left ready to be sent again', async () => {
  const typed = 'Yes, it is still here.';
  // The outcome could not be told and the chat did not show the reply yet.
  const a = fb();
  a.data.on = { '/api/items/mp:1/send': () => { throw failure(NOT_RESPONDING); } };
  await a.store.actions.open('mp:1');
  a.store.actions.type(typed);
  assert.equal(await a.store.actions.send(), 'failed');
  assert.equal(a.store.get().sending['mp:1'].outcome, 'unknown');
  // The next read brings the reply, and the buyer has written again since: the text that went goes too.
  a.data.items['mp:1'] = { ...FB, anchor: 'fm:3', thread: [ASKED, { key: 'fm:2', who: 'us', text: typed }, { key: 'fm:3', who: 'customer', text: 'Great, when can I see it?' }] };
  await a.store.actions.refresh();
  let s = a.store.get();
  assert.equal(s.item.anchor, 'fm:3');
  assert.equal(s.typed, null, 'not kept beside the new message, where Send would post it again');
  assert.equal(s.context, null);
  assert.deepEqual(s.sending, {});

  // The reply did not show, the buyer wrote again, and the box offers Send on Facebook with the text kept: a Send reads the chat first.
  const b = fb();
  b.data.on = { '/api/items/mp:1/send': () => { throw failure(NOT_RESPONDING); } };
  await b.store.actions.open('mp:1');
  b.store.actions.type(typed);
  await b.store.actions.send();
  b.data.items['mp:1'] = { ...FB, anchor: 'fm:3', thread: [ASKED, { key: 'fm:3', who: 'customer', text: 'Hello?' }] };
  await b.store.actions.refresh();
  s = b.store.get();
  assert.equal(s.typed, typed, 'not in the chat: the text is kept');
  assert.equal(mainNow(s).label, 'Send on Facebook');
  // By the time Send is pressed the reply shows after all: nothing is posted, and the text goes.
  b.data.items['mp:1'] = { ...FB, anchor: 'fm:3', thread: [ASKED, { key: 'fm:2', who: 'us', text: typed }, { key: 'fm:3', who: 'customer', text: 'Hello?' }] };
  b.calls.length = 0;
  assert.equal(await b.store.actions.send(), 'replied');
  assert.deepEqual(paths(b.calls).slice(0, 2), ['POST /api/sync', 'GET /api/items/mp:1']);
  assert.equal(sends(b).length, 0);
  assert.equal(b.store.get().typed, null);
  // Not there either way: the re-read comes first, then the reply goes.
  const c = fb();
  c.data.on = { '/api/items/mp:1/send': () => { throw failure(NOT_RESPONDING); } };
  await c.store.actions.open('mp:1');
  c.store.actions.type(typed);
  await c.store.actions.send();
  c.data.items['mp:1'] = { ...FB, anchor: 'fm:3', thread: [ASKED, { key: 'fm:3', who: 'customer', text: 'Hello?' }] };
  await c.store.actions.refresh();
  takes(c);
  c.calls.length = 0;
  assert.equal(await c.store.actions.send(), 'sent');
  assert.deepEqual(paths(c.calls).slice(0, 3), ['POST /api/sync', 'GET /api/items/mp:1', 'POST /api/items/mp:1/send']);
  // A suggestion the server notes as sent here is never sent again from the box.
  const d = fb({ draft: { ...FB.draft, edited: typed, sentHereAt: AT } });
  await d.store.actions.open('mp:1');
  assert.equal(boxViewOf(d.store.get(), AT).sentence, 'Sent on Facebook at ' + clock(AT) + '.', 'still waiting in the thread, yet sent from here');
  assert.equal(await d.store.actions.send(), null);
  assert.equal(sends(d).length, 0);
});

test('an unknown outcome counts as sent only when our message in the thread has that text', async () => {
  const typed = 'Yes, it is still here.';
  assert.equal(sentSince(sentWith(typed), 'fm:1', typed), true);
  assert.equal(sentSince(sentWith('Yes, it is.'), 'fm:1', typed), false, 'only the text that was sent');
  assert.equal(sentSince(sentWith('See https://www.carbarn.com.au/x?utm_source=marketplace'), 'fm:1', 'See https://www.carbarn.com.au/x'), true, 'the link tag the server adds');
  assert.equal(sentSince(sentWith(typed), 'fm:2', typed), false, 'before the message it answered');
  assert.equal(sentSince({ ...SENT, thread: [ASKED, { key: 'fm:2', who: 'customer', text: typed }] }, 'fm:1', typed), false, 'the buyer wrote it');
  // The auto-reply answered while the outcome could not be told: not Jim's reply, so not "Sent", and his text stays.
  const a = fb();
  const auto = { ...SENT, answered: { how: 'auto', by: '', at: AT }, thread: [ASKED, { key: 'fm:2', who: 'us', auto: true, text: 'It is $25,000 drive away.' }] };
  a.data.on = { '/api/items/mp:1/send': () => { a.data.items['mp:1'] = auto; throw failure(NOT_RESPONDING); } };
  await a.store.actions.open('mp:1');
  a.store.actions.type(typed);
  assert.equal(await a.store.actions.send(), 'failed');
  const s = a.store.get();
  assert.equal(s.typed, typed, 'kept');
  assert.equal(s.item.anchor, 'fm:2', 'the chat as it is now');
  assert.deepEqual([s.sending['mp:1'].outcome, s.sending['mp:1'].anchor], ['unknown', 'fm:2']);
  assert.equal(s.toast, null, 'not "Sent"');
  // The box says what happened: answered elsewhere, the text kept, and that Wheelman could not tell.
  const view = boxViewOf(s, AT);
  assert.equal(view.kind, 'editor');
  assert.equal(view.context, 'The customer was answered elsewhere. Your text is kept.');
  assert.ok(sendFor(s.item, s.sending[s.key]));
  assert.match(sendFailedWords(s.sending['mp:1'].error, 'unknown'), /^Wheelman could not tell whether this reply went\./);
});

test('a failure whose re-read shows a new message is put on screen even when the refresh fails', async () => {
  const a = fb();
  a.data.on = { '/api/items/mp:1/send': () => { a.data.items['mp:1'] = { ...FB, anchor: 'fm:3' }; a.data.fail.add('/api/items?'); throw failure(OFFLINE, 502); } };
  await a.store.actions.open('mp:1');
  a.store.actions.type('Yes, it is still here.');
  assert.equal(await a.store.actions.send(), 'failed');
  const s = a.store.get();
  assert.equal(s.item.anchor, 'fm:3', 'the re-read chat, without the refresh');
  assert.equal(s.context.message, 'New message from the customer. Your text is kept.');
  assert.equal(s.typed, 'Yes, it is still here.');
  assert.ok(sendFor(s.item, s.sending[s.key]), 'the failure is said');
  assert.equal(mainNow(s).label, 'Try again');
});
