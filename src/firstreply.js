// The standard block we send on a first reply: the car's page, the booking link when the customer
// asked to see the car, the address, hours and phone number. The wording lives in
// voice/first-reply.md so it can be edited without touching code. The AI never writes this block:
// code adds it, so every symbol and word is exact.

import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { template, fill } from './templates.js';
import { versionsStamp } from './db.js';
import { templateLines, inPreview } from './wording.js';

let cache = { file: '', mtime: 0, stamp: -1, parts: [] };

/**
 * The parts of the block, from the file, with its wording saved in the Playbook laid over it
 * (templateLines in src/wording.js). Read again whenever the file changes or the Playbook saves;
 * inside a preview, read afresh and not kept.
 */
function parts() {
  const file = path.join(config.voiceDir, 'first-reply.md');
  let stat;
  try { stat = fs.statSync(file); } catch { return []; }
  const cached = !inPreview();
  const stamp = versionsStamp();
  if (cached && file === cache.file && stat.mtimeMs === cache.mtime && stamp === cache.stamp) return cache.parts;
  const lines = templateLines('first-reply.md');
  const out = lines ? lines.join('\n').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean) : [];
  if (cached) cache = { file, mtime: stat.mtimeMs, stamp, parts: out };
  return out;
}

/**
 * The block for one reply. A part whose placeholder has nothing to fill it is left out, so a
 * reply about no particular car has no "Vehicle details" lines, and one where nobody asked to
 * see the car has no booking link.
 */
export function standardBlock({ vehicleUrl = '', inspectionUrl = '', online = false } = {}) {
  const url = String(inspectionUrl || '').trim();
  const values = { vehicle_url: String(vehicleUrl || '').trim(), inspection_invite: url ? inviteBlock(url, { online, tail: false }) : '', sender: config.firstReplySender };
  const out = [];
  for (const part of parts()) {
    let missing = false;
    const filled = part.replace(/\{([a-z_]+)\}/g, (m, name) => { const v = values[name]; if (!v) missing = true; return v || ''; });
    if (!missing) out.push(filled);
  }
  return out.join('\n\n');
}

/** True when the block has a place for this placeholder, e.g. 'inspection_url'. */
export const blockCarries = (name) => parts().some((p) => p.includes(`{${name}}`));

/** The headings the block uses ("Vehicle details:", "Our location:"), lower case, without the colon. */
export function blockHeadings() {
  return parts().map((p) => p.split('\n')[0].trim()).filter((l) => /:\s*$/.test(l) && l.length <= 60).map((l) => l.replace(/:\s*$/, '').toLowerCase());
}

/**
 * True when the AI's own lines repeat what a block under them already says: the standard
 * block's address, hours and phone (address), the price reply's own sentences (price), or the
 * invitation's (inspection). Returns the words that repeat, or ''.
 */
export function repeatsBlock(opening, { address = true, price = false, inspection = false } = {}) {
  const s = String(opening || '');
  const tries = [
    address && /(frances\s+st(reet)?|\b8\s?(:00)?\s?am\b.{0,14}\b5\s?(:00)?\s?pm\b|open (7|seven) days|0423\s?840\s?130)/i,
    price && /(price includes|government charges|prices competitive|small discount|serious buyer)/i,
    inspection && /(you can book an (online video )?inspection here|preferred date and time|we'?ll arrange it for you|call or text before visiting|message or call before visiting)/i,
  ].filter(Boolean);
  for (const re of tries) { const m = s.match(re); if (m) return m[0]; }
  return '';
}

/**
 * The invitation to inspect, in the owner's words (voice/inspection-invite.md), with the booking
 * link: in person, or the online video inspection when the customer is far away. tail: the last
 * line ("Please call or text before visiting.") is left off when the first-reply block follows
 * and says it; chat: the Marketplace wording of that line.
 */
export function inviteBlock(url, { online = false, chat = false, tail = true } = {}) {
  const t = template('inspection-invite.md');
  const link = String(url || '').trim();
  if (!t || !link) return '';
  const lead = (online && t.snippets.online) || t.snippets.onsite || '';
  const body = fill(t.text, { lead, inspection_url: link }).trim();
  const end = tail ? ((chat && t.snippets.tail_chat) || t.snippets.tail || '') : '';
  return end ? `${body}\n${end}` : body;
}

/** Every fixed line of the invitation, so a reply the team sent with it is not learned as their own words. */
export function inviteLines() {
  const t = template('inspection-invite.md');
  if (!t) return [];
  return [...Object.values(t.snippets), ...t.text.split('\n')].map((l) => l.trim()).filter((l) => l && !/^\{[a-z_]+\}$/.test(l));
}

/**
 * Removes a line of the AI's opening that is only a link the block gives (the car's page, the
 * booking link), together with a lead-in line such as "More details here:".
 */
export function tidyOpening(opening, ...urls) {
  const given = urls.filter(Boolean).map((u) => u.replace(/\/$/, ''));
  if (!given.length) return opening;
  const lines = String(opening || '').split('\n');
  const out = [];
  for (const line of lines) {
    const bare = line.trim().replace(/\/$/, '');
    if (given.includes(bare)) {
      while (out.length && out[out.length - 1].trim() === '') out.pop();
      // The lead-in is the last sentence of the line above; anything said before it stays.
      if (out.length && /:\s*$/.test(out[out.length - 1])) {
        const kept = out.pop().split(/(?<=[.!?])\s+/).slice(0, -1).join(' ').trim();
        if (kept) out.push(kept);
      }
      continue;
    }
    out.push(line);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
