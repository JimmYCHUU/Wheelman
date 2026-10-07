// Model replies: invented scenarios with a reply in the house voice, written by hand in
// voice/model-replies.md and rated by the owner on the page. Approved ones set the standard the AI
// matches for similar messages; the team's real replies still set the voice. Nothing here is a
// real customer, a real car or a real conversation, and nothing from a scenario is ever learned.

import fs from 'node:fs';
import { config } from './config.js';
import { classify } from './situations.js';
import { normalizeVehicle } from './normalize.js';
import { inspectionLinks } from './knowledge.js';

const MIN = 60e3;
const DAY = 24 * 3600e3;

export const STATUSES = ['PROPOSED', 'CHANGED', 'APPROVED', 'REJECTED'];

// Invented cars, in the shape the dashboard sends, so the facts the reply is checked against are the
// same kind the real ones are. Stock numbers MR1 to MR8 never clash with real stock.
const RAW_VEHICLES = [
  { id: 900001, stockNo: 'MR1', title: '2021 Toyota Noah X (8 Seater)', year: '2021', make: 'TOYOTA', model: 'Noah', modelCode: 'ZRR80G', auPublishPrice: 28900, odometer: 62733, seats: 8, doors: 5, fuel: 'Petrol', transmission: 'Automatic', color: 'Pearl white', auctionGrade: '4', noOfKeys: 1, status: 'PUBLISHED', soldStatus: 'UnSold', stockIn: 'Online', outline: ['6 Months NSW Registration', 'Fresh Blue Slip (Roadworthy)', 'CTP Insurance', 'Full Service and Detail', '5-Year Extended Warranty', 'Doorstep Delivery within Greater Sydney'] },
  { id: 900002, stockNo: 'MR2', title: '2020 Toyota Hiace DX', year: '2020', make: 'TOYOTA', model: 'Hiace', modelCode: 'GDH206V', auPublishPrice: 33900, odometer: 98000, seats: 3, doors: 4, fuel: 'Diesel', transmission: 'Automatic', color: 'White', auctionGrade: '4', noOfKeys: 1, status: 'PUBLISHED', soldStatus: 'UnSold', stockIn: 'Online', outline: ['6 Months NSW Registration', 'Fresh Blue Slip (Roadworthy)', 'CTP Insurance', 'Full Service and Detail', 'Doorstep Delivery within Greater Sydney'] },
  { id: 900003, stockNo: 'MR3', title: '2018 Toyota Alphard S', year: '2018', make: 'TOYOTA', model: 'Alphard', modelCode: 'AGH30W', auPublishPrice: 45900, odometer: 88000, seats: 7, doors: 5, fuel: 'Petrol', transmission: 'Automatic', color: 'Black', auctionGrade: '4.5', noOfKeys: 2, status: 'PUBLISHED', soldStatus: 'UnSold', stockIn: 'Online', outline: ['6 Months NSW Registration', 'Fresh Blue Slip (Roadworthy)', 'CTP Insurance', 'Full Service and Detail', '3-Month Dealer Warranty', '5-Year Extended Warranty', 'Doorstep Delivery within Greater Sydney'] },
  { id: 900004, stockNo: 'MR4', title: '2019 Honda N-Box Custom', year: '2019', make: 'HONDA', model: 'N-Box', modelCode: 'JF3', auPublishPrice: 19900, odometer: 41000, seats: 4, doors: 5, fuel: 'Petrol', transmission: 'Automatic', color: 'Silver', auctionGrade: '4', noOfKeys: 2, status: 'PUBLISHED', soldStatus: 'UnSold', stockIn: 'Online', outline: ['6 Months NSW Registration', 'Fresh Blue Slip (Roadworthy)', 'CTP Insurance', 'Full Service and Detail', '5-Year Extended Warranty'] },
  { id: 900005, stockNo: 'MR5', title: '2016 Nissan Serena Highway Star', year: '2016', make: 'NISSAN', model: 'Serena', modelCode: 'GFC27', auPublishPrice: 19900, odometer: 101000, seats: 8, doors: 5, fuel: 'Petrol', transmission: 'Automatic', color: 'Silver', auctionGrade: '3.5', noOfKeys: 1, status: 'PUBLISHED', soldStatus: 'UnSold', stockIn: 'Online', outline: ['6 Months NSW Registration', 'Fresh Blue Slip (Roadworthy)', 'CTP Insurance', 'Full Service and Detail', 'Doorstep Delivery within Greater Sydney'] },
  { id: 900006, stockNo: 'MR6', title: '2017 Toyota Prius S', year: '2017', make: 'TOYOTA', model: 'Prius', modelCode: 'ZVW50', auPublishPrice: 18900, odometer: 71000, seats: 5, doors: 5, fuel: 'Hybrid', transmission: 'Automatic', color: 'White', auctionGrade: '4', noOfKeys: 1, status: 'UNPUBLISHED', soldStatus: 'UnSold', stockIn: 'Transit', outline: ['6 Months NSW Registration', 'Fresh Blue Slip (Roadworthy)', 'CTP Insurance', 'Full Service and Detail'] },
  { id: 900007, stockNo: 'MR7', title: '2019 Mazda CX-8 Sport', year: '2019', make: 'MAZDA', model: 'CX-8', modelCode: 'KG2P', auPublishPrice: 31900, odometer: 75000, seats: 7, doors: 5, fuel: 'Diesel', transmission: 'Automatic', color: 'Red', auctionGrade: '4', noOfKeys: 2, status: 'UNPUBLISHED', soldStatus: 'Sold', stockIn: 'Sold', outline: ['6 Months NSW Registration'] },
  { id: 900008, stockNo: 'MR8', title: '2022 Toyota Corolla Touring Hybrid', year: '2022', make: 'TOYOTA', model: 'Corolla', modelCode: 'ZWE211W', auPublishPrice: 29900, odometer: 35000, seats: 5, doors: 5, fuel: 'Hybrid', transmission: 'Automatic', color: 'Grey', auctionGrade: '4.5', noOfKeys: 2, status: 'UNPUBLISHED', soldStatus: 'UnSold', stockIn: 'Japan', outline: ['6 Months NSW Registration', 'Fresh Blue Slip (Roadworthy)', 'CTP Insurance', 'Full Service and Detail', '5-Year Extended Warranty'] },
];
export const MODEL_VEHICLES = Object.fromEntries(RAW_VEHICLES.map((r) => [r.stockNo, normalizeVehicle(r)]));

// ---- the file --------------------------------------------------------------------------------

/**
 * Parses voice/model-replies.md. Each scenario is a `## <number>. <title>` block with `Key: value`
 * lines (Situation, Rung, Channel, Vehicle, Name, State, Buyer), optional earlier lines (`US:`,
 * `CUSTOMER:`, `EVENT:`), then `Customer:` and `Reply:` paragraphs.
 */
export function parseModelReplies(md) {
  const text = String(md || '').replace(/\r/g, '');
  return text.split(/^## (?=\d+\.)/m).slice(1).map((block) => {
    const lines = block.split('\n');
    const head = lines.shift().match(/^(\d+)\.\s*(.+?)\s*$/);
    if (!head) return null;
    const s = { id: Number(head[1]), title: head[2], situation: '', rung: '', channel: 'sms', vehicle: '', name: 'Priya', state: 'NSW', buyer: false, earlier: [], customer: '', reply: '' };
    let i = 0;
    for (; i < lines.length && !/^Customer:\s*$/.test(lines[i]); i++) {
      const line = lines[i];
      const earlier = line.match(/^(US|CUSTOMER|EVENT):\s*(.*)$/);
      if (earlier) { s.earlier.push({ kind: earlier[1].toLowerCase(), text: earlier[2].trim() }); continue; }
      const field = line.match(/^([A-Za-z]+):\s*(.*)$/);
      if (!field) continue;
      const k = field[1].toLowerCase(), v = field[2].trim();
      if (k === 'buyer') s.buyer = /^(yes|true)$/i.test(v);
      else if (k in s && typeof s[k] === 'string') s[k] = v;
    }
    const customer = [];
    for (i++; i < lines.length && !/^Reply:\s*$/.test(lines[i]); i++) customer.push(lines[i]);
    const reply = [];
    for (i++; i < lines.length; i++) reply.push(lines[i]);
    s.channel = s.channel === 'marketplace' ? 'marketplace' : 'sms';
    s.customer = customer.join('\n').trim();
    s.reply = reply.join('\n').trim();
    return s;
  }).filter((s) => s && s.id && s.customer && s.reply);
}

let cache = { key: '', scenarios: [] };

function readState() {
  try { return JSON.parse(fs.readFileSync(config.modelRepliesStatePath, 'utf8')); } catch { return {}; }
}

/** A value that changes whenever the scenarios or their statuses change. */
export function modelRepliesStamp() {
  const m = (p) => { try { return fs.statSync(p).mtimeMs; } catch { return 0; } };
  return `${m(config.modelRepliesPath)}|${m(config.modelRepliesStatePath)}`;
}

/** Every scenario with its status, final text and the owner's note. */
export function loadModelReplies() {
  const key = modelRepliesStamp();
  if (cache.key === key) return cache.scenarios;
  let md = '';
  try { md = fs.readFileSync(config.modelRepliesPath, 'utf8'); } catch { md = ''; }
  const state = readState();
  const scenarios = parseModelReplies(md).map((s) => {
    const st = state[String(s.id)] || {};
    const status = STATUSES.includes(st.status) ? st.status : 'PROPOSED';
    return { ...s, status, finalReply: status === 'APPROVED' && st.reply ? st.reply : s.reply, note: st.note || '', at: st.at || null };
  });
  cache = { key, scenarios };
  return scenarios;
}

export const scenarioOf = (id) => loadModelReplies().find((s) => s.id === Number(id)) || null;

/** Writes a scenario's status (and the approved text, or the owner's note) beside the markdown. */
export function setScenarioStatus(id, { status, reply = null, note = null } = {}) {
  if (!STATUSES.includes(status)) throw new Error(`Not a status: ${status}`);
  const state = readState();
  const prev = state[String(id)] || {};
  state[String(id)] = { ...prev, status, reply: status === 'APPROVED' ? (reply ?? prev.reply ?? null) : prev.reply ?? null, note: note ?? prev.note ?? '', at: Date.now() };
  fs.mkdirSync(require_dir(config.modelRepliesStatePath), { recursive: true });
  fs.writeFileSync(config.modelRepliesStatePath, JSON.stringify(state, null, 1) + '\n');
  cache.key = '';
  return state[String(id)];
}
const require_dir = (p) => p.replace(/[\\/][^\\/]*$/, '');

export function standardsCounts() {
  const all = loadModelReplies();
  const n = (st) => all.filter((s) => s.status === st).length;
  return { total: all.length, toRate: n('PROPOSED') + n('CHANGED'), approved: n('APPROVED'), rejected: n('REJECTED') };
}

// ---- a scenario as a conversation -------------------------------------------------------------

/** The model's links written as placeholders in the file become the invented car's own links. */
export function fillLinks(text, vehicle) {
  if (!vehicle?.url) return String(text || '');
  const links = inspectionLinks(vehicle);
  return String(text || '').replace(/\{vehicle_url\}/g, vehicle.url).replace(/\{onsite_link\}/g, links.onsite).replace(/\{online_link\}/g, links.online);
}

/**
 * The scenario in the shape items.js builds for a real conversation, so the prompt, the checks, the
 * presenters and the page all work on it unchanged. Key tr:<id>; the customer's message is the anchor.
 */
export function scenarioItem(id, { now = Date.now() } = {}) {
  const s = scenarioOf(id);
  if (!s) return null;
  const vehicle = MODEL_VEHICLES[s.vehicle] || null;
  const channel = s.channel;
  const via = channel === 'marketplace' ? 'Marketplace' : 'SMS';
  const key = (k) => `tr:${s.id}:${k}`;
  const timeline = [];
  // Earlier messages are two days old, so a greeting is due again and nothing counts as written today.
  let at = now - 2 * DAY;
  s.earlier.forEach((e, i) => {
    at += 10 * MIN;
    if (e.kind === 'us') timeline.push({ who: 'us', via, text: fillLinks(e.text, vehicle), event: '', media: null, at, by: null, key: key(`us${i}`) });
    else if (e.kind === 'customer') timeline.push({ who: 'customer', via, text: e.text, event: '', media: null, at, by: null, key: key(`c${i}`) });
    else timeline.push({ who: 'customer', via, text: '', event: e.text, media: null, at, by: null, key: key(`e${i}`) });
  });
  const last = { who: 'customer', via, text: s.customer, event: '', media: null, at: now - 5 * MIN, by: null, key: key('customer') };
  timeline.push(last);
  const lastUs = timeline.map((e) => e.who).lastIndexOf('us');
  const pending = timeline.slice(lastUs + 1);
  const events = pending.map((e) => e.event).filter(Boolean);
  const pendingText = pending.map((e) => e.text).filter(Boolean).join('\n');
  const lead = { id: null, first_name: s.name, last_name: '', phone: '', email: '', status: s.buyer ? 'DEPOSIT_RECEIVED' : 'NEW', platform: '', source: 'Model reply', state: s.state || 'NSW', stocks: [], inquiries: [], statusHistory: [], nameOnly: true };
  const deal = s.buyer ? { source: 'lead_status', stage: 'deposit', stageText: 'a deposit is paid', vehicle, stockNo: vehicle?.stockNo || null, soldAt: null, matchedBy: 'lead', recorded: true, onFile: [], notOnFile: [], signals: [], others: [] } : null;
  const situation = classify(pendingText, { events, leadStatus: lead.status, buyer: !!deal });
  const isFirstReply = !timeline.some((e) => e.who === 'us');
  return {
    channel, mediaOnly: false, autoDraft: false, autoReason: '', noLead: false, hasLeadRecord: true, hasName: true,
    itemKey: `tr:${s.id}`, anchorKey: last.key, conversationId: null, lead, conversation: null, phone: '',
    timeline, pending, pendingText, events, menu: null, state: 'awaiting', note: '', situation, isFirstReply,
    isNewEnquiry: channel === 'sms' && isFirstReply && !deal,
    deal, pastBuyer: null, lastInboundAt: last.at, lastActivityAt: last.at,
    vehicles: vehicle ? [vehicle] : [], imports: null,
    marketplace: channel === 'marketplace' ? {
      account: 'Model reply', listingTitle: vehicle?.title || '', listingPrice: vehicle?.price || null, listingUrl: '', archived: false, needsPerson: false, replyComing: false, queuedAt: null, failed: 0, unsent: 0,
      engine: { enabled: false, stage: '', locked: false, lockReason: '', lockDetail: '', urgency: '', nextAction: '', notes: [] },
    } : undefined,
    standard: { id: s.id, title: s.title, status: s.status, note: s.note, proposed: fillLinks(s.finalReply || s.reply, vehicle), rung: s.rung, situation: s.situation },
  };
}

// ---- for the prompt ------------------------------------------------------------------------------

const bag = (t) => new Set(String(t || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length >= 4));

/**
 * The approved model replies that fit this message, best first: by the situation, the rung, the
 * channel and the words of the customer's message. At most `max`, none below a modest score.
 */
export function modelReplies(want, max = 3) {
  const q = bag(want.text);
  const picked = [];
  for (const s of loadModelReplies()) {
    if (s.status !== 'APPROVED') continue;
    if (want.excludeItemKey === `tr:${s.id}`) continue;
    const sits = s.situation.split(/[\s,]+/).filter(Boolean);
    let score = 0;
    if (sits[0] && sits[0] === want.primary) score += 3;
    for (const x of sits) if ((want.situations || []).includes(x)) score += 1;
    if (want.rung && s.rung === want.rung) score += 1.5;
    if ((want.channel || 'sms') === s.channel) score += 0.7;
    const b = bag(s.customer);
    let overlap = 0;
    for (const w of q) if (b.has(w)) overlap++;
    score += overlap * 0.5;
    if (score >= 3) picked.push({ s, score });
  }
  return picked.sort((a, b) => b.score - a.score).slice(0, max)
    .map(({ s }) => ({ id: s.id, title: s.title, situation: s.situation, rung: s.rung, channel: s.channel, customer: s.customer, reply: fillLinks(s.finalReply || s.reply, MODEL_VEHICLES[s.vehicle] || null) }));
}
