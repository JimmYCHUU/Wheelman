// Each figure and link in a draft is traced to where it came from. Invented data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyTestEnv } from './support/env.js';

applyTestEnv({});
const { traceFacts } = await import('../src/checks.js');
const { maskTrusted, restoreFacts } = await import('../src/factmarkers.js');

const NOAH = 'https://www.carbarn.com.au/vehicles/toyota/noah/zrr80g/1159';
const BOOK = 'https://www.carbarn.com.au/book-inspection/1159';
const pieces = [
  { source: 'the stock record', text: `Stock number: T1159\nPrice: $28,900\nOdometer: 62,733 km\nPage: ${NOAH}` },
  { source: 'our earlier messages', text: 'We sent the details on Monday.' },
  { source: 'business facts', text: '- Warranty: up to $5,000 per claim on the powertrain.' },
  { source: 'the website', text: 'Delivery from $450 within Sydney.' },
  { source: 'what the customer said', text: 'I can pay $25,000 on Friday.' },
  { source: 'your instruction', text: 'Offer a $200 fuel voucher.' },
];

test('a price from the stock record is traced to it with its label', () => {
  const facts = traceFacts('The Noah is $28,900 with 62,733 km.', pieces, []);
  assert.deepEqual(facts, [
    { label: 'Price', value: '$28,900', source: 'the stock record', ok: true },
    { label: 'Odometer', value: '62,733 km', source: 'the stock record', ok: true },
  ]);
});

test('a warranty figure is traced to business facts', () => {
  const [fact] = traceFacts('The warranty covers up to $5,000 per claim.', pieces, []);
  assert.deepEqual(fact, { label: 'Warranty', value: '$5,000', source: 'business facts', ok: true });
});

test('a booking link in the invitation is from the stock record, the block\'s own figures from your wording file', () => {
  const blocks = [{ kind: 'block', label: 'Invitation to see the car', text: `Book here: ${BOOK}\nOpen 9 am to 5 pm, parking $10.`, why: '' }];
  const facts = traceFacts('Come and see it.', pieces, [], { blocks, stockLinks: [BOOK, NOAH] });
  assert.deepEqual(facts, [
    { label: '', value: BOOK, source: 'the stock record', ok: true },
    { label: '', value: '$10', source: 'your wording file', ok: true },
  ]);
});

test('an invented price is listed as not found in the records', () => {
  const facts = traceFacts('It is $19,990 today, or $28,900 as listed.', pieces, ['$19,990']);
  assert.deepEqual(facts, [
    { label: '', value: '$19,990', source: 'not found in the records', ok: false },
    { label: 'Price', value: '$28,900', source: 'the stock record', ok: true },
  ]);
});

test('a reply with no figures or links gives an empty list', () => {
  assert.deepEqual(traceFacts('Hello Sam, thanks for your message.', pieces, []), []);
});

test('each value is listed once, in reply order', () => {
  const facts = traceFacts(`$28,900 now, yes $28,900. See ${NOAH} and ${NOAH}?utm_source=marketplace`, pieces, []);
  assert.deepEqual(facts.map((f) => f.value), ['$28,900', NOAH]);
});

test('compact markers report their section as the source', () => {
  const { markers } = maskTrusted({ 'BUSINESS FACTS': '- Warranty: $5,000 per claim', 'VEHICLE FACTS': 'Price: $28,900' });
  assert.deepEqual(markers.map((m) => m.section), ['BUSINESS FACTS', 'VEHICLE FACTS']);
  const used = [];
  const text = restoreFacts('It is {{F2}} and the warranty is {{F1}}.', markers, { used });
  assert.deepEqual(used.map((m) => m.name), ['F2', 'F1']);
  // The stock record piece has no such text here: the marker's section decides.
  const facts = traceFacts(text, [{ source: 'the stock record', text: '' }], [], { marked: used });
  assert.deepEqual(facts.map((f) => [f.value, f.source]), [['$28,900', 'the stock record'], ['$5,000', 'business facts']]);
});

test('a typed figure caught by the compact check is not found', () => {
  const facts = traceFacts('Delivery is $450.', pieces, ['$450']);
  assert.deepEqual(facts, [{ label: '', value: '$450', source: 'not found in the records', ok: false }]);
});
