// Add to reply: where a link goes in the text of the message box, and what is typed there.
// Shared by the page and the tests; no DOM.

// The lines a reply ends with: the sign-off, or the first lines of the standard block.
const CLOSING = /\n+(?=(?:Kind regards|Regards|Vehicle details|Book your inspection|Our location|Please call or text before visiting)\b)/;

/** "Walkaround video: https://…": the label tells the customer what the link is. */
export function linkLine(label, url) {
  const l = String(label || '').trim();
  return l ? `${l}: ${url}` : String(url);
}

/**
 * Where `line` goes in `text`: at the caret when the person had put one in the box (caret is a
 * number), else just before the sign-off or the standard block, else at the end. Returns the
 * position and the text to type there, with the newlines that keep the link on a line of its own.
 */
export function placeLine(text, line, caret = null) {
  const s = String(text || '');
  let at;
  if (Number.isInteger(caret) && caret >= 0 && caret <= s.length) at = caret;
  else {
    const m = s.match(CLOSING);
    at = m ? m.index : s.replace(/\s+$/, '').length;
  }
  const before = s.slice(0, at);
  const after = s.slice(at);
  const lead = !before || before.endsWith('\n') ? '' : '\n';
  const tail = !after.trim() || after.startsWith('\n') ? '' : '\n';
  return { at, insert: `${lead}${line}${tail}` };
}
