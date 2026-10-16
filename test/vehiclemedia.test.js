// A car's photos, videos and documents: read from the dashboard by chassis number, reduced at once
// to what may be shown (never a cost, the supplier, the VIN, the buyer, the inspection sheet, the
// pro-forma invoice or a signed Form 5), kept for half an hour, and served to the page with every
// picture through Wheelman's own copy. Find a car searches the stored stock list. All invented.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { applyTestEnv } from './support/env.js';
import { startStandins } from './support/standins.js';
import { pointConfigAt } from './support/wire.js';
import { world as makeWorld, VEHICLE_MEDIA, VEHICLE_RECORDS } from './support/fixtures.js';

applyTestEnv();

const now = Date.now();
const sessionFile = path.join(os.tmpdir(), `wheelman-media-session-${process.pid}.json`);
let standins, calls, config, app, base, vm, sync, world;

const MEDIA = '/carbarnau/api/v2/vehicles/media/ZRR80-0101010';
const RECORD = '/carbarnau/api/v1/vehicles/chassis/ZRR80-0101010';
const hits = (p) => calls.filter((c) => c.path === p).length;
const get = async (p) => { const r = await fetch(base + p); return { status: r.status, type: r.headers.get('content-type'), csp: r.headers.get('content-security-policy'), cache: r.headers.get('cache-control'), body: /json/.test(r.headers.get('content-type') || '') ? await r.json() : Buffer.from(await r.arrayBuffer()) }; };
// The fixtures' picture addresses say {base}; outside the stand-ins any https address will do.
const filled = (x) => JSON.parse(JSON.stringify(x).replaceAll('{base}', 'https://pictures.example'));
const NEVER = /777111|333444|888222|666777|SUPPLIER-9|SECRETVIN|SECRET-ENGINE|Somebody Private|0491 570 199|private@example|secret-supplier-key|INSPECTION_SHEET|PROFORMA|proforma|SIGNED_FORM_5|form5|fob|salesInfo|paymentSummary/;

before(async () => {
  world = makeWorld(now);
  standins = await startStandins({ world });
  calls = standins.calls;
  ({ config } = await import('../src/config.js'));
  pointConfigAt(config, standins, { sessionPath: sessionFile, port: 0 });
  const db = await import('../src/db.js');
  db.openDb();
  sync = await import('../src/sync.js');
  await sync.syncVehicles({ force: true });
  vm = await import('../src/vehiclemedia.js');
  app = await (await import('../src/server.js')).startServer();
  base = `http://127.0.0.1:${app.address().port}`;
});

after(async () => {
  await new Promise((r) => { app.close(r); app.closeAllConnections?.(); });
  await standins.close();
  fs.rmSync(sessionFile, { force: true });
  fs.rmSync(config.mediaDir, { recursive: true, force: true });
});

test('the reduction keeps the photos, videos and allowed documents, and nothing else of the record', () => {
  const out = vm.projectMedia(filled(VEHICLE_MEDIA['ZRR80-0101010']), filled(VEHICLE_RECORDS['ZRR80-0101010']));
  // Walking round the car: the front first, numbered when there are two, the odometer, the boot last.
  assert.deepEqual(out.photos.filter((p) => p.group === 'car').map((p) => p.label), ['Front 1', 'Front 2', 'Odometer', 'Boot']);
  // The auction photos once each; the older photo lists are not needed when the website has photos.
  assert.deepEqual(out.photos.filter((p) => p.group === 'auction').map((p) => p.label), ['Auction photo 1', 'Auction photo 2']);
  assert.ok(!out.photos.some((p) => /old-/.test(p.link)));
  // The walkaround first, with the voice-over version as the link and the plain one beside it.
  assert.deepEqual(out.videos.map((v) => v.label), ['Walkaround 360', 'Inside Front']);
  assert.match(out.videos[0].link, /walkaround-360-voiceover\.mp4$/);
  assert.match(out.videos[0].plainLink, /walk\.mp4$/);
  assert.equal(out.videos[0].playable, true, 'Carbarn\'s storage plays on the page');
  // The documents on the allowlist only, the newest of a kind, an inactive one left out.
  assert.deepEqual(out.documents.map((d) => [d.type, d.kind]), [['AUCTION_SHEET', 'image'], ['EXPORT_CERTIFICATE', 'pdf'], ['RAW_FOOTAGE_LINK', 'album']]);
  assert.match(out.documents[1].link, /export\.pdf$/);
  assert.ok(out.documents[0].picture !== null, 'the auction sheet can be shown as a picture');
  // Every picture has an id made from its address; the addresses stay in `pictures`, on the server.
  assert.ok(out.photos.every((p) => /^[a-f0-9]{24}$/.test(p.id) && out.pictures[p.id] === p.link));
  assert.equal(vm.projectMedia(filled(VEHICLE_MEDIA['ZRR80-0101010']), null).photos[0].id, out.photos[0].id, 'the same picture keeps its id in another read');
  const { pictures, ...safe } = out;
  assert.doesNotMatch(JSON.stringify(safe), NEVER);
  assert.doesNotMatch(JSON.stringify(pictures), NEVER);
});

test('an older car without website photos shows its older photo lists; nothing at all is an empty answer', () => {
  const older = vm.projectMedia([], filled(VEHICLE_RECORDS['ZRR80-0101010']));
  assert.deepEqual(older.photos.filter((p) => p.group === 'car').map((p) => p.label), ['Outside 1', 'Inside 1']);
  assert.deepEqual(older.videos, []);
  const none = vm.projectMedia(null, null);
  assert.deepEqual([none.photos, none.videos, none.documents, none.pictures], [[], [], [], {}]);
  // A video on any other host is offered to open, not played on the page.
  const elsewhere = vm.projectMedia([{ mediaType: 'VIDEO', label: 'Walkaround', url: 'https://video.example/walk.mp4' }], {});
  assert.equal(elsewhere.videos[0].playable, false);
});

test('the car panel reads both addresses once, keeps the answer, and serves nothing it must not', async () => {
  vm.forgetMedia();
  const before = [hits(MEDIA), hits(RECORD)];
  const r = await get('/api/vehicles/1159/media');
  assert.equal(r.status, 200);
  assert.equal(r.body.stockNo, '1159');
  assert.equal(r.body.photos.length, 6);
  assert.equal(r.body.videos.length, 2);
  assert.doesNotMatch(JSON.stringify(r.body), NEVER);
  assert.ok(!('pictures' in r.body), 'the picture addresses stay on the server');
  // Kept: a second look costs nothing; Refresh asks again.
  await get('/api/vehicles/1159/media');
  assert.deepEqual([hits(MEDIA), hits(RECORD)], [before[0] + 1, before[1] + 1]);
  await get('/api/vehicles/1159/media?fresh=1');
  assert.deepEqual([hits(MEDIA), hits(RECORD)], [before[0] + 2, before[1] + 2]);
  // Every request to the dashboard was a read.
  assert.ok(calls.filter((c) => c.path.startsWith('/carbarnau/api/v')).every((c) => c.method === 'GET'));
});

test('a picture comes from Wheelman\'s own copy; a number it does not know, or a page that is not a picture, is refused', async () => {
  vm.forgetMedia();
  const media = (await get('/api/vehicles/1159/media')).body;
  const front = media.photos[0];
  const before = calls.filter((c) => c.path.startsWith('/pic/')).length;
  const r = await get(`/api/vehicles/1159/picture/${front.id}`);
  assert.equal(r.status, 200);
  assert.equal(r.type, 'image/png');
  assert.match(r.cache, /max-age=86400/);
  await get(`/api/vehicles/1159/picture/${front.id}`);
  assert.equal(calls.filter((c) => c.path.startsWith('/pic/')).length, before + 1, 'fetched once, then served from the copy');
  assert.equal((await get('/api/vehicles/1159/picture/aaaabbbbccccddddeeeeffff')).status, 404);
  assert.equal((await get('/api/vehicles/1159/picture/0')).status, 404, 'a bare number is not an id');
  assert.equal((await get('/api/vehicles/9999/media')).status, 404);
  // The page's policy lets videos play from Carbarn's storage and nowhere else.
  assert.match(r.csp, /media-src 'self' https:\/\/fastlycb\.s3\.ap-southeast-2\.amazonaws\.com;/);
  assert.match(r.csp, /img-src 'self' data:;/);
  // A "picture" that is a web page is refused.
  const kept = world.vehicleMedia['ZRR80-0101010'];
  world.vehicleMedia['ZRR80-0101010'] = [{ mediaType: 'IMAGE', imageRole: 'front_exterior', url: '{base}/pic/page.html' }];
  try {
    const again = (await get('/api/vehicles/1159/media?fresh=1')).body;
    assert.equal((await get(`/api/vehicles/1159/picture/${again.photos[0].id}`)).status, 502);
  } finally { world.vehicleMedia['ZRR80-0101010'] = kept; }
});

test('when the dashboard does not answer, the last answer stays with a note; with none, the page is told plainly', async () => {
  vm.forgetMedia();
  await get('/api/vehicles/1159/media');
  world.mediaDown = true;
  try {
    const kept = await get('/api/vehicles/1159/media?fresh=1');
    assert.equal(kept.status, 200);
    assert.equal(kept.body.photos.length, 6);
    assert.match(kept.body.error, /from earlier/);
    vm.forgetMedia();
    const none = await get('/api/vehicles/1159/media');
    assert.equal(none.status, 502);
    assert.match(none.body.error, /could not be read/);
  } finally { world.mediaDown = false; }
});

test('when only the record does not answer, the website photos and videos are still shown, with a note', async () => {
  vm.forgetMedia();
  world.recordDown = true;
  try {
    const r = await get('/api/vehicles/1159/media');
    assert.equal(r.status, 200);
    assert.equal(r.body.photos.filter((p) => p.group === 'car').length, 4);
    assert.equal(r.body.videos.length, 2);
    assert.deepEqual(r.body.documents, []);
    assert.match(r.body.error, /Part of this car's photos and documents could not be read/);
  } finally { world.recordDown = false; vm.forgetMedia(); }
});

test('a document address with a key in it is never shown; the shared Amazon address counts only for the supplier\'s folder', async () => {
  const rec = { operation: { documents: [
    { documentType: 'EXPORT_CERTIFICATE', url: 'https://fastlycb.s3.ap-southeast-2.amazonaws.com/docs/export.pdf?token=abc', active: true },
    { documentType: 'AUCTION_SHEET', url: 'https://www.nichibojapan.com/sheet.jpg?user=AU&key=x', active: true },
  ] }, auctionPhotos: ['https://s3-ap-southeast-2.amazonaws.com/nichibo/1.jpg', 'https://s3-ap-southeast-2.amazonaws.com/someone-else/2.jpg'] };
  const out = vm.projectMedia([], rec);
  assert.deepEqual(out.documents, []);
  // The picture route refuses the other bucket's address even though it was listed.
  vm.forgetMedia();
  world.vehicleRecords['ZRR80-0101010'] = { ...VEHICLE_RECORDS['ZRR80-0101010'], auctionPhotos: rec.auctionPhotos };
  world.vehicleMedia['ZRR80-0101010'] = [];
  try {
    const media = (await get('/api/vehicles/1159/media')).body;
    const other = media.photos.find((p) => /someone-else/.test(p.link));
    assert.equal((await get(`/api/vehicles/1159/picture/${other.id}`)).status, 502);
  } finally {
    world.vehicleRecords['ZRR80-0101010'] = VEHICLE_RECORDS['ZRR80-0101010'];
    world.vehicleMedia['ZRR80-0101010'] = VEHICLE_MEDIA['ZRR80-0101010'];
    vm.forgetMedia();
  }
});

test('Find a car says a car is reserved when another customer has paid a deposit on it', async () => {
  // Stock 1400, the Alphard, is listed as available but carries another customer's deposit.
  const sync = await import('../src/sync.js');
  await sync.syncVehicles({ force: true });
  const [alphard] = (await get('/api/vehicles?q=1400')).body.cars;
  assert.equal(alphard.availability.code, 'reserved');
});

test('a car stored before chassis numbers were kept says when its photos can be read', async () => {
  // Stock 1201 has no chassis number in the invented stock list.
  const r = await get('/api/vehicles/1201/media');
  assert.equal(r.status, 200);
  assert.equal(r.body.stale, true);
  assert.match(r.body.error, /next check of the stock list/);
});

test('Find a car: the exact stock number first, then numbers that start with it, then title words; on offer before sold', async () => {
  assert.deepEqual((await get('/api/vehicles?q=1159')).body.cars.map((c) => c.stockNo), ['1159']);
  const twelve = (await get('/api/vehicles?q=12')).body.cars.map((c) => c.stockNo);
  assert.deepEqual(twelve, ['1201', '1200'], 'both start with 12; the sold one comes last');
  const hiace = (await get('/api/vehicles?q=toyota%20hiace')).body.cars;
  assert.deepEqual(hiace.map((c) => c.stockNo), ['1201', 'T88', '1200']);
  assert.equal(hiace[2].availability.code, 'sold');
  assert.deepEqual((await get('/api/vehicles?q=')).body.cars, []);
  const one = (await get('/api/vehicles/1159')).body.vehicle;
  assert.equal(one.title, '2021 Toyota Noah X (8 Seater)');
  assert.ok(!('chassisNo' in one), 'the chassis number is not sent to the page');
});

test('only the two media addresses were added to what Wheelman may read', async () => {
  const dash = await import('../src/dashboard.js');
  await assert.rejects(dash.get('/carbarnau/api/v1/vehicle-operations/vehicle/1'), /Blocked/);
  await assert.rejects(dash.get('/carbarnau/api/v1/vehicles/chassis/ZRR80-0101010/extra'), /Blocked/);
  await assert.rejects(dash.get('/carbarnau/api/v2/vehicles/media/../../admin'), /Blocked/);
});

test('the stock list is read again once after the update that keeps chassis numbers', async () => {
  const db = await import('../src/db.js');
  db.setMeta('vehicles_fields', 1);
  db.setMeta('vehicles_synced_at', Date.now());
  const before = hits('/carbarnau/api/v1/vehicles');
  await sync.syncVehicles();
  assert.equal(hits('/carbarnau/api/v1/vehicles'), before + 1);
  await sync.syncVehicles();
  assert.equal(hits('/carbarnau/api/v1/vehicles'), before + 1, 'then the half-hour rule again');
});
