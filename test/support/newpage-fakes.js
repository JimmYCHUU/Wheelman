// Fakes for the new page's store tests: a server, clipboard, storage and timers. Invented data only.
import { createStore } from '../../web/new/js/store.js';

export const settle = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r)); };

export function fakeTimers() {
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

export const row = (key, o = {}) => ({ key, name: 'Sam ' + key, phone: '0491 570 101', anchor: 'a-' + key, unread: 1, ...o });
export const draft = (id, o = {}) => ({ id, status: 'ready', reply: 'Hello from Wheelman', edited: null, checks: [], ...o });

/**
 * A fake server: handlers by "METHOD path" (prefix match on GET paths), a call log, and failures on
 * demand. stored: what the browser already keeps (key to value) when the page opens.
 */
export function setup(over = {}, { stored = {} } = {}) {
  const calls = [];
  const data = {
    rows: [row('c:1'), row('c:2')],
    items: { 'c:1': { key: 'c:1', anchor: 'a-c:1', phone: '0491 570 101', draft: draft(11) }, 'c:2': { key: 'c:2', anchor: 'a-c:2', draft: null } },
    counts: { all: 2, waiting: 2, quiet: 0, other: 0, followups: 1 },
    fail: new Set(),
    ...over,
  };
  // An edit is kept with its suggestion, as the server does: null when it is the suggestion as written.
  const keepEdit = (id, text) => {
    for (const [k, it] of Object.entries(data.items)) {
      if (it && it.draft && it.draft.id === id) data.items[k] = { ...it, draft: { ...it.draft, edited: text === it.draft.reply ? null : text } };
    }
  };
  const failing = (path) => [...data.fail].some((f) => path.includes(f));
  const api = async (path, body) => {
    calls.push({ path, body });
    if (failing(path)) throw new Error('Network down');
    const edit = body !== undefined && path.match(/^\/api\/drafts\/(\d+)\/edit$/);
    if (edit) { keepEdit(Number(edit[1]), body.text); return { ok: true }; }
    if (body === undefined) {
      if (path === '/api/status') return { missing: [], lastSync: { ok: true, at: 0 } };
      if (path.startsWith('/api/items?')) {
        const limit = Number(new URLSearchParams(path.split('?')[1]).get('limit')) || Infinity;
        return { items: data.rows.slice(0, limit), total: data.rows.length, counts: data.counts, unread: { dashboard: 2 }, sections: {}, section: 'dashboard' };
      }
      const t = path.match(/^\/api\/items\/[^/]+\/thread\?shown=(\d+)&limit=(\d+)$/);
      if (t) return data.thread(Number(t[1]), Number(t[2]));
      const m = path.match(/^\/api\/items\/([^?]+)/);
      if (m) return { item: data.items[m[1]] };
    }
    // A test may answer a write itself (a failed suggestion, say).
    if (data.on && data.on[path]) return data.on[path](body);
    if (path.endsWith('/draft') && data.draftReply) return data.draftReply(path, body);
    if (path.endsWith('/draft')) return { ok: true, item: { ...data.items[path.split('/')[3]], draft: draft(99, { reply: 'Written' }) } };
    return { ok: true, item: data.items[path.split('/')[3]] };
  };
  const timers = fakeTimers();
  const written = [];
  const clipboard = { fail: false, async writeText(t) { if (this.fail) throw new Error('denied'); written.push(t); } };
  const mem = new Map(Object.entries(stored));
  const storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, v) };
  const beacons = [];
  // The last edit as the page closes or hides: logged at once, then kept or failed like any other.
  const keepalive = async (p, b) => {
    beacons.push({ p, b });
    if (failing(p)) throw new Error('Network down');
    const edit = p.match(/^\/api\/drafts\/(\d+)\/edit$/);
    if (edit) keepEdit(Number(edit[1]), b.text);
  };
  const store = createStore({ api, clipboard, storage, now: () => 1000, timers, keepalive });
  return { store, calls, data, timers, written, clipboard, mem, storage, beacons };
}
export const paths = (calls) => calls.map((c) => (c.body === undefined ? 'GET ' : 'POST ') + c.path);
