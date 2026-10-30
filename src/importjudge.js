// Reads an ordinary dashboard enquiry as an import enquiry when the customer's own words say so.
//
// The dashboard keeps import and auction leads on a list of their own, and the website's import
// form is read as such (src/imports.js). A customer who writes in from the contact page, or
// texts, about a car we bring from Japan has neither: until now their reply was written as if
// they asked about a car on the yard. Three signs are read, in this order:
//   code   a model code from the website's import-eligible list (JZS161, GDH206);
//   model  a make and model from that list, when no such car is on the yard;
//   words  the words themselves: "can you import", "from Japan", JDM, auction, landed cost.
// A customer asking about a particular car in stock is never read this way. The owner can say
// otherwise either way on the page (item_rulings in src/db.js), and that ruling wins.

import { loadEligibleModels, modelCodesIn, modelsIn } from './eligible.js';
import { vehiclesOnYard } from './db.js';

/**
 * Words that ask for a car found and brought from Japan. "Is this one imported?" about a car on
 * the yard is not among them: the past tense, and "imported" on its own, are left out.
 */
export const IMPORT_WORDS = /(\b(?:can|could|would|do|will|able to) (?:you|u) (?:please |also )?(?:import|source|find|get|bring)\b|\bimport(?:ing)? (?:a|an|one|me|for me|this|that|the|from)\b|\b(?:looking|want|wanting|like|keen) to import\b|\bimport (?:request|enquiry|inquiry|query|order|option)\b|\bjdm\b|(?<!\b(?:imported|came|brought|shipped|originally|was|is) )\bfrom japan\b|\bjapan(?:ese)? (?:auction|import|domestic)\b|\bauctions?\b|\blanded (?:price|cost)\b|\bcompliance\b|\bsevs\b|\bsourc(?:e|ing) (?:a|an|one|me|for me)\b)/i;

/** The car a list entry names, for the import flow and the page. */
const carOf = (m) => (m ? { make: m.make, model: m.model, modelCode: m.modelCode || '', title: m.title || [m.make, m.model, m.modelCode].filter(Boolean).join(' '), url: m.url || '' } : null);

const QUOTE_MAX = 60;

/**
 * The customer's sentence that holds the import words, for the page to quote: as they wrote it,
 * spaces made single, without a closing full stop (a question or exclamation mark stays). A sentence
 * longer than 60 characters is cut around the words, between words, with "…" where it was cut.
 */
function quoteOf(text) {
  const m = IMPORT_WORDS.exec(text);
  if (!m) return '';
  // The sentence ends at a full stop, question or exclamation mark followed by a space, or at a line's end.
  const ends = [...text.matchAll(/[.!?](?=\s)|\n/g)].map((e) => e.index);
  const from = ends.filter((i) => i < m.index).reduce((a, i) => Math.max(a, i + 1), 0);
  const stop = ends.find((i) => i >= m.index + m[0].length);
  const to = stop === undefined ? text.length : text[stop] === '\n' ? stop : stop + 1;
  const sentence = text.slice(from, to).trim().replace(/\s+/g, ' ').replace(/\.$/, '');
  if (sentence.length <= QUOTE_MAX) return sentence;
  // The words again, in the sentence as it is quoted.
  const w = IMPORT_WORDS.exec(sentence);
  if (!w) return sentence.slice(0, QUOTE_MAX - 1).trimEnd() + '…';
  const at = w.index;
  const len = w[0].length;
  // Room either side of the words, half each, with the two "…" counted; a side with less gives the rest to the other.
  const room = Math.max(0, QUOTE_MAX - len - 2);
  let before = Math.min(at, Math.floor(room / 2));
  const after = Math.min(sentence.length - at - len, room - before);
  before = Math.min(at, room - after);
  let start = at - before;
  let end = at + len + after;
  // Cut between words: a cut inside a word moves to the space beside it, toward the import words.
  if (start > 0 && sentence[start - 1] !== ' ') { const sp = sentence.indexOf(' ', start); start = sp === -1 || sp >= at ? at : sp + 1; }
  if (end < sentence.length && sentence[end] !== ' ') { const sp = sentence.lastIndexOf(' ', end); end = sp <= at + len ? at + len : sp; }
  return (start > 0 ? '…' : '') + sentence.slice(start, end).trim() + (end < sentence.length ? '…' : '');
}

/**
 * Judges the customer's own words. Returns what was read, or null for an ordinary enquiry:
 *   { sign: 'code' | 'model' | 'words', car: { make, model, modelCode, title, url } | null, why, quote? }
 * `quote`, for the words sign only: the customer's sentence that holds them (quoteOf).
 * `texts`: the website enquiry and their texts, oldest first. With `stockAttached` (the enquiry
 * names a car in stock) nothing is read: they are asking about that car.
 */
export function judgeImport(texts, { stockAttached = false, now = Date.now() } = {}) {
  if (stockAttached) return null;
  const text = (Array.isArray(texts) ? texts : [texts]).map((t) => String(t || '')).filter(Boolean).join('\n');
  if (!text.trim()) return null;
  let models = [];
  try { ({ models } = loadEligibleModels(now)); } catch { models = []; }
  const words = IMPORT_WORDS.test(text);

  if (models.length) {
    const code = modelCodesIn(text, models).known[0];
    if (code) {
      const m = code.models[0];
      return { sign: 'code', car: carOf(m), why: `the model code ${code.code} is on our import list (${carOf(m).title})` };
    }
    // A make and model from the list, named together: on their own, a model name can be an
    // ordinary word ("Note", "March"), so the make must be there too.
    const fam = modelsIn(text, models)[0];
    if (fam && fam.score >= 3) {
      const onYard = vehiclesOnYard(fam.make, fam.model).length > 0;
      if (!onYard) return { sign: 'model', car: carOf(fam.best), why: `the ${fam.make} ${fam.model} is a model we import to order, and none is on the yard` };
      if (words) return { sign: 'words', car: carOf(fam.best), why: `they ask for a ${fam.make} ${fam.model} from Japan`, quote: quoteOf(text) };
      return null;
    }
  }
  if (words) return { sign: 'words', car: null, why: 'they ask for a car found in Japan', quote: quoteOf(text) };
  return null;
}

/**
 * The car the customer's words name from the import list, with no other test: for a conversation
 * the owner has put in Auction or Import Query, where it is an import enquiry whatever the words.
 * A model code first, then a make and model named together. Null when no car from the list is named.
 */
export function carIn(texts, { now = Date.now() } = {}) {
  const text = (Array.isArray(texts) ? texts : [texts]).map((t) => String(t || '')).filter(Boolean).join('\n');
  if (!text.trim()) return null;
  let models = [];
  try { ({ models } = loadEligibleModels(now)); } catch { models = []; }
  if (!models.length) return null;
  const code = modelCodesIn(text, models).known[0];
  if (code) return carOf(code.models[0]);
  const fam = modelsIn(text, models)[0];
  return fam && fam.score >= 3 ? carOf(fam.best) : null;
}
