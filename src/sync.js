// Pulls new leads, conversations, messages and stock from the dashboard into the local database.

import * as dash from './dashboard.js';
import { normalizeLead, normalizeConversation, normalizeMessage, normalizeVehicle } from './normalize.js';
import { upsertLead, upsertConversation, upsertMessage, upsertVehicle, getConversation, getMeta, setMeta, transaction, openDb, upsertMpConversation, replaceMpMessages, getMpConversation, countRows } from './db.js';
import * as mp from './marketplace.js';
import { config } from './config.js';

const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const VEHICLE_REFRESH_MS = 30 * 60 * 1000;

export function storeLeads(rawLeads) {
  transaction(() => { for (const r of rawLeads) upsertLead(normalizeLead(r)); });
  return rawLeads.length;
}

export function storeVehicles(rawVehicles) {
  transaction(() => { for (const r of rawVehicles) upsertVehicle(normalizeVehicle(r)); });
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
  return { leads: n };
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
