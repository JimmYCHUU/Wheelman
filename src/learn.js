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
import { getDraft, upsertLearned, deleteLearned, deleteLearnedForAnchor, learnedTextExists, allLearned, recordCopied, recordCopiedTime, getLearned, insertAdvice, allAdvice, setAdviceLessons } from './db.js';
import { redact } from './redact.js';
import { maskCustomerSignOff, maskGreetingNames, stripLocationBlock, loadExclusions } from './voice.js';
import { stripModelSignOff } from './checks.js';
import { similarity, wordCount, squash } from './text.js';
import { complete } from './llm.js';
import { SITUATIONS } from './situations.js';

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

/** The customer's words a suggestion answered: everything they said up to the suggestion's anchor. */
function askedBefore(item, draft) {
  const idx = item.timeline.findIndex((e) => e.key === draft.anchor_key);
  const upto = idx === -1 ? item.timeline : item.timeline.slice(0, idx + 1);
  const pending = [];
  for (let i = upto.length - 1; i >= 0 && upto[i].who === 'customer'; i--) pending.unshift(upto[i]);
  const customerText = pending.map((e) => [e.event ? `(${e.event})` : '', e.text].filter(Boolean).join(' ')).filter(Boolean).join('\n');
  return { customerText, upto };
}

/** What a suggestion was about, taken from when it was written. */
function aboutOf(item, draft, upto) {
  const ctx = draft.context || null;
  return {
    situations: ctx?.situations?.length ? ctx.situations : draft.situation ? [draft.situation] : item.situation?.all || [],
    firstReply: ctx ? !!ctx.firstReply : !upto.some((e) => e.who === 'us' && !e.internal),
  };
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
  if (!changed) {
    // Unless the owner approved it: then it stays, as a reply they said was right.
    if (getLearned(draft.id)?.source !== 'approved') deleteLearned(draft.id);
    return { learned: false, why: 'used unchanged', changed: false, similarity: sim };
  }

  const { customerText, upto } = askedBefore(item, draft);
  if (!customerText) return { learned: false, why: 'no customer message' };

  const final = maskGreetingNames(redact(finalBody, lead));
  if (learnedTextExists(final, draft.id)) return { learned: false, why: 'already learned', changed, similarity: sim };

  // What the message was about is taken from when the suggestion was written. Once a conversation
  // is answered it reads as "general", which would file every lesson in the wrong place.
  const { situations, firstReply } = aboutOf(item, draft, upto);

  // One lesson per customer message, however many suggestions were written for it.
  deleteLearnedForAnchor(draft.item_key || item.itemKey, draft.anchor_key, draft.id);
  upsertLearned({
    draftId: draft.id,
    itemKey: item.itemKey,
    situations,
    firstReply,
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

// ---- what the owner says about a suggestion ----------------------------------------------------

/**
 * "Good reply": the owner approves a suggestion as written. It becomes a model for similar
 * messages. Approving is the one case where Wheelman's own wording is kept, because a person
 * has said it is right. Taking the approval back forgets it.
 */
export function onApproved(item, draftId, approved = true) {
  const draft = getDraft(draftId);
  if (!draft) return { learned: false, why: 'suggestion not found' };
  if (!canLearnFrom(draft.item_key) || !canLearnFrom(item?.itemKey)) return { learned: false, why: 'not a dashboard conversation' };
  if (!approved) {
    if (getLearned(draftId)?.source === 'approved') deleteLearned(draftId);
    return { learned: false, why: 'approval taken back' };
  }
  const body = comparable(draft.reply);
  if (!body || wordCount(body) < 2) return { learned: false, why: 'too short' };
  if (/\bbsb\b/i.test(body)) return { learned: false, why: 'contains bank details' };
  const { customerText, upto } = askedBefore(item, draft);
  if (!customerText) return { learned: false, why: 'no customer message' };
  const { situations, firstReply } = aboutOf(item, draft, upto);
  const text = maskGreetingNames(redact(body, item.lead));
  deleteLearnedForAnchor(draft.item_key, draft.anchor_key, draft.id);
  upsertLearned({
    draftId: draft.id, itemKey: item.itemKey, situations, firstReply,
    customerText: maskCustomerSignOff(redact(customerText, item.lead)).slice(0, 900),
    draftText: text, finalText: text, source: 'approved', changed: false, similarity: 1, at: Date.now(),
  });
  return { learned: true };
}

const LESSON_SYSTEM = [
  'You help train a reply assistant for Carbarn, a used-car dealer in Sydney. The assistant drafts SMS replies to customers.',
  'The owner read one of its drafts and wrote a coaching note. The note is written to the assistant. It teaches how to handle this kind of message. It is not text for a customer.',
  'Turn the note into one to three general lessons the assistant can apply to future messages of the same kind.',
  '',
  'Rules for a lesson:',
  '- "when": the kind of customer message or situation it applies to, in a few plain words.',
  '- "do": what to do or avoid, written as an instruction to the assistant, in one or two plain sentences. Put it in your own words. Do not copy the owner\'s sentences.',
  '- Generalise. No customer name. No particular car, price or date, unless the lesson is about exactly that.',
  '- If the note states a fact about how the business works, keep the fact in the lesson.',
  '- If the note quotes wording and says not to use it, the lesson is to avoid saying that, and what to do instead if the note says. Do not turn the quoted wording into a lesson to say it.',
  '- If the note says something is internal, or not to be told to the customer, set "internal" to true and say in "do" what to keep to ourselves and what to tell the customer instead.',
  '- If the note points to a web address pattern, describe it in words and keep the address as an example.',
  '- "scope": the one situation key from the list given that fits best, or "any" when the lesson applies to every reply (tone, length, wording).',
  '- Add nothing the note does not say. Never invent a promise, a time or an action. When the owner says what he or his staff will do, the lesson is about what the reply should say given that; the assistant itself cannot do things.',
  '- A note that only points somewhere ("check our other finance replies", "look at how we answered others") means: for this kind of message, answer the way the team answered similar ones, which the assistant is shown under WHAT OUR TEAM REALLY SENT, and do not send a holding line.',
  '- Nearly every note teaches something. Return an empty list only when the note is empty or cannot be understood.',
  '',
  'Worked cases:',
  'Note: "Every car on our website is already prepared." -> {"scope":"inspection_booking","when":"a customer asks to inspect a car that is listed on our website","do":"Treat it as ready to inspect. Every car listed on the website has been prepared. Do not say it is still being prepared.","internal":false}',
  'Note: "Don\'t say \'our details are below\'. Say it directly." -> {"scope":"location_hours","when":"a customer asks where we are or when we are open","do":"Give the answer in the sentence itself. Never tell the customer to look below.","internal":false}',
  'Note: "We can\'t get that document ourselves, Sam sorts it out (don\'t tell the customer)." -> {"scope":"after_sale","when":"a buyer asks for that document","do":"We do not hold it ourselves; a staff member arranges it. Do not say who or why. Tell the customer only that we will arrange it, and leave [CHECK?] for the person.","internal":true}',
  'Note: "Too much discount. Get her to come and see it, then we talk price. She has seen the price, don\'t repeat it." -> {"scope":"price_negotiation","when":"a customer asks for a discount or makes a low offer","do":"Do not repeat the advertised price and do not agree to or refuse the offer. Invite them to inspect the car first; the price is discussed once they have seen it.","internal":false}',
  '',
  'Return one JSON object and nothing else: {"lessons":[{"scope":"...","when":"...","do":"...","internal":false}]}',
].join('\n');

/**
 * Turns a coaching note into lessons. One AI request. The note, the draft and the customer's
 * words have had the customer's details removed before this point.
 */
export async function distilLessons({ customerText = '', draftText = '', note = '', situations = [] }) {
  const keys = [...Object.keys(SITUATIONS), 'general'];
  const user = [
    `Situation keys: ${keys.join(', ')}, any`,
    `This message was filed under: ${situations.join(', ') || 'general'}`,
    '',
    'The customer wrote:',
    customerText || '(not recorded)',
    '',
    'The assistant drafted:',
    draftText || '(not recorded)',
    '',
    "The owner's coaching note:",
    note,
  ].join('\n');
  const { json } = await complete(LESSON_SYSTEM, user);
  const list = Array.isArray(json?.lessons) ? json.lessons : [];
  return list
    .map((l) => ({
      scope: keys.includes(String(l?.scope)) ? String(l.scope) : 'any',
      when: squash(String(l?.when || '')).slice(0, 200),
      do: squash(String(l?.do || '')).slice(0, 500),
      internal: !!l?.internal,
    }))
    .filter((l) => wordCount(l.do) >= 3)
    .slice(0, 3);
}

/**
 * "Could be better": the owner coaches Wheelman on how to handle this kind of message. The note
 * is kept as written for the record, but what Wheelman uses afterwards is the lesson taken from
 * it, so the owner's own words are never replayed to a customer.
 */
export async function onAdvice(item, draftId, note) {
  const draft = getDraft(draftId);
  const said = squash(String(note || '')).slice(0, 600);
  if (!draft) return { learned: false, why: 'suggestion not found' };
  if (!said) return { learned: false, why: 'nothing was said' };
  if (!canLearnFrom(draft.item_key) || !canLearnFrom(item?.itemKey)) return { learned: false, why: 'not a dashboard conversation' };
  const { customerText, upto } = askedBefore(item, draft);
  const { situations, firstReply } = aboutOf(item, draft, upto);
  const row = {
    draftId: draft.id, itemKey: item.itemKey, situations, firstReply,
    customerText: maskCustomerSignOff(redact(customerText, item.lead)).slice(0, 600),
    draftText: maskGreetingNames(redact(comparable(draft.reply), item.lead)).slice(0, 600),
    note: redact(said, item.lead),
  };
  const id = insertAdvice(row);
  // If no AI model can answer now, the note is kept and its lesson is worked out later.
  let lessons = null;
  try { lessons = await distilLessons(row); setAdviceLessons(id, lessons); } catch { /* tried again by distilPending */ }
  return { learned: true, lessons: lessons || [], pending: lessons === null };
}

/** Works out the lessons of notes that have none yet (the AI was busy when they were written). */
export async function distilPending(max = 2) {
  let done = 0;
  for (const a of allAdvice().filter((r) => r.lessons === null).slice(0, max)) {
    try { setAdviceLessons(a.id, await distilLessons({ customerText: a.customer_text, draftText: a.draft_text, note: a.note, situations: a.situations })); done++; }
    catch { break; }
  }
  return done;
}

/**
 * What the owner has taught that bears on a new message.
 * approved: replies approved as written for similar messages.
 * lessons: the lessons taken from coaching notes, newest first: those for this kind of message
 *          and those that apply to every reply.
 * raw: notes on similar messages with no lesson (not worked out yet, or none could be taken).
 */
export function ownerGuidance(q, now = Date.now()) {
  const mine = (r) => canLearnFrom(r.item_key) && r.item_key !== q.excludeItemKey;
  const approved = allLearned().filter((r) => mine(r) && r.source === 'approved')
    .map((r) => ({ r, s: score(r, q, now) })).filter((x) => x.s >= 3).sort((a, b) => b.s - a.s).slice(0, 2).map((x) => x.r);

  const notes = allAdvice().filter(mine); // newest first
  const kinds = new Set([...(q.situations || []), q.primary].filter(Boolean));
  const lessons = [];
  for (const a of notes) {
    for (const l of a.lessons || []) {
      const fits = l.scope === 'any' || kinds.has(l.scope);
      if (!fits) continue;
      if (lessons.some((x) => similarity(x.do, l.do) >= 0.8)) continue; // said before, in other words
      lessons.push({ ...l, at: a.at });
    }
  }
  const raw = notes.filter((a) => a.lessons === null || !a.lessons.length)
    .map((r) => ({ r, s: score({ ...r, source: 'note' }, q, now) })).filter((x) => x.s >= 2.5).sort((a, b) => b.s - a.s).slice(0, 2).map((x) => x.r);
  return { approved, lessons: lessons.slice(0, 10), raw };
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
  // Replies the owner approved are shown in their own section, with more weight than an example.
  const rows = allLearned().filter((r) => canLearnFrom(r.item_key) && r.item_key !== q.excludeItemKey && r.source !== 'approved');
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
