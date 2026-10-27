// Remember and the lessons: which replies can be remembered, in what words, and what a draft says it followed.
// Pure functions, no DOM. (The store calls the server; see store.js.)
import { dayLabel } from '../../lib/format.js';

// A conversation's situation reaches the page as its label only, so the label finds the key the server's
// scopes use (SITUATIONS in src/situations.js), with the short words Remember names it by.
const KINDS = {
  'Complaint or dispute': ['complaint', 'complaints'],
  'After the sale (paperwork, pickup, delivery)': ['after_sale', 'questions after the sale'],
  'Price, discount or offer': ['price_negotiation', 'price questions'],
  'Trade-in': ['trade_in', 'trade-in questions'],
  'Finance': ['finance', 'finance questions'],
  'Deposit or holding the car': ['deposit_hold', 'deposit and holding questions'],
  'Delivery or interstate buyer': ['delivery_interstate', 'delivery and interstate questions'],
  'Inspection or test drive': ['inspection_booking', 'inspection and test drive requests'],
  'Kilometres, history and condition': ['history_kms', 'questions about kilometres and history'],
  'Registration, roadworthy and on-road costs': ['rego_roadworthy', 'registration and roadworthy questions'],
  'Warranty': ['warranty', 'warranty questions'],
  'Photos or video': ['photos_video', 'photo and video requests'],
  'Importing or sourcing a car from Japan': ['import_sourcing', 'import enquiries'],
  'Features and specifications': ['vehicle_details', 'questions about features'],
  'Location and opening hours': ['location_hours', 'questions about location and hours'],
  'Is it still available': ['availability', 'availability questions'],
  'General enquiry': ['general', 'general enquiries'],
};

const EVERY = 'every reply';

/** The words a scope is remembered for, for the toast: "price questions". */
export function scopeWords(scope) {
  const hit = Object.values(KINDS).find(([key]) => key === scope);
  return hit ? hit[1] : EVERY;
}

/**
 * Remember is offered for a Dashboard reply that was written from an instruction and not yet remembered:
 * { scope, label } or null. remembered: the drafts remembered in this visit.
 */
export function rememberOffer(item, draft, remembered = []) {
  if (!item || !draft || !draft.instruction) return null;
  if (!/^(c|l|em):/.test(String(item.key || ''))) return null;
  if (remembered.includes(draft.id)) return null;
  const kind = item.situation ? KINDS[item.situation] : null;
  if (item.situation && !kind) return null;
  const scope = kind ? kind[0] : 'any';
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
