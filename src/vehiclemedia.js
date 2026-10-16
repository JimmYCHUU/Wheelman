// A car's photos, videos and documents, for the car panel on the page and for the links a reply may
// carry. Read on demand from two dashboard addresses, by the car's chassis number:
//
//   the website's media list: photos with their role (front, odometer, boot...) and the videos;
//   the car's full record: read ONLY for its auction photos, its older photo lists and its
//   documents. The record also carries our costs, the supplier, the VIN and the buyer; projectMedia
//   reduces it the moment it is read, and nothing else of it is kept, logged or passed on.
//
// The page never loads a picture from elsewhere: each picture has a number here, and Wheelman
// fetches it, keeps a copy and serves that (src/media.js). Nothing the page sends is used as an
// address. Videos play from Carbarn's own storage, the one other place the page may load from.

import crypto from 'node:crypto';
import path from 'node:path';
import { config } from './config.js';
import { fetchVehicleMedia, fetchVehicleRecord } from './dashboard.js';
import { getVehicleByStock, allVehicles } from './db.js';
import { availability } from './normalize.js';
import { reservedByAnother } from './deal.js';
import { fetchPicture } from './media.js';
import { logLine } from './log.js';

/** Where a car's pictures are kept: Carbarn's storage, the website's, and the Japanese supplier's auction photos. */
export const PICTURE_HOSTS = [
  'www.storage.importautos.com.au', 'storage.importautos.com.au',
  'fastlycb.s3.ap-southeast-2.amazonaws.com',
  'www.nichibojapan.com', 'nichibojapan.com',
];
// Amazon's regional address is shared by every bucket in the region: only the supplier's own folder counts.
const SHARED_HOSTS = { 's3-ap-southeast-2.amazonaws.com': '/nichibo/' };
const allowPicture = (u) => PICTURE_HOSTS.includes(u.hostname) || (SHARED_HOSTS[u.hostname] !== undefined && u.pathname.startsWith(SHARED_HOSTS[u.hostname]));
// A document address carrying a key, a token or a password is never shown or sent (the inspection
// sheet's does, which is one reason it is dropped by type as well).
const SECRET_QUERY = /[?&](key|token|secret|password|pass|auth|sig|signature|x-amz-signature|user)=/i;

// The Japanese supplier's addresses. Wheelman fetches its auction photos and auction sheets for the
// owner to look at, but such an address is never given to a customer: no Copy link, no Add to reply,
// never in a reply. (The owner's choice, 16 Oct 2026: "Hide it from customers".)
const SUPPLIER = (u) => /(^|\.)nichibojapan\.com$/i.test(u.hostname) || (u.hostname === 's3-ap-southeast-2.amazonaws.com' && u.pathname.startsWith('/nichibo/'));
/** Whether a link may go to a customer: anything but the supplier's own addresses. */
export const shareable = (url) => { try { return !SUPPLIER(new URL(url)); } catch { return false; } };
// The supplier serves its auction photos over plain http. Only Wheelman fetches them, never the page.
const HTTP_HOSTS = ['www.nichibojapan.com', 'nichibojapan.com'];
/** Where a video may play from on the page. The content security policy names the same host. */
export const VIDEO_HOSTS = ['fastlycb.s3.ap-southeast-2.amazonaws.com'];

/**
 * The documents that may be shown, in this order, with the words the page uses. Every other type
 * is dropped: the inspection sheet (its address carries the supplier's key), the pro-forma invoice
 * (our purchase cost) and the signed Form 5 (a customer's form) among them.
 */
export const DOCUMENTS = {
  AUCTION_SHEET: 'Auction sheet',
  EXPORT_CERTIFICATE: 'Export certificate',
  VIA_APPROVAL: 'Import approval (VIA)',
  SYDNEY_VEHICLE_PHOTOS_LINK: 'Sydney photos album',
  RAW_FOOTAGE_LINK: 'Raw footage album',
  COMPLIANCE_PHOTOS_LINK: 'Compliance photos album',
};
const ALBUMS = new Set(['SYDNEY_VEHICLE_PHOTOS_LINK', 'RAW_FOOTAGE_LINK', 'COMPLIANCE_PHOTOS_LINK']);

// The website's photo roles, in the order a buyer walks round a car, and what each is called.
const ROLES = {
  front_exterior: 'Front', side_exterior: 'Side', rear_exterior: 'Rear',
  interior_front: 'Front seats', dashboard: 'Dashboard', odometer: 'Odometer', climate_control: 'Climate control',
  gear_shifter: 'Gear shifter', door_controls: 'Door controls', rear_seats: 'Rear seats', boot_space: 'Boot',
};
const ROLE_ORDER = Object.keys(ROLES);
const roleRank = (r) => { const i = ROLE_ORDER.indexOf(r); return i === -1 ? ROLE_ORDER.length : i; };

const web = (u) => (typeof u === 'string' && /^https?:\/\/\S+$/i.test(u.trim()) ? u.trim() : '');
const hostOf = (u) => { try { return new URL(u).hostname; } catch { return ''; } };
const kindOf = (type, url) => (ALBUMS.has(type) ? 'album' : /\.pdf(\?|#|$)/i.test(url) ? 'pdf' : /\.(jpe?g|png|gif|webp)(\?|#|$)/i.test(url) ? 'image' : 'file');

/** "Front", or "Front 2" when the car has more than one photo of the front. */
function numbered(labels) {
  const total = {}, seen = {};
  for (const l of labels) total[l] = (total[l] || 0) + 1;
  return labels.map((l) => { seen[l] = (seen[l] || 0) + 1; return total[l] > 1 ? `${l} ${seen[l]}` : l; });
}

/**
 * What the page may show of a car, from what the two addresses sent. Pure: no fetching, no clock.
 *
 * Returns { photos, videos, documents, pictures }. `pictures` maps each picture's id to the address
 * Wheelman itself fetches; it stays on the server. The id is made from the address, so it names the
 * same picture after any later read and a browser's copy of it never shows another one. Every other
 * field is safe for the page:
 *   photos    [{ id, group: 'car' | 'auction', label, link, shareable }]
 *   videos    [{ label, link, plainLink, poster, playable, shareable }]  (link: with the voice-over when there is one)
 *   documents [{ type, label, kind: 'pdf' | 'image' | 'album' | 'file', link, picture, shareable }]
 * shareable is false for the supplier's own addresses: shown to the owner, never to a customer.
 */
export function projectMedia(media, record) {
  const pictures = {};
  const picture = (url) => {
    const u = web(url);
    if (!u) return null;
    const id = pictureId(u);
    pictures[id] = u;
    return id;
  };
  const list = Array.isArray(media) ? media : [];
  const rec = record && typeof record === 'object' ? record : {};

  // The website's photos, walking round the car; an older car has only its two plain lists.
  const images = list.filter((m) => m && m.mediaType === 'IMAGE' && web(m.url))
    .sort((a, b) => roleRank(a.imageRole) - roleRank(b.imageRole) || (Number(a.displayOrder) || 0) - (Number(b.displayOrder) || 0));
  let car;
  if (images.length) {
    const labels = numbered(images.map((m) => ROLES[m.imageRole] || 'Photo'));
    car = images.map((m, i) => ({ group: 'car', label: labels[i], url: web(m.url) }));
  } else {
    const outside = (Array.isArray(rec.exteriorPhoto) ? rec.exteriorPhoto : []).map(web).filter(Boolean);
    const inside = (Array.isArray(rec.interiorPhoto) ? rec.interiorPhoto : []).map(web).filter(Boolean);
    car = [...outside.map((url, i) => ({ group: 'car', label: `Outside ${i + 1}`, url })), ...inside.map((url, i) => ({ group: 'car', label: `Inside ${i + 1}`, url }))];
  }
  const auction = [...new Set((Array.isArray(rec.auctionPhotos) ? rec.auctionPhotos : []).map(web).filter(Boolean))]
    .map((url, i) => ({ group: 'auction', label: `Auction photo ${i + 1}`, url }));
  const photos = [...car, ...auction].map((p) => ({ id: picture(p.url), group: p.group, label: p.label, link: p.url, shareable: shareable(p.url) }));

  // The videos, the walkaround first. The voice-over version is the one the website plays.
  const videos = list.filter((m) => m && m.mediaType === 'VIDEO' && (web(m.url) || web(m.voiceOverVideoUrl)))
    .map((m) => {
      const plain = web(m.url);
      const voice = web(m.voiceOverVideoUrl);
      const link = voice || plain;
      return {
        label: String(m.label || 'Video').trim() || 'Video',
        link,
        plainLink: voice && plain && plain !== voice ? plain : '',
        poster: picture(m.thumbnailUrl),
        shareable: shareable(link),
        playable: VIDEO_HOSTS.includes(hostOf(link)) && (!plain || VIDEO_HOSTS.includes(hostOf(plain))),
      };
    })
    .sort((a, b) => Number(/walk/i.test(b.label)) - Number(/walk/i.test(a.label)));

  // The documents on the allowlist, one of each type (the newest), in the allowlist's order.
  const docs = Array.isArray(rec.operation?.documents) ? rec.operation.documents : [];
  const newestOf = new Map();
  for (const d of docs) {
    const type = String(d?.documentType || '');
    if (!DOCUMENTS[type] || d.active === false || !web(d.url) || SECRET_QUERY.test(d.url)) continue;
    const at = Date.parse(d.updatedAt || d.createdAt || '') || 0;
    const had = newestOf.get(type);
    if (!had || at >= had.at) newestOf.set(type, { at, url: web(d.url) });
  }
  const documents = Object.keys(DOCUMENTS).filter((t) => newestOf.has(t)).map((type) => {
    const link = newestOf.get(type).url;
    const kind = kindOf(type, link);
    return { type, label: DOCUMENTS[type], kind, link, picture: kind === 'image' ? picture(link) : null, shareable: shareable(link) };
  });

  return { photos, videos, documents, pictures };
}

// ---- reading, kept for half an hour per car -------------------------------------------------------

const KEEP_MS = 30 * 60 * 1000;
const cache = new Map(); // stockNo -> { at, value, pictures }
const reading = new Map(); // stockNo -> the read under way, so two panels opening at once ask once

export class MediaError extends Error {
  constructor(message, status = 502) { super(message); this.status = status; }
}

/** A picture's id: made from its address, the same name for the same picture in every read. */
export const pictureId = (url) => crypto.createHash('sha1').update(String(url)).digest('hex').slice(0, 24);

/**
 * The car as the car panel and Find a car show it, from the stored stock list. A car another
 * customer has paid a deposit on is said to be reserved, as it is in a conversation.
 */
export function carSummary(v) {
  const plain = availability(v);
  const a = plain.code === 'available' && reservedByAnother(v) ? { code: 'reserved', text: 'Reserved: another customer has paid a deposit' } : plain;
  return { stockNo: v.stockNo, title: v.title || [v.year, v.make, v.model].filter(Boolean).join(' '), price: v.price ?? null, odometer: v.odometer ?? null, availability: a, url: v.url || '', year: v.year, fuel: v.fuel, transmission: v.transmission, seats: v.seats, colour: v.color, included: v.outline || [] };
}

/**
 * A car's media for the page: { stockNo, title, readAt, photos, videos, documents, stale, error }.
 * Read again after half an hour, or at once with fresh. When a read fails, the last good answer is
 * given with `error` saying so; with none, a MediaError.
 */
export async function vehicleMedia(stockNo, { fresh = false, now = Date.now() } = {}) {
  const v = getVehicleByStock(stockNo);
  if (!v) throw new MediaError('That stock number is not in the stock list.', 404);
  const key = String(v.stockNo);
  const hit = cache.get(key);
  if (hit && !fresh && now - hit.at < KEEP_MS) return hit.value;
  if (!v.chassisNo) {
    // Stored before Wheelman kept chassis numbers: the next check of the stock list brings it.
    return { stockNo: key, title: v.title || '', readAt: null, photos: [], videos: [], documents: [], stale: true, error: 'This car\'s photos can be read after the next check of the stock list.' };
  }
  if (reading.has(key)) return reading.get(key);
  const read = (async () => {
    try {
      const chassis = String(v.chassisNo).trim();
      // Both at once. The media list is [] for a car without website photos. When one of the two
      // does not answer, what the other sent is shown, with a note; when neither does, an error.
      const [mediaRead, recordRead] = await Promise.allSettled([fetchVehicleMedia(chassis), fetchVehicleRecord(chassis)]);
      if (mediaRead.status === 'rejected' && recordRead.status === 'rejected') throw mediaRead.reason;
      for (const r of [mediaRead, recordRead]) if (r.status === 'rejected') logLine('media', `Part of the media of stock ${key} could not be read: ${r.reason?.message || r.reason}`);
      const partial = mediaRead.status === 'rejected' || recordRead.status === 'rejected';
      const { pictures, ...safe } = projectMedia(mediaRead.value || [], recordRead.value || null);
      const value = { stockNo: key, title: v.title || '', readAt: now, ...safe, stale: false, error: partial ? 'Part of this car\'s photos and documents could not be read just now.' : '' };
      cache.set(key, { at: now, value, pictures });
      while (cache.size > 200) cache.delete(cache.keys().next().value);
      return value;
    } catch (e) {
      logLine('media', `The photos of stock ${key} could not be read: ${e.message}`);
      if (hit) return { ...hit.value, error: 'The photos could not be read again just now. These are from earlier.' };
      throw new MediaError('The photos could not be read from the dashboard just now. Try again in a moment.');
    } finally {
      reading.delete(key);
    }
  })();
  reading.set(key, read);
  return read;
}

/** One of the car's pictures, by its id from the car's media: Wheelman's own copy. */
export async function vehiclePicture(stockNo, id) {
  const v = getVehicleByStock(stockNo);
  if (!v) throw new MediaError('That stock number is not in the stock list.', 404);
  if (!/^[a-f0-9]{24}$/.test(String(id))) throw new MediaError('No such picture for this car.', 404);
  let hit = cache.get(String(v.stockNo));
  // Only a car not read since Wheelman started is read here; an id it does not know is simply not found.
  if (!hit) { await vehicleMedia(stockNo); hit = cache.get(String(v.stockNo)); }
  const url = hit?.pictures?.[id];
  if (!url) throw new MediaError('No such picture for this car.', 404);
  return fetchPicture(url, path.join(config.mediaDir, 'vehicles'), id, { allow: allowPicture, httpHosts: HTTP_HOSTS });
}

/** Forget what was read, for the tests. */
export function forgetMedia() { cache.clear(); reading.clear(); }

// ---- the links a reply carries when the customer asks ---------------------------------------------

/**
 * What the customer's waiting messages ask for: a video (of the inside or the engine too), photos,
 * the auction sheet, the export certificate. Words a customer uses, not codes.
 */
export function askedFor(text) {
  const s = String(text || '').toLowerCase();
  const video = /\bvideos?\b|\bvids?\b|walk[\s-]?around|footage|\b360\b/.test(s);
  return {
    video,
    inside: video && /\b(inside|interior|cabin|seats?|dash(board)?)\b/.test(s),
    engine: video && /\b(engine|motor|under the (hood|bonnet)|tyres?|tires?)\b/.test(s),
    photos: /\b(photos?|pictures?|pics?|images?)\b/.test(s),
    auctionSheet: /auction\s*(sheet|report)|\bauction\s+grade\s+sheet\b/.test(s),
    exportCertificate: /export\s*cert(ificate)?s?\b/.test(s),
  };
}

/**
 * The links that answer what was asked, from the car's media, each on its own line with what it
 * is: "Walkaround 360 video: …", "Auction sheet: …", "Export certificate: …", "Photos: <the car's
 * page>". The walkaround comes for any video; the inside and engine videos only when asked for.
 * Photos point to the car's page on the website, where every photo is, and only for a car that is
 * listed there and only when the page link is not already in the reply's standard block. Albums,
 * the import approval and every other document are never added by code.
 */
export function replyLinks(media, vehicle, asked, { pageInBlock = false } = {}) {
  if (!media || !asked) return [];
  const out = [];
  const videos = media.videos || [];
  const video = (re) => videos.find((v) => re.test(v.label));
  if (asked.video) {
    const chosen = [video(/walk/i) || videos[0]];
    if (asked.inside) chosen.push(video(/inside\s*front/i), video(/inside\s*rear/i), video(/inside|interior/i));
    if (asked.engine) chosen.push(video(/engine/i));
    for (const v of [...new Set(chosen.filter(Boolean))]) out.push({ label: /video/i.test(v.label) ? v.label : `${v.label} video`, url: v.link });
  }
  const doc = (type) => (media.documents || []).find((d) => d.type === type);
  if (asked.auctionSheet && doc('AUCTION_SHEET')) out.push({ label: 'Auction sheet', url: doc('AUCTION_SHEET').link });
  if (asked.exportCertificate && doc('EXPORT_CERTIFICATE')) out.push({ label: 'Export certificate', url: doc('EXPORT_CERTIFICATE').link });
  const listed = vehicle?.url && availability(vehicle).code === 'available';
  if (asked.photos && listed && !pageInBlock && (media.photos || []).some((p) => p.group === 'car')) out.push({ label: 'Photos', url: vehicle.url });
  return out;
}

/**
 * The car's media for a reply, when the customer asked for something it may hold: read through
 * the half-hour cache, and given up after `waitMs` so a slow dashboard never holds up a reply.
 */
export async function mediaForReply(item, { waitMs = 5000 } = {}) {
  const v = item?.vehicles?.[0];
  if (!v?.stockNo || !v.chassisNo) return null;
  const asked = askedFor(item.pendingText);
  if (!Object.values(asked).some(Boolean)) return null;
  let timer = null;
  const late = new Promise((resolve) => { timer = setTimeout(() => resolve(null), waitMs); timer.unref?.(); });
  try {
    const media = await Promise.race([vehicleMedia(v.stockNo), late]);
    return media && !media.stale ? { media, asked } : null;
  } catch { return null; } finally { clearTimeout(timer); }
}

// ---- Find a car ----------------------------------------------------------------------------------

const AVAIL_RANK = { available: 0, reserved: 1, arrived: 1, transit: 2, japan: 3, unknown: 4, sold: 5 };
const words = (s) => String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/**
 * Up to `max` cars for the Find a car box: a stock number typed exactly comes first, then stock
 * numbers that start with what was typed, then every car whose title has all the words typed.
 * Within each, cars on offer before those on their way, sold ones last, newest first.
 */
export function findCars(q, { max = 12 } = {}) {
  const typed = String(q || '').trim().toLowerCase();
  if (!typed) return [];
  const want = words(typed);
  const out = [];
  for (const v of allVehicles()) {
    if (!v?.stockNo) continue;
    const stock = String(v.stockNo).toLowerCase();
    const title = words([v.title, v.year, v.make, v.model, v.modelCode, v.color].join(' '));
    const tier = stock === typed ? 0 : stock.startsWith(typed) ? 1 : want.length && want.every((w) => title.some((t) => t.startsWith(w))) ? 2 : -1;
    if (tier === -1) continue;
    out.push({ tier, v });
  }
  out.sort((a, b) => a.tier - b.tier || (AVAIL_RANK[availability(a.v).code] ?? 4) - (AVAIL_RANK[availability(b.v).code] ?? 4) || (Number(b.v.id) || 0) - (Number(a.v.id) || 0));
  return out.slice(0, max).map(({ v }) => {
    const s = carSummary(v);
    return { stockNo: s.stockNo, title: s.title, price: s.price, odometer: s.odometer, availability: s.availability };
  });
}
