// The new page's store: all of its state and every action, with no DOM. The server, clipboard, storage,
// clock and timers are passed in, so the tests run it with fakes. The UI reads get() and calls actions.
import { boxText } from './model.js';
import { createAutosave } from './autosave.js';
import { visibleRows, followUpOf, waitingCount } from './listview.js';
import { createRemember } from './remember.js';
import { createRunner } from './runstore.js';
import { createFinish, readDone } from './finish.js';
import { createHold } from './hold.js';

export { visibleRows, followUpOf, waitingCount };

const NEW_MESSAGE = 'New message from the customer. Your text is kept.';

export function createStore({ api, clipboard, storage, now, timers, keepalive }) {
  // Only the Dashboard is on the new page yet: the section never changes, whatever the address says.
  let state = {
    section: 'dashboard', chip: 'waiting', rows: [], total: 0, counts: {}, unread: {}, listState: 'loading', listError: '',
    limit: 20, key: null, item: null, itemState: 'idle', typed: null, save: { state: 'idle', at: null },
    overridden: false, ...readDone(storage), status: null, toast: null, context: null,
    writing: null, remembered: [], closedNotes: [], run: null, runSummary: null, runMore: 0, runSkipped: 0,
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

  // ---- the list and the open conversation

  function takeItem(taken) {
    const old = state.item;
    // Answered by someone else: its anchor moved on and the suggestion went with it, so the one that was there is kept to show.
    const elsewhere = taken.state === 'answered' && !!taken.answered;
    const was = (old && old.draft && old.draft.status === 'ready' && old.draft.reply) || (old && old.lastSuggestion) || '';
    const fresh = elsewhere && !taken.draft && was ? { ...taken, lastSuggestion: was } : taken;
    const changed = old && ((old.draft && old.draft.id) !== (fresh.draft && fresh.draft.id) || old.anchor !== fresh.anchor);
    if (changed && state.typed !== null && !elsewhere) {
      // The typed text stays. Its replacement is offered only once there is a suggestion to use.
      const ready = !!(fresh.draft && fresh.draft.status === 'ready');
      set({ item: fresh, context: { message: NEW_MESSAGE, action: ready ? { label: 'Use the new suggestion', run: useSuggestion } : null } });
    } else {
      set({ item: fresh, itemState: 'ready' });
    }
  }

  // "Use the new suggestion": the typed text goes, on the server too (an edit that is the suggestion
  // as written is kept as none), so no poll brings it back; a poll already on its way is not taken.
  function useSuggestion() {
    autosave.drop();
    listSeq++;
    const d = state.item && state.item.draft;
    set({ item: d ? { ...state.item, draft: { ...d, edited: null, editedAt: null } } : state.item, typed: null, context: null, save: { state: 'idle', at: null } });
    if (d && d.status === 'ready') api('/api/drafts/' + d.id + '/edit', { text: d.reply || '' }).catch((e) => toast(e.message));
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

  // The reply run (web/new/js/runstore.js). Its opens are the store's own; the person's end it.
  const runner = createRunner({ get: () => state, set, now, open: (key) => show(key), close });
  const hold = createHold({ api, get: () => state, timers });
  const { copy, putBack, restore, restoreFollowUp, copyLink, copyNumber, copyEmail, dismiss, dismissFollowUp } =
    createFinish({ api, clipboard, storage, now, get: () => state, set, toast, text, refresh, runner });
  const open = (key, o) => { runner.end(); return show(key, o); };

  async function show(key, { followup } = {}) {
    flush();
    await hold.releaseFor(key);
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

  // Another list. Chosen, Follow-ups opens the first one and writes it if nothing is written or being
  // written. From the address (a key, or null: Back, forward), only that conversation opens, if any.
  async function setChip(id, { key } = {}) {
    runner.end();
    set({ chip: id });
    await refresh();
    if (state.chip !== id) return; // another chip was chosen meanwhile
    if (key !== undefined) { // with its follow-up, and nothing is written by itself
      const followup = followUpOf(state, key);
      if (key && (key !== state.key || (followup || null) !== followupId)) await show(key, { followup });
      return;
    }
    if (id !== 'followups') return;
    const first = state.rows[0];
    if (!first) { set({ key: null, item: null, itemState: 'idle' }); return; }
    const fu = first.followUp && first.followUp.id;
    await show(first.key, { followup: fu });
    if (state.itemState === 'ready' && state.item && !state.item.draft && !state.item.writing) await write({ followup: fu });
  }

  // The first list and conversation, from the address. Another section's address (still on the old
  // page) shows its tab's note only: the Dashboard's list loads, and nothing is opened or seen.
  async function boot(route, { wide } = {}) {
    set({ chip: route.chip || 'waiting' });
    await refresh();
    if ((route.section || state.section) !== state.section) return;
    const key = route.key || (wide && visibleRows(state)[0] ? visibleRows(state)[0].key : null);
    if (key) await show(key, { followup: followUpOf(state, key) });
  }

  async function more() {
    set({ limit: state.limit + 20 });
    await refresh();
  }

  /** No conversation open: what was typed goes out first, and an open on its way is not taken. */
  function close() { flush(); openSeq++; set({ key: null, item: null, itemState: 'idle', typed: null, context: null, save: { state: 'idle', at: null } }); }

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
  const { remember, justOnce, switchLesson } = createRemember({ api, get: () => state, set, toast });

  async function instead(id) {
    const key = state.key;
    if (!key) return;
    // The pick is asked for by name, '' too: without it the server shows the newest suggestion.
    picked = id || '';
    try {
      const { item } = await api(itemPath(key));
      if (key !== state.key) return;
      // Another suggestion in the box: the save note was for the text there, saved with its own one.
      set({ item, itemState: 'ready', typed: null, context: null, save: { state: 'idle', at: null } });
      if (id && !item.draft) await write({ message: id });
    } catch (e) { toast(e.message); }
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

  return {
    get: () => state,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    actions: {
      boot, refresh, setChip, more, open, type, flush, write, tell, holdTell: hold.holdTell, instead, copy, copyNumber, copyEmail, older, dismiss, dismissFollowUp,
      putBack, restore, restoreFollowUp, copyLink, toast, remember, justOnce, switchLesson,
      startRun: runner.start, skipRun: runner.skip, endRun: runner.end,
      clear: () => type(''),
      bringBack: () => type((state.item && state.item.draft && state.item.draft.reply) || ''),
      override: () => set({ overridden: true }),
    },
  };
}
