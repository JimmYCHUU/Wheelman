// Finishing with a conversation: Copy and what follows it, the done marks kept in storage, Put back,
// Dismiss with Undo, and copying a link, number or email. The store passes in what it holds.
import { blanksIn } from '../../lib/blank.js';
import { replyChannel, copiedWords } from './channel.js';

const DONE_KEY = 'wheelman.new.done';
const DONE_AT_KEY = 'wheelman.new.doneAt';
const COPY_FAILED = 'Could not copy. Select the text and copy it yourself.';

/** The done marks the store starts with. */
export function readDone(storage) {
  const read = (k) => {
    try { const v = JSON.parse(storage.getItem(k)); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
  };
  return { done: read(DONE_KEY), doneAt: read(DONE_AT_KEY) };
}

/** type(text): the store's, for the words that come back with an order's message put back. */
export function createFinish({ api, clipboard, storage, now, get, set, toast, text, refresh, runner, type }) {
  // An auction order's message handed over here, by conversation, until it is put back: the
  // suggestion copied ({ anchor, draftId, sent: its /copied request }), and the words typed for the
  // message copied or dismissed ({ words, anchor, draftId }), which come back with that message only.
  const copiedHere = new Map();
  const handed = new Map();

  /**
   * An order's message copied or dismissed: the text typed for it leaves the box, kept with the
   * message it was for. Words for a later message replace it; nothing typed leaves it as it was.
   */
  function handOver(key, item) {
    const typed = get().typed;
    if (typed !== null) handed.set(key, { words: typed, anchor: item.anchor, draftId: item.draft ? item.draft.id : null });
    set({ typed: null, context: null });
  }

  /**
   * After a Put back, the words handed over come back only into the message they were typed for:
   * the box holds its anchor, and its suggestion when there is one. Otherwise that message's own
   * saved edit shows, and the words wait for their message. Used, they are forgotten.
   */
  function giveBack(key) {
    const h = handed.get(key);
    const s = get();
    if (!h || key !== s.key || s.typed !== null || !s.item || s.item.anchor !== h.anchor) return;
    if (h.draftId !== null && !(s.item.draft && s.item.draft.id === h.draftId)) return;
    handed.delete(key);
    type(h.words);
  }

  function saveDone(done, doneAt) {
    set({ done, doneAt });
    try {
      storage.setItem(DONE_KEY, JSON.stringify(done));
      storage.setItem(DONE_AT_KEY, JSON.stringify(doneAt));
    } catch { /* storage may be blocked */ }
  }

  async function copyText(value, thenDone) {
    try { await clipboard.writeText(value); } catch { toast(COPY_FAILED); return false; }
    if (thenDone) await thenDone();
    return true;
  }

  // In a reply run a copy waits its turn, and the next customer opens once it worked (runstore.js).
  const copy = () => runner.copy(get().key, copyNow);

  /** Copies the reply in the box, and says whether it was copied. */
  async function copyNow() {
    const { key, item } = get();
    if (!item) return false;
    const value = text();
    const fu = /^fu:(\d+)$/.exec(item.anchor || '');
    return copyText(value, () => {
      // The server keeps every reply copied, the person's own text beside a suggestion that could not
      // be written too, and closes a follow-up that was copied (its anchor is fu:<id>). Nothing waits for it.
      // Marketplace is never learned from: its Copy tells the server no text, as the old page does.
      const kept = replyChannel(item) === 'facebook' ? '' : value;
      const sent = item.draft && value.trim() ? api('/api/drafts/' + item.draft.id + '/copied', { text: kept }).catch(() => { /* the copy itself worked */ }) : null;
      saveDone({ ...get().done, [key]: item.anchor }, { ...get().doneAt, [key]: now() });
      // An order's message is handed over once copied: the order moves on on the server, with the
      // copy in its thread, so the text leaves the box (Put back in To do brings it back), and the
      // box says Copied, not a new message beside old words. Put back names the suggestion copied.
      const copiedId = item.order && item.draft ? item.draft.id : undefined;
      if (copiedId) copiedHere.set(key, { anchor: item.anchor, draftId: copiedId, sent });
      if (item.order && key === get().key) handOver(key, item);
      // Copied after its send failed, the reply is going by hand: the failure is over (its row says
      // Copied). The chat's next Send still reads Marketplace first (state.unconfirmed, sender.js).
      const was = get().sending && get().sending[key];
      if (was && was.state === 'failed') { const sending = { ...get().sending }; delete sending[key]; set({ sending }); }
      // A follow-up leaves Follow-ups on the server once it is copied, so it is put back there. An
      // order's message is handled on the server once copied, so it is put back in To do there.
      toast(copiedWords(item, blanksIn(value).length), fu
        ? { label: 'Put back in Follow-ups', run: () => restoreFollowUp(Number(fu[1]), key) }
        : item.order ? { label: 'Put back in To do', run: () => restore(key, { draftId: copiedId }) }
          : { label: 'Put back in Needs reply', run: () => putBack(key) });
    });
  }

  /** The row copied from this conversation goes back in Needs reply (nothing changes on the server). */
  function putBack(key = get().key) {
    const done = { ...get().done };
    const doneAt = { ...get().doneAt };
    delete done[key];
    delete doneAt[key];
    copiedHere.delete(key);
    saveDone(done, doneAt);
  }

  /**
   * Undo for Dismiss: the conversation is waiting again. For an auction order it is Put back in To
   * do, after a Dismiss or a Copy: the message is due again, the row copied from it is no longer
   * done, and the words typed for that message come back into it (giveBack) while it is open.
   * draftId: the suggestion copied, which the server puts back (the copy's toast names it, and the
   * box's own Put back while it says Copied); none, the message at the order's anchor now. With a
   * message picked the server's answer is not the one on screen: the refresh reads it.
   */
  async function restore(key = get().key, { draftId } = {}) {
    if (!key) return;
    const s = get();
    const mark = copiedHere.get(key);
    const copied = draftId !== undefined ? draftId
      : mark && key === s.key && s.item && s.item.anchor === mark.anchor && s.done[key] === mark.anchor ? mark.draftId : undefined;
    try {
      // The copy is recorded first, so a Put back pressed at once still undoes it.
      if (mark && mark.sent) await mark.sent;
      const back = await api('/api/items/' + key + '/restore', copied ? { draftId: copied } : {});
      if (back.item && key === get().key && get().picked === null) set({ item: back.item });
      if (get().done[key] !== undefined) putBack(key);
      giveBack(key);
      await refresh();
    } catch (e) { toast(e.message); }
  }

  /** A follow-up copied or dismissed is due again, and the row copied from it is no longer done. */
  async function restoreFollowUp(id = get().item && get().item.followUp && get().item.followUp.id, key = get().key) {
    if (!id) return;
    try {
      const back = await api('/api/followups/' + id + '/restore', {});
      if (back.item && key === get().key) set({ item: back.item });
      if (get().done[key] !== undefined) putBack(key);
      await refresh();
    } catch (e) { toast(e.message); }
  }

  /** A car's photo, video or document link, from the panel; the customer's number or email address. */
  const copyLink = (url) => copyText(url, () => toast('Link copied'));
  const copyNumber = async () => { const s = get(); if (s.item && s.item.phone) await copyText(s.item.phone, () => toast('Number copied')); };
  const copyEmail = async () => { const s = get(); if (s.item && s.item.email) await copyText(s.item.email, () => toast('Email copied')); };

  /**
   * Dismiss, with Undo. words: the toast's (Not a customer says why); the More menu's Dismiss passes
   * none, as its menu runs a choice with no arguments.
   */
  async function dismiss(words = 'Dismissed') {
    const { key, item } = get();
    if (!key) return;
    try {
      const out = await api('/api/items/' + key + '/dismiss', {});
      if (out.item && key === get().key) set({ item: out.item });
      // An order's message is set aside on the server, as after a copy: its text leaves the box, and Undo brings it back.
      if (item && item.order && key === get().key) handOver(key, item);
      toast(words, { label: 'Undo', run: () => restore(key) });
      await runner.dismissed(key); // in a reply run, the next customer
      await refresh();
    } catch (e) { toast(e.message); }
  }

  async function dismissFollowUp() {
    const fu = get().item && get().item.followUp;
    if (!fu) return;
    const key = get().key;
    try {
      const out = await api('/api/followups/' + fu.id + '/dismiss', {});
      if (out.item && key === get().key) set({ item: out.item });
      toast('Follow-up dismissed', { label: 'Undo', run: () => restoreFollowUp(fu.id, key) });
      await refresh();
    } catch (e) { toast(e.message); }
  }

  return { copy, copyNow, copyText, putBack, restore, restoreFollowUp, copyLink, copyNumber, copyEmail, dismiss, dismissFollowUp };
}
