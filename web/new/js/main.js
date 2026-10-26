// The new page: wires the browser's real pieces into the store, draws the app, and keeps the
// address bar and the store in step.
import { createApi } from './api.js';
import { createStore } from './store.js';
import { createPanelStore } from './panelstore.js';
import { parseRoute } from './route.js';
import { storeStep, addressAfter, sheetStep, sheetOnPop, isSheetEntry, withSheet } from './hashsync.js';
import { html, render } from './ui/html.js';
import { App } from './ui/app.js';
import { readTheme, applyTheme } from './ui/topbar.js';

const storage = {
  getItem(k) { try { return localStorage.getItem(k); } catch { return null; } },
  setItem(k, v) { try { localStorage.setItem(k, v); } catch { /* storage may be blocked */ } },
};

const api = createApi({ fetch: (...a) => fetch(...a), go: (url) => location.assign(url) });

// The page may be hiding or closing, so the last edit goes out with keepalive. It says whether it
// landed, for a page that comes back (a failure is tried again).
const keepalive = async (path, body) => {
  const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), keepalive: true });
  if (!res.ok) throw new Error('HTTP ' + res.status);
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

// The deal panel: a column from 1280 px (open unless it was closed), a drawer from 900 px, a sheet below.
const WIDE = matchMedia('(min-width: 1280px)');
const NARROW = matchMedia('(max-width: 899px)');
const panel = createPanelStore({ api, storage, now: Date.now, wide: () => WIDE.matches });

// On a phone the sheet is a history entry of its own, so Back closes it and the conversation stays
// (web/new/js/hashsync.js). A reload starts with it closed, so its entry is the conversation's again.
if (isSheetEntry(history.state)) history.replaceState({ ...history.state, sheet: false }, '');
function setPanel(open) {
  const step = sheetStep({ narrow: NARROW.matches, open, entry: isSheetEntry(history.state) });
  if (step === 'push') history.pushState(withSheet(history.state), '');
  panel.actions.toggle(open);
  if (step === 'back') history.back();
}
window.addEventListener('popstate', () => {
  const open = sheetOnPop({ narrow: NARROW.matches, entry: isSheetEntry(history.state) });
  if (open !== null && open !== panel.get().open) panel.actions.toggle(open);
});
// Escape closes a drawer or sheet; the column on a wide window stays.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || e.defaultPrevented || WIDE.matches || !panel.get().open) return;
  e.preventDefault();
  setPanel(false);
});
// Crossing a width: the column as it was left, or a drawer or sheet that starts closed.
WIDE.addEventListener('change', () => panel.actions.fit());
NARROW.addEventListener('change', () => panel.actions.fit());

// Another conversation: the panel shows its car, and the car's photos are read for the car strip.
let panelKey = null;
let readFor = null;
store.subscribe(() => {
  const s = store.get();
  if (s.key !== panelKey) { panelKey = s.key; panel.actions.reset(); }
  const stock = s.item && s.item.vehicle && s.item.vehicle.stockNo ? String(s.item.vehicle.stockNo) : null;
  if (stock && s.key + '|' + stock !== readFor) { readFor = s.key + '|' + stock; panel.actions.media(stock); }
});

applyTheme(readTheme(), storage);
render(html`<${App} store=${store} panel=${panel} setPanel=${setPanel} />`, document.getElementById('app'));

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
// The last edit goes out when the page hides (another tab, the phone locked) and when it closes.
window.addEventListener('pagehide', () => actions.flush());
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') actions.flush(); });
