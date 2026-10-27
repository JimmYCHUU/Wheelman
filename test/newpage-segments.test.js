// The new page's message box text in regions: the blocks Wheelman's rules added (each found word
// for word in the text in the box), with Remove and Put back. Invented data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { segments, joinSegments } from '../web/new/js/model.js';
import { boxSegments, removeBlock, cutBlock, restoreBlock } from '../web/new/js/segments.js';

const AI = 'Good morning Sam,\n\nThanks for your message about the Hiace.';
const PRICE = 'The price is [PRICE?] drive away.\nYou are welcome to book a time: https://www.example.com/book';
const SIGN = 'Regards,\nTeam Carbarn';
const REPLY = [AI, PRICE, SIGN].join('\n\n');
const PARTS = [
  { kind: 'ai', label: '', text: AI, why: '' },
  { kind: 'block', label: 'Price reply', text: PRICE, why: 'The customer asked about the price' },
  { kind: 'block', label: 'Sign-off', text: SIGN, why: 'The first reply to this customer today' },
];

const kinds = (segs) => segs.map((s) => (s.kind === 'block' ? 'block:' + s.label : s.kind));
const blocksOf = (text, parts = PARTS) => boxSegments(text, parts).filter((s) => s.kind === 'block');

/** The text and blank segments with each block opened up, neighbouring text joined: what segments(text) gives. */
function flat(segs) {
  const out = [];
  for (const s of segs.flatMap((x) => (x.kind === 'block' ? x.inner : [x]))) {
    const prev = out[out.length - 1];
    if (s.kind === 'text' && prev && prev.kind === 'text') out[out.length - 1] = { kind: 'text', text: prev.text + s.text };
    else out.push(s);
  }
  return out;
}

test('boxSegments marks each block found word for word', () => {
  const segs = boxSegments(REPLY, PARTS);
  assert.deepEqual(kinds(segs), ['text', 'block:Price reply', 'text', 'block:Sign-off']);
  const [price, sign] = segs.filter((s) => s.kind === 'block');
  assert.equal(price.text, PRICE);
  assert.equal(price.why, 'The customer asked about the price');
  assert.equal(REPLY.slice(price.start, price.end), PRICE);
  assert.equal(REPLY.slice(sign.start, sign.end), SIGN);
  assert.equal(sign.end, REPLY.length);
  assert.equal(segs[0].text, AI + '\n\n', 'the blank line that joins a block stays in the text around it');
  assert.equal(segs[2].text, '\n\n');

  // The AI's own words are never a block, even word for word.
  assert.deepEqual(kinds(boxSegments(AI, [{ kind: 'ai', label: '', text: AI, why: '' }])), ['text']);
  // A block found in text the person changed elsewhere is still a block, at its new place.
  const typed = REPLY.replace('Thanks for your message', 'Thanks so much for your message');
  assert.deepEqual(blocksOf(typed).map((b) => typed.slice(b.start, b.end)), [PRICE, SIGN]);
  // A block at the very start.
  assert.deepEqual(kinds(boxSegments(PRICE + '\n\nSee you soon.', PARTS)), ['block:Price reply', 'text']);
  // No parts (an older draft, a template word for word): no blocks.
  assert.deepEqual(boxSegments(REPLY, null), segments(REPLY));
  assert.deepEqual(boxSegments(REPLY, []), segments(REPLY));
  assert.deepEqual(boxSegments('', PARTS), []);
});

test('an edited block becomes plain text', () => {
  const edited = REPLY.replace('drive away', 'on the road');
  assert.deepEqual(kinds(boxSegments(edited, PARTS)), ['text', 'blank', 'text', 'block:Sign-off'], 'only the sign-off is still word for word');
  // A filled blank is a change of words too.
  assert.deepEqual(blocksOf(REPLY.replace('[PRICE?]', '$25,990')).map((b) => b.label), ['Sign-off']);
  // Words typed on the block's own line make it plain: on screen it would no longer be a region of its own.
  assert.deepEqual(blocksOf(AI + '\n\nCall me. ' + SIGN).map((b) => b.label), []);
  assert.deepEqual(blocksOf(AI + '\n\n' + SIGN + ' Thanks').map((b) => b.label), []);
  // A block taken out entirely is simply not there.
  assert.deepEqual(blocksOf(AI + '\n\n' + SIGN).map((b) => b.label), ['Sign-off']);
});

test('removing a block keeps the typed text and Put back restores it', () => {
  const typed = REPLY.replace('Thanks for your message', 'Thanks so much for your message');
  const [price, sign] = blocksOf(typed);

  // The block goes with the blank line before it; everything typed stays.
  const left = removeBlock(typed, price);
  assert.equal(left, typed.replace('\n\n' + PRICE, ''));
  assert.ok(left.includes('Thanks so much for your message'));
  assert.equal(cutBlock(typed, price).at, typed.indexOf(PRICE) - 2, 'at: where it was in what is left');
  // Put back, nothing changed since: exactly as it was.
  assert.equal(restoreBlock(left, price, typed), typed);

  // The first block goes with the blank line after it.
  const first = PRICE + '\n\nSee you soon.';
  const [b] = blocksOf(first);
  assert.equal(removeBlock(first, b), 'See you soon.');
  assert.equal(restoreBlock('See you soon.', b, first), first);
  // The last block, and the only one.
  assert.equal(removeBlock(typed, sign), typed.replace('\n\n' + SIGN, ''));
  assert.equal(restoreBlock(removeBlock(typed, sign), sign, typed), typed);
  assert.equal(removeBlock(SIGN, blocksOf(SIGN)[0]), '');
  assert.equal(restoreBlock('', blocksOf(SIGN)[0], SIGN), SIGN);

  // Typed above where it was after the remove: it goes back before what followed it.
  const above = left.replace('Good morning Sam', 'Good morning Sam Invented');
  assert.equal(restoreBlock(above, price, typed), typed.replace('Good morning Sam', 'Good morning Sam Invented'));
  // Typed below it (in the sign-off): it goes back at the same place.
  const below = left.replace('Team Carbarn', 'Team Carbarn, Sydney');
  assert.equal(restoreBlock(below, price, typed), typed.replace('Team Carbarn', 'Team Carbarn, Sydney'));
  // Typed on both sides: before the sign-off.
  const both = above.replace('Team Carbarn', 'The Carbarn team');
  assert.equal(restoreBlock(both, price, typed), both.replace('\n\nRegards,', '\n\n' + PRICE + '\n\nRegards,'));
  // Both sides changed and no sign-off left: at the end.
  assert.equal(restoreBlock('All new words.', price, typed), 'All new words.\n\n' + PRICE);
  assert.equal(restoreBlock('', price, typed), PRICE);

  // The block on screen may have been changed since it was found: Remove takes what is there now.
  const changed = typed.replace('drive away', 'on the road');
  const now = { ...price, text: changed.slice(price.start, price.end + 1), end: price.end + 1 };
  assert.equal(removeBlock(changed, now), changed.replace('\n\n' + now.text, ''));
  // A block no longer anywhere in the text: nothing changes.
  assert.equal(removeBlock(AI, price), AI);
  assert.equal(cutBlock(AI, price).at, -1);
  assert.equal(restoreBlock(AI, price, AI), AI);
  // Found again from the end when the text before it changed length.
  assert.equal(removeBlock(REPLY, { ...price, start: 3 }), REPLY.replace('\n\n' + PRICE, ''));
});

test('blanks inside a block are still pills', () => {
  const [price, sign] = blocksOf(REPLY);
  assert.deepEqual(price.inner, segments(PRICE));
  assert.deepEqual(kinds(price.inner), ['text', 'blank', 'text']);
  assert.equal(price.inner[1].raw, '[PRICE?]');
  assert.equal(price.inner[1].label, 'PRICE');
  assert.deepEqual(sign.inner, [{ kind: 'text', text: SIGN }]);
  // A blank outside the blocks is a blank at the top, and none is counted twice.
  const withBlank = REPLY.replace('the Hiace', 'the [WHICH CAR?]');
  const segs = boxSegments(withBlank, PARTS);
  assert.equal(flat(segs).filter((s) => s.kind === 'blank').length, 2);
  assert.equal(segs.filter((s) => s.kind === 'blank').length, 1);
});

test('joinSegments of boxSegments is the text', () => {
  const texts = [
    REPLY,
    '',
    PRICE,
    SIGN,
    PRICE + '\n\n' + SIGN,
    AI + '\n\n' + PRICE,
    REPLY.replace('drive away', 'on the road'),
    REPLY.replace('the Hiace', 'the [WHICH CAR?]') + '\n',
    REPLY + '\n\nP.S. [DATE?]',
    '\n\n' + REPLY + '\n\n\n',
    REPLY + '\n\n' + REPLY,
  ];
  for (const t of texts) {
    const segs = boxSegments(t, PARTS);
    assert.equal(joinSegments(segs), t, JSON.stringify(t));
    assert.deepEqual(flat(segs), segments(t), 'the same text and blanks as segments(): ' + JSON.stringify(t));
    for (const b of segs.filter((s) => s.kind === 'block')) assert.equal(joinSegments(b.inner), b.text);
  }
  // The same words twice: the last of each is the block, looked for from the end as the server found them.
  const twice = blocksOf(REPLY + '\n\n' + REPLY);
  assert.deepEqual(twice.map((b) => b.label), ['Price reply', 'Sign-off']);
  assert.ok(twice[0].start > REPLY.length);
});
