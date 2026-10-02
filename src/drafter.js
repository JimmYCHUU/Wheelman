// Produces one suggested reply for one waiting customer.

import { buildPrompt, writtenToday } from './prompt.js';
import { complete } from './llm.js';
import { finishReply, fixGreeting, checkDraft, retryNote, stripModelSignOff, worst, chatStyle, dropGreeting } from './checks.js';
import { config } from './config.js';
import { redact } from './redact.js';
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
    trusted: [prompt.vehicleText, alts, booking, ours, prompt.user.split('=== VEHICLE FACTS ===')[0]].join('\n'),
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
function blockCheck(body, vehicleUrl, inspectionUrl = '') {
  let again = repeatsBlock(body);
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

export async function draftFor(item, { instruction = '', save = true, holdOutConversation = true, now = Date.now() } = {}) {
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
    const prompt = buildPrompt(item, { instruction, holdOutConversation, now });
    const allowed = allowedMaterial(item, prompt);
    const said = saidIn(item);

    const assess = (json) => {
      // A brand-new enquiry gets the team's standard block in place of the sign-off. A holding
      // reply (a complaint, say) does not.
      const { vehicleUrl, inspectionUrl } = prompt.standard;
      const block = prompt.standard.on && !json.hold ? standardBlock({ vehicleUrl, inspectionUrl }) : '';
      let text = String(json.reply || '').replace(/\\n/g, '\n');
      if (block) text = tidyOpening(text, vehicleUrl, inspectionUrl);
      let body = fixGreeting(stripModelSignOff(text), sydneyHour(now));
      if (chat) body = chatStyle(body);
      else if (again) body = dropGreeting(body);
      // Marketplace suggestions carry no sign-off: it is a chat, not a text message.
      const reply = finishReply(text, item.lead, { now, signOff: chat || again ? '' : block || config.signOff, chat, greeting: !again });
      let checks = checkDraft({
        channel: item.channel,
        reply, body,
        needsHuman: json.needs_human,
        allowedText: allowed.trusted, policyText: allowed.policy, customerText: allowed.customer,
        instruction, situation: item.situation, hold: !!json.hold,
        examples: prompt.exampleReplies, inConversation: !item.isFirstReply,
        said, now,
      });
      const repeat = block ? blockCheck(body, vehicleUrl, inspectionUrl) : null;
      if (repeat) checks = [...checks.filter((c) => c.level !== 'ok'), repeat];
      // A label such as "[inspection booking link]" stands for a link in another customer's reply.
      const label = body.match(LEFTOVER_LABEL);
      if (label) checks = [...checks.filter((c) => c.level !== 'ok'), { level: 'fail', code: 'label', tokens: [label[0]], message: `"${label[0]}" is a label from an example, not a real link or figure. Use the real one from this request, or leave it out.` }];
      const listing = chat ? listingPriceCheck(item) : null;
      if (listing) checks = [...checks.filter((c) => c.level !== 'ok'), listing];
      const visit = inspectionCheck(prompt.inspection, body, block);
      if (visit) checks = [...checks.filter((c) => c.level !== 'ok'), visit];
      const buyer = buyerCheck(item, body);
      if (buyer) checks = [...checks.filter((c) => c.level !== 'ok'), buyer];
      return { body, reply, checks };
    };
    const failures = (checks) => checks.filter((c) => c.level === 'fail').length;

    let result = await complete(prompt.system, prompt.user);
    let best = assess(result.json);

    // One second attempt when a hard check fails.
    if (worst(best.checks) === 'fail') {
      const again = await complete(prompt.system, `${prompt.user}\n\n${retryNote(best.checks)}\n\nYour rejected draft was:\n${redact(best.body, item.lead)}`);
      const second = assess(again.json);
      if (failures(second.checks) < failures(best.checks)) { result = again; best = second; }
    }

    const draft = {
      ...base,
      status: 'ready',
      reply: best.reply,
      needsHuman: Array.isArray(result.json.needs_human) ? result.json.needs_human : [],
      factsUsed: Array.isArray(result.json.facts_used) ? result.json.facts_used.map(String).slice(0, 12) : [],
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
    return d;
  }
}
