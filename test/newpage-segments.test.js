// The new page's message box text in regions: the blocks Wheelman's rules added (each found word
// for word in the text in the box), with Remove and Put back. Invented data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { segments, joinSegments } from '../web/new/js/model.js';
import { boxSegments, removeBlock, cutBlock, restoreBlock, putBackText } from '../web/new/js/segments.js';

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
  // Words typed on the block's own line make it plain: on screen it would no longer be a region of its own.
  assert.deepEqual(blocksOf(AI + '\n\nCall me. ' + SIGN).map((b) => b.label), []);
  assert.deepEqual(blocksOf(AI + '\n\n' + SIGN + ' Thanks').map((b) => b.label), []);
  // A block taken out entirely is simply not there.
  assert.deepEqual(blocksOf(AI + '\n\n' + SIGN).map((b) => b.label), ['Sign-off']);
});

test('a filled blank keeps the block', () => {
  const filled = REPLY.replace('[PRICE?]', '$25,990');
  const [price, sign] = blocksOf(filled);
  assert.deepEqual([price.label, sign.label], ['Price reply', 'Sign-off']);
  // The block's text is what is in the box now, the price in it; it has no pill left.
  assert.equal(price.text, PRICE.replace('[PRICE?]', '$25,990'));
  assert.equal(filled.slice(price.start, price.end), price.text);
  assert.deepEqual(kinds(price.inner), ['text']);
  // Still a blank, filled with something else, or several blanks: still the block.
  assert.equal(blocksOf(REPLY.replace('[PRICE?]', 'thirty thousand dollars'))[0].label, 'Price reply');
  const offer = 'Pay the deposit here: [DEPOSIT LINK?]\nThe ship leaves on [DATE?].';
  const parts = [{ kind: 'block', label: 'Auction offer', text: offer, why: '' }];
  const done = offer.replace('[DEPOSIT LINK?]', 'https://pay.example.com/abc').replace('[DATE?]', '3 November');
  assert.deepEqual(boxSegments(done, parts).map((x) => x.kind), ['block']);
  assert.deepEqual(boxSegments('Hello.\n\n' + offer.replace('[DATE?]', '3 November'), parts).map((x) => x.kind), ['text', 'block']);
  // A fill never reaches past its own line, and the words around the blanks must still be the block's.
  assert.deepEqual(blocksOf(REPLY.replace('[PRICE?]', '$25,990\nor near')).map((b) => b.label), ['Sign-off']);
  assert.deepEqual(blocksOf(REPLY.replace('[PRICE?] drive away', '$25,990 on the road')).map((b) => b.label), ['Sign-off']);
  // A block that is only a blank is found word for word only, never as any line at all.
  const only = [{ kind: 'block', label: 'Links you asked for', text: '[WHICH CAR?]', why: '' }];
  assert.deepEqual(boxSegments('Hello.\n\nSee you.', only).map((x) => x.kind), ['text']);
  assert.deepEqual(boxSegments('Hello.\n\n[WHICH CAR?]', only).map((x) => x.kind), ['text', 'block']);
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
  // A filled block is removed and put back as it is, the price in it.
  const filled = REPLY.replace('[PRICE?]', '$25,990');
  const [full] = blocksOf(filled);
  assert.equal(removeBlock(filled, full), AI + '\n\n' + SIGN);
  assert.equal(restoreBlock(AI + '\n\n' + SIGN, full, filled), filled);
});

test('Put back leaves a blank line between the block and the text on both sides', () => {
  const was = ['Hello.', PRICE, 'See you soon.'].join('\n\n');
  const [price] = blocksOf(was);
  // One line break taken out of the blank line after where it was: the block still stands apart.
  assert.equal(restoreBlock('Hello.\nSee you soon.', price, was), was);
  // Both sides changed, one line break before the sign-off: a blank line on each side.
  assert.equal(restoreBlock('Hi there.\nRegards,\nThe team', price, was), 'Hi there.\n\n' + PRICE + '\n\nRegards,\nThe team');
  // At the end, after text that ends with a line break: one more, and nothing after it.
  assert.equal(restoreBlock('All new words.\n', price, was), 'All new words.\n\n' + PRICE + '\n');
  // The first block goes back first, with a blank line after it.
  const first = PRICE + '\n\nSee you soon.';
  const [b] = blocksOf(first);
  assert.equal(restoreBlock('Changed: see you soon.', b, first), PRICE + '\n\nChanged: see you soon.');
  assert.equal(restoreBlock('\nSee you soon.', b, first), first, 'at the start, with a blank line after it');
});

test('Put back says when it cannot: the reply it came out of is no longer in the box', () => {
  const [price] = blocksOf(REPLY);
  const left = removeBlock(REPLY, price);
  const removal = { text: left, id: 7, block: price, was: REPLY };
  // The box text unchanged since the remove: put back, whatever the draft is now.
  assert.equal(putBackText({ text: left, id: 7 }, removal), REPLY);
  assert.equal(putBackText({ text: left, id: 8 }, removal), REPLY, 'a new suggestion arrived while the text stayed');
  // The same suggestion, typed in since: put back into the text as it is.
  const typed = left.replace('Good morning', 'Hello');
  assert.equal(putBackText({ text: typed, id: 7 }, removal), REPLY.replace('Good morning', 'Hello'));
  // Another suggestion and other text, or the box gone (another conversation): nothing.
  assert.equal(putBackText({ text: 'Another reply.', id: 8 }, removal), null);
  assert.equal(putBackText(null, removal), null);
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
