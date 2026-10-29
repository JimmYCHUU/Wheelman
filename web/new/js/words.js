// Small helpers for the new page's words, shared by the modules that put sentences together. Pure
// functions (no DOM, no globals), which the tests import in Node.

/** The words trimmed, ending in a full stop unless they end in one of their own (or a question or exclamation mark); '' for none. */
export const sentence = (words) => {
  const s = String(words ?? '').trim();
  return !s || /[.!?]$/.test(s) ? s : s + '.';
};
