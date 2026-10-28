// Send on Facebook, the only send anywhere: the text in the box goes to the buyer through the
// Marketplace engine, only when the button is pressed, and never twice. A send is kept by
// conversation (state.sending[key]), so a chat opened again while its reply is on its way still
// reads Sending…, and one that did not go keeps its text and says why. When a send fails, and again
// before a send after it posts, the chat is read again: text that is in the chat already is never
// posted again, and a chat that has moved on since a failure posts nothing. No DOM: the store passes
// in what it holds, how it takes a chat (take, as a refresh does) and whether a chat is on screen.
import { blanksIn } from '../../lib/blank.js';
import { liveChecks } from './model.js';
import { hashFor } from './route.js';
import { replyChannel, sendFor, sendOutcome, repliedSince, sentSince, sameText, sentWords, sendFailedAwayWords } from './channel.js';

const IDLE = { state: 'idle', at: null };

export function createSender({ api, get, set, toast, text, refresh, take, shown = () => true }) {
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
   * message from the buyer never brings it back to be sent again), and the chat as it is now is taken.
   */
  function went(key, item) {
    if (key !== get().key) { mark(key, null); return; }
    set({ sending: without(get().sending, key), ...(item ? { item, itemState: 'ready' } : {}), typed: null, context: null, save: IDLE });
  }

  /**
   * Sends the open Facebook chat's text, with the suggestion it came from, and says what happened:
   * 'sent'; 'failed'; 'replied' or 'moved' (the chat read first had the text already, a reply since,
   * or a new message from the buyer: nothing is posted, and the chat as it is now is on screen);
   * 'fill' (a blank is still in the text: nothing is posted, and the box goes to the blank);
   * 'blocked' (a failed check not passed with Send anyway: nothing is posted); or null when there is
   * nothing to send here (not a Facebook chat, no text, its reply already on its way, or a
   * suggestion the server notes as sent from here).
   */
  async function send() {
    const { key, item, sending, overridden } = get();
    if (!key || !item || replyChannel(item) !== 'facebook') return null;
    if (item.draft && item.draft.sentHereAt) return null;
    const value = text();
    const was = sending[key];
    if (!value.trim() || (was && was.state === 'sending')) return null;
    // A blank is never sent to a buyer (the server refuses one too), and a failed check needs Send anyway.
    if (blanksIn(value).length) return 'fill';
    const ready = item.draft && item.draft.status === 'ready' ? item.draft : null;
    if (!overridden && liveChecks(ready, value).some((c) => c.level === 'fail')) return 'blocked';
    // Try again: a failure the box shows (about the chat on screen). After a send whose outcome
    // could not be told, any send reads the chat first, whatever the box shows: that reply may have gone.
    const wasFailed = was && was.state === 'failed' ? was : null;
    const failed = wasFailed && sendFor(item, wasFailed) ? wasFailed : null;
    const check = failed || (wasFailed && wasFailed.outcome === 'unknown' ? wasFailed : null);
    const anchor = item.anchor;
    mark(key, { state: 'sending' });
    if (check) {
      const since = check.anchor !== undefined ? check.anchor : anchor;
      const now = await reread(key);
      if (now.error) { mark(key, { ...check, error: now.error }); return 'failed'; }
      // This text is in the chat already: it went. Nothing more is posted, and it leaves the box.
      if (sentSince(now.item, since, value)) { went(key, now.item); await refresh(); return 'replied'; }
      // Try again on a chat that moved on since the failure (another reply, or the buyer wrote
      // again): nothing is posted, and the chat as it is now is on screen with the text kept.
      if (failed && now.item.anchor !== since) {
        mark(key, null);
        show(key, now.item);
        await refresh();
        return repliedSince(now.item, since) ? 'replied' : 'moved';
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
    toast(sentWords(out.queued, away ? item.name : ''));
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
    const now = await reread(key);
    const away = !onScreen(key);
    if (now.item && sentSince(now.item, anchor, value)) {
      went(key, now.item);
      toast(sentWords(false, away ? item.name : ''));
      await refresh();
      return 'sent';
    }
    if (now.item && outcome !== 'unknown' && repliedSince(now.item, anchor)) {
      mark(key, null);
      show(key, now.item);
      await refresh();
      return 'replied';
    }
    const open = key === get().key ? get().item : null;
    const at = now.item ? now.item.anchor : open ? open.anchor : anchor;
    mark(key, { state: 'failed', error: e.message, outcome, anchor: at, text: value });
    if (now.item && open && open.anchor !== now.item.anchor) show(key, now.item);
    if (away) toast(sendFailedAwayWords(item.name, e.message, outcome), { label: 'Open', href: hashFor({ section: item.section || 'marketplace', chip: 'waiting', key }) });
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
