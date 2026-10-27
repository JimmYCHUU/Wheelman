// The reply run: Needs reply oldest first, Copy then the next customer, Skip, End run and the summary
// (web/new/js/runstore.js and the store's startRun, skipRun and endRun). Invented data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun, nextKey, runSummary, oldestWaiting } from '../web/new/js/runstore.js';
import { visibleRows } from '../web/new/js/store.js';
import { addressAfter, leavesRun } from '../web/new/js/hashsync.js';
import { parseRoute } from '../web/new/js/route.js';
import { setup, row, draft, paths } from './support/newpage-fakes.js';

const COPY_FAILED = 'Could not copy. Select the text and copy it yourself.';

/** Needs reply as the server lists it, newest first: c:1 wrote last, c:3 first. */
function waiting(stored = {}) {
  const a = setup({}, { stored });
  a.data.rows = [row('c:1', { waitingSince: 3000 }), row('c:2', { waitingSince: 2000 }), row('c:3', { waitingSince: 1000 })];
  a.data.counts = { ...a.data.counts, waiting: 3 };
  for (const [k, id] of [['c:1', 11], ['c:2', 12], ['c:3', 13]]) {
    a.data.items[k] = { key: k, anchor: 'a-' + k, state: 'awaiting', draft: draft(id, { reply: 'Hello ' + k }) };
  }
  return a;
}
/** The conversations opened, in order: each open marks its conversation seen (a refresh does not). */
const opened = (calls) => paths(calls).map((p) => /^POST \/api\/items\/([^/]+)\/seen$/.exec(p)).filter(Boolean).map((m) => m[1]);

test('the run takes Needs reply oldest first', async () => {
  // Pure: the visible rows, oldest message first; a row already answered is not in it.
  const run = createRun([row('c:1', { waitingSince: 3000 }), row('c:2', { lastAt: 2000 }), row('c:3', { waitingSince: 1000 }), row('c:4', { waitingSince: 500, answered: { how: 'phone', by: '', at: 600 } })], 9000);
  assert.deepEqual(run.queue, ['c:3', 'c:2', 'c:1']);
  assert.deepEqual({ i: run.i, copied: run.copied, skipped: run.skipped, elsewhere: run.elsewhere, seen: run.seen.size }, { i: 0, copied: 0, skipped: 0, elsewhere: 0, seen: 0 });
  assert.equal(oldestWaiting([row('c:1', { waitingSince: 3000 }), row('c:3', { waitingSince: 1000 })]), 1000);
  assert.equal(oldestWaiting([]), null);

  // The store: a row already copied is not visible, so it is not in the queue; the oldest opens first.
  const a = waiting({ 'wheelman.new.done': JSON.stringify({ 'c:4': 'a-c:4' }) });
  a.data.rows.push(row('c:4', { waitingSince: 500 }));
  a.data.items['c:4'] = { key: 'c:4', anchor: 'a-c:4', state: 'awaiting', draft: draft(14) };
  await a.store.actions.refresh();
  await a.store.actions.startRun();
  assert.equal(a.store.get().key, 'c:3');
  assert.deepEqual(a.store.get().run, { at: 1, of: 3 });
});

test('startRun loads every waiting row first when the list has more than it shows', async () => {
  const a = waiting();
  a.data.rows = Array.from({ length: 25 }, (_, n) => row('c:' + (n + 1), { waitingSince: 10000 - n }));
  for (const r of a.data.rows) a.data.items[r.key] = { key: r.key, anchor: r.anchor, state: 'awaiting', draft: draft(100 + Number(r.key.slice(2))) };
  await a.store.actions.refresh();
  assert.equal(a.store.get().rows.length, 20);
  await a.store.actions.startRun();
  assert.equal(a.store.get().rows.length, 25, 'all of them loaded');
  assert.equal(a.store.get().key, 'c:25', 'the oldest, from beyond the first twenty');
  assert.deepEqual(a.store.get().run, { at: 1, of: 25 });
});

test('copy in a run opens the next', async () => {
  const a = waiting();
  await a.store.actions.refresh();
  await a.store.actions.startRun();
  assert.equal(a.store.get().key, 'c:3');
  await a.store.actions.copy();
  assert.deepEqual(a.written, ['Hello c:3']);
  assert.equal(a.store.get().key, 'c:2');
  assert.equal(a.store.get().itemState, 'ready');
  assert.deepEqual(a.store.get().run, { at: 2, of: 3 });
  assert.equal(a.store.get().done['c:3'], 'a-c:3', 'the copied one is done');
  assert.ok(paths(a.calls).includes('POST /api/drafts/13/copied'));
  // The last copy ends the run with the summary, and no conversation open.
  await a.store.actions.copy();
  await a.store.actions.copy();
  const s = a.store.get();
  assert.equal(s.run, null);
  assert.equal(s.runSummary, 'All answered: 3 copied.');
  assert.equal(s.key, null);
  assert.equal(s.item, null);
  assert.deepEqual(opened(a.calls), ['c:3', 'c:2', 'c:1']);
});

test('skip moves on without marking done', async () => {
  const a = waiting();
  await a.store.actions.refresh();
  await a.store.actions.startRun();
  await a.store.actions.skipRun();
  assert.equal(a.store.get().key, 'c:2');
  assert.deepEqual(a.store.get().run, { at: 2, of: 3 });
  assert.equal(a.store.get().done['c:3'], undefined);
  assert.deepEqual(a.written, [], 'nothing copied');
  assert.ok(visibleRows(a.store.get()).some((r) => r.key === 'c:3'), 'still in Needs reply');
  await a.store.actions.copy();
  await a.store.actions.skipRun();
  assert.equal(a.store.get().runSummary, 'All answered: 1 copied, 2 skipped.');
});

test('End run stops the run and leaves the conversation open', async () => {
  const a = waiting();
  await a.store.actions.refresh();
  await a.store.actions.startRun();
  a.store.actions.endRun();
  assert.equal(a.store.get().run, null);
  assert.equal(a.store.get().runSummary, null, 'no summary');
  assert.equal(a.store.get().key, 'c:3');
  await a.store.actions.copy();
  assert.equal(a.store.get().key, 'c:3', 'a copy after it opens nothing');
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
  await a.store.actions.refresh();
  await a.store.actions.copy();
  assert.equal(a.store.get().key, 'c:1');
  assert.deepEqual(a.store.get().run, { at: 3, of: 3 });
  await a.store.actions.copy();
  assert.equal(a.store.get().runSummary, 'All answered: 2 copied, 1 answered elsewhere.');
  assert.deepEqual(opened(a.calls), ['c:3', 'c:1']);
});

test('a row that changes during the run is not visited twice', async () => {
  const a = waiting();
  await a.store.actions.refresh();
  await a.store.actions.startRun();
  await a.store.actions.copy(); // c:3 copied, c:2 open
  // The customer of c:3 writes again: a new anchor, and now the newest waiting.
  a.data.rows = [row('c:3', { waitingSince: 5000, anchor: 'a-c:3-again' }), ...a.data.rows.filter((r) => r.key !== 'c:3')];
  a.data.items['c:3'] = { ...a.data.items['c:3'], anchor: 'a-c:3-again' };
  await a.store.actions.refresh();
  await a.store.actions.skipRun();
  await a.store.actions.copy();
  assert.equal(a.store.get().runSummary, 'All answered: 2 copied, 1 skipped.');
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
  await a.store.actions.copy();
  assert.equal(a.store.get().key, 'c:9', 'a copy there opens nothing');

  // Another chip ends it too.
  const b = waiting();
  await b.store.actions.refresh();
  await b.store.actions.startRun();
  await b.store.actions.setChip('all');
  assert.equal(b.store.get().run, null);
  assert.equal(b.store.get().runSummary, null);

  // So does an address the person reached: Back, ‹ List, a tab, another row; the run's own does not.
  const s = { section: 'dashboard', chip: 'waiting', key: 'c:2', run: { at: 2, of: 3 }, runSummary: null };
  assert.equal(leavesRun(parseRoute('#/dashboard/waiting/c%3A2'), s), false);
  assert.equal(leavesRun(parseRoute('#/dashboard/waiting/c%3A3'), s), true, 'Back to the one before');
  assert.equal(leavesRun(parseRoute('#/dashboard/waiting'), s), true, '‹ List on a phone');
  assert.equal(leavesRun(parseRoute('#/dashboard/all/c%3A2'), s), true, 'another chip');
  assert.equal(leavesRun(parseRoute('#/marketplace/waiting'), s), true, 'a tab');
  assert.equal(leavesRun(parseRoute('#/dashboard/waiting'), { ...s, key: null, run: null }), false, 'no run');
  assert.equal(leavesRun(parseRoute('#/marketplace/waiting'), { ...s, key: null, run: null, runSummary: 'All answered: 3 copied.' }), true, 'the summary goes too');
});

test('the run opens the next customer in place of the address, so Back leaves the run', () => {
  const prev = { section: 'dashboard', chip: 'waiting', key: 'c:3' };
  const s = { section: 'dashboard', chip: 'waiting', key: 'c:2', run: { at: 2, of: 3 } };
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
  const first = { ...hidden, run: { at: 1, of: 3 } };
  assert.equal(addressAfter(hidden, '#/dashboard/waiting', first), '#/dashboard/waiting/c%3A3');
  // Between the run's steps nothing is written: an address the person just reached is theirs.
  assert.equal(addressAfter({ ...first }, '#/dashboard/waiting', first), null);
});

test('a failed copy keeps the run where it is', async () => {
  const a = waiting();
  await a.store.actions.refresh();
  await a.store.actions.startRun();
  a.clipboard.fail = true;
  await a.store.actions.copy();
  assert.equal(a.store.get().key, 'c:3');
  assert.deepEqual(a.store.get().run, { at: 1, of: 3 });
  assert.equal(a.store.get().toast.message, COPY_FAILED);
  assert.equal(a.store.get().done['c:3'], undefined);
  a.clipboard.fail = false;
  await a.store.actions.copy();
  assert.equal(a.store.get().key, 'c:2', 'a copy that works then moves on');
});

test('the summary leaves out the zero parts', async () => {
  const r = (copied, skipped, elsewhere, n = 7) => ({ queue: Array.from({ length: n }, (_, i) => 'c:' + i), copied, skipped, elsewhere });
  assert.equal(runSummary(r(5, 1, 1)), 'All answered: 5 copied, 1 skipped, 1 answered elsewhere.');
  assert.equal(runSummary(r(5, 0, 1)), 'All answered: 5 copied, 1 answered elsewhere.');
  assert.equal(runSummary(r(0, 2, 0)), 'All answered: 2 skipped.');
  assert.equal(runSummary(r(0, 0, 0, 0)), 'Nothing waiting.');

  // Nothing waiting when the run starts: the summary at once, and nothing opened.
  const a = waiting();
  a.data.rows = [];
  await a.store.actions.refresh();
  await a.store.actions.startRun();
  assert.equal(a.store.get().runSummary, 'Nothing waiting.');
  assert.equal(a.store.get().run, null);
  assert.deepEqual(opened(a.calls), []);
  // Back to the list: the summary goes, and the store keeps no run.
  a.store.actions.endRun();
  assert.equal(a.store.get().runSummary, null);
});
