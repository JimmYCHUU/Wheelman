// What a Facebook Marketplace chat shows beyond its messages: what the engine's auto-reply is doing
// with it (the pills after the messages), the listing when it is not in the stock list, the panel's
// Marketplace section, and the list's line when Marketplace was not reached. The old page's words
// (web/app.js renderThread, renderHead, marketplaceInfo). Pure functions (no DOM, no globals).
import { ago, clock, money, plural } from '../../lib/format.js';

/** A queued auto-reply normally goes within a minute or two; one that has sat this long is probably stuck. */
const STUCK_MS = 15 * 60 * 1000;

const web = (u) => (/^https?:\/\//i.test(String(u || '')) ? String(u) : '');
const handedOver = (m) => !!(m.locked || m.stage === 'handed_off');

/**
 * The pills after the messages, in the old page's order: [{ tone, text }], each a sentence. Handed
 * to a person; replies that failed to send; and, while the buyer waits, an auto-reply queued (one
 * queued 15 minutes or more has probably not gone).
 */
export function marketplacePills(item, now) {
  const m = item && item.marketplace;
  if (!m) return [];
  const out = [];
  if (handedOver(m)) out.push({ tone: 'info', text: 'The auto-reply has handed this chat to a person' + (m.lockReason ? ': ' + m.lockReason : '') + '.' });
  if (m.failed) out.push({ tone: 'bad', text: plural(m.failed, 'reply', 'replies') + ' from the Marketplace system failed to send.' });
  if (m.replyComing && item.state === 'awaiting') {
    out.push(m.queuedAt && now - m.queuedAt >= STUCK_MS
      ? { tone: 'warn', text: 'The auto-reply wrote an answer ' + ago(m.queuedAt, now) + ', but it has not been sent.' }
      : { tone: 'info', text: 'An auto-reply is queued for this chat and may answer first.' });
  }
  return out;
}

/** The strip for a listing that is not in the stock list (the car strip shows one that is), or null. Its link reads "Open on Facebook". */
export function listingStrip(item) {
  const m = item && item.marketplace;
  if (!m || item.vehicle || !m.listingTitle) return null;
  return { title: m.listingTitle, note: 'Not in the stock list', url: web(m.listingUrl) };
}

/**
 * The panel's Marketplace section, in the old page's labels and order: rows [{ label, value, url? }]
 * (a row with nothing to say is left out), then what the auto-reply noted, which was never checked.
 */
export function marketplaceRows(m) {
  const handed = handedOver(m);
  const price = /^\$?[\d,]+(\.\d+)?$/.test(m.listingPrice || '') ? money(Number(m.listingPrice.replace(/[$,]/g, ''))) : m.listingPrice;
  const url = web(m.listingUrl);
  const rows = [
    { label: 'Seller account', value: m.account },
    { label: 'Listing', value: m.listingTitle },
    { label: 'Price on Facebook', value: price },
    { label: 'Auto-reply', value: m.autoReply ? 'On for this chat' : 'Off for this chat' },
    { label: 'Stage', value: m.stage ? m.stage.replace(/_/g, ' ') : '' },
    { label: 'Handed to a person', value: handed ? m.lockReason || 'Yes' : '' },
    { label: 'Why', value: handed ? m.lockDetail : '' },
    { label: 'Suggested next step', value: m.nextAction },
    url ? { label: 'Open', value: 'The listing on Facebook', url } : null,
  ].filter((r) => r && r.value);
  const items = (m.notes || []).filter(Boolean);
  const notes = items.length ? { title: 'Noted by the auto-reply', items, fine: 'These notes were made automatically and have not been checked.' } : null;
  return { rows, notes };
}

/** The Marketplace list's line when its last read failed, or ''. */
export function marketplaceDown(status) {
  const last = status && status.marketplace && status.marketplace.lastSync;
  if (!last || last.ok !== false) return '';
  return 'Marketplace not reached since ' + clock(last.at) + '. The chats here are from the last good read.';
}
