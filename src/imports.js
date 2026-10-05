// Import and auction enquiries.
//
// A customer asks us to find a car from Japan. Three things can happen:
//   ask    we do not know what they are after yet, so the reply asks for it;
//   offer  we know enough, so the live auction is searched, the best car is chosen, the
//          website's calculator is asked what it would cost landed, and the offer is laid out;
//   none   we searched and nothing suitable is in the coming auctions.
// The figures in an offer (the car, the suggested bid, each line of the cost) are put in by code
// from the auction feed, never written by the AI. The deposit link is left as a blank for a person.

import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { getAuctionOrder } from './db.js';
import { readImportForm } from './text.js';
import { searchLots, getLot, estimateFor, lotIdFromUrl } from './auction.js';
import { formatSydney, formatDay } from './time.js';

const money = (n) => `$${Math.round(n).toLocaleString('en-AU')}`;
const yen = (n) => `¥${Math.round(n).toLocaleString('en-AU')}`;

// ---- who is an import customer --------------------------------------------------------------

/** What is known about a lead's import or auction request, or null when it is an ordinary lead. */
export function importContext(lead) {
  if (!lead) return null;
  const forms = [...(lead.inquiries || [])].sort((a, b) => (a.at || 0) - (b.at || 0)).map((i) => readImportForm(i.text, i)).filter(Boolean);
  const onImportsList = String(lead.platform || '').toUpperCase() === config.dashboard.importsPlatform;
  if (!onImportsList && !forms.length) return null;
  const order = lead.id ? getAuctionOrder(lead.id) : null;
  return { kind: forms[forms.length - 1]?.kind || (order ? 'auction' : 'import'), forms, order };
}

// ---- what they are looking for ----------------------------------------------------------------

const AMOUNT = String.raw`\d{1,3}(?:[,.]\d{3})+|\d{4,7}|\d{1,3}(?:\.\d)?\s?k\b`;
const toNum = (s) => { const t = String(s).toLowerCase().replace(/[,\s$]/g, ''); const n = parseFloat(t); return Number.isFinite(n) ? Math.round(/k$/.test(t) ? n * 1000 : n) : 0; };
const gradeNumber = (g) => { const n = parseFloat(String(g || '')); return Number.isFinite(n) ? n : /^s$/i.test(String(g || '').trim()) ? 6 : 0; };

/** The figures a customer gave in their own words: budget, kilometres, years, grade, a bid in yen. */
export function specificsIn(text) {
  let t = ` ${String(text || '').replace(/[’‘]/g, "'")} `;
  const out = { budgetAud: 0, maxKm: 0, yearFrom: 0, yearTo: 0, minGrade: 0, bidYen: 0 };

  let m = t.match(new RegExp(String.raw`(?:¥|\bjpy|\byen)\s?(${AMOUNT})`, 'i')) || t.match(new RegExp(String.raw`(${AMOUNT})\s?(?:yen|jpy)\b`, 'i'));
  if (m) { const n = toNum(m[1]); if (n >= 10000) out.bidYen = n; t = t.replace(m[0], ' '); }

  // "under 100,000 km", "80k kms", "k's less than 100,000"
  m = t.match(new RegExp(String.raw`(${AMOUNT})\s?(?:km|kms|klms?|kilomet(?:re|er)s?|k's|ks)\b`, 'i'))
    || t.match(new RegExp(String.raw`(?:\bk's|\bkms?\b|\bklms?\b|kilomet\w*|odometer|\bodo\b|mileage)[^.\n\d]{0,30}(${AMOUNT})`, 'i'));
  if (m) { const n = toNum(m[1]); if (n >= 5000 && n <= 400000) out.maxKm = n; t = t.replace(m[0], ' '); }

  const Y = String.raw`(19[89]\d|20[0-3]\d)`;
  if ((m = t.match(new RegExp(String.raw`\b${Y}\s*(?:-|–|to|and)\s*${Y}\b`)))) { out.yearFrom = Math.min(+m[1], +m[2]); out.yearTo = Math.max(+m[1], +m[2]); }
  else if ((m = t.match(new RegExp(String.raw`\b${Y}\s*(?:or newer|or later|or above|onwards|and newer|and up|and above|\+)`, 'i')))) out.yearFrom = +m[1];
  else if ((m = t.match(new RegExp(String.raw`\b(?:newer than|later than|after)\s+(?:a |an |my |the )?${Y}\b`, 'i')))) out.yearFrom = +m[1] + 1;
  else if ((m = t.match(new RegExp(String.raw`\b(?:from|since)\s+${Y}\b`, 'i')))) out.yearFrom = +m[1];

  m = t.match(new RegExp(String.raw`(?:budget|payout|spend|afford|landed|price range|up to|around|about|under|below|max(?:imum)?|no more than)[^.\n\d]{0,30}\$?\s?(${AMOUNT})`, 'i'))
    || t.match(new RegExp(String.raw`\$\s?(${AMOUNT})`, 'i'));
  if (m) { const n = toNum(m[1]); if (n >= 3000 && n <= 500000) out.budgetAud = n; }

  if ((m = t.match(/\bgrade\s*(?:of\s*)?(\d(?:\.5)?)\b/i))) out.minGrade = parseFloat(m[1]);
  return out;
}

/** What our staff said the customer wants, in a Rewrite instruction. A dollar figure counts only when it is called a budget. */
function toldBy(instruction) {
  const told = specificsIn(instruction);
  if (!/\b(budget|spend|landed|afford)/i.test(String(instruction || ''))) told.budgetAud = 0;
  told.bidYen = 0; // a bid typed by staff is handled where the bid is chosen
  return told;
}

const DETAILS = [
  ['year', 'your preferred year range'],
  ['odometer', 'maximum odometer'],
  ['grade', 'preferred grade or specification'],
  ['budget', 'approximate landed budget in Australia'],
  ['extras', 'any colour or feature preferences you have'],
];
const listOf = (a) => (a.length <= 1 ? a.join('') : a.length === 2 ? a.join(' and ') : `${a.slice(0, -1).join(', ')}, and ${a[a.length - 1]}`);

/**
 * What the customer wants found, from three places: the auction request our staff keep for them,
 * the website form they filled in, and their own words in the conversation. What our staff type
 * into Rewrite ("2015 or newer, under 100,000 km, budget 12k") comes first: it is how a phone
 * call is passed on.
 */
export function wantedFrom(item, instruction = '') {
  const ctx = item.imports;
  const o = { ...(ctx?.order?.wanted || {}) };
  const forms = ctx?.forms || [];
  const fromForms = (k) => { for (let i = forms.length - 1; i >= 0; i--) if (forms[i][k]) return forms[i][k]; return ''; };
  const theirWords = [...item.timeline.filter((e) => e.who === 'customer').map((e) => e.text || ''), o.notes || ''].join('\n');
  const said = specificsIn(theirWords);
  const told = toldBy(instruction);
  for (const k of ['maxKm', 'minGrade']) if (told[k]) said[k] = told[k];
  for (const k of ['yearFrom', 'yearTo', 'budgetAud']) if (told[k]) { o[k] = told[k]; if (k === 'yearFrom' && !told.yearTo) o.yearTo = 0; }

  let make = o.make || fromForms('make');
  let model = o.model || fromForms('model');
  if (!make) { const [first, ...rest] = String(fromForms('car')).split(/\s+/); make = first || ''; model = model || rest.join(' '); }
  const w = {
    make, model,
    modelCode: o.modelCode || fromForms('modelCode'),
    car: [make, model].filter(Boolean).join(' '),
    yearFrom: o.yearFrom || said.yearFrom, yearTo: o.yearTo || said.yearTo,
    maxKm: said.maxKm || fromForms('maxKm') || 0,
    budgetAud: o.budgetAud || said.budgetAud,
    ceilingAud: fromForms('ceilingAud') || 0, // the form's budget box is a wide band, not a figure
    minGrade: said.minGrade || gradeNumber(fromForms('grade')),
    bidYen: said.bidYen,
    lotId: ctx?.order?.lotId || '',                         // a particular auction car they asked for a bid on
    lotBidYen: ctx?.order?.lotId ? o.targetBidYen || 0 : 0,
  };
  w.given = [(w.yearFrom || w.yearTo) && 'year', w.maxKm && 'odometer', w.minGrade && 'grade', w.budgetAud && 'budget', w.bidYen && 'bid'].filter(Boolean);
  w.missing = DETAILS.filter(([k]) => !w.given.includes(k)).map(([, phrase]) => phrase);
  return w;
}

/** One line saying what they asked for, for the AI. */
function wantedLine(w) {
  const bits = [];
  if (w.yearFrom && w.yearTo && w.yearFrom !== w.yearTo) bits.push(`years ${w.yearFrom} to ${w.yearTo}`);
  else if (w.yearFrom) bits.push(`year ${w.yearFrom}${w.yearTo === w.yearFrom ? '' : ' or newer'}`);
  if (w.maxKm) bits.push(`under ${w.maxKm.toLocaleString('en-AU')} km`);
  if (w.minGrade) bits.push(`auction grade ${w.minGrade} or better`);
  if (w.budgetAud) bits.push(`a landed budget of about ${money(w.budgetAud)}`);
  return bits.length ? bits.join('; ') : 'no particular year, kilometres or budget given';
}

// ---- choosing a car from the live auction -------------------------------------------------------

/** The bid Wheelman suggests: Carbarn's suggested bid, rounded up to the next step for a stronger chance. */
export function suggestedBid(benchmarkYen, step = config.auction.bidStepYen) {
  const s = Math.max(1000, Number(step) || 50000);
  return Math.ceil(Number(benchmarkYen) / s) * s;
}

/**
 * The best car for what the customer asked, or null.
 * Cars with a repaired or unknown grade (R, RA, ***, -) go last. Then: within the budget (a car
 * inside it comes before one a little above it), under the kilometres asked, inside the years
 * asked; then the better grade, the lower kilometres.
 * A car far over the budget (more than half as much again) is not offered at all.
 */
export function chooseLot(lots, w) {
  const slack = 1 + config.auction.budgetSlack;
  const budget = w.budgetAud || w.ceilingAud || 0;
  const rows = (lots || [])
    .filter((l) => l && l.eligible && l.ready && !l.needsReview && l.benchmarkYen > 0 && l.landedAtBenchmark > 0)
    .filter((l) => !w.yearFrom || !l.year || l.year >= w.yearFrom)
    .filter((l) => !budget || l.landedAtBenchmark <= budget * 1.5)
    .map((l) => ({
      l,
      t: [
        gradeNumber(l.grade) >= Math.max(3, w.minGrade || 0) ? 0 : 1,
        !budget || l.landedAtBenchmark <= budget ? 0 : l.landedAtBenchmark <= budget * slack ? 1 : 2,
        w.maxKm && l.km > w.maxKm ? 1 : 0,
        w.yearTo && l.year > w.yearTo ? 1 : 0,
        w.modelCode && l.modelCode && l.modelCode.toUpperCase() !== w.modelCode.toUpperCase() ? 1 : 0,
      ],
    }));
  rows.sort((a, b) => {
    for (let i = 0; i < a.t.length; i++) if (a.t[i] !== b.t[i]) return a.t[i] - b.t[i];
    return gradeNumber(b.l.grade) - gradeNumber(a.l.grade) || a.l.km - b.l.km || b.l.year - a.l.year || a.l.id.localeCompare(b.l.id);
  });
  return rows[0]?.l || null;
}

/** How the chosen car compares with what was asked, in plain statements the AI may rely on. */
function fitLines(lot, estimate, w) {
  const out = [];
  if (w.yearFrom) out.push(lot.year >= w.yearFrom && (!w.yearTo || lot.year <= w.yearTo) ? `Year ${lot.year}: inside what they asked.` : lot.year > (w.yearTo || 0) ? `Year ${lot.year}: newer than they asked for.` : `Year ${lot.year}: older than they asked for.`);
  if (w.maxKm) out.push(lot.km <= w.maxKm ? `${lot.km.toLocaleString('en-AU')} km: under the kilometres they asked for.` : `${lot.km.toLocaleString('en-AU')} km: MORE than the ${w.maxKm.toLocaleString('en-AU')} km they preferred. Do not say it is low-kilometre.`);
  if (w.budgetAud) out.push(estimate.totalAud <= w.budgetAud ? 'Estimated landed cost: within their budget.' : estimate.totalAud <= w.budgetAud * (1 + config.auction.budgetSlack) ? 'Estimated landed cost: a little above the budget they gave. Do not say it is within their budget.' : 'Estimated landed cost: ABOVE the budget they gave. Say plainly that it is above their budget.');
  if (w.minGrade) out.push(gradeNumber(lot.grade) >= w.minGrade ? `Auction grade ${lot.grade}: meets the grade they asked for.` : `Auction grade ${lot.grade}: below the grade they asked for.`);
  return out;
}

// ---- the wording kept in voice/*.md -----------------------------------------------------------------

const cache = new Map();
function template(name) {
  const file = path.join(config.voiceDir, name);
  let stat;
  try { stat = fs.statSync(file); } catch { return null; }
  const hit = cache.get(file);
  if (hit && hit.mtime === stat.mtimeMs) return hit.value;
  const lines = fs.readFileSync(file, 'utf8').replace(/^﻿/, '').replace(/\r/g, '').split('\n').filter((l) => !l.startsWith('#'));
  const snippets = {};
  const body = [];
  for (const l of lines) { const m = l.match(/^@([a-z_]+):\s*(.+)$/); if (m) snippets[m[1]] = m[2].trim(); else body.push(l); }
  const value = { text: body.join('\n').replace(/\n{3,}/g, '\n\n').trim(), snippets };
  cache.set(file, { mtime: stat.mtimeMs, value });
  return value;
}
const fill = (text, values) => String(text).replace(/\{([a-z_]+)\}/g, (m, k) => (k in values ? values[k] : m));

/** The message and the closing lines of the first reply to an import enquiry. */
export function askParts(w) {
  const t = template('import-ask.md');
  if (!t) return { message: '', closing: config.signOff };
  const [message, closing = ''] = t.text.split(/\n\s*---+\s*\n/);
  const values = { car: w.car || 'import', details: listOf(w.missing.length ? w.missing : DETAILS.map(([, p]) => p)), sender: config.firstReplySender };
  return { message: fill(message.trim(), values), closing: fill(closing.trim(), values) };
}

function vehicleLines(lot) {
  const engine = lot.engineCc >= 1000 ? `${(lot.engineCc / 1000).toFixed(1)}L ${lot.fuel}` : lot.engineCc ? `${lot.engineCc}cc ${lot.fuel}` : lot.fuel;
  return [lot.title, lot.km ? `${lot.km.toLocaleString('en-AU')} km` : '', lot.grade ? `Auction Grade ${lot.grade}` : '', engine.trim(), lot.drive, lot.seats ? `${lot.seats} seats` : ''].filter(Boolean);
}

/** Everything under the opening lines of an offer: the car, its link, the bid, the cost and the sign-off. */
export function offerBlock(lot, estimate, bidBy = 'suggested') {
  const t = template('auction-offer.md');
  if (!t) return '';
  const bid = yen(estimate.bidYen);
  return fill(t.text, {
    vehicle_lines: vehicleLines(lot).join('\n'),
    lot_url: lot.url,
    // "own" only when the customer named the bid. A bid our staff chose is still our suggestion.
    bid_sentence: fill(t.snippets[bidBy === 'customer' ? 'own' : 'suggested'] || '', { bid }),
    bid,
    total: money(estimate.totalAud),
    cost_lines: estimate.lines.map((l) => `- ${l.label}: ${money(l.aud)} AUD`).join('\n'),
    sender: config.firstReplySender,
  }).replace(/\n{3,}/g, '\n\n');
}

// ---- deciding what this reply should be ---------------------------------------------------------------

/** A particular auction car, or a bid, named in a text: a live-auction link, "lot 2006629", "bid 280000", "¥300,000". */
function named(text, { looseBid = false } = {}) {
  const t = String(text || '');
  const lot = lotIdFromUrl(t) || (t.match(/\blot\s*(?:no\.?|number|#)?\s*(\d{6,9})\b/i) || [])[1] || '';
  let bidYen = specificsIn(t).bidYen;
  if (!bidYen && looseBid) { const m = t.match(new RegExp(String.raw`\bbid\b[^.\n\d]{0,20}(${AMOUNT})`, 'i')); if (m && toNum(m[1]) >= 10000) bidYen = toNum(m[1]); }
  return { lotId: lot, bidYen };
}

/** The auction car we last sent this customer a link to. */
const lastOfferedLot = (item) => { for (let i = item.timeline.length - 1; i >= 0; i--) { const e = item.timeline[i]; if (e.who === 'us' && !e.internal) { const id = lotIdFromUrl(e.text); if (id) return id; } } return ''; };

/** True once a deposit is paid or the request has moved past its first stage: no longer an enquiry to quote. */
const underWay = (order) => !!order && ((order.depositState && order.depositState !== 'NONE') || (order.stage && order.stage !== 'INITIAL_DEPOSIT'));

/**
 * Works out what the reply to an import customer should be. Reads the live auction when needed.
 * Returns null when this is not an import enquiry, or when it is an ordinary turn of the
 * conversation that calls for no new search.
 *
 * @returns { stage: 'ask'|'offer'|'none', w, lines, tail, ... }
 *   lines  what the AI is told
 *   tail   what code adds under the AI's text (the closing block, or the whole offer)
 */
export async function planImport(item, { instruction = '', now = Date.now() } = {}) {
  const ctx = item.imports;
  if (!ctx || item.deal || item.channel === 'marketplace' || ctx.kind === 'compliance') return null;
  if (item.situation.primary === 'complaint' || underWay(ctx.order)) return null;
  const w = wantedFrom(item, instruction);
  if (!w.make) return null;

  const staff = named(instruction, { looseBid: true });
  const theirs = named(item.pendingText);
  const wantsSearch = /\b(find|search|look for|auction|another (car|one|option)|other options?)\b/i.test(instruction) || Object.values(toldBy(instruction)).some(Boolean);
  const newDetails = Object.values(specificsIn(item.pendingText)).some(Boolean);
  const pointed = staff.lotId || theirs.lotId || staff.bidYen || theirs.bidYen;

  if (!pointed) {
    // Nothing to go on yet, and we have not written: ask what they are looking for.
    if (item.isFirstReply && !w.given.length && !w.lotId) return askPlan(item, w, instruction);
    // An ordinary turn later in the conversation: no new search unless they told us something new.
    if (!item.isFirstReply && !newDetails && !wantsSearch) return null;
  }

  let lotId = staff.lotId || theirs.lotId || ((staff.bidYen || theirs.bidYen) ? lastOfferedLot(item) : '') || (!wantsSearch ? w.lotId : '');
  let lot = lotId ? await getLot(lotId) : null;
  if (lot && !lot.ready) lot = null; // the auction has passed, or bidding on it has closed
  let searched = null;
  if (!lot) {
    lotId = '';
    const lots = await searchLots({ make: w.make, model: w.model });
    searched = lots.length;
    const best = chooseLot(lots, w);
    lot = best ? (await getLot(best.id)) || best : null;
  }
  if (!lot) return nonePlan(item, w, searched);

  const ownLot = lotId && lotId === w.lotId && w.lotBidYen;
  const bidYen = staff.bidYen || theirs.bidYen || w.bidYen || (ownLot ? w.lotBidYen : 0) || suggestedBid(lot.benchmarkYen);
  const bidBy = staff.bidYen ? 'staff' : (theirs.bidYen || w.bidYen || ownLot) ? 'customer' : 'suggested';
  const estimate = await estimateFor(lot.id, bidYen);
  if (!estimate) return nonePlan(item, w, searched, 'The cost calculator gave no figure for the car that was found, so no car is offered in this reply.');

  const fit = fitLines(lot, estimate, w);
  const name = [lot.year || '', lot.make, lot.model].filter(Boolean).join(' ');
  return {
    stage: 'offer', w, lot, estimate, bidYen, bidBy, readAt: now,
    tail: offerBlock(lot, estimate, bidBy),
    opening: `Hi {{NAME}},\n\nWe’ve found a ${name} that may be worth considering.`,
    lines: [
      `This customer asked us to find a ${w.car} from the Japan auctions. What they asked for: ${wantedLine(w)}.`,
      `${lotId ? 'The auction car in question is' : `We searched the live auction (${searched} ${w.car} in the coming auctions) and chose`} this one: ${lot.title}, ${lot.km.toLocaleString('en-AU')} km, auction grade ${lot.grade || 'not given'}${lot.auctionDate ? `, at auction on ${formatDay(lot.auctionDate)}` : ''}.`,
      ...(fit.length ? ['How it compares with what they asked:', ...fit.map((f) => `- ${f}`)] : []),
      'Everything else is added below your text automatically, exactly: the car\'s details, the link to its photos, the bid, the estimated landed cost with each part, the deposit step, how we inspect before bidding, and the sign-off.',
      'So write only:',
      '- the greeting line, then',
      `- one or two short sentences: that we have found a ${name} that may be worth considering, and why it may suit them, using only the points above that fit and what they told us. If nothing fits, just say we have found it.`,
      'Do not write any price, bid, cost, kilometres, grade or link, and do not describe the next steps: the block gives all of that. Do not claim the car meets something it does not. No closing line.',
    ],
  };
}

function askPlan(item, w, instruction) {
  const { message, closing } = askParts(w);
  const wroteSomething = item.timeline.some((e) => e.who === 'customer' && String(e.text || '').trim());
  return {
    stage: 'ask', w, tail: closing,
    // When the customer only filled in the form, the message is sent as it stands: no AI is needed.
    ready: !wroteSomething && !instruction && message ? message : '',
    lines: [
      `This customer asked us to find a ${w.car || 'vehicle'} from Japan. Before we search the auctions we need to know: ${listOf(w.missing)}.`,
      'Write the reply this way:',
      `- the greeting, and thank them for their ${w.car || 'import'} enquiry;`,
      '- if they asked something in their own words, answer it in a sentence or two from the supplied facts;',
      '- ask for the details listed above, in one sentence;',
      '- say that if a particular one interests them they can send a target bid or overall budget, and we will work out an estimated landed cost before placing anything;',
      '- say that once we have those details we will keep the search focused and let them know when a suitable one comes up.',
      'Our address, phone number, opening hours and sign-off are added below your text automatically. Do not write them, and do not point to them.',
    ],
  };
}

function nonePlan(item, w, searched, why = '') {
  return {
    stage: 'none', w, tail: item.isFirstReply ? askParts(w).closing : '',
    lines: [
      `This customer asked us to find a ${w.car} from the Japan auctions. What they asked for: ${wantedLine(w)}.`,
      why || (searched ? `We searched the live auction: ${searched} ${w.car} are in the coming auctions, but none fits what they asked.` : `We searched the live auction: no ${w.car} is in the coming auctions right now. The auction list changes every day.`),
      'Say that nothing suitable is in the coming auctions at the moment, that we are keeping the search going, and that we will let them know when a suitable one comes up. Do not name or describe any particular car.',
      w.missing.length > 1 ? `If it helps the search, ask for what we still do not know: ${listOf(w.missing)}.` : '',
      item.isFirstReply ? 'Our address, phone number, opening hours and sign-off are added below your text automatically. Do not write them.' : '',
    ].filter(Boolean),
  };
}

/** A quiet line for the page: when the figures were read and when the auction is. */
export function auctionNote(plan) {
  if (plan?.stage !== 'offer') return '';
  const l = plan.lot;
  return `Auction car ${l.id}${l.auctionDate ? `, auction on ${formatDay(l.auctionDate)}` : ''}${l.auctionHouse ? ` at ${l.auctionHouse}` : ''}. The bid and costs were read from the live auction at ${formatSydney(plan.readAt).split(', ').pop()}: they move with the exchange rate, so write it again if this is sent much later.`;
}
