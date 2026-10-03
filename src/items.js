// Builds the list of "work items": customers who have said something and are waiting for a reply.

import { openDb, getLead, getLeadByConversation, getConversation, getMessages, getVehicleByStock, getMpConversation, getMpMessages } from './db.js';
import { readInquiry, isSilentInquiry, isReaction, isAcknowledgement, isOptOut, menuReply, sameText, squash, resolveStock, stockFromUrl, findUrls, unwrapRelay } from './text.js';
import { classify } from './situations.js';
import { firstNameOf } from './redact.js';
import { config } from './config.js';
import { dealFor } from './deal.js';
import { namesStaff } from './voice.js';

const MIN = 60 * 1000;

/**
 * The dashboard sometimes re-imports a phone's history, creating copies of old messages.
 * A copy has the same direction and words as the original and almost the same time.
 * Photos have no words, so only an identical timestamp marks one as a copy.
 */
function dedupeMessages(messages) {
  const lastSeen = new Map(); // direction|words|media -> times already kept
  const seenLongOut = new Set();
  const out = [];
  for (const m of messages) {
    const body = squash(m.body);
    const key = `${m.direction}|${body}|${m.media_type || ''}`;
    const at = m.at || 0;
    const window = body ? 90 * 1000 : 999;
    const times = lastSeen.get(key) || [];
    if (times.some((t) => Math.abs(t - at) <= window)) continue;
    times.push(at);
    lastSeen.set(key, times);
    if (m.direction === 'OUT' && body.length > 40) {
      if (seenLongOut.has(body)) continue;
      seenLongOut.add(body);
    }
    out.push(m);
  }
  return out;
}

const STUCK_AFTER_MS = 15 * MIN;

/**
 * A text of ours counts only if it reached the customer. One that failed, or has sat in the
 * queue, did not: the customer is still waiting. Incoming texts always count.
 */
function reachedCustomer(m, now) {
  if (m.direction !== 'OUT') return true;
  const status = String(m.status || '').toUpperCase();
  if (status === 'FAILED') return false;
  if (status === 'QUEUED' && now - (m.at || m.imported_at || 0) > STUCK_AFTER_MS) return false;
  return true;
}

/** Full timeline for one customer: portal enquiries plus texts, oldest first. */
export function buildTimeline(lead, conversationId, { now = Date.now() } = {}) {
  // Failed texts are dropped before copies are, so a failed text never hides its successful retry.
  const messages = conversationId ? dedupeMessages(getMessages(conversationId).filter((m) => reachedCustomer(m, now))) : [];
  const entries = [];

  for (const m of messages) {
    if (m.direction === 'IN' && isReaction(m.body)) continue;
    let body = String(m.body || '').trim();
    let about = '';
    if (m.direction === 'IN') ({ text: body, about } = unwrapRelay(body));
    if (!body && !m.media_type && !about) continue;
    entries.push({
      who: m.direction === 'IN' ? 'customer' : 'us',
      via: 'SMS',
      text: body,
      event: about ? `Sent through a car portal about: ${about}.` : '',
      media: m.media_type ? (/(image|jpe?g|png)/i.test(m.media_type) ? 'photo' : 'attachment') : null,
      at: m.at || m.imported_at || 0,
      by: m.sent_by || null,
      key: `m:${m.id}`,
    });
  }

  const inbound = entries.filter((e) => e.who === 'customer');
  for (const inq of lead?.inquiries || []) {
    if (isSilentInquiry(inq)) continue;
    const { text, event } = readInquiry(inq);
    if (!text && !event) continue;
    // Texts relayed by the portals also arrive as an SMS; keep only one copy. The copy that is
    // kept takes the enquiry's key, so the key is the same before and after the lead gains a
    // conversation, and a suggestion already written for the enquiry still belongs to it.
    const copy = text ? inbound.find((e) => sameText(e.text, text) || (text.length > 25 && squash(e.text).includes(squash(text)))) : null;
    if (copy) { if (/^m:/.test(copy.key)) copy.key = `i:${inq.id}`; continue; }
    const at = inq.at || lead?.lead_at || 0;
    entries.push({
      who: 'customer',
      via: inq.type || lead?.source || 'enquiry',
      text,
      event,
      at,
      stockNo: inq.stockNo || '',
      url: inq.url || '',
      key: `i:${inq.id}`,
    });
    // A staff note on the enquiry ("SMS sent", "Offered $1500") means somebody has dealt with it.
    for (const n of inq.staffNotes || []) {
      if (!n.text) continue;
      entries.push({ who: 'us', internal: true, via: 'staff note', text: n.text, at: Math.max(n.at || 0, at + 1), by: n.by || null, key: `n:${inq.id}` });
    }
  }

  entries.sort((a, b) => (a.at - b.at) || (a.who === 'customer' ? -1 : 1));
  return entries;
}

/**
 * Texts written by a machine: login codes, voicemail and missed-call notices. They are never a
 * customer message, even when the number belongs to someone with a lead record.
 */
export function isAutomatedNotice(pending) {
  const text = pending.map((e) => e.text).join('\n');
  // Only wording a person would not type, because a real customer must never be filed away by mistake.
  return /(\b\d{4,8} is your\b|\byour (login|verification|security|access) code\b|code to log ?in|one[\s-]time (code|password|passcode)|\botp\b|missed call service|click\/tap to hear|call \d{3} to opt out|you have (a |\d+ )?(new )?(missed calls?|voice ?mails?|voice messages?))/i.test(text);
}

/** Texts from suppliers, couriers and marketers arrive on the same phone. They have no lead record. */
function looksLikeNonCustomer(pending) {
  const text = pending.map((e) => e.text).join('\n');
  const foreignLink = findUrls(text).some((u) => !/carbarn\.com\.au|carsales\.com\.au|autotrader|photos\.app\.goo\.gl|maps\.app\.goo\.gl/i.test(u));
  const marketing = /(unsubscribe|opt[\s-]?out|reply stop|quick review|leave (us )?a review|your (order|parcel|delivery|tyres|invoice) (is|has|should|will)|verification code|do not reply|no[\s-]?reply)/i.test(text);
  // Looser signs of a machine, safe only for a number with no customer record.
  const automated = /(\b(your|the) (login |verification |security |access )?code\b|left you a message|voice ?mail)/i.test(text);
  return marketing || automated || isAutomatedNotice(pending) || (foreignLink && /(review|track|order|code|offer|sale|deal)/i.test(text));
}

function findVehicles(lead, timeline, deal = null, pending = []) {
  // A buyer is writing about their own car, whether or not a stock number is in the conversation.
  // Another car counts only if they name it in the message that is waiting.
  if (deal?.vehicle) {
    const out = [deal.vehicle];
    for (const e of pending) {
      for (const ref of [...findUrls(e.text).map(stockFromUrl), e.url ? stockFromUrl(e.url) : null, e.stockNo || null].filter(Boolean)) {
        const v = resolveStock(ref, getVehicleByStock);
        if (v && !out.some((o) => o.id === v.id) && out.length < 2) out.push(v);
      }
    }
    return out;
  }

  const refs = [];
  const recent = timeline.slice(-10).reverse();
  for (const e of recent) {
    for (const u of findUrls(e.text)) { const s = stockFromUrl(u); if (s) refs.push(s); }
    if (e.url) { const s = stockFromUrl(e.url); if (s) refs.push(s); }
    if (e.stockNo) refs.push(e.stockNo);
  }
  for (const s of [...(lead?.stocks || [])].reverse()) refs.push(s);

  const out = [];
  const seen = new Set();
  for (const ref of refs) {
    const v = resolveStock(ref, getVehicleByStock);
    if (v && !seen.has(v.id)) { seen.add(v.id); out.push(v); }
    if (out.length >= 2) break;
  }
  return out;
}

/**
 * Works out who is waiting on whom from a finished timeline. Shared by dashboard conversations
 * and Marketplace chats.
 * base: { itemKey, channel, lead, hasLeadRecord, conversation, conversationId, phone }
 */
export function finishItem(base, timeline, { now = Date.now() } = {}) {
  const { lead, hasLeadRecord } = base;

  let lastUs = -1;
  for (let i = timeline.length - 1; i >= 0; i--) if (timeline[i].who === 'us') { lastUs = i; break; }
  const pending = timeline.slice(lastUs + 1);
  const previousOut = lastUs >= 0 ? timeline[lastUs] : null;

  // Is this person already a buyer, and of which car? Marketplace chats carry no phone number
  // to match a sale with, so they are always treated as enquiries.
  const { deal, pastBuyer } = base.channel === 'marketplace'
    ? { deal: null, pastBuyer: null }
    : dealFor({ lead, conversation: base.conversation, timeline, pending, now });

  let state = 'answered';
  let note = '';
  let menu = null;
  if (pending.length) {
    const last = pending[pending.length - 1];
    const meaningful = pending.filter((e) => e.event || e.media || (e.text && !isAcknowledgement(e.text)));
    menu = previousOut ? menuReply(last.text, previousOut.text) : null;
    if (pending.some((e) => isOptOut(e.text))) { state = 'optout'; note = 'Customer asked not to be contacted. Do not reply.'; }
    else if (menu?.notLooking) { state = 'closed'; note = 'Customer chose "no longer looking". No reply needed.'; }
    else if (!meaningful.length) { state = 'ack'; note = 'Customer only said thanks or OK. No reply needed.'; }
    else if (isAutomatedNotice(pending)) { state = 'other'; note = 'An automatic notice (a login code, voicemail or missed call), not a message from a customer.'; }
    else if (!hasLeadRecord && looksLikeNonCustomer(pending)) { state = 'other'; note = 'Looks like a marketing or supplier message, not a customer.'; }
    else if (!lead && !deal && timeline.length >= 40) { state = 'other'; note = 'A long-running conversation with no customer record. Probably a supplier, broker or colleague.'; }
    else state = 'awaiting';
  }

  const last = pending[pending.length - 1] || timeline[timeline.length - 1];
  const pendingText = pending.map((e) => e.text).filter(Boolean).join('\n');
  const events = pending.map((e) => e.event).filter(Boolean);
  if (menu && !menu.notLooking) events.push(`Customer replied to our numbered menu: ${menu.meanings.join(' and ')}.`);
  const situation = classify(menu ? '' : pendingText, { events, leadStatus: lead?.status, buyer: !!deal });
  if (menu && !menu.notLooking) {
    const map = { 1: 'photos_video', 2: 'finance', 3: 'location_hours' };
    situation.all = [...new Set([...menu.picks.map((p) => map[p]).filter(Boolean), ...situation.all.filter((s) => s !== 'general')])];
    situation.primary = situation.all[0] || 'general';
  }

  // "Can I see the Shuttle before buying?" names the car by its model, which the wording rules
  // cannot know. With the car in hand it is recognised as wanting to inspect.
  const vehicles = findVehicles(lead, timeline, deal, pending);
  if (!deal && !menu && !situation.all.includes('inspection_booking') && asksToSeeCar(pendingText, vehicles)) {
    situation.all = [...situation.all.filter((s) => s !== 'general'), 'inspection_booking'];
    if (situation.primary === 'general') situation.primary = 'inspection_booking';
  }

  const isFirstReply = !timeline.some((e) => e.who === 'us' && !e.internal);

  // Whether a suggestion should be written without being asked. Free AI requests are limited,
  // so they are kept for people we know to be customers and messages the agent can actually read.
  const mediaOnly = pending.length > 0 && pending.every((e) => !e.text && !e.event);
  const known = hasLeadRecord || !!firstNameOf(lead || {}) || !!deal;
  let autoDraft = state === 'awaiting';
  let autoReason = '';
  if (autoDraft && mediaOnly) { autoDraft = false; autoReason = 'The customer sent a photo or attachment with no words. The agent cannot see photos, so nothing was written automatically.'; }
  else if (autoDraft && !known) { autoDraft = false; autoReason = 'This number has no customer record, so nothing was written automatically. If it is a customer, choose Write it now.'; }
  else if (autoDraft && now - (last.at || 0) > config.autoDraftMaxAgeHours * 60 * MIN) {
    autoDraft = false;
    autoReason = 'This message is more than a day old, so nothing was written automatically. If it still needs a reply, choose Write it now.';
  }

  return {
    channel: base.channel || 'sms',
    mediaOnly,
    autoDraft,
    autoReason,
    noLead: !lead,
    hasLeadRecord,
    hasName: !!firstNameOf(lead || {}),
    itemKey: base.itemKey,
    anchorKey: last.key,
    conversationId: base.conversationId ?? null,
    lead,
    conversation: base.conversation || null,
    phone: base.phone || '',
    timeline,
    pending,
    pendingText,
    events,
    menu,
    state,
    note,
    situation,
    isFirstReply,
    // A brand-new enquiry: nobody has written back yet, and the person is not already a buyer.
    // Someone who writes to one of our staff by name ("Hi Sam, can we move the appointment?") is
    // already dealing with us by phone or in person, whatever the texts show.
    isNewEnquiry: (base.channel || 'sms') === 'sms' && isFirstReply && !deal && !namesStaff(pendingText),
    deal,
    pastBuyer,
    lastInboundAt: pending.length ? last.at : null,
    lastActivityAt: timeline[timeline.length - 1].at,
    vehicles,
  };
}

/**
 * True when the customer asks to see, view or look at one of their cars by name:
 * "see the Shuttle", "have a look at the Hiace". Asking to see its photos or price is not that.
 */
function asksToSeeCar(text, vehicles) {
  const names = new Set();
  for (const v of vehicles) for (const w of `${v.make || ''} ${v.model || ''}`.toLowerCase().split(/[^a-z0-9]+/)) if (w.length >= 3) names.add(w);
  if (!names.size) return false;
  for (const m of String(text || '').toLowerCase().matchAll(/\b(?:see|view|look at|check out)\s+(?:the|this|that|your)\s+((?:[a-z0-9-]+\s+){0,2}[a-z0-9-]+)/g)) {
    const words = m[1].split(/[\s-]+/);
    if (/^(photos?|pics?|pictures?|videos?|price|listing|ad|details|specs?|history|report|sheet|paperwork|invoice)$/.test(words[0])) continue;
    const at = words.findIndex((w) => names.has(w));
    if (at === -1) continue;
    // "see the Hiace photos" is about the photos, not the van.
    if (/^(photos?|pics?|pictures?|videos?|price|listing|details|specs?|history|report|sheet)$/.test(words[at + 1] || '')) continue;
    return true;
  }
  return false;
}

/** Everything known about one customer, and whether they are waiting on us. */
export function buildItem({ conversationId = null, leadId = null }) {
  const conversation = conversationId ? getConversation(conversationId) : null;
  let lead = leadId ? getLead(leadId) : null;
  if (!lead && conversation?.lead_id) lead = getLead(conversation.lead_id);
  if (!lead && conversationId) lead = getLeadByConversation(conversationId);
  const convId = conversationId ?? lead?.conversation_id ?? null;
  if (!conversation && !lead) return null;
  // A lead the dashboard knows but this app does not store (one on another platform) still counts
  // as a customer record: the conversation carries its id, name, status and platform.
  const hasLeadRecord = !!lead || !!conversation?.lead_id;
  if (!lead && conversation?.customer_name && !/^\+?[\d\s]+$/.test(conversation.customer_name)) {
    const [first, ...rest] = conversation.customer_name.trim().split(/\s+/);
    lead = {
      id: null, first_name: first, last_name: rest.join(' '), phone: conversation.phone, email: conversation.lead_email || '',
      status: conversation.lead_status || '', platform: conversation.lead_platform || '', source: '', state: '',
      stocks: [], inquiries: [], statusHistory: [], nameOnly: true,
    };
  }

  const timeline = buildTimeline(lead, convId);
  if (!timeline.length) return null;

  return finishItem({
    itemKey: convId ? `c:${convId}` : `l:${lead.id}`,
    channel: 'sms',
    lead,
    hasLeadRecord,
    conversation,
    conversationId: convId,
    phone: conversation?.phone || lead?.phone || '',
  }, timeline);
}

// ---- Marketplace chats -----------------------------------------------------------

const AUTO_SOURCE = /^(agent|auto|bot|ai)/i;

/**
 * An outgoing Marketplace message counts as ours only once the buyer can see it.
 * Queued and failed replies do not count: the buyer is still waiting.
 */
const reachedBuyer = (m) => m.status === 'sent' || m.status === 'delivered' || m.status === 'seen' || (!m.status && !AUTO_SOURCE.test(m.source || '') && m.source !== 'dashboard');

/** One Facebook Marketplace chat, in the same shape as a dashboard item. Key: mp:<id>. */
export function buildMarketplaceItem(id, { now = Date.now() } = {}) {
  const row = getMpConversation(Number(id));
  if (!row) return null;
  const c = row.data;
  const timeline = [];
  let at = 0;
  let unsent = 0;
  let queuedAt = null; // when the newest reply that has not reached the buyer was written
  for (const m of getMpMessages(row.id)) {
    at = Math.max(at, m.at || 0) || c.lastMessageAt || 0;
    if (!m.text && !m.has_media) continue;
    const media = m.has_media ? 'attachment' : null;
    if (m.direction === 'out') {
      if (!reachedBuyer(m)) { unsent++; if (m.status === 'queued' || m.status === 'pending' || m.status === 'sending') queuedAt = at; continue; }
      const auto = AUTO_SOURCE.test(m.source || '');
      timeline.push({ who: 'us', via: 'Marketplace', text: m.text || '', event: '', media, at, by: auto ? 'Auto-reply' : 'Typed by a person', auto, key: `fm:${m.id}` });
    } else {
      if (isReaction(m.text)) continue;
      timeline.push({ who: 'customer', via: 'Marketplace', text: m.text || '', event: '', media, at, by: null, key: `fm:${m.id}` });
    }
  }
  if (!timeline.length) return null;

  const [first, ...rest] = String(c.buyerName || '').trim().split(/\s+/);
  const lead = { id: null, first_name: first || '', last_name: rest.join(' '), phone: '', email: '', status: '', source: 'Facebook Marketplace', state: '', stocks: c.stockId ? [c.stockId] : [], inquiries: [] };
  const item = finishItem({ itemKey: `mp:${row.id}`, channel: 'marketplace', lead, hasLeadRecord: true, conversation: null, conversationId: null, phone: '' }, timeline);

  const e = c.engine || {};
  const needsPerson = !!(e.locked || e.stage === 'handed_off' || c.failedOutbound > 0);
  const replyComing = !!(e.enabled && !e.locked && (c.pendingOutbound > 0 || (e.dueAt && e.dueAt > now - 60 * 1000)));
  if (c.archived && item.state === 'awaiting') { item.state = 'closed'; item.note = 'This chat is archived on Marketplace. No reply needed.'; item.autoDraft = false; }
  if (item.autoDraft && c.kind && c.kind !== 'buyer') { item.autoDraft = false; item.autoReason = 'This chat is not marked as a buyer, so nothing was written automatically. If it is a buyer, choose Write it now.'; }
  if (!item.autoDraft && item.mediaOnly) item.autoReason = 'The buyer sent a photo or attachment with no words. Wheelman cannot see photos, so nothing was written automatically.';

  item.marketplace = {
    id: row.id,
    account: c.account || '',
    listingTitle: c.listingTitle || '',
    listingPrice: c.listingPrice || '',
    listingUrl: c.listingUrl || '',
    stockId: c.stockId || '',
    archived: !!c.archived,
    needsPerson,
    replyComing,
    // Set only while the buyer is still waiting on that queued reply.
    queuedAt: replyComing && item.pending.length && queuedAt && queuedAt >= (item.pending[item.pending.length - 1].at || 0) ? queuedAt : null,
    failed: c.failedOutbound || 0,
    unsent,
    engine: { enabled: !!e.enabled, stage: e.stage || '', locked: !!e.locked, lockReason: e.lockReason || '', lockDetail: e.lockDetail || '', urgency: e.urgency || '', nextAction: e.nextAction || '', notes: e.notes || [] },
  };
  return item;
}

/** Finds an item by its key: c:<conversation>, l:<lead> or mp:<Marketplace chat>. */
export function itemFromKey(key) {
  const m = String(key || '').match(/^(c|l|mp):(\d+)$/);
  if (!m) return null;
  const id = Number(m[2]);
  if (m[1] === 'mp') return buildMarketplaceItem(id);
  return buildItem(m[1] === 'c' ? { conversationId: id } : { leadId: id });
}

/** Customers with recent activity, newest first. source: 'dashboard' or 'marketplace'. */
export function listItems({ maxAgeHours = config.draftMaxAgeHours, states = ['awaiting'], limit = 200, source = 'dashboard' } = {}) {
  const db = openDb();
  const cutoff = Date.now() - maxAgeHours * 60 * MIN;
  const items = [];
  const keep = (item) => {
    if (!item) return;
    if (!states.includes(item.state)) return;
    if (item.lastInboundAt && item.lastInboundAt < cutoff) return;
    items.push(item);
  };
  const newest = (a, b) => (b.lastInboundAt || b.lastActivityAt) - (a.lastInboundAt || a.lastActivityAt);

  if (source === 'marketplace') {
    for (const r of db.prepare('SELECT id FROM mp_conversations WHERE last_message_at >= ? ORDER BY last_message_at DESC').all(cutoff)) keep(buildMarketplaceItem(r.id));
    // Chats the engine has handed to a person come first.
    items.sort((a, b) => (Number(b.marketplace.needsPerson) - Number(a.marketplace.needsPerson)) || newest(a, b));
    return items.slice(0, limit);
  }

  const keys = new Map();
  for (const c of db.prepare('SELECT id FROM conversations WHERE latest_at >= ? ORDER BY latest_at DESC').all(cutoff)) {
    keys.set(`c:${c.id}`, { conversationId: c.id });
  }
  for (const l of db.prepare('SELECT id, conversation_id FROM leads WHERE lead_at >= ? OR updated_at >= ? ORDER BY updated_at DESC').all(cutoff, cutoff)) {
    const key = l.conversation_id ? `c:${l.conversation_id}` : `l:${l.id}`;
    if (!keys.has(key)) keys.set(key, l.conversation_id ? { conversationId: l.conversation_id, leadId: l.id } : { leadId: l.id });
  }
  for (const ref of keys.values()) keep(buildItem(ref));
  items.sort(newest);
  return items.slice(0, limit);
}
