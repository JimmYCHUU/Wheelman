// The Playbook's own store, beside the main one (made in main.js): the tab on screen, the fact the
// address names, the lessons and business facts as the server lists them, and Jim's changes to them,
// each with Undo. No DOM: the server and the toast are passed in, so the tests run it with fakes.
// changed() is called once a change lands, so the page can read the counts again (main.js).
import { PLAYBOOK_TABS } from './playbookroute.js';

const PATH = { lessons: '/api/playbook/lessons', facts: '/api/playbook/facts' };
const SAVED = { confirmed: 'Saved as Confirmed. New suggestions use it.', working: 'Saved as Working.' };
const BACK = 'Put back as it was.';

export function createPlaybookStore({ api, toast, changed = () => {} }) {
  let state = {
    tab: 'lessons', focus: null, state: 'idle', error: '',
    lessons: [], proposals: [], notRules: [], facts: [],
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

  /**
   * Reads a tab (an unknown one is Lessons). focus: the fact to scroll to and focus, or null.
   * again: the tab on screen read again after a change (reload), which stays on screen meanwhile, so
   * nothing typed goes. Any other read, a return visit to the tab last shown included, starts afresh.
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
      } else {
        const facts = out.facts || [];
        const needs = out.counts && Number.isFinite(out.counts.needsAnswer) ? out.counts.needsAnswer : facts.filter((f) => f.status === 'needs_answer').length;
        set({ state: 'ready', error: '', facts, counts: { ...state.counts, needsAnswer: needs } });
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
   * Posts a change; on its answer the toast says what happened, with Undo when there is one, and the
   * tab is read again. Undo posts what was there before and says so. True when the change was taken.
   * A refusal is read again too (it may have moved on); a post that got no answer is not, since the
   * read would fail the same way.
   */
  async function change(path, body, words, undo) {
    try {
      await api(path, body);
    } catch (e) {
      toast(e.message);
      if (e.status) await reload();
      return false;
    }
    toast(words, undo ? { label: 'Undo', run: () => change(undo.path, undo.body, undo.words, null) } : null);
    changed();
    await reload();
    return true;
  }

  // One change at a time: while one is on its way (or the tab is read again after it) the page holds
  // its buttons (busy), and a second press is not posted. Undo is never held back.
  let posting = false;
  async function once(path, body, words, undo) {
    if (posting) return false;
    posting = true;
    set({ busy: true });
    try { return await change(path, body, words, undo); } finally { posting = false; set({ busy: false }); }
  }

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

  return {
    get: () => state,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    actions: { load, keep, notRule, switchLesson, saveFact },
  };
}
