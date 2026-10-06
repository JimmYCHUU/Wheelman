// What a list says when it has nothing to show: a title and one plain sentence.
import { h } from '../lib/h.js';

/** EmptyState({ title: 'Nobody is waiting', body: 'New customer messages appear here…' }) */
export function EmptyState({ title, body = '' }) {
  return h('div', { class: 'list-empty' }, h('strong', { text: title }), body);
}
