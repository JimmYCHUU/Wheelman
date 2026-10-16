// The bar across the top: the brand, the four sections as tabs, Find a car, Wheelman's state in a
// few words (the whole story one press away, in the status panel), and the actions that are not
// about one conversation.
import { h, put } from '../lib/h.js';
import { mark, icon } from '../lib/icons.js';
import { t, listOf } from '../lib/copy.js';
import { ago, clock } from '../lib/format.js';
import { IconButton } from '../components/iconButton.js';
import { Segmented } from '../components/segmented.js';
import { SECTIONS, SECTION_IDS } from '../sections/registry.js';
import { newCount, totalNew } from '../lib/counts.js';
import { mountFindCar } from './FindCar.js';

/**
 * What the status says for the section on screen: the dot, a few words for the bar, and every
 * line for the status panel. `models` lists the AI models in the order they are tried.
 */
export function statusWords(s, section) {
  if (!s) return { dot: 'bad', short: t('status.short.notResponding'), parts: [t('status.notResponding')], models: [] };
  const sec = SECTIONS[section] || SECTIONS.dashboard;
  const chat = section === 'marketplace' && s.marketplace?.enabled;
  const last = chat ? s.marketplace.lastSync : s.lastSync;
  const syncing = chat ? s.marketplace.syncing : s.syncing;
  const busy = syncing || s.drafting;
  const ok = !!(last && last.ok);
  const dot = busy ? 'busy' : ok ? 'ok' : last ? 'bad' : '';
  let text, short;
  if (syncing) { text = t('status.checking', { place: sec.place }); short = t('status.short.checking'); }
  else if (s.drafting) { text = t('status.writing'); short = t('status.short.writing'); }
  else if (ok) { text = t('status.checked', { place: sec.placeShort, ago: ago(last.at) }); short = t('status.short.ok'); }
  else if (last) { text = t('status.notReached', { place: sec.placeShort }); short = t('status.short.notReached', { place: sec.placeShort }); }
  else { text = t('status.notChecked', { place: sec.placeShort }); short = t('status.short.notChecked'); }
  // While writing, the last check still counts: say both.
  if ((syncing || s.drafting) && ok) text = `${text}. ${t('status.checked', { place: sec.placeShort, ago: ago(last.at) })}`;
  const parts = [text, t('status.ai', { used: s.ai.usedToday, limit: s.ai.limit })];
  // The month's spend against the budget, once any model has a price.
  const b = s.ai.budget;
  if (b?.priced && b.budgetAud > 0) parts.push(t(b.level === 'over' ? 'status.budget.over' : b.level === 'warn' ? 'status.budget.warn' : 'status.budget', { spent: Number(b.spentAud).toFixed(2), budget: Number(b.budgetAud).toFixed(2) }));
  // The dashboard's notification feed, read for a new lead between checks.
  const al = s.alerts;
  if (!chat && al?.on && al.at) parts.push(al.ok ? t('status.alerts.checked', { ago: ago(al.at) }) : t('status.alerts.notReached'));
  const ph = s.phone;
  if (sec.phone && ph?.on && ph.lastReportAt) parts.push(ph.stale ? t('status.phone.stale', { time: clock(ph.lastReportAt) }) : t('status.phone.heard', { ago: ago(ph.lastReportAt) }));
  const models = (s.ai.providers || []).map((p) => `${p.model}${p.marketplace === false ? ` (${t('status.model.dashboardOnly')})` : ''}${p.usedUpUntil ? ` (${t('status.model.usedUp', { time: clock(p.usedUpUntil) })})` : p.restingMinutes ? ` (${t('status.model.busy')})` : ''}`);
  return { dot, short, parts, models };
}

/** What Wheelman reads of the team's replies and has learned, for the status panel. */
function learningLines(s, section) {
  if (!s) return [];
  const out = [];
  const practice = s.practice || null;
  if (practice) {
    out.push(section === 'importquery' ? (practice.email ? t('welcome.reads.email', { n: practice.email }) : t('welcome.reads.none'))
      : practice.dashboard || practice.voice ? t('welcome.reads.dashboard', { team: t('practice.team', { n: practice.dashboard }), voice: practice.voice }) : t('welcome.reads.none'));
  }
  const learned = s.learned || {};
  const bits = [
    learned.changed ? t('learned.changed', { n: learned.changed }) : '',
    learned.approved ? t('learned.approved', { n: learned.approved }) : '',
    learned.notes ? t('learned.notes', { n: learned.notes }) : '',
  ].filter(Boolean);
  if (bits.length) out.push(t('welcome.learned', { bits: listOf(bits) }));
  const backup = s.backup || null;
  if (backup) out.push(backup.last ? t('welcome.backup', { when: ago(backup.last.at), dir: backup.dir }) : backup.on ? t('welcome.backup.none') : t('welcome.backup.off'));
  return out;
}

/**
 * mountTopBar(root, store, { sync, aiModel, showSection, findCar }): builds the bar once and repaints
 * it after every change to the status, the section, or the counts.
 */
export function mountTopBar(root, store, actions) {
  const state = store.state;
  const on = (id) => id === 'dashboard' || (state.sections[id] !== null && state.sections[id] !== undefined);

  const tabs = Segmented({ items: [], value: state.section, onChange: (id) => actions.showSection(id), label: 'Which inbox to show', kind: 'nav' });
  tabs.id = 'sections';

  // The status: a dot and a few words. Pressing it opens the panel with the whole story.
  const dot = h('span', { class: 'dot' });
  const words = h('span', { class: 'status-words' });
  const panel = h('div', { class: 'status-panel', id: 'status-panel', popover: 'auto', role: 'dialog', 'aria-label': t('status.panel.title') });
  const status = h('button', { class: 'status-btn', type: 'button', popovertarget: 'status-panel', 'aria-label': t('status.panel.label'), 'aria-haspopup': 'dialog' }, dot, words, icon('down'));
  panel.addEventListener('toggle', (e) => {
    status.setAttribute('aria-expanded', e.newState === 'open' ? 'true' : 'false');
    if (e.newState === 'open') { paintPanel(); place(); }
  });
  // Under the status button, its right edge on the button's.
  const place = () => {
    const r = status.getBoundingClientRect();
    panel.style.top = `${r.bottom + 6}px`;
    panel.style.right = `${Math.max(8, window.innerWidth - r.right)}px`;
  };

  const sync = IconButton({ icon: 'refresh', label: t('action.checkNow'), id: 'sync', onClick: () => actions.sync(sync) });
  // The cog: which AI writes the suggestions.
  const ai = IconButton({ icon: 'settings', label: t('action.aiModel'), id: 'ai-model', onClick: () => actions.aiModel?.() });
  const find = h('div', { class: 'topbar-find' });

  root.replaceChildren(
    h('div', { class: 'topbar-brand' },
      h('span', { class: 'brand-mark' }, mark()),
      h('span', { class: 'brand-words' }, h('h1', { text: t('app.name') }), h('span', { class: 'brand-by', text: t('app.by') }))),
    h('nav', { class: 'topbar-nav', 'aria-label': 'Sections' }, tabs),
    find,
    h('div', { class: 'topbar-actions' }, status, ai, sync),
    panel);
  mountFindCar(find, { open: (stockNo) => actions.findCar?.(stockNo) });

  function paintPanel() {
    const s = state.status;
    const w = statusWords(s, state.section);
    const shared = s?.share || null;
    const first = s?.ai?.providers?.[0] || null;
    // put() skips what is empty and opens lists; the browser's own replaceChildren would print them.
    panel.replaceChildren();
    put(panel,
      h('h2', { text: t('status.panel.title') }),
      h('ul', { class: 'status-lines' }, w.parts.map((p) => h('li', { text: p }))),
      w.models.length ? [h('h3', { text: t('status.panel.models') }), h('ol', { class: 'status-models' }, w.models.map((m) => h('li', { text: m })))] : null,
      s ? h('p', { class: 'status-ai' }, first ? t('welcome.ai', { model: first.model }) : t('welcome.ai.none'), ' ',
        h('button', { class: 'link-btn', type: 'button', text: t('welcome.ai.change'), onclick: () => { panel.hidePopover(); actions.aiModel?.(); } })) : null,
      learningLines(s, state.section).length ? [h('h3', { text: t('status.panel.learning') }), h('ul', { class: 'status-lines' }, learningLines(s, state.section).map((p) => h('li', { text: p })))] : null,
      shared?.on ? h('p', { class: 'status-share', title: t('welcome.shared.title') },
        shared.url ? [t('welcome.shared'), ' ', h('a', { href: shared.url, target: '_blank', rel: 'noopener', text: shared.url })]
          : shared.error ? t('welcome.shared.down', { why: shared.error }) : t('welcome.shared.opening')) : null);
  }

  const paint = () => {
    const s = state.status;
    const w = statusWords(s, state.section);
    dot.className = `dot ${w.dot}`.trim();
    words.textContent = w.short;
    status.title = w.parts.join('\n');
    if (panel.matches(':popover-open')) paintPanel();
    const total = totalNew(state, SECTION_IDS, on);
    document.title = `${total ? `(${total}) ` : ''}${t('app.name')}`;
  };
  store.select((s) => ({ status: s.status, section: s.section, tick: s.listTick }), paint);

  // The four sections. A section that is switched off has no tab; with only the Dashboard there are none.
  store.select((s) => ({ section: s.section, tick: s.listTick }), () => {
    const items = SECTION_IDS.map((id) => ({ id, label: SECTIONS[id].label, count: on(id) ? newCount(state, id) : 0, srCount: ' ' + t(`row.newIn.${id}`, { n: on(id) ? newCount(state, id) : 0 }), hidden: !on(id) }));
    tabs.hidden = !SECTION_IDS.some((id) => id !== 'dashboard' && on(id));
    tabs.update({ items, value: state.section });
  });

  window.addEventListener('resize', () => { if (panel.matches(':popover-open')) place(); });
  // "2 min ago" moves on its own.
  setInterval(paint, 30000);
  return { paint, syncButton: sync };
}

