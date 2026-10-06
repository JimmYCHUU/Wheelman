// Loads business facts and website pages, and builds the fact sheet for one vehicle.

import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { availability } from './normalize.js';

// ---- business facts ------------------------------------------------------

/**
 * The dealer's own file when it is there; otherwise the example committed with the project. The
 * real business facts and the operations guide hold fees, terms and partners, so they stay on the
 * dealer's computer and are never committed; a fresh clone, the demo and the automated checks
 * run on the examples.
 */
export function knowledgeFile(name) {
  const real = path.join(config.knowledgeDir, `${name}.md`);
  return fs.existsSync(real) ? real : path.join(config.knowledgeDir, `${name}.example.md`);
}

export function loadBusinessFacts(file = knowledgeFile('business-facts')) {
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
  return topics;
}

export function businessFactsForPrompt() {
  const topics = loadBusinessFacts();
  const usable = topics.filter((t) => t.status !== 'needs_answer');
  const open = topics.filter((t) => t.status === 'needs_answer');
  return {
    text: usable.map((t) => `- ${t.title}: ${t.answer.replace(/\n+/g, ' ')}`).join('\n'),
    unanswered: open.map((t) => t.title),
    counts: { confirmed: topics.filter((t) => t.status === 'confirmed').length, working: topics.filter((t) => t.status === 'working').length, needsAnswer: open.length },
  };
}

// ---- how Carbarn works ----------------------------------------------------

/** The operations guide: everything below the first "---" line of knowledge/how-carbarn-works.md. */
export function operationsGuide(file = knowledgeFile('how-carbarn-works')) {
  if (!fs.existsSync(file)) return '';
  const raw = fs.readFileSync(file, 'utf8').replace(/\r/g, '');
  const cut = raw.indexOf('\n---');
  return (cut === -1 ? raw : raw.slice(cut + 4)).trim();
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

export function websiteStats() {
  const all = loadWebsiteChunks();
  return { passages: all.length, pages: new Set(all.map((c) => c.source)).size };
}

// ---- vehicle fact sheet --------------------------------------------------

const money = (n) => (n === null || n === undefined || n === '' ? '' : '$' + Number(n).toLocaleString('en-AU'));
const kms = (n) => (n === null || n === undefined || n === '' ? '' : Number(n).toLocaleString('en-AU') + ' km');
const has = (v) => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && !v.length);

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
  add('Engine', [v.engine?.engineSizeL || (v.engineCc ? `${v.engineCc} cc` : ''), v.engineCode, v.engine?.induction].filter(Boolean).join(', '));
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
  if (v.ppsrClear === true) add('PPSR', 'clear');
  if (v.writtenOff === true) add('Written off', 'yes');
  if (v.writtenOff === false) add('Written off', 'no');
  add('Registration expiry', v.registrationExpiryDate);
  add('Included', (v.outline || []).join('; '));
  add('Service record', (v.serviceRecord || []).join('; '));
  add('Features', (v.features || []).join(', '));
  add('Location', /lidcombe/i.test(v.inventoryAddress || '') && a.code === 'available' ? v.inventoryAddress : '');
  if (v.url && onOffer) {
    // The inspection booking links are deliberately not listed here. They are supplied only when
    // the customer asks to see the car (inspectionPlan in prompt.js), so they are not offered unasked.
    L.push(`Vehicle page: ${v.url}`);
    L.push(`Start a trade-in request: ${v.url}#trade-in`);
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
