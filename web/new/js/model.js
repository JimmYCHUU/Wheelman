// The new page's model: pure functions (no DOM, no globals) that turn the server's data into what
// the page shows, in plain words. The browser loads this as a module and the tests import it in Node.
import { blanksIn } from '../../lib/blank.js';
import { listTime, ago, clock, plural } from '../../lib/format.js';
import { listOf } from '../../lib/copy.js';

export const SECTIONS = [
  { id: 'dashboard', label: 'Dashboard', ready: true },
  { id: 'marketplace', label: 'Marketplace', ready: true },
  { id: 'importquery', label: 'Imports', ready: true },
  { id: 'auction', label: 'Auction', ready: true },
];

// These ids are the server's `tab` values.
export const CHIPS = [
  { id: 'waiting', label: 'Needs reply' },
  { id: 'followups', label: 'Follow-ups' },
  { id: 'all', label: 'All' },
];

/**
 * Who answered a customer instead of us, in words: "Answered on the phone 10:42". The time is the clock
 * today and the list's own time on an earlier day (listTime), a day word in lower case mid-sentence;
 * left out when it is shownAt, the time already shown beside the words. '' for nobody, or a way not known.
 */
export function answeredWords(answered, now, shownAt = '') {
  if (!answered) return '';
  const day = listTime(answered.at, now);
  const when = day === shownAt ? '' : day === 'Yesterday' ? 'yesterday' : day;
  const by = answered.by ? ' by ' + answered.by : '';
  const text = { phone: 'Answered on the phone', dashboard: 'Answered' + by + ' on the dashboard', auto: 'Answered by an auto-reply', wheelman: "Answered with Wheelman's suggestion" }[answered.how];
  return text ? (text + ' ' + when).trim() : '';
}

/** What one list row shows. doneAnchor is the anchor of the row just copied, waiting to show on the dashboard. */
export function rowView(row, { now, doneAnchor } = {}) {
  const done = doneAnchor !== undefined && doneAnchor !== null && doneAnchor === row.anchor;
  const p = row.preview || {};
  let preview = p.text || '';
  if (!preview && p.media) preview = 'Photo';
  else if (p.who === 'us') preview = 'You: ' + preview;
  const when = listTime(row.lastAt, now);
  let reason = '';
  if (done) reason = 'Copied, waiting for it to show on the dashboard';
  else if (row.followUp) reason = 'Follow-up: ' + row.followUp.reason;
  else if (row.state === 'answered' && answeredWords(row.answered, now)) reason = answeredWords(row.answered, now, when);
  else if (row.flag === 'fail') reason = 'Check failed';
  else if (row.flag === 'input') reason = 'Blank to fill';
  else if (row.flag === 'error') reason = 'Not written yet';
  else if (row.phoneOnly) reason = 'Phone only';
  return {
    key: row.key,
    name: row.name || row.phone || row.email || 'Unknown number',
    when,
    car: row.car || '',
    preview,
    reason,
    unread: done ? 0 : row.unread,
    done,
  };
}

/** Who a thread message is from, or null for an event line. */
export function whoLabel(m, customerName) {
  if (m.event) return null;
  if (m.who === 'customer') return customerName || 'Customer';
  if (m.auto) return 'Auto-reply';
  if (m.phone) return 'Us, from the phone';
  if (m.by) return 'Us · ' + m.by;
  return 'Us';
}

/** Text split into plain text and blanks: [{kind:'text',text}|{kind:'blank',label,raw}]. */
export function segments(text) {
  const s = String(text || '');
  const out = [];
  let at = 0;
  for (const b of blanksIn(s)) {
    if (b.index > at) out.push({ kind: 'text', text: s.slice(at, b.index) });
    out.push({ kind: 'blank', label: b.kind, raw: b.text });
    at = b.index + b.length;
  }
  if (at < s.length) out.push({ kind: 'text', text: s.slice(at) });
  return out;
}

export const joinSegments = (segs) => segs.map((x) => (x.kind === 'blank' ? x.raw : x.text)).join('');

/** A new array with the i-th blank turned into text; an empty value keeps the blank. */
export function fillBlank(segs, i, value) {
  const v = String(value ?? '').trim();
  if (!v || !segs[i] || segs[i].kind !== 'blank') return segs.slice();
  return segs.map((x, n) => (n === i ? { kind: 'text', text: v } : x));
}

/** What the suggestion box holds: the person's edit (a cleared box is ''), else what Wheelman wrote. */
export function boxText(draft) {
  if (!draft) return '';
  if (draft.edited !== null && draft.edited !== undefined) return draft.edited;
  return draft.reply || '';
}

export function checkLines(checks) {
  const at = (level) => (checks || []).filter((c) => c.level === level).map((c) => c.message);
  return { fails: at('fail'), warns: at('warn'), inputs: at('input') };
}

/** The one main button. */
export function mainAction({ text, checks, overridden }) {
  const blocked = !overridden && (checks || []).some((c) => c.level === 'fail');
  const n = blanksIn(text).length;
  const fill = n === 1 ? 'Fill 1 blank' : 'Fill ' + n + ' blanks';
  // A blank comes first even past a failed check, but nothing is copied until the check is dealt with.
  if (blocked) return n ? { kind: 'fill', label: fill, secondary: null } : { kind: 'blocked', label: 'Fix the check first', secondary: null };
  if (n) return { kind: 'fill', label: fill, secondary: n === 1 ? 'Copy with the blank' : 'Copy with the blanks' };
  return { kind: 'copy', label: 'Copy reply', secondary: null };
}

export function statusWords(status, now) {
  const { missing = [], syncing, drafting, lastSync } = status || {};
  if (missing.length) return { tone: 'bad', text: 'Set-up needed: ' + listOf(missing) };
  if (syncing) return { tone: 'busy', text: 'Checking for new messages' };
  if (drafting) return { tone: 'busy', text: 'Writing' };
  if (lastSync && lastSync.ok) return { tone: 'ok', text: 'Up to date, checked ' + ago(lastSync.at, now) };
  if (lastSync) return { tone: 'bad', text: 'Dashboard not reached since ' + clock(lastSync.at) };
  return { tone: 'busy', text: 'Starting' };
}

/**
 * What a screen reader should be told about the status, or null for nothing. The words change every
 * refresh ("checked 1 min ago"), so only a change between ok and a problem, or new words on a problem, is announced; busy never is.
 * prev is the last status that was not busy (null on first sight, when only a problem is worth saying).
 */
export function statusAnnouncement(prev, next) {
  if (next.tone === 'busy') return null;
  if (!prev) return next.tone === 'bad' ? next.text : null;
  if (prev.tone !== next.tone) return next.text;
  return next.tone === 'bad' && prev.text !== next.text ? next.text : null;
}

/** "Write it instead" choices: at most 3, best first, never the one already in use. */
export function insteadOptions(item) {
  const current = item.template || '';
  const out = current !== '' ? [{ id: '', label: 'A reply to what they wrote' }] : [];
  const all = item.templates || [];
  const ordered = [...all.filter((t) => t.best === true), ...all.filter((t) => t.best !== true)];
  for (const t of ordered) {
    if (out.length >= 3) break;
    if (t.id !== current) out.push({ id: t.id, label: t.label });
  }
  return out;
}

export function wordCount(text) {
  const s = String(text || '');
  const words = s.trim() ? s.trim().split(/\s+/).length : 0;
  return { words, texts: Math.ceil(s.length / 160) };
}

// ---- the message box

// A blank's label in words, for the pill and for a screen reader (the old page's names, web/app.js).
const BLANK_WORDS = {
  PRICE: 'the price', 'TRADE-IN VALUE': 'the trade-in value', 'DELIVERY COST': 'the delivery cost', DATE: 'the date',
  CHECK: 'something to confirm', 'DEPOSIT LINK': 'the deposit link', SHIP: "the ship's name", 'WHICH CAR': 'which car',
  'WHICH AUCTION': 'which auction', KM: 'the kilometres', GRADE: 'the auction grade', 'HOW MANY': 'how many',
  ELIGIBILITY: 'whether it can be imported', 'LANDED COST': 'the landed cost', DEPOSIT: 'the deposit', TIMELINE: 'the timeframe',
};
export const blankWords = (label) => BLANK_WORDS[label] || 'the ' + String(label || '').toLowerCase();

/**
 * Whether the person changed the words of the suggestion, not only filled its blanks: each blank
 * may hold anything of one character or more, every other part must be as Wheelman wrote it.
 */
export function wordsChanged(reply, text) {
  const r = String(reply || '');
  const t = String(text ?? '');
  if (r === t) return false;
  // The suggestion's fixed parts: before the first blank, between the blanks, after the last one.
  const fixed = [''];
  for (const s of segments(r)) {
    if (s.kind === 'blank') fixed.push('');
    else fixed[fixed.length - 1] += s.text;
  }
  if (fixed.length === 1) return true;
  const head = fixed[0];
  const tail = fixed[fixed.length - 1];
  if (!t.startsWith(head) || !t.endsWith(tail)) return true;
  const end = t.length - tail.length;
  let at = head.length;
  for (const part of fixed.slice(1, -1)) {
    const i = t.indexOf(part, at + 1);
    if (i === -1 || i + part.length > end) return true;
    at = i + part.length;
  }
  return end - at < 1;
}

/**
 * The checks that still apply to the text in the box. The blank line goes (the pills show the
 * blanks), and so does the "all match" line. Once the person has changed the words, a check about
 * words that are no longer there goes, and so does a warning about the suggestion as a whole (its
 * length, say), which was never about what they typed.
 */
export function liveChecks(draft, text) {
  if (!draft) return [];
  const t = String(text ?? '');
  const changed = wordsChanged(draft.reply, t);
  const there = (c) => !(c.tokens && c.tokens.length) || c.tokens.some((k) => t.includes(k));
  return (draft.checks || []).filter((c) => {
    if (c.level === 'ok' || c.code === 'marker') return false;
    if (!changed) return true;
    if (c.level === 'warn') return (c.tokens && c.tokens.length > 0 && there(c)) || c.code === 'auction';
    return there(c);
  });
}

const PUT_BACK = { label: 'Put back in Needs reply', act: 'put-back', main: false };
const PUT_BACK_FOLLOW_UP = { label: 'Put back in Follow-ups', act: 'restore-followup', main: false };

/**
 * What the message box shows for the open conversation: the editor, or one sentence with at most
 * one button (act names what it does), and whether the Tell Wheelman line goes with it.
 * writing: a write this page started. typed: the person has typed text, which stays in the editor
 * whatever arrives (a new message with no suggestion yet, Wheelman writing in the background, or a
 * failure); only a write from here, done, opted out and dismissed take the box over. A suggestion
 * that could not be written beside text the person typed (now, or saved before a reload) is told in
 * the editor view's failure line, and the text stays. elsewhere: true on the editor view when the
 * customer was answered somewhere else and the text kept is no reply anyone needs.
 */
export function boxView({ item, writing = false, done = false, doneAt = null, typed = false, now } = {}) {
  if (!item) return { kind: 'none' };
  const d = item.draft || null;
  const ready = !!d && d.status === 'ready';
  const fu = item.followUp || null;
  const mine = !!fu && item.anchor === 'fu:' + fu.id;
  const say = (sentence, button = null, o = {}) => ({ kind: 'quiet', tone: '', sentence, button, tell: false, ...o });
  const failed = (first) => say((first + ' ' + (d.error || '')).trim(), { label: 'Try again', act: 'retry', main: true }, { tone: 'bad', tell: true });
  const isFailed = !!d && d.status === 'failed';
  const kept = typed || (isFailed && typeof d.edited === 'string' && d.edited.trim() !== '');
  const failure = isFailed ? ((mine ? 'The follow-up could not be written. ' : 'A suggestion could not be written. ') + (d.error ? d.error + ' ' : '') + 'Your text is kept.') : '';

  if (writing) return { kind: 'writing' };
  if (done) return say(doneAt ? 'Copied at ' + clock(doneAt) + '.' : 'Copied.', mine ? PUT_BACK_FOLLOW_UP : PUT_BACK, { tone: 'good' });
  if (fu && fu.done === 'copied') return say('You copied this follow-up. It has left Follow-ups.', PUT_BACK_FOLLOW_UP);
  if (fu && fu.done) return say('You dismissed this follow-up.', PUT_BACK_FOLLOW_UP);
  if (item.state === 'optout') return say('This customer asked not to be contacted. Do not reply.', null, { tone: 'bad' });
  if (item.dismissed && item.state === 'awaiting') {
    return say('You dismissed this conversation. It comes back by itself if the customer writes again.', { label: 'Put back in Needs reply', act: 'restore', main: false });
  }
  // Answered (a follow-up in hand is told as itself). A suggestion written after the answer was asked
  // for by the person, so it is theirs to use. Answered with Wheelman's own suggestion, copied then
  // sent, nothing is waiting and nothing is shown again, whatever is typed (it stays in the store).
  // Answered by someone else, what the person typed stays; else nothing is waiting.
  const words = item.state === 'answered' && !fu ? answeredWords(item.answered, now) : '';
  const asked = !!words && !!d && d.createdAt > item.answered.at;
  const anyway = { label: 'Write a reply anyway', act: 'write', main: false };
  if (words && !asked && item.answered.how === 'wheelman') return say(words + '. No reply needed.', anyway, { tell: true });
  const elsewhere = !!words && !asked;
  const own = typed || (typeof d?.edited === 'string' && d.edited.trim() !== '');
  const context = mine ? 'Follow-up: ' + fu.reason : elsewhere && own ? 'The customer was answered elsewhere. Your text is kept.' : '';
  if (kept || (elsewhere && own)) return { kind: 'editor', context, ...(elsewhere && own ? { elsewhere: true } : {}), ...(failure ? { failure } : {}) };
  if (item.writing) return { kind: 'writing' };
  if (fu) {
    if (mine && ready) return { kind: 'editor', context: 'Follow-up: ' + fu.reason };
    if (mine && d && d.status === 'failed') return failed('The follow-up could not be written.');
    return say(fu.reason + '. A follow-up is due. Nothing is sent by itself: write it, check it, then copy it.',
      { label: 'Write the follow-up', act: 'write-followup', main: true }, { tell: true });
  }
  if (elsewhere) return say(words + '. No reply needed.', anyway, { tell: true, suggestion: ready ? boxText(d) : item.lastSuggestion || '' });
  if (item.state !== 'awaiting' && !ready) {
    return say(item.state === 'answered' ? 'We have replied. Nothing is waiting here.' : item.note || 'No reply needed.', anyway, { tell: true });
  }
  if (d && d.status === 'failed') return failed('A suggestion could not be written.');
  if (!ready) return say('No suggestion yet.', { label: 'Write it now', act: 'write', main: true }, { tell: true });
  return { kind: 'editor', context: '' };
}

// The box's view from the store's state, the message box's and the run bar's: boxView with each section's own states (boxsections.js).
export { boxViewOf } from './boxsections.js';

/** "48 words", and "· about 2 texts" once the reply runs past one text message. */
export function wordsLine(text) {
  const { words, texts } = wordCount(text);
  return plural(words, 'word') + (texts > 1 ? ' · about ' + texts + ' texts' : '');
}

/** The save note beside the word count. An edit saved before a reload says so too. */
export function saveWords({ save, draft, typed }) {
  const s = save || {};
  if (s.state === 'saving') return 'Saving…';
  if (s.state === 'failed') return 'Not saved yet. Your text is kept in this window.';
  if (s.state === 'saved') return 'Your changes are saved · ' + clock(s.at);
  if (typed === null && draft && draft.edited !== null && draft.edited !== undefined && draft.editedAt) return 'Your changes are saved · ' + clock(draft.editedAt);
  return '';
}

// Beside no suggestion, the text is all the person's own. Beside one, any difference (typing, or a
// block removed) means the check no longer holds.
const UNCHECKED = 'What you typed has not been checked.';
const CHANGED = 'Changed since it was checked.';

/** A traced figure with the sentence's own punctuation taken off the end. */
const shown = (v) => String(v).replace(/[.,;:!?]+$/, '');

/**
 * The trust line under the message box. Text that differs from Wheelman's own, typed or with a block
 * removed, is never called checked, whatever the facts say. For Wheelman's own text it counts the
 * facts the server traced (only those it listed, so the count may understate, never overstate),
 * counts the ones not in the records, and is green only when no check is failing, warning or
 * waiting for a blank.
 */
export function trustLine(draft, text) {
  const t = String(text ?? '');
  if (!t.trim()) return null;
  const ready = draft && draft.status === 'ready' ? draft : null;
  if (!ready) return { tone: 'none', text: UNCHECKED };
  if (t !== ready.reply) return { tone: 'none', text: CHANGED };
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

/** One fact in the opened list: where it came from, or in red words that it is not in the records. */
export function factLine(f) {
  const value = shown(f.value);
  if (f.ok === false) return `${value} · not in your records`;
  const name = f.label && f.label !== f.value ? `${f.label} · ` : '';
  return `${name}${value} · from ${f.source}`;
}

/** Pasted text as plain text: Windows line ends and non-breaking spaces made plain. */
export const plainPaste = (text) => String(text || '').replace(/\r\n?/g, '\n').replace(/ /g, ' ');

const STAGE_STEPS = ['Enquiry', 'Inspection booked', 'Seen the car', 'Deposit', 'Sold'];
const DEAL_STEP = { deposit_paid: 3, payment_pending: 3, paid_in_full: 4, delivered: 4 };
const STATUS_STEP = { INSPECTION: 1, INSPECTION_DONE: 2, DEPOSIT_RECEIVED: 3, CAR_SOLD: 4 };

/** How far the customer has got: the sale record first, then the lead status, else an enquiry. */
export function stageLine(item) {
  const fromDeal = DEAL_STEP[item?.deal?.stage];
  if (fromDeal !== undefined) return { steps: STAGE_STEPS, current: fromDeal, source: 'From the sale record' };
  const fromStatus = STATUS_STEP[item?.leadStatus];
  if (fromStatus !== undefined) return { steps: STAGE_STEPS, current: fromStatus, source: 'From the lead status' };
  return { steps: STAGE_STEPS, current: 0, source: '' };
}

const STATUS_NAME = { NEW: 'New enquiry' };

/** The lead status in words: the stage line's own step for the ones it knows, else the status made plain. */
export function leadStatusWords(status) {
  const s = String(status || '').trim().toUpperCase();
  if (!s) return '';
  if (STATUS_STEP[s] !== undefined) return STAGE_STEPS[STATUS_STEP[s]];
  if (STATUS_NAME[s]) return STATUS_NAME[s];
  const plain = s.replace(/_/g, ' ').toLowerCase();
  return plain[0].toUpperCase() + plain.slice(1);
}

/** Where a customer came from, in words (the old page's list). */
export function sourceWords(source) {
  const s = String(source || '').trim();
  if (!s) return '';
  if (/^carsales$/i.test(s)) return 'Carsales';
  if (/sms connect/i.test(s)) return 'Carsales (text message)';
  if (/call connect/i.test(s)) return 'Carsales (phone call)';
  if (/dealer studio|autotrader/i.test(s)) return 'Autotrader';
  if (/caravancamping/i.test(s)) return 'Caravan Camping Sales';
  if (/finance/i.test(s)) return 'Website, finance application';
  if (/trade.?in/i.test(s)) return 'Website, trade-in request';
  if (/inspection|test drive/i.test(s)) return 'Website, inspection booking';
  if (/purchase/i.test(s)) return 'Website, purchase steps';
  if (/contact/i.test(s)) return 'Website, contact form';
  if (/chat box/i.test(s)) return 'Website, chat box';
  if (/waitlist/i.test(s)) return 'Website, waitlist';
  if (/^(customer|regular user)$/i.test(s)) return 'Website account';
  return s.replace(/_/g, ' ');
}

// The providers as the AI choice names them (PROVIDERS in src/aimodels.js; test/aimodels.test.js keeps the two the same).
const PROVIDER_WORDS = { gemini: 'Gemini (Google)', openai: 'ChatGPT (OpenAI)', openrouter: 'OpenRouter' };

/** An AI provider in words; '' for one this page does not know. */
export const providerWords = (id) => PROVIDER_WORDS[id] || '';

/** Who wrote the suggestion, for What Wheelman used: the model and its provider, or the wording with no AI. */
export function writtenBy(d) {
  if (d.provider === 'none') return 'Written from ' + (d.model || 'your wording') + ', with no AI.';
  const from = providerWords(d.provider);
  return 'Written by ' + (d.model || 'the AI model') + (from ? ', from ' + from : '') + '.';
}

export { rememberOffer, scopeWords, ruleWords, lessonLines } from './lessons.js';
