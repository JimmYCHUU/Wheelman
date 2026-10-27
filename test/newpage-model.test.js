// The new page's model: pure functions that turn the server's data into plain words. Invented data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SECTIONS, CHIPS, rowView, whoLabel, segments, joinSegments, fillBlank, boxText, checkLines,
  mainAction, statusWords, statusAnnouncement, insteadOptions, wordCount, stageLine, leadStatusWords, sourceWords, providerWords, writtenBy, trustLine, factLine,
} from '../web/new/js/model.js';

const NOW = Date.parse('2026-10-26T02:00:00Z');
const row = (o = {}) => ({ key: 'k1', name: 'Sam Test', phone: '0491 570 101', email: '', anchor: 'a1', phoneOnly: false,
  lastAt: NOW - 60000, unread: 2, preview: { who: 'customer', text: 'Is it available?', media: 0 }, flag: 'none', car: '2019 Test Car', ...o });

test('SECTIONS and CHIPS are the exact lists', () => {
  assert.deepEqual(SECTIONS, [
    { id: 'dashboard', label: 'Dashboard', ready: true },
    { id: 'marketplace', label: 'Marketplace', ready: false },
    { id: 'importquery', label: 'Imports', ready: false },
    { id: 'auction', label: 'Auction', ready: false },
  ]);
  assert.deepEqual(CHIPS, [{ id: 'waiting', label: 'Needs reply' }, { id: 'followups', label: 'Follow-ups' }, { id: 'all', label: 'All' }]);
});

test('rowView names, car and preview', () => {
  const v = rowView(row(), { now: NOW });
  assert.equal(v.key, 'k1');
  assert.equal(v.name, 'Sam Test');
  assert.equal(v.car, '2019 Test Car');
  assert.equal(v.preview, 'Is it available?');
  assert.equal(v.unread, 2);
  assert.equal(v.done, false);
  assert.equal(v.reason, '');
  assert.equal(rowView(row({ name: '' }), { now: NOW }).name, '0491 570 101');
  assert.equal(rowView(row({ name: '', phone: '', email: 'a@example.com' }), { now: NOW }).name, 'a@example.com');
  assert.equal(rowView(row({ name: '', phone: '', email: '' }), { now: NOW }).name, 'Unknown number');
  assert.equal(rowView(row({ car: undefined }), { now: NOW }).car, '');
  assert.equal(rowView(row({ preview: { who: 'us', text: 'Yes', media: 0 } }), { now: NOW }).preview, 'You: Yes');
  assert.equal(rowView(row({ preview: { who: 'customer', text: '', media: 1 } }), { now: NOW }).preview, 'Photo');
});

test('rowView reasons, first match wins', () => {
  const r = (o) => rowView(row(o), { now: NOW }).reason;
  assert.equal(r({ followUp: { reason: 'No answer', kind: 'x' }, flag: 'fail' }), 'Follow-up: No answer');
  assert.equal(r({ flag: 'fail' }), 'Check failed');
  assert.equal(r({ flag: 'input' }), 'Blank to fill');
  assert.equal(r({ flag: 'error' }), 'Not written yet');
  assert.equal(r({ phoneOnly: true }), 'Phone only');
  assert.equal(r({ flag: 'ok' }), '');
});

test('rowView of a done row has unread 0 and the done reason', () => {
  const v = rowView(row({ followUp: { reason: 'x' }, flag: 'fail' }), { now: NOW, doneAnchor: 'a1' });
  assert.equal(v.done, true);
  assert.equal(v.unread, 0);
  assert.equal(v.reason, 'Copied, waiting for it to show on the dashboard');
  assert.equal(rowView(row(), { now: NOW, doneAnchor: 'other' }).done, false);
});

test('whoLabel', () => {
  assert.equal(whoLabel({ event: 'Booked', who: 'us' }, 'Sam'), null);
  assert.equal(whoLabel({ who: 'customer' }, 'Sam'), 'Sam');
  assert.equal(whoLabel({ who: 'customer' }, ''), 'Customer');
  assert.equal(whoLabel({ who: 'us', auto: true, by: 'Alex' }, 'Sam'), 'Auto-reply');
  assert.equal(whoLabel({ who: 'us', phone: true, by: 'Alex' }, 'Sam'), 'Us, from the phone');
  assert.equal(whoLabel({ who: 'us', by: 'Alex' }, 'Sam'), 'Us · Alex');
  assert.equal(whoLabel({ who: 'us' }, 'Sam'), 'Us');
});

test('segments and joinSegments round-trip any text', () => {
  for (const t of ['', 'Hello', 'Price [PRICE?] and [TRADE-IN VALUE?].', 'A [sic] note [price]', 'Two\n\nlines\n', 'Emoji 🙂 [PRICE?]', '[PRICE?][PRICE?]']) {
    assert.equal(joinSegments(segments(t)), t);
  }
  const s = segments('Price [PRICE?] ok');
  assert.deepEqual(s.map((x) => x.kind), ['text', 'blank', 'text']);
  assert.equal(s[1].raw, '[PRICE?]');
  assert.equal(s[1].label, 'PRICE');
});

test('fillBlank turns a blank into text, and a blank value keeps the pill', () => {
  const s = segments('Price [PRICE?] ok');
  const f = fillBlank(s, 1, ' $12,000 ');
  assert.equal(joinSegments(f), 'Price $12,000 ok');
  assert.equal(f[1].kind, 'text');
  assert.equal(s[1].kind, 'blank');
  const k = fillBlank(s, 1, '   ');
  assert.equal(k[1].kind, 'blank');
  assert.equal(joinSegments(k), 'Price [PRICE?] ok');
});

test('boxText', () => {
  assert.equal(boxText(null), '');
  assert.equal(boxText({ reply: 'A', edited: null }), 'A');
  assert.equal(boxText({ reply: 'A', edited: 'B' }), 'B');
  assert.equal(boxText({ reply: 'A', edited: '' }), '');
});

test('checkLines', () => {
  const c = [{ level: 'warn', message: 'w1' }, { level: 'fail', message: 'f1' }, { level: 'ok', message: 'o' }, { level: 'input', message: 'i1' }, { level: 'warn', message: 'w2' }];
  assert.deepEqual(checkLines(c), { fails: ['f1'], warns: ['w1', 'w2'], inputs: ['i1'] });
  assert.deepEqual(checkLines(undefined), { fails: [], warns: [], inputs: [] });
});

test('mainAction', () => {
  const fail = [{ level: 'fail', message: 'x' }];
  assert.deepEqual(mainAction({ text: 'a', checks: fail, overridden: false }), { kind: 'blocked', label: 'Fix the check first', secondary: null });
  assert.equal(mainAction({ text: 'a', checks: fail, overridden: true }).kind, 'copy');
  assert.deepEqual(mainAction({ text: 'a [PRICE?] [DEPOSIT LINK?]', checks: [], overridden: false }), { kind: 'fill', label: 'Fill 2 blanks', secondary: 'Copy with the blanks' });
  assert.deepEqual(mainAction({ text: 'a [PRICE?]', checks: [] }), { kind: 'fill', label: 'Fill 1 blank', secondary: 'Copy with the blank' });
  assert.deepEqual(mainAction({ text: 'a', checks: [] }), { kind: 'copy', label: 'Copy reply', secondary: null });
});

test('statusWords', () => {
  const ok = { at: NOW - 120000, ok: true };
  assert.deepEqual(statusWords({ missing: ['a key', 'a login'], syncing: true, lastSync: ok }, NOW), { tone: 'bad', text: 'Set-up needed: a key and a login' });
  assert.deepEqual(statusWords({ missing: [], syncing: true, lastSync: ok }, NOW), { tone: 'busy', text: 'Checking for new messages' });
  assert.deepEqual(statusWords({ missing: [], drafting: true, lastSync: ok }, NOW), { tone: 'busy', text: 'Writing' });
  const g = statusWords({ missing: [], lastSync: ok }, NOW);
  assert.equal(g.tone, 'ok');
  assert.match(g.text, /^Up to date, checked /);
  const b = statusWords({ missing: [], lastSync: { ok: false, at: NOW - 1000 } }, NOW);
  assert.equal(b.tone, 'bad');
  assert.match(b.text, /^Dashboard not reached since /);
  assert.deepEqual(statusWords({ missing: [], lastSync: null }, NOW), { tone: 'busy', text: 'Starting' });
});

test('insteadOptions: best first, skips the current one, at most 3', () => {
  const templates = [{ id: 'a', label: 'A', best: false }, { id: 'b', label: 'B', best: true }, { id: 'c', label: 'C' }, { id: 'd', label: 'D' }, { id: 'e', label: 'E', best: true }];
  assert.deepEqual(insteadOptions({ template: '', templates }), [{ id: 'b', label: 'B' }, { id: 'e', label: 'E' }, { id: 'a', label: 'A' }]);
  assert.deepEqual(insteadOptions({ template: 'b', templates }), [{ id: '', label: 'A reply to what they wrote' }, { id: 'e', label: 'E' }, { id: 'a', label: 'A' }]);
  assert.deepEqual(insteadOptions({ template: '', templates: [] }), []);
  assert.deepEqual(insteadOptions({ template: '' }), []);
});

test('wordCount', () => {
  assert.deepEqual(wordCount(''), { words: 0, texts: 0 });
  assert.deepEqual(wordCount('one two  three\nfour'), { words: 4, texts: 1 });
  assert.equal(wordCount('x'.repeat(161)).texts, 2);
});

test('statusAnnouncement speaks only an ok/problem change or new words on a problem, never busy', () => {
  const ok1 = { tone: 'ok', text: 'Up to date, checked just now' };
  const ok2 = { tone: 'ok', text: 'Up to date, checked 1 min ago' };
  const busy = { tone: 'busy', text: 'Checking for new messages' };
  const bad1 = { tone: 'bad', text: 'Dashboard not reached since 9:00 am' };
  const bad2 = { tone: 'bad', text: 'Set-up needed: a key' };
  assert.equal(statusAnnouncement(null, busy), null);
  assert.equal(statusAnnouncement(null, bad1), bad1.text);
  assert.equal(statusAnnouncement(ok1, ok2), null);
  assert.equal(statusAnnouncement(ok1, busy), null);
  assert.equal(statusAnnouncement(ok1, ok2), null);
  assert.equal(statusAnnouncement(ok1, bad1), bad1.text);
  assert.equal(statusAnnouncement(bad1, ok1), ok1.text);
  assert.equal(statusAnnouncement(bad1, busy), null);
  assert.equal(statusAnnouncement(bad1, bad1), null);
  assert.equal(statusAnnouncement(bad1, bad2), bad2.text);
});

test('stageLine reads the sale record first, then the lead status', () => {
  const steps = ['Enquiry', 'Inspection booked', 'Seen the car', 'Deposit', 'Sold'];
  assert.deepEqual(stageLine({ deal: { stage: 'deposit_paid' }, leadStatus: 'INSPECTION' }), { steps, current: 3, source: 'From the sale record' });
  assert.equal(stageLine({ deal: { stage: 'payment_pending' } }).current, 3);
  assert.equal(stageLine({ deal: { stage: 'paid_in_full' } }).current, 4);
  assert.equal(stageLine({ deal: { stage: 'delivered' } }).current, 4);
  for (const [status, current] of [['INSPECTION', 1], ['INSPECTION_DONE', 2], ['DEPOSIT_RECEIVED', 3], ['CAR_SOLD', 4]]) {
    assert.deepEqual(stageLine({ deal: null, leadStatus: status }), { steps, current, source: 'From the lead status' });
  }
  assert.deepEqual(stageLine({ deal: { stage: 'unknown' }, leadStatus: 'HOT' }), { steps, current: 0, source: '' });
  assert.deepEqual(stageLine({}), { steps, current: 0, source: '' });
});

test('leadStatusWords says the lead status in the stage line own words', () => {
  assert.equal(leadStatusWords('INSPECTION'), 'Inspection booked');
  assert.equal(leadStatusWords('INSPECTION_DONE'), 'Seen the car');
  assert.equal(leadStatusWords('DEPOSIT_RECEIVED'), 'Deposit');
  assert.equal(leadStatusWords('CAR_SOLD'), 'Sold');
  assert.equal(leadStatusWords('NEW'), 'New enquiry');
  assert.equal(leadStatusWords('HOT_LEAD'), 'Hot lead');
  assert.equal(leadStatusWords(''), '');
  assert.equal(leadStatusWords(undefined), '');
});

test('sourceWords names where a customer came from', () => {
  assert.equal(sourceWords('carsales'), 'Carsales');
  assert.equal(sourceWords('Carsales SMS Connect'), 'Carsales (text message)');
  assert.equal(sourceWords('Dealer Studio'), 'Autotrader');
  assert.equal(sourceWords('Website contact form'), 'Website, contact form');
  assert.equal(sourceWords('some_new_source'), 'some new source');
  assert.equal(sourceWords(''), '');
});

test('writtenBy names the model and its provider in words', () => {
  assert.equal(providerWords('gemini'), 'Gemini (Google)');
  assert.equal(providerWords('openai'), 'ChatGPT (OpenAI)');
  assert.equal(providerWords('openrouter'), 'OpenRouter');
  assert.equal(providerWords('something-else'), '');
  assert.equal(writtenBy({ provider: 'gemini', model: 'model-a' }), 'Written by model-a, from Gemini (Google).');
  assert.equal(writtenBy({ provider: 'openai', model: 'gpt-test' }), 'Written by gpt-test, from ChatGPT (OpenAI).');
  assert.equal(writtenBy({ provider: 'openrouter', model: 'some/model:free' }), 'Written by some/model:free, from OpenRouter.');
  assert.equal(writtenBy({ provider: 'none', model: 'your wording' }), 'Written from your wording, with no AI.');
  assert.equal(writtenBy({ provider: 'none' }), 'Written from your wording, with no AI.');
  assert.equal(writtenBy({ provider: 'something-else', model: 'model-z' }), 'Written by model-z.');
  assert.equal(writtenBy({}), 'Written by the AI model.');
});

const facts2 = [
  { label: 'Price', value: '$31,900', source: 'the stock record', ok: true },
  { label: '', value: 'https://example.test/car/1800', source: 'your wording file', ok: true },
];
const withFacts = (facts, reply = 'The price is $31,900.') => ({ status: 'ready', reply, facts, checks: [] });

test('trustLine counts checked facts', () => {
  const d = withFacts(facts2);
  assert.deepEqual(trustLine(d, d.reply), { tone: 'good', text: '2 facts checked', facts: facts2 });
  assert.equal(trustLine(withFacts([facts2[0]]), 'The price is $31,900.').text, '1 fact checked');
});

test('trustLine with no facts says so', () => {
  const none = trustLine(withFacts([]), 'The price is $31,900.');
  assert.deepEqual(none, { tone: 'none', text: 'No figures or links to check.' });
  assert.equal(trustLine({ status: 'ready', reply: 'Hi.', checks: [] }, 'Hi.').text, 'No figures or links to check.');
  assert.equal(trustLine(withFacts(facts2), '  '), null, 'an empty box has no line');
});

test('trustLine names a fact not in the records', () => {
  const bad = { label: '', value: '$29,990', source: 'not found in the records', ok: false };
  const d = withFacts([facts2[0], bad], 'It is $29,990.');
  const line = trustLine(d, 'It is $29,990.');
  assert.equal(line.tone, 'bad');
  assert.equal(line.text, '1 fact not in your records');
  assert.equal(line.facts.length, 2);
  const comma = { label: '', value: '$29,990,', source: 'not found in the records', ok: false };
  assert.equal(trustLine(withFacts([comma], 'It is $29,990, ok.'), 'It is $29,990, ok.').text, '1 fact not in your records');
  const two = [bad, { ...bad, value: '$1' }];
  assert.equal(trustLine(withFacts(two, 'It is $29,990.'), 'It is $29,990.').text, '2 facts not in your records');
});

test('trustLine says typed text is not checked', () => {
  const d = withFacts(facts2);
  assert.deepEqual(trustLine(d, 'My own words'), { tone: 'none', text: 'What you typed has not been checked.' });
  assert.deepEqual(trustLine(null, 'My own words'), { tone: 'none', text: 'What you typed has not been checked.' });
  const bad = withFacts([{ label: '', value: '$1', source: 'not found in the records', ok: false }], 'It is $1.');
  assert.equal(trustLine(bad, 'It is $2.').tone, 'none', 'typed text is never called checked or failed');
});

test('factLine: label, value and source, or the value once; a failing fact in red words', () => {
  assert.equal(factLine(facts2[0]), 'Price · $31,900 · from the stock record');
  assert.equal(factLine(facts2[1]), 'https://example.test/car/1800 · from your wording file');
  assert.equal(factLine({ label: '', value: '$29,990', source: 'not found in the records', ok: false }), '$29,990 · not in your records');
  assert.equal(factLine({ label: '$31,900', value: '$31,900', source: 'business facts', ok: true }), '$31,900 · from business facts');
});

test('trustLine is green only when nothing else is wrong', () => {
  const reply = 'The price is $31,900.';
  const plain = trustLine(withFacts(facts2, reply), reply);
  assert.equal(plain.tone, 'good');
  const failing = { ...withFacts(facts2, reply), checks: [{ level: 'fail', code: 'x', tokens: [], message: 'Check this.' }] };
  assert.deepEqual([trustLine(failing, reply).tone, trustLine(failing, reply).text], ['none', '2 facts checked']);
  const warning = { ...withFacts(facts2, reply), checks: [{ level: 'warn', code: 'x', tokens: [], message: 'Hmm.' }] };
  assert.equal(trustLine(warning, reply).tone, 'none');
  const blankReply = 'The price is [PRICE?], see $31,900.';
  assert.equal(trustLine(withFacts(facts2, blankReply), blankReply).tone, 'none', 'a blank still to fill');
});

test('trustLine: typed text, however small the change, is not checked', () => {
  const blankReply = 'The price is [PRICE?].';
  const d = withFacts(facts2, blankReply);
  const unchecked = { tone: 'none', text: 'What you typed has not been checked.' };
  assert.deepEqual(trustLine(d, 'The price is $25,990.'), unchecked, 'a filled blank is typed text');
  const d2 = withFacts(facts2, 'Hello, the car is here.');
  assert.deepEqual(trustLine(d2, 'Hello, the car is here!'), unchecked, 'one character');
  assert.deepEqual(trustLine({ ...withFacts(facts2, ''), status: 'failed' }, 'Mine'), unchecked, 'beside a failed suggestion');
});

import { rememberOffer, ruleWords, lessonLines } from '../web/new/js/model.js';
import { SITUATIONS } from '../src/situations.js';

test('rememberOffer is offered only for a Dashboard draft with an instruction', () => {
  const item = { key: 'c:1', situation: 'Price, discount or offer' };
  const d = { id: 5, instruction: 'Do not mention finance' };
  assert.deepEqual(rememberOffer(item, d), { scope: 'price_negotiation', label: 'Remember for price questions' });
  assert.deepEqual(rememberOffer({ key: 'em:9' }, d), { scope: 'any', label: 'Remember for every reply' });
  assert.deepEqual(rememberOffer({ key: 'l:3', situation: 'General enquiry' }, d), { scope: 'general', label: 'Remember for general enquiries' });
  assert.equal(rememberOffer(item, { id: 5 }), null);
  assert.equal(rememberOffer({ key: 'm:1', situation: item.situation }, d), null);
  assert.equal(rememberOffer({ key: 'ip:1' }, d), null);
  assert.equal(rememberOffer(item, d, [5]), null);
  assert.equal(rememberOffer(item, null), null);
});

test('every situation the server names is a scope the page can remember for', () => {
  for (const s of Object.values(SITUATIONS)) assert.ok(rememberOffer({ key: 'c:1', situation: s.label }, { id: 1, instruction: 'x' }), s.label);
  for (const [key, s] of Object.entries(SITUATIONS)) assert.equal(rememberOffer({ key: 'c:1', situation: s.label }, { id: 1, instruction: 'x' }).scope, key);
});

test('ruleWords says one plain sentence for each rule that fired', () => {
  assert.deepEqual(ruleWords(null), []);
  assert.deepEqual(ruleWords({ standard: false, price: false }), []);
  assert.deepEqual(ruleWords({ standard: true, price: true, invite: false, again: true }), [
    'Added the first-reply details for a new enquiry', 'Added the price reply', 'Left out the greeting and sign-off: not the first reply today',
  ]);
});

test('lessonLines gives each lesson with its day in Sydney time', () => {
  const now = Date.parse('2026-10-27T02:00:00Z');
  const lines = lessonLines([{ adviceId: 1, do: 'Do not mention finance', at: Date.parse('2026-10-26T02:00:00Z') }, { do: 'Keep it short', at: Date.parse('2026-10-20T02:00:00Z') }, { do: 'Old', at: 0 }], now);
  assert.deepEqual(lines, [
    { text: 'Do not mention finance', from: 'from yesterday' }, { text: 'Keep it short', from: 'from Tuesday 20 October' }, { text: 'Old', from: '' },
  ]);
  assert.deepEqual(lessonLines(null), []);
});
