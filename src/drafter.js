// Produces one suggested reply for one waiting customer.

import { buildPrompt, writtenToday, requestOwnText } from './prompt.js';
import { complete, LlmError } from './llm.js';
import { logLine } from './log.js';
import { finishReply, fixGreeting, checkDraft, retryNote, stripModelSignOff, confirmsTime, worst, chatStyle, dropGreeting, emailChecks, followUpChecks, numbersIn, traceFacts } from './checks.js';
import { researchFor, renderResearch } from './importquery.js';
import { config } from './config.js';
import { redact, restore } from './redact.js';
import { planImport, auctionNote, bidBasisLine } from './imports.js';
import { planOrderReply, restoreAmounts } from './ordermessages.js';
import { insertDraft, latestDraft, countLessonUse } from './db.js';
import { templatePlan, checkMarkers, markerTrouble, unmask, finishTemplate, maskInstruction } from './fitter.js';
import { BLANK_PATTERN } from '../web/lib/blank.js';
import { sydneyHour } from './time.js';
import { standardBlock, inviteBlock, repeatsBlock, tidyOpening } from './firstreply.js';
import { priceBlock } from './pricereply.js';
import { untagged } from './text.js';
import { LEFTOVER_LABEL } from './practice.js';
import { tagMarketplaceLinks } from './marketplace.js';
import { mediaForReply } from './vehiclemedia.js';
import { inventedLiterals, unknownMarkers, restoreAnswer, restoreFacts, maskFacts, hasFactMarker, markerForFigure, factShaped, netFacts } from './factmarkers.js';
import { partsOf, blockOf, reasonIn } from './parts.js';
import { citedTopics, openTopics } from './factcite.js';

/**
 * What a reply may legitimately quote, split by how far it can be trusted.
 * trusted: this vehicle's facts, our own past messages and staff notes.
 * policy: business facts and website extracts (dollar amounts count only in context).
 * customer: what the customer wrote (fine for times and dates, not for prices).
 *
 * On Marketplace, the engine's automatic replies and its notes were written by an AI, so they
 * are placed with what the customer wrote: a price that appears only there is not ours to repeat.
 */
function allowedMaterial(item, prompt) {
  const say = (e) => [e.text, e.event].filter(Boolean).join(' ');
  const ours = item.timeline.filter((e) => e.who === 'us' && !e.auto).map(say).join('\n');
  const theirs = item.timeline.filter((e) => e.who !== 'us' || e.auto).map(say).join('\n');
  const alts = prompt.alternatives.map((a) => `${a.title} ${a.odometer} km $${a.price} ${a.url}`).join('\n');
  // The inspection booking links count as ours only when the customer asked to see the car.
  const booking = (prompt.inspection?.urls || []).join('\n');
  // The same material by where it came from, for the page's list of facts (traceFacts in src/checks.js).
  // The car's own links (booking, media, its model page) count with its record; the research and the import pages with the website.
  const pieces = [
    { source: 'the stock record', text: [prompt.vehicleText, alts, booking, (prompt.media?.links || []).map((l) => l.url).join('\n'), prompt.sameModelUrl || '', `${config.site.baseUrl}/used-cars`].join('\n') },
    { source: 'our earlier messages', text: ours },
    { source: 'business facts', text: prompt.businessFactsText || '' },
    { source: 'the website', text: [prompt.websiteText, (prompt.importUrls || []).join('\n'), prompt.researchText || ''].filter(Boolean).join('\n') },
    { source: 'what the customer said', text: [theirs, prompt.unconfirmedText || ''].join('\n') },
  ];
  return {
    pieces,
    // The research for an import email is ours to state: its figures and links came from our website.
    // The car's media links the customer asked for are ours too: they came from the car's own record.
    trusted: [prompt.vehicleText, alts, booking, (prompt.media?.links || []).map((l) => l.url).join('\n'), prompt.sameModelUrl || '', `${config.site.baseUrl}/used-cars`, (prompt.importUrls || []).join('\n'), prompt.researchText || '', ours, prompt.user.split('=== VEHICLE FACTS ===')[0]].join('\n'),
    policy: [prompt.businessFactsText, prompt.websiteText].join('\n'),
    customer: [theirs, prompt.unconfirmedText || ''].join('\n'),
  };
}

const dollars = (s) => Number(String(s ?? '').replace(/[^\d.]/g, '')) || 0;

/** Marketplace only: the price on the Facebook listing should match the dashboard price. */
function listingPriceCheck(item) {
  const v = item.vehicles[0];
  const listed = dollars(item.marketplace?.listingPrice);
  const ours = dollars(v?.price);
  if (!listed || !ours || listed === ours) return null;
  const fmt = (n) => '$' + n.toLocaleString('en-AU');
  return { level: 'warn', code: 'listing-price', message: `The Facebook listing shows ${fmt(listed)} but the dashboard price is ${fmt(ours)}. Check which is right before talking about price.`, tokens: [] };
}

// What a buyer says when they want the car's page, photos or details: a link is then an answer.
const ASKS_FOR_DETAILS = /\b(details?|photos?|pics?|pictures?|images?|link|url|info|information|specs?|listing|page|website)\b/i;

/** Marketplace only: a "More details" line or the page link the buyer did not ask for is pointed out. */
function unaskedLinkCheck(item, body) {
  if (ASKS_FOR_DETAILS.test(item.pendingText || '')) return null;
  const page = item.vehicles[0]?.url ? untagged(item.vehicles[0].url).toLowerCase().replace(/\/$/, '') : '';
  const lines = String(body).split('\n').map((l) => l.trim());
  const found = lines.some((l) => /^more details:?$/i.test(l) || (page && !l.includes('#') && untagged(l).toLowerCase().replace(/\/$/, '') === page));
  return found ? { level: 'warn', code: 'unasked-link', tokens: [], message: "The buyer did not ask for details, photos or a link: leave the car's page link out and end on the next step." } : null;
}

/**
 * When the customer asked to see the car, the reply should carry the right booking link.
 * A reply with no link at all is sent back once when the customer asked now, or our staff asked
 * for the link. When the customer asked earlier in the conversation it is only pointed out.
 */
function inspectionCheck(plan, body, block = '') {
  // On Marketplace the next step is the buyer's number (plan.number): no link is expected there.
  if (!plan?.url || plan.number) return null;
  const givesInPerson = body.includes('#inspection=onsite');
  const givesOnline = body.includes('#inspection=online');
  const missing = plan.must ? 'fail' : 'warn';
  if (plan.kind === 'online' && givesInPerson) {
    return { level: 'warn', code: 'inspection-link', tokens: [], message: 'The customer seems to be far away, but the reply gives the in-person booking link. The online video inspection link may suit better.' };
  }
  // The link counts wherever it is: in the AI's own lines, or in the standard block under them.
  if (body.includes(plan.url) || block.includes(plan.url)) return null;
  if (plan.kind === 'online') {
    return { level: missing, code: 'inspection-link', tokens: [], message: 'The customer wants to see the car and seems to be far away, but the reply has no online video inspection link. Add the link given in the INSPECTION section.' };
  }
  // In-person was expected. A confirmed time ("See you at ...") or the online link is also a fair answer.
  if (givesOnline || confirmsTime(body)) return null;
  return { level: missing, code: 'inspection-link', tokens: [], message: 'The customer wants to see the car, but the reply has no inspection booking link. Add the link given in the INSPECTION section.' };
}

/** A reply to someone who has already bought must not treat them as a new enquiry. */
function buyerCheck(item, body) {
  if (!item.deal) return null;
  const text = String(body || '');
  const m = text.match(/\bwhich (vehicle|car|van|model|one)\b[^.?!\n]*\?/i)
    || text.match(/\b(thank you|thanks) for (your |the )?(enquiry|inquiry|interest)\b/i);
  if (!m) return null;
  return { level: 'fail', code: 'buyer-ask', tokens: [m[0]], message: 'This customer has already bought, but the reply treats them as a new enquiry.' };
}

/**
 * With a block under them, the AI's own lines must not say what the block says: the standard
 * block's address, hours, links and phone (address), the price reply's sentences (price), or the
 * invitation's (invite).
 */
/** Pointing at a block ("our address is below", "the video is below") is not an answer. The sentence must stand on its own. */
function pointerCheck(body) {
  const pointer = body.match(/\b(?:is|are|see|listed|shown|given|found|details?|address|hours|links?|videos?|photos?)\s+(?:just\s+|right\s+)?below\b|\bbelow[.:]?\s*$/im);
  return pointer ? { level: 'fail', code: 'block-pointer', tokens: [pointer[0]], message: `The reply points at the block ("${pointer[0].trim()}"). Say the answer in the sentence itself and leave out "below".` } : null;
}

function blockCheck(body, vehicleUrl, inspectionUrl = '', { askedWhere = false, address = true, price = false, invite = false } = {}) {
  const pointer = pointerCheck(body);
  if (pointer) return pointer;
  // A customer who asked where we are, or when we are open, is answered in the AI's own sentence too.
  let again = askedWhere || !address ? '' : repeatsBlock(body);
  if (!again && (price || invite)) again = repeatsBlock(body, { address: false, price, inspection: price || invite });
  if (!again && inspectionUrl && body.includes(inspectionUrl)) again = inspectionUrl;
  if (!again && vehicleUrl && address) {
    // The inspection booking link starts with the vehicle's page link, so only the bare page link counts.
    const at = body.indexOf(vehicleUrl);
    if (at !== -1 && body[at + vehicleUrl.length] !== '#') again = vehicleUrl;
  }
  if (!again) return null;
  const what = price ? 'the price reply under it' : invite ? 'the invitation under it' : 'the standard block below it';
  return { level: 'fail', code: 'block-repeat', tokens: [again], message: `The reply repeats "${again}", which ${what} already gives. Leave that to the block and write only the answer.` };
}

/** The conversation in the plain form the promise, day and place checks read. */
const saidIn = (item) => item.timeline
  .filter((e) => e.text || e.event)
  .map((e) => ({ who: e.who === 'us' && !e.auto ? 'us' : 'customer', text: [e.text, e.event].filter(Boolean).join(' '), at: e.at }));

/**
 * A run of the owner's own words in a reply. A coaching note is written to Wheelman, about how to
 * handle a message. Seven of its words in a row in the reply means it was pasted, not applied.
 */
function coachingCopied(body, note) {
  const words = (t) => String(t || '').toLowerCase().replace(/https?:\/\/\S+/g, ' ').replace(/[^a-z0-9$ ]+/g, ' ').split(/\s+/).filter(Boolean);
  const said = words(note);
  const reply = ` ${words(body).join(' ')} `;
  for (let i = 0; i + 7 <= said.length; i++) {
    const run = said.slice(i, i + 7).join(' ');
    if (reply.includes(` ${run} `)) return run;
  }
  return '';
}

/**
 * A fitted template: every marker must come back exactly once (with the owner's Prompt one may be
 * left out); the facts are then put back and the template's own greeting and closing kept. The
 * facts are checked as for any reply, the style is not (it is the owner's wording), and the checks
 * the template carries itself (blanks to fill, a car to confirm) are added.
 */
function assessTemplate(item, text, json, { plan, allowed, said, staffSaid, instructed, now }) {
  const marks = checkMarkers(text, plan.markers, { optional: instructed });
  // Every blank the message needs is already one of its markers: one written out is the AI's own.
  const ownBlanks = [...new Set(String(text).match(new RegExp(BLANK_PATTERN, 'g')) || [])];
  const reply = finishTemplate(unmask(text, plan.markers), item.lead);
  const checks = checkDraft({
    channel: item.channel, reply, body: reply, advertisedPrice: 0, blockNextStep: true,
    needsHuman: json.needs_human, allowedText: allowed.trusted, policyText: allowed.policy, customerText: allowed.customer,
    // The template is the owner's own wording: what it promises, our staff have said.
    instruction: [staffSaid, plan.text].filter(Boolean).join('\n'), situation: item.situation, hold: false, examples: [], inConversation: !item.isFirstReply,
    said, stage: null, nextStep: '', now, instructed: true,
  // The template's own blanks are its own checks (below), said once, in its words.
  }).filter((c) => c.level !== 'ok' && c.code !== 'marker' && c.code !== 'bare-marker');
  if (!marks.ok) checks.push({ level: 'fail', code: 'template-markers', tokens: [], message: `The template's facts did not all come back as they were: ${markerTrouble(marks)}. Keep every marker exactly once, as written.` });
  if (ownBlanks.length) checks.push({ level: 'fail', code: 'template-blank', tokens: [], message: `The reply adds a blank of its own (${ownBlanks.join(', ')}). The message already has every blank it needs, as markers: write no other.` });
  checks.push(...plan.wordChecks.filter((c) => c.level !== 'ok'));
  // A follow-up: Carbarn named, nothing filler, never "did you come" (src/followup.js).
  if (item.followUp) checks.push(...followUpChecks({ body: reply, kind: item.followUp.kind }));
  if (!checks.length) checks.push({ level: 'ok', code: 'ok', tokens: [], message: 'Fitted to this customer from your wording, with the figures from your records.' });
  return { body: reply, reply, checks };
}

/**
 * What the AI may repeat as written in the compact style: the request's own text, system and user,
 * apart from its learning material (requestOwnText); what the customer and our team wrote in this
 * conversation (the same messages buildPrompt shows); what our staff typed for this draft; and the
 * draft our staff coached on. Our records' facts are markers in the request, so they are not here:
 * those the AI writes as markers.
 */
function writtenHere(item, prompt, staffSaid, coaching) {
  const say = (e) => [e.text, e.event].filter(Boolean).join(' ');
  return [requestOwnText(prompt), ...item.timeline.map(say), ...(item.pending || []).map(say), staffSaid, coaching?.draft || ''].filter(Boolean).join('\n');
}

/**
 * The compact style's own checks, on the AI's text as it wrote it: before its markers are put
 * back, and before code adds anything under it. A figure or link it typed itself (figure-raw), and
 * a marker that is not one of ours (marker-unknown), both fail. A figure typed exactly as one of
 * our records' values is not figure-raw: code checks it as well as its marker, in the figure and
 * link checks that read the reply once the markers are back. Nor is one whose numbers the figure
 * check already names (named): one invented figure, one line.
 */
function factChecks(item, prompt, json, staffSaid, coaching, named = new Set()) {
  const text = String(json.reply || '').replace(/\\n/g, '\n');
  const markers = prompt.factMarkers;
  const out = [];
  // A link is never named there: the figure check reads figures, not links.
  const namedThere = (lit) => { const ns = [...numbersIn(lit)]; return !lit.includes('/') && ns.length > 0 && ns.every((n) => named.has(n)); };
  const typed = inventedLiterals(text, { allowedText: writtenHere(item, prompt, staffSaid, coaching) })
    .filter((lit) => !markers.some((m) => m.value === lit) && !namedThere(lit));
  if (typed.length) {
    const it = typed.length === 1 ? 'it' : 'them';
    out.push({
      level: 'fail', code: 'figure-raw', tokens: typed,
      message: `Wheelman wrote ${typed.join(', ')} itself instead of taking ${it} from your records or this conversation. Check ${it} before sending.`,
      // The second request: each figure it typed, and the marker to write instead when it is one of ours.
      retry: typed.map((lit) => {
        const name = markerForFigure(lit, markers);
        return name ? `You typed the figure ${lit} yourself; write its marker {{${name}}} instead.` : `You typed the figure ${lit} yourself; it is not in our records.`;
      }).join(' '),
    });
  }
  // A marker that is not one of ours, or anything still shaped like one once the facts are back.
  const made = unknownMarkers(text, markers);
  if (made.length || factShaped(restoreFacts(text, markers, { net: false }))) out.push(unknownMarkerCheck(made));
  return out;
}

/** marker-unknown: plain words on the page; the markers named for the AI's second request. */
const unknownMarkerCheck = (made) => ({
  level: 'fail', code: 'marker-unknown', tokens: [],
  message: 'Wheelman wrote a fact placeholder it could not fill; it is shown as [CHECK?]. Check this part before sending.',
  retry: `${made.length ? `${made.join(', ')} ${made.length === 1 ? 'is not one of the markers' : 'are not among the markers'}` : 'A marker you wrote is not one of the markers'} given for our records' facts. Use only the markers given, written exactly as shown.`,
});

/**
 * Turns what the model answered (or a reply written by hand) into the finished suggestion and
 * runs every check on it. plan: an import or auction-order plan, when there is one.
 * instructed: written from the owner's Prompt (or Rewrite). The section's own rules on length,
 * tone, layout and greeting step aside: the reply is not trimmed to them and they are not
 * checked. The facts are checked as always.
 * In the compact style (prompt.factMarkers) the AI wrote our records' facts as markers: what it
 * typed itself is checked first, then every marker in its answer is put back, then everything
 * else runs as in the full style. byCode: the answer is code's own wording (the standard opening
 * of an auction offer, a template word for word), not the AI's, so it has nothing typed to check.
 */
export function assessReply(item, prompt, json, opts) {
  if (!prompt.factMarkers) return assessAnswer(item, prompt, json, opts);
  const out = assessAnswer(item, prompt, restoreAnswer(json, prompt.factMarkers), opts);
  // The numbers of the figures the figure check names: those are not named again as typed.
  const named = new Set(out.checks.filter((c) => c.code === 'figure').flatMap((c) => [...numbersIn((c.tokens || []).join(' '))]));
  const own = opts.byCode ? [] : factChecks(item, prompt, json, opts.staffSaid || '', opts.coaching, named);
  // The last safety net: nothing shaped like a fact marker is ever shown.
  if (factShaped(out.reply) || factShaped(out.body)) {
    out.reply = netFacts(out.reply);
    out.body = netFacts(out.body);
    if (!own.some((c) => c.code === 'marker-unknown')) own.push(unknownMarkerCheck([]));
  }
  if (own.length) out.checks = [...own, ...out.checks.filter((c) => c.level !== 'ok')];
  return out;
}

function assessAnswer(item, prompt, json, { plan = null, chat = false, email = false, research = null, again = false, staffSaid = '', instructed = false, allowed, said, coaching = null, now = Date.now() }) {
  // A brand-new enquiry gets the team's standard block in place of the sign-off. A holding
  // reply (a complaint, say) does not.
  const { vehicleUrl, inspectionUrl } = prompt.standard;
  const offer = plan?.stage === 'offer';
  const hold = !!json.hold;
  let text = String(json.reply || '').replace(/\\n/g, '\n');
  // The owner's blocks under the AI's lines: the price reply when the price was asked about, else
  // the invitation when the customer wants to see the car (not when the AI confirmed a time in
  // words, and not on a first reply, where the standard block carries it).
  const price = !plan && !hold && prompt.price?.on ? priceBlock({ vehicle: item.vehicles[0], inspectionUrl: prompt.price.inspectionUrl, online: prompt.price.online, chat, withStandard: prompt.standard.on, asked: item.pendingText }) : '';
  const confirmedTime = confirmsTime(text);
  const invite = !price && !plan && !hold && prompt.inspection?.block && prompt.inspection.url && !prompt.standard.on && !confirmedTime && !prompt.inspection.booked
    ? inviteBlock(prompt.inspection.url, { online: prompt.inspection.kind === 'online', chat, tail: true }) : '';
  const owned = [price, invite].filter(Boolean).join('\n\n');
  // The links the customer asked for (a video, the auction sheet, the export certificate, the
  // photos), from the car's own media. Added by code under the AI's lines, never typed by the AI.
  const asked = !plan && !hold && prompt.media?.on ? prompt.media : null;
  // An import reply has its own lines underneath: the whole offer, or the short contact block.
  const block = plan ? (hold ? '' : plan.tail || '') : prompt.standard.on && !hold ? standardBlock({ vehicleUrl, inspectionUrl, online: !!prompt.standard.online }) : '';
  if (plan?.tokens) text = restoreAmounts(text, plan.tokens);
  if (plan?.stage === 'template') return assessTemplate(item, text, json, { plan, allowed, said, staffSaid, instructed, now });
  if (block || owned || asked) text = tidyOpening(text, vehicleUrl, inspectionUrl, prompt.price?.inspectionUrl || '', invite ? prompt.inspection.url : '', (invite || price) ? (item.vehicles[0]?.url || '') : '', ...(asked ? asked.links.map((l) => l.url) : []));
  // A link the AI wrote out with its own words around it stays there, once.
  const links = asked ? asked.links.filter((l) => !text.includes(l.url)).map((l) => `${l.label}: ${l.url}`).join('\n') : '';
  const extras = [links, owned].filter(Boolean).join('\n\n');
  // An offer opens the way the team writes it: the greeting, a blank line, then one short paragraph.
  if (offer && !instructed) text = text.trim().replace(/^([^\n]{1,40},)\n+/, (m, hi) => `${hi}\n\n`).replace(/([^\n])\n(?!\n)/g, (m, c) => `${c} `);
  // The Marketplace chat style and the once-a-day greeting are the section's rules: a Prompt keeps
  // the greeting and the layout it asked for.
  const chatStyled = chat && !instructed;
  let body = fixGreeting(stripModelSignOff(text), sydneyHour(now), { chat: chatStyled });
  if (chatStyled) body = chatStyle(body);
  else if (again && !offer && !instructed) body = dropGreeting(body);
  // Marketplace suggestions carry no sign-off: it is a chat, not a text message. An import
  // reply keeps its closing lines even when we have already written today.
  const signOff = chat ? '' : plan && block ? block : again ? '' : block || config.signOff;
  // The price reply or the invitation sits under the AI's lines, before the standard block or the sign-off.
  const reply = finishReply(extras ? `${text.trim()}\n\n${extras}` : text, item.lead, { now, signOff, chat: chatStyled, greeting: offer || !again || instructed });
  // What code added under the AI's lines, in the order it sits in the reply, each with why (src/parts.js).
  const closing = signOff !== block ? 'signoff' : offer ? 'offer' : 'first';
  const blocks = [
    links && blockOf('links', links, reasonIn(asked.lines[0])),
    price && blockOf('price', price, reasonIn(prompt.price.lines[0])),
    invite && blockOf('invite', invite, reasonIn(prompt.inspection.why)),
    signOff && blockOf(closing, signOff, offer ? plan.lines[1] : undefined),
  ].filter(Boolean);
  let checks = checkDraft({
    channel: item.channel,
    reply, body,
    // A figure below the advertised price is never ours to name.
    advertisedPrice: item.deal ? 0 : Number(item.vehicles[0]?.price) || 0,
    // The price reply or the invitation under the lines offers the next step itself.
    blockNextStep: !!owned,
    needsHuman: json.needs_human,
    allowedText: allowed.trusted, policyText: allowed.policy, customerText: allowed.customer,
    instruction: staffSaid, situation: item.situation, hold: !!json.hold,
    examples: prompt.exampleReplies, inConversation: !item.isFirstReply,
    said, stage: prompt.stage, nextStep: String(json.next_step || ''), now, instructed,
  });
  // What the block already says is not repeated above it, unless the Prompt asked for it. Pointing
  // at a block ("below") is never an answer.
  const repeat = instructed
    ? (block || owned || links ? pointerCheck(body) : null)
    : offer
      ? (/[$¥]\s?\d|https?:\/\//.test(body) ? { level: 'fail', code: 'block-repeat', tokens: [], message: 'The opening states a figure or a link. The block below it gives the car, the bid, the costs and the link: write only the greeting and why the car may suit.' } : null)
      : block || owned ? blockCheck(body, vehicleUrl, inspectionUrl || prompt.inspection?.url || prompt.price?.inspectionUrl || '', { askedWhere: !plan && item.situation.all.includes('location_hours'), address: !!block, price: !!price, invite: !!invite })
        : links ? pointerCheck(body) : null;
  if (offer) {
    checks = [...checks.filter((c) => c.level !== 'ok'),
      // Left out of the offer once a deposit is paid, so there is nothing to paste then.
      ...(plan.tail.includes('[DEPOSIT LINK?]') ? [{ level: 'input', code: 'marker', tokens: ['[DEPOSIT LINK?]'], message: 'Paste the deposit link before sending.' }] : []),
      ...(plan.estimate.needsReview ? [{ level: 'input', code: 'auction-review', tokens: [], message: 'The cost calculator marks this car for a manual check (tax or import limits). Confirm the figures before sending.' }] : []),
      { level: 'warn', code: 'auction', tokens: [], message: auctionNote(plan) }];
  }
  if (plan?.stage === 'unread') checks = [...checks.filter((c) => c.level !== 'ok'), { level: 'warn', code: 'auction', tokens: [], message: 'The live auction could not be read, so no car was looked for. Use Rewrite to try again.' }];
  // "Your inspection is booked" is only true once somebody has booked it.
  const booked = !chat && /\binspection\b[^.!?\n]{0,60}\b(is|has been|have been|'s)\s+(now\s+)?booked\b|\bbooked\b[^.!?\n]{0,40}\binspection\b/i.test(body)
    && !item.timeline.some((e) => /booked (an inspection|a test drive)/i.test(e.event || ''));
  if (booked) checks = [...checks.filter((c) => c.level !== 'ok'), { level: 'input', code: 'book-first', tokens: [], message: 'This reply says the inspection is booked. Book it on the website first, then send.' }];
  if (repeat) checks = [...checks.filter((c) => c.level !== 'ok'), repeat];
  // A label such as "[inspection booking link]" stands for a link in another customer's reply.
  const label = body.match(LEFTOVER_LABEL);
  if (label) checks = [...checks.filter((c) => c.level !== 'ok'), { level: 'fail', code: 'label', tokens: [label[0]], message: `"${label[0]}" is a label from an example, not a real link or figure. Use the real one from this request, or leave it out.` }];
  const pasted = coaching ? coachingCopied(body, coaching.note) : '';
  if (pasted) checks = [...checks.filter((c) => c.level !== 'ok'), { level: 'fail', code: 'coaching-copied', tokens: [], message: `The reply repeats the owner's coaching word for word ("${pasted} …"). The note says how to handle the message. Say it to the customer in your own words, or leave it out if it was a line to avoid.` }];
  const listing = chat ? listingPriceCheck(item) : null;
  if (listing) checks = [...checks.filter((c) => c.level !== 'ok'), listing];
  const unasked = chat ? unaskedLinkCheck(item, body) : null;
  if (unasked) checks = [...checks.filter((c) => c.level !== 'ok'), unasked];
  // An import email: the exact answer or a blank, never a holding line, and every model asked about answered.
  const mail = email ? emailChecks({ body, research, hold: !!json.hold, instructed }) : [];
  if (mail.length) checks = [...checks.filter((c) => c.level !== 'ok'), ...mail];
  const visit = inspectionCheck(prompt.inspection, body, [block, extras].filter(Boolean).join('\n'));
  if (visit) checks = [...checks.filter((c) => c.level !== 'ok'), visit];
  const buyer = buyerCheck(item, body);
  if (buyer) checks = [...checks.filter((c) => c.level !== 'ok'), buyer];
  // A follow-up: Carbarn named, nothing filler, never "did you come" (src/followup.js).
  if (item.followUp) { const fu = followUpChecks({ body, kind: item.followUp.kind }); if (fu.length) checks = [...checks.filter((c) => c.level !== 'ok'), ...fu]; }
  return { body, reply, checks, blocks };
}

/**
 * Which of the rules code follows shaped a reply, for What Wheelman used: the blocks it added under
 * the AI's lines (the first-reply details, the price reply, the invitation, the links asked for),
 * whether the greeting and sign-off were left off because we already wrote today, and whether the
 * playbook's sections for this message went into the request (the compact style).
 */
const rulesOf = (blocks, { again = false, playbook = false } = {}) => {
  const added = (kind) => (blocks || []).some((b) => b.kind === kind);
  return { standard: added('first'), price: added('price'), invite: added('invite'), media: added('links'), again: !!again, playbook: !!playbook };
};

// One write at a time for one customer message. A second plain write while one is under way (the
// page's Write it now during a background write, or the other way round) joins it instead of asking
// the AI again. A write from the owner's own words (the Prompt line, Rewrite, Could be better)
// starts its own, and a plain write that finishes after it is not kept: the owner's stands.
// A template has its own: writing one template does not hold up another for the same message.
const inFlight = new Map(); // 'itemKey|anchorKey|template' -> { promise, instruction, directed, startedAt }
const flightKey = (item, template = '') => `${item.itemKey}|${item.anchorKey}|${template}`;
/** Is a suggestion being written for this message right now (from this template, when one is named)? The page shows the shimmering lines. */
export const writingNow = (itemKey, anchorKey, template = undefined) => (template === undefined
  ? [...inFlight.keys()].some((k) => k.startsWith(`${itemKey}|${anchorKey}|`))
  : inFlight.has(`${itemKey}|${anchorKey}|${template || ''}`));

/**
 * @param instruction what our staff typed for this one reply: the Prompt line before it is written,
 *                    or Rewrite after. Its figures and promises count as staff-given.
 * @param coaching  { note, draft } given under Could be better: what the owner said about the last
 *                  draft, and that draft. It guides the rewrite; it is not wording to send.
 * @param template  one of the owner's templates to fit to this customer (src/fitter.js):
 *                  { id, label, masked: maskTemplate(...), wordChecks, factsUsed, typed, fitted, fittedBy }.
 *                  `fitted`: the AI's earlier fitting of the same wording, used again with no request.
 */
export function draftFor(item, opts = {}) {
  const { instruction = '', coaching = null, save = true } = opts;
  if (!save) return writeDraft(item, opts, null);
  const key = flightKey(item, opts.template?.id || '');
  const directed = !!instruction || !!coaching;
  const current = inFlight.get(key);
  if (current && (!directed || (!coaching && current.instruction === instruction))) {
    logLine('suggestion', `${item.itemKey}: a suggestion is already being written for this message; joined it instead of asking again`);
    return current.promise;
  }
  const flight = { instruction, directed, startedAt: Date.now(), promise: null };
  flight.promise = writeDraft(item, opts, flight).finally(() => { if (inFlight.get(key) === flight) inFlight.delete(key); });
  inFlight.set(key, flight);
  return flight.promise;
}

/**
 * The prompt style for one write: the one asked for (the replay and the tests give it), else
 * PROMPT_STYLE for a plain reply to a text on the dashboard (no Prompt, no Could be better, no
 * template, not a follow-up, an import or auction customer, a Marketplace chat or an email), else full.
 */
// Measured by the replay; other sections stay full until replayed.
export function styleFor(item, { style = null, instruction = '', coaching = null, template = null } = {}) {
  if (style) return style;
  const measured = item.channel === 'sms' && (item.section || 'dashboard') === 'dashboard' && !instruction && !coaching && !template
    && !item.followUp && !item.order && !item.imports && !item.marketplace && !item.mail;
  return measured ? config.llm.promptStyle : 'full';
}

// style: 'full' or 'compact', the prompt style (src/prompt.js); styleFor's choice unless given.
async function writeDraft(item, { instruction = '', coaching = null, template: tpl = null, save = true, holdOutConversation = true, now = Date.now(), pin = null, style: given = null } = {}, flight) {
  const style = styleFor(item, { style: given, instruction, coaching, template: tpl });
  // Keeps the finished draft, unless it is a plain write that finished after a reply from the
  // owner's own words was written for the same message: then the owner's stands and this one goes,
  // whether it came out ready or failed.
  const persist = (d) => {
    if (!save) return d;
    if (flight && !flight.directed) {
      const newest = latestDraft(item.itemKey, item.anchorKey);
      if (newest && newest.instruction && newest.created_at >= flight.startedAt) {
        d.dropped = true;
        logLine('suggestion', `${item.itemKey}: a suggestion written without an instruction was dropped; one from the owner's instruction was written meanwhile`);
        return d;
      }
    }
    d.id = insertDraft(d);
    return d;
  };
  // What the message was about when the suggestion was written. Once it is answered the item no
  // longer says, so learning and the report read it from here.
  const context = {
    situations: item.situation.all,
    firstReply: item.isFirstReply,
    channel: item.channel,
    // The section it was listed in: nothing written while in Auction is learned from (learn.js).
    section: item.section || null,
    anchorAgeHours: item.lastInboundAt ? Math.round((now - item.lastInboundAt) / 360000) / 10 : null,
    newEnquiry: !!item.isNewEnquiry,
    buyer: !!item.deal,
    dealSource: item.deal?.source || null,
    stage: item.deal?.stage || null,
    coached: !!coaching,
    // An ordinary enquiry read as an import enquiry: why (src/importjudge.js), or the owner's ruling.
    judged: item.judged ? item.judged.why : null,
    // The template it was written from, and for an auction message its kind (as before templates).
    template: tpl ? tpl.id : null,
    ...(tpl && item.order ? { message: tpl.id } : {}),
    // A follow-up (src/followup.js): never learned from, whatever its anchor says later.
    followUp: item.followUp ? { id: item.followUp.id, kind: item.followUp.kind } : null,
    // The prompt style it was written in (styleFor), so replays and the teaching buttons can be split by it.
    style,
  };
  // What the owner typed into "Add what you know" is kept with a template's suggestion as its instruction was.
  const base = { itemKey: item.itemKey, anchorKey: item.anchorKey, situation: tpl && item.order ? tpl.id : item.situation.primary, instruction: instruction || tpl?.typed || '', context, template: tpl?.id || null };

  if (item.state === 'optout') {
    const d = { ...base, status: 'blocked', reply: '', checks: [{ level: 'fail', code: 'optout', message: 'Customer asked not to be contacted. No reply suggested.' }] };
    return persist(d);
  }

  try {
    const chat = item.channel === 'marketplace';
    const email = item.channel === 'email';
    // The greeting and "Regards, Team Carbarn" go on the first reply to a customer each day, not on
    // every message. An email is greeted every time.
    // A follow-up is always greeted and signed off, even on a day we have already written.
    const again = !chat && !email && !item.followUp && writtenToday(item, now);
    // The owner's figures, links and promises count as staff-given, whichever box they were typed in.
    const staffSaid = [instruction, coaching?.note].filter(Boolean).join('\n');

    // An import or auction enquiry: what to ask, or which auction car to offer, is worked out first.
    let plan = null;
    // One of the owner's templates, fitted to this customer: its facts go to the AI only as markers.
    if (tpl) plan = templatePlan(tpl, { orderPlan: item.order ? planOrderReply(item, { forTemplate: true }) : null, followUp: item.followUp || null });
    // A reply to an auction customer: the order's facts go to the AI, its amounts only as markers.
    else if (item.order) plan = planOrderReply(item);
    else if (!chat && !email && item.imports) {
      try { plan = await planImport(item, { instruction: staffSaid, now }); }
      catch (e) {
        logLine('auction', `${item.itemKey}: ${e.message}`);
        plan = { stage: 'unread', tail: '', lines: ['The live auction could not be read just now. Do not name or describe any auction car, and give no price. Say we are looking into it and will come back to them shortly.'] };
      }
    }
    context.importStage = plan?.stage || null;

    // Nothing of the customer's own to answer: the first reply is the standard wording, no AI needed.
    if (plan?.stage === 'ask' && plan.ready) {
      const reply = [restore(plan.ready, item.lead), plan.tail].filter(Boolean).join('\n\n');
      // Its closing lines (address, phone, hours, sign-off) are the first-reply details. No AI was asked, so no lesson went in.
      const blocks = plan.tail ? [blockOf('first', plan.tail)] : [];
      context.parts = partsOf(reply, blocks);
      context.lessons = [];
      context.rules = rulesOf(blocks);
      const d = { ...base, status: 'ready', reply, needsHuman: [], factsUsed: [], nextStep: 'asked what they are looking for', checks: [{ level: 'ok', code: 'ok', message: 'Standard wording for a new import enquiry.', tokens: [] }], provider: 'none', model: 'standard wording', exampleIds: [] };
      return persist(d);
    }

    // An import email: the model, its eligibility and cost are looked up on our website first.
    // Whatever could not be found becomes a blank in the reply and a note on the page.
    const research = email ? await researchFor(item, { instruction: staffSaid, now }) : null;
    const rendered = research ? renderResearch(research) : null;
    context.research = research ? { models: research.models.map((m) => m.code), notFound: research.notFound.length, stale: research.stale } : null;

    // The car's photos, videos and documents, when the customer asked for one: read before the
    // request is built, given up after a few seconds so a slow dashboard never holds up a reply.
    const media = plan || email ? null : await mediaForReply(item);
    // A template's facts go to the AI only as markers, and so do the figures the owner typed: what
    // it puts in comes back exactly as typed (an auction order's amounts never go to it).
    let asked = instruction;
    if (plan?.stage === 'template' && instruction) {
      plan.markers = [...plan.markers];
      asked = maskInstruction(instruction, plan.markers);
      if (plan.mask) asked = plan.mask(asked);
    }
    const prompt = buildPrompt(item, { instruction: asked, coaching, importPlan: plan, research, media, holdOutConversation, now, style });
    // Where the customer was on the way to a sale, and the move asked for, so the report can read it later.
    context.rung = prompt.stage?.rung || null;
    context.insider = prompt.insider || [];
    context.move = prompt.stage?.move || null;
    // How many of the team's own replies (texts, or past emails) the request showed, so the page can say.
    context.practice = (prompt.practiceIds || []).length;
    const allowed = allowedMaterial(item, prompt);
    // The auction car, its link and its figures are ours to state: they came from the live auction.
    // What the owner typed, and the offer, the order and the template, are pieces of their own for the list of facts.
    allowed.pieces.push({ source: 'your instruction', text: staffSaid });
    if (plan?.stage === 'offer') { allowed.trusted += `\n${plan.tail}\n${plan.lines.join('\n')}`; allowed.pieces.push({ source: 'your wording file', text: `${plan.tail}\n${plan.lines.join('\n')}` }); }
    // The order's own amounts are ours to state: code puts them where the AI left their markers.
    // So is everything a template says: it is the owner's own wording with our records' facts.
    if (plan?.stage === 'order' || plan?.stage === 'template') { allowed.trusted += `\n${plan.trustedText}`; allowed.pieces.push({ source: 'your wording file', text: plan.trustedText }); }
    const said = saidIn(item);
    // What the website says about the process (we inspect before bidding, VIA before shipping) is
    // ours to promise, and an auction date in the research is a known day.
    if (email && prompt.researchText) said.push({ who: 'us', text: prompt.researchText, at: now });

    // The Prompt line and Rewrite: the owner's words come first. A Could be better note is a lesson, not a Prompt.
    // byCode: code's own wording, not the AI's (see assessReply).
    const instructed = !!String(instruction || '').trim();
    const assess = (json, byCode = false) => assessReply(item, prompt, json, { plan, chat, email, research, again, staffSaid, instructed, allowed, said, coaching, now, byCode });
    const failures = (checks) => checks.filter((c) => c.level === 'fail').length;

    // An offer does not depend on the AI: its figures come from the auction. If no model can
    // answer, or it will not keep figures out of its lines, the opening is the standard one.
    const standardOpening = () => ({ json: { reply: plan.opening, needs_human: [], facts_used: [], hold: false }, provider: 'none', model: 'standard wording', byCode: true });
    // A template never depends on the AI either: if no model can answer, or what it wrote loses a
    // fact, the template is used word for word (always a reply, never a refusal).
    const fit = plan?.stage === 'template';
    // Why: 'unavailable' (no AI could be asked: fitted again later, while untouched) or 'facts' (the fitting lost a fact).
    const wordForWord = (why) => ({ json: { reply: plan.masked, needs_human: [], facts_used: [], hold: false }, provider: 'none', model: 'your wording', wordForWord: why, byCode: true });
    const usable = (e) => (plan?.stage === 'offer' && e instanceof LlmError && e.status !== 401 && e.status !== 403) || (fit && e instanceof LlmError);
    // Marketplace chats are the Marketplace job: the small model, so the better ones stay with dashboard customers.
    // A script (the review) may pin one model; otherwise the job's own list.
    const which = { role: chat ? 'marketplace' : 'write', pin };
    let result;
    // The same wording fitted before, with only its facts changed since: that fitting is used again.
    if (fit && tpl.fitted) result = { json: { reply: tpl.fitted, needs_human: [], facts_used: [], hold: false }, provider: tpl.fittedBy?.provider || 'none', model: tpl.fittedBy?.model || 'your wording', reused: true };
    else {
      try { result = await complete(prompt.system, prompt.user, which); }
      catch (e) {
        if (!usable(e)) throw e;
        logLine('suggestion', `${item.itemKey}: no AI model for ${fit ? `the template "${plan.label}", used word for word` : 'the opening of an auction offer, standard opening used'}. ${e.detail || e.message}`);
        result = fit ? wordForWord('unavailable') : standardOpening();
      }
    }
    let best = assess(result.json, result.byCode);

    // What goes back to the AI with a second request hides what the first one hid: the customer's
    // details, a template's facts (as their markers again), our records' facts in the compact
    // style (as theirs) and an order's amounts (as theirs). The reasons for the rejection quote the
    // reply, so they are hidden the same way.
    // facts: false leaves our records' values as they are (a figure the AI typed stays as it typed it).
    const forAi = (text, { facts = true } = {}) => {
      let t = String(text || '');
      if (fit) for (const m of [...plan.markers].sort((a, b) => b.value.length - a.value.length)) if (m.value.trim().length >= 3) t = t.split(m.value).join(`{{${m.name}}}`);
      if (prompt.factMarkers && facts) t = maskFacts(t, prompt.factMarkers);
      t = redact(t, item.lead);
      return plan?.mask ? plan.mask(t) : t;
    };
    // The reasons for the rejection, for the AI. The compact style's fact checks have their own
    // words for it (retry), naming each figure it typed and the marker to write instead: those are
    // kept out of forAi's masking, which would turn the figure into that very marker.
    const reasonsForAi = (checks) => {
      const own = [];
      const note = forAi(retryNote(checks.map((c) => (c.retry ? { ...c, retry: `\u0000${String.fromCharCode(97 + own.push(c.retry) - 1)}\u0000` } : c)), { channel: item.channel }));
      return note.replace(/\u0000([a-z])\u0000/g, (m, k) => redact(own[k.charCodeAt(0) - 97], item.lead));
    };
    // One second attempt when a hard check fails.
    if (worst(best.checks) === 'fail' && result.provider !== 'none') {
      try {
        // A template's rejected draft goes back as the AI wrote it, with its markers: never with the
        // facts put in. So does one in the compact style: with its markers, and the figures it typed.
        const rejected = fit ? String(result.json.reply || '') : prompt.factMarkers ? forAi(String(result.json.reply || '').replace(/\\n/g, '\n'), { facts: false }) : forAi(best.body);
        const again = await complete(prompt.system, `${prompt.user}\n\n${reasonsForAi(best.checks)}\n\nYour rejected draft was:\n${rejected}`, which);
        const second = assess(again.json);
        if (failures(second.checks) < failures(best.checks)) { result = again; best = second; }
      } catch (e) { if (!usable(e)) throw e; }
      if (plan?.stage === 'offer' && worst(best.checks) === 'fail') { result = standardOpening(); best = assess(result.json, true); }
      if (fit && worst(best.checks) === 'fail') { result = wordForWord('facts'); best = assess(result.json, true); }
    }
    if (fit && result.wordForWord) best.checks = [...best.checks.filter((c) => c.level !== 'ok'), { level: 'warn', code: 'template-word-for-word', tokens: [], message: result.wordForWord === 'unavailable'
      ? `Written word for word from your template "${plan.label}": the AI was not available just now. ${item.order ? 'While you leave it unchanged it is fitted to the customer on a later check.' : 'Press Rewrite to fit it to the customer once the AI is back.'}`
      : `Written word for word from your template "${plan.label}": the AI could not fit it to this customer without changing a fact.` }];
    // What the AI made of the template, with its markers: written again with new facts, it is used again.
    // One with our records' fact markers in it (the compact style) is not: those are numbered afresh in every request.
    if (fit) { context.masked = plan.masked; context.fitted = result.wordForWord || (prompt.factMarkers && hasFactMarker(result.json.reply)) ? null : String(result.json.reply || ''); context.fitLater = result.wordForWord === 'unavailable'; context.asked = tpl.asked || ''; }

    // The compact style: what the AI wrote beside the reply (its facts, its next step, what a
    // person must decide) gets our records' facts back too.
    const answer = prompt.factMarkers ? restoreAnswer(result.json, prompt.factMarkers) : result.json;
    // The AI's own reading of an ordinary enquiry: it may think the customer wants a car found in
    // Japan. The page then offers to treat it as an import enquiry; nothing changes by itself.
    context.aiImport = !chat && !email && !item.order && !item.imports && answer.import_enquiry === true;
    // On Marketplace, links to our website say they came from Facebook. Added after the checks,
    // which compare links without the tag.
    const reply = chat ? tagMarketplaceLinks(best.reply) : best.reply;
    // The reply's parts, found in it as it stands: the AI's words and each block code added. On
    // Marketplace each block's links are tagged as the reply's are, so the parts still join to it.
    context.parts = partsOf(reply, (best.blocks || []).map((b) => (chat ? { ...b, text: tagMarketplaceLinks(b.text) } : b)));
    // Each figure and link in the AI's part, traced to where it came from (traceFacts in src/checks.js),
    // and the figures and links in each block. The checks the draft already has say which failed.
    const aiPart = context.parts[0]?.kind === 'ai' ? context.parts[0].text : reply;
    const failTokens = best.checks.filter((c) => ['figure', 'customer-figure', 'price-floor', 'link', 'figure-raw'].includes(c.code)).flatMap((c) => c.tokens || []);
    const marked = [];
    if (prompt.factMarkers) restoreFacts(String(result.json.reply || '').replace(/\\n/g, '\n'), prompt.factMarkers, { used: marked });
    const stockLinks = [...(prompt.inspection?.urls || []), prompt.inspection?.url, prompt.price?.inspectionUrl, prompt.standard?.vehicleUrl, prompt.standard?.inspectionUrl, item.vehicles[0]?.url, ...(prompt.media?.links || []).map((l) => l.url)].filter(Boolean);
    context.facts = traceFacts(aiPart, allowed.pieces, failTokens, { blocks: context.parts.filter((p) => p.kind === 'block'), stockLinks, marked });
    // The owner's lessons the request carried, when the reply is that request's answer: not a
    // template used word for word, a fitting used again, or the standard opening of an offer.
    const answered = !result.byCode && !result.reused;
    context.lessons = answered ? (prompt.owner?.lessons || []).map((l) => ({ adviceId: l.adviceId, n: l.n, do: l.do, scope: l.scope, at: l.at })) : [];
    // The business facts the AI's words used, for the trust line, and those with no answer the reply
    // left a blank for, for the line above the box (src/factcite.js). Only for a reply the AI wrote
    // from the whole request: a template, an auction or import message, or code's own wording, none.
    const plain = answered && !fit && !plan;
    context.topics = plain ? citedTopics({ asked: prompt.askedText, reply: aiPart, topics: prompt.factTopics }) : [];
    context.openTopics = plain ? openTopics({ asked: prompt.askedText, reply, topics: prompt.factTopics }) : [];
    // The once-a-day rule shaped the reply only when both the greeting and the closing were left out:
    // not for a template (its own greeting and closing), a Prompt or Rewrite (the greeting is kept),
    // or an import, auction or order reply (their closing lines are kept).
    context.rules = rulesOf(best.blocks, { again: again && !fit && !instructed && !plan, playbook: answered && style === 'compact' });
    const draft = {
      ...base,
      status: 'ready',
      reply,
      needsHuman: Array.isArray(answer.needs_human) ? answer.needs_human : [],
      // What was looked up for an import email, for the page's research notes.
      research: rendered ? rendered.panel : null,
      factsUsed: [
        ...(rendered ? rendered.panel.found.slice(0, 6) : []),
        ...(plan?.stage === 'offer' ? [`Auction car ${plan.lot.id}: ${plan.lot.title}, ${plan.lot.km.toLocaleString('en-AU')} km, grade ${plan.lot.grade}`, `The website's suggested bid ¥${plan.lot.benchmarkYen.toLocaleString('en-AU')}; bid used ¥${plan.bidYen.toLocaleString('en-AU')} (${plan.bidBy === 'suggested' ? 'ours' : plan.bidBy === 'staff' ? 'yours' : "the customer's"})`, ...(plan.pick ? [bidBasisLine(plan.pick)] : []), `Estimated landed and complied $${plan.estimate.totalAud.toLocaleString('en-AU')} from the website's calculator`] : []),
        ...(plan?.stage === 'template' ? plan.factsUsed : []),
        ...(Array.isArray(answer.facts_used) ? answer.facts_used.map(String).slice(0, 12) : []),
      ],
      nextStep: String(answer.next_step || ''),
      rung: String(answer.rung || prompt.stage?.rung || ''),
      checks: best.checks,
      provider: result.provider,
      model: result.model,
      // The tokens the answer used, for the review's cost line. Not kept in the database.
      usage: result.usage || null,
      exampleIds: prompt.exampleIds,
    };
    const kept = persist(draft);
    // Each lesson it followed is counted once the suggestion is kept, for the list of lessons. A count
    // that cannot be written is logged: the suggestion is kept all the same, and no failed one is added.
    if (kept.id && !kept.dropped && context.lessons.length) {
      try { countLessonUse(context.lessons.map((l) => l.adviceId)); }
      catch (e) { logLine('suggestion', `${item.itemKey}: the lessons this suggestion followed could not be counted. ${e.message}`); }
    }
    return kept;
  } catch (e) {
    const d = { ...base, status: 'failed', reply: '', error: e.message, checks: [{ level: 'fail', code: 'error', message: e.message }] };
    persist(d);
    d.daily = !!e.daily;
    // Busy or used-up free models sort themselves out. A rejected key, or a fault in the app, does not.
    d.temporary = e instanceof LlmError && e.status !== 401 && e.status !== 403 && !/No AI key/.test(e.message);
    logLine('suggestion', `${item.itemKey} could not be written. ${e.message}${e.detail ? ` | ${e.detail}` : ''}${e instanceof LlmError ? '' : ` | ${String(e.stack || '').split('\n').slice(1, 4).join(' ')}`}`);
    return d;
  }
}
