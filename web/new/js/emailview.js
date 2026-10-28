// What the page says about an email thread (Imports): the research notes behind the suggestion and
// the email's own facts. The words are the old page's (web/app.js mailInfo). Pure functions (no DOM,
// no globals).
import { clock, listTime } from '../../lib/format.js';

/**
 * draft.research as the notes under the box show it, or null without research. Found models and
 * the ones that could not be found are counted together; a reply has a blank for each not found.
 */
export function researchView(r) {
  if (!r || typeof r !== 'object') return null;
  const found = Array.isArray(r.found) ? r.found : [];
  const notFound = Array.isArray(r.notFound) ? r.notFound : [];
  const notes = Array.isArray(r.notes) ? r.notes : [];
  const sources = (Array.isArray(r.sources) ? r.sources : []).filter((s) => s && s.url).map((s) => ({ url: s.url, label: s.label || s.url }));
  const when = 'Looked up ' + (r.readAt ? clock(r.readAt) : '') + (r.listReadAt ? ', from the eligible-models list read ' + listTime(r.listReadAt) : '') + '.';
  return { count: found.length + notFound.length, found, notFound, notes, sources, when };
}

/** The email facts for the panel: { rows: [{ label, value }], folded } (folded: the sentence to say, or ''). */
export function emailRows(mail) {
  if (!mail) return { rows: [], folded: '' };
  const rows = [
    ['Subject', mail.subject],
    ['From', mail.customerEmail],
    ['Model asked about', mail.car],
    ['Messages', mail.messages ? mail.messages + (mail.collapsed ? ', ' + mail.collapsed + ' folded in Gmail' : '') : ''],
    ['First message', mail.firstAt ? listTime(mail.firstAt) : ''],
    ['Latest', mail.lastAt ? listTime(mail.lastAt) : ''],
  ].filter(([, v]) => v).map(([label, value]) => ({ label, value }));
  const folded = mail.collapsed ? 'Part of this thread could not be read because Gmail had folded it. In Gmail, press Expand all, then Send to Wheelman again.' : '';
  return { rows, folded };
}
