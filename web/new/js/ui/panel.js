// The deal panel beside the conversation: a 360 px column from 1280 px, a drawer over the
// conversation from 900 px, a bottom sheet over it on a phone, each with a Close button. Whether it
// is open, its tab and the cars' media are in the panel store (web/new/js/panelstore.js); opening
// and closing go through setPanel (web/new/js/main.js), which keeps a phone's sheet in history.
import { html, useState, useEffect, useRef } from './html.js';
import { placeLink } from '../insertlink.js';
import { CarTab } from './cartab.js';

const WIDE = '(min-width: 1280px)';
const DRAWER = '(min-width: 900px)';
const NO_REPLY = 'Open a conversation with a suggestion first, then Add to reply puts the link in it.';
// The tabs, in order. The Customer tab and What Wheelman used join them.
const TABS = [{ id: 'car', label: 'Car' }];

/** 'column', 'drawer' or 'sheet': what the panel is at the window's width, kept up to date. */
export function useMode() {
  const current = () => (matchMedia(WIDE).matches ? 'column' : matchMedia(DRAWER).matches ? 'drawer' : 'sheet');
  const [mode, setMode] = useState(current);
  useEffect(() => {
    const lists = [matchMedia(WIDE), matchMedia(DRAWER)];
    const on = () => setMode(current());
    lists.forEach((l) => l.addEventListener('change', on));
    return () => lists.forEach((l) => l.removeEventListener('change', on));
  }, []);
  return mode;
}

/** The tabs: the arrow keys, Home and End move between them, as in any tab list. */
function Tabs({ tab, onTab }) {
  const keys = (e) => {
    const at = TABS.findIndex((t) => t.id === tab);
    const to = { ArrowRight: at + 1, ArrowLeft: at - 1, Home: 0, End: TABS.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    const next = TABS[(to + TABS.length) % TABS.length];
    onTab(next.id);
    const el = document.getElementById('tab-' + next.id);
    if (el) el.focus();
  };
  return html`<div class="panel-tabs" role="tablist" aria-label="What the panel shows" onKeyDown=${keys}>
    ${TABS.map((t) => html`<button type="button" role="tab" id=${'tab-' + t.id} key=${t.id} aria-selected=${tab === t.id}
      aria-controls="panel-body" tabindex=${tab === t.id ? 0 : -1} onClick=${() => onTab(t.id)}>${t.label}</button>`)}
  </div>`;
}

/**
 * state: the main store's; pstate and panel: the panel store's state and the store; actions: the
 * main store's; reply: the editor's handle for Add to reply; setPanel(open) opens or closes it.
 */
export function Panel({ state, pstate, panel, actions, mode, setPanel, reply, now }) {
  const box = useRef(null);
  const overlay = mode !== 'column';
  const close = () => setPanel(false);

  // A drawer or sheet takes the focus when it opens. When the panel closes, the focus goes back to
  // what opened it, unless something else has taken it (the editor, after Add to reply).
  useEffect(() => {
    const from = document.activeElement;
    if (overlay && box.current) box.current.focus();
    return () => {
      const a = document.activeElement;
      if (a && a !== document.body && !(box.current && box.current.contains(a))) return;
      const to = from && from !== document.body && from.isConnected ? from : document.querySelector('[aria-controls="deal-panel"]');
      if (to) to.focus();
    };
  }, []);

  // Add to reply: the link goes in the box text where the caret was (or before the sign-off), saved
  // like any edit; the caret goes after it. A drawer or sheet steps aside so the link is seen.
  const add = (label, url) => {
    const ed = reply.current;
    if (!ed) { actions.toast(NO_REPLY); return; }
    const out = placeLink(ed.text(), label, url, ed.caret());
    ed.land(out.text, out.caret);
    if (overlay) close();
    actions.type(out.text);
    actions.toast('Added to the reply');
  };

  const item = state.key ? state.item : null;
  const other = pstate.other;
  const car = other ? other.vehicle : item && item.vehicle;
  const stock = other ? other.stockNo : car ? car.stockNo : null;
  const act = {
    load: (s) => panel.actions.media(s),
    refresh: () => panel.actions.media(String(stock), { fresh: true }),
    copy: (url) => actions.copyLink(url),
    add,
    back: () => panel.actions.back(),
    retryOther: () => panel.actions.showCar(other.stockNo),
  };
  const tab = TABS.some((t) => t.id === pstate.tab) ? pstate.tab : 'car';
  let body;
  if (!state.key && !other) body = html`<p class="empty">Open a conversation to see its car here.</p>`;
  else if (state.key && !item && !other) body = html`<p class="empty" role="status">Opening…</p>`;
  else {
    body = html`<${CarTab} car=${car} media=${stock ? pstate.media[String(stock)] : null} other=${other} now=${now}
      backTo=${item ? item.name || item.phone || item.email || '' : ''} looking=${item && item.looking} act=${act} />`;
  }

  return html`${overlay ? html`<div class="scrim" onClick=${close}></div>` : null}
    <aside id="deal-panel" ref=${box} class=${'tile panel ' + mode} tabindex="-1" aria-label="Details"
      role=${overlay ? 'dialog' : null} aria-modal=${overlay ? 'true' : null}>
      <div class="panel-head">
        <${Tabs} tab=${tab} onTab=${panel.actions.setTab} />
        <button type="button" class="btn quiet small" onClick=${close}>Close</button>
      </div>
      <div class="panel-body" id="panel-body" role="tabpanel" aria-labelledby=${'tab-' + tab} key=${tab + '|' + (stock || '')}>${body}</div>
    </aside>`;
}
