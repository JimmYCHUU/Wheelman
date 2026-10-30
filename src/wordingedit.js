// What the Playbook's routes call for templates and voice rules (src/playbookapi.js): each file's
// parts with the wording in use, every saved version of a part, a save, and a preview. A save is a
// new row of playbook_versions, laid over its part of the file whenever the file is read
// (src/wording.js); the file is never written, and no saved version is ever changed or removed. A
// save that would break its file, or let go of a rule the wording keeps, is refused in words. A
// preview shows changed words on three conversations, written by the code that writes each message,
// with no AI, and saves nothing.
//
// src/wording.js never imports this module, so the overlay has no cycle through the modules here.

import { config } from './config.js';
import { WORDING, PART_HEADER, fileParts, withPreview } from './wording.js';
import { addVersion, versionsOf } from './db.js';
import { template, fill, fillParts } from './templates.js';
import { SECTION_FILES, checkTemplates, templatesFor, composeSectionTemplate } from './sectiontemplates.js';
import { ENQUIRY_MESSAGES, composeMessage, enquiryOrder, enquiryTemplates } from './ordermessages.js';
import { MESSAGES, messagesFor, wantedCar } from './orders.js';
import { listItems, orderRows, itemFromKey } from './items.js';
import { priceBlock } from './pricereply.js';
import { standardBlock, inviteBlock } from './firstreply.js';
import { askParts, wantedFrom, enquiryStage } from './imports.js';
import { inspectionLinks } from './knowledge.js';
import { availability } from './normalize.js';
import { reservedByAnother } from './deal.js';
import { restore, isPlaceholderName } from './redact.js';
import { signedName } from './signature.js';

const LONGEST = 7999; // characters: "keep it under 8,000" is what the refusal says, so 8,000 is refused
const AUCTION = 'auction-messages.md';
const SECTIONS = new Set(Object.values(SECTION_FILES));
const DEPOSIT = '[DEPOSIT LINK?]';
const FACT = /\{[a-z0-9_]+\}/g;
// A short piece, as template() reads one ("@own: This is based on …"), and the line of dashes that
// parts a message from the lines always added under it (import-ask.md, read by askParts in src/imports.js).
const SHORT_PIECE = /^@([a-z0-9_]+):\s*(.+)$/;
const DIVIDER = /^\s*-{3,}\s*$/;
const NOT_LISTED = { status: 404, error: 'That wording is not in the Playbook.' };

const fileOf = (name) => WORDING.find((w) => w.name === name) || null;

/** A part's label: its @label, else the auction message's name, else the heading, the file's label, or "The short pieces". */
function labelOf(w, part, text, headed) {
  if (!part) return w.kind === 'template' && headed ? 'The short pieces' : w.label;
  if (w.kind === 'voice') return part;
  const own = text.match(/^@label:\s*(.+)$/m);
  if (own) return own[1].trim();
  return (w.name === AUCTION && MESSAGES[part]) || part;
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
    part, label: labelOf(w, part, text, headed), group: groupOf(w, part), text, fileText,
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

/** The names of the short pieces in a part ("@own: …"), as template() reads them: a name with words after it. */
const pieceNames = (text) => text.split('\n').map((l) => (l.match(SHORT_PIECE) || [])[1]).filter(Boolean);
/** "a", "a and b", "a, b and c". */
const andList = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/**
 * Why words would break their part, in the words to show; '' when they would not. Every line is
 * the file's own kind of line; the three section files' own checks (checkTemplates) name no new
 * problem with the words laid over; any other template part uses only the facts its file uses; the
 * short pieces code reads by name, and the line of dashes, stay; and the deposit link stays a blank
 * where the file has it.
 */
function refusal(w, own, words) {
  if (!words) return 'Write the wording first.';
  if (words.length > LONGEST) return 'That is too long: keep it under 8,000 characters.';
  const lines = words.split('\n');
  if (w.kind === 'template') {
    if (lines.some((l) => PART_HEADER.test(l))) return 'A line like ===== name ===== starts a new message. Add a new message in the file itself.';
    if (lines.some((l) => l.startsWith('#'))) return 'A line starting with # is a note and is never sent. Take the # off, or remove the line.';
    if (SECTIONS.has(w.name) && own.part) {
      const now = checkTemplates();
      const laid = withPreview({ name: w.name, part: own.part, text: words }, () => checkTemplates()).filter((p) => !now.includes(p));
      if (laid.length) return [...new Set(laid.map(plainProblem))].join(' ');
    } else {
      const used = new Set(fileParts(w.name).flatMap((p) => p.text.match(FACT) || []));
      const stray = (words.match(FACT) || []).find((f) => !used.has(f));
      if (stray) return `${stray} is not a fact Wheelman fills in here.`;
    }
    // The short pieces (part '', before any message) are read by their names; a message's own @
    // lines are its details, which its file's checks govern.
    if (!own.part) {
      const kept = new Set(pieceNames(words));
      const lost = [...new Set(pieceNames(own.text))].filter((k) => !kept.has(k)).map((k) => `@${k}:`);
      if (lost.length === 1) return `Keep the line that starts ${lost[0]} — Wheelman reads it by that name when it writes the message.`;
      if (lost.length) return `Keep the lines that start ${andList(lost)} — Wheelman reads them by those names when it writes the message.`;
    }
    if (own.text.split('\n').some((l) => DIVIDER.test(l)) && !lines.some((l) => DIVIDER.test(l))) {
      return 'Keep the line of dashes (---): Wheelman writes the message above it, and always ends with the lines below it.';
    }
  } else if (lines.some((l) => l.startsWith('## '))) {
    return 'A line starting with ## starts a new section. Add a new section in the file itself.';
  }
  if (own.text.includes(DEPOSIT) && !words.includes(DEPOSIT)) return 'The deposit link stays a blank: keep [DEPOSIT LINK?] in this message.';
  return '';
}

/**
 * The file and part words are for, with the words trimmed at their ends: { w, own, words, headed },
 * or { status, error } when the Playbook does not list them or they would break the file. Nothing
 * is saved here (a preview checks words the same way).
 */
function checked({ name, part, text }) {
  const w = fileOf(String(name ?? ''));
  const parts = w ? fileParts(w.name) : [];
  const own = parts.find((p) => p.part === String(part ?? ''));
  if (!own) return NOT_LISTED;
  const words = String(text ?? '').replace(/\r/g, '').trim();
  const why = refusal(w, own, words);
  return why ? { status: 400, error: why } : { w, own, words, headed: parts.some((p) => p.part) };
}

/**
 * Saves wording for one part of a file in the Playbook, as a new version used from the next
 * suggestion. The same words as those in use add nothing. Returns { part, unchanged }, the part as
 * wordingParts lists it, or { status, error } with the words to show.
 */
export function saveWording({ name, part, text, now = Date.now() } = {}) {
  const c = checked({ name, part, text });
  if (c.error) return c;
  const unchanged = listed(c.w, c.own, c.headed).text === c.words;
  if (!unchanged) addVersion({ kind: c.w.kind, name: c.w.name, part: c.own.part, text: c.words, base: c.own.text, at: now });
  return { part: listed(c.w, c.own, c.headed), unchanged };
}

// ---- a preview: changed words on three conversations, before they are saved ----------------------

const VOICE_HAS_NONE = { status: 400, error: 'Voice rules have no preview: only the AI can show their effect.' };
const NO_CONVERSATION = 'There is no conversation in this section to show it on yet.';
const SHORT_PIECES = 'The short pieces go into other messages as Wheelman writes them, so there is no conversation to show them on by themselves.';
const SHOWN = 3;
const SECTION_OF = Object.fromEntries(Object.entries(SECTION_FILES).map(([section, file]) => [file, section]));

/** A section's conversations, newest first: waiting on us or answered, in the last 30 days. */
const recent = (source) => listItems({ source, states: ['awaiting', 'answered'], maxAgeHours: 24 * 30, limit: 60 });
/** Imports conversations that are not emails: where the enquiry messages are offered. */
const importsTexts = () => recent('importquery').filter((i) => i.channel !== 'email');
/** Dashboard conversations about a car of ours: where the blocks are added under a reply. */
const withCar = () => recent('dashboard').filter((i) => carIn(i));
/** The orders listed in Auction, newest first, each as the page opens it. */
const newestOrders = () => [...orderRows()].sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0)).slice(0, 60).map((r) => itemFromKey(r.key)).filter(Boolean);

const carIn = (item) => item.vehicles?.[0] || null;
/** The car can no longer be sold to this customer: sold, or held for someone else. */
const gone = (item) => { const v = carIn(item); return !v || availability(v).code === 'sold' || reservedByAnother(v, item.deal); };
/** The car's in-person booking link; '' when it has no page. */
const onsiteLink = (item) => (carIn(item)?.url ? inspectionLinks(carIn(item)).onsite : '');
/** The booking link a reply about the car carries: only while it is at the showroom for them. */
const bookingLink = (item) => (!gone(item) && availability(carIn(item)).code === 'available' ? onsiteLink(item) : '');
const messageText = async (o, type, now) => (await composeMessage(o, type, { now })).text;

/** The customer's name as the list shows it: from the record, else as they signed, else their number. */
function nameOf(item) {
  if (item.orderRow) return item.orderRow.name;
  const l = item.lead;
  const full = [l?.first_name, l?.last_name].filter(Boolean).join(' ').trim() || item.conversation?.customer_name || '';
  return (full && !isPlaceholderName(full) ? full : signedName(item.timeline)) || item.phone || '';
}

/** The car a conversation is about, as its row in the list names it. */
const carLine = (item) => (item.order ? item.orderRow?.car : item.mail ? item.mail.car || item.mail.subject
  : carIn(item)?.title || item.marketplace?.listingTitle || (item.imports ? wantedFrom(item).car : '')) || '';

/**
 * "Car found, full" (lot_offer) as a preview shows it: its opening lines and the offer under them
 * (auction-offer.md), as they read for a car found in the live auction. A preview never reads the
 * auction, so that car and its figures are blanks, and the deposit link stays one.
 */
function offerWithBlanks(o) {
  const opening = fillParts(template(AUCTION)?.sections?.lot_offer || '', { lot_name: wantedCar(o.wanted) || 'vehicle', auction_when: 'in [WHICH AUCTION?]' });
  const offer = template('auction-offer.md');
  const block = offer ? fillParts(offer.text, {
    vehicle_lines: '[WHICH CAR?]\n[KM?]\nAuction Grade [GRADE?]', lot_url: '[LINK?]', bid: '[BID?]', total: '[LANDED TOTAL?]', decides: null,
    bid_sentence: fill(offer.snippets.suggested || '', { bid: '[BID?]' }), if_deposit: o.depositState === 'NONE', sender: config.firstReplySender,
  }) : '';
  return [opening, block].filter(Boolean).join('\n\n');
}

/**
 * How a part is shown: `on`, the conversations to show it on, newest first (read outside the
 * preview); `fits`, whether it is offered on one; `write`, what it reads there (both inside the
 * preview, so a changed @fits line counts). null for the short pieces, which go into other
 * messages and have no conversation of their own.
 */
function showing(w, part, now) {
  const section = SECTION_OF[w.name];
  if (section) return part ? { on: () => recent(section), fits: (i) => templatesFor(i).some((t) => t.id === part), write: async (i) => (await composeSectionTemplate(i, part, { now })).text } : null;
  if (w.name === AUCTION) {
    if (!part) return null;
    // A car filled in by hand is how "Car found, full" is written when the live auction is not read.
    const type = part === 'lot_offer_manual' ? 'lot_offer' : part;
    if (!ENQUIRY_MESSAGES.includes(type)) return { on: newestOrders, fits: (i) => messagesFor(i.order).includes(type), write: (i) => messageText(i.order, type, now) };
    const write = part === 'lot_offer' ? (i) => offerWithBlanks(enquiryOrder(i, { now })) : (i) => messageText(enquiryOrder(i, { now }), type, now);
    return { on: importsTexts, fits: (i) => enquiryTemplates(i).some((t) => t.id === type), write };
  }
  if (w.name === 'price-reply.md') return { on: withCar, fits: (i) => !gone(i), write: (i) => priceBlock({ vehicle: carIn(i), inspectionUrl: bookingLink(i) }) };
  if (w.name === 'first-reply.md') return { on: withCar, fits: () => true, write: (i) => standardBlock({ vehicleUrl: gone(i) ? '' : carIn(i).url || '' }) };
  if (w.name === 'inspection-invite.md') return { on: withCar, fits: (i) => !!bookingLink(i), write: (i) => inviteBlock(onsiteLink(i)) };
  // The two blocks the enquiry messages hold: the offer of a car found in the live auction, and the
  // first reply to an import enquiry, written where they have not yet said what they want.
  if (w.name === 'auction-offer.md') return { on: importsTexts, fits: (i) => enquiryTemplates(i).some((t) => t.id === 'lot_offer'), write: (i) => offerWithBlanks(enquiryOrder(i, { now })) };
  if (w.name === 'import-ask.md') {
    return { on: importsTexts, fits: (i) => enquiryStage(i).code === 'enquiry_ask', write: (i) => { const { message, closing } = askParts(wantedFrom(i)); return [message, closing].filter(Boolean).join('\n\n'); } };
  }
  return null;
}

/** Up to three conversations: the newest where the part is offered, then the newest others, marked as not offered there. */
async function shownOn({ on, fits, write }) {
  const offered = [];
  const others = [];
  for (const item of on) {
    if (offered.length >= SHOWN) break;
    if (fits(item)) offered.push(item);
    else if (others.length < SHOWN) others.push(item);
  }
  const picked = [...offered.map((item) => [item, true]), ...others.slice(0, SHOWN - offered.length).map((item) => [item, false])];
  const out = [];
  for (const [item, offeredHere] of picked) {
    out.push({ key: item.itemKey, name: nameOf(item), section: item.section, car: carLine(item), text: restore(await write(item), item.lead), fits: offeredHere });
  }
  return out;
}

/**
 * Shows changed words for one part on three conversations, before they are saved: { previews:
 * [{ key, name, section, car, text, fits }] }, with `none` saying why when there is nothing to show
 * them on; or { status, error } with the words to show. The words are checked as a save checks
 * them, and nothing is saved. Each message is written by its own code with the conversation's
 * facts, word for word, with no AI, inside a preview (withPreview in src/wording.js): only that
 * call chain reads the changed words, and the auction feed and the website's list answer as
 * unreachable, so their figures are the blanks the message would have. A voice rule has no preview.
 */
export async function previewWording({ name, part, text, now = Date.now() } = {}) {
  if (fileOf(String(name ?? ''))?.kind === 'voice') return VOICE_HAS_NONE;
  const c = checked({ name, part, text });
  if (c.error) return c;
  const plan = showing(c.w, c.own.part, now);
  if (!plan) return { previews: [], none: SHORT_PIECES };
  const on = plan.on();
  if (!on.length) return { previews: [], none: NO_CONVERSATION };
  const previews = await withPreview({ name: c.w.name, part: c.own.part, text: c.words }, () => shownOn({ ...plan, on }));
  return { previews };
}
