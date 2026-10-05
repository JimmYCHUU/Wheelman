// The Auction section: auction orders read from the dashboard, the message that is due for each,
// the messages written from the wording file, and replies to what a customer wrote on WhatsApp.
// All data is invented. One stand-in service on this computer plays the dashboard, the website's
// auction feed and the AI.
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

process.env.DB_PATH = ':memory:';
process.env.SIGN_OFF = 'Regards,\\nTeam Carbarn';
process.env.GEMINI_API_KEY = 'test-key';
process.env.OPENROUTER_API_KEY = '';
process.env.GEMINI_MODEL = 'model-a';
process.env.GEMINI_FALLBACK_MODELS = '';
process.env.SECONDS_BETWEEN_DRAFTS = '0';
process.env.DAILY_DRAFT_LIMIT = '500';
process.env.MARKETPLACE_ENABLED = '0';
process.env.DASHBOARD_USERNAME = 'tester';
process.env.DASHBOARD_PASSWORD = ['stand', 'in', 'only'].join('-'); // invented: the stand-in accepts anything
process.env.VOICE_PEOPLE_FILE = 'voice/people.example.json';
process.env.PORT = '0';

const now = Date.now();
const MIN = 60e3, HOUR = 3600e3, DAY = 24 * HOUR;
const at = (agoMs) => new Date(now - agoMs).toISOString();
const sessionFile = path.join(os.tmpdir(), `wheelman-orders-session-${process.pid}.json`);
const calls = [];
let aiScript = [];
let server, app, base, db, sync, items, orders, messages, worker, time, checks;
let TOMORROW;

// ---- the stand-in auction feed -----------------------------------------------------------------
// [id, year, grade, km, days from today, website's suggested bid, landed at that bid]
const LOTS = [['1992541', 2015, '3.5', 121000, 1, 253590, 10506], ['2006629', 2015, '4', 73000, 1, 455820, 12742], ['2005010', 2013, 'R', 110000, 2, 217210, 10104]];
const lotRow = ([id, year, grade, km, days, bench, landed]) => ({
  id, title: `${year} SUBARU SUBARU XV`, make: 'SUBARU', model: 'SUBARU XV', modelCode: 'GPE', year, auctionDate: time.sydneyDay(now + days * DAY), auctionHouse: 'MIRIVE Saitama',
  odometerKm: km, auctionGrade: grade, transmission: 'Automatic', fuelType: 'Hybrid', ssotBenchmarkBidYen: String(bench),
  priceEstimate: { bidYen: String(bench), calculationStatus: 'ok', estimatedLandedAud: landed, manualReviewRequired: false, lctRiskWarning: false, thresholdWarnings: [] },
  eligibility: { make: 'Subaru', model: 'XV Hybrid', modelCode: 'GPE', status: 'ELIGIBLE' }, bidSubmissionStatus: 'ready',
});
const lotDetail = (row) => ({ listingStatus: 'LIVE', vehicle: { ...lotRow(row), variant: 'HYBRID 2.0I EYESIGHT', engineCc: 2000, driveType: '4WD', seatingCapacity: 5, colour: 'WINE' } });
const SOLD = [['3.5', 120000, 401000], ['3.5', 122000, 388000], ['3.5', 117000, 178000], ['4', 127000, 205000]];
const estimate = (bid) => {
  const a = Math.round(bid * 0.009138);
  return { bidYen: String(bid), estimatedLandedAud: a + 8212, calculationStatus: 'ok', manualReviewRequired: false, lctRiskWarning: false, thresholdWarnings: [],
    breakdown: { bidAudEstimate: a, japanAgentFee: 822, carbarnAgentFee: 1500, shippingLogisticsDutyAndImportCharges: 3400, compliancePackage: 1540, gst: 950, lct: null } };
};

// ---- the stand-in dashboard: one order at every stage --------------------------------------------
const person = (first, last, phone) => ({ id: 1, firstName: first, lastName: last, mobileNumber: phone, email: `${first.toLowerCase()}@example.com`, drivingLicenseNumber: 'LIC998877', dateOfBirth: '1988-02-03', address: '9 Gum Tree Lane', city: 'Taree' });
const deposit = (amount) => ({ stage: 'INITIAL_DEPOSIT', type: 'Deposit', description: 'Deposit for auction bidding', totalIncGst: amount, gst: 0 });
const raw = (id, first, extra = {}) => ({
  id, orderNo: `AS-${id}`, stage: 'INITIAL_DEPOSIT', source: 'LIVE_AUCTION', soldBy: 'Some Staff', leadId: null,
  auctionVehicleId: null, auctionHouse: null, lotNumber: null, auctionDate: null, lotPhase: 'SOURCING', preferredContact: 'WHATSAPP',
  followUpAt: null, updateCount: 0, latestUpdate: null, followUpDue: false, quiet: false, depositState: 'NONE', depositPaidAud: 0, lotSnapshot: null,
  invoiceTo: person(first, 'Halvorsen', `0491 570 ${id}`), deliveryTo: person(first, 'Halvorsen', `0491 570 ${id}`),
  reqMake: 'Subaru', reqModel: 'XV Hybrid', reqYearFrom: 2014, reqYearTo: 2015, reqVariant: null, reqModelCode: 'GPE', targetBidJpy: 226000, budgetAud: 10450,
  requirementNotes: 'A light colour if possible.', items: [deposit(1650)], payments: [], subtotal: 1650, taxTotal: 0, totalAmount: 1650, totalPaid: 0, totalDue: 1650,
  createdAt: at(2 * DAY), vehicleSecuredAt: null, completedAt: null, cancelledAt: null, refundRequestedAt: null, vehicle: null,
  agreementLink: { id: 28, token: 'feedfacecafe00aa11bb22cc33dd44ee', status: 'DRAFT', fullName: `${first} Halvorsen`, paymentAmount: 1650, paymentStatus: 'PENDING', agreementAccepted: false },
  invoices: null, ...extra,
});
const paidDeposit = { depositState: 'RECEIVED', depositPaidAud: 1650, payments: [{ id: 1, method: 'Bank Transfer', type: 'DEPOSIT', stage: 'INITIAL_DEPOSIT', amount: 1650, referenceNumber: 'REF-SECRET-77', paymentDateTime: at(2 * DAY), origin: 'MANUAL' }], totalPaid: 1650, totalDue: 0 };
const hiace = (stockIn) => ({
  id: 801, chassisNo: 'GDH206-0001', stockNo: 'T88', title: '2021 Toyota Hiace DX', year: '2021', make: 'TOYOTA', model: 'Hiace', modelCode: 'GDH206V', variant: 'DX', odometer: 60000, auctionGrade: '4', color: 'WHITE', fuel: 'Diesel', transmission: 'Automatic', seats: 3,
  stockIn, status: 'UNPUBLISHED', soldStatus: 'UnSold', lastSeenAtShipping: null,
  // Ours alone: none of these may be kept.
  fob: 777111, shippingPrice: 333444, grossCost: 888222, mechanicCost: 444555, supplierId: 'SUPPLIER-9', purchaseDate: '2026-09-01',
  salesInfo: { totalPrice: 999111 }, paymentSummary: { supplierPaid: 666777 }, auctionPhotos: ['https://photos.example/secret-photo.jpg'],
});
const securedMoney = {
  ...paidDeposit, chassisNo: 'GDH206-0001', vehicleMake: 'TOYOTA', vehicleModel: 'HIACE', vehicleModelCode: 'GDH206V', vehicleVariant: 'DX', vehicleYear: '2021', auctionGrade: '4', vehicleMileage: '60000',
  reqMake: 'Toyota', reqModel: 'Hiace', reqModelCode: 'GDH206V', reqYearFrom: 2021, reqYearTo: null, targetBidJpy: 2380000, budgetAud: 36350, lotPhase: null,
  items: [deposit(1650), { stage: 'VEHICLE_SECURED', type: 'Car Price in Japan', description: 'Car price in Japan', totalIncGst: 8415, gst: 0 }, { stage: 'VEHICLE_SECURED', type: 'Japan Agent Fee', description: 'Japan Agent Fee', totalIncGst: 837, gst: 0 }, { stage: 'VEHICLE_SECURED', type: 'Carbarn Agent Fee', description: 'Carbarn Agent Fee', totalIncGst: 1525, gst: 139 }],
  subtotal: 12427, taxTotal: 139, totalAmount: 12427, totalPaid: 1650, totalDue: 10777,
};
const snapshot = { auctionVehicleId: 1992541, title: '2015 SUBARU SUBARU XV', make: 'SUBARU', model: 'SUBARU XV', modelCode: 'GPE', variant: 'HYBRID 2.0I EYESIGHT', year: 2015, auctionHouse: 'MIRIVE Saitama', lotNumber: '10025', auctionDate: '2026-09-15', auctionGrade: '3.5', odometerKm: 121000, slug: 'x', mainImageUrl: 'https://photos.example/secret-main.jpg', photos: ['https://photos.example/secret-1.jpg'], transmission: 'Automatic', fuelType: 'Hybrid', colour: 'WINE' };
const note = (id, body, agoMs) => ({ id, at: at(agoMs), byUserId: 7, byName: 'Some Staff', channel: 'NOTE', body, followUpAt: null, canDelete: true });

const ORDERS = () => [
  raw(501, 'Nina'),                                                                    // new, no deposit
  raw(502, 'Remy', { ...paidDeposit, reqMake: 'Honda', reqModel: 'N-Box', reqModelCode: 'JF3', followUpDue: true, latestUpdate: note('n1', 'Still looking, nothing under 10,000 km', 3 * DAY), updateCount: 4 }), // deposit paid, searching
  raw(503, 'Omar', { ...paidDeposit, lotPhase: 'OUTCOME_DUE', auctionVehicleId: 1992541, lotSnapshot: snapshot, createdAt: at(20 * DAY) }), // bid placed
  raw(504, 'Pia', { ...securedMoney, stage: 'VEHICLE_SECURED', vehicleSecuredAt: at(DAY), vehicle: hiace('Japan'), createdAt: at(15 * DAY) }),
  raw(505, 'Quin', { ...securedMoney, stage: 'SHIPPING_COMPLIANCE', vehicleSecuredAt: at(58 * DAY), vehicle: hiace('Japan'), createdAt: at(70 * DAY), quiet: true, latestUpdate: note('n2', 'Waiting on a vessel', 25 * DAY), updateCount: 1 }),
  raw(506, 'Rhea', { ...securedMoney, stage: 'COMPLETED', vehicleSecuredAt: at(60 * DAY), completedAt: at(3 * DAY), vehicle: hiace('Sold'), createdAt: at(80 * DAY), totalPaid: 12427, totalDue: 0 }),
  raw(507, 'Sol', { stage: 'CANCELLED', cancelledAt: at(10 * DAY), createdAt: at(30 * DAY) }),
  raw(508, 'Tess', { ...paidDeposit, stage: 'REFUNDED', cancelledAt: at(2 * DAY), createdAt: at(30 * DAY) }),
  raw(509, 'Una', { stage: 'CANCELLED', cancelledAt: at(100 * DAY), createdAt: at(120 * DAY) }), // ended long ago: never kept
];
let dashboardOrders = [];

before(async () => {
  time = await import('../src/time.js');
  TOMORROW = time.sydneyDay(now + DAY);
  dashboardOrders = ORDERS();
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const url = new URL(req.url, 'http://x');
      const p = url.pathname;
      calls.push({ method: req.method, path: p, query: Object.fromEntries(url.searchParams), body });
      const json = (status, data, headers = {}) => { res.writeHead(status, { 'content-type': 'application/json', ...headers }); res.end(JSON.stringify(data)); };
      if (p === '/chat') {
        const next = aiScript.shift() || { reply: 'Hi {{NAME}},\nNo worries.', needs_human: [], facts_used: [], hold: false };
        return json(200, { choices: [{ message: { content: JSON.stringify(next) }, finish_reason: 'stop' }] });
      }
      if (p === '/carbarnau/auth/v1/api/user/signin') return json(200, { username: 'tester' }, { 'set-cookie': 'carbarn_session=stand-in; Path=/' });
      if (p === '/carbarnau/api/v1/sales/auction') {
        // Two orders a page, to show that every page is read.
        const page = Number(url.searchParams.get('page')) || 0, size = 5;
        return json(200, { content: dashboardOrders.slice(page * size, page * size + size), page: { size, number: page, totalElements: dashboardOrders.length, totalPages: Math.ceil(dashboardOrders.length / size) } });
      }
      if (p === '/auc/api/public/auction-vehicles') {
        const rows = /subaru/i.test(url.searchParams.get('make') || '') ? LOTS.map(lotRow) : [];
        return json(200, { vehicles: Number(url.searchParams.get('page')) === 0 ? rows : [], total: rows.length });
      }
      let m = p.match(/^\/auc\/api\/public\/auction-vehicles\/(\d+)$/);
      if (m) { const row = LOTS.find((l) => l[0] === m[1]); return row ? json(200, lotDetail(row)) : json(404, { error: 'Not Found' }); }
      m = p.match(/^\/auc\/api\/public\/auction-vehicles\/(\d+)\/sold-comparables$/);
      if (m) return json(200, { sampleCount: SOLD.length, matchLevel: 'EXACT_VARIANT', benchmarkYen: 293000, comparables: SOLD.map(([grade, odometerKm, soldPriceYen]) => ({ year: 2015, odometerKm, grade, variant: 'X', soldPriceYen })) });
      m = p.match(/^\/auc\/api\/public\/auction-vehicles\/(\d+)\/price-estimate$/);
      if (m && req.method === 'POST') return json(200, estimate(JSON.parse(body).bidYen));
      return json(404, { error: 'Not Found' });
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const stand = `http://127.0.0.1:${server.address().port}`;
  const { config } = await import('../src/config.js');
  config.llm.gemini.url = `${stand}/chat`;
  config.dashboard.baseUrl = stand;
  config.auction.baseUrl = stand;
  config.sessionPath = sessionFile; // never the real session file
  config.port = 0;
  db = await import('../src/db.js');
  sync = await import('../src/sync.js');
  items = await import('../src/items.js');
  orders = await import('../src/orders.js');
  messages = await import('../src/ordermessages.js');
  worker = await import('../src/worker.js');
  checks = await import('../src/checks.js');
  app = await (await import('../src/server.js')).startServer();
  base = `http://127.0.0.1:${app.address().port}`;
});

after(async () => { fs.rmSync(sessionFile, { force: true }); for (const s of [app, server]) await new Promise((r) => { s.close(r); s.closeAllConnections?.(); }); });
beforeEach(() => { calls.length = 0; aiScript = []; });

const ai = () => calls.filter((c) => c.path === '/chat');
const feed = () => calls.filter((c) => c.path.startsWith('/auc/'));
const get = async (p) => (await fetch(base + p)).json();
const post = async (p, body = {}) => { const res = await fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return { status: res.status, ...(await res.json()) }; };
const item = (id, opts) => items.buildOrderItem(id, opts);
const list = (tab) => get(`/api/items?section=auction&tab=${tab}`);
const compose = async (id, type, said = '') => messages.composeMessage(db.getOrder(id), type, { told: messages.factsIn(said), now });

// ---- reading the orders ---------------------------------------------------------------------------

test('every auction order is read as one list, and nothing private or of ours is kept', async () => {
  const out = await sync.syncAuctionOrders({ now });
  assert.deepEqual(out, { auctionOrders: 9, auctionOrdersChanged: 8 }, 'the one cancelled long ago is not kept');
  const asked = calls.filter((c) => c.path === '/carbarnau/api/v1/sales/auction');
  assert.deepEqual(asked.map((c) => [c.method, c.query.page, c.query.leadId]), [['GET', '0', undefined], ['GET', '1', undefined]], 'every page, with no lead named');
  assert.ok(calls.every((c) => c.method === 'GET' || c.path.endsWith('/signin')), 'the dashboard is only read');

  assert.deepEqual(db.listOrders({ now }).map((o) => o.id).sort(), [501, 502, 503, 504, 505, 506, 507, 508]);
  const o = db.getOrder(504);
  assert.deepEqual(o.customer, { firstName: 'Pia', lastName: 'Halvorsen', phone: '0491 570 504', email: 'pia@example.com' });
  assert.deepEqual([o.stage, o.depositState, o.car.stockNo, o.car.stockIn, o.money.total, o.money.paid, o.money.due], ['VEHICLE_SECURED', 'RECEIVED', 'T88', 'Japan', 12427, 1650, 10777]);
  assert.deepEqual(o.money.lines.map((l) => [l.stage, l.description, l.amount]), [['INITIAL_DEPOSIT', 'Deposit for auction bidding', 1650], ['VEHICLE_SECURED', 'Car price in Japan', 8415], ['VEHICLE_SECURED', 'Japan Agent Fee', 837], ['VEHICLE_SECURED', 'Carbarn Agent Fee', 1525]]);
  assert.deepEqual(db.getOrder(503).lot, { id: '1992541', title: '2015 SUBARU SUBARU XV', make: 'SUBARU', model: 'SUBARU XV', modelCode: 'GPE', variant: 'HYBRID 2.0I EYESIGHT', year: 2015, grade: '3.5', km: 121000, auctionDate: '2026-09-15', auctionHouse: 'MIRIVE Saitama', lotNumber: '10025', transmission: 'Automatic', fuel: 'Hybrid', colour: 'WINE' });

  const stored = JSON.stringify([db.openDb().prepare('SELECT * FROM auction_orders').all(), db.openDb().prepare('SELECT * FROM order_notes').all()]);
  for (const secret of ['LIC998877', '1988-02-03', 'Gum Tree', 'Taree', 'feedfacecafe00aa11bb22cc33dd44ee', 'Some Staff', 'REF-SECRET-77', 'Bank Transfer', 'secret-photo', 'secret-main', 'secret-1',
    '777111', '333444', '888222', '444555', 'SUPPLIER-9', '999111', '666777', 'GDH206-0001'])
    assert.ok(!stored.includes(secret), `kept: ${secret}`);
  // The staff note is kept, without who wrote it.
  assert.deepEqual(db.orderNotes(502).map((n) => n.body), ['Still looking, nothing under 10,000 km']);
});

test('an order that changes is noticed, and one that leaves the dashboard goes only after a complete read', async () => {
  // Nothing changed: nothing is rewritten as changed.
  assert.deepEqual(await sync.syncAuctionOrders({ now: now + MIN }), { auctionOrders: 9, auctionOrdersChanged: 0 });

  // A new staff note: the order has changed, and both notes are kept from now on.
  dashboardOrders.find((o) => o.id === 502).latestUpdate = note('n3', 'Customer is happy to go to 20,000 km', HOUR);
  assert.equal((await sync.syncAuctionOrders({ now: now + 2 * MIN })).auctionOrdersChanged, 1);
  assert.deepEqual(db.orderNotes(502).map((n) => n.note_id), ['n1', 'n3']);

  // A read that stops part-way marks nothing as gone.
  const kept = dashboardOrders;
  dashboardOrders = kept.filter((o) => o.id !== 507);
  sync.storeAuctionOrders(dashboardOrders.slice(0, 3), { complete: false, now: now + 3 * MIN });
  assert.ok(db.listOrders({ now }).some((o) => o.id === 507));
  // A complete read without it: it is gone from the list, and comes back if the dashboard shows it again.
  await sync.syncAuctionOrders({ now: now + 4 * MIN });
  assert.ok(!db.listOrders({ now }).some((o) => o.id === 507));
  assert.equal(items.buildOrderItem(507), null);
  dashboardOrders = kept;
  await sync.syncAuctionOrders({ now: now + 5 * MIN });
  assert.ok(db.listOrders({ now }).some((o) => o.id === 507));
});

test('an order is matched to the customer\'s lead and text conversation by phone number, and import replies see it', async () => {
  const imports = await import('../src/imports.js');
  db.upsertLead({ id: 7501, conversationId: 8501, firstName: 'Nina', lastName: 'Halvorsen', phone: '+61 491 570 501', email: '', source: 'Auction', status: 'NEW', platform: 'IMPORTS', state: '', leadAt: now - DAY, updatedAt: now - DAY, stocks: [], inquiries: [], statusHistory: [] });
  db.upsertConversation({ id: 8501, phone: '+61491570501', channel: 'SMS', status: 'OPEN', leadId: 7501, customerName: 'Nina Halvorsen', latestDirection: 'IN', latestAt: now - DAY, latestBody: 'x' });
  db.upsertMessage({ id: 1, conversationId: 8501, direction: 'IN', body: 'Hi, I asked about an XV on your website', sentBy: null, status: 'SENT', mediaType: null, at: now - DAY, importedAt: now - DAY });
  await sync.syncAuctionOrders({ now: now + 6 * MIN });
  const o = db.getOrder(501);
  assert.deepEqual([o.leadId, o.conversationId], [7501, 8501], '"0491 570 501" on the order is the same number as "+61 491 570 501" on the lead');
  // The order's thread shows their text conversation too.
  assert.ok(item(501).timeline.some((e) => e.key === 'm:1' && e.who === 'customer'));
  // The import-enquiry replies in the Dashboard section find the same order, by lead or by phone.
  assert.equal(db.getAuctionOrder(7501).orderNo, 'AS-501');
  assert.equal(db.getAuctionOrder(null, '0491570501').orderNo, 'AS-501');
  assert.equal(imports.importContext(db.getLead(7501)).order.orderNo, 'AS-501');
  // A cancelled order is not somebody's live request.
  assert.equal(db.getAuctionOrder(null, '0491 570 507'), null);
});

// ---- which message is due ---------------------------------------------------------------------------

test('each order says where it has got to, and which message is due', () => {
  const due = (id, at = now) => orders.dueMessages(db.getOrder(id), { now: at }).map((m) => m.type);
  const stage = (id) => orders.stageOf(db.getOrder(id)).label;
  assert.deepEqual([501, 502, 503, 504, 505, 506, 507, 508].map(stage), ['Looking for a car, no deposit yet', 'Looking for a car, deposit paid', 'Bid placed, result due', 'Car secured', 'Shipping and compliance', 'Completed', 'Cancelled', 'Refunded']);

  assert.deepEqual(due(501), ['first_estimate'], 'a new order with no deposit');
  assert.deepEqual(due(502), ['deposit_received', 'search_update'], 'a deposit two days ago, and a follow-up is due');
  assert.deepEqual(due(503), ['bid_lost']);
  assert.deepEqual(due(504), ['secured']);
  assert.deepEqual(due(505), [], 'secured two months ago: no congratulations now. The dashboard\'s "quiet" mark is ignored');
  // A follow-up marked as due on the dashboard is a reason to write: the payment, when one is outstanding.
  assert.deepEqual(orders.dueMessages({ ...db.getOrder(505), followUpDue: true }, { now }).map((m) => m.type), ['payment_due']);
  assert.deepEqual(orders.dueMessages({ ...db.getOrder(505), followUpDue: true, money: { ...db.getOrder(505).money, due: 0 } }, { now }).map((m) => m.type), ['progress_update']);
  assert.deepEqual(due(506), ['thanks']);
  assert.deepEqual(due(507), []);
  assert.deepEqual(due(508), ['refund']);
  // A step is only written about while it is recent.
  assert.deepEqual(due(501, now + 9 * DAY), []);
  assert.deepEqual(due(504, now + 9 * DAY), []);
  assert.deepEqual(due(506, now + 20 * DAY), []);
});

test('the Auction section lists orders under To do, In progress and Finished', async () => {
  const todo = await list('waiting');
  assert.equal(todo.section, 'auction');
  assert.deepEqual(todo.items.map((r) => r.key).sort(), ['ao:501', 'ao:502', 'ao:503', 'ao:504', 'ao:506', 'ao:508']);
  assert.deepEqual(todo.counts, { waiting: 6, quiet: 1, other: 1 });
  assert.equal(todo.sections.auction, 6);
  assert.equal(todo.unread.auction, 6);
  assert.deepEqual((await list('quiet')).items.map((r) => [r.key, r.stage, r.due]), [['ao:505', 'Shipping and compliance', '']], 'under way, nothing due');
  assert.equal(todo.sections.dashboard !== undefined && todo.sections.marketplace === null, true, 'the other sections are still reported');
  const row = todo.items.find((r) => r.key === 'ao:504');
  assert.deepEqual([row.name, row.car, row.stage, row.due, row.section, row.orderNo], ['Pia Halvorsen', '2021 Toyota Hiace DX', 'Car secured', 'Send: car secured', 'auction', 'AS-504']);
  assert.equal(todo.items.find((r) => r.key === 'ao:503').car, '2015 Subaru XV Hybrid', 'the auction car is named as the customer knows it');
  assert.deepEqual((await list('other')).items.map((r) => [r.key, r.stage]), [['ao:507', 'Cancelled']]);

  // The Dashboard section is unaffected, and reports the auction count beside its own.
  const dash = await get('/api/items?tab=waiting');
  assert.equal(dash.section, 'dashboard');
  assert.equal(dash.sections.auction, 6);
  assert.equal((await get('/api/items/ao:99999')).error, 'That conversation was not found.');
});

// ---- the messages: written from the wording file, with no AI ---------------------------------------

test('every kind of message has its wording, and is written with no AI and nothing left unfilled', async () => {
  const { template } = await import('../src/templates.js');
  const file = template('auction-messages.md');
  for (const type of Object.keys(orders.MESSAGES)) assert.ok(file.sections[type], `no wording for ${type}`);

  db.setOrderWatch(503, { stock: [], lot: null, searched: 0, next: null });
  const cases = [[501, 'first_estimate'], [501, 'lot_closed'], [501, 'lots_coming'], [501, 'lot_offer'], [501, 'lot_short'], [501, 'deposit_reminder'], [502, 'deposit_received'], [501, 'search_update'],
    [503, 'bid_lost'], [501, 'stock_priced'], [504, 'secured'], [504, 'payment_due'], [505, 'shipping_booked'], [505, 'on_the_water'], [505, 'arrived'], [506, 'ready'], [506, 'thanks'], [508, 'refund'], [505, 'progress_update']];
  for (const [id, type] of cases) {
    const out = await compose(id, type);
    assert.deepEqual(out.text.match(/\{[a-z0-9_]+\}/g), null, `${type}: a {word} was left in`);
    assert.ok(!/\{\{(?!NAME\}\})/.test(out.text), `${type}: a marker was left in`);
    assert.ok(out.text.length > 40, `${type}: empty`);
    assert.ok(/Team Carbarn$/.test(out.text) || ['lot_short'].includes(type), `${type}: not signed Team Carbarn`);
    assert.ok(!/Some Staff/.test(out.text));
  }
  assert.equal(ai().length, 0, 'no AI request for any of them');
});

test('a bid that was lost: your figures fill the blanks, and without them the blanks are marked', async () => {
  const it = item(503);
  assert.deepEqual([it.state, it.message, it.anchorKey], ['awaiting', 'bid_lost', 'out:result-1992541']);

  const bare = await messages.draftOrderMessage(it, { type: 'bid_lost', now });
  assert.equal(bare.status, 'ready');
  assert.deepEqual([bare.provider, bare.model], ['none', 'your wording']);
  assert.ok(bare.reply.includes('We placed the bid at ¥226,000, but unfortunately we did not win it. The vehicle sold for [SOLD PRICE?].'));
  assert.deepEqual(bare.checks.filter((c) => c.level === 'input').map((c) => c.tokens), [['[SOLD PRICE?]']]);
  assert.ok(bare.checks.some((c) => c.level === 'warn' && /taken from the target bid on the order/.test(c.message)));

  const filled = await messages.draftOrderMessage(it, { type: 'bid_lost', facts: 'we bid 280000, sold for 331000', now });
  assert.equal(filled.reply, 'Hi Omar,\n\n'
    + 'Just an update on the 2015 Subaru XV Hybrid. We placed the bid at ¥280,000, but unfortunately we missed it by a small margin. The vehicle sold for ¥331,000.\n\n'
    + "We'll keep searching and send you the next good match as soon as we find one within your budget.\n\n"
    + 'Regards,\nTeam Carbarn');
  assert.deepEqual(filled.checks.map((c) => c.level), ['ok']);
  assert.ok(filled.factsUsed.includes('From what you typed: our bid ¥280,000; sold for ¥331,000'));
  assert.ok((await compose(503, 'bid_lost', 'our bid was 1.2m and it was passed in')).text.includes('We placed the bid at ¥1,200,000, but unfortunately it was passed in.'));
  assert.equal(ai().length, 0);
});

test('what you type into "Add what you know" is read only where it is plainly said', () => {
  const f = (t) => messages.factsIn(t);
  assert.deepEqual([f('we bid 1.2m, sold for 1.31m').ourBidYen, f('we bid 1.2m, sold for 1.31m').soldYen], [1200000, 1310000]);
  assert.deepEqual([f('sold for 331,000').ourBidYen, f('sold for 331,000').soldYen], [0, 331000], 'a sold price is not also our bid');
  assert.deepEqual([f('ETA 14 Nov, ship Hoegh Trader').arrival, f('ETA 14 Nov, ship Hoegh Trader').ship], ['14 Nov', 'Hoegh Trader']);
  assert.deepEqual([f('sailing 3 November, arrives 21 November').sailing, f('sailing 3 November, arrives 21 November').arrival], ['3 November', '21 November']);
  assert.deepEqual([f('stock T91, purchase 2.38m, landed 35900').stockNo, f('stock T91, purchase 2.38m, landed 35900').purchaseYen, f('stock T91, purchase 2.38m, landed 35900').landedAud], ['T91', 2380000, 35900]);
  assert.equal(f('won for 880,000').winYen, 880000);
  assert.equal(f('ready 12 December').ready, '12 December');
  assert.equal(f('next step: compliance booking').next, 'compliance booking');
  assert.equal(f('use https://www.carbarn.com.au/live-auction/subaru/xv-hybrid/gpe/2006629').lotId, '2006629');
  assert.deepEqual(f('thanks, looks fine').said, []);
});

test('the car is secured: the charges, what is paid and what is due come from the order', async () => {
  const d = await messages.draftOrderMessage(item(504), { type: 'secured', now });
  assert.equal(d.reply, 'Hi Pia,\n\n'
    + 'Good news: we won the auction and your 2021 Toyota Hiace DX is secured.\n\n'
    + '60,000 km\nAuction Grade 4\nWhite\n\n'
    + 'Winning price: [WINNING PRICE?]\n\n'
    + 'The next payment covers:\n\n'
    + '- Car price in Japan: $8,415 AUD\n- Japan Agent Fee: $837 AUD\n- Carbarn Agent Fee: $1,525 AUD\n\n'
    + 'Deposit already paid: $1,650 AUD\n\n'
    + 'Amount due now: $10,777 AUD\n\n'
    + 'We will send the invoice and payment details separately. Once payment is received, we will book shipping and keep you updated.\n\n'
    + 'Regards,\nTeam Carbarn');
  assert.ok(d.factsUsed.includes('From the order: deposit asked $1,650, deposit paid $1,650, charged $12,427, paid $1,650, still due $10,777'));
  // Typed in, the winning price takes the blank's place.
  assert.ok((await compose(504, 'secured', 'won for 880,000')).text.includes('Winning price: ¥880,000'));
  // A shipping update has blanks only for what nobody but a person knows.
  const ship = await messages.draftOrderMessage(item(505, { message: 'shipping_booked' }), { type: 'shipping_booked', facts: 'ship Hoegh Trader, sailing 3 November, arrives 21 November', now });
  assert.ok(ship.reply.includes('Vessel: Hoegh Trader\nSailing from Japan: 3 November\nExpected arrival: 21 November'));
  assert.deepEqual(ship.checks.filter((c) => c.level === 'input'), []);
  assert.equal(ai().length, 0);
});

test('a car found at auction: the bid comes from the three closest sold cars, and the deposit paragraph only while none is paid', async () => {
  const noDeposit = await messages.draftOrderMessage(item(501, { message: 'lot_offer' }), { type: 'lot_offer', now });
  assert.equal(noDeposit.status, 'ready', noDeposit.error);
  // Sold: 401,000, 388,000 and 178,000 are the three closest. Their average is 322,333, rounded up to 350,000.
  assert.equal(feed().find((c) => c.method === 'POST').body, '{"bidYen":350000}');
  assert.ok(noDeposit.reply.startsWith(`Hi Nina,\n\nWe found this 2015 Subaru XV Hybrid in tomorrow's auction.\n\nVehicle details:\n2015 Subaru XV Hybrid 2.0i EyeSight\n121,000 km\nAuction Grade 3.5\n2.0L Hybrid\n4WD\n5 seats\n\n`), noDeposit.reply.slice(0, 200));
  assert.ok(noDeposit.reply.includes('https://www.carbarn.com.au/live-auction/subaru/xv-hybrid/gpe/1992541'));
  assert.ok(noDeposit.reply.includes("The website's suggested bid is ¥253,590. We usually suggest around ¥350,000 to improve the chance of winning."));
  assert.ok(noDeposit.reply.includes('Based on a ¥350,000 bid, the current estimated landed and complied cost is approximately AUD $11,410, including:'));
  assert.ok(noDeposit.reply.includes('If you would like us to proceed, you can use the deposit link below:\n[DEPOSIT LINK?]'));
  assert.ok(noDeposit.factsUsed.some((f) => /^Bid from the 3 closest sold cars, averaged and rounded up: grade 3\.5, 120,000 km, sold ¥401,000/.test(f)));
  assert.deepEqual(noDeposit.checks.filter((c) => c.level === 'input').map((c) => c.tokens), [['[DEPOSIT LINK?]']]);
  assert.ok(feed().every((c) => c.method === 'GET' || /\/price-estimate$/.test(c.path)), 'the feed is only read, and the calculator asked');

  // With the deposit paid there is no deposit paragraph, so no blank to fill.
  db.upsertOrder({ ...db.getOrder(501), id: 511, orderNo: 'AS-511', depositState: 'RECEIVED' }, { now });
  const paid = await messages.draftOrderMessage(item(511, { message: 'lot_offer' }), { type: 'lot_offer', now });
  assert.ok(!paid.reply.includes('deposit link'));
  assert.deepEqual(paid.checks.filter((c) => c.level === 'input'), []);
  // A bid you give is used as it is.
  calls.length = 0;
  await messages.draftOrderMessage(item(511, { message: 'lot_offer' }), { type: 'lot_offer', facts: 'bid 300000', now });
  assert.equal(feed().find((c) => c.method === 'POST').body, '{"bidYen":300000}');
  assert.equal(feed().filter((c) => /sold-comparables/.test(c.path)).length, 0);

  // The bid you gave is below what the customer will see on the car's page: you are told.
  const low = await messages.draftOrderMessage(item(511, { message: 'lot_offer' }), { type: 'lot_offer', facts: 'bid 200000', now });
  assert.ok(low.checks.some((c) => c.level === 'warn' && /The bid you gave \(¥200,000\) is below the suggested bid the customer will see on the car's page \(¥253,590\)/.test(c.message)));

  // We never suggest below the website's own suggested bid. For this grade 4 car the three
  // closest sales (205,000, 178,000 and 401,000) average 261,333, well under the website's
  // 455,820: so the website's bid is rounded up instead.
  calls.length = 0;
  const dear = await messages.draftOrderMessage(item(511, { message: 'lot_offer' }), { type: 'lot_offer', facts: 'use https://www.carbarn.com.au/live-auction/subaru/xv-hybrid/gpe/2006629', now });
  assert.equal(feed().find((c) => c.method === 'POST').body, '{"bidYen":500000}');
  assert.ok(dear.reply.includes("The website's suggested bid is ¥455,820. We usually suggest around ¥500,000 to improve the chance of winning."), dear.reply);
  assert.ok(dear.factsUsed.some((f) => /^The 3 closest sold cars went for less than the website's suggested bid, and we never suggest below it, so the website's bid was rounded up: grade 4, 127,000 km, sold ¥205,000/.test(f)), dear.factsUsed.join(' | '));
  assert.ok(!dear.checks.some((c) => /is below/.test(c.message)));

  // A variant or a kilometre limit on the order that the car misses is pointed out to you.
  db.upsertOrder({ ...db.getOrder(511), wanted: { ...db.getOrder(511).wanted, variant: '2.0i-L EyeSight', notes: 'Under 100,000 km please' } }, { now });
  const near = await messages.draftOrderMessage(item(511, { message: 'lot_short' }), { type: 'lot_short', facts: 'lot 1992541', now });
  assert.deepEqual(near.checks.filter((c) => c.level === 'warn').map((c) => c.message), ['The order asks for "2.0i-L EyeSight". This car is listed as "2.0i EyeSight".', 'It has 121,000 km, more than the 100,000 km they asked for.']);
  assert.ok(near.reply.includes('Would you like to bid on this car? Or we can keep checking other options under 100,000 km.'));
  db.openDb().prepare('UPDATE auction_orders SET gone_at = ? WHERE id = 511').run(now);
  assert.equal(ai().length, 0);
});

test('when a bid is lost and our own stock has that model on the way, those cars are offered', async () => {
  sync.storeVehicles([
    { id: 91, stockNo: 'T91', year: '2016', title: '2016 Subaru XV Hybrid 2.0i-L', make: 'SUBARU', model: 'XV Hybrid', modelCode: 'GPE', auPublishPrice: 21900, odometer: 80000, auctionGrade: '4', status: 'PUBLISHED', soldStatus: 'UnSold', stockIn: 'Japan' },
    { id: 92, stockNo: 'T92', year: '2015', title: '2015 Subaru XV Hybrid', make: 'SUBARU', model: 'XV Hybrid', modelCode: 'GPE', auPublishPrice: 19900, odometer: 99000, auctionGrade: '3.5', status: 'UNPUBLISHED', soldStatus: 'UnSold', stockIn: 'Transit' },
    { id: 93, stockNo: 'T93', year: '2015', title: '2015 Subaru XV Hybrid', make: 'SUBARU', model: 'XV Hybrid', modelCode: 'GPE', auPublishPrice: 19900, odometer: 50000, auctionGrade: '4', status: 'PUBLISHED', soldStatus: 'UnSold', stockIn: 'Online' }, // at the yard: not "on the way"
  ]);
  assert.deepEqual(messages.stockMatches(db.getOrder(503)).map((v) => v.stockNo), ['T91', 'T92']);
  const out = await compose(503, 'bid_lost_stock', 'we bid 280000, passed in');
  assert.ok(out.text.includes('Unfortunately, we bid on the 2015 Subaru XV Hybrid for ¥280,000 and it was passed in.'));
  assert.ok(out.text.includes('However, we currently have two Subaru XV Hybrid vehicles available in Japan that match your requirements. They are expected to arrive by [ARRIVAL DATE?].'));
  assert.ok(out.text.includes('1. 2016 Subaru XV Hybrid 2.0i-L\nGrade: 4\nOdo: 80,000 km\nhttps://www.carbarn.com.au/vehicles/subaru/xv-hybrid/gpe/t91\n\n2. 2015 Subaru XV Hybrid\nGrade: 3.5\nOdo: 99,000 km\n\nPlease have a look'), out.text);
  // No price of ours is given for them: the stock price is for yard customers.
  assert.ok(!/21,900|19,900/.test(out.text));
});

// ---- kept ready without anyone asking -----------------------------------------------------------

test('the due message is prepared for each order with no AI, and the live auction is looked at for those still searching', async () => {
  const out = await messages.prepareOrders(items.buildOrderItem, { now });
  assert.equal(ai().length, 0);
  assert.ok(out.orderMessagesWritten >= 4, JSON.stringify(out));
  // Order 501 is still searching: the best match in the coming auctions is noted.
  assert.equal(db.getOrder(501).watch.lot.id, '1992541');
  assert.deepEqual(orders.dueMessages(db.getOrder(501), { now }).map((m) => `${m.type}:${m.occasion}`), ['first_estimate:estimate', 'lot_offer:offer-1992541']);
  const one = (await get('/api/items/ao:501')).item;
  assert.equal(one.channel, 'auction');
  assert.deepEqual([one.order.stage, one.order.due, one.order.message, one.order.prefers, one.order.cameFrom], ['Looking for a car, no deposit yet', 'Send: thanks, with estimate and deposit', 'first_estimate', 'WhatsApp', 'Live auction']);
  assert.equal(one.draft.status, 'ready');
  assert.ok(one.draft.reply.includes('Target auction bid: approx. ¥226,000 JPY'));
  assert.ok(one.draft.reply.includes('Estimated Landed Total: $10,277 AUD'));
  assert.ok(one.draft.reply.includes('The refundable auction deposit required to start bidding is $1,650 AUD.'));
  assert.equal(one.order.messages[0].due, true);
  assert.equal(one.order.found.url, 'https://www.carbarn.com.au/live-auction/subaru/xv-hybrid/gpe/1992541');
  assert.equal(one.order.money.lines[0].amount, 1650);
  // Looked at again only after an hour, and a message already written is not written twice.
  calls.length = 0;
  assert.deepEqual(await messages.prepareOrders(items.buildOrderItem, { now: now + 10 * MIN }), { ordersWatched: 0, orderMessagesWritten: 0 });
  assert.equal(feed().length, 0);
});

test('copying a message counts as done, the next one comes up, and it can be put back', async () => {
  const first = (await get('/api/items/ao:501')).item;
  await post(`/api/drafts/${first.draft.id}/copied`, { text: first.draft.reply });
  // The welcome has been copied: the car that was found is due next.
  const next = (await get('/api/items/ao:501')).item;
  assert.deepEqual([next.state, next.order.due, next.anchor], ['awaiting', 'Send: car found, full', 'out:offer-1992541']);
  assert.ok(next.thread.some((e) => e.who === 'us' && e.by === 'Copied from Wheelman' && e.text === first.draft.reply), 'what was copied is shown in the conversation');

  // An order with one message due leaves To do once it is copied.
  const thanks = (await get('/api/items/ao:506')).item;
  await post(`/api/drafts/${thanks.draft.id}/copied`, { text: thanks.draft.reply });
  assert.ok(!(await list('waiting')).items.some((r) => r.key === 'ao:506'));
  const finished = (await list('other')).items.find((r) => r.key === 'ao:506');
  assert.deepEqual([finished.state, finished.handled], ['closed', 'copied']);
  // It was not sent after all: put back, it is due again and gone from the conversation.
  const back = await post('/api/items/ao:506/restore');
  assert.deepEqual([back.item.state, back.item.order.due], ['awaiting', 'Send: thank you']);
  assert.ok(!back.item.thread.some((e) => e.by === 'Copied from Wheelman'));

  // Dismissed (told them by phone, say): out of To do, and that can be undone too.
  await post('/api/items/ao:508/dismiss');
  assert.equal((await get('/api/items/ao:508')).item.order.handled, 'dismissed');
  assert.equal((await post('/api/items/ao:508/restore')).item.state, 'awaiting');
});

test('another message can be picked, and what you add fills it in through the page', async () => {
  // Picked, not yet written: it is written when asked for, under its own key.
  const picked = (await get('/api/items/ao:504?message=payment_due')).item;
  assert.deepEqual([picked.order.message, picked.anchor, picked.draft], ['payment_due', 'out:own-payment_due', null]);
  const wrote = await post('/api/items/ao:504/draft', { message: 'payment_due', instruction: '' });
  assert.equal(wrote.ok, true);
  assert.ok(wrote.item.draft.reply.includes('Just a reminder that a payment of $10,777 AUD is due on your 2021 Toyota Hiace DX.'));
  // The message that is due is untouched by that.
  const due = (await get('/api/items/ao:504')).item;
  assert.deepEqual([due.order.message, due.anchor], ['secured', 'out:secured']);
  const added = await post('/api/items/ao:504/draft', { message: 'secured', instruction: 'won for 880,000' });
  assert.ok(added.item.draft.reply.includes('Winning price: ¥880,000'));
  assert.equal(added.item.draft.instruction, 'won for 880,000');
  assert.equal(ai().length, 0);
});

// ---- a reply to what the customer wrote on WhatsApp ----------------------------------------------

test('a pasted customer message gets a reply that knows the order, and no name, number or amount reaches the AI', async () => {
  aiScript = [{ reply: 'Hi {{NAME}},\nThe balance still to pay on your Hiace is {{DUE}} AUD, and your deposit of {{DEPOSIT_PAID}} has been received.\nWe will confirm the shipping date [DATE?].', needs_human: [{ marker: '[DATE?]', reason: 'A person must confirm the shipping date.' }], facts_used: [], hold: false }];
  const out = await post('/api/items/ao:504/paste', { text: '[2:14 pm, 05/10/2026] Pia Halvorsen: Hi, how much do I still owe? I paid $1,650 already. My number is 0491 570 504\n[2:15 pm, 05/10/2026] Pia Halvorsen: and when does it ship?' });
  assert.equal(out.ok, true, out.error);
  assert.equal(ai().length, 1, 'one AI request');

  const it = out.item;
  assert.deepEqual([it.state, it.order.due, it.order.replying, it.unanswered], ['awaiting', 'Reply to their message', true, 1]);
  assert.equal(it.thread.at(-1).text, 'Hi, how much do I still owe? I paid $1,650 already. My number is 0491 570 504\nand when does it ship?', "WhatsApp's time and name are taken off");
  assert.equal(it.draft.reply, 'Hi Pia,\nThe balance still to pay on your Hiace is $10,777 AUD, and your deposit of $1,650 has been received.\nWe will confirm the shipping date [DATE?].\n\nRegards,\nTeam Carbarn');
  assert.deepEqual(it.draft.checks.filter((c) => c.level === 'fail'), []);

  const sent = ai()[0].body;
  for (const secret of ['Pia', 'Halvorsen', '0491', '570 504', 'pia@example.com', '10,777', '10777', '8,415', '8415', '1,650', '1650', '12,427', '12427', '837', '1,525', '36,350', '36350', '2,380,000', '2380000', 'Some Staff', 'feedfacecafe'])
    assert.ok(!sent.includes(secret), `sent to the AI: ${secret}`);
  const asked = JSON.parse(sent).messages;
  assert.match(asked[0].content, /replies on WhatsApp to customers who have an auction order with us/);
  assert.match(asked[1].content, /=== THIS CUSTOMER'S AUCTION ORDER ===\nThis customer has an auction order with us/);
  assert.match(asked[1].content, /Where the order has got to: Car secured\./);
  assert.match(asked[1].content, /The car secured for them: 2021 Toyota Hiace DX, 60,000 km, auction grade 4, white\. Our stock record shows it is still in Japan\./);
  assert.match(asked[1].content, /- \{\{DUE\}\}: what is still to pay on the order/);
  assert.match(asked[1].content, /<customer_message>\nHi, how much do I still owe\? I paid \{\{DEPOSIT_ASKED\}\} already\. My number is \[PHONE\]/);
  assert.ok(!/ask them which one/.test(asked[1].content), 'never "which vehicle?" for somebody with an order');
  assert.ok(!/STANDARD FIRST REPLY|=== INSPECTION ===/.test(asked[1].content));

  // A marker the AI made up is caught: it must not reach a customer.
  aiScript = [1, 2].map(() => ({ reply: 'Hi {{NAME}},\nYour balance is {{BALANCE_OWING}}.', needs_human: [], facts_used: [], hold: false }));
  const bad = await post('/api/items/ao:504/draft', {});
  assert.ok(bad.item.draft.checks.some((c) => c.level === 'fail' && c.code === 'placeholder' && c.tokens.includes('{{BALANCE_OWING}}')));
});

test('a message we sent by hand can be added, a wrong paste removed, and a reply copied', async () => {
  // Their message was answered by hand: adding ours makes no AI request and nothing is waiting.
  const ours = await post('/api/items/ao:504/paste', { text: 'Hi Pia, the balance is on the invoice. Shipping is being booked.', direction: 'out' });
  assert.equal(ai().length, 0);
  assert.deepEqual([ours.item.state, ours.item.unanswered, ours.item.thread.at(-1).by], ['awaiting', 0, 'Pasted by you'], 'the secured message is still due');
  assert.equal(ours.item.order.due, 'Send: car secured');

  // A paste on the wrong order is taken out again.
  const wrong = await post('/api/items/ao:502/paste', { text: 'Is my Hiace on the ship yet?' });
  assert.equal(wrong.item.order.replying, true);
  const removed = await post(`/api/items/ao:502/paste/${wrong.pasteId}/remove`);
  assert.deepEqual([removed.item.order.replying, removed.item.thread.some((e) => /Is my Hiace/.test(e.text))], [false, false]);
  assert.equal((await post('/api/items/ao:502/paste', { text: '   ' })).status, 400);
  assert.equal((await post('/api/items/c:1/paste', { text: 'x' })).status, 404, 'only an auction order takes a paste');

  // A reply that is copied is answered: the order goes back to what is due for its stage.
  aiScript = [{ reply: 'Hi {{NAME}},\nNot yet. We will let you know as soon as a suitable one comes up.', needs_human: [], facts_used: [], hold: false }];
  const asked = await post('/api/items/ao:502/paste', { text: 'Any luck finding one yet?' });
  await post(`/api/drafts/${asked.item.draft.id}/copied`, { text: asked.item.draft.reply });
  const after = (await get('/api/items/ao:502')).item;
  assert.deepEqual([after.order.replying, after.unanswered], [false, 0]);
});

test('nothing is learned from the Auction section', async () => {
  const before = [db.countRows('learned'), db.countRows('advice')];
  const it = (await get('/api/items/ao:503')).item;
  await post(`/api/drafts/${it.draft.id}/edit`, { text: `${it.draft.reply}\nTalk soon.` });
  assert.equal((await post(`/api/drafts/${it.draft.id}/rating`, { rating: 'good' })).learned, false);
  assert.equal((await post(`/api/drafts/${it.draft.id}/advice`, { note: 'Always say sorry first.' })).learned, false);
  const copied = await post(`/api/drafts/${it.draft.id}/copied`, { text: `${it.draft.reply}\nTalk soon.` });
  assert.equal(copied.learned, false);
  assert.deepEqual([db.countRows('learned'), db.countRows('advice')], before);
  assert.equal(ai().length, 0);
  // What was copied is kept, as the only record of what was said to them.
  assert.match(db.getDraft(it.draft.id).copied_text, /Talk soon\.$/);
});

test('with nothing to choose a car by, none is picked: the customer is pointed to the cars coming up instead', async () => {
  sync.storeAuctionOrders([raw(512, 'Vera', { reqYearFrom: null, reqYearTo: null, targetBidJpy: null, budgetAud: null, requirementNotes: '' })], { complete: false, now });
  await messages.watchOrder(db.getOrder(512), now);
  const o = db.getOrder(512);
  assert.equal(o.watch.lot, null, 'the newest, dearest car in the auction is not offered to somebody who gave no limits');
  assert.deepEqual(o.watch.next, { date: TOMORROW, count: 2 });
  assert.deepEqual(orders.dueMessages(o, { now }).map((m) => m.type), ['first_estimate', 'lots_coming']);
  const coming = await compose(512, 'lots_coming');
  assert.ok(coming.text.includes("We have two Subaru XV Hybrid vehicles coming up in tomorrow's auction that match your requirements."), coming.text);
  assert.ok(coming.text.includes(`https://www.carbarn.com.au/live-auction/subaru/xv-hybrid/gpe?auctionDate=${TOMORROW}`));
  // A car far above the bid they asked us to work to is not offered either.
  sync.storeAuctionOrders([raw(513, 'Wes', { reqYearFrom: null, reqYearTo: null, budgetAud: null, targetBidJpy: 150000, requirementNotes: '' })], { complete: false, now });
  await messages.watchOrder(db.getOrder(513), now);
  assert.equal(db.getOrder(513).watch.lot.id, '2005010', 'only the one within reach of a 150,000 yen bid');
  db.openDb().prepare('UPDATE auction_orders SET gone_at = ? WHERE id IN (512, 513)').run(now);
});

test('makes and models typed in capitals are written as a person would, and short codes are left alone', async () => {
  const { tidyName, tidyVariant } = await import('../src/auction.js');
  assert.deepEqual(['NOAH', 'N BOX CUSTOM', 'BMW', 'MERCEDES-BENZ', 'GT-R', 'XV Hybrid', 'MR2', 'IS F', 'Hiace', 'SKYLINE'].map(tidyName),
    ['Noah', 'N Box Custom', 'BMW', 'Mercedes-Benz', 'GT-R', 'XV Hybrid', 'MR2', 'IS F', 'Hiace', 'Skyline']);
  assert.equal(tidyVariant('S-Z PACKAGE', 'Voxy'), 'S-Z Package');
  assert.equal(tidyVariant('EHEV SPADA PREMIUM LINE', 'Stepwgn'), 'e:HEV Spada Premium Line');
  assert.equal(orders.wantedText({ make: 'TOYOTA', model: 'NOAH', yearFrom: 2019, yearTo: 2019 }), 'Toyota Noah, 2019');
  assert.equal(orders.carTitle({ year: 2023, make: 'TOYOTA', model: 'VOXY', variant: 'HYBRID S-Z PACKAGE' }), '2023 Toyota Voxy Hybrid S-Z Package');
});

test('a blank is recognised the same way by the checks, the learning and the page', () => {
  const page = fs.readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
  const inPage = page.match(/const BLANK = \/(.+)\/g;/)[1].replace('\\[(', '\\[').replace(')\\?\\]', '\\?\\]');
  assert.equal(inPage, checks.BLANK_PATTERN);
  const re = new RegExp(checks.BLANK_PATTERN, 'g');
  assert.deepEqual('Sold for [SOLD PRICE?], arriving [ARRIVAL DATE?]. [PRICE?] [check?] [Not this] [DEPOSIT LINK?]'.match(re), ['[SOLD PRICE?]', '[ARRIVAL DATE?]', '[PRICE?]', '[DEPOSIT LINK?]']);
});
