// The editor's text in pieces, as pure functions (no DOM), for web/new/js/ui/editor.js and the tests:
// an editable text piece for each run of text, a pill for each blank, and the blocks Wheelman's rules
// added (web/new/js/segments.js) as runs of those same pieces. The pieces are one list over the one
// text, so every offset (the caret, Add to reply) is an offset into the whole text.
import { joinSegments, fillBlank } from './model.js';
import { boxSegments } from './segments.js';

/**
 * The box text as pieces, with a text piece before, between and after the blanks, so there is
 * always somewhere to type, in the text around the blocks and in each block. Each piece's `block`
 * is the number of the block it is in (null outside the blocks); blocks: each one's label and why.
 */
export function pieces(text, parts) {
  const list = [];
  const blocks = [];
  const add = (segs, block) => {
    const from = list.length;
    for (const s of segs) {
      if (s.kind === 'blank' && (list.length === from || list[list.length - 1].kind === 'blank')) list.push({ kind: 'text', text: '', block });
      list.push(s.kind === 'blank' ? { ...s, value: '', block } : { ...s, block });
    }
    if (list.length === from || list[list.length - 1].kind === 'blank') list.push({ kind: 'text', text: '', block });
  };
  let run = [];
  for (const s of boxSegments(text, parts)) {
    if (s.kind !== 'block') { run.push(s); continue; }
    if (run.length) add(run, null);
    run = [];
    blocks.push({ label: s.label, why: s.why });
    add(s.inner, blocks.length - 1);
  }
  if (run.length || !list.length) add(run, null);
  return { list, blocks };
}

/** The blocks of the draft's parts, for knowing when new parts would draw the text differently. */
export const partsKey = (parts) => (parts || []).filter((p) => p && p.kind !== 'ai').map((p) => p.label + '\n' + p.text).join('\u0000');

/** The text the pieces make: what is typed in a pill fills its blank, and an empty pill stays a blank. */
export function textOf(list) {
  let segs = list;
  list.forEach((p, i) => { if (p.kind === 'blank' && p.value.trim()) segs = fillBlank(segs, i, p.value); });
  return joinSegments(segs);
}

/** What is on screen, for knowing when a rebuild would change it: the blocks, and the words in each. */
export const shape = (list, blocks) => JSON.stringify([blocks.map((b) => b.label),
  list.map((p) => [p.block, p.kind === 'blank' ? p.raw + (p.value.trim() ? '=' : '') : p.block === null ? '' : p.text])]);

/**
 * Whether the i-th piece ends a region: the editor's last piece, or a block's last piece. A line
 * break at the very end of a region shows only with one more after it (see the editor).
 */
export const endsAt = (list, i) => i === list.length - 1 || (list[i].block !== null && list[i + 1].block !== list[i].block);

/**
 * Whether the i-th piece, just changed, no longer keeps a block on lines of its own: the text right
 * after a block no longer starts with a line break, or the text right before one no longer ends
 * with one. On screen the block would still stand apart, but in the text its line now runs on.
 */
export function breaksBlockLine(list, i) {
  const p = list[i];
  if (!p || p.kind !== 'text' || p.block !== null) return false;
  const after = i > 0 && list[i - 1].block !== null;
  const before = i < list.length - 1 && list[i + 1].block !== null;
  return (after && !p.text.startsWith('\n')) || (before && !p.text.endsWith('\n'));
}

// The caret as an offset into the box text: a filled pill counts as its value, an empty one as its
// blank, the same text textOf() makes.
export const lengthOf = (p) => (p.kind === 'blank' ? (p.value.trim() ? p.value.trim().length : p.raw.length) : p.text.length);
export const startOf = (list, i) => list.slice(0, i).reduce((n, p) => n + lengthOf(p), 0);
