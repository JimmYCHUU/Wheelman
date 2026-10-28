// What the message box shows where a section differs from the Dashboard: model.js boxView, plus
// a write from this page that the AI refused with nothing to show for it. Pure functions (no DOM,
// no globals) beside model.js, which the tests import in Node. PR 5b adds its sections' states here.
import { boxView } from './model.js';

const TRY_AGAIN = { label: 'Try again', act: 'retry', main: true };

/** The words, ending in a full stop unless they end in one of their own (or a question or exclamation mark). */
const sentence = (words) => (/[.!?]$/.test(String(words).trim()) ? String(words).trim() : String(words).trim() + '.');

/**
 * Whether a refused write (writeFailed: { key, anchor, state, message } from the store) is about the
 * conversation as it is: the same one, its same last message and its same state as when the write
 * was asked. A message from the customer since, or an answer, makes it old news.
 */
const stillAbout = (item, failed) => !!item && !!failed && failed.key === item.key && failed.anchor === item.anchor && failed.state === item.state;

/**
 * The box's view: boxView's, given its arguments, unless a write from this page ended with no
 * suggestion written, the conversation is still as it was when the write was asked, and no ready
 * suggestion is in the box. Then, where a write could be asked for, the box says why in the
 * server's words with Try again (the suggestion that was here stays to see); text the person typed
 * (or saved) stays in the editor with the reason above it. A failed suggestion is told by boxView,
 * as before. Writing, copied, opted out, dismissed and a follow-up done come first, as in boxView.
 */
export function sectionBox(args = {}) {
  const view = boxView(args);
  const { item, writeFailed } = args;
  const refused = stillAbout(item, writeFailed) && !(item.draft && item.draft.status === 'ready');
  if (!refused) return view;
  if (view.kind === 'editor') return { ...view, failure: sentence(writeFailed.message) + ' Your text is kept.' };
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
