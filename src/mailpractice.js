// What the team really wrote back to import enquiries by email, lately and in the past: where
// Wheelman learns WHAT to say in an import email. Read from the email threads the owner sent
// from Gmail, and nowhere else: the dashboard's texts never come in here, and these never reach
// an SMS or Marketplace suggestion. Customer details and staff names are removed, and links and
// amounts become labels, so nothing from one customer's deal is carried into another's reply.

import { mailExchanges, draftTextsFor, mailPracticeStamp } from './db.js';
import { cleanOurText } from './practice.js';
import { maskCustomerSignOff, loadExclusions, namesStaff } from './voice.js';
import { redact } from './redact.js';
import { classify } from './situations.js';
import { isAcknowledgement, wordCount, similarity } from './text.js';
import { comparable } from './learn.js';
import { loadEligibleModels, modelCodesIn, modelsIn } from './eligible.js';
import { cleanBody } from '../extension/mailparse.js';

const DAY = 24 * 3600 * 1000;
const REPLY_WITHIN_MS = 7 * DAY;

let cache = { key: '', rows: [] };

const substance = (text) => wordCount(String(text || '').replace(/\{\{NAME\}\}/g, ' ').replace(/\b(hi|hello|dear|good (morning|afternoon|evening))\b/gi, ' ').replace(/[,.!]/g, ' '));
const nameParts = (name) => { const [first, ...rest] = String(name || '').trim().split(/\s+/); return { first_name: first || '', last_name: rest.join(' ') }; };

/**
 * Every exchange in the stored email threads: what a customer wrote and what we wrote back within
 * a week, oldest message first in each thread.
 * @returns [{ id, itemKey, at, situations, primary, firstReply, subject, customer, reply, codes, families, words }]
 */
export function recentMailPractice({ days = 3 * 365, now = Date.now() } = {}) {
  const key = `${days}|${mailPracticeStamp()}`;
  if (cache.key === key) return cache.rows;
  const since = now - days * DAY;
  const ex = loadExclusions();
  const { models } = loadEligibleModels(now);
  const rows = [];
  for (const thread of mailExchanges({ since })) {
    const lead = { ...nameParts(thread.customerName), email: thread.customerEmail || '' };
    // Suggestions Wheelman wrote for this thread: a reply sent as suggested is its own wording.
    const own = draftTextsFor(`em:${thread.id}`).flatMap((d) => [d.reply, d.copied_text]).filter(Boolean).map(comparable).filter((x) => wordCount(x) >= 4);
    const t = thread.messages;
    for (let i = 1; i < t.length; i++) {
      if (t[i].direction !== 'OUT' || t[i - 1].direction !== 'IN' || t[i].at < since) continue;
      if (t[i].at - t[i - 1].at > REPLY_WITHIN_MS) continue;
      const before = [];
      for (let k = i - 1; k >= 0 && t[k].direction === 'IN'; k--) before.unshift(t[k]);
      const customerText = before.map((e) => e.text).filter(Boolean).join('\n').trim();
      if (!customerText || before.every((e) => !e.text || isAcknowledgement(e.text))) continue;

      const raw = cleanBody(t[i].text).text; // the quoted history is cut at intake; cut again in case
      if (!raw.trim()) continue;
      if (ex.canned.some((re) => re.test(raw))) continue;                                       // a template
      if (/\bbsb\b/i.test(raw) || /\b\d{3}[\s-]?\d{3}\b[^\n]{0,30}\b\d{6,10}\b/.test(raw)) continue; // bank details
      if (own.length && own.some((x) => similarity(comparable(raw), x) >= 0.95)) continue;      // Wheelman's own words
      const reply = cleanOurText([raw], lead);
      if (substance(reply.opening) < 5) continue;
      if (namesStaff(reply.opening)) continue;                                                  // staff names stay here
      const text = reply.opening.slice(0, 900);

      const asked = `${thread.subject || ''}\n${customerText}`;
      // Every thread here is an import enquiry: that comes first, whatever else the email touches.
      const classified = classify(customerText, {});
      const situation = { primary: 'import_sourcing', all: ['import_sourcing', ...classified.all.filter((s) => s !== 'import_sourcing' && s !== 'general')] };
      const codes = models.length ? modelCodesIn(asked, models) : { known: [], unknown: [] };
      const families = models.length ? modelsIn(asked, models, { codes: codes.known.map((k) => k.code) }) : [];
      rows.push({
        id: `em-${t[i].id}`,
        itemKey: `em:${thread.id}`,
        at: t[i].at,
        situations: situation.all,
        primary: situation.primary,
        firstReply: !t.slice(0, i).some((e) => e.direction === 'OUT'),
        subject: redact(String(thread.subject || ''), lead).slice(0, 120),
        customer: maskCustomerSignOff(redact(customerText, lead)).slice(0, 500),
        reply: text,
        codes: [...codes.known.map((k) => k.code), ...codes.unknown],
        families: families.map((f) => `${f.make} ${f.model}`.toLowerCase()),
        words: wordCount(text),
      });
    }
  }
  cache = { key, rows };
  return rows;
}

export function resetMailPractice() { cache = { key: '', rows: [] }; }

const STOP = new Set('a an the and or but if of to in on at for from with by is are was were be been it this that as we you your our us i my me do does did can could would will have has had not no yes so hi hello hey thanks thank please regards name import importing'.split(' '));
const bag = (s) => new Set(String(s || '').toLowerCase().replace(/\[[^\]]*\]/g, ' ').replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));

/**
 * The past email exchanges most like the enquiry that is waiting.
 * @param q { situations, primary, text, firstReply, codes, families, excludeItemKey }
 */
export function mailPracticeFor(q, max = 3, now = Date.now()) {
  const want = bag(q.text);
  const codes = new Set((q.codes || []).map((c) => String(c).toUpperCase()));
  const families = new Set((q.families || []).map((f) => String(f).toLowerCase()));
  const scored = recentMailPractice({ now })
    .filter((r) => r.itemKey !== q.excludeItemKey)
    .map((r) => {
      let s = 0;
      if (r.primary === q.primary) s += 3;
      for (const x of r.situations) if ((q.situations || []).includes(x)) s += 1;
      s += Math.min(3, r.codes.filter((c) => codes.has(c)).length * 3);
      if (r.families.some((f) => families.has(f))) s += 2;
      const have = bag(`${r.subject} ${r.customer}`);
      let overlap = 0;
      for (const w of want) if (have.has(w)) overlap++;
      s += want.size ? (overlap / Math.sqrt(want.size)) * 1.5 : 0;
      if (!!r.firstReply === !!q.firstReply) s += 0.7;
      const ageDays = (now - r.at) / DAY;
      s += ageDays < 30 ? 1 : ageDays < 120 ? 0.5 : 0;
      return { r, s };
    })
    .filter((x) => x.s >= 3)
    .sort((a, b) => b.s - a.s || b.r.at - a.r.at);
  const out = [];
  for (const { r } of scored) {
    if (out.some((o) => similarity(o.reply, r.reply) >= 0.8)) continue;
    out.push(r);
    if (out.length >= max) break;
  }
  return out;
}
