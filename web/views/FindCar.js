// Find a car, in the top bar: type a stock number or words of the name, pick one of the cars from
// the stored stock list, and it opens in the car panel with its photos, videos and documents.
// The combobox pattern: arrow keys move through the results, Enter opens one, Escape closes.
import { h } from '../lib/h.js';
import { icon } from '../lib/icons.js';
import { t } from '../lib/copy.js';
import { money, km } from '../lib/format.js';

const SHORT = { available: 'Available', sold: 'Sold', transit: 'On the way', japan: 'In Japan', arrived: 'Being prepared', unknown: '' };

/** mountFindCar(root, { open(stockNo) }) */
export function mountFindCar(root, { open }) {
  const list = h('ul', { class: 'find-list', id: 'find-list', role: 'listbox', 'aria-label': t('find.label') });
  const note = h('p', { class: 'find-note', role: 'status' });
  const pop = h('div', { class: 'find-pop', hidden: true }, note, list);
  const input = h('input', {
    id: 'find', type: 'search', placeholder: t('find.placeholder'), autocomplete: 'off', spellcheck: 'false',
    role: 'combobox', 'aria-expanded': 'false', 'aria-controls': 'find-list', 'aria-autocomplete': 'list', 'aria-label': t('find.label'),
  });
  // On a narrow window the field waits behind a button and opens over the bar.
  const opener = h('button', { class: 'icon-btn find-opener', type: 'button', 'aria-label': t('find.open'), title: t('find.open'), onclick: () => { root.classList.add('is-open'); input.focus(); } }, icon('search'));
  root.replaceChildren(opener, h('label', { class: 'find-field' }, h('span', { class: 'find-icon' }, icon('search')), input), pop);

  let cars = [];
  let active = -1;
  let timer = null;
  let seq = 0;

  const close = () => {
    pop.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    active = -1;
  };
  const shut = () => { close(); root.classList.remove('is-open'); };

  function paint(q) {
    list.replaceChildren(...cars.map((c, i) => {
      const a = c.availability || {};
      return h('li', { id: `find-${i}`, class: `find-row ${i === active ? 'is-on' : ''}`.trim(), role: 'option', 'aria-selected': i === active ? 'true' : 'false',
        onmousedown: (e) => e.preventDefault(), onclick: () => pick(i) },
      h('span', { class: 'find-title', text: c.title }),
      h('span', { class: 'find-meta' },
        h('span', { text: t('car.stock', { stock: c.stockNo }) }),
        a.code !== 'sold' && c.price ? h('span', { text: money(c.price) }) : null,
        c.odometer ? h('span', { text: km(c.odometer) }) : null,
        SHORT[a.code] ? h('span', { class: `avail ${a.code}`, text: SHORT[a.code] }) : null));
    }));
    note.textContent = !cars.length && q ? t('find.none', { q }) : cars.length ? t('find.results', { n: cars.length }) : '';
    note.classList.toggle('visually-hidden', cars.length > 0);
    if (active >= 0) input.setAttribute('aria-activedescendant', `find-${active}`); else input.removeAttribute('aria-activedescendant');
  }

  async function search() {
    const q = input.value.trim();
    if (!q) { cars = []; close(); return; }
    const mine = ++seq;
    try {
      const res = await fetch(`/api/vehicles?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (mine !== seq) return;
      cars = data.cars || [];
    } catch { cars = []; }
    active = cars.length ? 0 : -1;
    pop.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    paint(q);
  }

  function pick(i) {
    const c = cars[i];
    if (!c) return;
    input.value = '';
    cars = [];
    shut();
    open(c.stockNo);
  }

  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(search, 180); });
  input.addEventListener('focus', () => { if (cars.length) { pop.hidden = false; input.setAttribute('aria-expanded', 'true'); } });
  input.addEventListener('blur', () => setTimeout(() => { if (!root.contains(document.activeElement)) { close(); if (!input.value) root.classList.remove('is-open'); } }, 120));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (!pop.hidden) close(); else { input.value = ''; shut(); input.blur(); } return; }
    if (!cars.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      active = (active + (e.key === 'ArrowDown' ? 1 : cars.length - 1)) % cars.length;
      pop.hidden = false;
      paint(input.value.trim());
      list.children[active]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') { e.preventDefault(); pick(active < 0 ? 0 : active); }
  });
  return { input };
}
