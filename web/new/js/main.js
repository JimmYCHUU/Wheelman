// The new page: wires the browser's real pieces into the store, draws the app, and keeps the
// address bar and the store in step.
import { createApi } from './api.js';
import { createStore } from './store.js';
import { parseRoute } from './route.js';
import { storeStep, addressAfter } from './hashsync.js';
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

// The store follows the address: another chip or another conversation, from Back, forward, a pasted
// link, or a row or chip pressed (web/new/js/hashsync.js).
window.addEventListener('hashchange', () => {
  const step = storeStep(parseRoute(location.hash), store.get());
  if (!step) return;
  if (step.chip) actions.setChip(step.chip, { key: step.key });
  else actions.open(step.open, { followup: step.followup });
});

// The address follows the store when the store opened a conversation by itself, in place of the
// entry on screen. Nothing is written until the boot has opened the conversation in the address (or
// decided there is none): a half-booted store has no key, and a reload then would lose it.
let prev = null;
let booted = false;
function follow() {
  if (!booted) return;
  const s = store.get();
  const next = addressAfter(prev, location.hash, s);
  prev = { section: s.section, chip: s.chip, key: s.key };
  if (next === null) return;
  history.replaceState(null, '', next);
  window.dispatchEvent(new HashChangeEvent('hashchange')); // replaceState says nothing to the page's own route
}
store.subscribe(follow);

actions.boot(parseRoute(location.hash), { wide: innerWidth >= 1280 }).catch(() => { /* the list shows its own error state */ }).finally(() => { booted = true; follow(); });
setInterval(() => actions.refresh(), 20000);
window.addEventListener('pagehide', () => actions.flush());
