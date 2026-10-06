// One conversation in the list: who, when, up to one tag, the latest words, and the unread count.
// Every row is the same height, and every label on it is a Tag.
import { h } from '../lib/h.js';
import { Avatar } from './avatar.js';
import { Tag } from './tag.js';
import { Badge } from './badge.js';
import { listTime } from '../lib/format.js';
import { t } from '../lib/copy.js';

/**
 * Row({ key, name, title, time, car, tags: [{ text, tone }], prefix, preview, unread, selected, onOpen })
 * `title` is what is shown when there is no name (a number, or "Unknown number").
 */
export function Row({ key, name, title, time, car = '', tags = [], prefix = '', preview = '', unread = 0, selected = false, onOpen }) {
  return h('button', {
    class: `row ${unread ? 'has-unanswered' : ''}`.trim(), type: 'button', 'data-key': key,
    'aria-current': selected ? 'true' : null, tabindex: selected ? '0' : '-1',
    onclick: () => onOpen(key),
  },
    Avatar({ name }),
    h('span', { class: 'row-main' },
      h('span', { class: 'row-top' },
        h('span', { class: 'row-name', text: name || title }),
        h('span', { class: 'row-time', text: listTime(time) })),
      car ? h('span', { class: 'row-car', text: car }) : null,
      h('span', { class: 'row-bottom' },
        h('span', { class: 'row-preview' },
          tags.slice(0, 2).map((tag) => Tag(tag)),
          prefix ? h('span', { class: 'you', text: prefix }) : null,
          preview),
        unread ? Badge({ n: unread, srText: ' ' + t('row.unread', { n: unread }) }) : null)));
}
