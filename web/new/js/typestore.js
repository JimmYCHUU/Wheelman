// Changing the open conversation's enquiry type from its More menu (enquiry.js says what is asked):
// the request, the page following the conversation to its new section, Undo for 9 s, and the
// rewrite read until it is written. What Jim typed is never written over: its edit goes out first,
// and the request says keep. The store passes in what it holds; nothing here touches the DOM.
import { typeRequest, typeUndo } from './enquiry.js';
import { validChip } from './sections.js';
import { sectionName } from './model.js';

const CHECK_EVERY = 2000;
const CHECKS = 15;
// Where a conversation is listed and how it is answered: what a ruling or a move changes.
const PLACEMENT = ['section', 'home', 'moved', 'listed', 'moves', 'ruling', 'isImport', 'judged', 'writing'];

/**
 * flush() sends the edit waiting to be saved at once (with keepalive) and returns nothing to wait
 * for; dismiss(words) is Dismiss with Undo (finish.js).
 */
export function createTypeChanger({ api, get, set, toast, flush, refresh, dismiss, timers }) {
  let followed = 0;   // counts the moves the page is asked to follow (state.goTo.n)
  let check = null;   // the next read of a conversation being written again

  /** The page goes where the conversation is listed now, on Needs reply while it waits, else All. */
  function follow(item) {
    const chip = validChip(item.section, item.state === 'awaiting' ? 'waiting' : 'all');
    set({ goTo: { section: item.section, chip, key: item.key, n: ++followed } });
  }

  /** While its suggestion is written again, the open conversation is read every 2 s, at most 15 times. */
  function watch(key) {
    timers.clear(check);
    let left = CHECKS;
    const writing = () => { const s = get(); return s.key === key && !!s.item && !!s.item.writing; };
    const tick = async () => {
      check = null;
      if (!writing()) return;
      left--;
      await refresh();
      if (left > 0 && writing()) check = timers.set(tick, CHECK_EVERY);
    };
    check = timers.set(tick, CHECK_EVERY);
  }

  /** Posts a change for this conversation. With text in its box, the edit goes out first and nothing is written over it. */
  function post(req, key) {
    flush();
    const keep = get().key === key && get().typed !== null;
    return api(req.path, keep ? { ...req.body, keep: true } : req.body);
  }

  /**
   * The conversation as the server answered it, taken while it is still the one open. The route
   * builds it as a plain open does, with no message picked and no follow-up: when the one in hand
   * was asked for with either, or its message or suggestion is another, only where it is listed and
   * how it is answered are taken, and the refresh brings the rest (so typed text is not told of a
   * new message, nor saved with a suggestion that is not in the box). The page follows it only when
   * it is listed in another section now: in the same one, the chip and the open conversation stay as
   * they are (a follow-up opened from Follow-ups stays in hand).
   */
  function take(out, key) {
    const was = get().item;
    if (!out.item || get().key !== key) return false;
    const id = (it) => (it.draft ? it.draft.id : null);
    const other = was && (get().picked !== null || out.item.anchor !== was.anchor || id(out.item) !== id(was));
    const item = other ? { ...was, ...Object.fromEntries(PLACEMENT.filter((f) => f in out.item).map((f) => [f, out.item[f]])) } : out.item;
    set({ item, itemState: 'ready' });
    if (!was || item.section !== was.section) follow(item);
    if (item.writing) watch(key);
    return true;
  }

  /** Undo: the type and the section as they were. The page goes back with it only while it is still open. */
  async function putBack(undo, key) {
    let out;
    try { out = await post(undo, key); } catch (e) { toast(e.message); return; }
    toast('Put back as it was.');
    take(out, key);
    await refresh();
  }

  /** 'stock' or 'import': ruled and moved as enquiry.js asks; 'notcustomer': dismissed, with Undo. */
  async function setType(type) {
    const { key, item } = get();
    if (!key || !item) return;
    if (type === 'notcustomer') { await dismiss('Dismissed as not a customer'); return; }
    const req = typeRequest(item, type);
    if (!req) return;
    const undo = typeUndo(item);
    let out;
    try { out = await post(req, key); } catch (e) { toast(e.message); return; }
    const to = out.item ? out.item.section : item.section;
    const said = to !== item.section ? 'Moved to ' + sectionName(to) + '.' : type === 'import' ? 'Now answered as an import enquiry.' : 'Now answered as a stock enquiry.';
    toast(said + (out.writing ? ' The reply is being written again.' : ''), { label: 'Undo', run: () => putBack(undo, key) });
    take(out, key);
    await refresh();
  }

  return { setType };
}
