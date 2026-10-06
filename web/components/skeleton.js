// Grey shapes in place of content that is on its way, so the page never jumps from empty to full.
import { h } from '../lib/h.js';

/** Skeleton({ kind: 'rows', n: 6 }) for a list; { kind: 'lines', n: 3 } for a text. */
export function Skeleton({ kind = 'rows', n = 6, label = 'Loading' }) {
  const items = [];
  for (let i = 0; i < n; i++) {
    if (kind === 'rows') items.push(h('div', { class: 'skeleton-row' }, h('i', { class: 'skeleton-avatar' }), h('span', {}, h('i', { class: 'skeleton-line w60' }), h('i', { class: 'skeleton-line w90' }))));
    else items.push(h('i', { class: `skeleton-line ${['w40', 'w90', 'w70'][i % 3]}` }));
  }
  return h('div', { class: `skeleton ${kind}`, role: 'status', 'aria-label': label }, items);
}
