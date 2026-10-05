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
import { firstNameOf, isPlaceholderName } from './redact.js';
import { businessFactsForPrompt, loadBusinessFacts } from './knowledge.js';
import * as worker from './worker.js';
import { onCopied, onRated, onApproved, onAdvice, onEdited } from './learn.js';
import { displayNameFor } from './people.js';
import { reservedByAnother } from './deal.js';
import { wantedFrom } from './imports.js';
import { learnedStats } from './db.js';

const TYPES = { '.woff2': 'font/woff2', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

function send(res, status, body, type = 'application/json; charset=utf-8') {
  const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, {
    'content-type': type,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'content-security-policy': "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'",
  });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const parts = [];
    req.on('data', (c) => { size += c.length; if (size > 100000) { reject(new Error('too large')); req.destroy(); } else parts.push(c); });
    req.on('end', () => { try { resolve(parts.length ? JSON.parse(Buffer.concat(parts).toString('utf8')) : {}); } catch { reject(new Error('bad json')); } });
    req.on('error', reject);
  });
}

/** Only this computer's own browser page may use the app. */
function allowed(req) {
  const host = String(req.headers.host || '');
  if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) return false;
  if (req.method !== 'GET') {
    const origin = String(req.headers.origin || '');
    if (origin && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return false;
    if (!/application\/json/i.test(String(req.headers['content-type'] || ''))) return false;
  }
  return true;
}

function displayName(item) {
  const l = item.lead;
  const full = [l?.first_name, l?.last_name].filter(Boolean).join(' ').trim() || item.conversation?.customer_name || '';
  return full && !isPlaceholderName(full) ? full : '';
}

const THREAD_LIMIT = 80;
const LIST_LIMIT = 200;

function draftOf(item) {
  const draft = latestDraft(item.itemKey, item.anchorKey);
  return draft ? {
    id: draft.id, status: draft.status, reply: draft.reply || '', checks: draft.checks, factsUsed: draft.factsUsed,
    // What the person has typed over the suggestion: null when untouched, '' when they cleared it.
    edited: typeof draft.edited_text === 'string' ? draft.edited_text : null, editedAt: draft.edited_at || null,
    model: draft.model, provider: draft.provider, createdAt: draft.created_at, instruction: draft.instruction || '', error: draft.error || '', rating: draft.rating || '',
    needsHuman: (draft.needsHuman || []).filter((n) => n && n.marker && n.reason).map((n) => ({ marker: String(n.marker), reason: String(n.reason) })),
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
    section: item.channel === 'marketplace' ? 'marketplace' : 'dashboard',
    account: item.marketplace?.account || '',
    needsPerson: !!item.marketplace?.needsPerson,
    replyComing: !!item.marketplace?.replyComing,
    anchor: item.anchorKey,
    state: item.state,
    dismissed: isDismissed(item.itemKey, item.anchorKey),
    name: displayName(item),
    phone: item.phone,
    situation: item.situation.label,
    waitingSince: item.lastInboundAt,
    lastAt: lastShown.at,
    unanswered: item.state === 'awaiting' ? item.pending.length : 0,
    // The number badge: messages that arrived since the user last opened this conversation.
    unread: item.state === 'awaiting' && !isSeen(item.itemKey, item.anchorKey) ? item.pending.length : 0,
    preview: { who: lastShown.who, text: lastShown.text || lastShown.event || (lastShown.media ? 'Photo' : ''), media: lastShown.media || null },
    flag: flagLevel(draft),
    car: item.vehicles[0]?.title || item.marketplace?.listingTitle || (item.imports ? wantedFrom(item).car : ''),
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
    archived: m.archived, needsPerson: m.needsPerson, replyComing: m.replyComing, queuedAt: m.queuedAt, failed: m.failed, unsent: m.unsent,
    autoReply: e.enabled, stage: e.stage, locked: e.locked, lockReason: e.lockReason, lockDetail: e.lockDetail,
    urgency: e.urgency, nextAction: e.nextAction, notes: e.notes,
  };
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

const threadOf = (item, shown) => {
  const pendingKeys = new Set(item.pending.map((e) => e.key));
  return shown.map((e) => ({
    key: e.key, who: e.who, internal: !!e.internal, text: e.text || '', event: e.event || '', media: e.media || null,
    by: displayNameFor(e.by) || '', auto: !!e.auto, via: e.via || '', at: e.at, unanswered: item.state === 'awaiting' && pendingKeys.has(e.key),
  }));
};

/** Everything needed to show one open auction order. */
function presentOrder(item) {
  const shown = item.timeline.slice(-THREAD_LIMIT);
  return {
    ...summary(item),
    note: '', channel: 'auction', marketplace: null,
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
  };
}

const SECTIONS = ['dashboard', 'marketplace', 'auction'];
const sectionOn = (s) => (s === 'marketplace' ? config.marketplace.enabled : true);
const KEY = '((?:c|l|mp|ao):\\d+)';
const itemRoute = (tail = '') => new RegExp(`^/api/items/${KEY}${tail}$`);

const listCache = new Map();

/**
 * The rows of one section, by tab. Built once and reused until something in the database is
 * written, or a minute has passed (some rules depend on the time of day). The page asks every
 * twenty seconds; without this every conversation was rebuilt three or four times each time.
 *
 * A dismissed conversation is not lost: it moves to the second tab, where it can be put back.
 */
function sectionRows(section, hours) {
  const stamp = `${dataStamp()}|${Math.floor(Date.now() / 60000)}`;
  const key = `${section}|${hours}`;
  const hit = listCache.get(key);
  if (hit && hit.stamp === stamp) return hit.value;

  let value;
  if (section === 'auction') {
    // To do, In progress, Finished.
    const rows = listOrderRows();
    value = { waiting: rows.filter((r) => r.state === 'awaiting'), quiet: rows.filter((r) => r.state === 'answered'), other: rows.filter((r) => r.state === 'closed') };
  } else {
    const all = listItems({ states: ['awaiting', 'ack', 'closed', 'optout', 'other'], maxAgeHours: hours, source: section, limit: Infinity });
    const newest = (x, y) => (y.lastInboundAt || y.lastActivityAt) - (x.lastInboundAt || x.lastActivityAt);
    const awaiting = all.filter((i) => i.state === 'awaiting').slice(0, LIST_LIMIT);
    const setAside = awaiting.filter((i) => isDismissed(i.itemKey, i.anchorKey));
    const quiet = all.filter((i) => ['ack', 'closed', 'optout'].includes(i.state)).slice(0, LIST_LIMIT);
    value = {
      waiting: awaiting.filter((i) => !setAside.includes(i)).map(summary),
      quiet: [...setAside, ...quiet].sort(newest).map(summary),
      other: section === 'dashboard' ? all.filter((i) => i.state === 'other').slice(0, LIST_LIMIT).map(summary) : [],
    };
  }
  value.unread = value.waiting.filter((r) => r.unread).length;
  // Building the rows can itself write (a first-time match key), which moves the stamp.
  listCache.set(key, { stamp: `${dataStamp()}|${Math.floor(Date.now() / 60000)}`, value });
  while (listCache.size > 12) listCache.delete(listCache.keys().next().value);
  return value;
}

async function api(req, res, url) {
  const p = url.pathname;

  if (req.method === 'GET' && p === '/api/status') {
    const facts = businessFactsForPrompt();
    return send(res, 200, { ...worker.statusReport(), learned: learnedStats(), facts: { ...facts.counts, unanswered: facts.unanswered, toConfirm: loadBusinessFacts().filter((t) => t.status === 'working').map((t) => t.title) } });
  }

  if (req.method === 'GET' && p === '/api/items') {
    const tab = ['waiting', 'quiet', 'other'].includes(url.searchParams.get('tab')) ? url.searchParams.get('tab') : 'waiting';
    const hours = Number(url.searchParams.get('hours')) || config.draftMaxAgeHours;
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
    return send(res, 200, { items: here[tab], counts: { waiting: here.waiting.length, quiet: here.quiet.length, other: here.other.length }, sections, unread, section, hours });
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
    return send(res, 200, { item: present(item) });
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
      if (!allowed(req)) return send(res, 403, { error: 'This page can only be used from this computer.' });
      const url = new URL(req.url, `http://${req.headers.host}`);
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
