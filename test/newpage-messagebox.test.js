// The new page's message box, as pure functions: which state it is in, what the checks still say
// about the text in the box, the save note and the word count. Invented data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { blankWords, wordsChanged, liveChecks, boxView, plainPaste, wordsLine, saveWords, mainAction } from '../web/new/js/model.js';
import { clock } from '../web/lib/format.js';

const AT = Date.parse('2026-10-26T22:40:00Z'); // 9:40 am in Sydney
const draft = (o = {}) => ({ id: 1, status: 'ready', reply: 'Hello [PRICE?].', edited: null, checks: [], error: '', instruction: '', ...o });
const item = (o = {}) => ({ key: 'c:1', anchor: 'a1', state: 'awaiting', draft: draft(), followUp: null, dismissed: false, writing: false, note: '', ...o });

test('blankWords names a blank in words, as the old page did', () => {
  assert.equal(blankWords('PRICE'), 'the price');
  assert.equal(blankWords('DEPOSIT LINK'), 'the deposit link');
  assert.equal(blankWords('SHIP'), "the ship's name");
  assert.equal(blankWords('CHECK'), 'something to confirm');
  assert.equal(blankWords('ELIGIBILITY'), 'whether it can be imported');
  assert.equal(blankWords('SOLD PRICE'), 'the sold price');
});

test('wordsChanged: filling a blank is not a change of words, anything else is', () => {
  const reply = 'The price is [PRICE?], see you [DATE?].';
  assert.equal(wordsChanged(reply, reply), false);
  assert.equal(wordsChanged(reply, 'The price is $25,990, see you [DATE?].'), false);
  assert.equal(wordsChanged(reply, 'The price is $25,990, see you on Saturday.'), false);
  assert.equal(wordsChanged(reply, 'The price is $25,990, see you soon!'), true);
  assert.equal(wordsChanged(reply, 'Our price is $25,990, see you Saturday.'), true);
  assert.equal(wordsChanged(reply, 'The price is , see you [DATE?].'), true, 'a blank taken out is a change');
  assert.equal(wordsChanged(reply, ''), true);
  assert.equal(wordsChanged('No blanks here.', 'No blanks here.'), false);
  assert.equal(wordsChanged('No blanks here.', 'No blanks here!'), true);
  assert.equal(wordsChanged('[DATE?][PRICE?]', 'xy'), false);
  assert.equal(wordsChanged('[DATE?][PRICE?]', 'x'), true, 'two blanks need two fills');
});

test('liveChecks: what still applies to the text in the box', () => {
  const checks = [
    { level: 'fail', code: 'figure', tokens: ['$31,990'], message: 'Check this figure: $31,990 is not in your records.' },
    { level: 'warn', code: 'long', tokens: [], message: 'Long for a text message (120 words).' },
    { level: 'warn', code: 'filler', tokens: ['just'], message: '"just" reads as filler.' },
    { level: 'input', code: 'marker', tokens: ['[PRICE?]'], message: 'Fill in the blank before sending.' },
    { level: 'input', code: 'price', tokens: [], message: 'This talks about price. Confirm the figure before sending.' },
    { level: 'ok', code: 'ok', tokens: [], message: 'Figures and links match your records.' },
  ];
  const reply = 'It is $31,990 and [PRICE?], just so you know.';
  const d = draft({ reply, checks });
  const codes = (t) => liveChecks(d, t).map((c) => c.code);
  assert.deepEqual(codes(reply), ['figure', 'long', 'filler', 'price'], 'untouched: all but the blank line and the ok line');
  assert.deepEqual(codes('It is $31,990 and $5, just so you know.'), ['figure', 'long', 'filler', 'price'], 'a filled blank changes nothing');
  assert.deepEqual(codes('It is $32,990 and $5, so you know it.'), ['price'], 'the figure and the filler are gone, and the length was about the suggestion');
  assert.deepEqual(codes('It is $31,990 now.'), ['figure', 'price'], 'a figure still there still fails');
  assert.deepEqual(liveChecks(null, 'x'), []);
  assert.deepEqual(liveChecks(draft({ checks: undefined }), 'x'), []);
});

test('boxView: writing first, then done, then a follow-up, then the conversation states', () => {
  assert.deepEqual(boxView({ item: null }), { kind: 'none' });
  assert.equal(boxView({ item: item(), writing: true }).kind, 'writing');
  assert.equal(boxView({ item: item({ writing: true }) }).kind, 'writing');
  assert.deepEqual(boxView({ item: item() }), { kind: 'editor', context: '' });

  const done = boxView({ item: item(), done: true, doneAt: AT });
  assert.equal(done.sentence, 'Copied at ' + clock(AT) + '.');
  assert.equal(done.tone, 'good');
  assert.deepEqual(done.button, { label: 'Put back in Needs reply', act: 'put-back', main: false });
  assert.equal(done.tell, false);
  assert.equal(boxView({ item: item(), done: true }).sentence, 'Copied.');
});

test('boxView: the follow-up states', () => {
  const fu = { id: 5, reason: 'Inspection passed yesterday', done: '' };
  const mine = (o = {}) => item({ anchor: 'fu:5', state: 'answered', followUp: { ...fu, ...o.fu }, draft: o.draft === undefined ? draft() : o.draft });
  assert.deepEqual(boxView({ item: mine() }), { kind: 'editor', context: 'Follow-up: Inspection passed yesterday' });
  const due = boxView({ item: mine({ draft: null }) });
  assert.equal(due.sentence, 'Inspection passed yesterday. A follow-up is due. Nothing is sent by itself: write it, check it, then copy it.');
  assert.deepEqual(due.button, { label: 'Write the follow-up', act: 'write-followup', main: true });
  assert.equal(due.tell, true);
  const fromAll = boxView({ item: item({ state: 'answered', followUp: fu, draft: null }) });
  assert.equal(fromAll.button.act, 'write-followup');
  const failed = boxView({ item: mine({ draft: draft({ status: 'failed', reply: '', error: 'The model is overloaded.' }) }) });
  assert.equal(failed.sentence, 'The follow-up could not be written. The model is overloaded.');
  assert.equal(failed.tone, 'bad');
  assert.deepEqual(failed.button, { label: 'Try again', act: 'retry', main: true });
  const copied = boxView({ item: mine({ fu: { done: 'copied' } }) });
  assert.equal(copied.sentence, 'You copied this follow-up. It has left Follow-ups.');
  assert.deepEqual(copied.button, { label: 'Put back in Follow-ups', act: 'restore-followup', main: false });
  assert.equal(boxView({ item: mine({ fu: { done: 'dismissed' } }) }).sentence, 'You dismissed this follow-up.');
  const doneHere = boxView({ item: mine(), done: true, doneAt: AT });
  assert.deepEqual(doneHere.button, { label: 'Put back in Follow-ups', act: 'restore-followup', main: false });
});

test('boxView: no draft, a failed one, and the states with nothing to answer', () => {
  const none = boxView({ item: item({ draft: null }) });
  assert.equal(none.sentence, 'No suggestion yet.');
  assert.deepEqual(none.button, { label: 'Write it now', act: 'write', main: true });
  assert.equal(none.tell, true);
  const failed = boxView({ item: item({ draft: draft({ status: 'failed', reply: '', error: 'The model is overloaded.' }) }) });
  assert.equal(failed.sentence, 'A suggestion could not be written. The model is overloaded.');
  assert.deepEqual(failed.button, { label: 'Try again', act: 'retry', main: true });
  assert.equal(boxView({ item: item({ draft: draft({ status: 'failed', reply: '', error: '' }) }) }).sentence, 'A suggestion could not be written.');

  const answered = boxView({ item: item({ state: 'answered', draft: null }) });
  assert.equal(answered.sentence, 'We have replied. Nothing is waiting here.');
  assert.deepEqual(answered.button, { label: 'Write a reply anyway', act: 'write', main: false });
  assert.equal(answered.tell, true);
  assert.equal(boxView({ item: item({ state: 'ack', note: 'Customer only said thanks or OK. No reply needed.', draft: null }) }).sentence, 'Customer only said thanks or OK. No reply needed.');
  assert.equal(boxView({ item: item({ state: 'closed', draft: null }) }).sentence, 'No reply needed.');
  assert.equal(boxView({ item: item({ state: 'answered' }) }).kind, 'editor', 'a reply written anyway is shown');

  const optout = boxView({ item: item({ state: 'optout', draft: draft({ status: 'blocked', reply: '' }) }) });
  assert.equal(optout.sentence, 'This customer asked not to be contacted. Do not reply.');
  assert.equal(optout.button, null, 'the server never writes for them');
  assert.equal(optout.tone, 'bad');

  const dismissed = boxView({ item: item({ dismissed: true }) });
  assert.equal(dismissed.sentence, 'You dismissed this conversation. It comes back by itself if the customer writes again.');
  assert.deepEqual(dismissed.button, { label: 'Put back in Needs reply', act: 'restore', main: false });
});

test('wordsLine counts words, and texts only when there is more than one', () => {
  assert.equal(wordsLine(''), '0 words');
  assert.equal(wordsLine('one'), '1 word');
  assert.equal(wordsLine('one two three'), '3 words');
  assert.equal(wordsLine('word '.repeat(40).trim()), '40 words · about 2 texts');
});

test('saveWords: saving, saved with the time, not saved, and an edit saved before a reload', () => {
  assert.equal(saveWords({ save: { state: 'saving', at: null }, draft: draft(), typed: 'x' }), 'Saving…');
  assert.equal(saveWords({ save: { state: 'saved', at: AT }, draft: draft(), typed: 'x' }), 'Your changes are saved · ' + clock(AT));
  assert.equal(saveWords({ save: { state: 'failed', at: null }, draft: draft(), typed: 'x' }), 'Not saved yet. Your text is kept in this window.');
  assert.equal(saveWords({ save: { state: 'idle', at: null }, draft: draft({ edited: 'Mine', editedAt: AT }), typed: null }), 'Your changes are saved · ' + clock(AT));
  assert.equal(saveWords({ save: { state: 'idle', at: null }, draft: draft(), typed: null }), '');
  assert.equal(saveWords({ save: { state: 'idle', at: null }, draft: null, typed: null }), '');
});

test('boxView keeps the editor while there is typed text: a new message, its writing or its failure never hide it', () => {
  const typed = (o) => boxView({ item: item(o), typed: true });
  assert.deepEqual(typed({ draft: null }), { kind: 'editor', context: '' }, 'the new message has no suggestion yet');
  assert.deepEqual(typed({ writing: true }), { kind: 'editor', context: '' }, 'Wheelman is writing in the background');
  assert.equal(typed({ draft: draft({ status: 'failed', reply: '', error: 'x' }) }).kind, 'editor');
  assert.equal(typed({ state: 'answered', draft: null }).kind, 'editor');
  assert.equal(boxView({ item: item({ anchor: 'fu:5', followUp: { id: 5, reason: 'Inspection passed', done: '' }, draft: null }), typed: true }).context, 'Follow-up: Inspection passed');
  // Only a write this page started, done, opted out and dismissed take the box over.
  assert.equal(boxView({ item: item({ draft: null }), typed: true, writing: true }).kind, 'writing');
  assert.equal(boxView({ item: item(), typed: true, done: true }).sentence, 'Copied.');
  assert.equal(typed({ state: 'optout' }).sentence, 'This customer asked not to be contacted. Do not reply.');
  assert.equal(typed({ dismissed: true }).button.act, 'restore');
  assert.equal(boxView({ item: item({ anchor: 'fu:5', followUp: { id: 5, reason: 'x', done: 'copied' } }), typed: true }).button.act, 'restore-followup');
});

test('plainPaste: Windows line ends and non-breaking spaces become plain ones', () => {
  assert.equal(plainPaste('One\r\nTwo\rThree four  five'), 'One\nTwo\nThree four  five');
  assert.equal(plainPaste(''), '');
});

test('mainAction with a failed check and an empty blank: fill it first, and nothing copies past the check', () => {
  const fail = [{ level: 'fail', message: 'x' }];
  assert.deepEqual(mainAction({ text: 'It is $31,990 on [DATE?]', checks: fail, overridden: false }), { kind: 'fill', label: 'Fill 1 blank', secondary: null });
  assert.equal(mainAction({ text: 'It is $31,990 on Saturday', checks: fail, overridden: false }).kind, 'blocked');
  assert.deepEqual(mainAction({ text: 'It is $31,990 on [DATE?]', checks: fail, overridden: true }), { kind: 'fill', label: 'Fill 1 blank', secondary: 'Copy with the blank' });
});

test('boxView shows a failed suggestion beside the kept text, and after a reload beside the saved edit', () => {
  const failed = (o = {}) => draft({ status: 'failed', reply: '', error: 'The model is overloaded.', ...o });
  assert.deepEqual(boxView({ item: item({ draft: failed() }), typed: true }),
    { kind: 'editor', context: '', failure: 'A suggestion could not be written. The model is overloaded. Your text is kept.' });
  assert.deepEqual(boxView({ item: item({ draft: failed({ edited: 'My words' }) }) }),
    { kind: 'editor', context: '', failure: 'A suggestion could not be written. The model is overloaded. Your text is kept.' });
  const fu = boxView({ item: item({ anchor: 'fu:5', state: 'answered', followUp: { id: 5, reason: 'Inspection passed', done: '' }, draft: failed({ edited: 'Mine' }) }) });
  assert.deepEqual(fu, { kind: 'editor', context: 'Follow-up: Inspection passed', failure: 'The follow-up could not be written. The model is overloaded. Your text is kept.' });
  // Nothing typed, or emptied: the failure alone, with Try again.
  assert.equal(boxView({ item: item({ draft: failed() }) }).kind, 'quiet');
  assert.equal(boxView({ item: item({ draft: failed({ edited: '' }) }) }).kind, 'quiet');
  assert.equal('failure' in boxView({ item: item() }), false);
});
