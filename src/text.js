// Helpers for reading customer messages and enquiry records.

import { loadPeople } from './people.js';

const EMOJI = /[\p{Extended_Pictographic}\p{Emoji_Modifier}‍️]/gu;

export const stripEmoji = (s) => String(s || '').replace(EMOJI, '');
export const hasEmoji = (s) => /\p{Extended_Pictographic}/u.test(String(s || ''));
export const squash = (s) => String(s || '').replace(/\s+/g, ' ').trim();
export const wordCount = (s) => (squash(s).match(/\S+/g) || []).length;

/** iMessage-style reactions arrive as text, e.g. Liked “…”. They are not messages. */
export function isReaction(body) {
  return /^\s*(Liked|Loved|Emphasi[sz]ed|Laughed at|Disliked|Questioned|Reacted)\b.{0,12}[“"']/i.test(String(body || ''));
}

/** Customer asked not to be contacted. */
export function isOptOut(body) {
  const t = squash(stripEmoji(body)).toLowerCase().replace(/[.!]+$/, '');
  return /^(stop|stop all|unsubscribe|opt out|optout|remove me|do not (contact|text|message) me|don't (contact|text|message) me)$/.test(t)
    || /\b(stop (texting|messaging|contacting) me|take me off your list|unsubscribe me)\b/.test(t);
}

const ACK_WORDS = new Set(('ok okay k kk thanks thank you thx ty cheers great perfect awesome cool nice good lovely excellent '
  + 'noted received sure yep yes yeah yup no worries problem sounds all will do got it that that\'s thats is fine '
  + 'see ya then soon there tomorrow much so very heaps alot a lot again mate bro brother buddy sir team legend champ '
  + 'appreciate appreciated appreciate it for the info information update reply response help getting back to me us '
  + 'carbarn have had day night weekend one too and you\'re youre welcome bye talk later '
  + 'understood done on our my way omw u ur ya this morning afternoon arvo evening tonight today shortly in bit at around about catch chat speak '
  + 'wow yay sweet alright righto brilliant wonderful beauty ta oh ah').split(' '));

// "Thanks <staff name>" is still only a thank-you. Staff names come from voice/people.json.
let ackWithNames = null;
const ackWords = () => (ackWithNames ||= new Set([...ACK_WORDS, ...loadPeople().words]));

// Happy noises that need no answer: "Can't wait", "I'm so excited", "Hahaha".
const ACK_PHRASES = [
  /\bcan'?t wait\b/g,
  /\blooking forward( to (it|that|this|seeing you|meeting you))?\b/g,
  /\b(i'?m|i am|we'?re|we are) (so |very |really |super |pretty )*(excited|stoked|happy|glad|keen|pumped)\b/g,
  /\b(so |very |really |super )+(excited|stoked|happy|glad)\b/g,
];
const LAUGHTER = /\b(a?(ha){2,}h?|he(he)+|lo+l|lmao|rofl)\b/g;

/** A short "thanks / ok / see you" that does not need a reply. */
export function isAcknowledgement(body) {
  const raw = String(body || '');
  if (/\?/.test(raw)) return false;
  let t = squash(stripEmoji(raw)).toLowerCase().replace(/[’‘`]/g, "'").replace(/[^a-z' ]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return hasEmoji(raw); // emoji only, e.g. a thumbs up
  if (t.split(' ').length > 12) return false;
  for (const re of ACK_PHRASES) t = t.replace(re, ' ');
  t = t.replace(LAUGHTER, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return true; // nothing left but the happy noise
  const words = t.split(' ');
  if (words.length > 9) return false;
  const known = ackWords();
  return words.every((w) => known.has(w));
}

const MENU_OPTIONS = {
  1: 'wants the walkaround video',
  2: 'wants the finance application link',
  3: 'wants the showroom address and inspection times',
  4: 'is no longer looking',
};

/** First-reply templates offer a numbered menu. Returns what the customer picked, or null. */
export function menuReply(inboundBody, previousOutboundBody) {
  if (!/please reply\s*:?/i.test(String(previousOutboundBody || '')) || !/\b1\b[\s\S]*\b2\b/.test(String(previousOutboundBody || ''))) return null;
  const t = squash(inboundBody).toLowerCase().replace(/[.!]+$/, '');
  if (!/^(option )?[1-4](\s*(,|and|&|\+|\/)?\s*[1-4])*$/.test(t)) return null;
  const picks = [...new Set(t.match(/[1-4]/g).map(Number))];
  return { picks, meanings: picks.map((p) => MENU_OPTIONS[p]), notLooking: picks.length === 1 && picks[0] === 4 };
}

/** Same words, ignoring spacing and case. Used to drop re-imported copies. */
export const sameText = (a, b) => squash(a).toLowerCase() === squash(b).toLowerCase();

// ---- enquiry records -------------------------------------------------------

const SYSTEM_ONLY = [
  /^lead generated automatically/i,
  /^requested to callback$/i,
];

const HEADER_LINE = /^\s*(make|model|year|badge|description|enginedescription|bodytype|transmission|colour|color|price|stocknumber|stock number|odometer|vin|rego|registration)\s*:/i;

/**
 * Pulls the customer's own words out of an enquiry record and describes any system event.
 * Returns { text, event } where either may be empty.
 */
export function readInquiry(inq) {
  const raw = String(inq?.text || '').replace(/\r/g, '');
  const type = String(inq?.type || '');
  const out = { text: '', event: '' };
  if (!raw.trim()) {
    if (/finance application/i.test(type)) out.event = financeEvent(inq);
    if (/waitlist/i.test(type)) out.event = 'Customer joined the waitlist for a reserved vehicle.';
    const empty = readImportForm('', inq);
    if (empty) out.event = empty.event;
    return out;
  }
  if (SYSTEM_ONLY.some((re) => re.test(raw.trim()))) {
    if (/finance application/i.test(raw) || /finance/i.test(type)) out.event = financeEvent(inq);
    else if (/callback/i.test(raw)) out.event = 'Customer requested a call back through the website chat.';
    return out;
  }

  // The website's import and auction forms: a list of fields, then the customer's own notes.
  const form = readImportForm(raw, inq);
  if (form) { out.event = form.event; out.text = form.notes; return out; }

  let m = raw.match(/test drive has been requested by the user for the scheduled time:\s*([^.]+?)\.\s/i);
  if (m) { out.event = `Customer booked a test drive through the website for ${m[1].trim()}.`; return out; }

  m = raw.match(/^preferred inspection:\s*(.+?)\.?\s*$/i);
  if (m) { out.event = `Customer booked an inspection through the website: ${m[1].trim()}.`; return out; }

  m = raw.match(/^trying to buy\s+(.+)$/i);
  if (m) { out.event = `Customer started the online purchase steps for: ${m[1].trim()}.`; return out; }

  if (/^customer wants to trade in their/i.test(raw.trim())) {
    const notes = raw.match(/customer notes:\s*([\s\S]+)$/i);
    const head = raw.split(/customer notes:/i)[0];
    out.event = 'Trade-in request through the website. ' + squash(head.replace(/Trade-in lead #\d+\s*·?/i, ''));
    out.text = notes ? notes[1].trim() : '';
    return out;
  }

  let body = raw;
  // Autotrader SMS relay wrapper
  const relay = body.match(/the customer enquiry is as follows:\s*([\s\S]+)$/i);
  if (relay) body = relay[1];
  // Portal boilerplate that follows the customer's words
  body = body.split(/\n\s*This customer has requested to view the AutoRecord/i)[0];
  body = body.split(/\n\s*Please find below the details from the history checks/i)[0];

  const lines = body.split('\n');
  const kept = [];
  for (const line of lines) {
    const l = line.trim();
    if (HEADER_LINE.test(l)) continue;
    if (/^\(ref:\s*at-\d+/i.test(l)) continue;
    if (/^https?:\/\/(www\.)?carsales\.com\.au\/\S+$/i.test(l)) continue;
    if (/^sent from my /i.test(l)) continue;
    if (/^you have received an sms enquiry/i.test(l) || /^this enquiry was also sent to/i.test(l)) continue;
    kept.push(line);
  }
  let text = kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();

  // Relay and SMS-connect enquiries start with the car's title on its own line.
  const first = text.split('\n')[0] || '';
  if ((relay || /sms connect/i.test(type)) && /^(19|20)\d\d\s+\S+/.test(first) && text.includes('\n')) {
    text = text.split('\n').slice(1).join('\n').trim();
  }
  if (/i have a vehicle to trade in, please provide me with an estimated valuation/i.test(text)) {
    out.event = 'Customer ticked "I have a vehicle to trade in" on the portal enquiry form.';
  }
  out.text = text;
  return out;
}

const NOT_GIVEN = /^(not provided|not specified|n\/?a|none|any|-)?$/i;

/**
 * Reads an enquiry made through the website's importing or live-auction pages.
 * Returns null for any other enquiry. Otherwise:
 *   kind      'auction' (tell me when one comes up, or a bid request), 'import' (source one for me), 'compliance'
 *   make, model, modelCode
 *   grade, maxKm, ceilingAud   what the form's own boxes said, when filled in
 *   viewing   the auction car they were looking at
 *   notes     the customer's own words
 *   event     one plain sentence describing the enquiry, for the conversation
 */
export function readImportForm(rawText, inq = {}) {
  const raw = String(rawText || '').replace(/\r/g, '');
  const type = String(inq?.type || '');
  const kind = /compliance-only|compliance request/i.test(raw + type) ? 'compliance'
    : /auction alert request|^auction$/i.test(raw.slice(0, 60) + '\n' + type) || /^auction$/i.test(type) ? 'auction'
      : /request available vehicles lead|sourcing option selected|^import request$/i.test(raw.slice(0, 80) + '\n' + type) || /^import request$/i.test(type) ? 'import'
        : '';
  if (!kind) return null;

  // The form arrives as plain lines, as one comma-separated sentence, or as HTML.
  const plain = raw.replace(/<\s*br\s*\/?>|<\/?(li|ul|ol|p|div)\b[^>]*>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{2,}/g, '\n');
  const field = (label) => {
    const m = plain.match(new RegExp(`(?:^|[\\n,.]\\s*|:\\s)${label}:\\s*([^\\n,]+?)\\s*(?=$|\\n|,|\\.\\s|\\.$)`, 'im'));
    const v = m ? m[1].trim() : '';
    return NOT_GIVEN.test(v) ? '' : v;
  };
  const notesAt = plain.search(/additional notes:/i);
  const notes = notesAt === -1 ? '' : plain.slice(notesAt).replace(/^additional notes:\s*/i, '').trim();
  const head = notesAt === -1 ? plain : plain.slice(0, notesAt);
  const inHead = (label) => { const m = head.match(new RegExp(`${label}:\\s*\\n?\\s*([^\\n]+)`, 'i')); return m && !NOT_GIVEN.test(m[1].trim()) ? m[1].trim() : ''; };

  // The subject names the car too: "Sourcing enquiry for Audi R8 (4S)", "Auction alert for Subaru XV Hybrid".
  const subject = String(inq?.subject || '').match(/\bfor\s+(.+?)(?:\s*\(([^)]+)\))?\s*$/i);
  const make = field('Make');
  const model = field('Model');
  const modelCode = field('Model Code') || (subject?.[2] || '');
  const car = [make, model].filter(Boolean).join(' ') || (subject?.[1] || '').trim();
  const km = field('Max odometer').replace(/[^\d]/g, '');
  const budget = field('Landed budget');
  const cap = budget.match(/under\s*\$?\s*(\d+)\s*k/i) || budget.match(/\$?\s*\d+\s*k?\s*-\s*\$?\s*(\d+)\s*k/i);
  const out = {
    kind, make, model, modelCode, car,
    grade: field('Grade'),
    maxKm: km ? Number(km) : 0,
    budgetText: budget,
    ceilingAud: cap ? Number(cap[1]) * 1000 : 0,
    viewing: field('While viewing lot'),
    pathway: inHead('Selected Pathway') || field('Sourcing option selected'),
    contact: field('Preferred contact') || inHead('Preferred Contact'),
    notes,
  };
  const bits = [];
  if (out.grade) bits.push(`Grade: ${out.grade}`);
  if (out.maxKm) bits.push(`Maximum odometer: ${out.maxKm.toLocaleString('en-AU')} km`);
  if (out.budgetText) bits.push(`Landed budget: ${out.budgetText.toLowerCase()}`);
  if (out.viewing) bits.push(`They were looking at this auction car: ${out.viewing}`);
  if (out.pathway) bits.push(`Service chosen: ${out.pathway}`);
  const what = `${car || 'a vehicle'}${modelCode && !car.includes(modelCode) ? ` (model code ${modelCode})` : ''}`;
  out.event = (kind === 'auction' ? `Asked on the website's live auction pages to be told when a ${what} comes up at auction in Japan.`
    : kind === 'import' ? `Import enquiry through the website: asked us to source a ${what} from Japan.`
      : `Compliance-only enquiry through the website for a ${what}.`) + (bits.length ? ` ${bits.join('. ')}.` : '');
  return out;
}

function financeEvent(inq) {
  const bits = [];
  if (inq?.loanAmount) bits.push(`loan amount $${Number(inq.loanAmount).toLocaleString('en-AU')}`);
  if (inq?.depositAmount) bits.push(`deposit $${Number(inq.depositAmount).toLocaleString('en-AU')}`);
  if (inq?.years) bits.push(`${inq.years} years`);
  return 'Customer submitted a finance application through the website' + (bits.length ? ` (${bits.join(', ')})` : '') + '.';
}

/**
 * Texts forwarded by Carsales or Autotrader arrive wrapped in boilerplate.
 * Returns the customer's own words and, when present, the car the portal named.
 */
export function unwrapRelay(body) {
  const raw = String(body || '').replace(/\r/g, '');
  let about = '';
  let text = raw;

  const at = raw.match(/(?:the )?customer enquiry is(?: as follows)?:\s*([\s\S]+)$/i);
  if (at && /autotrader/i.test(raw)) {
    const lines = at[1].split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length && /^(19|20)\d\d\s+\S+/.test(lines[0])) about = lines.shift();
    text = lines.filter((l) => !/^\(ref:/i.test(l) && !/^enter name and enquiry$/i.test(l)).join('\n');
    return { text: text.trim(), about };
  }

  const lines = raw.split('\n');
  const linkAt = lines.findIndex((l) => /^https?:\/\/(www\.)?carsales\.com\.au\/\S+$/i.test(l.trim()));
  if (linkAt !== -1 && linkAt <= 2) {
    const head = lines.slice(0, linkAt).map((l) => l.trim()).filter(Boolean);
    if (head.length === 1 && /^(19|20)\d\d\s+\S+/.test(head[0])) about = head[0];
    text = lines.slice(linkAt + 1).join('\n');
    return { text: text.trim(), about };
  }
  return { text: raw.trim(), about: '' };
}

/** Enquiry types that are phone calls or duplicates and never need a written reply. */
export function isSilentInquiry(inq) {
  return /^call connect$/i.test(String(inq?.type || ''));
}

// ---- stock numbers ---------------------------------------------------------

/**
 * The stock numbers a reference may stand for, most literal first, each with the year it must
 * match (or null). Portals rewrite stock numbers: Carsales prefixes the year ("20011149" is the
 * 2001 car with stock 1149, "2014T02" the 2014 car with stock T02), Autotrader prefixes letters
 * ("DDR1149"), and some add a portal code ("CSCBT02" is stock T02).
 */
export function stockCandidates(raw) {
  const s = String(raw ?? '').trim();
  if (!s || /^(null|undefined|none|n\/a)$/i.test(s)) return [];
  const out = [];
  const add = (stock, year = null) => { if (stock && !out.some((c) => c.stock === stock && c.year === year)) out.push({ stock, year }); };
  add(s);
  const noLetters = s.replace(/^[A-Za-z]+/, '');
  if (noLetters !== s) add(noLetters);
  const coded = s.match(/^[A-Za-z]{2}CB([A-Za-z]\d{1,4})$/i);
  if (coded) add(coded[1].toUpperCase());
  const dated = noLetters.match(/^(\d{4})(\d{2,4}|[A-Za-z]\d{1,4})$/);
  if (dated) {
    const year = Number(dated[1]);
    if (year >= 1980 && year <= 2035) add(/^[A-Za-z]/.test(dated[2]) ? dated[2].toUpperCase() : dated[2], year);
  }
  return out;
}

/**
 * Whether a car can be the one a dated reference means. A portal's year and ours can differ by
 * one (build year against the year it was first registered), never by more.
 */
export const yearFits = (refYear, vehicleYear) => !refYear || !vehicleYear || Math.abs(Number(vehicleYear) - Number(refYear)) <= 1;

/** The vehicle a stock reference stands for. `find` looks one stock number up and returns the vehicle. */
export function resolveStock(raw, find) {
  for (const { stock, year } of stockCandidates(raw)) {
    const v = find(stock) || find(stock.replace(/^0+/, ''));
    if (!v) continue;
    if (!yearFits(year, v.year)) continue;
    return v;
  }
  return null;
}

/** Stock number from a carbarn.com.au vehicle link, or null. */
export function stockFromUrl(url) {
  const m = String(url || '').match(/carbarn\.com\.au\/vehicles\/[^/\s]+\/[^/\s]+\/[^/\s]+\/([A-Za-z0-9-]+)/i);
  return m ? m[1] : null;
}

export function findUrls(text) {
  return (String(text || '').match(/https?:\/\/[^\s<>()"']+/gi) || []).map((u) => u.replace(/[.,;:!?]+$/, ''));
}

// ---- similarity (for comparing a suggestion with what was actually sent) ----

export function similarity(a, b) {
  const tok = (s) => squash(stripEmoji(s)).toLowerCase().replace(/https?:\/\/\S+/g, ' ').replace(/[^a-z0-9$ ]+/g, ' ').split(/\s+/).filter(Boolean);
  const A = tok(a), B = tok(b);
  if (!A.length || !B.length) return 0;
  const count = (arr) => arr.reduce((m, w) => m.set(w, (m.get(w) || 0) + 1), new Map());
  const ca = count(A), cb = count(B);
  let overlap = 0;
  for (const [w, n] of ca) overlap += Math.min(n, cb.get(w) || 0);
  return Math.round((2 * overlap) / (A.length + B.length) * 100) / 100;
}
