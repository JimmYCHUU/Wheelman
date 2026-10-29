// The enquiry type: one property of a conversation. A stock enquiry is answered from the cars we
// have (in Dashboard, or Marketplace for a Facebook chat), an import enquiry with eligibility,
// landed cost and the deposit (in Imports), and an auction order has no type to choose. The More
// menu's choices, the reason line in the box, Where it is listed in the Customer tab, and the
// requests that change the type and put it back. Pure functions (no DOM, no globals), which the
// tests import in Node.
//
// A reading never moves a conversation by itself (Ruling, 28 Oct 2026): the reason line says why it
// was read as an import enquiry, and Import enquiry in More moves it. Nothing moves into
// Marketplace but a Facebook chat going home, and nothing is moved into Auction from here.
import { sectionName } from './model.js';
import { replyChannel } from './channel.js';

const LABEL = { stock: 'Stock enquiry', import: 'Import enquiry', order: 'Auction order' };
// Each section's own type: the one its head line does not need to name.
const OWN = { dashboard: 'stock', marketplace: 'stock', importquery: 'import', auction: 'order' };

const facebook = (item) => replyChannel(item) === 'facebook';
/** A Dashboard text (a conversation or a lead): the one kind of conversation with a ruling. */
const ruled = (item) => /^[cl]:/.test(String(item.key || ''));

/**
 * Why a conversation in Dashboard was read as an import enquiry, while Jim has not said either way
 * (no ruling) and has not moved it there: the customer's own words when they are what was read,
 * else the reason Wheelman read; else the AI's guess; else ''.
 */
function reasonOf(item) {
  if (item.ruling || item.section !== 'dashboard' || item.moved) return '';
  const j = item.judged;
  if (j) return 'Read as an import enquiry: ' + (j.quote ? 'they asked “' + j.quote + '”' : j.why) + '. Choose Import enquiry in More to list it in Imports.';
  if (item.draft && item.draft.aiImport) return 'The AI thought this might be an import enquiry: a car to find in Japan, not one on the yard.';
  return '';
}

/**
 * { type, label, reason, choices } for a conversation. type: 'order', else 'import' when it is
 * answered the import way or listed in Imports, else 'stock'. choices: the More menu's radio items,
 * shown first under "Enquiry type", each with its type (the page adds what it runs); none for an
 * order. Not a customer is never the one checked: it dismisses.
 */
export function typeView(item) {
  if (item.order) return { type: 'order', label: LABEL.order, reason: '', choices: [] };
  const type = item.isImport || item.section === 'importquery' ? 'import' : 'stock';
  return {
    type,
    label: LABEL[type],
    reason: reasonOf(item),
    choices: [
      { type: 'stock', label: LABEL.stock, hint: 'Answered from the cars we have · ' + (facebook(item) ? 'Marketplace' : 'Dashboard'), checked: type === 'stock' },
      { type: 'import', label: LABEL.import, hint: 'Answered with eligibility, landed cost and the deposit · Imports', checked: type === 'import' },
      { type: 'notcustomer', label: 'Not a customer', hint: 'Dismissed, with Undo. It stays under All.', checked: false },
    ],
  };
}

/** The type's name for the start of the head line, when it is not the section's own; else ''. */
export function typeLine(item) {
  const { type, label } = typeView(item);
  return OWN[item.section] === type ? '' : label;
}

/** The words under "Where it is listed" in the Customer tab, or '' when there is nothing to say. */
export function listedWords(item) {
  if (item.listed === 'moved') return 'You moved it to ' + sectionName(item.section) + '. It came in as ' + sectionName(item.home) + ', and the reply still goes out the way it came in.';
  if (item.listed === 'imports') return "Listed in Imports: it came from the dashboard's Imports list.";
  if (item.listed === 'order') return 'Listed in Auction: this customer has an auction order under way.';
  if (item.ruling && item.ruling.kind === 'general') return 'You said this is not an import enquiry. The reply is written the ordinary way.';
  if (item.ruling && item.ruling.kind === 'import') return 'You said this is an import enquiry. The reply is written the import way.';
  if (item.judged) return 'Wheelman reads this as an import enquiry: ' + item.judged.why + '.';
  return '';
}

/**
 * The request that makes it this type ('import' or 'stock'): { path, body }, or null when nothing
 * would change. It goes to Imports as an import enquiry; as a stock enquiry, a Facebook chat goes
 * home to Marketplace and anything else to Dashboard. A Dashboard text is ruled and moved in one
 * request; any other conversation is moved.
 */
export function typeRequest(item, type) {
  if (!item || item.order || (type !== 'import' && type !== 'stock')) return null;
  const section = type === 'import' ? 'importquery' : facebook(item) ? 'marketplace' : 'dashboard';
  const path = '/api/items/' + item.key;
  if (ruled(item)) {
    const kind = type === 'import' ? 'import' : 'general';
    // Already that type: ruled so, or read so with no ruling.
    const already = item.ruling ? item.ruling.kind === kind : typeView(item).type === type;
    return section === item.section && already ? null : { path: path + '/ruling', body: { kind, section } };
  }
  return section === item.section ? null : { path: path + '/move', body: { section } };
}

/** The request that puts it back, made from the conversation before the change: its ruling (none: '') and its section. */
export function typeUndo(item) {
  const path = '/api/items/' + item.key;
  if (ruled(item)) return { path: path + '/ruling', body: { kind: item.ruling ? item.ruling.kind : '', section: item.section } };
  return { path: path + '/move', body: { section: item.section } };
}
