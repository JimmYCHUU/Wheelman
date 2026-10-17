// "Which message?" in Dashboard, Marketplace and Import Query: the owner's templates for each kind
// of conversation (voice/dashboard-messages.md for texts, voice/marketplace-messages.md for
// Facebook chats, voice/importquery-messages.md for emails), the ones that fit this conversation
// offered with the best fit first, and the one picked filled in with this conversation's facts.
//
// Which templates fit is read from the conversation with no AI: what the customer asked about
// (classify in src/situations.js), whether this is our first reply, whether they bought from us,
// whether they are far away, whether they named a figure or are walking away, and the state of
// the car. Each template says in its @fits, @needs and @not lines which of these it is for.
// Auction orders and the enquiries in Auction have their own list (src/ordermessages.js).

import { config } from './config.js';
import { template } from './templates.js';
import { availability } from './normalize.js';
import { reservedByAnother } from './deal.js';
import { inspectionLinks } from './knowledge.js';
import { inclusionsSentence, priceBlock } from './pricereply.js';
import { inviteBlock, standardBlock } from './firstreply.js';
import { farAway, SITUATIONS } from './situations.js';
import { priceFigures, PARTING, DECLINED } from './selling.js';
import { topicsIn, researchFor } from './importquery.js';
import { greetingFor } from './checks.js';
import { sydneyHour, sydneyDay } from './time.js';
import { money } from './imports.js';
import { draftFromTemplate } from './templatedraft.js';

/** The template file for each section. A conversation moved to another section gets that section's list. */
export const SECTION_FILES = { dashboard: 'dashboard-messages.md', marketplace: 'marketplace-messages.md', importquery: 'importquery-messages.md' };
const BY_CHANNEL = { sms: 'dashboard', marketplace: 'marketplace', email: 'importquery' };
const IMPORT_FILE = SECTION_FILES.importquery;

/** Everything a template's @fits, @needs and @not may name. */
export const SIGNALS = [
  ...Object.keys(SITUATIONS), 'general',
  'first reply', 'later reply', 'buyer', 'far away', 'their offer', 'parting',
  'car', 'car available', 'car on its way', 'car sold', 'no car', 'any',
  // emails
  'eligibility', 'cost', 'deposit', 'timeline', 'payment', 'warranty', 'compliance_only', 'process', 'availability', 'eligible',
];

/** Every fact a template may use, by file. A {word} outside these is a typing slip. {if_word}
 * keeps its paragraph only when that fact applies (has something in it). */
const CAR_FACTS = ['greeting', 'sign_off', 'thanks', 'car', 'car_link', 'price', 'km', 'where', 'inclusions', 'if_inclusions', 'price_reply', 'invitation',
  'first_reply_block', 'address_block', 'stock_link', 'finance_link', 'warranty_link', 'importing_link', 'if_warranty', 'if_no_warranty', 'sender'];
export const FACTS = {
  'dashboard-messages.md': CAR_FACTS,
  'marketplace-messages.md': CAR_FACTS,
  'importquery-messages.md': ['greeting', 'sign_off', 'model', 'model_page', 'year_range', 'landed_cost', 'deposit', 'if_eligible', 'if_not_listed', 'importing_link', 'eligible_link', 'sender'],
};

const fileFor = (item) => (item.order || item.section === 'auction' ? null : SECTION_FILES[item.section || BY_CHANNEL[item.channel]] || null);
const list = (line) => String(line || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
const customerWords = (item, n = 8) => item.timeline.filter((e) => e.who === 'customer').slice(-n).map((e) => `${e.text || ''} ${e.event || ''}`).join('\n');

/** What the conversation shows, in the words the templates' @fits lines use. No AI, no request. */
export function fitSignals(item) {
  const s = new Set(['any', ...(item.situation?.all || [])]);
  s.add(item.isFirstReply ? 'first reply' : 'later reply');
  if (item.deal) s.add('buyer');
  const v = item.vehicles?.[0];
  if (!v) s.add('no car');
  else {
    s.add('car');
    const code = availability(v).code;
    if (code === 'sold' || reservedByAnother(v, item.deal)) s.add('car sold');
    else if (code === 'available') s.add('car available');
    // Arrived and being prepared, at sea, or in Japan: not to be seen yet. Unknown: neither.
    else if (code !== 'unknown') s.add('car on its way');
  }
  const text = item.pendingText || '';
  if (farAway(customerWords(item), item.lead?.state, item.lead?.signals?.postcode).far) s.add('far away');
  if (priceFigures(text).length) s.add('their offer');
  if (PARTING.test(text) || DECLINED.test(text)) s.add('parting');
  if (fileFor(item) === IMPORT_FILE) {
    for (const t of topicsIn(`${item.mail?.subject || ''}\n${text}`)) s.add(t);
    if (item.mail?.car) s.add('eligible');
  }
  return s;
}

/**
 * The templates that fit this conversation: [{ id, label, best }], the best fit first (the one
 * matching most of what the conversation shows, what they mainly asked about counting double),
 * file order for ties. Empty for an auction order or an enquiry in Auction (they have their own).
 */
export function templatesFor(item) {
  const file = fileFor(item);
  const t = file ? template(file) : null;
  // A customer who asked not to be contacted is offered nothing.
  if (!t || item.state === 'optout') return [];
  const sig = fitSignals(item);
  const out = [];
  for (const id of Object.keys(t.sections)) {
    const m = t.meta?.[id] || {};
    const fits = list(m.fits);
    if (!fits.some((f) => sig.has(f)) || !list(m.needs).every((n) => sig.has(n)) || list(m.not).some((n) => sig.has(n))) continue;
    const score = fits.filter((f) => f !== 'any' && sig.has(f)).length + (fits.includes(item.situation?.primary) ? 1 : 0);
    out.push({ id, label: m.label || id, score });
  }
  out.sort((a, b) => b.score - a.score);
  return out.map((x, i) => ({ id: x.id, label: x.label, best: i === 0 && x.score > 0 }));
}

/**
 * Whether this conversation's section has a template by this name. Any of them may be written,
 * not only the ones offered: one picked earlier still writes after the customer writes again.
 */
export function hasSectionTemplate(item, id) {
  const file = fileFor(item);
  return !!(file && id && template(file)?.sections?.[id]);
}

/** The name of one of this section's templates, as the list shows it; '' when there is no such template. */
export function sectionTemplateLabel(item, id) {
  if (!hasSectionTemplate(item, id)) return '';
  return template(fileFor(item)).meta?.[id]?.label || id;
}

/** The address block without its closing sender line ("Team Carbarn"). */
const withoutSender = (block) => {
  const lines = block.split('\n');
  if (config.firstReplySender && lines[lines.length - 1].trim() === config.firstReplySender.trim()) lines.pop();
  return lines.join('\n').trim();
};

/** Where a car is, in a few words for "It is {where}". */
const WHERE = { available: 'at our Lidcombe showroom', arrived: 'in Australia and being prepared for sale', transit: 'on its way to Australia', japan: 'still in Japan' };

/**
 * One template filled in with this conversation's facts: { text, part, values, tail, facts }.
 * A fact that does not apply is null, so its paragraph is left out (see fillParts).
 */
export async function composeSectionTemplate(item, id, { now = Date.now() } = {}) {
  const file = fileFor(item);
  const t = file ? template(file) : null;
  const part = t?.sections?.[id];
  if (!part) throw new Error(`The template "${id}" is not in voice/${file || 'the template files'}.`);
  const chat = item.channel === 'marketplace';
  const email = item.channel === 'email';
  const site = config.site.baseUrl;
  const again = !chat && !email && item.timeline.some((e) => e.who === 'us' && !e.internal && e.at && sydneyDay(e.at) === sydneyDay(now));
  const name = item.hasName ? ' {{NAME}}' : '';
  const values = {
    greeting: chat ? null : email ? `Hello${name},` : again ? null : `${greetingFor(sydneyHour(now))}${name},`,
    sign_off: chat || (again && !email) ? null : config.signOff,
    thanks: `Thank you for your message${item.hasName ? ', {{NAME}}' : ''}.`,
    sender: config.firstReplySender,
    stock_link: `${site}/used-cars`, finance_link: `${site}/finance`, warranty_link: `${site}/warranty`,
    importing_link: `${site}/how-importing-works`, eligible_link: `${site}/importing`,
  };
  const facts = [];

  if (file !== IMPORT_FILE) {
    const v = item.vehicles?.[0] || null;
    const code = v ? availability(v).code : '';
    const gone = !!v && (code === 'sold' || reservedByAnother(v, item.deal));
    const far = farAway(customerWords(item), item.lead?.state, item.lead?.signals?.postcode).far;
    const links = v?.url ? inspectionLinks(v) : null;
    const booking = v && !gone && code === 'available' && links ? (far ? links.online : links.onsite) : '';
    const inclusions = v ? inclusionsSentence(v) : '';
    const outline = (v?.outline || []).join('\n');
    Object.assign(values, {
      car: v ? v.title || `stock ${v.stockNo}` : null,
      car_link: v?.url && !gone ? v.url : null,
      price: v?.price && !gone ? money(Number(v.price)) : null,
      km: v?.odometer ? `${Number(v.odometer).toLocaleString('en-AU')} km` : null,
      where: v && !gone ? WHERE[code] || null : null,
      inclusions: inclusions || null,
      if_inclusions: !!inclusions,
      price_reply: v && !gone ? priceBlock({ vehicle: v, inspectionUrl: booking, online: far, chat }) : null,
      invitation: booking ? inviteBlock(booking, { online: far, chat }) : null,
      first_reply_block: chat ? null : standardBlock({ vehicleUrl: v?.url && !gone ? v.url : '', inspectionUrl: item.situation?.all?.includes('inspection_booking') ? booking : '', online: far }),
      // The block ends with the sender's line: a sign-off, so only on the first message of the day.
      address_block: again ? withoutSender(standardBlock({})) : standardBlock({}),
      if_warranty: /extended warranty|5[- ]year/i.test(outline),
      if_no_warranty: !!v && !/extended warranty|5[- ]year/i.test(outline),
    });
    if (v) facts.push(`The car: ${v.title}${v.stockNo ? `, stock ${v.stockNo}` : ''}, ${availability(v).text}`);
  } else {
    // An import enquiry: the model they asked about, as our website lists it. None found, the
    // answer is still given, with blanks to fill in, unless they named a code that is not listed.
    const research = await researchFor(item, { now });
    const m = research.models?.[0] || null;
    const unknown = research.asked?.codes?.unknown || [];
    Object.assign(values, {
      model: m ? m.title || [m.make, m.model, m.code].filter(Boolean).join(' ') : item.mail?.car || '[MODEL?]',
      model_page: m?.url || null,
      year_range: m?.yearRange || '[BUILD YEARS?]',
      landed_cost: m?.costing?.totalAud ? money(m.costing.totalAud) : '[LANDED COST?]',
      deposit: m?.costing?.depositAud ? money(m.costing.depositAud) : '[DEPOSIT?]',
      if_eligible: !!m || !unknown.length,
      if_not_listed: !m && unknown.length > 0,
    });
    if (m) facts.push(`From ${m.source || 'our website'}: ${m.title}${m.costing?.totalAud ? `, estimated landed ${money(m.costing.totalAud)}` : ''}${m.costing?.depositAud ? `, deposit ${money(m.costing.depositAud)}` : ''}`);
  }
  // Facts the file uses that this conversation has nothing for: left out, never a stray {word}.
  for (const k of FACTS[file] || []) if (!(k in values)) values[k] = null;
  // {if_word} for each fact the file names that is not a switch of its own: on when it has something in it.
  for (const k of FACTS[file] || []) if (!k.startsWith('if_') && !(`if_${k}` in values)) values[`if_${k}`] = typeof values[k] === 'string' ? !!values[k].trim() : !!values[k];
  const { fillParts } = await import('./templates.js');
  return { text: fillParts(part, values), part, values, tail: '', facts };
}

/**
 * Writes one template for this conversation (see draftFromTemplate): fitted to the customer by
 * the AI when `fitWith` is given, with the owner's `instruction` (Prompt or Rewrite) if any.
 */
export async function draftSectionTemplate(item, { id, instruction = '', fitWith = null, now = Date.now(), save = true } = {}) {
  const file = fileFor(item);
  const label = template(file)?.meta?.[id]?.label || id;
  const composed = await composeSectionTemplate(item, id, { now });
  return draftFromTemplate(item, { id, label, composed, used: composed.facts, instruction, fitWith, save, file });
}

/**
 * Problems in the template files, in words: a message with no label or no @fits, a signal no
 * conversation can show, a fact Wheelman does not fill in. Empty when all is well.
 */
export function checkTemplates() {
  const problems = [];
  for (const file of Object.values(SECTION_FILES)) {
    const t = template(file);
    if (!t) { problems.push(`voice/${file} is missing`); continue; }
    for (const [id, part] of Object.entries(t.sections)) {
      const m = t.meta?.[id] || {};
      if (!m.label) problems.push(`${file} ${id}: no @label`);
      if (!list(m.fits).length) problems.push(`${file} ${id}: no @fits`);
      for (const k of ['fits', 'needs', 'not']) for (const sig of list(m[k])) if (!SIGNALS.includes(sig)) problems.push(`${file} ${id}: @${k} names "${sig}", which no conversation shows`);
      for (const [, w] of part.matchAll(/\{([a-z0-9_]+)\}/g)) if (!FACTS[file].includes(w) && !FACTS[file].includes(w.replace(/^if_/, ''))) problems.push(`${file} ${id}: {${w}} is not a fact Wheelman fills in`);
    }
  }
  return problems;
}
