// The editor in the message box: the reply as text the person changes in place, with each blank
// ([PRICE?]) an amber pill to fill in. It always holds one text, and hands every change up whole.
//
// The text is in pieces: an editable span for each run of text, an <input> for each blank. While
// focus stays in the editor nothing is rebuilt, so the caret never jumps; a pill typed in stays a
// pill (green) until focus leaves the editor, and then becomes part of the text.
//
// A block Wheelman's rules added (the price reply, the sign-off; web/new/js/segments.js) is a run of
// those same pieces drawn inside a tinted region with its label and Remove. The pieces stay one list
// over the one text (web/new/js/editorpieces.js), so every offset (the caret, Add to reply) is an
// offset into the whole text. A block's words stay editable; once they are changed, the next
// rebuild draws them as plain text. Typing that joins a block's line to the text beside it rebuilds
// at once, so what is on screen is always what is copied.
import { html, useRef, useState, useEffect, useLayoutEffect } from './html.js';
import { blankWords, plainPaste } from '../model.js';
import { pieces, partsKey, textOf, shape, endsAt, breaksBlockLine, lengthOf, startOf } from '../editorpieces.js';

/** Whether this browser keeps an editable element to plain text (paste and Enter then stay plain). */
const PLAIN = (() => {
  try {
    const el = document.createElement('span');
    el.contentEditable = 'plaintext-only';
    return el.contentEditable === 'plaintext-only';
  } catch { return false; }
})();

// A line break at the very end of the text shows only with one more after it, so the browser adds
// one there when Enter is pressed at the end. In the last piece, a newline at the end of what is on
// screen is that extra one: it is not read, and it is written when the text ends with a newline.
// The last piece in a block with text after it ends its region the same way (it "ends" too), but
// there the browser adds no extra newline (to it, the block is part of the line of text around
// it), so that one is written by hand.

/** The text of an editable span: a line break the browser added as an element counts as a newline. */
function readText(el, ends = false) {
  let out = '';
  for (const n of el.childNodes) {
    if (n.nodeType === 3) out += n.data;
    else if (n.nodeName === 'BR') out += '\n';
    else if (n.nodeType === 1) out += (/^(DIV|P)$/.test(n.nodeName) && out && !out.endsWith('\n') ? '\n' : '') + readText(n);
  }
  return ends && out.endsWith('\n') ? out.slice(0, -1) : out;
}

/**
 * Puts plain text where the caret is. The last piece lets the browser do it (so Undo works and the
 * new line shows); a piece before a pill is written by hand, because there the browser's extra
 * newline would stay in the text. A newline at the very end of such a piece only moves the pill
 * down a line, and the caret cannot stand on that empty line, so the pill takes the focus. At the
 * very end of a block's last piece, the extra newline is written by hand, so the new line shows.
 */
function insertPlain(el, t, { last, ends }, onText) {
  if (last) { document.execCommand('insertText', false, t); return; }
  const sel = window.getSelection();
  if (!sel.rangeCount || !el.contains(sel.anchorNode)) return;
  const range = sel.getRangeAt(0);
  range.deleteContents();
  const node = document.createTextNode(t);
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  const rest = document.createRange();
  rest.setStart(range.startContainer, range.startOffset);
  rest.setEnd(el, el.childNodes.length);
  const atEnd = !rest.toString();
  if (ends && atEnd && t.endsWith('\n')) { range.insertNode(document.createTextNode('\n')); range.collapse(true); }
  sel.removeAllRanges();
  sel.addRange(range);
  onText(readText(el, ends));
  const pill = el.nextElementSibling;
  if (!ends && atEnd && t.endsWith('\n') && pill) pill.focus();
}

/** last: the editor's last piece; ends: the last piece of the editor or of a block (see above). readOnly: shown, not changed. */
function TextPiece({ text, only, last, ends, onText, readOnly }) {
  const ref = useRef(null);
  // Written once, when the piece is made: after that the browser owns what is in it.
  useLayoutEffect(() => { ref.current.textContent = ends && text.endsWith('\n') ? text + '\n' : text; }, []);
  const keys = (e) => {
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.isComposing) { e.preventDefault(); insertPlain(e.currentTarget, '\n', { last, ends }, onText); }
    // No bold, italic or underline: a text message is plain text.
    else if ((e.ctrlKey || e.metaKey) && /^[biu]$/i.test(e.key)) e.preventDefault();
  };
  const paste = (e) => {
    e.preventDefault();
    const t = (e.clipboardData && e.clipboardData.getData('text/plain')) || '';
    if (t) insertPlain(e.currentTarget, plainPaste(t), { last, ends }, onText);
  };
  // A phone keyboard may send its Enter only as an input of this kind, with no Enter key: the same newline.
  const beforeInput = (e) => {
    if (e.isComposing || (e.inputType !== 'insertParagraph' && e.inputType !== 'insertLineBreak')) return;
    e.preventDefault();
    insertPlain(e.currentTarget, '\n', { last, ends }, onText);
  };
  return html`<span class="seg" ref=${ref} contenteditable=${readOnly ? 'false' : PLAIN ? 'plaintext-only' : 'true'} aria-readonly=${readOnly ? 'true' : null} role="textbox" aria-multiline="true"
    aria-label=${readOnly ? 'Reply text, sending' : 'Reply text, you can change it'} spellcheck="true" data-placeholder=${only ? 'Type your reply' : null}
    onInput=${(e) => onText(readText(e.currentTarget, ends), e.isComposing)} onKeyDown=${keys} onbeforeinput=${beforeInput} onPaste=${paste} onDrop=${(e) => e.preventDefault()}></span>`;
}

function Pill({ piece, onValue, onKey, readOnly }) {
  const words = blankWords(piece.label);
  const v = piece.value;
  return html`<input type="text" class=${'blank-pill' + (v.trim() ? ' filled' : '')} size=${Math.max(words.length, v.length) + 1}
    value=${v} placeholder=${words} aria-label=${'Fill in: ' + words} autocomplete="off" spellcheck="false" readOnly=${readOnly}
    onInput=${(e) => onValue(e.currentTarget.value)} onKeyDown=${onKey} />`;
}

// The pieces on screen, in the order of the list, inside the blocks too.
const pieceEls = (root) => [...root.querySelectorAll('.seg, .blank-pill')];

/** Where the caret is in the box text while focus is in the editor (after a pill in it), else null. */
function caretOf(root, list) {
  const a = document.activeElement;
  if (!root || !a || !root.contains(a)) return null;
  const i = pieceEls(root).indexOf(a);
  if (i === -1 || !list[i]) return null;
  if (list[i].kind === 'blank') return startOf(list, i) + lengthOf(list[i]);
  const sel = window.getSelection();
  if (!sel.rangeCount || !a.contains(sel.focusNode)) return null;
  const before = document.createRange();
  before.setStart(a, 0);
  before.setEnd(sel.focusNode, sel.focusOffset);
  const copy = document.createElement('span');
  copy.append(before.cloneContents());
  return startOf(list, i) + Math.min(readText(copy).length, list[i].text.length);
}

/** Puts the caret at an offset into the box text, in the text piece there, and scrolls it into view. */
function putCaret(root, list, at) {
  const els = pieceEls(root);
  let start = 0;
  for (let i = 0; i < list.length; i++) {
    const n = lengthOf(list[i]);
    if (list[i].kind === 'text' && at <= start + n && els[i]) {
      const el = els[i];
      const node = el.firstChild;
      const range = document.createRange();
      if (node && node.nodeType === 3) range.setStart(node, Math.max(0, Math.min(at - start, node.data.length)));
      else range.setStart(el, 0);
      range.collapse(true);
      el.focus({ preventScroll: true });
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      const box = root.closest('.box-scroll') || root;
      const r = range.getBoundingClientRect();
      const b = box.getBoundingClientRect();
      if (r.height && r.bottom > b.bottom) box.scrollTop += r.bottom - b.bottom;
      else if (r.height && r.top < b.top) box.scrollTop -= b.top - r.top;
      return;
    }
    start += n;
  }
}

/** Puts focus in the first pill with nothing typed in it. False when there is none. */
export function focusFirstBlank(root) {
  const pill = root && [...root.querySelectorAll('input.blank-pill')].find((p) => !p.value.trim());
  if (!pill) return false;
  pill.focus();
  pill.scrollIntoView({ block: 'nearest' });
  return true;
}

/** Puts the caret at the end of the editor's text (before the last piece's extra newline, if it has one). */
export function focusText(root) {
  const all = root ? root.querySelectorAll('.seg') : [];
  const last = all[all.length - 1];
  if (!last) return;
  last.focus();
  const range = document.createRange();
  const end = last.lastChild;
  if (end && end.nodeType === 3 && end.data.endsWith('\n')) range.setStart(end, end.data.length - 1);
  else { range.selectNodeContents(last); range.collapse(false); }
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

/**
 * A block Wheelman's rules added: a tinted region on a line of its own, its label above its words
 * (why it is there in a tooltip, and for a screen reader), with Remove.
 */
function Block({ id, block, onRemove, children }) {
  return html`<div class="block" role="group" aria-labelledby=${id} aria-describedby=${block.why ? id + '-why' : null}>
    <div class="block-head">
      <span class="block-label" id=${id} title=${block.why || null}>${block.label} · added by Wheelman's rules</span>
      ${block.why ? html`<span class="sr" id=${id + '-why'}>${block.why}</span>` : null}
      ${onRemove ? html`<button type="button" class="btn small quiet" aria-label=${'Remove ' + block.label} onClick=${onRemove}>Remove</button>` : null}
    </div>
    <div class="block-body">${children}</div>
  </div>`;
}

let editors = 0;

/**
 * text: what the box holds; onChange(text) gets the whole new text on every change. A text that
 * arrives from outside (a new suggestion, Clear, Bring back, Add to reply) rebuilds the pieces; the
 * editor's own changes never do. parts: the draft's parts, whose blocks are drawn where their words
 * are in the text; onRemove(block, text) is Remove, with the block as it is on screen now (its
 * label, why, text, and its start and end) and the text it is in.
 *
 * handle (a ref) is how Add to reply reaches the editor: text() is the text on screen, caret() the
 * last caret position as an offset into it (null when the editor has not had focus since its text
 * arrived), and land(text, at) says where the caret goes once that text arrives from outside.
 * readOnly: the text is shown and cannot be changed (its reply is sending), and no block has Remove.
 */
export function Editor({ text, parts, onChange, onRemove, bad, root, handle, readOnly = false }) {
  const own = useRef({ text: null, pieces: [], blocks: [], parts: null, partsKey: '', rev: 0, caret: null, land: null, uid: 0 });
  const [, redraw] = useState(0);
  const s = own.current;
  if (!s.uid) s.uid = ++editors;
  const build = (built = pieces(s.text, s.parts)) => {
    s.pieces = built.list;
    s.blocks = built.blocks;
    s.partsKey = partsKey(s.parts);
    s.rev += 1;
  };
  s.parts = parts || null;
  if (text !== s.text) {
    s.text = text;
    build();
    const landing = !!s.land && s.land.text === text;
    s.caret = landing ? s.land.at : null;
    if (!landing) s.land = null;
  } else if (partsKey(s.parts) !== s.partsKey && !(root.current && root.current.contains(document.activeElement))) {
    // New parts for the same text (a new suggestion while the person's text stays): drawn now
    // unless the person is typing, then when focus leaves the editor.
    build();
  }
  if (handle) handle.current = { own: s, text: () => s.text, caret: () => s.caret, land: (t, at) => { s.land = { text: t, at }; } };
  useEffect(() => () => { if (handle && handle.current && handle.current.own === s) handle.current = null; }, []);

  // The caret is remembered wherever it goes in the editor, so Add to reply puts the link there.
  const mark = () => { const at = caretOf(root.current, s.pieces); if (at !== null) s.caret = at; };
  useEffect(() => {
    document.addEventListener('selectionchange', mark);
    return () => document.removeEventListener('selectionchange', mark);
  }, []);
  // A link put in from outside: once its text is on screen, the caret goes after it.
  useLayoutEffect(() => {
    if (!s.land || s.land.text !== s.text || !root.current) return;
    const at = s.land.at;
    s.land = null;
    putCaret(root.current, s.pieces, at);
  });

  const set = (i, patch, composing = false) => {
    s.pieces = s.pieces.map((p, n) => (n === i ? { ...p, ...patch } : p));
    s.text = textOf(s.pieces);
    onChange(s.text);
    // Typed beside a block so that its line now runs on into this text: drawn again at once (the
    // block becomes plain text), with the caret where it was, so the screen is what is copied. Not
    // while a keyboard's input method is composing: the input that ends it comes next.
    if (composing || !breaksBlockLine(s.pieces, i)) return;
    const at = caretOf(root.current, s.pieces);
    s.land = { text: s.text, at: at === null ? startOf(s.pieces, i + 1) : at };
    build();
    redraw((n) => n + 1);
  };

  // Focus left the editor: a filled pill becomes text, a blank typed into the text becomes a pill,
  // and a block whose words were changed becomes plain text.
  const settle = (e) => {
    if (e.currentTarget.contains(e.relatedTarget)) return;
    const fresh = pieces(s.text, s.parts);
    if (shape(fresh.list, fresh.blocks) === shape(s.pieces, s.blocks)) { s.partsKey = partsKey(s.parts); return; }
    build(fresh);
    redraw((n) => n + 1);
  };

  // Remove: the block's pieces as they are now, as a stretch of the text.
  const remove = (b) => {
    const from = s.pieces.findIndex((p) => p.block === b);
    if (from === -1 || !onRemove) return;
    let to = from;
    while (to < s.pieces.length && s.pieces[to].block === b) to++;
    const start = startOf(s.pieces, from);
    const end = startOf(s.pieces, to);
    onRemove({ ...s.blocks[b], text: s.text.slice(start, end), start, end }, s.text);
  };

  // Tab and Shift+Tab go from pill to pill; past the last one, Tab goes on as usual.
  const tab = (e) => {
    if (e.key !== 'Tab' || e.ctrlKey || e.altKey || e.metaKey) return;
    const all = [...e.currentTarget.closest('.editor').querySelectorAll('input.blank-pill')];
    const to = all[all.indexOf(e.currentTarget) + (e.shiftKey ? -1 : 1)];
    if (!to) return;
    e.preventDefault();
    to.focus();
    to.select();
  };

  // A click in the editor beside the text (past the end of a short line, say) puts the caret at the
  // nearest point in the text; where there is none, at the end.
  const edge = (e) => {
    if (e.target !== e.currentTarget && !e.target.classList.contains('para') && !e.target.classList.contains('block-body')) return;
    e.preventDefault();
    const at = document.caretRangeFromPoint ? document.caretRangeFromPoint(e.clientX, e.clientY) : null;
    const node = at && at.startContainer;
    const seg = node && (node.nodeType === 3 ? node.parentElement : node).closest('.seg');
    if (!seg || !e.currentTarget.contains(seg)) { focusText(e.currentTarget); return; }
    seg.focus();
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(at);
  };

  const list = s.pieces;
  const only = list.length === 1;
  const draw = (p, i) => (p.kind === 'blank'
    ? html`<${Pill} key=${s.rev + '-' + i} piece=${p} onValue=${(value) => set(i, { value })} onKey=${tab} readOnly=${readOnly} />`
    : html`<${TextPiece} key=${s.rev + '-' + i} text=${p.text} only=${only} last=${i === list.length - 1} ends=${endsAt(list, i)} onText=${(t, composing) => set(i, { text: t }, composing)} readOnly=${readOnly} />`);
  const drawn = [];
  for (let i = 0; i < list.length;) {
    const b = list[i].block;
    if (b === null) { drawn.push(draw(list[i], i)); i++; continue; }
    const inner = [];
    for (; i < list.length && list[i].block === b; i++) inner.push(draw(list[i], i));
    const id = 'block-' + s.uid + '-' + s.rev + '-' + b;
    drawn.push(html`<${Block} key=${s.rev + '-b' + b} id=${id} block=${s.blocks[b]} onRemove=${readOnly ? null : () => remove(b)}>${inner}<//>`);
  }
  return html`<div class=${'editor' + (bad ? ' bad' : '')} ref=${root} role="group" aria-label="Suggested reply, not sent" onfocusout=${settle} onfocusin=${mark} onInput=${mark} onMouseDown=${edge}>
    <div class="para">${drawn}</div>
  </div>`;
}
