// The text in the message box in regions: the blocks Wheelman's rules added under the AI's words
// (the price reply, the invitation, the links asked for, the first-reply details, the sign-off, an
// auction offer), each found word for word in the text as it is now, and the text around them.
// Pure functions, no DOM; the editor draws each block as its own region with its label and Remove.
import { segments } from './model.js';
import { placeLine } from '../../lib/insert.js';

/**
 * Where a block's words start in the text, looked for from the end, ending at or before `before`:
 * only on lines of their own (on screen a block is a region of its own), else -1.
 */
function findBlock(text, words, before = text.length) {
  if (!words || before < words.length) return -1;
  for (let at = text.lastIndexOf(words, before - words.length); at !== -1; at = at ? text.lastIndexOf(words, at - 1) : -1) {
    const end = at + words.length;
    if ((at === 0 || text[at - 1] === '\n') && (end === text.length || text[end] === '\n')) return at;
  }
  return -1;
}

/**
 * The box text as segments(text) gives it, with each block of `parts` (the draft's parts; the AI's
 * own part is never one) whose words are in the text word for word made a region:
 * { kind: 'block', label, why, text, start, end, inner }, inner being its own segments, so a blank
 * in it is still a pill. A block not found (changed, or taken out) is plain text. Blocks are looked
 * for from the end, in their order, as the server found them in the reply.
 */
export function boxSegments(text, parts) {
  const s = String(text || '');
  const found = [];
  let before = s.length;
  for (const p of [...(parts || [])].reverse()) {
    if (!p || p.kind === 'ai' || !p.text) continue;
    const at = findBlock(s, p.text, before);
    if (at === -1) continue;
    found.unshift({ kind: 'block', label: p.label || '', why: p.why || '', text: p.text, start: at, end: at + p.text.length, inner: segments(p.text) });
    before = at;
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

/** Where the block is in the text: at its start if its words are still there, else found again from the end; -1 when gone. */
function placeOf(text, block, words) {
  const start = Number.isInteger(block.start) ? block.start : -1;
  if (start >= 0 && text.slice(start, start + words.length) === words) return start;
  return findBlock(text, words);
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

/** The block's words put in at `at`, with a blank line between them and the text on either side. */
function putIn(s, words, at) {
  const before = s.slice(0, at);
  const after = s.slice(at);
  return before + (before ? '\n\n' : '') + words + (!before && after ? '\n\n' : '') + after;
}

/**
 * Put back: the block in the text again. was: the text it was removed from. Nothing typed since,
 * it is exactly as it was. Otherwise it goes back at its place when the text before that place is
 * unchanged, or before what followed it when that is unchanged; failing both, before the sign-off
 * or the first-reply details, else at the end.
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
