// What the message box shows where a section differs from the Dashboard: model.js boxView, plus
// a write from this page that the AI refused with nothing to show for it, and a Facebook reply sent.
// Pure functions (no DOM, no globals) beside model.js, which the tests import in Node. PR 5b adds
// its sections' states here.
import { boxView } from './model.js';
import { sentence } from './words.js';
import { clock, listTime, daysAgo } from '../../lib/format.js';

const TRY_AGAIN = { label: 'Try again', act: 'retry', main: true };
const ANYWAY = { label: 'Write a reply anyway', act: 'write', main: false };

/**
 * Whether a refused write (writeFailed: { key, anchor, state, message } from the store) is about the
 * conversation as it is: the same one, its same last message and its same state as when the write
 * was asked. A message from the customer since, or an answer, makes it old news.
 */
const stillAbout = (item, failed) => !!item && !!failed && failed.key === item.key && failed.anchor === item.anchor && failed.state === item.state;

/**
 * When a Facebook chat was answered from Wheelman, or null: the time Send was pressed
 * (draft.sentHereAt), else the time of the reply that answered the buyer with Wheelman's suggestion
 * (answered.at). Once a chat is answered the server shows no suggestion with it, so after a Send
 * the second is what it says, on every refresh and every later open.
 */
function sentAt(item) {
  if (!item || item.channel !== 'marketplace') return null;
  const d = item.draft;
  // Still waiting in Wheelman's thread, yet its suggestion went from here: the engine took the reply
  // and Wheelman's own record of it has not caught up. Sent all the same, so it is never offered again.
  if (item.state === 'awaiting') return d && d.sentHereAt ? d.sentHereAt : null;
  if (item.state !== 'answered') return null;
  // A suggestion asked for after the answer is the person's to use, as in boxView: not "sent".
  if (d && item.answered && d.createdAt > item.answered.at) return null;
  if (d && d.sentHereAt) return d.sentHereAt;
  return item.answered && item.answered.how === 'wheelman' ? item.answered.at || null : null;
}

/** When it was sent, mid-sentence: "at 3:43 pm" today, else "yesterday", "on Monday" or "on 29 Sep" (as answeredWords says the day). */
function sentWhen(at, now) {
  if (daysAgo(at, now) === 0) return 'at ' + clock(at);
  const day = listTime(at, now);
  return day === 'Yesterday' ? 'yesterday' : 'on ' + day;
}

/**
 * The box's view: boxView's, given its arguments, unless a write from this page ended with no
 * suggestion written, the conversation is still as it was when the write was asked, and no ready
 * suggestion is in the box. Then, where a write could be asked for, the box says why in the
 * server's words with Try again (the suggestion that was here stays to see); text the person typed
 * (or saved) stays in the editor with the reason above it. A failed suggestion is told by boxView,
 * as before. Writing, copied, opted out, dismissed and a follow-up done come first, as in boxView.
 * A Facebook reply sent says so, quiet and good, after Writing and before everything else, with
 * Write a reply anyway and the Tell line as for any chat answered with Wheelman's suggestion (a
 * sent reply cannot be taken back, so there is no Put back).
 */
export function sectionBox(args = {}) {
  const view = boxView(args);
  const { item, writeFailed, now } = args;
  const sent = view.kind === 'writing' ? null : sentAt(item);
  if (sent) {
    const typing = item.marketplace && item.marketplace.sending ? " The engine's phone is typing it into the chat." : '';
    return { kind: 'quiet', tone: 'good', sentence: 'Sent on Facebook ' + sentWhen(sent, now) + '.' + typing, button: ANYWAY, tell: true };
  }
  const refused = stillAbout(item, writeFailed) && !(item.draft && item.draft.status === 'ready');
  if (!refused) return view;
  if (view.kind === 'editor') return { ...view, failure: [sentence(writeFailed.message), 'Your text is kept.'].filter(Boolean).join(' ') };
  if (view.kind === 'quiet' && view.tell) {
    return { kind: 'quiet', tone: 'bad', sentence: writeFailed.message, button: TRY_AGAIN, tell: true, ...(view.suggestion ? { suggestion: view.suggestion } : {}) };
  }
  return view;
}

/** The box's view of the open conversation from the store's state: the message box's, and the run bar's. */
export const boxViewOf = (s, now) => sectionBox({
  item: s.item, writing: s.writing === s.key, done: !!s.item && s.done[s.key] === s.item.anchor, doneAt: s.doneAt[s.key],
  typed: s.typed !== null, writeFailed: s.writeFailed || null, now,
});
