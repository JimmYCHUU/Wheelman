// The Playbook's own store, beside the main one (made in main.js): the tab on screen, the fact the
// address names, the lessons, business facts and wording as the server lists them, and Jim's changes
// to them, each with Undo. No DOM: the server and the toast are passed in, so the tests run it with
// fakes. changed() is called once a change lands, so the page can read the counts again (main.js).
//
// The Templates and Voice tabs edit one part of a wording file at a time (editing). A template is
// saved only after the very words in the editor were shown on three conversations (previewed); a
// voice rule has no preview. Words typed and not saved are kept by part (unsentanswers.js), so an
// editor opened again starts from them; the editor itself stays open across tabs, Back and the Menu.
import { PLAYBOOK_TABS } from './playbookroute.js';
import { canSave, partKey, openOn } from './wordingview.js';
import { unsentWording, keepUnsentWording } from './unsentanswers.js';

const WORDING = '/api/playbook/wording';
const PATH = { lessons: '/api/playbook/lessons', facts: '/api/playbook/facts', templates: WORDING, voice: WORDING };
const SAVED = { confirmed: 'Saved as Confirmed. New suggestions use it.', working: 'Saved as Working.' };
const SAVED_WORDING = 'Saved. New suggestions use it; suggestions already written keep their words.';
const UNCHANGED = 'Nothing changed: these are the words in use already.';
const REPLACED = 'These words replace the ones you typed.';
const NOTHING_SHOWN = 'Nothing came back to show it on. Press Show how it reads again.';
const BACK = 'Put back as it was.';

export function createPlaybookStore({ api, toast, changed = () => {} }) {
  let state = {
    tab: 'lessons', focus: null, state: 'idle', error: '',
    lessons: [], proposals: [], notRules: [], facts: [],
    // The wording files and their parts; the part open in an editor, with its words; the words last
    // shown on three conversations, with what they showed; and each part's versions, once read.
    wording: [], editing: null, previewed: null, earlier: {},
    // What waits on each tab, from its last read: null until it has been read.
    counts: { toReview: null, needsAnswer: null },
    // A change on its way: the page holds its change buttons until it has landed.
    busy: false,
  };
  const listeners = new Set();
  const set = (patch) => {
    state = { ...state, ...patch };
    for (const fn of [...listeners]) fn();
  };

  // Only the newest read is taken: one for another tab, asked for since, is the one on screen.
  let seq = 0;
  // The newest read of each part's versions: an older answer that lands after it is not kept, nor
  // one asked for before the tab was read again.
  const asked = new Map();

  /**
   * Reads a tab (an unknown one is Lessons). focus: the fact to scroll to and focus, or null.
   * again: the tab on screen read again after a change (reload), which stays on screen meanwhile, so
   * nothing typed goes. Any other read, a return visit to the tab last shown included, starts afresh.
   * An editor open on a part stays open, with its words, whatever is read.
   */
  async function read(tab, focus, again) {
    const t = PLAYBOOK_TABS.includes(tab) ? tab : 'lessons';
    const mine = ++seq;
    const keep = again && t === state.tab && state.state === 'ready';
    set({ tab: t, focus: focus || null, ...(keep ? {} : { state: 'loading', error: '' }) });
    try {
      const out = await api(PATH[t]);
      if (mine !== seq) return;
      if (t === 'lessons') {
        const proposals = out.proposals || [];
        set({ state: 'ready', error: '', lessons: out.lessons || [], proposals, notRules: out.notRules || [], counts: { ...state.counts, toReview: proposals.length } });
      } else if (t === 'facts') {
        const facts = out.facts || [];
        const needs = out.counts && Number.isFinite(out.counts.needsAnswer) ? out.counts.needsAnswer : facts.filter((f) => f.status === 'needs_answer').length;
        set({ state: 'ready', error: '', facts, counts: { ...state.counts, needsAnswer: needs } });
      } else {
        // The versions read before may have moved on: each is read again when it is next opened.
        asked.clear();
        set({ state: 'ready', error: '', wording: out.files || [], earlier: {} });
      }
    } catch (e) {
      if (mine !== seq) return;
      // Read again after a change: what is there stays (and anything typed in it), and the toast says
      // why. Any other read says so on the page, with Try again.
      if (keep) toast(e.message);
      else set({ state: 'error', error: e.message });
    }
  }

  /** Reads a tab for the address, or for Try again. */
  const load = (tab, focus = null) => read(tab, focus, false);

  /** The tab on screen, read again once a change has landed (or was refused: it may have moved on). */
  const reload = () => read(state.tab, state.focus, true);

  /**
   * Posts; the server's answer, or null when it was not taken: the toast says why, and a refusal is
   * read again (it may have moved on). A post that got no answer is not, since the read would fail
   * the same way.
   */
  async function post(path, body) {
    try {
      return { out: await api(path, body) };
    } catch (e) {
      toast(e.message);
      if (e.status) await reload();
      return null;
    }
  }

  /** A change that landed: the toast says so, with Undo when there is one, and the tab is read again. */
  async function landed(words, undo) {
    toast(words, undo ? { label: 'Undo', run: () => change(undo.path, undo.body, undo.words, null) } : null);
    changed();
    await reload();
  }

  /** Posts a change and, once it lands, says so. Undo posts what was there before and says so. True when it was taken. */
  async function change(path, body, words, undo) {
    if (!(await post(path, body))) return false;
    await landed(words, undo);
    return true;
  }

  // One change or preview at a time: while one is on its way (or the tab is read again after it) the
  // page holds its buttons (busy), and a second press is not posted. Undo is never held back.
  let posting = false;
  async function hold(fn) {
    if (posting) return false;
    posting = true;
    set({ busy: true });
    try { return await fn(); } finally { posting = false; set({ busy: false }); }
  }
  const once = (path, body, words, undo) => hold(() => change(path, body, words, undo));

  const decide = (key, decision) => ({ path: '/api/playbook/proposals', body: { key, decision } });

  /** Keep as a lesson (Keep it after all, on one marked not a rule). Undo puts it back where it was. */
  function keep(key) {
    const wasNotRule = state.notRules.some((p) => p.key === key);
    const undo = wasNotRule ? { ...decide(key, 'reject'), words: 'Put back as not a rule.' } : { ...decide(key, 'undo'), words: 'Put back to review.' };
    const { path, body } = decide(key, 'keep');
    return once(path, body, 'Kept. It applies from the next suggestion.', undo);
  }

  /** Not a rule: Wheelman stops proposing it. Undo puts it back to review. */
  function notRule(key) {
    const { path, body } = decide(key, 'reject');
    return once(path, body, 'Marked as not a rule. Wheelman will not suggest it again.', { ...decide(key, 'undo'), words: 'Put back to review.' });
  }

  /** A lesson's switch, through the lessons route the old page uses. Undo switches it back. */
  function switchLesson(id, on) {
    const path = '/api/lessons/' + id + '/switch';
    const words = on ? 'Lesson switched on.' : 'Lesson switched off. It no longer shapes suggestions.';
    return once(path, { on: !!on }, words, { path, body: { on: !on }, words: BACK });
  }

  /**
   * An answer to a business fact, saved as Confirmed or Working. Undo puts back what was in use: the
   * answer and status saved before, or, for a fact that was the file's, the file's own answer (so a
   * later hand edit to the file is used, as before the save). True when it was saved; false on a
   * refusal (the toast says the server's words), so the editor keeps its text.
   */
  function saveFact(title, answer, status) {
    const was = state.facts.find((f) => f.title === title);
    const before = !was ? null : was.from === 'file' ? { title, from: 'file' } : { title, answer: was.answer || '', status: was.status };
    const undo = before ? { path: PATH.facts, body: before, words: BACK } : null;
    return once(PATH.facts, { title, answer, status }, status === 'working' ? SAVED.working : SAVED.confirmed, undo);
  }

  // ---- templates and voice rules ----------------------------------------------------------------

  const fileOf = (name) => state.wording.find((f) => f.name === name) || null;
  const partOf = (name, part) => ((fileOf(name) || {}).parts || []).find((p) => p.part === part) || null;
  /** Keeps the words typed for a part, unless they are its wording in use. */
  const keepWords = (name, part, text) => { const p = partOf(name, part); keepUnsentWording(name, part, p && p.text === text ? null : text); };

  /** Whether the editor is open on this part. */
  const editingOn = (name, part) => openOn(state.editing, { name, part });

  /** The editor on one part, with these words; another part starts with no preview. */
  function put(name, part, text) {
    const same = editingOn(name, part);
    keepWords(name, part, text);
    set({ editing: { name, part, text }, ...(same ? {} : { previewed: null }) });
  }

  /**
   * Opens the editor on one part: with `words` (an earlier version, or the file's own wording), else
   * with what is in it already, else the words typed for it before, else its wording in use. Another
   * part starts with no preview: Save waits for one of its own words. Words put over words typed
   * for the part (in its open editor, or kept from before) say so, with Undo that puts them back.
   */
  function edit(name, part, words) {
    const p = partOf(name, part);
    if (!p) return;
    const kept = unsentWording(name, part);
    const typed = editingOn(name, part) ? state.editing.text : kept;
    if (words === undefined) { put(name, part, typed !== null ? typed : p.text); return; }
    const text = String(words);
    put(name, part, text);
    if (typed !== null && typed !== p.text && typed !== text) {
      toast(REPLACED, { label: 'Undo', run: () => { put(name, part, typed); toast(BACK); } });
    }
  }

  /** The words in the open editor, as typed. */
  function type(text) {
    if (!state.editing) return;
    const { name, part } = state.editing;
    keepWords(name, part, text);
    set({ editing: { name, part, text } });
  }

  /** Closes the editor; its words are forgotten. */
  function cancel() {
    if (state.editing) keepUnsentWording(state.editing.name, state.editing.part, null);
    set({ editing: null, previewed: null });
  }

  /**
   * Shows a template's words on three conversations, written by the code that writes each message.
   * Its answer is kept only while the editor is still on that part: { name, part, text, previews,
   * none }, `none` being the server's sentence about them (why there is nothing to show it on, or
   * that none of the cards shows the change). A refusal says the server's words, and the editor
   * keeps its own; an answer with no cards and no sentence counts as nothing shown, holds Save, and
   * says so. True when shown.
   */
  function preview(name, part, text) {
    return hold(async () => {
      const r = await post('/api/playbook/preview', { name, part, text });
      if (!r) return false;
      const out = r.out && typeof r.out === 'object' ? r.out : {};
      const none = typeof out.none === 'string' ? out.none : '';
      const previews = Array.isArray(out.previews) ? out.previews : [];
      if (!previews.length && !none) { toast(NOTHING_SHOWN); return false; }
      if (!editingOn(name, part)) return false;
      set({ previewed: { name, part, text, previews, none } });
      return true;
    });
  }

  /**
   * Saves one part's words as a new version, used from the next suggestion: only the very words in
   * its open editor, and for a template only when they are the words last shown on three
   * conversations (canSave); a voice rule's are saved as they are. Undo saves the version before as
   * a new one. Saved, the editor closes and its words are forgotten, unless more was typed while the
   * save was on its way: those stay, in the open editor. Refused, the toast says the server's words
   * and the editor keeps them. True when the server took them.
   */
  function saveWording(name, part, text) {
    const f = fileOf(name);
    const p = partOf(name, part);
    if (!f || !p || !(editingOn(name, part) && state.editing.text === text)) return Promise.resolve(false);
    if (f.kind !== 'voice' && !(canSave(state.previewed, text) && openOn(state.previewed, { name, part }))) return Promise.resolve(false);
    const before = p.text;
    return hold(async () => {
      const r = await post(WORDING, { name, part, text });
      if (!r) return false;
      if (unsentWording(name, part) === text) keepUnsentWording(name, part, null);
      if (editingOn(name, part) && state.editing.text === text) set({ editing: null, previewed: null });
      if (r.out && r.out.unchanged) toast(UNCHANGED);
      else await landed(SAVED_WORDING, { path: WORDING, body: { name, part, text: before }, words: BACK });
      return true;
    });
  }

  /** Reads every saved version of a part, and the file's own wording, into earlier[partKey(name, part)]. */
  async function versions(name, part) {
    const k = partKey(name, part);
    const mine = (asked.get(k) || 0) + 1;
    asked.set(k, mine);
    const kind = (fileOf(name) || {}).kind || 'template';
    const land = (entry) => { if (asked.get(k) === mine) set({ earlier: { ...state.earlier, [k]: entry } }); };
    land({ state: 'loading' });
    try {
      land({ state: 'ready', out: await api('/api/playbook/versions?' + new URLSearchParams({ kind, name, part })) });
    } catch (e) {
      land({ state: 'error', error: e.message });
    }
  }

  return {
    get: () => state,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    actions: { load, keep, notRule, switchLesson, saveFact, edit, type, cancel, preview, saveWording, versions },
  };
}
