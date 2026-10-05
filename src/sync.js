// Pulls new leads, conversations, messages and stock from the dashboard into the local database.

import * as dash from './dashboard.js';
import { normalizeLead, normalizeConversation, normalizeMessage, normalizeVehicle, normalizeSale, normalizeOrder, phoneKey } from './normalize.js';
import { upsertLead, upsertConversation, upsertMessage, upsertVehicle, upsertSale, deleteSale, rekeyLeadItems, getConversation, getMeta, setMeta, transaction, openDb, upsertMpConversation, replaceMpMessages, getMpConversation, countRows, upsertOrder, getOrder, markOrdersGone, leadsByPhone, conversationForPhone } from './db.js';
import * as mp from './marketplace.js';
import { config } from './config.js';

const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const VEHICLE_REFRESH_MS = 30 * 60 * 1000;

export function storeLeads(rawLeads) {
  transaction(() => { for (const r of rawLeads) upsertLead(normalizeLead(r)); });
  return rawLeads.length;
}

/**
 * Stores each vehicle's customer-safe facts, and beside them a small digest of its sale when the
 * dashboard records one. A vehicle whose sale has gone loses its digest.
 */
export function storeVehicles(rawVehicles) {
  transaction(() => {
    for (const r of rawVehicles) {
      upsertVehicle(normalizeVehicle(r));
      const sale = normalizeSale(r);
      if (sale) upsertSale(sale); else if (r?.id !== undefined && r?.id !== null) deleteSale(r.id);
    }
  });
  return rawVehicles.length;
}

export function storeConversation(rawConv, rawMessages) {
  const c = normalizeConversation(rawConv);
  transaction(() => {
    upsertConversation(c);
    if (rawMessages) {
      for (const m of rawMessages) upsertMessage(normalizeMessage({ ...m, conversationId: m.conversationId ?? c.id }));
      openDb().prepare('UPDATE conversations SET messages_synced_at = ? WHERE id = ?').run(c.latestAt ?? Date.now(), c.id);
    }
  });
  return c;
}

export async function syncVehicles({ force = false } = {}) {
  const last = getMeta('vehicles_synced_at', 0);
  if (!force && Date.now() - last < VEHICLE_REFRESH_MS) return { skipped: true };
  const raw = await dash.fetchAllVehicles();
  storeVehicles(raw);
  setMeta('vehicles_synced_at', Date.now());
  return { vehicles: raw.length };
}

export async function syncLeads({ pages = 3, size = 50 } = {}) {
  let n = 0;
  for (let page = 1; page <= pages; page++) {
    const j = await dash.fetchLeadsPage(page, size);
    const list = j.leadDtoList || [];
    if (!list.length) break;
    n += storeLeads(list);
    if (page < pages) await pause(250);
  }
  // Import and auction enquiries are on a list of their own. It is short, so one page covers it.
  let imports = 0;
  try {
    const j = await dash.fetchLeadsPage(1, size, config.dashboard.importsPlatform);
    imports = storeLeads(j.leadDtoList || []);
  } catch (e) { if (!n) throw e; /* the usual leads were read; this list is tried again next time */ }
  // A lead that has gained a conversation keeps its suggestions under the conversation's key.
  rekeyLeadItems();
  return { leads: n, importLeads: imports };
}

const DAY = 24 * 3600 * 1000;

/**
 * Stores the auction orders read from the dashboard. An order that names no lead is matched to
 * one by the customer's phone number, and to their SMS conversation the same way. Orders that
 * ended long ago and were never seen while open are not kept at all. `complete` says the whole
 * list was read: only then is a missing order taken to have been removed.
 */
export function storeAuctionOrders(rawRows, { complete = true, now = Date.now() } = {}) {
  const orders = (rawRows || []).map(normalizeOrder).filter(Boolean);
  const byPhone = orders.some((o) => !o.leadId) ? leadsByPhone() : new Map();
  let changed = 0;
  const listed = [];
  transaction(() => {
    for (const o of orders) {
      listed.push(o.id);
      const known = !!getOrder(o.id);
      if (o.closed && !known && now - (o.cancelledAt || o.createdAt || 0) > 60 * DAY) continue;
      const key = phoneKey(o.customer.phone);
      const lead = o.leadId ? null : byPhone.get(key) || null;
      const links = { leadId: lead?.leadId ?? null, conversationId: lead?.conversationId ?? conversationForPhone(key) };
      if (upsertOrder(o, { now, links }).changed) changed++;
    }
    if (complete) markOrdersGone(listed, now);
  });
  return { auctionOrders: orders.length, auctionOrdersChanged: changed };
}

/**
 * Reads the whole list of auction orders: one request for every 50 orders. Reading changes
 * nothing on the dashboard.
 */
export async function syncAuctionOrders({ size = 50, maxPages = 10, now = Date.now() } = {}) {
  const rows = [];
  let complete = false;
  for (let page = 0; page < maxPages; page++) {
    const j = await dash.fetchAuctionOrdersPage(page, size);
    rows.push(...j.rows);
    if (!j.rows.length || page + 1 >= j.totalPages) { complete = true; break; }
    await pause(200);
  }
  return storeAuctionOrders(rows, { complete, now });
}

/**
 * Conversations come back newest first. Walk pages until reaching ones that have not
 * changed since the last sync, fetching messages only for those that did change.
 */
export async function syncConversations({ maxPages = 5, size = 50 } = {}) {
  let changed = 0, seen = 0;
  for (let page = 0; page < maxPages; page++) {
    const j = await dash.fetchConversationsPage(page, size);
    const list = j.content || [];
    if (!list.length) break;
    let unchangedOnPage = 0;
    for (const raw of list) {
      seen++;
      const c = normalizeConversation(raw);
      const known = getConversation(c.id);
      const upToDate = known && known.messages_synced_at && c.latestAt && known.messages_synced_at >= c.latestAt;
      if (upToDate) { unchangedOnPage++; storeConversation(raw, null); continue; }
      const messages = await dash.fetchAllMessages(c.id);
      storeConversation(raw, messages);
      changed++;
      await pause(150);
    }
    if (unchangedOnPage === list.length || j.last) break;
    await pause(250);
  }
  return { conversationsSeen: seen, conversationsUpdated: changed };
}

export async function syncAll(opts = {}) {
  const started = Date.now();
  const result = {};
  Object.assign(result, await syncVehicles(opts.vehicles));
  Object.assign(result, await syncLeads(opts.leads));
  Object.assign(result, await syncConversations(opts.conversations));
  // The auction orders. A problem here must not fail the whole check.
  try { Object.assign(result, await syncAuctionOrders(opts.auction)); } catch (e) { result.auctionOrdersError = e.message; }
  result.tookSeconds = Math.round((Date.now() - started) / 100) / 10;
  setMeta('last_sync', { at: Date.now(), ok: true, result });
  return result;
}

// ---- Marketplace chats (read from the content engine) --------------------------

/** Stores one chat and all of its messages together. */
export function storeMpConversation(rawConversation, rawMessages, sig = null) {
  const c = mp.normalizeMpConversation(rawConversation);
  const messages = (rawMessages || []).filter((m) => Number.isInteger(Number(m?.id))).map((m, i) => mp.normalizeMpMessage(m, i, c.id));
  transaction(() => {
    upsertMpConversation(c);
    replaceMpMessages(c.id, messages, sig ?? c.sig);
  });
  return c;
}

/**
 * Walks the chat list, newest first, back to the start of the window. The messages of a chat are
 * fetched again only when its summary has changed since the last look. Reading changes nothing
 * on the engine.
 */
export async function syncMarketplace({ windowDays = config.marketplace.windowDays, pageSize = 100, maxPages = 8, maxDetails = null } = {}) {
  const started = Date.now();
  const cutoff = started - windowDays * 24 * 3600 * 1000;
  // The very first run has every chat to read; later runs only the ones that changed.
  const cap = maxDetails ?? (countRows('mp_conversations') ? 60 : 400);
  let seen = 0, updated = 0, left = 0;

  for (let page = 0; page < maxPages; page++) {
    const j = await mp.fetchConversationsPage(page * pageSize, pageSize);
    const rows = Array.isArray(j?.conversations) ? j.conversations : [];
    if (!rows.length) break;
    let old = 0;
    for (const raw of rows) {
      if (!Number.isInteger(Number(raw?.id)) || Number(raw.id) <= 0) continue;
      const c = mp.normalizeMpConversation(raw);
      if (c.lastMessageAt && c.lastMessageAt < cutoff) { old++; continue; }
      seen++;
      const known = getMpConversation(c.id);
      if (known && known.messages_synced_at && known.sig === c.sig) { upsertMpConversation(c); continue; }
      if (updated >= cap) { left++; continue; }
      const detail = await mp.fetchConversation(c.id);
      storeMpConversation(detail?.conversation?.id === raw.id ? detail.conversation : raw, detail?.messages || [], c.sig);
      updated++;
      await pause(120);
    }
    const total = Number(j?.total) || 0;
    if (old === rows.length || rows.length < pageSize || (total && (page + 1) * pageSize >= total)) break;
    await pause(200);
  }
  const result = { chatsSeen: seen, chatsUpdated: updated, chatsLeftForNextTime: left, tookSeconds: Math.round((Date.now() - started) / 100) / 10 };
  setMeta('mp_last_sync', { at: Date.now(), ok: true, result });
  return result;
}
