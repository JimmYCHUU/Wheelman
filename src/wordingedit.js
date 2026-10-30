// What the Playbook's routes call for templates and voice rules (src/playbookapi.js): each file's
// parts with the wording in use, every saved version of a part, a save, and a preview. A save is a
// new row of playbook_versions, laid over its part of the file whenever the file is read
// (src/wording.js); the file is never written, and no saved version is ever changed or removed. A
// save that would break its file, or let go of a rule the wording keeps, is refused in words. A
// preview shows changed words on three conversations, written by the code that writes each message,
// with no AI, says when a card or none of them shows the change, and saves nothing.
//
// src/wording.js never imports this module, so the overlay has no cycle through the modules here.

import { WORDING, PART_HEADER, fileParts, withPreview } from './wording.js';
import { addVersion, versionsOf, openFollowUps } from './db.js';
import { template, fillParts, unfilled } from './templates.js';
import { SECTION_FILES, FACTS, checkTemplates, templatesFor, composeSectionTemplate, carInHand } from './sectiontemplates.js';
import { ENQUIRY_MESSAGES, composeMessage, enquiryOrder, enquiryTemplates, orderValues, kmLimit, LOT_BLANKS } from './ordermessages.js';
import { MESSAGES, messagesFor } from './orders.js';
import { listItems, orderRows, itemFromKey, displayName, rowCar } from './items.js';
import { priceBlock, inclusionsSentence } from './pricereply.js';
import { standardBlock, inviteBlock } from './firstreply.js';
import { askParts, wantedFrom, enquiryStage, offerBlock, blankOfferBlock } from './imports.js';
import { restore } from './redact.js';
import { logLine } from './log.js';

const LONGEST = 7999; // characters: "keep it under 8,000" is what the refusal says, so 8,000 is refused
const AUCTION = 'auction-messages.md';
const SECTIONS = new Set(Object.values(SECTION_FILES));
const DEPOSIT = '[DEPOSIT LINK?]';
const FACT = /\{[a-z0-9_]+\}/g;
// Any word in braces, single or double: Wheelman fills only {word} in small letters and {{NAME}},
// the customer's first name; {Car}, {car link} or {{Name}} would reach the customer as typed.
const BRACED = /\{\{[^{}\n]*\}\}|\{[^{}\n]*\}/g;
const NAME = '{{NAME}}';
// A short piece, as template() reads one ("@own: This is based on …"), with words after its name;
// any @ line; and the line of dashes that parts a message from the lines always added under it
// (import-ask.md, read by askParts in src/imports.js).
const SHORT_PIECE = /^@([a-z0-9_]+):\s*(\S.*)$/;
const AT_LINE = /^@[a-z0-9_]+:/;
const DIVIDER = /^\s*-{3,}\s*$/;
const NOT_LISTED = { status: 404, error: 'That wording is not in the Playbook.' };

const fileOf = (name) => WORDING.find((w) => w.name === name) || null;

// The auction file's messages the order's "Which message?" list never names (MESSAGES), each with
// its name in words: "Car found, full" as written when no car from the live auction is read.
const NAMED = { lot_offer_manual: 'Car found, with no live auction car' };
const labelLine = (text) => (String(text || '').match(/^@label:\s*(.+)$/m) || [])[1]?.trim() || '';

/**
 * A part's label, always in words, never its id: its @label (in the wording in use, else in the
 * file), else the auction message's name, else the heading, the file's label, or "The short
 * pieces"; a message with none of these is named by a sentence.
 */
function labelOf(w, part, text, headed, fileText = text) {
  if (!part) return w.kind === 'template' && headed ? 'The short pieces' : w.label;
  if (w.kind === 'voice') return part;
  return labelLine(text) || labelLine(fileText) || (w.name === AUCTION && (MESSAGES[part] || NAMED[part])) || `A message with no name yet, in ${w.label}`;
}

/** Where the Playbook lists a part: the auction file's enquiry messages under Imports, where they are offered; the rest with their file. */
const groupOf = (w, part) => (w.name === AUCTION && ENQUIRY_MESSAGES.includes(part) ? 'Imports' : w.group);

/**
 * One part as the Playbook lists it: { part, label, group, text, fileText, at, versions, fileChanged }.
 *   text         the wording in use: the newest saved version, else the file's own
 *   at           when the wording in use was saved; null for the file's own
 *   versions     how many versions were saved
 *   fileChanged  the file was changed by hand since the wording in use was saved, so its wording
 *                (fileText) differs from what it said then and can be offered
 * A newest version with a status of its own lays nothing (src/wording.js): the part is the file's.
 */
function listed(w, { part, text: fileText }, headed) {
  const all = versionsOf({ kind: w.kind, name: w.name, part });
  const inUse = all[0] && !all[0].status ? all[0] : null;
  const text = inUse ? inUse.text : fileText;
  return {
    part, label: labelOf(w, part, text, headed, fileText), group: groupOf(w, part), text, fileText,
    at: inUse ? inUse.at : null, versions: all.filter((v) => !v.status).length, fileChanged: !!inUse && inUse.base !== fileText,
  };
}

/** The parts of one file the Playbook edits, each as listed() gives it, in the file's order; [] for one it does not list. */
export function wordingParts(name) {
  const w = fileOf(name);
  if (!w) return [];
  const parts = fileParts(name);
  const headed = parts.some((p) => p.part);
  return parts.map((p) => listed(w, p, headed));
}

/** Every file the Playbook edits, in its order: [{ name, kind, group, label, parts }]. */
export const wordingFiles = () => WORDING.map((w) => ({ ...w, parts: wordingParts(w.name) }));

/**
 * Every saved version of one part, newest first, and the file's own wording, which is the first:
 * { versions: [{ id, text, at }], file }, or { status, error }. `file` is what the file said when
 * the part was first saved (what it says now, when never saved). When the file says something else
 * now, `saidFirst` is true, so the page names it "What your file said first", not "In your file".
 */
export function wordingVersions({ kind, name, part } = {}) {
  const w = fileOf(String(name ?? ''));
  const own = w && w.kind === kind ? fileParts(w.name).find((p) => p.part === String(part ?? '')) : null;
  if (!own) return NOT_LISTED;
  const all = versionsOf({ kind: w.kind, name: w.name, part: own.part });
  const versions = all.filter((v) => !v.status).map((v) => ({ id: v.id, text: v.text, at: v.at }));
  const first = all.length && typeof all[all.length - 1].base === 'string' ? all[all.length - 1].base : own.text;
  return first === own.text ? { versions, file: first } : { versions, file: first, saidFirst: true };
}

/**
 * A problem checkTemplates names, in plain words: what to change, in a sentence, with no file name
 * and no message name (the problem is always the part being saved).
 */
function plainProblem(problem) {
  const what = problem.replace(/^\S+\.md \S+: /, '');
  if (what === 'no @label') return 'Keep the line that starts @label: — it is the name the "Which message?" list shows.';
  if (what === 'no @fits') return 'Keep the line that starts @fits: — it says when the message is offered.';
  let m = what.match(/^@([a-z]+) names "(.*)", which no conversation shows$/);
  if (m) return `A conversation never shows "${m[2]}": on the @${m[1]}: line, use the words the other messages use.`;
  m = what.match(/^(\{[a-z0-9_]+\}) is not a fact Wheelman fills in$/);
  if (m) return `${m[1]} is not a fact Wheelman fills in here.`;
  return `${what.charAt(0).toUpperCase()}${what.slice(1)}.`;
}

/** The short pieces in a part ("@own: …"), as template() reads them, a name with words after it: [[name, words]]. */
const pieces = (text) => text.split('\n').map((l) => l.match(SHORT_PIECE)).filter(Boolean).map((m) => [m[1], m[2]]);
/** The names of the short pieces in a part. */
const pieceNames = (text) => pieces(text).map(([k]) => k);
/** "a", "a and b", "a, b and c". */
const andList = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/** A {word} in the words that the file uses nowhere, or '': the file-wide check on its facts. */
function strayFact(w, words) {
  const used = new Set(fileParts(w.name).flatMap((p) => p.text.match(FACT) || []));
  return (words.match(FACT) || []).find((f) => !used.has(f)) || '';
}

/**
 * A word in braces that Wheelman never fills, in the words to show; '' when there is none. It is
 * written as one it fills, when that is plain: {{NAME}} for a name, else the fact the file is filled
 * with that it would be in small letters with underscores ({Car} is {car}, {car link} is {car_link}).
 */
function oddBrace(w, words) {
  const odd = (words.match(BRACED) || []).find((b) => b !== NAME && !/^\{[a-z0-9_]+\}$/.test(b));
  if (!odd) return '';
  const inner = odd.replace(/^\{+|\}+$/g, '').trim();
  const fact = `{${inner.toLowerCase().replace(/[\s-]+/g, '_')}}`;
  const facts = new Set([...fileParts(w.name).flatMap((p) => p.text.match(FACT) || []), ...(FACTS[w.name] || []).map((k) => `{${k}}`)]);
  const fix = inner.toUpperCase() === 'NAME' ? NAME : facts.has(fact) ? fact : '';
  return fix ? `${odd} is not a word Wheelman fills. Write it as ${fix}.` : `${odd} is not a word Wheelman fills, so the customer would see it as written.`;
}

/** A line with words on it that is not a line of dashes. */
const wordsOn = (l) => !!l.trim() && !DIVIDER.test(l);

/**
 * Why words would break their part, in the words to show; '' when they would not. Every line is
 * the file's own kind of line; a message has words to send besides its @ lines; every word in
 * braces is one Wheelman fills; the three section files' own checks (checkTemplates) name no new
 * problem with the words laid over; any other template part uses only the facts its file uses;
 * the short pieces code reads by name stay, each with words after its name, and each uses only the
 * facts its code fills it with; the line of dashes stays, once, with words above it and below it;
 * and the deposit link stays a blank where the file has it. (A {word} a message's own code
 * would leave as written is found by leftAsWritten, which writes it.) `headed`: the file has
 * messages, so its part '' is the short pieces, which are all @ lines.
 */
function refusal(w, own, words, headed) {
  if (!words) return 'Write the wording first.';
  if (words.length > LONGEST) return 'That is too long: keep it under 8,000 characters.';
  const lines = words.split('\n');
  if (w.kind === 'template') {
    if (lines.some((l) => PART_HEADER.test(l))) return 'A line like ===== name ===== starts a new message. Add a new message in the file itself.';
    if (lines.some((l) => l.startsWith('#'))) return 'A line starting with # is a note and is never sent. Take the # off, or remove the line.';
    if ((own.part || !headed) && !lines.some((l) => l.trim() && !AT_LINE.test(l))) {
      return 'Write the words to send under the lines that start with @: with only those lines, nothing would be sent.';
    }
    // Before the facts are checked: {{Name}} holds {name}, which is not the slip to name.
    const brace = oddBrace(w, words);
    if (brace) return brace;
    if (SECTIONS.has(w.name) && own.part) {
      const now = checkTemplates();
      const laid = withPreview({ name: w.name, part: own.part, text: words }, () => checkTemplates()).filter((p) => !now.includes(p));
      if (laid.length) return [...new Set(laid.map(plainProblem))].join(' ');
    } else {
      const stray = strayFact(w, words);
      if (stray) return `${stray} is not a fact Wheelman fills in here.`;
    }
    // The short pieces (part '', before any message) are read by their names; a message's own @
    // lines are its details, which its file's checks govern.
    if (!own.part) {
      const kept = new Set(pieceNames(words));
      const lost = [...new Set(pieceNames(own.text))].filter((k) => !kept.has(k)).map((k) => `@${k}:`);
      if (lost.length === 1) return `Keep the line that starts ${lost[0]} — Wheelman reads it by that name when it writes the message.`;
      if (lost.length) return `Keep the lines that start ${andList(lost)} — Wheelman reads them by those names when it writes the message.`;
      // In a file of messages, each piece is filled with its own facts only (a link, a price, a date),
      // the ones it has in the file; any other {word} in it would be sent as written.
      if (SECTIONS.has(w.name) || w.name === AUCTION) {
        const facts = new Map(pieces(own.text).map(([k, t]) => [k, new Set(t.match(FACT) || [])]));
        for (const [k, t] of pieces(words)) {
          const stray = facts.has(k) && (t.match(FACT) || []).find((f) => !facts.get(k).has(f));
          if (stray) return `${stray} is not filled in that short piece, so the customer would see it as written.`;
        }
      }
    }
    // askParts splits the message from the lines under it at the one line of dashes between words.
    if (own.text.split('\n').some((l) => DIVIDER.test(l))) {
      const at = lines.flatMap((l, i) => (DIVIDER.test(l) ? [i] : []));
      if (!at.length) return 'Keep the line of dashes (---): Wheelman writes the message above it, and always ends with the lines below it.';
      if (at.length > 1 || !lines.slice(0, at[0]).some(wordsOn) || !lines.slice(at[0] + 1).some(wordsOn)) {
        return 'Keep one line of dashes (---), with words above it and below it: Wheelman writes the message above it, and always ends with the lines below it.';
      }
    }
  } else if (lines.some((l) => l.startsWith('## '))) {
    return 'A line starting with ## starts a new section. Add a new section in the file itself.';
  }
  if (own.text.includes(DEPOSIT) && !words.includes(DEPOSIT)) return 'The deposit link stays a blank: keep [DEPOSIT LINK?] in this message.';
  return '';
}

// ---- a {word} a message's own code would leave as written --------------------------------------

// The block files: each is put under a reply by its own code, filled with its own few facts.
const BLOCKS = new Set(['price-reply.md', 'first-reply.md', 'inspection-invite.md', 'auction-offer.md', 'import-ask.md']);
// Stand-ins for what a block's code is given, only to see which {words} it leaves unfilled: never shown.
const STAND_IN_LINK = '[LINK?]';
const STAND_IN_LOT = { title: 'A car', km: 1000, grade: '4', url: STAND_IN_LINK, benchmarkYen: 1 };
const STAND_IN_ESTIMATE = { bidYen: 2, totalAud: 3 };

/**
 * "Car found, full" (lot_offer)'s opening, as it reads for a car found in the live auction: the
 * order's own facts and its kilometre limit, and that car's facts as blanks, which is everything
 * composeMessage fills it with (orderValues, kmLimit and lotValues in src/ordermessages.js).
 */
const offerOpening = (o) => fillParts(template(AUCTION)?.sections?.lot_offer || '', { ...orderValues(o), km_limit: kmLimit(o), ...LOT_BLANKS });

/** Each way a part's own code writes it, with stand-in facts: the texts to look in for a {word} left as written. Run inside a preview. */
async function writtenByCode(w, part) {
  if (w.name === AUCTION) {
    // An order before anything is known of it; in a preview, a message that needs the live auction takes the way it is written without it.
    const o = enquiryOrder({ timeline: [] });
    return [part === 'lot_offer' ? offerOpening(o) : await messageText(o, part === 'lot_offer_manual' ? 'lot_offer' : part, Date.now())];
  }
  if (w.name === 'price-reply.md') return [priceBlock({ vehicle: { outline: ['6 Months NSW Registration'] }, inspectionUrl: STAND_IN_LINK }), priceBlock({ vehicle: { outline: [] } })];
  if (w.name === 'first-reply.md') return [standardBlock({ vehicleUrl: STAND_IN_LINK, inspectionUrl: STAND_IN_LINK })];
  if (w.name === 'inspection-invite.md') return [inviteBlock(STAND_IN_LINK), inviteBlock(STAND_IN_LINK, { online: true }), inviteBlock(STAND_IN_LINK, { chat: true })];
  if (w.name === 'auction-offer.md') {
    return [offerBlock(STAND_IN_LOT, STAND_IN_ESTIMATE, 'customer'), offerBlock(STAND_IN_LOT, STAND_IN_ESTIMATE), offerBlock(STAND_IN_LOT, STAND_IN_ESTIMATE, 'suggested', { websiteBidYen: 1 })];
  }
  if (w.name === 'import-ask.md') { const { message, closing } = askParts({ car: 'A car', missing: [] }); return [message, closing]; }
  return [];
}

/**
 * A {word} the words would leave as written in a real message and the wording in use does not, or
 * '': each way the part's own code writes it is tried, with each wording laid over it inside a
 * preview, so nothing outside this computer is read. For the auction file's messages and the
 * blocks; the section files' messages are filled from their whole list of facts (checkTemplates),
 * and each short piece is checked against its own facts (refusal). When the code cannot write it
 * just now, the file-wide check on its facts is what holds, and the save is still answered in words.
 */
async function leftAsWritten(w, own, words) {
  if (!((w.name === AUCTION && own.part) || BLOCKS.has(w.name))) return '';
  const raw = (text) => withPreview({ name: w.name, part: own.part, text }, async () => unfilled((await writtenByCode(w, own.part)).join('\n')));
  try {
    const before = await raw(listed(w, own, true).text);
    return (await raw(words)).find((x) => !before.includes(x)) || '';
  } catch (e) {
    logLine('playbook', `Which facts ${w.label} would leave as written could not be worked out (${e.message}); its file's own facts were checked instead.`);
    return strayFact(w, words);
  }
}

/**
 * The file and part words are for, with the words trimmed at their ends: { w, own, words, headed },
 * or { status, error } when the Playbook does not list them or they would break the file. Nothing
 * is saved here (a preview checks words the same way).
 */
async function checked({ name, part, text }) {
  const w = fileOf(String(name ?? ''));
  const parts = w ? fileParts(w.name) : [];
  const own = parts.find((p) => p.part === String(part ?? ''));
  if (!own) return NOT_LISTED;
  const words = String(text ?? '').replace(/\r/g, '').trim();
  const headed = parts.some((p) => p.part);
  let why = refusal(w, own, words, headed);
  if (!why && w.kind === 'template') {
    const stray = await leftAsWritten(w, own, words);
    if (stray) why = `${stray} is not filled in this message, so the customer would see it as written.`;
  }
  return why ? { status: 400, error: why } : { w, own, words, headed };
}

/**
 * Saves wording for one part of a file in the Playbook, as a new version used from the next
 * suggestion. The same words as those in use add nothing. Returns { part, unchanged }, the part as
 * wordingParts lists it, or { status, error } with the words to show.
 */
export async function saveWording({ name, part, text, now = Date.now() } = {}) {
  const c = await checked({ name, part, text });
  if (c.error) return c;
  const unchanged = listed(c.w, c.own, c.headed).text === c.words;
  if (!unchanged) addVersion({ kind: c.w.kind, name: c.w.name, part: c.own.part, text: c.words, base: c.own.text, at: now });
  return { part: listed(c.w, c.own, c.headed), unchanged };
}

// ---- a preview: changed words on three conversations, before they are saved ----------------------

const VOICE_HAS_NONE = { status: 400, error: 'Voice rules have no preview: only the AI can show their effect.' };
const NO_CONVERSATION = 'There is no conversation in this section to show it on yet.';
const SHORT_PIECES = 'The short pieces go into other messages as Wheelman writes them, so there is no conversation to show them on by themselves.';
const NOT_WRITTEN = 'Wheelman could not write this one from its records just now, so its facts are left as blanks.';
// What a card says about a line chosen by circumstance that the card itself does not show, so a
// change to that line is never saved as if it had been seen. Each line is named in words, as the
// page shows it, never by the name the file gives it (@suggested, @onsite and the rest).
const BID_LINES = "The bid sentence here is the line with our suggested bid. When our bid is above the website's suggested bid, the line for that is used instead, and when the customer named the bid, the line for their own bid.";
const OFFER_BELOW = 'The offer under the opening is the Auction offer, under Blocks, shown with the line with our suggested bid. Its lines are changed there.';
const VISIT_LINE = 'The first line here is the line for a visit to the showroom. A customer far away gets the line for a video call instead.';
const VIDEO_LINE = 'The first line here is the line for a video call, for a customer far away. Everyone else gets the line for a visit to the showroom.';
const TEXT_TAIL = 'The last line here is the one for a text message. A buyer on Facebook Marketplace gets the line for a chat instead.';
const INCLUDED_LINE = 'The first line here is the one that says what the price includes. A car with nothing on its Included list gets the line for that instead.';
const NOTHING_INCLUDED_LINE = 'The first line here is the line for a car with nothing on its Included list. Every other car gets the line that says what the price includes.';
// What a preview says when a card, or every card, reads the same with the changed words as with
// the wording in use; and when no conversation could be read to show it on.
const UNUSED = 'This conversation does not use the lines you changed.';
const NONE_USES = 'None of these conversations uses the lines you changed.';
const PASSED_OVER = 'Wheelman could not read where this message is offered just now, so there is no conversation to show it on.';
// Where an auction order has got to, in words, for each of the short pieces that say so.
const STAGE = {
  where_searching: 'still being searched for', where_secured: 'secured at auction', where_japan: 'waiting in Japan to be shipped',
  where_transit: 'on its way to Australia', where_arrived: 'going through compliance in Australia',
};
const SHOWN = 3;
const SECTION_OF = Object.fromEntries(Object.entries(SECTION_FILES).map(([section, file]) => [file, section]));
// The messages the auction file's short pieces go into: where the order has got to (@where_…), the
// result of a bid lost (@outcome_unknown, @missed, @passed_in), and the cars of ours offered then
// (@alternative, @arriving).
const PIECES_IN = {
  progress_update: (values) => {
    const t = template(AUCTION);
    const where = Object.keys(t?.snippets || {}).find((k) => k.startsWith('where_') && t.snippets[k] === values.where);
    return `In "${MESSAGES.progress_update}", with the line for where this order has got to${STAGE[where] ? `: ${STAGE[where]}` : ''}. Each stage has a line of its own.`;
  },
  bid_lost: () => `In "${MESSAGES.bid_lost}": the result line here is the one for a bid we did not win. The line for a close miss is used when you type what it sold for, and the line for a car passed in when it was passed in.`,
  bid_lost_stock: () => `In "${MESSAGES.bid_lost_stock}": each car is written from the line for one of our cars, and the line for when they arrive says when they arrive.`,
};

/** A section's conversations, newest first: waiting on us or answered, in the last 30 days. */
const recent = (source) => listItems({ source, states: ['awaiting', 'answered'], maxAgeHours: 24 * 30, limit: 60 });
/**
 * Where one of a section's messages is shown: first the conversations with an open follow-up
 * whose message it is, each with the follow-up in hand as the Follow-ups list opens it (the newest
 * due first), then the section's newest conversations.
 */
function forMessage(section, part) {
  const due = openFollowUps().filter((r) => r.template === part).slice(0, 60)
    .map((r) => itemFromKey(r.item_key, { followUp: r.id })).filter((i) => i?.followUp && i.section === section);
  const keys = new Set(due.map((i) => i.itemKey));
  return [...due, ...recent(section).filter((i) => !keys.has(i.itemKey))];
}
/** Imports conversations that are not emails: where the enquiry messages are offered. */
const importsTexts = () => recent('importquery').filter((i) => i.channel !== 'email');
/** Dashboard conversations about a car of ours: where the blocks are added under a reply. */
const withCar = () => recent('dashboard').filter((i) => carInHand(i).v);
/** The orders listed in Auction, newest first, each as the page opens it. */
const newestOrders = () => [...orderRows()].sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0)).slice(0, 60).map((r) => itemFromKey(r.key)).filter(Boolean);

const messageText = async (o, type, now) => (await composeMessage(o, type, { now })).text;
/** A card's name and car, as the conversation's row in the list gives them: an auction order's row carries its own. */
const nameOf = (item) => (item.order ? item.orderRow.name : displayName(item));
const carOf = (item) => (item.order ? item.orderRow.car : rowCar(item));
/** The first reply to an import enquiry: the message, and the lines always added under it. */
const askText = (item) => { const { message, closing } = askParts(wantedFrom(item)); return [message, closing].filter(Boolean).join('\n\n'); };

/** The invitation for one customer, with the link their reply carries, and which first and last lines it shows. */
function inviteCard(item) {
  const { far, link } = carInHand(item);
  return { text: inviteBlock(link, { online: far }), note: `${far ? VIDEO_LINE : VISIT_LINE} ${TEXT_TAIL}` };
}

/** The price reply for one customer's car, and which first line it shows. */
function priceCard(item) {
  const c = carInHand(item);
  const text = priceBlock({ vehicle: c.v, inspectionUrl: c.booking, online: c.far });
  return { text, note: inclusionsSentence(c.v) ? INCLUDED_LINE : NOTHING_INCLUDED_LINE };
}

/**
 * "Car found, full" (lot_offer) as a preview shows it, as it reads for a car found in the live
 * auction, which a preview never reads: its opening (offerOpening) with that car as blanks, and the
 * offer under it, auction-offer.md with blanks (blankOfferBlock). note: what the card says of its
 * bid sentence; for "Car found, full" itself, that the offer is another part's words.
 */
function offerPreview(o, note = BID_LINES) {
  return { text: [offerOpening(o), blankOfferBlock({ depositPaid: o.depositState !== 'NONE' })].filter(Boolean).join('\n\n'), note };
}

/** The words a card is written from with every fact a blank and the @ lines left out: what it shows when it cannot be written. */
const asBlanks = (words) => String(words || '').split('\n').filter((l) => !/^@[a-z0-9_]+:/.test(l)).join('\n')
  .replace(/\{if_[a-z0-9_]+\}/g, '').replace(/\{([a-z0-9_]+)\}/g, (m, k) => `[${k.replace(/_/g, ' ').toUpperCase()}?]`)
  .replace(/\n{3,}/g, '\n\n').trim();

/** Whether the part is offered on a conversation; null when that cannot be read, and the conversation is then passed over (and logged). */
function fitOf(fits, item) {
  try { return !!fits(item); } catch (e) {
    logLine('playbook', `A preview passed over ${item.itemKey}: whether its message is offered there could not be read (${e.message}).`);
    return null;
  }
}

/**
 * Up to three cards: the newest conversations where the part is offered, then the newest others,
 * marked as not offered there. A conversation whose fit cannot be read is passed over.
 */
export function newestFitting(on, fits, write) {
  const offered = [];
  const others = [];
  for (const item of on) {
    if (offered.length >= SHOWN) break;
    const fit = fitOf(fits, item);
    if (fit === null) continue;
    if (fit) offered.push(item);
    else if (others.length < SHOWN) others.push(item);
  }
  return [...offered.map((item) => ({ item, fits: true })), ...others.slice(0, SHOWN - offered.length).map((item) => ({ item, fits: false }))]
    .map((c) => ({ ...c, write: () => write(c.item) }));
}

/** The auction file's short pieces: each message they go into, on the newest order it is offered to and not shown already. */
function pieceCards(orders, now) {
  const used = new Set();
  return Object.entries(PIECES_IN).map(([type, note]) => {
    const offered = orders.find((i) => !used.has(i) && fitOf((x) => messagesFor(x.order).includes(type), i));
    const item = offered || orders.find((i) => !used.has(i)) || orders[0];
    used.add(item);
    const write = async () => { const m = await composeMessage(item.order, type, { now }); return { text: m.text, note: note(m.values) }; };
    return { item, fits: !!offered, write, words: template(AUCTION)?.sections?.[type] };
  });
}

/**
 * How a part is shown: `on`, the conversations to show it on, newest first (read outside the
 * preview), and `cards(on)`, the cards: [{ item, fits, write, words }], worked out inside the
 * preview, so a changed @fits line counts. `write()` gives the text, or { text, note }; `words`,
 * when given, are what the card shows as blanks if it cannot be written. null for the Dashboard's
 * short pieces, which go only into follow-ups.
 */
function showing(w, part, now) {
  const section = SECTION_OF[w.name];
  if (section) {
    return part ? { on: () => forMessage(section, part), cards: (on) => newestFitting(on, (i) => templatesFor(i).some((t) => t.id === part), async (i) => (await composeSectionTemplate(i, part, { now })).text) } : null;
  }
  if (w.name === AUCTION) {
    if (!part) return { on: newestOrders, cards: (on) => pieceCards(on, now) };
    // A car filled in by hand is how "Car found, full" is written when the live auction is not read.
    const type = part === 'lot_offer_manual' ? 'lot_offer' : part;
    if (!ENQUIRY_MESSAGES.includes(type)) return { on: newestOrders, cards: (on) => newestFitting(on, (i) => messagesFor(i.order).includes(type), (i) => messageText(i.order, type, now)) };
    const write = part === 'lot_offer' ? (i) => offerPreview(enquiryOrder(i, { now }), OFFER_BELOW) : (i) => messageText(enquiryOrder(i, { now }), type, now);
    return { on: importsTexts, cards: (on) => newestFitting(on, (i) => enquiryTemplates(i).some((t) => t.id === type), write) };
  }
  // The blocks code adds under a reply, as a reply about each car carries them.
  if (w.name === 'price-reply.md') {
    return { on: withCar, cards: (on) => newestFitting(on, (i) => !carInHand(i).gone, priceCard) };
  }
  if (w.name === 'first-reply.md') {
    return { on: withCar, cards: (on) => newestFitting(on, () => true, (i) => { const c = carInHand(i); return standardBlock({ vehicleUrl: c.v.url && !c.gone ? c.v.url : '' }); }) };
  }
  if (w.name === 'inspection-invite.md') return { on: withCar, cards: (on) => newestFitting(on, (i) => !!carInHand(i).booking, inviteCard) };
  // The two blocks the enquiry messages hold: the offer of a car found in the live auction, and the
  // first reply to an import enquiry, written where they have not yet said what they want.
  if (w.name === 'auction-offer.md') {
    return { on: importsTexts, cards: (on) => newestFitting(on, (i) => enquiryTemplates(i).some((t) => t.id === 'lot_offer'), (i) => offerPreview(enquiryOrder(i, { now }))) };
  }
  if (w.name === 'import-ask.md') return { on: importsTexts, cards: (on) => newestFitting(on, (i) => enquiryStage(i).code === 'enquiry_ask', askText) };
  return null;
}

const textOf = (made) => (typeof made === 'string' ? made : made.text);

/**
 * The cards written, one at a time, and what the preview says of them: { previews: [{ key, name,
 * section, car, text, fits, note? }], none? }, each card named as the conversation's row in the
 * list names it. A card that cannot be written shows its words with every fact a blank, and says
 * so: one conversation never stops the others. `inUse(write)` writes a card with the wording in
 * use instead (null when the words are the wording in use): a card that reads the same with both
 * says it does not use the lines changed, and when every card does, `none` says so. With no card
 * at all (every conversation was passed over), `none` says why.
 */
export async function previewCards(cards, words, inUse = null) {
  const previews = [];
  let unused = 0;
  for (const card of cards) {
    let made;
    let same = false;
    try {
      made = await card.write();
      if (inUse) {
        try { same = textOf(await inUse(card.write)) === textOf(made); } catch { /* not written with the wording in use just now: not compared */ }
      }
    } catch (e) {
      logLine('playbook', `A preview could not be written for ${card.item.itemKey}: ${e.message}`);
      made = { text: asBlanks(card.words ?? words), note: NOT_WRITTEN };
    }
    const { text, note } = typeof made === 'string' ? { text: made } : made;
    const said = [same ? UNUSED : '', note || ''].filter(Boolean).join(' ');
    if (same) unused++;
    previews.push({ key: card.item.itemKey, name: nameOf(card.item), section: card.item.section, car: carOf(card.item), text: restore(text, card.item.lead), fits: card.fits, ...(said ? { note: said } : {}) });
  }
  if (!previews.length) return { previews, none: PASSED_OVER };
  return unused === previews.length ? { previews, none: NONE_USES } : { previews };
}

/**
 * Shows changed words for one part on three conversations, before they are saved: { previews:
 * [{ key, name, section, car, text, fits, note? }] }, with `none` saying why when there is nothing
 * to show them on, or that none of the cards shows the change; or { status, error } with the words
 * to show. The words are checked as a save checks them, and nothing is saved. Each message is
 * written by its own code with the conversation's facts, word for word, with no AI, inside a
 * preview (withPreview in src/wording.js): only that call chain reads the changed words, and the
 * auction feed, the website's list and a car's photos answer as unreachable, so their figures are
 * the blanks the message would have. Each card is written with the wording in use too, in a
 * preview of its own, to tell whether it shows the change. `note` says which of a part's lines
 * chosen by circumstance the card shows, and when it does not use the lines changed. A voice rule
 * has no preview.
 */
export async function previewWording({ name, part, text, now = Date.now() } = {}) {
  if (fileOf(String(name ?? ''))?.kind === 'voice') return VOICE_HAS_NONE;
  const c = await checked({ name, part, text });
  if (c.error) return c;
  const plan = showing(c.w, c.own.part, now);
  if (!plan) return { previews: [], none: SHORT_PIECES };
  const on = plan.on();
  if (!on.length) return { previews: [], none: NO_CONVERSATION };
  const used = listed(c.w, c.own, c.headed).text;
  const inUse = c.words === used ? null : (write) => withPreview({ name: c.w.name, part: c.own.part, text: used }, write);
  return withPreview({ name: c.w.name, part: c.own.part, text: c.words }, () => previewCards(plan.cards(on), c.words, inUse));
}
