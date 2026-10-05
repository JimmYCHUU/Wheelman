// Produces one suggested reply for one waiting customer.

import { buildPrompt, writtenToday } from './prompt.js';
import { complete, LlmError } from './llm.js';
import { logLine } from './log.js';
import { finishReply, fixGreeting, checkDraft, retryNote, stripModelSignOff, worst, chatStyle, dropGreeting } from './checks.js';
import { config } from './config.js';
import { redact, restore } from './redact.js';
import { planImport, auctionNote } from './imports.js';
import { insertDraft } from './db.js';
import { sydneyHour } from './time.js';
import { standardBlock, repeatsBlock, tidyOpening } from './firstreply.js';
import { LEFTOVER_LABEL } from './practice.js';

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
  return {
    trusted: [prompt.vehicleText, alts, booking, prompt.sameModelUrl || '', (prompt.importUrls || []).join('\n'), ours, prompt.user.split('=== VEHICLE FACTS ===')[0]].join('\n'),
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

/**
 * When the customer asked to see the car, the reply should carry the right booking link.
 * A reply with no link at all is sent back once when the customer asked now, or our staff asked
 * for the link. When the customer asked earlier in the conversation it is only pointed out.
 */
function inspectionCheck(plan, body, block = '') {
  if (!plan?.url) return null;
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
  if (givesOnline || /see you/i.test(body)) return null;
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

/** With the standard block below it, the AI's own lines must not give the address, hours, links or phone again. */
function blockCheck(body, vehicleUrl, inspectionUrl = '', { askedWhere = false } = {}) {
  // Pointing at the block ("our address is below") is not an answer. The sentence must stand on its own.
  const pointer = body.match(/\b(?:is|are|see|listed|shown|given|found|details?|address|hours|link)\s+(?:just\s+|right\s+)?below\b|\bbelow[.:]?\s*$/im);
  if (pointer) return { level: 'fail', code: 'block-pointer', tokens: [pointer[0]], message: `The reply points at the block ("${pointer[0].trim()}"). Say the answer in the sentence itself and leave out "below".` };
  // A customer who asked where we are, or when we are open, is answered in the AI's own sentence too.
  let again = askedWhere ? '' : repeatsBlock(body);
  if (!again && inspectionUrl && body.includes(inspectionUrl)) again = inspectionUrl;
  if (!again && vehicleUrl) {
    // The inspection booking link starts with the vehicle's page link, so only the bare page link counts.
    const at = body.indexOf(vehicleUrl);
    if (at !== -1 && body[at + vehicleUrl.length] !== '#') again = vehicleUrl;
  }
  if (!again) return null;
  return { level: 'fail', code: 'block-repeat', tokens: [again], message: `The reply repeats "${again}", which the standard block below it already gives. Leave the address, hours, links and phone number to the block.` };
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
 * @param coaching  { note, draft } from "Could be better": what the owner said about the last
 *                  draft, and that draft. It guides the rewrite; it is not wording to send.
 */
export async function draftFor(item, { instruction = '', coaching = null, save = true, holdOutConversation = true, now = Date.now() } = {}) {
  // What the message was about when the suggestion was written. Once it is answered the item no
  // longer says, so learning and the report read it from here.
  const context = {
    situations: item.situation.all,
    firstReply: item.isFirstReply,
    channel: item.channel,
    anchorAgeHours: item.lastInboundAt ? Math.round((now - item.lastInboundAt) / 360000) / 10 : null,
    newEnquiry: !!item.isNewEnquiry,
    buyer: !!item.deal,
    dealSource: item.deal?.source || null,
    stage: item.deal?.stage || null,
    coached: !!coaching,
  };
  const base = { itemKey: item.itemKey, anchorKey: item.anchorKey, situation: item.situation.primary, instruction, context };

  if (item.state === 'optout') {
    const d = { ...base, status: 'blocked', reply: '', checks: [{ level: 'fail', code: 'optout', message: 'Customer asked not to be contacted. No reply suggested.' }] };
    if (save) d.id = insertDraft(d);
    return d;
  }

  try {
    const chat = item.channel === 'marketplace';
    // The greeting and "Regards, Team Carbarn" go on the first reply to a customer each day, not on every message.
    const again = !chat && writtenToday(item, now);
    // The owner's figures, links and promises count as staff-given, whichever box they were typed in.
    const staffSaid = [instruction, coaching?.note].filter(Boolean).join('\n');

    // An import or auction enquiry: what to ask, or which auction car to offer, is worked out first.
    let plan = null;
    if (!chat && item.imports) {
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
      const d = { ...base, status: 'ready', reply, needsHuman: [], factsUsed: [], nextStep: 'asked what they are looking for', checks: [{ level: 'ok', code: 'ok', message: 'Standard wording for a new import enquiry.', tokens: [] }], provider: 'none', model: 'standard wording', exampleIds: [] };
      if (save) d.id = insertDraft(d);
      return d;
    }

    const prompt = buildPrompt(item, { instruction, coaching, importPlan: plan, holdOutConversation, now });
    const allowed = allowedMaterial(item, prompt);
    // The auction car, its link and its figures are ours to state: they came from the live auction.
    if (plan?.stage === 'offer') allowed.trusted += `\n${plan.tail}\n${plan.lines.join('\n')}`;
    const said = saidIn(item);

    const assess = (json) => {
      // A brand-new enquiry gets the team's standard block in place of the sign-off. A holding
      // reply (a complaint, say) does not.
      const { vehicleUrl, inspectionUrl } = prompt.standard;
      const offer = plan?.stage === 'offer';
      // An import reply has its own lines underneath: the whole offer, or the short contact block.
      const block = plan ? (json.hold ? '' : plan.tail || '') : prompt.standard.on && !json.hold ? standardBlock({ vehicleUrl, inspectionUrl }) : '';
      let text = String(json.reply || '').replace(/\\n/g, '\n');
      if (block) text = tidyOpening(text, vehicleUrl, inspectionUrl);
      // An offer opens the way the team writes it: the greeting, a blank line, then one short paragraph.
      if (offer) text = text.trim().replace(/^([^\n]{1,40},)\n+/, (m, hi) => `${hi}\n\n`).replace(/([^\n])\n(?!\n)/g, (m, c) => `${c} `);
      let body = fixGreeting(stripModelSignOff(text), sydneyHour(now));
      if (chat) body = chatStyle(body);
      else if (again && !offer) body = dropGreeting(body);
      // Marketplace suggestions carry no sign-off: it is a chat, not a text message. An import
      // reply keeps its closing lines even when we have already written today.
      const signOff = chat ? '' : plan && block ? block : again ? '' : block || config.signOff;
      const reply = finishReply(text, item.lead, { now, signOff, chat, greeting: offer || !again });
      let checks = checkDraft({
        channel: item.channel,
        reply, body,
        needsHuman: json.needs_human,
        allowedText: allowed.trusted, policyText: allowed.policy, customerText: allowed.customer,
        instruction: staffSaid, situation: item.situation, hold: !!json.hold,
        examples: prompt.exampleReplies, inConversation: !item.isFirstReply,
        said, now,
      });
      const repeat = offer
        ? (/[$¥]\s?\d|https?:\/\//.test(body) ? { level: 'fail', code: 'block-repeat', tokens: [], message: 'The opening states a figure or a link. The block below it gives the car, the bid, the costs and the link: write only the greeting and why the car may suit.' } : null)
        : block ? blockCheck(body, vehicleUrl, inspectionUrl, { askedWhere: !plan && item.situation.all.includes('location_hours') }) : null;
      if (offer) {
        checks = [...checks.filter((c) => c.level !== 'ok'),
          { level: 'input', code: 'marker', tokens: ['[DEPOSIT LINK?]'], message: 'Paste the deposit link before sending.' },
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
      const visit = inspectionCheck(prompt.inspection, body, block);
      if (visit) checks = [...checks.filter((c) => c.level !== 'ok'), visit];
      const buyer = buyerCheck(item, body);
      if (buyer) checks = [...checks.filter((c) => c.level !== 'ok'), buyer];
      return { body, reply, checks };
    };
    const failures = (checks) => checks.filter((c) => c.level === 'fail').length;

    // An offer does not depend on the AI: its figures come from the auction. If no model can
    // answer, or it will not keep figures out of its lines, the opening is the standard one.
    const standardOpening = () => ({ json: { reply: plan.opening, needs_human: [], facts_used: [], hold: false }, provider: 'none', model: 'standard wording' });
    const usable = (e) => plan?.stage === 'offer' && e instanceof LlmError && e.status !== 401 && e.status !== 403;
    let result;
    try { result = await complete(prompt.system, prompt.user); }
    catch (e) { if (!usable(e)) throw e; logLine('suggestion', `${item.itemKey}: no AI model for the opening of an auction offer, standard opening used. ${e.detail || e.message}`); result = standardOpening(); }
    let best = assess(result.json);

    // One second attempt when a hard check fails.
    if (worst(best.checks) === 'fail' && result.provider !== 'none') {
      try {
        const again = await complete(prompt.system, `${prompt.user}\n\n${retryNote(best.checks)}\n\nYour rejected draft was:\n${redact(best.body, item.lead)}`);
        const second = assess(again.json);
        if (failures(second.checks) < failures(best.checks)) { result = again; best = second; }
      } catch (e) { if (!usable(e)) throw e; }
      if (plan?.stage === 'offer' && worst(best.checks) === 'fail') { result = standardOpening(); best = assess(result.json); }
    }

    const draft = {
      ...base,
      status: 'ready',
      reply: best.reply,
      needsHuman: Array.isArray(result.json.needs_human) ? result.json.needs_human : [],
      factsUsed: [
        ...(plan?.stage === 'offer' ? [`Auction car ${plan.lot.id}: ${plan.lot.title}, ${plan.lot.km.toLocaleString('en-AU')} km, grade ${plan.lot.grade}`, `Carbarn's suggested bid ¥${plan.lot.benchmarkYen.toLocaleString('en-AU')}; bid used ¥${plan.bidYen.toLocaleString('en-AU')} (${plan.bidBy === 'suggested' ? 'rounded up' : plan.bidBy === 'staff' ? 'yours' : "the customer's"})`, `Estimated landed and complied $${plan.estimate.totalAud.toLocaleString('en-AU')} from the website's calculator`] : []),
        ...(Array.isArray(result.json.facts_used) ? result.json.facts_used.map(String).slice(0, 12) : []),
      ],
      nextStep: String(result.json.next_step || ''),
      checks: best.checks,
      provider: result.provider,
      model: result.model,
      exampleIds: prompt.exampleIds,
    };
    if (save) draft.id = insertDraft(draft);
    return draft;
  } catch (e) {
    const d = { ...base, status: 'failed', reply: '', error: e.message, checks: [{ level: 'fail', code: 'error', message: e.message }] };
    if (save) d.id = insertDraft(d);
    d.daily = !!e.daily;
    // Busy or used-up free models sort themselves out. A rejected key, or a fault in the app, does not.
    d.temporary = e instanceof LlmError && e.status !== 401 && e.status !== 403 && !/No AI key/.test(e.message);
    logLine('suggestion', `${item.itemKey} could not be written. ${e.message}${e.detail ? ` | ${e.detail}` : ''}${e instanceof LlmError ? '' : ` | ${String(e.stack || '').split('\n').slice(1, 4).join(' ')}`}`);
    return d;
  }
}
