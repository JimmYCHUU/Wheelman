// Learning from replies that were really used.
//
// Sources, by the owner's instruction: the dashboard's leads and conversations, and the import
// emails of the Import Query section, each kept to its own kind: what an email taught is used only
// for emails, what a text taught only for texts and Marketplace chats. Marketplace chats, texts
// seen only on the phone and auction orders are never learned from.
//
// Two signals:
//   copied — the text in the message box when Copy was pressed (what the person chose to send)
//   sent   — the reply that later appears in the dashboard conversation (the confirmed result)
// "sent" replaces "copied" for the same suggestion once it is seen.

import { config } from './config.js';
import { getMeta, setMeta, getDraft, upsertLearned, deleteLearned, deleteLearnedForAnchor, learnedTextExists, allLearned, recordCopied, recordCopiedTime, recordEdit, setDraftRating, getLearned, insertAdvice, allAdvice, setAdviceLessons, insertRemember, rememberedAlready, getLesson } from './db.js';
import { redact } from './redact.js';
import { maskCustomerSignOff, maskGreetingNames, stripLocationBlock, loadExclusions } from './voice.js';
import { stripModelSignOff, BLANK_PATTERN } from './checks.js';
import { blanksIn } from '../web/lib/blank.js';
import { similarity, wordCount, squash } from './text.js';
import { complete } from './llm.js';
import { SITUATIONS } from './situations.js';
import { onImportsList } from './placement.js';
import { ENQUIRY_MESSAGES } from './ordermessages.js';

const BLANK = new RegExp(BLANK_PATTERN);

/** When the voice changed (meta voice_cutover_at), or null. The app marks it once, at its first start after the change. */
export function voiceCutover() { return getMeta('voice_cutover_at', null); }
export function markVoiceCutover(at = Date.now()) {
  if (!getMeta('voice_cutover_at', null)) setMeta('voice_cutover_at', at);
  return getMeta('voice_cutover_at', null);
}
/**
 * Lessons learned before the voice changed are in the old register. Those about price questions
 * followed the old policy (invite first, no inclusions) and are dropped; the rest are kept and
 * marked, so the request says to take what they say and not their wording.
 */
function sinceVoice(rows) {
  const cut = voiceCutover();
  if (!cut) return rows.map((r) => ({ ...r, beforeVoice: false }));
  return rows.filter((r) => !((r.at || 0) < cut && (r.situations || []).includes('price_negotiation')))
    .map((r) => ({ ...r, beforeVoice: (r.at || 0) < cut }));
}

/** Only dashboard conversations and leads, and import emails, teach Wheelman. */
export const canLearnFrom = (itemKey) => /^(?:[cl]|em):\d+$/.test(String(itemKey || ''));
/** A conversation from the dashboard's Imports list, listed in Imports: it teaches nothing there. */
const importsListHere = (item) => !!item && item.section === 'importquery' && onImportsList(item);
/**
 * Whether this conversation teaches where it is listed now: one that can teach at all, and is not
 * in the Auction section, nor in Imports from the dashboard's Imports list. Nothing is learned from
 * Auction, whatever the conversation came from, and nothing from the Imports list in Imports, as
 * nothing was when the list was in Auction. Moved to Dashboard, such a lead teaches there.
 */
export const teachesHere = (item) => !!item && canLearnFrom(item.itemKey) && item.section !== 'auction' && !importsListHere(item) && !/^fu:/.test(String(item.anchorKey || ''));
/** A follow-up's suggestion (src/followup.js): it answers no customer message and teaches nothing. */
const isFollowUp = (draft) => /^fu:\d+$/.test(String(draft?.anchor_key || '')) || !!draft?.context?.followUp;
const FOLLOW_UP = 'a follow-up';
/** A suggestion written while its conversation was in Auction teaches nothing, even after it is moved out. */
const writtenInAuction = (draft) => draft?.context?.section === 'auction';
/** Nor does one written for a conversation from the Imports list while it was in Imports. */
const writtenInImports = (draft, item) => draft?.context?.section === 'importquery' && !!item && onImportsList(item);
/**
 * Nor one written from a message of the auction's wording file (an enquiry's Thanks, with
 * estimate and deposit, Car found and the rest), wherever it was written: its words are the
 * owner's own file, as an order's are.
 */
const fromWordingFile = (draft) => ENQUIRY_MESSAGES.includes(draft?.context?.message);
/** Written where nothing teaches (in Auction, or in Imports for the Imports list), or from the auction's wording file. */
const writtenUntaught = (draft, item) => writtenInAuction(draft) || writtenInImports(draft, item) || fromWordingFile(draft);
const NOT_HERE = 'not a dashboard conversation or an import email';
const notHereWhy = (item) => (item?.section === 'auction' ? 'in the Auction section' : NOT_HERE);
/** Which kind of reply a request wants lessons for: emails learn from emails, everything else from texts. */
const wantChannel = (q) => (q?.channel === 'email' ? 'email' : 'sms');
const sameChannel = (row, q) => (row.channel || 'sms') === wantChannel(q);

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

/** A standard reply the team sends to everyone (the wording file's canned list): it teaches nothing about answering this customer. */
const canned = (body, rawText) => loadExclusions().canned.some((re) => re.test(rawText) || re.test(body));

/** Reasons a reply should not become an example. Takes the comparable form. Returns '' when it is fine. */
function unsuitable(body, rawText) {
  if (!body) return 'empty';
  if (BLANK.test(body)) return 'still has a blank';
  if (wordCount(body) < 2) return 'too short';
  if (body.length > 900) return 'too long';
  if (/\b\d{3}[\s-]?\d{3}\b[^\n]{0,30}\b\d{6,10}\b/.test(body) || /\bbsb\b/i.test(body)) return 'contains bank details';
  if (canned(body, rawText)) return 'standard wording';
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
  if (!item || !draft || !teachesHere(item)) return { learned: false, why: notHereWhy(item) };
  if (isFollowUp(draft)) return { learned: false, why: FOLLOW_UP };
  if (draft.item_key !== undefined && !canLearnFrom(draft.item_key)) return { learned: false, why: NOT_HERE };
  if (writtenInAuction(draft)) return { learned: false, why: 'written in the Auction section' };
  if (writtenInImports(draft, item)) return { learned: false, why: "written in Imports, from the dashboard's Imports list" };
  if (fromWordingFile(draft)) return { learned: false, why: "written from the auction's wording file" };
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
  // The owner changed this reply and approved it, then copied that same text: the approval stands.
  const kept = getLearned(draft.id);
  if (source === 'copied' && kept?.source === 'approved' && kept.final_text === final) return { learned: true, why: 'approved', changed, similarity: sim };
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
  // A message for an auction order: the text is kept, because Wheelman cannot see WhatsApp and
  // this is its only record of what was said to the customer. Nothing is learned from it.
  if (/^ao:\d+$/.test(String(draft.item_key || ''))) { recordCopied(draftId, String(text || '').slice(0, 4000)); return { learned: false, why: 'an auction order' }; }
  // A follow-up: the text is kept as the record of what was said; nothing is learned from it.
  if (isFollowUp(draft)) { recordCopied(draftId, String(text || '').slice(0, 4000)); return { learned: false, why: FOLLOW_UP }; }
  // A Marketplace suggestion, or one for a text seen only on the phone: note that Copy was
  // pressed, keep none of the text, learn nothing.
  if (!canLearnFrom(draft.item_key) || !canLearnFrom(item?.itemKey)) { recordCopiedTime(draftId); return { learned: false, why: NOT_HERE }; }
  recordCopied(draftId, String(text || '').slice(0, 4000));
  // Copied as Wheelman wrote it, with no blank left: the person says it is right, as Good reply did.
  // Not where nothing teaches (the Auction section).
  if (copiedAsWritten(draft, text) && approvableCopy(draft, text) && teachesHere(item) && !writtenUntaught(draft, item)) {
    setDraftRating(draftId, 'good');
    return { ...onApproved(item, draftId, true), approved: true };
  }
  return learnFrom(item, draft, text, 'copied');
}

/** The copied text is the suggestion as written (spacing, the sign-off and the address block aside), and no blank is left in it. */
function copiedAsWritten(draft, text) {
  const written = squash(comparable(draft.reply));
  return !!written && squash(comparable(text)) === written && blanksIn(text).length === 0;
}

/**
 * Whether a copy as written says the reply is right. Not when a check failed (Copy anyway is no
 * approval), not for code's own wording (a template word for word, the standard wording: provider
 * 'none'), not for a canned reply, and not once it was rated anything but Good reply (Could be
 * better, Not usable).
 */
function approvableCopy(draft, text) {
  if ((draft.checks || []).some((c) => c && c.level === 'fail')) return false;
  if (draft.provider === 'none') return false;
  if (canned(comparable(text), String(text || ''))) return false;
  return !draft.rating || draft.rating === 'good';
}

/** The text in the message box: what the person typed over the suggestion, or the suggestion itself. */
export const currentText = (draft) => (typeof draft?.edited_text === 'string' ? draft.edited_text : draft?.reply || '');

/**
 * Called as the text in the message box changes. The edit is kept with the suggestion, so it is
 * still there after a reload. Nothing is learned from typing alone: that happens when the reply
 * is copied, approved, or seen sent. Marketplace edits are kept the same way and never learned from.
 */
export function onEdited(item, draftId, text) {
  const draft = getDraft(draftId);
  if (!draft) return { ok: false, why: 'suggestion not found' };
  const clean = String(text ?? '').replace(/\r/g, '').slice(0, 4000);
  const edited = clean !== String(draft.reply || '');
  recordEdit(draftId, edited ? clean : null);
  let rating = draft.rating || '';
  // A reply that was approved and is then changed: the approval follows the text. Emptied, it is taken back.
  if (rating === 'good' && item && canLearnFrom(draft.item_key) && teachesHere(item) && !writtenUntaught(draft, item) && !isFollowUp(draft)) {
    if (clean.trim()) onApproved(item, draftId, true);
    else { setDraftRating(draftId, ''); onApproved(item, draftId, false); rating = ''; }
  }
  return { ok: true, edited, cleared: edited && !clean.trim(), rating };
}

/** Called when a rating changes: a suggestion marked not usable is forgotten unless a sent reply confirmed it. */
export function onRated(draftId, rating) {
  if (rating !== 'bad') return;
  const row = allLearned(2000).find((l) => l.draft_id === draftId);
  if (row && row.source === 'copied') deleteLearned(draftId);
}

// ---- what the owner says about a suggestion ----------------------------------------------------

/**
 * "Good reply": the owner approves the reply as it stands in the message box, which is the
 * suggestion as written or with their own changes. It becomes a model for similar messages.
 * Approving is the one case where Wheelman's own wording is kept, because a person has said it
 * is right. Taking the approval back forgets it.
 */
export function onApproved(item, draftId, approved = true) {
  const draft = getDraft(draftId);
  if (!draft) return { learned: false, why: 'suggestion not found' };
  if (isFollowUp(draft)) return { learned: false, why: FOLLOW_UP };
  if (!canLearnFrom(draft.item_key) || !teachesHere(item) || writtenUntaught(draft, item)) return { learned: false, why: item?.section === 'auction' || writtenInAuction(draft) ? 'in the Auction section' : 'not a dashboard conversation' };
  if (!approved) {
    if (getLearned(draftId)?.source === 'approved') deleteLearned(draftId);
    return { learned: false, why: 'approval taken back' };
  }
  const written = comparable(draft.reply);
  const body = comparable(currentText(draft));
  const forget = (why) => { if (getLearned(draftId)?.source === 'approved') deleteLearned(draftId); return { learned: false, why }; };
  if (!body || wordCount(body) < 2) return forget('too short');
  if (/\b\d{3}[\s-]?\d{3}\b[^\n]{0,30}\b\d{6,10}\b/.test(body) || /\bbsb\b/i.test(body)) return forget('contains bank details');
  const { customerText, upto } = askedBefore(item, draft);
  if (!customerText) return { learned: false, why: 'no customer message' };
  const { situations, firstReply } = aboutOf(item, draft, upto);
  const text = maskGreetingNames(redact(body, item.lead));
  const changed = squash(written).toLowerCase() !== squash(body).toLowerCase();
  deleteLearnedForAnchor(draft.item_key, draft.anchor_key, draft.id);
  upsertLearned({
    draftId: draft.id, itemKey: item.itemKey, situations, firstReply,
    customerText: maskCustomerSignOff(redact(customerText, item.lead)).slice(0, 900),
    // With changes, both versions are kept: what Wheelman wrote, and what the owner made of it.
    draftText: changed ? maskGreetingNames(redact(written, item.lead)) : text, finalText: text,
    source: 'approved', changed, similarity: changed ? similarity(written, body) : 1, at: Date.now(),
  });
  return { learned: true, changed };
}

const LESSON_SYSTEM = [
  'You help train a reply assistant for Carbarn, a used-car dealer in Sydney. The assistant drafts SMS replies to customers, and email replies to customers asking about importing a car from Japan.',
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
  const { json } = await complete(LESSON_SYSTEM, user, { role: 'lessons' });
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
  if (!canLearnFrom(draft.item_key) || !teachesHere(item) || writtenUntaught(draft, item)) return { learned: false, why: item?.section === 'auction' || writtenInAuction(draft) ? 'in the Auction section' : 'not a dashboard conversation' };
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

// What a lesson can be for: one kind of customer message, or every reply.
const SCOPES = [...Object.keys(SITUATIONS), 'general', 'any'];
export const REMEMBER_REFUSED = 'Marketplace chats, phone-only texts and auction orders do not teach Wheelman.';
export const REMEMBER_FOLLOW_UP = 'Follow-ups do not teach Wheelman.';
export const REMEMBER_AUCTION = 'Auction conversations do not teach Wheelman.';
export const REMEMBER_IMPORTS_LIST = "Conversations from the dashboard's Imports list do not teach Wheelman.";
export const REMEMBER_WORDING_FILE = "Messages from the auction's wording file do not teach Wheelman.";
export const NOTHING_TO_REMEMBER = 'There is no instruction to remember.';
const NO_SCOPE = 'Say which kind of reply to remember it for.';

/**
 * "Remember": the instruction a suggestion was written from (Tell Wheelman) becomes a lesson for
 * every later reply of its kind (scope: a situation key, or 'any') in its channel, this
 * conversation included. The instruction itself is the lesson, with the customer's details taken
 * out; no AI is asked. Where nothing teaches it is refused, as is a suggestion written from no
 * instruction. item may be null when the conversation cannot be found.
 * Returns { lesson, wasOn } (wasOn: the lesson was there and switched on before this call) or { status, error }.
 */
export function onRemember(item, draftId, scope) {
  const draft = getDraft(draftId);
  if (!draft) return { status: 404, error: 'Suggestion not found.' };
  // Marketplace, the phone-only list and auction orders (and their out: messages), then follow-ups,
  // then anything in Auction, then the dashboard's Imports list, then a message from the auction's
  // wording file: each refused in its own sentence.
  if (!canLearnFrom(draft.item_key) || /^out:/.test(String(draft.anchor_key || ''))) return { status: 400, error: REMEMBER_REFUSED };
  if (isFollowUp(draft)) return { status: 400, error: REMEMBER_FOLLOW_UP };
  if (writtenInAuction(draft) || item?.section === 'auction') return { status: 400, error: REMEMBER_AUCTION };
  if (importsListHere(item) || writtenInImports(draft, item)) return { status: 400, error: REMEMBER_IMPORTS_LIST };
  if (fromWordingFile(draft)) return { status: 400, error: REMEMBER_WORDING_FILE };
  if (!item) return { status: 404, error: 'That conversation was not found.' };
  const instruction = squash(redact(String(draft.instruction || ''), item.lead)).slice(0, 600);
  if (!instruction) return { status: 400, error: NOTHING_TO_REMEMBER };
  const kind = String(scope ?? '').trim();
  if (!SCOPES.includes(kind)) return { status: 400, error: NO_SCOPE };
  // Remembered before and still switched on: Undo must not switch off a lesson this press did not make.
  const prior = rememberedAlready({ itemKey: draft.item_key, scope: kind, instruction });
  const { id, do: said, channel, at } = getLesson(insertRemember({ itemKey: draft.item_key, scope: kind, instruction, situations: draft.context?.situations || [] }));
  return { lesson: { id, do: said, scope: kind, channel, at, off: false }, wasOn: !!prior && !prior.off };
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
 * A lesson switched off is never used. A Remember lesson is used in this conversation too: the
 * hold-out (a replay must not see its own answer) is for what a conversation taught by example.
 * A Remember lesson is never used for a Marketplace chat; a Could be better lesson is, as before.
 * Each lesson carries where it came from: adviceId (its advice row) and n (its place in that row).
 */
export function ownerGuidance(q, now = Date.now()) {
  const taught = (r) => (r.at || 0) <= now && canLearnFrom(r.item_key) && sameChannel(r, q);
  const mine = (r) => taught(r) && r.item_key !== q.excludeItemKey;
  const approved = sinceVoice(allLearned().filter((r) => mine(r) && r.source === 'approved'))
    .map((r) => ({ r, s: score(r, q, now) })).filter((x) => x.s >= 3).sort((a, b) => b.s - a.s).slice(0, 2).map((x) => x.r);

  // A Remember lesson is for texts and emails: a Marketplace request never carries one.
  const rememberFits = (a) => q?.channel !== 'marketplace' && taught(a);
  const notes = allAdvice().filter((a) => !a.off && (a.kind === 'remember' ? rememberFits(a) : mine(a))); // newest first
  const kinds = new Set([...(q.situations || []), q.primary].filter(Boolean));
  const lessons = [];
  for (const a of notes) {
    (a.lessons || []).forEach((l, n) => {
      const fits = l.scope === 'any' || kinds.has(l.scope);
      if (!fits) return;
      if (lessons.some((x) => similarity(x.do, l.do) >= 0.8)) return; // said before, in other words
      lessons.push({ ...l, at: a.at, adviceId: a.id, n });
    });
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
  const rows = sinceVoice(allLearned().filter((r) => (r.at || 0) <= now && canLearnFrom(r.item_key) && r.item_key !== q.excludeItemKey && r.source !== 'approved' && sameChannel(r, q)));
  return rows.map((r) => ({ r, s: score(r, q, now) }))
    .filter((x) => x.s >= 3)
    .sort((a, b) => b.s - a.s)
    .slice(0, max)
    .map(({ r }) => ({ id: `learned-${r.draft_id}`, author: 'team', customer: r.customer_text, events: [], reply: r.final_text, replyWords: wordCount(r.final_text), learned: true, beforeVoice: r.beforeVoice }));
}

/** Cases where the person changed the suggestion before using it: the clearest lessons. */
export function corrections(q, max = 2, now = Date.now()) {
  const rows = sinceVoice(allLearned().filter((r) => (r.at || 0) <= now && canLearnFrom(r.item_key) && r.changed && r.item_key !== q.excludeItemKey && r.draft_text && (r.similarity ?? 1) < 0.92 && (r.similarity ?? 0) > 0.15 && sameChannel(r, q)));
  return rows.map((r) => ({ r, s: score(r, q, now) }))
    .filter((x) => x.s >= 2.5)
    .sort((a, b) => b.s - a.s)
    .slice(0, max)
    .map(({ r }) => ({ customer: r.customer_text, drafted: r.draft_text, used: r.final_text, beforeVoice: r.beforeVoice }));
}
