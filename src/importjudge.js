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

/**
 * Judges the customer's own words. Returns what was read, or null for an ordinary enquiry:
 *   { sign: 'code' | 'model' | 'words', car: { make, model, modelCode, title, url } | null, why }
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
      if (words) return { sign: 'words', car: carOf(fam.best), why: `they ask for a ${fam.make} ${fam.model} from Japan` };
      return null;
    }
  }
  if (words) return { sign: 'words', car: null, why: 'they ask for a car found in Japan' };
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
