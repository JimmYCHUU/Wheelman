// The reply run: the ten newest in Needs reply, the oldest of them first; Copy then the next customer,
// Skip, Dismiss, End run and the summary (web/new/js/runstore.js and the store's startRun, skipRun
// and endRun), and the address while it goes on (web/new/js/hashsync.js). Invented data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun, nextKey, runSummary, oldestWaiting, skipLabel, RUN_SIZE, SETTLE_MS } from '../web/new/js/runstore.js';
import { visibleRows } from '../web/new/js/store.js';
import { addressAfter, leavesRun, sheetFirst, withSheet } from '../web/new/js/hashsync.js';
import { parseRoute } from '../web/new/js/route.js';
import { setup, row, draft, paths } from './support/newpage-fakes.js';

const COPY_FAILED = 'Could not copy. Select the text and copy it yourself.';

/**
 * Needs reply as the server lists it, newest first: c:1 wrote last, c:<n> first. a.later() moves
 * the store's clock on past the moment a Copy just after an open is ignored.
 */
function waiting(n = 3, stored = {}) {
  const clock = { t: 1000 };
  const a = setup({}, { stored, now: () => clock.t });
  a.data.rows = Array.from({ length: n }, (_, i) => row('c:' + (i + 1), { waitingSince: 1000 * (n - i) }));
  a.data.counts = { ...a.data.counts, waiting: n };
  for (const r of a.data.rows) a.data.items[r.key] = { key: r.key, anchor: r.anchor, state: 'awaiting', draft: draft(10 + Number(r.key.slice(2)), { reply: 'Hello ' + r.key }) };
  a.later = (ms = SETTLE_MS) => { clock.t += ms; };
  return a;
}
/** The conversations opened, in order: each open marks its conversation seen (a refresh does not). */
const opened = (calls) => paths(calls).map((p) => /^POST \/api\/items\/([^/]+)\/seen$/.exec(p)).filter(Boolean).map((m) => m[1]);
/** A copy as a person makes it: a moment after the customer came on screen. */
const copyLater = async (a) => { a.later(); await a.store.actions.copy(); };

test('the run takes Needs reply oldest first', async () => {
  // Pure: the visible rows, oldest message first; a row already answered is not in it.
  const run = createRun([row('c:1', { waitingSince: 3000 }), row('c:2', { lastAt: 2000 }), row('c:3', { waitingSince: 1000 }), row('c:4', { waitingSince: 500, answered: { how: 'phone', by: '', at: 600 } })], 9000);
  assert.deepEqual(run.queue, ['c:3', 'c:2', 'c:1']);
  assert.deepEqual({ i: run.i, copied: run.copied, skipped: run.skipped, elsewhere: run.elsewhere, seen: run.seen.size }, { i: 0, copied: 0, skipped: 0, elsewhere: 0, seen: 0 });
  assert.equal(oldestWaiting([row('c:1', { waitingSince: 3000 }), row('c:3', { waitingSince: 1000 })]), 1000);
  assert.equal(oldestWaiting([]), null);

  // The store: a row already copied is not visible, so it is not in the queue; the oldest opens first.
  const a = waiting(3, { 'wheelman.new.done': JSON.stringify({ 'c:4': 'a-c:4' }) });
  a.data.rows.push(row('c:4', { waitingSince: 500 }));
  a.data.items['c:4'] = { key: 'c:4', anchor: 'a-c:4', state: 'awaiting', draft: draft(14) };
  await a.store.actions.refresh();
  await a.store.actions.startRun();
  assert.equal(a.store.get().key, 'c:3');
  assert.deepEqual(a.store.get().run, { at: 1, of: 3, key: 'c:3' });
});

test('the run takes the ten newest waiting, the ones written ahead, the oldest of them first', async () => {
  assert.equal(RUN_SIZE, 10);
  const a = waiting(25);
  await a.store.actions.refresh();
  assert.equal(a.store.get().rows.length, 20, 'the first page');
  await a.store.actions.startRun();
  assert.equal(a.store.get().key, 'c:10', 'the oldest of the ten newest');
  assert.deepEqual(a.store.get().run, { at: 1, of: 10, key: 'c:10' });
  // Nothing more is loaded for it: the list keeps its page.
  assert.equal(a.store.get().limit, 20);
  assert.ok(paths(a.calls).filter((p) => p.startsWith('GET /api/items?')).every((p) => p.endsWith('&limit=20')));
});

test('more waiting at the end: the summary says how many, and Start again takes the next ten', async () => {
  const a = waiting(12);
  await a.store.actions.refresh();
  await a.store.actions.startRun();
  for (let n = 0; n < 10; n++) await copyLater(a);
  assert.equal(a.store.get().runSummary, 'All answered: 10 copied. 2 more waiting.');
  assert.equal(a.store.get().runMore, 2);
  assert.equal(a.store.get().key, null);
  await a.store.actions.startRun(); // Start again
  assert.equal(a.store.get().runSummary, null);
  assert.deepEqual(a.store.get().run, { at: 1, of: 2, key: 'c:12' });
});

test('copy in a run opens the next', async () => {
  const a = waiting();
  await a.store.actions.refresh();
  await a.store.actions.startRun();
  assert.equal(a.store.get().key, 'c:3');
  await copyLater(a);
  assert.deepEqual(a.written, ['Hello c:3']);
  assert.equal(a.store.get().key, 'c:2');
  assert.equal(a.store.get().itemState, 'ready');
  assert.deepEqual(a.store.get().run, { at: 2, of: 3, key: 'c:2' });
  assert.equal(a.store.get().done['c:3'], 'a-c:3', 'the copied one is done');
  assert.ok(paths(a.calls).includes('POST /api/drafts/13/copied'));
  // The last copy ends the run with the summary, and no conversation open.
  await copyLater(a);
  await copyLater(a);
  const s = a.store.get();
  assert.equal(s.run, null);
  assert.equal(s.runSummary, 'All answered: 3 copied.');
  assert.equal(s.runMore, 0);
  assert.equal(s.key, null);
  assert.equal(s.item, null);
  assert.deepEqual(opened(a.calls), ['c:3', 'c:2', 'c:1']);
});

test('the run moves on without waiting for the copy to be kept on the server', async () => {
  const a = waiting();
  a.data.on = { '/api/drafts/13/copied': () => new Promise(() => {}) }; // never answers
  await a.store.actions.refresh();
  await a.store.actions.startRun();
  await copyLater(a);
  assert.equal(a.store.get().key, 'c:2');
  assert.equal(a.store.get().done['c:3'], 'a-c:3');
});

test('a second Copy within 600 ms of the next customer opening is ignored', async () => {
  assert.equal(SETTLE_MS, 600);
  const a = waiting();
  await a.store.actions.refresh();
  await a.store.actions.startRun();
  await a.store.actions.copy(); // at once: a second click meant for the customer before
  assert.deepEqual(a.written, []);
  a.later(SETTLE_MS - 1);
  await a.store.actions.copy();
  assert.deepEqual(a.written, []);
  assert.equal(a.store.get().key, 'c:3');
  a.later(1);
  await a.store.actions.copy();
  assert.deepEqual(a.written, ['Hello c:3']);
  assert.equal(a.store.get().key, 'c:2');
});

test('two overlapping copies show every customer', async () => {
  const a = waiting();
  await a.store.actions.refresh();
  await a.store.actions.startRun();
  a.later();
  await Promise.all([a.store.actions.copy(), a.store.actions.copy()]);
  assert.deepEqual(a.written, ['Hello c:3'], 'the second is not taken');
  assert.deepEqual(a.store.get().run, { at: 2, of: 3, key: 'c:2' });
  await copyLater(a);
  await copyLater(a);
  assert.deepEqual(opened(a.calls), ['c:3', 'c:2', 'c:1']);
  assert.equal(a.store.get().runSummary, 'All answered: 3 copied.');
});

test('two quick Skips never mark seen a customer who was not shown', async () => {
  const a = waiting();
  await a.store.actions.refresh();
  await a.store.actions.startRun();
  await Promise.all([a.store.actions.skipRun(), a.store.actions.skipRun()]);
  assert.deepEqual(opened(a.calls), ['c:3', 'c:2']);
  assert.deepEqual(a.store.get().run, { at: 2, of: 3, key: 'c:2' });
});

test('a Skip during a copy is not counted', async () => {
  const a = waiting();
  await a.store.actions.refresh();
  await a.store.actions.startRun();
  a.later();
  await Promise.all([a.store.actions.copy(), a.store.actions.skipRun()]);
  assert.equal(a.store.get().key, 'c:2');
  await copyLater(a);
  await copyLater(a);
  assert.equal(a.store.get().runSummary, 'All answered: 3 copied.');
});

test('skip moves on without marking done', async () => {
  const a = waiting();
  await a.store.actions.refresh();
  await a.store.actions.startRun();
  await a.store.actions.skipRun();
  assert.equal(a.store.get().key, 'c:2');
  assert.deepEqual(a.store.get().run, { at: 2, of: 3, key: 'c:2' });
  assert.equal(a.store.get().done['c:3'], undefined);
  assert.deepEqual(a.written, [], 'nothing copied');
  assert.ok(visibleRows(a.store.get()).some((r) => r.key === 'c:3'), 'still in Needs reply');
  await copyLater(a);
  await a.store.actions.skipRun();
  assert.equal(a.store.get().runSummary, 'Run finished: 1 copied, 2 skipped.');
});

test('dismissing the run\'s customer moves on and is not counted', async () => {
  const a = waiting();
  await a.store.actions.refresh();
  await a.store.actions.startRun();
  a.data.rows = a.data.rows.filter((r) => r.key !== 'c:3'); // set aside on the server
  a.data.counts = { ...a.data.counts, waiting: 2 };
  await a.store.actions.dismiss();
  assert.equal(a.store.get().key, 'c:2');
  assert.deepEqual(a.store.get().run, { at: 2, of: 3, key: 'c:2' });
  assert.equal(a.store.get().toast.message, 'Dismissed');
  await copyLater(a);
  await copyLater(a);
  assert.equal(a.store.get().runSummary, 'All answered: 2 copied.');
});

test('End run stops the run and leaves the conversation open', async () => {
  const a = waiting();
  await a.store.actions.refresh();
  await a.store.actions.startRun();
  a.store.actions.endRun();
  assert.equal(a.store.get().run, null);
  assert.equal(a.store.get().runSummary, null, 'no summary');
  assert.equal(a.store.get().key, 'c:3');
  await copyLater(a);
  assert.equal(a.store.get().key, 'c:3', 'a copy after it opens nothing');
});

test('Start replying hides the offer at once, a second press does nothing, and End run stops it', async () => {
  const a = waiting();
  await a.store.actions.refresh();
  const first = a.store.actions.startRun();
  assert.deepEqual(a.store.get().run, { at: 1, of: 3, key: 'c:3' }, 'a run from the press, before anything has loaded');
  const second = a.store.actions.startRun();
  await Promise.all([first, second]);
  assert.deepEqual(opened(a.calls), ['c:3']);
  // End run while the first customer is still opening: the run stops there.
  const b = waiting();
  await b.store.actions.refresh();
  const starting = b.store.actions.startRun();
  b.store.actions.endRun();
  await starting;
  assert.equal(b.store.get().run, null);
  await copyLater(b);
  assert.equal(b.store.get().key, 'c:3', 'nothing moves on');
});

test('the run shows the conversation already open without opening it again', async () => {
  // On a phone showing the list, the store keeps the last conversation open, with what was typed.
  const a = waiting();
  await a.store.actions.refresh();
  await a.store.actions.open('c:3');
  a.store.actions.type('My words');
  await a.store.actions.startRun();
  assert.deepEqual(a.store.get().run, { at: 1, of: 3, key: 'c:3' });
  assert.equal(a.store.get().typed, 'My words');
  assert.deepEqual(opened(a.calls), ['c:3'], 'opened once, before the run');
  await copyLater(a);
  assert.deepEqual(a.written, ['My words']);
  assert.equal(a.store.get().key, 'c:2');
});

test('a row answered elsewhere during the run is passed over and counted', async () => {
  // Pure: a row now answered, or gone from Needs reply, is passed over and counted.
  const run = createRun([row('c:1', { waitingSince: 3 }), row('c:2', { waitingSince: 2 }), row('c:3', { waitingSince: 1 })], 9);
  assert.equal(nextKey(run, [row('c:1'), row('c:2'), row('c:3')]), 'c:3');
  assert.equal(nextKey(run, [row('c:1'), row('c:2', { state: 'answered', answered: { how: 'phone', by: '', at: 5 } })]), 'c:1');
  assert.equal(run.elsewhere, 1);
  assert.equal(run.i, 2);
  assert.equal(nextKey(run, []), null);
  assert.equal(run.elsewhere, 1, 'the last one was seen, not answered elsewhere');

  // The store: c:2 is answered on the phone while c:3 is open, so it leaves Needs reply.
  const a = waiting();
  await a.store.actions.refresh();
  await a.store.actions.startRun();
  a.data.rows = a.data.rows.filter((r) => r.key !== 'c:2');
  a.data.counts = { ...a.data.counts, waiting: 2 };
  await a.store.actions.refresh();
  await copyLater(a);
  assert.equal(a.store.get().key, 'c:1');
  assert.deepEqual(a.store.get().run, { at: 3, of: 3, key: 'c:1' });
  await copyLater(a);
  assert.equal(a.store.get().runSummary, 'All answered: 2 copied, 1 answered elsewhere.');
  assert.deepEqual(opened(a.calls), ['c:3', 'c:1']);
});

test('a row that changes during the run is not visited twice', async () => {
  const a = waiting();
  await a.store.actions.refresh();
  await a.store.actions.startRun();
  await copyLater(a); // c:3 copied, c:2 open
  // The customer of c:3 writes again: a new anchor, and now the newest waiting.
  a.data.rows = [row('c:3', { waitingSince: 5000, anchor: 'a-c:3-again' }), ...a.data.rows.filter((r) => r.key !== 'c:3')];
  a.data.items['c:3'] = { ...a.data.items['c:3'], anchor: 'a-c:3-again' };
  await a.store.actions.refresh();
  await a.store.actions.skipRun();
  await copyLater(a);
  assert.equal(a.store.get().runSummary, 'Run finished: 2 copied, 1 skipped.');
  assert.deepEqual(opened(a.calls), ['c:3', 'c:2', 'c:1'], 'c:3 opened once');
  assert.ok(visibleRows(a.store.get()).some((r) => r.key === 'c:3'), 'and it shows in Needs reply after the run');
});

test('choosing another row ends the run', async () => {
  const a = waiting();
  a.data.items['c:9'] = { key: 'c:9', anchor: 'a-c:9', state: 'awaiting', draft: draft(19) };
  await a.store.actions.refresh();
  await a.store.actions.startRun();
  await a.store.actions.open('c:9');
  assert.equal(a.store.get().run, null);
  assert.equal(a.store.get().runSummary, null, 'quietly: no summary');
  await copyLater(a);
  assert.equal(a.store.get().key, 'c:9', 'a copy there opens nothing');

  // Another chip ends it too.
  const b = waiting();
  await b.store.actions.refresh();
  await b.store.actions.startRun();
  await b.store.actions.setChip('all');
  assert.equal(b.store.get().run, null);
  assert.equal(b.store.get().runSummary, null);

  // So does an address the person reached: Back, ‹ List, a tab, another row; the run's own does not.
  const s = { section: 'dashboard', chip: 'waiting', key: 'c:2', run: { at: 2, of: 3, key: 'c:2' }, runSummary: null };
  assert.equal(leavesRun(parseRoute('#/dashboard/waiting/c%3A2'), s), false);
  assert.equal(leavesRun(parseRoute('#/dashboard/waiting/c%3A3'), s), true, 'Back to the one before');
  assert.equal(leavesRun(parseRoute('#/dashboard/waiting'), s), true, '‹ List on a phone');
  assert.equal(leavesRun(parseRoute('#/dashboard/all/c%3A2'), s), true, 'another chip');
  assert.equal(leavesRun(parseRoute('#/marketplace/waiting'), s), true, 'a tab');
  assert.equal(leavesRun(parseRoute('#/dashboard/waiting'), { ...s, key: null, run: null }), false, 'no run');
});

test('any address reached from the summary puts it away, the list\'s own too', () => {
  const s = { section: 'dashboard', chip: 'waiting', key: null, run: null, runSummary: 'All answered: 3 copied.' };
  // Back on a phone: from the last customer's address to the list's, which names no conversation.
  assert.equal(leavesRun(parseRoute('#/dashboard/waiting'), s), true);
  assert.equal(leavesRun(parseRoute('#/dashboard/waiting/c%3A7'), s), true);
  assert.equal(leavesRun(parseRoute('#/marketplace/waiting'), s), true);
});

test('the run opens the next customer in place of the address, so Back leaves the run', () => {
  const prev = { section: 'dashboard', chip: 'waiting', key: 'c:3' };
  const s = { section: 'dashboard', chip: 'waiting', key: 'c:2', run: { at: 2, of: 3, key: 'c:2' } };
  assert.equal(addressAfter(prev, '#/dashboard/waiting/c%3A3', s), '#/dashboard/waiting/c%3A2');
  // Without a run, an address that names a conversation is the person's own and stays.
  assert.equal(addressAfter(prev, '#/dashboard/waiting/c%3A3', { ...s, run: null }), null);
  // Nor is an address on another list or section written over.
  assert.equal(addressAfter(prev, '#/dashboard/all/c%3A3', s), null);
  assert.equal(addressAfter(prev, '#/marketplace/waiting', s), null);
  // The end of the run closes the conversation: the address keeps the last one.
  assert.equal(addressAfter({ ...prev, key: 'c:1' }, '#/dashboard/waiting/c%3A1', { ...s, key: null, run: null }), null);
  // On a phone showing the list the store keeps the last conversation open: when the run starts
  // with that same customer, the address still names them, so the conversation comes on screen.
  const hidden = { section: 'dashboard', chip: 'waiting', key: 'c:3', run: null };
  const first = { ...hidden, run: { at: 1, of: 3, key: 'c:3' } };
  assert.equal(addressAfter(hidden, '#/dashboard/waiting', first), '#/dashboard/waiting/c%3A3');
  // Between the run's steps nothing is written: an address the person just reached is theirs.
  assert.equal(addressAfter({ ...first }, '#/dashboard/waiting', first), null);
});

test('a step is written only once the store has the run\'s customer', () => {
  // The run has moved to c:2 but the store still has c:3 open: the address is left for now.
  const prev = { section: 'dashboard', chip: 'waiting', key: 'c:3', run: { at: 1, of: 3, key: 'c:3' } };
  const moving = { section: 'dashboard', chip: 'waiting', key: 'c:3', run: { at: 2, of: 3, key: 'c:2' } };
  assert.equal(addressAfter(prev, '#/dashboard/waiting/c%3A3', moving), null);
  assert.equal(addressAfter({ ...prev, run: null }, '#/dashboard/waiting', moving), null, 'not even on a phone showing the list');
  // Once it has: written.
  assert.equal(addressAfter({ ...prev, run: moving.run }, '#/dashboard/waiting/c%3A3', { ...moving, key: 'c:2' }), '#/dashboard/waiting/c%3A2');
});

test('on a phone the sheet closes before a run step writes the address', () => {
  const run = { at: 2, of: 3, key: 'c:2' };
  const next = '#/dashboard/waiting/c%3A2';
  assert.equal(sheetFirst({ narrow: true, entry: withSheet(null), run, next }), true);
  assert.equal(sheetFirst({ narrow: true, entry: null, run, next }), false, 'no sheet open');
  assert.equal(sheetFirst({ narrow: false, entry: withSheet(null), run, next }), false, 'a drawer or a column is no history entry');
  assert.equal(sheetFirst({ narrow: true, entry: withSheet(null), run: null, next }), false, 'no run');
  assert.equal(sheetFirst({ narrow: true, entry: withSheet(null), run, next: null }), false, 'nothing to write');
});

test('a failed copy keeps the run where it is', async () => {
  const a = waiting();
  await a.store.actions.refresh();
  await a.store.actions.startRun();
  a.clipboard.fail = true;
  await copyLater(a);
  assert.equal(a.store.get().key, 'c:3');
  assert.deepEqual(a.store.get().run, { at: 1, of: 3, key: 'c:3' });
  assert.equal(a.store.get().toast.message, COPY_FAILED);
  assert.equal(a.store.get().done['c:3'], undefined);
  a.clipboard.fail = false;
  await a.store.actions.copy();
  assert.equal(a.store.get().key, 'c:2', 'a copy that works then moves on');
});

test('the summary leaves out the zero parts', async () => {
  const r = (copied, skipped, elsewhere, n = 7) => ({ queue: Array.from({ length: n }, (_, i) => 'c:' + i), copied, skipped, elsewhere });
  assert.equal(runSummary(r(5, 0, 1)), 'All answered: 5 copied, 1 answered elsewhere.');
  assert.equal(runSummary(r(5, 1, 1)), 'Run finished: 5 copied, 1 skipped, 1 answered elsewhere.', 'someone skipped: not all answered');
  assert.equal(runSummary(r(0, 2, 0)), 'Run finished: 2 skipped.');
  assert.equal(runSummary(r(3, 0, 0), 4), 'All answered: 3 copied. 4 more waiting.');
  assert.equal(runSummary(r(0, 0, 0, 0)), 'Nothing waiting.');

  // Nothing waiting when the run starts: the summary at once, and nothing opened.
  const a = waiting(0);
  await a.store.actions.refresh();
  await a.store.actions.startRun();
  assert.equal(a.store.get().runSummary, 'Nothing waiting.');
  assert.equal(a.store.get().run, null);
  assert.deepEqual(opened(a.calls), []);
  // Back to the list: the summary goes, and the store keeps no run.
  a.store.actions.endRun();
  assert.equal(a.store.get().runSummary, null);
});

test('an open conversation answered elsewhere says so and the run moves on', async () => {
  const a = waiting();
  await a.store.actions.refresh();
  await a.store.actions.startRun();
  assert.equal(a.store.get().key, 'c:3');
  // c:3 is answered from the phone while it is open.
  a.data.items['c:3'] = { ...a.data.items['c:3'], state: 'answered', answered: { how: 'phone', by: '', at: 900 } };
  a.data.rows = a.data.rows.filter((r) => r.key !== 'c:3');
  a.data.counts = { ...a.data.counts, waiting: 2 };
  await a.store.actions.refresh();
  assert.equal(a.store.get().item.answered.how, 'phone');
  assert.equal(skipLabel(a.store.get()), 'Next');
  await a.store.actions.skipRun();
  assert.equal(a.store.get().key, 'c:2');
  assert.equal(skipLabel(a.store.get()), 'Skip');
  await copyLater(a);
  await copyLater(a);
  assert.equal(a.store.get().runSummary, 'All answered: 2 copied, 1 answered elsewhere.', 'counted as answered elsewhere, not skipped');
});
