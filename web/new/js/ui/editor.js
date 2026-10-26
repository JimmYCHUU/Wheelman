// The editor in the message box: the reply as text the person changes in place, with each blank
// ([PRICE?]) an amber pill to fill in. It always holds one text, and hands every change up whole.
//
// The text is in pieces: an editable span for each run of text, an <input> for each blank. While
// focus stays in the editor nothing is rebuilt, so the caret never jumps; a pill typed in stays a
// pill (green) until focus leaves the editor, and then becomes part of the text.
import { html, useRef, useState, useLayoutEffect } from './html.js';
import { segments, joinSegments, fillBlank, blankWords } from '../model.js';

/** Whether this browser keeps an editable element to plain text (paste and Enter then stay plain). */
const PLAIN = (() => {
  try {
    const el = document.createElement('span');
    el.contentEditable = 'plaintext-only';
    return el.contentEditable === 'plaintext-only';
  } catch { return false; }
})();

/** The box text as pieces, with a text piece before, between and after the blanks, so there is always somewhere to type. */
function pieces(text) {
  const out = [];
  for (const s of segments(text)) {
    if (s.kind === 'blank' && (!out.length || out[out.length - 1].kind === 'blank')) out.push({ kind: 'text', text: '' });
    out.push(s.kind === 'blank' ? { ...s, value: '' } : s);
  }
  if (!out.length || out[out.length - 1].kind === 'blank') out.push({ kind: 'text', text: '' });
  return out;
}

/** The text the pieces make: what is typed in a pill fills its blank, and an empty pill stays a blank. */
function textOf(list) {
  let segs = list;
  list.forEach((p, i) => { if (p.kind === 'blank' && p.value.trim()) segs = fillBlank(segs, i, p.value); });
  return joinSegments(segs);
}

/** What is on screen, for knowing when a rebuild would change it. */
const shape = (list) => list.map((p) => (p.kind === 'blank' ? 'b' + p.raw + (p.value.trim() ? '=' : '') : 't')).join('|');

// A line break at the very end of the text shows only with one more after it, so the browser adds
// one there when Enter is pressed at the end. In the last piece, a newline at the end of what is on
// screen is that extra one: it is not read, and it is written when the text ends with a newline.

/** The text of an editable span: a line break the browser added as an element counts as a newline. */
function readText(el, last = false) {
  let out = '';
  for (const n of el.childNodes) {
    if (n.nodeType === 3) out += n.data;
    else if (n.nodeName === 'BR') out += '\n';
    else if (n.nodeType === 1) out += (/^(DIV|P)$/.test(n.nodeName) && out && !out.endsWith('\n') ? '\n' : '') + readText(n);
  }
  return last && out.endsWith('\n') ? out.slice(0, -1) : out;
}

/**
 * Puts plain text where the caret is. The last piece lets the browser do it (so Undo works and the
 * new line shows); a piece before a pill is written by hand, because there the browser's extra
 * newline would stay in the text. A newline at the very end of such a piece only moves the pill
 * down a line, and the caret cannot stand on that empty line, so the pill takes the focus.
 */
function insertPlain(el, t, last, onText) {
  if (last) { document.execCommand('insertText', false, t); return; }
  const sel = window.getSelection();
  if (!sel.rangeCount || !el.contains(sel.anchorNode)) return;
  const range = sel.getRangeAt(0);
  range.deleteContents();
  const node = document.createTextNode(t);
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
  onText(readText(el));
  const rest = document.createRange();
  rest.setStart(range.startContainer, range.startOffset);
  rest.setEnd(el, el.childNodes.length);
  const pill = el.nextElementSibling;
  if (t.endsWith('\n') && !rest.toString() && pill) pill.focus();
}

function TextPiece({ text, only, last, onText }) {
  const ref = useRef(null);
  // Written once, when the piece is made: after that the browser owns what is in it.
  useLayoutEffect(() => { ref.current.textContent = last && text.endsWith('\n') ? text + '\n' : text; }, []);
  const keys = (e) => {
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.isComposing) { e.preventDefault(); insertPlain(e.currentTarget, '\n', last, onText); }
    // No bold, italic or underline: a text message is plain text.
    else if ((e.ctrlKey || e.metaKey) && /^[biu]$/i.test(e.key)) e.preventDefault();
  };
  const paste = (e) => {
    e.preventDefault();
    const t = (e.clipboardData && e.clipboardData.getData('text/plain')) || '';
    if (t) insertPlain(e.currentTarget, t.replace(/\r\n?/g, '\n'), last, onText);
  };
  return html`<span class="seg" ref=${ref} contenteditable=${PLAIN ? 'plaintext-only' : 'true'} role="textbox" aria-multiline="true"
    aria-label="Reply text, you can change it" spellcheck="true" data-placeholder=${only ? 'Type your reply' : null}
    onInput=${(e) => onText(readText(e.currentTarget, last))} onKeyDown=${keys} onPaste=${paste} onDrop=${(e) => e.preventDefault()}></span>`;
}

function Pill({ piece, onValue, onKey }) {
  const words = blankWords(piece.label);
  const v = piece.value;
  return html`<input type="text" class=${'blank-pill' + (v.trim() ? ' filled' : '')} size=${Math.max(words.length, v.length) + 1}
    value=${v} placeholder=${words} aria-label=${'Fill in: ' + words} autocomplete="off" spellcheck="false"
    onInput=${(e) => onValue(e.currentTarget.value)} onKeyDown=${onKey} />`;
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
 * text: what the box holds; onChange(text) gets the whole new text on every change. A text that
 * arrives from outside (a new suggestion, Clear, Bring back) rebuilds the pieces; the editor's own
 * changes never do.
 */
export function Editor({ text, onChange, bad, root }) {
  const own = useRef({ text: null, pieces: [], rev: 0 });
  const [, redraw] = useState(0);
  const s = own.current;
  if (text !== s.text) { s.text = text; s.pieces = pieces(text); s.rev += 1; }

  const set = (i, patch) => {
    s.pieces = s.pieces.map((p, n) => (n === i ? { ...p, ...patch } : p));
    s.text = textOf(s.pieces);
    onChange(s.text);
  };

  // Focus left the editor: a filled pill becomes text, and a blank typed into the text becomes a pill.
  const settle = (e) => {
    if (e.currentTarget.contains(e.relatedTarget)) return;
    const fresh = pieces(s.text);
    if (shape(fresh) === shape(s.pieces)) return;
    s.pieces = fresh;
    s.rev += 1;
    redraw((n) => n + 1);
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
    if (e.target !== e.currentTarget && !e.target.classList.contains('para')) return;
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

  const only = s.pieces.length === 1;
  return html`<div class=${'editor' + (bad ? ' bad' : '')} ref=${root} role="group" aria-label="Suggested reply, not sent" onfocusout=${settle} onMouseDown=${edge}>
    <div class="para">${s.pieces.map((p, i) => (p.kind === 'blank'
      ? html`<${Pill} key=${s.rev + '-' + i} piece=${p} onValue=${(value) => set(i, { value })} onKey=${tab} />`
      : html`<${TextPiece} key=${s.rev + '-' + i} text=${p.text} only=${only} last=${i === s.pieces.length - 1} onText=${(t) => set(i, { text: t })} />`))}</div>
  </div>`;
}
