// The messages Wheelman can write a reply from, in every section: the few on the Instead line, and the
// rest of the conversation's list behind "More messages". Pure functions (no DOM, no globals).
import { insteadOptions } from './model.js';

/**
 * { shown, more } for a conversation. shown: the Instead line's choices (insteadOptions). more:
 * every other message in the conversation's list, in the server's order, except the one already in
 * the box and the ones shown.
 */
export function messageOptions(item) {
  const shown = insteadOptions(item);
  const taken = new Set([item.template || '', ...shown.map((o) => o.id)]);
  const more = (item.templates || []).filter((t) => !taken.has(t.id)).map((t) => ({ id: t.id, label: t.label }));
  return { shown, more };
}
