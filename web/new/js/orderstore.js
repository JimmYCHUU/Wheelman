// An auction order's own actions: a message pasted in (what the customer wrote on WhatsApp, which
// Wheelman cannot read, or one we sent by hand), a pasted message taken out again, and where the
// customer's own texts are answered. Nothing is sent and nothing is learned. The store passes in
// what it holds; take is its takeItem, so text typed in the box survives a paste.
import { plainPaste } from './model.js';
import { t } from '../../lib/copy.js';

export function createOrderActions({ api, get, set, toast, refresh, take }) {
  /**
   * Adds a message to the open order: 'in' what they wrote (the server writes a reply for it, and
   * the box says Writing… meanwhile), 'out' what we sent (nothing is written). True once it is in,
   * so the paste box closes and empties; false when there was nothing to paste or it did not go,
   * and the pasted text stays.
   */
  async function paste(direction, text) {
    const { key, item } = get();
    if (!key || !item || !item.order) return false;
    const words = plainPaste(text).trim();
    if (!words) { toast('There was nothing to paste.'); return false; }
    const dir = direction === 'out' ? 'out' : 'in';
    if (dir === 'in') set({ writing: key, writeFailed: null });
    let out;
    try {
      out = await api('/api/items/' + key + '/paste', { direction: dir, text: words });
    } catch (e) {
      toast(e.message);
      return false;
    } finally {
      if (dir === 'in' && get().writing === key) set({ writing: null });
    }
    if (key === get().key && out.item) {
      // The server answers with the order as it stands, with no message picked: the paste is what is answered now.
      set({ picked: null });
      // What they wrote is a new message, and its reply is offered beside typed text; what we sent is not.
      if (dir === 'in') take(out.item);
      else set({ item: out.item });
    }
    if (dir === 'out') toast('Added to the order. No reply is written.');
    // The list is read again (the order's row says what is due now) while the paste box closes.
    refresh();
    return true;
  }

  /** Takes a pasted message out of the open order. As on the old page there is no Undo: it is pasted again. */
  async function removePaste(id) {
    const key = get().key;
    if (!key) return;
    try {
      const out = await api('/api/items/' + key + '/paste/' + id + '/remove', {});
      // With a message picked the server's answer is not the order on screen: the refresh reads it.
      if (out.item && key === get().key && get().picked === null) set({ item: out.item });
      toast('Taken out of the order.');
      await refresh();
    } catch (e) { toast(e.message); }
  }

  /**
   * Where the order's customer has their texts answered: 'dashboard' (an ordinary conversation) or
   * 'auction' (on this order, the only move into Auction made by hand). Undo moves them back.
   */
  async function moveTexts(section) {
    const o = get().item && get().item.order;
    const texts = o && o.texts;
    if (!texts) return;
    const move = (to) => api('/api/items/' + texts.key + '/move', { section: to });
    try {
      const out = await move(section);
      toast(t(section === 'dashboard' ? 'toast.textsToDashboard' : 'toast.textsToOrder'), { label: 'Undo', run: async () => {
        try { await move(out.from); } catch (e) { toast(e.message); return; }
        await refresh();
      } });
      await refresh();
    } catch (e) { toast(e.message); }
  }

  return { paste, removePaste, moveTexts };
}
