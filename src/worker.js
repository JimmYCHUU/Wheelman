// The background loop: check the dashboard and the Marketplace inbox, note what was actually sent,
// draft what is waiting. Both sources are only ever read.

import { config, missingSettings } from './config.js';
import { syncAll, syncMarketplace } from './sync.js';
import { listItems, itemFromKey, buildOrderItem } from './items.js';
import { prepareOrders } from './ordermessages.js';
import { draftFor } from './drafter.js';
import { latestDraft, isDismissed, draftsAwaitingOutcome, recordOutcome, markSuperseded, setMeta, getMeta, openDb, mpDraftsLastDay, rekeyPhoneThreads } from './db.js';
import { providers, usage, modelStatus, lastModel } from './llm.js';
import { learnFrom, canLearnFrom, comparable, distilPending } from './learn.js';
import { refreshVoiceBankIfStale } from './voicebank.js';
import { similarity } from './text.js';
import { logLine } from './log.js';
import { pollNotifications, leadKnown } from './notifications.js';

export const state = {
  startedAt: Date.now(),
  syncing: false,
  drafting: false,
  lastSync: null,       // { at, ok, message, result }
  alerts: null,         // the dashboard's notification feed: { at, ok, message, newLeads, skipped, triggered }
  vehiclesStale: false, // a notification said a car changed: refresh the vehicle list at the next check
  lastDraftError: null, // { at, message }
  pausedUntil: 0,       // set when the AI daily limit is hit
  holdUntil: 0,         // set for a few minutes when every AI model was busy
  mpHoldUntil: 0,       // Marketplace only: its own models are busy or used up; the dashboard carries on
  mpSyncing: false,
  mpSync: null,         // Marketplace: { at, ok, message, result }
  phone: null,          // the phone add-on's last report: { at, threads, stored, signedOut, found, hidden }
};

const PHONE_NOTE_GAP_MS = 5 * 60 * 1000;

/** Notes a report from the phone add-on. Written to the database only now and then, so the half-minute reports leave it alone. */
export function notePhoneReport(r) {
  const at = Date.now();
  const before = state.phone;
  state.phone = { at, threads: r.threads || 0, stored: r.stored || 0, signedOut: !!r.signedOut, found: r.found || null, hidden: !!r.hidden, lastStoredAt: r.stored ? at : before?.lastStoredAt || null };
  const persisted = getMeta('phone_last_report', null);
  if (r.stored || !persisted || at - (persisted.at || 0) >= PHONE_NOTE_GAP_MS) setMeta('phone_last_report', state.phone);
}

const RETRY_FAILED_AFTER_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 3; // in any hour, for one customer message
const HOLD_AFTER_BUSY_MS = 4 * 60 * 1000;

/** Failed tries for one customer message in the last hour. Older ones no longer count, so it is tried again later. */
function attemptsFor(itemKey, anchorKey, now = Date.now()) {
  return openDb().prepare("SELECT COUNT(*) AS n FROM drafts WHERE item_key = ? AND anchor_key = ? AND status = 'failed' AND created_at >= ?").get(itemKey, anchorKey, now - 60 * 60 * 1000).n;
}

let dashboardCheck = null; // the check that is under way, if any

/**
 * Reads the dashboard. A second caller while a check is under way waits for that same check, so
 * nothing is drafted from a half-read dashboard (which once let Marketplace chats go first).
 */
export function runSync() {
  if (dashboardCheck) return dashboardCheck;
  if (!config.dashboard.baseUrl || !config.dashboard.username || !config.dashboard.password) {
    state.lastSync = { at: Date.now(), ok: false, message: 'Dashboard address or login is not filled in (.env file).' };
    return Promise.resolve(state.lastSync);
  }
  state.syncing = true;
  dashboardCheck = (async () => {
    try {
      const result = await syncAll({ vehicles: { force: state.vehiclesStale } });
      state.vehiclesStale = false;
      state.lastSync = { at: Date.now(), ok: true, message: `Checked the dashboard: ${result.conversationsUpdated} conversation(s) updated.`, result };
    } catch (e) {
      state.lastSync = { at: Date.now(), ok: false, message: e.message };
      logLine('dashboard', e.message);
    } finally {
      state.syncing = false;
      dashboardCheck = null;
      setMeta('last_sync_status', state.lastSync);
    }
    return state.lastSync;
  })();
  return dashboardCheck;
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
    logLine('marketplace', e.message);
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
    // A reply seen only on the phone: the dashboard's copy may still be on its way, so wait a
    // while. If it never comes, the reply counts as sent but teaches nothing (the phone never does).
    if (sent.phoneOnly) {
      if (Date.now() - (sent.at || 0) < 15 * 60 * 1000) continue;
      for (const d of drafts) { recordOutcome(d.id, { sentText, sentBy: 'phone', sentAt: sent.at, similarity: similarity(comparable(d.reply), comparable(sentText)) }); n++; }
      continue;
    }
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
  if (Date.now() < state.pausedUntil || Date.now() < state.holdUntil) return 0;
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
      if (chat && (marketplaceLeft <= 0 || Date.now() < state.mpHoldUntil)) continue;
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
        // Only a problem that needs somebody (a rejected key, a fault) is put on the page.
        // Busy or used-up free models are tried again without bothering anyone.
        state.lastDraftError = d.temporary ? null : { at: Date.now(), message: d.error };
        // Marketplace has its own models. When they are busy or used up, only Marketplace waits:
        // the better models may still be answering for dashboard customers.
        if (chat && d.temporary && providers({ marketplace: true }).length < providers().length) {
          state.mpHoldUntil = Date.now() + (d.daily ? 60 * 60 * 1000 : HOLD_AFTER_BUSY_MS);
          continue;
        }
        if (d.daily) { state.pausedUntil = Date.now() + 60 * 60 * 1000; break; }
        if (d.temporary) { state.holdUntil = Date.now() + HOLD_AFTER_BUSY_MS; break; }
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
  // A number seen only on the phone may now have a dashboard conversation: its marks move across.
  if (config.phone.switchedOn) { try { rekeyPhoneThreads(); } catch (e) { logLine('phone', `Matching phone conversations failed: ${e.message}`); } }
  try { updateOutcomes(); } catch (e) { state.lastDraftError = { at: Date.now(), message: 'Comparing sent replies failed: ' + e.message }; logLine('outcomes', `${e.message} | ${String(e.stack || '').split('\n').slice(1, 4).join(' ')}`); }
  // Once a day, relearn our salespeople's genuine replies from the latest dashboard conversations.
  try { refreshVoiceBankIfStale(); } catch { /* keep the existing bank */ }
  // A coaching note written while every AI model was busy still has its lesson to be worked out.
  try { if (providers().length && Date.now() >= state.pausedUntil) await distilPending(2); } catch { /* next time */ }
  // Auction orders: look at the live auction for the ones still searching, and write the message
  // that is due. These come from the wording file, so no AI is asked and no key is needed.
  try { await prepareOrders(buildOrderItem); } catch (e) { logLine('auction', `Preparing auction orders failed: ${e.message}`); }
  await draftWaiting();
}

// Leads the notification feed announced that are not yet on the lists Wheelman reads. A check
// runs for them; one that is still missing afterwards belongs to another Carbarn site.
const pendingLeads = new Map(); // leadId -> { source, at }

/**
 * Reads the dashboard's notification feed. A new lead sets off a check at once instead of at the
 * next few-minute tick, and a change to a car marks the vehicle list for a refresh. The feed is
 * only read; nothing is marked as read, and nothing from it reaches the AI or the page.
 */
export async function checkAlerts() {
  if (!config.notificationsSeconds || !config.dashboard.baseUrl || !config.dashboard.username || !config.dashboard.password) return null;
  try {
    const r = await pollNotifications();
    if (r.vehicles) state.vehiclesStale = true;
    for (const n of r.leads) if (!leadKnown(n.leadId)) pendingLeads.set(n.leadId, { source: n.source, at: n.at });
    let triggered = false;
    if ((pendingLeads.size || r.vehicles) && !state.syncing && !state.drafting) {
      triggered = true;
      await cycle();
    }
    // After a full check, a lead the feed announced but the Sydney lists do not carry is from
    // another Carbarn site. It is counted and forgotten.
    let skipped = 0;
    if (triggered) for (const [id] of pendingLeads) { if (leadKnown(id)) pendingLeads.delete(id); else { pendingLeads.delete(id); skipped++; } }
    const prev = state.alerts && state.alerts.ok ? state.alerts : null;
    state.alerts = {
      at: Date.now(), ok: true, triggered,
      newLeads: r.leads.length, skipped, skippedTotal: (prev?.skippedTotal || 0) + skipped,
      lastLeadAt: r.leads.length ? Math.max(...r.leads.map((n) => n.at)) : prev?.lastLeadAt || null,
      message: r.first ? 'Lead alerts: reading from here on.' : triggered ? `Lead alerts: ${r.leads.length} new lead(s), checked the dashboard.` : 'Lead alerts: nothing new.',
    };
  } catch (e) {
    state.alerts = { ...(state.alerts || {}), at: Date.now(), ok: false, triggered: false, message: e.message };
    logLine('alerts', `Reading the notification feed failed: ${e.message}`);
  }
  return state.alerts;
}

let timer = null;
let alertTimer = null;
export function start() {
  const tick = async () => {
    try { await cycle(); } catch (e) { state.lastSync = { at: Date.now(), ok: false, message: e.message }; }
    timer = setTimeout(tick, Math.max(1, config.syncMinutes) * 60 * 1000);
  };
  tick();
  if (config.notificationsSeconds > 0) {
    const alertTick = async () => {
      try { await checkAlerts(); } catch { /* noted in state.alerts */ }
      alertTimer = setTimeout(alertTick, config.notificationsSeconds * 1000);
    };
    alertTimer = setTimeout(alertTick, config.notificationsSeconds * 1000);
  }
}
export function stop() { if (timer) clearTimeout(timer); if (alertTimer) clearTimeout(alertTimer); }

/** The phone add-on, for the page and for the add-on's own popup. */
function phoneStatus() {
  const on = config.phone.switchedOn;
  const last = state.phone || (on ? getMeta('phone_last_report', null) : null);
  const at = last?.at || null;
  return {
    on,
    lastReportAt: at,
    lastStoredAt: last?.lastStoredAt || null,
    threads: last?.threads || 0,
    signedOut: !!last?.signedOut,
    // It has reported before, but not for a while: the browser or the tab is probably closed.
    stale: on && !!at && Date.now() - at > config.phone.staleMinutes * 60 * 1000,
    // The tab is open but the list could not be read: the page has probably changed.
    listUnreadable: !!(last?.found && last.found.listItems === 0 && !last.signedOut),
  };
}

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
    // The notification feed: on when a poll interval is set, with the last read's outcome.
    alerts: { on: config.notificationsSeconds > 0, everySeconds: config.notificationsSeconds, ...(state.alerts || {}) },
    marketplace: {
      enabled: config.marketplace.enabled,
      syncing: state.mpSyncing,
      lastSync: config.marketplace.enabled ? state.mpSync || getMeta('mp_sync_status', null) : null,
      draftsLastDay: mpDraftsLastDay(),
      dailyDrafts: config.marketplace.dailyDrafts,
    },
    phone: phoneStatus(),
    outcomes: { answered: stats.answered || 0, sentAlmostUnchanged: stats.close || 0, sentWithEdits: stats.edited || 0, averageMatch: stats.average ? Math.round(stats.average * 100) : null },
  };
}
