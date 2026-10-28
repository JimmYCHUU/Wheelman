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

export function createFinish({ api, clipboard, storage, now, get, set, toast, text, refresh, runner }) {
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
      if (item.draft && value.trim()) api('/api/drafts/' + item.draft.id + '/copied', { text: kept }).catch(() => { /* the copy itself worked */ });
      saveDone({ ...get().done, [key]: item.anchor }, { ...get().doneAt, [key]: now() });
      // Copied after its send failed, the reply is going by hand: the failure is over (its row says
      // Copied). The chat's next Send still reads Marketplace first (state.unconfirmed, sender.js).
      const was = get().sending && get().sending[key];
      if (was && was.state === 'failed') { const sending = { ...get().sending }; delete sending[key]; set({ sending }); }
      // A follow-up leaves Follow-ups on the server once it is copied, so it is put back there.
      toast(copiedWords(item, blanksIn(value).length), fu
        ? { label: 'Put back in Follow-ups', run: () => restoreFollowUp(Number(fu[1]), key) }
        : { label: 'Put back in Needs reply', run: () => putBack(key) });
    });
  }

  /** The row copied from this conversation goes back in Needs reply (nothing changes on the server). */
  function putBack(key = get().key) {
    const done = { ...get().done };
    const doneAt = { ...get().doneAt };
    delete done[key];
    delete doneAt[key];
    saveDone(done, doneAt);
  }

  /** Undo for Dismiss: the conversation is waiting again. */
  async function restore(key = get().key) {
    if (!key) return;
    try {
      const back = await api('/api/items/' + key + '/restore', {});
      if (back.item && key === get().key) set({ item: back.item });
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

  async function dismiss() {
    const key = get().key;
    if (!key) return;
    try {
      const out = await api('/api/items/' + key + '/dismiss', {});
      if (out.item && key === get().key) set({ item: out.item });
      toast('Dismissed', { label: 'Undo', run: () => restore(key) });
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
