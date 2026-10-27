// The page: the top bar, then the work grid (the list, the conversation with its message box, and the
// deal panel) and the toast.
import { html, useState, useEffect, useRef } from './html.js';
import { SECTIONS } from '../model.js';
import { parseRoute, hashFor } from '../route.js';
import { openAction } from '../hashsync.js';
import { TopBar } from './topbar.js';
import { Toast } from './toast.js';
import { List } from './list.js';
import { Conversation } from './conversation.js';
import { MessageBox } from './messagebox.js';
import { Panel, useMode } from './panel.js';

function useStore(store) {
  const [, redraw] = useState(0);
  useEffect(() => store.subscribe(() => redraw((n) => n + 1)), [store]);
  return store.get();
}

function useRoute() {
  const [route, setRoute] = useState(() => parseRoute(location.hash));
  useEffect(() => {
    const on = () => setRoute(parseRoute(location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

function unreadTotal(state) {
  return Object.values(state.unread || {}).reduce((sum, n) => sum + (n || 0), 0);
}

/**
 * store: the main store; panel: the panel store; setPanel(open) opens or closes the panel (on a
 * phone, through history: web/new/js/main.js).
 */
export function App({ store, panel, setPanel, search, now = Date.now }) {
  const state = useStore(store);
  const pstate = useStore(panel);
  useStore(search);
  const route = useRoute();
  const mode = useMode();
  const reply = useRef(null);
  const unread = unreadTotal(state);
  useEffect(() => { document.title = (unread > 0 ? '(' + unread + ') ' : '') + 'Wheelman'; }, [unread]);

  const section = SECTIONS.find((s) => s.id === route.section) || SECTIONS[0];
  // A section that is not ready is only a tab and a hash: the store stays on the Dashboard.
  const onTab = (id) => { location.hash = hashFor({ section: id, chip: state.chip, key: id === 'dashboard' ? state.key : null }); };
  // The panel: a column on a wide window, else a drawer or sheet over the conversation (then the
  // rest of the page waits behind it), only with a conversation or another car to show.
  const shown = section.ready && pstate.open && (mode === 'column' || !!state.key || !!pstate.other);
  const overlay = shown && mode !== 'column';
  const details = {
    open: shown,
    media: pstate.media,
    toggle: () => setPanel(!shown),
    // The car strip's "24 photos": the conversation's own car, on the Car tab.
    photos: () => { panel.actions.back(); panel.actions.setTab('car'); setPanel(true); },
  };

  // A search result. A Dashboard conversation opens as a list row does (the address first, so Back
  // undoes it); another section has no address on the new page, so its result opens the old page.
  const openResult = (r) => {
    if (r.section !== 'dashboard') { location.assign('/'); return; }
    // The conversation already on screen stays as it is: opening it again would blank it and lose what is typed.
    const todo = openAction(state.key, route.key, r.key);
    if (todo === 'none') return;
    location.hash = hashFor({ section: 'dashboard', chip: state.chip, key: r.key });
    if (todo === 'open') store.actions.open(r.key);
  };
  // A car opens in the panel as "Another car": the panel opens the way the Details button opens it
  // (on a phone as a history entry, so Back closes the sheet), then shows the car.
  const openCar = (car) => {
    if (route.section !== 'dashboard') location.hash = hashFor({ section: 'dashboard', chip: state.chip, key: state.key });
    setPanel(true);
    panel.actions.showCar(String(car.stockNo));
  };

  return html`<div class="shell">
    <${TopBar} state=${state} tab=${section.id} onTab=${onTab} now=${now()} inert=${overlay}
      search=${search} onOpen=${openResult} onCar=${openCar} />
    ${section.ready
      ? html`<main class=${'work' + (shown && !overlay ? ' with-panel' : '')} data-view=${route.key ? 'chat' : 'list'}>
          <section class="tile list-col" aria-label="Conversations" inert=${overlay}>
            <${List} state=${state} actions=${store.actions} now=${now()} section=${section.id} />
          </section>
          <section class="tile chat" aria-label="Conversation" inert=${overlay}>
            <${Conversation} state=${state} actions=${store.actions} now=${now()} details=${details} />
            <${MessageBox} state=${state} actions=${store.actions} reply=${reply} />
          </section>
          ${shown ? html`<${Panel} state=${state} pstate=${pstate} panel=${panel} actions=${store.actions} mode=${mode}
            setPanel=${setPanel} reply=${reply} now=${now()} />` : null}
        </main>`
      : html`<main class="work" data-view="list">
          <section class="tile list-col" aria-label=${section.label}>
            <p class="empty">${section.label} is still on the old page.<br /><a href="/">Open it there</a></p>
          </section>
          <section class="tile chat" aria-hidden="true"></section>
        </main>`}
    <${Toast} toast=${state.toast} />
  </div>`;
}
