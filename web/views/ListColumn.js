// The list column: the three inboxes as tabs, any notice that needs action, the search, the three
// lists of the section, the rows, and the footer. It reads the store and asks the actions to do
// things; it never changes the state itself.
import { h } from '../lib/h.js';
import { icon } from '../lib/icons.js';
import { t } from '../lib/copy.js';
import { clock } from '../lib/format.js';
import { Segmented } from '../components/segmented.js';
import { Notice } from '../components/notice.js';
import { Row } from '../components/row.js';
import { EmptyState } from '../components/empty.js';
import { Skeleton } from '../components/skeleton.js';
import { SECTIONS, SECTION_IDS, TAB_STATE, ORDER_LIST } from '../sections/registry.js';
import { newCount } from '../lib/counts.js';

/** The rows a search leaves, from the list on screen (or, in Auction, from every list). */
export function visibleRows(state) {
  const q = state.q.trim().toLowerCase();
  if (!q) return state.list;
  const digits = q.replace(/\D/g, '');
  const rows = state.section === 'auction' && state.everything.length ? state.everything : state.list;
  return rows.filter((r) =>
    [r.name, r.preview?.text, r.car, r.situation, r.account, r.due, r.orderNo].some((f) => String(f || '').toLowerCase().includes(q))
    || (digits.length >= 3 && String(r.phone || '').replace(/\D/g, '').includes(digits)));
}

/** The one or two tags on a row, in the settled words, from what the server says about it. */
export function rowTags(r, state) {
  const tags = [];
  const order = r.section === 'auction';
  const setAside = r.dismissed && r.state === 'awaiting';
  if (order && r.state !== TAB_STATE[state.tab] && ORDER_LIST[r.state]) tags.push({ text: ORDER_LIST[r.state], tone: 'neutral' });
  if (r.phoneOnly) tags.push({ text: t('tag.phoneOnly'), tone: 'neutral' });
  if (setAside) tags.push({ text: t('tag.dismissed'), tone: 'neutral' });
  else if (order && r.due) tags.push({ text: String(r.due).replace(/^Send:\s*/i, 'Due: '), tone: r.dueKind === 'reply' ? 'info' : 'warning' });
  else if (r.flag === 'fail') tags.push({ text: t('tag.check'), tone: 'danger' });
  else if (r.flag === 'input') tags.push({ text: t('tag.blank'), tone: 'warning' });
  else if (r.needsPerson && r.unanswered) tags.push({ text: t('tag.needsYou'), tone: 'info' });
  return tags;
}

/** The notices for the section on screen, most serious first. At most two are shown. */
export function noticesFor(s, section) {
  const out = [];
  if (!s) return out;
  const chat = section === 'marketplace';
  if (s.missing?.length) out.push({ tone: 'danger', title: t('notice.setup.title'), body: h('div', {}, h('p', { text: t('notice.setup.body') }), h('ul', {}, s.missing.map((m) => h('li', { text: m })))) });
  if (s.lastSync && !s.lastSync.ok && !(s.missing || []).some((m) => /dashboard/.test(m))) out.push({ tone: 'danger', title: t('notice.dashboard.title'), body: s.lastSync.message });
  if (chat && s.marketplace?.enabled && s.marketplace.lastSync && !s.marketplace.lastSync.ok) out.push({ tone: 'danger', title: t('notice.marketplace.title'), body: t('notice.marketplace.body', { message: s.marketplace.lastSync.message }) });
  if (s.lastDraftError) out.push({ tone: 'danger', title: t('notice.draft.title'), body: s.lastDraftError.message });
  if (s.paused) out.push({ tone: 'warning', title: t('notice.paused.title'), body: t('notice.paused.body') });
  const ph = s.phone;
  if (section === 'dashboard' && ph?.on && ph.lastReportAt) {
    if (ph.stale) out.push({ tone: 'warning', title: t('notice.phone.stale.title', { time: clock(ph.lastReportAt) }), body: t('notice.phone.stale.body') });
    else if (ph.signedOut) out.push({ tone: 'warning', title: t('notice.phone.signedOut.title'), body: t('notice.phone.signedOut.body') });
    else if (ph.listUnreadable) out.push({ tone: 'warning', title: t('notice.phone.unreadable.title'), body: t('notice.phone.unreadable.body') });
  }
  return out.slice(0, 2);
}

/**
 * mountListColumn(root, store, { open, showSection, setTab, setSearch })
 * Builds the column once and repaints each part when what it shows has changed.
 */
export function mountListColumn(root, store, actions) {
  const state = store.state;
  const on = (id) => id === 'dashboard' || (state.sections[id] !== null && state.sections[id] !== undefined);

  const sections = Segmented({ items: [], value: state.section, onChange: (id) => actions.showSection(id), label: 'Which inbox to show', kind: 'tabs' });
  sections.id = 'sections';
  const notices = h('div', { id: 'notices', class: 'notices' });
  const search = h('input', { id: 'q', type: 'search', placeholder: SECTIONS[state.section].search.placeholder, autocomplete: 'off', spellcheck: 'false', oninput: (e) => actions.setSearch(e.target.value) });
  const filters = Segmented({ items: [], value: state.tab, onChange: (id) => actions.setTab(id), label: 'Which conversations to show', kind: 'chips' });
  const nav = h('nav', { id: 'chats', class: 'chats', 'aria-label': 'Conversation list' });
  // Every conversation is listed, newest first; the footer only speaks in Auction, where it says how many orders were read.
  const ordersLine = h('p', { id: 'orders-line', class: 'learned' });
  const foot = h('footer', { class: 'side-foot', hidden: true }, ordersLine);

  root.replaceChildren(
    sections,
    notices,
    h('label', { class: 'search' }, h('span', { class: 'search-icon' }, icon('search')), h('span', { class: 'visually-hidden', text: t('action.search') }), search),
    filters,
    nav,
    foot);

  // Arrow keys move through the list, as in any messaging app. One row is in the tab order at a time.
  nav.addEventListener('keydown', (e) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    const rows = [...nav.querySelectorAll('.row')];
    const i = rows.indexOf(document.activeElement);
    if (!rows.length) return;
    e.preventDefault();
    const next = e.key === 'Home' ? rows[0] : e.key === 'End' ? rows[rows.length - 1] : rows[e.key === 'ArrowDown' ? Math.min(rows.length - 1, i + 1) : Math.max(0, i - 1)];
    for (const r of rows) r.tabIndex = r === next ? 0 : -1;
    next.focus();
  });

  // The sections above the list: hidden when only the dashboard is on.
  store.select((s) => ({ section: s.section, tick: s.listTick }), () => {
    const items = SECTION_IDS.map((id) => ({ id, label: SECTIONS[id].label, count: on(id) ? newCount(state, id) : 0, srCount: ' ' + t(`row.newIn.${id}`, { n: on(id) ? newCount(state, id) : 0 }), hidden: !on(id) }));
    sections.hidden = !SECTION_IDS.some((id) => id !== 'dashboard' && on(id));
    sections.update({ items, value: state.section });
  });

  // The notices that need action now.
  store.select((s) => ({ status: s.status, section: s.section }), ({ status, section }) => {
    notices.replaceChildren(...noticesFor(status, section).map((n) => Notice(n)));
  });

  // The three lists of the section, and the search placeholder.
  store.select((s) => ({ section: s.section, tab: s.tab, tick: s.listTick }), ({ section, tab }) => {
    const sec = SECTIONS[section];
    const n = newCount(state, section);
    filters.update({ items: sec.tabs.map((tb) => (tb ? { id: tb.id, label: tb.label, count: tb.counted ? n : 0, srCount: ' ' + t(`row.newIn.${section}`, { n }) } : null)), value: tab });
    search.placeholder = sec.search.placeholder;
    if (state.q !== search.value) search.value = state.q;
  });

  // The rows. Focus and the scroll position survive a repaint.
  store.select((s) => ({ list: s.list, q: s.q, selected: s.selected, section: s.section, tab: s.tab, loading: s.listLoading, error: s.listError, tick: s.listTick }), () => {
    const focusedKey = document.activeElement?.closest?.('.row')?.dataset.key || null;
    const sec = SECTIONS[state.section];
    if (state.listError) { nav.replaceChildren(EmptyState({ title: t('list.notResponding.title'), body: t('list.notResponding.body') })); return; }
    if (state.listLoading && !state.list.length) { nav.replaceChildren(Skeleton({ kind: 'rows', n: 6, label: t('list.loading') })); return; }
    const rows = visibleRows(state);
    if (!rows.length) {
      const [title, body] = state.q.trim() ? sec.empty.search : sec.empty[state.tab] || sec.empty.waiting;
      nav.replaceChildren(EmptyState({ title, body }));
      return;
    }
    const order = state.section === 'auction';
    const els = rows.map((r, i) => {
      const setAside = r.dismissed && r.state === 'awaiting';
      const unread = r.key === state.selected || setAside ? 0 : r.unread || 0;
      const preview = order ? (r.dueKind === 'reply' ? r.preview.text : r.stage) : r.preview.media && !r.preview.text ? t('row.photo') : r.preview.text;
      const row = Row({
        key: r.key, name: r.name, title: r.phone || sec.unknown, time: r.lastAt, car: (state.section !== 'dashboard') ? r.car : '',
        tags: rowTags(r, state), prefix: !order && r.preview.who === 'us' ? t('row.you') : '', preview, unread,
        selected: r.key === state.selected, onOpen: actions.open,
      });
      if (!state.selected && i === 0) row.tabIndex = 0;
      return row;
    });
    // One row is always reachable with the Tab key, even when the open conversation is not in the list.
    if (!els.some((el) => el.tabIndex === 0)) els[0].tabIndex = 0;
    nav.replaceChildren(...els);
    if (focusedKey) { const again = nav.querySelector(`.row[data-key="${CSS.escape(focusedKey)}"]`); if (again) { again.tabIndex = 0; again.focus({ preventScroll: true }); } }
  });

  // The footer: in Auction, how many orders were read.
  store.select((s) => ({ section: s.section, waiting: s.counts.waiting, quiet: s.counts.quiet, other: s.counts.other, tick: s.listTick }), ({ section, waiting, quiet, other }) => {
    const orders = waiting + quiet + other;
    foot.hidden = section !== 'auction' || !orders;
    if (!foot.hidden) {
      ordersLine.textContent = t('footer.orders', { orders: `${orders} ${orders === 1 ? 'order' : 'orders'}`, waiting, quiet, other });
      ordersLine.title = t('footer.orders.title');
    }
  });

  return { search, nav };
}
