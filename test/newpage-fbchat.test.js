// The new page's Facebook chats: written when opened, once; a write the AI refuses said in the box;
// and what the Marketplace engine's auto-reply is doing, in the chat, the panel and the list.
// Invented data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { boxViewOf, sectionBox } from '../web/new/js/boxsections.js';
import { boxViewOf as fromModel } from '../web/new/js/model.js';
import { marketplacePills, listingStrip, marketplaceRows, marketplaceDown } from '../web/new/js/fbchat.js';
import { sectionRowView } from '../web/new/js/sections.js';
import { clock } from '../web/lib/format.js';
import { setup, draft, row, settle } from './support/newpage-fakes.js';

const MIN = 60e3;
// A buyer waiting on us, as GET /api/items/mp:501 answers: the server says it is written when opened.
const BUYER = { key: 'mp:501', anchor: 'fm:1', name: 'Liam Invented', channel: 'marketplace', section: 'marketplace', state: 'awaiting', writeOnOpen: true, dismissed: false, draft: null, writing: false, marketplace: { account: 'Yard phone 1' } };
const writesOf = (a) => a.calls.filter((c) => c.path === '/api/items/mp:501/draft');
const TRY_AGAIN = { label: 'Try again', act: 'retry', main: true };

test('opening a waiting chat writes it once, and opening it again while it is written writes nothing more', async () => {
  const a = setup();
  a.data.items['mp:501'] = { ...BUYER };
  let release = null;
  a.data.draftReply = () => {
    // As the server does: while a suggestion is being written, the chat says so.
    a.data.items['mp:501'] = { ...BUYER, writing: true };
    return new Promise((resolve) => {
      release = () => { a.data.items['mp:501'] = { ...BUYER, draft: draft(99, { reply: 'Yes, it is still here.' }) }; resolve({ ok: true, item: a.data.items['mp:501'], error: '' }); };
    });
  };
  const first = a.store.actions.open('mp:501');
  await settle();
  assert.equal(writesOf(a).length, 1, 'written as it opens');
  assert.deepEqual(writesOf(a)[0].body, { instruction: undefined, message: undefined, followup: undefined }, 'a plain write, as Write it now');
  assert.equal(boxViewOf(a.store.get(), 5000).kind, 'writing', 'the box reads Writing…');

  // Opened again while it is written: from the list, Back and forward, and the 20 s refresh.
  a.store.actions.open('mp:501');
  await settle();
  await a.store.actions.open('c:1');
  a.store.actions.open('mp:501');
  await settle();
  await a.store.actions.refresh();
  assert.equal(writesOf(a).length, 1, 'nothing more is asked');
  release();
  await first;
  await settle();
  assert.equal(a.store.get().item.draft.reply, 'Yes, it is still here.');
  assert.equal(boxViewOf(a.store.get(), 5000).kind, 'editor');

  // Written: opening it again shows the suggestion and asks nothing.
  await a.store.actions.open('c:1');
  await a.store.actions.open('mp:501');
  assert.equal(writesOf(a).length, 1);

  // A new buyer message while it is open is not written by itself.
  a.data.items['mp:501'] = { ...BUYER, anchor: 'fm:2' };
  await a.store.actions.refresh();
  assert.equal(writesOf(a).length, 1);
  const view = boxViewOf(a.store.get(), 5000);
  assert.equal(view.sentence, 'No suggestion yet.');
  assert.deepEqual(view.button, { label: 'Write it now', act: 'write', main: true });

  // Reopened before the server has begun (it does not say writing yet): the page's own write counts.
  const b = setup();
  b.data.items['mp:501'] = { ...BUYER };
  let done = null;
  b.data.draftReply = () => new Promise((resolve) => { done = () => resolve({ ok: true, item: { ...BUYER, draft: draft(98) }, error: '' }); });
  const opening = b.store.actions.open('mp:501');
  await settle();
  b.store.actions.open('mp:501');
  await settle();
  assert.equal(writesOf(b).length, 1);
  done();
  await opening;
});

test('a write on open never holds up opening: boot resolves before the write\'s answer arrives, and the box reads Writing… meanwhile', async () => {
  const listed = { sections: { marketplace: { rows: [row('mp:501', { section: 'marketplace', state: 'awaiting' })], counts: { waiting: 1, all: 1 } } } };
  const slowWrite = (a) => {
    const answers = [];
    a.data.items['mp:501'] = { ...BUYER };
    a.data.draftReply = () => new Promise((resolve) => answers.push(() => resolve({ ok: true, item: { ...BUYER, draft: draft(96, { reply: 'Yes, it is still here.' }) }, error: '' })));
    return answers;
  };

  // A reload on the chat's address: boot is done once the conversation is in, not once it is written.
  const a = setup(listed);
  const answers = slowWrite(a);
  let booted = false;
  const boot = a.store.actions.boot({ section: 'marketplace', chip: 'waiting', key: 'mp:501' }, { wide: true }).then(() => { booted = true; });
  await settle();
  assert.equal(answers.length, 1, 'the write was asked for');
  assert.equal(booted, true, 'boot resolved while the write is on its way');
  const s = a.store.get();
  assert.deepEqual([s.section, s.key, s.itemState], ['marketplace', 'mp:501', 'ready']);
  assert.equal(boxViewOf(s, 5000).kind, 'writing');
  answers[0]();
  await boot;
  await settle();
  assert.equal(a.store.get().item.draft.reply, 'Yes, it is still here.');
  assert.equal(writesOf(a).length, 1);

  // Switching to Marketplace on a wide window: its first chat opens, and setSection is done as it is in.
  const b = setup(listed);
  const later = slowWrite(b);
  await b.store.actions.boot({ section: 'dashboard', chip: 'waiting', key: 'c:1' }, { wide: true });
  let switched = false;
  const going = b.store.actions.setSection('marketplace', { chip: 'waiting', wide: true }).then(() => { switched = true; });
  await settle();
  assert.equal(switched, true, 'setSection resolved while the write is on its way');
  assert.equal(b.store.get().key, 'mp:501');
  assert.equal(boxViewOf(b.store.get(), 5000).kind, 'writing');
  assert.equal(writesOf(b).length, 1);
  later[0]();
  await going;
  await settle();
  assert.equal(boxViewOf(b.store.get(), 5000).kind, 'editor');
});

test('a chat written on open that the AI refuses says why and offers Try again', async () => {
  const ALLOWANCE = 'The AI models used for Marketplace have used up their allowance for today. Try again after Thu 29 Oct, 4:05 pm.';
  const BUDGET = "This month's AI budget of A$50 is used, and no free model is set up for marketplace chats. Dashboard suggestions continue; this starts again on 1 November.";

  // A failed suggestion carrying the allowance words: told as a failed suggestion is today.
  let a = setup();
  a.data.items['mp:501'] = { ...BUYER };
  a.data.draftReply = () => ({ ok: false, error: ALLOWANCE, item: { ...BUYER, draft: draft(97, { status: 'failed', reply: '', error: ALLOWANCE }) } });
  await a.store.actions.open('mp:501');
  await settle(); // the write on open goes on after the open has resolved
  let view = boxViewOf(a.store.get(), 5000);
  assert.equal(view.kind, 'quiet');
  assert.equal(view.tone, 'bad');
  assert.equal(view.sentence, 'A suggestion could not be written. ' + ALLOWANCE);
  assert.deepEqual(view.button, TRY_AGAIN);
  assert.equal(a.store.get().writeFailed, null, 'the failed suggestion tells it');

  // An answer with the reason and no suggestion (the budget used): the box says it, not only a toast.
  a = setup();
  a.data.items['mp:501'] = { ...BUYER };
  a.data.draftReply = () => ({ ok: false, error: BUDGET, item: { ...BUYER } });
  await a.store.actions.open('mp:501');
  await settle();
  assert.deepEqual(a.store.get().writeFailed, { key: 'mp:501', message: BUDGET });
  assert.deepEqual(boxViewOf(a.store.get(), 5000), { kind: 'quiet', tone: 'bad', sentence: BUDGET, button: TRY_AGAIN, tell: true });

  // The request itself failing.
  a = setup();
  a.data.items['mp:501'] = { ...BUYER };
  a.data.fail.add('/draft');
  await a.store.actions.open('mp:501');
  await settle();
  assert.deepEqual(a.store.get().writeFailed, { key: 'mp:501', message: 'Network down' });
  assert.deepEqual(boxViewOf(a.store.get(), 5000), { kind: 'quiet', tone: 'bad', sentence: 'Network down', button: TRY_AGAIN, tell: true });
  // Typed meanwhile: the text stays in the editor, and the reason is above it.
  a.store.actions.type('Yes, still here.');
  assert.deepEqual(boxViewOf(a.store.get(), 5000), { kind: 'editor', context: '', failure: 'Network down Your text is kept.' });
  // Try again: the words go as the write starts, and the suggestion comes.
  a.data.fail.delete('/draft');
  const trying = a.store.actions.write({});
  assert.equal(a.store.get().writeFailed, null);
  assert.equal(boxViewOf(a.store.get(), 5000).kind, 'writing');
  await trying;
  assert.equal(a.store.get().writeFailed, null);
  assert.deepEqual(boxViewOf(a.store.get(), 5000), { kind: 'editor', context: '' });

  // Another conversation opened: the words were for the chat, and go.
  a.data.fail.add('/draft');
  a.data.items['mp:501'] = { ...BUYER };
  await a.store.actions.open('mp:501');
  await settle();
  assert.equal(a.store.get().writeFailed.key, 'mp:501');
  await a.store.actions.open('c:1');
  assert.equal(a.store.get().writeFailed, null);

  // The run bar and the message box read one view, whichever module they import it from.
  assert.equal(fromModel, boxViewOf);
});

test('sectionBox: a refused write is told only where a write could be asked, and only with no ready suggestion', () => {
  const failed = { key: 'mp:501', message: 'Wheelman is not responding. Check that it is running.' };
  const item = { ...BUYER };
  assert.deepEqual(sectionBox({ item, writeFailed: failed }), { kind: 'quiet', tone: 'bad', sentence: failed.message, button: TRY_AGAIN, tell: true });
  // For another conversation, or none: as boxView says.
  assert.equal(sectionBox({ item, writeFailed: { ...failed, key: 'mp:502' } }).sentence, 'No suggestion yet.');
  assert.equal(sectionBox({ item, writeFailed: null }).sentence, 'No suggestion yet.');
  // A ready suggestion in the box stays, as today.
  assert.deepEqual(sectionBox({ item: { ...item, draft: draft(5) }, writeFailed: failed }), { kind: 'editor', context: '' });
  // Writing, copied, opted out and dismissed come first.
  assert.equal(sectionBox({ item, writeFailed: failed, writing: true }).kind, 'writing');
  assert.equal(sectionBox({ item, writeFailed: failed, done: true }).sentence, 'Copied.');
  assert.equal(sectionBox({ item: { ...item, state: 'optout' }, writeFailed: failed }).sentence, 'This customer asked not to be contacted. Do not reply.');
  assert.match(sectionBox({ item: { ...item, dismissed: true }, writeFailed: failed }).sentence, /^You dismissed this conversation/);
  // A failed suggestion with its own words is newer news only when no write followed it.
  const older = { ...item, draft: draft(6, { status: 'failed', reply: '', error: 'The model is overloaded.' }) };
  assert.equal(sectionBox({ item: older }).sentence, 'A suggestion could not be written. The model is overloaded.');
  assert.equal(sectionBox({ item: older, writeFailed: failed }).sentence, failed.message);
  // An edit kept beside a failed suggestion stays in the editor, with the reason.
  const kept = { ...item, draft: draft(7, { status: 'failed', reply: '', error: 'x', edited: 'My words' }) };
  assert.deepEqual(sectionBox({ item: kept, writeFailed: failed }), { kind: 'editor', context: '', failure: failed.message + ' Your text is kept.' });
});

test("the auto-reply's pills say what it is doing with the chat", () => {
  const NOW = Date.UTC(2026, 9, 28, 1, 0);
  const chat = (m, o = {}) => ({ key: 'mp:1', state: 'awaiting', marketplace: { locked: false, stage: 'opened', lockReason: '', failed: 0, replyComing: false, queuedAt: null, ...m }, ...o });
  assert.deepEqual(marketplacePills(chat({}), NOW), []);
  assert.deepEqual(marketplacePills({ key: 'c:1', state: 'awaiting', marketplace: null }, NOW), []);
  assert.deepEqual(marketplacePills(chat({ locked: true, lockReason: 'Asked to speak to a person' }), NOW),
    [{ tone: 'info', text: 'The auto-reply has handed this chat to a person: Asked to speak to a person.' }]);
  assert.deepEqual(marketplacePills(chat({ stage: 'handed_off' }), NOW), [{ tone: 'info', text: 'The auto-reply has handed this chat to a person.' }]);
  assert.deepEqual(marketplacePills(chat({ failed: 2 }), NOW), [{ tone: 'bad', text: '2 replies from the Marketplace system failed to send.' }]);
  assert.equal(marketplacePills(chat({ failed: 1 }), NOW)[0].text, '1 reply from the Marketplace system failed to send.');
  // Queued 15 minutes or more: probably stuck. Less, or no time known: it may answer first.
  assert.deepEqual(marketplacePills(chat({ replyComing: true, queuedAt: NOW - 20 * MIN }), NOW),
    [{ tone: 'warn', text: 'The auto-reply wrote an answer 20 min ago, but it has not been sent.' }]);
  assert.equal(marketplacePills(chat({ replyComing: true, queuedAt: NOW - 15 * MIN }), NOW)[0].tone, 'warn');
  const soon = [{ tone: 'info', text: 'An auto-reply is queued for this chat and may answer first.' }];
  assert.deepEqual(marketplacePills(chat({ replyComing: true, queuedAt: NOW - 14 * MIN }), NOW), soon);
  assert.deepEqual(marketplacePills(chat({ replyComing: true }), NOW), soon);
  assert.deepEqual(marketplacePills(chat({ replyComing: true }, { state: 'answered' }), NOW), [], 'only while the buyer waits');
  // Each that applies, in the old page's order.
  assert.deepEqual(marketplacePills(chat({ locked: true, failed: 1 }), NOW).map((p) => p.tone), ['info', 'bad']);
});

test('a listing not in the stock list has its own strip, and the panel lists what the engine knows', () => {
  const m = {
    account: 'Yard phone 1', listingTitle: '2020 Toyota Hiace DX', listingPrice: '$33,900', listingUrl: 'https://www.facebook.com/marketplace/item/357924',
    autoReply: true, stage: 'handed_off', locked: true, lockReason: 'Asked to speak to a person', lockDetail: 'The buyer asked twice.', nextAction: 'Call the buyer about the Hiace', notes: ['Budget: $20,000', 'Trade-in: none'],
  };
  assert.deepEqual(listingStrip({ vehicle: null, marketplace: m }), { title: '2020 Toyota Hiace DX', note: 'Not in the stock list', url: 'https://www.facebook.com/marketplace/item/357924' });
  assert.equal(listingStrip({ vehicle: { title: '2020 Toyota Hiace DX', stockNo: '1201' }, marketplace: m }), null, 'a car in the stock list has the car strip');
  assert.equal(listingStrip({ vehicle: null, marketplace: { ...m, listingTitle: '' } }), null);
  assert.equal(listingStrip({ vehicle: null, marketplace: null }), null);
  assert.equal(listingStrip({ vehicle: null, marketplace: { ...m, listingUrl: 'javascript:alert(1)' } }).url, '', 'only an http or https link');

  const { rows, notes } = marketplaceRows(m);
  assert.deepEqual(rows, [
    { label: 'Seller account', value: 'Yard phone 1' },
    { label: 'Listing', value: '2020 Toyota Hiace DX' },
    { label: 'Price on Facebook', value: '$33,900' },
    { label: 'Auto-reply', value: 'On for this chat' },
    { label: 'Stage', value: 'handed off' },
    { label: 'Handed to a person', value: 'Asked to speak to a person' },
    { label: 'Why', value: 'The buyer asked twice.' },
    { label: 'Suggested next step', value: 'Call the buyer about the Hiace' },
    { label: 'Open', value: 'The listing on Facebook', url: 'https://www.facebook.com/marketplace/item/357924' },
  ]);
  assert.deepEqual(notes, { title: 'Noted by the auto-reply', items: ['Budget: $20,000', 'Trade-in: none'], fine: 'These notes were made automatically and have not been checked.' });

  // Still with the auto-reply: nothing about a person, a plain price made money, and no empty rows.
  const plain = marketplaceRows({ account: 'Yard phone 1', listingTitle: '', listingPrice: '28900', listingUrl: 'ftp://example.com/x', autoReply: false, stage: '', locked: false, lockReason: '', lockDetail: 'old detail', nextAction: '', notes: [] });
  assert.deepEqual(plain.rows, [
    { label: 'Seller account', value: 'Yard phone 1' },
    { label: 'Price on Facebook', value: '$28,900' },
    { label: 'Auto-reply', value: 'Off for this chat' },
  ]);
  assert.equal(plain.notes, null);
  assert.equal(marketplaceRows({ ...m, lockReason: '', listingPrice: 'Free' }).rows.find((r) => r.label === 'Handed to a person').value, 'Yes');
  assert.equal(marketplaceRows({ ...m, listingPrice: 'Free' }).rows.find((r) => r.label === 'Price on Facebook').value, 'Free');
});

test('the Marketplace section says when Marketplace was not reached', () => {
  const at = Date.UTC(2026, 9, 27, 23, 42);
  assert.equal(marketplaceDown({ marketplace: { enabled: true, lastSync: { ok: false, at, message: 'The content engine could not be reached.' } } }),
    'Marketplace not reached since ' + clock(at) + '. The chats here are from the last good read.');
  assert.equal(marketplaceDown({ marketplace: { enabled: true, lastSync: { ok: true, at } } }), '');
  assert.equal(marketplaceDown({ marketplace: { enabled: false, lastSync: null } }), '');
  assert.equal(marketplaceDown({ marketplace: null }), '');
  assert.equal(marketplaceDown(null), '');
});

test('a chat that needs a person says Needs you on its row, when nothing else is said there', () => {
  const r = row('mp:503', { needsPerson: true, unanswered: 2, state: 'awaiting', preview: { who: 'customer', text: 'Can I come and see it on Saturday?' } });
  const v = sectionRowView(r, { now: 0 }, 'marketplace');
  assert.equal(v.reason, 'Needs you');
  assert.equal(v.tone, 'info');
  assert.equal(sectionRowView({ ...r, unanswered: 0 }, { now: 0 }, 'marketplace').reason, '', 'answered: no one is waiting');
  assert.equal(sectionRowView({ ...r, needsPerson: false }, { now: 0 }, 'marketplace').reason, '');
  const failing = sectionRowView({ ...r, flag: 'fail' }, { now: 0 }, 'marketplace');
  assert.deepEqual([failing.reason, failing.tone], ['Check failed', ''], 'the row view\'s own reason comes first');
  // Moved to the Dashboard, it still says so.
  assert.equal(sectionRowView(r, { now: 0 }, 'dashboard').reason, 'Needs you');
});
