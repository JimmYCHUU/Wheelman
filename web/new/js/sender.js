// Send on Facebook, the only send anywhere: the text in the box goes to the buyer through the
// Marketplace engine, only when the button is pressed, and never twice. A send is kept by
// conversation (state.sending[key]), so a chat opened again while its reply is on its way still
// reads Sending…, and one that did not go keeps its text and says why. When a send fails, and again
// before Try again posts, the chat is read again: one that has moved on since posts nothing. No DOM:
// the store passes in what it holds.
import { blanksIn } from '../../lib/blank.js';
import { liveChecks } from './model.js';
import { hashFor } from './route.js';
import { replyChannel, sendFor, sendOutcome, repliedSince, sentWords, sendFailedAwayWords } from './channel.js';

const IDLE = { state: 'idle', at: null };

export function createSender({ api, get, set, toast, text, refresh }) {
  const without = (sending, key) => { const rest = { ...sending }; delete rest[key]; return rest; };
  /** This chat's send from now on: a state, or null for none. */
  const mark = (key, value) => set({ sending: value ? { ...get().sending, [key]: value } : without(get().sending, key) });

  /** The chat as the server has it now: { item }, or { error } when it cannot be read. */
  async function reread(key) {
    try {
      const { item } = await api('/api/items/' + key);
      return item ? { item } : { error: 'That Marketplace chat was not found.' };
    } catch (e) { return { error: e.message }; }
  }

  /** The reply went: the send ends, and if the chat is still open its text goes with it (a later message from the buyer never brings it back to be sent again). */
  function went(key, item) {
    const open = key === get().key && item;
    set({ sending: without(get().sending, key), ...(open ? { item, itemState: 'ready', typed: null, context: null, save: IDLE } : {}) });
  }

  /**
   * Sends the open Facebook chat's text, with the suggestion it came from, and says what happened:
   * 'sent'; 'failed'; 'replied' or 'moved' (Try again found the chat with a reply since, or a new
   * message from the buyer: nothing is posted, and the chat as it is now is on screen); 'fill' (a
   * blank is still in the text: nothing is posted, and the box goes to the blank); 'blocked' (a
   * failed check not passed with Send anyway: nothing is posted); or null when there is nothing to
   * send here (not a Facebook chat, no text, or its reply already on its way).
   */
  async function send() {
    const { key, item, sending, overridden } = get();
    if (!key || !item || replyChannel(item) !== 'facebook') return null;
    const value = text();
    const was = sending[key];
    if (!value.trim() || (was && was.state === 'sending')) return null;
    // A blank is never sent to a buyer (the server refuses one too), and a failed check needs Send anyway.
    if (blanksIn(value).length) return 'fill';
    const ready = item.draft && item.draft.status === 'ready' ? item.draft : null;
    if (!overridden && liveChecks(ready, value).some((c) => c.level === 'fail')) return 'blocked';
    // Try again is a failure the box shows (sendFor: about the chat on screen); one about a message
    // since is old news, and this is a new send.
    const failed = was && was.state === 'failed' && sendFor(item, was) ? was : null;
    const anchor = item.anchor;
    mark(key, { state: 'sending' });
    if (failed) {
      // Before Try again posts, the chat is read again. Moved on since the failure (its reply went
      // after all, another page's did, or the buyer wrote again): nothing is posted. Not read: nothing either.
      const since = failed.anchor !== undefined ? failed.anchor : anchor;
      const now = await reread(key);
      if (now.error) { mark(key, { ...failed, error: now.error }); return 'failed'; }
      if (now.item.anchor !== since) {
        const replied = repliedSince(now.item, since);
        if (replied && failed.outcome === 'unknown') went(key, now.item); else mark(key, null);
        await refresh();
        return replied ? 'replied' : 'moved';
      }
    }
    let out;
    try {
      out = await api('/api/items/' + key + '/send', { text: value, draftId: item.draft ? item.draft.id : null });
    } catch (e) {
      return failedSend(key, item, anchor, e);
    }
    const away = key !== get().key;
    went(key, out.item);
    toast(sentWords(out.queued, away ? item.name : ''));
    await refresh();
    return 'sent';
  }

  /**
   * A send that threw. The chat is read again: one that shows a reply since the message it answered
   * is not told as a failure and offers nothing to send again (a send whose outcome could not be
   * told is taken as the reply that went). Otherwise the failure is kept against the chat as it is
   * now, a message from the buyer during the send included, so it is always said: in the box while
   * the chat is open, else in a toast that names the buyer and opens the chat.
   */
  async function failedSend(key, item, anchor, e) {
    const outcome = sendOutcome(e);
    const now = await reread(key);
    if (now.item && repliedSince(now.item, anchor)) {
      if (outcome === 'unknown') {
        const away = key !== get().key;
        went(key, now.item);
        toast(sentWords(false, away ? item.name : ''));
      } else mark(key, null);
      await refresh();
      return outcome === 'unknown' ? 'sent' : 'replied';
    }
    const isOpen = get().key === key;
    const shown = isOpen ? get().item : null;
    const at = now.item ? now.item.anchor : shown ? shown.anchor : anchor;
    mark(key, { state: 'failed', error: e.message, outcome, anchor: at });
    if (!isOpen) {
      toast(sendFailedAwayWords(item.name, e.message, outcome), { label: 'Open', href: hashFor({ section: item.section || 'marketplace', chip: 'waiting', key }) });
    } else if (now.item && shown && shown.anchor !== now.item.anchor) {
      await refresh(); // the buyer's new message, with the text kept beside it
    }
    return 'failed';
  }

  return { send };
}
