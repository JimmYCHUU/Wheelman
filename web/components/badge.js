// A count that means "new, not looked at yet". It carries words for a screen reader.
import { h } from '../lib/h.js';

/** Badge({ n: 3, srText: ' unread messages' }) */
export function Badge({ n, srText = '' }) {
  return h('span', { class: 'badge' }, String(n), srText ? h('span', { class: 'visually-hidden', text: srText }) : null);
}
