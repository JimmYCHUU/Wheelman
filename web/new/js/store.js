// The new page's store: all of its state and every action, with no DOM. The server, clipboard, storage,
// clock and timers are passed in, so the tests run it with fakes. The UI reads get() and calls actions.
import { boxText } from './model.js';
import { createAutosave } from './autosave.js';
import { visibleRows, followUpOf, waitingCount } from './listview.js';
import { createRemember } from './remember.js';
import { createRunner } from './runstore.js';
import { createFinish, readDone } from './finish.js';
import { createHold } from './hold.js';
import { createSender } from './sender.js';
import { sendingNow } from './channel.js';
import { validChip, sectionOff, listFor } from './sections.js';
import { writesOnOpen } from '../../lib/onopen.js';

export { visibleRows, followUpOf, waitingCount };

const NEW_MESSAGE = 'New message from the customer. Your text is kept.';

/** shown(key): the page's word on whether that open conversation is on screen (a phone showing the list hides it); none: always. */
export function createStore({ api, clipboard, storage, now, timers, keepalive, shown }) {
  let state = {
    section: 'dashboard', chip: 'waiting', rows: [], total: 0, counts: {}, sections: {}, unread: {}, listState: 'loading', listError: '',
    limit: 20, key: null, item: null, itemState: 'idle', typed: null, save: { state: 'idle', at: null },
    overridden: false, ...readDone(storage), status: null, toast: null, context: null,
    writing: null, writeFailed: null, sending: {}, unconfirmed: {}, remembered: [], closedNotes: [], run: null, runSummary: null, runMore: 0, runSkipped: 0,
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

  /** A toast; action: { label, run } or { label, href } (an address the page goes to, as a row does). */
  function toast(message, action = null) {
    const id = ++toastSeq;
    timers.clear(toastTimer);
    const run = action && (() => { timers.clear(toastTimer); set({ toast: null }); return action.run ? action.run() : undefined; });
    set({ toast: { message, action: action ? { label: action.label, run, href: action.href || null } : null } });
    toastTimer = timers.set(() => { if (id === toastSeq) set({ toast: null }); }, action ? 9000 : 4000);
  }

  // ---- saving what the person types (web/new/js/autosave.js)

  const autosave = createAutosave({ api, now, timers, keepalive, get: () => state, set });
  const flush = () => autosave.flush();

  /** The text in the box changed (typing, Clear, Bring back, Add to reply); false when it was not taken. */
  function type(value) {
    // While its reply is sending the box is locked: what goes is the text as Send was pressed.
    if (sendingNow(state.item, state.sending[state.key])) return false;
    const typed = String(value ?? '');
    const id = draftId(state.item);
    // "Saving…" from the first key: the save itself waits for a pause in the typing.
    set(id ? { typed, save: { state: 'saving', at: state.save.at } } : { typed });
    autosave.queue(id, typed);
    return true;
  }

  // ---- the list and the open conversation

  function takeItem(taken) {
    // A reply from here that did not reach the buyer is noted; one whose send could not be told,
    // now in the chat, is taken with its text gone (sender.js).
    sender.seen(taken);
    if (sender.settle(taken)) return;
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
      set({ status, ...listFor(list, state.section), sections: list.sections || {}, unread: list.unread || {}, listState: 'ready', listError: '' });
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
  // Send on Facebook (web/new/js/sender.js): only when its button is pressed, never by a key.
  const sender = createSender({ api, get: () => state, set, toast, text, refresh, take: takeItem, now, shown });
  const { send } = sender;
  const open = (key, o) => { runner.end(); return show(key, o); };

  async function show(key, { followup } = {}) {
    flush();
    await hold.releaseFor(key);
    const seq = ++openSeq;
    followupId = followup || null;
    picked = null;
    olderLoaded = 0;
    set({ key, item: null, itemState: 'loading', typed: null, overridden: false, context: null, writeFailed: null, save: { state: 'idle', at: null } });
    let item;
    try {
      ({ item } = await api('/api/items/' + key + (followup ? '?followup=' + followup : '')));
      if (seq !== openSeq) return;
      set({ item, itemState: 'ready', rows: state.rows.map((r) => (r.key === key ? { ...r, unread: 0 } : r)) });
      sender.seen(item);
      api('/api/items/' + key + '/seen', {}).catch(() => {});
    } catch (e) {
      if (seq === openSeq) set({ itemState: 'error' });
      toast(e.message);
      return;
    }
    // A waiting Facebook buyer is written as the chat opens, once: not while this page's own write
    // for it is on its way (the server may not say so yet). The write is started, not waited for:
    // the open (and a boot, a section switch, the address) is done once the conversation is in, and
    // the box reads Writing… from here, as write() says so before it asks.
    if (writesOnOpen(item) && state.typed === null && state.writing !== key) write({});
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

  // Another section, from the address (a tab, a search result, Back): a run ends quietly, and what
  // was typed goes out first (close flushes it) before the section's list loads on one of its own
  // chips. Then the conversation the address names opens there, unless it is the one open; with
  // none, the first row on a wide window.
  async function setSection(id, { chip, key, wide } = {}) {
    runner.end();
    if (key && key === state.key) flush(); else close();
    // Its chips start with no counts: the section before's are not this one's.
    set({ section: id, chip: validChip(id, chip), rows: [], total: 0, counts: {}, listState: 'loading', limit: 20 });
    await refresh();
    if (state.section !== id || sectionOff(id, state.sections)) return; // another section was chosen meanwhile, or this one is off
    const to = key || (wide && visibleRows(state)[0] ? visibleRows(state)[0].key : null);
    if (to && to !== state.key) await show(to, { followup: followUpOf(state, to) });
  }

  /** The first list and conversation, from the address: its section, as setSection opens it. */
  const boot = (route, { wide } = {}) => setSection(route.section || 'dashboard', { chip: route.chip, key: route.key, wide });

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
    // A refusal is about the chat as it is now: its message and its state (sectionBox tells it only while they hold).
    const asked = { key, anchor: state.item ? state.item.anchor : null, state: state.item ? state.item.state : null };
    set({ writing: key, writeFailed: null });
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
      // A failed suggestion says why in the box. With none to say it (the budget used, say), the
      // box says the server's words with Try again (boxsections.js), never only a toast that goes.
      const shown = !!(out.item && out.item.draft && out.item.draft.status === 'failed');
      if (out.error && !shown) { set({ writeFailed: { ...asked, message: out.error } }); toast(out.error); }
    } catch (e) {
      if (key === state.key) { set({ writeFailed: { ...asked, message: e.message } }); toast(e.message); }
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
      boot, refresh, setSection, setChip, more, open, type, flush, write, tell, holdTell: hold.holdTell, instead, copy, send, copyNumber, copyEmail, older, dismiss, dismissFollowUp,
      putBack, restore, restoreFollowUp, copyLink, toast, remember, justOnce, switchLesson,
      startRun: runner.start, skipRun: runner.skip, endRun: runner.end,
      clear: () => type(''),
      bringBack: () => type((state.item && state.item.draft && state.item.draft.reply) || ''),
      override: () => set({ overridden: true }),
    },
  };
}
