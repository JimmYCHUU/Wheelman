// Email threads the owner hands in from Gmail with the add-on's "Send to Wheelman" button
// (extension/mail.js): import enquiries, for the Import Query section. This file checks a report,
// keeps the thread and its messages, and merges a thread that is sent again after a reply.
//
// Safety: nothing here can reach Gmail. The add-on talks to Wheelman, never the other way round.
// Only text is kept: no HTML, no attachments, no recipients. Nothing from an email is learned from
// (see canLearnFrom in learn.js), and the example bank never sees it (voicebank.js).

import { config } from './config.js';
import { emailKey } from './normalize.js';
import { squash } from './text.js';
import { transaction, upsertMailThread, findMailMessage, addMailMessage, updateMailMessage, refreshMailThreadSummary } from './db.js';

const MIN = 60e3;
const DAY = 24 * 3600e3;
/** The most a report may hold. The add-on applies the same limits before sending. */
export const MAIL_LIMITS = { messages: 200, text: 20000, subject: 300, name: 120, email: 254, atText: 80, ref: 120 };

const line = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
// A body keeps its line breaks; runs of spaces and of blank lines are shortened.
const body = (v, max) => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, max) : '');
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/** Whether an address is one of ours: the domain itself, or a sub-domain of it. */
export function isOurs(email, domains = config.mail.ourDomains) {
  const e = String(email || '').toLowerCase();
  const at = e.lastIndexOf('@');
  if (at === -1) return false;
  const domain = e.slice(at + 1);
  return domains.some((d) => domain === d || domain.endsWith(`.${d}`));
}

/**
 * Checks a report from the Gmail button and returns it in a clean shape. Throws a plain sentence
 * when it is not one. Messages come oldest first. A message with no time of its own is placed
 * beside its neighbours (a second before the next one whose time is known), so the order survives.
 */
export function validateMailReport(raw, { now = Date.now() } = {}) {
  if (!raw || typeof raw !== 'object' || raw.v !== 1 || raw.kind !== 'mail') throw new Error('That is not a report from the Gmail add-on.');
  if (!Array.isArray(raw.messages) || !raw.messages.length) throw new Error('The report has no messages in it.');
  const earliest = now - 15 * 365 * DAY;
  const latest = now + 5 * MIN;
  const seenAt = Number.isFinite(raw.seenAt) ? clamp(raw.seenAt, earliest, latest) : now;
  const messages = [];
  let collapsed = 0;
  for (const m of raw.messages.slice(-MAIL_LIMITS.messages)) {
    if (!m || typeof m !== 'object') continue;
    const ref = line(m.ref, MAIL_LIMITS.ref);
    const fromEmail = emailKey(m.fromEmail);
    const text = body(m.text, MAIL_LIMITS.text);
    const attachments = clamp(Number(m.attachments) || 0, 0, 99);
    const at = Number.isFinite(m.at) ? clamp(m.at, earliest, latest) : null;
    // Nothing to tell it apart by: neither Gmail's id nor a sender and a time.
    if (!ref && !(fromEmail && at !== null)) continue;
    const isCollapsed = !!m.collapsed || (!text && !attachments);
    if (isCollapsed) collapsed++;
    messages.push({
      ref,
      direction: isOurs(fromEmail) ? 'OUT' : 'IN',
      fromName: line(m.fromName, MAIL_LIMITS.name),
      fromEmail,
      text,
      collapsed: isCollapsed,
      attachments,
      at,
      atText: line(m.atText, MAIL_LIMITS.atText),
      approx: at === null,
    });
  }
  if (!messages.length) throw new Error('Nothing in the thread could be read. In Gmail, press Expand all and send it again.');
  // A time that could not be read: just before the next known one, else just after the last known one, else about now.
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].at !== null) continue;
    const next = messages.slice(i + 1).find((x) => x.at !== null);
    const prev = [...messages.slice(0, i)].reverse().find((x) => x.at !== null);
    const run = next ? next.at - 1000 * (messages.indexOf(next) - i) : prev ? prev.at + 1000 * (i - messages.indexOf(prev)) : seenAt - 1000 * (messages.length - i);
    messages[i].at = clamp(run, earliest, latest);
  }
  return {
    seenAt,
    thread: { ref: line(raw.thread && raw.thread.ref, MAIL_LIMITS.ref) },
    subject: line(raw.subject, MAIL_LIMITS.subject),
    messages,
    found: { containers: Number(raw.found && raw.found.containers) || messages.length, parsed: messages.length, collapsed },
  };
}

/**
 * Keeps a thread. Sent again later (after a reply, or with a folded message now expanded), the
 * messages already stored are matched by Gmail's id, or by sender and time, and only what is new
 * is added; a text that was folded, or is now shown in full, is updated. Nothing is ever shrunk
 * or overwritten with an empty text.
 */
export function storeMailThread(report, { now = Date.now() } = {}) {
  return transaction(() => {
    const firstIn = report.messages.find((m) => m.direction === 'IN' && m.fromEmail);
    const key = report.thread.ref ? `ref:${report.thread.ref}` : `subj:${squash(report.subject).toLowerCase()}|${firstIn ? firstIn.fromEmail : ''}`;
    const thread = upsertMailThread({ key, ref: report.thread.ref, subject: report.subject }, now);
    let added = 0;
    let updated = 0;
    for (const m of report.messages) {
      const found = findMailMessage(thread.id, m);
      if (!found) { addMailMessage(thread.id, { ...m, seenAt: report.seenAt }, now); added++; continue; }
      const fuller = !!m.text && (!!found.collapsed || m.text.length > String(found.text || '').length);
      if (!fuller) continue;
      updateMailMessage(found.id, { text: m.text, collapsed: false, attachments: Math.max(found.attachments || 0, m.attachments) }, now);
      updated++;
    }
    const summary = refreshMailThreadSummary(thread.id, now, { changed: thread.isNew || added + updated > 0 });
    return { threadId: thread.id, key: `em:${thread.id}`, isNew: thread.isNew, added, updated, messages: summary.message_count, collapsed: summary.collapsed_count, subject: summary.subject };
  });
}
