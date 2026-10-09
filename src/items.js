// Builds the list of "work items": customers who have said something and are waiting for a reply.

import { openDb, getLead, getLeadByConversation, getLeadByPhone, getConversation, getMessages, getVehicleByStock, getMpConversation, getMpMessages, getOrder, orderNotes, getPhoneThread, getPhoneMessages, listPhoneThreads, phoneMessagesFor, getMailThread, getMailMessages, listMailThreads } from './db.js';
import { orderKey, orderMarks, orderStatus, orderRow, occasionFor, MESSAGES } from './orders.js';
import { sameMessage, windowFor } from './phone.js';
import { phoneKeys } from './normalize.js';
import { readInquiry, isSilentInquiry, isReaction, isAcknowledgement, isOptOut, menuReply, sameText, squash, resolveStock, stockFromUrl, findUrls, unwrapRelay } from './text.js';
import { classify, labelFor } from './situations.js';
import { importContext } from './imports.js';
import { firstNameOf, isPlaceholderName } from './redact.js';
import { config } from './config.js';
import { dealFor } from './deal.js';
import { namesStaff } from './voice.js';
import { scenarioItem } from './modelreplies.js';
import { loadEligibleModels, modelCodesIn, modelsIn } from './eligible.js';

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

/** A text seen on the phone, as a timeline entry. Key pm:<id>. */
function phoneEntry(r) {
  return {
    who: r.direction === 'IN' ? 'customer' : 'us',
    via: 'SMS (phone)',
    text: String(r.text || '').trim(),
    event: '',
    media: r.media || null,
    at: r.at,
    by: null,
    key: `pm:${r.id}`,
    // Not on the dashboard. The page says so, and nothing is ever learned from it.
    phoneOnly: true,
    approx: r.precision === 'day' || r.precision === 'unknown',
  };
}

/**
 * Adds the texts the phone add-on saw for this number. One the dashboard also has is left out: the
 * dashboard's copy stays, with its exact time. When the phone saw it first, the dashboard's entry
 * takes the phone entry's key, so a suggestion written for it stays attached.
 */
function addPhoneEntries(entries, rows) {
  for (const r of rows) {
    const e = phoneEntry(r);
    if (!e.text && !e.media) continue;
    const mine = { direction: r.direction, text: e.text, media: e.media, at: r.at, truncated: !!r.truncated };
    const twin = entries.find((x) => x.via === 'SMS' && sameMessage({ direction: x.who === 'customer' ? 'IN' : 'OUT', text: x.text, media: x.media, at: x.at }, mine, windowFor(r.precision)));
    if (twin) {
      if (/^m:/.test(twin.key) && r.seen_at && twin.importedAt && r.seen_at < twin.importedAt) twin.key = e.key;
      continue;
    }
    entries.push(e);
  }
}

/**
 * Full timeline for one customer: portal enquiries plus texts, oldest first.
 * phone: false leaves out what was seen on the phone (the example bank never sees it).
 */
/** How many photo addresses a message carries; the page asks for each by its index. */
function countMedia(json) {
  if (!json) return 0;
  try { const l = JSON.parse(json); return Array.isArray(l) ? l.filter((u) => typeof u === 'string').length : 0; } catch { return 0; }
}

export function buildTimeline(lead, conversationId, { now = Date.now(), phone = true } = {}) {
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
      photos: countMedia(m.media_urls_json),
      at: m.at || m.imported_at || 0,
      importedAt: m.imported_at || null,
      by: m.sent_by || null,
      key: `m:${m.id}`,
    });
  }

  if (phone && config.phone.switchedOn) {
    const conversation = conversationId ? getConversation(conversationId) : null;
    const keys = phoneKeys(conversation?.phone, lead?.phone);
    if (keys.length || conversationId) addPhoneEntries(entries, phoneMessagesFor({ keys, conversationId }));
  }

  const inbound = entries.filter((e) => e.who === 'customer');
  const formsSeen = new Set();
  for (const inq of lead?.inquiries || []) {
    if (isSilentInquiry(inq)) continue;
    const { text, event } = readInquiry(inq);
    if (!text && !event) continue;
    // The same website form sent twice is one enquiry.
    if (event && formsSeen.has(`${event}|${text}`)) continue;
    formsSeen.add(`${event}|${text}`);
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

/**
 * A sender on the ignore list (IGNORED_SENDERS): a contact saved on the phone under a label such
 * as "Not customer" or "OTP", a finance company, a courier. Matched on the name without spaces
 * or case, so "Credit One", "creditone" and "Rob CreditOne" all count.
 */
export function isIgnoredSender(name) {
  const flat = String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!flat) return false;
  return config.ignoredSenders.some((s) => { const w = String(s).toLowerCase().replace(/[^a-z0-9]/g, ''); return w && flat.includes(w); });
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

  // An import or auction enquiry carries the name of a website page or an auction lot where a
  // stock number would be. Only a link to one of our own cars counts for those leads.
  const importLead = String(lead?.platform || '').toUpperCase() === config.dashboard.importsPlatform;
  const refs = [];
  const recent = timeline.slice(-10).reverse();
  for (const e of recent) {
    for (const u of findUrls(e.text)) { const s = stockFromUrl(u); if (s) refs.push(s); }
    if (e.url) { const s = stockFromUrl(e.url); if (s) refs.push(s); }
    if (e.stockNo && !importLead) refs.push(e.stockNo);
  }
  if (!importLead) for (const s of [...(lead?.stocks || [])].reverse()) refs.push(s);

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
export function finishItem(base, timeline, { now = Date.now(), autoDraftMaxAgeHours = config.autoDraftMaxAgeHours } = {}) {
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
    // An email's footer may say "unsubscribe" under a long message: only a short email is an opt-out.
    if (pending.some((e) => isOptOut(e.text) && (base.channel !== 'email' || squash(e.text).length <= 160))) { state = 'optout'; note = 'Customer asked not to be contacted. Do not reply.'; }
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
  else if (autoDraft && now - (last.at || 0) > autoDraftMaxAgeHours * 60 * MIN) {
    autoDraft = false;
    const age = autoDraftMaxAgeHours >= 48 ? `more than ${Math.round(autoDraftMaxAgeHours / 24)} days old` : 'more than a day old';
    autoReason = `This message is ${age}, so nothing was written automatically. If it still needs a reply, choose Write it now.`;
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
  // A number with no record of its own may be a customer the dashboard knows by name from an
  // earlier enquiry: the name comes along, the earlier enquiry's cars and status do not.
  if (!lead && conversation?.phone) {
    const known = getLeadByPhone(conversation.phone, { isName: (s) => !isPlaceholderName(s) });
    if (known) {
      lead = {
        id: null, first_name: known.first_name, last_name: known.last_name || '', phone: conversation.phone, email: known.email || '',
        status: '', platform: '', source: '', state: '', stocks: [], inquiries: [], statusHistory: [], nameOnly: true,
      };
    }
  }

  const timeline = buildTimeline(lead, convId);
  if (!timeline.length) return null;

  const item = finishItem({
    itemKey: convId ? `c:${convId}` : `l:${lead.id}`,
    channel: 'sms',
    lead,
    hasLeadRecord,
    conversation,
    conversationId: convId,
    phone: conversation?.phone || lead?.phone || '',
  }, timeline);

  // A sender on the ignore list is kept, never listed.
  if (isIgnoredSender(conversation?.customer_name) || isIgnoredSender(`${lead?.first_name || ''} ${lead?.last_name || ''}`)) {
    item.state = 'other';
    item.note = 'A sender on the ignore list (IGNORED_SENDERS in the .env file), not a customer.';
  }

  // An import or auction enquiry: what they asked us to find travels with the item.
  item.imports = importContext(lead);
  if (item.imports && !item.deal && !item.situation.all.includes('import_sourcing')) {
    const rest = item.situation.all.filter((s) => s !== 'general');
    item.situation.all = item.situation.primary === 'complaint' ? [...rest, 'import_sourcing'] : ['import_sourcing', ...rest];
    item.situation.primary = item.situation.all[0];
    item.situation.label = labelFor(item.situation.primary);
  }
  return item;
}

// ---- Marketplace chats -----------------------------------------------------------

const AUTO_SOURCE = /^(agent|auto|bot|ai|followup)/i;
const ON_ITS_WAY = /^(queued|pending|sending)$/i;

/**
 * An outgoing Marketplace message counts as ours only once the buyer can see it.
 * Queued and failed replies do not count: the buyer is still waiting.
 */
const reachedBuyer = (m) => m.status === 'sent' || m.status === 'delivered' || m.status === 'seen' || (!m.status && !AUTO_SOURCE.test(m.source || '') && m.source !== 'dashboard');

/**
 * The one exception: a reply a person typed (here, or on the engine's own page) that the engine
 * has queued for its phone to type into the chat. The person has answered; the chat is not
 * waiting on anyone else. It shows as ours, marked as on its way, until the engine reports it sent.
 * A queued auto-reply is not the same: the engine may still fail or hold it, so the buyer waits.
 */
const onItsWay = (m) => !AUTO_SOURCE.test(m.source || '') && ON_ITS_WAY.test(m.status || '');

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
      const sending = onItsWay(m);
      if (!reachedBuyer(m) && !sending) { unsent++; if (ON_ITS_WAY.test(m.status || '')) queuedAt = at; continue; }
      const auto = AUTO_SOURCE.test(m.source || '');
      timeline.push({ who: 'us', via: 'Marketplace', text: m.text || '', event: '', media, at, by: auto ? 'Auto-reply' : 'Typed by a person', auto, sending, key: `fm:${m.id}` });
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
    // True while the newest message is a person's reply that the engine's phone has yet to type into the chat.
    sending: !!timeline[timeline.length - 1]?.sending,
    engine: { enabled: !!e.enabled, stage: e.stage || '', locked: !!e.locked, lockReason: e.lockReason || '', lockDetail: e.lockDetail || '', urgency: e.urgency || '', nextAction: e.nextAction || '', notes: e.notes || [] },
  };
  return item;
}

// ---- auction orders -----------------------------------------------------------------

const money = (n) => `$${Math.round(Number(n) || 0).toLocaleString('en-AU')}`;

/**
 * One auction order, in the shape the page and the drafter use. Key: ao:<order id>.
 *
 * It is not built by finishItem: an order is not a conversation waiting for a reply. Its thread
 * is what is known to have happened (the order's own steps, staff notes, any SMS conversation
 * with that number, what was copied from Wheelman and what the owner pasted in). It is "waiting"
 * when a pasted customer message has no reply yet, or when a message is due for its stage.
 * `message` is a kind of message the owner picked from the "Which message?" list.
 */
export function buildOrderItem(id, { message = '', now = Date.now() } = {}) {
  const o = getOrder(Number(id));
  if (!o || o.goneAt) return null;
  const key = orderKey(o.id);
  const marks = orderMarks().of(key);
  const status = orderStatus(o, marks, { now });
  const lead = { id: o.leadId, first_name: o.customer.firstName, last_name: o.customer.lastName, phone: o.customer.phone, email: o.customer.email, status: '', source: 'Auction order', state: '', stocks: [], inquiries: [] };

  const timeline = [];
  // The texts and website enquiries the dashboard has for this customer: context, shown as they are.
  const smsLead = o.leadId ? getLead(o.leadId) : null;
  const convId = o.conversationId ?? smsLead?.conversation_id ?? null;
  if (smsLead || convId) timeline.push(...buildTimeline(smsLead, convId, { now }));

  // A step of the order is a record of ours, not something said to the customer: it is marked
  // internal, so it never counts as "we have written to them".
  const step = (text, at, k) => { if (at) timeline.push({ who: 'us', internal: true, via: 'order', text: '', event: text, at, by: null, key: `ev:${k}` }); };
  step(`Auction order ${o.orderNo} opened`, o.createdAt, 'opened');
  o.money.payments.forEach((p, i) => step(`${p.type === 'DEPOSIT' || p.stage === 'INITIAL_DEPOSIT' ? 'Deposit' : 'Payment'} of ${money(p.amount)} received`, p.at, `pay${i}`));
  step('Car secured', o.securedAt, 'secured');
  step('Refund requested', o.refundRequestedAt, 'refund');
  step(o.closed === 'refunded' ? 'Order refunded' : 'Order cancelled', o.closed ? o.cancelledAt || o.marks[`stage:${o.closed}`] : null, 'closed');
  step('Order completed', o.completedAt, 'completed');

  for (const n of orderNotes(o.id)) timeline.push({ who: 'us', internal: true, via: 'staff note', text: n.body, at: n.at || 0, by: null, key: `on:${n.note_id}` });
  for (const d of openDb().prepare('SELECT id, copied_at, copied_text FROM drafts WHERE item_key = ? AND copied_at IS NOT NULL ORDER BY copied_at').all(key)) {
    if (d.copied_text) timeline.push({ who: 'us', via: 'WhatsApp', text: d.copied_text, event: '', at: d.copied_at, by: 'Copied from Wheelman', key: `cp:${d.id}` });
  }
  for (const p of marks.pastes) {
    timeline.push(p.direction === 'in'
      ? { who: 'customer', via: 'WhatsApp', text: p.text, event: '', at: p.at, by: null, key: `in:${p.id}` }
      : { who: 'us', via: 'WhatsApp', text: p.text, event: '', at: p.at, by: 'Pasted by you', key: `po:${p.id}` });
  }
  timeline.sort((a, b) => (a.at - b.at) || (a.who === 'customer' ? -1 : 1));

  const waitingKeys = new Set(status.waiting.map((p) => `in:${p.id}`));
  const pending = timeline.filter((e) => waitingKeys.has(e.key));
  const pendingText = pending.map((e) => e.text).filter(Boolean).join('\n');
  // A reply to what the customer wrote is about whatever they asked, on top of being an order.
  const asked = pending.length ? classify(pendingText, { events: [], leadStatus: '', buyer: false }).all.filter((s) => s !== 'general') : [];
  const chosen = message && MESSAGES[message] ? message : '';

  return {
    channel: 'auction',
    mediaOnly: false,
    autoDraft: false,
    autoReason: '',
    noLead: false,
    hasLeadRecord: true,
    hasName: !!firstNameOf(lead),
    itemKey: key,
    anchorKey: chosen ? `out:${occasionFor(o, chosen, status.next)}` : status.anchorKey,
    conversationId: convId,
    lead,
    conversation: null,
    phone: o.customer.phone || '',
    timeline,
    pending,
    pendingText,
    events: [],
    menu: null,
    state: status.state,
    note: '',
    situation: { primary: 'import_sourcing', all: ['import_sourcing', ...asked.filter((s) => s !== 'import_sourcing')], label: status.stage.label },
    isFirstReply: !timeline.some((e) => e.who === 'us' && !e.internal && e.text),
    isNewEnquiry: false,
    deal: null,
    pastBuyer: null,
    lastInboundAt: pending.length ? pending[pending.length - 1].at : null,
    lastActivityAt: timeline.length ? timeline[timeline.length - 1].at : o.createdAt || now,
    vehicles: [],
    imports: null,
    order: o,
    orderStatus: status,
    orderRow: orderRow(o, marks, { now }),
    // The kind of message in the box: the one picked, else the one that is due.
    message: chosen || (status.kind === 'send' ? status.next.type : ''),
  };
}

// ---- conversations seen only on the phone ----------------------------------------

/**
 * A conversation the phone add-on saw and the dashboard has no record of. Key: ph:<thread>. Once
 * the dashboard has the number, the same key leads to the dashboard's item instead. It is built
 * through finishItem like any text conversation; with no customer record nothing is written for it
 * unasked, as for any unknown number. A short code or a sender id is a notice, not a customer.
 */
export function buildPhoneItem(id, { now = Date.now() } = {}) {
  const t = getPhoneThread(Number(id));
  if (!t || !config.phone.switchedOn) return null;
  if (t.conversation_id) return buildItem({ conversationId: t.conversation_id });
  if (t.lead_id) return buildItem({ leadId: t.lead_id });
  const timeline = getPhoneMessages(t.id).map(phoneEntry).filter((e) => e.text || e.media);
  if (!timeline.length) return null;
  const ignored = isIgnoredSender(t.name);
  let lead = null;
  if (t.kind === 'contact' && !ignored) {
    const [first, ...rest] = String(t.name).trim().split(/\s+/);
    lead = { id: null, first_name: first, last_name: rest.join(' '), phone: '', email: '', status: '', platform: '', source: '', state: '', stocks: [], inquiries: [], statusHistory: [], nameOnly: true };
  }
  const phone = t.kind === 'number' ? t.name : '';
  const item = finishItem({
    itemKey: `ph:${t.id}`, channel: 'sms', lead, hasLeadRecord: false,
    conversation: { phone, customer_name: t.kind === 'contact' ? t.name : '' }, conversationId: null, phone,
  }, timeline, { now });
  if (ignored) {
    item.state = 'other';
    item.note = 'A sender on the ignore list (IGNORED_SENDERS in the .env file), not a customer.';
  } else if ((t.kind === 'shortcode' || t.kind === 'alpha') && item.state === 'awaiting') {
    item.state = 'other';
    item.note = 'A short code or a sender name rather than a phone number: a notice, not a customer.';
  }
  // Only on the phone: a saved contact there is as likely a supplier or a colleague as a customer,
  // and the free AI requests are kept for people known to be customers. "Write it now" works.
  if (item.autoDraft) item.autoReason = 'This conversation is only on the phone, with no customer record on the dashboard, so nothing was written automatically. If it is a customer, choose Write it now.';
  item.autoDraft = false;
  item.phoneOnly = true;
  item.imports = null;
  return item;
}

// ---- email threads from Gmail (the Import Query section) -----------------------------------

/** One email of a thread, as a timeline entry. Key mm:<id>. */
function mailEntry(r) {
  const ours = r.direction === 'OUT';
  const text = String(r.text || '').trim();
  return {
    who: ours ? 'us' : 'customer',
    via: 'Email',
    text,
    // A message Gmail had folded has no text to show; the entry stands in its place and says so.
    event: r.collapsed && !text ? 'A message Gmail had folded: in Gmail, press Expand all, then Send to Wheelman again.' : '',
    media: r.attachments ? 'attachment' : null,
    at: r.at,
    by: ours ? (r.from_name || r.from_email || '') : null,
    key: `mm:${r.id}`,
    approx: !!r.approx,
  };
}

/** The model an email names, from the eligible-models list on this computer. No request is made. */
function mailCar(text, now) {
  try {
    const { models } = loadEligibleModels(now);
    if (!models.length) return '';
    const codes = modelCodesIn(text, models);
    if (codes.known[0]) return codes.known[0].models[0].title;
    const fam = modelsIn(text, models)[0];
    return fam ? `${fam.make} ${fam.model}` : '';
  } catch { return ''; }
}

/**
 * One email thread the owner sent from Gmail, in the same shape as a dashboard item. Key em:<id>.
 * The customer is whoever first wrote from an address that is not ours. Nothing is matched to the
 * dashboard yet. A reply is researched on the website and written while the customer's latest
 * email is recent (config.mail.autoDraftMaxAgeDays); older ones wait for Write it now.
 */
export function buildMailItem(id, { now = Date.now() } = {}) {
  const t = getMailThread(Number(id));
  if (!t || !config.mail.switchedOn) return null;
  const timeline = getMailMessages(t.id).map(mailEntry).filter((e) => e.text || e.media || e.event);
  if (!timeline.length) return null;
  const [first, ...rest] = String(t.customer_name || '').trim().split(/\s+/);
  const lead = { id: null, first_name: first || '', last_name: rest.join(' '), phone: '', email: t.customer_email || '', status: '', platform: '', source: 'Email', state: '', stocks: [], inquiries: [], statusHistory: [], nameOnly: true };
  const item = finishItem({
    itemKey: `em:${t.id}`, channel: 'email', lead, hasLeadRecord: true,
    conversation: null, conversationId: null, phone: '',
  }, timeline, { now, autoDraftMaxAgeHours: config.mail.autoDraftMaxAgeDays * 24 });
  item.imports = null;
  item.isNewEnquiry = false;
  item.mail = {
    id: t.id, subject: t.subject || '', customerName: t.customer_name || '', customerEmail: t.customer_email || '', ref: t.ref || '',
    messages: t.message_count || 0, collapsed: t.collapsed_count || 0, firstAt: t.first_at || null, lastAt: t.last_at || null,
    // The model they asked about, for the row's car line.
    car: mailCar(`${t.subject || ''}\n${timeline.filter((e) => e.who === 'customer').map((e) => e.text).join('\n')}`, now),
    draftsOff: false,
  };
  return item;
}

/** Finds an item by its key: c:<conversation>, l:<lead>, mp:<Marketplace chat>, ao:<auction order>, ph:<phone conversation>, tr:<model reply> or em:<email thread>. */
export function itemFromKey(key, opts = {}) {
  const m = String(key || '').match(/^(c|l|mp|ao|ph|tr|em):(\d+)$/);
  if (!m) return null;
  const id = Number(m[2]);
  if (m[1] === 'mp') return buildMarketplaceItem(id);
  if (m[1] === 'ao') return buildOrderItem(id, opts);
  if (m[1] === 'ph') return buildPhoneItem(id);
  if (m[1] === 'tr') return scenarioItem(id, opts); // a model reply's invented scenario
  if (m[1] === 'em') return buildMailItem(id);
  return buildItem(m[1] === 'c' ? { conversationId: id } : { leadId: id });
}

/**
 * Customers, newest first. source: 'dashboard', 'marketplace' or 'importquery'. maxAgeHours limits the list to
 * conversations with activity that recent; Infinity lists every conversation ever stored.
 * olderThanHours leaves out the recent ones instead, so the two halves can be built and kept apart.
 */
export function listItems({ maxAgeHours = config.draftMaxAgeHours, olderThanHours = 0, states = ['awaiting'], limit = 200, source = 'dashboard' } = {}) {
  const db = openDb();
  const cutoff = Number.isFinite(maxAgeHours) ? Date.now() - maxAgeHours * 60 * MIN : 0;
  const before = olderThanHours > 0 ? Date.now() - olderThanHours * 60 * MIN : Number.MAX_SAFE_INTEGER;
  const items = [];
  const keep = (item) => {
    if (!item) return;
    if (!states.includes(item.state)) return;
    if (item.lastInboundAt && item.lastInboundAt < cutoff) return;
    items.push(item);
  };
  const newest = (a, b) => (b.lastInboundAt || b.lastActivityAt) - (a.lastInboundAt || a.lastActivityAt);

  if (source === 'marketplace') {
    for (const r of db.prepare('SELECT id FROM mp_conversations WHERE last_message_at >= ? AND last_message_at < ? ORDER BY last_message_at DESC').all(cutoff, before)) keep(buildMarketplaceItem(r.id));
    // Chats the engine has handed to a person come first.
    items.sort((a, b) => (Number(b.marketplace.needsPerson) - Number(a.marketplace.needsPerson)) || newest(a, b));
    return items.slice(0, limit);
  }

  // Email threads sent from Gmail: their own section, never mixed with the dashboard's conversations.
  if (source === 'importquery') {
    if (!config.mail.switchedOn) return [];
    for (const r of listMailThreads({ cutoff, before })) keep(buildMailItem(r.id));
    items.sort(newest);
    return items.slice(0, limit);
  }

  const keys = new Map();
  for (const c of db.prepare('SELECT id FROM conversations WHERE latest_at >= ? AND latest_at < ? ORDER BY latest_at DESC').all(cutoff, before)) {
    keys.set(`c:${c.id}`, { conversationId: c.id });
  }
  for (const l of db.prepare('SELECT id, conversation_id FROM leads WHERE (lead_at >= ? OR updated_at >= ?) AND lead_at < ? AND updated_at < ? ORDER BY updated_at DESC').all(cutoff, cutoff, before, before)) {
    const key = l.conversation_id ? `c:${l.conversation_id}` : `l:${l.id}`;
    if (!keys.has(key)) keys.set(key, l.conversation_id ? { conversationId: l.conversation_id, leadId: l.id } : { leadId: l.id });
  }
  // Numbers seen on the phone that the dashboard has nothing for.
  if (config.phone.switchedOn) {
    for (const t of listPhoneThreads({ cutoff })) if (!t.conversation_id && !t.lead_id && t.latest_at < before) keys.set(`ph:${t.id}`, { phoneThreadId: t.id });
  }
  for (const ref of keys.values()) keep(ref.phoneThreadId ? buildPhoneItem(ref.phoneThreadId) : buildItem(ref));
  items.sort(newest);
  return items.slice(0, limit);
}
