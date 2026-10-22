// The standard price reply, in the owner's words, added by code under the AI's lines when a
// customer asks for the best price, a discount, or makes an offer. What the price includes is built
// from that vehicle's own Included list, so it is never a guess, and the invitation to inspect
// comes with it when the car can be seen. The wording lives in voice/price-reply.md.

import { template, fill } from './templates.js';
import { inviteBlock } from './firstreply.js';

// The owner's six, in his order and his words, each matched against the car's Included lines.
// The extended warranty carries a year of roadside assistance (BUSINESS FACTS), so the two are
// said together; roadside listed on its own is said on its own.
const REGISTRATION = /\b(\d+)\s*months?\b[^\n]*\b(?:rego|registration)\b|\b(?:rego|registration)\b[^\n]*\b(\d+)\s*months?\b/i;
const EXTENDED = /\b(\d+)[\s-]*years?\b[^\n]*\bextended\b[^\n]*\bwarranty\b|\bextended\s+warranty\b/i;
const ROADSIDE = /\broadside\b/i;
const YEARS = /\b(\d+)[\s-]*years?\b/i;
const CTP = /\bctp\b/i;
const ROADWORTHY = /\b(?:roadworthy|blue slip|pink slip|rwc)\b/i;
const DELIVERY = /\bdelivery\b/i;
const DEALER = /\b(\d+)[\s-]*months?\b[^\n]*\bdealer\s+warranty\b|\bdealer\s+warranty\b/i;

/** "6 months NSW registration, a 5-year extended warranty, 1 year roadside assistance and CTP insurance", from the car's Included list. '' when none of them is listed. */
export function inclusionsSentence(vehicle, { asked = '' } = {}) {
  const lines = (vehicle?.outline || []).map((l) => String(l || ''));
  const find = (re) => { for (const l of lines) { const m = l.match(re); if (m) return { m, line: l }; } return null; };
  const out = [];
  const rego = find(REGISTRATION);
  if (rego) out.push(`${rego.m[1] || rego.m[2]} months NSW registration`);
  const extended = find(EXTENDED);
  const roadside = find(ROADSIDE);
  if (extended) {
    out.push(`a ${extended.m[1] || 5}-year extended warranty`);
    const years = roadside ? roadside.line.match(YEARS) : null;
    out.push(`${years ? years[1] : 1} year roadside assistance`);
  } else if (roadside) {
    const years = roadside.line.match(YEARS);
    out.push(`${years ? years[1] : 1} year roadside assistance`);
  }
  if (find(CTP)) out.push('CTP insurance');
  if (find(ROADWORTHY)) out.push('a fresh roadworthy certificate');
  if (find(DELIVERY)) out.push('Greater Sydney delivery');
  const dealer = find(DEALER);
  if (dealer) out.push(`a ${dealer.m[1] || 3}-month dealer warranty`);
  if (!out.length) return '';
  return list(pickInclusions(out, asked));
}

const ASKS_ON_ROAD = /drive.?away|on.?road|\brego\b|registration|\bctp\b|roadworthy|blue slip|pink slip|stamp duty|government charges|transfer fee/i;
const ASKS_COVER = /warrant|\bimport|japan|reliab|cover|roadside|breakdown|mechanical/i;
/** The inclusions that answer what the customer asked; all of them when they asked about nothing in particular, or none of theirs is listed. */
export function pickInclusions(items, asked) {
  const text = String(asked || '');
  const onRoad = ASKS_ON_ROAD.test(text);
  const cover = ASKS_COVER.test(text);
  if (!onRoad && !cover) return items;
  const picked = items.filter((i) => (onRoad && /registration|CTP|roadworthy/.test(i)) || (cover && /warranty|roadside/.test(i)));
  return picked.length ? picked : items;
}

/**
 * The three inclusions a Marketplace first reply names, as the team says them: "6 months rego, a
 * fresh roadworthy and a 5-year warranty", keeping only what the car's Included list has, in that
 * order. '' when it has none of them.
 */
export function inclusionsShort(vehicle) {
  const lines = (vehicle?.outline || []).map((l) => String(l || ''));
  const find = (re) => { for (const l of lines) { const m = l.match(re); if (m) return m; } return null; };
  const out = [];
  const rego = find(REGISTRATION);
  if (rego) out.push(`${rego[1] || rego[2]} months rego`);
  if (find(ROADWORTHY)) out.push('a fresh roadworthy');
  const extended = find(EXTENDED);
  if (extended) out.push(`a ${extended[1] || 5}-year warranty`);
  return out.length ? list(out) : '';
}

/** "a, b and c" */
const list = (out) => (out.length === 1 ? out[0] : `${out.slice(0, -1).join(', ')} and ${out[out.length - 1]}`);

/**
 * The price reply for one car. inspectionUrl: the booking link when the car can be seen ('' when
 * not); online: the video inspection link rather than the in-person one; chat: Facebook
 * Marketplace wording where the two differ; withStandard: the first-reply block follows, so the
 * invitation's last line ("Please call or text before visiting.") is left to the block.
 */
export function priceBlock({ vehicle = null, inspectionUrl = '', online = false, chat = false, withStandard = false, asked = '' } = {}) {
  const t = template('price-reply.md');
  if (!t) return '';
  const inclusions = inclusionsSentence(vehicle, { asked });
  let text = fill(t.text, { inclusions, inspection_invite: inspectionUrl ? inviteBlock(inspectionUrl, { online, chat, tail: !withStandard }) : '' });
  if (!inclusions) text = text.replace(/^The price includes[^\n]*/m, t.snippets.no_inclusions || 'The advertised price excludes government charges.');
  return text.replace(/\n{3,}/g, '\n\n').trim();
}
