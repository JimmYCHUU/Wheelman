// The blocks code adds under a reply, in the owner's words: the standard first reply, the
// invitation to inspect, and the price reply with what the price includes built from the car's own
// Included list. No AI is asked. Every car, link and word here is invented.
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyTestEnv } from './support/env.js';

applyTestEnv();

const { standardBlock, inviteBlock, repeatsBlock, tidyOpening, blockCarries } = await import('../src/firstreply.js');
const { inclusionsSentence, inclusionsShort, priceBlock } = await import('../src/pricereply.js');
const { stripLocationBlock } = await import('../src/voice.js');

const URL = 'https://www.carbarn.com.au/vehicles/toyota/noah/zrr80g/1159';
const ONSITE = `${URL}#inspection=onsite`;
const ONLINE = `${URL}#inspection=online`;
const INVITE = `You can book an inspection here:\n${ONSITE}\nOr let us know your preferred date and time, and we'll arrange it for you.`;

test("what the price includes comes from the car's own Included list, in the owner's words and order", () => {
  assert.equal(inclusionsSentence({ outline: ['6 Months NSW Registration', '5-Year Extended Warranty by Integrity Car Care', 'CTP Insurance', 'Fresh Roadworthy Certificate', 'Doorstep Delivery (Greater Sydney)', '1-Year 24/7 Roadside Assistance', '3-Month Dealer Warranty', 'Oil & Filter Service'] }),
    '6 months NSW registration, a 5-year extended warranty, 1 year roadside assistance, CTP insurance, a fresh roadworthy certificate, Greater Sydney delivery and a 3-month dealer warranty');
  assert.equal(inclusionsSentence({ outline: ['6 months NSW registration is on us!', 'Fresh Roadworthy Certificate'] }), '6 months NSW registration and a fresh roadworthy certificate');
  assert.equal(inclusionsSentence({ outline: ['5-Year Extended Warranty'] }), 'a 5-year extended warranty and 1 year roadside assistance', 'the extended warranty carries a year of roadside');
  assert.equal(inclusionsSentence({ outline: ['12 Months Registration'] }), '12 months NSW registration');
  assert.equal(inclusionsSentence({ outline: ['CTP Insurance'] }), 'CTP insurance');
  assert.equal(inclusionsSentence({ outline: ['Professionally Detailed'] }), '', 'what is not one of the six is left out');
  assert.equal(inclusionsSentence({}), '');
});

test("the short inclusions of a Marketplace first reply: rego, roadworthy and the warranty, as the team says them, from the car's own Included list", () => {
  assert.equal(inclusionsShort({ outline: ['6 Months NSW Registration', '5-Year Extended Warranty by Integrity Car Care', 'CTP Insurance', 'Fresh Roadworthy Certificate', 'Doorstep Delivery (Greater Sydney)', '1-Year 24/7 Roadside Assistance'] }),
    '6 months rego, a fresh roadworthy and a 5-year warranty');
  assert.equal(inclusionsShort({ outline: ['6 Months NSW Registration', '5-Year Extended Warranty'] }), '6 months rego and a 5-year warranty');
  assert.equal(inclusionsShort({ outline: ['12 Months Registration'] }), '12 months rego');
  assert.equal(inclusionsShort({ outline: ['Fresh Roadworthy Certificate'] }), 'a fresh roadworthy');
  assert.equal(inclusionsShort({ outline: ['CTP Insurance', 'Professionally Detailed'] }), '', 'only the three the team names');
  assert.equal(inclusionsShort({}), '');
});

test("the price reply: the owner's wording, the inclusions filled in, the invitation when the car can be seen", () => {
  const car = { outline: ['6 Months NSW Registration', 'CTP Insurance'] };
  assert.equal(priceBlock({ vehicle: car, inspectionUrl: ONSITE }),
    'The price includes 6 months NSW registration and CTP insurance. Government charges are extra.\n\n'
    + 'We generally keep our prices competitive considering everything included, but we may offer a small discount for a serious buyer.\n\n'
    + `${INVITE}\nPlease call or text before visiting.`);
  assert.equal(priceBlock({ vehicle: { outline: [] }, inspectionUrl: '' }),
    'The advertised price excludes government charges.\n\n'
    + 'We generally keep our prices competitive considering everything included, but we may offer a small discount for a serious buyer.');
  assert.ok(priceBlock({ vehicle: car, inspectionUrl: ONLINE, online: true }).includes(`You can book an online video inspection (a live video call on WhatsApp or FaceTime) here:\n${ONLINE}`));
  assert.ok(!priceBlock({ vehicle: car, inspectionUrl: ONSITE, withStandard: true }).includes('Please call or text before visiting'), 'the first-reply block under it says so already');
  assert.ok(priceBlock({ vehicle: car, inspectionUrl: ONSITE, chat: true }).endsWith('Please message or call before visiting.'));
});

test('the invitation to inspect, and the standard first reply with its place for it', () => {
  assert.equal(inviteBlock(ONSITE), `${INVITE}\nPlease call or text before visiting.`);
  assert.equal(inviteBlock(ONLINE, { online: true, tail: false }), `You can book an online video inspection (a live video call on WhatsApp or FaceTime) here:\n${ONLINE}\nOr let us know your preferred date and time, and we'll arrange it for you.`);
  assert.equal(inviteBlock(''), '');
  assert.equal(blockCarries('inspection_invite'), true);
  assert.equal(blockCarries('inspection_url'), false, 'the old place is gone');
  assert.equal(standardBlock({ vehicleUrl: URL, inspectionUrl: ONSITE }),
    `Vehicle details:\n${URL}\n\n`
    + `${INVITE}\n\n`
    + 'Our location:\n📍 136 Frances Street, Lidcombe NSW 2141\n\n'
    + '🕛 Open 7 days, 8 AM–5 PM.\nPlease call or text before visiting.\n\n'
    + '📞 0423 840 130\nTeam Carbarn');
  assert.ok(standardBlock({ vehicleUrl: URL, inspectionUrl: ONLINE, online: true }).includes('online video inspection'));
  assert.ok(!standardBlock({ vehicleUrl: URL }).includes('book an inspection'), 'no invitation when nobody asked to see the car');
  assert.ok(!standardBlock({}).includes('Vehicle details'));
  assert.ok(!/maps\.app|Unit D3|128/.test(standardBlock({ vehicleUrl: URL, inspectionUrl: ONSITE })));
});

test("an AI line that repeats a block is caught, a bare link line is dropped, and the invitation is never learned as the team's own words", () => {
  assert.equal(repeatsBlock('We are at 136 Frances Street.'), 'Frances Street');
  assert.equal(repeatsBlock('Government charges are extra.', { address: false, price: true }), 'Government charges');
  assert.equal(repeatsBlock('Government charges are extra.'), '', 'only when the price reply is under the text');
  assert.equal(repeatsBlock('Or let us know your preferred date and time.', { address: false, inspection: true }), 'preferred date and time');
  assert.equal(repeatsBlock('You are welcome to book an inspection any day.', { address: false, inspection: true }), '', 'a natural sentence is not the block');
  assert.equal(tidyOpening(`Yes, it is here.\nBook a time here:\n${ONSITE}`, ONSITE), 'Yes, it is here.');
  const sent = `Hi Priya,\nYes, it is here.\n\nVehicle details:\n${URL}\n\n${INVITE}\n\nOur location:\n📍 136 Frances Street, Lidcombe NSW 2141\n\n🕛 Open 7 days, 8 AM–5 PM.\nPlease call or text before visiting.`;
  assert.equal(stripLocationBlock(sent), 'Hi Priya,\nYes, it is here.');
});

test("the inclusions a price reply names are the ones this customer asked about, the full list when they named nothing", () => {
  const car = { outline: ['6 Months NSW Registration', '5-Year Extended Warranty', '1 Year Roadside Assistance', 'CTP Insurance', 'Fresh Roadworthy Certificate', 'Doorstep Delivery (Greater Sydney)', '3 Month Dealer Warranty'] };
  assert.equal(inclusionsSentence(car, { asked: 'Is that drive away?' }), '6 months NSW registration, CTP insurance and a fresh roadworthy certificate');
  assert.equal(inclusionsSentence(car, { asked: 'does the warranty cover the hybrid battery, it is an import' }), 'a 5-year extended warranty, 1 year roadside assistance and a 3-month dealer warranty');
  assert.equal(inclusionsSentence(car, { asked: 'rego and warranty included?' }), '6 months NSW registration, a 5-year extended warranty, 1 year roadside assistance, CTP insurance, a fresh roadworthy certificate and a 3-month dealer warranty');
  assert.equal(inclusionsSentence(car, { asked: 'best price?' }), inclusionsSentence(car), 'nothing named: the full list');
  assert.equal(inclusionsSentence({ outline: ['Doorstep Delivery (Greater Sydney)'] }, { asked: 'drive away?' }), 'Greater Sydney delivery', 'nothing matches: the full list, never an empty sentence');
  assert.ok(priceBlock({ vehicle: car, inspectionUrl: '', asked: 'Is that drive away?' }).startsWith('The price includes 6 months NSW registration, CTP insurance and a fresh roadworthy certificate. Government charges are extra.'));
});
