// Learning from replies that were really used.
//
// Sources, by the owner's instruction: the dashboard's leads and conversations only.
// Marketplace conversations are never learned from.
//
// Two signals:
//   copied — the text in the message box when Copy was pressed (what the person chose to send)
//   sent   — the reply that later appears in the dashboard conversation (the confirmed result)
// "sent" replaces "copied" for the same suggestion once it is seen.

import { config } from './config.js';
import { getDraft, upsertLearned, deleteLearned, deleteLearnedForAnchor, learnedTextExists, allLearned, recordCopied, recordCopiedTime } from './db.js';
import { redact } from './redact.js';
import { maskCustomerSignOff, maskGreetingNames, stripLocationBlock, loadExclusions } from './voice.js';
import { stripModelSignOff } from './checks.js';
import { similarity, wordCount, squash } from './text.js';

const BLANK = /\[(PRICE|TRADE-IN VALUE|DELIVERY COST|DATE|CHECK)\?\]/;

/** Only dashboard conversations and leads teach Wheelman. */
export const canLearnFrom = (itemKey) => /^[cl]:\d+$/.test(String(itemKey || ''));

export function withoutSignOff(text) {
  let t = String(text || '').replace(/\r/g, '').trim();
  if (config.signOff && t.endsWith(config.signOff)) t = t.slice(0, -config.signOff.length).trim();
  return stripModelSignOff(t);
}

/**
 * The part of a reply that a person actually wrote for this customer: without the sign-off and
 * without the standard address block. Suggestions and sent replies are compared in this form.
 */
export const comparable = (text) => withoutSignOff(stripLocationBlock(withoutSignOff(text)));

/** Reasons a reply should not become an example. Takes the comparable form. Returns '' when it is fine. */
function unsuitable(body, rawText) {
  if (!body) return 'empty';
  if (BLANK.test(body)) return 'still has a blank';
  if (wordCount(body) < 2) return 'too short';
  if (body.length > 900) return 'too long';
  if (/\b\d{3}[\s-]?\d{3}\b[^\n]{0,30}\b\d{6,10}\b/.test(body) || /\bbsb\b/i.test(body)) return 'contains bank details';
  // A standard reply the team sends to everyone teaches nothing about answering this customer.
  if (loadExclusions().canned.some((re) => re.test(rawText) || re.test(body))) return 'standard wording';
  return '';
}

/**
 * Remember what was used for one suggestion.
 * @param item      the conversation the suggestion was written for (from buildItem)
 * @param draft     the stored suggestion row
 * @param finalText what was copied or sent
 * @param source    'copied' | 'sent'
 */
export function learnFrom(item, draft, finalText, source, { at = Date.now() } = {}) {
  if (!item || !draft || !canLearnFrom(item.itemKey)) return { learned: false, why: 'not a dashboard conversation' };
  if (draft.item_key !== undefined && !canLearnFrom(draft.item_key)) return { learned: false, why: 'not a dashboard conversation' };
  if (draft.rating === 'bad' && source === 'copied') return { learned: false, why: 'rated not usable' };

  const lead = item.lead;
  const draftBody = comparable(draft.reply);
  const finalBody = comparable(finalText);
  const why = unsuitable(finalBody, String(finalText || ''));
  if (why) return { learned: false, why };
  const sim = similarity(draftBody, finalBody);
  const changed = squash(draftBody).toLowerCase() !== squash(finalBody).toLowerCase();
  // A suggestion used word for word is Wheelman's own text. Keeping it as an example of how
  // the team writes would be learning from itself.
  if (!changed) { deleteLearned(draft.id); return { learned: false, why: 'used unchanged', changed: false, similarity: sim }; }

  // The customer's words this reply answered: everything they said up to the suggestion's anchor.
  const idx = item.timeline.findIndex((e) => e.key === draft.anchor_key);
  const upto = idx === -1 ? item.timeline : item.timeline.slice(0, idx + 1);
  const pending = [];
  for (let i = upto.length - 1; i >= 0 && upto[i].who === 'customer'; i--) pending.unshift(upto[i]);
  const customerText = pending.map((e) => [e.event ? `(${e.event})` : '', e.text].filter(Boolean).join(' ')).filter(Boolean).join('\n');
  if (!customerText) return { learned: false, why: 'no customer message' };

  const final = maskGreetingNames(redact(finalBody, lead));
  if (learnedTextExists(final, draft.id)) return { learned: false, why: 'already learned', changed, similarity: sim };

  // What the message was about is taken from when the suggestion was written. Once a conversation
  // is answered it reads as "general", which would file every lesson in the wrong place.
  const ctx = draft.context || null;
  const situations = ctx?.situations?.length ? ctx.situations : draft.situation ? [draft.situation] : item.situation?.all || [];

  // One lesson per customer message, however many suggestions were written for it.
  deleteLearnedForAnchor(draft.item_key || item.itemKey, draft.anchor_key, draft.id);
  upsertLearned({
    draftId: draft.id,
    itemKey: item.itemKey,
    situations,
    firstReply: ctx ? !!ctx.firstReply : !upto.some((e) => e.who === 'us' && !e.internal),
    customerText: maskCustomerSignOff(redact(customerText, lead)).slice(0, 900),
    draftText: maskGreetingNames(redact(draftBody, lead)),
    finalText: final,
    source,
    changed,
    similarity: sim,
    at,
  });
  return { learned: true, changed, similarity: sim };
}

/** Called when Copy is pressed on the page. */
export function onCopied(item, draftId, text) {
  const draft = getDraft(draftId);
  if (!draft) return { learned: false, why: 'suggestion not found' };
  // A Marketplace suggestion: note that Copy was pressed, keep none of the text, learn nothing.
  if (!canLearnFrom(draft.item_key) || !canLearnFrom(item?.itemKey)) { recordCopiedTime(draftId); return { learned: false, why: 'not a dashboard conversation' }; }
  recordCopied(draftId, String(text || '').slice(0, 4000));
  return learnFrom(item, draft, text, 'copied');
}

/** Called when a rating changes: a suggestion marked not usable is forgotten unless a sent reply confirmed it. */
export function onRated(draftId, rating) {
  if (rating !== 'bad') return;
  const row = allLearned(2000).find((l) => l.draft_id === draftId);
  if (row && row.source === 'copied') deleteLearned(draftId);
}

// ---- using what was learned -------------------------------------------------

const STOP = new Set('a an the and or but if of to in on at for from with by is are was were be been it this that as we you your our us i my me do does did can could would will have has had not no yes so hi hello hey thanks thank please regards name'.split(' '));
const bag = (s) => new Set(String(s || '').toLowerCase().replace(/https?:\/\/\S+/g, ' ').replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));

function score(row, q, now) {
  let s = 0;
  if (row.situations[0] && row.situations[0] === q.primary) s += 3;
  for (const x of row.situations) if (q.situations.includes(x)) s += 1;
  const want = bag(q.text), have = bag(row.customer_text);
  let overlap = 0;
  for (const w of want) if (have.has(w)) overlap++;
  s += want.size ? (overlap / Math.sqrt(want.size)) * 1.5 : 0;
  if (!!row.first_reply === !!q.firstReply) s += 0.7;
  const ageDays = (now - (row.at || 0)) / 86400000;
  s += ageDays < 14 ? 1 : ageDays < 60 ? 0.5 : 0; // recent practice counts for more
  if (row.source === 'sent') s += 0.3;
  return s;
}

/** Recent replies that were really used, as extra examples. Shaped like the base example bank. */
export function learnedExamples(q, max = 2, now = Date.now()) {
  const rows = allLearned().filter((r) => canLearnFrom(r.item_key) && r.item_key !== q.excludeItemKey);
  return rows.map((r) => ({ r, s: score(r, q, now) }))
    .filter((x) => x.s >= 3)
    .sort((a, b) => b.s - a.s)
    .slice(0, max)
    .map(({ r }) => ({ id: `learned-${r.draft_id}`, author: 'team', customer: r.customer_text, events: [], reply: r.final_text, replyWords: wordCount(r.final_text), learned: true }));
}

/** Cases where the person changed the suggestion before using it: the clearest lessons. */
export function corrections(q, max = 2, now = Date.now()) {
  const rows = allLearned().filter((r) => canLearnFrom(r.item_key) && r.changed && r.item_key !== q.excludeItemKey && r.draft_text && (r.similarity ?? 1) < 0.92 && (r.similarity ?? 0) > 0.15);
  return rows.map((r) => ({ r, s: score(r, q, now) }))
    .filter((x) => x.s >= 2.5)
    .sort((a, b) => b.s - a.s)
    .slice(0, max)
    .map(({ r }) => ({ customer: r.customer_text, drafted: r.draft_text, used: r.final_text }));
}
