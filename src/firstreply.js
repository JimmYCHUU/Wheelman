// The standard block the team sends on a first reply: address, map link, hours, the car's page
// and the phone number. The wording lives in voice/first-reply.md so it can be edited without
// touching code. The AI never writes this block: code adds it, so every symbol and word is exact.

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
 * reply about no particular car has no "Check More Details" lines.
 */
export function standardBlock({ vehicleUrl = '' } = {}) {
  const values = { vehicle_url: String(vehicleUrl || '').trim(), sender: config.firstReplySender };
  const out = [];
  for (const part of parts()) {
    let missing = false;
    const filled = part.replace(/\{([a-z_]+)\}/g, (m, name) => { const v = values[name]; if (!v) missing = true; return v || ''; });
    if (!missing) out.push(filled);
  }
  return out.join('\n\n');
}

/** True when the AI's own lines repeat what the block already says. */
export function repeatsBlock(opening) {
  const m = String(opening || '').match(/(frances\s+st(reet)?|maps\.app\.goo\.gl\S*|\b8\s?(:00)?\s?am\b.{0,14}\b5\s?(:00)?\s?pm\b|open (7|seven) days|0423\s?840\s?130)/i);
  return m ? m[0] : '';
}

/**
 * Removes a line of the AI's opening that is only the car's page link (the block gives it),
 * together with a lead-in line such as "More details here:".
 */
export function tidyOpening(opening, vehicleUrl) {
  if (!vehicleUrl) return opening;
  const lines = String(opening || '').split('\n');
  const out = [];
  for (const line of lines) {
    const bare = line.trim().replace(/\/$/, '');
    if (bare === vehicleUrl.replace(/\/$/, '')) {
      while (out.length && out[out.length - 1].trim() === '') out.pop();
      if (out.length && /:\s*$/.test(out[out.length - 1])) out.pop();
      continue;
    }
    out.push(line);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
