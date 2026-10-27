import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSearchStore } from '../web/new/js/searchstore.js';
import { fakeTimers, settle } from './support/newpage-fakes.js';

const found = (name) => ({ customers: [{ key: 'c:1', name, section: 'dashboard' }], cars: [], messages: [] });

function make(answer) {
  const calls = [];
  const timers = fakeTimers();
  const store = createSearchStore({ api: (path) => { calls.push(path); return answer(path); }, timers });
  return { store, calls, timers };
}

test('search waits 200 ms after typing', async () => {
  const { store, calls, timers } = make(async () => found('Sam'));
  store.actions.type('sa');
  store.actions.type('sam');
  await timers.advance(199);
  assert.equal(calls.length, 0);
  assert.equal(store.get().state, 'loading');
  await timers.advance(1);
  assert.deepEqual(calls, ['/api/search?q=sam']);
  await settle();
  assert.equal(store.get().state, 'ready');
  assert.equal(store.get().results.customers[0].name, 'Sam');
});

test('a late answer to an older search is dropped', async () => {
  const waiting = [];
  const { store, timers } = make((path) => new Promise((resolve) => waiting.push({ path, resolve })));
  store.actions.type('sam');
  await timers.advance(200);
  store.actions.type('samuel');
  await timers.advance(200);
  assert.equal(waiting.length, 2);
  waiting[1].resolve(found('Samuel'));
  await settle();
  waiting[0].resolve(found('Sam'));
  await settle();
  assert.equal(store.get().results.customers[0].name, 'Samuel');
  assert.equal(store.get().state, 'ready');
});

test('an answer to what was typed before never reads ready for what the box says now', async () => {
  // "ab" is out, "abc" is typed and waits its 200 ms, and the answer for "ab" lands meanwhile.
  const { enterPick } = await import('../web/new/js/searchstore.js');
  const waiting = [];
  const { store, timers } = make((path) => new Promise((resolve) => waiting.push({ path, resolve })));
  store.actions.type('ab');
  await timers.advance(200);
  store.actions.type('abc');
  waiting[0].resolve(found('answer for ab'));
  await settle();
  assert.equal(store.get().q, 'abc');
  assert.equal(store.get().state, 'loading');
  assert.equal(enterPick(store.get(), -1, 1), -1, 'Enter opens nothing from the old answer');
  // The newer answer is the one kept.
  await timers.advance(200);
  assert.deepEqual(waiting.map((w) => w.path), ['/api/search?q=ab', '/api/search?q=abc']);
  waiting[1].resolve(found('answer for abc'));
  await settle();
  assert.equal(store.get().state, 'ready');
  assert.equal(store.get().results.customers[0].name, 'answer for abc');
  // A space more is the same search: the answer on its way is kept, and nothing is asked again.
  store.actions.type('abcd');
  await timers.advance(200);
  store.actions.type('abcd ');
  waiting[2].resolve(found('answer for abcd'));
  await settle();
  assert.equal(store.get().q, 'abcd ');
  assert.equal(store.get().state, 'ready');
  assert.equal(store.get().results.customers[0].name, 'answer for abcd');
  await timers.advance(1000);
  assert.equal(waiting.length, 3);
});

test('under 2 characters nothing is asked', async () => {
  const { store, calls, timers } = make(async () => found('Sam'));
  store.actions.type('s');
  store.actions.type('  ');
  await timers.advance(1000);
  assert.equal(calls.length, 0);
  assert.equal(store.get().state, 'idle');
  // Dropping back under 2 cancels the one on its way, and clear() empties everything.
  store.actions.type('sam');
  store.actions.type('s');
  await timers.advance(1000);
  assert.equal(calls.length, 0);
  store.actions.type('sam');
  await timers.advance(200);
  await settle();
  store.actions.clear();
  assert.deepEqual(store.get(), { q: '', state: 'idle', results: { customers: [], cars: [], messages: [] } });
});

test('a failed search says so, and the next one works', async () => {
  let fail = true;
  const { store, timers } = make(async () => { if (fail) throw new Error('down'); return found('Sam'); });
  store.actions.type('sam');
  await timers.advance(200);
  assert.equal(store.get().state, 'error');
  fail = false;
  store.actions.type('sams');
  await timers.advance(200);
  assert.equal(store.get().state, 'ready');
});

test('Enter opens nothing from a list that a newer search is replacing', async () => {
  const { enterPick } = await import('../web/new/js/searchstore.js');
  assert.equal(enterPick({ state: 'loading' }, -1, 3), -1);
  assert.equal(enterPick({ state: 'ready' }, -1, 3), 0);
  assert.equal(enterPick({ state: 'loading' }, 2, 3), 2);
  assert.equal(enterPick({ state: 'ready' }, -1, 0), -1);
});
