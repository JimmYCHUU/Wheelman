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
import { template, fill } from './templates.js';
import { availability } from './normalize.js';
import { reservedByAnother } from './deal.js';
import { inspectionLinks, alternatives } from './knowledge.js';
import { allVehicles } from './db.js';
import { vehicleMedia } from './vehiclemedia.js';
import { inclusionsSentence, inclusionsShort, priceBlock } from './pricereply.js';
import { inviteBlock, standardBlock } from './firstreply.js';
import { farAway, SITUATIONS } from './situations.js';
import { priceFigures, PARTING, DECLINED } from './selling.js';
import { topicsIn, researchFor } from './importquery.js';
import { greetingFor } from './checks.js';
import { sydneyHour, sydneyDay, sydneyWeekday } from './time.js';
import { money, wantedFrom } from './imports.js';
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
  // a follow-up opened from the Follow-ups list (src/followup.js), and which kind; a booking that
  // has just come in through the website
  'follow-up', 'inspection passed', 'quiet', 'reminder', 'booking made',
  // emails
  'eligibility', 'cost', 'deposit', 'timeline', 'payment', 'warranty', 'compliance_only', 'process', 'availability', 'eligible',
];

/** Every fact a template may use, by file. A {word} outside these is a typing slip. {if_word}
 * keeps its paragraph only when that fact applies (has something in it). */
const CAR_FACTS = ['greeting', 'sign_off', 'thanks', 'hi', 'car', 'car_link', 'price', 'km', 'km_said', 'import_said', 'where', 'inclusions', 'if_inclusions', 'inclusions_short', 'price_reply', 'invitation',
  'first_reply_block', 'address_block', 'stock_link', 'finance_link', 'finance_form', 'trade_in_form', 'warranty_link', 'importing_link', 'if_warranty', 'if_no_warranty', 'if_no_car', 'sender',
  // the follow-ups' own facts, and the booking in hand (the follow-up's, else the newest they made)
  'booked_day', 'booked_time', 'deposit_offer', 'new_thing', 'booking_kind', 'booked_when', 'address', 'if_onsite', 'if_online'];
// The fit word for each kind of follow-up.
const FOLLOW_UP_WORDS = { inspection_passed: 'inspection passed', quiet: 'quiet' };
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
  // A follow-up in hand: its own messages fit it. A conversation that is merely due one shows nothing of it.
  if (item.followUp) { s.add('follow-up'); if (FOLLOW_UP_WORDS[item.followUp.kind]) s.add(FOLLOW_UP_WORDS[item.followUp.kind]); }
  // Their newest message is a booking through the website: it is confirmed first.
  const newest = [...(item.timeline || [])].reverse().find((e) => e.who === 'customer' && (e.text || e.event || e.media));
  if (newest?.booking?.at) s.add('booking made');
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
    // The model they named, from an email's words or from a moved text's (judged car in item.imports).
    if (item.mail?.car || wantedFrom(item).make) s.add('eligible');
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
  const offered = out.map((x, i) => ({ id: x.id, label: x.label, best: i === 0 && x.score > 0 }));
  // A follow-up in hand: its message is the one that is due, and comes first.
  const due = item.followUp ? offered.findIndex((t) => t.id === item.followUp.template) : -1;
  if (due >= 0) { const [t] = offered.splice(due, 1); return [{ ...t, due: true, best: false }, ...offered.map((x) => ({ ...x, best: false }))]; }
  return offered;
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

const DAY_MS = 24 * 3600e3;
const TZ = 'Australia/Sydney';

/** The day of a booking, as a person says it: "today", "yesterday", or "on Wednesday 21 October". */
export function bookedDayWords(bookedAt, now = Date.now()) {
  const day = sydneyDay(bookedAt);
  if (day === sydneyDay(now)) return 'today';
  if (day === sydneyDay(now - DAY_MS)) return 'yesterday';
  const month = new Intl.DateTimeFormat('en-AU', { timeZone: TZ, month: 'long' }).format(new Date(bookedAt));
  return `on ${sydneyWeekday(bookedAt)} ${Number(day.slice(8, 10))} ${month}`;
}

/** The time of a booking, as a person says it: "2 pm", "2:30 pm", "9 am". */
export function bookedTimeWords(bookedAt) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(bookedAt)).map((x) => [x.type, x.value]));
  const hour = Number(p.hour);
  const minute = Number(p.minute);
  return `${hour % 12 || 12}${minute ? `:${p.minute}` : ''} ${hour < 12 ? 'am' : 'pm'}`;
}

/** When a booking is, looking forward: "today", "tomorrow", or "on Wednesday 21 October". */
export function bookedWhenWords(bookedAt, now = Date.now()) {
  const day = sydneyDay(bookedAt);
  if (day === sydneyDay(now)) return 'today';
  if (day === sydneyDay(now + DAY_MS)) return 'tomorrow';
  return bookedDayWords(bookedAt, now);
}

/**
 * The booking a message is about: the follow-up's own (a reminder, or after the inspection), else
 * the newest booking the customer made through the website. { kind, where, at } or null.
 */
export function bookingInHand(item) {
  const fu = item.followUp;
  if (fu?.data?.bookedAt) return { kind: fu.data.kind || 'inspection', where: fu.data.where || '', at: fu.data.bookedAt };
  const e = [...(item.timeline || [])].reverse().find((x) => x.who === 'customer' && x.booking?.at);
  return e ? { kind: e.booking.kind, where: e.booking.where, at: e.booking.at } : null;
}

// What we have already offered this customer, read from our own texts.
const OFFERED = {
  documents: /export certificate|auction sheet/i,
  video: /\b(video|walkaround)\b/i,
  // A time to come in is offered once the booking link has gone out. "Would you like to come and
  // see it?" on its own leaves the opening hours and the link as something new to say.
  booking: /book a time|#inspection=/i,
};

/**
 * The one new thing to offer a quiet customer, the first of these they have not been offered:
 * the export certificate and auction sheet, the walkaround video, a similar car we have, a time
 * to come in. { kind, text } from the @new_... lines of voice/dashboard-messages.md, or null when
 * everything has been offered. `media` is the car's media (vehicleMedia), or null when not to hand.
 */
export function newThingFor(item, media) {
  const v = item.vehicles?.[0];
  if (!v) return null;
  const t = template(SECTION_FILES.dashboard)?.snippets || {};
  const said = (re) => (item.timeline || []).some((e) => e.who === 'us' && !e.internal && !e.auto && e.text && re.test(e.text));
  const doc = (type) => (media?.documents || []).find((d) => d && d.type === type && d.shareable !== false && d.link);
  const docs = [doc('EXPORT_CERTIFICATE') && `Export certificate: ${doc('EXPORT_CERTIFICATE').link}`, doc('AUCTION_SHEET') && `Auction sheet: ${doc('AUCTION_SHEET').link}`].filter(Boolean);
  if (docs.length && t.new_documents && !said(OFFERED.documents)) return { kind: 'documents', text: fill(t.new_documents, { documents: docs.join('\n') }) };
  const video = (media?.videos || []).find((x) => x && x.shareable !== false && x.link);
  const watched = (item.lead?.inquiries || []).some((i) => i.videoViewed);
  if (video && t.new_video && !watched && !said(OFFERED.video)) return { kind: 'video', text: fill(t.new_video, { video_link: video.link }) };
  const similar = alternatives(v, allVehicles(), 1)[0];
  if (similar && t.new_similar) return { kind: 'similar', text: fill(t.new_similar, { similar_car: similar.title, similar_price: money(Number(similar.price)), similar_km: `${Number(similar.odometer || 0).toLocaleString('en-AU')} km`, similar_link: similar.url }) };
  if (t.new_visit && v.url && availability(v).code === 'available' && !said(OFFERED.booking)) return { kind: 'visit', text: fill(t.new_visit, { booking_link: inspectionLinks(v).onsite }) };
  return null;
}

/** The car's media for a follow-up, read with a short patience: null when it cannot be had in time. */
async function mediaFor(v, { waitMs = 5000 } = {}) {
  if (!v?.stockNo || !v.chassisNo) return null;
  let timer = null;
  const late = new Promise((resolve) => { timer = setTimeout(() => resolve(null), waitMs); timer.unref?.(); });
  try {
    const media = await Promise.race([vehicleMedia(v.stockNo), late]);
    return media && !media.stale ? media : null;
  } catch { return null; } finally { clearTimeout(timer); }
}

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
  // A follow-up is always greeted and signed off, even on a day we have already written.
  const fu = item.followUp || null;
  const again = !chat && !email && !fu && item.timeline.some((e) => e.who === 'us' && !e.internal && e.at && sydneyDay(e.at) === sydneyDay(now));
  const name = item.hasName ? ' {{NAME}}' : '';
  const values = {
    greeting: chat ? null : email ? `Hello${name},` : again ? null : `${greetingFor(sydneyHour(now))}${name},`,
    sign_off: chat || (again && !email) ? null : config.signOff,
    thanks: `Thank you for your message${item.hasName ? ', {{NAME}}' : ''}.`,
    // The Marketplace first reply opens "Hi {{NAME}}," inside its first sentence.
    hi: `Hi${name},`,
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
    const b = bookingInHand(item);
    const inclusions = v ? inclusionsSentence(v) : '';
    const outline = (v?.outline || []).join('\n');
    Object.assign(values, {
      car: v ? v.title || `stock ${v.stockNo}` : null,
      car_link: v?.url && !gone ? v.url : null,
      price: v?.price && !gone ? money(Number(v.price)) : null,
      km: v?.odometer ? `${Number(v.odometer).toLocaleString('en-AU')} km` : null,
      // The Marketplace first reply's own facts, said as the team says them: "only 7,405 km" under
      // 60,000 km; "a grade 4.5 Japanese import", or without the grade when none is recorded;
      // "6 months rego, a fresh roadworthy and a 5-year warranty" from the car's Included list.
      km_said: v?.odometer ? `${Number(v.odometer) < 60000 ? 'only ' : ''}${Number(v.odometer).toLocaleString('en-AU')} km` : null,
      import_said: v ? (v.auctionGrade ? `a grade ${v.auctionGrade} Japanese import` : 'a Japanese import') : null,
      inclusions_short: v ? inclusionsShort(v) || null : null,
      // The forms on the car's own page; the finance page when there is no car.
      finance_form: v?.url && !gone ? `${v.url}#finance` : `${site}/finance`,
      trade_in_form: v?.url && !gone ? `${v.url}#trade-in` : null,
      if_no_car: !v || gone,
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
      // The follow-ups' own facts: the booking they made, the deposit line while it is new to them,
      // and the one new thing for a quiet customer. The booking in hand (the follow-up's, else the
      // newest they made) gives the confirmation and the reminder their day, time and place.
      booked_day: fu?.data?.bookedAt ? bookedDayWords(fu.data.bookedAt, now) : null,
      booked_time: b ? bookedTimeWords(b.at) : null,
      booked_when: b ? bookedWhenWords(b.at, now) : null,
      booking_kind: b ? (b.kind === 'test_drive' ? 'test drive' : 'inspection') : null,
      address: config.site.address,
      if_onsite: !!b && b.where !== 'online',
      if_online: !!b && b.where === 'online',
      deposit_offer: fu?.kind === 'inspection_passed' && fu.data?.deposit && v && !gone ? t.snippets?.deposit_offer || null : null,
      new_thing: fu?.kind === 'quiet' ? newThingFor(item, await mediaFor(v))?.text || null : null,
    });
    if (v) facts.push(`The car: ${v.title}${v.stockNo ? `, stock ${v.stockNo}` : ''}, ${availability(v).text}`);
    if (fu) facts.push(`A follow-up: ${fu.reason}`);
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

/** A part marked "@fit: no" is written by code, word for word, with no AI. */
const byCode = (meta) => /^(no|0|off|false)$/i.test(String(meta?.fit || '').trim());

/**
 * Writes one template for this conversation (see draftFromTemplate): fitted to the customer by
 * the AI when `fitWith` is given, with the owner's `instruction` (Prompt or Rewrite) if any. A
 * part marked "@fit: no" (the booking confirmation, the reminder) is written word for word with
 * no AI; only a Prompt or Rewrite sends it to the AI.
 */
export async function draftSectionTemplate(item, { id, instruction = '', fitWith = null, now = Date.now(), save = true } = {}) {
  const file = fileFor(item);
  const meta = template(file)?.meta?.[id] || {};
  const label = meta.label || id;
  const composed = await composeSectionTemplate(item, id, { now });
  const plain = byCode(meta) && !instruction;
  return draftFromTemplate(item, { id, label, composed, used: composed.facts, instruction, fitWith: plain ? null : fitWith, save, file,
    ...(plain ? { okWords: `Written by code from your wording "${label}", with the facts from your records. No AI.` } : {}) });
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
