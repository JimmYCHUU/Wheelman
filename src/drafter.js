// Produces one suggested reply for one waiting customer.

import { buildPrompt, writtenToday } from './prompt.js';
import { complete } from './llm.js';
import { finishReply, fixGreeting, checkDraft, retryNote, stripModelSignOff, worst, chatStyle, dropGreeting } from './checks.js';
import { config } from './config.js';
import { redact } from './redact.js';
import { insertDraft } from './db.js';
import { sydneyHour } from './time.js';

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
  return {
    trusted: [prompt.vehicleText, alts, ours, prompt.user.split('=== VEHICLE FACTS ===')[0]].join('\n'),
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

/** When the customer asked to see the car, the reply should carry the right booking link. */
function inspectionCheck(plan, body) {
  if (!plan?.url || body.includes(plan.url)) return null;
  const givesInPerson = body.includes('#inspection=onsite');
  const givesOnline = body.includes('#inspection=online');
  if (plan.kind === 'online') {
    return { level: 'warn', code: 'inspection-link', tokens: [], message: givesInPerson
      ? 'The customer seems to be far away, but the reply gives the in-person booking link. The online video inspection link may suit better.'
      : 'The customer asked to see the car and seems to be far away, but the reply has no online video inspection link.' };
  }
  // In-person was expected. A confirmed time ("See you at ...") or the online link is also a fair answer.
  if (givesOnline || /see you/i.test(body)) return null;
  return { level: 'warn', code: 'inspection-link', tokens: [], message: 'The customer asked to see the car, but the reply has no inspection booking link.' };
}

export async function draftFor(item, { instruction = '', save = true, holdOutConversation = true, now = Date.now() } = {}) {
  const base = { itemKey: item.itemKey, anchorKey: item.anchorKey, situation: item.situation.primary, instruction };

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

    const assess = (json) => {
      let body = fixGreeting(stripModelSignOff(String(json.reply || '').replace(/\\n/g, '\n')), sydneyHour(now));
      if (chat) body = chatStyle(body);
      else if (again) body = dropGreeting(body);
      // Marketplace suggestions carry no sign-off: it is a chat, not a text message.
      const reply = finishReply(json.reply, item.lead, { now, signOff: chat || again ? '' : config.signOff, chat, greeting: !again });
      let checks = checkDraft({
        channel: item.channel,
        reply, body,
        needsHuman: json.needs_human,
        allowedText: allowed.trusted, policyText: allowed.policy, customerText: allowed.customer,
        instruction, situation: item.situation, hold: !!json.hold,
        examples: prompt.exampleReplies, inConversation: !item.isFirstReply,
      });
      const listing = chat ? listingPriceCheck(item) : null;
      if (listing) checks = [...checks.filter((c) => c.level !== 'ok'), listing];
      const visit = inspectionCheck(prompt.inspection, body);
      if (visit) checks = [...checks.filter((c) => c.level !== 'ok'), visit];
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
