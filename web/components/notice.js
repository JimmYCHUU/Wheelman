// A notice for a problem that needs action now. Rounded, with an icon for its tone, a title, a
// body, and an optional action. Reminders are not notices; they belong elsewhere.
import { h } from '../lib/h.js';
import { icon } from '../lib/icons.js';

/** Notice({ tone: 'danger'|'warning'|'info', title, body, action: { label, run } }). body: text, node or list. */
export function Notice({ tone = 'warning', title, body = null, action = null }) {
  const cls = tone === 'danger' ? 'is-bad' : tone === 'info' ? 'is-info' : 'is-warn';
  return h('div', { class: `notice ${cls}`, role: tone === 'danger' ? 'alert' : null },
    icon(tone === 'danger' ? 'alert' : 'info'),
    h('div', {},
      h('strong', { text: title }),
      typeof body === 'string' ? (body ? h('p', { text: body }) : null) : body,
      action ? h('button', { class: 'link-btn', type: 'button', onclick: action.run }, action.label) : null));
}
