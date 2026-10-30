// Words typed into the message box's own fields but not used yet (the Tell Wheelman line, an
// order's paste box), kept for the conversation open in the store. The box is drawn afresh when it
// comes back (from the Playbook, from Writing…), and its fields start from what is kept here, so
// nothing typed is lost on the way. Another conversation opened, they are forgotten (dropOnOpen),
// so a forgotten instruction never comes back later, holding back Wheelman's writing. Nothing is
// saved anywhere else: a reload starts empty, as before. No DOM.

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

/** Forgets every conversation's words but this one's (none: all of them). */
export function keepOnlyFor(key) {
  for (const at of [...kept.keys()]) if (!key || !at.startsWith(key + '\n')) kept.delete(at);
}

/**
 * Follows the main store (get and subscribe): whenever another conversation is open, or none, the
 * words kept for the one before are forgotten. The Playbook leaves the store's conversation open, so
 * its words wait for it. Returns the unsubscribe.
 */
export function dropOnOpen(store) {
  let open = store.get().key;
  return store.subscribe(() => {
    const key = store.get().key;
    if (key === open) return;
    open = key;
    keepOnlyFor(key);
  });
}
