// Import and auction enquiries: reading them, asking what the customer wants, searching the live
// auction, and laying out an offer with the website's own figures. All data is invented.
// One stand-in service on this computer plays the dashboard, the auction feed and the AI.
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { applyTestEnv } from './support/env.js';

applyTestEnv();

// This file keeps its own stand-in feed: its lots carry fixed auction dates and its calculator
// gives the website's real answers for two bids, which the shared stand-in (test/support/
// standins.js) cannot reproduce.
const now = Date.now();
const MIN = 60e3, HOUR = 3600e3;
const sessionFile = path.join(os.tmpdir(), `wheelman-imports-session-${process.pid}.json`);
const calls = [];          // every request the stand-in received
let aiScript = [];         // what the AI answers, in order
let aiDown = false;
let server, db, items, drafter, sync, dash, auction, imports, text, llm, promptModule;

// ---- the stand-in auction feed: eleven cars of one model, as the real feed lays them out --------
const LOTS = [
  ['2005010', 2013, 'R', 110000, '2026-10-05', 217210, 10104], ['2006233', 2013, '4', 143000, '2026-10-05', 350960, 11583],
  ['1999318', 2013, 'RA', 80000, '2026-10-06', 279270, 10790], ['1999520', 2015, 'R', 129000, '2026-10-06', 247170, 10435],
  ['1999282', 2013, '4', 112000, '2026-10-06', 373430, 11831], ['2006629', 2015, '4', 73000, '2026-10-06', 455820, 12742],
  ['1992541', 2015, '3.5', 121000, '2026-10-07', 253590, 10506], ['2010049', 2016, 'R', 114000, '2026-10-07', 570310, 14008],
  ['1990689', 2019, '4', 107000, '2026-10-06', 1116010, 20152], ['2010082', 2019, '3.5', 179000, '2026-10-06', 835670, 16943],
];
const lotRow = ([id, year, grade, km, date, bench, landed]) => ({
  id, title: `${year} SUBARU SUBARU XV`, make: 'SUBARU', model: 'SUBARU XV', modelCode: 'GPE', year, auctionDate: date, auctionHouse: 'MIRIVE Saitama',
  odometerKm: km, auctionGrade: grade, transmission: 'Automatic', fuelType: 'Hybrid', mainImageUrl: 'https://photos.example/1', photos: [],
  ssotBenchmarkBidYen: String(bench), ssotBenchmarkBidAud: Math.round(bench * 0.009138),
  priceEstimate: { bidYen: String(bench), calculationStatus: 'ok', estimatedLandedAud: landed, manualReviewRequired: false, lctRiskWarning: false, thresholdWarnings: [], breakdown: null },
  eligibility: { refId: 64, make: 'Subaru', model: 'XV Hybrid', modelCode: 'GPE', slug: 'subaru-xv-hybrid-gpe', status: 'ELIGIBLE' }, bidSubmissionStatus: 'ready',
});
const lotDetail = (row) => ({
  listingStatus: 'LIVE', customer: { loggedIn: false },
  vehicle: { ...lotRow(row), variant: 'HYBRID 2.0I EYESIGHT', engineCc: 2000, driveType: '4WD', seatingCapacity: 5, colour: 'WINE', bodyType: 'Hatchback', auctionSheetSummary: { grade: row[2], variant: null } },
});
// The calculator: the real answers for two bids, and a plain sum for any other.
const estimateFor = (bid) => {
  const known = { 300000: [2741, 822, 1500, 3426, 1540, 989, 11019], 253590: [2317, 822, 1500, 3383, 1540, 942, 10506] }[bid];
  const [a, j, c, s, p, g, total] = known || [Math.round(bid * 0.009138), 822, 1500, 3400, 1540, 950, Math.round(bid * 0.009138) + 8212];
  return { bidYen: String(bid), calculationSource: 'customer_bid', estimatedLandedAud: total, calculationStatus: 'ok', lctApplied: false, lctRiskWarning: false, manualReviewRequired: false, thresholdWarnings: [],
    breakdown: { bidAudEstimate: a, japanAgentFee: j, carbarnAgentFee: c, shippingLogisticsDutyAndImportCharges: s, compliancePackage: p, gst: g, lct: null, estimatedLandedAud: total } };
};

// ---- the stand-in dashboard --------------------------------------------------------------------
const FORM = 'Auction alert request — notify when a matching vehicle enters the Japan auction feed.\n\nMake: Subaru\nModel: XV Hybrid\nGrade: Not provided\nMax odometer: Not provided\nLanded budget: Under $30k\n\nCaptured on: Lot detail page\nWhile viewing lot: 2015 SUBARU SUBARU XV';
const rawLead = (id, extra = {}) => ({
  id, conversationId: null, customerFirstName: 'Nina', customerLastName: 'Halvorsen', customerPhone: '0491 570 110', customerEmail: 'nina@example.com',
  leadSourceDto: { leadSource: 'Auction' }, leadStatus: 'NEW', platform: 'IMPORTS', leadDate: new Date(now - 30 * MIN).toISOString().slice(0, 19), updatedAt: new Date(now - 30 * MIN).toISOString().slice(0, 19),
  stocks: null, statusHistory: [], others: '',
  inquiries: [{ id: id * 10, inquiryType: 'Auction', customerQuerySubject: 'Auction alert for Subaru XV Hybrid', customerQuery: FORM, stockNo: null, platform: 'IMPORTS', leadDate: new Date(now - 30 * MIN).toISOString().slice(0, 19), status: 'NEW', comments: [] }],
  ...extra,
});
const rawOrder = (leadId, extra = {}) => ({
  id: 70, orderNo: 'AS-70', stage: 'INITIAL_DEPOSIT', source: 'LIVE_AUCTION', soldBy: 'Some Staff', leadId, auctionVehicleId: null, lotPhase: 'SOURCING', depositState: 'NONE', depositPaidAud: 0,
  invoiceTo: { id: 1, firstName: 'Nina', lastName: 'Halvorsen', mobileNumber: '0491570110', email: 'nina@example.com', drivingLicenseNumber: 'LIC998877', dateOfBirth: '1988-02-03', address: '9 Gum Tree Lane' },
  deliveryTo: { id: 1, firstName: 'Nina', lastName: 'Halvorsen', mobileNumber: '0491570110', email: 'nina@example.com', address: '9 Gum Tree Lane' },
  reqMake: 'Subaru', reqModel: 'XV Hybrid', reqYearFrom: 2014, reqYearTo: 2015, reqVariant: null, reqModelCode: 'GPE', targetBidJpy: 220000, budgetAud: 10400,
  requirementNotes: 'A light colour if possible. Call me on 0491 570 110.', items: [{ type: 'Deposit', totalIncGst: 1500 }], payments: [], totalAmount: 1500, totalPaid: 0,
  createdAt: new Date(now - 20 * MIN).toISOString().slice(0, 19), cancelledAt: null,
  agreementLink: { id: 28, token: 'pay-token-abc123def456', status: 'DRAFT', fullName: 'Nina Halvorsen', paymentAmount: 1500 },
  ...extra,
});
let dashboardLeads = { IMPORTS: [rawLead(7001)], carbarnau: [] };
let dashboardOrders = { 7001: [rawOrder(7001)] };
let soldFor = {};          // lot id -> what similar cars sold for: [grade, km, yen]
// The ten sales the website lists for the car in these tests. The three closest to it (grade 3.5,
// 121,000 km) are the first three: their average is ¥322,333.
const SOLD_XV = [['3.5', 120000, 401000], ['3.5', 122000, 388000], ['3.5', 117000, 178000], ['3.5', 115000, 319000], ['3.5', 147000, 251000], ['3.5', 148000, 233000], ['3.5', 93000, 211000], ['3.5', 150000, 166000], ['3.5', 152000, 179000], ['4', 127000, 205000]];

before(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const url = new URL(req.url, 'http://x');
      const p = url.pathname;
      calls.push({ method: req.method, path: p, query: Object.fromEntries(url.searchParams), cookie: !!req.headers.cookie, body });
      const json = (status, data, headers = {}) => { res.writeHead(status, { 'content-type': 'application/json', ...headers }); res.end(JSON.stringify(data)); };
      if (p === '/chat') {
        if (aiDown) return json(503, { error: { message: 'The model is overloaded.' } });
        const next = aiScript.shift() || { reply: 'Hi {{NAME}},\nNo worries.', needs_human: [], facts_used: [], hold: false };
        return json(200, { choices: [{ message: { content: JSON.stringify(next) }, finish_reason: 'stop' }] });
      }
      if (p === '/carbarnau/auth/v1/api/user/signin') return json(200, { username: 'tester' }, { 'set-cookie': 'carbarn_session=stand-in; Path=/' });
      if (p === '/core/user/api/v1/lead/paginated') return json(200, { leadDtoList: Number(url.searchParams.get('page')) === 1 ? dashboardLeads[url.searchParams.get('platform')] || [] : [] });
      if (p === '/carbarnau/api/v1/sales/auction') return json(200, { content: Object.values(dashboardOrders).flat(), page: { totalPages: 1 } });
      if (p === '/auc/api/public/auction-vehicles') {
        const rows = /subaru/i.test(url.searchParams.get('make') || '') && /xv hybrid/i.test(url.searchParams.get('model') || '') ? LOTS.map(lotRow) : [];
        return json(200, { vehicles: Number(url.searchParams.get('page')) === 0 ? rows : [], total: rows.length });
      }
      let m = p.match(/^\/auc\/api\/public\/auction-vehicles\/(\d+)$/);
      if (m) { const row = LOTS.find((l) => l[0] === m[1]); return row ? json(200, lotDetail(row)) : json(404, { error: 'Not Found' }); }
      m = p.match(/^\/auc\/api\/public\/auction-vehicles\/(\d+)\/sold-comparables$/);
      if (m && req.method === 'GET') return soldFor[m[1]] ? json(200, { sampleCount: soldFor[m[1]].length, matchLevel: 'EXACT_VARIANT', benchmarkYen: 253100, comparables: soldFor[m[1]].map(([grade, odometerKm, soldPriceYen]) => ({ year: 2015, odometerKm, grade, variant: 'HYBRID 2.0I EYESIGHT', soldPriceYen, soldPriceAud: Math.round(soldPriceYen * 0.009138) })) }) : json(404, { error: 'Not Found' });
      m = p.match(/^\/auc\/api\/public\/auction-vehicles\/(\d+)\/price-estimate$/);
      if (m && req.method === 'POST') return json(200, estimateFor(JSON.parse(body).bidYen));
      return json(404, { error: 'Not Found' });
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const { config } = await import('../src/config.js');
  config.llm.gemini.url = `${base}/chat`;
  config.dashboard.baseUrl = base;
  config.auction.baseUrl = base;
  config.sessionPath = sessionFile; // never the real session file
  db = await import('../src/db.js');
  items = await import('../src/items.js');
  drafter = await import('../src/drafter.js');
  sync = await import('../src/sync.js');
  dash = await import('../src/dashboard.js');
  auction = await import('../src/auction.js');
  imports = await import('../src/imports.js');
  text = await import('../src/text.js');
  llm = await import('../src/llm.js');
  promptModule = await import('../src/prompt.js');
});

after(() => new Promise((r) => { fs.rmSync(sessionFile, { force: true }); server.close(r); server.closeAllConnections?.(); }));
beforeEach(() => { calls.length = 0; aiScript = []; aiDown = false; soldFor = {}; llm.resetModelState(); });
/** Stores an auction order for a lead, as a sync would. */
const order = (leadId, extra = {}) => sync.storeAuctionOrders([rawOrder(leadId, { id: leadId, ...extra })], { complete: false, now });

const quickly = async (fn) => { const real = globalThis.setTimeout; globalThis.setTimeout = (f, ms, ...a) => real(f, Math.min(ms, 5), ...a); try { return await fn(); } finally { globalThis.setTimeout = real; } };
const ai = () => calls.filter((c) => c.path === '/chat');
const feed = () => calls.filter((c) => c.path.startsWith('/auc/'));
const fails = (d) => d.checks.filter((c) => c.level === 'fail').map((c) => c.code);

let mid = 1;
const lead = (id, conv, first, extra = {}) => db.upsertLead({ id, conversationId: conv, firstName: first, lastName: 'Test', phone: `0491 570 ${id}`, email: `${first.toLowerCase()}@example.com`, source: 'Auction', status: 'NEW', platform: 'IMPORTS', state: '', leadAt: now - HOUR, updatedAt: now - 5 * MIN, stocks: [], statusHistory: [],
  inquiries: [{ id: id * 10, type: 'Auction', subject: 'Auction alert for Subaru XV Hybrid', text: FORM, stockNo: '', at: now - HOUR, status: 'NEW', url: '', leadType: '', staffNotes: [] }], ...extra });
const conv = (id, leadId, name) => db.upsertConversation({ id, phone: `+61491570${leadId}`, channel: 'SMS', status: 'OPEN', leadId, customerName: name, latestDirection: 'IN', latestAt: now - MIN, latestBody: 'x', leadPlatform: 'IMPORTS', leadStatus: 'NEW', leadEmail: '' });
const msg = (conversationId, direction, body, agoMs) => db.upsertMessage({ id: mid++, conversationId, direction, body, sentBy: direction === 'OUT' ? 'Dana' : null, status: 'SENT', mediaType: null, at: now - agoMs, importedAt: now - agoMs });

const CLOSING = '📍 Unit D3, 128-130 Frances Street, Lidcombe NSW 2141\n📞 0423 840 130\n🕛 Open 7 days, 8 AM–5 PM\n\nRegards,\nTeam Carbarn';
const OFFER = (bidSentence, bid, total, lines) => [
  'Vehicle details:\n2015 Subaru XV Hybrid 2.0i EyeSight\n121,000 km\nAuction Grade 3.5\n2.0L Hybrid\n4WD\n5 seats',
  'You can view the vehicle and photos here:\nhttps://www.carbarn.com.au/live-auction/subaru/xv-hybrid/gpe/1992541',
  bidSentence,
  `Based on a ${bid} bid, the current estimated landed and complied cost is approximately AUD ${total}, including:`,
  lines,
  'If you would like us to proceed, you can use the deposit link below:\n[DEPOSIT LINK?]',
  'We do not bid blindly. Our Japan-side team will inspect the vehicle first and share the photos, auction sheet and inspection feedback. We will only place the final bid once you are happy and confirm us to proceed.',
  'Kind regards,\nTeam Carbarn',
].join('\n\n');
const SUGGESTED = "The website's suggested bid is ¥253,590. We usually suggest around ¥300,000 to improve the chance of winning. However, if you have your own preferred bid amount, please let us know and we can proceed with that amount.";
const COSTS_300K = '- Auction price: $2,741 AUD\n- Japan agent fee: $822 AUD\n- Carbarn agent fee: $1,500 AUD\n- Shipping, logistics, duty & import charges: $3,426 AUD\n- Compliance package: $1,540 AUD\n- GST: $989 AUD';

// ---- reading the enquiries -------------------------------------------------------------------------

test('the website\'s import and auction forms are read into a plain sentence and the customer\'s own words', () => {
  const a = text.readImportForm(FORM, { type: 'Auction', subject: 'Auction alert for Subaru XV Hybrid' });
  assert.equal(a.kind, 'auction');
  assert.deepEqual([a.make, a.model, a.grade, a.maxKm, a.ceilingAud, a.viewing], ['Subaru', 'XV Hybrid', '', 0, 30000, '2015 SUBARU SUBARU XV']);
  assert.equal(a.event, "Asked on the website's live auction pages to be told when a Subaru XV Hybrid comes up at auction in Japan. Landed budget: under $30k. They were looking at this auction car: 2015 SUBARU SUBARU XV.");

  const html = '<strong>Request Available Vehicles Lead</strong><br><br><strong>Selected Pathway:</strong><ul><li>Full Import Service (Car + Compliance)</li></ul><strong>Vehicle Details:</strong><ul><li>Make: Nissan</li><li>Model: Stagea</li><li>Model Code: M35</li><li>Year Range: 2001-2007</li><li>Fuel Type: Petrol</li></ul><strong>Preferred Contact:</strong> Email<br><br><strong>Additional Notes:</strong><br>a manual if you can find one';
  const b = text.readImportForm(html, { type: 'Import Request', subject: 'Sourcing enquiry for Nissan Stagea (M35)' });
  assert.deepEqual([b.kind, b.make, b.model, b.modelCode, b.notes], ['import', 'Nissan', 'Stagea', 'M35', 'a manual if you can find one']);
  assert.match(b.event, /^Import enquiry through the website: asked us to source a Nissan Stagea \(model code M35\) from Japan\. Service chosen: Full Import Service \(Car \+ Compliance\)\.$/);

  const plain = 'Sourcing option selected: Car + Compliance. Includes sourcing, shipping, customs, and compliance management. Vehicle information: Make: Toyota, Model: Crown Majesta, Model Code: GWS214, Build Year: 2016, Body Type: Sedan, Fuel Type: Hybrid. Preferred contact: SMS. Additional notes: Can this one be brought in?';
  const c = text.readImportForm(plain, { type: 'Import Request' });
  assert.deepEqual([c.make, c.model, c.modelCode, c.notes], ['Toyota', 'Crown Majesta', 'GWS214', 'Can this one be brought in?']);

  assert.equal(text.readImportForm('<strong>Compliance-only Request</strong><br>Make: Toyota', { type: 'Compliance Request' }).kind, 'compliance');
  assert.equal(text.readImportForm('Hi, is the Hiace still available?', { type: 'carsales' }), null);
  // The enquiry reaches the conversation as an event plus the customer's own words.
  assert.deepEqual(text.readInquiry({ type: 'Import Request', subject: 'Sourcing enquiry for Nissan Stagea (M35)', text: html }).text, 'a manual if you can find one');
});

test('what a customer says about budget, kilometres, years, grade and a bid is picked out of their words', () => {
  const s = (t) => imports.specificsIn(t);
  const a = s("Looking to spend around 10k all up.\n\nSomething with k's less than 100,000 would be good.");
  assert.deepEqual([a.budgetAud, a.maxKm, a.yearFrom], [10000, 100000, 0]);
  assert.equal(s('the payout should be about 12k').budgetAud, 12000);
  assert.deepEqual([s('2015 or newer please').yearFrom, s('between 2014 and 2016').yearTo, s('newer than my 2014 one').yearFrom], [2015, 2016, 2015]);
  assert.deepEqual([s('under 80k kms, budget $15,000').maxKm, s('under 80k kms, budget $15,000').budgetAud], [80000, 15000]);
  assert.equal(s('can we bid ¥250,000 instead').bidYen, 250000);
  assert.equal(s('I can go to 280,000 yen').bidYen, 280000);
  assert.equal(s('grade 4 or better').minGrade, 4);
  assert.deepEqual(Object.values(s('Thanks, sounds good. Any colour is fine.')).filter(Boolean), []);
});

// ---- reading them from the dashboard, read-only ----------------------------------------------------

test('import and auction leads are fetched from their own list, and the auction orders are read as one list with no address, licence or payment link kept', async () => {
  const out = await sync.syncLeads({ pages: 1 });
  assert.equal(out.importLeads, 1);
  assert.ok(calls.some((c) => c.path === '/core/user/api/v1/lead/paginated' && c.query.platform === 'IMPORTS'));
  assert.equal(db.getLead(7001).platform, 'IMPORTS');

  calls.length = 0;
  assert.deepEqual(await sync.syncAuctionOrders({ now }), { auctionOrders: 1, auctionOrdersChanged: 1 });
  const asked = calls.filter((c) => c.path === '/carbarnau/api/v1/sales/auction');
  assert.deepEqual(asked.map((c) => [c.method, c.query.leadId, c.query.page]), [['GET', undefined, '0']], 'the whole list is asked for once, not lead by lead');
  const order = db.getAuctionOrder(7001);
  assert.deepEqual(order.wanted, { make: 'Subaru', model: 'XV Hybrid', modelCode: 'GPE', variant: '', yearFrom: 2014, yearTo: 2015, targetBidYen: 220000, budgetAud: 10400, notes: 'A light colour if possible. Call me on 0491 570 110.' });
  const stored = JSON.stringify(db.openDb().prepare('SELECT * FROM auction_orders').all());
  // Who the order is for is kept, so it can be shown and matched to their conversation. The rest is not.
  for (const kept of ['Halvorsen', 'nina@example.com', '0491570110']) assert.ok(stored.includes(kept), `not kept: ${kept}`);
  for (const secret of ['LIC998877', '1988-02-03', 'Gum Tree', 'pay-token-abc123def456', 'Some Staff'])
    assert.ok(!stored.includes(secret), `kept: ${secret}`);
  // Read again: one request, and nothing has changed.
  calls.length = 0;
  assert.deepEqual(await sync.syncAuctionOrders({ now: now + 5 * MIN }), { auctionOrders: 1, auctionOrdersChanged: 0 });
  assert.equal(calls.filter((c) => c.path === '/carbarnau/api/v1/sales/auction').length, 1);
  // Nothing on the dashboard was written to.
  assert.ok(calls.every((c) => c.method === 'GET' || c.path.endsWith('/signin')));
});

test('the auction feed can only be read: three requests, no login, and only the bid is sent to the calculator', async () => {
  const lots = await auction.searchLots({ make: 'Subaru', model: 'XV Hybrid' });
  assert.equal(lots.length, 10);
  const lot = await auction.getLot('1992541');
  assert.deepEqual([lot.title, lot.km, lot.grade, lot.benchmarkYen, lot.url], ['2015 Subaru XV Hybrid 2.0i EyeSight', 121000, '3.5', 253590, 'https://www.carbarn.com.au/live-auction/subaru/xv-hybrid/gpe/1992541']);
  const est = await auction.estimateFor('1992541', 300000);
  assert.equal(est.totalAud, 11019);
  assert.deepEqual(est.lines.map((l) => l.aud), [2741, 822, 1500, 3426, 1540, 989]);

  assert.ok(feed().every((c) => !c.cookie), 'no login is sent to the feed');
  const posts = feed().filter((c) => c.method === 'POST');
  assert.deepEqual(posts.map((c) => [c.path, c.body]), [['/auc/api/public/auction-vehicles/1992541/price-estimate', '{"bidYen":300000}']]);
  assert.equal(await auction.getLot('../../x'), null);
  assert.equal(await auction.estimateFor('1992541', 5), null, 'a nonsense bid is never sent');
  assert.equal(await auction.getLot('7777777'), null, 'a car that has left the feed');
  // The dashboard client still refuses anything it was not given.
  await assert.rejects(() => dash.get('/carbarnau/api/v1/sales/auction/33'), /Blocked/);
  await assert.rejects(() => dash.get('/auc/api/public/auction-vehicles'), /Blocked/);
  assert.equal(auction.lotIdFromUrl('see https://www.carbarn.com.au/live-auction/subaru/xv-hybrid/gpe/2006629 please'), '2006629');

  // The feed's variant is typed by hand: it is tidied, and garbled words at its end are left off.
  assert.equal(auction.tidyVariant('HYBRID 2.0I EYESIGHT PRA UDOED', 'XV Hybrid'), '2.0i EyeSight');
  assert.equal(auction.tidyVariant('2.0I-L EYESIGHT 4WD', 'XV Hybrid'), '2.0i-L EyeSight 4WD');
  assert.equal(auction.tidyVariant('HIGHWAY STAR V', 'Serena'), 'Highway Star V');
  assert.equal(auction.tidyVariant('ZS KIRAMEKI 2', 'Voxy'), 'ZS Kirameki 2');
});

test('the details panel is given what the customer is looking for, and the list shows the car they want', async () => {
  const { startServer } = await import('../src/server.js');
  process.env.PORT = '0';
  const { config } = await import('../src/config.js');
  const keptPort = config.port;
  config.port = 0;
  const app = await startServer();
  try {
    db.upsertLead({ id: 9100, conversationId: null, firstName: 'Tess', lastName: 'Test', phone: '0491 570 100', email: '', source: 'Auction', status: 'NEW', platform: 'IMPORTS', state: '', leadAt: now - HOUR, updatedAt: now - 5 * MIN, stocks: ['0'], statusHistory: [],
      inquiries: [{ id: 91000, type: 'Auction', subject: 'Auction alert for Subaru XV Hybrid', text: FORM.replace('Max odometer: Not provided', 'Max odometer: 90000'), stockNo: '0', at: now - HOUR, status: 'NEW', url: '', leadType: '', staffNotes: [] }] });
    order(9100, { orderNo: 'AS-50', requirementNotes: '' });
    const one = await (await fetch(`http://127.0.0.1:${app.address().port}/api/items/l:9100`)).json();
    assert.deepEqual(one.item.looking, { car: 'Subaru XV Hybrid (GPE)', years: '2014 to 2015', maxKm: 90000, budget: 10400, grade: 0, order: 'AS-50, sourcing', missing: 'preferred grade or specification, colour or feature preferences' });
    assert.equal(one.item.car, 'Subaru XV Hybrid');
    assert.equal(one.item.vehicle, null, 'a "stock number" of 0 on an import lead is not one of our cars');
  } finally { config.port = keptPort; await new Promise((r) => { app.close(r); app.closeAllConnections?.(); }); }
});

test('the suggested bid is the average of the three closest sold cars, rounded up, and the car is chosen for what was asked', () => {
  const car = { grade: '3.5', km: 121000, benchmarkYen: 253590 };
  const sold = (rows) => ({ comparables: rows.map(([grade, km, soldYen]) => ({ grade, km, soldYen })) });
  // The same grade first, then the nearest kilometres: the cars with 120,000, 122,000 and 117,000 km.
  const bid = imports.suggestedBid(car, sold(SOLD_XV));
  assert.deepEqual([bid.bidYen, bid.basis, bid.used.map((c) => c.soldYen)], [350000, 'sold', [401000, 388000, 178000]]);
  assert.match(imports.bidBasisLine(bid),/^Bid from the 3 closest sold cars, averaged and rounded up: grade 3\.5, 120,000 km, sold ¥401,000; grade 3\.5, 122,000 km, sold ¥388,000; /);
  // A sale of another grade is used only when there are not three of the same grade.
  assert.deepEqual(imports.suggestedBid(car, sold([['4.5', 121000, 900000], ['4', 122000, 310000], ['3.5', 150000, 200000], ['4', 121000, 300000]])).used.map((c) => c.soldYen), [200000, 300000, 310000]);
  // Fewer than three sales: the average of what there is. An average already on a step stays there.
  assert.equal(imports.suggestedBid({ ...car, benchmarkYen: 201000 }, sold([['3.5', 100000, 200000], ['3.5', 90000, 250000]])).bidYen, 250000);
  // Never below the website's own suggested bid: when similar cars sold for less, that bid is rounded up instead.
  const floor = imports.suggestedBid(car, sold([['3.5', 100000, 200000], ['3.5', 90000, 250000]]));
  assert.deepEqual([floor.bidYen, floor.basis, floor.used.length], [300000, 'floor', 2]);
  assert.match(imports.bidBasisLine(floor), /^The 2 closest sold cars went for less than the website's suggested bid, and we never suggest below it, so the website's bid was rounded up: /);
  assert.equal(imports.suggestedBid({ grade: '4', km: 13000, benchmarkYen: 1063580 }, sold([['4', 12000, 819000], ['4', 11000, 900000], ['4', 15000, 1017000]])).bidYen, 1100000);
  assert.equal(imports.suggestedBid(car, sold([['3.5', 100000, 300000]])).bidYen, 300000);
  // No sold prices: the website's own suggested bid, rounded up.
  assert.deepEqual(imports.suggestedBid(car, sold([])), { bidYen: 300000, basis: 'website', used: [] });
  assert.deepEqual([217210, 300000, 455820].map((y) => imports.suggestedBid({ grade: '4', km: 1, benchmarkYen: y }, null).bidYen), [250000, 300000, 500000]);
  const lots = LOTS.map((r) => auction.normalizeLot(lotRow(r)));
  const pick = (w) => imports.chooseLot(lots, { yearFrom: 0, yearTo: 0, maxKm: 0, budgetAud: 0, ceilingAud: 0, minGrade: 0, modelCode: '', ...w })?.id;
  // Newer than 2014, about $10,000, under 100,000 km preferred: the 2015 grade 3.5 car, not the cheaper repaired one.
  assert.equal(pick({ yearFrom: 2014, yearTo: 2015, budgetAud: 10400, maxKm: 100000 }), '1992541');
  assert.equal(pick({ budgetAud: 10000, maxKm: 100000 }), '1992541');
  // With more to spend, the low-kilometre grade 4 car.
  assert.equal(pick({ yearFrom: 2014, budgetAud: 13000, maxKm: 100000 }), '2006629');
  // A car inside the budget comes before a better-graded one that is a little above it.
  assert.equal(pick({ yearFrom: 2014, yearTo: 2015, budgetAud: 11500, maxKm: 130000 }), '1992541');
  // A budget nothing comes near: nothing is offered.
  assert.equal(pick({ budgetAud: 5000 }), undefined);
  assert.equal(pick({ yearFrom: 2022 }), undefined);
});

// ---- the first reply: ask what they are looking for ---------------------------------------------------

test('a new import enquiry with only the form gets the standard asking reply, word for word, with no AI', async () => {
  lead(9001, null, 'Nina');
  const it = items.buildItem({ leadId: 9001 });
  assert.equal(it.state, 'awaiting');
  assert.equal(it.situation.primary, 'import_sourcing');
  assert.equal(it.imports.kind, 'auction');
  assert.equal(it.vehicles.length, 0);

  const d = await drafter.draftFor(it, { save: false, now });
  assert.equal(ai().length, 0, 'no AI request is spent on it');
  assert.equal(feed().length, 0, 'and nothing is searched until we know what they want');
  assert.equal(d.model, 'standard wording');
  assert.equal(d.reply, 'Hi Nina, thanks for your Subaru XV Hybrid enquiry.\n\n'
    + 'To help us narrow down the right car from Japan auctions, could you please let us know your preferred year range, maximum odometer, preferred grade or specification, approximate landed budget in Australia, and any colour or feature preferences you have?\n\n'
    + 'If you’re interested in a particular one that comes up, you can also send us your target bid or overall budget and we can work out an estimated landed cost before placing anything.\n\n'
    + 'Once we have those details, we can keep the search focused and let you know when a suitable one becomes available.\n\n'
    + CLOSING);

  // No name on the record: "Hi," as the team writes it.
  lead(9002, null, '', { phone: '0491 570 002' });
  const anon = await drafter.draftFor(items.buildItem({ leadId: 9002 }), { save: false, now });
  assert.ok(anon.reply.startsWith('Hi, thanks for your Subaru XV Hybrid enquiry.\n\n'), anon.reply.slice(0, 80));

  // What they want was said on the phone: typed into Rewrite, it is searched for straight away.
  calls.length = 0;
  aiScript = [{ reply: 'Hi {{NAME}},\n\nWe’ve found a 2015 Subaru XV Hybrid that may be worth considering.', needs_human: [], facts_used: [], hold: false }];
  const phoned = await drafter.draftFor(it, { save: false, now, instruction: '2015 or newer, under 130,000 km, budget 12k' });
  assert.match(JSON.parse(ai()[0].body).messages[1].content, /What they asked for: year 2015 or newer; under 130,000 km; a landed budget of about \$12,000\./);
  assert.ok(phoned.reply.includes('https://www.carbarn.com.au/live-auction/subaru/xv-hybrid/gpe/1992541'), phoned.reply.slice(0, 300));
  // A dollar figure in an instruction that is not called a budget is not one.
  assert.equal(imports.wantedFrom(it, 'tell them the deposit is $5,000').budgetAud, 0);
});

test('when the customer also wrote something, the AI answers it and still asks, with the closing lines added', async () => {
  const html = '<strong>Request Available Vehicles Lead</strong><br><br><strong>Vehicle Details:</strong><ul><li>Make: Subaru</li><li>Model: XV Hybrid</li><li>Model Code: GPE</li></ul><strong>Additional Notes:</strong><br>How long does it take to get one here?';
  lead(9003, null, 'Omar', { source: 'Import Request', inquiries: [{ id: 90030, type: 'Import Request', subject: 'Sourcing enquiry for Subaru XV Hybrid (GPE)', text: html, stockNo: 'subaru-xv-hybrid-gpe', at: now - HOUR, status: 'NEW', url: '', leadType: '', staffNotes: [] }] });
  aiScript = [{ reply: 'Hi {{NAME}},\nThanks for your Subaru XV Hybrid enquiry. Sourcing, shipping and compliance take about 6 to 10 weeks.\nCould you let us know your preferred year range, maximum odometer, grade, landed budget and any colour preferences?', needs_human: [], facts_used: [], hold: false }];
  const d = await drafter.draftFor(items.buildItem({ leadId: 9003 }), { save: false, now });
  assert.equal(ai().length, 1);
  const asked = JSON.parse(ai()[0].body).messages[1].content;
  assert.match(asked, /=== IMPORT ENQUIRY ===\nThis customer asked us to find a Subaru XV Hybrid from Japan\. Before we search the auctions we need to know: your preferred year range, maximum odometer/);
  assert.ok(!/=== STANDARD FIRST REPLY ===/.test(asked), 'the import closing lines take the place of the standard block');
  assert.ok(d.reply.endsWith(CLOSING), d.reply);
  assert.deepEqual(fails(d), []);
});

// ---- the offer: a car from the live auction -------------------------------------------------------------

test('once the customer says what they want, the live auction is searched and the offer is laid out with the website\'s figures', async () => {
  lead(9004, 904, 'Nina');
  conv(904, 9004, 'Nina Test');
  msg(904, 'OUT', 'Hi, thanks for your Subaru XV Hybrid enquiry.\n\nCould you please let us know your preferred year range, maximum odometer and budget?', 50 * MIN);
  msg(904, 'IN', 'Thanks for getting back to me.\n\nMy last one was a 2014 XV and I would like something newer, a hybrid this time.\n\nI can spend around 10k all up.\n\nUnder 100,000 km if possible, but that is not essential.', 5 * MIN);
  const it = items.buildItem({ conversationId: 904 });
  assert.equal(it.itemKey, 'c:904');
  assert.deepEqual(imports.wantedFrom(it).given, ['odometer', 'budget']);

  const opening = 'Hi {{NAME}},\n\nWe’ve found a 2015 Subaru XV Hybrid that may be worth considering. It is newer than your last XV and it is a hybrid, as you asked.';
  // However the AI breaks its lines, the opening is laid out as the team writes it: greeting, blank line, one paragraph.
  aiScript = [{ reply: opening.replace(',\n\n', ',\n').replace('considering. ', 'considering.\n'), needs_human: [], facts_used: [], hold: false }];
  const d = await drafter.draftFor(it, { save: false, now });

  // What was read: the list, the chosen car, and one calculation at the rounded-up bid.
  // The website lists no sold prices for this car here, so its own suggested bid is rounded up.
  assert.deepEqual(feed().map((c) => `${c.method} ${c.path.split('/').slice(5).join('/') || 'list'}`), ['GET list', 'GET 1992541', 'GET 1992541/sold-comparables', 'POST 1992541/price-estimate']);
  assert.equal(feed()[3].body, '{"bidYen":300000}');
  assert.equal(d.reply, `${opening.replace('{{NAME}}', 'Nina')}\n\n${OFFER(SUGGESTED, '¥300,000', '$11,019', COSTS_300K)}`);
  assert.deepEqual(fails(d), [], JSON.stringify(d.checks));
  assert.ok(d.checks.some((c) => c.level === 'input' && c.code === 'marker' && c.tokens.includes('[DEPOSIT LINK?]')), 'the deposit link is a blank for a person');
  assert.match(d.checks.find((c) => c.code === 'auction').message, /^Auction car 1992541, auction on 7 Oct 2026 at MIRIVE Saitama\. The bid and costs were read from the live auction at /);
  assert.ok(d.factsUsed.some((f) => /The website's suggested bid ¥253,590; bid used ¥300,000 \(ours\)/.test(f)));
  assert.ok(d.factsUsed.includes("No sold prices for this car, so the website's suggested bid was rounded up"));

  // With sold prices on the website, the bid comes from the three closest sold cars.
  soldFor = { 1992541: SOLD_XV };
  calls.length = 0;
  aiScript = [{ reply: opening, needs_human: [], facts_used: [], hold: false }];
  const fromSold = await drafter.draftFor(it, { save: false, now });
  assert.equal(feed().find((c) => c.method === 'POST').body, '{"bidYen":350000}');
  assert.ok(fromSold.reply.includes("The website's suggested bid is ¥253,590. We usually suggest around ¥350,000 to improve the chance of winning."));
  assert.ok(fromSold.factsUsed.some((f) => /^Bid from the 3 closest sold cars, averaged and rounded up/.test(f)));
  soldFor = {};

  // What the AI was told, and not told.
  const asked = JSON.parse(ai()[0].body).messages[1].content;
  assert.match(asked, /=== AUCTION CAR FOR THIS CUSTOMER ===\nThis customer asked us to find a Subaru XV Hybrid from the Japan auctions\. What they asked for: under 100,000 km; a landed budget of about \$10,000\./);
  assert.match(asked, /We searched the live auction \(10 Subaru XV Hybrid in the coming auctions\) and chose this one: 2015 Subaru XV Hybrid 2\.0i EyeSight, 121,000 km, auction grade 3\.5, at auction on 7 Oct 2026\./);
  assert.match(asked, /121,000 km: MORE than the 100,000 km they preferred\. Do not say it is low-kilometre\./);
  assert.match(asked, /Estimated landed cost: a little above the budget they gave/);
  assert.match(asked, /Do not write any price, bid, cost, kilometres, grade or link/);
  const sent = ai()[0].body;
  for (const secret of ['Nina', '0491', 'nina@example.com']) assert.ok(!sent.includes(secret), `leaked: ${secret}`);
});

test('an opening that states a price is replaced by the standard one, and an offer is still written when no AI answers', async () => {
  const it = items.buildItem({ conversationId: 904 });
  const priced = 'Hi {{NAME}},\n\nWe’ve found a 2015 Subaru XV Hybrid for about $11,019 landed.';
  aiScript = [priced, priced].map((reply) => ({ reply, needs_human: [], facts_used: [], hold: false }));
  const d = await drafter.draftFor(it, { save: false, now });
  assert.equal(ai().length, 2, 'asked once more, then the standard opening is used');
  assert.ok(d.reply.startsWith('Hi Nina,\n\nWe’ve found a 2015 Subaru XV Hybrid that may be worth considering.\n\nVehicle details:'), d.reply.slice(0, 120));
  assert.deepEqual(fails(d), []);

  calls.length = 0;
  aiDown = true;
  const without = await quickly(() => drafter.draftFor(it, { save: false, now }));
  assert.equal(without.status, 'ready');
  assert.equal(without.model, 'standard wording');
  assert.ok(without.reply.includes('Based on a ¥300,000 bid, the current estimated landed and complied cost is approximately AUD $11,019'));
});

test('Rewrite can name the bid or the car, and a bid the customer names is called their own', async () => {
  const it = items.buildItem({ conversationId: 904 });
  const opening = { reply: 'Hi {{NAME}},\n\nWe’ve found a 2015 Subaru XV Hybrid that may be worth considering.', needs_human: [], facts_used: [], hold: false };

  aiScript = [opening];
  const bid = await drafter.draftFor(it, { save: false, now, instruction: 'bid 280000' });
  assert.equal(feed().filter((c) => c.method === 'POST')[0].body, '{"bidYen":280000}');
  assert.ok(bid.reply.includes('We usually suggest around ¥280,000 to improve the chance of winning'), 'a bid our staff chose is still our suggestion');
  assert.equal(feed().filter((c) => c.path.endsWith('/sold-comparables')).length, 0, 'the bid was given, so the sold prices are not needed');

  calls.length = 0;
  aiScript = [opening];
  const car = await drafter.draftFor(it, { save: false, now, instruction: 'use https://www.carbarn.com.au/live-auction/subaru/xv-hybrid/gpe/2006629' });
  assert.deepEqual(feed().map((c) => c.path.split('/').pop()), ['2006629', 'sold-comparables', 'price-estimate'], 'no search: the car was named');
  assert.equal(feed()[2].body, '{"bidYen":500000}');
  assert.ok(car.reply.includes('https://www.carbarn.com.au/live-auction/subaru/xv-hybrid/gpe/2006629'));
  assert.ok(car.reply.includes('73,000 km\nAuction Grade 4'));

  // The customer answers our offer with a bid of their own: same car, their figure.
  msg(904, 'OUT', `Hi Nina,\n\nWe’ve found a 2015 Subaru XV Hybrid.\n\n${OFFER(SUGGESTED, '¥300,000', '$11,019', COSTS_300K)}`, 3 * MIN);
  msg(904, 'IN', 'Looks good. Can we bid ¥260,000 instead?', 1 * MIN);
  calls.length = 0;
  aiScript = [opening];
  const theirs = await drafter.draftFor(items.buildItem({ conversationId: 904 }), { save: false, now });
  assert.deepEqual(feed().map((c) => c.path.split('/').pop()), ['1992541', 'price-estimate']);
  assert.equal(feed()[1].body, '{"bidYen":260000}');
  assert.ok(theirs.reply.includes('This is based on your own bid of ¥260,000.'));

  // An ordinary turn after that calls for no new search.
  msg(904, 'OUT', 'No worries, we can do that.', 50e3);
  msg(904, 'IN', 'Great, how long does shipping take?', 20e3);
  calls.length = 0;
  aiScript = [{ reply: 'Shipping and compliance take about 6 to 10 weeks in total.', needs_human: [], facts_used: [], hold: false }];
  const ordinary = await drafter.draftFor(items.buildItem({ conversationId: 904 }), { save: false, now });
  assert.equal(feed().length, 0);
  assert.ok(!ordinary.reply.includes('Vehicle details:'));
});

test('when nothing suitable is in the coming auctions, the reply says so and names no car', async () => {
  lead(9005, 905, 'Pia', { inquiries: [{ id: 90050, type: 'Auction', subject: 'Auction alert for Toyota Century', text: FORM.replace('Subaru', 'Toyota').replace('XV Hybrid', 'Century'), stockNo: '', at: now - HOUR, status: 'NEW', url: '', leadType: '', staffNotes: [] }] });
  conv(905, 9005, 'Pia Test');
  msg(905, 'IN', 'My budget is about $40,000 landed, 2018 or newer.', 5 * MIN);
  aiScript = [{ reply: 'Hi {{NAME}},\nThere is no suitable Toyota Century in the coming auctions at the moment. We are keeping the search going and will let you know when one comes up.', needs_human: [], facts_used: [], hold: false }];
  const d = await drafter.draftFor(items.buildItem({ conversationId: 905 }), { save: false, now });
  const asked = JSON.parse(ai()[0].body).messages[1].content;
  assert.match(asked, /We searched the live auction: no Toyota Century is in the coming auctions right now/);
  assert.match(asked, /Do not name or describe any particular car/);
  assert.equal(feed().filter((c) => c.method === 'POST').length, 0);
  assert.ok(d.reply.endsWith(CLOSING));
  assert.ok(!d.reply.includes('Vehicle details:'));
});

test('a request that is already under way, a compliance enquiry and an unreadable feed are left to an ordinary reply', async () => {
  lead(9006, 906, 'Quin');
  conv(906, 9006, 'Quin Test');
  msg(906, 'IN', 'My budget is around 12k', 5 * MIN);
  order(9006, { orderNo: 'AS-40', depositState: 'PAID' });
  assert.equal(await imports.planImport(items.buildItem({ conversationId: 906 }), { now }), null, 'a deposit is paid: no new quote');

  lead(9007, null, 'Rhea', { inquiries: [{ id: 90070, type: 'Compliance Request', subject: 'Compliance-only enquiry for Toyota Crown (GWS204)', text: '<strong>Compliance-only Request</strong><br>Make: Toyota<br>Model: Crown', stockNo: '', at: now - HOUR, status: 'NEW', url: '', leadType: '', staffNotes: [] }] });
  assert.equal(await imports.planImport(items.buildItem({ leadId: 9007 }), { now }), null);

  // The feed cannot be reached: no car is named, and the page says the auction was not read.
  const { config } = await import('../src/config.js');
  const kept = config.auction.baseUrl;
  config.auction.baseUrl = 'http://127.0.0.1:9';
  try {
    lead(9008, 908, 'Sol');
    conv(908, 9008, 'Sol Test');
    msg(908, 'IN', 'Budget about 11k, under 120,000 km', 5 * MIN);
    aiScript = [{ reply: 'Hi {{NAME}},\nWe are looking into this and will come back to you shortly.', needs_human: [], facts_used: [], hold: false }];
    const d = await drafter.draftFor(items.buildItem({ conversationId: 908 }), { save: false, now });
    assert.equal(d.status, 'ready');
    assert.match(JSON.parse(ai()[0].body).messages[1].content, /The live auction could not be read just now\. Do not name or describe any auction car/);
    assert.ok(d.checks.some((c) => c.code === 'auction' && /could not be read/.test(c.message)));
  } finally { config.auction.baseUrl = kept; }
});

test('an offer the team sent teaches only its opening: the car, the bid and the costs are not carried to another customer', async () => {
  const practice = await import('../src/practice.js');
  practice.resetPractice();
  const rows = practice.recentPractice({ now });
  const row = rows.find((r) => r.itemKey === 'c:904' && /We’ve found/.test(r.reply));
  assert.ok(row, JSON.stringify(rows.map((r) => r.reply.slice(0, 40))));
  assert.equal(row.reply, 'Hi {{NAME}},\n\nWe’ve found a 2015 Subaru XV Hybrid.\n[then the auction car: its details, link, bid and cost breakdown]');
  assert.ok(!/¥|\$|live-auction|1992541/.test(row.reply));
});
