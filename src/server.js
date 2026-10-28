// The local page and its data. Listens on this computer only (127.0.0.1).

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { listItems, itemFromKey, orderRows } from './items.js';
import { latestDraft, getDraft, dismiss, undismiss, isDismissed, setDraftRating, markSeen, isSeen, dataStamp, uncopy, addOrderMessage, removeOrderMessage, setItemRuling, clearItemRuling, setItemMove, clearItemMove, openFollowUps, getFollowUp, closeFollowUp, reopenFollowUp } from './db.js';
import { stillDue, refreshFollowUps } from './followup.js';
import { MESSAGES, messagesFor, wantedText, carTitle, lotName, lotPageUrl, cleanPaste } from './orders.js';
import { draftOrderMessage, enquiryTemplates, enquiryOrder } from './ordermessages.js';
import { templatesFor, hasSectionTemplate, draftSectionTemplate, sectionTemplateLabel } from './sectiontemplates.js';
import { draftFor, writingNow } from './drafter.js';
import { availability } from './normalize.js';
import { firstNameOf, isPlaceholderName } from './redact.js';
import { signedName } from './signature.js';
import { rowMatches } from '../web/lib/search.js';
import { searchAll } from './search.js';
import { RUNG_LABELS } from './selling.js';
import { teachesHere } from './learn.js';
import { validateMailReport, storeMailThread } from './mail.js';
import { recentPractice, PRACTICE_DAYS } from './practice.js';
import { recentMailPractice } from './mailpractice.js';
import { loadExamples } from './examples.js';
import { oldRowsStamp, messageMedia, getVehicleByStock } from './db.js';
import { fetchPicture } from './media.js';
import { vehicleMedia, vehiclePicture, findCars, carSummary, VIDEO_HOSTS } from './vehiclemedia.js';
import { logLine } from './log.js';
import { businessFactsForPrompt, loadBusinessFacts } from './knowledge.js';
import * as worker from './worker.js';
import { onCopied, onRated, onApproved, onAdvice, onEdited, onRemember, canLearnFrom } from './learn.js';
import { displayNameFor } from './people.js';
import { answeredBy, lastCustomerEntry, replyShown, wentAfter, sameReply, alreadySent } from './answered.js';
import { reservedByAnother } from './deal.js';
import { wantedFrom, enquiryStage } from './imports.js';
import { SECTIONS, sectionOn, movesFor, onImportsList } from './placement.js';
import { learnedStats, listLessons, switchLesson } from './db.js';
import { validateReport, storePhoneReport } from './phone.js';
import { sendReply, fetchConversation, normalizeMpMessage, tagMarketplaceLinks } from './marketplace.js';
import { storeMpConversation } from './sync.js';
import { appendMpMessage, recordSentHere } from './db.js';
import { blankMatcher } from '../web/lib/blank.js';
import { share, viaTunnel, signedIn, checkPassword, signinToken, signinCookie, tooManyTries, noteWrong, clearWrong } from './share.js';
import { PROVIDERS, PROVIDER_ORDER, aiChoice, setAiChoice, listModels, saveKey, ROLES, ROLE_LABELS, roleChoice, setRoleChoice, allRoleChoices } from './aimodels.js';
import { budgetStatus } from './budget.js';
import { listRuns, readRun, vote as reviewVote, summarise } from './review.js';
import { providers as aiProviders, usageDetail } from './llm.js';

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
    // Pictures only from Wheelman itself; a car's videos also from Carbarn's own storage, where they play from.
    'content-security-policy': `default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; media-src 'self' ${VIDEO_HOSTS.map((h) => `https://${h}`).join(' ')}; connect-src 'self'; frame-ancestors 'none'`,
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
 *
 * When the page is shared with the team (src/share.js), a request through the tunnel is let in
 * as well, once gate() has seen the sign-in cookie: a GET as it is, and a POST only from the
 * shared page itself (the browser names the page's own address as the origin) and only JSON.
 */
function allowed(req, pathname = '') {
  const host = String(req.headers.host || '');
  if (viaTunnel(req)) {
    if (!config.share.on || !config.share.password) return false;
    if (req.method === 'GET') return true;
    const proto = /^https?$/.test(String(req.headers['x-forwarded-proto'] || '')) ? req.headers['x-forwarded-proto'] : 'https';
    return String(req.headers.origin || '') === `${proto}://${host}` && /application\/json/i.test(String(req.headers['content-type'] || ''));
  }
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

// An auction order's message is kept under its kind: each kind its own (a reply to what they wrote has none).
// Any other conversation: the template picked, '' for the reply to what they wrote; none picked, the newest.
const templateOf = (item) => (item.order ? item.message || '' : item.templatePick);

function draftOf(item) {
  const draft = latestDraft(item.itemKey, item.anchorKey, templateOf(item));
  return draft ? {
    id: draft.id, status: draft.status, reply: draft.reply || '', checks: draft.checks, factsUsed: draft.factsUsed,
    // What the person has typed over the suggestion: null when untouched, '' when they cleared it.
    edited: typeof draft.edited_text === 'string' ? draft.edited_text : null, editedAt: draft.edited_at || null,
    model: draft.model, provider: draft.provider, createdAt: draft.created_at, instruction: draft.instruction || '', error: draft.error || '', rating: draft.rating || '',
    // The template it was written from, if any (its kind, for an auction message).
    template: draft.template || '',
    // Marketplace only: when Send was pressed on this suggestion.
    sentHereAt: draft.sent_here_at || null,
    // An import email: what was looked up on the website, found and not found, with its sources.
    research: draft.research || null,
    // How many of the team's own replies to similar messages the request showed.
    practiceUsed: draft.context?.practice || 0,
    // The AI thought an ordinary enquiry might be an import one: the page offers to treat it so.
    aiImport: !!draft.context?.aiImport,
    // Which of our records' notes on the customer shaped the reply (labels only); never said to them.
    insiderUsed: Array.isArray(draft.context?.insider) ? draft.context.insider : [],
    needsHuman: (draft.needsHuman || []).filter((n) => n && n.marker && n.reason).map((n) => ({ marker: String(n.marker), reason: String(n.reason) })),
    // What the reply is for: the one next step it offers, and where the customer is on the way to a sale.
    nextStep: draft.next_step || '', rung: draft.rung || '', rungLabel: RUNG_LABELS[draft.rung] || '',
    // The reply's parts: the AI's words and each block code added, with its label and why (src/parts.js).
    parts: draft.context?.parts || null,
    // Each figure and link in the AI's part and in the blocks, with where it came from (traceFacts in src/checks.js).
    facts: draft.context?.facts || [],
    // The owner's lessons the request carried ({ adviceId, n, do, scope, at }), and which of code's rules shaped the reply.
    lessonsApplied: draft.context?.lessons || [],
    rules: draft.context?.rules || null,
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

/** A follow-up as the page sees it: why it is due, and what became of it ('' while it is open). */
const followUpOf = (r) => ({ id: r.id, kind: r.kind, reason: r.reason, dueAt: r.due_at, done: r.done_how || '', template: r.template });

/**
 * How a conversation was answered ({ how, by, at }), or null while it is not answered. The
 * suggestion compared is the one for the customer message our reply answered.
 */
function answeredOf(item) {
  if (item.state !== 'answered') return null;
  const customer = lastCustomerEntry(item.timeline);
  return answeredBy(item.timeline, customer ? latestDraft(item.itemKey, customer.key) : null, displayNameFor);
}

/** One row in the conversation list. Deliberately small. */
function summary(item) {
  if (item.order) return { ...item.orderRow, anchor: item.anchorKey, answered: null, flag: flagLevel(draftOf(item)) };
  const draft = draftOf(item);
  const last = item.timeline[item.timeline.length - 1];
  const lastShown = [...item.timeline].reverse().find((e) => !e.internal) || last;
  return {
    key: item.itemKey,
    section: item.section,
    account: item.marketplace?.account || '',
    // An email thread: the customer's address, and how many of its messages Gmail had folded.
    email: item.mail?.customerEmail || '',
    collapsed: item.mail?.collapsed || 0,
    needsPerson: !!item.marketplace?.needsPerson,
    replyComing: !!item.marketplace?.replyComing,
    anchor: item.anchorKey,
    state: item.state,
    // Who answered it, when it is answered: 'wheelman', 'auto', 'phone', 'facebook' or 'dashboard'.
    answered: answeredOf(item),
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
    car: item.mail ? (item.mail.car || item.mail.subject) : item.vehicles[0]?.title || item.marketplace?.listingTitle || (item.imports ? wantedFrom(item).car : ''),
    // An import enquiry in Imports that is not an email: where it has got to, as its row in Auction said.
    ...(item.section === 'importquery' && item.channel !== 'email' && item.imports ? { stage: enquiryStage(item).label } : {}),
  };
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

const WHERE = { japan: 'Still in Japan', transit: 'On the way to Australia', arrived: 'Arrived in Australia', online: 'At the Lidcombe showroom', sold: 'Handed over' };
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
    // How the customer wrote, so how the reply goes: 'sms' (pasted into the dashboard) or 'whatsapp'.
    replyVia: s.replyVia || '',
    // The customer's own conversation: answered on this order (here), or where it is listed.
    texts: item.orderTexts,
  };
}

// Photos are kept beside the database once fetched, under their message id, so each is fetched once.
const cachedMedia = (id, index, url) => fetchPicture(url, config.mediaDir, `${id}-${index}`);

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
    noLead: false, autoDraft: false, autoReason: '', writeOnOpen: false, firstReply: item.isFirstReply, looking: null, vehicle: null,
    order: orderOf(item),
    // Its messages are in order.messages, gated by where the order stands.
    templates: [],
    thread: threadOf(item, shown),
    earlier: item.timeline.length - shown.length,
    draft: draftOf(item),
    writing: writingNow(item.itemKey, item.anchorKey),
  };
}

/**
 * "Which message?" for a conversation that is not an auction order: the templates that fit it, and
 * the one in the box even when it no longer fits (picked before the customer wrote again, or the
 * car sold since), so the list always says what the box holds. In Imports, a conversation that is
 * not an email has the enquiry messages it had in Auction first, then the Imports templates; an
 * email has only its own. One mark of best in a list: the enquiry message that is due, else the
 * Imports template that fits best.
 */
function offeredTemplates(item, shown) {
  const imports = item.section === 'importquery';
  const asks = imports ? enquiryTemplates(item) : [];
  const due = asks.some((t) => t.due);
  const list = item.section === 'auction' ? enquiryTemplates(item)
    : imports ? [...asks.map((t) => ({ ...t, best: t.due })), ...templatesFor(item).map((t) => (due ? { ...t, best: false } : t))]
      : templatesFor(item);
  if (!shown || item.state === 'optout' || list.some((t) => t.id === shown)) return list;
  const label = item.section === 'auction' ? MESSAGES[shown] : imports ? MESSAGES[shown] || sectionTemplateLabel(item, shown) : sectionTemplateLabel(item, shown);
  return label ? [...list, { id: shown, label, best: false }] : list;
}

/** Everything needed to show one open conversation. */
function present(item) {
  if (item.order) return presentOrder(item);
  const v = item.vehicles[0];
  const shown = item.timeline.slice(-THREAD_LIMIT);
  const draft = draftOf(item);
  return {
    ...summary(item),
    // The situation's key (SITUATIONS in src/situations.js) beside its label: the new page's Remember scope.
    situationKey: item.situation.primary,
    note: item.note,
    // The sale stage, when there is one: the new page's stage line reads it.
    deal: item.deal ? { stage: item.deal.stage, stageText: item.deal.stageText, source: item.deal.source } : null,
    channel: item.channel,
    marketplace: marketplaceOf(item),
    mail: mailOf(item),
    // Whether the teaching buttons (Good reply, Could be better) belong here: the one gate in learn.js decides.
    teaches: teachesHere(item),
    firstName: firstNameOf(item.lead || {}),
    source: item.lead?.source || '',
    leadStatus: item.lead?.status || '',
    location: item.lead?.state || '',
    email: item.lead?.email || '',
    noLead: !item.hasLeadRecord,
    autoDraft: item.autoDraft,
    autoReason: item.autoReason,
    // A Facebook buyer waiting on us: never written in the background, so both pages write it when
    // it is opened (web/lib/onopen.js), however old the message. Not an archived chat, one not
    // marked as a buyer, or a photo with no words.
    writeOnOpen: item.channel === 'marketplace' && item.autoDraft && item.state === 'awaiting',
    firstReply: item.isFirstReply,
    // The follow-up in hand (opened from the Follow-ups list: the anchor is then "fu:<id>"), or the
    // one that is due for this conversation; null when there is none.
    followUp: item.followUp ? followUpOf(item.followUp) : item.followUpDue ? followUpOf(item.followUpDue) : null,
    looking: lookingFor(item),
    // An ordinary enquiry read as an import enquiry (why, the car, and for the words sign the
    // customer's sentence that holds them), and the owner's ruling on it.
    judged: item.judged ? { sign: item.judged.sign, why: item.judged.why, car: item.judged.car?.title || '', quote: item.judged.quote || '' } : null,
    ruling: item.ruling ? { kind: item.ruling.kind } : null,
    // Answered the import way: from the Imports list or the website's import form, read so, ruled so, or listed with the auction customers.
    isImport: !!item.imports,
    canRule: /^[cl]:/.test(item.itemKey),
    // Where it belongs, where it is listed when the owner moved it (else null), and where it may go.
    home: item.home,
    moved: item.section !== item.home ? item.section : null,
    moves: movesFor(item),
    canMove: movesFor(item).includes('importquery'),
    // "Which message?": the templates that fit this conversation, and the one in the box ('' the reply to what they wrote).
    templates: offeredTemplates(item, item.templatePick ?? (draft?.template || '')),
    template: item.templatePick ?? (draft?.template || ''),
    // Why it is listed where it is, when it is not where it came in: 'moved' (the owner), 'imports'
    // (in Imports from the dashboard's Imports list), 'order' (in Auction: an auction order under
    // way), or ''.
    listed: item.move ? 'moved'
      : item.section === 'importquery' && item.home === 'importquery' && onImportsList(item) ? 'imports'
        : item.section === 'auction' && item.home === 'auction' ? 'order' : '',
    vehicle: v ? { title: v.title, stockNo: v.stockNo, price: v.price, odometer: v.odometer, availability: shownAvailability(item, v), url: v.url, year: v.year, fuel: v.fuel, transmission: v.transmission, seats: v.seats, colour: v.color, included: v.outline || [] } : null,
    thread: threadOf(item, shown),
    earlier: item.timeline.length - shown.length,
    draft,
    // A suggestion is being written for this message right now, by the page or in the background.
    writing: writingNow(item.itemKey, item.anchorKey),
  };
}

const KEY = '((?:c|l|mp|ao|ph|em):\\d+)';
const itemRoute = (tail = '') => new RegExp(`^/api/items/${KEY}${tail}$`);

const listCache = new Map();
const olderCache = new Map();
// Marketplace chats with a reply on its way to the engine right now, so a second press of Send
// while the first is still being answered cannot send the same reply twice.
const sendingNow = new Set();
// Marketplace chats whose last send the engine did not answer in time, so the reply may have gone:
// { text, anchor, draftId, at, found, told } by key. The next send on that chat, from any page,
// first has a fresh Marketplace read and looks for that reply. Not there: the note goes. There
// (found): those words are never sent to that chat again, and other words are held back once
// (told) while the chat is answered by that reply. A later send the engine takes ends the note
// (kept in memory: a restart forgets it).
const mayHaveGone = new Map();
const ALL_STATES = ['awaiting', 'answered', 'ack', 'closed', 'optout', 'other'];
// Conversations with activity in the last fortnight are rebuilt whenever anything is written;
// older ones only when something a row depends on has changed (see oldRowsStamp).
const RECENT_HOURS = 14 * 24;
const newest = (x, y) => (y.lastInboundAt || y.lastActivityAt) - (x.lastInboundAt || x.lastActivityAt);
// The "All" list: by the newest message whichever side wrote it, as in any messaging app.
const byLastMessage = (a, b) => (b.lastAt || 0) - (a.lastAt || 0);

// A list kept for one state of the email intake: Imports lists emails only while it is on. The
// intake is read from .env at start, so this matters only where it is switched while running.
const listKey = (section, hours) => `${section}|${hours}|${section === 'importquery' && config.mail.switchedOn ? 'mail' : ''}`;

/** The conversations older than a fortnight, kept until something that shows on their rows changes. */
function olderRows(section, hours) {
  const key = listKey(section, hours);
  const stamp = oldRowsStamp();
  const hit = olderCache.get(key);
  if (hit && hit.stamp === stamp) return hit.value;
  const value = listItems({ states: ALL_STATES, maxAgeHours: hours, olderThanHours: RECENT_HOURS, source: section, limit: Infinity });
  olderCache.set(key, { stamp: oldRowsStamp(), value });
  while (olderCache.size > 4) olderCache.delete(olderCache.keys().next().value);
  return value;
}

/**
 * The conversations listed in Auction that are not orders, as rows like an order's: a conversation
 * the owner moved there, or another conversation of a customer whose order is under way (the one
 * the order reads is under the order). To do while the customer waits on us, In progress once we
 * have answered, Finished when there is nothing more to do. Rebuilt only when something in the
 * database changes, not with the orders' minute.
 */
let enquiryCache = null;
function enquiryRows() {
  const stamp = dataStamp();
  if (enquiryCache?.stamp === stamp) return enquiryCache.value;
  const value = { waiting: [], quiet: [], other: [] };
  for (const item of listItems({ states: ALL_STATES, maxAgeHours: Infinity, source: 'auction', limit: Infinity })) {
    if (item.state === 'other') continue;
    const stage = enquiryStage(item);
    const waiting = item.state === 'awaiting';
    const row = { ...summary(item), stage: stage.label, stageCode: stage.code, situation: stage.label, due: waiting ? 'Reply to their message' : '', dueKind: waiting ? 'reply' : '' };
    if (waiting && !row.dismissed) value.waiting.push(row);
    else if (['closed', 'optout'].includes(item.state)) value.other.push(row);
    else value.quiet.push(row);
  }
  enquiryCache = { stamp: dataStamp(), value };
  return value;
}

/**
 * The Follow-ups list: every follow-up that is due and not yet dealt with, each with its
 * conversation, the one due most recently first. Dashboard only; a row whose conversation has
 * left the dashboard is left out here and closed by the worker's next pass.
 */
function followUpRows() {
  const rows = [];
  for (const r of openFollowUps()) {
    const item = itemFromKey(r.item_key, { followUp: r.id });
    if (!item || item.section !== 'dashboard') continue;
    rows.push({ ...summary(item), followUp: followUpOf(r) });
  }
  return rows;
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
  const stamp = `${dataStamp()}${minute}`;
  const key = listKey(section, hours);
  const hit = listCache.get(key);
  if (hit && hit.stamp === stamp) return hit.value;

  let value;
  if (section === 'auction') {
    // To do, In progress, Finished: the orders, and the enquiries that have no order yet.
    const rows = orderRows();
    const asks = enquiryRows();
    const rank = (r) => (r.dueKind === 'reply' ? 0 : r.state === 'awaiting' ? 1 : 2);
    const order = (a, b) => rank(a) - rank(b) || (b.lastAt || 0) - (a.lastAt || 0);
    value = {
      waiting: [...rows.filter((r) => r.state === 'awaiting'), ...asks.waiting].sort(order),
      quiet: [...rows.filter((r) => r.state === 'answered'), ...asks.quiet].sort(order),
      other: [...rows.filter((r) => r.state === 'closed'), ...asks.other].sort(order),
      followups: [],
    };
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
      // Conversations we replied to last that are due a follow-up (src/followup.js). The list of
      // its own; nothing marks them in All.
      followups: section === 'dashboard' ? followUpRows() : [],
    };
  }
  // Every conversation in one list, newest message first, whoever wrote it. A reply does not move
  // a conversation away; it only takes it out of Waiting. Dismissed ones stay, marked.
  value.all = [...value.waiting, ...value.quiet, ...(value.answered || [])].sort(byLastMessage);
  value.unread = value.waiting.filter((r) => r.unread).length;
  // Building the rows can itself write (a first-time match key), which moves the stamp.
  listCache.set(key, { stamp: `${dataStamp()}${minute}`, value });
  while (listCache.size > 12) listCache.delete(listCache.keys().next().value);
  return value;
}

/** Lists a conversation in a section: its own one forgets the move. */
function moveTo(item, section) {
  if (section === item.home) clearItemMove(item.itemKey, item.lead?.id || null);
  else setItemMove(item.itemKey, item.lead?.id || null, section);
}

/** Why a conversation cannot go to that section, in words for the page. */
function whyNotMoved(item, section) {
  if (item.order) return 'An auction order stays in Auction.';
  if (!SECTIONS.includes(section)) return 'That is not one of the sections.';
  if (section === 'marketplace') return 'Only a Facebook chat can be in Marketplace.';
  if (!sectionOn(section)) return 'That section is switched off.';
  if (section === item.section) return 'It is already there.';
  return 'It cannot be moved there.';
}

/**
 * After a ruling or a move, the suggestion is written again the new way: unless the owner has
 * already changed, copied or sent it, the customer is not waiting, or it is set aside. A
 * conversation now listed under an auction order is answered there instead. A Facebook chat is
 * written only where opening it would write it (autoDraft: a buyer, with words, not archived), so a
 * seller's chat or a photo with no words is not. With `keep` nothing is written: the owner has text
 * in the box (the page's type change), and its edit may not have landed yet.
 */
function writeAgainIfUntouched(key, item, { keep = false } = {}) {
  const fresh = itemFromKey(key) || item;
  if (keep) return { fresh, writing: false };
  const d = latestDraft(fresh.itemKey, fresh.anchorKey);
  const untouched = !d || (['ready', 'failed'].includes(d.status) && typeof d.edited_text !== 'string' && !d.copied_at && !d.sent_here_at);
  const wanted = fresh.channel !== 'marketplace' || fresh.autoDraft;
  const writing = fresh.state === 'awaiting' && untouched && wanted && !fresh.underOrder && !isDismissed(fresh.itemKey, fresh.anchorKey);
  if (writing) draftFor(fresh, { instruction: '' }).catch(() => {});
  return { fresh, writing };
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
    // Sharing with the team: the address colleagues open, once the tunnel has one.
    const shared = { on: config.share.on && !!config.share.password, url: share.url || '', running: share.running, error: share.error };
    return send(res, 200, { ...worker.statusReport(), learned: learnedStats(), practice, share: shared, facts: { ...facts.counts, unanswered: facts.unanswered, toConfirm: loadBusinessFacts().filter((t) => t.status === 'working').map((t) => t.title) } });
  }

  // Is Wheelman alive and able to read its database? For a watchdog, the demo check and a person.
  if (req.method === 'GET' && p === '/api/health') {
    let db = 'ok';
    try { dataStamp(); } catch (e) { db = e.message; }
    const s = worker.statusReport();
    const ok = db === 'ok';
    return send(res, ok ? 200 : 503, { ok, version: VERSION, startedAt: worker.state.startedAt, uptimeSeconds: Math.round((Date.now() - worker.state.startedAt) / 1000), db, lastSyncOk: !!(s.lastSync && s.lastSync.ok), lastSyncAt: s.lastSync?.at || null });
  }

  // Which AI writes the suggestions: the providers and whether each has a key, what the page has
  // chosen, and what writes right now. A key can be pasted only from this computer, where the
  // .env file it goes into is.
  if (req.method === 'GET' && p === '/api/ai') {
    const first = (list) => (list[0] ? { provider: list[0].name, model: list[0].model } : null);
    return send(res, 200, {
      providers: PROVIDER_ORDER.map((id) => ({ id, label: PROVIDERS[id].label, hasKey: !!config.llm[id].apiKey, keyName: PROVIDERS[id].keyName, keyUrl: PROVIDERS[id].keyUrl, usageUrl: PROVIDERS[id].usageUrl, free: PROVIDERS[id].free, known: config.llm[id].models })),
      choice: aiChoice(),
      writing: first(aiProviders()),
      marketplaceWriting: first(aiProviders({ marketplace: true })),
      marketplaceModel: config.llm.marketplaceModel,
      smallModel: config.llm.smallModel,
      // Each job, the model chosen for it (if any) and what writes for it right now.
      roles: ROLES.map((role) => ({ role, label: ROLE_LABELS[role], choice: roleChoice(role), writing: first(aiProviders({ role })) })),
      // The month's spend against the budget, from the owner's price file.
      budget: budgetStatus(),
      marketplaceOn: config.marketplace.enabled,
      dailyLimit: config.llm.dailyLimit,
      // What has been asked so far: requests and tokens by model, today and this month.
      usage: usageDetail(),
      canSaveKey: !viaTunnel(req),
    });
  }
  // The models one provider offers right now, read from the provider and kept for an hour; fresh=1 reads again.
  if (req.method === 'GET' && p === '/api/ai/models') {
    const provider = String(url.searchParams.get('provider') || '');
    if (!PROVIDERS[provider]) return send(res, 400, { error: 'That AI provider is not one Wheelman knows.' });
    return send(res, 200, await listModels(provider, { fresh: url.searchParams.get('fresh') === '1' }));
  }
  if (req.method === 'POST' && p === '/api/ai/choice') {
    const body = await readBody(req);
    try {
      if (body.role !== undefined) {
        const role = String(body.role);
        const choice = setRoleChoice(role, { provider: body.provider, model: body.model });
        logLine('ai', `The page chose ${choice.model} (${choice.provider}) for ${(ROLE_LABELS[role] || role).toLowerCase()}`);
        return send(res, 200, { ok: true, choice, roles: allRoleChoices(), status: worker.statusReport() });
      }
      const choice = setAiChoice({ provider: body.provider, model: body.model, marketplace: body.marketplace === true });
      logLine('ai', `The page chose ${choice.model} (${choice.provider}) to write the suggestions${choice.marketplace ? ', for Marketplace too' : ''}`);
      return send(res, 200, { ok: true, choice, status: worker.statusReport() });
    } catch (e) { return send(res, e.status || 500, { error: e.message }); }
  }
  if (req.method === 'POST' && p === '/api/ai/key') {
    if (viaTunnel(req)) return send(res, 403, { error: 'A key can only be pasted on the computer Wheelman runs on.' });
    const body = await readBody(req);
    try {
      return send(res, 200, { ok: true, ...(await saveKey(body.provider, body.key)) });
    } catch (e) { return send(res, e.status || 500, { error: e.message }); }
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
    const tab = ['all', 'waiting', 'quiet', 'other', 'followups'].includes(url.searchParams.get('tab')) ? url.searchParams.get('tab') : 'waiting';
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
    const rows = q ? (everything || here[tab] || []).filter((r) => rowMatches(r, q)) : here[tab] || [];
    return send(res, 200, { items: rows.slice(0, limit), total: rows.length, everything, counts: { all: here.all.length, waiting: here.waiting.length, quiet: here.quiet.length, other: here.other.length, followups: (here.followups || []).length }, sections, unread, section, hours: Number.isFinite(hours) ? hours : null, q });
  }

  if (req.method === 'POST' && p === '/api/sync') {
    // { marketplace: true }, from the new page before a Facebook send that follows one that failed
    // or could not be told: Marketplace only, waiting for a read under way rather than taking the
    // one before it, with no dashboard check and nothing written. A read that fails is said, so
    // the page posts nothing. Any other body, or none, is Check now as it always was.
    const body = await readBody(req).catch(() => ({}));
    if (body && body.marketplace === true) {
      const read = await worker.runMarketplaceSync({ wait: true });
      if (!read || !read.ok) return send(res, 502, { error: read ? read.message : 'Marketplace is switched off.' });
      return send(res, 200, worker.statusReport());
    }
    await Promise.all([worker.runSync(), worker.runMarketplaceSync()]);
    worker.updateOutcomes();
    if (config.followUp.on) { try { refreshFollowUps(); } catch (e) { logLine('followups', `Finding follow-ups failed: ${e.message}`); } }
    worker.draftWaiting().catch(() => {});
    return send(res, 200, worker.statusReport());
  }

  // For an auction order, `message` is the kind of message picked from the "Which message?" list.
  let m = p.match(itemRoute());
  if (req.method === 'GET' && m) {
    const asked = url.searchParams.has('message') ? url.searchParams.get('message') : undefined;
    // A follow-up opened from the Follow-ups list comes with its id: the box then holds the follow-up.
    const item = itemFromKey(m[1], { message: m[1].startsWith('ao:') ? asked || '' : asked, followUp: Number(url.searchParams.get('followup')) || undefined });
    if (!item) return send(res, 404, { error: 'That conversation was not found.' });
    return send(res, 200, { item: present(item) });
  }

  // One search across every section that is on, the stock list and the words in messages.
  if (req.method === 'GET' && p === '/api/search') {
    // Auction's All is To do and In progress only: its Finished orders are found too.
    const rowsOf = (s) => {
      if (!sectionOn(s)) return null;
      const r = sectionRows(s);
      return s === 'auction' ? [...r.waiting, ...r.quiet, ...r.other] : r.all;
    };
    return send(res, 200, searchAll(url.searchParams.get('q'), { rowsOf }));
  }

  // Find a car: cars from the stored stock list matching a stock number or words of the title.
  if (req.method === 'GET' && p === '/api/vehicles') {
    return send(res, 200, { cars: findCars(String(url.searchParams.get('q') || '').slice(0, 60)) });
  }

  // One car, for the car panel: what the stock list says, its photos, videos and documents, and
  // one picture at a time through Wheelman's own copy. Read-only.
  m = p.match(/^\/api\/vehicles\/([A-Za-z0-9-]{1,20})(\/media|\/picture\/([a-f0-9]{24}))?$/);
  if (req.method === 'GET' && m) {
    const v = getVehicleByStock(m[1]);
    if (!v) return send(res, 404, { error: 'That stock number is not in the stock list.' });
    if (!m[2]) return send(res, 200, { vehicle: carSummary(v) });
    try {
      if (m[2] === '/media') return send(res, 200, await vehicleMedia(m[1], { fresh: url.searchParams.get('fresh') === '1' }));
      const { body, type } = await vehiclePicture(m[1], m[3]);
      return send(res, 200, body, type, { 'cache-control': 'private, max-age=86400' });
    } catch (e) {
      if (m[3] && !e.status) logLine('media', `Picture ${m[3]} of stock ${m[1]} could not be fetched: ${e.message}`);
      return send(res, e.status || 502, { error: e.status ? e.message : 'The picture could not be fetched. Try again in a moment.' });
    }
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
    const picked = { message: String(body.message || ''), followUp: Number(body.followup) || undefined };
    const item = itemFromKey(m[1], picked);
    if (!item) return send(res, 404, { error: 'That conversation was not found.' });
    // A follow-up is written only while it is still due: not once it was copied or dismissed, and
    // not once the customer has written (then there is a message to answer instead).
    if (picked.followUp) {
      if (!item.followUp) return send(res, 404, { error: 'That follow-up was not found.' });
      if (item.followUp.done_how) return send(res, 400, { error: 'This follow-up is done. Put it back first.' });
      const still = stillDue(item, item.followUp);
      if (!still.ok) { closeFollowUp(item.followUp.id, still.how); return send(res, 400, { error: still.why }); }
    }
    const instruction = String(body.instruction || '').slice(0, 600);
    // The page is writing it now, with or without a prompt: nothing to wait for any more.
    worker.releaseItem(item.itemKey);
    let draft;
    if (item.order && !(item.orderStatus.kind === 'reply' && !picked.message)) {
      // A message to an auction customer is written from its template, fitted to them when the settings say so.
      if (!item.message) return send(res, 400, { error: 'Choose which message to write first.' });
      draft = await draftOrderMessage(item, { type: item.message, facts: instruction, fitWith: config.auction.fit ? draftFor : null });
    } else if (picked.message && enquiryTemplates(item).some((t) => t.id === picked.message)) {
      // An enquiry in Auction or Imports: the same messages, written from what the enquiry says.
      draft = await draftOrderMessage(item, { type: picked.message, facts: instruction, order: enquiryOrder(item), fitWith: config.auction.fit ? draftFor : null });
    } else if (picked.message && hasSectionTemplate(item, picked.message)) {
      // Any other section: the owner's template, fitted to this customer, changed as the Prompt says.
      draft = await draftSectionTemplate(item, { id: picked.message, instruction, fitWith: draftFor });
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
    // A link to our website typed or pasted into the box is tagged as coming from Facebook too.
    const text = tagMarketplaceLinks(String(body.text ?? '').replace(/\r/g, '').trim());
    if (!text) return send(res, 400, { error: 'There is nothing to send.' });
    // A blank is for the person to fill in. It is never sent to a buyer as it stands.
    const blanks = [...new Set([...text.matchAll(blankMatcher())].map((x) => x[0]))];
    if (blanks.length) return send(res, 400, { error: `Fill in ${blanks.length === 1 ? 'the blank' : 'the blanks'} before sending: ${blanks.join(', ')}.` });
    if (sendingNow.has(item.itemKey)) return send(res, 409, { error: 'This reply is already on its way.' });
    sendingNow.add(item.itemKey);
    try {
      const tag = config.marketplace.linkSource;
      // Refused as gone already: nothing is sent. same: whether these words are the ones that went
      // (compared on the text as tagged here), so a page clears only those from its box.
      const gone = (same, why) => {
        logLine('marketplace', `${item.itemKey}: ${why}`);
        return send(res, 409, { error: 'This reply has gone already.', gone: true, same });
      };
      // Wheelman's copy of the chat, built again now that this send holds the chat (another send on
      // it may have gone while this one's words came in), or the one read afresh just below.
      let chat = itemFromKey(m[1]) || item;
      // The last send on this chat may have gone (the engine did not answer in time): Marketplace is
      // read afresh and the chat looked at first, whichever page sends. Marketplace not read: nothing
      // is sent, and the note stays for the next try. That reply not in the chat: the note goes.
      const unsure = mayHaveGone.get(item.itemKey);
      if (unsure && !unsure.found) {
        const read = await worker.runMarketplaceSync({ wait: true });
        if (!read || !read.ok) return send(res, 502, { error: `Wheelman could not read the Marketplace chat first. ${read ? read.message : 'Marketplace is switched off.'}` });
        chat = itemFromKey(m[1]) || item;
        if (!wentAfter(chat.timeline, unsure.anchor, unsure.text, tag)) mayHaveGone.delete(item.itemKey);
        else {
          unsure.found = true;
          // It went from here: its suggestion is marked as sent, as it would have been then.
          try {
            const draft = unsure.draftId ? getDraft(unsure.draftId) : null;
            if (draft && draft.item_key === item.itemKey) { onEdited(chat, draft.id, unsure.text); recordSentHere(draft.id, unsure.at); }
          } catch (e) { logLine('marketplace', `${item.itemKey}: the reply had gone, but the suggestion could not be marked as sent: ${e.message}`); }
        }
      }
      // That reply went, and the chat still shows it: its words are never sent to this chat again,
      // whatever the buyer wrote since. Other words, while the chat is answered by it, are held back
      // once so the page can say so, and the next press sends them. No longer in the chat (the engine
      // could not deliver it): the note goes, and it is words like any other.
      if (unsure && unsure.found && !wentAfter(chat.timeline, unsure.anchor, unsure.text, tag)) mayHaveGone.delete(item.itemKey);
      else if (unsure && unsure.found) {
        if (sameReply(text, unsure.text, tag)) return gone(true, 'a reply that timed out had gone, so the same words were not sent again');
        if (!unsure.told && replyShown(chat.timeline, unsure.anchor, unsure.text, tag)) {
          unsure.told = true;
          return gone(false, 'a reply that timed out had gone, so other words were held back once');
        }
      }
      // On any chat: these words are a reply of ours already since the buyer last wrote. Wheelman's
      // copy is enough (no Marketplace read): a reply sent from here is in it as soon as it goes.
      if (alreadySent(chat.timeline, text, tag)) return gone(true, 'these words are already our reply since the buyer last wrote, so they were not sent again');
      // This send's reply may have gone with Wheelman's copy of the chat not showing it: a fresh note,
      // in place of any, so the next send on this chat looks for it first.
      const mayBeThere = () => mayHaveGone.set(item.itemKey, { text, anchor: chat.anchorKey, draftId: Number(body.draftId) || null, at: Date.now(), found: false, told: false });
      let out;
      try {
        out = await sendReply(item.marketplace.id, text);
      } catch (e) {
        // The engine refused, or could not be reached: 502. It did not answer in time, so it may
        // have taken the reply: 504, which a page reads as an outcome it cannot tell. Then the chat
        // is noted, and Marketplace is read once the answer is sent, so the chat shows the reply if
        // the engine has it.
        logLine('marketplace', `${item.itemKey}: the reply ${e.mayHaveGone ? 'may not have been sent' : 'could not be sent'}. ${e.message}`);
        if (!e.mayHaveGone) return send(res, 502, { error: e.message });
        mayBeThere();
        send(res, 504, { error: e.message });
        worker.runMarketplaceSync({ wait: true }).catch(() => { /* the next read brings it */ });
        return;
      }
      // The engine has the reply: it has gone, and any note on this chat is over. What follows is
      // Wheelman's own record of it, and a step that fails there is logged, never answered as "not
      // sent" (a page would offer it again).
      mayHaveGone.delete(item.itemKey);
      const note = (what, step) => { try { step(); } catch (e) { logLine('marketplace', `${item.itemKey}: the reply was sent, but ${what}: ${e.message}`); } };
      // The suggestion it came from: what was in the box is kept with it, and that Send was pressed.
      note('the suggestion could not be marked as sent', () => {
        const draft = Number(body.draftId) ? getDraft(Number(body.draftId)) : null;
        if (draft && draft.item_key === item.itemKey) { onEdited(item, draft.id, text); recordSentHere(draft.id); }
      });
      // The engine's record of the queued reply goes into the thread at once; then the chat is read
      // again so everything else is current too. If that read fails, the next check brings it.
      let kept = false;
      note('it could not be put in the chat', () => {
        if (out.message && Number.isInteger(Number(out.message.id))) { appendMpMessage(item.marketplace.id, normalizeMpMessage(out.message, 0, item.marketplace.id)); kept = true; }
      });
      try {
        const detail = await fetchConversation(item.marketplace.id);
        if (detail?.conversation?.id === item.marketplace.id) { storeMpConversation(detail.conversation, detail.messages || []); kept = true; }
      } catch (e) { logLine('marketplace', `${item.itemKey}: the reply was sent, but the chat could not be read back: ${e.message}`); }
      // Neither put it in Wheelman's copy of the chat: noted as a send that timed out is, so the same
      // words are refused until the reply is found there or a later send is taken.
      if (!kept) {
        mayBeThere();
        logLine('marketplace', `${item.itemKey}: the reply was sent, but Wheelman's copy of the chat does not have it, so the next send on this chat reads Marketplace first`);
      }
      logLine('marketplace', `${item.itemKey}: a reply was sent from the page (${text.length} characters)${out.workerOnline ? '' : '; the engine\'s phone is offline, so it is queued'}`);
      let shown = null;
      note('the chat could not be shown', () => { shown = present(itemFromKey(m[1]) || item); });
      return send(res, 200, { ok: true, queued: !out.workerOnline, item: shown });
    } finally { sendingNow.delete(item.itemKey); }
  }

  m = p.match(itemRoute('/dismiss'));
  if (req.method === 'POST' && m) {
    const item = itemFromKey(m[1]);
    if (!item) return send(res, 404, { error: 'That conversation was not found.' });
    dismiss(item.itemKey, item.anchorKey);
    return send(res, 200, { ok: true });
  }

  // The owner's ruling on a dashboard conversation: an import enquiry or not.
  // { kind: 'import' | 'general' | '', section?, keep? }. An empty kind takes the ruling away, so
  // Wheelman's own reading applies again. A `section` sent with it moves the conversation as /move
  // does (the new page's enquiry type rules and moves in one). The suggestion is written again the
  // new way, unless the owner has already changed its text, or sent `keep: true` (text in the box).
  m = p.match(itemRoute('/ruling'));
  if (req.method === 'POST' && m) {
    const body = await readBody(req);
    const item = itemFromKey(m[1]);
    if (!item) return send(res, 404, { error: 'That conversation was not found.' });
    if (!/^[cl]:/.test(item.itemKey)) return send(res, 400, { error: 'Only a dashboard conversation can be ruled on.' });
    const kind = ['import', 'general', ''].includes(body.kind) ? body.kind : null;
    if (kind === null) return send(res, 400, { error: 'Say whether it is an import enquiry.' });
    const section = body.section ? String(body.section) : '';
    if (section && section !== item.section && !movesFor(item).includes(section)) return send(res, 400, { error: whyNotMoved(item, section) });
    if (kind) setItemRuling(item.itemKey, item.lead?.id || null, { kind });
    else clearItemRuling(item.itemKey, item.lead?.id || null);
    if (section && section !== item.section) moveTo(item, section);
    const { fresh, writing } = writeAgainIfUntouched(m[1], item, { keep: body.keep === true });
    logLine('rulings', `${fresh.itemKey}: ${kind ? (kind === 'import' ? 'an import enquiry' : 'not an import enquiry') : 'the ruling was taken away'}${section && section !== item.section ? `, moved to ${section}` : ''}${writing ? '; the suggestion is written again' : ''}`);
    return send(res, 200, { ok: true, item: present(fresh), writing });
  }

  // Moving a conversation to another section: Dashboard, Import Query or Auction, or a Facebook chat
  // back to Marketplace. { section, keep? }. It keeps its key, and its replies still go out the way
  // they came in; only the list it sits on, and how the customer is answered, change. Back in its
  // own section, the move is forgotten. The suggestion is written again the new way, unless the
  // owner has already changed its text, or sent `keep: true`. Undo is a move back to `from`.
  m = p.match(itemRoute('/move'));
  if (req.method === 'POST' && m) {
    const body = await readBody(req);
    const item = itemFromKey(m[1]);
    if (!item) return send(res, 404, { error: 'That conversation was not found.' });
    const section = String(body.section || '');
    if (!movesFor(item).includes(section)) return send(res, 400, { error: whyNotMoved(item, section) });
    const from = item.section;
    moveTo(item, section);
    const { fresh, writing } = writeAgainIfUntouched(m[1], item, { keep: body.keep === true });
    logLine('moves', `${fresh.itemKey}: moved from ${from} to ${fresh.section}${writing ? '; the suggestion is written again' : ''}`);
    return send(res, 200, { ok: true, from, item: present(fresh), writing });
  }

  // The conversation was opened on the page: its number badge goes away until a new message arrives.
  m = p.match(itemRoute('/seen'));
  if (req.method === 'POST' && m) {
    const item = itemFromKey(m[1]);
    if (!item) return send(res, 404, { error: 'That conversation was not found.' });
    markSeen(item.itemKey, item.anchorKey);
    return send(res, 200, { ok: true });
  }

  // The Prompt line is open for this conversation: its automatic suggestion waits a minute and a
  // half, so the one request made is the one from the prompt. { on: false } when the line is
  // closed without writing. The hold lapses by itself either way.
  m = p.match(itemRoute('/hold'));
  if (req.method === 'POST' && m) {
    const body = await readBody(req);
    const item = itemFromKey(m[1]);
    if (!item) return send(res, 404, { error: 'That conversation was not found.' });
    if (body.on === false) { worker.releaseItem(item.itemKey); return send(res, 200, { ok: true, until: null }); }
    return send(res, 200, { ok: true, until: worker.holdItem(item.itemKey) });
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

  // A follow-up: Dismiss takes it out of the Follow-ups list (the owner phoned them, say); Put back
  // makes it due again, after Dismiss or after Copy. Nothing is deleted.
  m = p.match(/^\/api\/followups\/(\d+)\/(dismiss|restore)$/);
  if (req.method === 'POST' && m) {
    const row = getFollowUp(Number(m[1]));
    if (!row) return send(res, 404, { error: 'That follow-up was not found.' });
    if (m[2] === 'dismiss') closeFollowUp(row.id, 'dismissed'); else reopenFollowUp(row.id);
    const item = itemFromKey(row.item_key, { followUp: row.id });
    if (!item) return send(res, 404, { error: 'That conversation was not found.' });
    return send(res, 200, { ok: true, item: present(item) });
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
    // A follow-up that was copied is done: it leaves the Follow-ups list (and can be put back).
    const fu = String(draft.anchor_key || '').match(/^fu:(\d+)$/);
    if (fu) { closeFollowUp(Number(fu[1]), 'copied', { draftId: draft.id }); result.followUpDone = true; }
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
    const result = item ? await onAdvice(item, draft.id, note) : { learned: false, why: 'conversation not found' };
    if (!result.learned) return send(res, 200, { ok: false, learned: false, why: result.why || '', lessons: [] });
    setDraftRating(draft.id, 'edit');
    onApproved(item, draft.id, false);
    // The same note guides a new draft for this customer, as coaching, not as wording to send.
    const next = await draftFor(item, { coaching: { note, draft: draft.reply } });
    return send(res, 200, { item: present(itemFromKey(draft.item_key) || item), ok: next.status === 'ready', error: next.error || '', learned: true, lessons: result.lessons || [], pending: !!result.pending });
  }

  // "Remember": the instruction this suggestion was written from becomes a lesson for every later
  // reply of its kind. "Just this once" is no call at all: nothing is stored.
  m = p.match(/^\/api\/drafts\/(\d+)\/remember$/);
  if (req.method === 'POST' && m) {
    const body = await readBody(req);
    const draft = getDraft(Number(m[1]));
    if (!draft) return send(res, 404, { error: 'Suggestion not found.' });
    // A Marketplace chat, a phone-only text or an auction order is refused without being looked up.
    const out = onRemember(canLearnFrom(draft.item_key) ? itemFromKey(draft.item_key) : null, draft.id, body.scope);
    // wasOn: the lesson was already there and switched on, so this press changed nothing Undo could take back.
    return out.error ? send(res, out.status || 400, { error: out.error }) : send(res, 200, { lesson: out.lesson, wasOn: out.wasOn });
  }

  // Every lesson, newest first, each with its kind, channel, scope, date, off switch and use.
  if (req.method === 'GET' && p === '/api/lessons') return send(res, 200, { lessons: listLessons() });

  m = p.match(/^\/api\/lessons\/(\d+)\/switch$/);
  if (req.method === 'POST' && m) {
    const body = await readBody(req);
    if (typeof body.on !== 'boolean') return send(res, 400, { error: 'Say whether to switch the lesson on or off.' });
    const lesson = switchLesson(Number(m[1]), body.on);
    return lesson ? send(res, 200, { lesson }) : send(res, 404, { error: 'That lesson was not found.' });
  }

  // The Review page's runs: real conversations written two ways, and the owner's votes. The runs
  // hold real customer text, so they are never served through the team link.
  if (p === '/api/review' || p.startsWith('/api/review/')) {
    if (viaTunnel(req)) return send(res, 403, { error: 'The Review page can only be used on the computer Wheelman runs on.' });
    if (req.method === 'GET' && p === '/api/review') return send(res, 200, { runs: listRuns() });
    const m = p.match(/^\/api\/review\/([\w.-]+)(\/vote)?$/);
    if (!m) return send(res, 404, { error: 'Not found' });
    if (req.method === 'GET' && !m[2]) { const run = readRun(m[1]); return run ? send(res, 200, { ...run, summary: summarise(run) }) : send(res, 404, { error: 'That review run is not here.' }); }
    if (req.method === 'POST' && m[2]) {
      const body = await readBody(req);
      try { return send(res, 200, reviewVote(m[1], body.case, String(body.pick || ''))); } catch (e) { return send(res, e.status || 500, { error: e.message }); }
    }
    return send(res, 405, { error: 'Not allowed' });
  }

  return send(res, 404, { error: 'Not found' });
}

function serveStatic(res, url) {
  if (url.pathname === '/favicon.ico') { res.writeHead(204, { 'cache-control': 'max-age=86400' }); return res.end(); }
  // A path ending in / serves that folder's index.html (/ itself, and /new/ for the new page).
  const rel = url.pathname.replace(/^\/+/, '') + (url.pathname.endsWith('/') ? 'index.html' : '');
  const file = path.resolve(config.webDir, rel);
  if (!file.startsWith(path.resolve(config.webDir) + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
  send(res, 200, fs.readFileSync(file), TYPES[path.extname(file)] || 'application/octet-stream');
}

// The sign-in page the team sees at the shared address: the page file with the message filled in.
function signinPage(message = '') {
  const html = fs.readFileSync(path.join(config.webDir, 'signin.html'), 'utf8');
  return html.replace('{{message}}', message.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])));
}

function readForm(req, limit = 4000) {
  return new Promise((resolve, reject) => {
    let size = 0; const parts = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('too large')); req.destroy(); } else parts.push(c); });
    req.on('end', () => resolve(new URLSearchParams(Buffer.concat(parts).toString('utf8'))));
    req.on('error', reject);
  });
}

// The team's sign-in at the shared address. The right password sets the cookie and goes to the
// page; a wrong one says so and, after too many in a row from one address, that address waits.
async function signin(req, res) {
  const ip = String(req.headers['cf-connecting-ip'] || req.socket.remoteAddress || '');
  const html = 'text/html; charset=utf-8';
  if (req.method === 'GET') {
    if (signedIn(req)) { res.writeHead(303, { location: '/', 'cache-control': 'no-store' }); return res.end(); }
    return send(res, 200, signinPage(), html);
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'Not allowed' });
  if (tooManyTries(ip)) return send(res, 429, signinPage('Too many tries. Wait a quarter of an hour, then try again.'), html);
  let form;
  try { form = await readForm(req); } catch { return send(res, 400, signinPage('That could not be read. Try again.'), html); }
  if (!checkPassword(form.get('password') || '')) {
    noteWrong(ip);
    logLine('share', `A wrong team password was typed at the shared address (from ${ip || 'an unknown address'})`);
    return send(res, 403, signinPage('That is not the team password.'), html);
  }
  clearWrong(ip);
  res.writeHead(303, { location: '/', 'set-cookie': signinCookie(signinToken()), 'cache-control': 'no-store' });
  res.end();
}

/**
 * A request through the tunnel: sharing must be on, with a team password; the sign-in page and
 * the files it needs are open to all; everything else needs the cookie the sign-in sets. True
 * when the request was answered here.
 */
async function gate(req, res, url) {
  const p = url.pathname;
  if (!config.share.on || !config.share.password) { send(res, 403, { error: 'Sharing is switched off on the computer that runs Wheelman.' }); return true; }
  if (p === '/signin') { await signin(req, res); return true; }
  if (/^\/(css|fonts|assets)\/|^\/(icon\.svg|favicon\.ico)$/.test(p)) return false;
  if (signedIn(req)) return false;
  if (req.method === 'GET' && !p.startsWith('/api/')) { res.writeHead(303, { location: '/signin', 'cache-control': 'no-store' }); res.end(); }
  else send(res, 401, { error: 'Sign in first.' });
  return true;
}

export function startServer() {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (viaTunnel(req) && await gate(req, res, url)) return;
      if (!allowed(req, url.pathname)) return send(res, 403, { error: 'This page can only be used from this computer.' });
      // The Review page itself: on this computer only, like the runs it shows.
      if (/^\/review(\.html)?$/.test(url.pathname)) {
        if (viaTunnel(req)) return send(res, 403, { error: 'The Review page can only be used on the computer Wheelman runs on.' });
        url.pathname = '/review.html';
      }
      if (url.pathname.startsWith('/api/')) return await api(req, res, url);
      if (req.method !== 'GET') return send(res, 405, { error: 'Not allowed' });
      if (url.pathname === '/new') { res.writeHead(303, { location: '/new/', 'cache-control': 'no-store' }); return res.end(); }
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
