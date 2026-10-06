// A blank is a short label in capitals with a question mark, in square brackets: [PRICE?],
// [TRADE-IN VALUE?], [DEPOSIT LINK?]. It marks what only a person can decide. The server's checks
// and the page's editor share this one definition, so they can never disagree on what a blank is.

export const BLANK_PATTERN = String.raw`\[[A-Z][A-Z0-9 &'/-]{1,30}\?\]`;

/** A fresh global matcher with the label captured: [PRICE?] gives "PRICE". */
export const blankMatcher = () => new RegExp(String.raw`\[([A-Z][A-Z0-9 &'/-]{1,30})\?\]`, 'g');

/** Every blank in a text, in order: { kind: 'PRICE', index, length, text: '[PRICE?]' }. */
export function blanksIn(text) {
  const out = [];
  for (const m of String(text || '').matchAll(blankMatcher())) out.push({ kind: m[1], index: m.index, length: m[0].length, text: m[0] });
  return out;
}
