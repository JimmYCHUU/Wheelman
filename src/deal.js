// Works out whether the person writing is already a buyer, and of which car.
//
// Three sources, most reliable first:
//   1. a sale record whose buyer has the same phone number or email (from the vehicle list the
//      dashboard already sends; see normalizeSale);
//   2. the lead's status (car sold, deposit received);
//   3. our own earlier texts in the conversation ("deposit received", "ready for pickup").
// Nothing here goes to the AI except the stage in words, the car, and dates of steps on file.

import { salesFor, saleForVehicle, getVehicleById, getVehicleByStock } from './db.js';
import { phoneKeys } from './normalize.js';
import { BUYER_STATUSES } from './situations.js';
import { resolveStock, stockFromUrl, findUrls } from './text.js';
import { formatDay } from './time.js';

const DAY = 24 * 3600 * 1000;
const RECENT_SALE_DAYS = 90;   // a delivered sale older than this makes a past buyer, not a purchase in progress
const SIGNAL_DAYS = 120;       // how far back lead stages and our own texts are trusted
const CANCELLED = /cancel|refund|void/i;
const LOST = /^(FAILED|CLOSED_LOST|DISQUALIFIED|COLD|UNRESPONSIVE)$/i;

/** The sale stage in plain words. Money amounts are never part of it. */
export function stageOf(sale) {
  const s = String(sale?.stage || '').toUpperCase();
  if (/DELIVERED/.test(s)) return { stage: 'delivered', stageText: 'paid in full and recorded as handed over to the customer' };
  if (/PAYMENT_COMPLETED/.test(s) || sale?.paid === 'full') return { stage: 'paid_in_full', stageText: 'paid in full; not yet recorded as handed over' };
  if (sale?.paid === 'part') return { stage: 'deposit_paid', stageText: 'a deposit is recorded; the balance is not yet recorded as paid' };
  return { stage: 'payment_pending', stageText: 'a sale is recorded; no payment is recorded yet' };
}

/** What is and is not on file about preparing this car. Dates only. */
function progressOf(vehicle) {
  const p = vehicle?.progress || {};
  const steps = [
    ['blue slip', p.blueSlip],
    ['registration completed', p.regoDone],
    ['RMS inspection report issued', p.inspectionIssued],
  ];
  return {
    onFile: steps.filter(([, day]) => day).map(([label, day]) => ({ label, day, text: `${label}: ${formatDay(day)}` })),
    notOnFile: steps.filter(([, day]) => !day).map(([label]) => label),
  };
}

/** Vehicles named in these timeline entries, by link or stock number. */
function vehiclesNamedIn(entries) {
  const out = new Map();
  for (const e of entries || []) {
    const refs = [...findUrls(e.text).map(stockFromUrl), e.url ? stockFromUrl(e.url) : null, e.stockNo || null].filter(Boolean);
    for (const ref of refs) { const v = resolveStock(ref, getVehicleByStock); if (v) out.set(v.id, v); }
  }
  return [...out.values()];
}

// Things we only say to someone who is buying. "A deposit has been taken" is said to other
// enquirers about somebody else's purchase, so it is excluded.
const STRONG = /(deposit (has been |was |is )?received|received (your|the) deposit|thank(s| you) for (the|your) deposit|payment (has been |was |is )?received|received (your|the) (payment|balance)|has been registered|is (now )?registered|registration (is |has been )?(done|complete|completed)|ready (for|to) (pick ?up|pickup|collect|be picked up)|tracking (number|details|link)|booked (with|for) (the )?(carrier|transport|truck)|congratulations on|notice of disposal|your new (car|van|vehicle))/i;
const WEAK = /(tax invoice|your invoice|invoice (has been |is |was )?(sent|attached|emailed|updated)|sent (you )?(the |an |your )?(updated )?invoice|conditions of sale)/i;
const ABOUT_SOMEONE_ELSE = /(deposit (has been |was )?taken|recently had a deposit|another (customer|buyer))/i;

function signalsIn(timeline, now) {
  const strong = [], weak = [];
  for (const e of timeline) {
    if (e.who !== 'us' || e.internal || e.auto || !e.text) continue;
    if (!e.at || now - e.at > SIGNAL_DAYS * DAY) continue;
    for (const sentence of e.text.split(/(?<=[.!?])\s+|\n+/)) {
      if (ABOUT_SOMEONE_ELSE.test(sentence)) continue;
      if (STRONG.test(sentence)) strong.push({ text: sentence.trim().slice(0, 160), at: e.at });
      else if (WEAK.test(sentence)) weak.push({ text: sentence.trim().slice(0, 160), at: e.at });
    }
  }
  return { strong, weak };
}

/**
 * @returns {{ deal: object|null, pastBuyer: object|null }}
 * deal: { source, recorded, stage, stageText, vehicle, stockNo, soldAt, matchedBy, onFile, notOnFile, signals, others }
 * pastBuyer: { title, soldAt } when they bought from us some time ago, or are now asking about a different car.
 */
export function dealFor({ lead = null, conversation = null, timeline = [], pending = [], now = Date.now() } = {}) {
  const none = { deal: null, pastBuyer: null };

  // 1. A sale record for this phone number or email.
  const phones = phoneKeys(conversation?.phone, lead?.phone);
  const emails = [lead?.email, conversation?.lead_email].map((e) => String(e || '').trim().toLowerCase()).filter((e) => /@/.test(e));
  // A sale recorded after `now` is ignored, so replaying an old conversation does not see the future.
  const sales = (phones.length || emails.length ? salesFor({ phones, emails }) : [])
    .filter((s) => !CANCELLED.test(s.stage || '') && (!s.sold_at || s.sold_at <= now + DAY));
  if (sales.length) {
    const named = vehiclesNamedIn(timeline.slice(-12));
    const lastStock = [...(lead?.stocks || [])].reverse().map((s) => resolveStock(s, getVehicleByStock)).find(Boolean);
    const namedIds = new Set([...named.map((v) => v.id), lastStock?.id].filter((x) => x !== undefined));
    const pick = sales.find((s) => namedIds.has(s.vehicle_id)) || sales[0];
    const vehicle = getVehicleById(pick.vehicle_id);
    const past = { title: vehicle?.title || (pick.stock_no ? `stock ${pick.stock_no}` : 'a vehicle'), soldAt: pick.sold_at || null };

    // Writing about a different car that is not theirs: a returning customer, treated as a new enquiry.
    const boughtIds = new Set(sales.map((s) => s.vehicle_id));
    const askingAbout = vehiclesNamedIn(pending);
    if (askingAbout.length && !askingAbout.some((v) => boughtIds.has(v.id))) return { deal: null, pastBuyer: past };

    const { stage, stageText } = stageOf(pick);
    const ageDays = pick.sold_at ? (now - pick.sold_at) / DAY : 0;
    if (stage === 'delivered' && ageDays > RECENT_SALE_DAYS) return { deal: null, pastBuyer: past };

    return {
      pastBuyer: null,
      deal: {
        source: 'sale', recorded: true, stage, stageText,
        vehicle: vehicle || null, stockNo: pick.stock_no || vehicle?.stockNo || '', soldAt: pick.sold_at || null, matchedBy: pick.matchedBy,
        ...progressOf(vehicle), signals: [],
        others: sales.filter((s) => s !== pick).map((s) => ({ stockNo: s.stock_no, title: getVehicleById(s.vehicle_id)?.title || '' })),
      },
    };
  }

  // 2. The lead says so: its current status, or a recent stage in its history with nothing lost after it.
  const status = String(lead?.status || conversation?.lead_status || '');
  const history = Array.isArray(lead?.statusHistory) ? lead.statusHistory : [];
  let since = null;
  let label = '';
  if (BUYER_STATUSES.test(status)) { label = status; since = [...history].reverse().find((h) => BUYER_STATUSES.test(h.status))?.at || null; }
  else {
    const at = history.findLastIndex((h) => BUYER_STATUSES.test(h.status));
    if (at !== -1 && !history.slice(at + 1).some((h) => LOST.test(h.status)) && history[at].at && now - history[at].at < SIGNAL_DAYS * DAY) {
      label = history[at].status; since = history[at].at;
    }
  }
  if (label) {
    const vehicle = [...(lead?.stocks || [])].reverse().map((s) => resolveStock(s, getVehicleByStock)).find(Boolean) || null;
    const words = /DEPOSIT/i.test(label) ? 'deposit received' : 'car sold';
    return {
      pastBuyer: null,
      deal: {
        source: 'lead_status', recorded: false, stage: 'unknown', stageText: `the lead is marked "${words}"; the details of the sale are not on file here`,
        vehicle, stockNo: vehicle?.stockNo || '', soldAt: since, matchedBy: null,
        ...progressOf(vehicle), signals: [], others: [],
      },
    };
  }

  // 3. Our own earlier texts say things we only say to a buyer.
  const { strong, weak } = signalsIn(timeline, now);
  if (strong.length || weak.length >= 2) {
    const signals = [...strong, ...weak].sort((a, b) => b.at - a.at).slice(0, 3);
    return {
      pastBuyer: null,
      deal: {
        source: 'messages', recorded: false, stage: 'unknown', stageText: 'the stage of the sale is not on file here',
        vehicle: null, stockNo: '', soldAt: null, matchedBy: null,
        onFile: [], notOnFile: [], signals, others: [],
      },
    };
  }
  return none;
}

/**
 * True when a car still shows as available but another customer has a sale in progress on it
 * (a deposit taken). It must not be offered as available to anyone else.
 */
export function reservedByAnother(vehicle, deal = null) {
  if (!vehicle?.id) return false;
  if (deal?.vehicle?.id === vehicle.id) return false;
  const sale = saleForVehicle(vehicle.id);
  return !!sale && !CANCELLED.test(sale.stage || '') && stageOf(sale).stage !== 'delivered';
}
