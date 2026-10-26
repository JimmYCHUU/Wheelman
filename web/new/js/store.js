// The new page's store: all of its state and every action, with no DOM. The server, clipboard, storage,
// clock and timers are passed in, so the tests run it with fakes. The UI reads get() and calls actions.
import { boxText } from './model.js';

const DONE_KEY = 'wheelman.new.done';
const COPY_FAILED = 'Could not copy. Select the text and copy it yourself.';
const NEW_MESSAGE = 'New message from the customer. Your text is kept.';

/** Needs reply hides the rows just copied (until the customer writes again and the anchor changes). */
export function visibleRows(s) {
  if (s.chip !== 'waiting') return s.rows;
  return s.rows.filter((r) => s.done[r.key] !== r.anchor);
}

export function waitingCount(s) {
  // On other chips the rows include answered ones, which were never in the count.
  const hidden = s.rows.filter((r) => s.done[r.key] === r.anchor && (s.chip === 'waiting' || r.state === 'awaiting')).length;
  return Math.max(0, ((s.counts && s.counts.waiting) || 0) - hidden);
}

export function createStore({ api, clipboard, storage, now, timers, keepalive }) {
  const readDone = () => {
    try { const v = JSON.parse(storage.getItem(DONE_KEY)); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
  };
  let state = {
    section: 'dashboard', chip: 'waiting', rows: [], total: 0, counts: {}, unread: {}, listState: 'loading', listError: '',
    limit: 20, key: null, item: null, itemState: 'idle', typed: null, save: { state: 'idle', at: null },
    overridden: false, done: readDone(), status: null, toast: null, context: null,
  };
  const listeners = new Set();
  const set = (patch) => { state = { ...state, ...patch }; for (const fn of [...listeners]) fn(); };

  // Things the UI has no need to see.
  let followupId = null;          // the follow-up the open conversation was opened from
  let pending = null;             // { id, text }: an edit waiting to be sent
  let saveTimer = null;
  let toastTimer = null;
  let toastSeq = 0;
  let holdKey = null;
  let holdTimer = null;
  let openSeq = 0;
  let olderLoaded = 0;            // messages in front of the newest ones, from Load older messages
  let listSeq = 0;

  const text = () => (state.typed !== null ? state.typed : boxText(state.item && state.item.draft));

  function saveDone(done) {
    set({ done });
    try { storage.setItem(DONE_KEY, JSON.stringify(done)); } catch { /* storage may be blocked */ }
  }

  function toast(message, action = null) {
    const id = ++toastSeq;
    timers.clear(toastTimer);
    const run = action && (() => { timers.clear(toastTimer); set({ toast: null }); return action.run(); });
    set({ toast: { message, action: action ? { label: action.label, run } : null } });
    toastTimer = timers.set(() => { if (id === toastSeq) set({ toast: null }); }, action ? 9000 : 4000);
  }

  // ---- saving what the person types

  async function send(edit) {
    set({ save: { state: 'saving', at: state.save.at } });
    try {
      await api('/api/drafts/' + edit.id + '/edit', { text: edit.text });
      if (pending === edit) pending = null;
      if (pending === null) set({ save: { state: 'saved', at: now() } });
    } catch {
      if (pending !== edit) return;
      set({ save: { state: 'failed', at: state.save.at } });
      saveTimer = timers.set(() => send(edit), 5000);
    }
  }

  function type(value) {
    set({ typed: String(value ?? '') });
    const id = state.item && state.item.draft && state.item.draft.id;
    timers.clear(saveTimer);
    if (!id) { pending = null; return; }
    const edit = { id, text: state.typed };
    pending = edit;
    saveTimer = timers.set(() => send(edit), 600);
  }

  function flush() {
    timers.clear(saveTimer);
    if (!pending) return;
    const edit = pending;
    pending = null;
    keepalive('/api/drafts/' + edit.id + '/edit', { text: edit.text });
  }

  // ---- the Tell hold: automatic writing never replaces a draft while an instruction is being typed

  async function release() {
    timers.clear(holdTimer);
    const key = holdKey;
    holdKey = null;
    if (key) { try { await api('/api/items/' + key + '/hold', { on: false }); } catch { /* it lapses by itself */ } }
  }

  async function holdTell(on) {
    if (!on) { await release(); return; }
    if (!state.key) return;
    if (holdKey && holdKey !== state.key) await release();
    const key = state.key;
    const beat = async () => {
      if (holdKey !== key) return;
      try { await api('/api/items/' + key + '/hold', { on: true }); } catch { /* retried at the next beat */ }
      if (holdKey === key) holdTimer = timers.set(beat, 30000);
    };
    if (holdKey === key) return;
    holdKey = key;
    await beat();
  }

  // ---- the list and the open conversation

  function takeItem(fresh) {
    const old = state.item;
    const changed = old && ((old.draft && old.draft.id) !== (fresh.draft && fresh.draft.id) || old.anchor !== fresh.anchor);
    if (changed && state.typed !== null) {
      set({ item: fresh, context: {
        message: NEW_MESSAGE,
        action: { label: 'Use the new suggestion', run: () => set({ typed: null, context: null }) },
      } });
    } else {
      set({ item: fresh, itemState: 'ready' });
    }
  }

  /** The newest messages as the server sent them, with the older ones already loaded put back in front. */
  async function withOlder(fresh) {
    if (!olderLoaded || !fresh.thread) return fresh;
    try {
      const out = await api('/api/items/' + fresh.key + '/thread?shown=' + fresh.thread.length + '&limit=' + olderLoaded);
      const have = new Set(fresh.thread.map((m) => m.key));
      return { ...fresh, thread: [...out.thread.filter((m) => !have.has(m.key)), ...fresh.thread], earlier: out.earlier };
    } catch { return fresh; }
  }

  async function refresh() {
    const seq = ++listSeq;
    try {
      const status = await api('/api/status');
      const list = await api('/api/items?section=' + state.section + '&tab=' + state.chip + '&limit=' + state.limit);
      if (seq !== listSeq) return;
      set({ status, rows: list.items || [], total: list.total || 0, counts: list.counts || {}, unread: list.unread || {}, listState: 'ready', listError: '' });
    } catch (e) {
      if (seq === listSeq) set({ listState: 'error', listError: e.message });
      return;
    }
    const key = state.key;
    if (!key || state.itemState === 'loading') return;
    try {
      const { item } = await api('/api/items/' + key + (followupId ? '?followup=' + followupId : ''));
      const whole = item && key === state.key ? await withOlder(item) : item;
      if (key === state.key && seq === listSeq && whole) takeItem(whole);
    } catch { /* the conversation on screen stays as it was */ }
  }

  async function open(key, { followup } = {}) {
    flush();
    if (holdKey && holdKey !== key) await release();
    const seq = ++openSeq;
    followupId = followup || null;
    olderLoaded = 0;
    set({ key, item: null, itemState: 'loading', typed: null, overridden: false, context: null, save: { state: 'idle', at: null } });
    try {
      const { item } = await api('/api/items/' + key + (followup ? '?followup=' + followup : ''));
      if (seq !== openSeq) return;
      set({ item, itemState: 'ready', rows: state.rows.map((r) => (r.key === key ? { ...r, unread: 0 } : r)) });
      api('/api/items/' + key + '/seen', {}).catch(() => {});
    } catch (e) {
      if (seq === openSeq) set({ itemState: 'error' });
      toast(e.message);
    }
  }

  async function setChip(id) {
    set({ chip: id });
    await refresh();
    if (id !== 'followups') return;
    const first = state.rows[0];
    if (!first) { set({ key: null, item: null, itemState: 'idle' }); return; }
    const fu = first.followUp && first.followUp.id;
    await open(first.key, { followup: fu });
    if (state.itemState === 'ready' && state.item && !state.item.draft) await write({ followup: fu });
  }

  async function boot(route, { wide } = {}) {
    set({ section: route.section || 'dashboard', chip: route.chip || 'waiting' });
    await refresh();
    if (route.key) await open(route.key);
    else if (wide) {
      const first = visibleRows(state)[0];
      if (first) await open(first.key, { followup: state.chip === 'followups' && first.followUp ? first.followUp.id : undefined });
    }
  }

  async function more() {
    set({ limit: state.limit + 20 });
    await refresh();
  }

  // ---- writing

  async function write({ instruction, message, followup } = {}) {
    const key = state.key;
    if (!key) return;
    timers.clear(saveTimer);
    pending = null;
    const fu = followup !== undefined ? followup : followupId || undefined;
    try {
      const out = await api('/api/items/' + key + '/draft', { instruction, message, followup: fu });
      if (key !== state.key) return;
      if (out.item) set({ item: out.item, itemState: 'ready', typed: null, context: null });
      if (out.error) toast(out.error);
    } catch (e) {
      if (key === state.key) toast(e.message);
    }
  }

  const tell = (instruction) => write({ instruction });

  async function instead(id) {
    const key = state.key;
    if (!key) return;
    const q = [id ? 'message=' + encodeURIComponent(id) : '', followupId ? 'followup=' + followupId : ''].filter(Boolean).join('&');
    try {
      const { item } = await api('/api/items/' + key + (q ? '?' + q : ''));
      if (key !== state.key) return;
      set({ item, itemState: 'ready', typed: null, context: null });
      if (id && !item.draft) await write({ message: id });
    } catch (e) { toast(e.message); }
  }

  // ---- finishing with a conversation

  async function copyText(value, thenDone) {
    try { await clipboard.writeText(value); } catch { toast(COPY_FAILED); return false; }
    if (thenDone) await thenDone();
    return true;
  }

  async function copy() {
    const { key, item } = state;
    if (!item) return;
    const value = text();
    await copyText(value, async () => {
      if (item.draft) { try { await api('/api/drafts/' + item.draft.id + '/copied', { text: value }); } catch { /* the copy itself worked */ } }
      saveDone({ ...state.done, [key]: item.anchor });
      toast('Copied', { label: 'Put back in Needs reply', run: () => { const d = { ...state.done }; delete d[key]; saveDone(d); } });
    });
  }

  async function copyNumber() {
    const number = state.item && state.item.phone;
    if (!number) return;
    await copyText(number, () => toast('Number copied'));
  }

  async function copyEmail() {
    const address = state.item && state.item.email;
    if (!address) return;
    await copyText(address, () => toast('Email copied'));
  }

  /** Load older messages: the twenty before the ones shown, put in front. */
  async function older() {
    const { key, item } = state;
    if (!key || !item) return;
    try {
      const out = await api('/api/items/' + key + '/thread?shown=' + (item.thread || []).length + '&limit=20');
      if (key !== state.key || !state.item) return;
      const have = new Set((state.item.thread || []).map((m) => m.key));
      const fresh = (out.thread || []).filter((m) => !have.has(m.key));
      olderLoaded += fresh.length;
      set({ item: { ...state.item, thread: [...fresh, ...(state.item.thread || [])], earlier: out.earlier || 0 } });
    } catch (e) { toast(e.message); }
  }

  async function dismiss() {
    const key = state.key;
    if (!key) return;
    try {
      const out = await api('/api/items/' + key + '/dismiss', {});
      if (out.item && key === state.key) set({ item: out.item });
      toast('Dismissed', { label: 'Undo', run: async () => {
        try { const back = await api('/api/items/' + key + '/restore', {}); if (back.item && key === state.key) set({ item: back.item }); await refresh(); } catch (e) { toast(e.message); }
      } });
      await refresh();
    } catch (e) { toast(e.message); }
  }

  async function dismissFollowUp() {
    const fu = state.item && state.item.followUp;
    if (!fu) return;
    const key = state.key;
    try {
      const out = await api('/api/followups/' + fu.id + '/dismiss', {});
      if (out.item && key === state.key) set({ item: out.item });
      toast('Follow-up dismissed', { label: 'Undo', run: async () => {
        try { const back = await api('/api/followups/' + fu.id + '/restore', {}); if (back.item && key === state.key) set({ item: back.item }); await refresh(); } catch (e) { toast(e.message); }
      } });
      await refresh();
    } catch (e) { toast(e.message); }
  }

  return {
    get: () => state,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    actions: {
      boot, refresh, setChip, more, open, type, flush, write, tell, holdTell, instead, copy, copyNumber, copyEmail, older, dismiss, dismissFollowUp,
      clear: () => type(''),
      bringBack: () => type((state.item && state.item.draft && state.item.draft.reply) || ''),
      override: () => set({ overridden: true }),
    },
  };
}
