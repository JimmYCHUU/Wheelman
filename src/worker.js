// The background loop: check the dashboard and the Marketplace inbox, note what was actually sent,
// draft what is waiting. Both sources are only ever read.

import { config, missingSettings } from './config.js';
import { syncAll, syncMarketplace } from './sync.js';
import { listItems, itemFromKey } from './items.js';
import { draftFor } from './drafter.js';
import { latestDraft, isDismissed, draftsAwaitingOutcome, recordOutcome, markSuperseded, setMeta, getMeta, openDb, mpDraftsLastDay } from './db.js';
import { providers, usage, modelStatus, lastModel } from './llm.js';
import { learnFrom, canLearnFrom, comparable, distilPending } from './learn.js';
import { refreshVoiceBankIfStale } from './voicebank.js';
import { similarity } from './text.js';

export const state = {
  startedAt: Date.now(),
  syncing: false,
  drafting: false,
  lastSync: null,       // { at, ok, message, result }
  lastDraftError: null, // { at, message }
  pausedUntil: 0,       // set when the AI daily limit is hit
  mpSyncing: false,
  mpSync: null,         // Marketplace: { at, ok, message, result }
};

const RETRY_FAILED_AFTER_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 3;

function attemptsFor(itemKey, anchorKey) {
  return openDb().prepare("SELECT COUNT(*) AS n FROM drafts WHERE item_key = ? AND anchor_key = ? AND status = 'failed'").get(itemKey, anchorKey).n;
}

export async function runSync() {
  if (state.syncing) return state.lastSync;
  if (!config.dashboard.baseUrl || !config.dashboard.username || !config.dashboard.password) {
    state.lastSync = { at: Date.now(), ok: false, message: 'Dashboard address or login is not filled in (.env file).' };
    return state.lastSync;
  }
  state.syncing = true;
  try {
    const result = await syncAll();
    state.lastSync = { at: Date.now(), ok: true, message: `Checked the dashboard: ${result.conversationsUpdated} conversation(s) updated.`, result };
  } catch (e) {
    state.lastSync = { at: Date.now(), ok: false, message: e.message };
  } finally {
    state.syncing = false;
    setMeta('last_sync_status', state.lastSync);
  }
  return state.lastSync;
}

/**
 * Reads the Marketplace inbox from the content engine. It has its own state and its own errors,
 * so a problem here never stops the dashboard side, and it does not need the dashboard login.
 */
export async function runMarketplaceSync() {
  if (!config.marketplace.enabled) return null;
  if (state.mpSyncing) return state.mpSync;
  state.mpSyncing = true;
  try {
    const result = await syncMarketplace();
    state.mpSync = { at: Date.now(), ok: true, message: `Checked Marketplace: ${result.chatsUpdated} chat(s) updated.`, result };
  } catch (e) {
    state.mpSync = { at: Date.now(), ok: false, message: e.message };
  } finally {
    state.mpSyncing = false;
    setMeta('mp_sync_status', state.mpSync);
  }
  return state.mpSync;
}

/**
 * For each suggestion still open, see whether a reply has since been sent, and compare.
 * Dashboard conversations only: Marketplace suggestions are not tracked and never learned from.
 */
export function updateOutcomes() {
  let n = 0;
  // Several suggestions may exist for one customer message (rewrites). Group them, newest first.
  const groups = new Map();
  for (const d of draftsAwaitingOutcome()) {
    if (!canLearnFrom(d.item_key)) continue;
    const k = `${d.item_key}|${d.anchor_key}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(d);
  }

  for (const drafts of groups.values()) {
    const item = itemFromKey(drafts[0].item_key);
    if (!item) continue;
    const at = item.timeline.findIndex((e) => e.key === drafts[0].anchor_key);
    if (at === -1) continue;
    const after = item.timeline.slice(at + 1).filter((e) => !e.internal);
    if (!after.length) continue;

    // The customer wrote again before anyone replied. Whatever we send next answers the newer
    // message, so it says nothing about these suggestions.
    if (after[0].who !== 'us') { for (const d of drafts) markSuperseded(d.id); continue; }

    // Our reply: the texts we sent in a row, up to the customer's next message. Replies are
    // often split over two or three texts sent within a few minutes.
    const burst = [];
    for (const e of after) {
      if (e.who !== 'us' || e.at - after[0].at > 15 * 60 * 1000) break;
      burst.push(e);
    }
    const sentText = burst.map((e) => e.text).join('\n');
    const sent = burst[0];
    for (const d of drafts) {
      recordOutcome(d.id, { sentText, sentBy: sent.by || 'phone', sentAt: sent.at, similarity: similarity(comparable(d.reply), comparable(sentText)) });
      n++;
    }
    // The reply that was really sent is the best teacher: one lesson per customer message, taken
    // from the suggestion that was copied, or else the newest. Dashboard conversations only.
    const teacher = drafts.find((d) => d.copied_at) || drafts[0];
    try { learnFrom(item, teacher, sentText, 'sent', { at: sent.at }); } catch { /* learning must never stop the sync */ }
  }
  return n;
}

export async function draftWaiting({ max = 25 } = {}) {
  if (state.drafting) return 0;
  if (!providers().length) return 0;
  if (Date.now() < state.pausedUntil) return 0;
  state.drafting = true;
  let made = 0;
  try {
    // Dashboard customers first. Marketplace chats follow, within their own allowance,
    // so a busy Marketplace day cannot use up the requests the dashboard needs.
    const queue = listItems({ states: ['awaiting'] });
    let marketplaceLeft = 0;
    if (config.marketplace.enabled) {
      marketplaceLeft = Math.max(0, config.marketplace.dailyDrafts - mpDraftsLastDay());
      queue.push(...listItems({ source: 'marketplace', states: ['awaiting'] }));
    }
    for (const item of queue) {
      if (made >= max) break;
      const chat = item.channel === 'marketplace';
      if (chat && marketplaceLeft <= 0) continue;
      if (!item.autoDraft) continue;
      if (isDismissed(item.itemKey, item.anchorKey)) continue;
      const existing = latestDraft(item.itemKey, item.anchorKey);
      if (existing && existing.status !== 'failed') continue;
      if (existing && existing.status === 'failed') {
        if (Date.now() - existing.created_at < RETRY_FAILED_AFTER_MS) continue;
        if (attemptsFor(item.itemKey, item.anchorKey) >= MAX_ATTEMPTS) continue;
      }
      if (usage().remaining <= 0) { state.pausedUntil = Date.now() + 30 * 60 * 1000; break; }
      const d = await draftFor(item);
      if (d.status === 'failed') {
        state.lastDraftError = { at: Date.now(), message: d.error };
        if (d.daily) { state.pausedUntil = Date.now() + 60 * 60 * 1000; break; }
        if (/could not be reached|No AI key/i.test(d.error || '')) break;
      } else {
        state.lastDraftError = null;
        made++;
        if (chat) marketplaceLeft--;
      }
    }
  } finally {
    state.drafting = false;
  }
  return made;
}

export async function cycle() {
  await Promise.all([runSync(), runMarketplaceSync()]);
  try { updateOutcomes(); } catch (e) { state.lastDraftError = { at: Date.now(), message: 'Comparing sent replies failed: ' + e.message }; }
  // Once a day, relearn our salespeople's genuine replies from the latest dashboard conversations.
  try { refreshVoiceBankIfStale(); } catch { /* keep the existing bank */ }
  // A coaching note written while every AI model was busy still has its lesson to be worked out.
  try { if (providers().length && Date.now() >= state.pausedUntil) await distilPending(2); } catch { /* next time */ }
  await draftWaiting();
}

let timer = null;
export function start() {
  const tick = async () => {
    try { await cycle(); } catch (e) { state.lastSync = { at: Date.now(), ok: false, message: e.message }; }
    timer = setTimeout(tick, Math.max(1, config.syncMinutes) * 60 * 1000);
  };
  tick();
}
export function stop() { if (timer) clearTimeout(timer); }

export function statusReport() {
  const u = providers().length ? usage() : { total: 0, limit: config.llm.dailyLimit, remaining: config.llm.dailyLimit };
  const stats = openDb().prepare(`
    SELECT COUNT(*) AS answered,
           SUM(CASE WHEN similarity >= 0.8 THEN 1 ELSE 0 END) AS close,
           SUM(CASE WHEN similarity >= 0.5 AND similarity < 0.8 THEN 1 ELSE 0 END) AS edited,
           AVG(similarity) AS average
    FROM drafts WHERE status = 'answered' AND sent_at >= ? AND (item_key LIKE 'c:%' OR item_key LIKE 'l:%')`).get(Date.now() - 14 * 24 * 3600 * 1000);
  return {
    missing: missingSettings(),
    syncing: state.syncing,
    drafting: state.drafting,
    lastSync: state.lastSync || getMeta('last_sync_status', null),
    lastDraftError: state.lastDraftError,
    paused: Date.now() < state.pausedUntil,
    ai: { providers: modelStatus(), lastModel: lastModel().model, usedToday: u.total, limit: u.limit },
    syncMinutes: config.syncMinutes,
    marketplace: {
      enabled: config.marketplace.enabled,
      syncing: state.mpSyncing,
      lastSync: config.marketplace.enabled ? state.mpSync || getMeta('mp_sync_status', null) : null,
      draftsLastDay: mpDraftsLastDay(),
      dailyDrafts: config.marketplace.dailyDrafts,
    },
    outcomes: { answered: stats.answered || 0, sentAlmostUnchanged: stats.close || 0, sentWithEdits: stats.edited || 0, averageMatch: stats.average ? Math.round(stats.average * 100) : null },
  };
}
