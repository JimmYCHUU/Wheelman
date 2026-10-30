// Words typed in the Playbook but not saved yet: answers in the Business facts tab, kept by the
// fact's title, and wording in the Templates and Voice tabs' editors, kept by its file and part. A
// fact's card is drawn afresh when the tab comes back (from Lessons, from Back or the Menu), and its
// box starts from what is kept here, so nothing typed is lost on the way; an editor opened again on
// a part starts from its words kept here. Saved or cancelled, the words are forgotten. Nothing is
// saved anywhere else: a reload starts empty, as before. No DOM.

const kept = new Map();
const wording = new Map();
const wordingKey = (name, part) => String(name) + '\n' + String(part ?? '');

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

/** The wording typed for one part of a wording file and not saved: the words, or null. */
export function unsentWording(name, part) {
  const k = wordingKey(name, part);
  return name && wording.has(k) ? wording.get(k) : null;
}

/** Keeps the wording typed for one part; null forgets it (saved, cancelled, or the words in use again). */
export function keepUnsentWording(name, part, words) {
  if (!name) return;
  if (words === null || words === undefined) wording.delete(wordingKey(name, part));
  else wording.set(wordingKey(name, part), String(words));
}
