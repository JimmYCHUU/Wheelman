// The local page and its data. Listens on this computer only (127.0.0.1).

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { listItems, itemFromKey } from './items.js';
import { latestDraft, getDraft, dismiss, undismiss, isDismissed, setDraftRating, markSeen, isSeen, dataStamp, uncopy, addOrderMessage, removeOrderMessage } from './db.js';
import { listOrderRows, MESSAGES, messagesFor, wantedText, carTitle, lotName, lotPageUrl, cleanPaste } from './orders.js';
import { draftOrderMessage } from './ordermessages.js';
import { draftFor } from './drafter.js';
import { availability } from './normalize.js';
import { firstNameOf, isPlaceholderName, redact } from './redact.js';
import { maskGreetingNames } from './voice.js';
import { signedName } from './signature.js';
import { rowMatches } from '../web/lib/search.js';
import { RUNG_LABELS } from './selling.js';
import { loadModelReplies, scenarioOf, scenarioItem, setScenarioStatus, standardsCounts, modelRepliesStamp, STATUSES } from './modelreplies.js';
import { assessProposed } from './drafter.js';
import { insertDraft } from './db.js';
import { comparable, currentText, canLearnFrom } from './learn.js';
import { validateMailReport, storeMailThread } from './mail.js';
import { recentPractice, PRACTICE_DAYS } from './practice.js';
import { recentMailPractice } from './mailpractice.js';
import { loadExamples } from './examples.js';
import { oldRowsStamp, messageMedia } from './db.js';
import { logLine } from './log.js';
import { businessFactsForPrompt, loadBusinessFacts } from './knowledge.js';
import * as worker from './worker.js';
import { onCopied, onRated, onApproved, onAdvice, onEdited } from './learn.js';
import { displayNameFor } from './people.js';
import { reservedByAnother } from './deal.js';
import { wantedFrom } from './imports.js';
import { learnedStats } from './db.js';
import { validateReport, storePhoneReport } from './phone.js';
import { sendReply, fetchConversation, normalizeMpMessage } from './marketplace.js';
import { storeMpConversation } from './sync.js';
import { appendMpMessage, recordSentHere } from './db.js';
import { blankMatcher } from '../web/lib/blank.js';

const TYPES = { '.woff2': 'font/woff2', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const VERSION = (() => { try { return JSON.parse(fs.readFileSync(path.join(config.root, 'package.json'), 'utf8')).version || ''; } catch { return ''; } })();

function send(res, status, body, type = 'application/json; charset=utf-8', extra = {}) {
  const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, {
    'content-type': type,
    'cache-control': 'no-store',
    ...extra,
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'content-security-policy': "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'",
  });
  res.end(data);
}

function readBody(req, limit = 100000) {
  return new Promise((resolve, reject) => {
    let size = 0; const parts = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('too large')); req.destroy(); } else parts.push(c); });
    req.on('end', () => { try { resolve(parts.length ? JSON.parse(Buffer.concat(parts).toString('utf8')) : {}); } catch { reject(new Error('bad json')); } });
    req.on('error', reject);
  });
}

// The two routes the browser add-on (extension/) may post to, each with its own header: the phone
// reader's reports, and an email thread from the Send to Wheelman button in Gmail.
const ADDON_ROUTES = [[/^\/api\/phone\//, 'x-wheelman-phone'], [/^\/api\/mail\//, 'x-wheelman-mail']];

/**
 * Only this computer's own browser page may use the app. The one exception is the browser add-on
 * (extension/), which reports from a browser add-on's own origin: it is let in on its two routes
 * only, each with its own header (an ordinary web page cannot add one without a preflight request,
 * which this server never answers), and only when PHONE_ADDON_ID, if set, names it.
 */
function allowed(req, pathname = '') {
  const host = String(req.headers.host || '');
  if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) return false;
  if (req.method !== 'GET') {
    const origin = String(req.headers.origin || '');
    const json = /application\/json/i.test(String(req.headers['content-type'] || ''));
    const route = ADDON_ROUTES.find(([re]) => re.test(pathname));
    if (route && /^chrome-extension:\/\/[a-p]{32}$/.test(origin)) {
      if (config.phone.addonId && origin !== `chrome-extension://${config.phone.addonId}`) return false;
      return req.headers[route[1]] === '1' && json;
    }
    if (origin && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return false;
    if (!json) return false;
  }
  return true;
}

/**
 * The name the page shows for a conversation: the record's name, else the name the customer
 * signed in a text (a label for the reader only; the AI never sees it), else nothing, and the
 * row shows the number.
 */
function displayName(item) {
  const l = item.lead;
  const full = [l?.first_name, l?.last_name].filter(Boolean).join(' ').trim() || item.conversation?.customer_name || '';
  if (full && !isPlaceholderName(full)) return full;
  return signedName(item.timeline);
}

// The newest messages a conversation opens with; "Load older messages" brings the rest, this many at a time.
const THREAD_LIMIT = 20;
const LIST_LIMIT = 1000;
const LIST_PAGE = 20; // rows the list opens with; "Load older conversations" adds this many each time

function draftOf(item) {
  const draft = latestDraft(item.itemKey, item.anchorKey);
  return draft ? {
    id: draft.id, status: draft.status, reply: draft.reply || '', checks: draft.checks, factsUsed: draft.factsUsed,
    // What the person has typed over the suggestion: null when untouched, '' when they cleared it.
    edited: typeof draft.edited_text === 'string' ? draft.edited_text : null, editedAt: draft.edited_at || null,
    model: draft.model, provider: draft.provider, createdAt: draft.created_at, instruction: draft.instruction || '', error: draft.error || '', rating: draft.rating || '',
    // Marketplace only: when Send was pressed on this suggestion.
    sentHereAt: draft.sent_here_at || null,
    // An import email: what was looked up on the website, found and not found, with its sources.
    research: draft.research || null,
    // How many of the team's own replies to similar messages the request showed.
    practiceUsed: draft.context?.practice || 0,
    needsHuman: (draft.needsHuman || []).filter((n) => n && n.marker && n.reason).map((n) => ({ marker: String(n.marker), reason: String(n.reason) })),
    // What the reply is for: the one next step it offers, and where the customer is on the way to a sale.
    nextStep: draft.next_step || '', rung: draft.rung || '', rungLabel: RUNG_LABELS[draft.rung] || '',
  } : null;
}

function flagLevel(draft) {
  if (!draft || draft.status !== 'ready') return draft && draft.status === 'failed' ? 'error' : 'none';
  // Judged on the text as it stands: a blank the person has filled in, or a figure they removed, no longer counts.
  const text = draft.edited ?? draft.reply;
  if (!text.trim()) return 'none';
  const c = (draft.checks || []).filter((x) => draft.edited === null || !x.tokens?.length || x.tokens.some((t) => text.includes(t)));
  return c.some((x) => x.level === 'fail') ? 'fail' : c.some((x) => x.level === 'input') ? 'input' : 'ok';
}

/** One row in the conversation list. Deliberately small. */
function summary(item) {
  if (item.order) return { ...item.orderRow, anchor: item.anchorKey, flag: flagLevel(draftOf(item)) };
  const draft = draftOf(item);
  const last = item.timeline[item.timeline.length - 1];
  const lastShown = [...item.timeline].reverse().find((e) => !e.internal) || last;
  return {
    key: item.itemKey,
    section: item.standard ? 'standards' : item.channel === 'marketplace' ? 'marketplace' : item.channel === 'email' ? 'importquery' : 'dashboard',
    // A model reply's scenario: its title and where it stands with the owner.
    standardStatus: item.standard?.status || null,
    account: item.marketplace?.account || '',
    // An email thread: the customer's address, and how many of its messages Gmail had folded.
    email: item.mail?.customerEmail || '',
    collapsed: item.mail?.collapsed || 0,
    needsPerson: !!item.marketplace?.needsPerson,
    replyComing: !!item.marketplace?.replyComing,
    anchor: item.anchorKey,
    state: item.state,
    // Seen only on the phone: the dashboard has no conversation for this number.
    phoneOnly: !!item.phoneOnly,
    dismissed: isDismissed(item.itemKey, item.anchorKey),
    name: displayName(item),
    phone: item.phone,
    situation: item.situation.label,
    waitingSince: item.lastInboundAt,
    lastAt: lastShown.at,
    unanswered: item.state === 'awaiting' ? item.pending.length : 0,
    // The number badge: messages that arrived since the user last opened this conversation. Only
    // recent ones count as new; an unanswered text from months ago is listed, not flagged.
    unread: item.state === 'awaiting' && !isSeen(item.itemKey, item.anchorKey) && (item.lastInboundAt || 0) >= Date.now() - RECENT_HOURS * 3600e3 ? item.pending.length : 0,
    preview: { who: lastShown.who, text: lastShown.text || lastShown.event || (lastShown.media ? 'Photo' : ''), media: lastShown.media || null },
    flag: flagLevel(draft),
    car: item.standard ? item.standard.title : item.mail ? (item.mail.car || item.mail.subject) : item.vehicles[0]?.title || item.marketplace?.listingTitle || (item.imports ? wantedFrom(item).car : ''),
  };
}

/**
 * A model reply's scenario opens with the hand-written reply finished and checked the way the AI's
 * would be, written once as a draft with no AI request. Rewrites and coaching then work as usual.
 */
function ensureScenarioDraft(item, { now = Date.now() } = {}) {
  if (!item?.standard || latestDraft(item.itemKey, item.anchorKey)) return;
  const { reply, checks, prompt } = assessProposed(item, item.standard.proposed, { now });
  insertDraft({
    itemKey: item.itemKey, anchorKey: item.anchorKey, situation: item.situation.primary, status: 'ready', reply,
    needsHuman: [], factsUsed: [], nextStep: '', rung: prompt.stage?.rung || '', checks, provider: 'none', model: 'the model reply as written', exampleIds: [],
    context: { situations: item.situation.all, firstReply: item.isFirstReply, channel: item.channel, newEnquiry: !!item.isNewEnquiry, buyer: !!item.deal, standard: true, rung: prompt.stage?.rung || null, move: prompt.stage?.move || null },
  });
}

/** What an import customer asked us to find, for the details panel. No figure of ours, only theirs. */
function lookingFor(item) {
  if (!item.imports) return null;
  const w = wantedFrom(item);
  if (!w.car) return null;
  const o = item.imports.order;
  return {
    car: w.car + (w.modelCode ? ` (${w.modelCode})` : ''),
    years: w.yearFrom && w.yearTo && w.yearFrom !== w.yearTo ? `${w.yearFrom} to ${w.yearTo}` : w.yearFrom ? `${w.yearFrom}${w.yearTo === w.yearFrom ? '' : ' or newer'}` : '',
    maxKm: w.maxKm || 0,
    budget: w.budgetAud || 0,
    grade: w.minGrade || 0,
    order: o ? `${o.orderNo}${o.lotPhase ? `, ${o.lotPhase.replace(/_/g, ' ').toLowerCase()}` : ''}${o.depositState && o.depositState !== 'NONE' ? `, deposit ${o.depositState.toLowerCase()}` : ''}` : '',
    missing: w.given.length < 4 ? w.missing.map((m) => m.replace(/^your |^any | you have$/g, '').replace(/ you have$/, '')).join(', ') : '',
  };
}

/** What the page shows about a Marketplace chat, beyond the messages. */
function marketplaceOf(item) {
  const m = item.marketplace;
  if (!m) return null;
  const e = m.engine;
  return {
    account: m.account, listingTitle: m.listingTitle, listingPrice: m.listingPrice, listingUrl: m.listingUrl,
    archived: m.archived, needsPerson: m.needsPerson, replyComing: m.replyComing, queuedAt: m.queuedAt, failed: m.failed, unsent: m.unsent, sending: !!m.sending,
    autoReply: e.enabled, stage: e.stage, locked: e.locked, lockReason: e.lockReason, lockDetail: e.lockDetail,
    urgency: e.urgency, nextAction: e.nextAction, notes: e.notes,
  };
}

/** What the page shows about an email thread, beyond the messages. */
function mailOf(item) {
  const m = item.mail;
  if (!m) return null;
  return { subject: m.subject, customerName: m.customerName, customerEmail: m.customerEmail, messages: m.messages, collapsed: m.collapsed, firstAt: m.firstAt, lastAt: m.lastAt, car: m.car, draftsOff: !!m.draftsOff };
}

/** How the car is described in the strip under the customer's name. */
function shownAvailability(item, v) {
  const a = availability(v);
  if (item.deal?.vehicle?.id === v.id) return { code: 'own', text: `This customer's car: ${item.deal.stageText}` };
  if (a.code === 'available' && reservedByAnother(v, item.deal)) return { code: 'reserved', text: 'Reserved: another customer has paid a deposit' };
  return a;
}

const WHERE = { japan: 'Still in Japan', transit: 'On the way to Australia', arrived: 'Arrived in Australia', online: 'At the Lidcombe yard', sold: 'Handed over' };
const CONTACT = { WHATSAPP: 'WhatsApp', SMS: 'Text message', EMAIL: 'Email', PHONE: 'Phone call' };
const DEPOSIT = { NONE: 'Not paid', PARTIAL: 'Part paid', RECEIVED: 'Paid', PAID: 'Paid' };

/** What the details panel and the message box show about an auction order. */
function orderOf(item) {
  const o = item.order;
  if (!o) return null;
  const s = item.orderStatus;
  const w = o.wanted || {};
  const found = o.watch?.lot || null;
  const depositLine = o.money.lines.find((l) => l.stage === 'INITIAL_DEPOSIT');
  return {
    orderNo: o.orderNo,
    stage: s.stage.label, stageCode: s.stage.code, finished: !!s.stage.finished,
    due: s.due, why: s.kind === 'send' ? s.next.why : '',
    // Set once the message that was due has been copied or dismissed: "Put back" undoes it.
    handled: item.orderRow.handled,
    cameFrom: o.source === 'IMPORTING' ? 'Import page' : 'Live auction',
    prefers: CONTACT[o.preferredContact] || '',
    followUp: o.followUpDue ? 'A follow-up is due' : '',
    staffNote: o.note ? { text: o.note.body, at: o.note.at } : null,
    deposit: { state: DEPOSIT[o.depositState] || o.depositState.toLowerCase(), paid: o.money.depositPaid, asked: o.money.quotedDeposit || depositLine?.amount || 0 },
    wanted: { car: [wantedText(w), w.modelCode ? `(${w.modelCode})` : ''].filter(Boolean).join(' '), variant: w.variant, targetBidYen: w.targetBidYen, budget: w.budgetAud, notes: w.notes },
    lot: o.lot ? { title: lotName(o), grade: o.lot.grade, km: o.lot.km, auctionDate: o.lot.auctionDate, auctionHouse: o.lot.auctionHouse, lotNumber: o.lot.lotNumber, url: lotPageUrl(o) } : null,
    found: found ? { title: found.title, grade: found.grade, km: found.km, auctionDate: found.auctionDate, url: found.url, seenAt: o.watchedAt } : null,
    car: o.car ? { title: carTitle(o.car), km: o.car.km, grade: o.car.grade, colour: o.car.colour, stockNo: o.car.stockNo, where: WHERE[String(o.car.stockIn).toLowerCase()] || '' } : null,
    money: { lines: o.money.lines, payments: o.money.payments, total: o.money.total, paid: o.money.paid, due: o.money.due },
    dates: { opened: o.createdAt, secured: o.securedAt, completed: o.completedAt },
    // The "Which message?" list, the one that is due first.
    messages: messagesFor(o).map((type) => ({ type, label: MESSAGES[type], due: s.kind === 'send' && s.next.type === type })).sort((a, b) => Number(b.due) - Number(a.due)),
    message: item.message,
    replying: s.kind === 'reply' && item.anchorKey === s.anchorKey,
  };
}

// Photos are kept beside the database once fetched, under their message id, so each is fetched once.
const MEDIA_MAX_BYTES = 15 * 1024 * 1024;
const MEDIA_TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp' };
async function cachedMedia(id, index, url) {
  fs.mkdirSync(config.mediaDir, { recursive: true });
  const kept = fs.readdirSync(config.mediaDir).find((f) => f.startsWith(`${id}-${index}.`));
  if (kept) {
    const type = Object.keys(MEDIA_TYPES).find((t) => MEDIA_TYPES[t] === path.extname(kept)) || 'application/octet-stream';
    return { body: fs.readFileSync(path.join(config.mediaDir, kept)), type };
  }
  if (!/^https:\/\/|^http:\/\/127\.0\.0\.1[:/]/i.test(url)) throw new Error('not a secure address');
  const r = await fetch(url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`the address answered ${r.status}`);
  const type = String(r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!MEDIA_TYPES[type]) throw new Error(`not an image (${type || 'no type'})`);
  const body = Buffer.from(await r.arrayBuffer());
  if (body.length > MEDIA_MAX_BYTES) throw new Error('too large');
  fs.writeFileSync(path.join(config.mediaDir, `${id}-${index}${MEDIA_TYPES[type]}`), body);
  return { body, type };
}

const threadOf = (item, shown) => {
  const pendingKeys = new Set(item.pending.map((e) => e.key));
  return shown.map((e) => ({
    key: e.key, who: e.who, internal: !!e.internal, text: e.text || '', event: e.event || '', media: e.media || null, photos: e.photos || 0,
    by: displayNameFor(e.by) || '', auto: !!e.auto, via: e.via || '', at: e.at, unanswered: item.state === 'awaiting' && pendingKeys.has(e.key),
    // Seen on the phone and not on the dashboard.
    phone: !!e.phoneOnly,
    // A Marketplace reply the engine has queued for its phone to type into the chat.
    sending: !!e.sending,
  }));
};

/** Everything needed to show one open auction order. */
function presentOrder(item) {
  const shown = item.timeline.slice(-THREAD_LIMIT);
  return {
    ...summary(item),
    note: '', channel: 'auction', marketplace: null, mail: null, teaches: false,
    firstName: firstNameOf(item.lead), source: 'Auction order', leadStatus: '', location: '', email: item.lead.email || '',
    noLead: false, autoDraft: false, autoReason: '', firstReply: item.isFirstReply, looking: null, vehicle: null,
    order: orderOf(item),
    thread: threadOf(item, shown),
    earlier: item.timeline.length - shown.length,
    draft: draftOf(item),
  };
}

/** Everything needed to show one open conversation. */
function present(item) {
  if (item.order) return presentOrder(item);
  const v = item.vehicles[0];
  const shown = item.timeline.slice(-THREAD_LIMIT);
  return {
    ...summary(item),
    note: item.note,
    channel: item.channel,
    marketplace: marketplaceOf(item),
    mail: mailOf(item),
    // Whether the teaching buttons (Good reply, Could be better) belong here: the one gate in learn.js decides.
    teaches: !!item.standard || canLearnFrom(item.itemKey),
    firstName: firstNameOf(item.lead || {}),
    source: item.lead?.source || '',
    leadStatus: item.lead?.status || '',
    location: item.lead?.state || '',
    email: item.lead?.email || '',
    noLead: !item.hasLeadRecord,
    autoDraft: item.autoDraft,
    autoReason: item.autoReason,
    firstReply: item.isFirstReply,
    looking: lookingFor(item),
    vehicle: v ? { title: v.title, stockNo: v.stockNo, price: v.price, odometer: v.odometer, availability: shownAvailability(item, v), url: v.url, year: v.year, fuel: v.fuel, transmission: v.transmission, seats: v.seats, colour: v.color, included: v.outline || [] } : null,
    thread: threadOf(item, shown),
    earlier: item.timeline.length - shown.length,
    draft: draftOf(item),
    standard: item.standard ? { id: item.standard.id, title: item.standard.title, status: item.standard.status, note: item.standard.note, rung: item.standard.rung, situation: item.standard.situation } : null,
  };
}

const SECTIONS = ['dashboard', 'marketplace', 'auction', 'importquery', 'standards'];
// Standards: the model replies, on the page only while one is waiting for a rating. Once every
// one is approved or set aside the tab goes (the approved ones still set the standard), and it
// comes back when the file gains a scenario or "Could be better" writes one again.
// Import Query: email threads sent from Gmail; off when the intake is switched off.
const sectionOn = (s) => (s === 'marketplace' ? config.marketplace.enabled : s === 'standards' ? standardsCounts().toRate > 0 : s === 'importquery' ? config.mail.switchedOn : true);
const KEY = '((?:c|l|mp|ao|ph|tr|em):\\d+)';
const itemRoute = (tail = '') => new RegExp(`^/api/items/${KEY}${tail}$`);

const listCache = new Map();
const olderCache = new Map();
// Marketplace chats with a reply on its way to the engine right now, so a second press of Send
// while the first is still being answered cannot send the same reply twice.
const sendingNow = new Set();
const ALL_STATES = ['awaiting', 'answered', 'ack', 'closed', 'optout', 'other'];
// Conversations with activity in the last fortnight are rebuilt whenever anything is written;
// older ones only when something a row depends on has changed (see oldRowsStamp).
const RECENT_HOURS = 14 * 24;
const newest = (x, y) => (y.lastInboundAt || y.lastActivityAt) - (x.lastInboundAt || x.lastActivityAt);
// The "All" list: by the newest message whichever side wrote it, as in any messaging app.
const byLastMessage = (a, b) => (b.lastAt || 0) - (a.lastAt || 0);

/** The conversations older than a fortnight, kept until something that shows on their rows changes. */
function olderRows(section, hours) {
  const key = `${section}|${hours}`;
  const stamp = oldRowsStamp();
  const hit = olderCache.get(key);
  if (hit && hit.stamp === stamp) return hit.value;
  const value = listItems({ states: ALL_STATES, maxAgeHours: hours, olderThanHours: RECENT_HOURS, source: section, limit: Infinity });
  olderCache.set(key, { stamp: oldRowsStamp(), value });
  while (olderCache.size > 4) olderCache.delete(olderCache.keys().next().value);
  return value;
}

/**
 * The rows of one section, by tab. Every conversation ever stored is listed (hours = Infinity),
 * newest first, so an old thread with a new message comes to the top, as in any messaging app.
 * Built once and reused until something in the database is written; the auction lists also
 * once a minute, because what is due depends on the time of day. The page asks every twenty
 * seconds; without this every conversation was rebuilt three or four times each time.
 *
 * A dismissed conversation is not lost: it moves to the second tab, where it can be put back.
 */
function sectionRows(section, hours = Infinity) {
  const minute = section === 'auction' ? `|${Math.floor(Date.now() / 60000)}` : '';
  const files = section === 'standards' ? `|${modelRepliesStamp()}` : '';
  const stamp = `${dataStamp()}${minute}${files}`;
  const key = `${section}|${hours}`;
  const hit = listCache.get(key);
  if (hit && hit.stamp === stamp) return hit.value;

  let value;
  if (section === 'standards') {
    // To rate, Approved, Set aside, each in the order of the file.
    const now = Date.now();
    const rows = loadModelReplies().map((s) => scenarioItem(s.id, { now })).filter(Boolean).map(summary);
    value = { waiting: rows.filter((r) => r.standardStatus === 'PROPOSED' || r.standardStatus === 'CHANGED'), quiet: rows.filter((r) => r.standardStatus === 'APPROVED'), other: rows.filter((r) => r.standardStatus === 'REJECTED') };
  } else if (section === 'auction') {
    // To do, In progress, Finished.
    const rows = listOrderRows();
    value = { waiting: rows.filter((r) => r.state === 'awaiting'), quiet: rows.filter((r) => r.state === 'answered'), other: rows.filter((r) => r.state === 'closed') };
  } else {
    let all;
    if (hours <= RECENT_HOURS) {
      all = listItems({ states: ALL_STATES, maxAgeHours: hours, source: section, limit: Infinity });
    } else {
      const recent = listItems({ states: ALL_STATES, maxAgeHours: RECENT_HOURS, source: section, limit: Infinity });
      const have = new Set(recent.map((i) => i.itemKey));
      // Marketplace chats the engine has handed to a person come first, as listItems orders them.
      const order = section === 'marketplace' ? (a, b) => (Number(b.marketplace.needsPerson) - Number(a.marketplace.needsPerson)) || newest(a, b) : newest;
      all = [...recent, ...olderRows(section, hours).filter((i) => !have.has(i.itemKey))].sort(order);
    }
    const awaiting = all.filter((i) => i.state === 'awaiting').slice(0, LIST_LIMIT);
    const setAside = awaiting.filter((i) => isDismissed(i.itemKey, i.anchorKey));
    const quiet = all.filter((i) => ['ack', 'closed', 'optout'].includes(i.state)).slice(0, LIST_LIMIT);
    value = {
      waiting: awaiting.filter((i) => !setAside.includes(i)).map(summary),
      quiet: [...setAside, ...quiet].sort(newest).map(summary),
      // Conversations we replied to last: not waiting, not set aside, simply going on.
      answered: all.filter((i) => i.state === 'answered').slice(0, LIST_LIMIT).map(summary),
      other: section === 'dashboard' ? all.filter((i) => i.state === 'other').slice(0, LIST_LIMIT).map(summary) : [],
    };
  }
  // Every conversation in one list, newest message first, whoever wrote it. A reply does not move
  // a conversation away; it only takes it out of Waiting. Dismissed ones stay, marked.
  value.all = [...value.waiting, ...value.quiet, ...(value.answered || [])].sort(byLastMessage);
  value.unread = value.waiting.filter((r) => r.unread).length;
  // Building the rows can itself write (a first-time match key), which moves the stamp.
  listCache.set(key, { stamp: `${dataStamp()}${minute}${files}`, value });
  while (listCache.size > 12) listCache.delete(listCache.keys().next().value);
  return value;
}

async function api(req, res, url) {
  const p = url.pathname;

  if (req.method === 'GET' && p === '/api/status') {
    const facts = businessFactsForPrompt();
    // What Wheelman reads of the team's own replies, so the page can say it learns from them:
    // the dashboard's replies in the last year (whoever sent them), the past import emails, and
    // the salespeople's genuine replies in the example bank.
    let practice = { dashboard: 0, days: PRACTICE_DAYS, email: 0, voice: 0 };
    try { practice = { dashboard: recentPractice().length, days: PRACTICE_DAYS, email: config.mail.switchedOn ? recentMailPractice().length : 0, voice: loadExamples().length }; } catch { /* the counts are a courtesy */ }
    return send(res, 200, { ...worker.statusReport(), learned: learnedStats(), practice, facts: { ...facts.counts, unanswered: facts.unanswered, toConfirm: loadBusinessFacts().filter((t) => t.status === 'working').map((t) => t.title) } });
  }

  // Is Wheelman alive and able to read its database? For a watchdog, the demo check and a person.
  if (req.method === 'GET' && p === '/api/health') {
    let db = 'ok';
    try { dataStamp(); } catch (e) { db = e.message; }
    const s = worker.statusReport();
    const ok = db === 'ok';
    return send(res, ok ? 200 : 503, { ok, version: VERSION, startedAt: worker.state.startedAt, uptimeSeconds: Math.round((Date.now() - worker.state.startedAt) / 1000), db, lastSyncOk: !!(s.lastSync && s.lastSync.ok), lastSyncAt: s.lastSync?.at || null });
  }

  // The phone add-on reports what the Google Messages list shows. See allowed() for who may call this.
  if (req.method === 'POST' && p === '/api/phone/messages') {
    if (!config.phone.switchedOn) return send(res, 403, { error: 'The phone add-on is switched off (PHONE_ADDON=0 in the .env file).' });
    let report;
    try { report = validateReport(await readBody(req, 400000)); } catch (e) { return send(res, 400, { error: e.message === 'too large' ? 'The report is too large.' : e.message === 'bad json' ? 'The report could not be read.' : e.message }); }
    const out = storePhoneReport(report);
    worker.notePhoneReport({ ...out, signedOut: report.signedOut, found: report.found, hidden: report.hidden });
    return send(res, 200, { ok: true, ...out, serverTime: Date.now() });
  }

  if (req.method === 'GET' && p === '/api/phone/status') return send(res, 200, worker.statusReport().phone);

  // The Send to Wheelman button in Gmail hands over one email thread. See allowed() for who may call this.
  if (req.method === 'POST' && p === '/api/mail/threads') {
    if (!config.mail.switchedOn) return send(res, 403, { error: 'The email intake is switched off (MAIL_INTAKE=0 in the .env file).' });
    let report;
    try { report = validateMailReport(await readBody(req, 3000000)); } catch (e) { return send(res, 400, { error: e.message === 'too large' ? 'The thread is too large to take in.' : e.message === 'bad json' ? 'The thread could not be read.' : e.message }); }
    const out = storeMailThread(report);
    worker.noteMailReport(out);
    return send(res, 200, { ok: true, ...out, serverTime: Date.now() });
  }

  if (req.method === 'GET' && p === '/api/items') {
    const tab = ['all', 'waiting', 'quiet', 'other'].includes(url.searchParams.get('tab')) ? url.searchParams.get('tab') : 'waiting';
    // Every conversation unless a window is asked for (hours=72 keeps the list to the last three days).
    const askedHours = Number(url.searchParams.get('hours'));
    const hours = askedHours > 0 ? askedHours : Infinity;
    // Three separate sections: dashboard leads, Facebook Marketplace chats, and auction orders.
    const asked = url.searchParams.get('section');
    const section = SECTIONS.includes(asked) && sectionOn(asked) ? asked : 'dashboard';
    const here = sectionRows(section, hours);
    // How many are waiting in each section, and how many of those have something nobody has looked
    // at yet. The second is the number on the page and in the browser tab; it clears on opening.
    const sections = {}, unread = {};
    for (const s of SECTIONS) {
      const rows = sectionOn(s) ? sectionRows(s, hours) : null;
      sections[s] = rows ? rows.waiting.length : null;
      unread[s] = rows ? rows.unread : null;
    }
    // Auction orders are few, and one can be on any of the three lists: all of them are sent, so
    // a search finds an order wherever it is.
    const everything = section === 'auction' ? [...here.waiting, ...here.quiet, ...here.other] : undefined;
    // Twenty rows at a time (the page asks for more with "Load older conversations"); a search
    // looks through every row of the list, or every order, and sends the matches.
    const limit = Math.max(1, Math.min(LIST_LIMIT, Number(url.searchParams.get('limit')) || LIST_PAGE));
    const q = String(url.searchParams.get('q') || '').trim().slice(0, 200);
    const rows = q ? (everything || here[tab]).filter((r) => rowMatches(r, q)) : here[tab];
    return send(res, 200, { items: rows.slice(0, limit), total: rows.length, everything, counts: { all: here.all.length, waiting: here.waiting.length, quiet: here.quiet.length, other: here.other.length }, sections, unread, section, hours: Number.isFinite(hours) ? hours : null, q });
  }

  if (req.method === 'POST' && p === '/api/sync') {
    await Promise.all([worker.runSync(), worker.runMarketplaceSync()]);
    worker.updateOutcomes();
    worker.draftWaiting().catch(() => {});
    return send(res, 200, worker.statusReport());
  }

  // For an auction order, `message` is the kind of message picked from the "Which message?" list.
  let m = p.match(itemRoute());
  if (req.method === 'GET' && m) {
    const item = itemFromKey(m[1], { message: url.searchParams.get('message') || '' });
    if (!item) return send(res, 404, { error: 'That conversation was not found.' });
    if (item.standard) ensureScenarioDraft(item);
    return send(res, 200, { item: present(item) });
  }

  // The model replies: every scenario and where it stands.
  if (req.method === 'GET' && p === '/api/standards') {
    return send(res, 200, { counts: standardsCounts(), scenarios: loadModelReplies().map((s) => ({ id: s.id, key: `tr:${s.id}`, title: s.title, situation: s.situation, rung: s.rung, channel: s.channel, status: s.status, note: s.note, at: s.at })) });
  }

  // Set a scenario aside, or put it back to be rated.
  m = p.match(/^\/api\/standards\/(\d+)\/status$/);
  if (req.method === 'POST' && m) {
    const body = await readBody(req);
    if (!STATUSES.includes(body.status)) return send(res, 400, { error: 'Not a status.' });
    if (!scenarioOf(Number(m[1]))) return send(res, 404, { error: 'No such scenario.' });
    setScenarioStatus(Number(m[1]), { status: body.status });
    return send(res, 200, { ok: true, item: present(itemFromKey(`tr:${m[1]}`)) });
  }

  // A photo from a text: fetched once from the address the dashboard stored with the message, kept
  // beside the database, and served from there. Only an address stored with a message is ever
  // fetched; nothing the page sends is used as an address.
  m = p.match(/^\/api\/media\/(\d+)\/(\d{1,2})$/);
  if (req.method === 'GET' && m) {
    const url = messageMedia(m[1])[Number(m[2])];
    if (!url) return send(res, 404, { error: 'No photo for that message.' });
    try {
      const { body, type } = await cachedMedia(Number(m[1]), Number(m[2]), url);
      return send(res, 200, body, type, { 'cache-control': 'private, max-age=86400' });
    } catch (e) {
      logLine('media', `Photo for message ${m[1]} could not be fetched: ${e.message}`);
      return send(res, 502, { error: 'The photo could not be fetched. Try again in a moment.' });
    }
  }

  // "Load older messages": the `limit` entries before the newest `shown` ones, and how many are older still.
  m = p.match(itemRoute('/thread'));
  if (req.method === 'GET' && m) {
    const item = itemFromKey(m[1]);
    if (!item) return send(res, 404, { error: 'That conversation was not found.' });
    const shown = Math.max(0, Math.min(item.timeline.length, Number(url.searchParams.get('shown')) || 0));
    const limit = Math.max(1, Math.min(500, Number(url.searchParams.get('limit')) || THREAD_LIMIT));
    const end = item.timeline.length - shown;
    const start = Math.max(0, end - limit);
    return send(res, 200, { thread: threadOf(item, item.timeline.slice(start, end)), earlier: start });
  }

  m = p.match(itemRoute('/draft'));
  if (req.method === 'POST' && m) {
    const body = await readBody(req);
    const picked = { message: String(body.message || '') };
    const item = itemFromKey(m[1], picked);
    if (!item) return send(res, 404, { error: 'That conversation was not found.' });
    const instruction = String(body.instruction || '').slice(0, 600);
    let draft;
    if (item.order && !(item.orderStatus.kind === 'reply' && !picked.message)) {
      // A message to an auction customer is written from its template. No AI is asked.
      if (!item.message) return send(res, 400, { error: 'Choose which message to write first.' });
      draft = await draftOrderMessage(item, { type: item.message, facts: instruction });
    } else {
      draft = await draftFor(item, { instruction });
    }
    return send(res, 200, { item: present(itemFromKey(m[1], picked) || item), ok: draft.status === 'ready', error: draft.error || '' });
  }

  // Send, Marketplace only: the text in the message box goes to the buyer through the content
  // engine's own reply address, the one its inbox page uses. The engine queues it and its phone
  // types it into the chat. Only a Marketplace key matches this route; a dashboard or auction
  // conversation has no send. Nothing is learned from what was sent (RULE-4).
  m = p.match(/^\/api\/items\/(mp:\d+)\/send$/);
  if (req.method === 'POST' && m) {
    if (!config.marketplace.enabled) return send(res, 403, { error: 'The Marketplace section is switched off.' });
    const item = itemFromKey(m[1]);
    if (!item || item.channel !== 'marketplace') return send(res, 404, { error: 'That Marketplace chat was not found.' });
    const body = await readBody(req);
    const text = String(body.text ?? '').replace(/\r/g, '').trim();
    if (!text) return send(res, 400, { error: 'There is nothing to send.' });
    // A blank is for the person to fill in. It is never sent to a buyer as it stands.
    const blanks = [...new Set([...text.matchAll(blankMatcher())].map((x) => x[0]))];
    if (blanks.length) return send(res, 400, { error: `Fill in ${blanks.length === 1 ? 'the blank' : 'the blanks'} before sending: ${blanks.join(', ')}.` });
    if (sendingNow.has(item.itemKey)) return send(res, 409, { error: 'This reply is already on its way.' });
    sendingNow.add(item.itemKey);
    try {
      const out = await sendReply(item.marketplace.id, text);
      // The suggestion it came from: what was in the box is kept with it, and that Send was pressed.
      const draft = Number(body.draftId) ? getDraft(Number(body.draftId)) : null;
      if (draft && draft.item_key === item.itemKey) { onEdited(item, draft.id, text); recordSentHere(draft.id); }
      // The engine's record of the queued reply goes into the thread at once; then the chat is read
      // again so everything else is current too. If that read fails, the next check brings it.
      if (out.message && Number.isInteger(Number(out.message.id))) appendMpMessage(item.marketplace.id, normalizeMpMessage(out.message, 0, item.marketplace.id));
      try {
        const detail = await fetchConversation(item.marketplace.id);
        if (detail?.conversation?.id === item.marketplace.id) storeMpConversation(detail.conversation, detail.messages || []);
      } catch (e) { logLine('marketplace', `${item.itemKey}: the reply was sent, but the chat could not be read back: ${e.message}`); }
      logLine('marketplace', `${item.itemKey}: a reply was sent from the page (${text.length} characters)${out.workerOnline ? '' : '; the engine\'s phone is offline, so it is queued'}`);
      return send(res, 200, { ok: true, queued: !out.workerOnline, item: present(itemFromKey(m[1]) || item) });
    } catch (e) {
      logLine('marketplace', `${item.itemKey}: the reply could not be sent. ${e.message}`);
      return send(res, 502, { error: e.message });
    } finally { sendingNow.delete(item.itemKey); }
  }

  m = p.match(itemRoute('/dismiss'));
  if (req.method === 'POST' && m) {
    const item = itemFromKey(m[1]);
    if (!item) return send(res, 404, { error: 'That conversation was not found.' });
    dismiss(item.itemKey, item.anchorKey);
    return send(res, 200, { ok: true });
  }

  // The conversation was opened on the page: its number badge goes away until a new message arrives.
  m = p.match(itemRoute('/seen'));
  if (req.method === 'POST' && m) {
    const item = itemFromKey(m[1]);
    if (!item) return send(res, 404, { error: 'That conversation was not found.' });
    markSeen(item.itemKey, item.anchorKey);
    return send(res, 200, { ok: true });
  }

  // Undo for Dismiss: the conversation goes back to Waiting. For an auction order it also undoes
  // "copied": the message that was due is due again, and leaves the thread.
  m = p.match(itemRoute('/restore'));
  if (req.method === 'POST' && m) {
    const item = itemFromKey(m[1]);
    if (!item) return send(res, 404, { error: 'That conversation was not found.' });
    undismiss(item.itemKey);
    if (item.order) uncopy(item.itemKey, item.anchorKey);
    return send(res, 200, { ok: true, item: present(itemFromKey(m[1]) || item) });
  }

  // The owner pasted a message into an auction order: what the customer wrote on WhatsApp (a
  // reply is then suggested), or something we sent by hand (so the thread stays true).
  m = p.match(itemRoute('/paste'));
  if (req.method === 'POST' && m) {
    const item = itemFromKey(m[1]);
    if (!item?.order) return send(res, 404, { error: 'That order was not found.' });
    const body = await readBody(req);
    const direction = body.direction === 'out' ? 'out' : 'in';
    const text = cleanPaste(body.text).slice(0, 4000);
    if (!text) return send(res, 400, { error: 'There was nothing to paste.' });
    const id = addOrderMessage(item.order.id, direction, text);
    let draft = null;
    if (direction === 'in') draft = await draftFor(itemFromKey(m[1]));
    return send(res, 200, { item: present(itemFromKey(m[1])), pasteId: id, ok: !draft || draft.status === 'ready', error: draft?.error || '' });
  }

  m = p.match(itemRoute('/paste/(\\d+)/remove'));
  if (req.method === 'POST' && m) {
    const item = itemFromKey(m[1]);
    if (!item?.order) return send(res, 404, { error: 'That order was not found.' });
    removeOrderMessage(item.order.id, Number(m[2]));
    return send(res, 200, { ok: true, item: present(itemFromKey(m[1])) });
  }

  // Copy was pressed: remember exactly what the person chose to use.
  m = p.match(/^\/api\/drafts\/(\d+)\/copied$/);
  if (req.method === 'POST' && m) {
    const body = await readBody(req);
    const draft = getDraft(Number(m[1]));
    if (!draft) return send(res, 404, { error: 'Suggestion not found.' });
    const item = itemFromKey(draft.item_key);
    const result = item ? onCopied(item, draft.id, String(body.text || '')) : { learned: false, why: 'conversation not found' };
    return send(res, 200, { ok: true, ...result });
  }

  // The text in the message box changed: keep it with the suggestion, so it is still there after a reload.
  m = p.match(/^\/api\/drafts\/(\d+)\/edit$/);
  if (req.method === 'POST' && m) {
    const body = await readBody(req);
    const draft = getDraft(Number(m[1]));
    if (!draft) return send(res, 404, { error: 'Suggestion not found.' });
    if (typeof body.text !== 'string') return send(res, 400, { error: 'No text was given.' });
    const result = onEdited(itemFromKey(draft.item_key), draft.id, body.text);
    return send(res, 200, { ...result, savedAt: Date.now() });
  }

  m = p.match(/^\/api\/drafts\/(\d+)\/rating$/);
  if (req.method === 'POST' && m) {
    const body = await readBody(req);
    const rating = ['good', 'edit', 'bad', ''].includes(body.rating) ? body.rating : '';
    const draft = getDraft(Number(m[1]));
    if (!draft) return send(res, 404, { error: 'Suggestion not found.' });
    setDraftRating(draft.id, rating);
    onRated(draft.id, rating);
    // A model reply: "Good reply" approves the text as it stands in the box as the standard, with the
    // invented name back to {{NAME}} and without the standard block; nothing is learned.
    if (/^tr:/.test(draft.item_key)) {
      const id = Number(draft.item_key.slice(3));
      const scenario = itemFromKey(draft.item_key);
      if (rating === 'good') setScenarioStatus(id, { status: 'APPROVED', reply: maskGreetingNames(redact(comparable(currentText(draft)), scenario?.lead)) });
      else setScenarioStatus(id, { status: 'PROPOSED' });
      return send(res, 200, { ok: true, learned: false, standard: true, why: '' });
    }
    // "Good reply": the suggestion becomes a model for similar messages. Taking it back forgets it.
    const item = itemFromKey(draft.item_key);
    const result = item ? onApproved(item, draft.id, rating === 'good') : { learned: false, why: 'conversation not found' };
    return send(res, 200, { ok: true, learned: !!result.learned, why: result.why || '' });
  }

  // "Could be better": what the owner says should be different is kept for similar messages.
  m = p.match(/^\/api\/drafts\/(\d+)\/advice$/);
  if (req.method === 'POST' && m) {
    const body = await readBody(req);
    const draft = getDraft(Number(m[1]));
    if (!draft) return send(res, 404, { error: 'Suggestion not found.' });
    const item = itemFromKey(draft.item_key);
    const note = String(body.note || '').slice(0, 600);
    // A model reply: the note is kept with the scenario and the reply is written again; nothing is learned.
    if (item?.standard) {
      if (!note.trim()) return send(res, 200, { ok: false, learned: false, why: 'nothing was said', lessons: [] });
      setScenarioStatus(item.standard.id, { status: 'CHANGED', note });
      setDraftRating(draft.id, 'edit');
      const next = await draftFor(item, { coaching: { note, draft: draft.reply } });
      return send(res, 200, { item: present(itemFromKey(draft.item_key) || item), ok: next.status === 'ready', error: next.error || '', learned: false, standard: true, lessons: [], pending: false });
    }
    const result = item ? await onAdvice(item, draft.id, note) : { learned: false, why: 'conversation not found' };
    if (!result.learned) return send(res, 200, { ok: false, learned: false, why: result.why || '', lessons: [] });
    setDraftRating(draft.id, 'edit');
    onApproved(item, draft.id, false);
    // The same note guides a new draft for this customer, as coaching, not as wording to send.
    const next = await draftFor(item, { coaching: { note, draft: draft.reply } });
    return send(res, 200, { item: present(itemFromKey(draft.item_key) || item), ok: next.status === 'ready', error: next.error || '', learned: true, lessons: result.lessons || [], pending: !!result.pending });
  }

  return send(res, 404, { error: 'Not found' });
}

function serveStatic(res, url) {
  if (url.pathname === '/favicon.ico') { res.writeHead(204, { 'cache-control': 'max-age=86400' }); return res.end(); }
  const rel = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, '');
  const file = path.resolve(config.webDir, rel);
  if (!file.startsWith(path.resolve(config.webDir) + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
  send(res, 200, fs.readFileSync(file), TYPES[path.extname(file)] || 'application/octet-stream');
}

export function startServer() {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (!allowed(req, url.pathname)) return send(res, 403, { error: 'This page can only be used from this computer.' });
      if (url.pathname.startsWith('/api/')) return await api(req, res, url);
      if (req.method !== 'GET') return send(res, 405, { error: 'Not allowed' });
      return serveStatic(res, url);
    } catch (e) {
      send(res, 500, { error: e.message });
    }
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, '127.0.0.1', () => resolve(server));
  });
}
