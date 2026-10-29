// The new page: wires the browser's real pieces into the store, draws the app, and keeps the
// address bar and the store in step. The Playbook (#/playbook/<tab>) has its own store; on its
// address the main store stays where it was, with its conversation open behind it.
import { createApi } from './api.js';
import { createStore } from './store.js';
import { createPanelStore } from './panelstore.js';
import { createSearchStore } from './searchstore.js';
import { createPlaybookStore } from './playbookstore.js';
import { playbookRoute } from './playbookroute.js';
import { parseRoute } from './route.js';
import { storeStep, addressAfter, leavesRun, sheetStep, sheetFirst, sheetOnPop, isSheetEntry, withSheet, offAddress, conversationOnScreen, goToHash } from './hashsync.js';
import { html, render } from './ui/html.js';
import { App } from './ui/app.js';
import { readTheme, applyTheme } from './ui/topbar.js';
import { focusSearch } from './ui/search.js';

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

// The deal panel: a column from 1280 px (open unless it was closed), a drawer from 900 px, a sheet below.
const WIDE = matchMedia('(min-width: 1280px)');
const NARROW = matchMedia('(max-width: 899px)');

const store = createStore({
  api,
  clipboard: { writeText: (t) => navigator.clipboard.writeText(t) },
  storage,
  now: Date.now,
  timers: { set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id) },
  keepalive,
  // From 900 px the open conversation is on screen; on a phone only while the address names it (‹ List
  // hides it). Behind the Playbook it is on no screen.
  shown: (key) => !playbookRoute(location.hash) && conversationOnScreen({ narrow: NARROW.matches, storeKey: key, routeKey: parseRoute(location.hash).key }),
});
const { actions } = store;
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
const search = createSearchStore({ api, timers: { set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id) } });
// The Playbook's store. Once a change there lands, the page reads the status and the conversation
// again, so the Menu's count and the box's "has your answer now" follow it at once.
const playbook = createPlaybookStore({ api, toast: actions.toast, changed: () => actions.refresh() });

// "/" goes to the search box, unless the person is typing somewhere or a dialog is open.
document.addEventListener('keydown', (e) => {
  if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
  const t = e.target;
  if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
  if (document.querySelector('dialog[open]')) return;
  e.preventDefault();
  focusSearch();
});
// Escape closes a drawer or sheet; the column on a wide window stays.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || e.defaultPrevented || WIDE.matches || !panel.get().open) return;
  if (document.querySelector('dialog[open]')) return; // the viewer's own Escape closes only the viewer
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
render(html`<${App} store=${store} panel=${panel} setPanel=${setPanel} search=${search} playbook=${playbook} />`, document.getElementById('app'));

// The store follows the address: another section, chip or conversation, from Back, forward, a
// pasted link, a search result, or a tab, row or chip pressed (web/new/js/hashsync.js). Any address
// but the reply run's own conversation ends the run quietly. The Playbook's address moves nothing in
// the main store: what was typed goes out, and the Playbook reads the tab it names.
window.addEventListener('hashchange', () => {
  const book = playbookRoute(location.hash);
  if (book) { actions.flush(); playbook.actions.load(book.tab, book.id); return; }
  const route = parseRoute(location.hash);
  if (leavesRun(route, store.get())) actions.endRun();
  const step = storeStep(route, store.get());
  if (!step) return;
  if (step.section) actions.setSection(step.section, { chip: step.chip, key: step.key, wide: innerWidth >= 1280 });
  else if (step.chip) actions.setChip(step.chip, { key: step.key });
  else actions.open(step.open, { followup: step.followup });
});

// The address follows the store when the store opened a conversation by itself, in place of the
// entry on screen. Nothing is written until the boot has opened the conversation in the address (or
// decided there is none): a half-booted store has no key, and a reload then would lose it.
let prev = null;
let booted = false;
let sheetGoing = false; // a reply run's step on a phone closes the sheet first; the address follows when its entry has gone
function follow() {
  if (!booted || sheetGoing) return;
  const s = store.get();
  const next = addressAfter(prev, location.hash, s);
  if (sheetFirst({ narrow: NARROW.matches, entry: history.state, run: s.run, next })) { sheetGoing = true; setPanel(false); return; }
  prev = { section: s.section, chip: s.chip, key: s.key, run: s.run };
  if (next === null) return;
  history.replaceState(null, '', next);
  window.dispatchEvent(new HashChangeEvent('hashchange')); // replaceState says nothing to the page's own route
}
store.subscribe(follow);
// A move the store asks for (an enquiry type changed or put back): a new history entry, so Back
// returns to where the conversation was. The hashchange above takes the store there, once.
let goneTo = 0;
store.subscribe(() => { const to = goToHash(goneTo, store.get()); if (!to) return; goneTo = to.n; location.hash = to.hash; });
// An address on a section the server says is switched off goes to the Dashboard, in place of the
// entry on screen; the store follows it there (the hashchange above).
store.subscribe(() => { if (playbookRoute(location.hash)) return; const to = offAddress(parseRoute(location.hash), store.get().sections); if (to) location.replace(to); });
window.addEventListener('popstate', () => { if (sheetGoing) { sheetGoing = false; follow(); } });

// A boot on the Playbook's address shows it, and the store starts on the Dashboard's first list
// behind it: that address is never read as a conversation's (a fact's title is no key).
const bootBook = playbookRoute(location.hash);
if (bootBook) playbook.actions.load(bootBook.tab, bootBook.id);
actions.boot(bootBook ? { section: 'dashboard', chip: 'waiting', key: null } : parseRoute(location.hash), { wide: innerWidth >= 1280 })
  .catch(() => { /* the list shows its own error state */ }).finally(() => { booted = true; follow(); });
setInterval(() => actions.refresh(), 20000);
// The last edit goes out when the page hides (another tab, the phone locked) and when it closes.
window.addEventListener('pagehide', () => actions.flush());
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') actions.flush(); });
