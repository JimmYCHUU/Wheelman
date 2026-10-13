// Our address, in one place. The yard moved to 136 Frances Street. The old address and the old
// Google Maps link still sit in the team's past replies, the example bank and old lessons, all of
// which the AI reads: everything shown to it from the past has our address replaced by a label, and
// a reply that gives the old address or a map link fails its checks. The AI learns our address from
// BUSINESS FACTS; the standard block carries it, added by code.

import { config } from './config.js';

/** Our address as it is today, from the settings. */
export const CURRENT_ADDRESS = config.site.address;

/** The old address, in the ways it was typed: "Unit D3, 128-130 Frances Street, Lidcombe NSW 2141", "128 Frances St", "Unit D3". */
export const OLD_ADDRESS = /\bunit\s+d3\b(?:,?\s*128(?:\s*[–-]\s*130)?\s+frances\s+st(?:reet)?\b)?(?:,?\s*lidcombe(?:\s+nsw)?(?:\s+2141)?)?|\b128(?:\s*[–-]\s*130)?\s+frances\s+st(?:reet)?\b(?:,?\s*lidcombe(?:\s+nsw)?(?:\s+2141)?)?/i;

/** A Google Maps link. No longer sent in any message. */
export const MAPS_LINK = /https?:\/\/(?:maps\.app\.goo\.gl|(?:www\.)?google\.[a-z.]+\/maps)\S*/i;

// Any address of ours, old or new, with the unit and suburb around it when they are there.
const ANY_ADDRESS = /(?:\bunit\s+d3\b,?\s*)?\b1(?:28|36)(?:\s*[–-]\s*130)?\s+frances\s+st(?:reet)?\b(?:,?\s*lidcombe(?:\s+nsw)?(?:\s+2141)?)?|\bunit\s+d3\b/gi;
const ANY_MAPS_LINK = new RegExp(MAPS_LINK.source, 'gi');

/**
 * Text shown to the AI from a past reply, with our address (old or new) and any map link replaced
 * by labels, so a stale address is never copied into a new reply.
 */
export function labelAddress(text) {
  return String(text ?? '').replace(ANY_ADDRESS, '[our address]').replace(ANY_MAPS_LINK, '[Google Maps link]');
}

/** The old address or a map link found in a reply, or '' when there is none. */
export function oldAddressIn(text) {
  const t = String(text || '');
  const m = t.match(OLD_ADDRESS) || t.match(MAPS_LINK);
  return m ? m[0] : '';
}
