// Read-only client for the website's live Japan auction feed.
//
// Safety: this module can ask for exactly four things, and nothing else.
//   1. the list of cars in the coming auctions (GET)
//   2. one car (GET)
//   3. what similar cars sold for at recent auctions, for one car (GET)
//   4. the landed-cost estimate for one car at a given bid (the website's own calculator)
// The calculator is asked with a POST because that is how the website asks it. It only works
// out a figure: it places no bid, makes no enquiry and changes nothing. Only the bid amount is
// sent. No login, no cookies and no customer detail ever goes to this feed.

import { config } from './config.js';

const LIST = '/auc/api/public/auction-vehicles';
const ONE = /^\/auc\/api\/public\/auction-vehicles\/\d{1,12}$/;
const ESTIMATE = /^\/auc\/api\/public\/auction-vehicles\/\d{1,12}\/price-estimate$/;
const SOLD = /^\/auc\/api\/public\/auction-vehicles\/\d{1,12}\/sold-comparables$/;

export class AuctionError extends Error {
  constructor(message, status = 0) { super(message); this.status = status; }
}

function baseUrl() {
  const base = config.auction.baseUrl;
  let u;
  try { u = new URL(base); } catch { throw new AuctionError('The auction feed address is not set (AUCTION_API_URL or DASHBOARD_API_URL in the .env file).'); }
  const local = u.hostname === '127.0.0.1' || u.hostname === 'localhost';
  if (u.protocol !== 'https:' && !local) throw new AuctionError('The auction feed address must start with https://');
  return base;
}

const HEADERS = { accept: 'application/json', origin: config.site.baseUrl, referer: config.site.baseUrl + '/', 'user-agent': 'Wheelman/0.2 (read-only)' };

async function ask(pathname, { params = null, bidYen = null } = {}) {
  const calculator = bidYen !== null;
  if (calculator ? !ESTIMATE.test(pathname) : !(pathname === LIST || ONE.test(pathname) || SOLD.test(pathname))) throw new AuctionError(`Blocked: ${pathname} is not on the auction feed's read-only list`);
  const url = new URL(baseUrl() + pathname);
  for (const [k, v] of Object.entries(params || {})) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  let res;
  try {
    res = await fetch(url, calculator
      ? { method: 'POST', redirect: 'error', credentials: 'omit', headers: { ...HEADERS, 'content-type': 'application/json' }, body: JSON.stringify({ bidYen }), signal: AbortSignal.timeout(20000) }
      : { method: 'GET', redirect: 'error', credentials: 'omit', headers: HEADERS, signal: AbortSignal.timeout(20000) });
  } catch (e) {
    throw new AuctionError(`The auction feed could not be reached (${e.name === 'TimeoutError' ? 'timed out' : e.message}).`, 0);
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new AuctionError(`The auction feed returned ${res.status} for ${pathname}`, res.status);
  try { return await res.json(); } catch { throw new AuctionError(`The auction feed returned something unreadable for ${pathname}`, res.status); }
}

// ---- turning the feed's records into what Wheelman uses ---------------------------------------

const clean = (s) => (s === null || s === undefined ? '' : String(s).trim());
const slug = (s) => clean(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const int = (v) => { const n = Number(String(v ?? '').replace(/[^\d.]/g, '')); return Number.isFinite(n) && n > 0 ? Math.round(n) : 0; };
const cap = (w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : '');

const KEEP_UPPER = /^(4WD|2WD|AWD|FF|FR|RS|GT|GTS|STI|TRD|GR|SE|LE|EX|LX|VX|ZX|DX|GL|GX|SX|XL|[A-Z]{1,2}|[A-Z]\d|\d[A-Z]|4X4)$/;
// Trim words that are known to be real. The auction feed's variant is typed by hand in Japan and
// sometimes ends in garbled words; anything at the end that is not recognised is left off.
const TRIM_WORDS = new Set(('hybrid eyesight premium limited edition package selection custom turbo aero sport sports luxury leather navi safety sensing royal saloon athlete executive lounge welcab camper'
  + ' highway star spada absolute modulo style black white gold platinum advance advanced plus super grand cabin wagon van long high roof low wide body deluxe standard touring cross adventure'
  + ' elegance prestige version type line pack proud smart tourer rider autech nismo modellista kirameki golden eyes ii iii alpha').split(' '));
const known = (w) => /\d/.test(w) || KEEP_UPPER.test(w.toUpperCase()) || TRIM_WORDS.has(w.toLowerCase());

/** "HYBRID 2.0I EYESIGHT PRA UDOED" becomes "2.0i EyeSight" for a model already called Hybrid. */
export function tidyVariant(variant, model = '') {
  const said = new Set(clean(model).toLowerCase().split(/\s+/));
  const words = clean(variant).split(/\s+/).filter(Boolean).filter((w) => !said.has(w.toLowerCase()));
  while (words.length && !known(words[words.length - 1])) words.pop();
  const part = (w) => (/^eyesight$/i.test(w) ? 'EyeSight' : /^e:?hev$/i.test(w) ? 'e:HEV' : KEEP_UPPER.test(w.toUpperCase()) ? w.toUpperCase() : cap(w));
  return words.map((w) => {
    if (/^\d\.\d[A-Z]{1,2}(-[A-Z])?$/i.test(w)) return w.replace(/^(\d\.\d)([A-Za-z]+)(-[A-Za-z])?$/, (m, n, l, s) => n + l.toLowerCase() + (s ? s.toUpperCase() : ''));
    // "S-Z" and "X-BREAK": each side of the hyphen is tidied on its own.
    return w.split('-').map(part).join('-');
  }).join(' ');
}

const REAL_WORDS = /^(BOX|FIT|VAN|MAX|ONE|ACE)$/;

/**
 * A make or model as a person would write it. The website and the dashboard hold some in
 * capitals ("NOAH", "N BOX CUSTOM", "MERCEDES-BENZ"). Short codes stay as they are (BMW, LS, GT-R,
 * MR2, XV); longer plain words are given one capital.
 */
export function tidyName(name) {
  return clean(name).split(/\s+/).filter(Boolean).map((w) => w.split('-').map((p) =>
    (/^[A-Z]+$/.test(p) && (p.length >= 4 || REAL_WORDS.test(p)) ? cap(p) : p)).join('-')).join(' ');
}

/** One auction car, reduced to what a reply needs. Photo addresses and the feed's customer block are not kept. */
export function normalizeLot(raw) {
  const v = raw?.vehicle || raw;
  if (!v || !v.id) return null;
  const e = v.eligibility || {};
  const make = clean(e.make) || cap(clean(v.make));
  const model = clean(e.model) || clean(v.model);
  const modelCode = clean(v.modelCode || e.modelCode);
  const variant = tidyVariant(clean(v.auctionSheetSummary?.variant) || clean(v.variant), model);
  const year = int(v.year);
  const est = v.priceEstimate || {};
  return {
    id: String(v.id),
    year, make, model, modelCode, variant,
    title: [year || '', make, model, variant].filter(Boolean).join(' '),
    km: int(v.odometerKm),
    grade: clean(v.auctionGrade),
    fuel: clean(v.fuelType),
    engineCc: int(v.engineCc),
    drive: clean(v.driveType),
    seats: int(v.seatingCapacity),
    transmission: clean(v.transmission),
    colour: clean(v.colour),
    auctionDate: clean(v.auctionDate),
    auctionHouse: clean(v.auctionHouse),
    benchmarkYen: int(v.ssotBenchmarkBidYen),
    landedAtBenchmark: int(est.estimatedLandedAud),
    eligible: clean(e.status).toUpperCase() === 'ELIGIBLE',
    ready: clean(v.bidSubmissionStatus || 'ready').toLowerCase() === 'ready' && clean(raw?.listingStatus || 'LIVE').toUpperCase() === 'LIVE',
    needsReview: !!est.manualReviewRequired || !!est.lctRiskWarning || (est.thresholdWarnings || []).length > 0 || (est.calculationStatus && est.calculationStatus !== 'ok'),
    url: make && model && modelCode ? `${config.site.baseUrl}/live-auction/${slug(make)}/${slug(model)}/${slug(modelCode)}/${v.id}` : '',
  };
}

/** The calculator's answer for one bid: the total and its parts, in whole dollars. */
export function normalizeEstimate(raw) {
  const b = raw?.breakdown;
  if (!raw || !b || raw.calculationStatus !== 'ok') return null;
  const lines = [
    ['Auction price', b.bidAudEstimate],
    ['Japan agent fee', b.japanAgentFee],
    ['Carbarn agent fee', b.carbarnAgentFee],
    ['Shipping, logistics, duty & import charges', b.shippingLogisticsDutyAndImportCharges],
    ['Compliance package', b.compliancePackage],
    ['GST', b.gst],
    ['Luxury car tax', b.lct],
  ].filter(([, v]) => Number(v) > 0).map(([label, v]) => ({ label, aud: Math.round(Number(v)) }));
  return {
    bidYen: int(raw.bidYen),
    totalAud: int(raw.estimatedLandedAud),
    lines,
    needsReview: !!raw.manualReviewRequired || !!raw.lctRiskWarning || (raw.thresholdWarnings || []).length > 0,
  };
}

// ---- the four things that can be asked -----------------------------------------------------------

/** The cars of one make and model in the coming auctions. The feed shows the next few auction days only. */
export async function searchLots({ make, model = '', modelCode = '', yearFrom = '', maxPages = 3 } = {}) {
  if (!clean(make)) return [];
  const out = [];
  for (let page = 0; page < maxPages; page++) {
    const j = await ask(LIST, { params: { make: clean(make), model: clean(model), modelCode: clean(modelCode), yearFrom, page, size: 48 } });
    const rows = Array.isArray(j?.vehicles) ? j.vehicles : [];
    out.push(...rows.map(normalizeLot).filter(Boolean));
    if (!rows.length || out.length >= (Number(j?.total) || 0)) break;
  }
  return out;
}

export async function getLot(id) {
  if (!/^\d{1,12}$/.test(String(id))) return null;
  return normalizeLot(await ask(`${LIST}/${id}`));
}

/** What the website's calculator says a car would cost, landed and complied, at this bid. */
export async function estimateFor(id, bidYen) {
  const bid = Math.round(Number(bidYen));
  if (!/^\d{1,12}$/.test(String(id)) || !(bid >= 10000 && bid <= 100000000)) return null;
  return normalizeEstimate(await ask(`${LIST}/${id}/price-estimate`, { bidYen: bid }));
}

/** The website's "Japan auction sold prices" for one lot, reduced to what the bid rule needs. */
export function normalizeSold(raw) {
  const rows = Array.isArray(raw?.comparables) ? raw.comparables : [];
  return {
    matchLevel: clean(raw?.matchLevel),
    benchmarkYen: int(raw?.benchmarkYen),
    comparables: rows.map((c) => ({ year: int(c?.year), km: int(c?.odometerKm), grade: clean(c?.grade), variant: clean(c?.variant), soldYen: int(c?.soldPriceYen) })).filter((c) => c.soldYen > 0),
  };
}

/** What up to ten similar cars sold for at recent auctions, as the website shows for this lot. */
export async function soldComparables(id) {
  if (!/^\d{1,12}$/.test(String(id))) return null;
  const j = await ask(`${LIST}/${id}/sold-comparables`);
  return j ? normalizeSold(j) : null;
}

/** The lot number in a live-auction page link, or ''. */
export function lotIdFromUrl(text) {
  const m = String(text || '').match(/carbarn\.com\.au\/live-auction\/[^\s/]+\/[^\s/]+\/[^\s/]+\/(\d{4,12})/i);
  return m ? m[1] : '';
}
