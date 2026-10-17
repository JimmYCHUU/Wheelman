// Move, in the conversation's head: the button and the menu it opens. The menu lists the sections
// this conversation can be moved to (Dashboard, Import Query and Auction, in every direction, and
// a Facebook chat back to Marketplace), each with one sentence on how the customer is answered
// there. The server says which are allowed (item.moves); an auction order has none, so no button.
import { h } from '../lib/h.js';
import { icon } from '../lib/icons.js';
import { t } from '../lib/copy.js';
import { SECTIONS } from '../sections/registry.js';

/**
 * The choices, in the server's order: { section, label, hint }. Its own section reads "Move back
 * to". A Facebook chat or an email keeps its own way of answering in Auction, so its hint says so.
 */
export function moveChoices(item) {
  const own = (section) => (section === 'auction' && ['marketplace', 'email'].includes(item.channel) ? `move.hint.auction.${item.channel}` : `move.hint.${section}`);
  return (item.moves || []).filter((s) => SECTIONS[s]).map((section) => ({
    section,
    label: t(section === item.home ? 'move.back' : 'move.to', { section: SECTIONS[section].label }),
    hint: t(own(section)),
  }));
}

/**
 * The Move button and its menu, or null when the conversation cannot move. `onMove(section)` is
 * called with the section chosen. The menu is a native popover, placed under the button.
 */
export function MoveMenu(item, { onMove }) {
  const choices = moveChoices(item);
  if (!choices.length) return null;
  const id = 'move-menu';
  const btn = h('button', { class: 'move-btn', type: 'button', popovertarget: id, 'aria-haspopup': 'menu', 'aria-expanded': 'false', title: t('move.title') },
    h('span', { text: t('move.button') }), icon('down'));
  const menu = h('div', { class: 'move-menu', id, popover: 'auto', role: 'menu', 'aria-label': t('move.title') },
    h('p', { class: 'move-head', text: t('move.title') }),
    ...choices.map((c) => h('button', { class: 'move-choice', type: 'button', role: 'menuitem', onclick: () => { menu.hidePopover?.(); onMove(c.section); } },
      h('span', { class: 'move-label', text: c.label }),
      h('span', { class: 'move-hint', text: c.hint }))),
    h('p', { class: 'move-foot', text: t('move.foot') }));
  menu.addEventListener('toggle', (e) => {
    btn.setAttribute('aria-expanded', e.newState === 'open' ? 'true' : 'false');
    if (e.newState !== 'open') return;
    // Under the button, its right edge on the button's, and never past the left edge of the window.
    const r = btn.getBoundingClientRect();
    menu.style.top = `${r.bottom + 6}px`;
    menu.style.right = `${Math.max(8, Math.min(window.innerWidth - r.right, window.innerWidth - menu.offsetWidth - 8))}px`;
    menu.querySelector('.move-choice')?.focus();
  });
  return [btn, menu];
}
