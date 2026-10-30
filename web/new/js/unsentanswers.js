// Answers typed in the Playbook's Business facts tab but not saved yet, kept by the fact's title. A
// fact's card is drawn afresh when the tab comes back (from Lessons, from Back or the Menu), and its
// box starts from what is kept here, so nothing typed is lost on the way. Saved or cancelled, the
// words are forgotten. Nothing is saved anywhere else: a reload starts empty, as before. No DOM.

const kept = new Map();

/** What is kept for this fact: the words, '' for an open box with none, or null. */
export function unsentAnswer(title) {
  return title && kept.has(title) ? kept.get(title) : null;
}

/** Keeps a fact's typed answer; null forgets it (saved or cancelled). */
export function keepUnsentAnswer(title, words) {
  if (!title) return;
  if (words === null || words === undefined) kept.delete(title);
  else kept.set(title, String(words));
}

/**
 * How a fact's box starts when its card is drawn: { editing, text }, open with the words kept for
 * it, else closed and empty. Words that are now the fact's answer in use were saved (a card drawn
 * again by the save's own read comes before the save's answer is back), so they are forgotten.
 */
export function answerBox(title, answer) {
  const words = unsentAnswer(title);
  if (words !== null && words.trim() === String(answer ?? '').trim()) keepUnsentAnswer(title, null);
  else if (words !== null) return { editing: true, text: words };
  return { editing: false, text: '' };
}
