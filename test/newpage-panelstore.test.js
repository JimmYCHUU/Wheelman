import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPanelStore } from '../web/new/js/panelstore.js';
import { settle } from './support/newpage-fakes.js';

function make({ wide = true, stored = null, fail = new Set(), failStorage = false } = {}) {
  const calls = [];
  const mem = new Map(stored === null ? [] : [['wheelman.new.panel', stored]]);
  const storage = {
    getItem: (k) => { if (failStorage) throw new Error('blocked'); return mem.has(k) ? mem.get(k) : null; },
    setItem: (k, v) => { if (failStorage) throw new Error('blocked'); mem.set(k, v); },
  };
  const api = async (path) => {
    calls.push(path);
    if ([...fail].some((f) => path.includes(f))) throw new Error('Network down');
    const m = path.match(/^\/api\/vehicles\/([^/?]+)\/media/);
    if (m) return { photos: [{ url: 'p1' }], videos: [], documents: [], readAt: 5, error: '', stale: false };
    const v = path.match(/^\/api\/vehicles\/([^/?]+)$/);
    return { vehicle: { stockNo: decodeURIComponent(v[1]), title: 'Test car' } };
  };
  const state = { wide };
  const store = createPanelStore({ api, storage, now: () => 1000, wide: () => state.wide });
  return { store, calls, mem, state };
}

test('the panel remembers open or closed only on wide windows', () => {
  assert.equal(make({ wide: true }).store.get().open, true);
  assert.equal(make({ wide: true, stored: 'closed' }).store.get().open, false);
  assert.equal(make({ wide: true, stored: 'open' }).store.get().open, true);
  assert.equal(make({ wide: false, stored: 'open' }).store.get().open, false);
  assert.equal(make({ wide: true, failStorage: true }).store.get().open, true);

  const w = make({ wide: true });
  w.store.actions.toggle(false);
  assert.equal(w.mem.get('wheelman.new.panel'), 'closed');
  w.store.actions.toggle();
  assert.equal(w.store.get().open, true);
  assert.equal(w.mem.get('wheelman.new.panel'), 'open');

  const n = make({ wide: false });
  n.store.actions.toggle(true);
  assert.equal(n.store.get().open, true);
  assert.equal(n.mem.has('wheelman.new.panel'), false);

  // A blocked storage does not stop the toggle.
  const b = make({ wide: true, failStorage: true });
  b.store.actions.toggle(false);
  assert.equal(b.store.get().open, false);
});

test('media is read once per car and again on Read again', async () => {
  const { store, calls } = make();
  const seen = [];
  const off = store.subscribe(() => seen.push(store.get().media['T 1/2']?.state));
  const first = store.actions.media('T 1/2');
  assert.equal(store.get().media['T 1/2'].state, 'loading');
  await first;
  assert.equal(store.get().media['T 1/2'].state, 'ready');
  assert.equal(store.get().media['T 1/2'].photos.length, 1);
  assert.equal(store.get().media['T 1/2'].readAt, 5);
  await store.actions.media('T 1/2');
  assert.deepEqual(calls, ['/api/vehicles/' + encodeURIComponent('T 1/2') + '/media']);
  await store.actions.media('T 1/2', { fresh: true });
  assert.equal(calls[1], '/api/vehicles/' + encodeURIComponent('T 1/2') + '/media?fresh=1');
  off();
  const n = seen.length;
  await store.actions.media('T 1/2', { fresh: true });
  assert.equal(seen.length, n);
});

test('a media read that fails says so and can be tried again', async () => {
  const { store, calls } = make({ fail: new Set(['/media']) });
  await store.actions.media('T9');
  const m = store.get().media.T9;
  assert.equal(m.state, 'error');
  assert.equal(m.error, 'Network down');
  await store.actions.media('T9');
  assert.equal(calls.length, 2);
});

test('showCar opens Another car and back returns', async () => {
  const { store, calls } = make({ wide: false });
  store.actions.setTab('customer');
  await store.actions.showCar('T 7');
  const s = store.get();
  assert.equal(calls[0], '/api/vehicles/' + encodeURIComponent('T 7'));
  assert.equal(s.open, true);
  assert.equal(s.tab, 'car');
  assert.equal(s.other.state, 'ready');
  assert.equal(s.other.vehicle.stockNo, 'T 7');
  store.actions.back();
  assert.equal(store.get().other, null);

  await store.actions.showCar('T8');
  store.actions.setTab('used');
  store.actions.reset();
  assert.equal(store.get().other, null);
  assert.equal(store.get().tab, 'used');
  assert.equal(store.get().open, true);
  await settle();
});

test('a failed showCar says so', async () => {
  const { store } = make({ fail: new Set(['/api/vehicles/T5']) });
  await store.actions.showCar('T5');
  assert.equal(store.get().other.state, 'error');
  assert.equal(store.get().other.error, 'Network down');
});
