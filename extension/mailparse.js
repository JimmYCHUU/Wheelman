// Pure helpers for the Gmail button: addresses, dates, bodies and the report. No DOM here, so the
// same code runs in Node for the tests. Reading the page itself is in mail.js.

import { parseFullDate } from './parse.js';

/** The most the add-on sends. Wheelman applies the same limits again on its side (src/mail.js). */
export const LIMITS = { messages: 200, text: 20000, subject: 300, name: 120, email: 254, to: 10, atText: 80, ref: 120 };

const ADDRESS = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const squash = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/**
 * "Priya Raman <priya@example.com>", "priya@example.com", or a name with the address given apart
 * (Gmail keeps the address in an attribute). The address is lower-cased; an unreadable one is ''.
 */
export function parseAddress(text, email = '') {
  const t = squash(text);
  let name = t;
  let addr = squash(email);
  const m = t.match(/^(.*?)\s*<([^<>\s]+)>\s*$/);
  if (m) { name = m[1]; addr = addr || m[2]; }
  else if (!addr && ADDRESS.test(t)) { addr = t; name = ''; }
  addr = addr.toLowerCase();
  if (!ADDRESS.test(addr)) addr = '';
  name = name.replace(/^"+|"+$/g, '').trim();
  if (name.toLowerCase() === addr) name = '';
  return { name: name.slice(0, LIMITS.name), email: addr.slice(0, LIMITS.email) };
}

// Where the quoted history under a reply begins. The first of these found wins.
const QUOTE_START = [
  /^On [^\n]{6,200}?(?:\n[^\n]{0,160})? wrote:\s*$/m,          // "On Tue, 6 Oct 2026 at 10:31, Priya Raman <…> wrote:"
  /^-{2,}\s*(?:Original|Forwarded) [Mm]essage\s*-{2,}\s*$/m,   // Outlook and Gmail forwards
  /^From: .+\n(?:Sent|Date): .+$/m,                            // an Outlook header block
  /^_{10,}\s*$/m,                                              // Outlook's rule above a quoted reply
];

/** The body without the quoted history under it. Signatures stay: they say who wrote. */
export function cleanBody(text) {
  let t = String(text ?? '').replace(/\r\n?/g, '\n').replace(/ /g, ' ');
  t = t.split('\n').map((l) => l.replace(/[ \t]+$/, '')).join('\n');
  let cut = -1;
  for (const re of QUOTE_START) {
    const m = t.match(re);
    if (m && (cut === -1 || m.index < cut)) cut = m.index;
  }
  // A run of lines beginning with ">" that goes on to the end.
  const quoted = t.match(/(?:^|\n)(?:>.*(?:\n|$))+\s*$/);
  if (quoted && (cut === -1 || quoted.index < cut)) cut = quoted.index;
  const quotedStripped = cut !== -1;
  if (quotedStripped) t = t.slice(0, cut);
  return { text: t.replace(/\n{3,}/g, '\n\n').trim(), quotedStripped };
}

/** Gmail's full date ("Tue, 6 Oct 2026, 10:31 am") as a moment, or null when it cannot be read. */
export function parseMailDate(title, { now = Date.now() } = {}) {
  const t = squash(title);
  return t ? parseFullDate(t, now) : null;
}

/**
 * The report Wheelman receives, from what mail.js read off the page:
 *   raw = { threadRef, subject, containers, messages: [{ ref, fromText, fromEmail, fromName, to: [{ text, email }],
 *           dateTitle, dateText, bodyText, collapsed, attachments }] }
 * Messages come oldest first. Beyond the limit, the newest are kept.
 */
export function buildMailReport(raw, { now = Date.now() } = {}) {
  const messages = [];
  let collapsed = 0;
  for (const m of (raw.messages || []).slice(-LIMITS.messages)) {
    const from = parseAddress(m.fromText, m.fromEmail);
    if (!from.name && m.fromName) from.name = squash(m.fromName).slice(0, LIMITS.name);
    const body = cleanBody(m.bodyText);
    const attachments = Number(m.attachments) || 0;
    const isCollapsed = !!m.collapsed || (!body.text && !attachments);
    if (isCollapsed) collapsed++;
    const to = [];
    for (const r of (m.to || []).slice(0, LIMITS.to)) { const a = parseAddress(r.text, r.email); if (a.email) to.push(a.email); }
    messages.push({
      ref: squash(m.ref).slice(0, LIMITS.ref),
      fromName: from.name, fromEmail: from.email, to,
      at: parseMailDate(m.dateTitle, { now }) ?? parseMailDate(m.dateText, { now }),
      atText: squash(m.dateTitle || m.dateText).slice(0, LIMITS.atText),
      text: body.text.slice(0, LIMITS.text),
      collapsed: isCollapsed, quotedStripped: body.quotedStripped, attachments,
    });
  }
  return {
    v: 1, kind: 'mail', seenAt: now,
    thread: { ref: squash(raw.threadRef).slice(0, LIMITS.ref) },
    subject: squash(raw.subject).slice(0, LIMITS.subject),
    messages,
    found: { containers: Number(raw.containers) || messages.length, parsed: messages.length, collapsed },
  };
}
