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
    return out;
  }
  if (SYSTEM_ONLY.some((re) => re.test(raw.trim()))) {
    if (/finance application/i.test(raw) || /finance/i.test(type)) out.event = financeEvent(inq);
    else if (/callback/i.test(raw)) out.event = 'Customer requested a call back through the website chat.';
    return out;
  }

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
 * Portals rewrite stock numbers: Carsales prefixes the year ("20011149" = 2001 + stock 1149),
 * Autotrader prefixes letters ("DDR1149"). `find` looks a stock number up and returns the vehicle.
 */
export function resolveStock(raw, find) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const tryOne = (stock, year) => {
    if (!stock) return null;
    const v = find(stock) || find(stock.replace(/^0+/, ''));
    if (!v) return null;
    if (year && v.year && Number(v.year) !== Number(year)) return null;
    return v;
  };
  let v = tryOne(s);
  if (v) return v;
  const noLetters = s.replace(/^[A-Za-z]+/, '');
  if (noLetters !== s) { v = tryOne(noLetters); if (v) return v; }
  const digits = noLetters;
  if (/^\d{6,8}$/.test(digits)) {
    const year = Number(digits.slice(0, 4));
    if (year >= 1980 && year <= 2035) { v = tryOne(digits.slice(4), year); if (v) return v; }
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
