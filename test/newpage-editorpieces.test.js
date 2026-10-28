// The new page's editor text in pieces (web/new/js/editorpieces.js): the text round trip through the
// pieces, the blocks as runs of pieces, the pieces that end a region, and when typing beside a block
// means drawing it again. Invented data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { pieces, textOf, shape, endsAt, breaksBlockLine, startOf, lengthOf, partsKey } from '../web/new/js/editorpieces.js';
import { boxSegments } from '../web/new/js/segments.js';

const AI = 'Good morning Sam,\n\nThanks for your message about the Hiace.';
const PRICE = 'The price is [PRICE?] drive away.\nYou are welcome to book a time: https://www.example.com/book';
const SIGN = 'Regards,\nTeam Carbarn';
const REPLY = [AI, PRICE, SIGN].join('\n\n');
const PARTS = [
  { kind: 'ai', label: '', text: AI, why: '' },
  { kind: 'block', label: 'Price reply', text: PRICE, why: 'The customer asked about the price' },
  { kind: 'block', label: 'Sign-off', text: SIGN, why: 'The first reply to this customer today' },
];

const TEXTS = [
  REPLY,
  '',
  '\n',
  PRICE,
  SIGN,
  SIGN + '\n',
  REPLY + '\n',
  REPLY + '\n\n',
  REPLY + '\nSydney',
  REPLY + '\n\nP.S. [DATE?]',
  REPLY.replace('the Hiace', 'the [WHICH CAR?]'),
  REPLY.replace('[PRICE?]', '$25,990'),
  REPLY.replace('drive away', 'on the road'),
  '[PRICE?]',
  '[PRICE?][DATE?]',
  '\n\n' + REPLY,
];

/** A piece in short: t:<text> or b:<raw>, with the block number. */
const brief = (list) => list.map((p) => (p.block === null ? '' : p.block + ':') + (p.kind === 'blank' ? 'b' + p.raw : 't' + JSON.stringify(p.text)));

test('textOf(pieces(text, parts)) is the text, with blocks, blanks in blocks, trailing newlines and text after a block', () => {
  for (const t of TEXTS) {
    assert.equal(textOf(pieces(t, PARTS).list), t, JSON.stringify(t));
    assert.equal(textOf(pieces(t, null).list), t, 'with no parts: ' + JSON.stringify(t));
  }
});

test('pieces: each block is a run of pieces, with somewhere to type around every blank', () => {
  const { list, blocks } = pieces(REPLY, PARTS);
  assert.deepEqual(blocks, [
    { label: 'Price reply', why: 'The customer asked about the price' },
    { label: 'Sign-off', why: 'The first reply to this customer today' },
  ]);
  assert.deepEqual(brief(list), [
    't' + JSON.stringify(AI + '\n\n'),
    '0:t"The price is "', '0:b[PRICE?]', '0:t' + JSON.stringify(' drive away.\nYou are welcome to book a time: https://www.example.com/book'),
    't"\\n\\n"',
    '1:t' + JSON.stringify(SIGN),
  ]);
  // A block's run starts at the block's start in the text, and ends at its end.
  const segs = boxSegments(REPLY, PARTS).filter((s) => s.kind === 'block');
  const runs = [0, 1].map((b) => [list.findIndex((p) => p.block === b), list.length - [...list].reverse().findIndex((p) => p.block === b)]);
  assert.deepEqual(runs.map(([from, to]) => [startOf(list, from), startOf(list, to)]), segs.map((s) => [s.start, s.end]));
  // A blank at the very start of a block, or two together, still has a text piece before and after it.
  const odd = pieces('[DATE?][PRICE?]', [{ kind: 'block', label: 'Auction offer', text: '[DATE?][PRICE?]', why: '' }]).list;
  assert.deepEqual(brief(odd), ['0:t""', '0:b[DATE?]', '0:t""', '0:b[PRICE?]', '0:t""']);
  // An empty box is one empty piece; no parts give the same pieces as before blocks.
  assert.deepEqual(brief(pieces('', PARTS).list), ['t""']);
  assert.deepEqual(brief(pieces('Hi [PRICE?]', null).list), ['t"Hi "', 'b[PRICE?]', 't""']);
});

test('textOf: a filled pill is its value, an empty one stays a blank; lengthOf counts the same', () => {
  const { list } = pieces(REPLY, PARTS);
  const filled = list.map((p) => (p.kind === 'blank' ? { ...p, value: ' $25,990 ' } : p));
  assert.equal(textOf(filled), REPLY.replace('[PRICE?]', '$25,990'));
  assert.equal(startOf(filled, filled.length), textOf(filled).length);
  assert.equal(lengthOf(list[2]), '[PRICE?]'.length);
});

test('endsAt: the editor\'s last piece and each block\'s last piece end a region; a piece before a block does not', () => {
  const ends = (t) => { const { list } = pieces(t, PARTS); return list.map((p, i) => endsAt(list, i)); };
  assert.deepEqual(ends(REPLY), [false, false, false, true, false, true]);
  assert.deepEqual(ends(REPLY + '\nSydney'), [false, false, false, true, false, true, true]);
  assert.deepEqual(ends('Just text.'), [true]);
});

test('breaksBlockLine: typing that joins a block to the line before or after it', () => {
  const base = pieces(REPLY + '\nSydney', PARTS).list;
  const typed = (i, text) => base.map((p, n) => (n === i ? { ...p, text } : p));
  const after = base.length - 1; // "\nSydney", after the sign-off
  assert.equal(breaksBlockLine(base, after), false);
  assert.equal(breaksBlockLine(typed(after, 'Y\nSydney'), after), true, 'typed at the start of the text after a block');
  assert.equal(breaksBlockLine(typed(after, '\nSydney!'), after), false);
  assert.equal(breaksBlockLine(typed(4, 'Y\n\n'), 4), true, 'the blank line between two blocks, typed at its start');
  assert.equal(breaksBlockLine(typed(4, '\n\nY'), 4), true, 'and at its end');
  assert.equal(breaksBlockLine(typed(4, '\n'), 4), false, 'one line break still keeps both on lines of their own');
  assert.equal(breaksBlockLine(typed(4, ''), 4), true);
  assert.equal(breaksBlockLine(typed(0, AI + '!\n\n'), 0), false);
  assert.equal(breaksBlockLine(typed(0, AI), 0), true, 'the text before a block no longer ends with a line break');
  assert.equal(breaksBlockLine(typed(1, 'The price was '), 1), false, 'typing inside a block is drawn inside it');
  assert.equal(breaksBlockLine(base, 2), false, 'a pill never is');
  assert.equal(breaksBlockLine(pieces('No blocks.', PARTS).list, 0), false);
});

test('shape: a block changed, found or lost changes it; text typed around the blocks does not', () => {
  const at = (t) => { const { list, blocks } = pieces(t, PARTS); return shape(list, blocks); };
  assert.equal(at(REPLY), at(REPLY.replace('Good morning', 'Hello')));
  assert.notEqual(at(REPLY), at(REPLY.replace('drive away', 'on the road')));
  assert.notEqual(at(REPLY), at(AI + '\n\n' + SIGN));
  // The pieces as typed (the block's words with more after them) against the pieces drawn afresh.
  const { list, blocks } = pieces(REPLY + '\nSydney', PARTS);
  const typed = list.map((p, n) => (n === 5 ? { ...p, text: SIGN + '\nLidcombe' } : p));
  const fresh = pieces(textOf(typed), PARTS);
  assert.notEqual(shape(typed, blocks), shape(fresh.list, fresh.blocks));
  assert.equal(partsKey(PARTS), partsKey(PARTS.map((p) => ({ ...p }))));
  assert.notEqual(partsKey(PARTS), partsKey(PARTS.slice(0, 2)));
  assert.equal(partsKey(null), '');
});
