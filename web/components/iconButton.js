// A round button that is only an icon. It always carries its words for a screen reader and a tooltip.
import { h } from '../lib/h.js';
import { icon } from '../lib/icons.js';

/** IconButton({ icon: 'refresh', label: 'Check for new messages now', onClick, id }) */
export function IconButton({ icon: name, label, onClick, id = null, pressed = null }) {
  return h('button', { class: 'icon-btn', type: 'button', id, 'aria-label': label, title: label, 'aria-pressed': pressed === null ? null : String(pressed), onclick: onClick }, icon(name));
}
