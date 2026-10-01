// Turns raw dashboard records into the trimmed shapes this app stores.
// Vehicles are reduced to customer-safe fields here, so internal figures
// (purchase cost, shipping, margin, buyer details) never reach the database.

import { parseDashboardTime } from './time.js';
import { config } from './config.js';

const clean = (s) => (s === null || s === undefined ? '' : String(s).trim());

export function normalizeLead(raw) {
  let state = '';
  try { state = raw.others ? JSON.parse(raw.others).stateShortName || '' : ''; } catch { /* not JSON */ }
  return {
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
    stocks: (raw.stocks || []).map(String),
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
  return v;
}

/** Plain-language availability from the dashboard's three status fields. */
export function availability(v) {
  if (!v) return { code: 'unknown', text: 'Unknown' };
  const sold = /sold/i.test(clean(v.soldStatus)) && !/unsold/i.test(clean(v.soldStatus));
  if (sold || /^sold$/i.test(clean(v.stockIn))) return { code: 'sold', text: 'Sold' };
  const where = clean(v.stockIn).toLowerCase();
  const listed = clean(v.status).toUpperCase() === 'PUBLISHED';
  if (where === 'online') return { code: 'available', text: 'Available now at the Lidcombe yard' };
  if (where === 'arrived') return { code: 'arrived', text: 'Arrived in Australia and being prepared; not yet ready for inspection' };
  if (where === 'transit') return { code: 'transit', text: 'In transit from Japan; not yet in Australia' };
  if (where === 'japan') return { code: 'japan', text: listed ? 'Still in Japan; available to order, not yet shipped' : 'Still in Japan; not yet advertised' };
  return { code: 'unknown', text: 'Unknown' };
}
