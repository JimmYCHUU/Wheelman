// Add to reply: a car's photo, video or document link, on a line of its own, in the box text. Pure
// text functions, the same rules as the old page's (web/lib/insert.js); no DOM.
import { linkLine, placeLine } from '../../lib/insert.js';

/**
 * The box text with "label: url" put in at the caret (an offset into the text), or, with no caret,
 * before the sign-off or the standard block, else at the end. Returns the new text and the caret
 * after the line, so the next link follows this one.
 */
export function placeLink(text, label, url, caret = null) {
  const s = String(text || '');
  const { at, insert } = placeLine(s, linkLine(label, url), caret);
  return { text: s.slice(0, at) + insert + s.slice(at), caret: at + insert.replace(/\n$/, '').length };
}

/** The new box text after Add to reply. Everything typed stays. */
export const addToReply = (text, label, url, caret = null) => placeLink(text, label, url, caret).text;

/** What a link is called when it goes into a reply: "Walkaround 360 video", "Front photo", "Auction sheet". */
export function replyLabel(kind, label) {
  const l = String(label || '').trim();
  if (kind === 'video') return /video/i.test(l) ? l : l + ' video';
  if (kind === 'auction') return 'Auction photo';
  if (kind === 'picture') return l.replace(/\s+\d+$/, '') + ' photo';
  return l;
}
