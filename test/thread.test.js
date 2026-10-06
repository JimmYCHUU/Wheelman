// An open conversation: the newest twenty messages first and "Load older messages" for the rest,
// photos shown from Wheelman's own copy, and senders on the ignore list never listed. All names,
// numbers and pictures are invented.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import { applyTestEnv } from './support/env.js';

applyTestEnv();

const MIN = 60e3;
const HOUR = 3600e3;
let app, base, config, db, items, picture;
// A one-pixel PNG, served by a stand-in for the dashboard's picture store.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
let served = 0;

before(async () => {
  picture = http.createServer((req, res) => {
    served++;
    if (req.url === '/photo.png') { res.writeHead(200, { 'content-type': 'image/png' }); res.end(PNG); return; }
    if (req.url === '/page.html') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<p>not a picture</p>'); return; }
    res.writeHead(404); res.end();
  });
  await new Promise((r) => picture.listen(0, '127.0.0.1', r));
  ({ config } = await import('../src/config.js'));
  config.port = 0;
  db = await import('../src/db.js');
  items = await import('../src/items.js');
  app = await (await import('../src/server.js')).startServer();
  base = `http://127.0.0.1:${app.address().port}`;
});

after(async () => {
  await new Promise((r) => { app.close(r); app.closeAllConnections?.(); });
  await new Promise((r) => picture.close(r));
  fs.rmSync(config.mediaDir, { recursive: true, force: true });
});

const get = async (p) => (await fetch(base + p)).json();
const pictureUrl = (p) => `http://127.0.0.1:${picture.address().port}${p}`;

let mid = 1;
const now = Date.now();
const lead = (id, convId, first, last, phoneNo, at = now - HOUR) => db.upsertLead({ id, conversationId: convId, firstName: first, lastName: last, phone: phoneNo, email: '', source: 'carsales', status: 'NEW', platform: 'CARSALES', state: 'NSW', leadAt: at, updatedAt: at, stocks: [], inquiries: [] });
const conv = (id, leadId, phoneNo, name, latestAt) => db.upsertConversation({ id, phone: phoneNo, channel: 'SMS', status: 'OPEN', leadId, customerName: name, latestDirection: 'IN', latestAt, latestBody: 'x' });
const msg = (conversationId, direction, body, at, extra = {}) => { const id = mid++; db.upsertMessage({ id, conversationId, direction, body, sentBy: direction === 'OUT' ? 'Alex STONE' : null, status: 'SENT', mediaType: null, at, importedAt: at, ...extra }); return id; };

test('a conversation opens on its newest twenty messages; "Load older messages" brings the rest, twenty at a time', async () => {
  lead(1, 11, 'Priya', 'Raman', '0491570101');
  conv(11, 1, '+61491570101', 'Priya Raman', now - MIN);
  for (let i = 45; i >= 1; i--) msg(11, i % 2 ? 'IN' : 'OUT', `Message ${46 - i}`, now - i * MIN);

  const { item } = await get('/api/items/c:11');
  assert.deepEqual([item.thread.length, item.earlier], [20, 25]);
  assert.deepEqual([item.thread[0].text, item.thread.at(-1).text], ['Message 26', 'Message 45']);

  const older = await get('/api/items/c:11/thread?shown=20&limit=20');
  assert.deepEqual([older.thread.length, older.earlier], [20, 5]);
  assert.deepEqual([older.thread[0].text, older.thread.at(-1).text], ['Message 6', 'Message 25'], 'the twenty right before what is shown');

  const rest = await get('/api/items/c:11/thread?shown=40&limit=20');
  assert.deepEqual([rest.thread.length, rest.earlier, rest.thread[0].text], [5, 0, 'Message 1']);

  const all = await get('/api/items/c:11/thread?shown=20&limit=40');
  assert.deepEqual([all.thread.length, all.earlier], [25, 0], 'asking again for everything already loaded plus more');
});

test('a photo in a text is shown from a copy Wheelman fetches once; anything that is not an image is refused', async () => {
  lead(2, 12, 'Tom', 'Bell', '0491570102');
  conv(12, 2, '+61491570102', 'Tom Bell', now - MIN);
  const withPhoto = msg(12, 'IN', '', now - 2 * MIN, { mediaType: 'image/png', mediaUrls: [pictureUrl('/photo.png')] });
  const notImage = msg(12, 'IN', 'see attached', now - MIN, { mediaType: 'text/html', mediaUrls: [pictureUrl('/page.html')] });

  const { item } = await get('/api/items/c:12');
  const entry = item.thread.find((e) => e.key === `m:${withPhoto}`);
  assert.deepEqual([entry.media, entry.photos], ['photo', 1]);

  let r = await fetch(`${base}/api/media/${withPhoto}/0`);
  assert.deepEqual([r.status, r.headers.get('content-type')], [200, 'image/png']);
  assert.ok(Buffer.from(await r.arrayBuffer()).equals(PNG));
  const fetched = served;
  r = await fetch(`${base}/api/media/${withPhoto}/0`);
  assert.equal(r.status, 200);
  assert.equal(served, fetched, 'the second time comes from the copy, not the picture store');
  assert.ok(fs.readdirSync(config.mediaDir).some((f) => f === `${withPhoto}-0.png`), 'kept beside the database under the message id');

  assert.equal((await fetch(`${base}/api/media/${withPhoto}/1`)).status, 404, 'no second photo');
  assert.equal((await fetch(`${base}/api/media/${notImage}/0`)).status, 502, 'a page is not a photo');
  assert.equal((await fetch(`${base}/api/media/999999/0`)).status, 404);
});

test('senders on the ignore list are kept but never listed', async () => {
  assert.equal(items.isIgnoredSender('Rob CreditOne'), true);
  assert.equal(items.isIgnoredSender('credit one'), true);
  assert.equal(items.isIgnoredSender('OTP'), true);
  assert.equal(items.isIgnoredSender('Not customer'), true);
  assert.equal(items.isIgnoredSender('Priya Raman'), false);
  assert.equal(items.isIgnoredSender(''), false);

  conv(13, null, '+61491570103', 'Delivery Service', now - MIN);
  msg(13, 'IN', 'Your parcel is on its way.', now - MIN);
  lead(3, 14, 'Joe', 'Creditone', '0491570104');
  conv(14, 3, '+61491570104', 'Joe Creditone', now - MIN);
  msg(14, 'IN', 'Hi, can you send the finance paperwork for the Noah?', now - MIN);

  assert.equal(items.itemFromKey('c:13').state, 'other');
  assert.equal(items.itemFromKey('c:14').state, 'other');
  const waiting = await get('/api/items?section=dashboard&tab=waiting');
  const quiet = await get('/api/items?section=dashboard&tab=quiet');
  const keys = [...waiting.items, ...quiet.items].map((r) => r.key);
  assert.ok(!keys.includes('c:13') && !keys.includes('c:14'), 'neither is listed');
  assert.ok(keys.includes('c:11') && keys.includes('c:12'), 'the customers are');
});
