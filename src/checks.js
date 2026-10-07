// Checks every draft before it is shown. The most important check: any figure, date or link
// in the draft must exist in the dealership's own records or in the conversation.

import { config } from './config.js';
import { restore, leftoverPlaceholders, NAME_TOKEN } from './redact.js';
import { findUrls, hasEmoji, wordCount, stripEmoji, similarity } from './text.js';
import { sydneyHour } from './time.js';
import { promiseChecks } from './promises.js';
import { FILLER, URGENCY, STAYS_FOR_SALE, CLAIM, NEXT_STEP_SIGNS } from './selling.js';

export const MARKERS = ['[PRICE?]', '[TRADE-IN VALUE?]', '[DELIVERY COST?]', '[DATE?]', '[CHECK?]', '[DEPOSIT LINK?]'];
// A blank is any short label in capitals with a question mark, in square brackets: [PRICE?], [SOLD PRICE?].
// The page (web/app.js) uses the same pattern to highlight them.
// One definition of a blank, shared with the page's editor.
export { BLANK_PATTERN } from '../web/lib/blank.js';
import { BLANK_PATTERN } from '../web/lib/blank.js';
const MARKER_RE = new RegExp(BLANK_PATTERN, 'g');

// Filler, pressure and unbacked claims have their own checks (filler, urgency, claim); these are the rest.
const BANNED = [
  [/\b(amazing|stunning|incredible|unbeatable|fantastic|awesome|perfect choice|great choice|excellent choice)\b/i, 'uses marketing wording'],
  [/\b(as an ai|language model|i am an ai|i'?m an ai)\b/i, 'mentions being an AI'],
  [/\b\d+(\.\d+)?\s?% ?(p\.?a\.?|per annum|interest|comparison)/i, 'quotes an interest rate'],
];

const SIGN_OFF_LINES = [
  /^(kind |warm |best |many )?regards,?\.?$/i,
  /^(thanks|thank you|cheers),?$/i,
  /^(the )?(team )?carbarn( team)?\.?$/i,
  /^(regards|thanks|cheers),?\s*(the )?(team )?carbarn( team)?\.?$/i,
  /^\[?(your name|name|sender)\]?$/i,
];

/** Removes any sign-off the model added, so the configured one can be attached once. */
export function stripModelSignOff(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  while (lines.length) {
    const last = lines[lines.length - 1].trim();
    if (last === '' || SIGN_OFF_LINES.some((re) => re.test(last))) lines.pop(); else break;
  }
  return lines.join('\n').replace(/[\s,]*(kind |best )?regards,?\s*(the )?(team )?carbarn( team)?\.?\s*$/i, '').trim();
}

/** "Good morning" after midday (and the like) becomes a plain "Hi". */
export function fixGreeting(text, hour) {
  const ok = { morning: hour >= 4 && hour < 12, afternoon: hour >= 12 && hour < 18, evening: hour >= 17 || hour < 2 };
  return String(text || '').replace(/^(\s*)good (morning|afternoon|evening)\b[ \t]*,?[ \t]*(\{\{NAME\}\})?[ \t]*[,.!]?/i, (m, lead, part, name) => {
    if (ok[part.toLowerCase()]) return m;
    return `${lead}Hi${name ? ' ' + name : ''},`;
  });
}

/**
 * Marketplace chat style: no greeting on a line of its own, and no blank lines between lines.
 * "Hi {{NAME}},\n\nYes it is." becomes "Yes it is."
 */
export function chatStyle(text) {
  const t = String(text || '').replace(/\r/g, '').trim()
    .replace(/^(hi|hello|hey|g'?day|good (morning|afternoon|evening))( there)?[ \t]*,?[ \t]*(\{\{NAME\}\})?[ \t]*[,.!]?[ \t]*\n+/i, '');
  return t.replace(/\n{2,}/g, '\n').trim();
}

/**
 * Removes an opening greeting, for a customer we have already written to today.
 * "Hi {{NAME}},\n\nYes it is." and "Hi {{NAME}}, yes it is." both become "Yes it is."
 * A message that is nothing but a greeting is left alone.
 */
export function dropGreeting(text) {
  const t = String(text || '').replace(/\r/g, '').trim();
  const rest = t.replace(/^(hi|hello|hey|g'?day|good (morning|afternoon|evening))\b( there)?[ \t]*(,?[ \t]*\{\{NAME\}\})?[ \t]*([,.!]\s*|\n\s*)/i, '');
  if (!rest || rest === t) return t;
  return rest[0].toUpperCase() + rest.slice(1);
}

/**
 * Turns the model's text into the finished suggestion.
 * signOff: the closing lines to attach ('' for none). chat: apply Marketplace chat style.
 * greeting: false removes an opening greeting (we greet a customer once a day).
 */
export function finishReply(modelReply, lead, { now = Date.now(), signOff = config.signOff, chat = false, greeting = true } = {}) {
  let t = String(modelReply || '').replace(/\\n/g, '\n').replace(/\r/g, '');
  t = stripModelSignOff(t);
  t = stripEmoji(t).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim();
  t = fixGreeting(t, sydneyHour(now));
  if (chat) t = chatStyle(t);
  else if (!greeting) t = dropGreeting(t);
  t = restore(t, lead);
  if (signOff && t) t = `${t}\n\n${signOff}`;
  return t;
}

// ---- figures ---------------------------------------------------------------

const normNum = (s) => String(s).replace(/[,\s$]/g, '').replace(/\.0+$/, '').toLowerCase();

/**
 * Clock times are rewritten so "8:00 am", "8 AM" and "8am" all compare as 8, and "10:45" and
 * "10.45 am" compare as 1045, instead of being split into separate numbers.
 */
function plainTimes(text) {
  return String(text || '')
    .replace(/\b(\d{1,2}):(\d{2})\b/g, (m, h, mm) => (mm === '00' ? `${Number(h)}` : `${Number(h)}${mm}`))
    .replace(/\b(\d{1,2})\.(\d{2})(?=\s?(?:am|pm)\b)/gi, (m, h, mm) => (mm === '00' ? `${Number(h)}` : `${Number(h)}${mm}`));
}

const NUMBER = /\$?\d[\d,]*(?:\.\d+)?\s?k\b|\$?\d[\d,]*(?:\.\d+)?/gi;

/** Every number-like token in a text, in a comparable form. "$28,900" and "28900" match. */
export function numbersIn(text) {
  const out = new Set();
  const t = plainTimes(String(text || '').replace(/https?:\/\/\S+/g, ' '));
  for (const m of t.matchAll(NUMBER)) {
    let raw = m[0].trim();
    let n = normNum(raw);
    if (/k$/.test(n)) n = String(Math.round(parseFloat(n) * 1000));
    n = n.replace(/^0+(?=\d)/, '');
    if (n) out.add(n);
  }
  return out;
}

/**
 * Figures in a reply that cannot be traced to a source.
 * - trustedText: the dealership's records, our own past messages, staff notes and instructions.
 * - customerText: what the customer wrote.
 * Dollar amounts must be in trustedText. A price that only the customer mentioned is theirs, not ours.
 * Other numbers (times, dates, kilometres of a trade-in) may come from either.
 */
const GENERIC = new Set('that this with from have will your ours they them then than when what which would could should about there their been were also only just some more most very much such into over each every other vehicle vehicles price priced carbarn customer customers please thanks thank'.split(' '));
const contentWords = (s) => new Set(String(s || '').toLowerCase().replace(/https?:\/\/\S+/g, ' ').replace(/[^a-z ]+/g, ' ').split(/\s+/).filter((w) => w.length >= 4 && !GENERIC.has(w)));
const sentences = (s) => String(s || '').split(/(?<=[.!?])\s+|\n+/).filter((x) => x.trim());

/** True when a policy figure is being used about the same subject it belongs to. */
function usedInContext(n, draftSentence, policyText) {
  const draft = contentWords(draftSentence);
  for (const s of sentences(policyText)) {
    if (!numbersIn(s).has(n)) continue;
    for (const w of contentWords(s)) if (draft.has(w)) return true;
  }
  return false;
}

/**
 * Figures in a reply that cannot be traced to a source.
 * - trustedText: this vehicle's facts, our own past messages, staff notes and instructions.
 * - policyText: business facts and website extracts. A dollar amount from here only counts when
 *   the reply uses it about the same subject ("$5,000 per claim" is not a car price).
 * - customerText: what the customer wrote. A price that only the customer mentioned is theirs, not ours.
 * Numbers that are not money (times, dates, kilometres) may come from any of the three.
 */
function figureProblems(replyBody, trustedText, customerText = '', policyText = '') {
  const trusted = numbersIn(trustedText);
  const policy = numbersIn(policyText);
  const fromCustomer = numbersIn(customerText);
  const allowed = new Set([...trusted, ...policy, ...fromCustomer]);
  // Phone numbers and similar are compared with spaces removed.
  const allowedDigits = String(`${trustedText} ${policyText} ${customerText}`).replace(/[^\d]/g, '');
  const problems = [];
  const customerOnly = [];
  const body = plainTimes(String(replyBody || '').replace(/https?:\/\/\S+/g, ' '));
  const bodySentences = sentences(body);

  for (const m of body.matchAll(NUMBER)) {
    const raw = m[0].trim();
    let n = normNum(raw);
    if (/k$/.test(n)) n = String(Math.round(parseFloat(n) * 1000));
    n = n.replace(/^0+(?=\d)/, '');
    if (!n) continue;
    const before = body.slice(Math.max(0, m.index - 3), m.index);
    const after = body.slice(m.index + m[0].length, m.index + m[0].length + 2);
    const listNumber = /(^|\n)\s*$/.test(before) && /^[.)]/.test(after) && n.length === 1;
    if (listNumber) continue;
    const tail = body.slice(m.index + m[0].length, m.index + m[0].length + 12);
    const isMoney = raw.startsWith('$') || /k$/i.test(raw) || /^\s?(dollars|aud|bucks)\b/i.test(tail);
    if (isMoney) {
      if (trusted.has(n)) continue;
      if (policy.has(n)) {
        const sentence = bodySentences.find((s) => s.includes(m[0].trim())) || body;
        if (usedInContext(n, sentence, policyText)) continue;
      }
      if (fromCustomer.has(n)) { customerOnly.push(raw); continue; }
      problems.push(raw);
      continue;
    }
    if (allowed.has(n)) continue;
    if (n.length >= 6 && allowedDigits.includes(n)) continue;
    // A single digit with no unit carries no factual claim ("one of 2 options").
    const hasUnit = /^\s?(%|am|pm|km|kms|k\b|months?|years?|yrs?|days?|weeks?|hours?|hrs?|seats?|seaters?|keys?|doors?|l\b|cc|kw)/i.test(body.slice(m.index + m[0].length, m.index + m[0].length + 10));
    if (n.length === 1 && !raw.startsWith('$') && !hasUnit) continue;
    problems.push(raw);
  }
  return { unknown: [...new Set(problems)], customerOnly: [...new Set(customerOnly)] };
}

// ---- main ------------------------------------------------------------------

/**
 * @param {object} p
 *   reply        finished text (name restored, sign-off attached)
 *   body         text without the sign-off, name still as placeholder
 *   needsHuman   list from the model
 *   allowedText  this vehicle's facts and our own past messages: may be quoted freely
 *   policyText   business facts and website extracts: dollar amounts count only in context
 *   customerText what the customer wrote: times and dates may be quoted, dollar amounts may not
 *   instruction  staff instruction, whose figures are allowed
 *   channel      'sms' or 'marketplace' (a chat, where replies are much shorter)
 *   said         the conversation as [{ who, text, at }]; when given, promises, days and places are checked
 *   stage        from selling.js saleStage: where the customer is; when given, the reply must offer a next step
 *   nextStep     what the model said its next step was
 *   now          when the reply would be sent
 */
export function checkDraft({ reply, body, needsHuman = [], allowedText = '', policyText = '', customerText = '', instruction = '', situation = null, hold = false, examples = [], inConversation = false, channel = 'sms', said = null, stage = null, nextStep = '', now = Date.now() }) {
  const results = [];
  const add = (level, code, message, tokens = []) => results.push({ level, code, message, tokens });
  const allowed = `${allowedText}\n${instruction}\n${config.site.phone}\n${config.signOff}`;

  if (!String(body || '').trim()) { add('fail', 'empty', 'The AI returned an empty reply.'); return results; }

  const figures = figureProblems(body, allowed, customerText, policyText);
  if (figures.unknown.length) add('fail', 'figure', figures.unknown.length === 1 ? `Check this figure: ${figures.unknown[0]} is not in your records.` : `Check these figures: ${figures.unknown.join(', ')} are not in your records.`, figures.unknown);
  if (figures.customerOnly.length) add('fail', 'customer-figure', `${figures.customerOnly.join(', ')} is a figure only the customer mentioned. It is not a price from your records.`, figures.customerOnly);

  const allowedUrls = new Set(findUrls(`${allowed}\n${policyText}\n${customerText}`).map((u) => u.toLowerCase().replace(/\/$/, '')));
  const badUrls = findUrls(body).filter((u) => !allowedUrls.has(u.toLowerCase().replace(/\/$/, '')));
  if (badUrls.length) add('fail', 'link', `This link is not in your records: ${badUrls.join(', ')}`, badUrls);

  const markers = [...new Set(String(body).match(MARKER_RE) || [])];
  if (markers.length) add('input', 'marker', markers.length === 1 ? 'Fill in the blank before sending.' : 'Fill in the blanks before sending.', markers);
  for (const n of needsHuman) {
    if (n?.marker && !markers.includes(n.marker) && n.reason) add('input', 'note', `${n.marker}: ${n.reason}`);
  }
  if (hold) add('input', 'hold', 'This one needs a person to decide. Read it carefully before anything is sent.');

  const left = leftoverPlaceholders(reply);
  if (left.length) add('fail', 'placeholder', `A placeholder was left in the text: ${[...new Set(left)].join(', ')}`, [...new Set(left)]);

  if (hasEmoji(body)) add('warn', 'emoji', 'Contains an emoji.');
  const bangs = (String(body).match(/!/g) || []).length;
  if (bangs > 1) add('warn', 'exclaim', `Contains ${bangs} exclamation marks.`);

  const words = wordCount(String(body).replace(/https?:\/\/\S+/g, ''));
  if (channel === 'marketplace') { if (words > 40) add('warn', 'long', `Long for a Marketplace chat (${words} words). One or two short lines is usual.`); }
  else if (words > 110) add('warn', 'long', `Long for a text message (${words} words).`);
  else if (inConversation && words > 60) add('warn', 'long', `Longer than your team usually writes mid-conversation (${words} words).`);

  // A reply lifted from an example answers somebody else's question. A short line ("Your
  // inspection is confirmed. See you on Saturday.") is bound to match one, so it is only noted;
  // its facts are checked like any other reply's.
  if (words >= 8) {
    const copied = examples.some((e) => wordCount(e) >= 8 && similarity(body, e) >= 0.75);
    if (copied) add(words >= 16 ? 'fail' : 'warn', 'copied', words >= 16 ? 'Copies an earlier reply written for a different customer almost word for word.' : 'Almost the same words as an earlier reply to another customer. Check it fits this one.');
  }
  if (new RegExp(String.raw`(^|\n)\s*${BLANK_PATTERN}\s*[.]?\s*(\n|$)`).test(String(body))) {
    add('warn', 'bare-marker', 'A blank is standing alone. Say what it is for when you fill it in.');
  }

  const questions = (String(body).match(/\?/g) || []).length - markers.length;
  if (questions > 1) add('warn', 'questions', `Asks ${questions} questions. One at most.`);

  // Selling: no filler, no pressure, no claim the records cannot back, and a next step.
  const filler = String(body).match(FILLER);
  if (filler) add('warn', 'filler', `"${filler[0]}" reads as a reply for the sake of replying. Say the next step instead.`, [filler[0]]);
  const claim = String(body).match(CLAIM);
  if (claim) add('fail', 'claim', `"${claim[0]}" is a claim the records cannot back. Say only what the vehicle facts and business facts state, in their words.`, [claim[0]]);
  const urgency = String(body).match(URGENCY);
  if (urgency) add('fail', 'urgency', `"${urgency[0]}": never say that other people are interested, that the car is selling fast or that the price will change.`, [urgency[0]]);
  const stays = String(body).match(STAYS_FOR_SALE);
  if (stays && !stage?.allowsUrgency) add('warn', 'urgency', 'Says the deposit takes the car off the market. Say this only once the customer has shown real interest: booked to see it, seen it, or asked to hold it.', [stays[0]]);
  if (stage && !hold && stage.rung !== 'buyer' && stage.move !== 'hold' && !/\?/.test(body) && !findUrls(body).length && !NEXT_STEP_SIGNS.test(body)) {
    add('warn', 'next-step', `No next step offered${String(nextStep || '').trim() ? ` (the model called its next step "${String(nextStep).trim().slice(0, 60)}")` : ''}. Aim for: ${stage.aim}.`);
  }

  for (const [re, what] of BANNED) if (re.test(body)) add(/interest rate|AI/.test(what) ? 'fail' : 'warn', 'wording', `Off-voice or risky wording: ${what}.`);

  if (situation?.all?.includes('price_negotiation') && !markers.includes('[PRICE?]') && /(lowest|best price|we can do|discount|negotiab)/i.test(body)) {
    add('input', 'price', 'This talks about price. Confirm the figure before sending.');
  }

  if (said) results.push(...promiseChecks({ body, now, said, instruction, knownText: `${allowedText}\n${policyText}` }));

  if (!results.length) add('ok', 'ok', 'Figures and links match your records.');
  return results;
}

export const worst = (checks) => (checks.some((c) => c.level === 'fail') ? 'fail' : checks.some((c) => c.level === 'input') ? 'input' : checks.some((c) => c.level === 'warn') ? 'warn' : 'ok');

/** Feedback handed back to the model for one retry. */
export function retryNote(checks) {
  const fails = checks.filter((c) => c.level === 'fail');
  if (!fails.length) return '';
  return 'Your previous draft was rejected for these reasons:\n'
    + fails.map((c) => `- ${c.message}`).join('\n')
    + '\nWrite it again, in your own words for this customer. Use only figures and links that appear in the supplied material. A dollar amount that only the customer mentioned is their figure, not ours: do not state or accept it. Where a figure is not supplied, use the matching marker such as [PRICE?], [DELIVERY COST?], [DATE?] or [CHECK?].'
    + (fails.some((c) => TIME_CODES.has(c.code)) ? '\nDo not swap one day or time for another. Where the day or time of something we will do is not given by our staff, write "shortly" or use [DATE?]. Where nobody on our side agreed to do something, say we will check and come back to them.' : '')
    + (fails.some((c) => c.code === 'urgency') ? '\nDo not say or imply that other people are interested, that the car is selling fast, or that the price will change. If the request allows urgency, the one true fact is that a $1,000 refundable holding deposit takes the car off the market; otherwise say nothing about urgency.' : '')
    + (fails.some((c) => c.code === 'claim') ? '\nSay nothing about accidents, condition, approval, cooling-off or warranty beyond what VEHICLE FACTS and BUSINESS FACTS state, in their words.' : '');
}

const TIME_CODES = new Set(['time-passed', 'day-mismatch', 'promise']);

export { NAME_TOKEN };
