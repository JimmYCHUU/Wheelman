// Auction orders: customers who have asked us to buy a car for them at auction in Japan.
//
// The dashboard keeps one order per request and moves it through stages. This module says, in
// plain words, where an order has got to and which message is due next. Nothing here talks to an
// AI: the messages themselves are written from templates (see composeMessage in ordermessages.js).
//
// Wheelman cannot see WhatsApp, where most of these customers are written to. So "done" means
// the owner copied the message (or dismissed it), not that it was seen to be sent.

import { openDb, listOrders } from './db.js';
import { config } from './config.js';
import { sydneyDay } from './time.js';
import { tidyVariant, tidyName } from './auction.js';

const DAY = 24 * 3600 * 1000;
const RECENT = 7 * DAY;   // a message about a step is only suggested while the step is this new

export const orderKey = (id) => `ao:${id}`;

// A make or model as a person would write it: "NOAH" becomes "Noah", "BMW" and "GT-R" stay.
const tidy = tidyName;

/** The make and model on a customer's request: "Subaru XV Hybrid". */
export const wantedCar = (w) => [tidy(w?.make), tidy(w?.model)].filter(Boolean).join(' ');

/** "2021 Toyota Hiace DX" for a secured car or an auction car. */
export function carTitle(c) {
  if (!c) return '';
  const made = [c.year || '', tidy(c.make), tidy(c.model)].filter(Boolean).join(' ');
  if (made.trim() && (c.make || c.model)) return [made, c.variant && c.variant.length <= 40 ? tidyVariant(c.variant, c.model) : ''].filter(Boolean).join(' ');
  return tidy(c.title);
}

/** What the customer asked for, in a few words: "Subaru XV Hybrid, 2014 to 2015". */
export function wantedText(w) {
  if (!w) return '';
  const car = wantedCar(w);
  const years = w.yearFrom && w.yearTo && w.yearFrom !== w.yearTo ? `${w.yearFrom} to ${w.yearTo}` : w.yearFrom ? (w.yearTo === w.yearFrom ? String(w.yearFrom) : `${w.yearFrom} or newer`) : '';
  return [car, years].filter(Boolean).join(', ');
}

/**
 * The auction car an order is tied to, named the way the customer knows it: "2015 Subaru XV
 * Hybrid". The auction's own record writes the model its own way ("SUBARU XV"), so the name on
 * their request is used with the car's year.
 */
export function lotName(o) {
  if (!o.lot) return '';
  const asked = wantedCar(o.wanted);
  return asked ? [o.lot.year || '', asked].filter(Boolean).join(' ') : carTitle(o.lot);
}

/** The car an order is about: the one secured, else the auction car it is tied to, else what was asked for. */
export const orderCar = (o) => carTitle(o.car) || lotName(o) || wantedText(o.wanted);

export const customerName = (o) => [o.customer?.firstName, o.customer?.lastName].filter(Boolean).join(' ').trim();

const slug = (s) => String(s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/**
 * The website page of the auction car an order is tied to. The address uses the names the
 * website knows the model by, which are the ones on the customer's request.
 */
export function lotPageUrl(o) {
  const lot = o.lot;
  if (!lot?.id) return '';
  const w = o.wanted || {};
  const [make, model, code] = [w.make || lot.make, w.model || lot.model, w.modelCode || lot.modelCode];
  return make && model && code ? `${config.site.baseUrl}/live-auction/${slug(make)}/${slug(model)}/${slug(code)}/${lot.id}` : '';
}

/** The website page listing every coming auction car of the model they asked for, optionally on one day. */
export function modelPageUrl(w, auctionDate = '') {
  if (!w?.make || !w?.model || !w?.modelCode) return '';
  return `${config.site.baseUrl}/live-auction/${slug(w.make)}/${slug(w.model)}/${slug(w.modelCode)}${auctionDate ? `?auctionDate=${auctionDate}` : ''}`;
}

const depositPaid = (o) => o.depositState && o.depositState !== 'NONE';
const where = (o) => String(o.car?.stockIn || '').toLowerCase();

/** Where an order has got to, in plain words. */
export function stageOf(o) {
  if (o.closed === 'refunded') return { code: 'refunded', label: 'Refunded', finished: true };
  if (o.closed) return { code: 'cancelled', label: 'Cancelled', finished: true };
  if (o.stage === 'COMPLETED') return { code: 'completed', label: 'Completed', finished: true };
  if (o.stage === 'SHIPPING_COMPLIANCE') {
    const at = where(o);
    if (at === 'arrived' || at === 'online') return { code: 'arrived', label: 'Arrived, compliance under way' };
    if (at === 'transit') return { code: 'transit', label: 'On the way to Australia' };
    return { code: 'shipping', label: 'Shipping and compliance' };
  }
  if (o.stage === 'VEHICLE_SECURED') return { code: 'secured', label: 'Car secured' };
  if (o.lotPhase === 'OUTCOME_DUE') return { code: 'result_due', label: 'Bid placed, result due' };
  return depositPaid(o) ? { code: 'searching_paid', label: 'Looking for a car, deposit paid' } : { code: 'searching', label: 'Looking for a car, no deposit yet' };
}

// ---- the messages ---------------------------------------------------------------

/** Every kind of message, with the words shown in the "Which message?" list. */
export const MESSAGES = {
  first_estimate: 'Thanks, with estimate and deposit',
  lot_closed: 'The car you wanted has closed',
  lots_coming: 'Cars coming up, bid on the website',
  lot_offer: 'Car found, full',
  lot_short: 'Car found, short',
  search_update: 'Still searching',
  deposit_reminder: 'Deposit reminder',
  deposit_received: 'Deposit received',
  bid_lost_stock: 'Bid lost, with cars from our stock',
  bid_lost: 'Bid lost, still searching',
  stock_priced: 'A stock car priced',
  secured: 'Car secured',
  payment_due: 'Payment due',
  shipping_booked: 'Shipping booked',
  on_the_water: 'On the water',
  arrived: 'Arrived, compliance under way',
  ready: 'Ready to collect or deliver',
  thanks: 'Thank you',
  refund: 'Refund update',
  progress_update: 'Progress update',
};

const SEARCHING = ['first_estimate', 'lot_offer', 'lot_short', 'lots_coming', 'lot_closed', 'search_update', 'deposit_reminder', 'deposit_received', 'bid_lost', 'bid_lost_stock', 'stock_priced', 'secured', 'refund'];
const BY_STAGE = {
  VEHICLE_SECURED: ['secured', 'payment_due', 'shipping_booked', 'progress_update', 'refund'],
  SHIPPING_COMPLIANCE: ['shipping_booked', 'on_the_water', 'arrived', 'ready', 'payment_due', 'progress_update'],
  COMPLETED: ['thanks', 'ready', 'progress_update'],
};

/** The messages that make sense for an order as it stands, for the "Which message?" list. */
export function messagesFor(o) {
  if (o.closed) return ['refund'];
  return BY_STAGE[o.stage] || SEARCHING;
}

/** Two kinds of message that say the same thing in different words share one occasion. */
const FAMILY = { lot_short: 'lot_offer', bid_lost_stock: 'bid_lost' };
const family = (type) => FAMILY[type] || type;

/**
 * The messages that are due for an order, the most pressing first. Usually none or one.
 * Each is { occasion, type, why }. An occasion is one thing to tell the customer once, such as
 * "offer-2006629" or "secured": it stays the same however often the message is rewritten, and
 * once it has been copied or dismissed the next one in the list becomes due.
 */
export function dueMessages(o, { now = Date.now() } = {}) {
  const marks = o.marks || {};
  const recent = (key, days = 7) => !!marks[key] && now - marks[key] < days * DAY;
  // The dashboard marks an order when a follow-up is due: that is a reason to write. Each new
  // staff note starts a new occasion. (Its "quiet" mark is ignored, as the owner asked.)
  const nudge = o.followUpDue;
  const since = o.note?.id || 'start';
  const due = [];
  const add = (occasion, type, why) => due.push({ occasion, type, why });

  if (o.closed === 'refunded') { if (recent('stage:refunded', 14)) add('refund', 'refund', 'The order has been refunded.'); return due; }
  if (o.closed) return due;

  if (o.stage === 'COMPLETED') { if (recent('stage:COMPLETED', 14)) add('completed', 'thanks', 'The order was completed.'); return due; }

  if (o.stage === 'SHIPPING_COMPLIANCE' || o.stage === 'VEHICLE_SECURED') {
    const at = where(o);
    if (o.stage === 'SHIPPING_COMPLIANCE') {
      if ((at === 'arrived' || at === 'online') && recent(`car:${at}`)) add('arrived', 'arrived', 'The stock record shows the car has arrived.');
      else if (at === 'transit' && recent('car:transit')) add('transit', 'on_the_water', 'The stock record shows the car has left Japan.');
      else if (recent('stage:SHIPPING_COMPLIANCE')) add('shipping', 'shipping_booked', 'The order has moved to shipping and compliance.');
    } else if (recent('stage:VEHICLE_SECURED')) add('secured', 'secured', 'The car has been secured.');
    if (nudge) {
      if (o.money?.due > 0) add(`payment-${since}`, 'payment_due', 'A payment is outstanding and a follow-up is due.');
      else add(`update-${since}`, 'progress_update', 'A follow-up is due on the dashboard.');
    }
    return due;
  }

  // Looking for a car.
  const lot = o.lot;
  const today = sydneyDay(now);
  const watch = o.watch || null; // what the live auction held when it was last looked at
  if (o.lotPhase === 'OUTCOME_DUE') {
    add(`result-${lot?.id || since}`, watch?.stock?.length ? 'bid_lost_stock' : 'bid_lost', 'The auction has been held. If we won, the order moves to "Car secured" on the dashboard; this is the message for a bid that did not win.');
    return due;
  }
  if (depositPaid(o) && recent('deposit')) add('deposit', 'deposit_received', 'A deposit has been received.');
  // A car they picked themselves comes before the general welcome.
  const tied = lot?.id && lot.auctionDate && lot.auctionDate >= today;
  if (tied) add(`offer-${lot.id}`, 'lot_offer', 'The order is tied to a car in a coming auction.');
  else if (!depositPaid(o) && now - (o.createdAt || 0) < RECENT) add('estimate', 'first_estimate', 'A new order with no deposit yet.');
  if (!tied && watch?.lot?.id) add(`offer-${watch.lot.id}`, 'lot_offer', 'A matching car is in the coming auctions.');
  else if (!tied && watch?.next?.count >= 2) add(`coming-${watch.next.date}`, 'lots_coming', `${watch.next.count} cars of this model come up at auction on ${watch.next.date}.`);
  if (lot?.id && lot.auctionDate && lot.auctionDate < today && !depositPaid(o) && recent(`phase:${o.lotPhase}:${lot.id}`, 14)) {
    add(`closed-${lot.id}`, 'lot_closed', 'The auction for the car they asked about has passed.');
  }
  if (nudge) {
    if (depositPaid(o)) add(`search-${since}`, 'search_update', 'A follow-up is due and no suitable car has come up.');
    else add(`reminder-${since}`, 'deposit_reminder', 'A follow-up is due and no deposit has been paid.');
  }
  return due;
}

/** The occasion a chosen message belongs to: the due one when it is the same kind, else its own. */
export function occasionFor(o, type, next = null) {
  if (next && family(next.type) === family(type)) return next.occasion;
  const lotId = o.watch?.lot?.id || o.lot?.id || '';
  if (family(type) === 'lot_offer') return `offer-${lotId || 'none'}`;
  if (family(type) === 'bid_lost') return `result-${o.lot?.id || o.note?.id || 'start'}`;
  return `own-${type}`;
}

// ---- the list ---------------------------------------------------------------------

/**
 * Whether an order needs the owner, from what is known without building its whole timeline.
 * ctx: { copied: Map(anchor -> time), dismissed: Set(anchor), pastes: [{ id, direction, at }], lastCopyAt }
 */
export function orderStatus(o, ctx, { now = Date.now() } = {}) {
  const stage = stageOf(o);
  const lastOut = Math.max(ctx.lastCopyAt || 0, ...ctx.pastes.filter((p) => p.direction === 'out').map((p) => p.at));
  const waiting = ctx.pastes.filter((p) => p.direction === 'in' && p.at > lastOut && !ctx.dismissed.has(`in:${p.id}`));
  if (waiting.length) {
    return { state: 'awaiting', anchorKey: `in:${waiting[waiting.length - 1].id}`, due: 'Reply to their message', kind: 'reply', next: null, stage, waiting };
  }
  const due = dueMessages(o, { now });
  const handled = (m) => ctx.copied.has(`out:${m.occasion}`) || ctx.dismissed.has(`out:${m.occasion}`);
  const next = due.find((m) => !handled(m));
  if (next) return { state: 'awaiting', anchorKey: `out:${next.occasion}`, due: `Send: ${MESSAGES[next.type].toLowerCase()}`, kind: 'send', next, stage, waiting: [] };
  // Nothing is due. The last message that was dealt with is remembered, so it can be put back.
  const last = due[due.length - 1] || null;
  return { state: stage.finished ? 'closed' : 'answered', anchorKey: last ? `out:${last.occasion}` : 'out:none', due: '', kind: '', next: last, stage, waiting: [] };
}

/** What Wheelman itself has recorded against each order: what was copied, dismissed, opened and pasted. */
export function orderMarks() {
  const d = openDb();
  const by = new Map();
  const of = (key) => { if (!by.has(key)) by.set(key, { copied: new Map(), dismissed: new Set(), seen: new Set(), pastes: [], lastCopyAt: 0, lastCopy: null }); return by.get(key); };
  for (const r of d.prepare("SELECT item_key, anchor_key, copied_at, copied_text FROM drafts WHERE item_key LIKE 'ao:%' AND copied_at IS NOT NULL ORDER BY copied_at").all()) {
    const m = of(r.item_key);
    m.copied.set(r.anchor_key, r.copied_at);
    if (r.copied_at >= m.lastCopyAt) { m.lastCopyAt = r.copied_at; m.lastCopy = { at: r.copied_at, text: r.copied_text || '' }; }
  }
  for (const r of d.prepare("SELECT item_key, anchor_key FROM dismissed WHERE item_key LIKE 'ao:%'").all()) of(r.item_key).dismissed.add(r.anchor_key);
  for (const r of d.prepare("SELECT item_key, anchor_key FROM seen WHERE item_key LIKE 'ao:%'").all()) of(r.item_key).seen.add(r.anchor_key);
  for (const r of d.prepare('SELECT id, order_id, direction, text, at FROM order_messages WHERE removed_at IS NULL ORDER BY at, id').all()) of(orderKey(r.order_id)).pastes.push(r);
  return { of };
}

/**
 * A message copied out of WhatsApp arrives as "[2:14 pm, 05/10/2026] Name: text", one such
 * prefix per message. The prefixes are taken off and the messages kept in order.
 */
export function cleanPaste(text) {
  return String(text ?? '').replace(/\r/g, '')
    .split('\n').map((l) => l.replace(/^\s*\[[^\]\n]{4,40}\]\s*[^:\n]{1,40}:\s?/, ''))
    .join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

const short = (s, n = 140) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };

/** What the list shows for one order. `m` is what Wheelman has recorded against it (see orderMarks). */
export function orderRow(o, m, { now = Date.now() } = {}) {
  const s = orderStatus(o, m, { now });
  const lastPaste = m.pastes[m.pastes.length - 1] || null;
  // The time on the row: the newest thing that happened, whoever did it.
  const lastAt = Math.max(o.note?.at || 0, m.lastCopyAt || 0, lastPaste?.at || 0, ...Object.values(o.marks || {})) || o.createdAt || o.firstSeenAt || 0;
  // What the row says under the name: their newest message, else what we last copied, else the staff note.
  const preview = s.waiting.length ? { who: 'customer', text: short(s.waiting[s.waiting.length - 1].text) }
    : m.lastCopy && m.lastCopyAt >= (o.note?.at || 0) ? { who: 'us', text: short(m.lastCopy.text) }
      : o.note ? { who: '', text: `Staff note: ${short(o.note.body)}` } : { who: '', text: '' };
  // What happened to the message that was due: it decides whether "Put back" is offered.
  const handled = s.state !== 'awaiting' && s.next
    ? (m.copied.has(s.anchorKey) ? 'copied' : m.dismissed.has(s.anchorKey) ? 'dismissed' : '') : '';
  return {
    key: orderKey(o.id), section: 'auction', account: '', needsPerson: false, replyComing: false,
    anchor: s.anchorKey, state: s.state, dismissed: false, handled,
    name: customerName(o), phone: o.customer?.phone || '',
    situation: s.stage.label, stage: s.stage.label, stageCode: s.stage.code, due: s.due, dueKind: s.kind,
    waitingSince: s.waiting.length ? s.waiting[0].at : null,
    lastAt,
    unanswered: s.waiting.length,
    unread: s.state === 'awaiting' && !m.seen.has(s.anchorKey) ? Math.max(1, s.waiting.length) : 0,
    preview: { ...preview, media: null },
    flag: 'none',
    car: orderCar(o),
    orderNo: o.orderNo,
  };
}

/**
 * One row per order for the list, without building any timeline: a handful of queries for the
 * whole section. Rows that need the owner come first.
 */
export function listOrderRows({ now = Date.now() } = {}) {
  const marks = orderMarks();
  const rows = listOrders({ now }).map((o) => orderRow(o, marks.of(orderKey(o.id)), { now }));
  const rank = (r) => (r.dueKind === 'reply' ? 0 : r.state === 'awaiting' ? 1 : 2);
  return rows.sort((a, b) => rank(a) - rank(b) || (b.lastAt || 0) - (a.lastAt || 0));
}
