// What the list shows, worked out from the store's state. No DOM and no server: pure functions of the state.

/** Needs reply hides the rows just copied (until the customer writes again and the anchor changes). */
export function visibleRows(s) {
  if (s.chip !== 'waiting') return s.rows;
  return s.rows.filter((r) => s.done[r.key] !== r.anchor);
}

/** The follow-up in hand for a conversation opened on Follow-ups: its row's, once the list is loaded. */
export function followUpOf(s, key) {
  const r = s.chip === 'followups' ? s.rows.find((x) => x.key === key) : null;
  return (r && r.followUp && r.followUp.id) || undefined;
}

export function waitingCount(s) {
  // On other chips the rows include answered ones, which were never in the count.
  const hidden = s.rows.filter((r) => s.done[r.key] === r.anchor && (s.chip === 'waiting' || r.state === 'awaiting')).length;
  return Math.max(0, ((s.counts && s.counts.waiting) || 0) - hidden);
}
