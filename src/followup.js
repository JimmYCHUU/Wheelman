// Follow-ups: a reason to write to a customer we replied to last. The worker runs refreshFollowUps
// each check with no AI: it reads every dashboard conversation we answered, raises an occasion
// when one is due (an inspection's booked time has passed; the customer has been quiet after our
// reply), and closes the ones that no longer hold (the customer wrote, the car sold, the reason
// aged out). The follow-up itself is written only when the owner opens the conversation from the
// Follow-ups list (src/server.js), from a template in voice/dashboard-messages.md, and is never
// sent or learned from. Everything here but refreshFollowUps is pure.

import { config } from './config.js';
import { listItems, itemFromKey } from './items.js';
import { isOptOut } from './text.js';
import { DECLINED, PARTING, RUDE, CANNOT_COME } from './selling.js';
import { availability } from './normalize.js';
import { reservedByAnother } from './deal.js';
import { sydneyHour, sydneyDay, parseDashboardTime } from './time.js';
import { followUpsFor, openFollowUps, insertFollowUp, closeFollowUp, lastDismissedAt } from './db.js';

const HOUR = 3600e3;
const DAY = 24 * HOUR;
// Our texts this close together are one reply split over several messages, not several replies.
const BURST_MS = 15 * 60e3;
// Our closing line after a no: nothing follows it.
const CLOSE = /if you are looking again|should you look again|glad to help|pleased to help|all the best/i;

/** A message of ours that the customer could read: not a staff note, not a chat engine's own reply. */
const ours = (e) => e.who === 'us' && !e.internal && !e.auto && !!(e.text || e.media);
/** A word or an act of the customer's: a text, a photo, or a website form such as a booking. */
const theirs = (e) => e.who === 'customer' && !!(e.text || e.event || e.media);

export const lastOursOf = (item) => [...item.timeline].reverse().find(ours) || null;
export const lastTheirsOf = (item) => [...item.timeline].reverse().find(theirs) || null;

/** How many replies of ours came after a moment: texts within fifteen minutes of each other count as one. */
export function burstsSince(item, sinceAt) {
  let n = 0;
  let prev = -Infinity;
  for (const e of item.timeline) {
    if (!ours(e) || !(e.at > sinceAt)) continue;
    if (e.at - prev > BURST_MS) n++;
    prev = e.at;
  }
  return n;
}

/** The same moment when it falls in working hours (Sydney), else nine the next morning. */
export function atSensibleHour(ms, { from = 9, to = 18 } = {}) {
  const hour = sydneyHour(ms);
  if (hour >= from && hour < to) return ms;
  const day = hour >= to ? sydneyDay(ms + DAY) : sydneyDay(ms);
  return parseDashboardTime(`${day}T${String(from).padStart(2, '0')}:00`);
}

const bookingsOf = (item) => item.timeline.filter((e) => e.who === 'customer' && e.booking?.at);
const told = (item, re) => item.timeline.some((e) => ours(e) && e.text && re.test(e.text));

/**
 * Whether this conversation may be followed up at all, and why not when it may not. Only a
 * dashboard conversation with a customer record, where nobody is waiting on us; never a buyer, an
 * opt-out, a no, or a conversation the owner dismissed and has not texted since.
 */
export function followUpEligibility(item, { now = Date.now(), cfg = config.followUp } = {}) {
  const no = (why) => ({ allowed: false, why, lastOurs: null, lastTheirs: null, bookings: [] });
  if (!item || !/^[cl]:\d+$/.test(String(item.itemKey || ''))) return no('not a dashboard conversation');
  if (item.section !== 'dashboard' || item.underOrder) return no('listed elsewhere');
  if (item.imports) return no('an import enquiry');
  if (!(item.hasLeadRecord || item.hasName)) return no('no customer record');
  if (item.deal) return no('a buyer');
  if (item.state === 'awaiting') return no('they are waiting for a reply');
  if (item.state === 'optout') return no('asked not to be contacted');
  if (item.state === 'closed') return no('no longer looking');
  if (item.state === 'other') return no('not a customer');
  if (item.timeline.some((e) => e.who === 'customer' && e.text && isOptOut(e.text))) return no('asked not to be contacted');
  const lastText = [...item.timeline].reverse().find((e) => e.who === 'customer' && e.text);
  if (lastText && (DECLINED.test(lastText.text) || PARTING.test(lastText.text) || RUDE.test(lastText.text))) return no('they said no');
  const lastOurs = lastOursOf(item);
  const lastTheirs = lastTheirsOf(item);
  const dismissedAt = lastDismissedAt(item.itemKey);
  if (dismissedAt && dismissedAt > (lastTheirs?.at || 0) && !(lastOurs && lastOurs.at > dismissedAt)) return no('dismissed');
  void now; void cfg;
  return { allowed: true, why: '', lastOurs, lastTheirs, bookings: bookingsOf(item) };
}

/**
 * The follow-ups due for one conversation right now: [{ kind, occasion, sinceAt, reason, template,
 * dueAt, data }]. `rows` are the follow-ups already raised for it (read when not given): one per
 * silence, so a row that hangs on the same or a later moment of the customer's, whatever became
 * of it, blocks a new one; so do two replies of ours already standing unanswered.
 */
export function dueFollowUps(item, { now = Date.now(), cfg = config.followUp, rows = null } = {}) {
  const e = followUpEligibility(item, { now, cfg });
  if (!e.allowed) return [];
  const have = rows || followUpsFor(item.itemKey);
  const { lastOurs, lastTheirs, bookings } = e;
  const out = [];
  const blocked = (occasion, sinceAt) => have.some((r) => r.occasion !== occasion && r.since_at >= sinceAt) || burstsSince(item, sinceAt) >= 2;

  // An inspection or test drive whose booked time has gone by: the newest such booking, unless
  // they wrote after the visit (then there is a message to answer) or said they could not come.
  const passed = bookings.filter((b) => b.booking.at + cfg.afterInspectionHours * HOUR <= now && b.booking.at >= now - 7 * DAY).pop();
  if (passed) {
    const after = item.timeline.filter((x) => x.who === 'customer' && x.text && x.at > passed.at);
    const ok = (lastTheirs?.at || 0) <= passed.booking.at && !after.some((x) => CANNOT_COME.test(x.text));
    const occasion = `inspection:${passed.key}`;
    if (ok && !blocked(occasion, passed.booking.at)) {
      out.push({
        kind: 'inspection_passed', occasion, sinceAt: passed.booking.at,
        reason: passed.booking.kind === 'test_drive' ? 'Test drive passed' : 'Inspection passed',
        template: 'after_inspection',
        dueAt: atSensibleHour(passed.booking.at + cfg.afterInspectionHours * HOUR),
        data: { bookedAt: passed.booking.at, where: passed.booking.where, kind: passed.booking.kind, deposit: !told(item, /\bdeposit\b/i) },
      });
    }
  }

  // Quiet: our reply stands unanswered for long enough, about a car still on offer, with no visit
  // booked (the reminder covers that) and none just passed (the message above covers that).
  const v = item.vehicles?.[0];
  const future = bookings.some((b) => b.booking.at > now);
  const recentVisit = bookings.some((b) => b.booking.at >= now - 7 * DAY && b.booking.at <= now);
  if (item.state === 'answered' && lastOurs && lastTheirs && lastOurs.at > lastTheirs.at && !future && !recentVisit && v
    && availability(v).code !== 'sold' && !reservedByAnother(v, item.deal)
    && lastOurs.at + cfg.quietHours * HOUR <= now && lastOurs.at >= now - cfg.maxAgeDays * DAY
    && !(lastOurs.text && CLOSE.test(lastOurs.text))) {
    const occasion = `quiet:${lastOurs.key}`;
    if (!blocked(occasion, lastTheirs.at)) {
      const days = Math.max(1, Math.round((now - lastOurs.at) / DAY));
      out.push({
        kind: 'quiet', occasion, sinceAt: lastTheirs.at,
        reason: `Quiet ${days} ${days === 1 ? 'day' : 'days'}`,
        template: 'quiet_nudge',
        dueAt: atSensibleHour(lastOurs.at + cfg.quietHours * HOUR),
        data: {},
      });
    }
  }
  return out.filter((d) => d.dueAt <= now);
}

/**
 * Whether a follow-up raised earlier may still be written now: { ok, why, how }, where `how` says
 * what to close it as when it may not ('answered' when the customer has written since).
 */
export function stillDue(item, row, { now = Date.now(), cfg = config.followUp } = {}) {
  if (!item) return { ok: false, why: 'That conversation was not found.', how: 'lapsed' };
  const last = lastTheirsOf(item);
  if ((last && last.at > row.since_at) || item.state === 'awaiting') return { ok: false, why: 'They have written since. Reply to that instead.', how: 'answered' };
  const e = followUpEligibility(item, { now, cfg });
  if (!e.allowed) return { ok: false, why: `No follow-up now: ${e.why}.`, how: 'lapsed' };
  // The reason itself must still hold: the visit still within the week, the silence still quiet.
  if (!dueFollowUps(item, { now, cfg }).some((d) => d.occasion === row.occasion)) return { ok: false, why: 'No follow-up now: the reason for it has passed.', how: 'lapsed' };
  return { ok: true, why: '', how: '' };
}

/**
 * The worker's pass: raises what is due, closes what no longer holds. Reads every dashboard
 * conversation we answered in the last maxAgeDays, then every open follow-up whose conversation
 * was not among them. Returns { opened, closed }.
 */
export function refreshFollowUps({ now = Date.now(), cfg = config.followUp } = {}) {
  let opened = 0;
  let closed = 0;
  const seen = new Set();
  const close = (r, how) => { closeFollowUp(r.id, how, { now }); closed++; };
  for (const item of listItems({ source: 'dashboard', states: ['answered', 'ack'], maxAgeHours: cfg.maxAgeDays * 24, limit: Infinity })) {
    seen.add(item.itemKey);
    const last = lastTheirsOf(item);
    for (const r of followUpsFor(item.itemKey)) if ((!r.done_how || r.done_how === 'copied') && last && last.at > r.since_at) close(r, 'answered');
    const rows = followUpsFor(item.itemKey);
    const due = dueFollowUps(item, { now, cfg, rows });
    for (const r of rows) if (!r.done_how && !due.some((d) => d.occasion === r.occasion)) close(r, 'lapsed');
    for (const d of due) {
      if (rows.some((r) => r.occasion === d.occasion)) continue;
      if (insertFollowUp({ itemKey: item.itemKey, leadId: item.lead?.id || null, ...d, now })) opened++;
    }
  }
  // Open follow-ups whose conversation was not among those: gone, answered by the customer, or
  // no longer holding. One that still holds stands, even when its conversation's last activity
  // is older than the fortnight read above (a visit booked long ahead).
  for (const r of openFollowUps()) {
    if (seen.has(r.item_key)) continue;
    const still = stillDue(itemFromKey(r.item_key), r, { now, cfg });
    if (!still.ok) close(r, still.how);
  }
  return { opened, closed };
}
