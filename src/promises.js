// Checks a suggested reply for things that sound fine but are not backed by anything:
// a time that has already passed, a day nobody mentioned, a promise nobody made, and a place the
// customer never said. No AI call: plain rules over the reply and the conversation.

import { sydneyDay, sydneyHour, formatSydney } from './time.js';
import { PLACES } from './situations.js';
import { stripLocationBlock } from './voice.js';

const plain = (s) => String(s || '').replace(/[’‘]/g, "'");
const sentences = (s) => plain(s).split(/(?<=[.!?])\s+|\n+/).map((x) => x.trim()).filter(Boolean);
const MARKER = /\[(PRICE|TRADE-IN VALUE|DELIVERY COST|DATE|CHECK)\?\]/;

// ---- days -----------------------------------------------------------------------------------

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const SHORT = { sun: 0, mon: 1, tue: 2, tues: 2, wed: 3, thu: 4, thur: 4, thurs: 4, fri: 5, sat: 6 };
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH = '(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*';

const iso = (y, m, d) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
const addDays = (day, n) => { const [y, m, d] = day.split('-').map(Number); return iso(y, m - 1, d + n); };
const weekdayOf = (day) => { const [y, m, d] = day.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

/** The dates a weekday name can mean when written on `base`: the coming one and the one after. */
function datesForWeekday(index, base) {
  const delta = (index - weekdayOf(base) + 7) % 7;
  // "Friday" said on a Friday can mean today or a week away, so both are accepted.
  return delta === 0 ? [base, addDays(base, 7)] : [addDays(base, delta), addDays(base, delta + 7)];
}

/** A day and month with no year: the nearest such date that is not long past. */
function dayMonth(d, m, base) {
  if (!(d >= 1 && d <= 31) || !(m >= 0 && m <= 11)) return null;
  const year = Number(base.slice(0, 4));
  const date = iso(year, m, d);
  return daysBetween(date, base) > 180 ? iso(year + 1, m, d) : date;
}

/**
 * Every calendar date a text refers to, worked out from when it was written.
 * `loose` also reads short forms ("sat", "tmrw") and written dates ("5 Oct", "5/10", "the 5th"),
 * for what customers and staff type. A reply is read strictly.
 */
export function dayRefs(text, at, { loose = false } = {}) {
  const base = sydneyDay(at);
  const out = [];
  const t = plain(text).toLowerCase();
  const add = (word, dates) => { const list = dates.filter(Boolean); if (list.length) out.push({ word, dates: list }); };
  for (const m of t.matchAll(/\b(today|tonight|this (?:morning|afternoon|arvo|evening))\b/g)) add(m[0], [base]);
  for (const m of t.matchAll(/\bday after tomorrow\b/g)) add(m[0], [addDays(base, 2)]);
  for (const m of t.matchAll(loose ? /\b(tomorrow|tmrw|tmr|tomoz|tomo)\b/g : /\btomorrow\b/g)) add(m[0], [addDays(base, 1)]);
  for (const m of t.matchAll(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)s?\b/g)) add(m[1], datesForWeekday(WEEKDAYS.indexOf(m[1]), base));
  if (/\b(this|the|on the|at the|next) weekend\b/.test(t)) {
    const sat = datesForWeekday(6, base)[0];
    add('weekend', [sat, addDays(sat, 1), addDays(sat, 7), addDays(sat, 8), ...(weekdayOf(base) === 0 ? [base] : [])]);
  }
  if (loose) {
    for (const m of t.matchAll(/\b(sun|mon|tues?|wed|thur?s?|fri|sat)\b/g)) add(m[0], datesForWeekday(SHORT[m[1]], base));
    for (const m of t.matchAll(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH}\\b`, 'g'))) add(m[0], [dayMonth(+m[1], MONTHS.indexOf(m[2]), base)]);
    for (const m of t.matchAll(new RegExp(`\\b${MONTH}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'g'))) add(m[0], [dayMonth(+m[2], MONTHS.indexOf(m[1]), base)]);
    for (const m of t.matchAll(/\b(\d{1,2})\/(\d{1,2})\b/g)) add(m[0], [dayMonth(+m[1], +m[2] - 1, base)]);
    for (const m of t.matchAll(/\bthe (\d{1,2})(?:st|nd|rd|th)\b/g)) {
      const [y, mo, d] = base.split('-').map(Number);
      if (+m[1] >= 1 && +m[1] <= 31) add(m[0], [+m[1] >= d ? iso(y, mo - 1, +m[1]) : iso(y, mo, +m[1])]);
    }
  }
  return out;
}

// A sentence that arranges something, as opposed to an invitation, a question, opening hours or
// a well-wish. Only an arrangement is held to the days people actually mentioned.
const ARRANGES = /\b(see you|seeing you|will|'ll|ready|pick(ed)? ?up|collect|deliver(ed|y)?|book(ed)?|arriv\w+|send|call|email|drop|meet|expect|confirm(ed)?)\b/i;
const NOT_ARRANGING = /(\b(we are open|open (7|seven) days|opening hours|hours are|have a (great|good|nice|lovely|wonderful)|enjoy (your|the)|welcome to|you can|you could|if you(?:'d| would) like|any ?time|(does|would|will) .{0,30}\b(suit|work)\b)|\?\s*$)/i;

// ---- promises ---------------------------------------------------------------------------------

const ACTION = '(email|send|call|ring|phone|text|message|book|hold|reserve|fix|repair|replace|deliver|drop off|organi[sz]e|arrange|register|post|forward|transfer|refund|install|fit)';
const PROMISE = new RegExp(`\\b(i|we)(?:'ll| will| shall| am going to| are going to)\\s+(?:\\w+\\s+){0,2}?${ACTION}\\b`, 'i');
const HAS_TIME = /\b(today|tonight|tomorrow|this (morning|afternoon|arvo|evening|week)|sunday|monday|tuesday|wednesday|thursday|friday|saturday|by (the )?(end|close)|within (the |an? |\d+ )?(hour|day|minutes?|hours?)|in (an?|\d+) (minutes?|hours?|days?)|at \d{1,2}(:\d\d)?\s?(am|pm)?|first thing|until|straight away|right away|immediately)\b/i;
// "It will be ready on Friday", "We will have both ready by 3 pm": a commitment about when, with
// no action verb. "We will let you know once it is ready" is not one.
const READY = /\b(will|'ll)\b[^.!?\n]{0,50}\bready\b/i;
const READY_IF = /\b(once|when|whenever|as soon as|if|until)\b[^.!?\n]{0,40}\bready\b/i;
// Things the playbook lets us offer freely when the customer asks for them.
const FREELY_OFFERED = /\b(photos?|pictures?|pics|videos?|walk[\s-]?around|auction sheet|export certificate)\b/i;

const stem = (verb) => String(verb || '').toLowerCase().replace(/(ing|ed|s|e)$/, '');

// A state is known when the customer named it, its short form, or a city in it.
const IMPLIES = {
  queensland: /\b(qld|brisbane|gold coast|sunshine coast|cairns|townsville|toowoomba)\b/,
  victoria: /\b(vic|melbourne|geelong)\b/,
  tasmania: /\b(tas|tassie|hobart)\b/,
  'western australia': /\b(wa|perth)\b/,
  'south australia': /\b(sa|adelaide)\b/,
  'northern territory': /\b(nt|darwin)\b/,
  canberra: /\b(act)\b/,
};

/**
 * @param body         the AI's own text (name still as a placeholder, no sign-off, no block)
 * @param now          when the reply would be sent
 * @param said         [{ who: 'customer'|'us', text, at }] the conversation, oldest first
 * @param instruction  what the person asked for when rewriting, if anything
 * @param knownText    our own records given to the AI (a place named there is not a guess)
 * @returns checks in the same shape as checkDraft: { level, code, message, tokens }
 */
export function promiseChecks({ body, now = Date.now(), said = [], instruction = '', knownText = '' } = {}) {
  const out = [];
  const add = (level, code, message, tokens = []) => out.push({ level, code, message, tokens });
  const text = plain(body);
  if (!text.trim()) return out;
  const hour = sydneyHour(now);
  const clock = formatSydney(now).split(', ').pop();
  const quote = (s) => (s.length > 90 ? s.slice(0, 90) + '…' : s);

  // 1. A part of today that is already over.
  const future = /\b(will|'ll|shall|going to|see you|ready|by)\b/i;
  for (const s of sentences(text)) {
    if (MARKER.test(s) || !future.test(s)) continue;
    const morning = s.match(/\bthis morning\b/i);
    const afternoon = s.match(/\bthis (afternoon|arvo)\b/i);
    if (morning && hour >= 12) add('fail', 'time-passed', `"${morning[0]}" has already passed: it is ${clock} in Sydney.`, [morning[0]]);
    else if (afternoon && hour >= 17) add('fail', 'time-passed', `"${afternoon[0]}" has already passed: it is ${clock} in Sydney.`, [afternoon[0]]);
    else if (/\btoday\b/i.test(s) && hour >= 17) add('warn', 'time-late', `It is ${clock}. Check that "today" is still right.`, [s.match(/\btoday\b/i)[0]]);
  }

  // 2. A day that nobody in the conversation mentioned.
  const known = new Set();
  for (const e of said) for (const r of dayRefs(e.text, e.at || now, { loose: true })) for (const d of r.dates) known.add(d);
  for (const r of dayRefs(instruction, now, { loose: true })) for (const d of r.dates) known.add(d);
  const flagged = new Set();
  for (const s of sentences(text)) {
    if (MARKER.test(s) || !ARRANGES.test(s) || NOT_ARRANGING.test(s)) continue;
    for (const r of dayRefs(s, now)) {
      if (/^(today|tonight|this )/.test(r.word)) continue; // parts of today are checked above, against the clock
      if (r.dates.some((d) => known.has(d)) || flagged.has(r.word)) continue;
      flagged.add(r.word);
      const shown = text.match(new RegExp(`\\b${r.word}\\b`, 'i'))?.[0] || r.word;
      add('fail', 'day-mismatch', `The reply says "${shown}", but that is not a day anyone in the conversation mentioned.`, [shown]);
    }
  }

  // 3. A promise to do something, when nobody on our side said we would.
  const ours = said.filter((e) => e.who === 'us').slice(-4).map((e) => stripLocationBlock(e.text || '')).join('\n');
  const backing = plain(`${instruction}\n${ours}`).toLowerCase();
  const vague = [];
  for (const s of sentences(text)) {
    if (MARKER.test(s)) continue; // a blank in the sentence already hands it to a person
    const m = s.match(PROMISE);
    const ready = !m && !READY_IF.test(s) ? s.match(READY) : null;
    if (!m && !ready) continue;
    const verb = m ? stem(m[2]) : 'ready';
    if (verb && backing.includes(verb)) continue; // staff asked for it, or we already said it
    if (/\bbook you in\b/i.test(s)) continue; // confirming a visit the customer asked for
    if (HAS_TIME.test(s)) add('fail', 'promise', `The reply promises a time: "${quote(s)}" Nobody on our side agreed to that.`, [(m || ready)[0]]);
    else if (m && !FREELY_OFFERED.test(s)) vague.push(m[0]);
  }
  if (vague.length) add('warn', 'promise', `The reply promises an action ("${vague[0]} …"). Make sure someone will do it.`, vague);

  // 4. A place nobody mentioned (it would be a guess about where the customer is).
  const heard = plain(`${said.map((e) => e.text || '').join('\n')}\n${instruction}\n${knownText}`).toLowerCase();
  const places = [...new Set((text.match(new RegExp(PLACES.source, 'gi')) || []).map((p) => p.toLowerCase()))]
    .filter((p) => !heard.includes(p) && !(IMPLIES[p] && IMPLIES[p].test(heard)));
  if (places.length) {
    const shown = places.map((p) => text.match(new RegExp(p, 'i'))?.[0] || p);
    add('fail', 'location', `The reply mentions ${shown.map((p) => `"${p}"`).join(', ')}, but the customer never said where they are.`, shown);
  }

  return out;
}
