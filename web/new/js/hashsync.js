// The address and the store in step, as pure functions; main.js reads and writes the address.
//
// What the person does (a row, a chip, a tab, ‹ List) writes the address itself, which the browser
// keeps as a new entry, so Back undoes it: storeStep says what the store does to follow. What the
// store does by itself (the boot, the first row on a wide window, the first follow-up) goes in place
// of the entry on screen: addressAfter says what to write there, and never writes over an entry the
// person made.
import { parseRoute, hashFor } from './route.js';
import { followUpOf } from './store.js';

/**
 * What the store does when the address changes: null for nothing, { chip, key } for another list
 * (and that conversation on it), or { open, followup } for another conversation on this list.
 */
export function storeStep(route, s) {
  if (route.section !== s.section) return null; // a section still on the old page: only its tab's note
  if (route.chip !== s.chip) return { chip: route.chip, key: route.key };
  if (route.key && route.key !== s.key) return { open: route.key, followup: followUpOf(s, route.key) };
  return null;
}

/**
 * The address to put in place of the one on screen after the store changed, or null to leave it.
 * prev is the store's { section, chip, key } at the last sync, null at the first one (after the
 * boot). Only a conversation the store opened by itself goes in, and only into an address that
 * names none: a chip changed alone leaves the address as it is (on a phone, the list stays), and an
 * address that names another list or conversation is ahead of the store, which is on its way.
 */
export function addressAfter(prev, hash, s) {
  if (prev && s.key === prev.key) return null;
  const at = parseRoute(hash);
  if (at.section !== s.section || at.chip !== s.chip || at.key) return null;
  const next = hashFor({ section: s.section, chip: s.chip, key: s.key });
  return next === hash ? null : next;
}
