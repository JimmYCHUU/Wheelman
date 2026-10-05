// Turns raw dashboard records into the trimmed shapes this app stores.
// Vehicles are reduced to customer-safe fields here, so internal figures
// (purchase cost, shipping, margin, buyer details) never reach the vehicle record.
// A sale is reduced to a small digest (normalizeSale): stage, date and whether it is paid.
// No amount and no buyer name is kept, and the buyer's contact details are used only for matching.
// An auction order (normalizeOrder) is the exception the owner asked for: who it is for and what
// they were charged and paid are kept, because its messages have to say so. Our own costs are not.

import { parseDashboardTime, parseDashboardDate } from './time.js';
import { config } from './config.js';

const clean = (s) => (s === null || s === undefined ? '' : String(s).trim());

/**
 * An Australian phone number reduced to its last nine digits, so "+61 400 111 222" and
 * "0400 111 222" compare equal. Anything that is not one phone number gives ''.
 */
export function phoneKey(s) {
  const d = String(s ?? '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('61')) return d.slice(2);
  if (d.length === 10 && d.startsWith('0')) return d.slice(1);
  if (d.length === 9) return d;
  return '';
}

/** Every phone number in the given values (a field can hold two, split by "|", "," or "/"). */
export function phoneKeys(...values) {
  const out = new Set();
  for (const v of values) for (const part of String(v ?? '').split(/[|,/]/)) { const k = phoneKey(part); if (k) out.add(k); }
  return [...out];
}

export function normalizeLead(raw) {
  let state = '';
  try { state = raw.others ? JSON.parse(raw.others).stateShortName || '' : ''; } catch { /* not JSON */ }
  return {
    // Every stage this lead has been through, oldest first. Who changed it is not kept.
    statusHistory: (Array.isArray(raw.statusHistory) ? raw.statusHistory : [])
      .map((h) => ({ status: clean(h?.status), at: parseDashboardTime(h?.time) }))
      .filter((h) => h.status),
    id: raw.id,
    conversationId: raw.conversationId ?? null,
    firstName: clean(raw.customerFirstName),
    lastName: clean(raw.customerLastName),
    phone: clean(raw.customerPhone),
    email: clean(raw.customerEmail),
    source: clean(raw.leadSourceDto?.leadSource),
    status: clean(raw.leadStatus),
    platform: clean(raw.platform),
    state,
    leadAt: parseDashboardTime(raw.leadDate),
    updatedAt: parseDashboardTime(raw.updatedAt) ?? parseDashboardTime(raw.createdAt),
    stocks: (raw.stocks || []).filter((s) => s !== null && s !== undefined).map((s) => String(s).trim()).filter((s) => s && !/^null$/i.test(s)),
    inquiries: (raw.inquiries || []).map((i) => ({
      id: i.id,
      type: clean(i.inquiryType),
      subject: clean(i.customerQuerySubject),
      text: clean(i.customerQuery),
      stockNo: clean(i.stockNo),
      at: parseDashboardTime(i.leadDate),
      status: clean(i.status),
      url: clean(i.canonicalUrl),
      leadType: clean(i.leadType),
      priceAtTime: i.priceAtTime ?? null,
      loanAmount: i.loanAmount ?? null,
      depositAmount: i.dipositAmount ?? null,
      years: i.durationInYears ?? null,
      staffNotes: (i.comments || []).map((c) => ({ by: clean(c.commentedBy), text: clean(c.content), at: parseDashboardTime(c.createdAt) })),
    })),
  };
}

export function normalizeConversation(raw) {
  return {
    id: raw.id,
    phone: clean(raw.phoneNumber),
    channel: clean(raw.channel),
    status: clean(raw.status),
    leadId: raw.lead?.id ?? null,
    customerName: clean(raw.lead?.customerName),
    // The dashboard attaches a short summary of the lead. It is the only record of leads this app
    // does not store, such as ones on another platform.
    leadPlatform: clean(raw.lead?.platform),
    leadStatus: clean(raw.lead?.currentStatus),
    leadEmail: clean(raw.lead?.customerEmail),
    latestDirection: clean(raw.latestMessageDirection),
    latestAt: parseDashboardTime(raw.latestMessageAt),
    latestBody: clean(raw.latestMessageBody),
  };
}

export function normalizeMessage(raw) {
  // providerCreatedAt is when the text was really sent; createdAt is when the dashboard imported it.
  const at = parseDashboardTime(raw.providerCreatedAt) ?? parseDashboardTime(raw.createdAt);
  return {
    id: raw.id,
    conversationId: raw.conversationId,
    direction: raw.direction === 'OUT' ? 'OUT' : 'IN',
    body: raw.body ?? '',
    sentBy: raw.sentBy ?? null,
    status: clean(raw.status),
    mediaType: raw.mediaType ?? (raw.mediaUrls ? 'media' : null),
    at,
    importedAt: parseDashboardTime(raw.createdAt),
  };
}

const slug = (s) => clean(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export function vehicleUrl(v) {
  if (!v?.make || !v?.model || !v?.modelCode || !v?.stockNo) return '';
  return `${config.site.baseUrl}/vehicles/${slug(v.make)}/${slug(v.model)}/${slug(v.modelCode)}/${slug(v.stockNo)}`;
}

const SAFE_FIELDS = [
  'id', 'stockNo', 'dsVehicleId', 'year', 'builtMonthYear', 'firstRegistrationDate', 'title', 'noOfKeys',
  'registrationExpiryDate', 'make', 'model', 'modelCode', 'variant', 'engineCc', 'fuel', 'transmission',
  'engineCode', 'driveTrain', 'cylinders', 'doors', 'seats', 'height', 'width', 'length', 'color',
  'interiorColour', 'bodyType', 'batterySOH', 'batteryRange', 'odometer', 'odometerHistory1',
  'odometerHistory2', 'odometerHistory1Date', 'odometerHistory2Date', 'auctionGrade', 'fuelConsumption',
  'numberOfPreviousOwner', 'stockIn', 'status', 'soldStatus', 'inventoryAddress', 'features', 'outline',
  'serviceRecord', 'description', 'writtenOff', 'waterDamage', 'majorRepairs', 'ppsrClear',
];

export function normalizeVehicle(raw) {
  const v = {};
  for (const k of SAFE_FIELDS) v[k] = raw[k] ?? null;
  v.stockNo = clean(raw.stockNo);
  v.year = raw.year ? Number(raw.year) || null : null;
  // Advertised price only. Cost, shipping and margin fields are deliberately not copied.
  v.price = raw.auPublishPrice ?? raw.salePrice ?? null;
  const ms = raw.modelSpec || raw.cabin || null;
  v.spec = ms ? {
    cabinHeight: ms.cabinHeight || null, cabinWidth: ms.cabinWidth || null, cabinLength: ms.cabinLength || null,
    groundClearance: ms.groundClearance || null, fuelTankCapacity: ms.fuelTankCapacity || null,
    fuelConsumptionCombined: ms.fuelConsumptionCombined || null, gearType: ms.gearType || null,
  } : null;
  const es = raw.engineSpec || raw.engine || null;
  v.engine = es ? { engineSizeL: es.engineSizeL || null, induction: es.induction || null } : null;
  v.url = vehicleUrl(v);
  // How far the car's preparation has got: dates only, and whether it has a plate yet.
  v.progress = {
    blueSlip: parseDashboardDate(raw.blueSlipDate),
    regoDone: parseDashboardDate(raw.registrationCompletedDate),
    inspectionIssued: parseDashboardDate(raw.rmsInspectionIssueDate),
    lastSeenShipping: parseDashboardDate(raw.lastSeenAtShipping),
    hasPlate: !!clean(raw.registrationNumber),
  };
  return v;
}

/**
 * The sale attached to a vehicle, reduced to what a reply needs: which car, the stage, when,
 * and whether a deposit or the full amount is recorded. Returns null when there is no sale.
 *
 * Amounts are compared and then discarded. The buyer's name is never read. The buyer's phone
 * and email are returned only so the caller can turn them into match keys; they are not stored.
 * Supplier payment details on the vehicle are never touched.
 */
export function normalizeSale(raw) {
  const s = raw?.salesInfo;
  if (!s || s.salesId === null || s.salesId === undefined || s.salesId === '') return null;
  const total = Number(s.totalPrice) || 0;
  const paidAmount = Number(s.paidAmount) || 0;
  return {
    vehicleId: raw.id,
    saleId: String(s.salesId),
    stockNo: clean(raw.stockNo),
    stage: clean(s.deliveryStatus).toUpperCase(),
    soldAt: parseDashboardTime(s.salesDateTime),
    paid: total > 0 && paidAmount >= total ? 'full' : paidAmount > 0 ? 'part' : 'none',
    phones: phoneKeys(s.customerMobile),
    email: clean(s.customerEmail).toLowerCase(),
  };
}

/**
 * One auction order from the dashboard, reduced to what the Auction section needs: who it is for,
 * what they want found, the auction car or the car secured, how far it has got, and what the
 * customer has been charged and has paid. Every field is copied by name, so nothing new on the
 * dashboard's record can arrive here by accident.
 *
 * Deliberately not kept: street address, licence, date of birth, the delivery contact, the
 * salesperson, who wrote a staff note, photo addresses, the link the customer pays through, how a
 * payment was made and its reference, and every cost of ours on the vehicle record (purchase,
 * freight, repairs, supplier payments).
 */
export function normalizeOrder(o) {
  const id = Number(o?.id);
  if (!o || !Number.isInteger(id) || id <= 0) return null;
  const n = (v) => (Number(v) > 0 ? Math.round(Number(v)) : 0);
  const amount = (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v) * 100) / 100 : 0);
  const stage = clean(o.stage).toUpperCase();
  const who = o.invoiceTo || {};
  const snap = o.lotSnapshot || null;
  const v = o.vehicle || null;
  const note = o.latestUpdate || null;
  const link = o.agreementLink || null;
  const lotId = o.auctionVehicleId || snap?.auctionVehicleId || '';
  const secured = v || clean(o.vehicleMake) || clean(o.vehicleModel);
  return {
    id,
    orderNo: clean(o.orderNo),
    stage,
    lotPhase: clean(o.lotPhase).toUpperCase(),
    source: clean(o.source).toUpperCase(),
    // An order that has ended without a car: it is shown under Finished, and nothing more is suggested.
    closed: /^refund/i.test(stage) ? 'refunded' : /^cancel/i.test(stage) || o.cancelledAt ? 'cancelled' : '',
    leadId: Number.isInteger(Number(o.leadId)) && Number(o.leadId) > 0 ? Number(o.leadId) : null,
    customer: { firstName: clean(who.firstName), lastName: clean(who.lastName), phone: clean(who.mobileNumber), email: clean(who.email).toLowerCase() },
    preferredContact: clean(o.preferredContact).toUpperCase(),
    followUpAt: parseDashboardTime(o.followUpAt),
    followUpDue: !!o.followUpDue,
    updateCount: n(o.updateCount),
    note: note && clean(note.body) ? { id: clean(note.id), at: parseDashboardTime(note.at), channel: clean(note.channel).toUpperCase(), body: clean(note.body).slice(0, 600) } : null,
    depositState: clean(o.depositState).toUpperCase() || 'NONE',
    wanted: {
      make: clean(o.reqMake), model: clean(o.reqModel), modelCode: clean(o.reqModelCode), variant: clean(o.reqVariant),
      yearFrom: n(o.reqYearFrom), yearTo: n(o.reqYearTo),
      targetBidYen: n(o.targetBidJpy), budgetAud: n(o.budgetAud),
      notes: clean(o.requirementNotes).slice(0, 1500),
    },
    // The one auction car this order is tied to, when there is one.
    lot: lotId ? {
      id: String(lotId), title: clean(snap?.title), make: clean(snap?.make), model: clean(snap?.model), modelCode: clean(snap?.modelCode),
      variant: clean(snap?.variant), year: n(snap?.year), grade: clean(snap?.auctionGrade), km: n(snap?.odometerKm),
      auctionDate: clean(snap?.auctionDate || o.auctionDate).slice(0, 10), auctionHouse: clean(snap?.auctionHouse || o.auctionHouse),
      lotNumber: clean(snap?.lotNumber || o.lotNumber), transmission: clean(snap?.transmission), fuel: clean(snap?.fuelType), colour: clean(snap?.colour),
    } : null,
    // The car that was bought for them, and where the stock record says it is.
    car: secured ? {
      stockNo: clean(v?.stockNo), title: clean(v?.title),
      year: n(v?.year ?? o.vehicleYear), make: clean(v?.make || o.vehicleMake), model: clean(v?.model || o.vehicleModel),
      modelCode: clean(v?.modelCode || o.vehicleModelCode), variant: clean(v?.variant || o.vehicleVariant),
      km: n(v?.odometer ?? o.vehicleMileage), grade: clean(v?.auctionGrade || o.auctionGrade),
      colour: clean(v?.color), fuel: clean(v?.fuel), transmission: clean(v?.transmission), seats: n(v?.seats),
      stockIn: clean(v?.stockIn), status: clean(v?.status).toUpperCase(), soldStatus: clean(v?.soldStatus),
      lastSeenShipping: parseDashboardDate(v?.lastSeenAtShipping), blueSlip: parseDashboardDate(v?.blueSlipDate),
      regoDone: parseDashboardDate(v?.registrationCompletedDate),
    } : null,
    // What the customer is charged and has paid. Customer-facing figures only.
    money: {
      quotedDeposit: amount(o.quotedDepositAud), depositPaid: amount(o.depositPaidAud),
      lines: (Array.isArray(o.items) ? o.items : []).map((i) => ({ stage: clean(i?.stage).toUpperCase(), description: clean(i?.description || i?.type), amount: amount(i?.totalIncGst) })).filter((i) => i.description),
      payments: (Array.isArray(o.payments) ? o.payments : []).map((p) => ({ stage: clean(p?.stage).toUpperCase(), type: clean(p?.type).toUpperCase(), amount: amount(p?.amount), at: parseDashboardTime(p?.paymentDateTime) })).filter((p) => p.amount > 0),
      tax: amount(o.taxTotal), total: amount(o.totalAmount), paid: amount(o.totalPaid), due: amount(o.totalDue),
    },
    // Whether the payment page has been used. The link itself is never kept.
    agreement: link ? { status: clean(link.status).toUpperCase(), paymentStatus: clean(link.paymentStatus).toUpperCase(), accepted: !!link.agreementAccepted } : null,
    createdAt: parseDashboardTime(o.createdAt),
    securedAt: parseDashboardTime(o.vehicleSecuredAt),
    completedAt: parseDashboardTime(o.completedAt),
    cancelledAt: parseDashboardTime(o.cancelledAt),
    refundRequestedAt: parseDashboardTime(o.refundRequestedAt),
  };
}

/** Plain-language availability from the dashboard's three status fields. */
export function availability(v) {
  if (!v) return { code: 'unknown', text: 'Unknown' };
  const sold = /sold/i.test(clean(v.soldStatus)) && !/unsold/i.test(clean(v.soldStatus));
  if (sold || /^sold$/i.test(clean(v.stockIn))) return { code: 'sold', text: 'Sold' };
  const where = clean(v.stockIn).toLowerCase();
  const listed = clean(v.status).toUpperCase() === 'PUBLISHED';
  if (where === 'online') return { code: 'available', text: 'Available now at the Lidcombe yard' };
  // A car that has arrived and is listed on the website has been prepared: it is at the yard and
  // can be inspected. (The owner's correction, 2 Oct 2026.) Until it is listed, it is still being prepared.
  if (where === 'arrived') return listed
    ? { code: 'available', text: 'Available now at the Lidcombe yard' }
    : { code: 'arrived', text: 'Arrived in Australia and being prepared; not yet advertised' };
  if (where === 'transit') return { code: 'transit', text: 'In transit from Japan; not yet in Australia' };
  if (where === 'japan') return { code: 'japan', text: listed ? 'Still in Japan; available to order, not yet shipped' : 'Still in Japan; not yet advertised' };
  return { code: 'unknown', text: 'Unknown' };
}
