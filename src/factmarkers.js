// Facts by markers, for the compact prompt style (PROMPT_STYLE=compact).
//
// In the compact style the AI never sees a figure or a link from our records. Every price,
// distance, date, phone number and link in the trusted sections of the request (VEHICLE FACTS,
// BUSINESS FACTS and the others, see buildPrompt in src/prompt.js) is replaced by a numbered
// marker, {{F1}}, {{F2}} ..., and code puts each one back exactly as it was. A figure the AI typed
// itself that nobody wrote in this conversation, and our staff did not give, fails the draft
// (figure-raw); so does a marker that is not one of ours (marker-unknown). A blank such as
// [PRICE?] is for a person to fill in: it is never masked and never filled by code.
//
// The fitter's markers for one of the owner's templates are {{K1}} ... (src/fitter.js), and the
// customer's name is {{NAME}} (src/redact.js): an F marker is neither.

import { LITERAL } from './fitter.js';
import { numbersIn } from './checks.js';
import { untagged } from './text.js';
import { BLANK_PATTERN } from '../web/lib/blank.js';

// Amounts in the k and m shorthand, as customers and staff type them: "$24k", "1.31m", "2.38 mil"
// (SHORTHAND in src/fitter.js). Tried first, so "$24k" is one figure, not "$24" and a "k".
const SHORT = String.raw`(?:(?:AUD\s?)?[$¥]\s?)?\b\d+(?:\.\d+)?\s?(?:[kK]|[mM](?:il(?:lion)?)?)\b`;
// A link written without http:// in front: a domain and a path ("carbarn.com.au/used-cars").
const BARE_LINK = String.raw`\b[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\/(?:[^\s<>"')\]]*[^\s<>"')\].,;:!?])?`;
// What counts as a fact here: the fitter's literals (links, phone numbers, money, numbers of four
// digits or with thousands separators, times of day, spans of days to years, kilometres), the
// shorthand amounts and bare links. One pattern masks our records and checks the AI's reply, so
// nothing the AI saw unmasked in our records can fail it for being copied. In any case: "6 Months"
// in a car's Included list and "6 months" in a reply are the same fact.
const FACT = new RegExp([SHORT, LITERAL.source, BARE_LINK].join('|'), 'gi');
// A blank is for a person, in whatever case it was written: never masked, never a typed figure.
const BLANK = new RegExp(`^${BLANK_PATTERN}$`, 'i');
// A model year, a four-digit number from 1980 to 2035 on its own, stays as it is: the car's name
// reads "2019 Toyota Harrier", and a reply may say "the 2017 model". A postcode such as 2141 is
// still a fact.
const YEAR = /^(?:19[89]\d|20[0-2]\d|203[0-5])$/;
/** What is left as plain text: a blank, or a model year. */
const plain = (lit) => BLANK.test(lit) || YEAR.test(lit);
// A marker, written exactly ({{F12}}) or damaged ({F12}, {{ F12 }}, {{f12}}}).
const MARKER_LIKE = /([$¥]\s?)?\{+\s*[Ff]\s*\d+\s*\}+/g;
const EXACT = /^\{\{(F\d+)\}\}$/;
// What a marker the AI made up becomes: a blank for a person, never the marker itself.
const MADE_UP = '[CHECK?]';

/** A fact's value and what follows it: "9 am." at the end of a sentence keeps its full stop out. */
const split = (lit) => (/\d\s?[AaPp][Mm]\.$/.test(lit) ? [lit.slice(0, -1), '.'] : [lit, '']);

/** Every fact in a text, in order, without the blanks and the model years. */
function factsIn(text) {
  const out = [];
  for (const m of String(text ?? '').matchAll(FACT)) if (!plain(m[0])) out.push(split(m[0])[0]);
  return out;
}

/**
 * Our records' facts as markers. `sections` maps a section's name to its text. Names are F1, F2
 * ... in order of first appearance across the sections, and the same value always gets the same
 * name. Blanks and model years stay as they are. Returns { masked, markers }: the same sections
 * with markers, and [{ name, value }].
 */
export function maskTrusted(sections) {
  const markers = [];
  const byValue = new Map();
  const nameFor = (value) => {
    if (!byValue.has(value)) { byValue.set(value, `F${markers.length + 1}`); markers.push({ name: byValue.get(value), value }); }
    return byValue.get(value);
  };
  const masked = {};
  for (const [name, text] of Object.entries(sections || {})) {
    masked[name] = String(text ?? '').replace(FACT, (lit) => {
      if (plain(lit)) return lit;
      const [value, tail] = split(lit);
      return `{{${nameFor(value)}}}${tail}`;
    });
  }
  return { masked, markers };
}

/**
 * Puts every fact back where its marker is. A currency sign written in front of a marker whose
 * value has one already is not written twice. A marker that is not one of ours, or is damaged,
 * becomes [CHECK?], a blank for a person: no marker is ever left in the text.
 */
export function restoreFacts(text, markers) {
  const byName = new Map((markers || []).map((m) => [m.name, m.value]));
  return String(text ?? '').replace(MARKER_LIKE, (whole, sign = '') => {
    const marker = whole.slice(sign.length);
    const exact = marker.match(EXACT);
    if (!exact || !byName.has(exact[1])) return MADE_UP;
    const value = byName.get(exact[1]);
    return sign && value.replace(/^AUD\s?/, '').startsWith(sign.trim()) ? value : `${sign}${value}`;
  });
}

/** restoreFacts on every text in the AI's answer: the reply, its next step, its facts and its notes for a person. */
export function restoreAnswer(json, markers) {
  const walk = (v) => (typeof v === 'string' ? restoreFacts(v, markers)
    : Array.isArray(v) ? v.map(walk)
      : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]))
        : v);
  return walk(json || {});
}

/** Whether a text has a fact marker in it, written exactly or damaged. */
export const hasFactMarker = (text) => new RegExp(MARKER_LIKE.source).test(String(text ?? ''));

/** The markers in the AI's text that are not ours: one with a number we never gave, or one written damaged. */
export function unknownMarkers(aiText, markers) {
  const ours = new Set((markers || []).map((m) => m.name));
  const out = [];
  for (const m of String(aiText ?? '').matchAll(MARKER_LIKE)) {
    const marker = m[0].slice((m[1] || '').length);
    const exact = marker.match(EXACT);
    if (!exact || !ours.has(exact[1])) out.push(marker);
  }
  return [...new Set(out)];
}

const linkKey = (link) => untagged(link).toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');
const isLink = (lit) => /^https?:\/\//i.test(lit) || /^[^\s/]+\.[A-Za-z]{2,}\//.test(lit);
const PHONE = /^(?:\+?61\s?|0)4\d{2}\s?\d{3}\s?\d{3}$|^\(?0[2378]\)?\s?\d{4}\s?\d{4}$/;
const phoneDigits = (lit) => { const d = lit.replace(/\D/g, ''); return d.startsWith('61') ? `0${d.slice(2)}` : d; };

/**
 * The facts in the AI's text, before the markers are put back, that it typed itself: outside the
 * markers, and not found in `allowedText` (what the customer and our team wrote in this
 * conversation, and our staff's instruction). A link must be the same link; a phone number the
 * same digits; any other fact the same numbers, however written: "$24k" is the customer's
 * "$24,000", "10:30 am" their "10:30".
 */
export function inventedLiterals(aiText, { allowedText = '' } = {}) {
  const typed = factsIn(String(aiText ?? '').replace(MARKER_LIKE, ' '));
  if (!typed.length) return [];
  const allowed = String(allowedText ?? '');
  const links = new Set(factsIn(allowed).filter(isLink).map(linkKey));
  // Phone numbers by their digits, with or without the +61.
  const digits = allowed.replace(/\D/g, '');
  const numbers = numbersIn(allowed);
  const found = (lit) => {
    if (isLink(lit)) return links.has(linkKey(lit));
    if (PHONE.test(lit)) { const d = phoneDigits(lit); return digits.includes(d) || digits.includes(`61${d.slice(1)}`); }
    const ns = [...numbersIn(lit)];
    return ns.length > 0 && ns.every((n) => numbers.has(n));
  };
  return [...new Set(typed.filter((lit) => !found(lit)))];
}

/**
 * The other way round, for what goes back to the AI with a second request: each of our records'
 * values in a text becomes its marker again, the longest first, so the AI sees its rejected draft
 * as it wrote it.
 */
export function maskFacts(text, markers) {
  let t = String(text ?? '');
  for (const m of [...(markers || [])].sort((a, b) => b.value.length - a.value.length)) {
    if (!m.value) continue;
    const esc = m.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`${/^\w/.test(m.value) ? '(?<!\\w)' : ''}${esc}${/\w$/.test(m.value) ? '(?!\\w)' : ''}`, 'g');
    t = t.replace(re, () => `{{${m.name}}}`);
  }
  return t;
}
