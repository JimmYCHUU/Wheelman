// The research behind a reply to an import email: which model the customer means, whether it can
// be imported, what it lands for, the deposit, the timeline, and what could not be found. Every
// figure comes from the website's eligible-models list (read once a day), its importing pages, and
// the live auction, each with the page it came from, so the reply can give the link.
//
// The owner's rule for these emails: the reply carries the exact answer, or the sentence with a
// blank and a note of what was looked up. Never "we will check and get back to you".

import { config } from './config.js';
import { loadWebsiteChunks, relevantWebsite, importPageDetails } from './knowledge.js';
import { loadEligibleModels, refreshEligibleModelsIfStale, modelCodesIn, modelsIn, lookupVehicle } from './eligible.js';
import { specificsIn } from './imports.js';
import { searchLots } from './auction.js';
import { getMeta, setMeta } from './db.js';
import { sydneyDay, formatSydney } from './time.js';
import { logLine } from './log.js';

const dollars = (n) => `$${Math.round(Number(n) || 0).toLocaleString('en-AU')}`;
const yen = (n) => `¥${Math.round(Number(n) || 0).toLocaleString('en-AU')}`;
const km = (n) => `${Math.round(Number(n) || 0).toLocaleString('en-AU')} km`;

// The general facts an import email may need, picked from the saved guide pages by their headings.
const GENERAL = [
  { key: 'deposit_table', label: 'The refundable auction deposit, by auction value', source: /how-importing-works/, heading: /^Deposit for Import Eligible Model/i },
  { key: 'deposit_rules', label: 'How we bid, and the deposit rules', source: /how-importing-works/, heading: /^How We Bid on Your Behalf/i },
  { key: 'deposit_what', label: 'What the refundable auction deposit is', source: /how-importing-works/, heading: /^What is the refundable auction deposit/i },
  { key: 'timeline', label: 'The full timeline and the payment stages', source: /how-importing-works/, heading: /^Full Process Timeline/i },
  { key: 'timeline_weeks', label: 'How long importing usually takes', source: /how-importing-works/, heading: /^How long does importing a car from Japan usually take/i },
  { key: 'timeline_delays', label: 'What can delay the timeline', source: /how-importing-works/, heading: /^What can delay the import timeline/i },
  { key: 'after_win', label: 'What happens after a winning bid', source: /how-importing-works/, heading: /^What happens after I win an auction bid/i },
  { key: 'payment_stages', label: 'When the shipping and compliance invoices come', source: /how-importing-works/, heading: /^When do shipping and compliance payments start/i },
  { key: 'secured', label: 'When the car is secured in Japan', source: /how-importing-works/, heading: /^Vehicle Secured in Japan/i },
  { key: 'via', label: 'VIA approval', source: /how-(importing|compliance)-works/, heading: /^(What is )?VIA Approval\??$/i },
  { key: 'warranty_extended', label: 'The 5-year extended warranty', source: /how-importing-works/, heading: /^5-Year Extended Warranty/i },
  { key: 'things_to_know', label: 'Things to know before bidding', source: /how-importing-works/, heading: /^Things to Know/i },
  { key: 'four_ways', label: 'The four ways to buy', source: /how-importing-works/, heading: /^Four Ways to Buy/i },
  { key: 'post_arrival', label: 'Compliance after the car arrives', source: /how-compliance-works/, heading: /^Stage 2: Post-Arrival/i },
  { key: 'compliance_only', label: 'Compliance only, for a car already bought', source: /how-compliance-works/, heading: /^Does compliance-only service include warranty/i },
  { key: 'documents', label: 'Documents needed for compliance', source: /how-compliance-works/, heading: /^Documents Required/i },
  { key: 'estimate_how', label: 'How the landed estimate is worked out', source: /live-auction/, heading: /^(Estimated Landed and Complied Cost|How is the estimated landed and complied price calculated)/i },
  { key: 'estimate_not_final', label: 'The estimate is not final', source: /live-auction/, heading: /^Is the estimated landed price always 100% final/i },
  { key: 'eligibility_first', label: 'Why eligibility comes first', source: /live-auction/, heading: /^(Why Import Eligibility Comes First|Can every Japanese auction car be imported)/i },
  { key: 'twenty_five_year', label: 'The 25-year rule (from a blog post on our site)', source: /blog\//, heading: /^The 25-Year Rule/i, authority: 'blog' },
];

// What a question is about, and which general facts ride along with it.
const TOPICS = [
  { key: 'eligibility', re: /eligib|allowed|legal|can (i|we|you) (import|bring)|importable|sevs|25.year|compl(y|iance|iant)|approved|import (it|this|that|one|a |an |the )/i, facts: ['eligibility_first', 'via'] },
  { key: 'cost', re: /cost|price|landed|how much|budget|total|fee|gst|duty|lct|estimate|quote|afford/i, facts: ['estimate_how', 'estimate_not_final'] },
  { key: 'deposit', re: /deposit|refund/i, facts: ['deposit_table', 'deposit_what', 'deposit_rules'] },
  { key: 'timeline', re: /how long|timeline|time ?frame|weeks|months|when (would|will|can|do|does)|arriv|eta\b|lead time/i, facts: ['timeline', 'timeline_weeks', 'timeline_delays'] },
  { key: 'payment', re: /\bpay|invoice|instal|upfront|balance|wise\b|exchange|currency/i, facts: ['after_win', 'payment_stages', 'things_to_know'] },
  { key: 'warranty', re: /warrant/i, facts: ['warranty_extended'] },
  { key: 'compliance_only', re: /already (have|bought|own|purchased)|compliance only|my own car|comply (my|it)|just (the )?compliance|bring my/i, facts: ['compliance_only', 'documents', 'post_arrival'] },
  { key: 'process', re: /how (does|do) (it|this|you|the process) work|process|steps|what happens|how it works|walk me through/i, facts: ['four_ways', 'deposit_rules', 'timeline'] },
  { key: 'availability', re: /available|in stock|coming up|at auction|this week|next auction|any (of these|available)/i, facts: [] },
];

let general = { at: 0, byKey: new Map() };

/** The text cut to about `max` characters, at the end of a sentence or a line where there is one. */
function trimAt(text, max) {
  const t = String(text || '').trim();
  if (t.length <= max) return t;
  const head = t.slice(0, max);
  const cut = Math.max(head.lastIndexOf('. '), head.lastIndexOf('.\n'), head.lastIndexOf('\n'));
  return (cut > max * 0.5 ? head.slice(0, cut + 1) : head).trim();
}

/** The general facts, from the saved guide pages, keyed. Rebuilt every ten minutes at most. */
function generalFacts() {
  if (Date.now() - general.at < 10 * 60 * 1000) return general.byKey;
  const byKey = new Map();
  const chunks = loadWebsiteChunks();
  for (const g of GENERAL) {
    const c = chunks.find((x) => g.source.test(x.source) && g.heading.test(x.heading));
    if (!c) continue;
    byKey.set(g.key, { key: g.key, label: g.label, text: trimAt(c.text.replace(/\s+\n/g, '\n'), 480), source: c.source, authority: g.authority || 'website' });
  }
  general = { at: Date.now(), byKey };
  return byKey;
}

/** Which topics a text touches. */
export function topicsIn(text) {
  return TOPICS.filter((t) => t.re.test(String(text || ''))).map((t) => t.key);
}

// ---- the daily cap on live requests --------------------------------------------------------------

function underDailyCap(now) {
  const key = `import_research:${sydneyDay(now)}`;
  const n = Number(getMeta(key, 0)) || 0;
  if (n >= config.importQuery.researchDaily) return false;
  setMeta(key, n + 1);
  return true;
}

// ---- one model, written up --------------------------------------------------------------------

const fitLines = (m, s, now) => {
  const out = [];
  const yr = m.yearRange;
  if (s.yearFrom && yr.fromYear && yr.toYear) {
    const inside = s.yearFrom >= yr.fromYear && s.yearFrom <= yr.toYear;
    out.push(`They asked for ${s.yearTo && s.yearTo !== s.yearFrom ? `${s.yearFrom} to ${s.yearTo}` : `${s.yearFrom} or newer`}: ${inside ? 'inside' : 'outside'} the approved build range ${yr.text}.`);
  }
  if (s.budgetAud && m.costing) out.push(`Their budget of ${dollars(s.budgetAud)} ${s.budgetAud >= m.costing.totalAud ? 'covers' : 'is below'} the estimated landed total of ${dollars(m.costing.totalAud)}.`);
  if (s.maxKm && m.odometerLimitKm) out.push(`They want under ${km(s.maxKm)}: the approved pathway itself requires under ${km(m.odometerLimitKm)}.`);
  if (yr.toYear && yr.toYear < new Date(now).getFullYear() - 25) out.push('This model is more than 25 years old, so the 25-year rule may apply as well.');
  return out;
};

function modelEntry(m, specifics, now) {
  return {
    code: m.modelCode, make: m.make, model: m.model, title: m.title, url: m.url,
    yearRange: m.yearRange.text, eligibility: m.eligibility, engines: m.engines, odometerLimitKm: m.odometerLimitKm,
    seats: m.seats, bodyType: m.bodyType, fuelType: m.fuelType, sevs: m.sevs, mres: m.mres,
    costing: m.costing, priceOnRequest: m.priceOnRequest,
    fit: fitLines(m, specifics, now),
    auction: null,
    source: 'the eligible-models list on our website',
    savedAt: null,
  };
}

/** A model from a saved importing page, when the website's list could not be read. */
function pageEntry(p, specifics, now) {
  const m = {
    modelCode: p.modelCode, make: p.make, model: p.model, title: p.title, url: p.url,
    yearRange: { text: p.yearRange, fromYear: p.fromYear, toYear: p.toYear },
    eligibility: p.eligibility, engines: [], odometerLimitKm: p.odometerLimitKm, seats: 0, bodyType: '', fuelType: '', sevs: p.sevs, mres: [],
    costing: p.totalAud ? { lines: [], totalAud: p.totalAud, depositAud: p.depositAud, avgPriceAud: 0, avgPriceJpy: 0, depositJpy: 0, compliancePackageAud: p.complianceAud, criterion: '' } : null,
    priceOnRequest: p.priceOnRequest || !p.totalAud,
  };
  return { ...modelEntry(m, specifics, now), source: `the importing page saved on ${p.savedAt || 'an earlier day'}`, savedAt: p.savedAt || null };
}

// ---- the research itself -------------------------------------------------------------------------

/**
 * Researches one import email. Never throws: whatever could not be read is noted in the record.
 * @returns { at, fetchedAt, stale, asked: { codes, families, specifics, topics }, models, general, website, notFound, notes, requests, blanks }
 */
export async function researchFor(item, { instruction = '', now = Date.now() } = {}) {
  const record = {
    at: now, fetchedAt: null, stale: false,
    asked: { codes: { known: [], unknown: [], engines: [] }, families: [], specifics: specificsIn(''), topics: [] },
    models: [], general: [], website: [], notFound: [], notes: [], requests: { site: 0, auction: 0 }, blanks: [],
  };
  try {
    const subject = item.mail?.subject || '';
    const text = [subject, item.pendingText || '', instruction || ''].filter(Boolean).join('\n');
    record.asked.topics = topicsIn(text);
    record.asked.specifics = specificsIn(text);
    const live = underDailyCap(now);
    if (live) {
      const r = await refreshEligibleModelsIfStale({ now });
      record.requests.site += r?.requests || 0;
      if (r && r.ok === false && r.error && r.error !== 'tried a short while ago') record.notes.push(`The website's eligible-models list could not be read (${r.error}).`);
    } else record.notes.push('The day\'s allowance of live website requests is used up: only the list already on this computer and the saved pages were used.');
    const { models, fetchedAt, stale } = loadEligibleModels(now);
    record.fetchedAt = fetchedAt;
    record.stale = stale;
    if (stale && fetchedAt) record.notes.push(`The eligible-models list on this computer was last read ${formatSydney(fetchedAt)}; the website could not be read again today.`);

    const codes = modelCodesIn(text, models);
    record.asked.codes = { known: codes.known.map((k) => k.code), unknown: codes.unknown, engines: codes.engines };
    const families = modelsIn(text, models, { codes: codes.known.map((k) => k.code) });
    record.asked.families = families.map((f) => `${f.make} ${f.model}`);

    // The models to write up: every code named, then the best of each family named, up to three.
    // A code the list has twice (a van and its Welcab or campervan version) is written up once,
    // as the version the customer's words fit, with the other named in a line.
    const picked = [];
    const alsoUnder = new Map();
    for (const k of codes.known) {
      const [first, ...rest] = sameCode(k.models, text);
      if (first && !picked.includes(first)) picked.push(first);
      if (rest.length) alsoUnder.set(first, rest);
    }
    for (const f of families) if (f.best && !picked.some((m) => m.modelCode === f.best.modelCode)) picked.push(f.best);
    for (const m of picked.slice(0, 3)) {
      const entry = modelEntry(m, record.asked.specifics, now);
      entry.alsoUnder = (alsoUnder.get(m) || []).map((o) => ({ title: o.title, url: o.url }));
      if (m.priceOnRequest && live) {
        try {
          record.requests.site++;
          const v = await lookupVehicle({ make: m.make, model: m.model, modelCode: m.modelCode, year: record.asked.specifics.yearFrom || '' });
          if (v && v.estimatedAud) entry.costing = { lines: [], totalAud: v.estimatedAud, depositAud: v.depositAud, avgPriceAud: v.vehicleAud, avgPriceJpy: 0, depositJpy: 0, compliancePackageAud: v.complianceAud, criterion: '' };
          if (entry.costing) entry.priceOnRequest = false;
        } catch (e) { record.notes.push(`The website could not give a figure for ${m.title} (${e.message}).`); }
      }
      if (entry.priceOnRequest) { record.notFound.push({ what: `A landed cost for the ${m.title}`, looked: ['the eligible-models list (price on request: no recent sold data)', `its page ${m.url}`], blank: '[LANDED COST?]' }); record.blanks.push('[LANDED COST?]'); }
      // A snapshot of the live auction, when the question is about cost or what is coming up, or a code was named.
      const wantsAuction = config.importQuery.auctionSnapshot && live && (codes.known.length || record.asked.topics.includes('cost') || record.asked.topics.includes('availability'));
      if (wantsAuction && record.requests.auction < 2) {
        try {
          record.requests.auction++;
          const lots = (await searchLots({ make: m.make, model: m.model, modelCode: m.modelCode, maxPages: 1 })).filter((l) => l.eligible && l.ready);
          const landed = lots.map((l) => l.landedAtBenchmark).filter((n) => n > 0);
          const dates = lots.map((l) => l.auctionDate).filter(Boolean).sort();
          entry.auction = { count: lots.length, cheapestLandedAud: landed.length ? Math.min(...landed) : 0, nextAuctionDate: dates[0] || '', url: `${config.site.baseUrl}/live-auction/${slug(m.make)}/${slug(m.model)}/${slug(m.modelCode)}` };
        } catch (e) { record.notes.push(`The live auction could not be read for ${m.title} (${e.message}).`); }
      }
      record.models.push(entry);
    }

    // Nothing on the list for a code or a name the customer gave: the saved pages, then a blank.
    const looked = [models.length ? `the eligible-models list (${models.length} models${fetchedAt ? `, read ${formatSydney(fetchedAt)}` : ''})` : 'the eligible-models list (not readable)', 'the importing pages saved on this computer'];
    for (const code of codes.unknown) {
      const p = importPageDetails({ modelCode: code });
      if (p) { record.models.push(pageEntry(p, record.asked.specifics, now)); continue; }
      record.notFound.push({ what: `Model code ${code}`, looked, blank: '[ELIGIBILITY?]' });
      record.blanks.push('[ELIGIBILITY?]');
    }
    if (!record.models.length && !codes.unknown.length) {
      // A make or model named with nothing on the list: the saved pages may still know it.
      const guess = importPageDetails({ text });
      if (guess) record.models.push(pageEntry(guess, record.asked.specifics, now));
      else if (/\b(import|eligib|landed|auction)/i.test(text)) { record.notFound.push({ what: 'The model they asked about', looked, blank: '[ELIGIBILITY?]' }); record.blanks.push('[ELIGIBILITY?]'); }
    }
    if (!models.length && record.models.some((m) => m.savedAt)) record.notes.push('Figures come from pages saved on this computer, not from the website today.');

    // General facts: for the topics asked, and always the deposit table, the timeline and the estimate caveat with a costed model.
    const facts = generalFacts();
    const keys = new Set(TOPICS.filter((t) => record.asked.topics.includes(t.key)).flatMap((t) => t.facts));
    if (record.models.some((m) => m.costing)) for (const k of ['deposit_table', 'timeline_weeks', 'estimate_not_final']) keys.add(k);
    if (record.models.some((m) => m.fit.some((f) => /25-year/.test(f))) || /25.year/i.test(text)) keys.add('twenty_five_year');
    for (const k of keys) if (facts.has(k)) record.general.push(facts.get(k));
    record.general = record.general.slice(0, 6);
    // The timeline and the deposit bands are also business facts, which the request always carries;
    // when neither says, the blanks table tells the AI to write [TIMELINE?] or [DEPOSIT?].

    // Other passages of the guide pages that bear on the words used, apart from what is already here.
    // Blog posts are left out: their figures are for other models and other days.
    const have = new Set(record.general.map((g) => g.text.slice(0, 80)));
    record.website = relevantWebsite(text, 6).filter((w) => !have.has(w.text.slice(0, 80)) && !/\/blog\//.test(w.source)).slice(0, 3);
    record.blanks = [...new Set(record.blanks)];
  } catch (e) {
    record.notes.push(`Research stopped early: ${e.message}`);
    logLine('import', `${item.itemKey}: research stopped early. ${e.message} | ${String(e.stack || '').split('\n').slice(1, 3).join(' ')}`);
  }
  return record;
}

const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/**
 * The models the list keeps under one code, in the order to write them up: the one whose extra
 * name words ("Welcab", "Campervan") the customer used first, then the plainest name, then the
 * ones with a costing.
 */
function sameCode(models, text) {
  const said = ` ${String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `;
  const extra = (m) => m.model.toLowerCase().split(/\s+/).filter((w) => w.length > 2 && !/^(hiace|van|wagon|class)$/.test(w));
  const named = (m) => extra(m).filter((w) => said.includes(` ${w} `)).length;
  return [...models].sort((a, b) => named(b) - named(a) || a.model.split(/\s+/).length - b.model.split(/\s+/).length || Number(!!b.costing) - Number(!!a.costing));
}

// ---- what the AI and the page are given ------------------------------------------------------

/**
 * The record written up: lines for the AI, the lines of what could not be found, the text every
 * figure and link in them may be checked against, and the notes the page shows.
 */
export function renderResearch(record) {
  const lines = [];
  const found = [];
  const sources = [];
  const list = record.fetchedAt ? `our website's eligible-models list, read ${formatSydney(record.fetchedAt)}` : 'the importing pages saved on this computer';
  lines.push(`Looked up ${formatSydney(record.at)} from ${list}, its importing pages and the live auction. Every figure and link below is ours to state, and for this model it is the figure to give: where a general business fact says a person decides a deposit or a cost, the figure here is that decision, read from our own website. Give the page link with the model.`);
  for (const m of record.models) {
    lines.push(`\nMODEL: ${m.title} (model code ${m.code})\nModel page: ${m.url}`);
    sources.push({ label: `${m.title} on our website`, url: m.url });
    const rules = m.eligibility.map((s) => s.trim().replace(/[.;]*$/, '.')).join(' ');
    lines.push(`- Eligible for import to Australia: approved build range ${m.yearRange || 'not stated'}.${rules ? ` ${rules}` : ''}${m.engines.length ? ` Engines: ${m.engines.join(', ')}.` : ''}${m.odometerLimitKm ? ` Odometer must be under ${km(m.odometerLimitKm)}.` : ''}${m.seats ? ` Seats: ${m.seats}.` : ''}${m.sevs.length ? ` SEVS approval ${m.sevs.slice(0, 3).join(', ')}.` : ''}`);
    if (m.alsoUnder?.length) lines.push(`- The same model code is also listed as ${m.alsoUnder.map((o) => `${o.title} (${o.url})`).join(' and ')}; mention it only if their words fit that version.`);
    found.push(`${m.title}: eligible, build range ${m.yearRange || 'not stated'}${m.odometerLimitKm ? `, odometer under ${km(m.odometerLimitKm)}` : ''}.`);
    if (m.costing) {
      const c = m.costing;
      const parts = c.lines.length ? c.lines.map((l) => `${l.label.toLowerCase()} ${dollars(l.aud)}`).join(', ') : '';
      lines.push(`- Estimated landed and complied cost, GST and duties included: ${dollars(c.totalAud)}${c.avgPriceAud ? `, based on an average auction price of ${dollars(c.avgPriceAud)}${c.avgPriceJpy ? ` (${yen(c.avgPriceJpy)})` : ''}` : ''}${parts ? `. Made up of: ${parts}` : ''}. It is an estimate: the final cost depends on the auction result, grade, odometer, options and the exchange rate.`);
      found.push(`Estimated landed total ${dollars(c.totalAud)}${c.compliancePackageAud ? `, compliance package ${dollars(c.compliancePackageAud)}` : ''}.`);
      if (c.depositAud) { lines.push(`- Refundable auction deposit to start sourcing this model: ${dollars(c.depositAud)}${c.depositJpy ? ` (${yen(c.depositJpy)})` : ''}. Fully refunded if no car is secured, or reusable for another.`); found.push(`Refundable auction deposit ${dollars(c.depositAud)}.`); }
    } else {
      lines.push('- Landed cost: price on request on our website (no recent sold data), so there is no estimate to give. Use [LANDED COST?] for it, and give the deposit band from the deposit table if they ask about the deposit.');
      found.push('No landed estimate: the model is price on request on the website.');
    }
    for (const f of m.fit) lines.push(`- For this customer: ${f}`);
    if (m.auction) {
      lines.push(m.auction.count
        ? `- At auction now: ${m.auction.count} ${m.title} lot${m.auction.count === 1 ? '' : 's'} coming up${m.auction.cheapestLandedAud ? `, the cheapest estimated at ${dollars(m.auction.cheapestLandedAud)} landed` : ''}${m.auction.nextAuctionDate ? `, next auction ${String(m.auction.nextAuctionDate).slice(0, 10)}` : ''}: ${m.auction.url}`
        : `- At auction now: none of this model in the coming auctions (${m.auction.url}).`);
      found.push(m.auction.count ? `${m.auction.count} at auction now${m.auction.cheapestLandedAud ? `, from ${dollars(m.auction.cheapestLandedAud)} landed` : ''}.` : 'None at auction right now.');
    }
    if (m.savedAt) lines.push(`- (From the page saved ${m.savedAt}; the website's list could not be read today.)`);
  }
  for (const g of record.general) {
    lines.push(`\nGENERAL, ${g.label}${g.authority === 'blog' ? ' (a blog post: state it as the general rule, not as this car\'s eligibility)' : ''}, from ${g.source}:\n${g.text}`);
    if (!sources.some((s) => s.url === g.source)) sources.push({ label: g.label, url: g.source });
  }
  const notFoundLines = record.notFound.map((n) => `- ${n.what}: not found in ${n.looked.join(' or ')}. Write the sentence with ${n.blank} and say what it stands for. Do not say we will check.`);
  const notFound = record.notFound.map((n) => `${n.what}: not found in ${n.looked.join(' or ')}.`);
  if (!record.models.length && !record.notFound.length) {
    lines.push('\nNo particular model was named. Answer the question from the general facts, and ask which model (make, model and model code if they know it) they have in mind.');
  }
  // Every figure and link above is ours to state. Other passages of the website are background:
  // a figure in them belongs to another model or another day, and is not for this reply.
  const trustedText = [...lines, ...notFoundLines].join('\n');
  if (record.website.length) {
    lines.push('\nOther passages of our website that bear on the question. Background only: a figure in them belongs to another model or another day. State no figure from them.');
    for (const w of record.website) lines.push(`\nFROM OUR WEBSITE, ${w.heading} (${w.source}):\n${w.text}`);
  }
  return {
    lines,
    notFoundLines,
    trustedText,
    websiteText: record.website.map((w) => w.text).join('\n'),
    panel: { found, notFound, notes: record.notes, sources, readAt: record.at, listReadAt: record.fetchedAt, stale: record.stale, blanks: record.blanks },
  };
}
