// The address and the store in step, as pure functions; main.js reads and writes the address.
//
// What the person does (a row, a chip, a tab, ‹ List) writes the address itself, which the browser
// keeps as a new entry, so Back undoes it: storeStep says what the store does to follow. What the
// store does by itself (the boot, the first row on a wide window, the first follow-up) goes in place
// of the entry on screen: addressAfter says what to write there, and never writes over an entry the
// person made.
import { parseRoute, hashFor } from './route.js';
import { followUpOf } from './store.js';
import { sectionOff } from './sections.js';
import { playbookRoute } from './playbookroute.js';

/**
 * How the store boots on this address: { route, wide }. On the Playbook's address it starts on the
 * Dashboard's first list with no conversation, even on a wide window: nothing behind the Playbook is
 * on screen, so nothing is opened or marked seen, and the address is never read as a conversation's
 * (a fact's title is no key). Any other address boots as it says.
 */
export function bootFor(hash, wide) {
  if (playbookRoute(hash)) return { route: { section: 'dashboard', chip: 'waiting', key: null }, wide: false };
  return { route: parseRoute(hash), wide: !!wide };
}

/** In place of an address on a section the server says is switched off: the Dashboard's. null for any other. */
export const offAddress = (route, sections) => (sectionOff(route.section, sections) ? hashFor({ section: 'dashboard', chip: 'waiting' }) : null);

/**
 * What the store does when the address changes: null for nothing, { section, chip, key } for
 * another section (its list, and that conversation there), { chip, key } for another list (and
 * that conversation on it), or { open, followup } for another conversation on this list.
 */
export function storeStep(route, s) {
  if (route.section !== s.section) return { section: route.section, chip: route.chip, key: route.key };
  if (route.chip !== s.chip) return { chip: route.chip, key: route.key };
  if (route.key && route.key !== s.key) return { open: route.key, followup: followUpOf(s, route.key) };
  return null;
}

/**
 * A move the store asks the page to follow (state.goTo, set when an enquiry type changes or is put
 * back): { hash, n } while its n is past seenN, the last one followed; else null. The page writes the
 * hash as a new history entry, so Back returns to where the conversation was, and storeStep takes
 * the store there with the conversation still open.
 */
export function goToHash(seenN, s) {
  const to = s && s.goTo;
  if (!to || !(to.n > seenN)) return null;
  return { hash: hashFor({ section: to.section, chip: to.chip, key: to.key }), n: to.n };
}

/**
 * Whether an address the person reached (Back, ‹ List, a tab, a chip, a row, a link) leaves the
 * reply run: anything but the run's own conversation does, quietly. Any address at all puts away
 * the summary at the end of a run.
 */
export function leavesRun(route, s) {
  if (!s.run) return !!s.runSummary;
  return !(route.section === s.section && route.chip === s.chip && route.key === s.key);
}

/**
 * What choosing a conversation (a row, a search result) does: 'none' when it is open and the address
 * already says so; 'view' when the store has it open but the address does not (a phone showing the
 * list), so only the address is written and the view switches, nothing is reopened (what is typed
 * stays); 'open' for any other conversation.
 */
export function openAction(storeKey, routeKey, key) {
  if (key !== storeKey) return 'open';
  return routeKey === key ? 'none' : 'view';
}

/**
 * Whether the conversation the store has open is on screen. From 900 px it sits beside the list. On
 * a phone it is on screen only when the address names it: showing the list (‹ List), the store keeps
 * it open and hidden, so nothing may be added to its reply unseen.
 */
export function conversationOnScreen({ narrow, storeKey, routeKey }) {
  return !!storeKey && (!narrow || routeKey === storeKey);
}

// The panel on a phone is a sheet over the conversation, and the sheet is a history entry of its
// own (the address stays the conversation's, the entry's state says { sheet: true }). Back closes
// it and nothing else moves: the address before it is the same, so storeStep has nothing to do.
// On wider windows the panel is a column or a drawer, and history is left alone.

export const isSheetEntry = (entryState) => !!(entryState && entryState.sheet);
export const withSheet = (entryState) => ({ ...(entryState || {}), sheet: true });

/**
 * What opening or closing the panel does to history: 'push' a new entry for the sheet, go 'back'
 * off the sheet's entry (it closes as it goes), or 'set' the panel where it is.
 */
export function sheetStep({ narrow, open, entry }) {
  if (!narrow) return 'set';
  if (open) return entry ? 'set' : 'push';
  return entry ? 'back' : 'set';
}

/**
 * Whether the sheet must close before the address is written: a reply run's step on a phone with
 * the sheet's entry on top. Written over, that entry would keep the sheet's place in history, and
 * Back would then go to the customer before. So the sheet closes (its entry goes) and the address
 * follows once it has gone.
 */
export const sheetFirst = ({ narrow, entry, run, next }) => !!narrow && isSheetEntry(entry) && !!run && next !== null;

/** After Back or forward on a phone, whether the sheet is open (its entry's own); null to leave the panel. */
export function sheetOnPop({ narrow, entry }) {
  return narrow ? !!entry : null;
}

/**
 * The address to put in place of the one on screen after the store changed, or null to leave it.
 * prev is the store's { section, chip, key, run } at the last sync, null at the first one (after
 * the boot). Only a conversation the store opened by itself goes in, and only into an address that
 * names none: a chip changed alone leaves the address as it is (on a phone, the list stays), and an
 * address that names another list or conversation is ahead of the store, which is on its way.
 *
 * A reply run's step (a new state.run, once the store has its customer) puts that customer in place
 * of the address on screen, even one the store already had open (on a phone showing the list), so
 * one Back leaves the run. Between steps nothing is written, so an address the person has just
 * reached stays theirs.
 *
 * The Playbook's address (#/playbook/…) is never written over: the conversation stays open in the
 * store behind it, and Back returns to it.
 */
export function addressAfter(prev, hash, s) {
  if (playbookRoute(hash)) return null;
  const step = !!(s.run && s.key && s.key === s.run.key) && (!prev || prev.key !== s.key || prev.run !== s.run);
  if (!step && prev && s.key === prev.key) return null;
  const at = parseRoute(hash);
  if (at.section !== s.section || at.chip !== s.chip || (at.key && !step)) return null;
  const next = hashFor({ section: s.section, chip: s.chip, key: s.key });
  return next === hash ? null : next;
}
