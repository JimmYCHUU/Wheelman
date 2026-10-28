// What the message box shows where a section differs from the Dashboard: model.js boxView, plus
// a write from this page that the AI refused with nothing to show for it. Pure functions (no DOM,
// no globals) beside model.js, which the tests import in Node. PR 5b adds its sections' states here.
import { boxView } from './model.js';

const TRY_AGAIN = { label: 'Try again', act: 'retry', main: true };

/**
 * The box's view: boxView's, given its arguments, unless a write from this page ended with no
 * suggestion written (writeFailed: { key, message } from the store, for this conversation) and no
 * ready suggestion is in the box. Then, where a write could be asked for, the box says why in the
 * server's words with Try again; text the person typed (or saved) stays in the editor with the
 * reason above it. A failed suggestion is told by boxView, as before. Writing, copied, opted out,
 * dismissed and a follow-up done come first, as they do in boxView.
 */
export function sectionBox(args = {}) {
  const view = boxView(args);
  const { item, writeFailed } = args;
  const refused = !!item && !!writeFailed && writeFailed.key === item.key && !(item.draft && item.draft.status === 'ready');
  if (!refused) return view;
  if (view.kind === 'editor') return { ...view, failure: writeFailed.message + ' Your text is kept.' };
  if (view.kind === 'quiet' && view.tell) return { kind: 'quiet', tone: 'bad', sentence: writeFailed.message, button: TRY_AGAIN, tell: true };
  return view;
}

/** The box's view of the open conversation from the store's state: the message box's, and the run bar's. */
export const boxViewOf = (s, now) => sectionBox({
  item: s.item, writing: s.writing === s.key, done: !!s.item && s.done[s.key] === s.item.anchor, doneAt: s.doneAt[s.key],
  typed: s.typed !== null, writeFailed: s.writeFailed || null, now,
});
