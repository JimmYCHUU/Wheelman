// Fits one of the owner's templates to the customer it is for.
//
// A template is the owner's wording with its facts filled in by code (voice/*-messages.md, see
// src/templates.js). The AI may reshape the words around the facts for this customer, never the
// facts themselves. So before it sees the template, every fact filled in by code, every figure,
// link and phone number in the wording, every blank ([DEPOSIT LINK?]) and every block of lines
// added under it is replaced by a numbered marker, {{K1}}, {{K2}} ... It must keep each marker
// exactly once; code then puts each fact back exactly as it was. A marker lost, repeated or made
// up means the template is used word for word instead. {{NAME}} is the customer's first name, put
// in last as everywhere else (restore in src/redact.js).

import { fillParts } from './templates.js';
import { restore } from './redact.js';
import { BLANK_PATTERN } from '../web/lib/blank.js';

const MARKER = /\{\{(K\d+)\}\}/g;
// What may stand in the owner's own wording that the AI must not rewrite: links, phone numbers,
// figures (money, yen, numbers of four digits or with thousands separators, times of day, and a
// number of days, weeks, months, years or kilometres: "7 days", "8 AM", "6 to 10 weeks") and blanks.
const LITERAL = new RegExp([
  String.raw`https?:\/\/[^\s<>"')\]]+[^\s<>"')\].,;:!?]`,
  BLANK_PATTERN,
  String.raw`(?:\+?61\s?|\b0)4\d{2}\s?\d{3}\s?\d{3}\b`,
  String.raw`\(?\b0[2378]\)?\s?\d{4}\s?\d{4}\b`,
  String.raw`(?:AUD\s?)?[$¥]\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:JPY|AUD))?`,
  String.raw`\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b`,
  String.raw`\b\d{4,}\b`,
  String.raw`\b\d{1,2}(?:[:.]\d{2})?\s?[AaPp]\.?[Mm]\.?(?![A-Za-z])`,
  String.raw`\b\d+(?:\.\d+)?(?:\s?(?:to|-|–)\s?\d+(?:\.\d+)?)?[\s-]?(?:days?|weeks?|months?|years?|hours?|kms?|kilometres?)\b`,
].join('|'), 'g');

/**
 * The template filled two ways, from what composeMessage (or another section's facts) gave:
 *   text     the template with the real facts: the reply word for word
 *   masked   the same with a marker for every fact, figure, link and blank: what the AI sees
 *   markers  [{ name: 'K1', value }], in order of first appearance
 * `part` is the template's wording, `values` its facts for fillParts, `tail` the lines added under
 * it (kept whole, as one marker).
 */
export function maskTemplate({ part, values = {}, tail = '' }) {
  const markers = [];
  const mark = (value) => { const name = `K${markers.length + 1}`; markers.push({ name, value: String(value) }); return `{{${name}}}`; };
  // A fact with something in it becomes a marker; one that switches a paragraph on or off, or is
  // empty, stays as it is so the same paragraphs are kept in both.
  const masking = {};
  for (const [k, v] of Object.entries(values)) masking[k] = (typeof v === 'string' && v.trim()) || typeof v === 'number' ? mark(v) : v;
  const text = [fillParts(part, values), tail].filter(Boolean).join('\n\n');
  let masked = fillParts(part, masking);
  // Markers were numbered as the facts were listed; number them again in the order they appear,
  // dropping the ones whose paragraph was left out.
  const used = [...masked.matchAll(MARKER)].map((m) => m[1]);
  const byName = new Map(markers.map((m) => [m.name, m.value]));
  markers.length = 0;
  const renamed = new Map();
  for (const name of used) if (!renamed.has(name)) renamed.set(name, mark(byName.get(name)));
  masked = masked.replace(MARKER, (m, name) => renamed.get(name));
  // Then whatever the owner's own wording holds that must stay as written.
  masked = masked.split(/(\{\{K\d+\}\})/).map((piece, i) => (i % 2 ? piece : piece.replace(LITERAL, (lit) => mark(lit)))).join('');
  if (tail) masked = `${masked}\n\n${mark(tail)}`;
  // How many times each stands in the template: a fact named twice comes back twice.
  for (const m of markers) m.count = masked.split(`{{${m.name}}}`).length - 1;
  return { text, masked, markers };
}

// Amounts as staff type them: "1.31m", "20k", "2.38 mil".
const SHORTHAND = /\b\d+(?:\.\d+)?\s?(?:k|m|mil|million)\b/gi;

/**
 * What the owner typed (Prompt, Rewrite, "Add what you know"), as the AI may see it while it fits
 * a template: a fact of the template it repeats becomes that fact's marker; any other figure, link,
 * phone number or amount becomes a marker of its own, added to `markers` as optional (the AI may
 * put it in where the message needs it, or leave it out). So nothing typed reaches the AI as a
 * figure either (an auction order's amounts never go to it), and what it does use comes back
 * exactly as typed.
 */
export function maskInstruction(text, markers) {
  let t = String(text || '');
  if (!t.trim()) return t;
  for (const m of [...markers].sort((a, b) => b.value.length - a.value.length)) if (m.value.trim().length >= 3) t = t.split(m.value).join(`{{${m.name}}}`);
  const extra = (value) => {
    const name = `K${markers.length + 1}`;
    markers.push({ name, value, count: 1, optional: true });
    return `{{${name}}}`;
  };
  return t.split(/(\{\{K\d+\}\})/).map((piece, i) => (i % 2 ? piece : piece.replace(LITERAL, extra).replace(SHORTHAND, extra))).join('');
}

/** Puts every fact back where its marker is. */
export function unmask(text, markers) {
  const byName = new Map(markers.map((m) => [m.name, m.value]));
  return String(text ?? '').replace(MARKER, (m, name) => (byName.has(name) ? byName.get(name) : m));
}

/**
 * Whether the AI kept the markers: each as many times as the template has it (once, nearly
 * always), none made up. With `optional` (the owner's Prompt or Rewrite asked for something else)
 * a marker may be left out, never repeated more often or made up. A marker for a figure the owner
 * typed (maskInstruction) may always be left out.
 */
export function checkMarkers(text, markers, { optional = false } = {}) {
  const expected = new Map(markers.map((m) => [m.name, m.count || 1]));
  const counts = new Map();
  for (const m of String(text ?? '').matchAll(MARKER)) counts.set(m[1], (counts.get(m[1]) || 0) + 1);
  const unknown = [...counts.keys()].filter((n) => !expected.has(n));
  const doubled = [...counts.entries()].filter(([n, c]) => expected.has(n) && c > expected.get(n)).map(([n]) => n);
  const may = new Set(markers.filter((m) => m.optional).map((m) => m.name));
  const missing = optional ? [] : [...expected.entries()].filter(([n, want]) => !may.has(n) && (counts.get(n) || 0) < want).map(([n]) => n);
  return { ok: !unknown.length && !doubled.length && !missing.length, missing, unknown, doubled };
}

/** What went wrong with the markers, in words for the check and the second request. */
export function markerTrouble({ missing, unknown, doubled }) {
  return [...missing.map((n) => `{{${n}}} was left out`), ...doubled.map((n) => `{{${n}}} was written more often than the template has it`), ...unknown.map((n) => `{{${n}}} is not one of the template's markers`)].join('; ');
}

/**
 * A fitted template, finished: the facts are back, the name is put in, the spacing tidied. Its
 * own greeting and closing lines stay exactly as the template has them.
 */
export const finishTemplate = (text, lead) => restore(String(text ?? '').replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim(), lead);

/**
 * The plan the drafter follows to fit a template (src/drafter.js): what the AI is told, the
 * markers to put back, what a reply may state, and the checks the template carries whoever writes
 * it. `tpl`: { id, label, masked: maskTemplate(...), wordChecks, factsUsed }. `orderPlan`: for an
 * auction order, planOrderReply's facts about the order, given to the AI as context.
 */
export function templatePlan(tpl, { orderPlan = null, followUp = null } = {}) {
  const { masked, markers, text } = tpl.masked;
  return {
    stage: 'template',
    heading: 'THE MESSAGE TO FIT TO THIS CUSTOMER',
    template: tpl.id,
    label: tpl.label,
    masked, markers, text,
    tail: '',
    tokens: orderPlan?.tokens,
    mask: orderPlan?.mask,
    trustedText: [text, orderPlan?.trustedText].filter(Boolean).join('\n'),
    wordChecks: tpl.wordChecks || [],
    factsUsed: tpl.factsUsed || [],
    lines: [
      `This is our message "${tpl.label}", written by our team for this kind of moment. Its facts, figures, links, phone numbers and blanks are markers such as {{K1}}: code puts each one back exactly as it was.`,
      '<<<',
      masked,
      '>>>',
      'Fit this message to this customer:',
      '- Keep what each part says, in the same order and layout: its lines, paragraphs and lists stay as they are.',
      '- Change the wording only where it makes the message read naturally for this customer and for what they last wrote. If they asked something the message does not answer, you may add a sentence or two answering it from the facts given here.',
      '- When what the customer wrote, or their notes on the order, gives something of theirs to pick up (their suburb or state, a deadline, what the car is for, towing), you may add one short line directly after the greeting line that reflects it, with no figure, link or promise in it. Add nothing when there is nothing to pick up.',
      '- Keep every marker exactly once, written exactly as shown, where it belongs. Never write a figure, link, phone number or blank yourself, and never make up a marker.',
      '- Keep the greeting and the closing lines the message has, with {{NAME}} where it is. Add no other greeting or sign-off.',
      ...(orderPlan ? ['', 'About this order, for context only (the message above is what to send):', ...orderPlan.lines] : []),
      ...(followUp ? ['', followUp.kind === 'reminder'
        ? 'This is a reminder of a visit still to come (see FOLLOW-UP below): keep the day, the time and the address as the message has them, add no question, and say nothing about how the visit went or whether they are coming.'
        : /^stock_/.test(String(followUp.kind || ''))
          ? 'This is news about the car they asked about (see FOLLOW-UP below): keep the news and every figure as the message has them, add no question, and never "just checking in" or "just following up".'
          : 'This is a follow-up our staff asked for (see FOLLOW-UP below): keep it under 50 words, add no question the message does not have, never "just checking in" or "just following up", and never ask whether they came or made it.'] : []),
    ],
  };
}
