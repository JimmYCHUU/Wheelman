// An invented world for the tests, in the raw shapes the upstream services send, so
// that the real sync code reads it exactly as it reads the real thing.
//
// Every name, number, email and address here is made up. None belongs to a real staff member or a
// real customer, and none may be changed to one: these files are public. Phone numbers use the
// 0491 570 1xx range, which is reserved for fiction. Times are relative to `now`, so the page's
// time windows always include them.

const MIN = 60e3;
const HOUR = 3600e3;
const DAY = 24 * HOUR;

const dtf = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Australia/Sydney', hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
});

/** The dashboard writes Sydney local time with no zone marker: "2026-10-06T14:05:00". */
export function sydneyNaive(ms) {
  const p = Object.fromEntries(dtf.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}

/** "2026-10-07" in Sydney. */
export function sydneyDay(ms) {
  return sydneyNaive(ms).slice(0, 10);
}

const digits = (phone) => String(phone).replace(/\D/g, '');
const intl = (phone) => `+61${digits(phone).replace(/^0/, '')}`;
const email = (first) => `${first.toLowerCase()}@example.com`;

// ---- the people (all invented) -----------------------------------------------------------------

export const PEOPLE = {
  priya: ['Priya', 'Raman', '0491 570 101'],
  tom: ['Tom', 'Bell', '0491 570 102'],
  isla: ['Isla', 'Moreau', '0491 570 103'],
  kofi: ['Kofi', 'Mensah', '0491 570 104'],
  yuki: ['Yuki', 'Tanaka', '0491 570 105'],
  brad: ['Brad', 'Quimby', '0491 570 106'],
  dana: ['Dana', 'Whitfield', '0491 570 107'],
  eli: ['Eli', 'Brown', '0491 570 108'],
  maria: ['Maria', 'Lopes', '0491 570 109'],
  rhea: ['Rhea', 'Castellano', '0491 570 110'],
  nina: ['Nina', 'Halvorsen', '0491 570 111'],
  remy: ['Remy', 'Okafor', '0491 570 112'],
  omar: ['Omar', 'Haddad', '0491 570 113'],
  pia: ['Pia', 'Lindqvist', '0491 570 114'],
  quin: ['Quin', 'Marsh', '0491 570 115'],
  sol: ['Sol', 'Perera', '0491 570 116'],
  tess: ['Tess', 'Whitlock', '0491 570 117'],
};
// Staff logins as voice/people.example.json spells them.
export const STAFF = { alex: 'Alex STONE', sam: 'samrivers' };

// ---- stock, as the dashboard's vehicle list sends it ------------------------------------------

const car = (id, stockNo, title, model, modelCode, price, km, extra = {}) => ({
  id, stockNo, year: title.slice(0, 4), title, make: title.split(' ')[1].toUpperCase(), model, modelCode,
  auPublishPrice: price, odometer: km, seats: 5, fuel: 'Petrol', transmission: 'Automatic', color: 'White',
  status: 'PUBLISHED', soldStatus: 'UnSold', stockIn: 'Online', outline: ['6 Months NSW Registration'],
  ...extra,
});
const sale = (id, status, total, paid, mobile, mail, agoMs, now) => ({ salesId: id, deliveryStatus: status, salesDateTime: sydneyNaive(now - agoMs), totalPrice: total, paidAmount: paid, customerName: 'Somebody Private', customerMobile: mobile, customerEmail: mail });

/** The car bought at auction for the secured orders. The fields that are ours alone must never be kept. */
export const hiaceT88 = (stockIn) => ({
  id: 801, chassisNo: 'GDH206-0001', stockNo: 'T88', title: '2021 Toyota Hiace DX', year: '2021', make: 'TOYOTA', model: 'Hiace', modelCode: 'GDH206V', variant: 'DX', odometer: 60000, auctionGrade: '4', color: 'WHITE', fuel: 'Diesel', transmission: 'Automatic', seats: 3,
  stockIn, status: 'UNPUBLISHED', soldStatus: 'UnSold', lastSeenAtShipping: null,
  fob: 777111, shippingPrice: 333444, grossCost: 888222, mechanicCost: 444555, supplierId: 'SUPPLIER-9', purchaseDate: '2026-09-01',
  salesInfo: { totalPrice: 999111 }, paymentSummary: { supplierPaid: 666777 }, auctionPhotos: ['https://photos.example/secret-photo.jpg'],
});

export function vehicles(now = Date.now()) {
  return [
    car(1, '1159', '2021 Toyota Noah X (8 Seater)', 'Noah', 'ZRR80G', 28900, 62733, { seats: 8, color: 'Pearl white', outline: ['6 Months NSW Registration', '5-Year Extended Warranty'] }),
    car(2, '1200', '2019 Toyota Hiace DX', 'Hiace', 'GDH206V', 32900, 123000, { status: 'UNPUBLISHED', soldStatus: 'Sold', stockIn: 'Sold', fuel: 'Diesel', seats: 3 }),
    car(3, '1201', '2020 Toyota Hiace DX', 'Hiace', 'GDH206V', 33900, 98000, { fuel: 'Diesel', seats: 3 }),
    // Deposit paid ten days ago by the buyer on Brad's number; registered, no blue slip date on file.
    car(4, '1161', '2019 Honda Shuttle Hybrid', 'Shuttle', 'GP7', 21900, 60000, { fuel: 'Hybrid', registrationCompletedDate: sydneyDay(now - 3 * DAY), rmsInspectionIssueDate: sydneyDay(now - 5 * DAY), registrationNumber: 'AB12CD', salesInfo: sale(9001, 'PENDING_PAYMENT', 21900, 1000, PEOPLE.brad[2], email('brad'), 10 * DAY, now) }),
    // Still shown as available, but somebody else has paid a deposit.
    car(5, '1400', '2018 Toyota Alphard S', 'Alphard', 'AGH30W', 45900, 88000, { seats: 7, color: 'Black', salesInfo: sale(9004, 'PENDING_PAYMENT', 45900, 1000, '0491 570 190', 'other@example.com', 2 * DAY, now) }),
    car(6, '1500', '2017 Toyota Prius S', 'Prius', 'ZVW50', 18900, 71000, { fuel: 'Hybrid', status: 'UNPUBLISHED', stockIn: 'Transit' }),
    car(7, '1600', '2022 Toyota Corolla Touring', 'Corolla', 'ZWE211W', 29900, 35000, { fuel: 'Hybrid', stockIn: 'Japan' }),
    car(8, '1700', '2016 Nissan Serena Highway Star', 'Serena', 'GFC27', 19900, 101000, { seats: 8, color: 'Silver' }),
    hiaceT88('Japan'),
  ];
}

// ---- leads and text conversations, as the dashboard sends them ----------------------------------

const rawLead = (id, conversationId, who, now, { platform = 'CARSALES', source = 'Carsales', stocks = [], inquiries = [], status = 'NEW', agoMs = 2 * HOUR } = {}) => ({
  id, conversationId, customerFirstName: who[0], customerLastName: who[1], customerPhone: who[2], customerEmail: email(who[0]),
  leadSourceDto: { leadSource: source }, leadStatus: status, platform,
  leadDate: sydneyNaive(now - agoMs), updatedAt: sydneyNaive(now - agoMs + 5 * MIN),
  stocks, statusHistory: [], others: JSON.stringify({ stateShortName: 'NSW' }),
  inquiries: inquiries.map((q, i) => ({ id: id * 10 + i, inquiryType: q.type || source, customerQuerySubject: q.subject || 'Vehicle enquiry', customerQuery: q.text, stockNo: q.stockNo || '', platform, leadDate: sydneyNaive(now - (q.agoMs ?? agoMs)), status, comments: [], canonicalUrl: q.url || '' })),
});
const rawConversation = (id, lead, who, { direction, at, body }, { phone = who?.[2] } = {}) => ({
  id, phoneNumber: intl(phone), channel: 'SMS', status: 'OPEN',
  lead: lead ? { id: lead.id, customerName: `${who[0]} ${who[1]}`, platform: lead.platform, currentStatus: lead.leadStatus, customerEmail: lead.customerEmail } : null,
  latestMessageDirection: direction, latestMessageAt: sydneyNaive(at), latestMessageBody: body,
});
const rawMessage = (id, conversationId, direction, body, agoMs, now, sentBy = null) => ({
  id, conversationId, direction, body, sentBy, status: 'SENT', mediaType: null,
  providerCreatedAt: sydneyNaive(now - agoMs), createdAt: sydneyNaive(now - agoMs + 4000),
});

const AUCTION_FORM = (make, model, budget) => `Auction alert request — notify when a matching vehicle enters the Japan auction feed.\n\nMake: ${make}\nModel: ${model}\nGrade: Not provided\nMax odometer: Not provided\nLanded budget: ${budget}\n\nCaptured on: Lot detail page\nWhile viewing lot: 2015 SUBARU SUBARU XV`;

/**
 * The dashboard's leads (by platform list) and SMS conversations (each with its messages).
 * One of each situation the page can show.
 */
export function dashboard(now = Date.now()) {
  const P = PEOPLE;
  let mid = 1;
  const convs = [];
  const leads = { carbarnau: [], IMPORTS: [] };
  // A text conversation with its lead. `lines` are [direction, body, agoMs, sentBy?], oldest first.
  const thread = (convId, leadId, who, lines, leadOpts = {}, convOpts = {}) => {
    const lead = leadId ? rawLead(leadId, convId, who, now, leadOpts) : null;
    if (lead) leads[leadOpts.platform === 'IMPORTS' ? 'IMPORTS' : 'carbarnau'].push(lead);
    const messages = lines.map(([direction, body, agoMs, sentBy]) => rawMessage(mid++, convId, direction, body, agoMs, now, sentBy || null));
    const last = lines[lines.length - 1];
    const row = rawConversation(convId, lead, who, { direction: last[0], at: now - last[2], body: last[1] }, convOpts);
    convs.push({ row, messages });
  };

  // Waiting for a reply, each in a different situation.
  thread(201, 101, P.priya, [['IN', 'Hi, is the Noah still available?', 20 * MIN]], { stocks: ['1159'], inquiries: [{ text: 'Hi, is the Noah still available?', stockNo: '1159', agoMs: 20 * MIN }] });
  thread(202, 102, P.tom, [['OUT', 'Hello Tom, yes it is available. Would you like to come and see it?', 90 * MIN, STAFF.alex], ['IN', 'What is your best price?', 15 * MIN]], { stocks: ['1159'], agoMs: 3 * HOUR });
  thread(203, 103, P.isla, [['IN', 'Hi, I am interested in the 2020 Hiace. I have a 2015 Camry to trade in, what would you give me for it?', 35 * MIN]], { stocks: ['1201'], source: 'Autotrader', platform: 'AUTOTRADER' });
  thread(204, 104, P.kofi, [['IN', 'Can I come and see the Alphard on Saturday morning?', 50 * MIN]], { stocks: ['1400'] });
  thread(205, 105, P.yuki, [['IN', 'I am in Brisbane so I cannot get down to Sydney. Could you do a video inspection of the Serena for me?', 65 * MIN]], { stocks: ['1700'] });
  // A buyer: no lead, only the phone number links them to the sale on the Shuttle.
  thread(206, null, P.brad, [['IN', 'Can you email me a copy of the blue slip so I can get the rego sorted before Friday?', 25 * MIN]]);
  // A car that has sold: the reply offers the similar one.
  thread(210, 109, P.maria, [['IN', 'Is the 2019 Hiace still for sale?', 45 * MIN]], { stocks: ['1200'] });
  // An unknown number with no customer record: listed, but nothing is written unasked.
  thread(209, null, ['', '', '0491 570 139'], [['IN', 'Hi best change over price', 11 * HOUR]]);

  // No reply needed.
  thread(207, 107, P.dana, [['OUT', 'Hi Dana, the Noah is available. Would you like to come and see it?', 3 * HOUR, STAFF.sam], ['IN', 'STOP', 2 * HOUR]], { stocks: ['1159'], agoMs: 5 * HOUR });
  thread(208, 108, P.eli, [['OUT', 'Hi Eli, yes the Hiace is at the yard. Come any day between 8 and 5.', 4 * HOUR, STAFF.alex], ['IN', 'Thanks mate', 3 * HOUR]], { stocks: ['1201'], agoMs: 6 * HOUR });
  thread(211, 110, P.rhea, [['IN', 'Does the Noah have 7 or 8 seats?', 6 * HOUR], ['OUT', 'Hi Rhea, it is the 8 seater.', 5 * HOUR, STAFF.alex]], { stocks: ['1159'], agoMs: 7 * HOUR });

  // Not a customer: a courier's notice from a number with no record.
  thread(213, null, ['', '', '0491 570 180'], [['IN', 'Your parcel is on its way and will arrive Monday. Do not reply to this message.', 2 * HOUR]]);

  // Import and auction enquiries live on the dashboard's own IMPORTS list. Nina said what she wants; Remy did not.
  leads.IMPORTS.push(rawLead(111, null, P.nina, now, { platform: 'IMPORTS', source: 'Auction', agoMs: 40 * MIN, inquiries: [{ type: 'Auction', subject: 'Auction alert for Subaru XV Hybrid', text: AUCTION_FORM('Subaru', 'XV Hybrid', 'Under $30k'), agoMs: 40 * MIN }] }));
  leads.IMPORTS.push(rawLead(112, null, P.remy, now, { platform: 'IMPORTS', source: 'Import', agoMs: 70 * MIN, inquiries: [{ type: 'Import', subject: 'Import enquiry', text: 'Hi, could you import a Honda N-Box for me? What would it cost?', agoMs: 70 * MIN }] }));

  return { leads, conversations: convs };
}

// ---- auction orders, as the dashboard's auction page sends them ---------------------------------

const person = (who) => ({ id: 1, firstName: who[0], lastName: who[1], mobileNumber: who[2], email: email(who[0]), drivingLicenseNumber: 'LIC998877', dateOfBirth: '1988-02-03', address: '9 Gum Tree Lane', city: 'Taree' });
const deposit = (amount) => ({ stage: 'INITIAL_DEPOSIT', type: 'Deposit', description: 'Deposit for auction bidding', totalIncGst: amount, gst: 0 });
const note = (id, body, agoMs, now) => ({ id, at: sydneyNaive(now - agoMs), byUserId: 7, byName: 'Some Staff', channel: 'NOTE', body, followUpAt: null, canDelete: true });

export function orders(now = Date.now()) {
  const at = (agoMs) => sydneyNaive(now - agoMs);
  const P = PEOPLE;
  const raw = (id, who, extra = {}) => ({
    id, orderNo: `AS-${id}`, stage: 'INITIAL_DEPOSIT', source: 'LIVE_AUCTION', soldBy: 'Some Staff', leadId: null,
    auctionVehicleId: null, auctionHouse: null, lotNumber: null, auctionDate: null, lotPhase: 'SOURCING', preferredContact: 'WHATSAPP',
    followUpAt: null, updateCount: 0, latestUpdate: null, followUpDue: false, quiet: false, depositState: 'NONE', depositPaidAud: 0, lotSnapshot: null,
    invoiceTo: person(who), deliveryTo: person(who),
    reqMake: 'Subaru', reqModel: 'XV Hybrid', reqYearFrom: 2014, reqYearTo: 2015, reqVariant: null, reqModelCode: 'GPE', targetBidJpy: 226000, budgetAud: 10450,
    requirementNotes: 'A light colour if possible.', items: [deposit(1650)], payments: [], subtotal: 1650, taxTotal: 0, totalAmount: 1650, totalPaid: 0, totalDue: 1650,
    createdAt: at(2 * DAY), vehicleSecuredAt: null, completedAt: null, cancelledAt: null, refundRequestedAt: null, vehicle: null,
    agreementLink: { id: 28, token: 'feedfacecafe00aa11bb22cc33dd44ee', status: 'DRAFT', fullName: `${who[0]} ${who[1]}`, paymentAmount: 1650, paymentStatus: 'PENDING', agreementAccepted: false },
    invoices: null, ...extra,
  });
  const paidDeposit = { depositState: 'RECEIVED', depositPaidAud: 1650, payments: [{ id: 1, method: 'Bank Transfer', type: 'DEPOSIT', stage: 'INITIAL_DEPOSIT', amount: 1650, referenceNumber: 'REF-SECRET-77', paymentDateTime: at(2 * DAY), origin: 'MANUAL' }], totalPaid: 1650, totalDue: 0 };
  const securedMoney = {
    ...paidDeposit, chassisNo: 'GDH206-0001', vehicleMake: 'TOYOTA', vehicleModel: 'HIACE', vehicleModelCode: 'GDH206V', vehicleVariant: 'DX', vehicleYear: '2021', auctionGrade: '4', vehicleMileage: '60000',
    reqMake: 'Toyota', reqModel: 'Hiace', reqModelCode: 'GDH206V', reqYearFrom: 2021, reqYearTo: null, targetBidJpy: 2380000, budgetAud: 36350, lotPhase: null,
    items: [deposit(1650), { stage: 'VEHICLE_SECURED', type: 'Car Price in Japan', description: 'Car price in Japan', totalIncGst: 8415, gst: 0 }, { stage: 'VEHICLE_SECURED', type: 'Japan Agent Fee', description: 'Japan Agent Fee', totalIncGst: 837, gst: 0 }, { stage: 'VEHICLE_SECURED', type: 'Carbarn Agent Fee', description: 'Carbarn Agent Fee', totalIncGst: 1525, gst: 139 }],
    subtotal: 12427, taxTotal: 139, totalAmount: 12427, totalPaid: 1650, totalDue: 10777,
  };
  const snapshot = { auctionVehicleId: 1992541, title: '2015 SUBARU SUBARU XV', make: 'SUBARU', model: 'SUBARU XV', modelCode: 'GPE', variant: 'HYBRID 2.0I EYESIGHT', year: 2015, auctionHouse: 'MIRIVE Saitama', lotNumber: '10025', auctionDate: sydneyDay(now + DAY), auctionGrade: '3.5', odometerKm: 121000, slug: 'x', mainImageUrl: 'https://photos.example/secret-main.jpg', photos: ['https://photos.example/secret-1.jpg'], transmission: 'Automatic', fuelType: 'Hybrid', colour: 'WINE' };
  return [
    raw(501, P.nina, { leadId: 111 }),                                                                          // new, no deposit
    raw(502, P.remy, { ...paidDeposit, reqMake: 'Honda', reqModel: 'N-Box', reqModelCode: 'JF3', reqYearFrom: 2019, reqYearTo: 2021, targetBidJpy: 700000, budgetAud: 14500, followUpDue: true, latestUpdate: note('n1', 'Still looking, nothing under 30,000 km yet', 3 * DAY, now), updateCount: 4 }), // deposit paid, searching
    raw(503, P.omar, { ...paidDeposit, lotPhase: 'OUTCOME_DUE', auctionVehicleId: 1992541, lotSnapshot: snapshot, createdAt: at(20 * DAY) }), // bid placed
    raw(504, P.pia, { ...securedMoney, stage: 'VEHICLE_SECURED', vehicleSecuredAt: at(DAY), vehicle: hiaceT88('Japan'), createdAt: at(15 * DAY) }),
    raw(505, P.quin, { ...securedMoney, stage: 'SHIPPING_COMPLIANCE', vehicleSecuredAt: at(58 * DAY), vehicle: hiaceT88('Japan'), createdAt: at(70 * DAY), latestUpdate: note('n2', 'Waiting on a vessel', 25 * DAY, now), updateCount: 1 }),
    raw(506, P.rhea, { ...securedMoney, stage: 'COMPLETED', vehicleSecuredAt: at(60 * DAY), completedAt: at(3 * DAY), vehicle: hiaceT88('Sold'), createdAt: at(80 * DAY), totalPaid: 12427, totalDue: 0 }),
    raw(507, P.sol, { stage: 'CANCELLED', cancelledAt: at(10 * DAY), createdAt: at(30 * DAY) }),
    raw(508, P.tess, { ...paidDeposit, stage: 'REFUNDED', cancelledAt: at(2 * DAY), createdAt: at(30 * DAY) }),
  ];
}

// ---- the live auction feed -----------------------------------------------------------------------

/** The cars in the coming auctions: [id, make, model, modelCode, variant, year, grade, km, days from today, website's suggested bid, landed at that bid]. */
export const LOTS = [
  ['1992541', 'Subaru', 'XV Hybrid', 'GPE', 'HYBRID 2.0I EYESIGHT', 2015, '3.5', 121000, 1, 253590, 10506],
  ['2006629', 'Subaru', 'XV Hybrid', 'GPE', 'HYBRID 2.0I EYESIGHT', 2015, '4', 73000, 1, 455820, 12742],
  ['2005010', 'Subaru', 'XV Hybrid', 'GPE', 'HYBRID 2.0I EYESIGHT', 2013, 'R', 110000, 2, 217210, 10104],
  ['2103377', 'Honda', 'N-Box', 'JF3', 'CUSTOM G L TURBO', 2020, '4', 31000, 2, 690000, 14520],
];
/** What similar cars sold for, by lot: [grade, km, yen]. */
export const SOLD = {
  1992541: [['3.5', 120000, 401000], ['3.5', 122000, 388000], ['3.5', 117000, 178000], ['3.5', 115000, 319000], ['3.5', 147000, 251000], ['3.5', 148000, 233000], ['3.5', 93000, 211000], ['3.5', 150000, 166000], ['3.5', 152000, 179000], ['4', 127000, 205000]],
  2006629: [['4', 70000, 470000], ['4', 76000, 452000], ['4', 81000, 430000], ['3.5', 90000, 380000]],
  2005010: [['R', 105000, 220000], ['R', 115000, 205000], ['RA', 99000, 240000]],
  2103377: [['4', 28000, 710000], ['4', 33000, 690000], ['4.5', 25000, 760000], ['3.5', 40000, 620000]],
};

export const lotRow = (now) => ([id, make, model, modelCode, variant, year, grade, km, days, bench, landed]) => ({
  id, title: `${year} ${make.toUpperCase()} ${make.toUpperCase()} ${model.toUpperCase()}`, make: make.toUpperCase(), model: `${make.toUpperCase()} ${model.toUpperCase()}`, modelCode, year,
  auctionDate: sydneyDay(now + days * DAY), auctionHouse: 'MIRIVE Saitama', odometerKm: km, auctionGrade: grade, transmission: 'Automatic', fuelType: /hybrid/i.test(model) ? 'Hybrid' : 'Petrol',
  mainImageUrl: 'https://photos.example/1', photos: [],
  ssotBenchmarkBidYen: String(bench), ssotBenchmarkBidAud: Math.round(bench * 0.009138),
  priceEstimate: { bidYen: String(bench), calculationStatus: 'ok', estimatedLandedAud: landed, manualReviewRequired: false, lctRiskWarning: false, thresholdWarnings: [], breakdown: null },
  eligibility: { refId: 64, make, model, modelCode, slug: `${make}-${model}-${modelCode}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'), status: 'ELIGIBLE' }, bidSubmissionStatus: 'ready', _variant: variant,
});
export const lotDetail = (now) => (row) => {
  const r = lotRow(now)(row);
  return { listingStatus: 'LIVE', customer: { loggedIn: false }, vehicle: { ...r, variant: r._variant, engineCc: 2000, driveType: '4WD', seatingCapacity: 5, colour: 'WINE', bodyType: 'Hatchback', auctionSheetSummary: { grade: row[6], variant: null } } };
};
/** The website's calculator: a plain sum, in the same shape as the real one. */
export const estimateFor = (bid) => {
  const a = Math.round(bid * 0.009138);
  return { bidYen: String(bid), calculationSource: 'customer_bid', estimatedLandedAud: a + 8212, calculationStatus: 'ok', lctApplied: false, lctRiskWarning: false, manualReviewRequired: false, thresholdWarnings: [],
    breakdown: { bidAudEstimate: a, japanAgentFee: 822, carbarnAgentFee: 1500, shippingLogisticsDutyAndImportCharges: 3400, compliancePackage: 1540, gst: 950, lct: null, estimatedLandedAud: a + 8212 } };
};

// ---- Marketplace chats, as the content engine sends them -----------------------------------------

const chatRow = (id, buyer, minsAgo, now, extra = {}) => ({
  id, device: 'dev-1', device_name: 'Yard phone 1', device_timezone: 'Australia/Sydney',
  thread_id: `thread-secret-${id}`, buyer_name: buyer, kind: 'buyer', thread_name: buyer,
  listing_title: '2021 Toyota Noah X', title: buyer, last_snippet: 'snippet',
  last_message_at: new Date(now - minsAgo * MIN).toISOString(), last_inbound_at: new Date(now - minsAgo * MIN).toISOString(), last_outbound_at: null, last_direction: 'in',
  unread: true, archived: false, pending_outbound: 0, failed_outbound: 0, listing_price: '$28,900', lead_id: null,
  participants: ['participant-secret-1'],
  car: { post_id: 1, vehicle_id: 1, stock_id: '1159', title: '2021 Toyota Noah X (8 Seater)', price: '$28,900', listing_url: 'https://www.facebook.com/marketplace/item/246813', image: 'https://img.example/secret-photo.jpg', dashboard_url: 'https://dash.example/secret-page' },
  agent: { enabled: true, device_enabled: true, stage: 'opened', state: '', locked: false, lock_reason: '', lock_detail: '', due_at: null,
    lead: { phone: '0491 570 199', phone_confidence: 'high', email: 'buyer@example.com', name: buyer, kinds: [], booking: '', budget: '', trade_in: '', notes: {} } },
  ...extra,
});
const chatMessage = (id, direction, source, text, minsAgo, now, status = direction === 'in' ? '' : 'sent', extra = {}) => ({
  id, direction, source, text, status, sent_via: '', error: '', artifact: '', artifact_url: 'https://img.example/secret-artifact.jpg',
  phone_ts: now - minsAgo * MIN, sent_at: direction === 'out' ? new Date(now - minsAgo * MIN).toISOString() : null, seen_at: null, created_at: new Date(now - minsAgo * MIN).toISOString(),
  has_media: false, mentions: [], attachments: [], ...extra,
});

/** Five chats: the buyer wrote last; the auto-reply answered; a failed send; a price only the auto-reply named; archived. */
export function marketplace(now = Date.now()) {
  const iso = (minsAgo) => new Date(now - minsAgo * MIN).toISOString();
  const hiace = { listing_title: '2020 Toyota Hiace DX', listing_price: '$33,900', car: { post_id: 2, vehicle_id: 3, stock_id: '1201', title: '2020 Toyota Hiace DX', price: '$33,900', listing_url: 'https://www.facebook.com/marketplace/item/357924', image: 'https://img.example/secret-photo-2.jpg', dashboard_url: 'https://dash.example/secret-page-2' } };
  const chats = new Map();
  chats.set(501, { row: chatRow(501, 'Liam Carter', 20, now), messages: [chatMessage(1, 'in', 'phone', 'Hi, is this still available? Thanks, Liam. Call me on 0491 570 199', 20, now)] });
  chats.set(502, { row: chatRow(502, 'Mia Chen', 30, now, { last_direction: 'out', last_outbound_at: iso(29) }), messages: [chatMessage(2, 'in', 'phone', 'Is this still available?', 30, now), chatMessage(3, 'out', 'agent', 'Yes it is. When would you like to see it?', 29, now)] });
  chats.set(503, { row: chatRow(503, 'Noah Patel', 40, now, { failed_outbound: 1, ...hiace }), messages: [chatMessage(4, 'in', 'phone', 'Can I come and see it on Saturday?', 40, now), chatMessage(5, 'out', 'agent', 'Yes, Saturday works.', 39, now, 'failed')] });
  chats.set(504, { row: chatRow(504, 'Ava Jones', 10, now, { agent: { enabled: true, device_enabled: true, stage: 'qualifying', locked: false, lead: { phone: '', email: '', name: 'Ava Jones', budget: '$20,000', trade_in: '', notes: {}, kinds: [] } } }),
    messages: [chatMessage(6, 'in', 'phone', 'What is the price?', 15, now), chatMessage(7, 'out', 'auto', 'It is $25,000 drive away.', 14, now), chatMessage(8, 'in', 'phone', 'Can you do any better?', 10, now)] });
  chats.set(505, { row: chatRow(505, 'Jonah Reed', 50, now, { archived: true }), messages: [chatMessage(9, 'in', 'phone', 'Is it available?', 50, now)] });
  return chats;
}

// ---- what the phone add-on reports ---------------------------------------------------------------

/** One report from the add-on: a text the dashboard also has, one it missed, a number it never saw, and a login code. */
export function phoneReport(now = Date.now()) {
  const latest = (direction, text, agoMs, precision = 'exact') => ({ direction, text, media: null, truncated: false, when: agoMs < MIN ? 'now' : `${Math.round(agoMs / MIN)} min`, at: now - agoMs, precision });
  return {
    v: 1, seenAt: now, hidden: true, path: '/web/conversations', signedOut: false, found: { listItems: 4, parsed: 4 },
    threads: [
      { ref: 'r1', name: PEOPLE.priya[2], kind: 'number', unread: true, latest: latest('in', 'Hi, is the Noah still available?', 19 * MIN, 'minute') },
      { ref: 'r2', name: PEOPLE.isla[2], kind: 'number', unread: true, latest: latest('in', 'Any update on the trade-in?', 4 * MIN, 'minute') },
      { ref: 'r3', name: '0491 570 150', kind: 'number', unread: true, latest: latest('in', 'Hi, do you have any Hiace vans under 30k?', 8 * MIN, 'minute') },
      { ref: 'r4', name: '444', kind: 'shortcode', unread: false, latest: latest('in', '604812 is your login code', 30 * MIN, 'minute') },
    ],
  };
}

// ---- the website's import-eligible models, as its list sends them --------------------------------

/** One model in the raw shape of the website's eligible-models list. Figures invented. */
export const eligibleRow = ({ id, make, model, modelCode, slug, yearRange, summary, engine = '', seats = 0, bodyType = '', fuelType = '', total = 0, deposit = 0, depositJpy = 0, avgJpy = 0, avgAud = 0, compliance = 1980, shipping = 0, gst = 0, nichibo = 0, priceOnRequest = false, sevs = [] }) => ({
  id, make, model, modelCode, title: `${make} ${model} ${modelCode}`, slug, yearRange, bodyType, fuelType, engineSize: '', status: 'In Force', publishStatus: 'PUBLISHED',
  compliancePrice: `$${compliance.toLocaleString('en-AU')}`, seats, image: 'https://img.example/secret-catalog.png', catalogImage: 'https://img.example/secret-catalog.png',
  engine, transmission: 'Automatic', drivetrain: '2WD', power: '', torque: '', displacement: '',
  complianceSummary: summary, weight: '', dimensions: '',
  costing: priceOnRequest ? { validCosting: false } : { validCosting: true, jpyToAudRate: 0.009085, avgPriceJpy: avgJpy, avgPriceAud: avgAud, internationalFreightAud: 5200, customsElectronicEntryFeeAud: 220, deliveryAud: 250, bmsbHeatTreatmentFeeAud: 250, shippingChargeAud: shipping, gstAud: gst, customGstAud: 0, importDutyAud: null, lctAud: null, compliancePackagePrice: compliance, complianceCriterion: 'sevs environmental criterion', complianceBandLabel: 'Passenger', carbarnAgentFeeAud: 1500, nichiboAgentFeeJpy: 0, nichiboAgentFeeAud: nichibo, nichiboAgentBandLabel: '', auctionDepositAmount: depositJpy, auctionDepositAmountAud: deposit, profitRate: null, profitAud: null, totalLandedPriceAud: total },
  yearPrices: [], soldData: null, priceOnRequest, externalAveragePrice: null,
  mres: [{ id: id * 10, mreNumber: `MRE-${String(id).padStart(6, '0')}`, roverApprovalId: 'secret-approval-id', holderName: 'SYDNEY AVV PTY LTD', modificationCategory: 'NA', mreBuildStart: '2004-01-01', mreBuildEnd: '2024-10-31', nswBodyCode: 'Van', mreNotes: summary.join(' '), specialNotes: '' }],
  sevs: sevs.map((n, i) => ({ id: i + 1, sevNumber: n, roverApprovalId: 'secret-approval-id', criterion: 'Environmental Criterion', sevBuildStart: '2004-01-01', sevBuildEnd: null })),
  estimatedPrice: `$${total.toLocaleString('en-AU')}`, vehiclePrice: `$${avgAud.toLocaleString('en-AU')}`, auctionPriceAud: avgAud, auctionPriceJpy: avgJpy, japanAgentFee: nichibo, shippingCost: shipping, customsCost: gst, agentFee: 1500, lctAud: 0, importDutyAud: 0, auctionDepositAmountAud: deposit, images: [],
});

/** Five invented models: a costed van, a kei car, a people mover, a sports car with an odometer limit, and one with no costing. */
export const ELIGIBLE = [
  eligibleRow({ id: 116, make: 'Toyota', model: 'Hiace', modelCode: 'GDH206', slug: 'toyota-hiace-gdh206', yearRange: '1/2004 to 10/2026', summary: ['Eligible as a 4WD campervan with 2, 3, 5 or 6 seats', 'Engines 1TR, 2TR, 1KD, 2KD and 1GD eligible', 'Vehicle must be fitted with an internal campervan fit out'], engine: '1GD', seats: 6, bodyType: 'Motorhome, Van', fuelType: 'Diesel', total: 57781, deposit: 4545, depositJpy: 500000, avgJpy: 4100000, avgAud: 37249, shipping: 9200, gst: 5252, nichibo: 2230, sevs: ['SEV-000933'] }),
  eligibleRow({ id: 23, make: 'Honda', model: 'N-Box', modelCode: 'JF3', slug: 'honda-n-box-jf3', yearRange: '1/2017 to 12/2023', summary: ['Eligible under the SEVS Environmental Criterion'], engine: 'S07B', seats: 4, bodyType: 'Kei', fuelType: 'Petrol', total: 21600, deposit: 1500, depositJpy: 150000, avgJpy: 1200000, avgAud: 10902, shipping: 6100, gst: 1964, nichibo: 1363, compliance: 1540, sevs: ['SEV-000441'] }),
  eligibleRow({ id: 61, make: 'Toyota', model: 'Alphard Welcab', modelCode: 'AGH30W', slug: 'toyota-alphard-welcab-agh30w', yearRange: '1/2015 to 5/2023', summary: ['Eligible under the SEVS Mobility Criterion with a welfare lift or ramp fitted'], engine: '2AR-FE', seats: 7, bodyType: 'People mover', fuelType: 'Petrol', total: 48900, deposit: 3000, depositJpy: 300000, avgJpy: 3200000, avgAud: 29072, shipping: 8900, gst: 4445, nichibo: 1900, sevs: ['SEV-000512'] }),
  eligibleRow({ id: 88, make: 'Daihatsu', model: 'Copen', modelCode: 'LA400', slug: 'daihatsu-copen-la400', yearRange: '6/2014 to 12/2026', summary: ['Odometer must be under 80,000 km', 'Eligible with the KF turbo engine'], engine: 'KF', seats: 2, bodyType: 'Convertible', fuelType: 'Petrol', total: 24100, deposit: 1500, depositJpy: 150000, avgJpy: 1400000, avgAud: 12719, shipping: 6100, gst: 2191, nichibo: 1363, compliance: 1540, sevs: ['SEV-000380'] }),
  eligibleRow({ id: 140, make: 'Audi', model: 'Q7', modelCode: '4MC', slug: 'audi-q7-4mc', yearRange: '1/2016 to 12/2026', summary: ['Eligible under the SEVS Performance Criterion'], engine: 'CRTC', seats: 7, bodyType: 'SUV', fuelType: 'Diesel', compliance: 2480, priceOnRequest: true, sevs: ['SEV-000777'] }),
];

/** Everything the stand-ins serve, built once for a given `now`. */
export function world(now = Date.now()) {
  return { now, vehicles: vehicles(now), ...dashboard(now), orders: orders(now), lots: LOTS, sold: SOLD, chats: marketplace(now), phoneReport: phoneReport(now), eligible: ELIGIBLE };
}
