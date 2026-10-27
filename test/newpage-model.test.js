// The new page's model: pure functions that turn the server's data into plain words. Invented data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SECTIONS, CHIPS, rowView, whoLabel, segments, joinSegments, fillBlank, boxText, checkLines,
  mainAction, statusWords, statusAnnouncement, insteadOptions, wordCount, stageLine, leadStatusWords, sourceWords, providerWords, writtenBy,
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
