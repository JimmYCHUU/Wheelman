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
