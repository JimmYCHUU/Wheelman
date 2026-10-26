// The new page: wires the browser's real pieces into the store, draws the app, and keeps the
// address bar and the store in step.
import { createApi } from './api.js';
import { createStore } from './store.js';
import { parseRoute, hashFor } from './route.js';
import { SECTIONS } from './model.js';
import { html, render } from './ui/html.js';
import { App } from './ui/app.js';
import { readTheme, applyTheme } from './ui/topbar.js';

const storage = {
  getItem(k) { try { return localStorage.getItem(k); } catch { return null; } },
  setItem(k, v) { try { localStorage.setItem(k, v); } catch { /* storage may be blocked */ } },
};

const api = createApi({ fetch: (...a) => fetch(...a), go: (url) => location.assign(url) });

// The page may be closing, so the last edit goes out with keepalive.
const keepalive = (path, body) => {
  try {
    fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), keepalive: true }).catch(() => {});
  } catch { /* nothing more can be done while the page closes */ }
};

const store = createStore({
  api,
  clipboard: { writeText: (t) => navigator.clipboard.writeText(t) },
  storage,
  now: Date.now,
  timers: { set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id) },
  keepalive,
});
const { actions } = store;

applyTheme(readTheme(), storage);
render(html`<${App} store=${store} />`, document.getElementById('app'));

// The store follows the address: another chip or another conversation, from Back or a pasted link.
const ready = (route) => SECTIONS.some((s) => s.id === route.section && s.ready);
window.addEventListener('hashchange', () => {
  const route = parseRoute(location.hash);
  if (!ready(route)) return;
  const s = store.get();
  if (route.chip !== s.chip) actions.setChip(route.chip);
  else if (route.key && route.key !== s.key) actions.open(route.key);
});

// The address follows the store: opening a conversation or changing the chip puts it in the hash.
// Nothing is written until the boot has opened the conversation in the address (or decided there is
// none): a half-booted store has no key, and a reload in that moment would lose the conversation.
let last = '';
let booted = false;
function follow() {
  if (!booted) return;
  const s = store.get();
  const now = hashFor({ section: s.section, chip: s.chip, key: s.key });
  if (now === last) return;
  const first = last === '';
  last = now;
  if (!ready(parseRoute(location.hash)) || location.hash === now) return;
  if (first || !parseRoute(location.hash).key) {
    history.replaceState(null, '', now);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    location.hash = now;
  }
}
store.subscribe(follow);

actions.boot(parseRoute(location.hash), { wide: innerWidth >= 1280 }).finally(() => { booted = true; follow(); });
setInterval(() => actions.refresh(), 20000);
window.addEventListener('pagehide', () => actions.flush());
