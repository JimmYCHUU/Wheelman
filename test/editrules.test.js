// Repeated edits proposed as lessons (R9.3): what was removed, added or changed between what
// Wheelman wrote and what was copied, found word by word and grouped across suggestions. The rows
// are invented, in the shape the database gives them.
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { applyTestEnv } from './support/env.js';

applyTestEnv();

let rules, db;
before(async () => {
  rules = await import('../src/editrules.js');
  db = await import('../src/db.js');
});

const now = Date.now();
const HOUR = 3600e3;
let nextDraft = 1;
/** One learned row, as editRows gives it: what Wheelman wrote and what was copied. */
const row = (wrote, sent, { channel = 'sms', situations = ['availability'], agoH = 1 } = {}) => {
  const id = nextDraft++;
  return { draft_id: id, item_key: channel === 'email' ? `em:${id}` : `c:${600 + id}`, channel, situations, draft_text: wrote, final_text: sent, at: now - agoH * HOUR };
};
const KINDLY = [
  ['Could you kindly send us your number?', 'Could you send us your number?'],
  ['We would kindly ask you to call first.', 'We ask you to call first.'],
  ['Kindly let us know a time.', 'Let us know a time.'],
  ['Please kindly confirm the day.', 'Please confirm the day.'],
];
const kindlyRows = (opts = {}, n = 4) => KINDLY.slice(0, n).map(([w, s], i) => row(w, s, { agoH: 4 - i, ...opts }));

test('the words removed, added or changed are found, with the sentence around them', () => {
  assert.deepEqual(rules.editHunks('Hello {{NAME}},\nCould you kindly send us your number? We will call you back.', 'Hello {{NAME}},\nCould you send us your number? We will call you back.'),
    [{ removed: 'kindly', added: '', beforeSentence: 'Could you kindly send us your number?', afterSentence: 'Could you send us your number?' }]);
  assert.deepEqual(rules.editHunks('We are happy to assist.', 'We are happy to help.'),
    [{ removed: 'assist', added: 'help', beforeSentence: 'We are happy to assist.', afterSentence: 'We are happy to help.' }]);
  // A whole sentence added keeps its full stop, and is shown after the sentence it follows.
  assert.deepEqual(rules.editHunks('Thanks for your message. We are open today.', 'Thanks for your message. Please call before visiting. We are open today.'),
    [{ removed: '', added: 'Please call before visiting.', beforeSentence: 'Thanks for your message.', afterSentence: 'Thanks for your message. Please call before visiting.' }]);
  // Capitals and punctuation alone are no edit; two edits are two hunks, each with its own sentence.
  assert.deepEqual(rules.editHunks('Kindly let us know a time.', 'kindly let us know a time!'), []);
  assert.deepEqual(rules.editHunks('We are happy to assist.\nKindly call us.', 'We are happy to help.\nCall us.').map((h) => [h.removed, h.added, h.afterSentence]),
    [['assist', 'help', 'We are happy to help.'], ['Kindly', '', 'Call us.']]);
});

test('an edit made on three suggestions is proposed with three examples, newest first; two are not enough', () => {
  const kindly = kindlyRows();
  const vehicle = [row('The vehicle is ready to inspect.', 'The car is ready to inspect.'), row('We can hold the vehicle until Saturday.', 'We can hold the car until Saturday.')];
  const out = rules.proposalsFrom([...vehicle, ...kindly]);
  assert.deepEqual(out, [{
    key: 'sms|remove|kindly|', kind: 'remove', removed: 'kindly', added: '', channel: 'sms', scope: 'availability', count: 4,
    examples: [
      { before: 'Please kindly confirm the day.', after: 'Please confirm the day.', at: now - HOUR },
      { before: 'Kindly let us know a time.', after: 'Let us know a time.', at: now - 2 * HOUR },
      // "would kindly" was taken out here: it holds "kindly", which counts.
      { before: 'We would kindly ask you to call first.', after: 'We ask you to call first.', at: now - 3 * HOUR },
    ],
    itemKey: kindly[3].item_key,
  }]);
  // The two changes of "vehicle" to "car" are proposed only when two are enough, after the one made most.
  assert.deepEqual(rules.proposalsFrom([...vehicle, ...kindly], { threshold: 2 }).map((p) => [p.key, p.count]), [['sms|remove|kindly|', 4], ['sms|replace|vehicle|car', 2]]);
  // A decided edit is not proposed again; the same edit twice in one suggestion counts once.
  assert.deepEqual(rules.proposalsFrom(kindly, { decided: new Map([['sms|remove|kindly|', { decision: 'rejected' }]]) }), []);
  assert.deepEqual(rules.proposalsFrom([row('Kindly call. Kindly write.', 'Call. Write.'), ...kindlyRows({}, 1)]), []);
  // A sentence taken out on three suggestions is proposed as the sentence, not as its words.
  const bye = [1, 2, 3].map((n) => row(`Your car is ready. We look forward to hearing from you. See you ${['soon', 'then', 'there'][n - 1]}.`, `Your car is ready. See you ${['soon', 'then', 'there'][n - 1]}.`));
  assert.deepEqual(rules.proposalsFrom(bye).map((p) => [p.kind, p.removed, p.count]), [['remove', 'We look forward to hearing from you.', 3]]);
});

test('repeated edits are proposed only from replies copied from Wheelman, never from a filled blank, a figure, a link or a name', () => {
  const three = (wrote, sent) => [1, 2, 3].map(() => row(wrote, sent));
  // A blank filled in, a figure changed, a link changed, a name added mid-sentence.
  assert.deepEqual(rules.proposalsFrom(three('The price is [PRICE?] drive away.', 'The price is $31,900 drive away.')), []);
  assert.deepEqual(rules.proposalsFrom(three('Your [CAR NAME?] is ready.', 'Your car is ready.')), []);
  assert.deepEqual(rules.proposalsFrom(three('It has done 48,000 km.', 'It has done 49,000 km.')), []);
  assert.deepEqual(rules.proposalsFrom(three('See it here: https://www.carbarn.com.au/vehicles/toyota/noah/1', 'See it here: https://www.carbarn.com.au/vehicles/toyota/noah/2')), []);
  assert.deepEqual(rules.proposalsFrom(three('We will see you at ten.', 'We will see you and Dana at ten.')), []);
  assert.deepEqual(rules.proposalsFrom(three('Hello {{NAME}}, we are open today.', 'Hello, we are open today.')), []);
  // Only small words, or more than eight words at once, are not an edit to learn.
  assert.deepEqual(rules.proposalsFrom(three('Yes, we can do that for you.', 'Yes, we can do that.')), []);
  assert.deepEqual(rules.proposalsFrom(three('Thanks.', 'Thanks. We have three more like it coming in from the auction next week, all checked.')), []);

  // In the database, a learned row whose suggestion was never copied from Wheelman is left out.
  const learned = (itemKey, anchorKey, { copied = true, changed = true } = {}) => {
    const id = db.insertDraft({ itemKey, anchorKey, situation: 'availability', reply: 'Could you kindly call us?', status: 'ready', checks: [] });
    if (copied) db.recordCopied(id, 'Could you call us?');
    db.upsertLearned({ draftId: id, itemKey, situations: ['availability'], firstReply: false, customerText: 'Is it still there?', draftText: 'Could you kindly call us?', finalText: changed ? 'Could you call us?' : 'Could you kindly call us?', source: 'sent', changed, similarity: 0.9, at: now });
    return id;
  };
  const copied = learned('c:901', 'm:1');
  learned('c:902', 'm:2', { copied: false });
  learned('c:903', 'm:3', { changed: false });
  const rows = db.editRows();
  assert.deepEqual(rows.map((r) => r.draft_id), [copied]);
  assert.deepEqual(rows[0], { draft_id: copied, item_key: 'c:901', channel: 'sms', situations: ['availability'], draft_text: 'Could you kindly call us?', final_text: 'Could you call us?', at: now });
});

test("a proposal's scope is the kind of message all its examples share, else every reply", () => {
  assert.equal(rules.proposalsFrom(kindlyRows({ situations: ['inspection_booking', 'availability'] }, 3))[0].scope, 'inspection_booking');
  const mixed = kindlyRows({}, 3);
  mixed[1].situations = ['price_negotiation'];
  assert.equal(rules.proposalsFrom(mixed)[0].scope, 'any');
  assert.equal(rules.proposalsFrom(kindlyRows({ situations: [] }, 3))[0].scope, 'any');
});

test("emails' edits are proposed for emails and texts' for texts", () => {
  const two = (channel) => kindlyRows({ channel }, 2);
  assert.deepEqual(rules.proposalsFrom([...two('email'), ...two('sms')]), []);
  assert.deepEqual(rules.proposalsFrom(kindlyRows({ channel: 'email' }, 3)).map((p) => [p.key, p.channel]), [['email|remove|kindly|', 'email']]);
  assert.deepEqual(rules.proposalsFrom(kindlyRows({ channel: 'sms' }, 3)).map((p) => [p.key, p.channel]), [['sms|remove|kindly|', 'sms']]);
});
