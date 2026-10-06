// The bar across the top: the brand, Wheelman's state in words with the whole width to say it,
// and the actions that are not about one conversation.
import { h } from '../lib/h.js';
import { mark } from '../lib/icons.js';
import { t } from '../lib/copy.js';
import { ago, clock } from '../lib/format.js';
import { Tag } from '../components/tag.js';
import { IconButton } from '../components/iconButton.js';
import { SECTIONS, SECTION_IDS } from '../sections/registry.js';
import { totalNew } from '../lib/counts.js';

/** What the status line says for the section on screen, and its tooltip. */
export function statusWords(s, section) {
  if (!s) return { dot: '', text: t('status.notResponding'), title: '' };
  const sec = SECTIONS[section] || SECTIONS.dashboard;
  const chat = section === 'marketplace' && s.marketplace?.enabled;
  const last = chat ? s.marketplace.lastSync : s.lastSync;
  const syncing = chat ? s.marketplace.syncing : s.syncing;
  const busy = syncing || s.drafting;
  const ok = !!(last && last.ok);
  const dot = busy ? 'busy' : ok ? 'ok' : last ? 'bad' : '';
  let text;
  if (syncing) text = t('status.checking', { place: sec.place });
  else if (s.drafting) text = t('status.writing');
  else if (ok) text = t('status.checked', { place: sec.placeShort, ago: ago(last.at) });
  else if (last) text = t('status.notReached', { place: sec.placeShort });
  else text = t('status.notChecked', { place: sec.placeShort });
  const parts = [text, t('status.ai', { used: s.ai.usedToday, limit: s.ai.limit })];
  const ph = s.phone;
  if (sec.phone && ph?.on && ph.lastReportAt) parts.push(ph.stale ? t('status.phone.stale', { time: clock(ph.lastReportAt) }) : t('status.phone.heard', { ago: ago(ph.lastReportAt) }));
  const models = (s.ai.providers || []).map((p) => `${p.model}${p.marketplace === false ? ` (${t('status.model.dashboardOnly')})` : ''}${p.usedUpUntil ? ` (${t('status.model.usedUp', { time: clock(p.usedUpUntil) })})` : p.restingMinutes ? ` (${t('status.model.busy')})` : ''}`).join('\n');
  return { dot, text: parts.join(' · '), title: models ? `${t('status.models')}\n${models}` : '' };
}

/**
 * mountTopBar(root, store, { sync }): paints once and after every change to the status, the
 * section, or the counts. Returns nothing; the bar repaints itself.
 */
export function mountTopBar(root, store, actions) {
  const dot = h('span', { class: 'dot' });
  const text = h('span', { class: 'status-text' });
  const status = h('p', { class: 'topbar-status', title: '' }, dot, text);
  const demo = Tag({ text: t('app.demo.short'), tone: 'warning', title: t('app.demo') });
  demo.classList.add('demo-tag');
  demo.hidden = true;
  const sync = IconButton({ icon: 'refresh', label: t('action.checkNow'), id: 'sync', onClick: () => actions.sync(sync) });

  root.replaceChildren(
    h('div', { class: 'topbar-brand' },
      h('span', { class: 'brand-mark' }, mark()),
      h('span', { class: 'brand-words' }, h('h1', { text: t('app.name') }), h('span', { class: 'brand-by', text: t('app.by') })),
      demo),
    status,
    h('div', { class: 'topbar-actions' }, sync));

  const paint = () => {
    const s = store.state.status;
    const w = statusWords(s, store.state.section);
    dot.className = `dot ${w.dot}`.trim();
    text.textContent = w.text;
    status.title = w.title;
    demo.hidden = !s?.demo;
    const on = (id) => id === 'dashboard' || (store.state.sections[id] !== null && store.state.sections[id] !== undefined);
    const total = totalNew(store.state, SECTION_IDS, on);
    document.title = `${total ? `(${total}) ` : ''}${t('app.name')}${s?.demo ? ' demo' : ''}`;
  };
  store.select((s) => ({ status: s.status, section: s.section, tick: s.listTick }), paint);
  // "2 min ago" moves on its own.
  setInterval(paint, 30000);
  return { paint, syncButton: sync };
}
