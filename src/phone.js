// Texts seen on the business phone, handed in by the browser add-on in extension/. The add-on reads
// the Google Messages list in the owner's own browser and reports the latest message of each
// conversation. This file checks a report, keeps what is new, and matches each conversation to the
// dashboard's by phone number.
//
// Safety: nothing here can reach the phone or the browser. The add-on talks to Wheelman, never the
// other way round. Nothing from the phone is ever learned from (see canLearnFrom in learn.js and
// updateOutcomes in worker.js), and the example bank never sees it (voicebank.js).

import { phoneKey } from './normalize.js';
import { squash } from './text.js';
import { transaction, leadsByPhone, conversationForPhone, conversationByCustomerName, upsertPhoneThread, bumpPhoneThread, recentPhoneMessages, addPhoneMessage, updatePhoneMessage, rekeyPhoneThreads } from './db.js';

const MIN = 60e3;
const HOUR = 3600e3;
const MAX_THREADS = 100;
const MAX_TEXT = 2000;
const KINDS = new Set(['number', 'shortcode', 'alpha', 'contact']);
const PRECISIONS = new Set(['exact', 'minute', 'hour', 'day']);

const str = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/** Checks a report from the add-on and returns it in a clean shape. Throws a plain message when it is not one. */
export function validateReport(body, { now = Date.now() } = {}) {
  if (!body || typeof body !== 'object' || body.v !== 1) throw new Error('That is not a report from the phone add-on.');
  if (!Array.isArray(body.threads)) throw new Error('The report has no conversations in it.');
  const earliest = now - 400 * 24 * HOUR;
  const latest = now + 5 * MIN;
  const seenAt = Number.isFinite(body.seenAt) ? clamp(body.seenAt, earliest, latest) : now;
  const threads = [];
  for (const t of body.threads.slice(0, MAX_THREADS)) {
    if (!t || typeof t !== 'object' || !t.latest || typeof t.latest !== 'object') continue;
    const name = str(t.name, 120);
    if (!name) continue;
    const L = t.latest;
    const text = str(L.text, MAX_TEXT);
    const media = L.media === 'photo' || L.media === 'attachment' ? L.media : null;
    if (!text && !media) continue;
    const at = Number.isFinite(L.at) ? clamp(L.at, earliest, latest) : null;
    threads.push({
      ref: str(t.ref, 64),
      name,
      kind: KINDS.has(t.kind) ? t.kind : 'contact',
      unread: !!t.unread,
      latest: {
        direction: L.direction === 'out' ? 'OUT' : 'IN',
        text, media, truncated: !!L.truncated,
        at, precision: at !== null && PRECISIONS.has(L.precision) ? L.precision : 'unknown',
        when: str(L.when, 40),
      },
    });
  }
  const found = body.found && typeof body.found === 'object'
    ? { listItems: Number(body.found.listItems) || 0, parsed: Number(body.found.parsed) || 0 }
    : { listItems: threads.length, parsed: threads.length };
  return { seenAt, hidden: !!body.hidden, signedOut: !!body.signedOut, found, threads };
}

/**
 * How far apart two times may be and still belong to the same text, given how precisely the phone's
 * time is known. The dashboard's time is exact. The phone's "exact" time is when the add-on saw the
 * text: after a poll of up to half a minute, plus however long the computer was asleep, while the
 * dashboard's copy arrives after Pushbullet's relay and the dashboard's own import. Two hours covers
 * all of that; a customer repeating the same words later than that is a real nudge and must count.
 * A time known only to the day ("Yesterday", "Mon") gets the whole day with some slack.
 */
export function windowFor(precision) {
  if (precision === 'day' || precision === 'unknown') return 26 * HOUR;
  if (precision === 'hour') return 3 * HOUR;
  return 2 * HOUR;
}

/**
 * Whether a text seen on the phone and one the dashboard has are the same message: same direction,
 * same words (or the phone's cut-short version is the start of the full one), close enough in time.
 * Both sides: { direction: 'IN'|'OUT', text, media, at, truncated? }.
 */
export function sameMessage(a, b, window) {
  if (a.direction !== b.direction) return false;
  if (Math.abs((a.at || 0) - (b.at || 0)) > window) return false;
  const x = squash(a.text).toLowerCase();
  const y = squash(b.text).toLowerCase();
  if (!x && !y) return !!a.media === !!b.media;
  if (x === y) return true;
  const [shorter, longer, cut] = x.length < y.length ? [x, y, a.truncated] : [y, x, b.truncated];
  return !!cut && shorter.length >= 20 && longer.startsWith(shorter);
}

/**
 * Keeps what is new in a report. Each conversation is matched to the dashboard's records by its
 * number (the add-on's own idea of the number is never trusted), or by the exact customer name when
 * the phone shows a saved contact. A latest message that has not changed since the last report
 * writes nothing, so the half-minute heartbeat leaves the page's lists alone.
 */
export function storePhoneReport(report, { now = Date.now() } = {}) {
  return transaction(() => {
    const byPhone = leadsByPhone();
    let stored = 0;
    let changed = 0;
    for (const t of report.threads) {
      const key = phoneKey(t.name);
      const kind = key ? 'number' : t.kind;
      const fromLead = key ? byPhone.get(key) : null;
      const conversationId = key
        ? conversationForPhone(key) ?? fromLead?.conversationId ?? null
        : kind === 'contact' ? conversationByCustomerName(t.name) : null;
      const leadId = fromLead?.leadId ?? null;
      const L = t.latest;
      const sig = `${L.direction}|${squash(L.text).toLowerCase()}|${L.media || ''}`;
      // The time: a text the list shows as new (within a couple of minutes) arrived about now. An
      // older one keeps the time the list gives, as precisely as the list gives it.
      const recent = L.at !== null && report.seenAt - L.at <= 2 * MIN;
      const at = recent || L.at === null ? report.seenAt : L.at;
      const precision = recent ? 'exact' : L.at === null ? 'unknown' : L.precision;
      const thread = upsertPhoneThread({
        key: t.ref ? `ref:${t.ref}` : `name:${t.name.toLowerCase()}`,
        ref: t.ref, name: t.name, phoneKey: key, kind, conversationId, leadId,
        latestDirection: L.direction, latestAt: at, latestText: L.text, latestSig: sig,
      }, now);
      // The same words again, much later, is a new text ("Hello?" sent twice), not the same one
      // still at the top of the list: the list's time has jumped forward by more than the window.
      const repeat = !thread.changed && thread.latestAt !== null && at - thread.latestAt > windowFor(precision);
      if (!thread.changed && !repeat) continue;
      if (repeat) bumpPhoneThread(thread.id, at, now);
      changed++;
      const m = { direction: L.direction, text: L.text, media: L.media, truncated: L.truncated, at, precision };
      const twin = recentPhoneMessages(thread.id, 20).find((r) => sameMessage(r, m, windowFor(precision)));
      if (twin) {
        // The list now shows more of a text it cut short before.
        if (twin.truncated && m.text.length > String(twin.text || '').length) updatePhoneMessage(twin.id, { text: m.text, truncated: m.truncated });
        continue;
      }
      addPhoneMessage(thread.id, { ...m, seenAt: report.seenAt, source: 'list' });
      stored++;
    }
    const rekeyed = rekeyPhoneThreads();
    return { stored, changed, threads: report.threads.length, rekeyed };
  });
}
