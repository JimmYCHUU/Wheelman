// What the team really sent, lately, to customers who wrote something like the message that is
// waiting. This is where Wheelman learns WHAT to say: what our people include, leave out and how
// long they write. HOW it is said still comes from the house voice.
//
// Every reply sent from the dashboard counts, whoever sent it. Marketplace chats never do.
// Customer details are removed, staff names are removed, and links and amounts are replaced by
// labels, so nothing from another customer's deal can be carried into a new reply.

import { openDb, draftTextsFor } from './db.js';
import { buildItem } from './items.js';
import { stripLocationBlock, stripSignature, maskGreetingNames, maskCustomerSignOff, loadExclusions, namesStaff } from './voice.js';
import { redact } from './redact.js';
import { classify } from './situations.js';
import { isAcknowledgement, wordCount, similarity } from './text.js';
import { comparable } from './learn.js';

const DAY = 24 * 3600 * 1000;
const BURST_MS = 15 * 60 * 1000;
export const BLOCK_LABEL = '[then our standard address block]';
export const OFFER_LABEL = '[then the auction car: its details, link, bid and cost breakdown]';

const LINK_LABELS = [
  [/https?:\/\/\S*carbarn\.com\.au\/vehicles\/\S+#inspection=online\S*/gi, '[online video inspection link]'],
  [/https?:\/\/\S*carbarn\.com\.au\/vehicles\/\S+#inspection\S*/gi, '[inspection booking link]'],
  [/https?:\/\/\S*carbarn\.com\.au\/vehicles\/\S+/gi, '[vehicle page link]'],
  [/https?:\/\/\S*carbarn\.com\.au\/live-auction\/\S+/gi, '[live auction link]'],
  [/https?:\/\/\S*carbarn\.com\.au\/customer-links\/\S+/gi, '[link]'],
  [/https?:\/\/(?:photos\.app\.goo\.gl|photos\.google\.com)\S*/gi, '[photo album link]'],
  [/https?:\/\/(?:maps\.app\.goo\.gl|(?:www\.)?google\.[a-z.]+\/maps)\S*/gi, '[Google Maps link]'],
  [/https?:\/\/\S+/gi, '[link]'],
];
/** A label left in a finished reply means the AI copied an example instead of using the real thing. */
export const LEFTOVER_LABEL = /\[(?:online video inspection link|inspection booking link|vehicle page link|photo album link|Google Maps link|live auction link|link|amount|then our standard address block|then the auction car: its details, link, bid and cost breakdown)\]/i;

/** Links and dollar amounts belong to the other customer's deal: only what kind of thing it was is kept. */
export function labelled(text) {
  let t = String(text || '');
  for (const [re, label] of LINK_LABELS) t = t.replace(re, label);
  return t.replace(/\$\s?\d[\d,]*(?:\.\d+)?(?:\s?k\b)?/gi, '[amount]').replace(/¥\s?\d[\d,]*/g, '[amount]');
}

const SIGN_LINE = [
  /^(kind |warm |best |many )?(regards|thanks|thank you|cheers),?\.?$/i,
  /^(kind |warm |best )?regards,?\s+\p{Lu}[\p{L}'’-]+\.?$/u,
  /^\p{Lu}[\p{L}'’-]+(\s+\p{Lu}[\p{L}'’-]+)?\s+(from|at|@)\s+carbarn\.?$/iu,
  /^(the\s+)?(team\s+)?carbarn(\s+team)?\.?$/i,
  /^(📞\s*)?(\+?61|0)[\d\s-]{8,12}$/,
];

/**
 * Removes whoever signed the text, whether or not they are in the people file: "Regards, Kim",
 * "Kim from Carbarn", and "Kim from Carbarn here." at the start.
 */
function withoutAnySignature(text) {
  const lines = stripSignature(text).split('\n');
  while (lines.length) {
    const last = lines[lines.length - 1].trim();
    if (last === '' || SIGN_LINE.some((re) => re.test(last))) lines.pop(); else break;
  }
  return lines.join('\n')
    .replace(/[\s,]*(kind |warm |best )?regards,?\s*\p{Lu}[\p{L}'’-]+(\s+(from|at)\s+carbarn)?\.?\s*$/u, '')
    .replace(/(^|[\n.!?,]\s*)(this is |it'?s |my name is )?\p{Lu}[\p{L}'’-]+( here)? (from|at) carbarn( here)?\s*[.!]\s*/giu, (m, lead) => (/,/.test(lead) ? lead.replace(/,\s*$/, ',\n') : lead))
    .replace(/\n{3,}/g, '\n\n').trim();
}

// Line and paragraph separators some phones insert instead of a line break.
const UNUSUAL_BREAKS = new RegExp('[' + String.fromCharCode(0x2028, 0x2029) + ']', 'g');

/** One reply of ours, as it may be shown to the AI: no block, no signature, no names. */
function cleanReply(texts, lead) {
  const parts = [];
  let hadBlock = false;
  let hadOffer = false;
  for (const raw of texts) {
    let own = String(raw).replace(/\r/g, '').replace(UNUSUAL_BREAKS, '\n');
    // An auction offer: everything from the car's details down belongs to that customer's deal.
    const offerAt = /\/live-auction\//i.test(own) ? own.search(/(^|\n)\s*Vehicle details:/i) : -1;
    if (offerAt !== -1) { own = own.slice(0, offerAt); hadOffer = true; }
    const block = /📍/.test(own);
    hadBlock = hadBlock || block;
    const body = withoutAnySignature(stripLocationBlock(own));
    if (body) parts.push(body);
  }
  const opening = parts.join('\n');
  const text = maskTrailingNames(maskGreetingNames(redact(labelled(opening), lead)));
  return { opening: text, hadBlock, text: [text, hadOffer ? OFFER_LABEL : '', hadBlock ? BLOCK_LABEL : ''].filter(Boolean).join('\n') };
}

const NOT_A_NAME = /^(Sydney|Lidcombe|Japan|Australia|Carbarn|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Yes|No|Thanks|Regards|Cheers|Sorry|Sure|Okay|Please|Today|Tomorrow|Perfect|Great|Noted|Done|Sir|Mate|Bro|Brother|Madam)$/;
// The chatty words a name is tacked onto: "Okay sure Dana", "See you soon Dana", "No worries Dana".
const BEFORE_A_NAME = /^(sure|okay|ok|thanks|you|cheers|yes|yep|no|sorry|hey|morning|afternoon|evening|great|perfect|done|noted|worries|problem|soon|then|now|there|too|well|good|night|day|weekend|care|again|much)$/i;

/**
 * A customer's name tacked onto the end of a short chatty line that is not a greeting.
 * Only a word that follows one of the usual chatty words is touched, so an address, a car or a
 * place is never mistaken for a name.
 */
function maskTrailingNames(text) {
  return String(text || '').split('\n').map((line) => {
    const words = line.trim().split(/\s+/);
    if (words.length < 2 || words.length > 5) return line;
    const last = words[words.length - 1].replace(/[.!,]+$/, '');
    const prev = words[words.length - 2].replace(/[.!,]+$/, '');
    if (!/^\p{Lu}\p{Ll}{2,15}$/u.test(last) || NOT_A_NAME.test(last) || !BEFORE_A_NAME.test(prev)) return line;
    return line.replace(new RegExp(`${last}([.!,]*)\\s*$`), '{{NAME}}$1');
  }).join('\n');
}

/** How many words a reply has once the greeting and the name are set aside. */
const substance = (text) => wordCount(String(text || '').replace(/\{\{NAME\}\}/g, ' ').replace(/\b(hi|hello|hey|dear|good (morning|afternoon|evening)|morning)\b/gi, ' ').replace(/[,.!]/g, ' '));

let cache = { key: '', rows: [] };

/** Rebuilt only when a message has arrived or a lead has changed. */
function stamp(days) {
  const d = openDb();
  const m = d.prepare('SELECT COUNT(*) AS n, MAX(id) AS top FROM messages').get();
  const l = d.prepare('SELECT COUNT(*) AS n, MAX(updated_at) AS top FROM leads').get();
  return `${days}|${m.n}|${m.top}|${l.n}|${l.top}`;
}

/**
 * Every exchange of the last `days` days: what a customer wrote and what we sent straight back.
 * @returns [{ id, itemKey, at, situations, primary, firstReply, buyer, customer, reply, words, hadBlock }]
 */
export function recentPractice({ days = 45, now = Date.now() } = {}) {
  const key = stamp(days);
  if (cache.key === key) return cache.rows;
  const since = now - days * DAY;
  const ex = loadExclusions();
  const rows = [];

  for (const c of openDb().prepare('SELECT id FROM conversations WHERE latest_at >= ? ORDER BY latest_at DESC').all(since)) {
    if (ex.conversations.has(Number(c.id))) continue;
    const item = buildItem({ conversationId: c.id });
    // A number with no customer behind it (a supplier, a courier) teaches nothing about customers.
    if (!item || item.state === 'other' || (!item.hasLeadRecord && !item.hasName && !item.deal)) continue;
    const t = item.timeline.filter((e) => !e.internal);
    // Suggestions Wheelman wrote here. A text sent exactly as suggested is Wheelman's own wording.
    const own = draftTextsFor(item.itemKey).flatMap((d) => [d.reply, d.copied_text]).filter(Boolean).map(comparable).filter((x) => wordCount(x) >= 4);

    for (let i = 1; i < t.length; i++) {
      if (t[i].who !== 'us' || t[i].auto || t[i - 1].who !== 'customer' || t[i].at < since) continue;
      const before = [];
      for (let k = i - 1; k >= 0 && t[k].who === 'customer'; k--) before.unshift(t[k]);
      const burst = [];
      for (let k = i; k < t.length && t[k].who === 'us' && t[k].at - t[i].at < BURST_MS; k++) burst.push(t[k]);

      const customerText = before.map((e) => e.text).filter(Boolean).join('\n').trim();
      const events = before.map((e) => e.event).filter(Boolean);
      if (!customerText && !events.length) continue;
      if (!events.length && before.every((e) => !e.text || isAcknowledgement(e.text))) continue;

      const sent = burst.map((e) => e.text).filter(Boolean);
      const raw = sent.join('\n');
      if (!raw.trim()) continue;
      if (ex.canned.some((re) => re.test(raw))) continue;                         // an automatic or template text
      if (/\bbsb\b/i.test(raw) || /\b\d{3}[\s-]?\d{3}\b[^\n]{0,30}\b\d{6,10}\b/.test(raw)) continue; // bank details
      if (own.length && own.some((x) => similarity(comparable(raw), x) >= 0.95)) continue;      // Wheelman's own words, unchanged

      const reply = cleanReply(sent, item.lead);
      if (substance(reply.opening) < 3) continue;                                 // "Hello," and the block: nothing to learn
      if (namesStaff(reply.opening)) continue;                                    // staff names stay on this computer
      if (reply.opening.length > 900) continue;

      const situation = classify(customerText, { events, leadStatus: item.lead?.status });
      rows.push({
        id: `p-${t[i].key}`,
        itemKey: item.itemKey,
        at: t[i].at,
        situations: situation.all,
        primary: situation.primary,
        firstReply: !t.slice(0, i).some((e) => e.who === 'us'),
        customer: maskCustomerSignOff(redact([events.map((e) => `(${e})`).join(' '), customerText].filter(Boolean).join(' '), item.lead)).slice(0, 400),
        reply: reply.text.slice(0, 700),
        words: wordCount(reply.opening),
        hadBlock: reply.hadBlock,
      });
    }
  }
  cache = { key, rows };
  return rows;
}

export function resetPractice() { cache = { key: '', rows: [] }; }

const STOP = new Set('a an the and or but if of to in on at for from with by is are was were be been it this that as we you your our us i my me do does did can could would will have has had not no yes so hi hello hey thanks thank please regards name'.split(' '));
const bag = (s) => new Set(String(s || '').toLowerCase().replace(/\[[^\]]*\]/g, ' ').replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));

/**
 * The exchanges most like the message that is waiting.
 * @param q { situations, primary, text, firstReply, excludeItemKey }
 */
export function practiceFor(q, max = 3, now = Date.now()) {
  const want = bag(q.text);
  const scored = recentPractice({ now })
    .filter((r) => r.itemKey !== q.excludeItemKey)
    .map((r) => {
      let s = 0;
      if (r.primary === q.primary) s += 3;
      for (const x of r.situations) if (q.situations.includes(x)) s += 1;
      const have = bag(r.customer);
      let overlap = 0;
      for (const w of want) if (have.has(w)) overlap++;
      s += want.size ? (overlap / Math.sqrt(want.size)) * 1.5 : 0;
      if (!!r.firstReply === !!q.firstReply) s += 0.7;
      const ageDays = (now - r.at) / DAY;
      s += ageDays < 7 ? 1 : ageDays < 21 ? 0.5 : 0; // what we did last week counts for more
      return { r, s };
    })
    .filter((x) => x.s >= 3.5)
    .sort((a, b) => b.s - a.s || b.r.at - a.r.at);

  const out = [];
  for (const { r } of scored) {
    if (out.some((o) => similarity(o.reply, r.reply) >= 0.8)) continue; // the same answer twice teaches nothing new
    out.push(r);
    if (out.length >= max) break;
  }
  return out;
}
