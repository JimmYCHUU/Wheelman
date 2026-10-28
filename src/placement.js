// Which section a conversation is listed in, and where the owner may move it.
//
// A conversation has two things that are easy to mix up. Its channel is where it came from: a
// text on the dashboard, a Facebook Marketplace chat, an email from Gmail. The channel decides how
// a reply goes out (copied and pasted, or sent to Facebook from the page), its shape, and what it
// may teach. Its section is how we treat the customer: it decides which list it is on, and
// whether it is answered as an import or auction customer. Moving changes only the section.
//
// Where a conversation belongs when nobody has moved it:
//   Marketplace   a Facebook chat
//   Auction       an auction order; a lead whose customer has a live auction order, on the
//                 dashboard's Imports list or not (listed under that order, one row per customer)
//   Imports       an email thread from Gmail; a lead on the dashboard's Imports list
//                 (the section is 'importquery': it was called Import Query)
//   Dashboard     everything else
// The owner can move a conversation between Dashboard, Imports and Auction, in every direction
// (item_moves in src/db.js). A Facebook chat can leave Marketplace and come back, but nothing else
// moves into it: it is Facebook's inbox. An order never moves.

import { config } from './config.js';

export const SECTIONS = ['dashboard', 'marketplace', 'auction', 'importquery'];
/** The sections the owner can move a conversation into, in the order of the section tabs. */
export const MOVABLE = ['dashboard', 'auction', 'importquery'];

/**
 * Whether a section is switched on: only Marketplace can be switched off. Imports is always on: with
 * the email intake off it still holds the dashboard's Imports list, and lists no email.
 */
export const sectionOn = (s) => (s === 'marketplace' ? config.marketplace.enabled : SECTIONS.includes(s));

const prefixOf = (key) => String(key || '').split(':')[0];

/** True for a lead on the dashboard's Imports list. The conversation's own record says so too. */
export function onImportsList(item) {
  const p = String(item.lead?.platform || item.conversation?.lead_platform || '').toUpperCase();
  return !!p && p === String(config.dashboard.importsPlatform || '').toUpperCase();
}

/**
 * Where a conversation belongs when nobody has moved it. `liveOrder`: the customer's auction order
 * that is still going (not finished), if any. A live order comes before the Imports list: the
 * customer stays under their order in Auction.
 */
export function naturalSection(item, { liveOrder = null } = {}) {
  const p = prefixOf(item.itemKey);
  if (p === 'ao') return 'auction';
  if (p === 'mp') return 'marketplace';
  if (p === 'em') return 'importquery';
  if (liveOrder) return 'auction';
  if (onImportsList(item)) return 'importquery';
  return 'dashboard';
}

/** The section a conversation is listed in: the owner's move when it can stand, else its own. */
export function sectionFor(item, move, home) {
  if (prefixOf(item.itemKey) === 'ao') return 'auction';
  if (move && MOVABLE.includes(move.section) && sectionOn(move.section)) return move.section;
  return home;
}

/**
 * Where the owner may move a conversation from where it is: every movable section that is switched
 * on, and its own section when it was moved away from it. An auction order never moves.
 */
export function movesFor(item) {
  if (prefixOf(item.itemKey) === 'ao') return [];
  const options = [...MOVABLE];
  if (item.home && !options.includes(item.home)) options.push(item.home);
  return options.filter((s) => s !== item.section && sectionOn(s));
}
