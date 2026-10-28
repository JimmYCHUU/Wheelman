// Send on Facebook, the only send anywhere, and one main button for each channel: Copy reply, Send
// on Facebook, Copy for Gmail and Copy for WhatsApp. The store with a fake server. A send that fails
// is in newpage-send-retry.test.js, and the whole send against the server and the stand-in
// Marketplace engine in newpage-send-engine.test.js. Invented data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { replyChannel, mainFor, copiedWords, sentWords } from '../web/new/js/channel.js';
import { boxViewOf, sectionBox } from '../web/new/js/boxsections.js';
import { sentence } from '../web/new/js/words.js';
import { clock, listTime } from '../web/lib/format.js';
import { setup, draft, settle, paths } from './support/newpage-fakes.js';
import { AT, DAY, SENT, TYPING, ANYWAY, fb, sends, takes, mainNow } from './support/newpage-send-fakes.js';

const BOX = fs.readFileSync(new URL('../web/new/js/ui/messagebox.js', import.meta.url), 'utf8');
const source = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');

test('one main button per channel', () => {
  const text = { channel: 'sms' };
  const chat = { channel: 'marketplace', anchor: 'fm:1' };
  const email = { channel: 'email' };
  const order = (o = {}) => ({ channel: 'auction', order: { replyVia: '', prefers: 'WhatsApp', ...o } });
  assert.equal(replyChannel(text), 'text');
  assert.equal(replyChannel(chat), 'facebook');
  assert.equal(replyChannel(email), 'email');
  assert.equal(replyChannel(order()), 'whatsapp');
  assert.equal(replyChannel(order({ prefers: '' })), 'whatsapp');
  assert.equal(replyChannel(order({ replyVia: 'sms' })), 'text', 'an order the customer texted about is answered by text');
  assert.equal(replyChannel(order({ prefers: 'Email' })), 'email');
  assert.equal(replyChannel(order({ replyVia: 'sms', prefers: 'Email' })), 'text');
  assert.equal(replyChannel({ channel: 'sms', order: null }), 'text', 'an enquiry listed in Auction');
  assert.equal(replyChannel(null), 'text');

  const main = (item, o = {}) => mainFor({ item, text: 'Yes, it is still here.', checks: [], overridden: false, ...o });
  const blank = 'The price is [PRICE?].';
  const fail = [{ level: 'fail', message: 'Check this figure.' }];
  // A copy says where it goes, and Ctrl+Enter presses it.
  assert.deepEqual(main(text), { kind: 'copy', label: 'Copy reply', secondary: null, byKey: true });
  assert.deepEqual(main(email), { kind: 'copy', label: 'Copy for Gmail', secondary: null, byKey: true });
  assert.deepEqual(main(order()), { kind: 'copy', label: 'Copy for WhatsApp', secondary: null, byKey: true });
  assert.equal(main(order({ replyVia: 'sms' })).label, 'Copy reply');
  assert.equal(main(order({ prefers: 'Email' })).label, 'Copy for Gmail');
  // Blanks and a failed check, as before, on every channel that copies.
  assert.deepEqual(main(email, { text: blank }), { kind: 'fill', label: 'Fill 1 blank', secondary: 'Copy with the blank', byKey: true });
  assert.deepEqual(main(order(), { checks: fail }), { kind: 'blocked', label: 'Fix the check first', secondary: null, byKey: true });
  assert.equal(main(order(), { checks: fail, overridden: true }).label, 'Copy for WhatsApp');

  // Facebook: Send on Facebook, with a quiet Copy beside it.
  assert.deepEqual(main(chat), { kind: 'send', label: 'Send on Facebook', secondary: 'Copy', byKey: false });
  // A blank blocks Send and never Copy.
  assert.deepEqual(main(chat, { text: blank }), { kind: 'fill', label: 'Fill 1 blank to send', secondary: 'Copy with the blank', byKey: true });
  assert.deepEqual(main(chat, { text: blank + ' See you [DATE?].' }), { kind: 'fill', label: 'Fill 2 blanks to send', secondary: 'Copy with the blanks', byKey: true });
  // A failed check blocks Send until Send anyway; a blank is still filled first.
  assert.deepEqual(main(chat, { checks: fail }), { kind: 'blocked', label: 'Fix the check first', secondary: null, byKey: false });
  assert.deepEqual(main(chat, { text: blank, checks: fail }), { kind: 'fill', label: 'Fill 1 blank to send', secondary: null, byKey: true });
  assert.equal(main(chat, { checks: fail, overridden: true }).label, 'Send on Facebook');
  // On its way: Sending…, before anything else.
  const sending = { state: 'sending' };
  assert.deepEqual(main(chat, { sending }), { kind: 'sending', label: 'Sending…', secondary: null, byKey: false });
  assert.equal(main(chat, { sending, text: blank, checks: fail }).kind, 'sending');
  // Not sent: Try again, while the chat is as it was then.
  const failed = { state: 'failed', error: 'The phone is offline.', outcome: 'refused', anchor: 'fm:1' };
  assert.deepEqual(main(chat, { sending: failed }), { kind: 'send', label: 'Try again', secondary: 'Copy', byKey: false });
  assert.equal(main(chat, { sending: { state: 'failed', error: 'x' } }).label, 'Try again');
  assert.equal(main({ ...chat, anchor: 'fm:2' }, { sending: failed }).label, 'Send on Facebook', 'the buyer wrote again since');
  assert.equal(main(chat, { sending: failed, text: blank }).label, 'Fill 1 blank to send');
  // Only a Facebook chat sends.
  assert.equal(main(text, { sending }).kind, 'copy');
});

test('Ctrl+Enter copies but never sends', () => {
  const items = [{ channel: 'sms' }, { channel: 'marketplace', anchor: 'fm:1' }, { channel: 'email' }, { channel: 'auction', order: { replyVia: '', prefers: 'WhatsApp' } }];
  const texts = ['Yes, it is still here.', 'The price is [PRICE?].'];
  const checks = [[], [{ level: 'fail', message: 'x' }]];
  const sendings = [undefined, { state: 'sending' }, { state: 'failed', error: 'x', anchor: 'fm:1' }];
  let n = 0;
  for (const item of items) for (const text of texts) for (const c of checks) for (const overridden of [false, true]) for (const sending of sendings) {
    const m = mainFor({ item, text, checks: c, overridden, sending });
    n++;
    if (m.kind === 'send' || m.kind === 'sending') assert.equal(m.byKey, false, JSON.stringify(m));
    if (m.kind === 'copy' || m.kind === 'fill') assert.equal(m.byKey, true, JSON.stringify(m));
  }
  assert.equal(n, 96);
  // The message box presses its main button by key only when mainFor says so; in a reply run its Next still is.
  assert.match(BOX, /main\.current = view\.elsewhere \? next : action && action\.byKey \? run : null;/);
});

test('send posts the text with its draft and says Sent with the time', async () => {
  const a = fb();
  takes(a);
  await a.store.actions.open('mp:1');
  a.store.actions.type('The price is $28,900. Would you like to see it?');
  assert.equal(mainNow(a.store.get()).label, 'Send on Facebook');
  a.calls.length = 0;
  assert.equal(await a.store.actions.send(), 'sent');
  assert.deepEqual(sends(a).map((c) => c.body), [{ text: 'The price is $28,900. Would you like to see it?', draftId: 21 }]);
  assert.equal(paths(a.calls)[0], 'POST /api/items/mp:1/send', 'a first send is posted at once');
  let s = a.store.get();
  assert.deepEqual(s.sending, {});
  assert.equal(s.item.state, 'answered');
  assert.equal(s.typed, null, 'the text went with the reply');
  assert.equal(s.toast.message, 'Sent. It is on its way to the buyer.');
  // Then the list, after the send.
  const p = paths(a.calls);
  assert.ok(p.lastIndexOf('GET /api/items?section=dashboard&tab=waiting&limit=20') > p.indexOf('POST /api/items/mp:1/send'));
  // Quiet and good; the engine's phone typing it while it is on its way. A reply can still be written.
  assert.deepEqual(boxViewOf(s, AT + 60e3), { kind: 'quiet', tone: 'good', sentence: TYPING, button: ANYWAY, tell: true });
  // Typed into the chat: the time alone. Opened again later: the same.
  a.data.items['mp:1'] = { ...SENT, marketplace: { ...SENT.marketplace, sending: false } };
  await a.store.actions.refresh();
  assert.equal(boxViewOf(a.store.get(), AT).sentence, 'Sent on Facebook at ' + clock(AT) + '.');
  await a.store.actions.open('c:1');
  await a.store.actions.open('mp:1');
  assert.equal(boxViewOf(a.store.get(), AT).sentence, 'Sent on Facebook at ' + clock(AT) + '.');
  assert.equal(sends(a).length, 1);

  // The Send's own time, where the server shows the suggestion that was sent.
  assert.equal(sectionBox({ item: { ...SENT, draft: draft(21, { sentHereAt: AT - 120e3 }) }, now: AT }).sentence, "Sent on Facebook at " + clock(AT - 120e3) + ". The engine's phone is typing it into the chat.");
  // A Facebook chat answered any other way, or a Dashboard text answered with the suggestion: as before.
  assert.match(sectionBox({ item: { ...SENT, answered: { how: 'auto', by: '', at: AT } }, now: AT }).sentence, /^Answered by an auto-reply/);
  assert.match(sectionBox({ item: { ...SENT, channel: 'sms' }, now: AT }).sentence, /^Answered with Wheelman's suggestion/);
  assert.equal(sectionBox({ item: SENT, writing: true }).kind, 'writing');
  // A reply asked for after the send is the person's to use (boxView's rule): the editor, not the sent words.
  assert.deepEqual(sectionBox({ item: { ...SENT, draft: draft(30, { createdAt: AT + 60e3 }) }, now: AT + 120e3 }), { kind: 'editor', context: '' });

  // The engine's phone is offline: the reply is queued, and the toast says so.
  const b = fb();
  takes(b, { ok: true, queued: true });
  await b.store.actions.open('mp:1');
  b.store.actions.type('Yes, it is still here.');
  assert.equal(await b.store.actions.send(), 'sent');
  s = b.store.get();
  assert.equal(s.toast.message, 'Queued. The Marketplace system sends it as soon as its phone is back online.');
  assert.equal(boxViewOf(s, AT).sentence, TYPING);

  // Sent while another conversation is open: that one stays as it is, and the toast names the buyer.
  const c = fb();
  let answer = null;
  c.data.on = { '/api/items/mp:1/send': () => new Promise((r) => { answer = () => { c.data.items['mp:1'] = SENT; r({ ok: true, queued: false, item: SENT }); }; }) };
  await c.store.actions.open('mp:1');
  c.store.actions.type('Yes, it is still here.');
  const going = c.store.actions.send();
  await c.store.actions.open('c:1');
  c.store.actions.type('My words for Sam');
  answer();
  assert.equal(await going, 'sent');
  s = c.store.get();
  assert.equal(s.key, 'c:1');
  assert.equal(s.typed, 'My words for Sam');
  assert.equal(s.item.key, 'c:1');
  assert.deepEqual(s.sending, {});
  assert.equal(s.toast.message, 'Sent to Liam Invented. It is on its way.');
  assert.equal(sentWords(true, 'Liam Invented'), 'Queued for Liam Invented. The Marketplace system sends it as soon as its phone is back online.');
  assert.equal(sentWords(false, ''), 'Sent. It is on its way to the buyer.');
});

test('a send on an earlier day says the day, as the other answers do', () => {
  const sent = { ...SENT, marketplace: { ...SENT.marketplace, sending: false } };
  const at = (now) => sectionBox({ item: sent, now }).sentence;
  assert.equal(at(AT + 3600e3), 'Sent on Facebook at ' + clock(AT) + '.', 'the same day: the clock');
  assert.equal(at(AT + DAY), 'Sent on Facebook yesterday.');
  assert.equal(at(AT + 3 * DAY), 'Sent on Facebook on ' + listTime(AT, AT + 3 * DAY) + '.');
  assert.equal(at(AT + 10 * DAY), 'Sent on Facebook on ' + listTime(AT, AT + 10 * DAY) + '.');
  assert.match(at(AT + 10 * DAY), /^Sent on Facebook on \d+ \w+\.$/);
});

test('a second press while sending sends nothing', async () => {
  const a = fb();
  let answer = null;
  a.data.on = { '/api/items/mp:1/send': () => new Promise((r) => { answer = () => { a.data.items['mp:1'] = SENT; r({ ok: true, queued: false, item: SENT }); }; }) };
  await a.store.actions.open('mp:1');
  a.store.actions.type('Yes, it is still here.');
  const first = a.store.actions.send();
  assert.deepEqual(a.store.get().sending, { 'mp:1': { state: 'sending' } });
  assert.deepEqual(mainNow(a.store.get()), { kind: 'sending', label: 'Sending…', secondary: null, byKey: false });
  // A double click.
  assert.equal(await a.store.actions.send(), null);
  assert.equal(sends(a).length, 1);
  // The chat opened again while its reply is on its way: still Sending…, and a press sends nothing.
  await a.store.actions.open('c:1');
  await a.store.actions.open('mp:1');
  assert.equal(mainNow(a.store.get()).label, 'Sending…');
  assert.equal(await a.store.actions.send(), null);
  assert.equal(sends(a).length, 1);
  answer();
  assert.equal(await first, 'sent');
  assert.equal(sends(a).length, 1, 'exactly one reply');
  assert.equal(boxViewOf(a.store.get(), AT).sentence, TYPING);
});

test('send with a blank posts nothing and moves to the blank', async () => {
  const a = fb();
  takes(a);
  await a.store.actions.open('mp:1');
  // The suggestion as written, then text typed with a blank still in it.
  assert.equal(await a.store.actions.send(), 'fill');
  a.store.actions.type('The price is [PRICE?] drive away.');
  assert.equal(await a.store.actions.send(), 'fill');
  assert.equal(sends(a).length, 0);
  assert.deepEqual(a.store.get().sending, {});
  assert.equal(a.store.get().typed, 'The price is [PRICE?] drive away.');
  // Nothing to send, or not a Facebook chat: nothing at all.
  a.store.actions.type('   ');
  assert.equal(await a.store.actions.send(), null);
  await a.store.actions.open('c:1');
  assert.equal(await a.store.actions.send(), null);
  assert.equal(a.calls.some((c) => c.path.endsWith('/send')), false);
  // The message box moves the caret to the first blank when send says so.
  assert.match(BOX, /=== 'fill'\) fill\(\)/);
});

test('a Marketplace copy tells the server nothing of the text', async () => {
  const a = fb();
  await a.store.actions.open('mp:1');
  a.store.actions.type('The price is $28,900.');
  await a.store.actions.copy({});
  await settle();
  assert.deepEqual(a.written, ['The price is $28,900.']);
  assert.deepEqual(a.calls.filter((c) => c.path.endsWith('/copied')).map((c) => [c.path, c.body]), [['/api/drafts/21/copied', { text: '' }]]);
  assert.equal(a.store.get().toast.message, 'Copied. Paste it into the Marketplace chat to send.');
  assert.equal(sends(a).length, 0, 'a copy sends nothing');
  // A blank never blocks Copy.
  a.store.actions.type('The price is [PRICE?].');
  await a.store.actions.copy({});
  assert.equal(a.written.at(-1), 'The price is [PRICE?].');
  assert.equal(a.store.get().toast.message, 'Copied, with 1 blank still to fill');
  assert.deepEqual(a.calls.filter((c) => c.path.endsWith('/copied')).map((c) => c.body.text), ['', '']);

  // Every other channel keeps the text it copied, as before.
  const b = setup();
  await b.store.actions.open('c:1');
  await b.store.actions.copy({});
  assert.deepEqual(b.calls.filter((c) => c.path.endsWith('/copied')).map((c) => c.body), [{ text: 'Hello from Wheelman' }]);
  assert.equal(b.store.get().toast.message, 'Copied');

  // The words after a copy, by channel.
  assert.equal(copiedWords({ channel: 'marketplace' }, 0), 'Copied. Paste it into the Marketplace chat to send.');
  assert.equal(copiedWords({ channel: 'email' }, 0), 'Copied. Paste it into your reply in Gmail.');
  assert.equal(copiedWords({ channel: 'auction', order: { replyVia: '', prefers: 'WhatsApp' } }, 0), 'Copied. Paste it into WhatsApp.');
  assert.equal(copiedWords({ channel: 'auction', order: { replyVia: '', prefers: 'Email' } }, 0), 'Copied. Paste it into your reply in Gmail.');
  assert.equal(copiedWords({ channel: 'auction', order: { replyVia: 'sms', prefers: 'WhatsApp' } }, 0), 'Copied');
  assert.equal(copiedWords({ channel: 'sms' }, 0), 'Copied');
  assert.equal(copiedWords({ channel: 'marketplace' }, 2), 'Copied, with 2 blanks still to fill');
  assert.equal(copiedWords({ channel: 'email' }, 1), 'Copied, with 1 blank still to fill');
});

test('Send anyway past a failed check sends', async () => {
  const checks = [{ level: 'fail', code: 'figure', tokens: ['$31,990'], message: 'Check this figure: $31,990 is not in your records.' }];
  const a = fb({ draft: draft(22, { reply: 'The price is $31,990.', checks }) });
  takes(a);
  await a.store.actions.open('mp:1');
  assert.deepEqual(mainNow(a.store.get()), { kind: 'blocked', label: 'Fix the check first', secondary: null, byKey: false });
  // Pressed anyway (a button left on screen): nothing goes.
  assert.equal(await a.store.actions.send(), 'blocked');
  assert.equal(sends(a).length, 0);
  // Send anyway: the person's own decision, then the send.
  a.store.actions.override();
  assert.equal(mainNow(a.store.get()).label, 'Send on Facebook');
  assert.equal(await a.store.actions.send(), 'sent');
  assert.deepEqual(sends(a).map((c) => c.body), [{ text: 'The price is $31,990.', draftId: 22 }]);
  // The check line's button reads Send anyway on Facebook, and it sends after setting the override.
  assert.match(BOX, /facebook \? 'Send anyway' : 'Copy anyway'/);
  assert.match(BOX, /actions\.override\(\);\s*if \(facebook\) send\(\);/);
});

test('the full stop helper is one, shared by the box and the send words', () => {
  assert.equal(sentence('Not found'), 'Not found.');
  assert.equal(sentence('  Is it running?  '), 'Is it running?');
  assert.equal(sentence('Done!'), 'Done!');
  assert.equal(sentence('Done.'), 'Done.');
  assert.equal(sentence(''), '');
  assert.equal(sentence(null), '');
  for (const f of ['../web/new/js/boxsections.js', '../web/new/js/channel.js']) {
    const src = source(f);
    assert.match(src, /import \{[^}]*\bsentence\b[^}]*\} from '\.\/words\.js';/, f);
    assert.doesNotMatch(src, /const sentence =/, f);
  }
});
