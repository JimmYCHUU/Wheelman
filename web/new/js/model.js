// The new page's model: pure functions (no DOM, no globals) that turn the server's data into what
// the page shows, in plain words. The browser loads this as a module and the tests import it in Node.
import { listTime, ago, clock, plural } from '../../lib/format.js';
import { listOf } from '../../lib/copy.js';
import { answeredWords } from './boxview.js';

export const SECTIONS = [
  { id: 'dashboard', label: 'Dashboard', ready: true },
  { id: 'marketplace', label: 'Marketplace', ready: true },
  { id: 'importquery', label: 'Imports', ready: true },
  { id: 'auction', label: 'Auction', ready: true },
];

/** A section's name on the page (Imports for the server's importquery); an unknown id as it is. */
export const sectionName = (id) => (SECTIONS.find((s) => s.id === id) || { label: id }).label;

// These ids are the server's `tab` values.
export const CHIPS = [
  { id: 'waiting', label: 'Needs reply' },
  { id: 'followups', label: 'Follow-ups' },
  { id: 'all', label: 'All' },
];

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

/** Segments (segments in boxview.js) joined back into text, each blank as written. */
export const joinSegments = (segs) => segs.map((x) => (x.kind === 'blank' ? x.raw : x.text)).join('');

/** A new array with the i-th blank turned into text; an empty value keeps the blank. */
export function fillBlank(segs, i, value) {
  const v = String(value ?? '').trim();
  if (!v || !segs[i] || segs[i].kind !== 'blank') return segs.slice();
  return segs.map((x, n) => (n === i ? { kind: 'text', text: v } : x));
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

// The message box's rules (boxview.js), kept importable from here.
export { answeredWords, boxText, mainAction, boxView, segments, wordsChanged, checkLines, liveChecks } from './boxview.js';
// The trust line under the box (trustview.js), kept importable from here.
export { trustLine, factLine } from './trustview.js';

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
