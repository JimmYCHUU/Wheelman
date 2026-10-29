// The page: the top bar, then the work grid (the list, the conversation with its message box, and the
// deal panel) and the toast. On a Playbook address the Playbook stands in place of the work grid, and
// the conversation stays open in the store behind it.
import { html, useState, useEffect, useRef } from './html.js';
import { SECTIONS } from '../model.js';
import { chipsFor, resultAddress } from '../sections.js';
import { parseRoute, hashFor } from '../route.js';
import { openAction, conversationOnScreen } from '../hashsync.js';
import { playbookRoute } from '../playbookroute.js';
import { backHref } from '../playbookview.js';
import { TopBar } from './topbar.js';
import { Toast } from './toast.js';
import { List } from './list.js';
import { Conversation } from './conversation.js';
import { MessageBox } from './messagebox.js';
import { Panel, useMode } from './panel.js';
import { PlaybookPage } from './playbook.js';

function useStore(store) {
  const [, redraw] = useState(0);
  useEffect(() => store.subscribe(() => redraw((n) => n + 1)), [store]);
  return store.get();
}

/** The address: { route, book }, book being the Playbook's { tab, id } on its address, else null. */
function useRoute() {
  const read = () => ({ route: parseRoute(location.hash), book: playbookRoute(location.hash) });
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => setRoute(read());
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
 * phone, through history: web/new/js/main.js); playbook: the Playbook's store.
 */
export function App({ store, panel, setPanel, search, playbook, now = Date.now }) {
  const state = useStore(store);
  const pstate = useStore(panel);
  const bstate = useStore(playbook);
  useStore(search);
  const { route: address, book } = useRoute();
  // On the Playbook the address names no conversation: the one the store has open is behind it.
  const route = book ? { section: state.section, chip: state.chip, key: null } : address;
  const mode = useMode();
  const reply = useRef(null);
  const unread = unreadTotal(state);
  useEffect(() => { document.title = (unread > 0 ? '(' + unread + ') ' : '') + 'Wheelman'; }, [unread]);

  const section = SECTIONS.find((s) => s.id === route.section) || SECTIONS[0];
  // Another tab is a new entry in the address, so Back returns to the section before: the store
  // follows it to that section's first list (web/new/js/main.js). The tab already on screen stays.
  // On the Playbook no tab is on screen, and any tab leaves it: the store's own section as it was
  // left, another at its first list.
  const onTab = (id) => {
    if (book) { location.hash = id === state.section ? backHref(state) : hashFor({ section: id, chip: chipsFor(id)[0].id }); return; }
    if (id !== section.id) location.hash = hashFor({ section: id, chip: chipsFor(id)[0].id });
  };
  // The panel: a column on a wide window, else a drawer or sheet over the conversation (then the
  // rest of the page waits behind it), only with a conversation or another car to show.
  const shown = pstate.open && (mode === 'column' || !!state.key || !!pstate.other);
  const overlay = !book && shown && mode !== 'column';
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
    if (book) location.hash = backHref(state); // the panel is beside the conversation, not the Playbook
    setPanel(true);
    panel.actions.showCar(String(car.stockNo));
  };

  return html`<div class="shell">
    <${TopBar} state=${state} tab=${book ? null : section.id} onTab=${onTab} now=${now()} inert=${overlay}
      search=${search} onOpen=${openResult} onCar=${openCar} />
    ${book ? html`<${PlaybookPage} state=${state} pstate=${bstate} playbook=${playbook} now=${now()} />` : html`<main class=${'work' + (shown && !overlay ? ' with-panel' : '')} data-view=${route.key || state.runSummary ? 'chat' : 'list'}>
      <section class="tile list-col" aria-label="Conversations" inert=${overlay}>
        <${List} state=${state} actions=${store.actions} now=${now()} section=${state.section} />
      </section>
      <section class="tile chat" aria-label="Conversation" inert=${overlay}>
        <${Conversation} state=${state} actions=${store.actions} now=${now()} details=${details} />
        <${MessageBox} state=${state} actions=${store.actions} reply=${reply} />
      </section>
      ${shown ? html`<${Panel} state=${state} pstate=${pstate} panel=${panel} actions=${store.actions} mode=${mode}
        setPanel=${setPanel} reply=${reply} now=${now()} onScreen=${onScreen} />` : null}
    </main>`}
    <${Toast} toast=${state.toast} />
  </div>`;
}
