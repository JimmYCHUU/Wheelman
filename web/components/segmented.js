// A row of choices of which exactly one is on: the sections above the list, the lists of a section.
// Built with the tablist pattern: arrow keys move between them, the chosen one is aria-selected.
import { h } from '../lib/h.js';
import { Badge } from './badge.js';

/**
 * Segmented({ items: [{ id, label, count, srCount, hidden }], value, onChange, label, kind: 'tabs'|'chips' })
 * Returns the container; call .update({ items, value }) to repaint. Focus survives a repaint.
 */
export function Segmented({ items, value, onChange, label, kind = 'tabs' }) {
  const box = h('div', { class: kind === 'tabs' ? 'sections' : 'filters', role: 'tablist', 'aria-label': label });
  const paint = (list, chosen) => {
    const focused = box.contains(document.activeElement) ? document.activeElement.dataset.id : null;
    box.replaceChildren();
    for (const it of list) {
      if (!it) continue;
      const on = it.id === chosen;
      const sr = it.srCount ? h('span', { class: 'visually-hidden', text: it.srCount }) : null;
      const count = !it.count ? null
        : kind === 'tabs' ? Badge({ n: it.count, srText: it.srCount || '' })
          : h('span', { class: 'n' }, String(it.count), sr);
      box.append(h('button', {
        class: `${kind === 'tabs' ? 'section' : 'filter'} ${on ? 'is-on' : ''}`.trim(), type: 'button', role: 'tab',
        'aria-selected': on ? 'true' : 'false', tabindex: on ? '0' : '-1', 'data-id': it.id, hidden: it.hidden || null,
        onclick: () => onChange(it.id),
      }, h('span', { class: 't', text: it.label }), count));
    }
    if (focused) box.querySelector(`[data-id="${CSS.escape(focused)}"]`)?.focus({ preventScroll: true });
  };
  box.addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    const tabs = [...box.querySelectorAll('[role="tab"]:not([hidden])')];
    const i = tabs.indexOf(document.activeElement);
    if (i === -1) return;
    e.preventDefault();
    const next = e.key === 'Home' ? tabs[0] : e.key === 'End' ? tabs[tabs.length - 1] : tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    next.focus();
    onChange(next.dataset.id);
  });
  paint(items, value);
  box.update = ({ items: list = items, value: chosen = value }) => { items = list; value = chosen; paint(list, chosen); };
  return box;
}
