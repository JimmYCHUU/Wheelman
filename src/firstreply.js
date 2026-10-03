// The standard block we send on a first reply: the car's page, the booking link when the customer
// asked to see the car, the address, map link, hours and phone number. The wording lives in
// voice/first-reply.md so it can be edited without touching code. The AI never writes this block:
// code adds it, so every symbol and word is exact.

import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

let cache = { mtime: 0, parts: [] };

/** The parts of the block, from the file. Read again whenever the file changes. */
function parts() {
  const file = path.join(config.voiceDir, 'first-reply.md');
  let stat;
  try { stat = fs.statSync(file); } catch { return []; }
  if (stat.mtimeMs !== cache.mtime) {
    const text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '').replace(/\r/g, '');
    const body = text.split('\n').filter((line) => !line.startsWith('#')).join('\n');
    cache = { mtime: stat.mtimeMs, parts: body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean) };
  }
  return cache.parts;
}

/**
 * The block for one reply. A part whose placeholder has nothing to fill it is left out, so a
 * reply about no particular car has no "Vehicle details" lines, and one where nobody asked to
 * see the car has no booking link.
 */
export function standardBlock({ vehicleUrl = '', inspectionUrl = '' } = {}) {
  const values = { vehicle_url: String(vehicleUrl || '').trim(), inspection_url: String(inspectionUrl || '').trim(), sender: config.firstReplySender };
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

/** True when the AI's own lines repeat what the block already says. */
export function repeatsBlock(opening) {
  const m = String(opening || '').match(/(frances\s+st(reet)?|maps\.app\.goo\.gl\S*|\b8\s?(:00)?\s?am\b.{0,14}\b5\s?(:00)?\s?pm\b|open (7|seven) days|0423\s?840\s?130)/i);
  return m ? m[0] : '';
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
