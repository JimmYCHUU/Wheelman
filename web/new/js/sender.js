// Send on Facebook, the only send anywhere: the text in the box goes to the buyer through the
// Marketplace engine, only when the button is pressed, and never twice. A send is kept by
// conversation (state.sending[key]), so a chat opened again while its reply is on its way still
// reads Sending…, and one that did not go keeps its text and says why. When a send fails the chat is
// read again. Only the first press on a fresh suggestion posts at once: Try again, Send it again and
// any send on a chat with a send not confirmed since (state.unconfirmed[key], which a Copy leaves)
// first have Wheelman read Marketplace, then the chat, so text that is in the chat already is never
// posted again, and a chat that has moved on posts nothing. No DOM: the store passes in what it
// holds, how it takes a chat (take, as a refresh does) and whether a chat is on screen.
import { blanksIn } from '../../lib/blank.js';
import { liveChecks, boxText } from './model.js';
import { hashFor } from './route.js';
import { sentence } from './words.js';
import { deliveryFailed } from './boxsections.js';
import { replyChannel, sendFor, sendOutcome, repliedSince, sentSince, sameText, sentWords, goneWords, sendFailedAwayWords } from './channel.js';

const IDLE = { state: 'idle', at: null };
const NOT_READ = 'The Marketplace chat could not be read first.';

export function createSender({ api, get, set, toast, text, refresh, take, now, shown = () => true }) {
  const without = (map, key) => { const rest = { ...map }; delete rest[key]; return rest; };
  /** This chat's send from now on: a state, or null for none. */
  const mark = (key, value) => set({ sending: value ? { ...get().sending, [key]: value } : without(get().sending, key) });
  /**
   * A send on this chat that did not go, could not be told, or did not reach the buyer, since the
   * last one confirmed: { anchor, outcome }, the message the first of them answered and what the
   * last came to ('refused', 'elsewhere', 'unknown' or 'undelivered'). Its next send reads
   * Marketplace first. A Copy leaves it; a confirmed send or read ends it.
   */
  const doubt = (key, anchor, outcome) => {
    const was = get().unconfirmed[key];
    set({ unconfirmed: { ...get().unconfirmed, [key]: { anchor: was ? was.anchor : anchor, outcome } } });
  };
  const confirmed = (key) => { if (get().unconfirmed[key]) set({ unconfirmed: without(get().unconfirmed, key) }); };
  /** Whether the chat is open and on screen: a phone showing the list keeps it open, out of sight. */
  const onScreen = (key) => get().key === key && shown(key);

  /** The chat as the server has it now: { item }, or { error } when it cannot be read. */
  async function reread(key) {
    try {
      const { item } = await api('/api/items/' + key);
      return item ? { item } : { error: 'That Marketplace chat was not found.' };
    } catch (e) { return { error: e.message }; }
  }

  /**
   * Wheelman reads Marketplace (the engine now, or the read already under way, once it is done), and
   * then the chat: { item }, or { error } when either cannot be read.
   */
  async function readFirst(key) {
    try { await api('/api/sync', { marketplace: true }); } catch (e) { return { error: e.message }; }
    return reread(key);
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
    const unconfirmed = without(get().unconfirmed, key);
    if (key !== get().key) { set({ sending: without(get().sending, key), unconfirmed }); return; }
    const was = get().item;
    const shownNow = item || (was && was.draft ? { ...was, draft: { ...was.draft, sentHereAt: now() } } : null);
    set({ sending: without(get().sending, key), unconfirmed, ...(shownNow ? { item: shownNow, itemState: 'ready' } : {}), typed: null, context: null, save: IDLE });
  }

  /** The chat a reply went to, in a toast's Open: its own address, as a row opens it. */
  const openIt = (item, key) => ({ label: 'Open', href: hashFor({ section: item.section || 'marketplace', chip: 'waiting', key }) });

  /**
   * Sends the open Facebook chat's text, with the suggestion it came from, and says what happened:
   * 'sent'; 'failed'; 'replied' or 'moved' (Marketplace and the chat read first had the text
   * already, a reply since, or a new message from the buyer: nothing is posted, and the chat as it
   * is now is on screen; 'replied' too when the server answers that the reply had gone); 'fill' (a
   * blank is still in the text: nothing is posted, and the box goes to the blank); 'blocked' (a
   * failed check not passed with Send anyway: nothing is posted); or null when there is nothing to
   * send here (not a Facebook chat, no text, its reply already on its way, or a suggestion the
   * server notes as sent from here). again: Send it again, for a reply sent from here that did not
   * reach the buyer (deliveryFailed): that suggestion's text.
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
    // Try again is the failure the box shows (about the chat on screen).
    const failed = was && was.state === 'failed' && sendFor(item, was) ? was : null;
    const unsure = get().unconfirmed[key] || null;
    const anchor = item.anchor;
    mark(key, { state: 'sending' });
    if (failed || resend || unsure) {
      const read = await readFirst(key);
      if (read.error) return notRead(key, item, anchor, value, read.error, (failed || unsure || {}).outcome === 'unknown' ? 'unknown' : 'refused');
      // Read: what the chat shows now is what counts from here.
      confirmed(key);
      // This text is in the chat already, after the message it answered then or now: it went.
      if (sentSince(read.item, unsure ? unsure.anchor : anchor, value) || sentSince(read.item, anchor, value)) { went(key, read.item); await refresh(); return 'replied'; }
      // The chat moved on since the box showed it (another reply, or the buyer wrote again): nothing
      // is posted, and the chat as it is now is on screen with the text kept.
      if (read.item.anchor !== anchor) {
        mark(key, null);
        show(key, read.item);
        await refresh();
        return repliedSince(read.item, anchor) ? 'replied' : 'moved';
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
    // Taken by the engine but not delivered (it says so at once): never "Sent". The box says it, and
    // its row; out of sight, a toast does.
    if (deliveryFailed(out.item)) {
      doubt(key, anchor, 'undelivered');
      if (away) toast('The reply to ' + (item.name || 'the buyer') + ' did not reach the buyer.', openIt(item, key));
    } else toast(sentWords(out.queued, away ? item.name : ''));
    await refresh();
    return 'sent';
  }

  /**
   * Marketplace or the chat could not be read before a send that has to read them first: nothing is
   * posted. It is said as a failure against the chat on screen, with the reason and the text kept:
   * 'unknown' when the send before it could not be told, else "Not sent" (with the reason, a 409's too).
   */
  function notRead(key, item, anchor, value, why, outcome) {
    const error = [NOT_READ, sentence(why)].filter(Boolean).join(' ');
    mark(key, { state: 'failed', error, outcome, anchor, text: value });
    if (!onScreen(key)) toast(sendFailedAwayWords(item.name, error, outcome), openIt(item, key));
    return 'failed';
  }

  /**
   * A send that threw. The chat is read again. Its text in the chat after the message it answered:
   * it went, whatever the answer said. A reply with other words since, after the server said ours
   * was not taken: nothing is left to send, and the chat as it is now shows. Otherwise the failure
   * is kept against the chat as it is now (a message from the buyer, or a reply from elsewhere
   * whose outcome for ours could not be told), so it is always said: in the box while the chat is
   * on screen, else in a toast that names the buyer and opens the chat. The text stays. Either way
   * short of "it went", the chat's next send reads Marketplace first.
   */
  async function failedSend(key, item, anchor, value, e) {
    const outcome = sendOutcome(e);
    const read = await reread(key);
    const away = !onScreen(key);
    // The server found these words in the chat already, or the reply of a send that timed out (this
    // page's, or another's, before a reload): nothing more was sent. Jim's words are never thrown
    // away: the box is cleared only when the server says its text is the words that went (compared
    // on the text as the server tags it). A different reply stays in the box, with the chat shown as
    // sent, and his next press sends it (read first if the chat could not be read now).
    if (outcome === 'gone') {
      toast(goneWords(away ? item.name : ''));
      if (e.same) went(key, read.item);
      else {
        mark(key, null);
        if (read.item) confirmed(key); else doubt(key, anchor, 'unknown');
        if (key === get().key && get().typed === null) set({ typed: value });
        show(key, read.item);
      }
      await refresh();
      return 'replied';
    }
    if (read.item && sentSince(read.item, anchor, value)) {
      went(key, read.item);
      toast(sentWords(false, away ? item.name : ''));
      await refresh();
      return 'sent';
    }
    doubt(key, anchor, outcome);
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
   * A chat the store opens or takes: one whose reply from here did not reach the buyer is noted, as
   * after a reload, so its row says Not delivered and its next send reads Marketplace first.
   */
  function seen(item) {
    const key = item && item.key;
    if (key && deliveryFailed(item) && !get().unconfirmed[key]) doubt(key, item.anchor, 'undelivered');
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

  return { send, settle, seen };
}
