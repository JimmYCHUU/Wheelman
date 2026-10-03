// Removes customer details before any text is sent to an AI service, and puts the
// first name back afterwards. Everything here runs on this computer.

import { config } from './config.js';

export const NAME_TOKEN = '{{NAME}}';

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Carbarn's own public details are not customer data and must survive redaction.
const OWN_PHONE_DIGITS = ['0423840130', '61423840130', '0401110680'];
const OWN_EMAILS = ['info@carbarn.com.au'];
const OWN_ADDRESS = /frances\s+st(reet)?/i;

// Words that look like names but are not, so a customer called "Van" or "May" does not erase real words.
const NOT_NAMES = new Set(['van', 'may', 'will', 'car', 'hi', 'mr', 'mrs', 'ms', 'dr', 'the', 'sir', 'test', 'customer', 'prospect',
  'carsalesconnect', 'unknown', 'user', 'null', 'none', 'na', 'no', 'an', 'as', 'at', 'be', 'to', 'of', 'in', 'on',
  'sms', 'mms', 'call', 'phone', 'mobile', 'enquiry', 'inquiry', 'lead', 'leads', 'carsales', 'autotrader', 'connect',
  'buyer', 'guest', 'anonymous', 'private', 'web', 'website', 'online', 'facebook', 'marketplace', 'gumtree', 'dealer',
  'admin', 'info', 'sales', 'new', 'name', 'first', 'last', 'undefined', 'nil', 'tbc', 'tba', 'xx', 'xxx']);

export function nameParts(lead) {
  const parts = new Set();
  for (const field of [lead?.firstName ?? lead?.first_name, lead?.lastName ?? lead?.last_name, lead?.customerName ?? lead?.customer_name]) {
    for (const p of String(field || '').split(/[\s,]+/)) {
      const w = p.replace(/[^\p{L}'’-]/gu, '');
      if (w.length >= 2 && !NOT_NAMES.has(w.toLowerCase()) && !/@/.test(p) && !/\d/.test(p)) parts.add(w);
    }
  }
  return [...parts].sort((a, b) => b.length - a.length);
}

/** True when a "name" is only a portal placeholder such as "carsalesconnect prospect". */
export function isPlaceholderName(name) {
  const parts = String(name || '').toLowerCase().split(/[\s,]+/).filter(Boolean);
  return !parts.length || parts.every((p) => NOT_NAMES.has(p.replace(/[^a-z]/g, '')) || /@|\d/.test(p));
}

/** Best first name to greet the customer with, or '' when the record has none usable. */
export function firstNameOf(lead) {
  const raw = String(lead?.firstName ?? lead?.first_name ?? lead?.customerName ?? lead?.customer_name ?? '').trim();
  if (!raw || /@|\d/.test(raw)) return '';
  let first = raw.split(/\s+/)[0].replace(/[^\p{L}'’-]/gu, '');
  // Portals sometimes join names together ("KerrynDowner").
  const joined = first.match(/^(\p{Lu}\p{Ll}+)(\p{Lu}\p{Ll}+)$/u);
  if (joined) first = joined[1];
  if (first.length < 2 || NOT_NAMES.has(first.toLowerCase())) return '';
  return first[0].toUpperCase() + first.slice(1).toLowerCase().replace(/(['’-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
}

export function redact(text, lead) {
  let t = String(text ?? '');
  if (!t) return t;

  // Emails
  t = t.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, (m) => (OWN_EMAILS.includes(m.toLowerCase()) ? m : '[EMAIL]'));

  // Bank details
  t = t.replace(/\bBSB\s*[:;#-]?\s*\d{3}[\s-]?\d{3}\b/gi, 'BSB [BANK]');
  t = t.replace(/\b(acc(ount)?\.?\s*(no|number|#)?)\s*[:;#-]?\s*\d{6,10}\b/gi, '$1 [BANK]');

  // VIN / chassis (17 characters) and licence-style long identifiers
  t = t.replace(/\b(?=[A-HJ-NPR-Z0-9]{17}\b)(?=[A-Z0-9]*\d)(?=[A-Z0-9]*[A-Z])[A-HJ-NPR-Z0-9]{17}\b/g, '[VIN]');

  // Phone numbers (Australian mobiles, landlines, +61 forms)
  t = t.replace(/(?<![\d$.,])(\+?61[\s-]?|0)[2-478](?:[\s-]?\d){8}(?!\d)/g, (m) => {
    const digits = m.replace(/\D/g, '');
    const local = digits.startsWith('61') ? '0' + digits.slice(2) : digits;
    return OWN_PHONE_DIGITS.includes(digits) || OWN_PHONE_DIGITS.includes(local) ? m : '[PHONE]';
  });

  // Registration plates, only when the text says it is one
  t = t.replace(/\b(rego|registration|plates?|number plate)((?:\s*(?:no\.?|number|num|#|is|was|are|:|;|-|–|—))*\s*)([A-Z0-9]{5,7}|[A-Z0-9]{2,3}[\s-][A-Z0-9]{2,4})(?![A-Za-z0-9])/gi, (m, word, mid, plate) => {
    const p = plate.replace(/[\s-]/g, '');
    return /\d/.test(p) && /[A-Za-z]/.test(p) && p.length >= 5 && p.length <= 7 ? `${word}${mid}[REGO]` : m;
  });

  // Street addresses, except Carbarn's own
  t = t.replace(/\b(?:unit\s+\w+,?\s*)?\d{1,4}[a-z]?(?:[\s–-]+\d{1,4})?\s+((?:[\p{L}'’]+\s){1,3})(?:street|st|road|rd|avenue|ave|drive|dr|crescent|cres|place|pl|parade|pde|highway(?!\s+star\b)|hwy|lane|ln|court|ct|way|close|cl|boulevard|blvd)\b\.?/giu,
    (m, names) => {
      if (OWN_ADDRESS.test(m)) return m;
      const streetNamed = names.trim().split(/\s+/).every((w) => /^\p{Lu}/u.test(w));
      return streetNamed ? '[ADDRESS]' : m;
    });

  // The customer's own name, wherever it appears
  const parts = nameParts(lead);
  const first = firstNameOf(lead);
  for (const p of parts) {
    const re = new RegExp(`(?<![\\p{L}{])${esc(p)}(?![\\p{L}}])`, 'giu');
    t = t.replace(re, first && p.toLowerCase() === first.toLowerCase() ? NAME_TOKEN : '[NAME]');
  }
  // "KerrynDowner"-style joined names
  const joinedRaw = String(lead?.firstName ?? lead?.first_name ?? '').trim();
  if (joinedRaw && /^\p{Lu}\p{Ll}+\p{Lu}\p{Ll}+$/u.test(joinedRaw)) t = t.replace(new RegExp(esc(joinedRaw), 'gi'), NAME_TOKEN);
  // "Kerry" for "Kerryn": short forms used by the customer in sign-offs are left alone on purpose;
  // a nickname alone does not identify anyone without the other details removed above.
  return t.replace(/(\[NAME\]\s*){2,}/g, '[NAME] ');
}

/** Puts the first name back into a draft and tidies the greeting when no name is known. */
export function restore(text, lead) {
  const first = firstNameOf(lead);
  let t = String(text ?? '');
  if (first) return t.replaceAll(NAME_TOKEN, first);
  t = t.replace(/^(\s*(?:hi|hello|hey|good (?:morning|afternoon|evening)))\s*,?\s*\{\{NAME\}\}\s*([,.!]?)/i, (m, greet, punct) => `${greet}${punct || ','}`);
  t = t.replace(/,?\s*\{\{NAME\}\}/g, '');
  return t;
}

/** Placeholders that must never be left in a finished draft. */
export function leftoverPlaceholders(text) {
  return String(text || '').match(/\{\{NAME\}\}|\[(NAME|EMAIL|PHONE|REGO|VIN|BANK|ADDRESS)\]/g) || [];
}

export const ownDetails = { phones: OWN_PHONE_DIGITS, emails: OWN_EMAILS, sitePhone: config.site.phone };
