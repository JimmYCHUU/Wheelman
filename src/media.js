// Pictures from elsewhere, fetched once and kept beside the database, so the page only ever loads
// pictures from Wheelman itself (its content security policy allows nothing else). Used for the
// photos in a text and for the car's photos.

import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

export const MEDIA_MAX_BYTES = 15 * 1024 * 1024;
export const MEDIA_TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp' };
const MAX_HOPS = 3;

/** This computer itself, where the tests serve their pictures. Allowed only when the setting says so. */
const LOCAL = /^http:\/\/127\.0\.0\.1[:/]/i;

/**
 * Whether an address may be fetched: https, plain http only for the hosts named in httpHosts, and
 * with `allow`, only an address it accepts. This computer only under the tests (MEDIA_ALLOW_LOCAL).
 */
export function fetchable(url, { allow = null, httpHosts = [] } = {}) {
  let u;
  try { u = new URL(url); } catch { return false; }
  if (LOCAL.test(url)) return !!config.mediaAllowLocal;
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && httpHosts.includes(u.hostname))) return false;
  return !allow || allow(u);
}

/** A file kept from an earlier fetch, by its name without the extension. */
export function keptFile(dir, stem) {
  if (!fs.existsSync(dir)) return null;
  const kept = fs.readdirSync(dir).find((f) => f.startsWith(`${stem}.`));
  if (!kept) return null;
  const type = Object.keys(MEDIA_TYPES).find((t) => MEDIA_TYPES[t] === path.extname(kept)) || 'application/octet-stream';
  return { body: fs.readFileSync(path.join(dir, kept)), type };
}

/** The body, read no further than the cap: a picture that is too large is refused before it fills memory. */
async function bodyUpTo(r, cap) {
  if (Number(r.headers.get('content-length')) > cap) throw new Error('too large');
  const parts = [];
  let size = 0;
  for await (const chunk of r.body || []) {
    size += chunk.length;
    if (size > cap) throw new Error('too large');
    parts.push(chunk);
  }
  return Buffer.concat(parts);
}

/**
 * Fetches one picture and keeps it as <dir>/<stem>.<ext>. Every address on the way is checked by
 * `rules` before it is asked, redirects included (three at most). Only images, at most 15 MB.
 */
export async function fetchPicture(url, dir, stem, rules = {}) {
  const kept = keptFile(dir, stem);
  if (kept) return kept;
  let at = url;
  let r = null;
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    if (!fetchable(at, rules)) throw new Error(hop ? 'the address sent the request somewhere else' : 'not an address Wheelman fetches pictures from');
    r = await fetch(at, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(30000) });
    if (r.status < 300 || r.status >= 400) break;
    const next = r.headers.get('location');
    if (!next || hop === MAX_HOPS) throw new Error('too many redirects');
    at = new URL(next, at).href;
  }
  if (!r.ok) throw new Error(`the address answered ${r.status}`);
  const type = String(r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!MEDIA_TYPES[type]) throw new Error(`not an image (${type || 'no type'})`);
  const body = await bodyUpTo(r, MEDIA_MAX_BYTES);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${stem}${MEDIA_TYPES[type]}`), body);
  return { body, type };
}
