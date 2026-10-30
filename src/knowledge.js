// Loads business facts and website pages, and builds the fact sheet for one vehicle.

import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { availability } from './normalize.js';
import { stripEmoji } from './text.js';
import { redact } from './redact.js';
import { CLAIM, URGENCY } from './selling.js';
import { latestVersions } from './db.js';

// ---- business facts ------------------------------------------------------

/**
 * The dealer's own file when it is there; otherwise the example committed with the project. The
 * real business facts and the operations guide hold fees, terms and partners, so they stay on the
 * dealer's computer and are never committed; a fresh clone and the automated checks
 * run on the examples.
 */
export function knowledgeFile(name) {
  const real = path.join(config.knowledgeDir, `${name}.md`);
  return fs.existsSync(real) ? real : path.join(config.knowledgeDir, `${name}.example.md`);
}

/** The name the Playbook keeps the facts file's saved answers under (playbook_versions.name). */
export const FACTS_NAME = 'business-facts.md';

/**
 * The status of a saved version that puts the file's own answer back in use (an Undo of a save on
 * a fact that was the file's). It has no answer of its own: the fact is read from the file again.
 */
export const USE_FILE = 'file';

/**
 * The business facts, topic by topic in the file's order: { title, status, answer }. With `playbook`
 * (every request, the status counts and the start-up line), a topic answered in the Playbook takes
 * its newest saved status and answer, and `at`, when that was saved. A topic saved there that the
 * file lacks follows the file's topics. With nothing saved, the list is exactly the file's. The file
 * itself is only ever read.
 */
export function loadBusinessFacts(file = knowledgeFile('business-facts'), { playbook = true } = {}) {
  const raw = fs.readFileSync(file, 'utf8').replace(/\r/g, '');
  const topics = [];
  for (const block of raw.split(/\n## /).slice(1)) {
    const lines = block.split('\n');
    const title = lines[0].trim();
    const statusLine = lines.find((l) => /^Status:/i.test(l)) || '';
    const status = /needs answer/i.test(statusLine) ? 'needs_answer' : /working/i.test(statusLine) ? 'working' : /confirmed/i.test(statusLine) ? 'confirmed' : 'needs_answer';
    const start = lines.findIndex((l) => /^Answer:/i.test(l));
    let answer = '';
    if (start !== -1) {
      const body = [lines[start].replace(/^Answer:\s*/i, '')];
      for (const l of lines.slice(start + 1)) { if (/^Found:/i.test(l) || /^---\s*$/.test(l)) break; body.push(l); }
      answer = body.join('\n').trim();
    }
    const usable = status !== 'needs_answer' && answer.length > 0;
    topics.push({ title, status: usable ? status : 'needs_answer', answer: usable ? answer : '' });
  }
  return playbook ? withPlaybook(topics) : topics;
}

/**
 * The file's topics with the Playbook's newest saved version of each laid over it. A newest version
 * that puts the file's own answer back in use (USE_FILE) lays nothing: the topic is the file's, as
 * if never saved, later hand edits included.
 */
function withPlaybook(topics) {
  const saved = new Map([...latestVersions('fact', FACTS_NAME)].filter(([, v]) => v.status !== USE_FILE));
  if (!saved.size) return topics;
  const laid = (title, v) => {
    const usable = v.status !== 'needs_answer' && v.text.length > 0;
    return { title, status: usable ? v.status : 'needs_answer', answer: usable ? v.text : '', at: v.at };
  };
  const inFile = new Set(topics.map((t) => t.title));
  const out = topics.map((t) => (saved.has(t.title) ? laid(t.title, saved.get(t.title)) : t));
  for (const [title, v] of saved) if (!inFile.has(title)) out.push(laid(title, v));
  return out;
}

/** Business facts as a request writes them: one line each, "- Title: answer". */
export const factLines = (topics) => topics.map((t) => `- ${t.title}: ${t.answer.replace(/\n+/g, ' ')}`).join('\n');

/** The business facts as a request carries them, and `topics`, the list they were read from. */
export function businessFactsForPrompt() {
  const topics = loadBusinessFacts();
  const usable = topics.filter((t) => t.status !== 'needs_answer');
  const open = topics.filter((t) => t.status === 'needs_answer');
  return {
    text: factLines(usable),
    unanswered: open.map((t) => t.title),
    counts: { confirmed: topics.filter((t) => t.status === 'confirmed').length, working: topics.filter((t) => t.status === 'working').length, needsAnswer: open.length },
    topics,
  };
}

/** The words of a text that count when it is matched to a topic: lower case, with the small words left out. */
export function factWords(text) {
  return words(text);
}

/**
 * How much a message is about one business fact: each of its words counts 2 when it is in the
 * topic's title and 1 when it is only in its answer. 2 or more is asked about (relevantFacts).
 * `titleOnly` counts the title alone, for a topic with no answer.
 */
export function topicScore(topic, query, { titleOnly = false } = {}) {
  const head = new Set(words(topic.title));
  const body = new Set(titleOnly ? [] : words(topic.answer));
  let score = 0;
  for (const w of new Set(words(query))) { if (head.has(w)) score += 2; else if (body.has(w)) score += 1; }
  return score;
}

// ---- how Carbarn works ----------------------------------------------------

/** The operations guide: everything below the first "---" line of knowledge/how-carbarn-works.md. */
export function operationsGuide(file = knowledgeFile('how-carbarn-works')) {
  if (!fs.existsSync(file)) return '';
  const raw = fs.readFileSync(file, 'utf8').replace(/\r/g, '');
  const cut = raw.indexOf('\n---');
  return (cut === -1 ? raw : raw.slice(cut + 4)).trim();
}

/**
 * The compact style's business facts: the core topics always, then the few topics whose words
 * match the message (a title word counts double), in the file's order. A topic with no confirmed
 * answer is never included. These are the topics a compact request carries.
 */
export function relevantTopics(query, { max = 5, core = ['address', 'opening hours', 'holding deposit'], topics = loadBusinessFacts() } = {}) {
  const usable = topics.filter((t) => t.status !== 'needs_answer');
  const isCore = (t) => core.some((c) => t.title.toLowerCase().includes(c.toLowerCase()));
  const ranked = [];
  usable.forEach((t, order) => {
    if (isCore(t)) return;
    const score = topicScore(t, query);
    if (score >= 2) ranked.push({ t, score, order });
  });
  ranked.sort((a, b) => b.score - a.score || a.order - b.order);
  const picked = new Set([...usable.filter(isCore), ...ranked.slice(0, max).map((r) => r.t)]);
  return usable.filter((t) => picked.has(t));
}

/** relevantTopics as the request writes them: the same lines as businessFactsForPrompt writes. */
export function relevantFacts(query, options = {}) {
  return factLines(relevantTopics(query, options));
}

/** The compact style's paragraphs of the operations guide that share two or more words with the message. */
export function relevantOperations(query, { max = 2, text = operationsGuide() } = {}) {
  const q = new Set(words(query));
  if (q.size < 2) return '';
  const ranked = [];
  String(text || '').replace(/\r/g, '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).forEach((p, order) => {
    let score = 0;
    for (const w of new Set(words(p))) if (q.has(w)) score++;
    if (score >= 2) ranked.push({ p, score, order });
  });
  ranked.sort((a, b) => b.score - a.score || a.order - b.order);
  return ranked.slice(0, max).map((r) => r.p).join('\n\n');
}

// ---- website pages -------------------------------------------------------
//
// Every page saved from carbarn.com.au is split into passages. For each customer message the few
// most relevant passages are picked. Policy pages count for more than blog posts, and rare words
// (a model name, "compliance", "roadside") count for more than common ones.

let chunks = null;
let chunksBuiltAt = 0;
let idf = new Map();
const CACHE_MS = 10 * 60 * 1000;

const STOP = new Set('a an the and or but if of to in on at for from with by is are was were be been it this that these those as we you your our us i my me do does did can could would will shall should have has had not no yes so than then there here what when where which who how why any all some more most very just about into over under out up down off also may might car cars vehicle vehicles carbarn please thanks thank hello'.split(' '));
const words = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9$ ]+/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));

function markdownFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...markdownFiles(p));
    else if (e.name.endsWith('.md')) out.push(p);
  }
  return out;
}

/** How much a passage counts, by where on the site it came from. */
function weightFor(rel) {
  const top = rel.split(/[\\/]/)[0];
  if (!/[\\/]/.test(rel)) return /^faqs-from/.test(rel) ? 1.0 : 1.5; // policy pages
  if (top === 'delivery') return 1.2;
  if (top === 'used-cars') return 0.9;
  if (top === 'importing') return 0.85;
  if (top === 'blog') return 0.75;
  return 0.8;
}

export function loadWebsiteChunks(dir = path.join(config.knowledgeDir, 'website')) {
  if (chunks && Date.now() - chunksBuiltAt < CACHE_MS) return chunks;
  const list = [];
  for (const file of markdownFiles(dir)) {
    const rel = path.relative(dir, file);
    const raw = fs.readFileSync(file, 'utf8').replace(/\r/g, '');
    const source = (raw.match(/source:\s*(\S+)/) || [])[1] || rel;
    const body = raw.replace(/<!--[\s\S]*?-->/, '');
    const weight = weightFor(rel);
    let heading = path.basename(rel, '.md').replace(/-/g, ' ');
    let buf = [];
    const flush = () => {
      const text = buf.join('\n').replace(/\n{3,}/g, '\n\n').trim();
      if (text.split(/\s+/).length >= 12) list.push({ source, heading, text: text.slice(0, 1400), weight, bag: new Set(words(heading + ' ' + text)), head: new Set(words(heading)) });
      buf = [];
    };
    for (const line of body.split('\n')) {
      const h = line.match(/^#{1,3}\s*(.*)$/);
      if (h) {
        if (!h[1].trim()) continue; // empty heading left over from page layout
        flush();
        heading = h[1].trim();
      } else buf.push(line);
    }
    flush();
  }
  const df = new Map();
  for (const c of list) for (const w of c.bag) df.set(w, (df.get(w) || 0) + 1);
  idf = new Map([...df].map(([w, n]) => [w, Math.log(1 + list.length / n)]));
  chunks = list;
  chunksBuiltAt = Date.now();
  return chunks;
}

/** The website passages most relevant to what the customer asked. */
export function relevantWebsite(query, max = 3) {
  const all = loadWebsiteChunks();
  const q = [...new Set(words(query))].filter((w) => idf.has(w));
  if (q.length < 3) return []; // too little to go on ("is it still available?")
  const total = q.reduce((s, w) => s + idf.get(w), 0);
  const scored = [];
  for (const c of all) {
    let got = 0, n = 0, inHead = 0;
    for (const w of q) if (c.bag.has(w)) { got += idf.get(w); n++; if (c.head.has(w)) inHead++; }
    if (n < 2) continue;
    const share = got / total;
    if (share < 0.4) continue;
    scored.push({ c, score: (share * Math.sqrt(n) + inHead * 0.35) * c.weight });
  }
  scored.sort((x, y) => y.score - x.score);
  const out = [];
  const seen = new Set();
  for (const s of scored) {
    const key = s.c.text.slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ source: s.c.source, heading: s.c.heading, text: s.c.text });
    if (out.length >= max) break;
  }
  return out;
}

// ---- the website's importing pages ------------------------------------------------------------

const TWO_WORD_MAKES = new Set(['alfa-romeo', 'mercedes-benz', 'land-rover', 'aston-martin', 'rolls-royce']);
let importPages = { dir: '', at: 0, list: [] };

/** One entry per saved importing page: its address, a title, and the make and model words in its name. */
function loadImportPages() {
  const dir = config.importPagesDir;
  if (importPages.dir === dir && Date.now() - importPages.at < CACHE_MS) return importPages.list;
  const list = [];
  if (fs.existsSync(dir)) {
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith('.md')) continue;
      const head = fs.readFileSync(path.join(dir, name), 'utf8').slice(0, 500).replace(/\r/g, '');
      const url = (head.match(/source:\s*(https:\/\/\S+)/) || [])[1];
      const tokens = name.replace(/\.md$/, '').toLowerCase().split('-').filter(Boolean);
      if (!url || tokens.length < 3) continue;
      const makeWords = TWO_WORD_MAKES.has(`${tokens[0]}-${tokens[1]}`) ? 2 : 1;
      const model = tokens.slice(makeWords, -1);
      if (!model.length) continue;
      // "Toyota Crown GRS182": the words of the name, with the model code in capitals.
      const title = (head.match(/^Import (.+?) \| Carbarn$/m) || [])[1]
        || [...tokens.slice(0, -1).map((t) => t[0].toUpperCase() + t.slice(1)), tokens[tokens.length - 1].toUpperCase()].join(' ');
      list.push({ url, title, make: tokens.slice(0, makeWords), model, code: tokens[tokens.length - 1] });
    }
  }
  importPages = { dir, at: Date.now(), list };
  return list;
}

/**
 * The website's importing pages for a model the customer named: "can you import a Toyota Crown?"
 * gives the Crown page. A short or numeric model name ("Fit", "X5") counts only with its make.
 */
export function importPagesFor(text, max = 2) {
  const said = new Set(String(text || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean));
  if (!said.size) return [];
  const scored = [];
  for (const p of loadImportPages()) {
    const first = p.model[0];
    if (!said.has(first)) continue;
    const makeNamed = p.make.some((m) => said.has(m));
    if (!makeNamed && (first.length < 4 || /^\d+$/.test(first))) continue;
    const matched = p.model.filter((m) => said.has(m)).length;
    scored.push({ p, score: matched + (said.has(p.code) ? 2 : 0) + (makeNamed ? 0.5 : 0) - 0.25 * (p.model.length - matched) });
  }
  return scored.sort((a, b) => b.score - a.score || a.p.url.localeCompare(b.p.url)).slice(0, max).map(({ p }) => ({ url: p.url, title: p.title }));
}

const cap = (w) => (w ? w[0].toUpperCase() + w.slice(1) : '');

/**
 * What a saved importing page says about one model, for when the website's list cannot be read:
 * the code, the approved years, the eligibility sentence, the SEVS numbers, the landed total, the
 * deposit and the compliance package, with the day the page was saved. Found by model code, or
 * else the best page for a text. Null when there is no such page.
 */
export function importPageDetails({ modelCode = '', text = '' } = {}) {
  const pages = loadImportPages();
  let p = modelCode ? pages.find((x) => x.code === String(modelCode).toLowerCase()) : null;
  if (!p && text) { const best = importPagesFor(text, 1)[0]; p = best ? pages.find((x) => x.url === best.url) : null; }
  if (!p) return null;
  let raw = '';
  try { raw = fs.readFileSync(path.join(config.importPagesDir, `${p.url.split('/').pop()}.md`), 'utf8').replace(/\r/g, ''); } catch { return null; }
  const code = p.code.toUpperCase();
  const years = raw.match(new RegExp(`^${code}\\s+(\\d{4})\\s*[-–]\\s*(\\d{4})\\s*$`, 'mi')) || [];
  const criterion = (raw.match(/approved for import to Australia under the ([^.\n]+?)\s*\./i) || [])[1];
  const money = (re) => { const m = raw.match(re); return m ? Number(m[1].replace(/,/g, '')) : 0; };
  const odo = raw.match(/odometer must be (?:less than|under|below)\s*([\d,]+)\s*(?:km|kilomet)/i);
  return {
    modelCode: code, make: p.make.map(cap).join(' '), model: p.model.map(cap).join(' '),
    title: (raw.match(/^# (.+?) Import to Australia\s*$/m) || [])[1] || p.title, url: p.url,
    yearRange: years[1] ? `${years[1]} to ${years[2]}` : '', fromYear: Number(years[1]) || 0, toYear: Number(years[2]) || 0,
    eligibility: criterion ? [`Approved for import to Australia under the ${criterion.trim()}.`] : [],
    sevs: [...new Set(raw.match(/SEV-\d{6}/g) || [])],
    totalAud: money(/Estimated Landed Total[^$]{0,80}\$([\d,]+)/i),
    depositAud: money(/Refundable Auction Deposit[^$]{0,80}\$([\d,]+)/i),
    complianceAud: money(/Compliance Package[^$]{0,80}\$([\d,]+)/i),
    odometerLimitKm: odo ? Number(odo[1].replace(/,/g, '')) : 0,
    priceOnRequest: /price on request/i.test(raw),
    savedAt: (raw.match(/saved:\s*(\d{4}-\d\d-\d\d)/) || [])[1] || '',
  };
}

export function websiteStats() {
  const all = loadWebsiteChunks();
  return { passages: all.length, pages: new Set(all.map((c) => c.source)).size };
}

// ---- vehicle fact sheet --------------------------------------------------

const money = (n) => (n === null || n === undefined || n === '' ? '' : '$' + Number(n).toLocaleString('en-AU'));
const kms = (n) => (n === null || n === undefined || n === '' ? '' : Number(n).toLocaleString('en-AU') + ' km');
const has = (v) => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && !v.length);
// The dashboard answers its yes/no questions as words ("no"), sometimes as booleans.
const no = (v) => v === false || /^(no|false|0|n)$/i.test(String(v ?? '').trim());
const yes = (v) => v === true || /^(yes|true|1|y)$/i.test(String(v ?? '').trim());

/**
 * The listing description, trimmed for the AI: emoji and markup out, customer details out, any
 * sentence with a marketing claim, urgency or a removed detail out, and cut at a sentence end.
 */
export function descriptionFor(v, max = 600) {
  let t = stripEmoji(String(v?.description || '')).replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&amp;/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  t = redact(t, null);
  const keep = t.split(/(?<=[.!?])\s+/).filter((s) => s.trim() && !CLAIM.test(s) && !URGENCY.test(s) && !/\[[A-Z][A-Z ]+\]/.test(s) && !/\b(call|text|message|ring|phone) (us|now|today|me)\b/i.test(s));
  let out = '';
  for (const s of keep) {
    if (`${out} ${s}`.trim().length > max) break;
    out = `${out} ${s}`.trim();
  }
  return out;
}

/**
 * @param owner     the customer is buying, or has bought, this vehicle: it is theirs, not stock on offer
 * @param reserved  another customer has a sale in progress on it, though it still shows as available
 */
export function vehicleFacts(v, { owner = false, reserved = false } = {}) {
  if (!v) return '';
  const a = availability(v);
  const L = [];
  const add = (label, value) => { if (has(value)) L.push(`${label}: ${value}`); };
  const onOffer = !owner && !reserved && a.code !== 'sold';

  add('Vehicle', v.title || [v.year, v.make, v.model, v.variant].filter(Boolean).join(' '));
  add('Stock number', v.stockNo);
  if (owner) L.push('Availability: This is the customer\'s own vehicle: they are buying it, or have bought it, from us. Do not call it "sold" or "available".');
  else if (reserved && a.code === 'available') L.push('Availability: Reserved. Another customer has paid a deposit on this vehicle, so it cannot be offered as available. If that sale does not go ahead we can let this customer know.');
  else add('Availability', a.text);
  if (onOffer) add('Advertised price', has(v.price) ? `${money(v.price)} (excludes government charges)` : '');
  add('Odometer', kms(v.odometer));
  add('Year', v.year);
  add('Built', v.builtMonthYear);
  add('Model code', v.modelCode);
  add('Body type', v.bodyType);
  add('Seats', v.seats);
  add('Doors', v.doors);
  add('Fuel', v.fuel);
  add('Engine', [v.engine?.engineSizeL || (v.engineCc ? `${v.engineCc} cc` : ''), has(v.cylinders) ? `${v.cylinders} cylinders` : '', v.engineCode, v.engine?.induction].filter(Boolean).join(', '));
  add('Transmission', [v.transmission, v.spec?.gearType].filter(Boolean).join(', '));
  add('Drive', v.driveTrain);
  add('Colour', [v.color, v.interiorColour ? `interior ${v.interiorColour}` : ''].filter(Boolean).join(', '));
  add('Auction grade', v.auctionGrade);
  add('Keys', v.noOfKeys);
  if (has(v.length) && has(v.width) && has(v.height)) add('Exterior size (mm)', `length ${v.length}, width ${v.width}, height ${v.height}`);
  if (v.spec && (has(v.spec.cabinLength) || has(v.spec.cabinHeight))) add('Cabin size (mm)', [v.spec.cabinLength && `length ${v.spec.cabinLength}`, v.spec.cabinWidth && `width ${v.spec.cabinWidth}`, v.spec.cabinHeight && `height ${v.spec.cabinHeight}`].filter(Boolean).join(', '));
  add('Fuel use', v.spec?.fuelConsumptionCombined || v.fuelConsumption);
  add('Hybrid battery health', has(v.batterySOH) ? `${v.batterySOH}` : '');
  if (has(v.odometerHistory1)) add('Odometer history', [`${kms(v.odometerHistory1)} on ${v.odometerHistory1Date || 'date not recorded'}`, has(v.odometerHistory2) ? `${kms(v.odometerHistory2)} on ${v.odometerHistory2Date || 'date not recorded'}` : ''].filter(Boolean).join('; '));
  if (yes(v.ppsrClear)) add('PPSR', 'clear');
  // The Australian register's answer, as the dashboard records it. "Not recorded as written off" is
  // never "accident-free": the system prompt says so.
  if (no(v.writtenOff)) add('Written-off register', 'not recorded as written off');
  else if (yes(v.writtenOff)) add('Written-off register', 'recorded as written off. Name this before they ask.');
  if (no(v.waterDamage)) add('Water damage', 'none recorded');
  else if (yes(v.waterDamage)) add('Water damage', 'recorded. Name this before they ask.');
  if (no(v.majorRepairs)) add('Major repairs', 'none recorded');
  else if (yes(v.majorRepairs)) add('Major repairs', 'recorded. Name this before they ask.');
  add('Previous owners', v.numberOfPreviousOwner);
  add('First registered (Japan)', v.firstRegistrationDate);
  add('Registration expiry', v.registrationExpiryDate);
  add('Included', (v.outline || []).join('; '));
  add('Service record', (v.serviceRecord || []).join('; '));
  add('Features', (v.features || []).join(', '));
  // Our own words on the website, for facts only: the voice says what a reply sounds like.
  if (onOffer) add('From the listing (our own words on the website: use it for facts, never for its tone or its claims)', descriptionFor(v));
  add('Location', /lidcombe/i.test(v.inventoryAddress || '') && a.code === 'available' ? v.inventoryAddress : '');
  if (v.url && onOffer) {
    // The inspection booking links are deliberately not listed here. They are supplied only when
    // the customer asks to see the car (inspectionPlan in prompt.js), so they are not offered unasked.
    L.push(`Vehicle page: ${v.url}`);
    L.push(`Start a trade-in request: ${v.url}#trade-in`);
    L.push(`Start a finance application: ${v.url}#finance`);
  }
  return L.join('\n');
}

/** The two inspection booking links for a vehicle. Both open the same form with the type chosen. */
export const inspectionLinks = (v) => ({ onsite: `${v.url}#inspection=onsite`, online: `${v.url}#inspection=online` });

/** Similar unsold cars to suggest when the one asked about is gone. */
export function alternatives(v, all, max = 2) {
  if (!v) return [];
  return all
    .filter((o) => o.id !== v.id && availability(o).code === 'available' && o.url)
    .map((o) => {
      let score = 0;
      if (String(o.model).toLowerCase() === String(v.model).toLowerCase()) score += 5;
      if (String(o.make).toLowerCase() === String(v.make).toLowerCase()) score += 2;
      if (o.bodyType && o.bodyType === v.bodyType) score += 2;
      if (o.fuel && o.fuel === v.fuel) score += 1;
      if (has(o.price) && has(v.price)) score += Math.max(0, 2 - Math.abs(o.price - v.price) / 5000);
      return { o, score };
    })
    .filter((s) => s.score >= 4)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map((s) => s.o);
}

export const formatMoney = money;
