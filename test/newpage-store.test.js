// The new page's API client, route and store, with a fake server, clipboard, storage and timers. Invented data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../web/new/js/api.js';
import { parseRoute, hashFor } from '../web/new/js/route.js';
import { createStore, visibleRows, waitingCount } from '../web/new/js/store.js';

const settle = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r)); };

function fakeTimers() {
  let clock = 0, next = 1;
  const list = new Map();
  return {
    set(fn, ms) { const id = next++; list.set(id, { at: clock + ms, fn }); return id; },
    clear(id) { list.delete(id); },
    async advance(ms) {
      const end = clock + ms;
      for (;;) {
        const due = [...list.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        list.delete(due[0]); clock = due[1].at; due[1].fn(); await settle();
      }
      clock = end;
    },
    pending: () => list.size,
  };
}

const row = (key, o = {}) => ({ key, name: 'Sam ' + key, phone: '0491 570 101', anchor: 'a-' + key, unread: 1, ...o });
const draft = (id, o = {}) => ({ id, status: 'ready', reply: 'Hello from Wheelman', edited: null, checks: [], ...o });

/** A fake server: handlers by "METHOD path" (prefix match on GET paths), a call log, and failures on demand. */
function setup(over = {}) {
  const calls = [];
  const data = {
    rows: [row('c:1'), row('c:2')],
    items: { 'c:1': { key: 'c:1', anchor: 'a-c:1', phone: '0491 570 101', draft: draft(11) }, 'c:2': { key: 'c:2', anchor: 'a-c:2', draft: null } },
    counts: { all: 2, waiting: 2, quiet: 0, other: 0, followups: 1 },
    fail: new Set(),
    ...over,
  };
  const api = async (path, body) => {
    calls.push({ path, body });
    for (const f of data.fail) if (path.includes(f)) throw new Error('Network down');
    if (body === undefined) {
      if (path === '/api/status') return { missing: [], lastSync: { ok: true, at: 0 } };
      if (path.startsWith('/api/items?')) return { items: data.rows, total: data.rows.length, counts: data.counts, unread: { dashboard: 2 }, sections: {}, section: 'dashboard' };
      const m = path.match(/^\/api\/items\/([^?]+)/);
      if (m) return { item: data.items[m[1]] };
    }
    if (path.endsWith('/draft')) return { ok: true, item: { ...data.items[path.split('/')[3]], draft: draft(99, { reply: 'Written' }) } };
    return { ok: true, item: data.items[path.split('/')[3]] };
  };
  const timers = fakeTimers();
  const written = [];
  const clipboard = { fail: false, async writeText(t) { if (this.fail) throw new Error('denied'); written.push(t); } };
  const mem = new Map();
  const storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, v) };
  const beacons = [];
  const store = createStore({ api, clipboard, storage, now: () => 1000, timers, keepalive: (p, b) => beacons.push({ p, b }) });
  return { store, calls, data, timers, written, clipboard, mem, storage, beacons };
}
const paths = (calls) => calls.map((c) => (c.body === undefined ? 'GET ' : 'POST ') + c.path);

test('a 401 goes to the sign-in page', async () => {
  const gone = [];
  const api = createApi({ fetch: async () => ({ status: 401, ok: false, json: async () => ({}) }), go: (u) => gone.push(u) });
  await assert.rejects(api('/api/status'));
  assert.deepEqual(gone, ['/signin']);
});

test('the API client sends GET without a body, POST with JSON, and names errors', async () => {
  const seen = [];
  const bad = createApi({ fetch: async (p, init) => { seen.push([p, init]); return { status: 400, ok: false, json: async () => ({ error: 'Too long' }) }; }, go() {} });
  await assert.rejects(bad('/x', { a: 1 }), /Too long/);
  assert.equal(seen[0][1].method, 'POST');
  assert.equal(seen[0][1].headers['content-type'], 'application/json');
  assert.equal(seen[0][1].body, '{"a":1}');
  const empty = createApi({ fetch: async (p, init) => { seen.push([p, init]); return { status: 500, ok: false, json: async () => { throw new Error('no json'); } }; }, go() {} });
  await assert.rejects(empty('/y'), /HTTP 500/);
  assert.equal(seen[1][1], undefined);
});

test('routes round-trip', () => {
  assert.deepEqual(parseRoute(''), { section: 'dashboard', chip: 'waiting', key: null });
  assert.equal(hashFor({ section: 'dashboard', chip: 'waiting', key: 'c:123' }), '#/dashboard/waiting/c%3A123');
  const r = { section: 'dashboard', chip: 'followups', key: 'l:45' };
  assert.deepEqual(parseRoute(hashFor(r)), r);
  assert.deepEqual(parseRoute('#/dashboard/nonsense'), { section: 'dashboard', chip: 'waiting', key: null });
});

test('boot loads the list and opens the first row only on a wide window', async () => {
  const a = setup();
  await a.store.actions.boot({ section: 'dashboard', chip: 'waiting', key: null }, { wide: false });
  assert.equal(a.store.get().listState, 'ready');
  assert.equal(a.store.get().key, null);
  assert.deepEqual(paths(a.calls).slice(0, 2), ['GET /api/status', 'GET /api/items?section=dashboard&tab=waiting&limit=20']);
  const b = setup();
  await b.store.actions.boot({ section: 'dashboard', chip: 'waiting', key: null }, { wide: true });
  assert.equal(b.store.get().key, 'c:1');
  assert.equal(b.store.get().itemState, 'ready');
  const c = setup();
  await c.store.actions.boot({ section: 'dashboard', chip: 'waiting', key: 'c:2' }, { wide: true });
  assert.equal(c.store.get().key, 'c:2');
});

test('a list that fails says so', async () => {
  const a = setup();
  a.data.fail.add('/api/items?');
  await a.store.actions.refresh();
  assert.equal(a.store.get().listState, 'error');
  assert.match(a.store.get().listError, /Network down/);
});

test('open reads the conversation, marks it seen, and the key stays raw in the path', async () => {
  const a = setup();
  await a.store.actions.refresh();
  await a.store.actions.open('c:1');
  assert.deepEqual(paths(a.calls).slice(-2), ['GET /api/items/c:1', 'POST /api/items/c:1/seen']);
  assert.equal(a.store.get().typed, null);
  await a.store.actions.open('c:1', { followup: 7 });
  assert.ok(paths(a.calls).includes('GET /api/items/c:1?followup=7'));
});

test('refresh keeps typed text when the draft changes', async () => {
  const a = setup();
  await a.store.actions.open('c:1');
  a.store.actions.type('My own words');
  a.data.items['c:1'] = { ...a.data.items['c:1'], anchor: 'a-new', draft: draft(12, { reply: 'Newer' }) };
  await a.store.actions.refresh();
  const s = a.store.get();
  assert.equal(s.typed, 'My own words');
  assert.equal(s.item.draft.id, 12);
  assert.equal(s.context.message, 'New message from the customer. Your text is kept.');
  assert.equal(s.context.action.label, 'Use the new suggestion');
  s.context.action.run();
  assert.equal(a.store.get().typed, null);
  assert.equal(a.store.get().context, null);
});

test('refresh takes the new draft when nothing was typed', async () => {
  const a = setup();
  await a.store.actions.open('c:1');
  a.data.items['c:1'] = { ...a.data.items['c:1'], draft: draft(12, { reply: 'Newer' }) };
  await a.store.actions.refresh();
  assert.equal(a.store.get().item.draft.reply, 'Newer');
  assert.equal(a.store.get().context, null);
});

test('typing saves after 600 ms of quiet', async () => {
  const a = setup();
  await a.store.actions.open('c:1');
  const before = a.calls.length;
  a.store.actions.type('Hel');
  await a.timers.advance(400);
  a.store.actions.type('Hello');
  await a.timers.advance(400);
  assert.equal(a.calls.length, before, 'still quiet for less than 600 ms');
  await a.timers.advance(250);
  const edits = a.calls.slice(before);
  assert.equal(edits.length, 1);
  assert.equal(edits[0].path, '/api/drafts/11/edit');
  assert.deepEqual(edits[0].body, { text: 'Hello' });
  assert.equal(a.store.get().save.state, 'saved');
  assert.equal(a.store.get().save.at, 1000);
});

test('a failed save is retried and says Not saved yet', async () => {
  const a = setup();
  await a.store.actions.open('c:1');
  a.data.fail.add('/edit');
  a.store.actions.type('Hello');
  await a.timers.advance(600);
  assert.equal(a.store.get().save.state, 'failed');
  const failedCalls = a.calls.filter((c) => c.path.endsWith('/edit')).length;
  await a.timers.advance(5000);
  assert.equal(a.calls.filter((c) => c.path.endsWith('/edit')).length, failedCalls + 1);
  a.data.fail.clear();
  await a.timers.advance(5000);
  assert.equal(a.store.get().save.state, 'saved');
  assert.equal(a.store.get().typed, 'Hello');
});

test('flush sends a pending edit at once through keepalive, clear and bring back type', async () => {
  const a = setup();
  await a.store.actions.open('c:1');
  a.store.actions.type('Half done');
  a.store.actions.flush();
  assert.deepEqual(a.beacons, [{ p: '/api/drafts/11/edit', b: { text: 'Half done' } }]);
  assert.equal(a.timers.pending(), 0);
  a.store.actions.clear();
  assert.equal(a.store.get().typed, '');
  a.store.actions.bringBack();
  assert.equal(a.store.get().typed, 'Hello from Wheelman');
});

test('copy marks the row done, tells the server, and Undo puts it back', async () => {
  const a = setup();
  await a.store.actions.refresh();
  await a.store.actions.open('c:1');
  a.store.actions.type('My words');
  await a.store.actions.copy({ withBlanks: false });
  assert.deepEqual(a.written, ['My words']);
  assert.ok(a.calls.some((c) => c.path === '/api/drafts/11/copied' && c.body.text === 'My words'));
  const s = a.store.get();
  assert.equal(s.done['c:1'], 'a-c:1');
  assert.equal(JSON.parse(a.mem.get('wheelman.new.done'))['c:1'], 'a-c:1');
  assert.equal(s.toast.message, 'Copied');
  assert.equal(s.toast.action.label, 'Put back in Needs reply');
  assert.deepEqual(visibleRows(s).map((r) => r.key), ['c:2']);
  assert.equal(waitingCount(s), 1);
  s.toast.action.run();
  assert.equal(a.store.get().done['c:1'], undefined);
  assert.equal(JSON.parse(a.mem.get('wheelman.new.done'))['c:1'], undefined);
  assert.equal(waitingCount(a.store.get()), 2);
});

test('copy that fails leaves the row waiting and the server untold', async () => {
  const a = setup();
  await a.store.actions.refresh();
  await a.store.actions.open('c:1');
  a.clipboard.fail = true;
  await a.store.actions.copy({});
  assert.equal(a.calls.some((c) => c.path.endsWith('/copied')), false);
  assert.deepEqual(a.store.get().done, {});
  assert.equal(a.store.get().toast.message, 'Could not copy. Select the text and copy it yourself.');
  assert.equal(a.store.get().toast.action, null);
});

test('done rows leave Needs reply until a new customer message', async () => {
  const a = setup();
  await a.store.actions.refresh();
  await a.store.actions.open('c:1');
  await a.store.actions.copy({});
  assert.deepEqual(visibleRows(a.store.get()).map((r) => r.key), ['c:2']);
  a.data.rows = [row('c:1', { anchor: 'a-newer' }), row('c:2')];
  await a.store.actions.refresh();
  assert.deepEqual(visibleRows(a.store.get()).map((r) => r.key), ['c:1', 'c:2']);
  assert.equal(waitingCount(a.store.get()), 2);
});

test('done rows still show on the All list', async () => {
  const a = setup();
  await a.store.actions.refresh();
  await a.store.actions.open('c:1');
  await a.store.actions.copy({});
  await a.store.actions.setChip('all');
  assert.equal(visibleRows(a.store.get()).length, 2);
});

test('done is read from storage when the store starts', () => {
  const calls = [];
  const storage = { getItem: () => JSON.stringify({ 'c:9': 'x' }), setItem() {} };
  const store = createStore({ api: async (p) => { calls.push(p); return {}; }, clipboard: {}, storage, now: () => 0, timers: fakeTimers(), keepalive() {} });
  assert.deepEqual(store.get().done, { 'c:9': 'x' });
  const broken = createStore({ api: async () => ({}), clipboard: {}, storage: { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } }, now: () => 0, timers: fakeTimers(), keepalive() {} });
  assert.deepEqual(broken.get().done, {});
});

test('choosing Follow-ups opens and writes the first one', async () => {
  const a = setup();
  a.data.rows = [row('c:2', { followUp: { id: 5, reason: 'No reply for 3 days' } }), row('c:1', { followUp: { id: 6, reason: 'x' } })];
  await a.store.actions.setChip('followups');
  assert.equal(a.store.get().chip, 'followups');
  assert.equal(a.store.get().key, 'c:2');
  assert.ok(paths(a.calls).includes('GET /api/items/c:2?followup=5'));
  const w = a.calls.find((c) => c.path === '/api/items/c:2/draft');
  assert.deepEqual(w.body, { instruction: undefined, message: undefined, followup: 5 });
  assert.equal(a.store.get().item.draft.reply, 'Written');
});

test('choosing Follow-ups never writes twice for one already written', async () => {
  const a = setup();
  a.data.rows = [row('c:1', { followUp: { id: 5, reason: 'x' } })];
  await a.store.actions.setChip('followups');
  assert.equal(a.calls.some((c) => c.path.endsWith('/draft')), false);
});

test('instead fetches the template and writes it only when it has no draft', async () => {
  const a = setup();
  await a.store.actions.open('c:2');
  a.data.items['c:2'] = { key: 'c:2', anchor: 'a-c:2', draft: null, template: 'tpl' };
  await a.store.actions.instead('tpl');
  assert.ok(paths(a.calls).includes('GET /api/items/c:2?message=tpl'));
  const w = a.calls.find((c) => c.path === '/api/items/c:2/draft');
  assert.equal(w.body.message, 'tpl');
  // A template that already has a draft is only shown.
  a.calls.length = 0;
  a.data.items['c:2'] = { key: 'c:2', anchor: 'a-c:2', draft: draft(31), template: 'tpl2' };
  await a.store.actions.instead('tpl2');
  assert.equal(a.calls.some((c) => c.path.endsWith('/draft')), false);
  assert.equal(a.store.get().item.draft.id, 31);
});

test('write and tell post to the draft route and drop the typed text', async () => {
  const a = setup();
  await a.store.actions.open('c:1');
  a.store.actions.type('old');
  await a.store.actions.tell('Offer 27,500');
  const w = a.calls.find((c) => c.path === '/api/items/c:1/draft');
  assert.equal(w.body.instruction, 'Offer 27,500');
  assert.equal(a.store.get().typed, null);
  assert.equal(a.store.get().item.draft.reply, 'Written');
});

test('dismiss offers Undo, which restores', async () => {
  const a = setup();
  await a.store.actions.refresh();
  await a.store.actions.open('c:1');
  await a.store.actions.dismiss();
  assert.ok(a.calls.some((c) => c.path === '/api/items/c:1/dismiss' && c.body !== undefined));
  assert.equal(a.store.get().toast.message, 'Dismissed');
  assert.equal(a.store.get().toast.action.label, 'Undo');
  a.store.get().toast.action.run();
  await settle();
  assert.ok(a.calls.some((c) => c.path === '/api/items/c:1/restore'));
});

test('dismissing a follow-up offers Undo through restore', async () => {
  const a = setup();
  a.data.items['c:1'] = { ...a.data.items['c:1'], followUp: { id: 5, reason: 'x' } };
  await a.store.actions.open('c:1');
  await a.store.actions.dismissFollowUp();
  assert.ok(a.calls.some((c) => c.path === '/api/followups/5/dismiss'));
  a.store.get().toast.action.run();
  await settle();
  assert.ok(a.calls.some((c) => c.path === '/api/followups/5/restore'));
});

test('toasts last 9 s with an action and 4 s without', async () => {
  const a = setup();
  await a.store.actions.open('c:1');
  a.clipboard.fail = true;
  await a.store.actions.copy({});
  await a.timers.advance(3900);
  assert.notEqual(a.store.get().toast, null);
  await a.timers.advance(200);
  assert.equal(a.store.get().toast, null);
  a.clipboard.fail = false;
  await a.store.actions.copy({});
  await a.timers.advance(8900);
  assert.notEqual(a.store.get().toast, null);
  await a.timers.advance(200);
  assert.equal(a.store.get().toast, null);
});

test('copyNumber copies the number', async () => {
  const a = setup();
  await a.store.actions.open('c:1');
  await a.store.actions.copyNumber();
  assert.deepEqual(a.written, ['0491 570 101']);
  assert.equal(a.store.get().toast.message, 'Number copied');
});

test('override and subscribe', async () => {
  const a = setup();
  let n = 0;
  const off = a.store.subscribe(() => { n++; });
  a.store.actions.override();
  assert.equal(a.store.get().overridden, true);
  assert.ok(n > 0);
  off();
  const seen = n;
  a.store.actions.override();
  assert.equal(n, seen);
});

test('more raises the limit by 20 and setChip refreshes', async () => {
  const a = setup();
  await a.store.actions.more();
  assert.equal(a.store.get().limit, 40);
  assert.ok(paths(a.calls).includes('GET /api/items?section=dashboard&tab=waiting&limit=40'));
});

test('the Tell hold is renewed every 30 s and released on close', async () => {
  const a = setup();
  await a.store.actions.open('c:1');
  const holds = () => a.calls.filter((c) => c.path === '/api/items/c:1/hold').map((c) => c.body.on);
  await a.store.actions.holdTell(true);
  assert.deepEqual(holds(), [true]);
  await a.timers.advance(30000);
  assert.deepEqual(holds(), [true, true]);
  await a.timers.advance(30000);
  assert.deepEqual(holds(), [true, true, true]);
  await a.store.actions.open('c:2');
  assert.deepEqual(holds(), [true, true, true, false]);
  await a.timers.advance(60000);
  assert.deepEqual(holds(), [true, true, true, false]);
  // Turned off by hand.
  await a.store.actions.holdTell(true);
  await a.store.actions.holdTell(false);
  const h2 = a.calls.filter((c) => c.path === '/api/items/c:2/hold').map((c) => c.body.on);
  assert.deepEqual(h2, [true, false]);
  assert.equal(a.timers.pending(), 0);
});

test('waitingCount subtracts only waiting rows that were copied, whatever the chip', async () => {
  const a = setup({ rows: [row('c:1', { state: 'awaiting' }), row('c:2', { state: 'answered' }), row('c:3', { state: 'awaiting' })], counts: { all: 3, waiting: 2, quiet: 1, other: 0, followups: 0 } });
  await a.store.actions.setChip('all');
  await a.store.actions.refresh();
  await a.store.actions.open('c:2');
  await a.store.actions.copy({});
  assert.equal(a.store.get().done['c:2'], 'a-c:2');
  assert.equal(waitingCount(a.store.get()), 2);
  await a.store.actions.open('c:1');
  await a.store.actions.copy({});
  assert.equal(waitingCount(a.store.get()), 1);
});
