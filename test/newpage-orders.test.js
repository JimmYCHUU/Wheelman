// Auction orders on the new page: the order's box (what is due, copied or dismissed, with Put back
// in To do), the message picker, the paste box (They wrote this, We sent this), Remove, Copy for
// WhatsApp, the order strip and the Order tab with Their texts. Pure functions and the store with a
// fake server; invented data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { orderBox, orderOptions, orderStrip, orderSections, pastedId } from '../web/new/js/orderview.js';
import { sectionBox, boxViewOf } from '../web/new/js/boxsections.js';
import { messageOptions } from '../web/new/js/messages.js';
import { mainFor, copiedWords } from '../web/new/js/channel.js';
import { setup, row, draft, settle, paths } from './support/newpage-fakes.js';
import { clock, listTime, ago } from '../web/lib/format.js';

const NOW = Date.UTC(2026, 9, 28, 3, 0, 0);
const DAY = 86400e3;
const KEY = 'ao:503';
const DUE = 'out:result-1992541';
const MESSAGES = [
  { type: 'bid_lost', label: 'Bid lost, still searching', due: true },
  { type: 'lot_offer', label: 'Car found, full', due: false },
  { type: 'lot_short', label: 'Car found, short', due: false },
  { type: 'search_update', label: 'Still searching', due: false },
  { type: 'deposit_reminder', label: 'Deposit reminder', due: false },
];

/** An order as the server presents it (orderOf in src/server.js): Omar's, his bid placed, the auction held. */
const orderOf = (o = {}) => ({
  orderNo: 'AS-503', stage: 'Bid placed', stageCode: 'INITIAL_DEPOSIT', finished: false, due: 'Send: bid lost, still searching',
  why: 'The auction has been held.', handled: '', cameFrom: 'Live auction', prefers: 'WhatsApp', followUp: '',
  staffNote: { text: 'Bid placed at 250,000 yen', at: NOW - 2 * DAY },
  deposit: { state: 'Paid', paid: 1650, asked: 1650 },
  wanted: { car: 'Subaru XV Hybrid 2014–2015 (GPE)', variant: null, targetBidYen: 226000, budget: 10450, notes: 'A light colour if possible.' },
  lot: { title: '2015 SUBARU SUBARU XV', grade: '3.5', km: 121000, auctionDate: '2026-10-29', auctionHouse: 'MIRIVE Saitama', lotNumber: '10025', url: 'https://www.carbarn.com.au/auction/1992541' },
  found: null, car: null,
  money: { lines: [{ stage: 'INITIAL_DEPOSIT', description: 'Deposit for auction bidding', amount: 1650 }], payments: [{ stage: 'INITIAL_DEPOSIT', type: 'DEPOSIT', amount: 1650, at: NOW - 3 * DAY }], total: 1650, paid: 1650, due: 0 },
  dates: { opened: NOW - 20 * DAY, secured: null, completed: null },
  messages: MESSAGES, message: 'bid_lost', replying: false, replyVia: '', texts: { key: 'c:113', here: true },
  ...o,
});
/** The open order (presentOrder): its message due, with no suggestion yet. */
const orderItem = (o = {}, order = {}) => ({
  key: KEY, anchor: DUE, state: 'awaiting', channel: 'auction', section: 'auction', dueKind: 'send', due: 'Send: bid lost, still searching',
  name: 'Omar Invented', phone: '0491 570 113', car: '2015 SUBARU SUBARU XV', teaches: false, templates: [], template: undefined,
  order: orderOf(order), thread: [], earlier: 0, draft: null, writing: false, ...o,
});
const ready = (id, reply = 'Hello Omar, the auction is done.', o = {}) => draft(id, { reply, ...o });

/** The store with the order on the list, open. */
async function opened(item = orderItem({ draft: ready(41) })) {
  const a = setup();
  a.data.rows = [row(KEY, { anchor: item.anchor })];
  a.data.items[KEY] = item;
  await a.store.actions.refresh();
  await a.store.actions.open(KEY);
  return a;
}

const posts = (a) => a.calls.filter((c) => c.body !== undefined);

test("an order's box says what is due, what was copied or dismissed, and offers Put back in To do", async () => {
  const PUT_BACK = { label: 'Put back in To do', act: 'restore', main: false };
  const box = (item, o = {}) => orderBox({ item, picked: null, done: false, doneAt: null, writing: false, typed: false, ...o });

  // A message is due and nothing is written yet: why, and Write it now.
  let v = box(orderItem());
  assert.deepEqual([v.kind, v.sentence, v.button, v.tell], ['quiet', 'The auction has been held. It is being prepared.', { label: 'Write it now', act: 'write', main: true }, true]);
  assert.equal(box(orderItem({}, { why: '' })).sentence, 'A message is due. It is being prepared.');
  // They wrote to us (a WhatsApp message pasted in, or a text): a reply.
  v = box(orderItem({ anchor: 'in:7', dueKind: 'reply' }, { replying: true, message: '', why: '' }));
  assert.deepEqual([v.sentence, v.button.label], ['They wrote to us. A reply has not been written yet.', 'Write it now']);
  // A message written, then one that could not be.
  v = box(orderItem({ draft: ready(41) }));
  assert.deepEqual([v.kind, v.label], ['editor', 'Bid lost, still searching']);
  assert.equal(box(orderItem({ anchor: 'in:7', dueKind: 'reply', draft: ready(42) }, { replying: true, message: '' })).label, '');
  v = box(orderItem({ draft: { id: 43, status: 'failed', error: 'The model is overloaded.' } }));
  assert.deepEqual([v.kind, v.tone, v.sentence, v.button, v.tell], ['quiet', 'bad', 'The model is overloaded.', { label: 'Try again', act: 'retry', main: true }, true]);
  assert.equal(box(orderItem({ draft: { id: 43, status: 'failed', error: '' } })).sentence, 'This message could not be written.');

  // Copied here: when, in green, with Put back in To do.
  v = box(orderItem({ draft: ready(41) }), { done: true, doneAt: NOW });
  assert.deepEqual([v.kind, v.tone, v.sentence, v.button], ['quiet', 'good', 'Copied at ' + clock(NOW) + '.', PUT_BACK]);
  // Copied or dismissed (on any page): said so, with Put back in To do.
  v = box(orderItem({ state: 'answered', draft: ready(41) }, { handled: 'copied', message: '' }));
  assert.deepEqual([v.sentence, v.button], ['You copied the message that was due. It is shown in the conversation above.', PUT_BACK]);
  v = box(orderItem({ state: 'answered' }, { handled: 'dismissed', message: '' }));
  assert.deepEqual([v.sentence, v.button], ['You dismissed the message that was due.', PUT_BACK]);
  // Nothing due: finished, or under way.
  v = box(orderItem({ state: 'closed' }, { finished: true, message: '', due: '' }));
  assert.deepEqual([v.sentence, v.button, v.tell], ['This order is finished. No message is due.', null, false]);
  v = box(orderItem({ state: 'answered' }, { message: '', due: '' }));
  assert.deepEqual([v.sentence, v.button], ['No message is due for this order right now. Choose a message to write it anyway.', null]);
  // A message picked from the picker is shown whatever the order's state.
  v = box(orderItem({ state: 'answered', draft: ready(44) }, { handled: 'copied', message: 'search_update' }), { picked: 'search_update' });
  assert.deepEqual([v.kind, v.label], ['editor', 'Still searching']);

  // Writing and typed text come first; typed text stays beside a failure.
  assert.equal(box(orderItem({ draft: ready(41) }), { writing: true, done: true }).kind, 'writing');
  assert.equal(box(orderItem({ writing: true })).kind, 'writing');
  v = box(orderItem({ state: 'answered' }, { handled: 'copied' }), { typed: true });
  assert.equal(v.kind, 'editor');
  v = box(orderItem({ draft: { id: 43, status: 'failed', error: 'The model is overloaded.' } }), { typed: true });
  assert.deepEqual([v.kind, v.failure], ['editor', 'The model is overloaded. Your text is kept.']);

  // The box of the page takes an order to orderBox; a write refused for it is said with Try again.
  assert.equal(sectionBox({ item: orderItem({ state: 'answered' }, { handled: 'dismissed' }), now: NOW }).sentence, 'You dismissed the message that was due.');
  const refused = { key: KEY, anchor: DUE, state: 'awaiting', message: 'Choose which message to write first.' };
  v = sectionBox({ item: orderItem(), writeFailed: refused, now: NOW });
  assert.deepEqual([v.tone, v.sentence, v.button.label], ['bad', 'Choose which message to write first.', 'Try again']);

  // Dismiss this message, with text typed for it: the text goes with the message (it is saved with
  // its suggestion), and the box says it was dismissed, with Put back in To do.
  const a = await opened(orderItem({ draft: ready(41) }));
  a.store.actions.type('My words for the due message');
  a.data.on = { ['/api/items/' + KEY + '/dismiss']: () => { a.data.items[KEY] = orderItem({ state: 'answered', draft: ready(41) }, { handled: 'dismissed', message: '' }); return { ok: true }; } };
  await a.store.actions.dismiss();
  const s = a.store.get();
  assert.deepEqual([s.typed, s.context, s.toast.message, s.toast.action.label], [null, null, 'Dismissed', 'Undo']);
  v = boxViewOf(s, NOW);
  assert.deepEqual([v.sentence, v.button], ['You dismissed the message that was due.', PUT_BACK]);
  // A conversation's Dismiss keeps what was typed, as before.
  const c = setup();
  await c.store.actions.open('c:1');
  c.store.actions.type('Mine');
  await c.store.actions.dismiss();
  assert.equal(c.store.get().typed, 'Mine');
});

test("the message picker lists the order's messages, the due one first, and a picked message is kept for Tell and Try again", async () => {
  // Every message the order can have, in the server's order (the due one first), the due one marked.
  assert.deepEqual(orderOptions(orderItem()), [
    { id: 'bid_lost', label: 'Bid lost, still searching · due' }, { id: 'lot_offer', label: 'Car found, full' }, { id: 'lot_short', label: 'Car found, short' },
    { id: 'search_update', label: 'Still searching' }, { id: 'deposit_reminder', label: 'Deposit reminder' },
  ]);
  // They wrote to us and a message is in hand: the reply to what they wrote comes back first.
  const replyDue = orderItem({ dueKind: 'reply', anchor: 'out:own-search_update' }, { message: 'search_update', messages: MESSAGES.map((m) => ({ ...m, due: false })) });
  assert.deepEqual(orderOptions(replyDue).map((o) => o.id), ['', 'bid_lost', 'lot_offer', 'lot_short', 'search_update', 'deposit_reminder']);
  assert.equal(orderOptions(replyDue)[0].label, 'A reply to what they wrote');
  assert.equal(orderOptions(orderItem({ dueKind: 'reply', anchor: 'in:7' }, { replying: true, message: '' }))[0].id, 'bid_lost');
  // The Instead line: three, never the one in the box; the rest behind More messages.
  let o = messageOptions(orderItem());
  assert.deepEqual(o.shown.map((x) => x.id), ['lot_offer', 'lot_short', 'search_update']);
  assert.deepEqual(o.more.map((x) => x.id), ['deposit_reminder']);
  o = messageOptions(replyDue);
  assert.deepEqual([o.shown.map((x) => x.id), o.more.map((x) => x.id)], [['', 'bid_lost', 'lot_offer'], ['lot_short', 'deposit_reminder']]);
  // Nothing in hand (nothing due): all of them.
  o = messageOptions(orderItem({ state: 'answered' }, { message: '' }));
  assert.deepEqual([...o.shown, ...o.more].map((x) => x.id), MESSAGES.map((m) => m.type));

  // In the store: Still searching is picked, written, asked for by name on every read, and kept by Tell and Try again.
  const a = await opened();
  const drafts = [];
  a.data.draftReply = (path, body) => {
    drafts.push(body);
    const failed = /fail/.test(body.instruction || '');
    return { ok: !failed, error: failed ? 'The model is overloaded.' : '', item: orderItem({ anchor: 'out:own-search_update', draft: failed ? { id: 60, status: 'failed', error: 'The model is overloaded.', instruction: body.instruction } : ready(61, 'Still searching, Omar.') }, { message: body.message }) };
  };
  a.data.items[KEY] = orderItem({ anchor: 'out:own-search_update', draft: null }, { message: 'search_update' });
  await a.store.actions.instead('search_update');
  assert.equal(a.store.get().picked, 'search_update');
  assert.ok(paths(a.calls).includes('GET /api/items/' + KEY + '?message=search_update'));
  assert.deepEqual(drafts[0], { instruction: undefined, message: 'search_update', followup: undefined });
  assert.equal(boxViewOf(a.store.get(), NOW).label, 'Still searching');
  await a.store.actions.tell('Say the next auction is on Friday, and fail this one');
  assert.deepEqual(drafts[1], { instruction: 'Say the next auction is on Friday, and fail this one', message: 'search_update', followup: undefined });
  const v = boxViewOf(a.store.get(), NOW);
  assert.deepEqual([v.sentence, v.button.act], ['The model is overloaded.', 'retry']);
  await a.store.actions.write({ instruction: a.store.get().item.draft.instruction });
  assert.equal(drafts[2].message, 'search_update');
  a.calls.length = 0;
  await a.store.actions.refresh();
  assert.ok(paths(a.calls).includes('GET /api/items/' + KEY + '?message=search_update'));
  // Opened again, nothing is picked: the due message is in hand once more.
  a.data.items[KEY] = orderItem({ draft: ready(41) });
  await a.store.actions.open(KEY);
  assert.equal(a.store.get().picked, null);
  await a.store.actions.tell('Shorter');
  assert.equal(drafts[3].message, 'bid_lost');
  // Answering what they wrote, the reply is written: no message is named.
  a.data.items[KEY] = orderItem({ anchor: 'in:7', dueKind: 'reply', draft: ready(45) }, { replying: true, message: '' });
  await a.store.actions.refresh();
  await a.store.actions.tell('Shorter');
  assert.equal(drafts[4].message, undefined);
});

test('They wrote this pastes and shows the reply written for it; We sent this writes nothing', async () => {
  const a = await opened(orderItem({ state: 'answered', draft: null }, { message: '', due: '' }));
  const pasted = [];
  let finish = null;
  a.data.on = {
    ['/api/items/' + KEY + '/paste']: (body) => {
      pasted.push(body);
      if (body.direction === 'out') {
        a.data.items[KEY] = orderItem({ state: 'answered', thread: [{ key: 'po:8', who: 'us', text: body.text, at: NOW }] }, { message: '', due: '' });
        return { item: a.data.items[KEY], pasteId: 8, ok: true, error: '' };
      }
      a.data.items[KEY] = orderItem({ anchor: 'in:7', dueKind: 'reply', thread: [{ key: 'in:7', who: 'customer', text: body.text, at: NOW }], draft: ready(70, 'Hi Omar, we will know after Friday.') }, { replying: true, message: '' });
      return new Promise((resolve) => { finish = () => resolve({ item: a.data.items[KEY], pasteId: 7, ok: true, error: '' }); });
    },
  };
  // They wrote this: the box says Writing… until the reply is in, then shows it.
  const going = a.store.actions.paste('in', 'Any news on the XV? I can go a bit higher if needed.');
  await settle();
  assert.equal(a.store.get().writing, KEY);
  assert.equal(boxViewOf(a.store.get(), NOW).kind, 'writing');
  finish();
  assert.equal(await going, true);
  assert.deepEqual(pasted[0], { direction: 'in', text: 'Any news on the XV? I can go a bit higher if needed.' });
  assert.equal(a.store.get().writing, null);
  const s = a.store.get();
  assert.deepEqual([boxViewOf(s, NOW).kind, s.item.draft.reply, s.item.thread[0].key], ['editor', 'Hi Omar, we will know after Friday.', 'in:7']);
  assert.ok(!paths(a.calls).some((p) => p.endsWith('/draft')), 'the server writes the reply with the paste');

  // We sent this: added to the order, nothing written, and the toast says so.
  assert.equal(await a.store.actions.paste('out', 'We will let you know after the auction.'), true);
  assert.deepEqual(pasted[1], { direction: 'out', text: 'We will let you know after the auction.' });
  assert.equal(a.store.get().toast.message, 'Added to the order. No reply is written.');
  assert.equal(a.store.get().item.thread[0].key, 'po:8');
  assert.ok(!paths(a.calls).some((p) => p.endsWith('/draft')));

  // A picked message gives way to what was pasted: the server answers with the order as it is.
  a.data.items[KEY] = orderItem({ state: 'answered', anchor: 'out:own-search_update', draft: ready(61) }, { message: 'search_update' });
  await a.store.actions.instead('search_update');
  a.data.on['/api/items/' + KEY + '/paste'] = (body) => ({ item: orderItem({ state: 'answered', thread: [{ key: 'po:9', who: 'us', text: body.text, at: NOW }] }, { message: '' }), pasteId: 9, ok: true, error: '' });
  await a.store.actions.paste('out', 'Sent from my phone.');
  assert.equal(a.store.get().picked, null);

  // The paste does not go: the error is told, the text is not taken, and the box is not left writing.
  a.data.fail.add('/paste');
  assert.equal(await a.store.actions.paste('in', 'Hello?'), false);
  assert.equal(a.store.get().toast.message, 'Network down');
  assert.equal(a.store.get().writing, null);
});

test('a pasted message keeps what was typed and offers the new suggestion', async () => {
  const a = await opened(orderItem({ draft: ready(41) }));
  a.store.actions.type('My own words for Omar');
  a.data.on = {
    ['/api/items/' + KEY + '/paste']: (body) => {
      a.data.items[KEY] = orderItem({ anchor: 'in:7', dueKind: 'reply', thread: [{ key: 'in:7', who: 'customer', text: body.text, at: NOW }], draft: ready(70, 'Hi Omar, yes we can.') }, { replying: true, message: '' });
      return { item: a.data.items[KEY], pasteId: 7, ok: true, error: '' };
    },
  };
  assert.equal(await a.store.actions.paste('in', 'Can you go higher?'), true);
  let s = a.store.get();
  assert.equal(s.typed, 'My own words for Omar');
  assert.equal(boxViewOf(s, NOW).kind, 'editor');
  assert.equal(s.context.message, 'New message from the customer. Your text is kept.');
  assert.equal(s.context.action.label, 'Use the new suggestion');
  s.context.action.run();
  s = a.store.get();
  assert.deepEqual([s.typed, s.context, s.item.draft.id], [null, null, 70]);
});

test('a paste with nothing in it is not sent, and Windows line ends are made plain', async () => {
  const a = await opened();
  const bodies = [];
  a.data.on = { ['/api/items/' + KEY + '/paste']: (body) => { bodies.push(body); return { item: a.data.items[KEY], pasteId: 3, ok: true, error: '' }; } };
  assert.equal(await a.store.actions.paste('in', ' \r\n  '), false);
  assert.equal(a.store.get().toast.message, 'There was nothing to paste.');
  assert.equal(a.store.get().writing, null);
  assert.deepEqual(bodies, []);
  assert.equal(await a.store.actions.paste('out', '  First line\r\nSecond line\rThird  '), true);
  assert.deepEqual(bodies, [{ direction: 'out', text: 'First line\nSecond line\nThird' }]);
});

test('Remove takes a pasted message out of the order', async () => {
  const thread = [{ key: 'ev:opened', who: 'us', internal: true, event: 'Auction order AS-503 opened', text: '', at: NOW - DAY },
    { key: 'in:7', who: 'customer', text: 'Any news on the XV?', at: NOW - 60e3 }, { key: 'po:8', who: 'us', text: 'We will let you know.', at: NOW }];
  const a = await opened(orderItem({ anchor: 'in:7', dueKind: 'reply', thread }, { replying: true, message: '' }));
  // Only a message pasted into an order can be taken out: what they wrote, and what we sent.
  const item = a.store.get().item;
  assert.deepEqual(item.thread.map((m) => pastedId(item, m)), [null, '7', '8']);
  assert.equal(pastedId({ key: 'c:1', thread }, thread[1]), null);
  assert.equal(pastedId(item, { key: 'm:7', who: 'customer' }), null);
  const removed = [];
  a.data.on = {
    ['/api/items/' + KEY + '/paste/7/remove']: (body) => {
      removed.push(body);
      a.data.items[KEY] = orderItem({ state: 'answered', thread: [thread[0], thread[2]] }, { message: '' });
      return { ok: true, item: a.data.items[KEY] };
    },
  };
  await a.store.actions.removePaste('7');
  assert.deepEqual(removed, [{}]);
  const s = a.store.get();
  assert.deepEqual(s.item.thread.map((m) => m.key), ['ev:opened', 'po:8']);
  // As on the old page there is no Undo: paste it again.
  assert.deepEqual([s.toast.message, s.toast.action], ['Taken out of the order.', null]);
  a.data.fail.add('/remove');
  await a.store.actions.removePaste('8');
  assert.equal(a.store.get().toast.message, 'Network down');
});

test('Copy for WhatsApp, or Copy reply when the order is answered by text, and Put back in To do after it', async () => {
  const text = 'Hello Omar, the auction is done.';
  assert.equal(mainFor({ item: orderItem(), text, checks: [], overridden: false }).label, 'Copy for WhatsApp');
  const byText = orderItem({ anchor: 'm:9', dueKind: 'reply' }, { replying: true, replyVia: 'sms', message: '' });
  assert.equal(mainFor({ item: byText, text, checks: [], overridden: false }).label, 'Copy reply');
  assert.equal(copiedWords(orderItem(), 0), 'Copied. Paste it into WhatsApp.');

  const a = await opened(orderItem({ draft: ready(41, text) }));
  await a.store.actions.copy();
  await settle();
  let s = a.store.get();
  assert.deepEqual(a.written, [text]);
  // The text copied is told to the server, as today; nothing is approved or remembered by it.
  assert.deepEqual(posts(a).map((c) => [c.path, c.body]), [['/api/items/' + KEY + '/seen', {}], ['/api/drafts/41/copied', { text }]]);
  assert.equal(s.done[KEY], DUE);
  assert.deepEqual([s.toast.message, s.toast.action.label], ['Copied. Paste it into WhatsApp.', 'Put back in To do']);
  let v = boxViewOf(s, NOW);
  assert.deepEqual([v.sentence, v.button.label, v.button.act], ['Copied at ' + clock(1000) + '.', 'Put back in To do', 'restore']);

  // Put back in To do: the message is due again on the server, and the local done mark goes.
  a.data.on = { ['/api/items/' + KEY + '/restore']: () => ({ ok: true, item: a.data.items[KEY] }) };
  await s.toast.action.run();
  await settle();
  s = a.store.get();
  assert.ok(posts(a).some((c) => c.path === '/api/items/' + KEY + '/restore'));
  assert.equal(s.done[KEY], undefined);
  assert.equal(JSON.parse(a.mem.get('wheelman.new.done'))[KEY], undefined);
  assert.equal(boxViewOf(s, NOW).kind, 'editor');

  // Copied, then put back from the box's own button: the same.
  await a.store.actions.copy();
  await settle();
  await a.store.actions.restore();
  assert.equal(a.store.get().done[KEY], undefined);
  assert.equal(posts(a).filter((c) => c.path === '/api/items/' + KEY + '/restore').length, 2);

  // A blank filled (text typed) and copied: the text is handed over, saved with its suggestion, and
  // the box says Copied. When the order moves on, nothing calls it a new message from the customer.
  a.store.actions.type('Hello Omar, the auction is done. We bid $12,000.');
  await a.store.actions.copy();
  await settle();
  s = a.store.get();
  assert.deepEqual([s.typed, s.context, a.written[a.written.length - 1]], [null, null, 'Hello Omar, the auction is done. We bid $12,000.']);
  assert.equal(boxViewOf(s, NOW).sentence, 'Copied at ' + clock(1000) + '.');
  await a.timers.advance(1000);
  assert.ok(posts(a).some((c) => c.path === '/api/drafts/41/edit' && c.body.text === 'Hello Omar, the auction is done. We bid $12,000.'));
  a.data.items[KEY] = orderItem({ state: 'answered', anchor: 'out:none', draft: null }, { message: '', due: '' });
  await a.store.actions.refresh();
  s = a.store.get();
  assert.equal(s.context, null);
  assert.equal(boxViewOf(s, NOW).sentence, 'No message is due for this order right now. Choose a message to write it anyway.');
});

test('Undo after Dismiss and Put back after Copy bring back what was typed, and Put back names the suggestion copied', async () => {
  const a = await opened(orderItem({ draft: ready(41) }));
  const restores = [];
  let land = null;
  a.data.on = {
    ['/api/items/' + KEY + '/restore']: (body) => { restores.push(body); return { ok: true, item: a.data.items[KEY] }; },
    ['/api/items/' + KEY + '/dismiss']: () => ({ ok: true }),
    // The copy's own record is slow to land the first time.
    '/api/drafts/41/copied': () => new Promise((resolve) => { land = () => { land = null; resolve({ ok: true }); }; }),
  };
  const words = 'Hello Omar, we bid $12,000.';
  a.store.actions.type(words);
  await a.store.actions.copy();
  await settle();
  assert.equal(a.store.get().typed, null);
  // Put back pressed at once waits for the copy to be recorded, then names it.
  const back = a.store.get().toast.action.run();
  await settle();
  assert.deepEqual(restores, [], 'not before the copy is recorded');
  land();
  await back;
  assert.deepEqual(restores, [{ draftId: 41 }]);
  let s = a.store.get();
  assert.deepEqual([s.typed, boxViewOf(s, NOW).kind, s.done[KEY]], [words, 'editor', undefined]);

  // Copied again, and put back from the box's own button while it says Copied: the same.
  a.data.on['/api/drafts/41/copied'] = () => ({ ok: true });
  await a.store.actions.copy();
  await settle();
  assert.equal(boxViewOf(a.store.get(), NOW).button.act, 'restore');
  await a.store.actions.restore();
  assert.deepEqual(restores.at(-1), { draftId: 41 });
  assert.equal(a.store.get().typed, words);

  // Dismissed with the text typed, then Undo: nothing copied is named, and the words come back.
  await a.store.actions.dismiss();
  assert.equal(a.store.get().typed, null);
  await a.store.get().toast.action.run();
  await settle();
  assert.deepEqual(restores.at(-1), {});
  s = a.store.get();
  assert.deepEqual([s.typed, boxViewOf(s, NOW).kind], [words, 'editor']);

  // Copied with nothing typed: Put back shows the suggestion, and puts nothing else in the box.
  const b = await opened(orderItem({ draft: ready(41) }));
  b.data.on = { ['/api/items/' + KEY + '/restore']: (body) => ({ ok: true, item: b.data.items[KEY], body }) };
  await b.store.actions.copy();
  await settle();
  await b.store.get().toast.action.run();
  await settle();
  assert.equal(b.store.get().typed, null);
  assert.deepEqual(b.calls.filter((c) => c.path.endsWith('/restore')).map((c) => c.body), [{ draftId: 41 }]);
});

test('Put back of the first of two messages copied on one order never brings back the words of the other', async () => {
  const a = await opened(orderItem({ draft: ready(41, 'Due message') }));
  const restores = [];
  // 1. Jim's words for the due message, copied; they are saved with its suggestion.
  a.store.actions.type('Due message, we bid $12,000');
  await a.store.actions.copy();
  await a.timers.advance(1000);
  const savedDue = a.data.items[KEY].draft;
  assert.equal(savedDue.edited, 'Due message, we bid $12,000');
  // 2. Deposit reminder picked, words of its own, copied.
  a.data.items[KEY] = orderItem({ anchor: 'out:own-deposit_reminder', state: 'answered', draft: ready(50, 'Deposit reminder text') }, { handled: 'copied', message: 'deposit_reminder' });
  await a.store.actions.instead('deposit_reminder');
  a.store.actions.type('Deposit reminder text, thanks Omar');
  await a.store.actions.copy();
  await a.timers.advance(1000);
  // 3. Another conversation, then the order again: the due message says it was copied.
  a.data.items[KEY] = orderItem({ state: 'answered', draft: savedDue }, { handled: 'copied', message: '' });
  await a.store.actions.open('c:1');
  await a.store.actions.open(KEY);
  assert.equal(boxViewOf(a.store.get(), NOW).button.label, 'Put back in To do');
  // 4. Put back in To do: the due message comes back with its own saved words, not the reminder's.
  a.data.on = { ['/api/items/' + KEY + '/restore']: (body) => { restores.push(body); a.data.items[KEY] = orderItem({ draft: savedDue }); return { ok: true, item: a.data.items[KEY] }; } };
  await a.store.actions.restore();
  await settle();
  let s = a.store.get();
  assert.deepEqual([s.item.draft.id, s.typed, boxViewOf(s, NOW).kind], [41, null, 'editor']);
  await a.timers.advance(1000);
  assert.equal(a.data.items[KEY].draft.edited, 'Due message, we bid $12,000', 'its saved edit is not written over');
  assert.ok(!a.calls.some((c) => c.path === '/api/drafts/41/edit' && c.body.text === 'Deposit reminder text, thanks Omar'));
  // The reminder's words still come back with the reminder, from its own toast.
  a.data.items[KEY] = orderItem({ anchor: 'out:own-deposit_reminder', draft: ready(50, 'Deposit reminder text') }, { message: 'deposit_reminder' });
  await a.store.actions.instead('deposit_reminder');
  a.store.actions.type('Deposit reminder text, thanks Omar');
  await a.store.actions.copy();
  await settle();
  a.data.on['/api/items/' + KEY + '/restore'] = (body) => { restores.push(body); return { ok: true, item: a.data.items[KEY] }; };
  await a.store.get().toast.action.run();
  await settle();
  s = a.store.get();
  assert.deepEqual([restores.at(-1), s.typed], [{ draftId: 50 }, 'Deposit reminder text, thanks Omar']);
});

/**
 * Older words for the due message, copied; the toast's Put back pressed with another conversation
 * open, so they are not given back there. Then the message again: newer words, saved; away and
 * back, so nothing is typed and the box shows the newer saved words.
 */
async function newerSaved() {
  const a = await opened(orderItem({ draft: ready(41, 'Due message') }));
  a.data.rows = [row(KEY, { anchor: DUE }), row('c:1')];
  a.data.on = { ['/api/items/' + KEY + '/restore']: () => ({ ok: true, item: a.data.items[KEY] }), ['/api/items/' + KEY + '/dismiss']: () => ({ ok: true }) };
  a.store.actions.type('Due message, older words');
  await a.store.actions.copy();
  await a.timers.advance(1000);
  const toast = a.store.get().toast;
  await a.store.actions.open('c:1');
  await toast.action.run();
  await settle();
  await a.store.actions.open(KEY);
  a.store.actions.type('Due message, newer words');
  await a.timers.advance(1000);
  await a.store.actions.open('c:1');
  await a.store.actions.open(KEY);
  assert.deepEqual([a.store.get().typed, a.data.items[KEY].draft.edited], [null, 'Due message, newer words']);
  return a;
}

/** After the Put back or the Undo: nothing typed, the newer saved words in the box and on the server. */
async function newerKept(a) {
  await settle();
  await a.timers.advance(1000);
  const s = a.store.get();
  assert.deepEqual([s.typed, a.data.items[KEY].draft.edited, boxViewOf(s, NOW).kind], [null, 'Due message, newer words', 'editor']);
}

test('words kept from an earlier copy never come back over a newer edit, after Copy with nothing typed and Put back', async () => {
  const a = await newerSaved();
  await a.store.actions.copy();
  await settle();
  assert.equal(a.written.at(-1), 'Due message, newer words');
  await a.store.get().toast.action.run();
  await newerKept(a);
});

test('words kept from an earlier copy never come back over a newer edit, after Dismiss with nothing typed and Undo', async () => {
  const a = await newerSaved();
  await a.store.actions.dismiss();
  assert.equal(a.store.get().toast.message, 'Dismissed');
  await a.store.get().toast.action.run();
  await newerKept(a);
});

test('We sent this or Remove under typed text says what is due has changed, and offers the new suggestion', async () => {
  const a = await opened(orderItem({ draft: ready(41) }));
  a.data.on = {
    ['/api/items/' + KEY + '/paste']: () => {
      a.data.items[KEY] = orderItem({ anchor: 'out:offer-2006629', draft: ready(60, 'Car found') }, { message: 'lot_offer' });
      return { item: a.data.items[KEY], pasteId: 8, ok: true, error: '' };
    },
    ['/api/items/' + KEY + '/paste/8/remove']: () => {
      a.data.items[KEY] = orderItem({ anchor: DUE, draft: null });
      return { ok: true, item: a.data.items[KEY] };
    },
  };
  a.store.actions.type('My own words');
  assert.equal(await a.store.actions.paste('out', 'We will let you know.'), true);
  let s = a.store.get();
  assert.deepEqual([s.typed, s.context.message, s.context.action.label], ['My own words', 'What is due on this order has changed. Your text is kept.', 'Use the new suggestion']);
  await a.store.actions.removePaste('8');
  s = a.store.get();
  assert.deepEqual([s.typed, s.context.message, s.context.action], ['My own words', 'What is due on this order has changed. Your text is kept.', null]);
  // With nothing typed, the box simply shows what is due now.
  const b = await opened(orderItem({ draft: ready(41) }));
  b.data.on = { ['/api/items/' + KEY + '/paste']: () => ({ item: orderItem({ anchor: 'out:offer-2006629', draft: ready(60, 'Car found') }, { message: 'lot_offer' }), pasteId: 8, ok: true, error: '' }) };
  await b.store.actions.paste('out', 'We will let you know.');
  assert.deepEqual([b.store.get().context, b.store.get().item.draft.id], [null, 60]);
});

test('a suggestion that could not be written, with words saved beside it, says Copied once it is copied', async () => {
  const failed = { id: 43, status: 'failed', error: 'The model is overloaded.', reply: '', edited: 'My own words for Omar', checks: [] };
  // Before the copy its saved words are in the editor; copied, the box says so.
  assert.equal(orderBox({ item: orderItem({ draft: failed }) }).kind, 'editor');
  assert.equal(orderBox({ item: orderItem({ draft: failed }), done: true, doneAt: NOW }).sentence, 'Copied at ' + clock(NOW) + '.');
  const a = await opened(orderItem({ draft: failed }));
  assert.equal(boxViewOf(a.store.get(), NOW).kind, 'editor');
  await a.store.actions.copy();
  await settle();
  assert.deepEqual(a.written, ['My own words for Omar']);
  assert.equal(boxViewOf(a.store.get(), NOW).sentence, 'Copied at ' + clock(1000) + '.');
});

test('Remove and Their texts send one request at a time, however often they are pressed', async () => {
  const a = await opened(orderItem({ thread: [{ key: 'in:7', who: 'customer', text: 'Hi', at: NOW }] }));
  let release = null;
  const hold = (answer) => () => new Promise((resolve) => { release = () => resolve(answer()); });
  a.data.on = {
    ['/api/items/' + KEY + '/paste/7/remove']: hold(() => ({ ok: true, item: a.data.items[KEY] })),
    '/api/items/c:113/move': hold(() => ({ ok: true, from: 'auction', item: { key: 'c:113' } })),
  };
  const count = (end) => a.calls.filter((c) => c.path.endsWith(end)).length;
  const first = a.store.actions.removePaste('7');
  await a.store.actions.removePaste('7');
  release();
  await first;
  assert.equal(count('/paste/7/remove'), 1);
  // Once it is done, it can be pressed again.
  const again = a.store.actions.removePaste('7');
  release();
  await again;
  assert.equal(count('/paste/7/remove'), 2);
  const move = a.store.actions.moveTexts('dashboard');
  await a.store.actions.moveTexts('dashboard');
  await a.store.actions.moveTexts('auction');
  release();
  await move;
  assert.equal(count('/move'), 1);
});

test('Their texts go to Dashboard and back, with Undo', async () => {
  const a = await opened();
  const moves = [];
  const move = (body) => {
    moves.push(body);
    const here = body.section === 'auction';
    a.data.items[KEY] = orderItem({ draft: ready(41) }, { texts: { key: 'c:113', here } });
    return { ok: true, from: here ? 'dashboard' : 'auction', item: { key: 'c:113', section: body.section }, writing: false };
  };
  a.data.on = { '/api/items/c:113/move': move };
  a.calls.length = 0;
  await a.store.actions.moveTexts('dashboard');
  assert.deepEqual(moves, [{ section: 'dashboard' }]);
  let s = a.store.get();
  assert.deepEqual([s.toast.message, s.toast.action.label], ['Their texts are answered in Dashboard now.', 'Undo']);
  // Then the list and the order are read again: Their texts say where they are answered now.
  assert.ok(paths(a.calls).includes('GET /api/items/' + KEY));
  assert.equal(s.item.order.texts.here, false);
  let sec = orderSections(s.item.order, NOW).find((x) => x.title === 'Their texts');
  assert.deepEqual([sec.notes, sec.move], [['Their texts are answered in Dashboard, as an ordinary conversation, not on this order.'], { label: 'Answer their texts on this order', section: 'auction' }]);

  // Undo moves them back to where they were.
  await s.toast.action.run();
  await settle();
  assert.deepEqual(moves[1], { section: 'auction' });
  s = a.store.get();
  assert.equal(s.item.order.texts.here, true);
  sec = orderSections(s.item.order, NOW).find((x) => x.title === 'Their texts');
  assert.deepEqual([sec.notes, sec.move], [['Their texts and website enquiries on the dashboard are answered on this order: a new one puts it in To do.'], { label: 'Answer their texts in Dashboard', section: 'dashboard' }]);

  // And from Dashboard onto the order: the only move into Auction made by hand.
  await a.store.actions.moveTexts('auction');
  assert.deepEqual(moves[2], { section: 'auction' });
  assert.equal(a.store.get().toast.message, 'Their texts are answered on this order now.');
  a.data.fail.add('/move');
  await a.store.actions.moveTexts('dashboard');
  assert.equal(a.store.get().toast.message, 'Network down');
});

test('the Order tab lists the order, its car and what was charged and paid', () => {
  const day = (ms) => listTime(ms, NOW);
  let secs = orderSections(orderOf(), NOW);
  assert.deepEqual(secs.map((s) => s.title), ['Auction order', 'Looking for, from Japan', 'Auction car on this order', 'Charged and paid', 'Their texts']);
  const [order, looking, lot, money] = secs;
  // Empty rows are left out: no follow-up, not secured, not completed.
  assert.deepEqual(order.rows, [['Order', 'AS-503'], ['Stage', 'Bid placed'], ['To do', 'Send: bid lost, still searching'], ['Deposit', 'Paid, $1,650'], ['Opened', day(NOW - 20 * DAY)]]);
  assert.deepEqual(order.notes, ['The auction has been held.', 'Latest staff note: Bid placed at 250,000 yen (' + day(NOW - 2 * DAY) + ')']);
  assert.deepEqual(looking.rows, [['Car', 'Subaru XV Hybrid 2014–2015 (GPE)'], ['Target bid', '¥226,000'], ['Budget', 'about $10,450 landed']]);
  assert.deepEqual(looking.notes, ['A light colour if possible.']);
  assert.deepEqual(lot.rows, [['Car', '2015 SUBARU SUBARU XV'], ['Odometer', '121,000 km'], ['Auction grade', '3.5'], ['Auction', '2026-10-29, MIRIVE Saitama, lot 10025']]);
  assert.deepEqual(lot.link, { label: 'Page', text: 'Open on the website', url: 'https://www.carbarn.com.au/auction/1992541' });
  assert.deepEqual(money.rows, [['Deposit for auction bidding', '$1,650'], ['Total charged', '$1,650'], ['Paid', '$1,650'], ['Still due', 'Nothing']]);
  assert.deepEqual(money.notes, ['Payments: $1,650 on ' + day(NOW - 3 * DAY) + '.']);

  // A car found in the coming auctions, and a car secured, with the deposit asked and money still due.
  secs = orderSections(orderOf({
    deposit: { state: 'Not paid', paid: 0, asked: 1650 }, staffNote: null, why: '', followUp: 'A follow-up is due', lot: null,
    found: { title: '2015 SUBARU SUBARU XV', grade: '4', km: 73000, auctionDate: '2026-10-29T00:00:00', url: 'javascript:alert(1)', seenAt: NOW - 3600e3 },
    car: { title: '2021 Toyota Hiace DX', km: 60000, grade: '4', colour: 'WHITE', stockNo: 'T88', where: 'Still in Japan' },
    money: { lines: [{ description: 'Deposit for auction bidding', amount: 1650 }, { description: 'Car price in Japan', amount: 8415 }], payments: [], total: 10065, paid: 1650, due: 8415 },
    dates: { opened: NOW - 20 * DAY, secured: NOW - DAY, completed: null }, texts: null,
  }), NOW);
  assert.deepEqual(secs.map((s) => s.title), ['Auction order', 'Looking for, from Japan', 'Found in the coming auctions', 'Car secured', 'Charged and paid']);
  assert.deepEqual(secs[0].rows.find((r) => r[0] === 'Deposit'), ['Deposit', 'Not paid, $1,650 asked']);
  assert.deepEqual(secs[0].rows.find((r) => r[0] === 'Dashboard says'), ['Dashboard says', 'A follow-up is due']);
  assert.deepEqual(secs[0].rows.find((r) => r[0] === 'Car secured'), ['Car secured', day(NOW - DAY)]);
  assert.deepEqual(secs[0].notes, []);
  assert.deepEqual(secs[2].rows.find((r) => r[0] === 'Auction'), ['Auction', '2026-10-29']);
  assert.equal(secs[2].link, null, 'only a web address is a link');
  assert.deepEqual(secs[2].notes, ['The best match when the live auction was last looked at, ' + ago(NOW - 3600e3, NOW) + '.']);
  assert.deepEqual(secs[3].rows, [['Car', '2021 Toyota Hiace DX'], ['Odometer', '60,000 km'], ['Auction grade', '4'], ['Colour', 'white'], ['Where it is', 'Still in Japan'], ['Stock number', 'T88']]);
  assert.deepEqual(secs[4].rows.slice(-3), [['Total charged', '$10,065'], ['Paid', '$1,650'], ['Still due', '$8,415']]);
  assert.deepEqual(secs[4].notes, []);
  // Nothing charged or paid: no money section.
  assert.ok(!orderSections(orderOf({ money: { lines: [], payments: [], total: 0, paid: 0, due: 0 } }), NOW).some((s) => s.title === 'Charged and paid'));

  // The strip above the conversation: the car, the stage, the deposit and the auction car's page.
  assert.deepEqual(orderStrip(orderItem()), { title: '2015 SUBARU SUBARU XV', stage: 'Bid placed', finished: false, deposit: 'Deposit: paid', url: 'https://www.carbarn.com.au/auction/1992541' });
  const found = orderStrip(orderItem({ car: '' }, { lot: null, found: { url: 'https://www.carbarn.com.au/auction/2006629' }, finished: true, stage: 'Completed' }));
  assert.deepEqual(found, { title: 'No car named yet', stage: 'Completed', finished: true, deposit: 'Deposit: paid', url: 'https://www.carbarn.com.au/auction/2006629' });
  assert.equal(orderStrip(orderItem({}, { lot: { url: 'ftp://example.com/x' }, found: null })).url, '');
});
