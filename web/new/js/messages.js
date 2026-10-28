// The messages Wheelman can write a reply from, in every section: the few on the Instead line, and the
// rest of the conversation's list behind "More messages". Pure functions (no DOM, no globals).
import { insteadOptions } from './model.js';
import { orderOptions } from './orderview.js';

/**
 * { shown, more } for a conversation. shown: the Instead line's choices (insteadOptions). more:
 * every other message in the conversation's list, in the server's order, except the one already in
 * the box and the ones shown. An auction order's list is its own messages (orderOptions): the first
 * three on the Instead line, never the one in the box, and the rest behind More messages.
 */
export function messageOptions(item) {
  if (item.order) {
    const inBox = item.order.replying ? '' : item.order.message || '';
    const rest = orderOptions(item).filter((o) => o.id !== inBox);
    return { shown: rest.slice(0, 3), more: rest.slice(3) };
  }
  const shown = insteadOptions(item);
  const taken = new Set([item.template || '', ...shown.map((o) => o.id)]);
  const more = (item.templates || []).filter((t) => !taken.has(t.id)).map((t) => ({ id: t.id, label: t.label }));
  return { shown, more };
}
