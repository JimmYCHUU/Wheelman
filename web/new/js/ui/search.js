// The one search box in the top bar and its results: customers, cars and messages, six of each until
// "Show all" is pressed. Up and Down move through the results, Enter opens one, Escape clears the box
// and a second Escape leaves it. Under 1100 px the box is a button labelled "Search" that opens it.
import { html, useState, useEffect, useRef } from './html.js';
import { SECTIONS } from '../model.js';
import { listTime, money } from '../../../lib/format.js';
import { MIN_CHARS, enterPick } from '../searchstore.js';

const SHOWN = 6;
const INPUT_ID = 'wheelman-search';
const LIST_ID = 'wheelman-search-results';
const OLD_PAGE = 'Opens on the old page';

export const EMPTY_WORDS = 'No match. Try a stock number or part of a phone number.';
export const ERROR_WORDS = 'Search is not answering. Try again.';

const GROUPS = [
  { id: 'customers', label: 'Customers' },
  { id: 'cars', label: 'Cars' },
  { id: 'messages', label: 'Messages' },
];
const sectionLabel = (id) => (SECTIONS.find((s) => s.id === id) || { label: id }).label;

/** The flat list the keyboard walks: every shown result, and a "Show all N" after a group cut short. */
export function entriesOf(results, open) {
  const out = [];
  for (const g of GROUPS) {
    const all = results[g.id] || [];
    const cut = !open[g.id] && all.length > SHOWN;
    all.slice(0, cut ? SHOWN : all.length).forEach((r) => out.push({ kind: g.id, group: g.id, r }));
    if (cut) out.push({ kind: 'more', group: g.id, count: all.length });
  }
  return out.map((e, i) => ({ ...e, id: LIST_ID + '-' + i }));
}

/** Focuses the box (from the "/" key); under 1100 px it first opens the Search button. */
export function focusSearch() {
  const input = document.getElementById(INPUT_ID);
  if (input && input.offsetParent !== null) { input.focus(); input.select(); return; }
  const button = document.querySelector('.search-btn');
  if (button) button.click();
}

function Option({ e, active, now, onPick, stale }) {
  const r = e.r;
  let body;
  if (e.kind === 'more') {
    body = html`<span class="hit-title">Show all ${e.count} ${e.group === 'customers' ? 'customers' : e.group}</span>`;
  } else if (e.kind === 'customers') {
    const old = r.section !== 'dashboard';
    body = html`<span class="hit-title">${r.name || r.phone || r.email || 'Unknown number'}</span>
      <span class="hit-sub">${[r.car, r.phone].filter(Boolean).join(' · ')}</span>
      ${old ? html`<span class="hit-old">${sectionLabel(r.section)} · ${OLD_PAGE}</span>` : null}`;
  } else if (e.kind === 'cars') {
    const sold = r.availability && r.availability.code === 'sold';
    const meta = ['Stock ' + r.stockNo, r.price && !sold ? money(r.price) : '', r.availability && r.availability.text ? r.availability.text : ''].filter(Boolean).join(' · ');
    body = html`<span class="hit-title">${r.title || 'Stock ' + r.stockNo}</span><span class="hit-sub num">${meta}</span>`;
  } else {
    const old = r.section !== 'dashboard';
    body = html`<span class="hit-title">${r.name || 'Unknown'}<span class="hit-when num">${listTime(r.at, now)}</span></span>
      <span class="hit-sub">${r.who === 'us' ? 'You: ' : ''}${r.text}</span>
      ${old ? html`<span class="hit-old">${sectionLabel(r.section)} · ${OLD_PAGE}</span>` : null}`;
  }
  return html`<div role="option" id=${e.id} class=${'hit' + (e.kind === 'more' ? ' more' : '')} aria-selected=${active ? 'true' : 'false'}
    onMouseDown=${(ev) => ev.preventDefault()} onClick=${() => { if (!stale) onPick(e); }}>${body}</div>`;
}

/**
 * search: the search store; onOpen({ key, section }) for a customer or a message, and onCar(car) open a result
 * (web/new/js/ui/app.js).
 */
export function Search({ search, onOpen, onCar, now }) {
  const s = search.get();
  const [expanded, setExpanded] = useState(false); // under 1100 px: the box is out of its button
  const [focused, setFocused] = useState(false);
  const [open, setOpen] = useState({});
  const [at, setAt] = useState(-1);
  const input = useRef(null);
  const wrap = useRef(null);

  useEffect(() => { setAt(-1); setOpen({}); }, [s.q]);
  useEffect(() => { if (expanded && input.current) input.current.focus(); }, [expanded]);

  const typed = s.q.trim().length >= MIN_CHARS;
  const entries = entriesOf(s.results, open);
  const total = s.results.customers.length + s.results.cars.length + s.results.messages.length;
  const showing = focused && typed && s.state !== 'idle';
  const words = s.state === 'error' ? ERROR_WORDS : s.state === 'ready' && total === 0 ? EMPTY_WORDS : '';

  const pick = (e) => {
    if (!e) return;
    if (e.kind === 'more') { setOpen({ ...open, [e.group]: true }); return; }
    search.actions.clear();
    setExpanded(false);
    if (input.current) input.current.blur();
    if (e.kind === 'cars') onCar(e.r);
    else onOpen(e.r);
  };
  const onKey = (ev) => {
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      if (!entries.length) return;
      ev.preventDefault();
      setAt(ev.key === 'ArrowDown' ? Math.min(entries.length - 1, at + 1) : Math.max(0, at - 1));
    } else if (ev.key === 'Enter') {
      const i = showing ? enterPick(s, at, entries.length) : -1;
      if (i < 0) { if (showing && entries.length) ev.preventDefault(); return; }
      ev.preventDefault();
      pick(entries[i]);
    } else if (ev.key === 'Escape') {
      ev.preventDefault(); // the panel's own Escape (main.js) leaves it alone
      if (s.q) search.actions.clear();
      else { setExpanded(false); ev.target.blur(); }
    }
  };
  const onBlur = (ev) => {
    if (wrap.current && ev.relatedTarget && wrap.current.contains(ev.relatedTarget)) return;
    setFocused(false);
    if (!s.q) setExpanded(false);
  };

  return html`<div class=${'search' + (expanded ? ' open' : '')} ref=${wrap} role="search">
    <button type="button" class="btn quiet search-btn" onClick=${() => setExpanded(true)}>Search</button>
    <div class="search-field">
      <input id=${INPUT_ID} ref=${input} type="search" class="search-input" autocomplete="off" spellcheck="false"
        placeholder="Search customers, cars, messages" aria-label="Search customers, cars and messages"
        role="combobox" aria-expanded=${showing && entries.length > 0 ? 'true' : 'false'} aria-controls=${LIST_ID} aria-autocomplete="list"
        aria-activedescendant=${showing && at >= 0 && entries[at] ? entries[at].id : null}
        value=${s.q} onInput=${(ev) => search.actions.type(ev.target.value)} onKeyDown=${onKey} onFocus=${() => setFocused(true)} onBlur=${onBlur} />
      ${showing ? html`<div class="hits" onMouseDown=${(ev) => ev.preventDefault()}>
        ${s.state === 'loading' && total === 0 ? html`<p class="hits-note" role="status">Searching…</p>` : null}
        ${words ? html`<p class="hits-note" role="status">${words}</p>` : null}
        <div id=${LIST_ID} role="listbox" aria-label="Search results" hidden=${entries.length === 0}>
          ${GROUPS.map((g) => {
            const mine = entries.filter((e) => e.group === g.id);
            if (!mine.length) return null;
            return html`<div role="group" aria-label=${g.label} key=${g.id}>
              <div class="hit-head" role="presentation">${g.label}</div>
              ${mine.map((e) => html`<${Option} key=${e.id} e=${e} active=${!!entries[at] && entries[at].id === e.id} now=${now} onPick=${pick} stale=${s.state === 'loading'} />`)}
            </div>`;
          })}
        </div>
      </div>` : null}
    </div>
  </div>`;
}
