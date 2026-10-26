// The page: the top bar, then the work grid (the list, the conversation, the message box) and the toast.
// Tasks 5, 6 and 7 mount their parts in the three marked slots.
import { html, useState, useEffect } from './html.js';
import { SECTIONS } from '../model.js';
import { parseRoute, hashFor } from '../route.js';
import { TopBar } from './topbar.js';
import { Toast } from './toast.js';
import { List } from './list.js';

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

export function App({ store, now = Date.now }) {
  const state = useStore(store);
  const route = useRoute();
  const unread = unreadTotal(state);
  useEffect(() => { document.title = (unread > 0 ? '(' + unread + ') ' : '') + 'Wheelman'; }, [unread]);

  const section = SECTIONS.find((s) => s.id === route.section) || SECTIONS[0];
  // A section that is not ready is only a tab and a hash: the store stays on the Dashboard.
  const onTab = (id) => { location.hash = hashFor({ section: id, chip: state.chip, key: id === 'dashboard' ? state.key : null }); };

  return html`<div class="shell">
    <${TopBar} state=${state} tab=${section.id} onTab=${onTab} now=${now()} />
    ${section.ready
      ? html`<main class="work" data-view=${route.key ? 'chat' : 'list'}>
          <section class="tile list-col" aria-label="Conversations">
            <${List} state=${state} actions=${store.actions} now=${now()} section=${section.id} />
          </section>
          <section class="tile chat" aria-label="Conversation">
            <div class="chat-body"></div>
            <div class="box-area"></div>
          </section>
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
