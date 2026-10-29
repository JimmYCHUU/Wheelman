// The Playbook page's words: its lessons in groups, each lesson's line and history, a proposed
// lesson's headline, the business facts in groups with their tags, the Menu's hint, and the way back
// to the conversation. Pure functions (no DOM, no globals); the tests import them in Node.
import { dayLabel, plural } from '../../lib/format.js';
import { scopeWords } from './lessons.js';
import { hashFor } from './route.js';

const newestFirst = (a, b) => (b.at || 0) - (a.at || 0) || (b.id || 0) - (a.id || 0);

/** { review, on, off, notRules }: the proposals waiting, the lessons in use and switched off (newest first), and those marked not a rule. */
export function lessonGroups({ lessons = [], proposals = [], notRules = [] } = {}) {
  const all = [...(lessons || [])].sort(newestFirst);
  return { review: proposals || [], on: all.filter((l) => !l.off), off: all.filter((l) => l.off), notRules: notRules || [] };
}

const channelWords = (channel) => (channel === 'email' ? 'Emails' : 'Texts');
const FROM = { remember: 'from your instruction', note: 'from your Could be better note', edit: 'from your repeated edits' };
const fromWords = (kind) => FROM[kind] || FROM.note;
/** A day in the middle of a sentence: "today", "yesterday" or "Thursday 29 October". */
const dayInLine = (at, now) => { const d = dayLabel(at, now); return /^(Today|Yesterday)$/.test(d) ? d.toLowerCase() : d; };

/** "Texts · price questions · from your instruction · Yesterday · used in 4 suggestions". */
export function lessonLine(l, now = Date.now()) {
  const n = l.usedCount || 0;
  const use = n ? 'used in ' + plural(n, 'suggestion') : 'not used yet';
  return [channelWords(l.channel), scopeWords(l.scope), fromWords(l.kind), l.at ? dayLabel(l.at, now) : '', use].filter(Boolean).join(' · ');
}

const MADE = { remember: 'Made from your instruction', note: 'Made from your Could be better note', edit: 'Kept from your repeated edits' };
const EVENT = { again: 'Remembered again', off: 'Switched off', on: 'Switched on', undone: 'Undone', kept: 'Kept again' };

/**
 * One line for each thing that happened to a lesson, oldest first. An edit lesson is made as it is
 * kept, so the Keep that follows its making is in the same line.
 */
export function historyLines(l, now = Date.now()) {
  const out = [];
  let before = null;
  for (const e of l.history || []) {
    const was = before;
    before = e.what;
    if (e.what === 'kept' && was === 'made') continue;
    const words = e.what === 'made' ? MADE[l.kind] || MADE.note : EVENT[e.what];
    if (words) out.push(words + ', ' + dayInLine(e.at, now));
  }
  return out;
}

/** Lesson evidence as stored, with the customer's name put back as "(name)". */
export const shownText = (s) => String(s ?? '').replace(/\{\{NAME\}\}/g, '(name)');
/** An edit's examples as stored: [{ before, after }], each with "(name)" for the customer's name. */
export const shownExamples = (list) => (list || []).map((e) => ({ before: shownText(e.before), after: shownText(e.after) }));

/**
 * A proposed lesson in words: { headline, applies, examples }. "You removed “kindly”, 4 times",
 * "Would apply to texts · every reply", and its examples { before, after } as stored.
 */
export function proposalWords(p) {
  const times = plural(p.count || 0, 'time');
  const headline = p.kind === 'replace' ? `You changed “${p.removed}” to “${p.added}”, ${times}`
    : p.kind === 'add' ? `You added “${p.added}”, ${times}` : `You removed “${p.removed}”, ${times}`;
  const applies = 'Would apply to ' + channelWords(p.channel).toLowerCase() + ' · ' + scopeWords(p.scope);
  return { headline, applies, examples: shownExamples(p.examples) };
}

/** { needs, working, confirmed }, each in the facts file's order. */
export function factGroups(facts) {
  const list = facts || [];
  const of = (status) => list.filter((f) => f.status === status);
  return { needs: of('needs_answer'), working: of('working'), confirmed: of('confirmed') };
}

/** A fact's state in words, with its tone: "Needs answer", "Working", "Confirmed today" or "Confirmed in your file". */
export function factTag(f, now = Date.now()) {
  if (f.status === 'needs_answer') return { text: 'Needs answer', tone: 'warn' };
  if (f.status === 'working') return { text: 'Working', tone: 'info' };
  return { text: f.at ? 'Confirmed ' + dayInLine(f.at, now) : 'Confirmed in your file', tone: 'good' };
}

/** The Menu's line under Playbook: what waits for Jim there, or what it holds when nothing waits. */
export function menuHint(status) {
  const review = (status && status.playbook && status.playbook.toReview) || 0;
  const needs = (status && status.facts && status.facts.needsAnswer) || 0;
  const parts = [
    review ? plural(review, 'lesson') + ' to review' : '',
    needs ? plural(needs, 'fact') + (needs === 1 ? ' needs an answer' : ' need an answer') : '',
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Lessons and business facts';
}

/** The address "Back to <section>" goes to: the conversation the store kept open, on its list. */
export const backHref = (s) => hashFor({ section: s.section, chip: s.chip, key: s.key });
