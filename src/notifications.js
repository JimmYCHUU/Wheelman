// The dashboard's own notification feed, read for one reason: to hear about a new lead within a
// minute instead of at the next three-minute check. Only the newest eighty entries are read, the
// feed is never marked as read, and nothing in it goes to the AI or to the page.
//
// The feed covers every Carbarn site. The Sydney lead list that Wheelman and the dashboard both
// read is filtered to the Australian platform, so an enquiry from another site (a bare phone
// number from "Lead Service", say) is announced here but never appears on that list. Such a lead
// is counted as skipped once a check has run and it is still not there; nothing else is done.

import { fetchNotifications } from './dashboard.js';
import { getMeta, setMeta, openDb } from './db.js';

export const LEAD_TYPE = 'LEAD_INQUIRY_RECEIVED';
/** Changes to a car that the replies' facts come from: refresh the vehicle list early. */
export const VEHICLE_TYPES = /^VEHICLE_(MARKED_SOLD|PRICE_UPDATED|PUBLISH_STATUS_UPDATED|CREATED|REGO_COMPLETED|STAGE_UPDATED|ON_OFFER)$/;

const LAST_ID = 'notifications_last_id';

/** The feed's entries in one small shape: what each is about, and the lead or stock it names. */
export function parseNotifications(list) {
  return (Array.isArray(list) ? list : []).map((n) => {
    const id = Number(n?.id);
    if (!id) return null;
    const url = String(n.url || '');
    const body = String(n.body || '');
    const lead = url.match(/[?&]leadId=(\d+)/);
    const stock = body.match(/\bfor stock ([^\s.]+)\.?\s*$/i);
    const at = Date.parse(n.createdAt) || 0;
    return { id, type: String(n.type || ''), at, read: !!n.read, leadId: lead ? Number(lead[1]) : null, source: String(n.actorUsername || ''), stockNo: stock ? stock[1] : '' };
  }).filter(Boolean);
}

/** Is this lead on the lists Wheelman reads (the Sydney leads and the import enquiries)? */
export function leadKnown(leadId) {
  return !!openDb().prepare('SELECT 1 FROM leads WHERE id = ?').get(Number(leadId));
}

/**
 * Reads the feed once and says what is new since the last read: the lead notifications and how
 * many vehicle changes. The first read only records where the feed stands, so an old backlog never
 * sets off a check. Nothing is read from the feed twice.
 */
export async function pollNotifications({ limit = 80 } = {}) {
  const all = parseNotifications(await fetchNotifications(limit));
  const lastId = Number(getMeta(LAST_ID, 0)) || 0;
  const maxId = all.reduce((m, n) => Math.max(m, n.id), 0);
  if (!lastId) {
    if (maxId) setMeta(LAST_ID, maxId);
    return { first: true, leads: [], vehicles: 0, total: all.length };
  }
  const fresh = all.filter((n) => n.id > lastId);
  if (maxId > lastId) setMeta(LAST_ID, maxId);
  return {
    first: false,
    leads: fresh.filter((n) => n.type === LEAD_TYPE && n.leadId).sort((a, b) => a.id - b.id),
    vehicles: fresh.filter((n) => VEHICLE_TYPES.test(n.type)).length,
    total: all.length,
  };
}
