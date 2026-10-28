// Send on Facebook, the only send anywhere: the text in the box goes to the buyer through the
// Marketplace engine, only when the button is pressed, and never twice. A send is kept by
// conversation (state.sending[key]), so a chat opened again while its reply is on its way still
// reads Sending…, and one that did not go keeps its text and says why. When a send fails, and again
// before a send after it posts, the chat is read again: text that is in the chat already is never
// posted again, and a chat that has moved on since a failure posts nothing. No DOM: the store passes
// in what it holds, how it takes a chat (take, as a refresh does) and whether a chat is on screen.
import { blanksIn } from '../../lib/blank.js';
import { liveChecks, boxText } from './model.js';
import { hashFor } from './route.js';
import { deliveryFailed } from './boxsections.js';
import { replyChannel, sendFor, sendOutcome, repliedSince, sentSince, sameText, sentWords, sendFailedAwayWords } from './channel.js';

const IDLE = { state: 'idle', at: null };

export function createSender({ api, get, set, toast, text, refresh, take, now, shown = () => true }) {
  const without = (sending, key) => { const rest = { ...sending }; delete rest[key]; return rest; };
  /** This chat's send from now on: a state, or null for none. */
  const mark = (key, value) => set({ sending: value ? { ...get().sending, [key]: value } : without(get().sending, key) });
  /** Whether the chat is open and on screen: a phone showing the list keeps it open, out of sight. */
  const onScreen = (key) => get().key === key && shown(key);

  /** The chat as the server has it now: { item }, or { error } when it cannot be read. */
  async function reread(key) {
    try {
      const { item } = await api('/api/items/' + key);
      return item ? { item } : { error: 'That Marketplace chat was not found.' };
    } catch (e) { return { error: e.message }; }
  }

  /** The chat as read again, into the store when it is the open one (as a refresh takes it: typed text kept beside a new message). */
  const show = (key, item) => { if (item && key === get().key) take(item); };

  /**
   * The reply went: the send ends, and if the chat is still open its text goes with it (a later
   * message from the buyer never brings it back to be sent again), and the chat as it is now is
   * taken. With no chat to take (the server could not show it), the one on screen has its
   * suggestion marked as sent from here until a chat is taken, so Send is not offered again.
   */
  function went(key, item) {
    if (key !== get().key) { mark(key, null); return; }
    const was = get().item;
    const shownNow = item || (was && was.draft ? { ...was, draft: { ...was.draft, sentHereAt: now() } } : null);
    set({ sending: without(get().sending, key), ...(shownNow ? { item: shownNow, itemState: 'ready' } : {}), typed: null, context: null, save: IDLE });
  }

  /** The chat a reply went to, in a toast's Open: its own address, as a row opens it. */
  const openIt = (item, key) => ({ label: 'Open', href: hashFor({ section: item.section || 'marketplace', chip: 'waiting', key }) });

  /**
   * Sends the open Facebook chat's text, with the suggestion it came from, and says what happened:
   * 'sent'; 'failed'; 'replied' or 'moved' (the chat read first had the text already, a reply since,
   * or a new message from the buyer: nothing is posted, and the chat as it is now is on screen);
   * 'fill' (a blank is still in the text: nothing is posted, and the box goes to the blank);
   * 'blocked' (a failed check not passed with Send anyway: nothing is posted); or null when there is
   * nothing to send here (not a Facebook chat, no text, its reply already on its way, or a
   * suggestion the server notes as sent from here). again: Send it again, for a reply sent from here
   * that did not reach the buyer (deliveryFailed): that suggestion's text, once the chat is read.
   */
  async function send({ again = false } = {}) {
    const { key, item, sending, overridden } = get();
    if (!key || !item || replyChannel(item) !== 'facebook') return null;
    const resend = again && deliveryFailed(item);
    if (item.draft && item.draft.sentHereAt && !resend) return null;
    const value = resend ? boxText(item.draft) : text();
    const was = sending[key];
    if (!value.trim() || (was && was.state === 'sending')) return null;
    // A blank is never sent to a buyer (the server refuses one too), and a failed check needs Send
    // anyway (a reply sent again was passed when it first went).
    if (blanksIn(value).length) return 'fill';
    const ready = item.draft && item.draft.status === 'ready' ? item.draft : null;
    if (!resend && !overridden && liveChecks(ready, value).some((c) => c.level === 'fail')) return 'blocked';
    // Try again: a failure the box shows (about the chat on screen). After a send whose outcome
    // could not be told, any send reads the chat first, whatever the box shows: that reply may have
    // gone. Send it again reads it first too.
    const wasFailed = was && was.state === 'failed' ? was : null;
    const failed = wasFailed && sendFor(item, wasFailed) ? wasFailed : null;
    const check = resend ? { anchor: item.anchor } : failed || (wasFailed && wasFailed.outcome === 'unknown' ? wasFailed : null);
    const anchor = item.anchor;
    mark(key, { state: 'sending' });
    if (check) {
      const since = check.anchor !== undefined ? check.anchor : anchor;
      // An outcome that could not be told: Wheelman first reads Marketplace again (Check now's
      // sync), so a reply the engine queued is in the chat before anything is posted.
      if (check.outcome === 'unknown') await api('/api/sync', {}).catch(() => { /* the chat is read all the same */ });
      const read = await reread(key);
      // Not read: nothing is posted. Send it again had nothing posted yet, so it is "Not sent".
      if (read.error) { mark(key, resend ? { state: 'failed', error: read.error, outcome: 'refused', anchor, text: value } : { ...check, error: read.error }); return 'failed'; }
      // This text is in the chat already: it went. Nothing more is posted, and it leaves the box.
      if (sentSince(read.item, since, value)) { went(key, read.item); await refresh(); return 'replied'; }
      // Try again on a chat that moved on since the failure (another reply, or the buyer wrote
      // again): nothing is posted, and the chat as it is now is on screen with the text kept.
      if ((failed || resend) && read.item.anchor !== since) {
        mark(key, null);
        show(key, read.item);
        await refresh();
        return repliedSince(read.item, since) ? 'replied' : 'moved';
      }
    }
    let out;
    try {
      out = await api('/api/items/' + key + '/send', { text: value, draftId: item.draft ? item.draft.id : null });
    } catch (e) {
      return failedSend(key, item, anchor, value, e);
    }
    const away = !onScreen(key);
    went(key, out.item);
    // Taken by the engine but not delivered (it says so at once): never "Sent". The box says it; out of sight, a toast does.
    if (deliveryFailed(out.item)) { if (away) toast('The reply to ' + (item.name || 'the buyer') + ' did not reach the buyer.', openIt(item, key)); }
    else toast(sentWords(out.queued, away ? item.name : ''));
    await refresh();
    return 'sent';
  }

  /**
   * A send that threw. The chat is read again. Its text in the chat after the message it answered:
   * it went, whatever the answer said. A reply with other words since, after the server said ours
   * was not taken: nothing is left to send, and the chat as it is now shows. Otherwise the failure
   * is kept against the chat as it is now (a message from the buyer, or a reply from elsewhere
   * whose outcome for ours could not be told), so it is always said: in the box while the chat is
   * on screen, else in a toast that names the buyer and opens the chat. The text stays.
   */
  async function failedSend(key, item, anchor, value, e) {
    const outcome = sendOutcome(e);
    const read = await reread(key);
    const away = !onScreen(key);
    if (read.item && sentSince(read.item, anchor, value)) {
      went(key, read.item);
      toast(sentWords(false, away ? item.name : ''));
      await refresh();
      return 'sent';
    }
    if (read.item && outcome !== 'unknown' && repliedSince(read.item, anchor)) {
      mark(key, null);
      show(key, read.item);
      await refresh();
      return 'replied';
    }
    const open = key === get().key ? get().item : null;
    const at = read.item ? read.item.anchor : open ? open.anchor : anchor;
    mark(key, { state: 'failed', error: e.message, outcome, anchor: at, text: value });
    if (read.item && open && open.anchor !== read.item.anchor) show(key, read.item);
    if (away) toast(sendFailedAwayWords(item.name, e.message, outcome), openIt(item, key));
    return 'failed';
  }

  /**
   * A chat the store is about to take (a refresh). When it shows that the reply of a send whose
   * outcome could not be told went after all, the send ends and its text leaves the box, so it is
   * never ready to be sent again. True when the chat was taken here.
   */
  function settle(taken) {
    const key = taken && taken.key;
    const was = key ? get().sending[key] : null;
    if (!was || was.state !== 'failed' || was.outcome !== 'unknown' || taken.anchor === was.anchor) return false;
    if (!sentSince(taken, was.anchor, was.text)) return false;
    // Text changed since the failure is the person's own, and stays (the send is over all the same).
    const typed = key === get().key ? get().typed : null;
    if (typed !== null && !sameText(typed, was.text)) { mark(key, null); return false; }
    went(key, taken);
    return true;
  }

  return { send, settle };
}
