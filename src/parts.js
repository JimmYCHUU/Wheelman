// The parts of a finished reply: the AI's own words, then each block code added under them (the
// links asked for, the price reply, the invitation to see the car, the first-reply details, the
// sign-off, an auction offer), each with its label and why it was added. The new page shows each
// block as its own region that can be removed.
//
// The reply itself is never changed here. The parts are found in it word for word and kept only
// when they join back to it exactly; otherwise the whole reply is one AI part.

const LABELS = {
  links: 'Links you asked for',
  price: 'Price reply',
  invite: 'Invitation to see the car',
  first: 'First-reply details',
  signoff: 'Sign-off',
  offer: 'Auction offer',
};

// Why the closing blocks are there: they are added by the day and the enquiry, not by a line the AI was given.
const WHY = {
  first: 'A first reply to a new enquiry',
  signoff: 'The first reply to this customer today',
};

/** One block code built: its kind (a key of LABELS), its label, its text and why it was added. */
export const blockOf = (kind, text, why = WHY[kind] || '') => ({ kind, label: LABELS[kind], text: String(text || ''), why });

/**
 * Why a block was added, from the line the AI was given about it: its first sentence. The rest of
 * that line tells the AI what to write, which is not for the page.
 */
export const reasonIn = (line) => String(line || '').trim().split(/(?<=[.!?])\s+(?=[A-Z])/)[0];

/**
 * The reply split into [{ kind: 'ai'|'block', label, text, why }]. blocks: what code added, in the
 * order they sit in the reply ([{ kind, label, text, why }]). Each is looked for from the end of
 * the reply, so the AI's part is whatever comes before the first block. When the parts do not join
 * back to the reply exactly ("\n\n" between them), the reply is one AI part.
 */
export function partsOf(reply, blocks = []) {
  const text = String(reply ?? '');
  const whole = [{ kind: 'ai', label: '', text, why: '' }];
  const found = [];
  let rest = text;
  for (const b of [...(blocks || [])].reverse()) {
    if (!b?.text) continue;
    const at = rest.lastIndexOf(b.text);
    if (at === -1) return whole;
    found.unshift({ kind: 'block', label: b.label, text: b.text, why: b.why || '' });
    rest = rest.slice(0, at).replace(/\n\n$/, '');
  }
  const parts = rest ? [{ kind: 'ai', label: '', text: rest, why: '' }, ...found] : found;
  return parts.length && parts.map((p) => p.text).join('\n\n') === text ? parts : whole;
}
