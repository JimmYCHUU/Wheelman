// Offline tests. All names, numbers and messages here are invented.
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyTestEnv } from './support/env.js';

applyTestEnv(); // invented names and keys, the same on every computer

const { parseDashboardTime, formatSydney } = await import('../src/time.js');
const { redact, restore, firstNameOf, leftoverPlaceholders } = await import('../src/redact.js');
const { isAcknowledgement, isOptOut, isReaction, menuReply, readInquiry, resolveStock, stockFromUrl, unwrapRelay, similarity } = await import('../src/text.js');
const { classify } = await import('../src/situations.js');
const checksModule = await import('../src/checks.js');
const { checkDraft, finishReply, stripModelSignOff, numbersIn, worst } = checksModule;
const { attribute, stripSignature, stripLocationBlock, looksMachineWritten, maskGreetingNames } = await import('../src/voice.js');
const { parseJsonReply } = await import('../src/llm.js');
const { normalizeVehicle, availability, vehicleUrl } = await import('../src/normalize.js');

// ---- time ------------------------------------------------------------------

test('zone-less dashboard times are read as Sydney time', () => {
  assert.equal(new Date(parseDashboardTime('2026-09-29T18:37:50.045383')).toISOString(), '2026-09-29T08:37:50.000Z'); // AEST, UTC+10
  assert.equal(new Date(parseDashboardTime('2026-01-15T09:00:00')).toISOString(), '2026-01-14T22:00:00.000Z'); // daylight saving, UTC+11
});

test('times with an explicit zone are trusted', () => {
  assert.equal(new Date(parseDashboardTime('2026-09-29T08:03:06.876619+00:00')).toISOString(), '2026-09-29T08:03:06.876Z');
  assert.equal(new Date(parseDashboardTime('2026-09-28T23:01:12.468Z')).toISOString(), '2026-09-28T23:01:12.468Z');
});

test('the dashboard\'s long date format is understood', () => {
  assert.equal(new Date(parseDashboardTime('Sep 29, 2026, 06:59:11 PM')).toISOString(), '2026-09-29T08:59:11.000Z');
  assert.equal(new Date(parseDashboardTime('Sep 29, 2026, 12:05:00 AM')).toISOString(), '2026-09-28T14:05:00.000Z');
  assert.equal(parseDashboardTime(''), null);
  assert.equal(parseDashboardTime('not a date'), null);
  assert.match(formatSydney(parseDashboardTime('2026-09-29T18:37:50')), /6:37/);
});

// ---- privacy ---------------------------------------------------------------

const lead = { firstName: 'Priya', lastName: 'Raman', phone: '0400111222', email: 'priya.r@example.com' };

test('customer name, phone, email, plate and VIN are removed', () => {
  const out = redact('Hi, Priya Raman here. Call me on 0400 111 222 or +61 400 111 222, email priya.r@example.com. My rego is ABC12D and VIN JTDKN3DU5A0246813.', lead);
  assert.ok(!/priya/i.test(out.replace(/\{\{NAME\}\}/g, '')));
  assert.ok(!/raman/i.test(out));
  assert.ok(!/0400|111 222/.test(out));
  assert.ok(!/example\.com/.test(out));
  assert.ok(!/ABC12D/.test(out));
  assert.ok(!/JTDKN3DU5A0246813/.test(out));
  assert.match(out, /\{\{NAME\}\}/);
  assert.match(out, /\[PHONE\]/);
  assert.match(out, /\[EMAIL\]/);
  assert.match(out, /\[REGO\]/);
  assert.match(out, /\[VIN\]/);
});

test('plates are removed in the wordings customers actually use', () => {
  assert.match(redact('the new plate number is EJE97T', lead), /\[REGO\]/);
  assert.match(redact('rego CJG42U — towards the Hiace', lead), /\[REGO\]/);
  assert.match(redact('Rego number: DNZ68Z', lead), /\[REGO\]/);
  assert.equal(redact('does it come with rego included', lead), 'does it come with rego included');
});

test('Carbarn\'s own phone, email and address survive', () => {
  const s = 'Call us on 0423 840 130 or info@carbarn.com.au. Unit D3, 128–130 Frances Street, Lidcombe NSW 2141';
  assert.equal(redact(s, lead), s);
});

test('a customer street address is removed', () => {
  assert.match(redact('Please deliver to 14 Banksia Road, Taree', lead), /\[ADDRESS\]/);
});

test('prices and kilometres are not mistaken for phone numbers', () => {
  const s = 'It is $28,900 with 62,733 km and stock 1159';
  assert.equal(redact(s, lead), s);
});

test('bank details are removed', () => {
  const out = redact('BSB: 062-000 Account number: 24681378', lead);
  assert.ok(!/062-000/.test(out));
  assert.ok(!/24681378/.test(out));
});

test('a customer\'s own payment link is removed, and a draft that repeats the label is caught', () => {
  const out = redact('If you would like to proceed, use the link below:\nhttps://www.carbarn.com.au/customer-links/deadbeefcafe00aa11bb22cc33dd44ee\nThanks', lead);
  assert.ok(!/deadbeefcafe/.test(out));
  assert.match(out, /use the link below:\n\[CUSTOMER LINK\]\nThanks/);
  assert.equal(redact('see carbarn.com.au/customer-links/abc123).', lead), 'see [CUSTOMER LINK]).');
  // Our public pages are not customer links and stay as they are.
  assert.equal(redact('https://www.carbarn.com.au/live-auction/honda/vezel/ru3/2022708', lead), 'https://www.carbarn.com.au/live-auction/honda/vezel/ru3/2022708');
  assert.deepEqual(leftoverPlaceholders('Please use [CUSTOMER LINK] to pay.'), ['[CUSTOMER LINK]']);
});

test('first name goes back in, and the greeting is tidied when there is no name', () => {
  assert.equal(restore('Hi {{NAME}},\nYes, it is available.', lead), 'Hi Priya,\nYes, it is available.');
  assert.equal(restore('Hi {{NAME}},\nYes, it is available.', { firstName: '' }), 'Hi,\nYes, it is available.');
  assert.equal(restore('No worries, {{NAME}}. See you soon.', {}), 'No worries. See you soon.');
  assert.deepEqual(leftoverPlaceholders('Hi Priya, call [PHONE]'), ['[PHONE]']);
});

test('first names are taken sensibly from messy portal records', () => {
  assert.equal(firstNameOf({ firstName: 'KerrynDowner' }), 'Kerryn');
  assert.equal(firstNameOf({ firstName: 'mic langborne' }), 'Mic');
  assert.equal(firstNameOf({ firstName: 'someone@example.com' }), '');
  assert.equal(firstNameOf({ firstName: '+61400111222' }), '');
  assert.equal(firstNameOf({ customerName: 'carsalesconnect prospect' }), '');
});

// ---- reading customer messages ------------------------------------------------

test('thanks and OK are recognised as needing no reply', () => {
  for (const s of ['Thanks', 'ok thanks', 'Thank you!', '👍', 'No worries', 'Thanks Lex', 'Okay, thanks mate', 'Perfect thank you so much', 'See you then'])
    assert.equal(isAcknowledgement(s), true, s);
  for (const s of ['Thanks, is it still available?', 'What time do you open', 'Ok can you send photos', 'I will come Saturday at 10 to look at the Hiace and bring my mechanic'])
    assert.equal(isAcknowledgement(s), false, s);
});

test('opt-outs are recognised', () => {
  for (const s of ['STOP', 'stop', 'Stop.', 'unsubscribe', 'Please stop texting me']) assert.equal(isOptOut(s), true, s);
  for (const s of ['Can you stop by with the car?', 'Does it have a stop start system', 'ok']) assert.equal(isOptOut(s), false, s);
});

test('reactions are not messages', () => {
  assert.equal(isReaction('Liked “No worries, see you soon”'), true);
  assert.equal(isReaction('I liked the blue one'), false);
});

test('numbered menu replies are understood only after a menu', () => {
  const menu = 'To help you quickly, please reply:\n 1 to receive the walkaround video\n 2 to receive the finance application link\n 3 for showroom address\n 4 if you’re no longer looking';
  assert.deepEqual(menuReply('1 and 3', menu).picks, [1, 3]);
  assert.equal(menuReply('4', menu).notLooking, true);
  assert.equal(menuReply('1', 'Yes, it is available.'), null);
  assert.equal(menuReply('I have 2 kids', menu), null);
});

test('portal enquiry boilerplate is stripped to the customer\'s own words', () => {
  const ds = readInquiry({ type: 'Dealer Studio', text: 'Make : TOYOTA\nModel : RAV4\nYear : 2001\nPrice : $15,400\nStockNumber : DDR1149\n\nHi, when is a good day to inspect? Thanks.\nSent from my iPhone\n\nThis customer has requested to view the AutoRecord, the history of a car.\nVin: XXXXXXXX' });
  assert.equal(ds.text, 'Hi, when is a good day to inspect? Thanks.');

  assert.equal(readInquiry({ type: '', text: 'Lead generated automatically based on customer profile.' }).text, '');
  assert.match(readInquiry({ type: 'Finance Application', text: '', loanAmount: '27900', depositAmount: '2000', years: '5' }).event, /finance application.*\$27,900/i);
  assert.match(readInquiry({ type: 'Book Inspection', text: 'A Test Drive has been requested by the user for the scheduled time: 2026-02-22 03:00 PM. Please review and confirm the request.' }).event, /test drive.*2026-02-22 03:00 PM/);
  assert.match(readInquiry({ type: 'product_page_inspection', text: 'Preferred inspection: On-site on 2026-10-03 at 12:30 PM.' }).event, /On-site on 2026-10-03 at 12:30 PM/);

  const trade = readInquiry({ type: 'product_page_trade_in', text: 'Customer wants to trade in their 2017 Kia Picanto (76,000 km), rego XYZ12A — towards: 2021 Nissan Note X (Stock No 945). Trade-in lead #35 · logistics: local\nDetails: finance owing: no\nCustomer notes: Always garaged.' });
  assert.match(trade.event, /Trade-in request/);
  assert.equal(trade.text, 'Always garaged.');
});

test('texts forwarded by the portals are unwrapped', () => {
  const at = unwrapRelay('Hi Jordan,\nYou received an SMS enquiry through the Autotrader Group network.\nCustomer enquiry is:\n2019 Toyota C-HR G\n(Ref:CG-15138086 do not delete, this connects you to the seller)\nIs this still available?');
  assert.equal(at.text, 'Is this still available?');
  assert.equal(at.about, '2019 Toyota C-HR G');

  const cs = unwrapRelay('2000 Subaru Legacy B4\nhttps://www.carsales.com.au/cars/details/_/OAG-AD-1\n\nCan I test drive tomorrow?');
  assert.equal(cs.text, 'Can I test drive tomorrow?');
  assert.equal(cs.about, '2000 Subaru Legacy B4');

  assert.equal(unwrapRelay('Just a normal message').text, 'Just a normal message');
});

test('stock numbers rewritten by the portals are resolved', () => {
  const stock = { 1149: { id: 1, stockNo: '1149', year: 2001 }, 824: { id: 2, stockNo: '824', year: 1999 } };
  const find = (s) => stock[s] || null;
  assert.equal(resolveStock('1149', find).id, 1);
  assert.equal(resolveStock('DDR1149', find).id, 1);
  assert.equal(resolveStock('20011149', find).id, 1);
  assert.equal(resolveStock('1999824', find).id, 2);
  assert.equal(resolveStock('20051149', find), null); // year does not match
  assert.equal(resolveStock('99999', find), null);
  assert.equal(stockFromUrl('https://www.carbarn.com.au/vehicles/toyota/rav4/zca25/1149#inspection=onsite'), '1149');
});

test('similarity is high for near-identical text and low for unrelated text', () => {
  assert.ok(similarity('Yes, it is still available. See you Saturday.', 'Yes it is still available, see you Saturday') > 0.9);
  assert.ok(similarity('Yes, it is still available.', 'Delivery to Perth takes a week') < 0.3);
});

// ---- situations ------------------------------------------------------------

test('common enquiries are classified', () => {
  assert.equal(classify('Is this still available?').primary, 'availability');
  assert.equal(classify('What is your best price?').primary, 'price_negotiation');
  assert.equal(classify('Would you take 20k for it').primary, 'price_negotiation');
  assert.equal(classify('Do you take trade ins?').primary, 'trade_in');
  assert.equal(classify('Can I get finance on this one').primary, 'finance');
  assert.equal(classify('I am in Brisbane, can you deliver?').primary, 'delivery_interstate');
  assert.equal(classify('When is a good day to inspect?').primary, 'inspection_booking');
  assert.equal(classify('Are the kms genuine and are there log books?').primary, 'history_kms');
  assert.equal(classify('How many months rego does it come with').primary, 'rego_roadworthy');
  assert.equal(classify('What warranty does it come with').primary, 'warranty');
  assert.equal(classify('Can you send more photos of the interior').primary, 'photos_video');
  assert.equal(classify('Does it have 8 seats and a sunroof').primary, 'vehicle_details');
  assert.equal(classify('Where are you located?').primary, 'location_hours');
  assert.equal(classify('I want a refund, I will go to fair trading').primary, 'complaint');
  assert.equal(classify('Hello').primary, 'general');
});

test('a customer\'s car that "never complains" is not a complaint', () => {
  assert.notEqual(classify('It has been my best friend, it never let me down nor did it complain').primary, 'complaint');
});

test('website events set the situation', () => {
  assert.equal(classify('', { events: ['Customer submitted a finance application through the website.'] }).primary, 'finance');
  assert.equal(classify('', { events: ['Customer booked an inspection through the website: On-site.'] }).primary, 'inspection_booking');
});

// ---- draft checks ----------------------------------------------------------

const facts = 'Advertised price: $28,900 (excludes government charges)\nOdometer: 62,733 km\nSeats: 8\nIncluded: 6 Months NSW Registration\nVehicle page: https://www.carbarn.com.au/vehicles/toyota/noah/zrr80g/1159\nOpen 7 days, 8 AM to 5 PM. $1,000 deposit.';

test('a draft using only supplied figures passes', () => {
  const body = 'Hi {{NAME}},\nYes, the Noah is available at $28,900 with 62,733 km.\nIt has 8 seats and comes with 6 months NSW registration.\nhttps://www.carbarn.com.au/vehicles/toyota/noah/zrr80g/1159';
  const checks = checkDraft({ reply: finishReply(body, lead), body, allowedText: facts });
  assert.equal(worst(checks), 'ok', JSON.stringify(checks));
});

test('an invented price is caught', () => {
  const body = 'Hi {{NAME}},\nWe can do $27,500 for you.';
  const checks = checkDraft({ reply: finishReply(body, lead), body, allowedText: facts });
  assert.equal(worst(checks), 'fail');
  assert.match(checks.find((c) => c.code === 'figure').message, /27,500/);
});

test('invented kilometres, dates and "k" prices are caught', () => {
  for (const body of ['It has only 45,000 km.', 'It arrives on the 14th.', 'Lowest is 27k.', 'It comes with 12 months registration.']) {
    const checks = checkDraft({ reply: body, body, allowedText: facts });
    assert.equal(worst(checks), 'fail', body);
  }
});

test('a figure the customer or staff mentioned is allowed', () => {
  const body = 'Yes, Saturday at 10 am works.';
  assert.equal(worst(checkDraft({ reply: body, body, allowedText: facts + '\nCan I come Saturday at 10 am?' })), 'ok');
  const priced = 'We can do $27,500.';
  assert.equal(worst(checkDraft({ reply: priced, body: priced, allowedText: facts, instruction: 'offer 27500' })), 'ok');
});

test('a price that only the customer mentioned is not ours to repeat', () => {
  const customerText = 'Would you take $20,000? I can come Saturday at 10 am. My trade-in has 76,000 km.';
  const echo = 'Yes, we can do $20,000.';
  const checks = checkDraft({ reply: echo, body: echo, allowedText: facts, customerText });
  assert.equal(worst(checks), 'fail');
  assert.ok(checks.some((c) => c.code === 'customer-figure'));

  // Times and the customer's own kilometres may be repeated back.
  const fine = 'Saturday at 10 am works. Thanks for the details on your trade-in with 76,000 km.';
  assert.equal(worst(checkDraft({ reply: fine, body: fine, allowedText: facts, customerText })), 'ok');

  // Our own advertised price is still fine even if the customer also quoted it.
  const ours = 'The price is $28,900.';
  assert.equal(worst(checkDraft({ reply: ours, body: ours, allowedText: facts, customerText: 'Is it really $28,900?' })), 'ok');

  // "20k" written by the customer is treated the same way.
  const k = 'We can meet you at 20k.';
  assert.equal(worst(checkDraft({ reply: k, body: k, allowedText: facts, customerText: 'would you do 20k' })), 'fail');
});

test('an invented link is caught', () => {
  const body = 'See it here: https://www.carbarn.com.au/vehicles/toyota/noah/zrr80g/9999';
  assert.equal(worst(checkDraft({ reply: body, body, allowedText: facts })), 'fail');
});

test('numbered answers are not treated as figures', () => {
  const body = '1. Yes, it has 8 seats.\n2. It is available.';
  assert.equal(worst(checkDraft({ reply: body, body, allowedText: facts })), 'ok');
});

test('hand-over markers are flagged for input, not failed', () => {
  const body = 'Hi {{NAME}},\nThe best we can do is [PRICE?].';
  const checks = checkDraft({ reply: finishReply(body, lead), body, allowedText: facts, needsHuman: [{ marker: '[PRICE?]', reason: 'discount' }] });
  assert.equal(worst(checks), 'input');
});

test('risky wording is caught', () => {
  assert.equal(worst(checkDraft({ reply: 'x', body: 'Finance is guaranteed approval.', allowedText: facts })), 'fail');
  assert.equal(worst(checkDraft({ reply: 'x', body: 'This car is sold as is.', allowedText: facts })), 'fail');
  assert.equal(worst(checkDraft({ reply: 'x', body: 'What an amazing car.', allowedText: facts })), 'warn');
  assert.equal(worst(checkDraft({ reply: 'x', body: 'Hurry, it will not last.', allowedText: facts })), 'fail', 'pressure wording stops the draft');
});

test('the model\'s own sign-off is replaced by the configured one, once', () => {
  assert.equal(stripModelSignOff('See you soon.\n\nRegards,\nTeam Carbarn'), 'See you soon.');
  assert.equal(stripModelSignOff('See you soon.\nKind regards,\nCarbarn Team'), 'See you soon.');
  const out = finishReply('Hi {{NAME}},\\nSee you soon.\\n\\nRegards,\\nTeam Carbarn', lead);
  assert.equal(out, 'Hi Priya,\nSee you soon.\n\nRegards,\nTeam Carbarn');
  assert.equal((out.match(/Team Carbarn/g) || []).length, 1);
});

test('emojis are removed from finished replies', () => {
  assert.ok(!/\p{Extended_Pictographic}/u.test(finishReply('See you soon 😊', lead)));
});

test('number reading treats $28,900 and 28900 as the same', () => {
  assert.ok(numbersIn('$28,900').has('28900'));
  assert.ok(numbersIn('20k').has('20000'));
  assert.ok(numbersIn('62,733 km').has('62733'));
});

// ---- voice -----------------------------------------------------------------

test('messages are attributed by login and by signature', () => {
  assert.equal(attribute('Alex STONE', 'Yes, still available.'), 'alex');
  assert.equal(attribute('samrivers', 'No worries.\n\nRegards\nSam from Carbarn'), 'sam');
  assert.equal(attribute('samrivers', 'Feel free to organize inspection.\nRegards, Sammy from Carbarn'), 'sam');
  assert.equal(attribute('samrivers', 'See you tomorrow.\nRegards, Lex from Carbarn'), 'alex');
  assert.equal(attribute(null, 'We will update you.\nRegards\nSam from Carbarn'), 'sam');
  assert.equal(attribute(null, 'Thank you.\n\nKind Regards,\nLex'), 'alex');
  assert.equal(attribute(null, 'Ok see you then'), null);
  assert.equal(attribute('Jordan', 'Hi, Lex from Carbarn here.'), null);
});

test('signatures and the location block are stripped from examples', () => {
  assert.equal(stripSignature('We can offer $2500.\n\nRegards\nSam from Carbarn'), 'We can offer $2500.');
  assert.equal(stripSignature('See you at 9 am. Regards, Lex from Carbarn'), 'See you at 9 am.');
  assert.equal(stripSignature('Thank you.\n\nKind Regards,\nLex'), 'Thank you.');
  assert.equal(stripLocationBlock('Hello,\nYes, it has toilet and shower.\n\n📍Location: Unit D3\n📞 0423 840 130'), 'Hello,\nYes, it has toilet and shower.');
});

test('AI-polished messages are recognised', () => {
  assert.equal(looksMachineWritten('Understood — you’re after a low-kilometre van. We’ll keep an eye out.'), true);
  assert.equal(looksMachineWritten('Unfortunately, vehicle has been sold.'), false);
});

test('names in greetings are masked even when the record has no name', () => {
  assert.equal(maskGreetingNames('Hi Steph,\nI found two.'), 'Hi {{NAME}},\nI found two.');
  assert.equal(maskGreetingNames('Hi there,\nYes.'), 'Hi there,\nYes.');
  assert.equal(maskGreetingNames('Thank you Vicky'), 'Thank you {{NAME}}');
});

// ---- model replies -----------------------------------------------------------

test('model answers are read even when wrapped', () => {
  assert.deepEqual(parseJsonReply('{"reply":"Hi"}'), { reply: 'Hi' });
  assert.deepEqual(parseJsonReply('```json\n{"reply":"Hi"}\n```'), { reply: 'Hi' });
  assert.deepEqual(parseJsonReply('Here you go:\n{"reply":"Hi"}\nThanks'), { reply: 'Hi' });
  assert.throws(() => parseJsonReply('no json here'));
});

// ---- vehicles ----------------------------------------------------------------

test('internal cost figures never reach stored vehicle data', () => {
  const v = normalizeVehicle({ id: 1, stockNo: '1159', year: '2021', make: 'TOYOTA', model: 'Noah', modelCode: 'ZRR80G', auPublishPrice: 28900, salePrice: 28900, fob: 2468137, shippingPrice: 2000, grossCost: 21000, mechanicCost: 500, supplierId: 9, purchaseDate: '2026-01-01', salesInfo: { buyer: 'x' }, paymentSummary: { paid: 1 }, vin: 'ABC', chassisNo: 'ZRR80-1' });
  const json = JSON.stringify(v);
  for (const secret of ['fob', 'shippingPrice', 'grossCost', 'mechanicCost', 'supplierId', 'purchaseDate', 'salesInfo', 'paymentSummary', '2468137', '21000'])
    assert.ok(!json.includes(secret), secret);
  assert.equal(v.price, 28900);
  assert.equal(v.url, 'https://www.carbarn.com.au/vehicles/toyota/noah/zrr80g/1159');
});

test('vehicle links are built the way the website builds them', () => {
  assert.equal(vehicleUrl({ make: 'MERCEDES-BENZ', model: 'S-Class', modelCode: 'W222', stockNo: '1249' }), 'https://www.carbarn.com.au/vehicles/mercedes-benz/s-class/w222/1249');
  assert.equal(vehicleUrl({ make: 'Mitsubishi', model: 'GTO', modelCode: 'E-Z16A', stockNo: '1018' }), 'https://www.carbarn.com.au/vehicles/mitsubishi/gto/e-z16a/1018');
});

test('availability is described plainly', () => {
  assert.equal(availability({ status: 'PUBLISHED', soldStatus: 'UnSold', stockIn: 'Online' }).code, 'available');
  assert.equal(availability({ status: 'UNPUBLISHED', soldStatus: 'Sold', stockIn: 'Sold' }).code, 'sold');
  assert.equal(availability({ status: 'UNPUBLISHED', soldStatus: 'SOLD', stockIn: 'Sold' }).code, 'sold');
  assert.equal(availability({ status: 'PUBLISHED', soldStatus: 'UnSold', stockIn: 'Transit' }).code, 'transit');
  assert.equal(availability({ status: 'PUBLISHED', soldStatus: 'UnSold', stockIn: 'Japan' }).code, 'japan');
});

test('a policy figure only counts when used about its own subject', () => {
  const policyText = '- Extended warranty: It covers mechanical and electrical components and the hybrid battery, up to $5,000 per claim.\n- Holding deposit: A $1,000 deposit secures a vehicle and holds it for the customer.';
  const vehicle = 'Advertised price: $28,900 (excludes government charges)';

  const asPrice = 'The Noah is $5,000.';
  assert.equal(worst(checkDraft({ reply: asPrice, body: asPrice, allowedText: vehicle, policyText })), 'fail');

  const discount = 'We can take $1,000 off the price for you.';
  assert.equal(worst(checkDraft({ reply: discount, body: discount, allowedText: vehicle, policyText })), 'fail');

  const warranty = 'The extended warranty covers up to $5,000 per claim.';
  assert.equal(worst(checkDraft({ reply: warranty, body: warranty, allowedText: vehicle, policyText })), 'ok');

  const deposit = 'You can secure it with a $1,000 deposit.';
  assert.equal(worst(checkDraft({ reply: deposit, body: deposit, allowedText: vehicle, policyText })), 'ok');
});

test('"Good morning" is only kept in the morning', () => {
  const { fixGreeting } = checksModule;
  assert.equal(fixGreeting('Good morning, {{NAME}}.\nYes.', 9), 'Good morning, {{NAME}}.\nYes.');
  assert.equal(fixGreeting('Good morning, {{NAME}}.\nYes.', 20), 'Hi {{NAME}},\nYes.');
  assert.equal(fixGreeting('Good morning,\nYes.', 14), 'Hi,\nYes.');
  assert.equal(fixGreeting('Good afternoon {{NAME}},\nYes.', 9), 'Hi {{NAME}},\nYes.');
  assert.equal(fixGreeting('Hi {{NAME}},\nGood morning is when we open.', 20), 'Hi {{NAME}},\nGood morning is when we open.');
});

test('a reply copied from an example is rejected', () => {
  const example = 'We deal in large stock with extremely fast turnover. Please send the deposit. We will send your deposit back as soon as we receive the full amount from your finance provider.';
  const copy = 'Thank you. We deal in large stock with extremely fast turnover. Please send the deposit. We will send your deposit back as soon as we receive the full amount from your finance provider.';
  assert.ok(checkDraft({ reply: copy, body: copy, allowedText: facts, examples: [example] }).some((c) => c.code === 'copied'));
  const own = 'No worries. We will arrange the refund once the finance has settled.';
  assert.ok(!checkDraft({ reply: own, body: own, allowedText: facts, examples: [example] }).some((c) => c.code === 'copied'));
});

test('portal placeholders are not used as names', () => {
  for (const n of ['Sms', 'SMS Enquiry', 'Carsales', 'Lead', 'Guest']) assert.equal(firstNameOf({ firstName: n }), '', n);
});

test('a blank standing alone is pointed out', () => {
  const body = 'Hi {{NAME}},\nWe can fit the tow bar.\n[PRICE?]';
  assert.ok(checkDraft({ reply: body, body, allowedText: facts }).some((c) => c.code === 'bare-marker'));
});

test('clock times are compared sensibly', () => {
  const hours = 'Open 7 days, 8 AM to 5 PM.';
  for (const body of ['We are open from 8:00 am to 5:00 pm.', 'We are open 8am to 5pm, 7 days.', 'Open 8.00 am to 5.00 pm.'])
    assert.equal(worst(checkDraft({ reply: body, body, allowedText: hours })), 'ok', body);
  const appt = 'See you tomorrow at 10:45.';
  assert.equal(worst(checkDraft({ reply: appt, body: appt, allowedText: hours, customerText: 'can we change to 10:45 instead' })), 'ok');
  assert.equal(worst(checkDraft({ reply: appt, body: appt, allowedText: hours, customerText: 'can we change to 10.45 am instead' })), 'ok');
  const wrong = 'See you tomorrow at 11:30.';
  assert.equal(worst(checkDraft({ reply: wrong, body: wrong, allowedText: hours, customerText: 'can we change to 10:45 instead' })), 'fail');
  const late = 'We are open until 7:00 pm.';
  assert.equal(worst(checkDraft({ reply: late, body: late, allowedText: 'Open 8 AM to 5 PM.' })), 'fail');
});

test('placeholder names from portals are recognised', async () => {
  const { isPlaceholderName } = await import('../src/redact.js');
  for (const n of ['carsalesconnect prospect', 'SMS Enquiry', '+61400111222', '', 'Guest User', 'info@example.com']) assert.equal(isPlaceholderName(n), true, n);
  for (const n of ['Priya Raman', 'Bradley Devoigt', 'Sam', 'Mai Van']) assert.equal(isPlaceholderName(n), false, n);
});

test('short sign-offs about timing need no reply', () => {
  for (const s of ['Ok great. See u this morning.', 'See you this arvo', 'Thanks, talk later', 'Ok see you at 10'])
    assert.equal(isAcknowledgement(s), true, s);
});
