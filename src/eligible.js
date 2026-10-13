// Read-only client for the website's list of import-eligible models, and the matchers that find
// which of them an email is about.
//
// Safety: this module can ask the website for exactly two things, with GET, and nothing else:
//   1. the list of eligible models (the same list the website's importing page shows)
//   2. one model's headline figures
// No login, no cookies, and no customer detail ever goes to the website. The list is kept in a
// file beside the database and read again once a day, so a question costs no request at all.

import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { setMeta } from './db.js';
import { logLine } from './log.js';

const LIST = '/api/import-eligible-cars';
const ONE = '/api/import-eligible-vehicle';
const PAGE_SIZE = 100;
const MAX_PAGES = 20;
const COOLDOWN_MS = 30 * 60 * 1000;

export class SiteError extends Error {
  constructor(message, status = 0) { super(message); this.status = status; }
}

function baseUrl() {
  const base = config.site.apiUrl;
  let u;
  try { u = new URL(base); } catch { throw new SiteError('The website address is not valid (SITE_API_URL in the .env file).'); }
  const local = u.hostname === '127.0.0.1' || u.hostname === 'localhost';
  if (u.protocol !== 'https:' && !local) throw new SiteError('The website address must start with https://');
  return base;
}

const HEADERS = { accept: 'application/json', 'user-agent': 'Wheelman/0.2 (read-only)' };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/** GET one of the two addresses. Anything else is refused before a request is made. */
async function ask(pathname, params = {}) {
  if (pathname !== LIST && pathname !== ONE) throw new SiteError(`Blocked: ${pathname} is not on the website's read-only list`);
  const url = new URL(baseUrl() + pathname);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  let res;
  try {
    res = await fetch(url, { method: 'GET', redirect: 'error', credentials: 'omit', headers: HEADERS, signal: AbortSignal.timeout(20000) });
  } catch (e) {
    throw new SiteError(`The website could not be reached (${e.name === 'TimeoutError' ? 'timed out' : e.message}).`, 0);
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new SiteError(`The website returned ${res.status} for ${pathname}`, res.status);
  try { return await res.json(); } catch { throw new SiteError(`The website returned something unreadable for ${pathname}`, res.status); }
}

// ---- turning the website's records into what Wheelman keeps ---------------------------------------

const clean = (s) => (s === null || s === undefined ? '' : String(s).replace(/\s+/g, ' ').trim());
const money = (v) => { const n = Number(String(v ?? '').replace(/[^\d.-]/g, '')); return Number.isFinite(n) && n > 0 ? Math.round(n) : 0; };
const yearOf = (s) => { const m = String(s || '').match(/(\d{4})/); return m ? Number(m[1]) : 0; };

/** "1/2004 to 10/2026" as { text, fromYear, toYear }. */
export function parseYearRange(text) {
  const t = clean(text);
  const m = t.match(/(\d{1,2}\/)?(\d{4})\s*(?:to|-|–)\s*(\d{1,2}\/)?(\d{4})/);
  return { text: t, fromYear: m ? Number(m[2]) : yearOf(t), toYear: m ? Number(m[4]) : yearOf(t) };
}

// The cost lines the website gives, in its own words. Only the ones with a figure are kept.
const COST_LINES = [
  ['avgPriceAud', 'Average auction price'],
  ['nichiboAgentFeeAud', 'Japan agent fee'],
  ['carbarnAgentFeeAud', 'Carbarn agent fee'],
  ['internationalFreightAud', 'International freight'],
  ['customsElectronicEntryFeeAud', 'Customs entry fee'],
  ['bmsbHeatTreatmentFeeAud', 'Heat treatment (BMSB)'],
  ['deliveryAud', 'Delivery'],
  ['shippingChargeAud', 'Shipping charge'],
  ['importDutyAud', 'Import duty'],
  ['gstAud', 'GST'],
  ['lctAud', 'Luxury car tax'],
  ['compliancePackagePrice', 'Compliance package'],
];

/** One model as Wheelman keeps it. Null when the record has no make, model or page. */
export function normalizeModel(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const make = clean(raw.make), model = clean(raw.model), slug = clean(raw.slug);
  if (!make || !model || !slug) return null;
  const eligibility = (Array.isArray(raw.complianceSummary) ? raw.complianceSummary : []).map(clean).filter(Boolean);
  const said = eligibility.join(' ');
  const odo = said.match(/odometer[^.]{0,40}?(?:under|less than|below|max(?:imum)? of)\s*([\d,]+)\s*(?:km|kilomet)/i);
  const c = raw.costing && typeof raw.costing === 'object' ? raw.costing : null;
  // A costing counts only when the website calls it valid and it rests on an average auction
  // price: a total with no price behind it is a placeholder, not an estimate.
  const valid = !!(c && c.validCosting !== false && money(c.totalLandedPriceAud) && money(c.avgPriceAud) && money(c.totalLandedPriceAud) >= money(c.avgPriceAud));
  const costing = valid ? {
    rate: Number(c.jpyToAudRate) || 0,
    avgPriceJpy: money(c.avgPriceJpy), avgPriceAud: money(c.avgPriceAud),
    lines: COST_LINES.map(([k, label]) => ({ label, aud: money(c[k]) })).filter((l) => l.aud > 0),
    totalAud: money(c.totalLandedPriceAud),
    depositAud: money(c.auctionDepositAmountAud), depositJpy: money(c.auctionDepositAmount),
    compliancePackageAud: money(c.compliancePackagePrice),
    criterion: clean(c.complianceCriterion),
  } : null;
  return {
    id: Number(raw.id) || 0,
    make, model, modelCode: clean(raw.modelCode).toUpperCase(),
    title: clean(raw.title) || `${make} ${model} ${clean(raw.modelCode)}`.trim(),
    slug, url: `${config.site.baseUrl}/importing/${slug}`,
    yearRange: parseYearRange(raw.yearRange),
    bodyType: clean(raw.bodyType), fuelType: clean(raw.fuelType), seats: Number(raw.seats) || 0,
    engine: clean(raw.engine), transmission: clean(raw.transmission), drivetrain: clean(raw.drivetrain),
    status: clean(raw.status),
    compliancePrice: money(raw.compliancePrice),
    eligibility,
    odometerLimitKm: odo ? money(odo[1]) : 0,
    engines: [...new Set((said.match(/\b\d[A-Z]{1,3}(?:-[A-Z]{2,4})?\b/g) || []).concat(clean(raw.engine).split(/[,\s]+/)).filter((e) => isEngine(e)))],
    priceOnRequest: !!raw.priceOnRequest || !valid,
    costing,
    sevs: [...new Set((Array.isArray(raw.sevs) ? raw.sevs : []).map((s) => clean(s && typeof s === 'object' ? (s.sevNumber || s.sevsNumber || s.number) : s)).filter((s) => /^SEV-\d+$/i.test(s)))],
    mres: (Array.isArray(raw.mres) ? raw.mres : []).map((m) => ({ number: clean(m?.mreNumber), buildFrom: clean(m?.mreBuildStart), buildTo: clean(m?.mreBuildEnd) })).filter((m) => m.number),
  };
}

/** One model's headline figures, as the website's own page shows them. */
export function normalizeVehicle(raw) {
  const v = raw && typeof raw === 'object' && raw.ok !== false ? (raw.vehicle || raw) : null;
  if (!v || !clean(v.modelCode)) return null;
  return {
    make: clean(v.make), model: clean(v.model), modelCode: clean(v.modelCode).toUpperCase(), slug: clean(v.slug),
    url: v.slug ? `${config.site.baseUrl}/importing/${clean(v.slug)}` : '',
    yearRange: parseYearRange(v.yearRange),
    estimatedAud: money(v.estimatedPrice), vehicleAud: money(v.vehiclePrice), shippingAud: money(v.shippingCost),
    customsAud: money(v.customsCost), agentFeeAud: money(v.agentFee), depositAud: money(v.auctionDepositAmountAud), complianceAud: money(v.compliancePrice),
  };
}

// ---- the daily list ------------------------------------------------------------------------------

let cache = { path: '', mtime: 0, data: null };
let inflight = null;
let failedAt = 0;

/** The list as last read from the website: { models, fetchedAt, stale }. Empty when never read. */
export function loadEligibleModels(now = Date.now()) {
  const file = config.importQuery.modelsPath;
  let stat = null;
  try { stat = fs.statSync(file); } catch { /* not read yet */ }
  if (!stat) return { models: [], fetchedAt: null, stale: true };
  if (cache.path !== file || cache.mtime !== stat.mtimeMs || !cache.data) {
    let data = null;
    try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { data = null; }
    cache = { path: file, mtime: stat.mtimeMs, data: data && Array.isArray(data.models) ? data : { models: [], fetchedAt: null } };
  }
  const { models, fetchedAt } = cache.data;
  return { models, fetchedAt: fetchedAt || null, stale: !fetchedAt || now - fetchedAt > config.importQuery.modelsMaxAgeMs };
}

/**
 * Reads the whole list from the website and keeps it in the models file. Never throws: a failure
 * keeps the old file, is noted, and is not tried again for half an hour. One read at a time.
 */
export async function refreshEligibleModels({ force = false, now = Date.now() } = {}) {
  if (inflight) return inflight;
  if (!force && now - failedAt < COOLDOWN_MS) return { ok: false, error: 'tried a short while ago', requests: 0 };
  inflight = (async () => {
    let requests = 0;
    try {
      const models = [];
      let page = 1;
      let pages = 1;
      do {
        requests++;
        const j = await ask(LIST, { page, size: PAGE_SIZE, sortMode: 'sold-desc' });
        const rows = Array.isArray(j?.content) ? j.content : [];
        models.push(...rows.map(normalizeModel).filter(Boolean));
        pages = Math.min(MAX_PAGES, Number(j?.page?.totalPages) || 1);
        if (!rows.length) break;
        page++;
        if (page <= pages) await pause(150);
      } while (page <= pages);
      if (!models.length) throw new SiteError('The eligible-models list came back empty.');
      fs.mkdirSync(path.dirname(config.importQuery.modelsPath), { recursive: true });
      fs.writeFileSync(config.importQuery.modelsPath, JSON.stringify({ fetchedAt: now, count: models.length, models }));
      cache = { path: '', mtime: 0, data: null };
      setMeta('eligible_models_fetched_at', now);
      failedAt = 0;
      return { ok: true, count: models.length, requests };
    } catch (e) {
      failedAt = now;
      logLine('import', `The website's eligible-models list could not be read: ${e.message}`);
      return { ok: false, error: e.message, requests };
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Reads the list again when it is older than a day (or was never read). */
export async function refreshEligibleModelsIfStale({ now = Date.now() } = {}) {
  const { fetchedAt } = loadEligibleModels(now);
  if (fetchedAt && now - fetchedAt < config.importQuery.modelsMaxAgeMs) return { ok: true, fresh: true, requests: 0 };
  return refreshEligibleModels({ now });
}

/** For the status line: how many models are known and how old the list is. */
export function eligibleModelsInfo(now = Date.now()) {
  const { models, fetchedAt, stale } = loadEligibleModels(now);
  return { count: models.length, fetchedAt, stale };
}

/** One model's figures from the website, for a model the list shows as price on request. Null when it has none. */
export async function lookupVehicle({ make, model, modelCode, year = '' }) {
  if (!clean(make) || !clean(model) || !clean(modelCode)) return null;
  return normalizeVehicle(await ask(ONE, { make: clean(make), model: clean(model), modelCode: clean(modelCode), year }));
}

// ---- finding the model an email is about --------------------------------------------------------

// A model code looks like GDH206, ZRR80, AGH30W, JF3, RU3, ZN6: letters and digits, three to eight long.
const CODE_SHAPE = /^(?=[A-Z0-9]{3,8}$)(?=.*\d)(?=.*[A-Z])(?:[A-Z]{1,3}\d{1,3}[A-Z]{0,2}|\d{1,3}[A-Z]{1,3})$/;
// Things that look like a code but are not one: kilometres, drive, engines, taxes, times, series names.
const NOT_A_CODE = /^(?:\d{1,3}K|[24]WD|AWD|4X4|V(?:6|8|10|12)|I\d|[A-Z]\d|Q[1-9]|H[12]|\d{1,2}(?:AM|PM)|GST|ABN|ACN|VIN|JPY|AUD|USD|NZD|MP\d|USB|3D|4K|8K|COVID\d*|R\d{1,2}|RX\d|GT\d|GTR|M\d|\d{2,4}(?:CC|HP|KW|NM|KG|MM|CM|KM|L|CM3))$/;
// An engine code: 1GD, 2TR-FE, 1KD-FTV. A figure with a unit (4WD, 2L, 80K, 3HP) is not one.
const ENGINE = /^\d[A-Z]{1,3}(?:-[A-Z]{2,4})?$/;
const UNIT = /^\d(?:WD|L|LT|K|KM|KMS|HP|KW|D|DR|X|G|T|MM|CM|KG|S|ST|ND|RD|TH|AM|PM|YR|HR|M|MIN)$/;
const isEngine = (w) => ENGINE.test(w) && !UNIT.test(w);

const tokens = (text) => String(text || '')
  .replace(/https?:\/\/\S+/g, ' ').replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, ' ').replace(/\b(?:SEV|MRE)-\d+\b/g, ' ')
  .split(/[^A-Za-z0-9-]+/).map((t) => t.replace(/^-+|-+$/g, '')).filter(Boolean);

/**
 * Model codes in a text. known: codes on the list (any case: "gdh206" counts), with their models.
 * unknown: code-shaped words, upper-case in the original, that are not on the list. engines: engine codes.
 */
export function modelCodesIn(text, models) {
  const byCode = new Map();
  for (const m of models) { if (!byCode.has(m.modelCode)) byCode.set(m.modelCode, []); byCode.get(m.modelCode).push(m); }
  const names = new Set(models.flatMap((m) => [m.make, ...m.model.split(/\s+/)]).map((w) => w.toUpperCase()));
  const known = new Map();
  const unknown = new Set();
  const engines = new Set();
  for (const raw of tokens(text)) {
    const up = raw.toUpperCase();
    if (byCode.has(up)) { known.set(up, byCode.get(up)); continue; }
    if (raw !== up) continue; // a code is written in capitals; "gdh206" counted above only because the list knows it
    if (isEngine(up)) { engines.add(up); continue; }
    if (UNIT.test(up)) continue;
    if (!CODE_SHAPE.test(up) || NOT_A_CODE.test(up) || names.has(up) || /\d{5,}/.test(up)) continue;
    unknown.add(up);
  }
  return { known: [...known].map(([code, rows]) => ({ code, models: rows })), unknown: [...unknown], engines: [...engines] };
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Makes and models named in a text, as families: { make, model, members, best, score }. "N-Box",
 * "N box" and "nbox" all find the N-Box. A short or numeric model name ("86", "RX") needs its make.
 */
export function modelsIn(text, models, { codes = [] } = {}) {
  const t = ` ${norm(text)} `;
  const words = new Set(t.trim().split(/\s+/));
  const coded = new Set(codes);
  const families = new Map();
  for (const m of models) {
    const make = norm(m.make);
    const parts = norm(m.model).split(' ').filter(Boolean);
    if (!parts.length) continue;
    const joined = parts.join('');
    const hasMake = t.includes(` ${make} `);
    const first = parts[0];
    // The whole name, as written ("n box", "n-box") or run together ("nbox"), counts on its own.
    const fullHit = parts.length > 1 && (t.includes(` ${parts.join(' ')} `) || words.has(joined));
    const firstHit = words.has(first) || fullHit;
    const codeHit = coded.has(m.modelCode);
    if (!firstHit && !codeHit) continue;
    // A short or numeric name on its own ("86", "Q7", "RX") needs its make to count.
    if (firstHit && !codeHit && !fullHit && (first.length < 4 || /^\d+$/.test(first)) && !hasMake) continue;
    let score = codeHit ? 3 : 0;
    if (firstHit) score += 2;
    for (const p of parts.slice(1)) score += words.has(p) || words.has(joined) ? 0.5 : -0.25;
    if (hasMake) score += 1;
    const key = `${make}|${parts.join(' ')}`;
    if (!families.has(key)) families.set(key, { make: m.make, model: m.model, members: [], score: 0 });
    const f = families.get(key);
    f.members.push(m);
    f.score = Math.max(f.score, score);
  }
  const out = [...families.values()].sort((a, b) => b.score - a.score).slice(0, 3);
  for (const f of out) {
    f.members = f.members.sort((a, b) => Number(coded.has(b.modelCode)) - Number(coded.has(a.modelCode)) || Number(!!b.costing) - Number(!!a.costing)).slice(0, 6);
    f.best = f.members[0];
  }
  return out;
}
