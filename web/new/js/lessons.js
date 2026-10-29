// Remember and the lessons: which replies can be remembered, in what words, and what a draft says it followed.
// Pure functions, no DOM. (The store calls the server; see store.js.)
import { dayLabel } from '../../lib/format.js';

// The short words Remember names each scope by, for its button and its toast. The keys are the
// server's scopes (SITUATIONS in src/situations.js, and 'general'); the conversation says which is
// its own in situationKey.
const WORDS = {
  complaint: 'complaints',
  after_sale: 'questions after the sale',
  price_negotiation: 'price questions',
  trade_in: 'trade-in questions',
  finance: 'finance questions',
  deposit_hold: 'deposit and holding questions',
  delivery_interstate: 'delivery and interstate questions',
  inspection_booking: 'inspection and test drive requests',
  history_kms: 'questions about kilometres and history',
  rego_roadworthy: 'registration and roadworthy questions',
  warranty: 'warranty questions',
  photos_video: 'photo and video requests',
  import_sourcing: 'import enquiries',
  vehicle_details: 'questions about features',
  location_hours: 'questions about location and hours',
  availability: 'availability questions',
  general: 'general enquiries',
};

const EVERY = 'every reply';

/** The words a scope is remembered for, for the toast: "price questions". */
export const scopeWords = (scope) => (Object.hasOwn(WORDS, scope) ? WORDS[scope] : EVERY);

/**
 * Remember is offered for a Dashboard reply that was written from an instruction and not yet remembered:
 * { scope, label } or null. Not for a follow-up, a conversation in Auction, or one the server says
 * teaches nothing (teaches: false, as for the dashboard's Imports list).
 * The scope is the conversation's situationKey, or every reply when it has none the server knows.
 * remembered: the drafts remembered in this visit.
 */
export function rememberOffer(item, draft, remembered = []) {
  if (!item || !draft || !draft.instruction) return null;
  if (item.teaches === false) return null;
  if (!/^(c|l|em):/.test(String(item.key || ''))) return null;
  if (/^fu:/.test(String(item.anchor || '')) || item.section === 'auction') return null;
  if (remembered.includes(draft.id)) return null;
  const scope = Object.hasOwn(WORDS, item.situationKey) ? item.situationKey : 'any';
  return { scope, label: 'Remember for ' + scopeWords(scope) };
}

const RULES = [
  ['standard', 'Added the first-reply details for a new enquiry'],
  ['price', 'Added the price reply'],
  ['invite', 'Added the invitation to see the car'],
  ['media', 'Added the links you asked for'],
  ['again', 'Left out the greeting and sign-off: not the first reply today'],
  ['playbook', 'Followed the selling guide for this kind of message'],
];

/** The rules that shaped a reply, one plain sentence each; none when there is nothing to say. */
export const ruleWords = (rules) => (rules ? RULES.filter(([k]) => rules[k] === true).map(([, w]) => w) : []);

/** What the lessons a draft followed said, each with the day it was taught. */
export function lessonLines(applied, now = Date.now()) {
  return (applied || []).filter((l) => l && l.do).map((l) => {
    const day = l.at ? dayLabel(l.at, now) : '';
    return { text: l.do, from: day ? 'from ' + (/^(Today|Yesterday)$/.test(day) ? day.toLowerCase() : day) : '' };
  });
}
