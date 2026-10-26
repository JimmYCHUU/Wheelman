// The new page's store: all of its state and every action, with no DOM. The server, clipboard, storage,
// clock and timers are passed in, so the tests run it with fakes. The UI reads get() and calls actions.
import { boxText } from './model.js';
import { createAutosave } from './autosave.js';

const DONE_KEY = 'wheelman.new.done';
const DONE_AT_KEY = 'wheelman.new.doneAt';
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
  const read = (k) => {
    try { const v = JSON.parse(storage.getItem(k)); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
  };
  let state = {
    section: 'dashboard', chip: 'waiting', rows: [], total: 0, counts: {}, unread: {}, listState: 'loading', listError: '',
    limit: 20, key: null, item: null, itemState: 'idle', typed: null, save: { state: 'idle', at: null },
    overridden: false, done: read(DONE_KEY), doneAt: read(DONE_AT_KEY), status: null, toast: null, context: null,
    writing: null,
  };
  const listeners = new Set();
  const draftId = (item) => (item && item.draft ? item.draft.id : null);
  const set = (patch) => {
    // "Copy anyway" was for the draft on screen: another draft is checked afresh.
    if ('item' in patch && !('overridden' in patch) && draftId(patch.item) !== draftId(state.item)) patch = { ...patch, overridden: false };
    state = { ...state, ...patch };
    for (const fn of [...listeners]) fn();
  };

  // Things the UI has no need to see.
  let followupId = null;          // the follow-up the open conversation was opened from
  let picked = null;              // the answer picked from "Instead:" ('' a reply to what they wrote), null for none
  let toastTimer = null;
  let toastSeq = 0;
  let holdKey = null;
  let holdTimer = null;
  let openSeq = 0;
  let olderLoaded = 0;            // messages in front of the newest ones, from Load older messages
  let listSeq = 0;
  let writeSeq = 0;

  const text = () => (state.typed !== null ? state.typed : boxText(state.item && state.item.draft));

  /** How the open conversation is asked for: with the answer picked and the follow-up in hand. */
  const itemPath = (key) => {
    const q = [picked !== null ? 'message=' + encodeURIComponent(picked) : '', followupId ? 'followup=' + followupId : ''].filter(Boolean).join('&');
    return '/api/items/' + key + (q ? '?' + q : '');
  };

  function saveDone(done, doneAt) {
    set({ done, doneAt });
    try {
      storage.setItem(DONE_KEY, JSON.stringify(done));
      storage.setItem(DONE_AT_KEY, JSON.stringify(doneAt));
    } catch { /* storage may be blocked */ }
  }

  function toast(message, action = null) {
    const id = ++toastSeq;
    timers.clear(toastTimer);
    const run = action && (() => { timers.clear(toastTimer); set({ toast: null }); return action.run(); });
    set({ toast: { message, action: action ? { label: action.label, run } : null } });
    toastTimer = timers.set(() => { if (id === toastSeq) set({ toast: null }); }, action ? 9000 : 4000);
  }

  // ---- saving what the person types (web/new/js/autosave.js)

  const autosave = createAutosave({ api, now, timers, keepalive, get: () => state, set });
  const flush = () => autosave.flush();

  function type(value) {
    const typed = String(value ?? '');
    const id = draftId(state.item);
    // "Saving…" from the first key: the save itself waits for a pause in the typing.
    set(id ? { typed, save: { state: 'saving', at: state.save.at } } : { typed });
    autosave.queue(id, typed);
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
      // The typed text stays. Its replacement is offered only once there is a suggestion to use.
      const ready = !!(fresh.draft && fresh.draft.status === 'ready');
      set({ item: fresh, context: {
        message: NEW_MESSAGE,
        action: ready ? { label: 'Use the new suggestion', run: () => set({ typed: null, context: null }) } : null,
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
      const { item } = await api(itemPath(key));
      const whole = item && key === state.key ? await withOlder(item) : item;
      if (key === state.key && seq === listSeq && whole) takeItem(whole);
    } catch { /* the conversation on screen stays as it was */ }
  }

  async function open(key, { followup } = {}) {
    flush();
    if (holdKey && holdKey !== key) await release();
    const seq = ++openSeq;
    followupId = followup || null;
    picked = null;
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

  /** The template in the box, which a write keeps unless told otherwise (none: a reply to what they wrote). */
  const templateInHand = (item) => (item && item.templates && item.templates.length && item.template) || undefined;

  async function write({ instruction, message, followup } = {}) {
    const key = state.key;
    if (!key) return;
    // A follow-up written from here is the one in hand from now on, so a refresh asks for it.
    if (followup) followupId = followup;
    const fu = followup !== undefined ? followup : followupId || undefined;
    const msg = message !== undefined ? message : templateInHand(state.item);
    const seq = ++writeSeq;
    set({ writing: key });
    try {
      const out = await api('/api/items/' + key + '/draft', { instruction, message: msg, followup: fu });
      if (key !== state.key) return;
      const ready = !!(out.item && out.item.draft && out.item.draft.status === 'ready');
      if (ready || (out.item && state.typed === null)) {
        // A new suggestion replaces the text, and an edit still waiting to be saved goes with it.
        autosave.drop();
        set({ item: out.item, itemState: 'ready', typed: null, context: null, save: { state: 'idle', at: null } });
      } else if (out.item) {
        // It could not be written: the typed text stays, saved with the suggestion now on screen (so
        // a reload brings it back), and a save that was failing keeps its note and its retry.
        set({ item: out.item, itemState: 'ready' });
        autosave.move(draftId(out.item), state.typed);
      }
      const shown = !!(out.item && out.item.draft && out.item.draft.status === 'failed');
      if (out.error && !shown) toast(out.error);
    } catch (e) {
      if (key === state.key) toast(e.message);
    } finally {
      if (seq === writeSeq) set({ writing: null });
    }
  }

  const tell = (instruction) => write({ instruction });

  async function instead(id) {
    const key = state.key;
    if (!key) return;
    // The pick is asked for by name, '' too: without it the server shows the newest suggestion.
    picked = id || '';
    try {
      const { item } = await api(itemPath(key));
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
    const fu = /^fu:(\d+)$/.exec(item.anchor || '');
    await copyText(value, async () => {
      // The server keeps every reply copied, the person's own text beside a suggestion that could not
      // be written too, and closes a follow-up that was copied (its anchor is fu:<id>).
      if (item.draft && value.trim()) { try { await api('/api/drafts/' + item.draft.id + '/copied', { text: value }); } catch { /* the copy itself worked */ } }
      saveDone({ ...state.done, [key]: item.anchor }, { ...state.doneAt, [key]: now() });
      // A follow-up leaves Follow-ups on the server once it is copied, so it is put back there.
      toast('Copied', fu
        ? { label: 'Put back in Follow-ups', run: () => restoreFollowUp(Number(fu[1]), key) }
        : { label: 'Put back in Needs reply', run: () => putBack(key) });
    });
  }

  /** The row copied from this conversation goes back in Needs reply (nothing changes on the server). */
  function putBack(key = state.key) {
    const done = { ...state.done };
    const doneAt = { ...state.doneAt };
    delete done[key];
    delete doneAt[key];
    saveDone(done, doneAt);
  }

  /** Undo for Dismiss: the conversation is waiting again. */
  async function restore(key = state.key) {
    if (!key) return;
    try {
      const back = await api('/api/items/' + key + '/restore', {});
      if (back.item && key === state.key) set({ item: back.item });
      await refresh();
    } catch (e) { toast(e.message); }
  }

  /** A follow-up copied or dismissed is due again, and the row copied from it is no longer done. */
  async function restoreFollowUp(id = state.item && state.item.followUp && state.item.followUp.id, key = state.key) {
    if (!id) return;
    try {
      const back = await api('/api/followups/' + id + '/restore', {});
      if (back.item && key === state.key) set({ item: back.item });
      if (state.done[key] !== undefined) putBack(key);
      await refresh();
    } catch (e) { toast(e.message); }
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
      toast('Dismissed', { label: 'Undo', run: () => restore(key) });
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
      toast('Follow-up dismissed', { label: 'Undo', run: () => restoreFollowUp(fu.id, key) });
      await refresh();
    } catch (e) { toast(e.message); }
  }

  return {
    get: () => state,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    actions: {
      boot, refresh, setChip, more, open, type, flush, write, tell, holdTell, instead, copy, copyNumber, copyEmail, older, dismiss, dismissFollowUp,
      putBack, restore, restoreFollowUp,
      clear: () => type(''),
      bringBack: () => type((state.item && state.item.draft && state.item.draft.reply) || ''),
      override: () => set({ overridden: true }),
    },
  };
}
