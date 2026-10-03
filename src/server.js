// The local page and its data. Listens on this computer only (127.0.0.1).

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { listItems, itemFromKey } from './items.js';
import { latestDraft, getDraft, dismiss, undismiss, isDismissed, setDraftRating, markSeen, isSeen } from './db.js';
import { draftFor } from './drafter.js';
import { availability } from './normalize.js';
import { firstNameOf, isPlaceholderName } from './redact.js';
import { businessFactsForPrompt, loadBusinessFacts } from './knowledge.js';
import * as worker from './worker.js';
import { onCopied, onRated, onApproved, onAdvice } from './learn.js';
import { displayNameFor } from './people.js';
import { reservedByAnother } from './deal.js';
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

function draftOf(item) {
  const draft = latestDraft(item.itemKey, item.anchorKey);
  return draft ? {
    id: draft.id, status: draft.status, reply: draft.reply || '', checks: draft.checks, factsUsed: draft.factsUsed,
    model: draft.model, provider: draft.provider, createdAt: draft.created_at, instruction: draft.instruction || '', error: draft.error || '', rating: draft.rating || '',
    needsHuman: (draft.needsHuman || []).filter((n) => n && n.marker && n.reason).map((n) => ({ marker: String(n.marker), reason: String(n.reason) })),
  } : null;
}

function flagLevel(draft) {
  if (!draft || draft.status !== 'ready') return draft && draft.status === 'failed' ? 'error' : 'none';
  const c = draft.checks || [];
  return c.some((x) => x.level === 'fail') ? 'fail' : c.some((x) => x.level === 'input') ? 'input' : 'ok';
}

/** One row in the conversation list. Deliberately small. */
function summary(item) {
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
    car: item.vehicles[0]?.title || item.marketplace?.listingTitle || '',
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

/** Everything needed to show one open conversation. */
function present(item) {
  const v = item.vehicles[0];
  const pendingKeys = new Set(item.pending.map((e) => e.key));
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
    vehicle: v ? { title: v.title, stockNo: v.stockNo, price: v.price, odometer: v.odometer, availability: shownAvailability(item, v), url: v.url, year: v.year, fuel: v.fuel, transmission: v.transmission, seats: v.seats, colour: v.color, included: v.outline || [] } : null,
    thread: shown.map((e) => ({
      key: e.key, who: e.who, internal: !!e.internal, text: e.text || '', event: e.event || '', media: e.media || null,
      by: displayNameFor(e.by) || '', auto: !!e.auto, via: e.via || '', at: e.at, unanswered: item.state === 'awaiting' && pendingKeys.has(e.key),
    })),
    earlier: item.timeline.length - shown.length,
    draft: draftOf(item),
  };
}

async function api(req, res, url) {
  const p = url.pathname;

  if (req.method === 'GET' && p === '/api/status') {
    const facts = businessFactsForPrompt();
    return send(res, 200, { ...worker.statusReport(), learned: learnedStats(), facts: { ...facts.counts, unanswered: facts.unanswered, toConfirm: loadBusinessFacts().filter((t) => t.status === 'working').map((t) => t.title) } });
  }

  if (req.method === 'GET' && p === '/api/items') {
    const tab = url.searchParams.get('tab') || 'waiting';
    const hours = Number(url.searchParams.get('hours')) || config.draftMaxAgeHours;
    // Two separate sections: dashboard leads, and Facebook Marketplace chats.
    const source = url.searchParams.get('section') === 'marketplace' && config.marketplace.enabled ? 'marketplace' : 'dashboard';
    // Waiting conversations in a section, without the ones that were dismissed.
    const waitingList = (s) => listItems({ states: ['awaiting'], maxAgeHours: hours, source: s }).filter((i) => !isDismissed(i.itemKey, i.anchorKey));
    const newIn = (list) => list.filter((i) => !isSeen(i.itemKey, i.anchorKey)).length;
    // A dismissed conversation is not lost. It moves to "No reply needed", where it can be put back.
    const awaiting = listItems({ states: ['awaiting'], maxAgeHours: hours, source });
    const setAside = awaiting.filter((i) => isDismissed(i.itemKey, i.anchorKey));
    const here = awaiting.filter((i) => !setAside.includes(i));
    const quiet = listItems({ states: ['ack', 'closed', 'optout'], maxAgeHours: hours, source });
    const others = source === 'dashboard' ? listItems({ states: ['other'], maxAgeHours: hours, source }) : [];
    const newest = (x, y) => (y.lastInboundAt || y.lastActivityAt) - (x.lastInboundAt || x.lastActivityAt);
    const chosen = tab === 'waiting' ? here : tab === 'quiet' ? [...setAside, ...quiet].sort(newest) : others;
    const visible = chosen.map(summary);
    const counts = { waiting: here.length, quiet: quiet.length + setAside.length, other: others.length };
    const elsewhere = source === 'dashboard' ? 'marketplace' : 'dashboard';
    const there = elsewhere === 'marketplace' && !config.marketplace.enabled ? null : waitingList(elsewhere);
    const sections = { [source]: here.length, [elsewhere]: there ? there.length : null };
    // Waiting conversations with messages nobody has looked at yet. These are the numbers shown on
    // the page and in the browser tab; they clear when the conversation is opened.
    const unread = { [source]: newIn(here), [elsewhere]: there ? newIn(there) : null };
    return send(res, 200, { items: visible, counts, sections, unread, section: source, hours });
  }

  if (req.method === 'POST' && p === '/api/sync') {
    await Promise.all([worker.runSync(), worker.runMarketplaceSync()]);
    worker.updateOutcomes();
    worker.draftWaiting().catch(() => {});
    return send(res, 200, worker.statusReport());
  }

  let m = p.match(/^\/api\/items\/((?:c|l|mp):\d+)$/);
  if (req.method === 'GET' && m) {
    const item = itemFromKey(m[1]);
    if (!item) return send(res, 404, { error: 'That conversation was not found.' });
    return send(res, 200, { item: present(item) });
  }

  m = p.match(/^\/api\/items\/((?:c|l|mp):\d+)\/draft$/);
  if (req.method === 'POST' && m) {
    const item = itemFromKey(m[1]);
    if (!item) return send(res, 404, { error: 'That conversation was not found.' });
    const body = await readBody(req);
    const draft = await draftFor(item, { instruction: String(body.instruction || '').slice(0, 600) });
    return send(res, 200, { item: present(item), ok: draft.status === 'ready', error: draft.error || '' });
  }

  m = p.match(/^\/api\/items\/((?:c|l|mp):\d+)\/dismiss$/);
  if (req.method === 'POST' && m) {
    const item = itemFromKey(m[1]);
    if (!item) return send(res, 404, { error: 'That conversation was not found.' });
    dismiss(item.itemKey, item.anchorKey);
    return send(res, 200, { ok: true });
  }

  // The conversation was opened on the page: its number badge goes away until a new message arrives.
  m = p.match(/^\/api\/items\/((?:c|l|mp):\d+)\/seen$/);
  if (req.method === 'POST' && m) {
    const item = itemFromKey(m[1]);
    if (!item) return send(res, 404, { error: 'That conversation was not found.' });
    markSeen(item.itemKey, item.anchorKey);
    return send(res, 200, { ok: true });
  }

  // Undo for Dismiss: the conversation goes back to Waiting.
  m = p.match(/^\/api\/items\/((?:c|l|mp):\d+)\/restore$/);
  if (req.method === 'POST' && m) {
    const item = itemFromKey(m[1]);
    if (!item) return send(res, 404, { error: 'That conversation was not found.' });
    undismiss(item.itemKey);
    return send(res, 200, { ok: true, item: present(item) });
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
