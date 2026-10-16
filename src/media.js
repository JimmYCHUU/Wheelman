// Pictures from elsewhere, fetched once and kept beside the database, so the page only ever loads
// pictures from Wheelman itself (its content security policy allows nothing else). Used for the
// photos in a text and for the car's photos.

import fs from 'node:fs';
import path from 'node:path';

export const MEDIA_MAX_BYTES = 15 * 1024 * 1024;
export const MEDIA_TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp' };

/** This computer itself, where the tests serve their pictures. */
const LOCAL = /^http:\/\/127\.0\.0\.1[:/]/i;

/**
 * Whether an address may be fetched: https, or this computer; plain http only for the hosts named
 * in httpHosts. With `hosts`, the address must be on one of them as well (or this computer).
 */
export function fetchable(url, { hosts = null, httpHosts = [] } = {}) {
  let u;
  try { u = new URL(url); } catch { return false; }
  if (LOCAL.test(url)) return true;
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && httpHosts.includes(u.hostname))) return false;
  return !hosts || hosts.includes(u.hostname);
}

/** A file kept from an earlier fetch, by its name without the extension. */
export function keptFile(dir, stem) {
  if (!fs.existsSync(dir)) return null;
  const kept = fs.readdirSync(dir).find((f) => f.startsWith(`${stem}.`));
  if (!kept) return null;
  const type = Object.keys(MEDIA_TYPES).find((t) => MEDIA_TYPES[t] === path.extname(kept)) || 'application/octet-stream';
  return { body: fs.readFileSync(path.join(dir, kept)), type };
}

/**
 * Fetches one picture and keeps it as <dir>/<stem>.<ext>. Refuses an address `rules` does not allow
 * (also after a redirect), anything that is not an image, and anything over 15 MB.
 */
export async function fetchPicture(url, dir, stem, rules = {}) {
  const kept = keptFile(dir, stem);
  if (kept) return kept;
  if (!fetchable(url, rules)) throw new Error('not an address Wheelman fetches pictures from');
  const r = await fetch(url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(30000) });
  if (r.url && r.url !== url && !fetchable(r.url, rules)) throw new Error('the address sent the request somewhere else');
  if (!r.ok) throw new Error(`the address answered ${r.status}`);
  const type = String(r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!MEDIA_TYPES[type]) throw new Error(`not an image (${type || 'no type'})`);
  const body = Buffer.from(await r.arrayBuffer());
  if (body.length > MEDIA_MAX_BYTES) throw new Error('too large');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${stem}${MEDIA_TYPES[type]}`), body);
  return { body, type };
}
