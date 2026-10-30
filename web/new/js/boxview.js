// What the message box holds and shows, and its one main button: the rules for one conversation's
// box, moved out of model.js so that boxsections.js, channel.js and trustview.js need nothing from
// it (no import cycle). With them, the box's text in pieces and the checks that still apply to it.
// Pure functions (no DOM, no globals); model.js re-exports them, the tests import them in Node.
import { blanksIn } from '../../lib/blank.js';
import { listTime, clock } from '../../lib/format.js';

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

export function checkLines(checks) {
  const at = (level) => (checks || []).filter((c) => c.level === level).map((c) => c.message);
  return { fails: at('fail'), warns: at('warn'), inputs: at('input') };
}

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
  const text = { phone: 'Answered on the phone', dashboard: 'Answered' + by + ' on the dashboard', auto: 'Answered by an auto-reply', facebook: 'Answered on Facebook', wheelman: "Answered with Wheelman's suggestion" }[answered.how];
  return text ? (text + ' ' + when).trim() : '';
}

/** What the suggestion box holds: the person's edit (a cleared box is ''), else what Wheelman wrote. */
export function boxText(draft) {
  if (!draft) return '';
  if (draft.edited !== null && draft.edited !== undefined) return draft.edited;
  return draft.reply || '';
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
