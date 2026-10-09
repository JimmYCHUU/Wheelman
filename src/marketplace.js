// Client for the content engine's Marketplace inbox.
//
// Safety: reading uses exactly three addresses, with GET. Writing uses exactly one: the engine's
// own "reply" address, the one its inbox page calls when a person types a reply there, and only
// sendReply() can call it, only when a person presses Send on the Wheelman page (see server.js).
// There is no way to change a chat, mark it read, archive it, or switch the engine's auto-reply
// on or off. No cookies are sent and redirects are refused.

import { config } from './config.js';

const READ_ALLOWLIST = [
  /^\/conversations$/,
  /^\/conversations\/\d+$/,
  /^\/devices$/,
];
// The one address a reply may be sent to. The engine queues the text and its phone types it into
// the Marketplace chat; the message then comes back on the next read with its status.
const SEND_ADDRESS = /^\/conversations\/\d+\/reply$/;
const SEND_MAX_CHARS = 2000;

export class MarketplaceError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

function baseUrl() {
  const base = config.marketplace.url;
  let u;
  try { u = new URL(base); } catch { throw new MarketplaceError('MARKETPLACE_URL in the .env file is not a valid address.'); }
  const local = u.hostname === '127.0.0.1' || u.hostname === 'localhost';
  if (u.protocol !== 'https:' && !local) throw new MarketplaceError('MARKETPLACE_URL must start with https://');
  return base;
}

/** GET a JSON resource from the inbox. Any other method or address is refused before a request is made. */
export async function get(pathname, params = {}) {
  if (!READ_ALLOWLIST.some((re) => re.test(pathname))) throw new MarketplaceError(`Blocked: ${pathname} is not on the Marketplace read-only list`);
  const url = new URL(baseUrl() + pathname);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  let res;
  try {
    res = await fetch(url, { method: 'GET', redirect: 'error', credentials: 'omit', headers: { accept: 'application/json', 'user-agent': 'Wheelman/0.2 (read-only)' }, signal: AbortSignal.timeout(20000) });
  } catch (e) {
    throw new MarketplaceError(`The content engine could not be reached (${e.name === 'TimeoutError' ? 'timed out' : e.message}).`, 0);
  }
  if (!res.ok) throw new MarketplaceError(`The content engine returned ${res.status} for ${pathname}`, res.status);
  try { return await res.json(); } catch { throw new MarketplaceError(`The content engine returned something unreadable for ${pathname}`, res.status); }
}

export const fetchConversationsPage = (offset = 0, limit = 100) => get('/conversations', { limit, offset });
export const fetchConversation = (id) => get(`/conversations/${Number(id)}`);

/**
 * Sends one reply into one Marketplace chat, through the engine's own reply address. Called only
 * from the Send route, after a person pressed Send on the page. Refused before any request leaves
 * when the chat id or the text is not usable. Returns the engine's record of the queued message
 * and whether its worker (the phone that types replies) was online.
 */
export async function sendReply(conversationId, text) {
  const id = Number(conversationId);
  if (!Number.isInteger(id) || id <= 0) throw new MarketplaceError('Not a Marketplace chat.');
  const body = String(text ?? '').replace(/\r/g, '').trim();
  if (!body) throw new MarketplaceError('There is nothing to send.');
  if (body.length > SEND_MAX_CHARS) throw new MarketplaceError(`That is too long for one Marketplace message. Keep it under ${SEND_MAX_CHARS.toLocaleString('en-AU')} characters.`);
  const pathname = `/conversations/${id}/reply`;
  if (!SEND_ADDRESS.test(pathname)) throw new MarketplaceError(`Blocked: ${pathname} is not the Marketplace send address`);
  const url = new URL(baseUrl() + pathname);
  let res;
  try {
    res = await fetch(url, {
      method: 'POST', redirect: 'error', credentials: 'omit',
      headers: { accept: 'application/json', 'content-type': 'application/json', 'user-agent': 'Wheelman/0.2' },
      body: JSON.stringify({ text: body, urls: [] }),
      signal: AbortSignal.timeout(20000),
    });
  } catch (e) {
    throw new MarketplaceError(`The content engine could not be reached (${e.name === 'TimeoutError' ? 'timed out' : e.message}), so the reply was not sent.`, 0);
  }
  let json = {};
  try { json = await res.json(); } catch { json = {}; }
  if (!res.ok) {
    const why = [json.error, json.detail, json.message].find((x) => typeof x === 'string' && x.trim()) || `it answered ${res.status}`;
    throw new MarketplaceError(`The Marketplace system did not accept the reply: ${why}`, res.status);
  }
  return { message: json.message && typeof json.message === 'object' ? json.message : null, workerOnline: json.worker_online !== false };
}

// ---- turning the engine's records into what Wheelman stores -----------------------------------

const clean = (s) => (s === null || s === undefined ? '' : String(s).trim());
const time = (s) => { if (!s) return null; const t = typeof s === 'number' ? s : Date.parse(s); return Number.isNaN(t) ? null : t; };
const PRIVATE_KEY = /phone|email|mobile|address|name|thread|participant|url|image|photo/i;
const scrub = (s) => clean(s)
  .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[EMAIL]')
  .replace(/(?<![\d$.,])(\+?61[\s-]?|0)[2-478](?:[\s-]?\d){8}(?!\d)/g, '[PHONE]');

/** Flattens a notes object into short "label: value" lines, leaving out contact details. */
function noteLines(obj, depth = 0) {
  const out = [];
  if (!obj || typeof obj !== 'object' || depth > 2) return out;
  for (const [k, v] of Object.entries(obj)) {
    if (PRIVATE_KEY.test(k) || v === null || v === undefined || v === '' || v === false) continue;
    const label = k.replace(/_/g, ' ');
    if (typeof v === 'string' || typeof v === 'number' || v === true) out.push(`${label}: ${scrub(String(v)).slice(0, 240)}`);
    else if (Array.isArray(v)) { const items = v.filter((x) => typeof x === 'string' || typeof x === 'number').map((x) => scrub(String(x))); if (items.length) out.push(`${label}: ${items.join(', ').slice(0, 240)}`); }
    else out.push(...noteLines(v, depth + 1).map((l) => `${label} ${l}`));
  }
  return out.slice(0, 12);
}

/** Only facebook.com listing links are kept. */
function listingUrl(u) {
  try { const x = new URL(clean(u)); return x.protocol === 'https:' && /(^|\.)facebook\.com$/.test(x.hostname) ? x.href : ''; } catch { return ''; }
}

/** A fingerprint of everything that can change in a chat's summary. */
export function signature(raw) {
  const a = raw.agent || {};
  return [raw.last_message_at, raw.last_inbound_at, raw.last_outbound_at, raw.last_direction, raw.pending_outbound, raw.failed_outbound, raw.archived, a.enabled, a.stage, a.locked, a.due_at].map((x) => x ?? '').join('|');
}

/**
 * Deliberately not kept: the Facebook thread id, participant ids, image and attachment addresses,
 * and any phone number or email the engine captured.
 */
export function normalizeMpConversation(raw) {
  const a = raw.agent || {};
  const car = raw.car || {};
  const card = a.handoff_card || {};
  const captured = card.captured || {};
  const noted = a.lead || {};
  return {
    id: Number(raw.id),
    account: clean(raw.device_name || raw.device),
    buyerName: clean(raw.buyer_name || raw.thread_name),
    listingTitle: clean(car.title || raw.listing_title),
    stockId: clean(car.stock_id),
    listingPrice: clean(car.price || raw.listing_price),
    listingUrl: listingUrl(car.listing_url),
    kind: clean(raw.kind),
    archived: !!raw.archived,
    lastDirection: clean(raw.last_direction),
    lastMessageAt: time(raw.last_message_at),
    pendingOutbound: Number(raw.pending_outbound) || 0,
    failedOutbound: Number(raw.failed_outbound) || 0,
    engine: {
      enabled: !!a.enabled && a.device_enabled !== false,
      stage: clean(a.stage),
      locked: !!a.locked,
      lockReason: scrub(a.lock_reason || card.lock_reason).replace(/_/g, ' '),
      lockDetail: scrub(a.lock_detail || card.lock_detail).slice(0, 300),
      dueAt: time(a.due_at),
      urgency: scrub(card.urgency),
      nextAction: scrub(card.next_action).slice(0, 300),
      // What the engine noted while chatting. Written by an AI, so it is never treated as fact.
      notes: noteLines({
        budget: captured.budget || noted.budget,
        trade_in: captured.trade_in || noted.trade_in,
        booking: captured.booking || noted.booking,
        interested_in: captured.kinds?.length ? captured.kinds : noted.kinds,
        notes: { ...(noted.notes || {}), ...(captured.notes || {}) },
        mood: card.conversation?.sentiment,
        we_promised: card.conversation?.we_promised,
      }),
    },
    sig: signature(raw),
  };
}

export function normalizeMpMessage(raw, seq, conversationId) {
  return {
    id: Number(raw.id),
    conversationId: Number(conversationId),
    seq,
    direction: raw.direction === 'out' ? 'out' : 'in',
    source: clean(raw.source),
    text: clean(raw.text),
    status: clean(raw.status),
    hasMedia: !!raw.has_media || (Array.isArray(raw.attachments) && raw.attachments.length > 0),
    at: time(raw.phone_ts) ?? time(raw.sent_at) ?? time(raw.created_at),
  };
}
