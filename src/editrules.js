// Edits made again and again, proposed as lessons (R9.3). What Wheelman wrote is compared word by
// word with what was copied; an edit made on three different suggestions waits in the Playbook with
// its examples, for Keep as a lesson or Not a rule, and either can be undone. A kept edit lesson is
// used as a Remember lesson is (src/learn.js ownerGuidance). The words of a proposal and its lesson
// are made here, by code: no AI is asked.
//
// Only replies copied from Wheelman and changed first are read (db.js editRows): the learned rows,
// which exist only where a conversation teaches. What counts as one edit, by the owner's ruling:
// a run of up to eight words removed, added or replaced, holding a word that is not a small word,
// and no figure, link, blank, placeholder or capitalised word inside a sentence (a name, a place,
// a car).

import { editRows, editsStamp, editDecisions, setEditDecision, clearEditDecision, insertEditLesson, editLessonOf, addLessonEvent, switchLesson, getLesson, lessonDetails } from './db.js';
import { SMALL_WORDS } from './learn.js';

/** On how many different suggestions an edit is made before it is proposed. */
export const EDIT_THRESHOLD = 3;
const MAX_WORDS = 8;
// Long replies with changes all through them are not compared: past this many word pairs the edit
// is no small one anyway. A learned reply is at most 900 characters, well inside it.
const MAX_CELLS = 60000;
const END = '\u0000'; // where a sentence ends, so that an edit in one sentence is never run into the next
// A blank or placeholder ([PRICE?], [CAR NAME?], [NAME], {{NAME}}) is one word, with what follows it.
const TOKEN = /\[[^\]\n]{0,40}\]\S*|\{\{[^}\n]{0,20}\}\}\S*|\S+/g;
const ENDS = /[.!?]["'”’)\]]*$/;
const OWN_BRACKETS = /^(?:\[[^\]\n]*\]|\{\{[^}\n]*\}\})/; // a blank's own question mark ends no sentence
const keyOf = (w) => w.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
const LINK = /http|www\.|\.(?:com|net|org|au)\b|\w\/\w/i;
const PLACEHOLDER = /[[\]]|\{\{|\}\}/;
const CAPITAL = /^[^\p{L}]*\p{Lu}/u;
const PRONOUN_I = /^[^\p{L}]*I(?:['’](?:m|ll|ve|d))?[^\p{L}]*$/u;
export const NOT_WAITING = 'That proposal is no longer waiting.';
export const SAY_WHICH = 'Say keep, not a rule or undo.';

/** A text's words, each with its sentence, and the keys compared (lower case, punctuation aside), with a mark at each sentence's end. */
function read(text) {
  const t = String(text || '').replace(/\r/g, '');
  const words = [], keys = [], wordAt = [];
  let s = 0, place = 0, prevEnd = 0;
  const close = () => {
    if (!place) return;
    words[words.length - 1].last = true;
    keys.push(END); wordAt.push(-1);
    s++; place = 0;
  };
  for (const m of t.matchAll(TOKEN)) {
    if (t.slice(prevEnd, m.index).includes('\n')) close();
    const w = m[0];
    words.push({ w, k: keyOf(w), at: m.index, end: m.index + w.length, s, first: place === 0, last: false });
    keys.push(words[words.length - 1].k); wordAt.push(words.length - 1);
    place++;
    prevEnd = m.index + w.length;
    if (ENDS.test(w.replace(OWN_BRACKETS, ''))) close();
  }
  close();
  return { text: t, words, keys, wordAt };
}

let table = new Uint16Array(1024);
/** The pairs of equal keys a longest common subsequence keeps, in order, or null when the texts are too far apart to compare. */
function matches(a, b) {
  let p = 0;
  while (p < a.length && p < b.length && a[p] === b[p]) p++;
  let q = 0;
  while (q < a.length - p && q < b.length - p && a[a.length - 1 - q] === b[b.length - 1 - q]) q++;
  const n = a.length - p - q, m = b.length - p - q;
  const pairs = [];
  for (let i = 0; i < p; i++) pairs.push([i, i]);
  if (n && m) {
    if (n * m > MAX_CELLS) return null;
    // L[i * w + j]: the longest common run of a[p+i..] and b[p+j..], in one table kept between calls.
    const w = m + 1;
    if (table.length < (n + 1) * w) table = new Uint16Array(Math.max((n + 1) * w, table.length * 2));
    const L = table;
    for (let j = 0; j <= m; j++) L[n * w + j] = 0;
    for (let i = n - 1; i >= 0; i--) {
      L[i * w + m] = 0;
      for (let j = m - 1; j >= 0; j--) L[i * w + j] = a[p + i] === b[p + j] ? L[(i + 1) * w + j + 1] + 1 : Math.max(L[(i + 1) * w + j], L[i * w + j + 1]);
    }
    for (let i = 0, j = 0; i < n && j < m;) {
      if (a[p + i] === b[p + j]) { pairs.push([p + i, p + j]); i++; j++; } else if (L[(i + 1) * w + j] >= L[i * w + j + 1]) i++; else j++;
    }
  }
  for (let k = q; k > 0; k--) pairs.push([a.length - k, b.length - k]);
  return pairs;
}

/** The text of a sentence span [first, last] of a read text, or '' for none. */
function sentences(doc, span) {
  if (!span) return '';
  const ws = doc.words.filter((w) => w.s >= span[0] && w.s <= span[1]);
  return ws.length ? doc.text.slice(ws[0].at, ws[ws.length - 1].end).trim() : '';
}

/**
 * The sentences around an edit, before and after. A side with no words of its own takes the sentence
 * the other side's words share with the word next to the edit; an added or removed sentence is shown
 * with the sentence before it.
 */
function around(A, B, rem, add, prev, next) {
  let a = rem.length ? [rem[0].s, rem[rem.length - 1].s] : null;
  let b = add.length ? [add[0].s, add[add.length - 1].s] : null;
  if (!a || !b) {
    const side = a ? 0 : 1;
    const full = a || b;
    let other = null;
    if (next && next[side].s === full[1]) other = next[1 - side].s;
    else if (prev && prev[side].s === full[0]) other = prev[1 - side].s;
    else if (prev) { full[0] = prev[side].s; other = prev[1 - side].s; } else if (next) { full[1] = next[side].s; other = next[1 - side].s; }
    const span = other === null ? null : [other, other];
    if (a) b = span; else a = span;
  }
  return { beforeSentence: sentences(A, a), afterSentence: sentences(B, b) };
}

/** Each run of words removed, added or both, with its words read and the sentences around it. */
function hunksOf(before, after) {
  const A = read(before), B = read(after);
  const pairs = matches(A.keys, B.keys);
  if (!pairs) return [];
  const all = [[-1, -1], ...pairs, [A.keys.length, B.keys.length]];
  const wordsOf = (doc, from, to) => doc.wordAt.slice(from, to).filter((i) => i >= 0).map((i) => doc.words[i]);
  // The nearest pair of equal words (not sentence ends) from all[k] on, in the step's direction.
  const nearest = (k, step) => {
    for (; k > 0 && k < all.length - 1; k += step) { const [i, j] = all[k]; if (A.wordAt[i] >= 0) return [A.words[A.wordAt[i]], B.words[B.wordAt[j]]]; }
    return null;
  };
  const out = [];
  for (let k = 1; k < all.length; k++) {
    const rem = wordsOf(A, all[k - 1][0] + 1, all[k][0]), add = wordsOf(B, all[k - 1][1] + 1, all[k][1]);
    if (rem.length || add.length) out.push({ rem, add, ...around(A, B, rem, add, nearest(k - 1, -1), nearest(k, 1)) });
  }
  return out;
}

/** A run's own words: a whole sentence keeps its punctuation, a part of one is trimmed of it. */
function runText(ws) {
  if (!ws.length) return '';
  const joined = ws.map((w) => w.w).join(' ');
  return ws[0].first && ws[ws.length - 1].last ? joined : joined.replace(/^[\s"'“‘(–—-]+|[\s.,;:!?"'”’)–—-]+$/g, '');
}

/**
 * The runs of words that change from `before` to `after`, word by word (capitals and punctuation
 * aside): [{ removed, added, beforeSentence, afterSentence }].
 */
export function editHunks(before, after) {
  return hunksOf(before, after).map((h) => ({ removed: runText(h.rem), added: runText(h.add), beforeSentence: h.beforeSentence, afterSentence: h.afterSentence }));
}

/** Whether a run removed and a run added are an edit to learn (the owner's ruling, at the top). */
function counts(rem, add) {
  if (rem.length > MAX_WORDS || add.length > MAX_WORDS) return false;
  const ws = [...rem, ...add];
  if (ws.some((w) => /\d/.test(w.w) || LINK.test(w.w) || PLACEHOLDER.test(w.w))) return false;
  if (ws.some((w) => !w.first && CAPITAL.test(w.w) && !PRONOUN_I.test(w.w))) return false;
  return ws.some((w) => (w.k.match(/\p{L}/gu) || []).length >= 3 && !SMALL_WORDS.has(w.k));
}

/**
 * The edits one hunk makes. A change is the run as it is. Words taken out or put in are also each of
 * their runs (taking out "would kindly" takes out "kindly"); a run that only ever comes inside a
 * longer one is dropped later, so a sentence removed is proposed as the sentence.
 */
function editsIn(h) {
  if (h.rem.length && h.add.length) return counts(h.rem, h.add) ? [{ rem: h.rem, add: h.add }] : [];
  const ws = h.rem.length ? h.rem : h.add;
  if (ws.length > MAX_WORDS) return [];
  const out = [];
  for (let i = 0; i < ws.length; i++) {
    for (let j = i + 1; j <= ws.length; j++) {
      const run = ws.slice(i, j);
      const e = h.rem.length ? { rem: run, add: [] } : { rem: [], add: run };
      if (counts(e.rem, e.add)) out.push(e);
    }
  }
  return out;
}

const inside = (small, big) => {
  for (let i = 0; i + small.length <= big.length; i++) if (small.every((k, n) => big[i + n] === k)) return true;
  return false;
};

/**
 * The edits made on `threshold` or more different suggestions and not decided yet, the most made
 * first. Pure. rows: [{ draft_id, item_key, channel, situations, draft_text, final_text, at }].
 * Each: { key, kind, removed, added, channel, scope, count, examples, itemKey }, where examples are
 * the newest three { before, after, at } and itemKey is the newest suggestion's conversation.
 */
export function proposalsFrom(rows, { decided = new Map(), threshold = EDIT_THRESHOLD } = {}) {
  const groups = new Map();
  for (const r of [...(rows || [])].sort((x, y) => (y.at || 0) - (x.at || 0))) {
    const channel = r.channel === 'email' ? 'email' : 'sms';
    for (const h of hunksOf(r.draft_text, r.final_text)) {
      for (const e of editsIn(h)) {
        const removed = runText(e.rem), added = runText(e.add);
        const kind = removed && added ? 'replace' : removed ? 'remove' : 'add';
        const key = `${channel}|${kind}|${removed.toLowerCase()}|${added.toLowerCase()}`;
        let g = groups.get(key);
        if (!g) groups.set(key, (g = { key, kind, channel, words: [...e.rem, ...e.add].map((w) => w.k), forms: new Map(), drafts: new Set(), scopes: new Set(), examples: [], itemKey: r.item_key }));
        if (g.drafts.has(r.draft_id)) continue; // each suggestion counts once
        g.drafts.add(r.draft_id);
        g.scopes.add((r.situations || [])[0] || '');
        const form = `${removed}\n${added}`;
        g.forms.set(form, (g.forms.get(form) || 0) + 1);
        if (g.examples.length < 3) g.examples.push({ before: h.beforeSentence, after: h.afterSentence, at: r.at });
      }
    }
  }
  const often = [...groups.values()].filter((g) => g.drafts.size >= threshold);
  // A run that only ever came inside a longer one made as often (decided or not) is that one's part.
  const part = (g) => g.kind !== 'replace' && often.some((o) => o !== g && o.kind === g.kind && o.channel === g.channel
    && o.words.length > g.words.length && o.drafts.size === g.drafts.size && inside(g.words, o.words) && [...o.drafts].every((d) => g.drafts.has(d)));
  return often.filter((g) => !decided.has(g.key) && !part(g))
    .map((g) => {
      // Shown in the words used most (a sentence's first word is capitalised only there).
      const [removed, added] = [...g.forms].reduce((best, f) => (f[1] > best[1] ? f : best))[0].split('\n');
      const [scope] = g.scopes;
      return { key: g.key, kind: g.kind, removed, added, channel: g.channel, scope: g.scopes.size === 1 && scope ? scope : 'any', count: g.drafts.size, examples: g.examples, itemKey: g.itemKey };
    })
    .sort((x, y) => y.count - x.count || y.examples[0].at - x.examples[0].at || (x.key < y.key ? -1 : 1));
}

// Worked out again only when the learned rows or the decisions change (the page asks with every status).
const cached = { stamp: null, list: [] };

/** The repeated edits waiting for the owner, the most made first. */
export function editProposals() {
  const stamp = editsStamp();
  if (stamp !== cached.stamp) Object.assign(cached, { list: proposalsFrom(editRows(), { decided: editDecisions() }), stamp });
  return cached.list;
}

/** The lesson a proposal becomes, in the owner's ruled words. */
function lessonText(p) {
  if (p.kind === 'remove') return `Leave out “${p.removed}”.`;
  if (p.kind === 'replace') return `Write “${p.added}”, not “${p.removed}”.`;
  return `Add “${p.added}” when it fits.`;
}

/** Switches off the lesson kept from this edit, if it is on, with its history's event. Returns it, or null. */
function switchOff(key, what, at) {
  const lesson = editLessonOf(key);
  return lesson && !lesson.off ? switchLesson(lesson.id, false, { what, at }) : null;
}

const detailed = (lesson) => (lesson ? lessonDetails([getLesson(lesson.id)])[0] : undefined);

/**
 * The owner's decision on a proposal: 'keep' makes it a lesson (Keep it after all, on one marked not
 * a rule), 'reject' marks it not a rule, 'undo' takes either back and it is proposed again. The
 * proposal is the one waiting, else the one stored with its decision. Returns { lesson } (the
 * lesson made or switched off, if any) or { status, error }.
 */
export function decideProposal(key, decision, { now = Date.now() } = {}) {
  if (!['keep', 'reject', 'undo'].includes(decision)) return { status: 400, error: SAY_WHICH };
  const proposal = editProposals().find((p) => p.key === key) || editDecisions().get(key)?.proposal;
  if (!proposal) return { status: 404, error: NOT_WAITING };
  if (decision === 'keep') {
    const id = insertEditLesson({ key, itemKey: proposal.itemKey, scope: proposal.scope, text: lessonText(proposal), evidence: { examples: proposal.examples, count: proposal.count }, at: now });
    addLessonEvent(id, 'kept', now);
    setEditDecision(key, 'kept', proposal, now);
    return { lesson: detailed({ id }) };
  }
  if (decision === 'reject') {
    setEditDecision(key, 'rejected', proposal, now);
    // Marked not a rule after it was kept: the lesson does not stay on.
    return { lesson: detailed(switchOff(key, 'off', now)) };
  }
  clearEditDecision(key);
  return { lesson: detailed(switchOff(key, 'undone', now)) };
}
