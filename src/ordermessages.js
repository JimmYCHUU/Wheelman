// Writes the messages for auction orders from the wording in voice/auction-messages.md.
//
// No AI is asked here. Every figure and link is put in by code: from the order itself, from the
// website's live auction and its cost calculator, or from our own stock list. What only a person
// knows (what a car sold for, the ship, a date) is left as a marked blank such as [SOLD PRICE?],
// or taken from what the owner typed into "Add what you know".

import { config } from './config.js';
import { template, fill, fillParts, unfilled } from './templates.js';
import { insertDraft, latestDraft, allVehicles, saleForVehicle, getVehicleByStock, setOrderWatch, listOrders } from './db.js';
import { searchLots, getLot, estimateFor, soldComparables, lotIdFromUrl, tidyName } from './auction.js';
import { chooseLot, suggestedBid, bidBasisLine, offerBlock, costLines, specificsIn, money, yen } from './imports.js';
import { MESSAGES, carTitle, lotName, wantedCar, lotPageUrl, modelPageUrl, stageOf } from './orders.js';
import { restore, redact } from './redact.js';
import { availability } from './normalize.js';
import { sydneyDay, formatSydney } from './time.js';
import { logLine } from './log.js';

const DAY = 24 * 3600 * 1000;
const FILE = 'auction-messages.md';
const tidy = tidyName;
// A colour is written in capitals on the stock record ("PEARL WHITE"): one capital per word here.
const colourOf = (s) => String(s || '').toLowerCase().replace(/(^|[\s-])([a-z])/g, (m, a, b) => a + b.toUpperCase());
const listOf = (a) => (a.length <= 1 ? a.join('') : a.length === 2 ? a.join(' and ') : `${a.slice(0, -1).join(', ')}, and ${a[a.length - 1]}`);
const km = (n) => `${Number(n || 0).toLocaleString('en-AU')} km`;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "in tomorrow's auction", "in today's auction" or "at auction on 7 October". */
export function auctionWhen(day, now = Date.now()) {
  const m = String(day || '').match(/^(\d{4})-(\d\d)-(\d\d)/);
  if (!m) return 'in a coming auction';
  const key = `${m[1]}-${m[2]}-${m[3]}`;
  if (key === sydneyDay(now)) return "in today's auction";
  if (key === sydneyDay(now + DAY)) return "in tomorrow's auction";
  return `at auction on ${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}`;
}

// ---- "Add what you know" -----------------------------------------------------------------

const AMT = String.raw`\d+(?:\.\d+)?\s?(?:million|mil|m|k)\b|\d{1,3}(?:,\d{3})+|\d{4,8}`;
const toAmount = (s) => {
  const t = String(s).toLowerCase().replace(/[,\s]/g, '');
  const n = parseFloat(t);
  if (!Number.isFinite(n)) return 0;
  return Math.round(/(million|mil|m)$/.test(t) ? n * 1e6 : /k$/.test(t) ? n * 1e3 : n);
};
const DATE = String.raw`(?:(?:early|mid|late|end of)\s+)?(?:\d{1,2}(?:st|nd|rd|th)?\s+(?:of\s+)?[A-Za-z]{3,9}(?:\s+\d{4})?|[A-Za-z]{3,9}\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|(?:january|february|march|april|may|june|july|august|september|october|november|december)(?:\s+\d{4})?)`;

/**
 * Reads the facts the owner typed, such as "we bid 1.2m, sold for 1.31m" or "ETA 14 Nov, ship
 * Hoegh Trader". Only what is plainly said is taken. `said` lists what was understood, in words.
 */
export function factsIn(text) {
  const t = ` ${String(text || '').replace(/[¥$]/g, ' ')} `;
  const amount = (words) => { const m = t.match(new RegExp(String.raw`(?:${words})\b[^\d\n,.;]{0,18}(${AMT})`, 'i')); return m ? toAmount(m[1]) : 0; };
  const date = (words) => { const m = t.match(new RegExp(String.raw`(?:${words})\b\s*(?:is|on|by|at|around|about|:|-)?\s*(${DATE})`, 'i')); return m ? m[1].trim().replace(/\s+/g, ' ') : ''; };
  const ship = (t.match(/\b(?:ship|vessel)\s*(?:is|name|named|:|-)?\s*((?:[A-Z][\w'’-]*)(?:\s+[A-Z][\w'’-]*){0,3})/) || [])[1] || '';
  const out = {
    ourBidYen: amount('we bid|our bid|bid(?:ded)? (?:was|at|of)|placed (?:a |the )?bid(?: at| of)?|bid'),
    soldYen: amount('sold (?:for|at)|went for|hammer(?:ed)? (?:at|price)|sold'),
    passedIn: /\bpassed in\b|\bdid ?n[o']t sell\b|\bunsold\b/i.test(t),
    winYen: amount('won (?:it |the car )?(?:for|at)|winning (?:price|bid)|won'),
    purchaseYen: amount('purchase(?: price)?|bought (?:for|at)'),
    landedAud: amount('landed(?: price| cost)?'),
    depositAud: amount('deposit(?: of| is)?'),
    arrival: date('eta|arriv\\w*|arrival|due in|lands?'),
    sailing: date('sail\\w*|depart\\w*|leav\\w+|ships?'),
    ready: date('ready'),
    refund: date('refund\\w*'),
    ship: ship.trim(),
    stockNo: (t.match(/\bstock\s*(?:no\.?|number|#)?\s*([A-Za-z]?\d{2,6})\b/i) || [])[1] || '',
    lotId: lotIdFromUrl(t) || (t.match(/\blot\s*(?:no\.?|number|#)?\s*(\d{6,9})\b/i) || [])[1] || '',
    next: ((t.match(/\bnext(?:\s+step)?\s*(?:is|:|-)\s*([^\n]+)/i) || [])[1] || '').trim().replace(/[.\s]+$/, ''),
  };
  // "sold for 1.31m" must not also be read as our bid.
  if (out.ourBidYen && out.ourBidYen === out.soldYen && !/\bbid\b/i.test(t)) out.ourBidYen = 0;
  const said = [];
  if (out.ourBidYen) said.push(`our bid ${yen(out.ourBidYen)}`);
  if (out.passedIn) said.push('it was passed in');
  if (out.soldYen) said.push(`sold for ${yen(out.soldYen)}`);
  if (out.winYen) said.push(`won for ${yen(out.winYen)}`);
  if (out.purchaseYen) said.push(`purchase price ${yen(out.purchaseYen)}`);
  if (out.landedAud) said.push(`landed price ${money(out.landedAud)}`);
  if (out.depositAud) said.push(`deposit ${money(out.depositAud)}`);
  for (const [k, label] of [['sailing', 'sailing'], ['arrival', 'arrival'], ['ready', 'ready'], ['refund', 'refund']]) if (out[k]) said.push(`${label} ${out[k]}`);
  if (out.ship) said.push(`ship ${out.ship}`);
  if (out.stockNo) said.push(`stock ${out.stockNo}`);
  if (out.lotId) said.push(`auction car ${out.lotId}`);
  if (out.next) said.push(`next step: ${out.next}`);
  return { ...out, said };
}

// ---- facts from the order, the auction and the stock list -----------------------------------

/** What the customer asked for, in the form chooseLot understands. Their own notes add a kilometre limit or a grade. */
export function wantedOf(o) {
  const w = o.wanted || {};
  const said = specificsIn(w.notes || '');
  const out = {
    make: w.make, model: w.model, modelCode: w.modelCode,
    yearFrom: w.yearFrom || said.yearFrom, yearTo: w.yearTo || said.yearTo,
    budgetAud: w.budgetAud || said.budgetAud, ceilingAud: 0,
    maxKm: said.maxKm, minGrade: said.minGrade,
    targetBidYen: w.targetBidYen || 0,
  };
  // Whether they have told us anything to choose a car by. With nothing to go on, no particular
  // car is picked for them: the newest, dearest one in the auction would always come out on top.
  out.hasLimits = !!(out.yearFrom || out.yearTo || out.budgetAud || out.maxKm || out.minGrade || out.targetBidYen);
  return out;
}

/**
 * The best car in the coming auctions for an order, or null. A car whose expected price is far
 * above the bid they asked us to work to (more than half as much again) is not offered.
 */
function bestLot(lots, o) {
  const w = wantedOf(o);
  if (!w.hasLimits && !variantWords(o).length) return null;
  const inReach = lots.filter((l) => !w.targetBidYen || !l.benchmarkYen || l.benchmarkYen <= w.targetBidYen * 1.5);
  // A variant named on the order ("Custom L Turbo") comes first: the cars that share the most of
  // its words are chosen from. A car that shares none of them is not put forward by itself.
  const words = variantWords(o);
  if (!words.length) return chooseLot(inReach, w);
  const top = Math.max(0, ...inReach.map((l) => variantScore(l, words)));
  return top ? chooseLot(inReach.filter((l) => variantScore(l, words) === top), w) : null;
}

const wordsOf = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9.]+/g, ' ').split(' ').filter(Boolean);
/** The words of the variant named on the order, without the make and model. */
function variantWords(o) {
  const skip = new Set(wordsOf(`${o.wanted?.make} ${o.wanted?.model}`));
  return [...new Set(wordsOf(o.wanted?.variant).filter((x) => !skip.has(x)))];
}
const variantScore = (lot, words) => { const has = new Set(wordsOf(`${lot.variant} ${lot.title}`)); return words.filter((x) => has.has(x)).length; };

/** Where a car falls short of what is on the order, for the owner to see before sending. */
function shortfalls(lot, o) {
  const w = wantedOf(o);
  const out = [];
  const words = variantWords(o);
  if (words.length && variantScore(lot, words) < words.length) out.push(`The order asks for "${o.wanted.variant}". This car is listed as "${lot.variant || 'no variant given'}".`);
  if (w.maxKm && lot.km > w.maxKm) out.push(`It has ${km(lot.km)}, more than the ${km(w.maxKm)} they asked for.`);
  if (w.yearFrom && lot.year && (lot.year < w.yearFrom || (w.yearTo && lot.year > w.yearTo))) out.push(`It is a ${lot.year}, outside the years on the order.`);
  if (w.minGrade && parseFloat(lot.grade) < w.minGrade) out.push(`It is auction grade ${lot.grade}, below the grade ${w.minGrade} they asked for.`);
  return out;
}

/** Cars of the model they want that are in our own stock in Japan or on the way, and not sold or held. */
export function stockMatches(o, max = 2) {
  const w = o.wanted || {};
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const make = norm(w.make), model = norm(w.model);
  if (!make || !model) return [];
  return allVehicles()
    .filter((v) => norm(v.make) === make && (norm(v.model) === model || norm(v.model).includes(model) || model.includes(norm(v.model))) && norm(v.model))
    .filter((v) => ['japan', 'transit'].includes(availability(v).code) && !saleForVehicle(v.id))
    .filter((v) => !w.yearFrom || !v.year || v.year >= w.yearFrom)
    .sort((a, b) => (b.year || 0) - (a.year || 0) || (a.odometer || 0) - (b.odometer || 0))
    .slice(0, max);
}

const lotBrief = (l) => (l ? { id: l.id, title: l.title, year: l.year, grade: l.grade, km: l.km, auctionDate: l.auctionDate, url: l.url } : null);

/**
 * Looks at the live auction for an order that is still searching, and notes what is there: the
 * best match, and how many cars come up on the next auction day. Read-only, a few requests.
 */
export async function watchOrder(o, now = Date.now()) {
  const stock = stockMatches(o).map((v) => v.stockNo);
  if (o.lotPhase === 'OUTCOME_DUE') { setOrderWatch(o.id, { stock, lot: null, searched: 0, next: null }, now); return; }
  const lots = await searchLots({ make: o.wanted?.make, model: o.wanted?.model });
  const best = bestLot(lots, o);
  const days = [...new Set(lots.filter((l) => l.ready && l.auctionDate).map((l) => l.auctionDate.slice(0, 10)))].sort();
  const next = days[0] ? { date: days[0], count: lots.filter((l) => l.ready && l.auctionDate.slice(0, 10) === days[0]).length } : null;
  setOrderWatch(o.id, { stock, lot: lotBrief(best), searched: lots.length, next }, now);
}

/** The auction car a "car found" message is about: the one typed in, the one the order is tied to, or the best match. */
async function lotFor(o, told, now) {
  const today = sydneyDay(now);
  const tied = o.lot?.id && (!o.lot.auctionDate || o.lot.auctionDate >= today) ? o.lot.id : '';
  for (const id of [told.lotId, tied, o.watch?.lot?.id].filter(Boolean)) {
    const lot = await getLot(id);
    if (lot && lot.ready) return { lot, searched: null };
  }
  // Asked for by hand ("Car found" picked from the list): the best there is, limits or none.
  const lots = await searchLots({ make: o.wanted?.make, model: o.wanted?.model });
  const best = bestLot(lots, o) || chooseLot(lots, wantedOf(o));
  return { lot: best ? (await getLot(best.id)) || best : null, searched: lots.length };
}

class NotNow extends Error {}

// ---- writing one message ------------------------------------------------------------------

/** Text for the charges of one stage: "- Car price in Japan: $8,400 AUD", one per line. */
const stageLines = (o, stage) => o.money.lines.filter((l) => l.stage === stage && l.amount > 0).map((l) => `- ${l.description}: ${money(l.amount)} AUD`).join('\n');

/**
 * Fills in one message for an order. Returns { text, facts, notes, review } where `facts` is what
 * it relied on and `notes` are things the owner should know before sending.
 */
export async function composeMessage(o, type, { told = factsIn(''), now = Date.now() } = {}) {
  const t = template(FILE);
  const part = t?.sections?.[type];
  if (!part) throw new NotNow(`The wording for "${MESSAGES[type] || type}" is missing from the file voice/${FILE}.`);
  const w = o.wanted || {};
  const carWanted = wantedCar(w) || 'vehicle';
  const stage = o.stage === 'INITIAL_DEPOSIT' ? 'INITIAL_DEPOSIT' : o.stage;
  const asked = told.depositAud || o.money.quotedDeposit || o.money.lines.find((l) => l.stage === 'INITIAL_DEPOSIT')?.amount || 0;
  const paid = o.money.depositPaid || 0;
  const lines = stageLines(o, stage);
  const facts = [];
  const notes = [];
  let review = false;
  let tail = '';
  const v = {
    sender: config.firstReplySender,
    car_wanted: carWanted,
    model: w.model || carWanted,
    car: carTitle(o.car) || carWanted,
    car_or_wanted: carTitle(o.car) || carWanted,
    deposit_amount: asked ? money(asked) : '[DEPOSIT AMOUNT?]',
    deposit_paid: paid ? money(paid) : '[AMOUNT?]',
    if_deposit_paid: paid > 0,
    due: o.money.due > 0 ? money(o.money.due) : '[AMOUNT?]',
    if_due: o.money.due > 0,
    stage_lines: lines || null,
    if_stage_lines: !!lines,
  };
  if (told.said.length) facts.push(`From what you typed: ${told.said.join('; ')}`);

  if (type === 'first_estimate') {
    const years = w.yearFrom && w.yearTo && w.yearFrom !== w.yearTo ? `${w.yearFrom} to ${w.yearTo} model` : w.yearFrom ? (w.yearTo === w.yearFrom ? `${w.yearFrom} model` : `${w.yearFrom} model or newer`) : '';
    v.wanted_lines = [[carWanted, w.variant, w.modelCode ? `(${w.modelCode})` : ''].filter(Boolean).join(' '), years, w.budgetAud ? `Landed budget about ${money(w.budgetAud)}` : ''].filter(Boolean).join('\n');
    v.if_target = w.targetBidYen > 0;
    v.target_bid = w.targetBidYen ? yen(w.targetBidYen) : null;
    v.if_estimate = false; v.total = null; v.cost_lines = null;
    if (w.targetBidYen) {
      // The calculator works on a real auction car, so a similar one in the coming auctions is used.
      const lots = (await searchLots({ make: w.make, model: w.model })).filter((l) => l.eligible && l.ready);
      const basis = chooseLot(lots, wantedOf(o)) || lots[0] || null;
      const estimate = basis ? await estimateFor(basis.id, w.targetBidYen) : null;
      if (estimate) {
        Object.assign(v, { if_estimate: true, total: money(estimate.totalAud), cost_lines: costLines(estimate) });
        review = review || estimate.needsReview;
        facts.push(`Landed estimate at ${yen(w.targetBidYen)} from the website's calculator, worked out on a similar car in the coming auctions (${basis.title})`);
      } else notes.push(`No landed estimate is given: no ${carWanted} is in the coming auctions for the calculator to work on.`);
    } else notes.push('There is no target bid on the order, so no estimate is given.');
  }

  if (type === 'lot_closed') {
    const missing = [!specificsIn(w.notes || '').maxKm ? 'your preferred maximum odometer reading' : '', !w.yearFrom ? 'year range' : '', !w.budgetAud ? 'overall budget' : ''].filter(Boolean);
    v.missing_details = missing.length ? listOf(missing) : null;
  }

  if (type === 'lots_coming') {
    const lots = (await searchLots({ make: w.make, model: w.model })).filter((l) => l.ready && l.auctionDate);
    const days = [...new Set(lots.map((l) => l.auctionDate.slice(0, 10)))].sort();
    if (!days.length) throw new NotNow(`No ${carWanted} is in the coming auctions right now, so there is nothing to point to.`);
    const n = lots.filter((l) => l.auctionDate.slice(0, 10) === days[0]).length;
    Object.assign(v, { lot_count: n >= 3 ? 'several' : n === 2 ? 'two' : 'one', auction_when: auctionWhen(days[0], now), model_url: modelPageUrl(w, days[0]) || '[LINK?]' });
    facts.push(`${n} ${carWanted} at auction on ${days[0]}, read from the live auction`);
  }

  if (type === 'lot_offer' || type === 'lot_short') {
    const { lot, searched } = await lotFor(o, told, now);
    if (!lot) throw new NotNow(searched ? `${searched} ${carWanted} are in the coming auctions, but none fits what they asked for.` : `No ${carWanted} is in the coming auctions right now.`);
    const wanted = wantedOf(o);
    Object.assign(v, {
      lot_name: [lot.year || '', lot.make, lot.model].filter(Boolean).join(' '), lot_title: lot.title, lot_km: km(lot.km), lot_url: lot.url,
      auction_when: auctionWhen(lot.auctionDate, now), km_limit: wanted.maxKm ? ` under ${km(wanted.maxKm)}` : '',
    });
    facts.push(`Auction car ${lot.id}: ${lot.title}, ${km(lot.km)}, grade ${lot.grade || 'not given'}${lot.auctionDate ? `, auction on ${lot.auctionDate.slice(0, 10)}` : ''}`);
    notes.push(...shortfalls(lot, o));
    if (type === 'lot_offer') {
      const pick = told.ourBidYen ? null : suggestedBid(lot, await soldComparables(lot.id).catch(() => null));
      const bidYen = told.ourBidYen || pick.bidYen;
      const estimate = bidYen ? await estimateFor(lot.id, bidYen) : null;
      if (!estimate) throw new NotNow('The cost calculator gave no figure for this car, so the offer cannot be written. Try again in a few minutes.');
      tail = offerBlock(lot, estimate, 'suggested', { websiteBidYen: lot.benchmarkYen, depositPaid: o.depositState !== 'NONE' });
      review = review || estimate.needsReview;
      facts.push(`The website's suggested bid ${yen(lot.benchmarkYen)}; bid used ${yen(bidYen)} (${pick ? 'ours' : 'yours'})`);
      if (pick) facts.push(bidBasisLine(pick));
      // A bid the owner typed in is his to choose, but he is told when the customer will see a higher one.
      if (!pick && lot.benchmarkYen > bidYen) notes.push(`The bid you gave (${yen(bidYen)}) is below the suggested bid the customer will see on the car's page (${yen(lot.benchmarkYen)}).`);
      facts.push(`Estimated landed and complied ${money(estimate.totalAud)} from the website's calculator`);
      notes.push(`The bid and costs were read from the live auction at ${formatSydney(now).split(', ').pop()}. They move with the exchange rate: press Refresh figures if this is sent much later.`);
    }
  }

  if (type === 'bid_lost' || type === 'bid_lost_stock') {
    const bid = told.ourBidYen || w.targetBidYen || 0;
    if (!told.ourBidYen && w.targetBidYen) notes.push('Our bid is taken from the target bid on the order. Check it is what we really bid.');
    v.lot_name = lotName(o) || carWanted;
    v.our_bid = bid ? yen(bid) : '[OUR BID?]';
    v.outcome = told.passedIn ? t.snippets.passed_in || 'it was passed in'
      : fill(t.snippets[told.soldYen ? 'missed' : 'outcome_unknown'] || 'the vehicle sold for {sold_for}', { sold_for: told.soldYen ? yen(told.soldYen) : '[SOLD PRICE?]' });
    if (type === 'bid_lost_stock') {
      const cars = stockMatches(o);
      if (!cars.length) throw new NotNow(`No ${carWanted} is in our own stock in Japan or on the way. Choose "${MESSAGES.bid_lost}" instead.`);
      Object.assign(v, {
        stock_count: cars.length === 1 ? `one ${carWanted}` : `${cars.length === 2 ? 'two' : cars.length} ${carWanted} vehicles`,
        stock_match: cars.length === 1 ? 'matches' : 'match',
        arriving: fill(t.snippets.arriving || '', { arrival_date: told.arrival || '[ARRIVAL DATE?]' }).replace(/^They are/, cars.length === 1 ? 'It is' : 'They are'),
        alternatives: cars.map((c, i) => fill(t.snippets.alternative || '{n}. {title}', { n: i + 1, title: c.title || carTitle(c), grade: c.auctionGrade || 'not recorded', km: km(c.odometer), url: c.status === 'PUBLISHED' && c.url ? c.url : '' }).trim()).join('\n\n'),
      });
      facts.push(`From our stock list: ${cars.map((c) => `stock ${c.stockNo}`).join(', ')}`);
    }
  }

  if (type === 'stock_priced') {
    const car = told.stockNo ? getVehicleByStock(told.stockNo) : null;
    if (told.stockNo && !car) notes.push(`Stock ${told.stockNo} is not in the stock list.`);
    Object.assign(v, {
      stock_title: car ? car.title || carTitle(car) : '[WHICH CAR?]',
      stock_lines: car ? [car.engineCc ? `Engine: ${Number(car.engineCc).toLocaleString('en-AU')}` : '', car.auctionGrade ? `Grade: ${car.auctionGrade}` : '', car.odometer ? `Odo: ${Number(car.odometer).toLocaleString('en-AU')}` : ''].filter(Boolean).join('\n') || null : null,
      purchase_price: told.purchaseYen ? yen(told.purchaseYen) : '[PURCHASE PRICE?]',
      landed_price: told.landedAud ? money(told.landedAud) : '[LANDED PRICE?]',
      model: car?.model || v.model,
    });
    if (car) facts.push(`From our stock list: stock ${car.stockNo}`);
  }

  if (type === 'secured') {
    const c = o.car || {};
    v.car_lines = [c.km ? km(c.km) : '', c.grade ? `Auction Grade ${c.grade}` : '', c.colour ? colourOf(c.colour) : ''].filter(Boolean).join('\n') || null;
    v.winning_price = told.winYen ? yen(told.winYen) : '[WINNING PRICE?]';
    v.stage_lines = stageLines(o, 'VEHICLE_SECURED') || null;
    v.if_stage_lines = !!v.stage_lines;
  }

  if (type === 'shipping_booked' || type === 'on_the_water') {
    Object.assign(v, { ship: told.ship || '[SHIP?]', sailing_date: told.sailing || '[SAILING DATE?]', arrival_date: told.arrival || '[ARRIVAL DATE?]' });
    v.stage_lines = stageLines(o, 'SHIPPING_COMPLIANCE') || null;
    v.if_stage_lines = !!v.stage_lines;
  }
  if (type === 'arrived') {
    v.ready_date = told.ready || '[READY DATE?]';
    v.stage_lines = stageLines(o, 'SHIPPING_COMPLIANCE') || null;
  }
  if (type === 'refund') v.refund_date = told.refund || '[DATE?]';
  if (type === 'progress_update') {
    const code = stageOf(o).code;
    const key = { shipping: 'where_japan', transit: 'where_transit', arrived: 'where_arrived', secured: 'where_secured' }[code] || 'where_searching';
    v.where = t.snippets[key] || '[CHECK?]';
    v.next_step = told.next || '[NEXT STEP?]';
  }
  if (o.money.lines.length || paid) facts.push(`From the order: ${[asked ? `deposit asked ${money(asked)}` : '', paid ? `deposit paid ${money(paid)}` : '', o.money.total ? `charged ${money(o.money.total)}` : '', o.money.paid ? `paid ${money(o.money.paid)}` : '', o.money.due > 0 ? `still due ${money(o.money.due)}` : ''].filter(Boolean).join(', ')}`);

  const text = [fillParts(part, v), tail].filter(Boolean).join('\n\n');
  return { text, facts, notes, review };
}

/** Blanks in a finished message, such as [SOLD PRICE?]. Each kind once. */
export const blanksIn = (text) => [...new Set(String(text || '').match(/\[[A-Z][A-Z0-9 &'/-]{1,30}\?\]/g) || [])];

/**
 * Writes one message for an auction order and keeps it as the suggestion for that order.
 * `facts` is what the owner typed into "Add what you know". No AI request is made.
 */
export async function draftOrderMessage(item, { type, facts = '', now = Date.now(), save = true } = {}) {
  const o = item.order;
  const base = { itemKey: item.itemKey, anchorKey: item.anchorKey, situation: type, instruction: facts, context: { channel: 'auction', message: type, stage: stageOf(o).code } };
  try {
    if (!MESSAGES[type]) throw new NotNow('Choose which message to write first.');
    const { text, facts: used, notes, review } = await composeMessage(o, type, { told: factsIn(facts), now });
    const reply = restore(text, item.lead);
    const blanks = blanksIn(reply);
    const left = unfilled(reply);
    const checks = [
      ...(left.length ? [{ level: 'fail', code: 'template', tokens: left, message: `The wording file has ${left.length === 1 ? 'a word' : 'words'} in curly brackets that Wheelman cannot fill in: ${left.join(', ')}. Check voice/${FILE}.` }] : []),
      ...(blanks.length ? [{ level: 'input', code: 'marker', tokens: blanks, message: 'Fill in the highlighted parts before sending.' }] : []),
      ...(review ? [{ level: 'input', code: 'auction-review', tokens: [], message: 'The cost calculator marks this car for a manual check (tax or import limits). Confirm the figures before sending.' }] : []),
      ...notes.map((n) => ({ level: 'warn', code: 'auction', tokens: [], message: n })),
    ];
    if (!checks.length) checks.push({ level: 'ok', code: 'ok', tokens: [], message: 'Written from your wording, with the figures from your records.' });
    const d = { ...base, status: 'ready', reply, needsHuman: [], factsUsed: used, checks, provider: 'none', model: 'your wording', exampleIds: [] };
    if (save) d.id = insertDraft(d);
    return d;
  } catch (e) {
    const expected = e instanceof NotNow;
    const error = expected ? e.message : `This message could not be written: ${e.message}`;
    if (!expected) logLine('auction', `${item.itemKey} ${type}: ${e.message}`);
    const d = { ...base, status: 'failed', reply: '', error, checks: [{ level: 'fail', code: 'error', message: error }] };
    if (save) d.id = insertDraft(d);
    return d;
  }
}

// ---- a reply to what the customer wrote (the one place an AI is asked) ------------------------

/**
 * The order's amounts, each under a marker. The AI is given the markers and what they mean,
 * never the figures; code puts the figures into its reply afterwards, the way the customer's
 * first name is handled. Returns [{ name, value, means }], only for amounts that exist.
 */
export function orderTokens(o) {
  const m = o.money || {};
  const asked = m.quotedDeposit || m.lines?.find((l) => l.stage === 'INITIAL_DEPOSIT')?.amount || 0;
  const w = o.wanted || {};
  const out = [
    ['DEPOSIT_ASKED', asked, 'the refundable deposit we ask for before bidding'],
    ['DEPOSIT_PAID', m.depositPaid, 'the deposit they have paid'],
    ['TOTAL', m.total, 'everything charged on the order so far'],
    ['PAID', m.paid, 'everything they have paid so far'],
    ['DUE', m.due, 'what is still to pay on the order'],
    ...(m.lines || []).map((l, i) => [`CHARGE_${i + 1}`, l.amount, `the charge for "${l.description}"`]),
    ['BUDGET', w.budgetAud, 'the landed budget they gave us'],
    ['TARGET_BID', w.targetBidYen, 'the bid in yen they asked us to work to', true],
  ];
  return out.filter(([, value]) => Number(value) > 0)
    .map(([name, value, means, inYen]) => ({ name, value: Number(value), means, text: inYen ? yen(value) : money(value) }));
}

const digitsOf = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',?');

/** Replaces every amount of the order that appears in a text with its marker, however it is written ($9,400, 9400.00). */
export function maskAmounts(text, tokens) {
  let t = String(text ?? '');
  const seen = new Set();
  // The larger amounts first, so that 1,500 inside 21,500 is never matched on its own.
  for (const { name, value } of [...tokens].sort((a, b) => b.value - a.value)) {
    for (const n of new Set([Math.floor(value), Math.round(value)])) {
      if (n < 100 || seen.has(n)) continue;
      seen.add(n);
      t = t.replace(new RegExp(String.raw`(?<![\d.,])(?:AUD\s?)?[$¥]?\s?${digitsOf(n)}(?:\.\d{1,2})?(?![\d]|,\d)`, 'g'), `{{${name}}}`);
    }
  }
  return t;
}

/** Puts the order's amounts back where their markers are. */
export function restoreAmounts(text, tokens) {
  let t = String(text ?? '');
  for (const { name, text: figure } of tokens) t = t.replaceAll(`{{${name}}}`, figure);
  // A marker written straight after a currency sign must not double it.
  return t.replace(/([$¥])\s?(?=[$¥])/g, '');
}

/**
 * What the AI is told about an auction order when it writes a reply to the customer. No name,
 * phone, email or amount is in it. `tokens` are the amounts, kept here; `trustedText` is what a
 * reply may state (used by the checks on this computer, never sent).
 */
export function planOrderReply(item) {
  const o = item.order;
  const tokens = orderTokens(o);
  const w = o.wanted || {};
  const safe = (s) => redact(String(s || ''), item.lead).replace(/\s+/g, ' ').trim();
  const stage = stageOf(o);
  const lot = o.lot;
  const found = o.watch?.lot || null;
  const wanted = [[wantedCar(w), w.variant].filter(Boolean).join(' '), w.modelCode ? `model code ${w.modelCode}` : '',
    w.yearFrom ? (w.yearTo && w.yearTo !== w.yearFrom ? `years ${w.yearFrom} to ${w.yearTo}` : `year ${w.yearFrom}${w.yearTo === w.yearFrom ? '' : ' or newer'}`) : '',
    w.targetBidYen ? 'they gave a target bid ({{TARGET_BID}})' : '', w.budgetAud ? 'they gave a landed budget ({{BUDGET}})' : ''].filter(Boolean).join('; ');
  const deposit = { NONE: 'not paid yet', PARTIAL: 'part paid' }[o.depositState] || 'paid';
  const lines = [
    'This customer has an auction order with us: we find a car for them at auction in Japan, bid on it once they approve, and import and comply it. They wrote to us on WhatsApp, and their message was typed in for you.',
    `Where the order has got to: ${stage.label}.`,
    wanted ? `What they asked us to find: ${wanted}.` : '',
    w.notes ? `Their own notes on the order: ${maskAmounts(safe(w.notes), tokens).slice(0, 500)}` : '',
    `The refundable deposit: ${deposit}.`,
    lot ? `The auction car on the order: ${lotName(o)}${lot.km ? `, ${km(lot.km)}` : ''}${lot.grade ? `, auction grade ${lot.grade}` : ''}${lot.auctionDate ? `, auction on ${lot.auctionDate}` : ''}${lotPageUrl(o) ? `. Its page: ${lotPageUrl(o)}` : ''}.` : '',
    !lot && found ? `A matching car seen in the coming auctions: ${found.title}${found.km ? `, ${km(found.km)}` : ''}${found.grade ? `, auction grade ${found.grade}` : ''}${found.auctionDate ? `, auction on ${String(found.auctionDate).slice(0, 10)}` : ''}. Its page: ${found.url}. It has not been offered to them unless the conversation shows it.` : '',
    !lot && !found && o.stage === 'INITIAL_DEPOSIT' && o.watch ? `When the live auction was last looked at, no suitable ${wantedCar(w)} was in the coming auctions.` : '',
    o.car ? `The car secured for them: ${carTitle(o.car)}${o.car.km ? `, ${km(o.car.km)}` : ''}${o.car.grade ? `, auction grade ${o.car.grade}` : ''}${o.car.colour ? `, ${tidy(o.car.colour).toLowerCase()}` : ''}. ${{ japan: 'Our stock record shows it is still in Japan.', transit: 'Our stock record shows it has left Japan and is on its way to Australia.', arrived: 'Our stock record shows it has arrived in Australia.', online: 'Our stock record shows it is at our yard.' }[String(o.car.stockIn || '').toLowerCase()] || ''}`.trim() : '',
    o.note ? `Latest staff note on the order (internal, the customer did not see it): ${maskAmounts(safe(o.note.body), tokens).slice(0, 300)}` : '',
    '',
    tokens.length ? 'Amounts on the order are given to you as markers, not figures. Where an amount belongs, write its marker exactly as shown, and the figure is put in for you:' : 'No amounts are recorded on the order.',
    ...tokens.map((t) => `- {{${t.name}}}: ${t.means}`),
    'Never write a dollar figure of your own for anything on the order. For an amount with no marker, write [AMOUNT?].',
    'Not on the order, so never state or guess them: the ship, sailing and arrival dates, when the car will be ready, and the result of an auction. Use [DATE?] or [CHECK?] and say we will confirm.',
    'Their deposit link is not available to you. If the reply needs it, write [DEPOSIT LINK?] on a line of its own.',
    'Do not ask which vehicle they mean, and do not thank them for an enquiry: they are an existing customer. Do not offer an inspection at our yard for a car that is still in Japan or at sea.',
    'We never place a bid without their approval. Before bidding, our team in Japan inspects the car and sends photos and the auction sheet.',
  ].filter((l, i, all) => l || (i > 0 && all[i - 1]));
  const trustedText = [tokens.map((t) => `${t.text} ${Math.round(t.value)}`).join('\n'), lines.join('\n')].join('\n');
  return { stage: 'order', tail: '', lines, tokens, trustedText, mask: (text) => maskAmounts(text, tokens) };
}

/**
 * Keeps the Auction section ready without anyone asking: looks at the live auction for orders
 * that are still searching (each at most once an hour, a few per round), and writes the message
 * that is due for any order that has none yet. No AI is asked.
 * `build` is buildOrderItem, passed in so this module and items.js do not import each other.
 */
export async function prepareOrders(build, { now = Date.now(), maxWatch = 4 } = {}) {
  let watched = 0, written = 0;
  for (const o of listOrders({ now })) {
    if (o.closed || o.stage !== 'INITIAL_DEPOSIT' || watched >= maxWatch || now - (o.watchedAt || 0) < 60 * 60 * 1000) continue;
    try { await watchOrder(o, now); watched++; } catch (e) { logLine('auction', `order ${o.id}: the live auction could not be read. ${e.message}`); break; }
  }
  for (const o of listOrders({ now })) {
    const item = build(o.id, { now });
    if (!item || item.orderStatus.kind !== 'send') continue;
    const have = latestDraft(item.itemKey, item.anchorKey);
    // One that could not be written (the auction was unreachable, say) is tried again after half an hour.
    if (have && !(have.status === 'failed' && now - have.created_at > 30 * 60 * 1000)) continue;
    const d = await draftOrderMessage(item, { type: item.message, now });
    if (d.status === 'ready') written++;
  }
  return { ordersWatched: watched, orderMessagesWritten: written };
}
