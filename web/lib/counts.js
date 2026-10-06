// The numbers on the page mean "new, not looked at yet". They clear when a conversation is opened.

/**
 * How many waiting conversations in a section have messages nobody has looked at. The conversation
 * on screen is being read, so it is never counted.
 */
export function newCount(state, section) {
  const open = section === state.section && state.list.some((r) => r.key === state.selected && r.unread) ? 1 : 0;
  return Math.max(0, (state.unread[section] || 0) - open);
}

/** Every section's new count added up: the number in the browser tab. */
export function totalNew(state, sectionIds, isOn) {
  return sectionIds.reduce((n, id) => n + (isOn(id) ? newCount(state, id) : 0), 0);
}
