// What the new page's store does for the message box: a write in flight, the copy time, putting a
// row back, and the template or follow-up a write keeps. Invented data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../web/new/js/store.js';
import { fakeTimers, setup, paths } from './support/newpage-fakes.js';

test('a write in flight is known by its key until it ends, even when it fails', async () => {
  const a = setup();
  await a.store.actions.open('c:1');
  const seen = [];
  const off = a.store.subscribe(() => seen.push(a.store.get().writing));
  await a.store.actions.write({});
  off();
  assert.ok(seen.includes('c:1'));
  assert.equal(a.store.get().writing, null);
  a.data.fail.add('/draft');
  await a.store.actions.write({});
  assert.equal(a.store.get().writing, null);
  assert.equal(a.store.get().toast.message, 'Network down');
});

test('writing a follow-up keeps it in hand, so the next refresh asks for it', async () => {
  const a = setup();
  a.data.items['c:2'] = { ...a.data.items['c:2'], followUp: { id: 7, reason: 'x', done: '' } };
  await a.store.actions.open('c:2');
  await a.store.actions.write({ followup: 7 });
  a.calls.length = 0;
  await a.store.actions.refresh();
  assert.ok(paths(a.calls).includes('GET /api/items/c:2?followup=7'));
});

test('a write keeps the template in the box, as the old page did', async () => {
  const a = setup();
  a.data.items['c:1'] = { ...a.data.items['c:1'], templates: [{ id: 'tpl', label: 'Price reply' }], template: 'tpl' };
  await a.store.actions.open('c:1');
  await a.store.actions.tell('Make it shorter');
  const w = a.calls.find((c) => c.path === '/api/items/c:1/draft');
  assert.deepEqual(w.body, { instruction: 'Make it shorter', message: 'tpl', followup: undefined });
  a.calls.length = 0;
  await a.store.actions.write({ message: '' });
  assert.equal(a.calls.find((c) => c.path === '/api/items/c:1/draft').body.message, '', 'a message named by the caller wins');
});

test('typing says Saving at once, and a write starts the save note afresh', async () => {
  const a = setup();
  await a.store.actions.open('c:1');
  a.store.actions.type('Hel');
  assert.equal(a.store.get().save.state, 'saving');
  await a.store.actions.write({});
  assert.deepEqual(a.store.get().save, { state: 'idle', at: null });
  await a.timers.advance(1000);
  assert.equal(a.calls.some((c) => c.path.endsWith('/edit')), false, 'the dropped edit is never sent');
  // With no draft there is nothing to save, so nothing says Saving.
  await a.store.actions.open('c:2');
  a.store.actions.type('Mine');
  assert.equal(a.store.get().save.state, 'idle');
});

test('copy keeps the time it was copied, and Put back clears it too', async () => {
  const a = setup();
  await a.store.actions.refresh();
  await a.store.actions.open('c:1');
  await a.store.actions.copy({});
  assert.equal(a.store.get().doneAt['c:1'], 1000);
  assert.equal(JSON.parse(a.mem.get('wheelman.new.doneAt'))['c:1'], 1000);
  a.store.actions.putBack();
  assert.equal(a.store.get().done['c:1'], undefined);
  assert.equal(a.store.get().doneAt['c:1'], undefined);
  assert.equal(JSON.parse(a.mem.get('wheelman.new.doneAt'))['c:1'], undefined);
});

test('a copied follow-up is put back in Follow-ups, on the server too', async () => {
  const a = setup();
  a.data.items['c:1'] = { ...a.data.items['c:1'], anchor: 'fu:5', followUp: { id: 5, reason: 'x', done: '' } };
  await a.store.actions.open('c:1', { followup: 5 });
  await a.store.actions.copy({});
  const t = a.store.get().toast;
  assert.equal(t.action.label, 'Put back in Follow-ups');
  await t.action.run();
  assert.ok(a.calls.some((c) => c.path === '/api/followups/5/restore' && c.body !== undefined));
  assert.equal(a.store.get().done['c:1'], undefined);
});

test('restore and restoreFollowUp put the open conversation back and refresh the list', async () => {
  const a = setup();
  a.data.items['c:1'] = { ...a.data.items['c:1'], followUp: { id: 5, reason: 'x', done: 'dismissed' } };
  await a.store.actions.open('c:1');
  a.calls.length = 0;
  await a.store.actions.restore();
  assert.deepEqual(paths(a.calls).slice(0, 2), ['POST /api/items/c:1/restore', 'GET /api/status']);
  a.calls.length = 0;
  await a.store.actions.restoreFollowUp();
  assert.deepEqual(paths(a.calls).slice(0, 2), ['POST /api/followups/5/restore', 'GET /api/status']);
  a.data.fail.add('/restore');
  await a.store.actions.restore();
  assert.equal(a.store.get().toast.message, 'Network down');
});

/** A store on the given storage, for the storage tests. */
function storeOn(mem) {
  const storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, v) };
  return createStore({ api: async () => ({}), clipboard: {}, storage, now: () => 0, timers: fakeTimers(), keepalive() {} });
}

test('the done times are read from storage, and a broken one gives none', () => {
  const mem = new Map([['wheelman.new.done', JSON.stringify({ 'c:9': 'x' })], ['wheelman.new.doneAt', JSON.stringify({ 'c:9': 5 })]]);
  assert.deepEqual(storeOn(mem).get().doneAt, { 'c:9': 5 });
  assert.deepEqual(storeOn(new Map([['wheelman.new.doneAt', 'not json']])).get().doneAt, {});
});

test('Instead keeps the pick: back to the reply asks for it by name, and a refresh asks for the pick again', async () => {
  const a = setup();
  a.data.items['c:1'] = { ...a.data.items['c:1'], templates: [{ id: 'tpl', label: 'Price reply' }], template: '' };
  await a.store.actions.open('c:1');
  await a.store.actions.instead('tpl');
  a.calls.length = 0;
  await a.store.actions.refresh();
  assert.ok(paths(a.calls).includes('GET /api/items/c:1?message=tpl'));
  a.calls.length = 0;
  await a.store.actions.instead('');
  assert.ok(paths(a.calls).includes('GET /api/items/c:1?message='));
  a.calls.length = 0;
  await a.store.actions.refresh();
  assert.ok(paths(a.calls).includes('GET /api/items/c:1?message='));
  // Another conversation starts with nothing picked.
  await a.store.actions.open('c:2');
  a.calls.length = 0;
  await a.store.actions.refresh();
  assert.ok(paths(a.calls).includes('GET /api/items/c:2'));
});
