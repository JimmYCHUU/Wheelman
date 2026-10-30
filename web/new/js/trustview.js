// The trust line under the message box, with the business facts a suggestion used, and the line above
// the box for a fact that needs an answer. The trust line moved here from model.js, which passes
// trustLine and factLine on; this file needs nothing from model.js, so there is no import cycle.
// Pure functions (no DOM, no globals); the tests import them in Node.
import { blanksIn } from '../../lib/blank.js';
import { dayLabel } from '../../lib/format.js';
import { listOf } from '../../lib/copy.js';
import { checkLines, liveChecks } from './boxview.js';
import { playbookHash } from './playbookroute.js';

// Beside no suggestion, the text is all the person's own. Beside one, any difference (typing, or a
// block removed) means the check no longer holds.
const UNCHECKED = 'What you typed has not been checked.';
const CHANGED = 'Changed since it was checked.';

/** A traced figure with the sentence's own punctuation taken off the end. */
const shown = (v) => String(v).replace(/[.,;:!?]+$/, '');

const FROM_FACTS = 'your business facts';
const quoted = (title) => '“' + title + '”';

/** One business fact the suggestion used, as an entry in the trust line's list. */
const topicEntry = (t) => ({ label: t.title, value: '', source: FROM_FACTS, ok: true, topic: { status: t.status, at: t.at ?? null } });

/** The figures and links the server traced, as the trust line counted them before business facts. */
function figuresLine(ready, t) {
  const facts = Array.isArray(ready.facts) ? ready.facts : [];
  if (!facts.length) return { tone: 'none', text: 'No figures or links to check.' };
  const n = (k) => (k === 1 ? '1 fact' : `${k} facts`);
  const notFound = facts.filter((f) => f.ok === false).length;
  if (notFound) return { tone: 'bad', text: `${n(notFound)} not in your records`, facts };
  // Green only while nothing else is wrong: no failed check, no warning, no blank to fill.
  const lines = checkLines(liveChecks(ready, t));
  const clear = !lines.fails.length && !lines.warns.length && !lines.inputs.length && !blanksIn(t).length;
  return { tone: clear ? 'good' : 'none', text: `${n(facts.length)} checked`, facts };
}

/**
 * The trust line under the message box. Text that differs from Wheelman's own, typed or with a block
 * removed, is never called checked, whatever the facts say. For Wheelman's own text it counts the
 * facts the server traced (only those it listed, so the count may understate, never overstate),
 * counts the ones not in the records, and is green only when no check is failing, warning or
 * waiting for a blank. The business facts the suggestion used (draft.topics) are named after the
 * figures' words, or alone when it has no figure or link, each one more entry in the list; the tone
 * is the figures'.
 */
export function trustLine(draft, text) {
  const t = String(text ?? '');
  if (!t.trim()) return null;
  const ready = draft && draft.status === 'ready' ? draft : null;
  if (!ready) return { tone: 'none', text: UNCHECKED };
  if (t !== ready.reply) return { tone: 'none', text: CHANGED };
  const line = figuresLine(ready, t);
  const topics = Array.isArray(ready.topics) ? ready.topics : [];
  if (!topics.length) return line;
  const uses = 'Uses your business ' + (topics.length === 1 ? 'fact ' : 'facts ') + listOf(topics.map((x) => quoted(x.title))) + '.';
  return { tone: line.tone, text: line.facts ? line.text + '. ' + uses : uses, facts: [...(line.facts || []), ...topics.map(topicEntry)] };
}

/**
 * A business fact in the opened list: where it came from, and its state. "confirmed today" (or the
 * day) once it was answered in the Playbook, "still Working" until it is confirmed, and nothing more
 * for the facts file's own answer.
 */
export function topicLine(f, now = Date.now()) {
  const line = f.label + ' · from ' + f.source;
  const { status, at } = f.topic || {};
  if (status === 'working') return line + ', still Working';
  if (!at) return line;
  const day = dayLabel(at, now);
  return line + ', confirmed ' + (/^(Today|Yesterday)$/.test(day) ? day.toLowerCase() : day);
}

/** One fact in the opened list: where it came from, or in red words that it is not in the records. */
export function factLine(f, now) {
  if (f.topic) return topicLine(f, now);
  const value = shown(f.value);
  if (f.ok === false) return `${value} · not in your records`;
  const name = f.label && f.label !== f.value ? `${f.label} · ` : '';
  return `${name}${value} · from ${f.source}`;
}

/**
 * The line above the box for the first business fact the suggestion left a blank for, or null:
 * { words, href, rewrite, answered }. href opens the fact in the Playbook (Answer it). Once it is
 * answered, nothing is written again by itself: rewrite offers Write it again, only while the box is
 * untouched (typed is null and no edit was saved before a reload), so no typed word is written over.
 */
export function factAsk(item, typed) {
  const d = item && item.draft;
  const open = d && Array.isArray(d.openTopics) ? d.openTopics : [];
  if (!open.length) return null;
  const { title, answered } = open[0];
  const href = playbookHash('facts', title);
  if (!answered) return { words: quoted(title) + ' needs your answer in the Playbook, so the reply has a blank for it.', href, rewrite: false, answered: false };
  const untouched = typed === null && (d.edited === null || d.edited === undefined);
  return { words: quoted(title) + ' has your answer now. Write the reply again to use it.', href, rewrite: untouched, answered: true };
}
