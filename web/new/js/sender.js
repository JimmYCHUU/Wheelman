// Send on Facebook, the only send anywhere: the text in the box goes to the buyer through the
// Marketplace engine, only when the button is pressed. A send is kept by conversation
// (state.sending[key]), so a chat opened again while its reply is on its way still reads Sending…,
// and one that did not go keeps its text and says why. No DOM: the store passes in what it holds.
import { blanksIn } from '../../lib/blank.js';
import { liveChecks } from './model.js';
import { replyChannel } from './channel.js';

const SENT = 'Sent. It is on its way to the buyer.';
const QUEUED = 'Queued. The Marketplace system sends it as soon as its phone is back online.';

export function createSender({ api, get, set, toast, text, refresh }) {
  const without = (sending, key) => { const rest = { ...sending }; delete rest[key]; return rest; };

  /**
   * Sends the open Facebook chat's text, with the suggestion it came from, and says what happened:
   * 'sent', 'failed', 'fill' (a blank is still in the text: nothing is posted, and the box goes to
   * the blank), 'blocked' (a failed check not passed with Send anyway: nothing is posted), or null
   * when there is nothing to send here (not a Facebook chat, no text, or its reply already on its way).
   */
  async function send() {
    const { key, item, sending, overridden } = get();
    if (!key || !item || replyChannel(item) !== 'facebook') return null;
    const value = text();
    if (!value.trim() || (sending[key] && sending[key].state === 'sending')) return null;
    // A blank is never sent to a buyer (the server refuses one too), and a failed check needs Send anyway.
    if (blanksIn(value).length) return 'fill';
    const ready = item.draft && item.draft.status === 'ready' ? item.draft : null;
    if (!overridden && liveChecks(ready, value).some((c) => c.level === 'fail')) return 'blocked';
    const anchor = item.anchor;
    set({ sending: { ...sending, [key]: { state: 'sending' } } });
    let out;
    try {
      out = await api('/api/items/' + key + '/send', { text: value, draftId: item.draft ? item.draft.id : null });
    } catch (e) {
      // The text stays where it is; the box says why, for the chat as it was when Send was pressed.
      set({ sending: { ...get().sending, [key]: { state: 'failed', error: e.message, anchor } } });
      return 'failed';
    }
    // The reply is on its way and the text went with it, so a later message from the buyer never
    // brings it back to be sent again. Another conversation open by now stays as it is.
    const open = key === get().key && out.item;
    set({ sending: without(get().sending, key), ...(open ? { item: out.item, itemState: 'ready', typed: null, context: null, save: { state: 'idle', at: null } } : {}) });
    toast(out.queued ? QUEUED : SENT);
    await refresh();
    return 'sent';
  }

  return { send };
}
