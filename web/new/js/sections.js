// What differs from one section to the next on the new page: which ones have a tab, its chips, its
// empty lists, its Load more, the channel a row is on, an order row's reason, the head line and where
// a search result opens. Pure functions (no DOM, no globals) beside model.js, which the tests import in Node.
import { SECTIONS, CHIPS, rowView } from './model.js';
import { sendFor } from './channel.js';

// ---- the tabs

/**
 * Whether the server says a section is switched off: null for it in the list's `sections`, the old
 * page's signal (web/views/TopBar.js). Not known yet (before the first answer) is on.
 */
export const sectionOff = (id, sections) => id !== 'dashboard' && !!sections && sections[id] === null;

/** The section tabs: every section but one switched off. */
export const shownSections = (sections) => SECTIONS.filter((s) => !sectionOff(s.id, sections));

/**
 * Where the tab track scrolls so the chosen tab is in view, from both rects (getBoundingClientRect)
 * and the track's scrollLeft; null when it is in view already. A tab wider than the track shows its start.
 */
export function tabInView(tab, track, scrollLeft) {
  if (tab.left < track.left || tab.right - tab.left > track.right - track.left) return scrollLeft + tab.left - track.left;
  if (tab.right > track.right) return scrollLeft + tab.right - track.right;
  return null;
}

// ---- the lists

/** What a list answer holds for this section: nothing when the server answered for another (this one is switched off). */
export function listFor(list, section) {
  if (list.section && list.section !== section) return { rows: [], total: 0, counts: {} };
  return { rows: list.items || [], total: list.total || 0, counts: list.counts || {} };
}

// The ids are the server's `tab` values.
export const SECTION_CHIPS = {
  dashboard: CHIPS,
  marketplace: [{ id: 'waiting', label: 'Needs reply' }, { id: 'all', label: 'All' }],
  importquery: [{ id: 'waiting', label: 'Needs reply' }, { id: 'all', label: 'All' }],
  auction: [{ id: 'waiting', label: 'To do' }, { id: 'quiet', label: 'In progress' }, { id: 'other', label: 'Finished' }],
};

export const chipsFor = (section) => SECTION_CHIPS[section] || SECTION_CHIPS.dashboard;

/** The chip, when the section has it; else the section's first. */
export const validChip = (section, chip) => (chipsFor(section).some((c) => c.id === chip) ? chip : chipsFor(section)[0].id);

const EMPTY = {
  dashboard: { waiting: 'No one is waiting.', followups: 'No follow-ups are due.', all: 'There are no conversations yet.' },
  marketplace: { waiting: 'No buyer is waiting.', all: 'There are no Marketplace chats yet.' },
  importquery: { waiting: 'No one is waiting.', all: 'No import enquiries yet. In Gmail, open one and press Send to Wheelman.' },
  auction: { waiting: 'Nothing to do.', quiet: 'No orders are under way.', other: 'No finished orders.' },
};

/** The words of a list with nothing in it. */
export const emptyWords = (section, chip) => (EMPTY[section] || EMPTY.dashboard)[validChip(section, chip)];

/** The button under a list cut short. */
export const moreLabel = (section) => ({ auction: 'Load more orders', importquery: 'Load older enquiries' })[section] || 'Load older conversations';

// The channel a conversation is on, by its key; and each section's own, which goes without saying.
const CHANNEL = [['mp:', 'Facebook'], ['em:', 'Email'], ['ao:', 'WhatsApp']];
const OWN = { dashboard: 'Text', marketplace: 'Facebook', importquery: 'Email', auction: 'WhatsApp' };

/** The row's channel in a word, or '' when it is the section's own. */
export function rowChannelWord(row, section) {
  const key = String((row && row.key) || '');
  const word = (CHANNEL.find(([p]) => key.startsWith(p)) || [null, 'Text'])[1];
  return word === OWN[section] ? '' : word;
}

const isOrder = (row) => String((row && row.key) || '').startsWith('ao:');
/** A Dashboard text (a conversation or a lead), whose copied reply is pasted into the dashboard. */
const pastedInDashboard = (row) => /^[cl]:/.test(String((row && row.key) || ''));

/**
 * What one row shows in its section: the Dashboard's row, its channel, and the tone of its reason
 * ('' for the list's own). An order row not just copied says what is due ("Due: …"), else where
 * the order has got to: blue for a message of theirs to answer, amber for one of ours to send. A
 * Facebook chat the auto-reply handed to a person, still unanswered, says "Needs you" in blue when
 * the row has nothing else to say. A row just copied waits to show on the dashboard only when it is
 * a Dashboard text; a Facebook chat, an email, an order and a text seen only on the phone (answered
 * from the phone) go elsewhere, and say "Copied". A row that is not an order and has nothing else
 * to say shows where its enquiry has got to (row.stage: an import text in Imports, a conversation
 * in Auction that is not an order), in the list's own tone. A Facebook reply that failed
 * (opts.sending, the store's send for this row) says so before anything else, while the chat is as
 * it was when it failed: "Not sent" in red when it was refused, "Not confirmed" in amber when
 * Wheelman could not tell whether it went. Then a reply sent from here that did not reach the buyer
 * (opts.unconfirmed, the store's note for this row) says "Not delivered" in red, while the chat
 * still waits on the message it answered and nothing was copied for it since. An email Gmail had
 * folded (row.collapsed) says "Folded in Gmail" (amber) next.
 */
export function sectionRowView(row, opts, section) {
  const view = rowView(row, opts);
  const failed = sendFor(row, opts && opts.sending);
  if (failed && failed.state === 'failed') {
    const unsure = failed.outcome === 'unknown';
    return { ...view, reason: unsure ? 'Not confirmed' : 'Not sent', channel: rowChannelWord(row, section), tone: unsure ? 'warn' : 'bad' };
  }
  const note = opts && opts.unconfirmed;
  if (note && note.outcome === 'undelivered' && note.anchor === row.anchor && row.state === 'awaiting' && !view.done) {
    return { ...view, reason: 'Not delivered', channel: rowChannelWord(row, section), tone: 'bad' };
  }
  // An email Gmail had folded is only partly read: that comes before every reason but done and a failed send.
  if (row.collapsed && !view.done) return { ...view, reason: 'Folded in Gmail', channel: rowChannelWord(row, section), tone: 'warn' };
  const order = isOrder(row) && !view.done;
  const needsYou = !order && !view.reason && !!row.needsPerson && !!row.unanswered;
  const said = view.done && !pastedInDashboard(row) ? 'Copied' : view.reason;
  const reason = order ? (row.due ? String(row.due).replace(/^Send: /, 'Due: ') : row.stage || '') : needsYou ? 'Needs you' : said || row.stage || '';
  const tone = order && row.due ? (row.dueKind === 'reply' ? 'info' : 'warn') : needsYou ? 'info' : '';
  return { ...view, reason, channel: rowChannelWord(row, section), tone };
}

/** The line under the name at the head of the conversation. */
export function headLine(item) {
  if (item.writing) return 'Writing a suggestion…';
  if (item.order) return ['Order ' + item.order.orderNo, item.order.prefers ? 'prefers ' + item.order.prefers : ''].filter(Boolean).join(' · ');
  if (item.mail) return ['Email', item.mail.subject].filter(Boolean).join(' · ');
  if (item.marketplace) return ['Marketplace', item.marketplace.account].filter(Boolean).join(' · ');
  return item.situation || '';
}

// Auction's lists by state, as the server puts them (sectionRows in src/server.js).
const AUCTION_LIST = { awaiting: 'waiting', answered: 'quiet', ack: 'quiet', closed: 'other', optout: 'other' };

/**
 * Where a search result opens: its own section, on the list it is on. Waiting (not dismissed) is
 * Needs reply; anything else is All, or in Auction its own list by state. A message found has no
 * state: All, or Auction's first list.
 */
export function resultAddress(r) {
  const section = r.section || 'dashboard';
  const state = r.state === 'awaiting' && r.dismissed ? 'answered' : r.state;
  const chip = section === 'auction' ? validChip(section, AUCTION_LIST[state]) : state === 'awaiting' ? 'waiting' : 'all';
  return { section, chip, key: r.key };
}
