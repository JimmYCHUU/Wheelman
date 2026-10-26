import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPanelStore } from '../web/new/js/panelstore.js';
import { settle, setup } from './support/newpage-fakes.js';
import { addToReply, placeLink, replyLabel } from '../web/new/js/insertlink.js';

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

  // Crossing a width: narrower closes it (and remembers nothing); wide again is as it was left.
  const r = make({ wide: true, stored: 'open' });
  r.state.wide = false;
  r.store.actions.fit();
  assert.equal(r.store.get().open, false);
  assert.equal(r.mem.get('wheelman.new.panel'), 'open');
  r.state.wide = true;
  r.store.actions.fit();
  assert.equal(r.store.get().open, true);
  r.store.actions.toggle(false);
  r.state.wide = false;
  r.store.actions.fit();
  r.state.wide = true;
  r.store.actions.fit();
  assert.equal(r.store.get().open, false);
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

// ---- Add to reply: where a link goes in the box text (web/new/js/insertlink.js)

const WALK = 'https://videos.example/noah/walk.mp4';

test('addToReply puts the link at the caret and keeps the typed text', () => {
  const typed = 'Hello Priya,\nYes, the Noah is still here, I just checked.\n\nRegards, Team Carbarn';
  const caret = typed.indexOf('\n'); // after "Hello Priya,", where the person last put the cursor
  const out = addToReply(typed, 'Walkaround 360 video', WALK, caret);
  assert.equal(out, 'Hello Priya,\nWalkaround 360 video: ' + WALK + '\nYes, the Noah is still here, I just checked.\n\nRegards, Team Carbarn');
  // Nothing typed is lost: take the line out and the text is as it was.
  assert.equal(out.replace('\nWalkaround 360 video: ' + WALK, ''), typed);
  // The caret goes after the line, so a second link follows the first.
  const placed = placeLink(typed, 'Walkaround 360 video', WALK, caret);
  assert.equal(placed.text, out);
  assert.ok(placed.text.slice(0, placed.caret).endsWith(WALK));
  assert.ok(placed.text.slice(placed.caret).startsWith('\nYes,'));
  const twice = addToReply(placed.text, 'Auction sheet', 'https://docs.example/sheet.png', placed.caret);
  assert.match(twice, /walk\.mp4\nAuction sheet: https:\/\/docs\.example\/sheet\.png\nYes,/);
  // A caret in the middle of a line: the link still gets a line of its own.
  const mid = addToReply('Hello Priya, see this.', 'Front photo', 'https://p.example/1', 'Hello Priya,'.length);
  assert.equal(mid, 'Hello Priya,\nFront photo: https://p.example/1\n see this.');
});

test('addToReply with no caret puts the link before the sign-off', () => {
  const text = 'Hello Priya,\nThe Noah is still here.\n\nRegards, Team Carbarn';
  assert.equal(addToReply(text, 'Auction sheet', 'https://docs.example/sheet.png', null),
    'Hello Priya,\nThe Noah is still here.\nAuction sheet: https://docs.example/sheet.png\n\nRegards, Team Carbarn');
  // A caret that is not in the text counts as none.
  assert.equal(addToReply(text, 'Auction sheet', 'https://docs.example/sheet.png', 999), addToReply(text, 'Auction sheet', 'https://docs.example/sheet.png', null));
  // No sign-off: at the end. An empty box: the line alone.
  assert.equal(addToReply('Hello Priya,\nHere it is.  ', 'Walkaround 360 video', WALK, null), 'Hello Priya,\nHere it is.\nWalkaround 360 video: ' + WALK + '  ');
  assert.equal(addToReply('', 'Walkaround 360 video', WALK, null), 'Walkaround 360 video: ' + WALK);
});

test('what a link is called in a reply', () => {
  assert.equal(replyLabel('video', 'Walkaround 360'), 'Walkaround 360 video');
  assert.equal(replyLabel('video', 'Engine video'), 'Engine video');
  assert.equal(replyLabel('picture', 'Front 2'), 'Front photo');
  assert.equal(replyLabel('auction', 'Auction photo 3'), 'Auction photo');
  assert.equal(replyLabel('document', 'Export certificate'), 'Export certificate');
});

test('Copy link copies the link and says so, and a blocked copy says what to do', async () => {
  const a = setup();
  await a.store.actions.copyLink(WALK);
  assert.deepEqual(a.written, [WALK]);
  assert.equal(a.store.get().toast.message, 'Link copied');
  a.clipboard.fail = true;
  await a.store.actions.copyLink(WALK);
  assert.equal(a.store.get().toast.message, 'Could not copy. Select the text and copy it yourself.');
});
