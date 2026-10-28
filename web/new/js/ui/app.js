// The page: the top bar, then the work grid (the list, the conversation with its message box, and the
// deal panel) and the toast.
import { html, useState, useEffect, useRef } from './html.js';
import { SECTIONS } from '../model.js';
import { chipsFor, resultAddress } from '../sections.js';
import { parseRoute, hashFor } from '../route.js';
import { openAction, conversationOnScreen } from '../hashsync.js';
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
  // Another tab is a new entry in the address, so Back returns to the section before: the store
  // follows it to that section's first list (web/new/js/main.js). The tab already on screen stays.
  const onTab = (id) => { if (id !== section.id) location.hash = hashFor({ section: id, chip: chipsFor(id)[0].id }); };
  // The panel: a column on a wide window, else a drawer or sheet over the conversation (then the
  // rest of the page waits behind it), only with a conversation or another car to show.
  const shown = pstate.open && (mode === 'column' || !!state.key || !!pstate.other);
  const overlay = shown && mode !== 'column';
  // On a phone showing the list, the store keeps the last conversation open and hidden: the panel then
  // offers no Add to reply, so nothing is put in a reply that is not on screen.
  const onScreen = conversationOnScreen({ narrow: mode === 'sheet', storeKey: state.key, routeKey: route.key });
  const details = {
    open: shown,
    media: pstate.media,
    toggle: () => setPanel(!shown),
    // The car strip's "24 photos": the conversation's own car, on the Car tab.
    photos: () => { panel.actions.back(); panel.actions.setTab('car'); setPanel(true); },
  };

  // A search result opens in its own section, on the list it is on (web/new/js/sections.js), the
  // address first so Back undoes it. On the list on screen it opens as a row does: the conversation
  // already on screen stays as it is, since opening it again would blank it and lose what is typed.
  // Elsewhere the store follows the address to that list, then opens it.
  const openResult = (r) => {
    const to = resultAddress(r);
    const todo = to.section === state.section && to.chip === state.chip ? openAction(state.key, route.key, r.key) : 'follow';
    if (todo === 'none') return;
    location.hash = hashFor(to);
    if (todo === 'open') store.actions.open(r.key);
  };
  // A car opens in the panel as "Another car": the panel opens the way the Details button opens it
  // (on a phone as a history entry, so Back closes the sheet), then shows the car.
  const openCar = (car) => {
    setPanel(true);
    panel.actions.showCar(String(car.stockNo));
  };

  return html`<div class="shell">
    <${TopBar} state=${state} tab=${section.id} onTab=${onTab} now=${now()} inert=${overlay}
      search=${search} onOpen=${openResult} onCar=${openCar} />
    <main class=${'work' + (shown && !overlay ? ' with-panel' : '')} data-view=${route.key || state.runSummary ? 'chat' : 'list'}>
      <section class="tile list-col" aria-label="Conversations" inert=${overlay}>
        <${List} state=${state} actions=${store.actions} now=${now()} section=${state.section} />
      </section>
      <section class="tile chat" aria-label="Conversation" inert=${overlay}>
        <${Conversation} state=${state} actions=${store.actions} now=${now()} details=${details} />
        <${MessageBox} state=${state} actions=${store.actions} reply=${reply} />
      </section>
      ${shown ? html`<${Panel} state=${state} pstate=${pstate} panel=${panel} actions=${store.actions} mode=${mode}
        setPanel=${setPanel} reply=${reply} now=${now()} onScreen=${onScreen} />` : null}
    </main>
    <${Toast} toast=${state.toast} />
  </div>`;
}
