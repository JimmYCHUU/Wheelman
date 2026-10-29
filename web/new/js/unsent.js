// Words typed into the message box's own fields but not used yet (the Tell Wheelman line, an
// order's paste box), kept for each conversation while the page is open. The box is drawn afresh
// when it comes back (from the Playbook, from Writing…, from another conversation), and its fields
// start from what is kept here, so nothing typed is lost on the way. Nothing is saved anywhere else:
// a reload starts empty, as before. No DOM.

const kept = new Map();
const slotOf = (key, slot) => key + '\n' + slot;

/** What is kept for this conversation's field ('tell' or 'paste'): the words, '' for an open box with none, or null. */
export function unsentWords(key, slot) {
  if (!key) return null;
  const at = slotOf(key, slot);
  return kept.has(at) ? kept.get(at) : null;
}

/** Keeps a field's words for its conversation; null forgets them (sent, emptied or closed). */
export function keepUnsent(key, slot, words) {
  if (!key) return;
  if (words === null || words === undefined) kept.delete(slotOf(key, slot));
  else kept.set(slotOf(key, slot), String(words));
}
