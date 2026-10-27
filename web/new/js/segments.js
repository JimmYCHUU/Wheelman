// The text in the message box in regions: the blocks Wheelman's rules added under the AI's words
// (the price reply, the invitation, the links asked for, the first-reply details, the sign-off, an
// auction offer), each found in the text as it is now, and the text around them. Pure functions,
// no DOM; the editor draws each block as its own region with its label and Remove.
import { segments } from './model.js';
import { placeLine } from '../../lib/insert.js';

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * A block's words as a pattern: its text word for word, and each blank in it anything on its own
 * line, so a blank filled in (the price, the deposit link) keeps the block. A block that is only
 * blanks has no words of its own to be known by, so it is matched word for word, as is any block
 * when `exact`.
 */
function blockPattern(words, exact) {
  const segs = segments(words);
  const own = !exact && segs.some((x) => x.kind === 'text' && x.text.trim());
  const body = own ? segs.map((x) => (x.kind === 'blank' ? '[^\\n]*?' : escape(x.text))).join('') : escape(words);
  return new RegExp(body + '(?=\\n|$)', 'y');
}

/**
 * The last stretch of the text that is the block, ending at or before `before`, on lines of its
 * own (on screen a block is a region of its own): { start, end }, else null.
 */
function findBlock(text, words, before = text.length, exact = false) {
  if (!words) return null;
  const re = blockPattern(words, exact);
  // Every line start, from the last one back.
  for (let at = text.lastIndexOf('\n') + 1; ; at = at >= 2 ? text.lastIndexOf('\n', at - 2) + 1 : 0) {
    re.lastIndex = at;
    const m = at <= before ? re.exec(text) : null;
    if (m && at + m[0].length <= before) return { start: at, end: at + m[0].length };
    if (at === 0) return null;
  }
}

/**
 * The box text as segments(text) gives it, with each block of `parts` (the draft's parts; the AI's
 * own part is never one) found in the text made a region: { kind: 'block', label, why, text, start,
 * end, inner }. text is the block as it is in the box (a blank in it may be filled in), and inner its
 * own segments, so a blank still in it is still a pill. A block whose words were changed, or taken
 * out, is plain text. Blocks are looked for from the end, in their order, as the server found them.
 */
export function boxSegments(text, parts) {
  const s = String(text || '');
  const found = [];
  let before = s.length;
  for (const p of [...(parts || [])].reverse()) {
    if (!p || p.kind === 'ai' || !p.text) continue;
    const at = findBlock(s, p.text, before);
    if (!at) continue;
    const words = s.slice(at.start, at.end);
    found.unshift({ kind: 'block', label: p.label || '', why: p.why || '', text: words, start: at.start, end: at.end, inner: segments(words) });
    before = at.start;
  }
  const out = [];
  let at = 0;
  for (const b of found) {
    out.push(...segments(s.slice(at, b.start)), b);
    at = b.end;
  }
  out.push(...segments(s.slice(at)));
  return out;
}

/** Where the block is in the text: at its start if its words are still there, else found again from the end, word for word; -1 when gone. */
function placeOf(text, block, words) {
  const start = Number.isInteger(block.start) ? block.start : -1;
  if (start >= 0 && text.slice(start, start + words.length) === words) return start;
  const at = findBlock(text, words, text.length, true);
  return at ? at.start : -1;
}

/**
 * The text without the block (its text, start and end as the editor has it now) and without the
 * blank line that joined it: the one before it, or the one after it when it is first. at: where
 * it was in what is left (-1, and the text unchanged, when it is not in the text).
 */
export function cutBlock(text, block) {
  const s = String(text ?? '');
  const words = String((block && block.text) || '');
  const start = words ? placeOf(s, block, words) : -1;
  if (start === -1) return { text: s, at: -1 };
  const end = start + words.length;
  let from = start;
  let to = end;
  if (start > 0) {
    while (from > 0 && start - from < 2 && s[from - 1] === '\n') from--;
  } else {
    while (to < s.length && to - end < 2 && s[to] === '\n') to++;
  }
  return { text: s.slice(0, from) + s.slice(to), at: from };
}

/** The text without the block and the blank line that joined it (see cutBlock). */
export const removeBlock = (text, block) => cutBlock(text, block).text;

/** A place a block can go as a region of its own: the start, the end, or just before a line break. */
const onItsOwnLine = (s, at) => at === 0 || at === s.length || s[at] === '\n';

/** How many line breaks (up to two) a stretch of text ends with, or starts with. */
const breaksAtEnd = (s) => (s.endsWith('\n\n') ? 2 : s.endsWith('\n') ? 1 : 0);
const breaksAtStart = (s) => (s.startsWith('\n\n') ? 2 : s.startsWith('\n') ? 1 : 0);

/**
 * The block's words put in at `at`, with a blank line between them and the text on each side:
 * only the line breaks missing for that are added, and none on a side with no text.
 */
function putIn(s, words, at) {
  const before = s.slice(0, at);
  const after = s.slice(at);
  const lead = before.trim() ? '\n'.repeat(2 - breaksAtEnd(before)) : '';
  const tail = after.trim() ? '\n'.repeat(2 - breaksAtStart(after)) : '';
  return before + lead + words + tail + after;
}

/**
 * Put back: the block in the text again. was: the text it was removed from. Nothing typed since,
 * it is exactly as it was. Otherwise it goes back at its place when the text before that place is
 * unchanged, or before what followed it when that is unchanged; failing both, before the sign-off
 * or the first-reply details, else at the end. A blank line always stands between it and the text
 * on each side.
 */
export function restoreBlock(text, block, was) {
  const s = String(text ?? '');
  const { text: left, at } = cutBlock(was, block);
  if (at === -1) return s;
  if (s === left) return String(was);
  const head = left.slice(0, at);
  const tail = left.slice(at);
  let place = placeLine(s, '', null).at;
  if (s.startsWith(head) && onItsOwnLine(s, at)) place = at;
  else if (s.endsWith(tail) && onItsOwnLine(s, s.length - tail.length)) place = s.length - tail.length;
  return putIn(s, block.text, place);
}

/**
 * Put back, from the toast: the text the box should hold now, or null when the reply the block came
 * out of is no longer in the box. now: the box as it is ({ text, id }: its text and the suggestion's
 * id), null when it is gone (another conversation). removal: { text, id, block, was }: the box text
 * and the suggestion just after the remove, the block, and the text it came out of. It goes back
 * when the box text is unchanged since the remove, whatever the suggestion is now, or when the same
 * suggestion is still there, into the text as it is by then.
 */
export function putBackText(now, removal) {
  if (!now || (now.text !== removal.text && now.id !== removal.id)) return null;
  return restoreBlock(now.text, removal.block, removal.was);
}
